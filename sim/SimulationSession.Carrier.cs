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

// Partial of SimulationSession: Carrier.
public sealed partial class SimulationSession {
    public Carrier.DeckConfiguration DeckConfiguration => _deckConfiguration;
    public CarrierSortieRouteState CarrierSortieRoute => _carrierSortieRoute.State;
    public bool CarrierSortieRtbAvailable =>
        _carrierSortieRoute.State.RtbAvailable;
    public bool CarrierSortieRtbRequested =>
        _carrierSortieRoute.State.RtbRequested;
    /// <summary>
    /// The finite axial whole-sortie card raises the crash barrier for recovery. Generic carrier
    /// drills retain their established bolter behavior, and angled decks always keep a flyaway.
    /// </summary>
    public bool StraightDeckBarrierArmed =>
        _carrierSortieRoute.State.Active
        && _carrier is {
            IsMaritime: true,
            Configuration: Carrier.DeckConfiguration.Axial
        };
    public Carrier? Carrier => _carrier;
    public Carrier.Recovery Recovery => _recovery;
    public Carrier.TouchdownResult Touchdown => _touchdown;
    public CarrierPassResult CarrierPass => _carrierPass.Result;
    public ArrestmentModel Arrestment => _arrestment;
    public CatapultLaunchModel Catapult => _catapult;
    public LaunchTerrainClearanceAssessment LaunchTerrainClearance =>
        _launchTerrainClearance;
    public BurbleField? Burble => _burble;
    public bool WaveOffActive => _carrier is not null && _simTimeMs < _waveOffUntilMs;
    public FlightConfigurationTarget ConfigurationTarget => _configurationTarget;
    public bool ConfigurationAutomationEnabled => _configurationAutomationEnabled;

    /// <summary>
    /// Top Gun leaves gear, flaps and the hook to the pilot. This turns the existing pattern
    /// automation back on for a practice pass without changing the production default.
    /// </summary>
    public void SetCarrierConfigurationPractice(bool enabled) {
        _carrierConfigurationPractice = enabled;
        if (!TopGunFightRuntime.IsTopGunMission(_beat.MissionIdentity.Id)) return;
        bool maintenanceRecovery = _beat.MaintenanceScenario
            == MaintenanceScenarioKind.F86EmergencyGearRecovery;
        _configurationAutomationEnabled = enabled
            && PlayerSystemsSimulated
            && _carrier is not null
            && !maintenanceRecovery;
        if (_configurationAutomationEnabled)
            ApplyAutomaticConfigurationCommands();
    }

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

    /// <summary>
    /// The browser's O action is shared with combat KNOCK IT OFF. On a finite non-combat carrier
    /// sortie it means RETURN TO SHIP instead: latch the moving-home route without manufacturing a
    /// relief fighter or requiring an opponent outcome. The route itself rejects a pre-launch
    /// request, so this public seam is safe for input hosts and deterministic acceptance tests.
    /// </summary>
    public bool TryRequestCarrierSortieRtb(
        MissionRtbReason reason = MissionRtbReason.PilotKnockItOff) {
        if (Lifecycle != LifecycleState.Active
            || _playerTerminalState != AircraftTerminalState.Flying
            || _carrier is null
            || !_carrierSortieRoute.TryRequestRtb(_carrier, _player.State))
            return false;
        _returnToBaseReason = reason;
        Trigger(false);
        _gunneryPitchAssistState = GunneryPitchAssistState.Inactive();
        _playerGunTargetPadlockRollAssistSelected = false;
        _playerGunTargetPadlockRollAssistTargetId = 0;
        _padlockRollAssist.Reset();
        ShowTransition(reason == MissionRtbReason.BingoFuel
            ? "BINGO · RTB · RETURN TO SHIP"
            : "RTB · RETURN TO SHIP", 2800.0);
        return true;
    }

    void UpdateCarrierSortieRoute() {
        if (_carrier is null) return;
        if (_carrier.IsMaritime && _beat.RecoveryPlan is { } recoveryPlan) {
            _meshNav.UpdateHomePlate(new MeshPlace(
                recoveryPlan.Id,
                recoveryPlan.DisplayName,
                _carrier.Position.X,
                _carrier.Position.Z,
                _carrier.Position.Y,
                MeshPlaceRole.Home));
        }
        if (!_carrierSortieRoute.State.Active) return;
        _carrierSortieRoute.Step(
            _carrier,
            _player.State,
            _catapult.IsActive,
            Lifecycle == LifecycleState.Finished);
    }

