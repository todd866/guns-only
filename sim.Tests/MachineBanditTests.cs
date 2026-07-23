using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

/// The 15 G machine (docs/robot-airframe-design.md): an uncrewed airframe whose G boundary is
/// structural, not physiological — honestly simulated, so the same aero that grants the corner
/// melts its energy. Corridor tests per the design doc's build order.
public class MachineBanditTests {
    const double Dt = 1.0 / AircraftSim.TickHz;
    static readonly AircraftParams Ucav = FlightModel.UcavInterceptorSurrogate;

    static AircraftState State(double x, double y, double z, double speed,
        double chi = 0.0, AircraftParams? air = null) =>
        new(new Vec3D(x, y, z), speed, 0.0, chi, 0.0, (air ?? Ucav).MassKg);

    [Fact]
    public void AirframeReachesFifteenGAtCombatSpeedsAndAltitude() {
        // 15 G must be aerodynamically reachable inside the ordinary fight band — the envelope
        // is real, not a label. q-limited NzAeroMax is the same law every airframe obeys.
        var atCorner = State(0.0, 3000.0, 0.0, 210.0);
        Assert.True(FlightModel.NzAeroMax(atCorner, Ucav) >= 15.0,
            $"NzAeroMax at 210 m/s / 3 km = {FlightModel.NzAeroMax(atCorner, Ucav):F1} G");
        Assert.Equal(15.0, Ucav.PositiveStructuralLimitG);
    }

    [Fact]
    public void SustainedMaxPerformTurningMeltsItsEnergy() {
        // The user's own counter-thesis, as a corridor: hold the corner pull and the drone's
        // thrust class cannot pay for it — speed collapses toward the vulnerability window.
        var sim = new AircraftSim(State(0.0, 3000.0, 0.0, 230.0), Ucav);
        double startSpeed = sim.State.Speed;
        for (int tick = 0; tick < 8 * AircraftSim.TickHz; tick++)
            sim.Step(new PilotCommand(15.0, 1.2, 1.0, 0.0), Dt);
        Assert.True(sim.State.Speed < startSpeed - 60.0,
            $"sustained 15 G must bleed energy hard: {startSpeed:F0} -> {sim.State.Speed:F0} m/s");
    }

    [Fact]
    public void MachineProfileIsThePostAceRung() {
        BanditSkillProfile machine = BanditSkillProfile.For(PilotSkill.Machine);
        BanditSkillProfile ace = BanditSkillProfile.For(PilotSkill.Ace);
        Assert.True(machine.MaxAcquireG > ace.MaxAcquireG);
        Assert.True(machine.LookaheadHorizonTicks > ace.LookaheadHorizonTicks);
        Assert.True(machine.EnergyRetentionWeight < ace.EnergyRetentionWeight,
            "the machine spends energy for angles; that trade IS its personality");
        Assert.Equal(1.0, ace.EnergyRetentionWeight);
    }

    [Fact]
    public void MachinePullsBeyondAnyHumanTierInTheSameGeometry() {
        // Same offensive geometry, same tick count: the machine's commanded G must exceed the
        // Ace's ceiling — through the ordinary lookahead, no scripted branch.
        // A fast beam-crossing target at close range: only a max-perform pull can track the
        // line-of-sight rate, so the scorer must reach for the envelope.
        var targetSim = new AircraftSim(State(650.0, 3000.0, 650.0, 280.0,
            chi: 1.9, air: FlightModel.Su35SPublicDataSurrogate),
            FlightModel.Su35SPublicDataSurrogate);
        var machine = new ReactiveBandit(
            State(0.0, 3000.0, 0.0, 240.0), Ucav, PilotSkill.Machine);
        double maxCommandedG = 0.0;
        for (int tick = 0; tick < 6 * AircraftSim.TickHz; tick++) {
            machine.Step(ActorObservation.Capture(targetSim.State, tick), Dt);
            targetSim.Step(new PilotCommand(3.0, 0.9, 0.95, 0.0), Dt);
            maxCommandedG = System.Math.Max(maxCommandedG, machine.LastCommand.GDemand);
        }
        Assert.True(maxCommandedG > 9.0,
            $"machine commanded only {maxCommandedG:F1} G — the envelope is not being used");
    }

