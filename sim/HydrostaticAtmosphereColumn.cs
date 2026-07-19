namespace GunsOnly.Sim;

/// <summary>
/// One measured or scenario-authored temperature point. Geometric altitude is metres above mean
/// sea level and temperature is absolute Kelvin; the explicit unit names are part of the data
/// contract so Celsius soundings cannot be silently mistaken for thermodynamic temperature.
/// </summary>
public readonly record struct TemperatureSoundingPoint(
    double GeometricAltitudeM,
    double TemperatureK);

/// <summary>
/// Immutable, bounded atmospheric column constructed from a piecewise-linear temperature
/// sounding and one static-pressure anchor.
///
/// The thermodynamic basis is the same hydrostatic/ideal-gas basis used by the U.S. Standard
/// Atmosphere 1976 (see NASA/TM-2005-213659 Appendix A): dp/dh = -rho*g and p = rho*R*T.
/// Here the scenario temperature is linear in geometric altitude and standard gravity is held
/// constant, so each layer has an exact analytic pressure solution. This class deliberately does
/// not supply a fictional default weather day; a scenario must provide its measured or designed
/// sounding explicitly.
/// </summary>
public sealed class HydrostaticAtmosphereColumn : IAtmosphereModel {
    readonly TemperatureSoundingPoint[] _levels;
    readonly double[] _integralFromMinimum;
    readonly double _anchorIntegral;

    public double MinimumGeometricAltitudeM => _levels[0].GeometricAltitudeM;
    public double MaximumGeometricAltitudeM => _levels[^1].GeometricAltitudeM;
    public double AnchorGeometricAltitudeM { get; }
    public double AnchorPressurePa { get; }
    public IReadOnlyList<TemperatureSoundingPoint> Levels { get; }

    /// <param name="levels">
    /// At least two strictly increasing geometric-altitude/temperature points. Sampling is
    /// intentionally bounded to the first and last point rather than silently extrapolated.
    /// </param>
    /// <param name="anchorPressurePa">Known static pressure in Pascals at the anchor altitude.</param>
    /// <param name="anchorGeometricAltitudeM">
    /// Geometric altitude in metres of the pressure observation; sea level is the default.
    /// </param>
    public HydrostaticAtmosphereColumn(
        IEnumerable<TemperatureSoundingPoint> levels,
        double anchorPressurePa = Atmosphere.SeaLevelPressurePa,
        double anchorGeometricAltitudeM = 0.0)
    {
        ArgumentNullException.ThrowIfNull(levels);
        _levels = levels.ToArray();
        if (_levels.Length < 2)
            throw new ArgumentException("a sounding requires at least two temperature points", nameof(levels));

        for (int i = 0; i < _levels.Length; i++) {
            var level = _levels[i];
            if (!double.IsFinite(level.GeometricAltitudeM))
                throw new ArgumentOutOfRangeException(nameof(levels), "altitudes must be finite metres");
            if (!double.IsFinite(level.TemperatureK) || level.TemperatureK <= 0.0)
                throw new ArgumentOutOfRangeException(nameof(levels), "temperatures must be finite, positive Kelvin");
            if (i > 0 && level.GeometricAltitudeM <= _levels[i - 1].GeometricAltitudeM)
                throw new ArgumentException("sounding altitudes must be strictly increasing", nameof(levels));

            // Reuse the simulation's geometric-coordinate validity guard. Unlike the standard
            // atmosphere, this custom column may extend above its 84.852-km model ceiling.
            _ = Atmosphere.GeopotentialAltitude(level.GeometricAltitudeM);
        }

        if (!double.IsFinite(anchorPressurePa) || anchorPressurePa <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(anchorPressurePa),
                "anchor static pressure must be finite, positive Pascals");
        if (!double.IsFinite(anchorGeometricAltitudeM)
            || anchorGeometricAltitudeM < MinimumGeometricAltitudeM
            || anchorGeometricAltitudeM > MaximumGeometricAltitudeM)
            throw new ArgumentOutOfRangeException(nameof(anchorGeometricAltitudeM),
                "pressure anchor must lie inside the sounding bounds");

        AnchorPressurePa = anchorPressurePa;
        AnchorGeometricAltitudeM = anchorGeometricAltitudeM;
        Levels = Array.AsReadOnly(_levels);

        _integralFromMinimum = new double[_levels.Length];
        for (int i = 1; i < _levels.Length; i++)
            _integralFromMinimum[i] = _integralFromMinimum[i - 1]
                + IntegralInverseTemperature(
                    _levels[i - 1].GeometricAltitudeM,
                    _levels[i - 1].TemperatureK,
                    _levels[i].GeometricAltitudeM,
                    _levels[i].TemperatureK);

        _anchorIntegral = IntegralFromMinimumAt(anchorGeometricAltitudeM);

        // Reject a profile whose bounded endpoints cannot be represented as positive finite
        // pressures. This catches unit slips such as kilometre values entered as metres before a
        // later Sample call can inject an infinity or vacuum into the flight integrator.
        EnsureRepresentablePressure(_integralFromMinimum[0]);
        EnsureRepresentablePressure(_integralFromMinimum[^1]);
    }

