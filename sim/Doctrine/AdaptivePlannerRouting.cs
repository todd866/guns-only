namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// The authority boundary selected for one planner decision. This policy never returns a
/// <see cref="PilotCommand"/> and cannot apply either planner's result.
/// </summary>
public enum AdaptivePlannerRoute : byte {
    /// <summary>The exact planner is required; the student has no authority.</summary>
    ExactRequired = 0,

    /// <summary>
    /// The evidence permits a caller to consider the student. Command authority still belongs to
    /// the caller and is intentionally outside this policy.
    /// </summary>
    StudentCandidate = 1,

    /// <summary>
    /// Run the exact planner on this otherwise-student-eligible opportunity to refresh audit
    /// evidence.
    /// </summary>
    ExactAudit = 2
}

/// <summary>Deterministic frame-pressure tiers supplied by the simulation scheduler.</summary>
public enum AdaptivePlannerComputeTier : byte {
    Ample = 0,
    Balanced = 1,
    Constrained = 2,
    Critical = 3
}

/// <summary>
/// Independent reasons attached to a routing decision. Multiple fail-closed gates may be
/// reported together so diagnostics do not lose the original safety evidence.
/// </summary>
[Flags]
public enum AdaptivePlannerRouteReason : ushort {
    None = 0,
    InvalidInput = 1 << 0,
    ShadowIneligible = 1 << 1,
    OutOfDistribution = 1 << 2,
    HistoryInsufficient = 1 << 3,
    RecentDisagreement = 1 << 4,
    AgreementTooLow = 1 << 5,
    QualityTooLow = 1 << 6,
    ConfidenceTooLow = 1 << 7,
    EntryDebounce = 1 << 8,
    ExitDebounce = 1 << 9,
    EvidenceAccepted = 1 << 10,
    DeterministicAudit = 1 << 11
}

/// <summary>
/// Integer-only summary of a caller-owned rolling audit window. A quality pass means the audit
/// met the artifact's separately pinned regret/top-k acceptance rule. Keeping raw counts here
/// avoids floating-point and averaging differences in the routing policy.
/// </summary>
public readonly record struct AdaptivePlannerQualityWindow(
    int EvaluatedSamples,
    int Agreements,
    int QualityPasses,
    int ConsecutiveDisagreements);

/// <summary>
/// Evidence for one pure routing evaluation. It deliberately contains no wall clock, hardware
/// identity, random source, candidate command, or mutable runtime service.
/// </summary>
public readonly record struct AdaptivePlannerRoutingInput(
    bool ShadowEligible,
    PlannerShadowOodReason ShadowOodReasons,
    long ModelConfidenceMargin,
    AdaptivePlannerQualityWindow RecentQuality,
    AdaptivePlannerComputeTier ComputeTier) {

    /// <summary>Adapts the current shadow diagnostic without weakening any of its hard gates.</summary>
    public static AdaptivePlannerRoutingInput FromShadowResult(
        in PlannerShadowResult result,
        in AdaptivePlannerQualityWindow recentQuality,
        AdaptivePlannerComputeTier computeTier) =>
        new(
            ShadowEligible: result.Evaluated && !result.IsOutOfDistribution,
            ShadowOodReasons: result.OodReasons,
            ModelConfidenceMargin: result.IntegerMargin,
            RecentQuality: recentQuality,
            ComputeTier: computeTier);
}

/// <summary>
/// Per-tier confidence and audit policy. Entry is deliberately stricter than hold to provide
/// hysteresis; every tier retains a non-zero exact-audit cadence.
/// </summary>
public readonly record struct AdaptivePlannerTierPolicy(
    long EntryMinimumMargin,
    long HoldMinimumMargin,
    int ExactAuditInterval);

