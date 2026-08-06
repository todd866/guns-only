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
    // Honest-rider pitch management: a competent rider allows a deliberate wheelie (arrow
    // back + throttle) up to a showy but recoverable pitch, chops throttle before loop-over,
    // and releases the brake before an endo. The governor multiplies the rate-limited
    // command (a panic chop is instant, unlike a progressive squeeze), so it caps pitch
    // without deleting the phenomenon. Pitch rate is estimated by differencing feedback
    // pitch because the mission runtime wires PitchRateRadPerSec as zero.
    const double WheelieAllowedBaseRad = 0.06;
    const double WheelieAllowedDeliberateRad = 0.29;
    const double StoppieAllowedRad = 0.10;
    const double PitchGovernorLookaheadSeconds = 0.25;
    const double PitchGovernorGain = 6.0;
    // The steer-to-lean plant gain G(v) = maxBar * v^2 / (effectiveWheelbase * g) grows with
    // speed squared. Above the reference speed the lean-stabilizing bar correction is scaled
    // by G_ref/G(v) so closed-loop lean stiffness and damping stay speed-invariant; with the
    // fixed gain, the 3.0 units/s steer rate limit turned the loop into a limit-cycle
    // oscillator — the sustained 150+ km/h weave (per-cycle amplitude ratio 1.5-1.7 in the
    // straight-line probe). Real riders make proportionally smaller bar corrections at speed.
    const double StabilizationReferenceSpeedMps = 60.0 / 3.6;
    const double StandardGravityMps2 = 9.80665;
    static readonly double EffectiveWheelbaseM = YzfR1Definition.WheelbaseM
        + YzfR1Definition.TrailM / Math.Cos(YzfR1Definition.RakeRad);

    readonly double[] _turnDelay = new double[AssistedReactionDelayTicks];
    int _turnDelayIndex;
    double _steer;
    double _riderLateral;
    double _riderForeAft;
    double _throttle;
    double _brake;
    double _previousPitchRad;
    bool _hasPreviousPitch;

    public void Reset()
    {
        Array.Clear(_turnDelay);
        _turnDelayIndex = 0;
        _steer = 0.0;
        _riderLateral = 0.0;
        _riderForeAft = 0.0;
        _throttle = 0.0;
        _brake = 0.0;
        _previousPitchRad = 0.0;
        _hasPreviousPitch = false;
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
        double gainNormalization = Math.Min(
            1.0,
            SteerToLeanGain(StabilizationReferenceSpeedMps)
                / Math.Max(SteerToLeanGain(Math.Abs(feedback.SpeedMps)), 1e-9));
        double stabilizingCorrection = Math.Clamp(
            (-leanErrorRad * 0.35 - feedback.LeanRateRadPerSec * 0.05) * gainNormalization,
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

        double pitchRateEstimateRadPerSec = _hasPreviousPitch
            ? (feedback.PitchRad - _previousPitchRad) / FixedDeltaSeconds
            : 0.0;
        _previousPitchRad = feedback.PitchRad;
        _hasPreviousPitch = true;
        double deliberateWheelie = Math.Clamp(-intent.BodyForeAftBias, 0.0, 1.0);

        double throttle = intent.Throttle
            * (1.0 - WheelieThrottleTrim * wheelieAuthority * (1.0 - deliberateWheelie));
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

        double allowedWheelieRad = WheelieAllowedBaseRad
            + WheelieAllowedDeliberateRad * deliberateWheelie;
        double wheelieAheadRad = feedback.PitchRad
            + Math.Max(0.0, pitchRateEstimateRadPerSec) * PitchGovernorLookaheadSeconds;
        double wheelieGovernorScale = Math.Clamp(
            1.0 - PitchGovernorGain * Math.Max(0.0, wheelieAheadRad - allowedWheelieRad),
            0.0,
            1.0);
        double stoppieAheadRad = -(feedback.PitchRad
            + Math.Min(0.0, pitchRateEstimateRadPerSec) * PitchGovernorLookaheadSeconds);
        double stoppieGovernorScale = Math.Clamp(
            1.0 - PitchGovernorGain * Math.Max(0.0, stoppieAheadRad - StoppieAllowedRad),
            0.0,
            1.0);

        return new MotorcyclePilotCommand(
            _throttle * wheelieGovernorScale,
            _brake * stoppieGovernorScale,
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

    static double SteerToLeanGain(double speedMps) =>
        YzfR1Dynamics.MaximumBarSteerRad * speedMps * speedMps
        / (EffectiveWheelbaseM * StandardGravityMps2);

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
