using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Training;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim;

public enum SortieOutcome { None, Victory, Defeat, Draw }
public enum CombatRole { None, Player, Opponent }
public enum AircraftTerminalState {
    Flying,
    DestroyedAirborne,
    Impacted,
    Settled,
    /// <summary>
    /// The explicit numerical guard ended integration before the aircraft reached physical rest.
    /// This is not a contact state and must never be reported or scored as Settled.
    /// </summary>
    SimulationBounded
}
public enum ImpactSurface {
    None,
    Water,
    FlightDeck,
    CarrierStructure,
    SimulationBoundary,
    Ground
}
public enum FlightConfigurationTarget { Combat, Recovery }
public enum PilotOperationalState {
    Normal,
    Straining,
    Grayout,
    Blackout,
    GLoc,
    Recovering,
    Redout
}
public enum SessionEventType {
    Hit,
    Destroyed,
    Impact,
    Settled,
    TerminalLimitReached,
    SortieFinished,
    ArrestmentFailed,
    RaidTargetLeaked,
    OpponentSpawned,
    AutoGcasTransition
}

/// A bounded, ordered record of discrete simulation facts. Sequence numbers are monotonic for the
/// lifetime of a SimulationSession, including across restarts; Tick is the completed tick on which
/// the event becomes visible to presentation and replay consumers.
public readonly record struct SessionEvent(
    long Sequence,
    long Tick,
    SessionEventType Type,
    CombatRole Source,
    CombatRole Target,
    int Count,
    SortieOutcome Outcome,
    ImpactSurface Surface = ImpactSurface.None,
    AutoGcasPhase? AutoGcasPhase = null,
    AutoGcasInhibitReason? AutoGcasInhibitReason = null,
    string? AutoGcasCue = null,
    int AutoGcasActivationCount = 0,
    int AutoGcasReleaseCount = 0,
    int AutoGcasOverrideCount = 0,
    long EntitySequence = 0,
    bool HasKinematics = false,
    Vec3D Position = default,
    Vec3D Velocity = default);

/// <summary>
/// A mission-killed opponent which no longer owns combat targeting but continues through the same
/// failed-flight, impact, and settlement physics as any terminal aircraft.
/// </summary>
public sealed class DetachedOpponentWreck {
    internal DetachedOpponentWreck(IBandit actor, long spawnSequence,
        AircraftTerminalState terminalState, ImpactSurface impactSurface) {
        Actor = actor;
        SpawnSequence = spawnSequence;
        TerminalState = terminalState;
        ImpactSurface = impactSurface;
    }

    internal IBandit Actor { get; }
    public long SpawnSequence { get; }
    public AircraftState Aircraft => Actor.State;
    public AircraftTerminalState TerminalState { get; internal set; }
    public ImpactSurface ImpactSurface { get; internal set; }
}

/// <summary>
/// Presentation-independent lifecycle for one deterministic Guns Only sortie.
/// Rendering shells supply timestamp-free key edges and elapsed wall time; this class owns the
/// fixed-step accumulator, mission transitions, controls, combat, carrier recovery, and resources.
/// </summary>
public sealed class SimulationSession {
    public enum LifecycleState { Ready, Active, Paused, Finished }

    public const double FixedDeltaSeconds = 1.0 / AircraftSim.TickHz;
    public const int RecentEventCapacity = 64;
    // Terrain prediction is deliberately a flight-computer-rate task rather than a 120 Hz
    // actuator task. The held recovery command still reaches AircraftSim every fixed tick.
    public const int AutoGcasPredictionIntervalTicks = 6;
    /// Fail-safe only: catastrophic configurations normally reach a physical surface much sooner.
    /// The explicit event prevents an out-of-bounds trajectory from holding a session forever.
    public const double TerminalSimulationLimitSeconds = 180.0;

    AircraftSim _player = null!;
    IBandit _bandit = null!;
    BeatSetup _beat = null!;
    KeyGrammar _keys = null!;
    DetentLayer _detents = null!;
    GunKill _gunKill = null!;
    GunKill _opponentGun = null!;
    FuelModel _fuel = null!;
    AirframeSystems _systems = null!;
    PilotPhysiologyModel _pilotPhysiology = null!;
    AutoGcasState _autoGcasState;
    PilotCommand? _autoGcasRecoveryCommand;
    int _autoGcasPredictionTicksRemaining;
    int _autoGcasPredictionEvaluationCount;
    double _autoGcasPredictionElapsedSeconds;
    GunneryPitchAssistState _gunneryPitchAssistState =
        GunneryPitchAssistState.Inactive();
    readonly PadlockRollAssist _padlockRollAssist = new();
    bool _banditPadlockRollAssistSelected;
    long _banditPadlockRollAssistTargetSequence;
    PilotCommand _pilotDelayedCommand;
    bool _pilotCommandResponseInitialized;
    bool _pilotControlInterlocked;
    bool _pilotTriggerInterlocked;
    bool _pilotWasIncapacitated;
    bool _pilotRecovering;
    int _pilotGLocCount;
    double _pilotPeakPositiveG;
    double _pilotPeakNegativeG;
    double _pilotHeldThrottle;
    F86EmergencyGearRecoveryScenario? _maintenanceScenario;
    VisualMergeEvaluation? _visualMergeEvaluation;
    DroneRaidEvaluation? _droneRaidEvaluation;
    PromptTracker _prompts = null!;
    PromptCue _cue;
    DoctrineAdvice _advice = new(1.0, 0.0, "setup");
    Func<BeatSetup> _beatFactory = Beats.Perch;
    ValleyVariant _requestedVariant = ValleyVariant.DoctrineDeep;
    WeatherProfile? _weatherProfile;
    ITerrainSurface? _terrainSurface;

    double _accumulatorSeconds;
    double _simTimeMs;
    long _tick;
    double _lastRange;
    double _closureKts;
    double _closureSmooth;
    string _transitionCue = "";
    double _transitionCueUntilMs = double.NegativeInfinity;
    double _splashCueUntilMs = double.NegativeInfinity;
    int _shotsTotal;
    int _shotsInWindow;
    int _killCount;
    int _engagementNumber = 1;
    int _droneRaidTargetIndex;
    bool _triggerDown;
    bool _opponentTriggerDown;
    bool _assistedFlight;
    int _assistedSpeedBiasIndex;
    int _beatIndex = 1;
    bool _prechargeSystemsOnStage = true;
    long _playerSpawnSequence;
    long _banditSpawnSequence;
    long _carrierSpawnSequence;
    SortieOutcome _outcome;
    SortieOutcome _pendingOutcome;
    AircraftTerminalState _playerTerminalState;
    AircraftTerminalState _opponentTerminalState;
    ImpactSurface _playerImpactSurface;
    ImpactSurface _opponentImpactSurface;
    Carrier.SolidCollision _playerCarrierSolid;
    WreckContactMotion? _playerWreckMotion;
    double _terminalStartedAtMs = double.PositiveInfinity;
    double _nextOpponentSpawnAtMs = double.NegativeInfinity;
    readonly List<SessionEvent> _recentEvents = new(RecentEventCapacity);
    readonly List<DetachedOpponentWreck> _detachedOpponentWrecks = new();
    readonly IncidentReplayRecorder _incidentReplay = new();
    readonly DecisionRecorder _decisionRecorder = new();
    long _eventSequence;
    long _decisionClosedActorSpawnSequence;
    long _decisionLastCapturedActorSpawnSequence;
    long _decisionPendingTruncatedActorSpawnSequence;
    PendingTerminalDecision? _decisionPendingTerminal;
    bool _decisionCaptureEnabled = true;
    bool _decisionFireIntentEvaluatedThisTick;
    bool _decisionFireIntentConsumedThisTick;
    bool _decisionFireAuthorizedThisTick;

    Carrier? _carrier;
    readonly RecoveryProgress _recoveryProgress = new();
    RecoveryDifficulty _difficulty = DifficultyModel.ForLevel(0);
    bool _recoveryAttemptActive;
    bool _attemptHadSetback;
    bool _attemptCleanRecorded;
    Carrier.Recovery _recovery = Carrier.Recovery.Flying;
    Carrier.TouchdownResult _touchdown = Carrier.TouchdownResult.Flying;
    readonly CarrierPassRecorder _carrierPass = new();
    readonly ArrestmentModel _arrestment = new();
    readonly CatapultLaunchModel _catapult = new();
    BurbleField? _burble;
    Carrier.DeckConfiguration _deckConfiguration;
    bool _waveOffArmed;
    double _waveOffUntilMs = double.NegativeInfinity;
    FlightConfigurationTarget _configurationTarget = FlightConfigurationTarget.Combat;
    bool _configurationAutomationEnabled;
    bool _manualGearConfiguration;
    bool _manualFlapConfiguration;
    bool _configurationWasReady = true;
    double _configurationReadyCueUntilMs = double.NegativeInfinity;

    public SimulationSession(int beatIndex = 1,
        Carrier.DeckConfiguration deckConfiguration = Carrier.DeckConfiguration.Axial,
        WeatherProfile? weather = null) {
        _weatherProfile = weather;
        _terrainSurface = weather?.Terrain;
        StartBeat(beatIndex, deckConfiguration);
    }

    public LifecycleState Lifecycle { get; private set; } = LifecycleState.Ready;
    public int BeatIndex => _beatIndex;
    public Carrier.DeckConfiguration DeckConfiguration => _deckConfiguration;
    public double TimeMilliseconds => _simTimeMs;
    public double TimeSeconds => _simTimeMs / 1000.0;
    public long Tick => _tick;
    public AircraftSim Player => _player;
    public IBandit Bandit => _bandit;
    public BeatSetup Beat => _beat;
    public KeyGrammar Keys => _keys;
    public DetentLayer Controls => _detents;
    public GunKill PlayerGun => _gunKill;
    public GunKill OpponentGun => _opponentGun;
    public FuelModel PlayerFuel => _fuel;
    public AirframeSystems PlayerSystems => _systems;
    public PilotPhysiologyModel PilotPhysiology => _pilotPhysiology;
    public PilotPhysiologyState PilotPhysiologyState => _pilotPhysiology.State;
    public PilotOperationalState PilotState => ResolvePilotOperationalState();
    public AutoGcasCapabilityProfile PlayerAutoGcasCapability =>
        _beat.PlayerAircraft.AutomaticGroundCollisionAvoidance;
    public AutoGcasState AutoGcas => _autoGcasState;
    public int AutoGcasPredictionEvaluationCount => _autoGcasPredictionEvaluationCount;
    public GunneryPitchAssistState GunneryPitchAssist =>
        _gunneryPitchAssistState;
    public PadlockRollAssistState BanditPadlockRollAssist =>
        _padlockRollAssist.State;
    // The dedicated paddle (K) and the envelope-override commit gesture (Space) both refuse
    // Auto-GCAS: holding Space through a valley run IS the deliberate low-flying declaration.
    // Both are gated on conscious control authority, so a G-LOC with the key still physically
    // depressed restores full protection immediately.
    public bool AutoGcasOverrideHeld => PlayerAutoGcasCapability.Available
        && _pilotPhysiology.State.ControlAuthority01 >= 0.55
        && (_keys.PhaseAt(GKey.AutoGcasOverride, _simTimeMs) != KeyPhase.Idle
            || _keys.PhaseAt(GKey.Override, _simTimeMs) != KeyPhase.Idle);
    public bool PilotControlInterlocked => _pilotControlInterlocked;
    public bool PilotTriggerInterlocked => _pilotTriggerInterlocked;
    public int PilotGLocCount => _pilotGLocCount;
    public double PilotPeakPositiveG => _pilotPeakPositiveG;
    public double PilotPeakNegativeG => _pilotPeakNegativeG;
    public bool PlayerSystemsSimulated => _beat.PlayerAircraft.SystemsSimulated;
    /// <summary>
    /// Aerodynamic configuration which the active capability is allowed to contribute. A
    /// compatibility AirframeSystems object still exists for the flat snapshot ABI, but an
    /// aircraft which explicitly declares its systems unsimulated can never acquire invisible
    /// F-86 gear/flap lift or drag through that object.
    /// </summary>
    public AirframeAerodynamicState PlayerAerodynamicConfiguration => PlayerSystemsSimulated
        ? _systems.AerodynamicState
        : AirframeAerodynamicState.Clean;
    public F86EmergencyGearRecoveryScenario? MaintenanceScenario => _maintenanceScenario;
    public VisualMergeEvaluation? VisualMergeEvaluation => _visualMergeEvaluation;
    public DroneRaidEvaluation? DroneRaidEvaluation => _droneRaidEvaluation;
    public PromptCue Cue => _cue;
    public DoctrineAdvice Advice => _advice;
    public Carrier? Carrier => _carrier;
    public RecoveryProgress RecoveryProgress => _recoveryProgress;
    public RecoveryDifficulty Difficulty => _difficulty;
    public Carrier.Recovery Recovery => _recovery;
    public Carrier.TouchdownResult Touchdown => _touchdown;
    public CarrierPassResult CarrierPass => _carrierPass.Result;
    public ArrestmentModel Arrestment => _arrestment;
    public CatapultLaunchModel Catapult => _catapult;
    public BurbleField? Burble => _burble;
    public double ClosureKts => _closureKts;
    public int ShotsTotal => _shotsTotal;
    public int ShotsInWindow => _shotsInWindow;
    public int KillCount => _killCount;
    public bool ContinuousCombat => _beat.ContinuousCombat is not null;
    public int EngagementNumber => _engagementNumber;
    public bool OpponentReplacementPending => ContinuousCombat
        && Lifecycle == LifecycleState.Active
        && _playerTerminalState == AircraftTerminalState.Flying
        && _opponentTerminalState != AircraftTerminalState.Flying
        && double.IsFinite(_nextOpponentSpawnAtMs);
    public double OpponentReplacementSeconds => OpponentReplacementPending
        ? Math.Max(0.0, (_nextOpponentSpawnAtMs - _simTimeMs) / 1000.0)
        : 0.0;
    public SortieOutcome Outcome => _outcome;
    public SortieOutcome PendingOutcome => _pendingOutcome;
    public AircraftTerminalState PlayerTerminalState => _playerTerminalState;
    public AircraftTerminalState OpponentTerminalState => _opponentTerminalState;
    /// A completed staged raid has no authoritative target even though its last mission-killed or
    /// leaked vehicle is not integrated through the ordinary one-opponent terminal state machine.
    public bool OpponentBodyPresent => _droneRaidEvaluation is {
        Finished: true, OwnshipLost: false
    } ? false : _opponentTerminalState != AircraftTerminalState.Settled;
    public ImpactSurface PlayerImpactSurface => _playerImpactSurface;
    public ImpactSurface OpponentImpactSurface => _opponentImpactSurface;
    /// <summary>The last authoritative carrier proxy contacted by the player wreck.</summary>
    public Carrier.SolidCollision PlayerCarrierSolid =>
        _playerWreckMotion?.CarrierSolid ?? _playerCarrierSolid;
    public bool TerminalPhaseActive => _playerTerminalState != AircraftTerminalState.Flying
        || _opponentTerminalState != AircraftTerminalState.Flying;
    public IReadOnlyList<SessionEvent> RecentEvents => _recentEvents;
    public IReadOnlyList<DetachedOpponentWreck> DetachedOpponentWrecks =>
        _detachedOpponentWrecks;
    public IncidentReplayRecorder IncidentReplay => _incidentReplay;
    public DecisionRecorder Decisions => _decisionRecorder;
    /// <summary>
    /// Selects whether a staged sortie emits decision records. Changing this while the simulation
    /// clock is released would create an unmarked hole in an otherwise contiguous episode, so the
    /// setting may only change while the session is Ready.
    /// </summary>
    public bool DecisionCaptureEnabled {
        get => _decisionCaptureEnabled;
        set {
            if (value != _decisionCaptureEnabled
                && Lifecycle != LifecycleState.Ready)
                throw new InvalidOperationException(
                    "Decision capture can only change while the session is staged in Ready.");
            _decisionCaptureEnabled = value;
        }
    }
    public long PlayerSpawnSequence => _playerSpawnSequence;
    public long BanditSpawnSequence => _banditSpawnSequence;
    public long CarrierSpawnSequence => _carrier is null ? 0 : _carrierSpawnSequence;
    public bool TriggerDown => _triggerDown;
    public bool OpponentTriggerDown => _opponentTriggerDown;
    public bool AssistedFlight => _assistedFlight;
    public int AssistedSpeedBiasKts => _assistedSpeedBiasIndex * 30;
    public bool WeaponsInhibited => _visualMergeEvaluation?.WeaponsInhibited ?? false;
    public bool PlayerWeaponsAuthorized =>
        (_visualMergeEvaluation?.PlayerWeaponsAuthorized ?? true)
        && !_autoGcasState.Active
        && !_pilotTriggerInterlocked
        && _pilotPhysiology.State.ControlImpairment
            != PilotControlImpairment.Incapacitated;
    // Compatibility projection for the old transient HUD. Terminal destruction is represented by
    // ordered events plus Outcome; a frozen simulation clock must never hold a timed cue forever.
    public bool SplashCueActive => _simTimeMs < _splashCueUntilMs;
    public bool TransitionCueActive => _catapult.IsActive || _simTimeMs < _transitionCueUntilMs;
    public string TransitionCue => TransitionCueActive ? _transitionCue : "";
    public bool WaveOffActive => _carrier is not null && _simTimeMs < _waveOffUntilMs;
    public FlightConfigurationTarget ConfigurationTarget => _configurationTarget;
    public bool ConfigurationAutomationEnabled => _configurationAutomationEnabled;
    public bool AutomaticGearSelection => _configurationAutomationEnabled
        && !_manualGearConfiguration;
    public bool AutomaticFlapSelection => _configurationAutomationEnabled
        && !_manualFlapConfiguration;
    public bool ConfigurationTransitionActive => _configurationAutomationEnabled
        && !ConfigurationReady;
    public string ConfigurationCue {
        get {
            if (!_configurationAutomationEnabled) return "";
            if (!ConfigurationReady) {
                string gear = GearAtTarget ? "" : _configurationTarget
                    == FlightConfigurationTarget.Combat ? "GEAR UP" : "GEAR DOWN";
                string flaps = FlapsAtTarget ? "" : _configurationTarget
                    == FlightConfigurationTarget.Combat ? "FLAPS UP" : "FLAPS DOWN";
                string action = string.Join(" / ", new[] { gear, flaps }
                    .Where(static value => value.Length > 0));
                bool manual = (!GearAtTarget && _manualGearConfiguration)
                    || (!FlapsAtTarget && _manualFlapConfiguration);
                string prefix = manual ? "MANUAL CONFIG"
                    : _configurationTarget == FlightConfigurationTarget.Combat
                        ? "AUTO CLEANUP" : "AUTO RECOVERY CONFIG";
                return $"{prefix} · {action}";
            }
            if (_simTimeMs >= _configurationReadyCueUntilMs) return "";
            return _configurationTarget == FlightConfigurationTarget.Combat
                ? "CLEAN · READY TO FIGHT" : "RECOVERY CONFIGURED";
        }
    }
    /// The player's preferred free-flight assistance mode. Carrier beats may temporarily force the
    /// effective detent layer to PhysicsOnly so their neutral ApproachLaw cannot cap combat at 1 G.
    public ValleyVariant Variant => _requestedVariant;
    public ValleyVariant EffectiveVariant => _detents.Variant;
    /// <summary>
    /// Scenario-owned weather. Null selects the historical standard atmosphere and the beat's
    /// existing deterministic default wind; no process-global environment is mutated.
    /// </summary>
    public WeatherProfile? Weather => _weatherProfile;
    public ITerrainSurface? Terrain => _terrainSurface;

