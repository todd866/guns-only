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

    /// <summary>
    /// Public-data Mk 7 Mod 3 surrogate for the Top Gun carrier. NAVAIR's carrier-approach review
    /// publishes 43.5 million ft-lb maximum absorption and 340 ft service runout for deck pendants
    /// (NAWCADPAX/TR-2002/71, table 3):
    /// https://rhef.net/docs/HQs/NAVAIR_2002_71.pdf
    ///
    /// The reduced-order arrestment model cannot reproduce the Mk 7's aircraft-weight setting or
    /// constant-runout valve. Equal initial/peak/final force therefore uses the published energy
    /// divided by published runout: a transparent constant-work surrogate, not an invented force
    /// curve. Its TensionN is one effective aircraft-axis restraint force, not the tensile load in
    /// an individual purchase cable or cross-deck pendant, so the report's cable breaking strengths
    /// are deliberately not mapped onto MaximumLineLoadN. Peak position is immaterial for equal
    /// forces; the matching reduced-order load ceiling avoids inventing an unverified safety factor.
    /// Wire deflection retains the established presentation-only carrier value because the report
    /// does not publish that visual geometry.
    /// </summary>
    public static ArrestmentCapabilityProfile Mk7Mod3PublicDataSurrogate { get; } = new(
        id: "MK7_MOD3_PUBLIC_DATA_SURROGATE_V1",
        runoutDistanceM: 103.632,
        initialForceN: 569_110.706658329,
        peakForceN: 569_110.706658329,
        finalForceN: 569_110.706658329,
        peakPayoutFraction: 0.5,
        ratedEnergyJ: 58_978_080.752415918,
        maximumLineLoadN: 569_110.706658329,
        maximumWireDeflectionM: ProvisionalKoreaJet.MaximumWireDeflectionM);

    /// <summary>
    /// Provisional high-energy gear for Rapier's purpose-built fixed arresting strip. The longer
    /// payout and heavier machinery are credible costs paid by the ground installation; they are
    /// not silently granted to the shorter carrier deck or inferred from the arriving aircraft.
    /// </summary>
    public static ArrestmentCapabilityProfile ProvisionalRapierLandStrip { get; } = new(
        id: "PROVISIONAL_RAPIER_LAND_STRIP_V1",
        runoutDistanceM: 180.0,
        initialForceN: 100_000.0,
        peakForceN: 300_000.0,
        finalForceN: 160_000.0,
        peakPayoutFraction: 0.55,
        ratedEnergyJ: 35_000_000.0,
        maximumLineLoadN: 350_000.0,
        maximumWireDeflectionM: 4.5);

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
