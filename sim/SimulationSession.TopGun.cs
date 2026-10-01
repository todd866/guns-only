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

// Partial of SimulationSession: TopGun.
public sealed partial class SimulationSession {
    public int Aim9Remaining => _firstRunValleyRuntime?.Aim9Remaining
        ?? _topGunFightRuntime?.Aim9Remaining ?? 0;
    /// Stable first-run interlock truth for presentation and reconnects. The generic visual-merge
    /// evaluation owns a different first-pass rule, so renderers must not infer this valley gate
    /// from WeaponsInhibited or from a short-lived transition cue.
    public bool FirstRunWeaponsCold => _firstRunValleyRuntime?.WeaponsCold ?? false;
    public bool Aim9InFlight => _firstRunValleyRuntime?.Aim9InFlight
        ?? _topGunFightRuntime?.Aim9InFlight ?? false;
    public Missiles.Aim9FlightState Aim9SeekerState =>
        _firstRunValleyRuntime?.Aim9Live.State
        ?? _topGunFightRuntime?.Aim9Live.State
        ?? Missiles.Aim9FlightState.Safe;
    public Missiles.Aim9Telemetry Aim9Telemetry =>
        _firstRunValleyRuntime?.Aim9Live
        ?? _topGunFightRuntime?.Aim9Live
        ?? default;
    /// <summary>The exact sweep schedule applied to the current aerodynamic step/Ready pose.</summary>
    public double? PlayerF14WingSweepDegrees => _playerF14WingSweepDegrees;
    /// <summary>The exact opponent sweep schedule applied across neutral/reactive handoff.</summary>
    public double? OpponentF14WingSweepDegrees => _opponentF14WingSweepDegrees;
    public double? PlayerF14WingSweepCommandDegrees =>
        _playerF14WingSweepCommandDegrees;
    public F14WingSweepMode PlayerF14WingSweepMode => _playerF14WingSweepMode;
    public bool PlayerF14OverLimit => _topGunFightRuntime?.F14OverLimit ?? false;
    public double PlayerF14OverLimitSeconds =>
        _topGunFightRuntime?.F14OverLimitSeconds ?? 0.0;
    public double PlayerF14StructuralFatigue01 =>
        _topGunFightRuntime?.F14StructuralFatigue01 ?? 0.0;
    public bool PlayerF14StructuralFailed =>
        _topGunFightRuntime?.F14StructuralFailed ?? false;

    public bool LaunchFoxTwo() {
        if (Lifecycle != LifecycleState.Active
            || _playerTerminalState != AircraftTerminalState.Flying
            || _opponentTerminalState != AircraftTerminalState.Flying
            || !PlayerWeaponsAuthorized)
            return false;

        var shooter = new Missiles.Aim9Pose(
            _player.State.Position,
            _player.State.VelocityVector());
        AircraftState selected = SelectedOpponentState;
        var target = new Missiles.Aim9Pose(
            selected.Position,
            selected.VelocityVector());

        if (_firstRunValleyRuntime is { } firstRun) {
            if (!firstRun.TryLaunchFoxTwo(shooter, target, _simTimeMs))
                return false;
            _topGunAim9TargetSequence = _banditSpawnSequence;
            ShowTransition(
                $"FOX TWO · {firstRun.Aim9Remaining} REMAIN",
                1800.0);
            return true;
        }

        if (_topGunFightRuntime is null)
            return false;
        if (!_topGunFightRuntime.TryLaunchFoxTwo(shooter, target, _simTimeMs))
            return false;

        _topGunAim9TargetSequence = _banditSpawnSequence;
        ShowTransition(
            $"FOX TWO · {_topGunFightRuntime.Aim9Remaining} REMAIN",
            1800.0);
        return true;
    }

    static bool IsF14WingSweepAction(GKey key) => key is
        GKey.WingSweepForward or GKey.WingSweepAft or GKey.WingSweepAuto;

    bool PlayerIsTopGunF14 => _topGunFightRuntime is not null
        && _beat.PlayerAircraft.Id == AircraftCapability.F14ASurrogate.Id;

    void ObserveFirstRunValleyPopOut() {
        if (_firstRunValleyRuntime is null
            || _playerTerminalState != AircraftTerminalState.Flying)
            return;
        if (!_firstRunValleyRuntime.ObservePlayer(_player.State)) return;
        if (double.IsNaN(_weaponsHotAtSeconds))
            _weaponsHotAtSeconds = TimeSeconds;
        if (_firstRunValleyRuntime.ConsumePopOutAnnouncement())
            ShowTransition("WEAPONS HOT · FOX TWO", 2200.0);
    }

