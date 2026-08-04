using System;
using System.Collections.Generic;

namespace GunsOnly.Sim.Recovery;

public readonly record struct ApproachSolverInput(
    Vec3D Position,
    double TrueAirspeedMps,
    double CurrentHeadingRad,
    Vec3D Threshold,
    double StabilisationAltitudeM,
    double StabilisationSpeedMps,
    double DragToWeight,
    double TurnRadiusM,
    double LandingHeadingRad = 0.0,
    /// Maximum glideslope used inside the groove. Radians.
    double GlideslopeRad = 0.0610865, // ~3.5°
    /// Minimum along-track handoff. A higher stabilisation shelf moves this point outward so the
    /// recovery profile and glideslope meet without a vertical step.
    double GrooveEntryTrackM = 1_200.0);

/// A point on the solved profile. DistanceToGoM is measured along the path, not straight-line.
public readonly record struct ApproachGate(
    string Id,
    string Label,
    Vec3D Position,
    double DistanceToGoM,
    double TargetAltitudeM,
    double TargetSpeedMps,
    bool DirtyConfig);

public readonly record struct ApproachSolution(
    bool Valid,
    double ExcessEnergyM,
    double TrackRequiredM,
    double TrackAvailableM,
    ApproachPathSolution Path,
    IReadOnlyList<ApproachGate> Gates,
    bool InGroove,
    double ProfileAltitudeM,
    double ProfileSpeedMps,
    double CommandedPower01);

/// Continuously answers "how do I stabilise from here". Pure and deterministic: same input, same
/// solution, every tick. Never refuses — surplus energy is spent as track distance.
public static class ApproachSolver {
    const int RecoveryGateCount = 8;
    const int GrooveGateCount = 3;
    static readonly IReadOnlyList<ApproachGate> NoGates = Array.Empty<ApproachGate>();
    const double PowerBandM = 300.0;

    public static ApproachSolution Solve(in ApproachSolverInput input) {
        if (!input.Position.IsFinite || !input.Threshold.IsFinite
            || !double.IsFinite(input.TrueAirspeedMps) || input.TrueAirspeedMps < 0.0
            || !double.IsFinite(input.CurrentHeadingRad)
            || !double.IsFinite(input.LandingHeadingRad)
            || !double.IsFinite(input.StabilisationAltitudeM)
            || !double.IsFinite(input.StabilisationSpeedMps)
            || input.StabilisationSpeedMps < 0.0)
            return new ApproachSolution(
                false, 0.0, 0.0, 0.0, default, NoGates, false, 0.0, 0.0, 0.5);

        double dx = input.Position.X - input.Threshold.X;
        double dz = input.Position.Z - input.Threshold.Z;
        double directTrackM = Math.Sqrt(dx * dx + dz * dz);
        var (grooveEntry, _) = GrooveGeometry(input);
        bool inGroove = EstablishedInGroove(input, directTrackM, grooveEntry);

        if (inGroove)
            return SolveGroove(directTrackM, input);

        Vec3D landingFwd = new(
            Math.Sin(input.LandingHeadingRad),
            0.0,
            Math.Cos(input.LandingHeadingRad));
        Vec3D stabilisationPoint =
            input.Threshold - landingFwd * grooveEntry;
        double current = ApproachEnergy.SpecificEnergyM(input.Position.Y, input.TrueAirspeedMps);
        double target = ApproachEnergy.SpecificEnergyM(
            input.StabilisationAltitudeM, input.StabilisationSpeedMps);
        double excess = Math.Max(0.0, current - target);
        double required = ApproachEnergy.TrackDistanceRequiredM(excess, input.DragToWeight);

        ApproachPathSolution path = ApproachPath.Solve(new ApproachPathInput(
            Start: input.Position,
            StartHeadingRad: input.CurrentHeadingRad,
            StabilisationPoint: stabilisationPoint,
            LandingHeadingRad: input.LandingHeadingRad,
            RequiredTrackM: required,
            TurnRadiusM: input.TurnRadiusM));
        if (path.Saturated || path.TotalTrackM + 1e-6 < required)
            return new ApproachSolution(
                false,
                excess,
                required,
                path.TotalTrackM,
                path,
                NoGates,
                false,
                input.Position.Y,
                input.TrueAirspeedMps,
                0.5);
        (double profileAltitude, double profileSpeed) =
            ProfileAtDistance(path.TotalTrackM, input);
        double power = PowerForProfile(
            input.Position.Y, input.TrueAirspeedMps, profileAltitude, profileSpeed);
        return new ApproachSolution(
            true, excess, required, path.TotalTrackM, path,
            BuildRecoveryGates(path, input), false,
            profileAltitude, profileSpeed, power);
    }

