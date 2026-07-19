using System;
using GunsOnly.Sim;
using Xunit;

namespace GunsOnly.Sim.Tests;

public class CarrierRecoveryPhysicsTests {
    static Carrier Ship(Carrier.DeckConfiguration configuration = Carrier.DeckConfiguration.Axial) =>
        new(new Vec3D(0, 20, 0), headingRad: 0.0, speedMps: 3.0,
            deckAltM: 20.0, deckLengthM: 250.0, deckWidthM: 30.0,
            configuration: configuration);

    static AircraftState StateFromVelocity(Vec3D position, Vec3D velocity) {
        double speed = velocity.Length;
        var direction = velocity * (1.0 / speed);
        return new AircraftState(position, speed,
            Math.Asin(direction.Y), Math.Atan2(direction.X, direction.Z),
            Bank: 0.0, Mass: FlightModel.Sabre.MassKg);
    }

    static AircraftState Touchdown(Carrier ship, double sinkMps, double airspeedMps = 70.0,
        double? wheelAlongM = null, double crossM = 0.0) {
        double horizontalAir = Math.Sqrt(Math.Max(0.0,
            airspeedMps * airspeedMps - sinkMps * sinkMps));
        var airVelocity = ship.LandingFwd * horizontalAir + new Vec3D(0, -sinkMps, 0);
        var worldVelocity = airVelocity + ship.SteadyWindWorld;
        double along = wheelAlongM ?? ship.WireAlongM(3) + Carrier.HookToMainGearM;
        return StateFromVelocity(ship.LandingPoint(along, crossM), worldVelocity);
    }

    [Theory]
    [InlineData(Carrier.DeckConfiguration.Axial)]
    [InlineData(Carrier.DeckConfiguration.Angled)]
    public void WindTriangleMakesClosureDeckRelative(Carrier.DeckConfiguration configuration) {
        var ship = Ship(configuration);
        const double approachKts = 130.0;
        double approachMps = approachKts / 1.94384;
        var airState = new AircraftState(ship.LandingPoint(-1000, height: 58.0),
            approachMps, 0.0, ship.LandingHeadingRad, 0.0, FlightModel.Sabre.MassKg);
        var worldState = ship.ToWorldStateFromAir(airState, DetentLayer.OnSpeedAoARad);

        Assert.Equal(Carrier.WindOverDeckKts, Carrier.WindOverDeckMps * 1.94384, 10);
        Assert.Equal(approachMps, ship.AirspeedMps(worldState), 10);
        Assert.Equal(approachMps - Carrier.WindOverDeckMps,
            ship.DeckClosureMps(worldState), 10);
        Assert.InRange(ship.DeckClosureMps(worldState) * 1.94384, 99.99, 100.01);
        Assert.True(worldState.Speed < approachMps,
            "headwind plus ship motion must make earth groundspeed lower than approach airspeed");
    }

    [Fact]
    public void ExplicitIasOwnsApproachSlotGateWhileFallbackRetainsSteadyWod() {
        var ship = Ship();
        var airState = new AircraftState(ship.LandingPoint(-800.0, height: 46.0),
            70.0, -0.061, ship.LandingHeadingRad, 0.0, FlightModel.Sabre.MassKg);
        AircraftState worldState = ship.ToWorldStateFromAir(
            airState, DetentLayer.OnSpeedAoARad);

        Assert.True(ship.InApproachSlot(worldState));
        Assert.True(ship.InApproachSlot(worldState, indicatedAirspeedMps: 70.0));
        Assert.False(ship.InApproachSlot(worldState, indicatedAirspeedMps: 96.0));
        Assert.Equal(ship.InApproachSlot(worldState),
            ship.InApproachSlot(worldState, indicatedAirspeedMps: double.NaN));
    }

