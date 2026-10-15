using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Training;

namespace GunsOnly.PlaytestLab;

public static class LabChecks {
    public static void Run(ClonedPilotPolicy clone) {
        static void Require(bool value, string message) { if (!value) throw new Exception(message); }
        Require(Math.Abs(ExperienceObserver.SegmentDistance(new Vec3D(-100, 10, 0), new Vec3D(100, 10, 0)) - 10) < 1e-9,
            "Swept near-miss distance lost a fast passing round.");
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
        foreach (int invalid in new[] { 0, 15 }) {
            bool rejected = false;
            try { Options.Parse(new[] { "--beat", invalid.ToString() }); } catch (ArgumentException) { rejected = true; }
            Require(rejected, "Unknown beat silently became Perch.");
        }
        Console.WriteLine("PASS: clone reference cases, paired deterministic replays, censoring, timeline accounting, swept distance, CLI validation.");
    }
}
