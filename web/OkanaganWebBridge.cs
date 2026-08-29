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
    static double _accumulatorSeconds;

    [JSExport]
    public static void Start(int sortie)
    {
        _mission = OkanaganFireMission.Create(ResolveSortie(sortie));
        _command = new FireBossPilotCommand(0.0, 0.0, 0.0, 0.65, false, false);
        _accumulatorSeconds = 0.0;
    }

    [JSExport]
    public static string PreviewPlan(int sortie) =>
        OkanaganSnapshotProjection.BuildStateJson(
            OkanaganFireMission.Create(ResolveSortie(sortie)));

    static OkanaganSortieType ResolveSortie(int sortie) =>
        sortie switch {
            0 => OkanaganSortieType.WaterCircuits,
            1 => OkanaganSortieType.FireAttack,
            2 => OkanaganSortieType.LargeForceEmployment,
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
            drop);
    }

    [JSExport]
    public static int Advance(double deltaSeconds)
    {
        OkanaganFireMission mission = RequireMission();
        if (!double.IsFinite(deltaSeconds) || deltaSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(deltaSeconds));
        _accumulatorSeconds += Math.Min(deltaSeconds, MaximumFrameDeltaSeconds);
        int ticks = 0;
        while (_accumulatorSeconds + 1e-12 >= FixedDeltaSeconds && ticks < 12)
        {
            mission.Step(_command);
            _accumulatorSeconds -= FixedDeltaSeconds;
            ticks++;
        }
        return ticks;
    }

    [JSExport]
    public static string GetState() => OkanaganSnapshotProjection.BuildStateJson(RequireMission());

    [JSExport]
    public static void SetPaused(bool paused) => RequireMission().SetPaused(paused);

    static OkanaganFireMission RequireMission() =>
        _mission ?? throw new InvalidOperationException("Okanagan sortie has not been started.");

    static double Clamp(double value, double minimum, double maximum, string name)
    {
        if (!double.IsFinite(value)) throw new ArgumentOutOfRangeException(name);
        return Math.Clamp(value, minimum, maximum);
    }
}
