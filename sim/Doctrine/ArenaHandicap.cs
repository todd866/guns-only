using System;
using System.Text.Json;

namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// Converts the arena matchmaker handicap payload into a <see cref="BanditSkillProfile"/>.
/// Handicap never rewrites human airframe physics — only bot knobs.
/// </summary>
public static class ArenaHandicap {
    public static PilotSkill SkillFromToken(string? token) {
        if (string.IsNullOrWhiteSpace(token)) return PilotSkill.Competent;
        return token.Trim().ToUpperInvariant() switch {
            "NOVICE" => PilotSkill.Novice,
            "COMPETENT" => PilotSkill.Competent,
            "VETERAN" => PilotSkill.Veteran,
            "ACE" => PilotSkill.Ace,
            "MACHINE" => PilotSkill.Machine,
            _ => PilotSkill.Competent,
        };
    }

    /// <summary>Nearest discrete skill label for a continuous skillBlend in [0, 4].</summary>
    public static PilotSkill SkillFromBlend(double skillBlend) {
        int index = (int)Math.Clamp(Math.Round(skillBlend), 0, 4);
        return (PilotSkill)index;
    }

    public static BanditSkillProfile ProfileFromJson(string json) {
        using JsonDocument doc = JsonDocument.Parse(json);
        return ProfileFromElement(doc.RootElement);
    }

    public static BanditSkillProfile ProfileFromElement(JsonElement root) {
        double GetBoundedDouble(string name, double fallback, double minimum, double maximum) {
            if (!root.TryGetProperty(name, out JsonElement value)
                || value.ValueKind != JsonValueKind.Number
                || !value.TryGetDouble(out double parsed)
                || !double.IsFinite(parsed)) return fallback;
            return Math.Clamp(parsed, minimum, maximum);
        }

        bool GetBool(string name, bool fallback) =>
            root.TryGetProperty(name, out JsonElement value) && value.ValueKind is JsonValueKind.True
                or JsonValueKind.False
                ? value.GetBoolean()
                : fallback;

        int GetBoundedInt(string name, int fallback, int minimum, int maximum) {
            if (!root.TryGetProperty(name, out JsonElement value)
                || value.ValueKind != JsonValueKind.Number
                || !value.TryGetInt32(out int parsed)) return fallback;
            return Math.Clamp(parsed, minimum, maximum);
        }

        BanditSkillProfile baseline = BanditSkillProfile.For(PilotSkill.Competent);
        // The arena endpoint is untrusted input at this boundary. Keep every numeric knob inside
        // the complete Novice-to-Machine envelope even if a stale or compromised service returns
        // a syntactically valid but physically hostile profile.
        return new BanditSkillProfile(
            MaxAcquireG: GetBoundedDouble("maxAcquireG", baseline.MaxAcquireG, 2.4, 15.0),
            AcquireGGain: GetBoundedDouble("acquireGGain", baseline.AcquireGGain, 1.0, 2.2),
            ForcesOvershoot: GetBool("forcesOvershoot", baseline.ForcesOvershoot),
            DisengagesWhenLosing: GetBool("disengagesWhenLosing", baseline.DisengagesWhenLosing),
            DoctrineCount: GetBoundedInt("doctrineCount", baseline.DoctrineCount, 1, 3),
            LookaheadHorizonTicks: GetBoundedInt(
                "lookaheadHorizonTicks", baseline.LookaheadHorizonTicks, 0, 180),
            FireConeDeg: GetBoundedDouble("fireConeDeg", baseline.FireConeDeg, 3.0, 5.0),
            LeadFireConeDeg: GetBoundedDouble(
                "leadFireConeDeg", baseline.LeadFireConeDeg, 0.25, 1.25),
            LowBlockClearanceM: GetBoundedDouble(
                "lowBlockClearanceM", baseline.LowBlockClearanceM, 105.0, 260.0),
            LowBlockRecommitSeconds: GetBoundedDouble(
                "lowBlockRecommitSeconds", baseline.LowBlockRecommitSeconds, 0.0, 5.0),
            EnergyRetentionWeight: GetBoundedDouble(
                "energyRetentionWeight", baseline.EnergyRetentionWeight, 1.0, 1.3));
    }
}