    /// <summary>
    /// Re-anchor the immutable terrain substrate without restaging aircraft, weapons, fuel, or
    /// mission progression. The browser uses this once its persistent-world sector origin is
    /// known; every subsequent AGL, line-of-sight, impact, and wreck query observes the same
    /// translated surface. Scenario authors should still prefer StartBeatWithTerrain at staging.
    /// </summary>
    public void SetTerrainSurface(ITerrainSurface? terrain) {
        _terrainSurface = terrain;
        // The active opponent captured the previous surface at construction; a world-origin
        // re-anchor must reach it or its floor sense silently reads the stale translation.
        switch (_bandit) {
            case ReactiveBandit reactive: reactive.UpdateTerrain(terrain); break;
            case NeutralMergeBandit merge: merge.UpdateTerrain(terrain); break;
        }
    }

    /// <summary>Construct and stage one of the built-in beats. Physics remains held in Ready.</summary>
    public void StartBeat(int index,
        Carrier.DeckConfiguration deckConfiguration = Carrier.DeckConfiguration.Axial) {
        if (index is < 1 or > 9) index = 1;
        _prechargeSystemsOnStage = true;
        _beatIndex = index;
        _deckConfiguration = deckConfiguration;
        _beatFactory = index switch {
            2 => Beats.BreakDefense,
            3 => Beats.Saddle,
            4 => Beats.BalloonStrike,
            5 => () => Beats.F35CCarrierApproach(deckConfiguration),
            6 => () => Beats.EmergencyGearRecovery(deckConfiguration),
            7 => Beats.ModernVisualMerge,
            8 => Beats.DroneRaidDefense,
            9 => Beats.ModernAceDuel,
            _ => Beats.Perch
        };
        StageBeat(_beatFactory());
    }

    /// <summary>Stage a built-in beat under an explicit thermodynamic/wind profile.</summary>
    public void StartBeat(int index, WeatherProfile? weather,
        Carrier.DeckConfiguration deckConfiguration = Carrier.DeckConfiguration.Axial) {
        _weatherProfile = weather;
        _terrainSurface = weather?.Terrain;
        StartBeat(index, deckConfiguration);
    }

    /// <summary>
    /// Stage a built-in beat over explicit terrain while retaining the beat's established default
    /// atmosphere and wind. This keeps a data-pack surface from silently changing flight weather.
    /// </summary>
    public void StartBeatWithTerrain(int index, ITerrainSurface? terrain,
        Carrier.DeckConfiguration deckConfiguration = Carrier.DeckConfiguration.Axial) {
        _weatherProfile = null;
        _terrainSurface = terrain;
        StartBeat(index, deckConfiguration);
    }

    /// <summary>
    /// Stage a built-in beat with independently selected weather and terrain. Presentation hosts
    /// use this boundary when the streamed visual/physics terrain is shared across several
    /// deterministic weather days; neither substrate is allowed to silently replace the other.
    /// </summary>
    public void StartBeatWithEnvironment(int index, WeatherProfile? weather,
        ITerrainSurface? terrain,
        Carrier.DeckConfiguration deckConfiguration = Carrier.DeckConfiguration.Axial) {
        _weatherProfile = weather;
        _terrainSurface = terrain;
        StartBeat(index, deckConfiguration);
    }

    /// <summary>
    /// Stage a custom beat. The factory is retained so restart always receives fresh mutable world
    /// objects, especially a new Carrier rather than one which has already steamed and pitched.
    /// </summary>
    public void StartBeat(Func<BeatSetup> beatFactory) {
        ArgumentNullException.ThrowIfNull(beatFactory);
        _beatIndex = 0;
        // Custom scenario authors own their initial systems condition. Preserve the historical
        // unpressurised component state so a fault injected after staging cannot inherit hidden
        // stored pressure from the built-in airborne-mission convenience.
        _prechargeSystemsOnStage = false;
        _beatFactory = beatFactory;
        BeatSetup setup = beatFactory();
        _deckConfiguration = setup.Carrier?.Configuration ?? _deckConfiguration;
        StageBeat(setup);
    }

    /// <summary>Stage custom scenario content and its weather as one deterministic boundary.</summary>
    public void StartBeat(Func<BeatSetup> beatFactory, WeatherProfile? weather) {
        _weatherProfile = weather;
        StartBeat(beatFactory);
    }

    /// <summary>Rebuild the current beat and return to Ready without resetting session progression.</summary>
    public void Restart() => StageBeat(_beatFactory());

    /// <summary>Release a staged sortie from Ready with a clean input boundary.</summary>
    public void Begin() {
        if (Lifecycle != LifecycleState.Ready) return;
        ClearHeldInput();
        if (_carrier is not null) {
            // StageBeat previews these exact conditions so the aircraft and deck can be rendered in
            // Ready. The attempt is consumed only here, at the authoritative clock-release edge.
            _difficulty = _recoveryProgress.BeginAttempt();
            _carrier.ApplyDifficulty(_difficulty);
            _recoveryAttemptActive = true;
        }
        _maintenanceScenario?.Begin(TimeSeconds);
        _droneRaidEvaluation?.Begin(TimeSeconds, _gunKill.RoundsFired);
        _droneRaidEvaluation?.Step(TimeSeconds, _player.State, _bandit.State,
            _gunKill.GunSolution, _gunKill.RoundsFired);
        if (_carrier is null && _beat.PlayerAir.ThrustMaxN > 0.0
            && _beat.InitialThrottle >= 0.995)
            ShowTransition("MIL SET · FIGHT", 1800.0);
        Lifecycle = LifecycleState.Active;
    }

    /// <summary>Pause or resume an active sortie. Ready remains Ready until Begin is explicit.</summary>
    public void SetPaused(bool paused) {
        if (paused && Lifecycle == LifecycleState.Active) {
            ClearHeldInput();
            Lifecycle = LifecycleState.Paused;
        } else if (!paused && Lifecycle == LifecycleState.Paused) {
            Lifecycle = LifecycleState.Active;
        }
    }

    public void SetVariant(ValleyVariant variant) {
        _requestedVariant = variant;
        if (_carrier is null) _detents.Variant = variant;
    }

    /// <summary>Enable or disable the pilot-selected assisted dogfighting command layer.</summary>
    public void SetAssistedFlight(bool enabled) => _assistedFlight = enabled;

    /// <summary>
    /// Move the assisted corner-speed preference by one 30-knot step in the requested direction.
    /// The five deterministic positions deliberately expose only the pilot-owner's small desired
    /// speed range; zero is a no-op and larger magnitudes still mean one directional step.
    /// </summary>
    public void NudgeAssistedSpeed(int direction) {
        if (direction == 0) return;
        _assistedSpeedBiasIndex = Math.Clamp(
            _assistedSpeedBiasIndex + Math.Sign(direction), -2, 2);
    }

    public void FeedKey(GKey key, bool pressed) {
        if (key == GKey.Restart) {
            if (pressed) Restart();
            return;
        }
        if (Lifecycle != LifecycleState.Active) return;
        // Once ownship is physically destroyed, input cannot be allowed to reanimate controls or
        // systems. Restart remains available through the early branch above.
        if (_playerTerminalState != AircraftTerminalState.Flying) return;
        // G-LOC is a control-ownership boundary, not merely a visual effect. Releases still pass
        // through so held browser keys can cross the required neutral boundary after recovery,
        // but no new pilot actuator/system press is accepted while controls remain interlocked.
        if (pressed && _pilotControlInterlocked && IsPilotActuatedAction(key)) return;
        // Capability truth is also an input boundary. Modern/glider prototypes currently expose no
        // simulated undercarriage, flap, hydraulic or inspection system, so accepting these keys
        // would create hidden F-86 configuration drag while the HUD correctly showed no system.
        if (!PlayerSystemsSimulated && IsPlayerSystemsAction(key)) return;
        bool newPress = pressed && _keys.PhaseAt(key, _simTimeMs) == KeyPhase.Idle;
        _keys.Feed(key, pressed, _simTimeMs);
        if (key == GKey.Trigger) Trigger(pressed);
        // A browser may repeat key-down while G remains held. Configuration selectors respond to
        // the physical rising edge, not to the host's keyboard repeat cadence.
        if (key == GKey.GearToggle && newPress) {
            if (_configurationAutomationEnabled) _manualGearConfiguration = true;
            LandingGearHandle selected = _systems.GearHandle == LandingGearHandle.Up
                ? LandingGearHandle.Down : LandingGearHandle.Up;
            if (selected == LandingGearHandle.Down && _maintenanceScenario is not null)
                _maintenanceScenario.SelectNormalGearDown(TimeSeconds);
            else
                _systems.CommandGear(selected);
        }
        if (key is GKey.FlapUp or GKey.FlapDown) {
            if (newPress && _configurationAutomationEnabled) _manualFlapConfiguration = true;
            RefreshFlapLeverFromHeldInput();
        }
        if (key == GKey.EmergencyGearRelease) {
            if (_maintenanceScenario is not null)
                _maintenanceScenario.SetEmergencyGearRelease(pressed, TimeSeconds);
            else
                _systems.SetEmergencyGearRelease(pressed);
        }
        if (key == GKey.GearHornCutout && newPress)
            _systems.SilenceGearWarningHorn();
        if (key == GKey.ConfirmGearExtensionFailure && newPress)
            _maintenanceScenario?.ConfirmNormalExtensionFailure(TimeSeconds);
        if (key == GKey.InspectGearDownlocks && newPress)
            _maintenanceScenario?.InspectMechanicalDownlocks(TimeSeconds);
    }

    /// <summary>
    /// A spring-loaded direct throttle control is a continuous hold, never a deferred keyboard
    /// tap. Its host calls this immediately after the matching release edge.
    /// </summary>
    public void SuppressPendingThrottleTap(bool increase) =>
        _keys.SuppressPendingTap(increase ? GKey.ThrottleUp : GKey.ThrottleDown);

    /// <summary>
    /// Source-aware direct throttle hold edge (the phone rocker). Unlike FeedKey, a direct hold
    /// never enters tap/double-tap classification: a prior legitimate keyboard throttle tap is
    /// committed rather than consumed as a double-tap arm, and the hold's release leaves no
    /// deferred tap behind, so no post-release suppression call is needed.
    /// </summary>
    public void FeedDirectThrottle(bool increase, bool pressed) {
        if (Lifecycle != LifecycleState.Active) return;
        if (_playerTerminalState != AircraftTerminalState.Flying) return;
        // Same G-LOC ownership boundary as FeedKey: releases pass through so held controls can
        // cross the required neutral boundary, but no new press is accepted while interlocked.
        if (pressed && _pilotControlInterlocked) return;
        _keys.FeedDirect(increase ? GKey.ThrottleUp : GKey.ThrottleDown,
            pressed, _simTimeMs);
    }

    /// <summary>Set the latest continuous lateral-stick command from a direct-input host.</summary>
    public void SetAnalogRollControl(double value) {
        if (!double.IsFinite(value))
            throw new ArgumentOutOfRangeException(nameof(value));
        if (Lifecycle != LifecycleState.Active
            || _playerTerminalState != AircraftTerminalState.Flying
            || _pilotControlInterlocked) {
            _detents.ClearAnalogRollControl();
            return;
        }
        _detents.SetAnalogRollControl(value);
    }

    /// <summary>
    /// Select the current local opponent for the low-authority padlock lift-plane hold. The browser
    /// supplies only this discrete semantic transition; geometry and actuator demand remain owned
    /// by the deterministic 120 Hz simulation. Capturing the spawn sequence prevents a replacement
    /// opponent from inheriting the previous contact's assist latch.
    /// </summary>
    public void SetBanditPadlockRollAssist(bool selected) {
        if (!selected) {
            _banditPadlockRollAssistSelected = false;
            _banditPadlockRollAssistTargetSequence = 0;
            _padlockRollAssist.Reset();
            return;
        }
        if (!_banditPadlockRollAssistSelected) {
            _banditPadlockRollAssistTargetSequence = _banditSpawnSequence;
            _padlockRollAssist.Reset();
        }
        _banditPadlockRollAssistSelected = true;
    }

    static bool IsPlayerSystemsAction(GKey key) => key is
        GKey.GearToggle or GKey.FlapUp or GKey.FlapDown
        or GKey.EmergencyGearRelease or GKey.GearHornCutout
        or GKey.ConfirmGearExtensionFailure or GKey.InspectGearDownlocks;

    static bool IsPilotActuatedAction(GKey key) => key is
        GKey.PullUp or GKey.PushDown or GKey.RollLeft or GKey.RollRight
        or GKey.RudderLeft or GKey.RudderRight
        or GKey.ThrottleUp or GKey.ThrottleDown or GKey.Trigger
        or GKey.Override or GKey.AutoGcasOverride
        || IsPlayerSystemsAction(key);

    void ReleaseSpringLoadedPilotActuators() {
        _detents.ClearAnalogRollControl();
        _keys.Feed(GKey.FlapUp, false, _simTimeMs);
        _keys.Feed(GKey.FlapDown, false, _simTimeMs);
        _systems.SetFlapLever(WingFlapLever.Hold);
        _keys.Feed(GKey.EmergencyGearRelease, false, _simTimeMs);
        if (_maintenanceScenario is { Started: true, Finished: false })
            _maintenanceScenario.SetEmergencyGearRelease(false, TimeSeconds);
        else
            _systems.SetEmergencyGearRelease(false);
        _keys.Feed(GKey.AutoGcasOverride, false, _simTimeMs);
        _keys.Feed(GKey.Trigger, false, _simTimeMs);
        Trigger(false);
    }

    void RefreshFlapLeverFromHeldInput() {
        bool upHeld = _keys.PhaseAt(GKey.FlapUp, _simTimeMs) != KeyPhase.Idle;
        bool downHeld = _keys.PhaseAt(GKey.FlapDown, _simTimeMs) != KeyPhase.Idle;
        // Conflicting spring-loaded selections resolve to HOLD. Releasing either key resumes the
        // other still-held command instead of allowing an unrelated key-up to cancel it.
        _systems.SetFlapLever(upHeld == downHeld
            ? WingFlapLever.Hold
            : upHeld ? WingFlapLever.Up : WingFlapLever.Down);
    }

    /// <summary>
    /// Advance by real elapsed seconds, using the production 120 Hz fixed tick. A returning browser
    /// tab can catch up by at most 250 ms.
    /// </summary>
    public void Advance(double elapsedSeconds) {
        if (!double.IsFinite(elapsedSeconds) || elapsedSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(elapsedSeconds));
        if (Lifecycle != LifecycleState.Active) return;

        _accumulatorSeconds = Math.Min(_accumulatorSeconds + elapsedSeconds, 0.25);
        while (_accumulatorSeconds >= FixedDeltaSeconds
            && Lifecycle == LifecycleState.Active) {
            _accumulatorSeconds -= FixedDeltaSeconds;
            RunFixedTick();
        }
        if (Lifecycle != LifecycleState.Active) _accumulatorSeconds = 0.0;
    }

    /// <summary>Run exactly one production tick when Active. Ready and Paused are stable holds.</summary>
    public void StepFixed() {
        if (Lifecycle == LifecycleState.Active) RunFixedTick();
    }

    void RunFixedTick() {
        DecisionTickCapture? decisionCapture = BeginDecisionTickCapture();
        _decisionFireIntentEvaluatedThisTick = false;
        _decisionFireIntentConsumedThisTick = false;
        _decisionFireAuthorizedThisTick = false;
        StepDetachedOpponentWrecks();
        StepCore();
        if (decisionCapture is { } capture) CompleteDecisionTickCapture(capture);
        StepPendingTerminalDecision();
        _tick++;
        CaptureIncidentReplaySample();
    }

    readonly record struct DecisionTickCapture(
        IBandit Actor,
        IBanditDecisionTraceSource TraceSource,
        AircraftState ActorState,
        ActorObservation PlayerObservation,
        BanditPolicyMemory PolicyMemory,
        long SelectionSequence,
        long PlayerSpawnSequence,
        long ActorSpawnSequence,
        double ElapsedSeconds,
        GunKill ActorGun,
        GunKill PlayerGun,
        int ActorAmmo,
        int ActorRounds,
        int ActorHits,
        int PlayerHits,
        long EventSequence,
        bool WeaponsAuthorized);

    DecisionTickCapture? BeginDecisionTickCapture() {
        if (!DecisionCaptureEnabled
            || _banditSpawnSequence == _decisionClosedActorSpawnSequence
            || _bandit is not IBanditDecisionTraceSource traceSource)
            return null;
        AircraftState playerState = _player.State;
        return new DecisionTickCapture(
            _bandit,
            traceSource,
            _bandit.State,
            ActorObservation.Capture(playerState, _tick),
            traceSource.PolicyMemory,
            traceSource.DecisionTrace.SelectionSequence,
            _playerSpawnSequence,
            _banditSpawnSequence,
            TimeSeconds,
            _opponentGun,
            _gunKill,
            _opponentGun.AmmoRemaining,
            _opponentGun.RoundsFired,
            _opponentGun.HitCount,
            _gunKill.HitCount,
            _eventSequence,
            OpponentWeaponsAuthorized());
    }

    /// <summary>
    /// A terminal decision record whose destruction outcome is still provisional: one combatant is
    /// already destroyed, but the other can still be splashed by rounds that were airborne before
    /// the destruction. The immutable terminal record is appended only after those rounds settle,
    /// with its reward/outcome amended to the authoritative final result (e.g. a delayed mutual
    /// kill). Observations, action, and event provenance stay exactly as captured at the terminal
    /// tick; only the destruction facts, hit totals, and event range may be amended.
    /// </summary>
    readonly record struct PendingTerminalDecision(
        BanditDecisionRecord Record,
        IBandit Actor,
        GunKill ActorGun,
        GunKill PlayerGun,
        int ActorHitsBaseline,
        int PlayerHitsBaseline,
        long EventSequenceBase);

