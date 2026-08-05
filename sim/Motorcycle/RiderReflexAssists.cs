namespace GunsOnly.Sim.Motorcycle;

/// <summary>
/// Rider neuromuscular reflex assists for pitch balance (wheelie/stoppie) and knee-down lean-hold.
/// Pitch and knee-down use separate state machines and must not share latch logic.
/// </summary>
public readonly record struct RiderReflexSample(
    double WheelieBalance,
    double StoppieBalance,
    double PitchReflexAuthority,
    bool KneeDown,
    double KneeProximity,
    double LeanHoldAuthority);

public static class RiderReflexAssists
{
    public static RiderReflexSample Evaluate(
        double frontNormalN,
        double rearNormalN,
        double pitchRad,
        double pitchRateRadps,
        double leanRad,
        double riderLateral,
        bool previousKneeDown)
    {
        PitchBalanceChannel.Sample pitch = PitchBalanceChannel.Evaluate(
            frontNormalN,
            rearNormalN,
            pitchRad,
            pitchRateRadps);
        bool pitchRegimeHot = pitch.PitchReflexAuthority > 0.0;
        KneeDownLeanHoldChannel.Sample knee = KneeDownLeanHoldChannel.Evaluate(
            leanRad,
            riderLateral,
            previousKneeDown,
            pitchRegimeHot);
        return new RiderReflexSample(
            pitch.WheelieBalance,
            pitch.StoppieBalance,
            pitch.PitchReflexAuthority,
            knee.KneeDown,
            knee.KneeProximity,
            knee.LeanHoldAuthority);
    }

    /// <summary>Pitch/load channel only — wheelie and stoppie balance bands.</summary>
    static class PitchBalanceChannel
    {
        internal readonly record struct Sample(
            double WheelieBalance,
            double StoppieBalance,
            double PitchReflexAuthority);

        const double BalanceContactFraction = 0.06;
        const double FarContactFraction = 0.32;
        // Once a wheel has actually lifted, contact loads freeze at 0/1 and stop carrying
        // information; past this pitch the channel reports full balance/authority directly.
        // Sits above the largest suspension-geometry pitch (~0.05 rad brake dive) so plain
        // grounded braking or squat cannot false-trigger the lifted regime.
        const double LiftedPitchRad = 0.06;

        internal static Sample Evaluate(
            double frontNormalN,
            double rearNormalN,
            double pitchRad,
            double pitchRateRadps)
        {
            _ = pitchRateRadps;
            if (pitchRad >= LiftedPitchRad)
                return new Sample(1.0, -1.0, 1.0);
            if (pitchRad <= -LiftedPitchRad)
                return new Sample(-1.0, 1.0, 1.0);
            double totalNormalN = frontNormalN + rearNormalN;
            if (totalNormalN <= 1e-6)
                return new Sample(-1.0, -1.0, 0.0);

            double frontFraction = frontNormalN / totalNormalN;
            double rearFraction = rearNormalN / totalNormalN;
            double wheelieBalance = MapUnloadBalance(frontFraction);
            double stoppieBalance = MapUnloadBalance(rearFraction);
            double pitchReflexAuthority = Math.Max(
                AuthorityFromBalance(wheelieBalance),
                AuthorityFromBalance(stoppieBalance));
            return new Sample(wheelieBalance, stoppieBalance, pitchReflexAuthority);
        }

        static double MapUnloadBalance(double unloadedFraction)
        {
            if (unloadedFraction >= FarContactFraction)
                return -1.0;
            if (unloadedFraction <= BalanceContactFraction)
                return 1.0;
            double span = FarContactFraction - BalanceContactFraction;
            double proximity = (FarContactFraction - unloadedFraction) / span;
            return -1.0 + 2.0 * proximity;
        }

        static double AuthorityFromBalance(double balance) =>
            balance <= 0.0 ? 0.0 : balance;
    }

    /// <summary>Cornering channel only — lean, weight shift, and knee proximity.</summary>
    static class KneeDownLeanHoldChannel
    {
        internal readonly record struct Sample(
            bool KneeDown,
            double KneeProximity,
            double LeanHoldAuthority);

        const double EnterLeanRad = 0.35;
        const double ExitLeanRad = 0.28;
        const double EnterLateral = 0.45;
        const double ExitLateral = 0.30;
        const double EnterKneeGapM = 0.14;
        const double ExitKneeGapM = 0.22;
        const double LeanHoldPeak = 0.45;

        internal static Sample Evaluate(
            double leanRad,
            double riderLateral,
            bool previousKneeDown,
            bool pitchRegimeHot)
        {
            double absLeanRad = Math.Abs(leanRad);
            double absLateral = Math.Abs(riderLateral);
            bool insideWeightShift = leanRad * riderLateral < -1e-9;
            double kneeGapM = EstimateKneeGapM(absLeanRad, absLateral);
            double kneeProximity = KneeProximityFromGap(kneeGapM);

            if (pitchRegimeHot)
                return new Sample(false, kneeProximity, 0.0);

            bool enter = absLeanRad >= EnterLeanRad
                && absLateral >= EnterLateral
                && insideWeightShift
                && kneeGapM <= EnterKneeGapM;
            bool exit = absLeanRad < ExitLeanRad
                || absLateral < ExitLateral
                || !insideWeightShift
                || kneeGapM > ExitKneeGapM;
            bool kneeDown = previousKneeDown ? !exit : enter;
            double leanHoldAuthority = kneeDown ? LeanHoldPeak * kneeProximity : 0.0;
            return new Sample(kneeDown, kneeProximity, leanHoldAuthority);
        }

        static double EstimateKneeGapM(double absLeanRad, double absLateral)
        {
            double leanFraction = absLeanRad / YzfR1Definition.MaxLeanRad;
            double gapM = YzfR1Definition.GroundClearanceM * (1.0 - 0.80 * leanFraction)
                + 0.22 * (1.0 - absLateral);
            return Math.Max(0.0, gapM);
        }

        static double KneeProximityFromGap(double gapM)
        {
            const double touchGapM = 0.05;
            const double farGapM = 0.34;
            if (gapM <= touchGapM)
                return 1.0;
            if (gapM >= farGapM)
                return 0.0;
            return 1.0 - (gapM - touchGapM) / (farGapM - touchGapM);
        }
    }
}
