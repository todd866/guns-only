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
    const double RollReturnRate = 0.6; // rad/s — reflex return toward wings-level when roll is un-commanded
    const double RollLevelDelayMs = 1500; // wait this long after the last roll input before settling to level
    double _rollIdleMs;

    // MAGIC CARPET (approach mode). The G-command grammar is wrong for a landing: with the valley
    // pinned at 1 G the pull has no authority, so the aircraft just sinks (the "uncontrollable"
    // approach the telemetry showed — g_cmd stuck at 1.0 while pulling). In approach mode pitch
    // commands the FLIGHT PATH: hold the glideslope, pull raises the aimpoint (shallower/climb),
    // push lowers it, and auto-throttle holds on-speed. This is what a competent pilot flies.
    public bool ApproachMode;
    double _targetGamma; bool _approachInit;
    const double ApproachGlideslope = -0.061;  // −3.5°
    const double ApproachSpeedMps = 70.0;      // ~136 kt on-speed
    const double GammaMoveRate = 0.11;         // rad/s the aimpoint slews while pull/push held (fine ball control)
    const double GammaHoldGain = 1.4;
    const double GammaLo = -0.11, GammaHi = 0.035;  // approach band: steepen a bit, or shallow to a slight float

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

        if (ApproachMode) {
            if (!_approachInit) { _targetGamma = ApproachGlideslope; _approachInit = true; }
            if (pull != KeyPhase.Idle) _targetGamma += GammaMoveRate * dt;   // pull → aimpoint up
            if (push != KeyPhase.Idle) _targetGamma -= GammaMoveRate * dt;   // push → aimpoint down
            _targetGamma = System.Math.Clamp(_targetGamma, GammaLo, GammaHi);
            // Command the G that drives the actual flight-path angle toward the target and holds it:
            // trim n = cos γ / cos φ, plus a proportional term. This is the Magic-Carpet hold loop.
            double gamma = s.Gamma, bank = s.Bank, V = System.Math.Max(s.Speed, 30.0);
            double trimN = System.Math.Cos(gamma) / System.Math.Max(0.3, System.Math.Cos(bank));
            double nCmd = trimN + (V / FlightModel.G0) * GammaHoldGain * (_targetGamma - gamma);
            double lo = System.Math.Max(FlightModel.NzAeroMin(s, p), -0.5);
            _gCmd = System.Math.Clamp(nCmd, lo, maxPerform);   // direct hold — no lag on the path loop
            Tier = DemandTier.Valley; ValleyG = trimN; ValleyBank = 0.0;
        } else {
        double target; DemandTier tier;
        if (pull != KeyPhase.Idle) {
            tier = over ? DemandTier.OverDemand : DemandTier.Valley;
            StickyOffsetG -= pushTaps * StickyStepG;                       // ease taps (<=0)
            double baseG = over ? cap : ValleyG;                          // override => pull to the limit
            target = System.Math.Clamp(baseG + StickyOffsetG, System.Math.Min(1.0, cap), cap);
        }
        else if (push != KeyPhase.Idle) {
            // Push should BUNT — command negative G so the nose actively drops — not merely unload
            // to 0 G, which just floats (the "pushing does very little" feel). Held push goes to a
            // moderate negative; Override pushes to the aero/structural negative limit.
            tier = over ? DemandTier.OverDemand : DemandTier.Valley;
            double pushFloor = System.Math.Max(FlightModel.NzAeroMin(s, p), -1.5);
            target = over ? pushFloor : System.Math.Max(pushFloor, -1.0);
        }
        else { tier = DemandTier.Baseline; StickyOffsetG = 0; target = 1.0; }
        Tier = tier;
        _gCmd += (target - _gCmd) * System.Math.Min(1.0, dt / Tau);
        }

        // Roll: taps adopt the advice bank (quantized intent); holds slew continuously; and when
        // NEITHER is commanded the reflex returns the bank toward WINGS-LEVEL at a gentle rate.
        // This is the "wing-drop pickup" the pilot asked for: release the roll and the wings settle
        // level, so you don't sit at a bank you didn't ask for. (First attempt returned toward the
        // DOCTRINE bank — but that's a hard turn toward the bandit, so the aircraft parked itself
        // at ~60° and fought the pilot; the telemetry showed it stuck there for 25 s. Wings-level
        // is what "pick up the wing" means. To SUSTAIN a bank, hold the roll key.)
        // TODO difficulty ladder: scale RollReturnRate → 0 at max difficulty (you fly the wings).
        int rTaps = keys.TakeTaps(GKey.RollRight, nowMs), lTaps = keys.TakeTaps(GKey.RollLeft, nowMs);
        bool rollRight = keys.PhaseAt(GKey.RollRight, nowMs) != KeyPhase.Idle;
        bool rollLeft = keys.PhaseAt(GKey.RollLeft, nowMs) != KeyPhase.Idle;
        bool rollInput = rollRight || rollLeft || rTaps > 0 || lTaps > 0;
        _rollIdleMs = rollInput ? 0.0 : _rollIdleMs + dt * 1000.0;
        if (rTaps > 0 || lTaps > 0) _bankTarget = ValleyBank;
        if (rollRight) _bankTarget += RollHoldRate * dt;
        if (rollLeft) _bankTarget -= RollHoldRate * dt;
        // Settle to level only AFTER a hold-off: a fresh tap/hold sets a bank that persists, and
        // only a bank you've walked away from (no roll input for RollLevelDelayMs) washes out.
        if (!rollInput && _rollIdleMs > RollLevelDelayMs) {
            double err = System.Math.IEEERemainder(0.0 - _bankTarget, 2 * System.Math.PI); // toward wings-level
            _bankTarget += System.Math.Clamp(err, -RollReturnRate * dt, RollReturnRate * dt);
        }
        _bankTarget = System.Math.IEEERemainder(_bankTarget, 2 * System.Math.PI); // circular: continuous roll through inverted

        int thUp = keys.TakeTaps(GKey.ThrottleUp, nowMs), thDn = keys.TakeTaps(GKey.ThrottleDown, nowMs);
        _throttleIdx = System.Math.Clamp(_throttleIdx + thUp - thDn, 0, ThrottleDetents.Length - 1);
        if (ApproachMode) {
            // Auto-throttle holds on-speed: this is why the aircraft was running away to 224 kt.
            // On a −3.5° glideslope the trim throttle is nearly idle (gravity does most of the work),
            // so the base is low and the gain firm — cut to idle when fast, spool up when slow.
            Throttle = System.Math.Clamp(0.16 + 0.026 * (ApproachSpeedMps - s.Speed), 0.0, 1.0);
        } else {
            Throttle = ThrottleDetents[_throttleIdx];
        }

        double rudder = 0;
        if (keys.PhaseAt(GKey.RudderRight, nowMs) != KeyPhase.Idle) rudder += 0.6;
        if (keys.PhaseAt(GKey.RudderLeft, nowMs) != KeyPhase.Idle)  rudder -= 0.6;

        Command = new PilotCommand(_gCmd, _bankTarget, Throttle, rudder);
    }
}
