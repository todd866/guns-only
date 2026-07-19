namespace GunsOnly.Sim;

/// <summary>
/// Pilot-selectable landing-gear positions. The handle is a command, not an assertion about where
/// any of the three legs actually are.
/// </summary>
public enum LandingGearHandle { Up, Down }

/// <summary>
/// The F-86 flap lever is a three-position motor command. HOLD removes motor power and the actuator
/// brakes retain the achieved position; it is not a discrete flap detent.
/// </summary>
public enum WingFlapLever { Up, Hold, Down }

/// <summary>
/// What one electrically powered cockpit gear indicator shows. Striped covers both physical transit
/// or an unsafe lock and an unpowered indicator, just as the real diagonal red/yellow display did.
/// </summary>
public enum LandingGearIndication { UpLocked, Striped, DownLocked }

/// <summary>
/// Deterministic failure injection points. Scenarios own when and why a failure occurs; the systems
/// model owns its symptoms, dependencies, pilot actions, and aerodynamic consequences.
/// </summary>
public enum AirframeSystemFailure {
    Generator,
    PrimaryBus,
    UtilityHydraulicPump,
    UtilityHydraulicLeak,
    GearSelectorCircuit,
    GearDoorActuator,
    NoseGearActuator,
    LeftMainGearActuator,
    RightMainGearActuator,
    NoseGearUplock,
    LeftMainGearUplock,
    RightMainGearUplock,
    NoseGearDownlock,
    LeftMainGearDownlock,
    RightMainGearDownlock,
    GearWarningCircuit,
    LeftFlapMotor,
    RightFlapMotor,
    LeftFlapCircuit,
    RightFlapCircuit,
    FlapMechanicalInterconnect
}

/// <summary>Inputs supplied by the airframe/mission at the beginning of a fixed systems tick.</summary>
public readonly record struct AirframeSystemsInput(
    double EngineRpmPercent,
    double IndicatedAirspeedKnots,
    bool WeightOnWheels);

/// <summary>
/// Configuration increments consumed by the flight model. Keeping this unit-explicit seam lets a
/// future damage model add torn doors, split flaps, hung stores, icing, or battle damage without
/// hiding those decisions inside the clean-airframe polar.
/// </summary>
public readonly record struct AirframeAerodynamicState(
    double LiftCoefficientIncrement,
    double DragCoefficientIncrement,
    double PitchMomentCoefficientIncrement,
    double LateralLiftCoefficientDifference) {
    public static AirframeAerodynamicState Clean => new(0.0, 0.0, 0.0, 0.0);
}

/// <summary>
/// Tunable, airframe-specific systems constants. The first profile is an F-86F research basis, not
/// a claim that the land-based F-86F was carrier qualified; a naval Fury profile belongs alongside
/// it when its primary flight manual is available.
/// </summary>
public sealed record AirframeSystemsProfile(
    string Id,
    double GearExtensionSeconds,
    double GearRetractionSeconds,
    double EmergencyGearExtensionSeconds,
    double GearDoorTravelSeconds,
    double GearAndFlapLimitKias,
    double EmergencyGearExtensionMaxKias,
    double FullFlapDegrees,
    double FullFlapTravelSeconds,
    double GeneratorCutInRpmPercent,
    double GearHornRpmPercent,
    double UtilityHydraulicNominalPsi,
    double FullGearDragCoefficientIncrement,
    double FullFlapLiftCoefficientIncrement,
    double FullFlapDragCoefficientIncrement) {

    /// <summary>
    /// T.O. 1F-86F-1 basis. Gear times, limits, dependencies, warning logic, flap architecture, and
    /// 38-degree geometry are source-backed. The manual supplies no flap travel time; eight seconds
    /// is deliberately isolated here as a phenomenological calibration value.
    /// </summary>
    public static readonly AirframeSystemsProfile F86FResearchBasis = new(
        Id: "f86f-research-basis-v1",
        GearExtensionSeconds: 10.0,
        GearRetractionSeconds: 8.0,
        EmergencyGearExtensionSeconds: 11.0,
        GearDoorTravelSeconds: 1.25,
        GearAndFlapLimitKias: 185.0,
        EmergencyGearExtensionMaxKias: 175.0,
        FullFlapDegrees: 38.0,
        FullFlapTravelSeconds: 8.0,
        GeneratorCutInRpmPercent: 45.0,
        GearHornRpmPercent: 73.0,
        UtilityHydraulicNominalPsi: 3000.0,
        // At the manual's 10,000-ft best-glide condition, gear lowers L/D from 14:1 to 7.3:1.
        // Delta-CD ~= CL * (1/7.3 - 1/14) at the Sabre polar's best-L/D CL (~0.61).
        FullGearDragCoefficientIncrement: 0.040,
        // NACA F-86 data gives CLmax about 1.40 with the standard 38-degree slotted flap versus
        // the clean simulation's 1.10. Drag remains an isolated calibration value pending a full
        // configuration polar rather than being disguised as clean-airframe CD0.
        FullFlapLiftCoefficientIncrement: 0.30,
        FullFlapDragCoefficientIncrement: 0.085);
}

