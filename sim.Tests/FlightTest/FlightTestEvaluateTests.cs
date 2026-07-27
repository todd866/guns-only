using GunsOnly.Sim;
using GunsOnly.Sim.FlightTest;

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
}