    void StepFirstRunValleyRuntime() {
        if (_firstRunValleyRuntime is null || !OpponentPresent) return;
        var target = new Missiles.Aim9Pose(
            SelectedOpponentState.Position,
            SelectedOpponentState.VelocityVector());
        _firstRunValleyRuntime.Step(FixedDeltaSeconds, target);
        if (!_firstRunValleyRuntime.ConsumeDetonation()) return;

        bool hitLiveTarget = _topGunAim9TargetSequence == _banditSpawnSequence
            && _opponentTerminalState == AircraftTerminalState.Flying
            && _gunKill.ApplyExternalDestruction(_primaryOpponentGunTargetId);
        _topGunAim9TargetSequence = 0;
        if (!hitLiveTarget) {
            ShowTransition("FOX TWO · NO LIVE TARGET", 1800.0);
            return;
        }
        EmitEvent(SessionEventType.Hit,
            CombatRole.Player, CombatRole.Opponent, count: 1,
            entitySequence: _banditSpawnSequence,
            kinematics: _bandit.State);
        ShowTransition("MISSILE HIT · SPLASH", 2200.0);
        ObserveCombatDamage();
    }

    void StepTopGunFightRuntime() {
        ApplyTopGunF14WingSweepAuthority();
        if (_topGunFightRuntime is null) return;

        var target = new Missiles.Aim9Pose(
            _bandit.State.Position,
            _bandit.State.VelocityVector());
        _topGunFightRuntime.Step(FixedDeltaSeconds, target);
        if (!_topGunFightRuntime.ConsumeDetonation()) return;

        bool hitLiveTarget = _topGunAim9TargetSequence == _banditSpawnSequence
            && _opponentTerminalState == AircraftTerminalState.Flying
            && _gunKill.ApplyExternalDestruction(_primaryOpponentGunTargetId);
        _topGunAim9TargetSequence = 0;
        if (!hitLiveTarget) {
            ShowTransition("FOX TWO · NO LIVE TARGET", 1800.0);
            return;
        }
        EmitEvent(SessionEventType.Hit,
            CombatRole.Player, CombatRole.Opponent, count: 1,
            entitySequence: _banditSpawnSequence,
            kinematics: _bandit.State);
        ShowTransition("MISSILE HIT · SPLASH", 2200.0);
        // Finalize the standard damage ledger at the physical detonation boundary. Deferring
        // this to StepCore would let a lethally struck opponent run one ordinary AI/weapons step
        // and would project HIT from the pre-step pose but DESTROYED from the post-step pose.
        ObserveCombatDamage();
    }

    internal void SeedActiveAim9ForProximityHitForTest() {
        if (_topGunFightRuntime is null || !Aim9InFlight)
            throw new InvalidOperationException("a Top Gun AIM-9 must be in flight");
        _topGunFightRuntime.SeedActiveMissileForProximityHit(new Missiles.Aim9Pose(
            _bandit.State.Position,
            _bandit.State.VelocityVector()));
    }

    static double F14WingSweepDegrees(in AircraftState state,
        IAtmosphereModel atmosphere, GunsOnly.Sim.Turbulence.IWindField? wind) {
        Vec3D airVelocity = state.VelocityVector()
            - (wind?.Sample(state.Position) ?? Vec3D.Zero);
        double trueAirspeedMps = airVelocity.Length;
        double mach = AirData.MachNumber(trueAirspeedMps, state.Position.Y, atmosphere);
        double casKts = AirData.IndicatedAirspeedMps(
            trueAirspeedMps, state.Position.Y, atmosphere) * AirData.MpsToKnots;
        return F14WingSweep.DegreesFor(mach, casKts);
    }

