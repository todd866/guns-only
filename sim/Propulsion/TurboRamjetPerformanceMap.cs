namespace GunsOnly.Sim.Propulsion;

/// <summary>
/// Variable-geometry turbine-based combined-cycle engine: one inlet, one nozzle, a turbine core
/// that keeps running while
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
public readonly record struct CombinedCycleThrustFractions(double Turbine, double Ramjet) {
    public double Total => Turbine + Ramjet;
}

public static class TurboRamjetPerformanceMap {
    /// Turbine contribution begins fading once ram compression starts heating the inlet air beyond
    /// what a ceramic hot section wants to see, and is gone by the time the ram duct owns the flow.
    public const double TurbineFadeStartMach = 1.9;
    public const double TurbineGoneMach = 3.0;
    /// Ram combustion becomes worth lighting here and owns the flow by FullRamMach. Deliberately
    /// OVERLAPS the turbine fade — that overlap is the repeatability.
    // Narrowed from 1.6-2.2 to 1.85-2.15. The handover is the aircraft's defining moment and a
    // 0.6-Mach blend made it a slow swell; 0.3 makes it a shove. This is perceptual, not a buff —
    // the same thrust arrives, it just arrives decisively.
    public const double RamFadeStartMach = 1.85;
    public const double FullRamMach = 2.15;
    /// Net ram-mode thrust at the design point, as a fraction of sea-level static dry turbine thrust.
    // Still two and a half times the original 0.42, so the ram genuinely dominates once lit, but no
    // longer more than the turbine's entire sea-level static thrust from a duct on a 7.8 t aircraft.
    // Sized so the aircraft tops out near M4.5 — where the ram cycle itself is dying — rather than
    // against a structural limit. With a CMC hot structure good to about M5.7 the engine is the
    // binding constraint, which is how a ramjet should behave.
    public const double RamDesignThrustRatio = 1.30;
    // Design point M2.6, NOT Mach 4. Nothing has ever sustained Mach 4 in air-breathing flight:
    // the SR-71 topped out near M3.2 on titanium and a unique engine, and the MiG-25 at M2.83 on
    // steel. A cheap steel-and-composite attritable jet reaching M4.13 was past every aircraft ever
    // built, which is exactly why it felt overpowered — it was.
    //
    // A design point is a NORMALISER: the same RamDesignThrustRatio buys far more thrust when the
    // reference dash is faster, so moving it to M4 silently multiplied everything measured against
    // it. Back at M2.6/21.5 km the aircraft tops out near M3.1, which is SR-71 class and agrees
    // with the 320 C skin limit instead of running 1,000 K past it.
    public const double DesignMach = 2.6;
    public const double DesignAltitudeM = 21_500.0;
    // Stoichiometric kerosene-air adiabatic flame temperature is about 2300-2400 K, and hydrogen is
    // no better. 3000 K is not a materials problem that a ceramic solves — it is chemically
    // unreachable by burning fuel in air at any budget. The engine was making thrust nothing could
    // actually produce, which is why the aircraft leapt out of the atmosphere.
    public const double BurnerTemperatureK = 2300.0;

    /// The translating inlet does not offer the ram duct full capture area in dense air. Below the
    /// launch climb it stays substantially spilled to keep diffuser pressure and hot-section load
    /// inside limits; the schedule opens between roughly FL300 and FL500. This is what makes
    /// "climb before accelerating" a real aircraft constraint instead of briefing prose.
    public const double RamCaptureLockedDensityRatio = 0.38;
    public const double RamCaptureFullDensityRatio = 0.20;

    /// A FIXED-GEOMETRY INLET CANNOT SWALLOW UNLIMITED AIR. Captured mass flow scales with density
    /// and Mach only until the duct chokes; past that the excess is spilled around the cowl and does
    /// nothing but add drag. Without this ceiling the naive density scaling produced roughly 3.6x
    /// design thrust in a low-altitude dive — an engine that gets stronger the deeper you go, which
    /// would have made the attack dive free. Expressed as a multiple of design-point density.
    public const double CaptureDensityCeiling = 1.9;

    /// Where the inlet begins dumping captured air. Set well above the useful envelope so the
    /// aircraft is limited by the ram cycle falling away naturally, not by a hidden schedule.
    /// Keying this off DesignMach was a real bug: moving the design point moved the spill with it
    /// and produced zero thrust by M2.78.
    public const double RamSpillStartMach = 3.3;
    public const double RamSpillCompleteMach = 3.8;

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

    /// Available turbine and ramjet thrust as fractions of sea-level static dry thrust.
    public static CombinedCycleThrustFractions ThrustComponents(
        double mach, double ambientTemperatureK,
        double ambientDensityKgM3) {
        if (!double.IsFinite(mach) || mach < 0.0)
            return new CombinedCycleThrustFractions();
        if (!double.IsFinite(ambientTemperatureK) || !double.IsFinite(ambientDensityKgM3))
            return new CombinedCycleThrustFractions();
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
            double captureSchedule = Fade(
                RamCaptureLockedDensityRatio - densityRatio,
                0.0,
                RamCaptureLockedDensityRatio - RamCaptureFullDensityRatio);
            ram = RamGroup(mach, ambientTemperatureK) * capturedDensityRatio / designGroup
                * RamDesignThrustRatio
                * captureSchedule
                * Fade(mach, RamFadeStartMach, FullRamMach);
            // The translating inlet is scheduled around one design dash, not an unlimited
            // accelerator: past its spill Mach it progressively dumps the captured stream to hold
            // diffuser temperature. This must key off a SEPARATE constant, not DesignMach — tying
            // it to the design point meant that moving the design point from M4 to M2.6 also moved
            // the spill down, and the engine produced ZERO thrust by M2.78.
            ram *= 1.0 - Fade(mach, RamSpillStartMach, RamSpillCompleteMach);
        }
        return new CombinedCycleThrustFractions(
            System.Math.Max(0.0, turbine),
            System.Math.Max(0.0, ram));
    }

    /// Total available thrust as a fraction of sea-level static dry thrust.
    public static double ThrustFraction(double mach, double ambientTemperatureK,
        double ambientDensityKgM3) =>
        ThrustComponents(mach, ambientTemperatureK, ambientDensityKgM3).Total;

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
            // Lever zero is ground/flight idle, not a stopped core. Keeping the turbine above the
            // generator and hydraulic cut-in is what lets a powered Rapier extend its recovery
            // configuration while the thrust command is near idle.
            Rpm: 55.0 + 45.0 * core,
            RpmPercent: 55.0 + 45.0 * core,
            NetThrustN: thrustN,
            NetThrustLbf: thrustN / J47PerformanceMap.NewtonsPerPoundForce,
            FuelFlowLbPerMinute: System.Math.Max(0.0, fuelFlow),
            Running: true);
    }
}
