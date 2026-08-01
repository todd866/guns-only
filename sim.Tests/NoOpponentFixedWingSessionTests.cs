using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Contract for a fixed-wing mission which deliberately has no opponent. Card 11 is the first
/// production consumer: its aircraft, launcher, mission systems and recovery remain live, while
/// the opponent actor and both sides of the combat graph do not exist.
/// </summary>
public sealed class NoOpponentFixedWingSessionTests {
    static SimulationSession StageCircuits() => new(
        beatIndex: 11,
        deckConfiguration: Carrier.DeckConfiguration.Angled,
        weather: KoreaWeatherPresets.ForBeat(11));

    [Fact]
    public void RapierCircuitsStagesNoActorWeaponsOrOpponentIdentity() {
        BeatSetup card = Beats.RapierCircuits();
        Assert.Equal(OpponentPresence.None, card.OpponentPresence);
        Assert.Null(card.InitialOpponent);
        ScriptedInterceptConfig intercept = Assert.IsType<ScriptedInterceptConfig>(
            card.ScriptedIntercept);
        Assert.True(intercept.PatternOnly);
        Assert.Equal(0, intercept.FormationSize);
        Assert.Equal("NO_ENGAGEMENT_PATTERN_ONLY",
            card.MissionIdentity.RulesOfEngagement);

        SimulationSession session = StageCircuits();

        Assert.Equal(SimulationSession.LifecycleState.Ready, session.Lifecycle);
        Assert.False(session.OpponentPresent);
        Assert.Throws<InvalidOperationException>(() => session.Bandit);
        Assert.Throws<InvalidOperationException>(() => session.PlayerGun);
        Assert.Throws<InvalidOperationException>(() => session.OpponentGun);
        Assert.Equal(1, session.PlayerSpawnSequence);
        Assert.Equal(1, session.CarrierSpawnSequence);
        Assert.Equal(0, session.BanditSpawnSequence);
        Assert.Equal(0, session.LiveOpponentCount);
        Assert.Empty(session.Wingmen);
        Assert.Empty(session.DetachedOpponentWrecks);
        Assert.False(session.SelectedOpponentAlive);
        Assert.False(session.PrimaryOpponentAlive);
        Assert.Equal(0.0, session.SelectedOpponentHealth);
        Assert.Equal(0.0, session.PrimaryOpponentHealth);
        Assert.Equal(AircraftTerminalState.Settled, session.OpponentTerminalState);
        Assert.False(session.OpponentBodyPresent);
        Assert.False(session.TerminalPhaseActive);
        Assert.Equal(0.0, session.ClosureKts);
        Assert.True(session.WeaponsInhibited);
        Assert.False(session.PlayerWeaponsAuthorized);
        Assert.False(session.OpponentTriggerDown);
        Assert.Equal(default, session.AiWorkload);
        Assert.Equal(0, session.Decisions.Count);
        Assert.Equal(0, session.EngagementNumber);
        Assert.Empty(session.EngagementReports);
    }

    [Fact]
    public void PoweredTicksAdvancePlayerMissionNavigationAndRecoveryWithoutCombat() {
        SimulationSession first = StageCircuits();
        SimulationSession replay = StageCircuits();
        Assert.True(first.TrySetRecoveryProcedure(
            (int)RecoveryProcedureKind.Overhead));
        Assert.True(replay.TrySetRecoveryProcedure(
            (int)RecoveryProcedureKind.Overhead));

        AircraftState stagedPlayer = first.Player.State;
        double stagedFuelLb = first.PlayerFuel.FuelLb;
        Assert.True(first.MeshNav.HomePlate.HasValue);
        string homePlateId = first.MeshNav.HomePlate.Value.PlaceId;

        first.Begin();
        replay.Begin();

        Assert.Equal(SimulationSession.LifecycleState.Active, first.Lifecycle);
        Assert.Equal(SimulationSession.LifecycleState.Active, replay.Lifecycle);
        Assert.True(first.Catapult.IsActive);
        Assert.True(first.RapierMissionAvailable);
        Assert.True(first.RapierAutomationEnabled);
        Assert.Equal(MeshNavTransitMode.OpenSegment, first.MeshNav.Mode);
        Assert.Equal(homePlateId, first.MeshNav.Active?.PlaceId);
        Assert.Equal(RecoveryProcedureKind.Overhead,
            first.RecoveryProcedure.Kind);
        Assert.NotEmpty(first.RecoveryProcedure.Gates);

        const int ticks = 24;
        first.StepFixed(ticks);
        replay.StepFixed(ticks);

        Assert.Equal(ticks, first.Tick);
        Assert.Equal(ticks * SimulationSession.FixedDeltaSeconds,
            first.TimeSeconds, precision: 12);
        Assert.Equal(first.Tick, replay.Tick);
        Assert.Equal(first.TimeMilliseconds, replay.TimeMilliseconds);
        Assert.Equal(first.Player.State, replay.Player.State);
        Assert.Equal(first.PlayerFuel.FuelLb, replay.PlayerFuel.FuelLb);
        Assert.Equal(first.PlayerFuel.BurnLbPerMinute,
            replay.PlayerFuel.BurnLbPerMinute);
        Assert.Equal(first.PlayerSystems.UtilityHydraulicPressureFraction,
            replay.PlayerSystems.UtilityHydraulicPressureFraction);

        Assert.NotEqual(stagedPlayer.Position, first.Player.State.Position);
        Assert.True(first.Player.LastEngineOperatingPoint.NetThrustN > 0.0);
        Assert.True(first.PlayerFuel.ConsumesFuel);
        Assert.True(first.PlayerFuel.FuelLb < stagedFuelLb);
        Assert.True(first.PlayerSystemsSimulated);
        Assert.True(first.PlayerSystems.UtilityHydraulicSystemAvailable);
        Assert.NotEqual(RapierMissionPhase.Unavailable, first.RapierPhase);
        Assert.NotEmpty(first.RapierMissionCue);
        Assert.Equal(homePlateId, first.MeshNav.HomePlate?.PlaceId);
        Assert.Equal(homePlateId, first.MeshNav.Active?.PlaceId);
        Assert.Equal(RecoveryProcedureKind.Overhead,
            first.RecoveryProcedure.Kind);
        Assert.NotEmpty(first.RecoveryProcedure.Gates);

        Assert.False(first.OpponentPresent);
        Assert.Equal(0, first.BanditSpawnSequence);
        Assert.Equal(0, first.LiveOpponentCount);
        Assert.Empty(first.Wingmen);
        Assert.Equal(default, first.AiWorkload);
        Assert.Equal(0, first.Decisions.Count);
        Assert.Equal(0, first.EngagementNumber);
        Assert.Empty(first.EngagementReports);
        Assert.Equal(0, first.ShotsTotal);
        Assert.Equal(0, first.KillCount);
        Assert.Equal(0, first.PlayerHitsTaken);
        Assert.False(first.OpponentTriggerDown);
        Assert.Null(first.ActiveRapierGunDrone);
        Assert.DoesNotContain(first.RecentEvents, item =>
            item.Type == SessionEventType.OpponentSpawned
            || item.Source == CombatRole.Opponent
            || item.Target == CombatRole.Opponent);
    }
}
