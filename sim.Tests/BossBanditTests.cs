using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

/// The honest cat: a stalking boss declines marginal shots (tight fire gate + energy reserve)
/// and rolls in only when a deterministic, observation-only commit trigger fires. Nothing here
/// throws a fight — the tease is refusal to gamble.
public class BossBanditTests {
    const double Dt = 1.0 / AircraftSim.TickHz;
    static readonly AircraftParams Air = FlightModel.F22APublicDataSurrogate;

    static AircraftState State(double x, double y, double z, double speed,
        double chi = 0.0) =>
        new(new Vec3D(x, y, z), speed, 0.0, chi, 0.0, Air.MassKg);

    static ReactiveBandit Boss(AircraftState initial,
        double? commitDominanceSeconds = null) {
        BanditSkillProfile profile = BanditSkillProfile.Boss();
        if (commitDominanceSeconds is { } seconds)
            profile = profile with { CommitDominanceSeconds = seconds };
        return new ReactiveBandit(initial, Air, PilotSkill.Ace,
            terrain: null, engagementNumber: 1, profile: profile);
    }

    [Fact]
    public void BossProfileIsAnAceWithATighterStalkGate() {
        BanditSkillProfile boss = BanditSkillProfile.Boss();
        BanditSkillProfile ace = BanditSkillProfile.For(PilotSkill.Ace);
        Assert.True(boss.IsBoss);
        Assert.True(boss.FireConeRad < ace.FireConeRad);
        Assert.Equal(ace.MaxAcquireG, boss.MaxAcquireG);
        Assert.Equal(ace.LookaheadHorizonTicks, boss.LookaheadHorizonTicks);
        Assert.False(ace.IsBoss);
    }

    [Fact]
    public void PlayerEnergyCollapseTripsTheCommit() {
        // Far behind the pounce range and ahead of the dominance clock: only trigger (a) can fire.
        var boss = Boss(State(0.0, 3000.0, 0.0, 200.0));
        var slowPlayer = ActorObservation.Capture(
            State(0.0, 3000.0, 2000.0, 120.0), 0);
        Assert.False(boss.BossCommitted);
        boss.Step(slowPlayer, Dt);
        Assert.True(boss.BossCommitted);

        var plainAce = new ReactiveBandit(State(0.0, 3000.0, 0.0, 200.0), Air,
            PilotSkill.Ace);
        plainAce.Step(slowPlayer, Dt);
        Assert.False(plainAce.BossCommitted);
    }

    [Fact]
    public void NoseOffInsidePounceRangeTripsTheCommit() {
        var boss = Boss(State(0.0, 3000.0, 0.0, 240.0));
        // Fast player (blocks a), flying directly away 800 m ahead (nose-off 180 deg < 1200 m).
        var fleeing = ActorObservation.Capture(
            State(0.0, 3000.0, 800.0, 250.0), 0);
        boss.Step(fleeing, Dt);
        Assert.True(boss.BossCommitted);
    }

    [Fact]
    public void SustainedDominanceTripsTheCommitOnTheClock() {
        // Range 1500 blocks (b); speed 150 blocks (a); behind-and-closing accrues the clock.
        var boss = Boss(State(0.0, 3000.0, 0.0, 240.0),
            commitDominanceSeconds: 1.0);
        var prey = ActorObservation.Capture(
            State(0.0, 3000.0, 1500.0, 150.0), 0);
        int ticksToCommit = 0;
        for (int tick = 0; tick < 3 * AircraftSim.TickHz && !boss.BossCommitted;
            tick++) {
            boss.Step(prey, Dt);
            ticksToCommit++;
        }
        Assert.True(boss.BossCommitted);
        Assert.True(ticksToCommit >= AircraftSim.TickHz,
            $"committed after only {ticksToCommit} ticks — the dominance clock did not gate");
    }

    [Fact]
    public void CommitLatchesForTheEngagement() {
        var boss = Boss(State(0.0, 3000.0, 0.0, 200.0));
        var slowPlayer = ActorObservation.Capture(
            State(0.0, 3000.0, 2000.0, 120.0), 0);
        boss.Step(slowPlayer, Dt);
        Assert.True(boss.BossCommitted);

        // A healthy, contesting player observation must not un-commit the cat.
        var recovered = ActorObservation.Capture(
            State(0.0, 3000.0, 2000.0, 280.0, chi: System.Math.PI), 1);
        for (int tick = 0; tick < AircraftSim.TickHz; tick++)
            boss.Step(recovered, Dt);
        Assert.True(boss.BossCommitted);
    }

