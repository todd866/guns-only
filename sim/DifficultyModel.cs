namespace GunsOnly.Sim;

/// Conditions for one carrier approach. All values are immutable so an attempt can be recorded and
/// replayed without consulting wall time or mutable weather. Level zero deliberately carries the
/// pre-difficulty carrier values: no deck motion, BUILD 27 burble, and no quality gate after physical
/// deck contact.
public readonly struct RecoveryDifficulty {
    public int Level { get; }
    public int SkillBaselineLevel { get; }
    public int FloorLevel { get; }
    public int AttemptIndex { get; }
    public int Variation { get; }
    public bool IsEased { get; }
    public bool IsSpike { get; }
    public string Label { get; }

    public double BurbleIntensityMps { get; }
    public double BurbleSinkMps { get; }
    public ulong TurbulenceSeed { get; }
    public double DeckPitchAmplitudeRad { get; }
    public double DeckPitchPeriodSeconds { get; }
    public double DeckHeaveAmplitudeM { get; }
    public double DeckHeavePeriodSeconds { get; }
    public double MaxTrapSinkMps { get; }
    public double MaxTrapLineupErrorM { get; }
    public double MinTrapSpeedMps { get; }
    public double MaxTrapSpeedMps { get; }

    /// Retains the scaffolding constructor for kernel callers that supply custom deck motion.
    /// The selected level still supplies the shared wind and trap-window tuning.
    public RecoveryDifficulty(
        int level, double deckPitchAmplitudeRad, double deckPitchPeriodSeconds,
        double deckHeaveAmplitudeM, double deckHeavePeriodSeconds) {
        var tuned = DifficultyModel.ForLevel(level);
        Level = tuned.Level;
        SkillBaselineLevel = tuned.SkillBaselineLevel;
        FloorLevel = tuned.FloorLevel;
        AttemptIndex = tuned.AttemptIndex;
        Variation = tuned.Variation;
        IsEased = tuned.IsEased;
        IsSpike = tuned.IsSpike;
        Label = tuned.Label;
        BurbleIntensityMps = tuned.BurbleIntensityMps;
        BurbleSinkMps = tuned.BurbleSinkMps;
        TurbulenceSeed = tuned.TurbulenceSeed;
        DeckPitchAmplitudeRad = deckPitchAmplitudeRad;
        DeckPitchPeriodSeconds = deckPitchPeriodSeconds;
        DeckHeaveAmplitudeM = deckHeaveAmplitudeM;
        DeckHeavePeriodSeconds = deckHeavePeriodSeconds;
        MaxTrapSinkMps = tuned.MaxTrapSinkMps;
        MaxTrapLineupErrorM = tuned.MaxTrapLineupErrorM;
        MinTrapSpeedMps = tuned.MinTrapSpeedMps;
        MaxTrapSpeedMps = tuned.MaxTrapSpeedMps;
    }

    internal RecoveryDifficulty(
        int level,
        int skillBaselineLevel,
        int floorLevel,
        int attemptIndex,
        int variation,
        bool isEased,
        bool isSpike,
        string label,
        double burbleIntensityMps,
        double burbleSinkMps,
        ulong turbulenceSeed,
        double deckPitchAmplitudeRad,
        double deckPitchPeriodSeconds,
        double deckHeaveAmplitudeM,
        double deckHeavePeriodSeconds,
        double maxTrapSinkMps,
        double maxTrapLineupErrorM,
        double minTrapSpeedMps,
        double maxTrapSpeedMps) {
        Level = level;
        SkillBaselineLevel = skillBaselineLevel;
        FloorLevel = floorLevel;
        AttemptIndex = attemptIndex;
        Variation = variation;
        IsEased = isEased;
        IsSpike = isSpike;
        Label = label;
        BurbleIntensityMps = burbleIntensityMps;
        BurbleSinkMps = burbleSinkMps;
        TurbulenceSeed = turbulenceSeed;
        DeckPitchAmplitudeRad = deckPitchAmplitudeRad;
        DeckPitchPeriodSeconds = deckPitchPeriodSeconds;
        DeckHeaveAmplitudeM = deckHeaveAmplitudeM;
        DeckHeavePeriodSeconds = deckHeavePeriodSeconds;
        MaxTrapSinkMps = maxTrapSinkMps;
        MaxTrapLineupErrorM = maxTrapLineupErrorM;
        MinTrapSpeedMps = minTrapSpeedMps;
        MaxTrapSpeedMps = maxTrapSpeedMps;
    }

    /// Compare a touchdown with the current adaptive training target. This is proficiency feedback,
    /// never hook or arresting-gear physics: weather/difficulty may make the task harder, but it may
    /// not make an intercepted pendant disappear. Callers should supply ideal IAS/CAS.
    public bool MeetsAdaptiveTarget(Carrier carrier, in AircraftState state,
        double indicatedAirspeedMps = double.NaN) {
        if (Level <= 0) return true;

        var (_, cross, _) = carrier.LandingFrame(state.Position);
        double sinkMps = carrier.DeckSinkRateMps(state);
        double measuredIasMps = double.IsFinite(indicatedAirspeedMps)
            && indicatedAirspeedMps >= 0.0
            ? indicatedAirspeedMps
            : AirData.IndicatedAirspeedMps(
                carrier.AirspeedMps(state), state.Position.Y);
        return sinkMps <= MaxTrapSinkMps
            && System.Math.Abs(cross) <= MaxTrapLineupErrorM
            && measuredIasMps >= MinTrapSpeedMps
            && measuredIasMps <= MaxTrapSpeedMps;
    }
}

