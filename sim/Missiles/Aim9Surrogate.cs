namespace GunsOnly.Sim.Missiles;

public enum Aim9FlightState
{
    Safe,
    Seeking,
    Tracking,
    Lost,
    Detonated,
    Expired,
}

/// Shooter/target kinematics for unit tests and session wiring without pulling in AircraftState.
public readonly record struct Aim9Pose(Vec3D Position, Vec3D Velocity);

/// AIM-9-class short-range IR heater surrogate for Top Gun v1.
/// Epistemic: surrogate / provisional — open-source range band only, not classified envelopes.
public sealed class Aim9Surrogate
{
    // Open AIM-9 family public figures (Jane's / USAF fact sheets): ~0.6–18 km band, Mach ~2.5.
    public const double MinLaunchRangeM = 600.0;
    public const double MaxLaunchRangeM = 18_000.0;

    // Seeker gimbal / FOV surrogate — AIM-9 seeker generations vary; ±50° is a conservative toy.
    const double MaxBoresightDeg = 50.0;
    // Track-rate limit surrogate — real seekers lose lock under high angular rates.
    const double MaxTrackRateDegPerSec = 18.0;

    // Flight kinematics (surrogate): ~Mach 2.5 at altitude, ~85 kg class round.
    const double CruiseSpeedMps = 850.0;
    const double LaunchBoostMps = 120.0;
    const double MaxFlightTimeSec = 30.0;
    const double ProximityFuzeRadiusM = 8.0;
    const double NavigationConstant = 3.0;
    const double MaxLateralAccelMps2 = 35.0 * 9.80665;

    int _roundsRemaining;
    Aim9FlightState _state = Aim9FlightState.Safe;
    Vec3D _position;
    Vec3D _velocity;
    double _simTimeMs;
    double _launchTimeMs;
    Vec3D _previousLos;
    bool _hasPreviousLos;
    double _lastBoresightDeg;
    double _lastTrackRateDegPerSec;
    Aim9Pose? _fixtureTarget;

    public Aim9Surrogate(int rounds = 2)
    {
        _roundsRemaining = Math.Max(0, rounds);
    }

    public int RoundsRemaining => _roundsRemaining;

    public Aim9Telemetry Live => new(
        _state,
        _position,
        _velocity,
        _simTimeMs,
        _lastBoresightDeg,
        _lastTrackRateDegPerSec);

    /// Exposed for proximity-hit fixture assertions only.
    internal Aim9Pose FixtureTarget => _fixtureTarget ?? default;

    public bool TryLaunch(in Aim9Pose shooter, in Aim9Pose target, double nowMs)
    {
        if (_state is Aim9FlightState.Seeking or Aim9FlightState.Tracking)
            return false;
        if (_roundsRemaining <= 0)
            return false;

        double rangeM = (target.Position - shooter.Position).Length;
        if (rangeM < MinLaunchRangeM || rangeM > MaxLaunchRangeM || rangeM <= 1e-6)
            return false;

        Vec3D launchDir = shooter.Velocity.Length > 1e-3
            ? shooter.Velocity.Normalized()
            : new Vec3D(0, 0, 1);

        _roundsRemaining--;
        _state = Aim9FlightState.Seeking;
        _position = shooter.Position;
        _velocity = shooter.Velocity + launchDir * LaunchBoostMps;
        _simTimeMs = nowMs;
        _launchTimeMs = nowMs;
        _hasPreviousLos = false;
        _previousLos = Vec3D.Zero;
        _lastBoresightDeg = 0;
        _lastTrackRateDegPerSec = 0;
        return true;
    }

