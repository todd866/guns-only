using GunsOnly.Sim.Doctrine;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

public class BfmFlightAcceptanceTests(ITestOutputHelper output) {
    const double Dt = 1.0 / AircraftSim.TickHz;
    public static string StateFor(int lesson) {
        var director = new FightDirector();
        director.EnableBfmLadder();
        while (director.LessonIndex < lesson) {
            if (BfmLesson.Get(director.LessonIndex).Defensive) director.CompleteDefensiveLesson();
            else director.Observe(new EngagementReport(1, PilotSkill.Competent, false,
                SortieOutcome.Victory, 10, 0, 0, 3, 3, 0, 300, 0, GunKills: 1));
        }
        return director.ExportState();
    }

    public static SimulationSession Start(int lesson, int seed = 0) {
        var session = new SimulationSession();
        session.ArmDirectorStateForNextStage(StateFor(lesson));
        session.StartBeat(() => {
            var beat = Beats.ModernVisualMerge();
            return beat with { Player = beat.Player with {
                Speed = beat.Player.Speed + (seed - 1.5) * 3,
                Chi = seed * 0.05,
            }, ContinuousCombat = beat.ContinuousCombat! with {
                EscalatingWaves = false,
            } };
        });
        session.SetAssistedFlight(true);
        session.SetTouchControlModality(true);
        session.Begin();
        return session;
    }

    // Inputs only, reaction 0.25..0.55 s. Roll into the rear-right threat, then pull;
    // heading is never set and the physical roll/G/physiology limits remain active.
    internal static void Break(SimulationSession session, double seconds, int seed) {
        if (seconds < 0.25 + seed * 0.1) return;
        double bank = session.Player.State.Bank;
        double targetBank = 80 * Math.PI / 180;
        session.SetAnalogRollControl(Math.Clamp((targetBank - bank) * 1.5, -0.8, 0.8));
        session.SetAnalogPitchControl(bank > 45 * Math.PI / 180 ? 0.85 : 0.15);
        session.SetAnalogThrottleControl(1);
    }

    public sealed record Run(int Lesson, int Seed, bool Breaking, double Time, bool Lost,
        string Result, int Rounds, int Hits, double Range);
    public static Run FlyDefense(int lesson, int seed, bool breaking, bool reverse = false) {
        var s = Start(lesson, seed);
        var seen = new Queue<AircraftState>();
        for (int i = 0; i < 45 * AircraftSim.TickHz; i++) {
            if (breaking) Break(s, i * Dt, seed);
            seen.Enqueue(s.Bandit.State);
            if (seen.Count > 36) {
                AircraftState contact = seen.Dequeue();
                if (reverse && i * Dt > 4) {
                    var own = s.Player.State;
                    var aim = contact.Position;
                    double targetBank = Geometry.BankToPlaceLiftVectorOn(own, aim);
                    double bankError = Math.Atan2(Math.Sin(targetBank - own.Bank), Math.Cos(targetBank - own.Bank));
                    double angle = Math.Acos(Math.Clamp(own.ForwardDir().Dot((aim - own.Position).Normalized()), -1, 1));
                    s.SetAnalogRollControl(Math.Clamp(bankError * 1.5, -0.8, 0.8));
                    s.SetAnalogPitchControl(Math.Abs(bankError) < Math.PI / 3 ? Math.Clamp(angle, 0.1, 1) : 0.1);
                    s.SetAnalogThrottleControl(own.Speed < 200 ? 1 : 0.7);
                }
            }
            s.StepFixed();
            if (s.PlayerTerminalState != AircraftTerminalState.Flying || s.BfmLessonOutcome == "passed") break;
        }
        return new(lesson, seed, breaking, s.TimeSeconds,
            s.PlayerTerminalState != AircraftTerminalState.Flying, s.BfmLessonOutcome,
            s.SortieOpponentRoundsFired, s.PlayerHitsTaken, Geometry.Range(s.Player.State, s.Bandit.State));
    }

    [Fact]
    public void D1PunishesPassiveFlightAndRewardsADelayedBreak() {
        var passive = Enumerable.Range(0, 4).Select(i => FlyDefense(1, i, false)).ToArray();
        var breaking = Enumerable.Range(0, 4).Select(i => FlyDefense(1, i, true)).ToArray();
        foreach (var run in passive.Concat(breaking)) output.WriteLine(run.ToString());
        Assert.True(passive.Count(r => r.Lost && r.Time <= 20 && r.Rounds > 0) >= 3);
        Assert.True(breaking.Count(r => !r.Lost && r.Result == "passed") >= 3);
    }

    [Fact]
    public void O1ConvertsThenStagesD1WithoutMovingThePlayer() {
        int kills = 0;
        foreach (int seed in Enumerable.Range(0, 8)) {
            var s = Start(0, seed);
            var pilot = new FirstMergeOpeningAcceptanceTests.HudPilot(
                new($"seed{seed}", 0.2 + 0.05 * (seed % 4), seed < 4 ? 3 : 1.8, 1 + 0.35 * seed));
            bool sawD1 = false;
            for (int tick = 0; tick < 30 * AircraftSim.TickHz; tick++) {
                pilot.Drive(s);
                AircraftState before = s.Player.State;
                s.StepFixed();
                if (s.BfmLessonIndex == 1) {
                    Assert.Equal(2, s.EngagementNumber);
                    Assert.InRange((s.Player.State.Position - before.Position).Length, 0, before.Speed * Dt * 1.1);
                    Assert.IsType<ReactiveBandit>(s.Bandit);
                    Assert.False(s.Bandit.Presenting);
                    Assert.True((s.Bandit.State.Position - s.Player.State.Position).Dot(s.Player.State.ForwardDir()) < 0);
                    sawD1 = true;
                    break;
                }
            }
            output.WriteLine($"O1 seed={seed} kills={s.KillCount} hits={s.SortiePlayerHits} D1={sawD1}");
            if (s.KillCount > 0 && sawD1) kills++;
        }
        // Integrated opening acceptance: retain at least seven of the eight delayed pilots.
        Assert.True(kills >= 7, $"Only {kills}/8 converted O1 and reached D1");
    }

