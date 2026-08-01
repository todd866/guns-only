namespace GunsOnly.Sim.Propulsion;

/// <summary>
/// Variable-geometry turbine-based combined-cycle surrogate: one inlet, one nozzle, an augmented
/// turbine core through the transonic gate, and a progressively dominant ram stream above M1.6.
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
/// The canonical shape owns inlet capture area and installed stream performance. Fade, light-off,
/// dense-air spill and turbine lapse remain transparent reduced-order schedules, not an OEM deck.
public readonly record struct CombinedCycleThrustFractions(double Turbine, double Ramjet) {
    public double Total => Turbine + Ramjet;
}

public static class TurboRamjetPerformanceMap {
    /// Turbine contribution begins fading once ram compression starts heating the inlet air beyond
    /// what a ceramic hot section wants to see, and is gone by the time the ram duct owns the flow.
    public static double TurbineFadeStartMach => RapierV2Design.TurbineFadeStartMach;
    public static double TurbineGoneMach => RapierV2Design.TurbineFadeCompleteMach;
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
    // 1.6, NOT 2.0. The turbine begins fading at TurbineFadeStartMach 1.9 and the ram used to
    // contribute exactly NOTHING until 2.0, so there was a band where one cycle had started
    // leaving and the other had not arrived. The aircraft fell into it every climb and sat there
    // -- "a struggle getting it to light off" -- and at altitude, where the turbine is weak
    // anyway, it could not always push through at all.
    //
    // A combined cycle hands over; it does not gap. The J58 opened its bypass while the turbine
    // was still doing useful work, and the overlap IS the architecture. Starting the ram fade at
    // 1.6 puts it comfortably under the turbine fade so thrust is continuous across the handover.
    public const double RamFadeStartMach = 1.6;
    public const double FullRamMach = 2.8;
    /// Net ram-mode thrust at the design point, as a fraction of sea-level static dry turbine thrust.
    // Still two and a half times the original 0.42, so the ram genuinely dominates once lit, but no
    // longer more than the turbine's entire sea-level static thrust from a duct on a 7.8 t aircraft.
    // Sized so the aircraft tops out near M4.5 — where the ram cycle itself is dying — rather than
    // against a structural limit. With a CMC hot structure good to about M5.7 the engine is the
    // binding constraint, which is how a ramjet should behave.
    public static double RamDesignThrustRatio =>
        RapierV2Design.DesignPointNetThrustN / StaticThrustReferenceN;
    /// The cycle design point comes directly from the canonical v2 geometry/engineering artifact.
    public static double DesignMach => RapierV2Design.DesignMach;
    public static double DesignAltitudeM => RapierV2Design.DesignAltitudeM;
    /// The translating inlet does not offer the ram duct full capture area in dense air. Below the
    /// launch climb it stays substantially spilled to keep diffuser pressure and hot-section load
    /// inside limits; the schedule opens between roughly FL300 and FL500. This is what makes
    /// "climb before accelerating" a real aircraft constraint instead of briefing prose.
    // Opened DOWNWARD, from 0.38/0.20 to 0.60/0.32. The old schedule left the spike shut until
    // roughly FL270 and only reached full capture near FL430, so at FL300 the inlet was 3% open,
    // the ram made essentially nothing, and TOTAL thrust FELL from 35 kN at M1.6 to 16 kN at M3.0
    // -- the aircraft got weaker the faster it went, and lightoff was not merely hard, it was
    // unreachable from any altitude a climbing pilot actually passes through.
    //
    // 0.48/0.28 starts the spike opening near FL225 and reaches full capture near FL375, so the
    // ram builds through the climb where the pilot needs it: capture at FL300 goes from 3% to 53%.
    //
    // The bound on how far this can open is TheTurbineCarriesItLowAndTheRamCarriesItHigh, which
    // requires under 1.6x static thrust at M2.6 / 9,000 m so the attack dive is never free. 0.60
    // was tried first and read 2.21x -- the test caught it. This is only safe at all because
    // CaptureDensityCeiling is now genuinely applied above; with that guard still dropped on the
    // floor, opening the schedule at all would have made a low dive enormously powerful.
    public const double RamCaptureLockedDensityRatio = 0.48;
    public const double RamCaptureFullDensityRatio = 0.28;

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
    public const double RamSpillStartMach = 4.8;
    public const double RamSpillCompleteMach = 5.2;

    const double Gamma = 1.4;

    static double Fade(double value, double from, double to) =>
        System.Math.Clamp((value - from) / System.Math.Max(1e-9, to - from), 0.0, 1.0);

