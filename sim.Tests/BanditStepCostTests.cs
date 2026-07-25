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

    /// A ridged heightfield over the real world extent, so the lookahead's per-rollout terrain
    /// sampling and swept-clearance queries do the work they do in production. The FIRST version of
    /// this benchmark passed no terrain at all and therefore measured a lookahead that never
    /// touched the ground — which is exactly why it wrongly exonerated the AI for the Build 103
    /// frame stalls.
    static GunsOnly.Sim.Environment.ITerrainSurface RidgedTerrain() {
        const int Cells = 257;
        const double HalfExtentM = 65_536.0;
        var heights = new double[Cells, Cells];
        for (int north = 0; north < Cells; north++)
        for (int east = 0; east < Cells; east++)
            heights[north, east] = 400.0
                + 380.0 * System.Math.Sin(east * 0.21)
                * System.Math.Cos(north * 0.17);
        return new GunsOnly.Sim.Environment.BilinearHeightGrid(
            -HalfExtentM, -HalfExtentM, HalfExtentM, HalfExtentM, heights);
    }

    [Fact]
    public void ReportPerTierStepCost() {
        const double Dt = 1.0 / AircraftSim.TickHz;
        _out.WriteLine($"cadence=12 ticks, 9 candidates; sim tick = {Dt * 1000.0:F2} ms");
        _out.WriteLine("cost of ONE SECOND of bandit thinking, and what that is per 60fps frame:");
        var terrain = RidgedTerrain();
        foreach (PilotSkill tier in new[] {
            PilotSkill.Novice, PilotSkill.Competent, PilotSkill.Veteran,
            PilotSkill.Ace, PilotSkill.Machine }) {
            BanditSkillProfile profile = BanditSkillProfile.For(tier);
            double withoutMs = 0.0, withMs = 0.0;
            foreach (bool withTerrain in new[] { false, true }) {
                // Warm up, then time a full simulated second of bandit decision-making.
                for (int repeat = 0; repeat < 2; repeat++) {
                    var player = new AircraftState(
                        new Vec3D(0.0, 3000.0, 0.0), 250.0, 0.0, 0.0, 0.0,
                        FlightModel.F22APublicDataSurrogate.MassKg);
                    var bandit = new ReactiveBandit(
                        new AircraftState(new Vec3D(300.0, 3100.0, -700.0), 250.0, 0.0, 0.2, 0.0,
                            FlightModel.Su27SPublicDataSurrogate.MassKg),
                        FlightModel.Su27SPublicDataSurrogate, tier,
                        withTerrain ? terrain : null);
                    var watch = Stopwatch.StartNew();
                    for (int tick = 0; tick < AircraftSim.TickHz; tick++)
                        bandit.Step(ActorObservation.Capture(player, tick), Dt);
                    watch.Stop();
                    if (repeat == 1) {
                        if (withTerrain) withMs = watch.Elapsed.TotalMilliseconds;
                        else withoutMs = watch.Elapsed.TotalMilliseconds;
                    }
                }
            }
            _out.WriteLine(
                $"{tier,-10} horizon={profile.LookaheadHorizonTicks,4}  "
                + $"no terrain {withoutMs,7:F2} ms ({withoutMs / 60.0,5:F2} ms/frame)  "
                + $"WITH terrain {withMs,8:F2} ms ({withMs / 60.0,6:F2} ms/frame)  "
                + $"=> {(withoutMs > 0 ? withMs / withoutMs : 0),5:F1}x");
        }
    }

    /// The number that actually matters for frame pacing. The lookahead does NOT spread its work
    /// evenly: it decides on one tick in twelve and holds that command for the other eleven, so a
    /// whole 9-candidate rollout lands inside a SINGLE tick — and therefore inside a single
    /// rendered frame, on the browser's main thread. A per-second average divides that burst by 120
    /// and makes it look free, which is exactly the mistake that wrongly exonerated the AI earlier.
    [Fact]
    public void ReportWorstSingleTickCost() {
        const double Dt = 1.0 / AircraftSim.TickHz;
        var terrain = RidgedTerrain();
        _out.WriteLine("worst SINGLE tick (the decision tick) vs the median tick:");
        foreach (PilotSkill tier in new[] {
            PilotSkill.Novice, PilotSkill.Competent, PilotSkill.Veteran,
            PilotSkill.Ace, PilotSkill.Machine }) {
            BanditSkillProfile profile = BanditSkillProfile.For(tier);
            var ticks = new List<double>();
            for (int repeat = 0; repeat < 2; repeat++) {
                ticks.Clear();
                var player = new AircraftState(
                    new Vec3D(0.0, 3000.0, 0.0), 250.0, 0.0, 0.0, 0.0,
                    FlightModel.F22APublicDataSurrogate.MassKg);
                var bandit = new ReactiveBandit(
                    new AircraftState(new Vec3D(300.0, 3100.0, -700.0), 250.0, 0.0, 0.2, 0.0,
                        FlightModel.Su27SPublicDataSurrogate.MassKg),
                    FlightModel.Su27SPublicDataSurrogate, tier, terrain);
                for (int tick = 0; tick < AircraftSim.TickHz * 3; tick++) {
                    var observation = ActorObservation.Capture(player, tick);
                    long start = Stopwatch.GetTimestamp();
                    bandit.Step(observation, Dt);
                    ticks.Add(Stopwatch.GetElapsedTime(start).TotalMilliseconds);
                }
            }
            ticks.Sort();
            double median = ticks[ticks.Count / 2];
            double p99 = ticks[(int)(ticks.Count * 0.99)];
            double worst = ticks[^1];
            // At 60 fps the sim advances ~2 ticks per frame, so a decision burst hits one frame.
            _out.WriteLine(
                $"{tier,-10} horizon={profile.LookaheadHorizonTicks,4}  "
                + $"median tick {median,6:F3} ms  p99 {p99,7:F3} ms  WORST {worst,7:F3} ms  "
                + $"=> worst frame contribution {worst,6:F2} ms native "
                + $"({worst * 5.0,6:F1} ms at a 5x WASM penalty)");
        }
    }
    /// A FORMATION's worst frame, which is what the pilot actually feels now that waves are pairs.
    /// Two lookahead pilots that recompute on the same tick put both bursts in one rendered frame.
    [Fact]
    public void ReportWorstTickForAFormationOfTwo() {
        const double Dt = 1.0 / AircraftSim.TickHz;
        var terrain = RidgedTerrain();
        foreach (PilotSkill tier in new[] { PilotSkill.Ace, PilotSkill.Machine }) {
            var ticks = new List<double>();
            for (int repeat = 0; repeat < 2; repeat++) {
                ticks.Clear();
                var player = new AircraftState(
                    new Vec3D(0.0, 3000.0, 0.0), 250.0, 0.0, 0.0, 0.0,
                    FlightModel.F22APublicDataSurrogate.MassKg);
                // Engagement numbers as the session stages them: leader N, wingman N+1.
                var leader = new ReactiveBandit(
                    new AircraftState(new Vec3D(300.0, 3100.0, -700.0), 250.0, 0.0, 0.2, 0.0,
                        FlightModel.Su27SPublicDataSurrogate.MassKg),
                    FlightModel.Su27SPublicDataSurrogate, tier, terrain, engagementNumber: 4);
                var wingman = new ReactiveBandit(
                    new AircraftState(new Vec3D(-400.0, 3050.0, -900.0), 250.0, 0.0, -0.1, 0.0,
                        FlightModel.Su27SPublicDataSurrogate.MassKg),
                    FlightModel.Su27SPublicDataSurrogate, tier, terrain, engagementNumber: 5);
                for (int tick = 0; tick < AircraftSim.TickHz * 3; tick++) {
                    var observation = ActorObservation.Capture(player, tick);
                    long start = Stopwatch.GetTimestamp();
                    leader.Step(observation, Dt);
                    wingman.Step(observation, Dt);
                    ticks.Add(Stopwatch.GetElapsedTime(start).TotalMilliseconds);
                }
            }
            ticks.Sort();
            _out.WriteLine(
                $"PAIR {tier,-9} median {ticks[ticks.Count / 2],6:F3} ms  "
                + $"p99 {ticks[(int)(ticks.Count * 0.99)],7:F3} ms  WORST {ticks[^1],7:F3} ms  "
                + $"=> {ticks[^1] * 5.0,6:F1} ms at a 5x WASM penalty");
        }
    }

}
