using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Web;
using Xunit;

namespace GunsOnly.Sim.Tests;

public class DifficultyRampTests {
    static EngagementReport Report(
        int number,
        SortieOutcome outcome,
        int hitsScored = 0,
        int hitsTaken = 0,
        double solutionSeconds = 0.0,
        double timeToFirstHit = double.NaN,
        int gunKills = 0) => new(
            number,
            PilotSkill.Competent,
            OpponentWasBoss: false,
            outcome,
            DurationSeconds: 30.0,
            SolutionSecondsConceded: solutionSeconds,
            HitsTaken: hitsTaken,
            ShotsTotal: 4,
            ShotsInWindow: 4,
            Overshoots: 0,
            MinimumEnergyKias: 340.0,
            GcasActivations: 0,
            HitsScored: hitsScored,
            TimeToFirstHitSeconds: timeToFirstHit,
            GunKills: gunKills);

    static void Observe(FightDirector director, EngagementReport report) =>
        director.Observe(in report);

    [Fact]
    public void EmptyDirectorOpensAtTheUnprovenRung() {
        var director = new FightDirector();
        SpawnSpec first = director.NextSpawn(1);
        SpawnSpec again = director.NextSpawn(1);
        Assert.Equal(first, again);
        Assert.Equal(PilotSkill.Competent, first.Skill);
        Assert.Equal(BanditMount.Baseline, first.Mount);
        Assert.Equal(1, first.FormationSize);
        Assert.True(first.Sparring);
        Assert.NotEqual(PilotSkill.Ace, first.Skill);
    }

    [Fact]
    public void AHitThenADefeatPromotesAndASecondKillEarnsThePair() {
        var director = new FightDirector();
        EngagementReport hit = Report(1, SortieOutcome.Defeat, hitsScored: 1, hitsTaken: 2);
        director.Observe(in hit);
        SpawnSpec veteran = director.NextSpawn(2);
        Assert.Equal(PilotSkill.Veteran, veteran.Skill);
        Assert.False(veteran.Sparring);
        Assert.Equal(1, veteran.FormationSize);

        EngagementReport kill = Report(2, SortieOutcome.Victory, hitsScored: 1, hitsTaken: 1,
            solutionSeconds: 2.0, gunKills: 1);
        director.Observe(in kill);
        SpawnSpec ace = director.NextSpawn(3);
        Assert.Equal(PilotSkill.Ace, ace.Skill);
        Assert.Equal(BanditMount.Baseline, ace.Mount);
        Assert.Equal(1, ace.FormationSize);

        EngagementReport second = Report(3, SortieOutcome.Victory, hitsScored: 1, hitsTaken: 1,
            solutionSeconds: 2.0, gunKills: 1);
        director.Observe(in second);
        SpawnSpec pair = director.NextSpawn(4);
        Assert.Equal(3, director.Rung);
        Assert.Equal(PilotSkill.Ace, pair.Skill);
        Assert.Equal(BanditMount.Uprated, pair.Mount);
        Assert.Equal(2, pair.FormationSize);
        Assert.False(pair.Sparring);
    }

    [Fact]
    public void AWalkoverOnTheEarnedAceAlsoFieldsThePair() {
        var director = new FightDirector();
        EngagementReport kill = Report(1, SortieOutcome.Victory, hitsScored: 1, hitsTaken: 1,
            solutionSeconds: 2.0, gunKills: 1);
        director.Observe(in kill);
        Assert.Equal(2, director.Rung);
        EngagementReport walkover = Report(2, SortieOutcome.Victory, hitsScored: 1, gunKills: 1);
        director.Observe(in walkover);
        SpawnSpec pair = director.NextSpawn(3);
        Assert.Equal(3, director.Rung);
        Assert.Equal(2, pair.FormationSize);
        Assert.Equal(BanditMount.Uprated, pair.Mount);
    }

