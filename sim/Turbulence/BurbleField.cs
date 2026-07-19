namespace GunsOnly.Sim.Turbulence;

/// The carrier BURBLE — the ship's wake is the tail generator, NOT weather laid over the whole sky.
/// Away from the ship the air is SMOOTH; only inside the wake cone behind the round-down does it get
/// rough (the last several seconds of the approach), plus the coherent velocity deficit/downdraft
/// just behind the round-down: the in-close "hole in the sky" that asks for power before the ramp.
/// This is the IWindField the interface anticipated:
/// "universal texture × placement envelope" — a TurbulenceField supplies the texture, this supplies
/// the ship-anchored envelope and a coherent sink, and everywhere else returns the ambient (usually
/// glassy calm). Anchored to the (moving) Carrier's deck frame, so the burble steams with the ship.
public sealed class BurbleField : IWindField {
    readonly Carrier _ship;
    readonly IWindField _texture;   // the rough-air texture (a multifractal TurbulenceField)
    readonly IWindField? _ambient;  // optional weather laid over the carrier's steady WOD
    readonly double _sinkMps;       // peak round-down downdraft, m/s (positive = downward)

    public BurbleField(Carrier ship, IWindField texture, IWindField? ambient = null, double sinkMps = 3.0) {
        _ship = ship; _texture = texture; _ambient = ambient; _sinkMps = sinkMps;
    }

    public Vec3D Sample(Vec3D worldPos) {
        // WOD is real moving air in FlightModel, not a displayed closure correction. Far from the
        // wake it is perfectly steady; only the ship-anchored texture and sink vary in close. The
        // carrier air-operations field fades well beyond the bow so the later combat beat does not
        // give ownship a private ambient wind which the independently simulated bandit cannot see.
        var w = _ship.SteadyWindWorld * WindOverDeckStrength(worldPos)
            + (_ambient?.Sample(worldPos) ?? Vec3D.Zero);
        var (along, cross, height) = _ship.LandingFrame(worldPos);
        double env = Envelope(along, cross, height);
        if (env <= 0.0) return w;                              // smooth air outside the wake
        double inClose = InCloseStrength(along, cross, height);
        // The coherent deficit dominates at the ramp. Letting the full 3-4 m/s multifractal field
        // stack on top there produced random 9 m/s sink cliffs; shield 60% of that small-scale chop
        // at the centre of the hole while retaining the wing-rock/roughness around it.
        double textureGain = env * (1.0 - 0.60 * inClose);
        w += _texture.Sample(worldPos) * textureGain;
        // A mild wake sink builds first, then the round-down deficit peaks just aft of the ramp.
        // Peak = 1.25 * configured sink (2.25 m/s on the calm pass): noticeable against the normal
        // ~3.3 m/s approach sink, but recoverable with a timely power correction and engine spool.
        double sink = _sinkMps * (0.20 * env + 1.05 * inClose);
        w += new Vec3D(0.0, -sink, 0.0);
        return w;
    }

    public double WindOverDeckStrength(Vec3D worldPos) {
        var (along, cross, _) = _ship.LandingFrame(worldPos);
        double axial = along <= 150.0 ? 1.0
            : along < 700.0 ? (700.0 - along) / 550.0
            : 0.0;
        double lateralDistance = System.Math.Max(0.0, System.Math.Abs(cross) - 300.0);
        double lateral = Clamp01(1.0 - lateralDistance / 1200.0);
        return Clamp01(axial) * lateral;
    }

    /// 0..1 telemetry/control cue for the coherent in-close sink, excluding steady WOD and texture.
    public double InCloseStrength(Vec3D worldPos) {
        var (along, cross, height) = _ship.LandingFrame(worldPos);
        return InCloseStrength(along, cross, height);
    }

    double InCloseStrength(double along, double cross, double height) {
        double lateral = Clamp01(1.0 - System.Math.Abs(cross) / (_ship.DeckHalfWidthM * 2.4));
        double vertical = Clamp01(1.0 - System.Math.Abs(height) / 55.0);
        return Bump(along, -185.0, 145.0) * lateral * vertical;
    }

    /// 0..1 ship-anchored wake envelope. Rough from ~500 m astern through just past the bow, near
    /// the centreline, within a band around the deck plane; zero elsewhere (smooth air). `along` is
    /// metres forward of deck centre (negative = astern), `cross` starboard, `height` above the deck.
    double Envelope(double along, double cross, double height) {
        double axial = along < -500.0 ? 0.0
                     : along < -300.0 ? (along + 500.0) / 200.0        // first wake cues ~8 s out
                     : along <   50.0 ? 1.0                            // full through in-close/deck
                     : along <  150.0 ? (150.0 - along) / 100.0        // fade out past the bow
                     : 0.0;
        double lateral = Clamp01(1.0 - System.Math.Abs(cross) / (_ship.DeckHalfWidthM * 3.0));
        double vert = Clamp01(1.0 - System.Math.Abs(height) / 65.0);
        return Clamp01(axial) * lateral * vert;
    }

    static double Bump(double x, double centre, double halfWidth) {
        double d = (x - centre) / halfWidth;
        return System.Math.Max(0.0, 1.0 - d * d);
    }
    static double Clamp01(double v) => v < 0.0 ? 0.0 : v > 1.0 ? 1.0 : v;
}
