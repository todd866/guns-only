namespace GunsOnly.Sim.Vehicles;

/// <summary>
/// Parameters for a fictional reduced-order vertical-lift vehicle. These are engineering
/// assumptions for gameplay, not a performance card for any real aircraft.
/// </summary>
public sealed record ReducedOrderVerticalLiftProfile(
    string ProfileVersion,
    double MaximumGrossMassKg,
    double MaximumAdditivePayloadMassKg,
    double SeaLevelMaximumShaftPowerW,
    double RotorDiskAreaM2,
    double InducedPowerEfficiency,
    double ProfilePowerW,
    double MaximumRotorThrustN,
    double ParasiteDragAreaM2,
    double VerticalDragMultiplier,
    double MaximumTiltRad,
    double TiltResponseTimeSeconds,
    double MaximumYawRateRadPerSecond,
    double YawResponseTimeSeconds,
    double RotorSpoolUpTimeSeconds,
    double RotorSpoolDownTimeSeconds,
    double GroundEffectHeightM,
    double MaximumGroundEffectFactor,
    double CenterOfMassToSkidM,
    double HardImpactNormalSpeedMps,
    double StableContactHorizontalSpeedMps) {

    /// <summary>
    /// A deliberately fictional 2030s air-ambulance surrogate. Its narrow purpose is making mass,
    /// wind, power margin, and pickup/drop-off contact consequential at the production tick rate.
    /// </summary>
    public static ReducedOrderVerticalLiftProfile FictionalAirAmbulancePrototype { get; } =
        new(
            ProfileVersion: "fictional-air-ambulance-reduced-order.v1",
            MaximumGrossMassKg: 6_800.0,
            MaximumAdditivePayloadMassKg: 1_000.0,
            SeaLevelMaximumShaftPowerW: 1_950_000.0,
            RotorDiskAreaM2: 95.0,
            InducedPowerEfficiency: 0.72,
            ProfilePowerW: 240_000.0,
            MaximumRotorThrustN: 82_000.0,
            ParasiteDragAreaM2: 5.0,
            VerticalDragMultiplier: 1.35,
            MaximumTiltRad: 22.0 * Math.PI / 180.0,
            TiltResponseTimeSeconds: 0.45,
            MaximumYawRateRadPerSecond: 0.60,
            YawResponseTimeSeconds: 0.35,
            RotorSpoolUpTimeSeconds: 0.35,
            RotorSpoolDownTimeSeconds: 0.25,
            GroundEffectHeightM: 6.0,
            MaximumGroundEffectFactor: 1.12,
            CenterOfMassToSkidM: 1.5,
            HardImpactNormalSpeedMps: 3.0,
            StableContactHorizontalSpeedMps: 0.5);
}

/// <summary>
/// Fictional point-mass vertical-lift provider with reduced rigid attitude. It is intentionally a
/// separate model rather than a fixed-wing AircraftSim retune.
/// </summary>
public sealed class ReducedOrderVerticalLiftAirAmbulance : IPlayerVehicleDynamics {
    public const string ProviderId = "reduced-order.vertical-lift-air-ambulance.v1";
    public const string DefaultCapabilityVersion = "player-vehicle.vertical-lift.v1";

    static readonly Vec3D WorldUp = new(0.0, 1.0, 0.0);

    readonly ReducedOrderVerticalLiftProfile _profile;
    Vec3D _thrustDirection;
    double _yawRad;
    double _yawRateRadPerSecond;
    double _rotorThrustN;
    bool _hardImpactLatched;
    long? _lastTick;

