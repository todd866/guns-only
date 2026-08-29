using GunsOnly.Sim.Propulsion;

namespace GunsOnly.Sim;

public enum PropulsionModelKind {
    GenericDensityScaled,
    J47Ge27,
    AfterburningTurbofanPublicDataSurrogate,
    /// Fixed-geometry ramjet. NOTE that for this model ThrustMaxN is net thrust at the DESIGN POINT
    /// (see RamjetPerformanceMap), not static sea-level thrust — a ramjet makes none of the latter,
    /// which is exactly why it needs its own model rather than a retuned turbojet.
    RamjetPublicDataSurrogate,
    /// Core-bypass turbo-ramjet. ThrustMaxN is SEA-LEVEL STATIC DRY thrust of the turbine core; the
    /// ram contribution grows continuously with Mach on top of it. See TurboRamjetPerformanceMap for
    /// why this is one curve rather than two engines and a handover.
    TurboRamjetPublicDataSurrogate,
    /// Constant-speed turboprop driven by published shaft power. Net thrust is derived inside the
    /// shared propulsion kernel from shaft power, propeller efficiency and true airspeed, with a
    /// finite static-thrust cap for the low-speed limit. Appended to preserve persisted enum ordinals.
    TurbopropShaftPowerPublicDataSurrogate
}

public enum HighAlphaModelKind {
    Generic,
    F22PublicDataSurrogate
}

public enum AerodynamicModelKind {
    Generic,
    RapierCrankedDeltaPublicDataSurrogate
}

public enum PullLimitReason {
    None,
    AerodynamicClMax,
    Structural,
    TvcSaturated
}

/// <summary>
/// Temperature channel used to turn an authored hot-structure capability into a conservative
/// Mach-screening ceiling. Recovery temperature is appropriate to a turbulent flat skin;
/// stagnation temperature is appropriate to an inlet lip, nose, or unswept leading edge.
/// This selection is not itself an aircraft qualification curve.
/// </summary>
public enum AerothermalLimitReferenceKind {
    RecoveryTemperature,
    StagnationTemperature
}

/// <summary>
/// Session-agnostic flight-control limit annunciation. The shell may present this later; the
/// kernel owns only the physical/control-allocation reason and never pilot physiology.
/// </summary>
public readonly record struct PullLimitStatus(PullLimitReason Reason) {
    public static PullLimitStatus None => new(PullLimitReason.None);
    public bool IsLimited => Reason != PullLimitReason.None;
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
    // Supersonic drag rise beyond the transonic peak. Zero keeps every other airframe
    // exactly as it was; only aircraft that actually go there need it.
    double HighMachDragOnset = double.PositiveInfinity, double HighMachDragK = 0.0,
    /// Mach at which the transonic drag rise stops growing. Infinite (the default) reproduces the
    /// original unbounded quadratic exactly; a supersonic airframe declares its peak so the law
    /// stops charging it more drag the faster it goes.
    double WaveDragPeakMach = double.PositiveInfinity,
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
    // it never fights a commanded roll. The optional attitude gain closes the steady-state error
    // left by a rate-only damper: BankTarget is captured by the input layer when the stick centres,
    // so a standing asymmetric moment cannot create an endless slow drift. Zero gains (the
    // default, and every non-FBW airframe such as the Sabre and balloon glider) preserve the bare
    // aileron path bit-for-bit.
    double RollHoldRateGainNms = 0.0, double RollHoldDeadband = 0.05,
    double RollHoldAttitudeGainNmRad = 0.0,
    // Airframe envelope limits. Defaults preserve the existing unmanned/afterburning aircraft;
    // the F-86 overrides these with its piloted structural limit and dry-thrust-only J47.
    // These control-law fields are explicit gameplay-surrogate policy, not hidden aircraft
    // data: NormalPullUsesMaxPerformance bypasses the teaching detent while retaining the ordinary
    // structural/AoA protection; InstantMaxPerformanceKeyboardPull removes only the input-layer
    // demand lag for airframes whose full back-stick is itself the ordinary protected command;
    // PositiveOverrideLimitG is the actuator-demand ceiling available only through the input
    // layer's deliberate override (negative preserves the structural cap);
    // DynamicPressureScheduledPostStallOverride makes that override a G release above corner and a
    // progressively deeper incidence release below corner instead of commanding one fixed alpha
    // at every speed.
    double PositiveStructuralLimitG = 12.0, double MaxPerformFraction = 0.92,
    bool NormalPullUsesMaxPerformance = false,
    bool InstantMaxPerformanceKeyboardPull = false,
    double PositiveOverrideLimitG = -1.0,
    // A finite value is a hard achieved aerodynamic-load guard. It exists for an airframe whose
    // emergency override must never turn a transient incidence overshoot into healthy sustained
    // 13+ G flight. Infinity preserves every existing force polar bit-for-bit.
    double AbsolutePositiveLoadFactorG = double.PositiveInfinity,
    bool DynamicPressureScheduledPostStallOverride = false,
    double MaxThrustFraction = 1.35,
    // Sustained skin-temperature limit, kelvin. Zero means unlimited, which is right for every
    // aircraft here that cannot reach a speed where kinetic heating binds. For one that can, THIS
    // is the real ceiling — Concorde was held to M2.02 by nose temperature and the SR-71 by
    // compressor inlet temperature, not by thrust. Capping an aircraft by detuning its engine
    // instead is how you end up with an invented number propping up three others.
    double SkinTemperatureLimitK = 0.0,
    // Optional integrated pitch-thrust-vectoring control. Zero preserves an ordinary fixed nozzle.
    // MaxRad is the thrust-force vector limit; MomentArmM is a reduced-order CG-to-resultant-nozzle
    // lever arm. Alpha/rate gains belong to the transparent control-law surrogate, not an OEM law.
    double PitchThrustVectorMaxRad = 0.0, double PitchThrustVectorMomentArmM = 0.0,
    double PitchThrustVectorAlphaGain = 0.0,
    double PitchThrustVectorRateGainSeconds = 0.0,
    double PitchThrustVectorNozzleRateRadPerSecond = 0.0,
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
    HighAlphaModelKind HighAlphaModel = HighAlphaModelKind.Generic,
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
    double GenericAfterburnerFuelFlowLbPerMinute = 0.0,
    /// <summary>
    /// Peak cold-gas RCS body moment (Nm). Zero disables RCS and preserves legacy control moments
    /// bit-for-bit. When positive, aero attitude moments fade with q and thrusters fill the gap.
    /// </summary>
    double ColdGasRcsMaxMomentNm = 0.0,
    /// <summary>Usable cold-gas propellant mass (kg). Zero with a nonzero moment max means empty.</summary>
    double ColdGasRcsGasCapacityKg = 0.0,
    /// <summary>Gas burned by holding full RCS moment for one second.</summary>
    double ColdGasRcsBurnKgPerFullSecond = 0.35,
    // Optional neutral-stick flight-path capture. Default/disabled preserves the legacy 1 G
    // baseline; modern opt-in airframes convert the captured gamma back through the ordinary
    // bank-aware G/AoA law rather than invoking the approach-only absolute-pitch controller.
    FlightPathHoldConfig NeutralFlightPathHold = default,
    /// <summary>
    /// Temperature channel used by mission guidance to screen SkinTemperatureLimitK. Appended to
    /// preserve the long-standing positional AircraftParams constructor contract.
    /// </summary>
    AerothermalLimitReferenceKind AerothermalLimitReference =
        AerothermalLimitReferenceKind.RecoveryTemperature,
    /// <summary>
    /// Apply the linearized thin-airfoil supersonic lift-slope ceiling 4/sqrt(M²-1). This is an
    /// intentionally visible public-theory surrogate for aircraft that operate far beyond
    /// transonic speed; false preserves every legacy airframe bit-for-bit.
    /// </summary>
    bool SupersonicLiftSlopeSchedule = false,
    AerodynamicModelKind AerodynamicModel = AerodynamicModelKind.Generic,
    /// <summary>
    /// Lift-coefficient increment from the landing configuration — flaps and gear down. The
    /// approach is not flown on the clean wing, and deriving an on-speed number from clean CLmax
    /// is the mistake this pair exists to stop: it flatters straight wings and punishes deltas,
    /// which is exactly why an earlier attempt to derive a fleet-wide stabilisation speed from
    /// clean CLmax had to be reverted.
    ///
    /// Zero is the default and reproduces every existing airframe bit-for-bit.
    /// </summary>
    double ApproachFlapCLIncrement = 0.0,
    /// <summary>
    /// On-speed margin over the stall in the landing configuration. 1.14 is the legacy F-86
    /// fixture ratio and is the default so nothing moves for an airframe that has not measured
    /// its own; an aircraft with a real figure declares it and stops inheriting someone else's.
    /// </summary>
    double ApproachStallMargin = 1.14,
    /// <summary>
    /// Displaced lifting-gas volume for a free balloon, in cubic metres. Zero preserves ordinary
    /// aircraft. A positive value adds Archimedean buoyancy rho*V*g to the translational force
    /// balance, so the target finds its density altitude instead of being nailed to a waypoint.
    /// Envelope/gas mass remains part of MassKg; this is volume, not a magic weight cancellation.
    /// </summary>
    double BuoyantVolumeM3 = 0.0,
    /// <summary>
    /// Fraction of the selected recovery/stagnation temperature rise which reaches the binding
    /// integrated zone. One preserves every legacy whole-surface screen. Rapier v2 derives 0.56
    /// from its canonical insulated warm-panel zone, so ceramic leading edges can survive while
    /// ordinary structure still sets a real M4 thermal clock.
    /// </summary>
    double AerothermalAdiabaticRiseFraction = 1.0,
    /// Published shaft-power anchor for the shared turboprop propulsion surrogate. Zero disables
    /// the model-specific calculation and preserves every existing aircraft definition.
    double MaximumShaftPowerW = 0.0,
    /// Effective installed propulsive efficiency. This is a transparent reduced-order fit, not a
    /// propeller map; it is consumed only by TurbopropShaftPowerPublicDataSurrogate.
    double PropellerEfficiency = 0.82,
    /// Finite low-speed thrust limit for the power / airspeed relation.
    double StaticPropellerThrustCapN = 0.0,
    /// Airframe lift coefficient at zero incidence. Zero preserves the historical symmetric polar;
    /// a cambered wing declares its offset here so lift, induced drag, stall incidence and the
    /// protected control law all consume one coefficient authority.
    double ZeroLiftCoefficient = 0.0);

/// Internal integration state: velocity is a Cartesian world vector, so vertical
/// flight is not singular (no division by cos gamma anywhere).
public readonly record struct RawState(Vec3D Pos, Vec3D Vel, double Bank, double Mass,
    QuaternionD Attitude, BodyRates BodyRates);

public readonly record struct StateDeriv(Vec3D DPos, Vec3D DVel, double DBank,
    QuaternionD DAttitude, BodyRates DBodyRates, double RollMomentNm,
    double RcsMomentMagnitudeNm = 0.0);

internal readonly record struct AeroResult(Vec3D Accel, Vec3D LiftDir, Vec3D AirVelocity,
    double Alpha, double Beta, double Nz, double DynamicPressure,
    double PitchThrustVectorAngleRad, double PitchThrustVectorMomentNm,
    double DragForceN);

