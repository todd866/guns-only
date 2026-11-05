namespace GunsOnly.PlaytestLab;

/// <summary>
/// Chooses whether the lab pilot accepts the director's combat handoff or keeps
/// flying the beat-7 ladder.  This is deliberately pure so the policy can be
/// checked without constructing a physics session.
/// </summary>
public static class LabStayOrGoPolicy {
    public readonly record struct Inputs(
        bool EscalatingWavesEnabled,
        int CompletedEngagements,
        double PlayerHealth,
        bool BingoFuel,
        int AmmoRemaining,
        string Pilot);

    public static bool ShouldRequestRtb(Inputs input) {
        if (input.BingoFuel || input.AmmoRemaining <= 0) return true;
        // The legacy beats have a finite combat handoff. Preserve that behavior
        // and keep the clone's policy unchanged when the ladder is enabled.
        if (!input.EscalatingWavesEnabled) return true;
        if (input.Pilot == "clone") return true;
        if (input.Pilot == "novice")
            return input.CompletedEngagements >= 2 || input.PlayerHealth < 0.999;
        // A light graze (at most 10% health) may be tolerated; meaningful damage
        // ends the attempt immediately, including mid-wave. W5 is the last risk
        // the lab ace elects to take, not an invitation to stay until shot down.
        return input.PlayerHealth < .9 || input.CompletedEngagements >= 5;
    }
}
