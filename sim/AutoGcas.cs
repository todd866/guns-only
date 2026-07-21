using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim;

public enum AutoGcasPhase { Unavailable, Armed, Warning, FlyUp, Inhibited }

public enum AutoGcasInhibitReason {
    None,
    CapabilityUnavailable,
    Disabled,
    Configuration,
    LowAirspeed,
    TerrainData,
    InvalidState,
    PilotOverride
}

/// <summary>
/// Public-data recovery calibration. The modern profile is deliberately a transparent F-16/F-22
/// family surrogate, not a claim about classified Raptor OFP logic. Public NASA/USAF sources
/// support a last-instance terrain predictor, roughly 150 deg/s roll toward upright, an up-to-5 G
/// fly-up, and a 1.5 second time-available trigger boundary.
/// </summary>
public sealed record AutoGcasConfiguration(
    double LookaheadSeconds,
    double PredictionStepSeconds,
    double ControlResponseDelaySeconds,
    double RecoveryRollRateRadPerSecond,
    double RecoveryLoadFactorG,
    double RecoveryGOnsetRatePerSecond,
    double PullBankGateRad,
    double TriggerTimeAvailableSeconds,
    double WarningLeadSeconds,
    double TerrainBufferM,
    double MinimumRecoveryAirspeedMps,
    double ExitClearanceM,
    double ExitPredictionMarginM,
    double ExitDwellSeconds) {

    public static AutoGcasConfiguration ModernPublicDataSurrogate { get; } = new(
        LookaheadSeconds: 8.0,
        PredictionStepSeconds: 0.10,
        ControlResponseDelaySeconds: 0.20,
        RecoveryRollRateRadPerSecond: 150.0 * Math.PI / 180.0,
        RecoveryLoadFactorG: 5.0,
        RecoveryGOnsetRatePerSecond: 6.0,
        PullBankGateRad: 30.0 * Math.PI / 180.0,
        TriggerTimeAvailableSeconds: 1.5,
        WarningLeadSeconds: 3.0,
        // Public F-16 implementation: 30 ft terrain-model + 15 ft trajectory buffer.
        TerrainBufferM: 13.716,
        // Current public F-22 procedures expose a 250 KCAS configuration boundary in the pattern.
        MinimumRecoveryAirspeedMps: 250.0 / AirData.MpsToKnots,
        ExitClearanceM: 150.0,
        ExitPredictionMarginM: 75.0,
        ExitDwellSeconds: 1.0);
}

public sealed record AutoGcasCapabilityProfile(
    string Id,
    bool Available,
    AutoGcasConfiguration Configuration) {

    public static AutoGcasCapabilityProfile None { get; } = new(
        "auto-gcas.none.v1", false, AutoGcasConfiguration.ModernPublicDataSurrogate);

    public static AutoGcasCapabilityProfile ModernCrewedPublicDataSurrogate { get; } = new(
        "auto-gcas.modern-crewed.public-data-surrogate.v1", true,
        AutoGcasConfiguration.ModernPublicDataSurrogate);
}

public readonly record struct AutoGcasInput(
    AircraftState Aircraft,
    AircraftParams AircraftParameters,
    PilotCommand EffectivePilotCommand,
    ITerrainSurface? Terrain,
    double? FallbackSurfaceElevationM = null,
    bool Enabled = true,
    bool ConfigurationPermitsRecovery = true,
    bool PilotOverrideHeld = false,
    double? IndicatedAirspeedMps = null);

public readonly record struct AutoGcasPrediction(
    bool Valid,
    bool UsedFallbackTerrain,
    double CurrentClearanceM,
    double PilotMinimumClearanceM,
    double ImmediateRecoveryMinimumClearanceM,
    double PilotViolationTimeSeconds,
    double TimeAvailableToAvoidGroundImpactSeconds,
    bool PilotRecoveryCredited) {

    public static AutoGcasPrediction Invalid { get; } = new(
        false, false, double.NaN, double.NaN, double.NaN,
        double.PositiveInfinity, double.PositiveInfinity, false);
}

