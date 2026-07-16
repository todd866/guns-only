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
        var k1 = FlightModel.Derivatives(s, cmd, _p);
        var k2 = FlightModel.Derivatives(Apply(s, k1, dt/2), cmd, _p);
        var k3 = FlightModel.Derivatives(Apply(s, k2, dt/2), cmd, _p);
        var k4 = FlightModel.Derivatives(Apply(s, k3, dt), cmd, _p);
        State = new AircraftState(
            s.Position + (k1.DPos + (k2.DPos + k3.DPos)*2 + k4.DPos) * (dt/6),
            s.Speed  + (k1.DSpeed + 2*(k2.DSpeed + k3.DSpeed) + k4.DSpeed) * (dt/6),
            s.Gamma  + (k1.DGamma + 2*(k2.DGamma + k3.DGamma) + k4.DGamma) * (dt/6),
            Wrap(s.Chi + (k1.DChi + 2*(k2.DChi + k3.DChi) + k4.DChi) * (dt/6)),
            s.Bank   + (k1.DBank + 2*(k2.DBank + k3.DBank) + k4.DBank) * (dt/6),
            s.Mass);
        double nzAvail = FlightModel.NzAeroMax(State, _p);
        LastNz = System.Math.Clamp(cmd.GDemand, -1.5, System.Math.Min(nzAvail, 7.33));
        Buffet = cmd.GDemand > 0.85 * nzAvail;
        if (State.Speed < 40) State = State with { Speed = 40, Gamma = State.Gamma - 0.002 }; // PLACEHOLDER mush floor
    }
    static AircraftState Apply(in AircraftState s, in StateDeriv d, double h) => new(
        s.Position + d.DPos*h, s.Speed + d.DSpeed*h, s.Gamma + d.DGamma*h,
        s.Chi + d.DChi*h, s.Bank + d.DBank*h, s.Mass);
    static double Wrap(double a) { while (a > System.Math.PI) a -= 2*System.Math.PI; while (a < -System.Math.PI) a += 2*System.Math.PI; return a; }
}
