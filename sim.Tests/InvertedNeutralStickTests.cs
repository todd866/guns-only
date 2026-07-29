using System;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Owner flight report 2026-07-29: "inverted it pulls 6g uncommanded." Neutral stick while
/// inverted must ask for negative G (the documented signed body-bank compensation), never a
/// positive pull through the horizon.
/// </summary>
public sealed class InvertedNeutralStickTests {
    readonly ITestOutputHelper _out;
    public InvertedNeutralStickTests(ITestOutputHelper output) => _out = output;

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

    static double BodyBankDeg(in AircraftState s) {
        var forward = s.BodyAttitude.Rotate(new Vec3D(0, 0, 1));
        var bodyUp = s.BodyAttitude.Rotate(new Vec3D(0, 1, 0));
        var up0 = new Vec3D(0, 1, 0) - forward * forward.Y;
        if (up0.Length < 1e-6) return s.Bank * 180.0 / Math.PI;
        up0 = up0.Normalized();
        var right = up0.Cross(forward).Normalized();
        return Math.Atan2(bodyUp.Dot(right), bodyUp.Dot(up0)) * 180.0 / Math.PI;
    }

    [Fact]
    public void HandsOffInvertedNeverPullsThroughTheHorizon() {
        var session = new SimulationSession();
        session.StartBeat(() => ManualRapierAt(8_000.0, 450.0));
        session.Begin();
        session.SetRapierAutomationEnabled(false);

        // Roll to inverted, then hands off.
        session.FeedKey(GKey.RollRight, true);
        int rollTicks = 0;
        while (Math.Abs(Math.Abs(BodyBankDeg(session.Player.State)) - 180.0) > 25.0
            && rollTicks++ < 6 * AircraftSim.TickHz)
            session.StepFixed();
        session.FeedKey(GKey.RollRight, false);
        double bankAtRelease = BodyBankDeg(session.Player.State);
        Assert.True(Math.Abs(Math.Abs(bankAtRelease) - 180.0) <= 30.0,
            $"setup never reached inverted (released at {bankAtRelease:F0} deg)");

        double maxCommandedG = double.NegativeInfinity;
        double maxLoadG = double.NegativeInfinity;
        for (int tick = 0; tick < AircraftSim.TickHz * 5; tick++) {
            session.StepFixed();
            maxCommandedG = Math.Max(maxCommandedG, session.Controls.Command.GDemand);
            maxLoadG = Math.Max(maxLoadG, session.Player.LastPilotNormalAccelerationG);
        }
        _out.WriteLine($"released inverted at {bankAtRelease:F0} deg; 5 s hands-off: "
            + $"max commanded {maxCommandedG:F2} G, max load {maxLoadG:F2} G, "
            + $"final bank {BodyBankDeg(session.Player.State):F0} deg, "
            + $"gamma {session.Player.State.Gamma * 180.0 / Math.PI:F1} deg");

        Assert.True(maxCommandedG <= 1.0,
            $"neutral stick inverted commanded a {maxCommandedG:F2} G pull");
        Assert.True(maxLoadG <= 2.0,
            $"neutral stick inverted flew a {maxLoadG:F2} G pull through the horizon");
    }

    [Fact]
    public void HandsOffInvertedDoesNotSplitEssThroughTheHorizon() {
        var session = new SimulationSession();
        session.StartBeat(() => ManualRapierAt(8_000.0, 450.0));
        session.Begin();
        session.SetRapierAutomationEnabled(false);

        session.FeedKey(GKey.RollRight, true);
        int rollTicks = 0;
        while (Math.Abs(Math.Abs(BodyBankDeg(session.Player.State)) - 180.0) > 25.0
            && rollTicks++ < 6 * AircraftSim.TickHz)
            session.StepFixed();
        session.FeedKey(GKey.RollRight, false);

        double minGammaDeg = double.PositiveInfinity;
        for (int tick = 0; tick < AircraftSim.TickHz * 5; tick++) {
            session.StepFixed();
            minGammaDeg = Math.Min(minGammaDeg,
                session.Player.State.Gamma * 180.0 / Math.PI);
        }
        // Pre-fix the divergent pull drove gamma to -48 deg inside 5 s. An honest inverted
        // hold may sag, not dive: the nose must stay well clear of a split-S.
        _out.WriteLine($"minimum gamma over 5 s hands-off inverted: {minGammaDeg:F1} deg");
        Assert.True(minGammaDeg > -25.0,
            $"hands-off inverted dove to gamma {minGammaDeg:F1} deg — split-S through the horizon");
    }

    [Fact]
    public void UprightHandsOffStaysANearOneGHold() {
        var session = new SimulationSession();
        session.StartBeat(() => ManualRapierAt(8_000.0, 450.0));
        session.Begin();
        session.SetRapierAutomationEnabled(false);

        // Shallow bank, hands off: the corrected law must be indistinguishable from the old
        // one at small bank (denominator -> ~1) and hold roughly wings-level 1 G flight.
        session.FeedKey(GKey.RollRight, true);
        for (int tick = 0; tick < AircraftSim.TickHz / 5; tick++) session.StepFixed();
        session.FeedKey(GKey.RollRight, false);

        double maxAbsCommandDelta = 0.0;
        for (int tick = 0; tick < AircraftSim.TickHz * 5; tick++) {
            session.StepFixed();
            maxAbsCommandDelta = Math.Max(maxAbsCommandDelta,
                Math.Abs(session.Controls.Command.GDemand - 1.0));
        }
        _out.WriteLine($"upright hands-off max |G - 1| = {maxAbsCommandDelta:F2}");
        Assert.True(maxAbsCommandDelta <= 1.5,
            $"upright neutral hold wandered {maxAbsCommandDelta:F2} G from level");
    }
}
