using GunsOnly.Sim;
using GunsOnly.Sim.Cobra;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Cobra;

public sealed class CobraCanyonWindFieldTests
{
    static readonly Vec3D CampEmberHoverWorldM = new(
        CampEmberOperations.CentreEastM,
        CampEmberOperations.PadElevationM + 28.0,
        CampEmberOperations.CentreNorthM);

    [Fact]
    public void StillSynopticYieldsZeroEverywhere()
    {
        CobraCanyonDefinition definition = CobraCanyonDefinition.Create();
        var field = new CobraCanyonWindField(definition.CreateTerrainSurface(), Vec3D.Zero);

        foreach (double timeSeconds in new[] { 0.0, 0.01, 10.0, 3_600.0 })
        {
            Vec3D sample = field.Sample(CampEmberHoverWorldM, timeSeconds);
            Assert.Equal(0.0, sample.X);
            Assert.Equal(0.0, sample.Y);
            Assert.Equal(0.0, sample.Z);
        }
    }

    [Fact]
    public void InterfaceSampleIsExactlyTheTimeZeroSample()
    {
        CobraCanyonDefinition definition = CobraCanyonDefinition.Create();
        var field = new CobraCanyonWindField(definition.CreateTerrainSurface());

        Assert.Equal(
            field.Sample(CampEmberHoverWorldM, simulationTimeSeconds: 0.0),
            field.Sample(CampEmberHoverWorldM));
    }

    [Fact]
    public void PositionAndSimulationTimeReplayExactlyAcrossRuns()
    {
        CobraCanyonDefinition definition = CobraCanyonDefinition.Create();
        var first = new CobraCanyonWindField(definition.CreateTerrainSurface());
        var replay = new CobraCanyonWindField(definition.CreateTerrainSurface());
        Vec3D[] positions =
        {
            CampEmberHoverWorldM,
            new(-6_120.0, 265.0, -5_430.0),
            new(-2_750.0, 400.0, -550.0),
        };
        double[] times = { 0.0, 0.125, 7.75, 60.0, 601.5, 3_600.0, 86_400.0 };

        foreach (Vec3D position in positions)
        foreach (double timeSeconds in times)
        {
            Vec3D expected = first.Sample(position, timeSeconds);
            Assert.Equal(expected, first.Sample(position, timeSeconds));
            Assert.Equal(expected, replay.Sample(position, timeSeconds));
        }
    }

    [Fact]
    public void FixedHoverEncountersTimeVaryingButContinuousAir()
    {
        CobraCanyonDefinition definition = CobraCanyonDefinition.Create();
        var field = new CobraCanyonWindField(definition.CreateTerrainSurface());

        Vec3D start = field.Sample(CampEmberHoverWorldM, 0.0);
        Vec3D oneTickLater = field.Sample(CampEmberHoverWorldM, 1.0 / 120.0);
        Vec3D later = field.Sample(CampEmberHoverWorldM, 12.0);

        Assert.InRange(Distance(start, oneTickLater), 0.0, 0.35);
        Assert.True(
            Distance(start, later) > 0.05,
            "advected eddies must change the wind at a fixed hover point");
    }

    [Fact]
    public void DefaultSynopticIsFiniteAndTerrainModulated()
    {
        CobraCanyonDefinition definition = CobraCanyonDefinition.Create();
        ITerrainSurface terrain = definition.CreateTerrainSurface();
        var field = new CobraCanyonWindField(terrain, CobraCanyonWindField.DefaultSynopticMps);

        Vec3D gorge = field.Sample(new Vec3D(-6_775.0, 230.0, -6_200.0));
        Assert.True(gorge.IsFinite);
        Assert.True(gorge.Length > 0.5, $"expected canyon breeze, got {gorge.Length:F2} m/s");

        // Higher ridge sample should typically run faster than a deep cut when slope allows.
        Vec3D ridge = field.Sample(new Vec3D(-2_750.0, 400.0, -550.0));
        Assert.True(ridge.IsFinite);
        Assert.True(ridge.Length > 0.5);
    }

    [Fact]
    public void GustsStayFiniteBoundedAndContinuousAcrossCanyonFlight()
    {
        CobraCanyonDefinition definition = CobraCanyonDefinition.Create();
        var field = new CobraCanyonWindField(definition.CreateTerrainSurface());
        Vec3D[] probes =
        {
            CampEmberHoverWorldM,
            new(-6_300.0, 250.0, -5_800.0),
            new(-5_000.0, 330.0, -3_500.0),
            new(-2_750.0, 400.0, -550.0),
        };

        foreach (Vec3D probe in probes)
        {
            for (int step = 0; step <= 240; step++)
            {
                double timeSeconds = step * 0.25;
                Vec3D wind = field.Sample(probe, timeSeconds);
                Vec3D nearInSpace = field.Sample(
                    new Vec3D(probe.X + 0.05, probe.Y, probe.Z - 0.05),
                    timeSeconds);
                Vec3D nearInTime = field.Sample(probe, timeSeconds + 0.01);

                Assert.True(wind.IsFinite);
                // For the default mission synoptic, the terrain-shaped v1 mean is capped below
                // 8.3 m/s and wind-v2 adds at most 4.8 m/s. Explicit custom synoptics retain
                // their authored mean and are intentionally not forced under this mission bound.
                Assert.InRange(wind.Length, 0.0, 13.1);
                Assert.InRange(Distance(wind, nearInSpace), 0.0, 0.75);
                Assert.InRange(Distance(wind, nearInTime), 0.0, 0.75);
            }
        }
    }

