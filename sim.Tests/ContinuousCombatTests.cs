using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class ContinuousCombatTests {
    static AircraftState ModernState(double z, double speed, double chi, double mass) => new(
        new Vec3D(0.0, 5486.4, z), speed, 0.0, chi, 0.0, mass);

    static BeatSetup CloseTailFixture(double replacementDelaySeconds = 0.5) {
        BeatSetup modern = Beats.ModernVisualMerge();
        return modern with {
            Player = ModernState(0.0, 300.0, 0.0,
                FlightModel.F22APublicDataSurrogate.MassKg),
            Bandit = ModernState(160.0, 285.0, 0.0,
                FlightModel.Su27SPublicDataSurrogate.MassKg),
            UsesNeutralMergeBandit = false,
            UsesReactiveBandit = false,
            VisualMergeEvaluation = null,
            Combat = new CombatConfig(
                PlayerAmmo: 60,
                OpponentAmmo: 13,
                PlayerHitsToDefeat: 3,
                OpponentHitsToDefeat: 1,
                PlayerGun: GunProfiles.M61A2PublicDataSurrogate,
                OpponentGun: GunProfiles.GSh301PublicDataSurrogate),
            ContinuousCombat = new ContinuousCombatConfig(replacementDelaySeconds)
        };
    }

    [Fact]
    public void MissionSevenStagesSuccessiveFairMergesWithoutRefillingOwnshipResources() {
        Assert.NotNull(Beats.ModernVisualMerge().ContinuousCombat);
        var session = new SimulationSession();
        session.StartBeat(() => CloseTailFixture());
        long firstSpawnSequence = session.BanditSpawnSequence;
        IBandit firstBandit = session.Bandit;
        double initialFuelLb = session.PlayerFuel.FuelLb;
        session.Begin();
        session.FeedKey(GKey.Trigger, true);

        for (int tick = 0; tick < 3 * AircraftSim.TickHz && session.KillCount == 0; tick++)
            session.StepFixed();

        Assert.Equal(1, session.KillCount);
        Assert.Equal(1, session.EngagementNumber);
        Assert.True(session.OpponentReplacementPending);
        Assert.True(session.TriggerDown);
        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
        Assert.Equal(SortieOutcome.None, session.Outcome);
        Assert.Equal(SortieOutcome.None, session.PendingOutcome);
        Assert.Equal(AircraftTerminalState.DestroyedAirborne,
            session.OpponentTerminalState);
        Assert.Equal(firstSpawnSequence, session.BanditSpawnSequence);

        int ammoAtSplash = session.PlayerGun.AmmoRemaining;
        int roundsAtSplash = session.PlayerGun.RoundsFired;
        GunKill firstPlayerGun = session.PlayerGun;
        session.FeedKey(GKey.Trigger, false);
        for (int tick = 0; tick < 2 * AircraftSim.TickHz
            && session.BanditSpawnSequence == firstSpawnSequence; tick++)
            session.StepFixed();

        Assert.Equal(firstSpawnSequence + 1, session.BanditSpawnSequence);
        Assert.Equal(2, session.EngagementNumber);
        Assert.False(session.OpponentReplacementPending);
        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
        Assert.Equal(AircraftTerminalState.Flying, session.OpponentTerminalState);
        Assert.False(session.TerminalPhaseActive);
        Assert.Equal(SortieOutcome.None, session.PendingOutcome);
        Assert.IsType<ReactiveBandit>(session.Bandit);
        Assert.Equal(285.0, session.Bandit.State.Speed, 8);
        Assert.InRange(Geometry.Range(session.Player.State, session.Bandit.State),
            3000.0, 3800.0);
        Assert.False(CameraSolver.GunWindow(session.Player.State, session.Bandit.State));

        Assert.NotSame(firstPlayerGun, session.PlayerGun);
        Assert.Equal(ammoAtSplash, session.PlayerGun.AmmoRemaining);
        Assert.Equal(roundsAtSplash, session.PlayerGun.RoundsFired);
        Assert.Equal(0, session.PlayerGun.HitCount);
        Assert.Equal(FightOutcome.Flying, session.PlayerGun.Outcome);
        Assert.Empty(session.PlayerGun.RoundsInFlight);
        Assert.Equal(13, session.OpponentGun.AmmoRemaining);
        Assert.Equal(0, session.OpponentGun.RoundsFired);
        Assert.True(session.PlayerFuel.FuelLb < initialFuelLb);

        DetachedOpponentWreck wreck = Assert.Single(session.DetachedOpponentWrecks);
        Assert.Equal(firstSpawnSequence, wreck.SpawnSequence);
        Assert.NotEqual(AircraftTerminalState.Flying, wreck.TerminalState);
        AircraftState detachedState = wreck.Aircraft;
        for (int tick = 0; tick < 10; tick++) session.StepFixed();
        Assert.NotEqual(detachedState, wreck.Aircraft);
        Assert.NotSame(firstBandit, session.Bandit);

        SessionEvent destroyed = Assert.Single(session.RecentEvents,
            e => e.Type == SessionEventType.Destroyed
                && e.Target == CombatRole.Opponent);
        SessionEvent spawned = Assert.Single(session.RecentEvents,
            e => e.Type == SessionEventType.OpponentSpawned);
        Assert.True(destroyed.Sequence < spawned.Sequence);
        Assert.Equal(firstSpawnSequence, destroyed.EntitySequence);
        Assert.Equal(firstSpawnSequence + 1, spawned.EntitySequence);
        Assert.Equal(2, spawned.Count);
        Assert.True(destroyed.HasKinematics);
        Assert.True(spawned.HasKinematics);
    }

    [Fact]
    public void OwnshipLossDuringReplacementDelayCancelsTheSuccessor() {
        static AircraftState State(double z, double chi) => new(
            new Vec3D(0.0, 3000.0, z), 170.0, 0.0, chi, 0.0,
            FlightModel.Sabre.MassKg);
        var setup = new BeatSetup(
            "Continuous mutual-loss fixture",
            State(-90.0, 0.0),
            State(90.0, Math.PI),
            new PurePursuitLaw(),
            new() { (0.0, new PilotCommand(1.0, 0.0, 0.85, 0.0)) },
            Combat: new CombatConfig(
                PlayerAmmo: 20,
                OpponentAmmo: 20,
                PlayerHitsToDefeat: 2,
                OpponentHitsToDefeat: 2),
            ContinuousCombat: new ContinuousCombatConfig(0.25));
        var session = new SimulationSession();
        session.StartBeat(() => setup);
        long firstSpawnSequence = session.BanditSpawnSequence;
        session.Begin();
        session.FeedKey(GKey.Trigger, true);

        for (int tick = 0; tick < 3 * AircraftSim.TickHz
            && (session.PlayerTerminalState == AircraftTerminalState.Flying
                || session.OpponentTerminalState == AircraftTerminalState.Flying); tick++)
            session.StepFixed();

        Assert.NotEqual(AircraftTerminalState.Flying, session.PlayerTerminalState);
        Assert.NotEqual(AircraftTerminalState.Flying, session.OpponentTerminalState);
        Assert.False(session.OpponentReplacementPending);
        Assert.Equal(SortieOutcome.Draw, session.PendingOutcome);
        for (int tick = 0; tick < AircraftSim.TickHz; tick++) session.StepFixed();
        Assert.Equal(firstSpawnSequence, session.BanditSpawnSequence);
        Assert.DoesNotContain(session.RecentEvents,
            e => e.Type == SessionEventType.OpponentSpawned);
    }

    [Fact]
    public void OpponentFlownIntoTheSurfaceIsCreditedAsAManeuverKill() {
        // BFM parlance: an opponent maneuvered into the ground while the player is alive and
        // engaged is the player's kill. The physical Impact event keeps source None, but the
        // Destroyed attribution and the kill counter belong to the player — Build 68 telemetry
        // showed two bandits dying to terrain with no credit and no attribution.
        BeatSetup setup = CloseTailFixture(replacementDelaySeconds: 0.5);
        setup = setup with {
            Bandit = new AircraftState(new Vec3D(0.0, 120.0, 900.0), 250.0,
                -0.6, 0.0, 0.0, FlightModel.Su27SPublicDataSurrogate.MassKg)
        };
        var session = new SimulationSession();
        session.StartBeat(() => setup);
        session.Begin();

        for (int tick = 0; tick < 3 * AircraftSim.TickHz
            && session.OpponentTerminalState == AircraftTerminalState.Flying; tick++)
            session.StepFixed();

        Assert.Equal(0, session.PlayerGun.RoundsFired);
        Assert.NotEqual(AircraftTerminalState.Flying, session.OpponentTerminalState);
        Assert.Equal(1, session.KillCount);
        Assert.Contains(session.RecentEvents, e => e.Type == SessionEventType.Impact
            && e.Target == CombatRole.Opponent && e.Source == CombatRole.None);
        Assert.Contains(session.RecentEvents, e => e.Type == SessionEventType.Destroyed
            && e.Target == CombatRole.Opponent && e.Source == CombatRole.Player);
        Assert.True(session.OpponentReplacementPending,
            "a maneuver kill in continuous combat must stage the next merge");
        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
    }
}
