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
    /// Minimum normal-law α (radians) for approximately <paramref name="loadFactor"/> g of level
    /// flight at the current mass and dynamic pressure. Returns 0 when q or CL_α is unusable so
    /// the Mach schedule remains the sole ceiling.
    /// </summary>
    public static double LevelFlightAlphaFloorRad(
        double massKg, double dynamicPressurePa, double clAlphaPerRad, double loadFactor = 1.05) {
        if (!double.IsFinite(massKg) || massKg <= 0.0) return 0.0;
        if (!double.IsFinite(dynamicPressurePa) || dynamicPressurePa <= 1.0) return 0.0;
        if (!double.IsFinite(clAlphaPerRad) || clAlphaPerRad <= 1e-6) return 0.0;
        if (!double.IsFinite(loadFactor) || loadFactor <= 0.0) loadFactor = 1.0;
        const double g0 = 9.80665;
        double clNeeded = loadFactor * massKg * g0
            / (dynamicPressurePa * ReferenceAreaM2);
        return System.Math.Max(0.0, clNeeded / clAlphaPerRad);
    }

    /// <summary>
    /// Vmo — never-exceed indicated airspeed, in knots.
    ///
    /// DERIVED, not authored. This replaces an 80 kPa figure whose recorded provenance was
    /// literally "authored placard, provisional" and which nothing in the structure supported.
    /// 80 kPa is 703 KEAS, a fighter's placard on an aircraft whose entire design case is thin
    /// air; the SR-71, which is the closest real analogue in mission and wing loading, lived at
    /// 500 KEAS.
    ///
    /// 550 KIAS is the corner of this aircraft's own V-n diagram: the speed at which the CLmax
    /// boundary meets the +12 G structural boundary at max gross.
    ///
    ///     V_A = sqrt(2 · n · W / (rho0 · S · CLmax))
    ///         = sqrt(2 · 12 · 108,760 / (1.225 · 18.0 · 1.47))  =  284 m/s EAS  =  552 KEAS
    ///
    /// Below it the wing stalls before the structure yields, so the aeroplane cannot hurt itself.
    /// Above it the wing can generate more than the airframe is built to carry, and only the FBW
    /// limiter stands between the stick and the spar. That is exactly what a never-exceed speed
    /// is for, and here it is a consequence of numbers already closed -- span, area, CLmax and
    /// the 12 G limit -- rather than a number someone liked.
    ///
    /// Two cross-checks, both of which the 80 kPa figure failed:
    ///
    ///   Gust. Mass ratio is 114 at 616 kg/m2, so the alleviation factor is 0.84 and a 25 ft/s
    ///   discrete gust at 550 KEAS adds 0.66 G. Gust does not bind until roughly 9,100 KEAS. A
    ///   wing this heavily loaded is nearly gust-proof, so manoeuvre owns the envelope alone.
    ///
    ///   Crossover. 550 KIAS and Mmo 4.0 cross at FL710, and the authored design cruise altitude
    ///   is 21,500 m -- FL705. The aeroplane cruises AT the corner where the IAS limit hands over
    ///   to the Mach limit, which is how a high-Mach cruiser is supposed to be laid out and is
    ///   not something that would fall out by accident from an invented number.
    ///
    /// Still unsized, and the honest residual: flutter, control-surface hinge moments and inlet
    /// duct pressure. Any of the three could come back lower. None of them can be computed from
    /// what the structure chapter currently holds, which says "primary structure (provisional)".
    /// </summary>
    public const double NeverExceedKias = 550.0;

    /// Mmo. The design dash; the CMC screens to about M5.4, so this is an airframe/inlet number.
    public const double MaximumOperatingMach = 4.0;

    const double Rho0KgM3 = 1.225;
    const double MpsPerKnot = 1.0 / 1.94384;

    /// <summary>
    /// The Vmo placard restated as dynamic pressure, because q and equivalent airspeed are the
    /// same statement: q = 0.5 · rho0 · V_E². Kept so the existing q-based cues and the recovery
    /// corridor keep working, but it is now a consequence of the placard rather than its source.
    /// </summary>
    public const double HighDynamicPressurePlacardPa =
        0.5 * Rho0KgM3 * (NeverExceedKias * MpsPerKnot) * (NeverExceedKias * MpsPerKnot);

    public static bool IsOverDynamicPressure(double dynamicPressurePa) =>
        double.IsFinite(dynamicPressurePa) && dynamicPressurePa > HighDynamicPressurePlacardPa;

    /// <summary>
    /// Highest Mach the q placard allows in this air. The inverse of the placard check above:
    /// that one says "you have broken it", this one says how fast you may go before you do, which
    /// is the form guidance and automation actually need.
    /// </summary>
    public static double MachLimitForDynamicPressure(
        double densityKgM3, double speedOfSoundMps) {
        if (!double.IsFinite(densityKgM3) || densityKgM3 <= 0.0
            || !double.IsFinite(speedOfSoundMps) || speedOfSoundMps <= 0.0)
            return double.PositiveInfinity;
        return System.Math.Sqrt(2.0 * HighDynamicPressurePlacardPa / densityKgM3)
            / speedOfSoundMps;
    }

    /// <summary>
    /// Combined flow-angle magnitude used by the inlet recovery / unstart surrogates.
    /// </summary>
    public static double InletFlowAngleRad(double alphaRad, double betaRad) {
        double alpha = double.IsFinite(alphaRad) ? alphaRad : 0.0;
        double beta = double.IsFinite(betaRad) ? betaRad : 0.0;
        return System.Math.Sqrt(alpha * alpha + beta * beta);
    }

    /// <summary>
    /// Sticky unstart seed above ram regime. Trip near ~7° combined flow angle; clear below ~2.3°.
    /// Epistemic: provisional surrogate inspired by mixed-compression incidence envelopes — not OEM.
    /// </summary>
    public const double InletUnstartTripFlowAngleRad = 0.12;
    public const double InletUnstartClearFlowAngleRad = 0.04;
    public const double InletUnstartRecoveryFloor = 0.15;

    public static bool NextInletUnstartState(
        double mach, double alphaRad, double betaRad, bool previouslyUnstarted) {
        if (!double.IsFinite(mach) || mach <= RamRegimeStartMach) return false;
        double flow = InletFlowAngleRad(alphaRad, betaRad);
        if (previouslyUnstarted) return flow > InletUnstartClearFlowAngleRad;
        return flow >= InletUnstartTripFlowAngleRad;
    }

    public static double InletFlowRecovery(
        double mach, double alphaRad, double betaRad, bool inletUnstarted) {
        double continuous = InletFlowRecovery(mach, alphaRad, betaRad);
        if (!inletUnstarted) return continuous;
        return System.Math.Min(continuous, InletUnstartRecoveryFloor);
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