    public void Step(double dt, in Aim9Pose target)
    {
        if (dt <= 0 || _state is Aim9FlightState.Safe or Aim9FlightState.Lost
            or Aim9FlightState.Detonated or Aim9FlightState.Expired)
            return;

        _simTimeMs += dt * 1000.0;
        double flightSec = (_simTimeMs - _launchTimeMs) / 1000.0;
        if (flightSec >= MaxFlightTimeSec)
        {
            _state = Aim9FlightState.Expired;
            return;
        }

        Vec3D toTarget = target.Position - _position;
        double rangeM = toTarget.Length;
        if (rangeM <= ProximityFuzeRadiusM)
        {
            _state = Aim9FlightState.Detonated;
            return;
        }

        Vec3D losUnit = toTarget * (1.0 / rangeM);
        Vec3D velDir = _velocity.Length > 1e-3 ? _velocity.Normalized() : losUnit;
        double boresightDeg = Math.Acos(Math.Clamp(velDir.Dot(losUnit), -1.0, 1.0)) * (180.0 / Math.PI);

        double trackRateDegPerSec = 0;
        if (_hasPreviousLos)
        {
            double losDelta = Math.Acos(Math.Clamp(_previousLos.Dot(losUnit), -1.0, 1.0));
            trackRateDegPerSec = losDelta / dt * (180.0 / Math.PI);
        }
        _previousLos = losUnit;
        _hasPreviousLos = true;
        _lastBoresightDeg = boresightDeg;
        _lastTrackRateDegPerSec = trackRateDegPerSec;

        if (boresightDeg > MaxBoresightDeg || trackRateDegPerSec > MaxTrackRateDegPerSec)
        {
            _state = Aim9FlightState.Lost;
            return;
        }

        if (_state == Aim9FlightState.Seeking)
            _state = Aim9FlightState.Tracking;

        ApplyProportionalNavigation(dt, target, losUnit);

        // Speed clamp toward cruise; surrogate motor burn is not modeled separately.
        double speed = _velocity.Length;
        if (speed > 1e-3)
        {
            double targetSpeed = Math.Min(CruiseSpeedMps, speed + 40.0 * dt);
            _velocity = _velocity.Normalized() * targetSpeed;
        }

        _position += _velocity * dt;

        // Miss if we pass the target without fuze.
        if ((_position - target.Position).Length > rangeM + 200.0 && rangeM > ProximityFuzeRadiusM * 4)
        {
            _state = Aim9FlightState.Expired;
        }
    }

    void ApplyProportionalNavigation(double dt, in Aim9Pose target, Vec3D losUnit)
    {
        Vec3D relativePos = target.Position - _position;
        Vec3D relativeVel = target.Velocity - _velocity;
        double rangeSq = Math.Max(relativePos.Dot(relativePos), 1.0);
        Vec3D losRate = relativePos.Cross(relativeVel) * (1.0 / rangeSq);
        Vec3D accel = losRate.Cross(_velocity) * NavigationConstant;
        double accelMag = accel.Length;
        if (accelMag > MaxLateralAccelMps2 && accelMag > 1e-6)
            accel = accel * (MaxLateralAccelMps2 / accelMag);
        _velocity += accel * dt;
    }

    /// Missile in flight with target 90° off boresight (east of northbound flight path).
    public static Aim9Surrogate TestFixture_OffBoresightLoss()
    {
        var aim9 = new Aim9Surrogate(rounds: 1);
        var shooter = new Aim9Pose(new Vec3D(0, 5000, 0), new Vec3D(0, 0, 400));
        var ahead = new Aim9Pose(new Vec3D(0, 5000, 2000), Vec3D.Zero);
        aim9.TryLaunch(shooter, ahead, nowMs: 0);
        aim9._state = Aim9FlightState.Tracking;
        aim9._position = new Vec3D(0, 5000, 1000);
        aim9._velocity = new Vec3D(0, 0, 400);
        aim9._hasPreviousLos = true;
        aim9._previousLos = new Vec3D(0, 0, 1);
        return aim9;
    }

    /// Missile nearly on top of target for proximity fuze.
    public static Aim9Surrogate TestFixture_ProximityHit()
    {
        var aim9 = new Aim9Surrogate(rounds: 1);
        var target = new Aim9Pose(new Vec3D(0, 5000, 3000), new Vec3D(0, 0, 200));
        aim9._fixtureTarget = target;
        var shooter = new Aim9Pose(new Vec3D(0, 5000, 0), new Vec3D(0, 0, 400));
        aim9.TryLaunch(shooter, target, nowMs: 0);
        aim9._state = Aim9FlightState.Tracking;
        aim9._position = target.Position - new Vec3D(0, 0, ProximityFuzeRadiusM * 0.5);
        aim9._velocity = new Vec3D(0, 0, 400);
        aim9._hasPreviousLos = true;
        aim9._previousLos = new Vec3D(0, 0, 1);
        return aim9;
    }
}
