using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Motorcycle;

/// <summary>
/// Deterministic single-track runway-plane model for the sourced 2020 YZF-R1 constants.
/// Its lean, suspension, and tire responses are deliberately low-order.
/// </summary>
public sealed class YzfR1Dynamics : IPlayerVehicleDynamics
{
    public const string CapabilityVersion = "player-vehicle.yzf-r1-runway-plane.v4";

    const double DrivetrainEfficiency = 0.90;
    const double RunwayFrictionPerSecond = 2.5;
    const double StandardGravityMps2 = 9.80665;
    const double LowSpeedTipOverMps = 6.0;
    // Surrogate low-side latch: sliding with lean this far beyond what the resolved contact can
    // support, sustained for the latch window, drops the bike at any speed.
    const double LowSideExcessLeanRad = 0.10;
    const double LowSideLatchSeconds = 0.20;
    const double AutoLaunchFullEngagementSpeedMps = 8.0;
    // A manual shift owns gear choice briefly so the auto schedule cannot instantly revert it.
    const double AutoShiftManualHoldSeconds = 1.5;
    // Provisional single-track response parameters; see the YZF-R1 sources ledger.
    // Public because the rider controller normalizes its lean-stabilizing bar correction by
    // the steer-to-lean plant gain, which is proportional to this input range.
    public const double MaximumBarSteerRad = 0.12;
    const double RollResponseNaturalFrequencyRadPerSecond = 4.0;
    const double RollResponseDampingRatio = 0.85;
    const double ReferenceRollInertiaKgM2 = YzfR1Definition.RollInertiaKgM2;
    const double RollRestoringStiffnessNmPerRad = ReferenceRollInertiaKgM2
        * RollResponseNaturalFrequencyRadPerSecond * RollResponseNaturalFrequencyRadPerSecond;
    const double RollDampingNmPerRadPerSec = 2.0 * RollResponseDampingRatio
        * RollResponseNaturalFrequencyRadPerSecond * ReferenceRollInertiaKgM2;
    // Wheel-lift pitch dynamics: while both wheels are grounded, pitch is the suspension
    // geometry (squat minus dive over the wheelbase). When a contact load reaches zero AND
    // the rigid-body moment about the remaining contact patch is lift-positive, the bike
    // rotates as a rigid body about that patch. Past the static balance angle plus the
    // margin, the lift is unrecoverable and latches the crash (loop-over / endo).
    const double LiftNormalEpsilonN = 2.0;
    const double LoopOverMarginRad = 0.10;
    // Surrogate aero/gyroscopic pitch damping about the contact pivot; small on purpose so
    // the lift keeps its real runaway character.
    const double PitchLiftDampingNmPerRadPerSec = 60.0;
    // Surrogate touchdown impact absorption: the suspension eats most of the pitch rate.
    const double TouchdownRateRetention = 0.25;
    enum WheelLiftState { Grounded, FrontLifted, RearLifted }
    const double LeanHoldRollDampingBoost = 0.40;
    // Provisional low-order coupling: body shift can tighten a turn, but cannot replace the bars.
    const double RiderBodyShiftSteeringFraction = 0.50;
    const double RiderBodyShiftFullAuthoritySpeedMps = 8.0;
    readonly RiderCerebellum _cerebellum = new();
    CerebellumSample _cerebellumSample;
    // Surrogate combined-CG longitudinal position (≈49/51 static split, see the ledger).
    // With CombinedCgHeightM this sets the wheelie threshold at ~1.01 g and the endo
    // threshold at ~1.05 g, bracketed by the ~1.08 g full-load tire grip cap so both lifts
    // are reachable and 2nd-gear power wheelies stay marginal/absent.
    const double StaticFrontLoadFraction = 0.49;
    static readonly Vec3D WorldUp = new(0.0, 1.0, 0.0);

    readonly string _vehicleId;
    readonly double _spawnSurfaceHeightM;
    readonly double _rollInertiaKgM2;
    double _headingRad;
    double _leanRad;
    double _leanRateRadPerSec;
    double _frontSuspensionCompressionM;
    double _frontSuspensionVelocityMps;
    double _rearSuspensionCompressionM;
    double _rearSuspensionVelocityMps;
    double _frontStaticCompressionM;
    double _rearStaticCompressionM;
    double _pitchRad;
    double _pitchRateRadPerSec;
    WheelLiftState _liftState;
    bool _kneeDown;
    int _gear = 1;
    double _engineRpm = YzfR1Definition.IdleRpm;
    bool _engineRunning = true;
    double _clutchEngagement = 1.0;
    bool _isTippedOver;
    double _lowSideExcessSeconds;
    double _autoShiftInhibitSeconds;
    long? _lastTick;

    public YzfR1Dynamics(
        string vehicleId,
        Vec3D initialPositionWorldM,
        double initialHeadingRad,
        double? initialRecurringBaseMassKg = null,
        double? rollInertiaKgM2 = null)
    {
        PlayerVehicleValidation.Required(vehicleId, nameof(vehicleId));
        PlayerVehicleValidation.Finite(initialPositionWorldM, nameof(initialPositionWorldM));
        PlayerVehicleValidation.Finite(initialHeadingRad, nameof(initialHeadingRad));
        double recurringBaseMassKg = initialRecurringBaseMassKg
            ?? YzfR1Definition.CombinedMassKg;
        ValidateMass(recurringBaseMassKg, additivePayloadMassKg: 0.0);
        _rollInertiaKgM2 = rollInertiaKgM2 ?? YzfR1Definition.RollInertiaKgM2;
        PlayerVehicleValidation.Positive(_rollInertiaKgM2, nameof(rollInertiaKgM2));

        _vehicleId = vehicleId;
        _headingRad = PlayerVehicleValidation.WrapPi(initialHeadingRad);
        _spawnSurfaceHeightM = initialPositionWorldM.Y;
        (double initialFrontNormalForceN, double initialRearNormalForceN) =
            CalculateNormalLoadTargets(recurringBaseMassKg, 0.0, riderForeAft: 0.0);
        _frontSuspensionCompressionM = CompressionForNormalForce(
            initialFrontNormalForceN,
            YzfR1Definition.FrontSpringRateNPerM,
            YzfR1Definition.FrontSuspensionTravelM);
        _rearSuspensionCompressionM = CompressionForNormalForce(
            initialRearNormalForceN,
            YzfR1Definition.RearSpringRateNPerM,
            YzfR1Definition.RearSuspensionTravelM);
        _frontStaticCompressionM = _frontSuspensionCompressionM;
        _rearStaticCompressionM = _rearSuspensionCompressionM;

        QuaternionD attitude = LeaningAttitude(_headingRad, leanRad: 0.0);
        State = new PlayerVehicleState(
            PlayerVehicleContract.SchemaVersion,
            -1,
            vehicleId,
            initialPositionWorldM,
            Vec3D.Zero,
            attitude,
            default,
            recurringBaseMassKg,
            0.0,
            recurringBaseMassKg,
            VehicleContactState.Unknown,
            Flyable: true);
        Observation = CreateObservation(
            tick: -1,
            position: initialPositionWorldM,
            groundVelocity: Vec3D.Zero,
            windVelocity: Vec3D.Zero,
            grossMassKg: recurringBaseMassKg,
            contact: VehicleContactState.Unknown,
            intervention: VehicleProtectionInterventionEvidence.None,
            rollRad: 0.0,
            yawRad: _headingRad);
        Telemetry = new MotorcycleTelemetry(
            -1,
            0.0,
            YzfR1Definition.IdleRpm,
            1,
            0.0,
            0.0,
            0.0,
            attitude,
            initialFrontNormalForceN,
            initialRearNormalForceN,
            0.0,
            0.0,
            0.0,
            false,
            false,
            WheelieBalance: -1.0,
            StoppieBalance: -1.0,
            PitchReflexAuthority: 0.0,
            KneeDown: false,
            KneeProximity: 0.0,
            LeanHoldAuthority: 0.0,
            PitchRad: 0.0,
            RiderLateral: 0.0,
            RiderForeAft: 0.0,
            ClutchMode: MotorcycleClutchMode.Auto,
            ClutchEngagement: 1.0);
        Capability = new PlayerVehicleCapability(
            PlayerVehicleContract.SchemaVersion,
            CapabilityVersion,
            vehicleId,
            YzfR1Definition.DynamicsProviderId,
            PlayerVehicleKind.Motorcycle,
            VehicleCommandFamily.MotorcyclePilot,
            VehicleContactAuthority.IntegratedSkidContact,
            PlayerVehicleContract.FixedStepHz,
            YzfR1Definition.CombinedMassKg,
            MaximumAdditivePayloadMassKg: 0.0,
            ReportsPowerMargin: false,
            ReportsWindResponse: true,
            ReportsProtectionInterventionEvidence: true,
            FidelityDisclosure:
                "Single-track runway-plane longitudinal skeleton using sourced 2020 Yamaha "
                + "YZF-R1 mass, power, torque, primary-reduction gearing, and tire-radius "
                + "constants plus explicitly labelled surrogate drivetrain/traction "
                + "assumptions. It models drive with an auto/manual sequential shift "
                + "schedule, hydraulic-capacity front/rear brakes, CdA aero drag, rolling "
                + "resistance, closed-throttle engine braking, and provisional single-track "
                + "steer/rider-CG lean plus bounded front/rear spring-damper load transfer "
                + "with a load-sensitive friction-circle tire that authors planar curvature. "
                + "Wheel-lift pitch dynamics rotate the bike about the contact patch when an "
                + "axle unloads (power wheelie, brake stoppie) and latch loop-over or endo "
                + "crashes past the balance angle, alongside latched low-speed tip-over and "
                + "sustained-slide low-side tip-over on a horizontal contact plane; "
                + "full-flight airborne dynamics are not yet implemented.");
        PlayerVehicleValidation.Capability(Capability);
    }

