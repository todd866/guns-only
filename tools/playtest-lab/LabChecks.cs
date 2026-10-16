using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;

namespace GunsOnly.PlaytestLab;

public static class LabChecks {
    public static void Run(ClonedPilotPolicy clone) {
        static void Require(bool value, string message) { if (!value) throw new Exception(message); }
        CheckRtbAutopilotLifecycle();
        Require(Math.Abs(ExperienceObserver.SegmentDistance(new Vec3D(-100, 10, 0), new Vec3D(100, 10, 0)) - 10) < 1e-9,
            "Swept near-miss distance lost a fast passing round.");
        // Two moving objects are swept by their simultaneous WORLD-axis relative
        // endpoints. Translating the old endpoint to the new player origin is wrong.
        Vec3D oldPlayer = new(100, 0, 0), newPlayer = new(120, 0, 0);
        Require(Math.Abs(ExperienceObserver.SegmentDistance(new Vec3D(0, 10, 0) - oldPlayer,
            new Vec3D(220, 10, 0) - newPlayer) - 10) < 1e-9, "Moving-player relative sweep is wrong.");
        Require(ShotPass(20, false) == 1, "A single passing round must count once across many ticks.");
        Require(ShotPass(0, false) == 0, "A physical hit was counted as a near miss.");
        Require(ShotPass(40, false) == 0, "A distant round was counted as a near miss.");
        Require(ShotPass(20, true) == 0, "A relief-targeted round was counted as lethal to the player.");
        foreach (string pilot in new[] { "clone", "novice", "ace" }) {
            var o = new Options(Seeds: 1, MaxSeconds: 5);
            var a = SortieRunner.Fly(o, pilot, 3, clone);
            var b = SortieRunner.Fly(o, pilot, 3, clone);
            a.WallSeconds = b.WallSeconds = 0;
            Require(JsonSerializer.Serialize(a, Program.Json) == JsonSerializer.Serialize(b, Program.Json), $"Nondeterministic {pilot} seed 3.");
            Require(a.Outcome == "incomplete" && !a.Completed, "Timeout was reported as a completed sortie.");
            Require(Math.Abs(a.PhaseSeconds.Values.Sum() - a.PerceivedSeconds) < 1e-6, "Phase duration mismatch.");
            Require(Math.Abs(a.Timeline.Sum(x => x.Duration) - a.PerceivedSeconds) < 1e-6, "Timeline duration mismatch.");
            Require(a.Timeline.Sum(x => x.RoundsFired) == a.RoundsFired && a.Timeline.Sum(x => x.HitsGiven) == a.HitsGiven,
                "Per-second deltas disagree with sortie totals.");
            Require(a.Timeline.All(x => x.Tension is >= 0 and <= 1), "Tension outside 0..1.");
        }
        foreach (int invalid in new[] { 0, 15 }) {
            bool rejected = false;
            try { Options.Parse(new[] { "--beat", invalid.ToString() }); } catch (ArgumentException) { rejected = true; }
            Require(rejected, "Unknown beat silently became Perch.");
        }
        var first = SortieRunner.Fly(new Options(MaxSeconds: 5), "clone", 1, clone);
        var changed = SortieRunner.Fly(new Options(MaxSeconds: 5), "clone", 4, clone);
        Require(JsonSerializer.Serialize(first.Timeline, Program.Json) != JsonSerializer.Serialize(changed.Timeline, Program.Json), "Seeds never change the trajectory.");
        var partialSession = new SimulationSession(7);
        var partialObserver = new ExperienceObserver(new Options(), "ace", 0);
        partialSession.Begin();
        for (int i = 0; i < 125; i++) { partialObserver.BeforeStep(partialSession); partialSession.StepFixed(); partialObserver.Observe(partialSession, Array.Empty<string>()); }
        var partial = partialObserver.Finish(partialSession, 0);
        Require(partial.Timeline.Count == 2 && Math.Abs(partial.Timeline[1].Duration - 5 * SortieRunner.Dt) < 1e-10, "Final fractional second was dropped.");
        // Deliberately change factors off the perceived-second grid. Durations
        // must split, whereas the decision on the crossing tick must not duplicate.
        var weightedSession = new SimulationSession(7); weightedSession.Begin();
        var weightedObserver = new ExperienceObserver(new Options(), "fixture", 0);
        for (int i = 0; i < 124; i++) {
            weightedObserver.BeforeStep(weightedSession); weightedSession.StepFixed();
            weightedObserver.Observe(weightedSession, i == 122 ? new[] { "cross-bin" } : Array.Empty<string>(), i is >= 119 and < 122 ? 8 : 1);
        }
        var weighted = weightedObserver.Finish(weightedSession, 12.5);
        double expectedPlayer = (121 + 3.0 / 8) * SortieRunner.Dt;
        Require(Math.Abs(weighted.PerceivedSeconds - expectedPlayer) < 1e-9 && weighted.WallSeconds == 12.5, "Player and execution clocks conflated.");
        Require(Math.Abs(weighted.Seconds - 124 * SortieRunner.Dt) < 1e-9, "Simulation clock changed under weighting.");
        Require(weighted.Timeline.Count == 2 && Math.Abs(weighted.Timeline[0].Duration - 1) < 1e-9, "Mixed factors did not split at player second.");
        Require(weighted.Timeline.Sum(x => x.Decisions.Count) == 1 && weighted.Events.Count(e => e.Kind == "decision:cross-bin") == 1, "Cross-bin event lost or duplicated.");
        CheckClocks(weighted);
        Require(Options.Parse(new[] { "--end-after-combat" }).EndAfterCombat, "End option did not parse.");
        var ended = SortieRunner.Fly(new Options(MaxSeconds: 600, EndAfterCombat: true), "ace", 0, clone);
        Require(ended.Completed && ended.SortieEndedEarly && ended.CombatComplete && ended.Outcome == "win" && !ended.Landed,
            "End must bank completed combat without claiming landing.");
        Require(ended.Events.Count(e => e.Kind == "SortieFinished") == 1
            && ended.Events.Count(e => e.Kind == "decision:End:combat-complete") == 1,
            "Between-tick End event/decision missing or duplicated.");
        Require(ended.Events.Last().Second <= ended.PerceivedSeconds + 1e-9, "End event extends the player clock.");
        var notEnded = SortieRunner.Fly(new Options(MaxSeconds: 5, EndAfterCombat: true), "novice", 0, clone);
        Require(!notEnded.SortieEndedEarly && !notEnded.Completed, "End accepted before combat completion.");
        foreach (int beat in Enumerable.Range(1, 14)) {
            var staged = SortieRunner.Fly(new Options(Beat: beat, MaxSeconds: 1), "novice", 0, clone);
            Require(staged.Seconds > 0 && staged.Timeline.Count > 0, $"Beat {beat} produced no tape.");
        }
        var recovery = SortieRunner.Fly(new Options(MaxSeconds: 600, RtbAfterSeconds: 1), "ace", 0, clone);
        Require(recovery.Completed && recovery.Landed && recovery.Outcome == "recovered",
            $"The shared pilot did not fly a physical full stop: {recovery.Outcome} {recovery.LandingDetail}");
        // Regressions from the first cohort: a fixed join waypoint could be orbited
        // forever after both high-altitude novice combat and a successful ace opening.
        foreach (string pilot in new[] { "novice", "ace" }) {
            var joined = SortieRunner.Fly(new Options(MaxSeconds: 2400), pilot, 1, clone);
            CheckClocks(joined);
            if (pilot == "ace") Require(joined.CompressionSimSeconds.GetValueOrDefault(8) > 0, "Recovery never exercised eligible compression.");
            Require(joined.Completed && joined.Landed, $"Runway join orbit regressed for {pilot}: {joined.Outcome}");
        }
        Console.WriteLine("PASS: clone reference cases, deterministic/varied seeds, all 14 beats stage, timeout/partial-bin accounting, real near-miss passages, mixed-factor dual clocks, End without landing, compressed physical runway recovery, CLI validation.");
    }
    static void CheckRtbAutopilotLifecycle() {
        static void Require(bool value, string message) { if (!value) throw new Exception(message); }
        // Test fixture only; measured sorties below always fly from their authored state.
        var s = new SimulationSession(7, serviceLifeCaptureEnabled: false);
        s.Begin();
        Require(s.TryRequestReturnToBase(), "RTB fixture did not accept return.");
        for (int i = 0; i < 1200 && !s.PlayerRtbActive; i++) s.StepFixed();
        var runway = s.ConventionalRunwayRecovery!.Runway;
        s.Player.AdoptExternalKinematics(new AircraftState(
            runway.Threshold - runway.Forward * 30000 + new Vec3D(0, 3000, 0),
            220, 0, runway.HeadingRad, 0, s.Player.State.Mass));
        s.StepFixed(120);
        var pilot = new LabPilot("ace", 0, null, 600);
        pilot.Drive(s);
        Require(s.RtbAutopilotActive, "Lab did not engage RTB AP.");
        for (int i = 0; i < 120; i++) {
            pilot.Drive(s);
            Require(s.Controls.ScriptedPilotOverride is null, "Lab kept steering during AP.");
            Require(s.Advance(0, 8) == 8, "Lab input dropped active AP.");
            s.StepFixed();
        }
        var quiet = s.Player.State;
        s.Player.AdoptExternalKinematics(quiet with {
            Position = s.Bandit.State.Position + new Vec3D(0, 0, -9000)
        });
        Require(s.Advance(0, 8) == 1 && !s.RtbAutopilotActive, "Threat did not drop lab AP.");
        pilot.Drive(s);
        Require(!s.RtbAutopilotActive, "Lab overrode an uncleared threat.");
        s.Player.AdoptExternalKinematics(quiet);
        pilot.Drive(s);
        Require(s.RtbAutopilotActive && s.Controls.ScriptedPilotOverride is null,
            "Lab did not re-engage and release controls after threat cleared.");
        Require(s.Advance(0, 8) == 8, "Lab retry did not restore compression.");
        Console.WriteLine("PASS: lab RTB AP engage, hands-off, threat drop, blocked retry, cleared retry.");
    }

