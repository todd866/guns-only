using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Motorcycle;

namespace GunsOnly.Web;

/// <summary>
/// Presentation-oriented JSON projection of the weekend-ride snapshot. This type carries no
/// browser interop attributes, owns no simulation state, and is linked into sim.Tests so the
/// helmet-cam JSON boundary can be exercised as ordinary .NET.
/// </summary>
internal static class MotorcycleSnapshotProjection
{
    public static string BuildStateJson(
        WeekendRideMissionRuntime runtime,
        MotorcycleControlMode controlMode) =>
        JsonSerializer.Serialize(BuildState(runtime, controlMode));

    static object BuildState(WeekendRideMissionRuntime runtime, MotorcycleControlMode controlMode)
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
            pitch_rad = snap.PitchRad,
            view_qw = view.W,
            view_qx = view.X,
            view_qy = view.Y,
            view_qz = view.Z,
            rider_lateral = snap.RiderLateral,
            rider_fore_aft = snap.RiderForeAft,
            gear = snap.Gear,
            clutch_mode = ClutchModeToken(snap.ClutchMode),
            control_mode = ControlModeToken(controlMode),
            clutch = snap.ClutchEngagement,
            clutch_engagement = snap.ClutchEngagement,
            rpm = snap.Rpm,
            engine_idle_rpm = YzfR1Definition.IdleRpm,
            engine_redline_rpm = YzfR1Definition.RedlineRpm,
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
            // The lap clock the rider can finally read: what the last one cost, the best
            // ridden clean, and how this one compares at the same point on the circuit.
            last_lap_s = runtime.LastLapSeconds,
            best_lap_s = runtime.BestLapSeconds,
            delta_s = runtime.DeltaToBestSeconds,
            lap_valid = runtime.CurrentLapValid,
            sector_s = runtime.SectorSeconds,
            best_sector_s = runtime.BestSectorSeconds,
            off_track_s = snap.OffTrackSeconds,
            on_track = runtime.IsOnTrack,
            tipped = snap.IsTippedOver,
            tip_recovery_flash_s = snap.TipRecoveryFlashSeconds,
            phase = PhaseToken(snap.Phase),
        };
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
