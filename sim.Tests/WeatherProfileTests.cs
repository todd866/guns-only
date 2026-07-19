using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim.Tests;

public class WeatherProfileTests {
    static HydrostaticAtmosphereColumn Column(
        double seaLevelTemperatureK,
        double upperTemperatureK) => new(
        [
            new TemperatureSoundingPoint(0.0, seaLevelTemperatureK),
            new TemperatureSoundingPoint(10_000.0, upperTemperatureK)
        ],
        anchorPressurePa: Atmosphere.SeaLevelPressurePa);

    [Fact]
    public void HotAndColdColumnsChangeDensityAndSpeedOfSoundAtEqualStaticPressure() {
        var hot = Column(310.0, 245.0).Sample(0.0);
        var cold = Column(260.0, 195.0).Sample(0.0);

        Assert.Equal(Atmosphere.SeaLevelPressurePa, hot.PressurePa, 8);
        Assert.Equal(Atmosphere.SeaLevelPressurePa, cold.PressurePa, 8);
        Assert.True(hot.DensityKgM3 < cold.DensityKgM3);
        Assert.True(hot.SpeedOfSoundMps > cold.SpeedOfSoundMps);
    }

    [Fact]
    public void PiecewiseHydrostaticSolutionIsExactAndContinuousAtSoundingLevel() {
        const double anchorPressurePa = 100_000.0;
        var column = new HydrostaticAtmosphereColumn(
        [
            new TemperatureSoundingPoint(0.0, 300.0),
            new TemperatureSoundingPoint(4_000.0, 276.0),
            new TemperatureSoundingPoint(9_000.0, 266.0)
        ], anchorPressurePa);

        var boundary = column.Sample(4_000.0);
        double lapseKPerM = (276.0 - 300.0) / 4_000.0;
        double expectedPressurePa = anchorPressurePa * Math.Pow(
            300.0 / 276.0,
            Atmosphere.StandardGravityMps2
                / (Atmosphere.SpecificGasConstantDryAir * lapseKPerM));

        Assert.Equal(276.0, boundary.TemperatureK, 12);
        Assert.Equal(expectedPressurePa, boundary.PressurePa, 8);

        var immediatelyBelow = column.Sample(4_000.0 - 1e-5);
        var immediatelyAbove = column.Sample(4_000.0 + 1e-5);
        Assert.InRange(Math.Abs(immediatelyBelow.TemperatureK - immediatelyAbove.TemperatureK), 0.0, 1e-6);
        Assert.InRange(Math.Abs(immediatelyBelow.PressurePa - immediatelyAbove.PressurePa), 0.0, 0.01);
    }

    [Fact]
    public void PressureAnchorCanSitInsideALayerAndIntegratesInBothDirections() {
        var column = new HydrostaticAtmosphereColumn(
        [
            new TemperatureSoundingPoint(-500.0, 293.0),
            new TemperatureSoundingPoint(2_500.0, 275.0),
            new TemperatureSoundingPoint(8_000.0, 240.0)
        ], anchorPressurePa: 84_000.0, anchorGeometricAltitudeM: 1_500.0);

        var anchor = column.Sample(1_500.0);
        Assert.Equal(84_000.0, anchor.PressurePa, 8);
        Assert.True(column.Sample(-500.0).PressurePa > anchor.PressurePa);
        Assert.True(column.Sample(8_000.0).PressurePa < anchor.PressurePa);
    }

    [Fact]
    public void IsothermalLayerUsesTheExactExponentialHydrostaticSolution() {
        const double temperatureK = 280.0;
        const double anchorPressurePa = 95_000.0;
        const double altitudeM = 2_000.0;
        var column = new HydrostaticAtmosphereColumn(
        [
            new TemperatureSoundingPoint(0.0, temperatureK),
            new TemperatureSoundingPoint(altitudeM, temperatureK)
        ], anchorPressurePa);

        double expectedPressurePa = anchorPressurePa * Math.Exp(
            -Atmosphere.StandardGravityMps2 * altitudeM
            / (Atmosphere.SpecificGasConstantDryAir * temperatureK));

        Assert.Equal(expectedPressurePa, column.Sample(altitudeM).PressurePa, 8);
    }

    [Fact]
    public void AtmosphereRejectsBadUnitsOrderingAnchorsAndOutOfBoundsSamples() {
        Assert.Throws<ArgumentOutOfRangeException>(() => Column(0.0, 220.0));
        Assert.Throws<ArgumentOutOfRangeException>(() => new HydrostaticAtmosphereColumn(
            [new(0.0, 290.0), new(1_000.0, 284.0)], anchorPressurePa: -1.0));
        Assert.Throws<ArgumentException>(() => new HydrostaticAtmosphereColumn(
            [new(1_000.0, 284.0), new(0.0, 290.0)]));
        Assert.Throws<ArgumentOutOfRangeException>(() => new HydrostaticAtmosphereColumn(
            [new(1_000.0, 284.0), new(2_000.0, 278.0)]));

        var bounded = Column(288.0, 223.0);
        Assert.Throws<ArgumentOutOfRangeException>(() => bounded.Sample(-0.01));
        Assert.Throws<ArgumentOutOfRangeException>(() => bounded.Sample(10_000.01));
        Assert.Throws<ArgumentOutOfRangeException>(() => bounded.Sample(double.NaN));
    }

