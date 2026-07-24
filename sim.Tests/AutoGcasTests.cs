using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

public class AutoGcasTests {
    const double TickSeconds = 1.0 / 120.0;

    static readonly AutoGcasCapabilityProfile Modern =
        AutoGcasCapabilityProfile.ModernCrewedPublicDataSurrogate;

    static AircraftState FlightState(double altitudeM, double speedMps = 250.0,
        double gammaDegrees = 0.0, double bankDegrees = 0.0,
        double bodyRollRateRadPerSecond = 0.0) {
        AircraftParams aircraft = FlightModel.F22APublicDataSurrogate;
        double gamma = Radians(gammaDegrees);
        double bank = Radians(bankDegrees);
        Vec3D forward = new(0.0, Math.Sin(gamma), Math.Cos(gamma));
        Vec3D worldUp = new(0.0, 1.0, 0.0);
        Vec3D upPlane = worldUp - forward * forward.Dot(worldUp);
        Vec3D upReference = upPlane.Length < 1e-7
            ? new Vec3D(0.0, 0.0, -1.0) : upPlane.Normalized();
        Vec3D rightReference = upReference.Cross(forward).Normalized();
        Vec3D lift = (upReference * Math.Cos(bank)
            + rightReference * Math.Sin(bank)).Normalized();
        double dynamicPressure = AirData.TrueDynamicPressurePa(speedMps, altitudeM);
        double alpha = Math.Clamp(aircraft.MassKg * FlightModel.G0
                / Math.Max(dynamicPressure * aircraft.WingAreaM2
                    * aircraft.CLAlpha, 1e-9),
            aircraft.CLMin / aircraft.CLAlpha,
            aircraft.CLMax / aircraft.CLAlpha);
        Vec3D bodyForward = (forward * Math.Cos(alpha)
            + lift * Math.Sin(alpha)).Normalized();
        Vec3D bodyUp = (lift * Math.Cos(alpha)
            - forward * Math.Sin(alpha)).Normalized();
        QuaternionD attitude = QuaternionD.FromFrame(
            bodyUp.Cross(bodyForward).Normalized(), bodyUp, bodyForward);
        return new AircraftState(new Vec3D(0.0, altitudeM, 0.0), speedMps,
            gamma, 0.0, bank, aircraft.MassKg, attitude,
            new BodyRates(bodyRollRateRadPerSecond, 0.0, 0.0));
    }

    static PilotCommand Command(double gDemand = 1.0, double bankTargetDegrees = 0.0,
        double throttle = 0.82, double rollControl = 0.0,
        bool directLateralControl = true) => new(
            GDemand: gDemand,
            BankTarget: Radians(bankTargetDegrees),
            Throttle: throttle,
            Rudder: 0.0,
            RollControl: rollControl,
            DirectLateralControl: directLateralControl);

    static AutoGcasInput Input(AircraftState state, PilotCommand? command = null,
        double? fallbackSurfaceElevationM = 0.0,
        bool overrideHeld = false) => new(
            state,
            FlightModel.F22APublicDataSurrogate,
            command ?? Command(),
            Terrain: null,
            FallbackSurfaceElevationM: fallbackSurfaceElevationM,
            PilotOverrideHeld: overrideHeld);

    static AutoGcasStepResult Step(AutoGcasInput input,
        AutoGcasState? previous = null,
        AutoGcasCapabilityProfile? capability = null,
        double dtSeconds = TickSeconds) => AutoGcasController.Step(
            dtSeconds,
            previous ?? AutoGcasState.Initial(true),
            input,
            capability ?? Modern);

    [Fact]
    public void SafeFlightRemainsArmedWithoutTouchingPilotControls() {
        PilotCommand pilot = Command(gDemand: 1.0, bankTargetDegrees: 12.0,
            throttle: 0.73);

        AutoGcasStepResult result = Step(Input(
            FlightState(altitudeM: 1500.0), pilot));

        Assert.Equal(AutoGcasPhase.Armed, result.State.Phase);
        Assert.Equal(AutoGcasInhibitReason.None, result.State.InhibitReason);
        Assert.Equal("", result.State.Cue);
        Assert.False(result.State.Active);
        Assert.False(result.State.Warning);
        Assert.Null(result.RecoveryCommand);
        Assert.True(result.State.Prediction.Valid);
        Assert.True(result.State.Prediction.UsedFallbackTerrain);
        Assert.True(double.IsPositiveInfinity(
            result.State.Prediction.TimeAvailableToAvoidGroundImpactSeconds));
        Assert.Equal(0, result.State.ActivationCount);
    }

