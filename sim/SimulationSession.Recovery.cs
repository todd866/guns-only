using System.Collections.Generic;
using System.Linq;
using GunsOnly.Sim.Casevac;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Propulsion;
using GunsOnly.Sim.Recovery;
using GunsOnly.Sim.Training;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim;

// Partial of SimulationSession: Recovery.
public sealed partial class SimulationSession {
    public RecoveryProcedureDirector RecoveryProcedure => _recoveryProcedure;
    public ConventionalRunwayRecoveryModel? ConventionalRunwayRecovery =>
        _conventionalRunwayRecovery;
    public RunwayRecoveryPhase ConventionalRunwayPhase =>
        _conventionalRunwayRecovery?.Phase ?? RunwayRecoveryPhase.Airborne;
    public RunwayTouchdownResult RunwayTouchdown =>
        _conventionalRunwayRecovery?.Touchdown ?? RunwayTouchdownResult.None;
    /// <summary>
    /// True only when an accepted combat RTB has ended in a survivable physical runway contact,
    /// full stop, and the authoritative discontinued-sortie terminal transition. This deliberately
    /// excludes an unrequested runway stop and cannot be manufactured by navigation proximity.
    /// </summary>
    public bool ConventionalRtbRecoveryCompleted =>
        _returnToBaseReason != MissionRtbReason.None
        && _combatHandoffPhase == CombatHandoffPhase.Recovered
        && _conventionalRunwayRecovery is {
            Phase: RunwayRecoveryPhase.Recovered,
            Touchdown.Contact: true,
            Touchdown.Survivable: true
        }
        && Lifecycle == LifecycleState.Finished
        && _outcome == SortieOutcome.Discontinued;
    public bool RunwayWeightOnWheels =>
        _conventionalRunwayRecovery?.WeightOnWheels ?? false;
    public RecoveryProgress RecoveryProgress => _recoveryProgress;
    public RecoveryDifficulty Difficulty => _difficulty;
    public MissionRtbReason ReturnToBaseReason => _returnToBaseReason;
    public bool ReturnToBaseAvailable =>
        Lifecycle == LifecycleState.Active
        && _playerTerminalState == AircraftTerminalState.Flying
        && !PlayerRtbActive
        && (CombatHandoffAvailable
            || (RapierMissionAvailable
                && _beat.ScriptedIntercept?.PatternOnly != true
                && RapierPhase < RapierMissionPhase.ReturnToBase)
            || (!RapierMissionAvailable
                && _carrierSortieRoute.State.RtbAvailable));
    /// The navigation/recovery layer's stable authority hook. It remains active after the remote
    /// fight resolves or the relief aircraft is lost, and clears only on explicit recovery.
    public bool PlayerRtbActive =>
        _carrierSortieRoute.State.RtbRequested
        || (RapierMissionAvailable
            && RapierPhase != RapierMissionPhase.Complete
            && (_returnToBaseReason != MissionRtbReason.None
                || RapierPhase is RapierMissionPhase.ReturnToBase
                    or RapierMissionPhase.Recovery))
        || (_combatHandoffPhase >= CombatHandoffPhase.Requested
            && _combatHandoffPhase < CombatHandoffPhase.Recovered);

    /// <summary>
    /// Authoritative mission-level RTB request seam for input hosts. A successful return means the
    /// reason, ceasefire, successor suppression, and recovery navigation intent were latched as one
    /// transition; callers do not need to infer acceptance from a void key event.
    /// </summary>
    public bool TryRequestReturnToBase(
        MissionRtbReason reason = MissionRtbReason.PilotKnockItOff) {
        if (reason == MissionRtbReason.None) return false;
        // Keep the action contract identical to the published availability flag. In particular,
        // an already-latched Rapier/Bingo return must not fall through to a second carrier route
        // and overwrite the original reason, and pattern work must remain unavailable.
        if (!ReturnToBaseAvailable) return false;
        if (TryRequestRapierRtb(reason)) return true;
        // An active continuous fight owns KNOCK IT OFF even when the sortie also has a carrier:
        // relief/ceasefire must latch before the navigation-only carrier route can accept O.
        if (RequestCombatHandoff(reason)) return true;
        if (TryRequestCarrierSortieRtb(reason)) return true;
        return false;
    }

    void MaybeRequestBingoRtb() {
        if (!_fuel.IsBingo
            || PlayerRtbActive
            || _returnToBaseReason != MissionRtbReason.None)
            return;
        TryRequestReturnToBase(MissionRtbReason.BingoFuel);
    }

    /// <summary>
    /// Close the combat handoff only after an authoritative recovery model has recorded a physical
    /// full stop: either a survivable conventional-runway touchdown or a stopped carrier trap.
    /// Navigation/gate proximity can never manufacture this transition. Repeated completion after
    /// the same physical recovery is idempotently successful.
    /// </summary>
    public bool CompletePlayerRecovery() {
        if (_combatHandoffPhase == CombatHandoffPhase.Recovered) return true;
        bool conventionalFullStop = _conventionalRunwayRecovery is {
            Phase: RunwayRecoveryPhase.Recovered,
            Touchdown.Contact: true,
            Touchdown.Survivable: true
        };
        bool stoppedCarrierTrap = _carrier is not null
            && _recovery == Carrier.Recovery.Trap
            && _arrestment.Phase == ArrestmentModel.ArrestmentPhase.Stopped;
        if (!conventionalFullStop && !stoppedCarrierTrap) return false;
        bool combatHandoffRtb = _combatHandoffPhase
                >= CombatHandoffPhase.Requested
            && _combatHandoffPhase < CombatHandoffPhase.Recovered;
        if (!combatHandoffRtb
            || Lifecycle != LifecycleState.Active
            || _playerTerminalState != AircraftTerminalState.Flying)
            return false;
        _combatHandoffPhase = CombatHandoffPhase.Recovered;
        return true;
    }

    public bool TrySetRecoveryProcedure(int kindCode) {
        if (!_meshNav.HomePlate.HasValue) return kindCode == 0;
        MeshPlace home = _meshNav.HomePlate.Value;
        var homePos = new Vec3D(home.EastM, home.UpM ?? 0.0, home.NorthM);
        double heading = _beat.RecoveryPlan?.ConventionalRunway?.LandingHeadingRad
            ?? _carrier?.LandingHeadingRad
            ?? 0.0;
        if (kindCode is < 0 or > 3) return false;
        return _recoveryProcedure.TrySet((RecoveryProcedureKind)kindCode, homePos, heading);
    }
    /// <summary>
    /// The recovery schedule: what altitude and speed the pilot should hold at their present
    /// distance-to-go, how much power that wants, and which limit is shaping it. Drawn as a
    /// ribbon and a power bug; never spoken.
    /// </summary>
    public GoldenPathPoint RecoverySchedule => _goldenPath;

    /// The recovery energy model uses the same airframe polar and full gear/flap increments as
    /// flight physics. It is intentionally evaluated at live mass: no fleet-wide descent number
    /// can describe both the comparatively clean F-22 gear-only surrogate and Rapier's dirty
    /// gear-plus-elevon landing configuration.
    IAtmosphereModel RecoveryAtmosphere =>
        _weatherProfile?.Atmosphere ?? StandardAtmosphere1976.Instance;

    double PlayerApproachTrueAirspeedMps(double altitudeM) =>
        GunsOnly.Sim.Recovery.SortieSchedule.ApproachTrueAirspeedMps(
            Player.State.Mass,
            _beat.PlayerAir,
            PlayerSystemsProfile,
            altitudeM,
            RecoveryAtmosphere);

