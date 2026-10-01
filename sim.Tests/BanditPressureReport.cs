using System;
using System.Collections.Generic;
using System.Linq;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// THE INSTRUMENT FOR "IT'S MOSTLY PASSIVE, THEN IT KILLS ME, AND IT'S BORING" (owner, 2026-10-01).
///
/// Flies the production F-22 visual merge at every ramp rung against a closed-loop scripted pilot
/// driving the real session (assists, physiology and Auto-GCAS included, through
/// <see cref="DetentLayer.ScriptedPilotOverride"/>), and measures the opponent's pressure as a
/// player feels it, at 10 Hz:
///
///   * THREAT  — an opponent within 2.5 km with its nose within 35 degrees of the player, or with
///               its trigger down. This is "something is coming at me".
///   * PASSIVE — everything else, including the presentation orbit.
///   * SPIKE   — the most player hits taken inside any 5-second window.
///
/// Boring is a long PASSIVE run followed by a SPIKE. The owner's 2026-09-28 Build 371 flight was
/// 70 s of a presenting Competent that never fired: 100% passive.
/// </summary>
public sealed class BanditPressureReport {
    readonly ITestOutputHelper _output;
    public BanditPressureReport(ITestOutputHelper output) => _output = output;

    const double Dt = 1.0 / 120.0;
    const double ThreatRangeM = 2500.0;
    const double ThreatNoseRad = 35.0 * Math.PI / 180.0;

    public sealed record PressureResult(
        string Label, string Skill, int Formation, double Seconds,
        double PassiveShare, double LongestPassiveS, double FirstThreatS, double FirstRoundS,
        int OpponentRounds, int HitsTaken, int MaxHitsIn5S, int PlayerKills, int PlayerHits,
        double FiringShare, string End, string Tactics, double MedianRangeM, double GunRangeShare,
        double MedianPlayerAltM = double.NaN, double MedianBanditAltM = double.NaN);

    /// One rung's director state, built the same way production earns it.
    public static string? RungState(int rung) {
        if (rung <= 0) return null;
        var director = new FightDirector();
        if (rung == 1) {
            director.Observe(new EngagementReport(1, PilotSkill.Competent, false,
                SortieOutcome.Defeat, 60.0, 0.0, 3, 20, 2, 0, 300.0, 0, HitsScored: 1));
        } else {
            int kills = rung >= 3 ? 2 : 1;
            for (int e = 1; e <= kills; e++)
                director.Observe(new EngagementReport(e, PilotSkill.Competent, false,
                    SortieOutcome.Victory, 30.0, 0.0, 0, 4, 4, 0, 340.0, 0,
                    HitsScored: 3, GunKills: 1));
        }
        return director.ExportState();
    }

    /// A pilot who points at the bandit, pulls in proportion to the angle, leads by
    /// <see cref="PilotProfile.LeadFraction"/>, and fires when the gun cross is on the lead point.
    sealed class ScriptedPlayer {
        readonly PilotProfile _profile;
        readonly Queue<AircraftState> _seen = new();
        readonly int _latencyTicks;
        bool _trigger;
        public ScriptedPlayer(PilotProfile profile) {
            _profile = profile;
            _latencyTicks = Math.Max(1, (int)Math.Round(profile.ReactionLatencyS / Dt));
        }