    public PlayerVehicleCapability Capability { get; }
    public PlayerVehicleState State { get; private set; }
    public PlayerVehicleObservation Observation { get; private set; }
    public MotorcycleTelemetry Telemetry { get; private set; }

    public static YzfR1Dynamics AtRestOnSurface(
        string id,
        Vec3D position,
        double headingRad,
        double? rollInertiaKgM2 = null) =>
        new(id, position, headingRad, rollInertiaKgM2: rollInertiaKgM2);

    /// <summary>Compatibility alias for existing planar-surface dynamics tests.</summary>
    public static YzfR1Dynamics AtRestOnRunway(
        string id,
        Vec3D position,
        double headingRad,
        double? rollInertiaKgM2 = null) =>
        AtRestOnSurface(id, position, headingRad, rollInertiaKgM2);

    /// <summary>
    /// Clears latched tip-over and re-initialises at-rest dynamics at a grid spawn. Used by
    /// <see cref="WeekendRideMissionRuntime"/> after a fall; not a generic teleport API.
    /// </summary>
    public void ResetTo(Vec3D positionWorldM, double headingRad)
    {
        PlayerVehicleValidation.Finite(positionWorldM, nameof(positionWorldM));
        PlayerVehicleValidation.Finite(headingRad, nameof(headingRad));

        _isTippedOver = false;
        _lowSideExcessSeconds = 0.0;
        _headingRad = PlayerVehicleValidation.WrapPi(headingRad);
        _leanRad = 0.0;
        _leanRateRadPerSec = 0.0;
        _pitchRad = 0.0;
        _pitchRateRadPerSec = 0.0;
        _liftState = WheelLiftState.Grounded;
        _frontSuspensionVelocityMps = 0.0;
        _rearSuspensionVelocityMps = 0.0;
        _kneeDown = false;
        _cerebellum.Reset();
        _cerebellumSample = default;
        _gear = 1;
        _engineRpm = YzfR1Definition.IdleRpm;
        _engineRunning = true;
        _clutchEngagement = 1.0;
        _autoShiftInhibitSeconds = 0.0;
        _lastTick = null;

        double grossMassKg = State.RecurringBaseMassKg + State.AdditivePayloadMassKg;
        (double frontNormalForceN, double rearNormalForceN) =
            CalculateNormalLoadTargets(grossMassKg, 0.0, riderForeAft: 0.0);
        _frontSuspensionCompressionM = CompressionForNormalForce(
            frontNormalForceN,
            YzfR1Definition.FrontSpringRateNPerM,
            YzfR1Definition.FrontSuspensionTravelM);
        _rearSuspensionCompressionM = CompressionForNormalForce(
            rearNormalForceN,
            YzfR1Definition.RearSpringRateNPerM,
            YzfR1Definition.RearSuspensionTravelM);
        _frontStaticCompressionM = _frontSuspensionCompressionM;
        _rearStaticCompressionM = _rearSuspensionCompressionM;

        QuaternionD attitude = LeaningAttitude(_headingRad, leanRad: 0.0);
        State = new PlayerVehicleState(
            PlayerVehicleContract.SchemaVersion,
            -1,
            _vehicleId,
            positionWorldM,
            Vec3D.Zero,
            attitude,
            default,
            State.RecurringBaseMassKg,
            State.AdditivePayloadMassKg,
            grossMassKg,
            VehicleContactState.Unknown,
            Flyable: true);
        Observation = CreateObservation(
            tick: -1,
            position: positionWorldM,
            groundVelocity: Vec3D.Zero,
            windVelocity: Vec3D.Zero,
            grossMassKg: grossMassKg,
            contact: VehicleContactState.Unknown,
            intervention: VehicleProtectionInterventionEvidence.None,
            rollRad: 0.0,
            yawRad: _headingRad);
        Telemetry = new MotorcycleTelemetry(
            -1,
            0.0,
            YzfR1Definition.IdleRpm,
            1,
            0.0,
            0.0,
            0.0,
            attitude,
            frontNormalForceN,
            rearNormalForceN,
            0.0,
            0.0,
            0.0,
            false,
            false,
            WheelieBalance: -1.0,
            StoppieBalance: -1.0,
            PitchReflexAuthority: 0.0,
            KneeDown: false,
            KneeProximity: 0.0,
            LeanHoldAuthority: 0.0,
            PitchRad: 0.0,
            RiderLateral: 0.0,
            RiderForeAft: 0.0,
            ClutchMode: MotorcycleClutchMode.Auto,
            ClutchEngagement: 1.0);
    }

    /// <summary>Test hook to latch tip-over without a full dynamics excursion.</summary>
    public void DebugForceTipOver()
    {
        if (_isTippedOver)
            return;

        _isTippedOver = true;
        double grossMassKg = State.RecurringBaseMassKg + State.AdditivePayloadMassKg;
        VehicleContactState contact = new(
            VehicleContactKind.StableSurfaceContact,
            "spawn-runway",
            WorldUp,
            NormalImpactSpeedMps: 0.0);
        State = State with {
            Flyable = false,
            GroundVelocityMps = Vec3D.Zero,
            Contact = contact
        };
        Observation = CreateObservation(
            State.Tick,
            State.PositionWorldM,
            Vec3D.Zero,
            Observation.WindVelocityMps,
            grossMassKg,
            contact,
            Observation.ProtectionIntervention,
            _leanRad,
            _headingRad,
            flyable: false);
        Telemetry = Telemetry with { IsTippedOver = true, SpeedMps = 0.0 };
    }

