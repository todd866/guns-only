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

// Partial of SimulationSession: PilotAssists.
public sealed partial class SimulationSession {
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
    public PadlockRollAssistState PlayerGunTargetPadlockRollAssist =>
        _padlockRollAssist.State;
    // Compatibility surface for older in-process callers. New hosts should use the target-neutral
    // property above; the telemetry field names remain stable.
    public PadlockRollAssistState BanditPadlockRollAssist =>
        PlayerGunTargetPadlockRollAssist;
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

    /// <summary>
    /// Select the player's authoritative gun target for the low-authority padlock lift-plane hold.
    /// The browser supplies only this discrete semantic transition; target identity, geometry, and
    /// actuator demand remain owned by the deterministic 120 Hz simulation. Capturing the physical
    /// gun-target ID prevents a slot promotion or replacement from inheriting another aircraft's
    /// assist latch.
    /// </summary>
    public void SetPlayerGunTargetPadlockRollAssist(bool selected) {
        if (!OpponentPresent) {
            _playerGunTargetPadlockRollAssistSelected = false;
            _playerGunTargetPadlockRollAssistTargetId = 0;
            _padlockRollAssist.Reset();
            return;
        }
        if (!selected) {
            _playerGunTargetPadlockRollAssistSelected = false;
            _playerGunTargetPadlockRollAssistTargetId = 0;
            _padlockRollAssist.Reset();
            return;
        }
        EnsureSelectedPlayerGunTarget();
        if (!SelectedOpponentAlive) {
            _playerGunTargetPadlockRollAssistSelected = false;
            _playerGunTargetPadlockRollAssistTargetId = 0;
            _padlockRollAssist.Reset();
            return;
        }
        DisengageTimeCompression(TimeCompressionInhibitReason.ControlInput);
        if (!_playerGunTargetPadlockRollAssistSelected
            || _playerGunTargetPadlockRollAssistTargetId != _selectedPlayerGunTargetId) {
            _playerGunTargetPadlockRollAssistTargetId = _selectedPlayerGunTargetId;
            _padlockRollAssist.Reset();
        }
        _playerGunTargetPadlockRollAssistSelected = true;
    }

    public void SetBanditPadlockRollAssist(bool selected) =>
        SetPlayerGunTargetPadlockRollAssist(selected);

