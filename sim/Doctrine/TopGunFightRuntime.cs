using GunsOnly.Sim.Missiles;

namespace GunsOnly.Sim.Doctrine;

/// Top Gun 1v1 ACM fight lane: AIM-9 magazine and in-flight stepping. Guns remain on the shared
/// SimulationSession weapon graph; this runtime owns heaters only for the Top Gun mission id.
public sealed class TopGunFightRuntime
{
    public const string MissionId = "mission.top-gun.acm.f14a-vs-mig28.v1";
    public const int DefaultMagazine = 2;

    readonly Aim9Surrogate _aim9;
    bool _detonationPending;

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

    public void Step(double dt, in Aim9Pose target) {
        Aim9FlightState before = _aim9.Live.State;
        _aim9.Step(dt, target);
        if (before != Aim9FlightState.Detonated
            && _aim9.Live.State == Aim9FlightState.Detonated)
            _detonationPending = true;
    }

    /// <summary>Consume the single gameplay edge produced by one physical proximity detonation.</summary>
    public bool ConsumeDetonation() {
        if (!_detonationPending) return false;
        _detonationPending = false;
        return true;
    }

    /// <summary>Move an already-launched round onto deterministic fuze geometry for integration tests.</summary>
    internal void SeedActiveMissileForProximityHit(in Aim9Pose target) {
        if (!Aim9InFlight)
            throw new InvalidOperationException("a live AIM-9 must be launched before test seeding");
        Vec3D approach = _aim9.Live.Velocity.Length > 1e-6
            ? _aim9.Live.Velocity.Normalized()
            : new Vec3D(0.0, 0.0, 1.0);
        _aim9.SeedInFlight(new Aim9Surrogate.InFlightSeed(
            Aim9FlightState.Tracking,
            target.Position - approach * 4.0,
            _aim9.Live.Velocity,
            _aim9.Live.SimTimeMs,
            approach,
            HasPreviousLos: true,
            LaunchTimeMs: _aim9.Live.SimTimeMs));
    }

    /// <summary>
    /// SURROGATE coarse aero: shrink effective span from the static mid-sweep Tomcat placeholder
    /// toward ~55% span at full sweep. Cosmetic schedule matches snapshot wing_sweep_deg.
    /// </summary>
    public static double EffectiveTomcatWingSpanM(
        double mach, double casKts, double midSpanM = 15.5)
    {
        return EffectiveTomcatWingSpanMForSweep(
            F14WingSweep.DegreesFor(mach, casKts), midSpanM);
    }

    public static double EffectiveTomcatWingSpanMForSweep(
        double sweepDegrees, double midSpanM = 15.5)
    {
        double sweep = Math.Clamp(
            sweepDegrees, F14WingSweep.MinSweepDeg, F14WingSweep.MaxSweepDeg);
        double t = (sweep - F14WingSweep.MinSweepDeg)
            / Math.Max(F14WingSweep.MaxSweepDeg - F14WingSweep.MinSweepDeg, 1e-9);
        const double MinSpanFraction = 0.55;
        return midSpanM * (1.0 - t * (1.0 - MinSpanFraction));
    }
}
