using System.Runtime.CompilerServices;

[assembly: InternalsVisibleTo("GunsOnly.Sim.Tests")]

namespace GunsOnly.Sim;

/// <summary>
/// Deterministic post-impact point-mass/contact model. Flight remains owned by AircraftSim until a
/// swept surface collision is observed; this model then applies the collision impulse and carries
/// the wreck through deck-relative sliding/bounce, structure-shed debris, or water entry until its
/// motion is dynamically negligible. It is a physical handoff like arrestment/catapult, not a
/// render animation.
/// </summary>
internal sealed class WreckContactMotion {
    enum ContactMode { Deck, DebrisAirborne, Water }

    // Provisional phenomenological coefficients. They preserve momentum/energy ordering and are
    // isolated for calibration against type-specific structural and impact-test evidence; they are
    // not claimed as an exact F-86/Fury breakup or hydrodynamic model.
    const double DeckRestitution = 0.12;
    const double DeckFrictionMps2 = 5.5;
    const double WaterEquilibriumDepthM = -2.5;
    const double StructureRestitution = 0.18;
    const double StructureTangentialRetention = 0.42;
    const double SecondaryDeckTangentialRetention = 0.55;

    ContactMode _mode;
    Vec3D _surfaceVelocity;
    double _surfaceHeightM;
    readonly Carrier? _carrier;
    double _quietSeconds;
    Carrier.SolidCollision _suppressedCarrierSolid;

    public AircraftState State { get; private set; }
    public ImpactSurface Surface { get; private set; }
    /// The most recent carrier proxy involved in a secondary contact. The public session contract
    /// deliberately keeps island and hull under CarrierStructure, while this preserves subtype
    /// evidence for deterministic physics tests and future incident analysis.
    public Carrier.SolidCollision CarrierSolid { get; private set; }
    public bool SurfaceChangedThisStep { get; private set; }
    public bool Settled { get; private set; }
    /// True only while the wreck is actually supported by the flight deck. Debris beyond an edge
    /// and a wreck in water are not weight-on-wheels states; a deck bounce also unloads the switch
    /// until the point mass returns to the contact plane.
    public bool HasWeightBearingContact => _mode == ContactMode.Deck
        && State.Position.Y <= _surfaceHeightM + 0.05
        && (_carrier is null || _carrier.WithinDeckFootprint(State.Position));