/// Meta-progression retained by the shell across beat restarts. It has no clock and no random
/// source: BeginAttempt is the only operation that advances the deterministic attempt sequence.
public sealed class RecoveryProgress {
    public int CleanTrapCount { get; private set; }
    public int CleanStreak { get; private set; }
    public int RecentSetbacks { get; private set; }
    public int AttemptCount { get; private set; }

    /// Inspect the conditions for the next pass without consuming it. Mission staging and Ready
    /// screens use this so rebuilding a briefing cannot advance weather or adaptation state.
    public RecoveryDifficulty PreviewNextAttempt() => DifficultyModel.ForAttempt(
        CleanTrapCount, CleanStreak, RecentSetbacks, AttemptCount);

    public RecoveryDifficulty BeginAttempt() {
        var difficulty = PreviewNextAttempt();
        AttemptCount++;
        // Ease is recovery support, not a permanent lower mode. One retained setback ages out each
        // time it helps a pass; back-to-back misses can therefore soften at most the next two.
        RecentSetbacks = System.Math.Max(0, RecentSetbacks - 1);
        return difficulty;
    }

    public void RecordCleanTrap() {
        CleanTrapCount++;
        CleanStreak++;
        // A success lets an old setback age out; this avoids pinning a recovering pilot on EASY.
        RecentSetbacks = System.Math.Max(0, RecentSetbacks - 1);
    }

    /// A stopped aircraft is a physical recovery, not automatically evidence of a clean pass.
    /// OK/FAIR touchdown grades advance mastery; NO GRADE remains a safe recovery without inflating
    /// the proficiency curve. CUT cannot normally reach the stopped phase, but is handled safely.
    public void RecordRecoveredTrap(Carrier.TouchdownGrade grade) {
        if (grade is Carrier.TouchdownGrade.Ok or Carrier.TouchdownGrade.Fair) {
            RecordCleanTrap();
            return;
        }
        CleanStreak = 0;
    }

    public void RecordSetback() {
        CleanStreak = 0;
        // Two retained setbacks are enough to reach the full ease allowance. More misses never
        // drive conditions below the earned floor and therefore never create an exploit or cliff.
        RecentSetbacks = System.Math.Min(2, RecentSetbacks + 1);
    }
}

public static class DifficultyModel {
    public const int MaxLevel = 5;

    // PLACEHOLDER / TUNABLE weather schedule. It is intentionally non-monotonic: a calm gift can
    // follow a rough pass even as the long-term skill baseline rises. A table makes that property
    // explicit and testable instead of depending on a lucky run of a pseudo-random hash.
    static readonly int[] VariationCycle = [0, 1, -1, 2, -1, 1, -2, 0];

    /// Pure per-attempt policy. Mastery raises the centre of the band; weather moves around it;
    /// recent bolters/wave-offs ease it; each third clean-trap streak permits one tough spike.
    public static RecoveryDifficulty ForAttempt(
        int cleanTrapCount, int cleanStreak, int recentSetbacks, int attemptIndex) {
        cleanTrapCount = System.Math.Max(0, cleanTrapCount);
        cleanStreak = System.Math.Max(0, cleanStreak);
        recentSetbacks = System.Math.Clamp(recentSetbacks, 0, 2);
        attemptIndex = System.Math.Max(0, attemptIndex);

        // No earned trap, no ramp. This also guarantees the very first approach is today's exact
        // baseline even if the player restarts before touching down.
        if (cleanTrapCount == 0)
            return WithAttempt(ForLevel(0), 0, 0, attemptIndex, 0,
                isEased: false, isSpike: false, DifficultyModel.BaselineSeed);

        // PLACEHOLDER / TUNABLE mastery curve: first clean trap unlocks level 1, then roughly two
        // additional clean traps buy each baseline level. The top is deliberately winnable.
        int baseline = System.Math.Min(MaxLevel, (cleanTrapCount + 1) / 2);
        int floor = System.Math.Max(0, baseline - 1);
        int variation = VariationCycle[attemptIndex % VariationCycle.Length];
        int ease = recentSetbacks;
        bool isSpike = cleanStreak >= 3 && cleanStreak % 3 == 0;
        int spike = isSpike ? 2 : 0;
        int level = System.Math.Clamp(baseline + variation - ease + spike, floor, MaxLevel);
        ulong seed = WeatherSeed(attemptIndex, cleanTrapCount);
        return WithAttempt(ForLevel(level), baseline, floor, attemptIndex, variation,
            isEased: ease > 0, isSpike, seed);
    }

