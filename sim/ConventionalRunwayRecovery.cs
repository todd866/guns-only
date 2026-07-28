namespace GunsOnly.Sim;

/// <summary>
/// A fixed conventional runway in the simulation world. <see cref="Threshold"/> is the centre of
/// the approach-end threshold at pavement height; positive along-runway distance follows the
/// landing/rollout heading. This is intentionally separate from <see cref="Carrier"/> so a
/// land-based aircraft never inherits arresting wires, ship motion, or a tailhook outcome.
/// </summary>
public sealed record ConventionalRunway {
    public string Id { get; }
    public string DisplayName { get; }
    public Vec3D Threshold { get; }
    public double HeadingRad { get; }
    public double LengthM { get; }
    public double WidthM { get; }
    public double TouchdownAimAlongM { get; }

    public ConventionalRunway(
        string id,
        string displayName,
        in Vec3D threshold,
        double headingRad,
        double lengthM,
        double widthM,
        double touchdownAimAlongM = 450.0) {
        if (string.IsNullOrWhiteSpace(id))
            throw new ArgumentException("runway id is required", nameof(id));
        if (string.IsNullOrWhiteSpace(displayName))
            throw new ArgumentException("runway display name is required", nameof(displayName));
        if (!threshold.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(threshold));
        if (!double.IsFinite(headingRad))
            throw new ArgumentOutOfRangeException(nameof(headingRad));
        if (!double.IsFinite(lengthM) || lengthM < 600.0)
            throw new ArgumentOutOfRangeException(nameof(lengthM));
        if (!double.IsFinite(widthM) || widthM < 15.0)
            throw new ArgumentOutOfRangeException(nameof(widthM));
        if (!double.IsFinite(touchdownAimAlongM)
            || touchdownAimAlongM < 0.0 || touchdownAimAlongM >= lengthM)
            throw new ArgumentOutOfRangeException(nameof(touchdownAimAlongM));

        Id = id;
        DisplayName = displayName;
        Threshold = threshold;
        HeadingRad = NormalizeHeading(headingRad);
        LengthM = lengthM;
        WidthM = widthM;
        TouchdownAimAlongM = touchdownAimAlongM;
    }

    public static ConventionalRunway FromRecoveryPlan(RecoveryPlan plan) {
        ArgumentNullException.ThrowIfNull(plan);
        ConventionalRunwayGeometry geometry = plan.ConventionalRunway
            ?? throw new ArgumentException(
                "Recovery plan does not define a conventional runway.", nameof(plan));
        Vec3D aimOffset = plan.Position - geometry.ThresholdPosition;
        double aimAlongM = aimOffset.Dot(geometry.RolloutDirection);
        return new ConventionalRunway(
            $"{plan.Id}.runway",
            plan.DisplayName,
            geometry.ThresholdPosition,
            geometry.LandingHeadingRad,
            geometry.LengthM,
            geometry.WidthM,
            aimAlongM);
    }

    public Vec3D Forward => new(Math.Sin(HeadingRad), 0.0, Math.Cos(HeadingRad));
    public Vec3D Right => new(Math.Cos(HeadingRad), 0.0, -Math.Sin(HeadingRad));
    public Vec3D TouchdownAimPoint => SurfacePoint(TouchdownAimAlongM);

    public (double along, double cross, double height) Frame(in Vec3D point) {
        Vec3D relative = point - Threshold;
        return (relative.Dot(Forward), relative.Dot(Right), relative.Y);
    }

    public Vec3D SurfacePoint(double alongM, double crossM = 0.0) =>
        Threshold + Forward * alongM + Right * crossM;

    public bool ContainsPavement(in Vec3D point, double marginM = 0.0) {
        var (along, cross, _) = Frame(point);
        return along >= -marginM && along <= LengthM + marginM
            && Math.Abs(cross) <= WidthM * 0.5 + marginM;
    }

    static double NormalizeHeading(double headingRad) =>
        Math.Atan2(Math.Sin(headingRad), Math.Cos(headingRad));
}

public enum RunwayRecoveryPhase {
    Airborne,
    Rollout,
    Recovered,
    Excursion,
    Crashed
}

[Flags]
public enum RunwayTouchdownDeviation {
    None = 0,
    GearNotDown = 1 << 0,
    ExcessiveSink = 1 << 1,
    TooSlow = 1 << 2,
    TooFast = 1 << 3,
    ExcessiveLateralSpeed = 1 << 4,
    ExcessiveLineup = 1 << 5,
    LongLanding = 1 << 6,
    InvalidAttitude = 1 << 7,
    Inverted = 1 << 8,
    ExcessiveBank = 1 << 9,
    ExcessivePitch = 1 << 10,
    ExcessiveHeading = 1 << 11
}

