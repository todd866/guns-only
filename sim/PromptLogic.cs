using GunsOnly.Sim.Doctrine;
namespace GunsOnly.Sim;
public enum PromptCue { None, Pull, Ease, Unload, RollLeft, RollRight }

/// Stateful cue selection with hysteresis: a cue engages past ENTER thresholds and holds
/// until the error falls below EXIT, so HUD prompts cannot flicker at tick rate. Tier-aware:
/// baseline decay is never nagged, over-demand deviation is deliberate and not G-nagged.
public sealed class PromptTracker {
    public double GEnter = 0.8, GExit = 0.4, BankEnter = 0.44, BankExit = 0.22;
    PromptCue _held = PromptCue.None;

    public PromptCue Cue(DoctrineAdvice advice, in PilotCommand actual, DemandTier tier) {
        double bankErr = System.Math.IEEERemainder(advice.RecommendedBank - actual.BankTarget, 2 * System.Math.PI);
        double gErr = advice.RecommendedG - actual.GDemand;
        bool rollHeld = _held is PromptCue.RollLeft or PromptCue.RollRight;

        PromptCue want = PromptCue.None;
        if (System.Math.Abs(bankErr) > (rollHeld ? BankExit : BankEnter))
            want = bankErr > 0 ? PromptCue.RollRight : PromptCue.RollLeft;
        else switch (tier) {
            case DemandTier.Valley:
                if (gErr > (_held == PromptCue.Pull ? GExit : GEnter)) want = PromptCue.Pull;
                else if (gErr < -(_held == PromptCue.Ease ? GExit : GEnter)) want = PromptCue.Ease;
                break;
            case DemandTier.Baseline:
                if (advice.RecommendedG < 0.2 && actual.GDemand > 0.8) want = PromptCue.Unload;
                else if (gErr > (_held == PromptCue.Pull ? GExit : GEnter)) want = PromptCue.Pull;
                break;
            case DemandTier.OverDemand:
                break; // deliberate deviation: no G nagging (roll cues still handled above)
        }
        _held = want;
        return want;
    }
}
