namespace GunsOnly.Sim.Okanagan;

/// <summary>
/// Contact uses Euler bank/pitch/heading, while the aerodynamic integrator uses body P/Q/R.
/// These conversions use radians and seconds. Contact stays near upright, away from the
/// cos(bank)=0 singularity; steering prescribes heading rate and supplies the yaw constraint.
/// </summary>
internal static class FireBossSurfaceKinematics
{
    internal static (double Roll, double Pitch) ToEulerRates(double bank, double pitch,
        in BodyRates body, double headingRate) => (
            body.P + headingRate * Math.Sin(pitch),
            (body.Q - headingRate * Math.Sin(bank) * Math.Cos(pitch)) / Math.Cos(bank));

    internal static BodyRates ToBodyRates(double bank, double pitch,
        double rollRate, double pitchRate, double headingRate) => new(
            rollRate - headingRate * Math.Sin(pitch),
            pitchRate * Math.Cos(bank) + headingRate * Math.Sin(bank) * Math.Cos(pitch),
            -pitchRate * Math.Sin(bank) + headingRate * Math.Cos(bank) * Math.Cos(pitch));
}