/// <summary>
/// Provisional, visible conventional-landing envelope for the public-data fast-jet surrogate.
/// These are simulation/training limits, not a claim to reproduce an unpublished F-22 landing
/// control law or structural certification deck.
/// </summary>
public sealed record ConventionalLandingEnvelope(
    double MinimumAirspeedMps = 55.0,
    double MaximumAirspeedMps = 95.0,
    double MaximumSinkRateMps = 4.0,
    double MaximumLateralSpeedMps = 7.0,
    double MaximumLineupErrorM = 18.0,
    double MaximumTouchdownAlongFraction = 0.58,
    double MaximumBankAngleRad = 15.0 * Math.PI / 180.0,
    double MinimumPitchAngleRad = -5.0 * Math.PI / 180.0,
    double MaximumPitchAngleRad = 20.0 * Math.PI / 180.0,
    double MaximumHeadingErrorRad = 12.0 * Math.PI / 180.0,
    // Provisional public-data surrogate distance from the AircraftState reference point to the
    // runway plane with the landing gear loaded. This prevents a point-mass/camera origin from
    // being buried in the pavement without claiming unpublished F-22 gear geometry.
    double WheelContactReferenceHeightM = 1.8) {
    public void Validate() {
        if (!double.IsFinite(MinimumAirspeedMps)
            || !double.IsFinite(MaximumAirspeedMps)
            || MinimumAirspeedMps < 0.0
            || MaximumAirspeedMps <= MinimumAirspeedMps)
            throw new ArgumentOutOfRangeException(nameof(MinimumAirspeedMps));
        if (!double.IsFinite(MaximumSinkRateMps) || MaximumSinkRateMps <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(MaximumSinkRateMps));
        if (!double.IsFinite(MaximumLateralSpeedMps) || MaximumLateralSpeedMps <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(MaximumLateralSpeedMps));
        if (!double.IsFinite(MaximumLineupErrorM) || MaximumLineupErrorM <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(MaximumLineupErrorM));
        if (!double.IsFinite(MaximumTouchdownAlongFraction)
            || MaximumTouchdownAlongFraction <= 0.0
            || MaximumTouchdownAlongFraction >= 1.0)
            throw new ArgumentOutOfRangeException(nameof(MaximumTouchdownAlongFraction));
        if (!double.IsFinite(MaximumBankAngleRad)
            || MaximumBankAngleRad <= 0.0 || MaximumBankAngleRad >= Math.PI / 2.0)
            throw new ArgumentOutOfRangeException(nameof(MaximumBankAngleRad));
        if (!double.IsFinite(MinimumPitchAngleRad)
            || !double.IsFinite(MaximumPitchAngleRad)
            || MinimumPitchAngleRad <= -Math.PI / 2.0
            || MaximumPitchAngleRad >= Math.PI / 2.0
            || MaximumPitchAngleRad <= MinimumPitchAngleRad)
            throw new ArgumentOutOfRangeException(nameof(MinimumPitchAngleRad));
        if (!double.IsFinite(MaximumHeadingErrorRad)
            || MaximumHeadingErrorRad <= 0.0
            || MaximumHeadingErrorRad >= Math.PI / 2.0)
            throw new ArgumentOutOfRangeException(nameof(MaximumHeadingErrorRad));
        if (!double.IsFinite(WheelContactReferenceHeightM)
            || WheelContactReferenceHeightM <= 0.0
            || WheelContactReferenceHeightM > 5.0)
            throw new ArgumentOutOfRangeException(nameof(WheelContactReferenceHeightM));
    }
}

public readonly record struct RunwayTouchdownResult(
    bool Contact,
    bool Survivable,
    RunwayTouchdownDeviation Deviations,
    double AlongM,
    double CrossM,
    double SinkRateMps,
    double ForwardSpeedMps,
    double LateralSpeedMps,
    double AirspeedMps) {
    public static RunwayTouchdownResult None => new(
        Contact: false,
        Survivable: false,
        Deviations: RunwayTouchdownDeviation.None,
        AlongM: 0.0,
        CrossM: 0.0,
        SinkRateMps: 0.0,
        ForwardSpeedMps: 0.0,
        LateralSpeedMps: 0.0,
        AirspeedMps: 0.0);
}

