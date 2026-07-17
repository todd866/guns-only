namespace GunsOnly.Sim.Doctrine;
public sealed class PurePursuitLaw : IExecutionLaw {
    public DoctrineAdvice Advise(in AircraftState own, in AircraftState bandit, in AircraftParams p) {
        double bank = Geometry.BankToPlaceLiftVectorOn(own, bandit.Position);
        double err = Geometry.AngleOff(own, bandit);
        double mp = Protection.MaxPerformG(own, p);
        double g = System.Math.Clamp(1.0 + 9.0 * err, System.Math.Min(1.0, mp), mp);
        return new DoctrineAdvice(g, bank, "pure pursuit");
    }
}
public sealed class BreakLaw : IExecutionLaw {
    readonly int _dir; public BreakLaw(int direction) => _dir = direction >= 0 ? 1 : -1;
    public DoctrineAdvice Advise(in AircraftState own, in AircraftState bandit, in AircraftParams p) =>
        new(Protection.MaxPerformG(own, p), _dir * 1.45, "break");
}
public sealed class GunsSaddleLaw : IExecutionLaw {
    public const double BulletSpeed = 870.0; // m/s, PLACEHOLDER .50 M3-ish
    public DoctrineAdvice Advise(in AircraftState own, in AircraftState bandit, in AircraftParams p) {
        double tof = Geometry.Range(own, bandit) / (BulletSpeed + own.Speed);
        var aim = bandit.Position + bandit.VelocityVector() * tof;
        double bank = Geometry.BankToPlaceLiftVectorOn(own, aim);
        var vhatDot = System.Math.Clamp(own.ForwardDir().Dot((aim - own.Position).Normalized()), -1, 1);
        double err = System.Math.Acos(vhatDot);
        double mp = Protection.MaxPerformG(own, p);
        double g = System.Math.Clamp(1.0 + 9.0 * err, System.Math.Min(1.0, mp), mp);
        return new DoctrineAdvice(g, bank, "guns solution");
    }
}
