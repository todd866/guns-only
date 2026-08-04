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
    // The lever band keys off the airframe's approach trim (DetentLayer's ApproachTrimThrottle)
    // so the fine band travels with the airframe: the F-22 trims finals near 0.08 PLA while the
    // Sabre trims on-speed at 0.28-0.38, and an absolute band calibrated to one is inert for the
    // other. Callers without a trim reference fall back to the F-22-calibrated reference band.
    /// <summary>Approach trim the reference (legacy absolute) band was calibrated on.</summary>
    public const double ReferenceApproachTrimLever = 0.08;
    /// <summary>Fine band ceiling, as lever above the airframe's approach trim.</summary>
    public const double FineLeverCeilingAboveTrim = 0.12;
    /// <summary>Coarse floor, as lever above the airframe's approach trim.</summary>
    public const double CoarseLeverFloorAboveTrim = 0.27;
    /// <summary>At or below this physical lever, low-speed fine gain applies (reference trim).</summary>
    public const double FineLeverCeiling = ReferenceApproachTrimLever + FineLeverCeilingAboveTrim;
    /// <summary>At or above this physical lever, relative inputs stay coarse (reference trim).</summary>
    public const double CoarseLeverFloor = ReferenceApproachTrimLever + CoarseLeverFloorAboveTrim;

    public static double FineBlend(double indicatedAirspeedKts, double physicalLever) =>
        FineBlend(indicatedAirspeedKts, physicalLever, ReferenceApproachTrimLever);

    /// <summary>
    /// 1 = full fine (slow/low lever), 0 = full coarse (fast or high lever).
    /// Speed and lever each contribute; the lesser fine demand wins so a go-around slam
    /// at low IAS stays snappy once the lever is already out of the approach band.
    /// approachTrimLever anchors the lever band; non-finite or non-positive means
    /// "no approach trim known" (DetentLayer publishes 0.0 off the approach) and uses
    /// the reference band, so behaviour away from finals is unchanged.
    /// </summary>
    public static double FineBlend(
        double indicatedAirspeedKts, double physicalLever, double approachTrimLever) {
        if (!double.IsFinite(indicatedAirspeedKts) || !double.IsFinite(physicalLever))
            return 0.0;
        double trim = double.IsFinite(approachTrimLever) && approachTrimLever > 0.0
            ? approachTrimLever
            : ReferenceApproachTrimLever;
        double speedFine = 1.0 - Smoothstep(
            FineCasKts, CoarseCasKts, System.Math.Max(0.0, indicatedAirspeedKts));
        double leverFine = 1.0 - Smoothstep(
            trim + FineLeverCeilingAboveTrim, trim + CoarseLeverFloorAboveTrim,
            System.Math.Max(0.0, physicalLever));
        return System.Math.Clamp(System.Math.Min(speedFine, leverFine), 0.0, 1.0);
    }

    public static double HoldRatePerSecond(double indicatedAirspeedKts, double physicalLever) =>
        HoldRatePerSecond(indicatedAirspeedKts, physicalLever, ReferenceApproachTrimLever);

    public static double HoldRatePerSecond(
        double indicatedAirspeedKts, double physicalLever, double approachTrimLever) {
        double fine = FineBlend(indicatedAirspeedKts, physicalLever, approachTrimLever);
        return CoarseHoldRatePerSecond
            + (FineHoldRatePerSecond - CoarseHoldRatePerSecond) * fine;
    }

    public static double TapStep(double indicatedAirspeedKts, double physicalLever) =>
        TapStep(indicatedAirspeedKts, physicalLever, ReferenceApproachTrimLever);

    public static double TapStep(
        double indicatedAirspeedKts, double physicalLever, double approachTrimLever) {
        double fine = FineBlend(indicatedAirspeedKts, physicalLever, approachTrimLever);
        return CoarseTapStep + (FineTapStep - CoarseTapStep) * fine;
    }

    static double Smoothstep(double edge0, double edge1, double x) {
        if (!(edge1 > edge0)) return x >= edge1 ? 1.0 : 0.0;
        double t = System.Math.Clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
        return t * t * (3.0 - 2.0 * t);
    }
}
