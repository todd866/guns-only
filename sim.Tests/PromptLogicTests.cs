using GunsOnly.Sim; using GunsOnly.Sim.Doctrine; using Xunit;
public class PromptLogicTests {
    [Fact] public void UnderPullingPromptsPull() =>
        Assert.Equal(PromptCue.Pull, PromptLogic.Cue(new DoctrineAdvice(5.0, 0, "x"), new PilotCommand(2.0, 0, 1, 0), DemandTier.Baseline));
    [Fact] public void OverPullingPromptsEase() =>
        Assert.Equal(PromptCue.Ease, PromptLogic.Cue(new DoctrineAdvice(3.0, 0, "x"), new PilotCommand(5.5, 0, 1, 0), DemandTier.Valley));
    [Fact] public void BankErrorPromptsRoll() =>
        Assert.Equal(PromptCue.RollRight, PromptLogic.Cue(new DoctrineAdvice(2.0, 1.2, "x"), new PilotCommand(2.0, 0.2, 1, 0), DemandTier.Valley));
    [Fact] public void OnAdviceIsQuiet() =>
        Assert.Equal(PromptCue.None, PromptLogic.Cue(new DoctrineAdvice(4.0, 0.9, "x"), new PilotCommand(3.9, 0.95, 1, 0), DemandTier.Valley));
}
