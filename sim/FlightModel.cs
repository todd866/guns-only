using GunsOnly.Sim.Propulsion;

namespace GunsOnly.Sim;

public enum PropulsionModelKind {
    GenericDensityScaled,
    J47Ge27,
    AfterburningTurbofanPublicDataSurrogate
}

/// SpoolUpTau/SpoolDownTau: first-order engine lag, in seconds. Thrust is NOT instantaneous.
/// This is the difference between a toy and a sim on the back side of the power curve, where
/// you hold the glidepath with power and the engine answers late -- and it is exactly why
/// early-jet carrier recovery was lethal: a waveoff asks for thrust the engine cannot give
/// you for several seconds. Spool-DOWN is faster than spool-up (a compressor sheds RPM more
/// readily than it gains it), hence two constants, not one.
public record AircraftParams(double MassKg, double WingAreaM2, double ThrustMaxN,
    double CD0, double InducedK, double CLMax, double CLMin, double RollRateMaxRad, double BankTau,
    double MCrit = 0.85, double WaveDragK = 8.0,
    double SpoolUpTau = 2.5, double SpoolDownTau = 1.4,
    // Lift-curve slope, per radian. Governs how hard a gust bumps you: a vertical gust changes
    // the effective AoA by (gust/V) and lift by q·S·CLα·Δα. ~2π·AR/(AR+2): Sabre AR≈4.5 → ~4.5.
    double CLAlpha = 4.5,
    // Rotational-buffet modes (the gust-driven shudder), as damped 2nd-order oscillators: ω is
    // the natural frequency (rad/s), ζ the damping ratio. Short-period pitch (fast, moderate
    // damping); dutch-roll yaw (lightly damped, which is why it's felt); roll (fast, well damped).
    // BuffetGain is the DC buffet-angle / gust-angle ratio. Placeholder values pending airframe data.
    double PitchModeFreq = 3.0, double PitchModeDamp = 0.4,
    double YawModeFreq = 1.5, double YawModeDamp = 0.18,
    double RollModeFreq = 4.0, double RollModeDamp = 0.7,
    double BuffetGain = 0.5,   // subtle shudder — the aircraft is stable, so a big camera buffet just reads as "out of control"
    // PLACEHOLDER Sabre-ish principal inertias and control/aero-damping moments pending airframe data.
    double IxxKgM2 = 9000, double IyyKgM2 = 45000, double IzzKgM2 = 52000,
    double RollStiffnessNmRad = 135000, double PitchStiffnessNmRad = 540000, double YawStiffnessNmRad = 120000,
    double RollDampingNms = 60000, double PitchDampingNms = 220000, double YawDampingNms = 120000,
    double RollMomentMaxNm = 50000, double PitchMomentMaxNm = 140000, double YawMomentMaxNm = 65000,
    // PLACEHOLDER gentler direct-attitude hold for fine approach corrections.
    double ApproachPitchStiffnessNmRad = 360000, double ApproachPitchMomentMaxNm = 110000,
    double CYBeta = 0.65,
    // Attached-flow lateral derivatives. Moments use the conventional non-dimensional law
    // q*S*b*(ClBeta*beta + ClP*p*b/2V + ClR*r*b/2V + ClDeltaA*deltaA + ClDeltaR*deltaR).
    // Delta derivatives are per radian; the explicit stops convert normalized pilot controls.
    // ClP < 0 is natural roll damping; pilot and explicit SAS aileron are recorded separately.
    double ClBeta = -0.040, double ClP = -0.420, double ClR = 0.080,
    double ClDeltaA = 0.084511274781796, double ClDeltaR = 0.027501974166280,
    double MaxAileronDeflectionRad = 0.349065850398866,
    double MaxRudderDeflectionRad = 0.436332312998582,
    string LateralDerivativeProfileId = "generic-lateral-provisional-v1",
    // Manual pitch-rate command and legacy State.Bank compatibility. Body attitude is authoritative;
    // the compatibility pair keeps old telemetry/RK4 behavior separate from the flown roll tuning.
    double ManualPitchRateMaxRad = 0.60, double ManualPitchAngleTau = 0.60,
    // Legacy/AI bank-tracker rate limit. Physical flown roll derives its rate from the lateral
    // derivatives above; this separate limit preserves command-bank compatibility callers.
    double FightRollRateMaxRad = -1.0,
    double CompatibilityRollRateMaxRad = -1.0, double CompatibilityBankTau = -1.0,
    // Stability augmentation. YawBetaStiffness centers the ball independently of the attitude
    // tracker. RollHoldDamping belongs only to legacy/AI bank-attitude commands; flown/manual roll
    // receives no hold/SAS moment unless a future model publishes explicit SasRollControl.
    double YawBetaStiffnessNmRad = 180000, double RollHoldDampingNms = 50000,
    double RollHoldErrorRad = 0.10,
    // BANK-HOLD (fly-by-wire roll-rate command with attitude hold). A modern FBW fighter holds the
    // bank the pilot last set: with the stick centred it drives the roll RATE to zero and freezes
    // the current bank, so cross-coupling (dihedral beta, inertial pitch/yaw coupling) cannot
    // slowly roll the wing off during a hard pull and force constant aileron correction. This is an
    // explicit augmentation moment on the FLOWN (DirectLateralControl) path only, applied on top of
    // the bare aileron/derivative aerodynamics -- it is NOT aircraft aero data. RollHoldRateGainNms
    // is the tunable hold strength in Nm per rad/s of unwanted roll rate (raise it for a stiffer
    // hold, lower it for a looser one); the applied moment is clamped to the aileron authority
    // (RollMomentMaxNm) so it stays physically bounded. RollHoldDeadband is the |RollControl| below
    // which the hold is active; it fades to zero the instant the pilot commands a deliberate roll so
    // it never fights a commanded roll. Zero gain (the default, and every non-FBW airframe such as
    // the Sabre and the balloon glider) disables it and reproduces the old bare-aileron behaviour
    // bit-for-bit. The law is deterministic: a pure function of the measured body roll rate and the
    // lateral command, with no captured target attitude, integrator, RNG or wall-clock.
    double RollHoldRateGainNms = 0.0, double RollHoldDeadband = 0.05,
    // Airframe envelope limits. Defaults preserve the existing unmanned/afterburning aircraft;
    // the F-86 overrides these with its piloted structural limit and dry-thrust-only J47.
    // The three control-law fields are explicit gameplay-surrogate policy, not hidden aircraft
    // data: NormalPullUsesMaxPerformance bypasses the teaching detent while retaining the ordinary
    // structural/AoA protection; PositiveOverrideLimitG is the actuator-demand ceiling available
    // only through the input layer's deliberate override (negative preserves the structural cap);
    // DynamicPressureScheduledPostStallOverride makes that override a G release above corner and a
    // progressively deeper incidence release below corner instead of commanding one fixed alpha
    // at every speed.
    double PositiveStructuralLimitG = 12.0, double MaxPerformFraction = 0.92,
    bool NormalPullUsesMaxPerformance = false, double PositiveOverrideLimitG = -1.0,
    bool DynamicPressureScheduledPostStallOverride = false,
    double MaxThrustFraction = 1.35,
    // Optional integrated pitch-thrust-vectoring control. Zero preserves an ordinary fixed nozzle.
    // MaxRad is the thrust-force vector limit; MomentArmM is a reduced-order CG-to-resultant-nozzle
    // lever arm. Alpha/rate gains belong to the transparent control-law surrogate, not an OEM law.
    double PitchThrustVectorMaxRad = 0.0, double PitchThrustVectorMomentArmM = 0.0,
    double PitchThrustVectorAlphaGain = 0.0,
    double PitchThrustVectorRateGainSeconds = 0.0,
    // Optional player gunnery assistance. A zero rate disables it. The pitch aid engages inside its
    // lead-solution capture cone/range and may move the pilot's protected load-factor request by at
    // most MaxCorrectionG; closure and firing remain manual.
    double GunneryPitchAssistMaxRateRad = 0.0,
    double GunneryPitchAssistCaptureAngleRad = 0.0,
    double GunneryPitchAssistMaxRangeM = 0.0,
    double GunneryPitchAssistGainPerSecond = 0.0,
    double GunneryPitchAssistMaxCorrectionG = 0.0,
    // Optional lateral (roll + yaw) half of the SAME gunnery aid; zero gains disable it. Inside the
    // identical capture cone/range, a bounded roll toward the side the ballistic lead sits on plus a
    // bounded rudder walk the nose LATERALLY onto the solution, so a keyboard pilot converts by
    // pointing roughly at the bandit and holding fire. Both are proportional to the lateral lead
    // error (exactly zero when aligned) and clamped; the rounds still fly the real ballistic arc.
    double GunneryLateralAssistRollGain = 0.0,
    double GunneryLateralAssistMaxRoll = 0.0,
    double GunneryLateralAssistYawGain = 0.0,
    double GunneryLateralAssistMaxYaw = 0.0,
    // Extra drag from buffet/separation as the wing approaches CLmax. The quadratic polar remains
    // authoritative below OnsetFraction; this smooth term only closes the hard-turn energy bill.
    double HighLiftDragOnsetFraction = 1.0, double HighLiftDragK = 0.0,
    // Continuous separated-flow model. WingSpanM < 0 derives a representative span from area;
    // the F-86 supplies its real span. The remaining coefficients scale physical sectional
    // lift/drag differences and the nose-down pitching break after CLmax.
    double WingSpanM = -1.0, double PostStallAlphaCommandRad = 0.42,
    double PostStallDragMax = 0.90, double StallRollCoupling = 0.20,
    double StallYawCoupling = 0.34, double StallPitchBreakNm = 26000.0,
    // Propulsion and mass identity are explicit so fuel quantity changes gross mass without adding
    // fuel on top of a reference gross weight. A negative fuel-free mass preserves legacy/custom
    // aircraft whose mass does not yet participate in the resource model.
    PropulsionModelKind PropulsionModel = PropulsionModelKind.GenericDensityScaled,
    double FuelFreeMassKg = -1.0,
    // Generic propulsion historically supplied thrust but no fuel-flow truth. These three
    // optional anchors make a mission's explicitly labelled surrogate engine consume fuel without
    // pretending that the kernel owns an OEM engine deck. Zero preserves legacy generic aircraft.
    double GenericIdleFuelFlowLbPerMinute = 0.0,
    double GenericMilitaryFuelFlowLbPerMinute = 0.0,
    double GenericAfterburnerFuelFlowLbPerMinute = 0.0);

