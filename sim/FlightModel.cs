namespace GunsOnly.Sim;

public record AircraftParams(double MassKg, double WingAreaM2, double ThrustMaxN,
    double CD0, double InducedK, double CLMax, double CLMin, double RollRateMaxRad, double BankTau);

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

    public static double NzAeroMax(in AircraftState s, in AircraftParams p) {
        double q = 0.5 * Atmosphere.Density(s.Position.Y) * s.Speed * s.Speed;
        return q * p.WingAreaM2 * p.CLMax / (s.Mass * G0);
    }
    /// Negative-G aerodynamic bound (a negative number).
    public static double NzAeroMin(in AircraftState s, in AircraftParams p) {
        double q = 0.5 * Atmosphere.Density(s.Position.Y) * s.Speed * s.Speed;
        return q * p.WingAreaM2 * p.CLMin / (s.Mass * G0);
    }

    static double MachDragFactor(double mach) =>              // PLACEHOLDER transonic drag rise
        mach < 0.85 ? 1.0 : 1.0 + 8.0 * (mach - 0.85) * (mach - 0.85);

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
        double cd = p.CD0 * MachDragFactor(mach) + p.InducedK * cl * cl
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
