using System.Text.Json;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
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
}
