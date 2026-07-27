using System;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// "I just want attitude-hold." Release the stick and the aircraft keeps the bank it was left at.
/// Measured in the BODY frame, because that is the frame the hold captures in — an earlier test
/// compared flight-path bank against a body capture and reported a pass while the pilot watched it
/// roll away.
/// </summary>
public sealed class AttitudeHoldTests {
    readonly ITestOutputHelper _out;
    public AttitudeHoldTests(ITestOutputHelper output) => _out = output;

    static double BodyBankDeg(in AircraftState s) {
        var forward = s.BodyAttitude.Rotate(new Vec3D(0, 0, 1));
        var bodyUp = s.BodyAttitude.Rotate(new Vec3D(0, 1, 0));
        var up0 = new Vec3D(0, 1, 0) - forward * forward.Y;
        if (up0.Length < 1e-6) return s.Bank * 180.0 / Math.PI;
        up0 = up0.Normalized();
        var right = forward.Cross(up0);
        return Math.Atan2(bodyUp.Dot(right), bodyUp.Dot(up0)) * 180.0 / Math.PI;
    }

    [Fact]
    public void ReleasingTheStickHoldsTheBankTheAircraftWasLeftAt() {
        BeatSetup beat = Beats.RapierIntercept() with {
            Carrier = null, StartsOnCatapult = false, ScriptedIntercept = null
        };
        beat = beat with {
            Player = beat.Player with {
                Position = new Vec3D(0.0, 15_000.0, 0.0),
                Speed = 600.0, Gamma = 0.0, Chi = 0.0, Bank = 0.0
            }
        };
        var session = new SimulationSession();
        session.StartBeat(() => beat);
        session.Begin();
        session.SetRapierAutomationEnabled(false);

        session.FeedKey(GKey.RollRight, true);
        for (int tick = 0; tick < AircraftSim.TickHz / 2; tick++) session.StepFixed();
        session.FeedKey(GKey.RollRight, false);
        double atRelease = BodyBankDeg(session.Player.State);

        double worst = 0.0;
        for (int tick = 0; tick < AircraftSim.TickHz * 15; tick++) {
            session.StepFixed();
            worst = Math.Max(worst, Math.Abs(BodyBankDeg(session.Player.State) - atRelease));
        }
        _out.WriteLine($"released at {atRelease:F1} deg body bank; "
            + $"15 s later {BodyBankDeg(session.Player.State):F1} deg (worst drift {worst:F1} deg)");
        Assert.True(worst < 12.0,
            $"bank wandered {worst:F1} deg after release from {atRelease:F1} deg — not an attitude hold");
    }
}
