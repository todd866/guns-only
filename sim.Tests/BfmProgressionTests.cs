using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;

namespace GunsOnly.Sim.Tests;

public sealed class BfmProgressionTests {
    static EngagementReport Report(
        SortieOutcome outcome,
        int hitsScored = 0,
        int gunKills = 0,
        EngagementEndReason reason = EngagementEndReason.CombatResult) => new(
        EngagementNumber: 1,
        OpponentSkill: PilotSkill.Competent,
        OpponentWasBoss: false,
        Outcome: outcome,
        DurationSeconds: 20.0,
        SolutionSecondsConceded: 0.0,
        HitsTaken: 0,
        ShotsTotal: 0,
        ShotsInWindow: 0,
        Overshoots: 0,
        MinimumEnergyKias: 300.0,
        GcasActivations: 0,
        EndReason: reason,
        HitsScored: hitsScored,
        GunKills: gunKills);

    [Fact]
    public void BfmLadderAlternatesLessonsOnlyOnTheEvidenceForThatLesson() {
        var director = new FightDirector();
        director.EnableBfmLadder();
        Assert.Equal(0, director.LessonIndex);
        Assert.Equal("O1", director.NextSpawn(1).Reason[4..]);

        var o1Kill = Report(SortieOutcome.Victory, hitsScored: 2, gunKills: 1);
        director.Observe(in o1Kill);
        Assert.Equal(1, director.LessonIndex);
        Assert.Equal(PilotSkill.Veteran, director.NextSpawn(2).Skill);

        // A defensive loss repeats D1; completing it is the only defensive advance path.
        var d1Loss = Report(SortieOutcome.Defeat);
        director.Observe(in d1Loss);
        Assert.Equal(1, director.LessonIndex);
        director.CompleteDefensiveLesson();
        Assert.Equal(2, director.LessonIndex);
        Assert.Equal(BanditMount.Baseline, director.NextSpawn(3).Mount);

        var o2Kill = Report(SortieOutcome.Victory, hitsScored: 1, gunKills: 1);
        director.Observe(in o2Kill);
        Assert.Equal(3, director.LessonIndex);
        director.CompleteDefensiveLesson();
        Assert.Equal(4, director.LessonIndex);
        Assert.Equal("O3", BfmLesson.Get(director.LessonIndex).Id);

        director.Observe(in o1Kill);
        Assert.Equal(5, director.LessonIndex);
        director.Observe(in d1Loss);
        Assert.Equal(5, director.LessonIndex);
        director.CompleteDefensiveLesson();
        Assert.Equal(6, director.LessonIndex);
        director.Observe(in o1Kill);
        Assert.Equal(7, director.LessonIndex);
        director.Observe(in o1Kill);
        Assert.Equal(7, director.LessonIndex);
    }

    [Fact]
    public void BfmHitsAreEvidenceButDoNotAdvanceWithoutAGunKill() {
        var director = new FightDirector();
        director.EnableBfmLadder();
        var hit = Report(SortieOutcome.Defeat, hitsScored: 1);
        director.Observe(in hit);
        Assert.Equal(0, director.LessonIndex);
        Assert.Equal(1, director.Hits);
        Assert.Equal(0, director.Kills);
        Assert.Equal("O1", director.NextSpawn(1).Reason[4..]);
    }

    [Fact]
    public void DefensiveFailureAndPlayerHandoffBothRepeatTheLesson() {
        var director = new FightDirector();
        director.EnableBfmLadder();
        var kill = Report(SortieOutcome.Victory, hitsScored: 1, gunKills: 1);
        director.Observe(in kill);
        Assert.Equal(1, director.LessonIndex);
        var handoff = Report(SortieOutcome.Victory, reason: EngagementEndReason.PlayerHandoff);
        director.Observe(in handoff);
        Assert.Equal(1, director.LessonIndex);
        director.CompleteDefensiveLesson();
        Assert.Equal(2, director.LessonIndex);
    }

    [Fact]
    public void LegacyDirectorRemainsUnchangedUntilBfmIsEnabled() {
        var director = new FightDirector();
        var kill = Report(SortieOutcome.Victory, hitsScored: 1, gunKills: 1);
        director.Observe(in kill);
        Assert.False(director.BfmEnabled);
        Assert.Equal(-1, director.LessonIndex);
        Assert.Equal(2, director.Rung);
        Assert.Equal(PilotSkill.Ace, director.NextSpawn(2).Skill);
    }

