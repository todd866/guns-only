namespace GunsOnly.Sim;

public sealed class AircraftSim {
    public const double TickHz = 120.0;
    public AircraftState State { get; private set; }
    public double LastNz { get; private set; } = 1.0;
    public bool Buffet { get; private set; }
    readonly AircraftParams _p;
    public AircraftSim(AircraftState initial, AircraftParams p) { State = initial; _p = p; }

    public void Step(in PilotCommand cmd, double dt) {
        var s = State;
        var r = new RawState(s.Position, s.VelocityVector(), s.Bank, s.Mass);
        var k1 = FlightModel.Derivatives(r, cmd, _p);
        var k2 = FlightModel.Derivatives(Apply(r, k1, dt / 2), cmd, _p);
        var k3 = FlightModel.Derivatives(Apply(r, k2, dt / 2), cmd, _p);
        var k4 = FlightModel.Derivatives(Apply(r, k3, dt), cmd, _p);
        var pos = r.Pos + (k1.DPos + (k2.DPos + k3.DPos) * 2 + k4.DPos) * (dt / 6);
        var vel = r.Vel + (k1.DVel + (k2.DVel + k3.DVel) * 2 + k4.DVel) * (dt / 6);
        double bank = WrapPi(r.Bank + (k1.DBank + 2 * (k2.DBank + k3.DBank) + k4.DBank) * (dt / 6));

        double speed = vel.Length;
        if (speed < 40) { vel = (speed < 1e-9 ? new Vec3D(0, 0, 40) : vel.Normalized() * 40); speed = 40; } // PLACEHOLDER mush floor
        double gamma = System.Math.Asin(System.Math.Clamp(vel.Y / speed, -1, 1));
        double chi = System.Math.Atan2(vel.X, vel.Z); // 0 = north(+Z), positive toward east(+X)
        if (!IsFinite(pos) || !double.IsFinite(speed) || !double.IsFinite(bank))
            throw new System.InvalidOperationException("non-finite sim state");
        State = new AircraftState(pos, speed, gamma, chi, bank, s.Mass);

        var (nz, nzMax, nzMin) = FlightModel.ClampNz(State, cmd, _p);
        LastNz = nz;
        Buffet = cmd.GDemand > 0.85 * nzMax || cmd.GDemand < 0.85 * nzMin;
    }

    static RawState Apply(in RawState r, in StateDeriv d, double h) =>
        new(r.Pos + d.DPos * h, r.Vel + d.DVel * h, r.Bank + d.DBank * h, r.Mass);
    static double WrapPi(double a) => System.Math.IEEERemainder(a, 2 * System.Math.PI); // O(1), never iterates
    static bool IsFinite(in Vec3D v) => double.IsFinite(v.X) && double.IsFinite(v.Y) && double.IsFinite(v.Z);
}