    [Fact]
    public void ExplicitIasOwnsTouchdownGradeButCannotEraseHookCapture() {
        var ship = Ship();
        var calm = DifficultyModel.ForLevel(0);
        AircraftState touchdown = Touchdown(ship, sinkMps: 3.6, airspeedMps: 70.0);

        Carrier.TouchdownResult fallback = ship.EvaluateRecovery(touchdown,
            DetentLayer.OnSpeedAoARad, calm);
        Carrier.TouchdownResult onSpeed = ship.EvaluateRecovery(touchdown,
            DetentLayer.OnSpeedAoARad, calm, indicatedAirspeedMps: 70.0);
        Carrier.TouchdownResult fast = ship.EvaluateRecovery(touchdown,
            DetentLayer.OnSpeedAoARad, calm, indicatedAirspeedMps: 84.0);

        Assert.Equal(AirData.IndicatedAirspeedMps(
            ship.AirspeedMps(touchdown), touchdown.Position.Y),
            fallback.IndicatedAirspeedMps, 10);
        Assert.Equal(70.0, onSpeed.IndicatedAirspeedMps, 10);
        Assert.Equal(Carrier.Recovery.Trap, onSpeed.Recovery);
        Assert.Equal(Carrier.TouchdownGrade.Ok, onSpeed.Grade);
        Assert.Equal(84.0, fast.IndicatedAirspeedMps, 10);
        Assert.Equal(Carrier.Recovery.Trap, fast.Recovery);
        Assert.Equal(Carrier.HookOutcome.Engaged, fast.Hook);
        Assert.Equal(Carrier.TouchdownGrade.NoGrade, fast.Grade);
        Assert.True(fast.Deviations.HasFlag(Carrier.TouchdownDeviation.Fast));
    }

    [Fact]
    public void AdaptiveTargetUsesIasNotGroundSpeedAndDoesNotGateCapture() {
        var ship = Ship();
        RecoveryDifficulty moderate = DifficultyModel.ForLevel(1);
        AircraftState touchdown = Touchdown(ship, sinkMps: 4.0, airspeedMps: 70.0);

        Assert.True(touchdown.Speed < moderate.MinTrapSpeedMps,
            "the carrier headwind must make this fixture's groundspeed fall below the airspeed gate");
        Assert.True(moderate.MeetsAdaptiveTarget(ship, touchdown),
            "fallback must reconstruct IAS from steady wind over deck");
        Assert.True(moderate.MeetsAdaptiveTarget(ship, touchdown,
            indicatedAirspeedMps: 70.0));
        Assert.False(moderate.MeetsAdaptiveTarget(ship, touchdown,
            indicatedAirspeedMps: 90.0));

        var outsideTarget = ship.EvaluateRecovery(touchdown,
            DetentLayer.OnSpeedAoARad, moderate, indicatedAirspeedMps: 90.0);
        Assert.Equal(Carrier.Recovery.Trap, outsideTarget.Recovery);
        Assert.Equal(Carrier.HookOutcome.Engaged, outsideTarget.Hook);
        Assert.True(outsideTarget.Deviations.HasFlag(
            Carrier.TouchdownDeviation.OutsideAdaptiveTarget));
    }

