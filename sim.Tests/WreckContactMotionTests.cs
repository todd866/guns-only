using GunsOnly.Sim;

namespace GunsOnly.Sim.Tests;

public sealed class WreckContactMotionTests {
    const double Dt = 1.0 / AircraftSim.TickHz;

    static Carrier StaticCarrier() => new(
        deckCentre: new Vec3D(0.0, 20.0, 0.0),
        headingRad: 0.0,
        speedMps: 0.0,
        deckAltM: 20.0,
        deckLengthM: 260.0,
        deckWidthM: 30.0);

    static AircraftState StateFromVelocity(in Vec3D position, in Vec3D velocity) {
        double speed = velocity.Length;
        Vec3D direction = velocity * (1.0 / speed);
        return new AircraftState(position, speed,
            Math.Asin(Math.Clamp(direction.Y, -1.0, 1.0)),
            Math.Atan2(direction.X, direction.Z), 0.0, FlightModel.Sabre.MassKg);
    }

    [Fact]
    public void DeckSlideSweepsIntoIslandLosesEnergyAndRetainsResidualMotion() {
        Carrier ship = StaticCarrier();
        Vec3D start = ship.ShipPoint(along: 6.0, cross: 10.0, height: 0.02);
        Vec3D groundVelocity = ship.Fwd * 80.0 + new Vec3D(0.0, -3.0, 0.0);
        var motion = new WreckContactMotion(StateFromVelocity(start, groundVelocity),
            ImpactSurface.FlightDeck, ship.DeckVelocityWorld, ship.Position.Y, ship);

        bool struckIsland = false;
        double speedBeforeStrike = double.NaN;
        double speedAfterStrike = double.NaN;
        Vec3D positionAtStrike = default;
        for (int i = 0; i < AircraftSim.TickHz; i++) {
            double before = (motion.State.VelocityVector()
                - ship.DeckVelocityWorld).Length;
            motion.Step(Dt);
            if (motion.SurfaceChangedThisStep
                && motion.CarrierSolid == Carrier.SolidCollision.Island) {
                struckIsland = true;
                speedBeforeStrike = before;
                speedAfterStrike = (motion.State.VelocityVector()
                    - ship.DeckVelocityWorld).Length;
                positionAtStrike = motion.State.Position;
                break;
            }
        }

        Assert.True(struckIsland,
            "a fast supported wreck must not tunnel through the island proxy");
        Assert.Equal(ImpactSurface.CarrierStructure, motion.Surface);
        Assert.InRange(speedAfterStrike, 0.1, speedBeforeStrike - 0.1);
        Assert.False(motion.Settled);

        for (int i = 0; i < 6; i++) motion.Step(Dt);
        Assert.True((motion.State.Position - positionAtStrike).Length > 0.01,
            "the collision response must carry residual motion instead of pinning the wreck");
    }

    [Fact]
    public void IslandReboundCanMakeASecondSweptFlightDeckContactDeterministically() {
        static WreckContactMotion Create() {
            Carrier ship = StaticCarrier();
            Vec3D start = ship.ShipPoint(along: 6.0, cross: 10.0, height: 0.02);
            Vec3D velocity = ship.Fwd * 80.0 + new Vec3D(0.0, -3.0, 0.0);
            return new WreckContactMotion(StateFromVelocity(start, velocity),
                ImpactSurface.FlightDeck, ship.DeckVelocityWorld, ship.Position.Y, ship);
        }

        WreckContactMotion first = Create();
        WreckContactMotion second = Create();
        bool sawIsland = false;
        bool sawDeckAfterIsland = false;
        for (int i = 0; i < 2 * AircraftSim.TickHz && !sawDeckAfterIsland; i++) {
            first.Step(Dt);
            second.Step(Dt);
            Assert.Equal(first.State, second.State);
            Assert.Equal(first.Surface, second.Surface);
            Assert.Equal(first.CarrierSolid, second.CarrierSolid);
            sawIsland |= first.SurfaceChangedThisStep
                && first.CarrierSolid == Carrier.SolidCollision.Island;
            sawDeckAfterIsland |= sawIsland && first.SurfaceChangedThisStep
                && first.CarrierSolid == Carrier.SolidCollision.FlightDeck;
        }

        Assert.True(sawIsland);
        Assert.True(sawDeckAfterIsland,
            "airborne debris rebounding from the island must sweep the deck rather than cross it");
    }

