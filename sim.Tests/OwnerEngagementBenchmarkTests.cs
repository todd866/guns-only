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

    [FactIfData(EngagementsPath)]
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
    /// The baseline a learned policy has to beat. Not a contract — a measurement, reported rather
    /// than asserted.
    [Fact(Skip = "Benchmark, not a contract. Un-skip to re-measure. 2026-08-29 baseline, owner "
        + "inputs replayed on all 158: opponent fired 210 rounds, 35 hits, KILLED HIM 9 times; "
        + "3 opponent and 7 owner out-of-bounds; 1.33 rounds per engagement.")]
    public void MeasureTheOpponentAgainstTheOwnersOwnFights() {
        var engagements = OwnerEngagementScenarios.LoadEngagements(EngagementsPath);
        int graded = 0, roundsFired = 0, hits = 0, splashes = 0;
        int outOfBounds = 0, ownerLost = 0, replayed = 0, noInputs = 0;
        foreach (OwnerEngagement engagement in engagements) {
            // The owner's OWN controls fly his aircraft where the tape recorded them. Open loop:
            // faithful at the merge, decreasingly so as the opponent diverges from the fight the
            // tape contains — so this grades the opening of a real engagement, not a whole one.
            ICombatLearningPolicy? owner = engagement.OwnerInputs.Count > 0
                ? new RecordedInputPolicy(engagement.OwnerInputs)
                : null;
            if (owner is null) noInputs++; else replayed++;

            var episode = SeededCombatBatchRunner.RunEpisode(
                episodeIndex: 0, scenario: engagement.Scenario,
                referenceSkill: PilotSkill.Veteran,   // used only when no inputs were recorded
                behaviorSkill: PilotSkill.Ace,        // the shipped opponent, under test
                maximumSeconds: 25.0,
                referencePolicy: owner);
            graded++;
            roundsFired += episode.RoundsFired;
            hits += episode.Transitions.Sum(t => t.RewardComponents.HitsScored);
            switch (episode.TerminalReason) {
                case CombatTerminalReason.OpponentDestroyed: splashes++; break;
                case CombatTerminalReason.OwnshipOutOfBounds: outOfBounds++; break;
                case CombatTerminalReason.ReferenceOutOfBounds: ownerLost++; break;
            }
        }
        _out.WriteLine($"engagements            {engagements.Count}");
        _out.WriteLine($"graded                 {graded}   (none discarded)");
        _out.WriteLine($"owner inputs replayed  {replayed}   (scripted stand-in: {noInputs})");
        _out.WriteLine($"opponent rounds fired  {roundsFired}");
        _out.WriteLine($"opponent hits          {hits}");
        _out.WriteLine($"opponent KILLED him    {splashes}");
        _out.WriteLine($"opponent flew out      {outOfBounds}");
        _out.WriteLine($"owner flew out         {ownerLost}");
        _out.WriteLine($"rounds per engagement  "
            + $"{(graded == 0 ? 0.0 : (double)roundsFired / graded):F2}");
    }
}
