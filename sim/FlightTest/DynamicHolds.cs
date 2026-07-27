namespace GunsOnly.Sim.FlightTest;

public readonly record struct ClimbHoldResult(
    double MaxGammaDegWhileAccelerating,
    double PeakAugmentedThrustToWeight,
    double MachAtMaxGamma,
    double AltFtAtMaxGamma);

/// Named AircraftSim holds used by the Dynamic layer. Deterministic: no wall clock / RNG.
public static class DynamicHolds {
    const double GravityMps2 = 9.80665;
    const double Deg = 180.0 / Math.PI;
    const double Rad = Math.PI / 180.0;

    /// Full-AB climb from M0.85 / 10 000 ft. Level-accelerates into the M1 band, then commands
    /// a steep body pitch (FlightModelTests / approach-law style) so excess T/W can still raise
    /// Mach while γ is large — the homesick-angel signature.
    public static ClimbHoldResult AbClimbThroughMach1(AircraftParams air) {
        double altM = 10_000.0 * 0.3048;
        AtmosphericState atm = StandardAtmosphere1976.Instance.Sample(altM);
        double speed = 0.85 * atm.SpeedOfSoundMps;
        var state = new AircraftState(new Vec3D(0.0, altM, 0.0), speed, 0.0, 0.0, 0.0, air.MassKg);
        var sim = new AircraftSim(state, air, StandardAtmosphere1976.Instance);
        sim.SeedEnginePowerFraction(air.MaxThrustFraction);

        const double Dt = 1.0 / AircraftSim.TickHz;
        int levelTicks = (int)(AircraftSim.TickHz * 12);
        int climbTicks = (int)(AircraftSim.TickHz * 30);
        var level = new PilotCommand(1.0, 0.0, air.MaxThrustFraction, 0.0);
        // ~60° body pitch after a level AB run: probe shows this keeps Mach rising in-band
        // at γ≈59°. Steeper commanded pitch (75–89°) stalls acceleration before γ climbs.
        var climb = new PilotCommand(
            1.0, 0.0, air.MaxThrustFraction, 0.0,
            CommandedPitchRad: 60.0 * Rad);

        double maxGammaDeg = double.NegativeInfinity;
        double machAtMax = 0.0;
        double altFtAtMax = 0.0;
        double peakTw = 0.0;
        double priorMach = Mach(sim);

        for (int i = 0; i < levelTicks + climbTicks; i++) {
            sim.Step(i < levelTicks ? level : climb, Dt);
            double mach = Mach(sim);
            double gammaDeg = sim.State.Gamma * Deg;
            double weightN = Math.Max(1.0, sim.State.Mass * GravityMps2);
            double tw = sim.LastEngineOperatingPoint.NetThrustN / weightN;
            if (tw > peakTw) peakTw = tw;

            bool inBand = mach >= 0.9 && mach <= 1.3;
            bool accelerating = mach > priorMach + 1e-6;
            if (inBand && accelerating && gammaDeg > maxGammaDeg) {
                maxGammaDeg = gammaDeg;
                machAtMax = mach;
                altFtAtMax = sim.State.Position.Y / 0.3048;
            }
            priorMach = mach;
        }

        if (double.IsNegativeInfinity(maxGammaDeg)) maxGammaDeg = 0.0;
        return new ClimbHoldResult(maxGammaDeg, peakTw, machAtMax, altFtAtMax);
    }

    static double Mach(AircraftSim sim) {
        AtmosphericState atm = sim.AtmosphereModel.Sample(sim.State.Position.Y);
        return sim.State.Speed / Math.Max(1e-6, atm.SpeedOfSoundMps);
    }
}
