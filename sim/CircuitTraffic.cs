namespace GunsOnly.Sim;

public enum CircuitTrafficRole {
    EarlyStudent = 0,
    AdvancedStudent = 1,
    Instructor = 2,
}

public enum CircuitTrafficIntent {
    FlyPattern = 0,
    Configure = 1,
    Recover = 2,
}

/// <summary>
/// One observable training-pattern aircraft. Position remains kinematic, but operational state
/// belongs to a stable pilot profile so radio and sequencing can react to what that pilot is
/// actually doing instead of treating every hull as interchangeable scenery.
/// </summary>
public readonly record struct CircuitTrafficShip(
    bool Present,
    string Callsign,
    string Leg,
    double X,
    double Y,
    double Z,
    double Chi,
    CircuitTrafficRole Role = CircuitTrafficRole.AdvancedStudent,
    CircuitTrafficIntent Intent = CircuitTrafficIntent.FlyPattern,
    bool GearDownAndLocked = true,
    long CircuitNumber = 0,
    double RadioReactionSeconds = 0.0);

public static class CircuitPatternTraffic {
    /// <summary>Match RapierMission Circuits shelf — 2,500 ft AGL.</summary>
    const double PatternAltAglM = 2_500.0 * 0.3048;
    const double DownwindOffsetM = 1.40 * 1852.0;
    const double FinalAlongM = 3.00 * 1852.0;

    readonly record struct PatternNode(Vec3D Position, string OutboundLeg, double SpeedMps);

    readonly record struct AgentProfile(
        CircuitTrafficRole Role,
        double RadioReactionSeconds,
        int LateGearEveryCircuits,
        int LateGearCircuitOffset,
        double LateGearBaseProgress) {
        public bool DelaysGear(long circuitNumber) =>
            LateGearEveryCircuits > 0
            && PositiveModulo(circuitNumber - LateGearCircuitOffset,
                LateGearEveryCircuits) == 0;
    }

    // Character lives in judgment and timing, not extra words. Twelve is still learning and
    // occasionally finishes the gear cycle late on base; Thirteen is a qualified student with a
    // much smaller deterministic lapse; Fourteen is the quiet airborne reference.
    static readonly AgentProfile[] Profiles = [
        new(CircuitTrafficRole.EarlyStudent, 0.55, 3, 0, 0.34),
        new(CircuitTrafficRole.AdvancedStudent, 0.24, 7, 1, 0.12),
        new(CircuitTrafficRole.Instructor, 0.32, 0, 0, 0.0),
    ];

