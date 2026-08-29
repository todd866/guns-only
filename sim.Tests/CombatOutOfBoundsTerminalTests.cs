using System.Linq;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;
using Xunit;

namespace GunsOnly.Sim.Tests;

/// A FIGHT THAT HITS THE GROUND IS AN OUTCOME, NOT AN ERROR.
///
/// The runner used to throw when either aircraft left its supported flight volume, with the note
/// "add explicit crash/out-of-bounds terminals before using learned controls here". That made real
/// geometries unusable: the owner fights lower than the scripted probe ever does, and 13 of 158 of
/// his engagements left the volume. An exception also cannot be learned from — the episode is
/// discarded rather than penalised, so a policy that flies into the ground is graded as though the
/// engagement never happened.
public class CombatOutOfBoundsTerminalTests {
    /// Flies straight down at maximum command. Nothing else can happen to this episode.
    sealed class DivePolicy : ICombatLearningPolicy {
        public CombatPolicyDecision Decide(in CombatPolicyObservation observation) =>
            // Inverted and pulling: the shortest route out of the bottom of the volume.
            new(new PilotCommand(9.0, System.Math.PI, 1.0, 0.0), false);
    }

    [Fact]
    public void FlyingOutOfTheSupportedVolumeEndsTheEpisodeInsteadOfThrowing() {
        var scenario = CombatTrainingScenarioFactory.SeededOffsetMerge(0x0ffb0d01UL);
        var episode = SeededCombatBatchRunner.RunEpisode(
            episodeIndex: 0, scenario: scenario,
            referenceSkill: PilotSkill.Competent,
            behaviorSkill: PilotSkill.Competent,
            maximumSeconds: 45.0,
            learningPolicy: new DivePolicy());

        Assert.Equal(CombatTerminalReason.OwnshipOutOfBounds, episode.TerminalReason);
        Assert.NotEmpty(episode.Transitions);
        Assert.True(episode.Transitions[^1].Terminal,
            "the out-of-bounds tuple must close the episode");
    }

    /// It must be a LOSS, not a neutral stop. A policy that discovers the ground is a way to end an
    /// episode it is losing would otherwise learn to use it.
    [Fact]
    public void LeavingTheVolumeIsPenalisedLikeBeingDestroyed() {
        var scenario = CombatTrainingScenarioFactory.SeededOffsetMerge(0x0ffb0d02UL);
        var episode = SeededCombatBatchRunner.RunEpisode(
            episodeIndex: 0, scenario: scenario,
            referenceSkill: PilotSkill.Competent,
            behaviorSkill: PilotSkill.Competent,
            maximumSeconds: 45.0,
            learningPolicy: new DivePolicy());

        Assert.Equal(CombatTerminalReason.OwnshipOutOfBounds, episode.TerminalReason);
        Assert.True(episode.Transitions[^1].Reward < 0.0,
            $"terminal reward was {episode.Transitions[^1].Reward} — flying out of the world "
            + "must not be a cheaper way to end a losing engagement than fighting it");
    }
}