/// <summary>Versionable tuning for the pure routing policy.</summary>
public readonly record struct AdaptivePlannerRoutingConfig(
    int MinimumHistorySamples,
    int EntryMinimumAgreementPermille,
    int HoldMinimumAgreementPermille,
    int EntryMinimumQualityPermille,
    int HoldMinimumQualityPermille,
    int MaximumConsecutiveDisagreements,
    int EntryDebounceDecisions,
    int ExitDebounceDecisions,
    AdaptivePlannerTierPolicy Ample,
    AdaptivePlannerTierPolicy Balanced,
    AdaptivePlannerTierPolicy Constrained,
    AdaptivePlannerTierPolicy Critical) {

    /// <summary>
    /// Fail-closed defaults for builds without a versioned calibration artifact. Integer margins
    /// are model-specific, so generic numeric thresholds would create unearned authority.
    /// </summary>
    public static AdaptivePlannerRoutingConfig Default { get; } =
        new(
            MinimumHistorySamples: 64,
            EntryMinimumAgreementPermille: 930,
            HoldMinimumAgreementPermille: 900,
            EntryMinimumQualityPermille: 990,
            HoldMinimumQualityPermille: 975,
            MaximumConsecutiveDisagreements: 1,
            EntryDebounceDecisions: 3,
            ExitDebounceDecisions: 2,
            Ample: new(
                EntryMinimumMargin: long.MaxValue,
                HoldMinimumMargin: long.MaxValue,
                ExactAuditInterval: 1),
            Balanced: new(
                EntryMinimumMargin: long.MaxValue,
                HoldMinimumMargin: long.MaxValue,
                ExactAuditInterval: 1),
            Constrained: new(
                EntryMinimumMargin: long.MaxValue,
                HoldMinimumMargin: long.MaxValue,
                ExactAuditInterval: 1),
            Critical: new(
                EntryMinimumMargin: long.MaxValue,
                HoldMinimumMargin: long.MaxValue,
                ExactAuditInterval: 1));
}

/// <summary>
/// Explicit state passed through the pure policy. Simulation replay owns and serializes this
/// value; the policy itself has no hidden mutable state.
/// </summary>
public readonly record struct AdaptivePlannerRoutingState(
    bool StudentLatched,
    int EntryPassStreak,
    int ExitFailureStreak,
    ulong StudentOpportunityCount) {

    public static AdaptivePlannerRoutingState Initial => default;
}

/// <summary>One reasoned route plus the state to feed into the next deterministic evaluation.</summary>
public readonly record struct AdaptivePlannerRoutingDecision(
    AdaptivePlannerRoute Route,
    AdaptivePlannerRouteReason Reasons,
    PlannerShadowOodReason ShadowOodReasons,
    long RequiredConfidenceMargin,
    int ExactAuditInterval,
    AdaptivePlannerRoutingState NextState) {

    /// <summary>
    /// True only for the one route that may grant student authority in a future integration.
    /// Exact audits remain exact-authority decisions.
    /// </summary>
    public bool StudentMayBeUsed =>
        Route == AdaptivePlannerRoute.StudentCandidate;
}

/// <summary>
/// Pure, deterministic admission control for a learned planner. It is intentionally separate
/// from candidate generation, exact scoring, and command application.
/// </summary>
public static class AdaptivePlannerRouting {
    const int Permille = 1_000;

    internal static bool IsConfigValid(
        in AdaptivePlannerRoutingConfig config) =>
        IsValid(config);

