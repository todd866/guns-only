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

        EngineDeckSample? engineSl = null;
        if (subject.Propulsion == PropulsionModelKind.TurboRamjetPublicDataSurrogate) {
            engineSl = EngineDeck.SampleTurboRamjet(
                subject.Air, subject.Air.MaxThrustFraction, altitudeM: 0.0, mach: 0.0);
        }

        double? energyAero = null;
        double? energySustained = null;
        if (ProgramRequests(program, "energy-game-gap")) {
            double altM = 10_000.0 * 0.3048;
            double rho = StandardAtmosphere1976.Instance.Sample(altM).DensityKgM3;
            // Corner-ish: ~467 kt class band used in the Sabre fixture / drone brief.
            double speed = 467.0 * 0.514444;
            double q = 0.5 * rho * speed * speed;
            double thrustAb = subject.Air.ThrustMaxN * subject.Air.MaxThrustFraction;
            double aero = PointPerformance.AeroMaxG(subject.Air.MassKg, subject.Air, q);
            double sustained = PointPerformance.SustainedG(
                subject.Air.MassKg, subject.Air, q, thrustAb);
            energyAero = aero;
            energySustained = sustained;
            double gap = aero - sustained;
            double minGap = identity.MinSustainedVsAeroGGap;
            if (gap < minGap) {
                findings.Add(new FlightTestFinding(
                    "energy-game-gap", true,
                    $"AeroMaxG−SustainedG = {gap:F2} G < Identity min {minGap:F2} G at 10k ft / 467 kt"));
            }
        }

        if (ProgramRequests(program, "ram-light-band")
            && subject.Propulsion == PropulsionModelKind.TurboRamjetPublicDataSurrogate) {
            double fl400M = 40_000.0 * 0.3048;
            EngineDeckSample sample = EngineDeck.SampleTurboRamjet(
                subject.Air, subject.Air.MaxThrustFraction, fl400M, mach: 1.5);
            double total = sample.Fractions.Total;
            double ramShare = total > 1e-9 ? sample.Fractions.Ramjet / total : 0.0;
            if (ramShare >= 0.1) {
                findings.Add(new FlightTestFinding(
                    "ram-light-band", true,
                    $"Ram share {ramShare:P1} of available thrust at M1.5/FL400 (≥ 10%)"));
            }
        }

        ClimbHoldResult? climb = null;
        if (program.Points.Any(p => p.Id == "ab-climb-through-m1")
            || ProgramRequests(program, "ab-climb-through-m1")) {
            climb = DynamicHolds.AbClimbThroughMach1(subject.Air);
            double cap = identity.MaxClimbGammaDegWhileAcceleratingThroughMach1;
            if (cap > 0.0 && climb.Value.MaxGammaDegWhileAccelerating > cap) {
                findings.Add(new FlightTestFinding(
                    "ab-climb-through-m1", true,
                    $"Max γ while accelerating through M1 band = {climb.Value.MaxGammaDegWhileAccelerating:F1}° > cap {cap:F0}° "
                    + $"(M{climb.Value.MachAtMaxGamma:F2}, {climb.Value.AltFtAtMaxGamma:F0} ft)"));
            }
        }

        findings.Add(MissionClosure.EvaluateAdvisory(subject));

        bool passed = findings.All(f => !f.Blocking);
        return new FlightTestReport(
            subject.Id, program.Id, program.Version,
            passed, identity, findings,
            Climb: climb,
            EngineSampleSeaLevelAb: engineSl,
            EnergyAeroMaxG: energyAero,
            EnergySustainedG: energySustained);
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