    [Fact]
    public void LayeredWindInterpolatesVectorShearAndClampsOutsideSounding() {
        var wind = new LayeredWindField(
        [
            new WindVectorLevel(0.0, new Vec3D(0.0, 0.0, 10.0)),
            new WindVectorLevel(1_000.0, new Vec3D(20.0, 2.0, 0.0))
        ]);

        Assert.Equal(new Vec3D(10.0, 1.0, 5.0), wind.Sample(new Vec3D(40.0, 500.0, 80.0)));
        Assert.Equal(new Vec3D(0.0, 0.0, 10.0), wind.Sample(new Vec3D(0.0, -100.0, 0.0)));
        Assert.Equal(new Vec3D(20.0, 2.0, 0.0), wind.Sample(new Vec3D(0.0, 2_000.0, 0.0)));
    }

    [Fact]
    public void LayeredWindRejectsInvalidOrderingUnitsAndSampleCoordinates() {
        Assert.Throws<ArgumentException>(() => new LayeredWindField(
        [
            new WindVectorLevel(1_000.0, Vec3D.Zero),
            new WindVectorLevel(500.0, Vec3D.Zero)
        ]));
        Assert.Throws<ArgumentOutOfRangeException>(() => new LayeredWindField(
        [
            new WindVectorLevel(0.0, new Vec3D(double.NaN, 0.0, 0.0)),
            new WindVectorLevel(1_000.0, Vec3D.Zero)
        ]));

        var wind = new LayeredWindField(
        [
            new WindVectorLevel(0.0, Vec3D.Zero),
            new WindVectorLevel(1_000.0, Vec3D.Zero)
        ]);
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            wind.Sample(new Vec3D(0.0, double.PositiveInfinity, 0.0)));
    }

    [Fact]
    public void DirectionCrossingThroughNorthUsesVectorInterpolationNotWrappedAngles() {
        static Vec3D WindFromHeading(double degrees, double speedMps) {
            double radians = degrees * Math.PI / 180.0;
            return new Vec3D(Math.Sin(radians) * speedMps, 0.0,
                Math.Cos(radians) * speedMps);
        }

        var wind = new LayeredWindField(
        [
            new WindVectorLevel(0.0, WindFromHeading(350.0, 10.0)),
            new WindVectorLevel(1_000.0, WindFromHeading(10.0, 10.0))
        ]);

        Vec3D midpoint = wind.Sample(new Vec3D(0.0, 500.0, 0.0));
        Assert.InRange(Math.Abs(midpoint.X), 0.0, 1e-12);
        Assert.Equal(10.0 * Math.Cos(10.0 * Math.PI / 180.0), midpoint.Z, 12);
        Assert.True(midpoint.Z > 0.0);
    }

    [Fact]
    public void OptionalTurbulenceIsSummedOverTheInterpolatedMeanWind() {
        var turbulence = new PositionTurbulence();
        var wind = new LayeredWindField(
        [
            new WindVectorLevel(0.0, new Vec3D(2.0, 0.0, 4.0)),
            new WindVectorLevel(1_000.0, new Vec3D(4.0, 0.0, 8.0))
        ], turbulence);
        var position = new Vec3D(20.0, 500.0, -10.0);

        // Mean at 500 m is (3,0,6); the deterministic test texture is (2,1,-1).
        Assert.Equal(new Vec3D(5.0, 1.0, 5.0), wind.Sample(position));
        Assert.Same(turbulence, wind.Turbulence);
    }

    [Fact]
    public void WeatherProfilePairsTheTwoExistingSimulationSeams() {
        IAtmosphereModel atmosphere = Column(288.0, 223.0);
        IWindField wind = new LayeredWindField(
        [
            new WindVectorLevel(0.0, Vec3D.Zero),
            new WindVectorLevel(10_000.0, new Vec3D(20.0, 0.0, 0.0))
        ]);

        var profile = new WeatherProfile(atmosphere, wind);
        Assert.Same(atmosphere, profile.Atmosphere);
        Assert.Same(wind, profile.Wind);
        Assert.Throws<ArgumentNullException>(() => new WeatherProfile(null!, wind));
        Assert.Throws<ArgumentNullException>(() => new WeatherProfile(atmosphere, null!));
    }

    sealed class PositionTurbulence : IWindField {
        public Vec3D Sample(Vec3D worldPos) =>
            new(worldPos.X / 10.0, 1.0, worldPos.Z / 10.0);
    }
}
