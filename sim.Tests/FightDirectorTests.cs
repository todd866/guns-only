using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class FightDirectorTests {
    static EngagementReport StrongReport(
        int engagementNumber,
        PilotSkill opponentSkill,
        SortieOutcome outcome = SortieOutcome.Victory,
        bool boss = false,
        double durationSeconds = 60.0) => new(
            engagementNumber,
            opponentSkill,
            boss,
            outcome,
            durationSeconds,
            SolutionSecondsConceded: 0.0,
            HitsTaken: 0,
            ShotsTotal: 4,
            ShotsInWindow: 4,
            Overshoots: 0,
            MinimumEnergyKias: 340.0,
            GcasActivations: 0);

    static EngagementReport WeakReport(
        int engagementNumber,
        PilotSkill opponentSkill) => new(
            engagementNumber,
            opponentSkill,
            OpponentWasBoss: false,
            SortieOutcome.Defeat,
            DurationSeconds: 60.0,
            SolutionSecondsConceded: 30.0,
            HitsTaken: 4,
            ShotsTotal: 20,
            ShotsInWindow: 0,
            Overshoots: 3,
            MinimumEnergyKias: 100.0,
            GcasActivations: 2);

    static SpawnSpec DriveToBoss(FightDirector director) {
        for (int engagement = 1; engagement <= 4; engagement++) {
            SpawnSpec ordinary = director.NextSpawn(engagement);
            Assert.False(ordinary.Boss);
            EngagementReport win = StrongReport(
                engagement, ordinary.Skill, durationSeconds: 60.0);
            director.Observe(in win);
        }

        return director.NextSpawn(5);
    }

    [Fact]
    public void ColdStartMatchesTheRealInterimTableAndDoctrineCounts() {
        var director = new FightDirector();

        for (int engagement = 1; engagement <= 10; engagement++) {
            SpawnSpec spawn = director.NextSpawn(engagement);
            PilotSkill expected = BanditSkillProfile.ForEngagement(engagement);
            int doctrineCount = BanditSkillProfile.For(expected).DoctrineCount;

            Assert.Equal(expected, spawn.Skill);
            Assert.Equal((engagement - 1) % doctrineCount, spawn.DoctrineIndex);
            Assert.False(spawn.Boss);
            Assert.False(string.IsNullOrWhiteSpace(spawn.Reason));
            Assert.Equal(DirectorPhase.Calm, director.Phase);
        }
    }

    [Fact]
    public void BuildMovesOnlyOneTierPerCompletedEngagement() {
        var descending = new FightDirector();
        EngagementReport firstLoss = WeakReport(1, PilotSkill.Ace);
        descending.Observe(in firstLoss);
        Assert.Equal(PilotSkill.Veteran, descending.NextSpawn(2).Skill);

        EngagementReport secondLoss = WeakReport(2, PilotSkill.Veteran);
        descending.Observe(in secondLoss);
        Assert.Equal(PilotSkill.Competent, descending.NextSpawn(3).Skill);

        EngagementReport thirdLoss = WeakReport(3, PilotSkill.Competent);
        descending.Observe(in thirdLoss);
        Assert.Equal(PilotSkill.Novice, descending.NextSpawn(4).Skill);

        var climbing = new FightDirector();
        EngagementReport noviceWin = StrongReport(
            1, PilotSkill.Novice, durationSeconds: 10.0);
        climbing.Observe(in noviceWin);
        Assert.Equal(PilotSkill.Competent, climbing.NextSpawn(2).Skill);

        EngagementReport competentWin = StrongReport(
            2, PilotSkill.Competent, durationSeconds: 10.0);
        climbing.Observe(in competentWin);
        Assert.Equal(PilotSkill.Veteran, climbing.NextSpawn(3).Skill);

        EngagementReport veteranWin = StrongReport(
            3, PilotSkill.Veteran, durationSeconds: 10.0);
        climbing.Observe(in veteranWin);
        Assert.Equal(PilotSkill.Ace, climbing.NextSpawn(4).Skill);
        Assert.Equal(DirectorPhase.Build, climbing.Phase);
    }

    [Fact]
    public void BossIsCommittedOnlyAtTheExactSpawnBoundaryThreshold() {
        var director = new FightDirector();

        for (int engagement = 1; engagement <= 4; engagement++) {
            SpawnSpec ordinary = director.NextSpawn(engagement);
            Assert.False(ordinary.Boss);
            EngagementReport win = StrongReport(
                engagement,
                ordinary.Skill,
                durationSeconds: 59.0);
            director.Observe(in win);
        }

        // Skill, streak, and four-fight cooldown are ready, but unbeaten time is still 236 s.
        SpawnSpec beforeTimeThreshold = director.NextSpawn(5);
        Assert.False(beforeTimeThreshold.Boss);
        Assert.Equal(DirectorPhase.Build, director.Phase);

        EngagementReport thresholdWin = StrongReport(
            5,
            beforeTimeThreshold.Skill,
            durationSeconds: 4.0);
        director.Observe(in thresholdWin);

        // Observe never counter-picks mid-fight. The phase changes only when the next spawn is
        // requested and all gates are evaluated at that boundary.
        Assert.Equal(DirectorPhase.Build, director.Phase);
        SpawnSpec boss = director.NextSpawn(6);

        Assert.True(boss.Boss);
        Assert.Equal(PilotSkill.Ace, boss.Skill);
        Assert.Equal(DirectorPhase.Boss, director.Phase);
        Assert.Contains("boss", boss.Reason, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("240s", boss.Reason, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(boss, director.NextSpawn(6));
    }

    [Fact]
    public void FourEngagementCooldownBlocksABossAtAThreeWinThreshold() {
        var director = new FightDirector();

        for (int engagement = 1; engagement <= 3; engagement++) {
            SpawnSpec ordinary = director.NextSpawn(engagement);
            EngagementReport win = StrongReport(
                engagement,
                ordinary.Skill,
                durationSeconds: 80.0);
            director.Observe(in win);
        }

        SpawnSpec fourth = director.NextSpawn(4);
        Assert.False(fourth.Boss);

        EngagementReport fourthWin = StrongReport(
            4, fourth.Skill, durationSeconds: 1.0);
        director.Observe(in fourthWin);
        Assert.True(director.NextSpawn(5).Boss);
    }

    [Fact]
    public void BossDefeatServesTwoReleaseEngagementsTwoTiersDown() {
        var director = new FightDirector();
        SpawnSpec boss = DriveToBoss(director);
        Assert.True(boss.Boss);

        EngagementReport bossDefeat = StrongReport(
            5,
            boss.Skill,
            outcome: SortieOutcome.Defeat,
            boss: true,
            durationSeconds: 20.0);
        director.Observe(in bossDefeat);
        Assert.Equal(DirectorPhase.Release, director.Phase);

        SpawnSpec firstRelease = director.NextSpawn(6);
        Assert.Equal(PilotSkill.Competent, firstRelease.Skill);
        Assert.False(firstRelease.Boss);
        Assert.Contains("release", firstRelease.Reason,
            StringComparison.OrdinalIgnoreCase);
        EngagementReport firstReleaseWin = StrongReport(
            6, firstRelease.Skill, durationSeconds: 20.0);
        director.Observe(in firstReleaseWin);
        Assert.Equal(DirectorPhase.Release, director.Phase);

        SpawnSpec secondRelease = director.NextSpawn(7);
        Assert.Equal(PilotSkill.Competent, secondRelease.Skill);
        EngagementReport secondReleaseWin = StrongReport(
            7, secondRelease.Skill, durationSeconds: 20.0);
        director.Observe(in secondReleaseWin);

        Assert.Equal(DirectorPhase.Build, director.Phase);
        Assert.Equal(PilotSkill.Veteran, director.NextSpawn(8).Skill);
    }

    [Fact]
    public void BeatingTheBossShortensReleaseToOneEngagement() {
        var director = new FightDirector();
        SpawnSpec boss = DriveToBoss(director);

        EngagementReport bossVictory = StrongReport(
            5,
            boss.Skill,
            outcome: SortieOutcome.Victory,
            boss: true,
            durationSeconds: 20.0);
        director.Observe(in bossVictory);

        SpawnSpec release = director.NextSpawn(6);
        Assert.Equal(PilotSkill.Competent, release.Skill);
        EngagementReport releaseWin = StrongReport(
            6, release.Skill, durationSeconds: 80.0);
        director.Observe(in releaseWin);

        Assert.Equal(DirectorPhase.Build, director.Phase);
        Assert.Equal(PilotSkill.Veteran, director.NextSpawn(7).Skill);
    }

    [Fact]
    public void BossCooldownCountsCompletedEngagementsSinceTheBoss() {
        var director = new FightDirector();
        SpawnSpec boss = DriveToBoss(director);
        EngagementReport bossVictory = StrongReport(
            5,
            boss.Skill,
            outcome: SortieOutcome.Victory,
            boss: true,
            durationSeconds: 20.0);
        director.Observe(in bossVictory);

        for (int engagement = 6; engagement <= 8; engagement++) {
            SpawnSpec ordinary = director.NextSpawn(engagement);
            Assert.False(ordinary.Boss);
            EngagementReport win = StrongReport(
                engagement, ordinary.Skill, durationSeconds: 80.0);
            director.Observe(in win);
        }

        SpawnSpec fourthSinceBoss = director.NextSpawn(9);
        Assert.False(fourthSinceBoss.Boss);
        EngagementReport fourthWin = StrongReport(
            9, fourthSinceBoss.Skill, durationSeconds: 80.0);
        director.Observe(in fourthWin);

        Assert.True(director.NextSpawn(10).Boss);
    }

    [Fact]
    public void TwoLossesEaseExactlyOneTierUntilAVictory() {
        var director = new FightDirector();
        for (int engagement = 1; engagement <= 4; engagement++) {
            SpawnSpec spawn = director.NextSpawn(engagement);
            EngagementReport win = StrongReport(
                engagement, spawn.Skill, durationSeconds: 10.0);
            director.Observe(in win);
        }

        SpawnSpec firstLossSpawn = director.NextSpawn(5);
        Assert.Equal(PilotSkill.Ace, firstLossSpawn.Skill);
        EngagementReport firstLoss = StrongReport(
            5,
            firstLossSpawn.Skill,
            outcome: SortieOutcome.Defeat,
            durationSeconds: 10.0);
        director.Observe(in firstLoss);
        Assert.Equal(PilotSkill.Ace, director.NextSpawn(6).Skill);

        EngagementReport secondLoss = StrongReport(
            6,
            PilotSkill.Ace,
            outcome: SortieOutcome.Defeat,
            durationSeconds: 10.0);
        director.Observe(in secondLoss);
        SpawnSpec eased = director.NextSpawn(7);
        Assert.Equal(PilotSkill.Veteran, eased.Skill);
        Assert.Contains("ease", eased.Reason, StringComparison.OrdinalIgnoreCase);

        EngagementReport thirdLoss = StrongReport(
            7,
            eased.Skill,
            outcome: SortieOutcome.Defeat,
            durationSeconds: 10.0);
        director.Observe(in thirdLoss);
        Assert.Equal(PilotSkill.Veteran, director.NextSpawn(8).Skill);

        EngagementReport recovery = StrongReport(
            8,
            PilotSkill.Veteran,
            outcome: SortieOutcome.Victory,
            durationSeconds: 10.0);
        director.Observe(in recovery);
        Assert.Equal(PilotSkill.Ace, director.NextSpawn(9).Skill);
    }

    [Fact]
    public void IdenticalHistoryProducesIdenticalSpawnSequence() {
        var first = new FightDirector();
        var second = new FightDirector();

        for (int engagement = 1; engagement <= 7; engagement++) {
            SpawnSpec firstSpawn = first.NextSpawn(engagement);
            SpawnSpec secondSpawn = second.NextSpawn(engagement);
            Assert.Equal(firstSpawn, secondSpawn);
            Assert.Equal(first.Phase, second.Phase);

            SortieOutcome outcome = firstSpawn.Boss
                ? SortieOutcome.Defeat
                : SortieOutcome.Victory;
            EngagementReport report = StrongReport(
                engagement,
                firstSpawn.Skill,
                outcome,
                firstSpawn.Boss,
                durationSeconds: 60.0);
            EngagementReport sameReport = report;
            first.Observe(in report);
            second.Observe(in sameReport);
        }
    }

    [Fact]
    public void ResetRestoresColdStart() {
        var director = new FightDirector();
        SpawnSpec boss = DriveToBoss(director);
        Assert.True(boss.Boss);

        director.Reset();

        Assert.Equal(DirectorPhase.Calm, director.Phase);
        for (int engagement = 1; engagement <= 5; engagement++) {
            SpawnSpec spawn = director.NextSpawn(engagement);
            Assert.Equal(BanditSkillProfile.ForEngagement(engagement), spawn.Skill);
            Assert.False(spawn.Boss);
        }
    }
}