    [Fact]
    public void TwoHitlessDefeatsDropOneRungAndAHitDoesNot() {
        var director = new FightDirector();
        Observe(director, Report(1, SortieOutcome.Victory, hitsScored: 2, gunKills: 1));
        Observe(director, Report(2, SortieOutcome.Victory, hitsScored: 1, hitsTaken: 1,
            solutionSeconds: 2.0, gunKills: 1));
        Assert.Equal(3, director.Rung);

        Observe(director, Report(3, SortieOutcome.Defeat, hitsScored: 1, hitsTaken: 3));
        Assert.Equal(3, director.Rung);

        Observe(director, Report(4, SortieOutcome.Defeat));
        Assert.Equal(3, director.Rung);
        Observe(director, Report(5, SortieOutcome.Defeat));
        Assert.Equal(2, director.Rung);
        Assert.Equal(1, director.NextSpawn(6).FormationSize);
    }

    [Fact]
    public void AbandoningWithoutAnObservationLeavesTheColdRung() {
        var director = new FightDirector();
        string before = director.ExportState();
        var next = new FightDirector();
        Assert.True(next.TryImportState(before));
        SpawnSpec spawn = next.NextSpawn(1);
        Assert.Equal(0, next.Rung);
        Assert.Equal(PilotSkill.Competent, spawn.Skill);
        Assert.NotEqual(PilotSkill.Ace, spawn.Skill);
    }

    [Fact]
    public void AStoredKillOpensAtRungTwoEvenOnTheFirstEngagement() {
        var director = new FightDirector();
        Observe(director, Report(1, SortieOutcome.Victory, hitsScored: 1,
            timeToFirstHit: 12.5, gunKills: 1));
        string blob = director.ExportState();
        var restored = new FightDirector();
        Assert.True(restored.TryImportState(blob));
        SpawnSpec opening = restored.NextSpawn(1);
        Assert.Equal(2, restored.Rung);
        Assert.Equal(PilotSkill.Ace, opening.Skill);
        Assert.Equal(1, opening.FormationSize);
        Assert.Equal(12.5, restored.TimeToFirstHitSeconds);
    }

    [Fact]
    public void AStoredRungThreeOpensOnThePair() {
        var director = new FightDirector();
        Observe(director, Report(1, SortieOutcome.Victory, hitsScored: 1, gunKills: 1));
        Observe(director, Report(2, SortieOutcome.Victory, hitsScored: 1, gunKills: 1));
        var restored = new FightDirector();
        Assert.True(restored.TryImportState(director.ExportState()));
        SpawnSpec opening = restored.NextSpawn(1);
        Assert.Equal(3, restored.Rung);
        Assert.Equal(2, opening.FormationSize);
        Assert.Equal(BanditMount.Uprated, opening.Mount);
    }

    [Fact]
    public void ACorruptBlobDoesNotChangeStateAndALegacyBlobOpensAtRungZero() {
        var director = new FightDirector();
        Observe(director, Report(1, SortieOutcome.Victory, hitsScored: 1, gunKills: 1));
        string intact = director.ExportState();
        Assert.False(director.TryImportState("v2|nope"));
        Assert.False(director.TryImportState("v9|3|1|1|0|-|0|0|0|0|0|0|0|0|0|0|0|1|1|1"));
        Assert.Equal(intact, director.ExportState());
        Assert.Equal(2, director.Rung);

        Assert.True(director.TryImportState(
            "v1|1|1|1|0|0|0.0|0|0|0|0|0|0|0|0"));
        Assert.Equal(0, director.Rung);
        Assert.Equal(PilotSkill.Competent, director.NextSpawn(1).Skill);
    }

    [Fact]
    public void RoundTripAgreesAndPitchAssistFadesByRung() {
        var director = new FightDirector();
        Assert.Equal(1.0, director.PitchAssist.GainScale);
        Assert.Equal(3.5, FlightModel.F22APublicDataSurrogate.GunneryPitchAssistMaxCorrectionG
            * director.PitchAssist.CorrectionScale, 3);
        Assert.True(director.PitchAssist.Active);

        Observe(director, Report(1, SortieOutcome.Defeat, hitsScored: 1));
        Assert.Equal(0.5, director.PitchAssist.GainScale);
        Assert.Equal(1.75, FlightModel.F22APublicDataSurrogate.GunneryPitchAssistMaxCorrectionG
            * director.PitchAssist.CorrectionScale, 3);

        Observe(director, Report(2, SortieOutcome.Victory, hitsScored: 1, gunKills: 1));
        Assert.False(director.PitchAssist.Active);
        Assert.Equal(0.0, director.PitchAssist.CorrectionScale);

        var copy = new FightDirector();
        Assert.True(copy.TryImportState(director.ExportState()));
        Assert.Equal(director.ExportState(), copy.ExportState());
        Assert.False(copy.PitchAssist.Active);
    }