public readonly record struct AutoGcasState(
    AutoGcasPhase Phase,
    AutoGcasInhibitReason InhibitReason,
    string Cue,
    int ActivationCount,
    int PilotOverrideCount,
    int ReleaseCount,
    double ActiveSeconds,
    double ClearDwellSeconds,
    AutoGcasPrediction Prediction) {

    public bool Active => Phase == AutoGcasPhase.FlyUp;
    public bool Warning => Phase == AutoGcasPhase.Warning;

    public static AutoGcasState Initial(bool available) => new(
        available ? AutoGcasPhase.Armed : AutoGcasPhase.Unavailable,
        available ? AutoGcasInhibitReason.None
            : AutoGcasInhibitReason.CapabilityUnavailable,
        "", 0, 0, 0, 0.0, 0.0, AutoGcasPrediction.Invalid);
}

public readonly record struct AutoGcasStepResult(
    AutoGcasState State,
    PilotCommand? RecoveryCommand);

/// <summary>
/// Deterministic point-mass fast-time Auto-GCAS surrogate. It compares the effective pilot path
/// with the configured roll-upright/fly-up trajectory over authoritative terrain. Physiology is
/// intentionally absent: a session may let this aircraft system override physiologically released
/// controls while continuing to integrate actual recovery G through the pilot model.
/// </summary>
public static class AutoGcasController {
    readonly record struct PathPrediction(
        bool Valid,
        bool UsedFallback,
        double CurrentClearanceM,
        double MinimumClearanceM,
        double ViolationTimeSeconds);

