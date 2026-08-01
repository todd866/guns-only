using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim;

/// A kinematic ship — deliberately NOT an aero object. A 55-tonne hull flown through the aircraft
/// model stalls and falls (and the 40 m/s mush floor would fling it forward at 78 kt). So the
/// carrier just steams along the surface at ship speed and carries the landable deck plus its active
/// axial or angled landing-area frame; the aircraft lands ON it.
///
/// Frame: sim world is X=east, Y=up, Z=north; heading chi 0 = +Z (north), like AircraftState.Chi.
public sealed class Carrier {
    public enum DeckConfiguration { Axial, Angled }
    public enum PlatformKind { Ship, FixedArrestingStrip }

    public enum TouchdownQuality { None, Soft, Nominal, Hard, Blown }
    public enum TouchdownGrade { None, Ok, Fair, NoGrade, Cut }
    public enum TouchdownCorrection {
        None,
        WaveOffEarlier,
        AddPowerEarlier,
        StabilizeIas,
        EstablishLineupEarlier,
        FlyOnSpeedAoa,
        FlyThroughNoFlare,
        MeetAdaptiveTarget
    }

    [System.Flags]
    public enum TouchdownDeviation {
        None = 0,
        LowSinkRate = 1 << 0,
        HardSinkRate = 1 << 1,
        UnsafeSinkRate = 1 << 2,
        Lineup = 1 << 3,
        Slow = 1 << 4,
        Fast = 1 << 5,
        ExcessiveClosure = 1 << 6,
        HighAoa = 1 << 7,
        LowAoa = 1 << 8,
        OutsideAdaptiveTarget = 1 << 9
    }

    public enum HookOutcome { None, Engaged, HookSkip, InFlightEngagement, MissedWires }
    public enum MissedWireDisposition { Bolter, Barrier }
    public enum SolidCollision { None, FlightDeck, Hull, Island }

    public readonly record struct TouchdownResult(
        Recovery Recovery,
        TouchdownQuality Quality,
        HookOutcome Hook,
        TouchdownGrade Grade,
        TouchdownDeviation Deviations,
        TouchdownCorrection PrimaryCorrection,
        int Wire,
        double SinkRateMps,
        double IndicatedAirspeedMps,
        double ClosureMps,
        double LineupErrorM,
        double WheelAlongM,
        double HookAlongM) {
        public static TouchdownResult Flying => new(
            Recovery.Flying, TouchdownQuality.None, HookOutcome.None,
            TouchdownGrade.None, TouchdownDeviation.None, TouchdownCorrection.None, 0,
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0);

        // Source compatibility for diagnostics written before the IAS contract was explicit.
        public double AirspeedMps => IndicatedAirspeedMps;
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
    // Below 2.35 m/s is a flare/float; 5.2..7.0 m/s is a hard but arrestable arrival; above that
    // is a blown landing. These are deliberately broad enough for a flown pass, not a grading rail.
    public const double MinTrapSinkMps = 2.35;     // 463 ft/min
    public const double HardTrapSinkMps = 5.20;    // 1,024 ft/min
    public const double MaxTrapSinkMps = 7.00;     // 1,378 ft/min
    public const double MaxTrapLineupM = 8.0;
    // These are stable touchdown-grade references, never hook or arresting-gear gates. Adaptive
    // training targets may ask for a narrower band, but cannot make an intercepted wire disappear.
    public const double MinTrapAirspeedMps = 58.0;
    public const double MaxTrapAirspeedMps = 82.0;
    public const double MaxTrapClosureMps = 65.0;
    public const double MaxOnSpeedAoaErrorRad = 0.045; // 2.6 deg either side of the datum
    // Versioned identity for the provisional touchdown assessment above. Replays export this
    // identity and the actual limits used by the simulation so presentation never grows a second,
    // silently-divergent grading table.
    public const string TouchdownAssessmentProfileId =
        "PROVISIONAL_EARLY_JET_TOUCHDOWN_V1";
    public const int TouchdownAssessmentProfileVersion = 1;

    // The collision proxy follows the rendered Essex-like carrier closely enough to make the
    // physical promise unambiguous: the flight deck, hull and starboard island are solid. The
    // aircraft remains a point at its integrated reference position; swept tests prevent that
    // point tunnelling through a box between fixed 120 Hz samples.
    const double FlightDeckThicknessM = 1.8;
    const double IslandMinAlongM = 8.0;
    const double IslandMaxAlongM = 48.0;
    const double IslandMinCrossM = 6.0;
    const double IslandMaxCrossM = 15.0;
    const double IslandHeightM = 31.0;

    public Vec3D Position { get; private set; }   // deck-centre reference at deck height
    public double HeadingRad { get; }
    public double SpeedMps { get; }
    public double DeckAltM { get; }               // deck height above the sea
    public double DeckLengthM { get; }
    public double DeckHalfWidthM { get; }
    public DeckConfiguration Configuration { get; }
    public PlatformKind Kind { get; }
    public bool IsMaritime => Kind == PlatformKind.Ship;
    /// Vertical distance from AircraftState.Position to the loaded wheel/cradle support plane.
    /// Legacy carriers keep zero; the Rapier fixed strip publishes an explicit provisional value.
    public double AircraftSupportReferenceHeightM { get; }
    /// Height of the launcher rail's support surface above the deck/slab plane.
    public double LaunchRailHeadHeightM { get; }

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
                   DeckConfiguration configuration = DeckConfiguration.Axial,
                   PlatformKind kind = PlatformKind.Ship,
                   double aircraftSupportReferenceHeightM = 0.0,
                   double launchRailHeadHeightM = 0.0) {
        if (!double.IsFinite(aircraftSupportReferenceHeightM)
            || aircraftSupportReferenceHeightM < 0.0)
            throw new System.ArgumentOutOfRangeException(
                nameof(aircraftSupportReferenceHeightM));
        if (!double.IsFinite(launchRailHeadHeightM) || launchRailHeadHeightM < 0.0)
            throw new System.ArgumentOutOfRangeException(nameof(launchRailHeadHeightM));
        Position = deckCentre; HeadingRad = headingRad; SpeedMps = speedMps;
        DeckAltM = deckAltM; DeckLengthM = deckLengthM; DeckHalfWidthM = deckWidthM * 0.5;
        Configuration = configuration;
        Kind = kind;
        AircraftSupportReferenceHeightM = aircraftSupportReferenceHeightM;
        LaunchRailHeadHeightM = launchRailHeadHeightM;
        _meanDeckCentreY = deckCentre.Y;
    }

