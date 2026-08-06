namespace GunsOnly.Sim;

/// <summary>
/// Observable truth for the selected-combat-target padlock lift-plane hold. The controller
/// contribution is kept separate from pilot aileron so telemetry, physiology, and safety
/// automation retain clear ownership of the lateral axis.
/// </summary>
public readonly record struct PadlockRollAssistState(
    bool Selected,
    bool GeometryValid,
    bool Captured,
    bool Active,
    bool AnyPlane,
    bool PreferredPlaneValid,
    double PreferredPlaneRad,
    long TargetSpawnSequence,
    double PlaneMagnitude,
    double RollErrorRad,
    double DesiredRollRateRadPerSecond,
    double MeasuredRollRateRadPerSecond,
    double EstimatedTargetPlaneRateRadPerSecond,
    double SasRollControl) {
    public static PadlockRollAssistState Inactive(
        bool selected = false,
        long targetSpawnSequence = 0) => new(
            Selected: selected,
            GeometryValid: false,
            Captured: false,
            Active: false,
            AnyPlane: false,
            PreferredPlaneValid: false,
            PreferredPlaneRad: 0.0,
            TargetSpawnSequence: targetSpawnSequence,
            PlaneMagnitude: 0.0,
            RollErrorRad: 0.0,
            DesiredRollRateRadPerSecond: 0.0,
            MeasuredRollRateRadPerSecond: 0.0,
            EstimatedTargetPlaneRateRadPerSecond: 0.0,
            SasRollControl: 0.0);
}

public readonly record struct PadlockRollAssistResult(
    PilotCommand Command,
    PadlockRollAssistState State);

public readonly record struct PadlockRollAssistEnergy(
    double TrueAirspeedMps,
    double CornerSpeedMps,
    double RadarAltitudeM,
    bool GcasWarningOrActive);

/// <summary>
/// A low-authority target-plane trim for combat padlock. The pilot must first put lift within the
/// capture gate; this law only retains that plane against residual roll and target motion. It has
/// no integrator, cannot perform the initial roll, and yields immediately to deliberate aileron.
/// </summary>
public sealed class PadlockRollAssist {
    public const double CaptureEnterRad = 11.0 * System.Math.PI / 180.0;
    public const double CaptureReleaseRad = 18.0 * System.Math.PI / 180.0;
    public const double CaptureDwellSeconds = 0.12;
    public const double SingularPlaneMagnitude = 0.035;
    public const double FullAuthorityPlaneMagnitude = 0.12;
    public const double MaximumDesiredRollRateRadPerSecond =
        24.0 * System.Math.PI / 180.0;
    public const double MaximumTargetPlaneRateRadPerSecond =
        30.0 * System.Math.PI / 180.0;
    public const double MaximumSasRollControl = 0.18;
    public const double FullPilotOverrideRollControl = 0.30;

    const double DesiredRollRateGainPerSecond = 1.5;
    // Full feed-forward on the target's own plane rate. At 0.5 the trim structurally under-matched
    // the rate it was supposed to hold, so it lagged the plane it had captured and returned little
    // for the authority it took. Matching the rate is what a good pilot's hands do; the 0.18
    // authority cap is unchanged, so this buys accuracy inside the window rather than strength
    // everywhere (which is how the law became annoying in the first place).
    const double TargetPlaneFeedForward = 1.0;
    const double RollRateErrorGainSeconds = 0.45;
    const double TargetPlaneRateFilterSeconds = 0.20;
    const double AssistSlewPerSecond = 0.90;
    const double PilotFadeStart = 0.08;

    bool _captured;
    double _captureCandidateSeconds;
    bool _hasPreviousError;
    double _previousErrorRad;
    double _estimatedTargetPlaneRateRadPerSecond;
    double _sasRollControl;
    bool _hasPreferredPlane;
    double _previousPreferredPlaneRad;
    double _preferredPlaneDwellSeconds;

    public PadlockRollAssistState State { get; private set; } =
        PadlockRollAssistState.Inactive();

