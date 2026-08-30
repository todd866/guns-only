using System;
using System.Collections.Generic;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Recovery;

/// <summary>
/// Stable left-hand fast-jet traffic pattern for the authored conventional runway. This publishes
/// guidance only: proximity advances the displayed leg, but neither gate capture nor energy state
/// can judge a landing or complete a sortie. Physical touchdown/rollout remains exclusively owned
/// by <see cref="ConventionalRunwayRecoveryModel"/>.
/// </summary>
public sealed class ConventionalRunwayPatternRecoveryDirector {
    const double FeetToM = 0.3048;
    const double FinalSlopeRad = 3.0 * Math.PI / 180.0;
    const int InitialIndex = 0;
    const int IngressGateCount = 8;
    const double IngressFirstGateM = 350.0;
    const double IngressGateSpacingM = 750.0;
    const double IngressReplanCrossTrackM = 1_500.0;
    const double IngressProjectionLookAheadM = 4_000.0;
    const double IngressProjectionBacktrackM = 250.0;
    const double IngressTerrainClearanceM = 300.0;
    const double GoAroundPastAimM = 250.0;

    int _activeIndex;
    bool _active;
    ApproachPathSolution _ingressPath;
    bool _ingressPlanned;
    double _ingressDragToWeight;
    double _ingressPreferredSpeedMps;
    double _ingressInitialEnergyM;
    double _ingressEntryEnergyM;
    double _ingressBleedTrackM;
    double _ingressProgressM;

    public bool Active => _active;
    public int ActiveIndex => _activeIndex;

    public void Reset() {
        _active = false;
        _activeIndex = InitialIndex;
        ResetIngress();
    }

