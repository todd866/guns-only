using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Acceptance for the deliberately untidy laptop pilot described in the C11 brief.  The model
/// reads only delayed visual line-of-sight and drives the same keyboard edge/hold path as a
/// browser.  It never writes a flight state, selects a target, supplies a lead solution, or
/// bypasses the gun.  Keep this test alongside the BFM acceptance tests: it is a child-pilot
/// contract for the gimbal, not a second combat simulator.
/// </summary>
public sealed class GunGimbalKidPilotTests(ITestOutputHelper output) {
    const double Dt = 1.0 / AircraftSim.TickHz;
    const double VisualDelaySeconds = 0.450;
    const int SeedCount = 8;

    sealed record Result(int Seed, int Lesson, double Time, int Kills, int Hits, int Rounds,
        double FirstHitSeconds, int RoundsToFirstHit, bool Alive, string Outcome);

    /// A coarse keyboard pilot: all observations are queued for 450 ms, controls are held for
    /// bounded chunks, and a fire burst is intentionally independent of ballistic lead.
    sealed class KidPilot(int seed) {
        readonly int _delayTicks = (int)Math.Round(VisualDelaySeconds / Dt);
        readonly Queue<Visual> _seen = new();
        readonly Random _random = new(seed * 7919 + 17);
        GKey? _roll, _pitch;
        int _holdTicks;
        bool _wrongInitial = seed is 2 or 5;
        int _burstTicks;
        bool _trigger;
        int _tick;

        readonly record struct Visual(double UpDeg, double RightDeg, double RangeM, bool Valid);

        public void Drive(SimulationSession s) {
            _tick++;
            bool valid = s.OpponentPresent && s.SelectedOpponentAlive;
            Visual sample = default;
            if (valid) {
                Vec3D d = s.Bandit.State.Position - s.Player.State.Position;
                Vec3D f = s.Player.BodyForward, u = s.Player.BodyUp, r = s.Player.BodyRight;
                double forward = Math.Max(1e-6, d.Dot(f));
                sample = new(
                    Math.Atan2(d.Dot(u), forward) * 180.0 / Math.PI,
                    Math.Atan2(d.Dot(r), forward) * 180.0 / Math.PI,
                    d.Length,
                    forward > 0.0);
            }
            _seen.Enqueue(sample);
            Visual seen = _seen.Count > _delayTicks ? _seen.Dequeue() : default;

            if (_holdTicks > 0) {
                _holdTicks--;
            } else {
                Release(ref _roll, s);
                Release(ref _pitch, s);
                if (seen.Valid) {
                    // The first manoeuvre is sometimes the wrong way. This is a seeded motor
                    // error, not a hidden assist or a state correction.
                    double right = _wrongInitial ? -Math.Sign(seen.RightDeg + 1e-9) : seen.RightDeg;
                    _wrongInitial = false;
                    _roll = right >= 0 ? GKey.RollRight : GKey.RollLeft;
                    Press(_roll.Value, s);
                    _holdTicks = HoldTicks(0.3, 1.5);

                    // Coarse vertical correction only. There is no throttle management and no
                    // lead discipline: the child pulls/pushes toward the visual contact.
                    if (Math.Abs(seen.UpDeg) > 4.0) {
                        _pitch = seen.UpDeg > 0 ? GKey.PullUp : GKey.PushDown;
                        Press(_pitch.Value, s);
                    }
                }
            }

            bool inside = seen.Valid && seen.RangeM <= 1500.0
                && Math.Sqrt(seen.RightDeg * seen.RightDeg + seen.UpDeg * seen.UpDeg) <= 15.0;
            if (_burstTicks > 0) _burstTicks--;
            else if (inside) _burstTicks = HoldTicks(2.0, 4.0);
            bool fire = _burstTicks > 0 && valid;
            if (fire != _trigger) {
                _trigger = fire;
                s.FeedKey(GKey.Trigger, fire);
            }
        }

        int HoldTicks(double minSeconds, double maxSeconds) =>
            Math.Max(1, (int)Math.Round((minSeconds + _random.NextDouble()
                * (maxSeconds - minSeconds)) / Dt));

        static void Press(GKey key, SimulationSession s) => s.FeedKey(key, true);
        static void Release(ref GKey? key, SimulationSession s) {
            if (key is GKey held) {
                s.FeedKey(held, false);
                key = null;
            }
        }

