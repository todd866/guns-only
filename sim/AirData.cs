namespace GunsOnly.Sim;

/// <summary>
/// Pilot-facing air-data conversions. The flight model integrates true velocity relative to the
/// local air mass; these helpers turn the local static state and pitot pressure into EAS, CAS/IAS,
/// Mach, and the matching CLmax boundaries. IAS presently equals ideal CAS: instrument and
/// airframe position-error cards belong in the aircraft profile, not in the atmosphere model.
/// </summary>
public static class AirData {
    public const double SeaLevelDensityKgM3 = Atmosphere.SeaLevelDensityKgM3;
    public const double MpsToKnots = 1.94384;
    const double Gamma = Atmosphere.RatioOfSpecificHeats;
    const double GammaMinusOneOverTwo = (Gamma - 1.0) / 2.0;
    const double GammaOverGammaMinusOne = Gamma / (Gamma - 1.0);
    const double TwoOverGammaMinusOne = 2.0 / (Gamma - 1.0);

    /// <summary>
    /// Equivalent airspeed preserves aerodynamic dynamic pressure:
    /// EAS = TAS * sqrt(rho / rho0). It is useful to flight physics, but it is not what the
    /// compressible pitot/static indicator shows at altitude.
    /// </summary>
    public static double EquivalentAirspeedMps(double trueAirspeedMps, double altitudeM,
        IAtmosphereModel? atmosphere = null) {
        ValidateNonNegativeFinite(trueAirspeedMps, nameof(trueAirspeedMps));
        AtmosphericState state = Sample(atmosphere, altitudeM);
        return trueAirspeedMps * Math.Sqrt(state.DensityKgM3 / SeaLevelDensityKgM3);
    }

    public static double TrueDynamicPressurePa(double trueAirspeedMps, double altitudeM,
        IAtmosphereModel? atmosphere = null) {
        ValidateNonNegativeFinite(trueAirspeedMps, nameof(trueAirspeedMps));
        AtmosphericState state = Sample(atmosphere, altitudeM);
        return 0.5 * state.DensityKgM3
            * trueAirspeedMps * trueAirspeedMps;
    }

    public static double EquivalentDynamicPressurePa(double equivalentAirspeedMps) {
        ValidateNonNegativeFinite(equivalentAirspeedMps, nameof(equivalentAirspeedMps));
        return 0.5 * SeaLevelDensityKgM3
            * equivalentAirspeedMps * equivalentAirspeedMps;
    }

    /// <summary>Local Mach number from TAS and the scenario's thermodynamic state.</summary>
    public static double MachNumber(double trueAirspeedMps, double altitudeM,
        IAtmosphereModel? atmosphere = null) {
        ValidateNonNegativeFinite(trueAirspeedMps, nameof(trueAirspeedMps));
        AtmosphericState state = Sample(atmosphere, altitudeM);
        return trueAirspeedMps / state.SpeedOfSoundMps;
    }

    /// <summary>
    /// Ideal pitot impact pressure qc = pt - ps. The subsonic branch is the isentropic relation;
    /// the supersonic branch is the Rayleigh pitot relation across the detached normal shock.
    /// </summary>
    public static double ImpactPressurePa(double trueAirspeedMps, double altitudeM,
        IAtmosphereModel? atmosphere = null) {
        ValidateNonNegativeFinite(trueAirspeedMps, nameof(trueAirspeedMps));
        AtmosphericState state = Sample(atmosphere, altitudeM);
        double mach = trueAirspeedMps / state.SpeedOfSoundMps;
        return state.PressurePa * ImpactPressureRatio(mach);
    }

    /// <summary>
    /// Calibrated airspeed: the sea-level-standard speed which produces the measured ideal pitot
    /// impact pressure. This includes compressibility and therefore diverges from EAS with Mach.
    /// </summary>
    public static double CalibratedAirspeedMps(double trueAirspeedMps, double altitudeM,
        IAtmosphereModel? atmosphere = null) {
        double impactPressurePa = ImpactPressurePa(trueAirspeedMps, altitudeM, atmosphere);
        return CalibratedAirspeedFromImpactPressureMps(impactPressurePa);
    }

    /// <summary>
    /// Indicated airspeed before an aircraft-specific instrument/position-error card is applied.
    /// Keeping this explicit prevents groundspeed or TAS from leaking onto the primary tape.
    /// </summary>
    public static double IndicatedAirspeedMps(double trueAirspeedMps, double altitudeM,
        IAtmosphereModel? atmosphere = null) =>
        CalibratedAirspeedMps(trueAirspeedMps, altitudeM, atmosphere);

