namespace GunsOnly.Sim.Vehicles;

/// <summary>
/// Deterministic AH-1G flight-foundation model. The rotor is blade-element/momentum based with
/// finite inflow and rotor-energy states; the fuselage attitude response is a source-bounded
/// reduced-order fit until the azimuth-resolved teetering-rotor model lands.
/// </summary>
public sealed class Ah1gCobraDynamics : IPlayerVehicleDynamics
{
    public const string ProviderId = "rotorcraft.ah-1g.flight-foundation.v1";
    public const string CapabilityVersion = "player-vehicle.ah-1g-flight-foundation.v1";

    const double TwoPi = 2.0 * Math.PI;
    const double VrsTransientTimeSeconds = 2.67;
    static readonly Vec3D WorldUp = new(0.0, 1.0, 0.0);

    readonly RotorcraftDefinition _definition;
    readonly string _vehicleId;
    double _diskForwardTiltRad;
    double _diskRightTiltRad;
    double _inducedVelocityMps;
    double _mainRotorAngularSpeedRadPerSecond;
    double _engineShaftPowerW;
    double _governorIntegralW;
    double _rotorAzimuthRad;
    double _previousRotorPowerW;
    bool _engineOperating = true;
    bool _hardImpactLatched;
    bool _rotorStrikeLatched;
    long? _lastTick;

    public Ah1gCobraDynamics(
        string vehicleId,
        Vec3D initialPositionWorldM,
        Vec3D initialGroundVelocityMps,
        double initialYawRad,
        double initialRecurringBaseMassKg,
        double initialAdditivePayloadMassKg = 0.0,
        RotorcraftDefinition? definition = null)
    {
        PlayerVehicleValidation.Required(vehicleId, nameof(vehicleId));
        PlayerVehicleValidation.Finite(initialPositionWorldM,
            nameof(initialPositionWorldM));
        PlayerVehicleValidation.Finite(initialGroundVelocityMps,
            nameof(initialGroundVelocityMps));
        PlayerVehicleValidation.Finite(initialYawRad, nameof(initialYawRad));
        PlayerVehicleValidation.Positive(initialRecurringBaseMassKg,
            nameof(initialRecurringBaseMassKg));
        PlayerVehicleValidation.NonNegative(initialAdditivePayloadMassKg,
            nameof(initialAdditivePayloadMassKg));

        _vehicleId = vehicleId;
        _definition = definition ?? Ah1gCobraDefinition.LateProduction;
        _definition.Validate();
        ValidateMass(initialRecurringBaseMassKg, initialAdditivePayloadMassKg);

        double grossMassKg = initialRecurringBaseMassKg + initialAdditivePayloadMassKg;
        MainRotorDefinition rotor = _definition.MainRotor;
        _mainRotorAngularSpeedRadPerSecond = rotor.NominalAngularSpeedRadPerSecond;
        _inducedVelocityMps = HoverInducedVelocity(
            grossMassKg * FlightModel.G0,
            _definition.Powerplant.SeaLevelDensityKgM3,
            rotor.DiskAreaM2);
        double hoverProfilePowerW = ProfilePowerW(
            _definition.Powerplant.SeaLevelDensityKgM3,
            _mainRotorAngularSpeedRadPerSecond,
            advanceRatio: 0.0);
        double hoverInducedPowerW = rotor.InducedPowerFactor
            * grossMassKg * FlightModel.G0 * _inducedVelocityMps;
        _engineShaftPowerW = TotalRotorSystemPowerW(
            hoverProfilePowerW + hoverInducedPowerW);
        _previousRotorPowerW = _engineShaftPowerW;

        QuaternionD initialAttitude = YawAttitude(initialYawRad);
        State = new PlayerVehicleState(
            PlayerVehicleContract.SchemaVersion,
            -1,
            vehicleId,
            initialPositionWorldM,
            initialGroundVelocityMps,
            initialAttitude,
            default,
            initialRecurringBaseMassKg,
            initialAdditivePayloadMassKg,
            grossMassKg,
            VehicleContactState.Unknown,
            Flyable: true);

        double availablePowerW = AvailablePowerW(_definition.Powerplant.SeaLevelDensityKgM3);
        double collective = EstimateHoverCollective(
            grossMassKg,
            _definition.Powerplant.SeaLevelDensityKgM3);
        double rootPitch = CollectiveRootPitchRad(collective);
        Telemetry = new RotorcraftTelemetry(
            Tick: -1,
            Regime: RotorcraftFlightRegime.Normal,
            MainRotorRpm: rotor.NominalRpm,
            TailRotorRpm: rotor.NominalRpm * _definition.TailRotor.MainToTailGearRatio,
            RotorAzimuthRad: 0.0,
            CollectiveRootPitchRad: rootPitch,
            MainRotorThrustN: grossMassKg * FlightModel.G0,
            InducedVelocityMps: _inducedVelocityMps,
            EngineShaftPowerW: _engineShaftPowerW,
            RotorPowerRequiredW: _engineShaftPowerW,
            AvailableShaftPowerW: availablePowerW,
            TransmissionTorqueNm: _engineShaftPowerW / _mainRotorAngularSpeedRadPerSecond,
            TransmissionLimitFraction: _engineShaftPowerW
                / _definition.Powerplant.TransmissionLimitW,
            EffectiveTranslationalLiftFactor: 0.0,
            GroundEffectFactor: 1.0,
            VortexRingSeverity: 0.0,
            RetreatingBladeStallSeverity: 0.0,
            MastBumpRisk: 0.0,
            MainRotorClearanceM: -1.0,
            SkidContactCount: 0,
            EngineOperating: true,
            GovernorSaturated: false,
            RotorStrike: false);
        Observation = CreateObservation(
            tick: -1,
            initialPositionWorldM,
            initialGroundVelocityMps,
            initialGroundVelocityMps,
            Vec3D.Zero,
            grossMassKg,
            initialAttitude,
            VehicleContactState.Unknown,
            VehicleProtectionInterventionEvidence.None,
            availablePowerW,
            _engineShaftPowerW,
            groundEffectFactor: 1.0,
            airDensityKgM3: _definition.Powerplant.SeaLevelDensityKgM3,
            flyable: true);

        Capability = new PlayerVehicleCapability(
            PlayerVehicleContract.SchemaVersion,
            CapabilityVersion,
            vehicleId,
            ProviderId,
            PlayerVehicleKind.VerticalLift,
            VehicleCommandFamily.VerticalLiftPilot,
            VehicleContactAuthority.IntegratedSkidContact,
            PlayerVehicleContract.FixedStepHz,
            _definition.Airframe.MaximumGrossMassKg,
            _definition.Airframe.MaximumAdditivePayloadMassKg,
            ReportsPowerMargin: true,
            ReportsWindResponse: true,
            ReportsProtectionInterventionEvidence: true,
            FidelityDisclosure:
                "Variant-locked late AH-1G flight foundation: finite-state BEMT/momentum "
                + "main-rotor thrust and inflow, explicit rotor energy, T53 governor lag, "
                + "transmission limit, ETL/ground effect, continuous VRS and retreating-blade "
                + "severity, autorotative energy transfer, anisotropic fuselage/stub-wing "
                + "aerodynamics, deterministic SAS-bounded attitude response, four-point skid "
                + "contact and rotor clearance. Rotor loads are disk-averaged, not yet "
                + "azimuth-resolved; tail-rotor aerodynamics, teeter/flapping, CG/inertia, "
                + "terrain-distributed inflow and dynamic-stall airfoil tables remain required "
                + "before production-combat fidelity claims.");
        PlayerVehicleValidation.Capability(Capability);
    }

