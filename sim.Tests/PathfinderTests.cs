using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim.Tests;

public sealed class PathfinderTests {
    const double Dt = 1.0 / 120.0;
    static readonly IWindField Wind = new LayeredWindField(new[] {
        new WindVectorLevel(0, new Vec3D(4, 0, 1)),
        new WindVectorLevel(25_000, new Vec3D(18, 0, -3))
    });

    static PathfinderRelayBalloon Balloon(uint seed = 42) =>
        new(1, new Vec3D(0, 20_600, 0), seed, Wind);

    static PathfinderPopulatedArea Square(double x, double z, double half = 100) =>
        new("town", new[] {
            new Vec3D(x - half, 0, z - half), new Vec3D(x + half, 0, z - half),
            new Vec3D(x + half, 0, z + half), new Vec3D(x - half, 0, z + half)
        });

    [Fact]
    public void PathfinderDriftReplaysExactlyAndSeedChangesDrift() {
        var a = Balloon();
        var b = Balloon();
        var other = Balloon(43);
        for (int i = 0; i < 1200; i++) {
            a.Step(Dt); b.Step(Dt); other.Step(Dt);
        }
        Assert.Equal(a.Position, b.Position);
        Assert.Equal(a.Velocity, b.Velocity);
        Assert.NotEqual(a.Position, other.Position);
        Assert.True(a.Position.X > 100);
        Assert.Equal(20_600, a.Position.Y, 6);
    }

    [Fact]
    public void PathfinderEnvelopeOnlyLeaksAndSinkConvergesWithinBounds() {
        var balloon = Balloon();
        var before = balloon.Position;
        for (int hit = 0; hit < 100; hit++)
            balloon.Hit(PathfinderBalloonComponent.Envelope);
        Assert.True(balloon.RelayActive);
        Assert.Null(balloon.Debris);
        Assert.Equal(before, balloon.Position);
        Assert.InRange(balloon.LeakFraction, 0.01, 1.0);
        for (int i = 0; i < 120 * 120; i++) {
            balloon.Step(Dt);
            Assert.InRange(-balloon.Velocity.Y, 0, 2.0 + 1e-9);
        }
        Assert.InRange(-balloon.Velocity.Y, 0.5, 2.0);
        Assert.InRange(before.Y - balloon.Position.Y, 50, 240);
        Assert.True(balloon.RelayActive);
    }

