using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Okanagan;
using Xunit;

namespace GunsOnly.Sim.Tests.Okanagan;

public sealed class OkanaganSceneryTests
{
    [Theory]
    [InlineData(120, 100)]
    [InlineData(190, 220)]
    [InlineData(270, 330)]
    public void PeachlandUsesMeasuredDetailNodes(int row, int column)
    {
        using JsonDocument source = Terrain();
        JsonElement grid = source.RootElement.GetProperty("details")[0].GetProperty("details")[0];
        JsonElement bounds = grid.GetProperty("bounds");
        double latitude = bounds.GetProperty("south").GetDouble()
            + (bounds.GetProperty("north").GetDouble() - bounds.GetProperty("south").GetDouble())
            * row / (grid.GetProperty("rows").GetInt32() - 1);
        double longitude = bounds.GetProperty("west").GetDouble()
            + (bounds.GetProperty("east").GetDouble() - bounds.GetProperty("west").GetDouble())
            * column / (grid.GetProperty("columns").GetInt32() - 1);
        double expected = grid.GetProperty("elevationsM")[row][column].GetDouble();
        Assert.Equal(expected, OkanaganCdem.SampleRawHeightM(OkanaganGeo.ToWorld(latitude, longitude, 0)), 6);
    }

    [Theory]
    [InlineData(49.75)]
    [InlineData(49.77)]
    [InlineData(49.80)]
    public void DetailWesternSeamIsContinuous(double latitude)
    {
        using JsonDocument source = Terrain();
        double west = source.RootElement.GetProperty("details")[0].GetProperty("details")[0].GetProperty("bounds").GetProperty("west").GetDouble();
        double inside = OkanaganCdem.SampleRawHeightM(OkanaganGeo.ToWorld(latitude, west + 1e-8, 0));
        double outside = OkanaganCdem.SampleRawHeightM(OkanaganGeo.ToWorld(latitude, west - 1e-8, 0));
        Assert.InRange(Math.Abs(inside - outside), 0, 0.02);
    }

    [Theory]
    [InlineData(49.7734, -119.7366, false)]
    [InlineData(49.773, -119.71, true)]
    [InlineData(49.76, -119.79, false)]
    public void PeachlandShorelineSeparatesTownAndLake(double latitude, double longitude, bool water)
    {
        var point = OkanaganGeo.ToWorld(latitude, longitude, 0);
        Assert.Equal(water, OkanaganGeo.IsOverCentralLake(point));
        if (water) Assert.Equal(342, OkanaganCdem.SampleSurfaceHeightM(point));
        else Assert.True(OkanaganCdem.SampleSurfaceHeightM(point) > 342);
    }

    static JsonDocument Terrain()
    {
        using Stream stream = typeof(OkanaganCdem).Assembly.GetManifestResourceStream(
            "GunsOnly.Sim.Data.OkanaganCentral.cdem.json")!;
        return JsonDocument.Parse(stream);
    }
}
