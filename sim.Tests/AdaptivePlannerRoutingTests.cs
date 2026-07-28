using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

[Collection(PlannerAllocationSensitiveCollection.Name)]
public class AdaptivePlannerRoutingTests {
    static readonly AdaptivePlannerQualityWindow StrongHistory =
        new(
            EvaluatedSamples: 10,
            Agreements: 10,
            QualityPasses: 10,
            ConsecutiveDisagreements: 0);

    [Fact]
    public void HardShadowAndOodGatesFailClosedAndImmediatelyRevokeLatch() {
        var state = new AdaptivePlannerRoutingState(
            StudentLatched: true,
            EntryPassStreak: 0,
            ExitFailureStreak: 0,
            StudentOpportunityCount: 17);
        var input = GoodInput() with {
            ShadowEligible = false,
            ShadowOodReasons =
                PlannerShadowOodReason.ContactStale
                | PlannerShadowOodReason.WindNotCalm
        };

        AdaptivePlannerRoutingDecision decision =
            Decide(input, state);

        Assert.Equal(
            AdaptivePlannerRoute.ExactRequired,
            decision.Route);
        Assert.False(decision.StudentMayBeUsed);
        Assert.True((decision.Reasons
            & AdaptivePlannerRouteReason.ShadowIneligible) != 0);
        Assert.True((decision.Reasons
            & AdaptivePlannerRouteReason.OutOfDistribution) != 0);
        Assert.Equal(input.ShadowOodReasons, decision.ShadowOodReasons);
        Assert.False(decision.NextState.StudentLatched);
        Assert.Equal(17UL, decision.NextState.StudentOpportunityCount);
    }

    [Fact]
    public void InsufficientHistoryAndRecentDisagreementRemainHardGatesUnderCriticalLoad() {
        AdaptivePlannerRoutingConfig config = Config() with {
            MaximumConsecutiveDisagreements = 0
        };
        var input = GoodInput(
            computeTier: AdaptivePlannerComputeTier.Critical) with {
            RecentQuality = new AdaptivePlannerQualityWindow(
                EvaluatedSamples: 2,
                Agreements: 2,
                QualityPasses: 2,
                ConsecutiveDisagreements: 1)
        };

        AdaptivePlannerRoutingDecision decision =
            Decide(input, config: config);

        Assert.Equal(
            AdaptivePlannerRoute.ExactRequired,
            decision.Route);
        Assert.True((decision.Reasons
            & AdaptivePlannerRouteReason.HistoryInsufficient) != 0);
        Assert.True((decision.Reasons
            & AdaptivePlannerRouteReason.RecentDisagreement) != 0);
        Assert.False(decision.NextState.StudentLatched);
    }

    [Fact]
    public void EntryDebounceRequiresConsecutivePassingDecisions() {
        AdaptivePlannerRoutingConfig config = Config() with {
            EntryDebounceDecisions = 3
        };
        AdaptivePlannerRoutingState state =
            AdaptivePlannerRoutingState.Initial;

        AdaptivePlannerRoutingDecision first =
            Decide(GoodInput(), state, config);
        AdaptivePlannerRoutingDecision second =
            Decide(GoodInput(), first.NextState, config);
        AdaptivePlannerRoutingDecision third =
            Decide(GoodInput(), second.NextState, config);

        Assert.Equal(AdaptivePlannerRoute.ExactRequired, first.Route);
        Assert.Equal(1, first.NextState.EntryPassStreak);
        Assert.True((first.Reasons
            & AdaptivePlannerRouteReason.EntryDebounce) != 0);
        Assert.Equal(AdaptivePlannerRoute.ExactRequired, second.Route);
        Assert.Equal(2, second.NextState.EntryPassStreak);
        Assert.Equal(
            AdaptivePlannerRoute.StudentCandidate,
            third.Route);
        Assert.True(third.StudentMayBeUsed);
        Assert.True(third.NextState.StudentLatched);
        Assert.Equal(1UL, third.NextState.StudentOpportunityCount);
    }

