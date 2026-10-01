using System.Collections.Generic;
using System.Linq;
using GunsOnly.Sim.Casevac;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Propulsion;
using GunsOnly.Sim.Recovery;
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
/// Read-only diagnostics for the opponent currently selected by the player's gun sight. The
/// command is the controller's last physical pilot demand; Tactic is null while an actor is on a
/// scripted rail which does not yet have a reactive tactical owner.
/// </summary>
public readonly record struct OpponentPilotTelemetry(
    BanditTactic? Tactic,
    PilotCommand LastCommand);

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
    /// The wreck's current lift direction, for snapshot projection: a detached airframe that
    /// still occupies a formation wire slot must render with honest attitude, not a default up.
    public Vec3D LiftDir => Actor.LiftDir;
    public AircraftTerminalState TerminalState { get; internal set; }
    public ImpactSurface ImpactSurface { get; internal set; }
}

/// <summary>
/// Presentation-independent lifecycle for one deterministic Guns Only sortie.
/// Rendering shells supply timestamp-free key edges and elapsed wall time; this class owns the
/// fixed-step accumulator, mission transitions, controls, combat, carrier recovery, and resources.
/// </summary>
public sealed partial class SimulationSession {
    public enum LifecycleState { Ready, Active, Paused, Finished }

    public const double FixedDeltaSeconds = 1.0 / AircraftSim.TickHz;
    public const int RecentEventCapacity = 64;
    /// The formation aircraft slots both wire formats carry: w1, w2, w3.
    public const int FormationWireSlotCount = 3;
    const int BuiltInCasevacBeatIndex = 13;
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
    // Rated multiplayer lane: bot knobs only. Active while matchmaker handicap is applied.
    BanditSkillProfile? _arenaHandicapProfile;
    PilotSkill _arenaHandicapSkill = PilotSkill.Competent;
    bool _arenaHandicapActive;
    // Opponents beyond the primary. Empty for a 1v1; the pilot's cues always track the primary,
    // which is re-elected from this list when it dies.
    readonly List<Wingman> _wingmen = new();
    readonly List<RetiredOpponentGun> _retiredOpponentGuns = new();
    // Sortie-cumulative gunnery. Every individual GunKill is per-engagement: continuous combat
    // stages a fresh weapon graph for each successor aircraft, so rounds_fired/hits RESET at every
    // engagement boundary and a session-wide max() over the tape understates the sortie total.
    // These ledgers bank each gun's delta so the sortie figure is monotone, keyed by gun identity
    // so a retired or replaced weapon keeps the rounds it already put in the air.
    readonly Dictionary<GunKill, GunLedgerBaseline> _sortieGunLedger = new();
    int _sortiePlayerRoundsFired;
    int _sortiePlayerHits;
    int _sortieOpponentRoundsFired;
    bool _sortieLoadFactorSeen;
    double _sortiePeakLoadFactorG;
    double _sortieMinimumLoadFactorG;