    double PlayerRecoveryDragToWeight(double altitudeM) =>
        GunsOnly.Sim.Recovery.SortieSchedule.RecoveryDragToWeight(
            Player.State.Mass,
            _beat.PlayerAir,
            PlayerSystemsProfile,
            altitudeM,
            RecoveryAtmosphere);

    /// Distance-to-go is range to the ladder's last gate: the stabilisation point is the only
    /// fixed end of the recovery, and it is what the schedule is solved backwards from.
    void UpdateGoldenPath() {
        if (_recoveryProcedure.Gates.Count == 0) {
            _goldenPath = default;
            return;
        }
        RecoveryGate last = _recoveryProcedure.Gates[^1];
        Vec3D p = Player.State.Position;
        double dx = p.X - last.EastM;
        double dz = p.Z - last.NorthM;
        double distanceToGoM = System.Math.Sqrt(dx * dx + dz * dz);
        // The gear/flap placard only binds once something is hanging out. Clean, the corridor is
        // owned by q and skin temperature instead.
        bool dirty = PlayerSystems.AllGearDownAndLocked
            || System.Math.Max(PlayerSystems.LeftFlapDegrees, PlayerSystems.RightFlapDegrees) > 1.0;
        double placardMps = dirty
            ? AirData.TrueAirspeedForCalibratedAirspeedMps(
                PlayerSystemsProfile.GearAndFlapLimitKias / AirData.MpsToKnots,
                last.UpM,
                RecoveryAtmosphere)
            : double.PositiveInfinity;
        double approachMps = PlayerApproachTrueAirspeedMps(last.UpM);
        _goldenPath = GoldenPath.Solve(
            distanceToGoM,
            Player.State.Position.Y,
            Player.State.Speed,
            _weatherProfile?.Atmosphere ?? StandardAtmosphere1976.Instance,
            stabiliseAltitudeM: last.UpM,
            stabiliseSpeedMps: approachMps,
            dragToWeight: PlayerRecoveryDragToWeight(last.UpM),
            configurationCeilingMps: placardMps);
    }

    /// <summary>
    /// The whole-sortie schedule — catshot, climb, cruise, descend, groove — as opposed to
    /// <see cref="RecoverySchedule"/>, which only ever answers for the way back down.
    ///
    /// This runs OUTSIDE UpdateRecoveryProcedure on purpose. That method returns immediately when
    /// no recovery procedure exists, which is exactly the state a launch is in, so a schedule
    /// nested inside it could never say anything about getting off the deck.
    /// </summary>
    public SortieScheduleState SortiePlan => _sortiePlan;

    /// <summary>
    /// Continuous approach guidance: always-flyable path gates plus next-gate energy targets.
    /// Arms on recovery intent; does not require a Mesh PROC selection.
    /// </summary>
    public GunsOnly.Sim.Recovery.ApproachGuidanceState ApproachGuidancePlan => _approachGuidance;

    /// <summary>Presentation authority for the F-22's named conventional traffic pattern.</summary>
    public bool ConventionalRtbPatternGuidanceActive =>
        PlayerRtbActive
        && ConventionalRunwayPhase == RunwayRecoveryPhase.Airborne
        && _approachGuidance is {
            GuidanceActive: true,
            Valid: true,
            ConventionalPattern: true
        };

    /// <summary>Total approach-solver invocations; instrumentation pinning the solve decimation.</summary>
    public long ApproachSolveCount => _approachSolveCount;

