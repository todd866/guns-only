using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// THE INSTRUMENT FOR "IT'S MOSTLY PASSIVE, THEN IT KILLS ME, AND IT'S BORING" (owner, 2026-10-01).
///
/// Flies the production F-22 visual merge from historical ramp evidence against a closed-loop scripted pilot
/// driving the real session (assists, physiology and Auto-GCAS included, through
/// <see cref="DetentLayer.ScriptedPilotOverride"/>), and measures the opponent's pressure as a
/// player might encounter it, at 120 Hz (diagnostic medians at 10 Hz):
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

    public sealed record PressureResult(
        string Label, string Skill, int Formation, double Seconds,
        double PassiveShare, double LongestPassiveS, double FirstThreatS, double FirstRoundS,
        int OpponentRounds, int HitsTaken, int MaxHitsIn5S, int PlayerKills, int PlayerHits,
        double FiringShare, string End, string Tactics, double MedianRangeM, double GunRangeShare,
        double MedianPlayerAltM = double.NaN, double MedianBanditAltM = double.NaN,
        double TerminalSeconds = 0.0, double FirstNearPassS = double.NaN,
        double FirstHitS = double.NaN, double LongestCredibleGapS = double.NaN,
        int Near25M = 0, int Near50M = 0, int Near100M = 0,
        double WallMicrosecondsPerLiveTick = double.NaN, int Seed = 0,
        double FirstCredibleS = double.NaN, int Attacks = 0, double MedianReturnS = double.NaN,
        double MaxReturnS = double.NaN, int Opportunities = 0, int Overshoots = 0,
        int AttacksBeforeFirstHit = -1, int NearBeforeFirstHit = -1,
        Dictionary<string, double>? GapCauses = null);

    /// Historical ramp evidence, except rung 2 explicitly earns the neutral Ace bookmark.
    /// Legacy hit-only evidence (rung 1) now migrates to O1; retain that existing diagnostic
    /// row here. The BFM sweep measures each lesson separately.
    public static string? RungState(int rung) {
        // A legacy single kill now migrates to O2, a presenting Veteran. The pressure
        // contract is for the neutral Ace (N), not the O3 presentation at the same assist rung.
        // Earn N through normal BFM progression; do not bypass or change production migration.
        if (rung == 2) return BfmFlightAcceptanceTests.StateFor(6);
        // Diagnostic cases 10..17 stage BFM lesson (case - 10) directly, e.g. 12 = O2 Veteran.
        if (rung >= 10) return BfmFlightAcceptanceTests.StateFor(rung - 10);
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

    /// The audit chase pilot: proportional pursuit with the profile's approximate lead and
    /// forward-axis trigger. Kept unchanged for baseline comparability; the separate
    /// GunOpportunityPilot uses the actual ballistic solution for gunnery fixtures.
    sealed class ScriptedPlayer {
        readonly PilotProfile _profile;
        readonly Queue<AircraftState> _seen = new();
        readonly int _latencyTicks;
        readonly GunOpportunityPilot _gunnery = new();
        const double TailSingularityRad = 150.0 * Math.PI / 180.0;
        int _side;
        bool _trigger;
        double LatchedSide(double solved) {
            if (_side == 0) _side = solved < 0 ? -1 : 1;
            return _side;
        }
        // Only the gunopp pilot latches its turn against a contact near dead astern (the
        // lift-vector solve is singular there and the sign flips tick to tick). The audit chase
        // pilot keeps that flaw: the pinned early-fire contracts were measured with it.
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

            if (_profile.Name == GunOpportunity.Name) {
                var decision = _gunnery.Drive(own, contact);
                var command = decision.Command;
                double behind = Math.Acos(Math.Clamp(own.ForwardDir().Dot(toContact.Normalized()), -1.0, 1.0));
                if (behind > TailSingularityRad)
                    command = command with { BankTarget = LatchedSide(command.BankTarget) * 1.25,
                        GDemand = Math.Max(command.GDemand, 4.0) };
                else _side = 0;
                session.Controls.ScriptedPilotOverride = command;
                SetTrigger(session, decision.Trigger);
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

    static SimulationSession Start(int rung, bool durable, int seed) {
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
        // Fail at staging if a future migration silently changes the subject of the measurement.
        if (rung == 2) AssertNeutralAce(session);
        session.Begin();
        return session;
    }

    static void AssertNeutralAce(SimulationSession session) {
        Assert.Equal(BfmLesson.Get(6).Spawn(1), session.LastDirectorSpawn);
        Assert.Equal("N", session.BfmLessonId);
        Assert.Equal(2, session.DifficultyRung);
        Assert.Equal(PilotSkill.Ace, session.SortieOpponentSkill);
        Assert.Equal(PilotSkill.Ace, Assert.IsType<NeutralMergeBandit>(session.Bandit).Skill);
        Assert.Equal(1, session.SortieOpponentCount);
        Assert.Empty(session.Wingmen);
        Assert.Equal(BanditMount.Baseline, session.SortieOpponentMount);
        Assert.False(session.Bandit.Presenting);
        BeatSetup authored = Beats.ModernVisualMerge();
        Assert.Equal(authored.Bandit.Position, session.Bandit.State.Position);
        Assert.Equal(authored.Bandit.Chi, session.Bandit.State.Chi);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    public void RungTwoPressureStagesTheProductionNeutralAce(int seed) {
        var session = Start(2, durable: false, seed);
        AssertNeutralAce(session);
    }

    public static PressureResult Fly(int rung, PilotProfile profile, double seconds, bool durable,
        int seed = 0) {
        // Seeds perturb only the player: a lateral spawn offset, a heading offset and reaction
        // latency. Single deterministic fights are chaotic — one tuning change flips the whole path —
        // so conclusions are drawn over seeds, never from one run.
        profile = profile with { ReactionLatencyS = profile.ReactionLatencyS * (1.0 + 0.15 * seed) };
        var session = Start(rung, durable, seed);
        var pilot = new ScriptedPlayer(profile);

        int ticks = (int)Math.Ceiling(seconds / Dt);
        var stopwatch = Stopwatch.StartNew();
        var exposure = new PressureExposure();
        var fun = new FunProxyTracker();
        int nearBeforeHit = -1;
        var gapCauses = new Dictionary<string, double>();
        var passes = new PressureRoundTracker();
        var guns = new HashSet<GunKill>();
        var actors = new PressureActor[4];
        var hitTimes = new List<double>();
        var tactics = new Dictionary<string, int>();
        var ranges = new List<double>();
        var playerAlt = new List<double>();
        var banditAlt = new List<double>();
        int liveTicks = 0, lastHits = 0, rounds = 0, kills = 0, hits = 0, formation = 0;
        double firstRound = double.NaN, firstHit = double.NaN;
        string skill = "?";
        for (int tick = 0; tick < ticks; tick++) {
            if (session.Lifecycle != SimulationSession.LifecycleState.Active) break;
            bool live = session.PlayerAlive;
            if (!live) stopwatch.Stop();
            Vec3D playerStart = session.Player.State.Position;
            if (live) {
                pilot.Drive(session);
                if (session.OpponentPresent) {
                    guns.Add(session.OpponentGun);
                    foreach (var wing in session.Wingmen) {
                        guns.Add(wing.Gun);
                    }
                }
            }
            session.Advance(Dt);
            if (!live) continue; // terminal motion is reported separately, never as passive combat
            liveTicks++;
            double t = liveTicks * Dt;
            rounds = session.SortieOpponentRoundsFired;
            kills = session.KillCount;
            hits = session.SortiePlayerHits;
            if (session.PlayerHitsTaken > lastHits) {
                for (int h = lastHits; h < session.PlayerHitsTaken; h++) hitTimes.Add(t);
                if (double.IsNaN(firstHit)) firstHit = t;
                lastHits = session.PlayerHitsTaken;
            }
            if (double.IsNaN(firstRound) && rounds > 0) firstRound = t;
            foreach (var gun in guns)
                passes.Observe(gun, playerStart, session.Player.State.Position, t, Dt);
            int actorCount = 0;
            if (session.OpponentPresent) {
                actors[actorCount++] = ObserveActor(session.Bandit, session.PrimaryOpponentAlive,
                    session.OpponentTriggerDown, session.OpponentGun.AmmoRemaining > 0, session.Player.State, tick);
                foreach (var wing in session.Wingmen)
                    actors[actorCount++] = ObserveActor(wing.Bandit, wing.StillFighting,
                        wing.TriggerDown, wing.Gun.AmmoRemaining > 0, session.Player.State, tick);
                skill = session.Bandit switch {
                    NeutralMergeBandit m => m.Skill.ToString(),
                    ReactiveBandit r => r.Skill.ToString(),
                    _ => skill,
                };
            }
            formation = Math.Max(formation, actorCount);
            exposure.Add(true, Dt, actors.AsSpan(0, actorCount));
            // Long-gap attribution: which controller state and range band the silent time is in.
            if (tick % 12 == 0 && exposure.SecondsSinceCredibleAttack > 10.0 && session.OpponentPresent) {
                double gapRange = Geometry.Range(session.Player.State, session.Bandit.State);
                string status = session.Bandit switch {
                    ReactiveBandit r => r.AttackStatus, NeutralMergeBandit m => m.AttackStatus, _ => "other" };
                string key = $"{status}@{(gapRange < 900 ? "<0.9" : gapRange < 1500 ? "0.9-1.5" : gapRange < 3500 ? "1.5-3.5" : ">3.5")}km";
                gapCauses[key] = gapCauses.GetValueOrDefault(key) + 12 * Dt;
            }
            bool firstHitNow = !double.IsNaN(firstHit) && nearBeforeHit < 0;
            if (firstHitNow) nearBeforeHit = passes.Near100;
            if (session.OpponentPresent && session.PrimaryOpponentAlive) {
                var me = session.Player.State;
                Vec3D rel = session.Bandit.State.Position - me.Position;
                double rangeNow = rel.Length;
                double cos = rangeNow < 1 ? 1 : me.ForwardDir().Dot(rel) / rangeNow;
                fun.Add(t, exposure.LastCredible,
                    !session.Bandit.Presenting && rangeNow is >= 120 and <= 900 && cos >= Math.Cos(10 * Math.PI / 180),
                    cos < 0, rangeNow, firstHitNow);
            } else fun.Add(t, exposure.LastCredible, false, true, double.PositiveInfinity, firstHitNow);
            if (tick % 12 != 0 || !session.OpponentPresent) continue;
            var own = session.Player.State;
            var bandit = session.Bandit.State;
            double range = Geometry.Range(own, bandit);
            ranges.Add(range); playerAlt.Add(own.Position.Y); banditAlt.Add(bandit.Position.Y);
            string tactic = session.Bandit.Presenting ? "Present"
                : (session.Bandit as IBanditDecisionTraceSource)?.PolicyMemory.Tactic.ToString() ?? "?";
            tactics[tactic] = tactics.GetValueOrDefault(tactic) + 1;
            if (Trace is not null && tick % TraceEveryTicks == 0)
                Trace($"t={t:F1} range={range:F0} altP={own.Position.Y:F0} altB={bandit.Position.Y:F0} "
                    + $"spdP={own.Speed:F0} spdB={bandit.Speed:F0} nose={BanditFireControl.NoseErrorRad(bandit, ActorObservation.Capture(own, tick))*180/Math.PI:F1} rounds={rounds} "
                    + $"aspectP={Math.Acos(Math.Clamp(own.ForwardDir().Dot((bandit.Position - own.Position).Normalized()), -1, 1)) * 180 / Math.PI:F0} "
                    + $"gap={exposure.SecondsSinceCredibleAttack:F1} gammaB={bandit.Gamma * 180 / Math.PI:F1} "
                    + $"attack={session.Bandit switch { ReactiveBandit r => r.AttackStatus, NeutralMergeBandit m => m.AttackStatus, _ => "other" }} "
                    + $"command={(session.Bandit as IBanditDecisionTraceSource)?.AppliedCommand} "
                    + $"policy={(session.Bandit as IBanditDecisionTraceSource)?.PolicyMemory}");
        }
        stopwatch.Stop();
        int maxIn5 = hitTimes.Count == 0 ? 0
            : hitTimes.Max(start => hitTimes.Count(h => h >= start && h < start + 5));
        double liveSeconds = liveTicks * Dt;
        string end = !session.PlayerAlive ? session.PlayerTerminalState.ToString()
            : session.Lifecycle == SimulationSession.LifecycleState.Active ? "time" : "ended-alive";
        double denominator = Math.Max(Dt, exposure.LiveSeconds);
        return new PressureResult(
            $"rung {rung} vs {profile.Name}{(durable ? " (durable)" : "")}", skill, formation,
            liveSeconds, exposure.PassiveSeconds / denominator, exposure.LongestPassive,
            exposure.FirstThreat, firstRound, rounds, lastHits, maxIn5, kills, hits,
            exposure.FiringSeconds / denominator, end,
            string.Join(" ", tactics.OrderByDescending(kv => kv.Value)
                .Select(kv => $"{kv.Key}:{100.0 * kv.Value / Math.Max(1, tactics.Values.Sum()):F0}%")),
            Median(ranges), exposure.GunRangeSeconds / denominator, Median(playerAlt), Median(banditAlt),
            Math.Max(0, session.TimeSeconds - liveSeconds), passes.FirstNear100, firstHit,
            exposure.LongestCredibleGap, passes.Near25, passes.Near50, passes.Near100,
            stopwatch.Elapsed.TotalMilliseconds * 1000 / Math.Max(1, liveTicks), seed,
            exposure.FirstCredible, fun.Attacks, fun.MedianReturn, fun.MaxReturn,
            fun.Opportunities, fun.Overshoots, fun.AttacksBeforeFirstHit, nearBeforeHit, gapCauses);
    }

    static PressureActor ObserveActor(IBandit bandit, bool alive, bool trigger, bool armed,
        in AircraftState player, int tick) {
        var profile = BanditSkillProfile.For(bandit switch {
            ReactiveBandit r => r.Skill, NeutralMergeBandit n => n.Skill,
            _ => PilotSkill.Competent,
        });
        var observed = ActorObservation.Capture(player, tick);
        // Near-firing requires the ballistic gate even for body-gate tiers. Actual trigger
        // intent is reported separately and can still qualify a genuine imperfect burst.
        bool nearFiring = armed
            && BanditFireControl.InLeadFiringEnvelope(bandit.State, observed, profile.LeadFireConeRad);
        return new PressureActor(alive, bandit.Presenting, Geometry.Range(player, bandit.State),
            BanditFireControl.NoseErrorRad(bandit.State, observed), profile.FireConeRad,
            trigger, nearFiring);
    }

    public static Action<string>? Trace;
    static readonly int TraceEveryTicks = int.TryParse(System.Environment.GetEnvironmentVariable("PRESSURE_TRACE_TICKS"), out int every) ? every : 600;
    static double Med(IEnumerable<double> xs) {
        var v = xs.Where(double.IsFinite).OrderBy(x => x).ToList();
        return v.Count == 0 ? double.NaN : v[v.Count / 2];
    }
    static double Median(List<double> xs) => xs.Count == 0 ? double.NaN : xs.OrderBy(x => x).ElementAt(xs.Count / 2);

    /// PRESSURE_CASES="2:cohort,3:competent" narrows the sweep while iterating.
    static IEnumerable<(int Rung, PilotProfile Pilot)> Cases() {
        string? filter = System.Environment.GetEnvironmentVariable("PRESSURE_CASES");
        int[] rungs = string.IsNullOrEmpty(filter) ? new[] { 0, 1, 2, 3 }
            : new[] { 0, 1, 2, 3, 10, 11, 12, 13, 14, 15, 16, 17 };
        foreach (int rung in rungs)
        foreach (PilotProfile pilot in Pilots)
            if (string.IsNullOrEmpty(filter) || filter.Split(',').Contains($"{rung}:{pilot.Name}"))
                yield return (rung, pilot);
    }

    /// THE CONTRACT. Under production rules a trying pilot must be shot at, and early. Judged over
    /// three seeds because single fights are chaotic. Origin/main (Build 372) failed both rows:
    /// Ace earliest first round 86 s and 21 rounds across the three fights; Veteran 25 rounds.
    /// Each seed must meet the deadline; a fast seed cannot hide a silent one.
    [Theory]
    [InlineData(2, 60.0, 60)]
    [InlineData(1, 60.0, 30)]
    public void ATryingPilotIsShotAtEarly(int rung, double firstRoundWithinS, int minimumRounds) {
        var runs = Enumerable.Range(0, 3)
            .Select(seed => Fly(rung, PilotProfile.Competent, 120.0, durable: false, seed)).ToList();
        string detail = string.Join("; ", runs.Select(r =>
            $"seed {r.Seed} first {r.FirstRoundS:F0}s rounds {r.OpponentRounds} passive {r.PassiveShare:P0}"));
        _output.WriteLine($"rung {rung}: {detail}");
        Assert.All(runs, run => Assert.True(!double.IsNaN(run.FirstRoundS)
            && run.FirstRoundS <= firstRoundWithinS,
            $"rung {rung}: every seed must draw a round within {firstRoundWithinS:F0} s ({detail})"));
        Assert.True(runs.Sum(r => r.OpponentRounds) >= minimumRounds,
            $"rung {rung}: only {runs.Sum(r => r.OpponentRounds)} rounds across 3 fights ({detail})");
    }

    /// Ballistic-lead gunnery pilot (GunOpportunityPilot) with Competent latency.
    public static readonly PilotProfile GunOpportunity = PilotProfile.Competent with { Name = "gunopp" };
    public static readonly PilotProfile[] Pilots = { PilotProfile.Cohort, PilotProfile.Competent, GunOpportunity };

    /// The full sweep: 8 cases x PRESSURE_SEEDS seeds x 240 s. Minutes, so opt-in:
    ///   PRESSURE_REPORT=1 PRESSURE_SEEDS=4 dotnet test sim.Tests \
    ///     --filter FullyQualifiedName~BanditPressureReport.ReportPressureAcrossTheRamp \
    ///     --logger "console;verbosity=detailed"
    /// PRESSURE_CASES="2:cohort,0:competent" narrows it; PRESSURE_TRACE=1 prints a 5 s time series.
    ///
    /// PRESSURE_SECONDS bounds short diagnostic probes (default 240 seconds).
    [Fact]
    public void ReportPressureAcrossTheRamp() {
        if (System.Environment.GetEnvironmentVariable("PRESSURE_REPORT") != "1") return;
        _output.WriteLine("label                              skill      f   secs  passive  longestP  1stThreat  1stRound  rounds  hitsTaken  max5s  kills  myHits  firing  end");
        var previousTrace = Trace;
        Trace = System.Environment.GetEnvironmentVariable("PRESSURE_TRACE") == "1"
            ? _output.WriteLine : null;
        try {
            int seeds = int.TryParse(System.Environment.GetEnvironmentVariable("PRESSURE_SEEDS"), out int n) ? n : 1;
            double seconds = double.TryParse(System.Environment.GetEnvironmentVariable("PRESSURE_SECONDS"), out double duration) ? duration : 240.0;
            foreach (var (rung, pilot) in Cases()) {
                var runs = Enumerable.Range(0, seeds).Select(seed => Fly(rung, pilot, seconds, durable: false, seed)).ToList();
                if (seeds > 1) {
                    _output.WriteLine($"SUMMARY rung {rung} vs {pilot.Name} x{seeds}: passive {runs.Average(x => x.PassiveShare):P0}"
                        + $" | worst gap {runs.Max(x => x.LongestPassiveS):F0}s | mean gap {runs.Average(x => x.LongestPassiveS):F0}s"
                        + $" | rounds/min {runs.Sum(x => x.OpponentRounds) / runs.Sum(x => x.Seconds) * 60:F1}"
                        + $" | no-fire runs {runs.Count(x => x.OpponentRounds == 0)}"
                        + $" | shot down {runs.Count(x => x.HitsTaken >= 3)} | max5s {runs.Max(x => x.MaxHitsIn5S)}"
                        + $" | inside900 {runs.Average(x => x.GunRangeShare):P0} | mean secs {runs.Average(x => x.Seconds):F0}");
                    _output.WriteLine($"FUN rung {rung} vs {pilot.Name} x{seeds}:"
                        + $" first-attack {Med(runs.Select(x => x.FirstCredibleS)):F0}s"
                        + $" | worst credible gap {Med(runs.Select(x => x.LongestCredibleGapS)):F0}s med / {runs.Max(x => x.LongestCredibleGapS):F0}s max"
                        + $" | return med {Med(runs.Select(x => x.MedianReturnS)):F0}s max {runs.Select(x => x.MaxReturnS).Where(double.IsFinite).DefaultIfEmpty(double.NaN).Max():F0}s"
                        + $" | attacks/min {runs.Sum(x => x.Attacks) / runs.Sum(x => x.Seconds) * 60:F2}"
                        + $" | opps/min {runs.Sum(x => x.Opportunities) / runs.Sum(x => x.Seconds) * 60:F2}"
                        + $" | overshoots/min {runs.Sum(x => x.Overshoots) / runs.Sum(x => x.Seconds) * 60:F2}"
                        + $" | attacks-before-1st-hit {string.Join(",", runs.Select(x => x.AttacksBeforeFirstHit))}"
                        + $" | near100-before-1st-hit {string.Join(",", runs.Select(x => x.NearBeforeFirstHit))}"
                        + $" | hitsTaken {string.Join(",", runs.Select(x => x.HitsTaken))} | myHits {string.Join(",", runs.Select(x => x.PlayerHits))}"
                        + $" | us/tick {runs.Average(x => x.WallMicrosecondsPerLiveTick):F1}");
                    var causes = new Dictionary<string, double>();
                    foreach (var r in runs)
                        foreach (var kv in r.GapCauses ?? new())
                            causes[kv.Key] = causes.GetValueOrDefault(kv.Key) + kv.Value;
                    _output.WriteLine($"GAPS rung {rung} vs {pilot.Name}: " + string.Join(" ",
                        causes.OrderByDescending(kv => kv.Value).Take(6).Select(kv => $"{kv.Key}={kv.Value:F0}s")));
                }
                foreach (PressureResult r in runs) {
                    _output.WriteLine(
                    $"seed {r.Seed} {r.Label,-27} {r.Skill,-9} {r.Formation,2} {r.Seconds,6:F0}  {r.PassiveShare,6:P0}  {r.LongestPassiveS,7:F0}s"
                    + $"  {r.FirstThreatS,8:F0}s  {r.FirstRoundS,7:F0}s  {r.OpponentRounds,6}  {r.HitsTaken,9}  {r.MaxHitsIn5S,5}"
                    + $"  {r.PlayerKills,5}  {r.PlayerHits,6}  {r.FiringShare,6:P0}  {r.End}");
                    _output.WriteLine($"      tactics {r.Tactics} | first credible {r.FirstCredibleS:F1}s | max credible gap {r.LongestCredibleGapS:F1}s | 120-900 {r.GunRangeShare:P1} | near 25/50/100 {r.Near25M}/{r.Near50M}/{r.Near100M} | near→hit {r.FirstNearPassS:F3}s→{r.FirstHitS:F3}s delta {r.FirstHitS-r.FirstNearPassS:F3}s | terminal {r.TerminalSeconds:F3}s | {r.WallMicrosecondsPerLiveTick:F1}us/live-tick");
                }
            }
        }
        finally {
            // xUnit's output helper is scoped to this invocation. Never retain it for the next
            // test, even when a seed throws during a pressure sweep.
            Trace = previousTrace;
        }
    }
}