    [Fact]
    public void NoFlareSinkWindowDistinguishesSoftNominalHardAndBlownArrivals() {
        var ship = Ship();
        var calm = DifficultyModel.ForLevel(0);

        var flare = ship.EvaluateRecovery(Touchdown(ship, sinkMps: 1.2),
            DetentLayer.OnSpeedAoARad, calm);
        var soft = ship.EvaluateRecovery(Touchdown(ship, sinkMps: 2.7),
            DetentLayer.OnSpeedAoARad, calm);
        var nominal = ship.EvaluateRecovery(Touchdown(ship, sinkMps: 3.6),
            DetentLayer.OnSpeedAoARad, calm);
        var hard = ship.EvaluateRecovery(Touchdown(ship, sinkMps: 5.8),
            DetentLayer.OnSpeedAoARad, calm);
        var blown = ship.EvaluateRecovery(Touchdown(ship, sinkMps: 7.2),
            DetentLayer.OnSpeedAoARad, calm);

        Assert.Equal(Carrier.Recovery.Trap, flare.Recovery);
        Assert.Equal(Carrier.HookOutcome.Engaged, flare.Hook);
        Assert.Equal(Carrier.TouchdownQuality.Soft, flare.Quality);
        Assert.Equal(Carrier.TouchdownGrade.NoGrade, flare.Grade);
        Assert.Equal(Carrier.Recovery.Trap, soft.Recovery);
        Assert.Equal(Carrier.TouchdownQuality.Soft, soft.Quality);
        Assert.Equal(Carrier.TouchdownGrade.Fair, soft.Grade);
        Assert.Equal(Carrier.Recovery.Trap, nominal.Recovery);
        Assert.Equal(Carrier.TouchdownQuality.Nominal, nominal.Quality);
        Assert.Equal(Carrier.TouchdownGrade.Ok, nominal.Grade);
        Assert.Equal(Carrier.Recovery.Trap, hard.Recovery);
        Assert.Equal(Carrier.TouchdownQuality.Hard, hard.Quality);
        Assert.Equal(Carrier.TouchdownGrade.NoGrade, hard.Grade);
        Assert.Equal(Carrier.Recovery.HardLanding, blown.Recovery);
        Assert.Equal(Carrier.TouchdownQuality.Blown, blown.Quality);
        Assert.Equal(Carrier.TouchdownGrade.Cut, blown.Grade);
        Assert.Equal(Carrier.HookOutcome.Engaged, blown.Hook);
        Assert.Equal(3, blown.Wire);
    }

    [Fact]
    public void DebriefSelectsTheEarliestSafetyCriticalCorrection() {
        var ship = Ship();
        var calm = DifficultyModel.ForLevel(0);

        Carrier.TouchdownResult overloaded = ship.EvaluateRecovery(
            Touchdown(ship, sinkMps: 7.2, airspeedMps: 90.0, crossM: 10.0),
            DetentLayer.OnSpeedAoARad + 0.08, calm, indicatedAirspeedMps: 90.0);
        Carrier.TouchdownResult hard = ship.EvaluateRecovery(
            Touchdown(ship, sinkMps: 5.8), DetentLayer.OnSpeedAoARad, calm);
        Carrier.TouchdownResult flare = ship.EvaluateRecovery(
            Touchdown(ship, sinkMps: 1.2), DetentLayer.OnSpeedAoARad, calm);

        Assert.Equal(Carrier.TouchdownCorrection.WaveOffEarlier,
            overloaded.PrimaryCorrection);
        Assert.Equal(Carrier.TouchdownCorrection.AddPowerEarlier,
            hard.PrimaryCorrection);
        Assert.Equal(Carrier.TouchdownCorrection.FlyThroughNoFlare,
            flare.PrimaryCorrection);
    }

    [Fact]
    public void WireGeometryOwnsBolterWhilePoorGradeRemainsIndependent() {
        var ship = Ship(Carrier.DeckConfiguration.Angled);
        var calm = DifficultyModel.ForLevel(0);
        double inFlightWheelAlong = ship.WireAlongM(4) + Carrier.HookToMainGearM + 0.8;
        var inFlight = ship.EvaluateRecovery(
            Touchdown(ship, 3.6, wheelAlongM: inFlightWheelAlong),
            DetentLayer.OnSpeedAoARad, calm);
        var longMiss = ship.EvaluateRecovery(
            Touchdown(ship, 3.6, wheelAlongM: inFlightWheelAlong + 4.0),
            DetentLayer.OnSpeedAoARad, calm);
        var fast = ship.EvaluateRecovery(Touchdown(ship, 3.6, airspeedMps: 82.0),
            DetentLayer.OnSpeedAoARad - 0.06, calm);

        Assert.Equal(Carrier.Recovery.Bolter, inFlight.Recovery);
        Assert.Equal(Carrier.HookOutcome.InFlightEngagement, inFlight.Hook);
        Assert.Equal(Carrier.Recovery.Bolter, longMiss.Recovery);
        Assert.Equal(Carrier.HookOutcome.MissedWires, longMiss.Hook);
        Assert.Equal(Carrier.Recovery.Trap, fast.Recovery);
        Assert.Equal(Carrier.HookOutcome.Engaged, fast.Hook);
        Assert.Equal(Carrier.TouchdownGrade.NoGrade, fast.Grade);
        Assert.True(fast.Wire > 0);
    }