internal readonly record struct PitchControlAllocation(double DemandMomentNm,
    double AeroMomentNm, double ResidualMomentNm, double TvcMomentCapacityNm,
    double TargetNozzleAngleRad);

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

    /// KOREA 1950-53 — GRUMMAN F9F-2 PANTHER. The aeroplane Armstrong flew on 78 missions with
    /// VF-51 off USS Essex (CV-9), and the reason the carrier beat is a different game from the
    /// Sabre's: a straight thick wing, a centrifugal engine that takes its time, and a deck with
    /// no angle, no mirror and no bolter.
    ///
    /// Dimensions, area, weights, thrust and the sea-level maximum are PUBLIC MEASURED DATA for
    /// the F9F-2 (Osprey Duel 90, "F9F-2 Panther Specification" data box; wing area corroborated
    /// in Ginter, Grumman F9F Panther Part 1, in the passage explaining that the Cougar grew the
    /// wing from 250 to 300 sq ft specifically to hold the Panther's carrier approach speed).
    /// Everything below marked PROVISIONAL is a fit or a scaling from <see cref="Sabre"/>, which
    /// is the right neighbour: same decade, same piloted dry-thrust-only class, already tuned in
    /// this kernel. Deriving from a tuned real contemporary beats deriving from a fictional one.
    ///
    /// WHAT MAKES IT FLY UNLIKE THE SABRE, and why the numbers below are not cosmetic:
    ///   - Draggier and slower on comparable thrust. 575 mph at sea level is documented; against
    ///     25.6 kN and 23.23 m2 that closes at CD0 ~0.0265, versus the Sabre's fitted 0.0166.
    ///   - Straight wing: stalls later in CL and buffets more honestly, so CLMax goes UP, while
    ///     compressibility arrives EARLY -- the drag rise is placed near M0.76, not M0.89.
    ///   - It comes aboard on CLMax, NOT on wing loading. Worth stating because the intuition is
    ///     backwards: at these masses the Panther is the more heavily loaded of the two
    ///     (286 kg/m2 against the Sabre's 257). What buys the approach is the straight wing's
    ///     much higher usable CL -- approach speed scales as sqrt((W/S)/CLmax), and the CL term
    ///     more than pays for the loading. Raise CLMax here and you silently make the deck easy.
    ///   - The engine is the headline. See SpoolUpTau.
    public static readonly AircraftParams F9F2Panther = new(
        MassKg: 6650,                         // clean, full internal fuel, pilot and 4x20 mm load
        WingAreaM2: 23.23,                    // 250 sq ft (measured)
        ThrustMaxN: 25577,                    // P&W J42-P-6, 5,750 lbf SLS (measured)
        CD0: 0.0265,                          // PROVISIONAL fit: closes ~500 kt TAS at sea level
        InducedK: 0.0380,                     // PROVISIONAL: Sabre's fitted 0.045 scaled by AR 4.77 -> 5.78
        CLMax: 1.35,                          // PROVISIONAL: straight wing holds more CL than the swept Sabre's 1.10
        CLMin: -0.65,
        // Roll was never the Panther's party trick, and it should not feel like the Sabre's.
        RollRateMaxRad: 0.55, BankTau: 0.60,
        FightRollRateMaxRad: 1.60,            // PROVISIONAL ~90 deg/s against the Sabre's ~140
        CompatibilityRollRateMaxRad: 1.50, CompatibilityBankTau: 0.22,
        LateralDerivativeProfileId: "f9f2-lateral-provisional-v1",
        CLAlpha: 4.67,                        // 2*pi*AR/(AR+2); AR = span^2/area = 38^2/250 = 5.78
        WingSpanM: 11.58,                     // 38 ft 0 in (measured); folds to 23 ft 5 in on deck
        // Straight, thick, unswept: the drag rise is early and the aeroplane is placarded well
        // below the Sabre's. This is the honest reason a Panther cannot simply dive away.
        MCrit: 0.76, WaveDragK: 420.0,
        HighLiftDragOnsetFraction: 0.88, HighLiftDragK: 10.0,   // PROVISIONAL
        PositiveStructuralLimitG: 6.5,        // PROVISIONAL: no NATOPS-equivalent locator held yet
        MaxPerformFraction: 1.0,
        // No afterburner. Take-off water/alcohol injection raised the J42 from 5,750 to 5,950 lbf
        // (+3.5%) for about 30 seconds from a 22.5-gallon tank -- documented, but it is a
        // time-limited catapult aid, NOT a sustained multiplier. Modelling it as MaxThrustFraction
        // would hand the pilot a permanent 3.5%, which is worse than not modelling it. It needs a
        // time-boxed boost the kernel does not have yet.
        MaxThrustFraction: 1.0,
        // THE CARRIER-BEAT PARAMETER. A centrifugal-flow J42 (a licence-built Nene) does not
        // answer the throttle the way an axial J47 does. On a straight deck there is no bolter:
        // a late wave-off is a decision that has to be paid for by an engine that is still
        // thinking about it. If any single number here decides whether the paddles beat teaches
        // the right lesson, it is this one.
        SpoolUpTau: 4.5, SpoolDownTau: 2.2,   // PROVISIONAL early-centrifugal lag
        // No J42/Nene map exists in this kernel and the J47's axial lapse is the wrong shape for
        // a centrifugal engine, so bind the generic model rather than borrow a misleading curve.
        PropulsionModel: PropulsionModelKind.GenericDensityScaled,
        // 9,909 lb empty + pilot + 4x20 mm ammunition. Internal fuel is 682 US gal, taken at
        // AVGAS density on purpose: Essex-class carriers stocked piston-engine aviation fuel, and
        // early J42-P-4s had to have 3% lubricating oil added to burn it at all. The Panther also
        // drank about four times what the F4Us alongside it did -- fuel is a live pressure on
        // this deck, not scenery.
        FuelFreeMassKg: 4791.0,
        // APPROACH REFERENCE — the one measured number in this airframe's recovery.
        //
        // A pilot's account of the VF-51 carrier pattern (Ginter/Squadron, F9F Panther/Cougar in
        // Action) has gear and flaps down on the downwind and the approach flown at 114 kt, turning
        // in "looking for a roger and cut" — the paddles groove itself, not a handbook figure. It
        // appears twice in the same passage of running prose, independently OCR'd, and both digit
        // groups agree. See docs/airframes/f9f-2-panther/00-sources.md.
        //
        // It is expressed here as the two physical quantities that PRODUCE it rather than as the
        // number itself, so it stays honest when the aircraft is heavy or light: a full-flap
        // increment of 0.50 (which that sources file predicted independently, from the clean CLmax
        // this wing was given) over a 1.18 on-speed margin lands on 114.2 kt at modelled mass —
        // 0.2 kt from the measurement.
        //
        // The alternative the beat used before this — 1.14 x CLEAN stall — gives the Panther
        // 129 kt. Fifteen knots fast is not a detail on a straight deck with no bolter.
        ApproachFlapCLIncrement: 0.50,
        ApproachStallMargin: 1.18);

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

    public const double HighAltitudeBalloonFloatAltitudeM = 33_500.0;
    public const double HighAltitudeBalloonEnvelopeAndPayloadMassKg = 4_500.0;
    public const double HighAltitudeBalloonVolumeM3 = 532_379.0;
    /// Total inertial mass includes lifting gas/flight ballast, which NASA's quoted combined
    /// balloon-and-payload hardware weight does not enumerate. Closing it from the independently
    /// published fixed volume and float altitude makes Archimedes' law the authority.
    public static double HighAltitudeBalloonTotalMassKg =>
        StandardAtmosphere1976.Instance.Sample(HighAltitudeBalloonFloatAltitudeM).DensityKgM3
            * HighAltitudeBalloonVolumeM3;

    /// NASA-scale super-pressure scientific balloon used as Rapier's production intercept target.
    /// The envelope is intentionally a real physical actor rather than the powered glider target
    /// wearing a different label. NASA publishes 532,379 m3 volume, 114.5 m diameter, 68.96 m
    /// height, 4,500 kg hardware mass, and 33.5 km float altitude for this SPB class. The actor's
    /// total inertial mass adds the lifting-gas/ballast residual required by those published facts.
    /// Broadside drag uses that published diameter; Cd=0.47 is the transparent bluff-body
    /// surrogate. Shape, drag and buoyancy therefore agree on what the target is and how it moves.
    /// https://science.nasa.gov/blogs/super-pressure-balloon/2016/04/04/nasas-super-pressure-balloon-by-the-numbers/
    public static readonly AircraftParams HighAltitudeBalloonPublicDataSurrogate = new(
        MassKg: HighAltitudeBalloonTotalMassKg,
        WingAreaM2: System.Math.PI * 57.25 * 57.25,
        ThrustMaxN: 0.0,
        CD0: 0.47,
        InducedK: 0.0,
        CLMax: 0.000001,
        CLMin: -0.000001,
        RollRateMaxRad: 0.02,
        BankTau: 20.0,
        MCrit: 10.0,
        WaveDragK: 0.0,
        CLAlpha: 0.000001,
        IxxKgM2: 4_650_000.0,
        IyyKgM2: 4_650_000.0,
        IzzKgM2: 4_650_000.0,
        RollStiffnessNmRad: 0.0,
        PitchStiffnessNmRad: 0.0,
        YawStiffnessNmRad: 0.0,
        // Numerically finite passive rotational damping; zero control-moment ceilings below still
        // prevent the envelope from behaving like an aeroplane or responding to combat guidance.
        RollDampingNms: 1.0,
        PitchDampingNms: 1.0,
        YawDampingNms: 1.0,
        RollMomentMaxNm: 0.0,
        PitchMomentMaxNm: 0.0,
        YawMomentMaxNm: 0.0,
        CYBeta: 0.0,
        WingSpanM: 114.5,
        PositiveStructuralLimitG: 1.2,
        MaxPerformFraction: 0.0,
        MaxThrustFraction: 0.0,
        FuelFreeMassKg: HighAltitudeBalloonTotalMassKg,
        BuoyantVolumeM3: HighAltitudeBalloonVolumeM3);

    public const double RapierGalleryBalloonFloatAltitudeM = 13_716.0;
    public static double RapierGalleryBalloonVolumeM3 =>
        HighAltitudeBalloonTotalMassKg
        / StandardAtmosphere1976.Instance.Sample(
            RapierGalleryBalloonFloatAltitudeM).DensityKgM3;
    /// Same sourced envelope/target presentation, ballasted for the production training lane.
    /// The previous card moved the 33.5 km float actor without changing its
    /// buoyancy, so it immediately climbed back toward FL1100 and made the nominal 35 NM intercept
    /// another long chase. This mission-specific surrogate is neutrally buoyant at the authored
    /// 45,000 ft lane while retaining the same mass, drag, damage sphere and visual identity.
    public static readonly AircraftParams RapierGalleryBalloonSurrogate =
        HighAltitudeBalloonPublicDataSurrogate with {
            BuoyantVolumeM3 = RapierGalleryBalloonVolumeM3
        };

    /// The KJ-500-class AEW&C: how the PLA sees and coordinates. Enormous, slow, turboprop,
    /// structurally ~2.5G and it cannot dodge. Killing it blinds a strike package worth 100x
    /// the drone that got it — which is the entire cost-exchange thesis in one target.
    public static readonly AircraftParams AwacsTarget = new(
        MassKg: 55000, WingAreaM2: 120.0, ThrustMaxN: 90000,
        CD0: 0.0260, InducedK: 0.045, CLMax: 1.60, CLMin: -0.40,
        RollRateMaxRad: 0.35, BankTau: 2.0,
        MCrit: 0.60, WaveDragK: 90.0,
        MaxThrustFraction: 1.0);

    /// Fictional twin-jet transport target for the Rapier operations deck. This is a transparent
    /// target surrogate, not a claim about a named civil or military type: large, subsonic,
    /// lightly manoeuvring, and visually distinct from the fighter-family compatibility body.
    public static readonly AircraftParams TransportTargetPrototype = new(
        MassKg: 68000.0, WingAreaM2: 125.0, ThrustMaxN: 240000.0,
        CD0: 0.024, InducedK: 0.044, CLMax: 1.55, CLMin: -0.35,
        RollRateMaxRad: 0.28, BankTau: 2.4,
        MCrit: 0.78, WaveDragK: 105.0,
        PositiveStructuralLimitG: 2.5,
        MaxPerformFraction: 0.85,
        MaxThrustFraction: 1.0);

    /// Fictional one-way attack-drone PROTOTYPE. These rounded values define a transparent
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

    /// Rapier reusable gun-drone PUBLIC-DATA SURROGATE (vertical slice).
    ///
    /// Energy-glider with a cheap turbine and a gun: released from Rapier, rides inherited kinetic
    /// energy into the fight, then lights a small turbojet for loiter / RTB to intermittent pickup.
    /// Masses and the 1.8 kN thrust card are transparent mission surrogates — not an extant type.
    /// Spec: docs/superpowers/specs/2026-07-27-rapier-glide-drone-vertical-slice-design.md
    public static readonly AircraftParams RapierGunDroneSurrogate = new(
        MassKg: 360.0,                        // 280 kg fuel-free + 80 kg fuel
        WingAreaM2: 4.0,
        ThrustMaxN: 1800.0,                   // small turbojet when armed; AI holds lever at 0 until gate
        CD0: 0.024,
        InducedK: 0.055,
        CLMax: 1.35,
        CLMin: -0.55,
        RollRateMaxRad: 2.2,
        BankTau: 0.32,
        MCrit: 0.78,
        WaveDragK: 100.0,
        SpoolUpTau: 0.9,
        SpoolDownTau: 0.55,
        CLAlpha: 4.4,
        IxxKgM2: 420.0,
        IyyKgM2: 780.0,
        IzzKgM2: 980.0,
        RollStiffnessNmRad: 12_000.0,
        PitchStiffnessNmRad: 16_000.0,
        YawStiffnessNmRad: 11_000.0,
        RollDampingNms: 5_000.0,
        PitchDampingNms: 7_500.0,
        YawDampingNms: 5_500.0,
        RollMomentMaxNm: 9_000.0,
        PitchMomentMaxNm: 14_000.0,
        YawMomentMaxNm: 8_000.0,
        WingSpanM: 5.5,
        PositiveStructuralLimitG: 6.0,
        MaxPerformFraction: 0.9,
        MaxThrustFraction: 1.0,
        SkinTemperatureLimitK: 593.15,        // 320 C cheap structure
        FuelFreeMassKg: 280.0);

    /// F-22A PUBLIC-DATA SURROGATE for a visual, guns-only merge. Public anchors are the USAF
    /// fact sheet's 840 ft2 wing, 43,340 lb empty weight, 18,000 lb internal fuel, +9 G limit,
    /// and two engines in the 35,000 lb-thrust class. The military/afterburner split, drag polar,
    /// inertias, control derivatives and fuel-flow anchors below are transparent mission
    /// surrogates, not a claim to an OEM deck, exact modern FLCS or classified data. The public
    /// two-dimensional pitch-thrust-vectoring capability is represented by an explicitly bounded
    /// reduced-order force/moment allocator.
    /// https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104506/f-22-raptor/

    /// CHEAP HIGH-ALTITUDE INTERCEPTOR PUBLIC-DATA SURROGATE.
    ///
    /// This represents a recoverable, crewed, gun-armed aircraft built around one approximately
    /// 4 kN cruise-missile-class dry engine. It is deliberately a high-subsonic aircraft: gravity,
    /// not installed thrust or afterburning, buys its brief transonic attack condition.
    ///
    /// Mass, polar, inertias, derivatives, engine lapse and fuel flow are transparent mission
    /// surrogates, not claims about an extant aircraft or an OEM engine deck. The existing
    /// AfterburningTurbofanPublicDataSurrogate lapse is used because it is the least-wrong checked-in
    /// approximation for a small F107/F112-class engine at altitude. MaxThrustFraction = 1.0 means
    /// this aircraft has no afterburner.
    public static readonly AircraftParams CheapRapierPublicDataSurrogate = new(
        MassKg: 2100.0,                       // 1,450 kg fuel-free + 650 kg internal fuel
        WingAreaM2: 8.20,                     // 256 kg/m2 at takeoff: cruise wins over low-speed G
        ThrustMaxN: 4000.0,                   // one upper-F107/F112-class dry engine surrogate
        CD0: 0.0210,                          // clean internal stores, but not boutique VLO finish
        InducedK: 0.0750,                     // AR 5.2, effective span efficiency about 0.82
        CLMax: 1.25,                          // simple clean wing; no expensive combat high-lift system
        CLMin: -0.60,
        RollRateMaxRad: 2.60,
        BankTau: 0.24,

        // Thin moderately swept high-subsonic wing. The rise is intentionally strong enough that
        // level flight stops near M0.85 and a powered dive only pushes briefly through M1.
        MCrit: 0.82,
        WaveDragK: 85.0,

        // Small rotating group responds faster than a large fighter turbofan, but does not teleport.
        SpoolUpTau: 1.20,
        SpoolDownTau: 0.70,
        CLAlpha: 4.50,

        PitchModeFreq: 3.6,
        PitchModeDamp: 0.48,
        YawModeFreq: 1.8,
        YawModeDamp: 0.28,
        RollModeFreq: 4.8,
        RollModeDamp: 0.72,
        BuffetGain: 0.45,

        // Geometry-derived provisional inertias for a roughly 7.5 m long, 6.5 m span, 2.1 t jet.
        // These prevent the small aircraft from inheriting multi-tonne-fighter default inertias.
        IxxKgM2: 3300.0,
        IyyKgM2: 9000.0,
        IzzKgM2: 11500.0,

        // Explicit reduced-order FBW attitude demand and damping moments, scaled from airframe size.
        RollStiffnessNmRad: 95000.0,
        PitchStiffnessNmRad: 240000.0,
        YawStiffnessNmRad: 70000.0,
        RollDampingNms: 30000.0,
        PitchDampingNms: 95000.0,
        YawDampingNms: 42000.0,
        RollMomentMaxNm: 110000.0,
        PitchMomentMaxNm: 260000.0,
        YawMomentMaxNm: 90000.0,
        ApproachPitchStiffnessNmRad: 190000.0,
        ApproachPitchMomentMaxNm: 190000.0,

        CYBeta: 0.60,

        // Provisional attached-flow derivative set for a moderately swept, naturally stable wing.
        ClBeta: -0.050,
        ClP: -0.500,
        ClR: 0.090,
        ClDeltaA: 0.120,
        ClDeltaR: 0.026,
        MaxAileronDeflectionRad: 0.349065850398866, // +/-20 deg effective stop
        MaxRudderDeflectionRad: 0.436332312998582,  // +/-25 deg effective stop
        LateralDerivativeProfileId:
            "cheap-high-altitude-interceptor-public-data-surrogate-v1",

        ManualPitchRateMaxRad: 0.75,
        ManualPitchAngleTau: 0.48,
        FightRollRateMaxRad: 3.00,
        CompatibilityRollRateMaxRad: 2.40,
        CompatibilityBankTau: 0.24,

        YawBetaStiffnessNmRad: 65000.0,
        RollHoldDampingNms: 30000.0,
        RollHoldErrorRad: 0.10,

        // AI/FBW bank hold, bounded by the declared aileron authority.
        RollHoldRateGainNms: 200000.0,
        RollHoldDeadband: 0.05,

        // Twelve G is already expensive for a reusable crewed composite structure. Twenty G would
        // require roughly a 30 G ultimate-load article under a conventional 1.5 safety factor and
        // would contradict "cheap first." Full pull reaches the honest structural boundary.
        PositiveStructuralLimitG: 12.0,
        MaxPerformFraction: 1.0,
        NormalPullUsesMaxPerformance: true,
        PositiveOverrideLimitG: -1.0,
        DynamicPressureScheduledPostStallOverride: false,

        MaxThrustFraction: 1.0,                // dry thrust only; no afterburner

        // Fixed nozzle: TVC would add hot actuators, mass, maintenance and cost.
        PitchThrustVectorMaxRad: 0.0,
        PitchThrustVectorMomentArmM: 0.0,
        PitchThrustVectorAlphaGain: 0.0,
        PitchThrustVectorRateGainSeconds: 0.0,
        PitchThrustVectorNozzleRateRadPerSecond: 0.0,

        // Explicit gameplay-surrogate gun director. It corrects aim inside a narrow gate but does
        // not create lift, thrust, closure or hits; a zeroed set may be substituted independently
        // if the aircraft is introduced before its sensor/assist package.
        GunneryPitchAssistMaxRateRad: 0.24,
        GunneryPitchAssistCaptureAngleRad: 0.209439510239320, // 12 deg
        GunneryPitchAssistMaxRangeM: 900.0,
        GunneryPitchAssistGainPerSecond: 2.0,
        GunneryPitchAssistMaxCorrectionG: 2.0,
        GunneryLateralAssistRollGain: 1.8,
        GunneryLateralAssistMaxRoll: 0.50,
        GunneryLateralAssistYawGain: 1.6,
        GunneryLateralAssistMaxYaw: 0.35,

        // Separation drag closes the energy bill near CLmax; this is not a sustained-turn aircraft.
        HighLiftDragOnsetFraction: 0.90,
        HighLiftDragK: 3.50,

        WingSpanM: 6.53,                       // sqrt(AR 5.2 * 8.2 m2)
        PostStallAlphaCommandRad: 0.50,
        PostStallDragMax: 0.95,
        StallRollCoupling: 0.16,
        StallYawCoupling: 0.25,
        StallPitchBreakNm: 20000.0,
        HighAlphaModel: HighAlphaModelKind.Generic,

        // F107/F112 are small turbofans, not turbojets. This existing map has the closest
        // high-altitude lapse, while the 1.0 lever stop positively prevents afterburning.
        PropulsionModel:
            PropulsionModelKind.AfterburningTurbofanPublicDataSurrogate,

        FuelFreeMassKg: 1450.0,

        // Effective mission anchors, not an OEM deck. The generic model does not vary fuel flow
        // with altitude, so range remains provisional until a small-engine performance map exists.
        GenericIdleFuelFlowLbPerMinute: 0.80,
        GenericMilitaryFuelFlowLbPerMinute: 6.00,
        GenericAfterburnerFuelFlowLbPerMinute: 0.00);

    /// Rapier v2 is a gun-only balloon interceptor. The legacy drone bay is deleted, not hidden.
    public const int RapierDesignGunDroneCount = 0;

    public static double RapierDesignStowedGunDroneMassKg =>
        RapierDesignGunDroneCount * RapierGunDroneSurrogate.MassKg;

    /// Fuel-free mass comes from the canonical shape-first mass model.
    public static double RapierAirframeFuelFreeMassKg => RapierV2Design.EmptyMassKg;

    /// RAPIER v2 — a fictional, shape-known Mach-4.2 balloon interceptor. The canonical exterior,
    /// mass properties, inlet, drag closure, thermal zones and fixed-site requirements live in
    /// airframes/rapier.v2.json and its deterministic engineering artifact. This reduced-order
    /// runtime binds to those values; it does not maintain a second aircraft on the side.
    ///
    /// The aircraft is catapult-launched, climbs before accelerating, makes one internal-gun pass,
    /// and recovers on 3,048 m of runway using midpoint arresting gear. SiC/SiC protects local hot
    /// edges, while the ordinary insulated warm-panel zone is the binding M4 thermal clock.
    public static readonly AircraftParams RapierPublicDataSurrogate = new(
        MassKg: RapierV2Design.GrossMassKg,
        WingAreaM2: RapierV2Design.ReferenceAreaM2,
        // Sea-level static turbine-core rating; the canonical inlet supplies the high-Mach stream.
        ThrustMaxN: RapierV2Design.SeaLevelStaticDryThrustN,
        // The runtime's transonic multiplier equals 1.6348 at M4.2, so its base coefficient is
        // backed out from the canonical design-point zero-lift drag rather than independently fit.
        CD0: RapierV2Design.DesignPointZeroLiftDragCoefficient
            / (1.0 + 12.0 * System.Math.Pow(1.18 - 0.95, 2.0)),
        InducedK: RapierV2Design.ReducedOrderInducedDragK,
        CLMax: 1.35, CLMin: -0.55,
        RollRateMaxRad: 2.60, BankTau: 0.22,
        MCrit: 0.95, WaveDragK: 12.0, WaveDragPeakMach: 1.18,
        // The canonical artifact closes M4.2 directly. Do not add a second top-speed schedule.
        HighMachDragOnset: RapierV2Design.DesignMach, HighMachDragK: 0.25,
        SpoolUpTau: 1.40, SpoolDownTau: 0.90,
        CLAlpha: RapierV2Design.LowSpeedLiftCurveSlopePerRad,
        PitchModeFreq: 3.4, PitchModeDamp: 0.46,
        YawModeFreq: 1.7, YawModeDamp: 0.26,
        RollModeFreq: 4.4, RollModeDamp: 0.70,
        BuffetGain: 0.45,
        IxxKgM2: RapierV2Design.RollInertiaKgM2,
        IyyKgM2: RapierV2Design.PitchInertiaKgM2,
        IzzKgM2: RapierV2Design.YawInertiaKgM2,
        RollStiffnessNmRad: 320_000.0, PitchStiffnessNmRad: 900_000.0,
        YawStiffnessNmRad: 260_000.0,
        RollDampingNms: 105_000.0, PitchDampingNms: 380_000.0, YawDampingNms: 160_000.0,
        RollMomentMaxNm: 380_000.0, PitchMomentMaxNm: 980_000.0, YawMomentMaxNm: 320_000.0,
        ApproachPitchStiffnessNmRad: 700_000.0, ApproachPitchMomentMaxNm: 700_000.0,
        CYBeta: 0.60,
        ClBeta: -0.048, ClP: -0.480, ClR: 0.085,
        ClDeltaA: 0.135, ClDeltaR: 0.026,
        LateralDerivativeProfileId: "rapier-shape-first-v2",
        ManualPitchRateMaxRad: 0.70, ManualPitchAngleTau: 0.50,
        FightRollRateMaxRad: 2.90,
        CompatibilityRollRateMaxRad: 2.40, CompatibilityBankTau: 0.22,
        YawBetaStiffnessNmRad: 240_000.0, RollHoldDampingNms: 0.0,
        // AUTOMATION IS WHAT MAKES THIS FLYABLE ON A KEYBOARD, and it is also the fiction: the
        // occupant is reclined behind no windscreen issuing coarse intent while the machine does the
        // fine control. A firm bank hold is the single biggest contributor to that — the pilot sets
        // a bank and the aircraft keeps it through a hard pull without constant correction.
        RollHoldRateGainNms: 1_200_000.0, RollHoldDeadband: 0.05,
        RollHoldAttitudeGainNmRad: 1_200_000.0,
        // Neutral pitch captures the body nose attitude and translates its error through protected
        // G/AoA control. Gravity feed-forward at a 36-degree zoom is cos(36)=0.81 G rather than the
        // old 1 G, while attitude feedback prevents speed/AoA changes wandering the nose. Signed
        // bank compensation also gives the correct negative-G trim inverted.
        NeutralFlightPathHold: FlightPathHoldConfig.Rapier,
        // A long, hot interceptor is not a 12-G dogfighter. Aerodynamics bind first in the dash.
        PositiveStructuralLimitG: 6.5, MaxPerformFraction: 1.0,
        NormalPullUsesMaxPerformance: true,
        PositiveOverrideLimitG: 6.5,
        DynamicPressureScheduledPostStallOverride: true,
        // Travel above MIL augments only the turbine stream; inlet-owned ram thrust is never scaled.
        MaxThrustFraction: RapierV2Design.MaximumAugmentedThrustRatio,
        // CMC survives at the nose and inlet, but the binding integrated warm panel is much cooler.
        SkinTemperatureLimitK: RapierV2Design.BindingThermalLimitK,
        AerothermalLimitReference: RapierV2Design.BindingThermalReference,
        // No thrust vectoring: hot actuators, mass, maintenance and cost.
        PitchThrustVectorMaxRad: 0.0, PitchThrustVectorMomentArmM: 0.0,
        PitchThrustVectorAlphaGain: 0.0, PitchThrustVectorRateGainSeconds: 0.0,
        PitchThrustVectorNozzleRateRadPerSecond: 0.0,
        // Cold-gas RCS for exo coast: elevons die when q collapses; same stick drives thrusters.
        // ~40 kg peroxide-class budget is enough for a few attitude corrections per lob, not a
        // free-flying spaceplane session.
        ColdGasRcsMaxMomentNm: 220_000.0,
        ColdGasRcsGasCapacityKg: 40.0,
        ColdGasRcsBurnKgPerFullSecond: 0.40,
        // The gun director is the other half of "flyable on a keyboard". It corrects aim inside a
        // narrow gate; it never creates lift, thrust, closure or hits.
        GunneryPitchAssistMaxRateRad: 0.26,
        GunneryPitchAssistCaptureAngleRad: 0.209439510239320,
        GunneryPitchAssistMaxRangeM: 900.0,
        GunneryPitchAssistGainPerSecond: 2.2,
        GunneryPitchAssistMaxCorrectionG: 2.5,
        GunneryLateralAssistRollGain: 1.9,
        GunneryLateralAssistMaxRoll: 0.55,
        GunneryLateralAssistYawGain: 1.6,
        GunneryLateralAssistMaxYaw: 0.35,
        HighLiftDragOnsetFraction: 0.88, HighLiftDragK: 3.80,
        WingSpanM: RapierV2Design.SpanM,
        PostStallAlphaCommandRad: 0.42,
        PostStallDragMax: 0.95,
        StallRollCoupling: 0.18, StallYawCoupling: 0.28,
        StallPitchBreakNm: 60_000.0,
        HighAlphaModel: HighAlphaModelKind.Generic,
        PropulsionModel: PropulsionModelKind.TurboRamjetPublicDataSurrogate,
        FuelFreeMassKg: RapierV2Design.EmptyMassKg,
        GenericIdleFuelFlowLbPerMinute: RapierV2Design.IdleFuelFlowLbPerMinute,
        GenericMilitaryFuelFlowLbPerMinute: RapierV2Design.MilitaryFuelFlowLbPerMinute,
        GenericAfterburnerFuelFlowLbPerMinute: RapierV2Design.AugmentedFuelFlowLbPerMinute,
        SupersonicLiftSlopeSchedule: true,
        AerodynamicModel: AerodynamicModelKind.RapierCrankedDeltaPublicDataSurrogate,
        // Keep the scheduler on the same full-droop lift increment as AirframeSystemsProfile;
        // the earlier 0.18 guidance-only value disagreed with the 0.26 force-model configuration.
        ApproachFlapCLIncrement: 0.26,
        ApproachStallMargin: 1.18,
        AerothermalAdiabaticRiseFraction: RapierV2Design.BindingThermalRiseFraction);

    public static readonly AircraftParams F22APublicDataSurrogate = new(
        MassKg: 27700.0,
        WingAreaM2: 78.04,
        ThrustMaxN: 233600.0,
        CD0: 0.0175, InducedK: 0.045, CLMax: 1.50, CLMin: -0.75,
        RollRateMaxRad: 2.8, BankTau: 0.20,
        // The quadratic is only the transonic rise. Letting it grow past that rise walled this
        // explicitly supersonic airframe at M1.20 in MIL / M1.24 in full augmentation at FL450.
        // Holding the peak at M1.11 preserves the original polar through the rise, then restores
        // the public-data fit targets: >M1.5 dry supercruise and Mach-two-class augmented flight.
        MCrit: 0.95, WaveDragK: 70.0, WaveDragPeakMach: 1.11,
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
        // Flight-tested (Build 73 pilot report): 0.105 gave a steady 116 deg/s at 350 KCAS —
        // sluggish for a reversal in a Raptor-class surrogate. 0.155 puts the derivative-law
        // steady state near 170 deg/s at combat speed, tapering through the same alpha schedule.
        // A labelled surrogate feel number, not an OEM derivative claim.
        ClDeltaA: 0.155, ClDeltaR: 0.030,
        LateralDerivativeProfileId: "f22a-public-data-surrogate-v2",
        ManualPitchRateMaxRad: 0.85,
        FightRollRateMaxRad: 3.8,
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
        // Provisional reduced-order actuator rate: the public record supports +/-20 deg travel,
        // not an exact production nozzle transient. It is explicit so the allocator cannot
        // teleport the resultant through its full range in one 120 Hz tick.
        PitchThrustVectorNozzleRateRadPerSecond: 1.047197551196598, // 60 deg/s
        // Gameplay assist, not an F-22 performance claim. Inside a fourteen-degree/1.05 km ballistic-
        // lead gate it walks the nose onto the lead solution in BOTH axes: up to 17 deg/s of pitch
        // convergence contributing at most 3.5 protected G. Keep lateral control with the pilot:
        // tape 415 caught the old hidden roll assist opposing the commanded bank and rocking.
        // The player still has to solve closure, range, and trigger, and the rounds fly the real
        // ballistic arc -- this magnetises the nose, it does not teleport hits.
        GunneryPitchAssistMaxRateRad: 0.30,
        GunneryPitchAssistCaptureAngleRad: 0.244346095279206, // 14 deg
        // Tape 452 held a settled 1.65-degree captured lift-axis miss for five seconds at
        // 1.50-1.57 km, but the 1.50 km acquisition shoulder dropped the director before the
        // harness could finish the conversion. A five-percent range increase moves that existing
        // 1.5x shoulder to 1.575 km; it does not widen the ballistic cone or authorize firing.
        GunneryPitchAssistMaxRangeM: 1050.0,
        GunneryPitchAssistGainPerSecond: 2.4,
        GunneryPitchAssistMaxCorrectionG: 3.5,
        GunneryLateralAssistRollGain: 0.0,
        GunneryLateralAssistMaxRoll: 0.0,
        GunneryLateralAssistYawGain: 0.0,
        GunneryLateralAssistMaxYaw: 0.0,
        HighLiftDragOnsetFraction: 0.90, HighLiftDragK: 2.8,
        WingSpanM: 13.56, PostStallAlphaCommandRad: 1.10,
        // F-22 HIGH-ALPHA CONTAINMENT (docs/f22-high-alpha-review.md). These explicit provisional
        // values prevent this departure-resistant surrogate from inheriting the F-86-shaped
        // differential-wing autorotation and pitch break. Real beta, body rates, damage and
        // thrust asymmetry remain available disturbances. PostStallDragMax is stated explicitly
        // until the F-22-only body-axis CN/CA schedule below owns separated-flow forces.
        PostStallDragMax: 0.90,
        StallRollCoupling: 0.0,
        StallYawCoupling: 0.0,
        StallPitchBreakNm: 0.0,
        HighAlphaModel: HighAlphaModelKind.F22PublicDataSurrogate,
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

    /// Su-35S PUBLIC-DATA SURROGATE for the Ace rung of the same visual-merge exercise. This is
    /// deliberately the Su-27S surrogate with a small, reviewable delta set, not a guessed OEM
    /// flight model: UAC publishes two 117S engines at 8,800 kgf dry / 14,500 kgf special
    /// afterburner thrust and describes the type as a deep Su-27 modernization with improved
    /// maneuverability. Holding the Su-27S thrust lever range makes a 16% base-thrust increase
    /// land at about 284 kN total maximum thrust, matching that public full-afterburner class.
    /// Roll response is only six percent stronger/faster; every polar, lift, mass, inertia,
    /// structural, drag, fuel, and systems limitation otherwise remains the Su-27S surrogate.
    /// https://uacrussia.ru/en/aircraft/lineup/military/su-35/
    /// Uncrewed post-Ace opponent airframe (docs/robot-airframe-design.md): a labelled
    /// gameplay surrogate in the X-47 class, no OEM performance claim. No pilot aboard, so the
    /// airframe — not physiology — sets the G boundary (15 G structural). Identity: generous
    /// CLMax reaches a corner no crewed jet can ride, but a drone trades engine for
    /// expendability — thrust class far below the F-22 — so it CANNOT sustain the corner it can
    /// reach: hard turning melts its energy through the same continuous polar as everyone else.
    /// The counter is energy fighting, never rate fighting.
    public static readonly AircraftParams UcavInterceptorSurrogate =
        F22APublicDataSurrogate with {
            MassKg = 12500.0,
            WingAreaM2 = 58.0,
            ThrustMaxN = 72000.0,
            MaxThrustFraction = 1.0,          // no afterburner class on the drone surrogate
            CD0 = 0.0160,
            // 1.95 is the DECLARED polar doing all the work: with the generic high-alpha model
            // (no F-22 LEF bonus) this is what buys the 15 G corner — and the induced drag of
            // riding it is what melts the drone's energy. Tuned against the duel-harness
            // balance gate (machine must out-solution the Ace vs the reference player).
            CLMax = 1.95,
            FuelFreeMassKg = 11000.0,
            PositiveStructuralLimitG = 15.0,
            PositiveOverrideLimitG = 15.0,    // no crew: no separate emergency tier
            IxxKgM2 = 22000.0, IyyKgM2 = 110000.0, IzzKgM2 = 125000.0,
            RollStiffnessNmRad = 600000.0, PitchStiffnessNmRad = 1500000.0,
            YawStiffnessNmRad = 450000.0,
            RollDampingNms = 180000.0, PitchDampingNms = 600000.0, YawDampingNms = 260000.0,
            RollMomentMaxNm = 700000.0, PitchMomentMaxNm = 1700000.0, YawMomentMaxNm = 600000.0,
            RollHoldRateGainNms = 1200000.0,
            PitchThrustVectorMaxRad = 0.0,    // no TVC claim for the drone
            // The with-derivation must not smuggle the F-22's high-alpha identity into the
            // drone: generic post-stall aero, no LEF lift bonus, no F-22 body-axis schedules,
            // no q-scheduled post-stall override. Its envelope IS its declared polar.
            HighAlphaModel = HighAlphaModelKind.Generic,
            DynamicPressureScheduledPostStallOverride = false,
            LateralDerivativeProfileId = "ucav-interceptor-surrogate-v1"
        };

    public static readonly AircraftParams Su35SPublicDataSurrogate =
        Su27SPublicDataSurrogate with {
            ThrustMaxN = Su27SPublicDataSurrogate.ThrustMaxN * 1.16,
            RollRateMaxRad = 2.65,
            BankTau = 0.22,
            RollMomentMaxNm = 1_378_000.0,
            ClDeltaA = 0.106,
            LateralDerivativeProfileId = "su35s-public-data-surrogate-v1",
            FightRollRateMaxRad = 2.65,
            CompatibilityRollRateMaxRad = 2.65,
            CompatibilityBankTau = 0.22,
            RollHoldRateGainNms = 2_500_000.0
        };

    /// AT-802F FIRE BOSS PUBLIC-DATA SURROGATE. Measured anchors are the published 401 sq ft
    /// wing and 1,600 shp PT6A-67F installation. The polar, inertias, control derivatives and
    /// installed-propeller fit are provisional gameplay surrogates. Water is not baked into this
    /// reference mass: the mission passes it through the shared fixed-wing adapter as live payload.
    public static readonly AircraftParams At802fFireBossPublicDataSurrogate = new(
        MassKg: 5_345.0, // empty operating mass + representative launch fuel
        WingAreaM2: 37.25, // 401 sq ft (measured)
        ThrustMaxN: 30_000.0, // installed static-thrust cap (PROVISIONAL)
        CD0: 0.058, InducedK: 0.067, CLMax: 2.25, CLMin: -0.72,
        RollRateMaxRad: 1.30, BankTau: 0.48,
        MCrit: 0.55, WaveDragK: 120.0,
        SpoolUpTau: 1.35, SpoolDownTau: 0.90,
        CLAlpha: 4.60,
        IxxKgM2: 18_000.0, IyyKgM2: 38_000.0, IzzKgM2: 51_000.0,
        RollStiffnessNmRad: 155_000.0, PitchStiffnessNmRad: 430_000.0,
        YawStiffnessNmRad: 130_000.0,
        RollDampingNms: 78_000.0, PitchDampingNms: 215_000.0,
        YawDampingNms: 105_000.0,
        RollMomentMaxNm: 145_000.0, PitchMomentMaxNm: 310_000.0,
        YawMomentMaxNm: 120_000.0,
        ClBeta: -0.050, ClP: -0.52, ClR: 0.075,
        ClDeltaA: 0.082, ClDeltaR: 0.030,
        LateralDerivativeProfileId: "at802f-fireboss-public-data-surrogate-v1",
        ManualPitchRateMaxRad: 0.52,
        FightRollRateMaxRad: 1.30,
        CompatibilityRollRateMaxRad: 1.30, CompatibilityBankTau: 0.48,
        YawBetaStiffnessNmRad: 145_000.0, RollHoldDampingNms: 0.0,
        PositiveStructuralLimitG: 3.5, MaxPerformFraction: 1.0,
        MaxThrustFraction: 1.0,
        HighLiftDragOnsetFraction: 0.88, HighLiftDragK: 8.0,
        WingSpanM: 18.06,
        PropulsionModel: PropulsionModelKind.TurbopropShaftPowerPublicDataSurrogate,
        FuelFreeMassKg: 4_420.0,
        // Preserve the established mission fuel curve endpoints (0.032..0.147 kg/s). These are
        // gameplay/fuel-plan calibration values, not a PT6A-67F engine-deck claim.
        GenericIdleFuelFlowLbPerMinute: 4.232,
        GenericMilitaryFuelFlowLbPerMinute: 19.445,
        MaximumShaftPowerW: 1_193_000.0,
        PropellerEfficiency: 0.82,
        StaticPropellerThrustCapN: 30_000.0,
        ZeroLiftCoefficient: 0.92);

    /// F-14A PUBLIC-DATA SURROGATE for Top Gun visual merge. Measured anchors: 40,100 lb empty
    /// (Navy museum primary; Western Museum of Flight lists 40,104 lb — canonical empty mass uses
    /// the museum figure), 565 ft² wing, 20,900 lbf static afterburner per TF30-P-412A/-414A.
    /// Aero/control/inertia coefficients are rounded mission surrogates. The 7.5 G normal-law and
    /// 11 G deliberate override are explicit provisional control-policy limits, not a claim about
    /// a particular bureau-number airframe's tested ultimate strength. No AWG-9/RIO simulation.
    /// https://www.history.navy.mil/content/history/museums/nnam/explore/collections/aircraft/f/f-14a-tomcat.html
    public static readonly AircraftParams F14APublicDataSurrogate = new(
        MassKg: 24000.0, // representative visual-merge weight; empty anchor 18,186 kg
        WingAreaM2: 52.49, // 565 sq ft (measured)
        ThrustMaxN: 185_934.0, // 2 × 20,900 lbf SLS afterburning (measured)
        // The checked-in baseline is wings-forward. AircraftSim derives the live polar from the
        // authority-owned span: sweep reduces lift slope / CLmax, raises induced drag, and delays
        // the transonic rise. These are explicit reduced-order handling effects, not an OEM deck.
        CD0: 0.020, InducedK: 0.040, CLMax: 1.55, CLMin: -0.70, // SURROGATE polar fit
        RollRateMaxRad: 2.2, BankTau: 0.26,
        MCrit: 0.80, WaveDragK: 36.0, WaveDragPeakMach: 1.15,
        HighMachDragOnset: 2.05, HighMachDragK: 2.4,
        SpoolUpTau: 1.6, SpoolDownTau: 0.9,
        CLAlpha: 5.2,
        IxxKgM2: 75_000.0, IyyKgM2: 295_000.0, IzzKgM2: 345_000.0, // SURROGATE inertias
        RollStiffnessNmRad: 1_050_000.0, PitchStiffnessNmRad: 2_750_000.0,
        YawStiffnessNmRad: 880_000.0,
        RollDampingNms: 380_000.0, PitchDampingNms: 1_150_000.0, YawDampingNms: 530_000.0,
        RollMomentMaxNm: 1_250_000.0, PitchMomentMaxNm: 3_100_000.0, YawMomentMaxNm: 1_150_000.0,
        ClBeta: -0.058, ClP: -0.49, ClR: 0.10,
        ClDeltaA: 0.095, ClDeltaR: 0.031,
        LateralDerivativeProfileId: "f14a-public-data-surrogate-v1",
        ManualPitchRateMaxRad: 0.78,
        FightRollRateMaxRad: 2.2,
        CompatibilityRollRateMaxRad: 2.2, CompatibilityBankTau: 0.26,
        YawBetaStiffnessNmRad: 800_000.0, RollHoldDampingNms: 0.0,
        PositiveStructuralLimitG: 7.5, MaxPerformFraction: 1.0, // SURROGATE envelope
        NormalPullUsesMaxPerformance: true,
        InstantMaxPerformanceKeyboardPull: true,
        PositiveOverrideLimitG: 11.0, // PROVISIONAL emergency over-G command; 13.8 G rejected
        AbsolutePositiveLoadFactorG: 11.0, // PROVISIONAL achieved-load guard; structure still ages >7.5
        MaxThrustFraction: 1.0,
        HighLiftDragOnsetFraction: 0.90, HighLiftDragK: 3.0,
        WingSpanM: 19.53, // 64 ft 1 in wings-forward; live sweep reaches 38 ft 2 in
        PropulsionModel: PropulsionModelKind.AfterburningTurbofanPublicDataSurrogate,
        FuelFreeMassKg: 18_186.0, // 40,100 lb empty (measured, Navy museum canonical)
        GenericIdleFuelFlowLbPerMinute: 35.0,
        GenericMilitaryFuelFlowLbPerMinute: 260.0,
        GenericAfterburnerFuelFlowLbPerMinute: 720.0);

    /// MIG-28 F-5E-CLASS FICTION SURROGATE. Display identity is fiction (Top Gun 1986); every
    /// flight number traces to open F-5E Tiger II data, not a Soviet handbook. Measured anchors:
    /// 9,558 lb empty, 186 ft² wing, 5,000 lbf afterburning per J85-GE-21B. Aero/control/inertia
    /// are provisional surrogates scaled from Sabre/F9F-class neighbours — not F-22 inertias.
    /// https://www.hickoryaviationmuseum.org/aircraft/northrop-f-5-tiger-ii/
    public static readonly AircraftParams Mig28F5EClassSurrogate = new(
        MassKg: 6800.0, // clean combat: empty 4,349 kg + fuel/pilot/stores (SURROGATE)
        WingAreaM2: 17.28, // 186 sq ft (measured)
        ThrustMaxN: 44_482.0, // 2 × 5,000 lbf SLS afterburning (measured)
        CD0: 0.022, InducedK: 0.042, CLMax: 1.25, CLMin: -0.60, // SURROGATE polar fit
        RollRateMaxRad: 1.8, BankTau: 0.32,
        MCrit: 0.88, WaveDragK: 120.0,
        SpoolUpTau: 2.0, SpoolDownTau: 1.1,
        CLAlpha: 4.8,
        IxxKgM2: 6_500.0, IyyKgM2: 32_000.0, IzzKgM2: 37_000.0, // SURROGATE: F9F/Sabre scale
        RollStiffnessNmRad: 95_000.0, PitchStiffnessNmRad: 420_000.0,
        YawStiffnessNmRad: 95_000.0,
        RollDampingNms: 45_000.0, PitchDampingNms: 180_000.0, YawDampingNms: 95_000.0,
        RollMomentMaxNm: 120_000.0, PitchMomentMaxNm: 280_000.0, YawMomentMaxNm: 110_000.0,
        ClBeta: -0.042, ClP: -0.44, ClR: 0.085,
        ClDeltaA: 0.090, ClDeltaR: 0.028,
        LateralDerivativeProfileId: "mig28-f5e-class-fiction-surrogate-v1",
        ManualPitchRateMaxRad: 0.70,
        FightRollRateMaxRad: 2.0,
        CompatibilityRollRateMaxRad: 1.8, CompatibilityBankTau: 0.30,
        YawBetaStiffnessNmRad: 150_000.0, RollHoldDampingNms: 0.0,
        PositiveStructuralLimitG: 7.0, MaxPerformFraction: 1.0, // SURROGATE envelope
        MaxThrustFraction: 1.0,
        HighLiftDragOnsetFraction: 0.90, HighLiftDragK: 8.0,
        WingSpanM: 8.13, // 26 ft 8 in (measured F-5E span)
        PropulsionModel: PropulsionModelKind.AfterburningTurbofanPublicDataSurrogate,
        FuelFreeMassKg: 4349.0, // 9,558 lb empty (measured)
        GenericIdleFuelFlowLbPerMinute: 18.0,
        GenericMilitaryFuelFlowLbPerMinute: 95.0,
        GenericAfterburnerFuelFlowLbPerMinute: 220.0);

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
        AtmosphericState air = atmosphere.Sample(s.Position.Y);
        double q = 0.5 * air.DensityKgM3 * speed * speed;
        double mach = speed / System.Math.Max(air.SpeedOfSoundMps, 1e-9);
        return q * p.WingAreaM2 * EffectiveClMax(p, mach) / (s.Mass * G0);
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
        AtmosphericState air = atmosphere.Sample(s.Position.Y);
        double q = 0.5 * air.DensityKgM3 * speed * speed;
        double mach = speed / System.Math.Max(air.SpeedOfSoundMps, 1e-9);
        return q * p.WingAreaM2 * EffectiveClMin(p, mach) / (s.Mass * G0);
    }

    static double ResolveAirspeed(in AircraftState s, double airspeedMps) =>
        double.IsFinite(airspeedMps) && airspeedMps >= 0.0 ? airspeedMps : s.Speed;

    /// Drag divergence, per airframe. A straight high-AR wing (the glider's, AR~13) diverges
    /// near M0.65-0.70 and HARD — that wing physically cannot go fast, which is why a steep
    /// dive from a 60k balloon drop must be managed rather than pointed. A swept fighter wing
    /// holds to ~M0.85 with a gentler rise. Was a single global 0.85/8.0 every airframe inherited.
    /// The quadratic rise is a TRANSONIC law and it grows without bound, which is correct for every
    /// airframe here that is walled below M1 and catastrophically wrong for one that is meant to
    /// cruise supersonically: at M2.6 an MCrit of 0.92 with K=30 multiplies CD0 by 85. Real
    /// zero-lift drag peaks a little above M1 and then FALLS BACK as the shock system stabilises.
    /// WaveDragPeakMach is where the rise stops; above it the factor is held. Default is infinite,
    /// so every existing airframe keeps its previous drag bit-for-bit.
    static double MachDragFactor(double mach, in AircraftParams p) {
        if (mach < p.MCrit) return 1.0;
        double excess = System.Math.Min(mach, p.WaveDragPeakMach) - p.MCrit;
        double factor = 1.0 + p.WaveDragK * excess * excess;
        if (p.HighMachDragK > 0.0 && mach > p.HighMachDragOnset) {
            double beyond = mach - p.HighMachDragOnset;
            factor += p.HighMachDragK * beyond * beyond;
        }
        return factor;
    }

    internal static double BankRate(double bank, double target, in AircraftParams p) {
        double err = System.Math.IEEERemainder(target - bank, 2 * System.Math.PI); // shortest-way signed error
        double tau = p.CompatibilityBankTau > 0.0 ? p.CompatibilityBankTau : p.BankTau;
        double rateMax = p.CompatibilityRollRateMaxRad > 0.0 ? p.CompatibilityRollRateMaxRad : p.RollRateMaxRad;
        return System.Math.Clamp(err / tau, -rateMax, rateMax);
    }

    internal static double FightRollRate(in AircraftParams p) =>
        p.FightRollRateMaxRad > 0.0 ? p.FightRollRateMaxRad : p.RollRateMaxRad;

    /// <summary>
    /// Linearized supersonic thin-airfoil theory gives dCL/dα = 4/sqrt(M²-1). The schedule is
    /// clamped to the configured low-speed slope, so it turns on continuously near M1.5 for the
    /// Rapier instead of manufacturing a transonic lift spike. Scaling CLmax with the same ratio
    /// preserves the explicitly modelled stall incidence while removing the impossible assumption
    /// that a Mach-0 lift coefficient is unchanged at Mach 3–4.
    /// </summary>
    internal static double SupersonicLiftScale(double mach, in AircraftParams p) {
        if (!p.SupersonicLiftSlopeSchedule || !double.IsFinite(mach) || mach <= 1.0
            || p.CLAlpha <= 1e-9) return 1.0;
        double linearizedSlope = 4.0
            / System.Math.Sqrt(System.Math.Max(mach * mach - 1.0, 1e-9));
        return System.Math.Clamp(linearizedSlope / p.CLAlpha, 0.0, 1.0);
    }

    internal static double EffectiveClAlpha(in AircraftParams p, double mach) =>
        p.CLAlpha * SupersonicLiftScale(mach, p);
    internal static double EffectiveClMax(in AircraftParams p, double mach) =>
        p.CLMax * SupersonicLiftScale(mach, p);
    internal static double EffectiveClMin(in AircraftParams p, double mach) =>
        p.CLMin * SupersonicLiftScale(mach, p);

    internal static bool UsesRapierAerodynamics(in AircraftParams p) =>
        p.AerodynamicModel == AerodynamicModelKind.RapierCrankedDeltaPublicDataSurrogate;

    internal static double AlphaAeroMax(in AircraftParams p) =>
        (p.CLMax - p.ZeroLiftCoefficient) / p.CLAlpha;
    internal static double AlphaAeroMin(in AircraftParams p) =>
        (p.CLMin - p.ZeroLiftCoefficient) / p.CLAlpha;
    internal static double AlphaAeroMax(in AircraftParams p,
        in AirframeAerodynamicState configuration) =>
        (p.CLMax + configuration.LiftLimitCoefficientIncrement
            - p.ZeroLiftCoefficient) / p.CLAlpha;
    internal static double PositiveLiftCoefficientIncrement(
        in AirframeAerodynamicState configuration) =>
        configuration.PositiveLiftCoefficientIncrement;

    /// <summary>
    /// Maximum incidence the ordinary Rapier normal law will command. It is intentionally distinct
    /// from the physical whole-wing lift break: envelope override may ask beyond it, at which point
    /// the real force curve, drag, inlet recovery, and available control moments still decide what
    /// the aircraft achieves.
    /// </summary>
    internal static double PositiveNormalLawAlphaMax(in AircraftParams p, double mach,
        in AirframeAerodynamicState configuration,
        double massKg = double.NaN, double dynamicPressurePa = double.NaN) {
        double physical = AlphaAeroMax(p, configuration);
        if (!UsesRapierAerodynamics(p)) return physical;
        double schedule = RapierAerodynamics.NormalLawAlphaLimitRad(mach);
        double levelFloor = RapierAerodynamics.LevelFlightAlphaFloorRad(
            massKg, dynamicPressurePa, EffectiveClAlpha(p, mach), loadFactor: 1.05);
        return System.Math.Min(physical, System.Math.Max(schedule, levelFloor));
    }

    internal static double EffectiveControllableClMax(in AircraftParams p, double mach,
        in AirframeAerodynamicState configuration,
        double massKg = double.NaN, double dynamicPressurePa = double.NaN) {
        // Preserve the established generic/F-22 path exactly. Its limit increment changes the
        // physical CL break, whereas the Rapier has a separate normal-law alpha ceiling below
        // that break. Reconstructing every airframe's limit from alpha would otherwise count
        // legacy configuration increments twice.
        if (!UsesRapierAerodynamics(p)) {
            return EffectiveClMax(p, mach)
                + configuration.PositiveLiftCoefficientIncrement;
        }
        double alpha = PositiveNormalLawAlphaMax(p, mach, configuration, massKg, dynamicPressurePa);
        return EffectiveClAlpha(p, mach) * alpha
            + configuration.PositiveLiftCoefficientIncrement;
    }

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
        if (alpha >= -negativeStall && alpha <= positiveStall)
            return p.ZeroLiftCoefficient + p.CLAlpha * alpha;

        if (p.HighAlphaModel == HighAlphaModelKind.F22PublicDataSurrogate
            && alpha > positiveStall) {
            var (cn, ca) = F22BodyAxisCoefficients(alpha);
            return cn * System.Math.Cos(alpha) - ca * System.Math.Sin(alpha);
        }

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

    internal static double LiftCoefficient(double alpha, in AircraftParams p, double mach) =>
        LiftCoefficient(alpha, p) * SupersonicLiftScale(mach, p);

    internal static double LiftCoefficient(double alpha, in AircraftParams p,
        in AirframeAerodynamicState configuration) {
        double liftLimitIncrement = configuration.LiftLimitCoefficientIncrement;
        if (p.HighAlphaModel != HighAlphaModelKind.F22PublicDataSurrogate
            || liftLimitIncrement <= 0.0 || alpha <= AlphaAeroMax(p))
            return LiftCoefficient(alpha, p);

        double configuredStall = AlphaAeroMax(p, configuration);
        if (alpha <= configuredStall)
            return p.ZeroLiftCoefficient + p.CLAlpha * alpha;

        var (cn, ca) = F22BodyAxisCoefficients(alpha);
        double bodyAxisLift = cn * System.Math.Cos(alpha) - ca * System.Math.Sin(alpha);
        double phase = System.Math.Clamp(
            (alpha - configuredStall) / 0.14, 0.0, 1.0);
        phase = phase * phase * (3.0 - 2.0 * phase);
        return Lerp(p.CLMax + liftLimitIncrement, bodyAxisLift, phase);
    }

    /// <summary>
    /// Coarse F-22 body-axis normal/axial public-data surrogate. Values are deliberately visible at
    /// the review's 18/36/45/60/90-degree stations: vortex normal force persists through 60 degrees
    /// without extending the generic exponential wing-lift curve into that regime. CN is signed;
    /// CA is aft-positive. This is a capability-shape surrogate, not a wind-tunnel data claim.
    /// </summary>
    internal static (double cn, double ca) F22BodyAxisCoefficients(double alpha) {
        double absoluteAlpha = System.Math.Min(System.Math.Abs(alpha), System.Math.PI / 2.0);
        double sign = alpha >= 0.0 ? 1.0 : -1.0;
        double cn = InterpolateAlphaSchedule(absoluteAlpha,
            at18: 1.4720, at36: 2.4500, at45: 2.3500, at60: 2.0000, at90: 1.2500);
        double ca = InterpolateAlphaSchedule(absoluteAlpha,
            at18: -0.3240, at36: 0.1000, at45: 0.3000, at60: 0.2500, at90: 0.0000);
        return (sign * cn, ca);
    }

    internal static double SeparationFraction(double alpha, in AircraftParams p) {
        double stall = alpha >= 0.0 ? AlphaAeroMax(p) : -AlphaAeroMin(p);
        double t = System.Math.Clamp((System.Math.Abs(alpha) - stall) / 0.14, 0.0, 1.0);
        return t * t * (3.0 - 2.0 * t); // smoothstep: zero slope at attached and fully separated ends
    }

    internal static double SeparationFraction(double alpha, in AircraftParams p,
        in AirframeAerodynamicState configuration) {
        if (configuration.LiftLimitCoefficientIncrement <= 0.0 || alpha < 0.0)
            return SeparationFraction(alpha, p);
        double stall = AlphaAeroMax(p, configuration);
        double t = System.Math.Clamp((alpha - stall) / 0.14, 0.0, 1.0);
        return t * t * (3.0 - 2.0 * t);
    }

    static double InterpolateAlphaSchedule(double absoluteAlphaRad,
        double at18, double at36, double at45, double at60, double at90) {
        double degrees = System.Math.Clamp(absoluteAlphaRad * 180.0 / System.Math.PI,
            18.0, 90.0);
        if (degrees <= 36.0) return Lerp(at18, at36, (degrees - 18.0) / 18.0);
        if (degrees <= 45.0) return Lerp(at36, at45, (degrees - 36.0) / 9.0);
        if (degrees <= 60.0) return Lerp(at45, at60, (degrees - 45.0) / 15.0);
        return Lerp(at60, at90, (degrees - 60.0) / 30.0);
    }

    static double Lerp(double a, double b, double t) => a + (b - a) * t;

    // F-22 reduced-order control-power envelopes. PitchMomentMaxNm/YawMomentMaxNm remain demand
    // ceilings; these provisional coefficient schedules bound what the air can actually deliver.
    // Their moments therefore collapse exactly with q. Knots follow the adopted public-data
    // validation stations rather than pretending to be an OEM derivative deck.
    internal static double F22PitchAeroMomentAvailableNm(double alpha,
        double dynamicPressure, in AircraftParams p) {
        if (p.HighAlphaModel != HighAlphaModelKind.F22PublicDataSurrogate)
            return double.PositiveInfinity;
        if (dynamicPressure <= 0.0) return 0.0;
        double cm = InterpolateAlphaSchedule(System.Math.Abs(alpha),
            at18: 0.55, at36: 0.24, at45: 0.18, at60: 0.10, at90: 0.025);
        double span = p.WingSpanM > 0.0 ? p.WingSpanM
            : System.Math.Sqrt(4.5 * p.WingAreaM2);
        double meanChord = p.WingAreaM2 / System.Math.Max(span, 1e-6);
        return dynamicPressure * p.WingAreaM2 * meanChord * cm;
    }

    static double F22YawAeroMomentAvailableNm(double alpha,
        double dynamicPressure, in AircraftParams p) {
        if (p.HighAlphaModel != HighAlphaModelKind.F22PublicDataSurrogate)
            return double.PositiveInfinity;
        if (dynamicPressure <= 0.0) return 0.0;
        double cn = InterpolateAlphaSchedule(System.Math.Abs(alpha),
            at18: 0.15, at36: 0.12, at45: 0.10, at60: 0.07, at90: 0.025);
        double span = p.WingSpanM > 0.0 ? p.WingSpanM
            : System.Math.Sqrt(4.5 * p.WingAreaM2);
        return dynamicPressure * p.WingAreaM2 * span * cn;
    }

    static double F22RollEffectiveness(double alpha) => InterpolateAlphaSchedule(
        System.Math.Abs(alpha), at18: 1.00, at36: 0.58, at45: 0.44,
        at60: 0.28, at90: 0.08);

    static double F22RudderEffectiveness(double alpha) => InterpolateAlphaSchedule(
        System.Math.Abs(alpha), at18: 1.00, at36: 0.85, at45: 0.75,
        at60: 0.60, at90: 0.20);

    /// <summary>Reduced-order F-22 lateral-stick-to-rudder interconnect gain.</summary>
    public static double F22AileronRudderInterconnect(double alpha) => InterpolateAlphaSchedule(
        System.Math.Abs(alpha), at18: 0.00, at36: 0.45, at45: 0.65,
        at60: 0.80, at90: 0.40);

    /// <summary>Final normalized F-22 rudder demand after the explicit ARI allocation.</summary>
    public static double F22EffectiveRudderCommand(double alpha, in PilotCommand c) {
        double lateralStick = System.Math.Clamp(c.RollControl + c.SasRollControl, -1.0, 1.0);
        return System.Math.Clamp(c.Rudder
            + F22AileronRudderInterconnect(alpha) * lateralStick, -1.0, 1.0);
    }

    // Internal rather than private because decision-support projections must evaluate the exact
    // same polar as the force kernel. A second simplified drag equation produced a plausible-looking
    // sustained-G marker which was wrong by almost one G near the high-lift drag rise.
    internal static double ProfileDragCoefficient(double alpha, double mach, in AircraftParams p) {
        double stallAlpha = alpha >= 0.0 ? AlphaAeroMax(p) : -AlphaAeroMin(p);
        if (p.HighAlphaModel == HighAlphaModelKind.F22PublicDataSurrogate
            && alpha > stallAlpha) {
            var (cn, ca) = F22BodyAxisCoefficients(alpha);
            double bodyAxisCd = cn * System.Math.Sin(alpha) + ca * System.Math.Cos(alpha);
            return System.Math.Max(0.0, bodyAxisCd) * MachDragFactor(mach, p);
        }

        double cl = LiftCoefficient(alpha, p, mach);
        double attached = p.CD0 * MachDragFactor(mach, p) + p.InducedK * cl * cl;
        double peak = alpha >= 0.0 ? EffectiveClMax(p, mach) : -EffectiveClMin(p, mach);
        double highLiftFraction = System.Math.Abs(cl) / System.Math.Max(peak, 1e-6);
        double highLiftExcess = System.Math.Max(0.0,
            highLiftFraction - p.HighLiftDragOnsetFraction);
        attached += p.HighLiftDragK * highLiftExcess * highLiftExcess;
        if (System.Math.Abs(alpha) <= stallAlpha) return attached;

        // Preserve the calibrated drag exactly at the stall break, then grow monotonically toward
        // the broadside separated-flow value. This keeps corner/sustained-G tuning untouched.
        double clAtBreak = alpha >= 0.0
            ? EffectiveClMax(p, mach) : EffectiveClMin(p, mach);
        double breakFraction = System.Math.Abs(clAtBreak)
            / System.Math.Max(alpha >= 0.0
                ? System.Math.Abs(EffectiveClMax(p, mach))
                : System.Math.Abs(EffectiveClMin(p, mach)), 1e-6);
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

    internal static double ProfileDragCoefficient(double alpha, double mach,
        in AircraftParams p, in AirframeAerodynamicState configuration) {
        double liftLimitIncrement = configuration.LiftLimitCoefficientIncrement;
        if (p.HighAlphaModel != HighAlphaModelKind.F22PublicDataSurrogate
            || liftLimitIncrement <= 0.0 || alpha < 0.0)
            return ProfileDragCoefficient(alpha, mach, p);

        double configuredStall = AlphaAeroMax(p, configuration);
        double configuredPeak = p.CLMax + liftLimitIncrement;
        double machFactor = MachDragFactor(mach, p);
        double cl = LiftCoefficient(alpha, p, configuration);
        double highLiftFraction = System.Math.Abs(cl)
            / System.Math.Max(configuredPeak, 1e-6);
        double highLiftExcess = System.Math.Max(0.0,
            highLiftFraction - p.HighLiftDragOnsetFraction);
        double attached = p.CD0 * machFactor + p.InducedK * cl * cl
            + p.HighLiftDragK * highLiftExcess * highLiftExcess;
        if (alpha <= configuredStall) return attached;

        double breakExcess = System.Math.Max(0.0,
            1.0 - p.HighLiftDragOnsetFraction);
        double breakCd = p.CD0 * machFactor
            + p.InducedK * configuredPeak * configuredPeak
            + p.HighLiftDragK * breakExcess * breakExcess;
        var (cn, ca) = F22BodyAxisCoefficients(alpha);
        double bodyAxisCd = System.Math.Max(0.0,
            cn * System.Math.Sin(alpha) + ca * System.Math.Cos(alpha)) * machFactor;
        double phase = System.Math.Clamp(
            (alpha - configuredStall) / 0.14, 0.0, 1.0);
        phase = phase * phase * (3.0 - 2.0 * phase);
        return Lerp(breakCd, bodyAxisCd, phase);
    }

    internal static StateDeriv Derivatives(in RawState r, in PilotCommand c,
        in AircraftParams p, in Vec3D liftRef, in Vec3D wind, double netThrustN,
        in AirframeAerodynamicState configuration) {
        return Derivatives(r, c, p, liftRef, wind, netThrustN, configuration,
            StandardAtmosphere1976.Instance);
    }

    internal static StateDeriv Derivatives(in RawState r, in PilotCommand c,
        in AircraftParams p, in Vec3D liftRef, in Vec3D wind, double netThrustN,
        in AirframeAerodynamicState configuration, IAtmosphereModel atmosphere,
        double pitchThrustVectorAngleRad = double.NaN,
        double coldGasRemainingKg = 0.0) {
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
        // Every force and moment calculation in one RK stage is evaluated at the same
        // RawState altitude. Sample that thermodynamic state once: the standard and weather
        // atmosphere implementations are immutable altitude functions, and repeating their
        // hydrostatic calculation here cannot add information to the stage.
        AtmosphericState atmosphericState = atmosphere.Sample(r.Pos.Y);
        double rho = atmosphericState.DensityKgM3;
        double q = 0.5 * rho * speed * speed;
        var aero = Aerodynamics(r, c, p, wind, netThrustN, configuration, atmosphericState,
            pitchThrustVectorAngleRad);
        var (dAttitude, dRates, rollMomentNm, rcsMomentNm) = RotationalDerivatives(r, c, p,
            liftRef, controlVhat, q, speed, netThrustN, configuration, atmosphericState,
            pitchThrustVectorAngleRad, coldGasRemainingKg);
        return new StateDeriv(r.Vel, aero.Accel, BankRate(r.Bank, c.BankTarget, p),
            dAttitude, dRates, rollMomentNm, rcsMomentNm);
    }

    internal static AeroResult Aerodynamics(in RawState r, in PilotCommand c,
        in AircraftParams p, in Vec3D wind, double netThrustN,
        in AirframeAerodynamicState configuration) {
        return Aerodynamics(r, c, p, wind, netThrustN, configuration,
            StandardAtmosphere1976.Instance);
    }

    internal static AeroResult Aerodynamics(in RawState r, in PilotCommand c,
        in AircraftParams p, in Vec3D wind, double netThrustN,
        in AirframeAerodynamicState configuration, IAtmosphereModel atmosphere,
        double pitchThrustVectorAngleRad = double.NaN) {
        ArgumentNullException.ThrowIfNull(atmosphere);
        AtmosphericState atmosphericState = atmosphere.Sample(r.Pos.Y);
        return Aerodynamics(r, c, p, wind, netThrustN, configuration, atmosphericState,
            pitchThrustVectorAngleRad);
    }

    static AeroResult Aerodynamics(in RawState r, in PilotCommand c,
        in AircraftParams p, in Vec3D wind, double netThrustN,
        in AirframeAerodynamicState configuration,
        in AtmosphericState atmosphericState,
        double pitchThrustVectorAngleRad = double.NaN) {
        var vAir = r.Vel - wind;
        double speed = vAir.Length;
        var attitude = r.Attitude.Normalized();
        var bodyRight = attitude.Rotate(new Vec3D(1, 0, 0));
        var bodyUp = attitude.Rotate(new Vec3D(0, 1, 0));
        var bodyForward = attitude.Rotate(new Vec3D(0, 0, 1));
        var vhat = speed < 1e-9 ? bodyForward : vAir * (1.0 / speed);
        double alpha = System.Math.Atan2(-vhat.Dot(bodyUp), vhat.Dot(bodyForward));
        double beta = System.Math.Asin(System.Math.Clamp(vhat.Dot(bodyRight), -1.0, 1.0));

        double rho = atmosphericState.DensityKgM3;
        double q = 0.5 * rho * speed * speed;
        double mach = speed / atmosphericState.SpeedOfSoundMps;
        bool scheduledLiftLimit = p.HighAlphaModel
                == HighAlphaModelKind.F22PublicDataSurrogate
            && configuration.LiftLimitCoefficientIncrement > 0.0;
        double attachedConfiguration = 1.0 - (scheduledLiftLimit
            ? SeparationFraction(alpha, p, configuration)
            : SeparationFraction(alpha, p));
        double cl = (scheduledLiftLimit
                ? LiftCoefficient(alpha, p, configuration)
                : LiftCoefficient(alpha, p, mach))
            + configuration.LiftCoefficientIncrement * attachedConfiguration;
        double effectiveRudderCommand = p.HighAlphaModel
            == HighAlphaModelKind.F22PublicDataSurrogate
                ? F22EffectiveRudderCommand(alpha, c) : c.Rudder;
        double cd = (scheduledLiftLimit
                ? ProfileDragCoefficient(alpha, mach, p, configuration)
                : ProfileDragCoefficient(alpha, mach, p))
                    + configuration.DragCoefficientIncrement
                    + System.Math.Abs(effectiveRudderCommand) * 0.15 * p.CD0
                    + beta * beta * 0.08;
        double liftAccel = q * p.WingAreaM2 * cl / r.Mass;
        if (double.IsFinite(p.AbsolutePositiveLoadFactorG)
            && p.AbsolutePositiveLoadFactorG > 0.0) {
            liftAccel = System.Math.Min(
                liftAccel,
                p.AbsolutePositiveLoadFactorG * G0);
        }
        double dragAccel = q * p.WingAreaM2 * cd / r.Mass;
        double usableThrustN = System.Math.Max(0.0, netThrustN);
        double thrustAccel = usableThrustN / r.Mass;
        // A free balloon gets the actual displaced-air force, not a frozen altitude or a constant
        // gravity discount. Because rho changes with height this naturally restores the envelope
        // toward its density altitude. Ordinary aircraft publish zero volume and remain bit-exact.
        double buoyancyAccel = p.BuoyantVolumeM3 > 0.0
            ? rho * p.BuoyantVolumeM3 * G0 / r.Mass
            : 0.0;
        var gravityAndBuoyancy = new Vec3D(0.0, G0 - buoyancyAccel, 0.0);
        double pitchThrustVectorAngle = double.IsFinite(pitchThrustVectorAngleRad)
            ? System.Math.Clamp(pitchThrustVectorAngleRad, -p.PitchThrustVectorMaxRad,
                p.PitchThrustVectorMaxRad)
            : LegacyPitchThrustVectorAngle(r, c, p, vhat, q, configuration);
        double pitchThrustVectorMoment = PitchThrustVectorMoment(
            pitchThrustVectorAngle, usableThrustN, p);

        // Aerodynamic lift and side force stay perpendicular to the relative wind while their
        // orientation comes from the real body axes. Rudder authority retains the tuned jink term.
        var liftPlane = bodyUp - vhat * bodyUp.Dot(vhat);
        var liftDir = liftPlane.Length < 1e-9 ? bodyUp : liftPlane.Normalized();
        var sidePlane = bodyRight - vhat * bodyRight.Dot(vhat);
        var sideDir = sidePlane.Length < 1e-9 ? bodyRight : sidePlane.Normalized();
        double rudderSideEffectiveness = p.HighAlphaModel
            == HighAlphaModelKind.F22PublicDataSurrogate
                ? F22RudderEffectiveness(alpha) : 1.0;
        double sideAccel = effectiveRudderCommand * rudderSideEffectiveness * 0.06 * speed
            - q * p.WingAreaM2 * p.CYBeta * beta / r.Mass;
        bool useF22BodyAxisForces = p.HighAlphaModel
            == HighAlphaModelKind.F22PublicDataSurrogate
            && alpha > (scheduledLiftLimit
                ? AlphaAeroMax(p, configuration) : AlphaAeroMax(p));
        Vec3D aerodynamicAccel = Vec3D.Zero;
        if (useF22BodyAxisForces) {
            // Apply the scheduled force in body axes, then add configuration/rudder/beta drag in
            // their ordinary wind axes. At beta=0 this is algebraically the CN/CA-to-CL/CD
            // transform exposed by LiftCoefficient/ProfileDragCoefficient; at nonzero beta it
            // remains a genuine body-axis model instead of silently rotating axial force into the
            // wind plane.
            var (cn, ca) = F22BodyAxisCoefficients(alpha);
            double forceScale = q * p.WingAreaM2 / r.Mass;
            double extraLiftCoefficient = scheduledLiftLimit
                ? cl - (cn * System.Math.Cos(alpha) - ca * System.Math.Sin(alpha))
                : configuration.LiftCoefficientIncrement * attachedConfiguration;
            double extraDragCoefficient = configuration.DragCoefficientIncrement
                + System.Math.Abs(effectiveRudderCommand) * 0.15 * p.CD0
                + beta * beta * 0.08;
            aerodynamicAccel = bodyUp * (forceScale * cn)
                - bodyForward * (forceScale * ca)
                + liftDir * (forceScale * extraLiftCoefficient)
                - vhat * (forceScale * extraDragCoefficient);
        }
        // Positive vector angle is a positive-q (nose-up) control demand. With the nozzles aft of
        // the CG, the corresponding thrust resultant points toward body-down; the lever arm turns
        // that force into the positive pitch moment returned alongside this force evaluation.
        var thrustDirection = bodyForward * System.Math.Cos(pitchThrustVectorAngle)
            - bodyUp * System.Math.Sin(pitchThrustVectorAngle);
        var accel = useF22BodyAxisForces
            ? thrustDirection * thrustAccel + aerodynamicAccel
                + sideDir * sideAccel - gravityAndBuoyancy
            : thrustDirection * thrustAccel - vhat * dragAccel + liftDir * liftAccel
                + sideDir * sideAccel - gravityAndBuoyancy;
        return new AeroResult(accel, liftDir, vAir, alpha, beta, liftAccel / G0, q,
            pitchThrustVectorAngle, pitchThrustVectorMoment,
            q * p.WingAreaM2 * cd);
    }

    static double LegacyPitchThrustVectorAngle(in RawState r, in PilotCommand c,
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
        double separation = SeparationFraction(alpha, p, configuration);
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

    static double F22PitchMomentDemand(in RawState r, in PilotCommand c,
        in AircraftParams p, in Vec3D liftRef, in Vec3D vhat, double dynamicPressure,
        double speed, in AirframeAerodynamicState configuration, out double alpha) {
        var attitude = r.Attitude.Normalized();
        var bodyUp = attitude.Rotate(new Vec3D(0, 1, 0));
        var bodyForward = attitude.Rotate(new Vec3D(0, 0, 1));
        alpha = System.Math.Atan2(-vhat.Dot(bodyUp), vhat.Dot(bodyForward));
        var target = TargetAttitude(r, c, p, liftRef, vhat, dynamicPressure, configuration);
        var error = attitude.Conjugate() * target;
        if (error.W < 0.0) error = -error;
        double vn = System.Math.Sqrt(error.X * error.X + error.Y * error.Y
            + error.Z * error.Z);
        double scale = vn < 1e-10 ? 2.0
            : 2.0 * System.Math.Atan2(vn, error.W) / vn;
        double errQ = -error.X * scale;
        bool directPitch = double.IsFinite(c.CommandedPitchRad);
        double qCommand = 0.0;
        double alphaTarget = alpha;
        if (!directPitch) {
            var targetUp = target.Rotate(new Vec3D(0, 1, 0));
            var liftPlane = targetUp - vhat * targetUp.Dot(vhat);
            var targetLift = liftPlane.Length < 1e-9 ? targetUp : liftPlane.Normalized();
            double nz = TargetNz(r, c, p, dynamicPressure, configuration);
            alphaTarget = TargetAlpha(r, c, p, dynamicPressure, configuration);
            qCommand = System.Math.Clamp((nz - targetLift.Y) * G0
                / System.Math.Max(speed, 1e-6),
                -p.ManualPitchRateMaxRad, p.ManualPitchRateMaxRad);
        }
        double stiffness = directPitch ? p.ApproachPitchStiffnessNmRad
            : p.PitchStiffnessNmRad;
        double momentMax = directPitch ? p.ApproachPitchMomentMaxNm
            : p.PitchMomentMaxNm;
        double pitchError = directPitch ? errQ : alphaTarget - alpha;
        double demand = System.Math.Clamp(stiffness * pitchError
            - p.PitchDampingNms * (r.BodyRates.Q - qCommand), -momentMax, momentMax);
        double stallAlpha = alpha >= 0.0
            ? AlphaAeroMax(p, configuration) : -AlphaAeroMin(p);
        demand += -System.Math.Sign(alpha) * p.StallPitchBreakNm
            * SeparationFraction(alpha, p, configuration)
            * System.Math.Clamp((System.Math.Abs(alpha) - stallAlpha) / 0.25, 0.0, 1.0);
        double span = p.WingSpanM > 0.0 ? p.WingSpanM
            : System.Math.Sqrt(4.5 * p.WingAreaM2);
        double meanChord = p.WingAreaM2 / System.Math.Max(span, 1e-6);
        demand += dynamicPressure * p.WingAreaM2 * meanChord
            * configuration.PitchMomentCoefficientIncrement;
        return demand;
    }

    static PitchControlAllocation F22PitchAllocation(double demandMomentNm,
        double alpha, double dynamicPressure, double netThrustN, in AircraftParams p) {
        double aeroCapacity = F22PitchAeroMomentAvailableNm(alpha, dynamicPressure, p);
        double aeroMoment = System.Math.Clamp(demandMomentNm, -aeroCapacity, aeroCapacity);
        double residual = demandMomentNm - aeroMoment;
        double usableThrust = System.Math.Max(0.0, netThrustN);
        double tvcCapacity = usableThrust * p.PitchThrustVectorMomentArmM
            * System.Math.Sin(System.Math.Max(0.0, p.PitchThrustVectorMaxRad));
        double allocatedTvcMoment = System.Math.Clamp(residual, -tvcCapacity, tvcCapacity);
        double denominator = usableThrust * p.PitchThrustVectorMomentArmM;
        double targetAngle = denominator > 1e-9
            ? System.Math.Asin(System.Math.Clamp(allocatedTvcMoment / denominator, -1.0, 1.0))
            : 0.0;
        targetAngle = System.Math.Clamp(targetAngle, -p.PitchThrustVectorMaxRad,
            p.PitchThrustVectorMaxRad);
        return new PitchControlAllocation(demandMomentNm, aeroMoment, residual,
            tvcCapacity, targetAngle);
    }

    internal static double PitchThrustVectorTargetAngle(in RawState r, in PilotCommand c,
        in AircraftParams p, in Vec3D liftRef, in Vec3D wind, double netThrustN,
        in AirframeAerodynamicState configuration, IAtmosphereModel atmosphere) {
        if (p.HighAlphaModel != HighAlphaModelKind.F22PublicDataSurrogate
            || p.PitchThrustVectorMaxRad <= 0.0
            || p.PitchThrustVectorMomentArmM <= 0.0
            || double.IsFinite(c.CommandedPitchRad)) return 0.0;
        var vAir = r.Vel - wind;
        double speed = vAir.Length;
        var vhat = speed < 1e-9
            ? r.Attitude.Normalized().Rotate(new Vec3D(0, 0, 1))
            : vAir * (1.0 / speed);
        double dynamicPressure = 0.5 * atmosphere.Sample(r.Pos.Y).DensityKgM3
            * speed * speed;
        double demand = F22PitchMomentDemand(r, c, p, liftRef, vhat, dynamicPressure,
            speed, configuration, out double alpha);
        return F22PitchAllocation(demand, alpha, dynamicPressure, netThrustN, p)
            .TargetNozzleAngleRad;
    }

    internal static double RateLimitPitchThrustVector(double currentAngleRad,
        double targetAngleRad, double dt, in AircraftParams p) {
        double maxStep = System.Math.Max(0.0, p.PitchThrustVectorNozzleRateRadPerSecond)
            * System.Math.Max(0.0, dt);
        if (maxStep <= 0.0) return targetAngleRad;
        return currentAngleRad + System.Math.Clamp(targetAngleRad - currentAngleRad,
            -maxStep, maxStep);
    }

    internal static PullLimitStatus EvaluatePullLimit(in RawState r, in PilotCommand c,
        in AircraftParams p, in Vec3D liftRef, in Vec3D wind, double netThrustN,
        double pitchThrustVectorAngleRad, in AirframeAerodynamicState configuration,
        IAtmosphereModel atmosphere) {
        var vAir = r.Vel - wind;
        double speed = vAir.Length;
        var vhat = speed < 1e-9
            ? r.Attitude.Normalized().Rotate(new Vec3D(0, 0, 1))
            : vAir * (1.0 / speed);
        double dynamicPressure = 0.5 * atmosphere.Sample(r.Pos.Y).DensityKgM3
            * speed * speed;
        double mach = speed
            / System.Math.Max(atmosphere.Sample(r.Pos.Y).SpeedOfSoundMps, 1e-9);
        if (!double.IsFinite(c.CommandedAlphaRad) && c.GDemand > 0.0) {
            double aeroLimit = dynamicPressure * p.WingAreaM2
                * EffectiveControllableClMax(p, mach, configuration, r.Mass, dynamicPressure)
                / (r.Mass * G0);
            double structuralLimit = c.GDemand <= p.PositiveStructuralLimitG + 1e-6
                ? p.PositiveStructuralLimitG : PositiveControlLimitG(p);
            if (c.GDemand >= System.Math.Min(aeroLimit, structuralLimit) - 0.02) {
                return aeroLimit < structuralLimit
                    ? new PullLimitStatus(PullLimitReason.AerodynamicClMax)
                    : new PullLimitStatus(PullLimitReason.Structural);
            }
        }

        if (p.HighAlphaModel == HighAlphaModelKind.F22PublicDataSurrogate
            && !double.IsFinite(c.CommandedPitchRad)) {
            double demand = F22PitchMomentDemand(r, c, p, liftRef, vhat,
                dynamicPressure, speed, configuration, out double alpha);
            PitchControlAllocation allocation = F22PitchAllocation(demand, alpha,
                dynamicPressure, netThrustN, p);
            double actualTvcMoment = PitchThrustVectorMoment(pitchThrustVectorAngleRad,
                System.Math.Max(0.0, netThrustN), p);
            double unmet = allocation.ResidualMomentNm - actualTvcMoment;
            double tolerance = System.Math.Max(1_000.0,
                0.05 * System.Math.Abs(allocation.ResidualMomentNm));
            if (System.Math.Abs(unmet) > tolerance)
                return new PullLimitStatus(PullLimitReason.TvcSaturated);
        }
        return PullLimitStatus.None;
    }

    static (QuaternionD dAttitude, BodyRates dRates, double rollMomentNm, double rcsMomentNm)
        RotationalDerivatives(in RawState r,
        in PilotCommand c, in AircraftParams p, in Vec3D liftRef, in Vec3D vhat,
        double dynamicPressure, double speed, double netThrustN,
        in AirframeAerodynamicState configuration,
        in AtmosphericState atmosphericState,
        double pitchThrustVectorAngleRad, double coldGasRemainingKg = 0.0) {
        var attitude = r.Attitude.Normalized();
        double mach = speed
            / System.Math.Max(atmosphericState.SpeedOfSoundMps, 1e-9);
        var target = TargetAttitude(r, c, p, liftRef, vhat, dynamicPressure, configuration,
            mach);
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
            double nz = TargetNz(r, c, p, dynamicPressure, configuration, mach);
            alphaTarget = TargetAlpha(r, c, p, dynamicPressure, configuration, mach);
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
        double separation = SeparationFraction(alpha, p, configuration);
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
        double pitchControlDemand = System.Math.Clamp(pitchStiffness * pitchError
            - p.PitchDampingNms * (rates.Q - qCommand),
            -pitchMomentMax, pitchMomentMax) * pitchControlBlend;
        double pitchMoment = pitchControlDemand;
        bool rapierAerodynamics = UsesRapierAerodynamics(p);
        double stallAlpha = alpha >= 0.0
            ? AlphaAeroMax(p, configuration) : -AlphaAeroMin(p);
        double pitchBreak = -System.Math.Sign(alpha) * p.StallPitchBreakNm * separation
            * System.Math.Clamp((System.Math.Abs(alpha) - stallAlpha) / 0.25, 0.0, 1.0);
        if (rapierAerodynamics)
            pitchBreak *= ColdGasRcs.AeroControlAuthority(dynamicPressure);
        pitchMoment += pitchBreak;
        double beta = System.Math.Asin(System.Math.Clamp(vhat.Dot(bodyRight), -1.0, 1.0));
        bool f22HighAlpha = p.HighAlphaModel == HighAlphaModelKind.F22PublicDataSurrogate;
        double effectiveRudderCommand = f22HighAlpha
            ? F22EffectiveRudderCommand(alpha, c) : c.Rudder;
        // Positive beta in this body basis means the velocity vector is to the right of the nose,
        // so a positive yaw moment aligns the nose with it and drives beta toward zero. Fade the
        // coordinator out under full manual rudder: intermediate rudder adds to it, full rudder
        // owns the axis, and hands-off maneuvering keeps the ball centered.
        double yawStabilityBlend = f22HighAlpha ? 1.0 : 1.0 - 0.88 * separation;
        double coordinatorMoment = p.YawBetaStiffnessNmRad * beta
            * (1.0 - System.Math.Clamp(System.Math.Abs(effectiveRudderCommand), 0.0, 1.0));

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
        double localWingSeparation = System.Math.Max(
            SeparationFraction(leftAlpha, p, configuration),
            SeparationFraction(rightAlpha, p, configuration));
        double wingSeparation = 0.75 * separation + 0.25 * localWingSeparation;
        double momentScale = dynamicPressure * p.WingAreaM2 * span * 0.25;
        double stalledRollMoment = p.StallRollCoupling * momentScale
            * (LiftCoefficient(leftAlpha, p, mach) - LiftCoefficient(rightAlpha, p, mach))
            * wingSeparation;
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
        double rudderDeflection = System.Math.Clamp(effectiveRudderCommand, -1.0, 1.0)
            * p.MaxRudderDeflectionRad;
        double attachedRollCoefficient;
        if (f22HighAlpha) {
            double rollEffectiveness = F22RollEffectiveness(alpha);
            double rudderEffectiveness = F22RudderEffectiveness(alpha);
            attachedRollCoefficient = p.ClBeta * beta * rudderEffectiveness
                + p.ClP * nondimensionalP * rollEffectiveness
                + p.ClR * nondimensionalR * rudderEffectiveness
                + p.ClDeltaA * System.Math.Clamp(pilotAileron + sasAileron,
                    -p.MaxAileronDeflectionRad, p.MaxAileronDeflectionRad)
                    * rollEffectiveness
                + p.ClDeltaR * rudderDeflection * rudderEffectiveness;
        } else {
            double rapierControlEffectiveness = rapierAerodynamics
                ? RapierAerodynamics.SupersonicControlEffectiveness(mach)
                : 1.0;
            attachedRollCoefficient = p.ClBeta * beta
                + p.ClP * nondimensionalP + p.ClR * nondimensionalR
                + p.ClDeltaA * System.Math.Clamp(pilotAileron + sasAileron,
                    -p.MaxAileronDeflectionRad, p.MaxAileronDeflectionRad)
                    * rapierControlEffectiveness
                    * configuration.RollControlAuthorityFraction
                + p.ClDeltaR * rudderDeflection * rapierControlEffectiveness
                    * configuration.YawControlAuthorityFraction;
        }
        double attachedRollMoment = dynamicPressure * p.WingAreaM2 * span
            * attachedRollCoefficient;
        double rollMoment = legacyRollMoment
            + (c.DirectLateralControl ? attachedRollMoment
                * (f22HighAlpha ? 1.0 : 1.0 - wingSeparation) : 0.0)
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
        double bankHoldDemand = 0.0;
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
                bankHoldDemand = System.Math.Clamp(
                    p.RollHoldAttitudeGainNmRad * errP
                        - p.RollHoldRateGainNms * rates.P,
                    -p.RollMomentMaxNm, p.RollMomentMaxNm);
                double holdCapacity = rapierAerodynamics
                    ? RapierAerodynamics.RollControlMomentCapacityNm(dynamicPressure,
                        configuration.RollControlAuthorityFraction, mach)
                    : p.RollMomentMaxNm;
                double holdMoment = System.Math.Clamp(
                    bankHoldDemand, -holdCapacity, holdCapacity);
                rollMoment += holdMoment * holdEngage * (1.0 - wingSeparation);
                bankHoldDemand *= holdEngage;
            }
        }
        double meanChord = p.WingAreaM2 / System.Math.Max(span, 1e-6);
        double configurationPitchMoment = dynamicPressure * p.WingAreaM2 * meanChord
            * configuration.PitchMomentCoefficientIncrement;
        pitchMoment += configurationPitchMoment;
        if (f22HighAlpha) {
            // PitchMomentMaxNm is a demanded moment, not free control power. Aerodynamics takes
            // the portion available from q*S*c*Cm; only its residual reaches the thrust-vector
            // allocator. This branch intentionally removes the old 85%-at-zero-q fixed moment.
            double demandedPitchMoment = System.Math.Clamp(pitchStiffness * pitchError
                - p.PitchDampingNms * (rates.Q - qCommand),
                -pitchMomentMax, pitchMomentMax) + pitchBreak + configurationPitchMoment;
            PitchControlAllocation allocation = F22PitchAllocation(demandedPitchMoment,
                alpha, dynamicPressure, netThrustN, p);
            double actualNozzleAngle = double.IsFinite(pitchThrustVectorAngleRad)
                ? System.Math.Clamp(pitchThrustVectorAngleRad,
                    -p.PitchThrustVectorMaxRad, p.PitchThrustVectorMaxRad)
                : allocation.TargetNozzleAngleRad;
            pitchMoment = allocation.AeroMomentNm + PitchThrustVectorMoment(
                actualNozzleAngle, System.Math.Max(0.0, netThrustN), p);
        } else if (rapierAerodynamics) {
            double pitchCapacity = RapierAerodynamics.PitchControlMomentCapacityNm(
                dynamicPressure, configuration.PitchControlAuthorityFraction, mach);
            pitchMoment = System.Math.Clamp(
                pitchControlDemand, -pitchCapacity, pitchCapacity)
                + pitchBreak + configurationPitchMoment;
        } else {
            double pitchThrustVectorAngle = LegacyPitchThrustVectorAngle(r, c, p, vhat,
                dynamicPressure, configuration);
            pitchMoment += PitchThrustVectorMoment(pitchThrustVectorAngle,
                System.Math.Max(0.0, netThrustN), p);
        }

        // At high alpha, damp yaw about the stability normal (r*cos(alpha)-p*sin(alpha)), and let
        // lateral stick feed the rudder through the explicit ARI above. Projecting the resulting
        // body p/r onto the velocity axis yields the commanded stability-axis roll; no rate or
        // departure is injected. All delivery remains bounded by q*S*b*Cn.
        double stabilityYawRate = rates.R * System.Math.Cos(alpha)
            - rates.P * System.Math.Sin(alpha);
        double yawDemand = f22HighAlpha
            ? (p.YawStiffnessNmRad * errR
                - p.YawDampingNms * stabilityYawRate + coordinatorMoment)
                + effectiveRudderCommand * p.YawMomentMaxNm
            : (p.YawStiffnessNmRad * errR
                - p.YawDampingNms * rates.R + coordinatorMoment) * yawStabilityBlend
                + c.Rudder * p.YawMomentMaxNm * (1.0 - 0.15 * separation)
                + stalledYawMoment;
        double yawMoment = f22HighAlpha
            ? System.Math.Clamp(yawDemand,
                -F22YawAeroMomentAvailableNm(alpha, dynamicPressure, p),
                F22YawAeroMomentAvailableNm(alpha, dynamicPressure, p))
            : rapierAerodynamics
                ? System.Math.Clamp(yawDemand,
                    -RapierAerodynamics.YawControlMomentCapacityNm(dynamicPressure,
                        configuration.YawControlAuthorityFraction, mach),
                    RapierAerodynamics.YawControlMomentCapacityNm(dynamicPressure,
                        configuration.YawControlAuthorityFraction, mach))
                : System.Math.Clamp(yawDemand, -p.YawMomentMaxNm, p.YawMomentMaxNm);

        // Cold-gas RCS: fade non-q FCS moments when dynamic pressure dies, and fill with thrusters
        // while gas remains. Attached aileron moments already scale with q and are left alone.
        double rcsMomentMagnitude = 0.0;
        if (p.ColdGasRcsMaxMomentNm > 0.0) {
            double aeroAuth = ColdGasRcs.AeroControlAuthority(dynamicPressure);
            double rcsAuth = ColdGasRcs.RcsAuthority(dynamicPressure, coldGasRemainingKg);
            if (rapierAerodynamics) {
                // Rapier aero moments already derive from q*S*length*coefficient, so do not apply
                // the old second q fade. RCS supplies the remaining controller demand in thin air;
                // all three axes consume the same finite gas store.
                double desiredRoll = c.DirectLateralControl
                    ? System.Math.Clamp(
                        (c.RollControl + c.SasRollControl) * p.RollMomentMaxNm
                            + bankHoldDemand,
                        -p.RollMomentMaxNm, p.RollMomentMaxNm)
                    : legacyRollMoment;
                double rcsPitch = ColdGasRcs.RcsMomentForDemand(
                    pitchControlDemand - pitchMoment, rcsAuth, p.ColdGasRcsMaxMomentNm);
                double rcsYaw = ColdGasRcs.RcsMomentForDemand(
                    yawDemand - yawMoment, rcsAuth, p.ColdGasRcsMaxMomentNm);
                double rcsRoll = ColdGasRcs.RcsMomentForDemand(
                    desiredRoll - rollMoment, rcsAuth, p.ColdGasRcsMaxMomentNm);
                pitchMoment += rcsPitch;
                yawMoment += rcsYaw;
                rollMoment += rcsRoll;
                rcsMomentMagnitude =
                    System.Math.Abs(rcsPitch) + System.Math.Abs(rcsYaw)
                    + System.Math.Abs(rcsRoll);
            } else {
                double demandPitch = pitchMoment;
                double demandYaw = yawMoment;
                double demandLegacyRoll = legacyRollMoment;
                pitchMoment = ColdGasRcs.ScaleControlMoment(demandPitch, aeroAuth)
                    + ColdGasRcs.RcsMomentForDemand(
                        demandPitch, rcsAuth, p.ColdGasRcsMaxMomentNm);
                yawMoment = ColdGasRcs.ScaleControlMoment(demandYaw, aeroAuth)
                    + ColdGasRcs.RcsMomentForDemand(
                        demandYaw, rcsAuth, p.ColdGasRcsMaxMomentNm);
                if (!c.DirectLateralControl) {
                    double rcsRoll = ColdGasRcs.RcsMomentForDemand(
                        demandLegacyRoll, rcsAuth, p.ColdGasRcsMaxMomentNm);
                    rollMoment = rollMoment - demandLegacyRoll
                        + ColdGasRcs.ScaleControlMoment(demandLegacyRoll, aeroAuth)
                        + rcsRoll;
                }
                rcsMomentMagnitude =
                    System.Math.Abs(ColdGasRcs.RcsMomentForDemand(
                        demandPitch, rcsAuth, p.ColdGasRcsMaxMomentNm))
                    + System.Math.Abs(ColdGasRcs.RcsMomentForDemand(
                        demandYaw, rcsAuth, p.ColdGasRcsMaxMomentNm));
            }
        }

        double pDot = (rollMoment + (p.IyyKgM2 - p.IzzKgM2) * rates.Q * rates.R) / p.IxxKgM2;
        double qDot = (pitchMoment + (p.IzzKgM2 - p.IxxKgM2) * rates.R * rates.P) / p.IyyKgM2;
        double rDot = (yawMoment + (p.IxxKgM2 - p.IyyKgM2) * rates.P * rates.Q) / p.IzzKgM2;
        var omega = new QuaternionD(0, -rates.Q, rates.R, -rates.P);
        return ((attitude * omega) * 0.5, new BodyRates(pDot, qDot, rDot), rollMoment,
            rcsMomentMagnitude);
    }

    static QuaternionD TargetAttitude(in RawState r, in PilotCommand c, in AircraftParams p,
        in Vec3D liftRef, in Vec3D vhat, double dynamicPressure,
        in AirframeAerodynamicState configuration, double mach = 0.0) {
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
        double alpha = TargetAlpha(r, c, p, dynamicPressure, configuration, mach);
        var forward = (vhat * System.Math.Cos(alpha) + lift * System.Math.Sin(alpha)).Normalized();
        var up = (lift * System.Math.Cos(alpha) - vhat * System.Math.Sin(alpha)).Normalized();
        return QuaternionD.FromFrame(up.Cross(forward).Normalized(), up, forward);
    }

    static double TargetAlpha(in RawState r, in PilotCommand c, in AircraftParams p,
        double dynamicPressure, in AirframeAerodynamicState configuration,
        double mach = 0.0) {
        double nz = TargetNz(r, c, p, dynamicPressure, configuration, mach);
        double cl = nz * r.Mass * G0 / System.Math.Max(dynamicPressure * p.WingAreaM2, 1e-6);
        double protectedAlpha = System.Math.Clamp(
            (cl - configuration.LiftCoefficientIncrement - p.ZeroLiftCoefficient)
                / System.Math.Max(EffectiveClAlpha(p, mach), 1e-9),
            AlphaAeroMin(p), PositiveNormalLawAlphaMax(p, mach, configuration, r.Mass, dynamicPressure));
        if (!double.IsFinite(c.CommandedAlphaRad)) return protectedAlpha;

        // The protection/control layer may deliberately demand incidence beyond the lift break.
        // This is an ordinary actuator target, not a physics-mode flag: roll/yaw/force derivatives
        // remain functions of state and physical demands alone.
        return System.Math.Clamp(c.CommandedAlphaRad,
            -System.Math.PI / 2.0, System.Math.PI / 2.0);
    }

    static double TargetNz(in RawState r, in PilotCommand c, in AircraftParams p,
        double dynamicPressure, in AirframeAerodynamicState configuration,
        double mach = 0.0) {
        double nzMax = System.Math.Min(dynamicPressure * p.WingAreaM2
            * EffectiveControllableClMax(p, mach, configuration, r.Mass, dynamicPressure)
                / (r.Mass * G0),
            PositiveControlLimitG(p));
        double nzMin = System.Math.Max(dynamicPressure * p.WingAreaM2
            * (EffectiveClMin(p, mach) + configuration.LiftCoefficientIncrement)
                / (r.Mass * G0), -1.5);
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
        AtmosphericState air = atmosphere.Sample(s.Position.Y);
        double q = 0.5 * air.DensityKgM3 * speed * speed;
        double mach = speed / System.Math.Max(air.SpeedOfSoundMps, 1e-9);
        double nzMax = System.Math.Min(q * p.WingAreaM2
            * EffectiveControllableClMax(p, mach, configuration, s.Mass, q)
                / (s.Mass * G0),
            PositiveControlLimitG(p));
        double nzMin = System.Math.Max(q * p.WingAreaM2
            * (EffectiveClMin(p, mach) + configuration.LiftCoefficientIncrement)
                / (s.Mass * G0), -1.5);
        return (System.Math.Clamp(c.GDemand, nzMin, nzMax), nzMax, nzMin);
    }
}
