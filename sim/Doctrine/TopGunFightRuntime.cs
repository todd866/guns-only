using GunsOnly.Sim.Missiles;

namespace GunsOnly.Sim.Doctrine;

/// Top Gun 1v1 ACM fight lane: AIM-9 magazine and in-flight stepping. Guns remain on the shared
/// SimulationSession weapon graph; this runtime owns heaters only for the Top Gun mission id.
public sealed class TopGunFightRuntime
{
    public const string MissionId = "mission.top-gun.acm.f14a-vs-mig28.v1";
    public const int DefaultMagazine = 2;
    public const double F14NormalLimitG = 7.5;
    public const double F14OverrideCommandLimitG = 11.0;
    // PROVISIONAL gameplay exposure budget, not an inference from the conventional 1.5x
    // limit/ultimate-load relationship. Brief 1-2 second emergency pulls must be survivable;
    // repeated or sustained maximum-severity abuse still has an irreversible consequence.
    const double EquivalentMaximumExposureSeconds = 8.0;

    readonly Aim9Surrogate _aim9;
    bool _detonationPending;
    double _f14OverLimitSeconds;
    double _f14StructuralFatigue01;
    bool _f14StructuralFailed;

    public TopGunFightRuntime(int rounds = DefaultMagazine) =>
        _aim9 = new Aim9Surrogate(rounds);

    public static bool IsTopGunMission(string? missionId) =>
        missionId == MissionId;

    public int Aim9Remaining => _aim9.RoundsRemaining;

    public Aim9Telemetry Aim9Live => _aim9.Live;

    public bool Aim9InFlight => _aim9.Live.State
        is Aim9FlightState.Seeking or Aim9FlightState.Tracking;

    public bool F14OverLimit { get; private set; }
    public double F14OverLimitSeconds => _f14OverLimitSeconds;
    public double F14StructuralFatigue01 => _f14StructuralFatigue01;
    public bool F14StructuralFailed => _f14StructuralFailed;

    /// <summary>
    /// Observe the ownship Tomcat's achieved load. Ordinary flight is protected at 7.5 G; Space
    /// deliberately enters an over-limit region that accumulates irreversible fatigue. A brief
    /// excursion is survivable; repeated or sustained over-G can exhaust the explicit mission
    /// strain budget. This models no binary real-aircraft ultimate-load or pilot-physiology limit.
    /// </summary>
    public bool ObserveF14Load(double actualG, double dt)
    {
        if (_f14StructuralFailed) return false;
        if (!double.IsFinite(actualG) || !double.IsFinite(dt) || dt <= 0.0) {
            F14OverLimit = false;
            return false;
        }

        F14OverLimit = actualG > F14NormalLimitG + 1e-6;
        if (!F14OverLimit) return false;

        _f14OverLimitSeconds += dt;
        double span = Math.Max(F14OverrideCommandLimitG - F14NormalLimitG, 1e-9);
        double severity = Math.Clamp((actualG - F14NormalLimitG) / span, 0.0, 1.0);
        _f14StructuralFatigue01 = Math.Clamp(
            _f14StructuralFatigue01
                + dt * severity * severity * severity / EquivalentMaximumExposureSeconds,
            0.0,
            1.0);
        if (_f14StructuralFatigue01 < 1.0) return false;

        _f14StructuralFailed = true;
        return true;
    }

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
    /// SURROGATE geometry from the published wings-forward / fully-swept spans. AircraftSim uses
    /// this same span to derive the live lift, induced-drag and transonic polar.
    /// </summary>
    public static double EffectiveTomcatWingSpanM(
        double mach, double casKts, double forwardSpanM = 19.53)
    {
        return EffectiveTomcatWingSpanMForSweep(
            F14WingSweep.DegreesFor(mach, casKts), forwardSpanM);
    }

    public static double EffectiveTomcatWingSpanMForSweep(
        double sweepDegrees, double forwardSpanM = 19.53)
    {
        double sweep = Math.Clamp(
            sweepDegrees, F14WingSweep.MinSweepDeg, F14WingSweep.MaxSweepDeg);
        double t = (sweep - F14WingSweep.MinSweepDeg)
            / Math.Max(F14WingSweep.MaxSweepDeg - F14WingSweep.MinSweepDeg, 1e-9);
        const double FullySweptSpanM = 11.63; // 38 ft 2 in
        double aftSpan = System.Math.Min(forwardSpanM, FullySweptSpanM);
        return forwardSpanM + (aftSpan - forwardSpanM) * t;
    }
}
