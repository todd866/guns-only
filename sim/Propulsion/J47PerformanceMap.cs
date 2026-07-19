namespace GunsOnly.Sim.Propulsion;

/// <summary>
/// Deterministic dry-thrust J47-GE-27 performance approximation.
///
/// <para><paramref name="powerFraction"/> retains the simulator's existing meaning: normalized
/// sea-level-static net thrust, not normalized RPM. The map first inverts a measured J47D thrust
/// curve to infer RPM, applies the reported altitude/Mach performance ratios, and returns thrust
/// and fuel flow from the same operating point.</para>
///
/// <para>The exact GE-27 sea-level military anchor comes from NASA CR-137674. Altitude/Mach/RPM
/// sweeps come from NACA RM E51B06, with NACA RM E9G09 used only above Mach 0.711. This revision is
/// a standard-day free-engine/tunnel surface; installed-aircraft and non-standard-temperature
/// corrections can replace its checked-in rows later without changing this API. Inputs outside
/// the published envelope are clamped rather than extrapolated.</para>
/// </summary>
public static class J47PerformanceMap
{
    public const string DataRevision = "j47-ge27-cr137674-e51b06-e9g09-v1";
    public const bool StandardDayOnly = true;
    public const double RatedRpm = J47MapData.RatedRpm;
    public const double IdleRpm = J47MapData.IdleRpm;
    public const double RatedNetThrustLbf = J47MapData.Ge27RatedNetThrustLbf;
    public const double RatedFuelFlowLbPerMinute = J47MapData.Ge27RatedFuelFlowLbPerMinute;
    public const double NewtonsPerPoundForce = 4.4482216152605;
    public const double MaximumMappedMach = .975;
    public const double MaximumMappedAltitudeFt = 45000.0;
    public const double FeetPerMetre = 3.280839895013123;
    public const double MaximumMappedAltitudeM = MaximumMappedAltitudeFt / FeetPerMetre;

    public static IReadOnlyList<J47PublishedRow> SourceRows => J47MapData.PublishedRows;

    readonly record struct Sample(double ThrustLbf, double FuelLbPerHour);
    readonly record struct Correction(double Thrust, double Fuel);

    /// <summary>
    /// Evaluates one steady engine operating point. Power, altitude, and Mach are bounded to the
    /// modeled envelope; non-finite inputs are rejected. A non-running engine always returns zero.
    /// </summary>
    public static EngineOperatingPoint Evaluate(
        double powerFraction,
        double altitudeM,
        double mach,
        bool running = true)
    {
        if (!double.IsFinite(powerFraction))
            throw new ArgumentOutOfRangeException(nameof(powerFraction));
        if (!double.IsFinite(altitudeM))
            throw new ArgumentOutOfRangeException(nameof(altitudeM));
        if (!double.IsFinite(mach))
            throw new ArgumentOutOfRangeException(nameof(mach));

        if (!running) return EngineOperatingPoint.Stopped;

        double power = Math.Clamp(powerFraction, 0.0, 1.0);
        double altitudeFt = Math.Clamp(altitudeM * FeetPerMetre,
            0.0, MaximumMappedAltitudeFt);
        double boundedMach = Math.Clamp(mach, 0.0, MaximumMappedMach);

        double requestedRpm = RpmForSeaLevelPower(power);
        double rpm = Math.Min(requestedRpm, MaximumRpm(altitudeFt, boundedMach));

        Sample lowMach = SampleAltitudeSurface(J47MapData.LowMachCurves, altitudeFt, rpm);
        Sample idle = SampleAltitudeSurface(J47MapData.LowMachCurves, altitudeFt,
            Math.Min(IdleRpm, rpm));

        // Current simulation power zero means zero propulsive thrust. Preserve that contract while
        // retaining physical running-idle RPM and fuel flow. The correction vanishes continuously
        // as power rises and is exactly absent at every full-power published row.
        double baseThrust = Math.Max(0.0,
            lowMach.ThrustLbf - (1.0 - power) * Math.Max(0.0, idle.ThrustLbf));

        Correction machCorrection = MachCorrection(altitudeFt, boundedMach, rpm);
        double thrustLbf = Math.Max(0.0, baseThrust * machCorrection.Thrust);
        // Sparse high-Mach sweeps begin well above idle. Their first-point ratio can otherwise
        // manufacture a falling fuel schedule while RPM is rising. Bound that unmeasured region
        // by the standard-day running-idle flow; all measured rows sit above this floor.
        double fuelLbPerHour = Math.Max(idle.FuelLbPerHour,
            lowMach.FuelLbPerHour * machCorrection.Fuel);
        double fuelLbPerMinute = Math.Max(0.0, fuelLbPerHour / 60.0);

        return new EngineOperatingPoint(
            Rpm: rpm,
            RpmPercent: Math.Clamp(rpm / RatedRpm * 100.0, 0.0, 100.0),
            NetThrustN: thrustLbf * NewtonsPerPoundForce,
            NetThrustLbf: thrustLbf,
            FuelFlowLbPerMinute: fuelLbPerMinute,
            Running: true);
    }

