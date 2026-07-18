using System;
using GunsOnly.Sim;
using Xunit;

namespace GunsOnly.Sim.Tests;

public class ArrestmentTests {
    const double Dt = 1.0 / 120.0;

    static Carrier Ship(Carrier.DeckConfiguration configuration = Carrier.DeckConfiguration.Axial) =>
        new(new Vec3D(0, 20, 0), headingRad: 0.0, speedMps: 3.0,
            deckAltM: 20.0, deckLengthM: 250.0, deckWidthM: 30.0,
            configuration: configuration);

    static AircraftState Contact(Carrier ship, double along, double speedMps = 70.0) =>
        new(ship.LandingPoint(along), speedMps, Gamma: 0.0, Chi: ship.LandingHeadingRad,
            Bank: 0.0, Mass: FlightModel.Sabre.MassKg);

    [Theory]
    [InlineData(Carrier.DeckConfiguration.Axial)]
    [InlineData(Carrier.DeckConfiguration.Angled)]
    public void ArrestmentStopsWithinNinetyMetresAndThreeSeconds(Carrier.DeckConfiguration configuration) {
        var ship = Ship(configuration);
        var model = new ArrestmentModel();
        var contact = Contact(ship, ship.WireAlongM(3));
        model.Engage(ship, contact, bodyPitchRad: 10.5 * Math.PI / 180.0);

        for (int i = 0; i < 600 && model.Phase == ArrestmentModel.ArrestmentPhase.Arrested; i++) {
            ship.Step(Dt);
            model.Step(ship, Dt);
        }

        Assert.Equal(ArrestmentModel.ArrestmentPhase.Stopped, model.Phase);
        Assert.Equal(0.0, model.RelativeSpeedMps, 12);
        Assert.InRange(model.ElapsedSeconds, 2.0, 3.0);
        Assert.InRange(model.DistanceM, 70.0, 90.0);
        Assert.Equal(3, model.CaughtWire);
        Assert.Equal(0.0, ship.LandingFrame(model.Position).height, 10);
    }

    [Fact]
    public void CaughtWireIsReportedFromTouchdownPosition() {
        var ship = Ship();
        for (int wire = 1; wire <= 4; wire++) {
            var model = new ArrestmentModel();
            var contact = Contact(ship, ship.WireAlongM(wire) + 0.3);
            model.Engage(ship, contact, bodyPitchRad: 0.1);
            Assert.Equal(wire, model.CaughtWire);
        }
    }

    [Fact]
    public void ArrestmentIsDeterministic() {
        var aShip = Ship(Carrier.DeckConfiguration.Angled);
        var bShip = Ship(Carrier.DeckConfiguration.Angled);
        var a = new ArrestmentModel();
        var b = new ArrestmentModel();
        var contactA = Contact(aShip, aShip.WireAlongM(2), 68.25);
        var contactB = Contact(bShip, bShip.WireAlongM(2), 68.25);
        a.Engage(aShip, contactA, 0.17);
        b.Engage(bShip, contactB, 0.17);

        for (int i = 0; i < 420; i++) {
            aShip.Step(Dt); bShip.Step(Dt);
            a.Step(aShip, Dt); b.Step(bShip, Dt);
        }

        Assert.Equal(a.Phase, b.Phase);
        Assert.Equal(a.Position, b.Position);
        Assert.Equal(a.RelativeSpeedMps, b.RelativeSpeedMps);
        Assert.Equal(a.ElapsedSeconds, b.ElapsedSeconds);
        Assert.Equal(a.DistanceM, b.DistanceM);
        Assert.Equal(a.CaughtWire, b.CaughtWire);
    }
}
