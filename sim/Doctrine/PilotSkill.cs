namespace GunsOnly.Sim.Doctrine;

/// Opponent competence tiers for the roguelite escalation. The ladder spans a deliberately dumb
/// novice up to a genuinely threatening ace; the gauntlet spawns higher tiers toward the climax.
public enum PilotSkill { Novice, Competent, Veteran, Ace }

/// How readily a pilot leaves the traditional perch to fight a target in the low block.
public enum LowBlockDoctrine {
    Conservative,
    BoomAndZoom,
    Hunt
}

/// Skill-gated knobs read by ReactiveBandit. Competent reproduces the historical hard-coded
/// bandit (g = 1.15 + angle*1.45, capped 3.20; no overshoot/disengage/doctrine variety) within
/// the historical envelope; higher tiers unlock capability. DELIBERATE departures from strict
/// tick-for-tick legacy parity, applied to every tier since Build 69: floors are measured above
/// real terrain rather than sea level, a last-instance terrain-recovery reflex pre-empts the
/// tactical layers at low altitude, and a bandit pinned at its ceiling by a player camping above
/// extends away instead of hovering. Over open water in the historical altitude band, behaviour
/// remains bit-identical.
///
/// LookaheadHorizonTicks gates the short-horizon lookahead BFM decision layer: 0 keeps the tier on
/// the flat-turn state machine EXACTLY (Novice, Competent), while a bounded positive value lets
/// Veteran/Ace roll candidate maneuvers forward in the deterministic kernel and fly the one that
/// best improves the future firing position (at 120 Hz, ~90 ticks ~= 0.75 s, ~150 ticks ~= 1.25 s).
public readonly record struct BanditSkillProfile(
    double MaxAcquireG, double AcquireGGain, bool ForcesOvershoot,
    bool DisengagesWhenLosing, int DoctrineCount, int LookaheadHorizonTicks,
    double FireConeDeg = 3.0,
    LowBlockDoctrine LowBlockDoctrine = LowBlockDoctrine.Conservative,
    double LowBlockClearanceM = 260.0,
    double LowBlockRecommitSeconds = 0.0,
    bool IsBoss = false,
    double CommitDominanceSeconds = 8.0) {
    /// Trigger nose-error gate in radians. Novice/Competent keep the historical 3-degree
    /// discipline exactly. The Veteran deliberately shoots a WIDER gate: with honest ballistics a
    /// wide-gate burst is tracer pressure and near misses — the mid-ladder player finally gets
    /// shot AT without the hit probability of an ace. The Ace stays nearly disciplined.
    public double FireConeRad => FireConeDeg * System.Math.PI / 180.0;

    public static BanditSkillProfile For(PilotSkill skill) => skill switch {
        PilotSkill.Novice => new(
            2.40, 1.00, false, false, 1, 0),
        PilotSkill.Competent => new(
            3.20, 1.45, false, false, 1, 0,
            LowBlockDoctrine: LowBlockDoctrine.BoomAndZoom,
            LowBlockClearanceM: 180.0,
            LowBlockRecommitSeconds: 5.0),
        PilotSkill.Veteran => new(
            5.50, 1.80, false, true, 2, 90,
            FireConeDeg: 5.0,
            LowBlockDoctrine: LowBlockDoctrine.Hunt,
            LowBlockClearanceM: 180.0,
            LowBlockRecommitSeconds: 1.8),
        PilotSkill.Ace => new(
            9.00, 2.20, true, true, 3, 150,
            FireConeDeg: 3.5,
            LowBlockDoctrine: LowBlockDoctrine.Hunt,
            LowBlockClearanceM: 105.0,
            LowBlockRecommitSeconds: 0.35),
        _ => For(PilotSkill.Competent),
    };

    /// The Fight Director's cat: an Ace whose stalk phase raises the fire-control quality bar
    /// (1.8 deg — it declines marginal shots, which reads as toying and is honest) until a
    /// deterministic commit trigger in ReactiveBandit drops it back to the Ace gate and it rolls
    /// in for the kill. Same lookahead, same BanditFireControl, no thrown fights.
    public static BanditSkillProfile Boss() =>
        For(PilotSkill.Ace) with { FireConeDeg = 1.8, IsBoss = true };

    /// Deterministic per-wave escalation curve for the flagship continuous-combat gauntlet: a pure
    /// function of the 1-based engagement number, with NO RNG, wall clock, or date. The very first
    /// fight is a gentle warm-up and it hardens toward the climax.
    ///
    /// INTERIM / TUNABLE CURVE: engagement 1 fields a Novice, 2 a Competent, 3 a Veteran, and 4+ an
    /// Ace. This is a deliberately beatable ramp so the opening merge is forgiving; a later
    /// performance-based curve (scaling to how the player is actually doing) replaces it. Until then,
    /// reshape the ramp by editing only this mapping.
    public static PilotSkill ForEngagement(int engagementNumber) => engagementNumber switch {
        <= 1 => PilotSkill.Novice,
        2 => PilotSkill.Competent,
        3 => PilotSkill.Veteran,
        _ => PilotSkill.Ace,
    };
}
