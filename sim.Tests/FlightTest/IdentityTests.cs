using GunsOnly.Sim;
using GunsOnly.Sim.FlightTest;
using GunsOnly.Sim.FlightTest.Programs;

namespace GunsOnly.Sim.Tests.FlightTest;

public class IdentityTests {
    [Fact]
    public void RapierParamsMatchTeachingIdentityWithinTolerance() {
        AirframeIdentity claim = InterceptorTbccV1.RapierAspirationalIdentity;
        AirframeIdentity measured = IdentityMeasurement.FromParams(
            FlightModel.RapierPublicDataSurrogate, inferred: false);

        Assert.InRange(measured.GrossMassKg,
            claim.GrossMassKg * 0.98, claim.GrossMassKg * 1.02);
        Assert.InRange(measured.AugmentedThrustToWeight,
            claim.AugmentedThrustToWeight * 0.95, claim.AugmentedThrustToWeight * 1.05);
        Assert.True(measured.AugmentedThrustToWeight
            <= InterceptorTbccV1.FamilyAugmentedTwCap + 1e-9);
    }

    [Fact]
    public void EvaluateFailsWhenIdentityDriftsFromParams() {
        AirframeIdentity drifted = InterceptorTbccV1.RapierAspirationalIdentity with {
            AugmentedThrustToWeight = 0.70
        };
        var subject = new AirframeUnderTest(
            "rapier",
            FlightModel.RapierPublicDataSurrogate,
            PropulsionModelKind.TurboRamjetPublicDataSurrogate,
            Identity: drifted);
        FlightTestReport report = Evaluator.Evaluate(subject, InterceptorTbccV1.Program);
        Assert.False(report.Passed);
        Assert.Contains(report.Findings, f => f.GateId == "identity-tw-augmented" && f.Blocking);
    }
}
