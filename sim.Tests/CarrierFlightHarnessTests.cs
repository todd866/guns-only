using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Turbulence;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Full-sortie acceptance coverage. The harness below is intentionally only an observer/input
/// driver: SimulationSession owns every production tick, lifecycle transition, resource update,
/// collision, arrestment, catapult launch, and opponent replacement exercised by these tests.
/// </summary>
public class CarrierFlightHarnessTests {
    readonly ITestOutputHelper _o;
    public CarrierFlightHarnessTests(ITestOutputHelper output) => _o = output;

    sealed class SessionHarness {
        public SessionHarness(
            Carrier.DeckConfiguration configuration = Carrier.DeckConfiguration.Axial,
            bool continuousCycle = false) {
            if (continuousCycle) {
                BeatSetup baseline = Beats.CarrierApproach(configuration);
                BeatSetup cycle = baseline with {
                    Bandit = new AircraftState(new Vec3D(450, 650, 1500), 105, 0, 0.0,
                        0, FlightModel.Sabre.MassKg),
                    UsesReactiveBandit = true,
                    Combat = CombatConfig.CarrierQualification,
                    RecoveryCompletesSortie = false
                };
                Session = new SimulationSession();
                Session.StartBeat(() => cycle);
            } else {
                Session = new SimulationSession(5, configuration);
            }
            Session.Begin();
        }

        public SimulationSession Session { get; }
        public AircraftSim Player => Session.Player;
        public IBandit Bandit => Session.Bandit;
        public Carrier Ship => Session.Carrier!;
        public BurbleField Burble => Session.Burble!;
        public GunKill Fight => Session.PlayerGun;
        public AircraftState S => Player.State;
        public AircraftState B => Bandit.State;
        public double TimeSeconds => Session.TimeSeconds;
        public double SpeedKt => S.Speed * 1.94384;
        public double AirspeedMps => Player.AirspeedMps;
        public double GammaDeg => S.Gamma * 57.29578;
        public double Throttle => Session.Controls.Throttle;
        public double CommandedPitchRad => Session.Controls.CommandedPitchRad;
        public bool ApproachMode => Session.Controls.ApproachMode;
        public string Mode => Session.WaveOffActive ? "WAVE-OFF"
            : ApproachMode ? "APPROACH" : "FREE";
        public LsoAdvice? LsoCall => Lso.AdviseForMode(Ship, S, Player.AngleOfAttackRad,
            Ship.ApproachDirectorPitchOffsetRad, ApproachMode, Session.WaveOffActive);
        public string EmittedContext => LsoCall?.Call ?? Lso.FreeFlightCall;
        public bool InApproachSlot => Ship.InApproachSlot(S);
        public double RangeM => Geometry.Range(S, B);
        public (double along, double cross, double height) Deck => Ship.LandingFrame(
            Session.Arrestment.IsActive ? Session.Arrestment.Position : S.Position);
        public double GlideslopeErrorM => Session.Controls.GlideslopeErrorM;

        public double GunAimErrorDeg(GunKill fight) => Math.Acos(Math.Clamp(
            Player.BodyForward.Dot(fight.LeadDirection), -1.0, 1.0)) * 57.29578;

        public void Key(GKey key, bool down) => Session.FeedKey(key, down);
        public void Step() => Session.StepFixed();
        public void Run(double seconds) {
            int ticks = checked((int)Math.Round(seconds * AircraftSim.TickHz));
            for (int i = 0; i < ticks; i++) Step();
        }
    }

    static AircraftState CarrierState(Carrier ship, double along, double cross, double lowM) {
        double range = Math.Max(0.0, -ship.DeckLengthM * 0.2 - along);
        double height = range * Carrier.GlideslopeSlope - lowM;
        var position = ship.LandingPoint(along, cross, height);
        return new AircraftState(position, 70.0, -0.061, ship.LandingHeadingRad, 0.0,
            FlightModel.Sabre.MassKg);
    }

    static AircraftState StateFromVelocity(Vec3D position, Vec3D velocity) {
        double speed = velocity.Length;
        Vec3D direction = velocity * (1.0 / speed);
        return new AircraftState(position, speed,
            Math.Asin(Math.Clamp(direction.Y, -1.0, 1.0)),
            Math.Atan2(direction.X, direction.Z), 0.0, FlightModel.Sabre.MassKg);
    }

    static SimulationSession NearWireCombatSession(double targetRangeM,
        double heightM = 0.02, double? alongM = null,
        bool recoveryCompletesSortie = false) {
        BeatSetup baseline = Beats.CarrierApproach();
        Carrier ship = baseline.Carrier!;
        // One fixed tick carries the main wheels through the deck beside wire three. This remains a
        // real AircraftSim integration and the normal session classifier owns the resulting contact.
        AircraftState playerAir = new(
            ship.LandingPoint(
                along: alongM ?? ship.WireAlongM(3) + Carrier.HookToMainGearM,
                height: heightM),
            70.0, -0.06, ship.LandingHeadingRad, 0.0, FlightModel.Sabre.MassKg);
        var approachSystems = new AirframeSystems(
            initialGear: LandingGearHandle.Down,
            initialFlapDegrees: AirframeSystemsProfile.F86FResearchBasis.FullFlapDegrees);
        double configuredOnSpeedAoa = DetentLayer.OnSpeedAoARad
            - approachSystems.AerodynamicState.LiftCoefficientIncrement
                / FlightModel.Sabre.CLAlpha;
        AircraftState runtimePlayer = ship.ToWorldStateFromAir(
            playerAir, configuredOnSpeedAoa);
        AircraftState target = runtimePlayer with {
            Position = runtimePlayer.Position
                + runtimePlayer.BodyAttitude.Rotate(new Vec3D(0.0, 0.0, 1.0))
                    * targetRangeM
        };
        BeatSetup setup = baseline with {
            Player = playerAir,
            Bandit = target,
            UsesReactiveBandit = false,
            BanditTimeline = new() {
                (0.0, new PilotCommand(1.0, 0.0, 0.30, 0.0))
            },
            Combat = new CombatConfig(PlayerAmmo: 4, OpponentAmmo: 0,
                PlayerHitsToDefeat: 4, OpponentHitsToDefeat: 1),
            RecoveryCompletesSortie = recoveryCompletesSortie
        };
        var session = new SimulationSession();
        session.StartBeat(() => setup);
        session.Begin();
        return session;
    }

    [Fact]
    public void ProductionQualificationFinishesAtAStoppedTrapWithoutStartingCombat() {
        var session = NearWireCombatSession(targetRangeM: 2000.0,
            recoveryCompletesSortie: true);

        session.StepFixed();
        for (int i = 0; i < 10 * AircraftSim.TickHz
            && session.Lifecycle != SimulationSession.LifecycleState.Finished; i++)
            session.StepFixed();

        Assert.Equal(Carrier.Recovery.Trap, session.Recovery);
        Assert.Equal(ArrestmentModel.ArrestmentPhase.Stopped, session.Arrestment.Phase);
        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
        Assert.Equal(SortieOutcome.Victory, session.Outcome);
        Assert.False(session.Catapult.IsActive);
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
        Assert.Equal(AircraftTerminalState.Flying, session.OpponentTerminalState);
        Assert.Equal(CarrierPassGrade.NoGrade, session.CarrierPass.Grade);
        Assert.True(session.CarrierPass.Deviations.HasFlag(CarrierPassDeviation.Incomplete),
            "a near-wire fixture must be reported as an incomplete pass, not a clean full pass");
    }

