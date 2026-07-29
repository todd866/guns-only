using System.Text.Json;
using System.Text.Json.Serialization;

namespace GunsOnly.Sim;

/// <summary>
/// Curated Open Segment Place catalog. The embedded JSON is kept byte-synced with
/// <c>content/packs/ukraine-modern/environment/mesh/free-fly-places.v1.json</c> (and the wwwroot
/// copy) so WASM does not depend on filesystem pack IO.
/// </summary>
public static class MeshPlaceCatalog {
    public const string FreeFlyCatalogId = "mesh-catalog.ukraine-modern.free-fly.v1";

    // Keep in sync with content/packs/ukraine-modern/environment/mesh/free-fly-places.v1.json
    const string FreeFlyPlacesJson = """
{
  "schemaVersion": "1.0.0",
  "catalogId": "mesh-catalog.ukraine-modern.free-fly.v1",
  "places": [
    {
      "placeId": "place.ukraine.crimea-coast-survey.v1",
      "displayName": "Crimea coast survey",
      "eastM": -320000,
      "northM": -390000,
      "role": "destination"
    },
    {
      "placeId": "place.ukraine.soniachne-clinic-a.v1",
      "displayName": "Soniachne clinic A",
      "eastM": -4208,
      "northM": 4096,
      "upM": 212.5,
      "role": "destination"
    },
    {
      "placeId": "place.ukraine.dnipro-bend-survey.v1",
      "displayName": "Dnipro bend survey",
      "eastM": -180000,
      "northM": 40000,
      "role": "destination"
    },
    {
      "placeId": "place.ukraine.quiet-ridge-label.v1",
      "displayName": "Quiet ridge",
      "eastM": 25000,
      "northM": -15000,
      "role": "landmark"
    }
  ]
}
""";

    static readonly JsonSerializerOptions JsonOptions = new() {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
    };

    public static IReadOnlyList<MeshPlace> FreeFlyPlaces { get; } = Parse(FreeFlyPlacesJson);

    public static IReadOnlyList<MeshPlace> Parse(string json) {
        ArgumentException.ThrowIfNullOrWhiteSpace(json);
        CatalogDocument? document = JsonSerializer.Deserialize<CatalogDocument>(json, JsonOptions)
            ?? throw new InvalidOperationException("Mesh place catalog JSON deserialized to null.");
        if (!string.Equals(document.SchemaVersion, "1.0.0", StringComparison.Ordinal))
            throw new InvalidOperationException(
                $"Unsupported Mesh catalog schema {document.SchemaVersion}.");
        if (document.Places is null || document.Places.Count == 0)
            throw new InvalidOperationException("Mesh place catalog has no places.");

        var places = new List<MeshPlace>(document.Places.Count);
        foreach (CatalogPlace entry in document.Places) {
            if (string.IsNullOrWhiteSpace(entry.PlaceId)
                || string.IsNullOrWhiteSpace(entry.DisplayName)
                || !double.IsFinite(entry.EastM)
                || !double.IsFinite(entry.NorthM))
                throw new InvalidOperationException("Mesh place entry is incomplete.");
            places.Add(new MeshPlace(
                entry.PlaceId.Trim(),
                entry.DisplayName.Trim(),
                entry.EastM,
                entry.NorthM,
                entry.UpM is { } up && double.IsFinite(up) ? up : null,
                ParseRole(entry.Role)));
        }
        return places;
    }

    static MeshPlaceRole ParseRole(string? role) => (role ?? "").Trim().ToLowerInvariant() switch {
        "home" => MeshPlaceRole.Home,
        "destination" => MeshPlaceRole.Destination,
        "landmark" => MeshPlaceRole.Landmark,
        "scenery_anchor" => MeshPlaceRole.SceneryAnchor,
        "procedure_fix" => MeshPlaceRole.ProcedureFix,
        _ => throw new InvalidOperationException($"Unknown Mesh place role '{role}'."),
    };

    sealed class CatalogDocument {
        [JsonPropertyName("schemaVersion")]
        public string? SchemaVersion { get; set; }
        [JsonPropertyName("catalogId")]
        public string? CatalogId { get; set; }
        [JsonPropertyName("places")]
        public List<CatalogPlace>? Places { get; set; }
    }

    sealed class CatalogPlace {
        [JsonPropertyName("placeId")]
        public string? PlaceId { get; set; }
        [JsonPropertyName("displayName")]
        public string? DisplayName { get; set; }
        [JsonPropertyName("eastM")]
        public double EastM { get; set; }
        [JsonPropertyName("northM")]
        public double NorthM { get; set; }
        [JsonPropertyName("upM")]
        public double? UpM { get; set; }
        [JsonPropertyName("role")]
        public string? Role { get; set; }
    }
}
