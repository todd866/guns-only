using GunsOnly.Sim.Doctrine;
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
public enum ImpactSurface { None, Water, FlightDeck, CarrierStructure, SimulationBoundary }
public enum FlightConfigurationTarget { Combat, Recovery }
public enum SessionEventType {
    Hit,
    Destroyed,
    Impact,
    Settled,
    TerminalLimitReached,
    SortieFinished,
    ArrestmentFailed
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
    ImpactSurface Surface = ImpactSurface.None);

/// <summary>
/// Presentation-independent lifecycle for one deterministic Guns Only sortie.
/// Rendering shells supply timestamp-free key edges and elapsed wall time; this class owns the
/// fixed-step accumulator, mission transitions, controls, combat, carrier recovery, and resources.
/// </summary>
public sealed class SimulationSession {
    public enum LifecycleState { Ready, Active, Paused, Finished }

    public const double FixedDeltaSeconds = 1.0 / AircraftSim.TickHz;
    public const int RecentEventCapacity = 64;
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
    F86EmergencyGearRecoveryScenario? _maintenanceScenario;
    PromptTracker _prompts = null!;
    PromptCue _cue;
    DoctrineAdvice _advice = new(1.0, 0.0, "setup");
    Func<BeatSetup> _beatFactory = Beats.Perch;
    ValleyVariant _requestedVariant = ValleyVariant.DoctrineDeep;
    WeatherProfile? _weatherProfile;

    double _accumulatorSeconds;
    double _simTimeMs;
    long _tick;
    double _lastRange;
    double _closureKts;
    double _closureSmooth;
    string _transitionCue = "";
    double _transitionCueUntilMs = double.NegativeInfinity;
    int _shotsTotal;
    int _shotsInWindow;
    int _killCount;
    bool _triggerDown;
    bool _opponentTriggerDown;
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
    readonly List<SessionEvent> _recentEvents = new(RecentEventCapacity);
    readonly IncidentReplayRecorder _incidentReplay = new();
    long _eventSequence;

    Carrier? _carrier;
    readonly RecoveryProgress _recoveryProgress = new();
    RecoveryDifficulty _difficulty = DifficultyModel.ForLevel(0);
    bool _recoveryAttemptActive;
    bool _attemptHadSetback;
    bool _attemptCleanRecorded;
    Carrier.Recovery _recovery = Carrier.Recovery.Flying;
    Carrier.TouchdownResult _touchdown = Carrier.TouchdownResult.Flying;
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
    public F86EmergencyGearRecoveryScenario? MaintenanceScenario => _maintenanceScenario;
    public PromptCue Cue => _cue;
    public DoctrineAdvice Advice => _advice;
    public Carrier? Carrier => _carrier;
    public RecoveryProgress RecoveryProgress => _recoveryProgress;
    public RecoveryDifficulty Difficulty => _difficulty;
    public Carrier.Recovery Recovery => _recovery;
    public Carrier.TouchdownResult Touchdown => _touchdown;
    public ArrestmentModel Arrestment => _arrestment;
    public CatapultLaunchModel Catapult => _catapult;
    public BurbleField? Burble => _burble;
    public double ClosureKts => _closureKts;
    public int ShotsTotal => _shotsTotal;
    public int ShotsInWindow => _shotsInWindow;
    public int KillCount => _killCount;
    public SortieOutcome Outcome => _outcome;
    public SortieOutcome PendingOutcome => _pendingOutcome;
    public AircraftTerminalState PlayerTerminalState => _playerTerminalState;
    public AircraftTerminalState OpponentTerminalState => _opponentTerminalState;
    public ImpactSurface PlayerImpactSurface => _playerImpactSurface;
    public ImpactSurface OpponentImpactSurface => _opponentImpactSurface;
    /// <summary>The last authoritative carrier proxy contacted by the player wreck.</summary>
    public Carrier.SolidCollision PlayerCarrierSolid =>
        _playerWreckMotion?.CarrierSolid ?? _playerCarrierSolid;
    public bool TerminalPhaseActive => _playerTerminalState != AircraftTerminalState.Flying
        || _opponentTerminalState != AircraftTerminalState.Flying;
    public IReadOnlyList<SessionEvent> RecentEvents => _recentEvents;
    public IncidentReplayRecorder IncidentReplay => _incidentReplay;
    public long PlayerSpawnSequence => _playerSpawnSequence;
    public long BanditSpawnSequence => _banditSpawnSequence;
    public long CarrierSpawnSequence => _carrier is null ? 0 : _carrierSpawnSequence;
    public bool TriggerDown => _triggerDown;
    public bool OpponentTriggerDown => _opponentTriggerDown;
    // Compatibility projection for the old transient HUD. Terminal destruction is represented by
    // ordered events plus Outcome; a frozen simulation clock must never hold a timed cue forever.
    public bool SplashCueActive => false;
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