/// <summary>
/// Early-jet airframe systems with real command/actual separation and failure dependencies.
/// No randomness lives here: repeatable training scenarios inject faults explicitly and can judge
/// diagnosis and procedure from the resulting state history.
/// </summary>
public sealed class AirframeSystems {
    const double PositionTolerance = 1e-4;
    readonly HashSet<AirframeSystemFailure> _failures = new();
    readonly AirframeSystemsProfile _profile;
    bool _gearHornSilenced;
    bool _emergencyAccumulatorUsed;
    bool _emergencyNoseGearLatched;

    public AirframeSystemsProfile Profile => _profile;
    public IReadOnlySet<AirframeSystemFailure> Failures => _failures;

    public LandingGearHandle GearHandle { get; private set; }
    public WingFlapLever FlapLever { get; private set; } = WingFlapLever.Hold;
    public bool BatterySwitchOn { get; private set; } = true;
    public bool EmergencyGearReleaseHeld { get; private set; }

    public double NoseGearPosition { get; private set; }
    public double LeftMainGearPosition { get; private set; }
    public double RightMainGearPosition { get; private set; }
    /// <summary>Zero is closed, one fully open. This is an aggregate until per-door geometry lands.</summary>
    public double GearDoorPosition { get; private set; }
    public double LeftFlapDegrees { get; private set; }
    public double RightFlapDegrees { get; private set; }

    public bool GeneratorOnline { get; private set; }
    public bool PrimaryBusPowered { get; private set; }
    public double UtilityHydraulicPressureFraction { get; private set; }
    public double UtilityHydraulicPressurePsi =>
        UtilityHydraulicPressureFraction * _profile.UtilityHydraulicNominalPsi;
    public bool WeightOnWheels { get; private set; }
    public double EngineRpmPercent { get; private set; }
    public double IndicatedAirspeedKnots { get; private set; }

    public LandingGearIndication NoseGearIndication => GearIndication(
        NoseGearPosition, AirframeSystemFailure.NoseGearUplock,
        AirframeSystemFailure.NoseGearDownlock);
    public LandingGearIndication LeftMainGearIndication => GearIndication(
        LeftMainGearPosition, AirframeSystemFailure.LeftMainGearUplock,
        AirframeSystemFailure.LeftMainGearDownlock);
    public LandingGearIndication RightMainGearIndication => GearIndication(
        RightMainGearPosition, AirframeSystemFailure.RightMainGearUplock,
        AirframeSystemFailure.RightMainGearDownlock);

    public bool AllGearDownAndLocked =>
        IsDownLocked(NoseGearPosition, AirframeSystemFailure.NoseGearDownlock)
        && IsDownLocked(LeftMainGearPosition, AirframeSystemFailure.LeftMainGearDownlock)
        && IsDownLocked(RightMainGearPosition, AirframeSystemFailure.RightMainGearDownlock);
    public bool AllGearUpAndLocked =>
        IsUpLocked(NoseGearPosition, AirframeSystemFailure.NoseGearUplock)
        && IsUpLocked(LeftMainGearPosition, AirframeSystemFailure.LeftMainGearUplock)
        && IsUpLocked(RightMainGearPosition, AirframeSystemFailure.RightMainGearUplock);
    public bool AnyGearUnsafe => !AllGearDownAndLocked && !AllGearUpAndLocked;
    public bool GroundRetractionInterlockActive =>
        WeightOnWheels && GearHandle == LandingGearHandle.Up;
    public bool EmergencyExtensionAirloadBlocked => EmergencyGearReleaseHeld
        && IndicatedAirspeedKnots > _profile.EmergencyGearExtensionMaxKias
        && !AllGearDownAndLocked;
    public bool EmergencyAccumulatorAvailable => !_emergencyAccumulatorUsed;
    public bool EmergencyNoseGearLatched => _emergencyNoseGearLatched;

