using System;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

public sealed class RollDriftTests {
    readonly ITestOutputHelper _out;
    public RollDriftTests(ITestOutputHelper output) => _out = output;

    // Regression for the reported "it keeps rolling". Body attitude is the physical roll truth;
    // AircraftState.Bank is a compatibility command-bank state and can lag the quaternion while a
    // direct-aileron roll is still settling. Measuring that compatibility field made the fixed
    // bank hold look like an 8-degree drift: it was already at the captured physical attitude.
    // Keep this test on BodyRollRad so it fails only if the aeroplane really keeps rolling after
    // release, and also verify that the actuator-path target remains on the captured bank.
    [Fact]
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
        double bankAtRelease = session.Player.BodyRollRad * 180.0 / Math.PI;
        double targetAtRelease = session.Controls.Command.BankTarget * 180.0 / Math.PI;

        double drift = 0.0;
        for (int tick = 0; tick < AircraftSim.TickHz * 20; tick++) {
            session.StepFixed();
            drift = Math.Max(drift,
                Math.Abs(Math.IEEERemainder(
                    session.Player.BodyRollRad * 180.0 / Math.PI - bankAtRelease, 360.0)));
        }
        double finalBank = session.Player.BodyRollRad * 180.0 / Math.PI;
        double commandedTarget =
            session.Player.LastAppliedCommand.BankTarget * 180.0 / Math.PI;
        _out.WriteLine($"commanded BankTarget after release: {commandedTarget:F1} deg "
            + $"(actual bank {finalBank:F1} deg)");
        _out.WriteLine($"released at {bankAtRelease:F1} deg; 20 s later {finalBank:F1} deg "
            + $"(max drift {drift:F1} deg)");
        _out.WriteLine($"detent target on release {targetAtRelease:F1} deg");
        Assert.InRange(Math.Abs(Math.IEEERemainder(
            commandedTarget - targetAtRelease, 360.0)), 0.0, 1.0);
        Assert.True(drift < 8.0,
            $"bank drifted {drift:F1} deg after release from {bankAtRelease:F1} deg "
                + "— the aircraft keeps rolling instead of holding what the pilot set");
    }
}