/// Internal integration state: velocity is a Cartesian world vector, so vertical
/// flight is not singular (no division by cos gamma anywhere).
public readonly record struct RawState(Vec3D Pos, Vec3D Vel, double Bank, double Mass,
    QuaternionD Attitude, BodyRates BodyRates);

public readonly record struct StateDeriv(Vec3D DPos, Vec3D DVel, double DBank,
    QuaternionD DAttitude, BodyRates DBodyRates, double RollMomentNm);

internal readonly record struct AeroResult(Vec3D Accel, Vec3D LiftDir, Vec3D AirVelocity,
    double Alpha, double Beta, double Nz, double DynamicPressure,
    double PitchThrustVectorAngleRad, double PitchThrustVectorMomentNm);

public static class FlightModel {
    public const double G0 = 9.80665;
    // F-86F-30/J47-GE-27 clean combat envelope. Each number is tied to the report's documented
    // target; effective drag coefficients include whole-aircraft losses represented by this kernel.
    public static readonly AircraftParams Sabre = new(
        MassKg: 6900,                         // ~15,200 lb representative clean combat weight
        WingAreaM2: 26.8,                     // F-86F wing area: 288 sq ft
        ThrustMaxN: J47PerformanceMap.RatedNetThrustLbf
            * J47PerformanceMap.NewtonsPerPoundForce, // J47-GE-27: 5,970 lbf SLS military
        CD0: 0.0166,                          // fits 595 kt SL / 525 kt at 35,000 ft in MIL
        InducedK: 0.0450,                     // fits ~5 G sustained at 350 kt / 10,000 ft
        CLMax: 1.10,                          // fits +7 G corner near 375 kt TAS / 10,000 ft
        CLMin: -0.65,                         // symmetric-airfoil negative-lift authority
        RollRateMaxRad: 0.65, BankTau: 0.52,
        RollDampingNms: 70000, RollMomentMaxNm: 180000,
        PitchMomentMaxNm: 200000,
        ClBeta: -0.040, ClP: -0.420, ClR: 0.080,
        ClDeltaA: 0.084511274781796, ClDeltaR: 0.027501974166280,
        MaxAileronDeflectionRad: 0.349065850398866, // provisional effective +/-20-deg stop
        MaxRudderDeflectionRad: 0.436332312998582,  // provisional effective +/-25-deg stop
        LateralDerivativeProfileId: "f86f-30-lateral-provisional-v1",
        FightRollRateMaxRad: 2.40,            // legacy bank-tracker cap; physical profile also fits ~140 deg/s
        CompatibilityRollRateMaxRad: 2.1, CompatibilityBankTau: 0.18,
        MCrit: 0.89, WaveDragK: 500.0,        // rapid swept-wing drag rise around M0.86–0.89
        PositiveStructuralLimitG: 7.0,        // T.O. 1F-86F-1 maneuver limit: +7 G
        MaxPerformFraction: 1.0,              // full backstick reaches that +7 G boundary
        MaxThrustFraction: 1.0,               // J47-GE-27: military power, no afterburner
        HighLiftDragOnsetFraction: 0.90,       // buffet/separation rise only in the last 10% of CL
        HighLiftDragK: 12.45,                 // fits ~12 kt/s bleed in a +7 G, 375 kt turn
        WingSpanM: 11.31,                     // 37 ft 1 in; sets differential-wing moment arm
        PropulsionModel: PropulsionModelKind.J47Ge27,
        FuelFreeMassKg: 6900.0 - FuelModel.DefaultFuelLb * 0.45359237);

    /// KOREA 2030s PROXY WAR — balloon-lofted glider strike drone. A BALLOON DRONE, a different
    /// lineage from the powered jet drones: it is a one-way sniper against soft high-value
    /// targets, and it never dogfights anything. NO ENGINE (thrust = 0), so every turn is a
    /// withdrawal from an altitude account you can never pay back into — the game's purest
    /// energy teacher. Silent: no plume, no intake return, which is WHY it reaches an AWACS.
    ///
    /// Sized for MISSION-KILL, not destruction: breaking a rotodome, holing a pressure hull
    /// (forcing descent), or hurting one engine takes a handful of 12.7mm — not a cannon.
    /// That collapses the mass budget (gun 38kg + 50 rds 5kg + wing/pod ~85kg + EO 12kg ≈ 140kg),
    /// and mass is BRUTALLY levered by the balloon: on one 20 m hydrogen balloon, 140kg reaches
    /// 81,000 ft where 1100kg reached only 41,000 ft. 7x lighter bought 40,000 ft and 369 nm of
    /// glide. Recoil stays affordable too: 12.7mm on 140kg = 7 kt/s (a 20mm rotary would be 33).
    /// PLACEHOLDER numbers, derived to the mission not to a real aircraft.
    public static readonly AircraftParams GliderStrike = new(
        MassKg: 140, WingAreaM2: 2.6, ThrustMaxN: 0,
        CD0: 0.0115, InducedK: 0.0284, CLMax: 1.30, CLMin: -0.50,
        RollRateMaxRad: 1.6, BankTau: 0.28,
        MCrit: 0.68, WaveDragK: 190.0,
        // Explicit small-airframe rigid-body and lateral profile. Inheriting the 6.9-tonne
        // Sabre-shaped defaults gave this 140 kg, ~5.8 m-span glider an Ixx of 9,000 kg m2 and
        // made a full aileron step nearly inert. These are provisional geometry-derived values,
        // not a claim about an extant type: Ixx/Iyy/Izz follow a distributed 140 kg wing/pod,
        // while the derivative set gives a naturally damped ~120 deg/s terminal roll rate at the
        // mission's 100 m/s release condition. All authority still scales with q through the
        // ordinary derivative law.
        IxxKgM2: 210.0, IyyKgM2: 140.0, IzzKgM2: 350.0,
        RollStiffnessNmRad: 2000.0, PitchStiffnessNmRad: 1700.0,
        YawStiffnessNmRad: 1200.0,
        RollDampingNms: 800.0, PitchDampingNms: 700.0, YawDampingNms: 700.0,
        RollMomentMaxNm: 1500.0, PitchMomentMaxNm: 1200.0, YawMomentMaxNm: 1000.0,
        ApproachPitchStiffnessNmRad: 1400.0, ApproachPitchMomentMaxNm: 1000.0,
        ClBeta: -0.070, ClP: -0.620, ClR: 0.110,
        ClDeltaA: 0.110, ClDeltaR: 0.020,
        MaxAileronDeflectionRad: 0.349065850398866,
        MaxRudderDeflectionRad: 0.436332312998582,
        LateralDerivativeProfileId: "glider-strike-geometry-provisional-v1",
        YawBetaStiffnessNmRad: 1600.0, RollHoldDampingNms: 600.0,
        WingSpanM: 5.81, // sqrt(AR 13 * 2.6 m2)
        MaxThrustFraction: 0.0);          // no engine and therefore no powered lever range