    static double RpmForSeaLevelPower(double power)
    {
        J47CurvePoint[] points = J47MapData.SeaLevelStaticCurve.Points;
        if (power <= 0.0) return points[0].Rpm;
        if (power >= 1.0) return points[^1].Rpm;

        for (int i = 1; i < points.Length; i++)
        {
            double upperPower = points[i].NetThrustLbf / RatedNetThrustLbf;
            if (power > upperPower) continue;
            double lowerPower = points[i - 1].NetThrustLbf / RatedNetThrustLbf;
            double t = (power - lowerPower) / (upperPower - lowerPower);
            return points[i - 1].Rpm + (points[i].Rpm - points[i - 1].Rpm) * t;
        }
        return points[^1].Rpm;
    }

    static Sample SampleCurve(J47Curve curve, double rpm)
    {
        J47CurvePoint[] points = curve.Points;
        if (rpm <= points[0].Rpm)
            return new(points[0].NetThrustLbf, points[0].FuelFlowLbPerHour);
        if (rpm >= points[^1].Rpm)
            return new(points[^1].NetThrustLbf, points[^1].FuelFlowLbPerHour);

        for (int i = 1; i < points.Length; i++)
        {
            if (rpm > points[i].Rpm) continue;
            J47CurvePoint a = points[i - 1], b = points[i];
            double t = (rpm - a.Rpm) / (b.Rpm - a.Rpm);
            return new(
                a.NetThrustLbf + (b.NetThrustLbf - a.NetThrustLbf) * t,
                a.FuelFlowLbPerHour + (b.FuelFlowLbPerHour - a.FuelFlowLbPerHour) * t);
        }
        return new(points[^1].NetThrustLbf, points[^1].FuelFlowLbPerHour);
    }

    static Sample SampleAltitudeSurface(J47Curve[] curves, double altitudeFt, double rpm)
    {
        if (altitudeFt <= curves[0].AltitudeFt) return SampleCurve(curves[0], rpm);
        if (altitudeFt >= curves[^1].AltitudeFt) return SampleCurve(curves[^1], rpm);

        for (int i = 1; i < curves.Length; i++)
        {
            if (altitudeFt > curves[i].AltitudeFt) continue;
            J47Curve lowerCurve = curves[i - 1], upperCurve = curves[i];
            Sample lower = SampleCurve(lowerCurve, rpm);
            Sample upper = SampleCurve(upperCurve, rpm);
            double t = (altitudeFt - lowerCurve.AltitudeFt)
                / (upperCurve.AltitudeFt - lowerCurve.AltitudeFt);
            return new(
                lower.ThrustLbf + (upper.ThrustLbf - lower.ThrustLbf) * t,
                lower.FuelLbPerHour + (upper.FuelLbPerHour - lower.FuelLbPerHour) * t);
        }
        return SampleCurve(curves[^1], rpm);
    }

    static Correction CorrectionForCurve(J47Curve highMachCurve, double rpm)
    {
        double sampledRpm = Math.Clamp(rpm,
            highMachCurve.Points[0].Rpm, highMachCurve.Points[^1].Rpm);
        Sample high = SampleCurve(highMachCurve, sampledRpm);
        Sample low = SampleAltitudeSurface(
            J47MapData.LowMachCurves, highMachCurve.AltitudeFt, sampledRpm);

        double thrustRatio = low.ThrustLbf > 1e-9
            ? Math.Clamp(high.ThrustLbf / low.ThrustLbf, 0.0, 2.0)
            : 1.0;
        double fuelRatio = low.FuelLbPerHour > 1e-9
            ? Math.Clamp(high.FuelLbPerHour / low.FuelLbPerHour, 0.0, 3.0)
            : 1.0;

        // A sweep that did not measure low RPM cannot justify a constant high-Mach correction
        // below its first row. Fade to unity at running idle instead of extrapolating it.
        if (rpm < highMachCurve.Points[0].Rpm)
        {
            double t = Math.Clamp((rpm - IdleRpm)
                / (highMachCurve.Points[0].Rpm - IdleRpm), 0.0, 1.0);
            // Fade increasing corrections in from idle. For a ratio below unity, retain the
            // bounded first-row ratio (and, for fuel, let Evaluate's idle-flow floor cover the
            // unknown region); fading downward can create a non-monotone power schedule.
            if (thrustRatio >= 1.0)
                thrustRatio = 1.0 + (thrustRatio - 1.0) * t;
            if (fuelRatio >= 1.0)
                fuelRatio = 1.0 + (fuelRatio - 1.0) * t;
        }
        return new(thrustRatio, fuelRatio);
    }

