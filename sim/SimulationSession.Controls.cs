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

// Partial of SimulationSession: Controls.
public sealed partial class SimulationSession {

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

    public void SetVariant(ValleyVariant variant) {
        _requestedVariant = variant;
        if (_carrier is null) _detents.Variant = variant;
    }

    /// <summary>Enable or disable the pilot-selected assisted dogfighting command layer.</summary>
    public void SetAssistedFlight(bool enabled) =>
        _assistedFlight = enabled && OpponentPresent;

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
        if (_casevacFlight is not null) {
            bool casevacNewPress =
                pressed
                && _keys.PhaseAt(key, _simTimeMs)
                    == KeyPhase.Idle;
            _keys.Feed(key, pressed, _simTimeMs);
            if (key == GKey.KnockItOff && casevacNewPress)
                _casevacAbortRequested = true;
            return;
        }
        // Once ownship is physically destroyed, input cannot be allowed to reanimate controls or
        // systems. Restart remains available through the early branch above.
        if (_playerTerminalState != AircraftTerminalState.Flying) return;
        if (pressed && IsF14WingSweepAction(key) && !PlayerIsTopGunF14) return;
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
        // AUTO is a selector edge, not an axis hold. Latch it here so a phone's deliberate
        // pointer-down/up pulse cannot fall entirely between 120 Hz simulation ticks.
        if (key == GKey.WingSweepAuto && newPress) {
            _playerF14WingSweepMode = F14WingSweepMode.Auto;
            _playerF14WingSweepAutoLatch = true;
        }
        if (key == GKey.KnockItOff && newPress)
            TryRequestReturnToBase(MissionRtbReason.PilotKnockItOff);
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
        if (key == GKey.HookToggle && newPress) {
            if (_configurationAutomationEnabled) _manualHookConfiguration = true;
            _systems.CommandHook(_systems.HookDown
                ? TailhookHandle.Up : TailhookHandle.Down);
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
        if (_casevacFlight is not null) {
            _keys.FeedDirect(
                increase
                    ? GKey.ThrottleUp
                    : GKey.ThrottleDown,
                pressed,
                _simTimeMs);
            return;
        }
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
        if (_casevacFlight is not null) {
            _casevacAnalogRight =
                Lifecycle == LifecycleState.Active
                    ? Math.Clamp(value, -1.0, 1.0)
                    : 0.0;
            return;
        }
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

    /// <summary>Set the latest continuous longitudinal-stick command from a direct-input host.</summary>
    public void SetAnalogPitchControl(double value) {
        if (!double.IsFinite(value))
            throw new ArgumentOutOfRangeException(nameof(value));
        if (_casevacFlight is not null) {
            // Standard gamepad Y is positive when the pilot pulls back. CASEVAC's driving-style
            // longitudinal axis is positive forward, matching the default Push/ArrowUp binding,
            // so invert the physical pitch convention at this mission boundary.
            _casevacAnalogForward =
                Lifecycle == LifecycleState.Active
                    ? Math.Clamp(-value, -1.0, 1.0)
                    : 0.0;
            return;
        }
        if (Lifecycle != LifecycleState.Active
            || _playerTerminalState != AircraftTerminalState.Flying
            || _pilotControlInterlocked) {
            _detents.ClearAnalogPitchControl();
            return;
        }
        if (Math.Abs(value) > 0.02) {
            DisengageTimeCompression(TimeCompressionInhibitReason.ControlInput);
            ClaimRapierControl();
        }
        _detents.SetAnalogPitchControl(value);
    }

    /// <summary>Set the latest continuous yaw (rudder) command from a direct-input host.</summary>
    public void SetAnalogYawControl(double value) {
        if (!double.IsFinite(value))
            throw new ArgumentOutOfRangeException(nameof(value));
        if (Lifecycle != LifecycleState.Active
            || _playerTerminalState != AircraftTerminalState.Flying
            || _pilotControlInterlocked) {
            _detents.ClearAnalogYawControl();
            return;
        }
        if (Math.Abs(value) > 0.02) {
            DisengageTimeCompression(TimeCompressionInhibitReason.ControlInput);
            ClaimRapierControl();
        }
        _detents.SetAnalogYawControl(value);
    }

    /// <summary>
    /// Set the throttle LEVER POSITION (0..1 of the aircraft's own range) from a direct-input
    /// host. Absolute, not a rate: a thumb stick already has a position, and making the pilot
    /// integrate toward one is what turns flying into tapping.
    /// </summary>
    public void SetAnalogThrottleControl(double lever01) {
        if (!double.IsFinite(lever01))
            throw new ArgumentOutOfRangeException(nameof(lever01));
        if (Lifecycle != LifecycleState.Active
            || _playerTerminalState != AircraftTerminalState.Flying
            || _pilotControlInterlocked) {
            _detents.ClearAnalogThrottleControl();
            return;
        }
        DisengageTimeCompression(TimeCompressionInhibitReason.ControlInput);
        ClaimRapierControl();
        _detents.SetAnalogThrottleControl(lever01);
    }

    /// <summary>
    /// Select which concurrent opponent owns the player's lead solution. This changes sighting
    /// only: the physical gun, heat, cadence, magazine, and every round in flight remain one
    /// continuous weapon. Slot zero is the primary; slots one onward mirror Wingmen order.
    /// </summary>
    public bool SetPlayerGunTargetSlot(int slot) {
        if (slot < 0 || !OpponentPresent) return false;

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

    static bool IsPlayerSystemsAction(GKey key) => key is
        GKey.GearToggle or GKey.FlapUp or GKey.FlapDown or GKey.HookToggle
        or GKey.EmergencyGearRelease or GKey.GearHornCutout
        or GKey.ConfirmGearExtensionFailure or GKey.InspectGearDownlocks;

    static bool IsPilotActuatedAction(GKey key) => key is
        GKey.PullUp or GKey.PushDown or GKey.RollLeft or GKey.RollRight
        or GKey.RudderLeft or GKey.RudderRight
        or GKey.ThrottleUp or GKey.ThrottleDown or GKey.Trigger
        or GKey.Override or GKey.AutoGcasOverride or GKey.KnockItOff
        or GKey.WingSweepForward or GKey.WingSweepAft or GKey.WingSweepAuto
        || IsPlayerSystemsAction(key);

    bool KeyActive(GKey key) =>
        _keys.PhaseAt(key, _simTimeMs) != KeyPhase.Idle;

    bool PilotPitchInputActive() =>
        KeyActive(GKey.PullUp) || KeyActive(GKey.PushDown);

    CasevacFlightControlIntent CaptureCasevacFlightIntent() {
        static double Axis(bool positive, bool negative) =>
            positive == negative
                ? 0.0
                : positive ? 1.0 : -1.0;
        double forward = Math.Clamp(
            Axis(
                KeyActive(GKey.PushDown),
                KeyActive(GKey.PullUp))
            + _casevacAnalogForward,
            -1.0,
            1.0);
        double right = Math.Clamp(
            Axis(
                KeyActive(GKey.RollRight),
                KeyActive(GKey.RollLeft))
            + _casevacAnalogRight,
            -1.0,
            1.0);
        double vertical = Axis(
            KeyActive(GKey.ThrottleUp),
            KeyActive(GKey.ThrottleDown));
        double yaw = Axis(
            KeyActive(GKey.RudderRight),
            KeyActive(GKey.RudderLeft));
        return new CasevacFlightControlIntent(
            forward,
            right,
            vertical,
            yaw,
            _casevacAbortRequested
                ? CasevacSemanticCommand.RequestAbort
                : CasevacSemanticCommand.None);
    }

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
            || KeyActive(GKey.WingSweepForward)
            || KeyActive(GKey.WingSweepAft)
            || KeyActive(GKey.WingSweepAuto)
            || KeyActive(GKey.GearToggle)
            || KeyActive(GKey.FlapUp)
            || KeyActive(GKey.FlapDown)
            || KeyActive(GKey.EmergencyGearRelease)
            || _triggerDown
            || _assistedFlight
            || _playerGunTargetPadlockRollAssistSelected
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

    double SecondsUntilContactThreat(in AircraftState contact) {
        AircraftState player = _player.State;
        Vec3D separation = contact.Position - player.Position;
        double rangeM = separation.Length;
        if (!double.IsFinite(rangeM) || rangeM < 1e-6) return 0.0;
        if (rangeM <= TimeCompressionPolicy.ThreatRangeM) return 0.0;
        Vec3D relativeVelocity = contact.VelocityVector() - player.VelocityVector();
        double closingMps = -separation.Dot(relativeVelocity) / rangeM;
        if (!double.IsFinite(closingMps)) return 0.0;
        if (closingMps <= 0.0) return double.PositiveInfinity;
        return (rangeM - TimeCompressionPolicy.ThreatRangeM) / closingMps;
    }

    int ContactApproachFactorCap() {
        double seconds = double.PositiveInfinity;
        if (_opponentTerminalState == AircraftTerminalState.Flying
            && _bandit is not null)
            seconds = SecondsUntilContactThreat(_bandit.State);
        foreach (Wingman wingman in _wingmen) {
            if (wingman.StillFighting)
                seconds = Math.Min(seconds,
                    SecondsUntilContactThreat(wingman.Bandit.State));
        }
        return TimeCompressionPolicy.FactorCapForLeadSeconds(seconds);
    }

    double SecondsUntilFuelThreshold() {
        if (!_fuel.ConsumesFuel) return double.PositiveInfinity;
        if (_fuel.IsJoker || _fuel.IsBingo
            || _fuel.IsMinimumFuel || _fuel.IsEmergencyFuel)
            return 0.0;
        double burnLbPerSecond = Math.Max(0.0, _fuel.BurnLbPerMinute) / 60.0;
        if (burnLbPerSecond <= 1e-9) return double.PositiveInfinity;
        double fuelLb = _fuel.FuelLb;
        return Math.Min(
            Math.Min(
                SecondsToFuelThreshold(fuelLb, burnLbPerSecond,
                    _fuel.JokerThresholdLb),
                SecondsToFuelThreshold(fuelLb, burnLbPerSecond,
                    _fuel.BingoThresholdLb)),
            Math.Min(
                SecondsToFuelThreshold(fuelLb, burnLbPerSecond,
                    _fuel.MinimumFuelThresholdLb),
                SecondsToFuelThreshold(fuelLb, burnLbPerSecond,
                    _fuel.EmergencyFuelThresholdLb)));
    }

    static double SecondsToFuelThreshold(double fuelLb,
        double burnLbPerSecond, double? threshold) =>
        threshold is { } value
            ? Math.Max(0.0, (fuelLb - value) / burnLbPerSecond)
            : double.PositiveInfinity;

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

    TimeCompressionSafetyState CaptureTimeCompressionSafety() {
        int contactFactorCap = ContactApproachFactorCap();
        int fuelFactorCap = TimeCompressionPolicy.FactorCapForLeadSeconds(
            SecondsUntilFuelThreshold());
        int autoGcasFactorCap = TimeCompressionPolicy.FactorCapForLeadSeconds(
            SecondsUntilAutoGcasBoundary());
        int ramFactorCap = TimeCompressionPolicy.FactorCapForRamMachMargin(
            RamTransitionMachMargin(), RamTransitionBandWidthMach());
        int approachFactorCap = Math.Min(
            Math.Min(contactFactorCap, fuelFactorCap),
            Math.Min(autoGcasFactorCap, ramFactorCap));
        bool opponentGunActivity = OpponentPresent
            && (_gunKill.GunSolution
                || _gunKill.InstantaneousGunSolution
                || _opponentGun.GunSolution
                || _opponentGun.InstantaneousGunSolution
                || _gunKill.RoundsInFlight.Count > 0
                || _opponentGun.RoundsInFlight.Count > 0);
        bool opponentDamage = OpponentPresent
            && (_gunKill.TotalHitCount > 0
                || _bandit.CatastrophicallyDamaged
                || _opponentTerminalState != AircraftTerminalState.Flying);
        return new TimeCompressionSafetyState(
            PilotEnabled: _timeCompressionPilotEnabled,
            SupportedSortie: TimeCompressionAvailable,
            SessionActive: Lifecycle == LifecycleState.Active
                && (!TerminalPhaseActive || RapierReturnTransit),
            EstablishedTransit: IsEstablishedTransit(),
            CatapultOrConfigurationTransition: _catapult.IsActive
                || ConfigurationTransitionActive,
            ContactInsideLedThreatRange: contactFactorCap == 1,
            GunSolutionInEitherDirection: opponentGunActivity
                || _retiredOpponentGuns.Any(static retired =>
                    retired.Gun.RoundsInFlight.Count > 0)
                || _wingmen.Any(static wingman =>
                    wingman.Gun.GunSolution
                    || wingman.Gun.InstantaneousGunSolution
                    || wingman.Gun.RoundsInFlight.Count > 0),
            AutoGcasActivityOrLead: autoGcasFactorCap == 1,
            DamagePresent: PlayerHitsTaken > 0
                || _playerTerminalState != AircraftTerminalState.Flying
                || _rapierComputerFailureActive != RapierComputerFailure.None
                || (!RapierReturnTransit && opponentDamage),
            FuelThresholdOrLead: fuelFactorCap == 1,
            ControlInputBeyondTrim: HasControlInputBeyondTrim(),
            RamTransitionLead: ramFactorCap == 1,
            ApproachFactorCap: approachFactorCap);
    }

    void UpdateTimeCompressionDecision() {
        if (_beat is null || _player is null
            || _fuel is null || _keys is null || _detents is null) {
            _timeCompressionSafetyFactorCap = 1;
            _timeCompressionFactor = 1;
            _timeCompressionInhibitReason =
                TimeCompressionInhibitReason.SessionInactive;
            return;
        }
        TimeCompressionSafetyState safety = CaptureTimeCompressionSafety();
        _timeCompressionSafetyFactorCap = Math.Clamp(
            safety.ApproachFactorCap, 1, TimeCompressionPolicy.PreferredFactor);
        _timeCompressionInhibitReason =
            TimeCompressionPolicy.Evaluate(safety);
        _timeCompressionFactor = TimeCompressionPolicy.SelectFactor(
            safety,
            Math.Min(_timeCompressionHostMaximumFactor,
                TimeCompressionRequestedFactor));
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
        _keys.Feed(GKey.WingSweepForward, false, _simTimeMs);
        _keys.Feed(GKey.WingSweepAft, false, _simTimeMs);
        _keys.Feed(GKey.WingSweepAuto, false, _simTimeMs);
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

    /// The throttle a sortie should open on. Beats that stage a deliberate fighting speed opt into
    /// arriving trimmed for it; everything else keeps its authored setting.
    double StagedThrottle() {
        bool airborneTopGunCarrier = _carrier is not null
            && TopGunFightRuntime.IsTopGunMission(_beat.MissionIdentity.Id);
        if (!_beat.StageAtTrimThrottle
            || (_carrier is not null && !airborneTopGunCarrier))
            return _beat.InitialThrottle;
        double trim = DetentLayer.LevelFlightTrimThrottle(
            _player.State, _beat.PlayerAir, _player.AirspeedMps,
            PlayerAerodynamicConfiguration, _player.AtmosphereModel);
        return double.IsFinite(trim) && trim > 0.0 ? trim : _beat.InitialThrottle;
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
}
