namespace GunsOnly.Sim.Okanagan;

public readonly record struct FireBossFuelSnapshot(
    double BlockFuelKg,
    double TaxiOutKg,
    double OutboundTripKg,
    double WorkingFuelKg,
    double ReturnTripKg,
    double OperationalReserveKg,
    double FinalReserveKg,
    double TaxiInKg,
    double MinimumRtbFuelKg,
    double JokerFuelKg,
    double FuelAboveMinimumKg,
    double EnduranceMinutes,
    string State);

/// <summary>
/// Training fuel ladder. The 30-minute final reserve is the Canadian day-VFR regulatory floor;
/// the operational reserve is an explicit exercise assumption, not an operator manual claim.
/// </summary>
public static class FireBossFuelPlan
{
    public const double WaterCircuitsBlockFuelKg = 610.0;
    public const double FireAttackBlockFuelKg = 760.0;
    public const double TaxiOutKg = 18.0;
    public const double PlannedOutboundTripKg = 82.0;
    public const double OperationalReserveKg = 45.0;
    public const double FinalReserveKg = 225.0;
    public const double TaxiInKg = 12.0;
    public const double NominalCruiseBurnKgPerSecond = 0.125;
    /// <summary>
    /// Joker — stop taking another circuit so bingo is not a surprise. Bingo remains the hard
    /// recover-now floor (return + operational + final + taxi-in).
    /// </summary>
    public const double OneMoreCircuitProhibitedKg = 55.0;

    public static FireBossFuelSnapshot Snapshot(double blockFuelKg, double fuelKg,
        in Vec3D position, int completedCycles)
    {
        Vec3D arrival = OkanaganGeo.ToWorld(49.9442, -119.3650, 760.0);
        double distanceM = HorizontalDistance(position, arrival);
        double returnTripKg = 24.0 + distanceM / 62.0 * NominalCruiseBurnKgPerSecond * 1.22;
        double minimum = returnTripKg + OperationalReserveKg + FinalReserveKg + TaxiInKg;
        double joker = minimum + OneMoreCircuitProhibitedKg;
        double above = fuelKg - minimum;
        double working = blockFuelKg - TaxiOutKg - PlannedOutboundTripKg - minimum;
        string state = above <= 0.0 ? "MINIMUM FUEL — RTB"
            : above <= OneMoreCircuitProhibitedKg ? "ONE MORE CIRCUIT PROHIBITED"
            : completedCycles == 0 ? "WORKING FUEL AVAILABLE"
            : "CONTINUE / MONITOR";
        return new FireBossFuelSnapshot(blockFuelKg, TaxiOutKg, PlannedOutboundTripKg,
            Math.Max(0.0, working), returnTripKg, OperationalReserveKg, FinalReserveKg,
            TaxiInKg, minimum, joker, above, fuelKg / NominalCruiseBurnKgPerSecond / 60.0, state);
    }

    static double HorizontalDistance(in Vec3D a, in Vec3D b)
    {
        double dx = a.X - b.X;
        double dz = a.Z - b.Z;
        return Math.Sqrt(dx * dx + dz * dz);
    }
}
