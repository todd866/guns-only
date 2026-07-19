namespace GunsOnly.Sim;

/// <summary>One local thermodynamic state, with units explicit at the API boundary.</summary>
public readonly record struct AtmosphericState(
    double GeometricAltitudeM,
    double GeopotentialAltitudeM,
    double TemperatureK,
    double PressurePa,
    double DensityKgM3,
    double SpeedOfSoundMps);

/// <summary>
/// Scenario-selectable atmosphere seam. The standard implementation is immutable; later weather
/// soundings can use the same contract without making temperature or pressure global mutable state.
/// </summary>
public interface IAtmosphereModel {
    AtmosphericState Sample(double geometricAltitudeM);
}

/// <summary>Immutable U.S. Standard Atmosphere 1976 provider.</summary>
public sealed class StandardAtmosphere1976 : IAtmosphereModel {
    public static StandardAtmosphere1976 Instance { get; } = new();
    StandardAtmosphere1976() { }
    public AtmosphericState Sample(double geometricAltitudeM) =>
        Atmosphere.StateAt(geometricAltitudeM);
}

/// <summary>
/// U.S. Standard Atmosphere 1976 through the 84.852-km geopotential boundary. Simulation position
/// is geometric altitude, so it is converted before the piecewise hydrostatic solution is applied.
/// This matters increasingly with height and avoids treating the old 11-km geopotential
/// tropopause as exactly 11 km of geometric altitude.
/// </summary>
public static class Atmosphere {
    public const double SeaLevelTemperatureK = 288.15;
    public const double SeaLevelPressurePa = 101325.0;
    public const double SeaLevelDensityKgM3 = 1.2250;
    public const double SeaLevelSpeedOfSoundMps = 340.294;
    public const double SpecificGasConstantDryAir = 287.05287;
    public const double RatioOfSpecificHeats = 1.4;
    public const double StandardGravityMps2 = 9.80665;
    public const double EarthGeopotentialRadiusM = 6_356_766.0;
    public const double MaximumGeopotentialAltitudeM = 84_852.0;

    // NASA/TM-2005-213659 Appendix A / U.S. Standard Atmosphere 1976 layer bases.
    static readonly double[] BaseGeopotentialAltitudeM =
        [0.0, 11_000.0, 20_000.0, 32_000.0, 47_000.0, 51_000.0, 71_000.0, 84_852.0];
    static readonly double[] BaseTemperatureK =
        [288.15, 216.65, 216.65, 228.65, 270.65, 270.65, 214.65, 186.946];
    static readonly double[] BasePressurePa =
        [101325.0, 22632.06, 5474.889, 868.0187, 110.9063, 66.93887, 3.956420, 0.373384];
    static readonly double[] LapseRateKPerM =
        [-0.0065, 0.0, 0.0010, 0.0028, 0.0, -0.0028, -0.0020];

    public static IAtmosphereModel StandardModel => StandardAtmosphere1976.Instance;

    public static double GeopotentialAltitude(double geometricAltitudeM) {
        ValidateAltitude(geometricAltitudeM);
        return EarthGeopotentialRadiusM * geometricAltitudeM
            / (EarthGeopotentialRadiusM + geometricAltitudeM);
    }

    public static double GeometricAltitude(double geopotentialAltitudeM) {
        if (!double.IsFinite(geopotentialAltitudeM)
            || geopotentialAltitudeM >= EarthGeopotentialRadiusM)
            throw new ArgumentOutOfRangeException(nameof(geopotentialAltitudeM));
        return EarthGeopotentialRadiusM * geopotentialAltitudeM
            / (EarthGeopotentialRadiusM - geopotentialAltitudeM);
    }

    public static AtmosphericState StateAt(double geometricAltitudeM) {
        double h = GeopotentialAltitude(geometricAltitudeM);
        if (h > MaximumGeopotentialAltitudeM)
            throw new ArgumentOutOfRangeException(nameof(geometricAltitudeM),
                "standard-atmosphere model ends at 84.852 km geopotential altitude");

        int layer = LayerFor(h);
        double h0 = BaseGeopotentialAltitudeM[layer];
        double t0 = BaseTemperatureK[layer];
        double p0 = BasePressurePa[layer];
        double lapse = LapseRateKPerM[Math.Min(layer, LapseRateKPerM.Length - 1)];
        double dh = h - h0;
        double temperature = t0 + lapse * dh;
        double pressure = Math.Abs(lapse) < 1e-15
            ? p0 * Math.Exp(-StandardGravityMps2 * dh
                / (SpecificGasConstantDryAir * t0))
            : p0 * Math.Pow(t0 / temperature,
                StandardGravityMps2 / (SpecificGasConstantDryAir * lapse));
        double density = pressure / (SpecificGasConstantDryAir * temperature);
        double speedOfSound = Math.Sqrt(RatioOfSpecificHeats
            * SpecificGasConstantDryAir * temperature);

        return new AtmosphericState(geometricAltitudeM, h, temperature, pressure,
            density, speedOfSound);
    }

    public static double Temperature(double geometricAltitudeM) =>
        StateAt(geometricAltitudeM).TemperatureK;
    public static double Pressure(double geometricAltitudeM) =>
        StateAt(geometricAltitudeM).PressurePa;
    public static double Density(double geometricAltitudeM) =>
        StateAt(geometricAltitudeM).DensityKgM3;
    public static double SpeedOfSound(double geometricAltitudeM) =>
        StateAt(geometricAltitudeM).SpeedOfSoundMps;

    static int LayerFor(double geopotentialAltitudeM) {
        if (geopotentialAltitudeM < 0.0) return 0;
        for (int i = 0; i < BaseGeopotentialAltitudeM.Length - 1; i++)
            if (geopotentialAltitudeM < BaseGeopotentialAltitudeM[i + 1]) return i;
        return BaseGeopotentialAltitudeM.Length - 1;
    }

    static void ValidateAltitude(double geometricAltitudeM) {
        // Below-sea-level operation is useful for terrain scenarios. The first standard lapse
        // layer extrapolates cleanly; the lower bound prevents a singular Earth-radius transform.
        if (!double.IsFinite(geometricAltitudeM)
            || geometricAltitudeM <= -0.99 * EarthGeopotentialRadiusM)
            throw new ArgumentOutOfRangeException(nameof(geometricAltitudeM));
    }
}
