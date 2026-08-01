using GunsOnly.Sim;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Integration pins for Rapier aerodynamic coupling into the flight model, systems, and TBCC
/// installed-inlet path. Expectations that rest on provisional/surrogate schedules are labelled as
/// such — these are contract tests, not wind-tunnel cards.
/// </summary>
public sealed class RapierAerodynamicsIntegrationTests {
    const double Dt = 1.0 / AircraftSim.TickHz;
    const double Fl720M = 21_945.6;

    static AircraftParams Rapier => FlightModel.RapierPublicDataSurrogate;
    static AircraftParams F22 => FlightModel.F22APublicDataSurrogate;

    static AircraftState LevelAt(double altitudeM, double speedMps, double massKg,
        QuaternionD? attitude = null) =>
        new(new Vec3D(0.0, altitudeM, 0.0), speedMps, 0.0, 0.0, 0.0, massKg,
            attitude ?? default, default);

    static QuaternionD AttitudeForAlphaBeta(double alphaRad, double betaRad = 0.0) {
        var bodyRight = new Vec3D(Math.Cos(betaRad), 0.0, Math.Sin(betaRad));
        var bodyUp = new Vec3D(Math.Sin(alphaRad) * Math.Sin(betaRad), Math.Cos(alphaRad),
            -Math.Sin(alphaRad) * Math.Cos(betaRad));
        var bodyForward = bodyRight.Cross(bodyUp).Normalized();
        return QuaternionD.FromFrame(bodyRight, bodyUp, bodyForward);
    }

    static AirframeAerodynamicState FullRapierLandingDroop() {
        var systems = new AirframeSystems(AirframeSystemsProfile.RapierSurrogate);
        systems.SetFlapLever(WingFlapLever.Down);
        var input = new AirframeSystemsInput(80.0, 140.0, false,
            LandingConfigurationExpected: true);
        for (int i = 0; i < 600; i++)
            systems.Step(Dt, input);
        return systems.AerodynamicState;
    }

    [Fact]
    public void OrdinaryRapierNormalLawAtMach35UsesScheduledAlphaClLimitBelowPhysicalBreak() {
        // Provisional high-speed normal-law schedule — not physical CLmax / stall incidence.
        // Pass 2: mass/q floor may raise ordinary α above the Mach schedule so ~1 g is holdable.
        AircraftParams p = Rapier;
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(Fl720M);
        double mach = 3.5;
        double speedMps = air.SpeedOfSoundMps * mach;
        var state = LevelAt(Fl720M, speedMps, p.MassKg);
        double q = 0.5 * air.DensityKgM3 * speedMps * speedMps;

        double scheduledAlpha = RapierAerodynamics.NormalLawAlphaLimitRad(mach);
        double physicalAlpha = FlightModel.AlphaAeroMax(p);
        Assert.Equal(0.13, scheduledAlpha, 6);
        Assert.True(scheduledAlpha < physicalAlpha * 0.45,
            "Mach-3.5 normal-law α must sit well below the physical lift-break incidence");

        double scheduleOnlyCl = FlightModel.EffectiveControllableClMax(
            p, mach, AirframeAerodynamicState.Clean);
        double massAwareCl = FlightModel.EffectiveControllableClMax(
            p, mach, AirframeAerodynamicState.Clean, p.MassKg, q);
        double physicalCl = FlightModel.EffectiveClMax(p, mach);
        Assert.True(scheduleOnlyCl < physicalCl * 0.55,
            $"scheduled CL limit {scheduleOnlyCl:F3} must be materially below physical break {physicalCl:F3}");
        Assert.True(massAwareCl >= scheduleOnlyCl - 1e-9);
        Assert.True(massAwareCl < physicalCl * 0.55,
            $"mass/q-aware CL {massAwareCl:F3} must remain below physical break {physicalCl:F3}");

        var (_, normalLawG, _) = FlightModel.ClampNz(state, new PilotCommand(99.0, 0.0, 0.0, 0.0),
            p, speedMps, AirframeAerodynamicState.Clean);
        double physicalBreakG = FlightModel.NzAeroMax(state, p, speedMps);
        Assert.True(normalLawG >= 1.0,
            $"Pass 2 ordinary law must hold ≥1 g at FL720/M3.5 design mass, got {normalLawG:F2}");
        Assert.True(normalLawG < physicalBreakG * 0.55,
            $"ordinary normal-law G {normalLawG:F2} must be materially less than physical-break G {physicalBreakG:F2}");

        Assert.Equal(RapierV2Design.RollInertiaKgM2, p.IxxKgM2, 6);
        Assert.Equal(RapierV2Design.PitchInertiaKgM2, p.IyyKgM2, 6);
        Assert.Equal(RapierV2Design.YawInertiaKgM2, p.IzzKgM2, 6);

        // Explicit CommandedAlphaRad exposes the physical CL break; ordinary GDemand does not.
        var normalSim = new AircraftSim(
            LevelAt(Fl720M, speedMps, p.MassKg, AttitudeForAlphaBeta(scheduledAlpha)), p);
        normalSim.Step(new PilotCommand(1.0, 0.0, 0.0, 0.0,
            CommandedAlphaRad: scheduledAlpha), Dt);

        var overrideSim = new AircraftSim(
            LevelAt(Fl720M, speedMps, p.MassKg, AttitudeForAlphaBeta(physicalAlpha)), p);
        overrideSim.Step(new PilotCommand(1.0, 0.0, 0.0, 0.0,
            CommandedAlphaRad: physicalAlpha), Dt);

        Assert.True(overrideSim.LastNz > normalSim.LastNz * 1.4,
            $"CommandedAlphaRad at physical break should yield materially more G "
            + $"({overrideSim.LastNz:F2}) than scheduled normal-law α ({normalSim.LastNz:F2})");
        Assert.True(overrideSim.LastNz > normalLawG * 1.2,
            "override incidence must clear the ordinary controllable G ceiling");
    }

