using System.Collections.Generic;
namespace GunsOnly.Sim;
public enum GKey { PullUp, PushDown, RollLeft, RollRight, RudderLeft, RudderRight, ThrottleUp, ThrottleDown, Trigger, Padlock, KnockItOff, Restart, Override }
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
        public readonly System.Collections.Generic.List<double> CommittedT = new();
        public double? ConsumedArmT;
        public int Releases;
    }
    readonly Dictionary<GKey, KS> _k = new();
    KS S(GKey k) => _k.TryGetValue(k, out var s) ? s : _k[k] = new KS();

    public void Feed(GKey key, bool pressed, double timeMs) {
        var s = S(key);
        if (pressed && !s.Down) {
            if (s.PendingTapT is double armT && timeMs - armT <= DoubleGapMs) {
                s.IsDouble = true;            // arming tap provisionally consumed
                s.ConsumedArmT = armT;
                s.PendingTapT = null;
            } else {
                CommitExpired(s, timeMs);
                s.IsDouble = false;
            }
            s.Down = true; s.PressT = timeMs;
        } else if (!pressed && s.Down) {
            s.Down = false; s.ReleaseT = timeMs;
            s.Releases++;
            bool shortPress = (timeMs - s.PressT) <= TapMaxMs;
            if (s.IsDouble) {
                if (shortPress) {             // double aborted into tap-tap: restore + re-arm
                    s.CommittedT.Add(s.ConsumedArmT ?? s.PressT); // the restored first tap
                    s.PendingTapT = timeMs;   // second tap pending
                } else {
                    s.ConsumedArmT = null;
                }
                // else: completed DoubleHeld — arming tap consumed for good
                s.IsDouble = false;
            } else if (shortPress) {
                s.PendingTapT = timeMs;
            }
        }
    }
    const int MaxBufferedTaps = 64; // bound: keys nobody drains (rudder etc.) must not grow forever
    static void CommitExpiredImpl(KS s, double nowMs, double gapMs) {
        if (s.PendingTapT is double t && nowMs - t > gapMs) { s.CommittedT.Add(t); s.PendingTapT = null; }
        if (s.CommittedT.Count > MaxBufferedTaps) s.CommittedT.RemoveRange(0, s.CommittedT.Count - MaxBufferedTaps);
    }
    void CommitExpired(KS s, double nowMs) => CommitExpiredImpl(s, nowMs, DoubleGapMs);

    public KeyPhase PhaseAt(GKey key, double nowMs) {
        var s = S(key);
        return s.Down ? (s.IsDouble ? KeyPhase.DoubleHeld : KeyPhase.Held) : KeyPhase.Idle;
    }
    public KeyPhase Phase(GKey key) => PhaseAt(key, 0);
    /// Completed taps whose double window has expired as of nowMs.
    public int TakeTaps(GKey key, double nowMs) {
        var s = S(key); CommitExpired(s, nowMs);
        int n = s.CommittedT.Count; s.CommittedT.Clear(); return n;
    }
    /// Taps RELEASED after sinceMs; older committed taps are discarded as stale.
    public int TakeTapsSince(GKey key, double sinceMs, double nowMs) {
        var s = S(key); CommitExpired(s, nowMs);
        int n = 0; foreach (var t in s.CommittedT) if (t > sinceMs) n++;
        s.CommittedT.Clear(); return n;
    }
    public double PressTime(GKey key) => S(key).PressT;
    /// Cumulative release events for a key — lets consumers detect releases that happen
    /// entirely between their polls (release + re-press inside one tick).
    public int ReleaseCount(GKey key) => S(key).Releases;
}
