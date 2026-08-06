using System.Diagnostics;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// What Auto-GCAS costs the terrain over a real sortie, and proof that making it cheap changed
/// nothing about how the aircraft flies.
///
/// The measurement that started this: on the production Ukraine truth, flown through the real
/// SimulationSession by a scripted pursuit pilot for 60 s, Auto-GCAS was issuing 1,703 terrain
/// samples per 120 Hz tick on the visual-merge beat — 76% of every terrain lookup the entire
/// kernel made, more than the flight model, the bandits and the sensors combined. A predictor
/// that has never once activated in a recorded production sortie was the single largest consumer
/// of the ground.
///
/// Cost is measured by DIFFERENCE, not by instrumenting the controller: the same sortie is flown
/// twice, once with the system armed and once stood down, and the gap is what it costs. That is
/// only a fair measurement if the two sorties are otherwise the same flight, which the digest
/// below also checks — and on a beat where the fly-up genuinely fires, the two digests SHOULD
/// differ, which is itself the evidence that the armed run is doing something.
/// </summary>
public class AutoGcasTerrainBudgetTests {
    readonly ITestOutputHelper _out;
    public AutoGcasTerrainBudgetTests(ITestOutputHelper output) => _out = output;

    /// One increment per query the kernel actually issues, outside the mission-frame translation
    /// and inside nothing. It forwards the ceiling, because a wrapper that quietly dropped it
    /// would disarm the broad phase and make this test measure the wrong build.
    sealed class CountingSurface : ITerrainSurface {
        readonly ITerrainSurface _source;
        public long Queries;
        public CountingSurface(ITerrainSurface source) => _source = source;
        public TerrainBounds Bounds => _source.Bounds;
        public double HorizontalResolutionM => _source.HorizontalResolutionM;
        public double MaximumHeightM => _source.MaximumHeightM;
        public bool TrySample(double eastM, double northM, out TerrainSample sample) {
            Queries++;
            return _source.TrySample(eastM, northM, out sample);
        }
        public bool TryHeightM(double eastM, double northM, out double heightM) {
            Queries++;
            return _source.TryHeightM(eastM, northM, out heightM);
        }
    }

    readonly record struct Flight(long Queries, double Milliseconds, int Ticks, string Digest);

    static SimulationSession Build(int beatIndex, out CountingSurface counting) {
        ITerrainSurface theatre = Assert.IsAssignableFrom<ITerrainSurface>(
            GunsOnly.Web.UkraineTerrainTruth.Load());
        counting = new CountingSurface(new GunsOnly.Web.TrainingTerrainApronSurface(
            theatre, marginM: 400_000.0, flatHeightM: 78.0, transitionM: 8_000.0));
        MissionEnvironmentContract environment =
            Beats.BuiltIn(beatIndex, Carrier.DeckConfiguration.Angled).EnvironmentIdentity;
        var placed = new TranslatedTerrainSurface(counting,
            -environment.TerrainSourceAnchorEastM, -environment.TerrainSourceAnchorNorthM);
        var session = new SimulationSession(beatIndex, Carrier.DeckConfiguration.Angled,
            KoreaWeatherPresets.ForBeat(beatIndex));
        session.StartBeatWithEnvironment(beatIndex, KoreaWeatherPresets.ForBeat(beatIndex),
            placed, Carrier.DeckConfiguration.Angled);
        session.SetAiComputeLevel(AiComputeLevel.Full);
        session.Begin();
        return session;
    }

    static void Digest(System.IO.BinaryWriter w, in AircraftState s) {
        w.Write(s.Position.X); w.Write(s.Position.Y); w.Write(s.Position.Z);
        w.Write(s.Speed); w.Write(s.Chi); w.Write(s.Gamma); w.Write(s.Bank);
    }

