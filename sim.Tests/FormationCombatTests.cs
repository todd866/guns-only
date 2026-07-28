using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// 1v2. The pilot's design: "first fight is 1v2 and if I win that it stays that way", with numbers
/// easing back to a single opponent on a loss — the harshest axis, so the first one returned.
public class FormationCombatTests {
    readonly ITestOutputHelper _out;
    public FormationCombatTests(ITestOutputHelper output) => _out = output;

    [Fact]
    public void TheOpeningWaveIsAPairAndBothFlyAndShoot() {
        var session = new SimulationSession(7);
        session.Begin();

        Assert.Single(session.Wingmen);
        Assert.Equal(2, session.LiveOpponentCount);
        Wingman wingman = session.Wingmen[0];
        Assert.NotSame(session.Bandit, wingman.Bandit);

        var startPrimary = session.Bandit.State.Position;
        var startWingman = wingman.Bandit.State.Position;
        // They must not be stacked on top of each other — a formation the pilot has to split.
        double separationM = (startPrimary - startWingman).Length;
        Assert.InRange(separationM, 150.0, 12_000.0);

        for (int tick = 0; tick < 8 * AircraftSim.TickHz; tick++) session.StepFixed();

        // Both are genuinely being flown, not parked.
        Assert.True((session.Bandit.State.Position - startPrimary).Length > 500.0,
            "the primary never moved");
        Assert.True((wingman.Bandit.State.Position - startWingman).Length > 500.0,
            "the wingman never moved");
        _out.WriteLine(
            $"opening separation {separationM:F0} m; after 8 s primary moved "
            + $"{(session.Bandit.State.Position - startPrimary).Length:F0} m, wingman "
            + $"{(wingman.Bandit.State.Position - startWingman).Length:F0} m");
    }

    [Fact]
    public void BothOpponentsShareOneDamagePoolOnThePlayer() {
        var session = new SimulationSession(7);
        session.Begin();
        Assert.Equal(0, session.PlayerHitsTaken);

        // Two shooters must KILL the player together rather than each needing a full magazine's
        // worth of hits of their own.
        int hitsToDefeat = session.Beat.CombatRules.PlayerHitsToDefeat;
        for (int hit = 0; hit < hitsToDefeat - 1; hit++) {
            int before = session.OpponentGun.HitCount;
            ScoreOneSyntheticHit(session.OpponentGun);
            session.RecordPlayerHitsForTest(session.OpponentGun.HitCount - before);
        }
        Assert.True(session.PlayerAlive);
        Assert.Equal(1.0 / hitsToDefeat, session.PlayerHealth, 12);

        GunKill wingmanGun = session.Wingmen[0].Gun;
        int wingmanHitsBefore = wingmanGun.HitCount;
        ScoreOneSyntheticHit(wingmanGun);
        session.RecordPlayerHitsForTest(wingmanGun.HitCount - wingmanHitsBefore);
        session.StepFixed();

        Assert.Equal(hitsToDefeat, session.PlayerHitsTaken);
        Assert.Equal(0.0, session.PlayerHealth);
        Assert.False(session.PlayerAlive);
        Assert.NotEqual(AircraftTerminalState.Flying, session.PlayerTerminalState);
    }

    /// One death is the expected cost of a fight pitched near a 4:1 win rate, and the pilot noticed
    /// the moment it was over-rewarded: "when I restart after dying it's back to 1v1". The pair is
    /// the most interesting shape the ladder can serve, so it is the LAST thing surrendered — the
    /// tier steps down on every loss while the wingman survives the first one.
    [Fact]
    public void NumbersSurviveOneLossAndEaseOnTheSecond() {
        var director = new FightDirector();
        SpawnSpec opening = director.NextSpawn(1);
        Assert.Equal(2, opening.FormationSize);
        Assert.Equal(PilotSkill.Ace, opening.Skill);

        static EngagementReport Loss(int engagement, PilotSkill skill) => new(
            engagement, skill, OpponentWasBoss: false, SortieOutcome.Defeat,
            DurationSeconds: 40.0, SolutionSecondsConceded: 12.0, HitsTaken: 3,
            ShotsTotal: 8, ShotsInWindow: 1, Overshoots: 2,
            MinimumEnergyKias: 180.0, GcasActivations: 0);

        EngagementReport first = Loss(1, opening.Skill);
        director.Observe(in first);
        SpawnSpec afterOne = director.NextSpawn(2);
        Assert.Equal(2, afterOne.FormationSize);
        // The first death buys relief on the tier, not on the shape of the fight.
        Assert.True(afterOne.Skill < opening.Skill,
            "a defeat must ease something; the tier is what moves first");
        Assert.True(afterOne.Skill >= PilotSkill.Veteran,
            $"one loss stepped the tier too far: {afterOne.Skill}");

        EngagementReport second = Loss(2, afterOne.Skill);
        director.Observe(in second);
        SpawnSpec afterTwo = director.NextSpawn(3);
        Assert.Equal(1, afterTwo.FormationSize);
        // Two losses is genuine trouble and the ladder is allowed to give real ground, but it must
        // still be a ladder: never a free-fall straight back to the warm-up rung.
        Assert.True(afterTwo.Skill >= PilotSkill.Competent,
            $"two losses collapsed the ladder instead of stepping it: {afterTwo.Skill}");
    }