    [Fact]
    public void TouchdownAssessmentIsBitDeterministic() {
        var a = Ship(Carrier.DeckConfiguration.Angled);
        var b = Ship(Carrier.DeckConfiguration.Angled);
        var sa = Touchdown(a, 4.125, airspeedMps: 69.75, crossM: -1.25);
        var sb = Touchdown(b, 4.125, airspeedMps: 69.75, crossM: -1.25);

        var ra = a.EvaluateRecovery(sa, DetentLayer.OnSpeedAoARad + 0.004,
            DifficultyModel.ForLevel(0));
        var rb = b.EvaluateRecovery(sb, DetentLayer.OnSpeedAoARad + 0.004,
            DifficultyModel.ForLevel(0));

        Assert.Equal(ra, rb);
    }

    [Fact]
    public void HullDeckAndIslandAreSweptSolidVolumes() {
        var ship = Ship();

        Assert.Equal(Carrier.SolidCollision.FlightDeck,
            ship.SweptSolidCollision(ship.ShipPoint(-40.0, 0.0, 3.0),
                ship.ShipPoint(-40.0, 0.0, -0.5)));
        Assert.Equal(Carrier.SolidCollision.Hull,
            ship.SweptSolidCollision(ship.ShipPoint(0.0, 0.0, -10.0),
                ship.ShipPoint(40.0, 0.0, -10.0)));
        Assert.Equal(Carrier.SolidCollision.Island,
            ship.SweptSolidCollision(ship.ShipPoint(5.0, 10.7, 10.0),
                ship.ShipPoint(55.0, 10.7, 10.0)));
        Assert.Equal(Carrier.SolidCollision.None,
            ship.SweptSolidCollision(ship.ShipPoint(-80.0, 0.0, 12.0),
                ship.ShipPoint(80.0, 0.0, 12.0)));
    }

    [Fact]
    public void BolterFlyawayIsAboveDeckClimbingAndStillFast() {
        var ship = Ship();
        AircraftState contact = Touchdown(ship, sinkMps: 1.2);
        AircraftState flyaway = ship.BolterFlyawayState(contact);
        var (_, _, height) = ship.LandingFrame(flyaway.Position);

        Assert.Equal(1.5, height, 10);
        Assert.True(flyaway.Gamma > 0.0);
        Assert.InRange(ship.DeckClosureMps(flyaway), 54.99, 80.0);
        Assert.Equal(Carrier.Recovery.Flying, ship.Classify(flyaway));
    }

    [Fact]
    public void CatapultStrokeIsDeterministicAndHandsOffAirborne() {
        var shipA = Ship();
        var shipB = Ship();
        var a = new CatapultLaunchModel();
        var b = new CatapultLaunchModel();
        a.Begin(shipA, FlightModel.Sabre.MassKg);
        b.Begin(shipB, FlightModel.Sabre.MassKg);

        const double dt = 1.0 / AircraftSim.TickHz;
        int steps = 0;
        while (a.Phase == CatapultLaunchModel.LaunchPhase.Stroke && steps++ < 1000) {
            shipA.Step(dt);
            shipB.Step(dt);
            a.Step(shipA, dt);
            b.Step(shipB, dt);
            Assert.Equal(a.State, b.State);
        }

        Assert.Equal(CatapultLaunchModel.LaunchPhase.Airborne, a.Phase);
        Assert.Equal(a.State, b.State);
        Assert.Equal(CatapultLaunchModel.StrokeDistanceM, a.DistanceM, 10);
        Assert.True(a.State.Position.Y > shipA.Position.Y);
        Assert.True(a.State.Gamma > 0.0);
        Assert.True(shipA.AirspeedMps(a.State) > 75.0);
    }
}
