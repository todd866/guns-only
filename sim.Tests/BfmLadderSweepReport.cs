using GunsOnly.Sim.Doctrine;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// THE INSTRUMENT FOR "IS THE BFM LADDER MONOTONICALLY HARDER, AND IS EACH LESSON LEARNABLE?"
///
/// Opt-in (BFM_SWEEP=1; BFM_SWEEP_SEEDS overrides 8). Flies O1, D1, O2, D2, O3, D3 and N from a
/// production lesson bookmark against three delayed-input pilots that act only through the real
/// stick, throttle and trigger. Every contact cue the pilot uses is perceived ~250 ms late; own
/// attitude/altitude are instrument reads. Nothing sets a state, heading or hit.
///
///   PASSIVE  hands off: no stick, no throttle change, no trigger.
///   CORRECT  the lesson's taught move. O/N: lift vector on the lead cue, fine-track on the
///            HUD, fire on solution inside 900 m. D1: break into him. D2: break, then idle
///            throttle and max pull as he closes inside 700 m to force the overshoot.
///            D3: the D2 move, then reverse onto his six and fire on solution.
///   WRONG    O/N: pure pursuit: nose on the bandit himself, not his lead; fires when he is
///            under the nose inside 900 m. (Firing out of range is not a discriminating error
///            here: every O start is already inside 900 m.)
///            D: extends straight away, wings level, full throttle, unloaded.
///
/// Pass = the session's own BFM outcome ("passed"): a gun kill, or the defensive observer.
/// </summary>
public sealed class BfmLadderSweepReport(ITestOutputHelper output) {
    const double Dt = 1.0 / AircraftSim.TickHz;
    const double CapSeconds = 60.0;
    static readonly int[] Ladder = [0, 1, 2, 3, 4, 5, 6];

    public enum Policy { Passive, Correct, Wrong }

    public sealed record SweepRun(string Lesson, Policy Policy, int Seed, bool Passed, bool Lost,
        double EndS, double OppFirstShotS, int PlayerRoundsToFirstHit, int OppRoundsToFirstHit,
        int PlayerRounds, int OppRounds, int HitsTaken, int Kills,
        string End = "", int GLoc = 0, double MinAltM = 0, double MinRangeM = 0, double EndRangeM = 0);

    sealed class Pilot {
        readonly BfmLesson _lesson;
        readonly Policy _policy;
        readonly int _latency;
        readonly Queue<(Vec3D Rel, Vec3D Cue, bool Solution, bool Valid)> _seen = new();
        double _pitch, _roll;
        bool _trigger;
        double _cornerMps = double.NaN;
        int _tick;
        readonly double _handsOn;

        public Pilot(BfmLesson lesson, Policy policy, int seed) {
            _lesson = lesson;
            _policy = policy;
            // 220..280 ms perception-to-hand delay; a slower thumb on odd seeds.
            _latency = (int)Math.Round((0.22 + 0.02 * (seed % 4)) / Dt);
            _handsOn = 0.25 + 0.05 * seed;
            StickRate = seed % 2 == 0 ? 3.0 : 2.0;
        }
        double StickRate { get; }

