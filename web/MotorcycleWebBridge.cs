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
    public static string GetState() => JsonSerializer.Serialize(BuildState(RequireRuntime()));

    static object BuildState(WeekendRideMissionRuntime runtime)
    {
        WeekendRideSnapshot snap = runtime.Snapshot();
        Vec3D position = snap.PositionWorldM;
        Vec3D velocity = snap.GroundVelocityMps;
        QuaternionD view = snap.ViewAttitude;
        return new {
            px = position.X,
            py = position.Y,
            pz = position.Z,
            vx = velocity.X,
            vy = velocity.Y,
            vz = velocity.Z,
            lean_rad = snap.LeanRad,
            view_qw = view.W,
            view_qx = view.X,
            view_qy = view.Y,
            view_qz = view.Z,
            rider_lateral = snap.RiderLateral,
            rider_fore_aft = snap.RiderForeAft,
            gear = snap.Gear,
            clutch_mode = ClutchModeToken(snap.ClutchMode),
            control_mode = ControlModeToken(_controlMode),
            clutch = snap.ClutchEngagement,
            clutch_engagement = snap.ClutchEngagement,
            rpm = snap.Rpm,
            throttle = snap.Throttle,
            brake = snap.Brake,
            front_normal_n = snap.FrontNormalForceN,
            rear_normal_n = snap.RearNormalForceN,
            front_long_force_n = snap.FrontLongitudinalForceN,
            rear_long_force_n = snap.RearLongitudinalForceN,
            front_lat_force_n = snap.FrontLateralForceN,
            rear_lat_force_n = snap.RearLateralForceN,
            front_grip_use = snap.FrontGripUse,
            rear_grip_use = snap.RearGripUse,
            cog_along_from_rear_m = snap.CogAlongFromRearM,
            cog_lateral_m = snap.CogLateralM,
            rider_skill = snap.RiderSkillAuthority,
            cog_envelope_center_along_m = snap.CogEnvelopeCenterAlongM,
            cog_envelope_half_along_m = snap.CogEnvelopeHalfAlongM,
            cog_envelope_half_lateral_m = snap.CogEnvelopeHalfLateralM,
            cog_inside_envelope = snap.CogInsideEnvelope,
            cerebellar_assist_scale = snap.CerebellarAssistScale,
            wheelbase_m = YzfR1Definition.WheelbaseM,
            slip_front = snap.SlipFront,
            slip_rear = snap.SlipRear,
            wheelie_balance = snap.WheelieBalance,
            stoppie_balance = snap.StoppieBalance,
            pitch_reflex = snap.PitchReflexAuthority,
            knee_down = snap.KneeDown,
            knee_proximity = snap.KneeProximity,
            lean_hold = snap.LeanHoldAuthority,
            lap = snap.LapCount,
            lap_time_s = snap.LapTimeSeconds,
            off_track_s = snap.OffTrackSeconds,
            tipped = snap.IsTippedOver,
            tip_recovery_flash_s = snap.TipRecoveryFlashSeconds,
            phase = PhaseToken(snap.Phase),
            circuit = runtime.Circuit.Centreline.Select(point => new {
                x = point.X,
                y = point.Y,
                z = point.Z,
            }).ToArray(),
        };
    }

    static WeekendRideMissionRuntime RequireRuntime() =>
        _runtime ?? throw new InvalidOperationException("Weekend ride has not been started.");

    static double ClampFinite(double value, double minimum, double maximum, string name)
    {
        if (!double.IsFinite(value))
            throw new ArgumentOutOfRangeException(name);
        return Math.Clamp(value, minimum, maximum);
    }

    static string PhaseToken(WeekendRidePhase phase) => phase switch {
        WeekendRidePhase.Ready => "ready",
        WeekendRidePhase.Active => "active",
        WeekendRidePhase.Paused => "paused",
        WeekendRidePhase.Finished => "finished",
        _ => throw new ArgumentOutOfRangeException(nameof(phase))
    };

    static string ClutchModeToken(MotorcycleClutchMode mode) => mode switch {
        MotorcycleClutchMode.Auto => "auto",
        MotorcycleClutchMode.Manual => "manual",
        _ => throw new ArgumentOutOfRangeException(nameof(mode))
    };

    static string ControlModeToken(MotorcycleControlMode mode) => mode switch {
        MotorcycleControlMode.Assisted => "assisted",
        MotorcycleControlMode.Raw => "raw",
        _ => throw new ArgumentOutOfRangeException(nameof(mode))
    };
}
