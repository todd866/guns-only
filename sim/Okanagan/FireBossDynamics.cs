namespace GunsOnly.Sim.Okanagan;

public enum FireBossSurfaceMode
{
    Runway,
    Water,
    Airborne,
    Destroyed
}

public readonly record struct FireBossPilotCommand(
    double Pitch,
    double Roll,
    double Yaw,
    double Throttle,
    bool ScoopsExtended,
    bool DropRequested);

public readonly record struct FireBossTelemetry(
    Vec3D PositionWorldM,
    Vec3D GroundVelocityMps,
    QuaternionD BodyAttitude,
    double HeadingRad,
    double PitchRad,
    double RollRad,
    double TrueAirspeedMps,
    double VerticalSpeedMps,
    double Throttle,
    double WaterLoadKg,
    double FuelKg,
    double GrossMassKg,
    FireBossSurfaceMode SurfaceMode,
    bool ScoopsCommanded,
    bool ScoopValid,
    double ScoopRateKgPerSecond,
    double WaterReleasedThisTickKg,
    string ScoopFault,
    bool Flyable);

/// <summary>
/// Deterministic reduced-order AT-802F Fire Boss authority. Public figures anchor tank capacity,
/// power, top speed and fill time; this is not an OEM flight-dynamics claim.
/// </summary>
public sealed class FireBossDynamics
{
    public const double FixedDeltaSeconds = 1.0 / AircraftSim.TickHz;
    public const double MaximumWaterKg = 3_104.0;
    public const double EmptyOperatingMassKg = 4_420.0;
    public const double InitialFuelKg = 925.0;
    public const double MaximumGrossMassKg = 8_200.0;
    public const double PublishedMaximumSpeedMps = 89.4;
    public const double ScoopMinimumSpeedMps = 34.0;
    public const double ScoopMaximumSpeedMps = 49.0;
    public const double ScoopNominalRateKgPerSecond = 235.0;

    Vec3D _position;
    Vec3D _velocity;
    double _headingRad;
    double _pitchRad;
    double _rollRad;
    double _speedMps;
    double _waterKg;
    double _fuelKg;
    FireBossSurfaceMode _surfaceMode;
    bool _flyable = true;
    double _scoopActuation;
    bool _hasFlown;

    FireBossDynamics(Vec3D position, double speedMps, double headingRad,
        FireBossSurfaceMode surfaceMode, double fuelKg)
    {
        _position = position;
        _speedMps = speedMps;
        _headingRad = headingRad;
        _surfaceMode = surfaceMode;
        _fuelKg = Math.Clamp(fuelKg, 1.0, InitialFuelKg);
        _velocity = Forward(_headingRad) * speedMps;
        Telemetry = BuildTelemetry(default, false, 0.0, 0.0, "");
    }

    public FireBossTelemetry Telemetry { get; private set; }
    public bool Flyable => _flyable;

    public static FireBossDynamics AtKelownaDeparture(double fuelKg = InitialFuelKg)
    {
        Vec3D threshold = OkanaganGeo.ToWorld(49.967, -119.3778, 433.0);
        return new FireBossDynamics(threshold, 0.0, 160.0 * Math.PI / 180.0,
            FireBossSurfaceMode.Runway, fuelKg);
    }

    public static FireBossDynamics OnScoopLane(double fuelKg = 610.0)
    {
        Vec3D position = OkanaganGeo.ToWorld(49.825, -119.580,
            OkanaganGeo.LakeSurfaceElevationM);
        return new FireBossDynamics(position, 44.0, 0.12,
            FireBossSurfaceMode.Water, fuelKg);
    }

    public static FireBossDynamics OnScoopApproach(double fuelKg = 610.0)
    {
        Vec3D position = OkanaganGeo.ToWorld(49.820, -119.580, 360.0);
        return new FireBossDynamics(position, 43.0, 0.04,
            FireBossSurfaceMode.Airborne, fuelKg);
    }

    public static FireBossDynamics OnKelownaFinal(double fuelKg = 320.0)
    {
        Vec3D position = OkanaganGeo.ToWorld(49.9730, -119.3812, 480.0);
        return new FireBossDynamics(position, 47.0, 160.0 * Math.PI / 180.0,
            FireBossSurfaceMode.Airborne, fuelKg) { _hasFlown = true };
    }