    public WreckContactMotion(in AircraftState impactState, ImpactSurface surface,
        in Vec3D surfaceVelocity, double surfaceHeightM, Carrier? carrier = null,
        bool tangentialImpulseAlreadyResolved = false,
        Carrier.SolidCollision carrierSolid = Carrier.SolidCollision.None) {
        if (surface is ImpactSurface.None or ImpactSurface.SimulationBoundary)
            throw new ArgumentOutOfRangeException(nameof(surface));
        Surface = surface;
        _surfaceVelocity = surfaceVelocity;
        _surfaceHeightM = surfaceHeightM;
        _carrier = carrier;
        _mode = surface switch {
            ImpactSurface.Water => ContactMode.Water,
            ImpactSurface.FlightDeck => ContactMode.Deck,
            _ => ContactMode.DebrisAirborne
        };
        CarrierSolid = surface == ImpactSurface.FlightDeck
            ? Carrier.SolidCollision.FlightDeck
            : surface == ImpactSurface.CarrierStructure
                && carrierSolid is Carrier.SolidCollision.Hull
                    or Carrier.SolidCollision.Island
                ? carrierSolid : Carrier.SolidCollision.None;

        Vec3D relative = impactState.VelocityVector() - surfaceVelocity;
        Vec3D position = impactState.Position;
        if (_mode == ContactMode.Deck) {
            // Normal collision impulse plus a lossy tangential impulse. The remaining motion is
            // integrated below against the moving deck rather than discarded at the contact edge.
            // An arresting-engine failure hands us velocity after the wire's force/work integration;
            // applying this tangential impact loss again would create energy discontinuously.
            double tangentialRetention = tangentialImpulseAlreadyResolved ? 1.0 : 0.68;
            relative = new Vec3D(relative.X * tangentialRetention,
                Math.Max(0.0, -relative.Y * DeckRestitution),
                relative.Z * tangentialRetention);
            position = position with { Y = Math.Max(position.Y, surfaceHeightM) };
        } else if (_mode == ContactMode.Water) {
            // Water entry removes a large fraction of horizontal momentum, but the wreck still
            // travels and submerges under a damped buoyancy/flooding response.
            relative = new Vec3D(relative.X * 0.52,
                Math.Clamp(relative.Y * 0.24, -18.0, 2.0),
                relative.Z * 0.52);
            position = position with { Y = Math.Min(position.Y, surfaceHeightM) };
        } else {
            // The initial detector only exposes CarrierStructure rather than its face normal. A
            // point probe can usually retain the carrier subtype, and the same lossy face response
            // used by secondary strikes is preferable to carrying momentum through the proxy.
            Carrier.SolidCollision collision = CarrierSolid
                is Carrier.SolidCollision.Hull or Carrier.SolidCollision.Island
                ? CarrierSolid : PointCarrierSolid(position);
            CarrierSolid = collision;
            if (collision is Carrier.SolidCollision.Hull or Carrier.SolidCollision.Island) {
                Vec3D normal = CollisionNormal(collision, position, relative);
                relative = CollisionResponse(relative, normal,
                    StructureRestitution, StructureTangentialRetention);
            } else {
                relative *= -0.28;
            }
        }
        State = WithKinematics(impactState, position, relative + surfaceVelocity,
            impactState.BodyAttitude, impactState.BodyRates);
        if (_carrier is not null && _mode == ContactMode.DebrisAirborne)
            _suppressedCarrierSolid = PointCarrierSolid(State.Position);
    }

    public void Step(double dt) {
        if (Settled) return;
        if (!double.IsFinite(dt) || dt <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(dt));

        SurfaceChangedThisStep = false;
        RefreshCarrierContactSuppression();
        switch (_mode) {
            case ContactMode.Deck:
                StepDeck(dt);
                break;
            case ContactMode.DebrisAirborne:
                StepDebris(dt);
                break;
            default:
                StepWater(dt);
                break;
        }
    }

    void StepDeck(double dt) {
        if (_carrier is not null) {
            _surfaceVelocity = _carrier.DeckVelocityWorld
                + new Vec3D(0.0, _carrier.DeckVerticalVelocityMps, 0.0);
            _surfaceHeightM = State.Position.Y
                - _carrier.DeckFrame(State.Position).height;
        }
        Vec3D relative = State.VelocityVector() - _surfaceVelocity;
        double nextVertical = relative.Y - FlightModel.G0 * dt;
        Vec3D horizontal = new(relative.X, 0.0, relative.Z);
        double horizontalSpeed = horizontal.Length;
        if (horizontalSpeed > 0.0) {
            double nextSpeed = Math.Max(0.0, horizontalSpeed - DeckFrictionMps2 * dt);
            horizontal *= nextSpeed / horizontalSpeed;
        }

        Vec3D velocity = _surfaceVelocity + horizontal + new Vec3D(0.0, nextVertical, 0.0);
        Vec3D position = State.Position + velocity * dt;
        if (TrySecondaryCarrierContact(State.Position, position, velocity, dt,
            out Vec3D contactPosition, out Vec3D contactVelocity)) {
            Adopt(contactPosition, contactVelocity, dt, angularDamping: 0.44);
            return;
        }
        // Once the centre of mass passes a real deck edge there is no infinite support plane.
        // Preserve its world momentum and hand it to the ballistic debris phase; that phase will
        // subsequently enter the water model at the actual sea surface.
        if (_carrier is not null && !_carrier.WithinDeckFootprint(position)) {
            _mode = ContactMode.DebrisAirborne;
            _suppressedCarrierSolid = Carrier.SolidCollision.FlightDeck;
            Adopt(position, velocity, dt, angularDamping: 0.32);
            return;
        }
        if (_carrier is not null)
            _surfaceHeightM = position.Y - _carrier.DeckFrame(position).height;
        if (position.Y <= _surfaceHeightM) {
            position = position with { Y = _surfaceHeightM };
            if (nextVertical < -0.35) nextVertical = -nextVertical * DeckRestitution;
            else nextVertical = 0.0;
            velocity = _surfaceVelocity + horizontal + new Vec3D(0.0, nextVertical, 0.0);
        }
        Adopt(position, velocity, dt, angularDamping: 1.25);

        bool quiet = horizontal.Length < 0.8 && Math.Abs(nextVertical) < 0.25;
        _quietSeconds = quiet ? _quietSeconds + dt : 0.0;
        if (_quietSeconds >= 0.75) Settle();
    }

