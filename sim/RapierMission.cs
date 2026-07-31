namespace GunsOnly.Sim;

/// <summary>
/// The finite, authored Rapier sortie. It is deliberately a mission script rather than a general
/// autopilot or sensor model: launch, build ram energy, intercept one formation, and recover.
/// </summary>
public enum RapierMissionPhase {
    Unavailable,
    Launch,
    Climb,
    Accelerate,
    RamClimb,
    ZoomPull,
    ZoomCoast,
    ReenterAlign,
    DipRelight,
    Intercept,
    Attack,
    Escape,
    ReturnToBase,
    Recovery,
    Complete
}

/// <summary>Random (or authored) job dealt by Go Fly the Rapier.</summary>
public enum RapierJobKind {
    FormationIntercept,
    Balloon,
    Awacs,
    Transport,
    SwarmLob
}

/// <summary>
/// Computer casualty dealt with a Rapier sortie. The mission computer owns authored guidance and
/// automation, while the flight-control computers are the only path from pilot/keyboard commands
/// to aerodynamic surfaces, thrust-vectoring and cold-gas RCS.
/// </summary>
public enum RapierComputerFailure {
    None,
    MissionComputer,
    FlightControlComputers
}

public readonly record struct RapierMissionGuidance(
    RapierMissionPhase Phase,
    string Cue,
    /// <summary>Mach the director actually commands this tick (authored, skin-clamped).</summary>
    double TargetMach,
    double TargetAltitudeFt,
    PilotCommand Command,
    Vec3D Waypoint,
    int RecoveryGate,
    /// <summary>Profile Mach before skin clamp. Equals TargetMach when the structure allows it.</summary>
    double AuthoredTargetMach = 0.0,
    /// <summary>
    /// Legacy name for the material-capability Mach screening ceiling at current ambient.
    /// The selected temperature reference may be flat-skin recovery or stagnation-point T0.
    /// </summary>
    double SkinMachLimit = double.PositiveInfinity,
    /// <summary>Mach after Min(authored, skin). Same as TargetMach; named for snapshot clarity.</summary>
    double CommandedMach = 0.0,
    /// <summary>Stable token for why the current phase was entered (OFT gate rows).</summary>
    string PhaseReason = "",
    /// <summary>Circuits pattern leg token: DEPART, INITIAL, BREAK, CROSSWIND, DOWNWIND, BASE, SHORT_FINAL, WIRE_FINAL.</summary>
    string CircuitLeg = "",
    /// <summary>Director bank target in degrees for the Circuits flight director.</summary>
    double FdBankDeg = 0.0,
    /// <summary>Director target KTAS for the Circuits flight director speed bug.</summary>
    double FdTargetKtas = 0.0,
    /// <summary>Degrees between nose and velocity — coast reentry FD cue.</summary>
    double NoseOnVelocityErrorDeg = 0.0,
    /// <summary>Dealt job token for Go Fly / zoom-lob sorties.</summary>
    string JobToken = "",
    /// <summary>Current Sänger skip index (1-based) while on the zoom-lob profile.</summary>
    int LobSkip = 0,
    /// <summary>Authored skip cap for this profile (0 when not zoom-lobbing).</summary>
    int LobSkipMax = 0,
    /// <summary>Physical half-extent (m) of the active flythrough box in the sky.</summary>
    double GateHalfM = 0.0,
    /// <summary>Unit direction through the gate (flight path the square faces).</summary>
    double GateFaceX = 0.0,
    double GateFaceY = 0.0,
    double GateFaceZ = 1.0,
    /// <summary>Aircraft is inside the physical gate volume this tick.</summary>
    bool GateInVolume = false,
    /// <summary>True airspeed within the gate energy band.</summary>
    bool GateEnergyOk = false,
    /// <summary>Stable reach-fight intention token for guidance and snapshots.</summary>
    string Intention = "",
    /// <summary>Stable reach-fight strategy token for guidance and snapshots.</summary>
    string Strategy = "");

public sealed record ScriptedInterceptConfig(
    int FormationSize = 4,
    /// <summary>
    /// IR-guided short-range air-to-air weapons. Successful employment is therefore called
    /// FOX TWO; changing seeker type requires changing both the physical config and radio call.
    /// </summary>
    int ShortRangeMissiles = 0,
    int DogfightingDrones = 4,
    double MissileMinimumRangeM = 600.0,
    double MissileMaximumRangeM = 15_000.0,
    double KillCameraSeconds = 3.5,
    int PursuerCount = 2,
    double PursuitInitialRangeM = 20_000.0,
    double PursuitEscapeRangeM = 80_000.0,
    double PursuerMach = 3.0,
    bool AutomationDefaultEnabled = true,
    bool RecoveryRequired = true,
    /// <summary>
    /// Circuits / pattern-only: launch, climb to the recovery shelf, trap, repeat. No contact,
    /// no egress dash — the director must not treat a zero-opponent count as "go recover from
    /// FL700" during the catapult stroke, and must not chase a parked phantom bandit.
    /// </summary>
    bool PatternOnly = false,
    /// <summary>
    /// Mission-authored intention in force when the aircraft reports base. Full stop is the local
    /// default and remains unspoken; a planned touch-and-go must be selected here before the
    /// transaction. A later pilot wave-off/go-around supersedes this plan on frequency.
    /// </summary>
    CircuitLandingIntent LandingIntent = CircuitLandingIntent.FullStop,
    /// <summary>
    /// Zoom-lob profile: after ram climb, pull into a ballistic coast, align nose to V, relight.
    /// </summary>
    bool ZoomLobProfile = false,
    /// <summary>
    /// Dev fallback: instant formation wipe and pursuit egress instead of one physical gun-drone.
    /// Default off — the Attack contract releases one reusable drone per F press.
    /// </summary>
    bool DeterministicSwarmWipe = false,
    RapierJobKind Job = RapierJobKind.FormationIntercept,
    /// <summary>
    /// Optional casualty injected on entry to the first ballistic coast. Mission-computer loss
    /// leaves the digital flight-control/RCS path intact for manual flight. Losing every
    /// flight-control computer does not: this fly-by-wire article has no mechanical fallback.
    /// </summary>
    RapierComputerFailure ComputerFailureAtZoomCoast = RapierComputerFailure.None);

/// <summary>
/// Deterministic mission director for the Rapier public-data surrogate. The director commands the
/// same PilotCommand path as a human, so propulsion, fuel, G, physiology, terrain and recovery
/// remain ordinary kernel truth. Any pilot input takes authority without erasing the script; only
/// an explicit automation command hands the aircraft back to the director.
/// </summary>
public sealed class RapierMissionDirector {
    /// <summary>
    /// Measured design dash (Intercept OFT energy-ladder ~M3.69 class). Commands Intercept and
    /// Escape. Stays below <c>RamSpillCompleteMach</c> (3.8). Mach 4 remains SE-bible fiction only
    /// — never a mission target.
    /// </summary>
    public const double MeasuredDashMach = 3.55;

    const double ClimbTopM = 56_000.0 * 0.3048;
    const double CruiseAltitudeM = 70_000.0 * 0.3048;
    const double FeetPerMetre = 1.0 / 0.3048;
    RapierMissionPhase _phase = RapierMissionPhase.Launch;
    string _phaseReason = "launch";
    bool _recoveryMarshalReached;
    bool _recoveryLineupReached;
    bool _recoveryFinal;
    int _circuitsFlown;
    bool _circuitShelfReached;
    bool _circuitInitialReached;
    bool _circuitBreakReached;
    bool _circuitDownwindReached;
    bool _circuitBaseReached;
    bool _circuitInitialJoinEstablished;
    readonly ReachFightDirector _reachFight = new();
    MissionIntention _intention;
    ReachFightStrategy _strategy;
    /// Height above the strip that counts as "going around" rather than still landing. 300 m is
    /// above any bounce and below pattern altitude, so a touch-and-go re-arms but a long float
    /// down the runway does not.
    const double CircuitResetHeightM = 300.0;
    /// Circuits pattern altitude AGL — 2,500 ft downwind (military overhead).
    const double CircuitShelfHeightM = 2_500.0 * 0.3048;
    /// Compact overhead (~2–4 min). Hold ~250 KT; idle when fast so T/W cannot walk to 330.
    const double CircuitPatternKtas = 250.0;
    const double CircuitBreakKtas = 230.0;
    const double CircuitBaseKtas = 200.0;
    // At circuit weight the wing stalls near 148 KT, so 165 was 1.11 Vs and the aircraft
    // actually arrived at 132 KT -- below flying speed, falling onto the deck 267 m short of the
    // wires. The loop undershoots its commanded speed by roughly 20 KT on final.
    const double CircuitFinalKtas = 190.0;
    // Carrier touchdown assessment currently accepts at most 82 m/s (~159 KT). Authoring a
    // 165–177 KT wire pass made a successful arrest physically impossible even when centred.
    const double CircuitWireKtas = 168.0;
    const double CircuitPatternSpeedMps = CircuitPatternKtas / 1.94384;
    const double CircuitBreakSpeedMps = CircuitBreakKtas / 1.94384;
    const double CircuitBaseSpeedMps = CircuitBaseKtas / 1.94384;
    const double CircuitFinalSpeedMps = CircuitFinalKtas / 1.94384;
    const double CircuitWireSpeedMps = CircuitWireKtas / 1.94384;
    // Recovery marshal is 46 km behind the strip. Entering recovery on a 90 km home-radius could
    // put an arrival on that side of the field only 24 km from marshal while still above 30,000 ft.
    // A 150 km radius guarantees at least ~104 km of setup from every arrival azimuth.
    const double RecoveryEntryHomeRangeM = 150_000.0;
    /// Crosswind/break bank: prefer 60°, allow 75°. At 250 KT / 60° R ≈ 0.53 NM.
    // 60 degrees needs 2.00 G and the wing offers 2.41 G at 230 KT -- 17% margin, and the break
    // also bleeds energy the honest engine cannot replace, so the automation rolled in and flew
    // into the water at 48 m/s sink. 50 degrees needs 1.56 G, which leaves the turn sustainable
    // and still looks like a military break.
    const double CircuitBreakBankDeg = 50.0;
    const double CircuitBreakBankMaxDeg = 65.0;
    /// Base bank: prefer 45°, allow 60°.
    const double CircuitBaseBankDeg = 45.0;
    const double CircuitBaseBankMaxDeg = 60.0;
    /// Downwind offset (~1.4 NM) — clears a 60° break without ballooning the lap.
    const double CircuitDownwindOffsetM = 1.40 * 1852.0;
    /// Initial distance before threshold (~1.5 NM).
    const double CircuitInitialAlongM = 1.50 * 1852.0;
    /// Finals start at 3 NM.
    const double CircuitFinalAlongM = 3.00 * 1852.0;
    /// Flythrough box half-width/height in metres — a real sky object, not HUD chrome.
    // A 100 m half-width is +/-328 ft laterally AND vertically, and at 250 KT the aircraft is
    // inside the 180 m depth for 1.4 seconds. That asks a jet to thread a box it can only be in
    // for a moment, and when it misses, the leg never earns and the circuit stalls on INITIAL
    // forever -- the same defect RecoveryProcedureDirector had, where a capture volume too tight
    // to capture pinned the ladder at gate 0 across every recorded sortie.
    //
    // 220 m is still a disciplined pass and it is one the automation can actually fly.
    const double CircuitGateHalfM = 220.0;
    /// Along-track half-depth for "through the square" capture.
    const double CircuitGateDepthM = 180.0;
    /// KTAS band to earn the gate (energy gate).
    const double CircuitGateSpeedTolKtas = 35.0;
    /// Sänger skip-glide: boost → coast → reenter → dip, then maybe another skip. Cap keeps the
    /// profile finite; each skip buys ~100+ km of near-zero-burn coast when energy and fuel allow.
    const int MaxLobSkips = 3;
    /// Still worth another lob when contact is beyond attack geometry and fuel has fight room.
    const double AnotherSkipContactRangeM = 90_000.0;
    int _lobSkip;