    [Fact]
    public void DirectorImportsLegacyVersionsAndMalformedImportsAreAtomic() {
        var source = new FightDirector();
        source.EnableBfmLadder();
        var kill = Report(SortieOutcome.Victory, hitsScored: 1, gunKills: 1);
        source.Observe(in kill);
        string v3 = source.ExportState();
        Assert.EndsWith("|1", v3);

        var restored = new FightDirector();
        Assert.True(restored.TryImportState(v3));
        restored.EnableBfmLadder();
        Assert.Equal(1, restored.LessonIndex);

        string v2 = "v2" + v3[2..^2];
        var old = new FightDirector();
        Assert.True(old.TryImportState(v2));
        old.EnableBfmLadder();
        Assert.Equal(2, old.LessonIndex); // one historical gun kill maps to O2

        var v1 = new FightDirector();
        Assert.True(v1.TryImportState("v1|1|1|1|0|0|0.0|0|0|0|0|0|0|0|0"));
        v1.EnableBfmLadder();
        Assert.Equal(0, v1.LessonIndex);

        string intact = restored.ExportState();
        Assert.False(restored.TryImportState(v3[..^1] + "8"));
        Assert.Equal(intact, restored.ExportState());
        Assert.False(restored.TryImportState("v3|bad|payload"));
        Assert.Equal(intact, restored.ExportState());
    }

    [Fact]
    public void ActiveBfmSnapshotCanTravelThroughLegacyModeAndRetainsHitHistory() {
        var source = new FightDirector();
        source.EnableBfmLadder();
        var kill = Report(SortieOutcome.Victory, hitsScored: 1, gunKills: 1);
        source.Observe(in kill); // O1 -> D1
        string active = source.ExportState();

        var legacy = new FightDirector();
        Assert.True(legacy.TryImportState(active));
        Assert.False(legacy.BfmEnabled);
        legacy.CreditPhysicalHits(2);
        Assert.Equal(1, legacy.Rung);
        string withHistory = legacy.ExportState();

        var restored = new FightDirector();
        Assert.True(restored.TryImportState(withHistory));
        restored.EnableBfmLadder();
        Assert.Equal(1, restored.LessonIndex);
        Assert.Equal(3, restored.Hits);
    }

    static AircraftState State(Vec3D position, double chi = 0.0) =>
        new(position, 250.0, 0.0, chi, 0.0, 1000.0);

    [Fact]
    public void DefensiveObserverRequiresMinimumTimeAndThreeSafeSeconds() {
        var observer = new DefensiveSuccessObserver();
        var player = State(Vec3D.Zero);
        var attacker = State(new Vec3D(0, 0, -500), 0.0);
        var bandit = State(new Vec3D(0, 0, -500), Math.PI / 2.0);
        Assert.False(observer.Step(in player, in attacker, gunSolution: true, alive: true,
            elapsedSeconds: 0.0, requiredSeconds: 5.0, dt: 1.0));
        Assert.False(observer.Step(in player, in bandit, gunSolution: false, alive: true,
            elapsedSeconds: 4.0, requiredSeconds: 5.0, dt: 1.0));
        Assert.False(observer.Step(in player, in bandit, gunSolution: false, alive: true,
            elapsedSeconds: 5.0, requiredSeconds: 5.0, dt: 1.0));
        Assert.True(observer.Step(in player, in bandit, gunSolution: false, alive: true,
            elapsedSeconds: 6.0, requiredSeconds: 5.0, dt: 1.0));
    }

    [Fact]
    public void DefensiveObserverRejectsGeometricProofWithoutAnAttack() {
        var player = State(Vec3D.Zero);
        var passive = State(new Vec3D(0, 0, -500), Math.PI / 2.0);
        var observer = new DefensiveSuccessObserver();
        for (int i = 0; i < 4; i++)
            Assert.False(observer.Step(in player, in passive, false, true, i + 5.0, 0.0, 1.0));

        var parallelAhead = State(new Vec3D(0, 0, 500), 0.0);
        observer.Reset();
        for (int i = 0; i < 4; i++)
            Assert.False(observer.Step(in player, in parallelAhead, false, true, i + 5.0, 0.0, 1.0));
    }

