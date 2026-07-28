using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

public class PrecipitationFieldTests {
    static readonly HydrometeorRates SnowAndFreezingDrizzle = new(
        snowMmWaterEquivalentPerHour: 1.8,
        freezingDrizzleMmWaterEquivalentPerHour: 0.2);

    static StratiformPrecipitationDefinition UniformSnow() => new(
        bottomAltitudeM: -100.0,
        topAltitudeM: 1_500.0,
        meanCoverage01: 1.0,
        horizontalStructureScaleM: 3_000.0,
        ratesAtFullIntensity: SnowAndFreezingDrizzle,
        extinctionPerMetreAtFullIntensity: 0.001,
        advectionVelocityMps: new Vec3D(8.0, 0.0, -2.0),
        verticalEdgeTransitionM: 100.0);

    static PrecipitationShaftDefinition SnowShaft(
        HydrometeorRates? rates = null,
        double startTimeSeconds = 0.0,
        double lifetimeSeconds = 600.0) => new(
        initialCentreEastM: 0.0,
        initialCentreNorthM: 0.0,
        horizontalRadiusEastM: 500.0,
        horizontalRadiusNorthM: 800.0,
        bottomAltitudeM: -100.0,
        topAltitudeM: 2_000.0,
        startTimeSeconds,
        lifetimeSeconds,
        advectionVelocityMps: new Vec3D(10.0, 0.0, 0.0),
        peakRates: rates ?? new HydrometeorRates(
            snowMmWaterEquivalentPerHour: 3.0),
        peakExtinctionPerMetre: 0.002,
        lifecycleTransitionSeconds: 0.0,
        verticalEdgeTransitionM: 100.0);

    [Fact]
    public void HydrometeorRatesRemainAdditiveAndUnitExplicit() {
        var rates = new HydrometeorRates(
            rainMmWaterEquivalentPerHour: 0.5,
            snowMmWaterEquivalentPerHour: 1.5,
            freezingDrizzleMmWaterEquivalentPerHour: 0.25,
            freezingRainMmWaterEquivalentPerHour: 0.4,
            icePelletsMmWaterEquivalentPerHour: 0.1,
            graupelMmWaterEquivalentPerHour: 0.2,
            hailMmWaterEquivalentPerHour: 0.05);

        Assert.Equal(3.0, rates.TotalMmWaterEquivalentPerHour, 12);
        Assert.Equal(1.5, rates.RateFor(HydrometeorPhase.Snow));
        Assert.Equal(HydrometeorPhase.Snow, rates.DominantPhase);
        Assert.True(rates.IsPhysical);
        Assert.False(rates.IsNone);
        Assert.Null(HydrometeorRates.None.DominantPhase);
    }

