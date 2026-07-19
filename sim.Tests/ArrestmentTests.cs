using System;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
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
    public void FixedCapabilityBuildsToAPeakAndStopsNominalJetNearFullRunout(Carrier.DeckConfiguration configuration) {
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
        Assert.Equal(model.InitialEnergyJ, model.AbsorbedEnergyJ, precision: 5);
        Assert.Equal(0.0, model.RemainingEnergyJ, precision: 10);
        Assert.Equal(ArrestmentModel.ArrestmentFailureReason.None, model.FailureReason);
        Assert.Equal("PROVISIONAL_KOREA_JET_V1", model.Capability.Id);
    }

    [Fact]
    public void IncomingEnergyNeverRetunesTheSelectedForceCurve() {
        var ship = Ship();
        var slow = new ArrestmentModel();
        var fast = new ArrestmentModel();
        slow.Engage(ship, Contact(ship, ship.WireAlongM(3), closureMps: 45.0),
            bodyPitchRad: 0.1, caughtWire: 3);
        fast.Engage(ship, Contact(ship, ship.WireAlongM(3), closureMps: 70.0),
            bodyPitchRad: 0.1, caughtWire: 3);

        Assert.Equal(slow.Capability, fast.Capability);
        Assert.Equal(slow.TensionN, fast.TensionN);
        Assert.NotEqual(slow.InitialEnergyJ, fast.InitialEnergyJ);
        Assert.Equal(51_200.0, slow.TensionN, precision: 8);
        Assert.Equal(45.0, slow.InitialRelativeSpeedMps, precision: 10);
        Assert.Equal(70.0, fast.InitialRelativeSpeedMps, precision: 10);
    }

    [Fact]
    public void RatedEnergyExhaustionFailsWithExactResidualLedger() {
        var capability = new ArrestmentCapabilityProfile(
            id: "ENERGY_LIMIT_TEST", runoutDistanceM: 100.0,
            initialForceN: 100_000.0, peakForceN: 100_000.0,
            finalForceN: 100_000.0, peakPayoutFraction: 0.5,
            ratedEnergyJ: 1_000_000.0, maximumLineLoadN: 150_000.0,
            maximumWireDeflectionM: 2.0);
        var ship = Ship();
        var model = new ArrestmentModel(capability);
        model.Engage(ship, Contact(ship, ship.WireAlongM(2), closureMps: 30.0),
            bodyPitchRad: 0.1, caughtWire: 2);

        for (int i = 0; i < 1000
            && model.Phase == ArrestmentModel.ArrestmentPhase.Arrested; i++) {
            ship.Step(Dt);
            model.Step(ship, Dt);
        }

        Assert.Equal(ArrestmentModel.ArrestmentPhase.Failed, model.Phase);
        Assert.Equal(ArrestmentModel.ArrestmentFailureReason.EnergyCapacityExceeded,
            model.FailureReason);
        Assert.Equal(capability.RatedEnergyJ, model.AbsorbedEnergyJ, precision: 5);
        Assert.Equal(10.0, model.DistanceM, precision: 5);
        Assert.True(model.ResidualSpeedMps > 0.0);
        Assert.Equal(model.InitialEnergyJ,
            model.AbsorbedEnergyJ + model.RemainingEnergyJ, precision: 5);
    }

    [Fact]
    public void LineLoadLimitCanFailWithoutInventingAnImpulse() {
        var capability = new ArrestmentCapabilityProfile(
            id: "LINE_LIMIT_TEST", runoutDistanceM: 100.0,
            initialForceN: 120_000.0, peakForceN: 120_000.0,
            finalForceN: 120_000.0, peakPayoutFraction: 0.5,
            ratedEnergyJ: 20_000_000.0, maximumLineLoadN: 100_000.0,
            maximumWireDeflectionM: 2.0);
        var ship = Ship();
        var model = new ArrestmentModel(capability);
        model.Engage(ship, Contact(ship, ship.WireAlongM(1), closureMps: 52.0),
            bodyPitchRad: 0.1, caughtWire: 1);

        Assert.Equal(ArrestmentModel.ArrestmentPhase.Failed, model.Phase);
        Assert.Equal(ArrestmentModel.ArrestmentFailureReason.LineLoadExceeded,
            model.FailureReason);
        Assert.Equal(52.0, model.ResidualSpeedMps, precision: 10);
        Assert.Equal(0.0, model.DistanceM, precision: 10);
        Assert.Equal(0.0, model.AbsorbedEnergyJ, precision: 10);
        Assert.Equal(120_000.0, model.PeakLoadN, precision: 8);
        Assert.Equal(model.InitialEnergyJ, model.RemainingEnergyJ, precision: 5);
    }

    [Fact]
    public void DefaultProfileOverloadUsesRunoutFailureAndRetainsResidualEnergy() {
        var ship = Ship();
        var model = new ArrestmentModel();
        model.Engage(ship, Contact(ship, ship.WireAlongM(4), closureMps: 70.0),
            bodyPitchRad: 0.1, caughtWire: 4);

        for (int i = 0; i < 1000
            && model.Phase == ArrestmentModel.ArrestmentPhase.Arrested; i++) {
            ship.Step(Dt);
            model.Step(ship, Dt);
        }

        Assert.Equal(ArrestmentModel.ArrestmentPhase.Failed, model.Phase);
        Assert.Equal(ArrestmentModel.ArrestmentFailureReason.RunoutExhausted,
            model.FailureReason);
        Assert.Equal(model.Capability.RunoutDistanceM, model.DistanceM, precision: 8);
        Assert.True(model.AbsorbedEnergyJ < model.Capability.RatedEnergyJ);
        Assert.True(model.ResidualSpeedMps > 0.0);
        Assert.Equal(model.InitialEnergyJ,
            model.AbsorbedEnergyJ + model.RemainingEnergyJ, precision: 5);
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

    [Fact]
    public void ProductionOverloadHandsOffResidualMotionAndNeverRecoversOrRelaunches() {
        BeatSetup baseline = Beats.CarrierApproach();
        Carrier ship = baseline.Carrier!;
        var playerAir = new AircraftState(
            ship.LandingPoint(ship.WireAlongM(3) + Carrier.HookToMainGearM,
                height: 0.02),
            Speed: 90.0, Gamma: -0.04, Chi: ship.LandingHeadingRad,
            Bank: 0.0, Mass: FlightModel.Sabre.MassKg);
        BeatSetup setup = baseline with { Player = playerAir };
        var session = new SimulationSession();
        session.StartBeat(() => setup);
        session.Begin();

        bool sawCatapult = false;
        for (int i = 0; i < 8 * AircraftSim.TickHz
            && session.Arrestment.Phase != ArrestmentModel.ArrestmentPhase.Failed; i++) {
            session.StepFixed();
            sawCatapult |= session.Catapult.IsActive;
        }

        Assert.Equal(ArrestmentModel.ArrestmentPhase.Failed,
            session.Arrestment.Phase);
        Assert.Equal(ArrestmentModel.ArrestmentFailureReason.RunoutExhausted,
            session.Arrestment.FailureReason);
        Assert.Equal(Carrier.Recovery.ArrestmentFailed, session.Recovery);
        Assert.Equal(AircraftTerminalState.Impacted, session.PlayerTerminalState);
        Assert.Equal(ImpactSurface.FlightDeck, session.PlayerImpactSurface);
        Assert.False(sawCatapult);
        Assert.Equal(0, session.RecoveryProgress.CleanTrapCount);
        Assert.Equal(0, session.RecoveryProgress.CleanStreak);

        double residualAlong = (session.Player.State.VelocityVector()
            - session.Carrier!.DeckVelocityWorld
            - new Vec3D(0.0, session.Carrier.DeckVerticalVelocityMps, 0.0))
            .Dot(session.Carrier.LandingFwd);
        Assert.Equal(session.Arrestment.ResidualSpeedMps, residualAlong, precision: 9);
        Assert.True(session.Player.State.BodyAttitude.IsFinite);
        Assert.Equal(LandingGearHandle.Down, session.PlayerSystems.GearHandle);
        Assert.Single(session.RecentEvents,
            e => e.Type == SessionEventType.ArrestmentFailed);

        for (int i = 0; i < 20 * AircraftSim.TickHz
            && session.Lifecycle != SimulationSession.LifecycleState.Finished; i++) {
            session.StepFixed();
            sawCatapult |= session.Catapult.IsActive;
        }

        Assert.False(sawCatapult);
        Assert.Equal(0, session.RecoveryProgress.CleanTrapCount);
        Assert.NotEqual(SortieOutcome.Victory, session.Outcome);
        Assert.Single(session.RecentEvents,
            e => e.Type == SessionEventType.ArrestmentFailed);
        IncidentReplayClip clip = Assert.IsType<IncidentReplayClip>(
            session.IncidentReplay.FrozenClip);
        Assert.Contains(clip.Samples, sample =>
            sample.Recovery == Carrier.Recovery.ArrestmentFailed
            && sample.ArrestmentFailureReason
                == ArrestmentModel.ArrestmentFailureReason.RunoutExhausted
            && sample.ArrestmentInitialEnergyJ > sample.ArrestmentEffectiveCapacityJ
            && sample.ArrestmentAbsorbedEnergyJ > 0.0
            && sample.ArrestmentRemainingEnergyJ > 0.0
            && sample.ArrestmentInitialClosureMps
                > session.Arrestment.ResidualSpeedMps
            && sample.ArrestmentPeakLoadN <= sample.ArrestmentMaximumLineLoadN
            && sample.ArrestmentProfileId == "PROVISIONAL_KOREA_JET_V1");
    }
}