    /// The KJ-500-class AEW&C: how the PLA sees and coordinates. Enormous, slow, turboprop,
    /// structurally ~2.5G and it cannot dodge. Killing it blinds a strike package worth 100x
    /// the drone that got it — which is the entire cost-exchange thesis in one target.
    public static readonly AircraftParams AwacsTarget = new(
        MassKg: 55000, WingAreaM2: 120.0, ThrustMaxN: 90000,
        CD0: 0.0260, InducedK: 0.045, CLMax: 1.60, CLMin: -0.40,
        RollRateMaxRad: 0.35, BankTau: 2.0,
        MCrit: 0.60, WaveDragK: 90.0,
        MaxThrustFraction: 1.0);

    /// Korea-2030s one-way attack-drone PROTOTYPE. These rounded values define a transparent
    /// mission surrogate, not an extant Chinese or American system: a 500 kg, subsonic powered
    /// airframe that holds one straight inbound track while the player learns defensive cutoff
    /// geometry. It has no speculative sensors, autonomy, datalink, countermeasures, or weapon.
    public static readonly AircraftParams OneWayAttackDronePrototype = new(
        MassKg: 500.0, WingAreaM2: 4.5, ThrustMaxN: 2600.0,
        CD0: 0.030, InducedK: 0.060, CLMax: 1.25, CLMin: -0.45,
        RollRateMaxRad: 1.0, BankTau: 0.55,
        MCrit: 0.72, WaveDragK: 120.0,
        SpoolUpTau: 1.0, SpoolDownTau: 0.7,
        CLAlpha: 4.2,
        IxxKgM2: 650.0, IyyKgM2: 1200.0, IzzKgM2: 1600.0,
        RollStiffnessNmRad: 9000.0, PitchStiffnessNmRad: 15000.0,
        YawStiffnessNmRad: 8500.0,
        RollDampingNms: 4200.0, PitchDampingNms: 7000.0,
        YawDampingNms: 4500.0,
        RollMomentMaxNm: 7000.0, PitchMomentMaxNm: 12000.0,
        YawMomentMaxNm: 6500.0,
        WingSpanM: 5.5,
        PositiveStructuralLimitG: 4.0,
        MaxPerformFraction: 0.8,
        MaxThrustFraction: 1.0);

    /// F-22A PUBLIC-DATA SURROGATE for a visual, guns-only merge. Public anchors are the USAF
    /// fact sheet's 840 ft2 wing, 43,340 lb empty weight, 18,000 lb internal fuel, +9 G limit,
    /// and two engines in the 35,000 lb-thrust class. The military/afterburner split, drag polar,
    /// inertias, control derivatives and fuel-flow anchors below are transparent mission
    /// surrogates, not a claim to an OEM deck, exact modern FLCS or classified data. The public
    /// two-dimensional pitch-thrust-vectoring capability is represented by an explicitly bounded
    /// reduced-order force/moment allocator.
    /// https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104506/f-22-raptor/
    public static readonly AircraftParams F22APublicDataSurrogate = new(
        MassKg: 27700.0,
        WingAreaM2: 78.04,
        ThrustMaxN: 233600.0,
        CD0: 0.0175, InducedK: 0.045, CLMax: 1.50, CLMin: -0.75,
        RollRateMaxRad: 2.8, BankTau: 0.20,
        MCrit: 0.95, WaveDragK: 70.0,
        SpoolUpTau: 1.2, SpoolDownTau: 0.8,
        CLAlpha: 4.8,
        IxxKgM2: 55000.0, IyyKgM2: 280000.0, IzzKgM2: 315000.0,
        RollStiffnessNmRad: 1200000.0, PitchStiffnessNmRad: 3000000.0,
        YawStiffnessNmRad: 900000.0,
        RollDampingNms: 360000.0, PitchDampingNms: 1200000.0,
        YawDampingNms: 520000.0,
        RollMomentMaxNm: 1400000.0, PitchMomentMaxNm: 3400000.0,
        YawMomentMaxNm: 1200000.0,
        ClBeta: -0.055, ClP: -0.48, ClR: 0.10,
        ClDeltaA: 0.105, ClDeltaR: 0.030,
        LateralDerivativeProfileId: "f22a-public-data-surrogate-v1",
        ManualPitchRateMaxRad: 0.85,
        FightRollRateMaxRad: 2.8,
        CompatibilityRollRateMaxRad: 2.8, CompatibilityBankTau: 0.20,
        YawBetaStiffnessNmRad: 800000.0, RollHoldDampingNms: 0.0,
        // FBW bank-hold: the F-22 pilot flies a roll-rate command and the FLCS holds the bank he
        // last set, so a hard pull does not require constant aileron to stay in plane. ~1.8x the
        // full aileron authority per rad/s gives a firm hold that saturates near ~0.55 rad/s of
        // unwanted roll; tune with RollHoldRateGainNms.
        RollHoldRateGainNms: 2_500_000.0,
        PositiveStructuralLimitG: 9.0, MaxPerformFraction: 1.0,
        // Public +9 G remains the normal protected boundary. These are deliberately labelled
        // gameplay-surrogate control laws: they do not claim that an actual F-22 exposes an
        // 11 G pilot switch or this exact alpha schedule. Full ordinary pull gets the useful
        // protected envelope; Space trades protection for a bounded 11 G demand above corner or
        // progressively up to 63 degrees incidence below corner. The continuous polar, drag and
        // rigid-body equations still decide the achieved motion and energy loss.
        NormalPullUsesMaxPerformance: true,
        // 12 G is the labelled gameplay-surrogate emergency ceiling shared by the pilot's
        // envelope-override commit and the Auto-GCAS fly-up authority.
        PositiveOverrideLimitG: 12.0,
        DynamicPressureScheduledPostStallOverride: true,
        MaxThrustFraction: 1.35,
        // NASA identifies +/-20 degrees of F-22 pitch vectoring. The 6.5 m resultant lever arm and
        // gains are labelled gameplay surrogates: nozzle force is physical and thrust-dependent,
        // while the unpublished integrated control allocation is not being guessed as aircraft data.
        PitchThrustVectorMaxRad: 0.349065850398866,
        PitchThrustVectorMomentArmM: 6.5,
        PitchThrustVectorAlphaGain: 0.85,
        PitchThrustVectorRateGainSeconds: 0.12,
        // Gameplay assist, not an F-22 performance claim. Inside a fourteen-degree/1 km ballistic-
        // lead gate it walks the nose onto the lead solution in BOTH axes: up to 17 deg/s of pitch
        // convergence contributing at most 3.5 protected G, plus a bounded roll+rudder lateral pull
        // toward the target's side. The player still has to solve closure, range, and trigger, and
        // the rounds fly the real ballistic arc -- this magnetises the nose, it does not teleport hits.
        GunneryPitchAssistMaxRateRad: 0.30,
        GunneryPitchAssistCaptureAngleRad: 0.244346095279206, // 14 deg
        GunneryPitchAssistMaxRangeM: 1000.0,
        GunneryPitchAssistGainPerSecond: 2.4,
        GunneryPitchAssistMaxCorrectionG: 3.5,
        GunneryLateralAssistRollGain: 2.0,
        GunneryLateralAssistMaxRoll: 0.6,
        GunneryLateralAssistYawGain: 2.0,
        GunneryLateralAssistMaxYaw: 0.5,
        HighLiftDragOnsetFraction: 0.90, HighLiftDragK: 2.8,
        WingSpanM: 13.56, PostStallAlphaCommandRad: 1.10,
        PropulsionModel: PropulsionModelKind.AfterburningTurbofanPublicDataSurrogate,
        FuelFreeMassKg: 19535.0,
        GenericIdleFuelFlowLbPerMinute: 32.0,
        GenericMilitaryFuelFlowLbPerMinute: 250.0,
        GenericAfterburnerFuelFlowLbPerMinute: 650.0);

