using GunsOnly.Sim.Doctrine;
namespace GunsOnly.Sim;
public enum ValleyVariant { DoctrineDeep, PhysicsOnly }

public sealed class DetentLayer {
    public ValleyVariant Variant = ValleyVariant.DoctrineDeep;
    public PilotCommand Command { get; private set; } = new(1.0, 0.0, 0.85, 0.0);
    public double StickyOffsetG { get; private set; }
    public DemandTier Tier { get; private set; } = DemandTier.Baseline;
    public double ValleyG { get; private set; } = 1.0;
    public double ValleyBank { get; private set; }
    public double Throttle { get; private set; } = 0.85;

    static readonly double[] ThrottleDetents = { 0.0, 0.55, 0.85, 1.0 };
    int _throttleIdx = 2;
    int _pullReleases;
    double _gCmd = 1.0, _bankTarget;
    const double Tau = 0.22, StickyStepG = 0.5, RollHoldRate = 1.6; // rad/s while roll key held

    public void Tick(KeyGrammar keys, double nowMs, in AircraftState s, in AircraftParams p, DoctrineAdvice advice, double dt) {
        double maxPerform = Protection.MaxPerformG(s, p);
        double hardMax = Protection.HardMaxG(s, p);
        ValleyG = Variant == ValleyVariant.DoctrineDeep ? System.Math.Min(advice.RecommendedG, maxPerform) : maxPerform;
        ValleyBank = advice.RecommendedBank;

        var pull = keys.PhaseAt(GKey.PullUp, nowMs);
        var push = keys.PhaseAt(GKey.PushDown, nowMs);
        // Sticky clears on actual pull-release EVENTS, not sampled Idle — a release+re-press
        // batched between ticks must still reset (reviewer finding).
        int pr = keys.ReleaseCount(GKey.PullUp);
        if (pr != _pullReleases) { StickyOffsetG = 0; _pullReleases = pr; }
        keys.TakeTaps(GKey.PullUp, nowMs);                    // drained: a held key cannot be tapped; idle taps are no-ops
        int pushTaps;
        if (pull != KeyPhase.Idle) {                           // ease taps must belong to THIS hold (reviewer finding:
            double holdStart = keys.PressTime(GKey.PullUp);    //  a deferred tap can straddle a release/re-press)
            pushTaps = keys.TakeTapsSince(GKey.PushDown, holdStart, nowMs);
        } else {
            keys.TakeTapsSince(GKey.PushDown, double.MaxValue, nowMs); // drain stale ease taps
            pushTaps = 0;
        }

        // Override (spacebar): the ONLY way past the protection boundary. Bare arrows are
        // always envelope-protected and can never depart; holding Override raises the ceiling
        // to the aero/structural hard max, so a pull rides into the buffet (and, with a real
        // M1 aero model, can depart) — deliberate, at your own risk. Replaces the old
        // double-tap-hold vocabulary entirely (arrows no longer reach OverDemand).
        bool over = keys.PhaseAt(GKey.Override, nowMs) != KeyPhase.Idle;
        double cap = over ? hardMax : maxPerform;

        double target; DemandTier tier;
        if (pull != KeyPhase.Idle) {
            tier = over ? DemandTier.OverDemand : DemandTier.Valley;
            StickyOffsetG -= pushTaps * StickyStepG;                       // ease taps (<=0)
            double baseG = over ? cap : ValleyG;                          // override => pull to the limit
            target = System.Math.Clamp(baseG + StickyOffsetG, System.Math.Min(1.0, cap), cap);
        }
        else if (push != KeyPhase.Idle) { tier = DemandTier.Valley; target = 0.0; } // unload
        else { tier = DemandTier.Baseline; StickyOffsetG = 0; target = 1.0; }
        Tier = tier;
        _gCmd += (target - _gCmd) * System.Math.Min(1.0, dt / Tau);

        // Roll: taps adopt the advice bank (quantized intent); holds slew continuously.
        int rTaps = keys.TakeTaps(GKey.RollRight, nowMs), lTaps = keys.TakeTaps(GKey.RollLeft, nowMs);
        if (rTaps > 0 || lTaps > 0) _bankTarget = ValleyBank;
        if (keys.PhaseAt(GKey.RollRight, nowMs) != KeyPhase.Idle) _bankTarget += RollHoldRate * dt;
        if (keys.PhaseAt(GKey.RollLeft, nowMs) != KeyPhase.Idle)  _bankTarget -= RollHoldRate * dt;
        _bankTarget = System.Math.IEEERemainder(_bankTarget, 2 * System.Math.PI); // circular: continuous roll through inverted

        int thUp = keys.TakeTaps(GKey.ThrottleUp, nowMs), thDn = keys.TakeTaps(GKey.ThrottleDown, nowMs);
        _throttleIdx = System.Math.Clamp(_throttleIdx + thUp - thDn, 0, ThrottleDetents.Length - 1);
        Throttle = ThrottleDetents[_throttleIdx];

        double rudder = 0;
        if (keys.PhaseAt(GKey.RudderRight, nowMs) != KeyPhase.Idle) rudder += 0.6;
        if (keys.PhaseAt(GKey.RudderLeft, nowMs) != KeyPhase.Idle)  rudder -= 0.6;

        Command = new PilotCommand(_gCmd, _bankTarget, Throttle, rudder);
    }
}