    /// Two-sided power from energy error against the next gate schedule. 0.5 is trimmed.
    public static double CommandedPower01(
        double altitudeM, double trueAirspeedMps,
        double targetAltitudeM, double targetSpeedMps,
        double dragToWeight, double distanceToGoM) {
        if (!double.IsFinite(altitudeM) || !double.IsFinite(trueAirspeedMps)
            || !double.IsFinite(targetAltitudeM) || !double.IsFinite(targetSpeedMps))
            return 0.5;
        double scheduled = ApproachEnergy.SpecificEnergyM(targetAltitudeM, targetSpeedMps)
            + Math.Max(0.0, dragToWeight) * Math.Max(0.0, distanceToGoM);
        double error = ApproachEnergy.SpecificEnergyM(altitudeM, trueAirspeedMps) - scheduled;
        return Math.Clamp(0.5 - error / (2.0 * PowerBandM), 0.0, 1.0);
    }

    static ApproachSolution SolveGroove(double distanceToThresholdM, in ApproachSolverInput input) {
        double distance = Math.Max(0.0, distanceToThresholdM);
        var (_, slope) = GrooveGeometry(input);
        // Touchdown altitude is the threshold surface; slope rises with distance remaining.
        double touchAlt = input.Threshold.Y;
        var pathPoints = new List<Vec3D> {
            new(input.Position.X, 0.0, input.Position.Z),
            new(input.Threshold.X, 0.0, input.Threshold.Z),
        };
        var path = new ApproachPathSolution(
            ApproachExtensionKind.None, 0.0, 0, distance, pathPoints);
        var gates = new List<ApproachGate>(GrooveGateCount);
        for (int i = 1; i <= GrooveGateCount; i++) {
            double fraction = (double)i / GrooveGateCount;
            double toGo = Math.Max(0.0, distance * (1.0 - fraction));
            double alt = touchAlt + toGo * slope;
            // Cap groove altitudes near the stabilisation shelf so the ladder does not jump.
            alt = Math.Min(alt, input.StabilisationAltitudeM);
            gates.Add(new ApproachGate(
                $"groove_{i}",
                i == GrooveGateCount ? "THRESHOLD" : $"GROOVE {i}",
                ApproachPath.PointAtDistanceFromStart(path, distance * fraction),
                toGo,
                alt,
                input.StabilisationSpeedMps,
                DirtyConfig: true));
        }

        double current = ApproachEnergy.SpecificEnergyM(input.Position.Y, input.TrueAirspeedMps);
        double target = ApproachEnergy.SpecificEnergyM(
            touchAlt + distance * slope, input.StabilisationSpeedMps);
        double excess = Math.Max(0.0, current - target);
        double profileAltitude = touchAlt + distance * slope;
        double power = PowerForProfile(
            input.Position.Y, input.TrueAirspeedMps,
            profileAltitude, input.StabilisationSpeedMps);
        return new ApproachSolution(
            true, excess, distance, distance,
            path, gates, true,
            profileAltitude, input.StabilisationSpeedMps, power);
    }