    public RapierMissionPhase Phase => _phase;
    public int LobSkip => _lobSkip;

    void EnterPhase(RapierMissionPhase next, string reason) {
        if (_phase == next && _phaseReason == reason) return;
        _phase = next;
        _phaseReason = reason;
    }

    static double WrapAngle(double value) =>
        Math.IEEERemainder(value, 2.0 * Math.PI);

    /// <summary>
    /// Circuits speed hold for a high-T/W brick. Prior schedules left 0.7+ lever at pattern
    /// speed and walked through 330 KT in a shallow bank — that is not a circuit.
    /// </summary>
    /// Lever POSITIONS, so they only mean anything against a particular engine. 0.26 trim and a
    /// 0.52 ceiling were set when the core was 68% larger; against the honest engine 0.26 buys
    /// less thrust than a banked turn costs in drag, so the automation rolled into the break and
    /// descended into the sea. Scaled by the thrust ratio the pattern holds its turn again.
    static double PatternHoldThrottle(
        double targetMps, double currentMps, double trimLever = 0.44) {
        double error = targetMps - currentMps;
        if (error < -6.0) return 0.0; // overspeed → idle
        double lever = trimLever + error * 0.016;
        return Math.Clamp(lever, 0.0, 0.88);
    }

    /// <summary>
    /// Circuits bank by leg: crosswind/break 60° (max 75°), base 45° (max 60°),
    /// DEPART join up to 50°, straight legs ~30°.
    /// </summary>
    static double PatternBankTargetRad(string circuitLeg, double headingErrorRad) {
        double err = WrapAngle(headingErrorRad);
        double absErr = Math.Abs(err);
        double sign = err >= 0.0 ? 1.0 : -1.0;
        const double Deg = Math.PI / 180.0;
        if (circuitLeg is "BREAK") {
            if (absErr > 12.0 * Deg) {
                double deg = Math.Clamp(absErr / Deg * 1.15,
                    CircuitBreakBankDeg, CircuitBreakBankMaxDeg);
                return sign * deg * Deg;
            }
            return Math.Clamp(err * 1.35,
                -CircuitBreakBankMaxDeg * Deg, CircuitBreakBankMaxDeg * Deg);
        }
        if (circuitLeg is "BASE") {
            if (absErr > 10.0 * Deg) {
                double deg = Math.Clamp(absErr / Deg * 1.15,
                    CircuitBaseBankDeg, CircuitBaseBankMaxDeg);
                return sign * deg * Deg;
            }
            return Math.Clamp(err * 1.35,
                -CircuitBaseBankMaxDeg * Deg, CircuitBaseBankMaxDeg * Deg);
        }
        if (circuitLeg is "DEPART") {
            // Ski-jump join needs more than a 30° crawl or the lap opens a racetrack.
            return Math.Clamp(err * 1.35, -50.0 * Deg, 50.0 * Deg);
        }
        if (circuitLeg is "INITIAL" && absErr > 35.0 * Deg) {
            // The displayed leg is still INITIAL, but an aircraft outside the join station needs
            // enough bank to acquire it. Holding the straight-leg 30° limit here creates a
            // three-kilometre turn circle at pattern speed and can orbit the join forever.
            return Math.Clamp(err * 1.35, -55.0 * Deg, 55.0 * Deg);
        }
        // Straight legs / final — keep it tidy.
        return Math.Clamp(err * 1.35, -30.0 * Deg, 30.0 * Deg);
    }

    /// <summary>
    /// Coordinated G ceiling by leg. 75° bank ≈ 3.86 G; BREAK must be allowed ~4 G.
    /// </summary>
    static double PatternMaximumG(string circuitLeg) => circuitLeg switch {
        "BREAK" => 4.0,
        "BASE" => 2.5,
        "DEPART" => 2.2,
        _ => 2.0
    };

    static PilotCommand CommandTowardPattern(
        in AircraftState player, in Vec3D waypoint,
        double desiredGamma, double throttle, string circuitLeg,
        double gammaGain, double minimumG, double maximumG) {
        Vec3D delta = waypoint - player.Position;
        double desiredHeading = Math.Atan2(delta.X, delta.Z);
        double headingError = WrapAngle(desiredHeading - player.Chi);
        double bankTarget = PatternBankTargetRad(circuitLeg, headingError);
        double gammaError = desiredGamma - player.Gamma;
        // Floor Cos at ~0.20 so a 75° break can still demand ~1/cos(φ) ≈ 3.9 G.
        double coordinatedHoldG = Math.Cos(desiredGamma)
            / Math.Max(0.20, Math.Cos(bankTarget));
        double gDemand = Math.Clamp(
            coordinatedHoldG + gammaError * gammaGain, minimumG, maximumG);
        return new PilotCommand(
            GDemand: gDemand,
            BankTarget: bankTarget,
            Throttle: throttle,
            Rudder: 0.0,
            CommandedPitchRad: double.NaN,
            EnvelopeOverride: false,
            RollControl: 0.0,
            CommandedAlphaRad: double.NaN,
            SasRollControl: 0.0,
            DirectLateralControl: false);
    }

    static PilotCommand CommandToward(in AircraftState player, in Vec3D waypoint,
        double desiredGamma, double throttle, double maximumBankDegrees,
        double gammaGain, double minimumG, double maximumG) {
        Vec3D delta = waypoint - player.Position;
        double desiredHeading = Math.Atan2(delta.X, delta.Z);
        double headingError = WrapAngle(desiredHeading - player.Chi);
        double maximumBankRad = maximumBankDegrees * Math.PI / 180.0;
        double bankTarget = Math.Clamp(headingError * 1.35,
            -maximumBankRad, maximumBankRad);
        double gammaError = desiredGamma - player.Gamma;
        // Normal load required to hold a flight path rises as the aircraft banks. The old flat
        // 1.0-G baseline lost height in every turn, then chased that error with a 3.2-G pull. This
        // coordinated-flight estimate keeps the director on the same ordinary lift model as the
        // pilot and makes altitude corrections progressively rather than ballistically.
        double coordinatedHoldG = Math.Cos(desiredGamma)
            / Math.Max(0.75, Math.Cos(bankTarget));
        double gDemand = Math.Clamp(
            coordinatedHoldG + gammaError * gammaGain, minimumG, maximumG);
        return new PilotCommand(
            GDemand: gDemand,
            BankTarget: bankTarget,
            Throttle: throttle,
            Rudder: 0.0,
            CommandedPitchRad: double.NaN,
            EnvelopeOverride: false,
            RollControl: 0.0,
            CommandedAlphaRad: double.NaN,
            SasRollControl: 0.0,
            DirectLateralControl: false);
    }

    static double AltitudeCaptureGamma(double targetAltitudeM,
        in AircraftState player, double trueAirspeedMps,
        double captureSeconds, double minimumGamma, double maximumGamma) {
        double distanceForCaptureM = Math.Max(1.0,
            Math.Max(80.0, trueAirspeedMps) * captureSeconds);
        return Math.Clamp(Math.Atan2(
            targetAltitudeM - player.Position.Y, distanceForCaptureM),
            minimumGamma, maximumGamma);
    }

    static string JobToken(RapierJobKind job) => job switch {
        RapierJobKind.Balloon => "BALLOON",
        RapierJobKind.Awacs => "AWACS",
        RapierJobKind.Transport => "TRANSPORT",
        RapierJobKind.SwarmLob => "SWARM_LOB",
        _ => "INTERCEPT"
    };

    /// <summary>
    /// Runway-axis frame for the Circuits overhead: forward along landing, left for downwind.
    /// </summary>
    static void PatternRunwayFrame(
        in Vec3D home, in Vec3D recoveryInitial,
        out Vec3D runwayForward, out Vec3D runwayLeft, out Vec3D threshold) {
        Vec3D runwayForwardRaw = new(
            home.X - recoveryInitial.X, 0.0,
            home.Z - recoveryInitial.Z);
        runwayForward = runwayForwardRaw.Length > 1.0
            ? runwayForwardRaw.Normalized() : new Vec3D(0.0, 0.0, 1.0);
        runwayLeft = new(-runwayForward.Z, 0.0, runwayForward.X);
        if (runwayLeft.Length > 1e-6) runwayLeft = runwayLeft.Normalized();
        else runwayLeft = new Vec3D(1.0, 0.0, 0.0);
        threshold = home - runwayForward * 240.0 + new Vec3D(0.0, 1.5, 0.0);
    }

    /// <summary>INITIAL flythrough box at pattern shelf — DEPART aims here.</summary>
    static Vec3D PatternInitialPoint(in Vec3D home, in Vec3D recoveryInitial) {
        PatternRunwayFrame(home, recoveryInitial,
            out Vec3D runwayForward, out _, out Vec3D threshold);
        double patternY = home.Y + CircuitShelfHeightM;
        return threshold - runwayForward * CircuitInitialAlongM
            + new Vec3D(0.0, patternY - threshold.Y, 0.0);
    }

