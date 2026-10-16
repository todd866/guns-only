using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.PlaytestLab;

public sealed class PathfinderMetrics {
    public double? FirstGunWindowSeconds { get; set; }
    public double? FirstRangeWindowSeconds { get; set; }
    public double RangeWindowSeconds { get; set; }
    public double? FirstQualifiedGunWindowSeconds { get; set; }
    public double QualifiedGunWindowSeconds { get; set; }
    public double LongestGunWindowGapSeconds { get; set; }
    public double LongestNonLoopGunWindowGapSeconds { get; set; }
    public double DeliberateLoopSeconds { get; set; }
    public double GunWindowSeconds { get; set; }
    public int GunWindows { get; set; }
    public double HuntSeconds { get; set; }
    public string HuntEndReason { get; set; } = "censored";
    public bool HuntCensored { get; set; } = true;
    public int Passes { get; set; }
    public int CensoredPasses { get; set; }
    public int EnvelopeOnlyPasses { get; set; }
    public int MissedPasses { get; set; }
    public int EnvelopeHits { get; set; }
    public int GondolaKills { get; set; }
    public int DroneReleases { get; set; }
    public int DroneKills { get; set; }
    public int DroneReleaseAttempts { get; set; }
    public int DroneReleaseRejected { get; set; }
    public int RoeDecisions { get; set; }
    public int RoeViolations { get; set; }
    public int SectorsDenied { get; set; }
    public int RelayCount { get; set; }
    public int SafeKills { get; set; }
    public string DroneCapability { get; set; } = "public release route; kills are source-tagged gun engagements";
    public double? PassesPerKill => GondolaKills + DroneKills == 0 ? null : (double)Passes / (GondolaKills + DroneKills);
    public double? EnvelopeOnlyPassPct => Passes == 0 ? null : 100.0 * EnvelopeOnlyPasses / Passes;
}