        public void Drive(SimulationSession session) {
            if (!session.OpponentPresent || !session.PlayerAlive) {
                session.Controls.ScriptedPilotOverride = new PilotCommand(1.0, 0.0, 0.95, 0.0);
                SetTrigger(session, false);
                return;
            }
            AircraftState own = session.Player.State;
            _seen.Enqueue(session.Bandit.State);
            AircraftState contact = _seen.Count > _latencyTicks ? _seen.Dequeue() : _seen.Peek();

            Vec3D toContact = contact.Position - own.Position;
            double range = toContact.Length;
            Vec3D aim = contact.Position;
            if (_profile.LeadFraction > 0.0 && range > 1.0)
                aim += contact.VelocityVector() * (range / 1000.0 * _profile.LeadFraction);
            if (_profile.ClimbBiasRad > 0.0)
                aim += new Vec3D(0.0, range * Math.Sin(_profile.ClimbBiasRad), 0.0);
            // Terrain discipline every real pilot has: look three seconds ahead, and if the ground is
            // inside 500 m there, the fight waits — roll wings level and climb.
            double clearance = Clearance(session, own.Position);
            double ahead = Clearance(session, own.Position + own.VelocityVector() * 3.0);
            if (Math.Min(clearance, ahead) < 500.0) {
                session.Controls.ScriptedPilotOverride = new PilotCommand(
                    Math.Min(_profile.MaxG, 4.0), 0.0, 1.0, 0.0);
                SetTrigger(session, false);
                return;
            }

            Vec3D line = (aim - own.Position).Normalized();
            double angleOff = Math.Acos(Math.Clamp(own.ForwardDir().Dot(line), -1.0, 1.0));
            double bank = Math.Clamp(Geometry.BankToPlaceLiftVectorOn(own, aim),
                -_profile.MaxBankRad, _profile.MaxBankRad);
            double g = 1.0 + angleOff * 2.4;
            if (_profile.EnergyFloorMps > 0.0 && own.Speed < _profile.EnergyFloorMps) g = 1.0;
            g = Math.Clamp(g, 0.5, _profile.MaxG);
            double throttle = own.Speed < 260.0 ? 1.0 : 0.9;
            session.Controls.ScriptedPilotOverride = new PilotCommand(g, bank, throttle, 0.0);

            bool shot = range is > 150.0 and < 800.0 && angleOff < 1.5 * Math.PI / 180.0;
            SetTrigger(session, shot);
        }

        static double Clearance(SimulationSession session, Vec3D at) {
            double ground = 0.0;
            if (session.Terrain is { } terrain && terrain.TryHeightM(at.X, at.Z, out double h)) ground = h;
            return at.Y - ground;
        }

        void SetTrigger(SimulationSession session, bool down) {
            if (down == _trigger) return;
            _trigger = down;
            session.FeedKey(GKey.Trigger, down);
        }
    }

