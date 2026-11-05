using System.Linq;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Recovery;
using GunsOnly.Sim.Training;

namespace GunsOnly.Sim;

public sealed partial class SimulationSession {
    public const double RtbCompressionThreatRangeM = 10_000.0;
    public const double RtbCompressionFinalRangeM = 3.0 * 1852.0;
    // Input design deadband, not an airframe constant.
    public const double RtbCompressionControlDeadband = 0.08;
    bool _rtbAutopilotActive;
    RecoverySteering _rtbSteering = new();
    public bool RtbAutopilotActive => _rtbAutopilotActive;

    PilotCommand RtbAutomationOr(in PilotCommand pilotCommand) {
        if (!_rtbAutopilotActive) return pilotCommand;
        _rtbSteering.Drive(this, configureForLanding: false);
        return _rtbSteering.Command;
    }

    // Only pilot intent counts. Filtered detent commands, flight-path hold and AP's
    // own bank/G demands must never be mistaken for a fresh control input.
    static readonly GKey[] RtbPilotKeys = Enum.GetValues<GKey>()
        .Where(IsPilotActuatedAction).ToArray();

    bool RtbPilotInputActive() =>
        _detents.HasAnalogPitchOrRollInput(RtbCompressionControlDeadband)
        || _detents.ScriptedPilotOverride is not null
        || RtbPilotKeys.Any(KeyActive);
    bool _sortieEndedEarly;

    // Mission identity also supports custom seeded lab fixtures based on beat 7. Do not enable
    // outbound compression or silently change the Rapier/carrier/first-run contracts.
    bool SupportsF22RtbCompression => _beat.MissionIdentity.Id
        == "mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1"
        && _beat.Practice == PracticeExercise.None
        && _conventionalRunwayRecovery is not null;

    public bool SortieEndedEarly => _sortieEndedEarly;
    public bool CanEndSortie => SupportsF22RtbCompression && (FiniteCombatComplete || EscalatingWavesEnabled)
        && Lifecycle is LifecycleState.Active or LifecycleState.Paused
        && _playerTerminalState == AircraftTerminalState.Flying;

    /// <summary>Bank completed combat and open debrief without claiming physical recovery.</summary>
    public bool TryEndSortie() {
        if (!CanEndSortie) return false;
        _sortieEndedEarly = true;
        _pendingOutcome = _outcome = FiniteCombatComplete ? SortieOutcome.Victory : SortieOutcome.Discontinued;
        ClearHeldInput();
        _accumulatorSeconds = _timeCompressionAccumulatorSeconds = 0.0;
        Lifecycle = LifecycleState.Finished;
        UpdateTimeCompressionDecision();
        EmitEvent(SessionEventType.SortieFinished, CombatRole.None, CombatRole.None,
            outcome: _outcome);
        return true;
    }

    bool RtbContactThreat(in AircraftState contact) =>
        (contact.Position - _player.State.Position).Length <= RtbCompressionThreatRangeM;

    bool F22RtbOnFinal() {
        Vec3D offset = _player.State.Position - _conventionalRunwayRecovery!.Runway.Threshold;
        return Math.Sqrt(offset.X * offset.X + offset.Z * offset.Z) <= RtbCompressionFinalRangeM
            || _approachGuidance.InGroove
            || _approachGuidance.ActivePatternLeg is ApproachPatternLeg.Final or ApproachPatternLeg.Threshold
            || ConventionalRunwayPhase != RunwayRecoveryPhase.Airborne;
    }

    bool F22RtbEstablished() {
        // AP can acquire the recovery route from a turn; alignment is its job.
        return (PlayerRtbActive || (!EscalatingWavesEnabled && FiniteCombatComplete))
            && _approachGuidance.Valid && _approachGuidance.GuidanceActive
            && _approachGuidance.Gates.Count > 0;
    }

    TimeCompressionSafetyState CaptureF22RtbCompressionSafety(bool engaging = false) {
        bool threat = (_opponentTerminalState == AircraftTerminalState.Flying
                && _bandit is not null && RtbContactThreat(_bandit.State))
            || _wingmen.Any(w => w.StillFighting && RtbContactThreat(w.Bandit.State))
            || _detachedOpponentWrecks.Any(w => w.TerminalState == AircraftTerminalState.Flying
                && !w.Actor.CatastrophicallyDamaged && RtbContactThreat(w.Actor.State));
        // Rounds outlive their shooter. Do not gate this check on OpponentPresent/Flying.
        bool rounds = _opponentGun.RoundsInFlight.Count > 0
            || _gunKill.RoundsInFlight.Count > 0
            || _wingmen.Any(w => w.Gun.RoundsInFlight.Count > 0)
            || _retiredOpponentGuns.Any(r => r.Gun.RoundsInFlight.Count > 0)
            || _reliefFighter?.Gun?.RoundsInFlight.Count > 0;
        return new TimeCompressionSafetyState(
            PilotEnabled: _timeCompressionPilotEnabled,
            SupportedSortie: true,
            SessionActive: Lifecycle == LifecycleState.Active,
            EstablishedTransit: F22RtbEstablished(),
            CatapultOrConfigurationTransition: _systems.GearHandle != LandingGearHandle.Up
                || !_systems.AllGearUpAndLocked
                || _systems.FlapLever != WingFlapLever.Hold,
            ContactInsideLedThreatRange: threat,
            GunSolutionInEitherDirection: rounds
                || (_opponentTerminalState == AircraftTerminalState.Flying
                    && (_opponentGun.GunSolution || _opponentGun.InstantaneousGunSolution))
                || _wingmen.Any(w => w.StillFighting
                    && (w.Gun.GunSolution || w.Gun.InstantaneousGunSolution)),
            AutoGcasActivityOrLead: SecondsUntilAutoGcasBoundary() <= TimeCompressionPolicy.BoundaryLeadSeconds,
            DamagePresent: _playerTerminalState != AircraftTerminalState.Flying,
            FuelThresholdOrLead: false,
            ControlInputBeyondTrim: !engaging && RtbPilotInputActive(),
            RamTransitionLead: false,
            ApproachFactorCap: F22RtbOnFinal() ? 1 : TimeCompressionPolicy.PreferredFactor,
            RecoveryFinal: F22RtbOnFinal());
    }
}