    void UpdateSortieSchedule() {
        Carrier? ship = _carrier;
        if (ship is null && _beat.RecoveryPlan is null) {
            _sortiePlan = default;
            return;
        }
        AircraftParams air = _beat.PlayerAir;
        double recoveryReferenceAltitudeM = ship is not null
            ? ship.TouchdownPoint.Y + 110.0
            : (_beat.RecoveryPlan?.ConventionalRunway?.ElevationM
                    ?? _beat.RecoveryPlan?.Position.Y
                    ?? Player.State.Position.Y)
                + GunsOnly.Sim.Recovery.ApproachGuidance.DefaultStabiliseHeightAboveSurfaceM;
        double approachMps = PlayerApproachTrueAirspeedMps(recoveryReferenceAltitudeM);
        // Climb and cruise are expressed as multiples of the aircraft's OWN on-speed rather than
        // as authored knots, so a second airframe inherits a shape instead of a Panther's numbers.
        // PROVISIONAL: the multiples want fitting from a flown profile, but a wrong ratio is
        // recoverable in a way that a hard-coded speed belonging to one aeroplane is not.
        double glideslopeRad = 3.5 * System.Math.PI / 180.0;
        double stabiliseHeightM = 110.0;
        var reference = new SortieReference(
            ApproachSpeedMps: approachMps,
            ClimbSpeedMps: 2.2 * approachMps,
            TransitSpeedMps: 2.7 * approachMps,
            TransitHeightM: 4_500.0,
            StabiliseHeightM: stabiliseHeightM,
            // Korean-War paddles worked a steeper slope than a modern optical ball.
            GlideslopeRad: glideslopeRad,
            DragToWeight: PlayerRecoveryDragToWeight(recoveryReferenceAltitudeM),
            SpoolUpTauS: air.SpoolUpTau,
            ConfigurationCeilingMps: AirData.TrueAirspeedForCalibratedAirspeedMps(
                PlayerSystemsProfile.GearAndFlapLimitKias / AirData.MpsToKnots,
                recoveryReferenceAltitudeM,
                RecoveryAtmosphere),
            RecoveryProfileFitted: PlayerSystemsProfile.RecoveryProfileFitted);

        // A launched carrier/strip sortie owns every leg from chocks to the ramp. Preserve that
        // path exactly: it also runs before an RTB procedure has been selected, which is why the
        // launch and climb cues exist at all.
        if (ship is not null
            && (_beat.StartsOnCatapult || (ship.IsMaritime && PlayerRtbActive))) {
            double heightAboveDeckM = ship.DeckFrame(Player.State.Position).height;
            Vec3D toShip = ship.Position - Player.State.Position;
            double rangeToShipM = System.Math.Sqrt(toShip.X * toShip.X + toShip.Z * toShip.Z);

            CarrierSortieRouteState route = _carrierSortieRoute.State;
            SortieLeg shipLeg;
            if (_catapult.IsActive) {
                shipLeg = _catapult.Phase == CatapultLaunchModel.LaunchPhase.Stroke
                    ? SortieLeg.Launch : SortieLeg.OnDeck;
            } else if (route.Active) {
                shipLeg = route.Phase switch {
                    CarrierSortieRoutePhase.OnDeck => SortieLeg.OnDeck,
                    CarrierSortieRoutePhase.Departure => heightAboveDeckM < 150.0
                        ? SortieLeg.Launch : SortieLeg.Climb,
                    CarrierSortieRoutePhase.Outbound
                        or CarrierSortieRoutePhase.Transit
                        or CarrierSortieRoutePhase.AwaitingReturn =>
                        heightAboveDeckM < 0.95 * route.TargetPosition.Y
                            ? SortieLeg.Climb : SortieLeg.Transit,
                    CarrierSortieRoutePhase.Return
                        or CarrierSortieRoutePhase.Recovery => SortieLeg.Recovery,
                    CarrierSortieRoutePhase.Groove
                        or CarrierSortieRoutePhase.Complete => SortieLeg.Groove,
                    _ => SortieLeg.Transit,
                };
            } else if (PlayerRtbActive || _recoveryProcedure.Kind != RecoveryProcedureKind.None) {
                shipLeg = rangeToShipM <= 1_500.0 ? SortieLeg.Groove : SortieLeg.Recovery;
            } else if (heightAboveDeckM < 150.0) {
                shipLeg = SortieLeg.Launch;
            } else if (heightAboveDeckM < 0.95 * reference.TransitHeightM) {
                shipLeg = SortieLeg.Climb;
            } else {
                shipLeg = SortieLeg.Transit;
            }

            double shipDistanceToGoM = shipLeg switch {
                _ when route.Active => route.DistanceToTargetM,
                SortieLeg.Recovery or SortieLeg.Groove => rangeToShipM,
                SortieLeg.Climb => System.Math.Max(
                    0.0, reference.TransitHeightM - heightAboveDeckM),
                _ => rangeToShipM,
            };

            _sortiePlan = GunsOnly.Sim.Recovery.SortieSchedule.Solve(
                shipLeg, heightAboveDeckM, Player.State.Speed, shipDistanceToGoM, reference);
            return;
        }

        // Conventional and other fixed recovery sites have no Carrier object, but they still have
        // an airframe, a landing datum, and an authored recovery ladder. Give them the same
        // two-sided, per-airframe recovery solve instead of falling through to GoldenPath's legacy
        // <= 0.5 power bug. The ladder's final gate defines the stabilisation point and slope, so
        // Recovery and Groove meet continuously rather than inventing a generic runway geometry.
        if (_beat.RecoveryPlan is not { } recoveryPlan
            || (!PlayerRtbActive
                && _recoveryProcedure.Kind == RecoveryProcedureKind.None)) {
            _sortiePlan = default;
            return;
        }

        Vec3D recoveryPoint = recoveryPlan.Position;
        double surfaceElevationM = recoveryPlan.ConventionalRunway?.ElevationM
            ?? recoveryPoint.Y;
        double stabiliseDistanceM = 1_500.0;
        glideslopeRad = 3.0 * System.Math.PI / 180.0;
        stabiliseHeightM = stabiliseDistanceM * System.Math.Tan(glideslopeRad);
        if (_recoveryProcedure.Gates.Count > 0) {
            RecoveryGate stabiliseGate = _recoveryProcedure.Gates[^1];
            double gateEast = stabiliseGate.EastM - recoveryPoint.X;
            double gateNorth = stabiliseGate.NorthM - recoveryPoint.Z;
            double gateDistanceM = System.Math.Sqrt(
                gateEast * gateEast + gateNorth * gateNorth);
            double gateHeightM = stabiliseGate.UpM - surfaceElevationM;
            if (gateDistanceM > 1.0 && gateHeightM > 0.0) {
                stabiliseDistanceM = gateDistanceM;
                stabiliseHeightM = gateHeightM;
                glideslopeRad = System.Math.Atan2(gateHeightM, gateDistanceM);
            }
        }
        reference = reference with {
            ApproachSpeedMps = PlayerApproachTrueAirspeedMps(
                surfaceElevationM + stabiliseHeightM),
            StabiliseHeightM = stabiliseHeightM,
            GlideslopeRad = glideslopeRad,
            DragToWeight = PlayerRecoveryDragToWeight(
                surfaceElevationM + stabiliseHeightM),
            ConfigurationCeilingMps = AirData.TrueAirspeedForCalibratedAirspeedMps(
                PlayerSystemsProfile.GearAndFlapLimitKias / AirData.MpsToKnots,
                surfaceElevationM + stabiliseHeightM,
                RecoveryAtmosphere),
            FlareTrackM = 600.0
        };

        Vec3D toRecovery = recoveryPoint - Player.State.Position;
        double rangeToRecoveryM = System.Math.Sqrt(
            toRecovery.X * toRecovery.X + toRecovery.Z * toRecovery.Z);
        double heightAboveSurfaceM = Player.State.Position.Y - surfaceElevationM;
        SortieLeg recoveryLeg = rangeToRecoveryM <= stabiliseDistanceM
            ? SortieLeg.Groove : SortieLeg.Recovery;
        double recoveryDistanceToGoM = recoveryLeg == SortieLeg.Groove
            ? rangeToRecoveryM
            : System.Math.Max(0.0, rangeToRecoveryM - stabiliseDistanceM);
        _sortiePlan = GunsOnly.Sim.Recovery.SortieSchedule.Solve(
            recoveryLeg,
            heightAboveSurfaceM,
            Player.State.Speed,
            recoveryDistanceToGoM,
            reference);
    }

