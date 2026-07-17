using System.Collections.Generic;
namespace GunsOnly.Sim;
public enum GKey { PullUp, PushDown, RollLeft, RollRight, RudderLeft, RudderRight, ThrottleUp, ThrottleDown, Trigger, Padlock, KnockItOff, Restart }
public enum KeyPhase { Idle, Held, DoubleHeld }

public sealed class KeyGrammar {
    public double TapMaxMs = 180, DoubleGapMs = 250;
    sealed class KS { public bool Down; public double PressT = double.NegativeInfinity, ReleaseT = double.NegativeInfinity; public bool DoubleArmed; public bool IsDouble; public int Taps; }
    readonly Dictionary<GKey, KS> _k = new();
    KS S(GKey k) => _k.TryGetValue(k, out var s) ? s : _k[k] = new KS();

    public void Feed(GKey key, bool pressed, double timeMs) {
        var s = S(key);
        if (pressed && !s.Down) {
            s.Down = true;
            s.IsDouble = s.DoubleArmed && (timeMs - s.ReleaseT) <= DoubleGapMs;
            if (s.IsDouble) { s.Taps = System.Math.Max(0, s.Taps - 1); } // consume the arming tap
            s.PressT = timeMs;
        } else if (!pressed && s.Down) {
            s.Down = false; s.ReleaseT = timeMs;
            bool wasTap = (timeMs - s.PressT) <= TapMaxMs && !s.IsDouble;
            if (wasTap) { s.Taps++; s.DoubleArmed = true; } else s.DoubleArmed = false;
            s.IsDouble = false;
        }
    }
    public KeyPhase PhaseAt(GKey key, double nowMs) {
        var s = S(key);
        if (!s.Down) return KeyPhase.Idle;
        if (s.IsDouble) return KeyPhase.DoubleHeld;
        return KeyPhase.Held; // held from the moment of press; taps are recognized on release
    }
    public KeyPhase Phase(GKey key) => S(key).Down ? (S(key).IsDouble ? KeyPhase.DoubleHeld : KeyPhase.Held) : KeyPhase.Idle;
    public int TakeTaps(GKey key) { var s = S(key); int t = s.Taps; s.Taps = 0; return t; }
}
