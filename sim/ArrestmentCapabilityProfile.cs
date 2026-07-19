namespace GunsOnly.Sim;

/// <summary>
/// Immutable capability selected before an arrestment begins. The engine force curve and every
/// limit are properties of the gear, never a function of the engaging aircraft's kinetic energy.
/// </summary>
public sealed record ArrestmentCapabilityProfile {
    public string Id { get; }
    public double RunoutDistanceM { get; }
    public double InitialForceN { get; }
    public double PeakForceN { get; }
    public double FinalForceN { get; }
    public double PeakPayoutFraction { get; }
    public double RatedEnergyJ { get; }
    public double MaximumLineLoadN { get; }
    public double MaximumWireDeflectionM { get; }

    public ArrestmentCapabilityProfile(string id, double runoutDistanceM,
        double initialForceN, double peakForceN, double finalForceN,
        double peakPayoutFraction, double ratedEnergyJ,
        double maximumLineLoadN, double maximumWireDeflectionM) {
        if (string.IsNullOrWhiteSpace(id))
            throw new ArgumentException("A capability profile needs an identifier.", nameof(id));
        RequirePositiveFinite(runoutDistanceM, nameof(runoutDistanceM));
        RequirePositiveFinite(initialForceN, nameof(initialForceN));
        RequirePositiveFinite(peakForceN, nameof(peakForceN));
        RequirePositiveFinite(finalForceN, nameof(finalForceN));
        RequirePositiveFinite(ratedEnergyJ, nameof(ratedEnergyJ));
        RequirePositiveFinite(maximumLineLoadN, nameof(maximumLineLoadN));
        RequirePositiveFinite(maximumWireDeflectionM, nameof(maximumWireDeflectionM));
        if (!double.IsFinite(peakPayoutFraction)
            || peakPayoutFraction <= 0.0 || peakPayoutFraction >= 1.0)
            throw new ArgumentOutOfRangeException(nameof(peakPayoutFraction));

        Id = id;
        RunoutDistanceM = runoutDistanceM;
        InitialForceN = initialForceN;
        PeakForceN = peakForceN;
        FinalForceN = finalForceN;
        PeakPayoutFraction = peakPayoutFraction;
        RatedEnergyJ = ratedEnergyJ;
        MaximumLineLoadN = maximumLineLoadN;
        MaximumWireDeflectionM = maximumWireDeflectionM;
    }

    /// <summary>
    /// A deliberately provisional early-jet deck profile. These values are a coherent gameplay
    /// calibration, not a historical Essex-class arresting-engine or F-86 hook certification.
    /// Replace the whole profile when component-qualified evidence is available.
    /// </summary>
    public static ArrestmentCapabilityProfile ProvisionalKoreaJet { get; } = new(
        id: "PROVISIONAL_KOREA_JET_V1",
        runoutDistanceM: 96.0,
        initialForceN: 51_200.0,
        peakForceN: 159_000.0,
        finalForceN: 72_000.0,
        peakPayoutFraction: 0.55,
        ratedEnergyJ: 10_800_000.0,
        maximumLineLoadN: 180_000.0,
        maximumWireDeflectionM: 3.0);

    /// <summary>Fixed effective braking force at a given engine payout.</summary>
    public double ForceAtPayoutN(double payoutM) {
        double u = Math.Clamp(payoutM / RunoutDistanceM, 0.0, 1.0);
        if (u <= PeakPayoutFraction) {
            double local = SmoothStep(u / PeakPayoutFraction);
            return InitialForceN + (PeakForceN - InitialForceN) * local;
        }
        double descending = SmoothStep(
            (u - PeakPayoutFraction) / (1.0 - PeakPayoutFraction));
        return PeakForceN + (FinalForceN - PeakForceN) * descending;
    }

    /// <summary>
    /// Work under the complete fixed force curve. The effective energy capacity is the lesser of
    /// this integral and RatedEnergyJ; neither depends on the aircraft which later engages it.
    /// </summary>
    public double ForceCurveWorkJ => RunoutDistanceM * 0.5 * (
        PeakPayoutFraction * (InitialForceN + PeakForceN)
        + (1.0 - PeakPayoutFraction) * (PeakForceN + FinalForceN));

    public double EffectiveEnergyCapacityJ => Math.Min(RatedEnergyJ, ForceCurveWorkJ);

    static double SmoothStep(double x) => x * x * (3.0 - 2.0 * x);

    static void RequirePositiveFinite(double value, string parameterName) {
        if (!double.IsFinite(value) || value <= 0.0)
            throw new ArgumentOutOfRangeException(parameterName);
    }
}
