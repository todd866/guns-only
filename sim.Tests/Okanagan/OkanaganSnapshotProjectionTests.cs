using System.Text.Json;
using GunsOnly.Sim.Okanagan;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests.Okanagan;

public sealed class OkanaganSnapshotProjectionTests
{
    [Theory]
    [InlineData(OkanaganSortieType.WaterCircuits, "water-circuits")]
    [InlineData(OkanaganSortieType.FireAttack, "fire-attack")]
    [InlineData(OkanaganSortieType.LargeForceEmployment, "large-force-employment")]
    public void BrowserProjectionUsesStableKebabCaseAndCarriesTheFlightPath(
        OkanaganSortieType sortie, string expectedToken)
    {
        using JsonDocument document = JsonDocument.Parse(
            OkanaganSnapshotProjection.BuildStateJson(OkanaganFireMission.Create(sortie)));
        JsonElement root = document.RootElement;
        Assert.Equal(expectedToken, root.GetProperty("sortie").GetString());
        Assert.Equal("depart", root.GetProperty("phase").GetString());
        Assert.True(root.GetProperty("route").GetArrayLength() >= 2);
        Assert.Equal("departure", root.GetProperty("route")[0].GetProperty("id").GetString());
        Assert.Equal("turn-west", root.GetProperty("route")[1].GetProperty("id").GetString());
        Assert.True(root.GetProperty("route")[0].GetProperty("active").GetBoolean());
        Assert.True(root.GetProperty("fuel_plan").GetProperty("minimum_rtb_kg").GetDouble() > 0.0);
        Assert.True(root.GetProperty("fuel_plan").GetProperty("joker_kg").GetDouble()
            > root.GetProperty("fuel_plan").GetProperty("minimum_rtb_kg").GetDouble());
        Assert.Equal(0.0, root.GetProperty("water_released_this_tick_kg").GetDouble());
        Assert.Equal(0.0, root.GetProperty("water_release_rate_kgps").GetDouble());
        Assert.Equal(0.0, root.GetProperty("scoop_rate_kgps").GetDouble());
        Assert.True(root.GetProperty("drop_aim").GetProperty("x").GetDouble() != 0.0
            || root.GetProperty("drop_aim").GetProperty("z").GetDouble() != 0.0);
        Assert.Equal(0.0, root.GetProperty("drop_credit_kg").GetDouble());
    }
}
