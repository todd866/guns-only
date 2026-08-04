namespace GunsOnly.Sim.Propulsion;

/// <summary>
/// Shared afterburning-turbofan public-data thrust lapse used by the force kernel and by
/// detent / speed-hold feed-forward. Explicitly a bounded surrogate (√density with modest Mach
/// ram), not an OEM F119 deck. Lever maps linearly to military thrust fraction; approach
/// resolution is a pilot-input schedule in <see cref="DetentLayer"/>, not an engine curve.
/// </summary>
public static class TurbofanPublicDataSurrogate {
    /// <summary>
    /// Gross-thrust lapse matching <see cref="AircraftSim"/> for
    /// <see cref="PropulsionModelKind.AfterburningTurbofanPublicDataSurrogate"/>:
    /// clamp(sqrt(densityRatio) × (1 + 0.10 × clamp(mach, 0, 1.5)), 0, 1.05).
    /// </summary>
    public static double ThrustLapse(double densityRatio, double mach) {
        double ratio = System.Math.Max(0.0, densityRatio);
        double machTerm = 1.0 + 0.10 * System.Math.Clamp(mach, 0.0, 1.5);
        return System.Math.Clamp(System.Math.Sqrt(ratio) * machTerm, 0.0, 1.05);
    }

    public static double AvailableThrustN(
        double seaLevelStaticThrustN,
        double densityRatio,
        double mach,
        double thrustFraction) {
        if (!(seaLevelStaticThrustN > 0.0) || !(thrustFraction > 0.0))
            return 0.0;
        return thrustFraction * seaLevelStaticThrustN * ThrustLapse(densityRatio, mach);
    }
}