    static void CheckClocks(RunResult r) {
        static void Near(double actual, double expected, string label) {
            if (Math.Abs(actual - expected) > 1e-6) throw new Exception($"{label}: {actual} != {expected}");
        }
        Near(r.Timeline.Sum(x => x.Duration), r.PerceivedSeconds, "Player bins");
        Near(r.Timeline.Sum(x => x.SimDuration), r.Seconds, "Sim bins");
        Near(r.PhaseSeconds.Values.Sum(), r.PerceivedSeconds, "Player phases");
        Near(r.SimPhaseSeconds.Values.Sum(), r.Seconds, "Sim phases");
        Near(r.CompressionSimSeconds.Sum(x => x.Value / x.Key), r.PerceivedSeconds, "Weighted factors");
        Near(r.Timeline.Sum(x => x.DeadAirSeconds), r.DeadAirSeconds, "Player dead air");
        Near(r.Timeline.Sum(x => x.SimDeadAirSeconds), r.SimDeadAirSeconds, "Sim dead air");
        foreach (var bin in r.Timeline) {
            Near(bin.PhaseSeconds.Values.Sum(), bin.Duration, "Bin player phases");
            Near(bin.SimPhaseSeconds.Values.Sum(), bin.SimDuration, "Bin sim phases");
        }
    }
    static int ShotPass(double crossM, bool relief) {
        // Instrument fixture only: these state writes never occur in SortieRunner.
        var s = new SimulationSession(7); s.Begin();
        var player = s.Player.State with { Position = new Vec3D(0, 1000, 0), Speed = 0, Chi = 0, Gamma = 0, Bank = 0 };
        var shooter = player with { Position = new Vec3D(crossM, 1000, -100) };
        s.Player.AdoptExternalKinematics(player);
        var observer = new ExperienceObserver(new Options(), "fixture", 0);
        long targetId = relief ? 999 : 0;
        s.OpponentGun.RegisterTarget(targetId);
        var targets = new[] { new GunTarget(targetId, player) };
        for (int i = 0; i < 40; i++) {
            observer.BeforeStep(s);
            s.OpponentGun.Step(i == 0, shooter, targetId, targets, SortieRunner.Dt);
            observer.Observe(s, Array.Empty<string>());
        }
        return observer.Finish(s, 0).ShotNearMisses;
    }
}
