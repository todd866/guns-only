namespace GunsOnly.Sim;

/// <summary>
/// One low-rate observation of the authoritative carrier-relative world state. Replay consumers
/// render these recorded facts; they never re-run flight or contact physics.
/// </summary>
public readonly record struct IncidentReplaySample(
    long Tick,
    double TimeSeconds,
    AircraftState Player,
    double IndicatedAirspeedKts,
    double GroundSpeedKts,
    double AngleOfAttackDeg,
    double ThrottleCommand,
    double EnginePowerFraction,
    double FlightPathAngleDeg,
    double VerticalSpeedFpm,
    double NormalLoadFactor,
    double CommandGDemand,
    double CommandBankTargetDeg,
    double CommandRudder,
    double CommandRollControl,
    bool HasCommandedPitch,
    double CommandedPitchDeg,
    double DeckSinkRateMps,
    double DeckClosureMps,
    double DeckAlongM,
    double DeckCrossM,
    double DeckHeightM,
    Vec3D CarrierPosition,
    Vec3D CarrierTouchdownPoint,
    Vec3D CarrierApproachCuePoint,
    double CarrierHeadingRad,
    double CarrierDeckPitchRad,
    double CarrierDeckLengthM,
    double CarrierDeckWidthM,
    LandingGearHandle GearHandle,
    double GearFraction,
    bool GearDownAndLocked,
    double NoseGearFraction,
    double LeftGearFraction,
    double RightGearFraction,
    LandingGearIndication NoseGearIndication,
    LandingGearIndication LeftGearIndication,
    LandingGearIndication RightGearIndication,
    WingFlapLever FlapLever,
    double FlapDegrees,
    double LeftFlapDegrees,
    double RightFlapDegrees,
    Carrier.Recovery Recovery,
    Carrier.HookOutcome Hook,
    int Wire,
    AircraftTerminalState TerminalState,
    ImpactSurface Surface,
    long EventSequence,
    SessionEventType EventType,
    ImpactSurface EventSurface,
    ArrestmentModel.ArrestmentFailureReason ArrestmentFailureReason =
        ArrestmentModel.ArrestmentFailureReason.None,
    double ArrestmentInitialEnergyJ = 0.0,
    double ArrestmentAbsorbedEnergyJ = 0.0,
    double ArrestmentRemainingEnergyJ = 0.0,
    double ArrestmentEffectiveCapacityJ = 0.0,
    double ArrestmentPeakLoadN = 0.0,
    double ArrestmentMaximumLineLoadN = 0.0,
    double ArrestmentInitialClosureMps = 0.0,
    string ArrestmentProfileId = "",
    Carrier.SolidCollision CarrierSolid = Carrier.SolidCollision.None,
    Carrier.TouchdownGrade TouchdownGrade = Carrier.TouchdownGrade.None,
    Carrier.TouchdownDeviation TouchdownDeviations = Carrier.TouchdownDeviation.None,
    Carrier.TouchdownCorrection TouchdownPrimaryCorrection =
        Carrier.TouchdownCorrection.None,
    string TouchdownAssessmentProfileId = "",
    int TouchdownAssessmentProfileVersion = 0,
    double TouchdownMinimumSinkRateMps = 0.0,
    double TouchdownHardSinkRateMps = 0.0,
    double TouchdownMaximumSinkRateMps = 0.0,
    double TouchdownMaximumLineupM = 0.0,
    double TouchdownMinimumIndicatedAirspeedMps = 0.0,
    double TouchdownMaximumIndicatedAirspeedMps = 0.0,
    double TouchdownMaximumClosureMps = 0.0,
    double TouchdownOnSpeedAoaRad = 0.0,
    double TouchdownMaximumAoaErrorRad = 0.0,
    int TouchdownAdaptiveDifficultyLevel = 0,
    double TouchdownAdaptiveMaximumSinkRateMps = 0.0,
    double TouchdownAdaptiveMaximumLineupM = 0.0,
    double TouchdownAdaptiveMinimumIndicatedAirspeedMps = 0.0,
    double TouchdownAdaptiveMaximumIndicatedAirspeedMps = 0.0);

/// <summary>
/// One authoritative discrete event retained beside the sampled replay states. The event keeps
/// its exact target pose at the completed simulation tick so a presentation can place a one-shot
/// effect without borrowing a later live snapshot or re-running collision physics.
/// </summary>
public readonly record struct IncidentReplayEvent(
    SessionEvent Event,
    double TimeSeconds,
    Vec3D Position,
    Vec3D Velocity);