    public static PressureResult Fly(int rung, PilotProfile profile, double seconds, bool durable,
        int seed = 0) {
        // Seeds perturb only the player: a lateral spawn offset, a heading offset and reaction
        // latency. Single deterministic fights are chaotic — one tuning change flips the whole path —
        // so conclusions are drawn over seeds, never from one run.
        profile = profile with { ReactionLatencyS = profile.ReactionLatencyS * (1.0 + 0.15 * seed) };
        var session = new SimulationSession();
        string? state = RungState(rung);
        if (state is not null) session.ArmDirectorStateForNextStage(state);
        session.StartBeat(() => {
            BeatSetup beat = Beats.ModernVisualMerge();
            if (seed != 0) {
                AircraftState p0 = beat.Player;
                double heading = p0.Chi + seed * 4.0 * Math.PI / 180.0;
                beat = beat with { Player = p0 with {
                    Position = p0.Position + new Vec3D(Math.Cos(p0.Chi), 0.0, -Math.Sin(p0.Chi)) * (seed * 180.0),
                    Chi = heading } };
            }
            return durable
                ? beat with { Combat = beat.CombatRules with { PlayerHitsToDefeat = 1000 } }
                : beat;
        });
        session.Begin();
        var pilot = new ScriptedPlayer(profile);

        int ticks = (int)Math.Ceiling(seconds / Dt);
        int samples = 0, passive = 0, firing = 0, run = 0, longest = 0;
        double firstThreat = double.NaN, firstRound = double.NaN;
        var hitTimes = new List<double>();
        var tactics = new Dictionary<string, int>();
        var ranges = new List<double>();
        int inGunRange = 0;
        var playerAlt = new List<double>(); var banditAlt = new List<double>();
        int lastHits = 0;
        string skill = "?"; int formation = 0;
        int lastTick = 0;
        for (int tick = 0; tick < ticks; tick++) {
            lastTick = tick;
            if (session.Lifecycle != SimulationSession.LifecycleState.Active) break;
            pilot.Drive(session);
            session.Advance(Dt);
            double t = (tick + 1) * Dt;
            if (session.PlayerHitsTaken > lastHits) {
                for (int h = lastHits; h < session.PlayerHitsTaken; h++) hitTimes.Add(t);
                lastHits = session.PlayerHitsTaken;
            }
            if (double.IsNaN(firstRound) && session.SortieOpponentRoundsFired > 0) firstRound = t;
            if (tick % 12 != 0) continue;

            samples++;
            bool threat = false;
            if (session.OpponentPresent) {
                AircraftState p = session.Player.State;
                AircraftState b = session.Bandit.State;
                skill = session.Bandit switch {
                    NeutralMergeBandit m => m.Skill.ToString(),
                    ReactiveBandit r => r.Skill.ToString(),
                    _ => skill,
                };
                double nose = BanditFireControl.NoseErrorRad(b, ActorObservation.Capture(p, tick));
                double rangeNow = Geometry.Range(p, b);
                ranges.Add(rangeNow);
                playerAlt.Add(p.Position.Y); banditAlt.Add(b.Position.Y);
                Vec3D los = (p.Position - b.Position) * (1.0 / Math.Max(1.0, rangeNow));
                DebugBanditNose.Add(Math.Acos(Math.Clamp(b.ForwardDir().Dot(los), -1, 1)) * 57.3);
                DebugPlayerNose.Add(Math.Acos(Math.Clamp(p.ForwardDir().Dot(los * -1.0), -1, 1)) * 57.3);
                DebugClosure.Add(-(p.VelocityVector() - b.VelocityVector()).Dot(los));
                DebugSpeeds.Add((p.Speed, b.Speed));
                if ((session.Bandit as IBanditDecisionTraceSource)?.AppliedCommand is { } cmd) {
                    DebugThrottle.Add(cmd.Throttle); DebugG.Add(cmd.GDemand);
                }
                if (rangeNow < 900.0) inGunRange++;
                string tactic = session.Bandit.Presenting ? "Present"
                    : (session.Bandit as IBanditDecisionTraceSource)?.PolicyMemory.Tactic.ToString() ?? "?";
                tactics[tactic] = tactics.GetValueOrDefault(tactic) + 1;
                if (Trace is not null && tick % 600 == 0)
                    Trace($"   t={t,5:F0} range={rangeNow,6:F0} altP={p.Position.Y,6:F0} altB={b.Position.Y,6:F0} tac={tactic,-8} spdP={p.Speed,4:F0} spdB={b.Speed,4:F0} rounds={session.SortieOpponentRoundsFired}");
                threat = (Geometry.Range(p, b) < ThreatRangeM && nose < ThreatNoseRad
                          && !session.Bandit.Presenting)
                    || session.OpponentTriggerDown;
            }
            formation = Math.Max(formation, (session.OpponentPresent ? 1 : 0) + session.Wingmen.Count);
            if (session.OpponentTriggerDown) firing++;
            if (threat) {
                if (double.IsNaN(firstThreat)) firstThreat = t;
                run = 0;
            } else {
                passive++;
                run++;
                longest = Math.Max(longest, run);
            }
        }

        int maxIn5 = 0;
        for (int i = 0; i < hitTimes.Count; i++)
            maxIn5 = Math.Max(maxIn5, hitTimes.Count(h => h >= hitTimes[i] && h < hitTimes[i] + 5.0));
        string end = session.Lifecycle == SimulationSession.LifecycleState.Active
            ? "time" : session.PlayerAlive ? "ended-alive" : session.PlayerTerminalState.ToString();
        return new PressureResult(
            $"rung {rung} vs {profile.Name}{(durable ? " (durable)" : "")}", skill, formation,
            (lastTick + 1) * Dt,
            samples == 0 ? 1.0 : (double)passive / samples, longest * 12 * Dt,
            firstThreat, firstRound, session.SortieOpponentRoundsFired, session.PlayerHitsTaken,
            maxIn5, session.KillCount, session.SortiePlayerHits,
            samples == 0 ? 0.0 : (double)firing / samples, end,
            string.Join(" ", tactics.OrderByDescending(kv => kv.Value)
                .Select(kv => $"{kv.Key}:{100.0 * kv.Value / Math.Max(1, samples):F0}%")),
            ranges.Count == 0 ? double.NaN : ranges.OrderBy(x => x).ElementAt(ranges.Count / 2),
            samples == 0 ? 0.0 : (double)inGunRange / samples,
            Median(playerAlt), Median(banditAlt));
    }

