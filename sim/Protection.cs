namespace GunsOnly.Sim;
public enum DemandTier { Baseline, Valley, MaxPerform, OverDemand }
public static class Protection {
    /// The protection boundary the bare arrows ride: an airframe-selected fraction of what the
    /// wing can make, bounded by that airframe's structure. The player F-86 uses 100%, making full
    /// backstick the documented +7 G limit; unmanned aircraft retain the default 92% margin.
    public static double MaxPerformG(in AircraftState s, in AircraftParams p) =>
        MaxPerformG(s, p, s.Speed);
    public static double MaxPerformG(in AircraftState s, in AircraftParams p, double airspeedMps) {
        return MaxPerformG(s, p, airspeedMps, StandardAtmosphere1976.Instance);
    }
    public static double MaxPerformG(in AircraftState s, in AircraftParams p, double airspeedMps,
        IAtmosphereModel atmosphere) {
        ArgumentNullException.ThrowIfNull(atmosphere);
        double baseG = System.Math.Max(1.2,
            p.MaxPerformFraction * FlightModel.NzAeroMax(s, p, airspeedMps, atmosphere));
        return System.Math.Min(baseG, HardMaxG(s, p, airspeedMps, atmosphere));
    }
    public static double HardMaxG(in AircraftState s, in AircraftParams p) =>
        HardMaxG(s, p, s.Speed);
    public static double HardMaxG(in AircraftState s, in AircraftParams p, double airspeedMps) =>
        HardMaxG(s, p, airspeedMps, StandardAtmosphere1976.Instance);
    public static double HardMaxG(in AircraftState s, in AircraftParams p, double airspeedMps,
        IAtmosphereModel atmosphere) {
        ArgumentNullException.ThrowIfNull(atmosphere);
        return System.Math.Min(FlightModel.NzAeroMax(s, p, airspeedMps, atmosphere),
            p.PositiveStructuralLimitG);
    }
    /// <summary>
    /// Deliberate control-law override ceiling. It remains aero-limited and defaults to the normal
    /// structural boundary; only an airframe with an explicit positive surrogate override can
    /// command beyond that boundary. Aerodynamic derivatives consume the resulting actuator
    /// demand, never the keyboard/override metadata.
    /// </summary>
    public static double OverrideMaxG(in AircraftState s, in AircraftParams p) =>
        OverrideMaxG(s, p, s.Speed);
    public static double OverrideMaxG(in AircraftState s, in AircraftParams p,
        double airspeedMps) => OverrideMaxG(s, p, airspeedMps,
            StandardAtmosphere1976.Instance);
    public static double OverrideMaxG(in AircraftState s, in AircraftParams p,
        double airspeedMps, IAtmosphereModel atmosphere) {
        ArgumentNullException.ThrowIfNull(atmosphere);
        return System.Math.Min(FlightModel.NzAeroMax(s, p, airspeedMps, atmosphere),
            FlightModel.PositiveControlLimitG(p));
    }
    /// The energy-NEUTRAL turn: the G at which thrust exactly balances drag, so you can hold
    /// it forever without scrubbing a knot. This is what the drone's flight AI flies for a
    /// routine tactical turn — the player spends energy deliberately (override) rather than
    /// bleeding it by accident. Solves CD0 + k*CL^2 = T/(q*S) for n.
    public static double SustainedG(in AircraftState s, in AircraftParams p) =>
        SustainedG(s, p, s.Speed);
    public static double SustainedG(in AircraftState s, in AircraftParams p, double airspeedMps) {
        return SustainedG(s, p, airspeedMps, StandardAtmosphere1976.Instance);
    }
    public static double SustainedG(in AircraftState s, in AircraftParams p, double airspeedMps,
        IAtmosphereModel atmosphere) {
        ArgumentNullException.ThrowIfNull(atmosphere);
        double rho = atmosphere.Sample(s.Position.Y).DensityKgM3;
        double speed = double.IsFinite(airspeedMps) && airspeedMps >= 0.0
            ? airspeedMps : s.Speed;
        double q = 0.5 * rho * speed * speed;
        double qS = q * p.WingAreaM2;
        if (qS < 1e-6) return 1.0;
        double thrust = p.ThrustMaxN * (rho / 1.225);         // mil power, density-lapsed
        double cdAvail = thrust / qS;
        double cl2 = (cdAvail - p.CD0) / p.InducedK;
        if (cl2 <= 0) return 1.0;                              // can't even sustain 1G of lift-drag
        double n = System.Math.Sqrt(cl2) * qS / (s.Mass * FlightModel.G0);
        double mp = MaxPerformG(s, p, speed, atmosphere);
        // Min(1.0, mp): at low speed the wing can't even make 1G, so a [1.0, mp] clamp would
        // throw min>max. This exact class has bitten three times now — always bound the floor.
        return System.Math.Clamp(n, System.Math.Min(1.0, mp), mp);
    }