    [Fact]
    public void RapierDirectAeroMomentsCollapseWithQWhileColdGasRcsOwnsThinAir() {
        AircraftParams p = Rapier;
        Assert.Equal(0.0, RapierAerodynamics.PitchControlMomentCapacityNm(0.0), 12);
        Assert.Equal(0.0, RapierAerodynamics.YawControlMomentCapacityNm(0.0), 12);
        Assert.Equal(0.0, RapierAerodynamics.RollControlMomentCapacityNm(0.0), 12);

        // Dense air: q-scaled elevon capacities are finite (provisional Cm/Cn/Cl ceilings).
        const double qDense = 20_000.0;
        Assert.True(RapierAerodynamics.PitchControlMomentCapacityNm(qDense, mach: 0.8) > 1e5);
        Assert.True(RapierAerodynamics.YawControlMomentCapacityNm(qDense, mach: 0.8) > 1e5);
        Assert.True(RapierAerodynamics.RollControlMomentCapacityNm(qDense, mach: 0.8) > 1e5);

        // ~200 kft / high TAS: elevon q dies; RCS supplies attitude moment and burns gas.
        const double altM = 60_000.0;
        var state = LevelAt(altM, 800.0, p.MassKg);
        var sim = new AircraftSim(state, p);
        double gas0 = sim.ColdGasRcsGasKg;
        Assert.Equal(p.ColdGasRcsGasCapacityKg, gas0, 6);

        var flown = sim.State;
        var raw = new RawState(flown.Position, flown.VelocityVector(), flown.Bank, flown.Mass,
            flown.BodyAttitude, flown.BodyRates);
        var thinAirCmd = new PilotCommand(1.4, 0.15, 0.0, 0.8,
            DirectLateralControl: true, RollControl: 0.9);
        // Zero gas → pure aero path at this q must produce no RCS moment fill.
        StateDeriv aeroOnly = FlightModel.Derivatives(raw, thinAirCmd, p,
            new Vec3D(0.0, 1.0, 0.0), Vec3D.Zero, netThrustN: 0.0,
            AirframeAerodynamicState.Clean, StandardAtmosphere1976.Instance,
            coldGasRemainingKg: 0.0);
        Assert.Equal(0.0, aeroOnly.RcsMomentMagnitudeNm, 9);

        StateDeriv withRcs = FlightModel.Derivatives(raw, thinAirCmd, p,
            new Vec3D(0.0, 1.0, 0.0), Vec3D.Zero, netThrustN: 0.0,
            AirframeAerodynamicState.Clean, StandardAtmosphere1976.Instance,
            coldGasRemainingKg: gas0);
        Assert.True(withRcs.RcsMomentMagnitudeNm > 1_000.0,
            $"RCS must produce attitude moment in thin air, got {withRcs.RcsMomentMagnitudeNm:F0} N·m");
        Assert.True(Math.Abs(withRcs.DBodyRates.Q) + Math.Abs(withRcs.DBodyRates.R)
                + Math.Abs(withRcs.DBodyRates.P)
            > Math.Abs(aeroOnly.DBodyRates.Q) + Math.Abs(aeroOnly.DBodyRates.R)
                + Math.Abs(aeroOnly.DBodyRates.P),
            "RCS-backed derivatives must exceed dead-elevon rates at the same thin-air state");

        var cmd = new PilotCommand(1.4, 0.15, 0.0, 0.2,
            DirectLateralControl: true, RollControl: 0.1);
        for (int i = 0; i < 24; i++)
            sim.Step(cmd, Dt);

        Assert.True(sim.ColdGasRcsAuthority > 0.5);
        Assert.True(sim.LastRcsMomentMagnitudeNm > 0.0);
        Assert.True(sim.ColdGasRcsGasKg < gas0,
            "thrashing the stick in the RCS regime must consume cold gas");
        Assert.True(sim.DynamicPressurePa < ColdGasRcs.QAeroFullPa);
    }