    static string PatternLegConfigCue(
        string circuitLeg, double targetKtas, double targetAltFt, string speedCall,
        int recoveryGate = 0) {
        // Dirty from downwind through the wire — military overhead teaching, not Intercept slot.
        string config = circuitLeg switch {
            "DOWNWIND" or "BASE" or "SHORT_FINAL" or "WIRE_FINAL"
                => "HOOK DOWN · GEAR DOWN · FLAPS DOWN",
            _ => "HOOK DOWN · GEAR UP · FLAPS UP"
        };
        string legLabel = circuitLeg.Replace('_', ' ');
        if (circuitLeg == "WIRE_FINAL" && recoveryGate > 0)
            legLabel = $"{legLabel} · BOX {recoveryGate}/4";
        string action = circuitLeg switch {
            "DEPART" => "CLIMB TO PATTERN",
            "INITIAL" => "BREAK LEFT ABM",
            "BREAK" => "~60° TO DOWNWIND",
            "CROSSWIND" => "ROLL OUT DOWNWIND",
            "DOWNWIND" => "GEAR FLAPS · ABEAM",
            "BASE" => "~45° TO FINAL",
            "SHORT_FINAL" => "LINE UP · CONFIGURED",
            "WIRE_FINAL" => "ACCEPT WIRE",
            _ => ""
        };
        string actionBit = string.IsNullOrEmpty(action) ? "" : $" · {action}";
        return $"CIRCUITS · {legLabel} · {config} · "
            + $"{targetKtas:F0} KT · {targetAltFt:F0} FT · {speedCall}{actionBit}";
    }

    /// <summary>
    /// Military overhead circuit for PatternOnly (Mirage/F-104 brick). Replaces the Intercept
    /// 30 km marshal corridor so traffic and Tab SA share a real pattern.
    /// Gates are physical sky volumes: earn only when through the box on speed.
    /// </summary>
    void StepPatternOverhead(
        in AircraftState player,
        in Vec3D home,
        in Vec3D recoveryInitial,
        double trueAirspeedMps,
        out Vec3D gatePoint,
        out Vec3D waypoint,
        out string circuitLeg,
        out string cue,
        out double approachSpeedMps,
        out int recoveryGate,
        out double targetGamma,
        out double gateHalfM,
        out Vec3D gateFace,
        out bool gateInVolume,
        out bool gateEnergyOk) {
        PatternRunwayFrame(home, recoveryInitial,
            out Vec3D runwayForward, out Vec3D runwayLeft, out Vec3D threshold);
        double patternY = home.Y + CircuitShelfHeightM;
        Vec3D initialPoint = threshold - runwayForward * CircuitInitialAlongM
            + new Vec3D(0.0, patternY - threshold.Y, 0.0);
        // INITIAL is flown toward the strip on runway heading. A single waypoint projected
        // through the gate makes an offset aircraft cut directly for the far side, then orbit the
        // box forever because it never approaches from behind. First acquire a station 2 NM
        // outside INITIAL; once close, capture the runway axis. The Rapier needs that distance to
        // settle a 250-knot join from the opposite side of the pattern.
        Vec3D initialJoin = initialPoint - runwayForward * 3_700.0;
        Vec3D downwindEntry = initialPoint + runwayLeft * CircuitDownwindOffsetM;
        const double DownwindRolloutM = 7_000.0;
        const double BaseTurnLeadM = 4_000.0;
        double downwindAlongM = CircuitFinalAlongM + DownwindRolloutM;
        double baseAlongM = CircuitFinalAlongM + BaseTurnLeadM;
        // Downwind runs reciprocal from the break, then a continuous base turn reverses onto the
        // three-mile final. The extra rollout is deliberate: at 250 KT the Rapier needs several
        // kilometres to arrest the 60° break and establish the parallel before the abeam gate.
        Vec3D downwindAbeam =
            threshold - runwayForward * downwindAlongM
            + runwayLeft * CircuitDownwindOffsetM
            + new Vec3D(0.0, patternY - threshold.Y, 0.0);
        // Base is an intermediate turning gate, not a midfield cut across. Its altitude joins the
        // published 3.5-degree final while leaving the final three miles stabilized.
        double finalStartAltM =
            threshold.Y + CircuitFinalAlongM * Carrier.GlideslopeSlope;
        double baseStartAltM =
            threshold.Y + baseAlongM * Carrier.GlideslopeSlope;
        Vec3D basePoint = threshold - runwayForward * baseAlongM
            + runwayLeft * (CircuitDownwindOffsetM * 0.50)
            + new Vec3D(0.0, baseStartAltM + 40.0 - threshold.Y, 0.0);
        Vec3D shortFinal = threshold - runwayForward * CircuitFinalAlongM
            + new Vec3D(0.0, finalStartAltM - threshold.Y, 0.0);
        // The fixed strip's threshold is wire three. With finite q-scaled pitch response, landing
        // mass changes where the same path command intersects the slab: the measured 7,807 kg
        // late-join card needs 25 m aft lead, while the 9,585 kg launched circuit needs ~43 m.
        // Keep the first-order predictor bounded and horizontal; an underground aim steepens the
        // last seconds and confounds path response with collision geometry.
        double touchdownAimAftM = Math.Clamp(
            25.0 + (player.Mass - 7_807.0) * 0.010,
            20.0, 50.0);
        Vec3D touchdownAim = threshold - runwayForward * touchdownAimAftM;
        double runwayHeading = Math.Atan2(runwayForward.X, runwayForward.Z);
        double headingError = Math.Abs(WrapAngle(runwayHeading - player.Chi));
        double downwindHeading = Math.Atan2(-runwayForward.X, -runwayForward.Z);
        double downwindHeadingError = Math.Abs(WrapAngle(downwindHeading - player.Chi));
        Vec3D playerPosition = player.Position;
        double playerBank = player.Bank;
        double currentKtas = trueAirspeedMps * 1.94384;

        static Vec3D FaceAlong(in Vec3D along) {
            Vec3D flat = new(along.X, 0.0, along.Z);
            if (flat.Length < 1e-6) return new Vec3D(0.0, 0.0, 1.0);
            return flat.Normalized();
        }

        static Vec3D LineLookAhead(
            in Vec3D aircraft, in Vec3D linePoint, in Vec3D track, double lookAheadM) {
            double alongM = (aircraft - linePoint).Dot(track);
            Vec3D projection = linePoint + track * alongM;
            return projection + track * lookAheadM;
        }

        bool InsideGate(in Vec3D point, in Vec3D face, double halfM) {
            Vec3D delta = playerPosition - point;
            double along = delta.X * face.X + delta.Z * face.Z;
            Vec3D right = new(-face.Z, 0.0, face.X);
            double lateral = delta.X * right.X + delta.Z * right.Z;
            double vertical = delta.Y;
            return Math.Abs(along) <= CircuitGateDepthM
                && Math.Abs(lateral) <= halfM
                && Math.Abs(vertical) <= halfM;
        }

        bool EnergyOk(double targetKtas) =>
            Math.Abs(currentKtas - targetKtas) <= CircuitGateSpeedTolKtas;

        bool Earn(in Vec3D point, in Vec3D face, double targetKtas, double halfM) =>
            InsideGate(point, face, halfM) && EnergyOk(targetKtas);

        Vec3D initialFace = FaceAlong(runwayForward);
        Vec3D breakFace = FaceAlong(runwayLeft);
        Vec3D downwindFace = FaceAlong(runwayForward * -1.0);
        Vec3D baseFaceRaw = runwayLeft * -0.5 + runwayForward * 0.5;
        Vec3D baseFace = FaceAlong(baseFaceRaw);
        Vec3D finalFace = initialFace;

        if (!_circuitInitialReached) {
            double joinRangeM = (initialJoin - playerPosition).Length;
            // A high-wing-loading jet at 250 KT does not fly through a point before turning.
            // Crossing the 1.1 NM capture cylinder is enough to establish the inbound join and
            // leaves roughly 2 NM to settle onto runway heading before INITIAL.
            if (!_circuitInitialJoinEstablished && joinRangeM <= 2_000.0)
                _circuitInitialJoinEstablished = true;
            double initialAlongM = (playerPosition - initialPoint).Dot(runwayForward);
            if (_circuitInitialJoinEstablished
                && initialAlongM > CircuitGateDepthM + 1_000.0)
                _circuitInitialJoinEstablished = false;
        }

        // Soft join for OFT / mid-pattern start — still require energy at the station.
        if (InsideGate(basePoint, baseFace, CircuitGateHalfM * 1.4)
            && EnergyOk(CircuitBaseKtas)) {
            _circuitInitialReached = true;
            _circuitBreakReached = true;
            _circuitDownwindReached = true;
        } else if (InsideGate(downwindAbeam, downwindFace, CircuitGateHalfM * 1.4)
            && EnergyOk(CircuitPatternKtas)
            && downwindHeadingError <= 50.0 * Math.PI / 180.0) {
            _circuitInitialReached = true;
            _circuitBreakReached = true;
        } else if (InsideGate(downwindEntry, breakFace, CircuitGateHalfM * 1.4)
            && EnergyOk(CircuitPatternKtas)) {
            _circuitInitialReached = true;
        }

        if (!_circuitInitialReached
            && Earn(initialPoint, initialFace, CircuitPatternKtas, CircuitGateHalfM)
            && headingError <= 35.0 * Math.PI / 180.0) {
            _circuitInitialReached = true;
            _circuitInitialJoinEstablished = false;
        }
        if (_circuitInitialReached
            && !_circuitBreakReached
            && Earn(downwindEntry, breakFace, CircuitBreakKtas, CircuitGateHalfM)
            && downwindHeadingError <= 55.0 * Math.PI / 180.0)
            _circuitBreakReached = true;
        if (_circuitBreakReached
            && !_circuitDownwindReached
            // A 280 m downwind box is still a visible fly-through volume, but does not turn a
            // stabilized 250-knot reciprocal pass into a two-metre numerical miss.
            && Earn(downwindAbeam, downwindFace, CircuitPatternKtas,
                CircuitGateHalfM * 1.4))
            _circuitDownwindReached = true;
        if (_circuitDownwindReached
            && !_circuitBaseReached
            && Earn(basePoint, baseFace, CircuitBaseKtas, CircuitGateHalfM))
            _circuitBaseReached = true;
        if (_circuitBaseReached
            && !_recoveryFinal
            && Earn(shortFinal, finalFace, CircuitFinalKtas, CircuitGateHalfM)
            && headingError <= 18.0 * Math.PI / 180.0
            && Math.Abs(playerBank) <= 35.0 * Math.PI / 180.0)
            _recoveryFinal = true;

        double distanceToWireM = (threshold - playerPosition).Dot(runwayForward);
        if (_recoveryFinal) {
            // Four boxes along a 3 NM final — not Intercept's 12 km groove.
            if (distanceToWireM > 4_200.0) {
                recoveryGate = 1;
                const double gateDistanceM = 4_800.0;
                gatePoint = threshold - runwayForward * gateDistanceM
                    + new Vec3D(0.0,
                        gateDistanceM * Carrier.GlideslopeSlope, 0.0);
                gateHalfM = 110.0;
            } else if (distanceToWireM > 2_400.0) {
                recoveryGate = 2;
                const double gateDistanceM = 2_800.0;
                gatePoint = threshold - runwayForward * gateDistanceM
                    + new Vec3D(0.0,
                        gateDistanceM * Carrier.GlideslopeSlope, 0.0);
                gateHalfM = 95.0;
            } else if (distanceToWireM > 1_000.0) {
                recoveryGate = 3;
                const double gateDistanceM = 900.0;
                gatePoint = threshold - runwayForward * gateDistanceM
                    + new Vec3D(0.0,
                        gateDistanceM * Carrier.GlideslopeSlope, 0.0);
                gateHalfM = 85.0;
            } else {
                recoveryGate = 4;
                gatePoint = touchdownAim;
                gateHalfM = 70.0;
            }
            waypoint = distanceToWireM > 0.0
                ? threshold
                : threshold + runwayForward * 50_000.0;
            approachSpeedMps = CircuitWireSpeedMps;
            circuitLeg = "WIRE_FINAL";
            gateFace = finalFace;
        } else if (!_circuitInitialReached) {
            recoveryGate = 0;
            gatePoint = initialPoint;
            if (_circuitInitialJoinEstablished) {
                // L1-style line capture: project the aircraft onto the inbound runway axis and
                // keep the steering aim a fixed distance ahead of that projection. A fixed point
                // beyond INITIAL turns back into a point-pursuit problem as soon as the aircraft
                // overshoots laterally; this moving look-ahead cannot orbit the gate.
                // A one-kilometre look-ahead gives roughly 35–50° of intercept for the lateral
                // errors seen after the join turn. Three kilometres was too shallow: the aircraft
                // crossed INITIAL still a kilometre abeam and had to re-acquire the join.
                waypoint = LineLookAhead(
                    playerPosition, initialPoint, runwayForward, 1_000.0);
            } else {
                waypoint = initialJoin;
            }
            approachSpeedMps = CircuitPatternSpeedMps;
            circuitLeg = "INITIAL";
            gateHalfM = CircuitGateHalfM;
            gateFace = initialFace;
        } else if (!_circuitBreakReached) {
            recoveryGate = 0;
            gatePoint = downwindEntry;
            waypoint = downwindEntry;
            approachSpeedMps = CircuitBreakSpeedMps;
            circuitLeg = "BREAK";
            gateHalfM = CircuitGateHalfM;
            gateFace = breakFace;
        } else if (!_circuitDownwindReached) {
            recoveryGate = 0;
            gatePoint = downwindAbeam;
            waypoint = LineLookAhead(
                playerPosition, downwindAbeam, runwayForward * -1.0, 1_000.0);
            approachSpeedMps = CircuitPatternSpeedMps;
            // Publish the turn as CROSSWIND until the aircraft has actually established the
            // reciprocal. Radio and ANCA can now consume a real semantic state instead of
            // guessing from audio timing.
            circuitLeg = downwindHeadingError <= 35.0 * Math.PI / 180.0
                ? "DOWNWIND"
                : "CROSSWIND";
            gateHalfM = CircuitGateHalfM * 1.4;
            gateFace = downwindFace;
        } else if (!_circuitBaseReached) {
            recoveryGate = 0;
            gatePoint = basePoint;
            waypoint = basePoint;
            approachSpeedMps = CircuitBaseSpeedMps;
            circuitLeg = "BASE";
            gateHalfM = CircuitGateHalfM;
            gateFace = baseFace;
        } else {
            recoveryGate = 0;
            gatePoint = shortFinal;
            // Capture the centreline itself. A fixed aim beyond the box left a shallow residual
            // intercept, so the Rapier crossed three-mile final hundreds of metres abeam and
            // orbited it. The moving look-ahead keeps correcting cross-track all the way in.
            waypoint = LineLookAhead(
                playerPosition, shortFinal, runwayForward, 750.0);
            approachSpeedMps = CircuitFinalSpeedMps;
            circuitLeg = "SHORT_FINAL";
            gateHalfM = CircuitGateHalfM;
            gateFace = finalFace;
        }

        double targetKtas = circuitLeg switch {
            "INITIAL" or "CROSSWIND" or "DOWNWIND" => CircuitPatternKtas,
            "BREAK" => CircuitBreakKtas,
            "BASE" => CircuitBaseKtas,
            "SHORT_FINAL" => CircuitFinalKtas,
            "WIRE_FINAL" => CircuitWireKtas,
            _ => Math.Round(approachSpeedMps * 1.94384)
        };
        gateInVolume = InsideGate(gatePoint, gateFace, gateHalfM);
        gateEnergyOk = EnergyOk(targetKtas);

        double horizontalRangeM = Math.Max(1.0, Math.Sqrt(
            Math.Pow(gatePoint.X - playerPosition.X, 2.0)
            + Math.Pow(gatePoint.Z - playerPosition.Z, 2.0)));
        double recoveryMinimumGamma = _recoveryFinal
            ? recoveryGate switch {
                1 => -0.12,
                2 => -0.09,
                _ => -0.08
            }
            : circuitLeg is "BASE" or "SHORT_FINAL" ? -0.12 : -0.04;
        if (_recoveryFinal) {
            // Hold the published carrier glideslope rather than continuously pitching at the
            // touchdown point. Point pursuit becomes singular in the final seconds and drove a
            // nominal pass through 4.2° / >7 m/s sink. Altitude error gently captures the same
            // 3.5° path used to place the boxes, then vanishes as the aircraft stabilizes.
            double glideDistanceM = Math.Max(0.0,
                (touchdownAim - playerPosition).Dot(runwayForward));
            double desiredGlideAltitudeM =
                touchdownAim.Y + glideDistanceM * Carrier.GlideslopeSlope;
            double glideErrorM = desiredGlideAltitudeM - playerPosition.Y;
            targetGamma = Math.Clamp(
                -Carrier.GlideslopeRad + Math.Atan2(glideErrorM, 500.0),
                -0.080, -0.020);
        } else {
            targetGamma = Math.Clamp(
                Math.Atan2(gatePoint.Y - playerPosition.Y, horizontalRangeM),
                recoveryMinimumGamma,
                0.06);
        }

        string speedCall = currentKtas > targetKtas + 25.0 ? "SLOW"
            : currentKtas < targetKtas - 25.0 ? "ADD POWER" : "ON SPEED";
        if (gateInVolume && gateEnergyOk) speedCall = "GATE OPEN";
        else if (gateInVolume && !gateEnergyOk) speedCall = "GATE · ENERGY";
        double targetAltFt = gatePoint.Y * FeetPerMetre;
        cue = PatternLegConfigCue(
            circuitLeg, targetKtas, targetAltFt, speedCall, recoveryGate);
    }