    public static AutoGcasStepResult Step(double dtSeconds,
        in AutoGcasState previous, in AutoGcasInput input,
        AutoGcasCapabilityProfile capability) {
        if (!double.IsFinite(dtSeconds) || dtSeconds <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(dtSeconds));
        ArgumentNullException.ThrowIfNull(input.AircraftParameters);
        ArgumentNullException.ThrowIfNull(capability);

        if (!capability.Available) {
            return EndActiveForInhibit(previous, AutoGcasPhase.Unavailable,
                AutoGcasInhibitReason.CapabilityUnavailable, "",
                AutoGcasPrediction.Invalid);
        }
        AutoGcasConfiguration config = capability.Configuration;
        Validate(config);
        // The paddle is the only normal real-time way to stop an already commanded fly-up. It
        // must work even if terrain data disappears during the recovery.
        if (previous.Active && input.PilotOverrideHeld) {
            var overridden = new AutoGcasState(
                AutoGcasPhase.Inhibited, AutoGcasInhibitReason.PilotOverride,
                "GCAS PADDLE", previous.ActivationCount,
                previous.PilotOverrideCount + 1, previous.ReleaseCount + 1,
                0.0, 0.0, previous.Prediction);
            return new AutoGcasStepResult(overridden, null);
        }
        if (!input.Enabled)
            return EndActiveForInhibit(previous, AutoGcasPhase.Inhibited,
                AutoGcasInhibitReason.Disabled, "", AutoGcasPrediction.Invalid);
        if (!input.ConfigurationPermitsRecovery)
            return EndActiveForInhibit(previous, AutoGcasPhase.Inhibited,
                AutoGcasInhibitReason.Configuration, "", AutoGcasPrediction.Invalid);
        if (!ValidAircraft(input.Aircraft)
            || !ValidCommand(input.EffectivePilotCommand))
            return EndActiveForInhibit(previous, AutoGcasPhase.Inhibited,
                AutoGcasInhibitReason.InvalidState, "GCAS FAIL",
                AutoGcasPrediction.Invalid);

        // The public procedural boundary is expressed in KCAS, so the session supplies ideal
        // indicated airspeed. Standalone callers may omit it and deliberately get the historical
        // no-atmosphere fallback rather than having this predictor invent an atmosphere.
        double airspeedMps = input.IndicatedAirspeedMps
            ?? input.Aircraft.Speed;
        if (!double.IsFinite(airspeedMps) || airspeedMps < 0.0)
            return EndActiveForInhibit(previous, AutoGcasPhase.Inhibited,
                AutoGcasInhibitReason.InvalidState, "GCAS FAIL",
                AutoGcasPrediction.Invalid);
        if (airspeedMps < config.MinimumRecoveryAirspeedMps) {
            // Do not hand an imminent terrain recovery back merely because energy crossed the
            // inhibit boundary. Keep the same envelope-protected recovery demand and expose the
            // degraded energy state; AircraftSim remains the achievable-G authority.
            if (previous.Active)
                return ContinueActive(dtSeconds, previous, input, config,
                    "AUTO GCAS · AIRSPEED", previous.Prediction);
            string cue = input.Aircraft.VelocityVector().Y < -1.0 ? "AIRSPEED" : "";
            return Result(previous, AutoGcasPhase.Inhibited,
                AutoGcasInhibitReason.LowAirspeed, cue, AutoGcasPrediction.Invalid);
        }

        PathPrediction pilot = Predict(input, config,
            automatedRecoveryDelaySeconds: null);
        PathPrediction immediateRecovery = Predict(input, config,
            automatedRecoveryDelaySeconds: 0.0);
        if (!pilot.Valid || !immediateRecovery.Valid) {
            // Terrain-model loss during a commanded recovery is fail-operational. Continue the
            // bounded fly-up using the last valid prediction until the pilot paddles or a valid
            // prediction satisfies the normal clearance/dwell release gate.
            if (previous.Active)
                return ContinueActive(dtSeconds, previous, input, config,
                    "AUTO GCAS · TERRAIN", previous.Prediction);
            return Result(previous, AutoGcasPhase.Inhibited,
                AutoGcasInhibitReason.TerrainData, "GCAS TERRAIN",
                AutoGcasPrediction.Invalid);
        }

        double timeAvailable = TimeAvailable(input, config, pilot, immediateRecovery);
        bool pilotRecoveryCredited = PilotRecoveryCredited(input);
        var prediction = new AutoGcasPrediction(
            Valid: true,
            UsedFallbackTerrain: pilot.UsedFallback || immediateRecovery.UsedFallback,
            CurrentClearanceM: pilot.CurrentClearanceM,
            PilotMinimumClearanceM: pilot.MinimumClearanceM,
            ImmediateRecoveryMinimumClearanceM: immediateRecovery.MinimumClearanceM,
            PilotViolationTimeSeconds: pilot.ViolationTimeSeconds,
            TimeAvailableToAvoidGroundImpactSeconds: timeAvailable,
            PilotRecoveryCredited: pilotRecoveryCredited);

        if (!previous.Active && input.PilotOverrideHeld) {
            return Result(previous, AutoGcasPhase.Inhibited,
                AutoGcasInhibitReason.PilotOverride, "GCAS PADDLE", prediction);
        }

        if (previous.Active) {
            bool safelyClimbing = input.Aircraft.VelocityVector().Y >= 0.0
                && prediction.CurrentClearanceM >= config.ExitClearanceM
                && prediction.PilotMinimumClearanceM
                    >= config.TerrainBufferM + config.ExitPredictionMarginM;
            double clearDwell = safelyClimbing
                ? previous.ClearDwellSeconds + dtSeconds : 0.0;
            if (clearDwell >= config.ExitDwellSeconds) {
                var released = new AutoGcasState(
                    AutoGcasPhase.Armed, AutoGcasInhibitReason.None, "",
                    previous.ActivationCount, previous.PilotOverrideCount,
                    previous.ReleaseCount + 1, 0.0, 0.0, prediction);
                return new AutoGcasStepResult(released, null);
            }
            var active = new AutoGcasState(
                AutoGcasPhase.FlyUp, AutoGcasInhibitReason.None,
                "AUTO GCAS · FLYUP", previous.ActivationCount,
                previous.PilotOverrideCount, previous.ReleaseCount,
                previous.ActiveSeconds + dtSeconds, clearDwell, prediction);
            return new AutoGcasStepResult(active,
                RecoveryCommand(input, config));
        }

        bool collisionThreat = pilot.MinimumClearanceM <= config.TerrainBufferM;
        bool trigger = collisionThreat
            && timeAvailable <= config.TriggerTimeAvailableSeconds;
        if (trigger) {
            var active = new AutoGcasState(
                AutoGcasPhase.FlyUp, AutoGcasInhibitReason.None,
                "AUTO GCAS · FLYUP", previous.ActivationCount + 1,
                previous.PilotOverrideCount, previous.ReleaseCount,
                0.0, 0.0, prediction);
            return new AutoGcasStepResult(active,
                RecoveryCommand(input, config));
        }

        bool warning = collisionThreat
            && timeAvailable <= config.TriggerTimeAvailableSeconds
                + config.WarningLeadSeconds;
        return Result(previous,
            warning ? AutoGcasPhase.Warning : AutoGcasPhase.Armed,
            AutoGcasInhibitReason.None, warning ? "PULL UP" : "", prediction);
    }