    public FireBossTelemetry Step(in FireBossPilotCommand rawCommand)
    {
        if (!_flyable) return Telemetry;
        FireBossPilotCommand command = new(
            Math.Clamp(Finite(rawCommand.Pitch), -1.0, 1.0),
            Math.Clamp(Finite(rawCommand.Roll), -1.0, 1.0),
            Math.Clamp(Finite(rawCommand.Yaw), -1.0, 1.0),
            Math.Clamp(Finite(rawCommand.Throttle), 0.0, 1.0),
            rawCommand.ScoopsExtended,
            rawCommand.DropRequested);

        double grossMass = EmptyOperatingMassKg + _fuelKg + _waterKg;
        double massRatio = (EmptyOperatingMassKg + InitialFuelKg) / grossMass;
        double rollLimit = _surfaceMode == FireBossSurfaceMode.Airborne ? 48.0 : 7.0;
        double pitchUpLimit = _surfaceMode == FireBossSurfaceMode.Airborne ? 14.0 : 9.0;
        double pitchDownLimit = _surfaceMode == FireBossSurfaceMode.Airborne ? -10.0 : -2.0;
        double targetRoll = command.Roll * rollLimit * Math.PI / 180.0;
        double targetPitch = (command.Pitch >= 0.0
            ? command.Pitch * pitchUpLimit
            : -command.Pitch * pitchDownLimit) * Math.PI / 180.0;
        _rollRad = MoveToward(_rollRad, targetRoll, 48.0 * Math.PI / 180.0 * FixedDeltaSeconds);
        _pitchRad = MoveToward(_pitchRad, targetPitch, 18.0 * Math.PI / 180.0 * FixedDeltaSeconds);

        _scoopActuation = MoveToward(_scoopActuation, command.ScoopsExtended ? 1.0 : 0.0,
            FixedDeltaSeconds);
        bool scoopDeployed = _scoopActuation >= 0.98;
        bool scoopValid = false;
        double scoopRate = 0.0;
        string scoopFault = "";

        double dragAcceleration = 0.00045 * _speedMps * _speedMps;
        double effectiveThrottle = _fuelKg > 0.0 ? command.Throttle : 0.0;
        double acceleration = 4.4 * effectiveThrottle * massRatio - dragAcceleration - 0.10;
        if (_surfaceMode == FireBossSurfaceMode.Runway)
        {
            acceleration -= 0.18;
            _pitchRad = Math.Max(0.0, _pitchRad);
            if (_speedMps >= StallSpeedMps(grossMass) * 1.06 && _pitchRad >= 3.0 * Math.PI / 180.0)
            {
                _surfaceMode = FireBossSurfaceMode.Airborne;
                _hasFlown = true;
                _position = _position with { Y = _position.Y + 0.6 };
            }
        }
        else if (_surfaceMode == FireBossSurfaceMode.Water)
        {
            acceleration -= 0.62 + 0.00018 * _speedMps * _speedMps;
            _rollRad = Math.Clamp(_rollRad, -7.0 * Math.PI / 180.0, 7.0 * Math.PI / 180.0);
            _position = _position with { Y = OkanaganGeo.LakeSurfaceElevationM };
            if (scoopDeployed)
            {
                acceleration -= 1.05;
                if (_speedMps < ScoopMinimumSpeedMps) scoopFault = "TOO SLOW — STAY ON THE STEP";
                else if (_speedMps > ScoopMaximumSpeedMps) scoopFault = "TOO FAST — RETRACT SCOOPS";
                else if (Math.Abs(_rollRad) > 6.0 * Math.PI / 180.0) scoopFault = "WINGS LEVEL";
                else
                {
                    double grossLimitedWater = Math.Max(0.0,
                        MaximumGrossMassKg - EmptyOperatingMassKg - _fuelKg);
                    double waterLimit = Math.Min(MaximumWaterKg, grossLimitedWater);
                    if (_waterKg >= waterLimit - 0.01) scoopFault = "MAX GROSS — SCOOPS UP";
                    else
                    {
                        scoopValid = true;
                        scoopRate = ScoopNominalRateKgPerSecond;
                        _waterKg = Math.Min(waterLimit,
                            _waterKg + scoopRate * FixedDeltaSeconds);
                    }
                }
            }
            if (_speedMps >= WaterTakeoffSpeedMps(grossMass)
                && _pitchRad >= 4.0 * Math.PI / 180.0
                && !scoopDeployed)
            {
                _surfaceMode = FireBossSurfaceMode.Airborne;
                _hasFlown = true;
                _position = _position with { Y = OkanaganGeo.LakeSurfaceElevationM + 0.5 };
            }
        }

        _speedMps = Math.Clamp(_speedMps + acceleration * FixedDeltaSeconds, 0.0,
            PublishedMaximumSpeedMps * Math.Sqrt(massRatio));
        double turnRate = _speedMps > 15.0
            ? 9.80665 * Math.Tan(_rollRad) / _speedMps
            : 0.0;
        _headingRad = Wrap(_headingRad + (turnRate + command.Yaw * 0.055) * FixedDeltaSeconds);

        double verticalSpeed = 0.0;
        if (_surfaceMode == FireBossSurfaceMode.Airborne)
        {
            double stall = StallSpeedMps(grossMass);
            double liftFraction = Math.Clamp((_speedMps - stall * 0.72) / (stall * 0.38), 0.0, 1.0);
            double targetVertical = _speedMps * Math.Sin(_pitchRad) * liftFraction
                - (1.0 - liftFraction) * 7.5;
            verticalSpeed = Telemetry.VerticalSpeedMps
                + (targetVertical - Telemetry.VerticalSpeedMps) * Math.Min(1.0, FixedDeltaSeconds * 1.8);
        }
        Vec3D forward = Forward(_headingRad);
        _velocity = new Vec3D(forward.X * _speedMps, verticalSpeed, forward.Z * _speedMps);
        _position += _velocity * FixedDeltaSeconds;

        if (_surfaceMode == FireBossSurfaceMode.Airborne
            && _position.Y <= OkanaganGeo.LakeSurfaceElevationM + 0.15
            && OkanaganGeo.IsOverCentralLake(_position))
        {
            double impactSink = Math.Max(0.0, -verticalSpeed);
            if (impactSink > 3.2 || Math.Abs(_rollRad) > 13.0 * Math.PI / 180.0)
            {
                _surfaceMode = FireBossSurfaceMode.Destroyed;
                _flyable = false;
            }
            else
            {
                _surfaceMode = FireBossSurfaceMode.Water;
                _position = _position with { Y = OkanaganGeo.LakeSurfaceElevationM };
                _velocity = _velocity with { Y = 0.0 };
                _pitchRad = Math.Max(-1.5 * Math.PI / 180.0, _pitchRad);
            }
        }
        else if (_surfaceMode == FireBossSurfaceMode.Airborne
            && _hasFlown
            && _position.Y <= 433.15
            && OkanaganGeo.IsOverKelownaRunway(_position))
        {
            double impactSink = Math.Max(0.0, -verticalSpeed);
            if (impactSink > 3.0 || Math.Abs(_rollRad) > 9.0 * Math.PI / 180.0)
            {
                _surfaceMode = FireBossSurfaceMode.Destroyed;
                _flyable = false;
            }
            else
            {
                _surfaceMode = FireBossSurfaceMode.Runway;
                _position = _position with { Y = 433.0 };
                _velocity = _velocity with { Y = 0.0 };
                _pitchRad = Math.Max(0.0, _pitchRad);
            }
        }
        else if (_surfaceMode == FireBossSurfaceMode.Airborne
            && !OkanaganGeo.IsOverCentralLake(_position)
            && _position.Y <= OkanaganGeo.RepresentativeTerrainHeightM(_position))
        {
            _surfaceMode = FireBossSurfaceMode.Destroyed;
            _flyable = false;
        }

        double waterReleased = 0.0;
        if (command.DropRequested && _surfaceMode == FireBossSurfaceMode.Airborne && _waterKg > 0.0)
        {
            waterReleased = Math.Min(_waterKg, 1_450.0 * FixedDeltaSeconds);
            _waterKg -= waterReleased;
        }
        _fuelKg = Math.Max(0.0, _fuelKg
            - (0.032 + 0.115 * command.Throttle) * FixedDeltaSeconds);
        Telemetry = BuildTelemetry(command, scoopValid, scoopRate, waterReleased, scoopFault);
        return Telemetry;
    }