    [Theory]
    // Single last-instant boundary (physiology-independent): a -20 deg descent warns at ~90 m and
    // commits the fly-up at ~85 m over flat terrain — far lower than the old passive-early boundary.
    [InlineData(90.0, AutoGcasPhase.Warning, "PULL UP")]
    [InlineData(80.0, AutoGcasPhase.FlyUp, "AUTO GCAS · FLYUP")]
    public void DescendingTerrainThreatProducesWarningThenLastInstanceFlyUp(
        double altitudeM, AutoGcasPhase expectedPhase, string expectedCue) {
        AutoGcasStepResult result = Step(Input(FlightState(
            altitudeM, gammaDegrees: -20.0)));

        Assert.Equal(expectedPhase, result.State.Phase);
        Assert.Equal(expectedCue, result.State.Cue);
        Assert.True(result.State.Prediction.Valid);
        Assert.True(result.State.Prediction.PilotMinimumClearanceM
            <= Modern.Configuration.TerrainBufferM);
        Assert.True(double.IsFinite(result.State.Prediction
            .TimeAvailableToAvoidGroundImpactSeconds));
        // The commitment point is the last-instant boundary for every pilot state, so the
        // time-available bounds scale by the attentive trigger factor.
        double factor = Modern.Configuration.AttentivePilotTriggerFactor;
        if (expectedPhase == AutoGcasPhase.FlyUp) {
            Assert.True(result.State.Active);
            Assert.NotNull(result.RecoveryCommand);
            Assert.Equal(1, result.State.ActivationCount);
            Assert.True(result.State.Prediction
                .TimeAvailableToAvoidGroundImpactSeconds
                <= Modern.Configuration.TriggerTimeAvailableSeconds * factor);
        } else {
            Assert.True(result.State.Warning);
            Assert.Null(result.RecoveryCommand);
            Assert.InRange(result.State.Prediction
                    .TimeAvailableToAvoidGroundImpactSeconds,
                Modern.Configuration.TriggerTimeAvailableSeconds * factor,
                (Modern.Configuration.TriggerTimeAvailableSeconds
                    + Modern.Configuration.WarningLeadSeconds) * factor);
        }
    }

    [Theory]
    [InlineData(90.0, -1.0)]
    [InlineData(-90.0, 1.0)]
    public void FlyUpRollsShortestDirectionTowardTheEscapePlane(
        double bankDegrees, double expectedRollControl) {
        AutoGcasStepResult result = Step(Input(FlightState(
            altitudeM: 80.0, gammaDegrees: -30.0,
            bankDegrees: bankDegrees), Command(throttle: 0.91)));

        Assert.Equal(AutoGcasPhase.FlyUp, result.State.Phase);
        PilotCommand recovery = Assert.IsType<PilotCommand>(result.RecoveryCommand);
        Assert.Equal(0.0, recovery.RollControl);
        Assert.Equal(expectedRollControl, recovery.SasRollControl);
        Assert.Equal(Modern.Configuration.RecoveryLoadFactorG, recovery.GDemand);
        // Energy management is part of the save: above the fast-recovery gate the fly-up
        // commands idle (popping the automatic speed brake) instead of holding the pilot's
        // lever — idle/brake/pull.
        Assert.Equal(0.0, recovery.Throttle);
        Assert.Equal(0.0, recovery.BankTarget);
        Assert.Equal(0.0, recovery.Rudder);
        Assert.True(recovery.DirectLateralControl);
        // The fly-up claims the emergency/override law so the airframe can deliver the same
        // authority the time-available boundary was computed against.
        Assert.True(recovery.EnvelopeOverride);
    }

