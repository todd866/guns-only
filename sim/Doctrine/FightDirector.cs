namespace GunsOnly.Sim.Doctrine;

public enum DirectorPhase { Calm, Build, Boss, Release }

/// The next engagement the director wants staged. Reason is a short human-readable line for
/// debrief/telemetry — it explains the pick, it never affects behaviour.
public readonly record struct SpawnSpec(
    PilotSkill Skill, int DoctrineIndex, bool Boss, string Reason);

/// Session-scale pacing for infinite-spawn continuous combat: CALM → BUILD → BOSS → RELEASE.
/// Owns a LearnerModel and turns its banded estimate into the next spawn's tier/doctrine, with
/// the boss reserved for a player who has been cruising (win streak + unbeaten time + skill).
///
/// Determinism contract: state advances ONLY in Observe (completed engagements) and phase
/// commitment happens ONLY at the NextSpawn boundary — the director never counter-picks
/// mid-fight, and identical observed history yields identical spawn sequences. Cold start
/// reproduces the interim BanditSkillProfile.ForEngagement ladder exactly.
public sealed class FightDirector {
    const int BossWinStreak = 3;
    const double BossUnbeatenSeconds = 240.0;
    const int BossCooldownEngagements = 4;
    const int ReleaseAfterBossLoss = 2;
    const int ReleaseAfterBossWin = 1;

    readonly LearnerModel _learner = new();
    DirectorPhase _phase = DirectorPhase.Calm;
    bool _anyObserved;
    // Completed ordinary engagements since the last boss fight ended — or since session
    // start: the first boss also needs four completed fights, so a fresh session always gets a
    // warm-up run before the ceiling demonstration can appear.
    int _engagementsSinceBoss;
    PilotSkill _lastOpponent = PilotSkill.Novice;
    PilotSkill _lastOrdinaryOpponent = PilotSkill.Novice;
    int _releaseRemaining;
    PilotSkill _releaseTier = PilotSkill.Novice;

    public DirectorPhase Phase => _phase;
    public LearnerBands Bands => _learner.Bands;
    /// True once any engagement has been observed — the gate for consulting the director on a
    /// sortie's OPENING spawn, so pacing memory (a boss loss, an easing streak) survives the
    /// player's death into their next life instead of resetting with the sortie.
    public bool HasHistory => _anyObserved || _phase != DirectorPhase.Calm;

    public void Observe(in EngagementReport report) {
        _learner.Observe(in report);
        _lastOpponent = report.OpponentSkill;

        if (report.OpponentWasBoss) {
            // The ceiling demonstration is over either way: serve the pressure-release fights,
            // shortened when the player actually took the boss down.
            _releaseRemaining = report.Outcome == SortieOutcome.Victory
                ? ReleaseAfterBossWin : ReleaseAfterBossLoss;
            _releaseTier = TwoTiersBelow(_lastOrdinaryOpponent);
            _engagementsSinceBoss = 0;
            _phase = DirectorPhase.Release;
            return;
        }

        _anyObserved = true;
        _lastOrdinaryOpponent = report.OpponentSkill;
        _engagementsSinceBoss++;
        if (_phase == DirectorPhase.Release) {
            _releaseRemaining--;
            if (_releaseRemaining <= 0) _phase = DirectorPhase.Build;
        }
    }

    public SpawnSpec NextSpawn(int engagementNumber) {
        if (!_anyObserved && _phase == DirectorPhase.Calm)
            return WithDoctrine(BanditSkillProfile.ForEngagement(engagementNumber),
                engagementNumber, boss: false, "warm-up ladder");

        if (_phase == DirectorPhase.Release)
            return WithDoctrine(_releaseTier, engagementNumber, boss: false,
                FormattableString.Invariant(
                    $"release: {_releaseRemaining} confidence fight(s) after the boss"));

        if (_phase == DirectorPhase.Boss || BossTriggerHolds()) {
            _phase = DirectorPhase.Boss;
            return WithDoctrine(PilotSkill.Ace, engagementNumber, boss: true,
                FormattableString.Invariant(
                    $"boss: {_learner.WinStreak}-win streak, {(int)_learner.SecondsSinceLastDefeat}s unbeaten"));
        }

        _phase = DirectorPhase.Build;
        PilotSkill target = BandTier(_learner.Bands.Overall);
        if (_learner.LossStreak >= 2) {
            PilotSkill eased = OneTierBelow(target);
            PilotSkill spawn = OneStepToward(_lastOpponent, eased);
            return WithDoctrine(spawn, engagementNumber, boss: false,
                FormattableString.Invariant(
                    $"ease: {_learner.LossStreak} straight losses"));
        }

        PilotSkill build = OneStepToward(_lastOpponent, target);
        return WithDoctrine(build, engagementNumber, boss: false,
            FormattableString.Invariant(
                $"build: overall {_learner.Bands.Overall}"));
    }

    public void Reset() {
        _learner.Reset();
        _phase = DirectorPhase.Calm;
        _anyObserved = false;
        _engagementsSinceBoss = 0;
        _lastOpponent = PilotSkill.Novice;
        _lastOrdinaryOpponent = PilotSkill.Novice;
        _releaseRemaining = 0;
        _releaseTier = PilotSkill.Novice;
    }

    bool BossTriggerHolds() =>
        _learner.WinStreak >= BossWinStreak
        && _learner.SecondsSinceLastDefeat >= BossUnbeatenSeconds
        && _learner.Bands.Overall >= SkillBand.Sharp
        && _engagementsSinceBoss >= BossCooldownEngagements;

    static SpawnSpec WithDoctrine(
        PilotSkill skill, int engagementNumber, bool boss, string reason) {
        int doctrineCount = System.Math.Max(
            1, BanditSkillProfile.For(skill).DoctrineCount);
        return new SpawnSpec(
            skill, (engagementNumber - 1) % doctrineCount, boss, reason);
    }

    static PilotSkill BandTier(SkillBand overall) => overall switch {
        SkillBand.Struggling => PilotSkill.Novice,
        SkillBand.Steady => PilotSkill.Competent,
        SkillBand.Sharp => PilotSkill.Veteran,
        _ => PilotSkill.Ace,
    };

    static PilotSkill OneTierBelow(PilotSkill tier) =>
        tier == PilotSkill.Novice ? PilotSkill.Novice : tier - 1;

    static PilotSkill TwoTiersBelow(PilotSkill tier) =>
        OneTierBelow(OneTierBelow(tier));

    static PilotSkill OneStepToward(PilotSkill from, PilotSkill target) =>
        target > from ? from + 1
        : target < from ? from - 1
        : from;
}
