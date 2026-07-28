namespace GunsOnly.Sim;

/// <summary>
/// Explicit Rapier aerodynamic design contract: named geometry, provisional high-speed schedules,
/// and q-scaled control-moment helpers. Pure functions and constants — no session or global state.
///
/// The flight model, installed-inlet model, systems, snapshots and pilot indications consume this
/// module. Its purpose is to keep distinctions that were previously buried in mesh/params comments
/// callable and testable (reference S vs rendered solid planform, normal-law α vs physical CLmax,
/// control-effectiveness Mach fade, and the inlet flow-angle surrogate).
/// </summary>
public static class RapierAerodynamics {
    // --- Closed reference geometry (FlightModel.RapierPublicDataSurrogate + planform shoelace) ---

    /// <summary>Aerodynamic reference area S used for lift/drag and moment non-dimensionalising.</summary>
    public const double ReferenceAreaM2 = 18.0;

    /// <summary>Tip-to-tip span b; planform tips at ±3.675 m.</summary>
    public const double SpanM = 7.35;

    /// <summary>
    /// Aspect ratio b²/S. Exactly 7.35²/18 = 3.00125 — not a rounded "AR 3" comment.
    /// </summary>
    public const double AspectRatio = 3.00125;

    /// <summary>
    /// Solid rendered planform polygon area from the closed <c>wing.planform</c> polyline (shoelace
    /// of the authored vertices). Larger than <see cref="ReferenceAreaM2"/> because the mesh
    /// includes body-carry-through geometry that is not lift reference area.
    /// </summary>
    public const double RenderedSolidPlanformAreaM2 = 24.3173;

    /// <summary>
    /// <see cref="RenderedSolidPlanformAreaM2"/> − <see cref="ReferenceAreaM2"/>. Named
    /// body-overlap / non-reference geometry — do not silently treat this residual as lift area S.
    /// </summary>
    public const double BodyOverlapNonReferenceAreaM2 = 6.3173;

    /// <summary>Mean aerodynamic reference chord ĉ = S/b.</summary>
    public static double MeanReferenceChordM => ReferenceAreaM2 / SpanM;

    // --- Provisional control-moment coefficient maxima (epistemic: provisional surrogates) ---

    /// <summary>Provisional |Cm| ceiling for pitch control capacity about ĉ. Not a wind-tunnel card.</summary>
    public const double ProvisionalPitchControlMomentCoefficientMax = 0.18;

    /// <summary>Provisional |Cn| ceiling for yaw control capacity about b.</summary>
    public const double ProvisionalYawControlMomentCoefficientMax = 0.055;

    /// <summary>Provisional |Cl| ceiling for roll control capacity about b.</summary>
    public const double ProvisionalRollControlMomentCoefficientMax = 0.047;

    /// <summary>
    /// Mach at which the combined-cycle ram duct owns enough flow that off-design incidence can
    /// matter. Aligned with <c>TurboRamjetPerformanceMap.RamFadeStartMach</c>; this schedule is
    /// still an explicit inlet-flow-angle <em>surrogate</em>, not an OEM recovery map.
    /// </summary>
    public const double RamRegimeStartMach = 2.0;

    // Piecewise knots: Mach ascending; values continuous via linear interpolation.
    // Normal-law α is a control-law ceiling for a cranked-delta high-speed article — NOT physical CLmax.
    // Epistemic: provisional. Subsonic anchor matches PostStallAlphaCommandRad (0.42 rad) order.
    static readonly double[] NormalLawAlphaMachKnots = { 0.0, 0.90, 1.05, 1.20, 1.60, 2.00, 2.50, 3.50, 4.50 };
    static readonly double[] NormalLawAlphaRadKnots =
        { 0.42, 0.42, 0.36, 0.30, 0.24, 0.20, 0.16, 0.13, 0.11 };

    // Control effectiveness η: retain 1.0 through subsonic; ~0.5 by Mach 1.65 per NACA RM L52H14
    // (elevon/control power loss through early supersonic); then decline gently.
    // Epistemic: public-theory surrogate schedule, not Rapier hinge-moment data.
    static readonly double[] ControlEffectivenessMachKnots = { 0.0, 1.0, 1.65, 2.50, 3.50, 4.50 };
    static readonly double[] ControlEffectivenessKnots = { 1.0, 1.0, 0.50, 0.36, 0.28, 0.22 };

    /// <summary>
    /// Provisional cranked-delta high-speed <em>normal-law</em> angle-of-attack limit (radians).
    /// Continuous and non-increasing above transonic. This is a control-law schedule, not physical
    /// CLmax / stall incidence.
    /// </summary>
    public static double NormalLawAlphaLimitRad(double mach) {
        if (!double.IsFinite(mach) || mach <= NormalLawAlphaMachKnots[0])
            return NormalLawAlphaRadKnots[0];
        return InterpolateDescendingCapable(mach, NormalLawAlphaMachKnots, NormalLawAlphaRadKnots);
    }

