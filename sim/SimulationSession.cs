using System.Collections.Generic;
using System.Linq;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Propulsion;
using GunsOnly.Sim.Training;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim;

public enum SortieOutcome { None, Victory, Defeat, Draw, Discontinued }
public enum CombatRole { None, Player, Opponent, Relief }
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
/// An opponent which no longer owns combat targeting but remains physically integrated. A flying
/// raid leaker continues its ordinary egress; a mission-killed opponent continues through the same
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
    /// Flying raid leakers remain visible physical actors until they are well outside the local
    /// engagement volume. This is a deterministic simulation boundary, not a scoring boundary.
    public const double DetachedOpponentEgressRangeM = 12_000.0;
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
    // Opponents beyond the primary. Empty for a 1v1; the pilot's cues always track the primary,
    // which is re-elected from this list when it dies.
    readonly List<Wingman> _wingmen = new();
    readonly List<RetiredOpponentGun> _retiredOpponentGuns = new();
    // A handoff never changes Wingman semantics: _wingmen remains the enemy formation. Friendly
    // relief and the enemy guns retargeted against it live in their own authority records.
    ReliefFighter? _reliefFighter;
    readonly Dictionary<long, ReliefTargetingOpponentGun>
        _reliefTargetingOpponentGuns = new();
    GunTarget[] _reliefGunTargets = new GunTarget[4];
    readonly GunTarget[] _reliefOpponentTarget = new GunTarget[1];
    AircraftState _reliefThreatState;
    bool _reliefThreatStateValid;
    CombatHandoffPhase _combatHandoffPhase;
    int _reliefKills;
    long _reliefSpawnSequence;
    // One GunKill owns the player's real magazine, heat, cadence, and airborne rounds. Stable
    // actor IDs keep per-aircraft damage attached to the aircraft when the primary slot changes.
    GunTarget[] _playerGunTargets = new GunTarget[4];
    readonly List<GunRound> _formationOpponentRoundsInFlight = new(96);
    // Keep gun-target/event identities session-monotonic across restarts and away from the
    // primary actor's small spawn-sequence namespace.
    long _nextOpponentGunTargetId = 1_000_000;
    long _primaryOpponentGunTargetId;
    long _selectedPlayerGunTargetId;
    // One monotonic damage ledger for the player. Individual enemy guns still own their physical
    // rounds and per-shooter evidence, but promotion or formation-list maintenance must never make
    // an already-landed hit disappear or count it a second time.
    int _playerHitsTaken;

    sealed record RetiredOpponentGun(IBandit Shooter, GunKill Gun);
    sealed record ReliefTargetingOpponentGun(IBandit Shooter, GunKill Gun);
    FuelModel _fuel = null!;
    AirframeSystems _systems = null!;
    ConventionalRunwayRecoveryModel? _conventionalRunwayRecovery;
    PilotPhysiologyModel _pilotPhysiology = null!;
    AutoGcasState _autoGcasState;
    PilotCommand? _autoGcasRecoveryCommand;
    int _autoGcasPredictionTicksRemaining;
    int _autoGcasPredictionEvaluationCount;
    double _autoGcasPredictionElapsedSeconds;
    double _autoGcasFlyUpMinimumClearanceM = double.PositiveInfinity;
    double? _lastAutoGcasFlyUpBottomClearanceM;
    int _completedAutoGcasFlyUpCount;
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
    // Highest ram cue already announced: 0 none, 1 light-up, 2 full ram, 3 turbine gone.
    int _ramCueStage;
    double _transitionCueUntilMs = double.NegativeInfinity;
    double _splashCueUntilMs = double.NegativeInfinity;
    RapierMissionDirector? _rapierMissionDirector;
    RapierMissionGuidance _rapierMissionGuidance;
    CircuitTrafficShip[] _circuitTraffic = System.Array.Empty<CircuitTrafficShip>();
    string _circuitComms = "";
    bool _circuitsCleanMode;
    bool _circuitsFaultArmed = true;
    double _circuitsNextFaultAtMs = double.PositiveInfinity;
    bool _rapierAutomationEnabled;
    double _rapierManualOverrideUntilMs = double.NegativeInfinity;
    int _rapierMissilesRemaining;
    int _rapierDogfightingDronesRemaining;
    bool _rapierMissileInFlight;
    double _rapierMissileImpactAtMs = double.PositiveInfinity;
    long _rapierMissileTargetSequence;
    bool _rapierFormationSweepCommitted;
    bool _rapierFormationSweepRequested;
    RapierGunDrone? _rapierGunDrone;
    long _rapierGunDroneSpawnSequence;
    bool _rapierGunDroneEgress;
    bool _rapierGunDroneThreatReactive;
    bool _rapierPursuitActive;
    double _rapierPursuitRangeM = double.PositiveInfinity;
    // OFF until the pilot asks for it. Compression that engages by itself takes the aircraft away
    // without being asked, which reads as the sim jumping rather than the pilot skipping — the
    // pilot's words were "should be player-driven not auto fast forward". The eligibility rules
    // still gate it; they now decide whether a REQUEST is honoured, not whether one is made.
    bool _timeCompressionPilotEnabled;
    int _timeCompressionHostMaximumFactor = 1;
    int _timeCompressionFactor = 1;
    double _timeCompressionAccumulatorSeconds;
    TimeCompressionInhibitReason _timeCompressionInhibitReason =
        TimeCompressionInhibitReason.SessionInactive;
    int _shotsTotal;
    int _shotsInWindow;
    int _killCount;
    int _engagementNumber = 1;
    EngagementCounters _engagementCounters;
    readonly List<EngagementReport> _engagementReports = new();
    readonly FightDirector _fightDirector = new();
    readonly EnemyPairCoordinator _enemyPairCoordinator = new();
    AiComputeLevel _aiComputeLevel = AiComputeLevel.Full;
    bool _incrementalAiPlanningEnabled;
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

    struct EngagementCounters {
        public bool Active;
        public int EngagementNumber;
        public PilotSkill OpponentSkill;
        public bool OpponentWasBoss;
        public double DurationSeconds;
        public double SolutionSecondsConceded;
        public int PlayerHitsTakenAtStart;
        public int ShotsTotalAtStart;
        public int ShotsInWindowAtStart;
        public int OvershootsAtStart;
        public int GcasActivationsAtStart;
    }

    Carrier? _carrier;
    readonly RecoveryProgress _recoveryProgress = new();
    RecoveryDifficulty _difficulty = DifficultyModel.ForLevel(0);
    bool _recoveryAttemptActive;
    bool _attemptHadSetback;
    bool _attemptCleanRecorded;
    Carrier.Recovery _recovery = Carrier.Recovery.Flying;
    Carrier.TouchdownResult _touchdown = Carrier.TouchdownResult.Flying;
    readonly CarrierPassRecorder _carrierPass = new();
    ArrestmentModel _arrestment = new();
    CatapultLaunchModel _catapult = new();
    LaunchTerrainClearanceAssessment _launchTerrainClearance =
        LaunchTerrainClearanceAssessment.Unavailable;
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
    public bool TimeCompressionAvailable =>
        _beatIndex == 10
        || _beat.MissionIdentity.Id
            == "mission.modern.rapier-intercept.public-data-surrogate.v1";
    public bool TimeCompressionPilotEnabled => _timeCompressionPilotEnabled;
    public bool TimeCompressionEligible =>
        _timeCompressionInhibitReason == TimeCompressionInhibitReason.None;
    public int TimeCompressionRequestedFactor =>
        TimeCompressionAvailable && _timeCompressionPilotEnabled
            ? TimeCompressionPolicy.PreferredFactor : 1;
    public int TimeCompressionFactor => _timeCompressionFactor;
    public TimeCompressionInhibitReason TimeCompressionInhibitReason =>
        _timeCompressionInhibitReason;
    public bool RapierMissionAvailable => _beat.ScriptedIntercept is not null;
    public RapierMissionPhase RapierPhase =>
        _rapierMissionDirector?.Phase ?? RapierMissionPhase.Unavailable;
    public string RapierMissionCue => _rapierMissionGuidance.Cue ?? "";
    public double RapierTargetMach => _rapierMissionGuidance.TargetMach;
    public double RapierTargetAltitudeFt => _rapierMissionGuidance.TargetAltitudeFt;
    public bool RapierAutomationEnabled => RapierMissionAvailable
        && _rapierAutomationEnabled;
    public bool RapierAutomationActive => RapierAutomationEnabled
        && _simTimeMs >= _rapierManualOverrideUntilMs
        && Lifecycle == LifecycleState.Active
        && _playerTerminalState == AircraftTerminalState.Flying;
    public int RapierMissilesRemaining => _rapierMissilesRemaining;
    public int RapierDogfightingDronesRemaining => _rapierDogfightingDronesRemaining;
    public bool RapierMissileInFlight => _rapierMissileInFlight;
    public double RapierMissileTimeToImpactSeconds => _rapierMissileInFlight
        ? Math.Max(0.0, (_rapierMissileImpactAtMs - _simTimeMs) / 1000.0)
        : 0.0;
    public bool RapierPursuitActive => _rapierPursuitActive;
    public int RapierPursuerCount => _rapierPursuitActive
        ? Math.Max(0, _beat.ScriptedIntercept?.PursuerCount ?? 0) : 0;
    public double RapierPursuitRangeM => double.IsFinite(_rapierPursuitRangeM)
        ? _rapierPursuitRangeM : 0.0;
    public Vec3D RapierGuidanceWaypoint => _rapierMissionGuidance.Waypoint;
    public int RapierRecoveryGate => _rapierMissionGuidance.RecoveryGate;
    public string RapierCircuitLeg => _rapierMissionGuidance.CircuitLeg ?? "";
    public double RapierFdBankDeg => _rapierMissionGuidance.FdBankDeg;
    public double RapierFdTargetKtas => _rapierMissionGuidance.FdTargetKtas;
    public double RapierGateHalfM => _rapierMissionGuidance.GateHalfM;
    public Vec3D RapierGateFace => new(
        _rapierMissionGuidance.GateFaceX,
        _rapierMissionGuidance.GateFaceY,
        _rapierMissionGuidance.GateFaceZ);
    public bool RapierGateInVolume => _rapierMissionGuidance.GateInVolume;
    public bool RapierGateEnergyOk => _rapierMissionGuidance.GateEnergyOk;
    public System.Collections.Generic.IReadOnlyList<CircuitTrafficShip> CircuitTraffic => _circuitTraffic;
    public string CircuitComms => _circuitComms;
    public bool CircuitsCleanMode => _circuitsCleanMode;
    public bool CircuitsFaultArmed => _circuitsFaultArmed;
    public double RapierNoseOnVelocityErrorDeg =>
        _rapierMissionGuidance.NoseOnVelocityErrorDeg;
    public string RapierJobToken => _rapierMissionGuidance.JobToken ?? "";
    public int RapierLobSkip => _rapierMissionGuidance.LobSkip;
    public int RapierLobSkipMax => _rapierMissionGuidance.LobSkipMax;
    public double RapierRcsGasFraction => _player.ColdGasRcsGasFraction;
    public double RapierRcsAuthority => _player.ColdGasRcsAuthority;
    public double RapierRcsMomentMagnitudeNm => _player.LastRcsMomentMagnitudeNm;
    public double RapierRcsFiringFraction => _beat.PlayerAir.ColdGasRcsMaxMomentNm > 1e-9
        ? Math.Clamp(
            _player.LastRcsMomentMagnitudeNm / _beat.PlayerAir.ColdGasRcsMaxMomentNm,
            0.0,
            1.0)
        : 0.0;
    public double RapierCommandedMach => _rapierMissionGuidance.CommandedMach;
    public double RapierAuthoredTargetMach => _rapierMissionGuidance.AuthoredTargetMach;
    public double RapierSkinMachLimit => _rapierMissionGuidance.SkinMachLimit;
    public string RapierPhaseReason => _rapierMissionGuidance.PhaseReason ?? "";
    public RapierGunDrone? ActiveRapierGunDrone =>
        _rapierGunDrone is { StillActive: true } ? _rapierGunDrone : null;
    public bool RapierGunDroneEgress => _rapierGunDroneEgress;
    public bool RapierGunDroneThreatReactive => _rapierGunDroneThreatReactive;
    CombinedCycleThrustFractions RapierThrustFractions {
        get {
            AtmosphericState air = _player.AtmosphereModel.Sample(_player.State.Position.Y);
            double mach = _player.AirspeedMps / Math.Max(1.0, air.SpeedOfSoundMps);
            return TurboRamjetPerformanceMap.ThrustComponents(
                mach, air.TemperatureK, air.DensityKgM3);
        }
    }
    double RapierTurbineShare {
        get {
            CombinedCycleThrustFractions fractions = RapierThrustFractions;
            // When both streams are dead (exo coast), do not default the residual to "turbine" —
            // that is how idle fuel kept reading as a live core at 100 kft+.
            return fractions.Total > 1e-9 ? fractions.Turbine / fractions.Total : 0.0;
        }
    }
    public double RapierTurbineThrustN => RapierMissionAvailable
        ? _player.LastEngineOperatingPoint.NetThrustN * RapierTurbineShare : 0.0;
    public double RapierRamjetThrustN => RapierMissionAvailable
        ? Math.Max(0.0, _player.LastEngineOperatingPoint.NetThrustN
            - RapierTurbineThrustN)
        : 0.0;
    public double RapierTurbineFuelFlowLbPerMinute => RapierMissionAvailable
        ? _player.LastEngineOperatingPoint.TurbineFuelFlowLbPerMinute
        : 0.0;
    public double RapierRamjetFuelFlowLbPerMinute => RapierMissionAvailable
        ? _player.LastEngineOperatingPoint.RamjetFuelFlowLbPerMinute
        : 0.0;
    public AircraftSim Player => _player;
    public IBandit Bandit => _bandit;
    public BeatSetup Beat => _beat;
    public AiComputeLevel AiComputeLevel => _aiComputeLevel;
    /// <summary>
    /// Aggregate workload of the planners in the currently staged live formation. Individual
    /// planner counters are lifetime-cumulative, but this aggregate may decrease when an actor is
    /// promoted, replaced, or retired; it is not a cross-wave session total.
    /// </summary>
    public AiWorkloadCounters AiWorkload {
        get {
            AiWorkloadCounters total = _bandit is IAdaptiveAiPlanner primary
                ? primary.AiWorkload
                : default;
            foreach (Wingman wingman in _wingmen) {
                if (wingman.Bandit is IAdaptiveAiPlanner support)
                    total += support.AiWorkload;
            }
            if (_reliefFighter is {
                    StillFighting: true,
                    Actor: IAdaptiveAiPlanner relief })
                total += relief.AiWorkload;
            return total;
        }
    }
    public KeyGrammar Keys => _keys;
    public DetentLayer Controls => _detents;
    public GunKill PlayerGun => _gunKill;
    public GunKill OpponentGun => _opponentGun;
    public IReadOnlyList<GunRound> FormationOpponentRoundsInFlight {
        get {
            _formationOpponentRoundsInFlight.Clear();
            if (!_reliefTargetingOpponentGuns.ContainsKey(_primaryOpponentGunTargetId))
                _formationOpponentRoundsInFlight.AddRange(_opponentGun.RoundsInFlight);
            foreach (Wingman wingman in _wingmen)
                if (!_reliefTargetingOpponentGuns.ContainsKey(wingman.PlayerGunTargetId))
                    _formationOpponentRoundsInFlight.AddRange(wingman.Gun.RoundsInFlight);
            foreach (RetiredOpponentGun retired in _retiredOpponentGuns)
                _formationOpponentRoundsInFlight.AddRange(retired.Gun.RoundsInFlight);
            foreach (ReliefTargetingOpponentGun gun in
                _reliefTargetingOpponentGuns.Values)
                _formationOpponentRoundsInFlight.AddRange(gun.Gun.RoundsInFlight);
            return _formationOpponentRoundsInFlight;
        }
    }
    /// Opponents beyond the primary — the 1v2 and beyond.
    public IReadOnlyList<Wingman> Wingmen => _wingmen;
    /// Formation slot selected for the player's gun sight: 0 is the primary and 1..N are the
    /// additional contacts in their stable browser/render order.
    public int SelectedPlayerGunTargetSlot {
        get {
            if (_selectedPlayerGunTargetId == _primaryOpponentGunTargetId) return 0;
            int index = _wingmen.FindIndex(wingman =>
                wingman.PlayerGunTargetId == _selectedPlayerGunTargetId);
            return index < 0 ? 0 : index + 1;
        }
    }
    public AircraftState SelectedOpponentState {
        get {
            Wingman? wingman = _wingmen.FirstOrDefault(wingman =>
                wingman.PlayerGunTargetId == _selectedPlayerGunTargetId);
            return wingman?.Bandit.State ?? _bandit.State;
        }
    }
    public bool SelectedOpponentAlive => IsPlayerGunTargetLive(
        _selectedPlayerGunTargetId);
    public double SelectedOpponentHealth =>
        _gunKill.TargetHealthFor(_selectedPlayerGunTargetId);
    public bool PrimaryOpponentAlive =>
        _opponentTerminalState == AircraftTerminalState.Flying
        && _gunKill.DamageFor(_primaryOpponentGunTargetId).TargetAlive;
    public double PrimaryOpponentHealth =>
        _gunKill.TargetHealthFor(_primaryOpponentGunTargetId);
    /// Every opponent still fighting, primary first. One entry for an ordinary duel.
    public int LiveOpponentCount =>
        (_opponentTerminalState == AircraftTerminalState.Flying ? 1 : 0)
        + _wingmen.Count(static wingman => wingman.StillFighting);
    /// Total rounds the player has absorbed from ALL opponents in this sortie.
    public int PlayerHitsTaken => _playerHitsTaken;
    public double PlayerHealth => 1.0 - Math.Clamp(
        (double)_playerHitsTaken / Math.Max(1, _beat.CombatRules.PlayerHitsToDefeat),
        0.0,
        1.0);
    public bool PlayerAlive =>
        _playerTerminalState == AircraftTerminalState.Flying
        && _playerHitsTaken < _beat.CombatRules.PlayerHitsToDefeat;
    public FuelModel PlayerFuel => _fuel;
    public AirframeSystems PlayerSystems => _systems;
    public PilotPhysiologyModel PilotPhysiology => _pilotPhysiology;
    public PilotPhysiologyState PilotPhysiologyState => _pilotPhysiology.State;
    public PilotOperationalState PilotState => ResolvePilotOperationalState();
    public AutoGcasCapabilityProfile PlayerAutoGcasCapability =>
        _beat.PlayerAircraft.AutomaticGroundCollisionAvoidance;
    public AutoGcasState AutoGcas => _autoGcasState;
    public int AutoGcasPredictionEvaluationCount => _autoGcasPredictionEvaluationCount;
    public double? LastAutoGcasFlyUpBottomClearanceM =>
        _lastAutoGcasFlyUpBottomClearanceM;
    public int CompletedAutoGcasFlyUpCount => _completedAutoGcasFlyUpCount;
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
    /// Aircraft-owned automatic surfaces are composed inside AircraftSim so they can use live air
    /// data without contaminating the pilot-selectable systems state. Consumers which calculate a
    /// current envelope use this effective configuration; setters continue to use the base state.
    public AirframeAerodynamicState PlayerEffectiveAerodynamicConfiguration =>
        _player is null
            || _beat.PlayerAir.HighAlphaModel
                != HighAlphaModelKind.F22PublicDataSurrogate
            ? PlayerAerodynamicConfiguration
            : _player.EffectiveAerodynamicConfiguration;
    public F86EmergencyGearRecoveryScenario? MaintenanceScenario => _maintenanceScenario;
    public VisualMergeEvaluation? VisualMergeEvaluation => _visualMergeEvaluation;
    public DroneRaidEvaluation? DroneRaidEvaluation => _droneRaidEvaluation;
    public PromptCue Cue => _cue;
    public DoctrineAdvice Advice => _advice;
    public Carrier? Carrier => _carrier;
    public ConventionalRunwayRecoveryModel? ConventionalRunwayRecovery =>
        _conventionalRunwayRecovery;
    public RunwayRecoveryPhase ConventionalRunwayPhase =>
        _conventionalRunwayRecovery?.Phase ?? RunwayRecoveryPhase.Airborne;
    public RunwayTouchdownResult RunwayTouchdown =>
        _conventionalRunwayRecovery?.Touchdown ?? RunwayTouchdownResult.None;
    public bool RunwayWeightOnWheels =>
        _conventionalRunwayRecovery?.WeightOnWheels ?? false;
    public RecoveryProgress RecoveryProgress => _recoveryProgress;
    public RecoveryDifficulty Difficulty => _difficulty;
    public Carrier.Recovery Recovery => _recovery;
    public Carrier.TouchdownResult Touchdown => _touchdown;
    public CarrierPassResult CarrierPass => _carrierPass.Result;
    public ArrestmentModel Arrestment => _arrestment;
    public CatapultLaunchModel Catapult => _catapult;
    public LaunchTerrainClearanceAssessment LaunchTerrainClearance =>
        _launchTerrainClearance;
    public BurbleField? Burble => _burble;
    public double ClosureKts => _closureKts;
    public int ShotsTotal => _shotsTotal;
    public int ShotsInWindow => _shotsInWindow;
    public int KillCount => _killCount;
    public CombatHandoffPhase CombatHandoffPhase => _combatHandoffPhase;
    /// True only while a valid active F-22 continuous fight can still accept the command.
    public bool CombatHandoffAvailable =>
        _combatHandoffPhase == CombatHandoffPhase.Available
        && Lifecycle == LifecycleState.Active
        && _playerTerminalState == AircraftTerminalState.Flying
        && (LiveOpponentCount > 0 || OpponentReplacementPending);
    /// Latched from the accepted rising edge through recovery.
    public bool CombatHandoffRequested =>
        _combatHandoffPhase >= CombatHandoffPhase.Requested;
    /// True once the relief actor has accepted combat custody, including completed/lost outcomes.
    public bool CombatHandoffActive =>
        _combatHandoffPhase >= CombatHandoffPhase.ReliefEngaged;
    public int ReliefKills => _reliefKills;
    /// The navigation/recovery layer's stable authority hook. It remains active after the remote
    /// fight resolves or the relief aircraft is lost, and clears only on explicit recovery.
    public bool PlayerRtbActive =>
        _combatHandoffPhase >= CombatHandoffPhase.ReliefEngaged
        && _combatHandoffPhase < CombatHandoffPhase.Recovered;
    public ReliefFighter? Relief => _reliefFighter;
    public bool ContinuousCombat => _beat.ContinuousCombat is not null;
    public FormationTacticalRole PrimaryFormationRole =>
        _bandit is not null
        && _opponentTerminalState == AircraftTerminalState.Flying
        && !_bandit.CatastrophicallyDamaged
        && _bandit is IFormationDirectiveSink sink
            ? sink.FormationDirective.Role
            : FormationTacticalRole.Independent;
    public FormationTacticalRole WingmanFormationRole(int index) =>
        index >= 0
        && index < _wingmen.Count
        && _wingmen[index].StillFighting
        && _wingmen[index].Bandit is IFormationDirectiveSink sink
            ? sink.FormationDirective.Role
            : FormationTacticalRole.Independent;
    public double? FormationCoordinationAgeSeconds =>
        _enemyPairCoordinator.Active
            ? _enemyPairCoordinator.SharedContactAgeTicks * FixedDeltaSeconds
            : null;
    public bool FormationCoordinationStale =>
        _enemyPairCoordinator.Active
        && _enemyPairCoordinator.SharedContactStale;
    public int EngagementNumber => _engagementNumber;
    public EngagementReport? LastEngagementReport =>
        _engagementReports.Count == 0 ? null : _engagementReports[^1];
    public IReadOnlyList<EngagementReport> EngagementReports => _engagementReports;
    public DirectorPhase DirectorPhase => _fightDirector.Phase;
    public LearnerBands LearnerBands => _fightDirector.Bands;
    public SpawnSpec? LastDirectorSpawn { get; private set; }
    /// The capability of the aircraft ACTUALLY FLYING, not the one the beat staged. Presentation
    /// read Beat.BanditAircraft directly, so the HUD and telemetry reported a Su-27S no matter what
    /// was really out there — the Su-35S at the Ace rung, a director-uprated mount, or the 15 G
    /// machine spike. That is a lie to the pilot about the thing trying to kill them, and it also
    /// made the mount escalation impossible to verify from a production tape.
    public AircraftCapability CurrentBanditCapability =>
        LastDirectorSpawn is { } spawn
            ? _beat.BanditAircraftForMount(spawn.Skill, spawn.Mount)
            : _beat.BanditAircraftForSkill(_beat.BanditSkill);
    /// The mount the director last staged, for debrief and telemetry.
    public BanditMount CurrentBanditMount =>
        LastDirectorSpawn?.Mount ?? BanditMount.Baseline;
    public int DirectorWalkoverStreak => _fightDirector.WalkoverStreak;
    /// Carry the pacing estimate across a page reload. See FightDirector.ExportState.
    public string ExportDirectorState() => _fightDirector.ExportState();
    public bool TryImportDirectorState(string? state) =>
        _fightDirector.TryImportState(state);
    public bool OpponentReplacementPending =>
        !CombatHandoffRequested
        && (_beat.ContinuousCombat is not null
            || _wingmen.Any(static wingman => wingman.StillFighting))
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
        && !CombatHandoffRequested
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
        RefreshLaunchTerrainClearance();
        // Every live opponent captured the previous surface at construction; a world-origin
        // re-anchor must reach the whole formation or a wingman's floor sense silently reads the
        // stale translation. Destroyed/settled actors already fly through their impact-owned
        // WreckContactMotion (or detached-wreck state), and are deliberately not retargeted to a
        // newly translated surface mid-contact.
        if (!_bandit.CatastrophicallyDamaged)
            UpdateLiveBanditTerrain(_bandit, terrain);
        foreach (Wingman wingman in _wingmen) {
            if (wingman.StillFighting)
                UpdateLiveBanditTerrain(wingman.Bandit, terrain);
        }
        if (_reliefFighter is { StillFighting: true } relief)
            UpdateLiveBanditTerrain(relief.Actor, terrain);
        foreach (DetachedOpponentWreck detached in _detachedOpponentWrecks) {
            // The collection can also contain a still-flying raid leaker. It remains a physical
            // AI actor and therefore follows a world re-anchor; actual destroyed/impacted wrecks
            // retain the surface/contact model they already own.
            if (detached.TerminalState == AircraftTerminalState.Flying
                && !detached.Actor.CatastrophicallyDamaged)
                UpdateLiveBanditTerrain(detached.Actor, terrain);
        }
    }

    static void UpdateLiveBanditTerrain(
        IBandit bandit,
        ITerrainSurface? terrain) {
        switch (bandit) {
            case ReactiveBandit reactive:
                reactive.UpdateTerrain(terrain);
                break;
            case NeutralMergeBandit merge:
                merge.UpdateTerrain(terrain);
                break;
        }
    }

    void RefreshLaunchTerrainClearance() {
        _launchTerrainClearance =
            _carrier is { Kind: Carrier.PlatformKind.FixedArrestingStrip }
                && _beat.StartsOnCatapult
                ? _catapult.AssessTerrainClearance(
                    _carrier,
                    _terrainSurface,
                    RapierLaunchSite.AircraftHalfSpanM)
                : new LaunchTerrainClearanceAssessment(
                    TerrainAvailable: _terrainSurface is not null,
                    Safe: true,
                    MinimumRailClearanceM: double.PositiveInfinity,
                    MinimumReleaseClearanceM: double.PositiveInfinity,
                    Samples: 0,
                    Reason: "not-required");
    }

    /// <summary>Construct and stage one of the built-in beats. Physics remains held in Ready.</summary>
    public void StartBeat(int index,
        Carrier.DeckConfiguration deckConfiguration = Carrier.DeckConfiguration.Axial) {
        if (index is < 1 or > 11) index = 1;
        _prechargeSystemsOnStage = true;
        _beatIndex = index;
        _deckConfiguration = deckConfiguration;
        _beatFactory = () => Beats.BuiltIn(index, deckConfiguration);
        _fightDirector.Reset();
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
        _fightDirector.Reset();
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
        RefreshLaunchTerrainClearance();
        if (_carrier is { Kind: Carrier.PlatformKind.FixedArrestingStrip }
            && _beat.StartsOnCatapult
            && _terrainSurface is not null
            && !_launchTerrainClearance.Safe) {
            ShowTransition("LAUNCH INHIBIT · TERRAIN CLEARANCE", 4000.0);
            return;
        }
        ClearHeldInput();
        if (_carrier is not null) {
            // StageBeat previews these exact conditions so the aircraft and deck can be rendered in
            // Ready. The attempt is consumed only here, at the authoritative clock-release edge.
            _difficulty = _recoveryProgress.BeginAttempt();
            _carrier.ApplyDifficulty(_difficulty);
            _recoveryAttemptActive = true;
        }
        // A catapult start belongs at the clock-release edge for the same reason the recovery
        // attempt does: Ready must be able to render the aircraft sitting on the deck without the
        // stroke having begun.
        if (_carrier is not null && _beat.StartsOnCatapult && !_catapult.IsActive) {
            _catapult.Begin(_carrier, _player.State.Mass);
            _detents.ApproachMode = false;
        }
        _maintenanceScenario?.Begin(TimeSeconds);
        _droneRaidEvaluation?.Begin(TimeSeconds, _gunKill.RoundsFired);
        _droneRaidEvaluation?.Step(TimeSeconds, _player.State, _bandit.State,
            _gunKill.GunSolution, _gunKill.RoundsFired);
        // Announce the power the lever is ACTUALLY on, not the beat's authored setting. A beat that
        // opts into StageAtTrimThrottle arrives at the setting that holds its staged fighting speed
        // — typically well below MIL — so reading InitialThrottle here told the pilot "MIL SET"
        // while the jet sat at a low cruise power. The cue exists to save them a setup, which it
        // can only do if it is true.
        if (_carrier is null && _beat.PlayerAir.ThrustMaxN > 0.0) {
            if (_detents.Throttle >= 0.995) ShowTransition("MIL SET · FIGHT", 1800.0);
            else if (_beat.StageAtTrimThrottle) ShowTransition("PWR SET · FIGHT", 1800.0);
        }
        Lifecycle = LifecycleState.Active;
        UpdateTimeCompressionDecision();
    }

    /// <summary>Pause or resume an active sortie. Ready remains Ready until Begin is explicit.</summary>
    public void SetPaused(bool paused) {
        if (paused && Lifecycle == LifecycleState.Active) {
            ClearHeldInput();
            Lifecycle = LifecycleState.Paused;
        } else if (!paused && Lifecycle == LifecycleState.Paused) {
            Lifecycle = LifecycleState.Active;
        }
        UpdateTimeCompressionDecision();
    }

    /// <summary>
    /// Pilot authority over automatic transit compression. Disabling is an immediate kernel
    /// boundary: any unspent fast-time credit is discarded before another fixed tick can run.
    /// </summary>
    public void SetTimeCompressionEnabled(bool enabled) {
        _timeCompressionPilotEnabled = enabled;
        if (!enabled) _timeCompressionAccumulatorSeconds = 0.0;
        UpdateTimeCompressionDecision();
    }

    public bool ToggleTimeCompression() {
        SetTimeCompressionEnabled(!_timeCompressionPilotEnabled);
        return _timeCompressionPilotEnabled;
    }

    void RequestCombatHandoff() {
        if (!CombatHandoffAvailable) return;

        _combatHandoffPhase = CombatHandoffPhase.Requested;
        // Successor suppression is authoritative on the input edge, before another fixed tick can
        // observe an expired replacement timer.
        _nextOpponentSpawnAtMs = double.NegativeInfinity;
        Trigger(false);
        _gunneryPitchAssistState = GunneryPitchAssistState.Inactive();
        _banditPadlockRollAssistSelected = false;
        _banditPadlockRollAssistTargetSequence = 0;
        _padlockRollAssist.Reset();
        ClearFormationCoordination();
        CompleteInterruptedEngagementForHandoff();
        ShowTransition("KNOCK IT OFF · RELIEF INBOUND", 2800.0);
    }

    /// <summary>
    /// Move handoff authority only at a fixed-tick boundary. Each public phase is held for at
    /// least one production tick, which makes replay, presentation and tests observe the same
    /// monotonic sequence regardless of host input batching.
    /// </summary>
    void AdvanceCombatHandoffAtTickBoundary() {
        switch (_combatHandoffPhase) {
            case CombatHandoffPhase.Requested:
                SpawnReliefAndRetargetOpponents();
                _combatHandoffPhase = CombatHandoffPhase.Drain;
                return;

            case CombatHandoffPhase.Drain:
                // Enemy old rounds already remain in their player-bound retired guns. Only the
                // player's gun owns enemy damage, so its rounds are the atomic-transfer boundary.
                if (_gunKill.RoundsInFlight.Count != 0) return;
                ArmReliefGunFromPlayerDamage();
                _combatHandoffPhase = CombatHandoffPhase.ReliefEngaged;
                ShowTransition("RELIEF HAS THE FIGHT · RETURN TO BASE", 3200.0);
                return;

            case CombatHandoffPhase.ReliefEngaged:
                _combatHandoffPhase = CombatHandoffPhase.PlayerRtb;
                return;

            case CombatHandoffPhase.PlayerRtb:
                if (LiveOpponentCount == 0) {
                    _combatHandoffPhase = CombatHandoffPhase.ReliefComplete;
                    ShowTransition("RELIEF COMPLETE · CONTINUE RTB", 2600.0);
                } else if (_reliefFighter is null || !_reliefFighter.StillFighting) {
                    _combatHandoffPhase = CombatHandoffPhase.ReliefLost;
                    ShowTransition("RELIEF LOST · CONTINUE RTB", 3000.0);
                }
                return;
        }
    }

    void SpawnReliefAndRetargetOpponents() {
        if (LiveOpponentCount <= 0) return;

        AircraftState target = SelectedOpponentAlive
            ? SelectedOpponentState
            : _bandit.State;
        int deterministicSeed = Math.Max(1, _engagementNumber * 4 + 1);
        double reliefSpeedMps = Math.Max(
            180.0,
            BeatSetup.CornerTrueAirspeedMps(
                _beat.PlayerAir, target.Position.Y));
        ReactiveBandit actor = ReactiveBandit.SpawnForMerge(
            target,
            _beat.PlayerAir,
            deterministicSeed,
            reliefSpeedMps,
            PilotSkill.Ace,
            _terrainSurface);
        actor.Wind = _player.Wind;
        actor.Atmosphere = _player.AtmosphereModel;
        long spawnSequence = ++_reliefSpawnSequence;
        _reliefFighter = new ReliefFighter(actor, spawnSequence);
        ConfigureLookaheadCadence(actor, 2_000_000L + spawnSequence);
        _reliefThreatState = actor.State;
        _reliefThreatStateValid = true;

        RetargetOpponentGun(
            _primaryOpponentGunTargetId, _bandit, _opponentGun);
        foreach (Wingman wingman in _wingmen) {
            if (!wingman.StillFighting) continue;
            RetargetOpponentGun(
                wingman.PlayerGunTargetId, wingman.Bandit, wingman.Gun);
        }
    }

    void RetargetOpponentGun(long enemyTargetId, IBandit shooter, GunKill sourceGun) {
        if (sourceGun.Outcome != FightOutcome.Flying) return;
        if (sourceGun.RoundsInFlight.Count > 0)
            _retiredOpponentGuns.Add(new RetiredOpponentGun(shooter, sourceGun));
        GunKill reliefTargetingGun = sourceGun.CreateForRetargetedTarget();
        _reliefTargetingOpponentGuns[enemyTargetId] =
            new ReliefTargetingOpponentGun(shooter, reliefTargetingGun);
    }

    List<long> LiveOpponentTargetIds() {
        var targetIds = new List<long>(1 + _wingmen.Count);
        if (_opponentTerminalState == AircraftTerminalState.Flying
            && !_bandit.CatastrophicallyDamaged)
            targetIds.Add(_primaryOpponentGunTargetId);
        foreach (Wingman wingman in _wingmen) {
            if (wingman.StillFighting)
                targetIds.Add(wingman.PlayerGunTargetId);
        }
        return targetIds;
    }

    void ArmReliefGunFromPlayerDamage() {
        if (_reliefFighter is not { StillFighting: true } relief) return;
        List<long> liveTargetIds = LiveOpponentTargetIds();
        if (liveTargetIds.Count == 0) return;
        long selectedTargetId = liveTargetIds.Contains(_selectedPlayerGunTargetId)
            ? _selectedPlayerGunTargetId
            : liveTargetIds[0];
        CombatConfig combat = _beat.CombatRules;
        relief.Gun = _gunKill.CreateForFreshShooterAgainstTargets(
            liveTargetIds,
            selectedTargetId,
            combat.PlayerAmmo,
            combat.PlayerGunProfile.EffectiveHitRadiusM,
            combat.PlayerGunProfile);
    }

    /// <summary>
    /// Narrow integration hook for the future conventional-runway authority. It records only the
    /// already-validated recovery transition; runway contact and sortie completion remain owned by
    /// that physical recovery model. Repeated completion is idempotently successful.
    /// </summary>
    public bool CompletePlayerRecovery() {
        if (_combatHandoffPhase == CombatHandoffPhase.Recovered) return true;
        if (!PlayerRtbActive
            || Lifecycle != LifecycleState.Active
            || _playerTerminalState != AircraftTerminalState.Flying)
            return false;
        _combatHandoffPhase = CombatHandoffPhase.Recovered;
        return true;
    }

    public void SetRapierAutomationEnabled(bool enabled) {
        if (!RapierMissionAvailable) return;
        _rapierAutomationEnabled = enabled;
        _rapierManualOverrideUntilMs = double.NegativeInfinity;
        ShowTransition(enabled
            ? "MISSION AUTOMATION ENGAGED"
            : "PILOT HAS FLIGHT CONTROLS", 1800.0);
    }

    public bool ToggleRapierAutomation() {
        SetRapierAutomationEnabled(!RapierAutomationEnabled);
        return RapierAutomationEnabled;
    }

    void ClaimRapierControl() {
        if (!RapierAutomationEnabled) return;
        SetRapierAutomationEnabled(false);
    }

    public void SetVariant(ValleyVariant variant) {
        _requestedVariant = variant;
        if (_carrier is null) _detents.Variant = variant;
    }

    /// <summary>
    /// Apply presentation-measured compute pressure to throwaway opponent forecasts. Fixed-tick
    /// flight, guns, damage, terrain recovery, candidate count, and forecast horizon stay
    /// authoritative; coarser forecast integration may select a different candidate maneuver.
    /// The selected level is explicit input so an identical level tape remains replayable.
    /// </summary>
    public void SetAiComputeLevel(AiComputeLevel level) {
        if (!Enum.IsDefined(level))
            throw new ArgumentOutOfRangeException(nameof(level));
        _aiComputeLevel = level;
        // Calling this host boundary is also the explicit opt-in to amortized lookahead. Session
        // consumers which never supply presentation pressure retain the historical synchronous
        // policy boundary, including tick-zero decision-recording semantics. The browser calls
        // this even for Full, so production still receives bounded per-tick forecast work.
        _incrementalAiPlanningEnabled = true;
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

    /// <summary>
    /// Pilot taps the GUNS SAFE annunciation: release the first-pass weapons hold and arm the
    /// gun. Subject to the same ownership boundaries as any pilot actuation — no reanimating a
    /// destroyed ownship and no acting through a G-LOC control interlock.
    /// </summary>
    public void ReleaseWeaponsHold() {
        if (Lifecycle != LifecycleState.Active) return;
        if (_playerTerminalState != AircraftTerminalState.Flying) return;
        if (_pilotControlInterlocked) return;
        _visualMergeEvaluation?.ReleaseFirstPassHold();
    }

    public bool LaunchRapierShortRangeMissile() {
        ScriptedInterceptConfig? config = _beat.ScriptedIntercept;
        if (config is null
            || Lifecycle != LifecycleState.Active
            || _playerTerminalState != AircraftTerminalState.Flying
            || _opponentTerminalState != AircraftTerminalState.Flying
            || _rapierMissilesRemaining <= 0
            || _rapierMissileInFlight
            || !PlayerWeaponsAuthorized)
            return false;

        Vec3D toTarget = _bandit.State.Position - _player.State.Position;
        double rangeM = toTarget.Length;
        if (rangeM < config.MissileMinimumRangeM
            || rangeM > config.MissileMaximumRangeM
            || rangeM <= 1e-6)
            return false;
        double noseAlignment = _player.BodyForward.Dot(toTarget * (1.0 / rangeM));
        if (noseAlignment < 0.72) return false;

        _rapierMissilesRemaining--;
        _rapierMissileInFlight = true;
        _rapierMissileTargetSequence = _banditSpawnSequence;
        // A bounded proportional-navigation surrogate: the missile remains a timed physical
        // commitment rather than an instant delete, while the target's detailed countermeasures
        // and seeker are explicitly outside this public-data mission.
        double flightSeconds = Math.Clamp(rangeM / 820.0, 0.75, 18.0);
        _rapierMissileImpactAtMs = _simTimeMs + flightSeconds * 1000.0;
        ShowTransition(
            $"FOX TWO · IMPACT {flightSeconds:F1} S · {_rapierMissilesRemaining} REMAIN",
            1800.0);
        return true;
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
        if (pressed && IsPilotActuatedAction(key))
            DisengageTimeCompression(TimeCompressionInhibitReason.ControlInput);
        if (pressed && key is GKey.PullUp or GKey.PushDown
            or GKey.RollLeft or GKey.RollRight
            or GKey.RudderLeft or GKey.RudderRight
            or GKey.ThrottleUp or GKey.ThrottleDown
            or GKey.Override or GKey.AutoGcasOverride)
            ClaimRapierControl();
        bool newPress = pressed && _keys.PhaseAt(key, _simTimeMs) == KeyPhase.Idle;
        _keys.Feed(key, pressed, _simTimeMs);
        if (key == GKey.KnockItOff && newPress)
            RequestCombatHandoff();
        // Weapon release is an edge-triggered cockpit action. Latch a deliberate Rapier F tap so
        // a very short browser key-down/key-up pair cannot fall entirely between fixed ticks.
        if (key == GKey.Trigger && newPress && RapierPhase == RapierMissionPhase.Attack)
            _rapierFormationSweepRequested = true;
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
        if (pressed) {
            DisengageTimeCompression(TimeCompressionInhibitReason.ControlInput);
            ClaimRapierControl();
        }
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
        if (Math.Abs(value) > 0.02) {
            DisengageTimeCompression(TimeCompressionInhibitReason.ControlInput);
            ClaimRapierControl();
        }
        _detents.SetAnalogRollControl(value);
    }

    /// <summary>
    /// Select which concurrent opponent owns the player's lead solution. This changes sighting
    /// only: the physical gun, heat, cadence, magazine, and every round in flight remain one
    /// continuous weapon. Slot zero is the primary; slots one onward mirror Wingmen order.
    /// </summary>
    public bool SetPlayerGunTargetSlot(int slot) {
        if (slot < 0) return false;

        long requestedId;
        if (slot == 0) {
            requestedId = _primaryOpponentGunTargetId;
        } else {
            int wingmanIndex = slot - 1;
            if (wingmanIndex >= _wingmen.Count) return false;
            requestedId = _wingmen[wingmanIndex].PlayerGunTargetId;
        }

        if (!IsPlayerGunTargetLive(requestedId)) {
            EnsureSelectedPlayerGunTarget();
            return false;
        }
        SelectPlayerGunTarget(requestedId);
        return true;
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
        DisengageTimeCompression(TimeCompressionInhibitReason.ControlInput);
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
        or GKey.Override or GKey.AutoGcasOverride or GKey.KnockItOff
        || IsPlayerSystemsAction(key);

    bool KeyActive(GKey key) =>
        _keys.PhaseAt(key, _simTimeMs) != KeyPhase.Idle;

    bool HasControlInputBeyondTrim() {
        PilotCommand command = _detents.Command;
        return KeyActive(GKey.PullUp)
            || KeyActive(GKey.PushDown)
            || KeyActive(GKey.RollLeft)
            || KeyActive(GKey.RollRight)
            || KeyActive(GKey.RudderLeft)
            || KeyActive(GKey.RudderRight)
            || KeyActive(GKey.ThrottleUp)
            || KeyActive(GKey.ThrottleDown)
            || KeyActive(GKey.Trigger)
            || KeyActive(GKey.Override)
            || KeyActive(GKey.AutoGcasOverride)
            || KeyActive(GKey.GearToggle)
            || KeyActive(GKey.FlapUp)
            || KeyActive(GKey.FlapDown)
            || KeyActive(GKey.EmergencyGearRelease)
            || _triggerDown
            || _assistedFlight
            || _banditPadlockRollAssistSelected
            || _padlockRollAssist.State.Active
            || _gunneryPitchAssistState.Active
            || command.EnvelopeOverride
            // The detent layer's filtered baseline starts below 1 G and converges to trim after
            // staging. That is internal control-law settling, not pilot input. Non-baseline tiers
            // still catch tap/hold demands after their raw key edge has gone idle.
            || (_detents.Tier != DemandTier.Baseline
                && Math.Abs(command.GDemand - 1.0) > 0.03)
            || Math.Abs(command.RollControl) > 0.02
            || Math.Abs(command.Rudder) > 0.02
            || double.IsFinite(command.CommandedPitchRad)
            || double.IsFinite(command.CommandedAlphaRad);
    }

    bool ContactInsideLedThreatRange(in AircraftState contact) {
        AircraftState player = _player.State;
        Vec3D separation = contact.Position - player.Position;
        double rangeM = separation.Length;
        if (!double.IsFinite(rangeM) || rangeM < 1e-6) return true;
        Vec3D relativeVelocity = contact.VelocityVector() - player.VelocityVector();
        double closingMps = -separation.Dot(relativeVelocity) / rangeM;
        double ledRangeM = TimeCompressionPolicy.ThreatRangeM
            + Math.Max(0.0, closingMps) * TimeCompressionPolicy.BoundaryLeadSeconds;
        return rangeM <= ledRangeM;
    }

    bool HasContactThreat() {
        if (_opponentTerminalState == AircraftTerminalState.Flying
            && ContactInsideLedThreatRange(_bandit.State))
            return true;
        foreach (Wingman wingman in _wingmen) {
            if (wingman.StillFighting
                && ContactInsideLedThreatRange(wingman.Bandit.State))
                return true;
        }
        return false;
    }

    bool HasFuelThresholdOrLead() {
        if (!_fuel.ConsumesFuel) return false;
        if (_fuel.IsJoker || _fuel.IsBingo
            || _fuel.IsMinimumFuel || _fuel.IsEmergencyFuel)
            return true;
        double leadBurnLb = Math.Max(0.0, _fuel.BurnLbPerMinute)
            * TimeCompressionPolicy.BoundaryLeadSeconds / 60.0;
        bool AtOrNear(double? threshold) => threshold is { } value
            && _fuel.FuelLb <= value + leadBurnLb;
        return AtOrNear(_fuel.JokerThresholdLb)
            || AtOrNear(_fuel.BingoThresholdLb)
            || AtOrNear(_fuel.MinimumFuelThresholdLb)
            || AtOrNear(_fuel.EmergencyFuelThresholdLb);
    }

    bool HasAutoGcasActivityOrLead() {
        if (_autoGcasState.Active || _autoGcasState.Warning) return true;
        AutoGcasPrediction prediction = _autoGcasState.Prediction;
        return prediction.Valid
            && (prediction.TimeAvailableToAvoidGroundImpactSeconds
                    <= TimeCompressionPolicy.BoundaryLeadSeconds
                || prediction.PilotViolationTimeSeconds
                    <= TimeCompressionPolicy.BoundaryLeadSeconds);
    }

    bool HasRamTransitionLead() {
        if (_beat.PlayerAir.PropulsionModel
            != PropulsionModelKind.TurboRamjetPublicDataSurrogate)
            return false;
        if (TransitionCueActive
            && (_transitionCue.StartsWith("RAM ", StringComparison.Ordinal)
                || _transitionCue.StartsWith("FULL RAM", StringComparison.Ordinal)
                || _transitionCue.StartsWith("TURBINE ", StringComparison.Ordinal)))
            return true;
        double mach = _player.AirspeedMps
            / _player.AtmosphereModel.Sample(_player.State.Position.Y).SpeedOfSoundMps;
        double nextBoundary = _ramCueStage switch {
            0 => Propulsion.TurboRamjetPerformanceMap.RamFadeStartMach,
            1 => Propulsion.TurboRamjetPerformanceMap.FullRamMach,
            2 => Propulsion.TurboRamjetPerformanceMap.TurbineGoneMach,
            _ => double.PositiveInfinity
        };
        return mach >= nextBoundary - TimeCompressionPolicy.RamBoundaryLeadMach;
    }

    bool IsEstablishedTransit() {
        AircraftState state = _player.State;
        double clearanceM = state.Position.Y;
        if (_terrainSurface is not null && _terrainSurface.TrySample(
            state.Position.X, state.Position.Z, out TerrainSample terrain))
            clearanceM -= terrain.HeightM;
        double mach = _player.AirspeedMps
            / _player.AtmosphereModel.Sample(state.Position.Y).SpeedOfSoundMps;
        bool stableAttitude = Math.Abs(state.Bank) <= 12.0 * Math.PI / 180.0
            && Math.Abs(state.BodyRates.P) <= 3.0 * Math.PI / 180.0
            && Math.Abs(state.BodyRates.Q) <= 3.0 * Math.PI / 180.0
            && Math.Abs(state.BodyRates.R) <= 3.0 * Math.PI / 180.0;
        bool establishedClimb = state.Gamma >= 0.5 * Math.PI / 180.0
            && state.Gamma <= 35.0 * Math.PI / 180.0
            && clearanceM >= 250.0
            && _player.AirspeedMps >= 120.0;
        bool establishedCruise = Math.Abs(state.Gamma) <= 6.0 * Math.PI / 180.0
            && clearanceM >= 2_500.0
            && mach >= 1.2;
        return stableAttitude && !_detents.ApproachMode
            && (establishedClimb || establishedCruise);
    }

    bool RapierReturnTransit =>
        _beat.ScriptedIntercept is not null
        && _playerTerminalState == AircraftTerminalState.Flying
        && _opponentTerminalState != AircraftTerminalState.Flying
        && !_wingmen.Any(static wingman => wingman.StillFighting)
        && RapierPhase is RapierMissionPhase.ReturnToBase
            or RapierMissionPhase.Recovery;

    TimeCompressionSafetyState CaptureTimeCompressionSafety() => new(
        PilotEnabled: _timeCompressionPilotEnabled,
        SupportedSortie: TimeCompressionAvailable,
        SessionActive: Lifecycle == LifecycleState.Active
            && (!TerminalPhaseActive || RapierReturnTransit),
        EstablishedTransit: IsEstablishedTransit(),
        CatapultOrConfigurationTransition: _catapult.IsActive
            || ConfigurationTransitionActive,
        ContactInsideLedThreatRange: HasContactThreat(),
        GunSolutionInEitherDirection: _gunKill.GunSolution
            || _gunKill.InstantaneousGunSolution
            || _opponentGun.GunSolution
            || _opponentGun.InstantaneousGunSolution
            || _gunKill.RoundsInFlight.Count > 0
            || _opponentGun.RoundsInFlight.Count > 0
            || _retiredOpponentGuns.Any(static retired =>
                retired.Gun.RoundsInFlight.Count > 0)
            || _wingmen.Any(static wingman =>
                wingman.Gun.GunSolution
                || wingman.Gun.InstantaneousGunSolution
                || wingman.Gun.RoundsInFlight.Count > 0),
        AutoGcasActivityOrLead: HasAutoGcasActivityOrLead(),
        DamagePresent: PlayerHitsTaken > 0
            || _playerTerminalState != AircraftTerminalState.Flying
            || (!RapierReturnTransit
                && (_gunKill.TotalHitCount > 0
                    || _bandit.CatastrophicallyDamaged
                    || _opponentTerminalState != AircraftTerminalState.Flying)),
        FuelThresholdOrLead: HasFuelThresholdOrLead(),
        ControlInputBeyondTrim: HasControlInputBeyondTrim(),
        RamTransitionLead: HasRamTransitionLead());

    void UpdateTimeCompressionDecision() {
        if (_beat is null || _player is null || _bandit is null
            || _fuel is null || _keys is null || _detents is null) {
            _timeCompressionFactor = 1;
            _timeCompressionInhibitReason =
                TimeCompressionInhibitReason.SessionInactive;
            return;
        }
        _timeCompressionInhibitReason =
            TimeCompressionPolicy.Evaluate(CaptureTimeCompressionSafety());
        _timeCompressionFactor =
            _timeCompressionInhibitReason == TimeCompressionInhibitReason.None
                ? Math.Clamp(_timeCompressionHostMaximumFactor,
                    1, TimeCompressionRequestedFactor)
                : 1;
        if (_timeCompressionFactor == 1)
            _timeCompressionAccumulatorSeconds = 0.0;
    }

    void DisengageTimeCompression(TimeCompressionInhibitReason reason) {
        _timeCompressionFactor = 1;
        _timeCompressionInhibitReason = reason;
        _timeCompressionAccumulatorSeconds = 0.0;
    }

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
    public void Advance(double elapsedSeconds) => Advance(elapsedSeconds, 1);

    /// <summary>
    /// Advance from real elapsed time while allowing the presentation host to offer a measured-cost
    /// compression ceiling. The host cannot engage compression: the kernel evaluates safety and
    /// owns the reported factor. Fast time is additional production ticks at FixedDeltaSeconds,
    /// never a larger dt. Safety is re-evaluated after every tick and unused fast-time credit is
    /// discarded on the first hand-back boundary.
    /// </summary>
    /// <returns>The kernel-selected factor at the start of this call.</returns>
    public int Advance(double elapsedSeconds, int maximumCompressionFactor) {
        if (!double.IsFinite(elapsedSeconds) || elapsedSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(elapsedSeconds));
        if (maximumCompressionFactor < 1)
            throw new ArgumentOutOfRangeException(nameof(maximumCompressionFactor));
        _timeCompressionHostMaximumFactor = Math.Clamp(
            maximumCompressionFactor, 1, TimeCompressionPolicy.PreferredFactor);
        UpdateTimeCompressionDecision();
        int selectedFactor = _timeCompressionFactor;
        if (Lifecycle != LifecycleState.Active) return selectedFactor;

        _accumulatorSeconds = Math.Min(_accumulatorSeconds + elapsedSeconds, 0.25);
        if (selectedFactor > 1)
            _timeCompressionAccumulatorSeconds += elapsedSeconds * (selectedFactor - 1);
        while (_accumulatorSeconds >= FixedDeltaSeconds
            && Lifecycle == LifecycleState.Active) {
            _accumulatorSeconds -= FixedDeltaSeconds;
            RunFixedTick();
        }
        while (_timeCompressionAccumulatorSeconds >= FixedDeltaSeconds
            && Lifecycle == LifecycleState.Active
            && _timeCompressionFactor > 1) {
            _timeCompressionAccumulatorSeconds -= FixedDeltaSeconds;
            RunFixedTick();
        }
        if (Lifecycle != LifecycleState.Active) {
            _accumulatorSeconds = 0.0;
            _timeCompressionAccumulatorSeconds = 0.0;
        } else if (_timeCompressionFactor == 1) {
            _timeCompressionAccumulatorSeconds = 0.0;
        }
        return selectedFactor;
    }

    /// <summary>Run exactly one production tick when Active. Ready and Paused are stable holds.</summary>
    public void StepFixed() {
        if (Lifecycle == LifecycleState.Active) RunFixedTick();
    }

    /// <summary>
    /// Run an exact number of ordinary production ticks in one call. This is the batch seam used
    /// by determinism verification: it deliberately delegates to the identical RunFixedTick path.
    /// </summary>
    public void StepFixed(int tickCount) {
        if (tickCount < 0) throw new ArgumentOutOfRangeException(nameof(tickCount));
        for (int i = 0; i < tickCount && Lifecycle == LifecycleState.Active; i++)
            RunFixedTick();
    }

    void StepRapierMissile() {
        if (!_rapierMissileInFlight || _simTimeMs < _rapierMissileImpactAtMs) return;
        _rapierMissileInFlight = false;
        _rapierMissileImpactAtMs = double.PositiveInfinity;
        if (_rapierMissileTargetSequence != _banditSpawnSequence
            || _opponentTerminalState != AircraftTerminalState.Flying)
            return;
        EmitEvent(SessionEventType.Hit,
            CombatRole.Player, CombatRole.Opponent, count: 1);
        _killCount++;
        ShowTransition("MISSILE HIT · FORMATION CONTACT DOWN", 2200.0);
        BeginCatastrophicDamage(CombatRole.Opponent, CombatRole.Player);
    }

    bool ExecuteRapierFormationSweep() {
        ScriptedInterceptConfig? config = _beat.ScriptedIntercept;
        if (config is null
            || RapierPhase != RapierMissionPhase.Attack
            || Lifecycle != LifecycleState.Active
            || _playerTerminalState != AircraftTerminalState.Flying
            || _rapierDogfightingDronesRemaining <= 0
            || LiveOpponentCount <= 0)
            return false;

        if (config.DeterministicSwarmWipe) {
            if (_rapierFormationSweepCommitted) return false;
        } else if (_rapierGunDrone is { StillActive: true }) {
            return false;
        }

        if (config.DeterministicSwarmWipe) {
            _rapierFormationSweepCommitted = true;
            _rapierMissilesRemaining = 0;
            _rapierDogfightingDronesRemaining = 0;
            _rapierMissileInFlight = false;
            _rapierMissileImpactAtMs = double.PositiveInfinity;

            foreach (Wingman wingman in _wingmen) {
                if (!wingman.StillFighting) continue;
                wingman.Bandit.ApplyCatastrophicDamage(handedness: -1);
                _killCount++;
                EmitEvent(SessionEventType.Hit,
                    CombatRole.Player, CombatRole.Opponent, count: 1);
                EmitEvent(SessionEventType.Destroyed,
                    CombatRole.Player, CombatRole.Opponent);
            }

            if (_opponentTerminalState == AircraftTerminalState.Flying) {
                _killCount++;
                EmitEvent(SessionEventType.Hit,
                    CombatRole.Player, CombatRole.Opponent, count: 1);
                BeginCatastrophicDamage(CombatRole.Opponent, CombatRole.Player);
            }

            _rapierPursuitActive = config.PursuerCount > 0;
            _rapierPursuitRangeM = Math.Max(0.0, config.PursuitInitialRangeM);
            UpdateRapierMissionGuidance();
            ShowTransition(
                $"GUN-DRONE SWARM RELEASED · FORMATION DESTROYED · "
                    + $"{config.PursuerCount} PURSUERS IN TRAIL · RUN HOME",
                4200.0);
            RefreshPlayerMass();
            return true;
        }

        _rapierDogfightingDronesRemaining--;
        _rapierGunDrone = RapierGunDrone.SpawnFrom(
            _player.State, _player.AtmosphereModel);
        _rapierGunDroneSpawnSequence++;
        _rapierGunDrone.Sim.Wind = _player.Wind;
        _rapierGunDroneEgress = true;
        PromoteBanditsAgainstGunDrone();
        UpdateRapierMissionGuidance();
        RefreshPlayerMass();
        ShowTransition(
            $"GUN-DRONE AWAY · {_rapierDogfightingDronesRemaining} REMAINING · EGRESS HOME",
            4200.0);
        return true;
    }

    void PromoteBanditsAgainstGunDrone() {
        if (_bandit is not RailBandit) return;
        AircraftState state = _bandit.State;
        var reactive = new ReactiveBandit(
            state, _beat.BanditAir, _beat.BanditSkill, _terrainSurface);
        reactive.Wind = _bandit.Wind;
        reactive.Atmosphere = _bandit.Atmosphere;
        // Release and rail-to-reactive promotion happen inside StepCore, after the ordinary
        // beginning-of-tick configuration pass. Configure this new actor before its first
        // same-tick step so a browser-budgeted sortie can never pay one synchronous rollout.
        reactive.ConfigureAiPlanning(
            _aiComputeLevel, _incrementalAiPlanningEnabled);
        _bandit = reactive;
        _banditSpawnSequence++;
        _rapierGunDroneThreatReactive = true;
    }

    void StepRapierGunDrone(in AircraftState banditState, bool banditAlive) {
        if (_rapierGunDrone is not { StillActive: true } drone) return;

        Vec3D pickup = RapierGunDrone.PickupPoint(_carrier?.Position ?? Vec3D.Zero);
        drone.Step(FixedDeltaSeconds, banditAlive ? banditState : null,
            banditAlive, pickup);

        if (banditAlive
            && drone.Phase == RapierGunDronePhase.Commit
            && drone.Gun.AmmoRemaining > 0) {
            bool trigger = true;
            drone.Gun.Step(trigger, drone.Sim.State, banditState, FixedDeltaSeconds);
            if (drone.Gun.HitsThisStep > 0)
                EmitEvent(SessionEventType.Hit, CombatRole.Player, CombatRole.Opponent,
                    drone.Gun.HitsThisStep);
            if (drone.Gun.Outcome == FightOutcome.Splash) {
                _killCount++;
                BeginCatastrophicDamage(CombatRole.Opponent, CombatRole.Player);
            }
        }
    }

    ActorObservation ThreatObservationFor(
        in AircraftState playerState, in AircraftState banditState) {
        if (_rapierGunDrone is { StillActive: true } drone
            && drone.InsideThreatVolume(banditState))
            return ActorObservation.Capture(
                drone.Sim.State,
                _tick,
                contactIdentity: PolicyContactIdentity(
                    _rapierGunDroneSpawnSequence,
                    PolicyContactClass.RapierGunDrone));
        if (CombatHandoffRequested
            && _reliefFighter is { } relief
            && _reliefThreatStateValid)
            return ActorObservation.Capture(
                _reliefThreatState,
                _tick,
                contactIdentity: PolicyContactIdentity(
                    relief.SpawnSequence,
                    PolicyContactClass.ReliefFighter));
        return ObservePlayer(playerState);
    }

    void StepRapierPursuit() {
        ScriptedInterceptConfig? config = _beat.ScriptedIntercept;
        if (!_rapierPursuitActive || config is null) return;

        AtmosphericState air = _player.AtmosphereModel.Sample(_player.State.Position.Y);
        double pursuerSpeedMps = Math.Max(0.0, config.PursuerMach)
            * Math.Max(1.0, air.SpeedOfSoundMps);
        double openingSpeedMps = Math.Max(
            -120.0, _player.AirspeedMps - pursuerSpeedMps);
        _rapierPursuitRangeM = Math.Max(
            3_000.0, _rapierPursuitRangeM + openingSpeedMps * FixedDeltaSeconds);

        if (_rapierPursuitRangeM < config.PursuitEscapeRangeM) return;
        _rapierPursuitActive = false;
        ShowTransition(
            $"PURSUIT BROKEN · {_rapierPursuitRangeM / 1000.0:F0} KM · RECOVER RAPIER",
            3500.0);
    }

    void UpdateRapierMissionGuidance() {
        if (_rapierMissionDirector is null || _carrier is null) return;
        // A 16 km initial on the 3.5-degree recovery plane. The old 2,500 m point demanded an
        // avoidable 9-degree dive just as the aircraft was trying to configure and slow.
        Vec3D recoveryInitial = _carrier.LandingPoint(along: -16_000.0, height: 1_000.0);
        bool recovered = _arrestment.Phase == ArrestmentModel.ArrestmentPhase.Stopped;
        bool patternOnly = _beat.ScriptedIntercept?.PatternOnly == true;
        // Circuits overhead is authored in the landing frame so OFT LandingPoint cards and
        // threshold padlock share the same home as INITIAL / BREAK / DOWNWIND geometry.
        Vec3D home = patternOnly ? _carrier.LandingPoint(0.0) : _carrier.Position;
        _rapierMissionGuidance = _rapierMissionDirector.Step(
            _player.State,
            _bandit.State,
            _player.AirspeedMps,
            _player.AtmosphereModel,
            _beat.PlayerAir,
            _catapult.IsActive,
            LiveOpponentCount,
            _rapierPursuitActive,
            RapierPursuerCount,
            _rapierPursuitRangeM,
            home,
            recoveryInitial,
            recovered,
            patternOnly: patternOnly,
            zoomLobProfile: _beat.ScriptedIntercept?.ZoomLobProfile == true,
            gunDroneEgress: _rapierGunDroneEgress,
            job: _beat.ScriptedIntercept?.Job ?? RapierJobKind.FormationIntercept,
            noseOnVelocityErrorDeg: _player.NoseOnVelocityErrorDeg,
            fuelLb: _fuel.FuelLb,
            reserveFuelLb: _fuel.JokerThresholdLb ?? _fuel.BingoThresholdLb,
            aircraftSupportReferenceHeightM:
                _carrier.AircraftSupportReferenceHeightM);
        if (patternOnly) {
            _circuitTraffic = CircuitPatternTraffic.Evaluate(
                TimeSeconds, home, recoveryInitial, count: 3);
            _circuitComms = CircuitPatternTraffic.CommsLine(
                _circuitTraffic, RapierCircuitLeg, TimeSeconds);
            MaybeInjectCircuitsFault();
        } else {
            _circuitTraffic = System.Array.Empty<CircuitTrafficShip>();
            _circuitComms = "";
        }
    }

    public void SetCircuitsCleanMode(bool clean) {
        _circuitsCleanMode = clean;
        if (clean) _circuitsNextFaultAtMs = double.PositiveInfinity;
        else ScheduleNextCircuitsFault();
    }

    public void SetCircuitsFaultArmed(bool armed) {
        _circuitsFaultArmed = armed;
        if (!armed) _circuitsNextFaultAtMs = double.PositiveInfinity;
        else if (!_circuitsCleanMode) ScheduleNextCircuitsFault();
    }

    public void InduceCircuitsUtilityFault() {
        if (_beat.ScriptedIntercept?.PatternOnly != true) return;
        _systems.SetFailure(AirframeSystemFailure.UtilityHydraulicPump, true);
        _systems.SetFailure(AirframeSystemFailure.UtilityHydraulicLeak, true);
        ShowTransition("CIRCUITS · UTILITY HYDRAULIC FAILURE", 3200.0);
        ScheduleNextCircuitsFault();
    }

    void ScheduleNextCircuitsFault() {
        _circuitsNextFaultAtMs = _simTimeMs + 90_000.0 + (_engagementNumber * 17 % 90) * 1_000.0;
    }

    void MaybeInjectCircuitsFault() {
        if (_circuitsCleanMode || !_circuitsFaultArmed) return;
        if (!double.IsFinite(_circuitsNextFaultAtMs)) ScheduleNextCircuitsFault();
        if (TimeMilliseconds < _circuitsNextFaultAtMs) return;
        InduceCircuitsUtilityFault();
    }

    PilotCommand RapierAutomationOr(in PilotCommand pilotCommand) {
        UpdateRapierMissionGuidance();
        return RapierAutomationActive
            ? _rapierMissionGuidance.Command
            : pilotCommand;
    }

    void RunFixedTick() {
        AdvanceCombatHandoffAtTickBoundary();
        ConfigureAdaptiveAiPlanning();
        // Formation radio traffic is sampled and delivered at the beginning-of-tick boundary.
        // Decision traces therefore capture the exact held assignment that can affect this tick,
        // and neither pilot receives the player's already-integrated future state.
        UpdateFormationCoordination();
        DecisionTickCapture? decisionCapture = BeginDecisionTickCapture();
        _decisionFireIntentEvaluatedThisTick = false;
        _decisionFireIntentConsumedThisTick = false;
        _decisionFireAuthorizedThisTick = false;
        // Weather soundings are intentionally finite data products. Catch an ownship trajectory
        // approaching that explicit model edge before guidance, air-data or RK4 asks for an
        // invented sample. This is a terminal simulation-boundary result, never a kernel fault.
        if (_playerTerminalState == AircraftTerminalState.Flying
            && AtmosphereBoundaryReached(_player.State, _player.AtmosphereModel,
                integrationMarginM: 250.0))
            ForceTerminalLimit(CombatRole.Player, includeFlying: true);
        StepDetachedOpponentWrecks();
        StepRapierMissile();
        if (_playerTerminalState == AircraftTerminalState.Flying) {
            StepRapierPursuit();
            UpdateRapierMissionGuidance();
        }
        StepCore();
        if (decisionCapture is { } capture) CompleteDecisionTickCapture(capture);
        StepPendingTerminalDecision();
        _tick++;
        CaptureIncidentReplaySample();
        UpdateTimeCompressionDecision();
    }

    void ConfigureAdaptiveAiPlanning() {
        if (_bandit is IAdaptiveAiPlanner primary)
            primary.ConfigureAiPlanning(
                _aiComputeLevel, _incrementalAiPlanningEnabled);
        foreach (Wingman wingman in _wingmen) {
            if (wingman.Bandit is IAdaptiveAiPlanner support)
                support.ConfigureAiPlanning(
                    _aiComputeLevel, _incrementalAiPlanningEnabled);
        }
        if (_reliefFighter is {
                StillFighting: true,
                Actor: IAdaptiveAiPlanner relief })
            relief.ConfigureAiPlanning(
                _aiComputeLevel, _incrementalAiPlanningEnabled);
    }

    void UpdateFormationCoordination() {
        bool eligibleBeat = _beat.ContinuousCombat is not null
            && (_beat.UsesReactiveBandit || _beat.UsesNeutralMergeBandit)
            && !CombatHandoffRequested;
        if (!eligibleBeat
            || _playerTerminalState != AircraftTerminalState.Flying
            || _opponentTerminalState != AircraftTerminalState.Flying
            || _bandit.CatastrophicallyDamaged
            || _bandit is not IFormationDirectiveSink primarySink) {
            ClearFormationCoordination();
            return;
        }

        Wingman? support = null;
        int liveSupportCount = 0;
        foreach (Wingman wingman in _wingmen) {
            if (!wingman.StillFighting) continue;
            liveSupportCount++;
            support = wingman;
        }
        if (liveSupportCount != 1
            || support is null
            || support.Bandit is not IFormationDirectiveSink supportSink) {
            ClearFormationCoordination();
            return;
        }

        ActorObservation sharedContact =
            ObservePlayer(_player.State);
        _enemyPairCoordinator.Step(
            _tick,
            sharedContact,
            new FormationCoordinationMember(
                _primaryOpponentGunTargetId, _bandit.State),
            new FormationCoordinationMember(
                support.PlayerGunTargetId, support.Bandit.State));
        primarySink.AcceptFormationDirective(
            _enemyPairCoordinator.DirectiveFor(
                _primaryOpponentGunTargetId, _tick));
        supportSink.AcceptFormationDirective(
            _enemyPairCoordinator.DirectiveFor(
                support.PlayerGunTargetId, _tick));
    }

    void ClearFormationCoordination() {
        _enemyPairCoordinator.Reset();
        if (_bandit is IFormationDirectiveSink primarySink)
            primarySink.AcceptFormationDirective(default);
        foreach (Wingman wingman in _wingmen) {
            if (wingman.Bandit is IFormationDirectiveSink supportSink)
                supportSink.AcceptFormationDirective(default);
        }
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
        long PlayerGunTargetId,
        int ActorAmmo,
        int ActorRounds,
        int ActorHits,
        int PlayerHits,
        long EventSequence,
        bool WeaponsAuthorized);

    DecisionTickCapture? BeginDecisionTickCapture() {
        if (!DecisionCaptureEnabled
            || CombatHandoffRequested
            || _banditSpawnSequence == _decisionClosedActorSpawnSequence
            || _bandit is not IBanditDecisionTraceSource traceSource)
            return null;
        AircraftState playerState = _player.State;
        return new DecisionTickCapture(
            _bandit,
            traceSource,
            _bandit.State,
            ObservePlayer(playerState),
            traceSource.PolicyMemory,
            traceSource.DecisionTrace.SelectionSequence,
            _playerSpawnSequence,
            _banditSpawnSequence,
            TimeSeconds,
            _opponentGun,
            _gunKill,
            _primaryOpponentGunTargetId,
            _opponentGun.AmmoRemaining,
            _opponentGun.RoundsFired,
            _opponentGun.HitCount,
            _gunKill.DamageFor(_primaryOpponentGunTargetId).HitCount,
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
        long PlayerGunTargetId,
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
            _player.State,
            _tick + 1L,
            contactIdentity: PolicyContactIdentity(
                _playerSpawnSequence,
                PolicyContactClass.Player));
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
            HitsReceived: capture.PlayerGun.DamageFor(
                    capture.PlayerGunTargetId).HitCount
                - capture.PlayerHits,
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
                : capture.PlayerGun.DamageFor(
                        capture.PlayerGunTargetId).TargetAlive
                    && capture.PlayerGun.RoundsInFlight.Count > 0);
        if (terminalOutcomeStillOpen) {
            _decisionPendingTerminal = new PendingTerminalDecision(
                record, capture.Actor, capture.ActorGun, capture.PlayerGun,
                capture.PlayerGunTargetId,
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
                : pending.PlayerGun.DamageFor(
                        pending.PlayerGunTargetId).TargetAlive
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
                HitsReceived = pending.PlayerGun.DamageFor(
                        pending.PlayerGunTargetId).HitCount
                    - pending.PlayerHitsBaseline,
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
        ClearFormationCoordination();
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
        // Stowed Rapier drone mass is part of the staged aircraft mass. Initialize the loadout
        // before CreatePlayer/WithCurrentFuelMass; doing this near the end of StageBeat made the
        // first ever Rapier sortie 1,440 kg lighter than every restart.
        _rapierDogfightingDronesRemaining =
            Math.Max(0, _beat.ScriptedIntercept?.DogfightingDrones ?? 0);
        _carrier = _beat.Carrier;
        _conventionalRunwayRecovery =
            _beat.RecoveryPlan?.ConventionalRunway is null
                ? null
                : new ConventionalRunwayRecoveryModel(
                    ConventionalRunway.FromRecoveryPlan(_beat.RecoveryPlan));
        ArrestmentCapabilityProfile arrestmentCapability =
            _beat.ScriptedIntercept is not null
                ? ArrestmentCapabilityProfile.ProvisionalRapierLandStrip
                : ArrestmentCapabilityProfile.ProvisionalKoreaJet;
        if (_arrestment.Capability.Id != arrestmentCapability.Id)
            _arrestment = new ArrestmentModel(arrestmentCapability);
        _difficulty = DifficultyModel.ForLevel(0);
        _recoveryAttemptActive = false;
        _attemptHadSetback = false;
        _attemptCleanRecorded = false;
        _fuel = CreatePlayerFuel();
        bool maintenanceRecovery = _beat.MaintenanceScenario
            == MaintenanceScenarioKind.F86EmergencyGearRecovery;
        bool patternOnly = _beat.ScriptedIntercept?.PatternOnly == true;
        _systems = CreatePlayerSystems(
            onApproach: PlayerSystemsSimulated && _carrier is not null
                && !maintenanceRecovery && !patternOnly,
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
        // Circuits starts clean (Combat). Carrier approach beats stage Recovery.
        _configurationTarget = _configurationAutomationEnabled
            ? (patternOnly
                ? FlightConfigurationTarget.Combat
                : FlightConfigurationTarget.Recovery)
            : FlightConfigurationTarget.Combat;
        _manualGearConfiguration = false;
        _manualFlapConfiguration = false;
        _configurationWasReady = ConfigurationReady;
        _configurationReadyCueUntilMs = double.NegativeInfinity;
        if (_carrier is not null) {
            _difficulty = _carrier.IsMaritime
                ? _recoveryProgress.PreviewNextAttempt()
                : DifficultyModel.ForLevel(0);
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
        _catapult = new CatapultLaunchModel(
            _beat.CatapultStrokeM ?? CatapultLaunchModel.StrokeDistanceM,
            _beat.CatapultEndSpeedMps ?? CatapultLaunchModel.EndDeckRelativeSpeedMps,
            _beat.CatapultRampAngleRad ?? 0.0,
            _beat.CatapultCrossOffsetM ?? CatapultLaunchModel.CatapultCrossM);
        if (_carrier is not null && _beat.StartsOnCatapult) {
            // Ready and Restart show the exact constrained parked pose. Begin starts the clock and
            // phase but must not teleport the aircraft 70 m from the recovery centreline or snap
            // its reference point down through the launcher support.
            _beat = _beat with {
                Player = _catapult.ParkedState(_carrier, _beat.Player.Mass)
            };
        }
        RefreshLaunchTerrainClearance();
        _waveOffArmed = _carrier is not null;
        _waveOffUntilMs = double.NegativeInfinity;
        _burble = _carrier is { IsMaritime: true }
            ? CreateBurble(_carrier, _difficulty, _weatherProfile?.Wind)
            : null;
        _player = CreatePlayer(_beat.Player);
        // Pacing memory survives the pilot: when the director has observed history and this beat
        // fields a skill-driven continuous-combat opponent, the OPENING spawn is a director
        // decision too — a boss loss last life opens this life in RELEASE, not back at the ramp.
        SpawnSpec? openingSpawn = _beat.ContinuousCombat is not null
            && (_beat.UsesReactiveBandit || _beat.UsesNeutralMergeBandit)
            && _fightDirector.HasHistory
            ? _fightDirector.NextSpawn(1)
            : null;
        _bandit = _beat.CreateBandit(_terrainSurface, openingSpawn);
        ClearWingmen();
        _retiredOpponentGuns.Clear();
        _primaryOpponentGunTargetId = AllocateOpponentGunTargetId();
        _selectedPlayerGunTargetId = _primaryOpponentGunTargetId;
        // The opening wave is a formation too — the pilot's own call: "first fight is 1v2 and if I
        // win that it stays that way." A cold start has no director decision yet, so ask the
        // director what an opening looks like rather than hard-coding a number here.
        if (_beat.ContinuousCombat is not null)
            StageWingmen(openingSpawn ?? _fightDirector.NextSpawn(1), 1);
        else if (_beat.ScriptedIntercept is { FormationSize: > 1 } scriptedFormation)
            StageScriptedFormation(scriptedFormation.FormationSize);
        ConfigureFormationLookaheadCadence();
        _playerSpawnSequence++;
        _banditSpawnSequence++;
        if (_carrier is not null) _carrierSpawnSequence++;
        _bandit.Wind = _player.Wind;
        _bandit.Atmosphere = _player.AtmosphereModel;
        CombatConfig combat = _beat.CombatRules;
        _gunKill = new GunKill(combat.PlayerAmmo, combat.OpponentHitsToDefeat,
            combat.PlayerGunProfile.EffectiveHitRadiusM, combat.PlayerGunProfile,
            combat.PlayerGunEnabled ? GunHeatConfig.PlayerInfiniteAmmo : null);
        RegisterFormationGunTargets();
        _gunKill.SelectTarget(_selectedPlayerGunTargetId);
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
        // Arrive configured: for a beat staged at a deliberate fighting speed, hand the pilot the
        // power setting that HOLDS it instead of an arbitrary one they must correct every sortie.
        _detents.ConfigureFor(_beat.PlayerAir, StagedThrottle());
        _pilotPhysiology = new PilotPhysiologyModel(_beat.PlayerPilotPhysiology);
        _autoGcasState = AutoGcasState.Initial(PlayerAutoGcasCapability.Available);
        _autoGcasRecoveryCommand = null;
        _autoGcasPredictionTicksRemaining = 0;
        _autoGcasPredictionEvaluationCount = 0;
        _autoGcasPredictionElapsedSeconds = 0.0;
        _autoGcasFlyUpMinimumClearanceM = double.PositiveInfinity;
        _lastAutoGcasFlyUpBottomClearanceM = null;
        _completedAutoGcasFlyUpCount = 0;
        _gcasLowLevelStandby = false;
        _gcasTimeSinceStandbyInputSeconds = double.PositiveInfinity;
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
        _timeCompressionAccumulatorSeconds = 0.0;
        _timeCompressionHostMaximumFactor = 1;
        _timeCompressionFactor = 1;
        _timeCompressionInhibitReason =
            TimeCompressionInhibitReason.SessionInactive;
        _ramCueStage = 0;
        _shotsTotal = 0;
        _shotsInWindow = 0;
        _killCount = 0;
        _combatHandoffPhase = SupportsCombatHandoff
            ? CombatHandoffPhase.Available
            : CombatHandoffPhase.Unavailable;
        _reliefFighter = null;
        _reliefTargetingOpponentGuns.Clear();
        _reliefThreatState = default;
        _reliefThreatStateValid = false;
        _reliefKills = 0;
        _playerHitsTaken = 0;
        _engagementNumber = 1;
        _engagementCounters = default;
        _engagementReports.Clear();
        LastDirectorSpawn = openingSpawn;
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
        _rapierMissionDirector = _beat.ScriptedIntercept is null
            ? null : new RapierMissionDirector();
        _rapierMissionGuidance = default;
        _rapierAutomationEnabled =
            _beat.ScriptedIntercept?.AutomationDefaultEnabled ?? false;
        _rapierManualOverrideUntilMs = double.NegativeInfinity;
        _rapierMissilesRemaining =
            Math.Max(0, _beat.ScriptedIntercept?.ShortRangeMissiles ?? 0);
        _rapierMissileInFlight = false;
        _rapierMissileImpactAtMs = double.PositiveInfinity;
        _rapierMissileTargetSequence = 0;
        _rapierFormationSweepCommitted = false;
        _rapierFormationSweepRequested = false;
        _rapierGunDrone = null;
        _rapierGunDroneEgress = false;
        _rapierGunDroneThreatReactive = false;
        _rapierPursuitActive = false;
        _rapierPursuitRangeM = double.PositiveInfinity;
        _lastRange = Geometry.Range(_player.State, SelectedOpponentState);
        _closureKts = 0.0;
        _closureSmooth = 0.0;
        // Drone raids score through DroneRaidEvaluation; a dogfight engagement report for a
        // raid would misattribute the whole raid to one staged skill, so counters stay off.
        if (_beat.DroneRaid is null)
            StartEngagementCounters(openingSpawn?.Skill ?? _beat.BanditSkill,
                openingSpawn is { } opening && (opening.Boss || opening.Machine));
        // Simulation time is deliberately monotonic across restarts because KeyGrammar timestamps
        // all input in this epoch. Only flight-local state and the accumulator reset.
        Lifecycle = LifecycleState.Ready;
    }

    AircraftSim CreatePlayer(in AircraftState state) {
        var player = new AircraftSim(WithCurrentFuelMass(state), _beat.PlayerAir,
            _weatherProfile?.Atmosphere) {
            Wind = _carrier is { IsMaritime: true }
                ? _burble
                : _weatherProfile?.Wind
                    ?? new TurbulenceField(intensityMps: 1.2, outerScaleM: 130.0,
                        intermittency: 0.5, seed: 0xB0A7),
            EngineFuelAvailable = _fuel.HasFuel,
            AerodynamicConfiguration = PlayerAerodynamicConfiguration
        };
        return player;
    }

    AirframeSystemsProfile PlayerSystemsProfile =>
        _beat.SystemsProfile ?? AirframeSystemsProfile.F86FResearchBasis;

    AirframeSystems CreatePlayerSystems(bool onApproach,
        bool prechargeUtilityHydraulics) => new(
        // The beat's own airframe when it declares one. A beat launched off a 150 m/s catapult
        // needs gear and flap limits qualified for that, and inheriting the Sabre's 185 KIAS
        // tripped an overspeed the instant the aircraft left the rail.
        profile: PlayerSystemsProfile,
        initialGear: onApproach ? LandingGearHandle.Down : LandingGearHandle.Up,
        initialFlapDegrees: onApproach ? PlayerSystemsProfile.FullFlapDegrees : 0.0,
        // Every current beat starts with an already-running airborne jet. Prime the normal system
        // to that steady state instead of flashing a fictitious pump failure during the first
        // numerical time constant. The maintenance beat deliberately starts unpressurised because
        // its utility-pump failure is injected at staging.
        initialUtilityHydraulicPressureFraction: prechargeUtilityHydraulics ? 1.0 : 0.0);

    AircraftState WithCurrentFuelMass(in AircraftState state) {
        double fuelFreeMass = PlayerFuelFreeMassKgWithStores();
        if (fuelFreeMass <= 0.0) return state;
        return state with { Mass = fuelFreeMass + _fuel.FuelLb * 0.45359237 };
    }

    void RefreshPlayerMass() {
        double fuelFreeMass = PlayerFuelFreeMassKgWithStores();
        if (fuelFreeMass > 0.0)
            _player.SetMassKg(fuelFreeMass + _fuel.FuelLb * 0.45359237);
    }

    /// Published Rapier fuel-free includes the design four-drone bay. Actual stowed count may be
    /// lower (mission config or after release); shed that delta so climb/dash feel the load.
    double PlayerFuelFreeMassKgWithStores() {
        double fuelFreeMass = _beat.PlayerAir.FuelFreeMassKg;
        if (fuelFreeMass <= 0.0) return fuelFreeMass;
        if (_beat.PlayerAir.PropulsionModel
            != PropulsionModelKind.TurboRamjetPublicDataSurrogate)
            return fuelFreeMass;
        double designStores = FlightModel.RapierDesignStowedGunDroneMassKg;
        double actualStores = _rapierDogfightingDronesRemaining
            * FlightModel.RapierGunDroneSurrogate.MassKg;
        return fuelFreeMass - designStores + actualStores;
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

    /// <summary>
    /// Circuits config by pattern leg: clean through BREAK, dirty from DOWNWIND to the wire.
    /// </summary>
    void ApplyPatternOnlyConfigurationTarget() {
        if (_beat.ScriptedIntercept?.PatternOnly != true) return;
        if (!_configurationAutomationEnabled) return;
        FlightConfigurationTarget target = RapierCircuitLeg switch {
            "DOWNWIND" or "BASE" or "SHORT_FINAL" or "WIRE_FINAL"
                => FlightConfigurationTarget.Recovery,
            _ => FlightConfigurationTarget.Combat
        };
        SelectAutomaticConfigurationTarget(target);
    }

    void ApplyCarrierConfigurationAutomation(bool inSlot) {
        bool patternOnly = _beat.ScriptedIntercept?.PatternOnly == true;
        if (patternOnly) {
            ApplyPatternOnlyConfigurationTarget();
            _detents.ApproachMode =
                _configurationTarget == FlightConfigurationTarget.Recovery
                && _detents.Throttle < 0.95;
            return;
        }
        bool rapierRecoveryConfiguration = RapierAutomationActive
            && RapierPhase == RapierMissionPhase.Recovery
            && _player.IndicatedAirspeedMps * 1.94384 <= 300.0;
        if ((inSlot && !WaveOffActive
                && _recovery != Carrier.Recovery.Bolter
                && _detents.Throttle < 0.95)
            || rapierRecoveryConfiguration)
            SelectAutomaticConfigurationTarget(FlightConfigurationTarget.Recovery);
        _detents.ApproachMode = inSlot && _detents.Throttle < 0.95
            || rapierRecoveryConfiguration;
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
        if (down && CombatHandoffRequested) down = false;
        if (down && !_triggerDown) {
            _shotsTotal++;
            AircraftState selectedTarget = SelectedOpponentState;
            if (CameraSolver.GunWindow(_player.State, selectedTarget)) _shotsInWindow++;
            // VisualMergeEvaluation is an actor-specific primary-opponent rubric. The selected
            // contact owns the actual shot-window count, but feeding a wingman's trigger geometry
            // into the primary-only projectile/overshoot state would mix two aircraft.
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

    bool SupportsCombatHandoff =>
        _beat is not null
        && _beat.ContinuousCombat is not null
        && _beat.PlayerAircraft.Id == AircraftCapability.F22ASurrogate.Id;

    /// The throttle a sortie should open on. Beats that stage a deliberate fighting speed opt into
    /// arriving trimmed for it; everything else keeps its authored setting.
    double StagedThrottle() {
        if (!_beat.StageAtTrimThrottle || _carrier is not null) return _beat.InitialThrottle;
        double trim = DetentLayer.LevelFlightTrimThrottle(
            _player.State, _beat.PlayerAir, _player.AirspeedMps,
            PlayerAerodynamicConfiguration, _player.AtmosphereModel);
        return double.IsFinite(trim) && trim > 0.0 ? trim : _beat.InitialThrottle;
    }

    /// Take the primary out of the fight without needing a gun solution. Test seam only — it
    /// drives the same path a real gun kill does, so promotion and wave staging are exercised
    /// rather than simulated.
    public void ForceOpponentDefeatForTest() {
        if (_opponentTerminalState != AircraftTerminalState.Flying) return;
        _killCount++;
        BeginCatastrophicDamage(CombatRole.Opponent, CombatRole.Player);
    }

    /// Stage the rest of the formation alongside the primary. Each gets its own controller, its
    /// own magazine, and a merge position offset from the leader so they arrive as a pair rather
    /// than a single contact — a formation the pilot has to split, which is the entire point.
    void StageWingmen(in SpawnSpec spec, int engagementNumber) {
        ClearWingmen();
        if (_beat.ContinuousCombat is null) return;
        int ceiling = System.Math.Max(1, _beat.ContinuousCombat.MaximumFormationSize);
        int extra = System.Math.Max(0,
            System.Math.Min(spec.FormationSize, ceiling) - 1);
        if (extra == 0) return;

        CombatConfig combat = _beat.CombatRules;
        AircraftParams air = _beat.BanditAirForMount(spec.Skill, spec.Mount);
        for (int index = 0; index < extra; index++) {
            // Offset by engagement number AND wingman index so the pair never stacks, and so the
            // whole staging stays a pure function of the engagement (the determinism contract).
            IBandit wing = _beat.CreateNextBandit(
                _player.State, engagementNumber + WingmanSpawnStride * (index + 1),
                _terrainSurface, spec);
            wing.Wind = _player.Wind;
            wing.Atmosphere = _player.AtmosphereModel;
            var gun = new GunKill(combat.OpponentAmmo, combat.PlayerHitsToDefeat,
                combat.OpponentGunProfile.EffectiveHitRadiusM, combat.OpponentGunProfile);
            _wingmen.Add(new Wingman(
                wing, gun, spec.Skill, AllocateOpponentGunTargetId()));
        }
    }

    void StageScriptedFormation(int formationSize) {
        CombatConfig combat = _beat.CombatRules;
        int boundedSize = Math.Clamp(formationSize, 1, 6);
        for (int index = 1; index < boundedSize; index++) {
            IBandit aircraft = _beat.CreateScriptedFormationBandit(index, _terrainSurface);
            aircraft.Wind = _player.Wind;
            aircraft.Atmosphere = _player.AtmosphereModel;
            var gun = new GunKill(combat.OpponentAmmo, combat.PlayerHitsToDefeat,
                combat.OpponentGunProfile.EffectiveHitRadiusM,
                combat.OpponentGunProfile);
            _wingmen.Add(new Wingman(
                aircraft, gun, _beat.BanditSkill, AllocateOpponentGunTargetId()));
        }
    }

    /// SpawnForMerge varies its geometry with the engagement number; stepping by more than the
    /// doctrine cycle keeps a wingman from landing on top of its leader.
    const int WingmanSpawnStride = 1;

    void ConfigureFormationLookaheadCadence() {
        if (_beat.ContinuousCombat is null || _wingmen.Count != 1) return;
        ConfigureLookaheadCadence(_bandit, _primaryOpponentGunTargetId);
        ConfigureLookaheadCadence(
            _wingmen[0].Bandit,
            _wingmen[0].PlayerGunTargetId);
    }

    static void ConfigureLookaheadCadence(IBandit bandit, long actorId) {
        int cadence = ReactiveBandit.LookaheadDecisionCadenceTicks;
        int actorLane = (int)(actorId % cadence);
        // Five ticks keeps adjacent formation IDs off the same two-tick render frame while
        // remaining coprime to the twelve-tick cadence, so every actor ID maps deterministically.
        int phase = actorLane * 5 % cadence;
        switch (bandit) {
            case NeutralMergeBandit merge:
                merge.ConfigureLookaheadCadencePhase(phase);
                break;
            case ReactiveBandit reactive:
                reactive.ConfigureLookaheadCadencePhase(phase);
                break;
        }
    }

    void ClearWingmen() {
        ClearFormationCoordination();
        foreach (Wingman wingman in _wingmen) {
            if (wingman.Gun.RoundsInFlight.Count > 0)
                _retiredOpponentGuns.Add(
                    new RetiredOpponentGun(wingman.Bandit, wingman.Gun));

            AircraftTerminalState terminalState = wingman.TerminalState;
            if (terminalState == AircraftTerminalState.Flying
                && wingman.Bandit.CatastrophicallyDamaged)
                terminalState = AircraftTerminalState.DestroyedAirborne;
            if (terminalState == AircraftTerminalState.Flying) continue;
            _detachedOpponentWrecks.Add(new DetachedOpponentWreck(
                wingman.Bandit,
                wingman.PlayerGunTargetId,
                terminalState,
                wingman.ImpactSurface));
        }
        while (_detachedOpponentWrecks.Count > 8) {
            int settledIndex = _detachedOpponentWrecks.FindIndex(
                static wreck => wreck.TerminalState is AircraftTerminalState.Settled
                    or AircraftTerminalState.SimulationBounded);
            if (settledIndex < 0) break;
            _detachedOpponentWrecks.RemoveAt(settledIndex);
        }
        _wingmen.Clear();
    }

    long AllocateOpponentGunTargetId() => _nextOpponentGunTargetId++;

    void RegisterFormationGunTargets() {
        _gunKill.RegisterTarget(_primaryOpponentGunTargetId);
        foreach (Wingman wingman in _wingmen)
            _gunKill.RegisterTarget(wingman.PlayerGunTargetId);
    }

    bool IsPlayerGunTargetLive(long targetId) {
        if (targetId == _primaryOpponentGunTargetId)
            return _opponentTerminalState == AircraftTerminalState.Flying
                && _gunKill.DamageFor(targetId).TargetAlive;
        Wingman? wingman = _wingmen.FirstOrDefault(candidate =>
            candidate.PlayerGunTargetId == targetId);
        return wingman is not null
            && wingman.StillFighting
            && _gunKill.DamageFor(targetId).TargetAlive;
    }

    void SelectPlayerGunTarget(long targetId) {
        if (_selectedPlayerGunTargetId == targetId
            && _gunKill.SelectedTargetId == targetId)
            return;
        _selectedPlayerGunTargetId = targetId;
        _gunKill.SelectTarget(targetId);
        _lastRange = Geometry.Range(_player.State, SelectedOpponentState);
        _closureKts = _closureSmooth = 0.0;
        _gunneryPitchAssistState = GunneryPitchAssistState.Inactive();
    }

    void EnsureSelectedPlayerGunTarget() {
        if (IsPlayerGunTargetLive(_selectedPlayerGunTargetId)) {
            _gunKill.SelectTarget(_selectedPlayerGunTargetId);
            return;
        }
        if (IsPlayerGunTargetLive(_primaryOpponentGunTargetId)) {
            SelectPlayerGunTarget(_primaryOpponentGunTargetId);
            return;
        }
        Wingman? liveWingman = _wingmen.FirstOrDefault(wingman =>
            IsPlayerGunTargetLive(wingman.PlayerGunTargetId));
        if (liveWingman is not null) {
            SelectPlayerGunTarget(liveWingman.PlayerGunTargetId);
            return;
        }

        // Keep a deterministic actor selected while the last kill resolves. It remains
        // non-damageable, but old rounds can still be advanced against any other supplied actor.
        SelectPlayerGunTarget(_primaryOpponentGunTargetId);
    }

    void UpdateSelectedTargetClosure() {
        double range = Geometry.Range(_player.State, SelectedOpponentState);
        _closureKts = (_lastRange - range) / FixedDeltaSeconds * 1.94384;
        _closureKts = _closureSmooth = _closureSmooth * 0.9 + _closureKts * 0.1;
        _lastRange = range;
    }

    int CapturePlayerGunTargets(in AircraftState primaryState) {
        int count = 1 + _wingmen.Count;
        if (_playerGunTargets.Length < count)
            Array.Resize(ref _playerGunTargets, Math.Max(count, _playerGunTargets.Length * 2));
        _playerGunTargets[0] = new GunTarget(
            _primaryOpponentGunTargetId,
            primaryState,
            Damageable: _opponentTerminalState == AircraftTerminalState.Flying);
        for (int index = 0; index < _wingmen.Count; index++) {
            Wingman wingman = _wingmen[index];
            _playerGunTargets[index + 1] = new GunTarget(
                wingman.PlayerGunTargetId,
                wingman.Bandit.State,
                Damageable: wingman.StillFighting);
        }
        return count;
    }

    (AircraftState State, long EntitySequence) PlayerGunTargetEventContext(
        long targetId) {
        if (targetId == _primaryOpponentGunTargetId)
            return (_bandit.State, _banditSpawnSequence);
        Wingman? wingman = _wingmen.FirstOrDefault(candidate =>
            candidate.PlayerGunTargetId == targetId);
        return wingman is null
            ? (_bandit.State, _banditSpawnSequence)
            : (wingman.Bandit.State, targetId);
    }

    void RecordHitsOnPlayer(int hits) {
        if (hits <= 0) return;
        _playerHitsTaken += hits;
        EmitEvent(SessionEventType.Hit, CombatRole.Opponent, CombatRole.Player, hits);
    }

    internal void RecordPlayerHitsForTest(int hits) => RecordHitsOnPlayer(hits);

    void StepReliefFighter() {
        if (_reliefFighter is not { } relief
            || relief.TerminalState is AircraftTerminalState.Settled
                or AircraftTerminalState.SimulationBounded)
            return;

        AircraftState previousState = relief.State;
        _reliefThreatState = previousState;
        _reliefThreatStateValid = true;
        if (AtmosphereBoundaryReached(previousState, relief.Actor.Atmosphere)) {
            relief.TriggerDown = false;
            relief.TerminalState = AircraftTerminalState.SimulationBounded;
            relief.ImpactSurface = ImpactSurface.SimulationBoundary;
            EmitEvent(SessionEventType.TerminalLimitReached,
                CombatRole.None, CombatRole.Relief,
                surface: ImpactSurface.SimulationBoundary,
                entitySequence: relief.SpawnSequence,
                kinematics: previousState);
            return;
        }
        if (relief.TerminalState == AircraftTerminalState.Flying
            && relief.Actor.CatastrophicallyDamaged)
            relief.TerminalState = AircraftTerminalState.DestroyedAirborne;

        long targetId = IsOpponentTargetLiveForHandoff(
            _selectedPlayerGunTargetId)
                ? _selectedPlayerGunTargetId
                : _primaryOpponentGunTargetId;
        AircraftState targetState = OpponentTargetStateForHandoff(targetId);
        relief.Actor.Step(
            ActorObservation.Capture(
                targetState,
                _tick,
                contactIdentity: PolicyContactIdentity(
                    targetId,
                    PolicyContactClass.Opponent)),
            FixedDeltaSeconds);
        AircraftState currentState = relief.State;

        if (relief.TerminalState == AircraftTerminalState.Flying) {
            var contact = DetectImpact(previousState, currentState);
            if (contact.surface != ImpactSurface.None) {
                relief.TriggerDown = false;
                EmitEvent(SessionEventType.Impact,
                    CombatRole.None, CombatRole.Relief,
                    surface: contact.surface,
                    entitySequence: relief.SpawnSequence,
                    kinematics: currentState);
                CombatRole source = LiveOpponentCount > 0
                    ? CombatRole.Opponent : CombatRole.None;
                relief.ApplyCatastrophicDamage(handedness: 1);
                EmitEvent(SessionEventType.Destroyed,
                    source, CombatRole.Relief,
                    entitySequence: relief.SpawnSequence,
                    kinematics: currentState);
                Carrier? contactCarrier = contact.surface is ImpactSurface.FlightDeck
                    or ImpactSurface.CarrierStructure ? _carrier : null;
                relief.Actor.ApplySurfaceImpact(
                    contact.surface,
                    contact.velocity,
                    contact.height,
                    contactCarrier,
                    _terrainSurface);
                relief.TerminalState = AircraftTerminalState.Impacted;
                relief.ImpactSurface = contact.surface;
            }
        } else if (relief.TerminalState
                == AircraftTerminalState.DestroyedAirborne) {
            var contact = DetectImpact(previousState, currentState);
            if (contact.surface != ImpactSurface.None) {
                EmitEvent(SessionEventType.Impact,
                    CombatRole.None, CombatRole.Relief,
                    surface: contact.surface,
                    entitySequence: relief.SpawnSequence,
                    kinematics: currentState);
                Carrier? contactCarrier = contact.surface is ImpactSurface.FlightDeck
                    or ImpactSurface.CarrierStructure ? _carrier : null;
                relief.Actor.ApplySurfaceImpact(
                    contact.surface,
                    contact.velocity,
                    contact.height,
                    contactCarrier,
                    _terrainSurface);
                relief.TerminalState = AircraftTerminalState.Impacted;
                relief.ImpactSurface = contact.surface;
            }
        }
        if (relief.TerminalState == AircraftTerminalState.Impacted
            && relief.Actor.WreckSurfaceChangedThisStep) {
            relief.ImpactSurface = relief.Actor.WreckSurface;
            EmitEvent(SessionEventType.Impact,
                CombatRole.None, CombatRole.Relief,
                surface: relief.ImpactSurface,
                entitySequence: relief.SpawnSequence,
                kinematics: relief.State);
        }
        if (relief.TerminalState == AircraftTerminalState.Impacted
            && relief.Actor.WreckSettled) {
            relief.TerminalState = AircraftTerminalState.Settled;
            EmitEvent(SessionEventType.Settled,
                CombatRole.None, CombatRole.Relief,
                surface: relief.ImpactSurface,
                entitySequence: relief.SpawnSequence,
                kinematics: relief.State);
        }
    }

    /// Fly every additional opponent and let each shoot at the player independently. Their hits
    /// land in the SHARED pool (PlayerHitsTaken): two aircraft putting rounds into one pilot must
    /// kill them together, not each need a full magazine of their own.
    void StepWingmen(in AircraftState playerState) {
        if (_wingmen.Count == 0) return;
        bool weaponsReleased = !WeaponsInhibited && !TerminalPhaseActive
            && _playerTerminalState == AircraftTerminalState.Flying
            && !CombatHandoffRequested;
        foreach (Wingman wingman in _wingmen) {
            AircraftState wingmanState = wingman.Bandit.State;
            if (wingman.TerminalState == AircraftTerminalState.Flying
                && wingman.Bandit.CatastrophicallyDamaged) {
                wingman.Defeated = true;
                wingman.TerminalState = AircraftTerminalState.DestroyedAirborne;
            }
            if (wingman.TerminalState is not AircraftTerminalState.Settled
                    and not AircraftTerminalState.SimulationBounded
                && AtmosphereBoundaryReached(
                    wingmanState, wingman.Bandit.Atmosphere)) {
                wingman.Defeated = true;
                wingman.SimulationBounded = true;
                wingman.TerminalState = AircraftTerminalState.SimulationBounded;
                wingman.ImpactSurface = ImpactSurface.SimulationBoundary;
                wingman.TriggerDown = false;
                EmitEvent(SessionEventType.TerminalLimitReached,
                    CombatRole.None, CombatRole.Opponent,
                    surface: ImpactSurface.SimulationBoundary,
                    entitySequence: wingman.PlayerGunTargetId,
                    kinematics: wingmanState);
            }

            ActorObservation observation = ThreatObservationFor(
                playerState, wingmanState);
            if (!_reliefTargetingOpponentGuns.ContainsKey(
                    wingman.PlayerGunTargetId)) {
                bool trigger = wingman.StillFighting
                    && weaponsReleased
                    && wingman.Gun.AmmoRemaining > 0
                    && wingman.Gun.TargetAlive
                    && !wingman.Bandit.CatastrophicallyDamaged
                    && wingman.Bandit.WantsToFire(observation);
                wingman.TriggerDown = trigger;
                // A destroyed shooter cannot launch another round, but every round it already
                // fired remains physical. Stepping the gun on every tick also clears per-step hit
                // evidence, so a terminal aircraft cannot report the same hit twice.
                wingman.Gun.Step(
                    trigger, wingmanState, playerState, FixedDeltaSeconds);
                RecordHitsOnPlayer(wingman.Gun.HitsThisStep);
            }

            if (wingman.TerminalState is AircraftTerminalState.Settled
                or AircraftTerminalState.SimulationBounded)
                continue;

            wingman.Bandit.Step(observation, FixedDeltaSeconds);
            ObserveWingmanTerminalPhysics(wingman, wingmanState);
        }
    }

    void ObserveWingmanTerminalPhysics(
        Wingman wingman, in AircraftState previousState) {
        AircraftState currentState = wingman.Bandit.State;
        if (wingman.TerminalState == AircraftTerminalState.DestroyedAirborne) {
            var contact = DetectImpact(previousState, currentState);
            if (contact.surface != ImpactSurface.None) {
                EmitEvent(SessionEventType.Impact,
                    CombatRole.None, CombatRole.Opponent,
                    surface: contact.surface,
                    entitySequence: wingman.PlayerGunTargetId,
                    kinematics: currentState);
                Carrier? contactCarrier = contact.surface is ImpactSurface.FlightDeck
                    or ImpactSurface.CarrierStructure ? _carrier : null;
                wingman.Bandit.ApplySurfaceImpact(contact.surface,
                    contact.velocity, contact.height, contactCarrier, _terrainSurface);
                wingman.TerminalState = AircraftTerminalState.Impacted;
                wingman.ImpactSurface = contact.surface;
            }
        }
        if (wingman.TerminalState == AircraftTerminalState.Impacted
            && wingman.Bandit.WreckSurfaceChangedThisStep) {
            wingman.ImpactSurface = wingman.Bandit.WreckSurface;
            EmitEvent(SessionEventType.Impact,
                CombatRole.None, CombatRole.Opponent,
                surface: wingman.ImpactSurface,
                entitySequence: wingman.PlayerGunTargetId,
                kinematics: wingman.Bandit.State);
        }
        if (wingman.TerminalState == AircraftTerminalState.Impacted
            && wingman.Bandit.WreckSettled) {
            wingman.TerminalState = AircraftTerminalState.Settled;
            EmitEvent(SessionEventType.Settled,
                CombatRole.None, CombatRole.Opponent,
                surface: wingman.ImpactSurface,
                entitySequence: wingman.PlayerGunTargetId,
                kinematics: wingman.Bandit.State);
        }
    }

    static bool AtmosphereBoundaryReached(in AircraftState state,
        IAtmosphereModel atmosphere, double integrationMarginM = 2.0) {
        if (atmosphere is not HydrostaticAtmosphereColumn bounded) return false;
        double verticalSpeedMps = state.VelocityVector().Y;
        double predictedAltitudeM = state.Position.Y
            + verticalSpeedMps * FixedDeltaSeconds * 1.5;
        double marginM = Math.Max(2.0, integrationMarginM);
        // ONLY the lower edge is terminal, and only because below the sounding is below the
        // ground. The upper edge is not a physical boundary at all — the column now continues on
        // a scaled standard atmosphere above its top level, so climbing out of the data is no
        // longer an event. Killing the aircraft for it was the single dumbest failure mode in the
        // sortie: you did not die of altitude, you died of an array running out.
        return state.Position.Y <= bounded.MinimumGeometricAltitudeM + marginM
            || predictedAltitudeM <= bounded.MinimumGeometricAltitudeM + marginM;
    }

    /// When the aircraft the pilot is fighting goes down but its formation has not, promote the
    /// nearest survivor so every cue keeps tracking a live threat instead of a wreck.
    bool TryPromoteWingmanToPrimary() {
        if (_opponentTerminalState == AircraftTerminalState.Flying) return false;
        Wingman? next = null;
        double nearest = double.PositiveInfinity;
        foreach (Wingman wingman in _wingmen) {
            if (!wingman.StillFighting) continue;
            double rangeM = Geometry.Range(_player.State, wingman.Bandit.State);
            if (rangeM >= nearest) continue;
            nearest = rangeM;
            next = wingman;
        }
        if (next is null) return false;

        long previousSelection = _selectedPlayerGunTargetId;
        GunKill retiringGun = _opponentGun;
        IBandit retiringBandit = _bandit;
        _wingmen.Remove(next);
        if (retiringGun.RoundsInFlight.Count > 0
            && !_retiredOpponentGuns.Any(retired =>
                ReferenceEquals(retired.Gun, retiringGun)))
            _retiredOpponentGuns.Add(
                new RetiredOpponentGun(retiringBandit, retiringGun));
        // The retiring primary keeps falling as a detached wreck exactly as it would in a duel.
        DetachCurrentOpponent(_opponentTerminalState, _opponentImpactSurface);
        _bandit = next.Bandit;
        _opponentGun = next.Gun;
        _primaryOpponentGunTargetId = next.PlayerGunTargetId;
        _opponentTerminalState = AircraftTerminalState.Flying;
        _opponentImpactSurface = ImpactSurface.None;
        _opponentTriggerDown = next.TriggerDown;
        _nextOpponentSpawnAtMs = double.NegativeInfinity;
        _terminalStartedAtMs = double.PositiveInfinity;
        _pendingOutcome = SortieOutcome.None;
        if (IsPlayerGunTargetLive(previousSelection))
            SelectPlayerGunTarget(previousSelection);
        else
            SelectPlayerGunTarget(_primaryOpponentGunTargetId);
        _banditSpawnSequence++;
        _padlockRollAssist.Reset();
        ClearFormationCoordination();
        ShowTransition("WINGMAN ENGAGED · V PADLOCK", 2200.0);
        return true;
    }

    void StepWeapons(in AircraftState playerState, in AircraftState opponentState,
        bool playerTriggerHeld, bool allowNewFire = true) {
        bool weaponsReleased =
            allowNewFire && !WeaponsInhibited && !CombatHandoffRequested;
        bool playerWeaponsAuthorized = weaponsReleased && PlayerWeaponsAuthorized;
        bool primaryRetargeted = _reliefTargetingOpponentGuns.ContainsKey(
            _primaryOpponentGunTargetId);
        bool opponentIntentEvaluated = weaponsReleased
            && !primaryRetargeted
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
        EnsureSelectedPlayerGunTarget();
        int playerGunTargetCount = CapturePlayerGunTargets(opponentState);
        _gunKill.Step(playerWeaponsAuthorized && playerTriggerHeld,
            playerState,
            _selectedPlayerGunTargetId,
            _playerGunTargets.AsSpan(0, playerGunTargetCount),
            FixedDeltaSeconds);
        if (!primaryRetargeted)
            _opponentGun.Step(
                _opponentTriggerDown, opponentState, playerState, FixedDeltaSeconds);
        StepRetiredOpponentGuns(playerState);
        StepReliefTargetingOpponentGuns();
        StepReliefGun();
        _visualMergeEvaluation?.ObserveProjectileState(
            _gunKill.RoundsFired,
            _gunKill.DamageFor(_primaryOpponentGunTargetId).HitCount);

        foreach (IGrouping<long, GunImpact> impacts in
            _gunKill.ImpactsThisStep.GroupBy(static impact => impact.TargetId)) {
            var context = PlayerGunTargetEventContext(impacts.Key);
            EmitEvent(SessionEventType.Hit, CombatRole.Player, CombatRole.Opponent,
                impacts.Count(),
                entitySequence: context.EntitySequence,
                kinematics: context.State);
        }
        if (!primaryRetargeted)
            RecordHitsOnPlayer(_opponentGun.HitsThisStep);
    }

    void StepRetiredOpponentGuns(in AircraftState playerState) {
        for (int index = _retiredOpponentGuns.Count - 1; index >= 0; index--) {
            RetiredOpponentGun retired = _retiredOpponentGuns[index];
            retired.Gun.Step(
                false, retired.Shooter.State, playerState, FixedDeltaSeconds);
            RecordHitsOnPlayer(retired.Gun.HitsThisStep);
            if (retired.Gun.RoundsInFlight.Count == 0)
                _retiredOpponentGuns.RemoveAt(index);
        }
    }

    bool IsOpponentTargetLiveForHandoff(long targetId) {
        if (targetId == _primaryOpponentGunTargetId)
            return _opponentTerminalState == AircraftTerminalState.Flying
                && !_bandit.CatastrophicallyDamaged;
        Wingman? wingman = _wingmen.FirstOrDefault(candidate =>
            candidate.PlayerGunTargetId == targetId);
        return wingman?.StillFighting ?? false;
    }

    AircraftState OpponentTargetStateForHandoff(long targetId) {
        if (targetId == _primaryOpponentGunTargetId) return _bandit.State;
        Wingman? wingman = _wingmen.FirstOrDefault(candidate =>
            candidate.PlayerGunTargetId == targetId);
        return wingman?.Bandit.State ?? _bandit.State;
    }

    int CaptureReliefGunTargets() {
        int count = 1 + _wingmen.Count;
        if (_reliefGunTargets.Length < count)
            Array.Resize(ref _reliefGunTargets,
                Math.Max(count, _reliefGunTargets.Length * 2));
        _reliefGunTargets[0] = new GunTarget(
            _primaryOpponentGunTargetId,
            _bandit.State,
            Damageable: IsOpponentTargetLiveForHandoff(
                _primaryOpponentGunTargetId));
        for (int index = 0; index < _wingmen.Count; index++) {
            Wingman wingman = _wingmen[index];
            _reliefGunTargets[index + 1] = new GunTarget(
                wingman.PlayerGunTargetId,
                wingman.Bandit.State,
                Damageable: wingman.StillFighting);
        }
        return count;
    }

    void EnsureSelectedReliefGunTarget(GunKill gun) {
        if (IsOpponentTargetLiveForHandoff(gun.SelectedTargetId)) return;
        if (IsOpponentTargetLiveForHandoff(_primaryOpponentGunTargetId)) {
            gun.SelectTarget(_primaryOpponentGunTargetId);
            return;
        }
        Wingman? liveWingman = _wingmen.FirstOrDefault(
            static wingman => wingman.StillFighting);
        if (liveWingman is not null) {
            gun.SelectTarget(liveWingman.PlayerGunTargetId);
            return;
        }
        // Keep one real actor selected while the last airborne rounds age out. It is supplied as
        // non-damageable below, so this is identity continuity rather than resurrecting a target.
        gun.SelectTarget(_primaryOpponentGunTargetId);
    }

    void StepReliefGun() {
        if (_reliefFighter is not { Gun: { } gun } relief) return;
        EnsureSelectedReliefGunTarget(gun);
        long targetId = gun.SelectedTargetId;
        AircraftState targetState = OpponentTargetStateForHandoff(targetId);
        bool trigger = relief.StillFighting
            && IsOpponentTargetLiveForHandoff(targetId)
            && gun.AmmoRemaining > 0
            && gun.TargetAlive
            && relief.Actor.WantsToFire(
                ActorObservation.Capture(targetState, _tick));
        relief.TriggerDown = trigger;
        int targetCount = CaptureReliefGunTargets();
        gun.Step(
            trigger,
            relief.State,
            targetId,
            _reliefGunTargets.AsSpan(0, targetCount),
            FixedDeltaSeconds);
        foreach (IGrouping<long, GunImpact> impacts in
            gun.ImpactsThisStep.GroupBy(static impact => impact.TargetId)) {
            var context = PlayerGunTargetEventContext(impacts.Key);
            EmitEvent(SessionEventType.Hit, CombatRole.Relief, CombatRole.Opponent,
                impacts.Count(),
                entitySequence: context.EntitySequence,
                kinematics: context.State);
        }
    }

    void StepReliefTargetingOpponentGuns() {
        if (_reliefFighter is not { } relief
            || _reliefTargetingOpponentGuns.Count == 0)
            return;
        AircraftState reliefState = relief.State;
        ActorObservation observation =
            ActorObservation.Capture(reliefState, _tick);
        foreach ((long shooterId, ReliefTargetingOpponentGun record) in
            _reliefTargetingOpponentGuns) {
            GunKill gun = record.Gun;
            gun.SelectTarget(relief.SpawnSequence);
            bool trigger = relief.StillFighting
                && IsOpponentTargetLiveForHandoff(shooterId)
                && !record.Shooter.CatastrophicallyDamaged
                && gun.AmmoRemaining > 0
                && gun.TargetAlive
                && record.Shooter.WantsToFire(observation);
            if (shooterId == _primaryOpponentGunTargetId)
                _opponentTriggerDown = trigger;
            Wingman? wingman = _wingmen.FirstOrDefault(candidate =>
                candidate.PlayerGunTargetId == shooterId);
            if (wingman is not null) wingman.TriggerDown = trigger;
            _reliefOpponentTarget[0] = new GunTarget(
                relief.SpawnSequence,
                reliefState,
                Damageable: relief.StillFighting);
            gun.Step(
                trigger,
                record.Shooter.State,
                relief.SpawnSequence,
                _reliefOpponentTarget,
                FixedDeltaSeconds);
            RecordHitsOnRelief(gun.HitsThisStep);
        }
    }

    void RecordHitsOnRelief(int hits) {
        if (hits <= 0 || _reliefFighter is not { } relief) return;
        relief.HitsTaken += hits;
        EmitEvent(SessionEventType.Hit, CombatRole.Opponent, CombatRole.Relief,
            hits,
            entitySequence: relief.SpawnSequence,
            kinematics: relief.State);
        if (relief.HitsTaken < _beat.CombatRules.PlayerHitsToDefeat
            || !relief.StillFighting)
            return;
        relief.ApplyCatastrophicDamage(handedness: 1);
        EmitEvent(SessionEventType.Destroyed,
            CombatRole.Opponent, CombatRole.Relief,
            entitySequence: relief.SpawnSequence,
            kinematics: relief.State);
    }

    internal void RecordReliefHitsForTest(int hits) => RecordHitsOnRelief(hits);
    internal GunKill? ReliefTargetingOpponentGunForTest(long targetId) =>
        _reliefTargetingOpponentGuns.TryGetValue(targetId, out var record)
            ? record.Gun
            : null;

    void ObserveReliefCombatDamage() {
        if (_reliefFighter?.Gun is not { } gun) return;
        foreach (Wingman wingman in _wingmen) {
            if (!wingman.StillFighting
                || gun.DamageFor(wingman.PlayerGunTargetId).Outcome
                    != FightOutcome.Splash)
                continue;
            wingman.Defeated = true;
            wingman.TriggerDown = false;
            wingman.TerminalState = AircraftTerminalState.DestroyedAirborne;
            wingman.ImpactSurface = ImpactSurface.None;
            wingman.Bandit.ApplyCatastrophicDamage(handedness: -1);
            _reliefKills++;
            EmitEvent(SessionEventType.Destroyed,
                CombatRole.Relief, CombatRole.Opponent,
                entitySequence: wingman.PlayerGunTargetId,
                kinematics: wingman.Bandit.State);
        }

        if (gun.DamageFor(_primaryOpponentGunTargetId).Outcome
                == FightOutcome.Splash
            && _opponentTerminalState == AircraftTerminalState.Flying) {
            _reliefKills++;
            BeginCatastrophicDamage(
                CombatRole.Opponent, CombatRole.Relief);
        }
    }

    void ObserveCombatDamage() {
        ObserveReliefCombatDamage();
        foreach (Wingman wingman in _wingmen) {
            if (!wingman.StillFighting
                || _gunKill.DamageFor(wingman.PlayerGunTargetId).Outcome
                    != FightOutcome.Splash)
                continue;
            wingman.Defeated = true;
            wingman.TriggerDown = false;
            wingman.TerminalState = AircraftTerminalState.DestroyedAirborne;
            wingman.ImpactSurface = ImpactSurface.None;
            wingman.Bandit.ApplyCatastrophicDamage(handedness: -1);
            _killCount++;
            _splashCueUntilMs = _simTimeMs + 3000.0;
            EmitEvent(SessionEventType.Destroyed,
                CombatRole.Player, CombatRole.Opponent,
                entitySequence: wingman.PlayerGunTargetId,
                kinematics: wingman.Bandit.State);
        }

        if (_enemyPairCoordinator.Active
            && (_opponentTerminalState != AircraftTerminalState.Flying
                || _bandit.CatastrophicallyDamaged
                || _wingmen.Count(static wingman => wingman.StillFighting) != 1))
            ClearFormationCoordination();

        if (_gunKill.DamageFor(_primaryOpponentGunTargetId).Outcome
                == FightOutcome.Splash
            && _opponentTerminalState == AircraftTerminalState.Flying) {
            if (_droneRaidEvaluation is { Finished: false }) {
                ResolveDroneRaidTarget(neutralized: true,
                    TimeSeconds + FixedDeltaSeconds);
            } else {
                _killCount++;
                BeginCatastrophicDamage(CombatRole.Opponent, CombatRole.Player);
            }
        }
        EnsureSelectedPlayerGunTarget();
        if (PlayerHitsTaken >= _beat.CombatRules.PlayerHitsToDefeat
            && _playerTerminalState == AircraftTerminalState.Flying) {
            if (_recoveryAttemptActive) _attemptHadSetback = true;
            BeginCatastrophicDamage(CombatRole.Player, CombatRole.Opponent);
        }
        UpdatePendingOutcome();
        CompleteEngagementIfEnded();
    }

    void BeginCatastrophicDamage(
        CombatRole target,
        CombatRole source,
        bool promoteFormationSurvivor = true) {
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
            // Terminal ownship is no longer a tactical contact. Clear both the coordinator and
            // every held directive on the destruction edge, not one tick later (and never continue
            // radio updates against the falling wreck).
            ClearFormationCoordination();
        } else if (target == CombatRole.Opponent) {
            if (_opponentTerminalState != AircraftTerminalState.Flying) return;
            bool replacementExpected = !CombatHandoffRequested
                && (_beat.ContinuousCombat is not null
                    || _wingmen.Any(static wingman => wingman.StillFighting))
                && _playerTerminalState == AircraftTerminalState.Flying;
            BeginTerminalClock(
                clearHeldInput: !replacementExpected && !CombatHandoffRequested);
            _opponentTerminalState = AircraftTerminalState.DestroyedAirborne;
            _bandit.ApplyCatastrophicDamage(handedness: 1);
            ClearFormationCoordination();
            _splashCueUntilMs = _simTimeMs + 3000.0;
            if (replacementExpected) {
                double delaySeconds = _beat.ScriptedIntercept?.KillCameraSeconds
                    ?? _beat.ContinuousCombat!.ReplacementDelaySeconds;
                if (!double.IsFinite(delaySeconds) || delaySeconds < 0.0)
                    throw new InvalidOperationException(
                        "Continuous-combat replacement delay must be finite and non-negative.");
                _nextOpponentSpawnAtMs = _simTimeMs + delaySeconds * 1000.0;
            }
        } else return;
        EmitEvent(SessionEventType.Destroyed, source, target);
        if (target == CombatRole.Opponent
            && promoteFormationSurvivor
            && _playerTerminalState == AircraftTerminalState.Flying)
            TryPromoteWingmanToPrimary();
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
            DetachCurrentOpponent(AircraftTerminalState.Flying, ImpactSurface.None);
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
        _primaryOpponentGunTargetId = AllocateOpponentGunTargetId();
        _selectedPlayerGunTargetId = _primaryOpponentGunTargetId;
        RegisterFormationGunTargets();
        _gunKill.SelectTarget(_selectedPlayerGunTargetId);
        _opponentTerminalState = AircraftTerminalState.Flying;
        _opponentImpactSurface = ImpactSurface.None;
        _banditSpawnSequence++;
        _padlockRollAssist.Reset();
        _lastRange = Geometry.Range(_player.State, SelectedOpponentState);
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
        ActorObservation.Capture(
            state,
            Tick,
            contactIdentity: PolicyContactIdentity(
                _playerSpawnSequence,
                PolicyContactClass.Player));

    enum PolicyContactClass : byte {
        Player = 0,
        RapierGunDrone = 1,
        ReliefFighter = 2,
        Opponent = 3,
    }

    static long PolicyContactIdentity(
        long spawnSequence,
        PolicyContactClass contactClass) {
        if (spawnSequence <= 0) return 0;
        // Four disjoint lanes leave room for another friendly target class without renumbering
        // persisted decision traces. Every source counter is monotonic, so identity survives
        // kinematic coincidence but changes on replacement or player-to-relief handoff.
        return spawnSequence * 4L + (long)contactClass;
    }

    void UpdatePendingOutcome() {
        bool playerLost = _playerTerminalState != AircraftTerminalState.Flying;
        bool opponentLost = _opponentTerminalState != AircraftTerminalState.Flying;
        if (CombatHandoffRequested) {
            // Handoff is not a player victory condition. A surviving pilot remains in the same
            // physical sortie through remote relief combat and RTB; a lost pilot still loses.
            _pendingOutcome = playerLost
                ? SortieOutcome.Defeat
                : SortieOutcome.None;
            return;
        }
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

    bool RegisterPlayerNaturalSurfaceImpact() {
        if (_playerTerminalState != AircraftTerminalState.Flying) return false;
        var contact = DetectNaturalSurface(_player.State);
        if (contact.surface == ImpactSurface.None) return false;
        RegisterUndamagedCrash(CombatRole.Player, contact.surface,
            Vec3D.Zero, contact.height);
        return true;
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
            && !CombatHandoffRequested
            && (_beat.ContinuousCombat is not null
                || _wingmen.Any(static wingman => wingman.StillFighting))
            && _playerTerminalState == AircraftTerminalState.Flying;
        bool opponentLostDuringHandoff =
            target == CombatRole.Opponent && CombatHandoffRequested;
        BeginTerminalClock(clearHeldInput:
            !replacementExpected && !opponentLostDuringHandoff);
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
            && !CombatHandoffRequested
            && _playerTerminalState == AircraftTerminalState.Flying
            && _droneRaidEvaluation is null
            && (_beat.ContinuousCombat is not null
                || _beat.UsesReactiveBandit || _beat.UsesNeutralMergeBandit);
        bool reliefManeuverKill = target == CombatRole.Opponent
            && CombatHandoffActive
            && _reliefFighter is { StillFighting: true }
            && _droneRaidEvaluation is null;
        if (maneuverKill) _killCount++;
        if (reliefManeuverKill) _reliefKills++;
        BeginCatastrophicDamage(target,
            maneuverKill ? CombatRole.Player
                : reliefManeuverKill ? CombatRole.Relief
                : CombatRole.None,
            promoteFormationSurvivor: false);
        StartWreckContact(target, surface, surfaceVelocity, surfaceHeightM,
            tangentialImpulseAlreadyResolved, carrierSolid);
        if (target == CombatRole.Opponent
            && _playerTerminalState == AircraftTerminalState.Flying)
            TryPromoteWingmanToPrimary();
        UpdatePendingOutcome();
        CompleteEngagementIfEnded();
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
                ResolvePlayerCarrierSolid(surface, carrierSolid),
                _terrainSurface);
            _playerCarrierSolid = _playerWreckMotion.CarrierSolid;
            _player.AdoptExternalKinematics(_playerWreckMotion.State);
        } else {
            _opponentTerminalState = AircraftTerminalState.Impacted;
            _opponentImpactSurface = surface;
            _bandit.ApplySurfaceImpact(surface, surfaceVelocity, surfaceHeightM, contactCarrier,
                _terrainSurface);
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
        for (int i = _detachedOpponentWrecks.Count - 1; i >= 0; i--) {
            DetachedOpponentWreck wreck = _detachedOpponentWrecks[i];
            if (wreck.TerminalState is AircraftTerminalState.Settled
                or AircraftTerminalState.SimulationBounded)
                continue;

            AircraftState previous = wreck.Actor.State;
            if (AtmosphereBoundaryReached(previous, wreck.Actor.Atmosphere)) {
                wreck.TerminalState = AircraftTerminalState.SimulationBounded;
                wreck.ImpactSurface = ImpactSurface.SimulationBoundary;
                EmitEvent(SessionEventType.TerminalLimitReached,
                    CombatRole.None, CombatRole.Opponent,
                    surface: ImpactSurface.SimulationBoundary,
                    entitySequence: wreck.SpawnSequence,
                    kinematics: previous);
                continue;
            }
            wreck.Actor.Step(ObservePlayer(_player.State), FixedDeltaSeconds);
            AircraftState current = wreck.Actor.State;
            if (wreck.TerminalState == AircraftTerminalState.Flying
                && Geometry.Range(_player.State, current)
                    > DetachedOpponentEgressRangeM) {
                _detachedOpponentWrecks.RemoveAt(i);
                continue;
            }
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
                        contact.velocity, contact.height, contactCarrier, _terrainSurface);
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
        // The relief result is deliberately not a terminal player result. Keep the same airframe,
        // fuel, damage and control authority alive through RTB and the external recovery model.
        // CompletePlayerRecovery records that model's success but does not fabricate a combat win.
        if (CombatHandoffRequested
            && _playerTerminalState == AircraftTerminalState.Flying)
            return false;
        // A finite Rapier formation kill is the turn point, not the finish line. Keep the
        // surviving aircraft fully flyable through RTB and arrestment; the ordinary recovery path
        // owns the final victory event. A later ownship loss still resolves normally.
        if (_beat.ScriptedIntercept is { RecoveryRequired: true }
            && _playerTerminalState == AircraftTerminalState.Flying
            && _opponentTerminalState != AircraftTerminalState.Flying)
            return false;
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
        bool ownshipRecoveryConstrained = _playerTerminalState == AircraftTerminalState.Flying
            && (_arrestment.Phase == ArrestmentModel.ArrestmentPhase.Arrested
                || _catapult.IsActive
                || _conventionalRunwayRecovery?.Phase
                    == RunwayRecoveryPhase.Rollout);
        if (ownshipRecoveryConstrained
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

        // A formation is not beaten because its leader is: promote a survivor and keep the SAME
        // engagement running. Only when the last of them is down does a replacement wave stage,
        // so a 1v2 counts as one fight and one entry in the pilot's record.
        if (_wingmen.Any(static wingman => wingman.StillFighting)) {
            if (TryPromoteWingmanToPrimary()) {
                _nextOpponentSpawnAtMs = double.NegativeInfinity;
                return true;
            }
        }
        if (_beat.ContinuousCombat is null) {
            _nextOpponentSpawnAtMs = double.NegativeInfinity;
            return false;
        }

        int nextEngagement = _engagementNumber + 1;
        CompleteEngagementIfEnded();
        DetachCurrentOpponent(_opponentTerminalState, _opponentImpactSurface);
        SpawnSpec directorSpawn = _fightDirector.NextSpawn(nextEngagement);
        LastDirectorSpawn = directorSpawn;
        _bandit = _beat.CreateNextBandit(
            _player.State, nextEngagement, _terrainSurface, directorSpawn);
        _primaryOpponentGunTargetId = AllocateOpponentGunTargetId();
        _selectedPlayerGunTargetId = _primaryOpponentGunTargetId;
        StageWingmen(directorSpawn, nextEngagement);
        ConfigureFormationLookaheadCadence();
        // Spike opponents of either flavour (cat or machine) carry the report quarantine: an
        // expected loss to one must not crater the ordinary-fight skill estimate.
        bool spikeOpponent = directorSpawn.Boss || directorSpawn.Machine;
        _bandit.Wind = _player.Wind;
        _bandit.Atmosphere = _player.AtmosphereModel;
        _gunKill = _gunKill.Outcome == FightOutcome.Splash
            ? _gunKill.CreateForStagedNextTarget()
            : _gunKill.CreateForRetargetedTarget();
        RegisterFormationGunTargets();
        _gunKill.SelectTarget(_selectedPlayerGunTargetId);
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
        StartEngagementCounters(directorSpawn.Skill, spikeOpponent);
        _banditSpawnSequence++;
        _padlockRollAssist.Reset();
        _lastRange = Geometry.Range(_player.State, SelectedOpponentState);
        _closureKts = _closureSmooth = 0.0;
        _gunneryPitchAssistState = GunneryPitchAssistState.Inactive();
        EmitEvent(SessionEventType.OpponentSpawned,
            CombatRole.None, CombatRole.Opponent, count: nextEngagement);
        ShowTransition($"BANDIT {nextEngagement} INBOUND · V PADLOCK", 2600.0);
        return true;
    }

    void StartEngagementCounters(PilotSkill opponentSkill, bool opponentWasBoss) {
        _engagementCounters = new EngagementCounters {
            Active = true,
            EngagementNumber = _engagementNumber,
            OpponentSkill = opponentSkill,
            OpponentWasBoss = opponentWasBoss,
            PlayerHitsTakenAtStart = PlayerHitsTaken,
            ShotsTotalAtStart = _shotsTotal,
            ShotsInWindowAtStart = _shotsInWindow,
            OvershootsAtStart = _visualMergeEvaluation?.Overshoots ?? 0,
            GcasActivationsAtStart = _autoGcasState.ActivationCount
        };
    }

    void AccumulateEngagementCounters() {
        if (!_engagementCounters.Active) return;
        _engagementCounters.DurationSeconds += FixedDeltaSeconds;
        if ((_opponentTerminalState == AircraftTerminalState.Flying
                && _opponentGun.GunSolution)
            || _wingmen.Any(static wingman =>
                wingman.StillFighting && wingman.Gun.GunSolution))
            _engagementCounters.SolutionSecondsConceded += FixedDeltaSeconds;
    }

    void CompleteEngagementIfEnded() {
        if (!_engagementCounters.Active) return;
        bool playerLost = _playerTerminalState != AircraftTerminalState.Flying;
        bool opponentLost = _opponentTerminalState != AircraftTerminalState.Flying
            && !_wingmen.Any(static wingman => wingman.StillFighting);
        if (!playerLost && !opponentLost) return;

        SortieOutcome outcome = playerLost && opponentLost ? SortieOutcome.Draw
            : opponentLost ? SortieOutcome.Victory
            : SortieOutcome.Defeat;
        EngagementReport report = BuildEngagementReport(
            outcome, EngagementEndReason.CombatResult);
        _engagementReports.Add(report);
        if (report.EligibleForLearning)
            _fightDirector.Observe(in report);
        _engagementCounters.Active = false;
    }

    void CompleteInterruptedEngagementForHandoff() {
        if (!_engagementCounters.Active) return;
        EngagementReport report = BuildEngagementReport(
            SortieOutcome.None, EngagementEndReason.PlayerHandoff);
        _engagementReports.Add(report);
        // Deliberately no FightDirector.Observe: the pilot ended the sample before either combatant
        // won, so treating it as a draw/loss would corrupt both pacing and the skill estimate.
        _engagementCounters.Active = false;
    }

    EngagementReport BuildEngagementReport(
        SortieOutcome outcome,
        EngagementEndReason endReason) =>
        new(
            _engagementCounters.EngagementNumber,
            _engagementCounters.OpponentSkill,
            _engagementCounters.OpponentWasBoss,
            outcome,
            _engagementCounters.DurationSeconds,
            _engagementCounters.SolutionSecondsConceded,
            Math.Max(0,
                PlayerHitsTaken - _engagementCounters.PlayerHitsTakenAtStart),
            Math.Max(0, _shotsTotal - _engagementCounters.ShotsTotalAtStart),
            Math.Max(0, _shotsInWindow - _engagementCounters.ShotsInWindowAtStart),
            Math.Max(0, (_visualMergeEvaluation?.Overshoots ?? 0)
                - _engagementCounters.OvershootsAtStart),
            _visualMergeEvaluation?.MinimumEnergyKias ?? double.PositiveInfinity,
            Math.Max(0, _autoGcasState.ActivationCount
                - _engagementCounters.GcasActivationsAtStart),
            endReason);

    void DetachCurrentOpponent(AircraftTerminalState terminalState,
        ImpactSurface impactSurface) {
        _detachedOpponentWrecks.Add(new DetachedOpponentWreck(
            _bandit, _banditSpawnSequence, terminalState, impactSurface));
        while (_detachedOpponentWrecks.Count > 8) {
            int settledIndex = _detachedOpponentWrecks.FindIndex(
                static wreck => wreck.TerminalState is AircraftTerminalState.Settled
                    or AircraftTerminalState.SimulationBounded);
            if (settledIndex < 0) break;
            _detachedOpponentWrecks.RemoveAt(settledIndex);
        }
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

    void ForceTerminalLimit(CombatRole target, bool includeFlying = false) {
        AircraftTerminalState state = target == CombatRole.Player
            ? _playerTerminalState : _opponentTerminalState;
        if ((!includeFlying && state == AircraftTerminalState.Flying)
            || state is AircraftTerminalState.Settled
                or AircraftTerminalState.SimulationBounded)
            return;
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

    /// The turbo-ramjet's handover is the single most characteristic thing this aircraft does, and
    /// until now nothing told the pilot it had happened — thrust simply stopped behaving like a
    /// turbojet somewhere around M1.6 and there was no way to know why. These are announcements of
    /// a transition that ALREADY happened in the propulsion map; they change no physics and they
    /// only ever count upward, so a decelerating aircraft does not strobe the banner at a boundary.
    void UpdateRamTransitionCue() {
        if (_beat.PlayerAir.PropulsionModel
            != PropulsionModelKind.TurboRamjetPublicDataSurrogate) return;
        double mach = AirData.MachNumber(_player.State.Speed, _player.State.Position.Y);
        int stage = mach >= Propulsion.TurboRamjetPerformanceMap.TurbineGoneMach ? 3
            : mach >= Propulsion.TurboRamjetPerformanceMap.FullRamMach ? 2
            : mach >= Propulsion.TurboRamjetPerformanceMap.RamFadeStartMach ? 1
            : 0;
        if (stage <= _ramCueStage) return;
        _ramCueStage = stage;
        // Formatted from the constants, never hardcoded. These said M1.6 / M2.2 after the fade band
        // moved to 1.85-2.15, so the banner announced a handover at a Mach it no longer happened at.
        ShowTransition(stage switch {
            1 => $"RAM LIGHT · M{Propulsion.TurboRamjetPerformanceMap.RamFadeStartMach:F2}",
            2 => $"FULL RAM · M{Propulsion.TurboRamjetPerformanceMap.FullRamMach:F2}",
            _ => "TURBINE OFFLINE · RAM ONLY"
        }, 2600.0);
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
        // The ENGINE's spooled fraction (physical, saturates at 1.0) and the pilot's LEVER position
        // (can sit in augmentation above 1.0) are different quantities. Seeding the new engine from
        // the old spool is right; resetting the LEVER from it is not — it silently pulled any
        // afterburning aircraft back to military power at the exact moment it left the catapult,
        // which never showed because every previous deck aircraft stops at 1.0 anyway.
        double retainedEnginePower = _player.ThrustFraction;
        double retainedLever = _detents.Throttle;
        if (_carrier is { IsMaritime: true }) {
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
        ResetFlightControls(approachMode: false, initialThrottle: retainedLever);
        SelectAutomaticConfigurationTarget(FlightConfigurationTarget.Combat);
        _recoveryAttemptActive = _carrier is not null;
        _attemptHadSetback = false;
        _attemptCleanRecorded = false;
        _lastRange = Geometry.Range(_player.State, SelectedOpponentState);
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
        // Prediction runs at flight-computer cadence, but the bottom-out instrument samples the
        // physical aircraft and terrain on every 120 Hz authority tick throughout a fly-up.
        SampleAutoGcasFlyUpClearance();
        // Pilot rule (2026-07-23): ANY control input sustained longer than 0.2 s cancels an
        // ACTIVE fly-up — sustained input during recovery IS the paddle. Runs every tick,
        // ahead of the prediction cadence, so the release is immediate.
        PilotCommand rawCommand = _detents.Command;
        bool rawInputPresent = rawCommand.EnvelopeOverride
            || System.Math.Abs(rawCommand.RollControl) > 0.05
            || System.Math.Abs(rawCommand.Rudder) > 0.05
            || rawCommand.GDemand >= 2.0
            || rawCommand.GDemand <= 0.0;
        if (_autoGcasState.Active && rawInputPresent
            && _pilotPhysiology.State.ControlAuthority01 >= 0.55)
            _pilotInputOverrideSeconds += FixedDeltaSeconds;
        else
            _pilotInputOverrideSeconds = 0.0;
        bool sustainedInputPaddle = _pilotInputOverrideSeconds >= 0.2;
        bool immediatePaddle = _autoGcasState.Active
            && (AutoGcasOverrideHeld || sustainedInputPaddle);
        // The low-level standby latch runs every tick, ahead of the prediction cadence, so a
        // careful gate crossing is recognised at the crossing rather than a prediction later.
        UpdateGcasLowLevelStandby();
        if (_autoGcasPredictionTicksRemaining > 0 && !immediatePaddle) {
            _autoGcasPredictionTicksRemaining--;
            if (_autoGcasState.Active) {
                _gunneryPitchAssistState = GunneryPitchAssistState.Inactive(
                    effectivePilotCommand.GDemand);
            }
            if (_autoGcasState.Warning || _autoGcasState.Active)
                _padlockRollAssist.Reset();
            // The recovery command owns the lever: at speed it commands idle (popping the
            // automatic speed brake) as part of the save; at low energy it carries the
            // pilot's lever forward from the prediction tick.
            return _autoGcasRecoveryCommand is { } heldRecovery
                ? heldRecovery
                : effectivePilotCommand;
        }

        AutoGcasState previous = _autoGcasState;
        // "Actively flying" means the pilot is conscious with control authority AND the HUMAN is
        // currently commanding the aircraft. This must read the raw detent-layer command, never
        // the effective command: gunnery pitch assist adds up to 3.5 G and lateral authority of
        // its own, so a hands-off pilot fixated near a target would otherwise be classified as
        // attentive and lose the conservative backstop — the exact state Auto-GCAS exists for.
        PilotCommand humanCommand = _detents.Command;
        // Assisted flight IS attentive flight: the autopilot holds corner and pulls about-right
        // on purpose, and a rung-1 pilot has no Space key to declare intent with — without this,
        // portrait pilots always got the full conservative boundary and the 12 G snatch bounced
        // them off every low fight. G-LOC still restores full protection via the authority gate.
        bool pilotActivelyFlying = _pilotPhysiology.State.ControlAuthority01 >= 0.55
            && (_assistedFlight
                || humanCommand.EnvelopeOverride
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
                Enabled: _autoGcasEnabled,
                ConfigurationPermitsRecovery: _carrier is null,
                PilotOverrideHeld: AutoGcasOverrideHeld || sustainedInputPaddle,
                IndicatedAirspeedMps: _player.IndicatedAirspeedMps,
                PilotActivelyFlying: pilotActivelyFlying,
                LowLevelStandby: _gcasLowLevelStandby),
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
        if (!previous.Active && _autoGcasState.Active) {
            _autoGcasFlyUpMinimumClearanceM = double.PositiveInfinity;
            SampleAutoGcasFlyUpClearance();
        } else if (previous.Active && !_autoGcasState.Active) {
            _lastAutoGcasFlyUpBottomClearanceM =
                double.IsFinite(_autoGcasFlyUpMinimumClearanceM)
                    ? _autoGcasFlyUpMinimumClearanceM
                    : null;
            _completedAutoGcasFlyUpCount++;
            _autoGcasFlyUpMinimumClearanceM = double.PositiveInfinity;
        }
        if (_autoGcasState.Active)
            _gunneryPitchAssistState = GunneryPitchAssistState.Inactive(
                effectivePilotCommand.GDemand);
        if (_autoGcasState.Warning || _autoGcasState.Active)
            _padlockRollAssist.Reset();
        return _autoGcasRecoveryCommand is { } recovery
            ? recovery
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

    // Pilot authority over the backstop itself ("it's a combat sim"): the system defaults on,
    // and a conscious pilot may stand it down entirely from settings. K/Space remain the
    // in-flight refusals.
    bool _autoGcasEnabled = true;
    public void SetAutoGcasEnabled(bool enabled) => _autoGcasEnabled = enabled;
    double _pilotInputOverrideSeconds;

    void SampleAutoGcasFlyUpClearance() {
        if (!_autoGcasState.Active) return;

        double clearanceM = double.PositiveInfinity;
        if (_terrainSurface is not null && _terrainSurface.TrySample(
            _player.State.Position.X, _player.State.Position.Z, out TerrainSample sample))
            clearanceM = _player.State.Position.Y - sample.HeightM;
        else if (_terrainSurface is null)
            clearanceM = _player.State.Position.Y;

        if (double.IsFinite(clearanceM))
            _autoGcasFlyUpMinimumClearanceM =
                System.Math.Min(_autoGcasFlyUpMinimumClearanceM, clearanceM);
    }

    // Low-level standby v2 (pilot doctrine, 2026-07-23 flight reports): Auto-GCAS is a failsafe
    // for "I got disoriented while dogfighting", not a low-flying governor. The Build-83 LATCH
    // (careful crossing + timed re-arm) still fought the pilot: an aggressive descent never
    // latched it, and its 5-second re-arm silently re-armed the system every time a ridge fell
    // away underneath a valley run. v2 is a continuous rule with no memory to mis-latch:
    //
    //   conscious + unassisted + hands-on + below 1000 ft AO  =>  the low block is the pilot's.
    //
    // Hands leave the controls for a few seconds, or G-LOC drops control authority, and full
    // protection is back within a prediction tick — exactly the disoriented/unconscious case the
    // system exists for. Above the gate the system is always armed (with the attentive-pilot
    // boundary as ever). The deliberate trade stands: a conscious hands-on CFIT below the gate
    // is the pilot's own. Assisted (rung-1) flight never stands down: the portrait autopilot has
    // no terrain logic of its own. "Hands-on" reads the raw detent command — any non-neutral
    // pitch demand, roll, rudder, or override counts; only a fully released, trimmed-neutral
    // stick goes hands-off.
    const double GcasStandbyGateClearanceM = 304.8;      // 1000 ft AO
    const double GcasStandbyRearmClearanceM = 335.28;    // 1100 ft — hysteresis so the chip never flaps
    // Telemetry-set (web-1784790165022): this pilot flies deliberate valley stretches on a
    // literally neutral stick for seconds at a time — a short input memory re-armed the system
    // mid-run and it fired at 204 ft under a stable path. Once the pilot has claimed the low
    // block hands-on, it stays theirs through quiet stretches; G-LOC hands the watch back
    // IMMEDIATELY through the authority gate regardless of this window, which is the real
    // unconscious-pilot detector. Only a long fully-idle stretch lets the machine reclaim it.
    const double GcasStandbyInputMemorySeconds = 20.0;
    bool _gcasLowLevelStandby;
    double _gcasTimeSinceStandbyInputSeconds = double.PositiveInfinity;
    public bool AutoGcasLowLevelStandby => _gcasLowLevelStandby;

    void UpdateGcasLowLevelStandby() {
        PilotCommand human = _detents.Command;
        bool handsOn = human.EnvelopeOverride
            || System.Math.Abs(human.RollControl) > 0.02
            || System.Math.Abs(human.Rudder) > 0.02
            || System.Math.Abs(human.GDemand - 1.0) > 0.05;
        _gcasTimeSinceStandbyInputSeconds = handsOn
            ? 0.0 : _gcasTimeSinceStandbyInputSeconds + FixedDeltaSeconds;

        double clearanceM = double.PositiveInfinity;
        if (_terrainSurface is not null && _terrainSurface.TrySample(
            _player.State.Position.X, _player.State.Position.Z, out TerrainSample sample))
            clearanceM = _player.State.Position.Y - sample.HeightM;
        else if (_terrainSurface is null)
            clearanceM = _player.State.Position.Y;

        double gateM = _gcasLowLevelStandby
            ? GcasStandbyRearmClearanceM : GcasStandbyGateClearanceM;
        _gcasLowLevelStandby = double.IsFinite(clearanceM)
            && clearanceM < gateM
            && !_assistedFlight
            && _pilotPhysiology.State.ControlAuthority01 >= 0.55
            && _gcasTimeSinceStandbyInputSeconds <= GcasStandbyInputMemorySeconds
            && !_autoGcasState.Active;
    }

    PilotCommand ApplyGunneryPitchAssist(in PilotCommand requestedPilotCommand) {
        AircraftState selectedTarget = SelectedOpponentState;
        bool enabled = PlayerWeaponsAuthorized
            && _beat.CombatRules.PlayerGunEnabled
            && _playerTerminalState == AircraftTerminalState.Flying
            && SelectedOpponentAlive
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
            Geometry.Range(_player.State, selectedTarget),
            enabled,
            lateralRollEnabled: !padlockOwnsRollPlane,
            closureMps: _closureKts / 1.94384);
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
            _detents.AssistedTargetNoseAngleRad = double.NaN;
            return;
        }
        _detents.AssistedCalibratedAirspeedMps = _player.IndicatedAirspeedMps;
        double cornerKias = AirData.PositiveCornerSpeedKiasAtAltitude(
            _player.State.Mass, _beat.PlayerAir, _player.State.Position.Y,
            PlayerEffectiveAerodynamicConfiguration.PositiveLiftCoefficientIncrement,
            _player.AtmosphereModel);
        _detents.AssistedTargetCalibratedAirspeedMps =
            (cornerKias + AssistedSpeedBiasKts) / AirData.MpsToKnots;

        AircraftState selectedTarget = SelectedOpponentState;
        Vec3D toTarget = selectedTarget.Position - _player.State.Position;
        double rangeSquared = toTarget.Dot(toTarget);
        bool targetValid = SelectedOpponentAlive
            && rangeSquared > 1e-12;
        double noseDot = targetValid
            ? _player.BodyForward.Dot(toTarget * (1.0 / Math.Sqrt(rangeSquared)))
            : double.NaN;
        _detents.AssistedTargetWithinNoseCone = targetValid && noseDot >= 0.5;
        _detents.AssistedTargetNoseAngleRad = targetValid
            ? Math.Acos(Math.Clamp(noseDot, -1.0, 1.0)) : double.NaN;
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
        UpdateRamTransitionCue();
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
        var (along, cross, height) =
            _carrier.LandingAircraftSupportFrame(_player.State.Position);
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
        var previousDeck = _carrier.AircraftSupportFrame(previousPlayerState.Position);
        var currentDeck = _carrier.AircraftSupportFrame(_player.State.Position);
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
        // The recovery platform owns its deck, round-down and other solid contacts. Away from that
        // geometry, however, a land strip must not inherit the carrier classifier's sea-level
        // fallback: streamed terrain is authoritative for both land and water. Resolve this here
        // because terminal-phase carrier sorties do not pass through the free-flight collision
        // branch below.
        bool naturalSurfaceOwnsContact = solid == Carrier.SolidCollision.None
            && contact is Carrier.Recovery.Flying or Carrier.Recovery.InTheWater
            && !_carrier.WithinDeckFootprint(_player.State.Position);
        if (naturalSurfaceOwnsContact && RegisterPlayerNaturalSurfaceImpact()) return;

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
            var (along, cross, height) =
                _carrier.AircraftSupportFrame(_player.State.Position);
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
                ApplyCarrierConfigurationAutomation(inSlot);
                var (along, _, height) =
                    _carrier.LandingAircraftSupportFrame(_player.State.Position);
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
            _detents.AerodynamicConfiguration =
                PlayerEffectiveAerodynamicConfiguration;
            ConfigureAssistedFlightDetents();
            _detents.Tick(_keys, _simTimeMs, _player.State, _beat.PlayerAir,
                _advice, FixedDeltaSeconds);
            if (_waveOffArmed && _detents.Throttle >= 0.95
                && !RapierAutomationActive) {
                _waveOffUntilMs = _simTimeMs + 5000.0;
                _waveOffArmed = false;
                SelectAutomaticConfigurationTarget(FlightConfigurationTarget.Combat);
                if (_recoveryAttemptActive) _attemptHadSetback = true;
            }
            _cue = _prompts.Cue(_advice, _detents.Command, _detents.Tier);
            PilotCommand directedCommand = RapierAutomationOr(_detents.Command);
            PilotCommand assistedCommand = ApplyGunneryPitchAssist(directedCommand);
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

        if (_opponentTerminalState != AircraftTerminalState.SimulationBounded
            && AtmosphereBoundaryReached(_bandit.State, _bandit.Atmosphere))
            ForceTerminalLimit(CombatRole.Opponent, includeFlying: true);
        StepReliefFighter();
        if (_opponentTerminalState != AircraftTerminalState.SimulationBounded)
            _bandit.Step(
                ThreatObservationFor(previousPlayer, previousOpponent),
                FixedDeltaSeconds);
        StepWingmen(previousPlayer);
        AccumulateEngagementCounters();
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
            } else if (!TryBeginConventionalRunwayContact(previousPlayer)) {
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
        UpdateSelectedTargetClosure();
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
            UpdateSelectedTargetClosure();
            FinishTerminalIfResolved(completedTimeMs);
        }
        _simTimeMs = completedTimeMs;
    }

    /// <summary>
    /// Give the authored conventional runway first refusal over a swept surface crossing. The
    /// runway owns only its finite pavement rectangle; a miss remains ordinary terrain contact.
    /// </summary>
    bool TryBeginConventionalRunwayContact(in AircraftState previousPlayer) {
        ConventionalRunwayRecoveryModel? recovery = _conventionalRunwayRecovery;
        if (recovery is null
            || recovery.Phase != RunwayRecoveryPhase.Airborne
            || _playerTerminalState != AircraftTerminalState.Flying)
            return false;
        if (!recovery.TryTouchdown(
                previousPlayer,
                _player.State,
                _systems.AllGearDownAndLocked,
                _player.AirspeedMps))
            return false;

        if (recovery.Phase == RunwayRecoveryPhase.Crashed) {
            RegisterUndamagedCrash(
                CombatRole.Player,
                ImpactSurface.Ground,
                Vec3D.Zero,
                recovery.Runway.Threshold.Y);
            return true;
        }

        _player.AdoptExternalKinematics(recovery.State);
        _detents.ApproachMode = false;
        _gunneryPitchAssistState = GunneryPitchAssistState.Inactive();
        _banditPadlockRollAssistSelected = false;
        _padlockRollAssist.Reset();
        ShowTransition("TOUCHDOWN · IDLE FOR WHEEL BRAKING", 2600.0);
        return true;
    }

    void FinishConventionalRunwaySortie() {
        if (_conventionalRunwayRecovery?.Phase != RunwayRecoveryPhase.Recovered
            || Lifecycle != LifecycleState.Active
            || _playerTerminalState != AircraftTerminalState.Flying)
            return;

        // A runway stop is not mission completion by itself. Only an accepted handoff which has
        // actually reached player-RTB authority may discontinue the fight; otherwise ownship stays
        // physically stopped and vulnerable on the runway while the combat session remains live.
        if (!CompletePlayerRecovery()) return;

        // A guns-only handoff is a deliberate discontinue, not a combat victory. The relief's
        // result remains separately attributed; the player's own mission ends only after physical
        // recovery and with the live fuel quantity still available to the debrief.
        _pendingOutcome = SortieOutcome.Discontinued;
        _outcome = SortieOutcome.Discontinued;
        EmitEvent(
            SessionEventType.SortieFinished,
            CombatRole.None,
            CombatRole.None,
            outcome: _outcome);
        ClearHeldInput();
        Lifecycle = LifecycleState.Finished;
    }

    void StepConventionalRunwayRollout() {
        ConventionalRunwayRecoveryModel recovery =
            _conventionalRunwayRecovery
            ?? throw new InvalidOperationException(
                "Conventional runway rollout requires a staged recovery model.");
        AircraftState playerState = _player.State;
        AircraftState opponentState = _bandit.State;

        _advice = _beat.Law.Advise(
            playerState, opponentState, _beat.PlayerAir, _player.AirspeedMps);
        _detents.AirspeedMps = _player.AirspeedMps;
        _detents.MeasuredAngleOfAttackRad = _player.AngleOfAttackRad;
        _detents.AerodynamicConfiguration = PlayerEffectiveAerodynamicConfiguration;
        _detents.Tick(
            _keys,
            _simTimeMs,
            playerState,
            _beat.PlayerAir,
            _advice,
            FixedDeltaSeconds);
        _cue = _prompts.Cue(_advice, _detents.Command, _detents.Tier);

        PreparePlayerForPoweredTick();
        _player.AdvanceEngineOnly(_detents.Throttle, FixedDeltaSeconds);
        StepWeapons(
            playerState,
            opponentState,
            playerTriggerHeld: false,
            allowNewFire: !TerminalPhaseActive);
        Vec3D airVelocity = playerState.VelocityVector()
            - (_player.Wind?.Sample(playerState.Position) ?? Vec3D.Zero);
        ConsumeFuelAndStepSystems(
            playerState,
            airVelocity.Length,
            weightOnWheels: true);
        StepRapierGunDrone(
            opponentState,
            _opponentTerminalState == AircraftTerminalState.Flying);
        StepReliefFighter();
        if (_opponentTerminalState != AircraftTerminalState.SimulationBounded)
            _bandit.Step(
                ThreatObservationFor(playerState, opponentState),
                FixedDeltaSeconds);
        StepWingmen(playerState);
        AccumulateEngagementCounters();

        AircraftState constrained = recovery.Step(
            FixedDeltaSeconds,
            _detents.Throttle,
            _player.State.Mass);
        _player.AdoptExternalKinematics(constrained);
        StepPilotPhysiology(1.0);
        ObserveCombatDamage();

        if (_playerTerminalState == AircraftTerminalState.DestroyedAirborne) {
            RegisterAirborneImpact(
                CombatRole.Player,
                ImpactSurface.Ground,
                Vec3D.Zero,
                recovery.Runway.Threshold.Y);
        } else if (_playerTerminalState == AircraftTerminalState.Flying
            && recovery.Phase == RunwayRecoveryPhase.Excursion) {
            RegisterUndamagedCrash(
                CombatRole.Player,
                ImpactSurface.Ground,
                Vec3D.Zero,
                recovery.Runway.Threshold.Y);
        }

        if (_opponentTerminalState == AircraftTerminalState.DestroyedAirborne) {
            var contact = DetectImpact(opponentState, _bandit.State);
            if (contact.surface != ImpactSurface.None)
                RegisterAirborneImpact(
                    CombatRole.Opponent,
                    contact.surface,
                    contact.velocity,
                    contact.height,
                    contact.carrierSolid);
        } else if (_opponentTerminalState == AircraftTerminalState.Flying) {
            var contact = DetectImpact(opponentState, _bandit.State);
            if (contact.surface != ImpactSurface.None)
                RegisterUndamagedCrash(
                    CombatRole.Opponent,
                    contact.surface,
                    contact.velocity,
                    contact.height,
                    carrierSolid: contact.carrierSolid);
        }

        ObserveSettledWrecks();
        UpdateSelectedTargetClosure();
        double completedTimeMs = _simTimeMs + FixedDeltaSeconds * 1000.0;
        if (Lifecycle == LifecycleState.Active)
            FinishTerminalIfResolved(completedTimeMs);
        // Finish is the last event-producing lifecycle transition in a recovered rollout tick.
        // Opponent impact/destruction/settling above may update the ordinary pending combat
        // outcome; the accepted handoff then authoritatively replaces it with Discontinued and
        // publishes SortieFinished after every same-tick physical event.
        if (Lifecycle == LifecycleState.Active
            && _playerTerminalState == AircraftTerminalState.Flying
            && recovery.Phase == RunwayRecoveryPhase.Recovered)
            FinishConventionalRunwaySortie();
        _simTimeMs = completedTimeMs;
    }

    void StepCore() {
        // Catapult, arrestment and runway rollout remain real fixed-step phases: other aircraft,
        // weapons, fuel, systems and the authoritative clock continue while ownship is constrained.
        if (_playerTerminalState == AircraftTerminalState.Flying
            && _conventionalRunwayRecovery?.Phase is
                RunwayRecoveryPhase.Rollout or RunwayRecoveryPhase.Recovered) {
            StepConventionalRunwayRollout();
            return;
        }

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
            StepRapierGunDrone(opponentState,
                _opponentTerminalState == AircraftTerminalState.Flying);
            StepReliefFighter();
            _bandit.Step(
                ThreatObservationFor(catapultState, opponentState),
                FixedDeltaSeconds);
            StepWingmen(catapultState);
            AccumulateEngagementCounters();
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
            StepRapierGunDrone(opponentState,
                _opponentTerminalState == AircraftTerminalState.Flying);
            StepReliefFighter();
            _bandit.Step(
                ThreatObservationFor(playerState, opponentState),
                FixedDeltaSeconds);
            StepWingmen(playerState);
            AccumulateEngagementCounters();
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
            ApplyCarrierConfigurationAutomation(inSlot);
            if (_detents.ApproachMode) _waveOffArmed = true;
            else if (!inSlot && _detents.Throttle < 0.95) _waveOffArmed = false;
            var (gsAlong, _, gsHeight) =
                _carrier.LandingAircraftSupportFrame(_player.State.Position);
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
        _detents.AerodynamicConfiguration = PlayerEffectiveAerodynamicConfiguration;
        ConfigureAssistedFlightDetents();
        if (_carrier is not null)
            _carrier.ApproachDirectorPitchOffsetRad =
                _detents.EffectiveOnSpeedAoARad(_beat.PlayerAir);
        _detents.Tick(_keys, _simTimeMs, _player.State, _beat.PlayerAir, _advice,
            FixedDeltaSeconds);
        if (_waveOffArmed && _detents.Throttle >= 0.95
            && !RapierAutomationActive) {
            _waveOffUntilMs = _simTimeMs + 5000.0;
            _waveOffArmed = false;
            SelectAutomaticConfigurationTarget(FlightConfigurationTarget.Combat);
            if (_recoveryAttemptActive) _attemptHadSetback = true;
        }
        _cue = _prompts.Cue(_advice, _detents.Command, _detents.Tier);

        AircraftState previousPlayerState = _player.State;
        AircraftState previousOpponentState = _bandit.State;
        PilotCommand directedCommand = RapierAutomationOr(_detents.Command);
        PilotCommand assistedCommand = ApplyGunneryPitchAssist(directedCommand);
        PilotCommand effectiveCommand = ApplyPilotPhysiology(assistedCommand);
        PilotCommand padlockAssistedCommand = ApplyBanditPadlockRollAssist(
            effectiveCommand, _detents.Command.RollControl);
        PilotCommand flightCommand = ApplyAutoGcas(padlockAssistedCommand);
        bool formationSweep = (_triggerDown || _rapierFormationSweepRequested)
            && ExecuteRapierFormationSweep();
        if (formationSweep) _rapierFormationSweepRequested = false;
        bool assistedTrigger = _assistedFlight && _gunKill.GunSolution;
        StepWeapons(previousPlayerState, previousOpponentState,
            !formationSweep && (_triggerDown || assistedTrigger));
        PreparePlayerForPoweredTick();
        _player.Step(flightCommand, FixedDeltaSeconds);
        StepPilotPhysiologyFromAircraft();
        ConsumeFuelAndStepSystems(_player.State, _player.AirspeedMps,
            weightOnWheels: false);
        // Both aircraft receive the same beginning-of-tick world snapshot. Giving the bandit the
        // already-integrated player leaked one fixed tick of future ownship motion into its law.
        StepRapierGunDrone(previousOpponentState,
            _opponentTerminalState == AircraftTerminalState.Flying);
        StepReliefFighter();
        _bandit.Step(
            ThreatObservationFor(previousPlayerState, previousOpponentState),
            FixedDeltaSeconds);
        StepWingmen(previousPlayerState);
        AccumulateEngagementCounters();
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

        bool conventionalRunwayContact =
            _carrier is null
            && TryBeginConventionalRunwayContact(previousPlayerState);
        if (_playerTerminalState != AircraftTerminalState.Flying) {
            _simTimeMs += FixedDeltaSeconds * 1000.0;
            return;
        }
        if (!conventionalRunwayContact
            && _carrier is null
            && RegisterPlayerNaturalSurfaceImpact()) {
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

        UpdateSelectedTargetClosure();
        _simTimeMs += FixedDeltaSeconds * 1000.0;
    }
}
