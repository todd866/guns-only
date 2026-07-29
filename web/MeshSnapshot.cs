using System.Text;
using GunsOnly.Sim;

namespace GunsOnly.Web;

/// <summary>Shared Mesh projection helpers for hot/cold snapshot writers.</summary>
static class MeshSnapshot {
    public static MeshNavSolution Project(
        SimulationSession session,
        in Vec3D simulationPosition,
        in Vec3D groundVelocity,
        double displayHeadingRad) {
        if (session.MeshNav.Active is not { } active
            || session.MeshNav.HomePlate is not { } homePlace)
            return default;

        Vec3D home = new(homePlace.EastM, homePlace.UpM ?? 0.0, homePlace.NorthM);
        return MeshNavProjection.ProjectSolution(
            session.PlayerFuel,
            simulationPosition,
            groundVelocity,
            displayHeadingRad,
            active,
            home,
            session.Beat.RecoveryPlan?.RequiredLandingReserveLb);
    }

    public static string CatalogJson(SimulationSession session) {
        var sb = new StringBuilder(256);
        sb.Append('[');
        bool first = true;
        MeshNavTransitMode mode = session.MeshNav.Mode;
        foreach (MeshPlace place in session.MeshNav.Catalog) {
            bool selectable = MeshSelectability.CanSelect(place.Role, mode, phaseAllows: true);
            if (!first) sb.Append(',');
            first = false;
            sb.Append('{')
                .Append("\"id\":").Append(SnapshotJson.JsonString(place.PlaceId)).Append(',')
                .Append("\"name\":").Append(SnapshotJson.JsonString(place.DisplayName)).Append(',')
                .Append("\"east_m\":").Append(place.EastM.ToString("F1")).Append(',')
                .Append("\"north_m\":").Append(place.NorthM.ToString("F1")).Append(',')
                .Append("\"role\":").Append(SnapshotJson.JsonString(RoleToken(place.Role))).Append(',')
                .Append("\"selectable\":").Append(selectable ? "true" : "false")
                .Append('}');
        }
        sb.Append(']');
        return sb.ToString();
    }

    public static string TransitModeToken(MeshNavTransitMode mode) => mode switch {
        MeshNavTransitMode.OpenSegment => "open_segment",
        _ => "mission_gated",
    };

    public static string RoleToken(MeshPlaceRole role) => role switch {
        MeshPlaceRole.Home => "home",
        MeshPlaceRole.Destination => "destination",
        MeshPlaceRole.Landmark => "landmark",
        MeshPlaceRole.SceneryAnchor => "scenery_anchor",
        MeshPlaceRole.ProcedureFix => "procedure_fix",
        _ => "landmark",
    };
}
