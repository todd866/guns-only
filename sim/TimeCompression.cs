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
    bool RamTransitionLead);

internal static class TimeCompressionPolicy {
    // This is the kernel's transit request, not a renderer performance cap. The host may offer a
    // lower measured-cost ceiling on every frame; the accepted factor is projected authoritatively.
    // The 320 km Rapier intercept no longer needs a 16× transit. Four times real time keeps the
    // fixed-step hand-back small enough that presentation work does not hitch when the pilot takes
    // control, while still removing the quiet climb/cruise wait.
    public const int PreferredFactor = 4;
    public const double ThreatRangeM = 35_000.0;
    public const double BoundaryLeadSeconds = 12.0;
    public const double RamBoundaryLeadMach = 0.06;

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
