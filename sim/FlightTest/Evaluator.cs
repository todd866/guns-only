namespace GunsOnly.Sim.FlightTest;

public static class Evaluator {
    const double MassTolerance = 0.02;
    const double WingLoadingTolerance = 0.02;
    const double ThrustToWeightTolerance = 0.05;

    public static FlightTestReport Evaluate(
        AirframeUnderTest subject, FlightTestProgram program) {
        AirframeIdentity identity = subject.Identity
            ?? IdentityMeasurement.FromParams(subject.Air, inferred: true);
        AirframeIdentity measured = IdentityMeasurement.FromParams(subject.Air, inferred: false);
        var findings = new List<FlightTestFinding>();

        if (subject.Identity is not null) {
            CheckRelative(
                findings, "identity-mass", identity.GrossMassKg, measured.GrossMassKg,
                MassTolerance, "Gross mass");
            CheckRelative(
                findings, "identity-ws", identity.WingLoadingKgM2, measured.WingLoadingKgM2,
                WingLoadingTolerance, "Wing loading");
            CheckRelative(
                findings, "identity-tw-dry", identity.DryThrustToWeight, measured.DryThrustToWeight,
                ThrustToWeightTolerance, "Dry T/W");
            CheckRelative(
                findings, "identity-tw-augmented",
                identity.AugmentedThrustToWeight, measured.AugmentedThrustToWeight,
                ThrustToWeightTolerance, "Augmented T/W");
            if (identity.SkinTemperatureLimitK != measured.SkinTemperatureLimitK) {
                findings.Add(new FlightTestFinding(
                    "identity-skin", true,
                    $"Skin limit claim {identity.SkinTemperatureLimitK} K vs measured {measured.SkinTemperatureLimitK} K"));
            }
        }

        if (ProgramRequests(program, "tw-augmented-gross")
            && measured.AugmentedThrustToWeight > Programs.InterceptorTbccV1.FamilyAugmentedTwCap) {
            findings.Add(new FlightTestFinding(
                "tw-augmented-gross", true,
                $"Measured augmented T/W {measured.AugmentedThrustToWeight:F3} exceeds family cap {Programs.InterceptorTbccV1.FamilyAugmentedTwCap:F2}"));
        }

        if (identity.AugmentedThrustToWeight > Programs.InterceptorTbccV1.FamilyAugmentedTwCap) {
            findings.Add(new FlightTestFinding(
                "comparison-family-review", false,
                $"Identity augmented T/W {identity.AugmentedThrustToWeight:F3} exceeds family cap — ComparisonFamily must be revisited"));
        }

        bool passed = findings.All(f => !f.Blocking);
        return new FlightTestReport(
            subject.Id, program.Id, program.Version,
            passed, identity, findings);
    }

    static bool ProgramRequests(FlightTestProgram program, string gateId) =>
        program.Gates.Any(g => g.Id == gateId);

    static void CheckRelative(
        List<FlightTestFinding> findings, string gateId,
        double claimed, double measured, double tolerance, string label) {
        if (claimed == 0.0) {
            if (measured != 0.0) {
                findings.Add(new FlightTestFinding(
                    gateId, true, $"{label}: claim 0 vs measured {measured}"));
            }
            return;
        }
        double err = Math.Abs(measured - claimed) / Math.Abs(claimed);
        if (err > tolerance) {
            findings.Add(new FlightTestFinding(
                gateId, true,
                $"{label}: claim {claimed:G6} vs measured {measured:G6} (err {err:P1} > {tolerance:P0})"));
        }
    }
}
