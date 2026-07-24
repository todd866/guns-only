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

    [Fact]
    public void SlowBanditOutsideFightRadiusMustRebuildEnergyBeforeReturning() {
        AircraftParams air = FlightModel.Su27SPublicDataSurrogate;
        var bandit = new ReactiveBandit(
            new AircraftState(
                new Vec3D(0.0, 3200.0, 0.0),
                180.0, 0.0, 0.0, 0.0, air.MassKg),
            air,
            PilotSkill.Competent,
            profile: BanditSkillProfile.For(PilotSkill.Competent) with {
                LookaheadHorizonTicks = 0
            });
        var player = new AircraftSim(
            new AircraftState(
                new Vec3D(0.0, 3200.0, 1800.0),
                95.0, 0.0, 0.0, 0.0, air.MassKg),
            air);
        double dt = 1.0 / AircraftSim.TickHz;
        bool sawReturn = false;
        double minimumSpeedDuringReturnMps = double.PositiveInfinity;
        double maximumAltitudeM = bandit.State.Position.Y;

        for (int tick = 0; tick < 90 * AircraftSim.TickHz; tick++) {
            AircraftState playerState = player.State;
            bandit.Step(ActorObservation.Capture(playerState, tick), dt);
            player.Step(new PilotCommand(1.0, 0.0, 0.22, 0.0), dt);
            maximumAltitudeM = System.Math.Max(
                maximumAltitudeM, bandit.State.Position.Y);
            if (bandit.Tactic == BanditTactic.Return) {
                sawReturn = true;
                minimumSpeedDuringReturnMps = System.Math.Min(
                    minimumSpeedDuringReturnMps, bandit.State.Speed);
            }
        }

        Assert.True(sawReturn, "the chase never exercised the Return tactic");
        // One integration tick may cross the entry threshold after Return was selected. It must
        // hand off immediately instead of continuing the high-G turn into the documented ~28 m/s
        // deep-stall wallow.
        Assert.True(minimumSpeedDuringReturnMps > 105.0,
            $"Return continued into low energy; "
            + $"minimum {minimumSpeedDuringReturnMps:F1} m/s, "
            + $"maximum altitude {maximumAltitudeM:F0} m");
    }
}