    void UpdateApproachGuidance() {
        double heading = _beat.RecoveryPlan?.ConventionalRunway?.LandingHeadingRad
            ?? _carrier?.LandingHeadingRad
            ?? _recoveryProcedure.HomeHeadingRad;
        MeshPlace? home = _meshNav.HomePlate;
        Vec3D? recoveryPoint = null;
        if (_carrier is not null)
            recoveryPoint = _carrier.TouchdownPoint;
        else if (home is { } h)
            recoveryPoint = new Vec3D(h.EastM, h.UpM ?? 0.0, h.NorthM);

        GunsOnly.Sim.Recovery.RecoverySite site = GunsOnly.Sim.Recovery.RecoverySiteResolver.Resolve(
            _carrier,
            home,
            recoveryPointKnown: recoveryPoint is { } p && p.IsFinite,
            recoveryPoint,
            heading);

        bool fuelPressure = _fuel.IsBingo || _fuel.IsMinimumFuel || _fuel.IsEmergencyFuel;
        bool circuitsActive = _beat.ScriptedIntercept?.PatternOnly == true
            && Lifecycle == LifecycleState.Active;
        bool intent = GunsOnly.Sim.Recovery.ApproachGuidance.IntentActive(
            Lifecycle == LifecycleState.Active
                && _playerTerminalState == AircraftTerminalState.Flying,
            site.Known,
            PlayerRtbActive,
            fuelPressure,
            _carrierSortieRoute.State.Phase,
            circuitsActive,
            _recoveryProcedure.Kind != RecoveryProcedureKind.None);
        bool f22ConventionalRtb = intent
            && PlayerRtbActive
            && _beat.PlayerAircraft.Id == AircraftCapability.F22ASurrogate.Id
            && _conventionalRunwayRecovery?.Runway is not null;

        // Touchdown is a presentation boundary, not an eight-Hz guidance event. Clear the
        // airborne pattern before solve decimation can reuse stale gates as generic volumes or
        // briefly re-enable the generic approach-energy text during rollout.
        if (f22ConventionalRtb
            && ConventionalRunwayPhase != RunwayRecoveryPhase.Airborne) {
            if (_conventionalCarrierRecovery.Active)
                _conventionalCarrierRecovery.Reset();
            _conventionalRunwayPatternRecovery.Reset();
            _approachGuidance = GunsOnly.Sim.Recovery.ApproachGuidanceState.Inactive;
            return;
        }

        // Decimate the solve: the solver is pure in sim state, so re-solving every tick only
        // burns the descent/RTB frame budget. Re-solve on the tick grid or the instant intent
        // flips; otherwise the previously published state stands (guidance never gates physics).
        if (intent == _approachGuidance.GuidanceActive
            && _tick % ApproachSolveIntervalTicks != 0)
            return;
        if (intent) _approachSolveCount++;

        if (f22ConventionalRtb) {
            if (_conventionalCarrierRecovery.Active)
                _conventionalCarrierRecovery.Reset();
            ConventionalRunway conventionalRunway =
                _conventionalRunwayRecovery!.Runway;
            double approachCalibratedMps =
                GunsOnly.Sim.Recovery.SortieSchedule.ApproachCalibratedAirspeedMps(
                    Player.State.Mass,
                    _beat.PlayerAir,
                    PlayerSystemsProfile);
            // Ingress is flown clean. Use the more conservative of the clean level-flight polar
            // at ownship and at pattern entry, so a high-drag combat instant cannot make the
            // drawn energy route implausibly short. Once downwind, the authored gate schedule
            // takes over and explicitly calls for gear.
            double entryAltitudeM = conventionalRunway.Threshold.Y
                + 1_200.0 * 0.3048;
            double entryCalibratedMps = System.Math.Min(
                250.0 / AirData.MpsToKnots,
                approachCalibratedMps * 1.30);
            double entryTrueAirspeedMps = AirData.TrueAirspeedForCalibratedAirspeedMps(
                entryCalibratedMps,
                entryAltitudeM,
                RecoveryAtmosphere);
            double cleanDragToWeight = System.Math.Min(
                GunsOnly.Sim.Recovery.SortieSchedule.CleanLevelDragToWeight(
                    Player.State.Mass,
                    _beat.PlayerAir,
                    System.Math.Max(_player.AirspeedMps, 1.0),
                    Player.State.Position.Y,
                    RecoveryAtmosphere),
                GunsOnly.Sim.Recovery.SortieSchedule.CleanLevelDragToWeight(
                    Player.State.Mass,
                    _beat.PlayerAir,
                    entryTrueAirspeedMps,
                    entryAltitudeM,
                    RecoveryAtmosphere));
            _approachGuidance = _conventionalRunwayPatternRecovery.Step(
                active: true,
                runway: conventionalRunway,
                player: Player.State,
                trueAirspeedMps: _player.AirspeedMps,
                approachCalibratedAirspeedMps: approachCalibratedMps,
                cleanDragToWeight: cleanDragToWeight,
                touchdownReferenceHeightM: _conventionalRunwayRecovery.ReferenceHeightM,
                atmosphere: RecoveryAtmosphere,
                terrain: _terrainSurface);
            return;
        }
        if (_conventionalRunwayPatternRecovery.Active)
            _conventionalRunwayPatternRecovery.Reset();
        double scheduledApproachMps = GunsOnly.Sim.Recovery.SortieSchedule.ApproachSpeedMps(
             Player.State.Mass, _beat.PlayerAir);
        if (intent
            && _carrier is { } patternCarrier
            && TopGunFightRuntime.IsTopGunMission(_beat.MissionIdentity.Id)) {
            _approachGuidance = _conventionalCarrierRecovery.Step(
                active: true,
                 patternCarrier,
                 Player.State,
                 Player.State.Speed,
                 scheduledApproachMps);
            return;
        }
        if (_conventionalCarrierRecovery.Active)
            _conventionalCarrierRecovery.Reset();
        // Carrier SortieSchedule uses a 110 m shelf; strip recoveries keep the classic 500 ft AGL.
        double stabiliseHeightAboveSurfaceM = _carrier is { IsMaritime: true }
            ? 110.0
            : GunsOnly.Sim.Recovery.ApproachGuidance.DefaultStabiliseHeightAboveSurfaceM;
        double stabiliseAltitudeMsl = site.StabilisationAltitudeMsl(
            stabiliseHeightAboveSurfaceM);
        double approachMps = PlayerApproachTrueAirspeedMps(stabiliseAltitudeMsl);
        double turnRadiusM = System.Math.Max(
            800.0,
            approachMps * approachMps / (FlightModel.G0 * 0.577));
        double approachGlideslopeRad = _carrier is { IsMaritime: true }
            ? GunsOnly.Sim.Recovery.ApproachGuidance.DefaultGlideslopeRad
            : 3.0 * System.Math.PI / 180.0;

        _approachGuidance = GunsOnly.Sim.Recovery.ApproachGuidance.Publish(
            intent,
            site,
            Player.State.Position,
            Player.State.Speed,
            Player.State.Chi,
            stabiliseHeightAboveSurfaceM,
            approachMps,
            PlayerRecoveryDragToWeight(stabiliseAltitudeMsl),
            turnRadiusM,
            approachGlideslopeRad);
    }

    void UpdateRecoveryProcedure() {
        if (_recoveryProcedure.Kind == RecoveryProcedureKind.None) return;
        // RecoveryGate.TargetKtas is TRUE airspeed. IndicatedAirspeedMps is not, and by the top of
        // a recovery the difference is most of the energy band being measured against.
        double trueAirspeedKnots = Player.State.Speed * AirData.MpsToKnots;
        UpdateGoldenPath();
        _recoveryProcedure.Step(
            Player.State.Position,
            trueAirspeedKnots,
            PlayerSystems.AllGearDownAndLocked,
            Math.Max(PlayerSystems.LeftFlapDegrees, PlayerSystems.RightFlapDegrees) > 1.0);
    }

    void BeginTerminalClock(bool clearHeldInput = true) {
        if (double.IsPositiveInfinity(_terminalStartedAtMs)) {
            _terminalStartedAtMs = _simTimeMs;
            if (clearHeldInput) ClearHeldInput();
        }
    }

    void UpdatePendingOutcome() {
        bool playerLost = _playerTerminalState != AircraftTerminalState.Flying;
        if (!OpponentPresent) {
            _pendingOutcome = playerLost
                ? SortieOutcome.Defeat
                : SortieOutcome.None;
            return;
        }
        bool opponentLost = _opponentTerminalState != AircraftTerminalState.Flying;
        if (CombatHandoffRequested) {
            // Handoff is not a player victory condition. A surviving pilot remains in the same
            // physical sortie through remote relief combat and RTB; a lost pilot still loses.
            _pendingOutcome = playerLost
                ? SortieOutcome.Defeat
                : SortieOutcome.None;
            return;
        }
        if (!playerLost && OpponentReplacementPending) {
            _pendingOutcome = SortieOutcome.None;
            return;
        }
        _pendingOutcome = playerLost && opponentLost ? SortieOutcome.Draw
            : opponentLost ? SortieOutcome.Victory
            : playerLost ? SortieOutcome.Defeat
            : SortieOutcome.None;
    }

    static ImpactSurface SurfaceFor(Carrier.SolidCollision collision) => collision switch {
        Carrier.SolidCollision.FlightDeck => ImpactSurface.FlightDeck,
        Carrier.SolidCollision.Hull or Carrier.SolidCollision.Island =>
            ImpactSurface.CarrierStructure,
        _ => ImpactSurface.None
    };

    (ImpactSurface surface, Carrier.SolidCollision carrierSolid,
        Vec3D velocity, double height) DetectImpact(
        in AircraftState previous, in AircraftState current) {
        if (_carrier is not null) {
            Carrier.SolidCollision solid = _carrier.SweptSolidCollision(
                previous.Position, current.Position);
            ImpactSurface carrierSurface = SurfaceFor(solid);
            if (carrierSurface != ImpactSurface.None) {
                Vec3D surfaceVelocity = _carrier.DeckVelocityWorld
                    + new Vec3D(0.0, _carrier.DeckVerticalVelocityMps, 0.0);
                double height = current.Position.Y
                    - _carrier.DeckFrame(current.Position).height;
                return (carrierSurface, solid, surfaceVelocity, height);
            }
        }
        var natural = DetectNaturalSurface(current);
        return (natural.surface, Carrier.SolidCollision.None, Vec3D.Zero, natural.height);
    }

    (ImpactSurface surface, double height) DetectNaturalSurface(in AircraftState state) {
        if (_terrainSurface?.TrySample(state.Position.X, state.Position.Z,
            out TerrainSample sample) == true) {
            if (state.Position.Y > sample.HeightM)
                return (ImpactSurface.None, sample.HeightM);
            return (sample.Kind == TerrainSurfaceKind.Water
                ? ImpactSurface.Water : ImpactSurface.Ground, sample.HeightM);
        }
        return state.Position.Y <= 0.0
            ? (ImpactSurface.Water, 0.0) : (ImpactSurface.None, 0.0);
    }