    [Fact]
    public void EntryFailureResetsDebounceStreak() {
        AdaptivePlannerRoutingConfig config = Config() with {
            EntryDebounceDecisions = 2
        };
        AdaptivePlannerRoutingDecision first =
            Decide(GoodInput(), config: config);
        AdaptivePlannerRoutingDecision failure = Decide(
            GoodInput() with { ModelConfidenceMargin = 99 },
            first.NextState,
            config);
        AdaptivePlannerRoutingDecision recovery = Decide(
            GoodInput(),
            failure.NextState,
            config);

        Assert.Equal(1, first.NextState.EntryPassStreak);
        Assert.Equal(
            AdaptivePlannerRoute.ExactRequired,
            failure.Route);
        Assert.Equal(0, failure.NextState.EntryPassStreak);
        Assert.True((failure.Reasons
            & AdaptivePlannerRouteReason.ConfidenceTooLow) != 0);
        Assert.Equal(
            AdaptivePlannerRoute.ExactRequired,
            recovery.Route);
        Assert.Equal(1, recovery.NextState.EntryPassStreak);
    }

    [Fact]
    public void LatchedStudentUsesHoldThresholdWhileUnlatchedStudentUsesEntryThreshold() {
        AdaptivePlannerRoutingConfig config = Config() with {
            EntryDebounceDecisions = 1
        };
        AdaptivePlannerRoutingInput boundary =
            GoodInput() with { ModelConfidenceMargin = 90 };
        var latched = new AdaptivePlannerRoutingState(
            StudentLatched: true,
            EntryPassStreak: 0,
            ExitFailureStreak: 0,
            StudentOpportunityCount: 0);

        AdaptivePlannerRoutingDecision unlatched =
            Decide(boundary, config: config);
        AdaptivePlannerRoutingDecision held =
            Decide(boundary, latched, config);

        Assert.Equal(
            AdaptivePlannerRoute.ExactRequired,
            unlatched.Route);
        Assert.Equal(100, unlatched.RequiredConfidenceMargin);
        Assert.Equal(
            AdaptivePlannerRoute.StudentCandidate,
            held.Route);
        Assert.Equal(80, held.RequiredConfidenceMargin);
    }

    [Fact]
    public void SoftFailureRequiresExactImmediatelyButDebouncesLatchExit() {
        AdaptivePlannerRoutingConfig config = Config() with {
            ExitDebounceDecisions = 2
        };
        var latched = new AdaptivePlannerRoutingState(
            StudentLatched: true,
            EntryPassStreak: 0,
            ExitFailureStreak: 0,
            StudentOpportunityCount: 7);
        AdaptivePlannerRoutingInput weak =
            GoodInput() with { ModelConfidenceMargin = 79 };

        AdaptivePlannerRoutingDecision first =
            Decide(weak, latched, config);
        AdaptivePlannerRoutingDecision second =
            Decide(weak, first.NextState, config);

        Assert.Equal(
            AdaptivePlannerRoute.ExactRequired,
            first.Route);
        Assert.False(first.StudentMayBeUsed);
        Assert.True(first.NextState.StudentLatched);
        Assert.Equal(1, first.NextState.ExitFailureStreak);
        Assert.True((first.Reasons
            & AdaptivePlannerRouteReason.ExitDebounce) != 0);
        Assert.Equal(
            AdaptivePlannerRoute.ExactRequired,
            second.Route);
        Assert.False(second.NextState.StudentLatched);
        Assert.Equal(0, second.NextState.ExitFailureStreak);
        Assert.Equal(7UL, second.NextState.StudentOpportunityCount);
    }

    [Fact]
    public void RecoveryDuringExitDebounceKeepsLatchWithoutASecondEntryWarmup() {
        AdaptivePlannerRoutingConfig config = Config() with {
            ExitDebounceDecisions = 3
        };
        var latched = new AdaptivePlannerRoutingState(
            StudentLatched: true,
            EntryPassStreak: 0,
            ExitFailureStreak: 0,
            StudentOpportunityCount: 4);
        AdaptivePlannerRoutingDecision weak = Decide(
            GoodInput() with { ModelConfidenceMargin = 79 },
            latched,
            config);
        AdaptivePlannerRoutingDecision recovered =
            Decide(GoodInput(), weak.NextState, config);

        Assert.True(weak.NextState.StudentLatched);
        Assert.Equal(
            AdaptivePlannerRoute.StudentCandidate,
            recovered.Route);
        Assert.Equal(0, recovered.NextState.ExitFailureStreak);
        Assert.Equal(5UL, recovered.NextState.StudentOpportunityCount);
    }

