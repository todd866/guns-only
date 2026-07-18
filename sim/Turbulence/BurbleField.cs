namespace GunsOnly.Sim.Turbulence;

/// The carrier BURBLE — the ship's wake is the tail generator, NOT weather laid over the whole sky.
/// Away from the ship the air is SMOOTH; only inside the wake cone behind the round-down does it get
/// rough (the last ~10-15 s of the approach), plus the steady downdraft off the round-down that
/// drops a low/slow approach into the ramp. This is the IWindField the interface anticipated:
/// "universal texture × placement envelope" — a TurbulenceField supplies the texture, this supplies
/// the ship-anchored envelope and a coherent sink, and everywhere else returns the ambient (usually
/// glassy calm). Anchored to the (moving) Carrier's deck frame, so the burble steams with the ship.
public sealed class BurbleField : IWindField {
    readonly Carrier _ship;
    readonly IWindField _texture;   // the rough-air texture (a multifractal TurbulenceField)
    readonly IWindField? _ambient;  // a gentle everywhere-wind (null = smooth, glassy air)
    readonly double _sinkMps;       // peak round-down downdraft, m/s (positive = downward)

    public BurbleField(Carrier ship, IWindField texture, IWindField? ambient = null, double sinkMps = 3.0) {
        _ship = ship; _texture = texture; _ambient = ambient; _sinkMps = sinkMps;
    }

    public Vec3D Sample(Vec3D worldPos) {
        var w = _ambient?.Sample(worldPos) ?? Vec3D.Zero;
        var (along, cross, height) = _ship.DeckFrame(worldPos);
        // Deck contact is resolved to the rendered surface, while the established BUILD 25 wake
        // texture remains at its original deterministic vertical placement for fight-egress parity.
        height -= _ship.DeckAltM;
        double env = Envelope(along, cross, height);
        if (env <= 0.0) return w;                              // smooth air outside the wake
        w += _texture.Sample(worldPos) * env;                 // rough chop, only in the wake
        // Steady round-down downdraft: peaks just aft of the ramp, on the centreline — the sink that
        // drops a low approach into the round-down (why you carry power to the ramp).
        double sink = _sinkMps * env * Bump(along, -150.0, 110.0);
        w += new Vec3D(0.0, -sink, 0.0);
        return w;
    }

    /// 0..1 ship-anchored wake envelope. Rough from ~350 m astern through just past the bow, near
    /// the centreline, within a band around the deck plane; zero elsewhere (smooth air). `along` is
    /// metres forward of deck centre (negative = astern), `cross` starboard, `height` above the deck.
    double Envelope(double along, double cross, double height) {
        double axial = along < -350.0 ? 0.0
                     : along < -150.0 ? (along + 350.0) / 200.0        // ramp in from astern
                     : along <   50.0 ? 1.0                            // full over the wake and deck
                     : along <  150.0 ? (150.0 - along) / 100.0        // fade out past the bow
                     : 0.0;
        double lateral = Clamp01(1.0 - System.Math.Abs(cross) / (_ship.DeckHalfWidthM * 3.0));
        double vert = Clamp01(1.0 - System.Math.Abs(height) / 60.0);   // fades ~60 m above/below the deck
        return Clamp01(axial) * lateral * vert;
    }

    static double Bump(double x, double centre, double halfWidth) {
        double d = (x - centre) / halfWidth;
        return System.Math.Max(0.0, 1.0 - d * d);
    }
    static double Clamp01(double v) => v < 0.0 ? 0.0 : v > 1.0 ? 1.0 : v;
}
