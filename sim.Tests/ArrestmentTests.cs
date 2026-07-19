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

    static AircraftState Contact(Carrier ship, double along, double closureMps = 54.5) {
        var velocity = ship.DeckVelocityWorld + ship.LandingFwd * closureMps;
        return StateFromVelocity(ship.LandingPoint(along), velocity);
    }

    static AircraftState StateFromVelocity(Vec3D position, Vec3D velocity) {
        double speed = velocity.Length;
        var direction = velocity * (1.0 / speed);
        return new AircraftState(position, speed,
            Math.Asin(direction.Y), Math.Atan2(direction.X, direction.Z),
            Bank: 0.0, Mass: FlightModel.Sabre.MassKg);
    }

    [Theory]
    [InlineData(Carrier.DeckConfiguration.Axial)]
    [InlineData(Carrier.DeckConfiguration.Angled)]
    public void SpringDamperArrestmentBuildsToAPeakAndStopsAtRealRunout(Carrier.DeckConfiguration configuration) {
        var ship = Ship(configuration);
        var model = new ArrestmentModel();
        var contact = Contact(ship, ship.WireAlongM(3) + Carrier.HookToMainGearM);
        model.Engage(ship, contact, bodyPitchRad: 10.5 * Math.PI / 180.0, caughtWire: 3);

        double firstDecel = double.NaN, peakDecel = 0.0, lateDecel = double.NaN;
        double distanceAtPeak = 0.0;

        for (int i = 0; i < 600 && model.Phase == ArrestmentModel.ArrestmentPhase.Arrested; i++) {
            ship.Step(Dt);
            model.Step(ship, Dt);
            if (!double.IsFinite(firstDecel)) firstDecel = model.DecelerationMps2;
            if (model.DecelerationMps2 > peakDecel) {
                peakDecel = model.DecelerationMps2;
                distanceAtPeak = model.DistanceM;
            }
            if (model.DistanceM > 0.80 * model.RunoutTargetM)
                lateDecel = model.DecelerationMps2;
        }

        Assert.Equal(ArrestmentModel.ArrestmentPhase.Stopped, model.Phase);
        Assert.Equal(0.0, model.RelativeSpeedMps, 12);
        Assert.InRange(model.ElapsedSeconds, 3.0, 5.5);
        Assert.InRange(model.DistanceM, 90.0, 100.0);
        Assert.True(peakDecel > firstDecel * 1.5,
            $"wire tension must build after engagement: first={firstDecel:F2}, peak={peakDecel:F2} m/s²");
        Assert.InRange(distanceAtPeak, 15.0, 75.0);
        Assert.True(double.IsFinite(lateDecel) && lateDecel < peakDecel,
            $"deceleration must run out after the peak: late={lateDecel:F2}, peak={peakDecel:F2} m/s²");
        Assert.InRange(model.PeakDecelerationMps2 / FlightModel.G0, 1.2, 3.5);
        Assert.Equal(3, model.CaughtWire);
        Assert.Equal(0.0, ship.LandingFrame(model.Position).height, 10);
    }

    [Fact]
    public void ExplicitCaughtWireIsRetainedThroughTheRunout() {
        var ship = Ship();
        for (int wire = 1; wire <= 4; wire++) {
            var model = new ArrestmentModel();
            var contact = Contact(ship, ship.WireAlongM(wire) + Carrier.HookToMainGearM);
            model.Engage(ship, contact, bodyPitchRad: 0.1, caughtWire: wire);
            Assert.Equal(wire, model.CaughtWire);
        }
    }

    [Fact]
    public void ArrestmentIsDeterministic() {
        var aShip = Ship(Carrier.DeckConfiguration.Angled);
        var bShip = Ship(Carrier.DeckConfiguration.Angled);
        var a = new ArrestmentModel();
        var b = new ArrestmentModel();
        var contactA = Contact(aShip, aShip.WireAlongM(2) + Carrier.HookToMainGearM, 57.25);
        var contactB = Contact(bShip, bShip.WireAlongM(2) + Carrier.HookToMainGearM, 57.25);
        a.Engage(aShip, contactA, 0.17, caughtWire: 2);
        b.Engage(bShip, contactB, 0.17, caughtWire: 2);

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
        Assert.Equal(a.WireStretchM, b.WireStretchM);
        Assert.Equal(a.TensionN, b.TensionN);
        Assert.Equal(a.DecelerationMps2, b.DecelerationMps2);
        Assert.Equal(a.PeakDecelerationMps2, b.PeakDecelerationMps2);
    }
}