    void CompleteDecisionTickCapture(in DecisionTickCapture capture) {
        BanditDecisionTrace trace = capture.TraceSource.DecisionTrace;
        if (trace.SelectionSequence <= 0L) return;

        bool actorReplaced = capture.ActorSpawnSequence != _banditSpawnSequence
            || !ReferenceEquals(capture.Actor, _bandit);
        bool actorDestroyed = capture.Actor.CatastrophicallyDamaged;
        bool opponentDestroyed = _playerTerminalState != AircraftTerminalState.Flying;
        bool terminated = actorReplaced || actorDestroyed || opponentDestroyed;
        bool truncated = !terminated && Lifecycle != LifecycleState.Active;
        DecisionTerminationReason terminationReason = actorDestroyed && opponentDestroyed
            ? DecisionTerminationReason.MutualDestruction
            : opponentDestroyed
                ? DecisionTerminationReason.OpponentDestroyed
                : actorDestroyed
                    ? DecisionTerminationReason.ActorDestroyed
                    : actorReplaced
                        ? DecisionTerminationReason.ActorReplaced
                        : truncated
                            ? DecisionTerminationReason.SortieFinished
                            : DecisionTerminationReason.None;

        CombatPolicyObservation observation = CombatPolicyObservation.Capture(
            _tick,
            capture.ElapsedSeconds,
            capture.ActorState,
            capture.PlayerObservation,
            capture.ActorAmmo,
            capture.WeaponsAuthorized);
        ActorObservation nextPlayerObservation = ActorObservation.Capture(
            _player.State, _tick + 1L);
        CombatPolicyObservation nextObservation = CombatPolicyObservation.Capture(
            _tick + 1L,
            TimeSeconds,
            capture.Actor.State,
            nextPlayerObservation,
            capture.ActorGun.AmmoRemaining,
            !terminated && !truncated && OpponentWeaponsAuthorized());
        bool inEnvelope =
            CombatRewardModel.InAuthorizedFiringEnvelope(observation);
        var components = new CombatRewardComponents(
            ElapsedSeconds: FixedDeltaSeconds,
            GeometryPotentialDelta: CombatRewardModel.GeometryPotential(nextObservation)
                - CombatRewardModel.GeometryPotential(observation),
            FiringEnvelopeSeconds: inEnvelope ? FixedDeltaSeconds : 0.0,
            RoundsFired: capture.ActorGun.RoundsFired - capture.ActorRounds,
            HitsScored: capture.ActorGun.HitCount - capture.ActorHits,
            HitsReceived: capture.PlayerGun.HitCount - capture.PlayerHits,
            OpponentDestroyed: opponentDestroyed,
            OwnshipDestroyed: actorDestroyed);
        bool hasEvents = _eventSequence > capture.EventSequence;
        bool maneuverSelected = trace.SelectionSequence > capture.SelectionSequence;
        bool memoryReset = capture.ActorSpawnSequence
            != _decisionLastCapturedActorSpawnSequence;
        bool previousEpisodeTruncated = memoryReset
            && _decisionPendingTruncatedActorSpawnSequence > 0L
            && _decisionPendingTruncatedActorSpawnSequence
                != capture.ActorSpawnSequence;
        var record = new BanditDecisionRecord(
            Sequence: 0L,
            Kind: DecisionRecordKind.Transition,
            BoundaryTick: 0L,
            BoundaryReason: DecisionBoundaryReason.None,
            capture.PlayerSpawnSequence,
            capture.ActorSpawnSequence,
            PolicySkill: trace.Skill,
            MemoryReset: memoryReset,
            PreviousActorSpawnSequence: previousEpisodeTruncated
                ? _decisionPendingTruncatedActorSpawnSequence : 0L,
            PreviousActorEpisodeTruncated: previousEpisodeTruncated,
            observation,
            nextObservation,
            ManeuverSelected: maneuverSelected,
            ManeuverTrace: maneuverSelected ? trace : default,
            PolicyMemoryBefore: capture.PolicyMemory,
            PolicyMemoryAfter: capture.TraceSource.PolicyMemory,
            ManeuverApplied: capture.TraceSource.AppliedCommand,
            FireIntentEvaluated: _decisionFireIntentEvaluatedThisTick,
            FireIntentConsumed: _decisionFireIntentConsumedThisTick,
            FireAuthorized: _decisionFireAuthorizedThisTick,
            OutcomeComponents: components,
            EventSequenceFirst: hasEvents ? capture.EventSequence + 1L : 0L,
            EventSequenceLast: hasEvents ? _eventSequence : 0L,
            Terminated: terminated,
            Truncated: truncated,
            TerminationReason: terminationReason);
        // A destruction terminal is not authoritative while the surviving combatant can still be
        // hit by rounds that were already airborne: production keeps advancing those rounds after
        // the first splash, so a delayed mutual kill would otherwise be frozen out of the stream.
        // Buffer the terminal record and let StepPendingTerminalDecision finalize it once the
        // in-flight rounds settle (or the outcome can no longer change).
        bool terminalOutcomeStillOpen = terminated && !actorReplaced
            && actorDestroyed != opponentDestroyed
            && Lifecycle == LifecycleState.Active
            && (actorDestroyed
                ? capture.ActorGun.TargetAlive
                    && capture.ActorGun.RoundsInFlight.Count > 0
                : capture.PlayerGun.TargetAlive
                    && capture.PlayerGun.RoundsInFlight.Count > 0);
        if (terminalOutcomeStillOpen) {
            _decisionPendingTerminal = new PendingTerminalDecision(
                record, capture.Actor, capture.ActorGun, capture.PlayerGun,
                capture.ActorHits, capture.PlayerHits, capture.EventSequence);
        } else {
            _decisionRecorder.Append(record);
        }
        _decisionLastCapturedActorSpawnSequence = capture.ActorSpawnSequence;
        if (previousEpisodeTruncated)
            _decisionPendingTruncatedActorSpawnSequence = 0L;
        if (terminated || truncated)
            _decisionClosedActorSpawnSequence = capture.ActorSpawnSequence;
    }

    void StepPendingTerminalDecision() {
        if (_decisionPendingTerminal is not { } pending) return;
        bool actorReplaced = pending.Record.ActorSpawnSequence != _banditSpawnSequence
            || !ReferenceEquals(pending.Actor, _bandit);
        bool actorDestroyed = pending.Actor.CatastrophicallyDamaged;
        bool opponentDestroyed = _playerTerminalState != AircraftTerminalState.Flying;
        bool outcomeStillOpen = !actorReplaced
            && actorDestroyed != opponentDestroyed
            && Lifecycle == LifecycleState.Active
            && (actorDestroyed
                ? pending.ActorGun.TargetAlive
                    && pending.ActorGun.RoundsInFlight.Count > 0
                : pending.PlayerGun.TargetAlive
                    && pending.PlayerGun.RoundsInFlight.Count > 0);
        if (!outcomeStillOpen) FinalizePendingTerminalDecision();
    }

    void FinalizePendingTerminalDecision() {
        if (_decisionPendingTerminal is not { } pending) return;
        _decisionPendingTerminal = null;
        bool actorDestroyed = pending.Actor.CatastrophicallyDamaged;
        bool opponentDestroyed = _playerTerminalState != AircraftTerminalState.Flying;
        DecisionTerminationReason reason = actorDestroyed && opponentDestroyed
            ? DecisionTerminationReason.MutualDestruction
            : opponentDestroyed
                ? DecisionTerminationReason.OpponentDestroyed
                : DecisionTerminationReason.ActorDestroyed;
        bool hasEvents = _eventSequence > pending.EventSequenceBase;
        _decisionRecorder.Append(pending.Record with {
            OutcomeComponents = pending.Record.OutcomeComponents with {
                HitsScored = pending.ActorGun.HitCount - pending.ActorHitsBaseline,
                HitsReceived = pending.PlayerGun.HitCount - pending.PlayerHitsBaseline,
                OpponentDestroyed = opponentDestroyed,
                OwnshipDestroyed = actorDestroyed
            },
            EventSequenceFirst = hasEvents ? pending.EventSequenceBase + 1L : 0L,
            EventSequenceLast = hasEvents ? _eventSequence : 0L,
            TerminationReason = reason
        });
    }

    void StageBeat(BeatSetup setup) {
        ArgumentNullException.ThrowIfNull(setup);
        // Restaging discards any still-airborne rounds, so a buffered terminal record can no
        // longer change: append it before the terminal states below are reset.
        FinalizePendingTerminalDecision();
        if (_bandit is not null
            && _decisionLastCapturedActorSpawnSequence == _banditSpawnSequence
            && _decisionClosedActorSpawnSequence != _banditSpawnSequence) {
            _decisionRecorder.AppendEpisodeBoundary(
                _playerSpawnSequence,
                _banditSpawnSequence,
                _tick,
                DecisionBoundaryReason.ActorRestaged);
            _decisionPendingTruncatedActorSpawnSequence = _banditSpawnSequence;
            _decisionClosedActorSpawnSequence = _banditSpawnSequence;
        }
        FinishPreviousRecoveryAttempt();
        _beat = setup;
        _carrier = _beat.Carrier;
        _difficulty = DifficultyModel.ForLevel(0);
        _recoveryAttemptActive = false;
        _attemptHadSetback = false;
        _attemptCleanRecorded = false;
        _fuel = CreatePlayerFuel();
        bool maintenanceRecovery = _beat.MaintenanceScenario
            == MaintenanceScenarioKind.F86EmergencyGearRecovery;
        _systems = CreatePlayerSystems(
            onApproach: PlayerSystemsSimulated && _carrier is not null && !maintenanceRecovery,
            prechargeUtilityHydraulics: _prechargeSystemsOnStage && !maintenanceRecovery);
        _maintenanceScenario = maintenanceRecovery
            ? new F86EmergencyGearRecoveryScenario(_systems)
            : null;
        _visualMergeEvaluation = _beat.VisualMergeEvaluation is { } evaluation
            ? new VisualMergeEvaluation(evaluation)
            : null;
        _droneRaidEvaluation = _beat.DroneRaid is { } raid
            ? new DroneRaidEvaluation(raid)
            : null;
        _droneRaidTargetIndex = 0;
        _configurationAutomationEnabled = PlayerSystemsSimulated
            && _carrier is not null && !maintenanceRecovery;
        _configurationTarget = _configurationAutomationEnabled
            ? FlightConfigurationTarget.Recovery : FlightConfigurationTarget.Combat;
        _manualGearConfiguration = false;
        _manualFlapConfiguration = false;
        _configurationWasReady = ConfigurationReady;
        _configurationReadyCueUntilMs = double.NegativeInfinity;
        if (_carrier is not null) {
            _difficulty = _recoveryProgress.PreviewNextAttempt();
            _carrier.ApplyDifficulty(_difficulty);
            double configuredOnSpeedAoa = DetentLayer.OnSpeedAoARad
                - PlayerAerodynamicConfiguration.LiftCoefficientIncrement
                    / Math.Max(_beat.PlayerAir.CLAlpha, 1e-6);
            _carrier.ApproachDirectorPitchOffsetRad = configuredOnSpeedAoa;
            _beat = _beat with {
                Player = _carrier.ToWorldStateFromAir(_beat.Player, configuredOnSpeedAoa)
            };
        }

        _recovery = Carrier.Recovery.Flying;
        _touchdown = Carrier.TouchdownResult.Flying;
        _carrierPass.Reset();
        _arrestment.Reset();
        _catapult.Reset();
        _waveOffArmed = _carrier is not null;
        _waveOffUntilMs = double.NegativeInfinity;
        _burble = _carrier is null ? null : CreateBurble(_carrier, _difficulty,
            _weatherProfile?.Wind);
        _player = CreatePlayer(_beat.Player);
        _bandit = _beat.CreateBandit(_terrainSurface);
        _playerSpawnSequence++;
        _banditSpawnSequence++;
        if (_carrier is not null) _carrierSpawnSequence++;
        _bandit.Wind = _player.Wind;
        _bandit.Atmosphere = _player.AtmosphereModel;
        CombatConfig combat = _beat.CombatRules;
        _gunKill = new GunKill(combat.PlayerAmmo, combat.OpponentHitsToDefeat,
            combat.PlayerGunProfile.EffectiveHitRadiusM, combat.PlayerGunProfile);
        _opponentGun = new GunKill(combat.OpponentAmmo, combat.PlayerHitsToDefeat,
            combat.OpponentGunProfile.EffectiveHitRadiusM, combat.OpponentGunProfile);
        _visualMergeEvaluation?.Step(_player.State, _bandit.State,
            _player.AtmosphereModel, 0.0, _player.AirspeedMps);
        _keys = new KeyGrammar();
        _detents = new DetentLayer {
            Variant = _carrier is not null ? ValleyVariant.PhysicsOnly : _requestedVariant,
            ApproachMode = _carrier is not null,
            AerodynamicConfiguration = PlayerAerodynamicConfiguration,
            AtmosphereModel = _player.AtmosphereModel
        };
        _detents.ConfigureFor(_beat.PlayerAir, _beat.InitialThrottle);
        _pilotPhysiology = new PilotPhysiologyModel(_beat.PlayerPilotPhysiology);
        _autoGcasState = AutoGcasState.Initial(PlayerAutoGcasCapability.Available);
        _autoGcasRecoveryCommand = null;
        _autoGcasPredictionTicksRemaining = 0;
        _autoGcasPredictionEvaluationCount = 0;
        _autoGcasPredictionElapsedSeconds = 0.0;
        _gunneryPitchAssistState = GunneryPitchAssistState.Inactive();
        _assistedFlight = false;
        _assistedSpeedBiasIndex = 0;
        _banditPadlockRollAssistSelected = false;
        _banditPadlockRollAssistTargetSequence = 0;
        _padlockRollAssist.Reset();
        _pilotDelayedCommand = _detents.Command;
        _pilotCommandResponseInitialized = true;
        _pilotControlInterlocked = false;
        _pilotTriggerInterlocked = false;
        _pilotWasIncapacitated = false;
        _pilotRecovering = false;
        _pilotGLocCount = 0;
        _pilotPeakPositiveG = 1.0;
        _pilotPeakNegativeG = 0.0;
        _pilotHeldThrottle = _detents.Command.Throttle;
        // Built-in combat beats are already airborne and running at their staged power. Seed the
        // operating point so Ready telemetry and the first rendered frame do not claim a stopped
        // engine immediately before the first fixed tick snaps it to the same MIL command.
        if (_carrier is null && _beat.PlayerAir.ThrustMaxN > 0.0)
            _player.SeedEnginePowerFraction(_detents.Throttle);
        _prompts = new PromptTracker();
        _advice = new DoctrineAdvice(1.0, 0.0, "setup");
        _cue = PromptCue.None;
        _triggerDown = false;
        _opponentTriggerDown = false;
        _accumulatorSeconds = 0.0;
        _shotsTotal = 0;
        _shotsInWindow = 0;
        _killCount = 0;
        _engagementNumber = 1;
        _outcome = SortieOutcome.None;
        _pendingOutcome = SortieOutcome.None;
        _playerTerminalState = AircraftTerminalState.Flying;
        _opponentTerminalState = AircraftTerminalState.Flying;
        _playerImpactSurface = ImpactSurface.None;
        _opponentImpactSurface = ImpactSurface.None;
        _playerCarrierSolid = Carrier.SolidCollision.None;
        _playerWreckMotion = null;
        _terminalStartedAtMs = double.PositiveInfinity;
        _nextOpponentSpawnAtMs = double.NegativeInfinity;
        _recentEvents.Clear();
        _detachedOpponentWrecks.Clear();
        _incidentReplay.Reset();
        _transitionCue = "";
        _transitionCueUntilMs = double.NegativeInfinity;
        _splashCueUntilMs = double.NegativeInfinity;
        _lastRange = Geometry.Range(_player.State, _bandit.State);
        _closureKts = 0.0;
        _closureSmooth = 0.0;
        // Simulation time is deliberately monotonic across restarts because KeyGrammar timestamps
        // all input in this epoch. Only flight-local state and the accumulator reset.
        Lifecycle = LifecycleState.Ready;
    }

    AircraftSim CreatePlayer(in AircraftState state) {
        var player = new AircraftSim(WithCurrentFuelMass(state), _beat.PlayerAir,
            _weatherProfile?.Atmosphere) {
            Wind = _carrier is not null
                ? _burble
                : _weatherProfile?.Wind
                    ?? new TurbulenceField(intensityMps: 1.2, outerScaleM: 130.0,
                        intermittency: 0.5, seed: 0xB0A7),
            EngineFuelAvailable = _fuel.HasFuel,
            AerodynamicConfiguration = PlayerAerodynamicConfiguration
        };
        return player;
    }

    AirframeSystems CreatePlayerSystems(bool onApproach,
        bool prechargeUtilityHydraulics) => new(
        initialGear: onApproach ? LandingGearHandle.Down : LandingGearHandle.Up,
        initialFlapDegrees: onApproach
            ? AirframeSystemsProfile.F86FResearchBasis.FullFlapDegrees
            : 0.0,
        // Every current beat starts with an already-running airborne jet. Prime the normal system
        // to that steady state instead of flashing a fictitious pump failure during the first
        // numerical time constant. The maintenance beat deliberately starts unpressurised because
        // its utility-pump failure is injected at staging.
        initialUtilityHydraulicPressureFraction: prechargeUtilityHydraulics ? 1.0 : 0.0);

    AircraftState WithCurrentFuelMass(in AircraftState state) {
        double fuelFreeMass = _beat.PlayerAir.FuelFreeMassKg;
        if (fuelFreeMass <= 0.0) return state;
        return state with { Mass = fuelFreeMass + _fuel.FuelLb * 0.45359237 };
    }

    void RefreshPlayerMass() {
        double fuelFreeMass = _beat.PlayerAir.FuelFreeMassKg;
        if (fuelFreeMass > 0.0)
            _player.SetMassKg(fuelFreeMass + _fuel.FuelLb * 0.45359237);
    }

    FuelModel CreatePlayerFuel() {
        FuelConfig loadout = _beat.FuelLoadout;
        return new FuelModel(
            initialFuelLb: loadout.InitialFuelLb,
            capacityLb: loadout.CapacityLb,
            bingoThresholdLb: loadout.BingoThresholdLb,
            consumesFuel: loadout.ConsumesFuel,
            jokerThresholdLb: loadout.JokerThresholdLb,
            minimumFuelThresholdLb: loadout.MinimumFuelThresholdLb,
            emergencyFuelThresholdLb: loadout.EmergencyFuelThresholdLb);
    }

    static BurbleField CreateBurble(Carrier carrier, in RecoveryDifficulty difficulty,
        IWindField? ambient = null) => new(
        carrier,
        new TurbulenceField(intensityMps: difficulty.BurbleIntensityMps,
            outerScaleM: 80.0, intermittency: 0.6, seed: difficulty.TurbulenceSeed),
        ambient,
        sinkMps: difficulty.BurbleSinkMps);

