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

    public static string ProcedureKindToken(RecoveryProcedureKind kind) => kind switch {
        RecoveryProcedureKind.Overhead => "overhead",
        RecoveryProcedureKind.DownwindRejoin => "downwind_rejoin",
        RecoveryProcedureKind.StraightIn => "straight_in",
        _ => "none",
    };

    public static string ProcedureKindLabel(RecoveryProcedureKind kind) => kind switch {
        RecoveryProcedureKind.Overhead => "OVERHEAD",
        RecoveryProcedureKind.DownwindRejoin => "DOWNWIND REJOIN",
        RecoveryProcedureKind.StraightIn => "STRAIGHT-IN",
        _ => "NONE",
    };

    public static string TourJson(SimulationSession session) {
        var sb = new StringBuilder(256);
        sb.Append('[');
        bool first = true;
        foreach (MeshActiveDest stop in session.MeshNav.Tour) {
            if (!first) sb.Append(',');
            first = false;
            sb.Append('{')
                .Append("\"is_place\":").Append(stop.IsPlace ? "true" : "false").Append(',')
                .Append("\"id\":").Append(SnapshotJson.JsonString(stop.PlaceId)).Append(',')
                .Append("\"name\":").Append(SnapshotJson.JsonString(stop.DisplayName)).Append(',')
                .Append("\"east_m\":").Append(stop.EastM.ToString("F1")).Append(',')
                .Append("\"north_m\":").Append(stop.NorthM.ToString("F1"))
                .Append('}');
        }
        sb.Append(']');
        return sb.ToString();
    }

    public static string RecoveryGatesJson(SimulationSession session) {
        var sb = new StringBuilder(256);
        sb.Append('[');
        bool first = true;
        int active = session.RecoveryProcedure.ActiveIndex;
        for (int i = 0; i < session.RecoveryProcedure.Gates.Count; i++) {
            RecoveryGate gate = session.RecoveryProcedure.Gates[i];
            if (!first) sb.Append(',');
            first = false;
            sb.Append('{')
                .Append("\"id\":").Append(SnapshotJson.JsonString(gate.Id)).Append(',')
                .Append("\"label\":").Append(SnapshotJson.JsonString(gate.Label)).Append(',')
                .Append("\"east_m\":").Append(gate.EastM.ToString("F1")).Append(',')
                .Append("\"north_m\":").Append(gate.NorthM.ToString("F1")).Append(',')
                .Append("\"up_m\":").Append(gate.UpM.ToString("F1")).Append(',')
                .Append("\"half_m\":").Append(gate.HalfM.ToString("F1")).Append(',')
                .Append("\"target_ktas\":").Append(gate.TargetKtas.ToString("F0")).Append(',')
                .Append("\"dirty\":").Append(gate.DirtyConfig ? "true" : "false").Append(',')
                .Append("\"active\":").Append(i == active ? "true" : "false")
                .Append('}');
        }
        sb.Append(']');
        return sb.ToString();
    }
}
