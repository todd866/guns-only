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
    Intercept,
    Attack,
    Escape,
    ReturnToBase,
    Recovery,
    Complete
}

public readonly record struct RapierMissionGuidance(
    RapierMissionPhase Phase,
    string Cue,
    double TargetMach,
    double TargetAltitudeFt,
    PilotCommand Command,
    Vec3D Waypoint,
    int RecoveryGate);

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
    bool RecoveryRequired = true);

/// <summary>
/// Deterministic mission director for the Rapier public-data surrogate. The director commands the
/// same PilotCommand path as a human, so propulsion, fuel, G, physiology, terrain and recovery
/// remain ordinary kernel truth. Pilot input temporarily takes authority without erasing the
/// script; the machine can resume after the takeover window.
/// </summary>
public sealed class RapierMissionDirector {
    const double ClimbTopM = 56_000.0 * 0.3048;
    const double CruiseAltitudeM = 70_000.0 * 0.3048;
    const double FeetPerMetre = 1.0 / 0.3048;
    RapierMissionPhase _phase = RapierMissionPhase.Launch;
    bool _recoveryMarshalReached;
    bool _recoveryLineupReached;
    bool _recoveryFinal;

    public RapierMissionPhase Phase => _phase;

    static double WrapAngle(double value) =>
        Math.IEEERemainder(value, 2.0 * Math.PI);

