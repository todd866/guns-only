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

// Partial of SimulationSession: Telemetry.
public sealed partial class SimulationSession {
    /// <summary>
    /// Tactical owner and last command for the aircraft selected by the player's gun sight. This
    /// intentionally follows slot retargeting, so a hardware tape cannot attribute a wingman's
    /// motion to the primary opponent. Rail-only actors return null; a NeutralMergeBandit still
    /// exposes its applied merge command, with no tactic until its reactive handoff begins.
    /// </summary>
    public OpponentPilotTelemetry? SelectedOpponentPilotTelemetry {
        get {
            if (!OpponentPresent) return null;

            IBandit selected = _bandit;
            foreach (Wingman wingman in _wingmen) {
                if (wingman.PlayerGunTargetId != _selectedPlayerGunTargetId) continue;
                selected = wingman.Bandit;
                break;
            }
            if (selected is not IBanditDecisionTraceSource trace) return null;

            BanditTactic? tactic = selected is NeutralMergeBandit {
                FirstPassComplete: false
            } merge
                ? merge.Presenting ? BanditTactic.Present : null
                : trace.PolicyMemory.Tactic;
            return new OpponentPilotTelemetry(tactic, trace.AppliedCommand);
        }
    }
    public IReadOnlyList<SessionEvent> RecentEvents => _recentEvents;
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

    void EmitEvent(SessionEventType type, CombatRole source, CombatRole target,
        int count = 0, SortieOutcome outcome = SortieOutcome.None,
        ImpactSurface surface = ImpactSurface.None,
        AutoGcasState? autoGcas = null,
        long entitySequence = 0,
        AircraftState? kinematics = null) {
        if (_recentEvents.Count == RecentEventCapacity) _recentEvents.RemoveAt(0);
        AircraftState? eventKinematics = kinematics ?? target switch {
            CombatRole.Player => _player.State,
            CombatRole.Opponent when OpponentPresent => _bandit.State,
            _ => null
        };
        long eventEntitySequence = entitySequence > 0 ? entitySequence : target switch {
            CombatRole.Player => _playerSpawnSequence,
            CombatRole.Opponent when OpponentPresent => _banditSpawnSequence,
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

    static long PolicyContactIdentity(
        long spawnSequence,
        PolicyContactClass contactClass) {
        if (spawnSequence <= 0) return 0;
        // Four disjoint lanes leave room for another friendly target class without renumbering
        // persisted decision traces. Every source counter is monotonic, so identity survives
        // kinematic coincidence but changes on replacement or player-to-relief handoff.
        return spawnSequence * 4L + (long)contactClass;
    }

    /// Bank this tick's gunnery increments and the load-factor envelope. Called every stepped tick
    /// on every sortie shape, including the ones that stage no opponent.
    void AccumulateSortieLedgers() {
        if (_playerTerminalState == AircraftTerminalState.Flying) {
            double loadFactor = _player.LastNz;
            if (double.IsFinite(loadFactor)) {
                if (!_sortieLoadFactorSeen) {
                    _sortieLoadFactorSeen = true;
                    _sortiePeakLoadFactorG = loadFactor;
                    _sortieMinimumLoadFactorG = loadFactor;
                } else {
                    if (loadFactor > _sortiePeakLoadFactorG)
                        _sortiePeakLoadFactorG = loadFactor;
                    if (loadFactor < _sortieMinimumLoadFactorG)
                        _sortieMinimumLoadFactorG = loadFactor;
                }
            }
        }
        if (!OpponentPresent) return;
        if (_gunKill is not null) {
            (int rounds, int hits) = BankGun(_gunKill);
            _sortiePlayerRoundsFired += rounds;
            _sortiePlayerHits += hits;
        }
        if (_opponentGun is not null)
            _sortieOpponentRoundsFired += BankGun(_opponentGun).Rounds;
        foreach (Wingman wingman in _wingmen)
            _sortieOpponentRoundsFired += BankGun(wingman.Gun).Rounds;
        foreach (RetiredOpponentGun retired in _retiredOpponentGuns)
            _sortieOpponentRoundsFired += BankGun(retired.Gun).Rounds;
        foreach (ReliefTargetingOpponentGun relief in
            _reliefTargetingOpponentGuns.Values)
            _sortieOpponentRoundsFired += BankGun(relief.Gun).Rounds;
    }

    (int Rounds, int Hits) BankGun(GunKill gun) {
        if (!_sortieGunLedger.TryGetValue(gun, out GunLedgerBaseline baseline)) {
            // First sight of this gun: bank nothing it was BORN holding, because the weapon it
            // succeeded already banked that. Deliberately the gun's own record of what it
            // inherited rather than its current counters — a gun can fire on the same tick it is
            // staged, and reading the live counters here would silently swallow those rounds.
            baseline = new GunLedgerBaseline {
                Rounds = gun.InheritedRoundsFired,
                Hits = gun.InheritedHitCount
            };
        }
        int rounds = Math.Max(0, gun.RoundsFired - baseline.Rounds);
        int hits = Math.Max(0, gun.TotalHitCount - baseline.Hits);
        if (hits > 0 && ReferenceEquals(gun, _gunKill)
            && _engagementCounters.Active
            && double.IsNaN(_engagementCounters.TimeToFirstHitSeconds)
            && !double.IsNaN(_weaponsHotAtSeconds))
            _engagementCounters.TimeToFirstHitSeconds =
                Math.Max(0.0, TimeSeconds - _weaponsHotAtSeconds);
        _sortieGunLedger[gun] = new GunLedgerBaseline {
            Rounds = gun.RoundsFired,
            Hits = gun.TotalHitCount
        };
        return (rounds, hits);
    }

    void ShowTransition(string cue, double milliseconds = 2200.0) {
        _transitionCue = cue;
        _transitionCueUntilMs = _simTimeMs + milliseconds;
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
}
