using GunsOnly.Sim.Cobra.GroundWar;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Cobra;

/// <summary>
/// Pure Ember Run act transitions. Kept free of the dynamics so tests do not need to fly.
/// </summary>
public static class CobraMissionActProgress
{
    public const double DepartPadRadiusM = 700.0;
    // Start the attack at a genuine IP rather than beneath the bridge. At the old 480 m handoff
    // the low ingress cue vanished almost on top of Iron Bell and its replacement demanded an
    // abrupt climb. This reveal gives the player time to see the fight and establish a standoff.
    public const double EngageBridgeRadiusM = 1_100.0;
    public const double RtbPadCompleteRadiusM = 70.0;
    public const double RtbPadCompleteClearanceM = 12.0;
    // Same rotor-clearance surrogate as the Camp Ember departure route, not a surveyed attack altitude.
    public const double GunPitCueClearanceM = CampEmberOperations.DepartureRouteClearanceM;

    public static CobraMissionAct Next(
        CobraMissionAct current,
        in Vec3D positionWorldM,
        in Vec3D fobCentreWorldM,
        in Vec3D bridgeCentreWorldM,
        double victoryHoldProgress,
        HoldTheBridgeOutcome outcome,
        CobraMissionStatus status,
        double? clearanceM,
        Vec3D? departureJoinWorldM = null,
        bool stableRecoveryAtFob = false)
    {
        if (current == CobraMissionAct.Complete)
            return CobraMissionAct.Complete;

        if (status is CobraMissionStatus.Victory or CobraMissionStatus.Defeat
            || outcome is HoldTheBridgeOutcome.Victory or HoldTheBridgeOutcome.Defeat) {
            if (current == CobraMissionAct.Rtb
                && HorizontalDistanceM(positionWorldM, fobCentreWorldM) <= RtbPadCompleteRadiusM
                && clearanceM is <= RtbPadCompleteClearanceM
                && stableRecoveryAtFob) {
                return CobraMissionAct.Complete;
            }
            return CobraMissionAct.Rtb;
        }

        return current switch {
            CobraMissionAct.Depart =>
                // The authored departure connector remains authoritative for normal flight,
                // but a pilot who reaches the objective by another route must not be left
                // flying departure cues behind the battle. This also keeps repositioned and
                // resumed sorties coherent without weakening the dogleg handoff.
                HorizontalDistanceM(positionWorldM, bridgeCentreWorldM) <= EngageBridgeRadiusM
                    ? CobraMissionAct.Engage
                    : (departureJoinWorldM is { } join
                    ? HorizontalDistanceM(positionWorldM, join) <= DepartureJoinRadiusM
                    : HorizontalDistanceM(positionWorldM, fobCentreWorldM) > DepartPadRadiusM)
                    ? CobraMissionAct.Ingress
                    : CobraMissionAct.Depart,
            CobraMissionAct.Ingress =>
                HorizontalDistanceM(positionWorldM, bridgeCentreWorldM) <= EngageBridgeRadiusM
                    ? CobraMissionAct.Engage
                    : CobraMissionAct.Ingress,
            CobraMissionAct.Engage =>
                victoryHoldProgress > 0.0 ? CobraMissionAct.Hold : CobraMissionAct.Engage,
            CobraMissionAct.Hold => CobraMissionAct.Hold,
            CobraMissionAct.Rtb =>
                HorizontalDistanceM(positionWorldM, fobCentreWorldM) <= RtbPadCompleteRadiusM
                && clearanceM is <= RtbPadCompleteClearanceM
                && stableRecoveryAtFob
                    ? CobraMissionAct.Complete
                    : CobraMissionAct.Rtb,
            _ => current
        };
    }