    [Fact]
    public void ProductionQualificationFinishesAsBolterBeforeAnyOpponentOutcome() {
        Carrier ship = Beats.CarrierApproach().Carrier!;
        double missedWiresAlong = ship.WireAlongM(4) + Carrier.HookToMainGearM + 4.8;
        var session = NearWireCombatSession(targetRangeM: 2000.0,
            alongM: missedWiresAlong, recoveryCompletesSortie: true);

        session.StepFixed();
        Assert.Equal(Carrier.Recovery.Bolter, session.Recovery);
        for (int i = 0; i < 8 * AircraftSim.TickHz
            && session.Lifecycle != SimulationSession.LifecycleState.Finished; i++)
            session.StepFixed();

        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
        Assert.Equal(SortieOutcome.Draw, session.Outcome);
        Assert.Equal(Carrier.Recovery.Bolter, session.Recovery);
        Assert.Equal(AircraftTerminalState.Flying, session.OpponentTerminalState);
        Assert.Equal(CarrierPassGrade.NoGrade, session.CarrierPass.Grade);
        Assert.True(session.CarrierPass.Deviations.HasFlag(CarrierPassDeviation.Incomplete));
    }

    [Fact]
    public void CarrierModeAndPaddlesCallStayCoherent() {
        var rig = new SessionHarness();
        rig.Step();
        Assert.Equal("APPROACH", rig.Mode);

        rig.Key(GKey.ThrottleUp, true);
        rig.Run(7.0);

        _o.WriteLine($"SA FREE: mode={rig.Mode} context={rig.EmittedContext} recovery={rig.Session.Recovery}");
        Assert.Equal(Carrier.Recovery.Flying, rig.Session.Recovery);
        Assert.Equal("FREE", rig.Mode);
        Assert.Null(rig.LsoCall);
        Assert.Equal(Lso.FreeFlightCall, rig.EmittedContext);
        Assert.DoesNotContain("BALL", rig.EmittedContext, StringComparison.OrdinalIgnoreCase);

        // These are classifier fixtures, not session orchestration: retain their direct precision.
        var ship = Beats.CarrierApproach().Carrier!;
        var onGlideslope = CarrierState(ship, along: -800.0, cross: 0.0, lowM: 0.0);
        Assert.True(ship.InApproachSlot(onGlideslope));
        var ball = Lso.AdviseForMode(ship, onGlideslope, DetentLayer.OnSpeedAoARad,
            DetentLayer.OnSpeedAoARad, approachMode: true, waveOff: false);
        Assert.NotNull(ball);
        Assert.Equal(LsoSeverity.OnBall, ball.Value.Severity);
        Assert.Equal("ON THE BALL", ball.Value.Call);

        var lowSlow = CarrierState(ship, along: -1000.0, cross: 0.0, lowM: 10.0);
        var power = Lso.Advise(ship, lowSlow, DetentLayer.OnSpeedAoARad + 0.030,
            DetentLayer.OnSpeedAoARad);
        Assert.Equal("POWER", power.Call);

        var sinkingOnBall = CarrierState(ship, along: -800.0, cross: 0.0, lowM: 0.0)
            with { Gamma = -0.10 };
        var sinkCall = Lso.Advise(ship, sinkingOnBall, DetentLayer.OnSpeedAoARad,
            DetentLayer.OnSpeedAoARad);
        Assert.Equal(LsoSeverity.Correcting, sinkCall.Severity);
        Assert.Equal("ADD POWER NOW", sinkCall.Call);

        var unrecoverableAtRamp = CarrierState(ship, along: -75.0, cross: 0.0, lowM: 0.0)
            with { Gamma = -0.12 };
        var sinkWaveOff = Lso.Advise(ship, unrecoverableAtRamp, DetentLayer.OnSpeedAoARad,
            DetentLayer.OnSpeedAoARad);
        Assert.Equal(LsoSeverity.WaveOff, sinkWaveOff.Severity);
        Assert.Equal("WAVE OFF, WAVE OFF", sinkWaveOff.Call);

        var grossLowSlow = CarrierState(ship, along: -400.0, cross: 0.0, lowM: 18.0);
        var unsafeCall = Lso.Advise(ship, grossLowSlow, DetentLayer.OnSpeedAoARad + 0.050,
            DetentLayer.OnSpeedAoARad);
        Assert.Equal(LsoSeverity.WaveOff, unsafeCall.Severity);
        Assert.Equal("WAVE OFF, WAVE OFF", unsafeCall.Call);
    }

    [Fact]
    public void CanFlyAwayFromTheSpawn() {
        var rig = new SessionHarness();
        double initialAltitude = rig.S.Position.Y;
        rig.Key(GKey.ThrottleUp, true);
        rig.Key(GKey.PullUp, true);
        rig.Run(14.0);

        _o.WriteLine($"FLY AWAY: alt {initialAltitude:F0}→{rig.S.Position.Y:F0} m  "
            + $"speed {rig.SpeedKt:F0} kt  gamma {rig.GammaDeg:F1}°  "
            + $"approachMode={rig.ApproachMode}  recovery={rig.Session.Recovery}");
        Assert.Equal(Carrier.Recovery.Flying, rig.Session.Recovery);
        Assert.False(rig.ApproachMode,
            "firewall+climb must drop the production session into fight logic");
        Assert.True(rig.S.Position.Y > initialAltitude + 60.0,
            $"you must be able to climb away from the boat; altitude only {initialAltitude:F0}→{rig.S.Position.Y:F0} m");
    }

    [Fact]
    public void WaveOffCleanlyEscapesToFight() {
        var rig = new SessionHarness();
        double initialAltitude = rig.S.Position.Y;
        double initialGamma = rig.GammaDeg;
        double minimumAltitude = initialAltitude;
        bool escaped = false, climbing = false;
        rig.Key(GKey.ThrottleUp, true);

        for (int i = 0; i < 600 && rig.Session.Recovery == Carrier.Recovery.Flying; i++) {
            rig.Step();
            minimumAltitude = Math.Min(minimumAltitude, rig.S.Position.Y);
            escaped |= !rig.ApproachMode;
            climbing |= escaped && rig.GammaDeg > 0.5
                && rig.S.Position.Y > minimumAltitude + 1.0;
            if (escaped && climbing) break;
        }

        _o.WriteLine($"WAVE OFF: alt {initialAltitude:F1}→{rig.S.Position.Y:F1} m "
            + $"(min {minimumAltitude:F1})  gamma {initialGamma:F1}°→{rig.GammaDeg:F1}°  "
            + $"throttle={rig.Throttle:F2} approachMode={rig.ApproachMode} "
            + $"recovery={rig.Session.Recovery}");
        Assert.Equal(Carrier.Recovery.Flying, rig.Session.Recovery);
        Assert.True(escaped, "firewall must exit approach law within five seconds");
        Assert.True(climbing,
            $"wave-off must establish a climb; gamma={rig.GammaDeg:F1}° alt={rig.S.Position.Y:F1} m min={minimumAltitude:F1} m");
    }

