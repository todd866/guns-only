using System.Text.Json;

namespace GunsOnly.Sim.Okanagan;

public sealed record OkanaganSite(string Id, string Name, string Kind, Vec3D Position, double Value);

/// <summary>Fictional exercises at mapped places. Asset locations come from the scenery database;
/// ignition, wind, vulnerability and objectives are gameplay assumptions, not incident intelligence.</summary>
public sealed class OkanaganIncident
{
    public string Id { get; }
    public string Name { get; }
    public Vec3D Centre { get; }
    public Vec3D Ignition => Centre + new Vec3D(-450, 0, -350);
    public IReadOnlyList<OkanaganSite> Sites { get; }
    public IReadOnlyList<(Vec3D A, Vec3D B, double Width)> Clearings { get; }

    OkanaganIncident(string id, string name, double latitude, double longitude, JsonElement data)
    {
        Id = id; Name = name;
        Vec3D centre = OkanaganGeo.ToWorld(latitude, longitude, 0);
        Centre = centre with { Y = OkanaganCdem.SampleSurfaceHeightM(centre) };
        var sites = new List<OkanaganSite>();
        foreach (JsonElement building in data.GetProperty("buildings").EnumerateArray()) {
            string kind = building.GetProperty("kind").GetString()!;
            if (kind is "Outbuilding" or "shed" or "garage") continue;
            JsonElement ring = building.GetProperty("polygons")[0][0];
            // The repeated closing vertex does not influence the footprint centre.
            Vec3D[] points = ring.EnumerateArray().SkipLast(1).Select(Point).ToArray();
            Vec3D p = new(points.Average(v => v.X), 0, points.Average(v => v.Z));
            if (HorizontalDistance(p, Centre) > 900) continue;
            bool housing = kind is "Residential" or "house" or "residential" or "apartments" or "detached" or "cabin";
            string title = building.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
            sites.Add(new OkanaganSite($"building:{building.GetProperty("id")}",
                string.IsNullOrWhiteSpace(title) ? housing ? "Homes" : "Building" : title,
                housing ? "housing" : "building", p with { Y = OkanaganCdem.SampleSurfaceHeightM(p) }, housing ? 1 : 1.5));
        }
        // A finite defence sector, not a count of every building in the municipality.
        sites = sites.OrderBy(s => HorizontalDistance(s.Position, Ignition)).Take(64).ToList();
        if (data.TryGetProperty("lifts", out var lifts)) foreach (JsonElement lift in lifts.EnumerateArray()) {
            JsonElement points = lift.GetProperty("points");
            foreach (int index in new[] { 0, points.GetArrayLength() - 1 }) {
                Vec3D p = Point(points[index]);
                if (HorizontalDistance(p, Centre) > 1_300) continue;
                sites.Add(new OkanaganSite($"lift:{lift.GetProperty("id")}:{index}",
                    $"{lift.GetProperty("name").GetString()} terminal", "lift",
                    p with { Y = OkanaganCdem.SampleSurfaceHeightM(p) }, 3));
            }
        }
        Sites = sites.AsReadOnly();
        var clearings = new List<(Vec3D, Vec3D, double)>();
        if (data.TryGetProperty("runs", out var runs)) foreach (JsonElement run in runs.EnumerateArray()) {
            if (run.GetProperty("area").GetBoolean()) continue;
            Vec3D[] points = run.GetProperty("points").EnumerateArray().Select(Point).ToArray();
            for (int i = 1; i < points.Length; i++)
                clearings.Add((points[i - 1], points[i], run.GetProperty("widthM").GetDouble()));
        }
        Clearings = clearings.AsReadOnly();
    }

    public bool IsRun(in Vec3D p)
    {
        foreach (var (a, b, width) in Clearings) {
            double dx = b.X - a.X, dz = b.Z - a.Z;
            double t = Math.Clamp(((p.X - a.X) * dx + (p.Z - a.Z) * dz) / Math.Max(1, dx * dx + dz * dz), 0, 1);
            if (Math.Pow(p.X - a.X - dx * t, 2) + Math.Pow(p.Z - a.Z - dz * t, 2) < width * width / 4) return true;
        }
        return false;
    }

    static readonly Lazy<IReadOnlyDictionary<OkanaganSortieType, OkanaganIncident>> Catalog = new(Load);
    public static OkanaganIncident? For(OkanaganSortieType sortie) => (int)sortie < 3 ? null : Catalog.Value.GetValueOrDefault(sortie);

    static IReadOnlyDictionary<OkanaganSortieType, OkanaganIncident> Load()
    {
        using Stream worldStream = typeof(OkanaganIncident).Assembly.GetManifestResourceStream("GunsOnly.Sim.Data.OkanaganCentral.world.json")!;
        using Stream resortStream = typeof(OkanaganIncident).Assembly.GetManifestResourceStream("GunsOnly.Sim.Data.OkanaganResorts.osm.json")!;
        using JsonDocument world = JsonDocument.Parse(worldStream), resorts = JsonDocument.Parse(resortStream);
        JsonElement Resort(string id) => resorts.RootElement.GetProperty("resorts").EnumerateArray().Single(r => r.GetProperty("id").GetString() == id);
        return new Dictionary<OkanaganSortieType, OkanaganIncident> {
            [OkanaganSortieType.PeachlandDefence] = new("peachland", "Peachland hillside", 49.771, -119.754, world.RootElement.GetProperty("peachland")),
            [OkanaganSortieType.BigWhiteDefence] = new("big-white", "Big White · Happy Valley", 49.7195, -118.9257, Resort("big-white")),
            [OkanaganSortieType.SilverStarDefence] = new("silverstar", "SilverStar village", 50.359, -119.061, Resort("silverstar")),
            [OkanaganSortieType.ApexDefence] = new("apex", "Apex village", 49.387, -119.901, Resort("apex")),
        };
    }

    static Vec3D Point(JsonElement point) => OkanaganGeo.ToWorld(point[1].GetDouble(), point[0].GetDouble(), 0);
    internal static double HorizontalDistance(in Vec3D a, in Vec3D b) => Math.Sqrt(Math.Pow(a.X-b.X, 2) + Math.Pow(a.Z-b.Z, 2));
}
