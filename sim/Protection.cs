namespace GunsOnly.Sim;
public enum DemandTier { Baseline, Valley, MaxPerform, OverDemand }
public static class Protection {
    public static double MaxPerformG(in AircraftState s, in AircraftParams p) =>
        System.Math.Max(1.2, System.Math.Min(0.92 * FlightModel.NzAeroMax(s, p), 6.0));
    public static double HardMaxG(in AircraftState s, in AircraftParams p) =>
        System.Math.Min(FlightModel.NzAeroMax(s, p), 7.33);
}
