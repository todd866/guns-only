using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Recovery;
using GunsOnly.Web;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

public sealed class PantherWholeSortieContractTests {
    enum ReturnPilotPhase { Reciprocal, LeadTurn, Inbound }

    readonly ITestOutputHelper _output;

    public PantherWholeSortieContractTests(ITestOutputHelper output) =>
        _output = output;

    static ITerrainSurface ProductionTerrain(BeatSetup beat) {
        ITerrainSurface truth = Assert.IsAssignableFrom<ITerrainSurface>(
            UkraineTerrainTruth.Load());
        var apron = new TrainingTerrainApronSurface(
            truth, marginM: 400_000.0, flatHeightM: 78.0, transitionM: 8_000.0);
        MissionEnvironmentContract environment = beat.EnvironmentIdentity;
        return new TranslatedTerrainSurface(
            apron,
            -environment.TerrainSourceAnchorEastM,
            -environment.TerrainSourceAnchorNorthM);
    }

    static SimulationSession StagedPanther() {
        var session = new SimulationSession(
            beatIndex: 14,
            deckConfiguration: Carrier.DeckConfiguration.Axial);
        session.SetTerrainSurface(ProductionTerrain(session.Beat));
        return session;
    }

    static AircraftState StateAt(in Vec3D position, double speedMps,
        double gammaRad, double headingRad, double massKg) =>
        new(position, speedMps, gammaRad, headingRad, 0.0, massKg);

    static AircraftState StateFromVelocity(in Vec3D position, in Vec3D velocity,
        double massKg) {
        double speed = velocity.Length;
        Vec3D direction = velocity * (1.0 / speed);
        return new AircraftState(
            position,
            speed,
            Math.Asin(Math.Clamp(direction.Y, -1.0, 1.0)),
            Math.Atan2(direction.X, direction.Z),
            0.0,
            massKg);
    }

