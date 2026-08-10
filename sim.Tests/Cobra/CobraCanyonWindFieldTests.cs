using GunsOnly.Sim;
using GunsOnly.Sim.Cobra;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Cobra;

public sealed class CobraCanyonWindFieldTests
{
    [Fact]
    public void StillSynopticYieldsZeroEverywhere()
    {
        CobraCanyonDefinition definition = CobraCanyonDefinition.Create();
        var field = new CobraCanyonWindField(definition.CreateTerrainSurface(), Vec3D.Zero);
        Vec3D sample = field.Sample(new Vec3D(-6_775.0, 230.0, -6_200.0));
        Assert.Equal(0.0, sample.X);
        Assert.Equal(0.0, sample.Y);
        Assert.Equal(0.0, sample.Z);
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
    public void MissionRuntimeAppliesTerrainWindIntoVehicleObservation()
    {
        CobraCanyonDefinition definition = CobraCanyonDefinition.Create();
        var runtime = new CobraMissionRuntime(
            definition,
            definition.CreateTerrainSurface(),
            CobraCanyonRouteChoice.RiverGorge,
            windVelocityMps: CobraCanyonWindField.DefaultSynopticMps,
            enableTerrainWind: true);

        double trim = runtime.Cobra.EstimateHoverCollective(
            runtime.Cobra.State.GrossMassKg,
            CobraMissionRuntime.DefaultAirDensityKgM3);
        runtime.Advance(new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0));

        Assert.True(runtime.LastWindVelocityMps.Length > 0.5);
        Assert.Equal(
            runtime.LastWindVelocityMps.X,
            runtime.Cobra.Observation.WindVelocityMps.X,
            6);
    }
}
