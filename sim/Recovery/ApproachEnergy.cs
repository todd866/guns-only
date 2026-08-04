namespace GunsOnly.Sim.Recovery;

/// Energy bookkeeping for a recovery. Energy height is the single currency: altitude and speed are
/// interchangeable, and drag is the only way to spend either. Pure; no aircraft state is held here.
public static class ApproachEnergy {
    public const double GravityMps2 = 9.80665;

    /// Energy height: the altitude reachable by trading all airspeed for height.
    public static double SpecificEnergyM(double altitudeM, double trueAirspeedMps) =>
        altitudeM + trueAirspeedMps * trueAirspeedMps / (2.0 * GravityMps2);

    /// Track distance needed to shed an energy-height excess, from D*s = W*dEs. dragToWeight is
    /// the achievable drag-to-weight ratio in the configuration actually available.
    public static double TrackDistanceRequiredM(double excessEnergyHeightM, double dragToWeight) {
        if (!(excessEnergyHeightM > 0.0) || !double.IsFinite(excessEnergyHeightM)) return 0.0;
        double ratio = System.Math.Max(dragToWeight, 1e-3);
        return excessEnergyHeightM / ratio;
    }
}