    void ResetFlightControls(bool approachMode, double initialThrottle) {
        _gunneryPitchAssistState = GunneryPitchAssistState.Inactive();
        _detents = new DetentLayer {
            Variant = _carrier is not null ? ValleyVariant.PhysicsOnly : _requestedVariant,
            ApproachMode = approachMode,
            AerodynamicConfiguration = PlayerAerodynamicConfiguration,
            AtmosphereModel = _player.AtmosphereModel
        };
        _detents.ConfigureFor(_beat.PlayerAir, initialThrottle);
        _waveOffArmed = approachMode;
        _waveOffUntilMs = double.NegativeInfinity;
    }

    bool GearAtTarget => _configurationTarget == FlightConfigurationTarget.Recovery
        ? _systems.AllGearDownAndLocked : _systems.AllGearUpAndLocked;

    bool FlapsAtTarget => _configurationTarget == FlightConfigurationTarget.Recovery
        ? Math.Min(_systems.LeftFlapDegrees, _systems.RightFlapDegrees)
            >= _systems.FullFlapDegrees - 0.25
        : Math.Max(_systems.LeftFlapDegrees, _systems.RightFlapDegrees) <= 0.25;

    bool ConfigurationReady => GearAtTarget && FlapsAtTarget;

    /// <summary>
    /// Switch the default configuration task. Manual selections suspend automation only for the
    /// current task; the next recovery/combat transition deliberately restores the useful default.
    /// Internal visibility keeps the state machine directly testable without exposing a second
    /// player-facing control alongside G and the spring-loaded flap selector.
    /// </summary>
    internal void SelectAutomaticConfigurationTarget(FlightConfigurationTarget target) {
        if (!_configurationAutomationEnabled || target == _configurationTarget) return;
        _configurationTarget = target;
        _manualGearConfiguration = false;
        _manualFlapConfiguration = false;
        _configurationReadyCueUntilMs = double.NegativeInfinity;
        _configurationWasReady = ConfigurationReady;
        ApplyAutomaticConfigurationCommands();
    }

    void ApplyAutomaticConfigurationCommands() {
        if (!_configurationAutomationEnabled) return;
        if (!_manualGearConfiguration) {
            _systems.CommandGear(_configurationTarget == FlightConfigurationTarget.Recovery
                ? LandingGearHandle.Down : LandingGearHandle.Up);
        }
        if (!_manualFlapConfiguration) {
            WingFlapLever lever = FlapsAtTarget ? WingFlapLever.Hold
                : _configurationTarget == FlightConfigurationTarget.Recovery
                    ? WingFlapLever.Down : WingFlapLever.Up;
            _systems.SetFlapLever(lever);
        }
    }

    void ObserveAutomaticConfiguration() {
        if (!_configurationAutomationEnabled) return;
        bool ready = ConfigurationReady;
        if (ready && !_configurationWasReady) {
            _configurationReadyCueUntilMs = _simTimeMs + 2500.0;
            if (!_manualFlapConfiguration) _systems.SetFlapLever(WingFlapLever.Hold);
        }
        _configurationWasReady = ready;
    }

    void ClearHeldInput() {
        _keys = new KeyGrammar();
        _detents.ClearAnalogRollControl();
        _gunneryPitchAssistState = GunneryPitchAssistState.Inactive();
        _padlockRollAssist.Reset();
        if (_systems is not null) {
            _systems.SetFlapLever(WingFlapLever.Hold);
            if (_maintenanceScenario is { Started: true, Finished: false })
                _maintenanceScenario.SetEmergencyGearRelease(false, TimeSeconds);
            else
                _systems.SetEmergencyGearRelease(false);
        }
        if (_triggerDown) _visualMergeEvaluation?.ObserveTriggerReleased();
        _triggerDown = false;
        _opponentTriggerDown = false;
        _accumulatorSeconds = 0.0;
    }

    void Trigger(bool down) {
        if (down && !_triggerDown) {
            _shotsTotal++;
            if (CameraSolver.GunWindow(_player.State, _bandit.State)) _shotsInWindow++;
            _visualMergeEvaluation?.ObserveTriggerPressed(_player.State, _bandit.State);
        }
        if (!down) {
            _visualMergeEvaluation?.ObserveTriggerReleased();
            // G-LOC releases the pilot's grip even if the browser key remains electrically held.
            // Re-arming requires an observable release made after useful control has returned.
            if (_pilotPhysiology.State.ControlAuthority01 >= 0.55)
                _pilotTriggerInterlocked = false;
        }
        _triggerDown = down;
    }

    void EmitEvent(SessionEventType type, CombatRole source, CombatRole target,
        int count = 0, SortieOutcome outcome = SortieOutcome.None,
        ImpactSurface surface = ImpactSurface.None,
        AutoGcasState? autoGcas = null,
        long entitySequence = 0,
        AircraftState? kinematics = null) {
        if (_recentEvents.Count == RecentEventCapacity) _recentEvents.RemoveAt(0);
        AircraftState? eventKinematics = kinematics ?? target switch {
            CombatRole.Player => _player.State,
            CombatRole.Opponent => _bandit.State,
            _ => null
        };
        long eventEntitySequence = entitySequence > 0 ? entitySequence : target switch {
            CombatRole.Player => _playerSpawnSequence,
            CombatRole.Opponent => _banditSpawnSequence,
            _ => 0
        };
        var sessionEvent = new SessionEvent(
            ++_eventSequence,
            _tick + 1,
            type,
            source,
            target,
            count,
            outcome,
            surface,
            autoGcas?.Phase,
            autoGcas?.InhibitReason,
            autoGcas?.Cue,
            autoGcas?.ActivationCount ?? 0,
            autoGcas?.ReleaseCount ?? 0,
            autoGcas?.PilotOverrideCount ?? 0,
            eventEntitySequence,
            eventKinematics.HasValue,
            eventKinematics?.Position ?? default,
            eventKinematics?.VelocityVector() ?? default);
        _recentEvents.Add(sessionEvent);

        // The carrier incident recorder receives the event at the authoritative emission boundary,
        // before an impact can hand the aircraft to WreckContactMotion. This preserves exact
        // pre-impulse pose/velocity and keeps replay effects independent of a later live snapshot.
        if (_carrier is not null && target == CombatRole.Player) {
            AircraftState eventState = _player.State;
            _incidentReplay.ObserveEvent(new IncidentReplayEvent(
                sessionEvent,
                TimeSeconds + FixedDeltaSeconds,
                eventState.Position,
                eventState.VelocityVector()));
        }
    }

    bool OpponentWeaponsAuthorized(bool allowNewFire = true) =>
        Lifecycle == LifecycleState.Active
        && allowNewFire
        && !TerminalPhaseActive
        && !WeaponsInhibited
        && _beat.CombatRules.OpponentAmmo > 0
        && _opponentGun.AmmoRemaining > 0
        && _opponentGun.TargetAlive
        && !_bandit.CatastrophicallyDamaged;

    void StepWeapons(in AircraftState playerState, in AircraftState opponentState,
        bool playerTriggerHeld, bool allowNewFire = true) {
        bool weaponsReleased = allowNewFire && !WeaponsInhibited;
        bool playerWeaponsAuthorized = weaponsReleased && PlayerWeaponsAuthorized;
        bool opponentIntentEvaluated = weaponsReleased
            && _beat.CombatRules.OpponentAmmo > 0;
        bool opponentIntent = opponentIntentEvaluated
            && _bandit.WantsToFire(ObservePlayer(playerState));
        _opponentTriggerDown = opponentIntent
            && OpponentWeaponsAuthorized(allowNewFire);
        _decisionFireIntentEvaluatedThisTick = opponentIntentEvaluated;
        _decisionFireIntentConsumedThisTick = opponentIntent;
        _decisionFireAuthorizedThisTick = _opponentTriggerDown;

        // Both weapons receive the same beginning-of-tick world snapshot. Neither combatant gets
        // to observe the other's already-integrated future position or suppress same-tick return
        // fire by resolving its own hit first.
        _gunKill.Step(playerWeaponsAuthorized && playerTriggerHeld,
            playerState, opponentState, FixedDeltaSeconds);
        _opponentGun.Step(_opponentTriggerDown, opponentState, playerState, FixedDeltaSeconds);
        _visualMergeEvaluation?.ObserveProjectileState(
            _gunKill.RoundsFired, _gunKill.HitCount);

        if (_gunKill.HitsThisStep > 0)
            EmitEvent(SessionEventType.Hit, CombatRole.Player, CombatRole.Opponent,
                _gunKill.HitsThisStep);
        if (_opponentGun.HitsThisStep > 0)
            EmitEvent(SessionEventType.Hit, CombatRole.Opponent, CombatRole.Player,
                _opponentGun.HitsThisStep);
    }

    void ObserveCombatDamage() {
        if (_gunKill.Outcome == FightOutcome.Splash
            && _opponentTerminalState == AircraftTerminalState.Flying) {
            if (_droneRaidEvaluation is { Finished: false }) {
                ResolveDroneRaidTarget(neutralized: true,
                    TimeSeconds + FixedDeltaSeconds);
            } else {
                _killCount++;
                BeginCatastrophicDamage(CombatRole.Opponent, CombatRole.Player);
            }
        }
        if (_opponentGun.Outcome == FightOutcome.Splash
            && _playerTerminalState == AircraftTerminalState.Flying) {
            if (_recoveryAttemptActive) _attemptHadSetback = true;
            BeginCatastrophicDamage(CombatRole.Player, CombatRole.Opponent);
        }
        UpdatePendingOutcome();
    }

    void BeginCatastrophicDamage(CombatRole target, CombatRole source) {
        _gunneryPitchAssistState = GunneryPitchAssistState.Inactive();
        _padlockRollAssist.Reset();
        if (target == CombatRole.Player) {
            if (_playerTerminalState != AircraftTerminalState.Flying) return;
            BeginTerminalClock();
            _droneRaidEvaluation?.RecordOwnshipLost(
                TimeSeconds + FixedDeltaSeconds, _gunKill.RoundsFired);
            _playerTerminalState = AircraftTerminalState.DestroyedAirborne;
            _player.EngineCombustionAvailable = false;
            _player.AerodynamicConfiguration = TerminalFlightDynamics.Configuration(
                PlayerAerodynamicConfiguration, handedness: -1);
        } else if (target == CombatRole.Opponent) {
            if (_opponentTerminalState != AircraftTerminalState.Flying) return;
            bool replacementExpected = _beat.ContinuousCombat is not null
                && _playerTerminalState == AircraftTerminalState.Flying;
            BeginTerminalClock(clearHeldInput: !replacementExpected);
            _opponentTerminalState = AircraftTerminalState.DestroyedAirborne;
            _bandit.ApplyCatastrophicDamage(handedness: 1);
            _splashCueUntilMs = _simTimeMs + 3000.0;
            if (replacementExpected) {
                double delaySeconds = _beat.ContinuousCombat!.ReplacementDelaySeconds;
                if (!double.IsFinite(delaySeconds) || delaySeconds < 0.0)
                    throw new InvalidOperationException(
                        "Continuous-combat replacement delay must be finite and non-negative.");
                _nextOpponentSpawnAtMs = _simTimeMs + delaySeconds * 1000.0;
            }
        } else return;
        EmitEvent(SessionEventType.Destroyed, source, target);
    }

    void ObserveDroneRaidTarget(double completedTimeSeconds) {
        DroneRaidEvaluation? evaluation = _droneRaidEvaluation;
        if (evaluation is null || !evaluation.Started || evaluation.Finished) return;

        if (evaluation.HasLeaked(_bandit.State))
            ResolveDroneRaidTarget(neutralized: false, completedTimeSeconds);
        if (Lifecycle != LifecycleState.Active || evaluation.Finished) return;
        evaluation.Step(completedTimeSeconds, _player.State, _bandit.State,
            _gunKill.GunSolution, _gunKill.RoundsFired);
    }

    void ResolveDroneRaidTarget(bool neutralized, double completedTimeSeconds) {
        DroneRaidEvaluation? evaluation = _droneRaidEvaluation;
        DroneRaidScenarioDefinition? definition = _beat.DroneRaid;
        if (evaluation is null || definition is null || evaluation.Finished) return;

        if (neutralized) {
            evaluation.RecordNeutralized(completedTimeSeconds, _gunKill.RoundsFired);
            _killCount++;
            EmitEvent(SessionEventType.Destroyed,
                CombatRole.Player, CombatRole.Opponent);
        } else {
            evaluation.RecordLeaked(completedTimeSeconds, _gunKill.RoundsFired);
            EmitEvent(SessionEventType.RaidTargetLeaked,
                CombatRole.Opponent, CombatRole.None,
                count: _droneRaidTargetIndex + 1);
        }

        if (evaluation.Finished) {
            _outcome = evaluation.ZeroLeakers
                ? SortieOutcome.Victory : SortieOutcome.Defeat;
            _pendingOutcome = _outcome;
            EmitEvent(SessionEventType.SortieFinished,
                CombatRole.None, CombatRole.None, outcome: _outcome);
            ClearHeldInput();
            Lifecycle = LifecycleState.Finished;
            return;
        }

        _droneRaidTargetIndex++;
        AircraftState nextState = definition.Targets[_droneRaidTargetIndex];
        _bandit = new RailBandit(nextState, _beat.BanditAir, _beat.BanditTimeline) {
            Wind = _player.Wind,
            Atmosphere = _player.AtmosphereModel
        };
        _gunKill = neutralized
            ? _gunKill.CreateForStagedNextTarget()
            : _gunKill.CreateForRetargetedTarget();
        _opponentTerminalState = AircraftTerminalState.Flying;
        _opponentImpactSurface = ImpactSurface.None;
        _banditSpawnSequence++;
        _padlockRollAssist.Reset();
        _lastRange = Geometry.Range(_player.State, _bandit.State);
        _closureKts = _closureSmooth = 0.0;
        ShowTransition(evaluation.Cue, 2200.0);
    }

    void BeginTerminalClock(bool clearHeldInput = true) {
        if (double.IsPositiveInfinity(_terminalStartedAtMs)) {
            _terminalStartedAtMs = _simTimeMs;
            if (clearHeldInput) ClearHeldInput();
        }
    }

    ActorObservation ObservePlayer(in AircraftState state) =>
        ActorObservation.Capture(state, Tick);

    void UpdatePendingOutcome() {
        bool playerLost = _playerTerminalState != AircraftTerminalState.Flying;
        bool opponentLost = _opponentTerminalState != AircraftTerminalState.Flying;
        if (!playerLost && OpponentReplacementPending) {
            _pendingOutcome = SortieOutcome.None;
            return;
        }
        _pendingOutcome = playerLost && opponentLost ? SortieOutcome.Draw
            : opponentLost ? SortieOutcome.Victory
            : playerLost ? SortieOutcome.Defeat
            : SortieOutcome.None;
    }

    static ImpactSurface SurfaceFor(Carrier.SolidCollision collision) => collision switch {
        Carrier.SolidCollision.FlightDeck => ImpactSurface.FlightDeck,
        Carrier.SolidCollision.Hull or Carrier.SolidCollision.Island =>
            ImpactSurface.CarrierStructure,
        _ => ImpactSurface.None
    };

    (ImpactSurface surface, Carrier.SolidCollision carrierSolid,
        Vec3D velocity, double height) DetectImpact(
        in AircraftState previous, in AircraftState current) {
        if (_carrier is not null) {
            Carrier.SolidCollision solid = _carrier.SweptSolidCollision(
                previous.Position, current.Position);
            ImpactSurface carrierSurface = SurfaceFor(solid);
            if (carrierSurface != ImpactSurface.None) {
                Vec3D surfaceVelocity = _carrier.DeckVelocityWorld
                    + new Vec3D(0.0, _carrier.DeckVerticalVelocityMps, 0.0);
                double height = current.Position.Y
                    - _carrier.DeckFrame(current.Position).height;
                return (carrierSurface, solid, surfaceVelocity, height);
            }
        }
        var natural = DetectNaturalSurface(current);
        return (natural.surface, Carrier.SolidCollision.None, Vec3D.Zero, natural.height);
    }

    (ImpactSurface surface, double height) DetectNaturalSurface(in AircraftState state) {
        if (_terrainSurface?.TrySample(state.Position.X, state.Position.Z,
            out TerrainSample sample) == true) {
            if (state.Position.Y > sample.HeightM)
                return (ImpactSurface.None, sample.HeightM);
            return (sample.Kind == TerrainSurfaceKind.Water
                ? ImpactSurface.Water : ImpactSurface.Ground, sample.HeightM);
        }
        return state.Position.Y <= 0.0
            ? (ImpactSurface.Water, 0.0) : (ImpactSurface.None, 0.0);
    }

    void RegisterAirborneImpact(CombatRole target, ImpactSurface surface,
        in Vec3D surfaceVelocity, double surfaceHeightM,
        Carrier.SolidCollision carrierSolid = Carrier.SolidCollision.None) {
        AircraftTerminalState state = target == CombatRole.Player
            ? _playerTerminalState : _opponentTerminalState;
        if (state != AircraftTerminalState.DestroyedAirborne) return;
        if (target == CombatRole.Player)
            _playerCarrierSolid = ResolvePlayerCarrierSolid(surface, carrierSolid);
        EmitEvent(SessionEventType.Impact, CombatRole.None, target, surface: surface);
        // Preserve the immutable contact state before WreckContactMotion applies its impulse. The
        // following central end-of-tick observation records the resulting post-impact state.
        if (target == CombatRole.Player && surface is ImpactSurface.FlightDeck
            or ImpactSurface.CarrierStructure)
            CaptureIncidentReplaySample(completedContactTick: true);
        StartWreckContact(target, surface, surfaceVelocity, surfaceHeightM,
            carrierSolid: carrierSolid);
    }

    void RegisterUndamagedCrash(CombatRole target, ImpactSurface surface,
        in Vec3D surfaceVelocity, double surfaceHeightM,
        bool tangentialImpulseAlreadyResolved = false,
        Carrier.SolidCollision carrierSolid = Carrier.SolidCollision.None) {
        AircraftTerminalState state = target == CombatRole.Player
            ? _playerTerminalState : _opponentTerminalState;
        if (state != AircraftTerminalState.Flying) return;
        // For a collision-caused loss, physical contact precedes the damage declaration. Keeping
        // both durable events preserves that causal difference from an airborne gun kill.
        bool replacementExpected = target == CombatRole.Opponent
            && _beat.ContinuousCombat is not null
            && _playerTerminalState == AircraftTerminalState.Flying;
        BeginTerminalClock(clearHeldInput: !replacementExpected);
        if (target == CombatRole.Player)
            _playerCarrierSolid = ResolvePlayerCarrierSolid(surface, carrierSolid);
        EmitEvent(SessionEventType.Impact, CombatRole.None, target, surface: surface);
        if (target == CombatRole.Player && surface is ImpactSurface.FlightDeck
            or ImpactSurface.CarrierStructure)
            CaptureIncidentReplaySample(completedContactTick: true);
        // A maneuvering opponent flown into the surface while the player is alive and engaged is
        // a maneuver kill: the impact stays a physical event (source None), but the destruction is
        // attributed to the player and credited like a gun kill. Only genuine combat opponents
        // qualify — drone-raid targets keep their own leak/neutralize accounting, and a scripted
        // pattern bogey crashing in a non-combat beat credits nobody.
        bool maneuverKill = target == CombatRole.Opponent
            && _playerTerminalState == AircraftTerminalState.Flying
            && _droneRaidEvaluation is null
            && (_beat.ContinuousCombat is not null
                || _beat.UsesReactiveBandit || _beat.UsesNeutralMergeBandit);
        if (maneuverKill) _killCount++;
        BeginCatastrophicDamage(target,
            maneuverKill ? CombatRole.Player : CombatRole.None);
        StartWreckContact(target, surface, surfaceVelocity, surfaceHeightM,
            tangentialImpulseAlreadyResolved, carrierSolid);
        UpdatePendingOutcome();
    }

