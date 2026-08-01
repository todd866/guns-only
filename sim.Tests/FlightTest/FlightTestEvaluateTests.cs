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
            Id: "interceptor-tbcc-v2",
            Version: "2",
            Gates: Array.Empty<FlightTestGate>(),
            Points: Array.Empty<FlightTestPoint>());

        FlightTestReport report = Evaluator.Evaluate(subject, program);

        Assert.Equal("rapier", report.SubjectId);
        Assert.Equal("interceptor-tbcc-v2", report.ProgramId);
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
        // V2 has no extra 1.55x lever multiplier and grosses 11.82 t, so the honest 50 kN
        // sea-level turbine-core rating is only about 0.43 T/W. Triple it to cross the deliberately
        // broad 1.20 comparison-family cap. The sibling test keeps x1.20 to exercise the tighter
        // identity-drift tolerance; these are two different gates.
        AircraftParams buffed = FlightModel.RapierPublicDataSurrogate with {
            ThrustMaxN = FlightModel.RapierPublicDataSurrogate.ThrustMaxN * 3.0
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