    public RotorcraftDefinition Definition => _definition;
    public PlayerVehicleCapability Capability { get; }
    public PlayerVehicleState State { get; private set; }
    public PlayerVehicleObservation Observation { get; private set; }
    public RotorcraftTelemetry Telemetry { get; private set; }
    public bool EngineOperating => _engineOperating;

    /// <summary>Injects an engine-out condition; the freewheel leaves the rotor authoritative.</summary>
    public void FailEngine() => _engineOperating = false;

    /// <summary>
    /// Restores fuel/governor authority for test scenarios. This is not an airborne restart model.
    /// </summary>
    public void RestoreEngineForTest()
    {
        if (_hardImpactLatched || _rotorStrikeLatched)
            throw new InvalidOperationException("A destroyed rotorcraft cannot restore its engine.");
        _engineOperating = true;
    }

    /// <summary>
    /// Inverts the same hover BEMT closure used by the provider. The result is a starting trim,
    /// not an automatic hover controller.
    /// </summary>
    public double EstimateHoverCollective(
        double grossMassKg,
        double airDensityKgM3,
        double groundEffectFactor = 1.0)
    {
        PlayerVehicleValidation.Positive(grossMassKg, nameof(grossMassKg));
        PlayerVehicleValidation.Positive(airDensityKgM3, nameof(airDensityKgM3));
        PlayerVehicleValidation.Positive(groundEffectFactor, nameof(groundEffectFactor));
        MainRotorDefinition rotor = _definition.MainRotor;
        double omegaRadius = rotor.NominalAngularSpeedRadPerSecond * rotor.RadiusM;
        double thrustN = grossMassKg * FlightModel.G0;
        double thrustCoefficient = thrustN
            / (airDensityKgM3 * rotor.DiskAreaM2 * omegaRadius * omegaRadius);
        double inflowRatio = HoverInducedVelocity(
            thrustN,
            airDensityKgM3,
            rotor.DiskAreaM2) / (groundEffectFactor * omegaRadius);
        double bladeElementScale = rotor.Solidity * rotor.LiftCurveSlopePerRad / 2.0;
        double rootPitchRad = 3.0 * (
            thrustCoefficient / bladeElementScale
            + inflowRatio / 2.0
            - rotor.LinearTwistRad / 4.0);
        return Math.Clamp(
            (rootPitchRad - rotor.MinimumEffectiveRootPitchRad)
                / (rotor.MaximumEffectiveRootPitchRad
                    - rotor.MinimumEffectiveRootPitchRad),
            0.0,
            1.0);
    }

