namespace GunsOnly.Sim;

/// A kinematic ship — deliberately NOT an aero object. A 55-tonne hull flown through the aircraft
/// model stalls and falls (and the 40 m/s mush floor would fling it forward at 78 kt). So the
/// carrier just steams along the surface at ship speed and carries a straight landing deck; the
/// aircraft lands ON it. Graphics can come later; this is the landable surface.
///
/// Frame: sim world is X=east, Y=up, Z=north; heading chi 0 = +Z (north), like AircraftState.Chi.
public sealed class Carrier {
    public Vec3D Position { get; private set; }   // deck-centre reference at deck height
    public double HeadingRad { get; }
    public double SpeedMps { get; }
    public double DeckAltM { get; }               // deck height above the sea
    public double DeckLengthM { get; }
    public double DeckHalfWidthM { get; }

    public Carrier(Vec3D deckCentre, double headingRad, double speedMps,
                   double deckAltM, double deckLengthM, double deckWidthM) {
        Position = deckCentre; HeadingRad = headingRad; SpeedMps = speedMps;
        DeckAltM = deckAltM; DeckLengthM = deckLengthM; DeckHalfWidthM = deckWidthM * 0.5;
    }

    /// Unit heading vector along the deck (bow direction).
    public Vec3D Fwd => new(System.Math.Sin(HeadingRad), 0, System.Math.Cos(HeadingRad));
    /// Unit vector along the starboard beam (flat, right of heading).
    public Vec3D Right => new(System.Math.Cos(HeadingRad), 0, -System.Math.Sin(HeadingRad));

    public void Step(double dt) { Position += Fwd * (SpeedMps * dt); }

    /// A world point resolved into deck coordinates: metres forward of deck centre (toward the
    /// bow), metres to starboard of centreline, and height above the deck plane.
    public (double along, double cross, double height) DeckFrame(in Vec3D p) {
        var rel = p - Position;
        return (rel.Dot(Fwd), rel.Dot(Right), rel.Y - DeckAltM);
    }

    /// Is this world point within the deck rectangle (any height)?
    public bool WithinDeckFootprint(in Vec3D p) {
        var (along, cross, _) = DeckFrame(p);
        return System.Math.Abs(cross) <= DeckHalfWidthM
            && along >= -DeckLengthM * 0.5 && along <= DeckLengthM * 0.5;
    }

    public enum Recovery { Flying, Trap, RampStrike, InTheWater }

    /// Classify the aircraft against the deck this instant. Trap = touched the deck within its
    /// footprint (a landing). RampStrike = came down onto the ship's aft edge from behind/short.
    /// InTheWater = reached the sea off the deck. Flying = still airborne. First cut: any touchdown
    /// on the footprint is a Trap; wires, bolters and the barrier come with the full beat.
    public Recovery Classify(in AircraftState s) {
        var (along, cross, height) = DeckFrame(s.Position);
        bool overFootprint = System.Math.Abs(cross) <= DeckHalfWidthM
            && along >= -DeckLengthM * 0.5 && along <= DeckLengthM * 0.5;
        if (height <= 0.0) {
            if (overFootprint) return Recovery.Trap;                 // touched the deck
            // Just aft of the ramp and lined up, but short and low = into the round-down.
            if (along < -DeckLengthM * 0.5 && along > -DeckLengthM * 0.5 - 40.0
                && System.Math.Abs(cross) <= DeckHalfWidthM) return Recovery.RampStrike;
        }
        if (s.Position.Y <= 0.0) return Recovery.InTheWater;         // reached the sea
        return Recovery.Flying;
    }
}
