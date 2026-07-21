using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

public class AutoGcasTests {
    const double TickSeconds = 1.0 / 120.0;

    static readonly AutoGcasCapabilityProfile Modern =
        AutoGcasCapabilityProfile.ModernCrewedPublicDataSurrogate;

    static AircraftState FlightState(double altitudeM, double speedMps = 250.0,
        double gammaDegrees = 0.0, double bankDegrees = 0.0) => new(
            new Vec3D(0.0, altitudeM, 0.0), speedMps,
            Radians(gammaDegrees), 0.0, Radians(bankDegrees),
            FlightModel.F22APublicDataSurrogate.MassKg,
            QuaternionD.Identity);

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
    [InlineData(420.0, AutoGcasPhase.Warning, "PULL UP")]
    [InlineData(170.0, AutoGcasPhase.FlyUp, "AUTO GCAS · FLYUP")]
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
        if (expectedPhase == AutoGcasPhase.FlyUp) {
            Assert.True(result.State.Active);
            Assert.NotNull(result.RecoveryCommand);
            Assert.Equal(1, result.State.ActivationCount);
            Assert.True(result.State.Prediction
                .TimeAvailableToAvoidGroundImpactSeconds
                <= Modern.Configuration.TriggerTimeAvailableSeconds);
        } else {
            Assert.True(result.State.Warning);
            Assert.Null(result.RecoveryCommand);
            Assert.InRange(result.State.Prediction
                    .TimeAvailableToAvoidGroundImpactSeconds,
                Modern.Configuration.TriggerTimeAvailableSeconds,
                Modern.Configuration.TriggerTimeAvailableSeconds
                    + Modern.Configuration.WarningLeadSeconds);
        }
    }

    [Theory]
    [InlineData(90.0, -1.0)]
    [InlineData(-90.0, 1.0)]
    public void FlyUpRollsShortestDirectionTowardUprightBeforePulling(
        double bankDegrees, double expectedRollControl) {
        AutoGcasStepResult result = Step(Input(FlightState(
            altitudeM: 80.0, gammaDegrees: -30.0,
            bankDegrees: bankDegrees), Command(throttle: 0.91)));

        Assert.Equal(AutoGcasPhase.FlyUp, result.State.Phase);
        PilotCommand recovery = Assert.IsType<PilotCommand>(result.RecoveryCommand);
        Assert.Equal(expectedRollControl, recovery.RollControl);
        Assert.Equal(1.0, recovery.GDemand);
        Assert.Equal(0.91, recovery.Throttle);
        Assert.Equal(0.0, recovery.BankTarget);
        Assert.Equal(0.0, recovery.Rudder);
        Assert.True(recovery.DirectLateralControl);
        Assert.False(recovery.EnvelopeOverride);
    }

    [Theory]
    [InlineData(30.0, 5.0)]
    [InlineData(-30.0, 5.0)]
    [InlineData(30.01, 1.0)]
    [InlineData(-30.01, 1.0)]
    public void FlyUpOnlyCommandsRecoveryGInsideTheBankGate(
        double bankDegrees, double expectedG) {
        AutoGcasStepResult result = Step(Input(FlightState(
            altitudeM: 60.0, gammaDegrees: -30.0,
            bankDegrees: bankDegrees)));

        Assert.Equal(AutoGcasPhase.FlyUp, result.State.Phase);
        PilotCommand recovery = Assert.IsType<PilotCommand>(result.RecoveryCommand);
        Assert.Equal(expectedG, recovery.GDemand);
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

    static double Radians(double degrees) => degrees * Math.PI / 180.0;
}
