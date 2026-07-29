using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

[Collection(PlannerAllocationSensitiveCollection.Name)]
public class AdaptivePlannerAuditWindowTests {
    [Fact]
    public void RollingWindowEvictsOldEvidenceAndTracksDisagreementStreak() {
        var window = Window(capacity: 3, maximumRegret: 0.01);

        Assert.True(window.Record(Result(
            agreement: true,
            exactInTopThree: true,
            regret: 0.0)));
        Assert.True(window.Record(Result(
            agreement: false,
            exactInTopThree: true,
            regret: 0.005)));
        Assert.True(window.Record(Result(
            agreement: false,
            exactInTopThree: false,
            regret: 0.25)));

        Assert.Equal(
            new AdaptivePlannerQualityWindow(
                EvaluatedSamples: 3,
                Agreements: 1,
                QualityPasses: 2,
                ConsecutiveDisagreements: 2),
            window.GetQualityWindow());

        Assert.True(window.Record(Result(
            agreement: true,
            exactInTopThree: true,
            regret: 0.0)));
        Assert.Equal(
            new AdaptivePlannerQualityWindow(
                EvaluatedSamples: 3,
                Agreements: 1,
                QualityPasses: 2,
                ConsecutiveDisagreements: 0),
            window.GetQualityWindow());
    }

    [Fact]
    public void RegretAndTopThreeAreIndependentQualityGates() {
        var window = Window(capacity: 4, maximumRegret: 0.02);

        window.Record(Result(
            agreement: false,
            exactInTopThree: true,
            regret: 0.02));
        window.Record(Result(
            agreement: false,
            exactInTopThree: true,
            regret: 0.021));
        window.Record(Result(
            agreement: false,
            exactInTopThree: false,
            regret: 0.0));

        Assert.Equal(
            new AdaptivePlannerQualityWindow(
                EvaluatedSamples: 3,
                Agreements: 0,
                QualityPasses: 1,
                ConsecutiveDisagreements: 3),
            window.GetQualityWindow());
    }

    [Fact]
    public void SkippedOodAndMalformedResultsDoNotPolluteTrustedHistory() {
        var window = Window(capacity: 4, maximumRegret: 0.02);

        Assert.False(window.Record(Result(
            agreement: false,
            exactInTopThree: false,
            regret: 0.0) with {
                Evaluated = false
            }));
        Assert.False(window.Record(Result(
            agreement: false,
            exactInTopThree: false,
            regret: 0.0) with {
                OodReasons = PlannerShadowOodReason.ContactStale
            }));
        Assert.False(window.Record(Result(
            agreement: false,
            exactInTopThree: false,
            regret: double.NaN)));
        Assert.Equal(default, window.GetQualityWindow());
    }

    [Fact]
    public void ResetReturnsPriorValueAndClearsTheRing() {
        var window = Window(capacity: 2, maximumRegret: 0.0);
        window.Record(Result(
            agreement: true,
            exactInTopThree: true,
            regret: 0.0));

        AdaptivePlannerQualityWindow previous = window.Reset();

        Assert.Equal(1, previous.EvaluatedSamples);
        Assert.Equal(1, previous.Agreements);
        Assert.Equal(1, previous.QualityPasses);
        Assert.Equal(default, window.GetQualityWindow());
    }

    [Fact]
    public void ConstructorRejectsUnboundedOrUncalibratedInputs() {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new AdaptivePlannerAuditWindow(
                new AdaptivePlannerAuditWindowConfig(0, 0.01)));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new AdaptivePlannerAuditWindow(
                new AdaptivePlannerAuditWindowConfig(
                    AdaptivePlannerAuditWindow.MaximumCapacity + 1,
                    0.01)));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new AdaptivePlannerAuditWindow(
                new AdaptivePlannerAuditWindowConfig(64, double.NaN)));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new AdaptivePlannerAuditWindow(
                new AdaptivePlannerAuditWindowConfig(64, 1.01)));
    }

    [Fact]
    public void RecordingAllocatesNothingAfterConstruction() {
        var window = Window(capacity: 64, maximumRegret: 0.01);
        PlannerShadowResult result = Result(
            agreement: true,
            exactInTopThree: true,
            regret: 0.0);

        for (int index = 0; index < 2048; index++)
            window.Record(result);
        _ = GC.GetAllocatedBytesForCurrentThread();
        long before = GC.GetAllocatedBytesForCurrentThread();
        for (int index = 0; index < 10_000; index++)
            window.Record(result);
        long allocated = GC.GetAllocatedBytesForCurrentThread() - before;

        GC.KeepAlive(window.GetQualityWindow());
        Assert.Equal(0, allocated);
        Assert.Equal(64, window.GetQualityWindow().EvaluatedSamples);
    }

    static AdaptivePlannerAuditWindow Window(
        int capacity,
        double maximumRegret) =>
        new(new AdaptivePlannerAuditWindowConfig(
            capacity,
            maximumRegret));

    static PlannerShadowResult Result(
        bool agreement,
        bool exactInTopThree,
        double regret) =>
        new(
            Evaluated: true,
            ExactCandidateIndex: 2,
            StudentCandidateIndex: agreement ? 2 : 4,
            StudentRunnerUpCandidateIndex: 1,
            Agreement: agreement,
            StudentBestLogit: 100,
            StudentRunnerUpLogit: 80,
            IntegerMargin: 20,
            AvailabilityMask: PlannerIntegerRanker.AllCandidatesMask,
            ScorePresenceMask: PlannerIntegerRanker.AllCandidatesMask,
            FiniteScoreMask: PlannerIntegerRanker.AllCandidatesMask,
            FeatureClipBitsLow: 0,
            FeatureClipBitsHigh: 0,
            OodReasons: PlannerShadowOodReason.None,
            StudentThirdCandidateIndex:
                exactInTopThree && !agreement ? 2 : 0,
            ExactInStudentTopThree: exactInTopThree,
            PositiveRelativeRegret: regret);
}