    void StepDebris(double dt) {
        Vec3D velocity = State.VelocityVector();
        // Quadratic-ish air resistance on a broken, high-drag shape plus gravity.
        double drag = 0.012 * velocity.Length;
        velocity += (velocity * (-drag) - new Vec3D(0.0, FlightModel.G0, 0.0)) * dt;
        Vec3D position = State.Position + velocity * dt;
        if (TrySecondaryCarrierContact(State.Position, position, velocity, dt,
            out Vec3D contactPosition, out Vec3D contactVelocity)) {
            Adopt(contactPosition, contactVelocity, dt, angularDamping: 0.44);
            return;
        }
        Adopt(position, velocity, dt, angularDamping: 0.32);
        if (position.Y <= 0.0) {
            _mode = ContactMode.Water;
            Surface = ImpactSurface.Water;
            SurfaceChangedThisStep = true;
            _surfaceVelocity = Vec3D.Zero;
            _surfaceHeightM = 0.0;
            Vec3D waterEntry = State.VelocityVector();
            waterEntry = new Vec3D(waterEntry.X * 0.45,
                Math.Clamp(waterEntry.Y * 0.22, -18.0, 1.0),
                waterEntry.Z * 0.45);
            State = WithKinematics(State, State.Position with { Y = 0.0 }, waterEntry,
                State.BodyAttitude, State.BodyRates);
        }
    }

    void StepWater(double dt) {
        Vec3D relative = State.VelocityVector() - _surfaceVelocity;
        double horizontalDecay = Math.Exp(-1.35 * dt);
        double nextVx = relative.X * horizontalDecay;
        double nextVz = relative.Z * horizontalDecay;
        // Damped flooded-buoyancy response about a shallow submerged equilibrium. This retains the
        // water-entry sink and any bounce without inventing a seabed at visual-effect depth.
        double displacement = State.Position.Y - WaterEquilibriumDepthM;
        double verticalAccel = -2.8 * displacement - 3.2 * relative.Y;
        double nextVy = relative.Y + verticalAccel * dt;
        Vec3D velocity = _surfaceVelocity + new Vec3D(nextVx, nextVy, nextVz);
        Vec3D position = State.Position + velocity * dt;
        position = position with { Y = Math.Min(position.Y, _surfaceHeightM + 0.15) };
        Adopt(position, velocity, dt, angularDamping: 1.05);

        bool quiet = Math.Sqrt(nextVx * nextVx + nextVz * nextVz) < 0.65
            && Math.Abs(nextVy) < 0.35
            && Math.Abs(position.Y - WaterEquilibriumDepthM) < 0.35;
        _quietSeconds = quiet ? _quietSeconds + dt : 0.0;
        if (_quietSeconds >= 0.8) Settle();
    }

