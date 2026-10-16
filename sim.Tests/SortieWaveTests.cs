using GunsOnly.Sim.Doctrine;
using GunsOnly.PlaytestLab;

namespace GunsOnly.Sim.Tests;

/// Contract tests for the extended F-22 (beat 7) sortie.  The first two merges remain
/// the authored BFM opening; these tests cover the director-owned continuation and the
/// seeded return-to-base threat.
public sealed class SortieWaveTests {
    [Fact]
    public void LaterWavesEscalateFormationAndScoreRisk() {
        var director = new FightDirector();

        SortieWave wave3 = director.NextWave(3, seed: 7);
        SortieWave wave4 = director.NextWave(4, seed: 7);
        SortieWave wave5 = director.NextWave(5, seed: 7);

        Assert.Equal(3, wave3.Number);
        Assert.Equal(PilotSkill.Veteran, wave3.Spawn.Skill);
        Assert.Equal(2, wave3.Spawn.FormationSize);
        Assert.InRange(wave3.DelaySeconds, 20.0, 24.0);
        Assert.InRange(wave3.RangeM, 1_600.0, 2_000.0);
        Assert.True(wave3.Spawn.Committed);

        Assert.Equal(4, wave4.Number);
        Assert.Equal(PilotSkill.Ace, wave4.Spawn.Skill);
        Assert.Equal(2, wave4.Spawn.FormationSize);
        Assert.Equal(BanditMount.Baseline, wave4.Spawn.Mount);
        Assert.Equal(PilotSkill.Veteran, wave3.Spawn.WingSkill);
        Assert.Equal(PilotSkill.Veteran, wave4.Spawn.WingSkill);

        Assert.Equal(5, wave5.Number);
        Assert.Equal(4, wave5.Spawn.FormationSize);
        Assert.Equal(BanditMount.Uprated, wave5.Spawn.Mount);
        Assert.Equal(PilotSkill.Ace, wave5.Spawn.WingSkill);
        Assert.True(wave3.ScoreMultiplier < wave4.ScoreMultiplier);
        Assert.True(wave4.ScoreMultiplier < wave5.ScoreMultiplier);
    }

    [Fact]
    public void WaveGeometryAndDoctrineAreDeterministicForASeed() {
        var director = new FightDirector();

        SortieWave first = director.NextWave(5, seed: 811);
        SortieWave replay = director.NextWave(5, seed: 811);

        Assert.Equal(first, replay);
        Assert.InRange(first.BearingOffsetRad, -Math.PI, Math.PI);
        Assert.InRange(first.RangeM, 1_000.0, 100_000.0);

        // A seed controls the encounter flavour, rather than merely reseeding an unused
        // random stream.  Across a small sample at least one tactical field must move.
        SortieWave other = director.NextWave(5, seed: 812);
        Assert.True(first.BearingOffsetRad != other.BearingOffsetRad
            || first.RangeM != other.RangeM
            || first.Spawn.DoctrineIndex != other.Spawn.DoctrineIndex);
    }

    [Fact]
    public void WaveNumbersBelowContinuationAreRejected() {
        var director = new FightDirector();

        Assert.Throws<ArgumentOutOfRangeException>(() => director.NextWave(1, seed: 1));
        Assert.Throws<ArgumentOutOfRangeException>(() => director.NextWave(2, seed: 1));
    }

    [Fact]
    public void RtbBounceDecisionIsStableAndApproximatelyThirtyFivePercent() {
        bool[] first = Enumerable.Range(0, 1000)
            .Select(FightDirector.RtbBounceForSeed)
            .ToArray();
        bool[] replay = Enumerable.Range(0, 1000)
            .Select(FightDirector.RtbBounceForSeed)
            .ToArray();

        Assert.Equal(first, replay);
        int bounces = first.Count(static value => value);
        Assert.InRange(bounces, 250, 450);
    }

    [Fact]
    public void BeatSevenEnablesInfiniteEscalatingContinuationWithoutChangingOtherBeats() {
        BeatSetup beat7 = Beats.ModernVisualMerge();
        Assert.NotNull(beat7.ContinuousCombat);
        Assert.True(beat7.ContinuousCombat!.EscalatingWaves);
        Assert.Equal(4, beat7.ContinuousCombat!.MaximumFormationSize);
        Assert.Equal(0, beat7.ContinuousCombat.MaximumEngagements);

        BeatSetup firstRun = Beats.ModernVisualMergeFirstRun();
        Assert.False(firstRun.ContinuousCombat!.EscalatingWaves);
        Assert.Equal(2, firstRun.ContinuousCombat!.MaximumEngagements);
        Assert.False(Beats.ModernVisualMergeFirstRun().ContinuousCombat!.EscalatingWaves);
    }