    [Theory]
    [InlineData(60.0, -1.0)]
    [InlineData(-60.0, 1.0)]
    public void WingsLevelCaptureBrakesResidualRollInsteadOfHuntingBank(
        double rollRateDegreesPerSecond, double expectedDirection) {
        AutoGcasStepResult result = Step(Input(FlightState(
            altitudeM: 80.0, gammaDegrees: -20.0, bankDegrees: 1.0,
            bodyRollRateRadPerSecond: Radians(rollRateDegreesPerSecond))));

        Assert.Equal(AutoGcasPhase.FlyUp, result.State.Phase);
        PilotCommand recovery = Assert.IsType<PilotCommand>(result.RecoveryCommand);
        Assert.Equal(0.0, recovery.RollControl);
        Assert.Equal(expectedDirection, Math.Sign(recovery.SasRollControl));
    }

    [Theory]
    [InlineData(30.0)]
    [InlineData(-30.0)]
    [InlineData(80.0)]
    [InlineData(-80.0)]
    public void EscapeAlignedLiftKeepsTheFullFlyUpDemandAtHighBank(
        double bankDegrees) {
        AutoGcasStepResult result = Step(Input(FlightState(
            altitudeM: 60.0, gammaDegrees: -30.0,
            bankDegrees: bankDegrees)));

        Assert.Equal(AutoGcasPhase.FlyUp, result.State.Phase);
        PilotCommand recovery = Assert.IsType<PilotCommand>(result.RecoveryCommand);
        Assert.Equal(Modern.Configuration.RecoveryLoadFactorG, recovery.GDemand);
    }

    [Fact]
    public void SteepDiveUsesPhysicalAttitudeRatherThanSingularLegacyBank() {
        AircraftState physicalRightBank = FlightState(
            altitudeM: 800.0, speedMps: 300.0,
            gammaDegrees: -80.0, bankDegrees: 80.0) with {
                // State.Bank is a compatibility value and can disagree near the vertical pole.
                Bank = Radians(-80.0)
            };

        AutoGcasStepResult result = Step(Input(physicalRightBank));

        Assert.Equal(AutoGcasPhase.FlyUp, result.State.Phase);
        PilotCommand recovery = Assert.IsType<PilotCommand>(result.RecoveryCommand);
        Assert.Equal(0.0, recovery.RollControl, 12);
        Assert.Equal(-1.0, recovery.SasRollControl, 12);
        Assert.Equal(Modern.Configuration.RecoveryLoadFactorG, recovery.GDemand);
    }

    [Fact]
    public void InvertedRecoveryUnloadsUntilLiftPointsAwayFromTerrain() {
        AircraftState inverted = FlightState(
            altitudeM: 740.0, speedMps: 300.0,
            gammaDegrees: -60.0, bankDegrees: 180.0) with {
                Bank = 0.0
            };

        AutoGcasStepResult result = Step(Input(inverted));

        Assert.Equal(AutoGcasPhase.FlyUp, result.State.Phase);
        PilotCommand recovery = Assert.IsType<PilotCommand>(result.RecoveryCommand);
        Assert.Equal(0.0, recovery.RollControl, 12);
        Assert.Equal(1.0, Math.Abs(recovery.SasRollControl), 12);
        Assert.Equal(0.0, recovery.GDemand);
    }

    [Fact]
    public void ExactVerticalDivePreservesItsPhysicalEscapePlaneAndPulls() {
        AutoGcasStepResult result = Step(Input(FlightState(
            altitudeM: 900.0, speedMps: 300.0,
            gammaDegrees: -90.0, bankDegrees: 0.0)));

        Assert.Equal(AutoGcasPhase.FlyUp, result.State.Phase);
        PilotCommand recovery = Assert.IsType<PilotCommand>(result.RecoveryCommand);
        Assert.Equal(0.0, recovery.RollControl, 12);
        Assert.Equal(0.0, recovery.SasRollControl, 12);
        Assert.Equal(Modern.Configuration.RecoveryLoadFactorG, recovery.GDemand);
    }

