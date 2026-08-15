using GunsOnly.Sim.Cobra.GroundWar;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Cobra;

/// <summary>
/// Pure Ember Run act transitions. Kept free of the dynamics so tests do not need to fly.
/// </summary>
public static class CobraMissionActProgress
{
    public const double DepartPadRadiusM = 700.0;
    public const double EngageBridgeRadiusM = 480.0;
    public const double RtbPadCompleteRadiusM = 70.0;
    public const double RtbPadCompleteClearanceM = 12.0;

    public static CobraMissionAct Next(
        CobraMissionAct current,
        in Vec3D positionWorldM,
        in Vec3D fobCentreWorldM,
        in Vec3D bridgeCentreWorldM,
        double victoryHoldProgress,
        HoldTheBridgeOutcome outcome,
        CobraMissionStatus status,
        double? clearanceM)
    {
        if (current == CobraMissionAct.Complete)
            return CobraMissionAct.Complete;

        if (status is CobraMissionStatus.Victory or CobraMissionStatus.Defeat
            || outcome is HoldTheBridgeOutcome.Victory or HoldTheBridgeOutcome.Defeat) {
            if (current == CobraMissionAct.Rtb
                && HorizontalDistanceM(positionWorldM, fobCentreWorldM) <= RtbPadCompleteRadiusM
                && clearanceM is <= RtbPadCompleteClearanceM) {
                return CobraMissionAct.Complete;
            }
            return CobraMissionAct.Rtb;
        }

        return current switch {
            CobraMissionAct.Depart =>
                HorizontalDistanceM(positionWorldM, fobCentreWorldM) > DepartPadRadiusM
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
        Vec3D? aircraftWorldM = null)
    {
        if (act is CobraMissionAct.Rtb or CobraMissionAct.Complete)
            return CampEmberOperations.BuildArrivalGates(aircraftWorldM);

        IReadOnlyList<CobraCanyonRoutePoint> points = route.Points;
        int bridgeIndex = FindBridgePointIndex(points);
        int routeJoinIndex = FindNearestRoutePointIndex(points, fobCentreWorldM);
        if (act == CobraMissionAct.Depart) {
            CobraCanyonRoutePoint join = points[routeJoinIndex];
            return CampEmberOperations.BuildDepartureGates(
                new Vec3D(
                    join.EastM,
                    join.PathAltitudeM + join.TargetAglM,
                    join.NorthM),
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

    /// <summary>
    /// Soft-path highlight: advance past any gate the aircraft has already flown through
    /// (inside 0.72× corridor radius), otherwise aim at the nearest still-ahead gate. Caps at
    /// the bridge so Ingress never steals the Engage set-piece cue.
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

        for (int i = Math.Clamp(first, 0, last); i <= last; i++) {
            CobraCanyonRoutePoint point = points[i];
            double passRadiusM = Math.Max(40.0, point.CorridorRadiusM * 0.72);
            double distanceM = HorizontalDistanceM(
                aircraft,
                new Vec3D(point.EastM, point.PathAltitudeM, point.NorthM));
            if (distanceM > passRadiusM)
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