    [Fact]
    public void TheBossAndTheMachineSpikeArriveAlone() {
        var director = new FightDirector();
        Assert.Equal(1, director.FormationSizeFor(PilotSkill.Ace, boss: true));
        Assert.Equal(1, director.FormationSizeFor(PilotSkill.Machine, boss: false));
    }

    [Fact]
    public void KillingTheLeaderPromotesTheWingmanWithinTheSameEngagement() {
        var session = new SimulationSession(7);
        session.Begin();
        Assert.Equal(1, session.EngagementNumber);
        IBandit leader = session.Bandit;
        IBandit wingman = session.Wingmen[0].Bandit;

        // Take the leader out of the fight the way a gun result does.
        session.ForceOpponentDefeatForTest();
        for (int tick = 0; tick < 6 * AircraftSim.TickHz
            && ReferenceEquals(session.Bandit, leader); tick++)
            session.StepFixed();

        Assert.Same(wingman, session.Bandit);
        Assert.Empty(session.Wingmen);
        // Still ONE fight: a 1v2 is a single engagement and a single entry in the record.
        Assert.Equal(1, session.EngagementNumber);
        Assert.Equal(1, session.LiveOpponentCount);
        Assert.Null(session.LastEngagementReport);
    }

    [Fact]
    public void ForcedLeaderDefeatPromotesSurvivorImmediatelyWithoutTerminalDelay() {
        var session = new SimulationSession(7);
        session.Begin();
        IBandit leader = session.Bandit;
        IBandit survivor = session.Wingmen[0].Bandit;

        session.ForceOpponentDefeatForTest();

        Assert.NotSame(leader, session.Bandit);
        Assert.Same(survivor, session.Bandit);
        Assert.Empty(session.Wingmen);
        Assert.Equal(AircraftTerminalState.Flying, session.OpponentTerminalState);
        Assert.False(session.TerminalPhaseActive);
        Assert.False(session.OpponentReplacementPending);
        Assert.Equal(0.0, session.OpponentReplacementSeconds);
        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
    }

    [Fact]
    public void RetiringLeaderRoundSurvivesImmediatePromotionAndAdvancesNextTick() {
        var session = new SimulationSession(7);
        session.Begin();
        GunKill retiringGun = session.OpponentGun;
        GunRound launched = LaunchSyntheticMiss(retiringGun);

        Assert.Contains(launched, session.FormationOpponentRoundsInFlight);
        session.ForceOpponentDefeatForTest();

        Assert.NotSame(retiringGun, session.OpponentGun);
        Assert.False(session.TerminalPhaseActive);
        Assert.Contains(launched, session.FormationOpponentRoundsInFlight);
        Assert.Equal(launched, Assert.Single(retiringGun.RoundsInFlight));

        session.StepFixed();

        GunRound advanced = Assert.Single(retiringGun.RoundsInFlight);
        Assert.Equal(launched.Id, advanced.Id);
        Assert.Equal(
            launched.AgeSeconds + SimulationSession.FixedDeltaSeconds,
            advanced.AgeSeconds,
            12);
        Assert.True((advanced.Position - launched.Position).Length > 1.0);
        Assert.Contains(advanced, session.FormationOpponentRoundsInFlight);
    }

    [Fact]
    public void DestroyedWingmanRoundContinuesAdvancingAfterShooterIsLost() {
        var session = new SimulationSession(7);
        session.Begin();
        Wingman wingman = session.Wingmen[0];
        GunRound launched = LaunchSyntheticMiss(wingman.Gun);

        wingman.Bandit.ApplyCatastrophicDamage(handedness: -1);
        Assert.True(wingman.Bandit.CatastrophicallyDamaged);
        Assert.Contains(launched, session.FormationOpponentRoundsInFlight);

        session.StepFixed();

        Assert.True(wingman.Defeated);
        Assert.Equal(
            AircraftTerminalState.DestroyedAirborne,
            wingman.TerminalState);
        GunRound advanced = Assert.Single(wingman.Gun.RoundsInFlight);
        Assert.Equal(launched.Id, advanced.Id);
        Assert.Equal(
            launched.AgeSeconds + SimulationSession.FixedDeltaSeconds,
            advanced.AgeSeconds,
            12);
        Assert.True((advanced.Position - launched.Position).Length > 1.0);
        Assert.Contains(advanced, session.FormationOpponentRoundsInFlight);
    }

