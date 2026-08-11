using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim.Tests;

public class EnvironmentTruthTests {
    static CloudLayerDefinition SolidLayer(double extinctionPerMetre = 0.002) => new(
        baseAltitudeM: 0.0,
        topAltitudeM: 1_000.0,
        meanCloudFraction01: 1.0,
        horizontalStructureScaleM: 800.0,
        extinctionPerMetreAtFullCloud: extinctionPerMetre,
        liquidWaterKgPerM3AtFullCloud: 0.0006,
        iceWaterKgPerM3AtFullCloud: 0.0002,
        precipitationMmPerHourAtFullCloud: 4.0,
        turbulenceRmsMpsAtFullCloud: 1.5,
        verticalAirVelocityMpsAtFullCloud: 0.8,
        icingHazard01AtFullCloud: 0.6,
        lightningHazard01AtFullCloud: 0.1,
        verticalEdgeTransitionM: 100.0);

    static ConvectiveCellDefinition MovingCell() => new(
        initialCentreWorldM: new Vec3D(0.0, 1_500.0, 0.0),
        horizontalRadiusEastM: 100.0,
        horizontalRadiusNorthM: 160.0,
        baseAltitudeM: 1_000.0,
        topAltitudeM: 2_000.0,
        startTimeSeconds: 0.0,
        lifetimeSeconds: 600.0,
        advectionVelocityMps: new Vec3D(10.0, 0.0, 0.0),
        peakExtinctionPerMetre: 0.008,
        peakLiquidWaterKgPerM3: 0.002,
        peakPrecipitationMmPerHour: 80.0,
        peakTurbulenceRmsMps: 8.0,
        peakVerticalAirVelocityMps: 12.0,
        peakIcingHazard01: 0.9,
        peakLightningHazard01: 0.8,
        lifecycleTransitionSeconds: 0.0);

    [Fact]
    public void LayeredCloudSamplingIsDeterministicForSeedPositionAndTime() {
        CloudLayerDefinition[] layers =
        [
            new CloudLayerDefinition(800.0, 1_800.0, 0.55, 1_200.0, 0.003,
                liquidWaterKgPerM3AtFullCloud: 0.001,
                turbulenceRmsMpsAtFullCloud: 2.0,
                advectionVelocityMps: new Vec3D(6.0, 0.0, -2.0))
        ];
        ConvectiveCellDefinition[] cells = [MovingCell()];
        var first = new LayeredCloudField(layers, cells, seed: 0x5eed);
        var replay = new LayeredCloudField(layers, cells, seed: 0x5eed);
        var differentDay = new LayeredCloudField(layers, cells, seed: 0x5eee);
        var point = new Vec3D(143.0, 1_350.0, -277.0);

        CloudSample a = first.Sample(point, 37.5);
        CloudSample b = first.Sample(point, 37.5);
        CloudSample replayed = replay.Sample(point, 37.5);
        CloudSample changed = differentDay.Sample(point, 37.5);

        Assert.Equal(a, b);
        Assert.Equal(a, replayed);
        Assert.NotEqual(a.TurbulenceVelocityMps, changed.TurbulenceVelocityMps);
        Assert.True(a.IsPhysical);
    }

    [Fact]
    public void CloudAndStormSupportIsBoundedAtAuthoredEdgesAndLifetime() {
        var layerOnly = new LayeredCloudField([SolidLayer()], seed: 4);
        Assert.Equal(0.0, layerOnly.Sample(new Vec3D(0.0, -0.001, 0.0), 0.0)
            .CloudFraction01);
        Assert.Equal(0.0, layerOnly.Sample(new Vec3D(0.0, 0.0, 0.0), 0.0)
            .CloudFraction01);
        Assert.Equal(1.0, layerOnly.Sample(new Vec3D(0.0, 500.0, 0.0), 0.0)
            .CloudFraction01);
        Assert.Equal(0.0, layerOnly.Sample(new Vec3D(0.0, 1_000.0, 0.0), 0.0)
            .CloudFraction01);

        var cellOnly = new LayeredCloudField(convectiveCells: [MovingCell()], seed: 7);
        Assert.True(cellOnly.Sample(new Vec3D(0.0, 1_500.0, 0.0), 0.0)
            .CloudFraction01 > 0.8);
        Assert.Equal(0.0, cellOnly.Sample(new Vec3D(100.0, 1_500.0, 0.0), 0.0)
            .CloudFraction01);
        Assert.Equal(0.0, cellOnly.Sample(new Vec3D(6_010.0, 1_500.0, 0.0), 601.0)
            .CloudFraction01);
    }

