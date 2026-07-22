namespace GunsOnly.Sim.Doctrine;

/// Opponent competence tiers for the roguelite escalation. The ladder spans a deliberately dumb
/// novice up to a genuinely threatening ace; the gauntlet spawns higher tiers toward the climax.
public enum PilotSkill { Novice, Competent, Veteran, Ace }

/// Skill-gated knobs read by ReactiveBandit. Competent MUST reproduce the historical hard-coded
/// bandit (g = 1.15 + angle*1.45, capped 3.20; no overshoot/disengage/doctrine variety) so existing
/// behaviour and tests are unchanged; higher tiers unlock capability.
public readonly record struct BanditSkillProfile(
    double MaxAcquireG, double AcquireGGain, bool ForcesOvershoot,
    bool DisengagesWhenLosing, int DoctrineCount) {
    public static BanditSkillProfile For(PilotSkill skill) => skill switch {
        PilotSkill.Novice    => new(2.40, 1.00, false, false, 1),
        PilotSkill.Competent => new(3.20, 1.45, false, false, 1),
        PilotSkill.Veteran   => new(5.50, 1.80, false, true, 2),
        PilotSkill.Ace       => new(9.00, 2.20, true, true, 3),
        _ => For(PilotSkill.Competent),
    };
}
