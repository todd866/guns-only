namespace GunsOnly.Sim.FlightTest;

/// Point-performance arithmetic from the drone-derivation brief: aero max G, sustained G,
/// specific excess power, and climb γ. Wave drag is optional via the caller’s Mach factor.
public static class PointPerformance {
    const double GravityMps2 = 9.80665;

    public static double AeroMaxG(double massKg, AircraftParams air, double q) {
        double weightN = massKg * GravityMps2;
        if (weightN <= 0.0) return 0.0;
        return q * air.WingAreaM2 * air.CLMax / weightN;
    }

    /// Solve CD0 + k·CL² = T/(q·S) for CL, then n = q·S·CL/W. Returns &lt; 1 when thrust is
    /// insufficient to sustain 1 G of polar drag (caller may treat that as energy bleed).
    public static double SustainedG(double massKg, AircraftParams air, double q, double thrustN) {
        double qS = q * air.WingAreaM2;
        if (qS < 1e-6 || massKg <= 0.0 || air.InducedK <= 0.0) return 0.0;
        double cdAvail = thrustN / qS;
        double cl2 = (cdAvail - air.CD0) / air.InducedK;
        if (cl2 <= 0.0) return 0.0;
        double cl = Math.Sqrt(cl2);
        double aero = AeroMaxG(massKg, air, q);
        double n = cl * qS / (massKg * GravityMps2);
        if (aero > 0.0) n = Math.Min(n, aero);
        return n;
    }

    public static double SpecificExcessPowerMps(
        double massKg, double thrustN, double dragN, double speedMps) {
        if (massKg <= 0.0) return 0.0;
        return speedMps * (thrustN - dragN) / (massKg * GravityMps2);
    }

    public static double MaxClimbGammaDeg(double thrustN, double dragN, double weightN) {
        if (weightN <= 0.0) return 0.0;
        double ratio = (thrustN - dragN) / weightN;
        if (ratio >= 1.0) return 90.0;
        if (ratio <= -1.0) return -90.0;
        return Math.Asin(ratio) * (180.0 / Math.PI);
    }

    public static double LevelDragN(AircraftParams air, double q, double cl,
        double machDragFactor = 1.0) {
        double cd = air.CD0 * machDragFactor + air.InducedK * cl * cl;
        return cd * q * air.WingAreaM2;
    }

    public static double CornerSpeedMps(double massKg, AircraftParams air, double densityKgM3) {
        if (densityKgM3 <= 0.0 || air.WingAreaM2 <= 0.0 || air.CLMax <= 0.0) return 0.0;
        // Corner where aero-max G meets a typical structural 9 G is not required here —
        // return the 1 G stall-ish speed √(2W/(ρ S CLMax)) as the lower corner-band bound.
        double weightN = massKg * GravityMps2;
        return Math.Sqrt(2.0 * weightN / (densityKgM3 * air.WingAreaM2 * air.CLMax));
    }
}
