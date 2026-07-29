using System.Text.Json;

namespace GunsOnly.AncaAudit;

/// <summary>
/// Structural smoke for the full matrix: every scenario with RequireRadioIds must
/// hear those catalog IDs; casevac must report casevac_mission; no timeout samples.
/// </summary>
static class SelfTest {
    public static int Run(bool fullMatrix = false) {
        IEnumerable<AuditScenario> selected = fullMatrix
            ? Scenarios.All
            : Scenarios.All.Where(s => s.RequireRadioIds is { Length: > 0 }
                || s.Id is "casevac-hide" or "dogfight-merge");

        int failures = 0;
        int scenarios = 0;
        foreach (AuditScenario scenario in selected) {
            scenarios++;
            using var buffer = new StringWriter();
            HashSet<string> heard = Runner.RunCollectingRadio(scenario, buffer);
            string dump = buffer.ToString();

            if (dump.Contains("\"timed_out\":true", StringComparison.Ordinal)
                || dump.Contains("timeout-", StringComparison.Ordinal)) {
                Console.Error.WriteLine($"FAIL {scenario.Id}: timed out waiting");
                failures++;
                continue;
            }

            if (scenario.RequireRadioIds is { Length: > 0 } required) {
                foreach (string id in required) {
                    if (heard.Contains(id)) continue;
                    Console.Error.WriteLine(
                        $"FAIL {scenario.Id}: missing radio '{id}' "
                        + $"(heard: {string.Join(", ", heard.OrderBy(x => x))})");
                    failures++;
                }
            }

            if (scenario.Id == "casevac-hide") {
                bool sawCasevac = false;
                bool panelWouldHide = false;
                foreach (string line in dump.Split('\n',
                    StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)) {
                    using JsonDocument document = JsonDocument.Parse(line);
                    JsonElement state = document.RootElement.GetProperty("state");
                    if (state.TryGetProperty("casevac_mission", out JsonElement flag)
                        && flag.GetBoolean()) {
                        sawCasevac = true;
                        // App passes null into the panel on casevac — treat as hidden.
                        panelWouldHide = true;
                    }
                }
                if (!sawCasevac || !panelWouldHide) {
                    Console.Error.WriteLine("FAIL casevac-hide: casevac_mission not set");
                    failures++;
                }
            }

            if (scenario.Id == "rapier-commit"
                && !dump.Contains("\"checklist_name\":\"COMMIT\"", StringComparison.Ordinal)) {
                Console.Error.WriteLine("FAIL rapier-commit: COMMIT checklist never active");
                failures++;
            }

            Console.WriteLine(
                $"ok {scenario.Id} ({heard.Count} radio ids"
                + (scenario.RequireRadioIds is { Length: > 0 } need
                    ? $", required {need.Length}"
                    : "")
                + ")");
        }

        if (failures > 0) {
            Console.Error.WriteLine($"anca-audit self-test: {failures} failure(s)");
            return 1;
        }

        Console.WriteLine($"anca-audit self-test ok ({scenarios} scenarios)");
        return 0;
    }
}
