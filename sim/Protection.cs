namespace GunsOnly.Sim;
public enum DemandTier { Baseline, Valley, MaxPerform, OverDemand }
public static class Protection {
    /// The protection boundary the bare arrows ride: an airframe-selected fraction of what the
    /// wing can make, bounded by that airframe's structure. The player F-86 uses 100%, making full
    /// backstick the documented +7 G limit; unmanned aircraft retain the default 92% margin.
    public static double MaxPerformG(in AircraftState s, in AircraftParams p) {
        double baseG = System.Math.Max(1.2, p.MaxPerformFraction * FlightModel.NzAeroMax(s, p));
        return System.Math.Min(baseG, HardMaxG(s, p)); // invariant: MaxPerformG <= HardMaxG always
    }
    public static double HardMaxG(in AircraftState s, in AircraftParams p) =>
        System.Math.Min(FlightModel.NzAeroMax(s, p), p.PositiveStructuralLimitG);
    /// The energy-NEUTRAL turn: the G at which thrust exactly balances drag, so you can hold
    /// it forever without scrubbing a knot. This is what the drone's flight AI flies for a
    /// routine tactical turn — the player spends energy deliberately (override) rather than
    /// bleeding it by accident. Solves CD0 + k*CL^2 = T/(q*S) for n.
    public static double SustainedG(in AircraftState s, in AircraftParams p) {
        double rho = Atmosphere.Density(s.Position.Y);
        double q = 0.5 * rho * s.Speed * s.Speed;
        double qS = q * p.WingAreaM2;
        if (qS < 1e-6) return 1.0;
        double thrust = p.ThrustMaxN * (rho / 1.225);         // mil power, density-lapsed
        double cdAvail = thrust / qS;
        double cl2 = (cdAvail - p.CD0) / p.InducedK;
        if (cl2 <= 0) return 1.0;                              // can't even sustain 1G of lift-drag
        double n = System.Math.Sqrt(cl2) * qS / (s.Mass * FlightModel.G0);
        double mp = MaxPerformG(s, p);
        // Min(1.0, mp): at low speed the wing can't even make 1G, so a [1.0, mp] clamp would
        // throw min>max. This exact class has bitten three times now — always bound the floor.
        return System.Math.Clamp(n, System.Math.Min(1.0, mp), mp);
    }

    /// Default unmanned structural limit retained for airframes that do not override the parameter.
    public const double StructuralLimitG = 12.0;
}