    [Fact]
    public void SessionKeepsSeededRtbDecisionAndAllowsKnockItOffDuringContinuation() {
        var session = new SimulationSession();
        // Seed 5 is in the production 35% eligibility bucket.
        session.ConfigureSortieSeed(5);
        session.StartBeat(Beats.ModernVisualMerge);
        session.Begin();

        Assert.True(session.EscalatingWavesEnabled);
        Assert.True(session.TryRequestReturnToBase(MissionRtbReason.PilotKnockItOff));
        Assert.True(session.RtbBounceScheduled || session.RtbBounceActive);
        Assert.Equal(SortieOutcome.None, session.Outcome);
    }

    [Fact]
    public void TwoForcedOpeningWinsScheduleWaveThreeWithWarningAndScore() {
        var session = new SimulationSession();
        session.ConfigureSortieSeed(7);
        session.StartBeat(Beats.ModernVisualMerge);
        session.Begin();

        ForceLastOpponentAndWaitForReport(session);
        ForceLastOpponentAndWaitForReport(session);

        Assert.Equal(2, session.EngagementsWon);
        Assert.Equal(200.0, session.CombatScore);
        Assert.NotNull(session.IncomingWaveBearingRad);
        Assert.Contains("NEW CONTACT", session.TransitionCue);
        Assert.Contains("W3", session.TransitionCue);
        Assert.True(session.OpponentReplacementPending);
        Assert.InRange(session.OpponentReplacementSeconds, 20.0, 24.0);
        Assert.Equal(1.5, session.WaveScoreMultiplier);

        // KNOCK IT OFF cancels the staged warning and the successor spawn.
        Assert.True(session.TryRequestReturnToBase(MissionRtbReason.PilotKnockItOff));
        Assert.Null(session.IncomingWaveBearingRad);
        Assert.False(session.OpponentReplacementPending);
    }

    [Fact]
    public void IdenticalSessionSeedsReplayTheSameWaveWarningAndScore() {
        static SimulationSession Run() {
            var session = new SimulationSession();
            session.ConfigureSortieSeed(7);
            session.StartBeat(Beats.ModernVisualMerge);
            session.Begin();
            ForceLastOpponentAndWaitForReport(session);
            ForceLastOpponentAndWaitForReport(session);
            return session;
        }

        SimulationSession first = Run();
        SimulationSession replay = Run();
        Assert.Equal(first.IncomingWaveBearingRad, replay.IncomingWaveBearingRad);
        Assert.Equal(first.OpponentReplacementSeconds, replay.OpponentReplacementSeconds, 10);
        Assert.Equal(first.WaveScoreMultiplier, replay.WaveScoreMultiplier);
        Assert.Equal(first.CombatScore, replay.CombatScore);
    }

    [Fact]
    public void ScheduledWaveThreeArrivesAsACommittedTwoShipFormation() {
        var session = new SimulationSession();
        session.ConfigureSortieSeed(7);
        session.StartBeat(Beats.ModernVisualMerge);
        session.Begin();
        ForceLastOpponentAndWaitForReport(session);
        ForceLastOpponentAndWaitForReport(session);

        int warningTicks = (int)Math.Ceiling(session.OpponentReplacementSeconds * AircraftSim.TickHz) + 2;
        session.StepFixed(warningTicks);

        Assert.Equal(3, session.EngagementNumber);
        Assert.Equal(2, session.LiveOpponentCount);
        Assert.Equal(2, session.LastDirectorSpawn!.Value.FormationSize);
        Assert.True(session.LastDirectorSpawn.Value.Committed);
        Assert.Equal(PilotSkill.Veteran, session.LastDirectorSpawn.Value.Skill);
    }

    [Fact]
    public void EveryCohortSeedArrivesInsideThreatRangeWithinThirtySecondsOfWin() {
        foreach (int seed in Enumerable.Range(0, 30)) {
            var session = new SimulationSession();
            session.ConfigureSortieSeed(seed);
            session.StartBeat(Beats.ModernVisualMerge);
            session.Begin();
            ForceLastOpponentAndWaitForReport(session);
            ForceLastOpponentAndWaitForReport(session);
            double wonAt = session.TimeSeconds;
            while (session.LiveOpponentCount == 0 && session.TimeSeconds - wonAt <= 30)
                session.StepFixed();
            Assert.Equal(3, session.EngagementNumber);
            Assert.InRange(session.TimeSeconds - wonAt, 20 - 1e-8, 25);
            Vec3D delta = session.Player.State.Position - session.Bandit.State.Position;
            Assert.InRange(delta.Length, 0, 2500);
            Assert.True(session.Bandit.State.ForwardDir().Dot(delta.Normalized())
                >= Math.Cos(35 * Math.PI / 180), $"seed {seed}: contact faces away");
        }
    }

