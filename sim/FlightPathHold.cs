namespace GunsOnly.Sim;

/// <summary>
/// Immutable tuning for the coordinated flight-path hold kernel. Disabled/default tuning fails
/// closed so legacy airframes retain their existing neutral-stick law.
/// </summary>
public readonly record struct FlightPathHoldConfig(
    double GammaErrorGainPerSecond,
    double MaxCommandedGammaRateRadPerSecond,
    double BankCosineFloor,
    double MinG,
    double MaxG,
    bool Enabled) {
    public static FlightPathHoldConfig Rapier { get; } = new(
        GammaErrorGainPerSecond: 2.0,
        MaxCommandedGammaRateRadPerSecond: 0.16,
        BankCosineFloor: 0.30,
        MinG: -1.0,
        MaxG: 2.5,
        Enabled: true);
}

/// <summary>
/// Converts captured-vs-current flight-path angle into a bounded normal-load request while leaving
/// the ordinary FREE/FIGHT G/AoA controller authoritative.
/// </summary>
public static class FlightPathHold {
    public static double RequiredNormalLoad(
        double capturedGammaRad,
        double currentGammaRad,
        double bodyBankRad,
        double trueAirspeedMps,
        in FlightPathHoldConfig config) {
        if (!config.Enabled || !IsValidConfig(in config))
            return double.NaN;
        if (!double.IsFinite(capturedGammaRad)
            || !double.IsFinite(currentGammaRad)
            || !double.IsFinite(bodyBankRad)
            || !double.IsFinite(trueAirspeedMps)
            || trueAirspeedMps <= 0.0)
            return double.NaN;

        double gammaRate = System.Math.Clamp(
            config.GammaErrorGainPerSecond * (capturedGammaRad - currentGammaRad),
            -config.MaxCommandedGammaRateRadPerSecond,
            config.MaxCommandedGammaRateRadPerSecond);
        double numerator = System.Math.Cos(currentGammaRad)
            + gammaRate * trueAirspeedMps / FlightModel.G0;
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
        double.IsFinite(config.GammaErrorGainPerSecond)
        && config.GammaErrorGainPerSecond > 0.0
        && double.IsFinite(config.MaxCommandedGammaRateRadPerSecond)
        && config.MaxCommandedGammaRateRadPerSecond > 0.0
        && double.IsFinite(config.BankCosineFloor)
        && config.BankCosineFloor > 0.0
        && config.BankCosineFloor <= 1.0
        && double.IsFinite(config.MinG)
        && double.IsFinite(config.MaxG)
        && config.MinG <= config.MaxG;
}