    [Fact]
    public void RecoveryClassifierNeverRampStrikesAboveTheDeck() {
        // Keep this as a direct Carrier fixture. It checks a local geometric invariant and does not
        // benefit from duplicating or driving the session lifecycle.
        var ship = Beats.CarrierApproach().Carrier!;
        var position = ship.ShipPoint(
            along: -ship.DeckLengthM * 0.5 - 15.0, cross: 0.0, height: 35.0);
        var aboveRoundDown = new AircraftState(position, 70.0, -0.061,
            ship.LandingHeadingRad, 0.0, FlightModel.Sabre.MassKg);

        Carrier.TouchdownResult result = ship.EvaluateRecovery(aboveRoundDown,
            DetentLayer.OnSpeedAoARad, DifficultyModel.ForLevel(0));

        Assert.Equal(Carrier.Recovery.Flying, result.Recovery);
        Assert.True(ship.DeckFrame(position).height > 30.0);
    }

    [Theory]
    [InlineData(Carrier.DeckConfiguration.Axial)]
    [InlineData(Carrier.DeckConfiguration.Angled)]
    public void PublishedRecoveryDirectorAndDeckRelativeFpmTrapAndRelaunch(
        Carrier.DeckConfiguration configuration) {
        var rig = new SessionHarness(configuration, continuousCycle: true);
        long spawn = rig.Session.PlayerSpawnSequence;
        bool arrested = false, launched = false, relaunched = false;
        Carrier.TouchdownResult trap = Carrier.TouchdownResult.Flying;
        Carrier.TouchdownResult firstContact = Carrier.TouchdownResult.Flying;
        double maxCueErrorDeg = 0.0;
        string lastApproach = "";
        bool crashed = false;
        int ticks = 0;

        // Start off the perfect rail with a short, ordinary keyboard disturbance. The 60 Hz cue
        // driver below must recover it rather than passing only because the sortie spawn is exact.
        GKey perturbation = GKey.PushDown;
        rig.Key(perturbation, true);
        rig.Run(0.05);
        rig.Key(perturbation, false);

        // This is the browser contract at its normal 60 Hz cadence: player position and attitude,
        // the published cue, and the projected deck-relative velocity. It deliberately does not
        // inspect commanded pitch, hidden glideslope error, or the burble field.
        while (!relaunched && ticks < 7200) {
            if (ticks % 2 == 0 && rig.Session.Recovery == Carrier.Recovery.Flying
                && !rig.Session.Catapult.IsActive) {
                Vec3D toCue = rig.Ship.ApproachCuePoint - rig.S.Position;
                Vec3D deckVelocity = rig.Ship.DeckRelativeVelocity(rig.S);
                double cueGamma = Math.Atan2(toCue.Y,
                    Math.Max(1.0, Math.Sqrt(toCue.X * toCue.X + toCue.Z * toCue.Z)));
                double fpmGamma = Math.Atan2(deckVelocity.Y,
                    Math.Max(1.0, Math.Sqrt(deckVelocity.X * deckVelocity.X
                        + deckVelocity.Z * deckVelocity.Z)));
                double verticalError = cueGamma - fpmGamma;
                maxCueErrorDeg = Math.Max(maxCueErrorDeg, Math.Abs(verticalError) * 57.2958);
                // The waterline and alpha readout are public HUD symbols too. Hold the waterline
                // one on-speed-alpha above the cue; the deck-relative FPM then settles onto it
                // without chasing its lag into a pilot-induced oscillation.
                double visiblePitch = Math.Asin(Math.Clamp(rig.Player.BodyForward.Y, -1.0, 1.0));
                double pitchError = cueGamma + rig.Ship.ApproachDirectorPitchOffsetRad
                    - visiblePitch;
                rig.Key(GKey.PullUp, pitchError > 0.0025);
                rig.Key(GKey.PushDown, pitchError < -0.0025);
                rig.Key(GKey.RollRight, false);
                rig.Key(GKey.RollLeft, false);
                var deck = rig.Ship.LandingFrame(rig.S.Position);
                lastApproach = $"along={deck.along:F1} cross={deck.cross:F1} h={deck.height:F2} "
                    + $"deckV=({deckVelocity.X:F1},{deckVelocity.Y:F1},{deckVelocity.Z:F1}) "
                    + $"air={rig.AirspeedMps:F1} aoa={rig.Player.AngleOfAttackRad * 57.2958:F1} "
                    + $"thr={rig.Throttle:F2} cueErr={verticalError * 57.2958:F2}deg";
            }

            rig.Step();
            ticks++;
            if (rig.Session.PlayerSpawnSequence != spawn) {
                crashed = true;
                break;
            }

            if (rig.Session.Touchdown.Recovery == Carrier.Recovery.Trap)
                trap = rig.Session.Touchdown;
            if (firstContact.Recovery == Carrier.Recovery.Flying
                && rig.Session.Touchdown.Recovery != Carrier.Recovery.Flying)
                firstContact = rig.Session.Touchdown;
            arrested |= rig.Session.Arrestment.Phase != ArrestmentModel.ArrestmentPhase.None;
            launched |= rig.Session.Catapult.IsActive;
            relaunched = launched
                && rig.Session.Catapult.Phase == CatapultLaunchModel.LaunchPhase.None
                && rig.Session.Arrestment.Phase == ArrestmentModel.ArrestmentPhase.None;
        }

        _o.WriteLine($"PUBLIC CUE {configuration}: arrest={arrested} relaunch={relaunched} "
            + $"wire={trap.Wire} sink={trap.SinkRateMps:F2}m/s air={trap.AirspeedMps:F1} "
            + $"closure={trap.ClosureMps:F1} lead={rig.Ship.ApproachCueLeadM:F0}m "
            + $"peak-cue-error={maxCueErrorDeg:F2}deg ticks={ticks} crashed={crashed} "
            + $"first={firstContact.Recovery}/{firstContact.Hook}/wire{firstContact.Wire} "
            + $"{firstContact.Quality} @{firstContact.WheelAlongM:F1}m "
            + $"sink={firstContact.SinkRateMps:F3} air={firstContact.AirspeedMps:F2} "
            + $"closure={firstContact.ClosureMps:F2} lineup={firstContact.LineupErrorM:F2} "
            + $"last=[{lastApproach}]");
        Assert.False(crashed, $"flying the public cue crashed: {lastApproach}");
        Assert.True(arrested, "flying the waterline to its published director must arrest");
        Assert.True(launched, "the successful public-cue pass must progress to catapult launch");
        Assert.True(relaunched, "the public-cue pass must complete the production deck cycle");
        Assert.Equal(Carrier.Recovery.Trap, trap.Recovery);
        Assert.InRange(trap.Wire, 1, 4);
        Assert.InRange(trap.SinkRateMps, Carrier.MinTrapSinkMps, Carrier.MaxTrapSinkMps);
        Assert.Equal(rig.Ship.TouchdownAlongM + rig.Ship.ApproachCueLeadM,
            rig.Ship.ApproachCueAlongM, 10);
    }