    [Fact]
    public void AssistIsInactiveWhenTheRungTurnsItOff() {
        AircraftParams air = FlightModel.F22APublicDataSurrogate with {
            GunneryPitchAssistGainPerSecond = 0.0,
            GunneryPitchAssistMaxCorrectionG = 0.0,
        };
        var state = new AircraftState(new Vec3D(0.0, 3000.0, 0.0), 250.0,
            0.0, 0.0, 0.0, air.MassKg);
        var aircraft = new AircraftSim(state, air);
        GunneryPitchAssistResult result = GunneryPitchAssist.Apply(
            new PilotCommand(1.0, 0.0, 0.9, 0.0),
            state, air, 250.0, aircraft.AtmosphereModel,
            new Vec3D(0.0, 0.05, 1.0), hasBallisticLead: true,
            rangeM: 600.0, enabled: true);
        Assert.False(result.State.Active);
    }

    [Fact]
    public void ASolutionBeyondRoundLifeIsRefused() {
        GunProfile gun = GunProfiles.M61A2PublicDataSurrogate;
        double beyond = gun.MuzzleVelocityMps * gun.MaximumFlightSeconds + 100.0;
        var shooter = new AircraftState(Vec3D.Zero, 200.0, 0.0, 0.0, 0.0, 1000.0);
        var far = shooter with { Position = new Vec3D(0.0, 0.0, beyond) };
        GunBallisticSolution refused = GunKill.EvaluateBallisticLead(
            shooter, far, gun, gun.EffectiveHitRadiusM);
        Assert.False(refused.HasLeadSolution);
        Assert.False(refused.BodyAxisOnSolution);

        var near = shooter with { Position = new Vec3D(0.0, 0.0, 500.0) };
        GunBallisticSolution accepted = GunKill.EvaluateBallisticLead(
            shooter, near, gun, gun.EffectiveHitRadiusM);
        Assert.True(accepted.HasLeadSolution);
    }

    [Fact]
    public void RoundsFiredBeyondRoundLifeDoNotHitAndACloseBurstDoes() {
        GunProfile gun = GunProfiles.M61A2PublicDataSurrogate;
        var farGun = new GunKill(40, 3, gun.EffectiveHitRadiusM, gun);
        AircraftState shooter = new(Vec3D.Zero, 250.0, 0.0, 0.0, 0.0,
            FlightModel.F22APublicDataSurrogate.MassKg);
        double beyond = gun.MuzzleVelocityMps * gun.MaximumFlightSeconds + 200.0;
        AircraftState farTarget = shooter with { Position = new Vec3D(0.0, 0.0, beyond) };
        const long id = 1;
        var farTargets = new[] { new GunTarget(id, farTarget) };
        for (int i = 0; i < 240; i++)
            farGun.Step(true, shooter, id, farTargets, 1.0 / 120.0);
        Assert.Equal(0, farGun.TotalHitCount);

        var nearGun = new GunKill(80, 3, gun.EffectiveHitRadiusM, gun);
        AircraftState nearTarget = shooter with { Position = new Vec3D(0.0, 0.0, 500.0) };
        var nearTargets = new[] { new GunTarget(id, nearTarget) };
        for (int i = 0; i < 240; i++)
            nearGun.Step(true, shooter, id, nearTargets, 1.0 / 120.0);
        Assert.True(nearGun.TotalHitCount > 0);

        var director = new FightDirector();
        Observe(director, Report(1, SortieOutcome.Defeat, hitsScored: nearGun.TotalHitCount,
            hitsTaken: 1));
        Assert.Equal(PilotSkill.Veteran, director.NextSpawn(2).Skill);
    }