    public void Reset() {
        _captured = false;
        _captureCandidateSeconds = 0.0;
        _hasPreviousError = false;
        _previousErrorRad = 0.0;
        _estimatedTargetPlaneRateRadPerSecond = 0.0;
        _sasRollControl = 0.0;
        _hasPreferredPlane = false;
        _previousPreferredPlaneRad = 0.0;
        _preferredPlaneDwellSeconds = 0.0;
        State = PadlockRollAssistState.Inactive();
    }

    public PadlockRollAssistResult Step(
        in PilotCommand command,
        in AircraftState aircraft,
        in Vec3D targetPosition,
        long targetSpawnSequence,
        bool selected,
        bool eligible,
        double rawPilotRollControl,
        double deltaSeconds,
        PadlockRollAssistEnergy? energy = null,
        double? captureRangeLimitM = null,
        PilotLateralCommitmentState? lateralCommitment = null) {
        double dt = System.Math.Clamp(
            double.IsFinite(deltaSeconds) ? deltaSeconds : 0.0, 0.0, 0.05);
        if (!selected || dt <= 0.0
            || !aircraft.BodyAttitude.IsFinite
            || aircraft.BodyAttitude.LengthSquared < 1e-12
            || !aircraft.BodyRates.IsFinite
            || !IsFinite(targetPosition)) {
            Reset();
            State = PadlockRollAssistState.Inactive(selected, targetSpawnSequence);
            return new PadlockRollAssistResult(command, State);
        }

        Vec3D displacement = targetPosition - aircraft.Position;
        if (!IsFinite(displacement) || displacement.Length < 1e-6) {
            Reset();
            State = PadlockRollAssistState.Inactive(selected, targetSpawnSequence);
            return new PadlockRollAssistResult(command, State);
        }

        Vec3D lineOfSight = displacement.Normalized();
        QuaternionD attitude = aircraft.BodyAttitude.Normalized();
        Vec3D bodyForward = attitude.Rotate(new Vec3D(0.0, 0.0, 1.0));
        Vec3D bodyUp = attitude.Rotate(new Vec3D(0.0, 1.0, 0.0));
        Vec3D bodyRight = attitude.Rotate(new Vec3D(1.0, 0.0, 0.0));
        double targetForward = lineOfSight.Dot(bodyForward);
        double targetRight = lineOfSight.Dot(bodyRight);
        double targetUp = lineOfSight.Dot(bodyUp);
        double planeMagnitude = System.Math.Sqrt(
            targetRight * targetRight + targetUp * targetUp);

        // On the longitudinal axis there is no unique target plane. Exact dead six is still a
        // valid any-plane pull presentation, but it must never create an arbitrary automatic roll.
        if (planeMagnitude < SingularPlaneMagnitude) {
            bool anyPlane = targetForward < 0.0;
            if (anyPlane && energy is { } preferredPlaneEnergy) {
                PadlockPreferredPlaneResult preferred = PadlockPreferredPlane.Select(
                    aircraft.BodyAttitude,
                    preferredPlaneEnergy.TrueAirspeedMps,
                    preferredPlaneEnergy.CornerSpeedMps,
                    preferredPlaneEnergy.RadarAltitudeM,
                    preferredPlaneEnergy.GcasWarningOrActive,
                    planeMagnitude,
                    targetForward,
                    _previousPreferredPlaneRad,
                    _hasPreferredPlane,
                    dt,
                    _preferredPlaneDwellSeconds);
                if (preferred.Valid) {
                    bool holdsPrevious = _hasPreferredPlane
                        && System.Math.Abs(WrapAngle(
                            preferred.GateRadFromLift - _previousPreferredPlaneRad))
                            <= PadlockPreferredPlane.HysteresisHoldRad
                        && _preferredPlaneDwellSeconds
                            < PadlockPreferredPlane.HysteresisSeconds;
                    double nextPreferredPlaneDwellSeconds = holdsPrevious
                        ? _preferredPlaneDwellSeconds + dt : 0.0;
                    ClearAssistLatches();
                    _hasPreferredPlane = true;
                    _previousPreferredPlaneRad = preferred.GateRadFromLift;
                    _preferredPlaneDwellSeconds = nextPreferredPlaneDwellSeconds;
                    State = new PadlockRollAssistState(
                        Selected: true,
                        GeometryValid: true,
                        Captured: false,
                        Active: false,
                        AnyPlane: false,
                        PreferredPlaneValid: true,
                        PreferredPlaneRad: preferred.GateRadFromLift,
                        TargetSpawnSequence: targetSpawnSequence,
                        PlaneMagnitude: planeMagnitude,
                        RollErrorRad: preferred.GateRadFromLift,
                        DesiredRollRateRadPerSecond: 0.0,
                        MeasuredRollRateRadPerSecond: aircraft.BodyRates.P,
                        EstimatedTargetPlaneRateRadPerSecond: 0.0,
                        SasRollControl: 0.0);
                    return new PadlockRollAssistResult(command, State);
                }

                ClearAssistLatches();
                State = new PadlockRollAssistState(
                    Selected: true,
                    GeometryValid: true,
                    Captured: false,
                    Active: false,
                    AnyPlane: true,
                    PreferredPlaneValid: false,
                    PreferredPlaneRad: 0.0,
                    TargetSpawnSequence: targetSpawnSequence,
                    PlaneMagnitude: planeMagnitude,
                    RollErrorRad: 0.0,
                    DesiredRollRateRadPerSecond: 0.0,
                    MeasuredRollRateRadPerSecond: aircraft.BodyRates.P,
                    EstimatedTargetPlaneRateRadPerSecond: 0.0,
                    SasRollControl: 0.0);
                return new PadlockRollAssistResult(command, State);
            }
            if (!eligible) {
                ClearAssistLatches();
                State = new PadlockRollAssistState(
                    Selected: true,
                    GeometryValid: anyPlane,
                    Captured: false,
                    Active: false,
                    AnyPlane: anyPlane,
                    PreferredPlaneValid: false,
                    PreferredPlaneRad: 0.0,
                    TargetSpawnSequence: targetSpawnSequence,
                    PlaneMagnitude: planeMagnitude,
                    RollErrorRad: 0.0,
                    DesiredRollRateRadPerSecond: 0.0,
                    MeasuredRollRateRadPerSecond: aircraft.BodyRates.P,
                    EstimatedTargetPlaneRateRadPerSecond: 0.0,
                    SasRollControl: 0.0);
                return new PadlockRollAssistResult(command, State);
            }

            Reset();
            State = new PadlockRollAssistState(
                Selected: true,
                GeometryValid: anyPlane,
                Captured: anyPlane,
                Active: false,
                AnyPlane: anyPlane,
                PreferredPlaneValid: false,
                PreferredPlaneRad: 0.0,
                TargetSpawnSequence: targetSpawnSequence,
                PlaneMagnitude: planeMagnitude,
                RollErrorRad: 0.0,
                DesiredRollRateRadPerSecond: 0.0,
                MeasuredRollRateRadPerSecond: aircraft.BodyRates.P,
                EstimatedTargetPlaneRateRadPerSecond: 0.0,
                SasRollControl: 0.0);
            return new PadlockRollAssistResult(command, State);
        }

        double rollError = System.Math.Atan2(
            targetRight / planeMagnitude,
            targetUp / planeMagnitude);

        if (!eligible) {
            ClearAssistLatches();
            State = new PadlockRollAssistState(
                Selected: true,
                GeometryValid: true,
                Captured: false,
                Active: false,
                AnyPlane: false,
                PreferredPlaneValid: false,
                PreferredPlaneRad: 0.0,
                TargetSpawnSequence: targetSpawnSequence,
                PlaneMagnitude: planeMagnitude,
                RollErrorRad: rollError,
                DesiredRollRateRadPerSecond: 0.0,
                MeasuredRollRateRadPerSecond: aircraft.BodyRates.P,
                EstimatedTargetPlaneRateRadPerSecond: 0.0,
                SasRollControl: 0.0);
            return new PadlockRollAssistResult(command, State);
        }
        // Owner, 2026-08-06, flying Build 264: "it tries to turn early on reversals." Capture was
        // purely geometric, and a reversal SWEEPS the target across the canopy — so the gate is
        // satisfied transiently mid-sweep and the trim takes the ailerons for the plane the pilot
        // is in the act of leaving. Commitment is intent, not geometry: through a commanded
        // reversal this law is off the axis entirely, and it cannot latch a capture to carry into
        // the far side of the roll.
        if (lateralCommitment is { Reversing: true }) {
            ClearAssistLatches();
            State = new PadlockRollAssistState(
                Selected: true,
                GeometryValid: true,
                Captured: false,
                Active: false,
                AnyPlane: false,
                PreferredPlaneValid: false,
                PreferredPlaneRad: 0.0,
                TargetSpawnSequence: targetSpawnSequence,
                PlaneMagnitude: planeMagnitude,
                RollErrorRad: rollError,
                DesiredRollRateRadPerSecond: 0.0,
                MeasuredRollRateRadPerSecond: aircraft.BodyRates.P,
                EstimatedTargetPlaneRateRadPerSecond: 0.0,
                SasRollControl: 0.0);
            return new PadlockRollAssistResult(command, State);
        }

        double absoluteError = System.Math.Abs(rollError);
        if (_captured && absoluteError > CaptureReleaseRad) {
            _captured = false;
            _captureCandidateSeconds = 0.0;
            _hasPreviousError = false;
            _estimatedTargetPlaneRateRadPerSecond = 0.0;
            _sasRollControl = 0.0;
        }

        // THIS LAW FINE-TUNES A SHOT. IT MUST NOT FLY THE MERGE.
        //
        // Capture used to be purely geometric — plane magnitude and roll error, with no notion of
        // whether a shot existed at all. Measured over a real 915 s sortie (telemetry session
        // web-1785639986509-531485, Build 238): the assist held authority for 20.7% of the entire
        // flight, at a median range of 2,232 m and out to 5,846 m, and 88% of that engagement was
        // beyond the gun's reach. It was trimming the pilot's ailerons through the whole fight,
        // which is the owner's "the roll-automation is way too aggressive... it should only really
        // kick in to help fine-tune the final shot".
        //
        // Beyond the gun's maximum reach a round cannot arrive at all, so there is by definition
        // nothing to fine-tune. The bound is the weapon's physical reach, not a taste constant.
        bool withinShot = captureRangeLimitM is not { } limitM
            || !double.IsFinite(limitM)
            || displacement.Length <= limitM;
        if (!_captured && !withinShot) _captureCandidateSeconds = 0.0;

        if (!_captured && withinShot) {
            if (planeMagnitude >= FullAuthorityPlaneMagnitude
                && absoluteError <= CaptureEnterRad) {
                _captureCandidateSeconds += dt;
                if (_captureCandidateSeconds + 1e-12 >= CaptureDwellSeconds) {
                    _captured = true;
                    _hasPreviousError = false;
                    _previousErrorRad = rollError;
                    _estimatedTargetPlaneRateRadPerSecond = 0.0;
                }
            } else {
                _captureCandidateSeconds = 0.0;
            }
        }

        double measuredRollRate = aircraft.BodyRates.P;
        double desiredRollRate = 0.0;
        double contribution = 0.0;
        double pilotMagnitude = System.Math.Abs(
            System.Math.Clamp(rawPilotRollControl, -1.0, 1.0));
        double pilotBlend = 1.0 - Smoothstep(
            PilotFadeStart, FullPilotOverrideRollControl, pilotMagnitude);
        double planeBlend = Smoothstep(
            SingularPlaneMagnitude, FullAuthorityPlaneMagnitude, planeMagnitude);

        if (_captured) {
            if (_hasPreviousError) {
                double rawTargetPlaneRate = WrapAngle(rollError - _previousErrorRad) / dt
                    + measuredRollRate;
                rawTargetPlaneRate = System.Math.Clamp(rawTargetPlaneRate,
                    -MaximumTargetPlaneRateRadPerSecond,
                    MaximumTargetPlaneRateRadPerSecond);
                double filter = 1.0 - System.Math.Exp(
                    -dt / TargetPlaneRateFilterSeconds);
                _estimatedTargetPlaneRateRadPerSecond +=
                    (rawTargetPlaneRate - _estimatedTargetPlaneRateRadPerSecond) * filter;
            }
            _hasPreviousError = true;
            _previousErrorRad = rollError;
            desiredRollRate = System.Math.Clamp(
                DesiredRollRateGainPerSecond * rollError
                    + TargetPlaneFeedForward
                        * _estimatedTargetPlaneRateRadPerSecond,
                -MaximumDesiredRollRateRadPerSecond,
                MaximumDesiredRollRateRadPerSecond);
            double requestedContribution = System.Math.Clamp(
                RollRateErrorGainSeconds * (desiredRollRate - measuredRollRate),
                -MaximumSasRollControl,
                MaximumSasRollControl) * pilotBlend * planeBlend;

            // Full deliberate aileron owns the axis immediately. Otherwise slew the augmentation
            // into and out of its small authority cap so capture is bumpless and cannot snap.
            if (pilotMagnitude >= FullPilotOverrideRollControl) {
                _sasRollControl = 0.0;
            } else {
                _sasRollControl = MoveToward(_sasRollControl, requestedContribution,
                    AssistSlewPerSecond * dt);
                // Authority must follow the pilot fade immediately, even though ordinary assist
                // acquisition/release is slew limited. Otherwise a nearly full opposite analog
                // input could inherit the previous SAS value for several ticks and briefly fight
                // the pilot before the stored contribution decayed.
                double currentAuthority = MaximumSasRollControl
                    * pilotBlend * planeBlend;
                _sasRollControl = System.Math.Clamp(_sasRollControl,
                    -currentAuthority, currentAuthority);
            }

            double baseAileron = System.Math.Clamp(
                command.RollControl + command.SasRollControl, -1.0, 1.0);
            contribution = System.Math.Clamp(_sasRollControl,
                -1.0 - baseAileron, 1.0 - baseAileron);
            // Never push back against a lateral input the pilot is holding, and blend back in
            // after a reversal rather than snapping.
            if (lateralCommitment is { } commitment)
                contribution = commitment.Gate(contribution);
        } else {
            _sasRollControl = 0.0;
            _hasPreviousError = false;
            _estimatedTargetPlaneRateRadPerSecond = 0.0;
        }

        bool active = _captured && pilotBlend > 0.0 && planeBlend > 0.0
            && contribution != 0.0;
        PilotCommand assisted = contribution == 0.0 ? command : command with {
            SasRollControl = System.Math.Clamp(
                command.SasRollControl + contribution, -1.0, 1.0)
        };
        State = new PadlockRollAssistState(
            Selected: true,
            GeometryValid: true,
            Captured: _captured,
            Active: active,
            AnyPlane: false,
            PreferredPlaneValid: false,
            PreferredPlaneRad: 0.0,
            TargetSpawnSequence: targetSpawnSequence,
            PlaneMagnitude: planeMagnitude,
            RollErrorRad: rollError,
            DesiredRollRateRadPerSecond: desiredRollRate,
            MeasuredRollRateRadPerSecond: measuredRollRate,
            EstimatedTargetPlaneRateRadPerSecond:
                _estimatedTargetPlaneRateRadPerSecond,
            SasRollControl: contribution);
        return new PadlockRollAssistResult(assisted, State);
    }

    void ClearAssistLatches() {
        _captured = false;
        _captureCandidateSeconds = 0.0;
        _hasPreviousError = false;
        _previousErrorRad = 0.0;
        _estimatedTargetPlaneRateRadPerSecond = 0.0;
        _sasRollControl = 0.0;
        _hasPreferredPlane = false;
        _previousPreferredPlaneRad = 0.0;
        _preferredPlaneDwellSeconds = 0.0;
    }

    static double MoveToward(double current, double target, double maximumDelta) {
        double delta = System.Math.Clamp(target - current, -maximumDelta, maximumDelta);
        return current + delta;
    }

    static double Smoothstep(double lower, double upper, double value) {
        double t = System.Math.Clamp((value - lower)
            / System.Math.Max(upper - lower, 1e-9), 0.0, 1.0);
        return t * t * (3.0 - 2.0 * t);
    }

    static double WrapAngle(double angle) => System.Math.Atan2(
        System.Math.Sin(angle), System.Math.Cos(angle));

    static bool IsFinite(in Vec3D value) => double.IsFinite(value.X)
        && double.IsFinite(value.Y) && double.IsFinite(value.Z);
}
