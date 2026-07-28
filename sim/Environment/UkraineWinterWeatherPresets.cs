using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim.Environment;

/// <summary>
/// Deterministic fictional winter weather for the 2030s Ukraine theatre. These profiles are
/// authored training environments, not reconstructions or forecasts of real-world operations.
/// Cloud condensate and icing remain independent of the typed precipitation below cloud base.
/// </summary>
public static class UkraineWinterWeatherPresets {
    static readonly IAtmosphereModel SnowSquallAtmosphere =
        new HydrostaticAtmosphereColumn(
        [
            new TemperatureSoundingPoint(-1_000.0, 274.2),
            new TemperatureSoundingPoint(0.0, 268.4),
            new TemperatureSoundingPoint(800.0, 262.4),
            new TemperatureSoundingPoint(2_500.0, 250.5),
            new TemperatureSoundingPoint(6_000.0, 228.0),
            new TemperatureSoundingPoint(10_000.0, 216.8),
            new TemperatureSoundingPoint(20_000.0, 216.6),
            new TemperatureSoundingPoint(32_000.0, 228.5)
        ], anchorPressurePa: 100_450.0);

    static readonly IAtmosphereModel FreezingStratusAtmosphere =
        new HydrostaticAtmosphereColumn(
        [
            new TemperatureSoundingPoint(-1_000.0, 276.6),
            new TemperatureSoundingPoint(0.0, 270.8),
            new TemperatureSoundingPoint(200.0, 269.9),
            // A shallow winter inversion traps sub-freezing moisture in the low stratus.
            new TemperatureSoundingPoint(900.0, 271.0),
            new TemperatureSoundingPoint(2_000.0, 263.5),
            new TemperatureSoundingPoint(6_000.0, 237.0),
            new TemperatureSoundingPoint(10_000.0, 218.5),
            new TemperatureSoundingPoint(20_000.0, 216.6),
            new TemperatureSoundingPoint(32_000.0, 228.5)
        ], anchorPressurePa: 102_100.0);

    /// <summary>
    /// Gusty, visibility-limiting solid precipitation beneath an ice-rich cloud deck. The small
    /// liquid-water and icing values avoid turning every snow encounter into severe airframe ice.
    /// </summary>
    public static WeatherProfile SnowSquall { get; } = new(
        SnowSquallAtmosphere,
        new LayeredWindField(
        [
            WindLevel(-1_000.0, 10.0, 4.0),
            WindLevel(500.0, 16.0, 7.0),
            WindLevel(2_500.0, 24.0, 11.0),
            WindLevel(6_000.0, 31.0, 14.0),
            WindLevel(12_000.0, 42.0, 22.0),
            WindLevel(32_000.0, 50.0, 27.0)
        ],
        new TurbulenceField(
            octaves: 5,
            outerScaleM: 180.0,
            intermittency: 0.62,
            intensityMps: 2.2,
            seed: 0x2030_0117_5a0f_1001UL)),
        new LayeredCloudField(
        [
            new CloudLayerDefinition(
                baseAltitudeM: 480.0,
                topAltitudeM: 2_400.0,
                meanCloudFraction01: 1.0,
                horizontalStructureScaleM: 3_600.0,
                extinctionPerMetreAtFullCloud: 0.012,
                liquidWaterKgPerM3AtFullCloud: 0.00005,
                iceWaterKgPerM3AtFullCloud: 0.00050,
                precipitationMmPerHourAtFullCloud: 4.8,
                turbulenceRmsMpsAtFullCloud: 3.2,
                verticalAirVelocityMpsAtFullCloud: -0.45,
                icingHazard01AtFullCloud: 0.04,
                advectionVelocityMps: new Vec3D(17.0, 0.0, 7.0),
                verticalEdgeTransitionM: 120.0)
        ], seed: 0x2030_0117_5a0f_1002UL, clearAirVisibilityM: 70_000.0),
        id: "weather.ukraine-2030s.winter-snow-squall.v1",
        precipitation: new LayeredPrecipitationField(
        [
            new StratiformPrecipitationDefinition(
                bottomAltitudeM: -100.0,
                topAltitudeM: 2_550.0,
                meanCoverage01: 1.0,
                horizontalStructureScaleM: 2_400.0,
                ratesAtFullIntensity: new HydrometeorRates(
                    snowMmWaterEquivalentPerHour: 4.6,
                    freezingDrizzleMmWaterEquivalentPerHour: 0.05,
                    icePelletsMmWaterEquivalentPerHour: 0.25,
                    graupelMmWaterEquivalentPerHour: 0.20),
                extinctionPerMetreAtFullIntensity: 0.0045,
                advectionVelocityMps: new Vec3D(17.0, 0.0, 7.0),
                verticalEdgeTransitionM: 100.0)
        ], seed: 0x2030_0117_5a0f_1003UL, clearAirVisibilityM: 70_000.0),
        surfaceConditions: new UniformSurfaceConditionField(
            new SurfaceConditionSample(
                surfaceTemperatureK: 267.5,
                snowWaterEquivalentM: 0.0216,
                snowDepthM: 0.12,
                snowDensityKgPerM3: 180.0,
                snowAgeSeconds: 21_600.0,
                snowLiquidWaterFraction01: 0.02,
                snowCrust01: 0.10,
                surfaceWetness01: 0.08,
                standingWaterDepthM: 0.0,
                slushDepthM: 0.0,
                glazeIceThicknessM: 0.0,
                mudDepthM: 0.006,
                frictionCoefficient: 0.32,
                brakingFactor01: 0.48)));