/// <summary>
/// Deterministic wheel-contact and ground-roll model for one conventional runway recovery.
/// Airborne aerodynamics remain owned by <see cref="AircraftSim"/>. Once valid main-gear contact
/// occurs, this model owns the constrained ground kinematics until the aircraft stops or departs
/// the pavement. Pulling the throttle to idle commands the strongest simulated wheel braking; high
/// power deliberately lengthens the rollout and can produce an overrun.
/// </summary>
public sealed class ConventionalRunwayRecoveryModel {
    const double ContactToleranceM = 0.08;
    const double StopSpeedMps = 1.0;
    const double RollingResistanceMps2 = 0.22;
    const double AerodynamicDragFactor = 0.00022;
    const double MaximumWheelBrakeMps2 = 3.4;
    const double FullBrakeThrottle = 0.22;
    const double LateralDampingPerSecond = 1.8;

    readonly ConventionalRunway _runway;
    readonly ConventionalLandingEnvelope _envelope;
    AircraftState _state;

    public ConventionalRunway Runway => _runway;
    public RunwayRecoveryPhase Phase { get; private set; } = RunwayRecoveryPhase.Airborne;
    public RunwayTouchdownResult Touchdown { get; private set; } =
        RunwayTouchdownResult.None;
    public AircraftState State => _state;
    public double ReferenceHeightM => _envelope.WheelContactReferenceHeightM;
    public bool WeightOnWheels => Phase is RunwayRecoveryPhase.Rollout
        or RunwayRecoveryPhase.Recovered;

    public ConventionalRunwayRecoveryModel(
        ConventionalRunway runway,
        ConventionalLandingEnvelope? envelope = null) {
        _runway = runway ?? throw new ArgumentNullException(nameof(runway));
        _envelope = envelope ?? new ConventionalLandingEnvelope();
        _envelope.Validate();
    }

    public void Reset() {
        Phase = RunwayRecoveryPhase.Airborne;
        Touchdown = RunwayTouchdownResult.None;
        _state = default;
    }

    /// <summary>
    /// Inspect one swept airborne step. Returns false when the segment did not contact this
    /// runway; natural terrain/collision handling remains authoritative in that case.
    /// </summary>
    public bool TryTouchdown(
        in AircraftState previous,
        in AircraftState current,
        bool gearDownAndLocked,
        double airspeedMps) {
        if (Phase != RunwayRecoveryPhase.Airborne) return false;
        if (!previous.Position.IsFinite || !current.Position.IsFinite
            || !double.IsFinite(current.Speed))
            throw new ArgumentOutOfRangeException(nameof(current));
        if (!double.IsFinite(airspeedMps) || airspeedMps < 0.0)
            throw new ArgumentOutOfRangeException(nameof(airspeedMps));

        var previousFrame = _runway.Frame(previous.Position);
        var currentFrame = _runway.Frame(current.Position);
        double previousClearanceM =
            previousFrame.height - _envelope.WheelContactReferenceHeightM;
        double currentClearanceM =
            currentFrame.height - _envelope.WheelContactReferenceHeightM;
        bool descendingThroughSurface = previousClearanceM > -ContactToleranceM
            && currentClearanceM <= ContactToleranceM
            && current.VelocityVector().Y < 0.0;
        if (!descendingThroughSurface) return false;

        double heightDelta = previousClearanceM - currentClearanceM;
        double fraction = Math.Abs(heightDelta) < 1e-9
            ? 1.0
            : Math.Clamp(previousClearanceM / heightDelta, 0.0, 1.0);
        Vec3D contactPoint = previous.Position
            + (current.Position - previous.Position) * fraction;
        if (!_runway.ContainsPavement(contactPoint)) return false;

        var (along, cross, _) = _runway.Frame(contactPoint);
        Vec3D velocity = current.VelocityVector();
        double forwardSpeed = velocity.Dot(_runway.Forward);
        double lateralSpeed = velocity.Dot(_runway.Right);
        double sinkRate = Math.Max(0.0, -velocity.Y);

        RunwayTouchdownDeviation deviations = RunwayTouchdownDeviation.None;
        if (!gearDownAndLocked)
            deviations |= RunwayTouchdownDeviation.GearNotDown;
        if (sinkRate > _envelope.MaximumSinkRateMps)
            deviations |= RunwayTouchdownDeviation.ExcessiveSink;
        // Structural/aerodynamic landing limits are air-relative. Ground-relative along/cross
        // components remain authoritative for pavement tracking and rollout distance, but a
        // headwind must not make a healthy approach look too slow (nor a tailwind too fast).
        if (airspeedMps < _envelope.MinimumAirspeedMps)
            deviations |= RunwayTouchdownDeviation.TooSlow;
        if (airspeedMps > _envelope.MaximumAirspeedMps)
            deviations |= RunwayTouchdownDeviation.TooFast;
        if (Math.Abs(lateralSpeed) > _envelope.MaximumLateralSpeedMps)
            deviations |= RunwayTouchdownDeviation.ExcessiveLateralSpeed;
        if (Math.Abs(cross) > Math.Min(
            _envelope.MaximumLineupErrorM, _runway.WidthM * 0.5))
            deviations |= RunwayTouchdownDeviation.ExcessiveLineup;
        if (along > _runway.LengthM * _envelope.MaximumTouchdownAlongFraction)
            deviations |= RunwayTouchdownDeviation.LongLanding;
        deviations |= AttitudeDeviations(current);

        const RunwayTouchdownDeviation fatal =
            RunwayTouchdownDeviation.GearNotDown
            | RunwayTouchdownDeviation.ExcessiveSink
            | RunwayTouchdownDeviation.TooSlow
            | RunwayTouchdownDeviation.TooFast
            | RunwayTouchdownDeviation.ExcessiveLateralSpeed
            | RunwayTouchdownDeviation.ExcessiveLineup
            | RunwayTouchdownDeviation.InvalidAttitude
            | RunwayTouchdownDeviation.Inverted
            | RunwayTouchdownDeviation.ExcessiveBank
            | RunwayTouchdownDeviation.ExcessivePitch
            | RunwayTouchdownDeviation.ExcessiveHeading;
        bool survivable = (deviations & fatal) == 0;
        Touchdown = new RunwayTouchdownResult(
            Contact: true,
            Survivable: survivable,
            Deviations: deviations,
            AlongM: along,
            CrossM: cross,
            SinkRateMps: sinkRate,
            ForwardSpeedMps: forwardSpeed,
            LateralSpeedMps: lateralSpeed,
            AirspeedMps: airspeedMps);
        if (!survivable) {
            Phase = RunwayRecoveryPhase.Crashed;
            _state = current;
            return true;
        }

        Phase = RunwayRecoveryPhase.Rollout;
        _state = GroundState(along, cross, Math.Max(0.0, forwardSpeed), lateralSpeed,
            current.Mass);
        return true;
    }