    public bool GearUnsafeLight { get; private set; }
    public bool GearWarningHorn { get; private set; }
    public bool GearLimitExceeded => IndicatedAirspeedKnots > _profile.GearAndFlapLimitKias
        && (!AllGearUpAndLocked || GearDoorPosition > PositionTolerance);
    public bool FlapLimitExceeded => IndicatedAirspeedKnots > _profile.GearAndFlapLimitKias
        && Math.Max(LeftFlapDegrees, RightFlapDegrees) > 0.25;
    public bool FlapSplit => Math.Abs(LeftFlapDegrees - RightFlapDegrees) > 1.0;
    public double FlapSplitDegrees => LeftFlapDegrees - RightFlapDegrees;
    public double EffectiveFlapFraction => Math.Clamp(
        (LeftFlapDegrees + RightFlapDegrees) / (2.0 * _profile.FullFlapDegrees), 0.0, 1.0);
    public double EffectiveGearFraction => Math.Clamp(
        (NoseGearPosition + LeftMainGearPosition + RightMainGearPosition) / 3.0, 0.0, 1.0);
    public double GearOverspeedExposureSeconds { get; private set; }
    public double FlapOverspeedExposureSeconds { get; private set; }

    public AirframeAerodynamicState AerodynamicState {
        get {
            double gear = EffectiveGearFraction;
            double flap = EffectiveFlapFraction;
            double split = FlapSplitDegrees / Math.Max(_profile.FullFlapDegrees, 1e-9);
            return new AirframeAerodynamicState(
                LiftCoefficientIncrement: _profile.FullFlapLiftCoefficientIncrement * flap,
                DragCoefficientIncrement:
                    _profile.FullGearDragCoefficientIncrement * gear
                    + _profile.FullFlapDragCoefficientIncrement * flap * flap
                    + 0.020 * Math.Abs(split),
                // The seam is live now; a sourced F-86/Fury configuration moment surface can be
                // inserted later without changing the state machine or flight-model contract.
                PitchMomentCoefficientIncrement: 0.0,
                LateralLiftCoefficientDifference:
                    _profile.FullFlapLiftCoefficientIncrement * split);
        }
    }

    public AirframeSystems(
        AirframeSystemsProfile? profile = null,
        LandingGearHandle initialGear = LandingGearHandle.Up,
        double initialFlapDegrees = 0.0) {
        _profile = profile ?? AirframeSystemsProfile.F86FResearchBasis;
        if (!double.IsFinite(initialFlapDegrees)
            || initialFlapDegrees < 0.0
            || initialFlapDegrees > _profile.FullFlapDegrees)
            throw new ArgumentOutOfRangeException(nameof(initialFlapDegrees));

        GearHandle = initialGear;
        double gear = initialGear == LandingGearHandle.Down ? 1.0 : 0.0;
        NoseGearPosition = LeftMainGearPosition = RightMainGearPosition = gear;
        LeftFlapDegrees = RightFlapDegrees = initialFlapDegrees;
    }

    public void CommandGear(LandingGearHandle handle) => GearHandle = handle;
    public void SetFlapLever(WingFlapLever lever) => FlapLever = lever;
    public void SetBatterySwitch(bool on) => BatterySwitchOn = on;
    public void SetEmergencyGearRelease(bool held) => EmergencyGearReleaseHeld = held;

    public void SetFailure(AirframeSystemFailure failure, bool active = true) {
        if (active) _failures.Add(failure);
        else _failures.Remove(failure);
    }

    public bool HasFailure(AirframeSystemFailure failure) => _failures.Contains(failure);

    /// <summary>The horn cut-out latches only until power is advanced above its reset range.</summary>
    public void SilenceGearWarningHorn() => _gearHornSilenced = true;

    /// <summary>
    /// Ground-maintenance action after emergency nose extension. It is intentionally unavailable in
    /// flight, where the Dash-1 says the emergency-lowered nose gear cannot be retracted.
    /// </summary>
    public bool ResetEmergencyGearExtensionOnGround() {
        if (!WeightOnWheels) return false;
        _emergencyAccumulatorUsed = false;
        _emergencyNoseGearLatched = false;
        return true;
    }

    public void Step(double dtSeconds, in AirframeSystemsInput input) {
        if (!double.IsFinite(dtSeconds) || dtSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(dtSeconds));
        if (!double.IsFinite(input.EngineRpmPercent)
            || !double.IsFinite(input.IndicatedAirspeedKnots)
            || input.EngineRpmPercent < 0.0
            || input.IndicatedAirspeedKnots < 0.0)
            throw new ArgumentOutOfRangeException(nameof(input));

        EngineRpmPercent = input.EngineRpmPercent;
        IndicatedAirspeedKnots = input.IndicatedAirspeedKnots;
        WeightOnWheels = input.WeightOnWheels;

        StepPowerAndHydraulics(dtSeconds);
        StepGear(dtSeconds);
        StepFlaps(dtSeconds);
        StepWarnings(dtSeconds);
    }