    [Fact]
    public void AgreementAndQualityCountsHaveIndependentIntegerGates() {
        AdaptivePlannerRoutingConfig config = Config() with {
            EntryDebounceDecisions = 1
        };
        AdaptivePlannerRoutingInput lowAgreement =
            GoodInput() with {
                RecentQuality = StrongHistory with { Agreements = 8 }
            };
        AdaptivePlannerRoutingInput lowQuality =
            GoodInput() with {
                RecentQuality = StrongHistory with { QualityPasses = 8 }
            };

        AdaptivePlannerRoutingDecision agreementDecision =
            Decide(lowAgreement, config: config);
        AdaptivePlannerRoutingDecision qualityDecision =
            Decide(lowQuality, config: config);

        Assert.True((agreementDecision.Reasons
            & AdaptivePlannerRouteReason.AgreementTooLow) != 0);
        Assert.Equal(
            AdaptivePlannerRouteReason.None,
            agreementDecision.Reasons
            & AdaptivePlannerRouteReason.QualityTooLow);
        Assert.True((qualityDecision.Reasons
            & AdaptivePlannerRouteReason.QualityTooLow) != 0);
        Assert.Equal(
            AdaptivePlannerRouteReason.None,
            qualityDecision.Reasons
            & AdaptivePlannerRouteReason.AgreementTooLow);
    }

    [Fact]
    public void LoadTierScalesAdmissionWithoutWeakeningHardSafetyGates() {
        AdaptivePlannerRoutingConfig config = Config() with {
            EntryDebounceDecisions = 1
        };
        AdaptivePlannerRoutingInput ample =
            GoodInput() with { ModelConfidenceMargin = 50 };
        AdaptivePlannerRoutingInput critical = ample with {
            ComputeTier = AdaptivePlannerComputeTier.Critical
        };

        AdaptivePlannerRoutingDecision ampleDecision =
            Decide(ample, config: config);
        AdaptivePlannerRoutingDecision criticalDecision =
            Decide(critical, config: config);
        AdaptivePlannerRoutingDecision criticalOod = Decide(
            critical with {
                ShadowEligible = false,
                ShadowOodReasons =
                    PlannerShadowOodReason.FeatureClipped
            },
            config: config);

        Assert.Equal(
            AdaptivePlannerRoute.ExactRequired,
            ampleDecision.Route);
        Assert.Equal(100, ampleDecision.RequiredConfidenceMargin);
        Assert.Equal(
            AdaptivePlannerRoute.StudentCandidate,
            criticalDecision.Route);
        Assert.Equal(40, criticalDecision.RequiredConfidenceMargin);
        Assert.Equal(
            AdaptivePlannerRoute.ExactRequired,
            criticalOod.Route);
    }

    [Fact]
    public void UncalibratedDefaultCannotAdmitAnInt32RankerMargin() {
        AdaptivePlannerRoutingInput input = GoodInput() with {
            ModelConfidenceMargin =
                (long)int.MaxValue - int.MinValue,
            RecentQuality = new AdaptivePlannerQualityWindow(
                EvaluatedSamples: 64,
                Agreements: 64,
                QualityPasses: 64,
                ConsecutiveDisagreements: 0)
        };

        AdaptivePlannerRoutingDecision decision =
            AdaptivePlannerRouting.Decide(
                input,
                AdaptivePlannerRoutingState.Initial,
                AdaptivePlannerRoutingConfig.Default);

        Assert.Equal(
            AdaptivePlannerRoute.ExactRequired,
            decision.Route);
        Assert.False(decision.StudentMayBeUsed);
        Assert.True((decision.Reasons
            & AdaptivePlannerRouteReason.ConfidenceTooLow) != 0);
        Assert.Equal(long.MaxValue, decision.RequiredConfidenceMargin);
    }

    [Fact]
    public void ExactAuditCadenceIsDeterministicAndScalesWithLoad() {
        AdaptivePlannerRoutingConfig config = Config() with {
            EntryDebounceDecisions = 1
        };

        AdaptivePlannerRoute[] ampleFirst =
            RouteSequence(AdaptivePlannerComputeTier.Ample, 6, config);
        AdaptivePlannerRoute[] ampleReplay =
            RouteSequence(AdaptivePlannerComputeTier.Ample, 6, config);
        AdaptivePlannerRoute[] critical =
            RouteSequence(AdaptivePlannerComputeTier.Critical, 6, config);

        Assert.Equal(ampleFirst, ampleReplay);
        Assert.Equal([
            AdaptivePlannerRoute.StudentCandidate,
            AdaptivePlannerRoute.ExactAudit,
            AdaptivePlannerRoute.StudentCandidate,
            AdaptivePlannerRoute.ExactAudit,
            AdaptivePlannerRoute.StudentCandidate,
            AdaptivePlannerRoute.ExactAudit
        ], ampleFirst);
        Assert.Equal([
            AdaptivePlannerRoute.StudentCandidate,
            AdaptivePlannerRoute.StudentCandidate,
            AdaptivePlannerRoute.StudentCandidate,
            AdaptivePlannerRoute.StudentCandidate,
            AdaptivePlannerRoute.ExactAudit,
            AdaptivePlannerRoute.StudentCandidate
        ], critical);
    }

