using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Turbulence;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests;

[Collection("snapshot-projection-statics")]
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
    public void PathfinderAirborneStartHasNoFalseWaveOffOrInletWarning() {
        var session = new SimulationSession(beatIndex: Beats.PathfinderBeatIndex);
        AssertBrowserStartFixture(session, "pathfinder_start.json");
        session.Begin();
        for (int tick = 0; tick < 3 * AircraftSim.TickHz; tick++) {
            session.Advance(Dt);
            Assert.False(session.WaveOffActive);
            Assert.False(session.Player.InletUnstarted);
            Assert.True(session.Player.InletFlowRecovery >= 0.90,
                $"t={tick * Dt:F3}: inlet {session.Player.InletFlowRecovery:F3}, alpha {session.Player.AngleOfAttackRad * 180 / Math.PI:F2}");
            // M3.6 spawn is already turbine-out. That is the quiet ram readout, not a banner.
            Assert.DoesNotContain("TURBINE OFFLINE", session.TransitionCue, StringComparison.Ordinal);
            Assert.DoesNotContain("RAM ONLY", session.TransitionCue, StringComparison.Ordinal);
        }
        AssertBrowserStartFixture(session, "pathfinder_three_seconds.json");
    }

    // The Node HUD checks consume these same live-sim fields. Updating a fixture never replaces
    // the physical assertions above. Match the repository's GUNS_UPDATE_FIXTURES convention.
    static void AssertBrowserStartFixture(SimulationSession session, string name) {
        using var document = JsonDocument.Parse(SnapshotProjection.BuildState(
            session, Carrier.DeckConfiguration.Axial, 0, 0, false, null));
        string[] fields = ["mode", "wave_off", "approach", "recovery_platform", "lso", "lso_severity",
            "rapier_mission_available", "rapier_inlet_recovery", "range_m", "pathfinder",
            "gun_muzzle_velocity_mps", "gun_max_flight_s"];
        var actual = new SortedDictionary<string, string>(StringComparer.Ordinal);
        foreach (string field in fields)
            if (document.RootElement.TryGetProperty(field, out var value)) actual[field] = value.GetRawText();
        actual["sample_seconds"] = JsonSerializer.Serialize(Math.Round(session.TimeSeconds, 4));
        string rendered = "{\n" + string.Join(",\n", actual.Select(pair => $"  \"{pair.Key}\": {pair.Value}")) + "\n}\n";
        string path = Path.Combine(TestRepository.Root, "web", "wwwroot", "render", "hud", "tests", "fixtures", name);
        if (System.Environment.GetEnvironmentVariable("GUNS_UPDATE_FIXTURES") == "1") {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, rendered);
        }
        Assert.Equal(File.ReadAllText(path), rendered);
    }

    [Fact]
    public void PathfinderApproachStillArmsARealWaveOffAfterTheHunt() {
        var session = new SimulationSession(beatIndex: Beats.PathfinderBeatIndex);
        session.Begin();
        session.Advance(Dt);
        Assert.False(session.WaveOffActive);
        // Move the same sortie into its strip's approach slot to exercise the later arming
        // transition, independently of flying the whole RTB route in this initialization test.
        var strip = session.Carrier!;
        var approach = new AircraftState(strip.LandingPoint(along: -1500, height: 90),
            75, -0.06, strip.LandingHeadingRad, 0, session.Player.State.Mass);
        var trimmed = new AircraftSim(approach, session.Beat.PlayerAir);
        session.Player.AdoptExternalKinematics(trimmed.State);
        session.Controls.ConfigureFor(session.Beat.PlayerAir, 0.6);
        session.Advance(Dt);
        Assert.True(session.Controls.ApproachMode);
        session.Controls.ConfigureFor(session.Beat.PlayerAir, session.Beat.PlayerAir.MaxThrustFraction);
        session.Advance(Dt);
        Assert.True(session.WaveOffActive);
    }

    [Fact]
    public void PathfinderFirstGondolaWindowArrivesWithinTwentySeconds() {
        var session = new SimulationSession(beatIndex: Beats.PathfinderBeatIndex);
        var mission = session.Pathfinder!;
        // Same 900 m effective ranging ceiling as the M61 HUD funnel, not a bigger hit volume.
        const double windowRangeM = 900;
        var relative = mission.Balloons[0].GondolaPosition - session.Player.State.Position;
        var closure = session.Player.State.VelocityVector() - mission.Balloons[0].Velocity;
        double timeAtSpawnMach = (relative.Length - windowRangeM) / closure.Length;
        Assert.InRange(timeAtSpawnMach, 15, 20);
        Assert.True((mission.Balloons[1].Position - mission.Balloons[0].Position).Length > 45_000);
        session.Begin();
        double firstWindowSeconds = double.NaN;
        for (int tick = 1; tick <= 20 * AircraftSim.TickHz; tick++) {
            session.Advance(Dt);
            if ((mission.Balloons[0].GondolaPosition - session.Player.State.Position).Length <= windowRangeM) {
                firstWindowSeconds = tick * Dt;
                break;
            }
        }
        Assert.InRange(firstWindowSeconds, 15, 20);
        AssertBrowserStartFixture(session, "pathfinder_first_window.json");
    }

    [Fact]
    public void PathfinderTargetSlotsSelectAuthoredRelayOrderIncludingDeniedRelay() {
        var session = new SimulationSession(beatIndex: Beats.PathfinderBeatIndex);
        var mission = Assert.IsType<PathfinderMission>(session.Pathfinder);
        Assert.True(session.SetPlayerGunTargetSlot(2));
        Assert.Equal(mission.Balloons[2].Id, mission.SelectedBalloonId);
        mission.Engage(mission.Balloons[2].Id, PathfinderBalloonComponent.Gondola);
        Assert.True(session.SetPlayerGunTargetSlot(2));
        Assert.Equal(mission.Balloons[2].Id, mission.SelectedBalloonId);
        Assert.False(session.SetPlayerGunTargetSlot(-1));
        Assert.False(session.SetPlayerGunTargetSlot(mission.Balloons.Count));
    }

    [Fact]
    public void PathfinderSnapshotPublishesGondolaTargetsAndRoeFootprint() {
        var session = new SimulationSession(beatIndex: Beats.PathfinderBeatIndex);
        using JsonDocument document = JsonDocument.Parse(
            SnapshotProjection.BuildState(session, Carrier.DeckConfiguration.Axial, 0, 0, false, null));
        JsonElement pathfinder = document.RootElement.GetProperty("pathfinder");
        Assert.Equal(3, pathfinder.GetProperty("relays").GetArrayLength());
        Assert.True(pathfinder.GetProperty("relays")[0]
            .TryGetProperty("gondola_position", out _));
        Assert.Equal("clear", pathfinder.GetProperty("selected_footprint")
            .GetProperty("classification").GetString());
        Assert.Equal(-1.2, pathfinder.GetProperty("sun_elevation_deg").GetDouble(), 1);
        Assert.True(document.RootElement.GetProperty("ammo").GetInt32() > 0);
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