    RunwayTouchdownDeviation AttitudeDeviations(in AircraftState state) {
        QuaternionD attitude = state.BodyAttitude;
        if (!attitude.IsFinite || attitude.LengthSquared < 1e-12)
            return RunwayTouchdownDeviation.InvalidAttitude;

        attitude = attitude.Normalized();
        Vec3D bodyForward = attitude.Rotate(new Vec3D(0.0, 0.0, 1.0));
        Vec3D bodyUp = attitude.Rotate(new Vec3D(0.0, 1.0, 0.0));
        if (!bodyForward.IsFinite || !bodyUp.IsFinite)
            return RunwayTouchdownDeviation.InvalidAttitude;

        RunwayTouchdownDeviation deviations = RunwayTouchdownDeviation.None;
        if (bodyUp.Y <= 0.0)
            deviations |= RunwayTouchdownDeviation.Inverted;

        double pitchRad = Math.Asin(Math.Clamp(bodyForward.Y, -1.0, 1.0));
        if (pitchRad < _envelope.MinimumPitchAngleRad
            || pitchRad > _envelope.MaximumPitchAngleRad)
            deviations |= RunwayTouchdownDeviation.ExcessivePitch;

        double horizontalForwardLength = Math.Sqrt(
            bodyForward.X * bodyForward.X + bodyForward.Z * bodyForward.Z);
        if (horizontalForwardLength < 1e-9) {
            deviations |= RunwayTouchdownDeviation.ExcessiveHeading;
        } else {
            Vec3D horizontalForward = new(
                bodyForward.X / horizontalForwardLength,
                0.0,
                bodyForward.Z / horizontalForwardLength);
            double headingErrorRad = Math.Atan2(
                horizontalForward.Dot(_runway.Right),
                horizontalForward.Dot(_runway.Forward));
            if (Math.Abs(headingErrorRad) > _envelope.MaximumHeadingErrorRad)
                deviations |= RunwayTouchdownDeviation.ExcessiveHeading;
        }

        Vec3D levelUp = new Vec3D(0.0, 1.0, 0.0)
            - bodyForward * bodyForward.Y;
        if (levelUp.Length < 1e-9) {
            deviations |= RunwayTouchdownDeviation.ExcessiveBank;
        } else {
            levelUp = levelUp.Normalized();
            Vec3D levelRight = levelUp.Cross(bodyForward).Normalized();
            double bankRad = Math.Atan2(
                bodyUp.Dot(levelRight), bodyUp.Dot(levelUp));
            if (Math.Abs(bankRad) > _envelope.MaximumBankAngleRad)
                deviations |= RunwayTouchdownDeviation.ExcessiveBank;
        }
        return deviations;
    }