    public PlayerVehicleAdvanceResult Advance(in PlayerVehicleAdvanceInput input)
    {
        PlayerVehicleValidation.AdvanceInput(
            input,
            VehicleCommandFamily.MotorcyclePilot,
            _lastTick);
        ValidateCommand(input.Command.Motorcycle);
        ValidateMass(input.RecurringBaseMassKg, input.AdditivePayloadMassKg);

        const double dt = PlayerVehicleContract.FixedDeltaSeconds;
        MotorcyclePilotCommand command = input.Command.Motorcycle;
        double grossMassKg = input.RecurringBaseMassKg + input.AdditivePayloadMassKg;
        VehicleSurfaceSample surface = ResolveSurface(input.Environment.Surface);
        if (_isTippedOver)
            return AdvanceTippedOver(input, surface, grossMassKg);

        Vec3D forward = Forward(_headingRad);
        double speedMps = State.GroundVelocityMps.Dot(forward);
        double absoluteSpeedMps = Math.Abs(speedMps);
        AdvancePowertrain(
            command,
            absoluteSpeedMps,
            dt,
            out double engineRpm,
            out double clutchEngagement,
            out double totalGearRatio,
            out double engineTorqueNm,
            out double engineBrakingForceN);
        double requestedDriveForceN = _engineRunning
            ? engineTorqueNm * totalGearRatio
                * DrivetrainEfficiency * clutchEngagement / YzfR1Definition.RearTireRadiusM
            : 0.0;
        double surfaceGrip = Math.Clamp(
            surface.FrictionPerSecond / RunwayFrictionPerSecond,
            0.0,
            1.0);
        double nominalTireForceLimitN = YzfR1Definition.TirePeakFrictionCoefficient
            * surfaceGrip * grossMassKg * StandardGravityMps2;
        double requestedDriveForceForLoadN = Math.Min(requestedDriveForceN, nominalTireForceLimitN);
        // Brake requests are hydraulic capacities (sourced ledger estimates), deliberately not
        // surface-scaled: the calipers do not care about grass, the per-axle tire clamp does.
        double requestedFrontBrakeForceN = command.Brake
            * YzfR1Definition.FrontBrakeForceCapacityN;
        // Closed-throttle engine braking retards through the rear contact patch with the brakes.
        double requestedRearBrakeForceN = command.Brake
            * YzfR1Definition.RearBrakeForceCapacityN
            + engineBrakingForceN;
        double aeroDragForceN = 0.5 * input.Environment.AirDensityKgM3
            * YzfR1Definition.AeroDragAreaCdAM2 * speedMps * speedMps;
        double resistiveDirection = absoluteSpeedMps > 1e-6 ? Math.Sign(speedMps) : 0.0;
        // The load-transfer estimate clamps each brake request by the previous tick's per-axle
        // grip so a capacity request the tires cannot transmit does not slam the load targets.
        double referenceNormalForLoadN = grossMassKg * StandardGravityMps2 * 0.5;
        double frontBrakeForceForLoadN = Math.Min(
            requestedFrontBrakeForceN,
            TireForceLimit(Telemetry.FrontNormalForceN, referenceNormalForLoadN, surfaceGrip));
        double rearBrakeForceForLoadN = Math.Min(
            requestedRearBrakeForceN,
            TireForceLimit(Telemetry.RearNormalForceN, referenceNormalForLoadN, surfaceGrip));
        double requestedBrakeForceForLoadN = absoluteSpeedMps > 1e-6
            ? Math.Sign(speedMps) * (frontBrakeForceForLoadN + rearBrakeForceForLoadN)
            : 0.0;
        double requestedLongitudinalAccelerationMps2 = (requestedDriveForceForLoadN
            - requestedBrakeForceForLoadN
            - resistiveDirection * aeroDragForceN) / grossMassKg;
        (double targetFrontNormalForceN, double targetRearNormalForceN) =
            CalculateNormalLoadTargets(
                grossMassKg,
                requestedLongitudinalAccelerationMps2,
                command.RiderForeAft);
        // While a wheel is airborne the grounded transfer formula does not apply: the lifted
        // wheel carries nothing and the contact wheel carries the full weight.
        if (_liftState == WheelLiftState.FrontLifted)
            (targetFrontNormalForceN, targetRearNormalForceN) =
                (0.0, grossMassKg * StandardGravityMps2);
        else if (_liftState == WheelLiftState.RearLifted)
            (targetFrontNormalForceN, targetRearNormalForceN) =
                (grossMassKg * StandardGravityMps2, 0.0);
        double frontNormalForceN = AdvanceSuspension(
            ref _frontSuspensionCompressionM,
            ref _frontSuspensionVelocityMps,
            targetFrontNormalForceN,
            grossMassKg * StaticFrontLoadFraction,
            YzfR1Definition.FrontSpringRateNPerM,
            YzfR1Definition.FrontDamperCoefficientNPerMps,
            YzfR1Definition.FrontSuspensionTravelM,
            dt);
        double rearNormalForceN = AdvanceSuspension(
            ref _rearSuspensionCompressionM,
            ref _rearSuspensionVelocityMps,
            targetRearNormalForceN,
            grossMassKg * (1.0 - StaticFrontLoadFraction),
            YzfR1Definition.RearSpringRateNPerM,
            YzfR1Definition.RearDamperCoefficientNPerMps,
            YzfR1Definition.RearSuspensionTravelM,
            dt);

        RiderReflexSample reflex = RiderReflexAssists.Evaluate(
            frontNormalForceN,
            rearNormalForceN,
            _pitchRad,
            _pitchRateRadPerSec,
            _leanRad,
            command.RiderLateral,
            _kneeDown);
        _kneeDown = reflex.KneeDown;

        double riderMassKgEarly = Math.Clamp(
            grossMassKg - YzfR1Definition.CurbMassKg,
            0.0,
            YzfR1Definition.RiderMassKg);
        double riderLateralCgMEarly = riderMassKgEarly / grossMassKg
            * YzfR1Definition.RiderCgLateralRangeM * command.RiderLateral;
        double totalNormalEarly = frontNormalForceN + rearNormalForceN;
        double cogAlongEarly = totalNormalEarly > 1e-9
            ? YzfR1Definition.WheelbaseM * (frontNormalForceN / totalNormalEarly)
            : YzfR1Definition.WheelbaseM * StaticFrontLoadFraction;
        double cogLateralEarly = riderLateralCgMEarly
            - YzfR1Definition.CombinedCgHeightM * Math.Sin(_leanRad);
        // Provisional grip from last telemetry until this tick's tire solve finishes.
        _cerebellumSample = _cerebellum.EvaluateAndIntegrate(
            cogAlongEarly,
            cogLateralEarly,
            Math.Abs(speedMps),
            Telemetry.FrontGripUse,
            Telemetry.RearGripUse,
            Telemetry.IsSliding,
            _isTippedOver,
            dt);
        double assistScale = _cerebellumSample.AssistScale;

        // A lifted front wheel has no ground steering authority; the bars come back at
        // touchdown. (During a stoppie the front is planted, so steering stays live.)
        double steerAngleRad = _liftState == WheelLiftState.FrontLifted
            ? 0.0
            : command.Steer * MaximumBarSteerRad;
        double effectiveWheelbaseM = YzfR1Definition.WheelbaseM
            + YzfR1Definition.TrailM / Math.Cos(YzfR1Definition.RakeRad);
        TireForceSummary longitudinalOnly = ResolveTireForces(
            grossMassKg,
            frontNormalForceN,
            rearNormalForceN,
            surfaceGrip,
            requestedDriveForceN,
            requestedFrontBrakeForceN,
            requestedRearBrakeForceN,
            speedMps,
            desiredLateralForceN: 0.0);
        // Aero drag and rolling resistance retard the body directly; they consume no tire grip.
        double rollingResistanceForceN = YzfR1Definition.RollingResistanceCoefficient
            * (frontNormalForceN + rearNormalForceN);
        double bodyResistiveForceN = resistiveDirection
            * (aeroDragForceN + rollingResistanceForceN);
        double longitudinalAccelerationMps2 =
            (longitudinalOnly.LongitudinalForceN - bodyResistiveForceN) / grossMassKg;
        double nextSpeedMps = speedMps + longitudinalAccelerationMps2 * dt;
        if ((speedMps > 0.0 && nextSpeedMps < 0.0)
            || (speedMps < 0.0 && nextSpeedMps > 0.0))
            nextSpeedMps = 0.0;
        (double nextPitchRad, double nextPitchRateRadPerSec, bool wheelLiftCrash) =
            AdvancePitchAndWheelLift(
                grossMassKg,
                frontNormalForceN,
                rearNormalForceN,
                longitudinalAccelerationMps2,
                CgFromRearAxle(grossMassKg, command.RiderForeAft),
                dt);
        double geometricYawRateRadPerSec = nextSpeedMps * Math.Tan(steerAngleRad)
            / effectiveWheelbaseM;
        double riderMassKg = Math.Clamp(
            grossMassKg - YzfR1Definition.CurbMassKg,
            0.0,
            YzfR1Definition.RiderMassKg);
        double riderLateralCgM = riderMassKg / grossMassKg
            * YzfR1Definition.RiderCgLateralRangeM * command.RiderLateral;
        double bodyShiftSpeedAuthority = _liftState == WheelLiftState.FrontLifted
            ? 0.0
            : Math.Clamp(
                Math.Abs(nextSpeedMps) / RiderBodyShiftFullAuthoritySpeedMps,
                0.0,
                1.0);
        double riderBodyShiftAccelerationMps2 = StandardGravityMps2
            * riderLateralCgM / YzfR1Definition.CombinedCgHeightM
            * RiderBodyShiftSteeringFraction
            * bodyShiftSpeedAuthority;
        double desiredLateralAccelerationMps2 = nextSpeedMps * geometricYawRateRadPerSec
            + riderBodyShiftAccelerationMps2;
        double desiredLeanRad = -Math.Atan(
            desiredLateralAccelerationMps2 / StandardGravityMps2
            + riderLateralCgM / YzfR1Definition.CombinedCgHeightM);
        desiredLeanRad = Math.Clamp(
            desiredLeanRad,
            -YzfR1Definition.MaxLeanRad,
            YzfR1Definition.MaxLeanRad);
        TireForceSummary tireForces = ResolveTireForces(
            grossMassKg,
            frontNormalForceN,
            rearNormalForceN,
            surfaceGrip,
            requestedDriveForceN,
            requestedFrontBrakeForceN,
            requestedRearBrakeForceN,
            speedMps,
            desiredLateralAccelerationMps2 * grossMassKg);
        double lateralAccelerationMps2 = tireForces.LateralForceN / grossMassKg;
        double targetLeanRad = -Math.Atan(
            lateralAccelerationMps2 / StandardGravityMps2
            + riderLateralCgM / YzfR1Definition.CombinedCgHeightM);
        targetLeanRad = Math.Clamp(
            targetLeanRad,
            -YzfR1Definition.MaxLeanRad,
            YzfR1Definition.MaxLeanRad);
        double rollRestoringTorqueNm = RollRestoringStiffnessNmPerRad
            * (targetLeanRad - _leanRad);
        double rollDampingScale = 1.0
            + LeanHoldRollDampingBoost * assistScale * reflex.LeanHoldAuthority;
        double rollDampingTorqueNm = RollDampingNmPerRadPerSec
            * rollDampingScale
            * _leanRateRadPerSec;
        double nextLeanRateRadPerSec = _leanRateRadPerSec
            + (rollRestoringTorqueNm - rollDampingTorqueNm)
                / _rollInertiaKgM2 * dt;
        double nextLeanRad = Math.Clamp(
            _leanRad + nextLeanRateRadPerSec * dt,
            -YzfR1Definition.MaxLeanRad,
            YzfR1Definition.MaxLeanRad);
        if (Math.Abs(nextLeanRad) >= YzfR1Definition.MaxLeanRad)
            nextLeanRateRadPerSec = 0.0;
        // Contact force is the trajectory authority: v * yawRate is the lateral acceleration the
        // tires actually resolved, not the unconstrained geometric demand. The runway-plane model
        // still omits a separate sideslip state, so saturation widens the turn immediately.
        double nextYawRateRadPerSec = Math.Abs(nextSpeedMps) > 1e-3
            ? lateralAccelerationMps2 / nextSpeedMps
            : 0.0;
        double nextHeadingRad = PlayerVehicleValidation.WrapPi(
            _headingRad + nextYawRateRadPerSec * dt);
        double maximumSupportedLeanRad = Math.Atan(
            tireForces.AvailableLateralForceN / (grossMassKg * StandardGravityMps2));
        bool lowSpeedTipOver = Math.Abs(nextSpeedMps) <= LowSpeedTipOverMps
            && tireForces.IsSliding
            && Math.Abs(desiredLeanRad) > maximumSupportedLeanRad;
        // Low-side at any speed: the bike is sliding while carrying more lean than the resolved
        // contact can hold up (e.g. pavement-limit lean carried onto the grass verge).
        bool slideExceedsSupport = tireForces.IsSliding
            && Math.Abs(nextLeanRad) > maximumSupportedLeanRad + LowSideExcessLeanRad;
        _lowSideExcessSeconds = slideExceedsSupport ? _lowSideExcessSeconds + dt : 0.0;
        _isTippedOver = lowSpeedTipOver
            || _lowSideExcessSeconds >= LowSideLatchSeconds
            || wheelLiftCrash;

        Vec3D previousVelocity = forward * speedMps;
        Vec3D nextVelocity = Forward(nextHeadingRad) * nextSpeedMps;
        Vec3D nextPosition = State.PositionWorldM
            + (previousVelocity + nextVelocity) * (0.5 * dt);
        nextPosition = new Vec3D(nextPosition.X, surface.HeightM, nextPosition.Z);
        VehicleContactState contact = new(
            VehicleContactKind.StableSurfaceContact,
            surface.SurfaceId,
            WorldUp,
            NormalImpactSpeedMps: 0.0);
        QuaternionD attitude = LeaningAttitude(nextHeadingRad, nextLeanRad);

        State = new PlayerVehicleState(
            PlayerVehicleContract.SchemaVersion,
            input.Tick,
            _vehicleId,
            nextPosition,
            nextVelocity,
            attitude,
            new BodyRates(nextLeanRateRadPerSec, 0.0, nextYawRateRadPerSec),
            input.RecurringBaseMassKg,
            input.AdditivePayloadMassKg,
            grossMassKg,
            contact,
            Flyable: !_isTippedOver);
        Observation = CreateObservation(
            input.Tick,
            nextPosition,
            nextVelocity,
            input.Environment.WindVelocityMps,
            grossMassKg,
            contact,
            input.ProtectionIntervention,
            nextLeanRad,
            nextHeadingRad,
            flyable: !_isTippedOver,
            nextPitchRad);
        double totalNormalForceN = frontNormalForceN + rearNormalForceN;
        double cogAlongFromRearM = totalNormalForceN > 1e-9
            ? YzfR1Definition.WheelbaseM * (frontNormalForceN / totalNormalForceN)
            : YzfR1Definition.WheelbaseM * StaticFrontLoadFraction;
        // Positive lateral = bike right. Right lean (negative LeanRad) moves CoG right.
        double cogLateralM = riderLateralCgM
            - YzfR1Definition.CombinedCgHeightM * Math.Sin(nextLeanRad);
        Telemetry = new MotorcycleTelemetry(
            input.Tick,
            Math.Abs(nextSpeedMps),
            engineRpm,
            _gear,
            command.Throttle,
            command.Brake,
            nextLeanRad,
            LeaningAttitude(
                nextHeadingRad,
                nextLeanRad * (1.0 - YzfR1Definition.HeadStabilizationFraction)),
            frontNormalForceN,
            rearNormalForceN,
            tireForces.LongitudinalForceN,
            tireForces.LateralForceN,
            tireForces.AvailableLateralForceN,
            tireForces.IsSliding,
            _isTippedOver,
            reflex.WheelieBalance,
            reflex.StoppieBalance,
            reflex.PitchReflexAuthority,
            reflex.KneeDown,
            reflex.KneeProximity,
            reflex.LeanHoldAuthority,
            nextPitchRad,
            command.RiderLateral,
            command.RiderForeAft,
            command.ClutchMode,
            clutchEngagement,
            tireForces.FrontLongitudinalForceN,
            tireForces.RearLongitudinalForceN,
            tireForces.FrontLateralForceN,
            tireForces.RearLateralForceN,
            tireForces.FrontGripUse,
            tireForces.RearGripUse,
            cogAlongFromRearM,
            cogLateralM,
            _cerebellumSample.SkillAuthority,
            _cerebellumSample.EnvelopeCenterAlongFromRearM,
            _cerebellumSample.EnvelopeHalfAlongM,
            _cerebellumSample.EnvelopeHalfLateralM,
            _cerebellumSample.CogInsideEnvelope,
            _cerebellumSample.AssistScale);
        _headingRad = nextHeadingRad;
        _leanRad = nextLeanRad;
        _leanRateRadPerSec = nextLeanRateRadPerSec;
        _pitchRad = nextPitchRad;
        _pitchRateRadPerSec = nextPitchRateRadPerSec;
        EnsureFiniteOutcome();
        _lastTick = input.Tick;
        return new PlayerVehicleAdvanceResult(State, Observation);
    }

