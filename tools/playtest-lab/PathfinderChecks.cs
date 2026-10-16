using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.PlaytestLab;

public static class PathfinderChecks {
    static void Require(bool ok, string message) { if (!ok) throw new Exception(message); }
    public static void Run() {
        Require(Options.Parse(new[] { "--beat", "15" }).Pilots == "hunter-novice,hunter-ace,reckless", "Beat 15 default pilots missing.");
        foreach (bool envelope in new[] { false, true }) {
            var r = ShotFixture(envelope);
            var p = r.Pathfinder!;
            Require(r.Timeline.Sum(t => t.RoundsFired) == r.RoundsFired, "Pathfinder rounds lost between bins.");
            Require(p.DroneReleases == 0 && p.DroneKills == 0,
                "Gun-only fixture must not fabricate a drone release or kill.");
            Require(p.Passes == 1, "Physical encounter must count exactly once.");
            if (envelope) {
                Require(p.EnvelopeHits > 0 && p.EnvelopeOnlyPasses == 1 && p.MissedPasses == 1 && p.SectorsDenied == 0,
                    "Envelope-only teaching pass was misclassified.");
                Require(p.PassesPerKill is null && p.EnvelopeOnlyPassPct == 100, "Zero-kill denominator fabricated a ratio.");
            } else {
                Require(p.FirstGunWindowSeconds is not null && r.Events.Any(e => e.Kind == "pathfinder:gun-window-closed"), "A physical aligned fixture produced no window transition.");
                Require(p.GondolaKills == 1 && p.RoeViolations == 1 && p.SectorsDenied == 1 && p.SafeKills == 0,
                    "Physical ROE-violating gondola kill must still deny one sector.");
                Require(p.PassesPerKill == 1 && p.MissedPasses == 0, "Killed pass counted as miss.");
                foreach (var kind in new[] { "gondola-kill", "sector-denied", "roe-violation" })
                    Require(r.Events.Count(e => e.Kind == "pathfinder:" + kind) == 1, "Kill event not unique: " + kind);
            }
        }
        var droneMission = PathfinderMissionDefinition.FirstLight(42);
        var droneLedger = new PathfinderMission(droneMission, droneMission.Weather);
        var droneEngagement = droneLedger.Engage(1, PathfinderBalloonComponent.Gondola, "drone");
        Require(droneEngagement.RelayDenied && droneEngagement.Source == "drone"
            && droneLedger.DroneKills == 1
            && droneLedger.KillRecords.Count(k => k.Source == "drone") == droneLedger.DroneKills,
            "Drone source ledger must conserve source-tagged kills.");
        foreach (var name in new[] { "hunter-novice", "hunter-ace", "reckless" }) {
            var options = new Options(Beat: 15, MaxSeconds: 25, Pilots: name);
            var a = SortieRunner.Fly(options, name, 3, null);
            var b = SortieRunner.Fly(options, name, 3, null);
            a.WallSeconds = b.WallSeconds = 0;
            Require(JsonSerializer.Serialize(a, Program.Json) == JsonSerializer.Serialize(b, Program.Json), "Pathfinder replay drift: " + name);
            Require(a.Outcome == "incomplete" && a.Pathfinder!.HuntCensored, "Emergency cutoff invented a hunt completion.");
            Require(Math.Abs(a.PhaseSeconds.Values.Sum() - a.Seconds) < 1e-6, "Pathfinder phases lost time.");
            Require(Math.Abs(a.Timeline.Sum(t => t.GunEnvelopeSeconds) - a.Pathfinder!.GunWindowSeconds) < 1e-6,
                "Gun window duration disagrees with tick bins.");
            Require(a.Events.All(e => e.Second >= 0 && e.Second <= a.Seconds + 1e-6), "Event outside observed tape.");
        }
        var aceOpening = SortieRunner.Fly(new Options(Beat: 15, MaxSeconds: 25), "hunter-ace", 0, null);
        Require(aceOpening.Kills >= 1 && aceOpening.RoundsFired > 0, "Ace failed its physical opening-pass sanity check.");
        var shortRun = SortieRunner.Fly(new Options(Beat: 15, MaxSeconds: 2), "hunter-ace", 0, null);
        Require(shortRun.Pathfinder!.FirstGunWindowSeconds is null
            && Math.Abs(shortRun.Pathfinder.LongestGunWindowGapSeconds - 2) < 1e-8, "Missing-window censor did not retain full drought.");
        Console.WriteLine("PASS: Pathfinder public-input replays, physical envelope/gondola ROE event accounting, no synthetic drones, censoring and tick conservation.");
    }
    static RunResult ShotFixture(bool envelope) {
        // Test-only initial geometry follows PathfinderSessionGunResolvesPhysicalKillAndRoeAtContact.
        // It is never used by cohort SortieRunner; all damage still comes from physical gun rounds.
        var original = Beats.RapierPathfinders();
        var weather = new WeatherProfile(StandardAtmosphere1976.Instance, new LayeredWindField(new[] {
            new WindVectorLevel(0, Vec3D.Zero), new WindVectorLevel(25000, Vec3D.Zero) }));
        var area = new PathfinderPopulatedArea("fixture-town", new[] { new Vec3D(-1000, 0, -1000), new Vec3D(1000, 0, -1000), new Vec3D(1000, 0, 1000), new Vec3D(-1000, 0, 1000) });
        var definition = new PathfinderMissionDefinition(42, new[] { new PathfinderBalloonSpawn(1, new Vec3D(0, 20600, 0)) }, new[] { area }, weather);
        var point = new Vec3D(0, 20600, 0) + (envelope ? Vec3D.Zero : PathfinderRelayCard.GondolaOffsetM);
        var player = original.Player with { Position = point + new Vec3D(0, 0, -100), Chi = 0, Gamma = 0, BodyAttitude = QuaternionD.Identity };
        var s = new SimulationSession(15);
        s.StartBeat(() => original with { Pathfinder = definition, Player = player }); s.Begin();
        var observer = new ExperienceObserver(new Options(Beat: 15), "fixture", 42);
        for (int i = 0; i < 9 * AircraftSim.TickHz; i++) {
            if (i == 1) s.FeedKey(GKey.Trigger, true);
            if (i == 15) s.FeedKey(GKey.Trigger, false);
            observer.BeforeStep(s); s.StepFixed(); observer.Observe(s, Array.Empty<string>());
        }
        return observer.Finish(s, 0);
    }
}
