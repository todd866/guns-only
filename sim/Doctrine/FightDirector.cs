namespace GunsOnly.Sim.Doctrine;

public enum DirectorPhase { Calm, Build, Boss, Release }

/// Which JET the director puts the opponent in, escalated independently of who is flying it.
///
/// Pilot skill was the only difficulty axis, and against an airframe the player simply out-rates
/// that axis saturates: an F-22A surrogate sustains 11.4 G at fight speed against the Su-27S's
/// 9.2 G, and the player is limited to ~9 G by their own neck rather than by the jet — so they can
/// hold a 9 G turn indefinitely while the Su-27S cannot. No pilot model recovers from that — which
/// is why three builds of AI work moved tracking a long way and never moved the win rate. The
/// Su-35S sustains 10.2 G and CAN stay with a 9 G player, so this is the axis that actually changes
/// who wins.
public enum BanditMount {
    /// The mission's staged airframe (Su-27S surrogate on the modern visual merge).
    Baseline,
    /// Uprated Flanker: sustains above the player's pilot G limit.
    Uprated,
    // A third rung (the light high-alpha prototype, 216 kg/m2 wing loading) is deliberately absent:
    // its aerodynamic surrogate exists but no governed aircraft IDENTITY does, and labelling an
    // interceptor as the one-way attack drone would be a false presentation. Add the rung when the
    // capability token and render model land, not before.
}