    PlayerVehicleAdvanceResult AdvanceTippedOver(
        in PlayerVehicleAdvanceInput input,
        in VehicleSurfaceSample surface,
        double grossMassKg)
    {
        VehicleContactState contact = new(
            VehicleContactKind.StableSurfaceContact,
            surface.SurfaceId,
            WorldUp,
            NormalImpactSpeedMps: 0.0);
        State = new PlayerVehicleState(
            PlayerVehicleContract.SchemaVersion,
            input.Tick,
            _vehicleId,
            State.PositionWorldM,
            Vec3D.Zero,
            State.BodyAttitude,
            default,
            input.RecurringBaseMassKg,
            input.AdditivePayloadMassKg,
            grossMassKg,
            contact,
            Flyable: false);
        Observation = CreateObservation(
            input.Tick,
            State.PositionWorldM,
            Vec3D.Zero,
            input.Environment.WindVelocityMps,
            grossMassKg,
            contact,
            input.ProtectionIntervention,
            _leanRad,
            _headingRad,
            flyable: false);
        _cerebellumSample = _cerebellum.EvaluateAndIntegrate(
            Telemetry.CogAlongFromRearM,
            Telemetry.CogLateralM,
            0.0,
            Telemetry.FrontGripUse,
            Telemetry.RearGripUse,
            isSliding: false,
            isTippedOver: true,
            PlayerVehicleContract.FixedDeltaSeconds);
        Telemetry = new MotorcycleTelemetry(
            input.Tick,
            0.0,
            _engineRunning ? _engineRpm : 0.0,
            _gear,
            Throttle: input.Command.Motorcycle.Throttle,
            Brake: input.Command.Motorcycle.Brake,
            _leanRad,
            Telemetry.ViewAttitude,
            Telemetry.FrontNormalForceN,
            Telemetry.RearNormalForceN,
            0.0,
            0.0,
            0.0,
            false,
            true,
            Telemetry.WheelieBalance,
            Telemetry.StoppieBalance,
            Telemetry.PitchReflexAuthority,
            Telemetry.KneeDown,
            Telemetry.KneeProximity,
            Telemetry.LeanHoldAuthority,
            Telemetry.PitchRad,
            input.Command.Motorcycle.RiderLateral,
            input.Command.Motorcycle.RiderForeAft,
            input.Command.Motorcycle.ClutchMode,
            _clutchEngagement,
            CogAlongFromRearM: Telemetry.CogAlongFromRearM,
            CogLateralM: Telemetry.CogLateralM,
            RiderSkillAuthority: _cerebellumSample.SkillAuthority,
            CogEnvelopeCenterAlongM: _cerebellumSample.EnvelopeCenterAlongFromRearM,
            CogEnvelopeHalfAlongM: _cerebellumSample.EnvelopeHalfAlongM,
            CogEnvelopeHalfLateralM: _cerebellumSample.EnvelopeHalfLateralM,
            CogInsideEnvelope: false,
            CerebellarAssistScale: _cerebellumSample.AssistScale);
        _lastTick = input.Tick;
        return new PlayerVehicleAdvanceResult(State, Observation);
    }