    /// <summary>Construct and stage one of the built-in beats. Physics remains held in Ready.</summary>
    public void StartBeat(int index,
        Carrier.DeckConfiguration deckConfiguration = Carrier.DeckConfiguration.Axial) {
        if (index is < 1 or > 6) index = 1;
        _prechargeSystemsOnStage = true;
        _beatIndex = index;
        _deckConfiguration = deckConfiguration;
        _beatFactory = index switch {
            2 => Beats.BreakDefense,
            3 => Beats.Saddle,
            4 => Beats.BalloonStrike,
            5 => () => Beats.CarrierApproach(deckConfiguration),
            6 => () => Beats.EmergencyGearRecovery(deckConfiguration),
            _ => Beats.Perch
        };
        StageBeat(_beatFactory());
    }

    /// <summary>Stage a built-in beat under an explicit thermodynamic/wind profile.</summary>
    public void StartBeat(int index, WeatherProfile? weather,
        Carrier.DeckConfiguration deckConfiguration = Carrier.DeckConfiguration.Axial) {
        _weatherProfile = weather;
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

    public void FeedKey(GKey key, bool pressed) {
        if (key == GKey.Restart) {
            if (pressed) Restart();
            return;
        }
        if (Lifecycle != LifecycleState.Active) return;
        // Once ownship is physically destroyed, input cannot be allowed to reanimate controls or
        // systems. Restart remains available through the early branch above.
        if (_playerTerminalState != AircraftTerminalState.Flying) return;
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
        StepCore();
        _tick++;
        CaptureIncidentReplaySample();
    }

    void StageBeat(BeatSetup setup) {
        ArgumentNullException.ThrowIfNull(setup);
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
            onApproach: _carrier is not null && !maintenanceRecovery,
            prechargeUtilityHydraulics: _prechargeSystemsOnStage && !maintenanceRecovery);
        _maintenanceScenario = maintenanceRecovery
            ? new F86EmergencyGearRecoveryScenario(_systems)
            : null;
        _configurationAutomationEnabled = _carrier is not null && !maintenanceRecovery;
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
                - _systems.AerodynamicState.LiftCoefficientIncrement
                    / Math.Max(_beat.PlayerAir.CLAlpha, 1e-6);
            _carrier.ApproachDirectorPitchOffsetRad = configuredOnSpeedAoa;
            _beat = _beat with {
                Player = _carrier.ToWorldStateFromAir(_beat.Player, configuredOnSpeedAoa)
            };
        }