    static AutoGcasStepResult Result(in AutoGcasState previous,
        AutoGcasPhase phase, AutoGcasInhibitReason reason, string cue,
        in AutoGcasPrediction prediction) => new(new AutoGcasState(
            phase, reason, cue, previous.ActivationCount,
            previous.PilotOverrideCount, previous.ReleaseCount,
            0.0, 0.0, prediction), null);

    static AutoGcasStepResult EndActiveForInhibit(in AutoGcasState previous,
        AutoGcasPhase phase, AutoGcasInhibitReason reason, string cue,
        in AutoGcasPrediction prediction) => new(new AutoGcasState(
            phase, reason, cue, previous.ActivationCount,
            previous.PilotOverrideCount,
            previous.ReleaseCount + (previous.Active ? 1 : 0),
            0.0, 0.0, prediction), null);

    static AutoGcasStepResult ContinueActive(double dtSeconds,
        in AutoGcasState previous, in AutoGcasInput input,
        AutoGcasConfiguration config, string cue,
        in AutoGcasPrediction prediction) => new(new AutoGcasState(
            AutoGcasPhase.FlyUp, AutoGcasInhibitReason.None, cue,
            previous.ActivationCount, previous.PilotOverrideCount,
            previous.ReleaseCount, previous.ActiveSeconds + dtSeconds,
            0.0, prediction), RecoveryCommand(input, config));

    static PilotCommand RecoveryCommand(in AutoGcasInput input,
        AutoGcasConfiguration config) {
        double bank = Math.IEEERemainder(input.Aircraft.Bank, 2.0 * Math.PI);
        double roll = Math.Abs(bank) <= 2.0 * Math.PI / 180.0
            ? 0.0 : -Math.Sign(bank);
        double gDemand = Math.Abs(bank) <= config.PullBankGateRad
            ? config.RecoveryLoadFactorG : 1.0;
        return new PilotCommand(
            GDemand: gDemand,
            BankTarget: 0.0,
            Throttle: input.EffectivePilotCommand.Throttle,
            Rudder: 0.0,
            CommandedPitchRad: double.NaN,
            EnvelopeOverride: false,
            RollControl: roll,
            CommandedAlphaRad: double.NaN,
            SasRollControl: 0.0,
            DirectLateralControl: true);
    }

    static double TimeAvailable(in AutoGcasInput input,
        AutoGcasConfiguration config, in PathPrediction pilot,
        in PathPrediction immediate) {
        if (pilot.MinimumClearanceM > config.TerrainBufferM)
            return double.PositiveInfinity;
        if (immediate.MinimumClearanceM <= config.TerrainBufferM) return 0.0;

        double low = 0.0;
        double high = config.LookaheadSeconds;
        PathPrediction latest = Predict(input, config, high);
        if (latest.Valid && latest.MinimumClearanceM > config.TerrainBufferM)
            return high;
        for (int iteration = 0; iteration < 8; iteration++) {
            double middle = (low + high) * 0.5;
            PathPrediction candidate = Predict(input, config, middle);
            if (!candidate.Valid) return 0.0;
            if (candidate.MinimumClearanceM > config.TerrainBufferM) low = middle;
            else high = middle;
        }
        return low;
    }

