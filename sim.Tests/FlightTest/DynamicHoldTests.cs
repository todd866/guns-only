using GunsOnly.Sim;
using GunsOnly.Sim.FlightTest;
using GunsOnly.Sim.FlightTest.Programs;

namespace GunsOnly.Sim.Tests.FlightTest;

public class DynamicHoldTests {
    [Fact]
    public void RapierAbClimbThroughMach1ExceedsFamilyGammaCap() {
        ClimbHoldResult r = DynamicHolds.AbClimbThroughMach1(
            FlightModel.RapierPublicDataSurrogate);
        Assert.True(r.MaxGammaDegWhileAccelerating > 40.0,
            $"expected homesick-angel γ, got {r.MaxGammaDegWhileAccelerating:F1}");
    }

    [Fact]
    public void EvaluateFailsAbClimbGateForRapier() {
        var subject = new AirframeUnderTest(
            "rapier", FlightModel.RapierPublicDataSurrogate,
            PropulsionModelKind.TurboRamjetPublicDataSurrogate,
            Identity: InterceptorTbccV1.RapierAspirationalIdentity);
        FlightTestReport report = Evaluator.Evaluate(subject, InterceptorTbccV1.Program);
        Assert.Contains(report.Findings,
            f => f.GateId == "ab-climb-through-m1" && f.Blocking);
        Assert.False(report.Passed);
    }
}