    [Fact]
    public void SymmetricLandingElevonDroopReducesPitchAndRollControlResponse() {
        // Provisional droop authority fractions from the Rapier systems surrogate.
        AircraftParams p = Rapier;
        AirframeAerodynamicState droop = FullRapierLandingDroop();
        Assert.True(droop.PitchControlAuthorityFraction < 0.75);
        Assert.True(droop.RollControlAuthorityFraction < 0.60);

        const double altitudeM = 1_000.0;
        const double speedMps = 120.0;
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(altitudeM);
        double q = 0.5 * air.DensityKgM3 * speedMps * speedMps;
        double mach = speedMps / air.SpeedOfSoundMps;

        double cleanPitch = RapierAerodynamics.PitchControlMomentCapacityNm(q, mach: mach);
        double droopPitch = RapierAerodynamics.PitchControlMomentCapacityNm(
            q, droop.PitchControlAuthorityFraction, mach);
        double cleanRoll = RapierAerodynamics.RollControlMomentCapacityNm(q, mach: mach);
        double droopRoll = RapierAerodynamics.RollControlMomentCapacityNm(
            q, droop.RollControlAuthorityFraction, mach);
        Assert.True(droopPitch < cleanPitch * 0.75);
        Assert.True(droopRoll < cleanRoll * 0.60);

        var state = LevelAt(altitudeM, speedMps, p.MassKg);
        var simClean = new AircraftSim(state, p) {
            AerodynamicConfiguration = AirframeAerodynamicState.Clean
        };
        var simDroop = new AircraftSim(state, p) {
            AerodynamicConfiguration = droop
        };
        var rollCmd = new PilotCommand(1.0, 0.0, 0.4, 0.0,
            DirectLateralControl: true, RollControl: 1.0);
        simClean.Step(rollCmd, Dt);
        simDroop.Step(rollCmd, Dt);
        Assert.True(Math.Abs(simDroop.LastRollMomentNm) < Math.Abs(simClean.LastRollMomentNm) * 0.75,
            $"landing droop must cut roll moment: clean={simClean.LastRollMomentNm:F0} "
            + $"droop={simDroop.LastRollMomentNm:F0} N·m");

        var pitchCmd = new PilotCommand(1.0, 0.0, 0.4, 0.0,
            CommandedAlphaRad: 0.22);
        var raw = new RawState(state.Position, state.VelocityVector(), 0.0, state.Mass,
            QuaternionD.Identity, default);
        StateDeriv cleanPitchDeriv = FlightModel.Derivatives(raw, pitchCmd, p,
            new Vec3D(0.0, 1.0, 0.0), Vec3D.Zero, netThrustN: 0.0,
            AirframeAerodynamicState.Clean);
        StateDeriv droopPitchDeriv = FlightModel.Derivatives(raw, pitchCmd, p,
            new Vec3D(0.0, 1.0, 0.0), Vec3D.Zero, netThrustN: 0.0, droop);
        Assert.True(Math.Abs(droopPitchDeriv.DBodyRates.Q)
                < Math.Abs(cleanPitchDeriv.DBodyRates.Q) * 0.90,
            $"landing droop must reduce pitch acceleration: clean q̇={cleanPitchDeriv.DBodyRates.Q:F3} "
            + $"droop q̇={droopPitchDeriv.DBodyRates.Q:F3}");
    }

