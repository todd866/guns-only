namespace GunsOnly.Sim.Okanagan;

public readonly record struct FireBossAutoTrimState(bool Enabled, string Status,
    double? TargetPitchRad, double Correction, double ManualTrim, double AppliedTrim,
    bool Saturated);

/// <summary>
/// Optional game assistance, not an AT-802 control-system claim. Holds the nose attitude
/// selected when the pilot releases pitch, through the existing elevator trim actuator only.
/// Raw FireBossDynamics remains unaugmented. Policy/gain provenance: 01-assistance.md.
/// </summary>
public sealed class FireBossAutoTrim
{
    public const double MaximumTrimRatePerSecond = 0.12;
    public const double MaximumCorrection = 0.5;
    public const double PitchInputDeadband = 0.025;
    const double Degrees = Math.PI / 180;
    const double PitchGain = 1.2;
    const double PitchRateGain = 0.6;
    static readonly AircraftParams Parameters = FlightModel.At802fFireBossPublicDataSurrogate;
    double _correction;
    double? _targetPitch;
    bool _speedEligible;
    bool _paused;

    public FireBossAutoTrim(bool enabled = true) => Reset(enabled);
    public FireBossAutoTrimState State { get; private set; }

    public void Reset(bool enabled)
    {
        _correction = 0;
        _targetPitch = null;
        _speedEligible = false;
        _paused = false;
        State = new(enabled, enabled ? "waiting" : "manual", null, 0, 0, 0, false);
    }

    /// <summary>Turning assistance off retains the current applied trim as manual trim.</summary>
    public FireBossPilotCommand SetEnabled(bool enabled, in FireBossPilotCommand command)
    {
        if (enabled == State.Enabled) return command;
        double trim = Math.Clamp(command.ElevatorTrim + _correction, -0.5, 0.5);
        bool paused = _paused;
        Reset(enabled);
        _paused = paused;
        State = State with { ManualTrim = trim, AppliedTrim = trim };
        return command with { ElevatorTrim = trim };
    }

    /// <summary>An explicit manual trim selection takes over immediately, without an offset.</summary>
    public FireBossPilotCommand SetManualTrim(double trim, in FireBossPilotCommand command)
    {
        if (!double.IsFinite(trim)) throw new ArgumentOutOfRangeException(nameof(trim));
        bool paused = _paused;
        Reset(false);
        _paused = paused;
        trim = Math.Clamp(trim, -0.5, 0.5);
        State = State with { ManualTrim = trim, AppliedTrim = trim };
        return command with { ElevatorTrim = trim };
    }

    public void SetPaused(bool paused) => _paused = paused;

    public FireBossPilotCommand Apply(FireBossDynamics aircraft,
        FireBossPilotCommand command, double deltaSeconds)
    {
        ArgumentNullException.ThrowIfNull(aircraft);
        if (!double.IsFinite(deltaSeconds) || deltaSeconds < 0 || deltaSeconds > 0.1)
            throw new ArgumentOutOfRangeException(nameof(deltaSeconds));
        if (_paused || deltaSeconds == 0)
            return command with { ElevatorTrim = State.AppliedTrim };
        double manual = Math.Clamp(command.ElevatorTrim, -0.5, 0.5);
        if (!State.Enabled)
        {
            State = new(false, "manual", null, 0, manual, manual, false);
            return command;
        }

        FireBossTelemetry telemetry = aircraft.Telemetry;
        string? inhibit = null;
        if (!telemetry.Flyable || telemetry.SurfaceMode != FireBossSurfaceMode.Airborne)
            inhibit = "surface";
        else if (Math.Abs(telemetry.RollRad) > 60 * Degrees
            || Math.Abs(telemetry.PitchRad) > 35 * Degrees)
            inhibit = "attitude";
        else
        {
            double density = StandardAtmosphere1976.Instance.Sample(telemetry.PositionWorldM.Y).DensityKgM3;
            double stall = Math.Sqrt(2 * telemetry.GrossMassKg * 9.80665
                / (density * Parameters.WingAreaM2 * Parameters.CLMax * Math.Cos(telemetry.RollRad)));
            // Hysteresis prevents rapid engagement changes near the slow-flight boundary.
            _speedEligible = telemetry.TrueAirspeedMps >= stall * (_speedEligible ? 1.10 : 1.20);
            if (!_speedEligible) inhibit = "low-speed";
        }

        if (inhibit is not null)
        {
            _targetPitch = null;
            _speedEligible = false;
            return Finish(inhibit, 0, false);
        }
        if (Math.Abs(command.Pitch) > PitchInputDeadband)
        {
            // No trim chasing the stick. The next neutral authority tick captures the nose
            // angle, not the lagging velocity vector following a short pull or rotation.
            _targetPitch = null;
            return Finish("pilot", _correction, false);
        }

        _targetPitch ??= telemetry.PitchRad;
        ConventionalTailParameters tail = Parameters.ConventionalTail;
        BodyRates rates = aircraft.SharedAircraft.State.BodyRates;
        double bank = telemetry.RollRad;
        double eulerPitchRate = rates.Q * Math.Cos(bank) - rates.R * Math.Sin(bank);
        // Body Q is nonzero in a steady banked turn. Compensate only the pitch moment
        // needed for steady Euler pitch; neither yaw nor roll receives a command.
        double turnQ = rates.R * Math.Tan(bank);
        double chord = Parameters.WingAreaM2 / Parameters.WingSpanM;
        double trim = -(tail.CmAlpha * telemetry.AngleOfAttackRad
            + tail.CmQ * turnQ * chord / (2 * telemetry.TrueAirspeedMps))
            / (tail.CmDeltaElevator * tail.MaxElevatorDeflectionRad);
        double desired = trim - aircraft.InitialElevatorTrim - manual
            + PitchGain * (_targetPitch.Value - telemetry.PitchRad)
            - PitchRateGain * eulerPitchRate;
        double limited = Math.Clamp(desired, Math.Max(-MaximumCorrection, -0.5 - manual),
            Math.Min(MaximumCorrection, 0.5 - manual));
        return Finish("active", limited, Math.Abs(desired - limited) > 1e-9);

        FireBossPilotCommand Finish(string status, double desired, bool saturated)
        {
            _correction += Math.Clamp(desired - _correction,
                -MaximumTrimRatePerSecond * deltaSeconds, MaximumTrimRatePerSecond * deltaSeconds);
            double applied = Math.Clamp(manual + _correction, -0.5, 0.5);
            State = new(true, status, _targetPitch, _correction, manual, applied, saturated);
            return command with { ElevatorTrim = applied };
        }
    }
}