    /// Apply the earned level to this attempt. SimulationSession calls this on a fresh carrier;
    /// resetting phase to zero makes restarts replay-identical for the same level.
    public void ApplyDifficulty(in RecoveryDifficulty difficulty) {
        // A fixed land installation has no sea-state motion or ship burble. It reuses only the
        // catapult/arresting geometry and always retains the deterministic baseline surface.
        _difficulty = IsMaritime ? difficulty : DifficultyModel.ForLevel(0);
        _motionTimeSeconds = 0.0;
        _deckVerticalVelocityMps = 0.0;
        Position = new Vec3D(Position.X, _meanDeckCentreY, Position.Z);
    }

    /// The physical touchdown target (wire three): a world point ~20% of the deck aft of centre.
    /// This remains separate from ApproachCuePoint because the flown jet has pitch/flight-path lag:
    /// commanding the current velocity vector at the wire itself all the way in steepens the last
    /// seconds of the pass and produces a ramp strike or a blown touchdown.
    /// On a ship, 20% aft of centre, and it IS wire three -- a deck landing has no braking run.
    /// On a strip, 35% aft, which on a 3,048 m strip puts the wheels 457 m in from the threshold
    /// with 1,067 m of aerobrake ahead of the midfield wire. That distance is the point: it takes
    /// the aircraft from a safe 1.3 Vs touchdown to roughly 147 kt at the wire, inside the 159 kt
    /// arrest gate, which it cannot achieve in the air at any realistic recovery weight.
    public double TouchdownAlongM => Kind == PlatformKind.FixedArrestingStrip
        ? -DeckLengthM * 0.35
        : -DeckLengthM * 0.2;
    public Vec3D TouchdownPoint => _difficulty.Level <= 0
        ? Position + Fwd * TouchdownAlongM
        : DeckPoint(Fwd * TouchdownAlongM);

    /// Player-facing velocity-vector reference. The lead is part of the published recovery
    /// geometry, not private autopilot knowledge: it accounts for the approach law's response while
    /// leaving wire and collision geometry at the physical TouchdownPoint. The shorter angled-deck
    /// lead preserves clearance where the landing line crosses the port edge of the axial deck.
    public double ApproachCueLeadM => Configuration == DeckConfiguration.Angled ? 140.0 : 204.0;
    public double ApproachCueAlongM => TouchdownAlongM + ApproachCueLeadM;
    public Vec3D ApproachCuePoint => LandingPoint(ApproachCueAlongM);
    public double ApproachDirectorPitchOffsetRad { get; set; } = DetentLayer.OnSpeedAoARad;

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
    public Vec3D SteadyWindWorld => IsMaritime
        ? DeckVelocityWorld - LandingFwd * WindOverDeckMps
        : Vec3D.Zero;

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

    /// Resolve an aircraft reference point into landing coordinates whose height is measured from
    /// the loaded support/contact plane, not from the body's aerodynamic reference.
    public (double along, double cross, double height) LandingAircraftSupportFrame(in Vec3D p) {
        var frame = LandingFrame(p);
        return (frame.along, frame.cross,
            frame.height - AircraftSupportReferenceHeightM);
    }

    /// Ship-axis equivalent of <see cref="LandingAircraftSupportFrame"/>.
    public (double along, double cross, double height) AircraftSupportFrame(in Vec3D p) {
        var frame = DeckFrame(p);
        return (frame.along, frame.cross,
            frame.height - AircraftSupportReferenceHeightM);
    }

    public Vec3D LandingPoint(double along, double cross = 0.0, double height = 0.0) {
        if (_difficulty.Level <= 0)
            return LandingOrigin + LandingFwd * along + LandingRight * cross + new Vec3D(0, height, 0);

        var originOffset = (Fwd - LandingFwd) * TouchdownAlongM;
        var horizontalOffset = originOffset + LandingFwd * along + LandingRight * cross;
        return DeckPoint(horizontalOffset) + new Vec3D(0, height, 0);
    }

    /// A point in the ship-axis frame rather than the potentially angled landing-area frame.
    public Vec3D ShipPoint(double along, double cross = 0.0, double height = 0.0) =>
        DeckPoint(Fwd * along + Right * cross) + new Vec3D(0, height, 0);

    Vec3D DeckPoint(in Vec3D horizontalOffset) => Position + horizontalOffset
        + new Vec3D(0, horizontalOffset.Dot(Fwd) * System.Math.Tan(DeckPitchRad), 0);

    /// Wire numbers run aft-to-forward. The visual aim point is deliberately wire three.
    /// <summary>
    /// Where the wire array sits along the landing area.
    ///
    /// On a ship this is the touchdown point: the wires are at the round-down because a deck
    /// landing is a controlled crash into them and there is no room for anything else.
    ///
    /// A fixed arresting strip is not a deck. Its recovery is touchdown, aerobrake, THEN engage,
    /// so the array sits at midfield with the braking run in front of it. Wires at the touchdown
    /// point forced the whole arrest to happen at approach speed, and this aircraft cannot fly a
    /// safe approach speed and meet the arrest gate at once: at recovery weight 1.3 Vs is 192 kt
    /// against a 159 kt gate. The braking run is what closes that gap.
    /// </summary>
    public double WireDatumAlongM => Kind == PlatformKind.FixedArrestingStrip
        ? 0.0
        : TouchdownAlongM;

