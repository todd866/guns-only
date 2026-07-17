using GunsOnly.Sim.Doctrine;
namespace GunsOnly.Sim;
public enum PromptCue { None, Pull, Ease, Unload, RollLeft, RollRight }
public static class PromptLogic {
    public static PromptCue Cue(DoctrineAdvice advice, in PilotCommand actual, DemandTier tier) {
        double bankErr = advice.RecommendedBank - actual.BankTarget;
        if (System.Math.Abs(bankErr) > 0.44) return bankErr > 0 ? PromptCue.RollRight : PromptCue.RollLeft;
        double gErr = advice.RecommendedG - actual.GDemand;
        if (gErr > 0.8) return PromptCue.Pull;
        if (gErr < -0.8) return PromptCue.Ease;
        return PromptCue.None;
    }
}