    /// F-35C PUBLIC-DATA CARRIER SURROGATE. The public anchors are the programme card's
    /// 668 ft2 wing, 34,800 lb empty weight, 19,750 lb internal fuel, 7.5 G limit and
    /// 25,000/40,000 lb military/max uninstalled thrust ratings. The polar, control derivatives,
    /// inertia and fuel-flow values remain rounded reduced-order gameplay surrogates; this is not
    /// an OEM flight-control or approach-performance deck.
    /// https://www.f35.com/content/dam/lockheed-martin/aero/f35/documents/FG21-00000_001F35FastFacts2_2021.pdf
    public static readonly AircraftParams F35CPublicDataCarrierSurrogate = new(
        MassKg: 22000.0,
        WingAreaM2: 62.1,
        ThrustMaxN: 111200.0,
        CD0: 0.021, InducedK: 0.052, CLMax: 1.55, CLMin: -0.68,
        RollRateMaxRad: 2.2, BankTau: 0.25,
        MCrit: 0.92, WaveDragK: 78.0,
        SpoolUpTau: 1.5, SpoolDownTau: 0.9,
        CLAlpha: 4.7,
        IxxKgM2: 72000.0, IyyKgM2: 300000.0, IzzKgM2: 345000.0,
        RollStiffnessNmRad: 1150000.0, PitchStiffnessNmRad: 2850000.0,
        YawStiffnessNmRad: 950000.0,
        RollDampingNms: 390000.0, PitchDampingNms: 1250000.0,
        YawDampingNms: 560000.0,
        RollMomentMaxNm: 1250000.0, PitchMomentMaxNm: 3000000.0,
        YawMomentMaxNm: 1150000.0,
        ApproachPitchStiffnessNmRad: 620000.0,
        ApproachPitchMomentMaxNm: 520000.0,
        ClBeta: -0.058, ClP: -0.49, ClR: 0.10,
        ClDeltaA: 0.098, ClDeltaR: 0.031,
        LateralDerivativeProfileId: "f35c-public-data-carrier-surrogate-v1",
        ManualPitchRateMaxRad: 0.76,
        FightRollRateMaxRad: 2.2,
        CompatibilityRollRateMaxRad: 2.2, CompatibilityBankTau: 0.25,
        YawBetaStiffnessNmRad: 840000.0, RollHoldDampingNms: 0.0,
        // FBW bank-hold, matched to this airframe's aileron authority (see RollHoldRateGainNms).
        RollHoldRateGainNms: 2_200_000.0,
        PositiveStructuralLimitG: 7.5, MaxPerformFraction: 1.0,
        NormalPullUsesMaxPerformance: true,
        MaxThrustFraction: 1.60,
        HighLiftDragOnsetFraction: 0.90, HighLiftDragK: 2.9,
        WingSpanM: 13.1,
        PropulsionModel: PropulsionModelKind.AfterburningTurbofanPublicDataSurrogate,
        FuelFreeMassKg: 15785.0,
        GenericIdleFuelFlowLbPerMinute: 24.0,
        GenericMilitaryFuelFlowLbPerMinute: 175.0,
        GenericAfterburnerFuelFlowLbPerMinute: 460.0);

    /// Su-27S PUBLIC-DATA SURROGATE for the same bounded visual exercise. The Ukrainian state
    /// export catalogue anchors public dimensions, mass, installed gun and engine thrust class.
    /// Aerodynamic/control/fuel coefficients are rounded mission surrogates. No radar, RWR,
    /// datalink, missile, modern FLCS or exact propulsion performance is represented.
    /// https://www.ukrspecexport.com/uploads/files/Categories/pdf_1/a205b8.pdf
    public static readonly AircraftParams Su27SPublicDataSurrogate = new(
        MassKg: 22500.0, // representative visual-merge weight after ingress
        WingAreaM2: 62.0,
        ThrustMaxN: 152400.0,
        CD0: 0.0195, InducedK: 0.050, CLMax: 1.65, CLMin: -0.75,
        RollRateMaxRad: 2.5, BankTau: 0.24,
        MCrit: 0.93, WaveDragK: 80.0,
        SpoolUpTau: 1.4, SpoolDownTau: 0.85,
        CLAlpha: 4.9,
        IxxKgM2: 68000.0, IyyKgM2: 270000.0, IzzKgM2: 320000.0,
        RollStiffnessNmRad: 1100000.0, PitchStiffnessNmRad: 2800000.0,
        YawStiffnessNmRad: 900000.0,
        RollDampingNms: 390000.0, PitchDampingNms: 1150000.0,
        YawDampingNms: 540000.0,
        RollMomentMaxNm: 1300000.0, PitchMomentMaxNm: 3200000.0,
        YawMomentMaxNm: 1200000.0,
        ClBeta: -0.060, ClP: -0.50, ClR: 0.11,
        ClDeltaA: 0.100, ClDeltaR: 0.032,
        LateralDerivativeProfileId: "su27s-public-data-surrogate-v1",
        ManualPitchRateMaxRad: 0.82,
        FightRollRateMaxRad: 2.5,
        CompatibilityRollRateMaxRad: 2.5, CompatibilityBankTau: 0.24,
        YawBetaStiffnessNmRad: 820000.0, RollHoldDampingNms: 0.0,
        // FBW bank-hold, matched to this airframe's aileron authority (see RollHoldRateGainNms).
        RollHoldRateGainNms: 2_400_000.0,
        PositiveStructuralLimitG: 9.0, MaxPerformFraction: 1.0,
        MaxThrustFraction: 1.609,
        HighLiftDragOnsetFraction: 0.90, HighLiftDragK: 3.2,
        WingSpanM: 14.70,
        PropulsionModel: PropulsionModelKind.AfterburningTurbofanPublicDataSurrogate,
        FuelFreeMassKg: 19500.0,
        GenericIdleFuelFlowLbPerMinute: 38.0,
        GenericMilitaryFuelFlowLbPerMinute: 285.0,
        GenericAfterburnerFuelFlowLbPerMinute: 850.0);

    public static double NzAeroMax(in AircraftState s, in AircraftParams p) {
        return NzAeroMax(s, p, s.Speed);
    }
    public static double NzAeroMax(in AircraftState s, in AircraftParams p, double airspeedMps) {
        return NzAeroMax(s, p, airspeedMps, StandardAtmosphere1976.Instance);
    }
    public static double NzAeroMax(in AircraftState s, in AircraftParams p, double airspeedMps,
        IAtmosphereModel atmosphere) {
        ArgumentNullException.ThrowIfNull(atmosphere);
        double speed = ResolveAirspeed(s, airspeedMps);
        double q = 0.5 * atmosphere.Sample(s.Position.Y).DensityKgM3 * speed * speed;
        return q * p.WingAreaM2 * p.CLMax / (s.Mass * G0);
    }
    /// Negative-G aerodynamic bound (a negative number).
    public static double NzAeroMin(in AircraftState s, in AircraftParams p) {
        return NzAeroMin(s, p, s.Speed);
    }
    public static double NzAeroMin(in AircraftState s, in AircraftParams p, double airspeedMps) {
        return NzAeroMin(s, p, airspeedMps, StandardAtmosphere1976.Instance);
    }
    public static double NzAeroMin(in AircraftState s, in AircraftParams p, double airspeedMps,
        IAtmosphereModel atmosphere) {
        ArgumentNullException.ThrowIfNull(atmosphere);
        double speed = ResolveAirspeed(s, airspeedMps);
        double q = 0.5 * atmosphere.Sample(s.Position.Y).DensityKgM3 * speed * speed;
        return q * p.WingAreaM2 * p.CLMin / (s.Mass * G0);
    }