    [Fact]
    public void PredictedVerticalSaveProducesAuthoritativeTerrainClearance() {
        AircraftState initial = FlightState(
            // The single last-instant boundary commits a near-vertical 300 m/s dive at ~930 m — the
            // altitude at which a max-perform recovery's clearance reaches the terrain buffer. Begin
            // just inside that so the fly-up fires on this first step and the modelled recovery
            // still clears the ground.
            altitudeM: 920.0, speedMps: 300.0,
            gammaDegrees: -89.0, bankDegrees: 0.0);
        var aircraft = new AircraftSim(initial,
            FlightModel.F22APublicDataSurrogate);
        aircraft.SeedEnginePowerFraction(1.0);
        PilotCommand pilot = Command(throttle: 1.0);
        AutoGcasStepResult activation = Step(new AutoGcasInput(
            aircraft.State,
            FlightModel.F22APublicDataSurrogate,
            pilot,
            Terrain: null,
            FallbackSurfaceElevationM: 0.0,
            IndicatedAirspeedMps: aircraft.IndicatedAirspeedMps));

        Assert.Equal(AutoGcasPhase.FlyUp, activation.State.Phase);
        // Last-instant doctrine: the fly-up commits exactly as the immediate recovery's clearance
        // reaches the terrain buffer, so it fires AT the buffer, not comfortably above it. The
        // honest invariant is that the predicted recovery still clears the ground.
        Assert.True(activation.State.Prediction.ImmediateRecoveryMinimumClearanceM >= 0.0,
            "the predicted vertical recovery went underground: "
            + $"{activation.State.Prediction.ImmediateRecoveryMinimumClearanceM:F2} m");
        PilotCommand recovery = Assert.IsType<PilotCommand>(
            activation.RecoveryCommand);
        double minimumClearance = aircraft.State.Position.Y;
        bool arrestedDescent = false;
        for (int tick = 0; tick < 20 * AircraftSim.TickHz; tick++) {
            aircraft.Step(recovery, TickSeconds);
            minimumClearance = Math.Min(minimumClearance,
                aircraft.State.Position.Y);
            if (aircraft.State.Position.Y <= 0.0) break;
            if (aircraft.State.Gamma >= 0.0 && tick > AircraftSim.TickHz) {
                arrestedDescent = true;
                break;
            }
        }

        // Non-vacuous: the near-vertical dive must actually PULL OUT (reach level flight), not
        // merely avoid the ground for 20 s, and it must never contact terrain doing so.
        Assert.True(arrestedDescent,
            "the vertical save never arrested the descent to level flight");
        Assert.True(minimumClearance > 0.0,
            $"the vertical save contacted the ground (bottomed at {minimumClearance:F2} m AGL)");
    }

    [Fact]
    public void NegativeGEntryCannotReceiveAnOptimisticInstantaneousUnload() {
        AircraftState state = FlightState(
            altitudeM: 2000.0, speedMps: 260.0,
            gammaDegrees: -60.0, bankDegrees: 0.0);

        AutoGcasStepResult neutral = Step(Input(state, Command(gDemand: 1.0)));
        AutoGcasStepResult bunt = Step(Input(state, Command(gDemand: -1.0)));

        Assert.True(neutral.State.Prediction.Valid);
        Assert.True(bunt.State.Prediction.Valid);
        Assert.True(bunt.State.Prediction.ImmediateRecoveryMinimumClearanceM
                <= neutral.State.Prediction.ImmediateRecoveryMinimumClearanceM,
            "a negative-G entry must be unwound through the modeled onset response");
    }

    [Fact]
    public void DescendingBelowMinimumRecoverySpeedIsInhibitedWithAirspeedCue() {
        double belowMinimum = Modern.Configuration.MinimumRecoveryAirspeedMps - 0.1;

        AutoGcasStepResult result = Step(Input(FlightState(
            altitudeM: 80.0, speedMps: belowMinimum,
            gammaDegrees: -20.0)));

        Assert.Equal(AutoGcasPhase.Inhibited, result.State.Phase);
        Assert.Equal(AutoGcasInhibitReason.LowAirspeed,
            result.State.InhibitReason);
        Assert.Equal("AIRSPEED", result.State.Cue);
        Assert.False(result.State.Prediction.Valid);
        Assert.Null(result.RecoveryCommand);
    }

    [Fact]
    public void MissingTerrainTruthFailsClosedWithoutInventingARecovery() {
        AutoGcasStepResult result = Step(Input(
            FlightState(altitudeM: 100.0, gammaDegrees: -20.0),
            fallbackSurfaceElevationM: null));

        Assert.Equal(AutoGcasPhase.Inhibited, result.State.Phase);
        Assert.Equal(AutoGcasInhibitReason.TerrainData,
            result.State.InhibitReason);
        Assert.Equal("GCAS TERRAIN", result.State.Cue);
        Assert.False(result.State.Prediction.Valid);
        Assert.Null(result.RecoveryCommand);
        Assert.Equal(0, result.State.ActivationCount);
    }