    public ReducedOrderVerticalLiftAirAmbulance(
        string vehicleId,
        Vec3D initialPositionWorldM,
        Vec3D initialGroundVelocityMps,
        double initialYawRad,
        double initialRecurringBaseMassKg,
        double initialAdditivePayloadMassKg = 0.0,
        double? initialRotorThrustN = null,
        ReducedOrderVerticalLiftProfile? profile = null,
        string capabilityVersion = DefaultCapabilityVersion) {
        PlayerVehicleValidation.Required(vehicleId, nameof(vehicleId));
        PlayerVehicleValidation.Required(capabilityVersion, nameof(capabilityVersion));
        PlayerVehicleValidation.Finite(
            initialPositionWorldM,
            nameof(initialPositionWorldM));
        PlayerVehicleValidation.Finite(
            initialGroundVelocityMps,
            nameof(initialGroundVelocityMps));
        PlayerVehicleValidation.Finite(initialYawRad, nameof(initialYawRad));
        PlayerVehicleValidation.Positive(
            initialRecurringBaseMassKg,
            nameof(initialRecurringBaseMassKg));
        PlayerVehicleValidation.NonNegative(
            initialAdditivePayloadMassKg,
            nameof(initialAdditivePayloadMassKg));

        _profile = profile
            ?? ReducedOrderVerticalLiftProfile.FictionalAirAmbulancePrototype;
        ValidateProfile(_profile);
        ValidateMass(
            initialRecurringBaseMassKg,
            initialAdditivePayloadMassKg,
            _profile);

        double grossMassKg =
            initialRecurringBaseMassKg + initialAdditivePayloadMassKg;
        double rotorThrustN = initialRotorThrustN
            ?? Math.Min(grossMassKg * FlightModel.G0, _profile.MaximumRotorThrustN);
        PlayerVehicleValidation.NonNegative(
            rotorThrustN,
            nameof(initialRotorThrustN));
        if (rotorThrustN > _profile.MaximumRotorThrustN)
            throw new ArgumentOutOfRangeException(
                nameof(initialRotorThrustN),
                "Initial rotor thrust exceeds the reduced-order profile limit.");

        Capability = new PlayerVehicleCapability(
            PlayerVehicleContract.SchemaVersion,
            capabilityVersion,
            vehicleId,
            ProviderId,
            PlayerVehicleKind.VerticalLift,
            VehicleCommandFamily.VerticalLiftPilot,
            VehicleContactAuthority.IntegratedSkidContact,
            PlayerVehicleContract.FixedStepHz,
            _profile.MaximumGrossMassKg,
            _profile.MaximumAdditivePayloadMassKg,
            ReportsPowerMargin: true,
            ReportsWindResponse: true,
            ReportsProtectionInterventionEvidence: true,
            FidelityDisclosure:
                "Fictional reduced-order point-mass/rigid-attitude vertical-lift surrogate using "
                + "a momentum-theory power ceiling, first-order rotor and tilt response, "
                + "quadratic air-relative drag, sampled wind, and planar skid contact. It does "
                + "not model blade dynamics, vortex-ring state, retreating-blade stall, "
                + "autorotation, detailed drivetrain/failures, or high-resolution landing gear; "
                + "it is not a performance claim for a real aircraft.");
        PlayerVehicleValidation.Capability(Capability);

        _thrustDirection = WorldUp;
        _yawRad = PlayerVehicleValidation.WrapPi(initialYawRad);
        _rotorThrustN = rotorThrustN;
        QuaternionD attitude = AttitudeFromUpAndYaw(_thrustDirection, _yawRad);
        VehicleContactState contact = VehicleContactState.Unknown;
        State = new PlayerVehicleState(
            PlayerVehicleContract.SchemaVersion,
            -1,
            vehicleId,
            initialPositionWorldM,
            initialGroundVelocityMps,
            attitude,
            default,
            initialRecurringBaseMassKg,
            initialAdditivePayloadMassKg,
            grossMassKg,
            contact,
            Flyable: true);
        VehiclePowerObservation initialPower = ComputePowerObservation(
            grossMassKg,
            rotorThrustN,
            airDensityKgM3: 1.225,
            groundEffectFactor: 1.0);
        (double pitch, double roll, double yaw) =
            PlayerVehicleValidation.AttitudeAngles(attitude);
        Observation = new PlayerVehicleObservation(
            PlayerVehicleContract.SchemaVersion,
            -1,
            vehicleId,
            initialPositionWorldM,
            initialGroundVelocityMps,
            initialGroundVelocityMps,
            Vec3D.Zero,
            initialGroundVelocityMps.Length,
            initialGroundVelocityMps.Length,
            initialGroundVelocityMps.Y,
            pitch,
            roll,
            yaw,
            grossMassKg,
            initialPower,
            contact,
            VehicleProtectionInterventionEvidence.None,
            Flyable: true);
    }