    /// Gates are outputs of the solution, spaced along the solved path. The last one is the
    /// stabilisation point itself, which is why it carries the stabilisation altitude and speed.
    static IReadOnlyList<ApproachGate> BuildRecoveryGates(
        in ApproachPathSolution path, in ApproachSolverInput input) {
        var gates = new List<ApproachGate>(RecoveryGateCount);
        for (int i = 1; i <= RecoveryGateCount; i++) {
            double fraction = (double)i / RecoveryGateCount;
            double along = path.TotalTrackM * fraction;
            double toGo = Math.Max(0.0, path.TotalTrackM - along);
            bool dirty = fraction >= 0.5;
            (double targetAltitude, double targetSpeed) =
                ProfileAtDistance(toGo, input);
            gates.Add(new ApproachGate(
                $"gate_{i}",
                i == RecoveryGateCount ? "STABILISE" : $"GATE {i}",
                ApproachPath.PointAtDistanceFromStart(path, along),
                toGo,
                targetAltitude,
                targetSpeed,
                dirty));
        }
        return gates;
    }

    static (double altitudeM, double speedMps) ProfileAtDistance(
        double distanceToStabiliseM, in ApproachSolverInput input) {
        double ratio = Math.Max(input.DragToWeight, 1e-3);
        double stabiliseEnergy = ApproachEnergy.SpecificEnergyM(
            input.StabilisationAltitudeM, input.StabilisationSpeedMps);
        double scheduledEnergy = stabiliseEnergy
            + ratio * Math.Max(0.0, distanceToStabiliseM);

        double preferredSpeed = Math.Max(
            input.StabilisationSpeedMps,
            input.TrueAirspeedMps);
        double speedCeilingFromEnergy = Math.Sqrt(Math.Max(
            0.0,
            2.0 * ApproachEnergy.GravityMps2
                * (scheduledEnergy - input.StabilisationAltitudeM)));
        double targetSpeed = Math.Min(preferredSpeed, speedCeilingFromEnergy);
        double targetAltitude = scheduledEnergy
            - targetSpeed * targetSpeed / (2.0 * ApproachEnergy.GravityMps2);
        return (Math.Max(input.StabilisationAltitudeM, targetAltitude), targetSpeed);
    }

    static double PowerForProfile(
        double altitudeM, double trueAirspeedMps,
        double targetAltitudeM, double targetSpeedMps) {
        double error = ApproachEnergy.SpecificEnergyM(altitudeM, trueAirspeedMps)
            - ApproachEnergy.SpecificEnergyM(targetAltitudeM, targetSpeedMps);
        return Math.Clamp(0.5 - error / (2.0 * PowerBandM), 0.0, 1.0);
    }

    static (double entryTrackM, double slope) GrooveGeometry(
        in ApproachSolverInput input) {
        double authoredSlope = Math.Max(
            1e-4,
            Math.Tan(Math.Max(1e-4, input.GlideslopeRad)));
        double height = Math.Max(
            0.0,
            input.StabilisationAltitudeM - input.Threshold.Y);
        double naturalEntry = height / authoredSlope;
        double entry = Math.Max(
            1.0,
            Math.Max(input.GrooveEntryTrackM, naturalEntry));
        // If the authored minimum is longer than the natural intercept, use the shallower slope
        // that still meets the stabilisation shelf. The handoff is continuous in either case.
        double slope = height > 0.0 ? height / entry : authoredSlope;
        return (entry, Math.Max(1e-4, slope));
    }

    static bool EstablishedInGroove(
        in ApproachSolverInput input,
        double directTrackM,
        double grooveEntryM) {
        if (directTrackM > grooveEntryM) return false;
        Vec3D forward = new(
            Math.Sin(input.LandingHeadingRad),
            0.0,
            Math.Cos(input.LandingHeadingRad));
        Vec3D right = new(forward.Z, 0.0, -forward.X);
        Vec3D relative = input.Position - input.Threshold;
        double asternM = -relative.Dot(forward);
        double crossTrackM = Math.Abs(relative.Dot(right));
        double headingError = Math.Abs(Math.IEEERemainder(
            input.CurrentHeadingRad - input.LandingHeadingRad,
            2.0 * Math.PI));
        double captureHalfWidthM = Math.Max(250.0, grooveEntryM * 0.2);
        return asternM >= 0.0
            && crossTrackM <= captureHalfWidthM
            && headingError <= Math.PI / 4.0;
    }
}
