namespace GunsOnly.Sim.FlightTest;

public static class Evaluator {
    public static FlightTestReport Evaluate(
        AirframeUnderTest subject, FlightTestProgram program) {
        AirframeIdentity identity = subject.Identity
            ?? IdentityMeasurement.FromParams(subject.Air, inferred: true);
        return new FlightTestReport(
            subject.Id, program.Id, program.Version,
            Passed: true,
            identity,
            Findings: Array.Empty<FlightTestFinding>());
    }
}
