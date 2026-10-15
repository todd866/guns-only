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
        Assert.Equal(0, balloon.LiftLossFraction);
        for (int i = 0; i < 120 * 120; i++) {
            balloon.Step(Dt);
            Assert.InRange(-balloon.Velocity.Y, 0, 2.0 + 1e-9);
        }
        Assert.InRange(-balloon.Velocity.Y, 0.5, 2.0);
        Assert.InRange(before.Y - balloon.Position.Y, 50, 240);
        Assert.True(balloon.RelayActive);
        Assert.InRange(balloon.LiftLossFraction, 0.5, 1.0);
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
        Assert.InRange(session.Player.State.Position.Y / 0.3048, 65_000, 70_000);
        Assert.False(session.Beat.StartsOnCatapult);
        Assert.False(session.OpponentPresent);
        Assert.True(mission.Definition.Dawn);
        Assert.True((mission.Balloons[0].GondolaPosition - session.Player.State.Position)
            .Dot(session.Player.State.ForwardDir()) > 0);
        Assert.Equal(4, session.RapierDogfightingDronesRemaining);
        Assert.Equal(MissionEconomicMode.RapierOperations, session.Beat.MissionIdentity.EconomicMode);
        Assert.Equal(RapierV2Design.FuelCapacityKg * 2.20462262,
            session.Beat.FuelLoadout.InitialFuelLb, 4);
        Assert.Equal(FlightModel.RapierPublicDataSurrogate.FuelFreeMassKg
            + RapierV2Design.FuelCapacityKg + 4 * FlightModel.RapierGunDroneSurrogate.MassKg,
            session.Player.State.Mass, 1);
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
        Assert.Equal(2, mission.KillRecords.Count);
        Assert.Equal(PathfinderFootprintClass.Populated, mission.KillRecords[1].Classification);
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

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void PathfinderSessionGunResolvesPhysicalKillAndRoeAtContact(bool blocked) {
        var original = Beats.RapierPathfinders();
        var wind = new LayeredWindField(new[] {
            new WindVectorLevel(0, Vec3D.Zero), new WindVectorLevel(25_000, Vec3D.Zero)
        });
        var weather = new WeatherProfile(StandardAtmosphere1976.Instance, wind);
        var definition = new PathfinderMissionDefinition(42,
            new[] { new PathfinderBalloonSpawn(1, new Vec3D(0, 20_600, 0)) },
            blocked ? new[] { Square(0, 0, 1000) } : Array.Empty<PathfinderPopulatedArea>(), weather);
        var gondola = new Vec3D(0, 20_600, 0) + PathfinderRelayCard.GondolaOffsetM;
        var player = original.Player with { Position = gondola + new Vec3D(0, 0, -100),
            // Default attitude asks AircraftSim for nose-up trim. This shot fixture instead
            // supplies an explicit body axis through the gondola, independent of flight trim.
            Chi = 0, Gamma = 0, BodyAttitude = QuaternionD.Identity };
        var session = new SimulationSession(beatIndex: 1);
        session.StartBeat(() => original with { Pathfinder = definition, Player = player });
        session.Begin();
        session.FeedKey(GKey.Trigger, true);
        for (int i = 0; i < 15; i++) session.Advance(Dt);
        session.FeedKey(GKey.Trigger, false);
        var mission = session.Pathfinder!;
        Assert.Equal(1, mission.RelaySectorsDenied);
        Assert.Equal(blocked ? 1 : 0, mission.RoeViolations);
        Assert.Equal(!blocked, mission.ContractEarned);
        Assert.Single(mission.KillRecords);
        Assert.InRange(mission.KillRecords[0].TimeSeconds, 0.001, mission.ElapsedSeconds);
        Assert.NotNull(mission.Balloons[0].Debris);
        Assert.Equal(RapierMissionPhase.Attack, session.RapierPhase);
        Assert.False(session.RapierGunDroneEgress);
        Assert.Equal(4, session.RapierDogfightingDronesRemaining);
        int rounds = session.PlayerGun.RoundsFired;
        session.FeedKey(GKey.Trigger, true);
        session.Advance(Dt);
        Assert.True(session.PlayerGun.RoundsFired > rounds);
        Assert.Equal(1, mission.SelectedBalloonId); // no automatic target hop
    }

    [Fact]
    public void PathfinderPilotRtbAndRestartKeepTheirAuthority() {
        var session = new SimulationSession(beatIndex: Beats.PathfinderBeatIndex);
        var initial = session.Pathfinder!.Balloons.Select(b => b.Position).ToArray();
        session.Begin();
        session.Advance(Dt);
        session.Pathfinder.Engage(1, PathfinderBalloonComponent.Gondola);
        session.FeedKey(GKey.KnockItOff, true);
        session.Advance(Dt);
        Assert.True(session.RapierPhase >= RapierMissionPhase.ReturnToBase);
        Assert.False(session.PlayerWeaponsAuthorized);
        session.Restart();
        Assert.Equal(initial, session.Pathfinder!.Balloons.Select(b => b.Position).ToArray());
        Assert.Equal(0, session.Pathfinder.RelaySectorsDenied);
        Assert.Equal(0, session.Pathfinder.RoeViolations);
        Assert.Empty(session.Pathfinder.KillRecords);
        Assert.Equal(0, session.PlayerGun.RoundsFired);
        Assert.False(session.TriggerDown);
    }

    [Fact]
    public void PathfinderSustainedEnvelopeFireNeverSplashesComponentOrPaysContract() {
        var mission = new PathfinderMission(PathfinderMissionDefinition.FirstLight());
        var balloon = mission.Balloons[0];
        var shooter = new AircraftState(balloon.Position + new Vec3D(0, 0, -100), 1000, 0, 0, 0, 1000);
        for (int i = 0; i < 120; i++) mission.Step(shooter, true, Dt);
        Assert.True(mission.Gun.DamageFor(balloon.EnvelopeTargetId).HitCount > 5);
        Assert.True(mission.Gun.DamageFor(balloon.EnvelopeTargetId).TargetAlive);
        Assert.True(balloon.RelayActive);
        Assert.Equal(0, mission.RelaySectorsDenied);
        Assert.False(mission.ContractEarned);
    }

    [Fact]
    public void PathfinderKillRecordsStayBoundedUnderRepeatedHits() {
        var first = PathfinderMissionDefinition.FirstLight();
        var definition = new PathfinderMissionDefinition(42,
            Enumerable.Range(1, 6).Select(id => new PathfinderBalloonSpawn(id, new Vec3D(id * 5000, 20_600, 0))),
            Array.Empty<PathfinderPopulatedArea>(), first.Weather);
        var mission = new PathfinderMission(definition);
        for (int repetition = 0; repetition < 10; repetition++)
            for (int id = 1; id <= 6; id++) mission.Engage(id, PathfinderBalloonComponent.Gondola);
        Assert.Equal(6, mission.KillRecords.Count);
        Assert.Equal(6, mission.SafeKills);
        Assert.Equal(6, mission.RelaySectorsDenied);
    }

    [Fact]
    public void PathfinderOptInLeavesLegacySphereAndSelectedKillFireLatchIntact() {
        var target = new AircraftState(new Vec3D(0, 20_000, 0), 0, 0, 0, 0, 1000);
        var shooter = new AircraftState(new Vec3D(4, 20_000, -100), 1000, 0, 0, 0, 1000);
        var gun = new GunKill(ammo: 20, hitsToKill: 1);
        for (int i = 0; i < 120; i++) gun.Step(true, shooter, target, Dt);
        Assert.Equal(FightOutcome.Splash, gun.Outcome);
        Assert.Equal(1, gun.RoundsFired);
    }

    static RapierEconomicSortieFacts Facts() => new(MissionEconomicMode.RapierOperations,
        true, RapierJobKind.Balloon, false, true, false, 100, 20, false,
        RapierServiceLifeEvidenceStatus.Partial);
}
