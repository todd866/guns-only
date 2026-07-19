namespace GunsOnly.Sim.Doctrine;
public sealed class PurePursuitLaw : IExecutionLaw {
    public DoctrineAdvice Advise(in AircraftState own, in AircraftState bandit,
        in AircraftParams p, double airspeedMps = double.NaN) {
        double bank = Geometry.BankToPlaceLiftVectorOn(own, bandit.Position);
        double err = Geometry.AngleOff(own, bandit);
        // PLACEHOLDER tactical G: rises with angle-off. This is a STAND-IN, not the answer —
        // "what G is right" is genuinely situational (his state, energy, rate vs radius, guns
        // defence) and is the doctrine engine's job to decide at M3. Do not re-flatten it into
        // a constant rule (e.g. "always sustained"): that deletes the decision M3 exists to make.
        double mp = Protection.MaxPerformG(own, p, airspeedMps);
        double g = System.Math.Clamp(1.0 + 9.0 * err, System.Math.Min(1.0, mp), mp);
        return new DoctrineAdvice(g, bank, "pure pursuit");
    }
}
public sealed class BreakLaw : IExecutionLaw {
    readonly int _dir; public BreakLaw(int direction) => _dir = direction >= 0 ? 1 : -1;
    public DoctrineAdvice Advise(in AircraftState own, in AircraftState bandit,
        in AircraftParams p, double airspeedMps = double.NaN) =>
        new(Protection.MaxPerformG(own, p, airspeedMps), _dir * 1.45, "break");
}
public sealed class GunsSaddleLaw : IExecutionLaw {
    public const double BulletSpeed = 870.0; // m/s, PLACEHOLDER .50 M3-ish
    public DoctrineAdvice Advise(in AircraftState own, in AircraftState bandit,
        in AircraftParams p, double airspeedMps = double.NaN) {
        double tof = Geometry.Range(own, bandit) / (BulletSpeed + own.Speed);
        var aim = bandit.Position + bandit.VelocityVector() * tof;
        double bank = Geometry.BankToPlaceLiftVectorOn(own, aim);
        var vhatDot = System.Math.Clamp(own.ForwardDir().Dot((aim - own.Position).Normalized()), -1, 1);
        double err = System.Math.Acos(vhatDot);
        // PLACEHOLDER tactical G: rises with angle-off. This is a STAND-IN, not the answer —
        // "what G is right" is genuinely situational (his state, energy, rate vs radius, guns
        // defence) and is the doctrine engine's job to decide at M3. Do not re-flatten it into
        // a constant rule (e.g. "always sustained"): that deletes the decision M3 exists to make.
        double mp = Protection.MaxPerformG(own, p, airspeedMps);
        double g = System.Math.Clamp(1.0 + 9.0 * err, System.Math.Min(1.0, mp), mp);
        return new DoctrineAdvice(g, bank, "guns solution");
    }
}

/// Carrier control advice: fly the groove wings-level at ~1 G. Human paddles calls come from Lso,
/// which reads the real glideslope, lineup and energy state instead of this neutral control law.
public sealed class ApproachLaw : IExecutionLaw {
    public DoctrineAdvice Advise(in AircraftState own, in AircraftState bandit,
        in AircraftParams p, double airspeedMps = double.NaN)
        => new(1.0, 0.0, "carrier recovery");
}
