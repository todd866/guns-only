using System.Reflection;
using System.Text.Json;

namespace GunsOnly.Sim.Okanagan;

/// <summary>
/// Simulation-side reader for the exact 33×33 Natural Resources Canada CDEM grid rendered by the
/// Okanagan page. The lake and airport cut/fill live in <see cref="OkanaganGeo"/> so every user of
/// the raw grid applies the same operational-surface rules.
/// </summary>
public static class OkanaganCdem
{
    const string ResourceName = "GunsOnly.Sim.Data.OkanaganCentral.cdem.json";
    static readonly Grid Data = Load();

    public static double SampleRawHeightM(in Vec3D position)
    {
        (double latitude, double longitude) = OkanaganGeo.ToGeographic(position);
        double columnF = (longitude - Data.West) / (Data.East - Data.West) * (Data.Columns - 1);
        double rowF = (latitude - Data.South) / (Data.North - Data.South) * (Data.Rows - 1);
        int column0 = Math.Clamp((int)Math.Floor(columnF), 0, Data.Columns - 1);
        int row0 = Math.Clamp((int)Math.Floor(rowF), 0, Data.Rows - 1);
        int column1 = Math.Min(Data.Columns - 1, column0 + 1);
        int row1 = Math.Min(Data.Rows - 1, row0 + 1);
        double tx = Math.Clamp(columnF - column0, 0.0, 1.0);
        double tz = Math.Clamp(rowF - row0, 0.0, 1.0);
        double south = Lerp(Data.Height(column0, row0), Data.Height(column1, row0), tx);
        double north = Lerp(Data.Height(column0, row1), Data.Height(column1, row1), tx);
        return Lerp(south, north, tz);
    }

    public static double SampleSurfaceHeightM(in Vec3D position)
    {
        if (OkanaganGeo.IsOverCentralLake(position))
            return OkanaganGeo.LakeSurfaceElevationM;
        double raw = SampleRawHeightM(position);
        double runwayBlend = OkanaganGeo.KelownaRunwayTerrainBlend(position);
        return Lerp(raw, OkanaganGeo.KelownaRunwayElevationM, runwayBlend);
    }

    static Grid Load()
    {
        using Stream stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"Missing embedded Okanagan CDEM {ResourceName}.");
        using JsonDocument document = JsonDocument.Parse(stream);
        JsonElement root = document.RootElement;
        int rows = root.GetProperty("rows").GetInt32();
        int columns = root.GetProperty("columns").GetInt32();
        JsonElement bounds = root.GetProperty("bounds");
        JsonElement sourceRows = root.GetProperty("elevationsM");
        if (rows < 2 || columns < 2 || sourceRows.GetArrayLength() != rows)
            throw new InvalidDataException("Okanagan CDEM dimensions are invalid.");
        var heights = new double[checked(rows * columns)];
        int cursor = 0;
        foreach (JsonElement row in sourceRows.EnumerateArray()) {
            if (row.GetArrayLength() != columns)
                throw new InvalidDataException("Okanagan CDEM row width is invalid.");
            foreach (JsonElement height in row.EnumerateArray())
                heights[cursor++] = height.GetDouble();
        }
        return new Grid(
            rows,
            columns,
            bounds.GetProperty("south").GetDouble(),
            bounds.GetProperty("north").GetDouble(),
            bounds.GetProperty("west").GetDouble(),
            bounds.GetProperty("east").GetDouble(),
            heights);
    }

    static double Lerp(double from, double to, double t) => from + (to - from) * t;

    sealed record Grid(
        int Rows,
        int Columns,
        double South,
        double North,
        double West,
        double East,
        double[] Heights)
    {
        public double Height(int column, int row) => Heights[row * Columns + column];
    }
}