    [Theory]
    [InlineData(0)]
    [InlineData(6)] // W4 Ace doctrine 2 must map into the Veteran's two doctrines
    [InlineData(7)]
    public void W4AndW5FormationEscalationUsesLeadAndWingDoctrine(int seed) {
        var session = new SimulationSession();
        session.ConfigureSortieSeed(seed);
        session.StartBeat(Beats.ModernVisualMerge);
        session.Begin();
        ForceLastOpponentAndWaitForReport(session);
        ForceLastOpponentAndWaitForReport(session);
        session.StepFixed((int)Math.Ceiling(session.OpponentReplacementSeconds
            * AircraftSim.TickHz) + 2);
        Assert.Equal(2, session.LiveOpponentCount);
        Assert.False(session.PlayerRtbActive);
        Assert.Equal(SortieOutcome.None, session.PendingOutcome);

        // W3 is a committed 2v1: remove the leader, verify promotion, then remove the
        // promoted wingman to complete the engagement and schedule W4.
        session.ForceOpponentDefeatForTest();
        session.StepFixed();
        Assert.Empty(session.Wingmen); // promoted actor is now the primary
        Assert.Equal(1, session.LiveOpponentCount);
        Assert.Equal(AircraftCapability.Su27SSurrogate, session.CurrentBanditCapability);
        session.ForceOpponentDefeatForTest();
        WaitForNextReport(session, expectedReports: 3);
        session.StepFixed((int)Math.Ceiling(session.OpponentReplacementSeconds
            * AircraftSim.TickHz) + 2);

        Assert.Equal(2, session.LiveOpponentCount);
        SpawnSpec w4 = Assert.IsType<SpawnSpec>(session.LastDirectorSpawn);
        Assert.Equal(PilotSkill.Ace, w4.Skill);
        Assert.Equal(BanditMount.Baseline, w4.Mount);
        Assert.Equal(PilotSkill.Veteran, w4.WingSkill);
        Assert.Equal(BanditMount.Baseline, w4.WingMount);

        // Clear both W4 actors through the same promotion path, then verify W5's
        // four-ship escalation arrives with the rising score multiplier.
        for (int remaining = 2; remaining > 0; remaining--) {
            session.ForceOpponentDefeatForTest();
            session.StepFixed();
            if (remaining > 1) {
                Assert.Equal(PilotSkill.Veteran, session.LastDirectorSpawn!.Value.Skill);
                Assert.Equal(BanditMount.Baseline, session.LastDirectorSpawn.Value.Mount);
                Assert.Equal(w4.DoctrineIndex % BanditSkillProfile.For(PilotSkill.Veteran).DoctrineCount,
                    session.LastDirectorSpawn.Value.DoctrineIndex);
                Assert.Equal(AircraftCapability.Su27SSurrogate, session.CurrentBanditCapability);
            }
        }
        WaitForNextReport(session, expectedReports: 4);
        session.StepFixed((int)Math.Ceiling(session.OpponentReplacementSeconds
            * AircraftSim.TickHz) + 2);
        Assert.Equal(4, session.LiveOpponentCount);
        Assert.Equal(4, session.LastDirectorSpawn!.Value.FormationSize);
        Assert.True(session.WaveScoreMultiplier > 2.0);
    }

    [Fact]
    public void EligibleRtbBounceSpawnsAfterOldContactIsClearedAndDropsCompressionOnThreat() {
        var session = new SimulationSession();
        session.ConfigureSortieSeed(5);
        session.StartBeat(Beats.ModernVisualMerge);
        session.Begin();
        ForceLastOpponentAndWaitForReport(session);
        // Clear the second (W2) contact as well; RTB bounce is scheduled only once the
        // ordinary contact has been retired, so it cannot be hidden behind ceasefire.
        ForceLastOpponentAndWaitForReport(session);

        Assert.True(session.TryRequestReturnToBase(MissionRtbReason.PilotKnockItOff));
        Assert.True(session.RtbBounceScheduled);
        for (int tick = 0; tick < 10 * AircraftSim.TickHz && !session.PlayerRtbActive; tick++)
            session.StepFixed();
        var runway = session.ConventionalRunwayRecovery!.Runway;
        session.Player.AdoptExternalKinematics(new AircraftState(
            runway.Threshold - runway.Forward * 30_000 + new Vec3D(0, 3_000, 0),
            220, 0, runway.HeadingRad, 0, session.Player.State.Mass));
        session.StepFixed(120);
        session.SetTimeCompressionEnabled(true);
        bool apWasActive = session.RtbAutopilotActive;
        Assert.True(apWasActive);

        for (int tick = 0; tick < 70 * AircraftSim.TickHz && !session.RtbBounceSpawned; tick++)
            session.StepFixed();

        Assert.True(session.RtbBounceSpawned);
        Assert.True(session.RtbBounceActive);
        Assert.True(apWasActive);
        Assert.False(session.RtbAutopilotActive);
        Assert.Equal(1, session.TimeCompressionFactor);

        // The interceptor is a live gun threat, not a radio-only event.
        for (int tick = 0; tick < 45 * AircraftSim.TickHz; tick++)
            session.StepFixed();
        Assert.True(session.OpponentGun.RoundsFired > 0);
    }

