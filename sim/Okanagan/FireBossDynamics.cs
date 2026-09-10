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
    bool DropRequested,
    double ElevatorTrim = 0.0);

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
    bool Flyable,
    double ElevatorTrim = 0.0);

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
    // Manufacturer land-takeoff / scooping limit; see source register.
    public const double MaximumGrossMassKg = 7_257.0;
    // Manufacturer land-landing limit. Mission guidance uses it to plan load release;
    // exceeding an operating limit does not itself inject a damage/crash event.
    public const double MaximumLandingMassKg = 5_216.0;
    public const double ScoopMinimumSpeedMps = 34.0;
    public const double ScoopMaximumSpeedMps = 49.0;
    public const double ScoopNominalRateKgPerSecond = 235.0;
    public const double WaterPitchLimitRad = 8.0 * Math.PI / 180.0;
    public const double WingAreaM2 = 37.25;
    public const double MaximumShaftPowerW = 1_193_000.0;
    public const string DynamicsProviderId = FixedWingAircraftVehicleAdapter.ProviderId;

    const double GravityMps2 = 9.80665;
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
    readonly double _initialElevatorTrim;

    FireBossDynamics(Vec3D position, double speedMps, double gammaRad,
        double headingRad, FireBossSurfaceMode surfaceMode, double fuelKg,
        double waterKg = 0.0, double initialPower = 0.65)
    {
        _surfaceMode = surfaceMode;
        _fuelKg = Math.Clamp(fuelKg, 1.0, InitialFuelKg);
        _waterKg = Math.Clamp(waterKg, 0, Math.Min(MaximumWaterKg,
            MaximumGrossMassKg - EmptyOperatingMassKg - _fuelKg));
        double massKg = EmptyOperatingMassKg + _fuelKg + _waterKg;
        double alphaRad = surfaceMode == FireBossSurfaceMode.Airborne
            ? TrimAngleOfAttack(position.Y, speedMps, massKg)
            : 0.0;
        _initialElevatorTrim = ConventionalTailAerodynamics.TrimElevator(
            surfaceMode == FireBossSurfaceMode.Airborne ? alphaRad
                : TrimAngleOfAttack(position.Y, 55.0, massKg),
            FlightModel.At802fFireBossPublicDataSurrogate.ConventionalTail);
        double pitchRad = gammaRad + alphaRad;
        QuaternionD attitude = Attitude(headingRad, pitchRad, 0.0);
        var initial = new AircraftState(position, speedMps, gammaRad, headingRad, 0.0,
            massKg, attitude, default);
        _aircraft = new AircraftSim(initial, FlightModel.At802fFireBossPublicDataSurrogate);
        _aircraft.SeedEnginePowerFraction(
            surfaceMode == FireBossSurfaceMode.Destroyed ? 0.0 : initialPower);
        _adapter = new FixedWingAircraftVehicleAdapter(
            "aircraft.at-802f-fireboss",
            _aircraft,
            MaximumGrossMassKg,
            MaximumWaterKg);
        Telemetry = BuildTelemetry(new(0, 0, 0, _aircraft.ThrustFraction, false, false),
            false, 0.0, 0.0, "");
    }

    public FireBossTelemetry Telemetry { get; private set; }
    public bool Flyable => _flyable;

    internal AircraftSim SharedAircraft => _aircraft;
    internal double InitialElevatorTrim => _initialElevatorTrim;
    internal PlayerVehicleState SharedVehicleState => _adapter.State;
    internal long AirbornePhysicsSteps => _airborneAuthorityTick;

    public static FireBossDynamics AtKelownaDeparture(double fuelKg = InitialFuelKg)
    {
        Vec3D threshold = OkanaganGeo.ToWorld(49.967, -119.3778, 433.0);
        return new FireBossDynamics(threshold, 0.0, 0.0,
            160.0 * Math.PI / 180.0, FireBossSurfaceMode.Runway, fuelKg);
    }

    /// <summary>Mission initialization only: actual water mass, aerodynamic trim and engine state.
    /// Subsequent flight uses the unchanged shared rigid-body solver.</summary>
    internal static FireBossDynamics AtLoadedIngress(Vec3D position, double headingRad,
        double fuelKg, double waterKg)
    {
        const double initialPower = 0.85;
        var aircraft = new FireBossDynamics(position, 58, 0, headingRad,
            FireBossSurfaceMode.Airborne, fuelKg, waterKg, initialPower) { _hasFlown = true };
        return aircraft;
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
        PilotCommand sharedCommand = ToSharedPilotCommand(command, _aircraft.BodyRollRad, _initialElevatorTrim);
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
        AircraftParams parameters = FlightModel.At802fFireBossPublicDataSurrogate;
        PilotCommand sharedCommand = ToSharedPilotCommand(command, _aircraft.BodyRollRad,
            _initialElevatorTrim);
        var raw = new RawState(state.Position, state.VelocityVector(), state.Bank, grossMassKg,
            state.BodyAttitude, state.BodyRates);
        double thrust = _aircraft.LastEngineOperatingPoint.NetThrustN;
        AeroResult aero = FlightModel.Aerodynamics(raw, sharedCommand, parameters, Vec3D.Zero,
            thrust, AirframeAerodynamicState.Clean);
        StateDeriv derivatives = FlightModel.Derivatives(raw, sharedCommand, parameters,
            new Vec3D(0, 1, 0), Vec3D.Zero, thrust, AirframeAerodynamicState.Clean);
        double normalForce = Math.Max(0.0, -aero.Accel.Y * grossMassKg);
        double accelerationMps2 = aero.Accel.Dot(Forward(_aircraft.BodyYawRad));
        if (_surfaceMode == FireBossSurfaceMode.Runway)
            accelerationMps2 -= 0.025 * normalForce / grossMassKg;
        else
        {
            double planing = Math.Clamp(speedMps / 34.0, 0.0, 1.0);
            accelerationMps2 -= 0.34 + (1.0 - planing) * 0.78
                + 0.00010 * speedMps * speedMps
                + 0.62 * (_waterKg / MaximumWaterKg);
            if (scoopDeployed) accelerationMps2 -= 1.05;
        }
        speedMps = Math.Max(0.0, speedMps + accelerationMps2 * FixedDeltaSeconds);

        // The same elevator moment acts before and after liftoff. The remaining wheel/float
        // reaction resists rotation while loaded; ground contact supplies pitch/roll stops.
        // Lever arms/stops are explicit provisional contact geometry, not aircraft test data.
        double maximumPitch = _surfaceMode == FireBossSurfaceMode.Runway
            ? 9.0 * Math.PI / 180.0 : WaterPitchLimitRad;
        double pitchAcceleration = derivatives.DBodyRates.Q - normalForce * 0.60 / parameters.IyyKgM2;
        double bodyPitchRate = state.BodyRates.Q + pitchAcceleration * FixedDeltaSeconds;
        double rollMoment = derivatives.RollMomentNm;
        double contactRollMoment = normalForce * 2.0;
        double rollAcceleration = Math.CopySign(Math.Max(0.0,
            Math.Abs(rollMoment) - contactRollMoment), rollMoment) / parameters.IxxKgM2;
        double bodyRollRate = state.BodyRates.P + rollAcceleration * FixedDeltaSeconds;
        // Float/wheel support restores an already heeled aircraft while there is a normal load.
        bodyRollRate -= (_aircraft.BodyRollRad * normalForce * 2.0 / parameters.IxxKgM2
            + 4.0 * bodyRollRate) * FixedDeltaSeconds;
        double steeringAuthority = Math.Clamp(1.15 - speedMps / 58.0, 0.16, 1.0);
        double headingRate = command.Yaw * Math.Min(speedMps / 18.0, 16.0 * Math.PI / 180.0)
            * steeringAuthority;
        // Steering constrains Euler heading rate. Convert body P/Q to Euler rates before
        // advancing the contact pose; their components differ during a banked rotation/turn.
        var eulerRates = FireBossSurfaceKinematics.ToEulerRates(_aircraft.BodyRollRad,
            _aircraft.BodyPitchRad, new BodyRates(bodyRollRate, bodyPitchRate, state.BodyRates.R),
            headingRate);
        double pitchRate = eulerRates.Pitch;
        double rollRate = eulerRates.Roll;
        double pitchRad = _aircraft.BodyPitchRad + pitchRate * FixedDeltaSeconds;
        if (pitchRad <= 0.0) { pitchRad = 0.0; pitchRate = Math.Max(0.0, pitchRate); }
        if (pitchRad >= maximumPitch) { pitchRad = maximumPitch; pitchRate = Math.Min(0.0, pitchRate); }
        double rollRad = Math.Clamp(_aircraft.BodyRollRad + rollRate * FixedDeltaSeconds,
            -7.0 * Math.PI / 180.0, 7.0 * Math.PI / 180.0);
        if (Math.Abs(rollRad) >= 7.0 * Math.PI / 180.0 && rollRad * rollRate > 0.0)
            rollRate = 0.0;
        double headingRad = Wrap(_aircraft.BodyYawRad + headingRate * FixedDeltaSeconds);
        Vec3D forward = Forward(headingRad);
        Vec3D velocity = forward * speedMps;
        Vec3D position = state.Position + velocity * FixedDeltaSeconds;
        // Contact is bounded by the same geometry as airborne collision. Previously a float
        // run could continue through a shoreline, and a late landing could coast a kilometre
        // beyond the runway at fixed runway height while the mission reported success.
        bool stillOnSurface = _surfaceMode == FireBossSurfaceMode.Water
            ? OkanaganGeo.IsOverCentralLake(position) : OkanaganGeo.IsOverKelownaRunway(position);
        if (!stillOnSurface) { Destroy(); return; }
        double surfaceHeight = _surfaceMode == FireBossSurfaceMode.Water
            ? LakeHeightM : 433.0;
        position = position with { Y = surfaceHeight };
        QuaternionD attitude = Attitude(headingRad, pitchRad, rollRad);
        var constrained = new AircraftState(position, speedMps, 0.0, headingRad, rollRad,
            grossMassKg, attitude, FireBossSurfaceKinematics.ToBodyRates(rollRad, pitchRad,
                rollRate, pitchRate, headingRate));
        _aircraft.AdoptExternalKinematics(constrained, pilotNormalAccelerationG: 1.0);

        var rotated = new RawState(position, velocity, rollRad, grossMassKg, attitude,
            constrained.BodyRates);
        AeroResult takeoffAero = FlightModel.Aerodynamics(rotated, sharedCommand, parameters,
            Vec3D.Zero, thrust, AirframeAerodynamicState.Clean);
        if (takeoffAero.Accel.Y > 0.0
            && !(_surfaceMode == FireBossSurfaceMode.Water && scoopDeployed))
        {
            _surfaceMode = FireBossSurfaceMode.Airborne;
            _hasFlown = true;
            // Lift removes the contact constraint. The next aerodynamic tick starts with exactly
            // this position, velocity, attitude and rate: no height, climb-rate or rate-reset kick.
        }
    }

    void ResolveAirborneContact()
    {
        AircraftState state = _aircraft.State;
        double sinkMps = Math.Max(0.0, -state.VelocityVector().Y);
        double rollRad = _aircraft.BodyRollRad;
        if (state.VelocityVector().Y < 0.0 && state.Position.Y <= LakeHeightM
            && OkanaganGeo.IsOverCentralLake(state.Position))
        {
            if (sinkMps > 3.2 || Math.Abs(rollRad) > 13.0 * Math.PI / 180.0)
                Destroy();
            else
                AdoptSurface(FireBossSurfaceMode.Water, LakeHeightM);
            return;
        }

        if (_hasFlown && state.VelocityVector().Y < 0.0 && state.Position.Y <= 433.0
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
            _flyable,
            command.ElevatorTrim);
    }

    internal static PilotCommand ToSharedPilotCommand(in FireBossPilotCommand command,
        double currentBankRad = 0.0, double initialElevatorTrim = 0.0) => new(
            GDemand: 1.0,
            BankTarget: currentBankRad,
            Throttle: command.Throttle,
            Rudder: command.Yaw,
            RollControl: command.Roll,
            DirectLateralControl: true,
            ElevatorControl: Math.Clamp(command.Pitch + initialElevatorTrim
                + command.ElevatorTrim, -1.0, 1.0));

    static FireBossPilotCommand Sanitize(in FireBossPilotCommand command) => new(
        Math.Clamp(Finite(command.Pitch), -1.0, 1.0),
        Math.Clamp(Finite(command.Roll), -1.0, 1.0),
        Math.Clamp(Finite(command.Yaw), -1.0, 1.0),
        Math.Clamp(Finite(command.Throttle), 0.0, 1.0),
        command.ScoopsExtended,
        command.DropRequested,
        Math.Clamp(Finite(command.ElevatorTrim), -0.5, 0.5));

    static double TrimAngleOfAttack(double altitudeM, double speedMps, double massKg)
    {
        double density = StandardAtmosphere1976.Instance.Sample(altitudeM).DensityKgM3;
        double q = 0.5 * density * speedMps * speedMps;
        double cl = massKg * GravityMps2 / Math.Max(q * WingAreaM2, 1.0);
        return Math.Clamp((cl
            - FlightModel.At802fFireBossPublicDataSurrogate.ZeroLiftCoefficient)
            / FlightModel.At802fFireBossPublicDataSurrogate.CLAlpha,
            -5.0 * Math.PI / 180.0,
            16.0 * Math.PI / 180.0);
    }

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
