namespace GunsOnly.Sim.Doctrine;

public enum SkillBand {
    Struggling = 0,
    Steady = 1,
    Sharp = 2,
    Dominant = 3,
}

public readonly record struct LearnerBands(
    SkillBand Gunnery,
    SkillBand Energy,
    SkillBand DefensiveBfm) {
    public SkillBand Overall {
        get {
            int gunnery = (int)Gunnery;
            int energy = (int)Energy;
            int defensiveBfm = (int)DefensiveBfm;
            int median = gunnery + energy + defensiveBfm
                - Math.Min(gunnery, Math.Min(energy, defensiveBfm))
                - Math.Max(gunnery, Math.Max(energy, defensiveBfm));
            return (SkillBand)median;
        }
    }
}

/// <summary>
/// A deterministic, session-local estimate of three player skill concepts. Evidence is retained
/// for four ordinary engagements. Every marker contributes only when its report contains the
/// corresponding opportunity, and all score aggregation and band thresholds are integer-valued.
/// </summary>
public sealed class LearnerModel {
    const int WindowSize = 4;

    // The gaps between upward and downward thresholds are the hysteresis margins.
    const int StrugglingToSteady = 35;
    const int SteadyToSharp = 75;
    const int SharpToDominant = 90;
    const int SteadyToStruggling = 20;
    const int SharpToSteady = 55;
    const int DominantToSharp = 70;

    readonly EngagementReport[] _window = new EngagementReport[WindowSize];
    int _windowCount;
    int _nextWindowIndex;
    LearnerBands _bands;

    public LearnerModel() {
        Reset();
    }

    public LearnerBands Bands => _bands;
    public int WinStreak { get; private set; }
    public int LossStreak { get; private set; }
    public double SecondsSinceLastDefeat { get; private set; }

    public void Observe(in EngagementReport report) {
        ObserveRunContext(in report);

        // A boss is deliberate out-of-distribution pressure. Its outcome matters to pacing, but
        // neither a loss nor a win is evidence for the ordinary-fight skill estimate.
        if (report.OpponentWasBoss) return;

        _window[_nextWindowIndex] = report;
        _nextWindowIndex = (_nextWindowIndex + 1) % WindowSize;
        if (_windowCount < WindowSize) _windowCount++;

        int gunneryScore = ScoreGunnery(out bool hasGunneryEvidence);
        int energyScore = ScoreEnergy(out bool hasEnergyEvidence);
        int defensiveScore = ScoreDefensiveBfm(out bool hasDefensiveEvidence);
        _bands = new LearnerBands(
            MoveOneBand(_bands.Gunnery, gunneryScore, hasGunneryEvidence),
            MoveOneBand(_bands.Energy, energyScore, hasEnergyEvidence),
            MoveOneBand(_bands.DefensiveBfm, defensiveScore, hasDefensiveEvidence));
    }

    public void Reset() {
        Array.Clear(_window);
        _windowCount = 0;
        _nextWindowIndex = 0;
        _bands = new LearnerBands(
            SkillBand.Steady,
            SkillBand.Steady,
            SkillBand.Steady);
        WinStreak = 0;
        LossStreak = 0;
        SecondsSinceLastDefeat = 0.0;
    }

    void ObserveRunContext(in EngagementReport report) {
        switch (report.Outcome) {
            case SortieOutcome.Victory:
                WinStreak++;
                LossStreak = 0;
                break;
            case SortieOutcome.Defeat:
                WinStreak = 0;
                LossStreak++;
                SecondsSinceLastDefeat = 0.0;
                return;
            default:
                WinStreak = 0;
                LossStreak = 0;
                break;
        }

        if (double.IsFinite(report.DurationSeconds)
            && report.DurationSeconds > 0.0)
            SecondsSinceLastDefeat += report.DurationSeconds;
    }

