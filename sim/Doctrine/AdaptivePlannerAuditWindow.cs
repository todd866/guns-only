namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// Artifact-specific quality rule for exact audits of otherwise student-eligible decisions.
/// </summary>
public readonly record struct AdaptivePlannerAuditWindowConfig(
    int Capacity,
    double MaximumPositiveRelativeRegret);

/// <summary>
/// Fixed-size, allocation-free-after-construction audit history for adaptive planner routing.
/// Only completed in-distribution shadow comparisons enter the window. A quality pass requires
/// the exact choice to appear in the student's top three and normalized regret to remain below
/// the caller's artifact-specific bound.
/// </summary>
public sealed class AdaptivePlannerAuditWindow {
    const byte AgreementFlag = 1 << 0;
    const byte QualityFlag = 1 << 1;
    public const int MaximumCapacity = 4096;

    readonly byte[] _outcomes;
    readonly double _maximumPositiveRelativeRegret;
    int _nextIndex;
    int _count;
    int _agreements;
    int _qualityPasses;
    int _consecutiveDisagreements;

    public AdaptivePlannerAuditWindow(
        in AdaptivePlannerAuditWindowConfig config) {
        if (config.Capacity is < 1 or > MaximumCapacity)
            throw new ArgumentOutOfRangeException(
                nameof(config),
                $"Audit capacity must be between 1 and {MaximumCapacity}.");
        if (!double.IsFinite(config.MaximumPositiveRelativeRegret)
            || config.MaximumPositiveRelativeRegret is < 0.0 or > 1.0)
            throw new ArgumentOutOfRangeException(
                nameof(config),
                "Maximum normalized regret must be finite and in [0, 1].");

        _outcomes = new byte[config.Capacity];
        _maximumPositiveRelativeRegret =
            config.MaximumPositiveRelativeRegret;
    }

    public int Capacity => _outcomes.Length;
    public double MaximumPositiveRelativeRegret =>
        _maximumPositiveRelativeRegret;

    /// <summary>
    /// Records one exact/student comparison. Skipped, OOD, or malformed diagnostics are rejected
    /// and leave the trusted history unchanged.
    /// </summary>
    public bool Record(in PlannerShadowResult result) {
        if (!IsValidEvaluatedResult(result))
            return false;

        byte outcome = 0;
        if (result.Agreement)
            outcome |= AgreementFlag;
        if (result.ExactInStudentTopThree
            && result.PositiveRelativeRegret
                <= _maximumPositiveRelativeRegret)
            outcome |= QualityFlag;

        if (_count == _outcomes.Length) {
            byte removed = _outcomes[_nextIndex];
            if ((removed & AgreementFlag) != 0)
                _agreements--;
            if ((removed & QualityFlag) != 0)
                _qualityPasses--;
        } else {
            _count++;
        }

        _outcomes[_nextIndex] = outcome;
        _nextIndex++;
        if (_nextIndex == _outcomes.Length)
            _nextIndex = 0;
        if ((outcome & AgreementFlag) != 0) {
            _agreements++;
            _consecutiveDisagreements = 0;
        } else {
            _consecutiveDisagreements = System.Math.Min(
                _count,
                _consecutiveDisagreements + 1);
        }
        if ((outcome & QualityFlag) != 0)
            _qualityPasses++;
        return true;
    }

    public AdaptivePlannerQualityWindow GetQualityWindow() =>
        new(
            EvaluatedSamples: _count,
            Agreements: _agreements,
            QualityPasses: _qualityPasses,
            ConsecutiveDisagreements: _consecutiveDisagreements);

    public AdaptivePlannerQualityWindow Reset() {
        AdaptivePlannerQualityWindow previous = GetQualityWindow();
        Array.Clear(_outcomes);
        _nextIndex = 0;
        _count = 0;
        _agreements = 0;
        _qualityPasses = 0;
        _consecutiveDisagreements = 0;
        return previous;
    }

    static bool IsValidEvaluatedResult(
        in PlannerShadowResult result) =>
        result.Evaluated
        && result.OodReasons == PlannerShadowOodReason.None
        && result.ExactCandidateIndex is >= 0
            and < PlannerIntegerRanker.CandidateCount
        && result.StudentCandidateIndex is >= 0
            and < PlannerIntegerRanker.CandidateCount
        && result.StudentRunnerUpCandidateIndex is >= -1
            and < PlannerIntegerRanker.CandidateCount
        && result.StudentThirdCandidateIndex is >= -1
            and < PlannerIntegerRanker.CandidateCount
        && result.StudentRunnerUpCandidateIndex
            != result.StudentCandidateIndex
        && result.StudentThirdCandidateIndex
            != result.StudentCandidateIndex
        && (result.StudentThirdCandidateIndex < 0
            || result.StudentThirdCandidateIndex
                != result.StudentRunnerUpCandidateIndex)
        && result.Agreement
            == (result.ExactCandidateIndex
                == result.StudentCandidateIndex)
        && result.ExactInStudentTopThree
            == (result.ExactCandidateIndex
                    == result.StudentCandidateIndex
                || result.ExactCandidateIndex
                    == result.StudentRunnerUpCandidateIndex
                || result.ExactCandidateIndex
                    == result.StudentThirdCandidateIndex)
        && result.IntegerMargin >= 0
        && double.IsFinite(result.PositiveRelativeRegret)
        && result.PositiveRelativeRegret is >= 0.0 and <= 1.0
        && (!result.Agreement
            || result.PositiveRelativeRegret == 0.0);
}
