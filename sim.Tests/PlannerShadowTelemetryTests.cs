using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

[Collection(PlannerAllocationSensitiveCollection.Name)]
public class PlannerShadowTelemetryTests {
    public static TheoryData<PlannerShadowOodReason> KnownOodReasons =>
        new() {
            PlannerShadowOodReason.ObservationInvalid,
            PlannerShadowOodReason.TraceNotFull,
            PlannerShadowOodReason.CandidateTableInvalid,
            PlannerShadowOodReason.NoAvailableCandidate,
            PlannerShadowOodReason.AvailableScoreMissing,
            PlannerShadowOodReason.AvailableScoreNonFinite,
            PlannerShadowOodReason.SelectedCandidateInvalid,
            PlannerShadowOodReason.ExactSelectionMismatch,
            PlannerShadowOodReason.SkillUnsupported,
            PlannerShadowOodReason.TacticUnsupported,
            PlannerShadowOodReason.TerrainNotFlat,
            PlannerShadowOodReason.WindNotCalm,
            PlannerShadowOodReason.FormationNotIndependent,
            PlannerShadowOodReason.DoctrineUnsupported,
            PlannerShadowOodReason.BossProfile,
            PlannerShadowOodReason.ContactTimingInvalid,
            PlannerShadowOodReason.ContactStale,
            PlannerShadowOodReason.ContactLowConfidence,
            PlannerShadowOodReason.FeatureSourceNonFinite,
            PlannerShadowOodReason.FeatureClipped,
            PlannerShadowOodReason.QuantizationOutOfRange,
            PlannerShadowOodReason.AirframeUnsupported,
            PlannerShadowOodReason.ProfileUnsupported,
            PlannerShadowOodReason.AtmosphereUnsupported,
            PlannerShadowOodReason.EnginePowerInvalid
        };

    [Fact]
    public void RecordsEligibilityAgreementOodMasksAndDerivableTopTwo() {
        var telemetry = new PlannerShadowTelemetry();
        PlannerShadowResult agreement = Result(
            evaluated: true,
            exactIndex: 2,
            studentIndex: 2,
            runnerUpIndex: 3,
            agreement: true,
            margin: 0);
        PlannerShadowResult topTwoDisagreement = Result(
            evaluated: true,
            exactIndex: 3,
            studentIndex: 2,
            runnerUpIndex: 3,
            agreement: false,
            margin: 7,
            positiveRelativeRegret: 0.10);
        PlannerShadowResult outsideTopTwo = Result(
            evaluated: true,
            exactIndex: 8,
            studentIndex: 2,
            runnerUpIndex: 3,
            agreement: false,
            margin: 8,
            positiveRelativeRegret: 0.25);
        PlannerShadowResult skipped = Result(
            evaluated: false,
            exactIndex: -1,
            studentIndex: -1,
            runnerUpIndex: -1,
            agreement: false,
            margin: 0,
            reasons:
                PlannerShadowOodReason.AvailableScoreMissing
                | PlannerShadowOodReason.FeatureClipped,
            availabilityMask: 0b1_1111_1111,
            scorePresenceMask: 0b1_1111_1101,
            finiteScoreMask: 0b1_1111_1001,
            featureClipBitsLow: 1UL << 5,
            featureClipBitsHigh: 1UL << 2);

        telemetry.Record(agreement);
        telemetry.Record(topTwoDisagreement);
        telemetry.Record(outsideTopTwo);
        telemetry.Record(skipped);
        PlannerShadowTelemetrySnapshot snapshot = telemetry.GetSnapshot();

        Assert.Equal(4UL, snapshot.TotalEvaluations);
        Assert.Equal(3UL, snapshot.EligibleEvaluations);
        Assert.Equal(1UL, snapshot.IneligibleEvaluations);
        Assert.Equal(1UL, snapshot.Agreements);
        Assert.Equal(2UL, snapshot.Disagreements);
        Assert.Equal(2UL, snapshot.ExactInStudentTopTwoEvaluations);
        Assert.Equal(2UL, snapshot.ExactInStudentTopThreeEvaluations);
        Assert.Equal(
            350_000_000UL,
            snapshot.PositiveRelativeRegretBillionths);
        Assert.Equal(
            0.35 / 3.0,
            snapshot.MeanPositiveRelativeRegret,
            precision: 12);
        Assert.Equal(
            1UL,
            snapshot.GetOodReasonCount(
                PlannerShadowOodReason.AvailableScoreMissing));
        Assert.Equal(
            1UL,
            snapshot.GetOodReasonCount(
                PlannerShadowOodReason.FeatureClipped));
        Assert.Equal(
            PlannerShadowOodReason.AvailableScoreMissing
                | PlannerShadowOodReason.FeatureClipped,
            snapshot.ObservedOodReasons);

        Assert.Equal(
            1UL,
            snapshot.MaskCounts.AvailableScoreMissingEvaluations);
        Assert.Equal(
            1UL,
            snapshot.MaskCounts.AvailableScoreNonFiniteEvaluations);
        Assert.Equal(0b10, snapshot.MaskCounts
            .ObservedAvailableScoreMissingMask);
        Assert.Equal(0b100, snapshot.MaskCounts
            .ObservedAvailableScoreNonFiniteMask);
        Assert.Equal(1UL << 5, snapshot.MaskCounts
            .ObservedFeatureClipBitsLow);
        Assert.Equal(1UL << 2, snapshot.MaskCounts
            .ObservedFeatureClipBitsHigh);
        Assert.Equal(2UL, snapshot.MaskCounts.ClippedFeatureSlots);

        Assert.Equal(1UL, snapshot.MarginCounts.NonPositive);
        Assert.Equal(1UL, snapshot.MarginCounts.OneToSeven);
        Assert.Equal(1UL, snapshot.MarginCounts.EightToThirtyOne);
    }

