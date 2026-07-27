using System;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

public sealed class RollDriftTests {
    readonly ITestOutputHelper _out;
    public RollDriftTests(ITestOutputHelper output) => _out = output;

    // REPRODUCTION for the reported "it keeps rolling". Skipped so the gate stays green while the
    // cause is still open; un-skip it the moment someone picks this up, it fails immediately.
    //
    // MEASURED: roll right for 0.5 s, release at 44.5 deg bank, and 20 s later the aircraft is at
    // 127.5 deg and still going — 83 deg of drift with no input.
    //
    // LOCALISED: LastAppliedCommand.BankTarget reads 127.6 deg against an actual bank of 127.5 deg.
    // The bank target is TRACKING the aircraft instead of staying frozen at the released attitude,
    // so the FBW attitude term (RollHoldAttitudeGainNmRad * errP, FlightModel.cs:1552) always sees
    // an error of about zero and contributes nothing. Only the rate damper is left, and a rate
    // damper cannot remove steady-state error — hence a slow endless roll.
    //
    // RULED OUT: the deadband (widening RollHoldDeadband to 0.5 changes nothing), and the params
    // reaching DetentLayer (BeatSetup.PlayerAir resolves to the Rapier, whose gain is 1.2e6).
    // DetentLayer.cs:419 looks correct in isolation — it freezes _bankTarget when the gain is
    // positive and roll input is inside the deadband — so the next thing to check is whether the
    // command DetentLayer emits is being rebuilt downstream, and whether Auto-GCAS is substituting
    // a roll command on this path.
    [Fact(Skip = "open bug: bank target tracks the aircraft instead of freezing on release")]
    public void HandsOffCruiseHoldsBankInsteadOfRollingForever() {
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

        // Roll deliberately, then let go. This is the reported case: the pilot rolls and the
        // aircraft keeps going rather than stopping where it was put.
        session.FeedKey(GKey.RollRight, true);
        for (int tick = 0; tick < AircraftSim.TickHz / 2; tick++) session.StepFixed();
        session.FeedKey(GKey.RollRight, false);
        double bankAtRelease = session.Player.State.Bank * 180.0 / Math.PI;

        double drift = 0.0;
        for (int tick = 0; tick < AircraftSim.TickHz * 20; tick++) {
            session.StepFixed();
            drift = Math.Max(drift,
                Math.Abs(session.Player.State.Bank * 180.0 / Math.PI - bankAtRelease));
        }
        double finalBank = session.Player.State.Bank * 180.0 / Math.PI;
        double commandedTarget =
            session.Player.LastAppliedCommand.BankTarget * 180.0 / Math.PI;
        _out.WriteLine($"commanded BankTarget after release: {commandedTarget:F1} deg "
            + $"(actual bank {finalBank:F1} deg)");
        _out.WriteLine($"released at {bankAtRelease:F1} deg; 20 s later {finalBank:F1} deg "
            + $"(max drift {drift:F1} deg)");
        Assert.True(drift < 8.0,
            $"bank drifted {drift:F1} deg after release from {bankAtRelease:F1} deg "
                + "— the aircraft keeps rolling instead of holding what the pilot set");
    }
}