    [Fact]
    public void RealGunSplashDoesNotCarryOntoThePromotedWingman() {
        var session = new SimulationSession(7);
        session.Begin();
        IBandit leader = session.Bandit;
        IBandit wingman = session.Wingmen[0].Bandit;

        // Produce the same latched Splash state as a real ballistic kill. The synthetic geometry
        // keeps this regression deterministic while damage observation and promotion still travel
        // through the production fixed-tick lifecycle.
        var own = new AircraftState(
            Vec3D.Zero, 0.0, 0.0, 0.0, 0.0, FlightModel.F22APublicDataSurrogate.MassKg,
            QuaternionD.Identity);
        var target = own with { Position = new Vec3D(0.0, 0.0, 100.0) };
        Assert.True(session.SetPlayerGunTargetSlot(0));
        long leaderTargetId = session.PlayerGun.SelectedTargetId;
        var targets = new[] { new GunTarget(leaderTargetId, target) };
        for (int tick = 0; tick < AircraftSim.TickHz
            && session.PlayerGun.TargetAlive; tick++)
            session.PlayerGun.Step(
                true, own, leaderTargetId, targets,
                SimulationSession.FixedDeltaSeconds);
        Assert.Equal(FightOutcome.Splash, session.PlayerGun.Outcome);

        session.StepFixed();
        Assert.True(leader.CatastrophicallyDamaged);
        for (int tick = 0; tick < 6 * AircraftSim.TickHz
            && ReferenceEquals(session.Bandit, leader); tick++)
            session.StepFixed();

        Assert.Same(wingman, session.Bandit);
        Assert.Equal(FightOutcome.Flying, session.PlayerGun.Outcome);
        Assert.Equal(AircraftTerminalState.Flying, session.OpponentTerminalState);

        // The stale Splash used to kill the promoted aircraft on this first ordinary combat tick.
        session.StepFixed();

        Assert.False(wingman.CatastrophicallyDamaged);
        Assert.Equal(AircraftTerminalState.Flying, session.OpponentTerminalState);
        Assert.Equal(1, session.KillCount);
        Assert.Equal(1, session.LiveOpponentCount);
        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
    }

    [Fact]
    public void PlayerCanKillTheWingmanFirstWithoutDestroyingTheLeader() {
        var session = new SimulationSession(7);
        session.Begin();
        IBandit leader = session.Bandit;
        Wingman wingman = session.Wingmen[0];

        Assert.True(session.SetPlayerGunTargetSlot(1));
        Assert.Equal(1, session.SelectedPlayerGunTargetSlot);
        long wingmanTargetId = session.PlayerGun.SelectedTargetId;
        var own = new AircraftState(
            Vec3D.Zero, 0.0, 0.0, 0.0, 0.0,
            FlightModel.F22APublicDataSurrogate.MassKg,
            QuaternionD.Identity);
        var target = own with { Position = new Vec3D(0.0, 0.0, 100.0) };
        var targets = new[] { new GunTarget(wingmanTargetId, target) };
        for (int tick = 0; tick < AircraftSim.TickHz
            && session.PlayerGun.DamageFor(wingmanTargetId).TargetAlive; tick++)
            session.PlayerGun.Step(
                true, own, wingmanTargetId, targets,
                SimulationSession.FixedDeltaSeconds);

        Assert.Equal(
            FightOutcome.Splash,
            session.PlayerGun.DamageFor(wingmanTargetId).Outcome);
        session.StepFixed();

        Assert.True(wingman.Bandit.CatastrophicallyDamaged);
        Assert.False(leader.CatastrophicallyDamaged);
        Assert.Equal(AircraftTerminalState.Flying, session.OpponentTerminalState);
        Assert.Equal(1, session.LiveOpponentCount);
        Assert.Equal(1, session.KillCount);
        Assert.Equal(0, session.SelectedPlayerGunTargetSlot);
        Assert.Equal(FightOutcome.Flying, session.PlayerGun.Outcome);
    }