    void AdvancePowertrain(
        in MotorcyclePilotCommand command,
        double absoluteSpeedMps,
        double dt,
        out double engineRpm,
        out double clutchEngagement,
        out double totalGearRatio,
        out double engineTorqueNm,
        out double engineBrakingForceN)
    {
        double wheelRpm = absoluteSpeedMps
            / (2.0 * Math.PI * YzfR1Definition.RearTireRadiusM) * 60.0;
        totalGearRatio = YzfR1Definition.TotalRatio(_gear);
        double coupledRpm = Math.Max(YzfR1Definition.IdleRpm, wheelRpm * totalGearRatio);
        double previousClutchEngagement = _clutchEngagement;

        _autoShiftInhibitSeconds = Math.Max(0.0, _autoShiftInhibitSeconds - dt);
        ApplyGearShiftRequest(command.GearShiftRequest, command.ClutchMode, coupledRpm);

        totalGearRatio = YzfR1Definition.TotalRatio(_gear);
        coupledRpm = Math.Max(YzfR1Definition.IdleRpm, wheelRpm * totalGearRatio);
        clutchEngagement = ResolveClutchEngagement(
            command.ClutchMode,
            command.Clutch,
            absoluteSpeedMps,
            command.Throttle);

        if (!_engineRunning)
        {
            _engineRpm = 0.0;
        }
        else if (command.ClutchMode == MotorcycleClutchMode.Manual
            && previousClutchEngagement < 0.05
            && clutchEngagement > 0.95
            && absoluteSpeedMps < 1.0
            && _engineRpm < YzfR1Definition.StallRpm)
        {
            _engineRunning = false;
            _engineRpm = 0.0;
        }
        else
        {
            double freeRevTargetRpm = YzfR1Definition.IdleRpm
                + command.Throttle
                    * (YzfR1Definition.RedlineRpm - YzfR1Definition.IdleRpm);
            if (clutchEngagement >= 0.99)
                _engineRpm = coupledRpm;
            else
            {
                double slipBlend = 1.0 - clutchEngagement;
                _engineRpm = coupledRpm * clutchEngagement
                    + freeRevTargetRpm * slipBlend;
            }

            double rpmDelta = _engineRpm - coupledRpm;
            double rpmAccelRpmPerSec = rpmDelta / Math.Max(
                YzfR1Definition.EngineInertiaKgM2 * 10.0,
                1e-6);
            _engineRpm += rpmAccelRpmPerSec * dt;
            _engineRpm = Math.Clamp(_engineRpm, 0.0, YzfR1Definition.RedlineRpm);
        }

        _clutchEngagement = clutchEngagement;
        engineRpm = _engineRunning ? _engineRpm : 0.0;
        double revLimiterRpm = Math.Max(_engineRpm, coupledRpm);
        engineTorqueNm = _engineRunning
            ? command.Throttle * TorqueAt(revLimiterRpm)
            : 0.0;
        // Closed-throttle motoring drag, linear in rpm above idle; a stalled engine's drag is a
        // manual-clutch corner case this skeleton does not model yet.
        double motoringRpmFraction = Math.Clamp(
            (_engineRpm - YzfR1Definition.IdleRpm)
                / (YzfR1Definition.RedlineRpm - YzfR1Definition.IdleRpm),
            0.0,
            1.0);
        engineBrakingForceN = _engineRunning
            ? (1.0 - command.Throttle) * YzfR1Definition.EngineBrakingTorqueNmAtRedline
                * motoringRpmFraction * totalGearRatio * clutchEngagement
                / YzfR1Definition.RearTireRadiusM
            : 0.0;
    }

