namespace GunsOnly.Sim;
public enum DemandTier { Baseline, Valley, MaxPerform, OverDemand }
public static class Protection {
    /// The protection boundary the bare arrows ride. UNMANNED: there is no pilot, so the old
    /// 6G cap (a physiological legacy) is gone — protection is 92% of what the WING can make,
    /// bounded by structure. At fighting speeds the wing binds long before the spar does
    /// (7.9G @ 389kt, 11.4G @ 467kt; 20G would need 618kt), so removing the pilot buys
    /// duration, not peak: you can ride the aero limit indefinitely and pay only in energy.
    public static double MaxPerformG(in AircraftState s, in AircraftParams p) {
        double baseG = System.Math.Max(1.2, 0.92 * FlightModel.NzAeroMax(s, p));
        return System.Math.Min(baseG, HardMaxG(s, p)); // invariant: MaxPerformG <= HardMaxG always
    }
    public static double HardMaxG(in AircraftState s, in AircraftParams p) =>
        System.Math.Min(FlightModel.NzAeroMax(s, p), StructuralLimitG);
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

    /// Unmanned structural limit. Above ~12G you'd need to be transonic to reach it anyway,
    /// and spar mass scales with design-G — on an attritable that's mass you can't use.
    public const double StructuralLimitG = 12.0;
}