    [Fact]
    public void PathfinderGondolaKillDeniesRelayAndReleasesOnePhysicalDebrisObject() {
        var balloon = Balloon();
        var gondola = balloon.GondolaPosition;
        Assert.True(balloon.Hit(PathfinderBalloonComponent.Gondola));
        Assert.False(balloon.RelayActive);
        var debris = Assert.IsType<PathfinderDebris>(balloon.Debris);
        Assert.Equal(gondola, debris.Position);
        Assert.False(balloon.Hit(PathfinderBalloonComponent.Gondola));
        Assert.Same(debris, balloon.Debris);
        balloon.Step(1);
        Assert.True(debris.Position.Y < gondola.Y);
        Assert.True(debris.Position.X > gondola.X);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void PathfinderSweptGunHitsCorrectComponentWithoutGiantGondolaSphere(bool aimAtGondola) {
        var balloon = Balloon();
        var aim = aimAtGondola ? balloon.GondolaPosition : balloon.Position;
        var shooter = new AircraftState(aim + new Vec3D(0, 0, -100), 1000, 0, 0, 0, 1000);
        var gun = new GunKill(ammo: 1, hitsToKill: 1, profile: GunProfiles.M61A2PublicDataSurrogate);
        for (int i = 0; i < 20; i++) {
            gun.Step(i == 0, shooter, balloon.GondolaTargetId, balloon.GunTargets(), Dt);
            foreach (var impact in gun.ImpactsThisStep)
                balloon.Hit(impact.TargetId == balloon.EnvelopeTargetId
                    ? PathfinderBalloonComponent.Envelope : PathfinderBalloonComponent.Gondola);
        }
        Assert.Equal(!aimAtGondola, balloon.RelayActive);
        Assert.Equal(aimAtGondola, balloon.Debris is not null);
        Assert.Equal(!aimAtGondola, balloon.LeakFraction > 0);
    }

    [Fact]
    public void PathfinderGondolaNearMissOutsideBoxDoesNotKill() {
        var balloon = Balloon();
        var shooter = new AircraftState(balloon.GondolaPosition + new Vec3D(4, 0, -100),
            1000, 0, 0, 0, 1000);
        var gun = new GunKill(ammo: 1, hitsToKill: 1, profile: GunProfiles.M61A2PublicDataSurrogate);
        for (int i = 0; i < 20; i++)
            gun.Step(i == 0, shooter, balloon.GondolaTargetId, balloon.GunTargets(), Dt);
        Assert.Equal(0, gun.TotalHitCount);
    }

    [Theory]
    [InlineData(0, 0, 1, PathfinderFootprintClass.Populated)]
    [InlineData(150, 0, 50, PathfinderFootprintClass.Populated)]
    [InlineData(150.01, 0, 50, PathfinderFootprintClass.Clear)]
    [InlineData(0, 0, 500, PathfinderFootprintClass.Populated)]
    [InlineData(300, 300, 10, PathfinderFootprintClass.Clear)]
    public void PathfinderFootprintClassificationIncludesContainmentEdgesAndTangency(
        double x, double z, double radius, PathfinderFootprintClass expected) {
        var footprint = new PathfinderFootprint(new Vec3D(x, 0, z), radius, 100);
        Assert.Equal(expected, footprint.Classify(new[] { Square(0, 0) }));
    }

    [Fact]
    public void PathfinderUnknownFootprintNeverClears() {
        var footprint = new PathfinderFootprint(new Vec3D(double.NaN, 0, 0), 100, 100);
        Assert.Equal(PathfinderFootprintClass.Unknown, footprint.Classify(Array.Empty<PathfinderPopulatedArea>()));
    }

    [Fact]
    public void PathfinderPredictionUsesWindAndCurrentAltitudeAndContainsActualLanding() {
        var balloon = Balloon();
        var predicted = balloon.PredictFootprint();
        Assert.True(predicted.Centre.X > balloon.Position.X + 1000);
        var area = Square(predicted.Centre.X, predicted.Centre.Z);
        Assert.Equal(PathfinderFootprintClass.Populated, predicted.Classify(new[] { area }));
        Assert.Equal(PathfinderFootprintClass.Clear,
            new PathfinderFootprint(balloon.GondolaPosition with { Y = 0 }, 1, 1).Classify(new[] { area }));
        balloon.Hit(PathfinderBalloonComponent.Gondola);
        for (int i = 0; i < 120 * 900 && !balloon.Debris!.Landed; i++) balloon.Step(Dt);
        var debris = balloon.Debris!;
        Assert.True(debris.Landed);
        Assert.InRange((debris.Position - predicted.Centre).Length, 0, predicted.RadiusM);
        var lower = new PathfinderRelayBalloon(1, new Vec3D(0, 10_000, 0), 42, Wind);
        Assert.True(lower.PredictFootprint().FallSeconds < predicted.FallSeconds);
    }

    [Fact]
    public void PathfinderMissionBootsAirborneAtDawnWithThreeRelaysAndCanonicalStores() {
        var session = new SimulationSession(beatIndex: Beats.PathfinderBeatIndex);
        var mission = Assert.IsType<PathfinderMission>(session.Pathfinder);
        Assert.Equal(3, mission.Balloons.Count);
        Assert.All(mission.Balloons, b => Assert.True(b.RelayActive));
        Assert.InRange(session.PlayerState.Position.Y / 0.3048, 65_000, 70_000);
        Assert.False(session.Beat.StartsOnCatapult);
        Assert.False(session.OpponentPresent);
        Assert.True(mission.Definition.Dawn);
        Assert.True((mission.Balloons[0].GondolaPosition - session.PlayerState.Position)
            .Dot(session.PlayerState.ForwardDir()) > 0);
        Assert.Equal(4, session.RapierDogfightingDronesRemaining);
        Assert.Equal(MissionEconomicMode.RapierOperations, session.Beat.MissionIdentity.EconomicMode);
        Assert.Equal(RapierV2Design.FuelCapacityKg * 2.20462262,
            session.Beat.FuelLoadout.InitialFuelLb, 4);
        Assert.Equal(FlightModel.RapierPublicDataSurrogate.FuelFreeMassKg
            + RapierV2Design.FuelCapacityKg + 4 * FlightModel.RapierGunDroneSurrogate.MassKg,
            session.PlayerState.Mass, 1);
        session.Begin();
        session.Advance(Dt);
        Assert.Equal(RapierMissionPhase.Attack, session.RapierPhase);
        Assert.False(session.RapierBalloonReactionActive);
        Assert.True(session.Pathfinder!.ElapsedSeconds > 0);
    }

    [Fact]
    public void PathfinderRoeViolationKeepsPhysicalDenialButSuppressesWholeContract() {
        var mission = new PathfinderMission(PathfinderMissionDefinition.FirstLight(42));
        Assert.Equal(new[] { PathfinderFootprintClass.Clear, PathfinderFootprintClass.Clear,
            PathfinderFootprintClass.Populated }, mission.Balloons.Select(mission.ClassifyKill).ToArray());
        var safe = mission.Engage(1, PathfinderBalloonComponent.Gondola);
        Assert.True(safe.KillRewardEligible);
        Assert.True(mission.ContractEarned);
        var unsafeKill = mission.Engage(3, PathfinderBalloonComponent.Gondola);
        Assert.False(unsafeKill.KillRewardEligible);
        Assert.Equal(2, mission.RelaySectorsDenied);
        Assert.Equal(1, mission.RoeViolations);
        Assert.False(mission.ContractEarned);
        Assert.DoesNotContain(mission.EvaluateEconomy(Facts()).Lines, line => line.Category == "CONTRACT");
        mission.Engage(3, PathfinderBalloonComponent.Gondola);
        Assert.Equal(1, mission.RoeViolations);
    }

    [Fact]
    public void PathfinderQuotaPaysOneNinetyCreditContractAndEnvelopePaysNothing() {
        var mission = new PathfinderMission(PathfinderMissionDefinition.FirstLight(42));
        mission.Engage(1, PathfinderBalloonComponent.Envelope);
        Assert.False(mission.ContractEarned);
        mission.Engage(1, PathfinderBalloonComponent.Gondola);
        mission.Engage(2, PathfinderBalloonComponent.Gondola);
        var line = Assert.Single(mission.EvaluateEconomy(Facts()).Lines, l => l.Category == "CONTRACT");
        Assert.Equal(90, line.Credits);
    }

    [Fact]
    public void PathfinderGalleryAndOptionalFullSortieRemainSeparate() {
        var gallery = Beats.BuiltIn(12);
        Assert.Null(gallery.Pathfinder);
        Assert.True(gallery.StartsOnCatapult);
        Assert.Equal(56, gallery.CombatRules.PlayerTargetHitRadiusM);
        Assert.Equal(MissionEconomicMode.Arcade, gallery.MissionIdentity.EconomicMode);
        Assert.True(Beats.RapierPathfinders(fullSortie: true).StartsOnCatapult);
    }

    static RapierEconomicSortieFacts Facts() => new(MissionEconomicMode.RapierOperations,
        true, RapierJobKind.Balloon, false, true, false, 100, 20, false,
        RapierServiceLifeEvidenceStatus.Partial);
}