    public static double CalibratedAirspeedFromImpactPressureMps(double impactPressurePa) {
        ValidateNonNegativeFinite(impactPressurePa, nameof(impactPressurePa));
        double normalizedImpact = impactPressurePa / Atmosphere.SeaLevelPressurePa;
        double calibratedMach = MachFromImpactPressureRatio(normalizedImpact);
        return calibratedMach * Atmosphere.SeaLevelSpeedOfSoundMps;
    }

    /// <summary>
    /// Inverse pitot/static solution. Useful for trim targets and tests: a fixed IAS requires more
    /// TAS as static pressure and density fall with height.
    /// </summary>
    public static double TrueAirspeedForCalibratedAirspeedMps(double calibratedAirspeedMps,
        double altitudeM, IAtmosphereModel? atmosphere = null) {
        ValidateNonNegativeFinite(calibratedAirspeedMps, nameof(calibratedAirspeedMps));
        AtmosphericState state = Sample(atmosphere, altitudeM);
        double seaLevelMach = calibratedAirspeedMps / Atmosphere.SeaLevelSpeedOfSoundMps;
        double impactPressurePa = Atmosphere.SeaLevelPressurePa
            * ImpactPressureRatio(seaLevelMach);
        double localMach = MachFromImpactPressureRatio(impactPressurePa / state.PressurePa);
        return localMach * state.SpeedOfSoundMps;
    }

    /// <summary>The positive load available at CLmax for the supplied local TAS/altitude.</summary>
    public static double PositiveLiftLimitG(double trueAirspeedMps, double altitudeM,
        double massKg, AircraftParams parameters) {
        ArgumentNullException.ThrowIfNull(parameters);
        ValidatePositiveFinite(massKg, nameof(massKg));
        return TrueDynamicPressurePa(trueAirspeedMps, altitudeM)
            * parameters.WingAreaM2 * parameters.CLMax
            / (massKg * FlightModel.G0);
    }

    /// <summary>
    /// The KEAS at which q*S*CLmax equals the requested positive load. Retained as the
    /// altitude-independent aerodynamic boundary; use StallSpeedKiasAtAltitude for an IAS tape.
    /// </summary>
    public static double StallSpeedKias(double massKg, AircraftParams parameters,
        double positiveLoadFactor = 1.0) {
        return StallSpeedKias(massKg, parameters, positiveLoadFactor,
            liftCoefficientIncrement: 0.0);
    }

    public static double StallSpeedKias(double massKg, AircraftParams parameters,
        double positiveLoadFactor, double liftCoefficientIncrement) {
        ArgumentNullException.ThrowIfNull(parameters);
        ValidatePositiveFinite(massKg, nameof(massKg));
        ValidatePositiveFinite(parameters.WingAreaM2, nameof(parameters.WingAreaM2));
        double configuredClMax = parameters.CLMax + liftCoefficientIncrement;
        ValidatePositiveFinite(configuredClMax, nameof(liftCoefficientIncrement));
        ValidatePositiveFinite(positiveLoadFactor, nameof(positiveLoadFactor));

        double equivalentAirspeedMps = Math.Sqrt(
            2.0 * massKg * FlightModel.G0 * positiveLoadFactor
            / (SeaLevelDensityKgM3 * parameters.WingAreaM2 * configuredClMax));
        return equivalentAirspeedMps * MpsToKnots;
    }

    /// <summary>
    /// Positive-G corner KEAS: CLmax and the airframe structural limit coincide. Use the
    /// altitude-aware overload below when registering a marker against a CAS/IAS tape.
    /// </summary>
    public static double PositiveCornerSpeedKias(double massKg, AircraftParams parameters) {
        ArgumentNullException.ThrowIfNull(parameters);
        return StallSpeedKias(massKg, parameters, parameters.PositiveStructuralLimitG);
    }

    public static double PositiveCornerSpeedKias(double massKg, AircraftParams parameters,
        double liftCoefficientIncrement) {
        ArgumentNullException.ThrowIfNull(parameters);
        return StallSpeedKias(massKg, parameters, parameters.PositiveStructuralLimitG,
            liftCoefficientIncrement);
    }

