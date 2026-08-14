using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace GunsOnly.Sim.Recovery;

/// Published approach-guidance state for the snapshot / HUD / world path.
public readonly record struct ApproachGuidanceState(
    bool GuidanceActive,
    bool Valid,
    double ExcessEnergyM,
    double TrackRequiredM,
    double TrackAvailableM,
    ApproachExtensionKind Extension,
    bool InGroove,
    string NextLabel,
    double NextAltitudeM,
    double NextTrueAirspeedMps,
    double AltitudeErrorM,
    double TrueAirspeedErrorMps,
    double Power01,
    IReadOnlyList<WorldApproachGate> Gates) {
    public static ApproachGuidanceState Inactive { get; } = new(
        false, false, 0, 0, 0, ApproachExtensionKind.None, false,
        "", 0, 0, 0, 0, 0.5, Array.Empty<WorldApproachGate>());
}

/// A gate with world coordinates the renderer can place without inventing geometry.
public readonly record struct WorldApproachGate(
    string Id,
    string Label,
    double EastM,
    double NorthM,
    double UpM,
    double HalfM,
    double TargetAltitudeM,
    double TargetKtas,
    double DistanceToGoM,
    bool DirtyConfig,
    bool Active);

/// Intent, solve, and materialize. Pure helpers; the session owns when to call.
public static class ApproachGuidance {
    public const double DefaultStabiliseHeightAboveSurfaceM = 152.0;
    public const double DefaultGlideslopeRad = 3.5 * Math.PI / 180.0;
    public const double DefaultGrooveEntryTrackM = 1_200.0;
    /// Gate half-widths scale with distance-to-go so close gates stay flyable volumes.
    public const double GateHalfMinM = 250.0;
    public const double GateHalfMaxM = 700.0;

    public static bool IntentActive(
        bool flightActive,
        bool siteKnown,
        bool playerRtbActive,
        bool fuelRecoveryPressure,
        CarrierSortieRoutePhase carrierPhase,
        bool patternOnlyCircuitsActive,
        bool recoveryProcedureSelected) {
        if (!flightActive || !siteKnown) return false;
        if (playerRtbActive) return true;
        if (fuelRecoveryPressure) return true;
        if (carrierPhase is CarrierSortieRoutePhase.Return
            or CarrierSortieRoutePhase.Recovery
            or CarrierSortieRoutePhase.Groove)
            return true;
        if (patternOnlyCircuitsActive) return true;
        if (recoveryProcedureSelected) return true;
        return false;
    }

    public static ApproachGuidanceState Publish(
        bool guidanceActive,
        in RecoverySite site,
        in Vec3D position,
        double trueAirspeedMps,
        double currentHeadingRad,
        double stabiliseHeightAboveSurfaceM,
        double stabiliseSpeedMps,
        double dragToWeight,
        double turnRadiusM,
        double glideslopeRad = DefaultGlideslopeRad,
        double grooveEntryTrackM = DefaultGrooveEntryTrackM) {
        if (!guidanceActive || !site.Known)
            return ApproachGuidanceState.Inactive;

        double stabiliseMsl = site.StabilisationAltitudeMsl(stabiliseHeightAboveSurfaceM);
        var input = new ApproachSolverInput(
            Position: position,
            TrueAirspeedMps: trueAirspeedMps,
            CurrentHeadingRad: currentHeadingRad,
            Threshold: site.Threshold,
            StabilisationAltitudeM: stabiliseMsl,
            StabilisationSpeedMps: stabiliseSpeedMps,
            DragToWeight: dragToWeight,
            TurnRadiusM: turnRadiusM,
            LandingHeadingRad: site.LandingHeadingRad,
            GlideslopeRad: glideslopeRad,
            GrooveEntryTrackM: grooveEntryTrackM);

        ApproachSolution solution = ApproachSolver.Solve(input);
        if (!solution.Valid || solution.Gates.Count == 0)
            return new ApproachGuidanceState(
                true, false, 0, 0, 0, ApproachExtensionKind.None, false,
                "", 0, 0, 0, 0, 0.5, Array.Empty<WorldApproachGate>());

        IReadOnlyList<WorldApproachGate> worldGates = MaterializeGates(
            solution);
        WorldApproachGate next = worldGates[0];

        double nextTasMps = next.TargetKtas / AirData.MpsToKnots;
        double altError = position.Y - solution.ProfileAltitudeM;
        double tasError = trueAirspeedMps - solution.ProfileSpeedMps;

        return new ApproachGuidanceState(
            GuidanceActive: true,
            Valid: true,
            ExcessEnergyM: solution.ExcessEnergyM,
            TrackRequiredM: solution.TrackRequiredM,
            TrackAvailableM: solution.TrackAvailableM,
            Extension: solution.Path.Kind,
            InGroove: solution.InGroove,
            NextLabel: next.Label,
            NextAltitudeM: next.TargetAltitudeM,
            NextTrueAirspeedMps: nextTasMps,
            AltitudeErrorM: altError,
            TrueAirspeedErrorMps: tasError,
            Power01: solution.CommandedPower01,
            Gates: worldGates);
    }