    [Fact]
    public void StalkingBossDeclinesTheMarginalShotAPlainAceTakes() {
        // A marginal solution: nose error ~2.5 deg sits between the stalk gate (1.8 deg) and the
        // Ace gate (3.5 deg) at a valid firing range. The approaching, fast, nose-on target
        // blocks every commit trigger, so only the quality bar separates the two bandits.
        const double marginalRad = 2.5 * System.Math.PI / 180.0;
        const double rangeM = 500.0;
        AircraftState start = State(0.0, 3000.0, 0.0, 240.0);
        AircraftState targetState = State(
            rangeM * System.Math.Sin(marginalRad), 3000.0,
            rangeM * System.Math.Cos(marginalRad), 250.0,
            chi: System.Math.PI);

        var ace = new ReactiveBandit(start, Air, PilotSkill.Ace);
        var boss = Boss(start);
        var observation = ActorObservation.Capture(targetState, 0);
        ace.Step(observation, Dt);
        boss.Step(observation, Dt);

        double noseError = BanditFireControl.NoseErrorRad(boss.State, observation);
        Assert.InRange(noseError,
            BanditSkillProfile.Boss().FireConeRad,
            BanditSkillProfile.For(PilotSkill.Ace).FireConeRad);
        Assert.False(boss.BossCommitted);
        Assert.True(ace.WantsToFire(observation),
            "the plain Ace must take the marginal shot this test is built around");
        Assert.False(boss.WantsToFire(observation),
            "the stalking boss must decline the same marginal shot");

        // Commit the cat (energy collapse observation), then the same marginal shot is taken:
        // the roll-in restores the standard Ace gate, no wider.
        boss.Step(ActorObservation.Capture(
            State(0.0, 3000.0, 2000.0, 120.0), 1), Dt);
        Assert.True(boss.BossCommitted);
        Assert.True(boss.WantsToFire(observation),
            "a committed boss shoots with the standard Ace gate");
    }

    [Fact]
    public void PlainAceViaProfileOverrideMatchesTheLegacyConstructorTickForTick() {
        AircraftState start = State(0.0, 3000.0, 0.0, 220.0);
        var legacy = new ReactiveBandit(start, Air, PilotSkill.Ace);
        var overridden = new ReactiveBandit(start, Air, PilotSkill.Ace,
            terrain: null, engagementNumber: 1,
            profile: BanditSkillProfile.For(PilotSkill.Ace));
        var contact = new AircraftSim(
            State(400.0, 3100.0, 1800.0, 230.0, chi: -0.4), Air);

        for (int tick = 0; tick < 4 * AircraftSim.TickHz; tick++) {
            var observation = ActorObservation.Capture(contact.State, tick);
            legacy.Step(observation, Dt);
            overridden.Step(observation, Dt);
            contact.Step(new PilotCommand(1.4, 0.3, 0.9, 0.0), Dt);
            Assert.Equal(legacy.State, overridden.State);
            Assert.Equal(legacy.LastCommand, overridden.LastCommand);
            Assert.Equal(legacy.DecisionTrace, overridden.DecisionTrace);
        }
    }

    [Fact]
    public void BossFlightIsBitDeterministic() {
        BanditDecisionTrace[] Fly() {
            var boss = Boss(State(0.0, 3000.0, 0.0, 240.0));
            var target = new AircraftSim(
                State(80.0, 3020.0, 2600.0, 250.0, chi: System.Math.PI), Air);
            var traces = new List<BanditDecisionTrace>();
            long previous = 0;
            for (int tick = 0; tick < 6 * AircraftSim.TickHz; tick++) {
                boss.Step(ActorObservation.Capture(target.State, tick), Dt);
                target.Step(new PilotCommand(1.0, 0.0, 0.9, 0.0), Dt);
                if (boss.DecisionTrace.SelectionSequence != previous) {
                    previous = boss.DecisionTrace.SelectionSequence;
                    traces.Add(boss.DecisionTrace);
                }
            }
            return traces.ToArray();
        }

        Assert.Equal(Fly(), Fly());
    }
}