    /// <summary>
    /// Selects an authority boundary from explicit evidence and state. Invalid, unsupported, or
    /// weak evidence always requires the exact planner.
    /// </summary>
    public static AdaptivePlannerRoutingDecision Decide(
        in AdaptivePlannerRoutingInput input,
        in AdaptivePlannerRoutingState state,
        in AdaptivePlannerRoutingConfig config) {
        if (!IsValid(config)
            || !TryTierPolicy(config, input.ComputeTier, out var tierPolicy)) {
            return FailClosed(
                AdaptivePlannerRouteReason.InvalidInput,
                input.ShadowOodReasons,
                requiredMargin: long.MaxValue,
                auditInterval: 0,
                Reset(state));
        }

        if (!IsValid(state) || !IsValid(input.RecentQuality)
            || input.ModelConfidenceMargin < 0) {
            return FailClosed(
                AdaptivePlannerRouteReason.InvalidInput,
                input.ShadowOodReasons,
                tierPolicy.EntryMinimumMargin,
                tierPolicy.ExactAuditInterval,
                Reset(state));
        }

        AdaptivePlannerRouteReason hardReasons =
            AdaptivePlannerRouteReason.None;
        if (!input.ShadowEligible)
            hardReasons |= AdaptivePlannerRouteReason.ShadowIneligible;
        if (input.ShadowOodReasons != PlannerShadowOodReason.None)
            hardReasons |= AdaptivePlannerRouteReason.OutOfDistribution;
        if (input.RecentQuality.EvaluatedSamples
            < config.MinimumHistorySamples)
            hardReasons |= AdaptivePlannerRouteReason.HistoryInsufficient;
        if (input.RecentQuality.ConsecutiveDisagreements
            > config.MaximumConsecutiveDisagreements)
            hardReasons |= AdaptivePlannerRouteReason.RecentDisagreement;

        if (hardReasons != AdaptivePlannerRouteReason.None) {
            return FailClosed(
                hardReasons,
                input.ShadowOodReasons,
                state.StudentLatched
                    ? tierPolicy.HoldMinimumMargin
                    : tierPolicy.EntryMinimumMargin,
                tierPolicy.ExactAuditInterval,
                Reset(state));
        }

        int agreementThreshold = state.StudentLatched
            ? config.HoldMinimumAgreementPermille
            : config.EntryMinimumAgreementPermille;
        int qualityThreshold = state.StudentLatched
            ? config.HoldMinimumQualityPermille
            : config.EntryMinimumQualityPermille;
        long marginThreshold = state.StudentLatched
            ? tierPolicy.HoldMinimumMargin
            : tierPolicy.EntryMinimumMargin;

        AdaptivePlannerRouteReason softReasons =
            AdaptivePlannerRouteReason.None;
        if (!MeetsPermille(
                input.RecentQuality.Agreements,
                input.RecentQuality.EvaluatedSamples,
                agreementThreshold))
            softReasons |= AdaptivePlannerRouteReason.AgreementTooLow;
        if (!MeetsPermille(
                input.RecentQuality.QualityPasses,
                input.RecentQuality.EvaluatedSamples,
                qualityThreshold))
            softReasons |= AdaptivePlannerRouteReason.QualityTooLow;
        if (input.ModelConfidenceMargin < marginThreshold)
            softReasons |= AdaptivePlannerRouteReason.ConfidenceTooLow;

        if (softReasons != AdaptivePlannerRouteReason.None) {
            return state.StudentLatched
                ? FailLatchedSoftGate(
                    softReasons,
                    input.ShadowOodReasons,
                    tierPolicy,
                    state,
                    config.ExitDebounceDecisions)
                : FailClosed(
                    softReasons,
                    input.ShadowOodReasons,
                    marginThreshold,
                    tierPolicy.ExactAuditInterval,
                    new AdaptivePlannerRoutingState(
                        StudentLatched: false,
                        EntryPassStreak: 0,
                        ExitFailureStreak: 0,
                        state.StudentOpportunityCount));
        }

        if (!state.StudentLatched) {
            int entryPassStreak = IncrementSaturating(
                state.EntryPassStreak);
            if (entryPassStreak < config.EntryDebounceDecisions) {
                return FailClosed(
                    AdaptivePlannerRouteReason.EntryDebounce,
                    input.ShadowOodReasons,
                    marginThreshold,
                    tierPolicy.ExactAuditInterval,
                    new AdaptivePlannerRoutingState(
                        StudentLatched: false,
                        EntryPassStreak: entryPassStreak,
                        ExitFailureStreak: 0,
                        state.StudentOpportunityCount));
            }
        }

        ulong opportunityCount = state.StudentOpportunityCount == ulong.MaxValue
            ? 1UL
            : state.StudentOpportunityCount + 1UL;
        var nextState = new AdaptivePlannerRoutingState(
            StudentLatched: true,
            EntryPassStreak: 0,
            ExitFailureStreak: 0,
            StudentOpportunityCount: opportunityCount);
        bool audit =
            opportunityCount % (ulong)tierPolicy.ExactAuditInterval == 0;
        AdaptivePlannerRouteReason acceptedReason =
            AdaptivePlannerRouteReason.EvidenceAccepted;
        if (audit)
            acceptedReason |= AdaptivePlannerRouteReason.DeterministicAudit;

        return new AdaptivePlannerRoutingDecision(
            Route: audit
                ? AdaptivePlannerRoute.ExactAudit
                : AdaptivePlannerRoute.StudentCandidate,
            Reasons: acceptedReason,
            ShadowOodReasons: input.ShadowOodReasons,
            RequiredConfidenceMargin: marginThreshold,
            ExactAuditInterval: tierPolicy.ExactAuditInterval,
            NextState: nextState);
    }

    static AdaptivePlannerRoutingDecision FailLatchedSoftGate(
        AdaptivePlannerRouteReason reasons,
        PlannerShadowOodReason shadowOodReasons,
        in AdaptivePlannerTierPolicy tierPolicy,
        in AdaptivePlannerRoutingState state,
        int exitDebounceDecisions) {
        int exitFailureStreak = IncrementSaturating(
            state.ExitFailureStreak);
        bool keepLatch = exitFailureStreak < exitDebounceDecisions;
        if (keepLatch)
            reasons |= AdaptivePlannerRouteReason.ExitDebounce;

        return FailClosed(
            reasons,
            shadowOodReasons,
            tierPolicy.HoldMinimumMargin,
            tierPolicy.ExactAuditInterval,
            new AdaptivePlannerRoutingState(
                StudentLatched: keepLatch,
                EntryPassStreak: 0,
                ExitFailureStreak: keepLatch ? exitFailureStreak : 0,
                state.StudentOpportunityCount));
    }