        public void Finish(SimulationSession s) {
            Release(ref _roll, s);
            Release(ref _pitch, s);
            if (_trigger) { _trigger = false; s.FeedKey(GKey.Trigger, false); }
        }
    }

    static SimulationSession Start(int lesson, int seed, bool assisted = true) {
        var s = new SimulationSession();
        s.ArmDirectorStateForNextStage(BfmFlightAcceptanceTests.StateFor(lesson));
        s.StartBeat(() => {
            var beat = Beats.ModernVisualMerge();
            return beat with { Player = beat.Player with {
                Speed = beat.Player.Speed + (seed - 1.5) * 3,
                Chi = seed * 0.05,
            } };
        });
        s.SetAssistedFlight(assisted);
        s.SetTouchControlModality(false); // keyboard is the primary acceptance path
        s.Begin();
        return s;
    }

    static Result Fly(int lesson, int seed, double capSeconds) {
        SimulationSession s = Start(lesson, seed);
        var pilot = new KidPilot(seed);
        double firstHit = double.NaN;
        int roundsToFirstHit = -1;
        try {
            int ticks = (int)Math.Round(capSeconds / Dt);
            for (int tick = 0; tick < ticks
                && s.PlayerTerminalState == AircraftTerminalState.Flying
                && s.KillCount == 0; tick++) {
                pilot.Drive(s);
                s.StepFixed();
                if (double.IsNaN(firstHit) && s.SortiePlayerHits > 0) {
                    firstHit = s.TimeSeconds;
                    roundsToFirstHit = s.SortiePlayerRoundsFired;
                }
            }
            return new(seed, lesson, s.TimeSeconds, s.KillCount, s.SortiePlayerHits,
                s.SortiePlayerRoundsFired, firstHit, roundsToFirstHit,
                s.PlayerTerminalState == AircraftTerminalState.Flying, s.BfmLessonOutcome);
        } finally { pilot.Finish(s); }
    }

    [Fact]
    public void KidPilotKillsO1InAtLeastSevenOfEightSeedsWithinSixtySeconds() {
        Result[] runs = Enumerable.Range(0, SeedCount).Select(seed => Fly(0, seed, 60)).ToArray();
        foreach (Result run in runs) output.WriteLine(run.ToString());
        Assert.True(runs.Count(r => r.Kills > 0 && r.Time <= 60 && r.Rounds <= 480) >= 7,
            $"Kid O1 conversion was {runs.Count(r => r.Kills > 0 && r.Time <= 60 && r.Rounds <= 480)}/8; "
            + string.Join("; ", runs.Select(r => r.ToString())));
        Assert.All(runs, r => Assert.InRange(r.Rounds, 0, 480));
    }

    [Fact]
    public void KidPilotKillsO2InAtLeastFiveOfEightSeedsWithinNinetySeconds() {
        Result[] runs = Enumerable.Range(0, SeedCount).Select(seed => Fly(2, seed, 90)).ToArray();
        foreach (Result run in runs) output.WriteLine(run.ToString());
        Assert.True(runs.Count(r => r.Kills > 0 && r.Time <= 90 && r.Rounds <= 480) >= 5,
            $"Kid O2 conversion was {runs.Count(r => r.Kills > 0 && r.Time <= 90 && r.Rounds <= 480)}/8; "
            + string.Join("; ", runs.Select(r => r.ToString())));
        Assert.All(runs, r => Assert.InRange(r.Rounds, 0, 480));
    }

    /// Optional calibration receipt for the parent implementation. It is deliberately opt-in:
    /// unlike the two acceptance facts above, this is a measured report and must not add another
    /// release gate. Both pilots still use only FeedKey and delayed instrument/visual samples.
    [Fact]
    public void ReportKeyboardCompetentAndExpertCurves() {
        if (System.Environment.GetEnvironmentVariable("C11_REPORT") != "1") return;
        foreach ((string name, bool expert, int[] lessons) in new[] {
            ("competent-delayed", false, new[] { 0, 2, 4, 6, 7 }),
            ("expert-none", true, new[] { 4, 6, 7 })
        }) {
            foreach (int lesson in lessons) {
                var rows = Enumerable.Range(0, 4).Select(seed =>
                    FlyReport(lesson, seed, expert, lesson >= 6 ? 120 : 90));
                output.WriteLine($"{name} {BfmLesson.Get(lesson).Id}: "
                    + string.Join(" | ", rows.Select(r =>
                        $"s{r.Seed} t={r.Time:F2}s first={Fmt(r.FirstHitSeconds)}s "
                        + $"r1={r.RoundsToFirstHit} hits={r.Hits} kills={r.Kills} rounds={r.Rounds}")));
            }
        }
    }