    [Fact]
    public void ClearFieldAddsNoHydrometeorsAndValidatesSampleCoordinates() {
        PrecipitationSample first = ClearPrecipitationField.Instance.Sample(
            new Vec3D(20.0, 500.0, -10.0), 42.0);
        PrecipitationSample replay = ClearPrecipitationField.Instance.Sample(
            new Vec3D(20.0, 500.0, -10.0), 42.0);

        Assert.Equal(first, replay);
        Assert.True(first.Rates.IsNone);
        Assert.Equal(0.0, first.ExtinctionPerMetre);
        Assert.Equal(ClearCloudField.DefaultClearAirVisibilityM, first.VisibilityM);
        Assert.True(first.IsPhysical);
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            ClearPrecipitationField.Instance.Sample(
                new Vec3D(double.NaN, 0.0, 0.0), 0.0));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            ClearPrecipitationField.Instance.Sample(Vec3D.Zero, -0.01));
    }

    [Fact]
    public void UniformStratiformFieldCarriesSnowAndFreezingDrizzleBelowCloudBase() {
        var field = new LayeredPrecipitationField(
            stratiformBands: [UniformSnow()],
            seed: 0x2030,
            clearAirVisibilityM: 50_000.0);

        PrecipitationSample belowCloud = field.Sample(
            new Vec3D(0.0, 100.0, 0.0), 30.0);
        PrecipitationSample outsideDepth = field.Sample(
            new Vec3D(0.0, 1_600.0, 0.0), 30.0);

        Assert.Equal(1.8,
            belowCloud.Rates.SnowMmWaterEquivalentPerHour, 12);
        Assert.Equal(0.2,
            belowCloud.Rates.FreezingDrizzleMmWaterEquivalentPerHour, 12);
        Assert.Equal(2.0, belowCloud.TotalMmWaterEquivalentPerHour, 12);
        Assert.Equal(3_912.0, belowCloud.VisibilityM, 9);
        Assert.True(outsideDepth.Rates.IsNone);
        Assert.Equal(50_000.0, outsideDepth.VisibilityM);
    }

    [Fact]
    public void SeededStratiformPatternAdvectsWithoutConsultingWallClock() {
        var definition = new StratiformPrecipitationDefinition(
            bottomAltitudeM: 0.0,
            topAltitudeM: 2_000.0,
            meanCoverage01: 0.55,
            horizontalStructureScaleM: 1_100.0,
            ratesAtFullIntensity: new HydrometeorRates(
                snowMmWaterEquivalentPerHour: 2.0),
            extinctionPerMetreAtFullIntensity: 0.001,
            advectionVelocityMps: new Vec3D(6.0, 0.0, -3.0),
            verticalEdgeTransitionM: 100.0);
        var first = new LayeredPrecipitationField([definition], seed: 0x5eed);
        var replay = new LayeredPrecipitationField([definition], seed: 0x5eed);

        Vec3D sampled = default;
        PrecipitationSample atStart = default;
        bool found = false;
        for (int north = -4; north <= 4 && !found; north++)
        for (int east = -4; east <= 4 && !found; east++) {
            sampled = new Vec3D(east * 400.0, 1_000.0, north * 400.0);
            atStart = first.Sample(sampled, 0.0);
            found = atStart.TotalMmWaterEquivalentPerHour > 0.01;
        }
        Assert.True(found, "seeded precipitation pattern should contain a sampled snow band");

        const double elapsedSeconds = 37.0;
        Vec3D advected = sampled + definition.AdvectionVelocityMps * elapsedSeconds;
        PrecipitationSample moved = first.Sample(advected, elapsedSeconds);

        Assert.Equal(atStart, replay.Sample(sampled, 0.0));
        Assert.Equal(atStart.Rates.SnowMmWaterEquivalentPerHour,
            moved.Rates.SnowMmWaterEquivalentPerHour, 12);
        Assert.Equal(atStart.ExtinctionPerMetre, moved.ExtinctionPerMetre, 12);
    }

    [Fact]
    public void OverlappingStratiformAndShaftRatesAddByPhase() {
        var shaftRates = new HydrometeorRates(
            snowMmWaterEquivalentPerHour: 3.0,
            freezingRainMmWaterEquivalentPerHour: 0.6);
        var field = new LayeredPrecipitationField(
            stratiformBands: [UniformSnow()],
            shafts: [SnowShaft(shaftRates)],
            clearAirVisibilityM: 100_000.0);

        PrecipitationSample centre = field.Sample(
            new Vec3D(0.0, 1_000.0, 0.0), 0.0);

        Assert.Equal(4.8, centre.Rates.SnowMmWaterEquivalentPerHour, 12);
        Assert.Equal(0.2,
            centre.Rates.FreezingDrizzleMmWaterEquivalentPerHour, 12);
        Assert.Equal(0.6,
            centre.Rates.FreezingRainMmWaterEquivalentPerHour, 12);
        Assert.Equal(5.6, centre.TotalMmWaterEquivalentPerHour, 12);
        Assert.Equal(0.003, centre.ExtinctionPerMetre, 12);
        Assert.Equal(3.912 / 0.003, centre.VisibilityM, 9);
    }

    [Fact]
    public void ShaftIsBoundedInSpaceTimeAndMovesWithAuthoredWind() {
        var shaft = SnowShaft();
        var field = new LayeredPrecipitationField(shafts: [shaft]);

        PrecipitationSample initial = field.Sample(
            new Vec3D(0.0, 1_000.0, 0.0), 0.0);
        PrecipitationSample vacated = field.Sample(
            new Vec3D(0.0, 1_000.0, 0.0), 20.0);
        PrecipitationSample moved = field.Sample(
            new Vec3D(200.0, 1_000.0, 0.0), 20.0);
        PrecipitationSample outsideRadius = field.Sample(
            new Vec3D(700.0, 1_000.0, 0.0), 0.0);
        PrecipitationSample expired = field.Sample(
            new Vec3D(6_010.0, 1_000.0, 0.0), 601.0);

        Assert.Equal(3.0, initial.Rates.SnowMmWaterEquivalentPerHour, 12);
        Assert.True(vacated.TotalMmWaterEquivalentPerHour
            < initial.TotalMmWaterEquivalentPerHour);
        Assert.Equal(initial, moved);
        Assert.True(outsideRadius.Rates.IsNone);
        Assert.True(expired.Rates.IsNone);
    }

    [Fact]
    public void DefinitionsRejectBadUnitsGeometryAndNonPhysicalRates() {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new HydrometeorRates(snowMmWaterEquivalentPerHour: -0.01));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new HydrometeorRates(rainMmWaterEquivalentPerHour: double.NaN));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new StratiformPrecipitationDefinition(
                1_000.0, 500.0, 1.0, 1_000.0,
                HydrometeorRates.None, 0.0));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new StratiformPrecipitationDefinition(
                0.0, 1_000.0, 1.0, 1_000.0,
                HydrometeorRates.None, 0.0,
                advectionVelocityMps: new Vec3D(0.0, 1.0, 0.0)));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            SnowShaft(lifetimeSeconds: 0.0));
        Assert.Throws<ArgumentException>(() =>
            new LayeredPrecipitationField(
                stratiformBands: [null!]));
    }

    [Fact]
    public void WeatherProfileDefaultsToClearPrecipitationAndAcceptsExplicitField() {
        var atmosphere = StandardAtmosphere1976.Instance;
        var wind = new TestCalmWind();
        var precipitation = new LayeredPrecipitationField(
            stratiformBands: [UniformSnow()]);

        var backwardsCompatible = new WeatherProfile(atmosphere, wind);
        var explicitSnow = new WeatherProfile(
            atmosphere,
            wind,
            ClearCloudField.Instance,
            precipitation: precipitation);

        Assert.Same(ClearPrecipitationField.Instance,
            backwardsCompatible.Precipitation);
        Assert.Same(precipitation, explicitSnow.Precipitation);
    }

    sealed class TestCalmWind : GunsOnly.Sim.Turbulence.IWindField {
        public Vec3D Sample(Vec3D worldPos) => Vec3D.Zero;
    }
}
