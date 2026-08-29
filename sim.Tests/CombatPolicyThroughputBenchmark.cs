using System.Diagnostics;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// HOW MUCH EXPERIENCE CAN THIS KERNEL PRODUCE?
///
/// Not a contract — a measurement, run explicitly. Whether a learned policy is worth attempting
/// here is decided by episodes per second on the machine that has to produce them, not by opinion.
public class CombatPolicyThroughputBenchmark {
    readonly ITestOutputHelper _out;
    public CombatPolicyThroughputBenchmark(ITestOutputHelper o) { _out = o; }

    sealed class ScriptedPolicy : ICombatLearningPolicy {
        public CombatPolicyDecision Decide(in CombatPolicyObservation observation) {
            // Stand-in for a network forward pass: reads the observation, returns controls.
            double bank = System.Math.Clamp(observation.GunNoseErrorRad * 2.0, -1.2, 1.2);
            return new CombatPolicyDecision(
                new PilotCommand(3.0, bank, 1.0, 0.0),
                observation.RangeM < 900.0);
        }
    }

    [Fact(Skip = "Benchmark, not a contract. Un-skip and run with --filter to "
        + "re-measure. 2026-08-29 on 10 workers: 150,325 env steps/s, 1,253x realtime.")]
    public void MeasureEpisodeThroughput() {
        const int Episodes = 256;
        const double Seconds = 30.0;
        int workers = System.Environment.ProcessorCount;

        // Warm the JIT so the figure is steady-state, not first-call.
        SeededCombatBatchRunner.RunEpisode(0,
            CombatTrainingScenarioFactory.SeededOffsetMerge(1UL),
            PilotSkill.Competent, PilotSkill.Competent, 2.0,
            learningPolicy: new ScriptedPolicy());

        int transitions = 0;
        var sw = Stopwatch.StartNew();
        System.Threading.Tasks.Parallel.For(0, Episodes,
            new System.Threading.Tasks.ParallelOptions { MaxDegreeOfParallelism = workers },
            i => {
                var episode = SeededCombatBatchRunner.RunEpisode(
                    episodeIndex: 0,
                    scenario: CombatTrainingScenarioFactory.SeededOffsetMerge((ulong)(i + 7)),
                    referenceSkill: PilotSkill.Veteran,
                    behaviorSkill: PilotSkill.Competent,
                    maximumSeconds: Seconds,
                    learningPolicy: new ScriptedPolicy());
                System.Threading.Interlocked.Add(ref transitions, episode.Transitions.Count);
            });
        sw.Stop();

        double s = sw.Elapsed.TotalSeconds;
        double episodesPerSecond = Episodes / s;
        double stepsPerSecond = transitions / s;
        _out.WriteLine($"workers                {workers}");
        _out.WriteLine($"episodes               {Episodes} x {Seconds:F0} s");
        _out.WriteLine($"wall time              {s:F2} s");
        _out.WriteLine($"episodes / second      {episodesPerSecond:F1}");
        _out.WriteLine($"env steps / second     {stepsPerSecond:F0}");
        _out.WriteLine($"realtime factor        {Episodes * Seconds / s:F0}x");
        _out.WriteLine($"1M steps would take    {1_000_000.0 / stepsPerSecond / 60.0:F1} min");
        _out.WriteLine($"10M steps would take   {10_000_000.0 / stepsPerSecond / 60.0:F1} min");
        _out.WriteLine($"100M steps would take  {100_000_000.0 / stepsPerSecond / 3600.0:F1} h");
    }
}