    [Fact]
    public void DefensiveObserverResetsOnSolutionDeathOrRange() {
        var player = State(Vec3D.Zero);
        var attacker = State(new Vec3D(0, 0, -500), 0.0);
        var close = State(new Vec3D(0, 0, -500), Math.PI / 2.0);
        var far = State(new Vec3D(0, 0, -1600), Math.PI / 2.0);

        var solution = new DefensiveSuccessObserver();
        solution.Step(in player, in attacker, true, true, 0.0, 0.0, 1.0);
        solution.Step(in player, in close, false, true, 5.0, 0.0, 1.0);
        solution.Step(in player, in close, true, true, 6.0, 0.0, 1.0);
        Assert.False(solution.Step(in player, in close, false, true, 7.0, 0.0, 1.0));
        solution.Step(in player, in close, false, true, 8.0, 0.0, 1.0);
        Assert.True(solution.Step(in player, in close, false, true, 9.0, 0.0, 1.0));

        var death = new DefensiveSuccessObserver();
        death.Step(in player, in attacker, true, true, 0.0, 0.0, 1.0);
        death.Step(in player, in close, false, true, 5.0, 0.0, 1.0);
        death.Step(in player, in close, false, false, 6.0, 0.0, 1.0);
        Assert.False(death.Step(in player, in close, false, true, 7.0, 0.0, 1.0));

        var range = new DefensiveSuccessObserver();
        range.Step(in player, in attacker, true, true, 0.0, 0.0, 1.0);
        range.Step(in player, in close, false, true, 5.0, 0.0, 1.0);
        range.Step(in player, in far, false, true, 6.0, 0.0, 1.0);
        Assert.False(range.Step(in player, in close, false, true, 7.0, 0.0, 1.0));
    }

    [Fact]
    public void DefensiveProofLatchSurvivesLaterSeparation() {
        var player = State(Vec3D.Zero);
        var attacker = State(new Vec3D(0, 0, -500), 0.0);
        var close = State(new Vec3D(0, 0, -500), Math.PI / 2.0);
        var far = State(new Vec3D(0, 0, -1800), Math.PI / 2.0);
        var observer = new DefensiveSuccessObserver();
        observer.Step(in player, in attacker, true, true, 0.0, 0.0, 1.0);
        observer.Step(in player, in close, false, true, 1.0, 0.0, 1.0);
        observer.Step(in player, in close, false, true, 2.0, 0.0, 1.0);
        Assert.True(observer.Step(in player, in close, false, true, 3.0, 0.0, 1.0));
        Assert.True(observer.Step(in player, in far, false, true, 4.0, 0.0, 1.0));
    }

    [Fact]
    public void D2RequiresAnOvershootEvenWhenAngleOffIsLarge() {
        var player = State(Vec3D.Zero);
        var attacker = State(new Vec3D(0, 0, -500), 0.0);
        var behindAngleOff = State(new Vec3D(0, 0, -500), Math.PI / 2.0);
        var overshot = State(new Vec3D(0, 0, 500), Math.PI / 2.0);
        var observer = new DefensiveSuccessObserver();
        observer.Step(in player, in attacker, true, true, 0.0, 0.0, 1.0, lessonIndex: 3);
        for (int i = 0; i < 3; i++)
            Assert.False(observer.Step(in player, in behindAngleOff, false, true, i + 1.0, 0.0, 1.0, lessonIndex: 3));
        observer = new DefensiveSuccessObserver();
        observer.Step(in player, in attacker, true, true, 0.0, 0.0, 1.0, lessonIndex: 3);
        for (int i = 0; i < 3; i++)
            if (i < 2)
                Assert.False(observer.Step(in player, in overshot, false, true, i + 4.0, 0.0, 1.0, lessonIndex: 3));
            else
                Assert.True(observer.Step(in player, in overshot, false, true, i + 4.0, 0.0, 1.0, lessonIndex: 3));
    }

    [Fact]
    public void D3RequiresThePlayerGunSolutionAfterOvershoot() {
        var player = State(Vec3D.Zero);
        var attacker = State(new Vec3D(0, 0, -500), 0.0);
        var overshot = State(new Vec3D(0, 0, 500), Math.PI / 2.0);
        var observer = new DefensiveSuccessObserver();
        observer.Step(in player, in attacker, true, true, 0.0, 0.0, 1.0, lessonIndex: 5);
        for (int i = 0; i < 3; i++)
            Assert.False(observer.Step(in player, in overshot, false, true, i + 1.0, 0.0, 1.0,
                lessonIndex: 5, playerGunSolution: false));
        observer = new DefensiveSuccessObserver();
        observer.Step(in player, in attacker, true, true, 0.0, 0.0, 1.0, lessonIndex: 5);
        for (int i = 0; i < 3; i++)
            if (i < 2)
                Assert.False(observer.Step(in player, in overshot, false, true, i + 4.0, 0.0, 1.0,
                    lessonIndex: 5, playerGunSolution: true));
            else
                Assert.True(observer.Step(in player, in overshot, false, true, i + 4.0, 0.0, 1.0,
                    lessonIndex: 5, playerGunSolution: true));
    }
}
