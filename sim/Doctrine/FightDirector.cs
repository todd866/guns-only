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
    int FormationSize = 1, bool Sparring = false);

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
    int _rung;
    int _kills;
    int _hits;
    int _hitlessDefeats;
    double? _timeToFirstHitSeconds;

    public DirectorPhase Phase => _phase;
    /// Demonstrated rung. 0 is the cold open. Spawn reads it; nothing counter-picks mid-fight.
    public int Rung => _rung;
    public int Kills => _kills;
    public int Hits => _hits;
    public int HitlessDefeatStreak => _hitlessDefeats;
    public double? TimeToFirstHitSeconds => _timeToFirstHitSeconds;

    /// Pitch-assist scale for the current rung. Rung 0 is the full F-22 law, rung 1 halves
    /// gain and max correction, rung 2 and above turn the assist off. Touch widening is applied
    /// by the session on top of this scale through rung 1.
    public readonly record struct PitchAssistScale(double GainScale, double CorrectionScale, bool Active);
    public PitchAssistScale PitchAssist => _rung switch {
        0 => new(1.0, 1.0, true),
        1 => new(0.5, 0.5, true),
        _ => new(0.0, 0.0, false),
    };
    /// How many consecutive fights the player has won quickly and untouched. Exposed for debrief
    /// and telemetry; it explains an aggressive ladder jump rather than causing one.
    public int WalkoverStreak => _walkoverStreak;
    public LearnerBands Bands => _learner.Bands;
    /// True once any engagement has been observed — the gate for consulting the director on a
    /// sortie's OPENING spawn, so pacing memory (a boss loss, an easing streak) survives the
    /// player's death into their next life instead of resetting with the sortie.
    public bool HasHistory => _anyObserved || _phase != DirectorPhase.Calm;

    public void Observe(in EngagementReport report) {
        if (report.EligibleForLearning)
            ApplyRamp(in report);
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
        // Boss and the release that follows it are unchanged, and they are only available once
        // the stored rung is the earned pair. A cold visitor never meets them.
        if (_rung >= 3 && _phase == DirectorPhase.Release)
            return WithDoctrine(_releaseTier, engagementNumber, boss: false,
                FormattableString.Invariant(
                    $"release: {_releaseRemaining} confidence fight(s) after the boss"));

        if (_rung >= 3 && (_phase == DirectorPhase.Boss || BossTriggerHolds())) {
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

        if (_anyObserved && _phase == DirectorPhase.Calm)
            _phase = DirectorPhase.Build;
        return RungSpec(engagementNumber);
    }

    SpawnSpec RungSpec(int engagementNumber) {
        int rung = System.Math.Clamp(_rung, 0, 3);
        (PilotSkill skill, BanditMount mount, int formation, bool sparring, string reason) =
            rung switch {
                0 => (PilotSkill.Competent, BanditMount.Baseline, 1, true,
                    "rung 0: unproven"),
                1 => (PilotSkill.Veteran, BanditMount.Baseline, 1, false,
                    "rung 1: has a hit"),
                2 => (PilotSkill.Ace, BanditMount.Baseline, 1, false,
                    "rung 2: has a kill"),
                _ => (PilotSkill.Ace, BanditMount.Uprated, 2, false,
                    "rung 3: earned pair"),
            };
        return WithDoctrine(skill, engagementNumber, boss: false, reason) with {
            Mount = mount,
            FormationSize = formation,
            Sparring = sparring,
        };
    }

    void ApplyRamp(in EngagementReport report) {
        int before = _rung;
        bool hit = report.HitsScored > 0;
        // A missile, a terrain impact, or a maneuver kill can end the fight as a victory
        // with no round on the target. Those do not climb the gun ramp.
        bool gunKill = report.GunKills > 0;
        if (hit) _hits += report.HitsScored;
        if (gunKill) _kills += report.GunKills;
        if (_timeToFirstHitSeconds is null
            && double.IsFinite(report.TimeToFirstHitSeconds)
            && report.TimeToFirstHitSeconds >= 0.0)
            _timeToFirstHitSeconds = report.TimeToFirstHitSeconds;

        if (report.Outcome == SortieOutcome.Defeat && !hit)
            _hitlessDefeats++;
        else
            _hitlessDefeats = 0;

        if (hit && _rung < 1) _rung = 1;
        if (gunKill && _rung < 2) _rung = 2;
        bool walkover = gunKill
            && report.HitsTaken == 0
            && report.SolutionSecondsConceded <= WalkoverSolutionSecondsConceded;
        if (_kills >= 2 || (before >= 2 && walkover))
            _rung = System.Math.Max(_rung, 3);

        if (_hitlessDefeats >= 2) {
            _rung = System.Math.Max(0, _rung - 1);
            _hitlessDefeats = 0;
        }
    }

    void ApplyReturningSkip() {
        if (_rung >= 3) _rung = 3;
        else if (_kills >= 1 && _rung < 2) _rung = 2;
    }

    /// <summary>
    /// Versioned snapshot of everything NextSpawn reads. v2 stores the rung and the boss
    /// bookkeeping a rung-3 pilot already had. A v1 blob migrates to rung 0: it has no hits
    /// or kills, and absence must not open at Ace.
    /// </summary>
    public string ExportState() {
        LearnerBands bands = _learner.Bands;
        var invariant = System.Globalization.CultureInfo.InvariantCulture;
        string ttf = _timeToFirstHitSeconds is double seconds
            ? seconds.ToString("F3", invariant) : "-";
        return string.Join('|', new[] {
            "v2",
            _rung.ToString(invariant),
            _kills.ToString(invariant),
            _hits.ToString(invariant),
            _hitlessDefeats.ToString(invariant),
            ttf,
            ((int)_phase).ToString(invariant),
            _learner.WinStreak.ToString(invariant),
            _learner.LossStreak.ToString(invariant),
            _learner.SecondsSinceLastDefeat.ToString("F1", invariant),
            _walkoverStreak.ToString(invariant),
            _engagementsSinceBoss.ToString(invariant),
            ((int)_lastOpponent).ToString(invariant),
            ((int)_lastOrdinaryOpponent).ToString(invariant),
            _releaseRemaining.ToString(invariant),
            ((int)_releaseTier).ToString(invariant),
            _anyObserved ? "1" : "0",
            ((int)bands.Gunnery).ToString(invariant),
            ((int)bands.Energy).ToString(invariant),
            ((int)bands.DefensiveBfm).ToString(invariant),
        });
    }

    /// <summary>Restore a snapshot. Returns false and changes NOTHING on anything malformed or
    /// from an unknown version. A corrupt value stays where it was; a cold director is rung 0.</summary>
    public bool TryImportState(string? state) {
        if (string.IsNullOrWhiteSpace(state)) return false;
        string[] parts = state.Split('|');
        if (parts.Length == 15 && parts[0] == "v1")
            return TryImportV1(parts);
        if (parts.Length == 20 && parts[0] == "v2")
            return TryImportV2(parts);
        return false;
    }

    bool TryImportV1(string[] parts) {
        if (!TryReadBossFields(
            gunnery: parts[1], energy: parts[2], defensive: parts[3],
            win: parts[4], loss: parts[5], unbeatenText: parts[6],
            phase: parts[7], walkover: parts[8], sinceBoss: parts[9],
            lastOpponent: parts[10], lastOrdinary: parts[11],
            releaseRemaining: parts[12], releaseTier: parts[13],
            observed: parts[14],
            out BossFields boss)) return false;
        AssignBoss(boss);
        _rung = 0;
        _kills = 0;
        _hits = 0;
        _hitlessDefeats = 0;
        _timeToFirstHitSeconds = null;
        return true;
    }

    bool TryImportV2(string[] parts) {
        var invariant = System.Globalization.CultureInfo.InvariantCulture;
        if (!int.TryParse(parts[1], out int rung) || rung is < 0 or > 3) return false;
        if (!int.TryParse(parts[2], out int kills) || kills < 0) return false;
        if (!int.TryParse(parts[3], out int hits) || hits < 0) return false;
        if (!int.TryParse(parts[4], out int hitless) || hitless < 0) return false;
        double? ttf = null;
        if (parts[5] != "-") {
            if (!double.TryParse(parts[5], System.Globalization.NumberStyles.Float,
                invariant, out double seconds)
                || !double.IsFinite(seconds) || seconds < 0.0) return false;
            ttf = seconds;
        }
        if (!TryReadBossFields(
            gunnery: parts[17], energy: parts[18], defensive: parts[19],
            win: parts[7], loss: parts[8], unbeatenText: parts[9],
            phase: parts[6], walkover: parts[10], sinceBoss: parts[11],
            lastOpponent: parts[12], lastOrdinary: parts[13],
            releaseRemaining: parts[14], releaseTier: parts[15],
            observed: parts[16],
            out BossFields boss)) return false;
        AssignBoss(boss);
        _rung = rung;
        _kills = kills;
        _hits = hits;
        _hitlessDefeats = hitless;
        _timeToFirstHitSeconds = ttf;
        ApplyReturningSkip();
        return true;
    }

    readonly record struct BossFields(
        LearnerBands Bands, int WinStreak, int LossStreak, double Unbeaten,
        DirectorPhase Phase, int Walkover, int SinceBoss,
        PilotSkill LastOpponent, PilotSkill LastOrdinary,
        int ReleaseRemaining, PilotSkill ReleaseTier, bool Observed);

    static bool TryReadBossFields(
        string gunnery, string energy, string defensive,
        string win, string loss, string unbeatenText,
        string phase, string walkover, string sinceBoss,
        string lastOpponent, string lastOrdinary,
        string releaseRemaining, string releaseTier, string observed,
        out BossFields fields) {
        fields = default;
        var invariant = System.Globalization.CultureInfo.InvariantCulture;
        if (!int.TryParse(gunnery, out int g) || !int.TryParse(energy, out int e)
            || !int.TryParse(defensive, out int d)) return false;
        if (!int.TryParse(win, out int winStreak) || !int.TryParse(loss, out int lossStreak))
            return false;
        if (!double.TryParse(unbeatenText, System.Globalization.NumberStyles.Float,
            invariant, out double unbeaten) || !double.IsFinite(unbeaten) || unbeaten < 0.0)
            return false;
        if (!int.TryParse(phase, out int phaseValue)
            || phaseValue is < 0 or > (int)DirectorPhase.Release) return false;
        if (!int.TryParse(walkover, out int walkovers) || walkovers < 0) return false;
        if (!int.TryParse(sinceBoss, out int since) || since < 0) return false;
        if (!int.TryParse(lastOpponent, out int last) || !InSkill(last)) return false;
        if (!int.TryParse(lastOrdinary, out int ordinary) || !InSkill(ordinary)) return false;
        if (!int.TryParse(releaseRemaining, out int release) || release < 0) return false;
        if (!int.TryParse(releaseTier, out int releaseSkill) || !InSkill(releaseSkill))
            return false;
        if (observed is not ("0" or "1")) return false;
        if (!InBand(g) || !InBand(e) || !InBand(d)) return false;
        if (winStreak < 0 || lossStreak < 0) return false;
        fields = new BossFields(
            new LearnerBands((SkillBand)g, (SkillBand)e, (SkillBand)d),
            winStreak, lossStreak, unbeaten,
            (DirectorPhase)phaseValue, walkovers, since,
            (PilotSkill)last, (PilotSkill)ordinary,
            release, (PilotSkill)releaseSkill, observed == "1");
        return true;
    }

    static bool InBand(int value) => value is >= 0 and <= (int)SkillBand.Dominant;
    static bool InSkill(int value) => value is >= 0 and <= (int)PilotSkill.Machine;

    void AssignBoss(BossFields boss) {
        _learner.RestoreEstimate(boss.Bands, boss.WinStreak, boss.LossStreak, boss.Unbeaten);
        _phase = boss.Phase;
        _walkoverStreak = boss.Walkover;
        _engagementsSinceBoss = boss.SinceBoss;
        _lastOpponent = boss.LastOpponent;
        _lastOrdinaryOpponent = boss.LastOrdinary;
        _releaseRemaining = boss.ReleaseRemaining;
        _releaseTier = boss.ReleaseTier;
        _anyObserved = boss.Observed;
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
        _rung = 0;
        _kills = 0;
        _hits = 0;
        _hitlessDefeats = 0;
        _timeToFirstHitSeconds = null;
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
    /// and it stays a pair while the player keeps beating it.
    ///
    /// Numbers are the LAST axis eased, not the first. That is a deliberate reversal: it takes two
    /// consecutive losses to lose the wingman, while the tier steps down on every single one, so a
    /// struggling pilot meets 2x Veteran before they ever meet 1x anything. The reasoning is that a
    /// pair is the most INTERESTING shape on offer — splitting a formation is a different problem
    /// from out-turning one jet — and interest is what the ladder exists to protect. Difficulty can
    /// come off the pilot tier and the airframe without making the fight duller. The pilot settled
    /// it by complaining about the old order: one death and "it's back to 1v1", which read as the
    /// game taking the good fight away at the exact moment it had proved correctly pitched.
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

    static PilotSkill OneTierBelow(PilotSkill tier) =>
        tier == PilotSkill.Novice ? PilotSkill.Novice : tier - 1;

    static PilotSkill TwoTiersBelow(PilotSkill tier) =>
        OneTierBelow(OneTierBelow(tier));

}
