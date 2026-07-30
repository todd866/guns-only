namespace GunsOnly.Sim;

/// <summary>
/// Kernel-owned explanation for the current time-compression decision. These values are projected
/// into snapshots and telemetry so a replay can distinguish pilot selection, a safety hand-back,
/// and a renderer cost cap without inferring any of them from wall-clock cadence.
/// </summary>
public enum TimeCompressionInhibitReason {
    None,
    PilotDisabled,
    UnsupportedSortie,
    SessionInactive,
    TransitNotEstablished,
    CatapultOrConfiguration,
    ContactThreat,
    GunSolution,
    AutoGcas,
    Damage,
    FuelThreshold,
    ControlInput,
    RamTransition
}

/// <summary>
/// A presentation-independent, deterministic safety input. SimulationSession owns construction of
/// this record from authoritative state; keeping the decision pure makes every hand-back condition
/// independently executable in tests.
/// </summary>
internal readonly record struct TimeCompressionSafetyState(
    bool PilotEnabled,
    bool SupportedSortie,
    bool SessionActive,
    bool EstablishedTransit,
    bool CatapultOrConfigurationTransition,
    bool ContactInsideLedThreatRange,
    bool GunSolutionInEitherDirection,
    bool AutoGcasActivityOrLead,
    bool DamagePresent,
    bool FuelThresholdOrLead,
    bool ControlInputBeyondTrim,
    bool RamTransitionLead,
    int ApproachFactorCap);

internal static class TimeCompressionPolicy {
    // This is the kernel's transit request, not a renderer performance cap. The host may offer a
    // lower measured-cost ceiling on every frame; the accepted factor is projected authoritatively.
    // Eight times real time is reserved for distant, established transit. Predictable boundaries
    // taper through 4× and 2× before the existing 1× safety lead, so the aircraft never crosses a
    // contact, fuel, GCAS, or ram-transition handoff in one large presentation jump.
    public const int PreferredFactor = 8;
    public const double ThreatRangeM = 35_000.0;
    public const double BoundaryLeadSeconds = 12.0;
    public const double RamBoundaryLeadMach = 0.06;
    public const double RamTaperLeadMach = RamBoundaryLeadMach * 4.0;

    /// <summary>
    /// Deterministic approach ladder for boundaries which can be expressed as time remaining.
    /// A non-finite positive horizon means no approaching boundary; invalid/negative evidence
    /// fails safe to ordinary time.
    /// </summary>
    public static int FactorCapForLeadSeconds(double seconds) {
        if (double.IsPositiveInfinity(seconds)) return PreferredFactor;
        if (!double.IsFinite(seconds) || seconds <= BoundaryLeadSeconds) return 1;
        if (seconds <= BoundaryLeadSeconds * 2.0) return 2;
        if (seconds <= BoundaryLeadSeconds * 4.0) return 4;
        return PreferredFactor;
    }

    /// <summary>
    /// Mach-domain equivalent of the time ladder. The current reduced-order model does not expose
    /// a trustworthy time-to-transition, so its observable Mach margin is kept explicit rather
    /// than pretending an acceleration estimate is qualified.
    /// </summary>
    public static int FactorCapForRamMachMargin(double marginMach) {
        if (double.IsPositiveInfinity(marginMach)) return PreferredFactor;
        if (!double.IsFinite(marginMach) || marginMach <= RamBoundaryLeadMach) return 1;
        if (marginMach <= RamBoundaryLeadMach * 2.0) return 2;
        if (marginMach <= RamTaperLeadMach) return 4;
        return PreferredFactor;
    }

    public static int SelectFactor(in TimeCompressionSafetyState state,
        int hostMaximumFactor) {
        if (Evaluate(state) != TimeCompressionInhibitReason.None) return 1;
        int maximum = Math.Clamp(
            Math.Min(hostMaximumFactor, state.ApproachFactorCap),
            1,
            PreferredFactor);
        if (maximum >= 8) return 8;
        if (maximum >= 4) return 4;
        if (maximum >= 2) return 2;
        return 1;
    }

    public static TimeCompressionInhibitReason Evaluate(
        in TimeCompressionSafetyState state) {
        if (!state.PilotEnabled) return TimeCompressionInhibitReason.PilotDisabled;
        if (!state.SupportedSortie) return TimeCompressionInhibitReason.UnsupportedSortie;
        if (!state.SessionActive) return TimeCompressionInhibitReason.SessionInactive;
        if (state.ControlInputBeyondTrim)
            return TimeCompressionInhibitReason.ControlInput;
        if (state.ContactInsideLedThreatRange)
            return TimeCompressionInhibitReason.ContactThreat;
        if (state.GunSolutionInEitherDirection)
            return TimeCompressionInhibitReason.GunSolution;
        if (state.AutoGcasActivityOrLead)
            return TimeCompressionInhibitReason.AutoGcas;
        if (state.DamagePresent) return TimeCompressionInhibitReason.Damage;
        if (state.FuelThresholdOrLead)
            return TimeCompressionInhibitReason.FuelThreshold;
        if (state.RamTransitionLead)
            return TimeCompressionInhibitReason.RamTransition;
        if (state.CatapultOrConfigurationTransition)
            return TimeCompressionInhibitReason.CatapultOrConfiguration;
        if (!state.EstablishedTransit)
            return TimeCompressionInhibitReason.TransitNotEstablished;
        return TimeCompressionInhibitReason.None;
    }
}
