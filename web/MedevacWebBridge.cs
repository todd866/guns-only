using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using System.Text.Json;
using GunsOnly.Sim.Medevac;

namespace GunsOnly.Web;

/// <summary>
/// Browser interop shell for the independent MEDEVAC authority. It accepts semantic commander
/// intent, validates it against the current projected decision, and never delegates medical or
/// logistics legality to JavaScript.
/// </summary>
[SupportedOSPlatform("browser")]
public static partial class MedevacWebBridge {
    const double MaximumBrowserDeltaSeconds = 0.25;
    const double SimulatedSecondsPerRealSecond = 4.0;

    static MedevacScenarioDefinition _definition =
        BuiltInMedevacScenarios.CommanderTraining;
    static MedevacEvacuationSession _session = new(_definition);
    static double _fixedStepAccumulator;
    static bool _paused;
    static int _revision = 1;

    [JSExport]
    public static void Reset(string scenarioId, int seed) {
        if (!StringComparer.OrdinalIgnoreCase.Equals(
                scenarioId, "commander-training")
            && !StringComparer.Ordinal.Equals(
                scenarioId, BuiltInMedevacScenarios.CommanderTraining.Id))
            throw new ArgumentException("Unknown MEDEVAC scenario.", nameof(scenarioId));

        _definition = BuiltInMedevacScenarios.CommanderTraining;
        _session = new MedevacEvacuationSession(_definition);
        _ = seed; // Reserved for future authored scenario variation; this slice is fixed.
        _fixedStepAccumulator = 0;
        _paused = false;
        _revision = 1;
    }

    [JSExport]
    public static void SetPaused(bool paused) => _paused = paused;

    [JSExport]
    public static void Advance(double realDeltaSeconds) {
        if (_paused
            || _session.Lifecycle != MedevacMissionLifecycle.Active
            || !double.IsFinite(realDeltaSeconds)
            || realDeltaSeconds <= 0)
            return;

        double clamped = Math.Min(MaximumBrowserDeltaSeconds, realDeltaSeconds);
        _fixedStepAccumulator += clamped * SimulatedSecondsPerRealSecond;
        int wholeSeconds = (int)Math.Floor(_fixedStepAccumulator);
        if (wholeSeconds <= 0) return;
        _fixedStepAccumulator -= wholeSeconds;
        _session.Advance(wholeSeconds);
        _revision = checked(_revision + 1);
    }

    [JSExport]
    public static string GetState() =>
        MedevacSnapshotProjection.BuildState(
            _definition,
            _session.Snapshot,
            _revision,
            _paused);

    [JSExport]
    public static string Dispatch(
        string expectedDecisionId,
        string optionId,
        bool acknowledged) {
        try {
            MedevacCommanderState model = MedevacSnapshotProjection.BuildModel(
                _definition,
                _session.Snapshot,
                _revision,
                _paused);
            if (!StringComparer.Ordinal.Equals(
                    expectedDecisionId, model.Decision.Id))
                return Result(false, "STALE_DECISION",
                    "The mission picture changed. Review the current decision.");

            MedevacDecisionOption? option = model.Decision.Options.FirstOrDefault(
                candidate => candidate.Enabled
                    && StringComparer.Ordinal.Equals(candidate.Id, optionId));
            if (option is null)
                return Result(false, "COMMAND_NOT_AVAILABLE",
                    "That exact option is not available in the current mission state.");
            if (option.RequiresAcknowledgement && !acknowledged)
                return Result(false, "ACKNOWLEDGEMENT_REQUIRED",
                    "Review and explicitly acknowledge the current challenge.");
            if (!option.RequiresAcknowledgement && acknowledged)
                return Result(false, "UNEXPECTED_ACKNOWLEDGEMENT",
                    "The current command does not require an override acknowledgement.");

            switch (option.CommandId) {
                case "mission.begin":
                    _session.Begin(SingleRequest(option));
                    break;
                case "extraction.authorize-rf":
                    _session.CommandRfFallback(SingleRequest(option));
                    break;
                case "extraction.deploy-repeater":
                    _session.EjectShortRangeRepeater(SingleRequest(option));
                    break;
                case "decision.collect":
                    _session.ChooseCollectNext(SingleRequest(option));
                    break;
                case "decision.deliver":
                    if (option.ReceiverId is null
                        || option.RequestIds.Length == 0)
                        throw new InvalidOperationException(
                            "The selected delivery option is incomplete.");
                    _session.ChooseDelivery(
                        option.ReceiverId,
                        option.RequestIds,
                        acknowledgeMismatch: acknowledged);
                    break;
                case "decision.continue-collection":
                    _session.ContinueCommittedCollection(acknowledged);
                    break;
                default:
                    return Result(false, "UNKNOWN_COMMAND",
                        "The command token is not recognised.");
            }

            _revision = checked(_revision + 1);
            return Result(true, "OK", $"{option.CommitLabel} accepted.");
        }
        catch (Exception exception) when (exception is
            ArgumentException or InvalidOperationException or OverflowException) {
            return Result(false, "REJECTED", exception.Message);
        }
    }

    static string SingleRequest(MedevacDecisionOption option) =>
        option.RequestIds.Length == 1
            ? option.RequestIds[0]
            : throw new InvalidOperationException(
                "The selected option does not own exactly one request.");

    static string Result(bool accepted, string code, string message) =>
        JsonSerializer.Serialize(
            new MedevacDispatchResult(accepted, code, message, _revision),
            MedevacWebJsonContext.Default.MedevacDispatchResult);
}