    [Fact]
    public void OpticalPathUsesBeerLambertAttenuationForVisualAndEoConsumers() {
        const double extinctionPerMetre = 0.002;
        var field = new LayeredCloudField([SolidLayer(extinctionPerMetre)], seed: 2);
        var start = new Vec3D(0.0, 500.0, 0.0);
        var end = new Vec3D(1_000.0, 500.0, 0.0);

        OpticalPathResult path = CloudOptics.LineSegmentTransmission(field, start, end,
            simulationTimeSeconds: 12.0, maximumStepM: 20.0);
        OpticalPathResult transparentBand = CloudOptics.LineSegmentTransmission(field,
            start, end, simulationTimeSeconds: 12.0, maximumStepM: 20.0,
            extinctionScale: 0.0);

        Assert.Equal(2.0, path.OpticalDepth, 12);
        Assert.Equal(Math.Exp(-2.0), path.Transmission01, 12);
        Assert.Equal(3.912 / extinctionPerMetre, path.MinimumVisibilityM, 9);
        Assert.Equal(0.0, transparentBand.OpticalDepth);
        Assert.Equal(1.0, transparentBand.Transmission01);
    }

    [Fact]
    public void ConvectiveCellMovesWithSimulationTimeWithoutWallClockState() {
        var field = new LayeredCloudField(convectiveCells: [MovingCell()], seed: 17);
        Vec3D initialCentre = new(0.0, 1_500.0, 0.0);
        Vec3D movedCentre = new(200.0, 1_500.0, 0.0);

        CloudSample initial = field.Sample(initialCentre, 0.0);
        CloudSample vacated = field.Sample(initialCentre, 20.0);
        CloudSample moved = field.Sample(movedCentre, 20.0);

        Assert.True(initial.CloudFraction01 > 0.8);
        Assert.Equal(0.0, vacated.CloudFraction01);
        Assert.Equal(initial.CloudFraction01, moved.CloudFraction01, 12);
        Assert.Equal(initial.ExtinctionPerMetre, moved.ExtinctionPerMetre, 12);
        Assert.True(moved.VerticalAirVelocityMps > 8.0);
        Assert.True(moved.LightningHazard01 > 0.6);
    }

    [Fact]
    public void BilinearGridInterpolatesHeightAndAnalyticUpNormal() {
        double[,] source =
        {
            { 0.0, 10.0 },
            { 20.0, 30.0 }
        };
        var terrain = new BilinearHeightGrid(100.0, 200.0, 10.0, 10.0, source);
        source[0, 0] = 9_999.0; // constructor copied the source.

        TerrainSample centre = terrain.Sample(105.0, 205.0);
        Vec3D expectedNormal = new Vec3D(-1.0, 1.0, -2.0).Normalized();

        Assert.Equal(15.0, centre.HeightM, 12);
        Assert.Equal(expectedNormal.X, centre.UpNormal.X, 12);
        Assert.Equal(expectedNormal.Y, centre.UpNormal.Y, 12);
        Assert.Equal(expectedNormal.Z, centre.UpNormal.Z, 12);
        Assert.Equal(TerrainSurfaceKind.Land, centre.Kind);
        Assert.Equal(0.0, terrain.Sample(100.0, 200.0).HeightM);
        Assert.Equal(30.0, terrain.Sample(110.0, 210.0).HeightM);
        Assert.False(terrain.TrySample(99.999, 205.0, out _));
    }