    public PlayerVehicleAdvanceResult Advance(in PlayerVehicleAdvanceInput input)
    {
        PlayerVehicleValidation.AdvanceInput(
            input,
            VehicleCommandFamily.VerticalLiftPilot,
            _lastTick);
        ValidateCommand(input.Command.VerticalLift);
        ValidateMass(input.RecurringBaseMassKg, input.AdditivePayloadMassKg);

        const double dt = PlayerVehicleContract.FixedDeltaSeconds;
        double grossMassKg = input.RecurringBaseMassKg + input.AdditivePayloadMassKg;
        MainRotorDefinition rotor = _definition.MainRotor;
        VerticalLiftPilotCommand command = input.Command.VerticalLift;
        bool controlsAvailable = !_hardImpactLatched && !_rotorStrikeLatched;
        if (!controlsAvailable) command = command with { Collective = 0.0 };

        _diskForwardTiltRad = FirstOrder(
            _diskForwardTiltRad,
            controlsAvailable
                ? command.ForwardCyclic * _definition.Handling.MaximumDiskTiltRad
                : 0.0,
            _definition.Handling.DiskResponseTimeConstantSeconds,
            dt);
        _diskRightTiltRad = FirstOrder(
            _diskRightTiltRad,
            controlsAvailable
                ? command.RightCyclic * _definition.Handling.MaximumDiskTiltRad
                : 0.0,
            _definition.Handling.DiskResponseTimeConstantSeconds,
            dt);

        QuaternionD attitude = State.BodyAttitude.Normalized();
        Vec3D diskNormalBody = new Vec3D(
            Math.Tan(_diskRightTiltRad),
            1.0,
            Math.Tan(_diskForwardTiltRad)).Normalized();
        Vec3D diskNormalWorld = attitude.Rotate(diskNormalBody).Normalized();
        Vec3D previousVelocity = State.GroundVelocityMps;
        Vec3D airVelocity = previousVelocity - input.Environment.WindVelocityMps;
        double throughDiskVelocityMps = airVelocity.Dot(diskNormalWorld);
        Vec3D inPlaneVelocity = airVelocity - diskNormalWorld * throughDiskVelocityMps;
        double inPlaneSpeedMps = inPlaneVelocity.Length;
        double omegaRadius = Math.Max(1.0,
            _mainRotorAngularSpeedRadPerSecond * rotor.RadiusM);
        double advanceRatio = inPlaneSpeedMps / omegaRadius;

        double groundEffectFactor = GroundEffectFactor(
            State.PositionWorldM,
            diskNormalWorld,
            inPlaneSpeedMps,
            input.Environment.Surface);
        double collectiveRootPitchRad = CollectiveRootPitchRad(command.Collective);
        // _inducedVelocityMps is the actual finite inflow state. Ground effect acts on its
        // momentum target below; dividing the state here as well would apply the correction
        // twice after the transient settles.
        double effectiveInflowMps = _inducedVelocityMps;
        double inflowRatio = (effectiveInflowMps + throughDiskVelocityMps) / omegaRadius;
        double bladePitchTerm = collectiveRootPitchRad / 3.0
            * (1.0 + 1.5 * advanceRatio * advanceRatio)
            + rotor.LinearTwistRad / 4.0
                * (1.0 + 2.0 * advanceRatio * advanceRatio);
        double thrustCoefficient = rotor.Solidity * rotor.LiftCurveSlopePerRad / 2.0
            * (bladePitchTerm - inflowRatio / 2.0);
        double rawThrustN = Math.Max(0.0, thrustCoefficient)
            * input.Environment.AirDensityKgM3
            * rotor.DiskAreaM2
            * omegaRadius * omegaRadius;
        rawThrustN = Math.Min(
            rawThrustN,
            _definition.Airframe.MaximumGrossMassKg
                * FlightModel.G0
                * _definition.Handling.NumericalMainRotorLoadFactorGuard);

        double hoverInducedVelocityMps = HoverInducedVelocity(
            Math.Max(1.0, grossMassKg * FlightModel.G0),
            input.Environment.AirDensityKgM3,
            rotor.DiskAreaM2);
        double vrsSeverity = VortexRingSeverity(
            throughDiskVelocityMps,
            inPlaneSpeedMps,
            hoverInducedVelocityMps);
        double rpmRatio = _mainRotorAngularSpeedRadPerSecond
            / rotor.NominalAngularSpeedRadPerSecond;
        double rbsSeverity = RetreatingBladeStallSeverity(
            advanceRatio,
            rpmRatio,
            rawThrustN / Math.Max(1.0, grossMassKg * FlightModel.G0));
        double vrsThrustFactor = 1.0
            - vrsSeverity * (0.24 + 0.22 * command.Collective);
        double rbsThrustFactor = 1.0 - 0.22 * rbsSeverity;
        double mainRotorThrustN = rawThrustN * vrsThrustFactor * rbsThrustFactor;

        double profilePowerW = ProfilePowerW(
            input.Environment.AirDensityKgM3,
            _mainRotorAngularSpeedRadPerSecond,
            advanceRatio);
        double inducedPowerW = rotor.InducedPowerFactor
            * mainRotorThrustN
            * (effectiveInflowMps + throughDiskVelocityMps);
        // Developed VRS consumes collective without delivering proportional thrust.
        inducedPowerW += vrsSeverity * command.Collective * 0.16
            * _definition.Powerplant.TransmissionLimitW;
        double rotorPowerRequiredW = TotalRotorSystemPowerW(
            profilePowerW + inducedPowerW);
        double availablePowerW = AvailablePowerW(input.Environment.AirDensityKgM3);
        double currentRpm = AngularSpeedToRpm(_mainRotorAngularSpeedRadPerSecond);
        // A real rotor is self-limiting in autorotation: as Nr rises the inflow angle falls and
        // the driving region of the blade shrinks toward nothing, which is what settles
        // autorotative Nr at a steady value instead of running away. A static momentum model
        // carries no such term, so windmilling power kept feeding the disc and every descent
        // pinned the rotor against the numeric ceiling at 107.8% of nominal. Fade the
        // autorotative drive out across nominal -> maximum autorotation rpm.
        if (rotorPowerRequiredW < 0.0)
        {
            double autorotationOverspeedFraction = (currentRpm - rotor.NominalRpm)
                / Math.Max(1.0, rotor.MaximumAutorotationRpm - rotor.NominalRpm);
            rotorPowerRequiredW *= 1.0
                - Math.Clamp(autorotationOverspeedFraction, 0.0, 1.0);
        }
        double rotorSpeedErrorRpm = rotor.NominalRpm - currentRpm;
        double feedForwardPowerW = Math.Max(0.0, rotorPowerRequiredW);
        double proportionalCorrectionW = rotorSpeedErrorRpm
            * _definition.Powerplant.GovernorProportionalGainWPerRpm;
        double candidateIntegralW = _governorIntegralW
            + rotorSpeedErrorRpm
                * _definition.Powerplant.GovernorIntegralGainWPerRpmSecond
                * dt;
        double unclampedGovernorDemandW = feedForwardPowerW
            + proportionalCorrectionW
            + candidateIntegralW;
        double clampedGovernorDemandW = Math.Clamp(
            unclampedGovernorDemandW,
            0.0,
            availablePowerW);
        // Back-calculation anti-windup: keep only the part of the integral the engine could
        // actually deliver. Without it a sustained climb at the transmission limit banks integral
        // it can never spend, and the rotor overspeeds the moment the load comes off.
        _governorIntegralW = _engineOperating && controlsAvailable
            ? candidateIntegralW - (unclampedGovernorDemandW - clampedGovernorDemandW)
            : 0.0;
        double requestedEnginePowerW = _engineOperating && controlsAvailable
            ? clampedGovernorDemandW
            : 0.0;
        double engineTau = requestedEnginePowerW >= _engineShaftPowerW
            ? _definition.Powerplant.EngineRiseTimeConstantSeconds
            : _definition.Powerplant.EngineFallTimeConstantSeconds;
        _engineShaftPowerW = FirstOrder(
            _engineShaftPowerW,
            requestedEnginePowerW,
            engineTau,
            dt);
        if (!_engineOperating || !controlsAvailable)
            _engineShaftPowerW = Math.Max(0.0, _engineShaftPowerW);

        // The freewheel transmits positive engine power only. Negative aerodynamic power in a
        // descent accelerates the rotor and is the autorotation energy path.
        double transmittedEnginePowerW = _engineOperating && controlsAvailable
            ? _engineShaftPowerW
            : 0.0;
        double rotorPowerImbalanceW = transmittedEnginePowerW - rotorPowerRequiredW;
        double rotorAngularAcceleration = rotorPowerImbalanceW
            / (rotor.TotalFlapInertiaKgM2
                * Math.Max(0.55 * rotor.NominalAngularSpeedRadPerSecond,
                    _mainRotorAngularSpeedRadPerSecond));
        rotorAngularAcceleration = Math.Clamp(rotorAngularAcceleration, -7.0, 7.0);
        _mainRotorAngularSpeedRadPerSecond = Math.Clamp(
            _mainRotorAngularSpeedRadPerSecond + rotorAngularAcceleration * dt,
            0.0,
            RpmToAngularSpeed(rotor.MaximumAutorotationRpm * 1.03));
        _rotorAzimuthRad = WrapTwoPi(
            _rotorAzimuthRad + _mainRotorAngularSpeedRadPerSecond * dt);

        double targetInflowMps = MomentumInducedVelocity(
            mainRotorThrustN,
            input.Environment.AirDensityKgM3,
            rotor.DiskAreaM2,
            inPlaneSpeedMps,
            throughDiskVelocityMps,
            _inducedVelocityMps);
        targetInflowMps /= groundEffectFactor;
        targetInflowMps *= 1.0 + 0.55 * vrsSeverity;
        double inflowTau = Lerp(
            rotor.DynamicInflowTimeConstantSeconds,
            VrsTransientTimeSeconds,
            vrsSeverity);
        _inducedVelocityMps = Math.Clamp(
            FirstOrder(_inducedVelocityMps, targetInflowMps, inflowTau, dt),
            0.0,
            3.0 * hoverInducedVelocityMps);

        BodyRates nextRates = AdvanceBodyRates(
            State.BodyRates,
            command,
            controlsAvailable,
            rpmRatio,
            rotorPowerRequiredW,
            rbsSeverity,
            vrsSeverity,
            dt);
        QuaternionD nextAttitude = IntegrateAttitude(attitude, nextRates, dt);

        Vec3D thrustForce = diskNormalWorld * mainRotorThrustN;
        Vec3D fuselageDrag = FuselageDragForce(
            airVelocity,
            attitude,
            input.Environment.AirDensityKgM3);
        Vec3D stubWingForce = StubWingForce(
            airVelocity,
            attitude,
            input.Environment.AirDensityKgM3);
        Vec3D acceleration = (thrustForce + fuselageDrag + stubWingForce)
            * (1.0 / grossMassKg)
            + new Vec3D(0.0, -FlightModel.G0, 0.0);
        Vec3D nextVelocity = previousVelocity + acceleration * dt;
        Vec3D nextPosition = State.PositionWorldM
            + (previousVelocity + nextVelocity) * (0.5 * dt);

        VehicleContactState contact = VehicleContactState.Airborne;
        int skidContactCount = 0;
        // Negative means the environment supplied no surface against which clearance can be
        // assessed. Keep the public telemetry finite so it remains serialization-safe.
        double mainRotorClearanceM = -1.0;
        if (input.Environment.Surface.IsKnown)
        {
            ResolveSkidAndRotorContact(
                input.Environment.Surface,
                nextAttitude,
                diskNormalWorld,
                dt,
                ref nextPosition,
                ref nextVelocity,
                ref nextRates,
                ref contact,
                ref skidContactCount,
                ref mainRotorClearanceM);
        }

        if (_hardImpactLatched || _rotorStrikeLatched)
        {
            _engineOperating = false;
            _engineShaftPowerW = 0.0;
            _governorIntegralW = 0.0;
        }
        bool flyable = !_hardImpactLatched && !_rotorStrikeLatched;
        Vec3D nextAirVelocity = nextVelocity - input.Environment.WindVelocityMps;
        double etlFactor = EffectiveTranslationalLiftFactor(
            inPlaneSpeedMps,
            hoverInducedVelocityMps);
        double normalLoadFactor = mainRotorThrustN
            * Math.Max(0.0, diskNormalWorld.Dot(WorldUp))
            / Math.Max(1.0, grossMassKg * FlightModel.G0);
        double mastBumpRisk = MastBumpRisk(
            normalLoadFactor,
            inPlaneSpeedMps,
            command.ForwardCyclic);
        bool governorSaturated = requestedEnginePowerW >= availablePowerW - 1.0
            && currentRpm < rotor.NominalRpm - 1.0;
        double newRpm = AngularSpeedToRpm(_mainRotorAngularSpeedRadPerSecond);
        RotorcraftFlightRegime regime = SelectRegime(
            contact,
            _rotorStrikeLatched,
            _engineOperating,
            vrsSeverity,
            rbsSeverity,
            etlFactor);

        State = new PlayerVehicleState(
            PlayerVehicleContract.SchemaVersion,
            input.Tick,
            Capability.VehicleId,
            nextPosition,
            nextVelocity,
            nextAttitude,
            nextRates,
            input.RecurringBaseMassKg,
            input.AdditivePayloadMassKg,
            grossMassKg,
            contact,
            flyable);
        Observation = CreateObservation(
            input.Tick,
            nextPosition,
            nextVelocity,
            nextAirVelocity,
            input.Environment.WindVelocityMps,
            grossMassKg,
            nextAttitude,
            contact,
            input.ProtectionIntervention,
            availablePowerW,
            transmittedEnginePowerW,
            groundEffectFactor,
            input.Environment.AirDensityKgM3,
            flyable);
        Telemetry = new RotorcraftTelemetry(
            input.Tick,
            regime,
            newRpm,
            newRpm * _definition.TailRotor.MainToTailGearRatio,
            _rotorAzimuthRad,
            collectiveRootPitchRad,
            flyable ? mainRotorThrustN : 0.0,
            _inducedVelocityMps,
            _engineShaftPowerW,
            rotorPowerRequiredW,
            availablePowerW,
            _mainRotorAngularSpeedRadPerSecond > 1e-6
                ? transmittedEnginePowerW / _mainRotorAngularSpeedRadPerSecond
                : 0.0,
            _definition.Powerplant.TransmissionLimitW > 1.0
                ? transmittedEnginePowerW / _definition.Powerplant.TransmissionLimitW
                : 0.0,
            etlFactor,
            groundEffectFactor,
            vrsSeverity,
            rbsSeverity,
            mastBumpRisk,
            mainRotorClearanceM,
            skidContactCount,
            _engineOperating,
            governorSaturated,
            _rotorStrikeLatched);

        EnsureFiniteOutcome();
        _previousRotorPowerW = rotorPowerRequiredW;
        _lastTick = input.Tick;
        return new PlayerVehicleAdvanceResult(State, Observation);
    }

