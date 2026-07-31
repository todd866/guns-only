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
    /// Compressor mass flow collapses with density. Sqrt-density alone still left ~12% of SLS at
    /// FL1000, so a ZoomCoast (throttle 0, RCS only) kept attributing idle fuel and spool to a
    /// core that cannot breathe. Fade the turbine out on density as well as Mach — independent of
    /// Mach, gone by ~100 kft, while the FL560 climb shelf stays fully lit.
    public const double TurbineFadeStartDensityRatio = 0.05; // ~FL720
    public const double TurbineGoneDensityRatio = 0.015;     // ~FL990
    /// Ram combustion becomes worth lighting here and owns the flow by FullRamMach. Deliberately
    /// OVERLAPS the turbine fade — that overlap is the repeatability.
    // Narrowed from 1.6-2.2 to 1.85-2.15. The handover is the aircraft's defining moment and a
    // 0.6-Mach blend made it a slow swell; 0.3 makes it a shove. This is perceptual, not a buff —
    // the same thrust arrives, it just arrives decisively.
    // Real ramjets are not useful much below M2 — pressure recovery is too low to make useful
    // thrust, which is why every one ever flown needed a booster or a host engine. 1.85 was
    // optimistic; 2.0 to 2.8 is the honest band and it puts a genuine thrust bucket between the
    // fading turbine and the rising ram, exactly as a combined cycle really has.
    public const double RamFadeStartMach = 2.0;
    public const double FullRamMach = 2.8;
    /// Net ram-mode thrust at the design point, as a fraction of sea-level static dry turbine thrust.
    // Still two and a half times the original 0.42, so the ram genuinely dominates once lit, but no
    // longer more than the turbine's entire sea-level static thrust from a duct on a 7.8 t aircraft.
    // Sized so the aircraft tops out near M4.5 — where the ram cycle itself is dying — rather than
    // against a structural limit. With a CMC hot structure good to about M5.7 the engine is the
    // binding constraint, which is how a ramjet should behave.
    public const double RamDesignThrustRatio = 1.30;
    // NOTE: DesignMach and DesignAltitudeM no longer affect thrust at all. designGroup is computed
    // from them and then used only as a `> 0.0` guard -- the normalisation described below was
    // replaced by RamThrustN()/StaticThrustReferenceN, an ideal cycle over a physical duct. They
    // are kept because they still document the intended dash point.
    //
    // The reasoning that set M2.6 has also expired, and it is worth recording why rather than
    // quietly moving the number. It argued that M2.6 "agrees with the 320 C skin limit" -- but
    // 320 C is the CHEAP STEEL aeroplane, CheapRapierPublicDataSurrogate, which was rejected. This
    // airframe is 1200 C SiC/SiC CMC and screens past M5. The design point was justified against
    // an aircraft that no longer exists, and was never revisited when the skin changed.
    //
    // The other half of that argument -- "nothing has ever sustained Mach 4 air-breathing" -- is
    // true of aircraft that were BUILT, and it was the right instinct at the time: the jet was
    // reaching M4.13 on an 84 kN core it could not physically carry. It is not an argument that
    // M4 is impossible for a 2040s CMC airframe. What made the old aircraft dishonest was free
    // thrust, and that was fixed at the source rather than by capping the design point.
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
    public const double RamSpillStartMach = 4.4;
    public const double RamSpillCompleteMach = 5.0;

    const double Gamma = 1.4;

    static double Fade(double value, double from, double to) =>
        System.Math.Clamp((value - from) / System.Math.Max(1e-9, to - from), 0.0, 1.0);

    /// MIL-E-5008B supersonic total-pressure recovery.
    static double InletRecovery(double mach) => mach <= 1.0
        ? 1.0
        : System.Math.Clamp(1.0 - 0.055 * System.Math.Pow(mach - 1.0, 1.35), 0.05, 1.0);

    /// Physical capture area of the ram duct, square metres. This REPLACES a normalised thrust
    /// ratio, which was the least honest number in the model: it was chosen to land the top speed
    /// where the design wanted it, so the engine was defined by its answer rather than its
    /// geometry. A 1.24 m duct on a 13 m airframe is large — this aircraft is substantially duct,
    /// exactly as the D-21 was — and thrust now falls out of the ideal cycle rather than a fit.
    public const double RamCaptureAreaM2 = 1.9;

    /// <summary>
    /// Ram combustor TSFC as a multiple of the published dry-military specific fuel consumption
    /// (military lb/min ÷ sea-level static dry newtons). Higher than the turbine — ramjets are
    /// thirsty — but total flow still falls as the core unloads because turbine fuel collapses to
    /// an idle floor rather than charging military SFC against ram thrust. Kept below the published
    /// afterburner/military ratio (~3.1) so ram-cruise still teaches better lb/nm than a lever-lie
    /// AB bill, without starving the authored intercept fuel budget.
    /// </summary>
    public const double RamTsfcRelativeToDryMilitary = 1.85;

    /// The rating the fraction-based engine interface is measured against: the Rapier's sea-level
    /// static dry thrust. Used only to convert physical newtons back into the fraction callers
    /// expect, so the ram term can be real thrust while the interface stays unchanged.
    public const double StaticThrustReferenceN = 50_000.0;

    /// Ram thrust in NEWTONS from the ideal cycle: F = rho V0^2 Ac (sqrt(Tb/T_inlet) - 1) eta.
    /// Nothing here is normalised against a design point; the only free parameter is the duct.
    public static double RamThrustN(double mach, double ambientTemperatureK,
        double ambientDensityKgM3) {
        if (!(mach > 0.0) || !(ambientTemperatureK > 0.0) || !(ambientDensityKgM3 > 0.0)) return 0.0;
        double inletTotalK = ambientTemperatureK * (1.0 + (Gamma - 1.0) / 2.0 * mach * mach);
        if (BurnerTemperatureK <= inletTotalK) return 0.0;   // no temperature ratio left to burn into
        double speedOfSound = System.Math.Sqrt(Gamma * 287.05287 * ambientTemperatureK);
        double velocity = mach * speedOfSound;
        return ambientDensityKgM3 * velocity * velocity * RamCaptureAreaM2
            * (System.Math.Sqrt(BurnerTemperatureK / inletTotalK) - 1.0)
            * InletRecovery(mach);
    }

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
        // core hands its air to the ram duct, and starved outright when ambient density cannot
        // support a compressor — Mach fade alone does not kill the core on an exo coast.
        double turbine = System.Math.Sqrt(System.Math.Max(0.0, densityRatio))
            * (1.0 + 0.10 * System.Math.Clamp(mach, 0.0, 1.5))
            * (1.0 - Fade(mach, TurbineFadeStartMach, TurbineGoneMach))
            * Fade(densityRatio, TurbineGoneDensityRatio, TurbineFadeStartDensityRatio);

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
            // Physical thrust, expressed as a fraction of static rating so the rest of the engine
            // interface is unchanged. The capture schedule still models the inlet not swallowing
            // usefully in dense air, and the fade models light-up.
            ram = RamThrustN(mach, ambientTemperatureK, ambientDensityKgM3)
                / StaticThrustReferenceN
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
        CombinedCycleThrustFractions parts = ThrustComponents(
            mach, ambientTemperatureK, ambientDensityKgM3);
        double thrustN = lever * parts.Total * staticThrustN;
        double turbineThrustN = lever * parts.Turbine * staticThrustN;
        double ramThrustN = lever * parts.Ramjet * staticThrustN;
        double core = System.Math.Clamp(lever, 0.0, 1.0);
        // A density- or Mach-dead turbine is not "idle" — it is out. Idle floor and spool only
        // apply while the core can still breathe; ram-only thrust then burns purely against
        // delivered newtons (and ZoomCoast at exo burns nothing).
        bool coreLit = parts.Turbine > 1e-9;

        // PER-STREAM FUEL. Turbine and ram have different specific consumptions. Charging one
        // lever-interpolated SFC against total thrust made the core look "military" while its
        // thrust share was already gone, and hid the J58 lesson: idle the turbine, cruise on the
        // duct, watch fuel flow drop on the instruments.
        //
        // Published idle / military / afterburner flows still anchor the TURBINE stream at the
        // sea-level static rating. Ram uses a worse TSFC relative to dry-military.
        double turbineLeverFlow = idleFuelFlowLbPerMinute
            + System.Math.Max(0.0, militaryFuelFlowLbPerMinute - idleFuelFlowLbPerMinute) * core;
        double ratedTurbineFraction = core;
        if (lever > 1.0 && leverStop > 1.0) {
            double augmented = System.Math.Clamp((lever - 1.0) / (leverStop - 1.0), 0.0, 1.0);
            turbineLeverFlow += System.Math.Max(0.0,
                afterburnerFuelFlowLbPerMinute - militaryFuelFlowLbPerMinute) * augmented;
            ratedTurbineFraction = 1.0 + augmented * (System.Math.Max(1.0, leverStop) - 1.0);
        }
        double ratedTurbineThrustN = System.Math.Max(1.0, ratedTurbineFraction * staticThrustN);
        double turbineSfc = turbineLeverFlow / ratedTurbineThrustN;
        double idleFloor = coreLit
            ? idleFuelFlowLbPerMinute * (0.35 + 0.65 * core)
            : 0.0;
        double turbineFuel = coreLit
            ? System.Math.Max(idleFloor, turbineSfc * turbineThrustN)
            : 0.0;

        double militarySfc = militaryFuelFlowLbPerMinute / System.Math.Max(1.0, staticThrustN);
        double ramFuel = System.Math.Max(0.0,
            militarySfc * RamTsfcRelativeToDryMilitary * ramThrustN);

        double fuelFlow = turbineFuel + ramFuel;
        double rpm = coreLit ? 55.0 + 45.0 * core : 0.0;
        return new EngineOperatingPoint(
            // Lever zero is ground/flight idle, not a stopped core — but only while density still
            // supports combustion. Keeping the turbine above the generator and hydraulic cut-in
            // is what lets a powered Rapier extend its recovery configuration near idle; at exo
            // the core is dead and cold-gas RCS owns attitude.
            Rpm: rpm,
            RpmPercent: rpm,
            NetThrustN: thrustN,
            NetThrustLbf: thrustN / J47PerformanceMap.NewtonsPerPoundForce,
            FuelFlowLbPerMinute: System.Math.Max(0.0, fuelFlow),
            Running: parts.Total > 1e-9 || coreLit,
            TurbineFuelFlowLbPerMinute: System.Math.Max(0.0, turbineFuel),
            RamjetFuelFlowLbPerMinute: System.Math.Max(0.0, ramFuel));
    }
}