    [Fact]
    public void TranslatedTerrainMovesBoundsAndQueriesWithoutCopyingTruth() {
        var source = new BilinearHeightGrid(-10.0, -20.0, 10.0, 20.0,
            new double[,]
            {
                { 100.0, 110.0 },
                { 120.0, 130.0 }
            });
        var translated = new TranslatedTerrainSurface(source,
            eastOffsetM: 1_000.0, northOffsetM: -2_000.0);

        Assert.Equal(new TerrainBounds(990.0, 1_000.0, -2_020.0, -2_000.0),
            translated.Bounds);
        Assert.Equal(source.HorizontalResolutionM, translated.HorizontalResolutionM);
        Assert.True(translated.TrySample(995.0, -2_010.0, out TerrainSample sample));
        Assert.Equal(115.0, sample.HeightM, 12);
        Assert.False(translated.TrySample(-5.0, -10.0, out _));
    }

    [Fact]
    public void InverseObserverOriginSamplesTheSameGloballyAnchoredTerrainPoint() {
        var source = new BilinearHeightGrid(-100.0, -100.0, 100.0, 100.0,
            new double[,]
            {
                { 0.0, 10.0, 20.0 },
                { 100.0, 110.0, 120.0 },
                { 200.0, 210.0, 220.0 }
            });
        const double observerWorldEastM = 50.0;
        const double observerWorldNorthM = -50.0;
        var observerLocal = new TranslatedTerrainSurface(source,
            eastOffsetM: -observerWorldEastM,
            northOffsetM: -observerWorldNorthM);

        Assert.True(observerLocal.TrySample(0.0, 0.0, out TerrainSample localSample));
        TerrainSample globalSample = source.Sample(
            observerWorldEastM, observerWorldNorthM);

        Assert.Equal(globalSample.HeightM, localSample.HeightM, 12);
        Assert.Equal(globalSample.UpNormal, localSample.UpNormal);
        Assert.Equal(65.0, localSample.HeightM, 12);
    }

    [Fact]
    public void TerrainClearanceAndLineOfSightDetectAnInterveningRidge() {
        var terrain = new BilinearHeightGrid(0.0, 0.0, 100.0, 100.0,
            new double[,]
            {
                { 0.0, 0.0, 0.0 },
                { 0.0, 100.0, 0.0 },
                { 0.0, 0.0, 0.0 }
            });
        var lowObserver = new Vec3D(0.0, 50.0, 100.0);
        var lowTarget = new Vec3D(200.0, 50.0, 100.0);
        var highObserver = lowObserver with { Y = 150.0 };
        var highTarget = lowTarget with { Y = 150.0 };

        Assert.Equal(-50.0, TerrainQueries.MinimumClearanceM(terrain,
            lowObserver, lowTarget), 9);
        Assert.False(TerrainQueries.HasLineOfSight(terrain, lowObserver, lowTarget));
        Assert.True(TerrainQueries.HasLineOfSight(terrain, highObserver, highTarget,
            requiredClearanceM: 40.0));
        Assert.False(TerrainQueries.HasLineOfSight(terrain, highObserver, highTarget,
            requiredClearanceM: 60.0));
        Assert.Equal(50.0, TerrainQueries.ClearanceM(terrain,
            new Vec3D(100.0, 150.0, 100.0)));
    }