/// Measurements only; never mutates the session. Windows are the selected live gondola's
/// instantaneous ballistic solution, <=900 m, authorized and armed. Geometry is not a kill.
public sealed class PathfinderObserver {
    readonly RunResult result;
    readonly HashSet<int> visible = new();
    readonly Dictionary<int, Pass> passes = new();
    readonly PathfinderMetrics metrics = new();
    int killCursor, droneReleaseCursor, windowRelay, selectedRelay = -1;
    bool window, ended, bingo, deliberateLoop;
    double gap, nonLoopGap;
    sealed class Pass { public bool Envelope, Killed; public double Started; }
    public PathfinderObserver(RunResult result) { this.result = result; result.Pathfinder = metrics; }
    public static bool GunWindow(SimulationSession s) => s.Pathfinder is { } m
        && s.PlayerAlive && !s.PlayerRtbActive && s.PlayerWeaponsAuthorized && m.Gun.AmmoRemaining > 0
        && m.SelectedBalloon.RelayActive && m.Gun.InstantaneousGunSolution
        && (m.SelectedBalloon.GondolaPosition - s.Player.State.Position).Length <= 900;
    void Event(double time, string kind, int id = 0, int count = 1, string source = "observer") =>
        result.Events.Add(new LabEvent(time, "pathfinder:" + kind, source, id == 0 ? "" : "relay:" + id, count));
    public void Observe(SimulationSession s, IReadOnlyList<string> decisions, double time) {
        var m = s.Pathfinder!;
        metrics.RelayCount = m.Balloons.Count;
        if (!ended && !bingo && s.PlayerFuel.IsBingo) { bingo = true; Event(time, "bingo"); }
        foreach (var d in decisions) {
            if (d.StartsWith("loop:start:")) {
                deliberateLoop = true; nonLoopGap = 0;
                Event(time, "loop-start", int.Parse(d.Split(':')[3]), source: "pilot");
            } else if (d.StartsWith("loop:end:")) {
                deliberateLoop = false; nonLoopGap = 0;
                Event(time, "loop-end", int.Parse(d.Split(':')[3]), source: "pilot");
            }
            if (d.StartsWith("roe:")) { metrics.RoeDecisions++; Event(time, "roe-decision", int.Parse(d.Split(':')[2]), source: d); }
            if (d.StartsWith("drone:release:")) {
                metrics.DroneReleaseAttempts++;
                Event(time, "drone-release", int.Parse(d.Split(':')[3]), source: "gun");
            } else if (d.StartsWith("drone:release-rejected:")) {
                metrics.DroneReleaseAttempts++; metrics.DroneReleaseRejected++;
                Event(time, "drone-release-rejected", int.Parse(d.Split(':')[3]), source: "gun");
            }
        }
        // The mission counters are authoritative. A release is an input accepted by the
        // production store/release path; a drone kill is credited only by its own gun
        // engagement. Keep these separate from the player's Pathfinder gun ledger.
        while (droneReleaseCursor < m.DroneReleases) {
            droneReleaseCursor++;
            metrics.DroneReleases++;
        }
        // Impacts are authoritative and can occur shortly after the shooter changes target.
        foreach (var impact in m.Gun.ImpactsThisStep) {
            int id = checked((int)(impact.TargetId / 2));
            if (impact.TargetId % 2 != 0) continue;
            metrics.EnvelopeHits++;
            if (passes.TryGetValue(id, out var pass)) pass.Envelope = true;
            Event(time - SortieRunner.Dt + impact.StepFraction * SortieRunner.Dt, "envelope-hit", id, source: "gun");
        }
        while (killCursor < m.KillRecords.Count) {
            var k = m.KillRecords[killCursor++];
            bool drone = string.Equals(k.Source, "drone", StringComparison.OrdinalIgnoreCase);
            if (drone) metrics.DroneKills++;
            else metrics.GondolaKills++;
            if (passes.TryGetValue(k.BalloonId, out var pass)) pass.Killed = true;
            Event(k.TimeSeconds, drone ? "drone-kill" : "gondola-kill", k.BalloonId, source: k.Source);
            Event(k.TimeSeconds, "sector-denied", k.BalloonId, source: "mission");
            if (!k.KillRewardEligible) Event(k.TimeSeconds, "roe-violation", k.BalloonId, source: k.Classification.ToString());
        }
        metrics.SectorsDenied = m.RelaySectorsDenied; metrics.SafeKills = m.SafeKills; metrics.RoeViolations = m.RoeViolations;
        if (ended) return;
        bool stop = s.PlayerRtbActive || !s.PlayerAlive || s.Lifecycle != SimulationSession.LifecycleState.Active;
        metrics.HuntSeconds = time;
        if (selectedRelay != -1 && selectedRelay != m.SelectedBalloonId
            && passes.TryGetValue(selectedRelay, out var changedPass))
            ClosePass(selectedRelay, changedPass, time);
        selectedRelay = m.SelectedBalloonId;
        if (!stop) {
            foreach (var b in m.Balloons) {
                var delta = b.GondolaPosition - s.Player.State.Position;
                double range = delta.Length;
                bool inView = b.RelayActive && range < 30000 && delta.Normalized().Dot(s.Player.BodyForward) >= .5;
                if (inView && visible.Add(b.Id)) Event(time, "relay-in-view", b.Id);
                if (!inView) visible.Remove(b.Id);
                if (b.RelayActive && b.Id == m.SelectedBalloonId && range <= 6000 && !passes.ContainsKey(b.Id)) passes[b.Id] = new Pass { Started = time };
                if (passes.TryGetValue(b.Id, out var p) && (!b.RelayActive || range > 6500)) ClosePass(b.Id, p, time);
            }
        }
        bool inRange = !stop && m.SelectedBalloon.RelayActive && (m.SelectedBalloon.GondolaPosition - s.Player.State.Position).Length <= 900;
        if (inRange) { metrics.FirstRangeWindowSeconds ??= time; metrics.RangeWindowSeconds += SortieRunner.Dt; }
        if (inRange && s.PlayerWeaponsAuthorized && m.Gun.AmmoRemaining > 0 && m.Gun.GunSolution) {
            metrics.FirstQualifiedGunWindowSeconds ??= time; metrics.QualifiedGunWindowSeconds += SortieRunner.Dt;
        }
        bool nextWindow = !stop && GunWindow(s);
        int nextRelay = m.SelectedBalloonId;
        if (window && (!nextWindow || nextRelay != windowRelay)) Event(time, "gun-window-closed", windowRelay);
        if (nextWindow && (!window || nextRelay != windowRelay)) {
            Event(time, "gun-window-open", nextRelay); metrics.GunWindows++;
            metrics.FirstGunWindowSeconds ??= time;
        }
        window = nextWindow; windowRelay = nextRelay;
        if (nextWindow) { metrics.GunWindowSeconds += SortieRunner.Dt; gap = 0; nonLoopGap = 0; }
        else {
            gap += SortieRunner.Dt;
            metrics.LongestGunWindowGapSeconds = Math.Max(metrics.LongestGunWindowGapSeconds, gap);
            if (deliberateLoop) metrics.DeliberateLoopSeconds += SortieRunner.Dt;
            else { nonLoopGap += SortieRunner.Dt; metrics.LongestNonLoopGunWindowGapSeconds = Math.Max(metrics.LongestNonLoopGunWindowGapSeconds, nonLoopGap); }
        }
        if (stop) {
            metrics.HuntCensored = false;
            metrics.HuntEndReason = m.Complete || time >= m.Definition.HuntDeadlineSeconds
                ? m.EndReason
                : !s.PlayerAlive ? "aircraft-lost" : decisions.FirstOrDefault(d => d.StartsWith("RTB:")) ?? s.ReturnToBaseReason.ToString();
            Event(time, "egress", source: metrics.HuntEndReason);
            foreach (var (id, p) in passes.ToArray()) ClosePass(id, p, time);
            ended = true;
        }
    }
    void ClosePass(int id, Pass p, double time) {
        metrics.Passes++;
        if (p.Envelope && !p.Killed) metrics.EnvelopeOnlyPasses++;
        if (!p.Killed) { metrics.MissedPasses++; Event(time, "pass-missed", id, source: p.Envelope ? "envelope-only" : "no-kill"); }
        Event(time, "pass-ended", id, source: p.Killed ? "kill" : p.Envelope ? "envelope-only" : "miss");
        passes.Remove(id);
    }
    public void Finish(double time) {
        if (window) { Event(time, "gun-window-closed", windowRelay, source: "observation-ended"); window = false; }
        metrics.CensoredPasses = passes.Count;
    }
}