    /// <summary>
    /// Manual requests shift freely (downshifts are over-rev protected) and hold off the auto
    /// schedule briefly; with no request the auto clutch schedules its own shifts across the
    /// surrogate 12,000/4,000 rpm window. Post-shift rpm needs no reassignment here: the caller
    /// recomputes the coupled rpm with the new gear before integrating engine speed.
    /// </summary>
    void ApplyGearShiftRequest(
        int gearShiftRequest,
        MotorcycleClutchMode clutchMode,
        double coupledRpm)
    {
        if (gearShiftRequest > 0)
        {
            if (_gear < YzfR1Definition.GearCount)
                _gear++;
            _autoShiftInhibitSeconds = AutoShiftManualHoldSeconds;
            return;
        }
        if (gearShiftRequest < 0)
        {
            TryDownshiftWithOverRevProtection(coupledRpm);
            _autoShiftInhibitSeconds = AutoShiftManualHoldSeconds;
            return;
        }
        if (clutchMode != MotorcycleClutchMode.Auto || _autoShiftInhibitSeconds > 0.0)
            return;
        if (_gear < YzfR1Definition.GearCount
            && coupledRpm >= YzfR1Definition.AutoUpshiftRpm)
            _gear++;
        else if (_gear > 1 && coupledRpm <= YzfR1Definition.AutoDownshiftRpm)
            TryDownshiftWithOverRevProtection(coupledRpm);
    }

    void TryDownshiftWithOverRevProtection(double coupledRpm)
    {
        if (_gear <= 1)
            return;
        double projectedRpm = coupledRpm
            * YzfR1Definition.TotalRatio(_gear - 1) / YzfR1Definition.TotalRatio(_gear);
        if (projectedRpm > YzfR1Definition.RedlineRpm)
            return;
        _gear--;
    }

    static double ResolveClutchEngagement(
        MotorcycleClutchMode mode,
        double manualClutch,
        double absoluteSpeedMps,
        double throttle)
    {
        if (mode == MotorcycleClutchMode.Manual)
            return manualClutch;

        if (absoluteSpeedMps <= 0.05 && throttle <= 0.05)
            return 1.0;

        if (absoluteSpeedMps >= AutoLaunchFullEngagementSpeedMps)
            return 1.0;

        double launchFraction = absoluteSpeedMps / AutoLaunchFullEngagementSpeedMps;
        return 0.35 + 0.65 * launchFraction;
    }

    static TireForceSummary ResolveTireForces(
        double grossMassKg,
        double frontNormalForceN,
        double rearNormalForceN,
        double surfaceGrip,
        double requestedDriveForceN,
        double requestedFrontBrakeForceN,
        double requestedRearBrakeForceN,
        double speedMps,
        double desiredLateralForceN)
    {
        double referenceNormalForceN = grossMassKg * StandardGravityMps2 * 0.5;
        double frontForceLimitN = TireForceLimit(
            frontNormalForceN, referenceNormalForceN, surfaceGrip);
        double rearForceLimitN = TireForceLimit(
            rearNormalForceN, referenceNormalForceN, surfaceGrip);
        double brakeDirection = Math.Abs(speedMps) > 1e-6 ? Math.Sign(speedMps) : 0.0;
        double frontLongitudinalForceN = Math.Clamp(
            -brakeDirection * requestedFrontBrakeForceN,
            -frontForceLimitN,
            frontForceLimitN);
        double rearLongitudinalForceN = Math.Clamp(
            requestedDriveForceN - brakeDirection * requestedRearBrakeForceN,
            -rearForceLimitN,
            rearForceLimitN);
        double frontAvailableLateralForceN = Math.Sqrt(Math.Max(
            0.0,
            frontForceLimitN * frontForceLimitN
                - frontLongitudinalForceN * frontLongitudinalForceN));
        double rearAvailableLateralForceN = Math.Sqrt(Math.Max(
            0.0,
            rearForceLimitN * rearForceLimitN
                - rearLongitudinalForceN * rearLongitudinalForceN));
        double availableLateralForceN = frontAvailableLateralForceN + rearAvailableLateralForceN;
        double lateralForceN = Math.Clamp(
            desiredLateralForceN,
            -availableLateralForceN,
            availableLateralForceN);
        double frontLateralShare = availableLateralForceN > 1e-9
            ? frontAvailableLateralForceN / availableLateralForceN
            : 0.5;
        double frontLateralForceN = lateralForceN * frontLateralShare;
        double rearLateralForceN = lateralForceN - frontLateralForceN;
        double frontResultantN = Math.Sqrt(
            frontLongitudinalForceN * frontLongitudinalForceN
            + frontLateralForceN * frontLateralForceN);
        double rearResultantN = Math.Sqrt(
            rearLongitudinalForceN * rearLongitudinalForceN
            + rearLateralForceN * rearLateralForceN);
        return new TireForceSummary(
            frontLongitudinalForceN + rearLongitudinalForceN,
            lateralForceN,
            availableLateralForceN,
            Math.Abs(desiredLateralForceN) > availableLateralForceN + 1e-9,
            frontLongitudinalForceN,
            rearLongitudinalForceN,
            frontLateralForceN,
            rearLateralForceN,
            frontForceLimitN > 1e-9
                ? Math.Clamp(frontResultantN / frontForceLimitN, 0.0, 1.0)
                : 0.0,
            rearForceLimitN > 1e-9
                ? Math.Clamp(rearResultantN / rearForceLimitN, 0.0, 1.0)
                : 0.0);
    }

