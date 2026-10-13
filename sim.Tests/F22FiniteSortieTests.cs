using GunsOnly.Sim.Doctrine;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests;

public class F22FiniteSortieTests {
    static AircraftState Close(double z, double speed, double chi, double mass) => new(
        new Vec3D(0.0, 5486.4, z), speed, 0.0, chi, 0.0, mass);

    static BeatSetup CappedFight() {
        BeatSetup source = Beats.ModernVisualMerge();
        return source with {
            Player = Close(0.0, 300.0, 0.0, source.PlayerAir.MassKg),
            Bandit = Close(160.0, 285.0, 0.0, source.BanditAir.MassKg),
            UsesNeutralMergeBandit = false,
            UsesReactiveBandit = false,
            VisualMergeEvaluation = null,
            Combat = source.CombatRules with { OpponentHitsToDefeat = 1 },
            ContinuousCombat = source.ContinuousCombat! with {
                ReplacementDelaySeconds = 0.2,
                MaximumFormationSize = 1,
            },
        };
    }

    static void FullStop(SimulationSession session) {
        session.FeedKey(GKey.GearToggle, true);
        session.FeedKey(GKey.GearToggle, false);
        for (int i = 0; i < 8 * AircraftSim.TickHz
            && !session.PlayerSystems.AllGearDownAndLocked; i++)
            session.StepFixed();
        Assert.True(session.PlayerSystems.AllGearDownAndLocked);
        var recovery = Assert.IsType<ConventionalRunwayRecoveryModel>(
            session.ConventionalRunwayRecovery);
        var runway = recovery.Runway;
        Vec3D velocity = runway.Forward * 74 + new Vec3D(0, -2.2, 0);
        session.Player.AdoptExternalKinematics(new AircraftState(
            runway.SurfacePoint(430) + new Vec3D(0, 1.85, 0), velocity.Length,
            Math.Asin(velocity.Y / velocity.Length), runway.HeadingRad, 0,
            session.Player.State.Mass,
            BodyAttitude: QuaternionD.FromFrame(
                runway.Right, new Vec3D(0, 1, 0), runway.Forward)));
        session.Controls.SetAnalogThrottleControl(0);
        for (int i = 0; i < 12_000
            && session.Lifecycle == SimulationSession.LifecycleState.Active; i++)
            session.StepFixed();
        Assert.Equal(RunwayRecoveryPhase.Recovered, recovery.Phase);
    }

    [Fact]
    public void NorthRunwayIsInsideTheStreamingRadius() {
        BeatSetup beat = Beats.ModernVisualMerge();
        ConventionalRunwayGeometry runway = Assert.IsType<ConventionalRunwayGeometry>(
            Assert.IsType<RecoveryPlan>(beat.RecoveryPlan).ConventionalRunway);
        double fromMergeM = Math.Sqrt(
            Math.Pow(runway.ThresholdPosition.X - beat.Player.Position.X, 2)
            + Math.Pow(runway.ThresholdPosition.Z - beat.Player.Position.Z, 2));
        Assert.InRange(fromMergeM, 8_000.0, 30_000.0);
        Assert.True(Math.Sqrt(
            runway.ThresholdPosition.X * runway.ThresholdPosition.X
            + runway.ThresholdPosition.Z * runway.ThresholdPosition.Z) < 48_000.0);
        Assert.True(Math.Sqrt(
            runway.FarEndPosition.X * runway.FarEndPosition.X
            + runway.FarEndPosition.Z * runway.FarEndPosition.Z) < 48_000.0);
        Assert.Equal(2, beat.ContinuousCombat!.MaximumEngagements);
        Assert.False(beat.CombatRules.PlayerInfiniteAmmo);
        Assert.Equal(480, beat.CombatRules.PlayerAmmo);
    }

