namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// Monotonic lifecycle for the player-requested end of a continuous dogfight. Values are
/// append-only because snapshots and replays persist the numeric phase. A request first transfers
/// enemy attention to the relief aircraft; the drain phase then waits for the player's already
/// airborne rounds before the relief gun inherits the final target-damage ledger.
/// </summary>
public enum CombatHandoffPhase : byte {
    Unavailable = 0,
    Available = 1,
    Requested = 2,
    Drain = 3,
    ReliefEngaged = 4,
    PlayerRtb = 5,
    ReliefComplete = 6,
    ReliefLost = 7,
    Recovered = 8,
}
