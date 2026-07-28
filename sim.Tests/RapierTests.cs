using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
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

    static ITerrainSurface FlatLand(double heightM) =>
        new BilinearHeightGrid(-10_000.0, -10_000.0, 10_000.0, 10_000.0,
            new double[,]
            {
                { heightM, heightM, heightM },
                { heightM, heightM, heightM },
                { heightM, heightM, heightM }
            });

    [Fact]
    public void TransonicWaveDragPeakIsExplicitlyLockedAndBounded() {
        const double alpha = 0.05;
        const double belowPeakMach = 1.17;
        double cl = Jet.CLAlpha * alpha;
        double originalBelowPeak = Jet.CD0
            * (1.0 + Jet.WaveDragK
                * Math.Pow(belowPeakMach - Jet.MCrit, 2.0))
            + Jet.InducedK * cl * cl;

        double actualBelowPeak = FlightModel.ProfileDragCoefficient(
            alpha, belowPeakMach, Jet);
        double atPeak = FlightModel.ProfileDragCoefficient(
            alpha, Jet.WaveDragPeakMach, Jet);
        double atMachThree = FlightModel.ProfileDragCoefficient(alpha, 3.0, Jet);

        Assert.Equal(1.18, Jet.WaveDragPeakMach, 12);
        Assert.Equal(originalBelowPeak, actualBelowPeak, 12);
        Assert.Equal(atPeak, atMachThree, 12);
    }

    [Fact]
    public void TheTurbineCarriesItLowAndTheRamCarriesItHigh() {
        _out.WriteLine("thrust fraction of sea-level static dry, by Mach and altitude:");
        _out.WriteLine("  (turbine fades 1.9->3.0, ram fades in 1.6->2.2; they OVERLAP on purpose)");
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
    public void PropulsionChannelsMakeTheTurbineToRamjetHandoffUnambiguous() {
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(21_500.0);
        var turbine = Propulsion.TurboRamjetPerformanceMap.ThrustComponents(
            1.4, air.TemperatureK, air.DensityKgM3);
        var overlap = Propulsion.TurboRamjetPerformanceMap.ThrustComponents(
            2.1, air.TemperatureK, air.DensityKgM3);
        var ramjet = Propulsion.TurboRamjetPerformanceMap.ThrustComponents(
            3.0, air.TemperatureK, air.DensityKgM3);

        _out.WriteLine($"M1.4 turb {turbine.Turbine:F4} ram {turbine.Ramjet:F4} | "
            + $"M2.1 turb {overlap.Turbine:F4} ram {overlap.Ramjet:F4} | "
            + $"M3.0 turb {ramjet.Turbine:F4} ram {ramjet.Ramjet:F4}");
        Assert.True(turbine.Turbine > 0.0);
        Assert.Equal(0.0, turbine.Ramjet, precision: 9);
        Assert.True(overlap.Turbine > 0.0);
        Assert.True(overlap.Ramjet > 0.0);
        Assert.Equal(0.0, ramjet.Turbine, precision: 9);
        Assert.True(ramjet.Ramjet > 0.0);
    }

    [Fact]
    public void TurbineCoreIsDeadByOneHundredThousandFeetRegardlessOfMach() {
        // Sqrt-density alone left ~12% of SLS at FL1000, so ZoomCoast (throttle 0) still
        // attributed idle fuel / spool to a "turbine" that cannot breathe. Density must kill
        // the core well below 100 kft; Mach fade alone is not enough on a ballistic coast.
        const double ExoAltitudeM = 100_000.0 * 0.3048; // 30_480 m
        AtmosphericState exo = StandardAtmosphere1976.Instance.Sample(ExoAltitudeM);
        AtmosphericState shelf = StandardAtmosphere1976.Instance.Sample(17_000.0);

        foreach (double mach in new[] { 0.9, 1.5, 2.2, 2.8 }) {
            var exoParts = Propulsion.TurboRamjetPerformanceMap.ThrustComponents(
                mach, exo.TemperatureK, exo.DensityKgM3);
            _out.WriteLine($"FL1000 M{mach:F1}: turb {exoParts.Turbine:F5} ram {exoParts.Ramjet:F5}");
            Assert.True(exoParts.Turbine < 1e-6,
                $"turbine still {exoParts.Turbine:F5} of SLS at FL1000 / M{mach:F1}");

            var idle = Propulsion.TurboRamjetPerformanceMap.Evaluate(
                commandedFraction: 0.0,
                staticThrustN: Jet.ThrustMaxN,
                mach, exo.TemperatureK, exo.DensityKgM3,
                Jet.GenericIdleFuelFlowLbPerMinute,
                Jet.GenericMilitaryFuelFlowLbPerMinute,
                Jet.GenericAfterburnerFuelFlowLbPerMinute,
                Jet.MaxThrustFraction);
            Assert.Equal(0.0, idle.NetThrustN, precision: 9);
            Assert.True(idle.FuelFlowLbPerMinute < 1e-6,
                $"idle still burns {idle.FuelFlowLbPerMinute:F3} lb/min at FL1000 / M{mach:F1}");
        }

        // Mission shelf must keep a breathing core — density cutoff is exo, not FL560.
        var shelfParts = Propulsion.TurboRamjetPerformanceMap.ThrustComponents(
            0.9, shelf.TemperatureK, shelf.DensityKgM3);
        Assert.True(shelfParts.Turbine > 0.20,
            $"density cutoff killed the climb turbine early: {shelfParts.Turbine:F3}");
    }

    [Fact]
    public void PerStreamFuelIdlesTheCoreOnceRamOwnsTheFlow() {
        AtmosphericState cruise = StandardAtmosphere1976.Instance.Sample(
            Propulsion.TurboRamjetPerformanceMap.DesignAltitudeM);
        // Past TurbineGoneMach the core is out; ram alone carries the bill.
        const double Mach = 3.05;
        var point = Propulsion.TurboRamjetPerformanceMap.Evaluate(
            commandedFraction: 1.20,
            staticThrustN: Jet.ThrustMaxN,
            Mach, cruise.TemperatureK, cruise.DensityKgM3,
            Jet.GenericIdleFuelFlowLbPerMinute,
            Jet.GenericMilitaryFuelFlowLbPerMinute,
            Jet.GenericAfterburnerFuelFlowLbPerMinute,
            Jet.MaxThrustFraction);
        var parts = Propulsion.TurboRamjetPerformanceMap.ThrustComponents(
            Mach, cruise.TemperatureK, cruise.DensityKgM3);

        Assert.True(parts.Turbine < 1e-6, $"turbine still {parts.Turbine:F4} at M{Mach}");
        Assert.True(parts.Ramjet > 0.2, $"ram dead at M{Mach}: {parts.Ramjet:F3}");
        Assert.True(point.TurbineFuelFlowLbPerMinute < 1e-6,
            $"turbine still charging {point.TurbineFuelFlowLbPerMinute:F2} lb/min past handover");
        Assert.True(point.RamjetFuelFlowLbPerMinute > 1.0,
            "ram stream should own the fuel bill in ram cruise");
        Assert.Equal(
            point.FuelFlowLbPerMinute,
            point.TurbineFuelFlowLbPerMinute + point.RamjetFuelFlowLbPerMinute,
            precision: 6);

        // Mid-handover: core still lit but unloading — turbine fuel collapses toward idle while
        // lever stays at military, instead of charging full mil SFC against total thrust.
        const double HandoverMach = 2.5;
        var mid = Propulsion.TurboRamjetPerformanceMap.Evaluate(
            commandedFraction: 1.0,
            staticThrustN: Jet.ThrustMaxN,
            HandoverMach, cruise.TemperatureK, cruise.DensityKgM3,
            Jet.GenericIdleFuelFlowLbPerMinute,
            Jet.GenericMilitaryFuelFlowLbPerMinute,
            Jet.GenericAfterburnerFuelFlowLbPerMinute,
            Jet.MaxThrustFraction);
        var midParts = Propulsion.TurboRamjetPerformanceMap.ThrustComponents(
            HandoverMach, cruise.TemperatureK, cruise.DensityKgM3);
        Assert.True(midParts.Turbine > 1e-6 && midParts.Ramjet > 1e-6,
            "handover band should light both streams");
        Assert.True(mid.TurbineFuelFlowLbPerMinute
                < Jet.GenericMilitaryFuelFlowLbPerMinute * 0.55,
            $"turbine still near mil ({mid.TurbineFuelFlowLbPerMinute:F1}) while unloading");
        Assert.True(mid.RamjetFuelFlowLbPerMinute > 0.5,
            "ram must already be drawing fuel in the handover band");
    }

    [Fact]
    public void DesignGrossIncludesFourStowedGunDronesAndFamilyTwCap() {
        Assert.Equal(
            FlightModel.RapierAirframeFuelFreeMassKg
                + FlightModel.RapierDesignStowedGunDroneMassKg,
            Jet.FuelFreeMassKg,
            precision: 3);
        Assert.Equal(1_440.0, FlightModel.RapierDesignStowedGunDroneMassKg, precision: 3);
        Assert.Equal(
            Jet.FuelFreeMassKg + 4_500.0,
            Jet.MassKg,
            precision: 3);
        double augTw = Jet.ThrustMaxN * Jet.MaxThrustFraction / (Jet.MassKg * 9.80665);
        Assert.True(augTw <= 1.20 + 1e-9, $"augmented T/W {augTw:F3} exceeds family 1.20");
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
    public void CombinedCycleEngineHoldsTheDashItsStructureAllows() {
        // Was a Mach-4 dash. Nothing has ever sustained Mach 4 in air-breathing flight — the SR-71
        // topped near M3.2 on titanium, the MiG-25 at M2.83 on steel — so a cheap attritable jet
        // doing M4.13 was past every aircraft ever built. The design point is back at M2.6 and the
        // dash is flown just under the 320 C skin limit, which is about M3.14.
        const double DashAltitudeM = 21_500.0;
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(DashAltitudeM);
        var sim = At(DashAltitudeM, 2.9 * air.SpeedOfSoundMps);
        var command = new PilotCommand(1.0, 0.0, Jet.MaxThrustFraction, 0.0);
        sim.SeedEnginePowerFraction(Jet.MaxThrustFraction);
        double lowestMach = 2.9;
        for (int tick = 0; tick < AircraftSim.TickHz * 45; tick++) {
            sim.Step(command, 1.0 / AircraftSim.TickHz);
            AtmosphericState current = StandardAtmosphere1976.Instance.Sample(
                sim.State.Position.Y);
            lowestMach = Math.Min(lowestMach,
                sim.AirspeedMps / current.SpeedOfSoundMps);
        }
        AtmosphericState finalAir = StandardAtmosphere1976.Instance.Sample(
            sim.State.Position.Y);
        double finalMach = sim.AirspeedMps / finalAir.SpeedOfSoundMps;
        _out.WriteLine($"structural dash hold: lowest M{lowestMach:F2}, final M{finalMach:F2}, "
            + $"{sim.LastEngineOperatingPoint.NetThrustN / 1000.0:F1} kN");
        Assert.True(lowestMach >= 2.70,
            $"the TBCC decayed below its own structural dash: M{lowestMach:F2}");
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
        Assert.Equal(Carrier.PlatformKind.FixedArrestingStrip, session.Carrier!.Kind);
        Assert.False(session.Carrier.IsMaritime);
        Assert.Equal(1_200.0, session.Carrier.DeckLengthM, precision: 6);
        Assert.Equal(48.0, session.Carrier.DeckHalfWidthM * 2.0, precision: 6);
        Assert.Equal(120.5, session.Carrier.Position.Y, precision: 6);
        Assert.Equal(Vec3D.Zero, session.Carrier.SteadyWindWorld);

        // The declared launcher, not the 62 m/s deck default — which is below flying speed here.
        // 110 m/s is 1.67 x stall at launch mass. It was 150, which is 2.28 Vs — about double a
        // carrier cat shot, and the reason the launch and climbout read as frantic.
        Assert.Equal(110.0, session.Catapult.EndSpeedMps, precision: 6);
        Assert.Equal(520.0, session.Catapult.StrokeM, precision: 6);
        // And it points UP. A flat shot at 436 kg/m2 leaves the aircraft settling off the end with
        // nothing but a 6 m/s token climb rate; the ramp turns the stroke into a climb.
        Assert.True(session.Catapult.RampAngleRad > 0.05,
            "the land launcher must be ramped, not flat");

        _out.WriteLine($"staged lever {session.Controls.Throttle:F2} "
            + $"(beat asks {session.Beat.InitialThrottle:F2}, "
            + $"lever stop {session.Beat.PlayerAir.MaxThrustFraction:F2})");
        session.Begin();
        _out.WriteLine($"after Begin(): lever {session.Controls.Throttle:F2}");
        Assert.True(session.Catapult.IsActive, "the sortie must begin ON the catapult");

        // Track the fastest the aircraft gets during and just after the stroke. Sampling only the
        // single tick the phase flips is fragile — the handoff state lands a tick later.
        // A 520 m stroke to 110 m/s takes about 9.5 s at 1.19 G — far longer and far gentler than
        // a deck shot, which is the point. Measure past the end of it.
        double launchSpeed = 0.0;
        for (int tick = 0; tick < AircraftSim.TickHz * 12; tick++) {
            session.StepFixed();
            launchSpeed = System.Math.Max(launchSpeed, session.Player.State.Speed);
        }
        _out.WriteLine($"peak speed over the stroke: {launchSpeed:F0} m/s "
            + $"({launchSpeed / 0.514444:F0} kt), climbing through "
            + $"{session.Player.State.Position.Y:F0} m");

        Assert.True(launchSpeed > 105.0,
            $"never exceeded {launchSpeed:F0} m/s — the declared 110 m/s launcher did not deliver");

        // Now fly it: full lever, hold a climb, and confirm it is going up rather than mushing.
        double startAltitude = session.Player.State.Position.Y;
        for (int second = 0; second < 60; second++) {
            for (int tick = 0; tick < AircraftSim.TickHz; tick++) session.StepFixed();
            if (second % 10 == 9 || second < 3) {
                _out.WriteLine($"  t+{second + 1,2}s  {session.Player.State.Position.Y,7:F0} m  "
                    + $"{session.Player.State.Speed,5:F0} m/s  "
                    + $"gamma {session.Player.State.Gamma * 180.0 / System.Math.PI,5:F1} deg  "
                    + $"lever {session.Controls.Throttle:F2}  "
                    + $"thrust {session.Player.LastEngineOperatingPoint.NetThrustN / 1000.0,5:F1} kN");
            }
        }
        double climbed = session.Player.State.Position.Y - startAltitude;
        _out.WriteLine($"60 s after launch: {session.Player.State.Position.Y:F0} m "
            + $"(+{climbed:F0} m), {session.Player.State.Speed:F0} m/s");
        Assert.True(climbed > 300.0,
            $"only climbed {climbed:F0} m in 60 s — the launch is not working");
        Assert.True(session.Player.State.Position.Y > 20.0,
            "the aircraft went into the ground off the catapult");
    }

    /// This is the propulsion question in its operational form. It starts with the authored
    /// 1,406 kg alert load on the authored launcher, climbs around M0.90 to FL560, accelerates level
    /// through the turbine/ram overlap, then climbs on ram power to FL700. The controller uses only
    /// SimulationSession's production key-input boundary; no state teleport or AircraftSim-only
    /// sizing calculation is allowed to answer whether the mission works.
    [Fact]
    public void TheCatapultMissionCanReachRamCruiseOnTheAuthoredFuelLoad() {
        const double ClimbTopM = 56_000.0 * 0.3048;
        const double CruiseAltitudeM = 70_000.0 * 0.3048;
        const double MaximumProfileSeconds = 15.0 * 60.0;
        var session = new SimulationSession(10);
        double initialFuelLb = session.PlayerFuel.FuelLb;
        double maxMach = 0.0;
        double? timeToMach22Seconds = null;
        double? fuelAtMach22Lb = null;
        double? climbTopTimeSeconds = null;
        double? fuelAtClimbTopLb = null;
        double? altitudeAtMach22M = null;
        double accelerationMinimumAltitudeM = double.PositiveInfinity;
        double accelerationMaximumAltitudeM = double.NegativeInfinity;
        bool pullHeld = false;
        bool pushHeld = false;

        Assert.Equal(3_600.0, initialFuelLb, precision: 6);
        Assert.InRange(initialFuelLb * 0.45359237, 1_630.0, 1_635.0);
        // Decision records do not feed flight, propulsion, fuel, opponent control, or outcomes.
        // They are intentionally off in this long propulsion card to avoid allocating a combat
        // training row on every one of roughly sixty thousand unrelated transit ticks.
        session.DecisionCaptureEnabled = false;
        session.Begin();
        Assert.True(session.Catapult.IsActive);
        Assert.False(session.ToggleRapierAutomation());

        int maximumTicks = (int)(MaximumProfileSeconds * AircraftSim.TickHz);
        for (int tick = 0; tick < maximumTicks; tick++) {
            double altitudeM = session.Player.State.Position.Y;
            AtmosphericState air = StandardAtmosphere1976.Instance.Sample(altitudeM);
            double mach = session.Player.AirspeedMps / air.SpeedOfSoundMps;
            maxMach = System.Math.Max(maxMach, mach);

            if (timeToMach22Seconds is null && mach >= 2.2) {
                timeToMach22Seconds = session.TimeSeconds;
                fuelAtMach22Lb = session.PlayerFuel.FuelLb;
                altitudeAtMach22M = altitudeM;
            }
            if (climbTopTimeSeconds is null && altitudeM >= ClimbTopM - 40.0) {
                climbTopTimeSeconds = session.TimeSeconds;
                fuelAtClimbTopLb = session.PlayerFuel.FuelLb;
            }
            if (climbTopTimeSeconds is not null && timeToMach22Seconds is null) {
                accelerationMinimumAltitudeM = System.Math.Min(
                    accelerationMinimumAltitudeM, altitudeM);
                accelerationMaximumAltitudeM = System.Math.Max(
                    accelerationMaximumAltitudeM, altitudeM);
            }
            if (timeToMach22Seconds is not null
                && altitudeM >= CruiseAltitudeM
                && mach >= 2.15)
                break;
            if (session.PlayerTerminalState != AircraftTerminalState.Flying
                || session.Lifecycle != SimulationSession.LifecycleState.Active)
                break;

            double targetGamma;
            if (session.Catapult.IsActive) {
                // The launcher owns the flight path until handoff.
                targetGamma = session.Player.State.Gamma;
            } else if (altitudeM < ClimbTopM - 40.0 && timeToMach22Seconds is null) {
                // Energy climb: shallow while the aircraft accelerates to M0.90, then exchange
                // further excess power for height. The clamp prevents either a mush or a zoom.
                targetGamma = System.Math.Clamp(
                    0.12 + 0.55 * (mach - 0.90), 0.015, 0.24);
            } else if (timeToMach22Seconds is null) {
                // Neutral 1 G holds the established path. Correct the climb flight path to level,
                // then leave it alone through the wave-drag rise; chasing a few metres of altitude
                // with the keyboard's 12 G / -1 G endpoints would manufacture induced drag.
                targetGamma = 0.0;
            } else {
                // Once established on ram power, hold about M2.2 while spending the renewed excess
                // power on the climb to the 70,000 ft cruise level.
                targetGamma = System.Math.Clamp(
                    0.075 + 0.45 * (mach - 2.20), 0.01, 0.16);
            }

            double gammaError = targetGamma - session.Player.State.Gamma;
            bool levelAcceleration = timeToMach22Seconds is null
                && altitudeM >= ClimbTopM - 40.0;
            double gammaDeadband = levelAcceleration ? 0.0035 : 0.006;
            // Pull and push are endpoint commands, not an analogue autopilot seam. A one-tick pulse
            // every 0.1 s changes the flight path without holding 12 G long enough to dominate the
            // propulsion measurement with induced drag. The one exception is the initial level
            // capture: a sustained push above 1.5 degrees promptly removes the climb instead of
            // spending tens of seconds and thousands of feet easing onto the acceleration line.
            bool coarseLevelCapture = levelAcceleration
                && session.Player.State.Gamma > 0.026;
            bool correctionTick = coarseLevelCapture
                || tick % (AircraftSim.TickHz / 10) == 0;
            bool pull = correctionTick && !session.Catapult.IsActive
                && gammaError > gammaDeadband;
            bool push = correctionTick && !session.Catapult.IsActive
                && gammaError < -gammaDeadband;
            if (pull != pullHeld) {
                session.FeedKey(GKey.PullUp, pull);
                pullHeld = pull;
            }
            if (push != pushHeld) {
                session.FeedKey(GKey.PushDown, push);
                pushHeld = push;
            }
            session.StepFixed();
        }
        if (pullHeld) session.FeedKey(GKey.PullUp, false);
        if (pushHeld) session.FeedKey(GKey.PushDown, false);

        double finalAltitudeFt = session.Player.State.Position.Y / 0.3048;
        double finalMach = session.Player.AirspeedMps
            / StandardAtmosphere1976.Instance.Sample(
                session.Player.State.Position.Y).SpeedOfSoundMps;
        double fuelUsedToMach22Lb = timeToMach22Seconds is null
            ? double.NaN : initialFuelLb - fuelAtMach22Lb!.Value;
        double accelerationSeconds = timeToMach22Seconds is null
            || climbTopTimeSeconds is null
            ? double.NaN : timeToMach22Seconds.Value - climbTopTimeSeconds.Value;
        double accelerationFuelLb = timeToMach22Seconds is null
            || fuelAtClimbTopLb is null
            ? double.NaN : fuelAtClimbTopLb.Value - fuelAtMach22Lb!.Value;
        _out.WriteLine($"real-kernel catapult profile: max M{maxMach:F3}; "
            + (climbTopTimeSeconds is { } climbTime
                ? $"FL560 at {climbTime:F1} s; "
                : "FL560 NOT REACHED; ")
            + (timeToMach22Seconds is { } time
                ? $"M2.2 at {time:F1} s using {fuelUsedToMach22Lb:F1} lb "
                    + $"({fuelUsedToMach22Lb * 0.45359237:F1} kg) total; "
                    + $"level acceleration {accelerationSeconds:F1} s / "
                    + $"{accelerationFuelLb:F1} lb "
                    + $"({accelerationFuelLb * 0.45359237:F1} kg), "
                    + $"FL{accelerationMinimumAltitudeM / 30.48:F0}"
                    + $"..{accelerationMaximumAltitudeM / 30.48:F0}; "
                : "M2.2 NOT REACHED; ")
            + $"final M{finalMach:F3} at FL{finalAltitudeFt / 100.0:F0}; "
            + $"{session.PlayerFuel.FuelLb:F1} lb remains; "
            + $"lever {session.Controls.Throttle:F2}, "
            + $"thrust {session.Player.LastEngineOperatingPoint.NetThrustN / 1000.0:F1} kN, "
            + $"Nz {session.Player.LastNz:F2}");

        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
        Assert.True(timeToMach22Seconds.HasValue,
            $"only reached M{maxMach:F3} from the catapult in {session.TimeSeconds:F1} s");
        Assert.True(fuelAtMach22Lb > 0.0,
            $"the full {initialFuelLb:F0} lb load was exhausted before M2.2");
        // The uprated translating inlet begins opening below the conservative FL560 mission
        // shelf. A manually firewalled energy climb may therefore cross M2.2 from roughly FL310;
        // the scripted director separately holds M0.9 to FL560 before commanding the dash.
        Assert.InRange(altitudeAtMach22M!.Value, 9_500.0, ClimbTopM + 500.0);
        Assert.True(session.Player.State.Position.Y >= CruiseAltitudeM,
            $"ram climb ended at only {finalAltitudeFt:F0} ft");
        Assert.True(finalMach >= 2.15,
            $"arrived at FL700 too slow for ram cruise: M{finalMach:F3}");
    }

    [Fact]
    public void Mach16AccelerationIsAltitudeGatedInTheRealSession() {
        const double TestMassKg = 6_800.0;
        const double InitialMach = 1.6;
        const int MeasureSeconds = 45;

        static SimulationSession LevelAt(double altitudeFt) {
            const double FuelFreeMassKg = 5_150.0;
            double altitudeM = altitudeFt * 0.3048;
            double fuelLb = (TestMassKg - FuelFreeMassKg) / 0.45359237;
            AtmosphericState air = StandardAtmosphere1976.Instance.Sample(altitudeM);
            BeatSetup source = Beats.RapierIntercept();
            BeatSetup levelCard = source with {
                Player = new AircraftState(
                    new Vec3D(0.0, altitudeM, 0.0),
                    InitialMach * air.SpeedOfSoundMps,
                    Gamma: 0.0, Chi: 0.0, Bank: 0.0, Mass: TestMassKg),
                Bandit = source.Bandit with {
                    Position = new Vec3D(500_000.0, altitudeM, 500_000.0)
                },
                Carrier = null,
                StartsOnCatapult = false,
                UsesReactiveBandit = false,
                Combat = CombatConfig.CarrierRecoveryOnly,
                ScriptedIntercept = null,
                Fuel = source.FuelLoadout with {
                    CapacityLb = fuelLb,
                    InitialFuelLb = fuelLb
                },
                InitialThrottle = Jet.MaxThrustFraction
            };
            var session = new SimulationSession();
            session.StartBeat(() => levelCard);
            session.DecisionCaptureEnabled = false;
            session.Begin();
            return session;
        }

        static double Mach(SimulationSession session) =>
            session.Player.AirspeedMps
            / StandardAtmosphere1976.Instance.Sample(
                session.Player.State.Position.Y).SpeedOfSoundMps;

        var low = LevelAt(31_500.0);
        var high = LevelAt(56_000.0);
        for (int tick = 0; tick < MeasureSeconds * AircraftSim.TickHz; tick++) {
            low.StepFixed();
            high.StepFixed();
        }
        double lowMach = Mach(low);
        double highMach = Mach(high);
        _out.WriteLine($"real-kernel {MeasureSeconds} s level acceleration from M1.6 "
            + $"at {TestMassKg:F0} kg: FL315 -> M{lowMach:F3}, "
            + $"FL560 -> M{highMach:F3}");

        Assert.True(lowMach < 2.7,
            $"FL315 transonic turbine pull became an unrestricted low-level dash: M{lowMach:F3}");
        Assert.True(highMach >= 2.6,
            $"FL560 failed to enter the supersonic acceleration corridor: M{highMach:F3}");
        // Half a Mach, not a whole one. With the engine sized for a realistic M3-class ceiling
        // rather than Mach 4 the altitude gate is narrower in absolute terms while gating exactly
        // as hard in kind: the aircraft still cannot have the high-altitude corridor down low.
        Assert.True(highMach > lowMach + 0.4,
            $"the inlet altitude schedule is not operationally meaningful: "
                + $"FL315 M{lowMach:F3}, FL560 M{highMach:F3}");
    }

    [Fact]
    public void FixedStripNeverInheritsShipMotionBurbleOrSolidGeometry() {
        BeatSetup beat = Beats.RapierIntercept(Carrier.DeckConfiguration.Angled);
        Carrier strip = Assert.IsType<Carrier>(beat.Carrier);

        Assert.Equal(Carrier.PlatformKind.FixedArrestingStrip, strip.Kind);
        Assert.Equal(Carrier.DeckConfiguration.Axial, strip.Configuration);
        Assert.False(strip.IsMaritime);
        Assert.Equal(Vec3D.Zero, strip.SteadyWindWorld);

        strip.ApplyDifficulty(DifficultyModel.ForLevel(4));
        for (int tick = 0; tick < AircraftSim.TickHz * 30; tick++)
            strip.Step(1.0 / AircraftSim.TickHz);
        Assert.Equal(120.5, strip.Position.Y, precision: 10);
        Assert.Equal(0.0, strip.DeckPitchRad, precision: 10);
        Assert.Equal(0.0, strip.DeckHeaveM, precision: 10);
        Assert.Equal(0.0, strip.DeckVerticalVelocityMps, precision: 10);

        Vec3D aboveFormerIsland = strip.ShipPoint(25.0, 10.0, 20.0);
        Vec3D belowFormerIsland = strip.ShipPoint(25.0, 10.0, 3.0);
        Assert.Equal(Carrier.SolidCollision.None,
            strip.SweptSolidCollision(aboveFormerIsland, belowFormerIsland));
        Vec3D belowFormerHull = strip.ShipPoint(0.0, 0.0, -20.0);
        Vec3D fartherBelowFormerHull = strip.ShipPoint(0.0, 0.0, -30.0);
        Assert.Equal(Carrier.SolidCollision.None,
            strip.SweptSolidCollision(belowFormerHull, fartherBelowFormerHull));

        var session = new SimulationSession(10);
        Assert.Null(session.Burble);
        Assert.Equal(0, session.Difficulty.Level);
    }

    [Fact]
    public void OffStripTerrainRemainsAuthoritativeDuringTerminalResolution() {
        BeatSetup baseline = Beats.RapierIntercept();
        Carrier strip = Assert.IsType<Carrier>(baseline.Carrier);
        ScriptedInterceptConfig scriptedIntercept =
            Assert.IsType<ScriptedInterceptConfig>(baseline.ScriptedIntercept);
        AircraftState player = new(
            strip.LandingPoint(along: 0.0, cross: strip.DeckHalfWidthM + 75.0,
                height: 118.01 - strip.Position.Y),
            Speed: 0.0, Gamma: 0.0, Chi: strip.LandingHeadingRad,
            Bank: 0.0, Mass: Jet.MassKg);
        AircraftState opponent = baseline.Bandit with {
            Position = new Vec3D(1_000.0, 116.0, 1_000.0),
            Speed = 0.0,
            Gamma = 0.0
        };
        BeatSetup setup = baseline with {
            Player = player,
            Bandit = opponent,
            StartsOnCatapult = false,
            UsesReactiveBandit = false,
            // This regression isolates terminal terrain resolution. The authored Rapier mission
            // now launches a four-ship; without narrowing the fixture, a surviving wingman is
            // correctly promoted and the session remains in its combat phase.
            ScriptedIntercept = scriptedIntercept with { FormationSize = 1 }
        };
        var session = new SimulationSession();
        session.SetTerrainSurface(FlatLand(117.0));
        session.StartBeat(() => setup);
        session.Begin();

        // The opponent impacts first, putting subsequent ownship integration through
        // StepTerminalPhase — the path which used to omit natural terrain for carrier sorties.
        session.StepFixed();
        Assert.True(session.OpponentTerminalState != AircraftTerminalState.Flying,
            $"opponent remained flying at {session.Bandit.State.Position}");
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);

        session.SetTerrainSurface(FlatLand(118.0));
        for (int tick = 0; tick < AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying; tick++)
            session.StepFixed();

        Assert.Equal(AircraftTerminalState.Impacted, session.PlayerTerminalState);
        Assert.Equal(ImpactSurface.Ground, session.PlayerImpactSurface);
        Assert.Single(session.RecentEvents, e => e.Type == SessionEventType.Impact
            && e.Target == CombatRole.Player && e.Surface == ImpactSurface.Ground);
        Assert.DoesNotContain(session.RecentEvents, e => e.Type == SessionEventType.Impact
            && e.Target == CombatRole.Player && e.Surface is ImpactSurface.Water
                or ImpactSurface.FlightDeck);
    }

    [Fact]
    public void FixedStripDeckContactStillUsesRecoveryInsteadOfTerrainImpact() {
        BeatSetup baseline = Beats.RapierIntercept();
        Carrier strip = Assert.IsType<Carrier>(baseline.Carrier);
        AircraftState player = new(
            strip.LandingPoint(
                strip.WireAlongM(3) + Carrier.HookToMainGearM,
                height: 0.02),
            Speed: 70.0, Gamma: -0.06, Chi: strip.LandingHeadingRad,
            Bank: 0.0, Mass: Jet.MassKg);
        BeatSetup setup = baseline with {
            Player = player,
            StartsOnCatapult = false,
            UsesReactiveBandit = false
        };
        var session = new SimulationSession();
        session.SetTerrainSurface(FlatLand(118.0));
        session.StartBeat(() => setup);
        session.Begin();

        session.StepFixed();

        Assert.Equal(Carrier.Recovery.Trap, session.Touchdown.Recovery);
        Assert.True(session.Arrestment.IsActive);
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
        Assert.Equal(ImpactSurface.None, session.PlayerImpactSurface);
        Assert.DoesNotContain(session.RecentEvents, e => e.Type == SessionEventType.Impact
            && e.Target == CombatRole.Player);
    }

    [Fact]
    public void RapierMissionUsesTheSharedUkraineTheatreIdentity() {
        BeatSetup beat = Beats.RapierIntercept();

        Assert.Equal(Ukraine2030sTheatre.TheatreId,
            beat.EnvironmentIdentity.TheatreId);
        Assert.Equal(Ukraine2030sTheatre.WorldFrameId,
            beat.EnvironmentIdentity.WorldFrameId);
        Assert.Equal(Ukraine2030sTheatre.TerrainProfileId,
            beat.EnvironmentIdentity.TerrainProfileId);
        Assert.Equal(MissionEnvironmentFrameKind.LocalRegionalCorridor,
            beat.EnvironmentIdentity.FrameKind);
        Assert.Equal("presentation.vehicle.rapier.public-data-surrogate.v1",
            beat.PlayerAircraft.PresentationId);
    }
}
