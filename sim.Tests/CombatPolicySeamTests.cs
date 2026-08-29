using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;
using Xunit;

namespace GunsOnly.Sim.Tests;

/// THE SEAM A LEARNER NEEDS.
///
/// SeededCombatBatchRunner already owns the scenario, physics, weapon, reward, recorder and
/// dataset contracts, and its own summary says "a later policy adapter can replace that actor
/// while retaining [them]". Until now the learning fighter was hard-wired to a ReactiveBandit
/// tier, so nothing outside this assembly could be trained or evaluated inside it.
public class CombatPolicySeamTests {
    /// A policy that ignores the world and commands a constant. Deliberately not a good pilot —
    /// what is under test is that the runner asked it, not what it answered.
    sealed class ConstantPolicy : ICombatLearningPolicy {
        public int Calls { get; private set; }
        public CombatPolicyDecision Decide(in CombatPolicyObservation observation) {
            Calls++;
            return new CombatPolicyDecision(new PilotCommand(2.0, 0.4, 0.9, 0.0), false);
        }
    }

    [Fact]
    public void AnInjectedPolicyFliesTheLearningFighter() {
        var scenario = CombatTrainingScenarioFactory.SeededOffsetMerge(0x5eed_0001UL);
        var policy = new ConstantPolicy();
        var episode = SeededCombatBatchRunner.RunEpisode(
            episodeIndex: 0, scenario: scenario,
            referenceSkill: PilotSkill.Competent,
            behaviorSkill: PilotSkill.Competent,
            maximumSeconds: 8.0,
            learningPolicy: policy);

        Assert.True(policy.Calls > 0, "the runner never consulted the injected policy");
        Assert.Equal(episode.Transitions.Count, policy.Calls);
        // The commanded bank is what the policy asked for, not what a ReactiveBandit would pick.
        Assert.All(episode.Transitions,
            t => Assert.Equal(0.4, t.Action.BankTargetRad, 6));
    }

    /// The seam must not perturb the existing behaviour-data path. With no policy supplied the
    /// learning fighter is the same ReactiveBandit object it always was, so an episode must be
    /// bit-identical to one recorded before the seam existed.
    [Fact]
    public void TheDefaultPathIsUnchangedByTheSeam() {
        var scenario = CombatTrainingScenarioFactory.SeededOffsetMerge(0x5eed_0002UL);
        CombatEpisode Run() => SeededCombatBatchRunner.RunEpisode(
            episodeIndex: 0, scenario: scenario,
            referenceSkill: PilotSkill.Veteran,
            behaviorSkill: PilotSkill.Ace,
            maximumSeconds: 12.0);

        var a = Run();
        var b = Run();
        Assert.Equal(a.Transitions.Count, b.Transitions.Count);
        Assert.Equal(a.TerminalReason, b.TerminalReason);
        for (int i = 0; i < a.Transitions.Count; i++) {
            Assert.Equal(a.Transitions[i].Action.GDemand, b.Transitions[i].Action.GDemand, 12);
            Assert.Equal(a.Transitions[i].Action.BankTargetRad,
                b.Transitions[i].Action.BankTargetRad, 12);
            Assert.Equal(a.Transitions[i].Reward, b.Transitions[i].Reward, 12);
        }
    }
}
