using GunsOnly.Sim;
using GunsOnly.Sim.FlightTest;
using GunsOnly.Sim.FlightTest.Programs;

namespace GunsOnly.Sim.Tests.FlightTest;

public class IdentityTests {
    [Fact]
    public void RapierParamsDisagreeWithAspirationalIdentity() {
        AirframeIdentity claim = InterceptorTbccV1.RapierAspirationalIdentity;
        AirframeIdentity measured = IdentityMeasurement.FromParams(
            FlightModel.RapierPublicDataSurrogate, inferred: false);

        Assert.True(measured.AugmentedThrustToWeight > claim.AugmentedThrustToWeight + 0.05);
    }

    [Fact]
    public void EvaluateFailsWhenIdentityDriftsFromParams() {
        var subject = new AirframeUnderTest(
            "rapier",
            FlightModel.RapierPublicDataSurrogate,
            PropulsionModelKind.TurboRamjetPublicDataSurrogate,
            Identity: InterceptorTbccV1.RapierAspirationalIdentity);
        FlightTestReport report = Evaluator.Evaluate(subject, InterceptorTbccV1.Program);
        Assert.False(report.Passed);
        Assert.Contains(report.Findings, f => f.GateId == "identity-tw-augmented" && f.Blocking);
    }
}