    [Fact]
    public void PlacesEveryEligibleIntegerMarginInOneDeterministicBucket() {
        var telemetry = new PlannerShadowTelemetry();
        long[] margins = [-1, 0, 1, 7, 8, 31, 32, 127, 128, 511, 512];

        foreach (long margin in margins) {
            PlannerShadowResult result = Result(
                evaluated: true,
                exactIndex: 0,
                studentIndex: 0,
                runnerUpIndex: 1,
                agreement: true,
                margin);
            telemetry.Record(result);
        }

        PlannerShadowMarginCounts counts =
            telemetry.GetSnapshot().MarginCounts;
        Assert.Equal(2UL, counts.NonPositive);
        Assert.Equal(2UL, counts.OneToSeven);
        Assert.Equal(2UL, counts.EightToThirtyOne);
        Assert.Equal(2UL, counts.ThirtyTwoToOneHundredTwentySeven);
        Assert.Equal(
            2UL,
            counts.OneHundredTwentyEightToFiveHundredEleven);
        Assert.Equal(1UL, counts.FiveHundredTwelveOrMore);
    }

    [Theory]
    [MemberData(nameof(KnownOodReasons))]
    public void CountsEveryKnownOodReasonIndependently(
        PlannerShadowOodReason reason) {
        var telemetry = new PlannerShadowTelemetry();
        PlannerShadowResult result = Result(
            evaluated: false,
            exactIndex: -1,
            studentIndex: -1,
            runnerUpIndex: -1,
            agreement: false,
            margin: 0,
            reasons: reason);

        telemetry.Record(result);
        PlannerShadowTelemetrySnapshot snapshot = telemetry.GetSnapshot();

        Assert.Equal(reason, snapshot.ObservedOodReasons);
        Assert.Equal(1UL, snapshot.GetOodReasonCount(reason));
    }