    public ApproachGuidanceState Step(
        bool active,
        ConventionalRunway runway,
        in AircraftState player,
        double trueAirspeedMps,
        double approachCalibratedAirspeedMps,
        double cleanDragToWeight,
        double touchdownReferenceHeightM,
        IAtmosphereModel? atmosphere = null,
        ITerrainSurface? terrain = null) {
        ArgumentNullException.ThrowIfNull(runway);
        if (!active) {
            Reset();
            return ApproachGuidanceState.Inactive;
        }
        if (!_active) {
            _active = true;
            _activeIndex = InitialIndex;
        }

        IReadOnlyList<PatternGate> schedule = BuildSchedule(
            runway,
            approachCalibratedAirspeedMps,
            touchdownReferenceHeightM,
            atmosphere);
        _activeIndex = Math.Clamp(_activeIndex, 0, schedule.Count - 1);

        // Sequence only the current authored leg, in three dimensions and while pointed toward
        // the next one. Merely passing over a later leg at combat altitude must never skip a normal
        // pattern. This remains display sequencing only; it grants no recovery credit.
        if (_activeIndex < schedule.Count - 1
            && Captured(schedule, _activeIndex, player)) {
            _activeIndex++;
            if (_activeIndex > InitialIndex) ResetIngress();
        }

        // A missed touchdown is a go-around, not an instruction to turn back toward a chevron now
        // behind the aircraft. Once airborne beyond the aim point, route back to pattern entry.
        var runwayFrame = runway.Frame(player.Position);
        if (_activeIndex >= schedule.Count - 3
            && runwayFrame.along > runway.TouchdownAimAlongM + GoAroundPastAimM
            && runwayFrame.height > touchdownReferenceHeightM + 1.0) {
            _activeIndex = InitialIndex;
            ResetIngress();
        }

        IReadOnlyList<PatternGate> displayed;
        ApproachExtensionKind extension = ApproachExtensionKind.None;
        double trackRequiredM;
        if (_activeIndex == InitialIndex) {
            PatternGate entry = schedule[InitialIndex];
            if (!Captured(schedule, InitialIndex, player)) {
                IngressProjection projection = EnsureIngress(
                    schedule,
                    player,
                    trueAirspeedMps,
                    cleanDragToWeight);
                displayed = BuildIngressGates(
                    schedule,
                    projection,
                    terrain);
                extension = _ingressPath.Kind;
                trackRequiredM = projection.RemainingM;
            } else {
                displayed = Slice(schedule, _activeIndex);
                trackRequiredM = HorizontalDistance(player.Position, entry.Position);
            }
        } else {
            displayed = Slice(schedule, _activeIndex);
            trackRequiredM = HorizontalDistance(
                player.Position, schedule[_activeIndex].Position);
        }
        if (displayed.Count == 0)
            displayed = Slice(schedule, _activeIndex);

        PatternGate current = displayed[0];
        var gates = new List<WorldApproachGate>(displayed.Count);
        for (int i = 0; i < displayed.Count; i++) {
            PatternGate gate = displayed[i];
            gates.Add(new WorldApproachGate(
                gate.Id,
                gate.Label,
                gate.Position.X,
                gate.Position.Z,
                gate.Position.Y,
                gate.CaptureM,
                gate.Position.Y,
                gate.TargetSpeedMps * AirData.MpsToKnots,
                gate.DistanceToGoM,
                ApproachGuidance.DefaultSpeedToleranceKtas,
                gate.Leg,
                gate.Dirty,
                Active: i == 0));
        }

        double altitudeErrorM = player.Position.Y - current.Position.Y;
        double speedErrorMps = trueAirspeedMps - current.TargetSpeedMps;
        double targetKtas = current.TargetSpeedMps * AirData.MpsToKnots;
        return new ApproachGuidanceState(
            GuidanceActive: true,
            Valid: true,
            ExcessEnergyM: Math.Max(0.0, ApproachEnergy.SpecificEnergyM(
                player.Position.Y, trueAirspeedMps) - ApproachEnergy.SpecificEnergyM(
                    current.Position.Y, current.TargetSpeedMps)),
            TrackRequiredM: trackRequiredM,
            TrackAvailableM: current.DistanceToGoM,
            Extension: extension,
            InGroove: current.Leg is ApproachPatternLeg.Final
                or ApproachPatternLeg.Threshold,
            NextLabel: current.Label,
            NextAltitudeM: current.Position.Y,
            NextTrueAirspeedMps: current.TargetSpeedMps,
            AltitudeErrorM: altitudeErrorM,
            TrueAirspeedErrorMps: speedErrorMps,
            Power01: ApproachSolver.CommandedPower01(
                player.Position.Y, trueAirspeedMps,
                current.Position.Y, current.TargetSpeedMps),
            ConventionalPattern: true,
            ActivePatternLeg: current.Leg,
            TargetSpeedToleranceKtas: ApproachGuidance.DefaultSpeedToleranceKtas,
            EnergyState: ApproachGuidance.ClassifyEnergy(
                trueAirspeedMps * AirData.MpsToKnots,
                targetKtas,
                ApproachGuidance.DefaultSpeedToleranceKtas),
            Gates: gates);
    }