    static PathPrediction Predict(in AutoGcasInput input,
        AutoGcasConfiguration config, double? automatedRecoveryDelaySeconds) {
        Vec3D position = input.Aircraft.Position;
        Vec3D velocity = input.Aircraft.VelocityVector();
        double bank = Math.IEEERemainder(input.Aircraft.Bank, 2.0 * Math.PI);
        double recoveryG = 1.0;
        bool usedFallback = false;
        if (!TryClearance(input, position, out double currentClearance,
            out bool currentFallback))
            return new PathPrediction(false, false, double.NaN, double.NaN,
                double.PositiveInfinity);
        usedFallback |= currentFallback;
        double minimumClearance = currentClearance;
        double violationTime = currentClearance <= config.TerrainBufferM
            ? 0.0 : double.PositiveInfinity;
        int steps = Math.Max(1, (int)Math.Ceiling(
            config.LookaheadSeconds / config.PredictionStepSeconds));
        double dt = config.LookaheadSeconds / steps;

        for (int step = 1; step <= steps; step++) {
            Vec3D segmentStart = position;
            double time = (step - 1) * dt;
            bool recovery = automatedRecoveryDelaySeconds is { } delay
                && time >= delay + config.ControlResponseDelaySeconds;
            double gDemand;
            if (recovery) {
                bank = MoveAngleToward(bank, 0.0,
                    config.RecoveryRollRateRadPerSecond * dt);
                recoveryG = Math.Min(config.RecoveryLoadFactorG,
                    recoveryG + config.RecoveryGOnsetRatePerSecond * dt);
                gDemand = Math.Abs(bank) <= config.PullBankGateRad
                    ? recoveryG : 1.0;
            } else {
                double rollLimit = input.AircraftParameters.FightRollRateMaxRad > 0.0
                    ? input.AircraftParameters.FightRollRateMaxRad
                    : input.AircraftParameters.RollRateMaxRad;
                double rollRate = input.EffectivePilotCommand.DirectLateralControl
                    ? input.EffectivePilotCommand.RollControl * rollLimit
                    : Math.Clamp(Math.IEEERemainder(
                        input.EffectivePilotCommand.BankTarget - bank, 2.0 * Math.PI) / 0.4,
                        -rollLimit, rollLimit);
                bank = Math.IEEERemainder(bank + rollRate * dt, 2.0 * Math.PI);
                gDemand = input.EffectivePilotCommand.GDemand;
            }

            Vec3D vhat = velocity.Length > 1e-6
                ? velocity.Normalized() : input.Aircraft.ForwardDir();
            Vec3D worldUp = new(0.0, 1.0, 0.0);
            Vec3D upPlane = worldUp - vhat * vhat.Dot(worldUp);
            if (upPlane.Length < 1e-6) {
                Vec3D bodyUp = input.Aircraft.BodyAttitude.Rotate(worldUp);
                upPlane = bodyUp - vhat * bodyUp.Dot(vhat);
            }
            Vec3D upReference = upPlane.Length < 1e-6
                ? new Vec3D(1.0, 0.0, 0.0) : upPlane.Normalized();
            Vec3D rightReference = upReference.Cross(vhat).Normalized();
            Vec3D lift = upReference * Math.Cos(bank)
                + rightReference * Math.Sin(bank);
            double limitedG = Math.Clamp(gDemand, -1.5,
                Math.Max(1.0, input.AircraftParameters.PositiveStructuralLimitG));
            Vec3D acceleration = lift * (limitedG * FlightModel.G0)
                - worldUp * FlightModel.G0;
            velocity += acceleration * dt;
            position += velocity * dt;

            // Endpoint-only sampling aliases narrow ridges at combat speed. Sweep every predicted
            // segment at the terrain grid's resolution-aware spacing; if any interior point enters
            // the buffer, use the segment start time as a conservative violation boundary.
            if (!TryMinimumSegmentClearance(input, segmentStart, position,
                out double clearance, out bool fallback))
                return new PathPrediction(false, usedFallback, currentClearance,
                    minimumClearance, violationTime);
            usedFallback |= fallback;
            minimumClearance = Math.Min(minimumClearance, clearance);
            if (double.IsPositiveInfinity(violationTime)
                && clearance <= config.TerrainBufferM)
                violationTime = (step - 1) * dt;
        }
        return new PathPrediction(true, usedFallback, currentClearance,
            minimumClearance, violationTime);
    }

    static bool TryClearance(in AutoGcasInput input, in Vec3D position,
        out double clearanceM, out bool usedFallback) {
        if (input.Terrain is not null) {
            if (!input.Terrain.TrySample(position.X, position.Z,
                out TerrainSample sample)) {
                clearanceM = double.NaN;
                usedFallback = false;
                return false;
            }
            clearanceM = position.Y - sample.HeightM;
            usedFallback = false;
            return double.IsFinite(clearanceM);
        }
        if (input.FallbackSurfaceElevationM is { } elevation
            && double.IsFinite(elevation)) {
            clearanceM = position.Y - elevation;
            usedFallback = true;
            return double.IsFinite(clearanceM);
        }
        clearanceM = double.NaN;
        usedFallback = false;
        return false;
    }