    [Fact]
    public void ExactAuditNeverReportsStudentCommandAuthority() {
        AdaptivePlannerRoutingConfig config = Config() with {
            EntryDebounceDecisions = 1
        };
        var state = new AdaptivePlannerRoutingState(
            StudentLatched: true,
            EntryPassStreak: 0,
            ExitFailureStreak: 0,
            StudentOpportunityCount: 1);

        AdaptivePlannerRoutingDecision decision =
            Decide(GoodInput(), state, config);

        Assert.Equal(AdaptivePlannerRoute.ExactAudit, decision.Route);
        Assert.False(decision.StudentMayBeUsed);
        Assert.True((decision.Reasons
            & AdaptivePlannerRouteReason.DeterministicAudit) != 0);
        Assert.True((decision.Reasons
            & AdaptivePlannerRouteReason.EvidenceAccepted) != 0);
    }

    [Fact]
    public void InvalidEvidenceStateAndLoadPolicyFailClosed() {
        AdaptivePlannerRoutingDecision invalidWindow = Decide(
            GoodInput() with {
                RecentQuality = StrongHistory with { Agreements = 11 }
            });
        AdaptivePlannerRoutingDecision invalidMargin = Decide(
            GoodInput() with { ModelConfidenceMargin = -1 });
        AdaptivePlannerRoutingDecision invalidTier = Decide(
            GoodInput() with {
                ComputeTier = (AdaptivePlannerComputeTier)99
            });
        AdaptivePlannerRoutingDecision invalidState = Decide(
            GoodInput(),
            new AdaptivePlannerRoutingState(
                StudentLatched: false,
                EntryPassStreak: 1,
                ExitFailureStreak: 1,
                StudentOpportunityCount: 0));
        AdaptivePlannerRoutingConfig reversedLoadScaling =
            Config() with {
                Critical = new AdaptivePlannerTierPolicy(
                    EntryMinimumMargin: 200,
                    HoldMinimumMargin: 150,
                    ExactAuditInterval: 1)
            };
        AdaptivePlannerRoutingDecision invalidConfig =
            Decide(GoodInput(), config: reversedLoadScaling);

        AssertInvalidAndExact(invalidWindow);
        AssertInvalidAndExact(invalidMargin);
        AssertInvalidAndExact(invalidTier);
        AssertInvalidAndExact(invalidState);
        AssertInvalidAndExact(invalidConfig);
    }

    [Fact]
    public void ShadowResultAdapterPreservesEligibilityOodAndIntegerMargin() {
        var result = new PlannerShadowResult(
            Evaluated: true,
            ExactCandidateIndex: 2,
            StudentCandidateIndex: 2,
            StudentRunnerUpCandidateIndex: 1,
            Agreement: true,
            StudentBestLogit: 120,
            StudentRunnerUpLogit: 43,
            IntegerMargin: 77,
            AvailabilityMask: PlannerIntegerRanker.AllCandidatesMask,
            ScorePresenceMask: PlannerIntegerRanker.AllCandidatesMask,
            FiniteScoreMask: PlannerIntegerRanker.AllCandidatesMask,
            FeatureClipBitsLow: 0,
            FeatureClipBitsHigh: 0,
            OodReasons: PlannerShadowOodReason.None);

        AdaptivePlannerRoutingInput input =
            AdaptivePlannerRoutingInput.FromShadowResult(
                result,
                StrongHistory,
                AdaptivePlannerComputeTier.Balanced);

        Assert.True(input.ShadowEligible);
        Assert.Equal(PlannerShadowOodReason.None, input.ShadowOodReasons);
        Assert.Equal(77, input.ModelConfidenceMargin);
        Assert.Equal(StrongHistory, input.RecentQuality);
        Assert.Equal(
            AdaptivePlannerComputeTier.Balanced,
            input.ComputeTier);
    }

