namespace GunsOnly.Sim;

/// <summary>
/// Conventional, unaugmented tail derivatives. Positive elevator is pilot nose-up input;
/// beta follows the kernel's velocity-right-of-nose convention. All coefficients are
/// nondimensional (angular derivatives per radian), with q*c/(2V) and r*b/(2V) damping.
/// Default disables this model. See the airframe source ledger for epistemic status.
/// </summary>
public readonly record struct ConventionalTailParameters(
    bool Enabled, double CmAlpha, double CmQ, double CmDeltaElevator,
    double MaxElevatorDeflectionRad, double CnBeta, double CnR, double CnDeltaRudder,
    double CyDeltaRudder = -0.25);

public static class ConventionalTailAerodynamics
{
    public static double TrimElevator(double alphaRad, in ConventionalTailParameters tail) =>
        tail.Enabled ? Math.Clamp(-tail.CmAlpha * alphaRad
            / (tail.CmDeltaElevator * tail.MaxElevatorDeflectionRad), -1.0, 1.0) : 0.0;

    public static double PitchMoment(double dynamicPressure, double speed, double area,
        double chord, double alpha, double pitchRate, double elevator,
        in ConventionalTailParameters tail)
    {
        double rate = Math.Clamp(pitchRate * chord / (2 * Math.Max(speed, 1e-6)), -2, 2);
        double coefficient = tail.CmAlpha * alpha + tail.CmQ * rate
            + tail.CmDeltaElevator * tail.MaxElevatorDeflectionRad * Math.Clamp(elevator, -1, 1);
        return dynamicPressure * area * chord * coefficient;
    }

    public static double YawMoment(double dynamicPressure, double speed, double area,
        double span, double beta, double yawRate, double rudderDeflection,
        in ConventionalTailParameters tail)
    {
        double rate = Math.Clamp(yawRate * span / (2 * Math.Max(speed, 1e-6)), -2, 2);
        return dynamicPressure * area * span * (tail.CnBeta * beta
            + tail.CnR * rate + tail.CnDeltaRudder * rudderDeflection);
    }
}