    [Fact]
    public void PredictionSweepsBetweenTimeSamplesSoANarrowRidgeCannotAliasClear() {
        var heights = new double[80, 3];
        for (int east = 0; east < 3; east++) heights[1, east] = 1000.0;
        var terrain = new BilinearHeightGrid(
            -128.0, -115.5, 128.0, 128.0, heights);
        AircraftState state = FlightState(altitudeM: 980.0, speedMps: 250.0);
        var input = new AutoGcasInput(
            state,
            FlightModel.F22APublicDataSurrogate,
            Command(throttle: 0.8),
            Terrain: terrain,
            FallbackSurfaceElevationM: null,
            IndicatedAirspeedMps: 250.0);

        AutoGcasStepResult result = Step(input);

        Assert.True(result.State.Prediction.Valid);
        Assert.True(result.State.Prediction.PilotMinimumClearanceM
                <= Modern.Configuration.TerrainBufferM,
            "the 1000 m ridge between 0.1 s endpoints must enter the predicted clearance envelope");
        Assert.NotEqual(AutoGcasPhase.Armed, result.State.Phase);
    }

    [Fact]
    public void ActiveRecoveryContinuesIfTerrainDataIsLost() {
        AutoGcasInput threat = Input(FlightState(
            altitudeM: 80.0, gammaDegrees: -30.0));
        AutoGcasStepResult activated = Step(threat);

        AutoGcasStepResult degraded = Step(threat with {
            FallbackSurfaceElevationM = null
        }, activated.State);

        Assert.True(degraded.State.Active);
        Assert.Equal("AUTO GCAS · TERRAIN", degraded.State.Cue);
        Assert.NotNull(degraded.RecoveryCommand);
        Assert.Equal(0, degraded.State.ReleaseCount);
        Assert.Equal(activated.State.Prediction, degraded.State.Prediction);
    }

    [Fact]
    public void ActiveRecoveryDoesNotDropAtLowAirspeedBoundary() {
        AutoGcasInput threat = Input(FlightState(
            altitudeM: 80.0, gammaDegrees: -30.0));
        AutoGcasStepResult activated = Step(threat);
        double belowMinimum = Modern.Configuration.MinimumRecoveryAirspeedMps - 0.1;

        AutoGcasStepResult degraded = Step(Input(FlightState(
            altitudeM: 75.0, speedMps: belowMinimum,
            gammaDegrees: -30.0)), activated.State);

        Assert.True(degraded.State.Active);
        Assert.Equal("AUTO GCAS · AIRSPEED", degraded.State.Cue);
        Assert.NotNull(degraded.RecoveryCommand);
        Assert.Equal(0, degraded.State.ReleaseCount);
    }

    [Fact]
    public void PilotPaddleImmediatelyOverridesAnActiveRecoveryAndCountsRelease() {
        AutoGcasInput threat = Input(FlightState(
            altitudeM: 80.0, gammaDegrees: -30.0));
        AutoGcasStepResult activated = Step(threat);
        Assert.True(activated.State.Active);

        AutoGcasStepResult overridden = Step(threat with {
            PilotOverrideHeld = true
        }, activated.State);

        Assert.Equal(AutoGcasPhase.Inhibited, overridden.State.Phase);
        Assert.Equal(AutoGcasInhibitReason.PilotOverride,
            overridden.State.InhibitReason);
        Assert.Equal("GCAS PADDLE", overridden.State.Cue);
        Assert.Null(overridden.RecoveryCommand);
        Assert.Equal(1, overridden.State.ActivationCount);
        Assert.Equal(1, overridden.State.PilotOverrideCount);
        Assert.Equal(1, overridden.State.ReleaseCount);
        Assert.Equal(0.0, overridden.State.ActiveSeconds);
    }