    Carrier.SolidCollision ResolvePlayerCarrierSolid(ImpactSurface surface,
        Carrier.SolidCollision detected) {
        if (detected != Carrier.SolidCollision.None) return detected;
        if (surface == ImpactSurface.FlightDeck)
            return Carrier.SolidCollision.FlightDeck;
        if (surface != ImpactSurface.CarrierStructure || _carrier is null)
            return Carrier.SolidCollision.None;
        Carrier.SolidCollision point = _carrier.SweptSolidCollision(
            _player.State.Position, _player.State.Position);
        return point is Carrier.SolidCollision.Hull or Carrier.SolidCollision.Island
            ? point : Carrier.SolidCollision.None;
    }

    void StartWreckContact(CombatRole target, ImpactSurface surface,
        in Vec3D surfaceVelocity, double surfaceHeightM,
        bool tangentialImpulseAlreadyResolved = false,
        Carrier.SolidCollision carrierSolid = Carrier.SolidCollision.None) {
        Carrier? contactCarrier = surface is ImpactSurface.FlightDeck
            or ImpactSurface.CarrierStructure ? _carrier : null;
        if (target == CombatRole.Player) {
            if (_maintenanceScenario is { Finished: false }) {
                _attemptHadSetback = true;
                _maintenanceScenario.RecordAircraftLost(TimeSeconds);
            }
            _playerTerminalState = AircraftTerminalState.Impacted;
            _playerImpactSurface = surface;
            _playerWreckMotion = new WreckContactMotion(_player.State, surface,
                surfaceVelocity, surfaceHeightM, contactCarrier,
                tangentialImpulseAlreadyResolved,
                ResolvePlayerCarrierSolid(surface, carrierSolid));
            _playerCarrierSolid = _playerWreckMotion.CarrierSolid;
            _player.AdoptExternalKinematics(_playerWreckMotion.State);
        } else {
            _opponentTerminalState = AircraftTerminalState.Impacted;
            _opponentImpactSurface = surface;
            _bandit.ApplySurfaceImpact(surface, surfaceVelocity, surfaceHeightM, contactCarrier);
        }
    }

    void ObserveSettledWrecks() {
        if (_playerTerminalState == AircraftTerminalState.Impacted
            && _playerWreckMotion is { SurfaceChangedThisStep: true } playerWreck) {
            _playerImpactSurface = playerWreck.Surface;
            _playerCarrierSolid = playerWreck.CarrierSolid;
            EmitEvent(SessionEventType.Impact, CombatRole.None, CombatRole.Player,
                surface: playerWreck.Surface);
        }
        if (_opponentTerminalState == AircraftTerminalState.Impacted
            && _bandit.WreckSurfaceChangedThisStep) {
            _opponentImpactSurface = _bandit.WreckSurface;
            EmitEvent(SessionEventType.Impact, CombatRole.None, CombatRole.Opponent,
                surface: _bandit.WreckSurface);
        }
        if (_playerTerminalState == AircraftTerminalState.Impacted
            && _playerWreckMotion is { Settled: true }) {
            _playerTerminalState = AircraftTerminalState.Settled;
            EmitEvent(SessionEventType.Settled, CombatRole.None, CombatRole.Player,
                surface: _playerImpactSurface);
        }
        if (_opponentTerminalState == AircraftTerminalState.Impacted
            && _bandit.WreckSettled) {
            _opponentTerminalState = AircraftTerminalState.Settled;
            EmitEvent(SessionEventType.Settled, CombatRole.None, CombatRole.Opponent,
                surface: _opponentImpactSurface);
        }
    }

    void StepDetachedOpponentWrecks() {
        foreach (DetachedOpponentWreck wreck in _detachedOpponentWrecks) {
            if (wreck.TerminalState is AircraftTerminalState.Settled
                or AircraftTerminalState.SimulationBounded)
                continue;

            AircraftState previous = wreck.Actor.State;
            wreck.Actor.Step(ObservePlayer(_player.State), FixedDeltaSeconds);
            AircraftState current = wreck.Actor.State;
            if (wreck.TerminalState == AircraftTerminalState.DestroyedAirborne) {
                var contact = DetectImpact(previous, current);
                if (contact.surface != ImpactSurface.None) {
                    EmitEvent(SessionEventType.Impact,
                        CombatRole.None, CombatRole.Opponent,
                        surface: contact.surface,
                        entitySequence: wreck.SpawnSequence,
                        kinematics: current);
                    Carrier? contactCarrier = contact.surface is ImpactSurface.FlightDeck
                        or ImpactSurface.CarrierStructure ? _carrier : null;
                    wreck.Actor.ApplySurfaceImpact(contact.surface,
                        contact.velocity, contact.height, contactCarrier);
                    wreck.TerminalState = AircraftTerminalState.Impacted;
                    wreck.ImpactSurface = contact.surface;
                }
            }
            if (wreck.TerminalState == AircraftTerminalState.Impacted
                && wreck.Actor.WreckSurfaceChangedThisStep) {
                wreck.ImpactSurface = wreck.Actor.WreckSurface;
                EmitEvent(SessionEventType.Impact,
                    CombatRole.None, CombatRole.Opponent,
                    surface: wreck.ImpactSurface,
                    entitySequence: wreck.SpawnSequence,
                    kinematics: wreck.Actor.State);
            }
            if (wreck.TerminalState == AircraftTerminalState.Impacted
                && wreck.Actor.WreckSettled) {
                wreck.TerminalState = AircraftTerminalState.Settled;
                EmitEvent(SessionEventType.Settled,
                    CombatRole.None, CombatRole.Opponent,
                    surface: wreck.ImpactSurface,
                    entitySequence: wreck.SpawnSequence,
                    kinematics: wreck.Actor.State);
            }
        }
    }

    bool DetachedOpponentWrecksResolved => _detachedOpponentWrecks.All(
        static wreck => wreck.TerminalState is AircraftTerminalState.Settled
            or AircraftTerminalState.SimulationBounded);

    bool FinishTerminalIfResolved(double completedTimeMs) {
        if (OpponentReplacementPending) {
            TrySpawnContinuousOpponent(completedTimeMs);
            return false;
        }
        if (!TerminalPhaseActive) return false;
        bool playerResolved = _playerTerminalState is AircraftTerminalState.Flying
            or AircraftTerminalState.Settled
            or AircraftTerminalState.SimulationBounded;
        bool opponentResolved = _opponentTerminalState is AircraftTerminalState.Flying
            or AircraftTerminalState.Settled
            or AircraftTerminalState.SimulationBounded;
        if (!playerResolved || !opponentResolved || !DetachedOpponentWrecksResolved) {
            if (completedTimeMs - _terminalStartedAtMs
                < TerminalSimulationLimitSeconds * 1000.0) return false;
            ForceTerminalLimit(CombatRole.Player);
            ForceTerminalLimit(CombatRole.Opponent);
            ForceDetachedOpponentTerminalLimits();
        }

        // A gun result must not tear a surviving ownship out of a physical deck phase. Finish the
        // already-engaged wire/catapult sequence first; otherwise a target which settles quickly can
        // freeze a valid trap halfway through its runout. The terminal limit remains the hard bound.
        bool ownshipConstrainedToCarrier = _playerTerminalState == AircraftTerminalState.Flying
            && (_arrestment.Phase == ArrestmentModel.ArrestmentPhase.Arrested
                || _catapult.IsActive);
        if (ownshipConstrainedToCarrier
            && completedTimeMs - _terminalStartedAtMs
                < TerminalSimulationLimitSeconds * 1000.0)
            return false;

        UpdatePendingOutcome();
        _outcome = _pendingOutcome;
        EmitEvent(SessionEventType.SortieFinished,
            CombatRole.None, CombatRole.None, outcome: _outcome);
        FinishPreviousRecoveryAttempt();
        ClearHeldInput();
        Lifecycle = LifecycleState.Finished;
        return true;
    }

    bool TrySpawnContinuousOpponent(double completedTimeMs) {
        if (!OpponentReplacementPending || completedTimeMs < _nextOpponentSpawnAtMs)
            return false;

        int nextEngagement = _engagementNumber + 1;
        _detachedOpponentWrecks.Add(new DetachedOpponentWreck(
            _bandit, _banditSpawnSequence,
            _opponentTerminalState, _opponentImpactSurface));
        while (_detachedOpponentWrecks.Count > 8) {
            int settledIndex = _detachedOpponentWrecks.FindIndex(
                static wreck => wreck.TerminalState is AircraftTerminalState.Settled
                    or AircraftTerminalState.SimulationBounded);
            if (settledIndex < 0) break;
            _detachedOpponentWrecks.RemoveAt(settledIndex);
        }
        _bandit = _beat.CreateNextBandit(_player.State, nextEngagement, _terrainSurface);
        _bandit.Wind = _player.Wind;
        _bandit.Atmosphere = _player.AtmosphereModel;
        _gunKill = _gunKill.Outcome == FightOutcome.Splash
            ? _gunKill.CreateForStagedNextTarget()
            : _gunKill.CreateForRetargetedTarget();
        CombatConfig combat = _beat.CombatRules;
        _opponentGun = _opponentGun.CreateForFreshShooterAgainstSameTarget(
            combat.OpponentAmmo,
            combat.OpponentGunProfile.EffectiveHitRadiusM,
            combat.OpponentGunProfile);
        _visualMergeEvaluation = _beat.VisualMergeEvaluation is { } evaluation
            ? new VisualMergeEvaluation(evaluation)
            : null;
        _visualMergeEvaluation?.Step(_player.State, _bandit.State,
            _player.AtmosphereModel, 0.0, _player.AirspeedMps);
        if (_triggerDown)
            _visualMergeEvaluation?.ObserveTriggerPressed(_player.State, _bandit.State);

        _opponentTerminalState = AircraftTerminalState.Flying;
        _opponentImpactSurface = ImpactSurface.None;
        _opponentTriggerDown = false;
        _pendingOutcome = SortieOutcome.None;
        _terminalStartedAtMs = double.PositiveInfinity;
        _nextOpponentSpawnAtMs = double.NegativeInfinity;
        _splashCueUntilMs = double.NegativeInfinity;
        _engagementNumber = nextEngagement;
        _banditSpawnSequence++;
        _padlockRollAssist.Reset();
        _lastRange = Geometry.Range(_player.State, _bandit.State);
        _closureKts = _closureSmooth = 0.0;
        _gunneryPitchAssistState = GunneryPitchAssistState.Inactive();
        EmitEvent(SessionEventType.OpponentSpawned,
            CombatRole.None, CombatRole.Opponent, count: nextEngagement);
        ShowTransition($"BANDIT {nextEngagement} INBOUND · V PADLOCK", 2600.0);
        return true;
    }

    void ForceDetachedOpponentTerminalLimits() {
        foreach (DetachedOpponentWreck wreck in _detachedOpponentWrecks) {
            if (wreck.TerminalState is AircraftTerminalState.Settled
                or AircraftTerminalState.SimulationBounded)
                continue;
            wreck.TerminalState = AircraftTerminalState.SimulationBounded;
            if (wreck.ImpactSurface == ImpactSurface.None)
                wreck.ImpactSurface = ImpactSurface.SimulationBoundary;
            EmitEvent(SessionEventType.TerminalLimitReached,
                CombatRole.None, CombatRole.Opponent,
                surface: ImpactSurface.SimulationBoundary,
                entitySequence: wreck.SpawnSequence,
                kinematics: wreck.Actor.State);
        }
    }

    void ForceTerminalLimit(CombatRole target) {
        AircraftTerminalState state = target == CombatRole.Player
            ? _playerTerminalState : _opponentTerminalState;
        if (state is AircraftTerminalState.Flying or AircraftTerminalState.Settled
            or AircraftTerminalState.SimulationBounded) return;
        EmitEvent(SessionEventType.TerminalLimitReached, CombatRole.None, target,
            surface: ImpactSurface.SimulationBoundary);
        if (target == CombatRole.Player) {
            _playerTerminalState = AircraftTerminalState.SimulationBounded;
            if (_playerImpactSurface == ImpactSurface.None)
                _playerImpactSurface = ImpactSurface.SimulationBoundary;
        } else {
            _opponentTerminalState = AircraftTerminalState.SimulationBounded;
            if (_opponentImpactSurface == ImpactSurface.None)
                _opponentImpactSurface = ImpactSurface.SimulationBoundary;
        }
    }

    void FinishPreviousRecoveryAttempt() {
        if (!_recoveryAttemptActive) return;
        if (!_attemptCleanRecorded && _attemptHadSetback)
            _recoveryProgress.RecordSetback();
        _recoveryAttemptActive = false;
    }

    void RecordStoppedTrap() {
        if (!_recoveryAttemptActive || _attemptCleanRecorded) return;
        // A bolter or wave-off and the eventual trap are one continuous pass until the aircraft is
        // relaunched/restaged. A later stopped wire cannot retroactively turn that pass into clean
        // mastery; FinishPreviousRecoveryAttempt records the already-earned setback instead.
        if (_attemptHadSetback) return;
        _attemptCleanRecorded = true;
        _recoveryProgress.RecordRecoveredTrap(_touchdown.Grade);
    }

    void ShowTransition(string cue, double milliseconds = 2200.0) {
        _transitionCue = cue;
        _transitionCueUntilMs = _simTimeMs + milliseconds;
    }

    string StoppedTrapTeachingCue() {
        int wire = _touchdown.Wire > 0 ? _touchdown.Wire : _arrestment.CaughtWire;
        string grade = _touchdown.Grade switch {
            Carrier.TouchdownGrade.Ok => "OK",
            Carrier.TouchdownGrade.Fair => "FAIR",
            Carrier.TouchdownGrade.NoGrade => "NO GRADE",
            Carrier.TouchdownGrade.Cut => "CUT",
            _ => "UNASSESSED"
        };
        string cue = $"TRAPPED · W{wire} · {grade}";
        if (_touchdown.Grade != Carrier.TouchdownGrade.NoGrade) return cue;
        string correction = _touchdown.PrimaryCorrection switch {
            Carrier.TouchdownCorrection.WaveOffEarlier => "WAVE OFF EARLIER",
            Carrier.TouchdownCorrection.AddPowerEarlier => "ADD POWER EARLIER",
            Carrier.TouchdownCorrection.StabilizeIas => "STABILISE IAS",
            Carrier.TouchdownCorrection.EstablishLineupEarlier => "ESTABLISH LINEUP EARLIER",
            Carrier.TouchdownCorrection.FlyOnSpeedAoa => "FLY ON-SPEED AOA",
            Carrier.TouchdownCorrection.FlyThroughNoFlare => "FLY THROUGH · NO FLARE",
            Carrier.TouchdownCorrection.MeetAdaptiveTarget => "MEET TRAINING TARGET",
            _ => "REVIEW TOUCHDOWN ASSESSMENT"
        };
        return $"{cue} — {correction}";
    }

    void BeginRelaunch() {
        if (_carrier is null || _catapult.IsActive) return;
        RecordStoppedTrap();
        FinishPreviousRecoveryAttempt();
        _catapult.Begin(_carrier, _player.State.Mass);
        _detents.ApproachMode = false;
        _triggerDown = false;
        ShowTransition(StoppedTrapTeachingCue(), 4000.0);
    }

    void FinishRecoveredMaintenanceSortie() {
        if (_maintenanceScenario is null || _maintenanceScenario.Finished) return;

        RecordStoppedTrap();
        _maintenanceScenario.RecordRecovered(TimeSeconds);
        _outcome = _maintenanceScenario.ProcedurallyComplete
            ? SortieOutcome.Victory
            : SortieOutcome.Draw;
        EmitEvent(SessionEventType.SortieFinished,
            CombatRole.None, CombatRole.None, outcome: _outcome);
        FinishPreviousRecoveryAttempt();
        ClearHeldInput();
        Lifecycle = LifecycleState.Finished;
    }

    void FinishCarrierQualificationSortie(bool recovered) {
        if (!_beat.RecoveryCompletesSortie || Lifecycle != LifecycleState.Active) return;
        if (recovered) RecordStoppedTrap();
        _outcome = recovered ? SortieOutcome.Victory : SortieOutcome.Draw;
        _pendingOutcome = _outcome;
        EmitEvent(SessionEventType.SortieFinished,
            CombatRole.None, CombatRole.None, outcome: _outcome);
        FinishPreviousRecoveryAttempt();
        ClearHeldInput();
        Lifecycle = LifecycleState.Finished;
    }

    void CompleteRelaunch() {
        AircraftState launchState = _catapult.State;
        double retainedEnginePower = _player.ThrustFraction;
        if (_carrier is not null) {
            // A completed deck cycle starts the next recovery attempt. Select its deterministic
            // conditions now, between passes, and give every aircraft the same new wind field.
            _difficulty = _recoveryProgress.BeginAttempt();
            _carrier.ApplyDifficulty(_difficulty);
            _burble = CreateBurble(_carrier, _difficulty, _weatherProfile?.Wind);
        }
        _player = CreatePlayer(launchState);
        _player.SeedEnginePowerFraction(retainedEnginePower);
        _bandit.Wind = _player.Wind;
        _catapult.Reset();
        _arrestment.Reset();
        _recovery = Carrier.Recovery.Flying;
        _touchdown = Carrier.TouchdownResult.Flying;
        _carrierPass.Reset();
        ResetFlightControls(approachMode: false, initialThrottle: retainedEnginePower);
        SelectAutomaticConfigurationTarget(FlightConfigurationTarget.Combat);
        _recoveryAttemptActive = _carrier is not null;
        _attemptHadSetback = false;
        _attemptCleanRecorded = false;
        _lastRange = Geometry.Range(_player.State, _bandit.State);
        _closureKts = _closureSmooth = 0.0;
        ShowTransition("AIRBORNE · NEXT PASS", 1400.0);
    }

    void PreparePlayerForPoweredTick() {
        RefreshPlayerMass();
        _player.EngineFuelAvailable = _fuel.HasFuel;
        _player.AerodynamicConfiguration = PlayerAerodynamicConfiguration;
    }

