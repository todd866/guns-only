namespace GunsOnly.Sim;

public record AircraftParams(double MassKg, double WingAreaM2, double ThrustMaxN,
    double CD0, double InducedK, double CLMax, double CLMin, double RollRateMaxRad, double BankTau,
    double MCrit = 0.85, double WaveDragK = 8.0);

/// Internal integration state: velocity is a Cartesian world vector, so vertical
/// flight is not singular (no division by cos gamma anywhere).
public readonly record struct RawState(Vec3D Pos, Vec3D Vel, double Bank, double Mass);

public readonly record struct StateDeriv(Vec3D DPos, Vec3D DVel, double DBank);

public static class FlightModel {
    public const double G0 = 9.80665;
    // PLACEHOLDER Sabre-shaped numbers. M1 replaces with table-driven 6DOF. Shape > fidelity here.
    public static readonly AircraftParams Sabre = new(
        MassKg: 6900, WingAreaM2: 26.8, ThrustMaxN: 26300,
        CD0: 0.0180, InducedK: 0.083, CLMax: 1.10, CLMin: -0.65,
        RollRateMaxRad: 2.1, BankTau: 0.18);

    /// TAIWAN DEFENCE — balloon-lofted glider strike drone. NO ENGINE: thrust = 0, so every
    /// turn is a withdrawal from an altitude account you can never pay back into. That is what
    /// makes it the game's purest energy teacher. Silent, no IR plume, no intake return — which
    /// is precisely why it can reach an AWACS. High-AR wing (~14) for the glide; k = 1/(pi*AR*e).
    /// PLACEHOLDER numbers, derived to the mission not to a real aircraft.
    public static readonly AircraftParams GliderStrike = new(
        MassKg: 1100, WingAreaM2: 16.0, ThrustMaxN: 0,
        CD0: 0.0105, InducedK: 0.0284, CLMax: 1.35, CLMin: -0.55,
        RollRateMaxRad: 1.4, BankTau: 0.30,
        MCrit: 0.68, WaveDragK: 190.0);   // straight AR-13 wing: it simply cannot go fast

    /// The KJ-500-class AEW&C: how the PLA sees and coordinates. Enormous, slow, turboprop,
    /// structurally ~2.5G and it cannot dodge. Killing it blinds a strike package worth 100x
    /// the drone that got it — which is the entire cost-exchange thesis in one target.
    public static readonly AircraftParams AwacsTarget = new(
        MassKg: 55000, WingAreaM2: 120.0, ThrustMaxN: 90000,
        CD0: 0.0260, InducedK: 0.045, CLMax: 1.60, CLMin: -0.40,
        RollRateMaxRad: 0.35, BankTau: 2.0,
        MCrit: 0.60, WaveDragK: 90.0);

    public static double NzAeroMax(in AircraftState s, in AircraftParams p) {
        double q = 0.5 * Atmosphere.Density(s.Position.Y) * s.Speed * s.Speed;
        return q * p.WingAreaM2 * p.CLMax / (s.Mass * G0);
    }
    /// Negative-G aerodynamic bound (a negative number).
    public static double NzAeroMin(in AircraftState s, in AircraftParams p) {
        double q = 0.5 * Atmosphere.Density(s.Position.Y) * s.Speed * s.Speed;
        return q * p.WingAreaM2 * p.CLMin / (s.Mass * G0);
    }

    /// Drag divergence, per airframe. A straight high-AR wing (the glider's, AR~13) diverges
    /// near M0.65-0.70 and HARD — that wing physically cannot go fast, which is why a steep
    /// dive from a 60k balloon drop must be managed rather than pointed. A swept fighter wing
    /// holds to ~M0.85 with a gentler rise. Was a single global 0.85/8.0 every airframe inherited.
    static double MachDragFactor(double mach, in AircraftParams p) =>
        mach < p.MCrit ? 1.0 : 1.0 + p.WaveDragK * (mach - p.MCrit) * (mach - p.MCrit);

    internal static double BankRate(double bank, double target, in AircraftParams p) {
        double err = System.Math.IEEERemainder(target - bank, 2 * System.Math.PI); // shortest-way signed error
        return System.Math.Clamp(err / p.BankTau, -p.RollRateMaxRad, p.RollRateMaxRad);
    }

    internal static StateDeriv Derivatives(in RawState r, in PilotCommand c, in AircraftParams p, in Vec3D liftRef) {
        double speed = System.Math.Max(r.Vel.Length, 20.0);
        var vhat = r.Vel.Length < 1e-9 ? new Vec3D(0, 0, 1) : r.Vel.Normalized();
        var up = new Vec3D(0, 1, 0);
        // Persistent lift reference (parallel-transported by AircraftSim), re-orthogonalized per stage.
        var lr0 = liftRef - vhat * liftRef.Dot(vhat);
        var refDir = lr0.Length < 1e-6 ? new Vec3D(1, 0, 0) : lr0.Normalized();
        var rightRef = refDir.Cross(vhat); // physical right of path (left-handed basis: reversed operands)
        var rightHat = rightRef.Length < 1e-6 ? new Vec3D(1, 0, 0) : rightRef.Normalized();
        var liftDir = refDir * System.Math.Cos(r.Bank) + rightHat * System.Math.Sin(r.Bank); // +bank tilts lift right

        double rho = Atmosphere.Density(r.Pos.Y);
        double q = 0.5 * rho * speed * speed;
        double nzMax = System.Math.Min(q * p.WingAreaM2 * p.CLMax / (r.Mass * G0), 12.0);
        double nzMin = System.Math.Max(q * p.WingAreaM2 * p.CLMin / (r.Mass * G0), -1.5);
        double nz = System.Math.Clamp(c.GDemand, nzMin, nzMax);
        double cl = nz * r.Mass * G0 / System.Math.Max(q * p.WingAreaM2, 1e-6);
        double mach = speed / Atmosphere.SpeedOfSound(r.Pos.Y);
        double cd = p.CD0 * MachDragFactor(mach, p) + p.InducedK * cl * cl
                    + System.Math.Abs(c.Rudder) * 0.15 * p.CD0;
        double drag = q * p.WingAreaM2 * cd;
        double thrust = System.Math.Clamp(c.Throttle, 0, 1) * p.ThrustMaxN * (rho / 1.225);

        var accel = vhat * ((thrust - drag) / r.Mass)
                  + liftDir * (nz * G0)
                  - up * G0
                  + rightHat * (c.Rudder * 0.06 * speed); // PLACEHOLDER rudder yaw-jink authority
        return new StateDeriv(r.Vel, accel, BankRate(r.Bank, c.BankTarget, p));
    }

    /// Directional nz clamp shared by Step's reporting (same bounds as Derivatives).
    internal static (double nz, double nzMax, double nzMin) ClampNz(in AircraftState s, in PilotCommand c, in AircraftParams p) {
        double q = 0.5 * Atmosphere.Density(s.Position.Y) * s.Speed * s.Speed;
        double nzMax = System.Math.Min(q * p.WingAreaM2 * p.CLMax / (s.Mass * G0), 12.0);
        double nzMin = System.Math.Max(q * p.WingAreaM2 * p.CLMin / (s.Mass * G0), -1.5);
        return (System.Math.Clamp(c.GDemand, nzMin, nzMax), nzMax, nzMin);
    }
}
