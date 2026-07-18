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
    /// The physical lift direction: body up projected perpendicular to the relative wind.
    public Vec3D LiftDir { get; private set; } = new(0, 1, 0);
    readonly AircraftParams _p;
    /// Optional wind/gust field. Null = still air (the aircraft flies exactly as before — the
    /// regression guard). Sampled per RK4 stage at that stage's position, so the integrator sees
    /// the field's spatial structure and a frozen gust pocket bumps you as you fly THROUGH it.
    public GunsOnly.Sim.Turbulence.IWindField? Wind { get; set; }
    Vec3D WindAt(in Vec3D pos) => Wind is null ? Vec3D.Zero : Wind.Sample(pos);
    readonly GunsOnly.Sim.Turbulence.RotationalBuffet _buffet;
    Vec3D _gustFiltered; bool _gustInit; double _rollGustFiltered;   // gust-alleviation low-pass state
    Vec3D _airVelocity;
    /// Legacy gust-mode diagnostics used by BuffetedFrame. BodyFrame stays the real rigid attitude.
    public double PitchBuffetRad => _buffet.PitchRad;
    public double YawBuffetRad => _buffet.YawRad;
    public double RollBuffetRad => _buffet.RollRad;
    Vec3D _liftRef;          // zero-bank lift reference, kept perpendicular to velocity, transported through verticals
    double _bank;            // compatibility command-bank state; forces/render use BodyAttitude
    double _reportedBank;    // horizon-referenced compatibility value for State.Bank
    bool _init;
    bool _spoolInit;
    double _thrustFrac;      // engine's actual spool state, 0..1 — lags the throttle lever
    /// What the ENGINE is actually delivering, 0..1, as opposed to where the lever is. The gap
    /// between the two is the whole difficulty of flying the back side of the power curve.
    public double ThrustFraction => _thrustFrac;
    public Vec3D BodyRight => State.BodyAttitude.Rotate(new Vec3D(1, 0, 0));
    public Vec3D BodyUp => State.BodyAttitude.Rotate(new Vec3D(0, 1, 0));
    public Vec3D BodyForward => State.BodyAttitude.Rotate(new Vec3D(0, 0, 1));
    public double BodyPitchRad => System.Math.Asin(System.Math.Clamp(BodyForward.Y, -1.0, 1.0));
    public double BodyYawRad => System.Math.Atan2(BodyForward.X, BodyForward.Z);
    public double BodyRollRad {
        get {
            var f = BodyForward;
            var up0 = new Vec3D(0, 1, 0) - f * f.Y;
            if (up0.Length < 1e-6) return State.Bank;
            up0 = up0.Normalized();
            var right0 = up0.Cross(f).Normalized();
            return System.Math.Atan2(BodyUp.Dot(right0), BodyUp.Dot(up0));
        }
    }
    /// Aerodynamic incidence from the real body attitude and relative wind.
    public double AngleOfAttackRad {
        get {
            var vhat = _airVelocity.Length < 1e-9 ? State.ForwardDir() : _airVelocity.Normalized();
            return System.Math.Atan2(-vhat.Dot(BodyUp), vhat.Dot(BodyForward));
        }
    }
    public double SideslipRad {
        get {
            var vhat = _airVelocity.Length < 1e-9 ? State.ForwardDir() : _airVelocity.Normalized();
            return System.Math.Asin(System.Math.Clamp(vhat.Dot(BodyRight), -1.0, 1.0));
        }
    }
    const double HorizonValidY = 0.94; // |vhat.Y| below this (~|gamma| < 70 deg): horizon bank well-defined

    public AircraftSim(AircraftState initial, AircraftParams p) {
        State = initial; _p = p;
        _airVelocity = initial.VelocityVector();
        _buffet = new GunsOnly.Sim.Turbulence.RotationalBuffet(p);
        InitFrame(initial.ForwardDir());
        if (!initial.BodyAttitude.IsFinite || initial.BodyAttitude.LengthSquared < 1e-12) {
            double q = 0.5 * Atmosphere.Density(initial.Position.Y) * initial.Speed * initial.Speed;
            double cl = initial.Mass * FlightModel.G0 / System.Math.Max(q * p.WingAreaM2, 1e-6);
            double alpha = System.Math.Clamp(cl / p.CLAlpha, p.CLMin / p.CLAlpha, p.CLMax / p.CLAlpha);
            var f = initial.ForwardDir();
            var u = LiftDir;
            var bf = (f * System.Math.Cos(alpha) + u * System.Math.Sin(alpha)).Normalized();
            var bu = (u * System.Math.Cos(alpha) - f * System.Math.Sin(alpha)).Normalized();
            State = initial with { BodyAttitude = QuaternionD.FromFrame(bu.Cross(bf).Normalized(), bu, bf) };
        } else {
            State = initial with { BodyAttitude = initial.BodyAttitude.Normalized() };
        }
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
        double lever = System.Math.Clamp(cmd.Throttle, 0, 1.35);   // >1 = afterburner
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

        // GUST ALLEVIATION. A real aircraft averages gusts over its size and its lift lags (unsteady
        // aero, the Küssner effect), so it does NOT feel sub-wingspan eddies as sharp jolts — point-
        // sampling the raw field made turbulence "way too twitchy". Low-pass the sampled gust with a
        // time constant of a few chord-lengths of travel (τ = L/V, so faster flight filters the now-
        // higher-frequency gusts proportionally). This smooths the twitch while keeping the bumps.
        var rawGust = WindAt(s.Position);
        double gustTau = 12.0 / System.Math.Max(vel0.Length, 20.0);
        if (!_gustInit) { _gustFiltered = rawGust; _gustInit = true; }
        else _gustFiltered += (rawGust - _gustFiltered) * (1.0 - System.Math.Exp(-dt / gustTau));
        var gust = _gustFiltered;

        var r = new RawState(s.Position, vel0, _bank, s.Mass, s.BodyAttitude, s.BodyRates);
        var k1 = FlightModel.Derivatives(r, spooled, _p, _liftRef, gust);
        var k2 = FlightModel.Derivatives(Apply(r, k1, dt / 2), spooled, _p, _liftRef, gust);
        var k3 = FlightModel.Derivatives(Apply(r, k2, dt / 2), spooled, _p, _liftRef, gust);
        var k4 = FlightModel.Derivatives(Apply(r, k3, dt), spooled, _p, _liftRef, gust);
        var pos = r.Pos + (k1.DPos + (k2.DPos + k3.DPos) * 2 + k4.DPos) * (dt / 6);
        var vel = r.Vel + (k1.DVel + (k2.DVel + k3.DVel) * 2 + k4.DVel) * (dt / 6);
        _bank = WrapPi(r.Bank + (k1.DBank + 2 * (k2.DBank + k3.DBank) + k4.DBank) * (dt / 6));
        var attitude = (r.Attitude + (k1.DAttitude + (k2.DAttitude + k3.DAttitude) * 2 + k4.DAttitude) * (dt / 6)).Normalized();
        var bodyRates = r.BodyRates + (k1.DBodyRates + (k2.DBodyRates + k3.DBodyRates) * 2 + k4.DBodyRates) * (dt / 6);

        double speed = vel.Length;
        if (speed < 40) {
            // The floor may sustain a mush, but must not feed a stalled zoom back uphill.
            if (vel.Y > 0) {
                var horizontal = new Vec3D(vel.X, 0, vel.Z);
                var along = horizontal.Length < 1e-9
                    ? new Vec3D(System.Math.Sin(s.Chi), 0, System.Math.Cos(s.Chi))
                    : horizontal.Normalized();
                vel = along * System.Math.Sqrt(40 * 40 - 20 * 20) + new Vec3D(0, -20, 0);
            } else vel = speed < 1e-9 ? new Vec3D(0, -40, 0) : vel.Normalized() * 40;
            speed = 40;
        }
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
        if (!IsFinite(pos) || !double.IsFinite(speed) || !double.IsFinite(_bank) || !attitude.IsFinite || !bodyRates.IsFinite)
            throw new System.InvalidOperationException("non-finite sim state");
        State = new AircraftState(pos, speed, gamma, chi, _reportedBank, s.Mass, attitude, bodyRates);

        var finalRaw = new RawState(pos, vel, _bank, s.Mass, attitude, bodyRates);
        var aero = FlightModel.Aerodynamics(finalRaw, spooled, _p, gust);
        _airVelocity = aero.AirVelocity;
        LastNz = aero.Nz;
        LiftDir = aero.LiftDir;
        var (_, nzMax, nzMin) = FlightModel.ClampNz(State, cmd, _p);
        Buffet = cmd.GDemand > 0.85 * nzMax || cmd.GDemand < 0.85 * nzMin;

        // Drive the rotational buffet from the gust and its gradient across the airframe. Pitch is
        // forced by the vertical-gust AoA at the CG, yaw by the lateral-gust sideslip, roll by the
        // vertical-gust DIFFERENCE across the span (right wing sees more updraft → rolls left). The
        // modes are integrated EVERY step (not only when there's wind) so they ring DOWN to rest
        // when the air calms — skipping the update would freeze the shudder mid-oscillation.
        double alphaGust = 0.0, betaGust = 0.0, rollGust = 0.0;
        if (Wind is not null) {
            var up = LiftDir;
            var rb = up.Cross(vhat);
            var right = rb.Length < 1e-6 ? new Vec3D(1, 0, 0) : rb.Normalized();
            double v = System.Math.Max(speed, 20.0);
            // Pitch and yaw off the gust-alleviated CG gust (already low-passed above) — so the
            // shudder rides the same smoothed gust as the flight-path bump, not the raw twitch.
            alphaGust = _gustFiltered.Dot(up) / v;
            betaGust = _gustFiltered.Dot(right) / v;
            // Roll off the span differential, itself low-passed at the same rate.
            double halfSpan = System.Math.Sqrt(_p.WingAreaM2);
            var bpos = State.Position;
            double rawRoll = (WindAt(bpos - right * halfSpan).Dot(up) - WindAt(bpos + right * halfSpan).Dot(up)) / v;
            _rollGustFiltered += (rawRoll - _rollGustFiltered) * (1.0 - System.Math.Exp(-dt / (12.0 / v)));
            rollGust = _rollGustFiltered;
        }
        _buffet.Step(alphaGust, betaGust, rollGust, dt);
    }

    /// The render attitude WITH the buffet shudder applied: forward and up (canopy) vectors that
    /// include the gust-driven nose saw / wing rock, so a shell that renders from these SEES the
    /// shudder. In still air (buffet ≈ 0) it equals the clean flight-path attitude exactly. Small
    /// exact rotations: roll about the flight axis, then pitch about the right axis, then yaw
    /// about the up axis, re-orthogonalising between each so the result stays a clean basis.
    public void BuffetedFrame(out Vec3D fwd, out Vec3D up) => RenderFrame(0.0, out fwd, out up);

    /// The integrated rigid-body attitude. Nose is the body forward axis; no flight-path/AoA synthesis.
    public void BodyFrame(out Vec3D fwd, out Vec3D up) { fwd = BodyForward; up = BodyUp; }

    /// Compatibility overload: attitude commands now enter the moment controller, never the renderer.
    public void BodyFrame(double _, out Vec3D fwd, out Vec3D up) => BodyFrame(out fwd, out up);

    void RenderFrame(double extraPitch, out Vec3D fwd, out Vec3D up) {
        var f = State.ForwardDir();
        var u0 = LiftDir - f * LiftDir.Dot(f);
        var u = u0.Length < 1e-9 ? FallbackRef(f) : u0.Normalized();
        double pitch = _buffet.PitchRad + extraPitch, yaw = _buffet.YawRad, roll = _buffet.RollRad;

        var right = SafeRight(u, f);                       // physical right (left-handed: up × fwd)
        u = (u * System.Math.Cos(roll) + right * System.Math.Sin(roll)).Normalized();   // right-wing-down → canopy tilts right

        right = SafeRight(u, f);
        var fPitched = (f * System.Math.Cos(pitch) + u * System.Math.Sin(pitch)).Normalized();  // nose-up
        u = (u * System.Math.Cos(pitch) - f * System.Math.Sin(pitch)).Normalized();
        f = fPitched;

        right = SafeRight(u, f);
        f = (f * System.Math.Cos(yaw) + right * System.Math.Sin(yaw)).Normalized();     // nose-right

        fwd = f;
        var cleanUp = u - fwd * u.Dot(fwd);
        up = cleanUp.Length < 1e-9 ? FallbackRef(fwd) : cleanUp.Normalized();
    }
    static Vec3D SafeRight(in Vec3D up, in Vec3D fwd) {
        var r = up.Cross(fwd);
        return r.Length < 1e-9 ? new Vec3D(1, 0, 0) : r.Normalized();
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
        new(r.Pos + d.DPos * h, r.Vel + d.DVel * h, r.Bank + d.DBank * h, r.Mass,
            r.Attitude + d.DAttitude * h, r.BodyRates + d.DBodyRates * h);
    static double WrapPi(double a) => System.Math.IEEERemainder(a, 2 * System.Math.PI); // O(1)
    static bool IsFinite(in Vec3D v) => double.IsFinite(v.X) && double.IsFinite(v.Y) && double.IsFinite(v.Z);
}
