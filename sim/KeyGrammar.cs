using System.Collections.Generic;
namespace GunsOnly.Sim;
public enum GKey {
    PullUp, PushDown, RollLeft, RollRight, RudderLeft, RudderRight,
    ThrottleUp, ThrottleDown, Trigger, Padlock, KnockItOff, Restart, Override,
    GearToggle, FlapUp, FlapDown, EmergencyGearRelease, GearHornCutout,
    ConfirmGearExtensionFailure, InspectGearDownlocks, AutoGcasOverride
}
public enum KeyPhase { Idle, Held, DoubleHeld }

/// A completed short press. PressSequence is monotonic per key, so a control consumer can tell
/// whether it already sampled this exact down episode before the deferred tap becomes committed.
/// That distinction matters when browser input edges are batched between fixed simulation ticks:
/// unseen taps need one deterministic pulse, while a press already flown continuously must not be
/// replayed a second time after the double-tap window expires.
public readonly record struct KeyTap(int PressSequence, double PressTimeMs, double ReleaseTimeMs);

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
        public KeyTap? PendingTap;   // uncommitted tap (double-arm candidate)
        public readonly System.Collections.Generic.List<KeyTap> Committed = new();
        public KeyTap? ConsumedArm;
        public int Presses, Releases;
    }
    readonly Dictionary<GKey, KS> _k = new();
    KS S(GKey k) => _k.TryGetValue(k, out var s) ? s : _k[k] = new KS();

    public void Feed(GKey key, bool pressed, double timeMs) {
        var s = S(key);
        if (pressed && !s.Down) {
            if (s.PendingTap is KeyTap arm && timeMs - arm.ReleaseTimeMs <= DoubleGapMs) {
                s.IsDouble = true;            // arming tap provisionally consumed
                s.ConsumedArm = arm;
                s.PendingTap = null;
            } else {
                CommitExpired(s, timeMs);
                s.IsDouble = false;
            }
            s.Down = true; s.PressT = timeMs; s.Presses++;
        } else if (!pressed && s.Down) {
            s.Down = false; s.ReleaseT = timeMs;
            s.Releases++;
            bool shortPress = (timeMs - s.PressT) <= TapMaxMs;
            var completed = new KeyTap(s.Presses, s.PressT, timeMs);
            if (s.IsDouble) {
                if (shortPress) {             // double aborted into tap-tap: restore + re-arm
                    s.Committed.Add(s.ConsumedArm ?? completed); // the restored first tap
                    s.PendingTap = completed;   // second tap pending
                } else {
                    s.ConsumedArm = null;
                }
                // else: completed DoubleHeld — arming tap consumed for good
                s.IsDouble = false;
            } else if (shortPress) {
                s.PendingTap = completed;
            }
        }
    }
    const int MaxBufferedTaps = 64; // bound: keys nobody drains (rudder etc.) must not grow forever
    static void CommitExpiredImpl(KS s, double nowMs, double gapMs) {
        if (s.PendingTap is KeyTap tap && nowMs - tap.ReleaseTimeMs > gapMs) {
            s.Committed.Add(tap);
            s.PendingTap = null;
        }
        if (s.Committed.Count > MaxBufferedTaps)
            s.Committed.RemoveRange(0, s.Committed.Count - MaxBufferedTaps);
    }
    void CommitExpired(KS s, double nowMs) => CommitExpiredImpl(s, nowMs, DoubleGapMs);

    public KeyPhase PhaseAt(GKey key, double nowMs) {
        var s = S(key);
        return s.Down ? (s.IsDouble ? KeyPhase.DoubleHeld : KeyPhase.Held) : KeyPhase.Idle;
    }
    public KeyPhase Phase(GKey key) => PhaseAt(key, 0);
    /// Completed taps whose double window has expired as of nowMs.
    public int TakeTaps(GKey key, double nowMs) {
        return TakeTapEvents(key, nowMs).Count;
    }
    /// Completed taps with stable press identities. Taking events drains the same queue as
    /// TakeTaps; a given key should have one owning consumer.
    public IReadOnlyList<KeyTap> TakeTapEvents(GKey key, double nowMs) {
        var s = S(key); CommitExpired(s, nowMs);
        if (s.Committed.Count == 0) return Array.Empty<KeyTap>();
        KeyTap[] result = s.Committed.ToArray();
        s.Committed.Clear();
        return result;
    }
    /// Taps RELEASED after sinceMs; older committed taps are discarded as stale.
    public int TakeTapsSince(GKey key, double sinceMs, double nowMs) {
        var s = S(key); CommitExpired(s, nowMs);
        int n = 0;
        foreach (var tap in s.Committed)
            if (tap.ReleaseTimeMs > sinceMs) n++;
        s.Committed.Clear(); return n;
    }
    public double PressTime(GKey key) => S(key).PressT;
    public int PressSequence(GKey key) => S(key).Presses;
    /// Cumulative release events for a key — lets consumers detect releases that happen
    /// entirely between their polls (release + re-press inside one tick).
    public int ReleaseCount(GKey key) => S(key).Releases;
}
