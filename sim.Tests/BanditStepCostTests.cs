using System.Diagnostics;
using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// What one second of bandit thinking actually costs the frame budget. The lookahead rolls
/// 9 candidate manoeuvres forward LookaheadHorizonTicks each, every LookaheadDecisionCadenceTicks
/// (12 ticks ~= 0.1 s), synchronously — in the browser that lands on the main thread, in the same
/// budget as the renderer.
///
/// CAVEAT — this does NOT cleanly isolate the lookahead. Each tier flies a different fight from
/// the same start, so it spends different amounts of time in the lookahead versus the cheap state
/// machine, and the cost does not order monotonically by horizon (Competent has measured HIGHER
/// than Ace). Read it as an order of magnitude — "bandit thinking is ~1 ms per frame, not ~15" —
/// which is what ruled the AI out as the cause of the Build 103 frame drops. Do not use it to
/// compare tiers against each other.
public class BanditStepCostTests {
    readonly ITestOutputHelper _out;
    public BanditStepCostTests(ITestOutputHelper output) => _out = output;

    [Fact]
    public void ReportPerTierStepCost() {
        const double Dt = 1.0 / AircraftSim.TickHz;
        _out.WriteLine($"cadence={12} ticks, 9 candidates; sim tick = {Dt * 1000.0:F2} ms");
        foreach (PilotSkill tier in new[] {
            PilotSkill.Novice, PilotSkill.Competent, PilotSkill.Veteran,
            PilotSkill.Ace, PilotSkill.Machine }) {
            BanditSkillProfile profile = BanditSkillProfile.For(tier);
            // Warm up, then time a full simulated second of bandit decision-making.
            for (int repeat = 0; repeat < 2; repeat++) {
                var player = new AircraftState(
                    new Vec3D(0.0, 3000.0, 0.0), 250.0, 0.0, 0.0, 0.0,
                    FlightModel.F22APublicDataSurrogate.MassKg);
                var bandit = new ReactiveBandit(
                    new AircraftState(new Vec3D(300.0, 3100.0, -700.0), 250.0, 0.0, 0.2, 0.0,
                        FlightModel.Su27SPublicDataSurrogate.MassKg),
                    FlightModel.Su27SPublicDataSurrogate, tier);
                var watch = Stopwatch.StartNew();
                for (int tick = 0; tick < AircraftSim.TickHz; tick++)
                    bandit.Step(ActorObservation.Capture(player, tick), Dt);
                watch.Stop();
                if (repeat == 1)
                    _out.WriteLine(
                        $"{tier,-10} horizon={profile.LookaheadHorizonTicks,4} ticks  "
                        + $"1.0 s of flight costs {watch.Elapsed.TotalMilliseconds,7:F2} ms CPU  "
                        + $"=> {watch.Elapsed.TotalMilliseconds / 60.0,6:F2} ms per 60fps frame");
            }
        }
    }
}
