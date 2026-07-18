namespace GunsOnly.Sim;

/// SpoolUpTau/SpoolDownTau: first-order engine lag, in seconds. Thrust is NOT instantaneous.
/// This is the difference between a toy and a sim on the back side of the power curve, where
/// you hold the glidepath with power and the engine answers late -- and it is exactly why
/// early-jet carrier recovery was lethal: a waveoff asks for thrust the engine cannot give
/// you for several seconds. Spool-DOWN is faster than spool-up (a compressor sheds RPM more
/// readily than it gains it), hence two constants, not one.
public record AircraftParams(double MassKg, double WingAreaM2, double ThrustMaxN,
    double CD0, double InducedK, double CLMax, double CLMin, double RollRateMaxRad, double BankTau,
    double MCrit = 0.85, double WaveDragK = 8.0,
    double SpoolUpTau = 2.5, double SpoolDownTau = 1.4,
    // Lift-curve slope, per radian. Governs how hard a gust bumps you: a vertical gust changes
    // the effective AoA by (gust/V) and lift by q·S·CLα·Δα. ~2π·AR/(AR+2): Sabre AR≈4.5 → ~4.5.
    double CLAlpha = 4.5,
    // Rotational-buffet modes (the gust-driven shudder), as damped 2nd-order oscillators: ω is
    // the natural frequency (rad/s), ζ the damping ratio. Short-period pitch (fast, moderate
    // damping); dutch-roll yaw (lightly damped, which is why it's felt); roll (fast, well damped).
    // BuffetGain is the DC buffet-angle / gust-angle ratio. Placeholder values pending airframe data.
    double PitchModeFreq = 3.0, double PitchModeDamp = 0.4,
    double YawModeFreq = 1.5, double YawModeDamp = 0.15,
    double RollModeFreq = 4.0, double RollModeDamp = 0.7,
    double BuffetGain = 0.5);   // subtle shudder — the aircraft is stable, so a big camera buffet just reads as "out of control"

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

    /// TAIWAN DEFENCE — balloon-lofted glider strike drone. A BALLOON DRONE, a different
    /// lineage from the powered jet drones: it is a one-way sniper against soft high-value
    /// targets, and it never dogfights anything. NO ENGINE (thrust = 0), so every turn is a
    /// withdrawal from an altitude account you can never pay back into — the game's purest
    /// energy teacher. Silent: no plume, no intake return, which is WHY it reaches an AWACS.
    ///
    /// Sized for MISSION-KILL, not destruction: breaking a rotodome, holing a pressure hull
    /// (forcing descent), or hurting one engine takes a handful of 12.7mm — not a cannon.
    /// That collapses the mass budget (gun 38kg + 50 rds 5kg + wing/pod ~85kg + EO 12kg ≈ 140kg),
    /// and mass is BRUTALLY levered by the balloon: on one 20 m hydrogen balloon, 140kg reaches
    /// 81,000 ft where 1100kg reached only 41,000 ft. 7x lighter bought 40,000 ft and 369 nm of
    /// glide. Recoil stays affordable too: 12.7mm on 140kg = 7 kt/s (a 20mm rotary would be 33).
    /// PLACEHOLDER numbers, derived to the mission not to a real aircraft.
    public static readonly AircraftParams GliderStrike = new(
        MassKg: 140, WingAreaM2: 2.6, ThrustMaxN: 0,
        CD0: 0.0115, InducedK: 0.0284, CLMax: 1.30, CLMin: -0.50,
        RollRateMaxRad: 1.6, BankTau: 0.28,
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

    internal static StateDeriv Derivatives(in RawState r, in PilotCommand c, in AircraftParams p, in Vec3D liftRef, in Vec3D wind) {
        // Aerodynamics acts on the AIR, and the air may be moving: true airspeed = ground
        // velocity − wind. Everything aero (dynamic pressure, the lift/drag/thrust frame) is
        // built from vAir; position still integrates GROUND velocity (Newton in the inertial
        // frame — see DPos below). So a gust rotates and scales vAir, the whole force vector
        // rotates and scales with it, and the flight path bumps — turbulence as a disturbance
        // IN the loop, not a shake on top. wind = Zero reproduces still-air flight exactly.
        var vAir = r.Vel - wind;
        double speed = System.Math.Max(vAir.Length, 20.0);
        var vhat = vAir.Length < 1e-9 ? new Vec3D(0, 0, 1) : vAir.Normalized();
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
        // c.Throttle here is the engine's ACTUAL spool fraction, not the lever position:
        // AircraftSim lags the lever through SpoolUpTau/SpoolDownTau before calling us. The
        // model is memoryless, so the state that makes thrust lag has to live in the sim.
        double thrust = System.Math.Clamp(c.Throttle, 0, 1.35) * p.ThrustMaxN * (rho / 1.225);  // >1 = afterburner

        // Gust-induced lift — the dominant felt bump, and the reason a G-command model needs it
        // spelled out. Lift here is slaved to commanded nz, so a gust would otherwise only rotate
        // the lift VECTOR (~0.005 G). The real bump is the lift MAGNITUDE change: the gust adds an
        // AoA perturbation Δα = (wind·liftDir)/V (an updraft = +liftDir raises AoA → more lift →
        // pushed up), so ΔL = q·S·CLα·Δα acts along liftDir. ~0.5 G for a 4 m/s gust. Zero wind →
        // zero term → still-air flight is bit-identical. (A violent gust could push CL past CLMax
        // into stall/buffet; unclamped here — fine for the gust magnitudes flown, revisit at the deck.)
        double gustAlpha = wind.Dot(liftDir) / speed;
        double gustLift = q * p.WingAreaM2 * p.CLAlpha * gustAlpha / r.Mass;

        var accel = vhat * ((thrust - drag) / r.Mass)
                  + liftDir * (nz * G0 + gustLift)
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