    public ReducedOrderVerticalLiftProfile Profile => _profile;
    public PlayerVehicleCapability Capability { get; }
    public PlayerVehicleState State { get; private set; }
    public PlayerVehicleObservation Observation { get; private set; }

    public PlayerVehicleAdvanceResult Advance(in PlayerVehicleAdvanceInput input) {
        PlayerVehicleValidation.AdvanceInput(
            input,
            VehicleCommandFamily.VerticalLiftPilot,
            _lastTick);
        ValidateCommand(input.Command.VerticalLift);
        ValidateMass(
            input.RecurringBaseMassKg,
            input.AdditivePayloadMassKg,
            _profile);

        const double dt = PlayerVehicleContract.FixedDeltaSeconds;
        double grossMassKg =
            input.RecurringBaseMassKg + input.AdditivePayloadMassKg;
        VerticalLiftPilotCommand command = input.Command.VerticalLift;
        bool controlsAvailable = !_hardImpactLatched;

        double nextYawRate = controlsAvailable
            ? FirstOrder(
                _yawRateRadPerSecond,
                command.Yaw * _profile.MaximumYawRateRadPerSecond,
                _profile.YawResponseTimeSeconds,
                dt)
            : 0.0;
        double nextYaw = controlsAvailable
            ? PlayerVehicleValidation.WrapPi(_yawRad + nextYawRate * dt)
            : _yawRad;

        Vec3D heading = Heading(nextYaw);
        Vec3D right = WorldUp.Cross(heading).Normalized();
        double tiltScale = Math.Tan(_profile.MaximumTiltRad);
        Vec3D targetThrustDirection = controlsAvailable
            ? (WorldUp
                + heading * (command.ForwardCyclic * tiltScale)
                + right * (command.RightCyclic * tiltScale)).Normalized()
            : _thrustDirection;
        double tiltBlend = 1.0
            - Math.Exp(-dt / _profile.TiltResponseTimeSeconds);
        Vec3D nextThrustDirection = (_thrustDirection
            + (targetThrustDirection - _thrustDirection) * tiltBlend).Normalized();

        double groundEffectFactor = GroundEffectFactor(
            State.PositionWorldM,
            input.Environment.Surface);
        double maximumRotorThrustN = MaximumRotorThrust(
            input.Environment.AirDensityKgM3,
            groundEffectFactor);
        double targetRotorThrustN = controlsAvailable
            ? command.Collective * maximumRotorThrustN
            : 0.0;
        double rotorTimeConstant = targetRotorThrustN >= _rotorThrustN
            ? _profile.RotorSpoolUpTimeSeconds
            : _profile.RotorSpoolDownTimeSeconds;
        double nextRotorThrustN = Math.Min(
            maximumRotorThrustN,
            FirstOrder(
                _rotorThrustN,
                targetRotorThrustN,
                rotorTimeConstant,
                dt));

        Vec3D previousVelocity = State.GroundVelocityMps;
        Vec3D airVelocity = previousVelocity - input.Environment.WindVelocityMps;
        Vec3D dragForce = DragForce(
            airVelocity,
            input.Environment.AirDensityKgM3);
        Vec3D acceleration = (
            nextThrustDirection * nextRotorThrustN
            + dragForce) * (1.0 / grossMassKg)
            + new Vec3D(0.0, -FlightModel.G0, 0.0);
        Vec3D nextVelocity = previousVelocity + acceleration * dt;
        Vec3D nextPosition = State.PositionWorldM
            + (previousVelocity + nextVelocity) * (0.5 * dt);

        bool nextHardImpactLatched = _hardImpactLatched;
        VehicleContactState nextContact = VehicleContactState.Airborne;
        if (input.Environment.Surface.IsKnown) {
            ResolvePlanarSkidContact(
                input.Environment.Surface,
                dt,
                ref nextPosition,
                ref nextVelocity,
                ref nextContact,
                ref nextHardImpactLatched);
        }
        if (nextHardImpactLatched) nextRotorThrustN = 0.0;

        QuaternionD nextAttitude = AttitudeFromUpAndYaw(
            nextThrustDirection,
            nextYaw);
        (double previousPitch, double previousRoll, double previousYaw) =
            PlayerVehicleValidation.AttitudeAngles(State.BodyAttitude);
        (double nextPitch, double nextRoll, double observedYaw) =
            PlayerVehicleValidation.AttitudeAngles(nextAttitude);
        BodyRates nextBodyRates = new(
            PlayerVehicleValidation.WrapPi(nextRoll - previousRoll) / dt,
            PlayerVehicleValidation.WrapPi(nextPitch - previousPitch) / dt,
            PlayerVehicleValidation.WrapPi(observedYaw - previousYaw) / dt);
        Vec3D nextAirVelocity =
            nextVelocity - input.Environment.WindVelocityMps;
        VehiclePowerObservation power = ComputePowerObservation(
            grossMassKg,
            nextRotorThrustN,
            input.Environment.AirDensityKgM3,
            groundEffectFactor);
        if (nextHardImpactLatched)
            power = power with { AppliedPowerW = 0.0 };
        bool flyable = !nextHardImpactLatched;

        EnsureFiniteOutcome(
            nextPosition,
            nextVelocity,
            nextThrustDirection,
            nextAttitude,
            nextBodyRates,
            nextRotorThrustN,
            nextYaw,
            nextYawRate);

        PlayerVehicleState nextState = new(
            PlayerVehicleContract.SchemaVersion,
            input.Tick,
            Capability.VehicleId,
            nextPosition,
            nextVelocity,
            nextAttitude,
            nextBodyRates,
            input.RecurringBaseMassKg,
            input.AdditivePayloadMassKg,
            grossMassKg,
            nextContact,
            flyable);
        PlayerVehicleObservation nextObservation = new(
            PlayerVehicleContract.SchemaVersion,
            input.Tick,
            Capability.VehicleId,
            nextPosition,
            nextVelocity,
            nextAirVelocity,
            input.Environment.WindVelocityMps,
            nextVelocity.Length,
            nextAirVelocity.Length,
            nextVelocity.Y,
            nextPitch,
            nextRoll,
            observedYaw,
            grossMassKg,
            power,
            nextContact,
            input.ProtectionIntervention,
            flyable);

        _thrustDirection = nextThrustDirection;
        _yawRad = nextYaw;
        _yawRateRadPerSecond = nextYawRate;
        _rotorThrustN = nextRotorThrustN;
        _hardImpactLatched = nextHardImpactLatched;
        _lastTick = input.Tick;
        State = nextState;
        Observation = nextObservation;
        return new PlayerVehicleAdvanceResult(State, Observation);
    }