/// The next engagement the director wants staged. Reason is a short human-readable line for
/// debrief/telemetry — it explains the pick, it never affects behaviour.
public readonly record struct SpawnSpec(
    PilotSkill Skill, int DoctrineIndex, bool Boss, string Reason,
    bool Machine = false, BanditMount Mount = BanditMount.Baseline,
    int FormationSize = 1);

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
            return WithDoctrine(NeverEasierAfterAWin(target), engagementNumber, boss: false,
                FormattableString.Invariant(
                    $"press: {_walkoverStreak} straight untouched walkovers"));

        PilotSkill build = NeverEasierAfterAWin(OneStepToward(_lastOpponent, target));
        return WithDoctrine(build, engagementNumber, boss: false,
            FormattableString.Invariant(
                $"build: overall {_learner.Bands.Overall}"));
    }

    /// <summary>
    /// A compact, versioned snapshot of the pacing estimate — everything NextSpawn reads, and
    /// nothing else. Deterministic and human-readable so a stored value can be inspected.
    ///
    /// This exists because the gauntlet cold-started at the 2.4 G Novice warm-up on every page
    /// load: a pilot who had fought their way to walking over Aces was handed an opponent capped
    /// at 2.4 G (against their 8-12) every time they reloaded, and a short sortie meant the
    /// warm-up was the ONLY opponent they ever met.
    /// </summary>
    public string ExportState() {
        LearnerBands bands = _learner.Bands;
        var invariant = System.Globalization.CultureInfo.InvariantCulture;
        return string.Join('|', new[] {
            "v1",
            ((int)bands.Gunnery).ToString(invariant),
            ((int)bands.Energy).ToString(invariant),
            ((int)bands.DefensiveBfm).ToString(invariant),
            _learner.WinStreak.ToString(invariant),
            _learner.LossStreak.ToString(invariant),
            _learner.SecondsSinceLastDefeat.ToString("F1", invariant),
            ((int)_phase).ToString(invariant),
            _walkoverStreak.ToString(invariant),
            _engagementsSinceBoss.ToString(invariant),
            ((int)_lastOpponent).ToString(invariant),
            ((int)_lastOrdinaryOpponent).ToString(invariant),
            _releaseRemaining.ToString(invariant),
            ((int)_releaseTier).ToString(invariant),
            _anyObserved ? "1" : "0",
        });
    }

    /// <summary>Restore a snapshot. Returns false and changes NOTHING on anything malformed or
    /// from another version — a corrupt stored value must open a normal cold sortie, never a
    /// half-applied one.</summary>
    public bool TryImportState(string? state) {
        if (string.IsNullOrWhiteSpace(state)) return false;
        string[] parts = state.Split('|');
        if (parts.Length != 15 || parts[0] != "v1") return false;
        var numbers = new int[13];
        for (int i = 0; i < 13; i++) {
            int index = i < 5 ? i + 1 : i + 2;
            if (!int.TryParse(parts[index], System.Globalization.NumberStyles.Integer,
                System.Globalization.CultureInfo.InvariantCulture, out numbers[i])) return false;
        }
        if (!double.TryParse(parts[6], System.Globalization.NumberStyles.Float,
            System.Globalization.CultureInfo.InvariantCulture, out double unbeaten)
            || !double.IsFinite(unbeaten) || unbeaten < 0.0) return false;

        static bool InBand(int value) => value is >= 0 and <= (int)SkillBand.Dominant;
        static bool InSkill(int value) => value is >= 0 and <= (int)PilotSkill.Machine;
        if (!InBand(numbers[0]) || !InBand(numbers[1]) || !InBand(numbers[2])) return false;
        if (numbers[3] < 0 || numbers[4] < 0 || numbers[6] < 0 || numbers[7] < 0
            || numbers[9] < 0) return false;
        if (numbers[5] is < 0 or > (int)DirectorPhase.Release) return false;
        if (!InSkill(numbers[8]) || !InSkill(numbers[10])) return false;

        _learner.RestoreEstimate(
            new LearnerBands((SkillBand)numbers[0], (SkillBand)numbers[1],
                (SkillBand)numbers[2]),
            numbers[3], numbers[4], unbeaten);
        _phase = (DirectorPhase)numbers[5];
        _walkoverStreak = numbers[6];
        _engagementsSinceBoss = numbers[7];
        _lastOpponent = (PilotSkill)numbers[8];
        _releaseRemaining = numbers[9];
        _lastOrdinaryOpponent = (PilotSkill)numbers[10];
        _releaseTier = (PilotSkill)numbers[11];
        _anyObserved = numbers[12] != 0;
        return true;
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

    SpawnSpec WithDoctrine(
        PilotSkill skill, int engagementNumber, bool boss, string reason) {
        int doctrineCount = System.Math.Max(
            1, BanditSkillProfile.For(skill).DoctrineCount);
        return new SpawnSpec(
            skill, (engagementNumber - 1) % doctrineCount, boss, reason,
            Mount: MountFor(skill), FormationSize: FormationSizeFor(skill, boss));
    }

    /// How many aircraft arrive. Numbers are the third escalation axis, alongside pilot tier and
    /// airframe, and they answer the one thing neither of the others can: a capability mismatch the
    /// player simply out-flies. Two average opponents is a genuinely different problem from one
    /// excellent one — it is the classic real answer, and it is the pilot's own idea.
    ///
    /// Same doctrine as everything else: open hard, ease on evidence. The opening wave is a pair,
    /// and it stays a pair while the player keeps beating it. When numbers are eventually returned
    /// they go BEFORE the tier or the jet — being outnumbered is the harshest of the three axes.
    ///
    /// It takes TWO consecutive losses, not one. A single death is the expected cost of a target
    /// somewhere near a 4:1 win rate, and stripping the wave the moment it finally lands makes the
    /// whole fight easier exactly when the pilot has just proved it was correctly pitched. The
    /// pilot noticed immediately — killed once, and the next wave was a 1v1.
    const int OpeningFormationSize = 2;
    const int ConsecutiveLossesBeforeNumbersEase = 2;

    internal int FormationSizeFor(PilotSkill skill, bool boss) {
        // The ceiling demonstration is a duel with a named opponent; it does not bring friends.
        if (boss || skill == PilotSkill.Machine) return 1;
        if (_learner.LossStreak >= ConsecutiveLossesBeforeNumbersEase) return 1;
        return OpeningFormationSize;
    }

    /// The jet is escalated on the SAME evidence as the pilot, and eased on the same evidence too:
    /// walk over the opposition and a better airframe turns up; lose twice in a row and it goes
    /// away again. Pilot skill and mount are deliberately separate axes — a Veteran in an uprated
    /// jet is a different fight from an Ace in the baseline one, which is variety rather than
    /// merely more difficulty.
    ///
    /// The warm-up rung is never uprated: fight one has to stay a fight one.
    internal BanditMount MountFor(PilotSkill skill) {
        // The machine spike already owns its own airframe through the skill path.
        if (skill is PilotSkill.Machine or PilotSkill.Novice) return BanditMount.Baseline;

        // Veteran and above start in the uprated jet — that is the rung at which the baseline
        // airframe stops being able to hold the player's sustained turn at all.
        int level = skill >= PilotSkill.Veteran ? 1 : 0;
        if (_walkoverStreak >= WalkoversToCommitToBand) level++;
        // The pilot's own rule: "if the player keeps losing then we can make it easier."
        if (_learner.LossStreak >= 2) level--;
        return (BanditMount)System.Math.Clamp(level, 0, (int)BanditMount.Uprated);
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

    /// Winning never makes the game easier. The band estimator starts at Steady and climbs one
    /// step per fight, so it LAGS a pilot who is already beating the ceiling — and now that the
    /// gauntlet opens at the ceiling, following the estimate downward would walk a winning pilot
    /// straight back down the ladder they just proved they are above. The ladder comes down when
    /// the player is beaten (the LossStreak ease branch above), not while they are winning.
    PilotSkill NeverEasierAfterAWin(PilotSkill candidate) =>
        _learner.WinStreak > 0 && candidate < _lastOpponent ? _lastOpponent : candidate;

    static PilotSkill OneStepToward(PilotSkill from, PilotSkill target) =>
        target > from ? from + 1
        : target < from ? from - 1
        : from;
}
