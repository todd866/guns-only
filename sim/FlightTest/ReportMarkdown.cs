using System.Text;

namespace GunsOnly.Sim.FlightTest;

public static class ReportMarkdown {
    public static string Render(FlightTestReport report) {
        var sb = new StringBuilder();
        sb.AppendLine("# Flight-Test Report");
        sb.AppendLine();
        sb.AppendLine("This report is the physics contract for teaching sorties.");
        sb.AppendLine();
        sb.AppendLine($"**Subject:** `{report.SubjectId}` · **Program:** `{report.ProgramId}` v{report.ProgramVersion} · **Passed:** {report.Passed}");
        sb.AppendLine();

        sb.AppendLine("## Identity");
        sb.AppendLine();
        AirframeIdentity id = report.Identity;
        sb.AppendLine("| Field | Value |");
        sb.AppendLine("|---|---|");
        sb.AppendLine($"| Role | {id.Role} |");
        sb.AppendLine($"| Fuel-free mass (kg) | {id.FuelFreeMassKg:F0} |");
        sb.AppendLine($"| Gross mass (kg) | {id.GrossMassKg:F0} |");
        sb.AppendLine($"| Wing loading (kg/m²) | {id.WingLoadingKgM2:F1} |");
        sb.AppendLine($"| Dry T/W | {id.DryThrustToWeight:F3} |");
        sb.AppendLine($"| Augmented T/W | {id.AugmentedThrustToWeight:F3} |");
        sb.AppendLine($"| Skin limit (K) | {id.SkinTemperatureLimitK:F2} |");
        sb.AppendLine($"| Max γ through M1 (°) | {id.MaxClimbGammaDegWhileAcceleratingThroughMach1:F0} |");
        sb.AppendLine($"| Comparison family | {id.ComparisonFamily} |");
        sb.AppendLine($"| Source | {id.SourceDoc} |");
        sb.AppendLine();

        sb.AppendLine("## Engine");
        sb.AppendLine();
        if (report.EngineSampleSeaLevelAb is { } eng) {
            sb.AppendLine($"Sea-level static AB sample: lever {eng.Lever:F2}, "
                + $"net thrust {eng.Point.NetThrustN / 1000.0:F1} kN, "
                + $"turbine/ram fractions {eng.Fractions.Turbine:F3}/{eng.Fractions.Ramjet:F3}.");
        } else {
            sb.AppendLine("_No turbo-ramjet sample._");
        }
        sb.AppendLine();

        sb.AppendLine("## Energy");
        sb.AppendLine();
        if (report.EnergyAeroMaxG is { } aero && report.EnergySustainedG is { } sus) {
            sb.AppendLine($"10k ft / 467 kt band: aero-max G = {aero:F2}, sustained G = {sus:F2}, "
                + $"gap = {aero - sus:F2}.");
        } else {
            sb.AppendLine("_Energy spot not evaluated._");
        }
        sb.AppendLine();

        sb.AppendLine("## Flight-test points");
        sb.AppendLine();
        if (report.Climb is { } climb) {
            sb.AppendLine($"**ab-climb-through-m1:** max γ while accelerating = "
                + $"{climb.MaxGammaDegWhileAccelerating:F1}° "
                + $"(M{climb.MachAtMaxGamma:F2}, {climb.AltFtAtMaxGamma:F0} ft); "
                + $"peak aug T/W = {climb.PeakAugmentedThrustToWeight:F2}.");
        } else {
            sb.AppendLine("_No dynamic holds run._");
        }
        sb.AppendLine();

        sb.AppendLine("## Mission (advisory)");
        sb.AppendLine();
        FlightTestFinding? mission = report.Findings.FirstOrDefault(
            f => f.GateId.StartsWith("mission-", StringComparison.Ordinal));
        sb.AppendLine(mission?.Message ?? "_No mission finding._");
        sb.AppendLine();

        sb.AppendLine("## Findings");
        sb.AppendLine();
        if (report.Findings.Count == 0) {
            sb.AppendLine("_None._");
        } else {
            foreach (FlightTestFinding f in report.Findings) {
                string tag = f.Blocking ? "BLOCKING" : "advisory";
                sb.AppendLine($"- `{f.GateId}` ({tag}): {f.Message}");
            }
        }
        sb.AppendLine();
        return sb.ToString();
    }
}