    /// <summary>
    /// Supersonic control-surface effectiveness multiplier. Unity subsonic; about 0.5 by Mach 1.65
    /// (NACA RM L52H14 order); gently declining thereafter. Non-increasing for Mach ≥ 1.
    /// </summary>
    public static double SupersonicControlEffectiveness(double mach) {
        if (!double.IsFinite(mach) || mach <= ControlEffectivenessMachKnots[0])
            return ControlEffectivenessKnots[0];
        return InterpolateDescendingCapable(
            mach, ControlEffectivenessMachKnots, ControlEffectivenessKnots);
    }

    /// <summary>
    /// Inlet flow-recovery surrogate from Mach and combined incidence √(α²+β²). Returns 1 below
    /// <see cref="RamRegimeStartMach"/>. At/above ram regime, on-design (α=β=0) stays 1; off-design
    /// flow angle degrades recovery continuously, with stronger sensitivity as Mach rises.
    /// Explicitly <em>not</em> an OEM inlet map — a transparent stand-in for later deck data.
    /// </summary>
    public static double InletFlowRecovery(double mach, double alphaRad, double betaRad) {
        if (!double.IsFinite(mach) || mach <= RamRegimeStartMach)
            return 1.0;

        double alpha = double.IsFinite(alphaRad) ? alphaRad : 0.0;
        double beta = double.IsFinite(betaRad) ? betaRad : 0.0;
        double flowAngleRad = System.Math.Sqrt(alpha * alpha + beta * beta);
        if (flowAngleRad <= 0.0)
            return 1.0;

        // Characteristic angle shrinks with Mach excess so the same geometric off-design hurts more
        // deep in the ram envelope. Floor keeps the law continuous and non-singular.
        double machExcess = mach - RamRegimeStartMach;
        double characteristicAngleRad = System.Math.Max(0.08, 0.34 - 0.07 * machExcess);
        double ratio = flowAngleRad / characteristicAngleRad;
        double offDesignRecovery = 1.0 / (1.0 + ratio * ratio);
        // A half-Mach onset avoids teleporting inlet pressure recovery at the first ramjet tick.
        double onset = SmoothStep(System.Math.Clamp(
            (mach - RamRegimeStartMach) / 0.5, 0.0, 1.0));
        double recovery = 1.0 - onset * (1.0 - offDesignRecovery);
        return System.Math.Clamp(recovery, 0.0, 1.0);
    }

    /// <summary>
    /// Pitch control-moment capacity (N·m): q · S · ĉ · Cm_max · configurationAuthority.
    /// Zero at zero dynamic pressure. Authority is clamped to [0, 1], and the same explicit Mach
    /// schedule used for the control surfaces reduces the coefficient after transonic flight.
    /// </summary>
    public static double PitchControlMomentCapacityNm(
        double dynamicPressurePa, double configurationAuthority = 1.0, double mach = 0.0) {
        double q = NonNegativeFiniteOrZero(dynamicPressurePa);
        double authority = ClampAuthority(configurationAuthority);
        return q * ReferenceAreaM2 * MeanReferenceChordM
            * ProvisionalPitchControlMomentCoefficientMax * authority
            * SupersonicControlEffectiveness(mach);
    }

    /// <summary>
    /// Yaw control-moment capacity (N·m): q · S · b · Cn_max · configurationAuthority.
    /// </summary>
    public static double YawControlMomentCapacityNm(
        double dynamicPressurePa, double configurationAuthority = 1.0, double mach = 0.0) {
        double q = NonNegativeFiniteOrZero(dynamicPressurePa);
        double authority = ClampAuthority(configurationAuthority);
        return q * ReferenceAreaM2 * SpanM
            * ProvisionalYawControlMomentCoefficientMax * authority
            * SupersonicControlEffectiveness(mach);
    }

    /// <summary>
    /// Roll control-moment capacity (N·m): q · S · b · Cl_max · configurationAuthority.
    /// </summary>
    public static double RollControlMomentCapacityNm(
        double dynamicPressurePa, double configurationAuthority = 1.0, double mach = 0.0) {
        double q = NonNegativeFiniteOrZero(dynamicPressurePa);
        double authority = ClampAuthority(configurationAuthority);
        return q * ReferenceAreaM2 * SpanM
            * ProvisionalRollControlMomentCoefficientMax * authority
            * SupersonicControlEffectiveness(mach);
    }

    static double ClampAuthority(double configurationAuthority) {
        if (!double.IsFinite(configurationAuthority) || configurationAuthority <= 0.0)
            return 0.0;
        return System.Math.Min(configurationAuthority, 1.0);
    }

    static double NonNegativeFiniteOrZero(double value) {
        if (!double.IsFinite(value) || value <= 0.0) return 0.0;
        return value;
    }

    static double SmoothStep(double phase) => phase * phase * (3.0 - 2.0 * phase);

    static double InterpolateDescendingCapable(
        double mach, double[] machKnots, double[] valueKnots) {
        int last = machKnots.Length - 1;
        if (mach >= machKnots[last]) return valueKnots[last];
        for (int i = 0; i < last; i++) {
            double m0 = machKnots[i];
            double m1 = machKnots[i + 1];
            if (mach > m1) continue;
            if (mach <= m0) return valueKnots[i];
            double t = (mach - m0) / (m1 - m0);
            return valueKnots[i] + (valueKnots[i + 1] - valueKnots[i]) * t;
        }
        return valueKnots[last];
    }
}
