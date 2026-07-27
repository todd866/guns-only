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
/// remain ordinary kernel truth. Any pilot input takes authority without erasing the script; only
/// an explicit automation command hands the aircraft back to the director.
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

    static double ThrottleForMach(double targetMach, double mach,
        double trimLever, double gain, double maximumLever = 1.55) =>
        Math.Clamp(trimLever + (targetMach - mach) * gain, 0.0, maximumLever);

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
            // Remain on the M2/FL450 return until 90 km. The recovery marshal lies beyond the
            // strip, leaving about 136 km to decelerate, descend and reverse onto final. That is
            // still a real energy-management problem without turning the trip home into half an
            // hour of low-speed transit.
            _phase = homeRangeM <= 90_000.0
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
            } else if (player.Position.Y < CruiseAltitudeM - 40.0
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
                targetGamma = AltitudeCaptureGamma(ClimbTopM, player,
                    trueAirspeedMps, captureSeconds: 60.0,
                    minimumGamma: -0.02, maximumGamma: 0.27);
                // The uprated engine has enough excess thrust to run through the inlet schedule
                // during the climb. Spend that energy on height instead: the computer rolls power
                // back above the M0.9 target, then restores full augmentation on the FL560 shelf.
                throttle = ThrottleForMach(targetMach, mach,
                    trimLever: 0.62, gain: 1.10);
                waypoint = contact.Position;
                cue = $"AUTO CLIMB · HOLD M0.90 · M{mach:F2} · "
                    + $"FL{player.Position.Y * FeetPerMetre / 100.0:F0} → FL560";
                break;
            case RapierMissionPhase.Accelerate:
                targetMach = 2.2;
                targetAltitudeFt = 56_000.0;
                targetGamma = AltitudeCaptureGamma(ClimbTopM, player,
                    trueAirspeedMps, captureSeconds: 90.0,
                    minimumGamma: -0.035, maximumGamma: 0.035);
                throttle = ThrottleForMach(targetMach, mach,
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
                throttle = ThrottleForMach(targetMach, mach,
                    trimLever: 1.08, gain: 0.42);
                waypoint = contact.Position;
                cue = $"AUTO RAM CLIMB · M{mach:F2} · FL{player.Position.Y * FeetPerMetre / 100.0:F0} → FL700";
                break;
            case RapierMissionPhase.Intercept:
                targetMach = 4.0;
                targetAltitudeFt = 70_000.0;
                targetGamma = AltitudeCaptureGamma(CruiseAltitudeM, player,
                    trueAirspeedMps, captureSeconds: 120.0,
                    minimumGamma: -0.040, maximumGamma: 0.040);
                throttle = ThrottleForMach(targetMach, mach,
                    trimLever: 1.08, gain: 0.42);
                waypoint = contact.Position;
                string eta = double.IsFinite(interceptEtaSeconds)
                    ? $"{Math.Floor(interceptEtaSeconds / 60.0):F0}:"
                        + $"{interceptEtaSeconds % 60.0:00}"
                    : "--:--";
                cue = $"AUTO INTERCEPT · {contactRangeM / 1000.0:F0} KM · "
                    + $"CLOSURE {closureMps * 1.94384:F0} KT · ETA {eta} · M4.0 / FL700";
                break;
            case RapierMissionPhase.Attack:
                targetMach = 3.2;
                targetAltitudeFt = (contact.Position.Y + 600.0) * FeetPerMetre;
                targetGamma = AltitudeCaptureGamma(contact.Position.Y + 600.0,
                    player, trueAirspeedMps, captureSeconds: 75.0,
                    minimumGamma: -0.075, maximumGamma: 0.050);
                throttle = ThrottleForMach(targetMach, mach,
                    trimLever: 0.96, gain: 0.40, maximumLever: 1.35);
                waypoint = contact.Position;
                cue = $"FORMATION IN RANGE · {liveOpponentCount} CONTACTS · "
                    + "PRESS F TO RELEASE GUN-DRONE SWARM";
                break;
            case RapierMissionPhase.Escape:
                targetMach = 4.0;
                targetAltitudeFt = 70_000.0;
                targetGamma = AltitudeCaptureGamma(CruiseAltitudeM, player,
                    trueAirspeedMps, captureSeconds: 120.0,
                    minimumGamma: -0.050, maximumGamma: 0.050);
                throttle = ThrottleForMach(targetMach, mach,
                    trimLever: 1.08, gain: 0.42);
                waypoint = recoveryInitial;
                cue = $"FORMATION DESTROYED · EGRESS HOME · {pursuerCount} PURSUERS · "
                    + $"{pursuitRangeM / 1000.0:F0} KM SEPARATION · DASH M4.0";
                break;
            case RapierMissionPhase.ReturnToBase:
                targetMach = 2.0;
                targetAltitudeFt = 45_000.0;
                targetGamma = AltitudeCaptureGamma(45_000.0 * 0.3048,
                    player, trueAirspeedMps, captureSeconds: 150.0,
                    minimumGamma: -0.060, maximumGamma: 0.025);
                throttle = ThrottleForMach(targetMach, mach,
                    trimLever: 0.80, gain: 0.58, maximumLever: 1.35);
                waypoint = recoveryInitial;
                cue = $"RETURN HOME · BASE {homeRangeM / 1000.0:F0} KM · M2.0 / FL450";
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
                // The reduced-order pitch law lands a light aircraft a little earlier for the
                // same commanded flight path. Schedule the last two gates by actual landing mass
                // so both the authored low-reserve return and a deliberately lighter recovery
                // card aim the hook at wire three.
                // Final-gate path angle, measured rather than scheduled.
                //
                // This was a mass-scheduled correction against a 5,700 kg reference. Measurement
                // says the schedule was the problem: the two recoveries this sortie actually
                // produces arrive at 5,551 kg and 5,646 kg, and BOTH want the same correction of
                // about +0.00046 rad. A linear mass term cannot give two different masses the same
                // answer, so it was pushing the lighter arrival roughly 100 m long — which is how
                // the automation ended up missing the wires entirely once the physically limited
                // engine made the return burn more fuel.
                //
                // Measured sensitivity is about 110 m of hook position per 0.001 rad. Wire three
                // sits at TouchdownAlongM = -DeckLengthM * 0.2 = -240 m, and rollout sweeps toward
                // +along, so the hook must touch down just PAST wire three and sweep back onto it:
                // aiming at exactly -240 m catches wire four. The aim is -242 m.
                //
                // If a future recovery card arrives far outside 5,500-5,700 kg, re-measure before
                // reintroducing a mass term — do not assume the old gain was right.
                // Fitted to the two recoveries this sortie actually produces:
                //   5,646 kg wants ~0.00046   (measured: passes, hook inside the wire-three window)
                //   5,551 kg wants ~0.00042   (measured: 0.00046 lands 3.9 m long onto wire four)
                // which is a slope of about -4.2e-7 per kg referenced at 5,646 kg. That is a FIT TO
                // TWO POINTS over a 95 kg range, not a physical law — if a future recovery card
                // arrives outside roughly 5,500-5,700 kg, re-measure rather than extrapolating.
                const double FitReferenceMassKg = 5_646.0;
                double finalGateGammaCorrection = Math.Clamp(
                    0.00046 - 0.000000421 * (FitReferenceMassKg - player.Mass),
                    0.00030, 0.00060);
                // The first squares are capture gates, so permit a high initial arrival to
                // converge onto the published 3.5-degree line instead of preserving its error all
                // the way to the strip. The last two gates then tighten to the mass-scheduled
                // touchdown cap which places the trailing hook at wire three.
                double recoveryMinimumGamma = _recoveryFinal
                    ? recoveryGate switch {
                        1 => -0.12,
                        2 => -0.09,
                        _ => -0.06425 + finalGateGammaCorrection
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

        double maximumBankDegrees = _phase switch {
            RapierMissionPhase.Launch => 12.0,
            RapierMissionPhase.Climb or RapierMissionPhase.Accelerate
                or RapierMissionPhase.RamClimb => 15.0,
            RapierMissionPhase.Intercept or RapierMissionPhase.Escape => 18.0,
            RapierMissionPhase.Attack => 22.0,
            RapierMissionPhase.ReturnToBase => 25.0,
            RapierMissionPhase.Recovery => 30.0,
            _ => 15.0
        };
        double maximumG = _phase switch {
            RapierMissionPhase.Attack => 2.2,
            RapierMissionPhase.Recovery => 2.0,
            RapierMissionPhase.ReturnToBase => 1.8,
            _ => 1.65
        };
        double gammaGain = _phase == RapierMissionPhase.Recovery ? 8.0 : 4.0;
        double minimumG = _phase == RapierMissionPhase.Recovery ? 0.35 : 0.65;
        return new RapierMissionGuidance(
            _phase,
            cue,
            targetMach,
            targetAltitudeFt,
            CommandToward(player, waypoint, targetGamma, throttle,
                maximumBankDegrees, gammaGain, minimumG, maximumG),
            guidanceWaypoint ?? waypoint,
            recoveryGate);
    }
}
