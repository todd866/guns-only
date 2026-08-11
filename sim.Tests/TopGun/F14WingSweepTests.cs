using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests.TopGun;

public sealed class F14WingSweepTests
{
    [Fact]
    public void SweepIncreasesWithMach()
    {
        double slow = F14WingSweep.DegreesFor(mach: 0.5, casKts: 300);
        double fast = F14WingSweep.DegreesFor(mach: 1.2, casKts: 500);
        Assert.True(fast > slow);
    }

    [Fact]
    public void SweepClampsToPublishedEnvelope()
    {
        double min = F14WingSweep.DegreesFor(mach: 0.2, casKts: 150);
        double max = F14WingSweep.DegreesFor(mach: 1.4, casKts: 600);
        Assert.InRange(min, F14WingSweep.MinSweepDeg, F14WingSweep.MaxSweepDeg);
        Assert.InRange(max, F14WingSweep.MinSweepDeg, F14WingSweep.MaxSweepDeg);
        Assert.Equal(F14WingSweep.MinSweepDeg, min);
        Assert.Equal(F14WingSweep.MaxSweepDeg, max);
    }

    [Theory]
    [InlineData(TopGunSeat.F14A)]
    [InlineData(TopGunSeat.Mig28)]
    public void ReadyAndFixedTickSnapshotsMatchAppliedSpanForEitherSeat(TopGunSeat seat)
    {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.TopGunAcm(seat));