    void StepPowerAndHydraulics(double dt) {
        GeneratorOnline = !HasFailure(AirframeSystemFailure.Generator)
            && EngineRpmPercent >= _profile.GeneratorCutInRpmPercent;
        PrimaryBusPowered = !HasFailure(AirframeSystemFailure.PrimaryBus)
            && (GeneratorOnline || BatterySwitchOn);

        double targetPressure = 0.0;
        if (!HasFailure(AirframeSystemFailure.UtilityHydraulicPump)) {
            // An engine-driven variable-volume pump supplies useful pressure at idle and reaches
            // nominal authority by roughly generator cut-in. Exact transient pump maps remain a
            // profile concern rather than a binary "hydraulics available" switch.
            targetPressure = Math.Clamp((EngineRpmPercent - 20.0)
                / Math.Max(_profile.GeneratorCutInRpmPercent - 20.0, 1.0), 0.0, 1.0);
        }
        if (HasFailure(AirframeSystemFailure.UtilityHydraulicLeak)) targetPressure *= 0.05;
        double tau = targetPressure > UtilityHydraulicPressureFraction ? 0.45 : 0.85;
        if (dt > 0.0)
            UtilityHydraulicPressureFraction += (targetPressure - UtilityHydraulicPressureFraction)
                * (1.0 - Math.Exp(-dt / tau));
    }

    void StepGear(double dt) {
        bool normalCommandPowered = PrimaryBusPowered
            && !HasFailure(AirframeSystemFailure.GearSelectorCircuit);
        bool normalRetractionBlocked = WeightOnWheels && GearHandle == LandingGearHandle.Up;
        bool normalMotion = normalCommandPowered
            && UtilityHydraulicPressureFraction > 0.10
            && !normalRetractionBlocked;

        bool wantsNormalMovement = GearHandle == LandingGearHandle.Down
            ? !AllGearDownAndLocked
            : !AllGearUpAndLocked;
        bool groundDoorWarning = normalCommandPowered && normalRetractionBlocked;
        bool emergencyCanOpen = EmergencyGearReleaseHeld
            && IndicatedAirspeedKnots <= _profile.EmergencyGearExtensionMaxKias;
        bool doorsShouldOpen = groundDoorWarning
            || (normalMotion && wantsNormalMovement)
            || emergencyCanOpen;

        if (!HasFailure(AirframeSystemFailure.GearDoorActuator)) {
            double doorAuthority = emergencyCanOpen
                ? 1.0
                : UtilityHydraulicPressureFraction;
            GearDoorPosition = MoveToward(GearDoorPosition, doorsShouldOpen ? 1.0 : 0.0,
                dt * doorAuthority / Math.Max(_profile.GearDoorTravelSeconds, 0.1));
        }

        bool doorsOpenEnough = GearDoorPosition >= 0.90;
        if (normalMotion && doorsOpenEnough) {
            double target = GearHandle == LandingGearHandle.Down ? 1.0 : 0.0;
            double totalTime = target > 0.5
                ? _profile.GearExtensionSeconds
                : _profile.GearRetractionSeconds;
            double legTravelSeconds = Math.Max(0.5,
                totalTime - _profile.GearDoorTravelSeconds);
            double step = dt * UtilityHydraulicPressureFraction / legTravelSeconds;
            MoveNormalGear(target, step);
        }

        if (emergencyCanOpen && doorsOpenEnough) {
            // The main gear free-falls after mechanical uplock release. The nose gear is driven by
            // a one-shot accumulator if utility pressure is absent; with pressure available the
            // mechanically positioned selector valves provide the same requested extension.
            double step = dt / Math.Max(_profile.EmergencyGearExtensionSeconds, 0.1);
            LeftMainGearPosition = MoveUnlessFailed(LeftMainGearPosition, 1.0, step,
                AirframeSystemFailure.LeftMainGearActuator);
            RightMainGearPosition = MoveUnlessFailed(RightMainGearPosition, 1.0, step,
                AirframeSystemFailure.RightMainGearActuator);
            if (!_emergencyAccumulatorUsed || UtilityHydraulicPressureFraction > 0.10) {
                double previous = NoseGearPosition;
                NoseGearPosition = MoveUnlessFailed(NoseGearPosition, 1.0, step,
                    AirframeSystemFailure.NoseGearActuator);
                if (NoseGearPosition > previous + PositionTolerance) {
                    _emergencyAccumulatorUsed = true;
                    _emergencyNoseGearLatched = true;
                }
            }
        }

        if (_emergencyNoseGearLatched)
            NoseGearPosition = Math.Max(NoseGearPosition, 1.0 - PositionTolerance);
    }

