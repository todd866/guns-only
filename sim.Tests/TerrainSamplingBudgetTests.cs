using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// What a production beat costs the terrain, counted at the surface, on the real Ukraine truth.
///
/// This exists because the storm it pins was invisible to every other test in the suite. Nothing
/// asserted how MANY times the kernel asks the ground a question, so ReactiveBandit.TryLowAttackPlan
/// could march 43,917 samples per call — 179,000 terrain lookups per 120 Hz tick, 2.3-3.1 ms of an
/// 8.33 ms tick — on the beat with the longest staging in the game, and the suite stayed green.
public class TerrainSamplingBudgetTests {
    readonly ITestOutputHelper _out;
    public TerrainSamplingBudgetTests(ITestOutputHelper output) => _out = output;

    /// Counts what the SIMULATION asks for, so it sits outside the mission-frame translation and
    /// inside nothing: one increment per query the kernel actually issues.
    sealed class CountingSurface : ITerrainSurface {
        readonly ITerrainSurface _source;
        public long Queries;
        public CountingSurface(ITerrainSurface source) => _source = source;
        public TerrainBounds Bounds => _source.Bounds;
        public double HorizontalResolutionM => _source.HorizontalResolutionM;
        public bool TrySample(double eastM, double northM, out TerrainSample sample) {
            Queries++;
            return _source.TrySample(eastM, northM, out sample);
        }
        public bool TryHeightM(double eastM, double northM, out double heightM) {
            Queries++;
            return _source.TryHeightM(eastM, northM, out heightM);
        }
    }

    /// Beat 10 stages the opposing formation 360 km out — the longest range any built-in beat asks
    /// the bandits to think across, and therefore the beat that exposes an unbounded march. The
    /// budget is generous (a healthy tick measured 1,242-1,429) precisely so it fails only on the
    /// defect class, never on ordinary tuning.
    [Fact]
    public void ALongRangeInterceptDoesNotStormTheTerrain() {
        const int BeatIndex = 10;
        const int Ticks = 1_500;
        // Roughly three times a healthy tick, and forty times under the pre-bound measurement.
        const double BudgetPerTick = 4_000.0;

        ITerrainSurface theatre = Assert.IsAssignableFrom<ITerrainSurface>(
            GunsOnly.Web.UkraineTerrainTruth.Load());
        var counting = new CountingSurface(new GunsOnly.Web.TrainingTerrainApronSurface(
            theatre, marginM: 400_000.0, flatHeightM: 78.0, transitionM: 8_000.0));
        MissionEnvironmentContract environment =
            Beats.BuiltIn(BeatIndex, Carrier.DeckConfiguration.Angled).EnvironmentIdentity;
        var placed = new TranslatedTerrainSurface(counting,
            -environment.TerrainSourceAnchorEastM, -environment.TerrainSourceAnchorNorthM);

        var session = new SimulationSession(BeatIndex, Carrier.DeckConfiguration.Angled,
            KoreaWeatherPresets.ForBeat(BeatIndex));
        session.StartBeatWithEnvironment(BeatIndex, KoreaWeatherPresets.ForBeat(BeatIndex),
            placed, Carrier.DeckConfiguration.Angled);
        session.SetAiComputeLevel(AiComputeLevel.Full);
        session.Begin();

        long worstTick = 0;
        int stepped = 0;
        for (; stepped < Ticks && session.Lifecycle == SimulationSession.LifecycleState.Active;
            stepped++) {
            // Chase, so the fight is a fight and the low-block doctrine has something to answer.
            if (session.OpponentPresent) {
                var own = session.Player.State;
                var to = (session.SelectedOpponentState.Position - own.Position).Normalized();
                var right = new Vec3D(System.Math.Cos(own.Chi), 0.0, -System.Math.Sin(own.Chi));
                session.SetAnalogRollControl(
                    System.Math.Clamp(to.Dot(right) * 2.5, -1.0, 1.0));
                session.SetAnalogPitchControl(
                    System.Math.Clamp((to.Y - own.ForwardDir().Y) * 2.5, -1.0, 1.0));
            }
            session.SetAnalogThrottleControl(1.0);
            long before = counting.Queries;
            session.StepFixed();
            worstTick = System.Math.Max(worstTick, counting.Queries - before);
        }

        double perTick = counting.Queries / (double)stepped;
        _out.WriteLine($"beat {BeatIndex}: {counting.Queries:N0} terrain queries over "
            + $"{stepped} ticks = {perTick:F1}/tick, worst single tick {worstTick:N0}");
        Assert.True(perTick < BudgetPerTick,
            $"beat {BeatIndex} averaged {perTick:F0} terrain queries per tick "
            + $"against a budget of {BudgetPerTick:F0}");
        // The single-tick figure is what the frame actually feels; a burst hidden inside a healthy
        // average is exactly how the 120 Hz storm stayed invisible.
        Assert.True(worstTick < BudgetPerTick * 4.0,
            $"one tick issued {worstTick:N0} terrain queries");
    }
}
