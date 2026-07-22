namespace GunsOnly.Sim;

/// <summary>
/// Observable truth for the bandit-padlock lift-plane hold. The controller contribution is kept
/// separate from pilot aileron so telemetry, physiology, and safety automation retain clear
/// ownership of the lateral axis.
/// </summary>
public readonly record struct PadlockRollAssistState(
    bool Selected,
    bool GeometryValid,
    bool Captured,
    bool Active,
    bool AnyPlane,
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

/// <summary>
/// A low-authority target-plane trim for bandit padlock. The pilot must first put lift within the
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
    const double TargetPlaneFeedForward = 0.5;
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

    public PadlockRollAssistState State { get; private set; } =
        PadlockRollAssistState.Inactive();

    public void Reset() {
        _captured = false;
        _captureCandidateSeconds = 0.0;
        _hasPreviousError = false;
        _previousErrorRad = 0.0;
        _estimatedTargetPlaneRateRadPerSecond = 0.0;
        _sasRollControl = 0.0;
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
        double deltaSeconds) {
        double dt = System.Math.Clamp(
            double.IsFinite(deltaSeconds) ? deltaSeconds : 0.0, 0.0, 0.05);
        if (!selected || !eligible || dt <= 0.0
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
            Reset();
            State = new PadlockRollAssistState(
                Selected: true,
                GeometryValid: anyPlane,
                Captured: anyPlane,
                Active: false,
                AnyPlane: anyPlane,
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
        double absoluteError = System.Math.Abs(rollError);
        if (_captured && absoluteError > CaptureReleaseRad) {
            _captured = false;
            _captureCandidateSeconds = 0.0;
            _hasPreviousError = false;
            _estimatedTargetPlaneRateRadPerSecond = 0.0;
            _sasRollControl = 0.0;
        }

        if (!_captured) {
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
        } else {
            _sasRollControl = 0.0;
            _hasPreviousError = false;
            _estimatedTargetPlaneRateRadPerSecond = 0.0;
        }

        bool active = _captured && pilotBlend > 0.0 && planeBlend > 0.0;
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
