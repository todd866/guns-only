using System.Diagnostics;
using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;

namespace GunsOnly.PlaytestLab;

public sealed record Options(int Beat = 7, int Seeds = 30, int StartSeed = 0,
    int MaxSeconds = 3600, int RtbAfterSeconds = 600, string Pilots = "clone,novice,ace",
    double ThreatRangeM = 2500, double ShotMissM = 25, double GroundMissM = 100,
    string Output = "", bool SelfTest = false, bool EndAfterCombat = false) {
    public static Options Parse(string[] args) {
        var o = new Options();
        for (int i = 0; i < args.Length; i++) {
            string k = args[i];
            if (k == "--end-after-combat") { o = o with { EndAfterCombat = true }; continue; }
            if (k == "--self-test") { o = o with { SelfTest = true }; continue; }
            if (k == "--help") {
                Console.WriteLine("playtest-lab [--beat 1..14] [--seeds 30] [--start-seed 0] [--pilots clone,novice,ace] [--max-seconds 3600] [--rtb-after 600] [--threat-km 2.5] [--near-miss-m 25] [--ground-m 100] [--out DIR] [--end-after-combat] [--self-test]");
                Environment.Exit(0);
            }
            if (++i == args.Length) throw new ArgumentException($"Missing value for {k}");
            string v = args[i];
            o = k switch {
                "--beat" => o with { Beat = int.Parse(v) },
                "--seeds" => o with { Seeds = int.Parse(v) },
                "--start-seed" => o with { StartSeed = int.Parse(v) },
                "--max-seconds" => o with { MaxSeconds = int.Parse(v) },
                "--rtb-after" => o with { RtbAfterSeconds = int.Parse(v) },
                "--pilots" => o with { Pilots = v },
                "--threat-km" => o with { ThreatRangeM = double.Parse(v, CultureInfo.InvariantCulture) * 1000 },
                "--near-miss-m" => o with { ShotMissM = double.Parse(v, CultureInfo.InvariantCulture) },
                "--ground-m" => o with { GroundMissM = double.Parse(v, CultureInfo.InvariantCulture) },
                "--out" => o with { Output = v },
                _ => throw new ArgumentException($"Unknown option {k}")
            };
        }
        if (!Beats.IsBuiltInIndex(o.Beat) || o.Seeds < 1 || o.Seeds > 10000
            || o.StartSeed < 0 || o.StartSeed > int.MaxValue - o.Seeds
            || o.MaxSeconds < 1 || o.MaxSeconds > 14400 || o.RtbAfterSeconds < 1
            || !double.IsFinite(o.ThreatRangeM) || o.ThreatRangeM <= 0
            || !double.IsFinite(o.ShotMissM) || o.ShotMissM <= 0
            || !double.IsFinite(o.GroundMissM) || o.GroundMissM <= 0
            || o.PilotNames.Any(p => p is not ("clone" or "novice" or "ace"))
            || o.PilotNames.Length != o.PilotNames.Distinct().Count())
            throw new ArgumentException("Invalid beat, pilot, seed count, time limit, or threshold; see --help.");
        return o;
    }
    public string[] PilotNames => Pilots.Split(',');
}

