using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Cobra;

public enum CobraTurnaroundPhase
{
    Operational,
    ShutdownRequired,
    RotorCoast,
    AwaitStartRelease,
    ColdAndDark,
    Starting,
    Secured
}

public enum CobraTurnaroundAction
{
    None,
    LowerCollective,
    Release,
    HoldShutdown,
    Coast,
    HoldStart,
    Starting
}

public readonly record struct CobraTurnaroundObservation(
    bool RecoveryRequired,
    bool InsideFob,
    VehicleContactKind ContactKind,
    double Collective,
    bool EngineOperating,
    double EnginePowerFraction,
    double MainRotorRpm,
    bool HasSpare,
    bool ActionHeld);

public readonly record struct CobraTurnaroundDirective(
    bool ShutdownEngine,
    bool TransferAirframe,
    bool StartEngine,
    bool EndMissionNoSpare);

/// <summary>
/// Fixed-step authority for replacing a damaged Cobra at Camp Ember. It owns ordering and hold
/// edges; the dynamics provider owns shaft power and Nr, while the browser supplies only a held
/// cockpit action. Mission time deliberately continues throughout the procedure.
/// </summary>
public sealed class CobraTurnaroundRuntime
{
    public const double PadContactDwellSeconds = 0.75;
    public const double ActionHoldSeconds = 1.0;
    public const double MaximumShutdownCollective = 0.03;
    public const double TransferMaximumEnginePowerFraction = 0.05;
    public const double TransferMaximumMainRotorRpm = 50.0;
    public const double ReadyMinimumMainRotorRpm = 294.0;
    public const double ReadyDwellSeconds = 0.75;

    double _padContactSeconds;
    double _actionHoldSeconds;
    double _readySeconds;
    bool _shutdownReleaseObserved;

    public CobraTurnaroundPhase Phase { get; private set; } = CobraTurnaroundPhase.Operational;
    public CobraTurnaroundAction Action { get; private set; } = CobraTurnaroundAction.None;
    public int Sequence { get; private set; }
    public double HoldProgress => Math.Clamp(_actionHoldSeconds / ActionHoldSeconds, 0.0, 1.0);
    public bool FlightControlsEnabled => Phase == CobraTurnaroundPhase.Operational;
    public bool WeaponsEnabled => Phase == CobraTurnaroundPhase.Operational;
    public bool Servicing => Phase != CobraTurnaroundPhase.Operational;

    public CobraTurnaroundDirective Advance(
        double deltaSeconds,
        in CobraTurnaroundObservation observation)
    {
        if (!double.IsFinite(deltaSeconds) || deltaSeconds <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(deltaSeconds));
        Validate(observation);

        return Phase switch
        {
            CobraTurnaroundPhase.Operational => AdvanceOperational(deltaSeconds, observation),
            CobraTurnaroundPhase.ShutdownRequired =>
                AdvanceShutdownRequired(deltaSeconds, observation),
            CobraTurnaroundPhase.RotorCoast => AdvanceRotorCoast(observation),
            CobraTurnaroundPhase.AwaitStartRelease => AdvanceAwaitStartRelease(observation),
            CobraTurnaroundPhase.ColdAndDark => AdvanceColdAndDark(deltaSeconds, observation),
            CobraTurnaroundPhase.Starting => AdvanceStarting(deltaSeconds, observation),
            CobraTurnaroundPhase.Secured => default,
            _ => throw new InvalidOperationException($"Unknown turnaround phase {Phase}.")
        };
    }

    CobraTurnaroundDirective AdvanceOperational(
        double deltaSeconds,
        in CobraTurnaroundObservation observation)
    {
        Action = CobraTurnaroundAction.None;
        if (!observation.RecoveryRequired
            || !observation.InsideFob
            || !QualifyingContact(observation.ContactKind))
        {
            _padContactSeconds = 0.0;
            return default;
        }

        _padContactSeconds += deltaSeconds;
        if (_padContactSeconds + 1e-12 < PadContactDwellSeconds)
            return default;

        _padContactSeconds = 0.0;
        if (!observation.EngineOperating)
        {
            Transition(CobraTurnaroundPhase.RotorCoast, CobraTurnaroundAction.Coast);
            // Secure an already-failed engine through the cockpit seam as soon as the pad dwell
            // completes. This engages the provider's grounded rundown without asking for a fake
            // shutdown button press on an engine that is already out.
            return new CobraTurnaroundDirective(
                ShutdownEngine: true,
                TransferAirframe: false,
                StartEngine: false,
                EndMissionNoSpare: false);
        }

        _shutdownReleaseObserved = false;
        Transition(CobraTurnaroundPhase.ShutdownRequired, CobraTurnaroundAction.Release);
        return default;
    }