    [Fact]
    public void NonF22ContinuousCombatRemainsFinite() {
        var session = new SimulationSession();
        session.StartBeat(Beats.ModernVisualMergeFirstRun);

        Assert.False(session.EscalatingWavesEnabled);
        Assert.Equal(1, session.FiniteEngagementCap);
    }

    [Fact]
    public void EndIsAvailableDuringAnActiveEscalatingSortieBeforeTheFirstTwoWins() {
        var session = new SimulationSession();
        session.StartBeat(Beats.ModernVisualMerge);
        session.Begin();

        Assert.True(session.CanEndSortie);
        Assert.True(session.TryEndSortie());
        Assert.Equal(SortieOutcome.Discontinued, session.Outcome);
        Assert.False(session.FiniteCombatComplete);
    }

    [Fact]
    public void WinchesterForcesReturnDuringAnEscalatingWave() {
        BeatSetup source = Beats.ModernVisualMerge();
        BeatSetup oneRound = source with {
            Combat = source.CombatRules with {
                PlayerAmmo = 1,
                OpponentHitsToDefeat = 1000,
            },
        };
        var session = new SimulationSession();
        session.StartBeat(() => oneRound);
        session.Begin();
        session.FeedKey(GKey.Trigger, true);
        for (int tick = 0; tick < 3 * AircraftSim.TickHz
            && session.PlayerGun.AmmoRemaining > 0; tick++)
            session.StepFixed();
        session.FeedKey(GKey.Trigger, false);

        Assert.Equal(0, session.PlayerGun.AmmoRemaining);
        for (int tick = 0; tick < 2 * AircraftSim.TickHz
            && !session.CombatHandoffRequested; tick++)
            session.StepFixed();
        Assert.True(session.CombatHandoffRequested);
    }

    [Fact]
    public void LabStayOrGoPolicyLeavesOnDamageResourcesOrWaveLimit() {
        static LabStayOrGoPolicy.Inputs I(string pilot, int waves = 0,
            double health = 1.0, bool bingo = false, int ammo = 480) =>
            new(true, waves, health, bingo, ammo, pilot);

        Assert.False(LabStayOrGoPolicy.ShouldRequestRtb(I("ace")));
        Assert.False(LabStayOrGoPolicy.ShouldRequestRtb(I("ace", waves: 4, health: .9)));
        Assert.True(LabStayOrGoPolicy.ShouldRequestRtb(I("ace", health: .89)));
        Assert.True(LabStayOrGoPolicy.ShouldRequestRtb(I("ace", waves: 5)));
        Assert.True(LabStayOrGoPolicy.ShouldRequestRtb(I("ace", bingo: true)));
        Assert.True(LabStayOrGoPolicy.ShouldRequestRtb(I("ace", ammo: 0)));
        Assert.False(LabStayOrGoPolicy.ShouldRequestRtb(I("novice", waves: 1)));
        Assert.True(LabStayOrGoPolicy.ShouldRequestRtb(I("novice", waves: 2)));
        Assert.True(LabStayOrGoPolicy.ShouldRequestRtb(I("novice", waves: 1, health: .98)));
        Assert.True(LabStayOrGoPolicy.ShouldRequestRtb(I("clone", waves: 4)));
        Assert.True(LabStayOrGoPolicy.ShouldRequestRtb(new(false, 0, 1, false, 480, "ace")));
    }

    static void ForceLastOpponentAndWaitForReport(SimulationSession session) {
        int reports = session.EngagementReports.Count;
        session.ForceOpponentDefeatForTest();
        for (int tick = 0; tick < 8 * AircraftSim.TickHz
            && session.EngagementReports.Count == reports; tick++)
            session.StepFixed();
        Assert.Equal(reports + 1, session.EngagementReports.Count);
        // The next call must see a live successor.  Leave a newly scheduled escalation
        // wave pending so its warning can be inspected by the caller.
        if (session.IncomingWaveBearingRad is null)
            for (int tick = 0; tick < 8 * AircraftSim.TickHz
                && session.OpponentReplacementPending; tick++)
                session.StepFixed();
    }

    static void WaitForNextReport(SimulationSession session, int expectedReports) {
        for (int tick = 0; tick < 8 * AircraftSim.TickHz
            && session.EngagementReports.Count < expectedReports; tick++)
            session.StepFixed();
        Assert.Equal(expectedReports, session.EngagementReports.Count);
    }
}