    [Fact]
    public void AutoGcasStaysAvailableAtRungZeroAndRungThree() {
        var cold = new SimulationSession();
        cold.StartBeat(() => Beats.ModernVisualMerge());
        Assert.True(cold.PlayerAutoGcasCapability.Available);
        Assert.Equal(0, cold.DifficultyRung);

        var earned = new SimulationSession();
        var director = new FightDirector();
        Observe(director, Report(1, SortieOutcome.Victory, hitsScored: 1, gunKills: 1));
        Observe(director, Report(2, SortieOutcome.Victory, hitsScored: 1, gunKills: 1));
        earned.ArmDirectorStateForNextStage(director.ExportState());
        earned.StartBeat(() => Beats.ModernVisualMerge());
        Assert.True(earned.PlayerAutoGcasCapability.Available);
        Assert.Equal(3, earned.DifficultyRung);
        Assert.Contains("\"difficulty_rung\":3", SnapshotOf(earned));
    }

    static string SnapshotOf(SimulationSession session) =>
        SnapshotProjection.BuildState(
            session, Carrier.DeckConfiguration.Axial, 0.0, 0.0, false, null);

    static double SlantRangeM(Vec3D a, Vec3D b) {
        double dx = a.X - b.X, dy = a.Y - b.Y, dz = a.Z - b.Z;
        return Math.Sqrt(dx * dx + dy * dy + dz * dz);
    }

    [Fact]
    public void MenuFlyAndTheValleyOpenPresentAtAboutAKilometre() {
        // ?menu=1 skips the valley and Fly calls WebBridge.StartBeat: weather for the
        // beat, the angled deck the bridge is constructed with, then built-in 7.
        var session = new SimulationSession();
        session.StartBeatWithEnvironment(
            7,
            KoreaWeatherPresets.ForBeat(7),
            terrain: null,
            Carrier.DeckConfiguration.Angled);
        Assert.Equal(0, session.DifficultyRung);
        var opening = Assert.IsType<NeutralMergeBandit>(session.Bandit);
        Assert.Equal(PilotSkill.Competent, opening.Skill);
        Assert.True(opening.Presenting);
        Assert.InRange(
            SlantRangeM(session.Player.State.Position, opening.State.Position),
            900.0, 1_100.0);
        Assert.Contains("\"difficulty_rung\":0", SnapshotOf(session));

        // The valley door is WebBridge.StartFirstRunValley: the first-run factory and
        // beat-13 weather. The contact is a kilometre past the pop-out, and it is Present.
        var valley = new SimulationSession();
        valley.StartBeatWithEnvironment(
            Beats.ModernVisualMergeFirstRun,
            KoreaWeatherPresets.ForBeat(13),
            terrain: null);
        var parked = Assert.IsType<NeutralMergeBandit>(valley.Bandit);
        Assert.True(parked.Presenting);
        var gate = new Vec3D(
            parked.State.Position.X,
            parked.State.Position.Y,
            FirstRunValleyRuntime.PopOutNorthM);
        Assert.InRange(SlantRangeM(gate, parked.State.Position), 900.0, 1_100.0);
    }

