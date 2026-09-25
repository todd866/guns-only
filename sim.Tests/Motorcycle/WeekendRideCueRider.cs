using GunsOnly.Sim.Motorcycle;

namespace GunsOnly.Sim.Tests.Motorcycle;

/// <summary>
/// Cue-only rider for the weekend-ride acceptance. It reads the snapshot, decides 250 ms
/// late, and slews throttle, brake and steer. It does not read the centreline.
/// </summary>
public sealed class WeekendRideCueRider
{
    public const int LagTicks = 30;
    const double ThrottleRatePerSecond = 2.0;
    const double BrakeRatePerSecond = 4.0;
    const double SteerRatePerSecond = 2.0;
    const double FixedDt = 1.0 / 120.0;

    readonly Queue<Cue> _cues = new();
    double _throttle;
    double _brake;
    double _steer;

    readonly record struct Cue(
        double SpeedMps,
        double ApexM,
        double ApexMps,
        bool Exit,
        bool PitOpen,
        double LookAheadM,
        bool InPit,
        bool PitEntryLegal,
        bool OnTrack);

    public static CueSnapshot Read(WeekendRideMissionRuntime runtime)
    {
        WeekendRideSnapshot snap = runtime.Snapshot();
        return new CueSnapshot(
            snap.SpeedMps,
            snap.NextApexDistanceM,
            snap.NextApexSteadySpeedMps,
            snap.NextApexIsExit,
            snap.PitOpen,
            snap.LookAheadLateralM,
            snap.InPit,
            snap.PitEntryLegal);
    }

    public void Step(WeekendRideMissionRuntime runtime)
    {
        CueSnapshot now = Read(runtime);
        var cue = new Cue(
            now.SpeedMps, now.ApexM, now.ApexMps, now.Exit,
            now.PitOpen, now.LookAheadM, now.InPit, now.PitEntryLegal,
            runtime.IsOnTrack);
        _cues.Enqueue(cue);
        Cue decision = _cues.Count > LagTicks ? _cues.Dequeue() : cue;

        bool pitApproach = decision.PitOpen && !decision.InPit;
        double lookDistanceM = pitApproach
            ? Math.Max(80.0, Math.Abs(decision.LookAheadM) * 2.0)
            : Math.Max(12.0, decision.SpeedMps * 0.8);
        double headingError = Math.Atan2(decision.LookAheadM, lookDistanceM);
        bool commit = !pitApproach && !decision.Exit && decision.ApexM < 40.0;
        double steerGain = pitApproach ? 0.8 : commit ? 1.6 : 0.55;
        double steerCap = pitApproach ? 0.45 : commit ? 0.75 : 0.55;
        double steerTarget = Math.Clamp(headingError * steerGain, -steerCap, steerCap);
        double cornerMps = Math.Max(11.0, decision.ApexMps * 0.55);

        double speedTarget = 32.0;
        if (decision.PitOpen && !decision.InPit)
            speedTarget = 12.0;
        else if (decision.InPit && decision.PitEntryLegal)
            speedTarget = 0.0;
        if (now.InPit)
        {
            steerTarget = 0.0;
            _steer = 0.0;
        }
        else if (!decision.Exit && decision.ApexM < 150.0)
            speedTarget = cornerMps;
        else if (decision.Exit && Math.Abs(decision.LookAheadM) > 3.0)
            speedTarget = cornerMps;
        else if (decision.Exit)
            speedTarget = Math.Max(cornerMps, 18.0);
        else if (!decision.Exit && decision.ApexM < 280.0)
            speedTarget = 22.0;

        double throttleTarget = decision.SpeedMps < speedTarget - 1.0 ? 1.0 : 0.0;
        double brakeDivisor = now.InPit ? 40.0 : 8.0;
        double brakeTarget = decision.SpeedMps > speedTarget + 1.0
            ? Math.Clamp((decision.SpeedMps - speedTarget) / brakeDivisor, 0.0, 1.0)
            : 0.0;
        if (brakeTarget > 0.05)
            throttleTarget = 0.0;
        if (!decision.OnTrack && !decision.PitOpen)
            throttleTarget = 0.0;
        if (!decision.InPit && decision.SpeedMps < 10.0)
        {
            throttleTarget = Math.Max(throttleTarget, 0.4);
            brakeTarget = 0.0;
        }

        _throttle = MoveToward(_throttle, throttleTarget, ThrottleRatePerSecond * FixedDt);
        _brake = MoveToward(_brake, brakeTarget, BrakeRatePerSecond * FixedDt);
        _steer = MoveToward(_steer, steerTarget, SteerRatePerSecond * FixedDt);

        runtime.StepFixed(
            new MotorcycleRiderIntent(
                _throttle, _brake, _steer, 0.0, 0.0, 0, 1.0, MotorcycleClutchMode.Auto),
            MotorcycleControlMode.Assisted);
    }

    static double MoveToward(double current, double target, double maxDelta) =>
        current + Math.Clamp(target - current, -maxDelta, maxDelta);

    public readonly record struct CueSnapshot(
        double SpeedMps,
        double ApexM,
        double ApexMps,
        bool Exit,
        bool PitOpen,
        double LookAheadM,
        bool InPit,
        bool PitEntryLegal);
}