        AssertAppliedSweepMatchesSpan(session, seat);
        session.Begin();
        session.StepFixed();
        AssertAppliedSweepMatchesSpan(session, seat);
    }

    [Fact]
    public void OpponentTomcatPreservesAppliedSweepAcrossNeutralMergeHandoff()
    {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.TopGunAcm(TopGunSeat.Mig28));
        var merge = Assert.IsType<NeutralMergeBandit>(session.Bandit);
        session.Begin();

        const int MaximumMergeTicks = 45 * (int)AircraftSim.TickHz;
        for (int tick = 0; tick < MaximumMergeTicks && !merge.FirstPassComplete; tick++)
            session.StepFixed();

        Assert.True(merge.FirstPassComplete, "the authored neutral pass never reached its handoff");
        Assert.NotNull(session.OpponentF14WingSweepDegrees);
        double expectedSpan = TopGunFightRuntime.EffectiveTomcatWingSpanMForSweep(
            session.OpponentF14WingSweepDegrees.Value,
            session.Beat.BanditAir.WingSpanM);
        Assert.Equal(expectedSpan, session.OpponentEffectiveWingSpanM, precision: 10);
    }

    [Fact]
    public void OpponentTomcatLookaheadFreezesAndAppliesSweptSpanAcrossIncrementalCandidates()
    {
        AircraftParams air = FlightModel.F14APublicDataSurrogate;
        var own = new AircraftState(
            new Vec3D(0.0, 5486.4, 0.0), 300.0, 0.0, 0.0, 0.0, air.MassKg);
        var contact = new AircraftState(
            new Vec3D(0.0, 5486.4, 1800.0), 300.0, 0.0, 0.0, 0.6, air.MassKg);
        var bandit = new ReactiveBandit(
            own,
            air,
            PilotSkill.Competent,
            profile: BanditSkillProfile.For(PilotSkill.Competent) with {
                ManoeuvringFinisher = false
            });
        bandit.ConfigureAiPlanning(AiComputeLevel.Full, incremental: true);
        double sweptSpan = TopGunFightRuntime.EffectiveTomcatWingSpanMForSweep(
            F14WingSweep.MaxSweepDeg,
            air.WingSpanM);
        bandit.SetEffectiveWingSpanM(sweptSpan);

        bandit.Step(ActorObservation.Capture(contact, sourceTick: 0),
            1.0 / AircraftSim.TickHz);
        Assert.Equal(1, bandit.AiWorkload.PlansStarted);
        Assert.Equal(0, bandit.AiWorkload.PlansCompleted);
        Assert.Equal(sweptSpan,
            bandit.LastLookaheadProbeEffectiveWingSpanMForTest,
            precision: 10);

        long evaluationsBefore = bandit.AiWorkload.CandidateEvaluations;
        bandit.SetEffectiveWingSpanM(air.WingSpanM);
        bandit.Step(ActorObservation.Capture(contact, sourceTick: 1),
            1.0 / AircraftSim.TickHz);

        Assert.True(bandit.AiWorkload.CandidateEvaluations > evaluationsBefore);
        Assert.Equal(sweptSpan,
            bandit.LastLookaheadProbeEffectiveWingSpanMForTest,
            precision: 10);
        Assert.Equal(air.WingSpanM, bandit.EffectiveWingSpanM, precision: 10);

        for (long tick = 2;
            tick < ReactiveBandit.LookaheadDecisionCadenceTicks
                && bandit.AiWorkload.PlansCompleted == 0;
            tick++) {
            bandit.Step(ActorObservation.Capture(contact, sourceTick: tick),
                1.0 / AircraftSim.TickHz);
            Assert.Equal(sweptSpan,
                bandit.LastLookaheadProbeEffectiveWingSpanMForTest,
                precision: 10);
        }

        Assert.Equal(1, bandit.AiWorkload.PlansCompleted);
    }

    [Fact]
    public void LegacyDerivedSpanSentinelRemainsUntouchedAndCompletesIncrementalPlan()
    {
        AircraftParams air = FlightModel.AwacsTarget;
        Assert.Equal(-1.0, air.WingSpanM);
        var own = new AircraftState(
            new Vec3D(0.0, 5486.4, 0.0), 210.0, 0.0, 0.0, 0.0, air.MassKg);
        var contact = new AircraftState(
            new Vec3D(0.0, 5486.4, 1800.0), 230.0, 0.0, 0.0, 0.6, air.MassKg);
        var bandit = new ReactiveBandit(
            own,
            air,
            PilotSkill.Competent,
            profile: BanditSkillProfile.For(PilotSkill.Competent) with {
                ManoeuvringFinisher = false
            });
        bandit.ConfigureAiPlanning(AiComputeLevel.Full, incremental: true);

        for (long tick = 0;
            tick < ReactiveBandit.LookaheadDecisionCadenceTicks
                && bandit.AiWorkload.PlansCompleted == 0;
            tick++) {
            bandit.Step(ActorObservation.Capture(contact, sourceTick: tick),
                1.0 / AircraftSim.TickHz);
            Assert.Equal(
                BitConverter.DoubleToInt64Bits(air.WingSpanM),
                BitConverter.DoubleToInt64Bits(
                    bandit.LastLookaheadProbeEffectiveWingSpanMForTest));
        }

        Assert.Equal(1, bandit.AiWorkload.PlansStarted);
        Assert.Equal(1, bandit.AiWorkload.PlansCompleted);
        Assert.Equal(
            BitConverter.DoubleToInt64Bits(air.WingSpanM),
            BitConverter.DoubleToInt64Bits(bandit.EffectiveWingSpanM));
    }

    [Fact]
    public void NonBaselineInvalidFrozenSpanFailsClosed()
    {
        AircraftParams air = FlightModel.AwacsTarget;
        var own = new AircraftState(
            new Vec3D(0.0, 5486.4, 0.0), 210.0, 0.0, 0.0, 0.0, air.MassKg);
        var contact = new AircraftState(
            new Vec3D(0.0, 5486.4, 1800.0), 230.0, 0.0, 0.0, 0.6, air.MassKg);

        foreach (double invalidSpan in new[] {
            double.NaN,
            double.NegativeInfinity,
            double.PositiveInfinity,
            -2.0,
            0.0
        }) {
            var bandit = new ReactiveBandit(
                own,
                air,
                PilotSkill.Competent,
                profile: BanditSkillProfile.For(PilotSkill.Competent) with {
                    ManoeuvringFinisher = false
                });
            bandit.ConfigureAiPlanning(AiComputeLevel.Full, incremental: true);
            bandit.SetEffectiveWingSpanM(invalidSpan);

            Assert.Throws<InvalidOperationException>(() =>
                bandit.Step(ActorObservation.Capture(contact, sourceTick: 0),
                    1.0 / AircraftSim.TickHz));
        }
    }

    static void AssertAppliedSweepMatchesSpan(SimulationSession session, TopGunSeat seat)
    {
        bool playerTomcat = seat == TopGunSeat.F14A;
        double? sweep = playerTomcat
            ? session.PlayerF14WingSweepDegrees
            : session.OpponentF14WingSweepDegrees;
        double effectiveSpan = playerTomcat
            ? session.PlayerEffectiveWingSpanM
            : session.OpponentEffectiveWingSpanM;
        double baselineSpan = playerTomcat
            ? session.Beat.PlayerAir.WingSpanM
            : session.Beat.BanditAir.WingSpanM;

        Assert.NotNull(sweep);
        Assert.Equal(
            TopGunFightRuntime.EffectiveTomcatWingSpanMForSweep(sweep.Value, baselineSpan),
            effectiveSpan,
            precision: 10);
        Assert.Null(playerTomcat
            ? session.OpponentF14WingSweepDegrees
            : session.PlayerF14WingSweepDegrees);
    }
}