    static double ResolveAirspeed(in AircraftState s, double airspeedMps) =>
        double.IsFinite(airspeedMps) && airspeedMps >= 0.0 ? airspeedMps : s.Speed;

    /// Drag divergence, per airframe. A straight high-AR wing (the glider's, AR~13) diverges
    /// near M0.65-0.70 and HARD — that wing physically cannot go fast, which is why a steep
    /// dive from a 60k balloon drop must be managed rather than pointed. A swept fighter wing
    /// holds to ~M0.85 with a gentler rise. Was a single global 0.85/8.0 every airframe inherited.
    static double MachDragFactor(double mach, in AircraftParams p) =>
        mach < p.MCrit ? 1.0 : 1.0 + p.WaveDragK * (mach - p.MCrit) * (mach - p.MCrit);

    internal static double BankRate(double bank, double target, in AircraftParams p) {
        double err = System.Math.IEEERemainder(target - bank, 2 * System.Math.PI); // shortest-way signed error
        double tau = p.CompatibilityBankTau > 0.0 ? p.CompatibilityBankTau : p.BankTau;
        double rateMax = p.CompatibilityRollRateMaxRad > 0.0 ? p.CompatibilityRollRateMaxRad : p.RollRateMaxRad;
        return System.Math.Clamp(err / tau, -rateMax, rateMax);
    }

    internal static double FightRollRate(in AircraftParams p) =>
        p.FightRollRateMaxRad > 0.0 ? p.FightRollRateMaxRad : p.RollRateMaxRad;

    internal static double AlphaAeroMax(in AircraftParams p) => p.CLMax / p.CLAlpha;
    internal static double AlphaAeroMin(in AircraftParams p) => p.CLMin / p.CLAlpha;
    internal static double PositiveControlLimitG(in AircraftParams p) =>
        double.IsFinite(p.PositiveOverrideLimitG) && p.PositiveOverrideLimitG > 0.0
            ? System.Math.Max(p.PositiveStructuralLimitG, p.PositiveOverrideLimitG)
            : p.PositiveStructuralLimitG;

    /// Continuous whole-wing lift curve. The attached-flow branch is exactly the calibrated
    /// linear curve through CLmax/CLmin. Beyond either break, separated lift decays with incidence
    /// instead of remaining pinned at CLmax forever. There is deliberately no departure switch:
    /// alpha alone selects a point on one continuous force curve.
    internal static double LiftCoefficient(double alpha, in AircraftParams p) {
        double positiveStall = AlphaAeroMax(p);
        double negativeStall = -AlphaAeroMin(p);
        if (alpha >= -negativeStall && alpha <= positiveStall) return p.CLAlpha * alpha;

        double sign = alpha >= 0.0 ? 1.0 : -1.0;
        double stallAlpha = sign > 0.0 ? positiveStall : negativeStall;
        double peak = sign > 0.0 ? p.CLMax : -p.CLMin;
        double incidence = System.Math.Min(System.Math.Abs(alpha), System.Math.PI / 2.0);
        double excess = System.Math.Max(0.0, incidence - stallAlpha);
        // The exponential represents the abrupt loss of attached circulation; cosine takes the
        // remaining normal-force lift smoothly to zero when the chord is broadside to the flow.
        double separated = peak * System.Math.Exp(-excess / 0.45)
            * System.Math.Max(0.0, System.Math.Cos(incidence))
            / System.Math.Max(System.Math.Cos(stallAlpha), 1e-6);
        return sign * separated;
    }

    internal static double SeparationFraction(double alpha, in AircraftParams p) {
        double stall = alpha >= 0.0 ? AlphaAeroMax(p) : -AlphaAeroMin(p);
        double t = System.Math.Clamp((System.Math.Abs(alpha) - stall) / 0.14, 0.0, 1.0);
        return t * t * (3.0 - 2.0 * t); // smoothstep: zero slope at attached and fully separated ends
    }

    // Internal rather than private because decision-support projections must evaluate the exact
    // same polar as the force kernel. A second simplified drag equation produced a plausible-looking
    // sustained-G marker which was wrong by almost one G near the high-lift drag rise.
    internal static double ProfileDragCoefficient(double alpha, double mach, in AircraftParams p) {
        double cl = LiftCoefficient(alpha, p);
        double attached = p.CD0 * MachDragFactor(mach, p) + p.InducedK * cl * cl;
        double stallAlpha = alpha >= 0.0 ? AlphaAeroMax(p) : -AlphaAeroMin(p);
        double peak = alpha >= 0.0 ? p.CLMax : -p.CLMin;
        double highLiftFraction = System.Math.Abs(cl) / System.Math.Max(peak, 1e-6);
        double highLiftExcess = System.Math.Max(0.0,
            highLiftFraction - p.HighLiftDragOnsetFraction);
        attached += p.HighLiftDragK * highLiftExcess * highLiftExcess;
        if (System.Math.Abs(alpha) <= stallAlpha) return attached;

        // Preserve the calibrated drag exactly at the stall break, then grow monotonically toward
        // the broadside separated-flow value. This keeps corner/sustained-G tuning untouched.
        double clAtBreak = alpha >= 0.0 ? p.CLMax : p.CLMin;
        double breakFraction = System.Math.Abs(clAtBreak)
            / System.Math.Max(alpha >= 0.0 ? System.Math.Abs(p.CLMax) : System.Math.Abs(p.CLMin), 1e-6);
        double breakExcess = System.Math.Max(0.0,
            breakFraction - p.HighLiftDragOnsetFraction);
        double breakCd = p.CD0 * MachDragFactor(mach, p) + p.InducedK * clAtBreak * clAtBreak
            + p.HighLiftDragK * breakExcess * breakExcess;
        double incidence = System.Math.Min(System.Math.Abs(alpha), System.Math.PI / 2.0);
        double phase = System.Math.Clamp((incidence - stallAlpha)
            / System.Math.Max(System.Math.PI / 2.0 - stallAlpha, 1e-6), 0.0, 1.0);
        double blend = System.Math.Sin(phase * System.Math.PI / 2.0);
        blend *= blend;
        return breakCd + (System.Math.Max(p.PostStallDragMax, breakCd) - breakCd) * blend;
    }

    internal static StateDeriv Derivatives(in RawState r, in PilotCommand c,
        in AircraftParams p, in Vec3D liftRef, in Vec3D wind, double netThrustN,
        in AirframeAerodynamicState configuration) {
        return Derivatives(r, c, p, liftRef, wind, netThrustN, configuration,
            StandardAtmosphere1976.Instance);
    }

    internal static StateDeriv Derivatives(in RawState r, in PilotCommand c,
        in AircraftParams p, in Vec3D liftRef, in Vec3D wind, double netThrustN,
        in AirframeAerodynamicState configuration, IAtmosphereModel atmosphere) {
        ArgumentNullException.ThrowIfNull(atmosphere);
        // Aerodynamics acts on the AIR, and the air may be moving: true airspeed = ground
        // velocity − wind. Everything aero (dynamic pressure, the lift/drag/thrust frame) is
        // built from vAir; position still integrates GROUND velocity (Newton in the inertial
        // frame — see DPos below). So a gust rotates and scales vAir, the whole force vector
        // rotates and scales with it, and the flight path bumps — turbulence as a disturbance
        // IN the loop, not a shake on top. wind = Zero reproduces still-air flight exactly.
        var vAir = r.Vel - wind;
        double speed = vAir.Length;
        var controlVhat = speed < 1e-9
            ? r.Attitude.Normalized().Rotate(new Vec3D(0, 0, 1))
            : vAir * (1.0 / speed);
        double rho = atmosphere.Sample(r.Pos.Y).DensityKgM3;
        double q = 0.5 * rho * speed * speed;
        var aero = Aerodynamics(r, c, p, wind, netThrustN, configuration, atmosphere);
        var (dAttitude, dRates, rollMomentNm) = RotationalDerivatives(r, c, p, liftRef,
            controlVhat, q, speed, netThrustN, configuration, atmosphere);
        return new StateDeriv(r.Vel, aero.Accel, BankRate(r.Bank, c.BankTarget, p),
            dAttitude, dRates, rollMomentNm);
    }