    BodyRates AdvanceBodyRates(
        in BodyRates rates,
        in VerticalLiftPilotCommand command,
        bool controlsAvailable,
        double rpmRatio,
        double rotorPowerRequiredW,
        double rbsSeverity,
        double vrsSeverity,
        double dt)
    {
        double controlEffectiveness = Math.Clamp((rpmRatio - 0.55) / 0.35, 0.0, 1.0);
        double targetRollRate = controlsAvailable
            ? command.RightCyclic * _definition.Handling.MaximumRollRateRadPerSecond
                * controlEffectiveness
            : 0.0;
        double targetPitchRate = controlsAvailable
            ? -command.ForwardCyclic * _definition.Handling.MaximumPitchRateRadPerSecond
                * controlEffectiveness
            : 0.0;
        double targetYawRate = controlsAvailable
            ? command.Yaw * _definition.TailRotor.MaximumYawRateRadPerSecond
                * controlEffectiveness
            : 0.0;

        // Tail-rotor trim removes steady main-rotor torque. Load transients retain the documented
        // yaw kick, and engine-out retains a short left-yaw tendency.
        double torqueTransient = Math.Clamp(
            (rotorPowerRequiredW - _previousRotorPowerW)
                / (0.30 * _definition.Powerplant.TransmissionLimitW),
            -1.0,
            1.0);
        targetYawRate += torqueTransient * Degrees(7.0);
        if (!_engineOperating)
            targetYawRate -= Degrees(8.0) * controlEffectiveness;

        // Progressive 2/rev feedback is deterministic and small; it is evidence/cueing, not a
        // canned roll departure. A future azimuth-resolved rotor must replace it.
        double twoPerRev = Math.Sin(2.0 * _rotorAzimuthRad);
        targetRollRate += rbsSeverity * twoPerRev * Degrees(4.0);
        targetPitchRate += (rbsSeverity + 0.45 * vrsSeverity)
            * Math.Cos(2.0 * _rotorAzimuthRad) * Degrees(3.0);

        return new BodyRates(
            FirstOrder(rates.P, targetRollRate,
                _definition.Handling.RollResponseTimeConstantSeconds, dt),
            FirstOrder(rates.Q, targetPitchRate,
                _definition.Handling.PitchResponseTimeConstantSeconds, dt),
            FirstOrder(rates.R, targetYawRate,
                _definition.Handling.YawResponseTimeConstantSeconds, dt));
    }

