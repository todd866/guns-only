using GunsOnly.Sim;

namespace GunsOnly.Web;

/// Low-rate training metadata. All changing physical measurements remain in their existing
/// snapshot fields; this contract changes only at lifecycle/exercise-result edges.
internal static class PracticeSnapshotProjection {
    public static string Json(SimulationSession session) =>
        $"\"practice_exercise\":{SnapshotJson.JsonString(session.Practice?.Exercise.ToString().ToLowerInvariant() ?? "none")},"
        + $"\"practice_status\":{SnapshotJson.JsonString(session.Practice?.Status.ToString().ToLowerInvariant() ?? "none")},"
        + $"\"practice_completed\":{(session.Practice?.Completed == true ? "true" : "false")},";
}