    static readonly List<double> DebugBanditNose = new(), DebugPlayerNose = new(), DebugClosure = new();
    static readonly List<(double P, double B)> DebugSpeeds = new();
    static readonly List<double> DebugThrottle = new(), DebugG = new();
    public static Action<string>? Trace;
    static double Median(List<double> xs) => xs.Count == 0 ? double.NaN : xs.OrderBy(x => x).ElementAt(xs.Count / 2);

    /// PRESSURE_CASES="2:cohort,3:competent" narrows the sweep while iterating.
    static IEnumerable<(int Rung, PilotProfile Pilot)> Cases() {
        string? filter = System.Environment.GetEnvironmentVariable("PRESSURE_CASES");
        foreach (int rung in new[] { 0, 1, 2, 3 })
        foreach (PilotProfile pilot in Pilots)
            if (string.IsNullOrEmpty(filter) || filter.Split(',').Contains($"{rung}:{pilot.Name}"))
                yield return (rung, pilot);
    }

    /// THE CONTRACT. Under production rules a trying pilot must be shot at, and early. Judged over
    /// three seeds because single fights are chaotic. Origin/main (Build 372) failed both rows:
    /// Ace earliest first round 86 s and 21 rounds across the three fights; Veteran 25 rounds.
    /// This change measured Ace 36 s / 115 rounds.
    [Theory]
    [InlineData(2, 60.0, 60)]
    [InlineData(1, 60.0, 30)]
    public void ATryingPilotIsShotAtEarly(int rung, double firstRoundWithinS, int minimumRounds) {
        var runs = Enumerable.Range(0, 3)
            .Select(seed => Fly(rung, PilotProfile.Competent, 120.0, durable: false, seed)).ToList();
        string detail = string.Join("; ", runs.Select(r =>
            $"first {r.FirstRoundS:F0}s rounds {r.OpponentRounds} passive {r.PassiveShare:P0}"));
        double earliest = runs.Where(r => !double.IsNaN(r.FirstRoundS))
            .Select(r => r.FirstRoundS).DefaultIfEmpty(double.PositiveInfinity).Min();
        Assert.True(earliest <= firstRoundWithinS,
            $"rung {rung}: no fight drew a round within {firstRoundWithinS:F0} s ({detail})");
        Assert.True(runs.Sum(r => r.OpponentRounds) >= minimumRounds,
            $"rung {rung}: only {runs.Sum(r => r.OpponentRounds)} rounds across 3 fights ({detail})");
    }

    public static readonly PilotProfile[] Pilots = { PilotProfile.Cohort, PilotProfile.Competent };