    [Fact]
    public void AnAssistedBeatKeepsAuthoredGainsAfterAStoredRung3Blob() {
        var cold = new SimulationSession();
        cold.StartBeat(AssistedRapier);
        AircraftParams coldLaw = cold.GunneryPitchAssistAir();
        Assert.Equal(2.2, coldLaw.GunneryPitchAssistGainPerSecond, 6);
        Assert.Equal(2.5, coldLaw.GunneryPitchAssistMaxCorrectionG, 6);

        var director = new FightDirector();
        Observe(director, Report(1, SortieOutcome.Victory, hitsScored: 1, gunKills: 1));
        Observe(director, Report(2, SortieOutcome.Victory, hitsScored: 1, gunKills: 1));
        Assert.Equal(3, director.Rung);
        Assert.False(director.PitchAssist.Active);

        var armed = new SimulationSession();
        armed.ArmDirectorStateForNextStage(director.ExportState());
        armed.StartBeat(AssistedRapier);
        Assert.Equal(0, armed.DifficultyRung);
        AircraftParams armedLaw = armed.GunneryPitchAssistAir();
        Assert.Equal(coldLaw.GunneryPitchAssistGainPerSecond,
            armedLaw.GunneryPitchAssistGainPerSecond, 6);
        Assert.Equal(coldLaw.GunneryPitchAssistMaxCorrectionG,
            armedLaw.GunneryPitchAssistMaxCorrectionG, 6);

        var topGun = new SimulationSession();
        topGun.ArmDirectorStateForNextStage(director.ExportState());
        topGun.StartBeat(() => Beats.TopGunAcm(TopGunSeat.F14A));
        Assert.Equal(0, topGun.DifficultyRung);
        Assert.Equal(
            FlightModel.F14APublicDataSurrogate.GunneryPitchAssistGainPerSecond,
            topGun.GunneryPitchAssistAir().GunneryPitchAssistGainPerSecond, 6);
        Assert.Equal(
            FlightModel.F14APublicDataSurrogate.GunneryPitchAssistMaxCorrectionG,
            topGun.GunneryPitchAssistAir().GunneryPitchAssistMaxCorrectionG, 6);

        armed.Begin();
        armed.FeedKey(GKey.Trigger, true);
        for (int i = 0; i < 40 * AircraftSim.TickHz && armed.KillCount < 1; i++) {
            if (armed.OpponentPresent
                && armed.Bandit.State.Position.Z - armed.Player.State.Position.Z > 200.0) {
                AircraftState bandit = armed.Bandit.State;
                armed.Player.AdoptExternalKinematics(bandit with {
                    Position = bandit.Position + new Vec3D(0, 0, -80),
                    Speed = bandit.Speed + 15,
                    Chi = bandit.Chi,
                });
            }
            armed.StepFixed();
        }
        armed.FeedKey(GKey.Trigger, false);
        Assert.Equal(1, armed.KillCount);
        Assert.Equal(0, armed.DifficultyRung);
        armed.Restart();
        AircraftParams afterRestart = armed.GunneryPitchAssistAir();
        Assert.Equal(coldLaw.GunneryPitchAssistGainPerSecond,
            afterRestart.GunneryPitchAssistGainPerSecond, 6);
        Assert.Equal(coldLaw.GunneryPitchAssistMaxCorrectionG,
            afterRestart.GunneryPitchAssistMaxCorrectionG, 6);
    }

    static BeatSetup AssistedRapier() {
        BeatSetup perch = Beats.Perch();
        AircraftParams rapier = FlightModel.RapierPublicDataSurrogate;
        AircraftState player = new(
            new Vec3D(0.0, 5486.4, 0.0), 250.0, 0.0, 0.0, 0.0, rapier.MassKg);
        AircraftState bandit = new(
            new Vec3D(0.0, 5526.4, 600.0), 240.0, 0.0, 0.0, 0.0,
            perch.BanditAir.MassKg);
        return perch with {
            Name = "Rapier assist witness",
            Player = player,
            Bandit = bandit,
            PlayerParams = rapier,
            UsesNeutralMergeBandit = false,
            UsesReactiveBandit = false,
            Combat = perch.CombatRules with { OpponentHitsToDefeat = 1 },
        };
    }

    [Fact]
    public void AVictoryWithoutAGunKillDoesNotPromote() {
        var director = new FightDirector();
        Observe(director, Report(1, SortieOutcome.Victory));
        Assert.Equal(0, director.Rung);
        Assert.Equal(0, director.Kills);
        SpawnSpec next = director.NextSpawn(2);
        Assert.Equal(PilotSkill.Competent, next.Skill);
        Assert.True(next.Sparring);
    }

