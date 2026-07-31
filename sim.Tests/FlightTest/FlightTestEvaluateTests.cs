using GunsOnly.Sim;
using GunsOnly.Sim.FlightTest;
using GunsOnly.Sim.FlightTest.Programs;

namespace GunsOnly.Sim.Tests.FlightTest;

public class FlightTestEvaluateTests {
    [Fact]
    public void EvaluateReturnsAReportWithSubjectId() {
        var subject = new AirframeUnderTest(
            Id: "rapier",
            Air: FlightModel.RapierPublicDataSurrogate,
            Propulsion: PropulsionModelKind.TurboRamjetPublicDataSurrogate);
        var program = new FlightTestProgram(
            Id: "interceptor-tbcc-v1",
            Version: "0",
            Gates: Array.Empty<FlightTestGate>(),
            Points: Array.Empty<FlightTestPoint>());

        FlightTestReport report = Evaluator.Evaluate(subject, program);

        Assert.Equal("rapier", report.SubjectId);
        Assert.Equal("interceptor-tbcc-v1", report.ProgramId);
    }

    [Fact]
    public void EvaluateOnRapierPassesTwAugmentedGross() {
        var subject = new AirframeUnderTest(
            "rapier",
            FlightModel.RapierPublicDataSurrogate,
            PropulsionModelKind.TurboRamjetPublicDataSurrogate,
            Identity: InterceptorTbccV1.RapierAspirationalIdentity);
        FlightTestReport report = Evaluator.Evaluate(subject, InterceptorTbccV1.Program);
        Assert.DoesNotContain(report.Findings,
            f => f.GateId == "tw-augmented-gross" && f.Blocking);
        AirframeIdentity measured = IdentityMeasurement.FromParams(
            FlightModel.RapierPublicDataSurrogate, inferred: false);
        Assert.True(measured.AugmentedThrustToWeight
            <= InterceptorTbccV1.FamilyAugmentedTwCap + 1e-9);
    }

    [Fact]
    public void MarkdownContainsFindingsAndClimbGate() {
        var subject = new AirframeUnderTest(
            "rapier",
            FlightModel.RapierPublicDataSurrogate,
            PropulsionModelKind.TurboRamjetPublicDataSurrogate,
            Identity: InterceptorTbccV1.RapierAspirationalIdentity);
        FlightTestReport report = Evaluator.Evaluate(subject, InterceptorTbccV1.Program);
        string md = report.ToMarkdown();
        Assert.Contains("## Findings", md);
        Assert.Contains("## Identity", md);
        Assert.Contains("ab-climb-through-m1", md);
        Assert.Contains("physics contract for teaching sorties", md);
    }

    [Fact]
    public void RaisingThrustMaxNWithoutIdentityUpdateFailsIdentityGate() {
        AircraftParams buffed = FlightModel.RapierPublicDataSurrogate with {
            ThrustMaxN = FlightModel.RapierPublicDataSurrogate.ThrustMaxN * 1.20
        };
        var subject = new AirframeUnderTest(
            "rapier-buffed", buffed,
            PropulsionModelKind.TurboRamjetPublicDataSurrogate,
            Identity: InterceptorTbccV1.RapierAspirationalIdentity);
        FlightTestReport report = Evaluator.Evaluate(subject, InterceptorTbccV1.Program);
        Assert.False(report.Passed);
        Assert.Contains(report.Findings, f => f.GateId.StartsWith("identity-tw") && f.Blocking);
    }

    [Fact]
    public void MatchingIdentityToBuffStillFailsFamilyTwCap() {
        // The buff has to actually clear FamilyAugmentedTwCap (1.20) for this test to exercise
        // anything: gross is 11,090 kg and the augmentor lever stop is 1.55, so the cap sits at
        // 84.2 kN of dry core. x1.20 cleared it comfortably on the old 84 kN engine; on the
        // honest 50 kN core it reaches only 0.86 aug T/W and trips nothing, so the test passed
        // vacuously instead of catching buff creep. x1.75 puts it at 1.25, over the cap again.
        //
        // The sibling test above keeps x1.20 deliberately -- it checks the 5% identity-drift
        // tolerance, which a 20% overclaim still clears. Same buff, two different bars.
        AircraftParams buffed = FlightModel.RapierPublicDataSurrogate with {
            ThrustMaxN = FlightModel.RapierPublicDataSurrogate.ThrustMaxN * 1.75
        };
        AirframeIdentity measured = IdentityMeasurement.FromParams(buffed, inferred: false);
        AirframeIdentity matched = measured with {
            Role = "admitted homesick angel",
            ComparisonFamily = "admitted homesick angel — not a teaching airframe",
            MaxClimbGammaDegWhileAcceleratingThroughMach1 = 90.0,
            MinSustainedVsAeroGGap = 0.0,
            SourceDoc = "deliberate-admit"
        };
        var subject = new AirframeUnderTest(
            "rapier-admitted", buffed,
            PropulsionModelKind.TurboRamjetPublicDataSurrogate,
            Identity: matched);
        FlightTestReport report = Evaluator.Evaluate(subject, InterceptorTbccV1.Program);
        Assert.Contains(report.Findings, f => f.GateId == "tw-augmented-gross");
        Assert.Contains(report.Findings, f => f.GateId == "comparison-family-review");
    }

    [Fact]
    public void MissionFindingIsAdvisoryAndDoesNotAloneFail() {
        var subject = new AirframeUnderTest(
            Id: "rapier",
            Air: FlightModel.RapierPublicDataSurrogate,
            Propulsion: PropulsionModelKind.TurboRamjetPublicDataSurrogate);
        var program = new FlightTestProgram(
            Id: "empty",
            Version: "0",
            Gates: Array.Empty<FlightTestGate>(),
            Points: Array.Empty<FlightTestPoint>());
        FlightTestReport report = Evaluator.Evaluate(subject, program);
        Assert.Contains(report.Findings, f => f.GateId == "mission-not-attached" && !f.Blocking);
        Assert.True(report.Passed);
    }
}
