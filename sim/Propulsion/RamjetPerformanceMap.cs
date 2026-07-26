namespace GunsOnly.Sim.Propulsion;

/// <summary>
/// Reduced-order fixed-geometry ramjet, as a pure deterministic function of Mach and ambient state.
///
/// WHY THIS EXISTS: none of the three existing propulsion models can be a ramjet, and the difference
/// is not a matter of tuning. GenericDensityScaled, J47Ge27 and the afterburning-turbofan surrogate
/// all put PEAK THRUST AT LOW MACH and lapse from there. A ramjet is the inverse — it makes no
/// thrust at all until the airframe is already fast, because its only compressor is the shock system
/// in its own inlet. An aircraft that has to DIVE to start its engine cannot be expressed by a model
/// whose thrust is highest when standing still.
///
/// THE MODEL is the textbook ideal-ramjet specific thrust with two honest corrections:
///
///   mass flow      mdot     proportional to  rho * a0 * M
///   specific thrust F/mdot  proportional to  a0 * M * (sqrt(tauLambda / tauRam) - 1)
///
/// where tauRam = 1 + (gamma-1)/2 * M^2 is the stagnation-temperature ratio the inlet imposes, and
/// tauLambda = Tburner / Tambient is how much hotter than the free stream the combustor can run.
/// The bracket is the whole story: at low Mach there is little ram compression so thrust is small,
/// and at high Mach the air arrives so hot that the fixed burner temperature can add less and less,
/// so the bracket collapses toward zero. Between those the product with M^2 peaks — that peak is the
/// engine's design point.
///
/// The two corrections keep it from being an ideal-cycle fantasy:
///  - inlet total-pressure recovery falling with Mach (the MIL-E-5008B form), which pulls the peak
///    down from the ideal-cycle value of roughly M4 to a realistic M3-ish;
///  - a hard light-up floor, because a ramjet below its starting Mach is a drag device, not an
///    engine, and returning "a little thrust" there would quietly let an aircraft bootstrap itself
///    from a standstill.
///
/// ThrustMaxN on AircraftParams means NET THRUST AT THE DESIGN POINT (DesignMach at
/// DesignAltitudeM), not static sea-level thrust, which for a ramjet is zero and therefore useless
/// as a scaling parameter.
///
/// Provisional surrogate. Burner temperature, capture efficiency and the recovery law are
/// transparent stand-ins for a real engine deck, not a claim about any specific ramjet.
internal static class RamjetPerformanceMap {
    /// Below this the inlet cannot establish useful compression. A real fixed-geometry ramjet is a
    /// hole with a fire in it down here; it is emphatically not a way to accelerate from low speed.
    public const double LightUpMach = 1.6;
    /// Full thrust is not available the instant the engine lights. Between LightUpMach and this the
    /// model ramps in, representing an unstarted-to-started inlet transition without pretending to
    /// model the shock physics of it.
    public const double FullyStartedMach = 2.1;
    /// Stoichiometric-ish limit for an uncooled combustor, in kelvin.
    public const double BurnerTemperatureK = 2200.0;
    /// The point ThrustMaxN is quoted at.
    public const double DesignMach = 3.0;
    public const double DesignAltitudeM = 18_288.0; // 60,000 ft

    const double Gamma = 1.4;

    /// Ideal specific-thrust group times captured mass flow, less inlet recovery. Proportional to
    /// thrust; absolute scale is removed by normalising against the design point.
    static double ThrustGroup(double mach, double ambientTemperatureK) {
        if (!(mach > 0.0) || !(ambientTemperatureK > 0.0)) return 0.0;
        double tauRam = 1.0 + (Gamma - 1.0) / 2.0 * mach * mach;
        double tauLambda = BurnerTemperatureK / ambientTemperatureK;
        double ratio = tauLambda / tauRam;
        // Once the incoming air is already at burner temperature the cycle can add nothing.
        if (ratio <= 1.0) return 0.0;
        double specific = System.Math.Sqrt(ratio) - 1.0;
        return mach * mach * specific * InletRecovery(mach);
    }

    /// MIL-E-5008B supersonic total-pressure recovery. Subsonic recovery is taken as unity; the
    /// engine is not usable there anyway.
    static double InletRecovery(double mach) {
        if (mach <= 1.0) return 1.0;
        return System.Math.Clamp(1.0 - 0.075 * System.Math.Pow(mach - 1.0, 1.35), 0.05, 1.0);
    }

    /// Fraction of design-point thrust available at this Mach and ambient state. Zero below light-up.
    public static double ThrustFraction(double mach, double ambientTemperatureK,
        double ambientDensityKgM3) {
        if (!double.IsFinite(mach) || mach < LightUpMach) return 0.0;
        if (!double.IsFinite(ambientTemperatureK) || !double.IsFinite(ambientDensityKgM3)) return 0.0;

        GunsOnly.Sim.AtmosphericState design =
            GunsOnly.Sim.StandardAtmosphere1976.Instance.Sample(DesignAltitudeM);
        double designGroup = ThrustGroup(DesignMach, design.TemperatureK) * design.DensityKgM3;
        if (designGroup <= 0.0) return 0.0;

        double group = ThrustGroup(mach, ambientTemperatureK) * ambientDensityKgM3;
        double started = System.Math.Clamp(
            (mach - LightUpMach) / System.Math.Max(1e-9, FullyStartedMach - LightUpMach), 0.0, 1.0);
        return System.Math.Max(0.0, group / designGroup) * started;
    }

    /// A ramjet has no spool and no rotating group: the "throttle" is fuel flow into an already
    /// established airflow, so commanded fraction scales thrust directly. RPM is reported as zero
    /// because there is nothing turning — an instrument that showed an RPM would be lying.
    public static EngineOperatingPoint Evaluate(double commandedFraction, double designThrustN,
        double mach, double ambientTemperatureK, double ambientDensityKgM3,
        double idleFuelFlowLbPerMinute, double militaryFuelFlowLbPerMinute) {
        double lever = System.Math.Clamp(commandedFraction, 0.0, 1.0);
        double available = ThrustFraction(mach, ambientTemperatureK, ambientDensityKgM3);
        double thrustN = lever * available * designThrustN;
        // No airflow means no combustion: the engine is not merely at idle, it is out.
        bool running = available > 0.0;
        double fuelFlow = running
            ? idleFuelFlowLbPerMinute
                + System.Math.Max(0.0, militaryFuelFlowLbPerMinute - idleFuelFlowLbPerMinute) * lever
            : 0.0;
        return new EngineOperatingPoint(
            Rpm: 0.0,
            RpmPercent: 100.0 * lever * (running ? 1.0 : 0.0),
            NetThrustN: thrustN,
            NetThrustLbf: thrustN / J47PerformanceMap.NewtonsPerPoundForce,
            FuelFlowLbPerMinute: fuelFlow,
            Running: running);
    }
}