    [Fact]
    public void RetainsAndCountsUnknownFutureOodBits() {
        var telemetry = new PlannerShadowTelemetry();
        PlannerShadowOodReason unknown =
            (PlannerShadowOodReason)(1U << 31);
        PlannerShadowResult result = Result(
            evaluated: false,
            exactIndex: -1,
            studentIndex: -1,
            runnerUpIndex: -1,
            agreement: false,
            margin: 0,
            reasons: unknown);

        telemetry.Record(result);
        PlannerShadowTelemetrySnapshot snapshot = telemetry.GetSnapshot();

        Assert.Equal(unknown, snapshot.ObservedOodReasons);
        Assert.Equal(1UL, snapshot.OodCounts.UnknownReason);
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            snapshot.GetOodReasonCount(unknown));
    }

    [Fact]
    public void ResetReturnsImmutablePriorSnapshotAndClearsAllState() {
        var telemetry = new PlannerShadowTelemetry();
        PlannerShadowResult result = Result(
            evaluated: true,
            exactIndex: 1,
            studentIndex: 1,
            runnerUpIndex: 2,
            agreement: true,
            margin: 32);
        telemetry.Record(result);

        PlannerShadowTelemetrySnapshot beforeReset = telemetry.Reset();
        Assert.Equal(1UL, beforeReset.TotalEvaluations);
        Assert.Equal(1UL, beforeReset.Agreements);
        Assert.Equal(
            1UL,
            beforeReset.MarginCounts.ThirtyTwoToOneHundredTwentySeven);
        Assert.Equal(default, telemetry.GetSnapshot());

        telemetry.Record(result);
        Assert.Equal(1UL, beforeReset.TotalEvaluations);
        Assert.Equal(1UL, telemetry.GetSnapshot().TotalEvaluations);
    }

    [Fact]
    public void MergeAndRecordSaturateInsteadOfWrapping() {
        var telemetry = new PlannerShadowTelemetry();
        PlannerShadowTelemetrySnapshot nearLimit =
            new(
                TotalEvaluations: ulong.MaxValue,
                EligibleEvaluations: ulong.MaxValue,
                IneligibleEvaluations: 0,
                Agreements: ulong.MaxValue,
                Disagreements: 0,
                ExactInStudentTopTwoEvaluations: ulong.MaxValue,
                ObservedOodReasons:
                    PlannerShadowOodReason.ObservationInvalid,
                OodCounts: new PlannerShadowOodCounts(
                    ObservationInvalid: ulong.MaxValue,
                    TraceNotFull: 0,
                    CandidateTableInvalid: 0,
                    NoAvailableCandidate: 0,
                    AvailableScoreMissing: 0,
                    AvailableScoreNonFinite: 0,
                    SelectedCandidateInvalid: 0,
                    ExactSelectionMismatch: 0,
                    SkillUnsupported: 0,
                    TacticUnsupported: 0,
                    TerrainNotFlat: 0,
                    WindNotCalm: 0,
                    FormationNotIndependent: 0,
                    DoctrineUnsupported: 0,
                    BossProfile: 0,
                    ContactTimingInvalid: 0,
                    ContactStale: 0,
                    ContactLowConfidence: 0,
                    FeatureSourceNonFinite: 0,
                    FeatureClipped: 0,
                    QuantizationOutOfRange: 0,
                    AirframeUnsupported: 0,
                    ProfileUnsupported: 0,
                    AtmosphereUnsupported: 0,
                    EnginePowerInvalid: 0,
                    UnknownReason: 0),
                MaskCounts: new PlannerShadowMaskCounts(
                    PartialAvailabilityEvaluations: 0,
                    AvailableScoreMissingEvaluations: 0,
                    AvailableScoreNonFiniteEvaluations: 0,
                    FeatureClippedEvaluations: 0,
                    AvailableCandidateSlots: ulong.MaxValue,
                    ScorePresentCandidateSlots: 0,
                    FiniteScoreCandidateSlots: 0,
                    ClippedFeatureSlots: 0,
                    ObservedAvailabilityMask: 0,
                    ObservedScorePresenceMask: 0,
                    ObservedFiniteScoreMask: 0,
                    ObservedAvailableScoreMissingMask: 0,
                    ObservedAvailableScoreNonFiniteMask: 0,
                    ObservedFeatureClipBitsLow: 0,
                    ObservedFeatureClipBitsHigh: 0),
                MarginCounts: new PlannerShadowMarginCounts(
                    NonPositive: ulong.MaxValue,
                    OneToSeven: 0,
                    EightToThirtyOne: 0,
                    ThirtyTwoToOneHundredTwentySeven: 0,
                    OneHundredTwentyEightToFiveHundredEleven: 0,
                    FiveHundredTwelveOrMore: 0),
                ExactInStudentTopThreeEvaluations: ulong.MaxValue,
                PositiveRelativeRegretBillionths: ulong.MaxValue);
        telemetry.Merge(nearLimit);
        PlannerShadowResult result = Result(
            evaluated: true,
            exactIndex: 0,
            studentIndex: 0,
            runnerUpIndex: 1,
            agreement: true,
            margin: 0,
            reasons: PlannerShadowOodReason.ObservationInvalid);

        telemetry.Record(result);
        PlannerShadowTelemetrySnapshot snapshot = telemetry.GetSnapshot();

        Assert.Equal(ulong.MaxValue, snapshot.TotalEvaluations);
        Assert.Equal(ulong.MaxValue, snapshot.EligibleEvaluations);
        Assert.Equal(ulong.MaxValue, snapshot.Agreements);
        Assert.Equal(
            ulong.MaxValue,
            snapshot.ExactInStudentTopTwoEvaluations);
        Assert.Equal(
            ulong.MaxValue,
            snapshot.ExactInStudentTopThreeEvaluations);
        Assert.Equal(
            ulong.MaxValue,
            snapshot.PositiveRelativeRegretBillionths);
        Assert.Equal(
            ulong.MaxValue,
            snapshot.OodCounts.ObservationInvalid);
        Assert.Equal(
            ulong.MaxValue,
            snapshot.MaskCounts.AvailableCandidateSlots);
        Assert.Equal(
            ulong.MaxValue,
            snapshot.MarginCounts.NonPositive);
    }

    [Fact]
    public void RecordingTenThousandResultsAllocatesNothingAfterWarmup() {
        var telemetry = new PlannerShadowTelemetry();
        PlannerShadowResult result = Result(
            evaluated: true,
            exactIndex: 4,
            studentIndex: 4,
            runnerUpIndex: 2,
            agreement: true,
            margin: 128);

        for (int index = 0; index < 2_048; index++)
            telemetry.Record(result);
        telemetry.Reset();

        _ = GC.GetAllocatedBytesForCurrentThread();
        long before = GC.GetAllocatedBytesForCurrentThread();
        for (int index = 0; index < 10_000; index++)
            telemetry.Record(result);
        long allocated = GC.GetAllocatedBytesForCurrentThread() - before;
        PlannerShadowTelemetrySnapshot snapshot = telemetry.GetSnapshot();

        Assert.Equal(0, allocated);
        Assert.Equal(10_000UL, snapshot.TotalEvaluations);
        Assert.Equal(
            10_000UL,
            snapshot.MarginCounts
                .OneHundredTwentyEightToFiveHundredEleven);
    }

    static PlannerShadowResult Result(
        bool evaluated,
        int exactIndex,
        int studentIndex,
        int runnerUpIndex,
        bool agreement,
        long margin,
        PlannerShadowOodReason reasons = PlannerShadowOodReason.None,
        ushort availabilityMask = PlannerIntegerRanker.AllCandidatesMask,
        ushort scorePresenceMask = PlannerIntegerRanker.AllCandidatesMask,
        ushort finiteScoreMask = PlannerIntegerRanker.AllCandidatesMask,
        ulong featureClipBitsLow = 0,
        ulong featureClipBitsHigh = 0,
        int thirdIndex = -1,
        double positiveRelativeRegret = 0.0) =>
        new(
            Evaluated: evaluated,
            ExactCandidateIndex: exactIndex,
            StudentCandidateIndex: studentIndex,
            StudentRunnerUpCandidateIndex: runnerUpIndex,
            Agreement: agreement,
            StudentBestLogit: 100,
            StudentRunnerUpLogit: 100 - (int)Math.Clamp(
                margin,
                int.MinValue,
                int.MaxValue),
            IntegerMargin: margin,
            AvailabilityMask: availabilityMask,
            ScorePresenceMask: scorePresenceMask,
            FiniteScoreMask: finiteScoreMask,
            FeatureClipBitsLow: featureClipBitsLow,
            FeatureClipBitsHigh: featureClipBitsHigh,
            OodReasons: reasons,
            StudentThirdCandidateIndex: thirdIndex,
            ExactInStudentTopThree:
                evaluated
                && (exactIndex == studentIndex
                    || exactIndex == runnerUpIndex
                    || exactIndex == thirdIndex),
            PositiveRelativeRegret: positiveRelativeRegret);
}
