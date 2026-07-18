namespace GunsOnly.Sim;

/// A kinematic ship — deliberately NOT an aero object. A 55-tonne hull flown through the aircraft
/// model stalls and falls (and the 40 m/s mush floor would fling it forward at 78 kt). So the
/// carrier just steams along the surface at ship speed and carries the landable deck plus its active
/// axial or angled landing-area frame; the aircraft lands ON it.
///
/// Frame: sim world is X=east, Y=up, Z=north; heading chi 0 = +Z (north), like AircraftState.Chi.
public sealed class Carrier {
    public enum DeckConfiguration { Axial, Angled }

    public const double AngledDeckOffsetRad = -9.0 * System.Math.PI / 180.0;
    public const double WireSpacingM = 5.2;

    public Vec3D Position { get; private set; }   // deck-centre reference at deck height
    public double HeadingRad { get; }
    public double SpeedMps { get; }
    public double DeckAltM { get; }               // deck height above the sea
    public double DeckLengthM { get; }
    public double DeckHalfWidthM { get; }
    public DeckConfiguration Configuration { get; }

    readonly double _meanDeckCentreY;
    RecoveryDifficulty _difficulty = DifficultyModel.ForLevel(0);
    double _motionTimeSeconds;

    public RecoveryDifficulty Difficulty => _difficulty;
    public double DeckHeaveM => Position.Y - _meanDeckCentreY;
    public double DeckPitchRad => _difficulty.Level <= 0 ? 0.0
        : _difficulty.DeckPitchAmplitudeRad * System.Math.Sin(
            2.0 * System.Math.PI * _motionTimeSeconds / _difficulty.DeckPitchPeriodSeconds);

    public Carrier(Vec3D deckCentre, double headingRad, double speedMps,
                   double deckAltM, double deckLengthM, double deckWidthM,
                   DeckConfiguration configuration = DeckConfiguration.Axial) {
        Position = deckCentre; HeadingRad = headingRad; SpeedMps = speedMps;
        DeckAltM = deckAltM; DeckLengthM = deckLengthM; DeckHalfWidthM = deckWidthM * 0.5;
        Configuration = configuration;
        _meanDeckCentreY = deckCentre.Y;
    }

    /// Apply the earned level to this attempt. WebBridge calls this on the freshly-created carrier;
    /// resetting phase to zero makes restarts replay-identical for the same level.
    public void ApplyDifficulty(in RecoveryDifficulty difficulty) {
        _difficulty = difficulty;
        _motionTimeSeconds = 0.0;
        Position = new Vec3D(Position.X, _meanDeckCentreY, Position.Z);
    }

    /// The touchdown target (the wire zone): a world point ~20% of the deck aft of centre, on the
    /// deck surface. Fly the VELOCITY VECTOR onto this and you arrive on the wires — it is the
    /// reference the pilot otherwise lacks (the nose points long on the on-speed attitude while the
    /// flight path goes short; without an aim point you can't see which is which until the ramp).
    public double TouchdownAlongM => -DeckLengthM * 0.2;
    public Vec3D TouchdownPoint => _difficulty.Level <= 0
        ? Position + Fwd * TouchdownAlongM
        : DeckPoint(Fwd * TouchdownAlongM);

    /// Ship-axis unit vectors. The hull and its three-knot translation always use these, even when
    /// the landing area is angled.
    public Vec3D Fwd => new(System.Math.Sin(HeadingRad), 0, System.Math.Cos(HeadingRad));
    public Vec3D Right => new(System.Math.Cos(HeadingRad), 0, -System.Math.Sin(HeadingRad));

    /// Active landing-area frame. On an angled deck the approach and rollout point nine degrees to
    /// port of the bow; the touchdown aim point stays in the same useful aft-deck location.
    public double LandingHeadingRad => HeadingRad
        + (Configuration == DeckConfiguration.Angled ? AngledDeckOffsetRad : 0.0);
    public Vec3D LandingFwd => new(System.Math.Sin(LandingHeadingRad), 0, System.Math.Cos(LandingHeadingRad));
    public Vec3D LandingRight => new(System.Math.Cos(LandingHeadingRad), 0, -System.Math.Sin(LandingHeadingRad));
    public Vec3D LandingOrigin => _difficulty.Level <= 0
        ? TouchdownPoint - LandingFwd * TouchdownAlongM
        : DeckPoint((Fwd - LandingFwd) * TouchdownAlongM);

    public void Step(double dt) {
        // Preserve the original operation itself at baseline, not merely an equivalent result.
        if (_difficulty.Level <= 0) {
            Position += Fwd * (SpeedMps * dt);
            return;
        }

        Position += Fwd * (SpeedMps * dt);
        _motionTimeSeconds += dt;
        // PLACEHOLDER sea-state motion: two smooth deterministic sinusoids, never Random/wall time.
        double heave = _difficulty.DeckHeaveAmplitudeM * System.Math.Sin(
            2.0 * System.Math.PI * _motionTimeSeconds / _difficulty.DeckHeavePeriodSeconds);
        Position = new Vec3D(Position.X, _meanDeckCentreY + heave, Position.Z);
    }

    /// A world point resolved into deck coordinates: metres forward of deck centre (toward the
    /// bow), metres to starboard of centreline, and height above the deck plane.
    public (double along, double cross, double height) DeckFrame(in Vec3D p) {
        var rel = p - Position;
        if (_difficulty.Level > 0) {
            double pitchedDeckY = rel.Dot(Fwd) * System.Math.Tan(DeckPitchRad);
            return (rel.Dot(Fwd), rel.Dot(Right), rel.Y - pitchedDeckY);
        }
        return (rel.Dot(Fwd), rel.Dot(Right), rel.Y);
    }