    internal static AeroResult Aerodynamics(in RawState r, in PilotCommand c,
        in AircraftParams p, in Vec3D wind, double netThrustN,
        in AirframeAerodynamicState configuration) {
        return Aerodynamics(r, c, p, wind, netThrustN, configuration,
            StandardAtmosphere1976.Instance);
    }

    internal static AeroResult Aerodynamics(in RawState r, in PilotCommand c,
        in AircraftParams p, in Vec3D wind, double netThrustN,
        in AirframeAerodynamicState configuration, IAtmosphereModel atmosphere) {
        ArgumentNullException.ThrowIfNull(atmosphere);
        var vAir = r.Vel - wind;
        double speed = vAir.Length;
        var attitude = r.Attitude.Normalized();
        var bodyRight = attitude.Rotate(new Vec3D(1, 0, 0));
        var bodyUp = attitude.Rotate(new Vec3D(0, 1, 0));
        var bodyForward = attitude.Rotate(new Vec3D(0, 0, 1));
        var vhat = speed < 1e-9 ? bodyForward : vAir * (1.0 / speed);
        double alpha = System.Math.Atan2(-vhat.Dot(bodyUp), vhat.Dot(bodyForward));
        double beta = System.Math.Asin(System.Math.Clamp(vhat.Dot(bodyRight), -1.0, 1.0));

        AtmosphericState atmosphericState = atmosphere.Sample(r.Pos.Y);
        double rho = atmosphericState.DensityKgM3;
        double q = 0.5 * rho * speed * speed;
        double attachedConfiguration = 1.0 - SeparationFraction(alpha, p);
        double cl = LiftCoefficient(alpha, p)
            + configuration.LiftCoefficientIncrement * attachedConfiguration;
        double mach = speed / atmosphericState.SpeedOfSoundMps;
        double cd = ProfileDragCoefficient(alpha, mach, p)
                    + configuration.DragCoefficientIncrement
                    + System.Math.Abs(c.Rudder) * 0.15 * p.CD0 + beta * beta * 0.08;
        double liftAccel = q * p.WingAreaM2 * cl / r.Mass;
        double dragAccel = q * p.WingAreaM2 * cd / r.Mass;
        double usableThrustN = System.Math.Max(0.0, netThrustN);
        double thrustAccel = usableThrustN / r.Mass;
        double pitchThrustVectorAngle = PitchThrustVectorAngle(r, c, p, vhat, q,
            configuration);
        double pitchThrustVectorMoment = PitchThrustVectorMoment(
            pitchThrustVectorAngle, usableThrustN, p);

        // Aerodynamic lift and side force stay perpendicular to the relative wind while their
        // orientation comes from the real body axes. Rudder authority retains the tuned jink term.
        var liftPlane = bodyUp - vhat * bodyUp.Dot(vhat);
        var liftDir = liftPlane.Length < 1e-9 ? bodyUp : liftPlane.Normalized();
        var sidePlane = bodyRight - vhat * bodyRight.Dot(vhat);
        var sideDir = sidePlane.Length < 1e-9 ? bodyRight : sidePlane.Normalized();
        double sideAccel = c.Rudder * 0.06 * speed - q * p.WingAreaM2 * p.CYBeta * beta / r.Mass;
        // Positive vector angle is a positive-q (nose-up) control demand. With the nozzles aft of
        // the CG, the corresponding thrust resultant points toward body-down; the lever arm turns
        // that force into the positive pitch moment returned alongside this force evaluation.
        var thrustDirection = bodyForward * System.Math.Cos(pitchThrustVectorAngle)
            - bodyUp * System.Math.Sin(pitchThrustVectorAngle);
        var accel = thrustDirection * thrustAccel - vhat * dragAccel + liftDir * liftAccel
                  + sideDir * sideAccel - new Vec3D(0, G0, 0);
        return new AeroResult(accel, liftDir, vAir, alpha, beta, liftAccel / G0, q,
            pitchThrustVectorAngle, pitchThrustVectorMoment);
    }

    static double PitchThrustVectorAngle(in RawState r, in PilotCommand c,
        in AircraftParams p, in Vec3D vhat, double dynamicPressure,
        in AirframeAerodynamicState configuration) {
        if (p.PitchThrustVectorMaxRad <= 0.0
            || p.PitchThrustVectorMomentArmM <= 0.0
            || p.PitchThrustVectorAlphaGain <= 0.0
            || double.IsFinite(c.CommandedPitchRad))
            return 0.0;

        var attitude = r.Attitude.Normalized();
        var bodyUp = attitude.Rotate(new Vec3D(0, 1, 0));
        var bodyForward = attitude.Rotate(new Vec3D(0, 0, 1));
        double alpha = System.Math.Atan2(-vhat.Dot(bodyUp), vhat.Dot(bodyForward));
        double separation = SeparationFraction(alpha, p);
        if (separation <= 0.0) return 0.0;

        double targetAlpha = TargetAlpha(r, c, p, dynamicPressure, configuration);
        double demand = p.PitchThrustVectorAlphaGain * (targetAlpha - alpha)
            - p.PitchThrustVectorRateGainSeconds * r.BodyRates.Q;
        // The nozzles are integrated into the same alpha/rate loop as the aerodynamic surfaces.
        // Separation schedules them in continuously; attached flight remains bit-for-bit fixed-
        // nozzle until the ordinary controls begin losing effectiveness.
        return System.Math.Clamp(demand, -p.PitchThrustVectorMaxRad,
            p.PitchThrustVectorMaxRad) * separation;
    }

    static double PitchThrustVectorMoment(double angleRad, double netThrustN,
        in AircraftParams p) => netThrustN * p.PitchThrustVectorMomentArmM
            * System.Math.Sin(angleRad);

