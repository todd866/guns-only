using System.Globalization;
using System.Text;
using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Web;

namespace GunsOnly.AncaAudit;

/// <summary>
/// Compact ANCA + R/T wire subset mirrored from <c>SnapshotProjection</c>. Keeps the audit
/// tool free of the full snapshot / terrain embed graph while still feeding
/// <c>deriveAncaView</c> the same field names the browser panel reads.
/// </summary>
static class WireState {
    public static readonly string[] AncaKeys = [
        "ready", "finished", "beat", "t", "casevac_mission",
        "gear_handle", "gear_unsafe", "gear_warning_horn", "has_flaps",
        "flap_left_deg", "flap_right_deg",
        "fuel_to_home_estimate_lb", "recovery_display_name",
        "fuel_bingo", "fuel_joker", "fuel_minutes_to_joker",
        "radio_active", "radio_sequence", "radio_id", "radio_channel",
        "radio_frequency", "radio_speaker", "radio_callsign", "radio_text",
        "radio_voice", "radio_priority", "radio_started_s", "radio_ends_s",
        "checklist_active", "checklist_id", "checklist_done", "checklist_total",
        "checklist_name", "checklist_next",
        "rapier_mission_phase_name", "rapier_circuit_leg", "rapier_mission_cue",
        "player_weapons_authorized", "gun_ammo", "lifecycle",
    ];

    public static Dictionary<string, JsonElement> Capture(SimulationSession session) {
        using var document = JsonDocument.Parse(BuildJson(session));
        var map = new Dictionary<string, JsonElement>(AncaKeys.Length);
        foreach (string key in AncaKeys) {
            if (document.RootElement.TryGetProperty(key, out JsonElement value))
                map[key] = value.Clone();
        }
        return map;
    }

