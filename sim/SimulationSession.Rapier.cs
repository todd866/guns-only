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

// Partial of SimulationSession: Rapier.
public sealed partial class SimulationSession {
    public bool RapierMissionAvailable => _beat.ScriptedIntercept is not null;
    public RapierMissionPhase RapierPhase =>
        _rapierMissionDirector?.Phase ?? RapierMissionPhase.Unavailable;
    public RapierComputerFailure RapierComputerFailurePlan =>
        _beat.ScriptedIntercept?.ComputerFailureAtZoomCoast
            ?? RapierComputerFailure.None;
    public RapierComputerFailure RapierComputerFailureActive =>
        _rapierComputerFailureActive;
    public bool RapierMissionComputerAvailable =>
        _rapierComputerFailureActive != RapierComputerFailure.MissionComputer;
    public bool RapierFlightControlComputersAvailable =>
        _rapierComputerFailureActive != RapierComputerFailure.FlightControlComputers;
    public bool RapierUncontrolledReentry =>
        _rapierComputerFailureActive == RapierComputerFailure.FlightControlComputers;
    public string RapierMissionCue => _rapierComputerFailureActive switch {
        RapierComputerFailure.MissionComputer =>
            "MISSION COMPUTER LOST · AUTOMATION / DIRECTOR INOP · FBW + RCS REMAIN · FLY MANUAL",
        RapierComputerFailure.FlightControlComputers =>
            "FLIGHT CONTROL COMPUTERS LOST · NO PILOT-TO-ACTUATOR PATH · UNCONTROLLED REENTRY",
        _ => _rapierMissionGuidance.Cue ?? ""
    };
    public double RapierTargetMach => _rapierMissionGuidance.TargetMach;
    public double RapierTargetAltitudeFt => _rapierMissionGuidance.TargetAltitudeFt;
    public bool RapierAutomationEnabled => RapierMissionAvailable
        && RapierMissionComputerAvailable
        && RapierFlightControlComputersAvailable
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
    public bool RapierBalloonReactionActive =>
        double.IsFinite(_rapierBalloonReactionStartedAtMs)
        && !_rapierBalloonPayloadDeployed
        && LiveOpponentCount > 0;
    public double RapierBalloonReactionSecondsRemaining {
        get {
            double delay = Math.Max(0.0,
                _beat.ScriptedIntercept?.BalloonReactionDelaySeconds ?? 0.0);
            return RapierBalloonReactionActive
                ? Math.Max(0.0, delay
                    - (_simTimeMs - _rapierBalloonReactionStartedAtMs) / 1000.0)
                : 0.0;
        }
    }
    public bool RapierBalloonPayloadDeployed => _rapierBalloonPayloadDeployed;
    public Vec3D RapierGuidanceWaypoint => _rapierMissionGuidance.Waypoint;
    public int RapierRecoveryGate => _rapierMissionGuidance.RecoveryGate;
    public bool RapierRecoveryConfigurationRequested =>
        _rapierMissionGuidance.RecoveryConfigurationRequested;
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
    // Compatibility seam for shells built against the first Circuits-only snapshot.
    public MissionRadioTransmission CircuitRadio => _missionRadio;
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
    public double RapierTargetGammaDeg => _rapierMissionGuidance.TargetGammaDeg;
    public string RapierPhaseReason => _rapierMissionGuidance.PhaseReason ?? "";
    public string RapierIntention => _rapierMissionGuidance.Intention ?? "";
    public string RapierStrategy => _rapierMissionGuidance.Strategy ?? "";
    public RapierGunDrone? ActiveRapierGunDrone =>
        _rapierGunDrone is { StillActive: true } ? _rapierGunDrone : null;
    public bool RapierGunDroneEgress => _rapierGunDroneEgress;
    public bool RapierGunDroneThreatReactive => _rapierGunDroneThreatReactive;
    public double RapierTurbineThrustN => RapierMissionAvailable
        ? _player.LastEngineOperatingPoint.TurbineThrustN : 0.0;
    public double RapierRamjetThrustN => RapierMissionAvailable
        ? _player.LastEngineOperatingPoint.RamjetThrustN : 0.0;
    public double RapierTurbineFuelFlowLbPerMinute => RapierMissionAvailable
        ? _player.LastEngineOperatingPoint.TurbineFuelFlowLbPerMinute
        : 0.0;
    public double RapierRamjetFuelFlowLbPerMinute => RapierMissionAvailable
        ? _player.LastEngineOperatingPoint.RamjetFuelFlowLbPerMinute
        : 0.0;
    public RapierServiceLifeRecorder RapierServiceLife =>
        _rapierServiceLifeRecorder;

