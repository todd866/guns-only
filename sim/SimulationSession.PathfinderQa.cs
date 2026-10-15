namespace GunsOnly.Sim;

public sealed partial class SimulationSession {
    bool _pathfinderQaGunWindowArmed;
    public bool PathfinderQaGunWindowReached { get; private set; }

    /// Opt-in screenshot seam. The browser only arms this for a localhost QA URL.
    /// Restaging clears it; resuming after capture does not re-arm it.
    public void ConfigurePathfinderQaGunWindow(bool enabled) {
        _pathfinderQaGunWindowArmed = enabled && Pathfinder is not null;
        PathfinderQaGunWindowReached = false;
    }

    void ObservePathfinderQaGunWindow() {
        if (!_pathfinderQaGunWindowArmed || Lifecycle != LifecycleState.Active
            || Pathfinder is not { } mission) return;
        var first = mission.Balloons[0];
        if (!first.RelayActive
            || (first.GondolaPosition - _player.State.Position).Length > 1500.0) return;
        _pathfinderQaGunWindowArmed = false;
        PathfinderQaGunWindowReached = true;
        // Evaluated after both actor and aircraft integration, once per production
        // tick. Advance/StepFixed stop their batch at this exact crossing tick.
        SetPaused(true);
    }
}
