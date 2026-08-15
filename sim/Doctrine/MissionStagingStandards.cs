namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// Player-facing mission pacing invariants. These are acceptance limits, not presentation copy:
/// a mission that starts on a real operating surface must earn its first engagement through a
/// flown departure and ingress instead of placing a target over the fence.
/// </summary>
public static class MissionStagingStandards
{
    public const double MinimumColdLaunchToContactSeconds = 60.0;

    // The authored NOE ingress is flown at about 120 kt. This is the mission profile the route
    // geometry and its one-minute pacing contract are designed around; an overspeed dash is a
    // player choice, not the timing basis for moving every objective farther up the finite canyon.
    public const double CobraAuthoredIngressSpeedMps = 62.0;

    public static double MinimumContactSeparationM(double conservativeMaximumSpeedMps)
    {
        if (!double.IsFinite(conservativeMaximumSpeedMps) || conservativeMaximumSpeedMps <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(conservativeMaximumSpeedMps));
        return MinimumColdLaunchToContactSeconds * conservativeMaximumSpeedMps;
    }
}