    static void ValidateProfile(ReducedOrderVerticalLiftProfile profile) {
        ArgumentNullException.ThrowIfNull(profile);
        PlayerVehicleValidation.Required(
            profile.ProfileVersion,
            nameof(profile.ProfileVersion));
        PlayerVehicleValidation.Positive(
            profile.MaximumGrossMassKg,
            nameof(profile.MaximumGrossMassKg));
        PlayerVehicleValidation.NonNegative(
            profile.MaximumAdditivePayloadMassKg,
            nameof(profile.MaximumAdditivePayloadMassKg));
        if (profile.MaximumAdditivePayloadMassKg > profile.MaximumGrossMassKg)
            throw new ArgumentOutOfRangeException(
                nameof(profile.MaximumAdditivePayloadMassKg));
        PlayerVehicleValidation.Positive(
            profile.SeaLevelMaximumShaftPowerW,
            nameof(profile.SeaLevelMaximumShaftPowerW));
        PlayerVehicleValidation.Positive(
            profile.RotorDiskAreaM2,
            nameof(profile.RotorDiskAreaM2));
        if (!double.IsFinite(profile.InducedPowerEfficiency)
            || profile.InducedPowerEfficiency <= 0.0
            || profile.InducedPowerEfficiency > 1.0)
            throw new ArgumentOutOfRangeException(
                nameof(profile.InducedPowerEfficiency));
        PlayerVehicleValidation.NonNegative(
            profile.ProfilePowerW,
            nameof(profile.ProfilePowerW));
        if (profile.ProfilePowerW >= profile.SeaLevelMaximumShaftPowerW)
            throw new ArgumentOutOfRangeException(nameof(profile.ProfilePowerW));
        PlayerVehicleValidation.Positive(
            profile.MaximumRotorThrustN,
            nameof(profile.MaximumRotorThrustN));
        PlayerVehicleValidation.Positive(
            profile.ParasiteDragAreaM2,
            nameof(profile.ParasiteDragAreaM2));
        PlayerVehicleValidation.Positive(
            profile.VerticalDragMultiplier,
            nameof(profile.VerticalDragMultiplier));
        if (!double.IsFinite(profile.MaximumTiltRad)
            || profile.MaximumTiltRad <= 0.0
            || profile.MaximumTiltRad >= Math.PI / 2.0)
            throw new ArgumentOutOfRangeException(nameof(profile.MaximumTiltRad));
        PlayerVehicleValidation.Positive(
            profile.TiltResponseTimeSeconds,
            nameof(profile.TiltResponseTimeSeconds));
        PlayerVehicleValidation.Positive(
            profile.MaximumYawRateRadPerSecond,
            nameof(profile.MaximumYawRateRadPerSecond));
        PlayerVehicleValidation.Positive(
            profile.YawResponseTimeSeconds,
            nameof(profile.YawResponseTimeSeconds));
        PlayerVehicleValidation.Positive(
            profile.RotorSpoolUpTimeSeconds,
            nameof(profile.RotorSpoolUpTimeSeconds));
        PlayerVehicleValidation.Positive(
            profile.RotorSpoolDownTimeSeconds,
            nameof(profile.RotorSpoolDownTimeSeconds));
        PlayerVehicleValidation.Positive(
            profile.GroundEffectHeightM,
            nameof(profile.GroundEffectHeightM));
        if (!double.IsFinite(profile.MaximumGroundEffectFactor)
            || profile.MaximumGroundEffectFactor < 1.0)
            throw new ArgumentOutOfRangeException(
                nameof(profile.MaximumGroundEffectFactor));
        PlayerVehicleValidation.Positive(
            profile.CenterOfMassToSkidM,
            nameof(profile.CenterOfMassToSkidM));
        PlayerVehicleValidation.Positive(
            profile.HardImpactNormalSpeedMps,
            nameof(profile.HardImpactNormalSpeedMps));
        PlayerVehicleValidation.NonNegative(
            profile.StableContactHorizontalSpeedMps,
            nameof(profile.StableContactHorizontalSpeedMps));
    }