        public void Drive(SimulationSession s) {
            _tick++;
            if (_policy == Policy.Passive) return;
            AircraftSim own = s.Player;
            bool valid = s.OpponentPresent && s.SelectedOpponentAlive;
            Vec3D rel = s.Bandit.State.Position - own.State.Position;
            GunKill gun = s.PlayerGun;
            Vec3D cue = gun.HasLeadSolution ? gun.LeadDirection : rel.Normalized();
            _seen.Enqueue((rel, cue, gun.GunSolution, valid));
            if (_seen.Count <= _latency || _tick * Dt < _handsOn) return;
            var seen = _seen.Dequeue();
            if (double.IsNaN(_cornerMps)) _cornerMps = own.State.Speed;
            if (!seen.Valid) { Hold(s, 0, 0, false); return; }

            AircraftState st = own.State;
            double range = seen.Rel.Length;
            bool behind = seen.Rel.Dot(st.ForwardDir()) < 0;
            // Attitude/altimeter read: a competent pilot does not fly the fight into the ground.
            if (st.Gamma < -35 * Math.PI / 180 || (st.Position.Y < 1800 && st.Gamma < -8 * Math.PI / 180)) {
                double err = Wrap(0 - st.Bank);
                Hold(s, Math.Abs(err) < 1.0 ? 0.9 : 0.05, Math.Clamp(err * 1.5, -0.8, 0.8), false, instant: true);
                s.SetAnalogThrottleControl(1);
                return;
            }
            if (!_lesson.Defensive) {
                // WRONG: nose on the bandit himself (pure pursuit), trigger when he is under the
                // nose inside 900 m — never leads him.
                if (_policy == Policy.Wrong) Attack(s, seen.Rel.Normalized(), false, range, 900, pointAtTarget: true);
                else Attack(s, seen.Cue, seen.Solution, range, 900);
                return;
            }
            if (_policy == Policy.Wrong) {
                double err = Wrap(0 - st.Bank);
                Hold(s, -0.05, Math.Clamp(err * 1.5, -0.8, 0.8), false);
                s.SetAnalogThrottleControl(1);
                return;
            }
            // Reverse only while he is actually in front; if he regains the rear, break again.
            if (_lesson.Index == 5 && !behind && range < 1500) {
                // Reverse: the attacker is now in front; put the nose on his lead.
                Attack(s, seen.Cue, seen.Solution, range, 900);
                s.SetAnalogThrottleControl(st.Speed < 180 ? 1 : 0.6);
                return;
            }
            // Break: a hard, nose-on-the-horizon turn toward the attacker's side, max pull once
            // rolled in. Bank eases off when the nose drops so the turn stays level.
            double side = Math.Sign(seen.Rel.Dot(own.BodyRight) + 1e-9);
            double gammaDeg = st.Gamma * 180 / Math.PI;
            double bankTarget = side * (80 + Math.Clamp(gammaDeg, -25, 10)) * Math.PI / 180;
            double bankErr = Wrap(bankTarget - st.Bank);
            bool forceOvershoot = _lesson.Index >= 3 && behind && range < 700;
            Hold(s, Math.Abs(bankErr) < Math.PI / 4 ? (forceOvershoot ? 1.0 : 0.85) : 0.15,
                Math.Clamp(bankErr * 1.5, -0.8, 0.8), false, instant: true);
            // Hold the break near the starting (corner) speed; idle to force the overshoot.
            s.SetAnalogThrottleControl(forceOvershoot ? 0 : st.Speed < _cornerMps ? 1 : 0.3);
        }

        void Attack(SimulationSession s, Vec3D cue, bool solution, double range, double fireRange,
            bool pointAtTarget = false) {
            AircraftSim own = s.Player;
            Vec3D f = own.BodyForward, u = own.BodyUp, r = own.BodyRight;
            double cf = cue.Dot(f);
            // Where the cue sits on the glass (deg); behind the jet it reads as pinned at 90+.
            double up = Math.Atan2(cue.Dot(u), Math.Max(1e-6, Math.Abs(cf))) * 180 / Math.PI;
            double right = Math.Atan2(cue.Dot(r), Math.Max(1e-6, Math.Abs(cf))) * 180 / Math.PI;
            double error = Math.Acos(Math.Clamp(cf, -1, 1)) * 180 / Math.PI;
            bool fire = pointAtTarget ? range < fireRange && error < 2 : solution && range < fireRange;
            if (error > 8) {
                // Off the pipper: roll the lift vector onto the cue, then pull toward it.
                double phi = Math.Atan2(cue.Dot(r), cue.Dot(u));
                Hold(s, Math.Abs(phi) < Math.PI / 3 ? Math.Clamp(0.05 * error, 0.2, 1.0) : 0.1,
                    Math.Clamp(phi, -0.8, 0.8), fire, instant: true);
                return;
            }
            Hold(s, Math.Clamp(0.08 * up, -0.3, 1.0), Math.Clamp(0.06 * right, -0.5, 0.5), fire, instant: true);
        }

        void Hold(SimulationSession s, double pitch, double roll, bool fire, bool instant = false) {
            double step = StickRate * Dt;
            _pitch += instant ? Math.Clamp(pitch - _pitch, -2 * step, 2 * step) : Math.Clamp(pitch - _pitch, -step, step);
            _roll += instant ? Math.Clamp(roll - _roll, -2 * step, 2 * step) : Math.Clamp(roll - _roll, -step, step);
            s.SetAnalogPitchControl(_pitch);
            s.SetAnalogRollControl(_roll);
            if (fire != _trigger) { _trigger = fire; s.FeedKey(GKey.Trigger, fire); }
        }

        static double Wrap(double a) => Math.Atan2(Math.Sin(a), Math.Cos(a));
    }

