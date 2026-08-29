using System.Linq;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// GRADE THE OPPONENT AGAINST THE PILOT, NOT AGAINST A SCRIPT.
///
/// The gun-conversion contracts stage a synthetic probe. An opponent that passes them lands a hit
/// in about 5% of the owner's real sorties, so passing them says nothing about whether the fight is
/// any good — and training a policy on that reward would converge faster onto the opponent that
/// already exists. These scenarios are the geometries the owner actually presented: 225 engagement
/// entries drawn from 57 of his sorties, staged from both aircraft's measured states.
public class OwnerEngagementBenchmarkTests {
    const string EngagementsPath = "../../../../analysis/owner-engagements.jsonl";
    readonly ITestOutputHelper _out;
    public OwnerEngagementBenchmarkTests(ITestOutputHelper o) { _out = o; }

    [Fact]
    public void TheOwnerEngagementSetStagesRealGeometries() {
        var scenarios = OwnerEngagementScenarios.Load(EngagementsPath);
        Assert.True(scenarios.Count >= 100,
            $"only {scenarios.Count} owner engagements staged — the evaluation set is too thin "
            + "to grade an opponent against");
        // A merge is a merge: both aircraft airborne, closing, and inside a fight-sized bubble.
        Assert.All(scenarios, s => {
            Assert.True(s.ReferenceStart.Position.Y > 200.0);
            Assert.True(s.LearningFighterStart.Position.Y > 200.0);
            double range = (s.LearningFighterStart.Position - s.ReferenceStart.Position).Length;
            Assert.InRange(range, 100.0, 6000.0);
            Assert.InRange(s.ReferenceStart.Speed, 60.0, 700.0);
            Assert.InRange(s.LearningFighterStart.Speed, 60.0, 700.0);
        });
        _out.WriteLine($"owner engagements staged: {scenarios.Count}");
    }

    /// The baseline this exists to establish. Not a contract — a measurement, so it is reported
    /// rather than asserted, and it is what a learned policy has to beat.
    [Fact(Skip = "Benchmark, not a contract. Un-skip to re-measure. 2026-08-29 baseline: "
        + "158 staged, 145 graded, 13 left the supported volume; opponent fired 180 rounds, "
        + "scored 50 hits and 11 splashes — 1.24 rounds per engagement.")]
    public void MeasureTheOpponentAgainstTheOwnersOwnFights() {
        var scenarios = OwnerEngagementScenarios.Load(EngagementsPath);
        int engagements = 0, roundsFired = 0, hits = 0, splashes = 0, outOfVolume = 0;
        foreach (var scenario in scenarios) {
            CombatEpisode episode;
            try {
                episode = SeededCombatBatchRunner.RunEpisode(
                    episodeIndex: 0, scenario: scenario,
                    referenceSkill: PilotSkill.Veteran,   // stand-in for the owner
                    behaviorSkill: PilotSkill.Ace,        // the shipped opponent
                    maximumSeconds: 30.0);
            } catch (System.InvalidOperationException) {
                // The runner has a 200 m floor and no out-of-bounds terminal — its own summary
                // says so. The owner fights lower than the scripted probe ever does, so a real
                // geometry can leave the supported volume. Counted, never hidden: a benchmark that
                // silently dropped these would flatter the opponent by grading it only on the
                // engagements it stayed high in.
                outOfVolume++;
                continue;
            }
            engagements++;
            roundsFired += episode.RoundsFired;
            hits += episode.Transitions.Sum(t => t.RewardComponents.HitsScored);
            if (episode.TerminalReason == CombatTerminalReason.OpponentDestroyed) splashes++;
        }
        _out.WriteLine($"staged                 {scenarios.Count}");
        _out.WriteLine($"graded                 {engagements}");
        _out.WriteLine($"left supported volume  {outOfVolume}  (runner has no out-of-bounds terminal)");
        _out.WriteLine($"opponent rounds fired  {roundsFired}");
        _out.WriteLine($"opponent hits          {hits}");
        _out.WriteLine($"opponent splashes      {splashes}");
        _out.WriteLine($"rounds per engagement  "
            + $"{(engagements == 0 ? 0.0 : (double)roundsFired / engagements):F2}");
    }
}
