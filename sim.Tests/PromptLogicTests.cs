using GunsOnly.Sim; using GunsOnly.Sim.Doctrine; using Xunit;
public class PromptLogicTests {
    static PilotCommand Cmd(double g, double bank) => new(g, bank, 1, 0);
    [Fact] public void UnderPullingInValleyPromptsPull() =>
        Assert.Equal(PromptCue.Pull, new PromptTracker().Cue(new DoctrineAdvice(5.0, 0, "x"), Cmd(2.0, 0), DemandTier.Valley));
    [Fact] public void OverPullingInValleyPromptsEase() =>
        Assert.Equal(PromptCue.Ease, new PromptTracker().Cue(new DoctrineAdvice(3.0, 0, "x"), Cmd(5.5, 0), DemandTier.Valley));
    [Fact] public void BankErrorPromptsRoll() =>
        Assert.Equal(PromptCue.RollRight, new PromptTracker().Cue(new DoctrineAdvice(2.0, 1.2, "x"), Cmd(2.0, 0.2), DemandTier.Valley));
    [Fact] public void OnAdviceIsQuiet() =>
        Assert.Equal(PromptCue.None, new PromptTracker().Cue(new DoctrineAdvice(4.0, 0.9, "x"), Cmd(3.9, 0.95), DemandTier.Valley));
    [Fact] public void WrappedBankErrorIsQuiet() =>
        Assert.Equal(PromptCue.None, new PromptTracker().Cue(new DoctrineAdvice(2.0, 3.13, "x"), Cmd(2.0, -3.13), DemandTier.Valley));
    [Fact] public void BaselineDecayIsNotNaggedToEase() =>
        Assert.Equal(PromptCue.None, new PromptTracker().Cue(new DoctrineAdvice(4.0, 0, "x"), Cmd(5.5, 0), DemandTier.Baseline));
    [Fact] public void BaselineWithUnloadAdvicePromptsUnload() =>
        Assert.Equal(PromptCue.Unload, new PromptTracker().Cue(new DoctrineAdvice(0.0, 0, "x"), Cmd(2.0, 0), DemandTier.Baseline));
    [Fact] public void OverDemandSuppressesGNagging() =>
        Assert.Equal(PromptCue.None, new PromptTracker().Cue(new DoctrineAdvice(3.0, 0, "x"), Cmd(7.0, 0), DemandTier.OverDemand));
    [Fact] public void CueLatchesThroughSmallOscillation() {
        var t = new PromptTracker();
        Assert.Equal(PromptCue.Pull, t.Cue(new DoctrineAdvice(3.0, 0, "x"), Cmd(2.1, 0), DemandTier.Valley));
        Assert.Equal(PromptCue.Pull, t.Cue(new DoctrineAdvice(3.0, 0, "x"), Cmd(2.3, 0), DemandTier.Valley));
        Assert.Equal(PromptCue.None, t.Cue(new DoctrineAdvice(3.0, 0, "x"), Cmd(2.7, 0), DemandTier.Valley));
    }
}