    public double WireAlongM(int wire) {
        if (wire < 1 || wire > 4) throw new System.ArgumentOutOfRangeException(nameof(wire));
        return WireDatumAlongM + (wire - 3) * WireSpacingM;
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

    /// Swept point collision against the rendered ship's solid volumes. A caller must explicitly
    /// exempt a recovery-classified top-deck contact (trap/bolter); every other intersection is an
    /// impact. Coordinates are resolved in the ship frame, so this works for both landing layouts.
    public SolidCollision SweptSolidCollision(in Vec3D previous, in Vec3D current) {
        var a = AircraftSupportFrame(previous);
        var b = AircraftSupportFrame(current);

        if (IsMaritime && SegmentIntersectsBox(
            a.along, a.cross, a.height, b.along, b.cross, b.height,
            IslandMinAlongM, IslandMaxAlongM, IslandMinCrossM, IslandMaxCrossM,
            0.0, IslandHeightM))
            return SolidCollision.Island;

        double halfLength = DeckLengthM * 0.5;
        if (SegmentIntersectsBox(a.along, a.cross, a.height, b.along, b.cross, b.height,
            -halfLength, halfLength, -DeckHalfWidthM, DeckHalfWidthM,
            -FlightDeckThicknessM, 0.0))
            return SolidCollision.FlightDeck;

        // The hull sides taper visually, but the full deck-width prism is intentionally the
        // conservative solid proxy: clipping a sponson or deck edge is still hitting the ship.
        if (IsMaritime && SegmentIntersectsBox(
            a.along, a.cross, a.height, b.along, b.cross, b.height,
            -halfLength, halfLength, -DeckHalfWidthM, DeckHalfWidthM,
            -DeckAltM, -FlightDeckThicknessM))
            return SolidCollision.Hull;

        return SolidCollision.None;
    }

    static bool SegmentIntersectsBox(double aAlong, double aCross, double aHeight,
        double bAlong, double bCross, double bHeight,
        double minAlong, double maxAlong, double minCross, double maxCross,
        double minHeight, double maxHeight) {
        double enter = 0.0, exit = 1.0;
        return ClipAxis(aAlong, bAlong - aAlong, minAlong, maxAlong, ref enter, ref exit)
            && ClipAxis(aCross, bCross - aCross, minCross, maxCross, ref enter, ref exit)
            && ClipAxis(aHeight, bHeight - aHeight, minHeight, maxHeight, ref enter, ref exit);
    }

    static bool ClipAxis(double start, double delta, double min, double max,
        ref double enter, ref double exit) {
        if (System.Math.Abs(delta) < 1e-12) return start >= min && start <= max;
        double t0 = (min - start) / delta;
        double t1 = (max - start) / delta;
        if (t0 > t1) (t0, t1) = (t1, t0);
        enter = System.Math.Max(enter, t0);
        exit = System.Math.Min(exit, t1);
        return enter <= exit;
    }

    /// Put a wheel-contact bolter back above the landing surface with its deck-relative forward
    /// energy intact and a small positive flight path. This stands in for the short gear roll and
    /// rotation that the airborne rigid-body model cannot integrate while resting on a deck.
    public AircraftState BolterFlyawayState(in AircraftState contact) {
        var (along, cross, _) = LandingFrame(contact.Position);
        var relative = DeckRelativeVelocity(contact);
        double forwardMps = System.Math.Max(55.0, relative.Dot(LandingFwd));
        double lateralMps = System.Math.Clamp(relative.Dot(LandingRight), -8.0, 8.0);
        double climbMps = System.Math.Max(5.0, relative.Y);
        var velocity = DeckVelocityWorld + LandingFwd * forwardMps
            + LandingRight * lateralMps + new Vec3D(0.0, climbMps, 0.0);
        return StateFromVelocity(LandingPoint(along, cross,
                height: AircraftSupportReferenceHeightM + 1.5), velocity,
            contact.Mass);
    }

    /// <summary>
    /// Reduced-order end state for an axial-deck aeroplane which missed every pendant and was
    /// stopped by the raised crash barrier.  This is deliberately distinct from
    /// <see cref="BolterFlyawayState"/>: straight-deck recovery doctrine offers no usable flyaway
    /// lane past aircraft parked forward.  Barrier force/injury fidelity is not claimed here; the
    /// kernel seam records the correct operational outcome and a deck-relative stopped state.
    /// </summary>
    public AircraftState BarrierEngagementState(in AircraftState contact) {
        // Keep eighteen metres ahead of the bow for the barrier/net and forward deck park.  The
        // aircraft remains on the moving deck rather than being frozen in world space.
        double barrierAlongM = DeckLengthM * 0.5 - 18.0;
        Vec3D position = LandingPoint(
            barrierAlongM, 0.0, AircraftSupportReferenceHeightM);
        return StateFromVelocity(position, DeckVelocityWorld, contact.Mass,
            contact.BodyAttitude);
    }

    internal static AircraftState StateFromVelocity(in Vec3D position, in Vec3D velocity,
        double mass, QuaternionD attitude = default) {
        double speed = velocity.Length;
        var direction = speed < 1e-12 ? new Vec3D(0.0, 0.0, 1.0) : velocity * (1.0 / speed);
        return new AircraftState(position, speed,
            System.Math.Asin(System.Math.Clamp(direction.Y, -1.0, 1.0)),
            System.Math.Atan2(direction.X, direction.Z), 0.0, mass, attitude);
    }

    /// Is the aircraft in the approach SLOT (the groove) — astern of the deck, lined up on the
    /// centreline, near the glideslope, at approach energy and not climbing away? The APPROACH
    /// control law engages ONLY here; the moment you leave the slot (pull up into a climb, accelerate,
    /// slide off line, or pass the deck) the detent hands you full FIGHT-logic authority, so a
    /// wave-off / break-away "cleans up into fight logic" instead of fighting the limited approach law.
    /// Determine whether the aircraft is in the groove. Callers which own a richer wind field may
    /// supply its authoritative airspeed; omitted/non-finite values preserve the steady-WOD
    /// calculation used by standalone carrier fixtures.
    public bool InApproachSlot(in AircraftState s,
        double indicatedAirspeedMps = double.NaN) {
        var (along, cross, height) = LandingAircraftSupportFrame(s.Position);
        if (along > 30.0 || along < -3000.0) return false;         // past the deck, or too far out
        if (System.Math.Abs(cross) > 220.0) return false;          // not lined up on the centreline
        if (ResolveIndicatedAirspeedMps(s, indicatedAirspeedMps) > 95.0) return false; // ~185 KIAS: maneuvering, not on-speed
        double closure = DeckClosureMps(s);
        if (closure < 20.0 || closure > 85.0) return false;        // not closing the moving landing area
        if (s.Gamma > 0.026) return false;                         // climbing >1.5°: pulling away → snap to fight logic
        double gs = System.Math.Max(0.0, (-along - DeckLengthM * 0.2)) * GlideslopeSlope;
        if (height > gs + 70.0 || height < -25.0) return false;    // above the slope (leaving) or below the deck
        return true;
    }

    public enum Recovery {
        Flying,
        Trap,
        Bolter,
        HardLanding,
        RampStrike,
        InTheWater,
        ArrestmentFailed,
        /// <summary>
        /// On the surface, decelerating, wires still ahead. Produced ONLY by a
        /// <see cref="PlatformKind.FixedArrestingStrip"/> -- a ship has no braking run, so a deck
        /// pass either catches in that instant or goes around, and no ship code path can reach
        /// this value.
        ///
        /// This is the state the Rapier recovery is actually built around: touch down, aerobrake
        /// on the delta, then take the wire at midfield. Without it, a strip landing that had not
        /// yet reached the wires was classified a bolter and flown away in the same tick, so the
        /// braking run could never happen and the arrest had to be won at approach speed.
        /// </summary>
        RollingOut,
        /// <summary>
        /// Missed every wire on an axial carrier and was retained by the raised crash barrier.
        /// Appended to preserve the numeric values of the established recovery outcomes.
        /// </summary>
        BarrierEngagement
    }

    /// Classify the aircraft against the deck this instant. Trap = touched the deck within its
    /// footprint and hands the contact state to ArrestmentModel. RampStrike = came down onto the
    /// ship's aft edge from behind/short. InTheWater = reached the sea off the deck. Flying = still
    /// airborne. Bolter handling remains outside this contact classifier.
    Recovery ClassifyPhysical(in AircraftState s) {
        var (along, cross, height) = AircraftSupportFrame(s.Position);
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

    /// Resolve three deliberately separate questions in one deterministic result: where the hook
    /// crossed the pendants, whether touchdown sink produced structural loss, and how the measured
    /// touchdown compared with the published proficiency window. A grade can never make a
    /// geometrically intercepted wire disappear. Conversely, a captured wire does not erase an
    /// unsafe structural arrival.
    ///
    /// IAS is the grading/crew-display speed. Closure remains deck-relative kinematics. Standalone
    /// fixtures may omit IAS and use a standard-atmosphere conversion of the steady-WOD TAS.
    public TouchdownResult EvaluateRecovery(in AircraftState s, double angleOfAttackRad,
        in RecoveryDifficulty difficulty, double indicatedAirspeedMps = double.NaN,
        double onSpeedAoaRad = DetentLayer.OnSpeedAoARad,
        MissedWireDisposition missedWireDisposition = MissedWireDisposition.Bolter) {
        double measuredIasMps = ResolveIndicatedAirspeedMps(s, indicatedAirspeedMps);
        Recovery physical = ClassifyPhysical(s);
        if (physical != Recovery.Trap) {
            return new TouchdownResult(physical, TouchdownQuality.None, HookOutcome.None,
                TouchdownGrade.None, TouchdownDeviation.None, TouchdownCorrection.None, 0,
                DeckSinkRateMps(s), measuredIasMps, DeckClosureMps(s),
                LandingFrame(s.Position).cross, 0.0, 0.0);
        }

        var (wheelAlong, cross, _) = LandingFrame(s.Position);
        double hookAlong = wheelAlong - HookToMainGearM;
        double sink = DeckSinkRateMps(s);
        double closure = DeckClosureMps(s);
        double aoaError = angleOfAttackRad - onSpeedAoaRad;
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

        TouchdownDeviation deviations = AssessDeviations(sink, cross, measuredIasMps,
            closure, aoaError, difficulty);
        TouchdownGrade grade = GradeTouchdown(quality, deviations);
        TouchdownCorrection correction = PrimaryCorrection(deviations);

        bool captured = wire != 0 && sweep <= MaxHookSweepAfterTouchdownM;
        double lastWireBehind = hookAlong - WireAlongM(4);

        // STRIP ROLLOUT. On a strip the wires are at midfield, so a touchdown in the first third
        // of the runway leaves the hook a kilometre short of them. That is not a bolter -- the
        // aeroplane is on the ground, decelerating, doing exactly what the recovery asks. It was
        // being called a bolter and flown away in the same tick, which is why a ground roll has
        // never been seen in this game and why landing felt impossible: there was no state in
        // which an aircraft was simply ON the runway.
        //
        // A ship can never reach this: its wires are AT the touchdown point, so the hook is never
        // short of them, and the guard on Kind makes that explicit rather than implied.
        bool rollingToTheWires = Kind == PlatformKind.FixedArrestingStrip
            && !captured
            && hookAlong < WireAlongM(1) - MaxHookSweepAfterTouchdownM
            && quality != TouchdownQuality.Blown;
        HookOutcome hook = captured ? HookOutcome.Engaged
            : lastWireBehind >= 0.0 && lastWireBehind <= InFlightWireWindowM
                ? HookOutcome.InFlightEngagement
                : HookOutcome.MissedWires;
        int capturedWire = captured ? wire : 0;

        // Structural response owns the recovery result. Retain the independently-computed hook
        // geometry so the eventual wreck/gear model can distinguish an unarrested impact from an
        // engage-then-fail event instead of rewriting both as a fictional hook skip.
        if (quality == TouchdownQuality.Blown) {
            return new TouchdownResult(Recovery.HardLanding, quality, hook,
                TouchdownGrade.Cut, deviations, correction, capturedWire,
                sink, measuredIasMps, closure, cross, wheelAlong, hookAlong);
        }

        bool barrier = !captured && !rollingToTheWires
            && missedWireDisposition == MissedWireDisposition.Barrier
            && IsMaritime
            && Configuration == DeckConfiguration.Axial
            // The barrier is forward of the pendant array. A wheel settle short of wire one is
            // not evidence that the hook traversed the deck; only a hook genuinely beyond wire
            // four can reach this reduced-order terminal outcome.
            && lastWireBehind > InFlightWireWindowM;
        return new TouchdownResult(
            captured ? Recovery.Trap
                : rollingToTheWires ? Recovery.RollingOut
                : barrier ? Recovery.BarrierEngagement
                : Recovery.Bolter,
            quality, hook, grade, deviations, correction, capturedWire,
            sink, measuredIasMps, closure, cross, wheelAlong, hookAlong);
    }

    public Recovery Classify(in AircraftState s) =>
        EvaluateRecovery(s, DetentLayer.OnSpeedAoARad, DifficultyModel.ForLevel(0)).Recovery;

    /// Compatibility classifier for callers that need only the physical recovery outcome. Detailed
    /// proficiency feedback remains in EvaluateRecovery and never changes contact geometry.
    public Recovery Classify(in AircraftState s, in RecoveryDifficulty difficulty) {
        return EvaluateRecovery(s, DetentLayer.OnSpeedAoARad, difficulty).Recovery;
    }

    public Recovery Classify(in AircraftState s, double angleOfAttackRad,
        in RecoveryDifficulty difficulty) => EvaluateRecovery(s, angleOfAttackRad, difficulty).Recovery;

    static TouchdownDeviation AssessDeviations(double sinkMps, double crossM,
        double indicatedAirspeedMps, double closureMps, double aoaErrorRad,
        in RecoveryDifficulty difficulty) {
        TouchdownDeviation deviations = TouchdownDeviation.None;
        if (sinkMps > MaxTrapSinkMps) deviations |= TouchdownDeviation.UnsafeSinkRate;
        else if (sinkMps > HardTrapSinkMps) deviations |= TouchdownDeviation.HardSinkRate;
        else if (sinkMps < MinTrapSinkMps) deviations |= TouchdownDeviation.LowSinkRate;
        if (System.Math.Abs(crossM) > MaxTrapLineupM)
            deviations |= TouchdownDeviation.Lineup;
        if (indicatedAirspeedMps < MinTrapAirspeedMps)
            deviations |= TouchdownDeviation.Slow;
        else if (indicatedAirspeedMps > MaxTrapAirspeedMps)
            deviations |= TouchdownDeviation.Fast;
        if (closureMps > MaxTrapClosureMps)
            deviations |= TouchdownDeviation.ExcessiveClosure;
        if (aoaErrorRad > MaxOnSpeedAoaErrorRad)
            deviations |= TouchdownDeviation.HighAoa;
        else if (aoaErrorRad < -MaxOnSpeedAoaErrorRad)
            deviations |= TouchdownDeviation.LowAoa;

        if (difficulty.Level > 0 && (sinkMps > difficulty.MaxTrapSinkMps
            || System.Math.Abs(crossM) > difficulty.MaxTrapLineupErrorM
            || indicatedAirspeedMps < difficulty.MinTrapSpeedMps
            || indicatedAirspeedMps > difficulty.MaxTrapSpeedMps))
            deviations |= TouchdownDeviation.OutsideAdaptiveTarget;
        return deviations;
    }

    static TouchdownGrade GradeTouchdown(TouchdownQuality quality,
        TouchdownDeviation deviations) {
        if (quality == TouchdownQuality.Blown) return TouchdownGrade.Cut;
        const TouchdownDeviation noGrade = TouchdownDeviation.LowSinkRate
            | TouchdownDeviation.HardSinkRate | TouchdownDeviation.Lineup
            | TouchdownDeviation.Slow | TouchdownDeviation.Fast
            | TouchdownDeviation.ExcessiveClosure | TouchdownDeviation.HighAoa
            | TouchdownDeviation.LowAoa;
        if ((deviations & noGrade) != 0) return TouchdownGrade.NoGrade;
        return quality == TouchdownQuality.Nominal
            ? TouchdownGrade.Ok : TouchdownGrade.Fair;
    }

    /// Debrief one thing at a time. The ordering is safety first, then the earliest upstream
    /// correction most likely to prevent several downstream deviations on the next pass.
    static TouchdownCorrection PrimaryCorrection(TouchdownDeviation deviations) {
        if (deviations.HasFlag(TouchdownDeviation.UnsafeSinkRate))
            return TouchdownCorrection.WaveOffEarlier;
        if (deviations.HasFlag(TouchdownDeviation.HardSinkRate))
            return TouchdownCorrection.AddPowerEarlier;
        if ((deviations & (TouchdownDeviation.Slow | TouchdownDeviation.Fast
            | TouchdownDeviation.ExcessiveClosure)) != 0)
            return TouchdownCorrection.StabilizeIas;
        if (deviations.HasFlag(TouchdownDeviation.Lineup))
            return TouchdownCorrection.EstablishLineupEarlier;
        if ((deviations & (TouchdownDeviation.HighAoa | TouchdownDeviation.LowAoa)) != 0)
            return TouchdownCorrection.FlyOnSpeedAoa;
        if (deviations.HasFlag(TouchdownDeviation.LowSinkRate))
            return TouchdownCorrection.FlyThroughNoFlare;
        if (deviations.HasFlag(TouchdownDeviation.OutsideAdaptiveTarget))
            return TouchdownCorrection.MeetAdaptiveTarget;
        return TouchdownCorrection.None;
    }

    double ResolveIndicatedAirspeedMps(in AircraftState state,
        double explicitIndicatedAirspeedMps) =>
        double.IsFinite(explicitIndicatedAirspeedMps) && explicitIndicatedAirspeedMps >= 0.0
            ? explicitIndicatedAirspeedMps
            : AirData.IndicatedAirspeedMps(AirspeedMps(state), state.Position.Y);
}

/// Deterministic deck-relative catapult stroke used after a completed arrestment. The carrier
/// translates beneath the aircraft throughout; at the end of the stroke the state is already
/// above the bow with positive climb and enough airspeed for AircraftSim to take over immediately.
public readonly record struct LaunchTerrainClearanceAssessment(
    bool TerrainAvailable,
    bool Safe,
    double MinimumRailClearanceM,
    double MinimumReleaseClearanceM,
    int Samples,
    string Reason) {
    public static LaunchTerrainClearanceAssessment Unavailable => new(
        false, false, double.NaN, double.NaN, 0, "terrain-unavailable");
}

public sealed class CatapultLaunchModel {
    public enum LaunchPhase { None, Hold, Stroke, Airborne }

    /// Default deck-catapult geometry. A land-based electromagnetic launcher for a high-wing-loading
    /// aircraft needs a longer stroke and a higher end speed than a 1950s deck catapult — 62 m/s is
    /// below flying speed at 400 kg/m2, so an aircraft launched on the default would sink off the
    /// bow. Both are per-instance so a beat can declare the launcher it actually has.
    public const double StrokeDistanceM = 75.0;
    public const double EndDeckRelativeSpeedMps = 62.0;

    readonly double _strokeDistanceM;
    readonly double _endRelativeSpeedMps;
    readonly double _rampAngleRad;
    /// Lateral offset of the launch track from the recovery centreline.
    ///
    /// A carrier shares one deck between catapult and arrestment because it has no room not to. A
    /// dispersed land site has all the room in the world, and MUST use it: the launch gallery is an
    /// eight-metre roofed structure under a ten-metre berm, so leaving it on the recovery
    /// centreline puts a mound in the touchdown zone and an aircraft on short final flies into it.
    readonly double _crossOffsetM = CatapultCrossM;

    public CatapultLaunchModel(double strokeDistanceM = StrokeDistanceM,
        double endRelativeSpeedMps = EndDeckRelativeSpeedMps,
        double rampAngleRad = 0.0,
        double crossOffsetM = CatapultCrossM) {
        if (!double.IsFinite(strokeDistanceM) || strokeDistanceM <= 0.0)
            throw new System.ArgumentOutOfRangeException(nameof(strokeDistanceM));
        if (!double.IsFinite(endRelativeSpeedMps) || endRelativeSpeedMps <= 0.0)
            throw new System.ArgumentOutOfRangeException(nameof(endRelativeSpeedMps));
        if (!double.IsFinite(rampAngleRad) || rampAngleRad < 0.0
            || rampAngleRad > 30.0 * System.Math.PI / 180.0)
            throw new System.ArgumentOutOfRangeException(nameof(rampAngleRad));
        _strokeDistanceM = strokeDistanceM;
        _endRelativeSpeedMps = endRelativeSpeedMps;
        _rampAngleRad = rampAngleRad;
        if (!double.IsFinite(crossOffsetM))
            throw new System.ArgumentOutOfRangeException(nameof(crossOffsetM));
        _crossOffsetM = crossOffsetM;
    }

    public double CrossOffsetM => _crossOffsetM;

    /// Upward ramp angle at the end of the stroke. A flat deck shot is zero; a land installation
    /// can afford to build a hill, and a ski jump is why STOBAR carriers launch heavy aircraft off
    /// short decks at all — it converts some of the stroke into a ballistic arc, buying seconds of
    /// climb while the aircraft accelerates to flying speed instead of settling toward the ground.
    public double RampAngleRad => _rampAngleRad;

    public double StrokeM => _strokeDistanceM;
    public double EndSpeedMps => _endRelativeSpeedMps;
    /// Constant-acceleration stroke, so the energy delivered is 0.5 m v^2 and the g-load is fixed by
    /// the geometry rather than by the aircraft.
    double AccelerationForStroke =>
        _endRelativeSpeedMps * _endRelativeSpeedMps / (2.0 * _strokeDistanceM);
    public const double StartAlongM = 20.0;
    /// Deck default: a catapult track seven metres off the ship's centreline. A LAND site is not
    /// a deck and must not reuse this — see _crossOffsetM.
    public const double CatapultCrossM = -7.0;
    public const double AirborneHeightM = 4.0;
    public const double LaunchClimbMps = 6.0;
    const double ParkedNosePitchRad = 0.8 * System.Math.PI / 180.0;
    const double LaunchNosePitchRad = 9.0 * System.Math.PI / 180.0;


    double _massKg;
    double _distanceM;

    public LaunchPhase Phase { get; private set; }
    public AircraftState State { get; private set; }
    public double DistanceM => _distanceM;
    public double RelativeSpeedMps { get; private set; }
    public double ElapsedSeconds { get; private set; }
    public bool IsActive => Phase is LaunchPhase.Hold or LaunchPhase.Stroke;

    public void Begin(Carrier carrier, double massKg, bool holdForClearance = false) {
        if (massKg <= 0.0 || !double.IsFinite(massKg))
            throw new System.ArgumentOutOfRangeException(nameof(massKg));
        _massKg = massKg;
        _distanceM = 0.0;
        RelativeSpeedMps = 0.0;
        ElapsedSeconds = 0.0;
        Phase = holdForClearance ? LaunchPhase.Hold : LaunchPhase.Stroke;
        State = StrokeState(carrier, _massKg, _distanceM,
            RelativeSpeedMps, ParkedNosePitchRad);
    }

    /// <summary>
    /// Release a launch held for its clearance/readback transaction. The stroke begins on the
    /// following fixed tick, so the last word is never spoken over an already-moving aircraft.
    /// </summary>
    public bool Release() {
        if (Phase != LaunchPhase.Hold) return false;
        Phase = LaunchPhase.Stroke;
        return true;
    }

    /// Exact Ready/Restart pose at the launcher start. Previewing this state avoids a one-frame
    /// teleport from the recovery centreline when Begin starts the stroke.
    public AircraftState ParkedState(Carrier carrier, double massKg) {
        if (massKg <= 0.0 || !double.IsFinite(massKg))
            throw new System.ArgumentOutOfRangeException(nameof(massKg));
        return StrokeState(carrier, massKg, 0.0, 0.0, ParkedNosePitchRad);
    }

    /// Call after Carrier.Step(dt), matching ArrestmentModel's moving-deck convention.
    public void Step(Carrier carrier, double dt) {
        if (dt <= 0.0) return;
        if (Phase == LaunchPhase.Hold) {
            // The platform can move under a held aircraft; keep the supported pose exact without
            // accumulating stroke time or distance.
            State = StrokeState(carrier, _massKg, 0.0, 0.0, ParkedNosePitchRad);
            return;
        }
        if (Phase != LaunchPhase.Stroke) return;

        double nextSpeed = System.Math.Min(_endRelativeSpeedMps,
            RelativeSpeedMps + AccelerationForStroke * dt);
        _distanceM += 0.5 * (RelativeSpeedMps + nextSpeed) * dt;
        RelativeSpeedMps = nextSpeed;
        ElapsedSeconds += dt;

        if (_distanceM + 1e-12 < _strokeDistanceM) {
            State = StrokeState(carrier, _massKg, _distanceM,
                RelativeSpeedMps, ParkedNosePitchRad);
            return;
        }

        _distanceM = _strokeDistanceM;
        RelativeSpeedMps = _endRelativeSpeedMps;
        // Split the end speed along the ramp rather than adding a token climb rate on top: the
        // energy comes from the stroke, and the ramp only decides where it points.
        double alongMps = _endRelativeSpeedMps * System.Math.Cos(_rampAngleRad);
        double upMps = _rampAngleRad > 0.0
            ? _endRelativeSpeedMps * System.Math.Sin(_rampAngleRad)
            : LaunchClimbMps;
        var velocity = carrier.DeckVelocityWorld
            + carrier.Fwd * alongMps
            + new Vec3D(0.0, upMps, 0.0);
        // Hand off from the TOP of the ramp, not from deck level. RampRiseM is zero for every flat
        // deck catapult, so this stays bit-for-bit identical for the carrier beats.
        State = Carrier.StateFromVelocity(
            carrier.ShipPoint(StartAlongM + HorizontalTravelAt(_strokeDistanceM),
                _crossOffsetM,
                carrier.LaunchRailHeadHeightM
                    + carrier.AircraftSupportReferenceHeightM
                    + AirborneHeightM + RampRiseM),
            velocity, _massKg,
            Attitude(carrier, System.Math.Max(LaunchNosePitchRad, _rampAngleRad)));
        Phase = LaunchPhase.Airborne;
    }

    public void Reset() {
        Phase = LaunchPhase.None;
        State = default;
        _massKg = _distanceM = RelativeSpeedMps = ElapsedSeconds = 0.0;
    }

    /// Normal acceleration the ramp arc pulls on the aircraft, on top of the along-rail stroke.
    /// A ski jump is a constant-radius arc, not a kink: the rail has to turn the aircraft's
    /// velocity vector, and how hard it turns it is the design choice. At Rapier's live 120 m/s
    /// launch, 3 G normal combines with 1.412 G tangential to about 3.32 G against its declared
    /// structural limit.
    public const double RampNormalG = 3.0;

    /// Arc radius that turns the launch velocity through the ramp angle at RampNormalG.
    public double RampArcRadiusM =>
        _endRelativeSpeedMps * _endRelativeSpeedMps / (RampNormalG * 9.80665);

    /// Length of rail spent in the arc, and the flat run that precedes it. The flat section is
    /// where nearly all the acceleration happens; the arc only points the result.
    public double RampArcLengthM => _rampAngleRad * RampArcRadiusM;
    public double RampFlatLengthM => System.Math.Max(0.0, _strokeDistanceM - RampArcLengthM);

    /// Horizontal plan distance corresponding to distance travelled along the rail. On the curved
    /// section the former code incorrectly used arc length as horizontal distance; the renderer
    /// already used R·sin(theta), leaving the physics handoff 0.63 m beyond the visible lip.
    public double HorizontalTravelAt(double distanceM) {
        double clamped = System.Math.Clamp(distanceM, 0.0, _strokeDistanceM);
        if (_rampAngleRad <= 0.0 || clamped <= RampFlatLengthM) return clamped;
        return RampFlatLengthM
            + RampArcRadiusM * System.Math.Sin(RailAngleAt(clamped));
    }

    public double HorizontalStrokeM => HorizontalTravelAt(_strokeDistanceM);

    double RailDistanceAtHorizontalTravel(double horizontalM) {
        double clamped = System.Math.Clamp(horizontalM, 0.0, HorizontalStrokeM);
        if (_rampAngleRad <= 0.0 || clamped <= RampFlatLengthM) return clamped;
        double sine = System.Math.Clamp(
            (clamped - RampFlatLengthM) / RampArcRadiusM,
            0.0,
            System.Math.Sin(_rampAngleRad));
        return RampFlatLengthM + RampArcRadiusM * System.Math.Asin(sine);
    }

    /// Height the ramp lifts the aircraft by the end of the stroke.
    public double RampRiseM =>
        RampArcRadiusM * (1.0 - System.Math.Cos(RailAngleAt(_strokeDistanceM)));

    /// Rail inclination at a distance along the stroke. Flat until the arc begins, then opening
    /// linearly with arc length as a constant-radius curve does, and never past the ramp angle.
    public double RailAngleAt(double distanceM) {
        if (_rampAngleRad <= 0.0 || distanceM <= RampFlatLengthM) return 0.0;
        double radius = RampArcRadiusM;
        if (radius <= 0.0) return _rampAngleRad;
        return System.Math.Min(_rampAngleRad, (distanceM - RampFlatLengthM) / radius);
    }

    /// Height of the rail above the deck plane at a distance along the stroke.
    public double RailHeightAt(double distanceM) =>
        _rampAngleRad <= 0.0 || distanceM <= RampFlatLengthM
            ? 0.0
            : RampArcRadiusM * (1.0 - System.Math.Cos(RailAngleAt(distanceM)));

    /// Physical launcher support surface under a point in the actual off-strip lane. This is a
    /// bounded constructed-surface query for AGL/contact projection; outside the rail corridor the
    /// caller must keep the natural DEM authoritative.
    public bool TryLaunchSupportSurfaceHeight(Carrier carrier, in Vec3D worldPosition,
        double corridorHalfWidthM, out double surfaceHeightM) {
        if (!double.IsFinite(corridorHalfWidthM) || corridorHalfWidthM < 0.0)
            throw new System.ArgumentOutOfRangeException(nameof(corridorHalfWidthM));
        var frame = carrier.DeckFrame(worldPosition);
        double horizontalM = frame.along - StartAlongM;
        if (System.Math.Abs(frame.cross - _crossOffsetM) > corridorHalfWidthM
            || horizontalM < 0.0 || horizontalM > HorizontalStrokeM) {
            surfaceHeightM = 0.0;
            return false;
        }
        double railDistanceM = RailDistanceAtHorizontalTravel(horizontalM);
        Vec3D support = carrier.ShipPoint(
            StartAlongM + horizontalM,
            _crossOffsetM,
            carrier.LaunchRailHeadHeightM + RailHeightAt(railDistanceM));
        surfaceHeightM = support.Y;
        return true;
    }

    /// Verify the lowest physical aircraft envelope (the wheel/cradle support plane) over the
    /// natural DEM. Samples use the actual launcher cross-offset, both span edges, the full curved
    /// rail, and a conservative two-second ballistic release path. Failure to sample is unsafe.
    public LaunchTerrainClearanceAssessment AssessTerrainClearance(
        Carrier carrier, ITerrainSurface? terrain, double aircraftHalfSpanM) {
        if (terrain is null) return LaunchTerrainClearanceAssessment.Unavailable;
        if (!double.IsFinite(aircraftHalfSpanM) || aircraftHalfSpanM < 0.0)
            throw new System.ArgumentOutOfRangeException(nameof(aircraftHalfSpanM));
        double stepM = System.Math.Clamp(terrain.HorizontalResolutionM * 0.25, 2.0, 8.0);
        double minimumRailM = double.PositiveInfinity;
        double minimumReleaseM = double.PositiveInfinity;
        int samples = 0;
        bool missing = false;
        double[] lateralOffsets = aircraftHalfSpanM > 0.0
            ? [-aircraftHalfSpanM, 0.0, aircraftHalfSpanM]
            : [0.0];

        void Observe(in Vec3D supportPoint, bool release) {
            foreach (double lateralM in lateralOffsets) {
                Vec3D query = supportPoint + carrier.Right * lateralM;
                if (!terrain.TrySample(query.X, query.Z, out TerrainSample ground)) {
                    missing = true;
                    continue;
                }
                double clearanceM = query.Y - ground.HeightM;
                if (release) minimumReleaseM = System.Math.Min(minimumReleaseM, clearanceM);
                else minimumRailM = System.Math.Min(minimumRailM, clearanceM);
                samples++;
            }
        }

        int railSteps = System.Math.Max(1, (int)System.Math.Ceiling(_strokeDistanceM / stepM));
        for (int index = 0; index <= railSteps; index++) {
            double railDistanceM = _strokeDistanceM * index / railSteps;
            Observe(carrier.ShipPoint(
                StartAlongM + HorizontalTravelAt(railDistanceM),
                _crossOffsetM,
                carrier.LaunchRailHeadHeightM + RailHeightAt(railDistanceM)),
                release: false);
        }

        Vec3D releaseSupport = carrier.ShipPoint(
            StartAlongM + HorizontalStrokeM,
            _crossOffsetM,
            carrier.LaunchRailHeadHeightM + RampRiseM + AirborneHeightM);
        double horizontalSpeedMps = _endRelativeSpeedMps * System.Math.Cos(_rampAngleRad);
        double verticalSpeedMps = _rampAngleRad > 0.0
            ? _endRelativeSpeedMps * System.Math.Sin(_rampAngleRad)
            : LaunchClimbMps;
        const double releaseValidationSeconds = 2.0;
        const double releaseStepSeconds = 0.1;
        for (double timeSeconds = 0.0;
            timeSeconds <= releaseValidationSeconds + 1e-9;
            timeSeconds += releaseStepSeconds) {
            Observe(
                releaseSupport
                    + carrier.Fwd * (horizontalSpeedMps * timeSeconds)
                    + new Vec3D(0.0,
                        verticalSpeedMps * timeSeconds
                            - 0.5 * 9.80665 * timeSeconds * timeSeconds,
                        0.0),
                release: true);
        }

        const double minimumClearanceM = 0.25;
        bool safe = !missing
            && double.IsFinite(minimumRailM)
            && double.IsFinite(minimumReleaseM)
            && minimumRailM >= minimumClearanceM
            && minimumReleaseM >= minimumClearanceM;
        return new LaunchTerrainClearanceAssessment(
            true,
            safe,
            minimumRailM,
            minimumReleaseM,
            samples,
            missing ? "terrain-sample-missing"
                : safe ? "verified"
                : "aircraft-support-envelope-below-terrain-clearance");
    }

    AircraftState StrokeState(Carrier carrier, double massKg,
        double distanceM, double relativeSpeedMps, double pitchRad) {
        // The aircraft RIDES the rail: on the arc its height, its attitude and the direction of
        // its velocity all follow the rail rather than staying level until the end. A flat stroke
        // with an angle applied only at release would leave the aircraft flying through its own
        // ramp for the whole arc, which is what a level-until-handoff model actually looks like.
        double railAngle = RailAngleAt(distanceM);
        var up = new Vec3D(0.0, 1.0, 0.0);
        var alongRail = carrier.Fwd * System.Math.Cos(railAngle) + up * System.Math.Sin(railAngle);
        var velocity = carrier.DeckVelocityWorld + alongRail * relativeSpeedMps;
        var position = carrier.ShipPoint(
            StartAlongM + HorizontalTravelAt(distanceM),
            _crossOffsetM,
            carrier.LaunchRailHeadHeightM
                + carrier.AircraftSupportReferenceHeightM
                + RailHeightAt(distanceM));
        // Nose-up on the arc is the rail's doing, not the pilot's; the parked sit adds to it.
        return Carrier.StateFromVelocity(position, velocity, massKg,
            Attitude(carrier, pitchRad + railAngle));
    }

    static QuaternionD Attitude(Carrier carrier, double pitchRad) {
        var up = new Vec3D(0.0, 1.0, 0.0);
        var forward = carrier.Fwd * System.Math.Cos(pitchRad)
            + up * System.Math.Sin(pitchRad);
        var bodyUp = up * System.Math.Cos(pitchRad)
            - carrier.Fwd * System.Math.Sin(pitchRad);
        return QuaternionD.FromFrame(bodyUp.Cross(forward).Normalized(), bodyUp, forward);
    }
}
