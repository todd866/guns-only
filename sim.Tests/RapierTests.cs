using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Web;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// The shape-known Rapier v2 turbo-ramjet interceptor, measured against both its canonical
/// engineering artifact and the real integrator. Shape, mass, inlet, dash and thermal acceptance
/// are one contract; the runtime must not quietly become a second aircraft.
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
    public void InterceptStartsInsideTheAuthoredRegionAtAUsefulMissionRange() {
        BeatSetup beat = Beats.RapierIntercept();
        Vec3D separation = beat.Bandit.Position - beat.Player.Position;
        double horizontalRangeM = Math.Sqrt(
            separation.X * separation.X + separation.Z * separation.Z);

        // Walked in from 680 km, then 320 km, then 170 km. The 320 km card put the contact
        // 173 NM away for the first six minutes of the flight, which is a commute, not a mission.
        Assert.Equal(-360_000.0, beat.Bandit.Position.X);
        Assert.InRange(horizontalRangeM, 360_000.0, 362_000.0);
        ITerrainSurface terrain = Assert.IsAssignableFrom<ITerrainSurface>(
            UkraineTerrainTruth.Load());
        Assert.True(terrain.TrySample(
            beat.Bandit.Position.X,
            beat.Bandit.Position.Z,
            out _),
            "the opening intercept must stay inside the authored regional truth");
    }

    [Fact]
    public void OverrideReleasesIncidenceWithoutExceedingTheSixPointFiveGStructure() {
        var state = new AircraftState(
            new Vec3D(0.0, 3_000.0, 0.0),
            Speed: 400.0, Gamma: 0.0, Chi: 0.0, Bank: 0.0, Mass: Jet.MassKg);

        Assert.Equal(6.5, Jet.PositiveStructuralLimitG);
        Assert.Equal(Jet.PositiveStructuralLimitG, Jet.PositiveOverrideLimitG);
        Assert.Equal(6.5, Protection.OverrideMaxG(state, Jet), precision: 6);
        Assert.True(Jet.DynamicPressureScheduledPostStallOverride);
    }

    [Fact]
    public void TheTurbineCarriesItLowAndTheRamCarriesItHigh() {
        _out.WriteLine("thrust fraction of sea-level static dry, by Mach and altitude:");
        _out.WriteLine("  (turbine fades 1.9->3.0, ram fades in 1.6->2.8; they OVERLAP on purpose)");
        foreach (double altitudeM in new[] { 0.0, 11_000.0, RapierV2Design.DesignAltitudeM }) {
            AtmosphericState air = StandardAtmosphere1976.Instance.Sample(altitudeM);
            var row = new System.Text.StringBuilder($"  {altitudeM,7:F0} m:");
            foreach (double mach in new[] { 0.4, 0.9, 1.4, 1.8, 2.2, 2.8, 3.5, 4.2 }) {
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

        // The ram stream must close the canonical M4.2 / 24 km design point.
        AtmosphericState cruise = StandardAtmosphere1976.Instance.Sample(
            RapierV2Design.DesignAltitudeM);
        var cruisePoint = Propulsion.TurboRamjetPerformanceMap.Evaluate(
            Jet.MaxThrustFraction,
            Jet.ThrustMaxN,
            RapierV2Design.DesignMach,
            cruise.TemperatureK,
            cruise.DensityKgM3,
            Jet.GenericIdleFuelFlowLbPerMinute,
            Jet.GenericMilitaryFuelFlowLbPerMinute,
            Jet.GenericAfterburnerFuelFlowLbPerMinute,
            Jet.MaxThrustFraction);
        double cruiseThrustN = cruisePoint.NetThrustN;
        Assert.Equal(RapierV2Design.DesignPointRawRamThrustN, cruiseThrustN, precision: 1);
        Assert.True(cruiseThrustN > RapierV2Design.DesignPointDragN,
            $"M4.2 ram mode has no excess thrust: {cruiseThrustN:F0} N");
        Assert.Equal(0.0, cruisePoint.TurbineFuelFlowLbPerMinute, precision: 6);
        Assert.True(cruisePoint.RamjetFuelFlowLbPerMinute > 0.0);

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
            commandedFraction: Jet.MaxThrustFraction,
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
    public void DesignGrossIsShapeDerivedFuelWithNoStowedGunDrones() {
        Assert.Equal(0, FlightModel.RapierDesignGunDroneCount);
        Assert.Equal(0.0, FlightModel.RapierDesignStowedGunDroneMassKg, precision: 9);
        Assert.Equal(RapierV2Design.EmptyMassKg, Jet.FuelFreeMassKg, precision: 6);
        Assert.Equal(
            Jet.FuelFreeMassKg + RapierV2Design.FuelCapacityKg,
            Jet.MassKg,
            precision: 6);
        Assert.Equal(RapierV2Design.GrossMassKg, Jet.MassKg, precision: 6);
        double augTw = Jet.ThrustMaxN * Jet.MaxThrustFraction / (Jet.MassKg * 9.80665);
        Assert.True(augTw <= 1.20 + 1e-9, $"augmented T/W {augTw:F3} exceeds family 1.20");
    }

    [Fact]
    public void TurbineCoreProducesUsefulLowAltitudeAcceleration() {
        // This is the turbine-core part of the envelope, before the ram duct contributes. V2 has
        // no hidden 1.55x augmentor, so protect a useful positive acceleration without conflating
        // it with the separate high-altitude dash requirement.
        var sim = At(3_000.0, 180.0);
        var command = new PilotCommand(1.0, 0.0, Jet.MaxThrustFraction, 0.0);
        sim.SeedEnginePowerFraction(Jet.MaxThrustFraction);
        const double Dt = 1.0 / AircraftSim.TickHz;
        double startSpeed = sim.State.Speed;
        for (int tick = 0; tick < AircraftSim.TickHz * 30; tick++) sim.Step(command, Dt);
        double gained = sim.State.Speed - startSpeed;
        _out.WriteLine($"30 s level accel at 3,000 m: {startSpeed:F0} -> {sim.State.Speed:F0} m/s "
            + $"(+{gained:F0} m/s, mean {gained / 30.0:F2} m/s^2)");
        Assert.True(gained > 55.0,
            $"only gained {gained:F0} m/s in 30 s on the turbine core");
    }

    [Fact]
    public void MachFourPointTwoAtTwentyFourKilometresHasRealExcessThrust() {
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(
            RapierV2Design.DesignAltitudeM);
        double mach = RapierV2Design.DesignMach;
        double speedMps = mach * air.SpeedOfSoundMps;
        double qPa = 0.5 * air.DensityKgM3 * speedMps * speedMps;
        var engine = Propulsion.TurboRamjetPerformanceMap.Evaluate(
            Jet.MaxThrustFraction,
            Jet.ThrustMaxN,
            mach,
            air.TemperatureK,
            air.DensityKgM3,
            Jet.GenericIdleFuelFlowLbPerMinute,
            Jet.GenericMilitaryFuelFlowLbPerMinute,
            Jet.GenericAfterburnerFuelFlowLbPerMinute,
            Jet.MaxThrustFraction);
        double rawThrustN = engine.NetThrustN;
        double trimCl = Jet.MassKg * FlightModel.G0 / (qPa * Jet.WingAreaM2);
        double trimAlpha = trimCl / FlightModel.EffectiveClAlpha(Jet, mach);
        double thrustN = rawThrustN
            * RapierAerodynamics.InletFlowRecovery(mach, trimAlpha, betaRad: 0.0);
        double dragN = qPa * Jet.WingAreaM2
            * FlightModel.ProfileDragCoefficient(trimAlpha, mach, Jet);

        _out.WriteLine($"M{mach:F1} / {RapierV2Design.DesignAltitudeM:F0} m: "
            + $"q={qPa / 1000.0:F1} kPa, thrust={thrustN / 1000.0:F1} kN, "
            + $"trim drag={dragN / 1000.0:F1} kN");
        Assert.Equal(RapierV2Design.DesignPointDynamicPressurePa, qPa, precision: 3);
        Assert.Equal(RapierV2Design.DesignPointNetThrustN, thrustN, precision: 1);
        Assert.InRange(dragN,
            RapierV2Design.DesignPointDragN * 0.995,
            RapierV2Design.DesignPointDragN * 1.005);
        Assert.True(thrustN > dragN);
        Assert.True(mach >= 4.0);
        Assert.True(qPa < RapierV2Design.MaximumDynamicPressurePa);
    }

    [Fact]
    public void ThermalClockBindsAtTheInsulatedPanelNotTheCmcHotEdge() {
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(
            RapierV2Design.DesignAltitudeM);
        double recoveryK = AirData.AdiabaticWallTemperatureK(
            RapierV2Design.DesignMach, air.TemperatureK);
        double panelK = AirData.EffectiveAerothermalZoneTemperatureK(
            air.TemperatureK, recoveryK, RapierV2Design.BindingThermalRiseFraction);
        double panelLimitMach = AirData.MachLimitForEffectiveZoneTemperature(
            RapierV2Design.BindingThermalLimitK,
            air.TemperatureK,
            RapierV2Design.BindingThermalReference,
            RapierV2Design.BindingThermalRiseFraction);

        Assert.Equal(623.15, Jet.SkinTemperatureLimitK, precision: 6);
        Assert.Equal(1_473.15, RapierV2Design.CmcHotEdgeLimitK, precision: 6);
        Assert.Equal(RapierV2Design.DesignPointThermalMarginK,
            Jet.SkinTemperatureLimitK - panelK, precision: 3);
        Assert.InRange(panelLimitMach, 4.30, 4.31);
        Assert.True(RapierV2Design.CmcHotEdgeLimitK > Jet.SkinTemperatureLimitK + 800.0);
    }

    [Fact]
    public void OnePassInstantaneousGStillExceedsSustainedG() {
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

        Assert.True(bestInstantaneous > 5.0,
            $"instantaneous peak was only {bestInstantaneous:F1} G");
        Assert.True(sustained < bestInstantaneous * 0.75,
            $"sustained {sustained:F1} G is too close to instantaneous {bestInstantaneous:F2} G "
            + "— the one-pass character has been lost");
    }

    /// The mission the pilot actually asked for: "something I can catshot, climb, cruise, descend
    /// and trap". This flies the first two phases through the real session, because a beat that
    /// compiles is not a beat that launches.
    [Fact]
    public void TheMissionLaunchesOffTheCatapultAndClimbsAway() {
        var session = new SimulationSession(12);
        Assert.Equal("Rapier — high-altitude balloon intercept", session.Beat.Name);
        Assert.Same(FlightModel.RapierPublicDataSurrogate, session.Beat.PlayerAir);
        Assert.Equal(Carrier.PlatformKind.FixedArrestingStrip, session.Carrier!.Kind);
        Assert.False(session.Carrier.IsMaritime);
        // 10,000 ft. The strip was 1,200 m purely because it reused the ship deck's geometry;
        // a dispersed strip for a Mach 4 interceptor is a runway and needs a braking run in
        // front of the midfield wire.
        Assert.Equal(RapierV2Design.RunwayLengthM,
            session.Carrier.DeckLengthM, precision: 6);
        Assert.Equal(session.Carrier.DeckLengthM / 2.0,
            RapierV2Design.ArrestorStationM, precision: 6);
        Assert.Equal(48.0, session.Carrier.DeckHalfWidthM * 2.0, precision: 6);
        Assert.Equal(RapierLaunchSite.OperatingSurfaceElevationM,
            session.Carrier.Position.Y, precision: 6);
        Assert.Equal(Vec3D.Zero, session.Carrier.SteadyWindWorld);

        // The declared land launcher, not the 62 m/s ship-deck default. The v2 mass and wing are
        // shape-derived, while the 520 m rail provides the fixed launch requirement.
        Assert.Equal(120.0, session.Catapult.EndSpeedMps, precision: 6);
        Assert.Equal(520.0, session.Catapult.StrokeM, precision: 6);
        // And it points UP. A flat shot at roughly 486 kg/m2 leaves the aircraft settling off the
        // end with little climb margin; the ramp turns the stroke into a climb.
        Assert.True(session.Catapult.RampAngleRad > 0.05,
            "the land launcher must be ramped, not flat");

        _out.WriteLine($"staged lever {session.Controls.Throttle:F2} "
            + $"(beat asks {session.Beat.InitialThrottle:F2}, "
            + $"lever stop {session.Beat.PlayerAir.MaxThrustFraction:F2})");
        session.Begin();
        _out.WriteLine($"after Begin(): lever {session.Controls.Throttle:F2}");
        Assert.True(session.Catapult.IsActive, "the sortie must begin ON the catapult");

        // Clearance/readback holds the aircraft at the mouth of the tube. That transaction is
        // deliberately outside the physical stroke budget below.
        int clearanceTicks = 0;
        while (session.Catapult.Phase == CatapultLaunchModel.LaunchPhase.Hold
            && clearanceTicks++ < AircraftSim.TickHz * 10)
            session.StepFixed();
        Assert.Equal(CatapultLaunchModel.LaunchPhase.Stroke, session.Catapult.Phase);

        // Track the fastest the aircraft gets during and just after the stroke. Sampling only the
        // single tick the phase flips is fragile — the handoff state lands a tick later.
        // A 520 m stroke to 120 m/s takes about 8.7 s at 1.41 G — far longer and gentler than
        // a deck shot, which is the point. Measure past the end of it.
        double launchSpeed = 0.0;
        for (int tick = 0; tick < AircraftSim.TickHz * 12; tick++) {
            session.StepFixed();
            launchSpeed = System.Math.Max(launchSpeed, session.Player.State.Speed);
        }
        _out.WriteLine($"peak speed over the stroke: {launchSpeed:F0} m/s "
            + $"({launchSpeed / 0.514444:F0} kt), climbing through "
            + $"{session.Player.State.Position.Y:F0} m");

        Assert.True(launchSpeed > 115.0,
            $"never exceeded {launchSpeed:F0} m/s — the declared 120 m/s launcher did not deliver");

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

    [Fact]
    public void Mach22AccelerationIsAltitudeGatedInTheRealSession() {
        const double TestMassKg = 8_880.0;
        // Start inside the turbine/ram overlap so this measures the translating inlet's altitude
        // schedule rather than the preceding transonic acceleration problem.
        const double InitialMach = 2.2;
        const int MeasureSeconds = 45;

        static SimulationSession LevelAt(double altitudeFt) {
            double altitudeM = altitudeFt * 0.3048;
            double fuelLb = (TestMassKg - RapierV2Design.EmptyMassKg) / 0.45359237;
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
                    InitialFuelLb = fuelLb,
                    // This is an acceleration card, not a reserve-management card. The canonical
                    // package reduced fuel volume enough that the inherited 2,000 lb joker can
                    // exceed this deliberately light test load.
                    BingoThresholdLb = 0.0,
                    JokerThresholdLb = null,
                    MinimumFuelThresholdLb = null,
                    EmergencyFuelThresholdLb = null
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
        _out.WriteLine($"real-kernel {MeasureSeconds} s level acceleration from M{InitialMach:F1} "
            + $"at {TestMassKg:F0} kg: FL315 -> M{lowMach:F3}, "
            + $"FL560 -> M{highMach:F3}");

        // Assert the USABLE corridor, not raw thermodynamics. This used to bound lowMach directly,
        // which measured what the engine could do rather than what the aircraft may do: this test
        // drives the kernel with no envelope protection, so its raw low-altitude Mach is not
        // necessarily legal. That number is real but it is not available to a
        // pilot, so bounding it was bounding the wrong quantity, and it moved every time the
        // engine changed.
        //
        // Maximum q is what actually gates the low-level dash, and it bites far harder low down.
        // Clip both runs to the canonical 55 kPa envelope and assert the gate on what is left.
        AtmosphericState lowAir = StandardAtmosphere1976.Instance.Sample(31_500.0 * 0.3048);
        AtmosphericState highAir = StandardAtmosphere1976.Instance.Sample(56_000.0 * 0.3048);
        double lowVmoMach = RapierAerodynamics.MachLimitForDynamicPressure(
            lowAir.DensityKgM3, lowAir.SpeedOfSoundMps);
        double highVmoMach = RapierAerodynamics.MachLimitForDynamicPressure(
            highAir.DensityKgM3, highAir.SpeedOfSoundMps);
        double usableLow = Math.Min(lowMach, lowVmoMach);
        double usableHigh = Math.Min(highMach, highVmoMach);
        _out.WriteLine($"usable corridor: FL315 M{usableLow:F2} (Vmo M{lowVmoMach:F2}), "
            + $"FL560 M{usableHigh:F2} (Vmo M{highVmoMach:F2})");

        Assert.True(usableLow < 2.0,
            $"FL315 became an unrestricted low-level dash inside the envelope: M{usableLow:F3}");
        Assert.True(highMach >= 2.45,
            $"FL560 failed to enter the supersonic acceleration corridor: M{highMach:F3}");
        Assert.True(usableHigh > usableLow + 0.8,
            $"the usable altitude corridor collapsed: FL315 M{usableLow:F2} vs FL560 M{usableHigh:F2}");
        // Raw acceleration must also retain an altitude benefit; the fixed inlet cannot make the
        // high-altitude Mach-four corridor available down low.
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
        Assert.Equal(RapierLaunchSite.OperatingSurfaceElevationM,
            strip.Position.Y, precision: 10);
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
    public void ReadyBeginAndRestartShareOneSupportedLauncherPose() {
        var session = new SimulationSession(10);
        session.SetTerrainSurface(Assert.IsAssignableFrom<ITerrainSurface>(
            UkraineTerrainTruth.Load()));
        Carrier strip = Assert.IsType<Carrier>(session.Carrier);
        AircraftState ready = session.Player.State;

        var readyFrame = strip.DeckFrame(ready.Position);
        Assert.Equal(CatapultLaunchModel.StartAlongM, readyFrame.along, precision: 8);
        Assert.Equal(-70.0, readyFrame.cross, precision: 8);
        Assert.True(session.Catapult.TryLaunchSupportSurfaceHeight(
            strip,
            ready.Position,
            RapierLaunchSite.AircraftHalfSpanM + 0.5,
            out double railHeightM));
        Assert.Equal(RapierLaunchSite.AircraftSupportReferenceHeightM,
            ready.Position.Y - railHeightM, precision: 8);
        Assert.True(session.LaunchTerrainClearance.Safe,
            session.LaunchTerrainClearance.Reason);

        session.Begin();
        Assert.Equal(ready, session.Player.State);
        Assert.Equal(ready, session.Catapult.State);
        Assert.True(session.Catapult.IsActive);

        for (int tick = 0; tick < 20; tick++) session.StepFixed();
        session.Restart();
        Assert.Equal(SimulationSession.LifecycleState.Ready, session.Lifecycle);
        Assert.Equal(ready, session.Player.State);
        Assert.False(session.Catapult.IsActive);
        Assert.True(session.LaunchTerrainClearance.Safe);
    }

    [Fact]
    public void FixedLauncherUsesTheVisualShotCrewHandoffBeforeTheStroke() {
        var session = new SimulationSession(10);
        session.SetTerrainSurface(Assert.IsAssignableFrom<ITerrainSurface>(
            UkraineTerrainTruth.Load()));
        AircraftState staged = session.Player.State;

        session.Begin();

        // Ready stages the jet parked on the launcher instead of mid-stroke, so the first
        // rendered frame is not a teleport off the rail.
        Assert.Equal(CatapultLaunchModel.LaunchPhase.Hold, session.Catapult.Phase);
        Assert.Equal(staged.Position, session.Player.State.Position);

        // Ambient R/T is not a gameplay interlock. Catalog v8 carries no launch clearance or
        // readback line at all, and the launcher still goes on the first active tick: missing,
        // muted, delayed or expired speech cannot hold the jet on the rail. The shot crew owns
        // the handoff visually, so the release tick must not move the aircraft either.
        session.StepFixed();

        Assert.Equal(CatapultLaunchModel.LaunchPhase.Stroke, session.Catapult.Phase);
        Assert.Equal(staged.Position, session.Player.State.Position);
        Assert.False(session.MissionRadio.Active);
    }

    [Fact]
    public void FixedLauncherFailsClosedAgainstAnUnsafeTerrainDatum() {
        var session = new SimulationSession(10);
        session.SetTerrainSurface(FlatLand(250.0));

        Assert.False(session.LaunchTerrainClearance.Safe);
        session.Begin();

        Assert.Equal(SimulationSession.LifecycleState.Ready, session.Lifecycle);
        Assert.False(session.Catapult.IsActive);
        Assert.Contains("LAUNCH INHIBIT", session.TransitionCue);
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
            // This regression isolates terminal terrain resolution. Narrow the legacy fixture to
            // one contact so formation promotion cannot keep the session in its combat phase.
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
                height: strip.AircraftSupportReferenceHeightM + 0.02),
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