    /// Physical capture area of the ram duct, square metres. This REPLACES a normalised thrust
    /// ratio, which was the least honest number in the model: it was chosen to land the top speed
    /// where the design wanted it, so the engine was defined by its answer rather than its
    /// geometry. A 1.24 m duct on a 13 m airframe is large — this aircraft is substantially duct,
    /// exactly as the D-21 was — and thrust now falls out of the ideal cycle rather than a fit.
    public static double RamCaptureAreaM2 => RapierV2Design.InletCaptureAreaM2;

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
    public static double StaticThrustReferenceN => RapierV2Design.SeaLevelStaticDryThrustN;

    /// Ram-stream installed thrust in newtons. Captured mass flow comes from the canonical inlet
    /// area and capture-efficiency schedule; specific thrust and installed retention come from the
    /// same v2 definition. This is the exact equation used to close its generated M4.2 artifact.
    public static double RamThrustN(double mach, double ambientTemperatureK,
        double ambientDensityKgM3) {
        if (!(mach > 0.0) || !(ambientTemperatureK > 0.0) || !(ambientDensityKgM3 > 0.0)) return 0.0;
        double speedOfSound = System.Math.Sqrt(Gamma * 287.05287 * ambientTemperatureK);
        double velocity = mach * speedOfSound;
        double capturedMassFlowKgS = ambientDensityKgM3 * velocity * RamCaptureAreaM2
            * RapierV2Design.CaptureEfficiency(mach);
        return capturedMassFlowKgS * RapierV2Design.SpecificThrustNPerKgS(mach)
            * RapierV2Design.InstalledThrustRetention;
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

        // Ram: geometry-owned inlet and stream performance. Dense-air capture is still capped by
        // the translating inlet because the generated artifact closes only the thin-air design
        // point; this prevents the same duct swallowing unbounded mass in a low-altitude dive.
        GunsOnly.Sim.AtmosphericState design =
            GunsOnly.Sim.StandardAtmosphere1976.Instance.Sample(DesignAltitudeM);
        double designDensityRatio = design.DensityKgM3 / AirData.SeaLevelDensityKgM3;
        double ram = 0.0;
        if (RamCaptureAreaM2 > 0.0) {
            // CaptureDensityCeiling is now actually APPLIED. It was computed here and then
            // dropped on the floor: RamThrustN was handed raw ambient density, so the guard its
            // own comment describes -- "a fixed-geometry inlet cannot swallow unlimited air" --
            // did nothing at all. The duct was modelled as swallowing everything the atmosphere
            // could push at it, which is why ram thrust reached 5.4x the dry rating (271 kN) at
            // FL400/M3 and would have made a low dive free.
            //
            // Feeding the CAPPED density into the cycle is what the ceiling was for: above the cap
            // the duct is choked and the surplus spills round the cowl, so thrust stops climbing
            // as the air thickens.
            double capturedDensityRatio = System.Math.Min(densityRatio,
                designDensityRatio * CaptureDensityCeiling);
            double capturedDensityKgM3 = capturedDensityRatio * AirData.SeaLevelDensityKgM3;
            double captureSchedule = Fade(
                RamCaptureLockedDensityRatio - densityRatio,
                0.0,
                RamCaptureLockedDensityRatio - RamCaptureFullDensityRatio);
            // Physical thrust, expressed as a fraction of static rating so the rest of the engine
            // interface is unchanged. The capture schedule still models the spike not being
            // deployed in dense air, and the fade models light-up.
            ram = RamThrustN(mach, ambientTemperatureK, capturedDensityKgM3)
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
        // Lever travel above 1.0 is a turbine augmentor, not a magic multiplier on captured ram
        // air. The old common multiplication made a 1.35 lever manufacture 35% more M4 ram thrust
        // than the shape-derived inlet can swallow. Below MIL both streams follow the lever; above
        // MIL only the still-running turbine stream receives augmentation. Once the core fades out,
        // full lever therefore equals the canonical ram design point exactly.
        double streamCommand = System.Math.Min(lever, 1.0);
        double turbineThrustN = lever * parts.Turbine * staticThrustN;
        double ramThrustN = streamCommand * parts.Ramjet * staticThrustN;
        double thrustN = turbineThrustN + ramThrustN;
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
            RamjetFuelFlowLbPerMinute: System.Math.Max(0.0, ramFuel),
            TurbineThrustN: System.Math.Max(0.0, turbineThrustN),
            RamjetThrustN: System.Math.Max(0.0, ramThrustN));
    }
}