    /// PLACEHOLDER / TUNABLE winnable band. Level 0 values are the old live values exactly. Higher
    /// rows progressively add burble, deterministic deck motion, and narrower—but still flyable—
    /// trap windows. A normal 70 m/s, 3.5-degree approach sinks at ~4.3 m/s, below the level-5 cap.
    public static RecoveryDifficulty ForLevel(int level) {
        level = System.Math.Clamp(level, 0, MaxLevel);
        const double Deg = System.Math.PI / 180.0;
        return level switch {
            0 => Tuned(0, "CALM", 3.00, 1.80, BaselineSeed,
                0.00 * Deg, 6.0, 0.00, 8.0,
                double.PositiveInfinity, double.PositiveInfinity, 0.0, double.PositiveInfinity),
            1 => Tuned(1, "MODERATE · BURBLE", 3.15, 1.90, BaselineSeed,
                0.20 * Deg, 8.6, 0.12, 10.2, 7.0, 14.0, 58.0, 82.0),
            2 => Tuned(2, "MODERATE · MOVING DECK", 3.45, 2.00, BaselineSeed,
                0.45 * Deg, 8.2, 0.25, 9.7, 6.6, 12.0, 60.0, 80.0),
            3 => Tuned(3, "ROUGH · PITCHING DECK", 3.80, 2.15, BaselineSeed,
                0.75 * Deg, 7.8, 0.42, 9.2, 6.2, 10.5, 62.0, 78.0),
            4 => Tuned(4, "ROUGH · PITCHING DECK", 4.15, 2.30, BaselineSeed,
                1.00 * Deg, 7.4, 0.62, 8.7, 5.8, 9.0, 63.5, 76.5),
            _ => Tuned(5, "ROUGH · PITCHING DECK", 4.50, 2.45, BaselineSeed,
                1.25 * Deg, 7.0, 0.80, 8.2, 5.4, 8.0, 65.0, 75.0),
        };
    }

    const ulong BaselineSeed = 0xB0A7UL;

    static RecoveryDifficulty Tuned(
        int level, string label, double burbleIntensityMps, double burbleSinkMps,
        ulong turbulenceSeed, double pitchAmplitudeRad, double pitchPeriodSeconds,
        double heaveAmplitudeM, double heavePeriodSeconds, double maxSinkMps,
        double maxLineupErrorM, double minSpeedMps, double maxSpeedMps) =>
        new(level, level, System.Math.Max(0, level - 1), 0, 0, false, false, label,
            burbleIntensityMps, burbleSinkMps, turbulenceSeed,
            pitchAmplitudeRad, pitchPeriodSeconds, heaveAmplitudeM, heavePeriodSeconds,
            maxSinkMps, maxLineupErrorM, minSpeedMps, maxSpeedMps);

    static RecoveryDifficulty WithAttempt(
        in RecoveryDifficulty tuned, int baseline, int floor, int attemptIndex, int variation,
        bool isEased, bool isSpike, ulong turbulenceSeed) =>
        new(tuned.Level, baseline, floor, attemptIndex, variation, isEased, isSpike, tuned.Label,
            tuned.BurbleIntensityMps, tuned.BurbleSinkMps, turbulenceSeed,
            tuned.DeckPitchAmplitudeRad, tuned.DeckPitchPeriodSeconds,
            tuned.DeckHeaveAmplitudeM, tuned.DeckHeavePeriodSeconds,
            tuned.MaxTrapSinkMps, tuned.MaxTrapLineupErrorM,
            tuned.MinTrapSpeedMps, tuned.MaxTrapSpeedMps);

    // SplitMix-style integer avalanche: stable in WASM/native .NET and dependent only on progress.
    static ulong WeatherSeed(int attemptIndex, int cleanTrapCount) {
        unchecked {
            ulong z = BaselineSeed
                ^ ((ulong)(uint)attemptIndex * 0x9e3779b97f4a7c15UL)
                ^ ((ulong)(uint)cleanTrapCount * 0xd1b54a32d192ed03UL);
            z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9UL;
            z = (z ^ (z >> 27)) * 0x94d049bb133111ebUL;
            return z ^ (z >> 31);
        }
    }
}