    [Fact]
    public void ActiveRecoveryRequiresContinuousSafeClimbBeforeRelease() {
        AutoGcasStepResult activated = Step(Input(FlightState(
            altitudeM: 80.0, gammaDegrees: -30.0)));
        Assert.True(activated.State.Active);

        AutoGcasInput safeClimb = Input(FlightState(
            altitudeM: 1000.0, gammaDegrees: 10.0));
        AutoGcasState state = activated.State;
        const double quarterSecond = 0.25;
        int ticksToRelease = (int)Math.Ceiling(
            Modern.Configuration.ExitDwellSeconds / quarterSecond);

        for (int tick = 0; tick < ticksToRelease - 1; tick++) {
            AutoGcasStepResult stillRecovering = Step(safeClimb, state,
                dtSeconds: quarterSecond);
            state = stillRecovering.State;
            Assert.True(state.Active);
            Assert.NotNull(stillRecovering.RecoveryCommand);
        }

        AutoGcasStepResult released = Step(safeClimb, state,
            dtSeconds: quarterSecond);

        Assert.Equal(AutoGcasPhase.Armed, released.State.Phase);
        Assert.Null(released.RecoveryCommand);
        Assert.Equal(1, released.State.ActivationCount);
        Assert.Equal(1, released.State.ReleaseCount);
        Assert.Equal(0.0, released.State.ActiveSeconds);
        Assert.Equal(0.0, released.State.ClearDwellSeconds);
    }

    [Fact]
    public void UnsafeInterruptionResetsTheReleaseDwellTimer() {
        AutoGcasStepResult activated = Step(Input(FlightState(
            altitudeM: 80.0, gammaDegrees: -30.0)));
        AutoGcasState state = activated.State;
        AutoGcasInput safeClimb = Input(FlightState(
            altitudeM: 1000.0, gammaDegrees: 10.0));

        for (int tick = 0; tick < 60; tick++) state = Step(safeClimb, state).State;
        Assert.True(state.ClearDwellSeconds > 0.0);

        state = Step(Input(FlightState(
            altitudeM: 1000.0, gammaDegrees: -1.0)), state).State;

        Assert.True(state.Active);
        Assert.Equal(0.0, state.ClearDwellSeconds);
        Assert.Equal(0, state.ReleaseCount);
    }

    [Fact]
    public void EffectivePilotRecoveryIsCreditedAndAvoidsIntervention() {
        PilotCommand pilotRecovery = Command(
            gDemand: 5.0, bankTargetDegrees: 0.0, throttle: 0.87);

        AutoGcasStepResult result = Step(Input(FlightState(
            altitudeM: 170.0, gammaDegrees: -20.0), pilotRecovery));

        Assert.True(result.State.Prediction.Valid);
        Assert.True(result.State.Prediction.PilotRecoveryCredited);
        Assert.True(result.State.Prediction.PilotMinimumClearanceM
            > Modern.Configuration.TerrainBufferM);
        Assert.Equal(AutoGcasPhase.Armed, result.State.Phase);
        Assert.Null(result.RecoveryCommand);
        Assert.Equal(0, result.State.ActivationCount);
    }

    [Fact]
    public void UnavailableCapabilityNeverPredictsOrCommandsARecovery() {
        AutoGcasStepResult result = Step(Input(FlightState(
                altitudeM: 60.0, gammaDegrees: -40.0)),
            previous: AutoGcasState.Initial(false),
            capability: AutoGcasCapabilityProfile.None);

        Assert.Equal(AutoGcasPhase.Unavailable, result.State.Phase);
        Assert.Equal(AutoGcasInhibitReason.CapabilityUnavailable,
            result.State.InhibitReason);
        Assert.False(result.State.Prediction.Valid);
        Assert.Null(result.RecoveryCommand);
        Assert.Equal(0, result.State.ActivationCount);
    }

