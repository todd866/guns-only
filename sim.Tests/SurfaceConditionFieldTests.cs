using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim.Tests;

public class SurfaceConditionFieldTests {
    static SurfaceConditionSample WinterSample(
        double surfaceTemperatureK = 268.15,
        double snowWaterEquivalentM = 0.045,
        double snowDepthM = 0.18,
        double snowDensityKgPerM3 = 250.0,
        double snowAgeSeconds = 86_400.0,
        double snowLiquidWaterFraction01 = 0.08,
        double snowCrust01 = 0.35,
        double surfaceWetness01 = 0.2,
        double standingWaterDepthM = 0.003,
        double slushDepthM = 0.012,
        double glazeIceThicknessM = 0.0015,
        double mudDepthM = 0.025,
        double frictionCoefficient = 0.22,
        double brakingFactor01 = 0.38) => new(
            surfaceTemperatureK,
            snowWaterEquivalentM,
            snowDepthM,
            snowDensityKgPerM3,
            snowAgeSeconds,
            snowLiquidWaterFraction01,
            snowCrust01,
            surfaceWetness01,
            standingWaterDepthM,
            slushDepthM,
            glazeIceThicknessM,
            mudDepthM,
            frictionCoefficient,
            brakingFactor01);

    [Fact]
    public void ClearDryDefaultContainsNoContaminants() {
        SurfaceConditionSample sample = SurfaceConditionSample.ClearDry;

        Assert.True(sample.IsPhysical);
        Assert.Equal(288.15, sample.SurfaceTemperatureK);
        Assert.Equal(0.0, sample.SnowWaterEquivalentM);
        Assert.Equal(0.0, sample.SnowDepthM);
        Assert.Equal(0.0, sample.SnowDensityKgPerM3);
        Assert.Equal(0.0, sample.SnowAgeSeconds);
        Assert.Equal(0.0, sample.SnowLiquidWaterFraction01);
        Assert.Equal(0.0, sample.SnowCrust01);
        Assert.Equal(0.0, sample.SurfaceWetness01);
        Assert.Equal(0.0, sample.StandingWaterDepthM);
        Assert.Equal(0.0, sample.SlushDepthM);
        Assert.Equal(0.0, sample.GlazeIceThicknessM);
        Assert.Equal(0.0, sample.MudDepthM);
        Assert.Equal(0.8, sample.FrictionCoefficient);
        Assert.Equal(1.0, sample.BrakingFactor01);
    }

    [Fact]
    public void UniformFieldIsInvariantAcrossSpaceAndSimulationTime() {
        SurfaceConditionSample winter = WinterSample();
        var field = new UniformSurfaceConditionField(winter);

        Assert.Equal(winter, field.Condition);
        Assert.Equal(winter, field.Sample(-4_208.0, 4_096.0, 0.0));
        Assert.Equal(winter, field.Sample(180_000.0, -95_000.0, 43_200.0));
        Assert.Equal(SurfaceConditionSample.ClearDry,
            UniformSurfaceConditionField.ClearDry.Sample(0.0, 0.0, 0.0));
    }

    [Fact]
    public void SampleRejectsNonPhysicalScalarState() {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            WinterSample(surfaceTemperatureK: 0.0));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            WinterSample(surfaceTemperatureK: double.NaN));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            WinterSample(snowWaterEquivalentM: -0.001));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            WinterSample(snowDepthM: double.PositiveInfinity));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            WinterSample(snowDensityKgPerM3:
                SurfaceConditionSample.MaximumSnowDensityKgPerM3 + 0.001));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            WinterSample(snowAgeSeconds: -1.0));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            WinterSample(snowLiquidWaterFraction01: 1.001));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            WinterSample(snowCrust01: -0.001));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            WinterSample(surfaceWetness01: double.NaN));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            WinterSample(standingWaterDepthM: -0.001));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            WinterSample(slushDepthM: -0.001));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            WinterSample(glazeIceThicknessM: double.NegativeInfinity));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            WinterSample(mudDepthM: -0.001));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            WinterSample(frictionCoefficient:
                SurfaceConditionSample.MaximumFrictionCoefficient + 0.001));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            WinterSample(brakingFactor01: -0.001));
        Assert.Throws<ArgumentException>(() =>
            WinterSample(snowWaterEquivalentM: 0.046));
        Assert.Throws<ArgumentException>(() =>
            WinterSample(
                snowWaterEquivalentM: 0.0,
                snowDepthM: 0.0,
                snowDensityKgPerM3: 250.0));
    }

    [Fact]
    public void UniformFieldRejectsInvalidQueriesAndDefaultStructSamples() {
        Assert.False(default(SurfaceConditionSample).IsPhysical);
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new UniformSurfaceConditionField(default));

        var field = UniformSurfaceConditionField.ClearDry;
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            field.Sample(double.NaN, 0.0, 0.0));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            field.Sample(0.0, double.PositiveInfinity, 0.0));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            field.Sample(0.0, 0.0, -0.001));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            field.Sample(0.0, 0.0, double.NaN));
    }

    [Fact]
    public void SurfaceConditionContractDoesNotOwnGeographicTerrain() {
        Assert.False(typeof(ITerrainSurface).IsAssignableFrom(
            typeof(UniformSurfaceConditionField)));
        Assert.All(typeof(SurfaceConditionSample).GetProperties(),
            property => Assert.False(property.CanWrite));
    }

    [Fact]
    public void WeatherProfileDefaultsDryAndAcceptsAnExplicitWinterSurface() {
        IAtmosphereModel atmosphere = StandardAtmosphere1976.Instance;
        IWindField wind = new LayeredWindField([
            new WindVectorLevel(0.0, Vec3D.Zero),
            new WindVectorLevel(1_000.0, Vec3D.Zero)
        ]);
        var winter = new UniformSurfaceConditionField(WinterSample());

        var clear = new WeatherProfile(atmosphere, wind);
        var explicitWinter = new WeatherProfile(
            atmosphere,
            wind,
            ClearCloudField.Instance,
            surfaceConditions: winter);

        Assert.Same(UniformSurfaceConditionField.ClearDry, clear.SurfaceConditions);
        Assert.Same(winter, explicitWinter.SurfaceConditions);
    }
}