    public static string GatesJson(in ApproachGuidanceState state) {
        var sb = new StringBuilder(256);
        sb.Append('[');
        for (int i = 0; i < state.Gates.Count; i++) {
            WorldApproachGate gate = state.Gates[i];
            if (i > 0) sb.Append(',');
            sb.Append('{')
                .Append("\"id\":\"").Append(JsonEscape(gate.Id)).Append("\",")
                .Append("\"label\":\"").Append(JsonEscape(gate.Label)).Append("\",")
                .Append("\"east_m\":").Append(F(gate.EastM)).Append(',')
                .Append("\"north_m\":").Append(F(gate.NorthM)).Append(',')
                .Append("\"up_m\":").Append(F(gate.UpM)).Append(',')
                .Append("\"half_m\":").Append(F(gate.HalfM)).Append(',')
                .Append("\"target_alt_m\":").Append(F(gate.TargetAltitudeM)).Append(',')
                .Append("\"target_ktas\":").Append(F(gate.TargetKtas, 0)).Append(',')
                .Append("\"dirty\":").Append(gate.DirtyConfig ? "true" : "false").Append(',')
                .Append("\"active\":").Append(gate.Active ? "true" : "false")
                .Append('}');
        }
        sb.Append(']');
        return sb.ToString();
    }

    public static string ExtensionToken(ApproachExtensionKind kind) => kind switch {
        ApproachExtensionKind.ExtendDownwind => "EXTEND_DOWNWIND",
        ApproachExtensionKind.Orbit360 => "ORBIT_360",
        _ => "NONE",
    };

    static IReadOnlyList<WorldApproachGate> MaterializeGates(
        in ApproachSolution solution) {
        var list = new List<WorldApproachGate>(solution.Gates.Count);
        for (int i = 0; i < solution.Gates.Count; i++) {
            ApproachGate gate = solution.Gates[i];
            double half = Math.Clamp(
                GateHalfMinM + gate.DistanceToGoM * 0.02,
                GateHalfMinM,
                GateHalfMaxM);
            list.Add(new WorldApproachGate(
                gate.Id,
                gate.Label,
                gate.Position.X,
                gate.Position.Z,
                gate.TargetAltitudeM,
                half,
                gate.TargetAltitudeM,
                gate.TargetSpeedMps * AirData.MpsToKnots,
                gate.DistanceToGoM,
                gate.DirtyConfig,
                Active: i == 0));
        }
        return list;
    }

    static string F(double value, int decimals = 1) =>
        value.ToString($"F{decimals}", CultureInfo.InvariantCulture);

    static string JsonEscape(string value) =>
        (value ?? "").Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("\"", "\\\"", StringComparison.Ordinal);
}
