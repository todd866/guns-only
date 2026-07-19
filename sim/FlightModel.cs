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
    double YawModeFreq = 1.5, double YawModeDamp = 0.18,
    double RollModeFreq = 4.0, double RollModeDamp = 0.7,
    double BuffetGain = 0.5,   // subtle shudder — the aircraft is stable, so a big camera buffet just reads as "out of control"
    // PLACEHOLDER Sabre-ish principal inertias and control/aero-damping moments pending airframe data.
    double IxxKgM2 = 9000, double IyyKgM2 = 45000, double IzzKgM2 = 52000,
    double RollStiffnessNmRad = 135000, double PitchStiffnessNmRad = 540000, double YawStiffnessNmRad = 120000,
    double RollDampingNms = 60000, double PitchDampingNms = 220000, double YawDampingNms = 120000,
    double RollMomentMaxNm = 50000, double PitchMomentMaxNm = 140000, double YawMomentMaxNm = 65000,
    // PLACEHOLDER gentler direct-attitude hold for fine approach corrections.
    double ApproachPitchStiffnessNmRad = 360000, double ApproachPitchMomentMaxNm = 110000,
    double CYBeta = 0.65,
    // Manual pitch-rate command and legacy State.Bank compatibility. Body attitude is authoritative;
    // the compatibility pair keeps old telemetry/RK4 behavior separate from the flown roll tuning.
    double ManualPitchRateMaxRad = 0.60, double ManualPitchAngleTau = 0.60,
    // Optional flown-axis roll authority. RollRateMaxRad remains the generic/compatibility value;
    // a fighter can expose its real manual rate without changing compatibility command-bank tuning.
    double FightRollRateMaxRad = -1.0,
    double CompatibilityRollRateMaxRad = -1.0, double CompatibilityBankTau = -1.0,
    // Stability augmentation. YawBetaStiffness centers the ball independently of the attitude
    // tracker; RollHoldDamping is blended in only near a captured roll target, never while the
    // pilot's rate-command lead is asking for a roll.
    double YawBetaStiffnessNmRad = 180000, double RollHoldDampingNms = 50000,
    double RollHoldErrorRad = 0.10,
    // Airframe envelope limits. Defaults preserve the existing unmanned/afterburning aircraft;
    // the F-86 overrides these with its piloted structural limit and dry-thrust-only J47.
    double PositiveStructuralLimitG = 12.0, double MaxPerformFraction = 0.92,
    double MaxThrustFraction = 1.35,
    // Extra drag from buffet/separation as the wing approaches CLmax. The quadratic polar remains
    // authoritative below OnsetFraction; this smooth term only closes the hard-turn energy bill.
    double HighLiftDragOnsetFraction = 1.0, double HighLiftDragK = 0.0);

/// Internal integration state: velocity is a Cartesian world vector, so vertical
/// flight is not singular (no division by cos gamma anywhere).
public readonly record struct RawState(Vec3D Pos, Vec3D Vel, double Bank, double Mass,
    QuaternionD Attitude, BodyRates BodyRates);

public readonly record struct StateDeriv(Vec3D DPos, Vec3D DVel, double DBank,
    QuaternionD DAttitude, BodyRates DBodyRates);

internal readonly record struct AeroResult(Vec3D Accel, Vec3D LiftDir, Vec3D AirVelocity,
    double Alpha, double Beta, double Nz, double DynamicPressure);

