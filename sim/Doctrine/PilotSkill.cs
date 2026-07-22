namespace GunsOnly.Sim.Doctrine;

/// Opponent competence tiers for the roguelite escalation. The ladder spans a deliberately dumb
/// novice up to a genuinely threatening ace; the gauntlet spawns higher tiers toward the climax.
public enum PilotSkill { Novice, Competent, Veteran, Ace }

/// Skill-gated knobs read by ReactiveBandit. Competent MUST reproduce the historical hard-coded
/// bandit (g = 1.15 + angle*1.45, capped 3.20; no overshoot/disengage/doctrine variety) so existing
/// behaviour and tests are unchanged; higher tiers unlock capability.
///
/// LookaheadHorizonTicks gates the short-horizon lookahead BFM decision layer: 0 keeps the tier on
/// the flat-turn state machine EXACTLY (Novice, Competent), while a bounded positive value lets
/// Veteran/Ace roll candidate maneuvers forward in the deterministic kernel and fly the one that
/// best improves the future firing position (at 120 Hz, ~90 ticks ~= 0.75 s, ~150 ticks ~= 1.25 s).
public readonly record struct BanditSkillProfile(
    double MaxAcquireG, double AcquireGGain, bool ForcesOvershoot,
    bool DisengagesWhenLosing, int DoctrineCount, int LookaheadHorizonTicks) {
    public static BanditSkillProfile For(PilotSkill skill) => skill switch {
        PilotSkill.Novice    => new(2.40, 1.00, false, false, 1, 0),
        PilotSkill.Competent => new(3.20, 1.45, false, false, 1, 0),
        PilotSkill.Veteran   => new(5.50, 1.80, false, true, 2, 90),
        PilotSkill.Ace       => new(9.00, 2.20, true, true, 3, 150),
        _ => For(PilotSkill.Competent),
    };

    /// Deterministic per-wave escalation curve for the flagship continuous-combat gauntlet: a pure
    /// function of the 1-based engagement number, with NO RNG, wall clock, or date. The player meets
    /// a genuinely threatening pilot from the opening merge and it hardens toward the climax.
    ///
    /// PROVISIONAL / TUNABLE: engagement 1-2 field a Veteran, 3+ an Ace. This is the initial curve;
    /// widen it (e.g. a Competent warm-up, or a Novice tutorial wave) by editing only this mapping.
    public static PilotSkill ForEngagement(int engagementNumber) =>
        engagementNumber <= 2 ? PilotSkill.Veteran : PilotSkill.Ace;
}