    Vec3D FuselageDragForce(
        in Vec3D airVelocityWorld,
        in QuaternionD attitude,
        double densityKgM3)
    {
        Vec3D bodyVelocity = attitude.Conjugate().Rotate(airVelocityWorld);
        RotorcraftAirframeDefinition airframe = _definition.Airframe;
        Vec3D dragBody = new(
            AxisDrag(bodyVelocity.X, densityKgM3, airframe.SideDragAreaM2),
            AxisDrag(bodyVelocity.Y, densityKgM3, airframe.VerticalDragAreaM2),
            AxisDrag(bodyVelocity.Z, densityKgM3, airframe.FrontalDragAreaM2));
        return attitude.Rotate(dragBody);
    }

    Vec3D StubWingForce(
        in Vec3D airVelocityWorld,
        in QuaternionD attitude,
        double densityKgM3)
    {
        Vec3D bodyVelocity = attitude.Conjugate().Rotate(airVelocityWorld);
        double forwardSpeedMps = bodyVelocity.Z;
        if (forwardSpeedMps <= 4.0) return Vec3D.Zero;
        RotorcraftAirframeDefinition airframe = _definition.Airframe;
        double alphaRad = -Math.Atan2(bodyVelocity.Y, Math.Abs(forwardSpeedMps));
        double liftCoefficient = Math.Clamp(
            airframe.StubWingLiftCurveSlopePerRad
                * (airframe.StubWingIncidenceRad + alphaRad),
            -0.45,
            airframe.StubWingMaximumLiftCoefficient);
        double dynamicPressurePa = 0.5 * densityKgM3
            * forwardSpeedMps * forwardSpeedMps;
        double liftN = dynamicPressurePa * airframe.StubWingAreaM2 * liftCoefficient;
        double inducedDragCoefficient = liftCoefficient * liftCoefficient
            / (Math.PI * airframe.StubWingAspectRatio * airframe.StubWingOswaldEfficiency);
        double dragN = dynamicPressurePa * airframe.StubWingAreaM2
            * (0.030 + inducedDragCoefficient);
        return attitude.Rotate(new Vec3D(0.0, liftN, -dragN));
    }