    static BurbleField CreateBurble(Carrier carrier, in RecoveryDifficulty difficulty,
        IWindField? ambient = null) => new(
        carrier,
        new TurbulenceField(intensityMps: difficulty.BurbleIntensityMps,
            outerScaleM: 80.0, intermittency: 0.6, seed: difficulty.TurbulenceSeed),
        ambient,
        sinkMps: difficulty.BurbleSinkMps);

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
            && _rapierMissionGuidance.RecoveryConfigurationRequested
            && _player.IndicatedAirspeedMps * 1.94384
                <= PlayerSystemsProfile.GearAndFlapLimitKias;
        // The finite carrier route's Recovery fix is the configuration boundary. Waiting for the
        // generic close-in slot would defer gear/flaps until three kilometres astern, too late for
        // the physical actuators to lock before the wires. This route-only branch does not engage
        // ApproachMode early; it starts configuration while the pilot retains ordinary control.
        bool carrierRouteRecoveryConfiguration =
            _carrierSortieRoute.State.Active
            && _carrierSortieRoute.State.Phase is >= CarrierSortieRoutePhase.Recovery
                and < CarrierSortieRoutePhase.Complete;
        bool conventionalPatternConfiguration =
            _conventionalCarrierRecovery.DirtyRequested
            && _player.IndicatedAirspeedMps * AirData.MpsToKnots
                <= PlayerSystemsProfile.GearAndFlapLimitKias;
        if (carrierRouteRecoveryConfiguration
            || conventionalPatternConfiguration
            || (inSlot && !WaveOffActive
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
            >= _systems.FullFlapDegrees - FlapTargetToleranceDeg
        : Math.Max(_systems.LeftFlapDegrees, _systems.RightFlapDegrees)
            <= FlapTargetToleranceDeg;

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
        _manualHookConfiguration = false;
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
        if (!_manualHookConfiguration) {
            _systems.CommandHook(_configurationTarget == FlightConfigurationTarget.Recovery
                ? TailhookHandle.Down : TailhookHandle.Up);
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

    void FinishCarrierQualificationSortie(bool recovered) {
        if (!_beat.RecoveryCompletesSortie || Lifecycle != LifecycleState.Active) return;
        if (recovered) {
            RecordStoppedTrap();
            _ = CompletePlayerRecovery();
        }
        ScriptedInterceptConfig? intercept = _beat.ScriptedIntercept;
        bool balloonKillRequired = intercept is {
            RecoveryRequired: true,
            Job: RapierJobKind.Balloon
        };
        bool balloonGallery = intercept is {
            Job: RapierJobKind.Balloon,
            ZoomLobProfile: false,
            FormationSize: > 1
        };
        bool physicalBalloonKillEarned = !balloonKillRequired
            || (balloonGallery
                ? LiveOpponentCount == 0
                    && _killCount >= intercept!.FormationSize
                    && !_rapierBalloonPayloadDeployed
                : OpponentPresent && _gunKill.Outcome == FightOutcome.Splash);
        // A safe recovery after an incomplete balloon task is good airmanship, but not mission
        // success. The gallery requires every physical carrier destroyed before payload deployment;
        // legacy one-balloon cards retain their own stopped-trap plus Splash transaction.
        _outcome = recovered && physicalBalloonKillEarned
            ? SortieOutcome.Victory
            : SortieOutcome.Draw;
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
        if (OpponentPresent) _bandit.Wind = _player.Wind;
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
        _lastRange = OpponentPresent
            ? Geometry.Range(_player.State, SelectedOpponentState)
            : 0.0;
        _closureKts = _closureSmooth = 0.0;
        ShowTransition("AIRBORNE · NEXT PASS", 1400.0);
    }

    static QuaternionD CarrierConstrainedAttitude(Carrier carrier, double pitchRad) {
        Vec3D up = new(0.0, 1.0, 0.0);
        Vec3D forward = carrier.LandingFwd * Math.Cos(pitchRad)
            + up * Math.Sin(pitchRad);
        Vec3D bodyUp = up * Math.Cos(pitchRad)
            - carrier.LandingFwd * Math.Sin(pitchRad);
        return QuaternionD.FromFrame(bodyUp.Cross(forward).Normalized(), bodyUp, forward);
    }

    /// <summary>
    /// Ground kinematics for a fixed-strip rollout: aerobrake, rolling resistance and wheel brake.
    ///
    /// The coefficients are ConventionalRunwayRecoveryModel's, which are already used and tested
    /// for a land rollout, and they turn out to describe this aircraft well: a delta held at about
    /// 20 degrees alpha has CD near 0.184, which at recovery weight is a deceleration of
    /// 0.000213 x V^2 against that model's 0.00022 aerodynamic factor. The aerobrake the recovery
    /// is designed around is therefore what the numbers already say it is, not a new invention.
    ///
    /// Throttle still matters, and deliberately: idle commands the hardest braking, and leaving
    /// power on lengthens the rollout and can carry the hook past the array.
    /// </summary>
    AircraftState CurrentStripRolloutState(double stepSeconds) {
        const double RollingResistanceMps2 = 0.22;
        const double AerobrakeDragFactor = 0.00022;
        const double MaximumWheelBrakeMps2 = 3.4;
        const double FullBrakeThrottle = 0.22;

        AircraftState state = _player.State;
        if (_carrier is null) return state;

        Vec3D forward = _carrier.LandingFwd;
        double speedAlong = System.Math.Max(0.0, state.VelocityVector().Dot(forward));
        double throttle = System.Math.Clamp(_player.LastAppliedCommand.Throttle, 0.0, 1.5);
        double brakeFraction = System.Math.Clamp(
            (FullBrakeThrottle - throttle) / FullBrakeThrottle, 0.0, 1.0);
        double deceleration = RollingResistanceMps2
            + AerobrakeDragFactor * speedAlong * speedAlong
            + MaximumWheelBrakeMps2 * brakeFraction;
        double nextSpeed = System.Math.Max(0.0,
            speedAlong - deceleration * System.Math.Max(0.0, stepSeconds));

        // Hold the aircraft ON the surface, not in it. LandingAircraftSupportFrame subtracts
        // AircraftSupportReferenceHeightM, so placing the jet back at LandingPoint(along, cross)
        // with no height put it that far UNDER the strip -- measured -0.8 m, which reads as a
        // surface penetration and ends the sortie the instant the rollout begins.
        var (along, cross, _) = _carrier.LandingAircraftSupportFrame(state.Position);
        Vec3D position = _carrier.LandingPoint(
            along, cross, _carrier.AircraftSupportReferenceHeightM);
        Vec3D velocity = _carrier.DeckVelocityWorld + forward * nextSpeed;
        return Carrier.StateFromVelocity(position, velocity, state.Mass,
            CarrierConstrainedAttitude(_carrier, _player.BodyPitchRad));
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
            _detents.EffectiveOnSpeedAoARad(_beat.PlayerAir),
            StraightDeckBarrierArmed
                ? Carrier.MissedWireDisposition.Barrier
                : Carrier.MissedWireDisposition.Bolter);
        Carrier.Recovery contact = touchdown.Recovery;
        var previousDeck = _carrier.AircraftSupportFrame(previousPlayerState.Position);
        var currentDeck = _carrier.AircraftSupportFrame(_player.State.Position);
        bool topDeckContact = contact is Carrier.Recovery.Trap
                or Carrier.Recovery.Bolter or Carrier.Recovery.HardLanding
                or Carrier.Recovery.RollingOut
                or Carrier.Recovery.BarrierEngagement
            && previousDeck.height >= -0.05 && currentDeck.height <= 0.05
            && _carrier.DeckSinkRateMps(_player.State) > 0.0;
        Carrier.SolidCollision solid = _carrier.SweptSolidCollision(
            previousPlayerState.Position, _player.State.Position);
        bool approachDirty = _systems.HookDown
            && Math.Min(_systems.LeftFlapDegrees, _systems.RightFlapDegrees)
                >= _systems.FullFlapDegrees - FlapTargetToleranceDeg;
        // A bolter is wheels on deck and a missed arrestment. Gear up, or gear not locked,
        // is a deck strike. Hook up or flaps short of the approach setting, with the gear
        // down and locked and a survivable touchdown, is the flyaway.
        bool unconfiguredCaseIBolter = TopGunFightRuntime.IsTopGunMission(
                _beat.MissionIdentity.Id)
            && _systems.AllGearDownAndLocked
            && !approachDirty
            && solid == Carrier.SolidCollision.FlightDeck
            && topDeckContact
            && contact is Carrier.Recovery.Trap or Carrier.Recovery.Bolter;
        if (unconfiguredCaseIBolter && contact == Carrier.Recovery.Trap) {
            touchdown = touchdown with {
                Recovery = Carrier.Recovery.Bolter,
                Hook = Carrier.HookOutcome.MissedWires,
                Wire = 0,
            };
            contact = Carrier.Recovery.Bolter;
        }

        // The recorded result must be the ENGAGEMENT, not the arrival. A strip recovery now makes
        // contact as RollingOut and only takes the wire a kilometre later, so latching the first
        // non-Flying contact froze the result as "missed the wires" while the aircraft went on to
        // arrest and stop. Refresh it when the rollout converts to a trap: on a strip the wire is
        // the outcome, and the touchdown was only how the aircraft got to it.
        if ((_touchdown.Recovery == Carrier.Recovery.Flying
                && contact != Carrier.Recovery.Flying)
            || (_touchdown.Recovery == Carrier.Recovery.RollingOut
                && contact is Carrier.Recovery.Trap or Carrier.Recovery.Bolter
                    or Carrier.Recovery.HardLanding
                    or Carrier.Recovery.BarrierEngagement)) {
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

        if (solid != Carrier.SolidCollision.None && !validRecoveryContact
            && !unconfiguredCaseIBolter) {
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
        } else if (contact == Carrier.Recovery.RollingOut) {
            // ON THE GROUND, BRAKING, WIRES AHEAD. Hold the aircraft on the surface and let it
            // decelerate; the per-tick EvaluateRecovery will return Trap by itself the moment the
            // hook sweeps a wire, so the engagement happens at rollout speed rather than at
            // approach speed. This is the state that never existed: a strip touchdown short of the
            // wires used to be called a bolter and flown away in the same tick.
            if (_recovery != Carrier.Recovery.RollingOut) ShowTransition("ROLLOUT");
            _recovery = Carrier.Recovery.RollingOut;
            _detents.ApproachMode = false;
            _player.AdoptExternalKinematics(CurrentStripRolloutState(FixedDeltaSeconds));
        } else if (contact == Carrier.Recovery.BarrierEngagement) {
            // A straight-deck missed wire is not an angled-deck bolter.  The raised barrier owns
            // the terminal deck state; preserve it explicitly so presentation/debrief cannot show
            // a fictional flyaway behind parked aircraft.
            _attemptHadSetback = true;
            _recovery = Carrier.Recovery.BarrierEngagement;
            _detents.ApproachMode = false;
            _player.AdoptExternalKinematics(
                _carrier.BarrierEngagementState(_player.State));
            ShowTransition("BARRIER · MISSED WIRES");
            if (_beat.RecoveryCompletesSortie)
                FinishCarrierQualificationSortie(recovered: false);
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
                if (_beat.RecoveryCompletesSortie && _beat.BolterCompletesSortie) {
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

    void CompleteUnopposedCarrierConstraintTick(
        in AircraftState previousPlayer) {
        double completedTimeMs = _simTimeMs + FixedDeltaSeconds * 1000.0;
        if (TerminalPhaseActive) {
            if (_playerTerminalState == AircraftTerminalState.DestroyedAirborne) {
                var contact = DetectImpact(previousPlayer, _player.State);
                if (contact.surface != ImpactSurface.None)
                    RegisterAirborneImpact(CombatRole.Player,
                        contact.surface, contact.velocity, contact.height,
                        contact.carrierSolid);
            }
            ObserveSettledWrecks();
            FinishTerminalIfResolved(completedTimeMs);
        }
        _simTimeMs = completedTimeMs;
    }
}