    [Fact]
    public void RecoveredStopAfterTheCapIsVictory() {
        var session = new SimulationSession();
        session.StartBeat(CappedFight);
        session.Begin();
        session.FeedKey(GKey.Trigger, true);
        for (int i = 0; i < 40 * AircraftSim.TickHz && session.KillCount < 2; i++) {
            if (session.OpponentPresent && Geometry.Range(session.Player.State, session.Bandit.State) > 220.0) {
                AircraftState bandit = session.Bandit.State;
                AircraftState shooter = bandit with {
                    Position = bandit.Position - bandit.ForwardDir() * 140.0,
                    Speed = bandit.Speed + 20,
                };
                Assert.True(GunKill.TrySolveBallisticLead(shooter, bandit,
                    session.PlayerGun.Profile, out Vec3D lead, out _));
                Vec3D right = new Vec3D(0, 1, 0).Cross(lead).Normalized();
                session.Player.AdoptExternalKinematics(shooter with {
                    BodyAttitude = QuaternionD.FromFrame(right, lead.Cross(right), lead),
                });
            }
            session.StepFixed();
        }
        Assert.Equal(2, session.KillCount);
        session.FeedKey(GKey.Trigger, false);
        for (int i = 0; i < 4 * AircraftSim.TickHz && !session.PlayerRtbActive; i++)
            session.StepFixed();
        Assert.True(session.PlayerRtbActive);
        // The combat result exists before, and independently of, any landing.
        Assert.True(session.FiniteCombatComplete);
        Assert.Equal(2, session.FiniteEngagementCap);
        Assert.Equal(2, session.EngagementsWon);
        Assert.False(session.ConventionalRtbRecoveryCompleted);
        AssertMatchesBrowserFixture(session, "f22_combat_complete.json");
        FullStop(session);
        Assert.Equal(SortieOutcome.Victory, session.Outcome);
        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
        // Regression (loop audit #1): the recovered victory used to fail the Discontinued-only
        // completion check, so the browser told a landed pilot "Recovery incomplete".
        Assert.True(session.ConventionalRtbRecoveryCompleted);
        AssertMatchesBrowserFixture(session, "f22_recovered_victory.json");
    }

    // The JS debrief tests read these same fixtures, so a projection change that would make the
    // card lie fails here first. GUNS_UPDATE_FIXTURES=1 rewrites them from the live projection.
    static readonly string[] BrowserFixtureFields = [
        "mission_definition_id", "practice_exercise", "session_phase", "finished",
        "sortie_outcome", "rtb_reason", "combat_handoff_phase_name", "player_rtb_active",
        "runway_recovery_phase_name", "runway_recovery_complete", "runway_touchdown_contact",
        "runway_touchdown_survivable", "runway_touchdown_deviations", "kill_count",
        "combat_complete", "engagement_cap", "engagements_won", "sortie_rung",
        "sortie_opponent_skill", "sortie_opponent_mount", "sortie_opponent_count",
        "difficulty_rung", "earned_opponent_skill", "earned_opponent_mount",
        "earned_opponent_count",
    ];

