using GunsOnly.Sim.Training;

namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// One counterfactual shadow route and the evidence window on each side of it. The exact planner
/// has already run when this diagnostic is produced; this value carries no flight command.
/// </summary>
public readonly record struct PlannerShadowRoutingResult(
    PlannerShadowResult Shadow,
    AdaptivePlannerRoutingDecision Routing,
    AdaptivePlannerQualityWindow PriorQuality,
    AdaptivePlannerQualityWindow UpdatedQuality);

/// <summary>
/// Coordinates shadow inference, lifetime telemetry, a bounded recent audit window, and pure
/// adaptive routing. The routing decision uses only prior audit history; the current exact answer
/// is recorded after the counterfactual decision so it cannot bootstrap its own admission.
/// </summary>
public sealed class PlannerShadowRoutingCoordinator {
    readonly PlannerShadowEvaluator _evaluator;
    readonly PlannerShadowTelemetry _telemetry;
    readonly AdaptivePlannerAuditWindow _auditWindow;
    readonly AdaptivePlannerRoutingConfig _routingConfig;
    AdaptivePlannerRoutingState _routingState;

    public PlannerShadowRoutingCoordinator(
        PlannerShadowEvaluator evaluator,
        PlannerShadowTelemetry telemetry,
        AdaptivePlannerAuditWindow auditWindow,
        in AdaptivePlannerRoutingConfig routingConfig) {
        ArgumentNullException.ThrowIfNull(evaluator);
        ArgumentNullException.ThrowIfNull(telemetry);
        ArgumentNullException.ThrowIfNull(auditWindow);
        if (!AdaptivePlannerRouting.IsConfigValid(routingConfig))
            throw new ArgumentException(
                "The adaptive routing configuration is invalid.",
                nameof(routingConfig));

        _evaluator = evaluator;
        _telemetry = telemetry;
        _auditWindow = auditWindow;
        _routingConfig = routingConfig;
    }

    public AdaptivePlannerRoutingState RoutingState => _routingState;
    public AdaptivePlannerQualityWindow RecentQuality =>
        _auditWindow.GetQualityWindow();
    public PlannerShadowTelemetrySnapshot Telemetry =>
        _telemetry.GetSnapshot();

    /// <summary>
    /// Evaluates one already-completed exact trace and reports what the adaptive boundary would
    /// have done. The exact result remains authoritative regardless of the reported route.
    /// </summary>
    public PlannerShadowRoutingResult Evaluate(
        in CombatPolicyObservation observation,
        in BanditPolicyMemory memory,
        PilotSkill skill,
        in BanditDecisionTrace exactTrace,
        double enginePowerFraction,
        in PlannerShadowRuntimeContext runtimeContext,
        AdaptivePlannerComputeTier computeTier) {
        AdaptivePlannerQualityWindow priorQuality =
            _auditWindow.GetQualityWindow();
        PlannerShadowResult shadow = _evaluator.Evaluate(
            observation,
            memory,
            skill,
            exactTrace,
            enginePowerFraction,
            runtimeContext);
        AdaptivePlannerRoutingInput input =
            AdaptivePlannerRoutingInput.FromShadowResult(
                shadow,
                priorQuality,
                computeTier);
        AdaptivePlannerRoutingDecision routing =
            AdaptivePlannerRouting.Decide(
                input,
                _routingState,
                _routingConfig);
        _routingState = routing.NextState;
        _telemetry.Record(shadow);
        _auditWindow.Record(shadow);
        return new PlannerShadowRoutingResult(
            shadow,
            routing,
            priorQuality,
            _auditWindow.GetQualityWindow());
    }

    /// <summary>Clears lifetime telemetry, recent audit history, and routing hysteresis.</summary>
    public PlannerShadowTelemetrySnapshot Reset() {
        PlannerShadowTelemetrySnapshot previous = _telemetry.Reset();
        _auditWindow.Reset();
        _routingState = AdaptivePlannerRoutingState.Initial;
        return previous;
    }
}