    bool TrySecondaryCarrierContact(in Vec3D previous, in Vec3D proposed,
        in Vec3D proposedVelocity, double dt,
        out Vec3D finalPosition, out Vec3D finalVelocity) {
        finalPosition = proposed;
        finalVelocity = proposedVelocity;
        if (_carrier is null) return false;

        Carrier.SolidCollision collision = _carrier.SweptSolidCollision(previous, proposed);
        if (collision == Carrier.SolidCollision.None
            || collision == _suppressedCarrierSolid
            || (_mode == ContactMode.Deck
                && collision == Carrier.SolidCollision.FlightDeck))
            return false;

        // If an earlier impulse left the point just inside a proxy, let that impulse carry it back
        // out. Reflecting an exit segment would trap it in an endless contact loop.
        if (PointCarrierSolid(previous) == collision) {
            _suppressedCarrierSolid = collision;
            return false;
        }

        double contactFraction = FindCarrierContactFraction(previous, proposed, collision);
        Vec3D contact = Lerp(previous, proposed, contactFraction);
        Vec3D surfaceVelocity = _carrier.DeckVelocityWorld
            + new Vec3D(0.0, _carrier.DeckVerticalVelocityMps, 0.0);
        Vec3D relative = proposedVelocity - surfaceVelocity;
        Vec3D normal = CollisionNormal(collision, contact, relative);

        double restitution = collision == Carrier.SolidCollision.FlightDeck
            ? DeckRestitution : StructureRestitution;
        double tangentialRetention = collision == Carrier.SolidCollision.FlightDeck
            ? SecondaryDeckTangentialRetention : StructureTangentialRetention;
        Vec3D responseRelative = CollisionResponse(relative, normal,
            restitution, tangentialRetention);
        Vec3D responseVelocity = surfaceVelocity + responseRelative;

        // Integrate the unused part of the fixed step with the post-collision velocity. This moves
        // continuously to and away from the contact instead of teleporting to a proxy boundary or
        // freezing there.
        double remainingSeconds = dt * (1.0 - contactFraction);
        finalPosition = contact + responseVelocity * remainingSeconds;
        finalVelocity = responseVelocity;

        ImpactSurface nextSurface = collision == Carrier.SolidCollision.FlightDeck
            ? ImpactSurface.FlightDeck : ImpactSurface.CarrierStructure;
        SurfaceChangedThisStep = nextSurface != Surface || collision != CarrierSolid;
        Surface = nextSurface;
        CarrierSolid = collision;
        _surfaceVelocity = surfaceVelocity;
        _surfaceHeightM = contact.Y - _carrier.DeckFrame(contact).height;
        _mode = collision == Carrier.SolidCollision.FlightDeck
            && _carrier.WithinDeckFootprint(contact)
                ? ContactMode.Deck : ContactMode.DebrisAirborne;
        _quietSeconds = 0.0;
        _suppressedCarrierSolid = collision;
        return true;
    }

    void RefreshCarrierContactSuppression() {
        if (_carrier is null || _suppressedCarrierSolid == Carrier.SolidCollision.None) return;
        if (PointCarrierSolid(State.Position) != _suppressedCarrierSolid)
            _suppressedCarrierSolid = Carrier.SolidCollision.None;
    }

    Carrier.SolidCollision PointCarrierSolid(in Vec3D position) =>
        _carrier?.SweptSolidCollision(position, position) ?? Carrier.SolidCollision.None;

    double FindCarrierContactFraction(in Vec3D start, in Vec3D end,
        Carrier.SolidCollision collision) {
        if (_carrier is null) return 1.0;
        double low = 0.0, high = 1.0;
        for (int i = 0; i < 24; i++) {
            double middle = (low + high) * 0.5;
            Carrier.SolidCollision partial = _carrier.SweptSolidCollision(
                start, Lerp(start, end, middle));
            if (partial == collision) high = middle;
            else low = middle;
        }
        return high;
    }