    /// <summary>
    /// Left-hand runway pattern expressed entirely in the runway's threshold/heading frame. The
    /// final, threshold-crossing, and touchdown-aim gates share one 3-degree line anchored at the
    /// physical aim point and wheel-reference height. They guide only; touchdown remains physical.
    /// </summary>
    public static IReadOnlyList<PatternGate> BuildSchedule(
        ConventionalRunway runway,
        double approachCalibratedAirspeedMps,
        double touchdownReferenceHeightM = 1.8,
        IAtmosphereModel? atmosphere = null) {
        ArgumentNullException.ThrowIfNull(runway);
        if (!double.IsFinite(approachCalibratedAirspeedMps)
            || approachCalibratedAirspeedMps <= 0.0)
            throw new ArgumentOutOfRangeException(
                nameof(approachCalibratedAirspeedMps));
        if (!double.IsFinite(touchdownReferenceHeightM)
            || touchdownReferenceHeightM <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(touchdownReferenceHeightM));

        Vec3D Point(double alongM, double crossM, double heightFt) =>
            runway.SurfacePoint(alongM, crossM)
                + new Vec3D(0.0, heightFt * FeetToM, 0.0);
        Vec3D Final(double alongM) {
            double trackToAimM = Math.Max(0.0, runway.TouchdownAimAlongM - alongM);
            return runway.SurfacePoint(alongM)
                + new Vec3D(
                    0.0,
                    touchdownReferenceHeightM + trackToAimM * Math.Tan(FinalSlopeRad),
                    0.0);
        }
        double entryCalibratedMps = Math.Min(
            250.0 / AirData.MpsToKnots,
            approachCalibratedAirspeedMps * 1.30);
        double downwindCalibratedMps = Math.Min(
            220.0 / AirData.MpsToKnots,
            approachCalibratedAirspeedMps * 1.15);
        double baseCalibratedMps = Math.Min(
            200.0 / AirData.MpsToKnots,
            approachCalibratedAirspeedMps * 1.08);

        PatternGate Gate(
            string id,
            string label,
            ApproachPatternLeg leg,
            in Vec3D position,
            double captureM,
            double targetCalibratedMps,
            bool dirty) => new(
                id,
                label,
                leg,
                position,
                captureM,
                AirData.TrueAirspeedForCalibratedAirspeedMps(
                    targetCalibratedMps,
                    position.Y,
                    atmosphere),
                0.0,
                dirty);

        PatternGate[] result = {
            Gate("pattern_entry", "PATTERN ENTRY · 45", ApproachPatternLeg.PatternEntry,
                Point(5_000.0, -6_000.0, 1_200.0), 800.0, entryCalibratedMps, false),
            Gate("join_downwind", "JOIN DOWNWIND", ApproachPatternLeg.Downwind,
                Point(3_000.0, -3_000.0, 1_000.0), 650.0, downwindCalibratedMps, false),
            Gate("downwind", "DOWNWIND · GEAR", ApproachPatternLeg.Downwind,
                Point(700.0, -3_000.0, 1_000.0), 550.0, downwindCalibratedMps, true),
            Gate("abeam", "ABEAM · BASE NEXT", ApproachPatternLeg.Downwind,
                Point(-500.0, -3_000.0, 900.0), 500.0, downwindCalibratedMps, true),
            Gate("base_entry", "BASE", ApproachPatternLeg.Base,
                Point(-3_500.0, -2_200.0, 700.0), 500.0, baseCalibratedMps, true),
            Gate("base_final", "BASE · TURN FINAL", ApproachPatternLeg.Base,
                Point(-4_000.0, -800.0, 650.0), 450.0, baseCalibratedMps, true),
            Gate("final", "FINAL · 3 DEG", ApproachPatternLeg.Final,
                Final(-3_000.0), 400.0, approachCalibratedAirspeedMps, true),
            Gate("threshold", "THRESHOLD", ApproachPatternLeg.Threshold,
                Final(0.0), 300.0, approachCalibratedAirspeedMps, true),
            Gate("touchdown_aim", "TOUCHDOWN", ApproachPatternLeg.Threshold,
                Final(runway.TouchdownAimAlongM), 220.0,
                approachCalibratedAirspeedMps, true),
        };
        double remainingM = 0.0;
        result[^1] = result[^1] with { DistanceToGoM = 0.0 };
        for (int i = result.Length - 2; i >= 0; i--) {
            remainingM += HorizontalDistance(result[i].Position, result[i + 1].Position);
            result[i] = result[i] with { DistanceToGoM = remainingM };
        }
        return result;
    }

