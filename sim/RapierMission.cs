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
    /// <summary>Highest Mach the airframe skin allows at the current ambient.</summary>
    double SkinMachLimit = double.PositiveInfinity,
    /// <summary>Mach after Min(authored, skin). Same as TargetMach; named for snapshot clarity.</summary>
    double CommandedMach = 0.0,
    /// <summary>Stable token for why the current phase was entered (OFT gate rows).</summary>
    string PhaseReason = "",
    /// <summary>Circuits pattern leg token: DEPART, INITIAL, BREAK, DOWNWIND, BASE, SHORT_FINAL, WIRE_FINAL.</summary>
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
    int LobSkipMax = 0);

public sealed record ScriptedInterceptConfig(
    int FormationSize = 4,
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
    /// Zoom-lob profile: after ram climb, pull into a ballistic coast, align nose to V, relight.
    /// </summary>
    bool ZoomLobProfile = false,
    /// <summary>
    /// Dev fallback: instant formation wipe and pursuit egress instead of one physical gun-drone.
    /// Default off — the Attack contract releases one reusable drone per F press.
    /// </summary>
    bool DeterministicSwarmWipe = false,
    RapierJobKind Job = RapierJobKind.FormationIntercept);

/// <summary>
/// Deterministic mission director for the Rapier public-data surrogate. The director commands the
/// same PilotCommand path as a human, so propulsion, fuel, G, physiology, terrain and recovery
/// remain ordinary kernel truth. Any pilot input takes authority without erasing the script; only
/// an explicit automation command hands the aircraft back to the director.
/// </summary>
public sealed class RapierMissionDirector {
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
    /// Height above the strip that counts as "going around" rather than still landing. 300 m is
    /// above any bounce and below pattern altitude, so a touch-and-go re-arms but a long float
    /// down the runway does not.
    const double CircuitResetHeightM = 300.0;
    /// Circuits pattern altitude AGL — Mirage/F-104 class overhead, not Intercept marshal FL120.
    const double CircuitShelfHeightM = 550.0;
    /// Overhead pattern KTAS (INITIAL / DOWNWIND / DEPART). Not an Intercept Mach dash.
    const double CircuitPatternKtas = 300.0;
    const double CircuitBaseKtas = 220.0;
    const double CircuitFinalKtas = 180.0;
    const double CircuitWireKtas = 170.0;
    const double CircuitPatternSpeedMps = CircuitPatternKtas / 1.94384;
    const double CircuitBaseSpeedMps = CircuitBaseKtas / 1.94384;
    const double CircuitFinalSpeedMps = CircuitFinalKtas / 1.94384;
    const double CircuitWireSpeedMps = CircuitWireKtas / 1.94384;
    /// Left-hand downwind offset for a brick jet at ~300 KT / ~45° bank (~2.25 NM).
    const double CircuitDownwindOffsetM = 2.25 * 1852.0;
    /// Initial / short-final distance before threshold along the runway axis.
    const double CircuitInitialAlongM = 2_000.0;
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
        // Gear stays up through short final (T&G / go-around before midfield gear). Wire final
        // accepts the trap configured for landing.
        string config = circuitLeg switch {
            "WIRE_FINAL" => "HOOK DOWN · GEAR DOWN · FLAPS DOWN",
            _ => "HOOK DOWN · GEAR UP · FLAPS UP"
        };
        string legLabel = circuitLeg.Replace('_', ' ');
        if (circuitLeg == "WIRE_FINAL" && recoveryGate > 0)
            legLabel = $"{legLabel} · BOX {recoveryGate}/4";
        string action = circuitLeg switch {
            "DEPART" => "CLIMB TO PATTERN",
            "INITIAL" => "BREAK LEFT ABM",
            "BREAK" => "~45° TO DOWNWIND",
            "DOWNWIND" => "ABEAM",
            "BASE" => "TURN TO FINAL",
            "SHORT_FINAL" => "GO AROUND BEFORE GEAR",
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
        out double targetGamma) {
        PatternRunwayFrame(home, recoveryInitial,
            out Vec3D runwayForward, out Vec3D runwayLeft, out Vec3D threshold);
        double patternY = home.Y + CircuitShelfHeightM;
        Vec3D initialPoint = threshold - runwayForward * CircuitInitialAlongM
            + new Vec3D(0.0, patternY - threshold.Y, 0.0);
        Vec3D downwindEntry = initialPoint + runwayLeft * CircuitDownwindOffsetM;
        Vec3D downwindAbeam = threshold + runwayLeft * CircuitDownwindOffsetM
            + new Vec3D(0.0, patternY - threshold.Y, 0.0);
        Vec3D basePoint = threshold - runwayForward * (CircuitInitialAlongM * 0.55)
            + runwayLeft * (CircuitDownwindOffsetM * 0.40)
            + new Vec3D(0.0, home.Y + 280.0 - threshold.Y, 0.0);
        Vec3D shortFinal = threshold - runwayForward * 1_200.0
            + new Vec3D(0.0, home.Y + 120.0 - threshold.Y, 0.0);
        Vec3D touchdownAim = threshold + new Vec3D(0.0, -20.0, 0.0);
        double runwayHeading = Math.Atan2(runwayForward.X, runwayForward.Z);
        double headingError = Math.Abs(WrapAngle(runwayHeading - player.Chi));
        double downwindHeading = Math.Atan2(-runwayForward.X, -runwayForward.Z);
        double downwindHeadingError = Math.Abs(WrapAngle(downwindHeading - player.Chi));
        Vec3D playerPosition = player.Position;
        double playerBank = player.Bank;

        bool Near(in Vec3D point, double radiusM) =>
            (point - playerPosition).Length <= radiusM;

        // Allow OFT / join from mid-pattern: presence at a later station earns earlier legs.
        // Do NOT treat INITIAL (same runway axis, ~2 km out, pattern alt) as short-final.
        if (Near(basePoint, 1_600.0)
            && Math.Abs(playerPosition.Y - basePoint.Y) <= 200.0) {
            _circuitInitialReached = true;
            _circuitBreakReached = true;
            _circuitDownwindReached = true;
        } else if (Near(downwindAbeam, 2_000.0)
            && downwindHeadingError <= 50.0 * Math.PI / 180.0) {
            _circuitInitialReached = true;
            _circuitBreakReached = true;
        } else if (Near(downwindEntry, 1_800.0)) {
            _circuitInitialReached = true;
        }

        if (!_circuitInitialReached
            && Near(initialPoint, 1_200.0)
            && headingError <= 25.0 * Math.PI / 180.0)
            _circuitInitialReached = true;
        if (_circuitInitialReached
            && !_circuitBreakReached
            && Near(downwindEntry, 1_600.0)
            && downwindHeadingError <= 40.0 * Math.PI / 180.0)
            _circuitBreakReached = true;
        if (_circuitBreakReached
            && !_circuitDownwindReached
            && Near(downwindAbeam, 1_800.0))
            _circuitDownwindReached = true;
        if (_circuitDownwindReached
            && !_circuitBaseReached
            && Near(basePoint, 1_400.0))
            _circuitBaseReached = true;
        if (_circuitBaseReached
            && !_recoveryFinal
            && Near(shortFinal, 1_000.0)
            && headingError <= 12.0 * Math.PI / 180.0
            && Math.Abs(playerBank) <= 30.0 * Math.PI / 180.0)
            _recoveryFinal = true;

        double distanceToWireM = (threshold - playerPosition).Dot(runwayForward);
        if (_recoveryFinal) {
            if (distanceToWireM > 12_500.0) {
                recoveryGate = 1;
                gatePoint = threshold - runwayForward * 12_000.0
                    + new Vec3D(0.0, 750.0, 0.0);
            } else if (distanceToWireM > 7_500.0) {
                recoveryGate = 2;
                gatePoint = threshold - runwayForward * 7_000.0
                    + new Vec3D(0.0, 430.0, 0.0);
            } else if (distanceToWireM > 3_500.0) {
                recoveryGate = 3;
                gatePoint = threshold - runwayForward * 3_000.0
                    + new Vec3D(0.0, 180.0, 0.0);
            } else {
                recoveryGate = 4;
                gatePoint = touchdownAim;
            }
            waypoint = distanceToWireM > 0.0
                ? threshold
                : threshold + runwayForward * 50_000.0;
            approachSpeedMps = CircuitWireSpeedMps;
            circuitLeg = "WIRE_FINAL";
        } else if (!_circuitInitialReached) {
            recoveryGate = 0;
            gatePoint = initialPoint;
            waypoint = initialPoint + runwayForward * 4_000.0;
            approachSpeedMps = CircuitPatternSpeedMps;
            circuitLeg = "INITIAL";
        } else if (!_circuitBreakReached) {
            recoveryGate = 0;
            gatePoint = downwindEntry;
            waypoint = downwindEntry;
            approachSpeedMps = CircuitPatternSpeedMps;
            circuitLeg = "BREAK";
        } else if (!_circuitDownwindReached) {
            recoveryGate = 0;
            gatePoint = downwindAbeam;
            waypoint = downwindAbeam + runwayForward * -3_000.0;
            approachSpeedMps = CircuitPatternSpeedMps;
            circuitLeg = "DOWNWIND";
        } else if (!_circuitBaseReached) {
            recoveryGate = 0;
            gatePoint = basePoint;
            waypoint = basePoint;
            approachSpeedMps = CircuitBaseSpeedMps;
            circuitLeg = "BASE";
        } else {
            recoveryGate = 0;
            gatePoint = shortFinal;
            waypoint = shortFinal + runwayForward * 3_000.0;
            approachSpeedMps = CircuitFinalSpeedMps;
            circuitLeg = "SHORT_FINAL";
        }

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
        targetGamma = Math.Clamp(
            Math.Atan2(gatePoint.Y - playerPosition.Y, horizontalRangeM),
            recoveryMinimumGamma,
            0.06);

        double targetKtas = circuitLeg switch {
            "INITIAL" or "BREAK" or "DOWNWIND" => CircuitPatternKtas,
            "BASE" => CircuitBaseKtas,
            "SHORT_FINAL" => CircuitFinalKtas,
            "WIRE_FINAL" => CircuitWireKtas,
            _ => Math.Round(approachSpeedMps * 1.94384)
        };
        double currentKtas = trueAirspeedMps * 1.94384;
        string speedCall = currentKtas > targetKtas + 25.0 ? "SLOW"
            : currentKtas < targetKtas - 25.0 ? "ADD POWER" : "ON SPEED";
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
        double contactRangeM, double fuelLb, double reserveFuelLb) {
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
            if (ShouldAnotherLobSkip(contactRangeM, fuelLb, reserveFuelLb, mach)) {
                _lobSkip++;
                EnterPhase(RapierMissionPhase.ZoomPull, $"zoom_pull_skip_{_lobSkip}");
            } else {
                EnterPhase(RapierMissionPhase.Intercept, "post_lob_intercept");
            }
        }
    }

    bool ShouldAnotherLobSkip(
        double contactRangeM, double fuelLb, double reserveFuelLb, double mach) =>
        _lobSkip < MaxLobSkips
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
        double reserveFuelLb = 1_200.0) {
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
            _circuitsFlown++;
        }

        if (recovered) {
            EnterPhase(RapierMissionPhase.Complete, "recovered");
        } else if (pursuitActive) {
            EnterPhase(RapierMissionPhase.Escape, "pursuit_active");
        } else if (gunDroneEgress) {
            if (homeRangeM <= 90_000.0)
                EnterPhase(RapierMissionPhase.Recovery, "gun_drone_home_leq_90km");
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
                EnterPhase(RapierMissionPhase.Launch, "pattern_catapult");
            } else if (!_circuitShelfReached
                && player.Position.Y < home.Y + CircuitShelfHeightM - 40.0) {
                EnterPhase(RapierMissionPhase.Climb, "pattern_climb_to_shelf");
            } else {
                _circuitShelfReached = true;
                EnterPhase(RapierMissionPhase.Recovery, "pattern_recovery");
            }
        } else if (liveOpponentCount <= 0) {
            // Remain on the M2/FL450 return until 90 km. The recovery marshal lies beyond the
            // strip, leaving about 136 km to decelerate, descend and reverse onto final.
            if (homeRangeM <= 90_000.0)
                EnterPhase(RapierMissionPhase.Recovery, "home_leq_90km");
            else
                EnterPhase(RapierMissionPhase.ReturnToBase, "no_opponents_rtb");
        } else if (catapultActive) {
            EnterPhase(RapierMissionPhase.Launch, "catapult_active");
        } else if ((int)_phase < (int)RapierMissionPhase.Attack) {
            if (contactRangeM <= 30_000.0
                && (!zoomLobProfile
                    || (int)_phase >= (int)RapierMissionPhase.DipRelight)) {
                EnterPhase(RapierMissionPhase.Attack, "contact_leq_30km");
            } else if (player.Position.Y < ClimbTopM - 40.0
                && (int)_phase <= (int)RapierMissionPhase.Climb) {
                EnterPhase(RapierMissionPhase.Climb, "climb_to_fl560");
            } else if (mach < 2.2
                && (int)_phase <= (int)RapierMissionPhase.Accelerate) {
                EnterPhase(RapierMissionPhase.Accelerate, "accel_to_m2.2");
            } else if (player.Position.Y < CruiseAltitudeM - 40.0
                && (int)_phase <= (int)RapierMissionPhase.RamClimb
                && (int)_phase < (int)RapierMissionPhase.ZoomPull) {
                EnterPhase(RapierMissionPhase.RamClimb, "ram_climb_to_fl700");
            } else if (zoomLobProfile) {
                UpdateZoomLobPhase(player, mach, qPa, noseOnVelocityErrorDeg,
                    contactRangeM, fuelLb, reserveFuelLb);
            } else {
                EnterPhase(RapierMissionPhase.Intercept, "intercept_dash");
            }
        }

        int lobSkipMax = zoomLobProfile ? MaxLobSkips : 0;
        string skipCue = zoomLobProfile && _lobSkip > 0
            ? $"SKIP {_lobSkip}/{MaxLobSkips} · "
            : "";

        // The airframe's own ceiling. Every commanded Mach below is clamped to this, so the
        // automation never asks for a speed that cooks the structure — and the phase cues that
        // used to command M4.00 now command whatever the skin actually allows. Infinity for any
        // airframe that declares no limit, so nothing else in the game is touched.
        double skinMachLimit = AirData.MachLimitForSkinTemperature(
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

        switch (_phase) {
            case RapierMissionPhase.Launch:
                if (patternOnly) {
                    // Ski-jump stroke still needs punch, but never author an Intercept M0.9 dash.
                    double patternMach = CircuitPatternSpeedMps
                        / Math.Max(1.0, air.SpeedOfSoundMps);
                    targetMach = Math.Min(0.48, patternMach);
                    targetAltitudeFt = (home.Y + CircuitShelfHeightM) * FeetPerMetre;
                    targetGamma = player.Gamma;
                    throttle = 1.20;
                    Vec3D departBox = PatternInitialPoint(home, recoveryInitial);
                    waypoint = departBox;
                    guidanceWaypoint = departBox;
                    circuitLeg = "DEPART";
                    fdTargetKtas = CircuitPatternKtas;
                    cue = PatternLegConfigCue(
                        "DEPART", fdTargetKtas, targetAltitudeFt, "LAUNCH");
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
                    // Speed-error throttle in the pattern band — not ThrottleForMach chasing a dash.
                    throttle = Math.Clamp(
                        0.58 + (CircuitPatternSpeedMps - trueAirspeedMps) * 0.010,
                        0.20, 0.95);
                    Vec3D departBox = PatternInitialPoint(home, recoveryInitial);
                    waypoint = departBox;
                    guidanceWaypoint = departBox;
                    circuitLeg = "DEPART";
                    fdTargetKtas = CircuitPatternKtas;
                    double departKtas = trueAirspeedMps * 1.94384;
                    string departSpeedCall = departKtas > fdTargetKtas + 25.0 ? "SLOW"
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
                targetMach = 4.0;
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
                targetMach = 4.0;
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
                cue = $"AUTO INTERCEPT · {contactRangeM / 1000.0:F0} KM · "
                    + $"CLOSURE {closureMps * 1.94384:F0} KT · ETA {eta} · M{skinMachLimit:F1} / FL700";
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
                targetMach = 4.0;
                targetAltitudeFt = 70_000.0;
                targetGamma = AltitudeCaptureGamma(CruiseAltitudeM, player,
                    trueAirspeedMps, captureSeconds: 120.0,
                    minimumGamma: -0.050, maximumGamma: 0.050);
                throttle = ThrottleForMach(Math.Min(targetMach, skinMachLimit), mach,
                    trimLever: 1.08, gain: 0.42);
                waypoint = recoveryInitial;
                cue = _phaseReason == "gun_drone_away"
                    ? "GUN-DRONE AWAY · EGRESS HOME · "
                        + $"DASH M{Math.Min(4.0, skinMachLimit):F1}"
                    : $"FORMATION DESTROYED · EGRESS HOME · {pursuerCount} PURSUERS · "
                        + $"{pursuitRangeM / 1000.0:F0} KM SEPARATION · "
                        + $"DASH M{Math.Min(4.0, skinMachLimit):F1}";
                break;
            case RapierMissionPhase.ReturnToBase:
                targetMach = 2.0;
                targetAltitudeFt = 45_000.0;
                targetGamma = AltitudeCaptureGamma(45_000.0 * 0.3048,
                    player, trueAirspeedMps, captureSeconds: 150.0,
                    minimumGamma: -0.060, maximumGamma: 0.025);
                throttle = ThrottleForMach(Math.Min(targetMach, skinMachLimit), mach,
                    trimLever: 0.80, gain: 0.58, maximumLever: 1.35);
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
                        out targetGamma);
                    guidanceWaypoint = patternGate;
                    waypoint = patternWaypoint;
                    double patternBaseThrottle = patternSpeedMps > 140.0 ? 0.72
                        : patternSpeedMps > 100.0 ? 0.28
                        : 0.06;
                    throttle = Math.Clamp(
                        patternBaseThrottle
                            + (patternSpeedMps - trueAirspeedMps) * 0.012,
                        0.0, patternSpeedMps > 140.0 ? 1.15 : 0.72);
                    targetAltitudeFt = patternGate.Y * FeetPerMetre;
                    fdTargetKtas = circuitLeg switch {
                        "INITIAL" or "BREAK" or "DOWNWIND" => CircuitPatternKtas,
                        "BASE" => CircuitBaseKtas,
                        "SHORT_FINAL" => CircuitFinalKtas,
                        "WIRE_FINAL" => CircuitWireKtas,
                        _ => patternSpeedMps * 1.94384
                    };
                    // Authored Mach stays in the pattern band so automation never chases Intercept energy.
                    targetMach = Math.Min(0.48,
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
                Vec3D physicalTouchdown = home - runwayForward * 240.0
                    + new Vec3D(0.0, 1.5, 0.0);
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
                const double HookAimOffsetM = 260.0;
                Vec3D finalAim = touchdownAim + runwayForward * HookAimOffsetM;
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
                double approachSpeedMps;
                if (_recoveryFinal) {
                    approachSpeedMps = 88.0;
                } else if (!_recoveryMarshalReached) {
                    approachSpeedMps = setupRangeM > 100_000.0 ? 320.0
                        : setupRangeM > 40_000.0 ? 180.0
                        : 120.0;
                } else if (!_recoveryLineupReached) {
                    // Marshal establishes the inbound heading; it is not a command to drag
                    // forty kilometres of empty setup leg at landing speed. Hold useful energy
                    // until the lineup capture, then configure while the first square grows.
                    approachSpeedMps = setupRangeM > 10_000.0 ? 180.0
                        : setupRangeM > 3_000.0 ? 120.0
                        : 88.0;
                } else {
                    approachSpeedMps = setupRangeM > 5_000.0 ? 120.0 : 88.0;
                }
                double recoveryBaseThrottle = approachSpeedMps > 250.0 ? 0.90
                    : approachSpeedMps > 150.0 ? 0.52
                    : approachSpeedMps > 100.0 ? 0.22
                    : 0.04;
                throttle = Math.Clamp(
                    recoveryBaseThrottle
                        + (approachSpeedMps - trueAirspeedMps) * 0.012,
                    0.0, approachSpeedMps > 250.0 ? 1.25 : 0.72);
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
            RapierMissionPhase.Launch => patternOnly ? 25.0 : 12.0,
            RapierMissionPhase.Climb or RapierMissionPhase.Accelerate
                or RapierMissionPhase.RamClimb => patternOnly ? 30.0 : 15.0,
            RapierMissionPhase.ZoomPull => 12.0,
            RapierMissionPhase.ZoomCoast or RapierMissionPhase.ReenterAlign => 20.0,
            RapierMissionPhase.DipRelight => 15.0,
            RapierMissionPhase.Intercept or RapierMissionPhase.Escape => 18.0,
            RapierMissionPhase.Attack => 22.0,
            RapierMissionPhase.ReturnToBase => 25.0,
            RapierMissionPhase.Recovery => patternOnly ? 45.0 : 30.0,
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
        PilotCommand command = CommandToward(player, waypoint, targetGamma, throttle,
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
            LobSkipMax: lobSkipMax);
    }
}
