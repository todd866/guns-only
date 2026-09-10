using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using GunsOnly.Sim.Okanagan;

namespace GunsOnly.Web;

[SupportedOSPlatform("browser")]
public static partial class OkanaganWebBridge
{
    const double FixedDeltaSeconds = FireBossDynamics.FixedDeltaSeconds;
    const double MaximumFrameDeltaSeconds = 0.1;
    static OkanaganFireMission? _mission;
    static FireBossPilotCommand _command;
    static FireBossPilotCommand _lastAppliedCommand;
    static readonly FireBossControlTapBuffer ControlTaps = new();
    static readonly FireBossAutoTrim AutoTrim = new();
    static bool _paused;
    static double _accumulatorSeconds;

    [JSExport]
    public static void Start(int sortie)
    {
        _mission = OkanaganFireMission.CreateForPlayer(ResolveSortie(sortie));
        _command = new FireBossPilotCommand(0.0, 0.0, 0.0,
            _mission.Aircraft.Telemetry.Throttle, false, false);
        _lastAppliedCommand = _command;
        AutoTrim.Reset(AutoTrim.State.Enabled);
        _paused = false;
        ControlTaps.Reset();
        _accumulatorSeconds = 0.0;
    }

    [JSExport]
    public static string PreviewPlan(int sortie) =>
        OkanaganSnapshotProjection.BuildStateJson(
            OkanaganFireMission.CreateForPlayer(ResolveSortie(sortie)));

    static OkanaganSortieType ResolveSortie(int sortie) =>
        sortie switch {
            0 => OkanaganSortieType.WaterCircuits,
            1 => OkanaganSortieType.FireAttack,
            2 => OkanaganSortieType.LargeForceEmployment,
            3 => OkanaganSortieType.PeachlandDefence,
            4 => OkanaganSortieType.BigWhiteDefence,
            5 => OkanaganSortieType.SilverStarDefence,
            6 => OkanaganSortieType.ApexDefence,
            _ => throw new ArgumentOutOfRangeException(nameof(sortie)),
        };

    [JSExport]
    public static void SetControls(double pitch, double roll, double yaw, double throttle,
        bool scoops, bool drop)
    {
        _command = new FireBossPilotCommand(
            Clamp(pitch, -1.0, 1.0, nameof(pitch)),
            Clamp(roll, -1.0, 1.0, nameof(roll)),
            Clamp(yaw, -1.0, 1.0, nameof(yaw)),
            Clamp(throttle, 0.0, 1.0, nameof(throttle)),
            scoops,
            drop,
            _command.ElevatorTrim);
    }

    [JSExport]
    public static void SetElevatorTrim(double trim) =>
        _command = AutoTrim.SetManualTrim(Clamp(trim, -0.5, 0.5, nameof(trim)), _command);

    [JSExport]
    public static void SetAutoTrimEnabled(bool enabled) =>
        _command = AutoTrim.SetEnabled(enabled, _command);

    [JSExport]
    public static void QueueControlTap(int axis, double direction, double durationSeconds)
    {
        if (!_paused) ControlTaps.Queue(axis, direction, durationSeconds);
    }

    [JSExport]
    public static void ReleaseFlightControls()
    {
        ControlTaps.Clear();
        _command = _command with { Pitch = 0, Roll = 0, Yaw = 0, DropRequested = false };
    }

    [JSExport]
    public static int Advance(double deltaSeconds)
    {
        OkanaganFireMission mission = RequireMission();
        if (!double.IsFinite(deltaSeconds) || deltaSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(deltaSeconds));
        if (_paused) return 0;
        _accumulatorSeconds += Math.Min(deltaSeconds, MaximumFrameDeltaSeconds);
        int ticks = 0;
        while (_accumulatorSeconds + 1e-12 >= FixedDeltaSeconds && ticks < 12)
        {
            if (mission.Phase is OkanaganMissionPhase.Complete or OkanaganMissionPhase.Failed)
            {
                _accumulatorSeconds = 0.0;
                break;
            }
            _lastAppliedCommand = AutoTrim.Apply(mission.Aircraft,
                ControlTaps.Apply(_command), FixedDeltaSeconds);
            mission.Step(_lastAppliedCommand);
            _accumulatorSeconds -= FixedDeltaSeconds;
            ticks++;
        }
        return ticks;
    }

    [JSExport]
    public static string GetState() => OkanaganSnapshotProjection.BuildStateJson(
        RequireMission(), _lastAppliedCommand, ControlTaps, _command, AutoTrim.State);

    [JSExport]
    public static void SetPaused(bool paused)
    {
        RequireMission().SetPaused(paused);
        _paused = paused;
        AutoTrim.SetPaused(paused);
        if (paused)
        {
            ReleaseFlightControls();
            _accumulatorSeconds = 0.0;
        }
    }

    static OkanaganFireMission RequireMission() =>
        _mission ?? throw new InvalidOperationException("Okanagan sortie has not been started.");

    static double Clamp(double value, double minimum, double maximum, string name)
    {
        if (!double.IsFinite(value)) throw new ArgumentOutOfRangeException(name);
        return Math.Clamp(value, minimum, maximum);
    }
}