    public AircraftState Step(double deltaSeconds, double throttleFraction,
        double? massKg = null) {
        if (Phase != RunwayRecoveryPhase.Rollout) {
            // A non-KIO stop deliberately keeps the live sortie running on the runway. Fuel and
            // engine systems therefore continue to advance, and the cached zero-speed constraint
            // must retain their newly authoritative gross mass rather than restoring the mass from
            // the stop tick. Crashed/excursion states remain immutable terminal contact evidence.
            if (Phase == RunwayRecoveryPhase.Recovered
                && massKg is { } recoveredMassKg) {
                if (!double.IsFinite(recoveredMassKg) || recoveredMassKg <= 0.0)
                    throw new ArgumentOutOfRangeException(nameof(massKg));
                _state = _state with { Mass = recoveredMassKg };
            }
            return _state;
        }
        if (!double.IsFinite(deltaSeconds) || deltaSeconds <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(deltaSeconds));
        if (!double.IsFinite(throttleFraction))
            throw new ArgumentOutOfRangeException(nameof(throttleFraction));
        if (massKg is { } suppliedMassKg
            && (!double.IsFinite(suppliedMassKg) || suppliedMassKg <= 0.0))
            throw new ArgumentOutOfRangeException(nameof(massKg));

        var (along, cross, _) = _runway.Frame(_state.Position);
        Vec3D velocity = _state.VelocityVector();
        double forwardBefore = Math.Max(0.0, velocity.Dot(_runway.Forward));
        double lateralBefore = velocity.Dot(_runway.Right);
        double throttle = Math.Clamp(throttleFraction, 0.0, 1.5);
        double brakeFraction = Math.Clamp(
            (FullBrakeThrottle - throttle) / FullBrakeThrottle, 0.0, 1.0);
        double deceleration = RollingResistanceMps2
            + AerodynamicDragFactor * forwardBefore * forwardBefore
            + MaximumWheelBrakeMps2 * brakeFraction;
        double forwardAfter = Math.Max(0.0,
            forwardBefore - deceleration * deltaSeconds);
        double lateralAfter = lateralBefore
            * Math.Exp(-LateralDampingPerSecond * deltaSeconds);
        double nextAlong = along + (forwardBefore + forwardAfter) * 0.5 * deltaSeconds;
        double nextCross = cross + (lateralBefore + lateralAfter) * 0.5 * deltaSeconds;

        double nextMassKg = massKg ?? _state.Mass;
        _state = GroundState(nextAlong, nextCross, forwardAfter, lateralAfter,
            nextMassKg);
        if (nextAlong > _runway.LengthM
            || Math.Abs(nextCross) > _runway.WidthM * 0.5) {
            Phase = RunwayRecoveryPhase.Excursion;
        } else if (Math.Sqrt(
            forwardAfter * forwardAfter + lateralAfter * lateralAfter) <= StopSpeedMps) {
            Phase = RunwayRecoveryPhase.Recovered;
            _state = GroundState(nextAlong, nextCross, 0.0, 0.0, nextMassKg);
        }
        return _state;
    }

    AircraftState GroundState(
        double alongM,
        double crossM,
        double forwardSpeedMps,
        double lateralSpeedMps,
        double massKg) {
        Vec3D velocity = _runway.Forward * forwardSpeedMps
            + _runway.Right * lateralSpeedMps;
        double speed = velocity.Length;
        Vec3D forward = speed > 1e-9 ? velocity * (1.0 / speed) : _runway.Forward;
        double chi = Math.Atan2(forward.X, forward.Z);
        Vec3D up = new(0.0, 1.0, 0.0);
        Vec3D right = up.Cross(forward).Normalized();
        QuaternionD attitude = QuaternionD.FromFrame(right, up, forward);
        return new AircraftState(
            _runway.SurfacePoint(alongM, crossM)
                + new Vec3D(0.0, _envelope.WheelContactReferenceHeightM, 0.0),
            speed,
            Gamma: 0.0,
            Chi: chi,
            Bank: 0.0,
            Mass: massKg,
            BodyAttitude: attitude,
            BodyRates: default);
    }
}