    /// <summary>
    /// Live, level-turn sustained load factor using the physical net thrust, current spool state,
    /// exact production drag polar, Mach drag, and actual gear/flap/damage configuration. A zero
    /// result means the aircraft cannot sustain a one-G level condition at the present energy and
    /// configuration; presentation should hide the marker rather than invent a one-G floor.
    /// </summary>
    public static double SustainedG(in AircraftState s, in AircraftParams p,
        double airspeedMps, double actualNetThrustN,
        in AirframeAerodynamicState configuration, IAtmosphereModel atmosphere) {
        ArgumentNullException.ThrowIfNull(atmosphere);
        double speed = double.IsFinite(airspeedMps) && airspeedMps >= 0.0
            ? airspeedMps : s.Speed;
        if (!double.IsFinite(actualNetThrustN) || actualNetThrustN <= 0.0
            || !double.IsFinite(speed) || speed <= 0.0)
            return 0.0;

        AtmosphericState atmosphericState = atmosphere.Sample(s.Position.Y);
        double qS = 0.5 * atmosphericState.DensityKgM3 * speed * speed * p.WingAreaM2;
        if (qS <= 1e-9 || s.Mass <= 0.0 || p.CLAlpha <= 0.0) return 0.0;

        double configuredClMax = p.CLMax + configuration.LiftCoefficientIncrement;
        double configuredAeroMax = qS * configuredClMax / (s.Mass * FlightModel.G0);
        double hardMax = System.Math.Min(configuredAeroMax, p.PositiveStructuralLimitG);
        double maxPerform = System.Math.Min(
            System.Math.Max(1.2, p.MaxPerformFraction * configuredAeroMax), hardMax);
        if (maxPerform < 1.0) return 0.0;

        double mach = speed / System.Math.Max(atmosphericState.SpeedOfSoundMps, 1e-9);
        // Local functions cannot close over ref-like `in` parameters. Snapshot the immutable values
        // once; the solver remains allocation-free and every candidate sees one coherent state.
        AircraftState state = s;
        AircraftParams parameters = p;
        AirframeAerodynamicState currentConfiguration = configuration;
        bool CanSustain(double loadFactor) {
            double totalCl = loadFactor * state.Mass * FlightModel.G0 / qS;
            double cleanCl = totalCl - currentConfiguration.LiftCoefficientIncrement;
            if (cleanCl < parameters.CLMin || cleanCl > parameters.CLMax) return false;
            double alpha = cleanCl / parameters.CLAlpha;
            double cd = FlightModel.ProfileDragCoefficient(alpha, mach, parameters)
                + currentConfiguration.DragCoefficientIncrement;
            double dragN = qS * cd;
            // The kernel applies thrust on the body axis, so only its air-path component pays the
            // drag bill in a steady level turn. This becomes material at high lift coefficient.
            double propulsiveN = actualNetThrustN * System.Math.Max(0.0,
                System.Math.Cos(alpha));
            return propulsiveN + 1e-9 >= dragN;
        }

        if (!CanSustain(1.0)) return 0.0;
        if (CanSustain(maxPerform)) return maxPerform;

        double low = 1.0, high = maxPerform;
        for (int i = 0; i < 40; i++) {
            double candidate = (low + high) * 0.5;
            if (CanSustain(candidate)) low = candidate;
            else high = candidate;
        }
        return low;
    }

    /// Default unmanned structural limit retained for airframes that do not override the parameter.
    public const double StructuralLimitG = 12.0;
}