    [Theory]
    [InlineData(Carrier.DeckConfiguration.Axial)]
    [InlineData(Carrier.DeckConfiguration.Angled)]
    public void ACompetentPilotTrapsRollsOutAndRelaunches(
        Carrier.DeckConfiguration configuration) {
        var rig = new SessionHarness(configuration, continuousCycle: true);
        bool sawArrestment = false;
        bool sawCatapult = false;
        bool relaunched = false;
        int caughtWire = 0;
        double arrestDistanceM = 0.0;
        double arrestSeconds = 0.0;
        Carrier.TouchdownResult trapTouchdown = Carrier.TouchdownResult.Flying;
        double fuelAtArrestment = double.NaN;
        double fuelAtCatapult = double.NaN;
        int ammoAtArrestment = -1;
        string stoppedTrapCue = "";
        int steps = 0;

        while (!relaunched && steps++ < 7200) {
            if (rig.Session.Recovery == Carrier.Recovery.Flying
                && !rig.Session.Catapult.IsActive) {
                double burble = rig.Burble.InCloseStrength(rig.S.Position);
                var deck = rig.Deck;
                double responseLead = configuration == Carrier.DeckConfiguration.Angled
                    ? 140.0 : 204.0;
                double targetAlong = rig.Ship.TouchdownAlongM + responseLead;
                double wantedDeckGamma = Math.Atan2(-deck.height,
                    Math.Max(1.0, targetAlong - deck.along));
                double desiredPitch = wantedDeckGamma + rig.Ship.ApproachDirectorPitchOffsetRad;
                double pitchError = desiredPitch - rig.Player.BodyPitchRad;
                rig.Key(GKey.PullUp, pitchError > 0.0025);
                rig.Key(GKey.PushDown, pitchError < -0.0025);

                double wantedPower = Math.Clamp(rig.Session.Controls.ApproachTrimThrottle
                    + 0.040 * Math.Max(0.0, rig.GlideslopeErrorM)
                    + 0.026 * (70.0 - rig.AirspeedMps) + 0.15 * burble, 0.02, 0.90);
                if (deck.along > -500.0) {
                    rig.Key(GKey.ThrottleUp, rig.Throttle < wantedPower - 0.015);
                    rig.Key(GKey.ThrottleDown, rig.Throttle > wantedPower + 0.015);
                }
            }

            rig.Step();

            if (rig.Session.Touchdown.Recovery == Carrier.Recovery.Trap)
                trapTouchdown = rig.Session.Touchdown;
            if (rig.Session.Arrestment.Phase != ArrestmentModel.ArrestmentPhase.None) {
                sawArrestment = true;
                if (!double.IsFinite(fuelAtArrestment)) {
                    fuelAtArrestment = rig.Session.PlayerFuel.FuelLb;
                    ammoAtArrestment = rig.Session.PlayerGun.AmmoRemaining;
                }
                caughtWire = rig.Session.Arrestment.CaughtWire;
                arrestDistanceM = rig.Session.Arrestment.DistanceM;
                arrestSeconds = rig.Session.Arrestment.ElapsedSeconds;
            }
            if (rig.Session.Catapult.IsActive) {
                sawCatapult = true;
                if (stoppedTrapCue.Length == 0)
                    stoppedTrapCue = rig.Session.TransitionCue;
                if (!double.IsFinite(fuelAtCatapult))
                    fuelAtCatapult = rig.Session.PlayerFuel.FuelLb;
            }
            relaunched = sawCatapult
                && rig.Session.Catapult.Phase == CatapultLaunchModel.LaunchPhase.None
                && rig.Session.Arrestment.Phase == ArrestmentModel.ArrestmentPhase.None;
        }

        var (along, cross, height) = rig.Deck;
        _o.WriteLine($"WINNABLE {configuration}: arrest={sawArrestment} relaunch={relaunched} "
            + $"recovery={rig.Session.Recovery} wire={caughtWire} after {steps} steps "
            + $"along={along:F0} cross={cross:F0} h={height:F1} "
            + $"sink={trapTouchdown.SinkRateMps:F2}m/s air={trapTouchdown.AirspeedMps:F1} "
            + $"closure={trapTouchdown.ClosureMps:F1} aoa={rig.Player.AngleOfAttackRad * 57.2958:F1}° "
            + $"hook={trapTouchdown.Hook} quality={trapTouchdown.Quality} "
            + $"stop={arrestDistanceM:F1}m/{arrestSeconds:F2}s");
        Assert.True(sawArrestment, "the production session must engage an arresting wire");
        Assert.True(sawCatapult, "a stopped production arrestment must begin a catapult launch");
        Assert.True(relaunched, "the production session must hand the airborne launch back to flight");
        Assert.Equal(Carrier.Recovery.Trap, trapTouchdown.Recovery);
        Assert.Equal(Carrier.Recovery.Flying, rig.Session.Recovery);
        Assert.Equal(ArrestmentModel.ArrestmentPhase.None, rig.Session.Arrestment.Phase);
        Assert.Equal(CatapultLaunchModel.LaunchPhase.None, rig.Session.Catapult.Phase);
        Assert.InRange(caughtWire, 1, 4);
        Assert.Contains($"W{caughtWire}", stoppedTrapCue);
        Assert.Contains(trapTouchdown.Grade switch {
            Carrier.TouchdownGrade.Ok => "OK",
            Carrier.TouchdownGrade.Fair => "FAIR",
            Carrier.TouchdownGrade.NoGrade => "NO GRADE",
            Carrier.TouchdownGrade.Cut => "CUT",
            _ => "UNASSESSED"
        }, stoppedTrapCue);
        if (trapTouchdown.Grade == Carrier.TouchdownGrade.NoGrade)
            Assert.DoesNotContain("REVIEW TOUCHDOWN ASSESSMENT", stoppedTrapCue);
        Assert.InRange(arrestDistanceM, 90.0, 100.0);
        Assert.InRange(arrestSeconds, 3.0, 5.5);
        Assert.True(rig.S.Position.Y > rig.Ship.Position.Y,
            "catapult handoff must be airborne above the flight deck");
        Assert.True(fuelAtCatapult < fuelAtArrestment,
            "fuel must continue burning during arrestment");
        Assert.True(rig.Session.PlayerFuel.FuelLb < fuelAtCatapult,
            "fuel must continue burning during the catapult stroke");
        Assert.Equal(ammoAtArrestment, rig.Session.PlayerGun.AmmoRemaining);
        Assert.Equal(1, rig.Session.RecoveryProgress.CleanTrapCount);
        Assert.Equal(2, rig.Session.RecoveryProgress.AttemptCount);
        Assert.Equal(1, rig.Session.Difficulty.AttemptIndex);

        double timeAfterLaunch = rig.TimeSeconds;
        Vec3D positionAfterLaunch = rig.S.Position;
        rig.Run(0.5);
        Assert.True(rig.TimeSeconds > timeAfterLaunch);
        Assert.True((rig.S.Position - positionAfterLaunch).Length > 10.0,
            "the relaunched aircraft must keep integrating without a stopped frame");
    }

