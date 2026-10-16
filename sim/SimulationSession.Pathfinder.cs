using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim;

public sealed partial class SimulationSession {
    public PathfinderMission? Pathfinder { get; private set; }
    int _pathfinderDroneTargetId;
    public bool PathfinderDroneSelected { get; private set; }

    public bool SelectPathfinderWeapon(bool drone) {
        if (Pathfinder is null || Lifecycle != LifecycleState.Active || !PlayerAlive || _pilotControlInterlocked) return false;
        _triggerDown = false;
        PathfinderDroneSelected = drone;
        return true;
    }

    /// Deliberate release, using the same inherited-energy gun-drone actor as the Rapier.
    /// One active drone at a time; it never commits the legacy formation wipe or RTB handoff.
    public bool TryReleasePathfinderDrone() {
        if (Pathfinder is not { } mission || Lifecycle != LifecycleState.Active || !PlayerAlive
            || !PlayerWeaponsAuthorized || _pilotControlInterlocked || _catapult.IsActive || _rapierDogfightingDronesRemaining <= 0
            || !mission.SelectedBalloon.RelayActive || mission.SelectedBalloon.Escaped
            || _rapierGunDrone is { StillActive: true }) return false;
        _rapierGunDrone = RapierGunDrone.SpawnFrom(_player.State, _player.AtmosphereModel);
        _rapierGunDrone.Sim.Wind = _player.Wind;
        _pathfinderDroneTargetId = mission.SelectedBalloonId;
        _rapierGunDroneSpawnSequence++;
        _rapierDogfightingDronesRemaining--;
        mission.RecordDroneRelease();
        RefreshPlayerMass();
        return true;
    }

    void StepPathfinder() {
        if (Pathfinder is not { } mission) return;
        bool fire = Lifecycle == LifecycleState.Active && PlayerAlive && !_catapult.IsActive
            && PlayerWeaponsAuthorized && !PathfinderDroneSelected && _triggerDown;
        mission.Step(_player.State, fire, FixedDeltaSeconds);
        if (_rapierGunDrone is { StillActive: true } drone) {
            var target = mission.Balloons.Single(b => b.Id == _pathfinderDroneTargetId);
            bool live = target.RelayActive && !target.Escaped;
            drone.StepRelay(FixedDeltaSeconds, target.GondolaState, live,
                RapierGunDrone.PickupPoint(_carrier?.Position ?? Vec3D.Zero));
            double range = (target.GondolaPosition - drone.Sim.State.Position).Length;
            var lead = GunKill.EvaluateBallisticLead(drone.Sim.State, target.GondolaState,
                drone.Gun.Profile, 1.4);
            bool droneFire = live && drone.Phase == RapierGunDronePhase.Commit && range < 1200
                && drone.Sim.BodyForward.Dot(lead.LeadDirection) > Math.Cos(.025);
            mission.StepDroneGun(drone, target.Id, droneFire, FixedDeltaSeconds);
        }
        _sortiePlayerRoundsFired = mission.Gun.RoundsFired;
        _sortiePlayerHits = mission.Gun.TotalHitCount;
        _killCount = mission.RelaySectorsDenied;
        if (mission.Complete && Lifecycle == LifecycleState.Active) {
            _outcome = !PlayerAlive ? SortieOutcome.Defeat
                : mission.ContractEarned ? SortieOutcome.Victory : SortieOutcome.Draw;
            _pendingOutcome = _outcome;
            EmitEvent(SessionEventType.SortieFinished, CombatRole.None, CombatRole.None, outcome: _outcome);
            ClearHeldInput();
            Lifecycle = LifecycleState.Finished;
            _accumulatorSeconds = 0;
        }
    }

    /// Sim-side settlement seam for the later debrief. One quota Boolean enters the existing
    /// operations model; fuel, recovery, ammunition and inspection retain their normal prices.
    public RapierEconomicSortieSlip? PathfinderEconomy {
        get {
            if (Pathfinder is not { } mission) return null;
            var serviceLife = _rapierServiceLifeRecorder.LatestRecord;
            return mission.EvaluateEconomy(new RapierEconomicSortieFacts(
                _beat.MissionIdentity.EconomicMode, Lifecycle == LifecycleState.Finished,
                RapierJobKind.Balloon, mission.ContractEarned,
                _arrestment.Phase == ArrestmentModel.ArrestmentPhase.Stopped,
                _playerTerminalState != AircraftTerminalState.Flying,
                Math.Max(0, _beat.FuelLoadout.InitialFuelLb - _fuel.FuelLb),
                mission.Gun.RoundsFired,
                serviceLife?.ExceedanceReviewRequired == true,
                serviceLife?.EvidenceStatus ?? RapierServiceLifeEvidenceStatus.Partial));
        }
    }
}