    public static IReadOnlyList<CobraPathGate> BuildPathGates(
        CobraMissionAct act,
        CobraCanyonRouteDefinition route,
        in Vec3D fobCentreWorldM,
        double fobPathAltitudeM,
        Vec3D? aircraftWorldM = null,
        ITerrainSurface? terrain = null,
        IReadOnlyList<ContestedSite>? sites = null)
    {
        if (act is CobraMissionAct.Rtb or CobraMissionAct.Complete)
            return CampEmberOperations.BuildArrivalGates(aircraftWorldM);

        // Once Iron Bell is friendly the job is the next hostile gun pit. The gorge polyline
        // stops at the bridge, so Engage/Hold used to keep that bridge gate (and the renderer
        // then hid every gate). Read owner and position only — never the control readout.
        if (act is CobraMissionAct.Engage or CobraMissionAct.Hold && sites is not null)
            return BuildNextGunPitGates(sites, aircraftWorldM, terrain);

        IReadOnlyList<CobraCanyonRoutePoint> points = route.Points;
        int bridgeIndex = FindBridgePointIndex(points);
        int routeJoinIndex = FindNearestRoutePointIndex(points, fobCentreWorldM);
        if (act == CobraMissionAct.Depart) {
            ArgumentNullException.ThrowIfNull(terrain);
            CobraCanyonRoutePoint join = points[routeJoinIndex];
            return CampEmberOperations.BuildDepartureGates(
                new Vec3D(
                    join.EastM,
                    join.PathAltitudeM + join.TargetAglM,
                    join.NorthM),
                terrain,
                aircraftWorldM);
        }
        int activeIndex = act switch {
            CobraMissionAct.Engage or CobraMissionAct.Hold => bridgeIndex,
            CobraMissionAct.Ingress =>
                ResolveSoftPathActiveIndex(points, routeJoinIndex, bridgeIndex, aircraftWorldM),
            _ => routeJoinIndex
        };

        var gates = new CobraPathGate[points.Count];
        for (int i = 0; i < points.Count; i++) {
            CobraCanyonRoutePoint point = points[i];
            gates[i] = new CobraPathGate(
                point.EastM,
                // Soft cue altitude is nap-of-earth flight level, not the carved corridor floor.
                // PathAltitudeM authors the gorge/spur datum; TargetAglM lifts the volume into air
                // the pilot flies through (owner 2026-08-10: river-floor boxes were invisible).
                point.PathAltitudeM + point.TargetAglM,
                point.NorthM,
                point.CorridorRadiusM,
                i == activeIndex);
        }
        return gates;
    }

    public const double DepartureJoinRadiusM = 120.0;

    public static Vec3D DepartureJoinWorldM(
        CobraCanyonRouteDefinition route,
        in Vec3D fobCentreWorldM)
    {
        int index = FindNearestRoutePointIndex(route.Points, fobCentreWorldM);
        CobraCanyonRoutePoint join = route.Points[index];
        return new Vec3D(join.EastM, join.PathAltitudeM + join.TargetAglM, join.NorthM);
    }

    /// <summary>
    /// Soft-path highlight: project the aircraft onto the ingress polyline and select the next
    /// gate ahead. A radius-only resolver advanced while the aircraft was inside a gate, then
    /// regressed to that same gate after it flew out the far side. Polyline progress keeps passed
    /// gates passed without adding mutable presentation state. Caps at the bridge so Ingress
    /// never steals the Engage set-piece cue.
    /// </summary>
    static int ResolveSoftPathActiveIndex(
        IReadOnlyList<CobraCanyonRoutePoint> points,
        int first,
        int bridgeIndex,
        Vec3D? aircraftWorldM)
    {
        if (points.Count == 0)
            return first;
        int last = Math.Min(bridgeIndex, points.Count - 1);
        if (aircraftWorldM is not { } aircraft)
            return first;

        int start = Math.Clamp(first, 0, last);
        if (start >= last)
            return last;

        double nearestDistanceSquaredM = double.MaxValue;
        double nearestAlongM = 0.0;
        double accumulatedM = 0.0;
        for (int i = start; i < last; i++) {
            CobraCanyonRoutePoint from = points[i];
            CobraCanyonRoutePoint to = points[i + 1];
            double eastM = to.EastM - from.EastM;
            double northM = to.NorthM - from.NorthM;
            double lengthSquaredM = eastM * eastM + northM * northM;
            double lengthM = Math.Sqrt(lengthSquaredM);
            if (lengthM <= 1e-6)
                continue;
            double fraction = Math.Clamp(
                ((aircraft.X - from.EastM) * eastM
                    + (aircraft.Z - from.NorthM) * northM) / lengthSquaredM,
                0.0,
                1.0);
            double projectedEastM = from.EastM + eastM * fraction;
            double projectedNorthM = from.NorthM + northM * fraction;
            double offsetEastM = aircraft.X - projectedEastM;
            double offsetNorthM = aircraft.Z - projectedNorthM;
            double distanceSquaredM = offsetEastM * offsetEastM + offsetNorthM * offsetNorthM;
            if (distanceSquaredM < nearestDistanceSquaredM) {
                nearestDistanceSquaredM = distanceSquaredM;
                nearestAlongM = accumulatedM + lengthM * fraction;
            }
            accumulatedM += lengthM;
        }

        accumulatedM = 0.0;
        for (int i = start + 1; i <= last; i++) {
            accumulatedM += HorizontalDistanceM(
                new Vec3D(points[i - 1].EastM, 0.0, points[i - 1].NorthM),
                new Vec3D(points[i].EastM, 0.0, points[i].NorthM));
            if (accumulatedM > nearestAlongM + 24.0)
                return i;
        }
        return last;
    }

