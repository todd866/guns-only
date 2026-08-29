using System.Linq;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// THE CLONE MUST FLY THE FUNCTION IT LEARNED.
///
/// A behaviour-cloning pipeline that computes features one way for training and another way for
/// inference fails silently: the training metrics are unchanged, and only the flying is wrong.
/// The manifest therefore carries reference cases, and loading it re-evaluates them here.
public class ClonedPilotPolicyTests {
    const string ManifestPath = "../../../../analysis/owner-pilot-clone.json";
    readonly ITestOutputHelper _out;
    public ClonedPilotPolicyTests(ITestOutputHelper o) { _out = o; }

    [FactIfData(ManifestPath)]
    public void TheManifestReproducesTheTrainersOwnForwardPass() {
        // The constructor verifies every reference case and throws if any head disagrees.
        var policy = new ClonedPilotPolicy(ManifestPath);
        Assert.NotNull(policy);
    }

    [FactIfData(ManifestPath)]
    public void TheCloneFliesInsideTheSeamAndProducesUsableControls() {
        var policy = new ClonedPilotPolicy(ManifestPath);
        var engagements = OwnerEngagementScenarios.LoadEngagements(ManifestPath.Replace(
            "owner-pilot-clone.json", "owner-engagements.jsonl"));
        Assert.NotEmpty(engagements);

        var episode = SeededCombatBatchRunner.RunEpisode(
            episodeIndex: 0, scenario: engagements[0].Scenario,
            referenceSkill: PilotSkill.Veteran,
            behaviorSkill: PilotSkill.Ace,
            maximumSeconds: 20.0,
            referencePolicy: policy);

        Assert.NotEmpty(episode.Transitions);
        // Whatever it learned, the kernel must have been able to fly it: finite commands, and a
        // fight that reached a terminal rather than diverging.
        Assert.All(episode.Transitions, t => Assert.True(t.Action.IsFinite));
        Assert.NotEqual(CombatTerminalReason.None, episode.TerminalReason);
        _out.WriteLine($"clone flew {episode.Transitions.Count} ticks, "
            + $"terminal {episode.TerminalReason}");
    }

    /// A clone trained on a different feature version must be refused, not reinterpreted.
    [FactIfData(ManifestPath)]
    public void AManifestFromADifferentFeatureVersionIsRefused() {
        string text = System.IO.File.ReadAllText(ManifestPath);
        // The manifest is written by json.dumps, which puts a space after the colon.
        string wrong = text.Replace(
            $"\"feature_version\": {HumanPilotFeatures.Version}",
            $"\"feature_version\": {HumanPilotFeatures.Version + 1}");
        Assert.NotEqual(text, wrong);
        string path = System.IO.Path.GetTempFileName();
        System.IO.File.WriteAllText(path, wrong);
        try {
            var error = Assert.Throws<System.InvalidOperationException>(
                () => new ClonedPilotPolicy(path));
            Assert.Contains("feature version", error.Message);
        } finally {
            System.IO.File.Delete(path);
        }
    }
}
