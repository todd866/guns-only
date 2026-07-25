namespace GunsOnly.Sim.Doctrine;

public enum DirectorPhase { Calm, Build, Boss, Release }

/// The next engagement the director wants staged. Reason is a short human-readable line for
/// debrief/telemetry — it explains the pick, it never affects behaviour.
public readonly record struct SpawnSpec(
    PilotSkill Skill, int DoctrineIndex, bool Boss, string Reason,
    bool Machine = false);

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

    // A walkover is a fight the player was never in DANGER in — not a fight they won quickly.
    //
    // This was originally a duration test (< 45 s) and it failed in production for an instructive
    // reason: Build 102 improved the bandit's tracking, so fights got LONGER (97/63/34/46/41/67 s),
    // so fewer of them tripped the clock, so a pilot who took zero hits in six straight fights
    // never registered a single walkover and the ladder crawled Novice -> Competent -> Veteran ->
    // Veteran -> Veteran -> Ace. Measuring dominance with a stopwatch punishes the player for the
    // opponent surviving longer, which is backwards.
    //
    // SolutionSecondsConceded is how long the bandit's gun actually held a solution on the player,
    // fired or not. Zero hits AND essentially no time in his sights means the tier never threatened
    // them, however long it took to finish. Roughly two burst lengths of grace.
    const double WalkoverSolutionSecondsConceded = 0.75;
    const int WalkoversToCommitToBand = 2;
    const int WalkoversToPressTheCeiling = 3;
    // Cooldown before the ceiling demonstration may reappear, shortened while the player is
    // walking over the ladder so the boss is not held back by bookkeeping.
    const int WalkoverBossCooldownEngagements = 2;

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
    // Consecutive engagements — boss fights included, because this is pacing and not the skill
    // estimate — won quickly and without conceding a hit.
    int _walkoverStreak;

    public DirectorPhase Phase => _phase;
    /// How many consecutive fights the player has won quickly and untouched. Exposed for debrief
    /// and telemetry; it explains an aggressive ladder jump rather than causing one.
    public int WalkoverStreak => _walkoverStreak;
    public LearnerBands Bands => _learner.Bands;
    /// True once any engagement has been observed — the gate for consulting the director on a
    /// sortie's OPENING spawn, so pacing memory (a boss loss, an easing streak) survives the
    /// player's death into their next life instead of resetting with the sortie.
    public bool HasHistory => _anyObserved || _phase != DirectorPhase.Calm;

    public void Observe(in EngagementReport report) {
        _learner.Observe(in report);
        _lastOpponent = report.OpponentSkill;

        bool walkover = report.Outcome == SortieOutcome.Victory
            && report.HitsTaken == 0
            && report.SolutionSecondsConceded <= WalkoverSolutionSecondsConceded;
        _walkoverStreak = walkover ? _walkoverStreak + 1 : 0;

        if (report.OpponentWasBoss) {
            _engagementsSinceBoss = 0;
            // Beating the ceiling must never make the game easier. Walking over the boss earns NO
            // pressure release — the player has just proved they do not need one, and serving them
            // two tiers down was the sawtooth that made a dominant run get progressively softer.
            // A boss win that actually cost something still earns one decompression fight, but one
            // tier down rather than two. Only a boss DEFEAT gets the full two-tier, two-fight
            // release: that is the case pressure relief exists for.
            if (report.Outcome == SortieOutcome.Victory) {
                if (walkover) {
                    _releaseRemaining = 0;
                    _phase = DirectorPhase.Build;
                    return;
                }
                _releaseRemaining = ReleaseAfterBossWin;
                _releaseTier = OneTierBelow(_lastOrdinaryOpponent);
            } else {
                _releaseRemaining = ReleaseAfterBossLoss;
                _releaseTier = TwoTiersBelow(_lastOrdinaryOpponent);
            }
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
            // Spike flavour targets the weakest concept: an energy-sloppy player meets the
            // 15 G machine (it executes rate-fighters and dies to energy discipline); everyone
            // else meets the cat (defensive BFM under a superior pilot).
            bool machine = _learner.Bands.Energy < _learner.Bands.DefensiveBfm
                && _learner.Bands.Energy < _learner.Bands.Gunnery;
            if (machine)
                return WithDoctrine(PilotSkill.Machine, engagementNumber, boss: false,
                    FormattableString.Invariant(
                        $"machine: {_learner.WinStreak}-win streak, energy is the gap"))
                    with { Machine = true };
            return WithDoctrine(PilotSkill.Ace, engagementNumber, boss: true,
                FormattableString.Invariant(
                    $"boss: {_learner.WinStreak}-win streak, {(int)_learner.SecondsSinceLastDefeat}s unbeaten"));
        }

        _phase = DirectorPhase.Build;
        PilotSkill target = BandTier(_learner.Bands.Overall);
        // Easing a player who is genuinely losing comes FIRST and is unconditional: a loss streak
        // resets the walkover streak anyway, so these two can never contend.
        if (_learner.LossStreak >= 2) {
            PilotSkill eased = OneTierBelow(target);
            PilotSkill spawn = OneStepToward(_lastOpponent, eased);
            return WithDoctrine(spawn, engagementNumber, boss: false,
                FormattableString.Invariant(
                    $"ease: {_learner.LossStreak} straight losses"));
        }

        if (_walkoverStreak >= WalkoversToPressTheCeiling) target = PilotSkill.Ace;
        if (_walkoverStreak >= WalkoversToCommitToBand)
            return WithDoctrine(target, engagementNumber, boss: false,
                FormattableString.Invariant(
                    $"press: {_walkoverStreak} straight untouched walkovers"));

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
        _walkoverStreak = 0;
    }

    bool BossTriggerHolds() =>
        _learner.WinStreak >= BossWinStreak
        && _learner.SecondsSinceLastDefeat >= BossUnbeatenSeconds
        && _learner.Bands.Overall >= SkillBand.Sharp
        && _engagementsSinceBoss >= (_walkoverStreak >= WalkoversToCommitToBand
            ? WalkoverBossCooldownEngagements : BossCooldownEngagements);

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
