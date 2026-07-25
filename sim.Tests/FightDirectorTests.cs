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

    // A CONTESTED win is one the player was genuinely in danger during: the bandit held a gun
    // solution on them for several seconds even though they took no hits. The ladder still climbs
    // one polite rung for these. Note this is deliberately NOT "a long fight" — a long fight the
    // bandit never threatened you in is still a walkover, which is the lesson from Build 102.
    static EngagementReport ContestedWin(
        int engagementNumber,
        PilotSkill opponentSkill,
        SortieOutcome outcome = SortieOutcome.Victory,
        bool boss = false) =>
        StrongReport(engagementNumber, opponentSkill, outcome, boss,
            durationSeconds: 90.0) with { SolutionSecondsConceded = 1.5 };

    [Fact]
    public void BuildMovesOnlyOneTierPerContestedEngagement() {
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
        EngagementReport noviceWin = ContestedWin(1, PilotSkill.Novice);
        climbing.Observe(in noviceWin);
        Assert.Equal(PilotSkill.Competent, climbing.NextSpawn(2).Skill);

        EngagementReport competentWin = ContestedWin(2, PilotSkill.Competent);
        climbing.Observe(in competentWin);
        Assert.Equal(PilotSkill.Veteran, climbing.NextSpawn(3).Skill);

        EngagementReport veteranWin = ContestedWin(3, PilotSkill.Veteran);
        climbing.Observe(in veteranWin);
        Assert.Equal(PilotSkill.Ace, climbing.NextSpawn(4).Skill);
        Assert.Equal(DirectorPhase.Build, climbing.Phase);
        Assert.Equal(0, climbing.WalkoverStreak);
    }

    // The pilot complaint this exists for: "I had a really easy time killing everybody." Untouched,
    // untouched kills must stop the ladder from walking up one rung at a time behind the player.
    [Fact]
    public void UntouchedUnthreatenedWinsPressTheLadderFasterThanOneRungPerFight() {
        var director = new FightDirector();

        // Fight 1 is still the forgiving warm-up: a cold start has no evidence to act on.
        Assert.Equal(PilotSkill.Novice, director.NextSpawn(1).Skill);
        EngagementReport first = StrongReport(
            1, PilotSkill.Novice, durationSeconds: 20.0);
        director.Observe(in first);
        Assert.Equal(1, director.WalkoverStreak);

        // One walkover is not yet evidence — the ladder still steps.
        Assert.Equal(PilotSkill.Competent, director.NextSpawn(2).Skill);
        EngagementReport second = StrongReport(
            2, PilotSkill.Competent, durationSeconds: 20.0);
        director.Observe(in second);

        // Two: commit straight to the player's estimated band instead of stepping toward it. Two
        // flawless fights already carry the band to Dominant, so this IS the ceiling — the player
        // meets an Ace on fight three rather than fight four, and only after proving they earned it.
        SpawnSpec pressed = director.NextSpawn(3);
        Assert.Equal(PilotSkill.Ace, pressed.Skill);
        Assert.Contains("walkover", pressed.Reason, StringComparison.OrdinalIgnoreCase);
        EngagementReport third = StrongReport(
            3, pressed.Skill, durationSeconds: 20.0);
        director.Observe(in third);

        // Three: the ceiling stays on the table; the ladder does not relax behind a dominant run.
        Assert.Equal(PilotSkill.Ace, director.NextSpawn(4).Skill);
    }

    [Fact]
    public void OneHitTakenEndsTheWalkoverStreakAndRestoresTheGentleRamp() {
        var director = new FightDirector();
        for (int engagement = 1; engagement <= 2; engagement++) {
            SpawnSpec spawn = director.NextSpawn(engagement);
            EngagementReport walkover = StrongReport(
                engagement, spawn.Skill, durationSeconds: 20.0);
            director.Observe(in walkover);
        }
        Assert.Equal(2, director.WalkoverStreak);

        SpawnSpec pressed = director.NextSpawn(3);
        EngagementReport bloodied = StrongReport(
            3, pressed.Skill, durationSeconds: 20.0) with { HitsTaken = 1 };
        director.Observe(in bloodied);

        Assert.Equal(0, director.WalkoverStreak);
        SpawnSpec next = director.NextSpawn(4);
        Assert.Contains("build", next.Reason, StringComparison.OrdinalIgnoreCase);
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
            EngagementReport win = ContestedWin(engagement, ordinary.Skill);
            director.Observe(in win);
        }

        SpawnSpec fourth = director.NextSpawn(4);
        Assert.False(fourth.Boss);

        EngagementReport fourthWin = ContestedWin(4, fourth.Skill);
        director.Observe(in fourthWin);
        Assert.True(director.NextSpawn(5).Boss);
    }

    // The other half of the cooldown contract: a player who is never threatened does not wait four
    // fights for the ceiling demonstration.
    [Fact]
    public void WalkoversShortenTheBossCooldown() {
        var director = new FightDirector();
        for (int engagement = 1; engagement <= 3; engagement++) {
            SpawnSpec ordinary = director.NextSpawn(engagement);
            // Untouched AND never in his sights, but slow — duration must not matter.
            EngagementReport walkover = StrongReport(
                engagement, ordinary.Skill, durationSeconds: 95.0);
            director.Observe(in walkover);
        }

        Assert.Equal(3, director.WalkoverStreak);
        Assert.True(director.NextSpawn(4).Boss,
            "three untouched, unthreatened wins must bring the boss forward");
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
        // Contested release wins: this test is about the DEFEAT release schedule, so it must not
        // also trip the walkover press and change the tier it asserts on the way out.
        EngagementReport firstReleaseWin = ContestedWin(6, firstRelease.Skill);
        director.Observe(in firstReleaseWin);
        Assert.Equal(DirectorPhase.Release, director.Phase);

        SpawnSpec secondRelease = director.NextSpawn(7);
        Assert.Equal(PilotSkill.Competent, secondRelease.Skill);
        EngagementReport secondReleaseWin = ContestedWin(7, secondRelease.Skill);
        director.Observe(in secondReleaseWin);

        Assert.Equal(DirectorPhase.Build, director.Phase);
        Assert.Equal(PilotSkill.Veteran, director.NextSpawn(8).Skill);
    }

    // Regression for the sawtooth caught in the Build 100 production sortie: the player beat the
    // boss and the director then served COMPETENT and VETERAN. Beating the hardest thing in the
    // game must never be the reason the next fights get easier.
    [Fact]
    public void WalkingOverTheBossEarnsNoPressureReleaseAtAll() {
        var director = new FightDirector();
        SpawnSpec boss = DriveToBoss(director);

        EngagementReport bossWalkover = StrongReport(
            5,
            boss.Skill,
            outcome: SortieOutcome.Victory,
            boss: true,
            durationSeconds: 20.0);
        director.Observe(in bossWalkover);

        Assert.Equal(DirectorPhase.Build, director.Phase);
        SpawnSpec next = director.NextSpawn(6);
        Assert.False(next.Boss);
        Assert.DoesNotContain("release", next.Reason, StringComparison.OrdinalIgnoreCase);
        // The old rule served Competent here — two tiers below the last ordinary opponent.
        Assert.True(next.Skill >= PilotSkill.Veteran,
            $"beating the boss must not soften the ladder; got {next.Skill}");
    }

    [Fact]
    public void ABossWinThatCostSomethingEarnsOneReleaseFightOneTierDown() {
        var director = new FightDirector();
        SpawnSpec boss = DriveToBoss(director);

        // Won, but the player was hit and it took real time: that earns decompression.
        EngagementReport costlyVictory = StrongReport(
            5,
            boss.Skill,
            outcome: SortieOutcome.Victory,
            boss: true,
            durationSeconds: 95.0) with { HitsTaken = 2 };
        director.Observe(in costlyVictory);

        Assert.Equal(DirectorPhase.Release, director.Phase);
        SpawnSpec release = director.NextSpawn(6);
        // ONE tier below the last ordinary opponent (Ace), not the two that gave Competent.
        Assert.Equal(PilotSkill.Veteran, release.Skill);
        Assert.Contains("release", release.Reason, StringComparison.OrdinalIgnoreCase);

        EngagementReport releaseWin = ContestedWin(6, release.Skill);
        director.Observe(in releaseWin);
        Assert.Equal(DirectorPhase.Build, director.Phase);
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

        // Contested wins: this test is about the four-engagement COUNT, so the fights must not
        // also trip the shortened walkover cooldown and bring the boss forward for a different
        // reason (WalkoversShortenTheBossCooldown covers that path).
        for (int engagement = 6; engagement <= 8; engagement++) {
            SpawnSpec ordinary = director.NextSpawn(engagement);
            Assert.False(ordinary.Boss);
            EngagementReport win = ContestedWin(engagement, ordinary.Skill);
            director.Observe(in win);
        }

        SpawnSpec fourthSinceBoss = director.NextSpawn(9);
        Assert.False(fourthSinceBoss.Boss);
        EngagementReport fourthWin = ContestedWin(9, fourthSinceBoss.Skill);
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
    // The pilot's own call: "why don't we give the enemy a better jet? and if the player keeps
    // losing *then* we can make it easier." Airframe is escalated on the same evidence as pilot
    // skill, and eased on the same evidence too.
    [Fact]
    public void TheJetEscalatesWithWalkoversAndEasesAfterRepeatedLosses() {
        var director = new FightDirector();

        // The warm-up rung never gets a better jet — fight one has to stay fight one.
        Assert.Equal(BanditMount.Baseline, director.MountFor(PilotSkill.Novice));
        // Veteran and above start uprated: that is where the baseline airframe stops being able to
        // hold the player's sustained turn at all.
        Assert.Equal(BanditMount.Uprated, director.MountFor(PilotSkill.Veteran));
        Assert.Equal(BanditMount.Baseline, director.MountFor(PilotSkill.Competent));

        // Two untouched, unthreatened wins and even the mid rung gets the better jet.
        for (int engagement = 1; engagement <= 2; engagement++) {
            SpawnSpec spawn = director.NextSpawn(engagement);
            EngagementReport walkover = StrongReport(
                engagement, spawn.Skill, durationSeconds: 30.0);
            director.Observe(in walkover);
        }
        Assert.Equal(2, director.WalkoverStreak);
        Assert.Equal(BanditMount.Uprated, director.MountFor(PilotSkill.Competent));
        Assert.Equal(BanditMount.Uprated, director.NextSpawn(3).Mount);

        // Now lose twice: the jet is handed back before the pilot tier is.
        var losing = new FightDirector();
        for (int engagement = 1; engagement <= 2; engagement++) {
            EngagementReport loss = WeakReport(engagement, PilotSkill.Veteran);
            losing.Observe(in loss);
        }
        Assert.Equal(BanditMount.Baseline, losing.MountFor(PilotSkill.Veteran));
        Assert.Equal(BanditMount.Baseline, losing.NextSpawn(3).Mount);
    }

    [Fact]
    public void TheMachineSpikeKeepsItsOwnAirframeRatherThanAMount() {
        var director = new FightDirector();
        Assert.Equal(BanditMount.Baseline, director.MountFor(PilotSkill.Machine));
    }

}
