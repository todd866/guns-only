using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class NeutralMergeSpawnSpecTests {
    const double Dt = 1.0 / AircraftSim.TickHz;

    static AircraftState CompleteFirstPass(
        BeatSetup beat, NeutralMergeBandit merge) {
        var player = new AircraftSim(beat.Player, beat.PlayerAir);
        var straight = new PilotCommand(1.0, 0.0, 1.0, 0.0);
        for (int tick = 0;
            tick < 40 * AircraftSim.TickHz && !merge.FirstPassComplete;
            tick++) {
            merge.Step(ActorObservation.Capture(player.State, tick), Dt);
            player.Step(straight, Dt);
        }

        Assert.True(merge.FirstPassComplete,
            "the production neutral-merge geometry did not reach its reactive handoff");
        return player.State;
    }

    static ActorObservation MarginalShotFor(in AircraftState own) {
        const double angleRad = 2.5 * Math.PI / 180.0;
        const double rangeM = 500.0;
        Vec3D forward = own.ForwardDir();
        Vec3D right = new Vec3D(0.0, 1.0, 0.0).Cross(forward).Normalized();
        Vec3D line = forward * Math.Cos(angleRad) + right * Math.Sin(angleRad);
        Vec3D inbound = line * -1.0;
        double chi = Math.Atan2(inbound.X, inbound.Z);
        double gamma = Math.Asin(Math.Clamp(inbound.Y, -1.0, 1.0));
        var target = new AircraftState(
            own.Position + line * rangeM,
            250.0,
            gamma,
            chi,
            0.0,
            own.Mass);
        return ActorObservation.Capture(target);
    }

    static ActorObservation ForwardContactFor(in AircraftState own) {
        Vec3D position = own.Position + own.ForwardDir() * 1400.0;
        var target = new AircraftState(
            position,
            own.Speed,
            -own.Gamma,
            own.Chi + Math.PI,
            0.0,
            own.Mass);
        return ActorObservation.Capture(target);
    }

    [Fact]
    public void AuthoredOpeningWithoutADirectorSpecKeepsItsExistingDefaults() {
        BeatSetup beat = Beats.ModernVisualMerge();

        var merge = Assert.IsType<NeutralMergeBandit>(beat.CreateBandit());

        Assert.Equal(beat.BanditSkill, merge.BriefedSkill);
        Assert.Same(beat.BanditAir, merge.BriefedAircraftParameters);
        Assert.Equal(beat.Bandit.Mass, merge.State.Mass);
    }

    [Fact]
    public void DirectedOpeningUsesTheSelectedMountThroughTheHandoff() {
        BeatSetup beat = Beats.ModernVisualMerge();
        var spec = new SpawnSpec(
            PilotSkill.Veteran,
            DoctrineIndex: 0,
            Boss: false,
            Reason: "mount propagation regression",
            Mount: BanditMount.Uprated);

        var merge = Assert.IsType<NeutralMergeBandit>(
            beat.CreateBandit(spec: spec));

        Assert.Same(
            FlightModel.Su35SPublicDataSurrogate,
            merge.BriefedAircraftParameters);
        Assert.Equal(
            FlightModel.Su35SPublicDataSurrogate.MassKg,
            merge.State.Mass);

        CompleteFirstPass(beat, merge);

        Assert.Same(
            FlightModel.Su35SPublicDataSurrogate,
            merge.FightAircraftParameters);
        Assert.Equal(
            FlightModel.Su35SPublicDataSurrogate.MassKg,
            merge.State.Mass);
    }

    [Fact]
    public void DirectedMachineOpeningUsesItsPilotAndAirframeThroughTheHandoff() {
        BeatSetup beat = Beats.ModernVisualMerge();
        var spec = new SpawnSpec(
            PilotSkill.Machine,
            DoctrineIndex: 1,
            Boss: false,
            Reason: "machine propagation regression",
            Machine: true);

        var merge = Assert.IsType<NeutralMergeBandit>(
            beat.CreateBandit(spec: spec));

        Assert.Equal(PilotSkill.Machine, merge.BriefedSkill);
        Assert.Same(
            FlightModel.UcavInterceptorSurrogate,
            merge.BriefedAircraftParameters);
        Assert.Equal(
            FlightModel.UcavInterceptorSurrogate.MassKg,
            merge.State.Mass);

        CompleteFirstPass(beat, merge);

        Assert.Equal(PilotSkill.Machine, merge.FightSkill);
        Assert.Same(
            FlightModel.UcavInterceptorSurrogate,
            merge.FightAircraftParameters);
        Assert.Equal(
            FlightModel.UcavInterceptorSurrogate.MassKg,
            merge.State.Mass);
    }

    [Fact]
    public void DirectedBossOpeningKeepsTheStalkingFireGateAfterTheHandoff() {
        BeatSetup beat = Beats.ModernVisualMerge();
        var ordinary = Assert.IsType<NeutralMergeBandit>(
            beat.CreateBandit(spec: new SpawnSpec(
                PilotSkill.Ace, 0, false, "ordinary control")));
        var boss = Assert.IsType<NeutralMergeBandit>(
            beat.CreateBandit(spec: new SpawnSpec(
                PilotSkill.Ace, 0, true, "boss propagation regression")));

        CompleteFirstPass(beat, ordinary);
        CompleteFirstPass(beat, boss);
        Assert.Equal(ordinary.State, boss.State);

        ActorObservation marginal = MarginalShotFor(boss.State);
        Assert.True(ordinary.WantsToFire(marginal),
            "the ordinary Ace control must take the 2.5-degree shot");
        Assert.False(boss.WantsToFire(marginal),
            "the uncommitted boss must retain its tighter 1.8-degree gate");
    }

    [Fact]
    public void DirectedDoctrineIndexBiasesTheReactiveOpenerAfterTheHandoff() {
        BeatSetup beat = Beats.ModernVisualMerge();
        var neutral = Assert.IsType<NeutralMergeBandit>(
            beat.CreateBandit(spec: new SpawnSpec(
                PilotSkill.Ace, 0, false, "doctrine control")));
        var vertical = Assert.IsType<NeutralMergeBandit>(
            beat.CreateBandit(spec: new SpawnSpec(
                PilotSkill.Ace, 2, false, "doctrine propagation regression")));

        CompleteFirstPass(beat, neutral);
        CompleteFirstPass(beat, vertical);
        Assert.Equal(neutral.State, vertical.State);

        ActorObservation contact = ForwardContactFor(neutral.State);
        neutral.Step(contact, Dt);
        vertical.Step(contact, Dt);

        BanditDecisionTrace neutralTrace = neutral.DecisionTrace;
        BanditDecisionTrace verticalTrace = vertical.DecisionTrace;
        Assert.Equal(neutralTrace.CandidateAt(0).Score,
            verticalTrace.CandidateAt(0).Score, 8);
        Assert.Equal(240.0,
            verticalTrace.CandidateAt(2).Score
                - neutralTrace.CandidateAt(2).Score,
            8);
    }
}