    [Fact]
    public void HullSideHandoffResolvesOutwardWithLowerButNonzeroEnergy() {
        Carrier ship = StaticCarrier();
        Vec3D justInsideStarboardHull = ship.ShipPoint(
            along: 0.0, cross: ship.DeckHalfWidthM - 0.01, height: -8.0);
        Vec3D incomingVelocity = ship.Right * -120.0;
        var motion = new WreckContactMotion(
            StateFromVelocity(justInsideStarboardHull, incomingVelocity),
            ImpactSurface.CarrierStructure, ship.DeckVelocityWorld,
            ship.Position.Y, ship);

        Vec3D response = motion.State.VelocityVector() - ship.DeckVelocityWorld;
        Assert.Equal(Carrier.SolidCollision.Hull, motion.CarrierSolid);
        Assert.True(response.Dot(ship.Right) > 0.0,
            "the hull-side impulse must point debris back out through its entry face");
        Assert.InRange(response.Length, 0.1, incomingVelocity.Length - 0.1);

        for (int i = 0; i < AircraftSim.TickHz / 4; i++) motion.Step(Dt);
        Assert.True(ship.DeckFrame(motion.State.Position).cross
            > ship.DeckHalfWidthM);
        Assert.False(motion.Settled);
    }

    [Fact]
    public void FastDeckEdgeDepartureFallsIntoWaterWithOrderedEnergyLoss() {
        Carrier ship = StaticCarrier();
        Vec3D start = ship.ShipPoint(
            along: ship.DeckLengthM * 0.5 - 1.0, cross: 0.0, height: 0.02);
        Vec3D velocity = ship.Fwd * 100.0 + new Vec3D(0.0, -2.0, 0.0);
        var motion = new WreckContactMotion(StateFromVelocity(start, velocity),
            ImpactSurface.FlightDeck, ship.DeckVelocityWorld, ship.Position.Y, ship);

        bool enteredWater = false;
        double beforeEntrySpeed = double.NaN;
        double afterEntrySpeed = double.NaN;
        for (int i = 0; i < 6 * AircraftSim.TickHz && !enteredWater; i++) {
            double before = motion.State.VelocityVector().Length;
            motion.Step(Dt);
            if (motion.SurfaceChangedThisStep && motion.Surface == ImpactSurface.Water) {
                enteredWater = true;
                beforeEntrySpeed = before;
                afterEntrySpeed = motion.State.VelocityVector().Length;
            }
        }

        Assert.True(enteredWater,
            "momentum beyond the finite deck edge must continue ballistically to the sea");
        Assert.InRange(afterEntrySpeed, 0.1, beforeEntrySpeed - 0.1);
        Assert.False(motion.Settled,
            "water contact is an impact transition, not an instantaneous terminal freeze");
        Assert.False(motion.HasWeightBearingContact);
    }

    [Fact]
    public void HighEnergyDeckMotionIsNotManufacturedIntoRestAtFourteenSeconds() {
        Vec3D position = new(0.0, 20.02, 0.0);
        Vec3D velocity = new(350.0, -2.0, 0.0);
        var motion = new WreckContactMotion(StateFromVelocity(position, velocity),
            ImpactSurface.FlightDeck, Vec3D.Zero, surfaceHeightM: 20.0);

        int ticks = (int)Math.Ceiling(14.25 * AircraftSim.TickHz);
        for (int i = 0; i < ticks; i++) motion.Step(Dt);

        Assert.False(motion.Settled,
            "unresolved high-energy motion belongs to the session terminal limit, not a local timer");
        Assert.True(motion.State.VelocityVector().Length > 100.0);
        Assert.True(motion.State.Position.X > 1000.0);
    }

    [Fact]
    public void QuietFloodedWreckStillSettlesFromItsPhysicalQuietWindow() {
        Vec3D position = new(0.0, -0.1, 0.0);
        Vec3D velocity = new(0.4, -0.2, 0.2);
        var motion = new WreckContactMotion(StateFromVelocity(position, velocity),
            ImpactSurface.Water, Vec3D.Zero, surfaceHeightM: 0.0);

        for (int i = 0; i < 12 * AircraftSim.TickHz && !motion.Settled; i++)
            motion.Step(Dt);

        Assert.True(motion.Settled);
        Assert.Equal(ImpactSurface.Water, motion.Surface);
        Assert.Equal(Vec3D.Zero, motion.State.VelocityVector());
    }
}
