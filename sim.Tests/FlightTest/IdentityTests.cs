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
        // 0.90 against a claimed 0.71 is a 26% overclaim -- well outside the gate's 5% band.
        // This used to read 0.70, which drifted from the 84 kN core by enough to trip the gate
        // and from the 50 kN core by 1.8%, i.e. not at all. The number under test is the
        // EVALUATOR's tolerance, so it has to be stated relative to the tolerance and not
        // inherited from whichever engine happened to be fitted when the test was written.
        AirframeIdentity drifted = InterceptorTbccV1.RapierAspirationalIdentity with {
            AugmentedThrustToWeight = 0.90
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
