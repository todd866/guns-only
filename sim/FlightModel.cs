namespace GunsOnly.Sim;

public record AircraftParams(double MassKg, double WingAreaM2, double ThrustMaxN,
    double CD0, double InducedK, double CLMax, double RollRateMaxRad, double BankTau);

public readonly record struct StateDeriv(Vec3D DPos, double DSpeed, double DGamma, double DChi, double DBank);

public static class FlightModel {
    public const double G0 = 9.80665;
    // PLACEHOLDER Sabre-shaped numbers. M1 replaces with table-driven 6DOF. Shape > fidelity here.
    public static readonly AircraftParams Sabre = new(
        MassKg: 6900, WingAreaM2: 26.8, ThrustMaxN: 26300,
        CD0: 0.0180, InducedK: 0.083, CLMax: 1.10,
        RollRateMaxRad: 2.1, BankTau: 0.18);

    public static double NzAeroMax(in AircraftState s, in AircraftParams p) {
        double q = 0.5 * Atmosphere.Density(s.Position.Y) * s.Speed * s.Speed;
        return q * p.WingAreaM2 * p.CLMax / (s.Mass * G0);
    }
    static double MachDragFactor(double mach) =>              // PLACEHOLDER transonic drag rise
        mach < 0.85 ? 1.0 : 1.0 + 8.0 * (mach - 0.85) * (mach - 0.85);
    static double ThrustLapse(double altM) => Atmosphere.Density(altM) / 1.225;

    public static StateDeriv Derivatives(in AircraftState s, in PilotCommand c, in AircraftParams p) {
        double rho = Atmosphere.Density(s.Position.Y);
        double q = 0.5 * rho * s.Speed * s.Speed;
        double nzAvail = q * p.WingAreaM2 * p.CLMax / (s.Mass * G0);
        double nz = System.Math.Clamp(c.GDemand, -1.5, System.Math.Min(nzAvail, 7.33));
        double cl = nz * s.Mass * G0 / System.Math.Max(q * p.WingAreaM2, 1e-6);
        double mach = s.Speed / Atmosphere.SpeedOfSound(s.Position.Y);
        double cd = p.CD0 * MachDragFactor(mach) + p.InducedK * cl * cl;
        double drag = q * p.WingAreaM2 * cd + System.Math.Abs(c.Rudder) * 0.15 * q * p.WingAreaM2 * p.CD0;
        double thrust = System.Math.Clamp(c.Throttle, 0, 1) * p.ThrustMaxN * ThrustLapse(s.Position.Y);

        double dSpeed = (thrust - drag) / s.Mass - G0 * System.Math.Sin(s.Gamma);
        double dGamma = (G0 / System.Math.Max(s.Speed, 20)) * (nz * System.Math.Cos(s.Bank) - System.Math.Cos(s.Gamma));
        double dChi = G0 * nz * System.Math.Sin(s.Bank) / (System.Math.Max(s.Speed, 20) * System.Math.Cos(s.Gamma))
                      + c.Rudder * 0.06; // PLACEHOLDER rudder yaw-jink authority
        double bankErr = c.BankTarget - s.Bank;
        double dBank = System.Math.Clamp(bankErr / p.BankTau, -p.RollRateMaxRad, p.RollRateMaxRad);
        return new StateDeriv(s.VelocityVector(), dSpeed, dGamma, dChi, dBank);
    }
}
