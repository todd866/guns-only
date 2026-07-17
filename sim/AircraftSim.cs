namespace GunsOnly.Sim;

public sealed class AircraftSim {
    public const double TickHz = 120.0;
    public AircraftState State { get; private set; }
    public double LastNz { get; private set; } = 1.0;
    public bool Buffet { get; private set; }
    /// The physical lift direction (canopy direction): the transported zero-bank reference
    /// rotated by body roll. Render-true through verticals — use this for attitude
    /// reconstruction instead of world-up (which snaps 180 degrees at loop apex).
    public Vec3D LiftDir { get; private set; } = new(0, 1, 0);
    readonly AircraftParams _p;
    Vec3D _liftRef;          // zero-bank lift reference, kept perpendicular to velocity, transported through verticals
    double _bank;            // roll about the velocity axis, relative to _liftRef
    double _reportedBank;    // horizon-referenced bank for State (held when horizon-undefined)
    bool _init;
    const double HorizonValidY = 0.94; // |vhat.Y| below this (~|gamma| < 70 deg): horizon bank well-defined

    public AircraftSim(AircraftState initial, AircraftParams p) { State = initial; _p = p; }

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

        var r = new RawState(s.Position, vel0, _bank, s.Mass);
        var k1 = FlightModel.Derivatives(r, cmd, _p, _liftRef);
        var k2 = FlightModel.Derivatives(Apply(r, k1, dt / 2), cmd, _p, _liftRef);
        var k3 = FlightModel.Derivatives(Apply(r, k2, dt / 2), cmd, _p, _liftRef);
        var k4 = FlightModel.Derivatives(Apply(r, k3, dt), cmd, _p, _liftRef);
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
