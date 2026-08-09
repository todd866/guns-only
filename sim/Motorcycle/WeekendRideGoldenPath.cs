namespace GunsOnly.Sim.Motorcycle;

public readonly record struct WeekendRideGoldenPathCue(string Kind, string Token)
{
    public static WeekendRideGoldenPathCue None => new("none", string.Empty);
}

/// <summary>
/// Renderer-neutral, symbol-led first-success route through Weekend Ride. The cue is derived only
/// from simulation position/progress and the two authoritative road definitions, so Web and Unity
/// never infer different instructions from their own scene graphs.
/// </summary>
public static class WeekendRideGoldenPath
{
    public const double LapAcknowledgementSeconds = 2.4;
    public const double OpenRoadSuccessDistanceM = 600.0;

    public static WeekendRideGoldenPathCue Resolve(
        PaintedCircuit circuit,
        WeekendHinterlandRoadNetwork hinterland,
        in Vec3D positionWorldM,
        double headingRad,
        double speedMps,
        int lapCount,
        double circuitProgressM,
        int nextSectorIndex,
        double lapAcknowledgementRemainingS,
        double openRoadDistanceM,
        bool onOpenRoad)
    {
        ArgumentNullException.ThrowIfNull(circuit);
        ArgumentNullException.ThrowIfNull(hinterland);
        if (!positionWorldM.IsFinite
            || !double.IsFinite(headingRad)
            || !double.IsFinite(speedMps)
            || !double.IsFinite(circuitProgressM)
            || !double.IsFinite(lapAcknowledgementRemainingS)
            || !double.IsFinite(openRoadDistanceM))
        {
            return WeekendRideGoldenPathCue.None;
        }

        if (lapAcknowledgementRemainingS > 0.0)
            return new WeekendRideGoldenPathCue("lap", "✓");

        if (lapCount > 0)
        {
            if (openRoadDistanceM >= OpenRoadSuccessDistanceM)
                return WeekendRideGoldenPathCue.None;
            if (onOpenRoad)
                return new WeekendRideGoldenPathCue("free-ride", "∞");
            return new WeekendRideGoldenPathCue(
                "paddock-exit",
                DirectionToken(positionWorldM, headingRad, hinterland.CircuitAccessPointWorldM));
        }

        if (!circuit.IsOnPavement(positionWorldM))
        {
            return new WeekendRideGoldenPathCue(
                "return-to-circuit",
                DirectionToken(positionWorldM, headingRad, circuit.PaddockAccessPointWorldM));
        }

        if (nextSectorIndex == 0 && circuitProgressM < 90.0 && speedMps < 4.0)
            return new WeekendRideGoldenPathCue("launch", "↑");

        if (nextSectorIndex >= circuit.SectorGateProgressM.Count)
        {
            double finishDistanceM = circuit.CircuitLengthM - circuitProgressM;
            return finishDistanceM is >= 0.0 and <= 180.0
                ? new WeekendRideGoldenPathCue("finish", "◎")
                : WeekendRideGoldenPathCue.None;
        }

        double gateProgressM = circuit.SectorGateProgressM[nextSectorIndex]
            * circuit.CircuitLengthM;
        double remainingM = gateProgressM - circuitProgressM;
        if (remainingM is < 35.0 or > 190.0)
            return WeekendRideGoldenPathCue.None;

        double before = HeadingAtProgress(circuit, gateProgressM - 55.0);
        double after = HeadingAtProgress(circuit, gateProgressM + 55.0);
        double turnRad = Math.Atan2(Math.Sin(after - before), Math.Cos(after - before));
        return new WeekendRideGoldenPathCue("sector", turnRad >= 0.0 ? "↱" : "↰");
    }

    static string DirectionToken(in Vec3D position, double headingRad, in Vec3D target)
    {
        double eastM = target.X - position.X;
        double northM = target.Z - position.Z;
        double lengthM = Math.Sqrt(eastM * eastM + northM * northM);
        if (lengthM <= 1e-6)
            return "↑";
        eastM /= lengthM;
        northM /= lengthM;
        double forward = eastM * Math.Sin(headingRad) + northM * Math.Cos(headingRad);
        double right = eastM * Math.Cos(headingRad) - northM * Math.Sin(headingRad);
        if (forward >= 0.72)
            return Math.Abs(right) < 0.32 ? "↑" : right > 0.0 ? "↗" : "↖";
        return right >= 0.0 ? "↷" : "↶";
    }

    static double HeadingAtProgress(PaintedCircuit circuit, double progressM)
    {
        double wrappedM = ((progressM % circuit.CircuitLengthM) + circuit.CircuitLengthM)
            % circuit.CircuitLengthM;
        IReadOnlyList<Vec3D> points = circuit.Centreline;
        double travelledM = 0.0;
        for (int index = 0; index < points.Count - 1; index++)
        {
            Vec3D start = points[index];
            Vec3D end = points[index + 1];
            double segmentM = WeekendRoad.HorizontalDistance(start, end);
            if (travelledM + segmentM >= wrappedM || index == points.Count - 2)
                return Math.Atan2(end.X - start.X, end.Z - start.Z);
            travelledM += segmentM;
        }
        return circuit.StartHeadingRad;
    }
}
