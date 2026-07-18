namespace GunsOnly.Sim.Turbulence;

/// The airframe's rotational RESPONSE to gusts — the shudder (nose saw, wing rock) that rides on
/// top of the flight-path bump. Three damped second-order modes excited by the gust: short-period
/// PITCH, dutch-roll YAW (lightly damped, which is exactly why it's felt), and ROLL.
///
/// This is a MODAL OVERLAY on the flight-path model, deliberately NOT a 6-DOF rigid body with
/// control-surface aerodynamics. The control grammar commands flight path (G and bank), and the
/// modes ring AROUND that commanded path. Decomposition: the CG follows the point-mass path (the
/// CLα gust-lift term moves that — where you GO), and the body attitude oscillates about it (this
/// — how you're SHAKEN). Same gust, two channels; not double-counting, different observables.
///
/// Each mode is x'' + 2ζω x' + ω²x = ω²·(k·gustAngle), so the DC response is k·gustAngle (k =
/// BuffetGain is the buffet-angle / gust-angle ratio) and the transient rings at ω with damping ζ.
/// Integrated with semi-implicit (symplectic) Euler — unconditionally stable for a damped
/// oscillator at 120 Hz, and it can't inject energy the way explicit Euler can.
public sealed class RotationalBuffet {
    double _pitch, _pitchRate, _yaw, _yawRate, _roll, _rollRate;
    readonly double _wSp, _zSp, _wDr, _zDr, _wRoll, _zRoll, _k;

    /// Nose-up positive (rad).
    public double PitchRad => _pitch;
    /// Nose-right positive (rad).
    public double YawRad => _yaw;
    /// Right-wing-down positive (rad).
    public double RollRad => _roll;

    public RotationalBuffet(in AircraftParams p) {
        _wSp = p.PitchModeFreq; _zSp = p.PitchModeDamp;
        _wDr = p.YawModeFreq; _zDr = p.YawModeDamp;
        _wRoll = p.RollModeFreq; _zRoll = p.RollModeDamp;
        _k = p.BuffetGain;
    }

    /// Advance the modes by dt. Forcings are the gust-induced angles (rad) at the airframe:
    /// alphaGust = vertical-gust AoA, betaGust = lateral-gust sideslip, rollGust = the vertical-
    /// gust difference across the span. Zero forcing (still air) leaves a damped decay to zero.
    public void Step(double alphaGust, double betaGust, double rollGust, double dt) {
        Advance(ref _pitch, ref _pitchRate, _wSp, _zSp, _k * alphaGust, dt);
        Advance(ref _yaw, ref _yawRate, _wDr, _zDr, _k * betaGust, dt);
        Advance(ref _roll, ref _rollRate, _wRoll, _zRoll, _k * rollGust, dt);
    }

    static void Advance(ref double x, ref double v, double w, double z, double dcTarget, double dt) {
        // x'' + 2ζω x' + ω²x = ω²·dcTarget  →  steady state x = dcTarget.
        v += (w * w * (dcTarget - x) - 2.0 * z * w * v) * dt;   // semi-implicit: use updated v below
        x += v * dt;
        if (!double.IsFinite(x) || !double.IsFinite(v)) { x = 0.0; v = 0.0; }
    }
}