public static class Program {
    public static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    public static int Main(string[] args) {
        CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;
        try {
            Options o = Options.Parse(args);
            string root = FindRoot();
            string clonePath = Path.Combine(root, "analysis/owner-pilot-clone.json");
            var clone = o.PilotNames.Contains("clone") || o.SelfTest ? new ClonedPilotPolicy(clonePath) : null;
            if (o.SelfTest) { LabChecks.Run(clone!); return 0; }
            string date = DateTime.Now.ToString("yyyy-MM-dd");
            string output = Path.GetFullPath(o.Output.Length > 0 ? o.Output : Path.Combine(root, $"analysis/playtest/{date}-beat{o.Beat}"));
            // Fail before clobbering evidence. Use a new --out for repeated experiments.
            if (Directory.Exists(output) && Directory.EnumerateFileSystemEntries(output).Any())
                throw new ArgumentException($"Output is not empty: {output}. Choose a fresh --out directory.");
            Directory.CreateDirectory(Path.Combine(output, "runs"));
            string sourceCommit = GitCommit(root);
            string cloneHash = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(clonePath))).ToLowerInvariant();
            var files = new List<string>();
            var wall = Stopwatch.StartNew();
            foreach (string pilot in o.PilotNames)
            for (int seed = o.StartSeed; seed < o.StartSeed + o.Seeds; seed++) {
                CheckPowerAdmission();
                RunResult run = SortieRunner.Fly(o, pilot, seed, clone);
                string rel = $"runs/{pilot}-{seed:D4}.json.gz";
                using (var file = File.Create(Path.Combine(output, rel)))
                using (var zip = new GZipStream(file, CompressionLevel.Optimal))
                    JsonSerializer.Serialize(zip, run, Json);
                files.Add(rel);
                // Checkpoint the manifest after every sortie; interrupted batches remain inspectable.
                var manifest = new {
                    schemaVersion = 2, date, beat = o.Beat, seeds = o.Seeds, startSeed = o.StartSeed,
                    maxSeconds = o.MaxSeconds, rtbAfterSeconds = o.RtbAfterSeconds,
                    command = "tools/playtest-lab/run " + string.Join(' ', args.Select(Quote)),
                    sourceCommit, cloneSha256 = cloneHash,
                    wallSeconds = wall.Elapsed.TotalSeconds, options = o,
                    notes = new[] {
                        "Experience proxies, not a claim to measure human feelings. 120 Hz production simulation; perceived-second bins preserve tick events and factor-weighted phase/dead-air durations. Perceived seconds = sum(fixed dt / pre-tick kernel factor); simulated seconds remain separate. Continuous factor-weighted experience, not exact browser frame timing or CPU WallSeconds. No renderer or wall-clock pacing.",
                        "Fresh director per sortie; no progression imported. Seeds deterministically vary pilot reaction latency, aim bias, opening hands-off time, escalating-wave geometry/doctrine, and seeded RTB bounce. Paired seeds use the same perturbation draws for each pilot.",
                        "Clone is the committed owner-pilot-clone policy (canonical features and reference-case validation), held at its training cadence of 20 Hz. Novice adapts BanditPressureReport's pursuit pilot. Ace adapts FirstMergeOpeningAcceptanceTests.HudPilot with delayed body-frame cue observations and bounded analog controls. Shared recovery and terrain escape use the existing scripted command seam; this is not a human usability study.",
                        $"Threat: live bandit within {o.ThreatRangeM:F0} m and nose within 35 degrees, or firing; includes wingmen. Gun target: selected live target with authorized ballistic solution. Dead air: no threat, no gun opportunity, no player shot, decision, spectacle or near miss. Initial begin is not counted as a decision.",
                        $"Shot near miss: unique hostile gun round's swept separation within {o.ShotMissM:F0} m outside its hit radius; counted only on passage, not repeated ticks. Ground near miss: entry below {o.GroundMissM:F0} m AGL with 25 m hysteresis, excluding configured recovery/contact. Explosions are labelled destruction/impact proxies from session events, not renderer effects.",
                        $"RTB choice: combat complete, bingo, empty gun, or {o.RtbAfterSeconds}s combat budget, through TryRequestReturnToBase. Recovery/navigation follows the published RTB cue, releases steering during eligible 8x transit, then uses a conventional straight-in join. This is not learned owner behaviour or an overhead-pattern model. End-after-combat={o.EndAfterCombat}: TryEndSortie at the first eligible pilot update, without recovery credit. A {o.MaxSeconds} simulated-second limit is censored, never a win or fabricated landing.",
                        "Tension heuristic: 0.35 proximity + 0.15 positive closure (within threat range) + 0.25 threat + 0.15 damage-risk under threat + 0.10 low-clearance risk; clamped 0..1, near shots at least 0.85 and hits at least 0.95. Engagement means exclude RTB and terminal wreck descent. Phase percentages include wreck/debrief time.",
                        "Default native terrain is the session's authored/default surface, without the browser's streamed terrain atlas. Ground-clearance results describe that substrate. CASEVAC uses semantic navigation for all profiles; fixed-wing clone/gun/G metrics do not apply. Generic pilots attempt every built-in beat; specialist mission failures and timeouts remain visible."
                    }, runs = files
                };
                string temp = Path.Combine(output, "manifest.json.tmp");
                File.WriteAllText(temp, JsonSerializer.Serialize(manifest, new JsonSerializerOptions(Json) { WriteIndented = true }));
                File.Move(temp, Path.Combine(output, "manifest.json"), true);
                Console.WriteLine($"{pilot,-6} s{seed:D3} {run.Outcome,-10} {run.PerceivedSeconds,7:F1}s player {run.Seconds,7:F1}s sim K{run.Kills} H{run.HitsGiven}/{run.HitsTaken} dead {run.LongestDeadAirSeconds:F1}s {run.Seconds / Math.Max(.001, run.WallSeconds):F0}x");
            }
            var reportStart = new ProcessStartInfo("python3") { UseShellExecute = false };
            reportStart.ArgumentList.Add(Path.Combine(root, "tools/playtest-lab/report.py"));
            reportStart.ArgumentList.Add(output);
            using var reporter = Process.Start(reportStart)!;
            reporter.WaitForExit();
            if (reporter.ExitCode != 0) throw new InvalidOperationException("Report failed; raw runs and manifest are saved. Re-run report.py on the output directory.");
            Console.WriteLine(output);
            return 0;
        } catch (Exception e) { Console.Error.WriteLine($"playtest-lab: {e}"); return 1; }
    }
    static string Quote(string s) => "'" + s.Replace("'", "'\\''") + "'";
    static void CheckPowerAdmission() {
        string? guard = Environment.GetEnvironmentVariable("PLAYTEST_POWER_GUARD");
        if (string.IsNullOrEmpty(guard)) return;
        var start = new ProcessStartInfo("python3") { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
        start.ArgumentList.Add(guard); start.ArgumentList.Add("status");
        using var process = Process.Start(start)!;
        string stdout = process.StandardOutput.ReadToEnd(), stderr = process.StandardError.ReadToEnd();
        process.WaitForExit();
        if (process.ExitCode != 0) throw new InvalidOperationException($"Power guard held the next sortie; completed runs are saved. {stdout} {stderr}");
    }
    static string FindRoot() {
        for (var p = new DirectoryInfo(AppContext.BaseDirectory); p is not null; p = p.Parent)
            if (File.Exists(Path.Combine(p.FullName, "analysis/owner-pilot-clone.json"))) return p.FullName;
        throw new InvalidOperationException("Run from a built checkout with analysis/owner-pilot-clone.json.");
    }
    static string GitCommit(string root) {
        using var p = Process.Start(new ProcessStartInfo("git", "rev-parse HEAD") { WorkingDirectory = root, RedirectStandardOutput = true, UseShellExecute = false })!;
        string s = p.StandardOutput.ReadToEnd().Trim(); p.WaitForExit(); return s;
    }
}

