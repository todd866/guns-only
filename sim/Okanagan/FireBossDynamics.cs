using GunsOnly.Sim.Vehicles;

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
/// AT-802F mission shell. Airborne authority is the same AircraftSim used by every fixed-wing
/// aircraft; this class owns only pilot-command translation, fuel/water stores and external
/// runway/float contact.
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
    public const double WingAreaM2 = 37.25;
    public const double MaximumShaftPowerW = 1_193_000.0;
    public const string DynamicsProviderId = FixedWingAircraftVehicleAdapter.ProviderId;

    const double GravityMps2 = 9.80665;
    const double CamberLiftCoefficient = 0.92;
    const double LakeHeightM = OkanaganGeo.LakeSurfaceElevationM;
    const double PoundToKg = 0.45359237;

    readonly AircraftSim _aircraft;
    readonly FixedWingAircraftVehicleAdapter _adapter;
    long _airborneAuthorityTick;
    double _waterKg;
    double _fuelKg;
    double _scoopActuation;
    FireBossSurfaceMode _surfaceMode;
    bool _flyable = true;
    bool _hasFlown;

    FireBossDynamics(Vec3D position, double speedMps, double gammaRad,
        double headingRad, FireBossSurfaceMode surfaceMode, double fuelKg)
    {
        _surfaceMode = surfaceMode;
        _fuelKg = Math.Clamp(fuelKg, 1.0, InitialFuelKg);
        double massKg = EmptyOperatingMassKg + _fuelKg;
        double alphaRad = surfaceMode == FireBossSurfaceMode.Airborne
            ? TrimAngleOfAttack(position.Y, speedMps, massKg)
            : 0.0;
        double pitchRad = gammaRad + alphaRad;
        QuaternionD attitude = Attitude(headingRad, pitchRad, 0.0);
        var initial = new AircraftState(position, speedMps, gammaRad, headingRad, 0.0,
            massKg, attitude, default);
        _aircraft = new AircraftSim(initial, FlightModel.At802fFireBossPublicDataSurrogate)
        {
            // The shared generic polar is zero-lift-at-zero-alpha. This constant configuration
            // increment carries the cambered AT-802 wing's documented surrogate offset through
            // the same force and protected-control path as flap/camber increments elsewhere.
            AerodynamicConfiguration = new AirframeAerodynamicState(
                CamberLiftCoefficient, 0.0, 0.0, 0.0)
        };
        _aircraft.SeedEnginePowerFraction(
            surfaceMode == FireBossSurfaceMode.Destroyed ? 0.0 : 0.65);
        _adapter = new FixedWingAircraftVehicleAdapter(
            "aircraft.at-802f-fireboss",
            _aircraft,
            MaximumGrossMassKg,
            MaximumWaterKg);
        Telemetry = BuildTelemetry(default, false, 0.0, 0.0, "");
    }

    public FireBossTelemetry Telemetry { get; private set; }
    public bool Flyable => _flyable;

    internal AircraftSim SharedAircraft => _aircraft;
    internal PlayerVehicleState SharedVehicleState => _adapter.State;
    internal long AirbornePhysicsSteps => _airborneAuthorityTick;

    public static FireBossDynamics AtKelownaDeparture(double fuelKg = InitialFuelKg)
    {
        Vec3D threshold = OkanaganGeo.ToWorld(49.967, -119.3778, 433.0);
        return new FireBossDynamics(threshold, 0.0, 0.0,
            160.0 * Math.PI / 180.0, FireBossSurfaceMode.Runway, fuelKg);
    }

    public static FireBossDynamics OnScoopLane(double fuelKg = 610.0)
    {
        Vec3D position = OkanaganGeo.ToWorld(49.825, -119.565, LakeHeightM);
        return new FireBossDynamics(position, 44.0, 0.0, 0.58,
            FireBossSurfaceMode.Water, fuelKg);
    }

    public static FireBossDynamics OnScoopApproach(double fuelKg = 610.0)
    {
        Vec3D position = OkanaganGeo.ToWorld(49.820, -119.568, 360.0);
        return new FireBossDynamics(position, 43.0, -1.5 * Math.PI / 180.0, 0.50,
            FireBossSurfaceMode.Airborne, fuelKg);
    }

    public static FireBossDynamics OnKelownaFinal(double fuelKg = 320.0)
    {
        Vec3D position = OkanaganGeo.ToWorld(49.9730, -119.3812, 480.0);
        return new FireBossDynamics(position, 47.0, -3.0 * Math.PI / 180.0,
            160.0 * Math.PI / 180.0, FireBossSurfaceMode.Airborne, fuelKg)
        {
            _hasFlown = true
        };
    }

    public FireBossTelemetry Step(in FireBossPilotCommand rawCommand)
    {
        if (!_flyable) return Telemetry;
        FireBossPilotCommand command = Sanitize(rawCommand);
        _aircraft.EngineFuelAvailable = _fuelKg > 0.0;

        _scoopActuation = MoveToward(_scoopActuation,
            command.ScoopsExtended ? 1.0 : 0.0, FixedDeltaSeconds);
        bool scoopDeployed = _scoopActuation >= 0.98;
        bool scoopValid = false;
        double scoopRate = 0.0;
        string scoopFault = "";

        if (_surfaceMode == FireBossSurfaceMode.Airborne)
            StepAirborne(command);
        else
            StepSurface(command, scoopDeployed);

        if (_surfaceMode == FireBossSurfaceMode.Water && scoopDeployed)
        {
            double speedMps = _aircraft.AirspeedMps;
            if (speedMps < ScoopMinimumSpeedMps) scoopFault = "TOO SLOW — STAY ON THE STEP";
            else if (speedMps > ScoopMaximumSpeedMps) scoopFault = "TOO FAST — RETRACT SCOOPS";
            else if (Math.Abs(_aircraft.BodyRollRad) > 6.0 * Math.PI / 180.0)
                scoopFault = "WINGS LEVEL";
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

        double waterReleased = 0.0;
        if (command.DropRequested && _surfaceMode == FireBossSurfaceMode.Airborne
            && _waterKg > 0.0)
        {
            waterReleased = Math.Min(_waterKg, 1_450.0 * FixedDeltaSeconds);
            _waterKg -= waterReleased;
        }

        double fuelFlowKgPerSecond = _aircraft.LastEngineOperatingPoint.FuelFlowLbPerMinute
            * PoundToKg / 60.0;
        _fuelKg = Math.Max(0.0, _fuelKg - fuelFlowKgPerSecond * FixedDeltaSeconds);
        _aircraft.EngineFuelAvailable = _fuelKg > 0.0;
        _aircraft.SetMassKg(EmptyOperatingMassKg + _fuelKg + _waterKg);

        Telemetry = BuildTelemetry(command, scoopValid, scoopRate, waterReleased, scoopFault);
        return Telemetry;
    }

    void StepAirborne(in FireBossPilotCommand command)
    {
        PilotCommand sharedCommand = ToSharedPilotCommand(command, _aircraft.State.Bank);
        _adapter.Advance(new PlayerVehicleAdvanceInput(
            Tick: _airborneAuthorityTick++,
            Command: PlayerVehicleCommand.FromFixedWing(sharedCommand),
            RecurringBaseMassKg: EmptyOperatingMassKg + _fuelKg,
            AdditivePayloadMassKg: _waterKg,
            Environment: PlayerVehicleEnvironmentSample.StandardStillAir,
            ExternalContact: VehicleContactState.Airborne,
            ProtectionIntervention: VehicleProtectionInterventionEvidence.None));

        ResolveAirborneContact();
    }

    void StepSurface(in FireBossPilotCommand command, bool scoopDeployed)
    {
        double grossMassKg = EmptyOperatingMassKg + _fuelKg + _waterKg;
        _aircraft.SetMassKg(grossMassKg);
        _aircraft.AdvanceEngineOnly(command.Throttle, FixedDeltaSeconds);

        AircraftState state = _aircraft.State;
        double speedMps = state.Speed;
        double density = StandardAtmosphere1976.Instance.Sample(state.Position.Y).DensityKgM3;
        double q = 0.5 * density * speedMps * speedMps;
        double surfaceAeroDragN = q * WingAreaM2 * 0.115;
        double accelerationMps2 = (_aircraft.LastEngineOperatingPoint.NetThrustN
            - surfaceAeroDragN) / grossMassKg;
        if (_surfaceMode == FireBossSurfaceMode.Runway)
            accelerationMps2 -= 0.24;
        else
        {
            double planing = Math.Clamp(speedMps / 34.0, 0.0, 1.0);
            accelerationMps2 -= 0.34 + (1.0 - planing) * 0.78
                + 0.00010 * speedMps * speedMps
                + 0.62 * (_waterKg / MaximumWaterKg);
            if (scoopDeployed) accelerationMps2 -= 1.05;
        }

        speedMps = Math.Clamp(speedMps + accelerationMps2 * FixedDeltaSeconds,
            0.0, PublishedMaximumSpeedMps);
        double maximumPitchDeg = _surfaceMode == FireBossSurfaceMode.Runway ? 9.0 : 8.0;
        double maximumRollDeg = 7.0;
        double targetPitch = Math.Clamp(command.Pitch, -0.22, 1.0)
            * maximumPitchDeg * Math.PI / 180.0;
        double pitchRad = MoveToward(_aircraft.BodyPitchRad, targetPitch,
            15.0 * Math.PI / 180.0 * FixedDeltaSeconds);
        double targetRollRate = command.Roll * 25.0 * Math.PI / 180.0;
        double rollRate = MoveToward(state.BodyRates.P, targetRollRate,
            80.0 * Math.PI / 180.0 * FixedDeltaSeconds);
        double rollRad = Math.Clamp(_aircraft.BodyRollRad + rollRate * FixedDeltaSeconds,
            -maximumRollDeg * Math.PI / 180.0, maximumRollDeg * Math.PI / 180.0);
        double steeringAuthority = Math.Clamp(1.15 - speedMps / 58.0, 0.16, 1.0);
        double headingRad = Wrap(_aircraft.BodyYawRad
            + command.Yaw * 16.0 * Math.PI / 180.0
                * steeringAuthority * FixedDeltaSeconds);
        Vec3D forward = Forward(headingRad);
        Vec3D velocity = forward * speedMps;
        Vec3D position = state.Position + velocity * FixedDeltaSeconds;
        double surfaceHeight = _surfaceMode == FireBossSurfaceMode.Water
            ? LakeHeightM : 433.0;
        position = position with { Y = surfaceHeight };
        QuaternionD attitude = Attitude(headingRad, pitchRad, rollRad);
        var constrained = new AircraftState(position, speedMps, 0.0, headingRad, rollRad,
            grossMassKg, attitude, new BodyRates(rollRate, 0.0, 0.0));
        _aircraft.AdoptExternalKinematics(constrained, pilotNormalAccelerationG: 1.0);

        double takeoffSpeed = _surfaceMode == FireBossSurfaceMode.Water
            ? WaterTakeoffSpeedMps(grossMassKg) : StallSpeedMps(grossMassKg) * 1.03;
        double rotationPitch = _surfaceMode == FireBossSurfaceMode.Water ? 4.0 : 3.0;
        double surfaceLiftCoefficient = Math.Clamp(CamberLiftCoefficient
            + FlightModel.At802fFireBossPublicDataSurrogate.CLAlpha * pitchRad,
            -0.72, 2.25);
        double surfaceLiftN = 0.5 * density * speedMps * speedMps
            * WingAreaM2 * surfaceLiftCoefficient;
        if (speedMps >= takeoffSpeed
            && pitchRad >= rotationPitch * Math.PI / 180.0
            && surfaceLiftN >= grossMassKg * GravityMps2 * 1.08
            && !(_surfaceMode == FireBossSurfaceMode.Water && scoopDeployed))
        {
            _surfaceMode = FireBossSurfaceMode.Airborne;
            _hasFlown = true;
            double gammaRad = 1.5 / Math.Max(speedMps, 1.0);
            Vec3D airbornePosition = position with { Y = surfaceHeight + 0.6 };
            _aircraft.AdoptExternalKinematics(constrained with
            {
                Position = airbornePosition,
                Gamma = gammaRad,
                BodyRates = default
            }, pilotNormalAccelerationG: 1.0);
        }
    }

    void ResolveAirborneContact()
    {
        AircraftState state = _aircraft.State;
        double sinkMps = Math.Max(0.0, -state.VelocityVector().Y);
        double rollRad = _aircraft.BodyRollRad;
        if (state.Position.Y <= LakeHeightM + 0.15
            && OkanaganGeo.IsOverCentralLake(state.Position))
        {
            if (sinkMps > 3.2 || Math.Abs(rollRad) > 13.0 * Math.PI / 180.0)
                Destroy();
            else
                AdoptSurface(FireBossSurfaceMode.Water, LakeHeightM);
            return;
        }

        if (_hasFlown && state.Position.Y <= 433.15
            && OkanaganGeo.IsOverKelownaRunway(state.Position))
        {
            if (sinkMps > 3.0 || Math.Abs(rollRad) > 9.0 * Math.PI / 180.0)
                Destroy();
            else
                AdoptSurface(FireBossSurfaceMode.Runway, 433.0);
            return;
        }

        if (!OkanaganGeo.IsOverCentralLake(state.Position)
            && state.Position.Y <= OkanaganGeo.RepresentativeTerrainHeightM(state.Position))
            Destroy();
    }

    void AdoptSurface(FireBossSurfaceMode mode, double heightM)
    {
        AircraftState state = _aircraft.State;
        double headingRad = _aircraft.BodyYawRad;
        double pitchFloor = mode == FireBossSurfaceMode.Runway
            ? 0.0 : -1.5 * Math.PI / 180.0;
        double pitchRad = Math.Max(pitchFloor, _aircraft.BodyPitchRad);
        double rollRad = _aircraft.BodyRollRad;
        double horizontalSpeed = Math.Sqrt(
            state.VelocityVector().X * state.VelocityVector().X
            + state.VelocityVector().Z * state.VelocityVector().Z);
        var surface = new AircraftState(
            state.Position with { Y = heightM },
            horizontalSpeed,
            0.0,
            headingRad,
            rollRad,
            state.Mass,
            Attitude(headingRad, pitchRad, rollRad),
            default);
        _aircraft.AdoptExternalKinematics(surface, pilotNormalAccelerationG: 1.0);
        _surfaceMode = mode;
    }

    void Destroy()
    {
        _surfaceMode = FireBossSurfaceMode.Destroyed;
        _flyable = false;
        _aircraft.EngineCombustionAvailable = false;
    }

    FireBossTelemetry BuildTelemetry(in FireBossPilotCommand command, bool scoopValid,
        double scoopRate, double waterReleased, string scoopFault)
    {
        AircraftState state = _aircraft.State;
        return new FireBossTelemetry(
            state.Position,
            state.VelocityVector(),
            state.BodyAttitude,
            _aircraft.BodyYawRad,
            _aircraft.BodyPitchRad,
            _aircraft.BodyRollRad,
            _aircraft.AngleOfAttackRad,
            state.BodyRates.Q,
            state.BodyRates.P,
            _surfaceMode == FireBossSurfaceMode.Airborne ? _aircraft.LastNz : 1.0,
            _aircraft.ThrustFraction,
            _aircraft.AirspeedMps,
            state.VelocityVector().Y,
            command.Throttle,
            _waterKg,
            _fuelKg,
            EmptyOperatingMassKg + _fuelKg + _waterKg,
            _surfaceMode,
            command.ScoopsExtended,
            scoopValid,
            scoopRate,
            waterReleased,
            scoopFault,
            _flyable);
    }

    internal static PilotCommand ToSharedPilotCommand(in FireBossPilotCommand command,
        double currentBankRad = 0.0)
    {
        double gDemand = command.Pitch >= 0.0
            ? 1.0 + command.Pitch * 2.5
            : 1.0 + command.Pitch * 1.5;
        return new PilotCommand(
            GDemand: gDemand,
            BankTarget: currentBankRad,
            Throttle: command.Throttle,
            Rudder: command.Yaw,
            RollControl: command.Roll,
            DirectLateralControl: true);
    }

    static FireBossPilotCommand Sanitize(in FireBossPilotCommand command) => new(
        Math.Clamp(Finite(command.Pitch), -1.0, 1.0),
        Math.Clamp(Finite(command.Roll), -1.0, 1.0),
        Math.Clamp(Finite(command.Yaw), -1.0, 1.0),
        Math.Clamp(Finite(command.Throttle), 0.0, 1.0),
        command.ScoopsExtended,
        command.DropRequested);

    static double TrimAngleOfAttack(double altitudeM, double speedMps, double massKg)
    {
        double density = StandardAtmosphere1976.Instance.Sample(altitudeM).DensityKgM3;
        double q = 0.5 * density * speedMps * speedMps;
        double cl = massKg * GravityMps2 / Math.Max(q * WingAreaM2, 1.0);
        return Math.Clamp((cl - CamberLiftCoefficient)
            / FlightModel.At802fFireBossPublicDataSurrogate.CLAlpha,
            -5.0 * Math.PI / 180.0,
            16.0 * Math.PI / 180.0);
    }

    static double StallSpeedMps(double grossMassKg) =>
        31.5 * Math.Sqrt(grossMassKg / 5_470.0);

    static double WaterTakeoffSpeedMps(double grossMassKg) =>
        39.0 * Math.Sqrt(grossMassKg / 5_470.0);

    static QuaternionD Attitude(double headingRad, double pitchRad, double rollRad)
    {
        Vec3D forward = new(
            Math.Sin(headingRad) * Math.Cos(pitchRad),
            Math.Sin(pitchRad),
            Math.Cos(headingRad) * Math.Cos(pitchRad));
        Vec3D levelRight = new(Math.Cos(headingRad), 0.0, -Math.Sin(headingRad));
        Vec3D levelUp = forward.Cross(levelRight).Normalized();
        Vec3D right = (levelRight * Math.Cos(rollRad)
            - levelUp * Math.Sin(rollRad)).Normalized();
        Vec3D up = forward.Cross(right).Normalized();
        return QuaternionD.FromFrame(right, up, forward.Normalized());
    }

    static Vec3D Forward(double headingRad) =>
        new(Math.Sin(headingRad), 0.0, Math.Cos(headingRad));

    static double MoveToward(double value, double target, double maximumDelta) =>
        value < target ? Math.Min(target, value + maximumDelta)
            : Math.Max(target, value - maximumDelta);

    static double Wrap(double angle) => Math.Atan2(Math.Sin(angle), Math.Cos(angle));
    static double Finite(double value) => double.IsFinite(value) ? value : 0.0;
}