    public static CircuitTrafficShip[] Evaluate(
        double timeSeconds,
        in Vec3D home,
        in Vec3D recoveryInitial,
        int count = 3) {
        Vec3D runwayForwardRaw = new(
            home.X - recoveryInitial.X, 0.0,
            home.Z - recoveryInitial.Z);
        Vec3D runwayForward = runwayForwardRaw.Length > 1.0
            ? runwayForwardRaw.Normalized() : new Vec3D(0.0, 0.0, 1.0);
        Vec3D runwayLeftRaw = new(-runwayForward.Z, 0.0, runwayForward.X);
        Vec3D runwayLeft = runwayLeftRaw.Length > 1e-6
            ? runwayLeftRaw.Normalized() : new Vec3D(1.0, 0.0, 0.0);

        Vec3D threshold = home - runwayForward * 240.0;
        double patternY = home.Y + PatternAltAglM;
        double finalStartAltM = home.Y + FinalAlongM * Carrier.GlideslopeSlope;
        double baseAlongM = FinalAlongM + 4_000.0;
        double downwindTurnAlongM = FinalAlongM + 7_000.0;

        Vec3D At(double alongM, double leftM, double altitudeM) =>
            threshold + runwayForward * alongM + runwayLeft * leftM
            + new Vec3D(0.0, altitudeM - threshold.Y, 0.0);

        // One complete touch-and-go circuit. Closely spaced nodes through the final and departure
        // keep the periodic spline from cutting the threshold, while the broad downwind mirrors
        // the gates flown by RapierMissionDirector.
        PatternNode[] nodes = [
            new(At(20.0, 0.0, home.Y + 8.0), "DEPART", 112.0),
            new(At(2_500.0, 0.0, home.Y + 480.0), "DEPART", 118.0),
            new(At(3_500.0, DownwindOffsetM * 0.55, patternY), "CROSSWIND", 116.0),
            new(At(2_500.0, DownwindOffsetM, patternY), "DOWNWIND", 112.0),
            new(At(-1_000.0, DownwindOffsetM, patternY), "DOWNWIND", 106.0),
            new(At(-downwindTurnAlongM, DownwindOffsetM, patternY), "BASE", 98.0),
            new(At(-downwindTurnAlongM - 1_000.0, DownwindOffsetM - 1_000.0,
                home.Y + PatternAltAglM * 0.94), "BASE", 94.0),
            new(At(-downwindTurnAlongM - 1_000.0, 1_000.0,
                home.Y + PatternAltAglM * 0.86), "BASE", 91.0),
            new(At(-downwindTurnAlongM, 0.0,
                home.Y + PatternAltAglM * 0.72), "SHORT_FINAL", 88.0),
            new(At(-baseAlongM, 0.0,
                home.Y + FinalAlongM * Carrier.GlideslopeSlope + 40.0), "SHORT_FINAL", 87.0),
            new(At(-FinalAlongM, 0.0, finalStartAltM), "SHORT_FINAL", 82.0),
            new(At(-1_500.0, 0.0,
                home.Y + 1_500.0 * Carrier.GlideslopeSlope), "WIRE_FINAL", 78.0)
        ];

        double[] durations = new double[nodes.Length];
        double lapSeconds = 0.0;
        for (int i = 0; i < nodes.Length; i++) {
            int next = (i + 1) % nodes.Length;
            double distanceM = HorizontalDistance(nodes[i].Position, nodes[next].Position);
            durations[i] = Math.Max(4.0, distanceM / nodes[i].SpeedMps);
            lapSeconds += durations[i];
        }

        int n = Math.Clamp(count, 0, 3);
        var ships = new CircuitTrafficShip[n];
        for (int i = 0; i < n; i++) {
            AgentProfile profile = Profiles[i];
            double unwrappedPhaseSeconds =
                timeSeconds + lapSeconds * (i + 1) / (n + 1.0);
            long circuitNumber = (long)Math.Floor(unwrappedPhaseSeconds / lapSeconds);
            double phaseSeconds = PositiveModulo(unwrappedPhaseSeconds, lapSeconds);
            int segment = 0;
            while (segment < durations.Length - 1
                && phaseSeconds >= durations[segment]) {
                phaseSeconds -= durations[segment];
                segment++;
            }

            double u = Math.Clamp(phaseSeconds / durations[segment], 0.0, 1.0);
            Vec3D position = Interpolate(nodes, durations, segment, u);
            Vec3D tangent = HorizontalTangent(nodes, durations, segment, u);
            if (tangent.X * tangent.X + tangent.Z * tangent.Z < 1e-8) {
                int next = (segment + 1) % nodes.Length;
                tangent = nodes[next].Position - nodes[segment].Position;
            }

            string leg = nodes[segment].OutboundLeg;
            bool onBase = leg == "BASE";
            bool onFinal = leg is "SHORT_FINAL" or "WIRE_FINAL";
            double baseProgress = onBase
                ? ContiguousLegProgress(nodes, durations, segment, phaseSeconds, "BASE")
                : 0.0;
            bool gearDownAndLocked = onFinal
                || onBase && (!profile.DelaysGear(circuitNumber)
                    || baseProgress >= profile.LateGearBaseProgress);
            CircuitTrafficIntent intent = onBase && !gearDownAndLocked
                ? CircuitTrafficIntent.Configure
                : onBase || onFinal
                    ? CircuitTrafficIntent.Recover
                    : CircuitTrafficIntent.FlyPattern;

            ships[i] = new CircuitTrafficShip(
                Present: true,
                Callsign: $"RAPIER {i + 2}",
                Leg: leg,
                X: position.X,
                Y: position.Y,
                Z: position.Z,
                Chi: Math.Atan2(tangent.X, tangent.Z),
                Role: profile.Role,
                Intent: intent,
                GearDownAndLocked: gearDownAndLocked,
                CircuitNumber: circuitNumber,
                RadioReactionSeconds: profile.RadioReactionSeconds);
        }
        return ships;
    }

