using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// Deterministic fictional training range for the quarantined Top Gun preview. This is not a
/// reconstruction of Miramar or any real range. It deliberately reuses the shipped Ukraine atlas
/// and scenery profile as a public-data terrain surrogate: the browser has one matching visual and
/// physics product for that ID, so the preview cannot announce an unrenderable terrain identity or
/// inherit whichever translated surface happened to be staged before it.
/// </summary>
public static class TopGunEnvironment {
    public const string TheatreId = "theatre.top-gun.socal-training-fiction.v1";
    public const string WorldFrameId = "world.top-gun.socal-training-fiction.v1";
    public const string WeatherId = "weather.top-gun.socal-clear-afternoon-fiction.v1";

    public static MissionEnvironmentContract Contract { get; } = new(
        TheatreId,
        "location.top-gun.socal-training-range-fiction.v1",
        WorldFrameId,
        Ukraine2030sTheatre.TerrainProfileId,
        Ukraine2030sTheatre.MacroSceneryProfile,
        Ukraine2030sTheatre.MicroSceneryProfile,
        MissionEnvironmentFrameKind.LocalRegionalCorridor,
        PreferredTerrainStreamingRadiusM: 48_000.0);

    public static WeatherProfile Weather { get; } = new(
        StandardAtmosphere1976.Instance,
        new LayeredWindField([
            new WindVectorLevel(-1_000.0, new Vec3D(3.0, 0.0, -1.0)),
            new WindVectorLevel(4_000.0, new Vec3D(7.0, 0.0, 1.5)),
            new WindVectorLevel(12_000.0, new Vec3D(12.0, 0.0, 4.0)),
            new WindVectorLevel(32_000.0, new Vec3D(18.0, 0.0, 7.0)),
        ]),
        new ClearCloudField(visibilityM: 120_000.0),
        terrain: null,
        id: WeatherId);
}
