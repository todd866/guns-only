using GunsOnly.Sim;
using GunsOnly.Sim.FlightTest;
using GunsOnly.Sim.FlightTest.Programs;

namespace GunsOnly.Sim.Tests.FlightTest;

/// <summary>
/// ASPIRATIONAL PINS, NOT REGRESSIONS. These tests assert that today's Rapier surrogate FAILS the
/// harness's dynamic gates (the transonic climb exceeds the 40-degree family gamma cap, so
/// Evaluate reports Passed=false). They pin the known-bad physics so the harness's red verdict is
/// itself protected. When the wave-drag/transonic model is corrected and the gate genuinely
/// passes, these assertions MUST be flipped in the same commit — a failure here after a physics
/// fix means the fix worked, not that it broke something.
/// </summary>
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
