using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class LearnerModelTests {
    static EngagementReport Report(
        SortieOutcome outcome = SortieOutcome.Victory,
        PilotSkill opponentSkill = PilotSkill.Ace,
        bool boss = false,
        double durationSeconds = 60.0,
        double solutionSecondsConceded = 0.0,
        int hitsTaken = 0,
        int shotsTotal = 4,
        int shotsInWindow = 4,
        int overshoots = 0,
        double minimumEnergyKias = 340.0,
        int gcasActivations = 0,
        int engagementNumber = 1) => new(
            engagementNumber,
            opponentSkill,
            boss,
            outcome,
            durationSeconds,
            solutionSecondsConceded,
            hitsTaken,
            shotsTotal,
            shotsInWindow,
            overshoots,
            minimumEnergyKias,
            gcasActivations);

    static EngagementReport NoOpportunity(
        SortieOutcome outcome = SortieOutcome.Draw,
        double durationSeconds = 0.0) => Report(
            outcome: outcome,
            opponentSkill: PilotSkill.Novice,
            durationSeconds: durationSeconds,
            shotsTotal: 0,
            shotsInWindow: 0,
            minimumEnergyKias: double.PositiveInfinity);

    [Fact]
    public void FourDominantReportsReachDominantWithoutSkippingABand() {
        var learner = new LearnerModel();
        LearnerBands previous = learner.Bands;

        for (int engagement = 1; engagement <= 4; engagement++) {
            EngagementReport report = Report(engagementNumber: engagement);
            learner.Observe(in report);
            LearnerBands current = learner.Bands;

            Assert.InRange(Math.Abs((int)current.Gunnery - (int)previous.Gunnery), 0, 1);
            Assert.InRange(Math.Abs((int)current.Energy - (int)previous.Energy), 0, 1);
            Assert.InRange(Math.Abs((int)current.DefensiveBfm
                - (int)previous.DefensiveBfm), 0, 1);
            previous = current;
        }

        Assert.Equal(SkillBand.Dominant, learner.Bands.Gunnery);
        Assert.Equal(SkillBand.Dominant, learner.Bands.Energy);
        Assert.Equal(SkillBand.Dominant, learner.Bands.DefensiveBfm);
        Assert.Equal(SkillBand.Dominant, learner.Bands.Overall);
    }

    [Fact]
    public void OverallIsTheMedianOfTheThreeConceptBands() {
        Assert.Equal(SkillBand.Steady,
            new LearnerBands(
                SkillBand.Struggling,
                SkillBand.Dominant,
                SkillBand.Steady).Overall);
        Assert.Equal(SkillBand.Sharp,
            new LearnerBands(
                SkillBand.Dominant,
                SkillBand.Sharp,
                SkillBand.Struggling).Overall);
    }

    [Fact]
    public void ReportsWithoutAnOpportunityDoNotChangeBands() {
        var learner = new LearnerModel();
        LearnerBands before = learner.Bands;
        EngagementReport report = NoOpportunity();

        learner.Observe(in report);

        Assert.Equal(before, learner.Bands);
    }

    [Fact]
    public void OvershootDisciplineCountsOnlyAgainstVeteranOrAce() {
        var noviceLearner = new LearnerModel();
        EngagementReport novice = NoOpportunity() with {
            OpponentSkill = PilotSkill.Novice,
            Overshoots = 0,
        };
        noviceLearner.Observe(in novice);

        var veteranLearner = new LearnerModel();
        EngagementReport veteran = NoOpportunity() with {
            OpponentSkill = PilotSkill.Veteran,
            Overshoots = 0,
        };
        veteranLearner.Observe(in veteran);

        Assert.Equal(SkillBand.Steady, noviceLearner.Bands.Energy);
        Assert.Equal(SkillBand.Sharp, veteranLearner.Bands.Energy);
    }

    [Fact]
    public void BorderlineEvidenceDoesNotFlapAcrossTheSteadySharpBoundary() {
        var learner = new LearnerModel();

        for (int engagement = 1; engagement <= 8; engagement++) {
            bool highSide = engagement % 2 != 0;
            EngagementReport report = NoOpportunity() with {
                EngagementNumber = engagement,
                ShotsTotal = 10,
                ShotsInWindow = highSide ? 6 : 2,
            };
            learner.Observe(in report);

            Assert.Equal(SkillBand.Steady, learner.Bands.Gunnery);
        }
    }

    [Fact]
    public void SlidingWindowForgetsEvidenceOlderThanFourScoredReports() {
        var learner = new LearnerModel();
        EngagementReport weak = Report(
            outcome: SortieOutcome.Defeat,
            durationSeconds: 60.0,
            solutionSecondsConceded: 30.0,
            hitsTaken: 4,
            shotsTotal: 20,
            shotsInWindow: 0,
            overshoots: 3,
            minimumEnergyKias: 100.0,
            gcasActivations: 2);
        learner.Observe(in weak);
        Assert.Equal(SkillBand.Struggling, learner.Bands.Overall);

        for (int engagement = 2; engagement <= 5; engagement++) {
            EngagementReport dominant = Report(engagementNumber: engagement);
            learner.Observe(in dominant);
        }

        Assert.Equal(SkillBand.Dominant, learner.Bands.Overall);
    }

    [Fact]
    public void BossDefeatUpdatesRunContextButLeavesBandsUnchanged() {
        var learner = new LearnerModel();
        for (int engagement = 1; engagement <= 4; engagement++) {
            EngagementReport dominant = Report(
                durationSeconds: 70.0,
                engagementNumber: engagement);
            learner.Observe(in dominant);
        }
        LearnerBands beforeBoss = learner.Bands;
        Assert.Equal(4, learner.WinStreak);
        Assert.Equal(280.0, learner.SecondsSinceLastDefeat);

        EngagementReport bossDefeat = Report(
            outcome: SortieOutcome.Defeat,
            boss: true,
            durationSeconds: 35.0,
            solutionSecondsConceded: 35.0,
            hitsTaken: 10,
            shotsTotal: 30,
            shotsInWindow: 0,
            overshoots: 5,
            minimumEnergyKias: 80.0,
            gcasActivations: 4,
            engagementNumber: 5);
        learner.Observe(in bossDefeat);

        Assert.Equal(beforeBoss, learner.Bands);
        Assert.Equal(0, learner.WinStreak);
        Assert.Equal(1, learner.LossStreak);
        Assert.Equal(0.0, learner.SecondsSinceLastDefeat);
    }

    [Fact]
    public void VictoryAfterLossRestartsTheUnbeatenTimerAndStreak() {
        var learner = new LearnerModel();
        EngagementReport defeat = NoOpportunity(
            SortieOutcome.Defeat, durationSeconds: 25.0);
        learner.Observe(in defeat);
        EngagementReport victory = NoOpportunity(
            SortieOutcome.Victory, durationSeconds: 12.5);
        learner.Observe(in victory);

        Assert.Equal(1, learner.WinStreak);
        Assert.Equal(0, learner.LossStreak);
        Assert.Equal(12.5, learner.SecondsSinceLastDefeat);
    }

    [Fact]
    public void ResetAndReplayAreDeterministic() {
        EngagementReport[] history = {
            Report(engagementNumber: 1),
            Report(
                outcome: SortieOutcome.Defeat,
                durationSeconds: 20.0,
                solutionSecondsConceded: 8.0,
                hitsTaken: 2,
                shotsTotal: 7,
                shotsInWindow: 2,
                minimumEnergyKias: 210.0,
                engagementNumber: 2),
            Report(
                durationSeconds: 75.0,
                shotsTotal: 8,
                shotsInWindow: 5,
                minimumEnergyKias: 290.0,
                engagementNumber: 3),
        };
        var first = new LearnerModel();
        var second = new LearnerModel();

        foreach (EngagementReport item in history) {
            EngagementReport report = item;
            first.Observe(in report);
            second.Observe(in report);
        }

        Assert.Equal(first.Bands, second.Bands);
        Assert.Equal(first.WinStreak, second.WinStreak);
        Assert.Equal(first.LossStreak, second.LossStreak);
        Assert.Equal(first.SecondsSinceLastDefeat,
            second.SecondsSinceLastDefeat);

        first.Reset();
        Assert.Equal(new LearnerModel().Bands, first.Bands);
        Assert.Equal(0, first.WinStreak);
        Assert.Equal(0, first.LossStreak);
        Assert.Equal(0.0, first.SecondsSinceLastDefeat);
    }
}