/// <summary>A frozen, bounded carrier-incident flight-recorder clip.</summary>
public sealed record IncidentReplayClip(
    int Id,
    double NominalSampleRateHz,
    int IncidentSampleIndex,
    IReadOnlyList<IncidentReplaySample> Samples,
    IReadOnlyList<IncidentReplayEvent> Events);

/// <summary>
/// Bounded deterministic flight recorder for player carrier impacts. It retains a rolling pre-roll
/// at 12 Hz, latches only an authoritative deck/structure impact, and freezes when that wreck
/// reaches physical rest. The exceptional numerical guard also freezes the last integrated state,
/// but retains SimulationBounded rather than manufacturing a Settled event. Export is deliberately
/// one-shot so the large clip never rides the normal per-frame snapshot contract.
/// </summary>
public sealed class IncidentReplayRecorder {
    public const int SampleStrideTicks = 10; // 120 Hz authority -> 12 Hz replay evidence.
    public const double NominalSampleRateHz = AircraftSim.TickHz / SampleStrideTicks;
    public const double PreIncidentSeconds = 10.0;
    public const double MaximumClipSeconds = 30.0;
    public const int MaximumSamples = (int)(NominalSampleRateHz * MaximumClipSeconds) + 8;
    public const int MaximumEvents = 128;

    readonly List<IncidentReplaySample> _rolling = new(MaximumSamples);
    readonly List<IncidentReplayEvent> _rollingEvents = new(MaximumEvents);
    IncidentReplayClip? _clip;
    long _lastStoredTick = long.MinValue;
    long _lastObservedEventSequence;
    AircraftTerminalState _lastObservedTerminalState = AircraftTerminalState.Flying;
    ImpactSurface _lastObservedSurface = ImpactSurface.None;
    Carrier.Recovery _lastObservedRecovery = Carrier.Recovery.Flying;
    Carrier.SolidCollision _lastObservedCarrierSolid = Carrier.SolidCollision.None;
    double _incidentTimeSeconds = double.NaN;
    long _incidentTick = long.MinValue;
    int _nextClipId = 1;
    bool _capturingIncident;
    bool _forcePostImpactSample;
    bool _exported;

    public int ClipId => _clip?.Id ?? 0;
    public bool ExportAvailable => _clip is not null && !_exported;
    public IncidentReplayClip? FrozenClip => _clip;
    public int BufferedSampleCount => _rolling.Count;
    public int BufferedEventCount => _rollingEvents.Count;

    /// <summary>Clear flight-local evidence while retaining monotonic clip identity.</summary>
    public void Reset() {
        _rolling.Clear();
        _rollingEvents.Clear();
        _clip = null;
        _lastStoredTick = long.MinValue;
        _lastObservedEventSequence = 0;
        _lastObservedTerminalState = AircraftTerminalState.Flying;
        _lastObservedSurface = ImpactSurface.None;
        _lastObservedRecovery = Carrier.Recovery.Flying;
        _lastObservedCarrierSolid = Carrier.SolidCollision.None;
        _incidentTimeSeconds = double.NaN;
        _incidentTick = long.MinValue;
        _capturingIncident = false;
        _forcePostImpactSample = false;
        _exported = false;
    }

    /// <summary>
    /// Retain a bounded ordered event stream for a possible carrier incident. SimulationSession
    /// calls this at its central event boundary before any subsequent wreck-contact impulse can
    /// change the target pose. Only player-target facts can belong to the player incident clip.
    /// </summary>
    public void ObserveEvent(in IncidentReplayEvent replayEvent) {
        if (_clip is not null) return;
        SessionEvent sessionEvent = replayEvent.Event;
        if (sessionEvent.Target != CombatRole.Player
            || sessionEvent.Type is not (SessionEventType.Hit
                or SessionEventType.Destroyed
                or SessionEventType.Impact
                or SessionEventType.Settled
                or SessionEventType.TerminalLimitReached
                or SessionEventType.ArrestmentFailed))
            return;
        if (sessionEvent.Sequence <= 0 || sessionEvent.Tick < 0
            || !double.IsFinite(replayEvent.TimeSeconds)
            || !IsFinite(replayEvent.Position)
            || !IsFinite(replayEvent.Velocity))
            throw new ArgumentOutOfRangeException(nameof(replayEvent));
        if (_rollingEvents.Count > 0
            && sessionEvent.Sequence <= _rollingEvents[^1].Event.Sequence)
            throw new ArgumentOutOfRangeException(nameof(replayEvent),
                "Replay events must arrive in strictly increasing sequence order.");

        _rollingEvents.Add(replayEvent);
        if (_rollingEvents.Count > MaximumEvents) _rollingEvents.RemoveAt(0);
    }