    void ApplyTopGunF14WingSweepAuthority() {
        bool topGun = _topGunFightRuntime is not null;
        if (topGun
            && _playerTerminalState == AircraftTerminalState.Flying
            && _beat.PlayerAircraft.Id == AircraftCapability.F14ASurrogate.Id) {
            double automaticSweep = F14WingSweepDegrees(
                _player.State, _player.AtmosphereModel, _player.Wind);
            if (_playerF14WingSweepMode == F14WingSweepMode.None)
                _playerF14WingSweepMode = F14WingSweepMode.Auto;

            bool selectAuto = KeyActive(GKey.WingSweepAuto);
            bool forward = KeyActive(GKey.WingSweepForward);
            bool aft = KeyActive(GKey.WingSweepAft);
            if (selectAuto || _playerF14WingSweepAutoLatch) {
                _playerF14WingSweepMode = F14WingSweepMode.Auto;
                // AUTO wins a chord already in progress. Require the manual sweep controls to
                // return neutral before another FWD/AFT press may select MANUAL again.
                if (!selectAuto && !forward && !aft)
                    _playerF14WingSweepAutoLatch = false;
            } else if (forward != aft) {
                if (_playerF14WingSweepMode != F14WingSweepMode.Manual) {
                    _playerF14WingSweepCommandDegrees =
                        _playerF14WingSweepDegrees ?? automaticSweep;
                }
                _playerF14WingSweepMode = F14WingSweepMode.Manual;
                double direction = aft ? 1.0 : -1.0;
                _playerF14WingSweepCommandDegrees = Math.Clamp(
                    (_playerF14WingSweepCommandDegrees ?? automaticSweep)
                        + direction * F14WingSweep.ManualRateDegPerSecond
                            * FixedDeltaSeconds,
                    F14WingSweep.MinSweepDeg,
                    F14WingSweep.MaxSweepDeg);
            }

            double sweep = _playerF14WingSweepMode == F14WingSweepMode.Manual
                ? Math.Clamp(_playerF14WingSweepCommandDegrees ?? automaticSweep,
                    F14WingSweep.MinSweepDeg, F14WingSweep.MaxSweepDeg)
                : automaticSweep;
            _playerF14WingSweepCommandDegrees = sweep;
            _playerF14WingSweepDegrees = sweep;
            _player.SetEffectiveWingSpanM(
                TopGunFightRuntime.EffectiveTomcatWingSpanMForSweep(
                    sweep, _beat.PlayerAir.WingSpanM));
        } else {
            _playerF14WingSweepDegrees = null;
            _playerF14WingSweepCommandDegrees = null;
            _playerF14WingSweepMode = F14WingSweepMode.None;
            _playerF14WingSweepAutoLatch = false;
            _player?.ResetFlightParams();
        }

        if (topGun
            && OpponentPresent
            && _opponentTerminalState == AircraftTerminalState.Flying
            && _beat.BanditAircraft.Id == AircraftCapability.F14ASurrogate.Id) {
            double sweep = F14WingSweepDegrees(
                _bandit.State, _bandit.Atmosphere, _bandit.Wind);
            _opponentF14WingSweepDegrees = sweep;
            _bandit.SetEffectiveWingSpanM(
                TopGunFightRuntime.EffectiveTomcatWingSpanMForSweep(
                    sweep, _beat.BanditAir.WingSpanM));
        } else {
            _opponentF14WingSweepDegrees = null;
            _bandit?.ResetFlightParams();
        }
    }

    void ObserveTopGunF14StructuralLoad() {
        if (!PlayerIsTopGunF14
            || _playerTerminalState != AircraftTerminalState.Flying
            || _topGunFightRuntime is null)
            return;
        if (!_topGunFightRuntime.ObserveF14Load(_player.LastNz, FixedDeltaSeconds))
            return;

        ShowTransition(
            $"AIRFRAME OVER-G · {_player.LastNz:F1} G · STRUCTURAL FAILURE",
            8000.0);
        BeginCatastrophicDamage(CombatRole.Player, CombatRole.None);
    }

    /// The Ready card already sells valley → heaters → guns → RTB. Once the mouth pair is down
    /// the first sortie is over; waiting for the pilot to discover O is how it became a gym.
    /// Top Gun uses the same latch after its last billed engagement.
    void MaybeRequestFirstRunRecovery() {
        if (CombatHandoffRequested
            || _playerTerminalState != AircraftTerminalState.Flying
            || LiveOpponentCount > 0)
            return;
        if (_beat.FirstRunValley is null && !ReplacementBudgetExhausted)
            return;
        // The kill that fills the cap is a combat result. Requesting RTB first
        // quarantines it as a handoff, and the rung never sees the second gun kill.
        CompleteEngagementIfEnded();
        TryRequestReturnToBase(MissionRtbReason.PilotKnockItOff);
    }
}
