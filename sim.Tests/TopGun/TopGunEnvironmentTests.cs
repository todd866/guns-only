using System.Text.Json;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Recovery;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests.TopGun;

[Collection("snapshot-projection-statics")]
public sealed class TopGunEnvironmentTests
{
    static ITerrainSurface Terrain(double heightM) => new BilinearHeightGrid(
        -20_000.0, -20_000.0, 40_000.0, 40_000.0,
        new double[,] { { heightM, heightM }, { heightM, heightM } });

    static SimulationSession StageAfter(
        int priorBeat, ITerrainSurface priorTerrain, ITerrainSurface topGunTerrain)
    {
        var session = new SimulationSession();
        session.StartBeatWithEnvironment(
            priorBeat, KoreaWeatherPresets.ForBeat(priorBeat), priorTerrain);
        session.StartBeatWithEnvironment(
            () => Beats.TopGunAcm(TopGunSeat.F14A),
            TopGunEnvironment.Weather,
            topGunTerrain);
        return session;
    }

    [Fact]
    public void TopGunEnvironmentUsesTheShippedSupportedTerrainProduct()
    {
        Assert.Equal(
            Ukraine2030sTheatre.TerrainProfileId,
            TopGunEnvironment.Contract.TerrainProfileId);
        Assert.Equal(
            Ukraine2030sTheatre.MacroSceneryProfile,
            TopGunEnvironment.Contract.MacroSceneryProfile);
        Assert.Equal(
            Ukraine2030sTheatre.MicroSceneryProfile,
            TopGunEnvironment.Contract.MicroSceneryProfile);
        Assert.False(TopGunEnvironment.Contract.MultiplayerTerrainShared);
        Assert.Null(TopGunEnvironment.Weather.Terrain);
    }

    [Fact]
    public void TopGunCarrierSitsAboveAuthoritativeWaterWithRecoveryMargin()
    {
        ITerrainSurface terrain = Assert.IsAssignableFrom<ITerrainSurface>(
            UkraineTerrainTruth.Load());
        foreach (double elapsedSeconds in new[] { 0.0, 20.0 * 60.0 }) {
            Carrier carrier = Assert.IsType<Carrier>(Beats.TopGunAcm(TopGunSeat.F14A).Carrier);
            carrier.Step(elapsedSeconds);
            Vec3D centre = carrier.Position;
            for (double east = -768.0; east <= 768.0; east += 256.0)
            for (double north = -768.0; north <= 768.0; north += 256.0) {
                Assert.True(terrain.TrySample(
                    centre.X + east,
                    centre.Z + north,
                    out TerrainSample sample));
                Assert.Equal(TerrainSurfaceKind.Water, sample.Kind);
                Assert.True(sample.HeightM < carrier.DeckAltM);
            }
        }
    }

    [Fact]
    public void TopGunStagingIsIndependentOfPriorMissionOrderAndHistory()
    {
        ITerrainSurface topGunTerrain = Terrain(126.0);
        SimulationSession fromPerch = StageAfter(1, Terrain(12.0), topGunTerrain);
        SimulationSession fromModernMerge = StageAfter(7, Terrain(987.0), topGunTerrain);

        Assert.Same(topGunTerrain, fromPerch.Terrain);
        Assert.Same(topGunTerrain, fromModernMerge.Terrain);
        Assert.Same(TopGunEnvironment.Weather, fromPerch.Weather);
        Assert.Same(TopGunEnvironment.Weather, fromModernMerge.Weather);
        Assert.Equal(TopGunEnvironment.Contract, fromPerch.Beat.EnvironmentIdentity);
        Assert.Equal(TopGunEnvironment.Contract, fromModernMerge.Beat.EnvironmentIdentity);
        Assert.Equal(fromPerch.Player.State, fromModernMerge.Player.State);
        Assert.Equal(fromPerch.Bandit.State, fromModernMerge.Bandit.State);

        // Restart rebuilds the authored beat while retaining the explicit environment boundary.
        fromPerch.Restart();
        Assert.Same(topGunTerrain, fromPerch.Terrain);
        Assert.Same(TopGunEnvironment.Weather, fromPerch.Weather);
    }

    [Fact]
    public void TopGunSnapshotPublishesTheSameSupportedFlightViewContract()
    {
        ITerrainSurface topGunTerrain = Terrain(126.0);
        SimulationSession session = StageAfter(7, Terrain(42.0), topGunTerrain);
        using JsonDocument document = JsonDocument.Parse(
            SnapshotProjection.BuildState(
                session,
                Carrier.DeckConfiguration.Angled,
                9_000.0,
                -12_000.0,
                worldOriginConfigured: true,
                terrain: topGunTerrain));
        JsonElement root = document.RootElement;

        Assert.Equal(TopGunEnvironment.TheatreId,
            root.GetProperty("theatre_id").GetString());
        Assert.Equal(Ukraine2030sTheatre.TerrainProfileId,
            root.GetProperty("terrain_profile_id").GetString());
        Assert.Equal(Ukraine2030sTheatre.MicroSceneryProfile,
            root.GetProperty("terrain_scenery_profile").GetString());
        Assert.True(root.GetProperty("terrain_present").GetBoolean());
        Assert.False(root.GetProperty("multiplayer_terrain_shared").GetBoolean());
        Assert.Equal(0.0, root.GetProperty("terrain_placement_east_m").GetDouble());
        Assert.Equal(0.0, root.GetProperty("terrain_placement_north_m").GetDouble());
    }

    [Fact]
    public void MergeAndCaseIInitialShareTheCarriersSurveyedWater()
    {
        ITerrainSurface terrain = Assert.IsAssignableFrom<ITerrainSurface>(
            UkraineTerrainTruth.Load());
        BeatSetup beat = Beats.TopGunAcm(TopGunSeat.F14A);
        Carrier carrier = Assert.IsType<Carrier>(beat.Carrier);
        var initial = ConventionalCarrierRecoveryDirector.BuildSchedule(carrier, 78.0)[0];

        AssertWaterPad(terrain, beat.Player.Position, 768.0, "Tomcat spawn");
        AssertWaterPad(terrain, beat.Bandit.Position, 768.0, "MiG spawn");
        AssertWaterPad(terrain, initial.Position, 768.0, "Case I initial");

        double shipRangeM = Horizontal(beat.Player.Position, carrier.Position);
        Assert.InRange(shipRangeM, 6.0 * 1852.0, 8.0 * 1852.0);
        Vec3D nose = new(Math.Sin(beat.Player.Chi), 0.0, Math.Cos(beat.Player.Chi));
        Vec3D toShip = carrier.Position - beat.Player.Position;
        Assert.True(nose.Dot(toShip) > 0.0, "the ship must sit in front of the Tomcat's nose");
        Assert.True(Horizontal(beat.Player.Position, initial.Position) < 8.0 * 1852.0);
    }

    static void AssertWaterPad(ITerrainSurface terrain, Vec3D point, double halfM, string label)
    {
        for (double east = -halfM; east <= halfM; east += 512.0)
        for (double north = -halfM; north <= halfM; north += 512.0) {
            Assert.True(terrain.TrySample(point.X + east, point.Z + north, out TerrainSample sample),
                label);
            Assert.True(sample.Kind == TerrainSurfaceKind.Water,
                $"{label} land at {point.X + east:F0},{point.Z + north:F0} h={sample.HeightM:F0}");
        }
    }

    static double Horizontal(Vec3D a, Vec3D b)
    {
        double east = a.X - b.X;
        double north = a.Z - b.Z;
        return Math.Sqrt(east * east + north * north);
    }
}
