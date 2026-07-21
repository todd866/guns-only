using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

public class AutoGcasSessionTests {
    static ITerrainSurface FlatTerrain(double heightM = 0.0) =>
        new BilinearHeightGrid(-10_000.0, -10_000.0, 10_000.0, 10_000.0,
            new double[,] {
                { heightM, heightM, heightM },
                { heightM, heightM, heightM },
                { heightM, heightM, heightM }
            });

    static AircraftState ModernState(double altitudeM, double gammaDegrees = 0.0,
        double bankDegrees = 0.0) => new(
            new Vec3D(0.0, altitudeM, 0.0),
            250.0,
            gammaDegrees * Math.PI / 180.0,
            0.0,
            bankDegrees * Math.PI / 180.0,
            FlightModel.F22APublicDataSurrogate.MassKg);

    static BeatSetup ModernTestBeat(AircraftState player,
        PilotPhysiologyProfile? physiology = null) => new(
            "Auto-GCAS integration test",
            Player: player,
            Bandit: new AircraftState(new Vec3D(4000.0, 3000.0, 4000.0),
                220.0, 0.0, Math.PI, 0.0,
                FlightModel.Su27SPublicDataSurrogate.MassKg),
            Law: new PurePursuitLaw(),
            BanditTimeline: new() {
                (0.0, new PilotCommand(1.0, 0.0, 0.8, 0.0))
            },
            PlayerParams: FlightModel.F22APublicDataSurrogate,
            BanditParams: FlightModel.Su27SPublicDataSurrogate,
            PlayerCapability: AircraftCapability.F22ASurrogate,
            BanditCapability: AircraftCapability.Su27SSurrogate,
            PlayerPhysiologyProfile: physiology
                ?? PilotPhysiologyProfile.ModernFastJetReference);

    static PilotPhysiologyProfile FastBlackoutProfile() {
        PilotConstitutionProfile pilot =
            PilotConstitutionProfile.ReferenceTrainedFastJet with {
                PositivePeripheralLossG = 1.20,
                PositiveBlackoutG = 1.30,
                PositiveLossOfConsciousnessG = 1.40,
                RetinalDepletionTimeSeconds = 0.05,
                CerebralDepletionTimeSeconds = 0.05,
                VisionRecovery90Seconds = 0.50,
                CerebralRecovery90Seconds = 0.80,
                AbsoluteIncapacitationSeconds = 0.35
            };
        return PilotPhysiologyProfile.UnprotectedReference with {
            Id = "physiology.test.auto-gcas-fast-blackout.v1",
            Pilot = pilot
        };
    }

    static SimulationSession ThreatSession(
        PilotPhysiologyProfile? physiology = null) {
        var session = new SimulationSession();
        session.StartBeat(() => ModernTestBeat(
            ModernState(170.0, gammaDegrees: -20.0), physiology));
        session.SetTerrainSurface(FlatTerrain());
        return session;
    }

    [Fact]
    public void AircraftCapabilityMakesAutoGcasModernOnly() {
        var sabre = new SimulationSession(1);
        var modern = new SimulationSession(7);

        Assert.False(sabre.PlayerAutoGcasCapability.Available);
        Assert.Equal(AutoGcasPhase.Unavailable, sabre.AutoGcas.Phase);
        Assert.True(modern.PlayerAutoGcasCapability.Available);
        Assert.Equal(AutoGcasPhase.Armed, modern.AutoGcas.Phase);
    }

    [Fact]
    public void PredictedTerrainThreatOverridesActuatorsAndInhibitsGuns() {
        var session = ThreatSession();
        session.Begin();
        session.FeedKey(GKey.Trigger, true);

        session.StepFixed();

        Assert.True(session.AutoGcas.Active);
        Assert.Equal(1, session.AutoGcas.ActivationCount);
        Assert.Equal(5.0, session.Player.LastAppliedCommand.GDemand, 12);
        Assert.Equal(0.0, session.Player.LastAppliedCommand.BankTarget, 12);
        Assert.False(session.Player.LastAppliedCommand.EnvelopeOverride);
        Assert.False(session.PlayerWeaponsAuthorized);
        Assert.Equal(0, session.PlayerGun.RoundsFired);
    }

    [Fact]
    public void TerrainPredictionRunsAtFlightComputerCadenceWhileRecoveryRemainsContinuous() {
        var session = ThreatSession();
        session.Begin();

        for (int tick = 0; tick < AircraftSim.TickHz; tick++) session.StepFixed();

        Assert.Equal((int)(AircraftSim.TickHz
            / SimulationSession.AutoGcasPredictionIntervalTicks),
            session.AutoGcasPredictionEvaluationCount);
        Assert.True(session.AutoGcas.Active);
        Assert.Equal(5.0, session.Player.LastAppliedCommand.GDemand, 12);
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
    }

