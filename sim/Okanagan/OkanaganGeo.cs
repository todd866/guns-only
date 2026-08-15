namespace GunsOnly.Sim.Okanagan;

/// <summary>Local tangent-plane projection for the bounded central Okanagan play space.</summary>
public static class OkanaganGeo
{
    public const double AnchorLatitudeDeg = 49.88;
    public const double AnchorLongitudeDeg = -119.50;
    public const double LakeSurfaceElevationM = 342.0;
    const double MetresPerLatitudeDegree = 111_320.0;
    static readonly double MetresPerLongitudeDegree =
        MetresPerLatitudeDegree * Math.Cos(AnchorLatitudeDeg * Math.PI / 180.0);
    static readonly (double Latitude, double Longitude)[] WestShore = [
        (49.680, -119.760), (49.735, -119.748), (49.785, -119.724),
        (49.835, -119.675), (49.880, -119.612), (49.925, -119.548),
        (49.975, -119.505), (50.030, -119.487), (50.080, -119.470),
    ];
    static readonly (double Latitude, double Longitude)[] EastShore = [
        (49.680, -119.720), (49.735, -119.690), (49.785, -119.625),
        (49.835, -119.555), (49.880, -119.493), (49.925, -119.455),
        (49.975, -119.425), (50.030, -119.405), (50.080, -119.390),
    ];

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
        if (latitude is < 49.68 or > 50.08) return false;
        // Interpolate the exact two banks authored in okanagan-central.world.json. Presentation
        // and collision authority must agree on whether a float is over lake or hillside.
        double west = ShoreLongitude(WestShore, latitude);
        double east = ShoreLongitude(EastShore, latitude);
        return longitude >= west && longitude <= east;
    }

    public static double RepresentativeTerrainHeightM(in Vec3D position)
    {
        if (IsOverCentralLake(position)) return LakeSurfaceElevationM;
        (double latitude, double longitude) = ToGeographic(position);
        // Kelowna airport and the east-side valley floor sit close to lake elevation. The broad
        // ridge surrogate below is for the bounding mountains; applying it here creates a fake
        // 700 m wall across Runway 16 the instant the floats leave the pavement.
        if (latitude is >= 49.89 and <= 50.08 && longitude is >= -119.46 and <= -119.30)
            return 430.0 + 28.0 * Math.Abs(longitude + 119.38) / 0.08;
        double westRise = Math.Max(0.0, (-position.X - 4_500.0) * 0.060);
        double eastRise = Math.Max(0.0, (position.X - 1_500.0) * 0.052);
        double valleyTexture = 55.0 * Math.Sin(position.Z / 4_800.0)
            + 35.0 * Math.Sin((position.X + position.Z) / 3_400.0);
        return Math.Max(LakeSurfaceElevationM + 8.0,
            LakeSurfaceElevationM + westRise + eastRise + valleyTexture);
    }

    public static bool IsOverKelownaRunway(in Vec3D position)
    {
        Vec3D northThreshold = ToWorld(49.9670, -119.3778, 433.0);
        Vec3D southThreshold = ToWorld(49.9442, -119.3650, 433.0);
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

    static double ShoreLongitude((double Latitude, double Longitude)[] shore, double latitude)
    {
        for (int index = 1; index < shore.Length; index++)
        {
            if (latitude > shore[index].Latitude) continue;
            (double lowerLat, double lowerLon) = shore[index - 1];
            (double upperLat, double upperLon) = shore[index];
            double t = (latitude - lowerLat) / (upperLat - lowerLat);
            return lowerLon + (upperLon - lowerLon) * t;
        }
        return shore[^1].Longitude;
    }
}