    /// Last observed counters for one physical gun, so only the increment is banked. A replacement
    /// is a new dictionary key, so both counters baseline at GunKill.InheritedRoundsFired /
    /// InheritedHitCount — whatever the successor was born holding, which its predecessor has
    /// already banked. Both are zero for a gun that succeeded nothing.
    struct GunLedgerBaseline {
        public int Rounds;
        public int Hits;
    }
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
    MissionRtbReason _returnToBaseReason;
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
    readonly GunneryLeadRateEstimator _gunneryLeadRate = new();
    readonly PilotLateralCommitment _pilotLateralCommitment = new();
    PilotLateralCommitmentState _pilotLateralCommitmentState =
        PilotLateralCommitmentState.Neutral;
    bool _playerGunTargetPadlockRollAssistSelected;
    long _playerGunTargetPadlockRollAssistTargetId;
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
    CasevacFlightRuntime? _casevacFlight;
    double _casevacAnalogForward;
    double _casevacAnalogRight;
    bool _casevacAbortRequested;

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
    readonly MissionRadioDirector _missionRadioDirector = new();
    MissionRadioTransmission _missionRadio = MissionRadioTransmission.Silent;
    readonly MissionChecklistDirector _missionChecklistDirector = new();
    MissionChecklistStatus _missionChecklist = MissionChecklistStatus.None;
    readonly MeshNavDirector _meshNav = new();
    MeshNavSolution _meshNavSolution = default;
    readonly RecoveryProcedureDirector _recoveryProcedure = new();
    readonly CarrierSortieRouteDirector _carrierSortieRoute = new();
    readonly GunsOnly.Sim.Recovery.ConventionalCarrierRecoveryDirector
        _conventionalCarrierRecovery = new();
    readonly GunsOnly.Sim.Recovery.ConventionalRunwayPatternRecoveryDirector
        _conventionalRunwayPatternRecovery = new();
    // Pattern school starts with a serviceable aircraft. Attrition faults remain available from
    // the systems panel, but silently failing the utility hydraulics 90 seconds into every first
    // circuit left the gear at 91% and made the taught wire pass unrecoverable.
    bool _circuitsCleanMode = true;
    bool _circuitsFaultArmed = true;
    double _circuitsNextFaultAtMs = double.PositiveInfinity;
    bool _rapierAutomationEnabled;
    RapierComputerFailure _rapierComputerFailureActive;
    double _rapierManualOverrideUntilMs = double.NegativeInfinity;
    int _rapierMissilesRemaining;
    int _rapierDogfightingDronesRemaining;
    bool _rapierMissileInFlight;
    double _rapierMissileImpactAtMs = double.PositiveInfinity;
    long _rapierMissileTargetSequence;
    TopGunFightRuntime? _topGunFightRuntime;
    FirstRunValleyRuntime? _firstRunValleyRuntime;
    long _topGunAim9TargetSequence;
    double? _playerF14WingSweepDegrees;
    double? _opponentF14WingSweepDegrees;
    double? _playerF14WingSweepCommandDegrees;
    F14WingSweepMode _playerF14WingSweepMode;
    bool _playerF14WingSweepAutoLatch;
    bool _rapierFormationSweepCommitted;
    bool _rapierFormationSweepRequested;
    RapierGunDrone? _rapierGunDrone;
    long _rapierGunDroneSpawnSequence;
    bool _rapierGunDroneEgress;
    bool _rapierGunDroneThreatReactive;
    bool _rapierPursuitActive;
    double _rapierPursuitRangeM = double.PositiveInfinity;
    double _rapierBalloonReactionStartedAtMs = double.PositiveInfinity;
    bool _rapierBalloonPayloadDeployed;
    // OFF until the pilot asks for it. Compression that engages by itself takes the aircraft away
    // without being asked, which reads as the sim jumping rather than the pilot skipping — the
    // pilot's words were "should be player-driven not auto fast forward". The eligibility rules
    // still gate it; they now decide whether a REQUEST is honoured, not whether one is made.
    // Owner direction 2026-07-29: transit compression is on by default — no enable ceremony.
    // T toggles it off/back; the inhibit policy still drops to 1x near contact and control input.
    bool _timeCompressionPilotEnabled = true;
    int _timeCompressionHostMaximumFactor = 1;
    int _timeCompressionSafetyFactorCap = 1;
    int _timeCompressionFactor = 1;
    double _timeCompressionAccumulatorSeconds;
    TimeCompressionInhibitReason _timeCompressionInhibitReason =
        TimeCompressionInhibitReason.SessionInactive;
    int _shotsTotal;
    int _shotsInWindow;
    int _killCount;
    int _engagementNumber = 1;
    bool _billedSortieComplete;
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
    /// The formation wire slot each still-existing detached wreck owns, keyed by the wreck OBJECT
    /// so the mapping survives every mutation of the list around it. See
    /// DetachedWreckForFormationSlot for why positional ordering is not an identity.
    readonly Dictionary<DetachedOpponentWreck, int> _wreckFormationSlots =
        new(ReferenceEqualityComparer.Instance);
    readonly List<DetachedOpponentWreck> _wreckFormationSlotEvictions = new();
    readonly IncidentReplayRecorder _incidentReplay = new();
    readonly DecisionRecorder _decisionRecorder = new();
    readonly RapierServiceLifeRecorder _rapierServiceLifeRecorder;
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
        public int PlayerHitsScoredAtStart;
        public double TimeToFirstHitSeconds;
    }

    double _weaponsHotAtSeconds = double.NaN;

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
    bool _carrierConfigurationPractice;
    bool _manualGearConfiguration;
    bool _manualFlapConfiguration;
    bool _manualHookConfiguration;
    bool _configurationWasReady = true;
    double _configurationReadyCueUntilMs = double.NegativeInfinity;

    public SimulationSession(int beatIndex = 1,
        Carrier.DeckConfiguration deckConfiguration = Carrier.DeckConfiguration.Axial,
        WeatherProfile? weather = null,
        bool serviceLifeCaptureEnabled = true) {
        _rapierServiceLifeRecorder = new RapierServiceLifeRecorder(
            captureEnabled: serviceLifeCaptureEnabled);
        _weatherProfile = weather;
        _terrainSurface = weather?.Terrain;
        StartBeat(beatIndex, deckConfiguration);
    }

    public LifecycleState Lifecycle { get; private set; } = LifecycleState.Ready;
    public int BeatIndex => _beatIndex;
    public double TimeMilliseconds => _simTimeMs;
    public double TimeSeconds => _simTimeMs / 1000.0;
    public long Tick => _tick;
    public bool TimeCompressionAvailable =>
        _beat.MissionIdentity.AllowsTimeCompression;
    public bool TimeCompressionPilotEnabled => _timeCompressionPilotEnabled;
    public bool TimeCompressionEligible =>
        _timeCompressionInhibitReason == TimeCompressionInhibitReason.None;
    public int TimeCompressionRequestedFactor =>
        TimeCompressionAvailable && _timeCompressionPilotEnabled
            ? TimeCompressionPolicy.PreferredFactor : 1;
    public int TimeCompressionSafetyFactorCap => _timeCompressionSafetyFactorCap;
    public int TimeCompressionFactor => _timeCompressionFactor;
    public TimeCompressionInhibitReason TimeCompressionInhibitReason =>
        _timeCompressionInhibitReason;
    public double PlayerEffectiveWingSpanM => _player.EffectiveWingSpanM;
    public MissionRadioTransmission MissionRadio => _missionRadio;
    public IReadOnlyList<MissionRadioDecision> MissionRadioDecisions =>
        _missionRadioDirector.Decisions;
    public IReadOnlyList<MissionRadioExchangeSnapshot> MissionRadioExchanges =>
        _missionRadioDirector.ExchangeHistory;
    public MissionChecklistStatus MissionChecklist => _missionChecklist;
    public MeshNavDirector MeshNav => _meshNav;
    public MeshNavSolution MeshNavSolution => _meshNavSolution;
    public AircraftSim Player => _player
        ?? throw new InvalidOperationException(
            "The active mission uses a non-fixed-wing player vehicle.");
    public bool CasevacMission => _casevacFlight is not null;
    public CasevacFlightRuntime? CasevacFlight => _casevacFlight;
    /// <summary>
    /// Complete the built-in Medevac aftermath only after the browser has presented it once.
    /// This is deliberately unavailable to custom CASEVAC beats and every non-Quiet phase.
    /// </summary>
    public bool RequestCasevacQuietSkip() {
        if (_beatIndex != BuiltInCasevacBeatIndex
            || _casevacFlight is null
            || !_casevacFlight.RequestQuietSkip())
            return false;
        FinishCasevacLifecycle();
        UpdateTimeCompressionDecision();
        return true;
    }
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
    public double PlayerHealth => 1.0 - Math.Clamp(
        (double)_playerHitsTaken / Math.Max(1, _beat.CombatRules.PlayerHitsToDefeat),
        0.0,
        1.0);
    public bool PlayerAlive =>
        _playerTerminalState == AircraftTerminalState.Flying
        && _playerHitsTaken < _beat.CombatRules.PlayerHitsToDefeat;
    public FuelModel PlayerFuel => _fuel;
    public AirframeSystems PlayerSystems => _systems;
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
    public PromptCue Cue => _cue;
    public DoctrineAdvice Advice => _advice;
    public double ClosureKts => _closureKts;
    public int KillCount => _killCount;

    string? _directorStateForNextStage;

    // Freeze the F-22's opening contract for the whole sortie. A kill may still teach the
    // director and raise the persisted rung, but the second fight belongs to the same lesson:
    // it must not suddenly become an Ace or lose the pilot's sight aid mid-sortie.
    SpawnSpec? _sortieOpeningSpawn;
    FightDirector.PitchAssistScale? _sortiePitchAssist;
    int? _sortiePitchAssistRung;
    public SortieOutcome Outcome => _outcome;
    public SortieOutcome PendingOutcome => _pendingOutcome;
    public AircraftTerminalState PlayerTerminalState => _playerTerminalState;
    public ImpactSurface PlayerImpactSurface => _playerImpactSurface;
    /// <summary>The last authoritative carrier proxy contacted by the player wreck.</summary>
    public Carrier.SolidCollision PlayerCarrierSolid =>
        _playerWreckMotion?.CarrierSolid ?? _playerCarrierSolid;
    public bool TerminalPhaseActive => _playerTerminalState != AircraftTerminalState.Flying
        || (OpponentPresent
            && _opponentTerminalState != AircraftTerminalState.Flying);
    public long PlayerSpawnSequence => _playerSpawnSequence;
    public long BanditSpawnSequence => _banditSpawnSequence;
    public long CarrierSpawnSequence => _carrier is null ? 0 : _carrierSpawnSequence;
    public bool AssistedFlight => _assistedFlight;
    public int AssistedSpeedBiasKts => _assistedSpeedBiasIndex * 30;
    public bool TransitionCueActive => _catapult.IsActive || _simTimeMs < _transitionCueUntilMs;
    public string TransitionCue => TransitionCueActive ? _transitionCue : "";
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
        if (_beat.FirstRunValley is not null
            && terrain is not null
            && terrain is not FirstRunValleyTerrainSurface)
            terrain = new FirstRunValleyTerrainSurface(terrain);
        _terrainSurface = terrain;
        if (_casevacFlight is not null
            && Lifecycle == LifecycleState.Ready) {
            // The vertical-lift provider has no second reset/re-anchor lifecycle. Recreate the
            // staged Ready mission so its immutable pad and obstacle datums bind the new terrain
            // before the authority clock is released.
            StageBeat(_beatFactory());
            return;
        }
        RefreshLaunchTerrainClearance();
        // Every live opponent captured the previous surface at construction; a world-origin
        // re-anchor must reach the whole formation or a wingman's floor sense silently reads the
        // stale translation. Destroyed/settled actors already fly through their impact-owned
        // WreckContactMotion (or detached-wreck state), and are deliberately not retargeted to a
        // newly translated surface mid-contact.
        if (OpponentPresent && !_bandit.CatastrophicallyDamaged)
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

    /// <summary>Construct and stage one of the built-in beats. Physics remains held in Ready.</summary>
    public void StartBeat(int index,
        Carrier.DeckConfiguration deckConfiguration = Carrier.DeckConfiguration.Axial) {
        if (!Beats.IsBuiltInIndex(index)) index = Beats.FirstBuiltInIndex;
        if (_terrainSurface is FirstRunValleyTerrainSurface firstRunTerrain)
            _terrainSurface = firstRunTerrain.Source;
        _prechargeSystemsOnStage = true;
        _beatIndex = index;
        _deckConfiguration = deckConfiguration;
        _beatFactory = () => Beats.BuiltIn(index, deckConfiguration);
        _fightDirector.Reset();
        BeatSetup builtIn = _beatFactory();
        ApplyArmedDirectorState(builtIn);
        StageBeat(builtIn);
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
        ApplyArmedDirectorState(setup);
        if (setup.FirstRunValley is not null
            && _terrainSurface is not null
            && _terrainSurface is not FirstRunValleyTerrainSurface)
            _terrainSurface = new FirstRunValleyTerrainSurface(_terrainSurface);
        else if (setup.FirstRunValley is null
            && _terrainSurface is FirstRunValleyTerrainSurface firstRunTerrain)
            _terrainSurface = firstRunTerrain.Source;
        _deckConfiguration = setup.Carrier?.Configuration ?? _deckConfiguration;
        StageBeat(setup);
    }

    /// <summary>Stage custom scenario content and its weather as one deterministic boundary.</summary>
    public void StartBeat(Func<BeatSetup> beatFactory, WeatherProfile? weather) {
        _weatherProfile = weather;
        StartBeat(beatFactory);
    }

    /// <summary>
    /// Stage custom content, weather, and terrain as one authority boundary. Custom previews use
    /// this overload so their physics cannot inherit a surface translated for a previous mission.
    /// </summary>
    public void StartBeatWithEnvironment(Func<BeatSetup> beatFactory,
        WeatherProfile? weather, ITerrainSurface? terrain) {
        _weatherProfile = weather;
        _terrainSurface = terrain;
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
        if (_casevacFlight is not null) {
            _casevacFlight.Begin(_tick);
            Lifecycle = LifecycleState.Active;
            UpdateTimeCompressionDecision();
            return;
        }
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
            _catapult.Begin(
                _carrier,
                _player.State.Mass,
                holdForClearance: RapierMissionAvailable);
            _detents.ApproachMode = false;
        }
        _maintenanceScenario?.Begin(TimeSeconds);
        if (OpponentPresent) {
            _droneRaidEvaluation?.Begin(TimeSeconds, _gunKill.RoundsFired);
            _droneRaidEvaluation?.Step(TimeSeconds, _player.State, _bandit.State,
                _gunKill.GunSolution, _gunKill.RoundsFired);
        }
        // Announce the power the lever is ACTUALLY on, not the beat's authored setting. A beat that
        // opts into StageAtTrimThrottle arrives at the setting that holds its staged fighting speed
        // — typically well below MIL — so reading InitialThrottle here told the pilot "MIL SET"
        // while the jet sat at a low cruise power. The cue exists to save them a setup, which it
        // can only do if it is true.
        if (_carrier is null && _beat.PlayerAir.ThrustMaxN > 0.0) {
            if (_detents.Throttle >= 0.995) ShowTransition("MIL SET · FIGHT", 1800.0);
            else if (_beat.StageAtTrimThrottle) ShowTransition("PWR SET · FIGHT", 1800.0);
        }
        if (_firstRunValleyRuntime?.WeaponsCold == true)
            ShowTransition("FOLLOW THE VALLEY", 2800.0);
        Lifecycle = LifecycleState.Active;
        BeginPractice();
        BeginRapierServiceLifeCapture();
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

    void UpdateMissionChecklists() {
        AirframeSystems systems = _systems;
        bool simulated = PlayerSystemsSimulated;
        _missionChecklist = _missionChecklistDirector.Step(new MissionChecklistState(
            TimeSeconds,
            Lifecycle is LifecycleState.Active or LifecycleState.Finished,
            RapierMissionAvailable,
            RapierPhase,
            _catapult.IsActive,
            simulated,
            systems.AllGearUpAndLocked,
            systems.AllGearDownAndLocked,
            Math.Max(systems.LeftFlapDegrees, systems.RightFlapDegrees)
                <= FlapTargetToleranceDeg,
            Math.Min(systems.LeftFlapDegrees, systems.RightFlapDegrees)
                >= systems.FullFlapDegrees - FlapTargetToleranceDeg,
            PlayerWeaponsAuthorized,
            _fuel.IsBingo,
            // Mirrors the projection's recovery-point truth: a plan or a carrier to come home to.
            _beat.RecoveryPlan is not null || _carrier is not null));
    }

    string ConventionalOverheadGate() {
        if (!_approachGuidance.ConventionalPattern
            || !_approachGuidance.GuidanceActive
            || _approachGuidance.Gates.Count == 0)
            return "";
        return _approachGuidance.Gates[0].Id;
    }

    void UpdateMissionRadio() {
        LsoAdvice? radioLso = null;
        if (_carrier?.IsMaritime == true && !_arrestment.IsActive && !_catapult.IsActive) {
            radioLso = Lso.AdviseForMode(
                _carrier,
                _player.State,
                _player.AngleOfAttackRad,
                _carrier.ApproachDirectorPitchOffsetRad,
                _detents.ApproachMode,
                WaveOffActive);
        }
        _missionRadio = _missionRadioDirector.Step(new MissionRadioState(
            TimeSeconds,
            Lifecycle is LifecycleState.Active or LifecycleState.Finished,
            RapierMissionAvailable,
            _beat.ScriptedIntercept?.PatternOnly == true,
            RapierPhase,
            _catapult.IsActive,
            RapierCircuitLeg,
            _circuitTraffic,
            _systems.AllGearDownAndLocked,
            _beat.ScriptedIntercept?.LandingIntent
                ?? CircuitLandingIntent.FullStop,
            _beat.ScriptedIntercept?.PatternOnly == true
                && _carrier is not null
                && !_catapult.IsActive
                && _arrestment.Phase == ArrestmentModel.ArrestmentPhase.None,
            WaveOffActive,
            _carrier is not null && _detents.ApproachMode,
            _carrier?.IsMaritime == true,
            _recovery,
            _arrestment.Phase,
            _arrestment.CaughtWire,
            radioLso?.Call ?? "",
            radioLso?.Severity,
            OpponentPresent ? _gunKill.RoundsFired : 0,
            OpponentPresent ? _gunKill.AmmoRemaining : 0,
            _rapierMissilesRemaining,
            _rapierMissileInFlight,
            _rapierDogfightingDronesRemaining,
            _fuel.IsJoker,
            _fuel.IsBingo,
            _recentEvents,
            _missionChecklist.Name,
            _missionChecklist.CompletedCall,
            ConventionalOverheadGate()));
        _circuitComms = _beat.ScriptedIntercept?.PatternOnly == true
            && _missionRadio.Active
                ? $"{_missionRadio.Speaker} · {_missionRadio.Callsign} · "
                    + _missionRadio.Text.ToUpperInvariant()
                : "";
    }

    void FinishCasevacLifecycle() {
        _outcome = SortieOutcome.None;
        _pendingOutcome = SortieOutcome.None;
        Lifecycle = LifecycleState.Finished;
        _accumulatorSeconds = 0.0;
    }

    void RunFixedTick() {
        if (_casevacFlight is not null) {
            long sourceTick = checked(_tick + 1L);
            _casevacFlight.Advance(
                sourceTick,
                CaptureCasevacFlightIntent());
            _casevacAbortRequested = false;
            _tick = sourceTick;
            _simTimeMs += FixedDeltaSeconds * 1000.0;
            if (_casevacFlight.IsTerminal)
                FinishCasevacLifecycle();
            UpdateTimeCompressionDecision();
            return;
        }
        if (!OpponentPresent) {
            RunUnopposedFixedWingTick();
            return;
        }
        AdvanceCombatHandoffAtTickBoundary();
        ObserveFirstRunValleyPopOut();
        // A sortie staged exactly at Bingo must safe the fight before this tick's weapon/AI
        // decisions. The second check after StepCore catches an in-tick fuel crossing.
        MaybeRequestBingoRtb();
        MaybeRequestFirstRunRecovery();
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
        StepTopGunFightRuntime();
        StepFirstRunValleyRuntime();
        if (_playerTerminalState == AircraftTerminalState.Flying) {
            StepRapierBalloonReaction();
            StepRapierPursuit();
            UpdateRapierMissionGuidance();
            MaybeInjectRapierComputerFailure();
        }
        StepCore();
        MaybeRequestBingoRtb();
        UpdateCarrierSortieRoute();
        UpdateMissionChecklists();
        UpdateMissionRadio();
        // The shot crew and launcher own this visual transaction. Ambient R/T is never a
        // gameplay interlock: missing, muted, delayed, or expired speech cannot hold the jet.
        if (_catapult.Phase == CatapultLaunchModel.LaunchPhase.Hold)
            _catapult.Release();
        UpdateRecoveryProcedure();
        // Deliberately a sibling of UpdateRecoveryProcedure, not a child: that method returns
        // early when no recovery procedure exists, which is precisely the state the aircraft is in
        // while it is still on the catapult.
        UpdateSortieSchedule();
        UpdateApproachGuidance();
        if (decisionCapture is { } capture) CompleteDecisionTickCapture(capture);
        StepPendingTerminalDecision();
        _tick++;
        ObservePractice();
        ObserveRapierServiceLifeTick();
        if (Lifecycle != LifecycleState.Active)
            FinalizeRapierServiceLife(
                RapierServiceLifeTerminationReason.SortieFinished);
        CaptureIncidentReplaySample();
        UpdateTimeCompressionDecision();
    }

    /// <summary>
    /// Advance a real fixed-wing sortie whose content explicitly stages no opponent. This is a
    /// separate authority path, not a combat tick with a hidden inert target: ownship and mission
    /// systems advance normally while no AI, weapon, targeting, damage-ledger or engagement code
    /// is called.
    /// </summary>
    void RunUnopposedFixedWingTick() {
        _decisionFireIntentEvaluatedThisTick = false;
        _decisionFireIntentConsumedThisTick = false;
        _decisionFireAuthorizedThisTick = false;
        MaybeRequestBingoRtb();
        if (_playerTerminalState == AircraftTerminalState.Flying
            && AtmosphereBoundaryReached(_player.State, _player.AtmosphereModel,
                integrationMarginM: 250.0))
            ForceTerminalLimit(CombatRole.Player, includeFlying: true);
        if (_playerTerminalState == AircraftTerminalState.Flying) {
            UpdateRapierMissionGuidance();
            MaybeInjectRapierComputerFailure();
        }
        StepUnopposedFixedWingCore();
        MaybeRequestBingoRtb();
        UpdateCarrierSortieRoute();
        UpdateMissionChecklists();
        UpdateMissionRadio();
        if (_catapult.Phase == CatapultLaunchModel.LaunchPhase.Hold)
            _catapult.Release();
        UpdateRecoveryProcedure();
        UpdateSortieSchedule();
        UpdateApproachGuidance();
        _tick++;
        ObservePractice();
        ObserveRapierServiceLifeTick();
        if (Lifecycle != LifecycleState.Active)
            FinalizeRapierServiceLife(
                RapierServiceLifeTerminationReason.SortieFinished);
        CaptureIncidentReplaySample();
        UpdateTimeCompressionDecision();
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

    void StageBeat(BeatSetup setup) {
        ArgumentNullException.ThrowIfNull(setup);
        FinalizeRapierServiceLife(
            RapierServiceLifeTerminationReason.Restaged);
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
        StagePractice();
        // Canonical Rapier v2 carries zero design drones. An explicitly configured legacy
        // prototype count is additional stowed mass, so initialize that mission loadout before
        // CreatePlayer/WithCurrentFuelMass and keep first-stage/restart mass identical.
        _rapierDogfightingDronesRemaining =
            Math.Max(0, _beat.ScriptedIntercept?.DogfightingDrones ?? 0);
        if (_beat.Casevac is not null) {
            StageCasevac();
            return;
        }
        _casevacFlight = null;
        _carrier = _beat.Carrier;
        _conventionalRunwayRecovery =
            _beat.RecoveryPlan?.ConventionalRunway is null
                ? null
                : new ConventionalRunwayRecoveryModel(
                    ConventionalRunway.FromRecoveryPlan(_beat.RecoveryPlan));
        ArrestmentCapabilityProfile arrestmentCapability =
            _beat.ScriptedIntercept is not null
                ? ArrestmentCapabilityProfile.ProvisionalRapierLandStrip
                : _carrier is { IsMaritime: true }
                    && TopGunFightRuntime.IsTopGunMission(_beat.MissionIdentity.Id)
                        ? ArrestmentCapabilityProfile.Mk7Mod3PublicDataSurrogate
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
        // Owning a recovery platform does not mean an airborne combat card starts on final. A
        // continuous fight with a carrier over the horizon stages clean at its authored merge;
        // configuration automation remains available and selects Recovery later in the slot.
        bool stagesOnCarrierApproach = PlayerSystemsSimulated
            && _carrier is not null
            && !maintenanceRecovery
            && !patternOnly
            && _beat.ContinuousCombat is null;
        _systems = CreatePlayerSystems(
            onApproach: stagesOnCarrierApproach,
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
            && _carrier is not null && !maintenanceRecovery
            && (!TopGunFightRuntime.IsTopGunMission(_beat.MissionIdentity.Id)
                || _carrierConfigurationPractice);
        // Circuits starts clean (Combat). Carrier approach beats stage Recovery.
        _configurationTarget = _configurationAutomationEnabled
            ? (stagesOnCarrierApproach
                ? FlightConfigurationTarget.Recovery
                : FlightConfigurationTarget.Combat)
            : FlightConfigurationTarget.Combat;
        _manualGearConfiguration = false;
        _manualFlapConfiguration = false;
        _manualHookConfiguration = false;
        _configurationWasReady = ConfigurationReady;
        _configurationReadyCueUntilMs = double.NegativeInfinity;
        if (_carrier is not null) {
            _difficulty = _carrier.IsMaritime
                ? _recoveryProgress.PreviewNextAttempt()
                : DifficultyModel.ForLevel(0);
            _carrier.ApplyDifficulty(_difficulty);
            // Every established carrier/strip recovery is transformed into the platform frame.
            // Top Gun is the one exception: it owns a distant carrier but starts at an authored
            // airborne ACM merge, not on that carrier's approach.
            if (!TopGunFightRuntime.IsTopGunMission(_beat.MissionIdentity.Id)) {
                double configuredOnSpeedAoa = DetentLayer.OnSpeedAoARad
                    - PlayerAerodynamicConfiguration.LiftCoefficientIncrement
                        / Math.Max(_beat.PlayerAir.CLAlpha, 1e-6);
                _carrier.ApproachDirectorPitchOffsetRad = configuredOnSpeedAoa;
                _beat = _beat with {
                    Player = _carrier.ToWorldStateFromAir(_beat.Player, configuredOnSpeedAoa)
                };
            }
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
        bool finiteMaritimeCarrierSortie = _carrier is { IsMaritime: true }
            && _beat.StartsOnCatapult
            && _beat.RecoveryCompletesSortie
            && _beat.RecoveryPlan is not null;
        if (_carrier is not null) {
            double approachSpeedMps =
                GunsOnly.Sim.Recovery.SortieSchedule.ApproachTrueAirspeedMps(
                    _beat.Player.Mass,
                    _beat.PlayerAir,
                    _beat.SystemsProfile ?? AirframeSystemsProfile.F86FResearchBasis,
                    _carrier.TouchdownPoint.Y + 110.0,
                    _weatherProfile?.Atmosphere ?? StandardAtmosphere1976.Instance);
            _carrierSortieRoute.Configure(
                _carrier, approachSpeedMps, finiteMaritimeCarrierSortie);
        } else {
            _carrierSortieRoute.Reset();
        }
        RefreshLaunchTerrainClearance();
        _waveOffArmed = _carrier is not null;
        _waveOffUntilMs = double.NegativeInfinity;
        _burble = _carrier is { IsMaritime: true }
            ? CreateBurble(_carrier, _difficulty, _weatherProfile?.Wind)
            : null;
        _player = CreatePlayer(_beat.Player);
        bool stagesOpponent = _beat.InitialOpponent.HasValue;
        // Pacing memory survives the pilot: when the director has observed history and this beat
        // fields a skill-driven continuous-combat opponent, the OPENING spawn is a director
        // decision too — a boss loss last life opens this life in RELEASE, not back at the ramp.
        bool difficultyRamp = UsesDifficultyRamp(_beat);
        bool directorCanStage = stagesOpponent
            && _beat.ContinuousCombat is not null
            && (_beat.UsesReactiveBandit || _beat.UsesNeutralMergeBandit);
        // The rung table is the F-22 front door. Other continuous fixtures keep their authored
        // skill and a cold pair capped by their own formation ceiling.
        SpawnSpec? openingSpawn = directorCanStage && difficultyRamp
            ? _fightDirector.NextSpawn(1)
            : null;
        // Visual-merge is a bounded two-fight lesson. Snapshot the opening spawn and assist law
        // before combat starts; CompleteEngagementIfEnded may advance the director after fight 1.
        _sortieOpeningSpawn = IsVisualMergeSortie(_beat)
            ? openingSpawn ?? _fightDirector.NextSpawn(1)
            : null;
        _sortiePitchAssist = IsVisualMergeSortie(_beat)
            ? _fightDirector.PitchAssist
            : null;
        _sortiePitchAssistRung = IsVisualMergeSortie(_beat)
            ? _fightDirector.Rung
            : null;
        ClearWingmen();
        _retiredOpponentGuns.Clear();
        if (stagesOpponent) {
            _bandit = _beat.CreateBandit(_terrainSurface, openingSpawn);
            ApplyArenaHandicapToPrimaryBandit();
            _primaryOpponentGunTargetId = AllocateOpponentGunTargetId();
            _selectedPlayerGunTargetId = _primaryOpponentGunTargetId;
            // The opening wave is a formation too — the pilot's own call: "first fight is 1v2 and
            // if I win that it stays that way." A cold start has no director decision yet, so ask
            // the director what an opening looks like rather than hard-coding a number here.
            // Multiplayer lane applies arena handicap and is always 1v1 (AI fill until humans).
            if (_beat.ContinuousCombat is not null && !_arenaHandicapActive) {
                SpawnSpec wingSpec = openingSpawn
                    ?? (difficultyRamp
                        ? _fightDirector.NextSpawn(1)
                        : new SpawnSpec(
                            _beat.BanditSkill, 0, false, "authored formation",
                            FormationSize: 2));
                StageWingmen(wingSpec, 1);
            }
            else if (_beat.ScriptedIntercept is { FormationSize: > 1 } scriptedFormation)
                StageScriptedFormation(scriptedFormation.FormationSize);
            ConfigureFormationLookaheadCadence();
        } else {
            // Absence is structural: no parked actor, no target identity and no weapon/damage
            // graph. These fields remain null until a later staged beat explicitly owns combat.
            _bandit = null!;
            _primaryOpponentGunTargetId = 0;
            _selectedPlayerGunTargetId = 0;
        }
        _playerSpawnSequence++;
        if (stagesOpponent) _banditSpawnSequence++;
        if (_carrier is not null) _carrierSpawnSequence++;
        if (stagesOpponent) {
            _bandit.Wind = _player.Wind;
            _bandit.Atmosphere = _player.AtmosphereModel;
            CombatConfig combat = _beat.CombatRules;
            double playerTargetHitRadiusM = combat.PlayerTargetHitRadiusM
                ?? combat.PlayerGunProfile.EffectiveHitRadiusM;
            GunHeatConfig? playerGunHeat = combat.PlayerGunEnabled
                && combat.PlayerInfiniteAmmo
                    ? GunHeatConfig.PlayerInfiniteAmmo
                    : null;
            _gunKill = new GunKill(combat.PlayerAmmo, combat.OpponentHitsToDefeat,
                playerTargetHitRadiusM, combat.PlayerGunProfile, playerGunHeat);
            RegisterFormationGunTargets();
            _gunKill.SelectTarget(_selectedPlayerGunTargetId);
            _opponentGun = new GunKill(combat.OpponentAmmo, combat.PlayerHitsToDefeat,
                combat.OpponentGunProfile.EffectiveHitRadiusM,
                combat.OpponentGunProfile);
            _visualMergeEvaluation?.Step(_player.State, _bandit.State,
                _player.AtmosphereModel, 0.0, _player.AirspeedMps);
        } else {
            _gunKill = null!;
            _opponentGun = null!;
        }
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
        _playerGunTargetPadlockRollAssistSelected = false;
        _playerGunTargetPadlockRollAssistTargetId = 0;
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
        _timeCompressionSafetyFactorCap = 1;
        _timeCompressionFactor = 1;
        _timeCompressionInhibitReason =
            TimeCompressionInhibitReason.SessionInactive;
        _ramCueStage = 0;
        _shotsTotal = 0;
        _shotsInWindow = 0;
        _killCount = 0;
        _sortieGunLedger.Clear();
        _sortiePlayerRoundsFired = 0;
        _sortiePlayerHits = 0;
        _weaponsHotAtSeconds = double.NaN;
        _sortieOpponentRoundsFired = 0;
        _sortieLoadFactorSeen = false;
        _sortiePeakLoadFactorG = 0.0;
        _sortieMinimumLoadFactorG = 0.0;
        _combatHandoffPhase = SupportsCombatHandoff
            ? CombatHandoffPhase.Available
            : CombatHandoffPhase.Unavailable;
        _returnToBaseReason = MissionRtbReason.None;
        _reliefFighter = null;
        _reliefTargetingOpponentGuns.Clear();
        _reliefThreatState = default;
        _reliefThreatStateValid = false;
        _reliefKills = 0;
        _playerHitsTaken = 0;
        _engagementNumber = stagesOpponent ? 1 : 0;
        _billedSortieComplete = false;
        _engagementCounters = default;
        _engagementReports.Clear();
        LastDirectorSpawn = openingSpawn;
        _outcome = SortieOutcome.None;
        _pendingOutcome = SortieOutcome.None;
        _playerTerminalState = AircraftTerminalState.Flying;
        _opponentTerminalState = stagesOpponent
            ? AircraftTerminalState.Flying
            : AircraftTerminalState.Settled;
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
        _rapierComputerFailureActive = RapierComputerFailure.None;
        _circuitTraffic = System.Array.Empty<CircuitTrafficShip>();
        _circuitComms = "";
        _missionRadioDirector.Reset();
        _missionRadio = MissionRadioTransmission.Silent;
        _missionChecklistDirector.Reset();
        _missionChecklist = MissionChecklistStatus.None;
        _recoveryProcedure.Reset();
        _conventionalCarrierRecovery.Reset();
        _conventionalRunwayPatternRecovery.Reset();
        ConfigureMeshNavFromBeat();
        _rapierAutomationEnabled =
            _beat.ScriptedIntercept?.AutomationDefaultEnabled ?? false;
        _rapierManualOverrideUntilMs = double.NegativeInfinity;
        _rapierMissilesRemaining =
            Math.Max(0, _beat.ScriptedIntercept?.ShortRangeMissiles ?? 0);
        _topGunFightRuntime = TopGunFightRuntime.IsTopGunMission(_beat.MissionIdentity.Id)
            ? new TopGunFightRuntime()
            : null;
        _firstRunValleyRuntime = _beat.FirstRunValley is { } firstRun
            ? new FirstRunValleyRuntime(firstRun)
            : null;
        _topGunAim9TargetSequence = 0;
        _playerF14WingSweepMode = F14WingSweepMode.None;
        _playerF14WingSweepCommandDegrees = null;
        _playerF14WingSweepAutoLatch = false;
        // Ready is a real authoritative pose. Apply the same schedule used at the next fixed tick
        // now, so snapshot sweep degrees and the effective span never describe different wings.
        ApplyTopGunF14WingSweepAuthority();
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
        _rapierBalloonReactionStartedAtMs = double.PositiveInfinity;
        _rapierBalloonPayloadDeployed = false;
        _lastRange = stagesOpponent
            ? Geometry.Range(_player.State, SelectedOpponentState)
            : 0.0;
        _closureKts = 0.0;
        _closureSmooth = 0.0;
        // Drone raids score through DroneRaidEvaluation; a dogfight engagement report for a
        // raid would misattribute the whole raid to one staged skill, so counters stay off.
        if (stagesOpponent && _beat.DroneRaid is null)
            StartEngagementCounters(openingSpawn?.Skill ?? _beat.BanditSkill,
                openingSpawn is { } opening && (opening.Boss || opening.Machine));
        // Simulation time is deliberately monotonic across restarts because KeyGrammar timestamps
        // all input in this epoch. Only flight-local state and the accumulator reset.
        _approachGuidance = GunsOnly.Sim.Recovery.ApproachGuidanceState.Inactive;
        Lifecycle = LifecycleState.Ready;
    }

    void StageCasevac() {
        CasevacCourseDefinition course =
            BuiltInCasevacDefinitions.Prototype;
        if (!StringComparer.Ordinal.Equals(
                _beat.Casevac!.Id,
                course.Mission.Id))
            throw new InvalidOperationException(
                "The staged CASEVAC mission has no matching authoritative built-in world.");

        _carrier = null;
        _player = null!;
        _bandit = null!;
        ClearWingmen();
        _retiredOpponentGuns.Clear();
        _gunKill = null!;
        _opponentGun = null!;
        _primaryOpponentGunTargetId = 0;
        _selectedPlayerGunTargetId = 0;
        _maintenanceScenario = null;
        _visualMergeEvaluation = null;
        _droneRaidEvaluation = null;
        _fuel = CreatePlayerFuel();
        _systems = CreatePlayerSystems(
            onApproach: false,
            prechargeUtilityHydraulics: false);
        _keys = new KeyGrammar();
        _detents = new DetentLayer {
            Variant = _requestedVariant,
            ApproachMode = false,
            AerodynamicConfiguration = AirframeAerodynamicState.Clean,
            AtmosphereModel = _weatherProfile?.Atmosphere
                ?? StandardAtmosphere1976.Instance
        };
        _detents.ConfigureFor(_beat.PlayerAir, 0.0);
        _pilotPhysiology = new PilotPhysiologyModel(
            _beat.PlayerPilotPhysiology);
        _prompts = new PromptTracker();
        _cue = PromptCue.None;
        _advice = new DoctrineAdvice(1.0, 0.0, "setup");
        _casevacFlight = new CasevacFlightRuntime(
            course,
            _terrainSurface,
            _weatherProfile,
            () => ++_eventSequence);
        _casevacAnalogForward = 0.0;
        _casevacAnalogRight = 0.0;
        _casevacAbortRequested = false;

        _playerSpawnSequence++;
        _playerTerminalState = AircraftTerminalState.Flying;
        _opponentTerminalState = AircraftTerminalState.Settled;
        _playerImpactSurface = ImpactSurface.None;
        _opponentImpactSurface = ImpactSurface.None;
        _playerCarrierSolid = Carrier.SolidCollision.None;
        _playerWreckMotion = null;
        _outcome = SortieOutcome.None;
        _pendingOutcome = SortieOutcome.None;
        _triggerDown = false;
        _opponentTriggerDown = false;
        _assistedFlight = false;
        _playerGunTargetPadlockRollAssistSelected = false;
        _playerGunTargetPadlockRollAssistTargetId = 0;
        _padlockRollAssist.Reset();
        _autoGcasState = AutoGcasState.Initial(available: false);
        _autoGcasRecoveryCommand = null;
        _gunneryPitchAssistState =
            GunneryPitchAssistState.Inactive();
        _pilotDelayedCommand = _detents.Command;
        _pilotCommandResponseInitialized = true;
        _pilotControlInterlocked = false;
        _pilotTriggerInterlocked = false;
        _pilotGLocCount = 0;
        _pilotPeakPositiveG = 1.0;
        _pilotPeakNegativeG = 0.0;
        _pilotHeldThrottle = 0.0;

        _configurationAutomationEnabled = false;
        _configurationTarget = FlightConfigurationTarget.Combat;
        _configurationWasReady = true;
        _recovery = Carrier.Recovery.Flying;
        _touchdown = Carrier.TouchdownResult.Flying;
        _carrierPass.Reset();
        _arrestment.Reset();
        _catapult.Reset();
        _burble = null;
        _waveOffArmed = false;
        _waveOffUntilMs = double.NegativeInfinity;
        _rapierMissionDirector = null;
        _rapierMissionGuidance = default;
        _rapierAutomationEnabled = false;
        _rapierGunDrone = null;
        _rapierMissileInFlight = false;
        _rapierPursuitActive = false;
        _rapierBalloonReactionStartedAtMs = double.PositiveInfinity;
        _rapierBalloonPayloadDeployed = false;
        _circuitTraffic = Array.Empty<CircuitTrafficShip>();
        _circuitComms = "";

        _accumulatorSeconds = 0.0;
        _timeCompressionAccumulatorSeconds = 0.0;
        _timeCompressionHostMaximumFactor = 1;
        _timeCompressionSafetyFactorCap = 1;
        _timeCompressionFactor = 1;
        _timeCompressionInhibitReason =
            TimeCompressionInhibitReason.SessionInactive;
        _lastRange = 0.0;
        _closureKts = 0.0;
        _closureSmooth = 0.0;
        _recentEvents.Clear();
        _detachedOpponentWrecks.Clear();
        _incidentReplay.Reset();
        _transitionCue = "";
        _transitionCueUntilMs = double.NegativeInfinity;
        _splashCueUntilMs = double.NegativeInfinity;
        // The casevac beat has its own presentation stack; the panel must not show a
        // stale prior-sortie checklist under it.
        _missionChecklistDirector.Reset();
        _missionChecklist = MissionChecklistStatus.None;
        _meshNav.Reset();
        _meshNavSolution = default;
        _recoveryProcedure.Reset();
        _carrierSortieRoute.Reset();
        _approachGuidance = GunsOnly.Sim.Recovery.ApproachGuidanceState.Inactive;
        Lifecycle = LifecycleState.Ready;
    }

    void ConfigureMeshNavFromBeat() {
        MeshPlace? home = null;
        if (_beat.RecoveryPlan is { } plan) {
            home = new MeshPlace(
                plan.Id,
                plan.DisplayName,
                plan.Position.X,
                plan.Position.Z,
                plan.Position.Y,
                MeshPlaceRole.Home);
        }

        MeshNavTransitMode mode = _beat.OpenSegmentNav
            ? MeshNavTransitMode.OpenSegment
            : MeshNavTransitMode.MissionGated;
        IReadOnlyList<MeshPlace> catalog = mode == MeshNavTransitMode.OpenSegment
            ? MeshPlaceCatalog.FreeFlyPlaces
            : Array.Empty<MeshPlace>();
        _meshNav.Configure(mode, home, catalog);
        _meshNavSolution = default;
    }

    public bool TrySelectMeshPlace(string placeId) =>
        _meshNav.TrySelectPlace(placeId, phaseAllows: Lifecycle == LifecycleState.Active
            || Lifecycle == LifecycleState.Ready
            || Lifecycle == LifecycleState.Paused);

    public bool TrySetMeshFreeFix(double eastM, double northM, string? label) =>
        _meshNav.TrySetFreeFix(eastM, northM, label);

    public void ClearMeshActiveDest() => _meshNav.ClearActiveDestToHome();

    bool MeshPhaseAllows => Lifecycle is LifecycleState.Active
        or LifecycleState.Ready
        or LifecycleState.Paused;

    public bool TryMeshTourAppendPlace(string placeId) =>
        _meshNav.TryTourAppendPlace(placeId, phaseAllows: MeshPhaseAllows);

    public bool TryMeshTourAppendFreeFix(double eastM, double northM, string? label) =>
        _meshNav.TryTourAppendFreeFix(eastM, northM, label);

    public void ClearMeshTour() => _meshNav.ClearTour();

    GoldenPathPoint _goldenPath;

    SortieScheduleState _sortiePlan;
    GunsOnly.Sim.Recovery.ApproachGuidanceState _approachGuidance =
        GunsOnly.Sim.Recovery.ApproachGuidanceState.Inactive;
    long _approachSolveCount;
    /// <summary>
    /// 120 Hz sim, ~8 Hz solve. Approach guidance is publish-only HUD state, and each solve can
    /// run a Dubins binary search; between solves the published state is reused unchanged. The
    /// grid is keyed off the deterministic tick counter, never wall clock.
    /// </summary>
    const int ApproachSolveIntervalTicks = 15;

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
        initialUtilityHydraulicPressureFraction: prechargeUtilityHydraulics ? 1.0 : 0.0,
        initialHook: onApproach ? TailhookHandle.Down : TailhookHandle.Up);

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

    /// Canonical Rapier v2 fuel-free mass includes zero design stores. The versioned design-store
    /// constant therefore subtracts zero there; explicitly configured legacy prototype drones add
    /// their actual remaining mass on top and disappear from mass as they release.
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

    const double FlapTargetToleranceDeg = 0.25;

    /// SpawnForMerge varies its geometry with the engagement number; stepping by more than the
    /// doctrine cycle keeps a wingman from landing on top of its leader.
    const int WingmanSpawnStride = 1;

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

    void PreparePlayerForPoweredTick() {
        RefreshPlayerMass();
        _player.EngineFuelAvailable = _fuel.HasFuel;
        _player.AerodynamicConfiguration = PlayerAerodynamicConfiguration;
    }

    /// <summary>
    /// Add a bounded two-axis (pitch load-factor plus lateral roll/rudder) convergence request before
    /// human physiology and aircraft-owned Auto-GCAS. The lead sample is the previous 120 Hz weapon
    /// evaluation; using that one-tick-old authoritative result avoids advancing projectiles twice or
    /// inventing a second ballistic law.
    /// </summary>
    // Touch devices cannot fly precision gunnery with tilt input; the assist widens for them.
    bool _touchControlModality;

    // Pilot authority over the backstop itself ("it's a combat sim"): the system defaults on,
    // and a conscious pilot may stand it down entirely from settings. K/Space remain the
    // in-flight refusals.
    bool _autoGcasEnabled = true;
    double _pilotInputOverrideSeconds;

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

    /// <summary>
    /// Add the aircraft-owned padlock plane trim after the effective human-control path. Raw pilot
    /// roll remains the immediate override signal; the small correction occupies only the explicit
    /// SAS channel, and Auto-GCAS still runs afterward with unconditional safety priority.
    /// </summary>
    // Corner speed is operationally meaningless above this band and the pitot inversion
    // eventually has no finite answer; 50 km is far above every flyable envelope while
    // comfortably inside AirData's solvable range.
    const double CornerSpeedSolvableCeilingM = 50_000.0;

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
                weightOnWheels,
                LandingConfigurationExpected:
                    _configurationTarget == FlightConfigurationTarget.Recovery));
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
                _player.LastEngineOperatingPoint.RpmPercent, iasKts, weightOnWheels,
                LandingConfigurationExpected:
                    _configurationTarget == FlightConfigurationTarget.Recovery));
        _maintenanceScenario?.Step(TimeSeconds);
    }

    /// <summary>
    /// Ownship-only fixed-wing integration. The ordering of player power, resources, platform
    /// kinematics, contact and clock matches <see cref="StepCore"/>, but no opponent placeholder
    /// is manufactured to reuse that combat path.
    /// </summary>
    void StepUnopposedFixedWingCore() {
        if (_playerTerminalState == AircraftTerminalState.Flying
            && _conventionalRunwayRecovery?.Phase is
                RunwayRecoveryPhase.Rollout or RunwayRecoveryPhase.Recovered) {
            StepUnopposedConventionalRunwayRollout();
            return;
        }

        if (_playerTerminalState == AircraftTerminalState.Flying
            && _carrier is not null && _catapult.IsActive) {
            AircraftState catapultState = _catapult.State;
            PreparePlayerForPoweredTick();
            _player.AdvanceEngineOnly(1.0, FixedDeltaSeconds);
            Vec3D catapultAirVelocity = catapultState.VelocityVector()
                - (_player.Wind?.Sample(catapultState.Position) ?? Vec3D.Zero);
            ConsumeFuelAndStepSystems(catapultState, catapultAirVelocity.Length,
                weightOnWheels: true);
            _carrier.Step(FixedDeltaSeconds);
            _catapult.Step(_carrier, FixedDeltaSeconds);
            _player.AdoptExternalKinematics(_catapult.State);
            StepPilotPhysiologyFromAircraft();
            if (_playerTerminalState != AircraftTerminalState.Flying) {
                AircraftState handoff = _catapult.State;
                _player.AdoptExternalKinematics(handoff);
                _catapult.Reset();
                if (_playerTerminalState == AircraftTerminalState.DestroyedAirborne) {
                    Vec3D deckVelocity = _carrier.DeckVelocityWorld
                        + new Vec3D(0.0, _carrier.DeckVerticalVelocityMps, 0.0);
                    double deckHeight = handoff.Position.Y
                        - _carrier.DeckFrame(handoff.Position).height;
                    RegisterAirborneImpact(CombatRole.Player,
                        ImpactSurface.FlightDeck,
                        deckVelocity,
                        deckHeight,
                        Carrier.SolidCollision.FlightDeck);
                }
            }
            if (_playerTerminalState == AircraftTerminalState.Flying
                && _catapult.Phase == CatapultLaunchModel.LaunchPhase.Airborne)
                CompleteRelaunch();
            CompleteUnopposedCarrierConstraintTick(catapultState);
            return;
        }

        if (_playerTerminalState == AircraftTerminalState.Flying
            && _carrier is not null
            && _arrestment.Phase == ArrestmentModel.ArrestmentPhase.Arrested) {
            AircraftState playerState = _player.State;
            PreparePlayerForPoweredTick();
            _player.AdvanceEngineOnly(_detents.Throttle, FixedDeltaSeconds);
            ConsumeFuelAndStepSystems(playerState, _player.AirspeedMps,
                weightOnWheels: true);
            _carrier.Step(FixedDeltaSeconds);
            _arrestment.Step(_carrier, FixedDeltaSeconds);
            _player.AdoptExternalKinematics(CurrentArrestmentState());
            StepPilotPhysiologyFromAircraft();
            bool arrestmentFailed = _arrestment.Phase
                == ArrestmentModel.ArrestmentPhase.Failed;
            if (arrestmentFailed) HandleArrestmentFailure();
            if (_playerTerminalState != AircraftTerminalState.Flying
                && !arrestmentFailed) {
                Vec3D velocity = _carrier.DeckVelocityWorld
                    + _carrier.LandingFwd * _arrestment.RelativeSpeedMps
                    + new Vec3D(0.0, _carrier.DeckVerticalVelocityMps, 0.0);
                AircraftState handoff = Carrier.StateFromVelocity(
                    _arrestment.Position,
                    velocity,
                    _player.State.Mass,
                    _player.State.BodyAttitude);
                _player.AdoptExternalKinematics(handoff);
                _arrestment.Reset();
                if (_playerTerminalState == AircraftTerminalState.DestroyedAirborne) {
                    Vec3D deckVelocity = _carrier.DeckVelocityWorld
                        + new Vec3D(0.0, _carrier.DeckVerticalVelocityMps, 0.0);
                    double deckHeight = handoff.Position.Y
                        - _carrier.DeckFrame(handoff.Position).height;
                    RegisterAirborneImpact(CombatRole.Player,
                        ImpactSurface.FlightDeck,
                        deckVelocity,
                        deckHeight,
                        Carrier.SolidCollision.FlightDeck);
                }
            }
            if (_playerTerminalState == AircraftTerminalState.Flying
                && _arrestment.Phase == ArrestmentModel.ArrestmentPhase.Stopped) {
                if (_maintenanceScenario is not null)
                    FinishRecoveredMaintenanceSortie();
                else if (_beat.RecoveryCompletesSortie)
                    FinishCarrierQualificationSortie(recovered: true);
                else
                    BeginRelaunch();
            }
            CompleteUnopposedCarrierConstraintTick(playerState);
            return;
        }

        if (TerminalPhaseActive) {
            StepUnopposedTerminalPhase();
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
            double gsLineH = Math.Max(0.0,
                -_carrier.DeckLengthM * 0.2 - gsAlong) * Carrier.GlideslopeSlope;
            _detents.GlideslopeErrorM = gsLineH - gsHeight;
            _detents.ApproachAirspeedMps = _player.AirspeedMps;
            _detents.DeckClosureMps = _carrier.DeckClosureMps(_player.State);
        }

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
        PilotCommand directedCommand = RapierAutomationOr(_detents.Command);
        PilotCommand effectiveCommand = ApplyPilotPhysiology(directedCommand);
        PilotCommand flightCommand = ApplyAutoGcas(effectiveCommand);
        PreparePlayerForPoweredTick();
        _player.Step(flightCommand, FixedDeltaSeconds);
        StepPilotPhysiologyFromAircraft();
        ConsumeFuelAndStepSystems(_player.State, _player.AirspeedMps,
            weightOnWheels: false);

        if (_carrier is not null) {
            _carrier.Step(FixedDeltaSeconds);
            ObserveCarrierPass();
        }
        if (Lifecycle != LifecycleState.Active) {
            _simTimeMs += FixedDeltaSeconds * 1000.0;
            return;
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

        _simTimeMs += FixedDeltaSeconds * 1000.0;
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
            StepPrimaryOpponent(
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
            StepPrimaryOpponent(
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
        UpdatePilotLateralCommitment(_detents.Command.RollControl);
        PilotCommand assistedCommand = ApplyGunneryPitchAssist(directedCommand);
        PilotCommand effectiveCommand = ApplyPilotPhysiology(assistedCommand);
        PilotCommand padlockAssistedCommand = ApplyPlayerGunTargetPadlockRollAssist(
            effectiveCommand, _detents.Command.RollControl);
        PilotCommand flightCommand = ApplyAutoGcas(padlockAssistedCommand);
        bool formationSweep = (_triggerDown || _rapierFormationSweepRequested)
            && ExecuteRapierFormationSweep();
        if (formationSweep) _rapierFormationSweepRequested = false;
        bool assistedTrigger = _assistedFlight
            && !CardTwelveRequiresPilotGunTrigger
            && _gunKill.GunSolution;
        StepWeapons(previousPlayerState, previousOpponentState,
            !formationSweep && (_triggerDown || assistedTrigger));
        PreparePlayerForPoweredTick();
        _player.Step(flightCommand, FixedDeltaSeconds);
        StepPilotPhysiologyFromAircraft();
        ObserveTopGunF14StructuralLoad();
        ConsumeFuelAndStepSystems(_player.State, _player.AirspeedMps,
            weightOnWheels: false);
        // Both aircraft receive the same beginning-of-tick world snapshot. Giving the bandit the
        // already-integrated player leaked one fixed tick of future ownship motion into its law.
        StepRapierGunDrone(previousOpponentState,
            _opponentTerminalState == AircraftTerminalState.Flying);
        StepReliefFighter();
        StepPrimaryOpponent(
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
