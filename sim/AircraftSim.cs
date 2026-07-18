namespace GunsOnly.Sim;

public sealed class AircraftSim {
    public const double TickHz = 120.0;
    public AircraftState State { get; private set; }
    public double LastNz { get; private set; } = 1.0;
    public bool Buffet { get; private set; }
    /// Below sea level. The sim has no terrain and never policed this: a 12G pull from inverted
    /// flew the aircraft THROUGH the sea to -10,679 ft with the world rendering black, found by
    /// flying the web build. The review flagged "fight endings have no owner" and the spec wrote
    /// a hard deck that was never built. The kernel reports the fact; shells decide the rule.
    public bool BelowGround => State.Position.Y <= 0.0;
    /// Briefed training floor (spec §3): busting it ends the fight as a loss annotation.
    public const double HardDeckM = 1524.0;   // 5,000 ft
    public bool BelowHardDeck => State.Position.Y <= HardDeckM;
    /// The physical lift direction (canopy direction): the transported zero-bank reference
    /// rotated by body roll. Render-true through verticals — use this for attitude
    /// reconstruction instead of world-up (which snaps 180 degrees at loop apex).
    public Vec3D LiftDir { get; private set; } = new(0, 1, 0);
    readonly AircraftParams _p;
    /// Optional wind/gust field. Null = still air (the aircraft flies exactly as before — the
    /// regression guard). Sampled per RK4 stage at that stage's position, so the integrator sees
    /// the field's spatial structure and a frozen gust pocket bumps you as you fly THROUGH it.
    public GunsOnly.Sim.Turbulence.IWindField? Wind { get; set; }
    Vec3D WindAt(in Vec3D pos) => Wind is null ? Vec3D.Zero : Wind.Sample(pos);
    readonly GunsOnly.Sim.Turbulence.RotationalBuffet _buffet;
    /// The gust-driven attitude shudder, radians, on top of the flight-path attitude. Render/felt
    /// layer: the shells add these to the drawn nose/wings so you SEE the nose saw and wings rock.
    public double PitchBuffetRad => _buffet.PitchRad;
    public double YawBuffetRad => _buffet.YawRad;
    public double RollBuffetRad => _buffet.RollRad;
    Vec3D _liftRef;          // zero-bank lift reference, kept perpendicular to velocity, transported through verticals
    double _bank;            // roll about the velocity axis, relative to _liftRef
    double _reportedBank;    // horizon-referenced bank for State (held when horizon-undefined)
    bool _init;
    bool _spoolInit;
    double _thrustFrac;      // engine's actual spool state, 0..1 — lags the throttle lever
    /// What the ENGINE is actually delivering, 0..1, as opposed to where the lever is. The gap
    /// between the two is the whole difficulty of flying the back side of the power curve.
    public double ThrustFraction => _thrustFrac;
    const double HorizonValidY = 0.94; // |vhat.Y| below this (~|gamma| < 70 deg): horizon bank well-defined

    public AircraftSim(AircraftState initial, AircraftParams p) {
        State = initial; _p = p;
        _buffet = new GunsOnly.Sim.Turbulence.RotationalBuffet(p);
    }

    void InitFrame(in Vec3D vhat) {
        var up = new Vec3D(0, 1, 0);
        var refH = up - vhat * up.Dot(vhat);
        _liftRef = refH.Length < 1e-6 ? new Vec3D(0, 0, -1) : refH.Normalized();
        _bank = State.Bank; _reportedBank = State.Bank; _init = true;
        LiftDir = ComputeLiftDir(vhat);
    }