    [Fact]
    public void MachineOutSolutionsTheAceAgainstTheReferencePlayer() {
        // Design-doc balance gate: the enemy solution ladder must extend monotonically past
        // Ace. Same seeded merge, frozen reference player, per-tier gun-window seconds.
        double SolutionSeconds(PilotSkill skill, AircraftParams air) {
            AircraftState playerStart = State(0.0, 4000.0, 0.0, 220.0,
                air: FlightModel.F22APublicDataSurrogate);
            ReactiveBandit reference = BfmDuel.ReferencePlayer(
                playerStart, FlightModel.F22APublicDataSurrogate);
            var bandit = ReactiveBandit.SpawnForMerge(
                playerStart, air, engagementNumber: 1, speedMps: 220.0, skill: skill);
            BfmDuelResult result = BfmDuel.Fly(reference, bandit, 40.0);
            return result.BSolutionSeconds;
        }

        double ace = SolutionSeconds(PilotSkill.Ace, FlightModel.Su35SPublicDataSurrogate);
        double machine = SolutionSeconds(PilotSkill.Machine, Ucav);
        Assert.True(machine > ace,
            $"machine={machine:F2}s must out-solution ace={ace:F2}s vs the reference player");
    }

    [Fact]
    public void MachineFlightIsBitDeterministic() {
        BanditDecisionTrace[] Fly() {
            var machine = new ReactiveBandit(
                State(0.0, 3000.0, 0.0, 240.0), Ucav, PilotSkill.Machine);
            var target = new AircraftSim(State(300.0, 3100.0, 2200.0, 250.0,
                chi: System.Math.PI, air: FlightModel.F22APublicDataSurrogate),
                FlightModel.F22APublicDataSurrogate);
            var traces = new List<BanditDecisionTrace>();
            long previous = 0;
            for (int tick = 0; tick < 5 * AircraftSim.TickHz; tick++) {
                machine.Step(ActorObservation.Capture(target.State, tick), Dt);
                target.Step(new PilotCommand(2.0, 0.4, 0.9, 0.0), Dt);
                if (machine.DecisionTrace.SelectionSequence != previous) {
                    previous = machine.DecisionTrace.SelectionSequence;
                    traces.Add(machine.DecisionTrace);
                }
            }
            return traces.ToArray();
        }

        Assert.Equal(Fly(), Fly());
    }

    [Fact]
    public void DirectorServesTheMachineWhenEnergyIsTheWeakestBand() {
        // Strong gunnery + defence, sloppy energy: the spike must arrive as the machine.
        var director = new FightDirector();
        for (int engagement = 1; engagement <= 4; engagement++) {
            SpawnSpec spawn = director.NextSpawn(engagement);
            Assert.False(spawn.Machine);
            var report = new EngagementReport(
                engagement, spawn.Skill, OpponentWasBoss: false,
                SortieOutcome.Victory, DurationSeconds: 60.0,
                SolutionSecondsConceded: 0.0, HitsTaken: 0,
                ShotsTotal: 4, ShotsInWindow: 4,
                Overshoots: 3,                    // repeatedly overshot (vs Veteran+ below)
                MinimumEnergyKias: 120.0,         // deep energy hole every fight
                GcasActivations: 0);
            director.Observe(in report);
        }

        SpawnSpec spike = director.NextSpawn(5);
        Assert.True(spike.Machine,
            $"energy-weak dominance must summon the machine (got {spike.Skill}: {spike.Reason})");
        Assert.Equal(PilotSkill.Machine, spike.Skill);
        Assert.False(spike.Boss);
        Assert.Contains("energy", spike.Reason, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(DirectorPhase.Boss, director.Phase);
    }

    [Fact]
    public void DirectorServesTheCatWhenEnergyIsNotTheGap() {
        var director = new FightDirector();
        for (int engagement = 1; engagement <= 4; engagement++) {
            SpawnSpec spawn = director.NextSpawn(engagement);
            var report = new EngagementReport(
                engagement, spawn.Skill, OpponentWasBoss: false,
                SortieOutcome.Victory, DurationSeconds: 60.0,
                SolutionSecondsConceded: 0.0, HitsTaken: 0,
                ShotsTotal: 4, ShotsInWindow: 4,
                Overshoots: 0,
                MinimumEnergyKias: 340.0,
                GcasActivations: 0);
            director.Observe(in report);
        }

        SpawnSpec spike = director.NextSpawn(5);
        Assert.True(spike.Boss);
        Assert.False(spike.Machine);
        Assert.Equal(PilotSkill.Ace, spike.Skill);
    }
}
