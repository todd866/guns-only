namespace GunsOnly.Sim;

/// <summary>The pilot-facing progress of the built-in degraded recovery sortie.</summary>
public enum F86EmergencyGearRecoveryState {
    AwaitingStart,
    NormalCheck,
    ObserveNormalExtension,
    ConfigureForEmergencyExtension,
    EmergencyExtend,
    VerifyDownlocks,
    Recover,
    Recovered,
    AircraftLost
}

/// <summary>
/// Deterministic, presentation-independent controller for one playable maintenance-test-flight
/// sortie. It owns the hidden utility-hydraulic fault and the evidence trace, but its public
/// progress and score are derived only from that trace. The browser never receives a failure ID.
/// </summary>
public sealed class F86EmergencyGearRecoveryScenario {
    public const double ObservationIntervalSeconds = 0.25;

    readonly AirframeSystems _systems;
    readonly HiddenMaintenanceFaultInjection<AirframeSystems> _fault;
    readonly MaintenanceTestFlightLog<F86EmergencyGearAction,
        F86EmergencyGearEvidence> _trace = new();
    MaintenanceProcedureEvaluation _evaluation;
    double _lastObservationSeconds = double.NegativeInfinity;
    bool _started;
    bool _recovered;
    bool _aircraftLost;

    public F86EmergencyGearRecoveryScenario(AirframeSystems systems) {
        _systems = systems ?? throw new ArgumentNullException(nameof(systems));
        _fault = new HiddenMaintenanceFaultInjection<AirframeSystems>(
            "airborne-utility-hydraulic-pump-loss",
            triggerTimeSeconds: 0.0,
            target => target.SetFailure(AirframeSystemFailure.UtilityHydraulicPump));
        _evaluation = F86EmergencyGearTestFlightProcedure.Evaluate(_trace);
    }

    public MaintenanceProcedureEvaluation Evaluation => _evaluation;
    public IReadOnlyList<MaintenanceTestFlightRecord<F86EmergencyGearAction,
        F86EmergencyGearEvidence>> Records => _trace.Records;
    public bool Started => _started;
    public bool Recovered => _recovered;
    public bool AircraftLost => _aircraftLost;
    public bool Finished => _recovered || _aircraftLost;
    public bool ProcedurallyComplete => _evaluation.Complete;
    public int Score => _evaluation.Score;
    public int MaximumScore => _evaluation.MaximumScore;
    public int DemeritCount => _evaluation.Demerits.Count;

    public F86EmergencyGearRecoveryState State {
        get {
            if (_aircraftLost) return F86EmergencyGearRecoveryState.AircraftLost;
            if (_recovered) return F86EmergencyGearRecoveryState.Recovered;
            if (!_started) return F86EmergencyGearRecoveryState.AwaitingStart;
            if (_evaluation.Complete) return F86EmergencyGearRecoveryState.Recover;
            if (GateSatisfied(F86EmergencyGearTestFlightProcedure.EmergencyReleaseEngagedGate))
                return F86EmergencyGearRecoveryState.VerifyDownlocks;
            if (GateSatisfied(F86EmergencyGearTestFlightProcedure.BelowEmergencyLimitGate))
                return F86EmergencyGearRecoveryState.EmergencyExtend;
            if (GateSatisfied(F86EmergencyGearTestFlightProcedure.FailureRecognitionGate))
                return F86EmergencyGearRecoveryState.ConfigureForEmergencyExtension;
            if (GateSatisfied(F86EmergencyGearTestFlightProcedure.NormalSelectionGate))
                return F86EmergencyGearRecoveryState.ObserveNormalExtension;
            return F86EmergencyGearRecoveryState.NormalCheck;
        }
    }

    public string PilotInstruction => State switch {
        F86EmergencyGearRecoveryState.AwaitingStart => "AWAITING CLOCK RELEASE",
        F86EmergencyGearRecoveryState.NormalCheck => "SELECT GEAR DOWN AT OR BELOW 185 KIAS",
        F86EmergencyGearRecoveryState.ObserveNormalExtension =>
            "MONITOR 10 SEC, THEN CONFIRM FAILED EXTENSION",
        F86EmergencyGearRecoveryState.ConfigureForEmergencyExtension =>
            "REDUCE TO 175 KIAS OR BELOW",
        F86EmergencyGearRecoveryState.EmergencyExtend =>
            "PULL AND HOLD EMERGENCY GEAR RELEASE",
        F86EmergencyGearRecoveryState.VerifyDownlocks =>
            "HOLD RELEASE; INSPECT ALL THREE DOWNLOCKS",
        F86EmergencyGearRecoveryState.Recover => "DOWNLOCKS VERIFIED — RECOVER ABOARD",
        F86EmergencyGearRecoveryState.Recovered => "RECOVERED — PROCEDURE DEBRIEF COMPLETE",
        _ => "AIRCRAFT LOST — PROCEDURE DEBRIEF COMPLETE"
    };