    [Fact]
    public void RouteIsFiniteAndTheReturnFixFollowsTheMovingShip() {
        Carrier ship = Beats.KoreaSortie().Carrier!;
        double onSpeed = SortieSchedule.ApproachSpeedMps(
            FlightModel.F9F2Panther.MassKg, FlightModel.F9F2Panther);
        var route = new CarrierSortieRouteDirector();
        route.Configure(ship, onSpeed, enabled: true);

        AircraftState player = StateAt(
            ship.Position, 62.0, 0.0, ship.HeadingRad,
            FlightModel.F9F2Panther.MassKg);
        route.Step(ship, player, catapultActive: false, sortieComplete: false);
        Assert.Equal(CarrierSortieRoutePhase.Departure, route.State.Phase);
        Assert.True(route.State.RtbAvailable);

        player = player with { Position = route.State.TargetPosition };
        route.Step(ship, player, catapultActive: false, sortieComplete: false);
        Assert.Equal(CarrierSortieRoutePhase.Outbound, route.State.Phase);
        player = player with { Position = route.State.TargetPosition };
        route.Step(ship, player, catapultActive: false, sortieComplete: false);
        Assert.Equal(CarrierSortieRoutePhase.Transit, route.State.Phase);
        player = player with { Position = route.State.TargetPosition };
        route.Step(ship, player, catapultActive: false, sortieComplete: false);
        Assert.Equal(CarrierSortieRoutePhase.AwaitingReturn, route.State.Phase);

        Assert.True(route.TryRequestRtb(ship, player));
        Assert.True(route.State.RtbRequested);
        Assert.Equal(CarrierSortieRoutePhase.Return, route.State.Phase);
        Assert.Equal(CarrierSortieRouteFix.ReturnInitial, route.State.ActiveFix);
        Assert.Equal(
            CarrierSortieRouteDirector.ReturnEntrySpeedMultiple * onSpeed,
            route.State.TargetSpeedMps,
            8);
        Vec3D firstMovingFix = route.State.TargetPosition;
        ship.Step(10.0);
        route.Step(ship, player, catapultActive: false, sortieComplete: false);
        Vec3D secondMovingFix = route.State.TargetPosition;
        Assert.True((secondMovingFix - firstMovingFix - ship.DeckVelocityWorld * 10.0).Length
            < 1e-8, "the return fix must steam with HomePlate");

        Vec3D abeamReturnInsideOldSphere = secondMovingFix
            + ship.LandingRight * 900.0;
        player = player with { Position = abeamReturnInsideOldSphere };
        route.Step(ship, player, catapultActive: false, sortieComplete: false);
        Assert.Equal(CarrierSortieRoutePhase.Return, route.State.Phase);
        Assert.True(route.State.DistanceToTargetM < route.State.CaptureRadiusM,
            "the return regression must remain inside the old spherical gate");
        player = player with {
            Position = secondMovingFix,
            Chi = ship.LandingHeadingRad + 0.30
        };
        route.Step(ship, player, catapultActive: false, sortieComplete: false);
        Assert.Equal(CarrierSortieRoutePhase.Return, route.State.Phase);
        player = player with { Chi = ship.LandingHeadingRad };
        route.Step(ship, player, catapultActive: false, sortieComplete: false);
        Assert.Equal(CarrierSortieRoutePhase.Recovery, route.State.Phase);
        Assert.Equal(
            CarrierSortieRouteDirector.RecoveryEntrySpeedMultiple * onSpeed,
            route.State.TargetSpeedMps,
            8);
        Vec3D abeamInsideOldSphere = route.State.TargetPosition
            + ship.LandingRight * 400.0;
        player = player with { Position = abeamInsideOldSphere };
        route.Step(ship, player, catapultActive: false, sortieComplete: false);
        Assert.Equal(CarrierSortieRoutePhase.Recovery, route.State.Phase);
        Assert.True(route.State.DistanceToTargetM < route.State.CaptureRadiusM,
            "the regression fixture must remain inside the old spherical gate");
        player = player with {
            Position = route.State.TargetPosition,
            Chi = ship.LandingHeadingRad + 0.30
        };
        route.Step(ship, player, catapultActive: false, sortieComplete: false);
        Assert.Equal(CarrierSortieRoutePhase.Recovery, route.State.Phase);
        player = player with { Chi = ship.LandingHeadingRad };
        route.Step(ship, player, catapultActive: false, sortieComplete: false);
        Assert.Equal(CarrierSortieRoutePhase.Groove, route.State.Phase);
    }

    [Fact]
    public void AdvertisedOActionLatchesReturnToShipAfterTheRealCatshot() {
        SimulationSession session = StagedPanther();
        session.Begin();

        Assert.False(session.CarrierSortieRtbAvailable);
        Assert.False(session.TryRequestCarrierSortieRtb());
        for (int tick = 0; tick < 30 * AircraftSim.TickHz
            && !session.CarrierSortieRtbAvailable; tick++)
            session.StepFixed();

        Assert.True(session.CarrierSortieRtbAvailable,
            "catapult handoff never opened the return-to-ship action");
        Assert.False(session.CarrierSortieRtbRequested);
        Assert.False(session.PlayerRtbActive);

        session.FeedKey(GKey.KnockItOff, true);
        session.FeedKey(GKey.KnockItOff, false);

        Assert.True(session.CarrierSortieRtbRequested);
        Assert.True(session.PlayerRtbActive);
        Assert.Equal(CarrierSortieRoutePhase.Return,
            session.CarrierSortieRoute.Phase);
        Assert.Equal(CombatHandoffPhase.Unavailable,
            session.CombatHandoffPhase);
        Assert.False(session.CompletePlayerRecovery(),
            "Panther RTB must not advance the unrelated combat-handoff authority");
        Assert.Equal(CombatHandoffPhase.Unavailable,
            session.CombatHandoffPhase);
        Assert.Contains("RETURN TO SHIP", session.TransitionCue);
    }