    static void AssertMatchesBrowserFixture(SimulationSession session, string name) {
        string json = SnapshotProjection.BuildState(session, Carrier.DeckConfiguration.Angled,
            0.0, 0.0, false, null);
        using var document = System.Text.Json.JsonDocument.Parse(json);
        var root = document.RootElement;
        var actual = new SortedDictionary<string, string>(StringComparer.Ordinal);
        foreach (string field in BrowserFixtureFields)
            actual[field] = root.GetProperty(field).GetRawText();

        // The hot frame carries the recovery flag every frame; it must agree with the JSON.
        var buffer = new double[SnapshotHotFrame.SlotCount];
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        using var layout = System.Text.Json.JsonDocument.Parse(SnapshotHotFrame.LayoutJson());
        int slot = layout.RootElement.GetProperty("blocks").EnumerateArray()
            .SelectMany(block => block.GetProperty("slots").EnumerateArray())
            .Single(entry => entry.GetProperty("name").GetString() == "runway_recovery_complete")
            .GetProperty("index").GetInt32();
        Assert.Equal(root.GetProperty("runway_recovery_complete").GetBoolean() ? 1.0 : 0.0,
            buffer[slot]);

        string path = Path.Combine(TestRepository.Root,
            "web", "wwwroot", "render", "debrief", "tests", "fixtures", name);
        string rendered = "{\n" + string.Join(",\n",
            actual.Select(pair => $"  \"{pair.Key}\": {pair.Value}")) + "\n}\n";
        if (System.Environment.GetEnvironmentVariable("GUNS_UPDATE_FIXTURES") == "1") {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, rendered);
        }
        Assert.Equal(File.ReadAllText(path), rendered);
    }

    [Fact]
    public void BingoBeforeTheCapRecoversAsDiscontinued() {
        var session = new SimulationSession();
        session.StartBeat(CappedFight);
        session.Begin();
        Assert.Equal(0, session.KillCount);
        Assert.True(session.TryRequestReturnToBase(MissionRtbReason.BingoFuel));
        FullStop(session);
        Assert.Equal(SortieOutcome.Discontinued, session.Outcome);
    }

    [Fact]
    public void MagazineStopsAtFourHundredEightyRounds() {
        var profile = GunProfiles.M61A2PublicDataSurrogate;
        var gun = new GunKill(480, hitsToKill: 100_000,
            profile.EffectiveHitRadiusM, profile);
        var own = new AircraftState(Vec3D.Zero, 200.0, 0.0, 0.0, 0.0, 1.0);
        var target = new GunTarget(1, new AircraftState(
            new Vec3D(0, 0, 800), 200.0, 0.0, 0.0, 0.0, 1.0));
        GunTarget[] targets = [target];
        double dt = 1.0 / AircraftSim.TickHz;
        gun.Step(true, own, 1, targets, dt);
        int burst = gun.RoundsFired;
        Assert.InRange(burst, 1, 5);
        Assert.Equal(480 - burst, gun.AmmoRemaining);

        for (int i = 0; i < 8 * AircraftSim.TickHz; i++)
            gun.Step(true, own, 1, targets, dt);
        Assert.Equal(480, gun.RoundsFired);
        Assert.Equal(0, gun.AmmoRemaining);
        gun.Step(true, own, 1, targets, dt);
        Assert.Equal(480, gun.RoundsFired);
    }

    [Fact]
    public void OverheadSpeaksOnlyApprovedClipsInTheRealExchange() {
        // Pilot "initial", tower "left break approved", pilot "base, three greens" once locked.
        // The break and final legs are silent: every spoken line is an owner-approved recording.
        var director = new MissionRadioDirector();
        double clock = 0;
        director.Step(Overhead(clock, ""));
        var heard = new List<string>();
        // Published gates are the director's TARGET: ingress, then break once on initial.
        foreach (string gate in new[] { "pattern_ingress_0", "break", "downwind", "perch", "final" }) {
            for (int i = 0; i < 10; i++) {
                clock += 1;
                MissionRadioTransmission tx = director.Step(Overhead(clock, gate, gearDown: gate is "perch" or "final"));
                if (!string.IsNullOrEmpty(tx.Id) && (heard.Count == 0 || heard[^1] != tx.Id))
                    heard.Add(tx.Id);
            }
        }
        Assert.Equal(["pilot-initial", "tower-break-approved", "pilot-base"], heard);
    }

    [Fact]
    public void OverheadDoesNotReportThreeGreensWhileTheGearIsUp() {
        var director = new MissionRadioDirector();
        director.Step(Overhead(0, ""));
        for (int i = 0; i < 6; i++) {
            MissionRadioTransmission tx = director.Step(Overhead(3 + i, "perch", gearDown: false));
            Assert.NotEqual("pilot-base", tx.Id);
            Assert.DoesNotContain("three greens", tx.Text ?? "", StringComparison.OrdinalIgnoreCase);
        }
        MissionRadioTransmission locked = director.Step(Overhead(12, "perch", gearDown: true));
        for (int i = 0; i < 8 && locked.Id != "pilot-base"; i++)
            locked = director.Step(Overhead(13 + i, "perch", gearDown: true));
        Assert.Equal("pilot-base", locked.Id);
    }

    static MissionRadioState Overhead(double time, string gate, bool? gearDown = null) => new(
        TimeSeconds: time,
        MissionActive: true,
        RapierMissionAvailable: false,
        PatternOnly: false,
        RapierPhase: RapierMissionPhase.Unavailable,
        CatapultActive: false,
        PlayerLeg: "",
        Traffic: [],
        GearDownAndLocked: gearDown ?? gate is "perch" or "final",
        PlayerLandingIntent: CircuitLandingIntent.FullStop,
        LandingAuthorityAvailable: false,
        PilotGoingAround: false,
        RecoveryApproach: false,
        MaritimeRecovery: false,
        Recovery: Carrier.Recovery.Flying,
        ArrestmentPhase: ArrestmentModel.ArrestmentPhase.None,
        CaughtWire: 0,
        LsoCall: "",
        LsoSeverity: null,
        GunRoundsFired: 0,
        GunAmmoRemaining: 400,
        MissilesRemaining: 0,
        MissileInFlight: false,
        DronesRemaining: 0,
        Joker: false,
        Bingo: false,
        Events: [],
        ConventionalOverheadGate: gate);
}