    static AdaptivePlannerRoutingDecision FailClosed(
        AdaptivePlannerRouteReason reasons,
        PlannerShadowOodReason shadowOodReasons,
        long requiredMargin,
        int auditInterval,
        in AdaptivePlannerRoutingState nextState) =>
        new(
            Route: AdaptivePlannerRoute.ExactRequired,
            Reasons: reasons,
            ShadowOodReasons: shadowOodReasons,
            RequiredConfidenceMargin: requiredMargin,
            ExactAuditInterval: auditInterval,
            NextState: nextState);

    static AdaptivePlannerRoutingState Reset(
        in AdaptivePlannerRoutingState state) =>
        new(
            StudentLatched: false,
            EntryPassStreak: 0,
            ExitFailureStreak: 0,
            StudentOpportunityCount: state.StudentOpportunityCount);

    static bool MeetsPermille(
        int successes,
        int samples,
        int thresholdPermille) =>
        (long)successes * Permille
        >= (long)samples * thresholdPermille;

    static int IncrementSaturating(int value) =>
        value == int.MaxValue ? int.MaxValue : value + 1;

    static bool IsValid(in AdaptivePlannerQualityWindow window) =>
        window.EvaluatedSamples >= 0
        && window.Agreements >= 0
        && window.Agreements <= window.EvaluatedSamples
        && window.QualityPasses >= 0
        && window.QualityPasses <= window.EvaluatedSamples
        && window.ConsecutiveDisagreements >= 0
        && window.ConsecutiveDisagreements <= window.EvaluatedSamples;

    static bool IsValid(in AdaptivePlannerRoutingState state) =>
        state.EntryPassStreak >= 0
        && state.ExitFailureStreak >= 0
        && !(state.EntryPassStreak > 0 && state.ExitFailureStreak > 0)
        && (state.StudentLatched
            ? state.EntryPassStreak == 0
            : state.ExitFailureStreak == 0);

    static bool IsValid(in AdaptivePlannerRoutingConfig config) =>
        config.MinimumHistorySamples > 0
        && IsPermille(config.EntryMinimumAgreementPermille)
        && IsPermille(config.HoldMinimumAgreementPermille)
        && config.HoldMinimumAgreementPermille
            <= config.EntryMinimumAgreementPermille
        && IsPermille(config.EntryMinimumQualityPermille)
        && IsPermille(config.HoldMinimumQualityPermille)
        && config.HoldMinimumQualityPermille
            <= config.EntryMinimumQualityPermille
        && config.MaximumConsecutiveDisagreements >= 0
        && config.EntryDebounceDecisions > 0
        && config.ExitDebounceDecisions > 0
        && IsValid(config.Ample)
        && IsValid(config.Balanced)
        && IsValid(config.Constrained)
        && IsValid(config.Critical)
        && config.Ample.EntryMinimumMargin
            >= config.Balanced.EntryMinimumMargin
        && config.Balanced.EntryMinimumMargin
            >= config.Constrained.EntryMinimumMargin
        && config.Constrained.EntryMinimumMargin
            >= config.Critical.EntryMinimumMargin
        && config.Ample.HoldMinimumMargin
            >= config.Balanced.HoldMinimumMargin
        && config.Balanced.HoldMinimumMargin
            >= config.Constrained.HoldMinimumMargin
        && config.Constrained.HoldMinimumMargin
            >= config.Critical.HoldMinimumMargin
        && config.Ample.ExactAuditInterval
            <= config.Balanced.ExactAuditInterval
        && config.Balanced.ExactAuditInterval
            <= config.Constrained.ExactAuditInterval
        && config.Constrained.ExactAuditInterval
            <= config.Critical.ExactAuditInterval;

    static bool IsValid(in AdaptivePlannerTierPolicy policy) =>
        policy.EntryMinimumMargin >= 0
        && policy.HoldMinimumMargin >= 0
        && policy.HoldMinimumMargin <= policy.EntryMinimumMargin
        && policy.ExactAuditInterval > 0;

    static bool IsPermille(int value) => value is >= 0 and <= Permille;

    static bool TryTierPolicy(
        in AdaptivePlannerRoutingConfig config,
        AdaptivePlannerComputeTier tier,
        out AdaptivePlannerTierPolicy policy) {
        policy = tier switch {
            AdaptivePlannerComputeTier.Ample => config.Ample,
            AdaptivePlannerComputeTier.Balanced => config.Balanced,
            AdaptivePlannerComputeTier.Constrained => config.Constrained,
            AdaptivePlannerComputeTier.Critical => config.Critical,
            _ => default
        };
        return tier is >= AdaptivePlannerComputeTier.Ample
            and <= AdaptivePlannerComputeTier.Critical;
    }
}