    public void Step(in PilotCommand cmd, double dt) {
        var s = State;
        var vel0 = s.VelocityVector();
        var vhat0 = vel0.Length < 1e-9 ? new Vec3D(0, 0, 1) : vel0.Normalized();
        if (!_init) InitFrame(vhat0);

        // Engine spool. First aircraft ever built by this sim is trimmed, not spooling up from
        // idle: snap to the opening lever position, then lag every CHANGE after that. (Starting
        // at zero would quietly re-tune every beat by decelerating each aircraft off the line.)
        double lever = System.Math.Clamp(cmd.Throttle, 0, 1);
        if (!_spoolInit) { _thrustFrac = lever; _spoolInit = true; }
        double tau = lever > _thrustFrac ? _p.SpoolUpTau : _p.SpoolDownTau;
        if (tau > 1e-6) {
            // Exact solution of dx/dt = (target-x)/tau over dt: unconditionally stable, and it
            // cannot overshoot the lever no matter how coarse dt gets.
            _thrustFrac += (lever - _thrustFrac) * (1.0 - System.Math.Exp(-dt / tau));
        } else {
            _thrustFrac = lever;
        }
        var spooled = cmd with { Throttle = _thrustFrac };

        var r = new RawState(s.Position, vel0, _bank, s.Mass);
        // Sample the wind at each RK4 stage's own position, so the integrator sees the field's
        // spatial structure (a frozen gust pocket bumps you as you fly through it, not on a clock).
        var k1 = FlightModel.Derivatives(r, spooled, _p, _liftRef, WindAt(r.Pos));
        var r2 = Apply(r, k1, dt / 2);
        var k2 = FlightModel.Derivatives(r2, spooled, _p, _liftRef, WindAt(r2.Pos));
        var r3 = Apply(r, k2, dt / 2);
        var k3 = FlightModel.Derivatives(r3, spooled, _p, _liftRef, WindAt(r3.Pos));
        var r4 = Apply(r, k3, dt);
        var k4 = FlightModel.Derivatives(r4, spooled, _p, _liftRef, WindAt(r4.Pos));
        var pos = r.Pos + (k1.DPos + (k2.DPos + k3.DPos) * 2 + k4.DPos) * (dt / 6);
        var vel = r.Vel + (k1.DVel + (k2.DVel + k3.DVel) * 2 + k4.DVel) * (dt / 6);
        _bank = WrapPi(r.Bank + (k1.DBank + 2 * (k2.DBank + k3.DBank) + k4.DBank) * (dt / 6));

        double speed = vel.Length;
        if (speed < 40) { vel = (speed < 1e-9 ? new Vec3D(0, 0, 40) : vel.Normalized() * 40); speed = 40; } // PLACEHOLDER mush floor
        var vhat = vel.Normalized();

        // Parallel-transport the lift reference perpendicular to the new velocity.
        var lr = _liftRef - vhat * _liftRef.Dot(vhat);
        _liftRef = lr.Length < 1e-6 ? FallbackRef(vhat) : lr.Normalized();

        // Horizon re-anchor: snap the reference to the horizon frame and re-express the SAME
        // world lift direction, so _bank == horizon bank in normal flight, continuous through verticals.
        if (System.Math.Abs(vhat.Y) < HorizonValidY) {
            var up = new Vec3D(0, 1, 0);
            var upPerpH = (up - vhat * up.Dot(vhat)).Normalized();
            var rightH = upPerpH.Cross(vhat).Normalized(); // physical right (reversed operands, left-handed basis)
            var rightRef = _liftRef.Cross(vhat).Normalized();
            var liftDir = _liftRef * System.Math.Cos(_bank) + rightRef * System.Math.Sin(_bank);
            _bank = System.Math.Atan2(liftDir.Dot(rightH), liftDir.Dot(upPerpH));
            _liftRef = upPerpH;
            _reportedBank = _bank;
        }

        double gamma = System.Math.Asin(System.Math.Clamp(vhat.Y, -1, 1));
        double chi = System.Math.Atan2(vhat.X, vhat.Z); // 0 = north(+Z), positive toward east(+X)
        if (!IsFinite(pos) || !double.IsFinite(speed) || !double.IsFinite(_bank))
            throw new System.InvalidOperationException("non-finite sim state");
        State = new AircraftState(pos, speed, gamma, chi, _reportedBank, s.Mass);

        var (nz, nzMax, nzMin) = FlightModel.ClampNz(State, cmd, _p);
        LastNz = nz;
        Buffet = cmd.GDemand > 0.85 * nzMax || cmd.GDemand < 0.85 * nzMin;
        LiftDir = ComputeLiftDir(vhat);

        // Drive the rotational buffet from the gust and its gradient across the airframe. Pitch is
        // forced by the vertical-gust AoA at the CG, yaw by the lateral-gust sideslip, roll by the
        // vertical-gust DIFFERENCE across the span (right wing sees more updraft → rolls left). The
        // modes are integrated EVERY step (not only when there's wind) so they ring DOWN to rest
        // when the air calms — skipping the update would freeze the shudder mid-oscillation.
        double alphaGust = 0.0, betaGust = 0.0, rollGust = 0.0;
        if (Wind is not null) {
            var bpos = State.Position;
            var up = LiftDir;
            var rb = up.Cross(vhat);
            var right = rb.Length < 1e-6 ? new Vec3D(1, 0, 0) : rb.Normalized();
            double v = System.Math.Max(speed, 20.0);
            double halfSpan = System.Math.Sqrt(_p.WingAreaM2);   // nominal; sets the gradient baseline
            var wCg = WindAt(bpos);
            var wL = WindAt(bpos - right * halfSpan);
            var wR = WindAt(bpos + right * halfSpan);
            alphaGust = wCg.Dot(up) / v;
            betaGust = wCg.Dot(right) / v;
            rollGust = (wL.Dot(up) - wR.Dot(up)) / v;
        }
        _buffet.Step(alphaGust, betaGust, rollGust, dt);
    }

    Vec3D ComputeLiftDir(in Vec3D vhat) {
        var rightRef = _liftRef.Cross(vhat);
        var right = rightRef.Length < 1e-6 ? new Vec3D(1, 0, 0) : rightRef.Normalized();
        return (_liftRef * System.Math.Cos(_bank) + right * System.Math.Sin(_bank)).Normalized();
    }

    static Vec3D FallbackRef(in Vec3D vhat) {
        var alt = new Vec3D(0, 0, 1);
        var lr = alt - vhat * alt.Dot(vhat);
        return lr.Length < 1e-6 ? new Vec3D(1, 0, 0) : lr.Normalized();
    }
    static RawState Apply(in RawState r, in StateDeriv d, double h) =>
        new(r.Pos + d.DPos * h, r.Vel + d.DVel * h, r.Bank + d.DBank * h, r.Mass);
    static double WrapPi(double a) => System.Math.IEEERemainder(a, 2 * System.Math.PI); // O(1)
    static bool IsFinite(in Vec3D v) => double.IsFinite(v.X) && double.IsFinite(v.Y) && double.IsFinite(v.Z);
}
