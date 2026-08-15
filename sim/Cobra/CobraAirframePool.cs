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
    /// Revetment stations for the two spares on the medium FOB apron. They sit outside the
    /// central FATO/safety area, with enough rotor-disc separation for independent servicing.
    /// </summary>
    /// <summary>Minimum rest distance between a wreck and the spare's station, metres.</summary>
    public const double WreckClearanceFromStationM = 14.0;
    public const double SpareStationOffsetNorthM = 65.0;
    public const double SpareStationOffsetEastM = 20.0;
    public const double SpareStationYawRad = CampEmberOperations.FinalHeadingRad;
}
