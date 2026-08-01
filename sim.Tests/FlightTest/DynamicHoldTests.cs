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
    /// The Rapier used to exceed the 40-degree family cap accelerating through Mach 1 -- a
    /// "homesick angel" -- and these two tests asserted that, one on the hold directly and one on
    /// the evaluator catching it. That behaviour was the defect, not the feature: on 2026-07-31
    /// the aircraft would hold M0.9 in a VERTICAL climb once fuel burned down, because a dry
    /// thrust-to-weight of 1.30 on the empty airframe exceeded an F-22 carrying two F119s.
    ///
    /// With an honest core the aircraft complies, so the assertion is inverted rather than
    /// deleted: complying is the thing now worth protecting, and a regression back above the cap
    /// would mean the engine had been quietly re-inflated.
    [Fact]
    public void RapierAbClimbThroughMach1StaysInsideFamilyGammaCap() {
        ClimbHoldResult r = DynamicHolds.AbClimbThroughMach1(
            FlightModel.RapierPublicDataSurrogate);
        Assert.True(r.MaxGammaDegWhileAccelerating <= 40.0,
            $"climb angle back above the family cap, got {r.MaxGammaDegWhileAccelerating:F1}");
    }

    [Fact]
    public void EvaluatePassesAbClimbGateForRapier() {
        var subject = new AirframeUnderTest(
            "rapier", FlightModel.RapierPublicDataSurrogate,
            PropulsionModelKind.TurboRamjetPublicDataSurrogate,
            Identity: InterceptorTbccV1.RapierAspirationalIdentity);
        FlightTestReport report = Evaluator.Evaluate(subject, InterceptorTbccV1.Program);
        Assert.DoesNotContain(report.Findings,
            f => f.GateId == "ab-climb-through-m1" && f.Blocking);
    }
}