    /// <summary>
    /// The CAS/IAS indication of the CLmax boundary at the supplied altitude. Aerodynamic lift is
    /// still based on EAS/dynamic pressure; this projects that same boundary through the local
    /// compressible pitot/static system so the cue stays registered to the IAS tape.
    /// </summary>
    public static double StallSpeedKiasAtAltitude(double massKg, AircraftParams parameters,
        double altitudeM, double positiveLoadFactor = 1.0,
        double liftCoefficientIncrement = 0.0, IAtmosphereModel? atmosphere = null) {
        double requiredKeas = StallSpeedKias(massKg, parameters, positiveLoadFactor,
            liftCoefficientIncrement);
        AtmosphericState state = Sample(atmosphere, altitudeM);
        double requiredTasMps = requiredKeas / MpsToKnots
            * Math.Sqrt(SeaLevelDensityKgM3 / state.DensityKgM3);
        return CalibratedAirspeedMps(requiredTasMps, altitudeM, atmosphere) * MpsToKnots;
    }

    public static double PositiveCornerSpeedKiasAtAltitude(double massKg,
        AircraftParams parameters, double altitudeM, double liftCoefficientIncrement = 0.0,
        IAtmosphereModel? atmosphere = null) {
        ArgumentNullException.ThrowIfNull(parameters);
        return StallSpeedKiasAtAltitude(massKg, parameters, altitudeM,
            parameters.PositiveStructuralLimitG, liftCoefficientIncrement, atmosphere);
    }

    /// Corner is a band, not a point: edges are where instantaneous turn rate falls to this
    /// fraction of its peak. 0.95 keeps the strip narrow enough to remain a commitment.
    public const double CornerBandTurnRateFraction = 0.95;
    // Fixed deterministic TAS grid (60..420 m/s, 2 m/s step): identical inputs must always yield
    // bit-identical band edges, and the span comfortably brackets every simulated airframe's
    // corner so grid clipping cannot silently truncate an honest edge.
    const double CornerBandGridMinTasMps = 60.0;
    const double CornerBandGridMaxTasMps = 420.0;
    const double CornerBandGridStepTasMps = 2.0;

    /// <summary>
    /// The CAS/IAS band within which instantaneous turn rate holds at or above
    /// <see cref="CornerBandTurnRateFraction"/> of its peak: omega(v) = g*sqrt(n(v)^2-1)/v with
    /// n(v) = min(structural limit, q*S*CLmax/(m*g)), sampled on the fixed TAS grid above and
    /// projected through the same compressible pitot/static solution as the corner marker so the
    /// band registers against the primary airspeed tape.
    /// </summary>
    public static (double MinKias, double MaxKias) PositiveCornerBandKiasAtAltitude(
        double massKg, AircraftParams parameters, double altitudeM,
        double liftCoefficientIncrement = 0.0, IAtmosphereModel? atmosphere = null) {
        ArgumentNullException.ThrowIfNull(parameters);
        ValidatePositiveFinite(massKg, nameof(massKg));
        ValidatePositiveFinite(parameters.WingAreaM2, nameof(parameters.WingAreaM2));
        double configuredClMax = parameters.CLMax + liftCoefficientIncrement;
        ValidatePositiveFinite(configuredClMax, nameof(liftCoefficientIncrement));
        double structuralLimitG = parameters.PositiveStructuralLimitG;
        ValidatePositiveFinite(structuralLimitG,
            nameof(parameters.PositiveStructuralLimitG));

        // One shared quadratic coefficient (n_aero = coefficient * v^2) keeps the grid sweep
        // allocation-free and cheap enough to recompute on every snapshot build as mass changes.
        AtmosphericState state = Sample(atmosphere, altitudeM);
        double aerodynamicLoadPerTasSquared = 0.5 * state.DensityKgM3
            * parameters.WingAreaM2 * configuredClMax / (massKg * FlightModel.G0);

        const int sampleCount = (int)((CornerBandGridMaxTasMps - CornerBandGridMinTasMps)
            / CornerBandGridStepTasMps) + 1;
        Span<double> turnRates = stackalloc double[sampleCount];
        double peakTurnRate = 0.0;
        for (int i = 0; i < sampleCount; i++) {
            double tas = CornerBandGridMinTasMps + i * CornerBandGridStepTasMps;
            double load = Math.Min(structuralLimitG,
                aerodynamicLoadPerTasSquared * tas * tas);
            double rate = load > 1.0
                ? FlightModel.G0 * Math.Sqrt(load * load - 1.0) / tas : 0.0;
            turnRates[i] = rate;
            if (rate > peakTurnRate) peakTurnRate = rate;
        }

        if (peakTurnRate <= 0.0) {
            // No sampled grid speed can pull above 1 G at this mass/altitude. The band honestly
            // degenerates onto the analytic corner marker instead of inventing a range.
            double corner = PositiveCornerSpeedKiasAtAltitude(massKg, parameters, altitudeM,
                liftCoefficientIncrement, atmosphere);
            return (corner, corner);
        }

        // omega(v) is unimodal under min(structural, quadratic), so the threshold region is one
        // contiguous run; scanning from both ends cannot skip a disconnected pocket.
        double threshold = CornerBandTurnRateFraction * peakTurnRate;
        int first = 0;
        while (turnRates[first] < threshold) first++;
        int last = sampleCount - 1;
        while (turnRates[last] < threshold) last--;

        // Linear interpolation of the threshold crossing keeps band edges from stepping in whole
        // 2 m/s grid quanta as fuel burns off; the interpolant is as deterministic as the grid.
        double minTas = CornerBandGridMinTasMps + first * CornerBandGridStepTasMps;
        if (first > 0) {
            double atEdge = turnRates[first];
            double below = turnRates[first - 1];
            minTas -= CornerBandGridStepTasMps * (atEdge - threshold) / (atEdge - below);
        }
        double maxTas = CornerBandGridMinTasMps + last * CornerBandGridStepTasMps;
        if (last < sampleCount - 1) {
            double atEdge = turnRates[last];
            double above = turnRates[last + 1];
            maxTas += CornerBandGridStepTasMps * (atEdge - threshold) / (atEdge - above);
        }

        return (CalibratedAirspeedMps(minTas, altitudeM, atmosphere) * MpsToKnots,
            CalibratedAirspeedMps(maxTas, altitudeM, atmosphere) * MpsToKnots);
    }

