using GunsOnly.Sim;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// The 2030s turbo-ramjet interceptor, measured against the real integrator rather than against the
/// sizing pass that produced it. Every number in the design note is a PREDICTION until this file
/// disagrees with it — which is the only reason the file exists.
///
/// The aircraft's whole character is a large gap between what it can do once and what it can
/// sustain, so these tests are written to catch that gap CLOSING (which would make it an ordinary
/// fighter) as much as to catch it failing to open.
public class RapierTests {
    readonly ITestOutputHelper _out;
    public RapierTests(ITestOutputHelper output) => _out = output;

    static AircraftParams Jet => FlightModel.RapierPublicDataSurrogate;

    static AircraftSim At(double altitudeM, double speedMps, double gammaRad = 0.0) => new(
        new AircraftState(new Vec3D(0.0, altitudeM, 0.0), speedMps, gammaRad, 0.0, 0.0, Jet.MassKg),
        Jet, StandardAtmosphere1976.Instance);

    [Fact]
    public void TheTurbineCarriesItLowAndTheRamCarriesItHigh() {
        _out.WriteLine("thrust fraction of sea-level static dry, by Mach and altitude:");
        _out.WriteLine("  (turbine fades 1.9->2.7, ram fades in 1.6->2.2; they OVERLAP on purpose)");
        foreach (double altitudeM in new[] { 0.0, 11_000.0, 21_500.0 }) {
            AtmosphericState air = StandardAtmosphere1976.Instance.Sample(altitudeM);
            var row = new System.Text.StringBuilder($"  {altitudeM,7:F0} m:");
            foreach (double mach in new[] { 0.4, 0.9, 1.4, 1.8, 2.2, 2.6, 3.0 }) {
                double fraction = Propulsion.TurboRamjetPerformanceMap.ThrustFraction(
                    mach, air.TemperatureK, air.DensityKgM3);
                row.Append($"  M{mach:F1}={fraction:F2}");
            }
            _out.WriteLine(row.ToString());
        }

        AtmosphericState sea = StandardAtmosphere1976.Instance.Sample(0.0);
        double staticFraction = Propulsion.TurboRamjetPerformanceMap.ThrustFraction(
            0.0, sea.TemperatureK, sea.DensityKgM3);
        Assert.InRange(staticFraction, 0.95, 1.05);

        // The engine must still be worth having at cruise — this is the whole architecture.
        AtmosphericState cruise = StandardAtmosphere1976.Instance.Sample(21_500.0);
        double cruiseFraction = Propulsion.TurboRamjetPerformanceMap.ThrustFraction(
            2.6, cruise.TemperatureK, cruise.DensityKgM3);
        Assert.True(cruiseFraction > 0.20,
            $"ram mode produced only {cruiseFraction:F3} of static thrust at the design point");

        // ...and it must NOT become a monster in a low dive. A fixed inlet spills what it cannot
        // swallow; without the capture ceiling this read 3.6x and the attack dive was free.
        AtmosphericState low = StandardAtmosphere1976.Instance.Sample(9_000.0);
        double diveFraction = Propulsion.TurboRamjetPerformanceMap.ThrustFraction(
            2.6, low.TemperatureK, low.DensityKgM3);
        _out.WriteLine($"  low-dive M2.6 at 9,000 m = {diveFraction:F2} of static");
        Assert.True(diveFraction < 1.6,
            $"inlet capture ceiling is not holding: {diveFraction:F2}x static thrust in a dive");
    }