    [Fact]
    public void DefensiveCompletionHasNoFakeKillAndSurvivesHandoffProjection() {
        var s = Start(1);
        int historicalKills = s.DirectorKills;
        for (int tick = 0; tick < 20 * AircraftSim.TickHz && s.BfmLessonOutcome != "passed"; tick++) {
            Break(s, tick * Dt, 0);
            s.StepFixed();
        }
        Assert.Equal("passed", s.BfmLessonOutcome);
        Assert.True(s.PrimaryOpponentAlive);
        Assert.Equal(0, s.KillCount);
        Assert.Equal(historicalKills, s.DirectorKills);
        Assert.True(s.FiniteCombatComplete);
        Assert.Equal(1, s.FiniteEngagementCap);
        Assert.Equal(1, s.EngagementsWon);
        Assert.Single(s.EngagementReports);
        Assert.Equal(EngagementEndReason.DefensiveSuccess, s.LastEngagementReport!.Value.EndReason);
        for (int tick = 0; tick < 2 * AircraftSim.TickHz; tick++) s.StepFixed();
        Assert.True(s.PlayerRtbActive);
        Assert.Single(s.EngagementReports);
        Assert.Equal("passed", s.BfmLessonOutcome);
        string json = GunsOnly.Web.SnapshotProjection.BuildState(s, Carrier.DeckConfiguration.Angled, 0, 0, false, null);
        using var doc = System.Text.Json.JsonDocument.Parse(json);
        Assert.Equal("D1", doc.RootElement.GetProperty("bfm_lesson").GetString());
        Assert.Equal("O2", doc.RootElement.GetProperty("bfm_next_lesson").GetString());
        Assert.Equal("passed", doc.RootElement.GetProperty("bfm_lesson_outcome").GetString());
    }

    [Fact]
    public void LaterOffensivePairsReduceConversionForTheSameDelayedPilots() {
        var converted = new List<int>();
        foreach (int lesson in new[] { 0, 2, 4 }) {
            int kills = 0;
            foreach (int seed in Enumerable.Range(0, 8)) {
                var s = Start(lesson, seed);
                var pilot = new FirstMergeOpeningAcceptanceTests.HudPilot(
                    new($"s{seed}", 0.2 + 0.05 * (seed % 4), seed < 4 ? 3 : 1.8, 1 + 0.35 * seed));
                for (int tick = 0; tick < 45 * AircraftSim.TickHz && s.KillCount == 0
                    && s.PlayerTerminalState == AircraftTerminalState.Flying; tick++) {
                    pilot.Drive(s); s.StepFixed();
                }
                if (s.KillCount > 0) kills++;
                output.WriteLine($"CURVE {BfmLesson.Get(lesson).Id} seed={seed} kills={s.KillCount} time={s.TimeSeconds:F2}");
            }
            converted.Add(kills);
        }
        Assert.True(converted[0] >= 5);
        Assert.True(converted[0] > converted[1], string.Join(",", converted));
        // Monotone, not strict, between the later pairs. Until 2026-10-14 rungs 1+ also halved
        // then removed the player's gun assist, which manufactured part of this drop; the assist
        // is now constant at every rung (owner: "keep gun assist"), so separation here is the
        // bandit's alone and these delayed pilots convert ~1/8 at both lessons 2 and 4.
        Assert.True(converted[1] >= converted[2], string.Join(",", converted));
        Assert.True(converted[0] > converted[2], string.Join(",", converted));
    }

    [Fact]
    public void ReportLaterPairCurves() {
        if (System.Environment.GetEnvironmentVariable("BFM_REPORT") != "1") return;
        foreach (int lesson in new[] { 0, 2, 4 }) {
            foreach (int seed in Enumerable.Range(0, 4)) {
                var s = Start(lesson, seed);
                var pilot = new FirstMergeOpeningAcceptanceTests.HudPilot(new($"s{seed}", 0.25, 3, 1));
                for (int tick = 0; tick < 90 * AircraftSim.TickHz && s.KillCount == 0
                    && s.PlayerTerminalState == AircraftTerminalState.Flying; tick++) {
                    pilot.Drive(s); s.StepFixed();
                }
                output.WriteLine($"OFF lesson={lesson} seed={seed} time={s.TimeSeconds:F2} kills={s.KillCount} hits={s.SortiePlayerHits} lost={s.PlayerTerminalState}");
            }
        }
        foreach (int lesson in new[] { 1, 3, 5 })
            foreach (int seed in Enumerable.Range(0, 4))
                foreach (bool breaking in new[] { false, true })
                    output.WriteLine(FlyDefense(lesson, seed, breaking).ToString());
        foreach (int lesson in new[] { 1, 3, 5 })
            foreach (int seed in Enumerable.Range(0, 4))
                output.WriteLine("REVERSE " + FlyDefense(lesson, seed, true, reverse: true));
    }
}