    /// The clearance march reads only height, so it goes through TryHeightM — which means an
    /// override that drifts from TrySample silently changes what the terrain IS for Auto-GCAS,
    /// terrain recovery and every low-block attack corridor. Nothing else in the suite would
    /// notice, because the golden fixtures all pin TrySample.
    [Fact]
    public void HeightOnlySamplingMatchesTheFullSampleEverywhereOnAGrid() {
        var terrain = new BilinearHeightGrid(-40.0, 25.0, 10.0, 30.0,
            new double[,]
            {
                { 12.0, 40.0, -3.0, 7.5 },
                { 60.0, 0.0, 18.0, 22.25 },
                { -9.0, 31.0, 55.0, 4.0 }
            });
        var random = new System.Random(20260806);
        int inside = 0;
        for (int i = 0; i < 20_000; i++) {
            // Deliberately overshoot the bounds on both axes so the false/out-of-bounds contract
            // is pinned as tightly as the interpolated one.
            double eastM = -60.0 + random.NextDouble() * 90.0;
            double northM = 5.0 + random.NextDouble() * 110.0;
            bool sampled = terrain.TrySample(eastM, northM, out TerrainSample sample);
            bool height = terrain.TryHeightM(eastM, northM, out double heightM);
            Assert.Equal(sampled, height);
            if (!sampled) {
                Assert.Equal(0.0, heightM);
                continue;
            }
            // Bit-for-bit, not to a tolerance: these must be the same arithmetic.
            Assert.Equal(sample.HeightM, heightM);
            inside++;
        }
        Assert.True(inside > 2_000, $"only {inside} of 20,000 probes landed inside the grid");

        // The exact-maximum edge cases TrySample special-cases, and the default interface
        // implementation on a surface that does not override the height path.
        foreach (var corner in new[] {
            new Vec3D(terrain.Bounds.MinimumEastM, 0.0, terrain.Bounds.MinimumNorthM),
            new Vec3D(terrain.Bounds.MaximumEastM, 0.0, terrain.Bounds.MaximumNorthM),
            new Vec3D(terrain.Bounds.MaximumEastM, 0.0, terrain.Bounds.MinimumNorthM),
            new Vec3D(terrain.Bounds.MinimumEastM, 0.0, terrain.Bounds.MaximumNorthM) }) {
            Assert.True(terrain.TrySample(corner.X, corner.Z, out TerrainSample sample));
            Assert.True(terrain.TryHeightM(corner.X, corner.Z, out double heightM));
            Assert.Equal(sample.HeightM, heightM);
        }

        var translated = new TranslatedTerrainSurface(terrain, 1_000.0, -2_500.0);
        Assert.True(translated.TrySample(975.0, -2_450.0, out TerrainSample moved));
        Assert.True(translated.TryHeightM(975.0, -2_450.0, out double movedHeightM));
        Assert.Equal(moved.HeightM, movedHeightM);
    }

    /// A clearance march must not cost more the further apart two aircraft happen to be. Before
    /// the bound, ReactiveBandit.TryLowAttackPlan marched 43,917 samples per call on beat 10 —
    /// the opposing formation is staged 360 km out — 179,000 terrain lookups per 120 Hz tick.
    ///
    /// The bound is chosen so it cannot engage on the geometry the callers actually use: over the
    /// ~2 km that is the longest march any of them asks for, 256 samples is finer than the
    /// quarter-resolution step, so the result is bit-identical to the unbounded march.
    [Fact]
    public void ClearanceMarchIsBoundedWithoutChangingAnyQueryTheCallersActuallyMake() {
        const int Cells = 129;
        const double SpacingM = 32.0;
        var heights = new double[Cells, Cells];
        for (int north = 0; north < Cells; north++)
        for (int east = 0; east < Cells; east++)
            heights[north, east] = 300.0
                + 220.0 * System.Math.Sin(east * 0.31) * System.Math.Cos(north * 0.19);
        var terrain = new BilinearHeightGrid(0.0, 0.0, SpacingM, SpacingM, heights);
        double extentM = (Cells - 1) * SpacingM;

        // Quarter-resolution stepping over 2 km needs 250 samples, inside the bound: identical.
        var start = new Vec3D(20.0, 900.0, 20.0);
        var nearEnd = new Vec3D(20.0, 700.0, 20.0 + 1_990.0);
        double unboundedNear = DenseMinimumClearanceM(terrain, start, nearEnd);
        Assert.Equal(unboundedNear,
            TerrainQueries.MinimumClearanceM(terrain, start, nearEnd, 60.0));

        // Beyond that the bound engages and the march stops growing with the distance.
        var counted = new CountingTerrain(terrain);
        var farEnd = new Vec3D(20.0, 700.0, 20.0 + extentM - 40.0);
        counted.Queries = 0;
        double clearance = TerrainQueries.MinimumClearanceM(counted, start, farEnd, 60.0);
        Assert.True(double.IsFinite(clearance));
        Assert.Equal(TerrainQueries.MaximumPathSamples + 1, counted.Queries);
        Assert.Equal(256, TerrainQueries.MaximumPathSamples);

        // And the near march really is unbounded-equivalent: it spends fewer than the cap.
        counted.Queries = 0;
        TerrainQueries.MinimumClearanceM(counted, start, nearEnd, 60.0);
        Assert.True(counted.Queries <= TerrainQueries.MaximumPathSamples,
            $"the 2 km march spent {counted.Queries} lookups");
    }