    static (QuaternionD dAttitude, BodyRates dRates, double rollMomentNm) RotationalDerivatives(in RawState r,
        in PilotCommand c, in AircraftParams p, in Vec3D liftRef, in Vec3D vhat,
        double dynamicPressure, double speed, double netThrustN,
        in AirframeAerodynamicState configuration, IAtmosphereModel atmosphere) {
        var attitude = r.Attitude.Normalized();
        var target = TargetAttitude(r, c, p, liftRef, vhat, dynamicPressure, configuration);
        var error = attitude.Conjugate() * target;
        if (error.W < 0) error = -error;   // shortest rotation
        double vn = System.Math.Sqrt(error.X * error.X + error.Y * error.Y + error.Z * error.Z);
        double scale = vn < 1e-10 ? 2.0 : 2.0 * System.Math.Atan2(vn, error.W) / vn;
        // Quaternion local axes are right/up/forward. Positive aircraft q and p rotate about
        // -right and -forward respectively; positive r rotates about up.
        double errQ = -error.X * scale, errR = error.Y * scale;
        // Roll control is explicitly a BODY-forward-axis error. Extracting roll from the full
        // horizon/flight-frame quaternion made its sign depend on the bank frame near a vertical
        // flight path. Project the desired up axis into the plane normal to the aircraft nose and
        // measure its signed angle from body up toward body right. This has no Euler/gimbal pole:
        // a positive command remains positive p while pointing straight up or straight down.
        var bodyRight = attitude.Rotate(new Vec3D(1, 0, 0));
        var bodyUpForRoll = attitude.Rotate(new Vec3D(0, 1, 0));
        var bodyForwardForRoll = attitude.Rotate(new Vec3D(0, 0, 1));
        var targetUpForRoll = target.Rotate(new Vec3D(0, 1, 0));
        var targetUpPlane = targetUpForRoll
            - bodyForwardForRoll * targetUpForRoll.Dot(bodyForwardForRoll);
        double errP = targetUpPlane.Length < 1e-9
            ? -error.Z * scale
            : System.Math.Atan2(targetUpPlane.Dot(bodyRight),
                targetUpPlane.Dot(bodyUpForRoll));
        var rates = r.BodyRates;
        bool directPitch = double.IsFinite(c.CommandedPitchRad);
        double qCommand = 0.0;
        double alpha = System.Math.Atan2(-vhat.Dot(bodyUpForRoll), vhat.Dot(bodyForwardForRoll));
        double alphaTarget = alpha;
        if (!directPitch) {
            var targetUp = target.Rotate(new Vec3D(0, 1, 0));
            var liftPlane = targetUp - vhat * targetUp.Dot(vhat);
            var targetLift = liftPlane.Length < 1e-9 ? targetUp : liftPlane.Normalized();
            double nz = TargetNz(r, c, p, dynamicPressure, configuration);
            alphaTarget = TargetAlpha(r, c, p, dynamicPressure, configuration);
            // Exact normal-plane curvature feed-forward. At 90 deg AOB targetLift.Y is zero,
            // so a 7 G pull commands about 20 deg/s at 375 kt in the CURRENT bank plane. There is
            // no doctrine attitude or wings-level term in this pitch law.
            qCommand = System.Math.Clamp((nz - targetLift.Y) * G0
                / System.Math.Max(speed, 1e-6),
                -p.ManualPitchRateMaxRad, p.ManualPitchRateMaxRad);
        }
        double pitchStiffness = directPitch ? p.ApproachPitchStiffnessNmRad : p.PitchStiffnessNmRad;
        double pitchMomentMax = directPitch ? p.ApproachPitchMomentMaxNm : p.PitchMomentMaxNm;
        // Legacy doctrine/AI commands retain their bank-attitude controller. Flown controls do not:
        // their rolling moment is generated below from aileron and aerodynamic lateral derivatives.
        double separation = SeparationFraction(alpha, p);
        double rollRateMax = FightRollRate(p);
        double rollHoldBlend = 1.0 - System.Math.Clamp(System.Math.Abs(errP)
            / System.Math.Max(p.RollHoldErrorRad, 1e-6), 0.0, 1.0);
        double rollDamping = p.RollDampingNms + p.RollHoldDampingNms * rollHoldBlend;
        double rollRateCommand = System.Math.Clamp(p.RollStiffnessNmRad * errP / rollDamping,
            -rollRateMax, rollRateMax);
        double rollControlBlend = 1.0 - 0.92 * separation;
        double legacyRollMoment = c.DirectLateralControl ? 0.0
            : System.Math.Clamp(rollDamping * (rollRateCommand - rates.P),
                -p.RollMomentMaxNm, p.RollMomentMaxNm) * rollControlBlend;
        // FREE/FIGHT is direct normal-load control: protected G maps to a CL-limited alpha target;
        // an explicit incidence demand can refocus beyond the break. The same continuous moment
        // loop tracks either target plus required turn rate. Carrier approach keeps its separate
        // finite-pitch attitude tracker unchanged.
        double pitchError = directPitch ? errQ : alphaTarget - alpha;
        double pitchControlBlend = 1.0 - 0.15 * separation;
        double pitchMoment = System.Math.Clamp(pitchStiffness * pitchError
            - p.PitchDampingNms * (rates.Q - qCommand),
            -pitchMomentMax, pitchMomentMax) * pitchControlBlend;
        double stallAlpha = alpha >= 0.0 ? AlphaAeroMax(p) : -AlphaAeroMin(p);
        double pitchBreak = -System.Math.Sign(alpha) * p.StallPitchBreakNm * separation
            * System.Math.Clamp((System.Math.Abs(alpha) - stallAlpha) / 0.25, 0.0, 1.0);
        pitchMoment += pitchBreak;
        double beta = System.Math.Asin(System.Math.Clamp(vhat.Dot(bodyRight), -1.0, 1.0));
        // Positive beta in this body basis means the velocity vector is to the right of the nose,
        // so a positive yaw moment aligns the nose with it and drives beta toward zero. Fade the
        // coordinator out under full manual rudder: intermediate rudder adds to it, full rudder
        // owns the axis, and hands-off maneuvering keeps the ball centered.
        double yawStabilityBlend = 1.0 - 0.88 * separation;
        double coordinatorMoment = p.YawBetaStiffnessNmRad * beta
            * (1.0 - System.Math.Clamp(System.Math.Abs(c.Rudder), 0.0, 1.0));

        // A stalled wing is not one lumped CL. Roll/yaw/beta and rudder change the local incidence
        // seen at each semispan. On the attached positive-slope lift curve that difference damps p;
        // beyond CLmax the negative slope reverses it into autorotation. Differential separated
        // drag then yaws toward the dropped wing. This is evaluated at every RK stage and contains
        // no latch, timer, spin flag, or forced angular rate.
        double span = p.WingSpanM > 0.0 ? p.WingSpanM : System.Math.Sqrt(4.5 * p.WingAreaM2);
        double semispanRate = 0.5 * span / System.Math.Max(speed, 1e-6);
        double differentialAlpha = rates.P * semispanRate
            + 0.35 * rates.R * semispanRate - 0.08 * beta + 0.065 * c.Rudder
            + 0.035 * System.Math.Clamp(c.RollControl, -1.0, 1.0);
        differentialAlpha = System.Math.Clamp(differentialAlpha, -0.20, 0.20);
        double leftAlpha = alpha - differentialAlpha;
        double rightAlpha = alpha + differentialAlpha;
        double localWingSeparation = System.Math.Max(SeparationFraction(leftAlpha, p),
            SeparationFraction(rightAlpha, p));
        double wingSeparation = 0.75 * separation + 0.25 * localWingSeparation;
        double momentScale = dynamicPressure * p.WingAreaM2 * span * 0.25;
        double stalledRollMoment = p.StallRollCoupling * momentScale
            * (LiftCoefficient(leftAlpha, p) - LiftCoefficient(rightAlpha, p)) * wingSeparation;
        double mach = speed / atmosphere.Sample(r.Pos.Y).SpeedOfSoundMps;
        double stalledYawMoment = p.StallYawCoupling * momentScale
            * (ProfileDragCoefficient(rightAlpha, mach, p)
                - ProfileDragCoefficient(leftAlpha, mach, p)) * wingSeparation;
        // In attached flow the manual path is an ordinary derivative model. Full aileron authority
        // therefore scales with q, neutral aileron is exactly zero, and ClP supplies the natural
        // rate damping. As the wing separates, fade this attached circulation out while the local
        // differential-incidence model above fades in continuously.
        double nondimensionalP = System.Math.Clamp(rates.P * span
            / (2.0 * System.Math.Max(speed, 1e-6)), -2.0, 2.0);
        double nondimensionalR = System.Math.Clamp(rates.R * span
            / (2.0 * System.Math.Max(speed, 1e-6)), -2.0, 2.0);
        double pilotAileron = System.Math.Clamp(c.RollControl, -1.0, 1.0)
            * p.MaxAileronDeflectionRad;
        double sasAileron = System.Math.Clamp(c.SasRollControl, -1.0, 1.0)
            * p.MaxAileronDeflectionRad;
        double rudderDeflection = System.Math.Clamp(c.Rudder, -1.0, 1.0)
            * p.MaxRudderDeflectionRad;
        double attachedRollCoefficient = p.ClBeta * beta
            + p.ClP * nondimensionalP + p.ClR * nondimensionalR
            + p.ClDeltaA * System.Math.Clamp(pilotAileron + sasAileron,
                -p.MaxAileronDeflectionRad, p.MaxAileronDeflectionRad)
            + p.ClDeltaR * rudderDeflection;
        double attachedRollMoment = dynamicPressure * p.WingAreaM2 * span
            * attachedRollCoefficient;
        double rollMoment = legacyRollMoment
            + (c.DirectLateralControl ? attachedRollMoment * (1.0 - wingSeparation) : 0.0)
            + stalledRollMoment;
        // Split-flap lift is attached circulation and fades with the same separation state as the
        // symmetric flap increment. Torn structure/catastrophic damage is a distinct persistent
        // asymmetry: retaining it after the wing separates is physical, whereas retaining full
        // flap-lift authority was an accidental post-stall control boost.
        rollMoment += momentScale
            * (configuration.LateralLiftCoefficientDifference * (1.0 - separation)
                + configuration.PersistentLateralLiftCoefficientDifference);
        // Bank-hold augmentation (see AircraftParams.RollHoldRateGainNms). When the pilot centres
        // the stick this drives the flown roll rate to zero, holding the current bank against the
        // drift a hard pull would otherwise induce. It engages only inside the lateral-command
        // deadband (so a deliberate roll retains full authority), fades out with the same wing
        // separation that fades the aileron (so it cannot fight an autorotating departure), and is
        // clamped to the aileron authority. rates.P == 0 contributes exactly zero, so the neutral-
        // stick zero-moment invariant and every zero-gain (non-FBW) airframe are unchanged.
        if (c.DirectLateralControl && p.RollHoldRateGainNms > 0.0) {
            // Stand down whenever EITHER the pilot aileron OR an active stability-augmentation roll
            // (e.g. an Auto-GCAS roll-to-upright, which drives SasRollControl) is commanding roll,
            // so the hold never fights a deliberate or automatic roll -- it only holds a bank the
            // lateral axis is otherwise leaving alone.
            double lateralCommand =
                System.Math.Abs(System.Math.Clamp(c.RollControl, -1.0, 1.0))
                + System.Math.Abs(System.Math.Clamp(c.SasRollControl, -1.0, 1.0));
            double holdEngage = 1.0 - System.Math.Clamp(
                lateralCommand / System.Math.Max(p.RollHoldDeadband, 1e-6), 0.0, 1.0);
            if (holdEngage > 0.0) {
                double holdMoment = System.Math.Clamp(-p.RollHoldRateGainNms * rates.P,
                    -p.RollMomentMaxNm, p.RollMomentMaxNm);
                rollMoment += holdMoment * holdEngage * (1.0 - wingSeparation);
            }
        }
        double meanChord = p.WingAreaM2 / System.Math.Max(span, 1e-6);
        pitchMoment += dynamicPressure * p.WingAreaM2 * meanChord
            * configuration.PitchMomentCoefficientIncrement;
        double pitchThrustVectorAngle = PitchThrustVectorAngle(r, c, p, vhat,
            dynamicPressure, configuration);
        pitchMoment += PitchThrustVectorMoment(pitchThrustVectorAngle,
            System.Math.Max(0.0, netThrustN), p);

        double yawMoment = System.Math.Clamp((p.YawStiffnessNmRad * errR
            - p.YawDampingNms * rates.R + coordinatorMoment) * yawStabilityBlend
            + c.Rudder * p.YawMomentMaxNm * (1.0 - 0.15 * separation)
            + stalledYawMoment,
            -p.YawMomentMaxNm, p.YawMomentMaxNm);

        double pDot = (rollMoment + (p.IyyKgM2 - p.IzzKgM2) * rates.Q * rates.R) / p.IxxKgM2;
        double qDot = (pitchMoment + (p.IzzKgM2 - p.IxxKgM2) * rates.R * rates.P) / p.IyyKgM2;
        double rDot = (yawMoment + (p.IxxKgM2 - p.IyyKgM2) * rates.P * rates.Q) / p.IzzKgM2;
        var omega = new QuaternionD(0, -rates.Q, rates.R, -rates.P);
        return ((attitude * omega) * 0.5, new BodyRates(pDot, qDot, rDot), rollMoment);
    }

