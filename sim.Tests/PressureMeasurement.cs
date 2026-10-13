using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

/// Quantities from living shooters are unioned before adding exposure. Trigger intent cannot
/// make a dead actor threatening, and an empty formation still contributes a passive interval.
internal readonly record struct PressureActor(bool Alive, bool Presenting, double RangeM,
    double NoseRad, double ConeRad, bool Trigger, bool NearFiring);

internal sealed class PressureExposure {
    public double LiveSeconds { get; private set; }
    public double PassiveSeconds { get; private set; }
    public double GunRangeSeconds { get; private set; }
    public double FiringSeconds { get; private set; }
    public double LongestPassive { get; private set; }
    public double LongestCredibleGap { get; private set; }
    public double FirstThreat { get; private set; } = double.NaN;
    public double FirstCredible { get; private set; } = double.NaN;
    public double SecondsSinceCredibleAttack => _credibleRun;
    double _passiveRun, _credibleRun;
    public void Add(bool playerAlive, double dt, ReadOnlySpan<PressureActor> actors) {
        if (!playerAlive) return;
        bool threat = false, credible = false, range = false, firing = false;
        foreach (var actor in actors) {
            if (!actor.Alive) continue;
            bool inRange = actor.RangeM is >= 120 and <= 900;
            range |= inRange;
            firing |= actor.Trigger;
            threat |= !actor.Presenting && (actor.Trigger
                || (actor.RangeM < 2500 && actor.NoseRad < 35 * Math.PI / 180));
            credible |= !actor.Presenting && inRange && actor.NoseRad <= actor.ConeRad
                && (actor.Trigger || actor.NearFiring);
        }
        if (threat && double.IsNaN(FirstThreat)) FirstThreat = LiveSeconds;
        if (credible && double.IsNaN(FirstCredible)) FirstCredible = LiveSeconds;
        LiveSeconds += dt;
        if (range) GunRangeSeconds += dt;
        if (firing) FiringSeconds += dt;
        _passiveRun = threat ? 0 : _passiveRun + dt;
        _credibleRun = credible ? 0 : _credibleRun + dt;
        if (!threat) PassiveSeconds += dt;
        LongestPassive = Math.Max(LongestPassive, _passiveRun);
        LongestCredibleGap = Math.Max(LongestCredibleGap, _credibleRun);
    }
}

/// Physical round identities include the owning gun, which remains stable through wingman
/// promotion. Kept gun references also retain airborne rounds after a shooter is defeated.
internal sealed class PressureRoundTracker {
    readonly Dictionary<(GunKill Gun, int Id), double> _closest = new();
    readonly Dictionary<GunKill, Dictionary<int, GunRound>> _previous = new();
    public int Near25 { get; private set; }
    public int Near50 { get; private set; }
    public int Near100 { get; private set; }
    public double FirstNear100 { get; private set; } = double.NaN;
    public double MinimumDistance { get; private set; } = double.PositiveInfinity;

    public void Observe(GunKill gun, Vec3D targetStart, Vec3D targetEnd, double endTime, double dt) {
        if (!_previous.TryGetValue(gun, out var previous))
            _previous[gun] = previous = new();
        var current = gun.RoundsInFlight;
        foreach (var round in current) {
            double duration = Math.Min(dt, round.AgeSeconds);
            Vec3D start = previous.TryGetValue(round.Id, out var old) ? old.Position
                : round.Position - round.Velocity * duration
                    + new Vec3D(0, -0.5 * GunKill.GravityMps2 * duration * duration, 0);
            double startFraction = 1 - duration / dt;
            ObserveSegment(gun, round.Id, start, round.Position,
                targetStart + (targetEnd - targetStart) * startFraction, targetEnd,
                endTime - duration, duration);
        }
        foreach (var old in previous.Values) {
            if (current.Any(r => r.Id == old.Id)) continue;
            // GunKill removes impacts/expired rounds after integrating this chord. Include the
            // last segment, so the round that actually hits is not lost from the distance bands.
            Vec3D end = old.Position + old.Velocity * dt
                + new Vec3D(0, -0.5 * GunKill.GravityMps2 * dt * dt, 0);
            ObserveSegment(gun, old.Id, old.Position, end, targetStart, targetEnd, endTime - dt, dt);
        }
        previous.Clear();
        foreach (var round in current) previous[round.Id] = round;
    }

    internal void ObserveSegment(GunKill shooter, int roundId, Vec3D start, Vec3D end,
        Vec3D targetStart, Vec3D targetEnd, double time, double dt) {
        Vec3D relative = start - targetStart;
        Vec3D delta = (end - targetEnd) - relative;
        double u = delta.Dot(delta) < 1e-12 ? 0 : Math.Clamp(-relative.Dot(delta) / delta.Dot(delta), 0, 1);
        double distance = (relative + delta * u).Length;
        var key = (shooter, roundId);
        double prior = _closest.GetValueOrDefault(key, double.PositiveInfinity);
        if (distance >= prior) return;
        _closest[key] = distance;
        MinimumDistance = Math.Min(MinimumDistance, distance);
        if (distance <= 100 && prior > 100) {
            Near100++;
            if (double.IsNaN(FirstNear100)) FirstNear100 = time + u * dt;
        }
        if (distance <= 50 && prior > 50) Near50++;
        if (distance <= 25 && prior > 25) Near25++;
    }
}