    public static SweepRun Fly(int lesson, Policy policy, int seed) {
        var s = BfmFlightAcceptanceTests.Start(lesson, seed);
        var pilot = new Pilot(BfmLesson.Get(lesson), policy, seed);
        double firstShot = double.NaN;
        int playerToHit = -1, oppToHit = -1;
        double minAlt = double.PositiveInfinity, minRange = double.PositiveInfinity;
        for (int i = 0; i < (lesson == 6 ? 90 : CapSeconds) * AircraftSim.TickHz; i++) {
            pilot.Drive(s);
            s.StepFixed();
            minAlt = Math.Min(minAlt, s.Player.State.Position.Y);
            minRange = Math.Min(minRange, Geometry.Range(s.Player.State, s.Bandit.State));
            if (Trace is not null && i % 60 == 0) Trace($"  t={s.TimeSeconds:F0} alt={s.Player.State.Position.Y:F0} v={s.Player.State.Speed:F0} bank={s.Player.State.Bank * 57.3:F0} g={s.Player.State.Gamma * 57.3:F0} rng={Geometry.Range(s.Player.State, s.Bandit.State):F0} ahead={(s.Bandit.State.Position - s.Player.State.Position).Dot(s.Player.State.ForwardDir()):F0} bAlt={s.Bandit.State.Position.Y:F0} sol={s.PlayerGun.GunSolution} ata={Math.Acos(Math.Clamp(s.Player.State.ForwardDir().Dot((s.Bandit.State.Position - s.Player.State.Position).Normalized()), -1, 1)) * 57.3:F0} hca={Math.Acos(Math.Clamp(s.Player.State.ForwardDir().Dot(s.Bandit.State.ForwardDir()), -1, 1)) * 57.3:F0} bv={s.Bandit.State.Speed:F0} thr={s.Player.State.Speed:F0}");
            if (double.IsNaN(firstShot) && s.SortieOpponentRoundsFired > 0) firstShot = s.TimeSeconds;
            if (playerToHit < 0 && s.SortiePlayerHits > 0) playerToHit = s.SortiePlayerRoundsFired;
            if (oppToHit < 0 && s.PlayerHitsTaken > 0) oppToHit = s.SortieOpponentRoundsFired;
            if (s.PlayerTerminalState != AircraftTerminalState.Flying || s.BfmLessonOutcome != "open"
                || s.KillCount > 0) break;
        }
        return new(BfmLesson.Get(lesson).Id, policy, seed, s.BfmLessonOutcome == "passed",
            s.PlayerTerminalState != AircraftTerminalState.Flying, s.TimeSeconds, firstShot,
            playerToHit, oppToHit, s.SortiePlayerRoundsFired, s.SortieOpponentRoundsFired,
            s.PlayerHitsTaken, s.KillCount, s.PlayerTerminalState.ToString(), s.PilotGLocCount,
            minAlt, minRange, Geometry.Range(s.Player.State, s.Bandit.State));
    }

    public static Action<string>? Trace;

    static string Med(IEnumerable<double> values) {
        var v = values.Where(double.IsFinite).OrderBy(x => x).ToArray();
        return v.Length == 0 ? "—" : $"{v[v.Length / 2]:F1}";
    }

    [Fact]
    public void ReportLadderSweep() {
        if (System.Environment.GetEnvironmentVariable("BFM_SWEEP") != "1") return;
        int seeds = int.TryParse(System.Environment.GetEnvironmentVariable("BFM_SWEEP_SEEDS"), out int n) ? n : 8;
        string? only = System.Environment.GetEnvironmentVariable("BFM_SWEEP_LESSONS");
        bool trace = System.Environment.GetEnvironmentVariable("BFM_SWEEP_TRACE") == "1";
        if (System.Environment.GetEnvironmentVariable("BFM_SWEEP_FLIGHT") == "1") Trace = output.WriteLine;
        string? policies = System.Environment.GetEnvironmentVariable("BFM_SWEEP_POLICIES");
        output.WriteLine("| Lesson | Pilot | Pass | Lost | med t pass s | med t death s | med opp 1st shot s | med rnds→1st hit (own/opp) |");
        output.WriteLine("|---|---|---|---|---|---|---|---|");
        foreach (int lesson in Ladder) {
            if (only is not null && !only.Split(',').Contains(BfmLesson.Get(lesson).Id)) continue;
            foreach (Policy policy in Enum.GetValues<Policy>()) {
                if (policies is not null && !policies.Split(',').Contains(policy.ToString())) continue;
                var runs = Enumerable.Range(0, seeds).Select(seed => Fly(lesson, policy, seed)).ToArray();
                if (trace) foreach (var r in runs) output.WriteLine("RUN " + r);
                output.WriteLine($"| {runs[0].Lesson} | {policy} | {runs.Count(r => r.Passed)}/{seeds} | "
                    + $"{runs.Count(r => r.Lost)}/{seeds} | {Med(runs.Where(r => r.Passed).Select(r => r.EndS))} | "
                    + $"{Med(runs.Where(r => r.Lost).Select(r => r.EndS))} | {Med(runs.Select(r => r.OppFirstShotS))} | "
                    + $"{Med(runs.Where(r => r.PlayerRoundsToFirstHit >= 0).Select(r => (double)r.PlayerRoundsToFirstHit))}/"
                    + $"{Med(runs.Where(r => r.OppRoundsToFirstHit >= 0).Select(r => (double)r.OppRoundsToFirstHit))} |");
            }
        }
    }
}
