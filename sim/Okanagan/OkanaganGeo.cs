using System.Reflection;
using System.Text.Json;

namespace GunsOnly.Sim.Okanagan;

/// <summary>Local tangent-plane projection for the bounded central Okanagan play space.</summary>
public static class OkanaganGeo
{
    public const double AnchorLatitudeDeg = 49.88;
    public const double AnchorLongitudeDeg = -119.50;
    public const double LakeSurfaceElevationM = 342.0;
    public const double KelownaRunwayElevationM = 433.0;
    const double MetresPerLatitudeDegree = 111_320.0;
    static readonly double MetresPerLongitudeDegree =
        MetresPerLatitudeDegree * Math.Cos(AnchorLatitudeDeg * Math.PI / 180.0);
    static readonly (double Longitude, double Latitude)[] LakeShoreline = LoadLakeShoreline();

    public static Vec3D ToWorld(double latitudeDeg, double longitudeDeg, double altitudeM) => new(
        (longitudeDeg - AnchorLongitudeDeg) * MetresPerLongitudeDegree,
        altitudeM,
        (latitudeDeg - AnchorLatitudeDeg) * MetresPerLatitudeDegree);

    public static (double LatitudeDeg, double LongitudeDeg) ToGeographic(in Vec3D position) => (
        AnchorLatitudeDeg + position.Z / MetresPerLatitudeDegree,
        AnchorLongitudeDeg + position.X / MetresPerLongitudeDegree);

    public static bool IsOverCentralLake(in Vec3D position)
    {
        (double latitude, double longitude) = ToGeographic(position);
        bool inside = false;
        for (int i = 0, j = LakeShoreline.Length - 1; i < LakeShoreline.Length; j = i++) {
            (double xi, double yi) = LakeShoreline[i];
            (double xj, double yj) = LakeShoreline[j];
            double dx = xj - xi;
            double dy = yj - yi;
            double cross = (longitude - xi) * dy - (latitude - yi) * dx;
            double dot = (longitude - xi) * dx + (latitude - yi) * dy;
            if (Math.Abs(cross) < 1e-10 && dot >= 0.0 && dot <= dx * dx + dy * dy)
                return true;
            bool crosses = (yi > latitude) != (yj > latitude)
                && longitude < (xj - xi) * (latitude - yi) / (yj - yi) + xi;
            if (crosses) inside = !inside;
        }
        return inside;
    }

    public static double RepresentativeTerrainHeightM(in Vec3D position)
        => OkanaganCdem.SampleSurfaceHeightM(position);

    public static bool IsOverKelownaRunway(in Vec3D position)
    {
        Vec3D northThreshold = ToWorld(49.9670, -119.3778, KelownaRunwayElevationM);
        Vec3D southThreshold = ToWorld(49.9442, -119.3650, KelownaRunwayElevationM);
        Vec3D line = southThreshold - northThreshold;
        double lengthSquared = line.X * line.X + line.Z * line.Z;
        double along = ((position.X - northThreshold.X) * line.X
            + (position.Z - northThreshold.Z) * line.Z) / lengthSquared;
        if (along is < -0.08 or > 1.08) return false;
        along = Math.Clamp(along, 0.0, 1.0);
        double nearestX = northThreshold.X + line.X * along;
        double nearestZ = northThreshold.Z + line.Z * along;
        double dx = position.X - nearestX;
        double dz = position.Z - nearestZ;
        return dx * dx + dz * dz <= 38.0 * 38.0;
    }

    /// <summary>Broad visual/physics cut-and-fill blend around the narrow runway pavement.</summary>
    public static double KelownaRunwayTerrainBlend(in Vec3D position)
    {
        Vec3D northThreshold = ToWorld(49.9670, -119.3778, KelownaRunwayElevationM);
        Vec3D southThreshold = ToWorld(49.9442, -119.3650, KelownaRunwayElevationM);
        Vec3D line = southThreshold - northThreshold;
        double lengthSquared = line.X * line.X + line.Z * line.Z;
        double along = ((position.X - northThreshold.X) * line.X
            + (position.Z - northThreshold.Z) * line.Z) / lengthSquared;
        if (along is < -0.16 or > 1.16) return 0.0;
        along = Math.Clamp(along, 0.0, 1.0);
        double nearestX = northThreshold.X + line.X * along;
        double nearestZ = northThreshold.Z + line.Z * along;
        double distanceM = Math.Sqrt(
            Math.Pow(position.X - nearestX, 2.0) + Math.Pow(position.Z - nearestZ, 2.0));
        return 1.0 - SmoothStep(90.0, 560.0, distanceM);
    }

    static double SmoothStep(double edge0, double edge1, double value)
    {
        double t = Math.Clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0);
        return t * t * (3.0 - 2.0 * t);
    }

    static (double Longitude, double Latitude)[] LoadLakeShoreline()
    {
        const string resourceName = "GunsOnly.Sim.Data.OkanaganCentral.world.json";
        using Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException($"Missing embedded Okanagan world {resourceName}.");
        using JsonDocument document = JsonDocument.Parse(stream);
        return document.RootElement.GetProperty("lake").GetProperty("shoreline")
            .EnumerateArray()
            .Select(point => (
                point[0].GetDouble(),
                point[1].GetDouble()))
            .ToArray();
    }
}
