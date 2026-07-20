namespace GunsOnly.Sim.Doctrine;

public enum LsoSeverity { OnBall, Correcting, WaveOff }

public readonly record struct LsoAdvice(string Call, LsoSeverity Severity);

/// Pure paddles evaluator. Thresholds and wording are placeholder-tunable; geometry, lineup and
/// energy are real. Positive glideslope error is low, positive cross is right of centreline, and
/// positive AoA error is slow.
public static class Lso {
    public const string FreeFlightCall = "RETURN ASTERN TO TRAP";
    public const double AoaToleranceRad = 0.015; // ~0.9 degrees either side of configured on-speed.
    const double GlideslopeSlope = 0.06116;   // tan 3.5°

    public static LsoAdvice? AdviseForMode(Carrier carrier, in AircraftState aircraft,
        double angleOfAttackRad, double onSpeedAoARad, bool approachMode, bool waveOff) {
        if (!approachMode && !waveOff) return null;
        return Advise(carrier, aircraft, angleOfAttackRad, onSpeedAoARad, waveOff);
    }

    public static LsoAdvice Advise(Carrier carrier, in AircraftState aircraft,
        double angleOfAttackRad, double onSpeedAoARad, bool waveOff = false) {
        var (along, cross, height) = carrier.LandingFrame(aircraft.Position);
        double range = System.Math.Max(0.0, -carrier.DeckLengthM * 0.2 - along);
        double glideslopeError = range * GlideslopeSlope - height;
        double aoaError = angleOfAttackRad - onSpeedAoARad;
        double sinkRateMps = carrier.DeckSinkRateMps(aircraft);

        double glideslopeTolerance = System.Math.Max(1.5, range * 0.004);
        double lineupTolerance = System.Math.Max(2.5, range * 0.006);
        bool gross = !double.IsFinite(glideslopeError) || !double.IsFinite(cross)
            || !double.IsFinite(aoaError) || along > 30.0 || height < -5.0
            || glideslopeError > System.Math.Max(10.0, range * 0.025)
            || -glideslopeError > System.Math.Max(15.0, range * 0.035)
            || System.Math.Abs(cross) > System.Math.Max(15.0, range * 0.025)
            || aoaError > 0.070 || aoaError < -0.080;
        // A geometric ball call is actively dangerous when the velocity vector is driving through
        // the deck. Close aboard there is no remaining flight path in which to arrest a blown sink;
        // farther out, call the energy error explicitly so the pilot adds power before it becomes a
        // wave-off. This is deck-relative sink, so ship heave cannot manufacture a reassuring call.
        bool unrecoverableSink = sinkRateMps > Carrier.MaxTrapSinkMps && range < 220.0;
        if (waveOff || gross || unrecoverableSink)
            return new("WAVE OFF, WAVE OFF", LsoSeverity.WaveOff);
        if (sinkRateMps > Carrier.HardTrapSinkMps)
            return new("SINK RATE · POWER", LsoSeverity.Correcting);

        bool low = glideslopeError > glideslopeTolerance;
        bool slow = aoaError > AoaToleranceRad;
        if (low && slow) return new("POWER", LsoSeverity.Correcting);

        double verticalScore = System.Math.Abs(glideslopeError) / glideslopeTolerance;
        double lineupScore = System.Math.Abs(cross) / lineupTolerance;
        double energyScore = System.Math.Abs(aoaError) / AoaToleranceRad;
        if (verticalScore <= 1.0 && lineupScore <= 1.0 && energyScore <= 1.0)
            return new("ON THE BALL", LsoSeverity.OnBall);

        if (verticalScore >= lineupScore && verticalScore >= energyScore)
            return new(glideslopeError > 0.0 ? "YOU'RE LOW" : "YOU'RE HIGH", LsoSeverity.Correcting);
        if (energyScore >= lineupScore)
            return new(aoaError > 0.0 ? "POWER" : "FAST", LsoSeverity.Correcting);
        return new(cross > 0.0 ? "COME LEFT" : "COME RIGHT", LsoSeverity.Correcting);
    }
}
