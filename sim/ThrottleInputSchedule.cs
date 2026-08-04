namespace GunsOnly.Sim;

/// <summary>
/// Speed- and lever-scheduled relative throttle sensitivity for manual holds and taps.
/// Physical lever→thrust remains linear; this only changes how quickly relative inputs
/// (keyboard W/S, mobile rocker, virtual-stick integrator) walk the lever. Absolute lever
/// position commands stay 1:1. Epistemic: gameplay surrogate for usable finals resolution.
/// </summary>
public static class ThrottleInputSchedule {
    public const double CoarseHoldRatePerSecond = 0.70;
    public const double FineHoldRatePerSecond = 0.16;
    public const double CoarseTapStep = 0.15;
    public const double FineTapStep = 0.02;

    /// <summary>Below this CAS, approach-band precision is fully available at low lever.</summary>
    public const double FineCasKts = 180.0;
    /// <summary>At or above this CAS, relative throttle uses the fight (coarse) rate.</summary>
    public const double CoarseCasKts = 300.0;
    // The lever band is absolute PLA, calibrated to the F-22's approach trim (~0.08).
    // Airframes whose approach trim straddles the coarse floor — the Sabre trims on-speed
    // at 0.28-0.38 — get little or no fine band, so the feature is largely inert for the
    // aircraft with the hardest recoveries. Keying the band off DetentLayer's
    // ApproachTrimThrottle would be airframe-agnostic; noted 2026-08-04, not yet done.
    /// <summary>At or below this physical lever, low-speed fine gain applies.</summary>
    public const double FineLeverCeiling = 0.20;
    /// <summary>At or above this physical lever, relative inputs stay coarse even when slow.</summary>
    public const double CoarseLeverFloor = 0.35;

    /// <summary>
    /// 1 = full fine (slow/low lever), 0 = full coarse (fast or high lever).
    /// Speed and lever each contribute; the lesser fine demand wins so a go-around slam
    /// at low IAS stays snappy once the lever is already out of the approach band.
    /// </summary>
    public static double FineBlend(double indicatedAirspeedKts, double physicalLever) {
        if (!double.IsFinite(indicatedAirspeedKts) || !double.IsFinite(physicalLever))
            return 0.0;
        double speedFine = 1.0 - Smoothstep(
            FineCasKts, CoarseCasKts, System.Math.Max(0.0, indicatedAirspeedKts));
        double leverFine = 1.0 - Smoothstep(
            FineLeverCeiling, CoarseLeverFloor, System.Math.Max(0.0, physicalLever));
        return System.Math.Clamp(System.Math.Min(speedFine, leverFine), 0.0, 1.0);
    }

    public static double HoldRatePerSecond(double indicatedAirspeedKts, double physicalLever) {
        double fine = FineBlend(indicatedAirspeedKts, physicalLever);
        return CoarseHoldRatePerSecond
            + (FineHoldRatePerSecond - CoarseHoldRatePerSecond) * fine;
    }

    public static double TapStep(double indicatedAirspeedKts, double physicalLever) {
        double fine = FineBlend(indicatedAirspeedKts, physicalLever);
        return CoarseTapStep + (FineTapStep - CoarseTapStep) * fine;
    }

    static double Smoothstep(double edge0, double edge1, double x) {
        if (!(edge1 > edge0)) return x >= edge1 ? 1.0 : 0.0;
        double t = System.Math.Clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
        return t * t * (3.0 - 2.0 * t);
    }
}
