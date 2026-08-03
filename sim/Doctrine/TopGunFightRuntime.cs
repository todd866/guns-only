using GunsOnly.Sim.Missiles;

namespace GunsOnly.Sim.Doctrine;

/// Top Gun 1v1 ACM fight lane: AIM-9 magazine and in-flight stepping. Guns remain on the shared
/// SimulationSession weapon graph; this runtime owns heaters only for the Top Gun mission id.
public sealed class TopGunFightRuntime
{
    public const string MissionId = "mission.top-gun.acm.f14a-vs-mig28.v1";
    public const int DefaultMagazine = 2;

    readonly Aim9Surrogate _aim9;

    public TopGunFightRuntime(int rounds = DefaultMagazine) =>
        _aim9 = new Aim9Surrogate(rounds);

    public static bool IsTopGunMission(string? missionId) =>
        missionId == MissionId;

    public int Aim9Remaining => _aim9.RoundsRemaining;

    public Aim9Telemetry Aim9Live => _aim9.Live;

    public bool Aim9InFlight => _aim9.Live.State
        is Aim9FlightState.Seeking or Aim9FlightState.Tracking;

    public bool TryLaunchFoxTwo(in Aim9Pose shooter, in Aim9Pose target, double nowMs) =>
        _aim9.TryLaunch(shooter, target, nowMs);

    public void Step(double dt, in Aim9Pose target) => _aim9.Step(dt, target);

    /// <summary>
    /// SURROGATE coarse aero: shrink effective span from the static mid-sweep Tomcat placeholder
    /// toward ~55% span at full sweep. Cosmetic schedule matches snapshot wing_sweep_deg.
    /// </summary>
    public static double EffectiveTomcatWingSpanM(
        double mach, double casKts, double midSpanM = 15.5)
    {
        double sweep = F14WingSweep.DegreesFor(mach, casKts);
        double t = (sweep - F14WingSweep.MinSweepDeg)
            / Math.Max(F14WingSweep.MaxSweepDeg - F14WingSweep.MinSweepDeg, 1e-9);
        const double MinSpanFraction = 0.55;
        return midSpanM * (1.0 - t * (1.0 - MinSpanFraction));
    }
}