public static class FlightModel {
    public const double G0 = 9.80665;
    // F-86F-30/J47-GE-27 clean combat envelope. Each number is tied to the report's documented
    // target; effective drag coefficients include whole-aircraft losses represented by this kernel.
    public static readonly AircraftParams Sabre = new(
        MassKg: 6900,                         // ~15,200 lb representative clean combat weight
        WingAreaM2: 26.8,                     // F-86F wing area: 288 sq ft
        ThrustMaxN: 26300,                    // J47-GE-27 military thrust: ~5,910 lbf
        CD0: 0.0166,                          // fits 595 kt SL / 525 kt at 35,000 ft in MIL
        InducedK: 0.0450,                     // fits ~5 G sustained at 350 kt / 10,000 ft
        CLMax: 1.10,                          // fits +7 G corner near 375 kt TAS / 10,000 ft
        CLMin: -0.65,                         // symmetric-airfoil negative-lift authority
        RollRateMaxRad: 0.65, BankTau: 0.52,
        RollDampingNms: 70000, RollMomentMaxNm: 180000,
        PitchMomentMaxNm: 200000,
        FightRollRateMaxRad: 2.40,            // NACA operational peak: ~138–140 deg/s
        CompatibilityRollRateMaxRad: 2.1, CompatibilityBankTau: 0.18,
        MCrit: 0.89, WaveDragK: 500.0,        // rapid swept-wing drag rise around M0.86–0.89
        PositiveStructuralLimitG: 7.0,        // T.O. 1F-86F-1 maneuver limit: +7 G
        MaxPerformFraction: 1.0,              // full backstick reaches that +7 G boundary
        MaxThrustFraction: 1.0,               // J47-GE-27: military power, no afterburner
        HighLiftDragOnsetFraction: 0.90,       // buffet/separation rise only in the last 10% of CL
        HighLiftDragK: 12.7);                 // fits ~12 kt/s bleed in a +7 G, 375 kt turn

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
        double tau = p.CompatibilityBankTau > 0.0 ? p.CompatibilityBankTau : p.BankTau;
        double rateMax = p.CompatibilityRollRateMaxRad > 0.0 ? p.CompatibilityRollRateMaxRad : p.RollRateMaxRad;
        return System.Math.Clamp(err / tau, -rateMax, rateMax);
    }

    internal static double FightRollRate(in AircraftParams p) =>
        p.FightRollRateMaxRad > 0.0 ? p.FightRollRateMaxRad : p.RollRateMaxRad;

    internal static StateDeriv Derivatives(in RawState r, in PilotCommand c, in AircraftParams p, in Vec3D liftRef, in Vec3D wind) {
        // Aerodynamics acts on the AIR, and the air may be moving: true airspeed = ground
        // velocity − wind. Everything aero (dynamic pressure, the lift/drag/thrust frame) is
        // built from vAir; position still integrates GROUND velocity (Newton in the inertial
        // frame — see DPos below). So a gust rotates and scales vAir, the whole force vector
        // rotates and scales with it, and the flight path bumps — turbulence as a disturbance
        // IN the loop, not a shake on top. wind = Zero reproduces still-air flight exactly.
        var vAir = r.Vel - wind;
        double speed = System.Math.Max(vAir.Length, 20.0);
        var controlVhat = vAir.Length < 1e-9 ? new Vec3D(0, 0, 1) : vAir.Normalized();
        double rho = Atmosphere.Density(r.Pos.Y);
        double q = 0.5 * rho * speed * speed;
        var aero = Aerodynamics(r, c, p, wind);
        var (dAttitude, dRates) = RotationalDerivatives(r, c, p, liftRef, controlVhat, q,
            speed);
        return new StateDeriv(r.Vel, aero.Accel, BankRate(r.Bank, c.BankTarget, p), dAttitude, dRates);
    }

    internal static AeroResult Aerodynamics(in RawState r, in PilotCommand c, in AircraftParams p, in Vec3D wind) {
        var vAir = r.Vel - wind;
        double speed = System.Math.Max(vAir.Length, 20.0);
        var vhat = vAir.Length < 1e-9 ? new Vec3D(0, 0, 1) : vAir.Normalized();
        var attitude = r.Attitude.Normalized();
        var bodyRight = attitude.Rotate(new Vec3D(1, 0, 0));
        var bodyUp = attitude.Rotate(new Vec3D(0, 1, 0));
        var bodyForward = attitude.Rotate(new Vec3D(0, 0, 1));
        double alpha = System.Math.Atan2(-vhat.Dot(bodyUp), vhat.Dot(bodyForward));
        double beta = System.Math.Asin(System.Math.Clamp(vhat.Dot(bodyRight), -1.0, 1.0));

        double rho = Atmosphere.Density(r.Pos.Y);
        double q = 0.5 * rho * speed * speed;
        double cl = System.Math.Clamp(p.CLAlpha * alpha, p.CLMin, p.CLMax);
        double mach = speed / Atmosphere.SpeedOfSound(r.Pos.Y);
        double highLiftFraction = System.Math.Abs(cl) / System.Math.Max(System.Math.Abs(p.CLMax), 1e-6);
        double highLiftExcess = System.Math.Max(0.0, highLiftFraction - p.HighLiftDragOnsetFraction);
        double cd = p.CD0 * MachDragFactor(mach, p) + p.InducedK * cl * cl
                    + p.HighLiftDragK * highLiftExcess * highLiftExcess
                    + System.Math.Abs(c.Rudder) * 0.15 * p.CD0 + beta * beta * 0.08;
        double liftAccel = q * p.WingAreaM2 * cl / r.Mass;
        double dragAccel = q * p.WingAreaM2 * cd / r.Mass;
        double thrustAccel = System.Math.Clamp(c.Throttle, 0, p.MaxThrustFraction)
                           * p.ThrustMaxN * (rho / 1.225) / r.Mass;

        // Aerodynamic lift and side force stay perpendicular to the relative wind while their
        // orientation comes from the real body axes. Rudder authority retains the tuned jink term.
        var liftPlane = bodyUp - vhat * bodyUp.Dot(vhat);
        var liftDir = liftPlane.Length < 1e-9 ? bodyUp : liftPlane.Normalized();
        var sidePlane = bodyRight - vhat * bodyRight.Dot(vhat);
        var sideDir = sidePlane.Length < 1e-9 ? bodyRight : sidePlane.Normalized();
        double sideAccel = c.Rudder * 0.06 * speed - q * p.WingAreaM2 * p.CYBeta * beta / r.Mass;
        var accel = bodyForward * thrustAccel - vhat * dragAccel + liftDir * liftAccel
                  + sideDir * sideAccel - new Vec3D(0, G0, 0);
        return new AeroResult(accel, liftDir, vAir, alpha, beta, liftAccel / G0, q);
    }

    static (QuaternionD dAttitude, BodyRates dRates) RotationalDerivatives(in RawState r,
        in PilotCommand c, in AircraftParams p, in Vec3D liftRef, in Vec3D vhat,
        double dynamicPressure, double speed) {
        var attitude = r.Attitude.Normalized();
        var target = TargetAttitude(r, c, p, liftRef, vhat, dynamicPressure);
        var error = attitude.Conjugate() * target;
        if (error.W < 0) error = -error;   // shortest rotation
        double vn = System.Math.Sqrt(error.X * error.X + error.Y * error.Y + error.Z * error.Z);
        double scale = vn < 1e-10 ? 2.0 : 2.0 * System.Math.Atan2(vn, error.W) / vn;
        // Quaternion local axes are right/up/forward. Positive aircraft q and p rotate about
        // -right and -forward respectively; positive r rotates about up.
        double errP = -error.Z * scale, errQ = -error.X * scale, errR = error.Y * scale;
        var rates = r.BodyRates;
        bool directPitch = double.IsFinite(c.CommandedPitchRad);
        double qCommand = 0.0;
        double alpha = 0.0, alphaTarget = 0.0;
        if (!directPitch) {
            var targetUp = target.Rotate(new Vec3D(0, 1, 0));
            var liftPlane = targetUp - vhat * targetUp.Dot(vhat);
            var targetLift = liftPlane.Length < 1e-9 ? targetUp : liftPlane.Normalized();
            double nz = TargetNz(r, c, p, dynamicPressure);
            double cl = nz * r.Mass * G0 / System.Math.Max(dynamicPressure * p.WingAreaM2, 1e-6);
            alphaTarget = System.Math.Clamp(cl / p.CLAlpha,
                p.CLMin / p.CLAlpha, p.CLMax / p.CLAlpha);
            var bodyUp = attitude.Rotate(new Vec3D(0, 1, 0));
            var bodyForward = attitude.Rotate(new Vec3D(0, 0, 1));
            alpha = System.Math.Atan2(-vhat.Dot(bodyUp), vhat.Dot(bodyForward));
            // Exact normal-plane curvature feed-forward. At 90 deg AOB targetLift.Y is zero,
            // so a 7 G pull commands about 20 deg/s at 375 kt in the CURRENT bank plane. There is
            // no doctrine attitude or wings-level term in this pitch law.
            qCommand = System.Math.Clamp((nz - targetLift.Y) * G0 / speed,
                -p.ManualPitchRateMaxRad, p.ManualPitchRateMaxRad);
        }
        double pitchStiffness = directPitch ? p.ApproachPitchStiffnessNmRad : p.PitchStiffnessNmRad;
        double pitchMomentMax = directPitch ? p.ApproachPitchMomentMaxNm : p.PitchMomentMaxNm;
        // DetentLayer's active roll-rate command holds the target a fixed lead ahead of the body.
        // Near zero error the pilot has released/captured the roll axis:
        // blend in extra p damping there so a gust or residual pitch/yaw coupling dies promptly.
        // Outside this small capture region the extra hold is exactly zero, preserving commanded
        // roll authority from the control-authority pass.
        double rollHoldBlend = 1.0 - System.Math.Clamp(System.Math.Abs(errP)
            / System.Math.Max(p.RollHoldErrorRad, 1e-6), 0.0, 1.0);
        double rollDamping = p.RollDampingNms + p.RollHoldDampingNms * rollHoldBlend;
        // Rate-limit the attitude error before applying the moment. A distant target therefore
        // cannot create a 2-3x rate spike, while DetentLayer's moving lead still commands the full
        // 2.4 rad/s Sabre roll rate and a tap remains a small, placeable attitude correction.
        double rollRateMax = FightRollRate(p);
        double rollRateCommand = System.Math.Clamp(p.RollStiffnessNmRad * errP / rollDamping,
            -rollRateMax, rollRateMax);
        double rollMoment = System.Math.Clamp(rollDamping * (rollRateCommand - rates.P),
            -p.RollMomentMaxNm, p.RollMomentMaxNm);
        // FREE/FIGHT is direct normal-load control: G maps to a CL-limited alpha target and the
        // moment loop tracks that measured alpha plus the required turn rate. This both builds G
        // promptly and makes the CL bounds an active AoA barrier instead of letting attitude-command
        // wind-up carry the jet to the reported -50 deg departure. Carrier approach keeps its
        // separate finite-pitch attitude tracker unchanged.
        double pitchError = directPitch ? errQ : alphaTarget - alpha;
        double pitchMoment = System.Math.Clamp(pitchStiffness * pitchError
            - p.PitchDampingNms * (rates.Q - qCommand),
            -pitchMomentMax, pitchMomentMax);
        var bodyRight = attitude.Rotate(new Vec3D(1, 0, 0));
        double beta = System.Math.Asin(System.Math.Clamp(vhat.Dot(bodyRight), -1.0, 1.0));
        // Positive beta in this body basis means the velocity vector is to the right of the nose,
        // so a positive yaw moment aligns the nose with it and drives beta toward zero. Fade the
        // coordinator out under full manual rudder: intermediate rudder adds to it, full rudder
        // owns the axis, and hands-off maneuvering keeps the ball centered.
        double coordinatorMoment = p.YawBetaStiffnessNmRad * beta
            * (1.0 - System.Math.Clamp(System.Math.Abs(c.Rudder), 0.0, 1.0));
        double yawMoment = System.Math.Clamp(p.YawStiffnessNmRad * errR - p.YawDampingNms * rates.R
            + coordinatorMoment + c.Rudder * p.YawMomentMaxNm,
            -p.YawMomentMaxNm, p.YawMomentMaxNm);

        double pDot = (rollMoment + (p.IyyKgM2 - p.IzzKgM2) * rates.Q * rates.R) / p.IxxKgM2;
        double qDot = (pitchMoment + (p.IzzKgM2 - p.IxxKgM2) * rates.R * rates.P) / p.IyyKgM2;
        double rDot = (yawMoment + (p.IxxKgM2 - p.IyyKgM2) * rates.P * rates.Q) / p.IzzKgM2;
        var omega = new QuaternionD(0, -rates.Q, rates.R, -rates.P);
        return ((attitude * omega) * 0.5, new BodyRates(pDot, qDot, rDot));
    }

    static QuaternionD TargetAttitude(in RawState r, in PilotCommand c, in AircraftParams p,
        in Vec3D liftRef, in Vec3D vhat, double dynamicPressure) {
        if (double.IsFinite(c.CommandedPitchRad)) {
            double chi = System.Math.Atan2(vhat.X, vhat.Z);
            double cp = System.Math.Cos(c.CommandedPitchRad);
            var forwardCmd = new Vec3D(System.Math.Sin(chi) * cp, System.Math.Sin(c.CommandedPitchRad), System.Math.Cos(chi) * cp);
            var up0 = new Vec3D(0, 1, 0) - forwardCmd * forwardCmd.Y;
            up0 = up0.Length < 1e-6 ? liftRef : up0.Normalized();
            var right0 = up0.Cross(forwardCmd).Normalized();
            var upCmd = (up0 * System.Math.Cos(c.BankTarget) + right0 * System.Math.Sin(c.BankTarget)).Normalized();
            return QuaternionD.FromFrame(upCmd.Cross(forwardCmd).Normalized(), upCmd, forwardCmd);
        }

        var lr0 = liftRef - vhat * liftRef.Dot(vhat);
        var upRef = lr0.Length < 1e-6 ? new Vec3D(0, 1, 0) : lr0.Normalized();
        var rightRef = upRef.Cross(vhat).Normalized();
        var lift = (upRef * System.Math.Cos(c.BankTarget) + rightRef * System.Math.Sin(c.BankTarget)).Normalized();
        double nz = TargetNz(r, c, p, dynamicPressure);
        double cl = nz * r.Mass * G0 / System.Math.Max(dynamicPressure * p.WingAreaM2, 1e-6);
        double alpha = System.Math.Clamp(cl / p.CLAlpha, p.CLMin / p.CLAlpha, p.CLMax / p.CLAlpha);
        var forward = (vhat * System.Math.Cos(alpha) + lift * System.Math.Sin(alpha)).Normalized();
        var up = (lift * System.Math.Cos(alpha) - vhat * System.Math.Sin(alpha)).Normalized();
        return QuaternionD.FromFrame(up.Cross(forward).Normalized(), up, forward);
    }

    static double TargetNz(in RawState r, in PilotCommand c, in AircraftParams p, double dynamicPressure) {
        double nzMax = System.Math.Min(dynamicPressure * p.WingAreaM2 * p.CLMax / (r.Mass * G0),
            p.PositiveStructuralLimitG);
        double nzMin = System.Math.Max(dynamicPressure * p.WingAreaM2 * p.CLMin / (r.Mass * G0), -1.5);
        return System.Math.Clamp(c.GDemand, nzMin, nzMax);
    }

    /// Directional nz clamp shared by Step's reporting (same bounds as Derivatives).
    internal static (double nz, double nzMax, double nzMin) ClampNz(in AircraftState s, in PilotCommand c, in AircraftParams p) {
        double q = 0.5 * Atmosphere.Density(s.Position.Y) * s.Speed * s.Speed;
        double nzMax = System.Math.Min(q * p.WingAreaM2 * p.CLMax / (s.Mass * G0),
            p.PositiveStructuralLimitG);
        double nzMin = System.Math.Max(q * p.WingAreaM2 * p.CLMin / (s.Mass * G0), -1.5);
        return (System.Math.Clamp(c.GDemand, nzMin, nzMax), nzMax, nzMin);
    }
}
