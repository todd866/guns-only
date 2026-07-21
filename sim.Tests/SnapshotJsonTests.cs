using GunsOnly.Web;

namespace GunsOnly.Sim.Tests;

// Exercises the flat browser snapshot's JSON primitives (SnapshotJson, linked from ../web). The
// browser parses WebBridge.GetState() every frame; a single unescaped quote/backslash/control char
// in an author- or content-pack-supplied field, or a NaN/Infinity double, produces invalid JSON and
// fatals the whole session. These guard that boundary so the arcade pivot can safely author beat
// names, cues, and mission display names.
public class SnapshotJsonTests {
    [Fact]
    public void JsonString_escapes_quotes_and_backslashes_so_a_pack_authored_name_cannot_break_parse() {
        Assert.Equal("\"Raid \\\"Alpha\\\" \\\\ back\"",
            SnapshotJson.JsonString("Raid \"Alpha\" \\ back"));
    }

    [Theory]
    [InlineData("\n", "\"\\n\"")]
    [InlineData("\r", "\"\\r\"")]
    [InlineData("\t", "\"\\t\"")]
    [InlineData("\b", "\"\\b\"")]
    [InlineData("\f", "\"\\f\"")]
    public void JsonString_escapes_control_whitespace(string input, string expected) =>
        Assert.Equal(expected, SnapshotJson.JsonString(input));

    [Fact]
    public void JsonString_unicode_escapes_low_control_characters() =>
        Assert.Equal("\"\\u0001\"", SnapshotJson.JsonString(((char)1).ToString()));

    [Fact]
    public void JsonString_null_becomes_an_empty_quoted_string() =>
        Assert.Equal("\"\"", SnapshotJson.JsonString(null));

    [Fact]
    public void FiniteNumberJson_emits_null_for_non_finite_so_the_snapshot_stays_valid_json() {
        Assert.Equal("null", SnapshotJson.FiniteNumberJson(double.NaN));
        Assert.Equal("null", SnapshotJson.FiniteNumberJson(double.PositiveInfinity));
        Assert.Equal("null", SnapshotJson.FiniteNumberJson(double.NegativeInfinity));
        Assert.Equal("1.5000", SnapshotJson.FiniteNumberJson(1.5));
    }

    [Fact]
    public void NullableNumberJson_emits_null_for_nan_and_missing() {
        Assert.Equal("null", SnapshotJson.NullableNumberJson(null));
        Assert.Equal("null", SnapshotJson.NullableNumberJson(double.NaN));
        Assert.Equal("2.50", SnapshotJson.NullableNumberJson(2.5));
    }

    [Fact]
    public void An_escaped_free_form_field_round_trips_through_a_real_json_parser() {
        string weird = "ARRESTMENT FAILED — quote\" backslash\\ newline\n bell" + (char)7 + " end";
        string json = "{\"context\":" + SnapshotJson.JsonString(weird) + "}";
        using var doc = System.Text.Json.JsonDocument.Parse(json);
        Assert.Equal(weird, doc.RootElement.GetProperty("context").GetString());
    }
}