    sealed class CountingTerrain : ITerrainSurface {
        readonly ITerrainSurface _source;
        public int Queries;
        public CountingTerrain(ITerrainSurface source) => _source = source;
        public TerrainBounds Bounds => _source.Bounds;
        public double HorizontalResolutionM => _source.HorizontalResolutionM;
        public bool TrySample(double eastM, double northM, out TerrainSample sample) {
            Queries++;
            return _source.TrySample(eastM, northM, out sample);
        }
        public bool TryHeightM(double eastM, double northM, out double heightM) {
            Queries++;
            return _source.TryHeightM(eastM, northM, out heightM);
        }
    }

    /// The unbounded quarter-resolution march, kept here as the reference the bound is measured
    /// against rather than as production code.
    static double DenseMinimumClearanceM(ITerrainSurface terrain,
        in Vec3D startWorldM, in Vec3D endWorldM) {
        Vec3D delta = endWorldM - startWorldM;
        double horizontalM = System.Math.Sqrt(delta.X * delta.X + delta.Z * delta.Z);
        double stepM = System.Math.Min(60.0, terrain.HorizontalResolutionM * 0.25);
        int steps = System.Math.Max(1,
            (int)System.Math.Ceiling(horizontalM / stepM));
        double minimum = double.MaxValue;
        for (int i = 0; i <= steps; i++) {
            Vec3D point = startWorldM + delta * ((double)i / steps);
            Assert.True(terrain.TrySample(point.X, point.Z, out TerrainSample sample));
            minimum = System.Math.Min(minimum, point.Y - sample.HeightM);
        }
        return minimum;
    }

    [Fact]
    public void ClearDefaultsAddNoHazardsAndWeatherProfileInventsNoTerrain() {
        CloudSample clear = ClearCloudField.Instance.Sample(new Vec3D(0.0, 500.0, 0.0),
            0.0);
        var atmosphere = StandardAtmosphere1976.Instance;
        var wind = new CalmWind();
        var profile = new WeatherProfile(atmosphere, wind);
        CloudSample emptyComposite = new LayeredCloudField().Sample(Vec3D.Zero, 0.0);

        Assert.Equal(0.0, clear.CloudFraction01);
        Assert.Equal(0.0, clear.ExtinctionPerMetre);
        Assert.Equal(Vec3D.Zero, clear.TurbulenceVelocityMps);
        Assert.Equal(0.0, clear.IcingHazard01);
        Assert.Equal(0.0, clear.LightningHazard01);
        Assert.Equal(clear, emptyComposite);
        Assert.Same(ClearCloudField.Instance, profile.Clouds);
        Assert.Null(profile.Terrain);
    }

    [Fact]
    public void DefinitionsAndHotQueriesRejectNonFiniteOrNonPhysicalInputs() {
        Assert.Throws<ArgumentOutOfRangeException>(() => new CloudLayerDefinition(
            1_000.0, 900.0, 0.5, 100.0, 0.001));
        Assert.Throws<ArgumentOutOfRangeException>(() => new ConvectiveCellDefinition(
            new Vec3D(0.0, 1_000.0, 0.0), 100.0, 100.0, 500.0, 1_500.0,
            0.0, 100.0, new Vec3D(0.0, 1.0, 0.0), 0.001));
        Assert.Throws<ArgumentOutOfRangeException>(() => ClearCloudField.Instance.Sample(
            new Vec3D(double.NaN, 0.0, 0.0), 0.0));
        Assert.Throws<ArgumentOutOfRangeException>(() => ClearCloudField.Instance.Sample(
            Vec3D.Zero, -0.01));
        Assert.Throws<InvalidOperationException>(() => CloudOptics.LineSegmentTransmission(
            new InvalidCloudField(), Vec3D.Zero, new Vec3D(10.0, 0.0, 0.0), 0.0));
        Assert.Throws<ArgumentOutOfRangeException>(() => new BilinearHeightGrid(
            0.0, 0.0, 1.0, 1.0,
            new double[,] { { 0.0, double.NaN }, { 0.0, 0.0 } }));
    }

    sealed class CalmWind : IWindField {
        public Vec3D Sample(Vec3D worldPos) => Vec3D.Zero;
    }

    sealed class InvalidCloudField : ICloudField {
        public CloudSample Sample(in Vec3D worldPositionM, double simulationTimeSeconds) =>
            default;
    }
}