        _recovery = Carrier.Recovery.Flying;
        _touchdown = Carrier.TouchdownResult.Flying;
        _arrestment.Reset();
        _catapult.Reset();
        _waveOffArmed = _carrier is not null;
        _waveOffUntilMs = double.NegativeInfinity;
        _burble = _carrier is null ? null : CreateBurble(_carrier, _difficulty,
            _weatherProfile?.Wind);
        _player = CreatePlayer(_beat.Player);
        _bandit = _beat.CreateBandit();
        _playerSpawnSequence++;
        _banditSpawnSequence++;
        if (_carrier is not null) _carrierSpawnSequence++;
        _bandit.Wind = _player.Wind;
        _bandit.Atmosphere = _player.AtmosphereModel;
        CombatConfig combat = _beat.CombatRules;
        _gunKill = new GunKill(combat.PlayerAmmo, combat.OpponentHitsToDefeat);
        _opponentGun = new GunKill(combat.OpponentAmmo, combat.PlayerHitsToDefeat);
        _keys = new KeyGrammar();
        _detents = new DetentLayer {
            Variant = _carrier is not null ? ValleyVariant.PhysicsOnly : _requestedVariant,
            ApproachMode = _carrier is not null,
            AerodynamicConfiguration = _systems.AerodynamicState,
            AtmosphereModel = _player.AtmosphereModel
        };
        _detents.ConfigureFor(_beat.PlayerAir);
        _prompts = new PromptTracker();
        _advice = new DoctrineAdvice(1.0, 0.0, "setup");
        _cue = PromptCue.None;
        _triggerDown = false;
        _opponentTriggerDown = false;
        _accumulatorSeconds = 0.0;
        _shotsTotal = 0;
        _shotsInWindow = 0;
        _killCount = 0;
        _outcome = SortieOutcome.None;
        _pendingOutcome = SortieOutcome.None;
        _playerTerminalState = AircraftTerminalState.Flying;
        _opponentTerminalState = AircraftTerminalState.Flying;
        _playerImpactSurface = ImpactSurface.None;
        _opponentImpactSurface = ImpactSurface.None;
        _playerCarrierSolid = Carrier.SolidCollision.None;
        _playerWreckMotion = null;
        _terminalStartedAtMs = double.PositiveInfinity;
        _recentEvents.Clear();
        _incidentReplay.Reset();
        _transitionCue = "";
        _transitionCueUntilMs = double.NegativeInfinity;
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
            AerodynamicConfiguration = _systems.AerodynamicState
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
            consumesFuel: loadout.ConsumesFuel);
    }

    static BurbleField CreateBurble(Carrier carrier, in RecoveryDifficulty difficulty,
        IWindField? ambient = null) => new(
        carrier,
        new TurbulenceField(intensityMps: difficulty.BurbleIntensityMps,
            outerScaleM: 80.0, intermittency: 0.6, seed: difficulty.TurbulenceSeed),
        ambient,
        sinkMps: difficulty.BurbleSinkMps);

    void ResetFlightControls(bool approachMode) {
        _detents = new DetentLayer {
            Variant = _carrier is not null ? ValleyVariant.PhysicsOnly : _requestedVariant,
            ApproachMode = approachMode,
            AerodynamicConfiguration = _systems.AerodynamicState,
            AtmosphereModel = _player.AtmosphereModel
        };
        _detents.ConfigureFor(_beat.PlayerAir);
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
        if (_systems is not null) {
            _systems.SetFlapLever(WingFlapLever.Hold);
            if (_maintenanceScenario is { Started: true, Finished: false })
                _maintenanceScenario.SetEmergencyGearRelease(false, TimeSeconds);
            else
                _systems.SetEmergencyGearRelease(false);
        }
        _triggerDown = false;
        _opponentTriggerDown = false;
        _accumulatorSeconds = 0.0;
    }

    void Trigger(bool down) {
        if (down && !_triggerDown) {
            _shotsTotal++;
            if (CameraSolver.GunWindow(_player.State, _bandit.State)) _shotsInWindow++;
        }
        _triggerDown = down;
    }

    void EmitEvent(SessionEventType type, CombatRole source, CombatRole target,
        int count = 0, SortieOutcome outcome = SortieOutcome.None,
        ImpactSurface surface = ImpactSurface.None) {
        if (_recentEvents.Count == RecentEventCapacity) _recentEvents.RemoveAt(0);
        var sessionEvent = new SessionEvent(
            ++_eventSequence,
            _tick + 1,
            type,
            source,
            target,
            count,
            outcome,
            surface);
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

    void StepWeapons(in AircraftState playerState, in AircraftState opponentState,
        bool playerTriggerHeld, bool allowNewFire = true) {
        bool opponentIntent = allowNewFire && _beat.CombatRules.OpponentAmmo > 0
            && _bandit.WantsToFire(playerState);
        _opponentTriggerDown = opponentIntent
            && _opponentGun.AmmoRemaining > 0
            && _opponentGun.TargetAlive;

        // Both weapons receive the same beginning-of-tick world snapshot. Neither combatant gets
        // to observe the other's already-integrated future position or suppress same-tick return
        // fire by resolving its own hit first.
        _gunKill.Step(allowNewFire && playerTriggerHeld,
            playerState, opponentState, FixedDeltaSeconds);
        _opponentGun.Step(_opponentTriggerDown, opponentState, playerState, FixedDeltaSeconds);

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
            _killCount++;
            BeginCatastrophicDamage(CombatRole.Opponent, CombatRole.Player);
        }
        if (_opponentGun.Outcome == FightOutcome.Splash
            && _playerTerminalState == AircraftTerminalState.Flying) {
            if (_recoveryAttemptActive) _attemptHadSetback = true;
            BeginCatastrophicDamage(CombatRole.Player, CombatRole.Opponent);
        }
        UpdatePendingOutcome();
    }

    void BeginCatastrophicDamage(CombatRole target, CombatRole source) {
        BeginTerminalClock();
        if (target == CombatRole.Player) {
            if (_playerTerminalState != AircraftTerminalState.Flying) return;
            _playerTerminalState = AircraftTerminalState.DestroyedAirborne;
            _player.EngineCombustionAvailable = false;
            _player.AerodynamicConfiguration = TerminalFlightDynamics.Configuration(
                _systems.AerodynamicState, handedness: -1);
        } else if (target == CombatRole.Opponent) {
            if (_opponentTerminalState != AircraftTerminalState.Flying) return;
            _opponentTerminalState = AircraftTerminalState.DestroyedAirborne;
            _bandit.ApplyCatastrophicDamage(handedness: 1);
        } else return;
        EmitEvent(SessionEventType.Destroyed, source, target);
    }

    void BeginTerminalClock() {
        if (double.IsPositiveInfinity(_terminalStartedAtMs)) {
            _terminalStartedAtMs = _simTimeMs;
            ClearHeldInput();
        }
    }

    void UpdatePendingOutcome() {
        bool playerLost = _playerTerminalState != AircraftTerminalState.Flying;
        bool opponentLost = _opponentTerminalState != AircraftTerminalState.Flying;
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
        return current.Position.Y <= 0.0
            ? (ImpactSurface.Water, Carrier.SolidCollision.None, Vec3D.Zero, 0.0)
            : (ImpactSurface.None, Carrier.SolidCollision.None, Vec3D.Zero, 0.0);
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
        BeginTerminalClock();
        if (target == CombatRole.Player)
            _playerCarrierSolid = ResolvePlayerCarrierSolid(surface, carrierSolid);
        EmitEvent(SessionEventType.Impact, CombatRole.None, target, surface: surface);
        if (target == CombatRole.Player && surface is ImpactSurface.FlightDeck
            or ImpactSurface.CarrierStructure)
            CaptureIncidentReplaySample(completedContactTick: true);
        BeginCatastrophicDamage(target, CombatRole.None);
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
        if (target == CombatRole.Player) {
            if (_maintenanceScenario is { Finished: false }) {
                _attemptHadSetback = true;
                _maintenanceScenario.RecordAircraftLost(TimeSeconds);
            }
            _playerTerminalState = AircraftTerminalState.Impacted;
            _playerImpactSurface = surface;
            _playerWreckMotion = new WreckContactMotion(_player.State, surface,
                surfaceVelocity, surfaceHeightM, _carrier,
                tangentialImpulseAlreadyResolved,
                ResolvePlayerCarrierSolid(surface, carrierSolid));
            _playerCarrierSolid = _playerWreckMotion.CarrierSolid;
            _player.AdoptExternalKinematics(_playerWreckMotion.State);
        } else {
            _opponentTerminalState = AircraftTerminalState.Impacted;
            _opponentImpactSurface = surface;
            _bandit.ApplySurfaceImpact(surface, surfaceVelocity, surfaceHeightM, _carrier);
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

    bool FinishTerminalIfResolved(double completedTimeMs) {
        if (!TerminalPhaseActive) return false;
        bool playerResolved = _playerTerminalState is AircraftTerminalState.Flying
            or AircraftTerminalState.Settled
            or AircraftTerminalState.SimulationBounded;
        bool opponentResolved = _opponentTerminalState is AircraftTerminalState.Flying
            or AircraftTerminalState.Settled
            or AircraftTerminalState.SimulationBounded;
        if (!playerResolved || !opponentResolved) {
            if (completedTimeMs - _terminalStartedAtMs
                < TerminalSimulationLimitSeconds * 1000.0) return false;
            ForceTerminalLimit(CombatRole.Player);
            ForceTerminalLimit(CombatRole.Opponent);
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
        ResetFlightControls(approachMode: false);
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
        _player.AerodynamicConfiguration = _systems.AerodynamicState;
    }

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
        ApplyAutomaticConfigurationCommands();
        _systems.Step(FixedDeltaSeconds, new AirframeSystemsInput(
            _player.LastEngineOperatingPoint.RpmPercent,
            iasKts,
            weightOnWheels));
        ObserveAutomaticConfiguration();
        // Session time advances at the end of StepCore. Keep every scenario record in that same
        // beginning-of-tick epoch so a same-tick trap/loss cannot precede its latest observation.
        _maintenanceScenario?.Step(TimeSeconds);
        _player.AerodynamicConfiguration = _systems.AerodynamicState;
    }

    void StepFailedPlayerSystems(bool weightOnWheels) {
        _fuel.Step(FixedDeltaSeconds,
            _player.LastEngineOperatingPoint.FuelFlowLbPerMinute);
        RefreshPlayerMass();
        _player.EngineFuelAvailable = _fuel.HasFuel;
        double iasKts = AirData.IndicatedAirspeedMps(_player.AirspeedMps,
            _player.State.Position.Y, _player.AtmosphereModel) * AirData.MpsToKnots;
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
            && contact != Carrier.Recovery.Flying)
            _touchdown = touchdown;

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
                _recovery = Carrier.Recovery.Flying;
                _touchdown = Carrier.TouchdownResult.Flying;
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
            TerminalFlightDynamics.Step(_player, _systems.AerodynamicState,
                handedness: -1, FixedDeltaSeconds);
            StepFailedPlayerSystems(weightOnWheels: false);
            _player.AerodynamicConfiguration = TerminalFlightDynamics.Configuration(
                _systems.AerodynamicState, handedness: -1);
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
            _detents.AerodynamicConfiguration = _systems.AerodynamicState;
            _detents.Tick(_keys, _simTimeMs, _player.State, _beat.PlayerAir,
                _advice, FixedDeltaSeconds);
            if (_waveOffArmed && _detents.Throttle >= 0.95) {
                _waveOffUntilMs = _simTimeMs + 5000.0;
                _waveOffArmed = false;
                SelectAutomaticConfigurationTarget(FlightConfigurationTarget.Combat);
                if (_recoveryAttemptActive) _attemptHadSetback = true;
            }
            _cue = _prompts.Cue(_advice, _detents.Command, _detents.Tier);
            PreparePlayerForPoweredTick();
            _player.Step(_detents.Command, FixedDeltaSeconds);
            ConsumeFuelAndStepSystems(_player.State, _player.AirspeedMps,
                weightOnWheels: false);
        }

        _bandit.Step(previousPlayer, FixedDeltaSeconds);
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
            _bandit.Step(catapultState, FixedDeltaSeconds);
            _carrier.Step(FixedDeltaSeconds);
            _catapult.Step(_carrier, FixedDeltaSeconds);
            _player.AdoptExternalKinematics(_catapult.State);
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
            _bandit.Step(playerState, FixedDeltaSeconds);
            _carrier.Step(FixedDeltaSeconds);
            _arrestment.Step(_carrier, FixedDeltaSeconds);
            _player.AdoptExternalKinematics(CurrentArrestmentState());
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
        _detents.AerodynamicConfiguration = _systems.AerodynamicState;
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
        StepWeapons(previousPlayerState, previousOpponentState, _triggerDown);
        PreparePlayerForPoweredTick();
        _player.Step(_detents.Command, FixedDeltaSeconds);
        ConsumeFuelAndStepSystems(_player.State, _player.AirspeedMps,
            weightOnWheels: false);
        // Both aircraft receive the same beginning-of-tick world snapshot. Giving the bandit the
        // already-integrated player leaked one fixed tick of future ownship motion into its law.
        _bandit.Step(previousPlayerState, FixedDeltaSeconds);

        if (_carrier is not null) {
            _carrier.Step(FixedDeltaSeconds);
        }

        ObserveCombatDamage();
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

        if (_player.BelowGround) {
            RegisterUndamagedCrash(CombatRole.Player, ImpactSurface.Water,
                Vec3D.Zero, 0.0);
            _simTimeMs += FixedDeltaSeconds * 1000.0;
            return;
        }
        if (_bandit.State.Position.Y <= 0.0) {
            RegisterUndamagedCrash(CombatRole.Opponent, ImpactSurface.Water,
                Vec3D.Zero, 0.0);
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