    public AtmosphericState Sample(double geometricAltitudeM) {
        ValidateSampleAltitude(geometricAltitudeM);

        int layer = LayerFor(geometricAltitudeM);
        var low = _levels[layer];
        var high = _levels[layer + 1];
        double fraction = (geometricAltitudeM - low.GeometricAltitudeM)
            / (high.GeometricAltitudeM - low.GeometricAltitudeM);
        double temperatureK = low.TemperatureK
            + (high.TemperatureK - low.TemperatureK) * fraction;
        double pressurePa = PressureAtIntegral(IntegralFromMinimumAt(geometricAltitudeM));
        double densityKgM3 = pressurePa
            / (Atmosphere.SpecificGasConstantDryAir * temperatureK);
        double speedOfSoundMps = Math.Sqrt(Atmosphere.RatioOfSpecificHeats
            * Atmosphere.SpecificGasConstantDryAir * temperatureK);

        return new AtmosphericState(
            geometricAltitudeM,
            Atmosphere.GeopotentialAltitude(geometricAltitudeM),
            temperatureK,
            pressurePa,
            densityKgM3,
            speedOfSoundMps);
    }

    double IntegralFromMinimumAt(double geometricAltitudeM) {
        int layer = LayerFor(geometricAltitudeM);
        var low = _levels[layer];
        var high = _levels[layer + 1];
        double fraction = (geometricAltitudeM - low.GeometricAltitudeM)
            / (high.GeometricAltitudeM - low.GeometricAltitudeM);
        double temperatureK = low.TemperatureK
            + (high.TemperatureK - low.TemperatureK) * fraction;

        return _integralFromMinimum[layer] + IntegralInverseTemperature(
            low.GeometricAltitudeM,
            low.TemperatureK,
            geometricAltitudeM,
            temperatureK);
    }

    double PressureAtIntegral(double integralFromMinimum) {
        double exponent = -Atmosphere.StandardGravityMps2
            / Atmosphere.SpecificGasConstantDryAir
            * (integralFromMinimum - _anchorIntegral);
        return AnchorPressurePa * Math.Exp(exponent);
    }

    void EnsureRepresentablePressure(double integralFromMinimum) {
        double pressure = PressureAtIntegral(integralFromMinimum);
        if (!double.IsFinite(pressure) || pressure <= 0.0)
            throw new ArgumentException(
                "sounding bounds produce pressure outside the finite positive Pascal range",
                nameof(_levels));
    }

    static double IntegralInverseTemperature(
        double altitude0M,
        double temperature0K,
        double altitude1M,
        double temperature1K)
    {
        double deltaAltitudeM = altitude1M - altitude0M;
        if (deltaAltitudeM == 0.0) return 0.0;

        double deltaTemperatureK = temperature1K - temperature0K;
        if (Math.Abs(deltaTemperatureK)
            <= 1e-12 * Math.Max(temperature0K, temperature1K))
            return deltaAltitudeM / temperature0K;

        // Integral dz/T(z) for a linear-temperature layer. Expressing it in endpoint
        // differences avoids separately rounding a lapse rate and preserves exact continuity.
        return deltaAltitudeM * Math.Log(temperature1K / temperature0K)
            / deltaTemperatureK;
    }

    int LayerFor(double geometricAltitudeM) {
        if (geometricAltitudeM == MaximumGeometricAltitudeM) return _levels.Length - 2;

        int low = 0;
        int high = _levels.Length - 1;
        while (high - low > 1) {
            int mid = low + (high - low) / 2;
            if (geometricAltitudeM < _levels[mid].GeometricAltitudeM) high = mid;
            else low = mid;
        }
        return low;
    }

    void ValidateSampleAltitude(double geometricAltitudeM) {
        if (!double.IsFinite(geometricAltitudeM)
            || geometricAltitudeM < MinimumGeometricAltitudeM
            || geometricAltitudeM > MaximumGeometricAltitudeM)
            throw new ArgumentOutOfRangeException(nameof(geometricAltitudeM),
                $"sample altitude must be within [{MinimumGeometricAltitudeM}, {MaximumGeometricAltitudeM}] metres");
    }
}
