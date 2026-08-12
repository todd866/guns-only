using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Cobra;

public enum CobraAirframeState
{
    Ready,
    PlayerFlying,
    Crippled,
    Destroyed
}

/// <summary>
/// One airframe on Camp Ember's ramp. The pool is the resource (owner doctrine: "a FOB
/// with a few Cobras on the ramp — if you're damaged bad enough you just swap birds").
/// A slot's parked pose is where the airframe currently rests: the authored revetment for
/// a Ready spare, or wherever the player left it once Crippled/Destroyed.
/// </summary>
public sealed record CobraAirframeSlot(
    string Id,
    CobraAirframeState State,
    Vec3D ParkedPositionWorldM,
    double ParkedYawRad);

public static class CobraAirframePool
{
    /// <summary>
    /// Revetment stations for the two spares, world metres: 30 m north and south of the
    /// Camp Ember anchor — on the flat 58 m contact apron, at least 15 m clear of the
    /// spawn pad, and outside the eastbound departure lane the presentation safety volume
    /// protects. Both face the departure heading.
    /// </summary>
    public const double SpareStationOffsetNorthM = 30.0;
    public const double SpareStationYawRad = Math.PI / 2.0;
}
