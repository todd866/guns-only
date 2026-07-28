using System.Text.Json.Serialization;

namespace GunsOnly.Web;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.SnakeCaseLower,
    GenerationMode = JsonSourceGenerationMode.Serialization)]
[JsonSerializable(typeof(MedevacCommanderState))]
[JsonSerializable(typeof(MedevacDispatchResult))]
internal sealed partial class MedevacWebJsonContext : JsonSerializerContext;