    bool RegisterPlayerNaturalSurfaceImpact() {
        if (_playerTerminalState != AircraftTerminalState.Flying) return false;
        var contact = DetectNaturalSurface(_player.State);
        if (contact.surface == ImpactSurface.None) return false;
        RegisterUndamagedCrash(CombatRole.Player, contact.surface,
            Vec3D.Zero, contact.height);
        return true;
    }

    void RegisterAirborneImpact(CombatRole target, ImpactSurface surface,
        in Vec3D surfaceVelocity, double surfaceHeightM,
        Carrier.SolidCollision carrierSolid = Carrier.SolidCollision.None) {
        AircraftTerminalState state = target == CombatRole.Player
            ? _playerTerminalState : _opponentTerminalState;
        if (state != AircraftTerminalState.DestroyedAirborne) return;
        if (target == CombatRole.Player)
            _playerCarrierSolid = ResolvePlayerCarrierSolid(surface, carrierSolid);
        EmitEvent(SessionEventType.Impact, CombatRole.None, target, surface: surface);
        // Preserve the immutable contact state before WreckContactMotion applies its impulse. The
        // following central end-of-tick observation records the resulting post-impact state.
        if (target == CombatRole.Player && surface is ImpactSurface.FlightDeck
            or ImpactSurface.CarrierStructure)
            CaptureIncidentReplaySample(completedContactTick: true);
        StartWreckContact(target, surface, surfaceVelocity, surfaceHeightM,
            carrierSolid: carrierSolid);
    }

    void RegisterUndamagedCrash(CombatRole target, ImpactSurface surface,
        in Vec3D surfaceVelocity, double surfaceHeightM,
        bool tangentialImpulseAlreadyResolved = false,
        Carrier.SolidCollision carrierSolid = Carrier.SolidCollision.None) {
        AircraftTerminalState state = target == CombatRole.Player
            ? _playerTerminalState : _opponentTerminalState;
        if (state != AircraftTerminalState.Flying) return;
        // For a collision-caused loss, physical contact precedes the damage declaration. Keeping
        // both durable events preserves that causal difference from an airborne gun kill.
        bool replacementExpected = target == CombatRole.Opponent
            && !CombatHandoffRequested
            && (_beat.ContinuousCombat is not null
                || _wingmen.Any(static wingman => wingman.StillFighting))
            && _playerTerminalState == AircraftTerminalState.Flying;
        bool opponentLostDuringHandoff =
            target == CombatRole.Opponent && CombatHandoffRequested;
        BeginTerminalClock(clearHeldInput:
            !replacementExpected && !opponentLostDuringHandoff);
        if (target == CombatRole.Player)
            _playerCarrierSolid = ResolvePlayerCarrierSolid(surface, carrierSolid);
        EmitEvent(SessionEventType.Impact, CombatRole.None, target, surface: surface);
        if (target == CombatRole.Player && surface is ImpactSurface.FlightDeck
            or ImpactSurface.CarrierStructure)
            CaptureIncidentReplaySample(completedContactTick: true);
        // A maneuvering opponent flown into the surface while the player is alive and engaged is
        // a maneuver kill: the impact stays a physical event (source None), but the destruction is
        // attributed to the player and credited like a gun kill. Only genuine combat opponents
        // qualify — drone-raid targets keep their own leak/neutralize accounting, and a scripted
        // pattern bogey crashing in a non-combat beat credits nobody.
        bool maneuverKill = target == CombatRole.Opponent
            && !CombatHandoffRequested
            && _playerTerminalState == AircraftTerminalState.Flying
            && _droneRaidEvaluation is null
            && (_beat.ContinuousCombat is not null
                || _beat.UsesReactiveBandit || _beat.UsesNeutralMergeBandit);
        bool reliefManeuverKill = target == CombatRole.Opponent
            && CombatHandoffActive
            && _reliefFighter is { StillFighting: true }
            && _droneRaidEvaluation is null;
        if (maneuverKill) _killCount++;
        if (reliefManeuverKill) _reliefKills++;
        BeginCatastrophicDamage(target,
            maneuverKill ? CombatRole.Player
                : reliefManeuverKill ? CombatRole.Relief
                : CombatRole.None,
            promoteFormationSurvivor: false);
        StartWreckContact(target, surface, surfaceVelocity, surfaceHeightM,
            tangentialImpulseAlreadyResolved, carrierSolid);
        if (target == CombatRole.Opponent
            && _playerTerminalState == AircraftTerminalState.Flying)
            TryPromoteWingmanToPrimary();
        UpdatePendingOutcome();
        CompleteEngagementIfEnded();
    }

    Carrier.SolidCollision ResolvePlayerCarrierSolid(ImpactSurface surface,
        Carrier.SolidCollision detected) {
        if (detected != Carrier.SolidCollision.None) return detected;
        if (surface == ImpactSurface.FlightDeck)
            return Carrier.SolidCollision.FlightDeck;
        if (surface != ImpactSurface.CarrierStructure || _carrier is null)
            return Carrier.SolidCollision.None;
        Carrier.SolidCollision point = _carrier.SweptSolidCollision(
            _player.State.Position, _player.State.Position);
        return point is Carrier.SolidCollision.Hull or Carrier.SolidCollision.Island
            ? point : Carrier.SolidCollision.None;
    }

    void StartWreckContact(CombatRole target, ImpactSurface surface,
        in Vec3D surfaceVelocity, double surfaceHeightM,
        bool tangentialImpulseAlreadyResolved = false,
        Carrier.SolidCollision carrierSolid = Carrier.SolidCollision.None) {
        Carrier? contactCarrier = surface is ImpactSurface.FlightDeck
            or ImpactSurface.CarrierStructure ? _carrier : null;
        if (target == CombatRole.Player) {
            if (_maintenanceScenario is { Finished: false }) {
                _attemptHadSetback = true;
                _maintenanceScenario.RecordAircraftLost(TimeSeconds);
            }
            _playerTerminalState = AircraftTerminalState.Impacted;
            _playerImpactSurface = surface;
            _playerWreckMotion = new WreckContactMotion(_player.State, surface,
                surfaceVelocity, surfaceHeightM, contactCarrier,
                tangentialImpulseAlreadyResolved,
                ResolvePlayerCarrierSolid(surface, carrierSolid),
                _terrainSurface);
            _playerCarrierSolid = _playerWreckMotion.CarrierSolid;
            _player.AdoptExternalKinematics(_playerWreckMotion.State);
        } else {
            _opponentTerminalState = AircraftTerminalState.Impacted;
            _opponentImpactSurface = surface;
            _bandit.ApplySurfaceImpact(surface, surfaceVelocity, surfaceHeightM, contactCarrier,
                _terrainSurface);
        }
    }