    /// <summary>Releases the scenario clock and injects its hidden fault exactly once.</summary>
    public void Begin(double timestampSeconds) {
        ValidateTimestamp(timestampSeconds);
        if (_started) return;
        _started = true;
        _fault.InjectIfDue(timestampSeconds, _systems);
        ObserveCockpit(timestampSeconds, force: true);
    }

    /// <summary>Samples only cockpit evidence at a bounded four-hertz cadence.</summary>
    public void Step(double timestampSeconds) {
        ValidateTimestamp(timestampSeconds);
        if (!_started || Finished) return;
        _fault.InjectIfDue(timestampSeconds, _systems);
        ObserveCockpit(timestampSeconds);
    }

    public void SelectNormalGearDown(double timestampSeconds) {
        EnsureActive(timestampSeconds);
        ObserveCockpit(timestampSeconds, force: true);
        _systems.CommandGear(LandingGearHandle.Down);
        _trace.RecordAction(timestampSeconds, F86EmergencyGearAction.SelectNormalGearDown);
        ObserveCockpit(timestampSeconds, force: true);
    }

    public void ConfirmNormalExtensionFailure(double timestampSeconds) {
        EnsureActive(timestampSeconds);
        ObserveCockpit(timestampSeconds, force: true);
        _trace.RecordAction(timestampSeconds,
            F86EmergencyGearAction.ConfirmNormalExtensionFailure);
        ObserveCockpit(timestampSeconds, force: true);
    }

    public void SetEmergencyGearRelease(bool held, double timestampSeconds) {
        EnsureActive(timestampSeconds);
        if (_systems.EmergencyGearReleaseHeld == held) return;
        ObserveCockpit(timestampSeconds, force: true);
        _systems.SetEmergencyGearRelease(held);
        _trace.RecordAction(timestampSeconds,
            F86EmergencyGearAction.EmergencyGearRelease,
            held ? MaintenanceActionTransition.Begin : MaintenanceActionTransition.End);
        ObserveCockpit(timestampSeconds, force: true);
    }

    public void InspectMechanicalDownlocks(double timestampSeconds) {
        EnsureActive(timestampSeconds);
        ObserveCockpit(timestampSeconds, force: true);
        _trace.RecordAction(timestampSeconds,
            F86EmergencyGearAction.InspectMechanicalDownlocks);
        _trace.RecordObservation(timestampSeconds,
            F86EmergencyGearEvidenceProjection.CapturePhysicalInspection(_systems));
        RefreshEvaluation();
        _lastObservationSeconds = timestampSeconds;
    }

    /// <summary>Terminal recovery fact supplied by the carrier collision/arrestment authority.</summary>
    public void RecordRecovered(double timestampSeconds) {
        EnsureActive(timestampSeconds);
        ObserveCockpit(timestampSeconds, force: true);
        _recovered = true;
    }

    /// <summary>Terminal loss fact supplied by the flight/collision authority.</summary>
    public void RecordAircraftLost(double timestampSeconds) {
        EnsureActive(timestampSeconds);
        ObserveCockpit(timestampSeconds, force: true);
        _aircraftLost = true;
    }

    bool GateSatisfied(string gateId) => _evaluation.Gates.Any(gate =>
        gate.Definition.Id == gateId && gate.Status == MaintenanceGateStatus.Satisfied);

    void ObserveCockpit(double timestampSeconds, bool force = false) {
        if (!force
            && timestampSeconds - _lastObservationSeconds < ObservationIntervalSeconds)
            return;
        _trace.RecordObservation(timestampSeconds,
            F86EmergencyGearEvidenceProjection.CaptureCockpit(_systems));
        _lastObservationSeconds = timestampSeconds;
        RefreshEvaluation();
    }

    void RefreshEvaluation() => _evaluation =
        F86EmergencyGearTestFlightProcedure.Evaluate(_trace);

    void EnsureActive(double timestampSeconds) {
        ValidateTimestamp(timestampSeconds);
        if (!_started) throw new InvalidOperationException("The maintenance sortie has not begun.");
        if (Finished) throw new InvalidOperationException("The maintenance sortie has finished.");
    }

    static void ValidateTimestamp(double timestampSeconds) {
        if (!double.IsFinite(timestampSeconds) || timestampSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(timestampSeconds));
    }
}
