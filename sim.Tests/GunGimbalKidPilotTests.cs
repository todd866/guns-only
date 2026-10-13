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
        bool Alive, string Outcome);

    /// A coarse keyboard pilot: all observations are queued for 450 ms, controls are held for
    /// bounded chunks, and a fire burst is intentionally independent of ballistic lead.
    sealed class KidPilot(int seed) {
        readonly int _delayTicks = (int)Math.Round(VisualDelaySeconds / Dt);
        readonly Queue<Visual> _seen = new();
        readonly Random _random = new(seed * 7919 + 17);
        GKey? _roll, _pitch;
        int _holdTicks;
        int _wrongRollTicks = (int)Math.Round((0.35 + 0.1 * (seed % 5)) / Dt);
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
                    double right = _wrongRollTicks > 0 ? -Math.Sign(seen.RightDeg + 1e-9) : seen.RightDeg;
                    if (_wrongRollTicks > 0) _wrongRollTicks--;
                    _roll = right >= 0 ? GKey.RollRight : GKey.RollLeft;
                    Press(_roll.Value, s);
                    _holdTicks = HoldTicks(0.3, 0.9);

                    // Coarse vertical correction only. There is no throttle management and no
                    // lead discipline: the child pulls/pushes toward the visual contact.
                    if (Math.Abs(seen.UpDeg) > 4.0) {
                        _pitch = seen.UpDeg > 0 ? GKey.PullUp : GKey.PushDown;
                        Press(_pitch.Value, s);
                    }
                }
            }

            bool inside = seen.Valid && seen.RangeM <= 1500.0
                && Math.Abs(seen.RightDeg) <= 15.0 && Math.Abs(seen.UpDeg) <= 15.0;
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

    static SimulationSession Start(int lesson, int seed) {
        var s = new SimulationSession();
        s.ArmDirectorStateForNextStage(BfmFlightAcceptanceTests.StateFor(lesson));
        s.StartBeat(() => {
            var beat = Beats.ModernVisualMerge();
            return beat with { Player = beat.Player with {
                Speed = beat.Player.Speed + (seed - 1.5) * 3,
                Chi = seed * 0.05,
            } };
        });
        s.SetAssistedFlight(true);
        s.SetTouchControlModality(false); // keyboard is the primary acceptance path
        s.Begin();
        return s;
    }

    static Result Fly(int lesson, int seed, double capSeconds) {
        SimulationSession s = Start(lesson, seed);
        var pilot = new KidPilot(seed);
        try {
            int ticks = (int)Math.Round(capSeconds / Dt);
            for (int tick = 0; tick < ticks
                && s.PlayerTerminalState == AircraftTerminalState.Flying
                && s.KillCount == 0; tick++) {
                pilot.Drive(s);
                s.StepFixed();
            }
            return new(seed, lesson, s.TimeSeconds, s.KillCount, s.SortiePlayerHits,
                s.SortiePlayerRoundsFired, s.PlayerTerminalState == AircraftTerminalState.Flying,
                s.BfmLessonOutcome);
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
}