    [Fact]
    public void AxialBarrierIsExplicitAndCannotReplaceAWireOrAnAngledBolter() {
        static Carrier Ship(Carrier.DeckConfiguration configuration) => new(
            deckCentre: new Vec3D(0.0, 20.0, 0.0),
            headingRad: 0.0,
            speedMps: 3.0,
            deckAltM: 20.0,
            deckLengthM: 250.0,
            deckWidthM: 30.0,
            configuration: configuration);

        Carrier axial = Ship(Carrier.DeckConfiguration.Axial);
        double missedAlong = axial.WireAlongM(4)
            + Carrier.HookToMainGearM + 4.8;
        AircraftState missed = StateAt(
            axial.LandingPoint(missedAlong, 0.0, -0.01),
            62.0, -0.06, axial.LandingHeadingRad,
            FlightModel.F9F2Panther.MassKg);
        Carrier.TouchdownResult barrier = axial.EvaluateRecovery(
            missed,
            DetentLayer.OnSpeedAoARad,
            DifficultyModel.ForLevel(0),
            missedWireDisposition: Carrier.MissedWireDisposition.Barrier);
        Assert.Equal(Carrier.Recovery.BarrierEngagement, barrier.Recovery);
        Assert.Equal(Carrier.HookOutcome.MissedWires, barrier.Hook);

        double caughtAlong = axial.WireAlongM(3)
            + Carrier.HookToMainGearM - 1.0;
        AircraftState caught = missed with {
            Position = axial.LandingPoint(caughtAlong, 0.0, -0.01)
        };
        Assert.Equal(Carrier.Recovery.Trap, axial.EvaluateRecovery(
            caught,
            DetentLayer.OnSpeedAoARad,
            DifficultyModel.ForLevel(0),
            missedWireDisposition: Carrier.MissedWireDisposition.Barrier).Recovery);

        double shortAlong = axial.WireAlongM(1)
            + Carrier.HookToMainGearM - Carrier.MaxHookSweepAfterTouchdownM - 2.0;
        AircraftState shortOfArray = missed with {
            Position = axial.LandingPoint(shortAlong, 0.0, -0.01)
        };
        Carrier.TouchdownResult earlySettle = axial.EvaluateRecovery(
            shortOfArray,
            DetentLayer.OnSpeedAoARad,
            DifficultyModel.ForLevel(0),
            missedWireDisposition: Carrier.MissedWireDisposition.Barrier);
        Assert.Equal(Carrier.Recovery.Bolter, earlySettle.Recovery);
        Assert.NotEqual(Carrier.Recovery.BarrierEngagement, earlySettle.Recovery);

        AircraftState airborne = missed with {
            Position = axial.LandingPoint(missedAlong, 0.0, 1.0)
        };
        Assert.Equal(Carrier.Recovery.Flying, axial.EvaluateRecovery(
            airborne,
            DetentLayer.OnSpeedAoARad,
            DifficultyModel.ForLevel(0),
            missedWireDisposition: Carrier.MissedWireDisposition.Barrier).Recovery);

        Carrier angled = Ship(Carrier.DeckConfiguration.Angled);
        AircraftState angledMiss = missed with {
            Position = angled.LandingPoint(missedAlong, 0.0, -0.01),
            Chi = angled.LandingHeadingRad
        };
        Assert.Equal(Carrier.Recovery.Bolter, angled.EvaluateRecovery(
            angledMiss,
            DetentLayer.OnSpeedAoARad,
            DifficultyModel.ForLevel(0),
            missedWireDisposition: Carrier.MissedWireDisposition.Barrier).Recovery);

        AircraftState stopped = axial.BarrierEngagementState(missed);
        var stoppedFrame = axial.LandingAircraftSupportFrame(stopped.Position);
        Assert.InRange(stoppedFrame.along,
            axial.DeckLengthM * 0.5 - 18.01,
            axial.DeckLengthM * 0.5 - 17.99);
        Assert.InRange(Math.Abs(stoppedFrame.height), 0.0, 1e-8);
        Assert.True((stopped.VelocityVector() - axial.DeckVelocityWorld).Length < 1e-8);
    }

