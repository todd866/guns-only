using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim.Environment;

/// <summary>
/// Deterministic, scenario-authored Korea weather days. These are playable meteorological
/// designs rather than claims of a reconstructed historical observation: layer geometry,
/// microphysics and hazards remain explicit and reproducible for replay and presentation.
/// </summary>
public static class KoreaWeatherPresets {
    static readonly IAtmosphereModel SummerColumn = new HydrostaticAtmosphereColumn(
    [
        new TemperatureSoundingPoint(-1_000.0, 294.5),
        new TemperatureSoundingPoint(0.0, 288.2),
        new TemperatureSoundingPoint(3_000.0, 268.8),
        new TemperatureSoundingPoint(10_000.0, 223.3),
        new TemperatureSoundingPoint(20_000.0, 216.7),
        new TemperatureSoundingPoint(32_000.0, 228.7)
    ], anchorPressurePa: 101_180.0);

    static readonly WeatherProfile HistoricalInland = new(
        SummerColumn,
        Wind((4.0, 1.0), (8.0, 3.0), (15.0, 7.0)),
        new LayeredCloudField(
        [
            Layer(1_650.0, 3_150.0, 0.42, 3_900.0, 0.017,
                liquid: 0.00038, turbulence: 1.1, verticalAir: 0.35,
                windEast: 8.0, windNorth: 3.0)
        ],
        [
            Cell(6_800.0, 4_200.0, 1_250.0, 4_900.0, 2_900.0, 2_300.0,
                6.5, 2.5, extinction: 0.019, liquid: 0.00062,
                precipitation: 1.2, turbulence: 2.2, verticalAir: 1.4)
        ], seed: 0x1950_0727_4b31_2101UL, clearAirVisibilityM: 95_000.0),
        id: "weather.korea-1950s.inland-cumulus.v1");

    static readonly WeatherProfile HistoricalMaritime = new(
        SummerColumn,
        Wind((6.0, -2.0), (9.0, -1.0), (14.0, 4.0)),
        new LayeredCloudField(
        [
            // Bases remain safely above the qualification pattern: the deck/groove stays VMC,
            // while a recognisable marine layer fills the departure and missed-approach sky.
            Layer(720.0, 1_650.0, 0.52, 4_800.0, 0.014,
                liquid: 0.00031, turbulence: 0.65, windEast: 9.0, windNorth: -1.0)
        ], seed: 0x1950_0727_5ea0_2102UL, clearAirVisibilityM: 78_000.0),
        id: "weather.korea-1950s.maritime-stratocumulus.v1");

    static readonly WeatherProfile ModernHigh = new(
        SummerColumn,
        Wind((3.0, 2.0), (12.0, 6.0), (24.0, 12.0)),
        new LayeredCloudField(
        [
            Layer(3_850.0, 6_250.0, 0.38, 5_900.0, 0.016,
                liquid: 0.00024, ice: 0.00016, turbulence: 1.8,
                verticalAir: 0.55, icing: 0.12, windEast: 17.0, windNorth: 9.0),
            Layer(8_200.0, 10_600.0, 0.22, 8_500.0, 0.006,
                ice: 0.00008, windEast: 25.0, windNorth: 14.0)
        ],
        [
            Cell(7_500.0, -1_800.0, 2_100.0, 7_900.0, 3_400.0, 2_900.0,
                18.0, 9.0, extinction: 0.020, liquid: 0.00055, ice: 0.00018,
                precipitation: 2.4, turbulence: 3.2, verticalAir: 2.2,
                icing: 0.18, lightning: 0.03)
        ], seed: 0x2030_0915_f22a_0007UL, clearAirVisibilityM: 110_000.0),
        id: "weather.korea-2030s.high-broken-cumulus.v1");

