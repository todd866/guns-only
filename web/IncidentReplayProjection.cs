using System.Globalization;
using System.Text;
using GunsOnly.Sim;

namespace GunsOnly.Web;

/// <summary>Trim-safe compact JSON projection for a one-shot authoritative incident clip.</summary>
public static class IncidentReplayProjection {
    public const string Schema = "carrier-incident-replay.v4";
    public const int FieldCount = 76;
    public const int EventFieldCount = 15;

    public static string ToJson(IncidentReplayClip clip) {
        ArgumentNullException.ThrowIfNull(clip);
        IReadOnlyList<IncidentReplaySample> samples = clip.Samples;
        if (samples.Count == 0) return "{}";
        IncidentReplaySample incident = samples[Math.Clamp(
            clip.IncidentSampleIndex, 0, samples.Count - 1)];
        var json = new StringBuilder(768 + samples.Count * 420 + clip.Events.Count * 180);
        json.Append("{\"schema\":\"").Append(Schema)
            .Append("\",\"authoritative\":true")
            .Append(",\"id\":").Append(clip.Id)
            .AppendFormat(CultureInfo.InvariantCulture,
                ",\"sample_rate_hz\":{0:F1}", clip.NominalSampleRateHz)
            .Append(",\"incident_index\":").Append(clip.IncidentSampleIndex)
            .Append(",\"arrestment_profile\":");
        AppendJsonString(json, incident.ArrestmentProfileId);
        json.Append(",\"touchdown_assessment\":{\"profile\":");
        AppendJsonString(json, incident.TouchdownAssessmentProfileId);
        json.Append(",\"version\":")
            .Append(incident.TouchdownAssessmentProfileVersion)
            .AppendFormat(CultureInfo.InvariantCulture,
                ",\"limits\":{{\"min_sink_fpm\":{0:F1},\"hard_sink_fpm\":{1:F1},\"max_sink_fpm\":{2:F1},\"max_lineup_m\":{3:F2},\"min_ias_kts\":{4:F2},\"max_ias_kts\":{5:F2},\"max_closure_kts\":{6:F2},\"on_speed_aoa_deg\":{7:F3},\"max_aoa_error_deg\":{8:F3}}},\"adaptive_target\":",
                incident.TouchdownMinimumSinkRateMps * 196.8503937007874,
                incident.TouchdownHardSinkRateMps * 196.8503937007874,
                incident.TouchdownMaximumSinkRateMps * 196.8503937007874,
                incident.TouchdownMaximumLineupM,
                incident.TouchdownMinimumIndicatedAirspeedMps * AirData.MpsToKnots,
                incident.TouchdownMaximumIndicatedAirspeedMps * AirData.MpsToKnots,
                incident.TouchdownMaximumClosureMps * AirData.MpsToKnots,
                incident.TouchdownOnSpeedAoaRad * 57.29577951308232,
                incident.TouchdownMaximumAoaErrorRad * 57.29577951308232);
        bool hasAdaptiveTarget = incident.TouchdownAdaptiveDifficultyLevel > 0
            && double.IsFinite(incident.TouchdownAdaptiveMaximumSinkRateMps)
            && double.IsFinite(incident.TouchdownAdaptiveMaximumLineupM)
            && double.IsFinite(incident.TouchdownAdaptiveMinimumIndicatedAirspeedMps)
            && double.IsFinite(incident.TouchdownAdaptiveMaximumIndicatedAirspeedMps);
        if (hasAdaptiveTarget) {
            json.AppendFormat(CultureInfo.InvariantCulture,
                "{{\"level\":{0},\"max_sink_fpm\":{1:F1},\"max_lineup_m\":{2:F2},\"min_ias_kts\":{3:F2},\"max_ias_kts\":{4:F2}}}",
                incident.TouchdownAdaptiveDifficultyLevel,
                incident.TouchdownAdaptiveMaximumSinkRateMps * 196.8503937007874,
                incident.TouchdownAdaptiveMaximumLineupM,
                incident.TouchdownAdaptiveMinimumIndicatedAirspeedMps
                    * AirData.MpsToKnots,
                incident.TouchdownAdaptiveMaximumIndicatedAirspeedMps
                    * AirData.MpsToKnots);
        } else {
            json.Append("null");
        }
        json.Append("},\"event_fields\":[\"t\",\"tick\",\"sequence\",\"type\",\"source\",\"target\",\"count\",\"outcome\",\"surface\",\"px\",\"py\",\"pz\",\"vx\",\"vy\",\"vz\"],\"events\":[");
        for (int i = 0; i < clip.Events.Count; i++) {
            if (i != 0) json.Append(',');
            IncidentReplayEvent replayEvent = clip.Events[i];
            SessionEvent sessionEvent = replayEvent.Event;
            json.AppendFormat(CultureInfo.InvariantCulture,
                "[{0:F4},{1},{2},{3},{4},{5},{6},{7},{8},{9:F3},{10:F3},{11:F3},{12:F3},{13:F3},{14:F3}]",
                replayEvent.TimeSeconds - incident.TimeSeconds,
                sessionEvent.Tick,
                sessionEvent.Sequence,
                (int)sessionEvent.Type,
                (int)sessionEvent.Source,
                (int)sessionEvent.Target,
                sessionEvent.Count,
                (int)sessionEvent.Outcome,
                (int)sessionEvent.Surface,
                replayEvent.Position.X, replayEvent.Position.Y, replayEvent.Position.Z,
                replayEvent.Velocity.X, replayEvent.Velocity.Y, replayEvent.Velocity.Z);
        }
        json.Append("],\"fields\":[\"t\",\"tick\",\"px\",\"py\",\"pz\",\"pfx\",\"pfy\",\"pfz\",\"plx\",\"ply\",\"plz\",\"kias\",\"gs_kts\",\"sink_fpm\",\"aoa_deg\",\"closure_kts\",\"deck_along_m\",\"deck_cross_m\",\"deck_height_m\",\"cx\",\"cy\",\"cz\",\"carrier_heading_rad\",\"deck_pitch_deg\",\"deck_len_m\",\"deck_width_m\",\"gear_handle\",\"gear_fraction\",\"gear_locked\",\"flap_lever\",\"flap_deg\",\"recovery\",\"hook\",\"wire\",\"terminal\",\"surface\",\"event_sequence\",\"event_type\",\"event_surface\",\"throttle_command\",\"engine_power\",\"gamma_deg\",\"vertical_speed_fpm\",\"nz\",\"tx\",\"ty\",\"tz\",\"ax\",\"ay\",\"az\",\"g_demand\",\"bank_target_deg\",\"rudder\",\"roll_control\",\"has_pitch_command\",\"pitch_command_deg\",\"gear_nose\",\"gear_left\",\"gear_right\",\"gear_nose_indication\",\"gear_left_indication\",\"gear_right_indication\",\"flap_left_deg\",\"flap_right_deg\",\"arrest_failure_reason\",\"arrest_initial_energy_mj\",\"arrest_absorbed_energy_mj\",\"arrest_remaining_energy_mj\",\"arrest_effective_capacity_mj\",\"arrest_peak_load_kn\",\"arrest_max_line_load_kn\",\"arrest_initial_closure_kts\",\"carrier_solid\",\"touchdown_grade\",\"touchdown_deviations\",\"touchdown_primary_correction\"],\"samples\":[");
        for (int i = 0; i < samples.Count; i++) {
            if (i != 0) json.Append(',');
            IncidentReplaySample sample = samples[i];
            Vec3D forward = sample.Player.BodyAttitude.Rotate(new Vec3D(0.0, 0.0, 1.0));
            Vec3D up = sample.Player.BodyAttitude.Rotate(new Vec3D(0.0, 1.0, 0.0));
            json.AppendFormat(CultureInfo.InvariantCulture,
                "[{0:F4},{1},{2:F3},{3:F3},{4:F3},{5:F6},{6:F6},{7:F6},{8:F6},{9:F6},{10:F6},{11:F2},{12:F2},{13:F1},{14:F2},{15:F2},{16:F2},{17:F2},{18:F2},{19:F3},{20:F3},{21:F3},{22:F6},{23:F3},{24:F1},{25:F1},{26},{27:F4},{28},{29},{30:F2},{31},{32},{33},{34},{35},{36},{37},{38},{39:F3},{40:F3},{41:F2},{42:F1},{43:F3},{44:F3},{45:F3},{46:F3},{47:F3},{48:F3},{49:F3},{50:F3},{51:F2},{52:F3},{53:F3},{54},{55:F2},{56:F4},{57:F4},{58:F4},{59},{60},{61},{62:F2},{63:F2}",
                sample.TimeSeconds - incident.TimeSeconds,
                sample.Tick,
                sample.Player.Position.X, sample.Player.Position.Y, sample.Player.Position.Z,
                forward.X, forward.Y, forward.Z,
                up.X, up.Y, up.Z,
                sample.IndicatedAirspeedKts, sample.GroundSpeedKts,
                sample.DeckSinkRateMps * 196.8503937007874,
                sample.AngleOfAttackDeg,
                sample.DeckClosureMps * AirData.MpsToKnots,
                sample.DeckAlongM, sample.DeckCrossM, sample.DeckHeightM,
                sample.CarrierPosition.X, sample.CarrierPosition.Y, sample.CarrierPosition.Z,
                sample.CarrierHeadingRad, sample.CarrierDeckPitchRad * 57.29577951308232,
                sample.CarrierDeckLengthM, sample.CarrierDeckWidthM,
                sample.GearHandle == LandingGearHandle.Down ? 1 : 0,
                sample.GearFraction, sample.GearDownAndLocked ? 1 : 0,
                sample.FlapLever switch {
                    WingFlapLever.Up => -1,
                    WingFlapLever.Down => 1,
                    _ => 0
                },
                sample.FlapDegrees,
                (int)sample.Recovery, (int)sample.Hook, sample.Wire,
                (int)sample.TerminalState, (int)sample.Surface,
                sample.EventSequence, (int)sample.EventType, (int)sample.EventSurface,
                sample.ThrottleCommand, sample.EnginePowerFraction,
                sample.FlightPathAngleDeg, sample.VerticalSpeedFpm,
                sample.NormalLoadFactor,
                sample.CarrierTouchdownPoint.X, sample.CarrierTouchdownPoint.Y,
                sample.CarrierTouchdownPoint.Z,
                sample.CarrierApproachCuePoint.X, sample.CarrierApproachCuePoint.Y,
                sample.CarrierApproachCuePoint.Z,
                sample.CommandGDemand, sample.CommandBankTargetDeg,
                sample.CommandRudder, sample.CommandRollControl,
                sample.HasCommandedPitch ? 1 : 0, sample.CommandedPitchDeg,
                sample.NoseGearFraction, sample.LeftGearFraction,
                sample.RightGearFraction,
                (int)sample.NoseGearIndication, (int)sample.LeftGearIndication,
                (int)sample.RightGearIndication,
                sample.LeftFlapDegrees, sample.RightFlapDegrees);
            json.AppendFormat(CultureInfo.InvariantCulture,
                ",{0},{1:F4},{2:F4},{3:F4},{4:F4},{5:F2},{6:F2},{7:F2},{8},{9},{10},{11}]",
                (int)sample.ArrestmentFailureReason,
                sample.ArrestmentInitialEnergyJ / 1_000_000.0,
                sample.ArrestmentAbsorbedEnergyJ / 1_000_000.0,
                sample.ArrestmentRemainingEnergyJ / 1_000_000.0,
                sample.ArrestmentEffectiveCapacityJ / 1_000_000.0,
                sample.ArrestmentPeakLoadN / 1000.0,
                sample.ArrestmentMaximumLineLoadN / 1000.0,
                sample.ArrestmentInitialClosureMps * AirData.MpsToKnots,
                (int)sample.CarrierSolid,
                (int)sample.TouchdownGrade,
                (int)sample.TouchdownDeviations,
                (int)sample.TouchdownPrimaryCorrection);
        }
        json.Append("]}");
        return json.ToString();
    }

    static void AppendJsonString(StringBuilder json, string? value) {
        json.Append('"');
        foreach (char character in value ?? "") {
            switch (character) {
                case '"': json.Append("\\\""); break;
                case '\\': json.Append("\\\\"); break;
                case '\b': json.Append("\\b"); break;
                case '\f': json.Append("\\f"); break;
                case '\n': json.Append("\\n"); break;
                case '\r': json.Append("\\r"); break;
                case '\t': json.Append("\\t"); break;
                default:
                    if (character < 0x20)
                        json.Append("\\u").Append(((int)character).ToString("x4"));
                    else
                        json.Append(character);
                    break;
            }
        }
        json.Append('"');
    }
}