    static double TireForceLimit(
        double normalForceN,
        double referenceNormalForceN,
        double surfaceGrip) =>
        YzfR1Definition.TirePeakFrictionCoefficient
        * surfaceGrip
        * Math.Pow(Math.Max(0.0, normalForceN), YzfR1Definition.TireLoadSensitivity)
        * Math.Pow(referenceNormalForceN, 1.0 - YzfR1Definition.TireLoadSensitivity);

    static double CgFromRearAxle(double grossMassKg, double riderForeAft)
    {
        double riderMassKg = Math.Clamp(
            grossMassKg - YzfR1Definition.CurbMassKg,
            0.0,
            YzfR1Definition.RiderMassKg);
        double riderForeAftCgM = riderMassKg / grossMassKg
            * YzfR1Definition.RiderCgForeAftRangeM * riderForeAft;
        return Math.Clamp(
            YzfR1Definition.WheelbaseM * StaticFrontLoadFraction + riderForeAftCgM,
            0.0,
            YzfR1Definition.WheelbaseM);
    }

    static (double FrontNormalForceN, double RearNormalForceN) CalculateNormalLoadTargets(
        double grossMassKg,
        double longitudinalAccelerationMps2,
        double riderForeAft)
    {
        double totalNormalForceN = grossMassKg * StandardGravityMps2;
        double cgFromRearAxleM = CgFromRearAxle(grossMassKg, riderForeAft);
        double staticFrontNormalForceN = totalNormalForceN * cgFromRearAxleM
            / YzfR1Definition.WheelbaseM;
        double accelerationTransferN = grossMassKg * longitudinalAccelerationMps2
            * YzfR1Definition.CombinedCgHeightM / YzfR1Definition.WheelbaseM;
        double frontNormalForceN = Math.Clamp(
            staticFrontNormalForceN - accelerationTransferN,
            0.0,
            totalNormalForceN);
        return (frontNormalForceN, totalNormalForceN - frontNormalForceN);
    }

    /// <summary>
    /// Grounded pitch is suspension geometry; a lifted wheel turns pitch into a rigid-body
    /// rotation about the remaining contact patch. Returns the crash flag when the rotation
    /// passes the static balance angle plus the margin (loop-over nose-up, endo nose-down).
    /// The lifted branches hold the contact wheel at full weight and neglect vertical CoG
    /// acceleration — a labelled low-order simplification.
    /// </summary>
    (double PitchRad, double PitchRateRadPerSec, bool Crash) AdvancePitchAndWheelLift(
        double grossMassKg,
        double frontNormalForceN,
        double rearNormalForceN,
        double longitudinalAccelerationMps2,
        double cgFromRearAxleM,
        double dt)
    {
        double cgHeightM = YzfR1Definition.CombinedCgHeightM;
        double rearArmM = cgFromRearAxleM;
        double frontArmM = YzfR1Definition.WheelbaseM - cgFromRearAxleM;
        switch (_liftState)
        {
            case WheelLiftState.FrontLifted:
            {
                double cos = Math.Cos(_pitchRad);
                double sin = Math.Sin(_pitchRad);
                double accelerationArmM = cgHeightM * cos + rearArmM * sin;
                double gravityArmM = rearArmM * cos - cgHeightM * sin;
                double pivotInertiaKgM2 = YzfR1Definition.PitchInertiaKgM2
                    + grossMassKg * (rearArmM * rearArmM + cgHeightM * cgHeightM);
                double momentNm = grossMassKg
                    * (longitudinalAccelerationMps2 * accelerationArmM
                        - StandardGravityMps2 * gravityArmM)
                    - PitchLiftDampingNmPerRadPerSec * _pitchRateRadPerSec;
                double rate = _pitchRateRadPerSec + momentNm / pivotInertiaKgM2 * dt;
                double pitch = _pitchRad + rate * dt;
                if (pitch > Math.Atan2(rearArmM, cgHeightM) + LoopOverMarginRad)
                    return (pitch, rate, true);
                if (pitch <= 0.0)
                {
                    TouchDownFront();
                    return (0.0, Math.Min(0.0, rate) * TouchdownRateRetention, false);
                }
                return (pitch, rate, false);
            }
            case WheelLiftState.RearLifted:
            {
                double noseDownRad = -_pitchRad;
                double cos = Math.Cos(noseDownRad);
                double sin = Math.Sin(noseDownRad);
                double accelerationArmM = cgHeightM * cos + frontArmM * sin;
                double gravityArmM = frontArmM * cos - cgHeightM * sin;
                double pivotInertiaKgM2 = YzfR1Definition.PitchInertiaKgM2
                    + grossMassKg * (frontArmM * frontArmM + cgHeightM * cgHeightM);
                double momentNm = grossMassKg
                    * (-longitudinalAccelerationMps2 * accelerationArmM
                        - StandardGravityMps2 * gravityArmM)
                    - PitchLiftDampingNmPerRadPerSec * (-_pitchRateRadPerSec);
                double noseDownRate = -_pitchRateRadPerSec + momentNm / pivotInertiaKgM2 * dt;
                double noseDown = noseDownRad + noseDownRate * dt;
                if (noseDown > Math.Atan2(frontArmM, cgHeightM) + LoopOverMarginRad)
                    return (-noseDown, -noseDownRate, true);
                if (noseDown <= 0.0)
                {
                    TouchDownRear();
                    return (0.0, Math.Max(0.0, -noseDownRate) * TouchdownRateRetention, false);
                }
                return (-noseDown, -noseDownRate, false);
            }
            default:
            {
                double groundedPitchRad = Math.Atan(
                    ((_rearSuspensionCompressionM - _rearStaticCompressionM)
                        - (_frontSuspensionCompressionM - _frontStaticCompressionM))
                    / YzfR1Definition.WheelbaseM);
                double rate = (groundedPitchRad - _pitchRad) / dt;
                if (frontNormalForceN <= LiftNormalEpsilonN
                    && longitudinalAccelerationMps2 * cgHeightM
                        > StandardGravityMps2 * rearArmM)
                    _liftState = WheelLiftState.FrontLifted;
                else if (rearNormalForceN <= LiftNormalEpsilonN
                    && -longitudinalAccelerationMps2 * cgHeightM
                        > StandardGravityMps2 * frontArmM)
                    _liftState = WheelLiftState.RearLifted;
                return (groundedPitchRad, rate, false);
            }
        }
    }

    void TouchDownFront()
    {
        _liftState = WheelLiftState.Grounded;
        _frontSuspensionCompressionM = _frontStaticCompressionM;
        _frontSuspensionVelocityMps = 0.0;
    }

    void TouchDownRear()
    {
        _liftState = WheelLiftState.Grounded;
        _rearSuspensionCompressionM = _rearStaticCompressionM;
        _rearSuspensionVelocityMps = 0.0;
    }

    static double CompressionForNormalForce(
        double normalForceN,
        double springRateNPerM,
        double travelM) =>
        Math.Clamp(normalForceN / springRateNPerM, 0.0, travelM);