    public void Observe(in IncidentReplaySample sample) {
        if (_clip is not null) return;
        if (sample.Tick < 0 || !double.IsFinite(sample.TimeSeconds))
            throw new ArgumentOutOfRangeException(nameof(sample));

        bool carrierImpactEvent = sample.EventSequence > 0
            && sample.EventType == SessionEventType.Impact
            && IsCarrierSurface(sample.EventSurface);
        bool carrierImpactState = sample.TerminalState != AircraftTerminalState.Flying
            && IsCarrierSurface(sample.Surface);
        bool beginsIncident = !_capturingIncident && (carrierImpactEvent || carrierImpactState);
        if (beginsIncident) {
            _capturingIncident = true;
            _incidentTimeSeconds = sample.TimeSeconds;
            _incidentTick = sample.Tick;
            _forcePostImpactSample = true;
        }

        bool transition = beginsIncident
            || sample.EventSequence != _lastObservedEventSequence
            || sample.TerminalState != _lastObservedTerminalState
            || sample.Surface != _lastObservedSurface
            || sample.Recovery != _lastObservedRecovery
            || sample.CarrierSolid != _lastObservedCarrierSolid;
        bool due = _lastStoredTick == long.MinValue
            || sample.Tick - _lastStoredTick >= SampleStrideTicks
            || (_forcePostImpactSample && sample.Tick > _incidentTick);

        _lastObservedEventSequence = sample.EventSequence;
        _lastObservedTerminalState = sample.TerminalState;
        _lastObservedSurface = sample.Surface;
        _lastObservedRecovery = sample.Recovery;
        _lastObservedCarrierSolid = sample.CarrierSolid;
        if (!due && !transition) return;

        if (!Store(sample)) return;
        if (_forcePostImpactSample && sample.Tick > _incidentTick)
            _forcePostImpactSample = false;
        if (_capturingIncident && sample.TerminalState is AircraftTerminalState.Settled
            or AircraftTerminalState.SimulationBounded)
            Freeze();
    }

    /// <summary>Return the current clip once. The caller should cache it for replay/replay-again.</summary>
    public bool TryConsume(int clipId, out IncidentReplayClip clip) {
        if (_clip is null || _clip.Id != clipId || _exported) {
            clip = null!;
            return false;
        }
        _exported = true;
        clip = _clip;
        return true;
    }

    static bool IsCarrierSurface(ImpactSurface surface) =>
        surface is ImpactSurface.FlightDeck or ImpactSurface.CarrierStructure;

    static bool IsFinite(in Vec3D value) => double.IsFinite(value.X)
        && double.IsFinite(value.Y) && double.IsFinite(value.Z);

    bool Store(in IncidentReplaySample sample) {
        // The pre-impulse contact evidence and WreckContactMotion handoff share a completed tick.
        // Preserve the former and force the next tick's post-impact state rather than pretending
        // the instantaneous impulse happened at an earlier timestamp.
        if (_rolling.Count > 0 && _rolling[^1].Tick == sample.Tick) {
            if (_capturingIncident && sample.Tick == _incidentTick) return false;
            _rolling[^1] = sample;
        }
        else {
            _rolling.Add(sample);
            if (_rolling.Count > MaximumSamples) _rolling.RemoveAt(0);
        }
        _lastStoredTick = sample.Tick;
        return true;
    }

    void Freeze() {
        double firstTime = _incidentTimeSeconds - PreIncidentSeconds;
        IncidentReplaySample[] selected = _rolling
            .Where(sample => sample.TimeSeconds >= firstTime)
            .TakeLast(MaximumSamples)
            .ToArray();
        if (selected.Length == 0) return;

        int incidentIndex = 0;
        while (incidentIndex + 1 < selected.Length
            && selected[incidentIndex].TimeSeconds < _incidentTimeSeconds)
            incidentIndex++;
        double selectedStartTime = selected[0].TimeSeconds;
        double selectedEndTime = selected[^1].TimeSeconds;
        IncidentReplayEvent[] selectedEvents = _rollingEvents
            .Where(replayEvent => replayEvent.TimeSeconds >= selectedStartTime
                && replayEvent.TimeSeconds <= selectedEndTime)
            .TakeLast(MaximumEvents)
            .ToArray();
        _clip = new IncidentReplayClip(_nextClipId++, NominalSampleRateHz,
            incidentIndex, selected, selectedEvents);
        _exported = false;
    }
}