    PilotOperationalState ResolvePilotOperationalState() {
        PilotPhysiologyState state = _pilotPhysiology.State;
        if (state.ControlImpairment == PilotControlImpairment.Incapacitated)
            return PilotOperationalState.GLoc;
        if (state.VisualImpairment == PilotVisualImpairment.Redout)
            return PilotOperationalState.Redout;
        if (state.VisualImpairment == PilotVisualImpairment.Blackout)
            return PilotOperationalState.Blackout;
        if (state.VisualImpairment is PilotVisualImpairment.Greyout
            or PilotVisualImpairment.TunnelVision
            or PilotVisualImpairment.PeripheralLoss)
            return PilotOperationalState.Grayout;
        if (_pilotRecovering) return PilotOperationalState.Recovering;
        if (state.ControlImpairment is PilotControlImpairment.Strained
            or PilotControlImpairment.Degraded)
            return PilotOperationalState.Straining;
        return PilotOperationalState.Normal;
    }

    bool PilotControlsReleased() =>
        _keys.PhaseAt(GKey.PullUp, _simTimeMs) == KeyPhase.Idle
        && _keys.PhaseAt(GKey.PushDown, _simTimeMs) == KeyPhase.Idle
        && _keys.PhaseAt(GKey.RollLeft, _simTimeMs) == KeyPhase.Idle
        && _keys.PhaseAt(GKey.RollRight, _simTimeMs) == KeyPhase.Idle
        && _keys.PhaseAt(GKey.RudderLeft, _simTimeMs) == KeyPhase.Idle
        && _keys.PhaseAt(GKey.RudderRight, _simTimeMs) == KeyPhase.Idle
        && _keys.PhaseAt(GKey.ThrottleUp, _simTimeMs) == KeyPhase.Idle
        && _keys.PhaseAt(GKey.ThrottleDown, _simTimeMs) == KeyPhase.Idle
        && _keys.PhaseAt(GKey.Override, _simTimeMs) == KeyPhase.Idle
        && _keys.PhaseAt(GKey.AutoGcasOverride, _simTimeMs) == KeyPhase.Idle
        && System.Math.Abs(_detents.Command.RollControl) <= 1e-9;

    PilotCommand NeutralPilotCommand(double throttle) => new(
        GDemand: 1.0,
        BankTarget: _player.State.Bank,
        Throttle: throttle,
        Rudder: 0.0,
        CommandedPitchRad: double.NaN,
        EnvelopeOverride: false,
        RollControl: 0.0,
        CommandedAlphaRad: double.NaN,
        SasRollControl: 0.0,
        DirectLateralControl: true);

    static double BlendAngle(double from, double to, double amount) => from
        + Math.IEEERemainder(to - from, 2.0 * Math.PI) * amount;

    double BlendOptionalAngle(double from, double to, double amount,
        double physicalFallback) {
        if (!double.IsFinite(to)) return double.NaN;
        double start = double.IsFinite(from) ? from : physicalFallback;
        return BlendAngle(start, to, amount);
    }

    PilotCommand BlendPilotCommand(in PilotCommand from, in PilotCommand to,
        double amount) => new(
        GDemand: from.GDemand + (to.GDemand - from.GDemand) * amount,
        BankTarget: BlendAngle(from.BankTarget, to.BankTarget, amount),
        Throttle: from.Throttle + (to.Throttle - from.Throttle) * amount,
        Rudder: from.Rudder + (to.Rudder - from.Rudder) * amount,
        CommandedPitchRad: BlendOptionalAngle(from.CommandedPitchRad,
            to.CommandedPitchRad, amount, _player.BodyPitchRad),
        EnvelopeOverride: to.EnvelopeOverride,
        RollControl: from.RollControl + (to.RollControl - from.RollControl) * amount,
        CommandedAlphaRad: BlendOptionalAngle(from.CommandedAlphaRad,
            to.CommandedAlphaRad, amount, _player.AngleOfAttackRad),
        SasRollControl: from.SasRollControl
            + (to.SasRollControl - from.SasRollControl) * amount,
        DirectLateralControl: to.DirectLateralControl);

    /// Translate the previous tick's authoritative physiology into actuator-path truth. Normal
    /// physiology is bit-for-bit transparent. As cerebral reserve falls, response latency grows
    /// and available control shrinks around the hands-off 1-G/zero-aileron state. G-LOC releases
    /// the controls entirely and requires a real neutral input boundary before control can return.
    PilotCommand ApplyPilotPhysiology(in PilotCommand requested) {
        PilotPhysiologyState state = _pilotPhysiology.State;
        if (state.ControlImpairment == PilotControlImpairment.Incapacitated) {
            _pilotControlInterlocked = true;
            _pilotTriggerInterlocked = true;
        }
        PilotCommand constrainedRequested = requested;
        if (_pilotControlInterlocked) {
            // Losing consciousness leaves the physical throttle lever where it was. Detent input
            // remains observable for release interlocking, but cannot move the lever during G-LOC.
            _detents.HoldThrottle(_beat.PlayerAir, _pilotHeldThrottle);
            constrainedRequested = constrainedRequested with {
                Throttle = _pilotHeldThrottle
            };
            PilotCommand neutral = NeutralPilotCommand(_pilotHeldThrottle);
            _pilotDelayedCommand = neutral;
            _pilotCommandResponseInitialized = true;
            if (state.ControlAuthority01 >= 0.55 && PilotControlsReleased())
                _pilotControlInterlocked = false;
            else
                return neutral;
        }

        if (!_pilotCommandResponseInitialized) {
            _pilotDelayedCommand = requested;
            _pilotCommandResponseInitialized = true;
        }
        double delay = state.AdditionalControlDelaySeconds;
        double response = delay <= 1e-6
            ? 1.0 : 1.0 - Math.Exp(-FixedDeltaSeconds / delay);
        _pilotDelayedCommand = BlendPilotCommand(
            _pilotDelayedCommand, constrainedRequested, response);

        double authority = Math.Clamp(state.ControlAuthority01, 0.0, 1.0);
        if (authority >= 0.999999) return _pilotDelayedCommand;
        return new PilotCommand(
            GDemand: 1.0 + (_pilotDelayedCommand.GDemand - 1.0) * authority,
            BankTarget: BlendAngle(_player.State.Bank,
                _pilotDelayedCommand.BankTarget, authority),
            Throttle: _pilotDelayedCommand.Throttle,
            Rudder: _pilotDelayedCommand.Rudder * authority,
            CommandedPitchRad: double.IsFinite(_pilotDelayedCommand.CommandedPitchRad)
                ? BlendAngle(_player.BodyPitchRad,
                    _pilotDelayedCommand.CommandedPitchRad, authority)
                : double.NaN,
            EnvelopeOverride: _pilotDelayedCommand.EnvelopeOverride && authority >= 0.65,
            RollControl: _pilotDelayedCommand.RollControl * authority,
            CommandedAlphaRad: double.IsFinite(_pilotDelayedCommand.CommandedAlphaRad)
                ? BlendAngle(_player.AngleOfAttackRad,
                    _pilotDelayedCommand.CommandedAlphaRad, authority)
                : double.NaN,
            SasRollControl: _pilotDelayedCommand.SasRollControl * authority,
            DirectLateralControl: _pilotDelayedCommand.DirectLateralControl);
    }

    /// <summary>
    /// Apply the aircraft-owned recovery after the effective human control path. The predictor
    /// therefore sees delayed/degraded/released controls during physiological impairment, but it
    /// never receives consciousness as a trigger: only a predicted buffered terrain violation can
    /// command a fly-up. Actual recovery acceleration is integrated by AircraftSim and fed back to
    /// PilotPhysiology on the same tick, so Auto-GCAS does not magically end a blackout.
    /// </summary>
    PilotCommand ApplyAutoGcas(in PilotCommand effectivePilotCommand) {
        AutoGcasCapabilityProfile capability = PlayerAutoGcasCapability;
        _autoGcasPredictionElapsedSeconds += FixedDeltaSeconds;
        bool immediatePaddle = _autoGcasState.Active && AutoGcasOverrideHeld;
        if (_autoGcasPredictionTicksRemaining > 0 && !immediatePaddle) {
            _autoGcasPredictionTicksRemaining--;
            if (_autoGcasState.Active) {
                _gunneryPitchAssistState = GunneryPitchAssistState.Inactive(
                    effectivePilotCommand.GDemand);
            }
            if (_autoGcasState.Warning || _autoGcasState.Active)
                _padlockRollAssist.Reset();
            return _autoGcasRecoveryCommand is { } heldRecovery
                ? heldRecovery with { Throttle = effectivePilotCommand.Throttle }
                : effectivePilotCommand;
        }

        AutoGcasState previous = _autoGcasState;
        // "Actively flying" means the pilot is conscious with control authority AND the HUMAN is
        // currently commanding the aircraft. This must read the raw detent-layer command, never
        // the effective command: gunnery pitch assist adds up to 3.5 G and lateral authority of
        // its own, so a hands-off pilot fixated near a target would otherwise be classified as
        // attentive and lose the conservative backstop — the exact state Auto-GCAS exists for.
        PilotCommand humanCommand = _detents.Command;
        bool pilotActivelyFlying = _pilotPhysiology.State.ControlAuthority01 >= 0.55
            && (humanCommand.EnvelopeOverride
                || System.Math.Abs(humanCommand.RollControl) > 0.05
                || System.Math.Abs(humanCommand.Rudder) > 0.05
                || humanCommand.GDemand >= 2.0
                || humanCommand.GDemand <= 0.0);
        var result = AutoGcasController.Step(_autoGcasPredictionElapsedSeconds, _autoGcasState,
            new AutoGcasInput(
                Aircraft: _player.State,
                AircraftParameters: _beat.PlayerAir,
                EffectivePilotCommand: effectivePilotCommand,
                Terrain: _terrainSurface,
                FallbackSurfaceElevationM: null,
                Enabled: true,
                ConfigurationPermitsRecovery: _carrier is null,
                PilotOverrideHeld: AutoGcasOverrideHeld,
                IndicatedAirspeedMps: _player.IndicatedAirspeedMps,
                PilotActivelyFlying: pilotActivelyFlying),
            capability);
        _autoGcasPredictionElapsedSeconds = 0.0;
        _autoGcasPredictionTicksRemaining = AutoGcasPredictionIntervalTicks - 1;
        _autoGcasPredictionEvaluationCount++;
        bool evidenceChanged = result.State.Phase != previous.Phase
            || result.State.InhibitReason != previous.InhibitReason
            || result.State.Cue != previous.Cue
            || result.State.ActivationCount != previous.ActivationCount
            || result.State.ReleaseCount != previous.ReleaseCount
            || result.State.PilotOverrideCount != previous.PilotOverrideCount;
        if (evidenceChanged) {
            EmitEvent(SessionEventType.AutoGcasTransition,
                CombatRole.None, CombatRole.Player,
                count: result.State.ActivationCount,
                autoGcas: result.State);
        }
        _autoGcasState = result.State;
        _autoGcasRecoveryCommand = result.RecoveryCommand;
        if (_autoGcasState.Active)
            _gunneryPitchAssistState = GunneryPitchAssistState.Inactive(
                effectivePilotCommand.GDemand);
        if (_autoGcasState.Warning || _autoGcasState.Active)
            _padlockRollAssist.Reset();
        return _autoGcasRecoveryCommand is { } recovery
            ? recovery with { Throttle = effectivePilotCommand.Throttle }
            : effectivePilotCommand;
    }

    /// <summary>
    /// Add a bounded two-axis (pitch load-factor plus lateral roll/rudder) convergence request before
    /// human physiology and aircraft-owned Auto-GCAS. The lead sample is the previous 120 Hz weapon
    /// evaluation; using that one-tick-old authoritative result avoids advancing projectiles twice or
    /// inventing a second ballistic law.
    /// </summary>
    // Touch devices cannot fly precision gunnery with tilt input; the assist widens for them.
    bool _touchControlModality;
    public void SetTouchControlModality(bool touch) => _touchControlModality = touch;

    PilotCommand ApplyGunneryPitchAssist(in PilotCommand requestedPilotCommand) {
        bool enabled = PlayerWeaponsAuthorized
            && _beat.CombatRules.PlayerAmmo > 0
            && _playerTerminalState == AircraftTerminalState.Flying
            && _opponentTerminalState == AircraftTerminalState.Flying
            && _gunKill.TargetAlive
            && !_detents.ApproachMode
            && !_detents.HighAlphaRecoveryActive
            && !_pilotControlInterlocked;
        bool padlockOwnsRollPlane = _banditPadlockRollAssistSelected
            && _banditPadlockRollAssistTargetSequence == _banditSpawnSequence;
        // A wider capture cone and one extra protected G on touch: tilt input cannot hold the
        // funnel the way arrow keys can. Ballistics stay untouched — the assist magnetises the
        // nose, the rounds still have to fly there.
        AircraftParams assistAir = _touchControlModality
            ? _beat.PlayerAir with {
                GunneryPitchAssistCaptureAngleRad =
                    _beat.PlayerAir.GunneryPitchAssistCaptureAngleRad * 1.35,
                GunneryPitchAssistMaxCorrectionG =
                    _beat.PlayerAir.GunneryPitchAssistMaxCorrectionG + 1.0,
                GunneryLateralAssistRollGain =
                    _beat.PlayerAir.GunneryLateralAssistRollGain * 1.25,
            }
            : _beat.PlayerAir;
        GunneryPitchAssistResult result = GunsOnly.Sim.GunneryPitchAssist.Apply(
            requestedPilotCommand,
            _player.State,
            assistAir,
            _player.AirspeedMps,
            _player.AtmosphereModel,
            _gunKill.LeadDirection,
            _gunKill.HasLeadSolution,
            Geometry.Range(_player.State, _bandit.State),
            enabled,
            lateralRollEnabled: !padlockOwnsRollPlane);
        _gunneryPitchAssistState = result.State;
        return result.Command;
    }

    /// <summary>
    /// Refresh the detent layer from authoritative live geometry and air data. The corner target is
    /// the exact altitude/configuration-aware CAS computation published by SnapshotProjection.
    /// </summary>
    void ConfigureAssistedFlightDetents() {
        _detents.AssistedFlight = _assistedFlight && !_detents.ApproachMode;
        if (!_detents.AssistedFlight) {
            _detents.AssistedCalibratedAirspeedMps = double.NaN;
            _detents.AssistedTargetCalibratedAirspeedMps = double.NaN;
            _detents.AssistedTargetWithinNoseCone = false;
            return;
        }
        _detents.AssistedCalibratedAirspeedMps = _player.IndicatedAirspeedMps;
        double cornerKias = AirData.PositiveCornerSpeedKiasAtAltitude(
            _player.State.Mass, _beat.PlayerAir, _player.State.Position.Y,
            PlayerAerodynamicConfiguration.LiftCoefficientIncrement,
            _player.AtmosphereModel);
        _detents.AssistedTargetCalibratedAirspeedMps =
            (cornerKias + AssistedSpeedBiasKts) / AirData.MpsToKnots;

        Vec3D toTarget = _bandit.State.Position - _player.State.Position;
        double rangeSquared = toTarget.Dot(toTarget);
        _detents.AssistedTargetWithinNoseCone = _opponentTerminalState
                == AircraftTerminalState.Flying
            && _gunKill.TargetAlive
            && rangeSquared > 1e-12
            && _player.BodyForward.Dot(toTarget * (1.0 / Math.Sqrt(rangeSquared))) >= 0.5;
    }

    /// <summary>
    /// Add the aircraft-owned padlock plane trim after the effective human-control path. Raw pilot
    /// roll remains the immediate override signal; the small correction occupies only the explicit
    /// SAS channel, and Auto-GCAS still runs afterward with unconditional safety priority.
    /// </summary>
    PilotCommand ApplyBanditPadlockRollAssist(
        in PilotCommand effectiveCommand,
        double rawPilotRollControl) {
        bool targetCurrent = _banditPadlockRollAssistSelected
            && _banditPadlockRollAssistTargetSequence == _banditSpawnSequence;
        bool eligible = targetCurrent
            && _playerTerminalState == AircraftTerminalState.Flying
            && _opponentTerminalState == AircraftTerminalState.Flying
            && _gunKill.TargetAlive
            && !_detents.ApproachMode
            && !_detents.HighAlphaRecoveryActive
            && !_pilotControlInterlocked
            && !effectiveCommand.EnvelopeOverride
            && !double.IsFinite(effectiveCommand.CommandedAlphaRad)
            && !_autoGcasState.Warning
            && !_autoGcasState.Active;
        PadlockRollAssistResult result = _padlockRollAssist.Step(
            effectiveCommand,
            _player.State,
            _bandit.State.Position,
            _banditPadlockRollAssistTargetSequence,
            selected: _banditPadlockRollAssistSelected,
            eligible,
            rawPilotRollControl,
            FixedDeltaSeconds);
        return result.Command;
    }

    void StepPilotPhysiology(double normalAccelerationG) {
        // An unconscious pilot cannot keep actively performing an AGSM. Engagement has its own
        // physiological release/engagement constants, so effort decays and later rebuilds instead
        // of switching as an artificial binary protection bonus.
        double techniqueEffort = _pilotPhysiology.State.ControlImpairment
                == PilotControlImpairment.Incapacitated
            ? 0.0 : _pilotPhysiology.Profile.Technique.NominalEffort01;
        PilotPhysiologyState next = _pilotPhysiology.Step(FixedDeltaSeconds,
            new PilotPhysiologyInput(normalAccelerationG, techniqueEffort));
        _pilotPeakPositiveG = Math.Max(_pilotPeakPositiveG, normalAccelerationG);
        _pilotPeakNegativeG = Math.Min(_pilotPeakNegativeG, normalAccelerationG);

        bool incapacitated = next.ControlImpairment
            == PilotControlImpairment.Incapacitated;
        if (incapacitated && !_pilotWasIncapacitated) {
            _pilotGLocCount++;
            _pilotControlInterlocked = true;
            _pilotTriggerInterlocked = true;
            _pilotHeldThrottle = _player.LastAppliedCommand.Throttle;
            ReleaseSpringLoadedPilotActuators();
            _pilotRecovering = false;
        } else if (!incapacitated && _pilotWasIncapacitated) {
            _pilotRecovering = true;
        }
        if (_pilotRecovering
            && next.ControlAuthority01 >= 0.995
            && next.CognitiveCapacity01 >= 0.995
            && next.EffectiveCerebralResource01 >= 0.99)
            _pilotRecovering = false;
        _pilotWasIncapacitated = incapacitated;
    }

    void StepPilotPhysiologyFromAircraft() => StepPilotPhysiology(
        _player.HasValidPilotNormalAcceleration
            ? _player.LastPilotNormalAccelerationG
            : 1.0);