    CobraTurnaroundDirective AdvanceShutdownRequired(
        double deltaSeconds,
        in CobraTurnaroundObservation observation)
    {
        if (!observation.EngineOperating)
        {
            Transition(CobraTurnaroundPhase.RotorCoast, CobraTurnaroundAction.Coast);
            // FailEngine clears the provider's cockpit-shutdown latch. Reassert the authorized
            // shutdown when an engine fails mid-procedure so grounded rundown still uses the
            // safe, accelerated coast path before an airframe can transfer.
            return new CobraTurnaroundDirective(
                ShutdownEngine: true,
                TransferAirframe: false,
                StartEngine: false,
                EndMissionNoSpare: false);
        }

        if (!_shutdownReleaseObserved)
        {
            Action = CobraTurnaroundAction.Release;
            _actionHoldSeconds = 0.0;
            if (!observation.ActionHeld)
            {
                _shutdownReleaseObserved = true;
                Action = observation.Collective <= MaximumShutdownCollective
                    ? CobraTurnaroundAction.HoldShutdown
                    : CobraTurnaroundAction.LowerCollective;
            }
            return default;
        }

        if (observation.Collective > MaximumShutdownCollective)
        {
            Action = CobraTurnaroundAction.LowerCollective;
            _actionHoldSeconds = 0.0;
            return default;
        }

        Action = CobraTurnaroundAction.HoldShutdown;
        if (!observation.ActionHeld)
        {
            _actionHoldSeconds = 0.0;
            return default;
        }

        _actionHoldSeconds += deltaSeconds;
        if (_actionHoldSeconds + 1e-12 < ActionHoldSeconds)
            return default;

        Transition(CobraTurnaroundPhase.RotorCoast, CobraTurnaroundAction.Coast);
        return new CobraTurnaroundDirective(
            ShutdownEngine: true,
            TransferAirframe: false,
            StartEngine: false,
            EndMissionNoSpare: false);
    }

    CobraTurnaroundDirective AdvanceRotorCoast(in CobraTurnaroundObservation observation)
    {
        Action = CobraTurnaroundAction.Coast;
        if (observation.EngineOperating
            || observation.EnginePowerFraction > TransferMaximumEnginePowerFraction
            || observation.MainRotorRpm > TransferMaximumMainRotorRpm)
            return default;

        if (!observation.HasSpare)
        {
            Transition(CobraTurnaroundPhase.Secured, CobraTurnaroundAction.None);
            return new CobraTurnaroundDirective(
                ShutdownEngine: false,
                TransferAirframe: false,
                StartEngine: false,
                EndMissionNoSpare: true);
        }

        Transition(CobraTurnaroundPhase.AwaitStartRelease, CobraTurnaroundAction.Release);
        return new CobraTurnaroundDirective(
            ShutdownEngine: false,
            TransferAirframe: true,
            StartEngine: false,
            EndMissionNoSpare: false);
    }

    CobraTurnaroundDirective AdvanceAwaitStartRelease(
        in CobraTurnaroundObservation observation)
    {
        Action = CobraTurnaroundAction.Release;
        if (!observation.ActionHeld)
            Transition(CobraTurnaroundPhase.ColdAndDark, CobraTurnaroundAction.HoldStart);
        return default;
    }

    CobraTurnaroundDirective AdvanceColdAndDark(
        double deltaSeconds,
        in CobraTurnaroundObservation observation)
    {
        if (observation.Collective > MaximumShutdownCollective)
        {
            Action = CobraTurnaroundAction.LowerCollective;
            _actionHoldSeconds = 0.0;
            return default;
        }

        Action = CobraTurnaroundAction.HoldStart;
        if (!observation.ActionHeld)
        {
            _actionHoldSeconds = 0.0;
            return default;
        }

        _actionHoldSeconds += deltaSeconds;
        if (_actionHoldSeconds + 1e-12 < ActionHoldSeconds)
            return default;

        Transition(CobraTurnaroundPhase.Starting, CobraTurnaroundAction.Starting);
        return new CobraTurnaroundDirective(
            ShutdownEngine: false,
            TransferAirframe: false,
            StartEngine: true,
            EndMissionNoSpare: false);
    }

    CobraTurnaroundDirective AdvanceStarting(
        double deltaSeconds,
        in CobraTurnaroundObservation observation)
    {
        Action = CobraTurnaroundAction.Starting;
        if (observation.EngineOperating
            && observation.MainRotorRpm + 1e-9 >= ReadyMinimumMainRotorRpm)
            _readySeconds += deltaSeconds;
        else
            _readySeconds = 0.0;

        if (_readySeconds + 1e-12 >= ReadyDwellSeconds)
            Transition(CobraTurnaroundPhase.Operational, CobraTurnaroundAction.None);
        return default;
    }

    void Transition(CobraTurnaroundPhase phase, CobraTurnaroundAction action)
    {
        Phase = phase;
        Action = action;
        Sequence++;
        _actionHoldSeconds = 0.0;
        _readySeconds = 0.0;
    }

    static bool QualifyingContact(VehicleContactKind contactKind) => contactKind is
        VehicleContactKind.StableSurfaceContact
        or VehicleContactKind.SurfaceContact
        or VehicleContactKind.HardImpact;

    static void Validate(in CobraTurnaroundObservation observation)
    {
        if (!double.IsFinite(observation.Collective)
            || observation.Collective < 0.0
            || observation.Collective > 1.0)
            throw new ArgumentOutOfRangeException(nameof(observation));
        if (!double.IsFinite(observation.EnginePowerFraction)
            || observation.EnginePowerFraction < 0.0)
            throw new ArgumentOutOfRangeException(nameof(observation));
        if (!double.IsFinite(observation.MainRotorRpm)
            || observation.MainRotorRpm < 0.0)
            throw new ArgumentOutOfRangeException(nameof(observation));
    }
}
