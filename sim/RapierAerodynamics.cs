namespace GunsOnly.Sim;

/// <summary>
/// Rapier v2 aerodynamic contract: shape-derived geometry plus explicit reduced-order control and
/// inlet schedules. Pure functions and constants — no session or global state.
///
/// The flight model, installed-inlet model, systems, snapshots and pilot indications consume this
/// module. Its purpose is to keep distinctions that were previously buried in mesh/params comments
/// callable and testable (reference S vs rendered solid planform, normal-law α vs physical CLmax,
/// control-effectiveness Mach fade, and the inlet flow-angle surrogate).
/// </summary>
public static class RapierAerodynamics {
    // --- Canonical v2 shape-derived geometry (airframes/rapier.v2.json) ---

    /// <summary>Aerodynamic reference area S used for lift/drag and moment non-dimensionalising.</summary>
    public static double ReferenceAreaM2 => RapierV2Design.ReferenceAreaM2;

    /// <summary>Tip-to-tip span b; planform tips at ±3.675 m.</summary>
    public static double SpanM => RapierV2Design.SpanM;

    /// <summary>
    /// Aspect ratio b²/S derived from the same planform used by the renderer.
    /// </summary>
    public static double AspectRatio => RapierV2Design.AspectRatio;

    /// <summary>
    /// Compatibility name for the closed planform area. V2 deliberately uses this canonical solid
    /// planform as aerodynamic S; there is no second hand-authored 18 m2 reference wing.
    /// </summary>
    public static double RenderedSolidPlanformAreaM2 => RapierV2Design.ReferenceAreaM2;

    /// <summary>
    /// V2 eliminated the old 6.3 m2 render/physics discrepancy. Kept only for recorded-client and
    /// test compatibility; a nonzero value would mean the single-shape contract had regressed.
    /// </summary>
    public static double BodyOverlapNonReferenceAreaM2 =>
        RenderedSolidPlanformAreaM2 - ReferenceAreaM2;

    /// <summary>Area-weighted mean aerodynamic chord from the canonical cranked planform.</summary>
    public static double MeanReferenceChordM => RapierV2Design.MeanAerodynamicChordM;

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
    public static double RamRegimeStartMach => RapierV2Design.InletRamRegimeStartMach;

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
    /// Equivalent-airspeed form of the canonical 55 kPa maximum-q requirement.
    /// </summary>
    public static double NeverExceedKias =>
        System.Math.Sqrt(2.0 * HighDynamicPressurePlacardPa / Rho0KgM3) / MpsPerKnot;

    /// Last Mach passing every canonical propulsion, q and thermal screen at design altitude.
    public static double MaximumOperatingMach => RapierV2Design.MaximumScreenedMach;

    const double Rho0KgM3 = 1.225;
    const double MpsPerKnot = 1.0 / 1.94384;

    /// <summary>
    /// The Vmo placard restated as dynamic pressure, because q and equivalent airspeed are the
    /// same statement: q = 0.5 · rho0 · V_E². Kept so the existing q-based cues and the recovery
    /// corridor keep working, but it is now a consequence of the placard rather than its source.
    /// </summary>
    public static double HighDynamicPressurePlacardPa =>
        RapierV2Design.MaximumDynamicPressurePa;

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
    /// Installed inlet flow-axis incidence from the canonical exterior. Body alpha equal to this
    /// angle is on-design; recovery and unstart respond only to deviation plus sideslip.
    /// </summary>
    public static double InletDesignFlowIncidenceRad =>
        RapierV2Design.InletDesignFlowIncidenceRad;

    /// <summary>Combined off-design flow-angle magnitude used by recovery and unstart.</summary>
    public static double InletFlowAngleRad(double alphaRad, double betaRad) {
        double alpha = double.IsFinite(alphaRad) ? alphaRad : 0.0;
        double beta = double.IsFinite(betaRad) ? betaRad : 0.0;
        double alphaDeviation = alpha - InletDesignFlowIncidenceRad;
        return System.Math.Sqrt(alphaDeviation * alphaDeviation + beta * beta);
    }

    /// <summary>
    /// Sticky unstart seed above ram regime. Compatibility property names retain "FlowAngle", but
    /// both thresholds are deviations from installed incidence: trip near ~7°, clear below ~2.3°.
    /// Epistemic: provisional surrogate inspired by mixed-compression incidence envelopes — not OEM.
    /// </summary>
    public static double InletUnstartTripFlowAngleRad =>
        RapierV2Design.InletUnstartTripDeviationRad;
    public static double InletUnstartClearFlowAngleRad =>
        RapierV2Design.InletUnstartClearDeviationRad;
    public static double InletUnstartRecoveryFloor => RapierV2Design.InletUnstartRecoveryFloor;

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
    /// Inlet flow-recovery surrogate from Mach and combined off-design incidence
    /// √((α−α_inlet)²+β²). Returns 1 below <see cref="RamRegimeStartMach"/>. At/above ram regime,
    /// body alpha aligned to the installed inlet stays at one; deviation degrades recovery
    /// continuously, with stronger sensitivity as Mach rises.
    /// Explicitly <em>not</em> an OEM inlet map — a transparent stand-in for later deck data.
    /// </summary>
    public static double InletFlowRecovery(double mach, double alphaRad, double betaRad) {
        if (!double.IsFinite(mach) || mach <= RamRegimeStartMach)
            return 1.0;

        double flowAngleRad = InletFlowAngleRad(alphaRad, betaRad);
        if (flowAngleRad <= 0.0)
            return 1.0;

        // Characteristic angle shrinks with Mach excess so the same geometric off-design hurts more
        // deep in the ram envelope. Floor keeps the law continuous and non-singular.
        double machExcess = mach - RamRegimeStartMach;
        double characteristicAngleRad = System.Math.Max(
            RapierV2Design.InletMinimumCharacteristicAngleRad,
            RapierV2Design.InletCharacteristicAngleAtRamStartRad
                - RapierV2Design.InletCharacteristicAngleDecreaseRadPerMach * machExcess);
        double ratio = flowAngleRad / characteristicAngleRad;
        double offDesignRecovery = 1.0 / (1.0 + ratio * ratio);
        // A half-Mach onset avoids teleporting inlet pressure recovery at the first ramjet tick.
        double onset = SmoothStep(System.Math.Clamp(
            (mach - RamRegimeStartMach) / RapierV2Design.InletRecoveryOnsetBlendMach,
            0.0, 1.0));
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
