using GunsOnly.Sim.Doctrine;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

public sealed class F86EmergencyGearRecoveryScenarioTests {
    const double Dt = SimulationSession.FixedDeltaSeconds;
    readonly ITestOutputHelper _output;

    public F86EmergencyGearRecoveryScenarioTests(ITestOutputHelper output) => _output = output;

    static double IndicatedAirspeedKts(SimulationSession session) =>
        AirData.IndicatedAirspeedMps(session.Player.AirspeedMps,
            session.Player.State.Position.Y, session.Player.AtmosphereModel)
        * AirData.MpsToKnots;

    static double RangeAftM(SimulationSession session) {
        var (along, _, _) = session.Carrier!.LandingFrame(session.Player.State.Position);
        return -along;
    }

    static void RunSession(SimulationSession session, double seconds) {
        int ticks = (int)Math.Ceiling(seconds / Dt);
        for (int i = 0; i < ticks && session.Lifecycle == SimulationSession.LifecycleState.Active;
            i++) session.StepFixed();
    }

    static void Tap(SimulationSession session, GKey key) {
        session.FeedKey(key, true);
        RunSession(session, 0.05);
        session.FeedKey(key, false);
        RunSession(session, 0.05);
    }

    static void HoldAirspeedBand(SimulationSession session,
        double lowKias = 148.0, double highKias = 163.0) {
        double ias = IndicatedAirspeedKts(session);
        session.FeedKey(GKey.ThrottleDown, ias > highKias);
        session.FeedKey(GKey.ThrottleUp,
            ias < lowKias && session.Controls.Throttle < 0.92);
    }

    static void FlyTestCardLeg(SimulationSession session, double targetDeckHeightM = 200.0) {
        HoldAirspeedBand(session, lowKias: 140.0, highKias: 150.0);
        var (_, _, height) = session.Carrier!.LandingFrame(session.Player.State.Position);
        double wantedGamma = Math.Clamp((targetDeckHeightM - height) / 1_200.0,
            -0.055, 0.020);
        double gammaError = wantedGamma - session.Player.State.Gamma;
        bool pull = gammaError > 0.004;
        bool push = gammaError < -0.004;
        session.FeedKey(GKey.Override, false);
        session.FeedKey(GKey.PullUp, pull);
        session.FeedKey(GKey.PushDown, push);
    }

    static void FlyPublishedApproach(SimulationSession session) {
        Carrier carrier = session.Carrier!;
        var (along, _, height) = carrier.LandingFrame(session.Player.State.Position);
        double targetAlong = carrier.TouchdownAlongM + 204.0;
        double wantedDeckGamma = Math.Atan2(-height,
            Math.Max(1.0, targetAlong - along));
        double desiredPitch = wantedDeckGamma + carrier.ApproachDirectorPitchOffsetRad;
        double pitchError = desiredPitch - session.Player.BodyPitchRad;
        session.FeedKey(GKey.Override, false);
        session.FeedKey(GKey.PullUp, pitchError > 0.0025);
        session.FeedKey(GKey.PushDown, pitchError < -0.0025);

        double burble = session.Burble?.InCloseStrength(session.Player.State.Position) ?? 0.0;
        double wantedPower = Math.Clamp(session.Controls.ApproachTrimThrottle
            + 0.040 * Math.Max(0.0, session.Controls.GlideslopeErrorM)
            + 0.026 * (70.0 - session.Player.AirspeedMps) + 0.15 * burble,
            0.02, 0.90);
        session.FeedKey(GKey.ThrottleUp,
            session.Controls.Throttle < wantedPower - 0.015);
        session.FeedKey(GKey.ThrottleDown,
            session.Controls.Throttle > wantedPower + 0.015);
    }

    static void StepFor(AirframeSystems systems,
        F86EmergencyGearRecoveryScenario scenario,
        ref double elapsedSeconds,
        double durationSeconds,
        double indicatedAirspeedKnots = 170.0) {
        int ticks = (int)Math.Ceiling(durationSeconds / Dt);
        for (int i = 0; i < ticks; i++) {
            systems.Step(Dt, new AirframeSystemsInput(
                EngineRpmPercent: 80.0,
                IndicatedAirspeedKnots: indicatedAirspeedKnots,
                WeightOnWheels: false));
            elapsedSeconds += Dt;
            scenario.Step(elapsedSeconds);
        }
    }

