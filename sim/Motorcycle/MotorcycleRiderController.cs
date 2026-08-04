namespace GunsOnly.Sim.Motorcycle;

public enum MotorcycleControlMode
{
    Assisted,
    Raw
}

/// <summary>
/// Player intent at the rider seam. Turn is desired corner direction; body axes are optional
/// biases. Assisted mode turns this into bounded bar, body, and pitch-management commands.
/// </summary>
public readonly record struct MotorcycleRiderIntent(
    double Throttle,
    double Brake,
    double Turn,
    double BodyLateralBias,
    double BodyForeAftBias,
    int GearShiftRequest,
    double Clutch,
    MotorcycleClutchMode ClutchMode);

public readonly record struct MotorcycleRiderFeedback(
    double SpeedMps,
    double LeanRad,
    double LeanRateRadPerSec,
    double PitchRad,
    double PitchRateRadPerSec,
    double FrontGripUse,
    double RearGripUse,
    double WheelieBalance,
    double StoppieBalance,
    bool IsSliding);

/// <summary>
/// Low-order rider neuromuscular controller. The constants are provisional human-response
/// surrogates: they add reaction delay and rate limits, but never add tire force or bypass
/// <see cref="YzfR1Dynamics"/>.
/// </summary>
public sealed class MotorcycleRiderController
{
    public const int AssistedReactionDelayTicks = 7;
    public const double MaximumSteerRatePerSecond = 3.0;
    public const double MaximumBodyRatePerSecond = 2.4;
    public const double MaximumThrottleRatePerSecond = 2.2;
    public const double MaximumBrakeRatePerSecond = 4.0;

    const double FixedDeltaSeconds = 1.0 / 120.0;
    const double FullBodyShiftAuthoritySpeedMps = 8.0;
    const double MaximumAssistedLeanRad = 0.62;
    const double WheelieThrottleTrim = 0.45;
    const double StoppieBrakeTrim = 0.45;

    readonly double[] _turnDelay = new double[AssistedReactionDelayTicks];
    int _turnDelayIndex;
    double _steer;
    double _riderLateral;
    double _riderForeAft;
    double _throttle;
    double _brake;

    public void Reset()
    {
        Array.Clear(_turnDelay);
        _turnDelayIndex = 0;
        _steer = 0.0;
        _riderLateral = 0.0;
        _riderForeAft = 0.0;
        _throttle = 0.0;
        _brake = 0.0;
    }

