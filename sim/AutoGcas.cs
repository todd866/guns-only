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
    double TriggerTimeAvailableSeconds,
    double WarningLeadSeconds,
    double TerrainBufferM,
    double MinimumRecoveryAirspeedMps,
    double ExitClearanceM,
    double ExitPredictionMarginM,
    double ExitDwellSeconds,
    double AttentivePilotTriggerFactor = 0.45) {

    public static AutoGcasConfiguration ModernPublicDataSurrogate { get; } = new(
        LookaheadSeconds: 8.0,
        PredictionStepSeconds: 0.10,
        ControlResponseDelaySeconds: 0.20,
        RecoveryRollRateRadPerSecond: 150.0 * Math.PI / 180.0,
        RecoveryLoadFactorG: 5.0,
        RecoveryGOnsetRatePerSecond: 6.0,
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
    double? IndicatedAirspeedMps = null,
    bool PilotActivelyFlying = false);

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

    readonly record struct EscapeFrame(
        Vec3D EscapeNormal,
        Vec3D LiftNormal,
        double RollErrorRad);

    readonly record struct RecoveryResponse(
        double MaximumRollRateRadPerSecond,
        double RollTimeConstantSeconds,
        double MaximumLoadFactorG,
        double GOnsetRatePerSecond);

    readonly record struct RecoveryGuidance(
        double RollControl,
        double LoadFactorDemandG);

    const double RecoveryRollCaptureSeconds = 0.35;
    const double RecoveryRollDeadbandRad = 2.0 * Math.PI / 180.0;
    const double RecoveryRollRateDampingGain = 0.72;
    const double RecoveryRollRateDeadbandRadPerSecond = 1.0 * Math.PI / 180.0;
    const double ResponseAuthorityMargin = 0.82;
    const double RecoveryCompletionHorizonSeconds = 20.0;

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
        // Auto-GCAS is a lost-consciousness / lost-SA backstop, not a low-flying governor. While
        // the pilot is demonstrably flying the aircraft — conscious with control authority and
        // actively commanding through the HUMAN input path — the commitment point defers toward
        // the true last instant so deliberate low-level flight is never interrupted. The full
        // conservative boundary returns the moment the pilot goes passive (G-LOC releases the
        // controls, a fixated hands-off padlock turn), which is exactly the case the system
        // exists to save. Only the caller-supplied flag defers: the credited-recovery estimate is
        // computed from the EFFECTIVE command, which aircraft-owned assists contribute to, so
        // using it here would let autonomous gunnery G masquerade as pilot attention. The warning
        // boundary scales too — deliberately: a Warning resets the padlock roll assist, so early
        // warning chatter during intentional low flight is real control interference, not merely
        // noise.
        double boundaryFactor = input.PilotActivelyFlying
            ? config.AttentivePilotTriggerFactor : 1.0;
        bool trigger = collisionThreat
            && timeAvailable <= config.TriggerTimeAvailableSeconds * boundaryFactor;
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
            && timeAvailable <= (config.TriggerTimeAvailableSeconds
                + config.WarningLeadSeconds) * boundaryFactor;
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
        Vec3D velocity = input.Aircraft.VelocityVector();
        Vec3D lift = ActualLiftNormal(input.Aircraft, velocity);
        EscapeFrame frame = BuildEscapeFrame(input, input.Aircraft.Position,
            velocity, lift);
        RecoveryResponse response = ResponseFor(input, config);
        RecoveryGuidance guidance = GuidanceFor(frame,
            input.Aircraft.BodyRates.P, response, config);
        return new PilotCommand(
            // The recovery is one continuous aircraft-owned command. The airframe remains the
            // authority on achieved G; an escape-aligned steep pull must not collapse merely
            // because a horizon-bank scalar is singular. A truly inverted lift plane unloads.
            GDemand: guidance.LoadFactorDemandG,
            BankTarget: 0.0,
            Throttle: input.EffectivePilotCommand.Throttle,
            Rudder: 0.0,
            CommandedPitchRad: double.NaN,
            EnvelopeOverride: false,
            // Auto-GCAS is aircraft-owned augmentation, not pilot aileron. Publishing it through
            // the explicit SAS channel keeps telemetry honest while the physical derivative law
            // still sums both channels at the actuator stop.
            RollControl: 0.0,
            CommandedAlphaRad: double.NaN,
            SasRollControl: guidance.RollControl,
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
        Vec3D liftNormal = ActualLiftNormal(input.Aircraft, velocity);
        double rollRate = input.Aircraft.BodyRates.P;
        // Do not give a bunt/negative-G entry a free instantaneous return to +1 G at takeover.
        // The same bounded onset model must unwind the effective pilot load first.
        double recoveryG = Math.Clamp(Math.Min(1.0,
            input.EffectivePilotCommand.GDemand), -1.5, 1.0);
        RecoveryResponse response = ResponseFor(input, config);
        bool usedFallback = false;
        if (!TryClearance(input, position, out double currentClearance,
            out bool currentFallback))
            return new PathPrediction(false, false, double.NaN, double.NaN,
                double.PositiveInfinity);
        usedFallback |= currentFallback;
        double minimumClearance = currentClearance;
        double violationTime = currentClearance <= config.TerrainBufferM
            ? 0.0 : double.PositiveInfinity;
        // A finite positive clearance at the ordinary threat-lookahead boundary is not a save if
        // the aircraft is still descending. Near vertical, a 5 G fly-up can take materially longer
        // than eight seconds to reach the trajectory minimum. Recovery paths therefore run until
        // climb is actually established (or this bounded completion horizon expires). A descending
        // threat path uses the same horizon so the system can intervene before an eight-second
        // detector would make a ten-to-twelve-second vertical recovery physically impossible.
        bool descendingThreat = velocity.Y < -1.0;
        double threatEvaluationSeconds = descendingThreat
            ? Math.Max(config.LookaheadSeconds,
                RecoveryCompletionHorizonSeconds)
            : config.LookaheadSeconds;
        double predictionSeconds = automatedRecoveryDelaySeconds is { } recoveryDelay
            ? recoveryDelay + RecoveryCompletionHorizonSeconds
            : threatEvaluationSeconds;
        int steps = Math.Max(1, (int)Math.Ceiling(
            predictionSeconds / config.PredictionStepSeconds));
        double dt = predictionSeconds / steps;
        bool recoveryClimbEstablished = false;
        double recoveryClearanceGainSeconds = 0.0;
        double pointClearance = currentClearance;

        for (int step = 1; step <= steps; step++) {
            Vec3D segmentStart = position;
            double time = (step - 1) * dt;
            bool recovery = automatedRecoveryDelaySeconds is { } delay
                && time >= delay + config.ControlResponseDelaySeconds;
            Vec3D vhat = velocity.Length > 1e-6
                ? velocity.Normalized() : input.Aircraft.ForwardDir();
            liftNormal = TransportNormal(liftNormal, vhat,
                ActualLiftNormal(input.Aircraft, velocity));
            EscapeFrame frame = BuildEscapeFrame(input, position, velocity,
                liftNormal);
            double gDemand;
            double rollControl;
            if (recovery) {
                RecoveryGuidance guidance = GuidanceFor(frame,
                    rollRate, response, config);
                rollControl = guidance.RollControl;
                double achievableDemand = Math.Min(
                    guidance.LoadFactorDemandG, response.MaximumLoadFactorG);
                recoveryG = MoveToward(recoveryG, achievableDemand,
                    response.GOnsetRatePerSecond * dt);
                gDemand = recoveryG;
            } else {
                if (input.EffectivePilotCommand.DirectLateralControl) {
                    // Predict the same clamped actuator demand FlightModel flies: pilot aileron
                    // PLUS the explicit SAS roll channel. The padlock roll assist deliberately
                    // commands its entire roll through SasRollControl, so reading only
                    // RollControl made the predictor assume wings-steady while the real aircraft
                    // rolled and redirected its lift vector during a low-altitude padlocked turn.
                    rollControl = Math.Clamp(
                        Math.Clamp(input.EffectivePilotCommand.RollControl, -1.0, 1.0)
                        + Math.Clamp(
                            input.EffectivePilotCommand.SasRollControl, -1.0, 1.0),
                        -1.0, 1.0);
                } else {
                    double bankError = Math.IEEERemainder(
                        input.EffectivePilotCommand.BankTarget - frame.RollErrorRad,
                        2.0 * Math.PI);
                    rollControl = Math.Clamp(bankError
                        / (RecoveryRollCaptureSeconds
                            * response.MaximumRollRateRadPerSecond), -1.0, 1.0);
                }
                gDemand = Math.Min(input.EffectivePilotCommand.GDemand,
                    response.MaximumLoadFactorG);
            }

            double targetRollRate = rollControl
                * response.MaximumRollRateRadPerSecond;
            double responseFraction = 1.0 - Math.Exp(
                -dt / response.RollTimeConstantSeconds);
            double nextRollRate = rollRate
                + (targetRollRate - rollRate) * responseFraction;
            double rollDelta = 0.5 * (rollRate + nextRollRate) * dt;
            liftNormal = RotateNormal(liftNormal, vhat, rollDelta);
            rollRate = nextRollRate;

            Vec3D worldUp = new(0.0, 1.0, 0.0);
            double limitedG = Math.Clamp(gDemand, -1.5,
                response.MaximumLoadFactorG);
            Vec3D acceleration = liftNormal * (limitedG * FlightModel.G0)
                - worldUp * FlightModel.G0;
            Vec3D nextVelocity = velocity + acceleration * dt;
            // Trapezoidal translation avoids the optimistic height gain of the previous
            // semi-implicit Euler step during the first, most terrain-critical part of fly-up.
            position += (velocity + nextVelocity) * (0.5 * dt);
            velocity = nextVelocity;

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

            if (!TryClearance(input, position, out double nextPointClearance,
                out bool pointFallback))
                return new PathPrediction(false, usedFallback, currentClearance,
                    minimumClearance, violationTime);
            usedFallback |= pointFallback;
            if (recovery && nextPointClearance > pointClearance + 1e-5)
                recoveryClearanceGainSeconds += dt;
            else recoveryClearanceGainSeconds = 0.0;
            pointClearance = nextPointClearance;

            // A half-second of increasing terrain clearance establishes that the predicted
            // trajectory has passed its real minimum. World vertical speed alone is insufficient
            // over rising ground.
            if (recoveryClearanceGainSeconds >= 0.5
                && time + dt >= threatEvaluationSeconds) {
                recoveryClimbEstablished = true;
                break;
            }
        }
        if (automatedRecoveryDelaySeconds.HasValue
            && !recoveryClimbEstablished) {
            // Never convert a descending endpoint into a promised save. Keeping the path valid but
            // unsafe lets the last-instance logic trigger at the first defensible opportunity.
            minimumClearance = Math.Min(minimumClearance, config.TerrainBufferM);
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
        Vec3D velocity = input.Aircraft.VelocityVector();
        EscapeFrame frame = BuildEscapeFrame(input, input.Aircraft.Position,
            velocity, ActualLiftNormal(input.Aircraft, velocity));
        double bank = Math.Abs(frame.RollErrorRad);
        double targetBank = Math.Abs(Math.IEEERemainder(
            input.EffectivePilotCommand.BankTarget, 2.0 * Math.PI));
        return input.EffectivePilotCommand.GDemand >= 3.0
            && targetBank <= bank + 2.0 * Math.PI / 180.0;
    }

    static RecoveryGuidance GuidanceFor(in EscapeFrame frame, double rollRateRadPerSecond,
        in RecoveryResponse response, AutoGcasConfiguration config) {
        double maximumRollRate = response.MaximumRollRateRadPerSecond;
        double desiredRollRate = Math.Abs(frame.RollErrorRad) <= RecoveryRollDeadbandRad
            ? 0.0
            : Math.Clamp(-frame.RollErrorRad / RecoveryRollCaptureSeconds,
                -maximumRollRate, maximumRollRate);
        double rateError = desiredRollRate - rollRateRadPerSecond;
        double rollControl = desiredRollRate / maximumRollRate
            + RecoveryRollRateDampingGain * rateError / maximumRollRate;
        if (Math.Abs(frame.RollErrorRad) <= RecoveryRollDeadbandRad
            && Math.Abs(rollRateRadPerSecond) <= RecoveryRollRateDeadbandRadPerSecond)
            rollControl = 0.0;
        else rollControl = Math.Clamp(rollControl, -1.0, 1.0);
        // Positive normal load is useful throughout the steep/vertical fly-up whenever the
        // physical lift plane has any component away from terrain. That removes the old arbitrary
        // 30-degree bank gate and its loss of G at steep flight-path angles. If the aircraft is
        // genuinely inverted relative to the local escape plane, however, positive G points into
        // terrain: unload while rolling, then command the full fly-up as soon as lift is useful.
        double loadDemand = frame.LiftNormal.Dot(frame.EscapeNormal) >= 0.0
            ? config.RecoveryLoadFactorG : 0.0;
        return new RecoveryGuidance(rollControl, loadDemand);
    }

    static RecoveryResponse ResponseFor(in AutoGcasInput input,
        AutoGcasConfiguration config) {
        AircraftParams aircraft = input.AircraftParameters;
        double airspeed = Math.Max(input.IndicatedAirspeedMps
            ?? input.Aircraft.Speed, 1.0);
        double span = aircraft.WingSpanM > 0.0
            ? aircraft.WingSpanM
            : Math.Sqrt(4.5 * aircraft.WingAreaM2);

        // The attached-flow derivative law used by AircraftSim has the steady solution below.
        // A public-data margin keeps the fast-time predictor on the slow/weak side of that same
        // physical response instead of assuming the old unconditional 150 deg/s roll.
        double derivativeRollRate = 2.0 * airspeed
            * Math.Abs(aircraft.ClDeltaA) * aircraft.MaxAileronDeflectionRad
            / Math.Max(Math.Abs(aircraft.ClP) * span, 1e-6);
        double configuredRollRate = Math.Min(config.RecoveryRollRateRadPerSecond,
            aircraft.FightRollRateMaxRad > 0.0
                ? aircraft.FightRollRateMaxRad : aircraft.RollRateMaxRad);
        double maximumRollRate = Math.Max(5.0 * Math.PI / 180.0,
            Math.Min(configuredRollRate,
                derivativeRollRate * ResponseAuthorityMargin));

        double dynamicPressure = AirData.EquivalentDynamicPressurePa(airspeed);
        double rollDamping = dynamicPressure * aircraft.WingAreaM2 * span * span
            * Math.Abs(aircraft.ClP) / (2.0 * airspeed);
        double rollTimeConstant = Math.Clamp(
            aircraft.IxxKgM2 / Math.Max(rollDamping, 1.0)
                / ResponseAuthorityMargin, 0.18, 0.85);
        double aerodynamicLoad = dynamicPressure * aircraft.WingAreaM2
            * Math.Max(aircraft.CLMax, 0.0)
            / Math.Max(input.Aircraft.Mass * FlightModel.G0, 1.0);
        double maximumLoad = Math.Clamp(
            aerodynamicLoad * ResponseAuthorityMargin, 1.0,
            Math.Min(config.RecoveryLoadFactorG,
                Math.Max(1.0, aircraft.PositiveStructuralLimitG)));
        return new RecoveryResponse(maximumRollRate, rollTimeConstant,
            maximumLoad,
            config.RecoveryGOnsetRatePerSecond * ResponseAuthorityMargin);
    }

    static EscapeFrame BuildEscapeFrame(in AutoGcasInput input,
        in Vec3D position, in Vec3D velocity, in Vec3D liftHint) {
        Vec3D forward = velocity.Length > 1e-6
            ? velocity.Normalized() : input.Aircraft.ForwardDir();
        Vec3D lift = TransportNormal(liftHint, forward,
            ActualLiftNormal(input.Aircraft, velocity));
        Vec3D terrainUp = TerrainUp(input, position);
        Vec3D escapePlane = terrainUp - forward * terrainUp.Dot(forward);
        // Exactly normal-to-terrain flight has no unique roll-upright direction. Preserve the
        // current physical manoeuvre plane, which is continuous through a vertical dive and lets
        // the commanded positive-G pull begin without an arbitrary 90-degree roll.
        Vec3D escape = escapePlane.Length < 1e-6
            ? lift : escapePlane.Normalized();
        Vec3D escapeRight = escape.Cross(forward);
        if (escapeRight.Length < 1e-6)
            escapeRight = OrthogonalNormal(forward);
        else escapeRight = escapeRight.Normalized();
        double rollError = Math.Atan2(lift.Dot(escapeRight), lift.Dot(escape));
        // atan2(+-0, -1) is platform-sign sensitive at exactly inverted. Either shortest path is
        // valid, but choosing one deterministically prevents the controller from returning zero.
        if (Math.Abs(rollError) < 1e-12 && lift.Dot(escape) < 0.0)
            rollError = Math.PI;
        return new EscapeFrame(escape, lift, rollError);
    }

    static Vec3D ActualLiftNormal(in AircraftState aircraft, in Vec3D velocity) {
        Vec3D forward = velocity.Length > 1e-6
            ? velocity.Normalized() : aircraft.ForwardDir();
        Vec3D bodyUp = aircraft.BodyAttitude.Rotate(new Vec3D(0.0, 1.0, 0.0));
        Vec3D liftPlane = bodyUp - forward * bodyUp.Dot(forward);
        if (liftPlane.Length >= 1e-6) return liftPlane.Normalized();
        Vec3D bodyRight = aircraft.BodyAttitude.Rotate(new Vec3D(1.0, 0.0, 0.0));
        Vec3D rightPlane = bodyRight - forward * bodyRight.Dot(forward);
        return rightPlane.Length >= 1e-6
            ? rightPlane.Normalized() : OrthogonalNormal(forward);
    }

    static Vec3D TerrainUp(in AutoGcasInput input, in Vec3D position) {
        if (input.Terrain is not null
            && input.Terrain.TrySample(position.X, position.Z,
                out TerrainSample sample)
            && sample.UpNormal.Length >= 1e-6)
            return sample.UpNormal.Normalized();
        return new Vec3D(0.0, 1.0, 0.0);
    }

    static Vec3D TransportNormal(in Vec3D normal, in Vec3D forward,
        in Vec3D fallback) {
        Vec3D plane = normal - forward * normal.Dot(forward);
        if (plane.Length >= 1e-6) return plane.Normalized();
        Vec3D fallbackPlane = fallback - forward * fallback.Dot(forward);
        return fallbackPlane.Length >= 1e-6
            ? fallbackPlane.Normalized() : OrthogonalNormal(forward);
    }

    static Vec3D RotateNormal(in Vec3D normal, in Vec3D forward,
        double angleRad) {
        Vec3D transported = TransportNormal(normal, forward,
            OrthogonalNormal(forward));
        Vec3D physicalRight = transported.Cross(forward).Normalized();
        return (transported * Math.Cos(angleRad)
            + physicalRight * Math.Sin(angleRad)).Normalized();
    }

    static Vec3D OrthogonalNormal(in Vec3D forward) {
        Vec3D seed = Math.Abs(forward.Y) < 0.9
            ? new Vec3D(0.0, 1.0, 0.0)
            : new Vec3D(1.0, 0.0, 0.0);
        Vec3D plane = seed - forward * seed.Dot(forward);
        return plane.Length >= 1e-6
            ? plane.Normalized() : new Vec3D(0.0, 0.0, 1.0);
    }

    static double MoveToward(double current, double target, double maximumDelta) {
        if (Math.Abs(target - current) <= maximumDelta) return target;
        return current + Math.Sign(target - current) * maximumDelta;
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
            || config.ExitPredictionMarginM < 0.0)
            throw new ArgumentOutOfRangeException(nameof(config));
        if (!double.IsFinite(config.AttentivePilotTriggerFactor)
            || config.AttentivePilotTriggerFactor <= 0.0
            || config.AttentivePilotTriggerFactor > 1.0)
            throw new ArgumentOutOfRangeException(nameof(config));
    }
}