    [Fact]
    public void PantherMissedWireFinishesInTheBarrierNotAFictionalFlyaway() {
        SimulationSession session = StagedPanther();
        session.Begin();
        for (int tick = 0; tick < 30 * AircraftSim.TickHz
            && session.Catapult.IsActive; tick++)
            session.StepFixed();

        Assert.True(session.StraightDeckBarrierArmed);
        Carrier ship = session.Carrier!;
        // Keep the systems alive while the manual gear selection travels.  This is a focused
        // barrier card; the separate whole-sortie test owns the flown return.
        session.Player.AdoptExternalKinematics(StateAt(
            ship.LandingPoint(-2_000.0, 0.0, 400.0),
            95.0, 0.0, ship.LandingHeadingRad,
            session.Player.State.Mass));
        session.FeedKey(GKey.GearToggle, true);
        session.FeedKey(GKey.GearToggle, false);
        for (int tick = 0; tick < 12 * AircraftSim.TickHz
            && !session.PlayerSystems.AllGearDownAndLocked; tick++)
            session.StepFixed();
        Assert.True(session.PlayerSystems.AllGearDownAndLocked);

        double missedAlong = ship.WireAlongM(4)
            + Carrier.HookToMainGearM + 4.8;
        Vec3D contactVelocity = ship.DeckVelocityWorld
            + ship.LandingFwd * 59.0
            + new Vec3D(0.0, -3.4, 0.0);
        session.Player.AdoptExternalKinematics(StateFromVelocity(
            ship.LandingPoint(missedAlong, 0.0, 0.02),
            contactVelocity,
            session.Player.State.Mass));
        session.StepFixed();

        Assert.Equal(Carrier.Recovery.BarrierEngagement,
            session.Touchdown.Recovery);
        Assert.Equal(Carrier.Recovery.BarrierEngagement, session.Recovery);
        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
        Assert.Equal(SortieOutcome.Draw, session.Outcome);
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
        Assert.False(session.Catapult.IsActive);
        Assert.Contains("BARRIER", session.TransitionCue);
    }

    static void FlyRoute(SimulationSession session) {
        CarrierSortieRouteState route = session.CarrierSortieRoute;
        AircraftState state = session.Player.State;
        Vec3D toTarget = route.TargetPosition - state.Position;
        double horizontalM = Math.Sqrt(
            toTarget.X * toTarget.X + toTarget.Z * toTarget.Z);
        double desiredHeading = horizontalM > 1.0
            ? Math.Atan2(toTarget.X, toTarget.Z)
            : state.Chi;
        double headingError = Math.IEEERemainder(
            desiredHeading - state.Chi, 2.0 * Math.PI);
        double desiredBank = Math.Clamp(1.4 * headingError, -0.55, 0.55);
        double bankError = Math.IEEERemainder(
            desiredBank - state.Bank, 2.0 * Math.PI)
            - state.BodyRates.P * 0.18;
        session.SetAnalogRollControl(Math.Clamp(2.4 * bankError, -1.0, 1.0));

        double desiredGamma = Math.Atan2(toTarget.Y, Math.Max(1.0, horizontalM));
        desiredGamma = Math.Clamp(desiredGamma,
            route.Phase >= CarrierSortieRoutePhase.Return ? -0.11 : -0.03,
            route.Phase >= CarrierSortieRoutePhase.Return ? 0.08 : 0.15);
        double gammaError = desiredGamma - state.Gamma;
        session.SetAnalogPitchControl(Math.Clamp(5.0 * gammaError, -0.70, 0.70));

        double speedError = route.TargetSpeedMps - session.Player.AirspeedMps;
        double throttle = Math.Clamp(0.56 + 0.014 * speedError, 0.02, 1.0);
        session.SetAnalogThrottleControl(throttle);
    }