    public MotorcyclePilotCommand Step(
        in MotorcycleRiderIntent intent,
        in MotorcycleRiderFeedback feedback,
        MotorcycleControlMode mode)
    {
        Validate(intent, feedback, mode);
        if (mode == MotorcycleControlMode.Raw)
        {
            Reset();
            return new MotorcyclePilotCommand(
                intent.Throttle,
                intent.Brake,
                intent.Turn,
                intent.BodyLateralBias,
                intent.BodyForeAftBias,
                intent.GearShiftRequest,
                intent.Clutch,
                intent.ClutchMode);
        }

        double delayedTurn = _turnDelay[_turnDelayIndex];
        _turnDelay[_turnDelayIndex] = intent.Turn;
        _turnDelayIndex = (_turnDelayIndex + 1) % _turnDelay.Length;

        double speedAuthority = Math.Clamp(
            Math.Abs(feedback.SpeedMps) / FullBodyShiftAuthoritySpeedMps,
            0.0,
            1.0);
        double desiredLeanRad = -delayedTurn * MaximumAssistedLeanRad * speedAuthority;
        double leanErrorRad = desiredLeanRad - feedback.LeanRad;
        double stabilizingCorrection = Math.Clamp(
            -leanErrorRad * 0.35 - feedback.LeanRateRadPerSec * 0.05,
            -0.20,
            0.20);
        double steerTarget = delayedTurn * (0.70 + 0.30 * speedAuthority)
            + stabilizingCorrection;
        if (feedback.IsSliding)
            steerTarget *= 0.55;
        steerTarget = Math.Clamp(steerTarget, -1.0, 1.0);

        double lateralTarget = delayedTurn * 0.70 * speedAuthority
            + intent.BodyLateralBias * 0.30;
        if (feedback.IsSliding)
            lateralTarget *= 0.60;
        lateralTarget = Math.Clamp(lateralTarget, -1.0, 1.0);

        double wheelieAuthority = Math.Clamp(feedback.WheelieBalance, 0.0, 1.0);
        double stoppieAuthority = Math.Clamp(feedback.StoppieBalance, 0.0, 1.0);
        double foreAftTarget = intent.BodyForeAftBias
            + 0.70 * wheelieAuthority
            - 0.70 * stoppieAuthority
            + 0.15 * intent.Throttle
            - 0.25 * intent.Brake;
        foreAftTarget = Math.Clamp(foreAftTarget, -1.0, 1.0);

        _steer = MoveToward(
            _steer,
            steerTarget,
            MaximumSteerRatePerSecond * FixedDeltaSeconds);
        _riderLateral = MoveToward(
            _riderLateral,
            lateralTarget,
            MaximumBodyRatePerSecond * FixedDeltaSeconds);
        _riderForeAft = MoveToward(
            _riderForeAft,
            foreAftTarget,
            MaximumBodyRatePerSecond * FixedDeltaSeconds);

        double throttle = intent.Throttle * (1.0 - WheelieThrottleTrim * wheelieAuthority);
        double brake = intent.Brake * (1.0 - StoppieBrakeTrim * stoppieAuthority);
        if (feedback.IsSliding)
        {
            throttle *= 0.65;
            brake *= 0.80;
        }
        _throttle = MoveToward(
            _throttle,
            Math.Clamp(throttle, 0.0, 1.0),
            MaximumThrottleRatePerSecond * FixedDeltaSeconds);
        _brake = MoveToward(
            _brake,
            Math.Clamp(brake, 0.0, 1.0),
            MaximumBrakeRatePerSecond * FixedDeltaSeconds);

        return new MotorcyclePilotCommand(
            _throttle,
            _brake,
            _steer,
            _riderLateral,
            _riderForeAft,
            intent.GearShiftRequest,
            intent.Clutch,
            intent.ClutchMode);
    }

    static double MoveToward(double current, double target, double maximumDelta)
    {
        double delta = Math.Clamp(target - current, -maximumDelta, maximumDelta);
        return current + delta;
    }

    static void Validate(
        in MotorcycleRiderIntent intent,
        in MotorcycleRiderFeedback feedback,
        MotorcycleControlMode mode)
    {
        Unit(intent.Throttle, nameof(intent.Throttle), 0.0);
        Unit(intent.Brake, nameof(intent.Brake), 0.0);
        Unit(intent.Turn, nameof(intent.Turn), -1.0);
        Unit(intent.BodyLateralBias, nameof(intent.BodyLateralBias), -1.0);
        Unit(intent.BodyForeAftBias, nameof(intent.BodyForeAftBias), -1.0);
        Unit(intent.Clutch, nameof(intent.Clutch), 0.0);
        if (intent.GearShiftRequest is < -1 or > 1)
            throw new ArgumentOutOfRangeException(nameof(intent.GearShiftRequest));
        if (!Enum.IsDefined(intent.ClutchMode))
            throw new ArgumentOutOfRangeException(nameof(intent.ClutchMode));
        if (!Enum.IsDefined(mode))
            throw new ArgumentOutOfRangeException(nameof(mode));
        if (!double.IsFinite(feedback.SpeedMps)
            || !double.IsFinite(feedback.LeanRad)
            || !double.IsFinite(feedback.LeanRateRadPerSec)
            || !double.IsFinite(feedback.PitchRad)
            || !double.IsFinite(feedback.PitchRateRadPerSec)
            || !double.IsFinite(feedback.FrontGripUse)
            || !double.IsFinite(feedback.RearGripUse)
            || !double.IsFinite(feedback.WheelieBalance)
            || !double.IsFinite(feedback.StoppieBalance))
            throw new ArgumentOutOfRangeException(nameof(feedback));
    }

    static void Unit(double value, string name, double minimum)
    {
        if (!double.IsFinite(value) || value < minimum || value > 1.0)
            throw new ArgumentOutOfRangeException(name);
    }
}