    [Fact]
    public void TwoGunKillsOpenTheNextSortieOnThePairAndThisSortieStaysFinite() {
        var session = new SimulationSession();
        session.StartBeat(CloseGunFight);
        session.Begin();
        session.FeedKey(GKey.Trigger, true);
        for (int i = 0; i < 40 * AircraftSim.TickHz && session.KillCount < 2; i++) {
            if (session.OpponentPresent
                && session.Bandit.State.Position.Z - session.Player.State.Position.Z > 400.0) {
                AircraftState bandit = session.Bandit.State;
                session.Player.AdoptExternalKinematics(bandit with {
                    Position = bandit.Position + new Vec3D(0, 0, -140),
                    Speed = bandit.Speed + 20,
                    Chi = 0,
                });
            }
            session.StepFixed();
        }
        session.FeedKey(GKey.Trigger, false);
        Assert.Equal(2, session.KillCount);
        Assert.Equal(2, session.EngagementNumber);
        Assert.Equal(0, session.LiveOpponentCount);
        Assert.False(session.OpponentReplacementPending);
        Assert.Equal(3, session.DifficultyRung);

        var next = new SimulationSession();
        next.ArmDirectorStateForNextStage(session.ExportDirectorState());
        next.StartBeat(7);
        Assert.Equal(3, next.DifficultyRung);
        Assert.Single(next.Wingmen);
        Assert.Equal(PilotSkill.Ace, ((NeutralMergeBandit)next.Bandit).Skill);
    }

    static BeatSetup CloseGunFight() {
        BeatSetup source = Beats.ModernVisualMerge();
        AircraftState Close(double z, double speed, double chi, double mass) => new(
            new Vec3D(0.0, 5486.4, z), speed, 0.0, chi, 0.0, mass);
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

    [Fact]
    public void RestartOnTheF22BeatKeepsTheEarnedPair() {
        var director = new FightDirector();
        Observe(director, Report(1, SortieOutcome.Victory, hitsScored: 1, gunKills: 1));
        Observe(director, Report(2, SortieOutcome.Victory, hitsScored: 1, gunKills: 1));
        var session = new SimulationSession();
        session.ArmDirectorStateForNextStage(director.ExportState());
        session.StartBeat(7);
        Assert.Equal(3, session.DifficultyRung);
        session.Restart();
        Assert.Equal(3, session.DifficultyRung);
        Assert.Single(session.Wingmen);
        Assert.Equal(PilotSkill.Ace, ((NeutralMergeBandit)session.Bandit).Skill);
    }

    [Fact]
    public void AnArmedF22HistoryDoesNotRestageTopGun() {
        var director = new FightDirector();
        Observe(director, Report(1, SortieOutcome.Defeat));
        Assert.True(director.HasHistory);
        var session = new SimulationSession();
        session.ArmDirectorStateForNextStage(director.ExportState());
        session.StartBeat(() => Beats.TopGunAcm(TopGunSeat.F14A));
        var bandit = Assert.IsType<NeutralMergeBandit>(session.Bandit);
        Assert.Equal(PilotSkill.Ace, bandit.Skill);
        Assert.False(bandit.Presenting);
        Assert.True(SlantRangeM(session.Player.State.Position, bandit.State.Position) > 5_000.0);
        Assert.Empty(session.Wingmen);
    }

    [Fact]
    public void RungZeroPresentClearsOnATrackingHoldAndNotOnProximity() {
        ReactiveBandit Make() => new(
            new AircraftState(new Vec3D(0.0, 1000.0, 0.0), 180.0, 0.0, 0.0, 0.0,
                FlightModel.Sabre.MassKg),
            FlightModel.Sabre, PilotSkill.Competent, presenting: true,
            endPresentOnProximity: false);
        double dt = 1.0 / AircraftSim.TickHz;

        ReactiveBandit nearby = Make();
        for (int i = 0; i < (int)(10.0 / dt); i++) {
            var player = new AircraftState(
                new Vec3D(1200.0, 1000.0, nearby.State.Position.Z), 180.0, 0.0, 0.0, 0.0,
                FlightModel.Sabre.MassKg);
            nearby.Step(player, dt);
        }
        Assert.True(nearby.Presenting);

        ReactiveBandit tracking = Make();
        var onNose = new AircraftState(
            new Vec3D(0.0, 1000.0, -500.0), 180.0, 0.0, 0.0, 0.0, FlightModel.Sabre.MassKg);
        for (int i = 0; i < (int)(3.0 / dt); i++) tracking.Step(onNose, dt);
        Assert.False(tracking.Presenting);
    }
}