    /// The full sweep: 8 cases x PRESSURE_SEEDS seeds x 240 s. Minutes, so opt-in:
    ///   PRESSURE_REPORT=1 PRESSURE_SEEDS=4 dotnet test sim.Tests \
    ///     --filter FullyQualifiedName~BanditPressureReport.ReportPressureAcrossTheRamp \
    ///     --logger "console;verbosity=detailed"
    /// PRESSURE_CASES="2:cohort,0:competent" narrows it; PRESSURE_TRACE=1 prints a 5 s time series.
    ///
    /// 2026-10-01, 4 seeds, origin/main (Build 372) -> this change, rounds/min fired at the player:
    ///   rung 0 vs competent 1.9 -> 6.2 | rung 1 vs cohort 0.0 -> 32.6 | rung 2 vs cohort 0.0 -> 5.9
    ///   rung 2 vs competent 3.7 -> 30.2 | rung 3 vs competent 2.7 -> 19.2
    ///   runs in which the opponent never fired: 18 of 32 -> 6 of 32.
    /// Still open: rung 0 vs the climbing cohort profile stays ~93% passive, and the rung-3 pair
    /// is passive ~80% of the time (formation Extend/Bracket roles).
    [Fact]
    public void ReportPressureAcrossTheRamp() {
        if (System.Environment.GetEnvironmentVariable("PRESSURE_REPORT") != "1") return;
        _output.WriteLine("label                              skill      f   secs  passive  longestP  1stThreat  1stRound  rounds  hitsTaken  max5s  kills  myHits  firing  end");
        if (System.Environment.GetEnvironmentVariable("PRESSURE_TRACE") == "1") Trace = _output.WriteLine;
        int seeds = int.TryParse(System.Environment.GetEnvironmentVariable("PRESSURE_SEEDS"), out int n) ? n : 1;
        foreach (var (rung, pilot) in Cases()) {
            var runs = Enumerable.Range(0, seeds).Select(seed => Fly(rung, pilot, 240.0, durable: false, seed)).ToList();
            if (seeds > 1) {
                _output.WriteLine($"SUMMARY rung {rung} vs {pilot.Name} x{seeds}: passive {runs.Average(x => x.PassiveShare):P0}"
                    + $" | worst gap {runs.Max(x => x.LongestPassiveS):F0}s | mean gap {runs.Average(x => x.LongestPassiveS):F0}s"
                    + $" | rounds/min {runs.Sum(x => x.OpponentRounds) / runs.Sum(x => x.Seconds) * 60:F1}"
                    + $" | no-fire runs {runs.Count(x => x.OpponentRounds == 0)}"
                    + $" | shot down {runs.Count(x => x.HitsTaken >= 3)} | max5s {runs.Max(x => x.MaxHitsIn5S)}"
                    + $" | inside900 {runs.Average(x => x.GunRangeShare):P0} | mean secs {runs.Average(x => x.Seconds):F0}");
            }
            foreach (PressureResult r in runs) {
            _output.WriteLine(
                $"{r.Label,-34} {r.Skill,-9} {r.Formation,2} {r.Seconds,6:F0}  {r.PassiveShare,6:P0}  {r.LongestPassiveS,7:F0}s"
                + $"  {r.FirstThreatS,8:F0}s  {r.FirstRoundS,7:F0}s  {r.OpponentRounds,6}  {r.HitsTaken,9}  {r.MaxHitsIn5S,5}"
                + $"  {r.PlayerKills,5}  {r.PlayerHits,6}  {r.FiringShare,6:P0}  {r.End}");
                _output.WriteLine($"      tactics {r.Tactics} | median range {r.MedianRangeM:F0} m | inside 900 m {r.GunRangeShare:P0} | alt player {r.MedianPlayerAltM:F0} bandit {r.MedianBanditAltM:F0}");
            }
            _output.WriteLine($"      diag banditNose p50 {Median(DebugBanditNose):F0} deg | playerNose p50 {Median(DebugPlayerNose):F0} deg | closure p50 {Median(DebugClosure):F0} m/s | speed p {Median(DebugSpeeds.Select(x=>x.P).ToList()):F0} b {Median(DebugSpeeds.Select(x=>x.B).ToList()):F0}");
            _output.WriteLine($"      diag bandit cmd throttle p50 {Median(DebugThrottle):F2} G p50 {Median(DebugG):F1}");
            DebugThrottle.Clear(); DebugG.Clear();
            DebugBanditNose.Clear(); DebugPlayerNose.Clear(); DebugClosure.Clear(); DebugSpeeds.Clear();
        }
    }
}