    [Fact]
    public void TimeAverageKeepsAPlausibleWestboundCanyonMean()
    {
        CobraCanyonDefinition definition = CobraCanyonDefinition.Create();
        var field = new CobraCanyonWindField(definition.CreateTerrainSurface());
        Vec3D sum = Vec3D.Zero;
        const int count = 600;

        for (int index = 0; index < count; index++)
            sum += field.Sample(CampEmberHoverWorldM, index * 1.5);

        Vec3D mean = sum * (1.0 / count);
        Vec3D synopticHorizontal = new(
            CobraCanyonWindField.DefaultSynopticMps.X,
            0.0,
            CobraCanyonWindField.DefaultSynopticMps.Z);
        Vec3D meanHorizontal = new(mean.X, 0.0, mean.Z);

        Assert.True(mean.IsFinite);
        Assert.True(
            meanHorizontal.Dot(synopticHorizontal) > 0.0,
            $"mean must remain westbound with the synoptic, got {mean}");
        Assert.InRange(meanHorizontal.Length, 0.5, 8.0);
        Assert.InRange(mean.Y, -3.5, 4.5);
    }

    [Theory]
    [InlineData(-0.001)]
    [InlineData(double.NegativeInfinity)]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    public void RejectsInvalidSimulationTime(double simulationTimeSeconds)
    {
        CobraCanyonDefinition definition = CobraCanyonDefinition.Create();
        var field = new CobraCanyonWindField(definition.CreateTerrainSurface());

        Assert.Throws<ArgumentOutOfRangeException>(() =>
            field.Sample(CampEmberHoverWorldM, simulationTimeSeconds));
    }

    [Fact]
    public void MissionRuntimeAppliesTerrainWindIntoVehicleObservation()
    {
        CobraCanyonDefinition definition = CobraCanyonDefinition.Create();
        var runtime = new CobraMissionRuntime(
            definition,
            definition.CreateTerrainSurface(),
            CobraCanyonRouteChoice.RiverGorge,
            windVelocityMps: CobraCanyonWindField.DefaultSynopticMps,
            enableTerrainWind: true);

        var replayField = new CobraCanyonWindField(
            definition.CreateTerrainSurface(),
            CobraCanyonWindField.DefaultSynopticMps);
        double trim = runtime.Cobra.EstimateHoverCollective(
            runtime.Cobra.State.GrossMassKg,
            CobraMissionRuntime.DefaultAirDensityKgM3);
        var command = new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0);

        Vec3D initialPosition = runtime.Cobra.State.PositionWorldM;
        Vec3D expectedInitial = replayField.Sample(initialPosition, simulationTimeSeconds: 0.0);

        runtime.Advance(command);

        Assert.Equal(10.0, CobraMissionRuntime.TerrainWindSampleHz);
        Assert.Equal(1, runtime.TerrainWindSamplesTaken);
        Assert.Equal(expectedInitial, runtime.LastWindVelocityMps);
        Assert.Equal(
            runtime.LastWindVelocityMps.X,
            runtime.Cobra.Observation.WindVelocityMps.X,
            6);

        for (int tick = 1; tick < CobraMissionRuntime.TerrainWindSampleIntervalTicks; tick++)
        {
            runtime.Advance(command);
            Assert.Equal(1, runtime.TerrainWindSamplesTaken);
            Assert.Equal(expectedInitial, runtime.LastWindVelocityMps);
            Assert.Equal(
                runtime.LastWindVelocityMps.X,
                runtime.Cobra.Observation.WindVelocityMps.X,
                6);
        }

        Vec3D refreshPosition = runtime.Cobra.State.PositionWorldM;
        Vec3D expectedRefresh = replayField.Sample(
            refreshPosition,
            CobraMissionRuntime.TerrainWindSampleIntervalTicks
                * PlayerVehicleContract.FixedDeltaSeconds);

        runtime.Advance(command);

        Assert.Equal(2, runtime.TerrainWindSamplesTaken);
        Assert.Equal(expectedRefresh, runtime.LastWindVelocityMps);
        Assert.NotEqual(expectedInitial, runtime.LastWindVelocityMps);
        Assert.True(runtime.LastWindVelocityMps.Length > 0.5);
    }

    static double Distance(Vec3D a, Vec3D b) => (a - b).Length;
}
