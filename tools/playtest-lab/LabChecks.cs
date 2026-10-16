using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;

namespace GunsOnly.PlaytestLab;

public static class LabChecks {
    public static void Run(ClonedPilotPolicy clone) {
        PathfinderChecks.Run();
        static void Require(bool value, string message) { if (!value) throw new Exception(message); }
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
            Require(Math.Abs(a.PhaseSeconds.Values.Sum() - a.Seconds) < 1e-6, "Phase duration mismatch.");
            Require(Math.Abs(a.Timeline.Sum(x => x.Duration) - a.Seconds) < 1e-6, "Timeline duration mismatch.");
            Require(a.Timeline.Sum(x => x.RoundsFired) == a.RoundsFired && a.Timeline.Sum(x => x.HitsGiven) == a.HitsGiven,
                "Per-second deltas disagree with sortie totals.");
            Require(a.Timeline.All(x => x.Tension is >= 0 and <= 1), "Tension outside 0..1.");
        }
        foreach (int invalid in new[] { 0, 16 }) {
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
        foreach (int beat in Enumerable.Range(1, 15)) {
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
            Require(joined.Completed && joined.Landed, $"Runway join orbit regressed for {pilot}: {joined.Outcome}");
        }
        Console.WriteLine("PASS: clone reference cases, deterministic/varied seeds, all 15 beats stage, timeout/partial-bin accounting, real near-miss passages, physical runway recovery, CLI validation.");
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
