namespace GunsOnly.Sim;

/// A kinematic ship — deliberately NOT an aero object. A 55-tonne hull flown through the aircraft
/// model stalls and falls (and the 40 m/s mush floor would fling it forward at 78 kt). So the
/// carrier just steams along the surface at ship speed and carries the landable deck plus its active
/// axial or angled landing-area frame; the aircraft lands ON it.
///
/// Frame: sim world is X=east, Y=up, Z=north; heading chi 0 = +Z (north), like AircraftState.Chi.
public sealed class Carrier {
    public enum DeckConfiguration { Axial, Angled }

    public enum TouchdownQuality { None, Soft, Nominal, Hard, Blown }
    public enum HookOutcome { None, Engaged, HookSkip, InFlightEngagement, MissedWires }

    public readonly record struct TouchdownResult(
        Recovery Recovery,
        TouchdownQuality Quality,
        HookOutcome Hook,
        int Wire,
        double SinkRateMps,
        double AirspeedMps,
        double ClosureMps,
        double LineupErrorM,
        double WheelAlongM,
        double HookAlongM) {
        public static TouchdownResult Flying => new(
            Recovery.Flying, TouchdownQuality.None, HookOutcome.None, 0,
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    }

    public const double AngledDeckOffsetRad = -9.0 * System.Math.PI / 180.0;
    public const double WireSpacingM = 5.2;
    public const double GlideslopeRad = 3.5 * System.Math.PI / 180.0;
    public const double GlideslopeSlope = 0.061162620150484306; // tan(3.5 deg)
    public const double WindOverDeckKts = 30.0;
    public const double WindOverDeckMps = WindOverDeckKts / 1.94384;

    // Representative early-jet geometry measured along the landing line. The wheel contact plane
    // remains AircraftState.Position for compatibility; the deployed hook point trails it by 6 m.
    // A wire ahead of that hook by <=8 m is caught during the short wheel roll after touchdown.
    public const double HookToMainGearM = 6.0;
    public const double MaxHookSweepAfterTouchdownM = 8.0;
    const double InFlightWireWindowM = 1.25;

    // A 3.5-degree, 70 m/s approach in 30 kt WOD closes at ~54.6 m/s and sinks at ~3.3 m/s.
    // Below 2.35 m/s is a flare/float; 5.2..6.8 m/s is a hard but arrestable arrival; above that
    // is a blown landing. These are deliberately broad enough for a flown pass, not a grading rail.
    public const double MinTrapSinkMps = 2.35;     // 463 ft/min
    public const double HardTrapSinkMps = 5.20;    // 1,024 ft/min
    public const double MaxTrapSinkMps = 6.80;     // 1,339 ft/min
    public const double MaxTrapLineupM = 8.0;
    public const double MinTrapAirspeedMps = 62.0;
    public const double MaxTrapAirspeedMps = 78.0;
    public const double MaxTrapClosureMps = 65.0;
    public const double MaxOnSpeedAoaErrorRad = 0.045; // 2.6 deg either side of the datum

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
    double _deckVerticalVelocityMps;

    public RecoveryDifficulty Difficulty => _difficulty;
    public double DeckHeaveM => Position.Y - _meanDeckCentreY;
    public double DeckPitchRad => _difficulty.Level <= 0 ? 0.0
        : _difficulty.DeckPitchAmplitudeRad * System.Math.Sin(
            2.0 * System.Math.PI * _motionTimeSeconds / _difficulty.DeckPitchPeriodSeconds);
    public double DeckVerticalVelocityMps => _deckVerticalVelocityMps;

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
        _deckVerticalVelocityMps = 0.0;
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

    /// Horizontal deck velocity in the inertial/world frame. Deck heave is reported separately so
    /// touchdown sink can be measured against the surface without injecting it into horizontal WOD.
    public Vec3D DeckVelocityWorld => Fwd * SpeedMps;

    /// Steady world-air velocity which makes the flow over the active landing area exactly 30 kt
    /// down the deck toward the stern: wind - deckVelocity = -LandingFwd * WOD. On an angled deck
    /// this also supplies the small crosswind needed to keep the relative wind on the landing line.
    public Vec3D SteadyWindWorld => DeckVelocityWorld - LandingFwd * WindOverDeckMps;

    public Vec3D AirVelocity(in AircraftState s) => s.VelocityVector() - SteadyWindWorld;
    public double AirspeedMps(in AircraftState s) => AirVelocity(s).Length;
    public Vec3D DeckRelativeVelocity(in AircraftState s) => s.VelocityVector()
        - DeckVelocityWorld - new Vec3D(0.0, DeckVerticalVelocityMps, 0.0);
    public double DeckClosureMps(in AircraftState s) => DeckRelativeVelocity(s).Dot(LandingFwd);
    public double DeckSinkRateMps(in AircraftState s) =>
        System.Math.Max(0.0, -DeckRelativeVelocity(s).Y);

    /// Convert an air-relative spawn/fixture into the inertial state FlightModel integrates. This
    /// is the missing wind triangle: ground velocity = air velocity + wind. Supplying the trimmed
    /// body attitude here also prevents a one-tick false lift transient when AircraftSim first sees
    /// the WOD field.
    public AircraftState ToWorldStateFromAir(in AircraftState airState, double angleOfAttackRad) {
        var airVelocity = airState.VelocityVector();
        var groundVelocity = airVelocity + SteadyWindWorld;
        double speed = groundVelocity.Length;
        var groundDirection = speed < 1e-12 ? airState.ForwardDir() : groundVelocity * (1.0 / speed);
        double gamma = System.Math.Asin(System.Math.Clamp(groundDirection.Y, -1.0, 1.0));
        double chi = System.Math.Atan2(groundDirection.X, groundDirection.Z);

        var airForward = airVelocity.Length < 1e-12 ? airState.ForwardDir() : airVelocity.Normalized();
        var vertical = new Vec3D(0, 1, 0);
        var lift0 = vertical - airForward * vertical.Dot(airForward);
        lift0 = lift0.Length < 1e-9 ? new Vec3D(0, 0, -1) : lift0.Normalized();
        var right0 = lift0.Cross(airForward).Normalized();
        var lift = (lift0 * System.Math.Cos(airState.Bank)
            + right0 * System.Math.Sin(airState.Bank)).Normalized();
        var bodyForward = (airForward * System.Math.Cos(angleOfAttackRad)
            + lift * System.Math.Sin(angleOfAttackRad)).Normalized();
        var bodyUp = (lift * System.Math.Cos(angleOfAttackRad)
            - airForward * System.Math.Sin(angleOfAttackRad)).Normalized();
        var attitude = QuaternionD.FromFrame(bodyUp.Cross(bodyForward).Normalized(), bodyUp, bodyForward);
        return airState with {
            Speed = speed, Gamma = gamma, Chi = chi,
            BodyAttitude = attitude
        };
    }

    public void Step(double dt) {
        // Preserve the original operation itself at baseline, not merely an equivalent result.
        if (_difficulty.Level <= 0) {
            Position += Fwd * (SpeedMps * dt);
            _deckVerticalVelocityMps = 0.0;
            return;
        }

        double previousY = Position.Y;
        Position += Fwd * (SpeedMps * dt);
        _motionTimeSeconds += dt;
        // PLACEHOLDER / TUNABLE sea-state motion: smooth deterministic sinusoids, never
        // Random/wall time. The applied per-attempt difficulty supplies amplitude and period.
        double heave = _difficulty.DeckHeaveAmplitudeM * System.Math.Sin(
            2.0 * System.Math.PI * _motionTimeSeconds / _difficulty.DeckHeavePeriodSeconds);
        Position = new Vec3D(Position.X, _meanDeckCentreY + heave, Position.Z);
        _deckVerticalVelocityMps = dt > 0.0 ? (Position.Y - previousY) / dt : 0.0;
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
        if (AirspeedMps(s) > 95.0) return false;                   // ~185 kt airspeed: maneuvering, not on-speed
        double closure = DeckClosureMps(s);
        if (closure < 20.0 || closure > 85.0) return false;        // not closing the moving landing area
        if (s.Gamma > 0.026) return false;                         // climbing >1.5°: pulling away → snap to fight logic
        double gs = System.Math.Max(0.0, (-along - DeckLengthM * 0.2)) * GlideslopeSlope;
        if (height > gs + 70.0 || height < -25.0) return false;    // above the slope (leaving) or below the deck
        return true;
    }

    public enum Recovery { Flying, Trap, Bolter, HardLanding, RampStrike, InTheWater }

    /// Classify the aircraft against the deck this instant. Trap = touched the deck within its
    /// footprint and hands the contact state to ArrestmentModel. RampStrike = came down onto the
    /// ship's aft edge from behind/short. InTheWater = reached the sea off the deck. Flying = still
    /// airborne. Bolter handling remains outside this contact classifier.
    Recovery ClassifyPhysical(in AircraftState s) {
        var (along, cross, height) = DeckFrame(s.Position);
        // The rounded stern is not a mathematical knife edge: allow the hook/gear footprint two
        // metres past the deck-centre rectangle before calling a ramp strike. This is also the small
        // aft sponson the angled landing area needs where its centreline crosses the round-down.
        const double RoundDownOverhangM = 2.0;
        bool overFootprint = System.Math.Abs(cross) <= DeckHalfWidthM
            && along >= -DeckLengthM * 0.5 - RoundDownOverhangM && along <= DeckLengthM * 0.5;
        if (height <= 0.0) {
            if (overFootprint) return Recovery.Trap;                 // touched the deck; quality follows below
            // Just aft of the ramp and lined up, but short and low = into the round-down.
            if (along < -DeckLengthM * 0.5 - RoundDownOverhangM
                && along > -DeckLengthM * 0.5 - 40.0
                && System.Math.Abs(cross) <= DeckHalfWidthM) return Recovery.RampStrike;
        }
        if (s.Position.Y <= 0.0) return Recovery.InTheWater;         // reached the sea
        return Recovery.Flying;
    }

    /// Resolve the no-flare touchdown, hook geometry and trap window in one deterministic result.
    /// A good wheel contact does not magically catch the nearest wire: the hook trails the main gear,
    /// then sweeps only a short distance before the next pendant. Passing the last wire produces an
    /// in-flight engagement/skip or a clean missed-wires bolter.
    public TouchdownResult EvaluateRecovery(in AircraftState s, double angleOfAttackRad,
        in RecoveryDifficulty difficulty) {
        Recovery physical = ClassifyPhysical(s);
        if (physical != Recovery.Trap) {
            return new TouchdownResult(physical, TouchdownQuality.None, HookOutcome.None, 0,
                DeckSinkRateMps(s), AirspeedMps(s), DeckClosureMps(s),
                LandingFrame(s.Position).cross, 0.0, 0.0);
        }

        var (wheelAlong, cross, _) = LandingFrame(s.Position);
        double hookAlong = wheelAlong - HookToMainGearM;
        double sink = DeckSinkRateMps(s);
        double airspeed = AirspeedMps(s);
        double closure = DeckClosureMps(s);
        double aoaError = angleOfAttackRad - DetentLayer.OnSpeedAoARad;
        TouchdownQuality quality = sink > MaxTrapSinkMps ? TouchdownQuality.Blown
            : sink > HardTrapSinkMps ? TouchdownQuality.Hard
            : sink < 3.15 ? TouchdownQuality.Soft
            : TouchdownQuality.Nominal;

        int wire = 0;
        double sweep = double.PositiveInfinity;
        for (int candidate = 1; candidate <= 4; candidate++) {
            double distanceAhead = WireAlongM(candidate) - hookAlong;
            if (distanceAhead >= 0.0 && distanceAhead < sweep) {
                wire = candidate;
                sweep = distanceAhead;
            }
        }

        if (quality == TouchdownQuality.Blown) {
            return new TouchdownResult(Recovery.HardLanding, quality, HookOutcome.HookSkip, 0,
                sink, airspeed, closure, cross, wheelAlong, hookAlong);
        }

        bool poorApproach = sink < MinTrapSinkMps
            || System.Math.Abs(cross) > MaxTrapLineupM
            || airspeed < MinTrapAirspeedMps || airspeed > MaxTrapAirspeedMps
            || closure > MaxTrapClosureMps
            || System.Math.Abs(aoaError) > MaxOnSpeedAoaErrorRad;
        if (difficulty.Level > 0) {
            poorApproach |= sink > difficulty.MaxTrapSinkMps
                || System.Math.Abs(cross) > difficulty.MaxTrapLineupErrorM
                || airspeed < difficulty.MinTrapSpeedMps
                || airspeed > difficulty.MaxTrapSpeedMps;
        }

        if (wire != 0 && sweep <= MaxHookSweepAfterTouchdownM) {
            HookOutcome hook = poorApproach ? HookOutcome.HookSkip : HookOutcome.Engaged;
            return new TouchdownResult(poorApproach ? Recovery.Bolter : Recovery.Trap,
                quality, hook, poorApproach ? 0 : wire,
                sink, airspeed, closure, cross, wheelAlong, hookAlong);
        }

        double lastWireBehind = hookAlong - WireAlongM(4);
        HookOutcome miss = lastWireBehind >= 0.0 && lastWireBehind <= InFlightWireWindowM
            ? HookOutcome.InFlightEngagement
            : HookOutcome.MissedWires;
        return new TouchdownResult(Recovery.Bolter, quality, miss, 0,
            sink, airspeed, closure, cross, wheelAlong, hookAlong);
    }

    public Recovery Classify(in AircraftState s) =>
        EvaluateRecovery(s, DetentLayer.OnSpeedAoARad, DifficultyModel.ForLevel(0)).Recovery;

    /// The physical no-flare/hook gate applies at every level. Earned levels then narrow its sink,
    /// lineup and on-speed airspeed windows without changing the underlying contact geometry.
    public Recovery Classify(in AircraftState s, in RecoveryDifficulty difficulty) {
        return EvaluateRecovery(s, DetentLayer.OnSpeedAoARad, difficulty).Recovery;
    }

    public Recovery Classify(in AircraftState s, double angleOfAttackRad,
        in RecoveryDifficulty difficulty) => EvaluateRecovery(s, angleOfAttackRad, difficulty).Recovery;
}