    /// Resolve a world point against the ACTIVE landing centreline. `along` retains the historical
    /// convention (wire-three is at -20% deck length), so axial callers remain unchanged.
    public (double along, double cross, double height) LandingFrame(in Vec3D p) {
        var rel = p - LandingOrigin;
        if (_difficulty.Level > 0) {
            var centreRel = p - Position;
            double pitchedDeckY = centreRel.Dot(Fwd) * System.Math.Tan(DeckPitchRad);
            return (rel.Dot(LandingFwd), rel.Dot(LandingRight), centreRel.Y - pitchedDeckY);
        }
        return (rel.Dot(LandingFwd), rel.Dot(LandingRight), rel.Y);
    }

    public Vec3D LandingPoint(double along, double cross = 0.0, double height = 0.0) {
        if (_difficulty.Level <= 0)
            return LandingOrigin + LandingFwd * along + LandingRight * cross + new Vec3D(0, height, 0);

        var originOffset = (Fwd - LandingFwd) * TouchdownAlongM;
        var horizontalOffset = originOffset + LandingFwd * along + LandingRight * cross;
        return DeckPoint(horizontalOffset) + new Vec3D(0, height, 0);
    }

    Vec3D DeckPoint(in Vec3D horizontalOffset) => Position + horizontalOffset
        + new Vec3D(0, horizontalOffset.Dot(Fwd) * System.Math.Tan(DeckPitchRad), 0);

    /// Wire numbers run aft-to-forward. The visual aim point is deliberately wire three.
    public double WireAlongM(int wire) {
        if (wire < 1 || wire > 4) throw new System.ArgumentOutOfRangeException(nameof(wire));
        return TouchdownAlongM + (wire - 3) * WireSpacingM;
    }

    public int CaughtWire(in Vec3D contactPoint) {
        var (along, _, _) = LandingFrame(contactPoint);
        int nearest = 1;
        double nearestDistance = System.Math.Abs(along - WireAlongM(1));
        for (int wire = 2; wire <= 4; wire++) {
            double distance = System.Math.Abs(along - WireAlongM(wire));
            if (distance < nearestDistance) { nearest = wire; nearestDistance = distance; }
        }
        return nearest;
    }

    /// Is this world point within the deck rectangle (any height)?
    public bool WithinDeckFootprint(in Vec3D p) {
        var (along, cross, _) = DeckFrame(p);
        return System.Math.Abs(cross) <= DeckHalfWidthM
            && along >= -DeckLengthM * 0.5 && along <= DeckLengthM * 0.5;
    }

    /// Is the aircraft in the approach SLOT (the groove) — astern of the deck, lined up on the
    /// centreline, near the glideslope, at approach energy and not climbing away? The APPROACH
    /// control law engages ONLY here; the moment you leave the slot (pull up into a climb, accelerate,
    /// slide off line, or pass the deck) the detent hands you full FIGHT-logic authority, so a
    /// wave-off / break-away "cleans up into fight logic" instead of fighting the limited approach law.
    public bool InApproachSlot(in AircraftState s) {
        var (along, cross, height) = LandingFrame(s.Position);
        if (along > 30.0 || along < -3000.0) return false;         // past the deck, or too far out
        if (System.Math.Abs(cross) > 220.0) return false;          // not lined up on the centreline
        if (s.Speed > 95.0) return false;                          // ~185 kt: maneuvering, not on-speed
        if (s.Gamma > 0.026) return false;                         // climbing >1.5°: pulling away → snap to fight logic
        double gs = System.Math.Max(0.0, (-along - DeckLengthM * 0.2)) * 0.061;  // glideslope height above deck
        if (height > gs + 70.0 || height < -25.0) return false;    // above the slope (leaving) or below the deck
        return true;
    }

    public enum Recovery { Flying, Trap, Bolter, RampStrike, InTheWater }

    /// Classify the aircraft against the deck this instant. Trap = touched the deck within its
    /// footprint and hands the contact state to ArrestmentModel. RampStrike = came down onto the
    /// ship's aft edge from behind/short. InTheWater = reached the sea off the deck. Flying = still
    /// airborne. Bolter handling remains outside this contact classifier.
    public Recovery Classify(in AircraftState s) {
        var (along, cross, height) = DeckFrame(s.Position);
        // The rounded stern is not a mathematical knife edge: allow the hook/gear footprint two
        // metres past the deck-centre rectangle before calling a ramp strike. This is also the small
        // aft sponson the angled landing area needs where its centreline crosses the round-down.
        const double RoundDownOverhangM = 2.0;
        bool overFootprint = System.Math.Abs(cross) <= DeckHalfWidthM
            && along >= -DeckLengthM * 0.5 - RoundDownOverhangM && along <= DeckLengthM * 0.5;
        if (height <= 0.0) {
            if (overFootprint) return Recovery.Trap;                 // touched the deck
            // Just aft of the ramp and lined up, but short and low = into the round-down.
            if (along < -DeckLengthM * 0.5 - RoundDownOverhangM
                && along > -DeckLengthM * 0.5 - 40.0
                && System.Math.Abs(cross) <= DeckHalfWidthM) return Recovery.RampStrike;
        }
        if (s.Position.Y <= 0.0) return Recovery.InTheWater;         // reached the sea
        return Recovery.Flying;
    }

    /// Earned levels retain the physical classifier above, then reject a deck contact whose sink,
    /// lineup, or on-speed quality misses the current mastery window. Level zero returns the
    /// original classifier result without evaluating any new gate.
    public Recovery Classify(in AircraftState s, in RecoveryDifficulty difficulty) {
        Recovery physical = Classify(s);
        if (physical != Recovery.Trap || difficulty.Level <= 0) return physical;
        return difficulty.AcceptsTrap(this, s) ? Recovery.Trap : Recovery.Bolter;
    }
}
