namespace GunsOnly.Sim.Cobra;

/// <summary>
/// Minimal physical M28A1-style mount: azimuth/elevation state slews toward the gunner's aim
/// point at a finite servo rate and stops at the flexible-envelope limits, so the gun takes a
/// real beat to come onto a target instead of teleporting. Slew rate is provisional —
/// see docs/airframes/ah-1g-cobra/00-sources.md.
/// </summary>
public sealed class CobraTurretServo
{
    public const double DefaultSlewRateRadPerSecond = 1.4; // ≈80°/s

    readonly double _slewRateRadPerSecond;

    public CobraTurretServo(double slewRateRadPerSecond = DefaultSlewRateRadPerSecond)
    {
        if (!double.IsFinite(slewRateRadPerSecond) || slewRateRadPerSecond <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(slewRateRadPerSecond));
        _slewRateRadPerSecond = slewRateRadPerSecond;
    }

    public double AzimuthRad { get; private set; }
    public double ElevationRad { get; private set; }

    public void Reset()
    {
        AzimuthRad = 0.0;
        ElevationRad = 0.0;
    }

    public void Advance(double dtSeconds, double targetAzimuthRad, double targetElevationRad)
    {
        if (!double.IsFinite(dtSeconds) || dtSeconds <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(dtSeconds));
        if (!double.IsFinite(targetAzimuthRad) || !double.IsFinite(targetElevationRad))
            throw new ArgumentOutOfRangeException(nameof(targetAzimuthRad));

        double clampedAzimuth = Math.Clamp(
            targetAzimuthRad,
            -CobraGunTargeting.TurretAzimuthLimitRad,
            CobraGunTargeting.TurretAzimuthLimitRad);
        double clampedElevation = Math.Clamp(
            targetElevationRad,
            CobraGunTargeting.TurretMinElevationRad,
            CobraGunTargeting.TurretMaxElevationRad);
        double maxStep = _slewRateRadPerSecond * dtSeconds;
        AzimuthRad += Math.Clamp(clampedAzimuth - AzimuthRad, -maxStep, maxStep);
        ElevationRad += Math.Clamp(clampedElevation - ElevationRad, -maxStep, maxStep);
    }

    /// <summary>Sight coincidence error between the mount's current pointing and the aim point.</summary>
    public double ErrorRad(double targetAzimuthRad, double targetElevationRad)
    {
        if (!double.IsFinite(targetAzimuthRad) || !double.IsFinite(targetElevationRad))
            throw new ArgumentOutOfRangeException(nameof(targetAzimuthRad));
        double deltaAzimuth = targetAzimuthRad - AzimuthRad;
        double deltaElevation = targetElevationRad - ElevationRad;
        double cosElevation = Math.Cos(ElevationRad);
        return Math.Sqrt(
            deltaAzimuth * deltaAzimuth * cosElevation * cosElevation
            + deltaElevation * deltaElevation);
    }
}