    /// <summary>
    /// Low, nearly uniform supercooled-liquid stratus with typed freezing drizzle below its base.
    /// It is less turbulent than the squall but deliberately represents the greater icing hazard.
    /// </summary>
    public static WeatherProfile FreezingStratus { get; } = new(
        FreezingStratusAtmosphere,
        new LayeredWindField(
        [
            WindLevel(-1_000.0, 3.0, 1.0),
            WindLevel(300.0, 5.0, 2.0),
            WindLevel(1_500.0, 8.0, 3.0),
            WindLevel(6_000.0, 15.0, 7.0),
            WindLevel(12_000.0, 25.0, 13.0),
            WindLevel(32_000.0, 34.0, 18.0)
        ],
        new TurbulenceField(
            octaves: 4,
            outerScaleM: 260.0,
            intermittency: 0.30,
            intensityMps: 0.35,
            seed: 0x2030_0206_f2ee_2001UL)),
        new LayeredCloudField(
        [
            new CloudLayerDefinition(
                baseAltitudeM: 100.0,
                topAltitudeM: 850.0,
                meanCloudFraction01: 1.0,
                horizontalStructureScaleM: 6_500.0,
                extinctionPerMetreAtFullCloud: 0.017,
                liquidWaterKgPerM3AtFullCloud: 0.00072,
                iceWaterKgPerM3AtFullCloud: 0.00002,
                precipitationMmPerHourAtFullCloud: 1.1,
                turbulenceRmsMpsAtFullCloud: 0.45,
                verticalAirVelocityMpsAtFullCloud: -0.05,
                icingHazard01AtFullCloud: 0.92,
                advectionVelocityMps: new Vec3D(5.0, 0.0, 2.0),
                verticalEdgeTransitionM: 60.0)
        ], seed: 0x2030_0206_f2ee_2002UL, clearAirVisibilityM: 18_000.0),
        id: "weather.ukraine-2030s.winter-freezing-stratus.v1",
        precipitation: new LayeredPrecipitationField(
        [
            new StratiformPrecipitationDefinition(
                bottomAltitudeM: -100.0,
                topAltitudeM: 820.0,
                meanCoverage01: 1.0,
                horizontalStructureScaleM: 5_500.0,
                ratesAtFullIntensity: new HydrometeorRates(
                    snowMmWaterEquivalentPerHour: 0.04,
                    freezingDrizzleMmWaterEquivalentPerHour: 0.90,
                    freezingRainMmWaterEquivalentPerHour: 0.12),
                extinctionPerMetreAtFullIntensity: 0.0016,
                advectionVelocityMps: new Vec3D(5.0, 0.0, 2.0),
                verticalEdgeTransitionM: 50.0)
        ], seed: 0x2030_0206_f2ee_2003UL, clearAirVisibilityM: 18_000.0),
        surfaceConditions: new UniformSurfaceConditionField(
            new SurfaceConditionSample(
                surfaceTemperatureK: 271.4,
                snowWaterEquivalentM: 0.0,
                snowDepthM: 0.0,
                snowDensityKgPerM3: 0.0,
                snowAgeSeconds: 0.0,
                snowLiquidWaterFraction01: 0.0,
                snowCrust01: 0.0,
                surfaceWetness01: 0.62,
                standingWaterDepthM: 0.0003,
                slushDepthM: 0.0,
                glazeIceThicknessM: 0.0015,
                mudDepthM: 0.004,
                frictionCoefficient: 0.12,
                brakingFactor01: 0.20)));

    static WindVectorLevel WindLevel(double altitudeM, double eastMps, double northMps) =>
        new(altitudeM, new Vec3D(eastMps, 0.0, northMps));
}