    /// <summary>
    /// Progressive low-alpha pull, ballistic coast, nose-on-V reentry, then ram dip/relight.
    /// After dip, another skip may open when range and fuel still warrant it (Sanger multi-skip).
    /// Entry is FL500–FL600 / high Mach after the ram climb shelf.
    /// </summary>
    void UpdateZoomLobPhase(
        in AircraftState player, double mach, double qPa, double noseOnVelocityErrorDeg,
        double contactRangeM, double fuelLb, double reserveFuelLb, bool zoomLobProfile) {
        const double PullGammaRad = 40.0 * Math.PI / 180.0;
        const double CoastEntryAltM = 28_000.0; // ~FL920 — q collapsing
        const double ReenterAltM = 24_000.0;    // start aligning on the way down
        const double RelightQPa = 4_000.0;

        if ((int)_phase < (int)RapierMissionPhase.ZoomPull) {
            if (_lobSkip <= 0) _lobSkip = 1;
            EnterPhase(RapierMissionPhase.ZoomPull, "zoom_pull_entry");
            return;
        }

        if (_phase == RapierMissionPhase.ZoomPull) {
            if (player.Gamma >= PullGammaRad * 0.85
                || player.Position.Y >= CoastEntryAltM) {
                EnterPhase(RapierMissionPhase.ZoomCoast, "zoom_coast_ballistic");
            }
            return;
        }

        if (_phase == RapierMissionPhase.ZoomCoast) {
            // Apex passed: falling, still thin air — hand the pilot the nose→V problem.
            if (player.VelocityVector().Y < -20.0 && player.Position.Y < CoastEntryAltM + 8_000.0) {
                EnterPhase(RapierMissionPhase.ReenterAlign, "reenter_nose_on_v");
            }
            return;
        }

        if (_phase == RapierMissionPhase.ReenterAlign) {
            if (qPa >= RelightQPa
                || (noseOnVelocityErrorDeg < 12.0 && player.Position.Y < ReenterAltM)) {
                EnterPhase(RapierMissionPhase.DipRelight, "dip_relight");
            }
            return;
        }

        if (_phase == RapierMissionPhase.DipRelight) {
            if (mach < 2.2 || qPa < RelightQPa) return;
            if (ShouldAnotherLobSkip(
                    contactRangeM, fuelLb, reserveFuelLb, mach, zoomLobProfile)) {
                _lobSkip++;
                EnterPhase(RapierMissionPhase.ZoomPull, $"zoom_pull_skip_{_lobSkip}");
            } else {
                EnterPhase(RapierMissionPhase.Intercept, "post_lob_intercept");
            }
        }
    }

    bool ShouldAnotherLobSkip(
        double contactRangeM, double fuelLb, double reserveFuelLb, double mach,
        bool zoomLobProfile) =>
        zoomLobProfile
        && _lobSkip < MaxLobSkips
        && contactRangeM > AnotherSkipContactRangeM
        && mach >= 2.2
        && fuelLb > reserveFuelLb;

