namespace GunsOnly.Sim;

/// <summary>
/// Deterministic internal-fuel bookkeeping for the player aircraft. Fuel does not yet affect
/// engine output at zero quantity; flameout belongs to a later integration task.
/// </summary>
public sealed class FuelModel {
    // Placeholder Sabre internal load until the project selects a specific F-86 variant/tank fit.
    public const double DefaultFuelLb = 3000.0;
    public const double BingoFuelLb = 800.0;

    public double FuelLb { get; private set; }
    public double BurnLbPerMinute { get; private set; }
    public double FuelTrendLbPerMinute => FuelLb > 0.0 ? -BurnLbPerMinute : 0.0;
    public bool IsBingo => FuelLb <= BingoFuelLb;

    public FuelModel(double initialFuelLb = DefaultFuelLb) {
        if (!double.IsFinite(initialFuelLb) || initialFuelLb < 0.0)
            throw new ArgumentOutOfRangeException(nameof(initialFuelLb));
        FuelLb = initialFuelLb;
    }

    /// <summary>Advance fuel using seconds, commanded lever position, and spooled thrust.</summary>
    public void Step(double dtSeconds, double throttle, double thrustFraction) {
        if (!double.IsFinite(dtSeconds) || dtSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(dtSeconds));

        BurnLbPerMinute = BurnRateLbPerMinute(throttle, thrustFraction);
        FuelLb = Math.Max(0.0, FuelLb - BurnLbPerMinute * dtSeconds / 60.0);
    }

    /// <summary>
    /// Simple dry-thrust curve with a staged afterburner penalty. At the nominal operating points
    /// it yields 18 lb/min idle, 45 cruise, 90 military, and 240 maximum afterburner.
    /// </summary>
    public static double BurnRateLbPerMinute(double throttle, double thrustFraction) {
        if (!double.IsFinite(throttle) || !double.IsFinite(thrustFraction))
            throw new ArgumentOutOfRangeException(!double.IsFinite(throttle)
                ? nameof(throttle) : nameof(thrustFraction));

        double lever = Math.Clamp(throttle, 0.0, 1.35);
        double dryThrust = Math.Clamp(thrustFraction, 0.0, 1.0);
        double dryBurn = dryThrust <= 0.85
            ? 18.0 + 27.0 * Math.Pow(dryThrust / 0.85, 1.5)
            : 45.0 + 45.0 * ((dryThrust - 0.85) / 0.15);

        if (lever <= 1.0) return dryBurn;

        // Crossing the AB gate lights a fuel-hungry first stage; deeper lever travel adds flow.
        double afterburnerCommand = (lever - 1.0) / 0.35;
        return dryBurn + 90.0 + 60.0 * afterburnerCommand;
    }
}
