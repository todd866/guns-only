using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

public class PadlockRollAssistSessionTests {
    const double AltitudeM = 5486.4;
    const double DegreesToRadians = System.Math.PI / 180.0;

    static ITerrainSurface FlatTerrain(double heightM) =>
        new BilinearHeightGrid(-10_000.0, -10_000.0, 10_000.0, 10_000.0,
            new double[,] {
                { heightM, heightM, heightM },
                { heightM, heightM, heightM },
                { heightM, heightM, heightM }
            });

    static SimulationSession SessionWithPlaneError(double rollErrorDegrees) {
        AircraftParams f22 = FlightModel.F22APublicDataSurrogate;
        AircraftState player = new(
            Position: new Vec3D(0.0, AltitudeM, 0.0),
            Speed: 250.0,
            Gamma: 0.0,
            Chi: 0.0,
            Bank: 0.0,
            Mass: f22.MassKg,
            BodyAttitude: QuaternionD.Identity);
        double error = rollErrorDegrees * DegreesToRadians;
        double angleOff = 60.0 * DegreesToRadians;
        Vec3D direction = new(
            System.Math.Sin(angleOff) * System.Math.Sin(error),
            System.Math.Sin(angleOff) * System.Math.Cos(error),
            System.Math.Cos(angleOff));
        AircraftState bandit = new(
            Position: player.Position + direction * 5000.0,
            Speed: 250.0,
            Gamma: 0.0,
            Chi: 0.0,
            Bank: 0.0,
            Mass: FlightModel.Su27SPublicDataSurrogate.MassKg);
        BeatSetup beat = Beats.Perch() with {
            Name = "padlock roll assist integration",
            Player = player,
            Bandit = bandit,
            PlayerParams = f22,
            BanditParams = FlightModel.Su27SPublicDataSurrogate,
            PlayerCapability = AircraftCapability.F22ASurrogate,
            BanditCapability = AircraftCapability.Su27SSurrogate,
            PlayerPhysiologyProfile = PilotPhysiologyProfile.ModernFastJetReference,
            Combat = CombatConfig.ModernDroneDefense,
            BanditTimeline = new() {
                (0.0, new PilotCommand(1.0, 0.0, 1.0, 0.0))
            },
            InitialThrottle = 1.0
        };
        var session = new SimulationSession();
        session.StartBeat(() => beat);
        session.Begin();
        return session;
    }

    [Fact]
    public void SelectedTrackedBanditAddsOnlyBoundedSasAfterCapture() {
        SimulationSession session = SessionWithPlaneError(8.0);
        session.SetBanditPadlockRollAssist(true);

        for (int tick = 0; tick < 24; tick++) session.StepFixed();

        PadlockRollAssistState state = session.BanditPadlockRollAssist;
        Assert.True(state.Selected);
        Assert.True(state.GeometryValid);
        Assert.True(state.Captured);
        Assert.True(state.Active);
        Assert.True(state.SasRollControl > 0.0);
        Assert.InRange(state.SasRollControl, 0.0,
            PadlockRollAssist.MaximumSasRollControl);
        Assert.Equal(0.0, session.Controls.Command.SasRollControl, 12);
        Assert.Equal(0.0, session.Controls.Command.RollControl, 12);
        Assert.Equal(state.SasRollControl,
            session.Player.LastAppliedCommand.SasRollControl, 10);
        Assert.Equal(0.0, session.Player.LastAppliedCommand.RollControl, 12);
    }

    [Fact]
    public void DeselectionRemovesAssistOnTheNextFixedTick() {
        SimulationSession session = SessionWithPlaneError(8.0);
        session.SetBanditPadlockRollAssist(true);
        for (int tick = 0; tick < 24; tick++) session.StepFixed();
        Assert.True(session.BanditPadlockRollAssist.Active);

        session.SetBanditPadlockRollAssist(false);
        session.StepFixed();

        Assert.False(session.BanditPadlockRollAssist.Selected);
        Assert.False(session.BanditPadlockRollAssist.Active);
        Assert.Equal(0.0,
            session.Player.LastAppliedCommand.SasRollControl, 12);
    }

    [Fact]
    public void FullKeyboardRollOwnsTheAxisImmediately() {
        SimulationSession session = SessionWithPlaneError(8.0);
        session.SetBanditPadlockRollAssist(true);
        for (int tick = 0; tick < 24; tick++) session.StepFixed();
        Assert.True(session.BanditPadlockRollAssist.Active);

        session.FeedKey(GKey.RollLeft, true);
        session.StepFixed();

        Assert.Equal(-1.0, session.Player.LastAppliedCommand.RollControl, 12);
        Assert.Equal(0.0, session.Player.LastAppliedCommand.SasRollControl, 12);
        Assert.False(session.BanditPadlockRollAssist.Active);
        Assert.True(session.BanditPadlockRollAssist.Captured);
    }

    [Fact]
    public void DeliberateAnalogRollOwnsTheTotalAxisImmediately() {
        SimulationSession session = SessionWithPlaneError(8.0);
        session.SetBanditPadlockRollAssist(true);
        for (int tick = 0; tick < 24; tick++) session.StepFixed();
        Assert.True(session.BanditPadlockRollAssist.Active);

        session.SetAnalogRollControl(-0.29);
        session.StepFixed();

        PilotCommand applied = session.Player.LastAppliedCommand;
        Assert.Equal(-0.29, applied.RollControl, 12);
        Assert.True(applied.RollControl + applied.SasRollControl < 0.0);
        Assert.InRange(System.Math.Abs(applied.SasRollControl), 0.0, 0.002);
    }

    [Fact]
    public void AutoGcasFlyUpPreemptsAndClearsCapturedAssist() {
        SimulationSession session = SessionWithPlaneError(8.0);
        session.SetBanditPadlockRollAssist(true);
        for (int tick = 0; tick < 24; tick++) session.StepFixed();
        Assert.True(session.BanditPadlockRollAssist.Active);

        // Inside the STABLE-path 20 ft (6.1 m) protection floor: a gentle padlocked turn earns
        // the stable tier, so the old 10 m offset no longer arms the threat.
        session.SetTerrainSurface(FlatTerrain(
            session.Player.State.Position.Y - 4.0));
        for (int tick = 0; tick < SimulationSession.AutoGcasPredictionIntervalTicks
            && !session.AutoGcas.Active; tick++)
            session.StepFixed();

        Assert.True(session.AutoGcas.Active);
        Assert.Equal(AutoGcasConfiguration.ModernPublicDataSurrogate.RecoveryLoadFactorG,
            session.Player.LastAppliedCommand.GDemand, 12);
        Assert.False(session.BanditPadlockRollAssist.Active);
        Assert.False(session.BanditPadlockRollAssist.Captured);
        Assert.Equal(0.0, session.BanditPadlockRollAssist.SasRollControl, 12);
    }
}
