namespace GunsOnly.Sim.Cobra;

/// <summary>
/// Ember Run story spine for Hold the Bridge. Guidance/UX only — win/lose still comes from
/// <see cref="GroundWar.HoldTheBridgeOutcome"/>.
/// </summary>
public enum CobraMissionAct
{
    Depart,
    Ingress,
    Engage,
    Hold,
    Rtb,
    Complete
}

/// <summary>One soft guidance volume in world east/up/north metres.</summary>
public readonly record struct CobraPathGate(
    double EastM,
    double UpM,
    double NorthM,
    double RadiusM,
    bool Active);