    void ConsumeFuelAndStepSystems(in AircraftState kinematicState,
        double trueAirspeedMps, bool weightOnWheels) {
        _fuel.Step(FixedDeltaSeconds,
            _player.LastEngineOperatingPoint.FuelFlowLbPerMinute);
        RefreshPlayerMass();
        _player.EngineFuelAvailable = _fuel.HasFuel;

        double iasKts = AirData.IndicatedAirspeedMps(
            Math.Max(0.0, trueAirspeedMps), kinematicState.Position.Y,
            _player.AtmosphereModel)
            * AirData.MpsToKnots;
        if (PlayerSystemsSimulated) {
            ApplyAutomaticConfigurationCommands();
            _systems.Step(FixedDeltaSeconds, new AirframeSystemsInput(
                _player.LastEngineOperatingPoint.RpmPercent,
                iasKts,
                weightOnWheels));
            ObserveAutomaticConfiguration();
        }
        // Session time advances at the end of StepCore. Keep every scenario record in that same
        // beginning-of-tick epoch so a same-tick trap/loss cannot precede its latest observation.
        _maintenanceScenario?.Step(TimeSeconds);
        _player.AerodynamicConfiguration = PlayerAerodynamicConfiguration;
    }

    void StepFailedPlayerSystems(bool weightOnWheels) {
        _fuel.Step(FixedDeltaSeconds,
            _player.LastEngineOperatingPoint.FuelFlowLbPerMinute);
        RefreshPlayerMass();
        _player.EngineFuelAvailable = _fuel.HasFuel;
        double iasKts = AirData.IndicatedAirspeedMps(_player.AirspeedMps,
            _player.State.Position.Y, _player.AtmosphereModel) * AirData.MpsToKnots;
        if (PlayerSystemsSimulated)
            _systems.Step(FixedDeltaSeconds, new AirframeSystemsInput(
                _player.LastEngineOperatingPoint.RpmPercent, iasKts, weightOnWheels));
        _maintenanceScenario?.Step(TimeSeconds);
    }

    void CaptureIncidentReplaySample(bool completedContactTick = false) {
        if (_carrier is null) return;

        Carrier carrier = _carrier;
        AircraftState state = _player.State;
        Vec3D groundVelocity = state.VelocityVector();
        var (along, cross, height) = carrier.LandingFrame(state.Position);
        SessionEvent latestPlayerEvent = default;
        for (int i = _recentEvents.Count - 1; i >= 0; i--) {
            SessionEvent candidate = _recentEvents[i];
            if (candidate.Target != CombatRole.Player) continue;
            if (candidate.Type is SessionEventType.Destroyed or SessionEventType.Impact
                or SessionEventType.Settled or SessionEventType.TerminalLimitReached) {
                latestPlayerEvent = candidate;
                break;
            }
        }

        Carrier.TouchdownResult touchdown = _touchdown;
        // Replay records the command actually consumed by AircraftSim, not merely the pilot's
        // still-requested detent. External arrest/catapult/wreck phases explicitly report that no
        // aerodynamic control command was applied, avoiding a stale stick position in the lesson.
        PilotCommand command = _player.LastAppliedCommand;
        Carrier.Recovery recovery = _arrestment.Phase
                == ArrestmentModel.ArrestmentPhase.Failed
            ? Carrier.Recovery.ArrestmentFailed
            : touchdown.Recovery == Carrier.Recovery.Flying
                ? _recovery : touchdown.Recovery;
        _incidentReplay.Observe(new IncidentReplaySample(
            Tick: completedContactTick ? _tick + 1 : _tick,
            TimeSeconds: completedContactTick ? TimeSeconds + FixedDeltaSeconds : TimeSeconds,
            Player: state,
            IndicatedAirspeedKts: _player.IndicatedAirspeedMps * AirData.MpsToKnots,
            GroundSpeedKts: Math.Sqrt(groundVelocity.X * groundVelocity.X
                + groundVelocity.Z * groundVelocity.Z) * AirData.MpsToKnots,
            AngleOfAttackDeg: _player.AngleOfAttackRad * 57.29577951308232,
            ThrottleCommand: command.Throttle,
            EnginePowerFraction: _player.ThrustFraction,
            FlightPathAngleDeg: state.Gamma * 57.29577951308232,
            VerticalSpeedFpm: groundVelocity.Y * 196.8503937007874,
            NormalLoadFactor: _player.LastNz,
            CommandGDemand: command.GDemand,
            CommandBankTargetDeg: command.BankTarget * 57.29577951308232,
            CommandRudder: command.Rudder,
            CommandRollControl: command.RollControl,
            HasCommandedPitch: double.IsFinite(command.CommandedPitchRad),
            CommandedPitchDeg: double.IsFinite(command.CommandedPitchRad)
                ? command.CommandedPitchRad * 57.29577951308232 : 0.0,
            DeckSinkRateMps: carrier.DeckSinkRateMps(state),
            DeckClosureMps: carrier.DeckClosureMps(state),
            DeckAlongM: along,
            DeckCrossM: cross,
            DeckHeightM: height,
            CarrierPosition: carrier.Position,
            CarrierTouchdownPoint: carrier.TouchdownPoint,
            CarrierApproachCuePoint: carrier.ApproachCuePoint,
            CarrierHeadingRad: carrier.HeadingRad,
            CarrierDeckPitchRad: carrier.DeckPitchRad,
            CarrierDeckLengthM: carrier.DeckLengthM,
            CarrierDeckWidthM: carrier.DeckHalfWidthM * 2.0,
            GearHandle: _systems.GearHandle,
            GearFraction: _systems.EffectiveGearFraction,
            GearDownAndLocked: _systems.AllGearDownAndLocked,
            NoseGearFraction: _systems.NoseGearPosition,
            LeftGearFraction: _systems.LeftMainGearPosition,
            RightGearFraction: _systems.RightMainGearPosition,
            NoseGearIndication: _systems.NoseGearIndication,
            LeftGearIndication: _systems.LeftMainGearIndication,
            RightGearIndication: _systems.RightMainGearIndication,
            FlapLever: _systems.FlapLever,
            FlapDegrees: (_systems.LeftFlapDegrees + _systems.RightFlapDegrees) * 0.5,
            LeftFlapDegrees: _systems.LeftFlapDegrees,
            RightFlapDegrees: _systems.RightFlapDegrees,
            Recovery: recovery,
            Hook: touchdown.Hook,
            Wire: touchdown.Wire,
            TerminalState: _playerTerminalState,
            Surface: _playerImpactSurface,
            EventSequence: latestPlayerEvent.Sequence,
            EventType: latestPlayerEvent.Type,
            EventSurface: latestPlayerEvent.Surface,
            ArrestmentFailureReason: _arrestment.FailureReason,
            ArrestmentInitialEnergyJ: _arrestment.InitialEnergyJ,
            ArrestmentAbsorbedEnergyJ: _arrestment.AbsorbedEnergyJ,
            ArrestmentRemainingEnergyJ: _arrestment.RemainingEnergyJ,
            ArrestmentEffectiveCapacityJ:
                _arrestment.Capability.EffectiveEnergyCapacityJ,
            ArrestmentPeakLoadN: _arrestment.PeakLoadN,
            ArrestmentMaximumLineLoadN:
                _arrestment.Capability.MaximumLineLoadN,
            ArrestmentInitialClosureMps:
                _arrestment.InitialRelativeSpeedMps,
            ArrestmentProfileId: _arrestment.Capability.Id,
            CarrierSolid: PlayerCarrierSolid,
            TouchdownGrade: touchdown.Grade,
            TouchdownDeviations: touchdown.Deviations,
            TouchdownPrimaryCorrection: touchdown.PrimaryCorrection,
            TouchdownAssessmentProfileId: Carrier.TouchdownAssessmentProfileId,
            TouchdownAssessmentProfileVersion:
                Carrier.TouchdownAssessmentProfileVersion,
            TouchdownMinimumSinkRateMps: Carrier.MinTrapSinkMps,
            TouchdownHardSinkRateMps: Carrier.HardTrapSinkMps,
            TouchdownMaximumSinkRateMps: Carrier.MaxTrapSinkMps,
            TouchdownMaximumLineupM: Carrier.MaxTrapLineupM,
            TouchdownMinimumIndicatedAirspeedMps:
                Carrier.MinTrapAirspeedMps,
            TouchdownMaximumIndicatedAirspeedMps:
                Carrier.MaxTrapAirspeedMps,
            TouchdownMaximumClosureMps: Carrier.MaxTrapClosureMps,
            TouchdownOnSpeedAoaRad:
                _detents.EffectiveOnSpeedAoARad(_beat.PlayerAir),
            TouchdownMaximumAoaErrorRad: Carrier.MaxOnSpeedAoaErrorRad,
            TouchdownAdaptiveDifficultyLevel: _difficulty.Level,
            TouchdownAdaptiveMaximumSinkRateMps: _difficulty.MaxTrapSinkMps,
            TouchdownAdaptiveMaximumLineupM: _difficulty.MaxTrapLineupErrorM,
            TouchdownAdaptiveMinimumIndicatedAirspeedMps:
                _difficulty.MinTrapSpeedMps,
            TouchdownAdaptiveMaximumIndicatedAirspeedMps:
                _difficulty.MaxTrapSpeedMps,
            CommandAppliedToFlight: _player.HasAppliedFlightCommand,
            CommandDirectLateralControl: command.DirectLateralControl));
    }

    static QuaternionD CarrierConstrainedAttitude(Carrier carrier, double pitchRad) {
        Vec3D up = new(0.0, 1.0, 0.0);
        Vec3D forward = carrier.LandingFwd * Math.Cos(pitchRad)
            + up * Math.Sin(pitchRad);
        Vec3D bodyUp = up * Math.Cos(pitchRad)
            - carrier.LandingFwd * Math.Sin(pitchRad);
        return QuaternionD.FromFrame(bodyUp.Cross(forward).Normalized(), bodyUp, forward);
    }

    AircraftState CurrentArrestmentState() {
        if (_carrier is null) return _player.State;
        Vec3D velocity = _carrier.DeckVelocityWorld
            + _carrier.LandingFwd * _arrestment.RelativeSpeedMps
            + new Vec3D(0.0, _carrier.DeckVerticalVelocityMps, 0.0);
        return Carrier.StateFromVelocity(_arrestment.Position, velocity,
            _player.State.Mass,
            CarrierConstrainedAttitude(_carrier, _arrestment.NosePitchRad));
    }

    /// <summary>
    /// Transfer the exact residual state from a finite-capacity arrestment into deck contact. The
    /// wire's work has already changed tangential velocity, so WreckContactMotion must not apply a
    /// second tangential collision impulse at this boundary.
    /// </summary>
    void HandleArrestmentFailure() {
        if (_carrier is null || _playerTerminalState != AircraftTerminalState.Flying
            || _arrestment.Phase != ArrestmentModel.ArrestmentPhase.Failed) return;

        _attemptHadSetback = true;
        _recovery = Carrier.Recovery.ArrestmentFailed;
        AircraftState residualState = CurrentArrestmentState();
        _player.AdoptExternalKinematics(residualState);
        EmitEvent(SessionEventType.ArrestmentFailed, CombatRole.None,
            CombatRole.Player, surface: ImpactSurface.FlightDeck);
        Vec3D deckVelocity = _carrier.DeckVelocityWorld
            + new Vec3D(0.0, _carrier.DeckVerticalVelocityMps, 0.0);
        double deckHeight = residualState.Position.Y
            - _carrier.DeckFrame(residualState.Position).height;
        RegisterUndamagedCrash(CombatRole.Player, ImpactSurface.FlightDeck,
            deckVelocity, deckHeight, tangentialImpulseAlreadyResolved: true,
            carrierSolid: Carrier.SolidCollision.FlightDeck);
    }

    void ObserveCarrierPass() {
        if (_carrier is null || _touchdown.Recovery != Carrier.Recovery.Flying
            || _playerTerminalState != AircraftTerminalState.Flying) return;
        var (along, cross, height) = _carrier.LandingFrame(_player.State.Position);
        double distance = _carrier.TouchdownAlongM - along;
        if (CarrierPassRecorder.PhaseForDistance(distance) == CarrierPassPhase.None) return;
        double desiredHeight = Math.Max(0.0, distance * Carrier.GlideslopeSlope);
        double onSpeedAoa = _detents.EffectiveOnSpeedAoARad(_beat.PlayerAir);
        LsoAdvice? lso = Lso.AdviseForMode(
            _carrier,
            _player.State,
            _player.AngleOfAttackRad,
            _carrier.ApproachDirectorPitchOffsetRad,
            _detents.ApproachMode,
            WaveOffActive);
        _carrierPass.Observe(new CarrierPassSample(
            DistanceToTouchdownM: distance,
            GlideslopeErrorM: desiredHeight - height,
            LineupErrorM: cross,
            IndicatedAirspeedMps: _player.IndicatedAirspeedMps,
            AngleOfAttackErrorRad: _player.AngleOfAttackRad - onSpeedAoa,
            SinkRateMps: _carrier.DeckSinkRateMps(_player.State),
            LsoWaveOff: lso?.Severity == LsoSeverity.WaveOff,
            PilotWaveOff: WaveOffActive));
    }

    /// Apply the one authoritative carrier-contact path after an airborne player tick. Combat and
    /// terminal lifecycle state do not change deck geometry, hook interception, gear validation,
    /// bolter energy, or arresting-wire engagement, so both ordinary flight and a surviving
    /// ownship in terminal resolution must pass through this same method.
    void HandleCarrierRecovery(in AircraftState previousPlayerState) {
        if (_carrier is null || _playerTerminalState != AircraftTerminalState.Flying) return;

        Carrier.TouchdownResult touchdown = _carrier.EvaluateRecovery(
            _player.State, _player.AngleOfAttackRad, _difficulty,
            _player.IndicatedAirspeedMps,
            _detents.EffectiveOnSpeedAoARad(_beat.PlayerAir));
        Carrier.Recovery contact = touchdown.Recovery;
        var previousDeck = _carrier.DeckFrame(previousPlayerState.Position);
        var currentDeck = _carrier.DeckFrame(_player.State.Position);
        bool topDeckContact = contact is Carrier.Recovery.Trap
                or Carrier.Recovery.Bolter or Carrier.Recovery.HardLanding
            && previousDeck.height >= -0.05 && currentDeck.height <= 0.05
            && _carrier.DeckSinkRateMps(_player.State) > 0.0;
        Carrier.SolidCollision solid = _carrier.SweptSolidCollision(
            previousPlayerState.Position, _player.State.Position);

        if (_touchdown.Recovery == Carrier.Recovery.Flying
            && contact != Carrier.Recovery.Flying) {
            _touchdown = touchdown;
            _carrierPass.Complete(touchdown);
        }

        bool validRecoveryContact = solid == Carrier.SolidCollision.FlightDeck
            && topDeckContact
            && _systems.AllGearDownAndLocked;
        if (solid != Carrier.SolidCollision.None && !validRecoveryContact) {
            _attemptHadSetback = true;
            ImpactSurface surface = SurfaceFor(solid);
            Vec3D surfaceVelocity = _carrier.DeckVelocityWorld
                + new Vec3D(0.0, _carrier.DeckVerticalVelocityMps, 0.0);
            double surfaceHeight = _player.State.Position.Y
                - _carrier.DeckFrame(_player.State.Position).height;
            RegisterUndamagedCrash(CombatRole.Player, surface,
                surfaceVelocity, surfaceHeight, carrierSolid: solid);
        } else if (contact is Carrier.Recovery.HardLanding
            or Carrier.Recovery.RampStrike or Carrier.Recovery.InTheWater) {
            _attemptHadSetback = true;
            ImpactSurface surface = contact == Carrier.Recovery.InTheWater
                ? ImpactSurface.Water
                : contact == Carrier.Recovery.HardLanding
                    ? ImpactSurface.FlightDeck
                    : ImpactSurface.CarrierStructure;
            Vec3D surfaceVelocity = surface == ImpactSurface.Water
                ? Vec3D.Zero
                : _carrier.DeckVelocityWorld
                    + new Vec3D(0.0, _carrier.DeckVerticalVelocityMps, 0.0);
            double surfaceHeight = surface == ImpactSurface.Water ? 0.0
                : _player.State.Position.Y
                    - _carrier.DeckFrame(_player.State.Position).height;
            RegisterUndamagedCrash(CombatRole.Player, surface,
                surfaceVelocity, surfaceHeight, carrierSolid: solid);
        } else if (contact == Carrier.Recovery.Bolter) {
            _attemptHadSetback = true;
            SelectAutomaticConfigurationTarget(FlightConfigurationTarget.Combat);
            if (_recovery != Carrier.Recovery.Bolter) {
                double retainedEnginePower = _player.ThrustFraction;
                _player = CreatePlayer(_carrier.BolterFlyawayState(_player.State));
                _player.SeedEnginePowerFraction(retainedEnginePower);
                ShowTransition("BOLTER");
            }
            _recovery = Carrier.Recovery.Bolter;
        } else if (_recovery == Carrier.Recovery.Bolter) {
            var (along, cross, height) = _carrier.DeckFrame(_player.State.Position);
            if (height > 8.0 || along > _carrier.DeckLengthM * 0.5 + 5.0
                || Math.Abs(cross) > _carrier.DeckHalfWidthM + 10.0) {
                if (_beat.RecoveryCompletesSortie) {
                    FinishCarrierQualificationSortie(recovered: false);
                } else {
                    _recovery = Carrier.Recovery.Flying;
                    _touchdown = Carrier.TouchdownResult.Flying;
                }
            }
        } else {
            _recovery = contact;
        }

        if (_playerTerminalState != AircraftTerminalState.Flying) return;
        if (_recovery == Carrier.Recovery.Trap) {
            _arrestment.Engage(_carrier, _player.State, _player.BodyPitchRad,
                touchdown.Wire);
            _player.AdoptExternalKinematics(CurrentArrestmentState());
            _detents.ApproachMode = false;
            if (_arrestment.Phase == ArrestmentModel.ArrestmentPhase.Failed) {
                HandleArrestmentFailure();
            } else if (_arrestment.Phase == ArrestmentModel.ArrestmentPhase.Stopped) {
                if (_maintenanceScenario is not null) FinishRecoveredMaintenanceSortie();
                else if (_beat.RecoveryCompletesSortie)
                    FinishCarrierQualificationSortie(recovered: true);
                else BeginRelaunch();
            }
        }
    }