    IngressProjection EnsureIngress(
        IReadOnlyList<PatternGate> schedule,
        in AircraftState player,
        double trueAirspeedMps,
        double cleanDragToWeight) {
        PatternGate entry = schedule[0];
        IngressProjection projection = ProjectOntoIngress(player.Position);
        if (!_ingressPlanned
            || projection.CrossTrackM > IngressReplanCrossTrackM) {
            PatternGate join = schedule[1];
            double entryHeadingRad = Math.Atan2(
                join.Position.X - entry.Position.X,
                join.Position.Z - entry.Position.Z);
            double entryEnergyM = ApproachEnergy.SpecificEnergyM(
                entry.Position.Y, entry.TargetSpeedMps);
            double excessEnergyM = Math.Max(0.0,
                ApproachEnergy.SpecificEnergyM(player.Position.Y, trueAirspeedMps)
                    - entryEnergyM);
            _ingressDragToWeight = Math.Clamp(cleanDragToWeight, 0.02, 0.20);
            _ingressPreferredSpeedMps = Math.Max(
                entry.TargetSpeedMps, trueAirspeedMps);
            _ingressInitialEnergyM = ApproachEnergy.SpecificEnergyM(
                player.Position.Y, trueAirspeedMps);
            _ingressEntryEnergyM = entryEnergyM;
            double requiredTrackM = ApproachEnergy.TrackDistanceRequiredM(
                excessEnergyM, _ingressDragToWeight);
            _ingressBleedTrackM = requiredTrackM;
            // Chi is the aircraft's authoritative ground-track heading. Size the first turn from
            // live speed rather than a 250-knot cap; a post-fight jet must not be shown a corner
            // it cannot physically make yet.
            double turnSpeedMps = Math.Max(
                entry.TargetSpeedMps,
                Math.Max(trueAirspeedMps, player.Speed));
            double turnRadiusM = Math.Max(
                800.0,
                turnSpeedMps * turnSpeedMps / (FlightModel.G0 * 0.577));
            _ingressProgressM = 0.0;
            _ingressPath = ApproachPath.Solve(new ApproachPathInput(
                player.Position,
                player.Chi,
                entry.Position,
                entryHeadingRad,
                requiredTrackM,
                turnRadiusM));
            _ingressPlanned = true;
            projection = ProjectOntoIngress(player.Position);
        }
        return projection;
    }

    IReadOnlyList<PatternGate> BuildIngressGates(
        IReadOnlyList<PatternGate> schedule,
        in IngressProjection projection,
        ITerrainSurface? terrain) {
        PatternGate entry = schedule[0];
        if (!_ingressPlanned || _ingressPath.Points is null
            || _ingressPath.Points.Count == 0)
            return Array.Empty<PatternGate>();

        double patternDistanceM = entry.DistanceToGoM;
        var gates = new List<PatternGate>(IngressGateCount);
        double previousAlongM = projection.AlongM;
        for (int i = 0; i < IngressGateCount; i++) {
            double alongM = Math.Min(
                _ingressPath.TotalTrackM,
                projection.AlongM + IngressFirstGateM + i * IngressGateSpacingM);
            if (gates.Count > 0
                && alongM <= projection.AlongM + IngressFirstGateM
                    + (i - 1) * IngressGateSpacingM + 1.0)
                break;
            double remainingM = Math.Max(0.0, _ingressPath.TotalTrackM - alongM);
            Vec3D horizontal = ApproachPath.PointAtDistanceFromStart(_ingressPath, alongM);
            (double targetAltitudeM, double targetSpeedMps, double scheduledEnergyM) =
                IngressProfile(
                remainingM, entry);
            Vec3D target = new(horizontal.X, targetAltitudeM, horizontal.Z);
            if (remainingM > 1.0) {
                double clearanceFloorM = TerrainClearanceFloor(
                    previousAlongM, alongM, terrain);
                if (clearanceFloorM > target.Y) {
                    target = new Vec3D(target.X, clearanceFloorM, target.Z);
                    // Spend speed, not invented energy, when terrain lifts the route. An extreme
                    // ridge can consume the whole scheduled kinetic budget; that correctly turns
                    // the chevrons red/yellow and calls for a powered climb rather than hiding it.
                    targetSpeedMps = Math.Sqrt(Math.Max(
                        0.0,
                        2.0 * ApproachEnergy.GravityMps2
                            * (scheduledEnergyM - target.Y)));
                }
            } else {
                // The frozen route must terminate on the actual entry gate so following the last
                // chevron can capture the authored pattern rather than a terrain-raised proxy.
                target = entry.Position;
                targetSpeedMps = entry.TargetSpeedMps;
            }
            gates.Add(new PatternGate(
                $"pattern_ingress_{i + 1}",
                "PATTERN ENTRY",
                ApproachPatternLeg.PatternEntry,
                target,
                350.0,
                targetSpeedMps,
                remainingM + patternDistanceM,
                Dirty: false));
            previousAlongM = alongM;
            if (remainingM <= 1.0) break;
        }
        return gates;
    }

