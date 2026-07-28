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

    static BeatSetup ManualRapierAt(double altitudeM, double speedMps) {
        BeatSetup beat = Beats.RapierIntercept() with {
            Carrier = null, StartsOnCatapult = false, ScriptedIntercept = null
        };
        return beat with {
            Player = beat.Player with {
                Position = new Vec3D(0.0, altitudeM, 0.0),
                Speed = speedMps, Gamma = 0.0, Chi = 0.0, Bank = 0.0
            }
        };
    }

    [Fact]
    public void ReleasingTheStickHoldsTheBankTheAircraftWasLeftAt() {
        var session = new SimulationSession();
        session.StartBeat(() => ManualRapierAt(15_000.0, 600.0));
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

    [Fact]
    public void ReleasingAHighGPullCapturesTheRapierNoseAttitude() {
        var session = new SimulationSession();
        session.StartBeat(() => ManualRapierAt(15_000.0, 600.0));
        session.Begin();
        session.SetRapierAutomationEnabled(false);

        session.FeedKey(GKey.PullUp, true);
        int pullTicks = 0;
        while (session.Player.State.Gamma < 30.0 * Math.PI / 180.0
            && pullTicks++ < 5 * AircraftSim.TickHz)
            session.StepFixed();
        Assert.True(session.Player.State.Gamma >= 30.0 * Math.PI / 180.0,
            "test setup never established the recorded high-G zoom");

        session.FeedKey(GKey.PullUp, false);
        session.StepFixed();
        double capturedPitch = session.Controls.CapturedPitchRad;
        double maximumPitch = session.Player.BodyPitchRad;
        double minimumPitch = session.Player.BodyPitchRad;
        double minimumCommandedG = session.Controls.Command.GDemand;
        double maximumCommandedG = session.Controls.Command.GDemand;
        bool stayedActive = session.Controls.FlightPathHoldActive;

        for (int tick = 0; tick < 10 * AircraftSim.TickHz; tick++) {
            session.StepFixed();
            maximumPitch = Math.Max(maximumPitch, session.Player.BodyPitchRad);
            minimumPitch = Math.Min(minimumPitch, session.Player.BodyPitchRad);
            minimumCommandedG = Math.Min(minimumCommandedG,
                session.Controls.Command.GDemand);
            maximumCommandedG = Math.Max(maximumCommandedG,
                session.Controls.Command.GDemand);
            stayedActive &= session.Controls.FlightPathHoldActive;
        }

        double overshootDeg = (maximumPitch - capturedPitch) * 180.0 / Math.PI;
        double undershootDeg = (capturedPitch - minimumPitch) * 180.0 / Math.PI;
        _out.WriteLine($"captured pitch {capturedPitch * 180.0 / Math.PI:F1} deg; "
            + $"10 s attitude range -{undershootDeg:F1}/+{overshootDeg:F1} deg; "
            + $"command {minimumCommandedG:F2}..{maximumCommandedG:F2} G; "
            + $"final gamma {session.Player.State.Gamma * 180.0 / Math.PI:F1} deg, "
            + $"alpha {session.Player.AngleOfAttackRad * 180.0 / Math.PI:F1} deg, "
            + $"speed {session.Player.AirspeedMps:F0} m/s");

        Assert.True(stayedActive, "neutral-stick Rapier attitude trim dropped out");
        Assert.True(double.IsNaN(session.Controls.Command.CommandedPitchRad),
            "attitude trim must remain on protected G/AoA, not the approach pitch path");
        Assert.True(overshootDeg < 3.0,
            $"nose rose {overshootDeg:F1} deg above the trimmed attitude");
        Assert.True(undershootDeg < 3.0,
            $"nose fell {undershootDeg:F1} deg below the trimmed attitude");
        Assert.True(minimumCommandedG < 0.95,
            $"steep-climb trim never unloaded below 0.95 G ({minimumCommandedG:F2} G)");
    }
}