    [Fact]
    public void OffDesignIncidenceCutsTbccThrustAndInletFlowRecoveryAtEqualMach() {
        // InletFlowRecovery is an explicit flow-angle surrogate, not an OEM recovery map.
        AircraftParams p = Rapier;
        Assert.True(FlightModel.UsesRapierAerodynamics(p));
        Assert.Equal(PropulsionModelKind.TurboRamjetPublicDataSurrogate, p.PropulsionModel);

        const double altitudeM = 18_000.0;
        const double mach = 2.6;
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(altitudeM);
        double speedMps = air.SpeedOfSoundMps * mach;
        double throttle = p.MaxThrustFraction;
        double incidence = RapierAerodynamics.InletDesignFlowIncidenceRad;

        var onDesign = new AircraftSim(
            LevelAt(altitudeM, speedMps, p.MassKg,
                AttitudeForAlphaBeta(incidence, 0.0)), p);
        var alphaOff = new AircraftSim(
            LevelAt(altitudeM, speedMps, p.MassKg,
                AttitudeForAlphaBeta(incidence + 0.28, 0.0)), p);
        var betaOff = new AircraftSim(
            LevelAt(altitudeM, speedMps, p.MassKg,
                AttitudeForAlphaBeta(incidence, 0.28)), p);

        var hold = new PilotCommand(1.0, 0.0, throttle, 0.0);
        onDesign.Step(hold, Dt);
        alphaOff.Step(hold, Dt);
        betaOff.Step(hold, Dt);

        Assert.Equal(1.0, onDesign.InletFlowRecovery, 5);
        Assert.True(alphaOff.InletFlowRecovery < onDesign.InletFlowRecovery);
        Assert.True(betaOff.InletFlowRecovery < onDesign.InletFlowRecovery);
        Assert.Equal(alphaOff.InletFlowRecovery, betaOff.InletFlowRecovery, 6);

        Assert.True(alphaOff.LastEngineOperatingPoint.NetThrustN
                < onDesign.LastEngineOperatingPoint.NetThrustN * 0.98,
            $"off-design α must cut installed TBCC thrust: on={onDesign.LastEngineOperatingPoint.NetThrustN:F0} "
            + $"off={alphaOff.LastEngineOperatingPoint.NetThrustN:F0} N");
        Assert.True(betaOff.LastEngineOperatingPoint.NetThrustN
                < onDesign.LastEngineOperatingPoint.NetThrustN * 0.98);
        Assert.Equal(
            alphaOff.LastEngineOperatingPoint.NetThrustN / onDesign.LastEngineOperatingPoint.NetThrustN,
            alphaOff.InletFlowRecovery,
            5);
        Assert.Equal(alphaOff.LastEngineOperatingPoint.NetThrustN,
            alphaOff.LastEngineOperatingPoint.TurbineThrustN
                + alphaOff.LastEngineOperatingPoint.RamjetThrustN,
            6);
        Assert.Equal(alphaOff.InletFlowRecovery,
            alphaOff.LastEngineOperatingPoint.RamjetThrustN
                / onDesign.LastEngineOperatingPoint.RamjetThrustN,
            5);
    }