    static void ValidateMass(
        double recurringBaseMassKg,
        double additivePayloadMassKg,
        ReducedOrderVerticalLiftProfile profile) {
        if (additivePayloadMassKg > profile.MaximumAdditivePayloadMassKg)
            throw new ArgumentOutOfRangeException(
                nameof(additivePayloadMassKg),
                "Payload mass exceeds the vertical-lift capability.");
        double grossMassKg = recurringBaseMassKg + additivePayloadMassKg;
        if (!double.IsFinite(grossMassKg)
            || grossMassKg > profile.MaximumGrossMassKg)
            throw new ArgumentOutOfRangeException(
                nameof(recurringBaseMassKg),
                "Recurring base plus payload exceeds maximum gross mass.");
    }

    static void ValidateCommand(in VerticalLiftPilotCommand command) {
        Unit(command.Collective, nameof(command.Collective), lowerBound: 0.0);
        Unit(command.ForwardCyclic, nameof(command.ForwardCyclic));
        Unit(command.RightCyclic, nameof(command.RightCyclic));
        Unit(command.Yaw, nameof(command.Yaw));
    }

    static void Unit(double value, string name, double lowerBound = -1.0) {
        if (!double.IsFinite(value) || value < lowerBound || value > 1.0)
            throw new ArgumentOutOfRangeException(name);
    }

