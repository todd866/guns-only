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
    double AngleOfAttackRad,
    double PitchRateRadPerSecond,
    double RollRateRadPerSecond,
    double LoadFactor,
    double EnginePowerFraction,
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

    // Published geometry/power anchors; coefficient and response terms are documented reduced-order
    // surrogates, not an OEM aerodynamic data set.
    public const double WingAreaM2 = 37.25;
    public const double MaximumShaftPowerW = 1_193_000.0;
    const double GravityMps2 = 9.80665;
    const double LiftCurveIntercept = 0.92;
    const double LiftCurveSlopePerRad = 4.6;
    const double MaximumLiftCoefficient = 2.25;
    const double StallAngleRad = 18.0 * Math.PI / 180.0;

    Vec3D _position;
    Vec3D _velocity;
    double _headingRad;
    double _pitchRad;
    double _rollRad;
    double _flightPathRad;
    double _angleOfAttackRad;
    double _angleOfAttackRateRadPerSecond;
    double _pitchRateRadPerSecond;
    double _rollRateRadPerSecond;
    double _loadFactor = 1.0;
    double _enginePowerFraction;
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
        // Sorties begin engine-running at the selected 65% power setting. A future cold-start
        // scenario must publish a separate start state rather than silently beginning at zero.
        _enginePowerFraction = surfaceMode == FireBossSurfaceMode.Destroyed ? 0.0 : 0.65;
        _angleOfAttackRad = surfaceMode == FireBossSurfaceMode.Airborne
            ? 3.5 * Math.PI / 180.0
            : 0.0;
        _pitchRad = _angleOfAttackRad;
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
        Vec3D position = OkanaganGeo.ToWorld(49.825, -119.565,
            OkanaganGeo.LakeSurfaceElevationM);
        return new FireBossDynamics(position, 44.0, 0.58,
            FireBossSurfaceMode.Water, fuelKg);
    }

    public static FireBossDynamics OnScoopApproach(double fuelKg = 610.0)
    {
        Vec3D position = OkanaganGeo.ToWorld(49.820, -119.568, 360.0);
        return new FireBossDynamics(position, 43.0, 0.50,
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
        double effectiveThrottle = _fuelKg > 0.0 ? command.Throttle : 0.0;
        double powerRate = effectiveThrottle > _enginePowerFraction ? 0.72 : 1.05;
        _enginePowerFraction = MoveToward(_enginePowerFraction, effectiveThrottle,
            powerRate * FixedDeltaSeconds);

        _scoopActuation = MoveToward(_scoopActuation, command.ScoopsExtended ? 1.0 : 0.0,
            FixedDeltaSeconds);
        bool scoopDeployed = _scoopActuation >= 0.98;
        bool scoopValid = false;
        double scoopRate = 0.0;
        string scoopFault = "";

        double density = StandardAtmosphere1976.Instance.Sample(Math.Max(0.0, _position.Y)).DensityKgM3;
        double dynamicPressure = 0.5 * density * _speedMps * _speedMps;
        double liftCoefficient = LiftCoefficient(_angleOfAttackRad);
        double inducedDragCoefficient = 0.067 * liftCoefficient * liftCoefficient;
        double dragCoefficient = 0.058 + inducedDragCoefficient;
        double aerodynamicDragN = dynamicPressure * WingAreaM2 * dragCoefficient;
        double thrustN = Math.Min(30_000.0,
            MaximumShaftPowerW * 0.82 * _enginePowerFraction / Math.Max(24.0, _speedMps));
        double acceleration = (thrustN - aerodynamicDragN) / grossMass;
        if (_surfaceMode == FireBossSurfaceMode.Runway)
        {
            acceleration -= 0.24;
            StepSurfaceAttitude(command, 9.0, 7.0);
            double runwayLiftN = dynamicPressure * WingAreaM2 * LiftCoefficient(_pitchRad);
            if (_speedMps >= StallSpeedMps(grossMass) * 1.03
                && runwayLiftN >= grossMass * GravityMps2 * 0.94
                && _pitchRad >= 3.0 * Math.PI / 180.0)
            {
                _surfaceMode = FireBossSurfaceMode.Airborne;
                _hasFlown = true;
                _angleOfAttackRad = _pitchRad;
                _flightPathRad = 0.0;
                _position = _position with { Y = _position.Y + 0.6 };
            }
        }
        else if (_surfaceMode == FireBossSurfaceMode.Water)
        {
            // Displacement-to-step resistance peaks around 20 kt, then falls as the floats plane.
            double planing = Math.Clamp(_speedMps / 34.0, 0.0, 1.0);
            acceleration -= 0.34 + (1.0 - planing) * 0.78
                + 0.00010 * _speedMps * _speedMps
                + 0.62 * (_waterKg / MaximumWaterKg);
            StepSurfaceAttitude(command, 8.0, 7.0);
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
            double waterLiftN = dynamicPressure * WingAreaM2 * LiftCoefficient(_pitchRad);
            if (_speedMps >= WaterTakeoffSpeedMps(grossMass)
                && waterLiftN >= grossMass * GravityMps2 * 0.92
                && _pitchRad >= 4.0 * Math.PI / 180.0
                && !scoopDeployed)
            {
                _surfaceMode = FireBossSurfaceMode.Airborne;
                _hasFlown = true;
                _angleOfAttackRad = _pitchRad;
                _flightPathRad = 0.0;
                _position = _position with { Y = OkanaganGeo.LakeSurfaceElevationM + 0.5 };
            }
        }

        double verticalSpeed = 0.0;
        if (_surfaceMode == FireBossSurfaceMode.Airborne)
        {
            dynamicPressure = 0.5 * density * _speedMps * _speedMps;
            double referencePressure = 0.5 * density * 43.0 * 43.0;
            double controlAuthority = Math.Clamp(dynamicPressure / referencePressure, 0.18, 1.55);
            double oneGLiftCoefficient = grossMass * GravityMps2
                / Math.Max(1.0, dynamicPressure * WingAreaM2);
            double trimmedAngle = Math.Clamp(
                (oneGLiftCoefficient - LiftCurveIntercept) / LiftCurveSlopePerRad,
                -2.0 * Math.PI / 180.0,
                12.0 * Math.PI / 180.0);
            double targetAngle = Math.Clamp(
                trimmedAngle + command.Pitch * 6.2 * Math.PI / 180.0,
                -7.0 * Math.PI / 180.0,
                24.0 * Math.PI / 180.0);
            double alphaAcceleration = (targetAngle - _angleOfAttackRad) * 5.2 * controlAuthority
                - _angleOfAttackRateRadPerSecond * 3.4;
            _angleOfAttackRateRadPerSecond += alphaAcceleration * FixedDeltaSeconds;
            _angleOfAttackRateRadPerSecond = Math.Clamp(_angleOfAttackRateRadPerSecond,
                -24.0 * Math.PI / 180.0, 24.0 * Math.PI / 180.0);
            _angleOfAttackRad += _angleOfAttackRateRadPerSecond * FixedDeltaSeconds;

            double targetRollRate = command.Roll * 74.0 * Math.PI / 180.0
                * Math.Sqrt(controlAuthority);
            double rollAcceleration = (targetRollRate - _rollRateRadPerSecond) * 4.0;
            _rollRateRadPerSecond += rollAcceleration * FixedDeltaSeconds;
            _rollRateRadPerSecond = Math.Clamp(_rollRateRadPerSecond,
                -92.0 * Math.PI / 180.0, 92.0 * Math.PI / 180.0);
            _rollRad = Math.Clamp(_rollRad + _rollRateRadPerSecond * FixedDeltaSeconds,
                -82.0 * Math.PI / 180.0, 82.0 * Math.PI / 180.0);

            liftCoefficient = LiftCoefficient(_angleOfAttackRad);
            double liftN = dynamicPressure * WingAreaM2 * liftCoefficient;
            _loadFactor = liftN / Math.Max(1.0, grossMass * GravityMps2);
            double flightPathRate = (liftN * Math.Cos(_rollRad)
                - grossMass * GravityMps2 * Math.Cos(_flightPathRad))
                / (grossMass * Math.Max(14.0, _speedMps));
            flightPathRate = Math.Clamp(flightPathRate,
                -34.0 * Math.PI / 180.0, 34.0 * Math.PI / 180.0);
            _flightPathRad = Math.Clamp(_flightPathRad + flightPathRate * FixedDeltaSeconds,
                -48.0 * Math.PI / 180.0, 48.0 * Math.PI / 180.0);
            _pitchRateRadPerSecond = flightPathRate + _angleOfAttackRateRadPerSecond;
            _pitchRad = _flightPathRad + _angleOfAttackRad;

            dragCoefficient = 0.058 + 0.067 * liftCoefficient * liftCoefficient
                + (Math.Abs(_angleOfAttackRad) > StallAngleRad ? 0.10 : 0.0);
            aerodynamicDragN = dynamicPressure * WingAreaM2 * dragCoefficient;
            acceleration = (thrustN - aerodynamicDragN) / grossMass
                - GravityMps2 * Math.Sin(_flightPathRad);
            _speedMps = Math.Clamp(_speedMps + acceleration * FixedDeltaSeconds, 10.0,
                PublishedMaximumSpeedMps * Math.Sqrt(massRatio));
            verticalSpeed = _speedMps * Math.Sin(_flightPathRad);

            double coordinatedTurnRate = _speedMps > 14.0
                ? GravityMps2 * Math.Tan(_rollRad) / _speedMps
                : 0.0;
            double pedalTurnRate = command.Yaw * 10.0 * Math.PI / 180.0 * controlAuthority;
            _headingRad = Wrap(_headingRad
                + (coordinatedTurnRate + pedalTurnRate) * FixedDeltaSeconds);
        }
        else
        {
            _loadFactor = 1.0;
            _flightPathRad = 0.0;
            _angleOfAttackRad = _pitchRad;
            _angleOfAttackRateRadPerSecond = 0.0;
            _pitchRateRadPerSecond = 0.0;
            _speedMps = Math.Clamp(_speedMps + acceleration * FixedDeltaSeconds, 0.0,
                PublishedMaximumSpeedMps * Math.Sqrt(massRatio));
            double steeringAuthority = Math.Clamp(1.15 - _speedMps / 58.0, 0.16, 1.0);
            _headingRad = Wrap(_headingRad
                + command.Yaw * 16.0 * Math.PI / 180.0 * steeringAuthority * FixedDeltaSeconds);
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
                ResetSurfaceRates();
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
                ResetSurfaceRates();
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
            _position, _velocity, attitude, _headingRad, _pitchRad, _rollRad,
            _angleOfAttackRad, _pitchRateRadPerSecond, _rollRateRadPerSecond,
            _loadFactor, _enginePowerFraction, _speedMps,
            _velocity.Y, command.Throttle, _waterKg, _fuelKg,
            EmptyOperatingMassKg + _fuelKg + _waterKg, _surfaceMode,
            command.ScoopsExtended, scoopValid, scoopRate, waterReleased, scoopFault, _flyable);
    }

    static double StallSpeedMps(double grossMassKg) => 31.5 * Math.Sqrt(grossMassKg / 5_470.0);
    static double WaterTakeoffSpeedMps(double grossMassKg) => 39.0 * Math.Sqrt(grossMassKg / 5_470.0);
    static double LiftCoefficient(double angleOfAttackRad)
    {
        double linear = LiftCurveIntercept + LiftCurveSlopePerRad * angleOfAttackRad;
        if (angleOfAttackRad <= StallAngleRad)
            return Math.Clamp(linear, -0.72, MaximumLiftCoefficient);
        double postStall = MaximumLiftCoefficient
            - (angleOfAttackRad - StallAngleRad) * 3.2;
        return Math.Clamp(postStall, 0.55, MaximumLiftCoefficient);
    }

    void StepSurfaceAttitude(in FireBossPilotCommand command,
        double maximumPitchDeg, double maximumRollDeg)
    {
        double targetPitch = Math.Max(-1.0, command.Pitch) * maximumPitchDeg * Math.PI / 180.0;
        targetPitch = Math.Max(-2.0 * Math.PI / 180.0, targetPitch);
        _pitchRateRadPerSecond = (targetPitch - _pitchRad) * 2.2;
        _pitchRad = MoveToward(_pitchRad, targetPitch,
            15.0 * Math.PI / 180.0 * FixedDeltaSeconds);
        double targetRollRate = command.Roll * 25.0 * Math.PI / 180.0;
        _rollRateRadPerSecond = MoveToward(_rollRateRadPerSecond, targetRollRate,
            80.0 * Math.PI / 180.0 * FixedDeltaSeconds);
        _rollRad = Math.Clamp(_rollRad + _rollRateRadPerSecond * FixedDeltaSeconds,
            -maximumRollDeg * Math.PI / 180.0, maximumRollDeg * Math.PI / 180.0);
    }

    void ResetSurfaceRates()
    {
        _flightPathRad = 0.0;
        _angleOfAttackRad = _pitchRad;
        _angleOfAttackRateRadPerSecond = 0.0;
        _pitchRateRadPerSecond = 0.0;
        _rollRateRadPerSecond = 0.0;
    }
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
