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
    static readonly double[] DepartureDistanceM = { 140.0, 320.0 };

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
        return BuildDepartureGates(PointAlongFinal(1_200.0), aircraftWorldM);
    }

    /// <summary>
    /// A visible departure join rather than a straight line that changes direction after the
    /// player has left the FOB. The first two gates remain inside the surveyed 300-degree lane;
    /// the remaining four form a quadratic turn toward the selected route's nearest safe point.
    /// Every gate stays above the pad while Depart is active, so the cue cannot teach a descent
    /// into the forest immediately after lift-off.
    /// </summary>
    public static IReadOnlyList<CobraPathGate> BuildDepartureGates(
        in Vec3D routeJoinWorldM,
        Vec3D? aircraftWorldM = null)
    {
        var positions = new Vec3D[6];
        for (int index = 0; index < DepartureDistanceM.Length; index++) {
            double distanceM = DepartureDistanceM[index];
            Vec3D horizontal = PointAlongFinal(distanceM);
            positions[index] = new Vec3D(
                horizontal.X,
                PadElevationM + Math.Max(42.0, distanceM * ObstacleSurfaceRisePerM),
                horizontal.Z);
        }

        Vec3D curveStart = positions[1];
        Vec3D curveControl = PointAlongFinal(900.0);
        Vec3D curveFinish = new(
            routeJoinWorldM.X,
            Math.Max(PadElevationM + 42.0, routeJoinWorldM.Y),
            routeJoinWorldM.Z);
        for (int index = 2; index < positions.Length; index++) {
            double t = (index - 1.0) / (positions.Length - 2.0);
            double oneMinusT = 1.0 - t;
            positions[index] = new Vec3D(
                oneMinusT * oneMinusT * curveStart.X
                    + 2.0 * oneMinusT * t * curveControl.X
                    + t * t * curveFinish.X,
                Math.Max(
                    PadElevationM + 42.0,
                    oneMinusT * curveStart.Y + t * curveFinish.Y),
                oneMinusT * oneMinusT * curveStart.Z
                    + 2.0 * oneMinusT * t * curveControl.Z
                    + t * t * curveFinish.Z);
        }

        int activeIndex = ResolveDepartureGateIndex(positions, aircraftWorldM);

        var gates = new CobraPathGate[positions.Length];
        for (int index = 0; index < gates.Length; index++) {
            Vec3D position = positions[index];
            gates[index] = new CobraPathGate(
                position.X,
                position.Y,
                position.Z,
                38.0 + index * 10.0,
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

    static int ResolveDepartureGateIndex(
        IReadOnlyList<Vec3D> gates,
        Vec3D? aircraftWorldM)
    {
        if (aircraftWorldM is not { } aircraft)
            return 0;

        double nearestDistanceSquaredM = double.MaxValue;
        double nearestAlongM = 0.0;
        double accumulatedM = 0.0;
        Vec3D from = CentreWorldM;
        foreach (Vec3D to in gates) {
            double eastM = to.X - from.X;
            double northM = to.Z - from.Z;
            double lengthSquaredM = eastM * eastM + northM * northM;
            double lengthM = Math.Sqrt(lengthSquaredM);
            if (lengthM > 1e-6) {
                double fraction = Math.Clamp(
                    ((aircraft.X - from.X) * eastM + (aircraft.Z - from.Z) * northM)
                        / lengthSquaredM,
                    0.0,
                    1.0);
                double projectedEastM = from.X + eastM * fraction;
                double projectedNorthM = from.Z + northM * fraction;
                double distanceSquaredM =
                    (aircraft.X - projectedEastM) * (aircraft.X - projectedEastM)
                    + (aircraft.Z - projectedNorthM) * (aircraft.Z - projectedNorthM);
                if (distanceSquaredM < nearestDistanceSquaredM) {
                    nearestDistanceSquaredM = distanceSquaredM;
                    nearestAlongM = accumulatedM + lengthM * fraction;
                }
                accumulatedM += lengthM;
            }
            from = to;
        }

        accumulatedM = 0.0;
        from = CentreWorldM;
        for (int index = 0; index < gates.Count; index++) {
            Vec3D to = gates[index];
            accumulatedM += HorizontalDistanceM(from, to);
            if (accumulatedM > nearestAlongM + 24.0)
                return index;
            from = to;
        }
        return gates.Count - 1;
    }

    static double HorizontalDistanceM(in Vec3D a, in Vec3D b)
    {
        double eastM = a.X - b.X;
        double northM = a.Z - b.Z;
        return Math.Sqrt(eastM * eastM + northM * northM);
    }
}