    void ObserveSettledWrecks() {
        if (_playerTerminalState == AircraftTerminalState.Impacted
            && _playerWreckMotion is { SurfaceChangedThisStep: true } playerWreck) {
            _playerImpactSurface = playerWreck.Surface;
            _playerCarrierSolid = playerWreck.CarrierSolid;
            EmitEvent(SessionEventType.Impact, CombatRole.None, CombatRole.Player,
                surface: playerWreck.Surface);
        }
        if (OpponentPresent
            && _opponentTerminalState == AircraftTerminalState.Impacted
            && _bandit.WreckSurfaceChangedThisStep) {
            _opponentImpactSurface = _bandit.WreckSurface;
            EmitEvent(SessionEventType.Impact, CombatRole.None, CombatRole.Opponent,
                surface: _bandit.WreckSurface);
        }
        if (_playerTerminalState == AircraftTerminalState.Impacted
            && _playerWreckMotion is { Settled: true }) {
            _playerTerminalState = AircraftTerminalState.Settled;
            EmitEvent(SessionEventType.Settled, CombatRole.None, CombatRole.Player,
                surface: _playerImpactSurface);
        }
        if (OpponentPresent
            && _opponentTerminalState == AircraftTerminalState.Impacted
            && _bandit.WreckSettled) {
            _opponentTerminalState = AircraftTerminalState.Settled;
            EmitEvent(SessionEventType.Settled, CombatRole.None, CombatRole.Opponent,
                surface: _opponentImpactSurface);
        }
    }

    bool FinishTerminalIfResolved(double completedTimeMs) {
        if (OpponentReplacementPending) {
            TrySpawnContinuousOpponent(completedTimeMs);
            return false;
        }
        if (!TerminalPhaseActive) return false;
        // The relief result is deliberately not a terminal player result. Keep the same airframe,
        // fuel, damage and control authority alive through RTB and the external recovery model.
        // CompletePlayerRecovery records that model's success but does not fabricate a combat win.
        if (CombatHandoffRequested
            && _playerTerminalState == AircraftTerminalState.Flying)
            return false;
        // A finite Rapier formation kill is the turn point, not the finish line. Keep the
        // surviving aircraft fully flyable through RTB and arrestment; the ordinary recovery path
        // owns the final victory event. A later ownship loss still resolves normally.
        if (_beat.ScriptedIntercept is { RecoveryRequired: true }
            && _playerTerminalState == AircraftTerminalState.Flying
            && _opponentTerminalState != AircraftTerminalState.Flying)
            return false;
        // Kestrel's mouth pair is the job, not a combat terminal. Keep the surviving aircraft
        // flyable through RTB; the runway model owns the finish.
        if (_beat.FirstRunValley is not null
            && _playerTerminalState == AircraftTerminalState.Flying
            && _opponentTerminalState != AircraftTerminalState.Flying)
            return false;
        // A finite carrier-day route is itself the mission contract. No combat outcome may author
        // victory while ownship is still returning: only the physical stopped trap or explicit
        // straight-deck barrier path may finish the card. A later ownship loss still resolves
        // through the ordinary terminal path.
        if (_carrierSortieRoute.State.Active
            && _beat.RecoveryCompletesSortie
            && _playerTerminalState == AircraftTerminalState.Flying)
            return false;
        bool playerResolved = _playerTerminalState is AircraftTerminalState.Flying
            or AircraftTerminalState.Settled
            or AircraftTerminalState.SimulationBounded;
        bool opponentResolved = _opponentTerminalState is AircraftTerminalState.Flying
            or AircraftTerminalState.Settled
            or AircraftTerminalState.SimulationBounded;
        if (!playerResolved || !opponentResolved || !DetachedOpponentWrecksResolved) {
            if (completedTimeMs - _terminalStartedAtMs
                < TerminalSimulationLimitSeconds * 1000.0) return false;
            ForceTerminalLimit(CombatRole.Player);
            ForceTerminalLimit(CombatRole.Opponent);
            ForceDetachedOpponentTerminalLimits();
        }

        // A gun result must not tear a surviving ownship out of a physical deck phase. Finish the
        // already-engaged wire/catapult sequence first; otherwise a target which settles quickly can
        // freeze a valid trap halfway through its runout. The terminal limit remains the hard bound.
        bool ownshipRecoveryConstrained = _playerTerminalState == AircraftTerminalState.Flying
            && (_arrestment.Phase == ArrestmentModel.ArrestmentPhase.Arrested
                || _catapult.IsActive
                || _conventionalRunwayRecovery?.Phase
                    == RunwayRecoveryPhase.Rollout);
        if (ownshipRecoveryConstrained
            && completedTimeMs - _terminalStartedAtMs
                < TerminalSimulationLimitSeconds * 1000.0)
            return false;

        UpdatePendingOutcome();
        _outcome = _pendingOutcome;
        EmitEvent(SessionEventType.SortieFinished,
            CombatRole.None, CombatRole.None, outcome: _outcome);
        FinishPreviousRecoveryAttempt();
        ClearHeldInput();
        Lifecycle = LifecycleState.Finished;
        return true;
    }

    void FinishRecoveredMaintenanceSortie() {
        if (_maintenanceScenario is null || _maintenanceScenario.Finished) return;

        RecordStoppedTrap();
        _maintenanceScenario.RecordRecovered(TimeSeconds);
        _outcome = _maintenanceScenario.ProcedurallyComplete
            ? SortieOutcome.Victory
            : SortieOutcome.Draw;
        EmitEvent(SessionEventType.SortieFinished,
            CombatRole.None, CombatRole.None, outcome: _outcome);
        FinishPreviousRecoveryAttempt();
        ClearHeldInput();
        Lifecycle = LifecycleState.Finished;
    }