    static Correction CorrectionAtAltitude(J47Curve[] curves, double altitudeFt, double rpm)
    {
        if (curves.Length == 1) return CorrectionForCurve(curves[0], rpm);
        if (altitudeFt <= curves[0].AltitudeFt) return CorrectionForCurve(curves[0], rpm);
        if (altitudeFt >= curves[^1].AltitudeFt) return CorrectionForCurve(curves[^1], rpm);

        for (int i = 1; i < curves.Length; i++)
        {
            if (altitudeFt > curves[i].AltitudeFt) continue;
            J47Curve lowerCurve = curves[i - 1], upperCurve = curves[i];
            Correction lower = CorrectionForCurve(lowerCurve, rpm);
            Correction upper = CorrectionForCurve(upperCurve, rpm);
            double t = (altitudeFt - lowerCurve.AltitudeFt)
                / (upperCurve.AltitudeFt - lowerCurve.AltitudeFt);
            return new(
                lower.Thrust + (upper.Thrust - lower.Thrust) * t,
                lower.Fuel + (upper.Fuel - lower.Fuel) * t);
        }
        return CorrectionForCurve(curves[^1], rpm);
    }

    static Correction MachCorrection(double altitudeFt, double mach, double rpm)
    {
        const double lowMachNode = .180;
        if (mach <= lowMachNode) return new(1.0, 1.0);

        Correction atHalf = CorrectionAtAltitude(J47MapData.MachHalfCurves, altitudeFt, rpm);
        Correction at071 = CorrectionAtAltitude(J47MapData.Mach071Curves, altitudeFt, rpm);
        Correction at085 = CorrectionAtAltitude(J47MapData.Mach085Curves, altitudeFt, rpm);
        Correction at0975 = CorrectionAtAltitude(J47MapData.Mach0975Curves, altitudeFt, rpm);

        if (mach <= .500) return Lerp(new(1.0, 1.0), atHalf,
            (mach - lowMachNode) / (.500 - lowMachNode));
        if (mach <= .711) return Lerp(atHalf, at071, (mach - .500) / (.711 - .500));
        if (mach <= .850) return Lerp(at071, at085, (mach - .711) / (.850 - .711));
        return Lerp(at085, at0975, (mach - .850) / (.975 - .850));
    }

    static Correction Lerp(Correction a, Correction b, double t) => new(
        a.Thrust + (b.Thrust - a.Thrust) * t,
        a.Fuel + (b.Fuel - a.Fuel) * t);

    static double MaximumRpm(double altitudeFt, double mach)
    {
        double low = MaximumRpmAtAltitude(J47MapData.LowMachCurves, altitudeFt);
        if (mach <= .180) return low;

        double atHalf = MaximumRpmAtAltitude(J47MapData.MachHalfCurves, altitudeFt);
        double at071 = MaximumRpmAtAltitude(J47MapData.Mach071Curves, altitudeFt);
        double at085 = MaximumRpmAtAltitude(J47MapData.Mach085Curves, altitudeFt);
        double at0975 = MaximumRpmAtAltitude(J47MapData.Mach0975Curves, altitudeFt);

        if (mach <= .500) return Lerp(low, atHalf, (mach - .180) / (.500 - .180));
        if (mach <= .711) return Lerp(atHalf, at071, (mach - .500) / (.711 - .500));
        if (mach <= .850) return Lerp(at071, at085, (mach - .711) / (.850 - .711));
        return Lerp(at085, at0975, (mach - .850) / (.975 - .850));
    }

    static double MaximumRpmAtAltitude(J47Curve[] curves, double altitudeFt)
    {
        if (curves.Length == 1) return curves[0].Points[^1].Rpm;
        if (altitudeFt <= curves[0].AltitudeFt) return curves[0].Points[^1].Rpm;
        if (altitudeFt >= curves[^1].AltitudeFt) return curves[^1].Points[^1].Rpm;

        for (int i = 1; i < curves.Length; i++)
        {
            if (altitudeFt > curves[i].AltitudeFt) continue;
            J47Curve lower = curves[i - 1], upper = curves[i];
            double t = (altitudeFt - lower.AltitudeFt)
                / (upper.AltitudeFt - lower.AltitudeFt);
            return Lerp(lower.Points[^1].Rpm, upper.Points[^1].Rpm, t);
        }
        return curves[^1].Points[^1].Rpm;
    }

    static double Lerp(double a, double b, double t) => a + (b - a) * t;
}
