namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// Unit-explicit fixed-gun capability selected by mission content. These profiles describe the
/// ballistic contract the deterministic projectile solver consumes; they do not imply radar,
/// computed lead, or any other sensor capability.
/// </summary>
public sealed record GunProfile(
    string Id,
    double MuzzleVelocityMps,
    double RoundsPerSecond,
    double MaximumFlightSeconds,
    double EffectiveHitRadiusM,
    bool PublicDataSurrogate = false,
    string PublicSourceUrl = "",
    double TailChaseEffectiveHitRadiusM = 0.0);

public static class GunProfiles {
    public static GunProfile SixM3FiftyCal { get; } = new(
        "gun.six-m3-50cal.v1",
        GunKill.MuzzleVelocityMps,
        GunKill.RoundsPerSecond,
        GunKill.MaxFlightSeconds,
        GunKill.DefaultHitRadiusM,
        TailChaseEffectiveHitRadiusM: GunKill.TailChaseHitRadiusM);

    // The USAF identifies the F-22 installation as an internal 20 mm M61A2 with 480 rounds.
    // Rate and velocity are intentionally rounded public-data surrogates: this thin slice makes
    // no claim about dispersion, ammunition lot, harmonisation, or the aircraft's fire-control
    // computation. https://www.holloman.af.mil/News/Photos/igphoto/2000165167/
    public static GunProfile M61A2PublicDataSurrogate { get; } = new(
        "gun.m61a2.public-data-surrogate.v1",
        MuzzleVelocityMps: 1030.0,
        RoundsPerSecond: 100.0,
        MaximumFlightSeconds: 2.0,
        EffectiveHitRadiusM: 7.0,
        PublicDataSurrogate: true,
        PublicSourceUrl:
            "https://www.holloman.af.mil/News/Photos/igphoto/2000165167/",
        TailChaseEffectiveHitRadiusM: GunKill.TailChaseHitRadiusM);

    // The Ukrainian state export catalogue is the public anchor for the Su-27 family and its
    // installed 30 mm gun. Ballistic values are deliberately rounded surrogates; no classified or
    // proprietary fire-control/dispersion model is asserted.
    // https://www.ukrspecexport.com/uploads/files/Categories/pdf_1/a205b8.pdf
    public static GunProfile GSh301PublicDataSurrogate { get; } = new(
        "gun.gsh301.public-data-surrogate.v1",
        MuzzleVelocityMps: 860.0,
        RoundsPerSecond: 25.0,
        MaximumFlightSeconds: 2.0,
        EffectiveHitRadiusM: 8.0,
        PublicDataSurrogate: true,
        PublicSourceUrl:
            "https://www.ukrspecexport.com/uploads/files/Categories/pdf_1/a205b8.pdf",
        TailChaseEffectiveHitRadiusM: GunKill.TailChaseHitRadiusM);
}