    [Fact]
    public void BankedFlyUpCapturesUprightWithoutRepeatedAobHunting() {
        var session = new SimulationSession();
        session.StartBeat(() => ModernTestBeat(
            ModernState(170.0, gammaDegrees: -20.0, bankDegrees: 90.0)));
        session.SetTerrainSurface(FlatTerrain());
        session.Begin();

        bool captured = false;
        int commandReversalsAfterCapture = 0;
        int previousCommandSign = 0;
        double maximumBankAfterCaptureDegrees = 0.0;
        for (int tick = 0; tick < 4 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying; tick++) {
            session.StepFixed();
            double bankDegrees = Math.Abs(session.Player.State.Bank) * 180.0 / Math.PI;
            if (bankDegrees <= 10.0) captured = true;
            if (captured) maximumBankAfterCaptureDegrees = Math.Max(
                maximumBankAfterCaptureDegrees, bankDegrees);

            double sas = session.Player.LastAppliedCommand.SasRollControl;
            int commandSign = Math.Abs(sas) < 0.05 ? 0 : Math.Sign(sas);
            if (captured && commandSign != 0) {
                if (previousCommandSign != 0 && commandSign != previousCommandSign)
                    commandReversalsAfterCapture++;
                previousCommandSign = commandSign;
            }
        }

        Assert.True(captured, "Auto-GCAS never captured wings-level during the fly-up.");
        Assert.InRange(commandReversalsAfterCapture, 0, 1);
        Assert.InRange(maximumBankAfterCaptureDegrees, 0.0, 15.0);
        Assert.InRange(Math.Abs(session.Player.State.Bank) * 180.0 / Math.PI, 0.0, 6.0);
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
    }

    [Fact]
    public void ProtectionTransitionsAreRetainedAtTheExactAuthorityTick() {
        var session = ThreatSession();
        session.Begin();

        session.StepFixed();

        SessionEvent activation = Assert.Single(session.RecentEvents,
            e => e.Type == SessionEventType.AutoGcasTransition);
        Assert.Equal(1, activation.Tick);
        Assert.Equal(CombatRole.Player, activation.Target);
        Assert.Equal(AutoGcasPhase.FlyUp, activation.AutoGcasPhase);
        Assert.Equal(AutoGcasInhibitReason.None,
            activation.AutoGcasInhibitReason);
        Assert.Equal("AUTO GCAS · FLYUP", activation.AutoGcasCue);
        Assert.Equal(1, activation.AutoGcasActivationCount);

        session.FeedKey(GKey.AutoGcasOverride, true);
        session.StepFixed();

        SessionEvent paddle = session.RecentEvents[^1];
        Assert.Equal(SessionEventType.AutoGcasTransition, paddle.Type);
        Assert.Equal(2, paddle.Tick);
        Assert.Equal(AutoGcasPhase.Inhibited, paddle.AutoGcasPhase);
        Assert.Equal(AutoGcasInhibitReason.PilotOverride,
            paddle.AutoGcasInhibitReason);
        Assert.Equal("GCAS PADDLE", paddle.AutoGcasCue);
        Assert.Equal(1, paddle.AutoGcasActivationCount);
        Assert.Equal(1, paddle.AutoGcasReleaseCount);
        Assert.Equal(1, paddle.AutoGcasOverrideCount);
    }

    [Fact]
    public void CommandedFlyUpPreventsThePredictedFlatTerrainContact() {
        var session = ThreatSession();
        session.Begin();

        for (int tick = 0; tick < 4 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying; tick++)
            session.StepFixed();

        Assert.True(session.AutoGcas.ActivationCount > 0);
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
        Assert.True(session.Player.State.Position.Y
            > session.PlayerAutoGcasCapability.Configuration.TerrainBufferM);
    }

    [Fact]
    public void PilotPaddleIsARealHeldOverrideAndIsCounted() {
        var session = ThreatSession();
        session.Begin();
        session.StepFixed();
        Assert.True(session.AutoGcas.Active);

        session.FeedKey(GKey.AutoGcasOverride, true);
        Assert.True(session.AutoGcasOverrideHeld);
        session.StepFixed();

        Assert.Equal(AutoGcasPhase.Inhibited, session.AutoGcas.Phase);
        Assert.Equal(AutoGcasInhibitReason.PilotOverride,
            session.AutoGcas.InhibitReason);
        Assert.Equal(1, session.AutoGcas.PilotOverrideCount);
        Assert.Equal(1, session.AutoGcas.ReleaseCount);
        Assert.False(session.AutoGcas.Active);
    }

    [Fact]
    public void AutoGcasRecoveryContinuesThroughActualGLocAndItsGFeedsPhysiology() {
        var session = ThreatSession(FastBlackoutProfile());
        session.Begin();

        bool overlapped = false;
        for (int tick = 0; tick < 2 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying; tick++) {
            session.StepFixed();
            if (session.AutoGcas.Active
                && session.PilotState == PilotOperationalState.GLoc) {
                overlapped = true;
                break;
            }
        }

        Assert.True(overlapped,
            "the aircraft recovery and pilot blackout must be independent state machines");
        Assert.Equal(1, session.PilotGLocCount);
        Assert.True(session.PilotPhysiologyState.NormalAccelerationG > 1.0,
            "actual fly-up acceleration must continue through the physiology model");
        Assert.True(session.PilotControlInterlocked);
        Assert.True(session.PilotTriggerInterlocked);
        Assert.Equal(5.0, session.Player.LastAppliedCommand.GDemand, 12);
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
    }
}
