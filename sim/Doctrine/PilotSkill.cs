namespace GunsOnly.Sim.Doctrine;

/// Opponent competence tiers for the roguelite escalation. The ladder spans a deliberately dumb
/// novice up to a genuinely threatening ace; the gauntlet spawns higher tiers toward the climax.
public enum PilotSkill { Novice, Competent, Veteran, Ace, Machine }

/// How readily a pilot leaves the traditional perch to fight a target in the low block.
public enum LowBlockDoctrine {
    Conservative,
    BoomAndZoom,
    Hunt
}

/// Skill-gated knobs read by ReactiveBandit. Novice retains the deliberately soft introductory
/// opponent. Competent and above use progressively more of the same honest aerodynamic/physiology
/// envelope so the middle rung is no longer a predictable 3.2 G pursuit curve. Floors are measured
/// above real terrain rather than sea level, a last-instance terrain-recovery reflex pre-empts the
/// tactical layers at low altitude, and a bandit pinned at its ceiling by a player camping above
/// extends away instead of hovering.
///
/// LookaheadHorizonTicks gates the short-horizon lookahead BFM decision layer: 0 keeps Novice on
/// the simple state machine, while a bounded positive value lets Competent and above roll
/// candidate maneuvers forward in the deterministic kernel and fly the one that
/// best improves the future firing position (at 120 Hz, ~90 ticks ~= 0.75 s, ~150 ticks ~= 1.25 s).
public readonly record struct BanditSkillProfile(
    double MaxAcquireG, double AcquireGGain, bool ForcesOvershoot,
    bool DisengagesWhenLosing, int DoctrineCount, int LookaheadHorizonTicks,
    double FireConeDeg = 3.0,
    LowBlockDoctrine LowBlockDoctrine = LowBlockDoctrine.Conservative,
    double LowBlockClearanceM = 260.0,
    double LowBlockRecommitSeconds = 0.0,
    bool IsBoss = false,
    double CommitDominanceSeconds = 8.0,
    double EnergyRetentionWeight = 1.0,
    double LeadFireConeDeg = 0.45,
    // Whether this pilot closes the last degrees onto the ballistic lead point with the
    // closed-loop manoeuvring finisher (ReactiveBandit.GunTrackCommand). True for every real
    // tier the law fits; the frozen BfmDuel reference yardstick sets it false so the ruler a
    // tier ladder is measured against does not itself improve with the bandit build.
    bool ManoeuvringFinisher = true,
    /// The G the closed-loop finisher's gains are scaled to. The loop's tau, feedforward horizon
    /// and rate limit are all derived from authority = clamp(thisG / 5.5, 0.75, 2.0), and the
    /// gains were validated at the Veteran's 5.5 G. Scaling them by a tier's FULL envelope makes
    /// the loop hotter than the gains were ever tuned for. 0 = follow MaxAcquireG (legacy).
    double FineTrackAuthorityG = 0.0,
    /// Above this MaxAcquireG a tier declines the fixed-form finisher against a MANOEUVRING target
    /// and keeps its planner. Historically hardcoded at 5.5, which excluded exactly one tier: the
    /// Ace — the only tier on the ladder that owns the firing position and cannot convert it.
    double FineTrackMaxG = 5.5,
    /// Whether this pilot will spend a burst on the WIDE BODY-AXIS gate — nose on the target
    /// itself rather than on the ballistic lead point.
    ///
    /// That gate is wrong by construction in any crossing fight. Pointing at the target IS pure
    /// pursuit, and the lead a gun needs is exactly the angle pursuit omits: measured on
    /// GunConversionFunnel the Ace satisfied its 3.5 deg body gate for 18.6 s and held a MEDIAN
    /// ballistic lead error of 17.3 deg at the trigger, because the body gate selects precisely
    /// the moments when the solution is furthest away. The lead gate was met for 0.0 s, so the
    /// body gate was authorising 100% of the Ace's 147 rounds — and 0 of them could hit.
    ///
    /// Firing on the solution instead of on the target is trigger discipline, and it is the one
    /// lever that moved conversion: range discipline and finisher retuning were both swept across
    /// 24 combinations and every cell stayed at 0 hits / 0.0% on-solution.
    bool FiresOnBodyGate = true) {

    /// The G the finisher's gains are scaled to (defaults to the tier's full acquire envelope).
    public double EffectiveFineTrackAuthorityG =>
        FineTrackAuthorityG > 0.0 ? FineTrackAuthorityG : MaxAcquireG;

    /// Trigger nose-error gate in radians. The Veteran deliberately shoots a WIDER gate: with
    /// honest ballistics a wide-gate burst is tracer pressure and near misses — the mid-ladder
    /// player finally gets shot AT without the hit probability of an ace. The Ace stays nearly
    /// disciplined.
    public double FireConeRad => FireConeDeg * System.Math.PI / 180.0;
    /// Tight body-axis tolerance around the observation-derived ballistic lead. This is pilot
    /// tracking quality, not projectile dispersion or an enlarged target: GunKill remains the
    /// only hit authority.
    public double LeadFireConeRad => LeadFireConeDeg * System.Math.PI / 180.0;

    public static BanditSkillProfile For(PilotSkill skill) => skill switch {
        PilotSkill.Novice => new(
            2.40, 1.00, false, false, 1, 0,
            LeadFireConeDeg: 0.25),
        PilotSkill.Competent => new(
            4.80, 1.80, true, false, 1, 100,
            FireConeDeg: 3.5,
            LowBlockDoctrine: LowBlockDoctrine.BoomAndZoom,
            LowBlockClearanceM: 260.0,
            LowBlockRecommitSeconds: 5.0,
            LeadFireConeDeg: 0.40),
        PilotSkill.Veteran => new(
            5.50, 1.80, false, true, 2, 90,
            FireConeDeg: 5.0,
            LowBlockDoctrine: LowBlockDoctrine.Hunt,
            LowBlockClearanceM: 180.0,
            LowBlockRecommitSeconds: 1.8,
            LeadFireConeDeg: 0.45),
        // THE ACE SHOOTS AT THE SOLUTION. Every tier below it spends bursts on the wide body-axis
        // gate — nose on the target, which in a crossing fight is the one place the rounds cannot
        // go — and that is what tier discipline is FOR: the mid-ladder throws tracers, the Ace
        // waits for the shot. Measured on GunConversionFunnel across 6 engagements, this takes the
        // Ace from 147 rounds / 0 hits / 0.0% on-solution to 39 rounds / 11 hits / 36% on-solution,
        // with ballistic lead error at the trigger falling from a median 17.30 deg to 0.87 deg.
        //
        // The 1.25 deg trigger cone is achievable discipline, not a pinpoint gate: it still throws
        // 72% of its rounds away. Tightening to 0.75 deg trades hits for economy (22 rounds, 9
        // hits) and widening to 2.0 deg trades economy for sky (63 rounds, 10 hits); 1.25 sits at
        // the knee. The finisher authority is pinned to the Veteran's 5.5 G because that is the G
        // the loop's gains were validated at — the Ace's advantage is having 9 G AVAILABLE to fly
        // those gains, not a hotter loop. Scaling the loop by its full 9 G envelope measured
        // strictly worse (trigger lead error p10 9.24 -> 14.91 deg).
        PilotSkill.Ace => new(
            9.00, 2.20, true, true, 3, 150,
            FireConeDeg: 3.5,
            LowBlockDoctrine: LowBlockDoctrine.Hunt,
            LowBlockClearanceM: 105.0,
            LowBlockRecommitSeconds: 0.35,
            LeadFireConeDeg: 1.25,
            FineTrackAuthorityG: 5.5,
            FineTrackMaxG: 99.0,
            FiresOnBodyGate: false),
        // The robot (docs/robot-airframe-design.md): airframe-limited G, machine trigger
        // discipline, the longest lookahead on the ladder — and a personality that fights FAST.
        // Its 15 G structural ceiling only towers over humans at high dynamic pressure (slow,
        // everyone is aero-limited alike), so the raised retention weight keeps it in the
        // regime where its envelope IS the advantage. The counter stays honest physics: every
        // max-perform pull hemorrhages energy — bait the pull, make it burn, kill it slow.
        PilotSkill.Machine => new(
            15.0, 2.20, true, true, 3, 180,
            FireConeDeg: 3.0,
            LowBlockDoctrine: LowBlockDoctrine.Hunt,
            LowBlockClearanceM: 105.0,
            LowBlockRecommitSeconds: 0.35,
            EnergyRetentionWeight: 1.30),
        _ => For(PilotSkill.Competent),
    };

    /// The Fight Director's cat: an Ace whose stalk phase raises the fire-control quality bar
    /// (1.8 deg — it declines marginal shots, which reads as toying and is honest) until a
    /// deterministic commit trigger in ReactiveBandit drops it back to the Ace gate and it rolls
    /// in for the kill. Same lookahead, same BanditFireControl, no thrown fights.
    public static BanditSkillProfile Boss() =>
        For(PilotSkill.Ace) with { FireConeDeg = 1.8, IsBoss = true };

    /// Deterministic per-wave curve for the flagship continuous-combat gauntlet: a pure function of
    /// the 1-based engagement number, with NO RNG, wall clock, or date.
    ///
    /// THE OPENING FIGHT IS THE HARDEST ONE. This deliberately reverses the old forgiving ramp
    /// (1 Novice, 2 Competent, 3 Veteran, 4+ Ace) on the pilot's instruction: "the first bad guy
    /// should always default to really hard and then once he guns your brains out we can make
    /// things easier."
    ///
    /// The old ramp failed in a way that was invisible until the tapes showed it. A cold start
    /// opened against a Novice — capped at 2.40 G with no lookahead at all, against a pilot pulling
    /// 8-12 G — so the opening opponent could not turn, could not convert, and never fired. Every
    /// page load restarted there, and a short sortie meant the warm-up was the ONLY opponent the
    /// pilot ever met. Successive difficulty builds kept improving fights that were rarely reached.
    ///
    /// Easing is now the director's job rather than a scripted ramp, and it is EVIDENCE-driven:
    /// FightDirector drops a tier per fight while the player is losing (Ace -> Veteran ->
    /// Competent -> Novice across four straight defeats), and the mount steps back down with it.
    /// A pilot who is genuinely new finds the floor within a couple of fights; a pilot who can
    /// hold their own never sees it.
    public static PilotSkill ForEngagement(int engagementNumber) =>
        engagementNumber >= 1 ? PilotSkill.Ace : PilotSkill.Ace;
}
