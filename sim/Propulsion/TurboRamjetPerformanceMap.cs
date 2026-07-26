namespace GunsOnly.Sim.Propulsion;

/// <summary>
/// Core-bypass turbo-ramjet: one inlet, one nozzle, a turbine core that keeps running while
/// progressively more inlet air is bypassed around it into a ram combustor. Broadly the J58
/// operating principle, smaller and with a ceramic-matrix hot section assumed.
///
/// WHY NOT TWO MODELS. A separate turbojet and a separate ramjet would need two ThrustMaxN values
/// and a state machine to hand over between them, and the handover is precisely where such an
/// aircraft is most likely to kill you: shut one engine down at Mach 1.6 and fail to light the other
/// and you are a very heavy glider. The whole point of core bypass is that there IS no handover —
/// the turbine never stops, the ram contribution grows continuously with Mach, and the transition is
/// therefore repeatable rather than a one-shot commitment. Modelling it as one continuous curve is
/// not a simplification; it is the physical claim the architecture makes.
///
/// ThrustMaxN means SEA-LEVEL STATIC DRY THRUST of the turbine core, which is a number that can be
/// quoted, sanity-checked and compared against other airframes in this codebase.
///
/// Provisional surrogate. The fade schedules, capture ceiling and ram ratio are transparent
/// stand-ins for an engine deck, not a claim about the J58 or any other engine.
internal static class TurboRamjetPerformanceMap {
    /// Turbine contribution begins fading once ram compression starts heating the inlet air beyond
    /// what a ceramic hot section wants to see, and is gone by the time the ram duct owns the flow.
    public const double TurbineFadeStartMach = 1.9;
    public const double TurbineGoneMach = 2.7;
    /// Ram combustion becomes worth lighting here and owns the flow by FullRamMach. Deliberately
    /// OVERLAPS the turbine fade — that overlap is the repeatability.
    public const double RamFadeStartMach = 1.6;
    public const double FullRamMach = 2.2;
    /// Net ram-mode thrust at the design point, as a fraction of sea-level static dry turbine thrust.
    public const double RamDesignThrustRatio = 0.42;
    public const double DesignMach = 2.6;
    public const double DesignAltitudeM = 21_500.0;
    public const double BurnerTemperatureK = 2200.0;

    /// A FIXED-GEOMETRY INLET CANNOT SWALLOW UNLIMITED AIR. Captured mass flow scales with density
    /// and Mach only until the duct chokes; past that the excess is spilled around the cowl and does
    /// nothing but add drag. Without this ceiling the naive density scaling produced roughly 3.6x
    /// design thrust in a low-altitude dive — an engine that gets stronger the deeper you go, which
    /// would have made the attack dive free. Expressed as a multiple of design-point density.
    public const double CaptureDensityCeiling = 1.9;

    const double Gamma = 1.4;

    static double Fade(double value, double from, double to) =>
        System.Math.Clamp((value - from) / System.Math.Max(1e-9, to - from), 0.0, 1.0);

    /// MIL-E-5008B supersonic total-pressure recovery.
    static double InletRecovery(double mach) => mach <= 1.0
        ? 1.0
        : System.Math.Clamp(1.0 - 0.075 * System.Math.Pow(mach - 1.0, 1.35), 0.05, 1.0);

    /// Ideal-cycle ram specific thrust group, without the density term.
    static double RamGroup(double mach, double ambientTemperatureK) {
        if (!(mach > 0.0) || !(ambientTemperatureK > 0.0)) return 0.0;
        double tauRam = 1.0 + (Gamma - 1.0) / 2.0 * mach * mach;
        double ratio = BurnerTemperatureK / ambientTemperatureK / tauRam;
        if (ratio <= 1.0) return 0.0;
        return mach * mach * (System.Math.Sqrt(ratio) - 1.0) * InletRecovery(mach);
    }

    /// Total available thrust as a fraction of sea-level static dry thrust.
    public static double ThrustFraction(double mach, double ambientTemperatureK,
        double ambientDensityKgM3) {
        if (!double.IsFinite(mach) || mach < 0.0) return 0.0;
        if (!double.IsFinite(ambientTemperatureK) || !double.IsFinite(ambientDensityKgM3)) return 0.0;
        double densityRatio = ambientDensityKgM3 / AirData.SeaLevelDensityKgM3;

        // Turbine: the existing house lapse (sqrt density, bounded ram recovery), faded out as the
        // core hands its air to the ram duct.
        double turbine = System.Math.Sqrt(System.Math.Max(0.0, densityRatio))
            * (1.0 + 0.10 * System.Math.Clamp(mach, 0.0, 1.5))
            * (1.0 - Fade(mach, TurbineFadeStartMach, TurbineGoneMach));

        // Ram: normalised so the design point yields exactly RamDesignThrustRatio.
        GunsOnly.Sim.AtmosphericState design =
            GunsOnly.Sim.StandardAtmosphere1976.Instance.Sample(DesignAltitudeM);
        double designDensityRatio = design.DensityKgM3 / AirData.SeaLevelDensityKgM3;
        double designGroup = RamGroup(DesignMach, design.TemperatureK) * designDensityRatio;
        double ram = 0.0;
        if (designGroup > 0.0) {
            double capturedDensityRatio = System.Math.Min(densityRatio,
                designDensityRatio * CaptureDensityCeiling);
            ram = RamGroup(mach, ambientTemperatureK) * capturedDensityRatio / designGroup
                * RamDesignThrustRatio * Fade(mach, RamFadeStartMach, FullRamMach);
        }
        return System.Math.Max(0.0, turbine + ram);
    }

    public static EngineOperatingPoint Evaluate(double commandedFraction, double staticThrustN,
        double mach, double ambientTemperatureK, double ambientDensityKgM3,
        double idleFuelFlowLbPerMinute, double militaryFuelFlowLbPerMinute,
        double afterburnerFuelFlowLbPerMinute, double leverStop) {
        double lever = System.Math.Clamp(commandedFraction, 0.0, System.Math.Max(1.0, leverStop));
        double thrustN = lever * ThrustFraction(mach, ambientTemperatureK, ambientDensityKgM3)
            * staticThrustN;
        double core = System.Math.Clamp(lever, 0.0, 1.0);
        double fuelFlow = idleFuelFlowLbPerMinute
            + System.Math.Max(0.0, militaryFuelFlowLbPerMinute - idleFuelFlowLbPerMinute) * core;
        if (lever > 1.0 && leverStop > 1.0) {
            double augmented = System.Math.Clamp((lever - 1.0) / (leverStop - 1.0), 0.0, 1.0);
            fuelFlow += System.Math.Max(0.0,
                afterburnerFuelFlowLbPerMinute - militaryFuelFlowLbPerMinute) * augmented;
        }
        return new EngineOperatingPoint(
            Rpm: 100.0 * core,
            RpmPercent: 100.0 * core,
            NetThrustN: thrustN,
            NetThrustLbf: thrustN / J47PerformanceMap.NewtonsPerPoundForce,
            FuelFlowLbPerMinute: System.Math.Max(0.0, fuelFlow),
            Running: true);
    }
}