    double AvailablePowerW(double airDensityKgM3) {
        double densityRatio = Math.Clamp(
            airDensityKgM3 / 1.225,
            0.35,
            1.15);
        return _profile.SeaLevelMaximumShaftPowerW
            * Math.Pow(densityRatio, 0.70);
    }

    double MaximumRotorThrust(
        double airDensityKgM3,
        double groundEffectFactor) {
        double inducedPowerBudgetW = Math.Max(
            0.0,
            AvailablePowerW(airDensityKgM3) - _profile.ProfilePowerW);
        double momentumTerm = Math.Sqrt(
            2.0 * airDensityKgM3 * _profile.RotorDiskAreaM2);
        double powerLimitedThrustN = Math.Pow(
            inducedPowerBudgetW
                * _profile.InducedPowerEfficiency
                * groundEffectFactor
                * momentumTerm,
            2.0 / 3.0);
        return Math.Min(
            _profile.MaximumRotorThrustN,
            powerLimitedThrustN);
    }

    VehiclePowerObservation ComputePowerObservation(
        double grossMassKg,
        double rotorThrustN,
        double airDensityKgM3,
        double groundEffectFactor) {
        double availablePowerW = AvailablePowerW(airDensityKgM3);
        double momentumTerm = Math.Sqrt(
            2.0 * airDensityKgM3 * _profile.RotorDiskAreaM2);
        double denominator = _profile.InducedPowerEfficiency
            * groundEffectFactor
            * momentumTerm;
        double appliedPowerW = _profile.ProfilePowerW
            + Math.Pow(Math.Max(0.0, rotorThrustN), 1.5) / denominator;
        double hoverThrustN = grossMassKg * FlightModel.G0;
        double hoverPowerRequiredW = _profile.ProfilePowerW
            + Math.Pow(hoverThrustN, 1.5) / denominator;
        double hoverMargin = (
            availablePowerW - hoverPowerRequiredW) / availablePowerW;
        return new VehiclePowerObservation(
            VehiclePowerAssessment.Assessed,
            availablePowerW,
            appliedPowerW,
            hoverPowerRequiredW,
            hoverMargin);
    }

    double GroundEffectFactor(
        in Vec3D position,
        in VehicleSurfaceSample surface) {
        if (!surface.IsKnown) return 1.0;
        double clearanceM = Math.Max(0.0, position.Y - surface.HeightM);
        if (clearanceM >= _profile.GroundEffectHeightM) return 1.0;
        double proximity =
            1.0 - clearanceM / _profile.GroundEffectHeightM;
        return 1.0 + (_profile.MaximumGroundEffectFactor - 1.0)
            * proximity * proximity;
    }

