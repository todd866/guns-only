using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim;

public sealed partial class SimulationSession {
    public PathfinderMission? Pathfinder { get; private set; }

    void StepPathfinder() {
        if (Pathfinder is not { } mission) return;
        bool fire = Lifecycle == LifecycleState.Active && PlayerAlive && !_catapult.IsActive
            && PlayerWeaponsAuthorized && _triggerDown;
        mission.Step(_player.State, fire, FixedDeltaSeconds);
        _sortiePlayerRoundsFired = mission.Gun.RoundsFired;
        _sortiePlayerHits = mission.Gun.TotalHitCount;
        _killCount = mission.RelaySectorsDenied;
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
