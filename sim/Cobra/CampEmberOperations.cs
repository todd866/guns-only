using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Cobra;

/// <summary>
/// Authority-owned operating geometry for the fictional Camp Ember helicopter FOB.
///
/// The dimensions are gameplay design informed by FAA heliport obstacle-clearance guidance and
/// U.S. Army Vietnam firebase/base-development references; they are not a claim that one historic
/// site used this exact layout. The 8:1 arrival/departure surface is deliberately conservative for
/// a player-flown, damaged AH-1G and gives a rejected landing a real escape path.
/// </summary>
public static class CampEmberOperations
{
    public const double CentreEastM = -3_800.0;
    public const double CentreNorthM = -4_600.0;
    public const double PadElevationM = 214.0;

    public const double FinalHeadingDeg = 300.0;
    public const double FinalHeadingRad = FinalHeadingDeg * Math.PI / 180.0;
    public const double ProtectedLengthM = 2_400.0;
    public const double ProtectedHalfWidthM = 120.0;
    public const double ObstacleSurfaceRisePerM = 1.0 / 8.0;

    public const double TlofRadiusM = 12.0;
    public const double FatoRadiusM = 28.0;
    public const double SafetyAreaRadiusM = 38.0;
    public const double ServiceZoneRadiusM = 80.0;
    public const double LevelApronRadiusM = 190.0;
    public const double ApronBlendRadiusM = 300.0;
    public const double CompoundRadiusM = 175.0;

    static readonly double[] ArrivalDistanceM = { 2_400.0, 1_800.0, 1_200.0, 600.0, 180.0, 0.0 };
    static readonly double[] ArrivalRadiusM = { 95.0, 85.0, 72.0, 56.0, 38.0, 28.0 };
    static readonly double[] DepartureDistanceM = { 180.0, 600.0, 1_200.0 };

    public static Vec3D CentreWorldM => new(CentreEastM, PadElevationM, CentreNorthM);

    public static Vec3D PointAlongFinal(double distanceM)
    {
        double east = CentreEastM + Math.Sin(FinalHeadingRad) * distanceM;
        double north = CentreNorthM + Math.Cos(FinalHeadingRad) * distanceM;
        return new Vec3D(east, PadElevationM, north);
    }

    public static Vec3D ArrivalPoint(double distanceFromPadM)
    {
        Vec3D horizontal = PointAlongFinal(-distanceFromPadM);
        double upM = PadElevationM + Math.Max(12.0,
            distanceFromPadM * ObstacleSurfaceRisePerM);
        return new Vec3D(horizontal.X, upM, horizontal.Z);
    }

    public static IReadOnlyList<CobraPathGate> BuildArrivalGates(Vec3D? aircraftWorldM = null)
    {
        int activeIndex = ResolveArrivalGateIndex(aircraftWorldM);
        var gates = new CobraPathGate[ArrivalDistanceM.Length];
        for (int index = 0; index < gates.Length; index++) {
            Vec3D point = ArrivalPoint(ArrivalDistanceM[index]);
            gates[index] = new CobraPathGate(
                point.X,
                point.Y,
                point.Z,
                ArrivalRadiusM[index],
                index == activeIndex);
        }
        return gates;
    }

    public static IReadOnlyList<CobraPathGate> BuildDepartureGates(Vec3D? aircraftWorldM = null)
    {
        double alongM = aircraftWorldM is { } aircraft
            ? AlongFinalM(aircraft)
            : 0.0;
        int activeIndex = alongM > 640.0 ? 2 : alongM > 220.0 ? 1 : 0;
        var gates = new CobraPathGate[DepartureDistanceM.Length];
        for (int index = 0; index < gates.Length; index++) {
            double distanceM = DepartureDistanceM[index];
            Vec3D horizontal = PointAlongFinal(distanceM);
            gates[index] = new CobraPathGate(
                horizontal.X,
                PadElevationM + distanceM * ObstacleSurfaceRisePerM,
                horizontal.Z,
                index == 0 ? 38.0 : index == 1 ? 56.0 : 72.0,
                index == activeIndex);
        }
        return gates;
    }

    static int ResolveArrivalGateIndex(Vec3D? aircraftWorldM)
    {
        if (aircraftWorldM is not { } aircraft)
            return 0;

        double east = aircraft.X - CentreEastM;
        double north = aircraft.Z - CentreNorthM;
        double forwardEast = Math.Sin(FinalHeadingRad);
        double forwardNorth = Math.Cos(FinalHeadingRad);
        double distanceOnApproachM = -(east * forwardEast + north * forwardNorth);
        double crossTrackM = Math.Abs(east * forwardNorth - north * forwardEast);
        if (crossTrackM > ProtectedHalfWidthM * 2.5 || distanceOnApproachM > ProtectedLengthM)
            return 0;

        for (int index = 1; index < ArrivalDistanceM.Length; index++) {
            if (distanceOnApproachM > ArrivalDistanceM[index] + ArrivalRadiusM[index])
                return index;
        }
        return ArrivalDistanceM.Length - 1;
    }

    static double AlongFinalM(in Vec3D point)
    {
        double east = point.X - CentreEastM;
        double north = point.Z - CentreNorthM;
        return east * Math.Sin(FinalHeadingRad) + north * Math.Cos(FinalHeadingRad);
    }
}