    FireBossTelemetry BuildTelemetry(in FireBossPilotCommand command, bool scoopValid,
        double scoopRate, double waterReleased, string scoopFault)
    {
        Vec3D forward = Forward(_headingRad);
        Vec3D levelRight = new(forward.Z, 0.0, -forward.X);
        Vec3D pitchedForward = new(
            forward.X * Math.Cos(_pitchRad),
            Math.Sin(_pitchRad),
            forward.Z * Math.Cos(_pitchRad));
        Vec3D levelUp = Cross(pitchedForward, levelRight).Normalized();
        Vec3D right = (levelRight * Math.Cos(_rollRad) + levelUp * Math.Sin(_rollRad)).Normalized();
        Vec3D up = Cross(pitchedForward, right) * -1.0;
        QuaternionD attitude = QuaternionD.FromFrame(right, up.Normalized(), pitchedForward.Normalized());
        return new FireBossTelemetry(
            _position, _velocity, attitude, _headingRad, _pitchRad, _rollRad, _speedMps,
            _velocity.Y, command.Throttle, _waterKg, _fuelKg,
            EmptyOperatingMassKg + _fuelKg + _waterKg, _surfaceMode,
            command.ScoopsExtended, scoopValid, scoopRate, waterReleased, scoopFault, _flyable);
    }

    static double StallSpeedMps(double grossMassKg) => 31.5 * Math.Sqrt(grossMassKg / 5_470.0);
    static double WaterTakeoffSpeedMps(double grossMassKg) => 39.0 * Math.Sqrt(grossMassKg / 5_470.0);
    static Vec3D Forward(double headingRad) => new(Math.Sin(headingRad), 0.0, Math.Cos(headingRad));
    static Vec3D Cross(in Vec3D a, in Vec3D b) => new(
        a.Y * b.Z - a.Z * b.Y,
        a.Z * b.X - a.X * b.Z,
        a.X * b.Y - a.Y * b.X);
    static double MoveToward(double value, double target, double maximumDelta) =>
        value < target ? Math.Min(target, value + maximumDelta) : Math.Max(target, value - maximumDelta);
    static double Wrap(double angle) => Math.Atan2(Math.Sin(angle), Math.Cos(angle));
    static double Finite(double value) => double.IsFinite(value) ? value : 0.0;
}