    void ResolveSkidAndRotorContact(
        in VehicleSurfaceSample surface,
        in QuaternionD attitude,
        in Vec3D diskNormalWorld,
        double dt,
        ref Vec3D position,
        ref Vec3D velocity,
        ref BodyRates rates,
        ref VehicleContactState contact,
        ref int skidContactCount,
        ref double mainRotorClearanceM)
    {
        RotorcraftContactDefinition geometry = _definition.Contact;
        Span<Vec3D> skidPoints = stackalloc Vec3D[4] {
            new(-geometry.SkidHalfTrackM, -geometry.CenterOfMassToSkidM,
                geometry.ForwardSkidStationM),
            new( geometry.SkidHalfTrackM, -geometry.CenterOfMassToSkidM,
                geometry.ForwardSkidStationM),
            new(-geometry.SkidHalfTrackM, -geometry.CenterOfMassToSkidM,
                geometry.AftSkidStationM),
            new( geometry.SkidHalfTrackM, -geometry.CenterOfMassToSkidM,
                geometry.AftSkidStationM)
        };
        double minimumSkidHeightM = double.PositiveInfinity;
        for (int i = 0; i < skidPoints.Length; i++)
        {
            double heightM = (position + attitude.Rotate(skidPoints[i])).Y;
            minimumSkidHeightM = Math.Min(minimumSkidHeightM, heightM);
            if (heightM <= surface.HeightM + 0.025) skidContactCount++;
        }

        Vec3D hubWorld = position + attitude.Rotate(geometry.MainRotorHubOffsetBodyM);
        double rimVerticalDropM = _definition.MainRotor.RadiusM * Math.Sqrt(
            Math.Max(0.0, 1.0 - Math.Pow(
                Math.Clamp(diskNormalWorld.Dot(WorldUp), -1.0, 1.0), 2.0)));
        mainRotorClearanceM = hubWorld.Y - surface.HeightM - rimVerticalDropM;
        if (mainRotorClearanceM <= 0.0) _rotorStrikeLatched = true;

        if (minimumSkidHeightM > surface.HeightM || velocity.Y > 0.0)
        {
            contact = VehicleContactState.Airborne;
            return;
        }

        double normalImpactSpeedMps = Math.Max(0.0, -velocity.Y);
        (double pitchRad, double rollRad, _) =
            PlayerVehicleValidation.AttitudeAngles(attitude);
        if (normalImpactSpeedMps > geometry.HardImpactNormalSpeedMps
            || Math.Abs(rollRad) > geometry.MaximumLandingRollRad
            || Math.Abs(pitchRad) > geometry.MaximumLandingPitchRad)
            _hardImpactLatched = true;

        position = new Vec3D(
            position.X,
            position.Y + surface.HeightM - minimumSkidHeightM,
            position.Z);
        double friction = Math.Exp(-surface.FrictionPerSecond * dt);
        velocity = new Vec3D(velocity.X * friction, 0.0, velocity.Z * friction);
        rates = rates * Math.Exp(-4.0 * dt);
        skidContactCount = Math.Max(1, skidContactCount);
        double horizontalSpeedMps = Math.Sqrt(
            velocity.X * velocity.X + velocity.Z * velocity.Z);
        VehicleContactKind kind = _hardImpactLatched || _rotorStrikeLatched
            ? VehicleContactKind.HardImpact
            : horizontalSpeedMps <= geometry.StableContactHorizontalSpeedMps
                ? VehicleContactKind.StableSurfaceContact
                : VehicleContactKind.SurfaceContact;
        contact = new VehicleContactState(
            kind,
            surface.SurfaceId,
            surface.UpNormal.Normalized(),
            normalImpactSpeedMps);
    }

    PlayerVehicleObservation CreateObservation(
        long tick,
        in Vec3D position,
        in Vec3D groundVelocity,
        in Vec3D airVelocity,
        in Vec3D windVelocity,
        double grossMassKg,
        in QuaternionD attitude,
        in VehicleContactState contact,
        in VehicleProtectionInterventionEvidence intervention,
        double availablePowerW,
        double appliedPowerW,
        double groundEffectFactor,
        double airDensityKgM3,
        bool flyable)
    {
        (double pitch, double roll, double yaw) =
            PlayerVehicleValidation.AttitudeAngles(attitude);
        // Ground speed is horizontal by definition; a pure vertical climb has zero ground speed.
        // The vertical component already reports separately as VerticalSpeedMps, and true
        // airspeed legitimately remains the 3D air-relative magnitude.
        double horizontalGroundSpeedMps = Math.Sqrt(
            groundVelocity.X * groundVelocity.X + groundVelocity.Z * groundVelocity.Z);
        double hoverThrustN = grossMassKg * FlightModel.G0;
        double hoverInducedMps = HoverInducedVelocity(
            hoverThrustN,
            airDensityKgM3,
            _definition.MainRotor.DiskAreaM2) / Math.Max(1.0, groundEffectFactor);
        double hoverProfileW = ProfilePowerW(
            airDensityKgM3,
            _definition.MainRotor.NominalAngularSpeedRadPerSecond,
            0.0);
        double hoverPowerRequiredW = TotalRotorSystemPowerW(
            hoverProfileW
            + _definition.MainRotor.InducedPowerFactor * hoverThrustN * hoverInducedMps);
        double margin = availablePowerW > 1.0
            ? (availablePowerW - hoverPowerRequiredW) / availablePowerW
            : -1.0;
        return new PlayerVehicleObservation(
            PlayerVehicleContract.SchemaVersion,
            tick,
            _vehicleId,
            position,
            groundVelocity,
            airVelocity,
            windVelocity,
            horizontalGroundSpeedMps,
            airVelocity.Length,
            groundVelocity.Y,
            pitch,
            roll,
            yaw,
            grossMassKg,
            new VehiclePowerObservation(
                VehiclePowerAssessment.Assessed,
                availablePowerW,
                appliedPowerW,
                hoverPowerRequiredW,
                margin),
            contact,
            intervention,
            flyable);
    }