    [Fact]
    public void KillOnTouchdownTickStillClassifiesAndCompletesAValidTrap() {
        var session = NearWireCombatSession(targetRangeM: 0.0);
        session.FeedKey(GKey.Trigger, true);
        session.StepFixed();
        session.FeedKey(GKey.Trigger, false);

        Assert.Equal(1, session.KillCount);
        Assert.NotEqual(AircraftTerminalState.Flying,
            session.OpponentTerminalState);
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
        Assert.Equal(Carrier.Recovery.Trap, session.Touchdown.Recovery);
        Assert.Equal(ArrestmentModel.ArrestmentPhase.Arrested,
            session.Arrestment.Phase);
        Assert.DoesNotContain(session.RecentEvents, e => e.Target == CombatRole.Player
            && e.Type is SessionEventType.Destroyed or SessionEventType.Impact);

        bool sawCatapult = false;
        for (int i = 0; i < 30 * AircraftSim.TickHz
            && session.Lifecycle != SimulationSession.LifecycleState.Finished; i++) {
            sawCatapult |= session.Catapult.IsActive;
            session.StepFixed();
        }

        Assert.True(sawCatapult,
            "terminal resolution must allow the already-earned wire to roll out and relaunch");
        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
        Assert.Equal(SortieOutcome.Victory, session.Outcome);
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
        Assert.DoesNotContain(session.RecentEvents, e => e.Target == CombatRole.Player
            && e.Type is SessionEventType.Destroyed or SessionEventType.Impact);
    }

    [Fact]
    public void DelayedHitDuringArrestmentKeepsWireAndWorldAtOneFixedStep() {
        var session = NearWireCombatSession(targetRangeM: 500.0);
        session.FeedKey(GKey.Trigger, true);
        session.StepFixed();
        session.FeedKey(GKey.Trigger, false);

        Assert.Equal(ArrestmentModel.ArrestmentPhase.Arrested,
            session.Arrestment.Phase);
        Assert.Equal(AircraftTerminalState.Flying, session.OpponentTerminalState);
        Assert.NotEmpty(session.PlayerGun.RoundsInFlight);
        Assert.Equal(session.Arrestment.Position, session.Player.State.Position);

        bool delayedHitDuringRunout = false;
        for (int i = 0; i < 2 * AircraftSim.TickHz
            && session.Arrestment.Phase == ArrestmentModel.ArrestmentPhase.Arrested; i++) {
            double banditTime = session.Bandit.T;
            session.StepFixed();
            Assert.Equal(banditTime + SimulationSession.FixedDeltaSeconds,
                session.Bandit.T, precision: 11);
            Assert.Equal(session.Arrestment.Position, session.Player.State.Position);
            Vec3D expectedVelocity = session.Carrier!.DeckVelocityWorld
                + session.Carrier.LandingFwd * session.Arrestment.RelativeSpeedMps
                + new Vec3D(0.0, session.Carrier.DeckVerticalVelocityMps, 0.0);
            Assert.True((session.Player.State.VelocityVector() - expectedVelocity).Length < 1e-8,
                "weapons, bandit law, systems and replay must see the moving arrested ownship");
            if (session.OpponentTerminalState != AircraftTerminalState.Flying) {
                delayedHitDuringRunout = true;
                break;
            }
        }

        Assert.True(delayedHitDuringRunout,
            "the pre-touchdown round must resolve after wire engagement");
        Assert.Equal(ArrestmentModel.ArrestmentPhase.Arrested,
            session.Arrestment.Phase);
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);