    static void FlyGroove(SimulationSession session) {
        Carrier ship = session.Carrier!;
        AircraftState state = session.Player.State;
        var deck = ship.LandingAircraftSupportFrame(state.Position);
        // Hold the route's published 3.5-degree line toward a 1.65-second response lead ahead of
        // the carrier's public touchdown datum. The lead is derived from the published Groove
        // speed, not a wire coordinate, and compensates the continuous controller/airframe lag.
        // A body-pitch cue tuned around a different airframe's response arrived late and hard once
        // the Panther's real gear/flap travel was enabled; flight-path error is the common physical
        // quantity and keeps the test pilot off any hidden wire coordinate.
        const double responseLeadSeconds = 1.65;
        double responseAimAlongM = ship.TouchdownAlongM
            + session.CarrierSortieRoute.TargetSpeedMps * responseLeadSeconds;
        double distanceToTouchdownM = responseAimAlongM - deck.along;
        double desiredHeightM = Math.Max(0.0, distanceToTouchdownM)
            * Carrier.GlideslopeSlope;
        double desiredGamma = Math.Clamp(
            -Carrier.GlideslopeRad + (desiredHeightM - deck.height) / 120.0,
            -0.10,
            0.03);
        double gammaError = desiredGamma - state.Gamma - state.BodyRates.Q * 0.12;
        session.SetAnalogPitchControl(Math.Clamp(8.0 * gammaError, -0.85, 0.85));

        double crossCorrection = Math.Atan2(-deck.cross,
            Math.Max(500.0, -deck.along));
        double desiredHeading = ship.LandingHeadingRad + crossCorrection;
        double headingError = Math.IEEERemainder(
            desiredHeading - state.Chi, 2.0 * Math.PI);
        double desiredBank = Math.Clamp(1.5 * headingError, -0.35, 0.35);
        double bankError = Math.IEEERemainder(
            desiredBank - state.Bank, 2.0 * Math.PI)
            - state.BodyRates.P * 0.20;
        session.SetAnalogRollControl(Math.Clamp(2.8 * bankError, -1.0, 1.0));

        double targetSpeed = session.CarrierSortieRoute.TargetSpeedMps;
        double burble = session.Burble?.InCloseStrength(state.Position) ?? 0.0;
        double wantedPower = Math.Clamp(
            session.Controls.ApproachTrimThrottle
            + 0.040 * Math.Max(0.0, session.Controls.GlideslopeErrorM)
            + 0.045 * (targetSpeed - session.Player.AirspeedMps)
            + 0.15 * burble,
            0.02,
            0.90);
        session.SetAnalogThrottleControl(wantedPower);
    }

    static void FlyCarrierLineIntercept(SimulationSession session,
        bool inbound, bool recoveryProfile) {
        Carrier ship = session.Carrier!;
        AircraftState state = session.Player.State;
        var deck = ship.LandingAircraftSupportFrame(state.Position);
        double lateralSpeed = ship.DeckRelativeVelocity(state)
            .Dot(ship.LandingRight);

        // Intercept and then HOLD the moving landing centreline. Point-pursuit against the single
        // RecoveryInitial coordinate crosses the point, reverses, and orbits it; it cannot satisfy
        // a physically honest heading/lateral-rate gate. Cross-track plus cross-rate damping gives
        // the synthetic pilot the same public carrier-frame problem a human sees.
        // Return first flies the reciprocal until it owns enough room astern for an inbound turn;
        // Recovery is already inbound. The sign flip is important: the same cross-track correction
        // has the opposite heading offset while travelling down the reciprocal.
        double direction = inbound ? 1.0 : -1.0;
        double courseOffset = Math.Clamp(
            -direction * (deck.cross / 1_800.0 + lateralSpeed / 90.0),
            -0.48,
            0.48);
        double desiredHeading = ship.LandingHeadingRad
            + (inbound ? 0.0 : Math.PI)
            + courseOffset;
        double headingError = Math.IEEERemainder(
            desiredHeading - state.Chi, 2.0 * Math.PI);
        double desiredBank = Math.Clamp(1.35 * headingError, -0.48, 0.48);
        double bankError = Math.IEEERemainder(
            desiredBank - state.Bank, 2.0 * Math.PI)
            - state.BodyRates.P * 0.20;
        session.SetAnalogRollControl(Math.Clamp(2.7 * bankError, -1.0, 1.0));

        var targetDeck = ship.LandingAircraftSupportFrame(
            session.CarrierSortieRoute.TargetPosition);
        double desiredHeight = recoveryProfile
            ? Math.Max(
                targetDeck.height,
                Math.Max(0.0, -deck.along) * Carrier.GlideslopeSlope)
            : targetDeck.height;
        double heightError = desiredHeight - deck.height;
        double profileGamma = recoveryProfile && deck.along < targetDeck.along
            ? -Carrier.GlideslopeRad : 0.0;
        double desiredGamma = Math.Clamp(
            profileGamma + heightError / 2_000.0,
            -0.11,
            0.06);
        session.SetAnalogPitchControl(Math.Clamp(
            5.0 * (desiredGamma - state.Gamma), -0.75, 0.75));

        double targetSpeed = session.CarrierSortieRoute.TargetSpeedMps;
        double throttle = Math.Clamp(
            0.42 + 0.025 * (targetSpeed - session.Player.AirspeedMps),
            0.02,
            0.78);
        session.SetAnalogThrottleControl(throttle);
    }