    [Fact]
    public void ObservableProcedureAndRecoveryProduceAFullScoreWithoutExposingFaultTruth() {
        var systems = new AirframeSystems();
        var scenario = new F86EmergencyGearRecoveryScenario(systems);
        double elapsed = 0.0;

        scenario.Begin(elapsed);
        StepFor(systems, scenario, ref elapsed, 0.5);

        Assert.True(systems.PrimaryBusPowered);
        Assert.Equal(0.0, systems.UtilityHydraulicPressurePsi, precision: 6);
        Assert.Equal(F86EmergencyGearRecoveryState.NormalCheck, scenario.State);

        scenario.SelectNormalGearDown(elapsed);
        StepFor(systems, scenario, ref elapsed,
            F86EmergencyGearTestFlightProcedure.NormalExtensionEvidenceSeconds + 0.1);
        Assert.Equal(0.0, systems.EffectiveGearFraction, precision: 6);
        scenario.ConfirmNormalExtensionFailure(elapsed);

        Assert.Equal(F86EmergencyGearRecoveryState.EmergencyExtend, scenario.State);
        scenario.SetEmergencyGearRelease(true, elapsed);
        StepFor(systems, scenario, ref elapsed,
            systems.Profile.EmergencyGearExtensionSeconds
                + systems.Profile.GearDoorTravelSeconds + 0.5);
        scenario.InspectMechanicalDownlocks(elapsed);
        scenario.SetEmergencyGearRelease(false, elapsed);

        Assert.True(systems.AllGearDownAndLocked);
        Assert.True(scenario.ProcedurallyComplete);
        Assert.Equal(100, scenario.Score);
        Assert.Empty(scenario.Evaluation.Demerits);
        Assert.Equal(F86EmergencyGearRecoveryState.Recover, scenario.State);

        scenario.RecordRecovered(elapsed);

        Assert.True(scenario.Recovered);
        Assert.True(scenario.Finished);
        Assert.Equal(F86EmergencyGearRecoveryState.Recovered, scenario.State);
        Assert.DoesNotContain("hydraulic", scenario.PilotInstruction,
            StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void EndingSpringLoadedReleaseEarlyRemainsAnObservableProceduralDemerit() {
        var systems = new AirframeSystems();
        var scenario = new F86EmergencyGearRecoveryScenario(systems);
        double elapsed = 0.0;

        scenario.Begin(elapsed);
        StepFor(systems, scenario, ref elapsed, 0.5);
        scenario.SelectNormalGearDown(elapsed);
        StepFor(systems, scenario, ref elapsed,
            F86EmergencyGearTestFlightProcedure.NormalExtensionEvidenceSeconds + 0.1);
        scenario.ConfirmNormalExtensionFailure(elapsed);
        scenario.SetEmergencyGearRelease(true, elapsed);
        StepFor(systems, scenario, ref elapsed, 0.5);
        scenario.SetEmergencyGearRelease(false, elapsed);

        Assert.Contains(scenario.Evaluation.Demerits,
            demerit => demerit.Code == "emergency-release-ended-early");
        Assert.False(scenario.ProcedurallyComplete);
    }

    [Fact]
    public void BuiltInMissionRoutesConsoleActionsIntoTheEvidenceController() {
        var session = new SimulationSession(6, Carrier.DeckConfiguration.Axial);

        Assert.Equal(MaintenanceScenarioKind.F86EmergencyGearRecovery,
            session.Beat.MaintenanceScenario);
        Assert.NotNull(session.MaintenanceScenario);
        Assert.Equal(LandingGearHandle.Up, session.PlayerSystems.GearHandle);
        Assert.True(session.PlayerSystems.AllGearUpAndLocked);

        session.Begin();
        for (int i = 0; i < 60; i++) session.StepFixed();
        session.FeedKey(GKey.GearToggle, true);
        session.FeedKey(GKey.GearToggle, false);
        for (int i = 0; i < (int)Math.Ceiling(
            (F86EmergencyGearTestFlightProcedure.NormalExtensionEvidenceSeconds + 0.1) / Dt);
            i++) session.StepFixed();
        session.FeedKey(GKey.ConfirmGearExtensionFailure, true);
        session.FeedKey(GKey.ConfirmGearExtensionFailure, false);

        Assert.Equal(LandingGearHandle.Down, session.PlayerSystems.GearHandle);
        Assert.Equal(F86EmergencyGearRecoveryState.ConfigureForEmergencyExtension,
            session.MaintenanceScenario!.State);
        Assert.Equal(0.0, session.PlayerSystems.EffectiveGearFraction, precision: 6);
        Assert.True(session.PlayerSystems.PrimaryBusPowered);
        Assert.Equal(0.0, session.PlayerSystems.UtilityHydraulicPressurePsi, precision: 6);
    }

    [Fact]
    public void ProductionMissionTestCardCompletesProcedureAndCarrierRecoveryWithinLimits() {
        var session = new SimulationSession(6, Carrier.DeckConfiguration.Axial);
        session.Begin();
        double initialIas = IndicatedAirspeedKts(session);
        double initialRange = RangeAftM(session);

        Tap(session, GKey.ThrottleDown);
        Tap(session, GKey.ThrottleDown);
        RunSession(session, 0.30); // commit the deferred fine throttle inputs
        session.FeedKey(GKey.GearToggle, true);
        session.FeedKey(GKey.GearToggle, false);
        RunSession(session, 10.4);

        double observedIas = IndicatedAirspeedKts(session);
        double observedRange = RangeAftM(session);
        _output.WriteLine($"OBSERVATION WINDOW: IAS {initialIas:F1}->{observedIas:F1} KIAS; "
            + $"range {initialRange:F0}->{observedRange:F0} m; "
            + $"throttle {session.Controls.Throttle:F2}; time {session.TimeSeconds:F2} s");

        session.FeedKey(GKey.ConfirmGearExtensionFailure, true);
        session.FeedKey(GKey.ConfirmGearExtensionFailure, false);
        double maxEmergencyIas = observedIas;
        while (IndicatedAirspeedKts(session) > 160.0 && session.Controls.Throttle > 0.05) {
            session.FeedKey(GKey.ThrottleDown, true);
            session.StepFixed();
            maxEmergencyIas = Math.Max(maxEmergencyIas, IndicatedAirspeedKts(session));
        }
        session.FeedKey(GKey.ThrottleDown, false);
        session.FeedKey(GKey.EmergencyGearRelease, true);
        int emergencyTicks = (int)Math.Ceiling(
            (session.PlayerSystems.Profile.EmergencyGearExtensionSeconds
                + session.PlayerSystems.Profile.GearDoorTravelSeconds + 0.75) / Dt);
        for (int i = 0; i < emergencyTicks; i++) {
            HoldAirspeedBand(session);
            session.StepFixed();
            maxEmergencyIas = Math.Max(maxEmergencyIas, IndicatedAirspeedKts(session));
        }
        session.FeedKey(GKey.ThrottleDown, false);
        session.FeedKey(GKey.ThrottleUp, false);
        session.FeedKey(GKey.InspectGearDownlocks, true);
        session.FeedKey(GKey.InspectGearDownlocks, false);
        session.FeedKey(GKey.EmergencyGearRelease, false);

        double procedureIas = IndicatedAirspeedKts(session);
        double procedureRange = RangeAftM(session);
        var (_, _, procedureHeight) = session.Carrier!.LandingFrame(
            session.Player.State.Position);
        _output.WriteLine($"EMERGENCY EXTENSION: max {maxEmergencyIas:F1} KIAS, "
            + $"complete at {session.TimeSeconds:F2} s / {procedureIas:F1} KIAS; "
            + $"range {procedureRange:F0} m; height {procedureHeight:F0} m");

        Assert.Equal(LandingGearHandle.Down, session.PlayerSystems.GearHandle);
        Assert.InRange(initialIas, 135.0, 155.0);
        Assert.InRange(observedIas, 145.0,
            F86EmergencyGearTestFlightProcedure.EmergencyExtensionLimitKias);
        Assert.True(observedRange > 8_000.0,
            $"the ten-second observation window left only {observedRange:F0} m");
        Assert.True(maxEmergencyIas <=
            F86EmergencyGearTestFlightProcedure.EmergencyExtensionLimitKias,
            $"emergency extension reached {maxEmergencyIas:F1} KIAS");
        Assert.True(session.PlayerSystems.AllGearDownAndLocked);
        Assert.True(session.MaintenanceScenario!.ProcedurallyComplete);
        Assert.Equal(100, session.MaintenanceScenario.Score);
        Assert.True(procedureRange > 6_500.0,
            $"procedure completed with only {procedureRange:F0} m remaining");
        Assert.True(procedureHeight > 150.0,
            $"procedure completed with only {procedureHeight:F0} m deck clearance");

        // Keep landing flap up during the long RTB leg, then configure before the groove. All
        // commands still enter through GKeys and all physics, systems, carrier contact,
        // arrestment, and scoring remain session-owned.
        int cleanRtbTicks = 0;
        while (session.Lifecycle == SimulationSession.LifecycleState.Active
            && RangeAftM(session) > 4_500.0
            && cleanRtbTicks++ < 90 * AircraftSim.TickHz) {
            FlyTestCardLeg(session);
            session.StepFixed();
        }
        var (_, _, preFlapHeight) = session.Carrier!.LandingFrame(
            session.Player.State.Position);
        _output.WriteLine($"RTB CONFIGURE: {RangeAftM(session):F0} m / "
            + $"{preFlapHeight:F0} m / {IndicatedAirspeedKts(session):F1} KIAS");

        session.FeedKey(GKey.FlapDown, true);
        int flapTicks = (int)Math.Ceiling(
            (session.PlayerSystems.Profile.FullFlapTravelSeconds + 0.5) / Dt);
        for (int i = 0; i < flapTicks; i++) {
            FlyTestCardLeg(session);
            session.StepFixed();
        }
        session.FeedKey(GKey.FlapDown, false);

        bool sawApproachMode = false;
        string gateSnapshot = "not reached";
        int recoveryTicks = 0;
        while (session.Lifecycle == SimulationSession.LifecycleState.Active
            && recoveryTicks++ < 180 * AircraftSim.TickHz) {
            if (session.Controls.ApproachMode) {
                sawApproachMode = true;
                FlyPublishedApproach(session);
            } else {
                FlyTestCardLeg(session);
            }
            double gateRange = RangeAftM(session);
            if (gateRange is < 3_050.0 and > 2_950.0) {
                var (_, gateCross, gateHeight) = session.Carrier!.LandingFrame(
                    session.Player.State.Position);
                gateSnapshot = $"range={gateRange:F0} h={gateHeight:F1} x={gateCross:F1} "
                    + $"gamma={session.Player.State.Gamma * 57.2958:F2}deg "
                    + $"IAS={IndicatedAirspeedKts(session):F1} "
                    + $"TAS={session.Player.AirspeedMps * AirData.MpsToKnots:F1} "
                    + $"closure={session.Carrier.DeckClosureMps(session.Player.State) * AirData.MpsToKnots:F1} "
                    + $"throttle={session.Controls.Throttle:F2}";
            }
            session.StepFixed();
        }
        session.FeedKey(GKey.Override, false);
        session.FeedKey(GKey.PullUp, false);
        session.FeedKey(GKey.PushDown, false);
        session.FeedKey(GKey.ThrottleUp, false);
        session.FeedKey(GKey.ThrottleDown, false);

        var (finalAlong, finalCross, finalHeight) = session.Carrier!.LandingFrame(
            session.Arrestment.IsActive
                ? session.Arrestment.Position
                : session.Player.State.Position);
        _output.WriteLine($"RECOVERY: state {session.MaintenanceScenario.State}; "
            + $"outcome {session.Outcome}; time {session.TimeSeconds:F2} s; "
            + $"approach {sawApproachMode}; deck ({finalAlong:F0}, {finalCross:F1}, "
            + $"{finalHeight:F1}) m; IAS {IndicatedAirspeedKts(session):F1}; "
            + $"gamma {session.Player.State.Gamma * 57.2958:F2}deg; "
            + $"throttle {session.Controls.Throttle:F2}; "
            + $"score {session.MaintenanceScenario.Score}/100");
        _output.WriteLine($"GROOVE GATE: {gateSnapshot}");

        Assert.Equal(session.PlayerSystems.Profile.FullFlapDegrees,
            session.PlayerSystems.LeftFlapDegrees, precision: 6);
        Assert.True(sawApproachMode, "the configured test-card leg never entered the groove");
        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
        Assert.True(session.MaintenanceScenario.Recovered,
            $"mission ended in {session.MaintenanceScenario.State} at "
            + $"({finalAlong:F0}, {finalCross:F1}, {finalHeight:F1}) m");
        Assert.Equal(SortieOutcome.Victory, session.Outcome);
        Assert.Equal(100, session.MaintenanceScenario.Score);
    }

    [Fact]
    public void SameTickTerminalFactsCannotMoveTheEvidenceClockBackwards() {
        var systems = new AirframeSystems();
        var recovered = new F86EmergencyGearRecoveryScenario(systems);
        recovered.Begin(12.0);
        recovered.Step(12.0);

        Exception? recoveryError = Record.Exception(() => recovered.RecordRecovered(12.0));

        var lost = new F86EmergencyGearRecoveryScenario(new AirframeSystems());
        lost.Begin(31.5);
        lost.Step(31.5);
        Exception? lossError = Record.Exception(() => lost.RecordAircraftLost(31.5));

        Assert.Null(recoveryError);
        Assert.Null(lossError);
        Assert.True(recovered.Recovered);
        Assert.True(lost.AircraftLost);
    }
}