        bool sawCatapult = false;
        for (int i = 0; i < 30 * AircraftSim.TickHz
            && session.Lifecycle != SimulationSession.LifecycleState.Finished; i++) {
            sawCatapult |= session.Catapult.IsActive;
            session.StepFixed();
        }
        Assert.True(sawCatapult);
        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
        Assert.Equal(SortieOutcome.Victory, session.Outcome);
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
    }

    [Fact]
    public void WaveOffThenStoppedTrapRecordsSetbackWithoutCleanMastery() {
        BeatSetup geometry = Beats.CarrierApproach();
        Carrier ship = geometry.Carrier!;
        const double startHeightM = 2.0;
        // Allow for the deck-relative travel while descending from the short setup point so the hook
        // still reaches wire three after the deliberate throttle excursion.
        double startAlongM = ship.WireAlongM(3) + Carrier.HookToMainGearM - 26.0;
        var session = NearWireCombatSession(targetRangeM: 2000.0,
            heightM: startHeightM, alongM: startAlongM);

        session.FeedKey(GKey.ThrottleUp, true);
        for (int i = 0; i < AircraftSim.TickHz && !session.WaveOffActive; i++)
            session.StepFixed();
        Assert.True(session.WaveOffActive,
            "the fixture must earn a real production wave-off before touching down");

        session.FeedKey(GKey.ThrottleUp, false);
        session.FeedKey(GKey.ThrottleDown, true);
        session.FeedKey(GKey.PullUp, true);
        bool throttleReleased = false;
        for (int i = 0; i < 3 * AircraftSim.TickHz
            && session.Arrestment.Phase == ArrestmentModel.ArrestmentPhase.None
            && session.PlayerTerminalState == AircraftTerminalState.Flying; i++) {
            if (!throttleReleased && session.Controls.Throttle <= 0.86) {
                session.FeedKey(GKey.ThrottleDown, false);
                throttleReleased = true;
            }
            session.StepFixed();
        }
        if (!throttleReleased) session.FeedKey(GKey.ThrottleDown, false);
        session.FeedKey(GKey.PullUp, false);

        Assert.Equal(Carrier.Recovery.Trap, session.Touchdown.Recovery);
        Assert.Equal(ArrestmentModel.ArrestmentPhase.Arrested,
            session.Arrestment.Phase);

        for (int i = 0; i < 8 * AircraftSim.TickHz && !session.Catapult.IsActive; i++)
            session.StepFixed();

        Assert.True(session.Catapult.IsActive);
        Assert.Equal(0, session.RecoveryProgress.CleanTrapCount);
        Assert.Equal(0, session.RecoveryProgress.CleanStreak);
        Assert.Equal(1, session.RecoveryProgress.RecentSetbacks);
        Assert.Equal(1, session.RecoveryProgress.AttemptCount);
    }

    [Fact]
    public void SeaImpactCarriesThroughWaterMotionAndSettlesDeterministically() {
        var impact = new AircraftState(new Vec3D(8000.0, -2.0, 8000.0), 180.0,
            -0.25, 0.4, 0.0, FlightModel.Sabre.MassKg);

        SimulationSession CreateImpactSession() {
            var session = new SimulationSession();
            session.StartBeat(() => Beats.Perch() with { Player = impact });
            session.Begin();
            return session;
        }

        var first = CreateImpactSession();
        var second = CreateImpactSession();
        first.StepFixed();
        second.StepFixed();

        Assert.Equal(first.Player.State, second.Player.State);
        Assert.Equal(Carrier.Recovery.Flying, first.Recovery);
        Assert.Equal(AircraftTerminalState.Impacted, first.PlayerTerminalState);
        Assert.Equal(ImpactSurface.Water, first.PlayerImpactSurface);
        Assert.Equal(SimulationSession.LifecycleState.Active, first.Lifecycle);
        double time = first.TimeSeconds;
        Vec3D position = first.Player.State.Position;
        for (int i = 0; i < AircraftSim.TickHz / 2; i++) {
            first.StepFixed();
            second.StepFixed();
        }
        Assert.True(first.TimeSeconds > time);
        Assert.True((first.Player.State.Position - position).Length > 10.0,
            "water entry must retain and dissipate real impact momentum");
        for (int i = 0; i < 20 * AircraftSim.TickHz
            && first.Lifecycle != SimulationSession.LifecycleState.Finished; i++) {
            first.StepFixed();
            second.StepFixed();
        }
        Assert.Equal(SimulationSession.LifecycleState.Finished, first.Lifecycle);
        Assert.Equal(AircraftTerminalState.Settled, first.PlayerTerminalState);
        Assert.Equal(first.Player.State, second.Player.State);
        Assert.Equal(first.RecentEvents, second.RecentEvents);
        Assert.Equal(SessionEventType.SortieFinished, first.RecentEvents[^1].Type);
    }

    [Fact]
    public void FlyingIntoCarrierIslandReboundsOntoSolidDeckAndSettlesThere() {
        BeatSetup setup = Beats.CarrierApproach();
        Carrier ship = setup.Carrier!;
        Vec3D start = ship.ShipPoint(along: 7.0, cross: 10.7, height: 10.0);
        Vec3D end = start + ship.Fwd * 3.0;
        Assert.Equal(Carrier.SolidCollision.Island,
            ship.SweptSolidCollision(start, end));
        setup = setup with {
            Player = new AircraftState(start, 240.0, 0.0, ship.HeadingRad,
                0.0, FlightModel.Sabre.MassKg)
        };

        var session = new SimulationSession();
        session.StartBeat(() => setup);
        session.Begin();
        double before = session.TimeSeconds;
        session.StepFixed();

        Assert.Equal(Carrier.Recovery.Flying, session.Recovery);
        Assert.Equal(AircraftTerminalState.Impacted, session.PlayerTerminalState);
        Assert.Equal(ImpactSurface.CarrierStructure, session.PlayerImpactSurface);
        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
        Assert.True(session.TimeSeconds > before);

        AircraftState impactState = session.Player.State;
        for (int i = 0; i < 20 * AircraftSim.TickHz
            && session.Lifecycle != SimulationSession.LifecycleState.Finished; i++)
            session.StepFixed();

        Assert.NotEqual(impactState.Position, session.Player.State.Position);
        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
        Assert.Equal(AircraftTerminalState.Settled, session.PlayerTerminalState);
        Assert.Equal(ImpactSurface.FlightDeck, session.PlayerImpactSurface);
        SessionEvent[] impacts = session.RecentEvents.Where(e =>
            e.Type == SessionEventType.Impact && e.Target == CombatRole.Player).ToArray();
        Assert.Collection(impacts,
            e => Assert.Equal(ImpactSurface.CarrierStructure, e.Surface),
            e => Assert.Equal(ImpactSurface.FlightDeck, e.Surface));
        Assert.Equal(SessionEventType.SortieFinished, session.RecentEvents[^1].Type);
    }

    [Fact]
    public void FastDeckWreckSlidesOverRealEdgeFallsAndSettlesInWater() {
        BeatSetup setup = Beats.CarrierApproach();
        Carrier ship = setup.Carrier!;
        Vec3D position = ship.ShipPoint(
            along: ship.DeckLengthM * 0.5 - 10.0, cross: 0.0, height: 0.05);
        Vec3D desiredGroundVelocity = ship.DeckVelocityWorld
            + ship.Fwd * 70.0 + new Vec3D(0.0, -12.0, 0.0);
        Vec3D airVelocity = desiredGroundVelocity - ship.SteadyWindWorld;
        setup = setup with { Player = StateFromVelocity(position, airVelocity) };

        var session = new SimulationSession();
        session.StartBeat(() => setup);
        session.Begin();
        for (int i = 0; i < 2 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying; i++)
            session.StepFixed();

        Assert.Equal(AircraftTerminalState.Impacted, session.PlayerTerminalState);
        Assert.Equal(ImpactSurface.FlightDeck, session.PlayerImpactSurface);
        Vec3D deckImpactPosition = session.Player.State.Position;

        bool sawSupportedDeckContact = false;
        bool leftDeck = false;
        for (int i = 0; i < 4 * AircraftSim.TickHz && !leftDeck; i++) {
            session.StepFixed();
            bool overDeck = session.Carrier!.WithinDeckFootprint(
                session.Player.State.Position);
            sawSupportedDeckContact |= overDeck && session.PlayerSystems.WeightOnWheels;
            if (!overDeck) {
                leftDeck = true;
                Assert.False(session.PlayerSystems.WeightOnWheels);
            }
        }
        Assert.True(sawSupportedDeckContact,
            "the systems model must see weight while the wreck is supported by the deck");
        Assert.True(leftDeck, "the fast wreck fixture must pass the real deck edge");

        for (int i = 0; i < 20 * AircraftSim.TickHz
            && session.Lifecycle != SimulationSession.LifecycleState.Finished; i++)
            session.StepFixed();

        Assert.True((session.Player.State.Position - deckImpactPosition).Length > 10.0,
            "post-impact momentum must move the wreck rather than pinning it to contact");
        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
        Assert.Equal(ImpactSurface.Water, session.PlayerImpactSurface);
        Assert.False(session.PlayerSystems.WeightOnWheels,
            "water/debris motion must not hold the gear weight switches on");
        SessionEvent[] impacts = session.RecentEvents.Where(e =>
            e.Type == SessionEventType.Impact && e.Target == CombatRole.Player).ToArray();
        Assert.Collection(impacts,
            e => Assert.Equal(ImpactSurface.FlightDeck, e.Surface),
            e => Assert.Equal(ImpactSurface.Water, e.Surface));
        Assert.Equal(ImpactSurface.Water, session.RecentEvents.Single(e =>
            e.Type == SessionEventType.Settled
                && e.Target == CombatRole.Player).Surface);
    }

    [Fact]
    public void PilotStartsOnFinalsFirewallsEgressesAndKills() {
        var rig = new SessionHarness(continuousCycle: true);
        double finalsAltitude = rig.S.Position.Y, finalsSpeed = rig.Player.AirspeedMps;
        Vec3D banditStart = rig.B.Position;

        Assert.True(rig.InApproachSlot,
            "the production sortie must genuinely start in the carrier groove");
        Assert.Equal(0, rig.Session.Beat.CombatRules.OpponentAmmo);
        Assert.Equal(0, rig.Session.OpponentGun.AmmoRemaining);

        rig.Key(GKey.ThrottleUp, true);
        bool leftApproachLaw = false;
        bool sawAutomaticCleanup = false;
        bool sawReadyToFight = false;
        double freeAt = double.NaN;
        void ObserveConfigurationCue() {
            sawAutomaticCleanup |= rig.Session.ConfigurationCue.StartsWith("AUTO CLEANUP");
            sawReadyToFight |= rig.Session.ConfigurationCue == "CLEAN · READY TO FIGHT";
        }
        while (rig.TimeSeconds < 6.0 && rig.Session.Recovery == Carrier.Recovery.Flying) {
            rig.Step();
            ObserveConfigurationCue();
            leftApproachLaw |= !rig.ApproachMode;
            if (rig.Mode == "FREE") {
                freeAt = rig.TimeSeconds;
                break;
            }
        }
        Assert.Equal(Carrier.Recovery.Flying, rig.Session.Recovery);
        Assert.True(leftApproachLaw,
            "firewall must hand the production session from approach law to fight law");
        Assert.True(double.IsFinite(freeAt),
            "the five-second wave-off must settle into free flight");
        Assert.InRange(freeAt, 0.0, 5.5);
        Assert.Equal(FlightConfigurationTarget.Combat, rig.Session.ConfigurationTarget);
        Assert.True(rig.Session.AutomaticGearSelection);
        Assert.True(rig.Session.AutomaticFlapSelection);

        while (rig.TimeSeconds < 20.0 && rig.Session.Recovery == Carrier.Recovery.Flying
               && (rig.S.Position.Y < finalsAltitude + 150.0
                   || rig.Player.AirspeedMps < 100.0)) {
            bool accelerate = rig.S.Position.Y >= finalsAltitude + 170.0;
            double gammaLow = accelerate ? 0.025 : 0.09;
            double gammaHigh = accelerate ? 0.055 : 0.18;
            rig.Key(GKey.PullUp, rig.S.Gamma < gammaLow);
            rig.Key(GKey.PushDown, rig.S.Gamma > gammaHigh);
            rig.Step();
            ObserveConfigurationCue();
        }
        rig.Key(GKey.PullUp, false);
        rig.Key(GKey.PushDown, false);
        double egressAt = rig.TimeSeconds;
        double egressAltitude = rig.S.Position.Y;
        double egressSpeedKt = rig.Player.AirspeedMps * AirData.MpsToKnots;
        Assert.Equal(Carrier.Recovery.Flying, rig.Session.Recovery);
        Assert.Equal(FlightModel.Sabre.MaxThrustFraction, rig.Throttle, precision: 10);
        Assert.Equal(1.0, FlightModel.Sabre.MaxThrustFraction);
        Assert.True(rig.Session.PlayerSystems.AllGearUpAndLocked);
        Assert.InRange(rig.Session.PlayerSystems.EffectiveFlapFraction, 0.0, 0.01);
        Assert.True(sawAutomaticCleanup,
            "waveoff must explicitly announce the automatic cleanup task");
        Assert.True(sawReadyToFight,
            "physical gear/flap completion must announce that the jet is ready to fight");
        Assert.True(rig.S.Position.Y > finalsAltitude + 150.0,
            $"egress must gain useful altitude: {finalsAltitude:F0}→{rig.S.Position.Y:F0} m");
        Assert.True(rig.Player.AirspeedMps > Math.Max(94.0, finalsSpeed + 20.0),
            $"egress must build fighting air energy: {finalsSpeed:F0}→{rig.Player.AirspeedMps:F0} m/s");
        Assert.True(Finite(rig.S) && rig.Player.AirspeedMps > 60.0,
            "the pilot must stay finite and flying");
        Assert.True(Math.Abs(rig.S.Bank) < 0.15,
            "the egress must be cleaned up wings-level before the intercept");
        double banditTravel = (rig.B.Position - banditStart).Length;
        Assert.True(banditTravel > 800.0 && rig.B.Speed > 85.0 && Math.Abs(rig.B.Chi) > 0.5,
            $"the reactive bogey must maneuver at fighter speed: travel={banditTravel:F0} m speed={rig.B.Speed:F0} m/s chi={rig.B.Chi:F2}");

        GunKill kill = rig.Fight;
        Assert.True(kill.BanditAlive);
        bool achievedLead = false;
        double leadAt = double.NaN, leadAvailableAt = double.NaN, firstHitAt = double.NaN;
        double minAimErrorDeg = double.PositiveInfinity, minRangeM = double.PositiveInfinity;
        Vec3D previousBanditVelocity = rig.B.VelocityVector();
        Vec3D splashPlayerPosition = default;

        while (rig.TimeSeconds < 100.0 && rig.Session.Recovery == Carrier.Recovery.Flying
               && rig.Session.KillCount == 0) {
            var lineOfSight = (rig.B.Position - rig.S.Position).Normalized();
            double closureMps = (rig.S.VelocityVector() - rig.B.VelocityVector())
                .Dot(lineOfSight);
            bool brakeForOvershoot = rig.RangeM < 650.0 && closureMps > 45.0
                && rig.S.Speed > 155.0;
            bool needCombatPower = !brakeForOvershoot
                && (rig.S.Speed < 150.0 || rig.RangeM > 1000.0 || closureMps < 15.0);
            rig.Key(GKey.ThrottleUp, needCombatPower);
            rig.Key(GKey.ThrottleDown, brakeForOvershoot);

            Vec3D banditVelocity = rig.B.VelocityVector();
            Vec3D banditAcceleration = (banditVelocity - previousBanditVelocity)
                * AircraftSim.TickHz;
            previousBanditVelocity = banditVelocity;
            double acceleration = banditAcceleration.Length;
            if (acceleration > 30.0) banditAcceleration *= 30.0 / acceleration;
            Vec3D aimPoint = kill.HasLeadSolution
                ? kill.LeadPipper + banditAcceleration
                    * (0.5 * kill.LeadTimeOfFlight * kill.LeadTimeOfFlight)
                : rig.B.Position;
            bool deckRecovery = rig.S.Position.Y < 330.0;
            double wantedBank = deckRecovery ? 0.0
                : Geometry.BankToPlaceLiftVectorOn(rig.S, aimPoint);
            double bankError = Math.IEEERemainder(wantedBank - rig.S.Bank,
                2.0 * Math.PI);
            // The flown lateral model is a real aileron/Clp system, so neutralising at the desired
            // bank is already too late: angular momentum carries the lift vector through it. This
            // short rate lead makes the synthetic pilot release the public roll key before capture,
            // just as a human rolls out, without adding a hidden bank-hold servo to the aircraft.
            double predictedBankError = bankError - rig.S.BodyRates.P * 0.18;
            rig.Key(GKey.RollRight, predictedBankError > 0.035);
            rig.Key(GKey.RollLeft, predictedBankError < -0.035);
            Vec3D aimDirection = (aimPoint - rig.S.Position).Normalized();
            double aimError = Math.Acos(Math.Clamp(
                rig.Player.BodyForward.Dot(aimDirection), -1.0, 1.0));
            double lateralError = rig.Player.BodyRight.Dot(aimDirection);
            double verticalError = rig.Player.BodyUp.Dot(aimDirection);
            bool liftPlaneSet = Math.Abs(bankError) < 0.30;
            bool energyLow = rig.S.Speed < 115.0;
            bool pullForDeck = deckRecovery && liftPlaneSet && rig.S.Gamma < 0.08;
            rig.Key(GKey.PullUp, pullForDeck || (!energyLow && !deckRecovery
                && liftPlaneSet && verticalError > 0.0018 && aimError > 0.0025));
            rig.Key(GKey.PushDown, !energyLow && !deckRecovery
                && liftPlaneSet && verticalError < -0.0018 && aimError > 0.0025);

            bool onPipper = kill.HasLeadSolution && aimError < 0.035;
            // Bank and G fly the pursuit geometry; once inside the sight ring, fine pedal input
            // supplies the small lateral correction a fixed-gun pilot needs to settle the pipper.
            // The 0.2-degree deadband is deliberately inside the target's 8 m angular radius at
            // normal firing range, instead of accepting a platform-sensitive lateral limit cycle.
            const double lateralCapture = 0.0035;
            rig.Key(GKey.RudderRight, onPipper && lateralError > lateralCapture);
            rig.Key(GKey.RudderLeft, onPipper && lateralError < -lateralCapture);
            if (kill.HasLeadSolution) {
                if (!double.IsFinite(leadAvailableAt)) leadAvailableAt = rig.TimeSeconds;
                minAimErrorDeg = Math.Min(minAimErrorDeg, rig.GunAimErrorDeg(kill));
            }
            minRangeM = Math.Min(minRangeM, rig.RangeM);
            rig.Key(GKey.Trigger, onPipper);
            if (onPipper) {
                achievedLead = true;
                if (!double.IsFinite(leadAt)) leadAt = rig.TimeSeconds;
            }

            Vec3D beforeStep = rig.S.Position;
            rig.Step();
            if (!double.IsFinite(firstHitAt) && kill.HitCount > 0)
                firstHitAt = rig.TimeSeconds;
            if (rig.Session.KillCount > 0) {
                splashPlayerPosition = beforeStep;
            }
        }
        rig.Key(GKey.RudderRight, false);
        rig.Key(GKey.RudderLeft, false);
        // The synthetic pilot has completed the intercept. Stand down every manoeuvring input it
        // may have held on the splash tick; terminal physics should evaluate a surviving ownship,
        // not keep flying the last bang-bang pursuit command while the wreck falls to the sea.
        rig.Key(GKey.RollRight, false);
        rig.Key(GKey.RollLeft, false);
        rig.Key(GKey.PullUp, false);
        rig.Key(GKey.PushDown, false);

        _o.WriteLine($"FULL SORTIE: free={freeAt:F1}s "
            + $"egress={egressAt:F1}s/{egressSpeedKt:F0}kt/{egressAltitude:F0}m "
            + $"leadAvail={leadAvailableAt:F1}s onPipper={leadAt:F1}s "
            + $"firstHit={firstHitAt:F1}s splash={rig.TimeSeconds:F1}s "
            + $"range={rig.RangeM:F0}m/min{minRangeM:F0}m "
            + $"aimErr={rig.GunAimErrorDeg(rig.Fight):F2}°/min{minAimErrorDeg:F2}° "
            + $"rounds={kill.RoundsFired} hits={kill.HitCount} ammo={kill.AmmoRemaining} "
            + $"kills={rig.Session.KillCount} terminalRange={rig.RangeM:F0}m "
            + $"outcome={rig.Session.Outcome}");
        Assert.Equal(Carrier.Recovery.Flying, rig.Session.Recovery);
        Assert.True(achievedLead,
            "the pilot must close, fly the computed lead pipper, and fire on solution");
        Assert.True(kill.HitCount >= GunKill.DefaultHitsToKill,
            "only real round intersections may do damage");
        Assert.True(kill.RoundsFired > kill.HitCount,
            "the harness must permit honest misses, not award every trigger tick");
        Assert.True(firstHitAt > leadAt + 0.15,
            "damage must wait for round time-of-flight, not advance with trigger time");
        Assert.True(kill.HasInfiniteAmmo,
            "the player sortie must use the thermally limited infinite gun");
        Assert.Equal(GunKill.DefaultAmmo, kill.AmmoRemaining);
        Assert.Equal(FightOutcome.Splash, kill.Outcome);
        Assert.False(kill.BanditAlive);
        Assert.Equal(1.0, kill.KillProgress, 10);
        Assert.Equal(1, rig.Session.KillCount);
        Assert.Equal(SimulationSession.LifecycleState.Active, rig.Session.Lifecycle);
        Assert.Equal(SortieOutcome.Victory, rig.Session.PendingOutcome);
        Assert.Equal(SortieOutcome.None, rig.Session.Outcome);
        Assert.Equal(FightOutcome.Splash, rig.Fight.Outcome);
        Assert.False(rig.Fight.TargetAlive);
        Assert.IsType<ReactiveBandit>(rig.Bandit);
        Assert.True((rig.S.Position - splashPlayerPosition).Length > 0.5,
            "ownship must keep integrating through the splash tick");
        Assert.True(rig.TimeSeconds < 100.0,
            "the production finals-to-splash intercept must complete inside the acceptance window");

        double destroyedAt = rig.TimeSeconds;
        AircraftState destroyedBandit = rig.B;
        while (rig.Session.Lifecycle != SimulationSession.LifecycleState.Finished
            && rig.TimeSeconds < destroyedAt
                + SimulationSession.TerminalSimulationLimitSeconds + 20.0) {
            // Splash is not permission for the synthetic pilot to stop flying. Recover the bank and
            // flight path using the same public controls while the destroyed aircraft completes its
            // physical fall; otherwise the test is measuring an abandoned ownship, not continuity.
            double recoveryBankError = Math.IEEERemainder(-rig.S.Bank, 2.0 * Math.PI);
            rig.Key(GKey.RollRight, recoveryBankError > 0.035);
            rig.Key(GKey.RollLeft, recoveryBankError < -0.035);
            bool bankNearlyLevel = Math.Abs(recoveryBankError) < 0.20;
            rig.Key(GKey.PullUp, bankNearlyLevel && rig.S.Gamma < -0.02);
            rig.Key(GKey.PushDown, bankNearlyLevel && rig.S.Gamma > 0.12);
            rig.Step();
        }

        Assert.NotEqual(destroyedBandit.Position, rig.B.Position);
        Assert.Equal(SimulationSession.LifecycleState.Finished, rig.Session.Lifecycle);
        Assert.Equal(SortieOutcome.Victory, rig.Session.Outcome);
        Assert.Equal(AircraftTerminalState.Settled,
            rig.Session.OpponentTerminalState);
        Assert.Contains(rig.Session.RecentEvents, e => e.Type == SessionEventType.Impact
            && e.Target == CombatRole.Opponent);
        Assert.Contains(rig.Session.RecentEvents, e => e.Type == SessionEventType.Settled
            && e.Target == CombatRole.Opponent);
        Assert.DoesNotContain(rig.Session.RecentEvents,
            e => e.Type == SessionEventType.TerminalLimitReached);
    }

    static bool Finite(in AircraftState state) =>
        double.IsFinite(state.Position.X) && double.IsFinite(state.Position.Y)
        && double.IsFinite(state.Position.Z) && double.IsFinite(state.Speed)
        && double.IsFinite(state.Gamma) && double.IsFinite(state.Chi)
        && double.IsFinite(state.Bank) && state.BodyRates.IsFinite;
}