    (double altitudeM, double speedMps, double energyM) IngressProfile(
        double distanceToEntryM,
        in PatternGate entry) {
        double remainingM = Math.Max(0.0, distanceToEntryM);
        double scheduledEnergyM;
        double targetSpeedMps;
        if (_ingressInitialEnergyM >= _ingressEntryEnergyM) {
            // A direct geometric route can be much longer than the track actually needed to lose
            // the fight's excess energy. Hold the initial state through that spare distance, then
            // blend speed and altitude together over the physically-derived bleed segment.
            if (remainingM >= _ingressBleedTrackM || _ingressBleedTrackM <= 1e-6) {
                scheduledEnergyM = _ingressInitialEnergyM;
                targetSpeedMps = _ingressPreferredSpeedMps;
            } else {
                double remainingFraction = Math.Clamp(
                    remainingM / _ingressBleedTrackM, 0.0, 1.0);
                scheduledEnergyM = _ingressEntryEnergyM
                    + _ingressDragToWeight * remainingM;
                targetSpeedMps = entry.TargetSpeedMps
                    + (_ingressPreferredSpeedMps - entry.TargetSpeedMps)
                        * remainingFraction;
            }
        } else {
            // Below entry energy, ask for a gradual powered climb instead of creating the missing
            // energy at the first chevron.
            double totalM = Math.Max(_ingressPath.TotalTrackM, 1.0);
            double progress = Math.Clamp(1.0 - remainingM / totalM, 0.0, 1.0);
            scheduledEnergyM = _ingressInitialEnergyM
                + (_ingressEntryEnergyM - _ingressInitialEnergyM) * progress;
            targetSpeedMps = _ingressPreferredSpeedMps
                + (entry.TargetSpeedMps - _ingressPreferredSpeedMps) * progress;
        }
        double speedCeilingMps = Math.Sqrt(Math.Max(
            0.0,
            2.0 * ApproachEnergy.GravityMps2
                * (scheduledEnergyM - entry.Position.Y)));
        targetSpeedMps = Math.Min(targetSpeedMps, speedCeilingMps);
        double targetAltitudeM = scheduledEnergyM
            - targetSpeedMps * targetSpeedMps
                / (2.0 * ApproachEnergy.GravityMps2);
        return (Math.Max(entry.Position.Y, targetAltitudeM), targetSpeedMps,
            scheduledEnergyM);
    }

    IngressProjection ProjectOntoIngress(in Vec3D point) {
        if (!_ingressPlanned || _ingressPath.Points is null
            || _ingressPath.Points.Count < 2)
            return new IngressProjection(0.0, double.PositiveInfinity, double.PositiveInfinity);
        double bestDistanceM = double.PositiveInfinity;
        double bestAlongM = 0.0;
        double accumulatedM = 0.0;
        double windowStartM = Math.Max(
            0.0, _ingressProgressM - IngressProjectionBacktrackM);
        double windowEndM = Math.Min(
            _ingressPath.TotalTrackM,
            _ingressProgressM + IngressProjectionLookAheadM);
        for (int i = 1; i < _ingressPath.Points.Count; i++) {
            Vec3D from = _ingressPath.Points[i - 1];
            Vec3D to = _ingressPath.Points[i];
            double dx = to.X - from.X;
            double dz = to.Z - from.Z;
            double lengthM = Math.Sqrt(dx * dx + dz * dz);
            if (lengthM <= 1e-9) continue;
            double segmentStartM = accumulatedM;
            double segmentEndM = accumulatedM + lengthM;
            accumulatedM = segmentEndM;
            if (segmentEndM < windowStartM || segmentStartM > windowEndM)
                continue;
            double minimumT = Math.Clamp(
                (windowStartM - segmentStartM) / lengthM, 0.0, 1.0);
            double maximumT = Math.Clamp(
                (windowEndM - segmentStartM) / lengthM, 0.0, 1.0);
            double t = Math.Clamp(
                ((point.X - from.X) * dx + (point.Z - from.Z) * dz)
                    / (lengthM * lengthM),
                minimumT,
                maximumT);
            double nearestX = from.X + dx * t;
            double nearestZ = from.Z + dz * t;
            double distanceM = Math.Sqrt(
                (point.X - nearestX) * (point.X - nearestX)
                    + (point.Z - nearestZ) * (point.Z - nearestZ));
            if (distanceM < bestDistanceM) {
                bestDistanceM = distanceM;
                bestAlongM = segmentStartM + lengthM * t;
            }
        }
        if (double.IsFinite(bestDistanceM))
            _ingressProgressM = Math.Max(_ingressProgressM, bestAlongM);
        return new IngressProjection(
            _ingressProgressM,
            bestDistanceM,
            Math.Max(0.0, _ingressPath.TotalTrackM - _ingressProgressM));
    }