    static int FindNearestRoutePointIndex(
        IReadOnlyList<CobraCanyonRoutePoint> points,
        in Vec3D fobCentreWorldM)
    {
        int bestIndex = 0;
        double bestDistanceM = double.MaxValue;
        for (int index = 0; index < points.Count; index++) {
            double distanceM = HorizontalDistanceM(
                new Vec3D(points[index].EastM, points[index].PathAltitudeM, points[index].NorthM),
                fobCentreWorldM);
            if (distanceM >= bestDistanceM) continue;
            bestDistanceM = distanceM;
            bestIndex = index;
        }
        return bestIndex;
    }

    const string IronBellLandmarkId = "landmark.cobra-canyon.iron-bell-bridge.v1";

    /// <summary>
    /// Short world-space chain from the aircraft to the next hostile contested site, in the
    /// authority's site order (Cau Song Ma, then Phu Rieng, then Dat Do). The last gate sits on
    /// that site so the active cue is inside its capture radius.
    /// </summary>
    static IReadOnlyList<CobraPathGate> BuildNextGunPitGates(
        IReadOnlyList<ContestedSite> sites,
        Vec3D? aircraftWorldM,
        ITerrainSurface? terrain)
    {
        ContestedSite? bridge = null;
        foreach (ContestedSite site in sites) {
            if (string.Equals(site.LandmarkId, IronBellLandmarkId, StringComparison.Ordinal))
                bridge = site;
        }
        if (bridge is null
            || bridge.Owner != GroundSiteOwner.Friendly
            || aircraftWorldM is not { } from)
            return Array.Empty<CobraPathGate>();

        ContestedSite? next = null;
        foreach (ContestedSite site in sites) {
            if (site.Owner != GroundSiteOwner.Hostile) continue;
            if (string.Equals(
                site.LandmarkId,
                "landmark.cobra-canyon.camp-ember.v1",
                StringComparison.Ordinal))
                continue;
            next = site;
            break;
        }
        if (next is null)
            return Array.Empty<CobraPathGate>();

        const int count = 4;
        var positions = new Vec3D[count];
        Vec3D target = next.PositionWorldM with { Y = next.PositionWorldM.Y + 30.0 };
        for (int i = 0; i < count; i++) {
            double t = (i + 1.0) / count;
            positions[i] = new Vec3D(
                from.X + (target.X - from.X) * t,
                from.Y + (target.Y - from.Y) * t,
                from.Z + (target.Z - from.Z) * t);
        }
        if (terrain is not null) {
            Vec3D previous = from;
            for (int i = 0; i < count; i++) {
                double floorM = SegmentClearanceFloor(terrain, previous, positions[i]);
                positions[i] = positions[i] with { Y = Math.Max(positions[i].Y, floorM) };
                if (i > 0)
                    positions[i - 1] = positions[i - 1] with {
                        Y = Math.Max(positions[i - 1].Y, floorM)
                    };
                previous = positions[i];
            }
        }
        var gates = new CobraPathGate[count];
        for (int i = 0; i < count; i++) {
            bool last = i == count - 1;
            gates[i] = new CobraPathGate(
                positions[i].X,
                positions[i].Y,
                positions[i].Z,
                last ? next.CaptureRadiusM : 80.0,
                last);
        }
        return gates;
    }

    static double SegmentClearanceFloor(ITerrainSurface terrain, in Vec3D from, in Vec3D to)
    {
        double distanceM = HorizontalDistanceM(from, to);
        int samples = Math.Max(1, (int)Math.Ceiling(distanceM / 100.0));
        double floorM = double.NegativeInfinity;
        for (int i = 0; i <= samples; i++) {
            double t = (double)i / samples;
            double eastM = from.X + (to.X - from.X) * t;
            double northM = from.Z + (to.Z - from.Z) * t;
            if (!terrain.TryHeightM(eastM, northM, out double heightM)) continue;
            floorM = Math.Max(floorM, heightM + GunPitCueClearanceM);
        }
        return floorM;
    }

    static int FindBridgePointIndex(IReadOnlyList<CobraCanyonRoutePoint> points)
    {
        for (int i = 0; i < points.Count; i++) {
            if (string.Equals(
                points[i].LandmarkId,
                "landmark.cobra-canyon.iron-bell-bridge.v1",
                StringComparison.Ordinal)) {
                return i;
            }
        }
        return Math.Min(4, points.Count - 1);
    }

    static double HorizontalDistanceM(in Vec3D a, in Vec3D b)
    {
        double de = a.X - b.X;
        double dn = a.Z - b.Z;
        return Math.Sqrt(de * de + dn * dn);
    }
}
