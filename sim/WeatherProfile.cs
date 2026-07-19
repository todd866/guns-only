using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim;

/// <summary>
/// Immutable scenario weather bundle. Beat/scenario setup can later select one profile and pass
/// its atmosphere and wind through their existing interfaces without teaching the flight model
/// about sounding storage, interpolation, or turbulence composition.
/// </summary>
public sealed class WeatherProfile {
    public IAtmosphereModel Atmosphere { get; }
    public IWindField Wind { get; }
    public ICloudField Clouds { get; }
    public ITerrainSurface? Terrain { get; }

    public WeatherProfile(IAtmosphereModel atmosphere, IWindField wind)
        : this(atmosphere, wind, ClearCloudField.Instance) { }

    public WeatherProfile(IAtmosphereModel atmosphere, IWindField wind,
        ICloudField clouds, ITerrainSurface? terrain = null) {
        Atmosphere = atmosphere ?? throw new ArgumentNullException(nameof(atmosphere));
        Wind = wind ?? throw new ArgumentNullException(nameof(wind));
        Clouds = clouds ?? throw new ArgumentNullException(nameof(clouds));
        Terrain = terrain;
    }
}