    [Fact]
    public void PromotedWingmanKeepsItsExistingDamageAndTheSamePhysicalGun() {
        var session = new SimulationSession(7);
        session.Begin();
        GunKill physicalGun = session.PlayerGun;
        IBandit leader = session.Bandit;
        IBandit survivor = session.Wingmen[0].Bandit;

        Assert.True(session.SetPlayerGunTargetSlot(1));
        long survivorTargetId = physicalGun.SelectedTargetId;
        var own = new AircraftState(
            Vec3D.Zero, 0.0, 0.0, 0.0, 0.0,
            FlightModel.F22APublicDataSurrogate.MassKg,
            QuaternionD.Identity);
        var target = own with { Position = new Vec3D(0.0, 0.0, 100.0) };
        var targets = new[] { new GunTarget(survivorTargetId, target) };
        physicalGun.Step(
            true, own, survivorTargetId, targets,
            SimulationSession.FixedDeltaSeconds);
        for (int tick = 0; tick < AircraftSim.TickHz
            && physicalGun.DamageFor(survivorTargetId).HitCount == 0; tick++)
            physicalGun.Step(
                false, own, survivorTargetId, targets,
                SimulationSession.FixedDeltaSeconds);
        Assert.Equal(1, physicalGun.DamageFor(survivorTargetId).HitCount);
        Assert.Equal(FightOutcome.Flying, physicalGun.DamageFor(survivorTargetId).Outcome);

        session.ForceOpponentDefeatForTest();
        for (int tick = 0; tick < 6 * AircraftSim.TickHz
            && ReferenceEquals(session.Bandit, leader); tick++)
            session.StepFixed();

        Assert.Same(survivor, session.Bandit);
        Assert.Same(physicalGun, session.PlayerGun);
        Assert.Equal(survivorTargetId, session.PlayerGun.SelectedTargetId);
        Assert.Equal(1, session.PlayerGun.HitCount);
        Assert.Equal(FightOutcome.Flying, session.PlayerGun.Outcome);
    }

    [Fact]
    public void PromotedWingmanHitsAreNotCountedTwiceAgainstThePlayer() {
        var session = new SimulationSession(7);
        session.Begin();
        IBandit leader = session.Bandit;
        Wingman wingman = session.Wingmen[0];

        ScoreOneSyntheticHit(wingman.Gun);
        Assert.Equal(1, wingman.Gun.HitCount);
        session.RecordPlayerHitsForTest(1);
        session.ForceOpponentDefeatForTest();
        for (int tick = 0; tick < 6 * AircraftSim.TickHz
            && ReferenceEquals(session.Bandit, leader); tick++)
            session.StepFixed();

        Assert.Same(wingman.Gun, session.OpponentGun);
        int recordedHitEvents = session.RecentEvents
            .Where(e => e.Type == SessionEventType.Hit
                && e.Source == CombatRole.Opponent
                && e.Target == CombatRole.Player)
            .Sum(e => e.Count);
        Assert.Equal(recordedHitEvents, session.PlayerHitsTaken);
    }

    [Fact]
    public void LeaderHitsRemainInThePlayerLedgerAfterPromotion() {
        var session = new SimulationSession(7);
        session.Begin();
        IBandit leader = session.Bandit;

        ScoreOneSyntheticHit(session.OpponentGun);
        Assert.Equal(1, session.OpponentGun.HitCount);
        session.RecordPlayerHitsForTest(1);
        session.ForceOpponentDefeatForTest();
        for (int tick = 0; tick < 6 * AircraftSim.TickHz
            && ReferenceEquals(session.Bandit, leader); tick++)
            session.StepFixed();

        int recordedHitEvents = session.RecentEvents
            .Where(e => e.Type == SessionEventType.Hit
                && e.Source == CombatRole.Opponent
                && e.Target == CombatRole.Player)
            .Sum(e => e.Count);
        Assert.Equal(recordedHitEvents, session.PlayerHitsTaken);
        Assert.True(session.PlayerHitsTaken >= 1);
    }

    static GunRound LaunchSyntheticMiss(GunKill gun) {
        var shooter = new AircraftState(
            Vec3D.Zero, 0.0, 0.0, 0.0, 0.0,
            FlightModel.F22APublicDataSurrogate.MassKg,
            QuaternionD.Identity);
        var offAxisTarget = shooter with {
            Position = new Vec3D(1000.0, 0.0, 2500.0)
        };
        int roundsBefore = gun.RoundsInFlight.Count;

        gun.Step(true, shooter, offAxisTarget, 0.0);

        Assert.Equal(roundsBefore + 1, gun.RoundsInFlight.Count);
        return gun.RoundsInFlight[^1];
    }

    static void ScoreOneSyntheticHit(GunKill gun) {
        int hitsBefore = gun.HitCount;
        var shooter = new AircraftState(
            Vec3D.Zero, 0.0, 0.0, 0.0, 0.0,
            FlightModel.F22APublicDataSurrogate.MassKg,
            QuaternionD.Identity);
        var target = shooter with { Position = new Vec3D(0.0, 0.0, 100.0) };
        gun.Step(true, shooter, target, SimulationSession.FixedDeltaSeconds);
        for (int tick = 0; tick < AircraftSim.TickHz
            && gun.HitCount == hitsBefore; tick++)
            gun.Step(false, shooter, target, SimulationSession.FixedDeltaSeconds);
        Assert.Equal(hitsBefore + 1, gun.HitCount);
    }
}
