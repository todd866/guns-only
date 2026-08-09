using System.Text.Json;
using System.Text.Json.Serialization;

namespace GunsOnly.Sim.Motorcycle;

public readonly record struct WeekendRoutePointContract(
    [property: JsonPropertyName("x")] double X,
    [property: JsonPropertyName("y")] double Y,
    [property: JsonPropertyName("z")] double Z);

public readonly record struct WeekendRouteStartContract(
    [property: JsonPropertyName("x")] double X,
    [property: JsonPropertyName("y")] double Y,
    [property: JsonPropertyName("z")] double Z,
    [property: JsonPropertyName("heading_rad")] double HeadingRad);

/// <summary>
/// Versioned renderer-neutral route handoff shared by Web and Unity. Geometry is projected from
/// <see cref="PaintedCircuit"/> exactly once; renderers consume this DTO and never own a point list.
/// A future open-road route keeps the schema and changes RouteKind/Closed plus route-specific data.
/// </summary>
public sealed record WeekendRouteContract(
    [property: JsonPropertyName("schema")] string Schema,
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("mode")] string Mode,
    [property: JsonPropertyName("route_kind")] string RouteKind,
    [property: JsonPropertyName("closed")] bool Closed,
    [property: JsonPropertyName("track_width_m")] double TrackWidthM,
    [property: JsonPropertyName("pavement_half_width_m")] double PavementHalfWidthM,
    [property: JsonPropertyName("surface_elevation_m")] double SurfaceElevationM,
    [property: JsonPropertyName("circuit_length_m")] double CircuitLengthM,
    [property: JsonPropertyName("sector_gate_progress")] IReadOnlyList<double> SectorGateProgress,
    [property: JsonPropertyName("start")] WeekendRouteStartContract Start,
    [property: JsonPropertyName("paddock_access")] WeekendRouteStartContract PaddockAccess,
    [property: JsonPropertyName("centreline")] IReadOnlyList<WeekendRoutePointContract> Centreline)
{
    public const string CurrentSchema = "guns-only.weekend-route.v1";
    public const string TrackDayMode = "track-day";
    public const string ClosedCircuitRouteKind = "closed-circuit";

    public static WeekendRouteContract FromCircuit(PaintedCircuit circuit)
    {
        ArgumentNullException.ThrowIfNull(circuit);
        return new WeekendRouteContract(
            CurrentSchema,
            circuit.Id,
            TrackDayMode,
            ClosedCircuitRouteKind,
            Closed: true,
            circuit.TrackWidthM,
            circuit.PavementHalfWidthM,
            circuit.SurfaceElevationM,
            circuit.CircuitLengthM,
            Array.AsReadOnly(circuit.SectorGateProgressM.ToArray()),
            new WeekendRouteStartContract(
                circuit.StartFinishCentre.X,
                circuit.StartFinishCentre.Y,
                circuit.StartFinishCentre.Z,
                circuit.StartHeadingRad),
            new WeekendRouteStartContract(
                circuit.PaddockAccessPointWorldM.X,
                circuit.PaddockAccessPointWorldM.Y,
                circuit.PaddockAccessPointWorldM.Z,
                circuit.PaddockAccessHeadingRad),
            Array.AsReadOnly(circuit.Centreline
                .Select(point => new WeekendRoutePointContract(point.X, point.Y, point.Z))
                .ToArray()));
    }

    public string ToJson() => JsonSerializer.Serialize(this);
}