    static bool Captured(
        IReadOnlyList<PatternGate> schedule,
        int index,
        in AircraftState player) {
        PatternGate gate = schedule[index];
        if (HorizontalDistance(player.Position, gate.Position) > gate.CaptureM)
            return false;
        double verticalToleranceM = Math.Max(75.0, gate.CaptureM * 0.35);
        if (Math.Abs(player.Position.Y - gate.Position.Y) > verticalToleranceM)
            return false;
        if (index >= schedule.Count - 1) return true;
        PatternGate next = schedule[index + 1];
        double requiredHeadingRad = Math.Atan2(
            next.Position.X - gate.Position.X,
            next.Position.Z - gate.Position.Z);
        double headingErrorRad = Math.Abs(Math.IEEERemainder(
            player.Chi - requiredHeadingRad,
            2.0 * Math.PI));
        return headingErrorRad <= 75.0 * Math.PI / 180.0;
    }

    double TerrainClearanceFloor(
        double fromAlongM,
        double toAlongM,
        ITerrainSurface? terrain) {
        if (terrain is null) return double.NegativeInfinity;
        double distanceM = Math.Max(0.0, toAlongM - fromAlongM);
        int samples = Math.Max(1, (int)Math.Ceiling(distanceM / 125.0));
        double floorM = double.NegativeInfinity;
        for (int i = 0; i <= samples; i++) {
            double t = (double)i / samples;
            Vec3D point = ApproachPath.PointAtDistanceFromStart(
                _ingressPath,
                fromAlongM + distanceM * t);
            if (terrain.TryHeightM(point.X, point.Z, out double heightM))
                floorM = Math.Max(
                    floorM,
                    heightM + IngressTerrainClearanceM);
        }
        return floorM;
    }

    static IReadOnlyList<PatternGate> Slice(
        IReadOnlyList<PatternGate> schedule,
        int start) {
        var result = new List<PatternGate>(schedule.Count - start);
        for (int i = start; i < schedule.Count; i++) result.Add(schedule[i]);
        return result;
    }

    void ResetIngress() {
        _ingressPath = default;
        _ingressPlanned = false;
        _ingressDragToWeight = 0.0;
        _ingressPreferredSpeedMps = 0.0;
        _ingressInitialEnergyM = 0.0;
        _ingressEntryEnergyM = 0.0;
        _ingressBleedTrackM = 0.0;
        _ingressProgressM = 0.0;
    }

    static double HorizontalDistance(in Vec3D a, in Vec3D b) {
        double east = a.X - b.X;
        double north = a.Z - b.Z;
        return Math.Sqrt(east * east + north * north);
    }

    public readonly record struct PatternGate(
        string Id,
        string Label,
        ApproachPatternLeg Leg,
        Vec3D Position,
        double CaptureM,
        double TargetSpeedMps,
        double DistanceToGoM,
        bool Dirty);

    readonly record struct IngressProjection(
        double AlongM,
        double CrossTrackM,
        double RemainingM);
}
