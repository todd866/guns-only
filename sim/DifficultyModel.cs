namespace GunsOnly.Sim;

/// PLACEHOLDER difficulty stub. Level 0 is BASELINE — no deck motion, every physical trap accepted —
/// so the carrier recovery behaves byte-identically to the pre-difficulty build. This exists only to
/// keep the partial Carrier scaffolding (deck pitch/heave, difficulty-gated trap) compiling at
/// baseline. The real VARIABLE (non-monotonic) difficulty ramp — calm/rough passes around a rising
/// skill baseline, easing after a bolter, spiking after a streak — is a follow-up task; do not read
/// this as the design.
public readonly struct RecoveryDifficulty {
    public int Level { get; }
    public double DeckPitchAmplitudeRad { get; }
    public double DeckPitchPeriodSeconds { get; }
    public double DeckHeaveAmplitudeM { get; }
    public double DeckHeavePeriodSeconds { get; }

    public RecoveryDifficulty(int level, double deckPitchAmplitudeRad, double deckPitchPeriodSeconds,
                              double deckHeaveAmplitudeM, double deckHeavePeriodSeconds) {
        Level = level;
        DeckPitchAmplitudeRad = deckPitchAmplitudeRad;
        DeckPitchPeriodSeconds = deckPitchPeriodSeconds;
        DeckHeaveAmplitudeM = deckHeaveAmplitudeM;
        DeckHeavePeriodSeconds = deckHeavePeriodSeconds;
    }

    /// Baseline accepts every physical trap. The variable ramp will tighten this at higher levels.
    public bool AcceptsTrap(Carrier carrier, in AircraftState state) => true;
}

public static class DifficultyModel {
    // Baseline only: Level 0 regardless of argument. Periods are placeholders (unused while amplitudes
    // are zero). The variable model replaces this.
    public static RecoveryDifficulty ForLevel(int level) =>
        new RecoveryDifficulty(0, 0.0, 6.0, 0.0, 8.0);
}