    static readonly WeatherProfile ModernDrone = new(
        SummerColumn,
        Wind((5.0, 1.0), (10.0, 4.0), (19.0, 9.0)),
        new LayeredCloudField(
        [
            Layer(1_150.0, 2_850.0, 0.44, 4_500.0, 0.018,
                liquid: 0.00046, precipitation: 0.35, turbulence: 1.5,
                verticalAir: 0.65, icing: 0.03, windEast: 11.0, windNorth: 4.0)
        ],
        [
            Cell(5_600.0, 4_800.0, 850.0, 5_500.0, 2_700.0, 2_200.0,
                12.0, 5.0, extinction: 0.022, liquid: 0.00078,
                precipitation: 5.5, turbulence: 3.8, verticalAir: 2.8,
                icing: 0.05, lightning: 0.08)
        ], seed: 0x2030_0915_d20e_0001UL, clearAirVisibilityM: 88_000.0),
        id: "weather.korea-2030s.drone-front-cumulus.v1");

    static readonly WeatherProfile ModernCirrus = new(
        SummerColumn,
        Wind((2.0, 0.0), (9.0, 4.0), (23.0, 11.0)),
        new LayeredCloudField(
        [
            Layer(7_600.0, 10_900.0, 0.26, 9_200.0, 0.006,
                ice: 0.00010, windEast: 23.0, windNorth: 11.0)
        ], seed: 0x2030_0915_ba11_0004UL, clearAirVisibilityM: 120_000.0),
        id: "weather.korea-2030s.balloon-cirrus.v1");

    public static WeatherProfile ForBeat(int beatIndex) => beatIndex switch {
        4 => ModernCirrus,
        5 or 6 => HistoricalMaritime,
        7 => ModernHigh,
        8 => ModernDrone,
        _ => HistoricalInland
    };

    static IWindField Wind((double east, double north) surface,
        (double east, double north) middle,
        (double east, double north) upper) => new LayeredWindField(
    [
        new WindVectorLevel(-1_000.0, new Vec3D(surface.east, 0.0, surface.north)),
        new WindVectorLevel(4_000.0, new Vec3D(middle.east, 0.0, middle.north)),
        new WindVectorLevel(12_000.0, new Vec3D(upper.east, 0.0, upper.north)),
        new WindVectorLevel(32_000.0, new Vec3D(upper.east * 1.35, 0.0,
            upper.north * 1.35))
    ]);

    static CloudLayerDefinition Layer(double baseM, double topM, double coverage,
        double scaleM, double extinction, double liquid = 0.0, double ice = 0.0,
        double precipitation = 0.0, double turbulence = 0.0,
        double verticalAir = 0.0, double icing = 0.0, double lightning = 0.0,
        double windEast = 0.0, double windNorth = 0.0) => new(
            baseM, topM, coverage, scaleM, extinction,
            liquidWaterKgPerM3AtFullCloud: liquid,
            iceWaterKgPerM3AtFullCloud: ice,
            precipitationMmPerHourAtFullCloud: precipitation,
            turbulenceRmsMpsAtFullCloud: turbulence,
            verticalAirVelocityMpsAtFullCloud: verticalAir,
            icingHazard01AtFullCloud: icing,
            lightningHazard01AtFullCloud: lightning,
            advectionVelocityMps: new Vec3D(windEast, 0.0, windNorth),
            verticalEdgeTransitionM: Math.Min(180.0, 0.25 * (topM - baseM)));

    static ConvectiveCellDefinition Cell(double eastM, double northM,
        double baseM, double topM, double radiusEastM, double radiusNorthM,
        double windEast, double windNorth, double extinction, double liquid = 0.0,
        double ice = 0.0, double precipitation = 0.0, double turbulence = 0.0,
        double verticalAir = 0.0, double icing = 0.0, double lightning = 0.0) => new(
            new Vec3D(eastM, 0.5 * (baseM + topM), northM),
            radiusEastM, radiusNorthM, baseM, topM,
            startTimeSeconds: 0.0, lifetimeSeconds: 900.0,
            advectionVelocityMps: new Vec3D(windEast, 0.0, windNorth),
            peakExtinctionPerMetre: extinction,
            peakLiquidWaterKgPerM3: liquid,
            peakIceWaterKgPerM3: ice,
            peakPrecipitationMmPerHour: precipitation,
            peakTurbulenceRmsMps: turbulence,
            peakVerticalAirVelocityMps: verticalAir,
            peakIcingHazard01: icing,
            peakLightningHazard01: lightning,
            lifecycleTransitionSeconds: 20.0);
}
