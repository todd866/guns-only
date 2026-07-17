using System.Collections.Generic;
namespace GunsOnly.Sim;
public enum GKey { PullUp, PushDown, RollLeft, RollRight, RudderLeft, RudderRight, ThrottleUp, ThrottleDown, Trigger, Padlock, KnockItOff, Restart }
public enum KeyPhase { Idle, Held, DoubleHeld }

/// Tap/hold/double-tap-hold classifier. Taps are DEFERRED: a completed tap becomes
/// observable via TakeTaps only after DoubleGapMs elapses without a re-press, so a tap
/// can never be applied by a control layer and then retroactively become the arming tap
/// of a double. Outcomes are deterministic in the timestamps fed, independent of polling
/// cadence. Cost: tap actions land ~DoubleGapMs late (tunable; explicit feel-gate item).
public sealed class KeyGrammar {
    public double TapMaxMs = 180, DoubleGapMs = 250;
    sealed class KS {
        public bool Down, IsDouble;
        public double PressT = double.NegativeInfinity, ReleaseT = double.NegativeInfinity;
        public double? PendingTapT;   // release time of an uncommitted tap (double-arm candidate)
        public int Committed;
    }
    readonly Dictionary<GKey, KS> _k = new();
    KS S(GKey k) => _k.TryGetValue(k, out var s) ? s : _k[k] = new KS();

    public void Feed(GKey key, bool pressed, double timeMs) {
        var s = S(key);
        if (pressed && !s.Down) {
            if (s.PendingTapT is double armT && timeMs - armT <= DoubleGapMs) {
                s.IsDouble = true;            // arming tap provisionally consumed
                s.PendingTapT = null;
            } else {
                CommitExpired(s, timeMs);
                s.IsDouble = false;
            }
            s.Down = true; s.PressT = timeMs;
        } else if (!pressed && s.Down) {
            s.Down = false; s.ReleaseT = timeMs;
            bool shortPress = (timeMs - s.PressT) <= TapMaxMs;
            if (s.IsDouble) {
                if (shortPress) {             // double aborted into tap-tap: restore + re-arm
                    s.Committed++;            // the restored first tap
                    s.PendingTapT = timeMs;   // second tap pending
                }
                // else: completed DoubleHeld — arming tap consumed for good
                s.IsDouble = false;
            } else if (shortPress) {
                s.PendingTapT = timeMs;
            }
        }
    }
    static void CommitExpiredImpl(KS s, double nowMs, double gapMs) {
        if (s.PendingTapT is double t && nowMs - t > gapMs) { s.Committed++; s.PendingTapT = null; }
    }
    void CommitExpired(KS s, double nowMs) => CommitExpiredImpl(s, nowMs, DoubleGapMs);

    public KeyPhase PhaseAt(GKey key, double nowMs) {
        var s = S(key);
        return s.Down ? (s.IsDouble ? KeyPhase.DoubleHeld : KeyPhase.Held) : KeyPhase.Idle;
    }
    public KeyPhase Phase(GKey key) => PhaseAt(key, 0);
    /// Completed taps whose double window has expired as of nowMs.
    public int TakeTaps(GKey key, double nowMs) {
        var s = S(key);
        CommitExpired(s, nowMs);
        int n = s.Committed; s.Committed = 0; return n;
    }
}