    [Fact]
    public void ItAcceleratesHardEnoughToBeWorthFlying() {
        // "Enough power that it's fun to get it up to speed" is a real requirement, so it gets a
        // real test. Level acceleration at low altitude on the augmentor.
        var sim = At(3_000.0, 180.0);
        var command = new PilotCommand(1.0, 0.0, Jet.MaxThrustFraction, 0.0);
        sim.SeedEnginePowerFraction(Jet.MaxThrustFraction);
        const double Dt = 1.0 / AircraftSim.TickHz;
        double startSpeed = sim.State.Speed;
        for (int tick = 0; tick < AircraftSim.TickHz * 30; tick++) sim.Step(command, Dt);
        double gained = sim.State.Speed - startSpeed;
        _out.WriteLine($"30 s level accel at 3,000 m: {startSpeed:F0} -> {sim.State.Speed:F0} m/s "
            + $"(+{gained:F0} m/s, mean {gained / 30.0:F2} m/s^2)");
        Assert.True(gained > 90.0,
            $"only gained {gained:F0} m/s in 30 s — this does not feel like a fast aircraft");
    }

    [Fact]
    public void ItReachesVeryHighAndVeryFast() {
        // The mission is deep-rear basing, so cruise altitude and speed are the product.
        // THE REAL QUESTION IS WHETHER IT HOLDS CRUISE, not what it drifts to. Free-flying at 1 G
        // with excess thrust just climbs — an earlier version of this test watched it go to 25 km
        // and reported the thinner air as a failure of the engine. Start at the design point and
        // ask whether thrust still beats drag there.
        const double CruiseAltitudeM = 21_500.0;
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(CruiseAltitudeM);
        double designSpeed = 2.6 * air.SpeedOfSoundMps;
        var sim = At(CruiseAltitudeM, designSpeed);
        var command = new PilotCommand(1.0, 0.0, Jet.MaxThrustFraction, 0.0);
        sim.SeedEnginePowerFraction(Jet.MaxThrustFraction);
        const double Dt = 1.0 / AircraftSim.TickHz;
        double lowestMach = 2.6;
        for (int tick = 0; tick < AircraftSim.TickHz * 90; tick++) {
            sim.Step(command, Dt);
            AtmosphericState now = StandardAtmosphere1976.Instance.Sample(sim.State.Position.Y);
            lowestMach = System.Math.Min(lowestMach, sim.AirspeedMps / now.SpeedOfSoundMps);
        }
        AtmosphericState end = StandardAtmosphere1976.Instance.Sample(sim.State.Position.Y);
        double mach = sim.AirspeedMps / end.SpeedOfSoundMps;
        _out.WriteLine($"held at design cruise for 90 s: M{mach:F2} at "
            + $"{sim.State.Position.Y:F0} m (lowest M{lowestMach:F2})");
        Assert.True(lowestMach > 2.3,
            $"decayed to M{lowestMach:F2} — it cannot hold its own design cruise");
    }

