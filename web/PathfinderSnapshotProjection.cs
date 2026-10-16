using System.Globalization;
using System.Text;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Web;

/// Presentation bridge for the bounded PATHFINDERS relay state.  The simulation remains the
/// authority for transforms, leak state, kills and ROE; this type only shapes those values for
/// the renderer.  Footprint prediction is deliberately cached because it integrates a falling
/// body in 250 ms steps and must never run once per display frame.
internal static class PathfinderSnapshotProjection {
    const int MaximumRelays = 6;
    const double FootprintRefreshSeconds = 1.0;
    // Fictional First Light presentation setting: below the local ground horizon, visible above
    // the depressed horizon at FL650–700. No physical atmosphere constants are retuned.
    const double DawnSunElevationDegrees = -1.2;

    static PathfinderMission? _cachedMission;
    static double _cachedAtSeconds = double.NegativeInfinity;
    static int _cachedSelectedId;
    static bool _cachedSelectedActive;
    static PathfinderFootprint _cachedFootprint;
    static PathfinderFootprintClass _cachedClassification;

    internal readonly record struct HotState(
        bool Present, int SelectedId, double SunElevationDegrees,
        Vec3D Centre, double Radius, PathfinderFootprintClass Classification);

    public static string Json(SimulationSession session) {
        PathfinderMission? mission = session.Pathfinder;
        if (mission is null) return "\"pathfinder\":null,";

        HotState hot = Capture(mission);
        var json = new StringBuilder(4096);
        json.Append("\"pathfinder\":{");
        json.Append("\"selected_id\":").Append(mission.SelectedBalloonId).Append(',');
        json.Append("\"drone_selected\":").Append(session.PathfinderDroneSelected ? "true" : "false").Append(',');
        json.Append("\"gun_drones_remaining\":").Append(session.RapierDogfightingDronesRemaining).Append(',');
        json.Append("\"envelope_radius_m\":").Append(F(mission.Balloons.Count == 0
            ? 0.0 : PathfinderRelayCard.EnvelopeRadiusM)).Append(',');
        json.Append("\"sun_elevation_deg\":").Append(F(hot.SunElevationDegrees)).Append(',');
        json.Append("\"relays\":[");
        for (int i = 0; i < mission.Balloons.Count; i++) {
            if (i != 0) json.Append(',');
            PathfinderRelayBalloon relay = mission.Balloons[i];
            json.Append('{')
                .Append("\"id\":").Append(relay.Id).Append(',')
                .Append("\"position\":").Append(Point(relay.Position)).Append(',')
                .Append("\"gondola_position\":").Append(Point(relay.GondolaPosition)).Append(',')
                .Append("\"relay_active\":").Append(relay.RelayActive ? "true" : "false").Append(',')
                .Append("\"escaped\":").Append(relay.Escaped ? "true" : "false").Append(',')
                .Append("\"leak_fraction\":").Append(F(relay.LeakFraction)).Append(',')
                .Append("\"lift_loss_fraction\":").Append(F(relay.LiftLossFraction)).Append(',')
                .Append("\"debris\":");
            if (relay.Debris is null) json.Append("null");
            else json.Append("{\"position\":").Append(Point(relay.Debris.Position))
                .Append(",\"landed\":").Append(relay.Debris.Landed ? "true" : "false")
                .Append('}');
            json.Append('}');
        }
        json.Append("],\"selected_footprint\":");
        if (hot.SelectedId <= 0 || !mission.Balloons.Any(relay => relay.Id == hot.SelectedId))
            json.Append("null");
        else
            json.Append("{\"centre\":").Append(Point(hot.Centre))
                .Append(",\"radius_m\":").Append(F(hot.Radius))
                .Append(",\"classification\":").Append(SnapshotJson.JsonString(ClassToken(hot.Classification)))
                .Append('}');
        json.Append("},");
        AppendFlat(json, session, mission, hot);
        return json.ToString();
    }