    void StepTerminalPhase() {
        AircraftState previousPlayer = _player.State;
        AircraftState previousOpponent = _bandit.State;
        StepWeapons(previousPlayer, previousOpponent,
            playerTriggerHeld: false, allowNewFire: false);

        if (_playerTerminalState == AircraftTerminalState.DestroyedAirborne) {
            TerminalFlightDynamics.Step(_player, PlayerAerodynamicConfiguration,
                handedness: -1, FixedDeltaSeconds);
            StepFailedPlayerSystems(weightOnWheels: false);
            _player.AerodynamicConfiguration = TerminalFlightDynamics.Configuration(
                PlayerAerodynamicConfiguration, handedness: -1);
        } else if (_playerTerminalState == AircraftTerminalState.Impacted
            && _playerWreckMotion is not null) {
            _player.AdvanceEngineOnly(0.0, FixedDeltaSeconds);
            _playerWreckMotion.Step(FixedDeltaSeconds);
            _player.AdoptExternalKinematics(_playerWreckMotion.State);
            StepFailedPlayerSystems(
                weightOnWheels: _playerWreckMotion.HasWeightBearingContact);
        } else if (_playerTerminalState == AircraftTerminalState.Flying) {
            // A surviving ownship remains a fully flyable aircraft while the destroyed opponent's
            // trajectory resolves. Re-run the normal input/control law every tick; freezing the
            // command present at the kill edge can manufacture a later ownship crash and a false
            // draw even though FeedKey still accepts pilot input.
            if (_carrier is not null) {
                bool inSlot = _carrier.InApproachSlot(_player.State,
                    _player.IndicatedAirspeedMps);
                ApplyCarrierConfigurationAutomation(inSlot);
                var (along, _, height) =
                    _carrier.LandingAircraftSupportFrame(_player.State.Position);
                double gsLineH = Math.Max(0.0,
                    -_carrier.DeckLengthM * 0.2 - along) * Carrier.GlideslopeSlope;
                _detents.GlideslopeErrorM = gsLineH - height;
                _detents.ApproachAirspeedMps = _player.AirspeedMps;
                _detents.DeckClosureMps = _carrier.DeckClosureMps(_player.State);
            }
            _advice = _beat.Law.Advise(_player.State, _bandit.State,
                _beat.PlayerAir, _player.AirspeedMps);
            _detents.AirspeedMps = _player.AirspeedMps;
            _detents.MeasuredAngleOfAttackRad = _player.AngleOfAttackRad;
            _detents.AerodynamicConfiguration =
                PlayerEffectiveAerodynamicConfiguration;
            ConfigureAssistedFlightDetents();
            _detents.Tick(_keys, _simTimeMs, _player.State, _beat.PlayerAir,
                _advice, FixedDeltaSeconds);
            if (_waveOffArmed && _detents.Throttle >= 0.95
                && !RapierAutomationActive) {
                _waveOffUntilMs = _simTimeMs + 5000.0;
                _waveOffArmed = false;
                SelectAutomaticConfigurationTarget(FlightConfigurationTarget.Combat);
                if (_recoveryAttemptActive) _attemptHadSetback = true;
            }
            _cue = _prompts.Cue(_advice, _detents.Command, _detents.Tier);
            PilotCommand directedCommand = RapierAutomationOr(_detents.Command);
            UpdatePilotLateralCommitment(_detents.Command.RollControl);
            PilotCommand assistedCommand = ApplyGunneryPitchAssist(directedCommand);
            PilotCommand effectiveCommand = ApplyPilotPhysiology(assistedCommand);
            PilotCommand padlockAssistedCommand = ApplyPlayerGunTargetPadlockRollAssist(
                effectiveCommand, _detents.Command.RollControl);
            PilotCommand flightCommand = ApplyAutoGcas(padlockAssistedCommand);
            PreparePlayerForPoweredTick();
            _player.Step(flightCommand, FixedDeltaSeconds);
            ConsumeFuelAndStepSystems(_player.State, _player.AirspeedMps,
                weightOnWheels: false);
        }

        StepPilotPhysiologyFromAircraft();

        if (_opponentTerminalState != AircraftTerminalState.SimulationBounded
            && AtmosphereBoundaryReached(_bandit.State, _bandit.Atmosphere))
            ForceTerminalLimit(CombatRole.Opponent, includeFlying: true);
        StepReliefFighter();
        if (_opponentTerminalState != AircraftTerminalState.SimulationBounded)
            StepPrimaryOpponent(
                ThreatObservationFor(previousPlayer, previousOpponent),
                FixedDeltaSeconds);
        StepWingmen(previousPlayer);
        AccumulateEngagementCounters();
        _carrier?.Step(FixedDeltaSeconds);
        ObserveCombatDamage();

        if (_playerTerminalState == AircraftTerminalState.DestroyedAirborne) {
            var contact = DetectImpact(previousPlayer, _player.State);
            if (contact.surface != ImpactSurface.None)
                RegisterAirborneImpact(CombatRole.Player,
                    contact.surface, contact.velocity, contact.height,
                    contact.carrierSolid);
        }
        if (_opponentTerminalState == AircraftTerminalState.DestroyedAirborne) {
            var contact = DetectImpact(previousOpponent, _bandit.State);
            if (contact.surface != ImpactSurface.None)
                RegisterAirborneImpact(CombatRole.Opponent,
                    contact.surface, contact.velocity, contact.height,
                    contact.carrierSolid);
        }

        if (_playerTerminalState == AircraftTerminalState.Flying) {
            if (_carrier is not null) {
                HandleCarrierRecovery(previousPlayer);
            } else if (!TryBeginConventionalRunwayContact(previousPlayer)) {
                var contact = DetectImpact(previousPlayer, _player.State);
                if (contact.surface != ImpactSurface.None)
                    RegisterUndamagedCrash(CombatRole.Player,
                        contact.surface, contact.velocity, contact.height,
                        carrierSolid: contact.carrierSolid);
            }
        }
        if (_opponentTerminalState == AircraftTerminalState.Flying) {
            var contact = DetectImpact(previousOpponent, _bandit.State);
            if (contact.surface != ImpactSurface.None)
                RegisterUndamagedCrash(CombatRole.Opponent,
                    contact.surface, contact.velocity, contact.height,
                    carrierSolid: contact.carrierSolid);
        }

        ObserveSettledWrecks();
        UpdateSelectedTargetClosure();
        double completedTimeMs = _simTimeMs + FixedDeltaSeconds * 1000.0;
        FinishTerminalIfResolved(completedTimeMs);
        _simTimeMs = completedTimeMs;
    }

    /// <summary>
    /// Give the authored conventional runway first refusal over a swept surface crossing. The
    /// runway owns only its finite pavement rectangle; a miss remains ordinary terrain contact.
    /// </summary>
    bool TryBeginConventionalRunwayContact(in AircraftState previousPlayer) {
        ConventionalRunwayRecoveryModel? recovery = _conventionalRunwayRecovery;
        if (recovery is null
            || recovery.Phase != RunwayRecoveryPhase.Airborne
            || _playerTerminalState != AircraftTerminalState.Flying)
            return false;
        if (!recovery.TryTouchdown(
                previousPlayer,
                _player.State,
                _systems.AllGearDownAndLocked,
                _player.AirspeedMps))
            return false;

        if (recovery.Phase == RunwayRecoveryPhase.Crashed) {
            RegisterUndamagedCrash(
                CombatRole.Player,
                ImpactSurface.Ground,
                Vec3D.Zero,
                recovery.Runway.Threshold.Y);
            return true;
        }

        _player.AdoptExternalKinematics(recovery.State);
        _detents.ApproachMode = false;
        _gunneryPitchAssistState = GunneryPitchAssistState.Inactive();
        _playerGunTargetPadlockRollAssistSelected = false;
        _playerGunTargetPadlockRollAssistTargetId = 0;
        _padlockRollAssist.Reset();
        ShowTransition("TOUCHDOWN · IDLE FOR WHEEL BRAKING", 2600.0);
        return true;
    }

    void FinishConventionalRunwaySortie() {
        if (_conventionalRunwayRecovery?.Phase != RunwayRecoveryPhase.Recovered
            || Lifecycle != LifecycleState.Active
            || _playerTerminalState != AircraftTerminalState.Flying)
            return;

        // A runway stop is not mission completion by itself. Only an accepted handoff which has
        // actually reached player-RTB authority may discontinue the fight; otherwise ownship stays
        // physically stopped and vulnerable on the runway while the combat session remains live.
        if (!CompletePlayerRecovery()) return;

        // A knock-it-off before the billed cap is a discontinue. Splashing the cap and stopping
        // on the runway is the end of the sortie. Kestrel's rung-0 opening is one aircraft;
        // a restored higher rung may still be a pair. Landing after that fight is empty is
        // the victory. Leaving with nobody splashed stays a discontinue.
        bool firstRunComplete = _beat.FirstRunValley is not null
            && _killCount >= 1
            && _opponentTerminalState != AircraftTerminalState.Flying
            && !_wingmen.Any(static wingman => wingman.StillFighting);
        SortieOutcome recovered = firstRunComplete || _billedSortieComplete
            ? SortieOutcome.Victory
            : SortieOutcome.Discontinued;
        _pendingOutcome = recovered;
        _outcome = recovered;
        EmitEvent(
            SessionEventType.SortieFinished,
            CombatRole.None,
            CombatRole.None,
            outcome: _outcome);
        ClearHeldInput();
        Lifecycle = LifecycleState.Finished;
    }