    static QuaternionD TargetAttitude(in RawState r, in PilotCommand c, in AircraftParams p,
        in Vec3D liftRef, in Vec3D vhat, double dynamicPressure,
        in AirframeAerodynamicState configuration) {
        if (double.IsFinite(c.CommandedPitchRad)) {
            double chi = System.Math.Atan2(vhat.X, vhat.Z);
            double cp = System.Math.Cos(c.CommandedPitchRad);
            var forwardCmd = new Vec3D(System.Math.Sin(chi) * cp, System.Math.Sin(c.CommandedPitchRad), System.Math.Cos(chi) * cp);
            var up0 = new Vec3D(0, 1, 0) - forwardCmd * forwardCmd.Y;
            up0 = up0.Length < 1e-6 ? liftRef : up0.Normalized();
            var right0 = up0.Cross(forwardCmd).Normalized();
            var upCmd = (up0 * System.Math.Cos(c.BankTarget) + right0 * System.Math.Sin(c.BankTarget)).Normalized();
            return QuaternionD.FromFrame(upCmd.Cross(forwardCmd).Normalized(), upCmd, forwardCmd);
        }

        var lr0 = liftRef - vhat * liftRef.Dot(vhat);
        var upRef = lr0.Length < 1e-6 ? new Vec3D(0, 1, 0) : lr0.Normalized();
        var rightRef = upRef.Cross(vhat).Normalized();
        var lift = (upRef * System.Math.Cos(c.BankTarget) + rightRef * System.Math.Sin(c.BankTarget)).Normalized();
        double alpha = TargetAlpha(r, c, p, dynamicPressure, configuration);
        var forward = (vhat * System.Math.Cos(alpha) + lift * System.Math.Sin(alpha)).Normalized();
        var up = (lift * System.Math.Cos(alpha) - vhat * System.Math.Sin(alpha)).Normalized();
        return QuaternionD.FromFrame(up.Cross(forward).Normalized(), up, forward);
    }

    static double TargetAlpha(in RawState r, in PilotCommand c, in AircraftParams p,
        double dynamicPressure, in AirframeAerodynamicState configuration) {
        double nz = TargetNz(r, c, p, dynamicPressure, configuration);
        double cl = nz * r.Mass * G0 / System.Math.Max(dynamicPressure * p.WingAreaM2, 1e-6);
        double protectedAlpha = System.Math.Clamp(
            (cl - configuration.LiftCoefficientIncrement) / p.CLAlpha,
            AlphaAeroMin(p), AlphaAeroMax(p));
        if (!double.IsFinite(c.CommandedAlphaRad)) return protectedAlpha;

        // The protection/control layer may deliberately demand incidence beyond the lift break.
        // This is an ordinary actuator target, not a physics-mode flag: roll/yaw/force derivatives
        // remain functions of state and physical demands alone.
        return System.Math.Clamp(c.CommandedAlphaRad,
            -System.Math.PI / 2.0, System.Math.PI / 2.0);
    }

    static double TargetNz(in RawState r, in PilotCommand c, in AircraftParams p,
        double dynamicPressure, in AirframeAerodynamicState configuration) {
        double nzMax = System.Math.Min(dynamicPressure * p.WingAreaM2
            * (p.CLMax + configuration.LiftCoefficientIncrement) / (r.Mass * G0),
            PositiveControlLimitG(p));
        double nzMin = System.Math.Max(dynamicPressure * p.WingAreaM2
            * (p.CLMin + configuration.LiftCoefficientIncrement) / (r.Mass * G0), -1.5);
        return System.Math.Clamp(c.GDemand, nzMin, nzMax);
    }

    /// Directional nz clamp shared by Step's reporting (same bounds as Derivatives).
    internal static (double nz, double nzMax, double nzMin) ClampNz(in AircraftState s, in PilotCommand c, in AircraftParams p) {
        return ClampNz(s, c, p, s.Speed);
    }
    internal static (double nz, double nzMax, double nzMin) ClampNz(in AircraftState s,
        in PilotCommand c, in AircraftParams p, double airspeedMps) {
        return ClampNz(s, c, p, airspeedMps, AirframeAerodynamicState.Clean);
    }
    internal static (double nz, double nzMax, double nzMin) ClampNz(in AircraftState s,
        in PilotCommand c, in AircraftParams p, double airspeedMps,
        in AirframeAerodynamicState configuration) {
        return ClampNz(s, c, p, airspeedMps, configuration,
            StandardAtmosphere1976.Instance);
    }
    internal static (double nz, double nzMax, double nzMin) ClampNz(in AircraftState s,
        in PilotCommand c, in AircraftParams p, double airspeedMps,
        in AirframeAerodynamicState configuration, IAtmosphereModel atmosphere) {
        ArgumentNullException.ThrowIfNull(atmosphere);
        double speed = ResolveAirspeed(s, airspeedMps);
        double q = 0.5 * atmosphere.Sample(s.Position.Y).DensityKgM3 * speed * speed;
        double nzMax = System.Math.Min(q * p.WingAreaM2
            * (p.CLMax + configuration.LiftCoefficientIncrement) / (s.Mass * G0),
            PositiveControlLimitG(p));
        double nzMin = System.Math.Max(q * p.WingAreaM2
            * (p.CLMin + configuration.LiftCoefficientIncrement) / (s.Mass * G0), -1.5);
        return (System.Math.Clamp(c.GDemand, nzMin, nzMax), nzMax, nzMin);
    }
}