    void BeginRapierServiceLifeCapture() {
        if (!RapierMissionAvailable) return;
        _rapierServiceLifeRecorder.Begin(
            sessionSortieSequence: _playerSpawnSequence,
            missionContractId: _beat.MissionIdentity.Id,
            airframeDefinitionId: _beat.PlayerAircraft.Id,
            airframeDefinitionRevision: "embedded-aircraft-capability-v1",
            startTick: _tick,
            eventSequence: _eventSequence,
            initialFuelLb: _fuel.FuelLb,
            initialRoundsFired: OpponentPresent ? _gunKill.RoundsFired : 0,
            initialRcsGasKg: _player.ColdGasRcsGasKg);
    }

    void ObserveRapierServiceLifeTick() {
        if (!_rapierServiceLifeRecorder.Active
            || _playerTerminalState != AircraftTerminalState.Flying)
            return;
        AircraftState state = _player.State;
        AtmosphericState atmosphere =
            _player.AtmosphereModel.Sample(state.Position.Y);
        double trueAirspeedMps = _player.AirspeedMps;
        double mach = trueAirspeedMps
            / Math.Max(1.0, atmosphere.SpeedOfSoundMps);
        double thermalCapabilityK =
            Math.Max(0.0, _beat.PlayerAir.SkinTemperatureLimitK);
        _rapierServiceLifeRecorder.Observe(new RapierServiceLifeSample(
            Tick: _tick,
            EventSequence: _eventSequence,
            NormalLoadFactor: _player.LastNz,
            StructuralLimitG: Protection.HardMaxG(
                state, _beat.PlayerAir, trueAirspeedMps,
                _player.AtmosphereModel),
            OverrideSelected:
                _keys.PhaseAt(GKey.Override, _simTimeMs) != KeyPhase.Idle,
            DynamicPressurePa: _player.DynamicPressurePa,
            OverDynamicPressure: _player.OverDynamicPressure,
            Mach: mach,
            SkinTemperatureK: _player.SkinTemperatureK,
            StagnationTemperatureK: AirData.StagnationTemperatureK(
                mach, atmosphere.TemperatureK),
            ThermalCapabilityK: thermalCapabilityK,
            PropulsionRegime: RapierServiceLifeRegime(mach),
            InletUnstarted: _player.InletUnstarted,
            FuelLb: _fuel.FuelLb,
            RoundsFired: OpponentPresent ? _gunKill.RoundsFired : 0,
            RcsGasKg: _player.ColdGasRcsGasKg));
    }

    static RapierServiceLifePropulsionRegime RapierServiceLifeRegime(
        double mach) {
        if (mach < TurboRamjetPerformanceMap.RamFadeStartMach)
            return RapierServiceLifePropulsionRegime.Turbine;
        if (mach < TurboRamjetPerformanceMap.FullRamMach)
            return RapierServiceLifePropulsionRegime.Transition;
        if (mach < TurboRamjetPerformanceMap.TurbineGoneMach)
            return RapierServiceLifePropulsionRegime.RamCombined;
        return RapierServiceLifePropulsionRegime.RamOnly;
    }

    void FinalizeRapierServiceLife(
        RapierServiceLifeTerminationReason reason) {
        _rapierServiceLifeRecorder.Finalize(
            reason,
            endTickExclusive: _tick,
            eventSequence: _eventSequence);
    }

    bool TryRequestRapierRtb(MissionRtbReason reason) {
        if (Lifecycle != LifecycleState.Active
            || _playerTerminalState != AircraftTerminalState.Flying
            || !RapierMissionAvailable
            || _beat.ScriptedIntercept?.PatternOnly == true
            || RapierPhase >= RapierMissionPhase.ReturnToBase)
            return false;

        _returnToBaseReason = reason;
        _rapierPursuitActive = false;
        _nextOpponentSpawnAtMs = double.NegativeInfinity;
        Trigger(false);
        _opponentTriggerDown = false;
        _gunneryPitchAssistState = GunneryPitchAssistState.Inactive();
        _playerGunTargetPadlockRollAssistSelected = false;
        _playerGunTargetPadlockRollAssistTargetId = 0;
        _padlockRollAssist.Reset();
        ClearFormationCoordination();
        ShowTransition(reason == MissionRtbReason.BingoFuel
            ? "BINGO · KNOCK IT OFF · FLY THE HOME CORRIDOR"
            : "KNOCK IT OFF · FLY THE HOME CORRIDOR", 3400.0);
        return true;
    }