    static void AppendFlat(StringBuilder json, SimulationSession session, PathfinderMission mission, HotState hot) {
        json.Append("\"pathfinder_present\":true,")
            .Append("\"pathfinder_selected_id\":").Append(hot.SelectedId).Append(',')
            .Append("\"pathfinder_drone_selected\":").Append(session.PathfinderDroneSelected ? "true" : "false").Append(',')
            .Append("\"pathfinder_gun_drones_remaining\":").Append(session.RapierDogfightingDronesRemaining).Append(',')
            .Append("\"pathfinder_sun_elevation_deg\":").Append(F(hot.SunElevationDegrees, 2)).Append(',')
            .Append("\"pathfinder_envelope_radius_m\":").Append(F(PathfinderRelayCard.EnvelopeRadiusM, 2)).Append(',')
            .Append("\"pathfinder_footprint_x\":").Append(F(hot.Centre.X, 3)).Append(',')
            .Append("\"pathfinder_footprint_y\":").Append(F(hot.Centre.Y, 3)).Append(',')
            .Append("\"pathfinder_footprint_z\":").Append(F(hot.Centre.Z, 3)).Append(',')
            .Append("\"pathfinder_footprint_radius_m\":").Append(F(hot.Radius, 2)).Append(',')
            .Append("\"pathfinder_footprint_class_code\":").Append((int)hot.Classification).Append(',');
        for (int index = 0; index < MaximumRelays; index++) {
            PathfinderRelayBalloon? relay = index < mission.Balloons.Count ? mission.Balloons[index] : null;
            Vec3D position = relay?.Position ?? Vec3D.Zero;
            Vec3D gondola = relay?.GondolaPosition ?? Vec3D.Zero;
            Vec3D debris = relay?.Debris?.Position ?? Vec3D.Zero;
            string prefix = $"pathfinder_r{index + 1}";
            json.Append(JsonNumber(prefix + "x", position.X, 3))
                .Append(JsonNumber(prefix + "y", position.Y, 3))
                .Append(JsonNumber(prefix + "z", position.Z, 3))
                .Append(JsonNumber(prefix + "gx", gondola.X, 3))
                .Append(JsonNumber(prefix + "gy", gondola.Y, 3))
                .Append(JsonNumber(prefix + "gz", gondola.Z, 3))
                .Append(JsonNumber(prefix + "_leak", relay?.LeakFraction ?? 0.0, 4))
                .Append(JsonNumber(prefix + "_lift_loss", relay?.LiftLossFraction ?? 0.0, 4))
                .Append(JsonBool(prefix + "_active", relay is not null && relay.RelayActive))
                .Append(JsonBool(prefix + "_escaped", relay?.Escaped == true))
                .Append(JsonBool(prefix + "_debris_present", relay?.Debris is not null))
                .Append(JsonNumber(prefix + "_dx", debris.X, 3))
                .Append(JsonNumber(prefix + "_dy", debris.Y, 3))
                .Append(JsonNumber(prefix + "_dz", debris.Z, 3))
                .Append(JsonBool(prefix + "_landed", relay?.Debris?.Landed == true));
        }
    }

    // The hot transport keeps positions and damage state frame-current without forcing a cold JSON
    // parse. Pose slots read the bounded actor collection directly; no per-frame actor arrays.
    internal static HotState Capture(PathfinderMission mission) {
        PathfinderRelayBalloon selected = mission.SelectedBalloon;
        bool force = !ReferenceEquals(_cachedMission, mission)
            || _cachedSelectedId != mission.SelectedBalloonId
            || _cachedSelectedActive != selected.RelayActive
            || mission.ElapsedSeconds - _cachedAtSeconds >= FootprintRefreshSeconds;
        if (force) {
            _cachedMission = mission;
            _cachedAtSeconds = mission.ElapsedSeconds;
            _cachedSelectedId = mission.SelectedBalloonId;
            _cachedSelectedActive = selected.RelayActive;
            PathfinderEngagement? engagement = mission.LastEngagement;
            if (!selected.RelayActive && engagement is { } last && last.BalloonId == selected.Id
                && last.Footprint is { } recorded) {
                _cachedFootprint = recorded;
                _cachedClassification = last.Classification;
            } else {
                _cachedFootprint = selected.PredictFootprint();
                _cachedClassification = _cachedFootprint.Classify(mission.Definition.PopulatedAreas);
            }
        }

        return new(true, mission.SelectedBalloonId, DawnSunElevationDegrees,
            _cachedFootprint.Centre, _cachedFootprint.RadiusM, _cachedClassification);
    }

    static string Point(Vec3D point) => "{\"x\":" + F(point.X) + ",\"y\":" + F(point.Y)
        + ",\"z\":" + F(point.Z) + "}";

    static string F(double value, int decimals = 3) => value.ToString($"F{decimals}", CultureInfo.InvariantCulture);

    static string JsonNumber(string name, double value, int decimals) =>
        $"\"{name}\":{F(value, decimals)},";

    static string JsonBool(string name, bool value) =>
        $"\"{name}\":{(value ? "true" : "false")},";

    static string ClassToken(PathfinderFootprintClass value) => value switch {
        PathfinderFootprintClass.Clear => "clear",
        PathfinderFootprintClass.Populated => "populated",
        _ => "unknown"
    };
}