    void StepConventionalRunwayRollout() {
        ConventionalRunwayRecoveryModel recovery =
            _conventionalRunwayRecovery
            ?? throw new InvalidOperationException(
                "Conventional runway rollout requires a staged recovery model.");
        AircraftState playerState = _player.State;
        AircraftState opponentState = _bandit.State;

        _advice = _beat.Law.Advise(
            playerState, opponentState, _beat.PlayerAir, _player.AirspeedMps);
        _detents.AirspeedMps = _player.AirspeedMps;
        _detents.MeasuredAngleOfAttackRad = _player.AngleOfAttackRad;
        _detents.AerodynamicConfiguration = PlayerEffectiveAerodynamicConfiguration;
        _detents.Tick(
            _keys,
            _simTimeMs,
            playerState,
            _beat.PlayerAir,
            _advice,
            FixedDeltaSeconds);
        _cue = _prompts.Cue(_advice, _detents.Command, _detents.Tier);

        PreparePlayerForPoweredTick();
        _player.AdvanceEngineOnly(_detents.Throttle, FixedDeltaSeconds);
        StepWeapons(
            playerState,
            opponentState,
            playerTriggerHeld: false,
            allowNewFire: !TerminalPhaseActive);
        Vec3D airVelocity = playerState.VelocityVector()
            - (_player.Wind?.Sample(playerState.Position) ?? Vec3D.Zero);
        ConsumeFuelAndStepSystems(
            playerState,
            airVelocity.Length,
            weightOnWheels: true);
        StepRapierGunDrone(
            opponentState,
            _opponentTerminalState == AircraftTerminalState.Flying);
        StepReliefFighter();
        if (_opponentTerminalState != AircraftTerminalState.SimulationBounded)
            StepPrimaryOpponent(
                ThreatObservationFor(playerState, opponentState),
                FixedDeltaSeconds);
        StepWingmen(playerState);
        AccumulateEngagementCounters();

        AircraftState constrained = recovery.Step(
            FixedDeltaSeconds,
            _detents.Throttle,
            _player.State.Mass);
        _player.AdoptExternalKinematics(constrained);
        StepPilotPhysiology(1.0);
        ObserveCombatDamage();

        if (_playerTerminalState == AircraftTerminalState.DestroyedAirborne) {
            RegisterAirborneImpact(
                CombatRole.Player,
                ImpactSurface.Ground,
                Vec3D.Zero,
                recovery.Runway.Threshold.Y);
        } else if (_playerTerminalState == AircraftTerminalState.Flying
            && recovery.Phase == RunwayRecoveryPhase.Excursion) {
            RegisterUndamagedCrash(
                CombatRole.Player,
                ImpactSurface.Ground,
                Vec3D.Zero,
                recovery.Runway.Threshold.Y);
        }

        if (_opponentTerminalState == AircraftTerminalState.DestroyedAirborne) {
            var contact = DetectImpact(opponentState, _bandit.State);
            if (contact.surface != ImpactSurface.None)
                RegisterAirborneImpact(
                    CombatRole.Opponent,
                    contact.surface,
                    contact.velocity,
                    contact.height,
                    contact.carrierSolid);
        } else if (_opponentTerminalState == AircraftTerminalState.Flying) {
            var contact = DetectImpact(opponentState, _bandit.State);
            if (contact.surface != ImpactSurface.None)
                RegisterUndamagedCrash(
                    CombatRole.Opponent,
                    contact.surface,
                    contact.velocity,
                    contact.height,
                    carrierSolid: contact.carrierSolid);
        }

        ObserveSettledWrecks();
        UpdateSelectedTargetClosure();
        double completedTimeMs = _simTimeMs + FixedDeltaSeconds * 1000.0;
        if (Lifecycle == LifecycleState.Active)
            FinishTerminalIfResolved(completedTimeMs);
        // Finish is the last event-producing lifecycle transition in a recovered rollout tick.
        // Opponent impact/destruction/settling above may update the ordinary pending combat
        // outcome; the accepted handoff then authoritatively replaces it with Discontinued and
        // publishes SortieFinished after every same-tick physical event.
        if (Lifecycle == LifecycleState.Active
            && _playerTerminalState == AircraftTerminalState.Flying
            && recovery.Phase == RunwayRecoveryPhase.Recovered)
            FinishConventionalRunwaySortie();
        _simTimeMs = completedTimeMs;
    }

    void StepUnopposedConventionalRunwayRollout() {
        ConventionalRunwayRecoveryModel recovery =
            _conventionalRunwayRecovery
            ?? throw new InvalidOperationException(
                "Conventional runway rollout requires a staged recovery model.");
        AircraftState playerState = _player.State;

        _detents.AirspeedMps = _player.AirspeedMps;
        _detents.MeasuredAngleOfAttackRad = _player.AngleOfAttackRad;
        _detents.AerodynamicConfiguration = PlayerEffectiveAerodynamicConfiguration;
        _detents.Tick(
            _keys,
            _simTimeMs,
            playerState,
            _beat.PlayerAir,
            _advice,
            FixedDeltaSeconds);
        _cue = _prompts.Cue(_advice, _detents.Command, _detents.Tier);

        PreparePlayerForPoweredTick();
        _player.AdvanceEngineOnly(_detents.Throttle, FixedDeltaSeconds);
        Vec3D airVelocity = playerState.VelocityVector()
            - (_player.Wind?.Sample(playerState.Position) ?? Vec3D.Zero);
        ConsumeFuelAndStepSystems(
            playerState,
            airVelocity.Length,
            weightOnWheels: true);

        AircraftState constrained = recovery.Step(
            FixedDeltaSeconds,
            _detents.Throttle,
            _player.State.Mass);
        _player.AdoptExternalKinematics(constrained);
        StepPilotPhysiology(1.0);

        if (_playerTerminalState == AircraftTerminalState.DestroyedAirborne) {
            RegisterAirborneImpact(
                CombatRole.Player,
                ImpactSurface.Ground,
                Vec3D.Zero,
                recovery.Runway.Threshold.Y);
        } else if (_playerTerminalState == AircraftTerminalState.Flying
            && recovery.Phase == RunwayRecoveryPhase.Excursion) {
            RegisterUndamagedCrash(
                CombatRole.Player,
                ImpactSurface.Ground,
                Vec3D.Zero,
                recovery.Runway.Threshold.Y);
        }

        ObserveSettledWrecks();
        double completedTimeMs = _simTimeMs + FixedDeltaSeconds * 1000.0;
        if (Lifecycle == LifecycleState.Active)
            FinishTerminalIfResolved(completedTimeMs);
        _simTimeMs = completedTimeMs;
    }

    void StepUnopposedTerminalPhase() {
        AircraftState previousPlayer = _player.State;
        if (_playerTerminalState == AircraftTerminalState.DestroyedAirborne) {
            TerminalFlightDynamics.Step(_player, PlayerAerodynamicConfiguration,
                handedness: -1, FixedDeltaSeconds);
            StepFailedPlayerSystems(weightOnWheels: false);
            _player.AerodynamicConfiguration = TerminalFlightDynamics.Configuration(
                PlayerAerodynamicConfiguration, handedness: -1);
        } else if (_playerTerminalState == AircraftTerminalState.Impacted
            && _playerWreckMotion is not null) {
            _player.AdvanceEngineOnly(0.0, FixedDeltaSeconds);
            _playerWreckMotion.Step(FixedDeltaSeconds);
            _player.AdoptExternalKinematics(_playerWreckMotion.State);
            StepFailedPlayerSystems(
                weightOnWheels: _playerWreckMotion.HasWeightBearingContact);
        }

        StepPilotPhysiologyFromAircraft();
        _carrier?.Step(FixedDeltaSeconds);
        if (_playerTerminalState == AircraftTerminalState.DestroyedAirborne) {
            var contact = DetectImpact(previousPlayer, _player.State);
            if (contact.surface != ImpactSurface.None)
                RegisterAirborneImpact(CombatRole.Player,
                    contact.surface, contact.velocity, contact.height,
                    contact.carrierSolid);
        }
        ObserveSettledWrecks();
        double completedTimeMs = _simTimeMs + FixedDeltaSeconds * 1000.0;
        FinishTerminalIfResolved(completedTimeMs);
        _simTimeMs = completedTimeMs;
    }
}