    public void SetRapierAutomationEnabled(bool enabled) {
        if (!RapierMissionAvailable) return;
        if (enabled && (!RapierMissionComputerAvailable
            || !RapierFlightControlComputersAvailable)) {
            _rapierAutomationEnabled = false;
            ShowTransition("MISSION AUTOMATION INOP · COMPUTER FAILURE", 2200.0);
            return;
        }
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

    double RamTransitionMachMargin() {
        if (_beat.PlayerAir.PropulsionModel
            != PropulsionModelKind.TurboRamjetPublicDataSurrogate)
            return double.PositiveInfinity;
        if (TransitionCueActive
            && (_transitionCue.StartsWith("RAM ", StringComparison.Ordinal)
                || _transitionCue.StartsWith("FULL RAM", StringComparison.Ordinal)
                || _transitionCue.StartsWith("TURBINE ", StringComparison.Ordinal)))
            return 0.0;
        double mach = _player.AirspeedMps
            / _player.AtmosphereModel.Sample(_player.State.Position.Y).SpeedOfSoundMps;
        double nextBoundary = _ramCueStage switch {
            0 => Propulsion.TurboRamjetPerformanceMap.RamFadeStartMach,
            1 => Propulsion.TurboRamjetPerformanceMap.FullRamMach,
            2 => Propulsion.TurboRamjetPerformanceMap.TurbineGoneMach,
            _ => double.PositiveInfinity
        };
        return nextBoundary - mach;
    }

    /// <summary>
    /// Width of the handover band the aircraft is currently crossing: previous boundary to next.
    /// TimeCompressionPolicy scales its lead against this so closely-spaced boundaries cannot
    /// chain their leads together and block compression across a whole Mach range.
    /// </summary>
    double RamTransitionBandWidthMach() {
        if (_beat.PlayerAir.PropulsionModel
            != PropulsionModelKind.TurboRamjetPublicDataSurrogate)
            return double.PositiveInfinity;
        double previousBoundary = _ramCueStage switch {
            0 => 0.0,
            1 => Propulsion.TurboRamjetPerformanceMap.RamFadeStartMach,
            2 => Propulsion.TurboRamjetPerformanceMap.FullRamMach,
            _ => double.PositiveInfinity
        };
        double nextBoundary = _ramCueStage switch {
            0 => Propulsion.TurboRamjetPerformanceMap.RamFadeStartMach,
            1 => Propulsion.TurboRamjetPerformanceMap.FullRamMach,
            2 => Propulsion.TurboRamjetPerformanceMap.TurbineGoneMach,
            _ => double.PositiveInfinity
        };
        if (!double.IsFinite(previousBoundary) || !double.IsFinite(nextBoundary))
            return double.PositiveInfinity;
        return nextBoundary - previousBoundary;
    }

    bool RapierReturnTransit =>
        _beat.ScriptedIntercept is not null
        && _playerTerminalState == AircraftTerminalState.Flying
        && _opponentTerminalState != AircraftTerminalState.Flying
        && !_wingmen.Any(static wingman => wingman.StillFighting)
        && RapierPhase is RapierMissionPhase.ReturnToBase
            or RapierMissionPhase.Recovery;

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

    void StepRapierBalloonReaction() {
        ScriptedInterceptConfig? config = _beat.ScriptedIntercept;
        if (config is not {
                Job: RapierJobKind.Balloon,
                ZoomLobProfile: false,
                BalloonReactionRangeM: > 0.0,
                BalloonReactionDelaySeconds: > 0.0
            }
            || _rapierBalloonPayloadDeployed
            || LiveOpponentCount <= 0
            || _catapult.IsActive)
            return;

        double rangeM = Geometry.Range(_player.State, SelectedOpponentState);
        if (!double.IsFinite(_rapierBalloonReactionStartedAtMs)) {
            if (rangeM > config.BalloonReactionRangeM) return;
            _rapierBalloonReactionStartedAtMs = _simTimeMs;
            ShowTransition(
                $"BALLOON MINE DETECTED YOU · {config.BalloonReactionDelaySeconds:F0} SEC TO DRONE DEPLOYMENT",
                3200.0);
            return;
        }
        if (RapierBalloonReactionSecondsRemaining > 0.0) return;

        _rapierBalloonPayloadDeployed = true;
        _rapierPursuitActive = config.PursuerCount > 0;
        _rapierPursuitRangeM = Math.Max(3_000.0, config.PursuitInitialRangeM);
        ShowTransition(
            $"LETHAL DRONES DEPLOYED · {config.PursuerCount} IN TRAIL · BREAK CONTACT",
            5000.0);
    }

    void UpdateRapierMissionGuidance() {
        if (_rapierMissionDirector is null || _carrier is null) return;
        // A 16 km initial on the 3.5-degree recovery plane. The old 2,500 m point demanded an
        // avoidable 9-degree dive just as the aircraft was trying to configure and slow.
        Vec3D recoveryInitial = _carrier.LandingPoint(along: -16_000.0, height: 1_000.0);
        bool recovered = _arrestment.Phase == ArrestmentModel.ArrestmentPhase.Stopped;
        bool patternOnly = _beat.ScriptedIntercept?.PatternOnly == true;
        AircraftState missionContact = OpponentPresent
            ? _bandit.State
            : patternOnly
                // RapierMissionDirector calculates contact geometry before dispatching to the
                // pattern-only branch. Those values are structurally unused by Circuits, so feed
                // ownship as a neutral value without creating or retaining a phantom actor.
                ? _player.State
                : throw new InvalidOperationException(
                    "A Rapier intercept mission requires an opponent actor.");
        // Circuits overhead is authored in the landing frame so OFT LandingPoint cards and
        // threshold padlock share the same home as INITIAL / BREAK / DOWNWIND geometry.
        Vec3D home = patternOnly ? _carrier.LandingPoint(0.0) : _carrier.Position;
        _rapierMissionGuidance = _rapierMissionDirector.Step(
            _player.State,
            missionContact,
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
                _carrier.AircraftSupportReferenceHeightM,
            returnToBaseRequested: RapierMissionAvailable
                && _returnToBaseReason != MissionRtbReason.None,
            returnToBaseReason: _returnToBaseReason);
        if (patternOnly) {
            _circuitTraffic = CircuitPatternTraffic.Evaluate(
                TimeSeconds, home, recoveryInitial, count: 3);
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

    /// <summary>
    /// Inject an authored Rapier computer casualty. Mission-computer loss is a fly-manual problem:
    /// the keyboard still commands the surviving FBW/RCS layer. Total flight-control-computer loss
    /// is not. This aircraft has no mechanical reversion, so treating keyboard keys as a secret
    /// direct cable to the surfaces would manufacture survivability; the loss is terminal and the
    /// ordinary failed-flight dynamics carry the article through its uncontrolled reentry.
    /// </summary>
    public bool InduceRapierComputerFailure(RapierComputerFailure failure) {
        if (failure == RapierComputerFailure.None
            || !RapierMissionAvailable
            || Lifecycle != LifecycleState.Active
            || _playerTerminalState != AircraftTerminalState.Flying
            || _rapierComputerFailureActive != RapierComputerFailure.None)
            return false;

        _rapierComputerFailureActive = failure;
        _rapierAutomationEnabled = false;
        _rapierManualOverrideUntilMs = double.NegativeInfinity;
        _assistedFlight = false;
        _configurationAutomationEnabled = false;
        _playerGunTargetPadlockRollAssistSelected = false;
        _playerGunTargetPadlockRollAssistTargetId = 0;
        _padlockRollAssist.Reset();
        _autoGcasRecoveryCommand = null;
        _autoGcasPredictionTicksRemaining = 0;
        _pilotInputOverrideSeconds = 0.0;
        DisengageTimeCompression(TimeCompressionInhibitReason.Damage);
        double altitudeFt = _player.State.Position.Y / 0.3048;

        if (failure == RapierComputerFailure.MissionComputer) {
            ShowTransition(
                $"MISSION COMPUTER LOST · {altitudeFt:F0} FT · FBW + RCS REMAIN · FLY MANUAL",
                6000.0);
            return true;
        }

        BeginCatastrophicDamage(CombatRole.Player, CombatRole.None);
        ShowTransition(
            $"FLIGHT CONTROL COMPUTERS LOST · {altitudeFt:F0} FT · "
                + "NO CONTROL PATH · UNCONTROLLED REENTRY",
            8000.0);
        return true;
    }

    void MaybeInjectRapierComputerFailure() {
        if (_rapierComputerFailureActive != RapierComputerFailure.None
            || RapierPhase != RapierMissionPhase.ZoomCoast)
            return;
        InduceRapierComputerFailure(RapierComputerFailurePlan);
    }

    PilotCommand RapierAutomationOr(in PilotCommand pilotCommand) {
        UpdateRapierMissionGuidance();
        return RapierAutomationActive
            ? _rapierMissionGuidance.Command
            : pilotCommand;
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
}