    double GroundEffectFactor(
        in Vec3D centerOfMassWorld,
        in Vec3D diskNormalWorld,
        double inPlaneSpeedMps,
        in VehicleSurfaceSample surface)
    {
        if (!surface.IsKnown) return 1.0;
        double hubHeightM = centerOfMassWorld.Y
            + _definition.Contact.MainRotorHubOffsetBodyM.Y
            - surface.HeightM;
        double radiusM = _definition.MainRotor.RadiusM;
        if (hubHeightM >= radiusM || hubHeightM <= 0.0) return 1.0;
        double validHeightM = Math.Max(0.30 * radiusM, hubHeightM);
        double ratio = radiusM / (4.0 * validHeightM);
        double cheesemanBennett = 1.0
            / Math.Sqrt(Math.Max(0.55, 1.0 - ratio * ratio));
        double heightFade = SmoothStep(1.0, 0.35, hubHeightM / radiusM);
        double speedFade = 1.0 - SmoothStep(5.0, 13.0, inPlaneSpeedMps);
        double diskAlignment = Math.Clamp(diskNormalWorld.Dot(WorldUp), 0.0, 1.0);
        return 1.0 + (Math.Min(1.30, cheesemanBennett) - 1.0)
            * heightFade * speedFade * diskAlignment;
    }

    double ProfilePowerW(
        double densityKgM3,
        double angularSpeedRadPerSecond,
        double advanceRatio)
    {
        MainRotorDefinition rotor = _definition.MainRotor;
        double tipSpeedMps = angularSpeedRadPerSecond * rotor.RadiusM;
        return rotor.Solidity * rotor.ProfileDragCoefficient / 8.0
            * densityKgM3 * rotor.DiskAreaM2
            * tipSpeedMps * tipSpeedMps * tipSpeedMps
            * (1.0 + 4.65 * advanceRatio * advanceRatio);
    }

    double TotalRotorSystemPowerW(double mainRotorAerodynamicPowerW)
    {
        RotorcraftPowerplantDefinition powerplant = _definition.Powerplant;
        double tailPowerW = powerplant.TailRotorPowerFraction
            * Math.Abs(mainRotorAerodynamicPowerW);
        return mainRotorAerodynamicPowerW + tailPowerW + powerplant.AccessoryPowerW;
    }

    double AvailablePowerW(double densityKgM3)
    {
        RotorcraftPowerplantDefinition powerplant = _definition.Powerplant;
        double densityRatio = Math.Clamp(
            densityKgM3 / powerplant.SeaLevelDensityKgM3,
            0.20,
            1.15);
        double engineLimitedW = powerplant.MilitaryRatedPowerW
            * Math.Pow(densityRatio, powerplant.DensityLapseExponent);
        return Math.Min(powerplant.TransmissionLimitW, engineLimitedW);
    }

    double CollectiveRootPitchRad(double collective) =>
        Lerp(
            _definition.MainRotor.MinimumEffectiveRootPitchRad,
            _definition.MainRotor.MaximumEffectiveRootPitchRad,
            collective);

    double RetreatingBladeStallSeverity(
        double advanceRatio,
        double rpmRatio,
        double loadFactor)
    {
        RotorcraftHandlingDefinition handling = _definition.Handling;
        double onset = handling.RetreatingBladeStallOnsetAdvanceRatio
            * Math.Clamp(rpmRatio, 0.70, 1.05)
            / Math.Sqrt(Math.Clamp(loadFactor, 0.75, 2.0));
        double full = handling.RetreatingBladeStallFullAdvanceRatio
            * Math.Clamp(rpmRatio, 0.70, 1.05);
        return SmoothStep(onset, Math.Max(onset + 0.02, full), advanceRatio);
    }

    static double VortexRingSeverity(
        double throughDiskVelocityMps,
        double inPlaneSpeedMps,
        double hoverInducedVelocityMps)
    {
        if (hoverInducedVelocityMps <= 1e-6) return 0.0;
        double descentRatio = -throughDiskVelocityMps / hoverInducedVelocityMps;
        double horizontalRatio = inPlaneSpeedMps / hoverInducedVelocityMps;
        double entry = SmoothStep(0.20, 0.55, descentRatio);
        double exit = 1.0 - SmoothStep(1.50, 2.05, descentRatio);
        double lateralEscape = 1.0 - SmoothStep(0.45, 0.95, horizontalRatio);
        return Math.Clamp(entry * exit * lateralEscape, 0.0, 1.0);
    }

    static double EffectiveTranslationalLiftFactor(
        double inPlaneSpeedMps,
        double hoverInducedVelocityMps)
    {
        double scale = Math.Max(1.0, hoverInducedVelocityMps);
        return SmoothStep(0.35 * scale, 1.05 * scale, inPlaneSpeedMps);
    }

    static double MastBumpRisk(
        double normalLoadFactor,
        double inPlaneSpeedMps,
        double forwardCyclic)
    {
        double unloading = 1.0 - SmoothStep(0.25, 0.55, normalLoadFactor);
        double speed = SmoothStep(15.0, 45.0, inPlaneSpeedMps);
        double forwardInput = SmoothStep(0.25, 0.85, Math.Max(0.0, forwardCyclic));
        return Math.Clamp(unloading * speed * (0.35 + 0.65 * forwardInput), 0.0, 1.0);
    }