    public static string BuildJson(SimulationSession session) {
        bool ready = session.Lifecycle == SimulationSession.LifecycleState.Ready;
        bool finished = session.Lifecycle == SimulationSession.LifecycleState.Finished;
        if (session.CasevacMission) {
            var casevac = new StringBuilder(256);
            casevac.Append('{');
            AppendBool(casevac, "ready", ready);
            AppendBool(casevac, "finished", finished);
            AppendBool(casevac, "casevac_mission", true);
            casevac.Append("\"beat\":").Append(SnapshotJson.JsonString(session.Beat.Name))
                .Append(',');
            casevac.Append("\"t\":").Append(
                    session.TimeSeconds.ToString("F3", CultureInfo.InvariantCulture))
                .Append(',');
            casevac.Append("\"lifecycle\":")
                .Append(SnapshotJson.JsonString(session.Lifecycle.ToString().ToUpperInvariant()));
            casevac.Append('}');
            return casevac.ToString();
        }

        AircraftSim player = session.Player;
        AircraftState state = player.State;
        AirframeSystems systems = session.PlayerSystems;
        FuelModel fuel = session.PlayerFuel;
        BeatSetup beat = session.Beat;
        MissionRadioTransmission radio = session.MissionRadio;
        MissionChecklistStatus checklist = session.MissionChecklist;

        Vec3D position = state.Position;
        Vec3D groundVelocity = state.VelocityVector();
        double displayHeadingRad = state.Chi;
        RecoveryPlan? recoveryPlan = beat.RecoveryPlan;
        Vec3D? recoveryPoint = recoveryPlan?.Position
            ?? (session.Carrier is { } carrier ? carrier.Position : null);
        bool playerRtbActive = session.PlayerRtbActive;
        RecoveryNavigationProjection recoveryNavigation =
            session.ConventionalRunwayPhase == RunwayRecoveryPhase.Recovered
                ? fuel.ProjectCompletedRecovery(
                    position, displayHeadingRad, recoveryPlan?.RequiredLandingReserveLb)
                : recoveryPoint is { } home
                    ? fuel.ProjectRecoveryTo(
                        position, groundVelocity, displayHeadingRad, home,
                        recoveryPlan?.RequiredLandingReserveLb,
                        active: playerRtbActive || fuel.RtbAdvisory)
                    : RecoveryNavigationProjection.Unknown;

        var json = new StringBuilder(1024);
        json.Append('{');
        AppendBool(json, "ready", ready);
        AppendBool(json, "finished", finished);
        AppendBool(json, "casevac_mission", false);
        json.Append("\"beat\":").Append(SnapshotJson.JsonString(beat.Name)).Append(',');
        json.Append("\"t\":").Append(
                session.TimeSeconds.ToString("F3", CultureInfo.InvariantCulture))
            .Append(',');
        json.Append("\"lifecycle\":")
            .Append(SnapshotJson.JsonString(session.Lifecycle.ToString().ToUpperInvariant()))
            .Append(',');
        json.Append("\"gear_handle\":\"")
            .Append(systems.GearHandle == LandingGearHandle.Down ? "DOWN" : "UP")
            .Append("\",");
        AppendBool(json, "gear_unsafe", systems.GearUnsafeLight);
        AppendBool(json, "gear_warning_horn", systems.GearWarningHorn);
        AppendBool(json, "has_flaps", systems.PilotOperatedFlapsAvailable);
        json.Append("\"flap_left_deg\":")
            .Append(systems.LeftFlapDegrees.ToString("F2", CultureInfo.InvariantCulture))
            .Append(',');
        json.Append("\"flap_right_deg\":")
            .Append(systems.RightFlapDegrees.ToString("F2", CultureInfo.InvariantCulture))
            .Append(',');
        json.Append("\"fuel_to_home_estimate_lb\":")
            .Append(SnapshotJson.NullableNumberJson(recoveryNavigation.FuelToHomeEstimateLb))
            .Append(',');
        json.Append("\"recovery_display_name\":")
            .Append(SnapshotJson.JsonString(recoveryPlan?.DisplayName)).Append(',');
        AppendBool(json, "fuel_bingo", fuel.IsBingo);
        AppendBool(json, "fuel_joker", fuel.IsJoker);
        json.Append("\"fuel_minutes_to_joker\":")
            .Append(SnapshotJson.NullableNumberJson(fuel.MinutesToJoker)).Append(',');
        AppendBool(json, "radio_active", radio.Active);
        json.Append("\"radio_sequence\":").Append(radio.Sequence).Append(',');
        json.Append("\"radio_id\":").Append(SnapshotJson.JsonString(radio.Id)).Append(',');
        json.Append("\"radio_channel\":")
            .Append(SnapshotJson.JsonString(radio.ChannelLabel)).Append(',');
        json.Append("\"radio_frequency\":")
            .Append(SnapshotJson.JsonString(radio.FrequencyLabel)).Append(',');
        json.Append("\"radio_speaker\":")
            .Append(SnapshotJson.JsonString(radio.Speaker)).Append(',');
        json.Append("\"radio_callsign\":")
            .Append(SnapshotJson.JsonString(radio.Callsign)).Append(',');
        json.Append("\"radio_text\":").Append(SnapshotJson.JsonString(radio.Text)).Append(',');
        json.Append("\"radio_voice\":").Append(SnapshotJson.JsonString(radio.Voice)).Append(',');
        json.Append("\"radio_priority\":").Append((int)radio.Priority).Append(',');
        json.Append("\"radio_started_s\":")
            .Append(radio.StartedAtSeconds.ToString("F3", CultureInfo.InvariantCulture))
            .Append(',');
        json.Append("\"radio_ends_s\":")
            .Append(radio.EndsAtSeconds.ToString("F3", CultureInfo.InvariantCulture))
            .Append(',');
        AppendBool(json, "checklist_active", checklist.Active);
        json.Append("\"checklist_id\":").Append((int)checklist.Id).Append(',');
        json.Append("\"checklist_done\":").Append(checklist.Done).Append(',');
        json.Append("\"checklist_total\":").Append(checklist.Total).Append(',');
        json.Append("\"checklist_name\":")
            .Append(SnapshotJson.JsonString(checklist.Name)).Append(',');
        json.Append("\"checklist_next\":")
            .Append(SnapshotJson.JsonString(checklist.NextItem)).Append(',');
        json.Append("\"rapier_mission_phase_name\":")
            .Append(SnapshotJson.JsonString(session.RapierPhase.ToString().ToUpperInvariant()))
            .Append(',');
        json.Append("\"rapier_circuit_leg\":")
            .Append(SnapshotJson.JsonString(session.RapierCircuitLeg)).Append(',');
        json.Append("\"rapier_mission_cue\":")
            .Append(SnapshotJson.JsonString(session.RapierMissionCue)).Append(',');
        AppendBool(json, "player_weapons_authorized", session.PlayerWeaponsAuthorized);
        json.Append("\"gun_ammo\":").Append(session.PlayerGun.AmmoRemaining);
        json.Append('}');
        return json.ToString();
    }

    static void AppendBool(StringBuilder json, string key, bool value) {
        json.Append('"').Append(key).Append("\":").Append(value ? "true" : "false").Append(',');
    }
}
