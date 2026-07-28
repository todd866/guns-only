namespace GunsOnly.Sim;

/// <summary>
/// Scripted kinematic pattern traffic for Rapier Circuits. Not dogfight AI — phase-offset ships
/// on the same military overhead so Tab SA and tower calls have real contacts.
/// </summary>
public readonly record struct CircuitTrafficShip(
    bool Present,
    string Callsign,
    string Leg,
    double X,
    double Y,
    double Z,
    double Chi);

public static class CircuitPatternTraffic {
    /// <summary>Match RapierMission Circuits shelf — 2,500 ft AGL.</summary>
    const double PatternAltAglM = 2_500.0 * 0.3048;
    const double DownwindOffsetM = 1.40 * 1852.0;
    const double InitialAlongM = 1.50 * 1852.0;
    const double FinalAlongM = 3.00 * 1852.0;
    /// Compact overhead at ~250 KT / 60° break — about three minutes a lap.
    const double LapSeconds = 180.0;

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
        Vec3D runwayLeft = new(-runwayForward.Z, 0.0, runwayForward.X);
        if (runwayLeft.Length > 1e-6) runwayLeft = runwayLeft.Normalized();
        else runwayLeft = new Vec3D(1.0, 0.0, 0.0);

        Vec3D threshold = home - runwayForward * 240.0;
        double patternY = home.Y + PatternAltAglM;
        double finalStartAltM = home.Y + FinalAlongM * Math.Tan(3.0 * Math.PI / 180.0);
        Vec3D initial = threshold - runwayForward * InitialAlongM
            + new Vec3D(0.0, patternY - threshold.Y, 0.0);
        Vec3D downwindEntry = initial + runwayLeft * DownwindOffsetM;
        Vec3D downwindAbeam = threshold + runwayLeft * DownwindOffsetM
            + new Vec3D(0.0, patternY - threshold.Y, 0.0);
        Vec3D basePoint = threshold - runwayForward * FinalAlongM
            + runwayLeft * (DownwindOffsetM * 0.50)
            + new Vec3D(0.0, finalStartAltM + 40.0 - threshold.Y, 0.0);
        Vec3D shortFinal = threshold - runwayForward * FinalAlongM
            + new Vec3D(0.0, finalStartAltM - threshold.Y, 0.0);

        Vec3D[] path = [initial, downwindEntry, downwindAbeam, basePoint, shortFinal, initial];
        string[] legs = ["INITIAL", "BREAK", "DOWNWIND", "BASE", "SHORT_FINAL", "INITIAL"];
        double runwayChi = Math.Atan2(runwayForward.X, runwayForward.Z);
        double downwindChi = Math.Atan2(-runwayForward.X, -runwayForward.Z);
        double[] chi = [runwayChi, downwindChi, downwindChi, runwayChi, runwayChi, runwayChi];

        int n = Math.Clamp(count, 0, 3);
        var ships = new CircuitTrafficShip[n];
        for (int i = 0; i < n; i++) {
            double phase = (timeSeconds / LapSeconds + (i + 1) / (double)(n + 1)) % 1.0;
            double scaled = phase * (path.Length - 1);
            int seg = Math.Clamp((int)Math.Floor(scaled), 0, path.Length - 2);
            double u = scaled - seg;
            Vec3D a = path[seg];
            Vec3D b = path[seg + 1];
            Vec3D p = new(
                a.X + (b.X - a.X) * u,
                a.Y + (b.Y - a.Y) * u,
                a.Z + (b.Z - a.Z) * u);
            ships[i] = new CircuitTrafficShip(
                Present: true,
                Callsign: $"RAPIER {i + 2}",
                Leg: legs[seg],
                X: p.X,
                Y: p.Y,
                Z: p.Z,
                Chi: chi[seg]);
        }
        return ships;
    }

    public static string CommsLine(
        CircuitTrafficShip[] ships,
        string playerLeg,
        double timeSeconds) {
        if (ships.Length == 0) return "";
        int slot = Math.Abs((int)Math.Floor(timeSeconds / 8.0)) % (ships.Length + 1);
        if (slot == 0) {
            string clear = playerLeg is "SHORT_FINAL" or "WIRE_FINAL"
                ? "CLEARED TOUCH AND GO · NUMBER TWO"
                : playerLeg is "INITIAL" or "BREAK"
                    ? "REPORT DOWNWIND"
                    : playerLeg is "DOWNWIND" or "BASE"
                        ? "REPORT FINAL"
                        : "CONTINUE";
            return $"TOWER · RAPIER 1 · {clear}";
        }
        CircuitTrafficShip ship = ships[slot - 1];
        return $"{ship.Callsign} · {ship.Leg.Replace('_', ' ')}";
    }
}