    static void FlyReturnLeadTurn(SimulationSession session) {
        Carrier ship = session.Carrier!;
        AircraftState state = session.Player.State;
        // A compact, still-airframe-plausible lead turn avoids spending the inbound leg
        // unwinding several kilometres of lateral displacement before ReturnInitial.
        const double turnBankRad = 0.94;
        double bankError = turnBankRad - state.Bank - state.BodyRates.P * 0.18;
        session.SetAnalogRollControl(Math.Clamp(3.0 * bankError, -1.0, 1.0));

        var deck = ship.LandingAircraftSupportFrame(state.Position);
        var targetDeck = ship.LandingAircraftSupportFrame(
            session.CarrierSortieRoute.TargetPosition);
        double desiredGamma = Math.Clamp(
            (targetDeck.height - deck.height) / 2_000.0,
            -0.06,
            0.06);
        session.SetAnalogPitchControl(Math.Clamp(
            5.0 * (desiredGamma - state.Gamma), -0.75, 0.75));

        double speedError = session.CarrierSortieRoute.TargetSpeedMps
            - session.Player.AirspeedMps;
        session.SetAnalogThrottleControl(Math.Clamp(
            0.42 + 0.025 * speedError, 0.02, 1.0));
    }

    [Fact]
    public void ProductionTerrainCardFliesCatshotRouteReturnGrooveAndTrap() {
        SimulationSession session = StagedPanther();
        ITerrainSurface terrain = ProductionTerrain(session.Beat);
        Assert.False(session.OpponentPresent);
        Assert.Throws<InvalidOperationException>(() => session.Bandit);
        Assert.Throws<InvalidOperationException>(() => session.PlayerGun);
        Assert.Throws<InvalidOperationException>(() => session.OpponentGun);
        Assert.Equal(0, session.BanditSpawnSequence);
        Assert.Equal(0, session.LiveOpponentCount);
        Assert.Equal(0, session.EngagementNumber);
        session.Begin();

        bool sawCatapult = false;
        bool sawClimb = false;
        bool sawTransit = false;
        bool sawReturn = false;
        bool sawRecovery = false;
        bool sawGroove = false;
        bool configurationReadyAtGroove = false;
        bool requestedRtb = false;
        ReturnPilotPhase returnPilotPhase = ReturnPilotPhase.Reciprocal;
        double closestReturnRangeM = double.PositiveInfinity;
        string closestReturnState = "none";
        bool stayedOverWater = true;
        CarrierSortieRoutePhase lastPhase = CarrierSortieRoutePhase.Unavailable;

        for (int tick = 0; tick < 950 * AircraftSim.TickHz
            && session.Lifecycle == SimulationSession.LifecycleState.Active; tick++) {
            CarrierSortieRouteState route = session.CarrierSortieRoute;
            if (route.Phase != lastPhase) {
                _output.WriteLine($"{session.TimeSeconds,7:F1}s {lastPhase} -> {route.Phase} "
                    + $"pos={session.Player.State.Position} speed={session.Player.AirspeedMps:F1} "
                    + $"target={route.ActiveFix}/{route.DistanceToTargetM:F0}m");
                lastPhase = route.Phase;
            }
            sawCatapult |= session.Catapult.IsActive;
            sawClimb |= session.SortiePlan.Leg == SortieLeg.Climb;
            sawTransit |= route.Phase is CarrierSortieRoutePhase.Transit
                or CarrierSortieRoutePhase.AwaitingReturn;
            sawReturn |= route.Phase == CarrierSortieRoutePhase.Return;
            sawRecovery |= route.Phase == CarrierSortieRoutePhase.Recovery;
            sawGroove |= route.Phase == CarrierSortieRoutePhase.Groove;
            if (route.Phase == CarrierSortieRoutePhase.Groove) {
                AirframeSystems systems = session.PlayerSystems;
                configurationReadyAtGroove |= systems.AllGearDownAndLocked
                    && Math.Min(systems.LeftFlapDegrees, systems.RightFlapDegrees)
                        >= systems.FullFlapDegrees - 0.25;
            }

            if (!requestedRtb
                && route.Phase == CarrierSortieRoutePhase.AwaitingReturn) {
                session.FeedKey(GKey.KnockItOff, true);
                session.FeedKey(GKey.KnockItOff, false);
                requestedRtb = session.CarrierSortieRtbRequested;
                route = session.CarrierSortieRoute;
            }

            if (!session.Catapult.IsActive) {
                if (route.Phase == CarrierSortieRoutePhase.Groove
                    && session.Controls.ApproachMode)
                    FlyGroove(session);
                else if (route.Phase is CarrierSortieRoutePhase.Recovery
                    or CarrierSortieRoutePhase.Groove)
                    FlyCarrierLineIntercept(
                        session, inbound: true, recoveryProfile: true);
                else if (route.Phase == CarrierSortieRoutePhase.Return) {
                    var playerDeck = session.Carrier!.LandingAircraftSupportFrame(
                        session.Player.State.Position);
                    var targetDeck = session.Carrier.LandingAircraftSupportFrame(
                        route.TargetPosition);
                    double returnRangeM = (route.TargetPosition
                        - session.Player.State.Position).Length;
                    if (returnRangeM < closestReturnRangeM) {
                        closestReturnRangeM = returnRangeM;
                        double headingError = Math.IEEERemainder(
                            session.Player.State.Chi
                                - session.Carrier.LandingHeadingRad,
                            2.0 * Math.PI);
                        double lateralSpeed = session.Carrier
                            .DeckRelativeVelocity(session.Player.State)
                            .Dot(session.Carrier.LandingRight);
                        closestReturnState = $"range={returnRangeM:F0} "
                            + $"along={playerDeck.along:F0} cross={playerDeck.cross:F0} "
                            + $"height={playerDeck.height:F0} hdg={headingError:F3} "
                            + $"lat={lateralSpeed:F1} phase={returnPilotPhase}";
                    }

                    // At Return transit speed a Panther needs several kilometres of turn radius.
                    // Extend sixteen kilometres beyond ReturnInitial, fly one controlled 180-degree
                    // lead turn, then latch the inbound centreline intercept. That leaves enough
                    // inbound distance to settle cross-track and lateral rate before the fix.
                    // Production route gates, not this test procedure, still own the phase handoff.
                    if (returnPilotPhase == ReturnPilotPhase.Reciprocal
                        && playerDeck.along <= targetDeck.along - 16_000.0)
                        returnPilotPhase = ReturnPilotPhase.LeadTurn;
                    if (returnPilotPhase == ReturnPilotPhase.LeadTurn) {
                        double inboundHeadingError = Math.Abs(Math.IEEERemainder(
                            session.Player.State.Chi
                                - session.Carrier.LandingHeadingRad,
                            2.0 * Math.PI));
                        if (inboundHeadingError <= 0.10)
                            returnPilotPhase = ReturnPilotPhase.Inbound;
                    }

                    if (returnPilotPhase == ReturnPilotPhase.LeadTurn)
                        FlyReturnLeadTurn(session);
                    else
                        FlyCarrierLineIntercept(
                            session,
                            inbound: returnPilotPhase == ReturnPilotPhase.Inbound,
                            recoveryProfile: false);
                }
                else
                    FlyRoute(session);
            }
            session.StepFixed();

            if (tick % AircraftSim.TickHz == 0) {
                Assert.True(terrain.TrySample(
                    session.Player.State.Position.X,
                    session.Player.State.Position.Z,
                    out TerrainSample sample));
                stayedOverWater &= sample.Kind == TerrainSurfaceKind.Water;
            }
            if (session.PlayerTerminalState != AircraftTerminalState.Flying) break;
        }

        var finalDeck = session.Carrier!.LandingAircraftSupportFrame(
            session.Player.State.Position);
        double finalHeadingError = Math.IEEERemainder(
            session.Player.State.Chi - session.Carrier.LandingHeadingRad,
            2.0 * Math.PI);
        double finalLateralSpeed = session.Carrier
            .DeckRelativeVelocity(session.Player.State)
            .Dot(session.Carrier.LandingRight);
        _output.WriteLine($"FINAL lifecycle={session.Lifecycle} outcome={session.Outcome} "
            + $"recovery={session.Recovery}/{session.Touchdown.Hook}/W{session.Touchdown.Wire} "
            + $"route={session.CarrierSortieRoute.Phase} pos={session.Player.State.Position} "
            + $"deck=({finalDeck.along:F1},{finalDeck.cross:F1},{finalDeck.height:F1}) "
            + $"air={session.Player.AirspeedMps:F1} sink={session.Touchdown.SinkRateMps:F2} "
            + $"hdgErr={finalHeadingError:F3}rad lateral={finalLateralSpeed:F1}m/s "
            + $"wheel={session.Touchdown.WheelAlongM:F1} "
            + $"hookAlong={session.Touchdown.HookAlongM:F1} "
            + $"touchIas={session.Touchdown.IndicatedAirspeedMps:F1} "
            + $"closure={session.Touchdown.ClosureMps:F1} "
            + $"gear={session.PlayerSystems.AllGearDownAndLocked} "
            + $"flaps={session.PlayerSystems.LeftFlapDegrees:F1}/"
            + $"{session.PlayerSystems.RightFlapDegrees:F1} "
            + $"returnPilot={returnPilotPhase} closestReturn=[{closestReturnState}]");

        Assert.True(sawCatapult);
        Assert.True(sawClimb);
        Assert.True(sawTransit);
        Assert.True(requestedRtb);
        Assert.True(sawReturn);
        Assert.True(sawRecovery);
        Assert.True(sawGroove);
        Assert.True(configurationReadyAtGroove,
            "the route Recovery phase must finish physical gear/flap travel before Groove");
        Assert.True(stayedOverWater,
            "the authored carrier-day route left the surveyed production water cell");
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
        Assert.Equal(SortieOutcome.Victory, session.Outcome);
        Assert.Equal(Carrier.Recovery.Trap, session.Touchdown.Recovery);
        Assert.Equal(Carrier.HookOutcome.Engaged, session.Touchdown.Hook);
        Assert.InRange(session.Touchdown.Wire, 1, 4);
        Assert.Equal(CarrierSortieRoutePhase.Complete,
            session.CarrierSortieRoute.Phase);
        Assert.Equal(0, session.BanditSpawnSequence);
        Assert.Equal(0, session.LiveOpponentCount);
        Assert.Equal(0, session.EngagementNumber);
        Assert.Equal(0, session.ShotsTotal);
        Assert.Equal(0, session.KillCount);
        Assert.Equal(0, session.Decisions.Count);
        Assert.DoesNotContain(session.RecentEvents, item =>
            item.Type == SessionEventType.OpponentSpawned
            || item.Source == CombatRole.Opponent
            || item.Target == CombatRole.Opponent);
    }
}