    static bool TryMinimumSegmentClearance(in AutoGcasInput input,
        in Vec3D start, in Vec3D end,
        out double clearanceM, out bool usedFallback) {
        if (input.Terrain is not null) {
            if (!double.IsFinite(input.Terrain.HorizontalResolutionM)
                || input.Terrain.HorizontalResolutionM <= 0.0) {
                clearanceM = double.NaN;
                usedFallback = false;
                return false;
            }
            try {
                clearanceM = TerrainQueries.MinimumClearanceM(
                    input.Terrain, start, end,
                    maximumHorizontalStepM: 5.0);
            } catch (ArgumentOutOfRangeException) {
                clearanceM = double.NaN;
                usedFallback = false;
                return false;
            }
            usedFallback = false;
            return double.IsFinite(clearanceM);
        }
        if (input.FallbackSurfaceElevationM is { } elevation
            && double.IsFinite(elevation)) {
            clearanceM = Math.Min(start.Y, end.Y) - elevation;
            usedFallback = true;
            return double.IsFinite(clearanceM);
        }
        clearanceM = double.NaN;
        usedFallback = false;
        return false;
    }

    static bool PilotRecoveryCredited(in AutoGcasInput input) {
        double bank = Math.Abs(Math.IEEERemainder(
            input.Aircraft.Bank, 2.0 * Math.PI));
        double targetBank = Math.Abs(Math.IEEERemainder(
            input.EffectivePilotCommand.BankTarget, 2.0 * Math.PI));
        return input.EffectivePilotCommand.GDemand >= 3.0
            && targetBank <= bank + 2.0 * Math.PI / 180.0;
    }

    static double MoveAngleToward(double current, double target, double maximumDelta) {
        double error = Math.IEEERemainder(target - current, 2.0 * Math.PI);
        if (Math.Abs(error) <= maximumDelta) return target;
        return Math.IEEERemainder(current + Math.Sign(error) * maximumDelta,
            2.0 * Math.PI);
    }

    static bool ValidAircraft(in AircraftState state) =>
        double.IsFinite(state.Position.X) && double.IsFinite(state.Position.Y)
        && double.IsFinite(state.Position.Z) && double.IsFinite(state.Speed)
        && state.Speed >= 0.0 && double.IsFinite(state.Gamma)
        && double.IsFinite(state.Chi) && double.IsFinite(state.Bank)
        && state.BodyAttitude.IsFinite && state.BodyRates.IsFinite;

    static bool ValidCommand(in PilotCommand command) =>
        double.IsFinite(command.GDemand) && double.IsFinite(command.BankTarget)
        && double.IsFinite(command.Throttle) && double.IsFinite(command.Rudder)
        && double.IsFinite(command.RollControl)
        && double.IsFinite(command.SasRollControl);

    static void Validate(AutoGcasConfiguration config) {
        ArgumentNullException.ThrowIfNull(config);
        static void Positive(double value, string name) {
            if (!double.IsFinite(value) || value <= 0.0)
                throw new ArgumentOutOfRangeException(name);
        }
        Positive(config.LookaheadSeconds, nameof(config.LookaheadSeconds));
        Positive(config.PredictionStepSeconds, nameof(config.PredictionStepSeconds));
        Positive(config.ControlResponseDelaySeconds, nameof(config.ControlResponseDelaySeconds));
        Positive(config.RecoveryRollRateRadPerSecond,
            nameof(config.RecoveryRollRateRadPerSecond));
        Positive(config.RecoveryLoadFactorG, nameof(config.RecoveryLoadFactorG));
        Positive(config.RecoveryGOnsetRatePerSecond,
            nameof(config.RecoveryGOnsetRatePerSecond));
        Positive(config.TriggerTimeAvailableSeconds,
            nameof(config.TriggerTimeAvailableSeconds));
        Positive(config.WarningLeadSeconds, nameof(config.WarningLeadSeconds));
        Positive(config.MinimumRecoveryAirspeedMps,
            nameof(config.MinimumRecoveryAirspeedMps));
        Positive(config.ExitClearanceM, nameof(config.ExitClearanceM));
        Positive(config.ExitDwellSeconds, nameof(config.ExitDwellSeconds));
        if (!double.IsFinite(config.TerrainBufferM) || config.TerrainBufferM < 0.0
            || !double.IsFinite(config.ExitPredictionMarginM)
            || config.ExitPredictionMarginM < 0.0
            || !double.IsFinite(config.PullBankGateRad)
            || config.PullBankGateRad < 0.0)
            throw new ArgumentOutOfRangeException(nameof(config));
    }
}