    static string Fmt(double value) => double.IsNaN(value) ? "-" : value.ToString("F2");

    static Result FlyReport(int lesson, int seed, bool expert, double capSeconds) {
        SimulationSession s = Start(lesson, seed, assisted: !expert);
        var pilot = new ReportPilot(seed, expert);
        double firstHit = double.NaN;
        int roundsToFirstHit = -1;
        try {
            for (int tick = 0; tick < capSeconds / Dt
                && s.PlayerTerminalState == AircraftTerminalState.Flying
                && s.KillCount == 0; tick++) {
                pilot.Drive(s);
                s.StepFixed();
                if (double.IsNaN(firstHit) && s.SortiePlayerHits > 0) {
                    firstHit = s.TimeSeconds;
                    roundsToFirstHit = s.SortiePlayerRoundsFired;
                }
            }
            return new(seed, lesson, s.TimeSeconds, s.KillCount, s.SortiePlayerHits,
                s.SortiePlayerRoundsFired, firstHit, roundsToFirstHit,
                s.PlayerTerminalState == AircraftTerminalState.Flying, s.BfmLessonOutcome);
        } finally { pilot.Finish(s); }
    }

    sealed class ReportPilot(int seed, bool expert) {
        readonly Queue<(Vec3D D, Vec3D Cue, bool Valid)> _seen = new();
        readonly int _delayTicks = (int)Math.Round(VisualDelaySeconds / Dt);
        readonly Random _random = new(seed * 1013 + (expert ? 83 : 31));
        GKey? _roll, _pitch;
        int _hold;
        bool _trigger;
        int _burst;

        public void Drive(SimulationSession s) {
            bool valid = s.OpponentPresent && s.SelectedOpponentAlive;
            Vec3D d = valid ? s.Bandit.State.Position - s.Player.State.Position : default;
            Vec3D cueAtObservation = valid && expert && s.PlayerGun.HasLeadSolution
                ? s.PlayerGun.LeadDirection : d;
            _seen.Enqueue((d, cueAtObservation, valid));
            var seen = _seen.Count > _delayTicks ? _seen.Dequeue() : default;
            Vec3D cue = seen.Valid ? seen.Cue : default;
            if (_hold > 0) _hold--;
            else if (seen.Valid) {
                Release(ref _roll, s); Release(ref _pitch, s);
                double right = cue.Dot(s.Player.BodyRight);
                _roll = right >= 0 ? GKey.RollRight : GKey.RollLeft;
                s.FeedKey(_roll.Value, true);
                _hold = (int)Math.Round((expert ? 0.3 : 0.6) / Dt);
                double up = cue.Dot(s.Player.BodyUp);
                if (Math.Abs(up) > 0.04) {
                    _pitch = up >= 0 ? GKey.PullUp : GKey.PushDown;
                    s.FeedKey(_pitch.Value, true);
                }
            }
            double forward = seen.Valid ? cue.Dot(s.Player.BodyForward) : -1;
            bool inside = seen.Valid && forward > 0 && cue.Length > 0
                && Math.Acos(Math.Clamp(forward / cue.Length, -1, 1)) <= (expert ? 0.06 : 0.18)
                && seen.D.Length <= 1000;
            if (_burst > 0) _burst--; else if (inside) _burst =
                (int)Math.Round((expert ? 1.0 : 2.0 + _random.NextDouble() * 1.0) / Dt);
            bool fire = _burst > 0 && valid;
            if (fire != _trigger) { _trigger = fire; s.FeedKey(GKey.Trigger, fire); }
        }

        public void Finish(SimulationSession s) {
            Release(ref _roll, s); Release(ref _pitch, s);
            if (_trigger) { _trigger = false; s.FeedKey(GKey.Trigger, false); }
        }

        static void Release(ref GKey? key, SimulationSession s) {
            if (key is GKey held) { s.FeedKey(held, false); key = null; }
        }
    }
}