    [Fact]
    public void PadlockSasRollIsPredictedExactlyLikePilotRollDuringTerrainPrediction() {
        // The padlock roll assist commands its entire roll through the explicit SAS channel with
        // neutral pilot aileron. FlightModel flies the clamped RollControl + SasRollControl sum,
        // so the terrain predictor must fly the identical demand: reading only RollControl
        // predicted a wings-steady trajectory while the real aircraft rolled its lift vector
        // away during a low-altitude padlocked turn.
        AircraftState state = FlightState(altitudeM: 420.0, gammaDegrees: -20.0);

        AutoGcasStepResult pilotRoll = Step(Input(state, Command(rollControl: 0.18)));
        AutoGcasStepResult sasRoll = Step(Input(state,
            Command() with { SasRollControl = 0.18 }));
        AutoGcasStepResult neutral = Step(Input(state, Command()));

        Assert.Equal(pilotRoll.State.Prediction, sasRoll.State.Prediction);
        Assert.Equal(pilotRoll.State.Phase, sasRoll.State.Phase);
        Assert.NotEqual(neutral.State.Prediction.PilotMinimumClearanceM,
            sasRoll.State.Prediction.PilotMinimumClearanceM);

        // A split demand saturates at the same physical actuator stop as full deflection.
        AutoGcasStepResult split = Step(Input(state,
            Command(rollControl: 0.7) with { SasRollControl = 0.6 }));
        AutoGcasStepResult full = Step(Input(state, Command(rollControl: 1.0)));
        Assert.Equal(full.State.Prediction, split.State.Prediction);
    }

    [Fact]
    public void PilotActivityClassificationDoesNotMoveTheCommitmentPoint() {
        // Auto-GCAS is a pure terrain/trajectory backstop and knows nothing about pilot physiology
        // (owner directive 2026-07-24). The same descent must commit at the SAME altitude whether
        // the pilot is scored actively flying or passive — the old passive-early escalation, which
        // fired false fly-ups mid-fight while a conscious pilot greyed out, is gone. Both are still
        // caught: a jet that will hit the ground gets the last-instant save regardless.
        const double sinkRate = 60.0;
        const double dt = 0.10;

        double TriggerAltitude(bool activelyFlying) {
            AutoGcasState state = AutoGcasState.Initial(true);
            for (double altitude = 900.0; altitude > 0.0; altitude -= sinkRate * dt) {
                var input = Input(FlightState(
                    altitudeM: altitude, gammaDegrees: -14.0)) with {
                    PilotActivelyFlying = activelyFlying
                };
                AutoGcasStepResult result = Step(input, state, dtSeconds: dt);
                state = result.State;
                if (state.Active) return altitude;
            }
            return double.NaN;
        }

        double passiveTrigger = TriggerAltitude(activelyFlying: false);
        double attentiveTrigger = TriggerAltitude(activelyFlying: true);

        Assert.False(double.IsNaN(passiveTrigger), "the descent must be caught");
        Assert.False(double.IsNaN(attentiveTrigger), "the descent must be caught");
        Assert.Equal(passiveTrigger, attentiveTrigger);
    }

    [Fact]
    public void EffectiveCommandGAloneNeverDefersTheCommitment() {
        // Gunnery pitch assist contributes up to 3.5 G through the EFFECTIVE command, so command
        // G must not buy the deferred commitment on its own: only the session's explicit
        // actively-flying signal (derived from the raw human input path) defers. Otherwise a
        // hands-off pilot fixated near a target would be classified as attentive by the
        // autopilot's own pull — the precise lost-SA state the backstop exists for. (The
        // credited pull may legitimately trigger later or not at all because the predicted
        // recovery path genuinely clears; it must never trigger LOWER than the same command
        // carries with the attentive flag set.)
        const double sinkRate = 60.0;
        const double dt = 0.10;

        double TriggerAltitude(PilotCommand command, bool activelyFlying) {
            AutoGcasState state = AutoGcasState.Initial(true);
            for (double altitude = 900.0; altitude > 0.0; altitude -= sinkRate * dt) {
                var input = Input(FlightState(
                    altitudeM: altitude, gammaDegrees: -14.0), command) with {
                    PilotActivelyFlying = activelyFlying
                };
                AutoGcasStepResult result = Step(input, state, dtSeconds: dt);
                state = result.State;
                if (state.Active) return altitude;
            }
            return double.NaN;
        }

        PilotCommand assisted = Command(gDemand: 3.5, directLateralControl: false);
        double assistedNoFlag = TriggerAltitude(assisted, activelyFlying: false);
        double assistedFlagged = TriggerAltitude(assisted, activelyFlying: true);

        Assert.True(double.IsNaN(assistedFlagged)
            || double.IsNaN(assistedNoFlag)
            || assistedNoFlag >= assistedFlagged,
            "without the human-input flag, assist G must commit no later than with it: "
            + $"noFlag={assistedNoFlag:F0}, flagged={assistedFlagged:F0}");
    }

    static double Radians(double degrees) => degrees * Math.PI / 180.0;
}