    double SecondsUntilAutoGcasBoundary() {
        if (_autoGcasState.Active || _autoGcasState.Warning) return 0.0;
        AutoGcasPrediction prediction = _autoGcasState.Prediction;
        if (!prediction.Valid) return double.PositiveInfinity;
        return Math.Min(
            prediction.TimeAvailableToAvoidGroundImpactSeconds,
            prediction.PilotViolationTimeSeconds);
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
            || PilotPitchInputActive();
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
                || PilotPitchInputActive());
        var result = AutoGcasController.Step(_autoGcasPredictionElapsedSeconds, _autoGcasState,
            new AutoGcasInput(
                Aircraft: _player.State,
                AircraftParameters: _beat.PlayerAir,
                EffectivePilotCommand: effectivePilotCommand,
                Terrain: _terrainSurface,
                FallbackSurfaceElevationM: null,
                Enabled: _autoGcasEnabled
                    && _rapierComputerFailureActive == RapierComputerFailure.None,
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
    public void SetTouchControlModality(bool touch) => _touchControlModality = touch;
    public void SetAutoGcasEnabled(bool enabled) => _autoGcasEnabled = enabled;

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
    public bool AutoGcasLowLevelStandby => _gcasLowLevelStandby;

    void UpdateGcasLowLevelStandby() {
        PilotCommand human = _detents.Command;
        bool handsOn = human.EnvelopeOverride
            || System.Math.Abs(human.RollControl) > 0.02
            || System.Math.Abs(human.Rudder) > 0.02
            || PilotPitchInputActive();
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

    /// <summary>
    /// The one place that decides whether the human owns the lateral axis right now. Both roll-axis
    /// assists read it; neither re-derives "the pilot is flying a reversal" from geometry.
    /// </summary>
    public PilotLateralCommitmentState PlayerLateralCommitment =>
        _pilotLateralCommitmentState;

    void UpdatePilotLateralCommitment(double rawPilotRollControl) =>
        _pilotLateralCommitmentState = _pilotLateralCommitment.Step(
            rawPilotRollControl, FixedDeltaSeconds);

    /// <summary>
    /// Authored gun-assist law for this beat. The F-22 ramp fades gain and correction by rung.
    /// Every other aircraft keeps the parameters on its airframe, plus the touch widening that
    /// origin/main applied whenever the pilot is on tilt controls.
    /// </summary>
    internal AircraftParams GunneryPitchAssistAir() {
        if (!UsesDifficultyRamp(_beat)) {
            if (_touchControlModality && !CardTwelveRequiresPilotGunTrigger)
                return WidenGunneryAssistForTouch(_beat.PlayerAir);
            return _beat.PlayerAir;
        }

        FightDirector.PitchAssistScale assistScale =
            _sortiePitchAssist ?? _fightDirector.PitchAssist;
        int assistRung = _sortiePitchAssistRung ?? _fightDirector.Rung;
        AircraftParams assistAir = _beat.PlayerAir with {
            GunneryPitchAssistGainPerSecond =
                _beat.PlayerAir.GunneryPitchAssistGainPerSecond * assistScale.GainScale,
            GunneryPitchAssistMaxCorrectionG =
                _beat.PlayerAir.GunneryPitchAssistMaxCorrectionG * assistScale.CorrectionScale,
        };
        if (!assistScale.Active) {
            return assistAir with {
                GunneryPitchAssistGainPerSecond = 0.0,
                GunneryPitchAssistMaxCorrectionG = 0.0,
            };
        }
        if (_touchControlModality
            && !CardTwelveRequiresPilotGunTrigger
            && assistRung <= 1)
            return WidenGunneryAssistForTouch(assistAir);
        return assistAir;
    }

    static AircraftParams WidenGunneryAssistForTouch(AircraftParams air) => air with {
        GunneryPitchAssistCaptureAngleRad = air.GunneryPitchAssistCaptureAngleRad * 1.35,
        GunneryPitchAssistMaxCorrectionG = air.GunneryPitchAssistMaxCorrectionG + 1.0,
        GunneryLateralAssistRollGain = air.GunneryLateralAssistRollGain * 1.25,
    };

    PilotCommand ApplyGunneryPitchAssist(in PilotCommand requestedPilotCommand) {
        AircraftState selectedTarget = SelectedOpponentState;
        bool enabled = !CardTwelveRequiresPilotGunTrigger
            && PlayerWeaponsAuthorized
            && _beat.CombatRules.PlayerGunEnabled
            && _playerTerminalState == AircraftTerminalState.Flying
            && SelectedOpponentAlive
            && !_detents.ApproachMode
            && !_detents.HighAlphaRecoveryActive
            && !_pilotControlInterlocked;
        // Selection is not ownership. The old gate disabled gunnery roll whenever padlock was
        // selected, including the long periods where its capture-only controller was inactive.
        // Build 331 owner flight: padlock selected but inactive while gunnery roll was suppressed,
        // 310 rounds / 12 hits. Yield only while padlock is actually contributing on this target.
        bool padlockOwnsRollPlane = _padlockRollAssist.State.Active
            && _playerGunTargetPadlockRollAssistTargetId == _selectedPlayerGunTargetId;
        // A wider capture cone and one extra protected G on touch: tilt input cannot hold the
        // funnel the way arrow keys can. Ballistics stay untouched — the assist magnetises the
        // nose, the rounds still have to fly there. The rung scale is the F-22 ramp only.
        // Every other beat keeps the authored law, including the touch widening from origin/main.
        AircraftParams assistAir = GunneryPitchAssistAir();
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
            closureMps: _closureKts / 1.94384,
            leadRate: _gunneryLeadRate,
            lateralCommitment: _pilotLateralCommitmentState,
            deltaSeconds: FixedDeltaSeconds,
            pilotUnloadIntent: _detents.PilotUnloadIntent,
            pilotMaximumPullIntent: _detents.PilotMaximumPullIntent);
        _gunneryPitchAssistState = result.State;
        return result.Command;
    }

    PilotCommand ApplyPlayerGunTargetPadlockRollAssist(
        in PilotCommand effectiveCommand,
        double rawPilotRollControl) {
        if (!OpponentPresent) {
            _playerGunTargetPadlockRollAssistSelected = false;
            _playerGunTargetPadlockRollAssistTargetId = 0;
            _padlockRollAssist.Reset();
            return effectiveCommand;
        }
        bool targetCurrent = _playerGunTargetPadlockRollAssistSelected
            && _playerGunTargetPadlockRollAssistTargetId == _selectedPlayerGunTargetId;
        AircraftState selectedTarget = SelectedOpponentState;
        bool eligible = targetCurrent
            && _playerTerminalState == AircraftTerminalState.Flying
            && SelectedOpponentAlive
            && !_detents.ApproachMode
            && !_detents.HighAlphaRecoveryActive
            && !_detents.PilotMaximumPullIntent
            && !_detents.PilotUnloadIntent
            && _detents.Command.GDemand
                >= GunsOnly.Sim.GunneryPitchAssist.PilotUnloadOverrideThresholdG
            && !_pilotControlInterlocked
            && !effectiveCommand.EnvelopeOverride
            && !double.IsFinite(effectiveCommand.CommandedAlphaRad)
            && !_autoGcasState.Warning
            && !_autoGcasState.Active;
        double radarAltitudeM = _player.State.Position.Y;
        if (_terrainSurface is not null && _terrainSurface.TrySample(
            _player.State.Position.X, _player.State.Position.Z, out TerrainSample terrain))
            radarAltitudeM -= terrain.HeightM;
        // The CAS→TAS inversion behind corner speed has no finite solution in near-vacuum
        // (static pressure → 0 demands Mach beyond AirData's physical band and it throws) —
        // seen from a 250 kft sortie and from tumbling terminal wrecks. Above the solvable
        // band the honest answer is "no corner truth"; PadlockPreferredPlane.Select already
        // fail-closes to its any-plane fallback on a non-finite corner.
        double cornerSpeedMps = _player.State.Position.Y <= CornerSpeedSolvableCeilingM
            ? BeatSetup.CornerTrueAirspeedMps(_beat.PlayerAir, _player.State.Position.Y)
            : double.NaN;
        var energy = new PadlockRollAssistEnergy(
            TrueAirspeedMps: _player.AirspeedMps,
            CornerSpeedMps: cornerSpeedMps,
            RadarAltitudeM: radarAltitudeM,
            GcasWarningOrActive: _autoGcasState.Warning || _autoGcasState.Active);
        PadlockRollAssistResult result = _padlockRollAssist.Step(
            effectiveCommand,
            _player.State,
            selectedTarget.Position,
            _playerGunTargetPadlockRollAssistTargetId,
            selected: _playerGunTargetPadlockRollAssistSelected,
            eligible,
            rawPilotRollControl,
            FixedDeltaSeconds,
            energy,
            // The gun's physical reach. Past this a round cannot arrive, so there is no shot for
            // the plane trim to fine-tune and it must not take the ailerons — see the capture gate
            // in PadlockRollAssist for the measured 20.7%-of-flight / 88%-out-of-range evidence.
            captureRangeLimitM: _beat.CombatRules.PlayerGunProfile.MuzzleVelocityMps
                * _beat.CombatRules.PlayerGunProfile.MaximumFlightSeconds,
            lateralCommitment: _pilotLateralCommitmentState);
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
}