    [Fact]
    public void RoutingIsAllocationFreeAfterWarmup() {
        AdaptivePlannerRoutingConfig config = Config() with {
            EntryDebounceDecisions = 1
        };
        AdaptivePlannerRoutingInput input = GoodInput();
        AdaptivePlannerRoutingState state =
            AdaptivePlannerRoutingState.Initial;
        long checksum = 0;

        for (int warmup = 0; warmup < 2_048; warmup++) {
            AdaptivePlannerRoutingDecision result =
                Decide(input, state, config);
            state = result.NextState;
            checksum += (int)result.Route;
        }

        _ = GC.GetAllocatedBytesForCurrentThread();
        long before = GC.GetAllocatedBytesForCurrentThread();
        for (int iteration = 0; iteration < 10_000; iteration++) {
            AdaptivePlannerRoutingDecision result =
                Decide(input, state, config);
            state = result.NextState;
            checksum += (int)result.Route
                + result.RequiredConfidenceMargin
                + result.ExactAuditInterval;
        }
        long allocated = GC.GetAllocatedBytesForCurrentThread() - before;

        GC.KeepAlive(checksum);
        Assert.Equal(0, allocated);
    }

    [Fact]
    public void RoutingContractsCannotCarryAFlightCommand() {
        Type commandType = typeof(PilotCommand);
        Type[] contractTypes = [
            typeof(AdaptivePlannerRoutingInput),
            typeof(AdaptivePlannerRoutingState),
            typeof(AdaptivePlannerRoutingDecision)
        ];

        foreach (Type contractType in contractTypes) {
            Assert.DoesNotContain(
                contractType.GetProperties(),
                property => property.PropertyType == commandType);
        }
    }

    static AdaptivePlannerRoutingInput GoodInput(
        AdaptivePlannerComputeTier computeTier =
            AdaptivePlannerComputeTier.Ample) =>
        new(
            ShadowEligible: true,
            ShadowOodReasons: PlannerShadowOodReason.None,
            ModelConfidenceMargin: 120,
            RecentQuality: StrongHistory,
            ComputeTier: computeTier);

    static AdaptivePlannerRoutingConfig Config() =>
        new(
            MinimumHistorySamples: 4,
            EntryMinimumAgreementPermille: 900,
            HoldMinimumAgreementPermille: 800,
            EntryMinimumQualityPermille: 900,
            HoldMinimumQualityPermille: 800,
            MaximumConsecutiveDisagreements: 1,
            EntryDebounceDecisions: 2,
            ExitDebounceDecisions: 2,
            Ample: new(
                EntryMinimumMargin: 100,
                HoldMinimumMargin: 80,
                ExactAuditInterval: 2),
            Balanced: new(
                EntryMinimumMargin: 80,
                HoldMinimumMargin: 60,
                ExactAuditInterval: 3),
            Constrained: new(
                EntryMinimumMargin: 60,
                HoldMinimumMargin: 40,
                ExactAuditInterval: 4),
            Critical: new(
                EntryMinimumMargin: 40,
                HoldMinimumMargin: 20,
                ExactAuditInterval: 5));

    static AdaptivePlannerRoutingDecision Decide(
        in AdaptivePlannerRoutingInput input,
        AdaptivePlannerRoutingState? state = null,
        AdaptivePlannerRoutingConfig? config = null) {
        AdaptivePlannerRoutingState resolvedState =
            state ?? AdaptivePlannerRoutingState.Initial;
        AdaptivePlannerRoutingConfig resolvedConfig =
            config ?? Config();
        return AdaptivePlannerRouting.Decide(
            input,
            resolvedState,
            resolvedConfig);
    }

    static AdaptivePlannerRoute[] RouteSequence(
        AdaptivePlannerComputeTier tier,
        int count,
        in AdaptivePlannerRoutingConfig config) {
        var routes = new AdaptivePlannerRoute[count];
        AdaptivePlannerRoutingState state =
            AdaptivePlannerRoutingState.Initial;
        AdaptivePlannerRoutingInput input = GoodInput(tier);
        for (int index = 0; index < count; index++) {
            AdaptivePlannerRoutingDecision decision =
                Decide(input, state, config);
            routes[index] = decision.Route;
            state = decision.NextState;
        }
        return routes;
    }

    static void AssertInvalidAndExact(
        in AdaptivePlannerRoutingDecision decision) {
        Assert.Equal(
            AdaptivePlannerRoute.ExactRequired,
            decision.Route);
        Assert.False(decision.StudentMayBeUsed);
        Assert.True((decision.Reasons
            & AdaptivePlannerRouteReason.InvalidInput) != 0);
        Assert.False(decision.NextState.StudentLatched);
    }
}
