namespace GunsOnly.Sim;

/// <summary>
/// Cold-gas reaction control for exo-atmospheric coast. Same stick as aero: FCS fades aero
/// control moments with dynamic pressure and fills the gap with thruster moments while gas lasts.
/// Coast aim is nose on the velocity vector before dense reentry.
/// </summary>
public static class ColdGasRcs {
    /// <summary>Below this q, aero surfaces contribute nothing useful (RCS owns attitude).</summary>
    public const double QRcsFullPa = 1_000.0;
    /// <summary>Above this q, aero owns attitude; RCS stays off.</summary>
    public const double QAeroFullPa = 8_000.0;

    public static double AeroControlAuthority(double qPa) {
        if (!double.IsFinite(qPa) || qPa <= QRcsFullPa) return 0.0;
        if (qPa >= QAeroFullPa) return 1.0;
        double t = (qPa - QRcsFullPa) / (QAeroFullPa - QRcsFullPa);
        return t * t * (3.0 - 2.0 * t);
    }

    public static double RcsAuthority(double qPa, double gasRemainingKg) {
        if (!(gasRemainingKg > 1e-9)) return 0.0;
        return 1.0 - AeroControlAuthority(qPa);
    }

    /// <summary>
    /// Angle between body forward and velocity, degrees. Zero means heat-safe / α≈0 reentry
    /// attitude. Undefined (returns 0) when speed is negligible.
    /// </summary>
    public static double NoseOnVelocityErrorDeg(in Vec3D bodyForward, in Vec3D velocity) {
        double speed = velocity.Length;
        if (speed < 1e-6) return 0.0;
        double forwardLen = bodyForward.Length;
        if (forwardLen < 1e-9) return 0.0;
        double cos = Math.Clamp(
            bodyForward.Dot(velocity) / (forwardLen * speed), -1.0, 1.0);
        return Math.Acos(cos) * (180.0 / Math.PI);
    }

    /// <summary>
    /// Burn proportional to commanded thruster fraction. Full moment for one second burns
    /// <paramref name="burnKgPerFullSecond"/> of the tank.
    /// </summary>
    public static double ConsumeGas(
        double gasRemainingKg,
        double rcsMomentNm,
        double dtSeconds,
        double maxMomentNm,
        double capacityKg,
        double burnKgPerFullSecond) {
        if (!(gasRemainingKg > 0.0) || !(dtSeconds > 0.0) || !(maxMomentNm > 0.0))
            return Math.Max(0.0, gasRemainingKg);
        double fraction = Math.Clamp(Math.Abs(rcsMomentNm) / maxMomentNm, 0.0, 1.0);
        double burn = fraction * burnKgPerFullSecond * dtSeconds;
        return Math.Clamp(gasRemainingKg - burn, 0.0, Math.Max(0.0, capacityKg));
    }

    public static double ScaleControlMoment(double aeroMomentNm, double aeroAuthority) =>
        aeroMomentNm * Math.Clamp(aeroAuthority, 0.0, 1.0);

    public static double RcsMomentForDemand(
        double demandMomentNm, double rcsAuthority, double maxMomentNm) {
        if (!(rcsAuthority > 0.0) || !(maxMomentNm > 0.0)) return 0.0;
        return Math.Clamp(demandMomentNm, -maxMomentNm, maxMomentNm) * rcsAuthority;
    }
}