    static double AdvanceSuspension(
        ref double compressionM,
        ref double velocityMps,
        double targetNormalForceN,
        double supportedMassKg,
        double springRateNPerM,
        double damperCoefficientNPerMps,
        double travelM,
        double dt)
    {
        double suspensionForceN = springRateNPerM * compressionM
            + damperCoefficientNPerMps * velocityMps;
        double accelerationMps2 = (targetNormalForceN - suspensionForceN) / supportedMassKg;
        velocityMps += accelerationMps2 * dt;
        compressionM += velocityMps * dt;
        if (compressionM <= 0.0)
        {
            compressionM = 0.0;
            velocityMps = Math.Max(0.0, velocityMps);
        }
        else if (compressionM >= travelM)
        {
            compressionM = travelM;
            velocityMps = Math.Min(0.0, velocityMps);
        }
        return Math.Max(
            0.0,
            springRateNPerM * compressionM + damperCoefficientNPerMps * velocityMps);
    }

    readonly record struct TireForceSummary(
        double LongitudinalForceN,
        double LateralForceN,
        double AvailableLateralForceN,
        bool IsSliding,
        double FrontLongitudinalForceN,
        double RearLongitudinalForceN,
        double FrontLateralForceN,
        double RearLateralForceN,
        double FrontGripUse,
        double RearGripUse);

    VehicleSurfaceSample ResolveSurface(in VehicleSurfaceSample requested)
    {
        if (!requested.IsKnown)
            return VehicleSurfaceSample.Horizontal(
                surfaceId: "spawn-runway",
                heightM: _spawnSurfaceHeightM,
                frictionPerSecond: RunwayFrictionPerSecond);

        if (requested.UpNormal.Normalized().Dot(WorldUp) < 1.0 - 1e-9)
            throw new ArgumentException(
                "The runway-plane YZF-R1 skeleton only accepts horizontal surfaces.",
                nameof(requested));
        return requested;
    }

    static double TorqueAt(double engineRpm)
    {
        if (engineRpm > YzfR1Definition.RedlineRpm) return 0.0;
        double peakPowerTorqueNm = YzfR1Definition.PeakCrankPowerW
            / AngularSpeedRadPerSecond(YzfR1Definition.PeakPowerRpm);
        if (engineRpm <= YzfR1Definition.PeakTorqueRpm)
        {
            double rise = Math.Clamp(
                engineRpm / YzfR1Definition.PeakTorqueRpm,
                0.0,
                1.0);
            return YzfR1Definition.PeakTorqueNm * (0.50 + 0.50 * rise);
        }
        if (engineRpm <= YzfR1Definition.PeakPowerRpm)
        {
            double fraction = (engineRpm - YzfR1Definition.PeakTorqueRpm)
                / (YzfR1Definition.PeakPowerRpm - YzfR1Definition.PeakTorqueRpm);
            return YzfR1Definition.PeakTorqueNm
                + (peakPowerTorqueNm - YzfR1Definition.PeakTorqueNm) * fraction;
        }
        return YzfR1Definition.PeakCrankPowerW
            / AngularSpeedRadPerSecond(engineRpm);
    }

    static double AngularSpeedRadPerSecond(double rpm) =>
        Math.Max(1.0, rpm) * 2.0 * Math.PI / 60.0;

    PlayerVehicleObservation CreateObservation(
        long tick,
        in Vec3D position,
        in Vec3D groundVelocity,
        in Vec3D windVelocity,
        double grossMassKg,
        in VehicleContactState contact,
        in VehicleProtectionInterventionEvidence intervention,
        double rollRad,
        double yawRad,
        bool flyable = true,
        double pitchRad = 0.0)
    {
        Vec3D airVelocity = groundVelocity - windVelocity;
        return new PlayerVehicleObservation(
            PlayerVehicleContract.SchemaVersion,
            tick,
            _vehicleId,
            position,
            groundVelocity,
            airVelocity,
            windVelocity,
            groundVelocity.Length,
            airVelocity.Length,
            groundVelocity.Y,
            PitchRad: pitchRad,
            RollRad: rollRad,
            YawRad: yawRad,
            grossMassKg,
            VehiclePowerObservation.NotAssessed,
            contact,
            intervention,
            Flyable: flyable);
    }

    static Vec3D Forward(double headingRad) =>
        new(Math.Sin(headingRad), 0.0, Math.Cos(headingRad));

    static QuaternionD LeaningAttitude(double yawRad, double leanRad)
    {
        Vec3D forward = Forward(yawRad);
        Vec3D levelRight = WorldUp.Cross(forward).Normalized();
        double cosine = Math.Cos(leanRad);
        double sine = Math.Sin(leanRad);
        Vec3D right = levelRight * cosine + WorldUp * sine;
        Vec3D up = WorldUp * cosine - levelRight * sine;
        return QuaternionD.FromFrame(right, up, forward);
    }

    static void ValidateMass(double recurringBaseMassKg, double additivePayloadMassKg)
    {
        PlayerVehicleValidation.Positive(recurringBaseMassKg, nameof(recurringBaseMassKg));
        PlayerVehicleValidation.NonNegative(additivePayloadMassKg, nameof(additivePayloadMassKg));
        if (additivePayloadMassKg > 0.0
            || recurringBaseMassKg > YzfR1Definition.CombinedMassKg)
            throw new ArgumentOutOfRangeException(
                nameof(additivePayloadMassKg),
                "The runway-plane YZF-R1 skeleton has no additive payload model.");
        if (recurringBaseMassKg < YzfR1Definition.CurbMassKg)
            throw new ArgumentOutOfRangeException(
                nameof(recurringBaseMassKg),
                "Recurring mass cannot be below the sourced curb mass.");
    }

    static void ValidateCommand(in MotorcyclePilotCommand command)
    {
        Unit(command.Throttle, nameof(command.Throttle), 0.0);
        Unit(command.Brake, nameof(command.Brake), 0.0);
        Unit(command.Steer, nameof(command.Steer), -1.0);
        Unit(command.RiderLateral, nameof(command.RiderLateral), -1.0);
        Unit(command.RiderForeAft, nameof(command.RiderForeAft), -1.0);
        Unit(command.Clutch, nameof(command.Clutch), 0.0);
        if (command.GearShiftRequest is < -1 or > 1)
            throw new ArgumentOutOfRangeException(nameof(command.GearShiftRequest));
        if (!Enum.IsDefined(command.ClutchMode))
            throw new ArgumentOutOfRangeException(nameof(command.ClutchMode));
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
            || !double.IsFinite(Telemetry.SpeedMps)
            || !double.IsFinite(Telemetry.Rpm)
            || !double.IsFinite(Telemetry.LeanRad)
            || !double.IsFinite(Telemetry.FrontNormalForceN)
            || !double.IsFinite(Telemetry.RearNormalForceN)
            || !double.IsFinite(Telemetry.LongitudinalForceN)
            || !double.IsFinite(Telemetry.LateralForceN)
            || !double.IsFinite(Telemetry.AvailableLateralForceN)
            || !double.IsFinite(Telemetry.WheelieBalance)
            || !double.IsFinite(Telemetry.StoppieBalance)
            || !double.IsFinite(Telemetry.PitchReflexAuthority)
            || !double.IsFinite(Telemetry.KneeProximity)
            || !double.IsFinite(Telemetry.LeanHoldAuthority)
            || !double.IsFinite(Telemetry.PitchRad)
            || !Telemetry.ViewAttitude.IsFinite)
            throw new InvalidOperationException("YZF-R1 dynamics produced a non-finite outcome.");
    }
}
