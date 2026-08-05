using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Motorcycle;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Web;

/// <summary>
/// Browser facade for the Rapier strip weekend motorcycle ride. Advances the authoritative
/// 120 Hz YZF-R1 runtime and serializes mission-owned snapshot JSON for the helmet HUD client.
/// </summary>
[SupportedOSPlatform("browser")]
public static partial class MotorcycleWebBridge
{
    const double FixedDeltaSeconds = 1.0 / PlayerVehicleContract.FixedStepHz;
    const double MaximumFrameDeltaSeconds = 0.1;

    static WeekendRideMissionRuntime? _runtime;
    static MotorcycleRiderIntent _intent = new(
        0.0, 0.0, 0.0, 0.0, 0.0, 0, 1.0, MotorcycleClutchMode.Auto);
    static MotorcycleControlMode _controlMode = MotorcycleControlMode.Assisted;
    static int _pendingGearShift;
    static double _accumulatorSeconds;

    [JSExport]
    public static void Start()
    {
        _runtime = WeekendRideMissionRuntime.CreateDefault();
        _runtime.Begin();
        _intent = new MotorcycleRiderIntent(
            0.0, 0.0, 0.0, 0.0, 0.0, 0, 1.0, MotorcycleClutchMode.Auto);
        _controlMode = MotorcycleControlMode.Assisted;
        _pendingGearShift = 0;
        _accumulatorSeconds = 0.0;
    }

    [JSExport]
    public static void SetControls(
        double throttle,
        double brake,
        double steer,
        double riderLateral,
        double riderForeAft,
        double clutch)
    {
        _intent = _intent with {
            Throttle = ClampFinite(throttle, 0.0, 1.0, nameof(throttle)),
            Brake = ClampFinite(brake, 0.0, 1.0, nameof(brake)),
            Turn = ClampFinite(steer, -1.0, 1.0, nameof(steer)),
            BodyLateralBias = ClampFinite(riderLateral, -1.0, 1.0, nameof(riderLateral)),
            BodyForeAftBias = ClampFinite(riderForeAft, -1.0, 1.0, nameof(riderForeAft)),
            Clutch = ClampFinite(clutch, 0.0, 1.0, nameof(clutch)),
        };
    }

    [JSExport]
    public static void SetClutchMode(int mode)
    {
        _intent = _intent with {
            ClutchMode = mode switch {
                0 => MotorcycleClutchMode.Auto,
                1 => MotorcycleClutchMode.Manual,
                _ => throw new ArgumentOutOfRangeException(nameof(mode))
            }
        };
    }

    [JSExport]
    public static void SetControlMode(int mode)
    {
        _controlMode = mode switch {
            0 => MotorcycleControlMode.Assisted,
            1 => MotorcycleControlMode.Raw,
            _ => throw new ArgumentOutOfRangeException(nameof(mode))
        };
    }

    [JSExport]
    public static void FeedShift(int direction)
    {
        if (direction is < -1 or > 1)
            throw new ArgumentOutOfRangeException(nameof(direction));
        _pendingGearShift = direction;
    }

    [JSExport]
    public static void SetPaused(bool paused)
    {
        WeekendRideMissionRuntime runtime = RequireRuntime();
        if (paused)
            runtime.Pause();
        else if (runtime.Phase == WeekendRidePhase.Paused)
            runtime.Resume();
    }

    [JSExport]
    public static void ResetToGrid()
    {
        WeekendRideMissionRuntime runtime = RequireRuntime();
        runtime.ResetToGrid();
        _accumulatorSeconds = 0.0;
    }

    [JSExport]
    public static int Advance(double deltaSeconds)
    {
        WeekendRideMissionRuntime runtime = RequireRuntime();
        if (!double.IsFinite(deltaSeconds) || deltaSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(deltaSeconds));

        _accumulatorSeconds += Math.Min(deltaSeconds, MaximumFrameDeltaSeconds);
        int ticks = 0;
        while (_accumulatorSeconds + 1e-12 >= FixedDeltaSeconds
            && ticks++ < 12
            && runtime.Phase == WeekendRidePhase.Active) {
            MotorcycleRiderIntent stepIntent = _intent with {
                GearShiftRequest = _pendingGearShift
            };
            _pendingGearShift = 0;
            runtime.StepFixed(stepIntent, _controlMode);
            _accumulatorSeconds -= FixedDeltaSeconds;
        }
        return checked((int)runtime.Bike.State.Tick);
    }

    [JSExport]
    public static string GetState() =>
        MotorcycleSnapshotProjection.BuildStateJson(RequireRuntime(), _controlMode);

    /// <summary>
    /// The immutable painted-circuit centreline, fetched once at boot. Kept out of the
    /// per-frame snapshot: serializing ~1,700 points at 60 fps is pure marshalling waste.
    /// </summary>
    [JSExport]
    public static string GetCircuit() => JsonSerializer.Serialize(
        RequireRuntime().Circuit.Centreline.Select(point => new {
            x = point.X,
            y = point.Y,
            z = point.Z,
        }).ToArray());

    static WeekendRideMissionRuntime RequireRuntime() =>
        _runtime ?? throw new InvalidOperationException("Weekend ride has not been started.");

    static double ClampFinite(double value, double minimum, double maximum, string name)
    {
        if (!double.IsFinite(value))
            throw new ArgumentOutOfRangeException(name);
        return Math.Clamp(value, minimum, maximum);
    }

}