    void MoveNormalGear(double target, double step) {
        NoseGearPosition = MoveUnlessFailed(NoseGearPosition, target, step,
            AirframeSystemFailure.NoseGearActuator);
        LeftMainGearPosition = MoveUnlessFailed(LeftMainGearPosition, target, step,
            AirframeSystemFailure.LeftMainGearActuator);
        RightMainGearPosition = MoveUnlessFailed(RightMainGearPosition, target, step,
            AirframeSystemFailure.RightMainGearActuator);
    }

    void StepFlaps(double dt) {
        if (!PrimaryBusPowered || FlapLever == WingFlapLever.Hold || dt <= 0.0) return;
        double target = FlapLever == WingFlapLever.Down ? _profile.FullFlapDegrees : 0.0;
        bool leftPowered = !HasFailure(AirframeSystemFailure.LeftFlapMotor)
            && !HasFailure(AirframeSystemFailure.LeftFlapCircuit);
        bool rightPowered = !HasFailure(AirframeSystemFailure.RightFlapMotor)
            && !HasFailure(AirframeSystemFailure.RightFlapCircuit);
        double rate = _profile.FullFlapDegrees / Math.Max(_profile.FullFlapTravelSeconds, 0.1);

        if (!HasFailure(AirframeSystemFailure.FlapMechanicalInterconnect)) {
            int motors = (leftPowered ? 1 : 0) + (rightPowered ? 1 : 0);
            if (motors == 0) return;
            // One surviving actuator drives both flaps through the mechanical interconnect, with
            // half the nominal motor authority. The coupling also removes any existing split.
            double common = (LeftFlapDegrees + RightFlapDegrees) * 0.5;
            common = MoveToward(common, target, rate * dt * motors / 2.0);
            LeftFlapDegrees = RightFlapDegrees = common;
        } else {
            if (leftPowered) LeftFlapDegrees = MoveToward(LeftFlapDegrees, target, rate * dt);
            if (rightPowered) RightFlapDegrees = MoveToward(RightFlapDegrees, target, rate * dt);
        }
    }

    void StepWarnings(double dt) {
        bool warningPowered = PrimaryBusPowered
            && !HasFailure(AirframeSystemFailure.GearWarningCircuit);
        bool doorUnlocked = GearDoorPosition > PositionTolerance;
        bool throttleWarning = !AllGearDownAndLocked
            && EngineRpmPercent < _profile.GearHornRpmPercent;
        if (EngineRpmPercent > _profile.GearHornRpmPercent + 3.0)
            _gearHornSilenced = false;

        GearUnsafeLight = warningPowered && (AnyGearUnsafe
            || (AllGearUpAndLocked && doorUnlocked)
            || throttleWarning
            || GroundRetractionInterlockActive);
        GearWarningHorn = warningPowered && throttleWarning && !_gearHornSilenced;

        if (GearLimitExceeded) GearOverspeedExposureSeconds += dt;
        if (FlapLimitExceeded) FlapOverspeedExposureSeconds += dt;
    }

    LandingGearIndication GearIndication(double position,
        AirframeSystemFailure uplock, AirframeSystemFailure downlock) {
        if (!PrimaryBusPowered) return LandingGearIndication.Striped;
        if (IsUpLocked(position, uplock)) return LandingGearIndication.UpLocked;
        if (IsDownLocked(position, downlock)) return LandingGearIndication.DownLocked;
        return LandingGearIndication.Striped;
    }

    bool IsUpLocked(double position, AirframeSystemFailure uplock) =>
        position <= PositionTolerance && !HasFailure(uplock);
    bool IsDownLocked(double position, AirframeSystemFailure downlock) =>
        position >= 1.0 - PositionTolerance && !HasFailure(downlock);

    double MoveUnlessFailed(double value, double target, double maxDelta,
        AirframeSystemFailure failure) => HasFailure(failure)
            ? value
            : MoveToward(value, target, maxDelta);

    static double MoveToward(double value, double target, double maxDelta) {
        if (maxDelta <= 0.0) return value;
        if (value < target) return Math.Min(target, value + maxDelta);
        if (value > target) return Math.Max(target, value - maxDelta);
        return value;
    }
}
