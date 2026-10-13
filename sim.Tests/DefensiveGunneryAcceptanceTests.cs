using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Input-only acceptance for the defensive rung: a delayed pilot must create the geometry that the real
/// DefensiveSuccessObserver requires.  It never relocates an aircraft or writes flight state.
/// </summary>
public sealed class DefensiveGunneryAcceptanceTests(ITestOutputHelper output) {
    const double Dt = 1.0 / AircraftSim.TickHz;
    const int SeedCount = 8;

    sealed record Run(string Lesson, int Seed, bool Passed, bool Lost,
        double Time, int HitsTaken, int OpponentRounds, string Terminal);

    sealed class Pilot(int seed) {
        readonly Queue<(Vec3D Rel, bool Valid)> _seen = new();
        readonly int _delayTicks = (int)Math.Round((0.22 + 0.02 * (seed % 4)) / Dt);
        readonly double _handsOn = 0.25 + 0.05 * (seed % 4);
        bool _overshot;
        int _tick;

        public void Drive(SimulationSession s, int lesson) {
            _tick++;
            bool valid = s.OpponentPresent && s.SelectedOpponentAlive;
            Vec3D rel = s.Bandit.State.Position - s.Player.State.Position;
            _seen.Enqueue((rel, valid));
            if (_seen.Count <= _delayTicks || _tick * Dt < _handsOn) return;
            var seen = _seen.Dequeue();
            if (!seen.Valid) {
                Hold(s, 0, 0);
                s.SetAnalogThrottleControl(1);
                return;
            }

            AircraftSim own = s.Player;
            AircraftState st = own.State;
            double range = seen.Rel.Length;
            bool behind = seen.Rel.Dot(st.ForwardDir()) < 0;
            bool seenOvershoot = seen.Rel.Dot(st.ForwardDir()) > 0 && range < 900;
            if (seenOvershoot) _overshot = true;

            // After an observed overshoot, unload and let the separation open.
            if (lesson == 3 && _overshot) {
                Hold(s, 0, 0);
                s.SetAnalogThrottleControl(0.7);
                return;
            }

            const double idleRange = 950;
            bool forceOvershoot = lesson == 3 && behind && range < idleRange;
            Break(s, seen.Rel, st, throttle: forceOvershoot ? 0 : 1);
        }

        static void Break(SimulationSession s, Vec3D rel, AircraftState st, double throttle) {
            // Input-only lift-vector break: use the delayed world contact as the aim point, then
            // pull once the lift vector is placed on it. This is the same public geometry used by
            // the existing defensive acceptance, without injecting a heading or position.
            Vec3D aim = st.Position + rel;
            double targetBank = Geometry.BankToPlaceLiftVectorOn(st, aim);
            double bankError = Math.Atan2(Math.Sin(targetBank - st.Bank), Math.Cos(targetBank - st.Bank));
            double angle = Math.Acos(Math.Clamp(st.ForwardDir().Dot(rel.Normalized()), -1, 1));
            double pitch = Math.Abs(bankError) < Math.PI / 3 ? Math.Clamp(angle, 0.1, 1) : 0.1;
            Hold(s, pitch, Math.Clamp(bankError * 1.5, -0.8, 0.8));
            s.SetAnalogThrottleControl(throttle);
        }

        static void Hold(SimulationSession s, double pitch, double roll) {
            s.SetAnalogPitchControl(pitch);
            s.SetAnalogRollControl(roll);
        }
    }

    static Run Fly(int lesson, int seed) {
        var s = BfmFlightAcceptanceTests.Start(lesson, seed);
        var pilot = new Pilot(seed);
        for (int tick = 0; tick < 60 * AircraftSim.TickHz
            && s.PlayerTerminalState == AircraftTerminalState.Flying
            && s.BfmLessonOutcome == "open"; tick++) {
            pilot.Drive(s, lesson);
            s.StepFixed();
        }
        if (s.BfmLessonOutcome == "passed")
            Assert.Equal(EngagementEndReason.DefensiveSuccess, s.LastEngagementReport!.Value.EndReason);
        return new(BfmLesson.Get(lesson).Id, seed,
            s.BfmLessonOutcome == "passed", s.PlayerTerminalState != AircraftTerminalState.Flying,
            s.TimeSeconds, s.PlayerHitsTaken, s.SortieOpponentRoundsFired,
            s.PlayerTerminalState.ToString());
    }

    [Theory]
    [InlineData(1, 7)]
    [InlineData(3, 6)]
    public void DelayedDefenderCanBeatTheAttack(int lesson, int minimumPasses) {
        Run[] runs = Enumerable.Range(0, SeedCount).Select(seed => Fly(lesson, seed)).ToArray();
        foreach (Run run in runs) output.WriteLine(run.ToString());
        Assert.True(runs.Count(r => r.Passed && !r.Lost) >= minimumPasses,
            $"{BfmLesson.Get(lesson).Id}: {runs.Count(r => r.Passed && !r.Lost)}/8 passed");
    }
}