    static Vec3D Interpolate(
        PatternNode[] nodes,
        double[] durations,
        int segment,
        double u) {
        int count = nodes.Length;
        int previous = (segment - 1 + count) % count;
        int next = (segment + 1) % count;
        int afterNext = (segment + 2) % count;
        double duration = durations[segment];

        // Non-uniform periodic Catmull-Rom expressed as cubic Hermite. Tangents are horizontal;
        // altitude uses monotonic smoothstep so the final cannot overshoot below the runway.
        Vec3D startTangent = Horizontal(nodes[next].Position - nodes[previous].Position)
            * (1.0 / (durations[previous] + duration));
        Vec3D endTangent = Horizontal(nodes[afterNext].Position - nodes[segment].Position)
            * (1.0 / (duration + durations[next]));
        double u2 = u * u;
        double u3 = u2 * u;
        double h00 = 2.0 * u3 - 3.0 * u2 + 1.0;
        double h10 = u3 - 2.0 * u2 + u;
        double h01 = -2.0 * u3 + 3.0 * u2;
        double h11 = u3 - u2;
        Vec3D horizontal = nodes[segment].Position * h00
            + startTangent * (duration * h10)
            + nodes[next].Position * h01
            + endTangent * (duration * h11);
        double smooth = u2 * (3.0 - 2.0 * u);
        double altitude = nodes[segment].Position.Y
            + (nodes[next].Position.Y - nodes[segment].Position.Y) * smooth;
        return new Vec3D(horizontal.X, altitude, horizontal.Z);
    }

    static Vec3D HorizontalTangent(
        PatternNode[] nodes,
        double[] durations,
        int segment,
        double u) {
        int count = nodes.Length;
        int previous = (segment - 1 + count) % count;
        int next = (segment + 1) % count;
        int afterNext = (segment + 2) % count;
        double duration = durations[segment];
        Vec3D startTangent = Horizontal(nodes[next].Position - nodes[previous].Position)
            * (1.0 / (durations[previous] + duration));
        Vec3D endTangent = Horizontal(nodes[afterNext].Position - nodes[segment].Position)
            * (1.0 / (duration + durations[next]));
        double u2 = u * u;
        return nodes[segment].Position * (6.0 * u2 - 6.0 * u)
            + startTangent * (duration * (3.0 * u2 - 4.0 * u + 1.0))
            + nodes[next].Position * (-6.0 * u2 + 6.0 * u)
            + endTangent * (duration * (3.0 * u2 - 2.0 * u));
    }

    static Vec3D Horizontal(in Vec3D vector) => new(vector.X, 0.0, vector.Z);

    static double HorizontalDistance(in Vec3D a, in Vec3D b) {
        double dx = b.X - a.X;
        double dz = b.Z - a.Z;
        return Math.Sqrt(dx * dx + dz * dz);
    }

    static double ContiguousLegProgress(
        PatternNode[] nodes,
        double[] durations,
        int segment,
        double secondsIntoSegment,
        string leg) {
        int first = segment;
        while (first > 0 && nodes[first - 1].OutboundLeg == leg)
            first--;
        int afterLast = segment + 1;
        while (afterLast < nodes.Length && nodes[afterLast].OutboundLeg == leg)
            afterLast++;

        double elapsed = Math.Clamp(secondsIntoSegment, 0.0, durations[segment]);
        for (int index = first; index < segment; index++)
            elapsed += durations[index];
        double total = 0.0;
        for (int index = first; index < afterLast; index++)
            total += durations[index];
        return total > 1e-6 ? Math.Clamp(elapsed / total, 0.0, 1.0) : 1.0;
    }

    static double PositiveModulo(double value, double modulus) {
        double result = value % modulus;
        return result < 0.0 ? result + modulus : result;
    }

    static long PositiveModulo(long value, int modulus) {
        long result = value % modulus;
        return result < 0 ? result + modulus : result;
    }
}
