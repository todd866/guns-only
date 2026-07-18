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

    double _throttleLever = 0.85;   // continuous, 0..1.3 (>1 = afterburner)
    bool _manualThrottle;   // on the approach, the pilot touching W/S stands the auto-throttle down
    bool _waveOff;          // pilot firewalled the throttle on the approach → go around, climb away
    double _waveOffSeconds;
    const double ThrottleRate = 0.7;   // per second while W/S held — a real throttle, not tap-detents
    int _pullReleases;
    double _gCmd = 1.0, _bankTarget;
    const double Tau = 0.07, StickyStepG = 0.5;
    const double RollReturnRate = 0.6; // rad/s — reflex return toward wings-level when roll is un-commanded
    const double RollLevelDelayMs = 1500; // wait this long after the last roll input before settling to level
    double _rollIdleMs;
    int _fightPitchDirection, _rollDirection;
    double _fightPitchTarget, _fightPitchIdleSeconds;
    bool _fightPitchEngaged;
    bool _rollRightSampled, _rollLeftSampled, _rollRightWasDown, _rollLeftWasDown;

    // MAGIC CARPET (approach mode). The G-command grammar is wrong for a landing: with the valley
    // pinned at 1 G the pull has no authority, so the aircraft just sinks (the "uncontrollable"
    // approach the telemetry showed — g_cmd stuck at 1.0 while pulling). In approach mode pitch
    // commands the FLIGHT PATH: hold the glideslope, pull raises the aimpoint (shallower/climb),
    // push lowers it, and auto-throttle holds on-speed. This is what a competent pilot flies.
    public bool ApproachMode;
    const double ApproachGlideslope = -0.061;  // −3.5° reference glideslope (the "ball")
    const double ApproachSpeedMps = 70.0;      // ~136 kt on-speed
    // DIRECT flight-path-rate authority: a held pull/push commands this much flight-path rate at
    // once (no aimpoint to slew, no chase loop), so a gust bounce can be nulled in a couple hundred
    // ms. Measured: the old "slew a target, PD chases it" took 1.07 s to move gamma 2° — dead by the
    // time a <1 s bounce had passed, which is exactly the "I can't control it" the pilot reported.
    // The stick commands the NOSE ATTITUDE (body pitch θ) DIRECTLY — and it HOLDS where you put it,
    // like a real jet: the nose is the stable thing you fly, the flight path (velocity vector)
    // wanders underneath it and lags. (The first cut had you commanding angle of attack, so the nose
    // = γ + AoA inherited every bounce of the flight path — "the pitch bounces while the VV lags,
    // not how I'd fly the jet". Inverted.) AoA emerges as θ − γ, which makes it self-damping: a gust
    // that bends the path up cuts the AoA, cutting lift, restoring it — the aircraft's natural pitch
    // stability. Lift is capped at CLmax so over-rotating stalls; hands-off the nose gently trims to
    // on-speed AoA (the nudge); POWER flies the glidepath (the back-side rule). You fly the nose.
    public const double OnSpeedAoARad = 0.185; // ~10.6° — the AoA that TRIMS ~1 G at on-speed (70 m/s), so the
                                               // approach starts balanced instead of phugoiding down to find its
                                               // trim speed (9.7° gave only 0.9 G at 70 m/s → it dived itself low)
    const double PitchCmdRate = 0.14;          // rad/s (~8°/s) the stick moves the nose ATTITUDE — smooth, stable
    const double AoASpring = 0.35;             // 1/s gentle auto-trim toward on-speed — the nose HOLDS where you
                                               // put it (stable, no bounce) with a light return to on-speed, so the
                                               // approach is FLYABLE on pitch+power without being on-rails
    const double AoALo = -0.05, AoAHi = 0.32;  // the AoA the attitude is allowed to reach (−3°..+18°, past stall)
    const double ClimbAoaPower = 3.0;          // throttle-lever per rad of AoA above on-speed (power for the climb)
    // GENTLE glidepath assist only — enough to keep it off the water, NOT to fly the approach for
    // you. At 6.0 it nailed the slope hands-off (the pilot flew a perfect approach touching nothing
    // = "too on-rails"). At 2.5 it merely arrests a gross sink; YOU fly the velocity vector onto the
    // touchdown diamond to hold the glidepath. (The difficulty ladder, task 17, will scale this.)
    const double GlidePowerPerM = 0.035;       // throttle-lever per METRE below the glideslope LINE. SPATIAL, not
                                               // angular: holding the −3.5° ANGLE from a low start flies you parallel-
                                               // but-low into the ramp (the harness proved it). Power on the height error
                                               // recaptures the actual line. (Difficulty ladder scales this.)
    double _cmdPitch; bool _approachInit;      // the pilot's commanded NOSE attitude (θ), integrated from the stick
    double _approachClimbDemand;               // AoA above on-speed (rad) → power nudge
    public double CommandedPitchRad => _cmdPitch;  // the render draws the (stable) nose at this attitude
    public double GlideslopeErrorM;            // metres BELOW the glideslope line to the wires (bridge sets it; + = low)

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
            // Stick commands the NOSE ATTITUDE (θ) directly and it HOLDS there — stable, like a real
            // jet. The nose is what you fly; the flight path emerges under it and lags.
            double V = System.Math.Max(s.Speed, 30.0);
            double gamma = s.Gamma;
            if (!_approachInit) { _cmdPitch = gamma + OnSpeedAoARad; _approachInit = true; }
            if (_waveOff) _cmdPitch += PitchCmdRate * dt;                      // go-around: rotate up, climb away
            else if (pull != KeyPhase.Idle) _cmdPitch += PitchCmdRate * dt;   // nose up
            else if (push != KeyPhase.Idle) _cmdPitch -= PitchCmdRate * dt;   // nose down
            else _cmdPitch += ((gamma + OnSpeedAoARad) - _cmdPitch) * System.Math.Min(1.0, AoASpring * dt);  // gentle trim to on-speed
            _cmdPitch = System.Math.Clamp(_cmdPitch, gamma + AoALo, gamma + AoAHi);   // keep the AoA (θ−γ) sane

            // AoA EMERGES from attitude minus flight path (self-damping). Lift from it, capped at
            // CLmax — over-rotate and the nose stays high while lift saturates: honest stall/mush.
            double aoa = _cmdPitch - gamma;
            double q = 0.5 * Atmosphere.Density(s.Position.Y) * V * V;
            double clCmd = System.Math.Clamp(p.CLAlpha * aoa, p.CLMin, p.CLMax);
            double nCmd = clCmd * q * p.WingAreaM2 / (s.Mass * FlightModel.G0);
            _gCmd = System.Math.Clamp(nCmd, System.Math.Max(FlightModel.NzAeroMin(s, p), -0.5), maxPerform);
            // AoA above on-speed (nose above the on-speed attitude) → power nudge for the climb.
            _approachClimbDemand = System.Math.Max(0.0, aoa - OnSpeedAoARad);
            Tier = DemandTier.Valley; ValleyG = 1.0; ValleyBank = 0.0;
        } else {
        _approachInit = false;   // out of the slot → fight logic; re-trim the approach attitude on re-entry
        if (_waveOff) {
            _waveOffSeconds += dt;
            if (push != KeyPhase.Idle || _waveOffSeconds >= 4.0 || s.Gamma >= 0.07) _waveOff = false;
        }
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
        else if (_waveOff) {
            tier = DemandTier.Valley;
            target = System.Math.Min(maxPerform, 1.55);   // smooth hands-off rotation; stick still has full authority
        }
        else { tier = DemandTier.Baseline; StickyOffsetG = 0; target = 1.0; }
        Tier = tier;
        _gCmd += (target - _gCmd) * System.Math.Min(1.0, dt / Tau);

        // In the fight, the arrows command PITCH RATE directly. The target is only a short lead
        // ahead of the actual nose; it never accumulates while the airframe catches up. Available
        // AoA is still the boundary, but it only tapers the rate inside the finite-moment stopping
        // distance, so protection does not make the rest of the pull feel weak. On release, capture
        // the current nose for a brief arrest/hold before returning to the ordinary 1 G trim law.
        int pitchDirection = (pull != KeyPhase.Idle ? 1 : 0) - (push != KeyPhase.Idle ? 1 : 0);
        if (HasBodyAttitude(s) && System.Math.Abs(s.Gamma) < 1.15) {
            double bodyPitch = BodyPitch(s);
            if (pitchDirection != 0) {
                _fightPitchEngaged = true;
                _fightPitchIdleSeconds = 0.0;
                double q = 0.5 * Atmosphere.Density(s.Position.Y) * s.Speed * s.Speed;
                double clPerG = s.Mass * FlightModel.G0 / System.Math.Max(q * p.WingAreaM2, 1e-6);
                double alpha = bodyPitch - s.Gamma;
                double pushFloor = System.Math.Max(FlightModel.NzAeroMin(s, p), over ? -1.5 : -1.0);
                double alphaLimit = pitchDirection > 0
                    ? System.Math.Clamp(cap * clPerG / p.CLAlpha, p.CLMin / p.CLAlpha, p.CLMax / p.CLAlpha)
                    : System.Math.Clamp(pushFloor * clPerG / p.CLAlpha, p.CLMin / p.CLAlpha, p.CLMax / p.CLAlpha);
                double remaining = System.Math.Max(0.0,
                    pitchDirection > 0 ? alphaLimit - alpha : alpha - alphaLimit);
                double angularAccel = p.ApproachPitchMomentMaxNm / p.IyyKgM2;
                double rateForBoundary = System.Math.Sqrt(2.0 * angularAccel * remaining);
                double pitchRate = pitchDirection * System.Math.Min(p.ManualPitchRateMaxRad, rateForBoundary);
                _fightPitchTarget = bodyPitch + pitchRate * p.ManualPitchAngleTau;
            } else if (_fightPitchEngaged) {
                if (_fightPitchDirection != 0) _fightPitchTarget = bodyPitch; // release: arrest here
                _fightPitchIdleSeconds += dt;
                if (_fightPitchIdleSeconds >= 0.8) _fightPitchEngaged = false;
            }
        } else {
            // Absolute pitch is singular at the vertical. Fall back to the strengthened G law there;
            // the 6DOF target-attitude construction carries the aircraft cleanly through the pole.
            _fightPitchEngaged = false;
        }
        _fightPitchDirection = pitchDirection;
        }

        // Roll is also a rate command. The target stays a fixed lead ahead of the actual bank while
        // held, so there is no stored-up bank target to roll through after release. Releasing captures
        // the bank; pressing the opposite key moves the lead across the current attitude immediately,
        // which gives the rate loop a crisp braking command. Approach keeps its wings-level reflex.
        int rTaps = keys.TakeTaps(GKey.RollRight, nowMs), lTaps = keys.TakeTaps(GKey.RollLeft, nowMs);
        bool rollRight = keys.PhaseAt(GKey.RollRight, nowMs) != KeyPhase.Idle;
        bool rollLeft = keys.PhaseAt(GKey.RollLeft, nowMs) != KeyPhase.Idle;
        if (rollRight && !_rollRightWasDown) _rollRightSampled = false;
        if (rollLeft && !_rollLeftWasDown) _rollLeftSampled = false;
        if (rollRight) _rollRightSampled = true;
        if (rollLeft) _rollLeftSampled = true;
        bool rollInput = rollRight || rollLeft || rTaps > 0 || lTaps > 0;
        _rollIdleMs = rollInput ? 0.0 : _rollIdleMs + dt * 1000.0;
        // Approach mode retains fine ~20°/s lineup authority. Fight roll is cut from 92°/s to a
        // placeable 37°/s and is now limited by the body-rate controller as well as this command.
        double rollRate = ApproachMode ? 0.35 : p.RollRateMaxRad;     // ~20°/s vs ~37°/s
        double levelDelay = ApproachMode ? 0.0 : RollLevelDelayMs;
        double returnRate = ApproachMode ? 1.4 : RollReturnRate;  // firm, so it settles level and stays
        int rollDirection = (rollRight ? 1 : 0) - (rollLeft ? 1 : 0);
        if (HasBodyAttitude(s)) {
            double bodyBank = BodyBank(s);
            if (rollDirection != 0) {
                _bankTarget = bodyBank + rollDirection * rollRate * p.BankTau;
            } else if (_rollDirection != 0) {
                _bankTarget = bodyBank; // release: arrest and hold the bank actually achieved
            }
            // A press/release entirely between sim ticks still gets one small deterministic step.
            if (rTaps > 0 && !_rollRightSampled) _bankTarget += rTaps * 0.07;
            if (lTaps > 0 && !_rollLeftSampled) _bankTarget -= lTaps * 0.07;
        } else {
            // Compatibility for synthetic command-only callers which do not carry BodyAttitude.
            // Keep their legacy integration semantics; flown AircraftSim states use the rate law above.
            if (rTaps > 0 || lTaps > 0) _bankTarget = ApproachMode ? _bankTarget : ValleyBank;
            double fallbackRate = ApproachMode ? 0.35 : 1.6;
            if (rollRight) _bankTarget += fallbackRate * dt;
            if (rollLeft) _bankTarget -= fallbackRate * dt;
        }
        if (ApproachMode && !rollInput && _rollIdleMs > levelDelay) {
            double err = System.Math.IEEERemainder(0.0 - _bankTarget, 2 * System.Math.PI); // toward wings-level
            _bankTarget += System.Math.Clamp(err, -returnRate * dt, returnRate * dt);
        }
        _bankTarget = System.Math.IEEERemainder(_bankTarget, 2 * System.Math.PI); // circular: continuous roll through inverted
        _rollDirection = rollDirection;
        _rollRightWasDown = rollRight;
        _rollLeftWasDown = rollLeft;

        // Continuous throttle: HOLD W to spool up (through MIL into A/B), HOLD S to bring it back —
        // that's what "mash W" means. Tap-only detents did nothing on a hold, which is why it felt
        // dead. Taps still nudge it for fine sets.
        bool wHeld = keys.PhaseAt(GKey.ThrottleUp, nowMs) != KeyPhase.Idle;
        bool sHeld = keys.PhaseAt(GKey.ThrottleDown, nowMs) != KeyPhase.Idle;
        int thUp = keys.TakeTaps(GKey.ThrottleUp, nowMs), thDn = keys.TakeTaps(GKey.ThrottleDown, nowMs);
        if (wHeld || sHeld || thUp > 0 || thDn > 0) _manualThrottle = true;   // pilot took the throttle
        // Auto-throttle = speed-hold, PLUS the climb nudge: the flight-path-up you commanded that
        // pitch couldn't safely give is delivered here as power, so a pull actually CLIMBS (on energy,
        // through the spool lag) instead of mushing at CLmax. Capped short of a firewall so the auto
        // path can't trip the wave-off. Pilot's W/S still stands the whole thing down (below).
        double autoThr = 0.16 + 0.026 * (ApproachSpeedMps - s.Speed);   // speed-hold
        if (ApproachMode) {
            // BACK-SIDE RULE: power flies the glidepath. Below the glideslope LINE (spatial height
            // error, set by the bridge) → add power to climb back onto it — this recaptures the path
            // instead of just holding the angle low, so flying the velocity vector at the wires
            // actually traps. Plus the pilot's active up-command (AoA above on-speed) spools too.
            autoThr += GlidePowerPerM * System.Math.Max(0.0, GlideslopeErrorM)
                     + ClimbAoaPower * _approachClimbDemand;
        }
        autoThr = System.Math.Clamp(autoThr, 0.0, 0.95);
        if (ApproachMode && !_manualThrottle) {
            _throttleLever = autoThr;   // auto-throttle holds on-speed AND tracks the lever, so takeover is smooth
        } else {
            if (wHeld) _throttleLever += ThrottleRate * dt;
            if (sHeld) _throttleLever -= ThrottleRate * dt;
            _throttleLever += (thUp - thDn) * 0.15;
            _throttleLever = System.Math.Clamp(_throttleLever, 0.0, 1.3);
        }
        Throttle = _throttleLever;
        // Firewalled on the approach = wave-off. Match the bridge's mode threshold so the climb
        // command survives the approach→fight handoff instead of becoming unreachable at 0.99.
        if (ApproachMode && _manualThrottle && _throttleLever >= 0.95) {
            _waveOff = true;
            _waveOffSeconds = 0.0;
        }
        else if (ApproachMode && _throttleLever < 0.95) _waveOff = false;

        double rudder = 0;
        if (keys.PhaseAt(GKey.RudderRight, nowMs) != KeyPhase.Idle) rudder += 0.6;
        if (keys.PhaseAt(GKey.RudderLeft, nowMs) != KeyPhase.Idle)  rudder -= 0.6;

        Command = new PilotCommand(_gCmd, _bankTarget, Throttle, rudder,
            ApproachMode ? _cmdPitch : _fightPitchEngaged ? _fightPitchTarget : double.NaN);
    }

    static bool HasBodyAttitude(in AircraftState s) =>
        s.BodyAttitude.IsFinite && s.BodyAttitude.LengthSquared >= 1e-12;

    static double BodyPitch(in AircraftState s) {
        var forward = s.BodyAttitude.Rotate(new Vec3D(0, 0, 1));
        return System.Math.Asin(System.Math.Clamp(forward.Y, -1.0, 1.0));
    }

    static double BodyBank(in AircraftState s) {
        var forward = s.BodyAttitude.Rotate(new Vec3D(0, 0, 1));
        var bodyUp = s.BodyAttitude.Rotate(new Vec3D(0, 1, 0));
        var up0 = new Vec3D(0, 1, 0) - forward * forward.Y;
        if (up0.Length < 1e-6) return s.Bank;
        up0 = up0.Normalized();
        var right0 = up0.Cross(forward).Normalized();
        return System.Math.Atan2(bodyUp.Dot(right0), bodyUp.Dot(up0));
    }
}