public static class SortieRunner {
    public const double Dt = 1.0 / AircraftSim.TickHz;
    public static RunResult Fly(Options o, string name, int seed, ClonedPilotPolicy? clone) {
        var watch = Stopwatch.StartNew();
        var s = new SimulationSession(o.Beat, serviceLifeCaptureEnabled: false);
        s.DecisionCaptureEnabled = false; // training recorder is unrelated to the experience tape
        var pilot = new LabPilot(name, seed, clone, o.RtbAfterSeconds, o.EndAfterCombat);
        var observer = new ExperienceObserver(o, name, seed);
        s.ConfigureSortieSeed(seed);
        s.Begin();
        double perceivedSeconds = 0;
        for (int tick = 0; tick < o.MaxSeconds * AircraftSim.TickHz && s.Lifecycle == SimulationSession.LifecycleState.Active; tick++) {
            IReadOnlyList<string> decisions = pilot.Drive(s, perceivedSeconds);
            if (s.Lifecycle != SimulationSession.LifecycleState.Active) {
                observer.ObserveTerminal(s, decisions); break;
            }
            // The native per-tick seam documented by the production RTB API keeps
            // near-miss passages observable. Advance(0, 8) negotiates the real
            // safety decision; StepFixed is exactly one ordinary 120 Hz tick.
            int entryFactor = s.Advance(0, maximumCompressionFactor: 8);
            string inhibitReason = s.TimeCompressionInhibitReason.ToString();
            long before = s.Tick;
            observer.BeforeStep(s);
            s.StepFixed();
            if (s.Tick != before + 1) throw new InvalidOperationException("Expected one production tick.");
            observer.Observe(s, decisions, entryFactor, inhibitReason);
            perceivedSeconds += Dt / entryFactor;
        }
        return observer.Finish(s, watch.Elapsed.TotalSeconds);
    }
}