    void StepTerminalPhase() {
        AircraftState previousPlayer = _player.State;
        AircraftState previousOpponent = _bandit.State;
        StepWeapons(previousPlayer, previousOpponent,
            playerTriggerHeld: false, allowNewFire: false);

        if (_playerTerminalState == AircraftTerminalState.DestroyedAirborne) {
            TerminalFlightDynamics.Step(_player, PlayerAerodynamicConfiguration,
                handedness: -1, FixedDeltaSeconds);
            StepFailedPlayerSystems(weightOnWheels: false);
            _player.AerodynamicConfiguration = TerminalFlightDynamics.Configuration(
                PlayerAerodynamicConfiguration, handedness: -1);
        } else if (_playerTerminalState == AircraftTerminalState.Impacted
            && _playerWreckMotion is not null) {
            _player.AdvanceEngineOnly(0.0, FixedDeltaSeconds);
            _playerWreckMotion.Step(FixedDeltaSeconds);
            _player.AdoptExternalKinematics(_playerWreckMotion.State);
            StepFailedPlayerSystems(
                weightOnWheels: _playerWreckMotion.HasWeightBearingContact);
        } else if (_playerTerminalState == AircraftTerminalState.Flying) {
            // A surviving ownship remains a fully flyable aircraft while the destroyed opponent's
            // trajectory resolves. Re-run the normal input/control law every tick; freezing the
            // command present at the kill edge can manufacture a later ownship crash and a false
            // draw even though FeedKey still accepts pilot input.
            if (_carrier is not null) {
                bool inSlot = _carrier.InApproachSlot(_player.State,
                    _player.IndicatedAirspeedMps);
                if (inSlot && !WaveOffActive && _recovery != Carrier.Recovery.Bolter
                    && _detents.Throttle < 0.95) SelectAutomaticConfigurationTarget(
                    FlightConfigurationTarget.Recovery);
                _detents.ApproachMode = inSlot && _detents.Throttle < 0.95;
                var (along, _, height) = _carrier.LandingFrame(_player.State.Position);
                double gsLineH = Math.Max(0.0,
                    -_carrier.DeckLengthM * 0.2 - along) * Carrier.GlideslopeSlope;
                _detents.GlideslopeErrorM = gsLineH - height;
                _detents.ApproachAirspeedMps = _player.AirspeedMps;
                _detents.DeckClosureMps = _carrier.DeckClosureMps(_player.State);
            }
            _advice = _beat.Law.Advise(_player.State, _bandit.State,
                _beat.PlayerAir, _player.AirspeedMps);
            _detents.AirspeedMps = _player.AirspeedMps;
            _detents.MeasuredAngleOfAttackRad = _player.AngleOfAttackRad;
            _detents.AerodynamicConfiguration = PlayerAerodynamicConfiguration;
            ConfigureAssistedFlightDetents();
            _detents.Tick(_keys, _simTimeMs, _player.State, _beat.PlayerAir,
                _advice, FixedDeltaSeconds);
            if (_waveOffArmed && _detents.Throttle >= 0.95) {
                _waveOffUntilMs = _simTimeMs + 5000.0;
                _waveOffArmed = false;
                SelectAutomaticConfigurationTarget(FlightConfigurationTarget.Combat);
                if (_recoveryAttemptActive) _attemptHadSetback = true;
            }
            _cue = _prompts.Cue(_advice, _detents.Command, _detents.Tier);
            PilotCommand assistedCommand = ApplyGunneryPitchAssist(_detents.Command);
            PilotCommand effectiveCommand = ApplyPilotPhysiology(assistedCommand);
            PilotCommand padlockAssistedCommand = ApplyBanditPadlockRollAssist(
                effectiveCommand, _detents.Command.RollControl);
            PilotCommand flightCommand = ApplyAutoGcas(padlockAssistedCommand);
            PreparePlayerForPoweredTick();
            _player.Step(flightCommand, FixedDeltaSeconds);
            ConsumeFuelAndStepSystems(_player.State, _player.AirspeedMps,
                weightOnWheels: false);
        }

        StepPilotPhysiologyFromAircraft();

        _bandit.Step(ObservePlayer(previousPlayer), FixedDeltaSeconds);
        _carrier?.Step(FixedDeltaSeconds);
        ObserveCombatDamage();

        if (_playerTerminalState == AircraftTerminalState.DestroyedAirborne) {
            var contact = DetectImpact(previousPlayer, _player.State);
            if (contact.surface != ImpactSurface.None)
                RegisterAirborneImpact(CombatRole.Player,
                    contact.surface, contact.velocity, contact.height,
                    contact.carrierSolid);
        }
        if (_opponentTerminalState == AircraftTerminalState.DestroyedAirborne) {
            var contact = DetectImpact(previousOpponent, _bandit.State);
            if (contact.surface != ImpactSurface.None)
                RegisterAirborneImpact(CombatRole.Opponent,
                    contact.surface, contact.velocity, contact.height,
                    contact.carrierSolid);
        }

        if (_playerTerminalState == AircraftTerminalState.Flying) {
            if (_carrier is not null) {
                HandleCarrierRecovery(previousPlayer);
            } else {
                var contact = DetectImpact(previousPlayer, _player.State);
                if (contact.surface != ImpactSurface.None)
                    RegisterUndamagedCrash(CombatRole.Player,
                        contact.surface, contact.velocity, contact.height,
                        carrierSolid: contact.carrierSolid);
            }
        }
        if (_opponentTerminalState == AircraftTerminalState.Flying) {
            var contact = DetectImpact(previousOpponent, _bandit.State);
            if (contact.surface != ImpactSurface.None)
                RegisterUndamagedCrash(CombatRole.Opponent,
                    contact.surface, contact.velocity, contact.height,
                    carrierSolid: contact.carrierSolid);
        }

        ObserveSettledWrecks();
        double range = Geometry.Range(_player.State, _bandit.State);
        _closureKts = (_lastRange - range) / FixedDeltaSeconds * 1.94384;
        _closureKts = _closureSmooth = _closureSmooth * 0.9 + _closureKts * 0.1;
        _lastRange = range;
        double completedTimeMs = _simTimeMs + FixedDeltaSeconds * 1000.0;
        FinishTerminalIfResolved(completedTimeMs);
        _simTimeMs = completedTimeMs;
    }

    void CompleteCarrierConstraintTick(in AircraftState previousPlayer,
        in AircraftState previousOpponent) {
        double completedTimeMs = _simTimeMs + FixedDeltaSeconds * 1000.0;
        if (TerminalPhaseActive) {
            if (_playerTerminalState == AircraftTerminalState.DestroyedAirborne) {
                var contact = DetectImpact(previousPlayer, _player.State);
                if (contact.surface != ImpactSurface.None)
                    RegisterAirborneImpact(CombatRole.Player,
                        contact.surface, contact.velocity, contact.height,
                        contact.carrierSolid);
            }
            if (_opponentTerminalState == AircraftTerminalState.DestroyedAirborne) {
                var contact = DetectImpact(previousOpponent, _bandit.State);
                if (contact.surface != ImpactSurface.None)
                    RegisterAirborneImpact(CombatRole.Opponent,
                        contact.surface, contact.velocity, contact.height,
                        contact.carrierSolid);
            }
            if (_opponentTerminalState == AircraftTerminalState.Flying) {
                var contact = DetectImpact(previousOpponent, _bandit.State);
                if (contact.surface != ImpactSurface.None)
                    RegisterUndamagedCrash(CombatRole.Opponent,
                        contact.surface, contact.velocity, contact.height,
                        carrierSolid: contact.carrierSolid);
            }

            ObserveSettledWrecks();
            double range = Geometry.Range(_player.State, _bandit.State);
            _closureKts = (_lastRange - range) / FixedDeltaSeconds * 1.94384;
            _closureKts = _closureSmooth = _closureSmooth * 0.9 + _closureKts * 0.1;
            _lastRange = range;
            FinishTerminalIfResolved(completedTimeMs);
        }
        _simTimeMs = completedTimeMs;
    }

    void StepCore() {
        // Catapult and arrestment remain real fixed-step phases: ship, opponent and clock continue.
        if (_playerTerminalState == AircraftTerminalState.Flying
            && _carrier is not null && _catapult.IsActive) {
            AircraftState catapultState = _catapult.State;
            AircraftState opponentState = _bandit.State;
            bool allowNewFire = !TerminalPhaseActive;
            PreparePlayerForPoweredTick();
            _player.AdvanceEngineOnly(1.0, FixedDeltaSeconds);
            StepWeapons(catapultState, opponentState, playerTriggerHeld: false,
                allowNewFire: allowNewFire);
            Vec3D catapultAirVelocity = catapultState.VelocityVector()
                - (_player.Wind?.Sample(catapultState.Position) ?? Vec3D.Zero);
            ConsumeFuelAndStepSystems(catapultState, catapultAirVelocity.Length,
                weightOnWheels: true);
            _bandit.Step(ObservePlayer(catapultState), FixedDeltaSeconds);
            _carrier.Step(FixedDeltaSeconds);
            _catapult.Step(_carrier, FixedDeltaSeconds);
            _player.AdoptExternalKinematics(_catapult.State);
            StepPilotPhysiologyFromAircraft();
            ObserveCombatDamage();
            if (_playerTerminalState != AircraftTerminalState.Flying) {
                AircraftState handoff = _catapult.State;
                _player.AdoptExternalKinematics(handoff);
                _catapult.Reset();
                if (_playerTerminalState == AircraftTerminalState.DestroyedAirborne) {
                    Vec3D deckVelocity = _carrier.DeckVelocityWorld
                        + new Vec3D(0.0, _carrier.DeckVerticalVelocityMps, 0.0);
                    double deckHeight = handoff.Position.Y
                        - _carrier.DeckFrame(handoff.Position).height;
                    RegisterAirborneImpact(CombatRole.Player, ImpactSurface.FlightDeck,
                        deckVelocity, deckHeight,
                        Carrier.SolidCollision.FlightDeck);
                }
            }
            if (_playerTerminalState == AircraftTerminalState.Flying
                && _catapult.Phase == CatapultLaunchModel.LaunchPhase.Airborne)
                CompleteRelaunch();
            CompleteCarrierConstraintTick(catapultState, opponentState);
            return;
        }

        if (_playerTerminalState == AircraftTerminalState.Flying
            && _carrier is not null
            && _arrestment.Phase == ArrestmentModel.ArrestmentPhase.Arrested) {
            AircraftState playerState = _player.State;
            AircraftState opponentState = _bandit.State;
            bool allowNewFire = !TerminalPhaseActive;
            PreparePlayerForPoweredTick();
            _player.AdvanceEngineOnly(_detents.Throttle, FixedDeltaSeconds);
            StepWeapons(playerState, opponentState, playerTriggerHeld: false,
                allowNewFire: allowNewFire);
            ConsumeFuelAndStepSystems(playerState, _player.AirspeedMps,
                weightOnWheels: true);
            _bandit.Step(ObservePlayer(playerState), FixedDeltaSeconds);
            _carrier.Step(FixedDeltaSeconds);
            _arrestment.Step(_carrier, FixedDeltaSeconds);
            _player.AdoptExternalKinematics(CurrentArrestmentState());
            StepPilotPhysiologyFromAircraft();
            bool arrestmentFailed = _arrestment.Phase
                == ArrestmentModel.ArrestmentPhase.Failed;
            if (arrestmentFailed) HandleArrestmentFailure();
            ObserveCombatDamage();
            if (_playerTerminalState != AircraftTerminalState.Flying
                && !arrestmentFailed) {
                Vec3D velocity = _carrier.DeckVelocityWorld
                    + _carrier.LandingFwd * _arrestment.RelativeSpeedMps
                    + new Vec3D(0.0, _carrier.DeckVerticalVelocityMps, 0.0);
                AircraftState handoff = Carrier.StateFromVelocity(_arrestment.Position,
                    velocity, _player.State.Mass, _player.State.BodyAttitude);
                _player.AdoptExternalKinematics(handoff);
                _arrestment.Reset();
                if (_playerTerminalState == AircraftTerminalState.DestroyedAirborne) {
                    Vec3D deckVelocity = _carrier.DeckVelocityWorld
                        + new Vec3D(0.0, _carrier.DeckVerticalVelocityMps, 0.0);
                    double deckHeight = handoff.Position.Y
                        - _carrier.DeckFrame(handoff.Position).height;
                    RegisterAirborneImpact(CombatRole.Player, ImpactSurface.FlightDeck,
                        deckVelocity, deckHeight,
                        Carrier.SolidCollision.FlightDeck);
                }
            }
            if (_playerTerminalState == AircraftTerminalState.Flying
                && _arrestment.Phase == ArrestmentModel.ArrestmentPhase.Stopped) {
                if (_maintenanceScenario is not null) FinishRecoveredMaintenanceSortie();
                else if (_beat.RecoveryCompletesSortie)
                    FinishCarrierQualificationSortie(recovered: true);
                else BeginRelaunch();
            }
            CompleteCarrierConstraintTick(playerState, opponentState);
            return;
        }

        if (TerminalPhaseActive) {
            StepTerminalPhase();
            return;
        }

        if (_carrier is not null) {
            bool inSlot = _carrier.InApproachSlot(
                _player.State, _player.IndicatedAirspeedMps);
            if (inSlot && !WaveOffActive && _recovery != Carrier.Recovery.Bolter
                && _detents.Throttle < 0.95) SelectAutomaticConfigurationTarget(
                FlightConfigurationTarget.Recovery);
            _detents.ApproachMode = inSlot && _detents.Throttle < 0.95;
            if (_detents.ApproachMode) _waveOffArmed = true;
            else if (!inSlot && _detents.Throttle < 0.95) _waveOffArmed = false;
            var (gsAlong, _, gsHeight) = _carrier.LandingFrame(_player.State.Position);
            double gsLineH = Math.Max(0.0, -_carrier.DeckLengthM * 0.2 - gsAlong)
                * Carrier.GlideslopeSlope;
            _detents.GlideslopeErrorM = gsLineH - gsHeight;
            _detents.ApproachAirspeedMps = _player.AirspeedMps;
            _detents.DeckClosureMps = _carrier.DeckClosureMps(_player.State);
        }

        _advice = _beat.Law.Advise(_player.State, _bandit.State, _beat.PlayerAir,
            _player.AirspeedMps);
        _detents.AirspeedMps = _player.AirspeedMps;
        _detents.MeasuredAngleOfAttackRad = _player.AngleOfAttackRad;
        _detents.AerodynamicConfiguration = PlayerAerodynamicConfiguration;
        ConfigureAssistedFlightDetents();
        if (_carrier is not null)
            _carrier.ApproachDirectorPitchOffsetRad =
                _detents.EffectiveOnSpeedAoARad(_beat.PlayerAir);
        _detents.Tick(_keys, _simTimeMs, _player.State, _beat.PlayerAir, _advice,
            FixedDeltaSeconds);
        if (_waveOffArmed && _detents.Throttle >= 0.95) {
            _waveOffUntilMs = _simTimeMs + 5000.0;
            _waveOffArmed = false;
            SelectAutomaticConfigurationTarget(FlightConfigurationTarget.Combat);
            if (_recoveryAttemptActive) _attemptHadSetback = true;
        }
        _cue = _prompts.Cue(_advice, _detents.Command, _detents.Tier);

        AircraftState previousPlayerState = _player.State;
        AircraftState previousOpponentState = _bandit.State;
        PilotCommand assistedCommand = ApplyGunneryPitchAssist(_detents.Command);
        PilotCommand effectiveCommand = ApplyPilotPhysiology(assistedCommand);
        PilotCommand padlockAssistedCommand = ApplyBanditPadlockRollAssist(
            effectiveCommand, _detents.Command.RollControl);
        PilotCommand flightCommand = ApplyAutoGcas(padlockAssistedCommand);
        bool assistedTrigger = _assistedFlight && _gunKill.GunSolution;
        StepWeapons(previousPlayerState, previousOpponentState,
            _triggerDown || assistedTrigger);
        PreparePlayerForPoweredTick();
        _player.Step(flightCommand, FixedDeltaSeconds);
        StepPilotPhysiologyFromAircraft();
        ConsumeFuelAndStepSystems(_player.State, _player.AirspeedMps,
            weightOnWheels: false);
        // Both aircraft receive the same beginning-of-tick world snapshot. Giving the bandit the
        // already-integrated player leaked one fixed tick of future ownship motion into its law.
        _bandit.Step(ObservePlayer(previousPlayerState), FixedDeltaSeconds);
        _visualMergeEvaluation?.Step(_player.State, _bandit.State,
            _player.AtmosphereModel, FixedDeltaSeconds, _player.AirspeedMps);

        if (_carrier is not null) {
            _carrier.Step(FixedDeltaSeconds);
            ObserveCarrierPass();
        }

        ObserveCombatDamage();
        if (Lifecycle != LifecycleState.Active) {
            _simTimeMs += FixedDeltaSeconds * 1000.0;
            return;
        }
        ObserveDroneRaidTarget(TimeSeconds + FixedDeltaSeconds);
        if (Lifecycle != LifecycleState.Active) {
            _simTimeMs += FixedDeltaSeconds * 1000.0;
            return;
        }
        if (TerminalPhaseActive) {
            if (_playerTerminalState == AircraftTerminalState.DestroyedAirborne) {
                var contact = DetectImpact(previousPlayerState, _player.State);
                if (contact.surface != ImpactSurface.None)
                    RegisterAirborneImpact(CombatRole.Player,
                        contact.surface, contact.velocity, contact.height,
                        contact.carrierSolid);
            }
            if (_opponentTerminalState == AircraftTerminalState.DestroyedAirborne) {
                var contact = DetectImpact(previousOpponentState, _bandit.State);
                if (contact.surface != ImpactSurface.None)
                    RegisterAirborneImpact(CombatRole.Opponent,
                        contact.surface, contact.velocity, contact.height,
                        contact.carrierSolid);
            }
            // A surviving ownship still owns this tick's carrier contact. In particular, a round
            // which destroys the opponent on the touchdown tick must not turn a valid wire into a
            // generic terminal-phase deck crash.
            if (_playerTerminalState != AircraftTerminalState.Flying) {
                _simTimeMs += FixedDeltaSeconds * 1000.0;
                return;
            }
        }

        HandleCarrierRecovery(previousPlayerState);

        if (_playerTerminalState != AircraftTerminalState.Flying) {
            _simTimeMs += FixedDeltaSeconds * 1000.0;
            return;
        }

        var playerNaturalContact = DetectNaturalSurface(_player.State);
        if (playerNaturalContact.surface != ImpactSurface.None) {
            RegisterUndamagedCrash(CombatRole.Player, playerNaturalContact.surface,
                Vec3D.Zero, playerNaturalContact.height);
            _simTimeMs += FixedDeltaSeconds * 1000.0;
            return;
        }
        var opponentNaturalContact = DetectNaturalSurface(_bandit.State);
        if (opponentNaturalContact.surface != ImpactSurface.None) {
            RegisterUndamagedCrash(CombatRole.Opponent, opponentNaturalContact.surface,
                Vec3D.Zero, opponentNaturalContact.height);
            _simTimeMs += FixedDeltaSeconds * 1000.0;
            return;
        }

        double range = Geometry.Range(_player.State, _bandit.State);
        _closureKts = (_lastRange - range) / FixedDeltaSeconds * 1.94384;
        _closureKts = _closureSmooth = _closureSmooth * 0.9 + _closureKts * 0.1;
        _lastRange = range;
        _simTimeMs += FixedDeltaSeconds * 1000.0;
    }
}