    static RotorcraftFlightRegime SelectRegime(
        in VehicleContactState contact,
        bool rotorStrike,
        bool engineOperating,
        double vrsSeverity,
        double rbsSeverity,
        double etlFactor)
    {
        if (rotorStrike) return RotorcraftFlightRegime.RotorStrike;
        if (contact.IsInContact) return RotorcraftFlightRegime.SurfaceContact;
        if (!engineOperating) return RotorcraftFlightRegime.Autorotation;
        if (vrsSeverity >= 0.20) return RotorcraftFlightRegime.VortexRingState;
        if (rbsSeverity >= 0.20) return RotorcraftFlightRegime.RetreatingBladeStall;
        if (etlFactor >= 0.50) return RotorcraftFlightRegime.EffectiveTranslationalLift;
        return RotorcraftFlightRegime.Normal;
    }

    static double MomentumInducedVelocity(
        double thrustN,
        double densityKgM3,
        double diskAreaM2,
        double inPlaneSpeedMps,
        double throughDiskVelocityMps,
        double seedMps)
    {
        if (thrustN <= 0.0) return 0.0;
        double hover = HoverInducedVelocity(thrustN, densityKgM3, diskAreaM2);
        double induced = Math.Clamp(seedMps, 0.2 * hover, 2.5 * hover);
        for (int i = 0; i < 12; i++)
        {
            double resultant = Math.Sqrt(
                inPlaneSpeedMps * inPlaneSpeedMps
                + Math.Pow(throughDiskVelocityMps + induced, 2.0));
            double estimate = thrustN
                / Math.Max(1.0, 2.0 * densityKgM3 * diskAreaM2 * resultant);
            induced = 0.62 * induced + 0.38 * Math.Clamp(estimate, 0.0, 3.0 * hover);
        }
        return induced;
    }

    static double HoverInducedVelocity(double thrustN, double densityKgM3, double diskAreaM2) =>
        Math.Sqrt(Math.Max(0.0, thrustN) / (2.0 * densityKgM3 * diskAreaM2));

    static double AxisDrag(double velocityMps, double densityKgM3, double dragAreaM2) =>
        -0.5 * densityKgM3 * dragAreaM2 * Math.Abs(velocityMps) * velocityMps;

    static QuaternionD IntegrateAttitude(
        in QuaternionD attitude,
        in BodyRates rates,
        double dt)
    {
        var omega = new QuaternionD(0.0, -rates.Q, rates.R, -rates.P);
        return (attitude + (attitude * omega) * (0.5 * dt)).Normalized();
    }

    static QuaternionD YawAttitude(double yawRad)
    {
        Vec3D forward = new(Math.Sin(yawRad), 0.0, Math.Cos(yawRad));
        Vec3D right = WorldUp.Cross(forward).Normalized();
        return QuaternionD.FromFrame(right, WorldUp, forward);
    }

    void ValidateMass(double recurringBaseMassKg, double additivePayloadMassKg)
    {
        PlayerVehicleValidation.Positive(recurringBaseMassKg, nameof(recurringBaseMassKg));
        PlayerVehicleValidation.NonNegative(additivePayloadMassKg, nameof(additivePayloadMassKg));
        if (additivePayloadMassKg > _definition.Airframe.MaximumAdditivePayloadMassKg)
            throw new ArgumentOutOfRangeException(nameof(additivePayloadMassKg));
        if (recurringBaseMassKg + additivePayloadMassKg
            > _definition.Airframe.MaximumGrossMassKg)
            throw new ArgumentOutOfRangeException(
                nameof(recurringBaseMassKg),
                "Recurring base plus payload exceeds AH-1G maximum gross mass.");
        if (recurringBaseMassKg < _definition.Airframe.EmptyMassKg)
            throw new ArgumentOutOfRangeException(
                nameof(recurringBaseMassKg),
                "Recurring base mass cannot be below the production empty mass.");
    }

    static void ValidateCommand(in VerticalLiftPilotCommand command)
    {
        Unit(command.Collective, nameof(command.Collective), 0.0);
        Unit(command.ForwardCyclic, nameof(command.ForwardCyclic), -1.0);
        Unit(command.RightCyclic, nameof(command.RightCyclic), -1.0);
        Unit(command.Yaw, nameof(command.Yaw), -1.0);
    }

    static void Unit(double value, string name, double lowerBound)
    {
        if (!double.IsFinite(value) || value < lowerBound || value > 1.0)
            throw new ArgumentOutOfRangeException(name);
    }

    void EnsureFiniteOutcome()
    {
        if (!State.PositionWorldM.IsFinite
            || !State.GroundVelocityMps.IsFinite
            || !State.BodyAttitude.IsFinite
            || !State.BodyRates.IsFinite
            || !double.IsFinite(Telemetry.MainRotorRpm)
            || !double.IsFinite(Telemetry.MainRotorThrustN)
            || !double.IsFinite(Telemetry.RotorPowerRequiredW)
            || !double.IsFinite(Telemetry.VortexRingSeverity)
            || !double.IsFinite(Telemetry.RetreatingBladeStallSeverity)
            || !double.IsFinite(Telemetry.MainRotorClearanceM))
            throw new InvalidOperationException("AH-1G dynamics produced a non-finite outcome.");
    }

    static double RpmToAngularSpeed(double rpm) => rpm * TwoPi / 60.0;
    static double AngularSpeedToRpm(double angularSpeedRadPerSecond) =>
        angularSpeedRadPerSecond * 60.0 / TwoPi;
    static double FirstOrder(double current, double target, double tau, double dt) =>
        current + (target - current) * (1.0 - Math.Exp(-dt / tau));
    static double Lerp(double a, double b, double t) => a + (b - a) * t;
    static double Degrees(double value) => value * Math.PI / 180.0;
    static double WrapTwoPi(double angle)
    {
        angle %= TwoPi;
        return angle < 0.0 ? angle + TwoPi : angle;
    }

    static double SmoothStep(double edge0, double edge1, double value)
    {
        if (edge0 == edge1) return value < edge0 ? 0.0 : 1.0;
        double t = Math.Clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0);
        return t * t * (3.0 - 2.0 * t);
    }
}