    static PilotCommand CommandToward(in AircraftState player, in Vec3D waypoint,
        double desiredGamma, double throttle) {
        Vec3D delta = waypoint - player.Position;
        double desiredHeading = Math.Atan2(delta.X, delta.Z);
        double headingError = WrapAngle(desiredHeading - player.Chi);
        double bankTarget = Math.Clamp(headingError * 1.35,
            -42.0 * Math.PI / 180.0, 42.0 * Math.PI / 180.0);
        double gammaError = desiredGamma - player.Gamma;
        double gDemand = Math.Clamp(1.0 + gammaError * 8.0, 0.35, 3.2);
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

    public RapierMissionGuidance Step(
        in AircraftState player,
        in AircraftState contact,
        double trueAirspeedMps,
        IAtmosphereModel atmosphere,
        bool catapultActive,
        int liveOpponentCount,
        bool pursuitActive,
        int pursuerCount,
        double pursuitRangeM,
        in Vec3D home,
        in Vec3D recoveryInitial,
        bool recovered) {
        AtmosphericState air = atmosphere.Sample(player.Position.Y);
        double mach = trueAirspeedMps / Math.Max(1.0, air.SpeedOfSoundMps);
        Vec3D contactDelta = contact.Position - player.Position;
        double contactRangeM = contactDelta.Length;
        Vec3D relativeVelocity = contact.VelocityVector() - player.VelocityVector();
        double closureMps = contactRangeM > 1.0
            ? -relativeVelocity.Dot(contactDelta * (1.0 / contactRangeM)) : 0.0;
        double interceptEtaSeconds = closureMps > 1.0
            ? contactRangeM / closureMps : double.PositiveInfinity;
        double homeRangeM = (home - player.Position).Length;

        if (recovered) {
            _phase = RapierMissionPhase.Complete;
        } else if (pursuitActive) {
            _phase = RapierMissionPhase.Escape;
        } else if (liveOpponentCount <= 0) {
            // Begin the recovery setup far enough out to shed Mach 1.5 and descend from FL380.
            // Waiting until the base was 24 km away left neither energy nor geometry for the
            // opposite-direction final.
            _phase = homeRangeM <= 220_000.0
                ? RapierMissionPhase.Recovery
                : RapierMissionPhase.ReturnToBase;
        } else if (catapultActive) {
            _phase = RapierMissionPhase.Launch;
        } else if ((int)_phase < (int)RapierMissionPhase.Attack) {
            if (contactRangeM <= 30_000.0) {
                _phase = RapierMissionPhase.Attack;
            } else if (player.Position.Y < ClimbTopM - 40.0
                && (int)_phase <= (int)RapierMissionPhase.Climb) {
                _phase = RapierMissionPhase.Climb;
            } else if (mach < 2.2
                && (int)_phase <= (int)RapierMissionPhase.Accelerate) {
                _phase = RapierMissionPhase.Accelerate;
            } else if (player.Position.Y < CruiseAltitudeM
                && (int)_phase <= (int)RapierMissionPhase.RamClimb) {
                _phase = RapierMissionPhase.RamClimb;
            } else {
                _phase = RapierMissionPhase.Intercept;
            }
        }

        double targetMach;
        double targetAltitudeFt;
        double targetGamma;
        double throttle;
        Vec3D waypoint;
        Vec3D? guidanceWaypoint = null;
        string cue;
        int recoveryGate = 0;

        switch (_phase) {
            case RapierMissionPhase.Launch:
                targetMach = 0.9;
                targetAltitudeFt = 56_000.0;
                targetGamma = player.Gamma;
                throttle = 1.55;
                waypoint = contact.Position;
                cue = "AUTO LAUNCH · TRACK OWNS THE AIRCRAFT";
                break;
            case RapierMissionPhase.Climb:
                targetMach = 0.9;
                targetAltitudeFt = 56_000.0;
                targetGamma = Math.Clamp(0.12 + 0.62 * (mach - 0.90), 0.015, 0.34);
                // The uprated engine has enough excess thrust to run through the inlet schedule
                // during the climb. Spend that energy on height instead: the computer rolls power
                // back above the M0.9 target, then restores full augmentation on the FL560 shelf.
                throttle = Math.Clamp(1.55 - Math.Max(0.0, mach - 0.88) * 3.0,
                    0.72, 1.55);
                waypoint = contact.Position;
                cue = $"AUTO CLIMB · HOLD M0.90 · M{mach:F2} · "
                    + $"FL{player.Position.Y * FeetPerMetre / 100.0:F0} → FL560";
                break;
            case RapierMissionPhase.Accelerate:
                targetMach = 2.2;
                targetAltitudeFt = 56_000.0;
                targetGamma = 0.0;
                throttle = 1.55;
                waypoint = contact.Position;
                cue = $"AUTO LEVEL ACCEL · M{mach:F2} → M2.20 · HOLD FL560";
                break;
            case RapierMissionPhase.RamClimb:
                targetMach = 4.0;
                targetAltitudeFt = 70_000.0;
                targetGamma = Math.Clamp(0.075 + 0.45 * (mach - 2.20), 0.01, 0.16);
                throttle = 1.55;
                waypoint = contact.Position;
                cue = $"AUTO RAM CLIMB · M{mach:F2} · FL{player.Position.Y * FeetPerMetre / 100.0:F0} → FL700";
                break;
            case RapierMissionPhase.Intercept:
                targetMach = 4.0;
                targetAltitudeFt = 70_000.0;
                targetGamma = Math.Clamp(
                    Math.Atan2(contact.Position.Y - player.Position.Y,
                        Math.Max(1.0, Math.Sqrt(
                            Math.Pow(contact.Position.X - player.Position.X, 2.0)
                            + Math.Pow(contact.Position.Z - player.Position.Z, 2.0)))),
                    -0.12, 0.08);
                throttle = mach < 3.95 ? 1.55 : 1.18;
                waypoint = contact.Position;
                string eta = double.IsFinite(interceptEtaSeconds)
                    ? $"{Math.Floor(interceptEtaSeconds / 60.0):F0}:"
                        + $"{interceptEtaSeconds % 60.0:00}"
                    : "--:--";
                cue = $"AUTO INTERCEPT · {contactRangeM / 1000.0:F0} KM · "
                    + $"CLOSURE {closureMps * 1.94384:F0} KT · ETA {eta} · M4.0 / FL700";
                break;
            case RapierMissionPhase.Attack:
                targetMach = 1.2;
                targetAltitudeFt = contact.Position.Y * FeetPerMetre;
                targetGamma = Math.Clamp(
                    Math.Atan2(contact.Position.Y - player.Position.Y,
                        Math.Max(1.0, Math.Sqrt(
                            Math.Pow(contact.Position.X - player.Position.X, 2.0)
                            + Math.Pow(contact.Position.Z - player.Position.Z, 2.0)))),
                    -0.35, 0.22);
                throttle = 1.1;
                waypoint = contact.Position;
                cue = $"FORMATION IN RANGE · {liveOpponentCount} CONTACTS · "
                    + "PRESS F TO RELEASE GUN-DRONE SWARM";
                break;
            case RapierMissionPhase.Escape:
                targetMach = 4.0;
                targetAltitudeFt = 70_000.0;
                targetGamma = Math.Clamp(
                    Math.Atan2(CruiseAltitudeM - player.Position.Y,
                        Math.Max(1.0, homeRangeM)),
                    -0.08, 0.10);
                throttle = mach < 3.95 ? 1.55 : 1.18;
                waypoint = recoveryInitial;
                cue = $"ESCAPE · {pursuerCount} PURSUERS · "
                    + $"{pursuitRangeM / 1000.0:F0} KM SEPARATION · DASH M4.0";
                break;
            case RapierMissionPhase.ReturnToBase:
                targetMach = 1.5;
                targetAltitudeFt = 38_000.0;
                targetGamma = Math.Clamp(
                    Math.Atan2(38_000.0 * 0.3048 - player.Position.Y,
                        Math.Max(1.0, homeRangeM)),
                    -0.10, 0.08);
                throttle = mach < 1.45 ? 1.25 : 0.82;
                waypoint = recoveryInitial;
                cue = $"AUTO RTB · BASE {homeRangeM / 1000.0:F0} KM · DESCEND FL380 / M1.5";
                break;
            case RapierMissionPhase.Recovery:
                targetMach = 0.30;
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
                if (_recoveryMarshalReached && lineupRangeM <= 1_500.0)
                    _recoveryLineupReached = true;
                Vec3D physicalTouchdown = home - runwayForward * 240.0
                    + new Vec3D(0.0, 1.5, 0.0);
                Vec3D toInitial = recoveryInitial - player.Position;
                double initialRangeM = toInitial.Length;
                // Three kilometres of spherical tolerance allowed an offset arrival to arm the
                // groove with nearly two kilometres of cross-track error. Position alone also let
                // an aircraft crossing the point backwards arm the final. Make the machine earn
                // the groove: marshal behind the strip, then cross initial on runway heading.
                double runwayHeadingError = Math.Abs(WrapAngle(
                    Math.Atan2(runwayForward.X, runwayForward.Z) - player.Chi));
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
                            ? physicalTouchdown + runwayForward * 2_000.0
                            : gatePoint
                        : gatePoint;
                double horizontalRangeM = Math.Max(1.0, Math.Sqrt(
                    Math.Pow(gatePoint.X - player.Position.X, 2.0)
                    + Math.Pow(gatePoint.Z - player.Position.Z, 2.0)));
                // The reduced-order pitch law lands a light aircraft a little earlier for the
                // same commanded flight path. Schedule the last two gates by actual landing mass
                // so both the authored low-reserve return and a deliberately lighter recovery
                // card aim the hook at wire three.
                double referenceLandingMassKg = 5_850.0 + 10.0 * Math.Clamp(
                    (player.Mass - 5_700.0) / 172.0, 0.0, 1.0);
                double landingMassGammaCorrection = Math.Clamp(
                    (referenceLandingMassKg - player.Mass) * 0.000002,
                    -0.001, 0.001);
                double recoveryMinimumGamma = _recoveryFinal && recoveryGate <= 2
                    ? -0.067
                    : _recoveryFinal
                        ? -0.06845 + landingMassGammaCorrection
                        : -0.16;
                targetGamma = Math.Clamp(
                    Math.Atan2(gatePoint.Y - player.Position.Y, horizontalRangeM),
                    recoveryMinimumGamma,
                    0.035);
                // Recovery is still a flown energy profile, not a 220 km low-speed crawl. The
                // director sheds the M1.5 return in three generous shelves, arriving at the first
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
                        : setupRangeM > 15_000.0 ? 120.0
                        : 88.0;
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
                cue = !_recoveryFinal
                    ? $"AUTO RECOVERY {(!_recoveryMarshalReached ? "MARSHAL"
                        : !_recoveryLineupReached ? "LINEUP" : "INITIAL")} · "
                        + $"{setupRangeM / 1000.0:F1} KM · "
                        + $"{approachSpeedMps * 1.94384:F0} KTAS"
                    : $"GATE {recoveryGate}/4 · WIRE 3 · "
                        + $"{trueAirspeedMps * 1.94384:F0} KTAS · FLY THROUGH THE SQUARE";
                break;
            default:
                targetMach = 0.0;
                targetAltitudeFt = home.Y * FeetPerMetre;
                targetGamma = 0.0;
                throttle = 0.0;
                waypoint = home;
                cue = "RAPIER RECOVERED · SORTIE COMPLETE";
                break;
        }

        return new RapierMissionGuidance(
            _phase,
            cue,
            targetMach,
            targetAltitudeFt,
            CommandToward(player, waypoint, targetGamma, throttle),
            guidanceWaypoint ?? waypoint,
            recoveryGate);
    }
}