    Vec3D CollisionNormal(Carrier.SolidCollision collision, in Vec3D contact,
        in Vec3D relativeVelocity) {
        if (collision == Carrier.SolidCollision.FlightDeck)
            return relativeVelocity.Y <= 0.0
                ? new Vec3D(0.0, 1.0, 0.0)
                : new Vec3D(0.0, -1.0, 0.0);

        // Carrier intentionally keeps proxy extents private. Probe either side of the contact in
        // its published ship basis to recover the box face without duplicating geometry constants.
        // At an edge/corner, choose the outward face with the greatest closing speed.
        if (_carrier is not null) {
            Vec3D best = Vec3D.Zero;
            double bestClosing = 0.0;
            Vec3D[] axes = [_carrier.Fwd, _carrier.Right, new Vec3D(0.0, 1.0, 0.0)];
            const double probeM = 0.025;
            foreach (Vec3D axis in axes) {
                bool plusInside = PointCarrierSolid(contact + axis * probeM) == collision;
                bool minusInside = PointCarrierSolid(contact - axis * probeM) == collision;
                if (plusInside == minusInside) continue;
                Vec3D outward = plusInside ? axis * -1.0 : axis;
                double closing = -relativeVelocity.Dot(outward);
                if (closing > bestClosing) {
                    best = outward;
                    bestClosing = closing;
                }
            }
            if (best.Length > 0.0) return best;
        }

        // A point handed over just inside a structure may be too far from the face for the small
        // probe above. Fall back to the opposite horizontal closing direction, preserving vertical
        // motion rather than synthesizing a full three-axis reversal.
        Vec3D horizontal = _carrier is null ? new Vec3D(relativeVelocity.X, 0.0,
            relativeVelocity.Z) : _carrier.Fwd * relativeVelocity.Dot(_carrier.Fwd)
                + _carrier.Right * relativeVelocity.Dot(_carrier.Right);
        if (horizontal.Length > 1e-9) return horizontal.Normalized() * -1.0;
        return relativeVelocity.Y <= 0.0
            ? new Vec3D(0.0, 1.0, 0.0)
            : new Vec3D(0.0, -1.0, 0.0);
    }

    static Vec3D CollisionResponse(in Vec3D relativeVelocity, Vec3D normal,
        double restitution, double tangentialRetention) {
        double normalSpeed = relativeVelocity.Dot(normal);
        if (normalSpeed > 0.0) {
            normal *= -1.0;
            normalSpeed = -normalSpeed;
        }
        Vec3D tangent = relativeVelocity - normal * normalSpeed;
        return tangent * tangentialRetention
            + normal * (-normalSpeed * restitution);
    }

    static Vec3D Lerp(in Vec3D a, in Vec3D b, double fraction) =>
        a + (b - a) * fraction;

    void Adopt(in Vec3D position, in Vec3D velocity, double dt, double angularDamping) {
        BodyRates rates = State.BodyRates * Math.Exp(-angularDamping * dt);
        QuaternionD attitude = IntegrateAttitude(State.BodyAttitude, rates, dt);
        State = WithKinematics(State, position, velocity, attitude, rates);
    }

    void Settle() {
        Settled = true;
        Vec3D position = State.Position;
        if (_mode == ContactMode.Deck) position = position with { Y = _surfaceHeightM };
        else if (_mode == ContactMode.Water)
            position = position with { Y = WaterEquilibriumDepthM };
        State = WithKinematics(State, position, _surfaceVelocity,
            State.BodyAttitude, default);
    }

    static QuaternionD IntegrateAttitude(in QuaternionD attitude,
        in BodyRates rates, double dt) {
        QuaternionD q = attitude.IsFinite && attitude.LengthSquared > 1e-12
            ? attitude.Normalized() : QuaternionD.Identity;
        var omega = new QuaternionD(0.0, -rates.Q, rates.R, -rates.P);
        return (q + (q * omega) * (0.5 * dt)).Normalized();
    }

    static AircraftState WithKinematics(in AircraftState previous, in Vec3D position,
        in Vec3D velocity, in QuaternionD attitude, in BodyRates rates) {
        double speed = velocity.Length;
        Vec3D direction = speed < 1e-9 ? previous.ForwardDir() : velocity * (1.0 / speed);
        return previous with {
            Position = position,
            Speed = speed,
            Gamma = Math.Asin(Math.Clamp(direction.Y, -1.0, 1.0)),
            Chi = Math.Atan2(direction.X, direction.Z),
            Bank = Math.IEEERemainder(previous.Bank + rates.P / AircraftSim.TickHz,
                2.0 * Math.PI),
            BodyAttitude = attitude,
            BodyRates = rates
        };
    }
}