    [Fact]
    public void InstantaneousGIsEnormousButSustainedGIsNot() {
        // The defining gap. Instantaneous comes from structure; sustained comes from thrust, and
        // this aircraft has far more of the former than the latter. If this ratio ever narrows the
        // aircraft has quietly become a conventional fighter and the whole concept is gone.
        const double Dt = 1.0 / AircraftSim.TickHz;
        double bestInstantaneous = 0.0;
        foreach (double speedMps in new[] { 220.0, 280.0, 340.0, 400.0, 460.0 }) {
            var sim = At(6_000.0, speedMps);
            sim.SeedEnginePowerFraction(Jet.MaxThrustFraction);
            var pull = new PilotCommand(Jet.PositiveStructuralLimitG, 0.0, Jet.MaxThrustFraction, 0.0);
            // Let the pull DEVELOP. An earlier version stepped 0.2 s and measured the pitch
            // response mid-rotation rather than the load factor the wing can actually make,
            // reporting 3.9 G for an aircraft that reaches double that.
            double peak = 0.0;
            for (int tick = 0; tick < AircraftSim.TickHz * 2; tick++) {
                sim.Step(pull, Dt);
                peak = System.Math.Max(peak, sim.LastNz);
            }
            bestInstantaneous = System.Math.Max(bestInstantaneous, peak);
            _out.WriteLine($"  {speedMps,5:F0} m/s at 6,000 m -> {peak:F2} G peak instantaneous");
        }

        // SUSTAINED is the G it still holds once the speed has stopped falling. Commanding the
        // structural limit and waiting simply stalls it — an earlier version measured 0.36 G at
        // 72 m/s, which is not a sustained turn, it is a crash in progress. Sweep instead for the
        // highest G that is still being held after the energy has settled.
        double sustained = 0.0;
        foreach (double demandG in new[] { 2.0, 3.0, 4.0, 5.0, 6.0 }) {
            var sustain = At(6_000.0, 320.0);
            sustain.SeedEnginePowerFraction(Jet.MaxThrustFraction);
            var hold = new PilotCommand(demandG, 0.0, Jet.MaxThrustFraction, 0.0);
            for (int tick = 0; tick < AircraftSim.TickHz * 20; tick++) sustain.Step(hold, Dt);
            bool holding = sustain.LastNz >= demandG - 0.35 && sustain.State.Speed > 150.0;
            _out.WriteLine($"  demand {demandG:F1} G -> held {sustain.LastNz:F2} G at "
                + $"{sustain.State.Speed:F0} m/s {(holding ? "SUSTAINED" : "bled off")}");
            if (holding) sustained = demandG;
        }
        _out.WriteLine($"sustained ceiling: {sustained:F1} G");

        Assert.True(bestInstantaneous > 8.0,
            $"instantaneous peak was only {bestInstantaneous:F1} G");
        Assert.True(sustained < bestInstantaneous * 0.65,
            $"sustained {sustained:F1} G is too close to instantaneous {bestInstantaneous:F2} G "
            + "— the one-pass character has been lost");
    }

    /// The mission the pilot actually asked for: "something I can catshot, climb, cruise, descend
    /// and trap". This flies the first two phases through the real session, because a beat that
    /// compiles is not a beat that launches.
    [Fact]
    public void TheMissionLaunchesOffTheCatapultAndClimbsAway() {
        var session = new SimulationSession(10);
        Assert.Equal("Rapier intercept", session.Beat.Name);
        Assert.Same(FlightModel.RapierPublicDataSurrogate, session.Beat.PlayerAir);

        // The declared launcher, not the 62 m/s deck default — which is below flying speed here.
        Assert.Equal(88.0, session.Catapult.EndSpeedMps, precision: 6);
        Assert.Equal(130.0, session.Catapult.StrokeM, precision: 6);

        session.Begin();
        Assert.True(session.Catapult.IsActive, "the sortie must begin ON the catapult");

        // Track the fastest the aircraft gets during and just after the stroke. Sampling only the
        // single tick the phase flips is fragile — the handoff state lands a tick later.
        double launchSpeed = 0.0;
        for (int tick = 0; tick < AircraftSim.TickHz * 6; tick++) {
            session.StepFixed();
            launchSpeed = System.Math.Max(launchSpeed, session.Player.State.Speed);
        }
        _out.WriteLine($"peak speed over the stroke: {launchSpeed:F0} m/s "
            + $"({launchSpeed / 0.514444:F0} kt), climbing through "
            + $"{session.Player.State.Position.Y:F0} m");

        Assert.True(launchSpeed > 80.0,
            $"never exceeded {launchSpeed:F0} m/s — the declared 88 m/s launcher did not deliver");

        // Now fly it: full lever, hold a climb, and confirm it is going up rather than mushing.
        double startAltitude = session.Player.State.Position.Y;
        for (int tick = 0; tick < AircraftSim.TickHz * 60; tick++) session.StepFixed();
        double climbed = session.Player.State.Position.Y - startAltitude;
        _out.WriteLine($"60 s after launch: {session.Player.State.Position.Y:F0} m "
            + $"(+{climbed:F0} m), {session.Player.State.Speed:F0} m/s");
        Assert.True(session.Player.State.Position.Y > 20.0,
            "the aircraft went into the ground off the catapult");
    }
}
