using GunsOnly.Sim.Doctrine;
using Xunit;

namespace GunsOnly.Sim.Tests;

public class EnergyZoomRepro {
    [Fact]
    public void EnergyExtensionEnteredNoseHighMustNotSustainAZoomClimb() {
        // Build 72 mobile telemetry: a Novice fled vertically after the merge — 18k to 28k+ ft
        // over ~65 s. Hypothesis: EnergyCommand's fixed 0.55 G unload at maximum throttle,
        // entered nose-high and slow on an afterburning airframe, is an accidental sustained
        // zoom, and the climb keeps IAS below the Energy exit gate.
        AircraftParams air = FlightModel.Su27SPublicDataSurrogate;
        var climbing = new AircraftState(
            new Vec3D(0.0, 5600.0, 0.0), 165.0, 0.85, 0.0, 0.0, air.MassKg);
        var bandit = new ReactiveBandit(climbing, air, PilotSkill.Novice);
        var player = new AircraftState(
            new Vec3D(300.0, 5300.0, -900.0), 250.0, 0.0, 0.0, 0.0, air.MassKg);
        double dt = 1.0 / AircraftSim.TickHz;
        double maxAltitude = climbing.Position.Y;
        double gammaAfter10s = double.NaN;
        for (int tick = 0; tick < 25 * AircraftSim.TickHz; tick++) {
            bandit.Step(ActorObservation.Capture(player, tick), dt);
            maxAltitude = System.Math.Max(maxAltitude, bandit.State.Position.Y);
            if (tick == 10 * AircraftSim.TickHz) gammaAfter10s = bandit.State.Gamma;
        }
        Assert.True(maxAltitude - climbing.Position.Y < 1500.0,
            $"bandit zoomed {maxAltitude - climbing.Position.Y:F0} m above entry");
        // The pushover guard hands control back below 20 deg of climb; by ten seconds the nose
        // must be at or through that boundary, not still parked at the 49-deg entry.
        Assert.True(gammaAfter10s < 0.40,
            $"nose still {gammaAfter10s * 57.3:F0} deg high after 10 s");
    }
}
