namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// A friendly combat actor which assumes an interrupted fight without entering the enemy
/// formation collection. The controller remains an ordinary deterministic <see cref="IBandit"/>
/// because that contract is role-neutral in physics terms: it accepts an observed target and
/// returns aircraft controls. Session authority owns allegiance, weapons, pooled damage and
/// attribution.
/// </summary>
public sealed class ReliefFighter {
    internal ReliefFighter(IBandit actor, long spawnSequence) {
        Actor = actor ?? throw new ArgumentNullException(nameof(actor));
        if (spawnSequence <= 0)
            throw new ArgumentOutOfRangeException(nameof(spawnSequence));
        SpawnSequence = spawnSequence;
    }

    public IBandit Actor { get; }
    public long SpawnSequence { get; }
    public AircraftState State => Actor.State;
    public GunKill? Gun { get; internal set; }
    public int HitsTaken { get; internal set; }
    public bool TriggerDown { get; internal set; }
    public AircraftTerminalState TerminalState { get; internal set; } =
        AircraftTerminalState.Flying;
    public ImpactSurface ImpactSurface { get; internal set; } = ImpactSurface.None;
    public bool StillFighting => TerminalState == AircraftTerminalState.Flying
        && !Actor.CatastrophicallyDamaged;

    internal void ApplyCatastrophicDamage(int handedness) {
        if (TerminalState != AircraftTerminalState.Flying) return;
        TriggerDown = false;
        TerminalState = AircraftTerminalState.DestroyedAirborne;
        Actor.ApplyCatastrophicDamage(handedness);
    }
}