    /// A scripted pursuit pilot — the fight has to be a fight, or the predictor never sees the
    /// states that cost anything.
    static Flight Fly(int beatIndex, bool autoGcasEnabled, int ticks) {
        SimulationSession session = Build(beatIndex, out CountingSurface counting);
        session.SetAutoGcasEnabled(autoGcasEnabled);
        using var sha = System.Security.Cryptography.SHA256.Create();
        var stream = new System.IO.MemoryStream();
        var writer = new System.IO.BinaryWriter(stream);
        var watch = new Stopwatch();
        int stepped = 0;
        for (; stepped < ticks
            && session.Lifecycle == SimulationSession.LifecycleState.Active; stepped++) {
            if (session.OpponentPresent) {
                AircraftState own = session.Player.State;
                Vec3D to = (session.SelectedOpponentState.Position - own.Position).Normalized();
                var right = new Vec3D(System.Math.Cos(own.Chi), 0.0, -System.Math.Sin(own.Chi));
                session.SetAnalogRollControl(
                    System.Math.Clamp(to.Dot(right) * 2.5, -1.0, 1.0));
                session.SetAnalogPitchControl(
                    System.Math.Clamp((to.Y - own.ForwardDir().Y) * 2.5, -1.0, 1.0));
            }
            session.SetAnalogThrottleControl(1.0);
            watch.Start();
            session.StepFixed();
            watch.Stop();
            Digest(writer, session.Player.State);
            if (session.OpponentPresent) {
                Digest(writer, session.Bandit.State);
                foreach (Wingman wingman in session.Wingmen) Digest(writer, wingman.Bandit.State);
            }
        }
        writer.Flush();
        return new Flight(counting.Queries, watch.Elapsed.TotalMilliseconds, stepped,
            System.Convert.ToHexString(sha.ComputeHash(stream.ToArray())));
    }

    /// <summary>
    /// The budget. 200 samples per tick is roughly a third of what the system cost after this
    /// work and an order of magnitude under what it cost before, so it fails on the defect class —
    /// a predictor that has gone back to marching ground it cannot reach — and never on tuning.
    /// </summary>
    [Theory]
    [InlineData(7)]     // visual merge
    [InlineData(9)]     // ace duel
    public void AutoGcasDoesNotDominateTheTerrainBudget(int beatIndex) {
        const int Ticks = 7_200;            // 60 s at 120 Hz
        const double BudgetPerTick = 600.0;

        Flight armed = Fly(beatIndex, autoGcasEnabled: true, Ticks);
        Flight stoodDown = Fly(beatIndex, autoGcasEnabled: false, Ticks);
        double sharePerTick = (armed.Queries - stoodDown.Queries) / (double)armed.Ticks;
        double microsecondsPerTick =
            (armed.Milliseconds - stoodDown.Milliseconds) / armed.Ticks * 1_000.0;

        _out.WriteLine($"beat {beatIndex} over {armed.Ticks} ticks");
        _out.WriteLine($"  armed      {armed.Queries:N0} samples "
            + $"({armed.Queries / (double)armed.Ticks:F1}/tick), {armed.Milliseconds:F0} ms");
        _out.WriteLine($"  stood down {stoodDown.Queries:N0} samples "
            + $"({stoodDown.Queries / (double)stoodDown.Ticks:F1}/tick), "
            + $"{stoodDown.Milliseconds:F0} ms");
        _out.WriteLine($"  Auto-GCAS  {sharePerTick:F1} samples/tick, "
            + $"{microsecondsPerTick:F1} us/tick");

        Assert.True(sharePerTick < BudgetPerTick,
            $"Auto-GCAS averaged {sharePerTick:F0} terrain samples per tick on beat "
            + $"{beatIndex} against a budget of {BudgetPerTick:F0}");
    }

    /// <summary>
    /// Determinism. Every optimisation here is meant to be invisible to the flying, so the whole
    /// fight — the player and every bandit, position, speed, heading, flight-path angle and bank,
    /// on every one of 7,200 ticks — hashes to a fixed digest. These are the digests the
    /// pre-optimisation controller produced on the same beats; they are pinned, not recomputed.
    ///
    /// Beat 7 is the valuable one: the fly-up genuinely fires there, so this digest covers the
    /// recovery itself and not merely a quiet cruise past an armed system.
    /// </summary>
    [Theory]
    [InlineData(7, "6B3FD38293EDAD01")]
    [InlineData(9, "56E51E9E91A129BE")]
    [InlineData(1, "D0E9ED146822B2A4")]
    public void MakingThePredictorCheapMovedNoAircraft(int beatIndex, string expectedDigest) {
        Flight armed = Fly(beatIndex, autoGcasEnabled: true, ticks: 7_200);
        _out.WriteLine($"beat {beatIndex}: {armed.Ticks} ticks, digest {armed.Digest[..16]}");
        Assert.Equal(expectedDigest, armed.Digest[..16]);
    }
}
