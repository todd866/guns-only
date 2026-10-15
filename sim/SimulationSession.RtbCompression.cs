using System.Linq;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Recovery;
using GunsOnly.Sim.Training;

namespace GunsOnly.Sim;

public sealed partial class SimulationSession {
    public const double RtbCompressionThreatRangeM = 10_000.0;
    public const double RtbCompressionFinalRangeM = 3.0 * 1852.0;
    public const double RtbCompressionControlDeadband = 0.02;
    long _rtbControlInputUntilTick = -1;
    bool _sortieEndedEarly;

    // Mission identity also supports custom seeded lab fixtures based on beat 7. Do not enable
    // outbound compression or silently change the Rapier/carrier/first-run contracts.
    bool SupportsF22RtbCompression => _beat.MissionIdentity.Id
        == "mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1"
        && _beat.Practice == PracticeExercise.None
        && _conventionalRunwayRecovery is not null;

    public bool SortieEndedEarly => _sortieEndedEarly;
    public bool CanEndSortie => SupportsF22RtbCompression && FiniteCombatComplete
        && Lifecycle is LifecycleState.Active or LifecycleState.Paused
        && _playerTerminalState == AircraftTerminalState.Flying;

    /// <summary>Bank completed combat and open debrief without claiming physical recovery.</summary>
    public bool TryEndSortie() {
        if (!CanEndSortie) return false;
        _sortieEndedEarly = true;
        _pendingOutcome = _outcome = SortieOutcome.Victory;
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
        // There is no F-22 route autopilot. Use the published recovery cue, never synthesize
        // flight controls or snap kinematics for fast time. Recheck alignment every fixed tick.
        if (!(PlayerRtbActive || FiniteCombatComplete)
            || !_approachGuidance.Valid || !_approachGuidance.GuidanceActive
            || _approachGuidance.Gates.Count == 0) return false;
        AircraftState state = _player.State;
        WorldApproachGate cue = _approachGuidance.Gates[0];
        double bearing = Math.Atan2(cue.EastM - state.Position.X, cue.NorthM - state.Position.Z);
        double error = Math.IEEERemainder(bearing - state.Chi, 2.0 * Math.PI);
        const double deg = Math.PI / 180.0;
        return Math.Abs(error) <= 5.0 * deg
            && Math.Abs(state.Bank) <= 5.0 * deg;
    }

    TimeCompressionSafetyState CaptureF22RtbCompressionSafety() {
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
            ControlInputBeyondTrim: _tick <= _rtbControlInputUntilTick
                || _detents.HasAnalogPitchOrRollInput(RtbCompressionControlDeadband)
                || _detents.ScriptedPilotOverride is not null
                || HasControlInputBeyondTrim(ignoreCombatAssists: true),
            RamTransitionLead: false,
            ApproachFactorCap: F22RtbOnFinal() ? 1 : TimeCompressionPolicy.PreferredFactor,
            RecoveryFinal: F22RtbOnFinal());
    }
}