    [Fact]
    public void InletUnstartCollapsesInstalledThrustUntilFlowAngleClears() {
        AircraftParams p = Rapier;
        const double altitudeM = 18_000.0;
        const double mach = 2.6;
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(altitudeM);
        double speedMps = air.SpeedOfSoundMps * mach;
        double throttle = p.MaxThrustFraction;
        double incidence = RapierAerodynamics.InletDesignFlowIncidenceRad;
        double tripAlpha = incidence + RapierAerodynamics.InletUnstartTripFlowAngleRad + 0.01;

        var onDesign = new AircraftSim(
            LevelAt(altitudeM, speedMps, p.MassKg,
                AttitudeForAlphaBeta(incidence, 0.0)), p);
        var tripped = new AircraftSim(
            LevelAt(altitudeM, speedMps, p.MassKg, AttitudeForAlphaBeta(tripAlpha, 0.0)), p);
        var hold = new PilotCommand(1.0, 0.0, throttle, 0.0);
        onDesign.Step(hold, Dt);
        tripped.Step(hold, Dt);

        Assert.False(onDesign.InletUnstarted);
        Assert.Equal(1.0, onDesign.InletFlowRecovery, 5);
        Assert.True(tripped.InletUnstarted);
        Assert.True(tripped.InletFlowRecovery <= RapierAerodynamics.InletUnstartRecoveryFloor + 1e-6);
        Assert.True(tripped.LastEngineOperatingPoint.NetThrustN
            < onDesign.LastEngineOperatingPoint.NetThrustN
                * RapierAerodynamics.InletUnstartRecoveryFloor + 1.0);
        Assert.Equal(tripped.LastEngineOperatingPoint.NetThrustN,
            tripped.LastEngineOperatingPoint.TurbineThrustN
                + tripped.LastEngineOperatingPoint.RamjetThrustN,
            6);
        Assert.Equal(tripped.InletFlowRecovery,
            tripped.LastEngineOperatingPoint.TurbineThrustN
                / onDesign.LastEngineOperatingPoint.TurbineThrustN,
            5);
        Assert.Equal(tripped.InletFlowRecovery,
            tripped.LastEngineOperatingPoint.RamjetThrustN
                / onDesign.LastEngineOperatingPoint.RamjetThrustN,
            5);

        // Clear path is unit-tested on NextInletUnstartState; prove sticky mid-band holds.
        Assert.True(RapierAerodynamics.NextInletUnstartState(
            mach, incidence + 0.08, 0.0, previouslyUnstarted: true));
        Assert.False(RapierAerodynamics.NextInletUnstartState(
            mach, incidence, 0.0, previouslyUnstarted: true));
    }

    [Fact]
    public void F22PublicDataSurrogateStaysOffRapierPathAndKeepsZeroQTvcContract() {
        AircraftParams f22 = F22;
        Assert.Equal(AerodynamicModelKind.Generic, f22.AerodynamicModel);
        Assert.Equal(HighAlphaModelKind.F22PublicDataSurrogate, f22.HighAlphaModel);
        Assert.False(FlightModel.UsesRapierAerodynamics(f22));
        Assert.True(f22.PitchThrustVectorMaxRad > 0.0);
        Assert.Equal(0.0, f22.ColdGasRcsMaxMomentNm);

        // Controllable CL follows the generic/F-22 path (physical break + config), not Rapier α schedule.
        double mach = 0.6;
        double f22Cl = FlightModel.EffectiveControllableClMax(
            f22, mach, AirframeAerodynamicState.Clean);
        Assert.Equal(FlightModel.EffectiveClMax(f22, mach), f22Cl, 12);
        Assert.True(FlightModel.PositiveNormalLawAlphaMax(f22, mach, AirframeAerodynamicState.Clean)
            > RapierAerodynamics.NormalLawAlphaLimitRad(3.5));

        const double corridorAltM = 1_000.0;
        const double corridorMassKg = 22_000.0;
        var raw = new RawState(new Vec3D(0.0, corridorAltM, 0.0), Vec3D.Zero, 0.0,
            corridorMassKg, QuaternionD.Identity, default);
        var command = new PilotCommand(1.0, 0.0, 0.0, 1.0,
            RollControl: 0.0, CommandedAlphaRad: 60.0 * Math.PI / 180.0,
            DirectLateralControl: true);

        StateDeriv unpowered = FlightModel.Derivatives(raw, command, f22,
            new Vec3D(0.0, 1.0, 0.0), Vec3D.Zero, netThrustN: 0.0,
            AirframeAerodynamicState.Clean, StandardAtmosphere1976.Instance,
            pitchThrustVectorAngleRad: f22.PitchThrustVectorMaxRad);
        StateDeriv powered = FlightModel.Derivatives(raw, command, f22,
            new Vec3D(0.0, 1.0, 0.0), Vec3D.Zero, netThrustN: f22.ThrustMaxN,
            AirframeAerodynamicState.Clean, StandardAtmosphere1976.Instance,
            pitchThrustVectorAngleRad: f22.PitchThrustVectorMaxRad);

        Assert.Equal(0.0, unpowered.DBodyRates.Q, 12);
        Assert.Equal(0.0, unpowered.DBodyRates.R, 12);
        Assert.True(powered.DBodyRates.Q > 0.5,
            "current thrust must remain the only zero-q pitch authority on the F-22 path");
        Assert.Equal(0.0, powered.RcsMomentMagnitudeNm, 12);
    }
}
