using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim.Tests;

public class UkraineWinterWeatherPresetsTests {
    const double FreezingPointK = 273.15;

    [Fact]
    public void PresetsExposeStableIdentitiesAndReplayDeterministically() {
        WeatherProfile snow = UkraineWinterWeatherPresets.SnowSquall;
        WeatherProfile snowReplay = UkraineWinterWeatherPresets.SnowSquall;
        WeatherProfile stratus = UkraineWinterWeatherPresets.FreezingStratus;
        var point = new Vec3D(1_250.0, 550.0, -800.0);
        const double timeSeconds = 137.5;

        Assert.Same(snow, snowReplay);
        Assert.Equal("weather.ukraine-2030s.winter-snow-squall.v1", snow.Id);
        Assert.Equal("weather.ukraine-2030s.winter-freezing-stratus.v1", stratus.Id);
        Assert.Equal(snow.Atmosphere.Sample(point.Y), snowReplay.Atmosphere.Sample(point.Y));
        Assert.Equal(snow.Wind.Sample(point), snowReplay.Wind.Sample(point));
        Assert.Equal(snow.Clouds.Sample(point, timeSeconds),
            snowReplay.Clouds.Sample(point, timeSeconds));
        Assert.Equal(snow.Precipitation.Sample(point, timeSeconds),
            snowReplay.Precipitation.Sample(point, timeSeconds));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void WinterSoundingsRemainColdHydrostaticAndPhysical(bool useSnowSquall) {
        WeatherProfile profile = useSnowSquall
            ? UkraineWinterWeatherPresets.SnowSquall
            : UkraineWinterWeatherPresets.FreezingStratus;

        AtmosphericState surface = profile.Atmosphere.Sample(0.0);
        AtmosphericState cloud = profile.Atmosphere.Sample(useSnowSquall ? 1_200.0 : 450.0);
        AtmosphericState upper = profile.Atmosphere.Sample(6_000.0);

        Assert.True(surface.TemperatureK < FreezingPointK);
        Assert.True(cloud.TemperatureK < FreezingPointK);
        Assert.InRange(surface.TemperatureK, 250.0, FreezingPointK);
        Assert.InRange(cloud.TemperatureK, 240.0, FreezingPointK);
        Assert.True(surface.PressurePa > cloud.PressurePa);
        Assert.True(cloud.PressurePa > upper.PressurePa);
        Assert.True(surface.DensityKgM3 > 0.0);
        Assert.True(cloud.DensityKgM3 > 0.0);
        Assert.True(upper.DensityKgM3 > 0.0);
    }

    [Fact]
    public void TypedPrecipitationDistinguishesSnowFromFreezingDrizzleBelowCloud() {
        WeatherProfile snow = UkraineWinterWeatherPresets.SnowSquall;
        WeatherProfile stratus = UkraineWinterWeatherPresets.FreezingStratus;
        var belowSnowCloud = new Vec3D(400.0, 200.0, -250.0);
        var belowStratusCloud = new Vec3D(-300.0, 50.0, 175.0);

        CloudSample snowClearAir = snow.Clouds.Sample(belowSnowCloud, 90.0);
        CloudSample stratusClearAir = stratus.Clouds.Sample(belowStratusCloud, 90.0);
        PrecipitationSample snowPrecipitation =
            snow.Precipitation.Sample(belowSnowCloud, 90.0);
        PrecipitationSample drizzlePrecipitation =
            stratus.Precipitation.Sample(belowStratusCloud, 90.0);

        Assert.Equal(0.0, snowClearAir.CloudFraction01);
        Assert.Equal(0.0, stratusClearAir.CloudFraction01);
        Assert.Equal(HydrometeorPhase.Snow, snowPrecipitation.Rates.DominantPhase);
        Assert.Equal(HydrometeorPhase.FreezingDrizzle,
            drizzlePrecipitation.Rates.DominantPhase);
        Assert.True(snowPrecipitation.Rates.SnowMmWaterEquivalentPerHour
            > snowPrecipitation.Rates.FreezingDrizzleMmWaterEquivalentPerHour);
        Assert.True(drizzlePrecipitation.Rates.FreezingDrizzleMmWaterEquivalentPerHour
            > drizzlePrecipitation.Rates.SnowMmWaterEquivalentPerHour);
        Assert.True(snowPrecipitation.TotalMmWaterEquivalentPerHour > 0.0);
        Assert.True(drizzlePrecipitation.TotalMmWaterEquivalentPerHour > 0.0);
    }

    [Fact]
    public void SnowSquallPrecipitationHasTheLowerBelowCloudVisibility() {
        PrecipitationSample snow = UkraineWinterWeatherPresets.SnowSquall.Precipitation.Sample(
            new Vec3D(0.0, 200.0, 0.0), 30.0);
        PrecipitationSample drizzle =
            UkraineWinterWeatherPresets.FreezingStratus.Precipitation.Sample(
                new Vec3D(0.0, 50.0, 0.0), 30.0);

        Assert.InRange(snow.VisibilityM, 500.0, 1_000.0);
        Assert.InRange(drizzle.VisibilityM, 2_000.0, 3_000.0);
        Assert.True(snow.VisibilityM < drizzle.VisibilityM);
        Assert.True(snow.ExtinctionPerMetre > drizzle.ExtinctionPerMetre);
    }

    [Fact]
    public void FreezingStratusHasLowerCeilingAndMuchGreaterLiquidIcingHazard() {
        var snowClouds =
            Assert.IsType<LayeredCloudField>(UkraineWinterWeatherPresets.SnowSquall.Clouds);
        var stratusClouds =
            Assert.IsType<LayeredCloudField>(UkraineWinterWeatherPresets.FreezingStratus.Clouds);
        CloudLayerDefinition snowLayer = Assert.Single(snowClouds.Layers);
        CloudLayerDefinition stratusLayer = Assert.Single(stratusClouds.Layers);
        CloudSample snowCore = snowClouds.Sample(new Vec3D(0.0, 1_200.0, 0.0), 60.0);
        CloudSample stratusCore = stratusClouds.Sample(new Vec3D(0.0, 450.0, 0.0), 60.0);

        Assert.Equal(100.0, stratusLayer.BaseAltitudeM);
        Assert.True(stratusLayer.BaseAltitudeM < snowLayer.BaseAltitudeM);
        Assert.True(stratusCore.LiquidWaterKgPerM3
            > 10.0 * snowCore.LiquidWaterKgPerM3);
        Assert.True(stratusCore.LiquidWaterKgPerM3 > stratusCore.IceWaterKgPerM3);
        Assert.True(snowCore.IceWaterKgPerM3 > snowCore.LiquidWaterKgPerM3);
        Assert.InRange(snowCore.IcingHazard01, 0.0, 0.10);
        Assert.InRange(stratusCore.IcingHazard01, 0.80, 1.0);
        Assert.True(stratusCore.IcingHazard01 > snowCore.IcingHazard01);
        Assert.True(snowLayer.TurbulenceRmsMpsAtFullCloud
            > stratusLayer.TurbulenceRmsMpsAtFullCloud);
    }

    [Fact]
    public void PresetsUseLayeredDeterministicWeatherComponents() {
        foreach (WeatherProfile profile in new[] {
            UkraineWinterWeatherPresets.SnowSquall,
            UkraineWinterWeatherPresets.FreezingStratus
        }) {
            Assert.IsType<HydrostaticAtmosphereColumn>(profile.Atmosphere);
            var wind = Assert.IsType<LayeredWindField>(profile.Wind);
            Assert.NotNull(wind.Turbulence);
            Assert.IsType<LayeredCloudField>(profile.Clouds);
            Assert.IsType<LayeredPrecipitationField>(profile.Precipitation);
            Assert.IsType<UniformSurfaceConditionField>(profile.SurfaceConditions);
        }
    }

    [Fact]
    public void SnowSquallAndFreezingStratusCarryDistinctGroundHazards() {
        SurfaceConditionSample snow =
            UkraineWinterWeatherPresets.SnowSquall.SurfaceConditions.Sample(0.0, 0.0, 30.0);
        SurfaceConditionSample glaze =
            UkraineWinterWeatherPresets.FreezingStratus.SurfaceConditions.Sample(
                0.0, 0.0, 30.0);

        Assert.InRange(snow.SnowDepthM, 0.08, 0.16);
        Assert.Equal(0.0, snow.GlazeIceThicknessM);
        Assert.Equal(0.0, glaze.SnowDepthM);
        Assert.InRange(glaze.GlazeIceThicknessM, 0.001, 0.002);
        Assert.True(glaze.FrictionCoefficient < snow.FrictionCoefficient);
        Assert.True(glaze.BrakingFactor01 < snow.BrakingFactor01);
    }
}