    Vec3D DragForce(in Vec3D airVelocity, double airDensityKgM3) {
        double airspeedMps = airVelocity.Length;
        if (airspeedMps < 1e-9) return Vec3D.Zero;
        double scale = -0.5
            * airDensityKgM3
            * _profile.ParasiteDragAreaM2
            * airspeedMps;
        Vec3D drag = airVelocity * scale;
        return new Vec3D(
            drag.X,
            drag.Y * _profile.VerticalDragMultiplier,
            drag.Z);
    }

    void ResolvePlanarSkidContact(
        in VehicleSurfaceSample surface,
        double dt,
        ref Vec3D position,
        ref Vec3D velocity,
        ref VehicleContactState contact,
        ref bool hardImpactLatched) {
        double centerOfMassFloorM =
            surface.HeightM + _profile.CenterOfMassToSkidM;
        if (position.Y > centerOfMassFloorM + 1e-9) {
            contact = VehicleContactState.Airborne;
            return;
        }
        if (velocity.Y > 0.0) {
            // The vehicle has positive separating velocity, but a coarse initial condition or
            // surface-height change must never leave the skids below the sampled plane.
            if (position.Y < centerOfMassFloorM)
                position = new Vec3D(
                    position.X,
                    centerOfMassFloorM,
                    position.Z);
            contact = VehicleContactState.Airborne;
            return;
        }

        double normalImpactSpeedMps = Math.Max(0.0, -velocity.Y);
        if (normalImpactSpeedMps > _profile.HardImpactNormalSpeedMps)
            hardImpactLatched = true;
        position = new Vec3D(position.X, centerOfMassFloorM, position.Z);
        double frictionMultiplier = Math.Exp(
            -surface.FrictionPerSecond * dt);
        velocity = new Vec3D(
            velocity.X * frictionMultiplier,
            0.0,
            velocity.Z * frictionMultiplier);
        double horizontalSpeedMps = Math.Sqrt(
            velocity.X * velocity.X + velocity.Z * velocity.Z);
        VehicleContactKind kind = hardImpactLatched
            ? VehicleContactKind.HardImpact
            : horizontalSpeedMps <= _profile.StableContactHorizontalSpeedMps
                ? VehicleContactKind.StableSurfaceContact
                : VehicleContactKind.SurfaceContact;
        contact = new VehicleContactState(
            kind,
            surface.SurfaceId,
            surface.UpNormal.Normalized(),
            normalImpactSpeedMps);
    }

    static QuaternionD AttitudeFromUpAndYaw(
        in Vec3D bodyUp,
        double yawRad) {
        Vec3D heading = Heading(yawRad);
        Vec3D bodyRight = bodyUp.Cross(heading);
        if (bodyRight.Length < 1e-9)
            bodyRight = WorldUp.Cross(heading);
        bodyRight = bodyRight.Normalized();
        Vec3D bodyForward = bodyRight.Cross(bodyUp).Normalized();
        return QuaternionD.FromFrame(
            bodyRight,
            bodyUp,
            bodyForward);
    }

    static Vec3D Heading(double yawRad) =>
        new(Math.Sin(yawRad), 0.0, Math.Cos(yawRad));

    static double FirstOrder(
        double current,
        double target,
        double timeConstantSeconds,
        double dt) =>
        current + (target - current)
            * (1.0 - Math.Exp(-dt / timeConstantSeconds));

    static void EnsureFiniteOutcome(
        in Vec3D position,
        in Vec3D velocity,
        in Vec3D thrustDirection,
        in QuaternionD attitude,
        in BodyRates bodyRates,
        double rotorThrustN,
        double yawRad,
        double yawRateRadPerSecond) {
        if (!position.IsFinite
            || !velocity.IsFinite
            || !thrustDirection.IsFinite
            || !attitude.IsFinite
            || !bodyRates.IsFinite
            || !double.IsFinite(rotorThrustN)
            || !double.IsFinite(yawRad)
            || !double.IsFinite(yawRateRadPerSecond))
            throw new InvalidOperationException(
                "The reduced-order vertical-lift integration produced non-finite state.");
    }
}
