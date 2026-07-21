using System.Globalization;
using System.Text;

namespace GunsOnly.Web;

/// <summary>
/// Plain, renderer-independent JSON value primitives for the flat browser state contract. This type
/// deliberately carries no browser or JS-interop attributes so the projection can be unit-tested as
/// ordinary .NET (sim.Tests links this file, mirroring IncidentReplayProjection).
///
/// Contract: every string field in the snapshot must pass through <see cref="JsonString"/> so an
/// author- or content-pack-supplied value containing a quote, backslash, or control character cannot
/// break <c>JSON.parse</c> on the browser side (a single bad char fatals the whole session). Every
/// double must pass through a finite guard so a NaN/Infinity never emits an invalid JSON token.
/// </summary>
public static class SnapshotJson {
    public static string NullableNumberJson(double? value) => value is { } number
        && double.IsFinite(number)
            ? number.ToString("F2", CultureInfo.InvariantCulture)
            : "null";

    public static string FiniteNumberJson(double value) => double.IsFinite(value)
        ? value.ToString("F4", CultureInfo.InvariantCulture)
        : "null";

    public static string JsonString(string? value) {
        var json = new StringBuilder((value?.Length ?? 0) + 2);
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
        return json.Append('"').ToString();
    }
}