    int ScoreGunnery(out bool hasEvidence) {
        int score = 0;
        int opportunities = 0;
        ForEachReport(report => {
            if (report.ShotsTotal <= 0) return;

            int shotsInWindow = Math.Clamp(
                report.ShotsInWindow, 0, report.ShotsTotal);
            long ratio = (long)shotsInWindow * 100L;
            long total = report.ShotsTotal;
            score += ratio >= total * 75L ? 100
                : ratio >= total * 50L ? 67
                : ratio >= total * 25L ? 33
                : 0;
            opportunities++;

            if (report.Outcome != SortieOutcome.Victory) return;
            score += report.ShotsTotal <= 4 ? 100
                : report.ShotsTotal <= 8 ? 67
                : report.ShotsTotal <= 16 ? 33
                : 0;
            opportunities++;
        });
        hasEvidence = opportunities > 0;
        return hasEvidence ? score / opportunities : 0;
    }

    int ScoreEnergy(out bool hasEvidence) {
        int score = 0;
        int opportunities = 0;
        ForEachReport(report => {
            if (double.IsFinite(report.MinimumEnergyKias)
                && report.MinimumEnergyKias >= 0.0) {
                score += report.MinimumEnergyKias >= 300.0 ? 100
                    : report.MinimumEnergyKias >= 240.0 ? 67
                    : report.MinimumEnergyKias >= 180.0 ? 33
                    : 0;
                opportunities++;
            }

            // A clean closure-control marker is meaningful only when the opponent has the
            // lookahead capability that can actively force the overshoot.
            if (report.OpponentSkill < PilotSkill.Veteran) return;
            score += report.Overshoots <= 0 ? 100
                : report.Overshoots == 1 ? 33
                : 0;
            opportunities++;
        });
        hasEvidence = opportunities > 0;
        return hasEvidence ? score / opportunities : 0;
    }

    int ScoreDefensiveBfm(out bool hasEvidence) {
        int score = 0;
        int opportunities = 0;
        ForEachReport(report => {
            if (!double.IsFinite(report.DurationSeconds)
                || report.DurationSeconds <= 0.0)
                return;

            double solutionSeconds = double.IsFinite(
                report.SolutionSecondsConceded)
                ? Math.Max(0.0, report.SolutionSecondsConceded)
                : report.DurationSeconds;
            score += solutionSeconds * 100.0 <= report.DurationSeconds * 2.0 ? 100
                : solutionSeconds * 100.0 <= report.DurationSeconds * 8.0 ? 67
                : solutionSeconds * 100.0 <= report.DurationSeconds * 20.0 ? 33
                : 0;
            opportunities++;

            score += report.HitsTaken <= 0 ? 100
                : report.HitsTaken == 1 ? 67
                : report.HitsTaken == 2 ? 33
                : 0;
            opportunities++;

            score += report.GcasActivations <= 0 ? 100 : 0;
            opportunities++;
        });
        hasEvidence = opportunities > 0;
        return hasEvidence ? score / opportunities : 0;
    }

    void ForEachReport(Action<EngagementReport> observe) {
        for (int index = 0; index < _windowCount; index++)
            observe(_window[index]);
    }

    static SkillBand MoveOneBand(
        SkillBand current,
        int rawScore,
        bool hasEvidence) {
        if (!hasEvidence) return current;

        return current switch {
            SkillBand.Struggling when rawScore >= StrugglingToSteady
                => SkillBand.Steady,
            SkillBand.Steady when rawScore >= SteadyToSharp
                => SkillBand.Sharp,
            SkillBand.Steady when rawScore <= SteadyToStruggling
                => SkillBand.Struggling,
            SkillBand.Sharp when rawScore >= SharpToDominant
                => SkillBand.Dominant,
            SkillBand.Sharp when rawScore <= SharpToSteady
                => SkillBand.Steady,
            SkillBand.Dominant when rawScore <= DominantToSharp
                => SkillBand.Sharp,
            _ => current,
        };
    }
}