    static double ThrottleForMach(double targetMach, double mach,
        double trimLever, double gain, double maximumLever = 1.55) =>
        Math.Clamp(trimLever + (targetMach - mach) * gain, 0.0, maximumLever);

    public RapierMissionGuidance Step(
        in AircraftState player,
        in AircraftState contact,
        double trueAirspeedMps,
        IAtmosphereModel atmosphere,
        in AircraftParams playerAircraft,
        bool catapultActive,
        int liveOpponentCount,
        bool pursuitActive,
        int pursuerCount,
        double pursuitRangeM,
        in Vec3D home,
        in Vec3D recoveryInitial,
        bool recovered,
        bool patternOnly = false,
        bool zoomLobProfile = false,
        bool gunDroneEgress = false,
        RapierJobKind job = RapierJobKind.FormationIntercept,
        double noseOnVelocityErrorDeg = 0.0,
        double fuelLb = double.PositiveInfinity,
        double reserveFuelLb = 1_200.0,
        double aircraftSupportReferenceHeightM = 0.0) {
        AtmosphericState air = atmosphere.Sample(player.Position.Y);
        double mach = trueAirspeedMps / Math.Max(1.0, air.SpeedOfSoundMps);
        double qPa = 0.5 * air.DensityKgM3 * trueAirspeedMps * trueAirspeedMps;
        Vec3D contactDelta = contact.Position - player.Position;
        double contactRangeM = contactDelta.Length;
        Vec3D relativeVelocity = contact.VelocityVector() - player.VelocityVector();
        double closureMps = contactRangeM > 1.0
            ? -relativeVelocity.Dot(contactDelta * (1.0 / contactRangeM)) : 0.0;
        double interceptEtaSeconds = closureMps > 1.0
            ? contactRangeM / closureMps : double.PositiveInfinity;
        double homeRangeM = (home - player.Position).Length;
        string jobToken = JobToken(job);

        // CIRCUITS. Climbing back through pattern altitude with the final gates already set means
        // the aircraft bolted, went around, or did a touch-and-go — so re-arm the pattern and fly
        // it again rather than leaving the pilot on a completed approach with nowhere to go.
        if (_recoveryFinal
            && player.Position.Y - home.Y > CircuitResetHeightM
            && player.VelocityVector().Y > 2.0) {
            _recoveryMarshalReached = false;
            _recoveryLineupReached = false;
            _recoveryFinal = false;
            _circuitInitialReached = false;
            _circuitBreakReached = false;
            _circuitDownwindReached = false;
            _circuitBaseReached = false;
            _circuitInitialJoinEstablished = false;
            _circuitsFlown++;
        }

        if (recovered) {
            EnterPhase(RapierMissionPhase.Complete, "recovered");
        } else if (pursuitActive) {
            EnterPhase(RapierMissionPhase.Escape, "pursuit_active");
        } else if (gunDroneEgress) {
            if (homeRangeM <= RecoveryEntryHomeRangeM)
                EnterPhase(RapierMissionPhase.Recovery, "gun_drone_home_leq_150km");
            else if ((int)_phase < (int)RapierMissionPhase.Escape
                || homeRangeM > 200_000.0)
                EnterPhase(RapierMissionPhase.Escape, "gun_drone_away");
            else
                EnterPhase(RapierMissionPhase.ReturnToBase, "gun_drone_rtb");
        } else if (patternOnly) {
            // Pattern-only must not treat "no kill yet" as RTB during the stroke, and must not
            // chase the parked phantom contact used to satisfy BeatSetup's bandit slot.
            if (catapultActive) {
                _circuitShelfReached = false;
                _circuitInitialReached = false;
                _circuitBreakReached = false;
                _circuitDownwindReached = false;
                _circuitBaseReached = false;
                _circuitInitialJoinEstablished = false;
                EnterPhase(RapierMissionPhase.Launch, "pattern_catapult");
            } else if (!_circuitShelfReached
                && player.Position.Y < home.Y + CircuitShelfHeightM - 40.0) {
                EnterPhase(RapierMissionPhase.Climb, "pattern_climb_to_shelf");
            } else {
                _circuitShelfReached = true;
                EnterPhase(RapierMissionPhase.Recovery, "pattern_recovery");
            }
        } else if (liveOpponentCount <= 0) {
            // Start setup far enough out that even an arrival already on the marshal side retains
            // at least ~104 km to decelerate, descend and establish the inbound centreline.
            if (homeRangeM <= RecoveryEntryHomeRangeM)
                EnterPhase(RapierMissionPhase.Recovery, "home_leq_150km");
            else
                EnterPhase(RapierMissionPhase.ReturnToBase, "no_opponents_rtb");
        } else if (catapultActive) {
            EnterPhase(RapierMissionPhase.Launch, "catapult_active");
        } else if ((int)_phase < (int)RapierMissionPhase.Attack) {
            bool inZoomPhases = (int)_phase >= (int)RapierMissionPhase.ZoomPull
                && (int)_phase <= (int)RapierMissionPhase.DipRelight;
            ReachFightDecision decision = _reachFight.Decide(
                _phase,
                player.Position.Y,
                mach,
                qPa,
                player.Gamma,
                contactRangeM,
                fuelLb,
                reserveFuelLb,
                zoomLobProfile,
                _lobSkip,
                inZoomPhases);
            _intention = decision.Intention;
            _strategy = decision.Strategy;
            if (decision.Strategy != ReachFightStrategy.ZoomLob
                && decision.PhaseReason.Length > 0) {
                EnterPhase(decision.SuggestedPhase, decision.PhaseReason);
            }
            if (decision.Strategy == ReachFightStrategy.ZoomLob) {
                UpdateZoomLobPhase(player, mach, qPa, noseOnVelocityErrorDeg,
                    contactRangeM, fuelLb, reserveFuelLb, zoomLobProfile);
            }
        }

        int lobSkipMax = zoomLobProfile ? MaxLobSkips : 0;
        string skipCue = zoomLobProfile && _lobSkip > 0
            ? $"SKIP {_lobSkip}/{MaxLobSkips} · "
            : "";

        // Conservative material-capability screening ceiling. Flat external skins use turbulent
        // recovery temperature; Rapier's declared hot zones are the inlet lip / leading edges, so
        // their raw CMC capability must be screened against true stagnation T0 instead. This is a
        // failsafe, not a substitute for the missing component qualification envelope.
        double skinMachLimit = playerAircraft.AerothermalLimitReference
                == AerothermalLimitReferenceKind.StagnationTemperature
            ? AirData.MachLimitForStagnationTemperature(
                playerAircraft.SkinTemperatureLimitK, air.TemperatureK)
            : AirData.MachLimitForSkinTemperature(
                playerAircraft.SkinTemperatureLimitK, air.TemperatureK);

        double targetMach;
        double targetAltitudeFt;
        double targetGamma;
        double throttle;
        Vec3D waypoint;
        Vec3D? guidanceWaypoint = null;
        string cue;
        int recoveryGate = 0;
        string circuitLeg = "";
        double fdTargetKtas = 0.0;
        double gateHalfM = 0.0;
        Vec3D gateFace = new(0.0, 0.0, 1.0);
        bool gateInVolume = false;
        bool gateEnergyOk = false;

        switch (_phase) {
            case RapierMissionPhase.Launch:
                if (patternOnly) {
                    // Ski-jump stroke still needs punch, but never author an Intercept M0.9 dash.
                    double patternMach = CircuitPatternSpeedMps
                        / Math.Max(1.0, air.SpeedOfSoundMps);
                    targetMach = Math.Min(0.48, patternMach);
                    targetAltitudeFt = (home.Y + CircuitShelfHeightM) * FeetPerMetre;
                    targetGamma = player.Gamma;
                    // Cat stroke punch only — Climb immediately holds pattern speed.
                    throttle = catapultActive ? 1.05 : PatternHoldThrottle(
                        CircuitPatternSpeedMps, trueAirspeedMps);
                    Vec3D departBox = PatternInitialPoint(home, recoveryInitial);
                    waypoint = departBox;
                    guidanceWaypoint = departBox;
                    circuitLeg = "DEPART";
                    fdTargetKtas = CircuitPatternKtas;
                    gateHalfM = CircuitGateHalfM;
                    PatternRunwayFrame(home, recoveryInitial,
                        out Vec3D rf, out _, out _);
                    gateFace = new(rf.X, 0.0, rf.Z);
                    if (gateFace.Length > 1e-6) gateFace = gateFace.Normalized();
                    double departKtas = trueAirspeedMps * 1.94384;
                    Vec3D departDelta = player.Position - departBox;
                    double along = departDelta.X * gateFace.X + departDelta.Z * gateFace.Z;
                    Vec3D right = new(-gateFace.Z, 0.0, gateFace.X);
                    double lateral = departDelta.X * right.X + departDelta.Z * right.Z;
                    gateInVolume = Math.Abs(along) <= CircuitGateDepthM
                        && Math.Abs(lateral) <= gateHalfM
                        && Math.Abs(departDelta.Y) <= gateHalfM;
                    gateEnergyOk = Math.Abs(departKtas - CircuitPatternKtas)
                        <= CircuitGateSpeedTolKtas;
                    cue = PatternLegConfigCue(
                        "DEPART", fdTargetKtas, targetAltitudeFt,
                        gateInVolume && gateEnergyOk ? "GATE OPEN"
                            : gateInVolume ? "GATE · ENERGY" : "LAUNCH");
                } else {
                    targetMach = 0.9;
                    targetAltitudeFt = 56_000.0;
                    targetGamma = player.Gamma;
                    throttle = 1.55;
                    waypoint = contact.Position;
                    cue = "AUTO LAUNCH · TRACK OWNS THE AIRCRAFT";
                }
                break;
            case RapierMissionPhase.Climb:
                if (patternOnly) {
                    double patternMach = CircuitPatternSpeedMps
                        / Math.Max(1.0, air.SpeedOfSoundMps);
                    targetMach = Math.Min(0.48, patternMach);
                    targetAltitudeFt = (home.Y + CircuitShelfHeightM) * FeetPerMetre;
                    targetGamma = AltitudeCaptureGamma(
                        home.Y + CircuitShelfHeightM,
                        player,
                        trueAirspeedMps,
                        captureSeconds: 45.0,
                        minimumGamma: -0.02,
                        maximumGamma: 0.18);
                    // Speed-error throttle in the pattern band — idle when fast so T/W cannot walk.
                    throttle = PatternHoldThrottle(CircuitPatternSpeedMps, trueAirspeedMps);
                    Vec3D departBox = PatternInitialPoint(home, recoveryInitial);
                    waypoint = departBox;
                    guidanceWaypoint = departBox;
                    circuitLeg = "DEPART";
                    fdTargetKtas = CircuitPatternKtas;
                    gateHalfM = CircuitGateHalfM;
                    PatternRunwayFrame(home, recoveryInitial,
                        out Vec3D climbRf, out _, out _);
                    gateFace = new(climbRf.X, 0.0, climbRf.Z);
                    if (gateFace.Length > 1e-6) gateFace = gateFace.Normalized();
                    double departKtas = trueAirspeedMps * 1.94384;
                    Vec3D climbDelta = player.Position - departBox;
                    double climbAlong = climbDelta.X * gateFace.X + climbDelta.Z * gateFace.Z;
                    Vec3D climbRight = new(-gateFace.Z, 0.0, gateFace.X);
                    double climbLat = climbDelta.X * climbRight.X + climbDelta.Z * climbRight.Z;
                    gateInVolume = Math.Abs(climbAlong) <= CircuitGateDepthM
                        && Math.Abs(climbLat) <= gateHalfM
                        && Math.Abs(climbDelta.Y) <= gateHalfM;
                    gateEnergyOk = Math.Abs(departKtas - CircuitPatternKtas)
                        <= CircuitGateSpeedTolKtas;
                    string departSpeedCall = gateInVolume && gateEnergyOk ? "GATE OPEN"
                        : gateInVolume ? "GATE · ENERGY"
                        : departKtas > fdTargetKtas + 25.0 ? "SLOW"
                        : departKtas < fdTargetKtas - 25.0 ? "ADD POWER" : "ON SPEED";
                    cue = PatternLegConfigCue(
                        "DEPART", fdTargetKtas, targetAltitudeFt, departSpeedCall);
                } else {
                    targetMach = 0.9;
                    targetAltitudeFt = 56_000.0;
                    targetGamma = AltitudeCaptureGamma(
                        ClimbTopM,
                        player,
                        trueAirspeedMps,
                        captureSeconds: 60.0,
                        minimumGamma: -0.02,
                        maximumGamma: 0.27);
                    throttle = ThrottleForMach(Math.Min(targetMach, skinMachLimit), mach,
                        trimLever: 0.62, gain: 1.10);
                    waypoint = contact.Position;
                    cue = $"AUTO CLIMB · HOLD M0.90 · M{mach:F2} · "
                        + $"FL{player.Position.Y * FeetPerMetre / 100.0:F0} → FL560";
                }
                break;
            case RapierMissionPhase.Accelerate:
                targetMach = 2.2;
                targetAltitudeFt = 56_000.0;
                targetGamma = AltitudeCaptureGamma(ClimbTopM, player,
                    trueAirspeedMps, captureSeconds: 90.0,
                    minimumGamma: -0.035, maximumGamma: 0.035);
                throttle = ThrottleForMach(Math.Min(targetMach, skinMachLimit), mach,
                    trimLever: 1.20, gain: 0.45);
                waypoint = contact.Position;
                cue = $"AUTO LEVEL ACCEL · M{mach:F2} → M2.20 · HOLD FL560";
                break;
            case RapierMissionPhase.RamClimb:
                // Stay below RamSpillStartMach (3.3). Commanding M4 here drove the article into the
                // spill band with almost no climb thrust left — FL694 forever, never FL700. Climb
                // on useful ram (~M3.1), then Intercept owns the dash.
                targetMach = 3.15;
                targetAltitudeFt = 70_000.0;
                targetGamma = AltitudeCaptureGamma(CruiseAltitudeM, player,
                    trueAirspeedMps, captureSeconds: 150.0,
                    minimumGamma: -0.025, maximumGamma: 0.070);
                throttle = ThrottleForMach(Math.Min(targetMach, skinMachLimit), mach,
                    trimLever: 1.08, gain: 0.42);
                waypoint = contact.Position;
                cue = $"AUTO RAM CLIMB · M{mach:F2} · FL{player.Position.Y * FeetPerMetre / 100.0:F0} → FL700";
                break;
            case RapierMissionPhase.ZoomPull:
                // Low-α progressive pull: command ~40° path, keep Mach, mild G — not a 9G snatch.
                targetMach = 3.8;
                targetAltitudeFt = 100_000.0;
                targetGamma = 40.0 * Math.PI / 180.0;
                throttle = ThrottleForMach(Math.Min(targetMach, skinMachLimit), mach,
                    trimLever: 1.05, gain: 0.35);
                waypoint = contact.Position;
                cue = $"ZOOM PULL · {skipCue}{jobToken} · γ→40° · α LOW · M{mach:F2} · "
                    + $"FL{player.Position.Y * FeetPerMetre / 100.0:F0}";
                break;
            case RapierMissionPhase.ZoomCoast:
                targetMach = 0.0;
                targetAltitudeFt = player.Position.Y * FeetPerMetre;
                targetGamma = player.Gamma;
                throttle = 0.0; // ballistic — fuel truth is the lob's point
                waypoint = contact.Position;
                if (job == RapierJobKind.SwarmLob
                    && player.VelocityVector().Y < 40.0
                    && player.Position.Y > 28_000.0) {
                    cue = $"SWARM LOB · {skipCue}APEX WINDOW · F RELEASES SWARM · "
                        + $"NOSE→V {noseOnVelocityErrorDeg:F0}° · RCS";
                } else {
                    cue = $"ZOOM COAST · {skipCue}{jobToken} · BALLISTIC · RCS · "
                        + $"NOSE→V {noseOnVelocityErrorDeg:F0}° · ALIGN";
                }
                break;
            case RapierMissionPhase.ReenterAlign:
                targetMach = 0.0;
                targetAltitudeFt = player.Position.Y * FeetPerMetre;
                // Hold path; FD cue is nose-on-V error — pilot/RCS closes it.
                targetGamma = player.Gamma;
                throttle = 0.0;
                waypoint = contact.Position;
                cue = noseOnVelocityErrorDeg <= 8.0
                    ? $"REENTER · {skipCue}{jobToken} · ON V · HOLD · THEN DIP"
                    : $"REENTER · {skipCue}{jobToken} · ALIGN NOSE ON V · "
                        + $"ERR {noseOnVelocityErrorDeg:F0}° · RCS";
                break;
            case RapierMissionPhase.DipRelight:
                targetMach = 3.2;
                targetAltitudeFt = 70_000.0;
                targetGamma = AltitudeCaptureGamma(CruiseAltitudeM, player,
                    trueAirspeedMps, captureSeconds: 90.0,
                    minimumGamma: -0.05, maximumGamma: 0.08);
                throttle = ThrottleForMach(Math.Min(targetMach, skinMachLimit), mach,
                    trimLever: 1.05, gain: 0.40);
                waypoint = contact.Position;
                cue = $"DIP RELIGHT · {skipCue}{jobToken} · RAM ON · M{mach:F2} · "
                    + $"FL{player.Position.Y * FeetPerMetre / 100.0:F0}";
                break;
            case RapierMissionPhase.Intercept:
                targetMach = MeasuredDashMach;
                targetAltitudeFt = 70_000.0;
                targetGamma = AltitudeCaptureGamma(CruiseAltitudeM, player,
                    trueAirspeedMps, captureSeconds: 120.0,
                    minimumGamma: -0.040, maximumGamma: 0.040);
                throttle = ThrottleForMach(Math.Min(targetMach, skinMachLimit), mach,
                    trimLever: 1.08, gain: 0.42);
                waypoint = contact.Position;
                string eta = double.IsFinite(interceptEtaSeconds)
                    ? $"{Math.Floor(interceptEtaSeconds / 60.0):F0}:"
                        + $"{interceptEtaSeconds % 60.0:00}"
                    : "--:--";
                double commandedInterceptMach = Math.Min(targetMach, skinMachLimit);
                string thermalCap = skinMachLimit + 0.05 < targetMach
                    ? $" · THERM CAP M{skinMachLimit:F1}"
                    : "";
                cue = $"AUTO INTERCEPT · {contactRangeM / 1000.0:F0} KM · "
                    + $"CLOSURE {closureMps * 1.94384:F0} KT · ETA {eta} · "
                    + $"M{Math.Min(targetMach, skinMachLimit):F1} / FL700";
                break;
            case RapierMissionPhase.Attack:
                waypoint = contact.Position;
                if (job == RapierJobKind.Transport) {
                    // Dive onto a low transport after the lob — commit altitude for the pass.
                    targetMach = 2.4;
                    targetAltitudeFt = Math.Max(
                        (contact.Position.Y + 200.0) * FeetPerMetre, 8_000.0);
                    targetGamma = AltitudeCaptureGamma(contact.Position.Y + 200.0,
                        player, trueAirspeedMps, captureSeconds: 50.0,
                        minimumGamma: -0.18, maximumGamma: 0.020);
                    throttle = ThrottleForMach(Math.Min(targetMach, skinMachLimit), mach,
                        trimLever: 0.90, gain: 0.40, maximumLever: 1.35);
                    cue = $"TRANSPORT DIVE · {contactRangeM / 1000.0:F0} KM · "
                        + "ONE PASS · GUNS · THEN ESCAPE";
                } else if (job == RapierJobKind.SwarmLob) {
                    targetMach = 3.0;
                    targetAltitudeFt = (contact.Position.Y + 800.0) * FeetPerMetre;
                    targetGamma = AltitudeCaptureGamma(contact.Position.Y + 800.0,
                        player, trueAirspeedMps, captureSeconds: 70.0,
                        minimumGamma: -0.080, maximumGamma: 0.040);
                    throttle = ThrottleForMach(Math.Min(targetMach, skinMachLimit), mach,
                        trimLever: 0.96, gain: 0.40, maximumLever: 1.35);
                    cue = $"SWARM RELEASE · {liveOpponentCount} CONTACTS · "
                        + "PRESS F · HIGH PASS · DO NOT FOLLOW DOWN";
                } else if (job == RapierJobKind.Balloon) {
                    targetMach = 2.8;
                    targetAltitudeFt = (contact.Position.Y + 400.0) * FeetPerMetre;
                    targetGamma = AltitudeCaptureGamma(contact.Position.Y + 400.0,
                        player, trueAirspeedMps, captureSeconds: 60.0,
                        minimumGamma: -0.090, maximumGamma: 0.040);
                    throttle = ThrottleForMach(Math.Min(targetMach, skinMachLimit), mach,
                        trimLever: 0.92, gain: 0.40, maximumLever: 1.30);
                    cue = $"BALLOON · {contactRangeM / 1000.0:F0} KM · "
                        + "SOFT TARGET · GUNS · ONE SLASH";
                } else {
                    targetMach = 3.2;
                    targetAltitudeFt = (contact.Position.Y + 600.0) * FeetPerMetre;
                    targetGamma = AltitudeCaptureGamma(contact.Position.Y + 600.0,
                        player, trueAirspeedMps, captureSeconds: 75.0,
                        minimumGamma: -0.075, maximumGamma: 0.050);
                    throttle = ThrottleForMach(Math.Min(targetMach, skinMachLimit), mach,
                        trimLever: 0.96, gain: 0.40, maximumLever: 1.35);
                    cue = job == RapierJobKind.Awacs
                        ? $"AWACS · {liveOpponentCount} CONTACTS · "
                            + "PRESS F TO RELEASE GUN-DRONE · PURSUERS COMING"
                        : $"CONTACT IN RANGE · {liveOpponentCount} CONTACTS · "
                            + "PRESS F TO RELEASE GUN-DRONE";
                }
                break;
            case RapierMissionPhase.Escape:
                targetMach = MeasuredDashMach;
                targetAltitudeFt = 70_000.0;
                targetGamma = AltitudeCaptureGamma(CruiseAltitudeM, player,
                    trueAirspeedMps, captureSeconds: 120.0,
                    minimumGamma: -0.050, maximumGamma: 0.050);
                throttle = ThrottleForMach(Math.Min(targetMach, skinMachLimit), mach,
                    trimLever: 1.08, gain: 0.42);
                waypoint = recoveryInitial;
                cue = _phaseReason == "gun_drone_away"
                    ? "GUN-DRONE AWAY · EGRESS HOME · "
                        + $"DASH M{Math.Min(MeasuredDashMach, skinMachLimit):F1}"
                    : $"FORMATION DESTROYED · EGRESS HOME · {pursuerCount} PURSUERS · "
                        + $"{pursuitRangeM / 1000.0:F0} KM SEPARATION · "
                        + $"DASH M{Math.Min(MeasuredDashMach, skinMachLimit):F1}";
                break;
            case RapierMissionPhase.ReturnToBase:
                targetMach = 2.0;
                targetAltitudeFt = 45_000.0;
                targetGamma = AltitudeCaptureGamma(45_000.0 * 0.3048,
                    player, trueAirspeedMps, captureSeconds: 150.0,
                    minimumGamma: -0.060, maximumGamma: 0.025);
                // The ram stream makes substantial installed thrust at a small lever above M2.5.
                // Feeding the turbine-style 0.80 trim into that regime held the aircraft near M3
                // for twenty minutes and consumed the landing reserve while the cue claimed M2.
                // Idle the ram phase through handover, then capture M2 on turbine-biased trim.
                throttle = mach > 2.25
                    ? 0.0
                    : ThrottleForMach(Math.Min(targetMach, skinMachLimit), mach,
                        trimLever: 0.55, gain: 0.80, maximumLever: 1.20);
                waypoint = recoveryInitial;
                cue = $"RETURN HOME · BASE {homeRangeM / 1000.0:F0} KM · M2.0 / FL450";
                break;
            case RapierMissionPhase.Recovery:
                targetMach = 0.30;
                if (patternOnly) {
                    StepPatternOverhead(
                        player, home, recoveryInitial, trueAirspeedMps,
                        out Vec3D patternGate,
                        out Vec3D patternWaypoint,
                        out circuitLeg,
                        out cue,
                        out double patternSpeedMps,
                        out recoveryGate,
                        out targetGamma,
                        out gateHalfM,
                        out gateFace,
                        out gateInVolume,
                        out gateEnergyOk);
                    guidanceWaypoint = patternGate;
                    waypoint = patternWaypoint;
                    double patternTrimLever = circuitLeg switch {
                        "WIRE_FINAL" => 0.14,
                        "SHORT_FINAL" => 0.20,
                        _ => 0.26
                    };
                    throttle = PatternHoldThrottle(
                        patternSpeedMps, trueAirspeedMps, patternTrimLever);
                    targetAltitudeFt = patternGate.Y * FeetPerMetre;
                    fdTargetKtas = circuitLeg switch {
                        "INITIAL" or "CROSSWIND" or "DOWNWIND" => CircuitPatternKtas,
                        "BREAK" => CircuitBreakKtas,
                        "BASE" => CircuitBaseKtas,
                        "SHORT_FINAL" => CircuitFinalKtas,
                        "WIRE_FINAL" => CircuitWireKtas,
                        _ => patternSpeedMps * 1.94384
                    };
                    // Authored Mach stays in the pattern band so automation never chases Intercept energy.
                    targetMach = Math.Min(0.42,
                        patternSpeedMps / Math.Max(1.0, air.SpeedOfSoundMps));
                    break;
                }
                Vec3D runwayForwardRaw = new(
                    home.X - recoveryInitial.X, 0.0,
                    home.Z - recoveryInitial.Z);
                Vec3D runwayForward = runwayForwardRaw.Length > 1.0
                    ? runwayForwardRaw.Normalized() : new Vec3D(0.0, 0.0, 1.0);
                Vec3D recoveryMarshal = recoveryInitial - runwayForward * 30_000.0
                    + new Vec3D(0.0, 3_700.0, 0.0);
                double marshalRangeM = (recoveryMarshal - player.Position).Length;
                if (marshalRangeM <= 8_000.0) _recoveryMarshalReached = true;
                Vec3D recoveryLineup = recoveryInitial - runwayForward * 10_000.0
                    + new Vec3D(0.0, 1_200.0, 0.0);
                double lineupRangeM = (recoveryLineup - player.Position).Length;
                double runwayHeadingError = Math.Abs(WrapAngle(
                    Math.Atan2(runwayForward.X, runwayForward.Z) - player.Chi));
                Vec3D toLineup = recoveryLineup - player.Position;
                double lineupAlongM = toLineup.Dot(runwayForward);
                double lineupHorizontalSquared = toLineup.X * toLineup.X
                    + toLineup.Z * toLineup.Z;
                double lineupCrossTrackM = Math.Sqrt(Math.Max(0.0,
                    lineupHorizontalSquared - lineupAlongM * lineupAlongM));
                if (_recoveryMarshalReached
                    && lineupAlongM <= 2_500.0
                    && lineupAlongM >= -5_000.0
                    && lineupCrossTrackM <= 1_500.0
                    && Math.Abs(toLineup.Y) <= 1_000.0
                    && runwayHeadingError <= 45.0 * Math.PI / 180.0)
                    _recoveryLineupReached = true;
                // Guidance is expressed at AircraftState.Position, while contact is evaluated at
                // the loaded wheel/cradle support plane. Preserve the calibrated 1.5 m aim height
                // above that plane instead of silently aiming a non-zero support reference low.
                Vec3D physicalTouchdown = home - runwayForward * 240.0
                    + new Vec3D(
                        0.0,
                        aircraftSupportReferenceHeightM + 1.5,
                        0.0);
                Vec3D toInitial = recoveryInitial - player.Position;
                double initialRangeM = toInitial.Length;
                // Three kilometres of spherical tolerance allowed an offset arrival to arm the
                // groove with nearly two kilometres of cross-track error. Position alone also let
                // an aircraft crossing the point backwards arm the final. Make the machine earn
                // the groove: marshal behind the strip, then cross initial on runway heading.
                double alongToInitialM = toInitial.Dot(runwayForward);
                double initialHorizontalSquared = toInitial.X * toInitial.X
                    + toInitial.Z * toInitial.Z;
                double initialCrossTrackM = Math.Sqrt(Math.Max(0.0,
                    initialHorizontalSquared
                        - alongToInitialM * alongToInitialM));
                double initialAltitudeErrorM = Math.Abs(toInitial.Y);
                if (_recoveryLineupReached
                    && alongToInitialM <= 750.0
                    && alongToInitialM >= -3_000.0
                    && initialCrossTrackM <= 750.0
                    && initialAltitudeErrorM <= 750.0
                    && runwayHeadingError <= 10.0 * Math.PI / 180.0
                    && Math.Abs(player.Bank) <= 25.0 * Math.PI / 180.0)
                    _recoveryFinal = true;
                // Aim the flight path below the slab so the reduced-order pitch response carries
                // the trailing hook through wire three rather than floating along the deck. Lateral
                // steering looks THROUGH the strip; steering at the aim point itself made the
                // autopilot turn back toward it after crossing the point.
                Vec3D touchdownAim = physicalTouchdown
                    + new Vec3D(0.0, -20.0, 0.0);
                double distanceToWireM =
                    (physicalTouchdown - player.Position).Dot(runwayForward);
                Vec3D gatePoint;
                if (!_recoveryFinal) {
                    recoveryGate = 0;
                    gatePoint = !_recoveryMarshalReached ? recoveryMarshal
                        : !_recoveryLineupReached ? recoveryLineup
                        : recoveryInitial;
                } else if (distanceToWireM > 12_500.0) {
                    recoveryGate = 1;
                    gatePoint = physicalTouchdown - runwayForward * 12_000.0
                        + new Vec3D(0.0, 750.0, 0.0);
                } else if (distanceToWireM > 7_500.0) {
                    recoveryGate = 2;
                    gatePoint = physicalTouchdown - runwayForward * 7_000.0
                        + new Vec3D(0.0, 430.0, 0.0);
                } else if (distanceToWireM > 3_500.0) {
                    recoveryGate = 3;
                    gatePoint = physicalTouchdown - runwayForward * 3_000.0
                        + new Vec3D(0.0, 180.0, 0.0);
                } else {
                    recoveryGate = 4;
                    gatePoint = touchdownAim;
                }
                guidanceWaypoint = gatePoint;
                waypoint = _recoveryFinal
                    ? distanceToWireM > 0.0
                        ? physicalTouchdown
                        : physicalTouchdown + runwayForward * 50_000.0
                    : _recoveryMarshalReached
                        ? _recoveryLineupReached
                            // Look five kilometres through INITIAL. That is far enough to remove
                            // the zero-range bearing singularity, but close enough to converge a
                            // long-return arrival onto the centreline before the square is crossed.
                            ? recoveryInitial + runwayForward * 5_000.0
                            // Fly through LINEUP on the runway heading rather than steering at a
                            // zero-range point. The preceding marshal turn can arrive from either
                            // side; this short virtual extension makes it establish the inbound
                            // centreline before the state machine advances.
                            : recoveryLineup + runwayForward * 5_000.0
                        : gatePoint;
                double horizontalRangeM = Math.Max(1.0, Math.Sqrt(
                    Math.Pow(gatePoint.X - player.Position.X, 2.0)
                    + Math.Pow(gatePoint.Z - player.Position.Z, 2.0)));
                // Closed-loop gamma to a CALIBRATED aim point.
                //
                // Predicting deck intersection from the instantaneous flight-path angle and trimming
                // gamma (tried 2026-07-27) boltered the wire card: reduced-order pitch lag means
                // the aircraft does not fly the predicted path. HookAimOffsetM is not hook trail
                // (Carrier.HookToMainGearM = 6 m) — it is measured pitch-response compensation so
                // the approach aim sits where the hook actually arrives. Dead mass-scheduled gamma
                // trim was removed; the proper next step is a predictive model of the pitch law,
                // not another energy-fitted constant.
                // Pitch/path response is mass-sensitive: the same command at the 7,080 kg recovery
                // card and the 5,660 kg post-sortie article does not intersect the slab at the same
                // along coordinate. Use a small bounded first-order predictor rather than another
                // one-mass constant. It changes lead by ~17 m across those measured cases and leaves
                // the public 290 m reference unchanged at 7,080 kg.
                double hookAimOffsetM = Math.Clamp(
                    290.0 + (7_080.0 - player.Mass) * 0.012,
                    275.0, 315.0);
                Vec3D finalAim = touchdownAim + runwayForward * hookAimOffsetM;
                double geometricFinalGamma = Math.Atan2(
                    finalAim.Y - player.Position.Y,
                    Math.Max(1.0, Math.Sqrt(
                        Math.Pow(finalAim.X - player.Position.X, 2.0)
                        + Math.Pow(finalAim.Z - player.Position.Z, 2.0))));
                double recoveryMinimumGamma = _recoveryFinal
                    ? recoveryGate switch {
                        1 => -0.12,
                        2 => -0.09,
                        _ => Math.Clamp(geometricFinalGamma, -0.11, -0.035)
                    }
                    : -0.16;
                targetGamma = Math.Clamp(
                    Math.Atan2(gatePoint.Y - player.Position.Y, horizontalRangeM),
                    recoveryMinimumGamma,
                    0.035);
                // Recovery is still a flown energy profile, not a long low-speed crawl. The
                // director sheds the M2 return in three generous shelves, arriving at the first
                // square configured and on speed. A pilot can take any shelf and fly it manually.
                double setupRangeM = !_recoveryMarshalReached ? marshalRangeM
                    : !_recoveryLineupReached ? lineupRangeM
                    : initialRangeM;
                double setupAltitudeM = !_recoveryMarshalReached
                    ? recoveryMarshal.Y
                    : !_recoveryLineupReached ? recoveryLineup.Y : recoveryInitial.Y;
                // Range alone is not an energy state. Do not select a low-speed shelf while the
                // aircraft is still kilometres above its setup altitude: at that density the
                // installed turbine cannot sustain the selected speed and the delta settles onto
                // its alpha limit. Descend into the shelf first, then decelerate.
                bool highAboveSetupShelf =
                    player.Position.Y > setupAltitudeM + 1_000.0;
                double approachSpeedMps;
                if (_recoveryFinal) {
                    approachSpeedMps = 88.0;
                } else if (!_recoveryMarshalReached) {
                    approachSpeedMps = setupRangeM > 100_000.0 ? 320.0
                        : setupRangeM > 40_000.0 || highAboveSetupShelf ? 180.0
                        : 120.0;
                } else if (!_recoveryLineupReached) {
                    // Marshal establishes the inbound heading; it is not a command to drag
                    // forty kilometres of empty setup leg at landing speed. Hold useful energy
                    // until the lineup capture, then configure while the first square grows.
                    approachSpeedMps = setupRangeM > 10_000.0 || highAboveSetupShelf ? 180.0
                        : setupRangeM > 3_000.0 ? 120.0
                        : 88.0;
                } else {
                    approachSpeedMps = setupRangeM > 5_000.0 ? 120.0 : 88.0;
                }
                double recoveryBaseThrottle = approachSpeedMps > 250.0 ? 0.90
                    : approachSpeedMps > 150.0 ? 0.52
                    : approachSpeedMps > 100.0 ? 0.22
                    : 0.04;
                double recoveryMaximumThrottle = approachSpeedMps > 250.0 ? 1.25
                    : approachSpeedMps > 150.0 ? 1.25
                    : approachSpeedMps > 100.0 ? 0.95
                    : 0.72;
                throttle = Math.Clamp(
                    recoveryBaseThrottle
                        + (approachSpeedMps - trueAirspeedMps) * 0.012,
                    0.0, recoveryMaximumThrottle);
                targetAltitudeFt = gatePoint.Y * FeetPerMetre;
                // INSTRUCTIONS, not status. This used to report which gate the aircraft was at and
                // how fast it was going, which tells a pilot where they are and nothing about what
                // to do. Each phase now names the one action that matters, the speed to fly, and
                // the fact that P will fly the whole approach — because "I'm not sure how to get
                // home and land" is a guidance failure, not a pilot failure.
                double targetKtas = approachSpeedMps * 1.94384;
                double currentKtas = trueAirspeedMps * 1.94384;
                string speedCall = currentKtas > targetKtas + 25.0 ? "SLOW"
                    : currentKtas < targetKtas - 25.0 ? "ADD POWER" : "ON SPEED";
                fdTargetKtas = targetKtas;
                cue = !_recoveryFinal
                    ? !_recoveryMarshalReached
                        ? $"RECOVERY · MARSHAL {setupRangeM / 1000.0:F0} KM · "
                            + $"SLOW TO {targetKtas:F0} KT, DESCEND · P FLIES THE APPROACH"
                        : !_recoveryLineupReached
                            ? $"RECOVERY · TURN ONTO FINAL · {targetKtas:F0} KT · {speedCall} · "
                                + "P FLIES THE APPROACH"
                            : $"RECOVERY · GEAR AND HOOK DOWN · {targetKtas:F0} KT · {speedCall} · "
                                + "P FLIES THE APPROACH"
                    : $"FINAL · SQUARE {recoveryGate}/4 · {targetKtas:F0} KT · {speedCall} · "
                        + "FLY THROUGH THE SQUARE, HOLD IT ALL THE WAY TO THE WIRE";
                break;
            default:
                targetMach = 0.0;
                targetAltitudeFt = home.Y * FeetPerMetre;
                targetGamma = 0.0;
                throttle = 0.0;
                waypoint = home;
                if (patternOnly) {
                    circuitLeg = "COMPLETE";
                    cue = "CIRCUITS · COMPLETE · RAPIER RECOVERED";
                } else {
                    cue = "RAPIER RECOVERED · SORTIE COMPLETE";
                }
                break;
        }

        double maximumBankDegrees = _phase switch {
            RapierMissionPhase.Launch => patternOnly ? 50.0 : 12.0,
            // Circuits climb joins INITIAL — PatternBankTargetRad owns the real bank when used.
            RapierMissionPhase.Climb or RapierMissionPhase.Accelerate
                or RapierMissionPhase.RamClimb => patternOnly ? 50.0 : 15.0,
            RapierMissionPhase.ZoomPull => 12.0,
            RapierMissionPhase.ZoomCoast or RapierMissionPhase.ReenterAlign => 20.0,
            RapierMissionPhase.DipRelight => 15.0,
            RapierMissionPhase.Intercept or RapierMissionPhase.Escape => 18.0,
            RapierMissionPhase.Attack => 22.0,
            RapierMissionPhase.ReturnToBase => 25.0,
            RapierMissionPhase.Recovery => patternOnly ? CircuitBreakBankMaxDeg : 30.0,
            _ => 15.0
        };
        double maximumG = _phase switch {
            RapierMissionPhase.ZoomPull => 3.5,
            RapierMissionPhase.Attack => 2.2,
            RapierMissionPhase.Recovery => 2.0,
            RapierMissionPhase.ReturnToBase => 1.8,
            _ => 1.65
        };
        double gammaGain = _phase == RapierMissionPhase.Recovery ? 8.0 : 4.0;
        double minimumG = _phase == RapierMissionPhase.Recovery ? 0.35 : 0.65;
        // Circuits: leg-specific bank (60°/75° break, 45°/60° base) and coordinated G ceiling.
        PilotCommand command = patternOnly
            && circuitLeg is not "" and not "COMPLETE"
            ? CommandTowardPattern(
                player, waypoint, targetGamma, throttle, circuitLeg,
                gammaGain, minimumG, PatternMaximumG(circuitLeg))
            : CommandToward(player, waypoint, targetGamma, throttle,
                maximumBankDegrees, gammaGain, minimumG, maximumG);
        double commandedMach = Math.Min(targetMach, skinMachLimit);
        if (fdTargetKtas <= 0.0 && commandedMach > 0.0) {
            fdTargetKtas = commandedMach * air.SpeedOfSoundMps * 1.94384;
        }
        return new RapierMissionGuidance(
            _phase,
            cue,
            commandedMach,
            targetAltitudeFt,
            command,
            guidanceWaypoint ?? waypoint,
            recoveryGate,
            AuthoredTargetMach: targetMach,
            SkinMachLimit: skinMachLimit,
            CommandedMach: commandedMach,
            PhaseReason: _phaseReason,
            CircuitLeg: circuitLeg,
            FdBankDeg: command.BankTarget * (180.0 / Math.PI),
            FdTargetKtas: fdTargetKtas,
            NoseOnVelocityErrorDeg: noseOnVelocityErrorDeg,
            JobToken: jobToken,
            LobSkip: zoomLobProfile ? _lobSkip : 0,
            LobSkipMax: lobSkipMax,
            GateHalfM: gateHalfM,
            GateFaceX: gateFace.X,
            GateFaceY: gateFace.Y,
            GateFaceZ: gateFace.Z,
            GateInVolume: gateInVolume,
            GateEnergyOk: gateEnergyOk,
            Intention: ReachFightDirector.Token(_intention),
            Strategy: ReachFightDirector.Token(_strategy));
    }
}
