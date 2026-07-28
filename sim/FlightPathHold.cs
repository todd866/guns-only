namespace GunsOnly.Sim;

/// <summary>
/// Immutable tuning for the coordinated neutral-pitch trim kernel. Disabled/default tuning fails
/// closed so legacy airframes retain their existing neutral-stick law.
/// </summary>
public readonly record struct FlightPathHoldConfig(
    double AttitudeErrorGainPerSecond,
    double PitchRateDamping,
    double MaxCommandedPitchRateRadPerSecond,
    double BankCosineFloor,
    double MinG,
    double MaxG,
    bool Enabled) {
    public static FlightPathHoldConfig Rapier { get; } = new(
        AttitudeErrorGainPerSecond: 3.0,
        PitchRateDamping: 0.85,
        MaxCommandedPitchRateRadPerSecond: 0.25,
        BankCosineFloor: 0.30,
        MinG: -1.0,
        MaxG: 8.0,
        Enabled: true);
}

/// <summary>
/// Converts body-pitch attitude error into a bounded normal-load request while leaving the ordinary
/// FREE/FIGHT G/AoA controller authoritative. Gravity feed-forward still depends on the current
/// flight path: attitude and velocity are deliberately different state.
/// </summary>
public static class FlightPathHold {
    public static double RequiredNormalLoad(
        double pitchAttitudeErrorRad,
        double measuredBodyPitchRateRadPerSecond,
        double currentFlightPathRad,
        double bodyBankRad,
        double trueAirspeedMps,
        in FlightPathHoldConfig config) {
        if (!config.Enabled || !IsValidConfig(in config))
            return double.NaN;
        if (!double.IsFinite(pitchAttitudeErrorRad)
            || !double.IsFinite(measuredBodyPitchRateRadPerSecond)
            || !double.IsFinite(currentFlightPathRad)
            || !double.IsFinite(bodyBankRad)
            || !double.IsFinite(trueAirspeedMps)
            || trueAirspeedMps <= 0.0)
            return double.NaN;

        double pitchRate = System.Math.Clamp(
            config.AttitudeErrorGainPerSecond * pitchAttitudeErrorRad
                - config.PitchRateDamping * measuredBodyPitchRateRadPerSecond,
            -config.MaxCommandedPitchRateRadPerSecond,
            config.MaxCommandedPitchRateRadPerSecond);
        double numerator = System.Math.Cos(currentFlightPathRad)
            + pitchRate * trueAirspeedMps / FlightModel.G0;
        double cosBank = System.Math.Cos(bodyBankRad);
        double denominator = System.Math.CopySign(
            System.Math.Max(System.Math.Abs(cosBank), config.BankCosineFloor),
            cosBank);
        if (!double.IsFinite(numerator) || !double.IsFinite(denominator))
            return double.NaN;

        return System.Math.Clamp(
            numerator / denominator, config.MinG, config.MaxG);
    }

    static bool IsValidConfig(in FlightPathHoldConfig config) =>
        double.IsFinite(config.AttitudeErrorGainPerSecond)
        && config.AttitudeErrorGainPerSecond > 0.0
        && double.IsFinite(config.PitchRateDamping)
        && config.PitchRateDamping >= 0.0
        && double.IsFinite(config.MaxCommandedPitchRateRadPerSecond)
        && config.MaxCommandedPitchRateRadPerSecond > 0.0
        && double.IsFinite(config.BankCosineFloor)
        && config.BankCosineFloor > 0.0
        && config.BankCosineFloor <= 1.0
        && double.IsFinite(config.MinG)
        && double.IsFinite(config.MaxG)
        && config.MinG <= config.MaxG;
}