    static double ImpactPressureRatio(double mach) {
        ValidateNonNegativeFinite(mach, nameof(mach));
        if (mach <= 1.0)
            return Math.Pow(1.0 + GammaMinusOneOverTwo * mach * mach,
                GammaOverGammaMinusOne) - 1.0;

        // Rayleigh pitot formula, NASA SP-3082 eq. 21 / normal-shock total pressure.
        double machSquared = mach * mach;
        double first = (Gamma + 1.0) * (Gamma + 1.0) * machSquared
            / (4.0 * Gamma * machSquared - 2.0 * (Gamma - 1.0));
        double second = (1.0 - Gamma + 2.0 * Gamma * machSquared) / (Gamma + 1.0);
        return Math.Pow(first, GammaOverGammaMinusOne) * second - 1.0;
    }

    static double MachFromImpactPressureRatio(double normalizedImpact) {
        ValidateNonNegativeFinite(normalizedImpact, nameof(normalizedImpact));
        double sonicImpact = ImpactPressureRatio(1.0);
        if (normalizedImpact <= sonicImpact)
            return Math.Sqrt(TwoOverGammaMinusOne
                * (Math.Pow(normalizedImpact + 1.0, 1.0 / GammaOverGammaMinusOne) - 1.0));

        // Eighty bisections is deterministic and comfortably below floating-point resolution.
        double low = 1.0, high = 2.0;
        while (ImpactPressureRatio(high) < normalizedImpact && high < 64.0) high *= 2.0;
        if (high >= 64.0 && ImpactPressureRatio(high) < normalizedImpact)
            throw new ArgumentOutOfRangeException(nameof(normalizedImpact));
        for (int i = 0; i < 80; i++) {
            double middle = 0.5 * (low + high);
            if (ImpactPressureRatio(middle) < normalizedImpact) low = middle;
            else high = middle;
        }
        return 0.5 * (low + high);
    }

    static AtmosphericState Sample(IAtmosphereModel? atmosphere, double altitudeM) {
        if (!double.IsFinite(altitudeM))
            throw new ArgumentOutOfRangeException(nameof(altitudeM));
        AtmosphericState state = (atmosphere ?? StandardAtmosphere1976.Instance).Sample(altitudeM);
        if (!double.IsFinite(state.TemperatureK) || state.TemperatureK <= 0.0
            || !double.IsFinite(state.PressurePa) || state.PressurePa <= 0.0
            || !double.IsFinite(state.DensityKgM3) || state.DensityKgM3 <= 0.0
            || !double.IsFinite(state.SpeedOfSoundMps) || state.SpeedOfSoundMps <= 0.0)
            throw new InvalidOperationException("atmosphere returned a non-physical state");
        return state;
    }

    static void ValidateNonNegativeFinite(double value, string parameterName) {
        if (!double.IsFinite(value) || value < 0.0)
            throw new ArgumentOutOfRangeException(parameterName);
    }

    static void ValidatePositiveFinite(double value, string parameterName) {
        if (!double.IsFinite(value) || value <= 0.0)
            throw new ArgumentOutOfRangeException(parameterName);
    }
}
