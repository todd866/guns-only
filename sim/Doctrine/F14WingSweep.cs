namespace GunsOnly.Sim.Doctrine;

public enum F14WingSweepMode {
    None = 0,
    Auto = 1,
    Manual = 2,
}

/// F-14A swing-wing schedule surrogate. Epistemic: surrogate — open envelope anchors only
/// (20° forward / 68° aft per Navy museum and Jane's summaries), not AWG-9 wing-sweep logic.
public static class F14WingSweep
{
    public const double MinSweepDeg = 20.0;
    public const double MaxSweepDeg = 68.0;
    // PROVISIONAL cockpit-control feel: a held manual command traverses the 48 degree operating
    // range in four seconds. It is a bounded presentation/aero authority rate, not an OEM actuator
    // qualification claim.
    public const double ManualRateDegPerSecond = 12.0;

    static readonly (double Mach, double SweepDeg)[] MachBreakpoints =
    {
        (0.0, MinSweepDeg),
        (0.4, MinSweepDeg),
        (0.6, 28.0),
        (0.8, 38.0),
        (1.0, 52.0),
        (1.2, 62.0),
        (1.4, MaxSweepDeg),
    };

    static readonly (double CasKts, double SweepDeg)[] CasBreakpoints =
    {
        (150.0, MinSweepDeg),
        (300.0, 24.0),
        (400.0, 42.0),
        (500.0, 58.0),
        (600.0, MaxSweepDeg),
    };

    public static double DegreesFor(double mach, double casKts)
    {
        double machSweep = InterpolateMach(Math.Max(0.0, mach));
        double casSweep = InterpolateCas(Math.Max(0.0, casKts));
        return Math.Clamp(Math.Max(machSweep, casSweep), MinSweepDeg, MaxSweepDeg);
    }

    static double InterpolateMach(double mach)
    {
        if (mach <= MachBreakpoints[0].Mach) return MachBreakpoints[0].SweepDeg;
        for (int i = 1; i < MachBreakpoints.Length; i++)
        {
            (double x0, double y0) = MachBreakpoints[i - 1];
            (double x1, double y1) = MachBreakpoints[i];
            if (mach > x1) continue;
            double t = (mach - x0) / Math.Max(x1 - x0, 1e-9);
            return y0 + t * (y1 - y0);
        }
        return MachBreakpoints[^1].SweepDeg;
    }

    static double InterpolateCas(double casKts)
    {
        if (casKts <= CasBreakpoints[0].CasKts) return CasBreakpoints[0].SweepDeg;
        for (int i = 1; i < CasBreakpoints.Length; i++)
        {
            (double x0, double y0) = CasBreakpoints[i - 1];
            (double x1, double y1) = CasBreakpoints[i];
            if (casKts > x1) continue;
            double t = (casKts - x0) / Math.Max(x1 - x0, 1e-9);
            return y0 + t * (y1 - y0);
        }
        return CasBreakpoints[^1].SweepDeg;
    }
}
