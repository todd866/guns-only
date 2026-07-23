using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class ModernVisualMergeTests {
    const double AltitudeM = 5486.4;
    const double Dt = 1.0 / AircraftSim.TickHz;
    const double Deg = 180.0 / Math.PI;

    sealed class ModernControlRig {
        public readonly AircraftSim Sim;
        public readonly DetentLayer Detent = new(); // production default: DoctrineDeep
        public readonly KeyGrammar Keys = new();
        double _timeMs;

        public ModernControlRig(double speedMps) {
            AircraftParams parameters = FlightModel.F22APublicDataSurrogate;
            Sim = new AircraftSim(new AircraftState(
                new Vec3D(0.0, AltitudeM, 0.0), speedMps,
                0.0, 0.0, 0.0, parameters.MassKg), parameters);
        }

        public void Set(GKey key, bool down) => Keys.Feed(key, down, _timeMs);

        public void Step() {
            Detent.AirspeedMps = Sim.AirspeedMps;
            Detent.MeasuredAngleOfAttackRad = Sim.AngleOfAttackRad;
            Detent.Tick(Keys, _timeMs, Sim.State,
                FlightModel.F22APublicDataSurrogate,
                // Deliberately well below max performance: Mission 7's normal pull must not be
                // weakened by the teaching detent even when doctrine recommends conserving G.
                new DoctrineAdvice(3.2, 0.0, "modern control-law fixture"), Dt);
            Sim.Step(Detent.Command, Dt);
            _timeMs += Dt * 1000.0;
        }
    }

    static AircraftState State(double z, double speed, double chi, double mass,
        double x = 0.0) => new(
        new Vec3D(x, AltitudeM, z), speed, 0.0, chi, 0.0, mass);

    [Fact]
    public void MissionSevenOwnsExplicitSurrogateAircraftSystemsAndGunContracts() {
        BeatSetup beat = Beats.ModernVisualMerge();
        var session = new SimulationSession(7);

        Assert.Equal(
            "mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1",
            beat.MissionIdentity.Id);
        Assert.True(beat.MissionIdentity.PublicDataSurrogate);
        Assert.Equal("GUNS_ONLY_FIRST_PASS_SAFE", beat.MissionIdentity.RulesOfEngagement);
        Assert.Equal("aircraft.f22a.public-data-surrogate.v1", beat.PlayerAircraft.Id);
        Assert.Equal("aircraft.su27s.public-data-surrogate.v1", beat.BanditAircraft.Id);
        Assert.False(beat.PlayerAircraft.SystemsSimulated);
        Assert.False(beat.BanditAircraft.SystemsSimulated);
        Assert.Equal("gun.m61a2.public-data-surrogate.v1", session.PlayerGun.Profile.Id);
        Assert.Equal("gun.gsh301.public-data-surrogate.v1", session.OpponentGun.Profile.Id);
        Assert.Equal(12000.0, session.PlayerFuel.FuelLb, 8);
        Assert.Equal(6000.0, session.PlayerFuel.JokerThresholdLb);
        Assert.Equal(4000.0, session.PlayerFuel.BingoThresholdLb);
        Assert.Equal(2100.0, session.PlayerFuel.MinimumFuelThresholdLb);
        Assert.Equal(1200.0, session.PlayerFuel.EmergencyFuelThresholdLb);
        Assert.NotNull(session.VisualMergeEvaluation);
        Assert.True(session.WeaponsInhibited);
        Assert.Equal("GUNS SAFE · FIRST PASS",
            session.VisualMergeEvaluation!.WeaponsStateCue);
    }

    [Fact]
    public void HeldTriggerCannotPreFireTheFirstPassOrAutoFireWhenTheSafetyReleases() {
        var session = new SimulationSession(7);
        session.Begin();
        session.FeedKey(GKey.Trigger, true);

        for (int tick = 0; tick < 2 * AircraftSim.TickHz; tick++)
            session.StepFixed();

        Assert.True(session.WeaponsInhibited);
        Assert.True(session.VisualMergeEvaluation!.PlayerTriggerInterlocked);
        Assert.Equal(1, session.VisualMergeEvaluation.HeadOnTriggerViolations);
        Assert.Equal(0, session.PlayerGun.RoundsFired);
    }

    [Fact]
    public void HeldFirstPassTriggerMustBeReleasedThenAFreshPressFires() {
        var session = new SimulationSession(7);
        session.Begin();
        session.FeedKey(GKey.Trigger, true);

        for (int tick = 0; tick < 20 * AircraftSim.TickHz
            && session.WeaponsInhibited; tick++)
            session.StepFixed();

        Assert.False(session.WeaponsInhibited);
        Assert.True(session.VisualMergeEvaluation!.PlayerTriggerInterlocked);
        Assert.Equal("RELEASE TRIGGER TO ARM",
            session.VisualMergeEvaluation.WeaponsStateCue);
        Assert.Equal(0, session.PlayerGun.RoundsFired);

        session.FeedKey(GKey.Trigger, false);
        Assert.Equal("GUNS HOT", session.VisualMergeEvaluation.WeaponsStateCue);
        session.StepFixed();
        Assert.True(session.PlayerGun.RoundsFired == 0,
            "release must arm without manufacturing a shot");

        session.FeedKey(GKey.Trigger, true);
        session.StepFixed();
        Assert.True(session.PlayerGun.RoundsFired > 0);
    }

    [Fact]
    public void PlayerCanHoldThrottleUpThroughMilitaryPowerIntoAfterburner() {
        var session = new SimulationSession(7);
        session.Begin();
        Assert.Equal(1.0, session.Controls.Throttle, 10);

        session.FeedKey(GKey.ThrottleUp, true);
        for (int tick = 0; tick < 2 * AircraftSim.TickHz; tick++) session.StepFixed();

        Assert.Equal(FlightModel.F22APublicDataSurrogate.MaxThrustFraction,
            session.Controls.Throttle, 10);
        Assert.True(session.Player.ThrustFraction > 1.20);
        Assert.True(session.Player.LastEngineOperatingPoint.NetThrustN
            > FlightModel.F22APublicDataSurrogate.ThrustMaxN);
    }

    [Fact]
    public void OrdinaryMissionSevenPullPromptlyReachesTheProtectedNineGEnvelope() {
        var rig = new ModernControlRig(speedMps: 300.0);
        rig.Set(GKey.PullUp, true);
        double peakNz = 0.0;
        int firstEightGTick = -1;

        for (int tick = 0; tick < 2 * AircraftSim.TickHz; tick++) {
            rig.Step();
            peakNz = Math.Max(peakNz, rig.Sim.LastNz);
            if (firstEightGTick < 0 && rig.Sim.LastNz >= 8.0)
                firstEightGTick = tick + 1;
            Assert.False(double.IsFinite(rig.Detent.Command.CommandedAlphaRad),
                "ordinary pull must retain AoA protection");
        }

        Assert.True(FlightModel.F22APublicDataSurrogate.NormalPullUsesMaxPerformance);
        Assert.Equal(DemandTier.MaxPerform, rig.Detent.Tier);
        Assert.False(rig.Detent.Command.EnvelopeOverride);
        Assert.Equal(9.0, rig.Detent.Command.GDemand, 2);
        Assert.InRange(peakNz, 8.5, 9.7);
        Assert.True(firstEightGTick > 0 && firstEightGTick * Dt <= 0.8,
            $"ordinary pull took {(firstEightGTick < 0 ? double.PositiveInfinity : firstEightGTick * Dt):F2} s to reach 8 G");

        var prompt = new PromptTracker().Cue(
            new DoctrineAdvice(3.2, 0.0, "conserve energy"),
            rig.Detent.Command, rig.Detent.Tier);
        Assert.Equal(PromptCue.None, prompt);
    }

    [Fact]
    public void HighDynamicPressureOverrideReleasesGNotTheAlphaLimiter() {
        var rig = new ModernControlRig(speedMps: 300.0);
        rig.Set(GKey.PullUp, true);
        rig.Set(GKey.Override, true);
        double peakNz = 0.0, peakAlphaDeg = 0.0;

        for (int tick = 0; tick < AircraftSim.TickHz; tick++) {
            rig.Step();
            peakNz = Math.Max(peakNz, rig.Sim.LastNz);
            peakAlphaDeg = Math.Max(peakAlphaDeg, rig.Sim.AngleOfAttackRad * Deg);
            Assert.False(double.IsFinite(rig.Detent.Command.CommandedAlphaRad),
                "above corner, override should release G while retaining attached-flow alpha protection");
        }

        Assert.Equal(12.0, rig.Detent.Command.GDemand, 2);
        Assert.Equal(DemandTier.OverDemand, rig.Detent.Tier);
        Assert.True(rig.Detent.Command.EnvelopeOverride);
        Assert.True(peakNz > 9.25,
            $"override never crossed the normal +9 G boundary: peak {peakNz:F2} G");
        Assert.True(peakAlphaDeg < FlightModel.F22APublicDataSurrogate.CLMax
            / FlightModel.F22APublicDataSurrogate.CLAlpha * Deg + 2.0,
            $"high-q override unnecessarily departed attached flow at {peakAlphaDeg:F1} deg alpha");
    }

    [Fact]
    public void LowDynamicPressureOverrideNaturallyProducesCostlyHighAlpha() {
        var rig = new ModernControlRig(speedMps: 105.0);
        rig.Set(GKey.PullUp, true);
        rig.Set(GKey.Override, true);
        double initialSpecificEnergy = rig.Sim.State.Position.Y
            + rig.Sim.AirspeedMps * rig.Sim.AirspeedMps / (2.0 * FlightModel.G0);
        double peakAlphaDeg = 0.0, peakCommandDeg = 0.0;

        for (int tick = 0; tick < 3 * AircraftSim.TickHz; tick++) {
            rig.Step();
            peakAlphaDeg = Math.Max(peakAlphaDeg, rig.Sim.AngleOfAttackRad * Deg);
            if (double.IsFinite(rig.Detent.Command.CommandedAlphaRad))
                peakCommandDeg = Math.Max(peakCommandDeg,
                    rig.Detent.Command.CommandedAlphaRad * Deg);
        }

        double finalSpecificEnergy = rig.Sim.State.Position.Y
            + rig.Sim.AirspeedMps * rig.Sim.AirspeedMps / (2.0 * FlightModel.G0);
        Assert.True(peakCommandDeg > 55.0,
            $"low-q override only requested {peakCommandDeg:F1} deg alpha");
        Assert.True(peakAlphaDeg > 45.0,
            $"rigid-body/aero response only reached {peakAlphaDeg:F1} deg alpha");
        Assert.True(finalSpecificEnergy < initialSpecificEnergy - 40.0,
            $"high-alpha manoeuvre did not collect an energy bill: {initialSpecificEnergy:F0} -> {finalSpecificEnergy:F0} m");
        Assert.True(rig.Sim.State.BodyAttitude.IsFinite && rig.Sim.State.BodyRates.IsFinite);
    }

    [Fact]
    public void ReleasingOverrideRecapturesSafeAlphaAndRequiresANeutralPullBoundary() {
        var rig = new ModernControlRig(speedMps: 105.0);
        rig.Set(GKey.PullUp, true);
        rig.Set(GKey.Override, true);
        for (int tick = 0; tick < 3 * AircraftSim.TickHz; tick++) rig.Step();

        Assert.True(rig.Sim.AngleOfAttackRad * Deg > 45.0,
            "fixture must enter the high-alpha override region");

        rig.Set(GKey.Override, false); // Up deliberately remains held.
        double peakRecoveryVectorDeg = 0.0;
        for (int tick = 0; tick < 3 * AircraftSim.TickHz; tick++) {
            rig.Step();
            peakRecoveryVectorDeg = Math.Max(peakRecoveryVectorDeg,
                Math.Abs(rig.Sim.LastPitchThrustVectorAngleRad) * Deg);
        }

        Assert.True(rig.Detent.HighAlphaRecoveryActive,
            "held pull must not re-arm while the release recovery owns the axis");
        Assert.Equal(DemandTier.Baseline, rig.Detent.Tier);
        Assert.Equal(1.0, rig.Detent.Command.GDemand, 2);
        Assert.True(rig.Sim.AngleOfAttackRad * Deg < 13.0,
            $"override release remained pinned near the lift break at {rig.Sim.AngleOfAttackRad * Deg:F1} deg");
        Assert.InRange(peakRecoveryVectorDeg, 15.0,
            FlightModel.F22APublicDataSurrogate.PitchThrustVectorMaxRad * Deg + 1e-6);
        Assert.True(Math.Abs(rig.Sim.LastPitchThrustVectorMomentNm) <= 1e-6,
            "the vector command should unwind once safe alpha is recaptured");

        rig.Set(GKey.PullUp, false);
        for (int tick = 0; tick < AircraftSim.TickHz
            && rig.Detent.HighAlphaRecoveryActive; tick++) rig.Step();
        Assert.False(rig.Detent.HighAlphaRecoveryActive);

        rig.Set(GKey.PullUp, true);
        for (int tick = 0; tick < AircraftSim.TickHz; tick++) rig.Step();
        Assert.Equal(DemandTier.MaxPerform, rig.Detent.Tier);
        Assert.True(rig.Detent.Command.GDemand > 1.2,
            "a fresh pull must regain the ordinary protected envelope");
    }

    [Fact]
    public void F22PitchVectoringIsAnExplicitThrustDependentAirframeCapability() {
        AircraftParams parameters = FlightModel.F22APublicDataSurrogate;
        Assert.Equal(20.0, parameters.PitchThrustVectorMaxRad * Deg, 8);
        Assert.True(parameters.PitchThrustVectorMomentArmM > 0.0);

        var powered = new ModernControlRig(speedMps: 105.0);
        powered.Set(GKey.PullUp, true);
        powered.Set(GKey.Override, true);
        double peakAngleDeg = 0.0, peakMomentNm = 0.0;
        for (int tick = 0; tick < 2 * AircraftSim.TickHz; tick++) {
            powered.Step();
            peakAngleDeg = Math.Max(peakAngleDeg,
                Math.Abs(powered.Sim.LastPitchThrustVectorAngleRad) * Deg);
            peakMomentNm = Math.Max(peakMomentNm,
                Math.Abs(powered.Sim.LastPitchThrustVectorMomentNm));
        }

        Assert.InRange(peakAngleDeg, 10.0, 20.0 + 1e-6);
        Assert.True(peakMomentNm > 100_000.0,
            $"configured nozzle generated only {peakMomentNm:F0} N m");

        var unpowered = new AircraftSim(new AircraftState(
            new Vec3D(0.0, AltitudeM, 0.0), 105.0,
            0.0, 0.0, 0.0, parameters.MassKg), parameters);
        for (int tick = 0; tick < AircraftSim.TickHz; tick++)
            unpowered.Step(new PilotCommand(1.0, 0.0, 0.0, 0.0,
                CommandedAlphaRad: 1.10), Dt);
        Assert.Equal(0.0, unpowered.LastPitchThrustVectorMomentNm, 12);

        var fixedNozzle = parameters with {
            PitchThrustVectorMaxRad = 0.0,
            PitchThrustVectorMomentArmM = 0.0
        };
        var fixedSim = new AircraftSim(new AircraftState(
            new Vec3D(0.0, AltitudeM, 0.0), 105.0,
            0.0, 0.0, 0.0, fixedNozzle.MassKg), fixedNozzle);
        for (int tick = 0; tick < AircraftSim.TickHz; tick++)
            fixedSim.Step(new PilotCommand(1.0, 0.0, 1.0, 0.0,
                CommandedAlphaRad: 1.10), Dt);
        Assert.Equal(0.0, fixedSim.LastPitchThrustVectorAngleRad, 12);
        Assert.Equal(0.0, fixedSim.LastPitchThrustVectorMomentNm, 12);
    }

    [Fact]
    public void UnsimulatedModernGearAndFlapsRejectInputAndCannotAddHiddenDrag() {
        var reference = new SimulationSession(7);
        var challenged = new SimulationSession(7);
        reference.Begin();
        challenged.Begin();

        challenged.FeedKey(GKey.GearToggle, true);
        challenged.FeedKey(GKey.GearToggle, false);
        challenged.FeedKey(GKey.FlapDown, true);
        for (int tick = 0; tick < 2 * AircraftSim.TickHz; tick++) {
            reference.StepFixed();
            challenged.StepFixed();
        }
        challenged.FeedKey(GKey.FlapDown, false);

        Assert.False(challenged.PlayerSystemsSimulated);
        Assert.Equal(LandingGearHandle.Up, challenged.PlayerSystems.GearHandle);
        Assert.Equal(WingFlapLever.Hold, challenged.PlayerSystems.FlapLever);
        Assert.Equal(0.0, challenged.PlayerSystems.LeftFlapDegrees, 12);
        Assert.Equal(0.0, challenged.PlayerSystems.RightFlapDegrees, 12);
        Assert.Equal(AirframeAerodynamicState.Clean,
            challenged.PlayerAerodynamicConfiguration);
        Assert.Equal(AirframeAerodynamicState.Clean,
            challenged.Player.AerodynamicConfiguration);
        Assert.Equal(KeyPhase.Idle,
            challenged.Keys.PhaseAt(GKey.GearToggle, challenged.TimeMilliseconds));
        Assert.Equal(KeyPhase.Idle,
            challenged.Keys.PhaseAt(GKey.FlapDown, challenged.TimeMilliseconds));

        Assert.Equal(reference.Player.State.Position.X,
            challenged.Player.State.Position.X, 12);
        Assert.Equal(reference.Player.State.Position.Y,
            challenged.Player.State.Position.Y, 12);
        Assert.Equal(reference.Player.State.Position.Z,
            challenged.Player.State.Position.Z, 12);
        Assert.Equal(reference.Player.State.Speed, challenged.Player.State.Speed, 12);
    }

    [Fact]
    public void ProductionMissionGeometryNaturallyCompletesTheNeutralFirstPass() {
        var session = new SimulationSession(7);
        session.Begin();

        for (int tick = 0; tick < 20 * AircraftSim.TickHz
            && session.WeaponsInhibited; tick++)
            session.StepFixed();

        Assert.False(session.WeaponsInhibited);
        Assert.True(session.VisualMergeEvaluation!.FirstPassComplete);
        Assert.InRange(session.VisualMergeEvaluation.MinimumMergeRangeM, 100.0, 900.0);
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
        Assert.Equal(AircraftTerminalState.Flying, session.OpponentTerminalState);
    }

    [Fact]
    public void NeutralMergeControllerHandoffPreservesOpponentEngineSpool() {
        var session = new SimulationSession(7);
        session.Begin();
        var bandit = Assert.IsType<NeutralMergeBandit>(session.Bandit);
        double powerImmediatelyBeforeHandoff = bandit.ThrustFraction;

        for (int tick = 0; tick < 20 * AircraftSim.TickHz
            && !bandit.FirstPassComplete; tick++) {
            powerImmediatelyBeforeHandoff = bandit.ThrustFraction;
            session.StepFixed();
        }

        Assert.True(bandit.FirstPassComplete);
        Assert.True(powerImmediatelyBeforeHandoff > 0.95);
        Assert.Equal(powerImmediatelyBeforeHandoff, bandit.ThrustFraction, 12);

        double handoffPower = bandit.ThrustFraction;
        session.StepFixed();
        Assert.InRange(Math.Abs(bandit.ThrustFraction - handoffPower), 0.0, 0.01);
    }

    [Fact]
    public void CompulsoryProductionMergeClosureDoesNotPenalizePursuitClosureScore() {
        var session = new SimulationSession(7);
        session.Begin();

        for (int tick = 0; tick < 20 * AircraftSim.TickHz
            && session.WeaponsInhibited; tick++)
            session.StepFixed();
        for (int tick = 0; tick < AircraftSim.TickHz; tick++) session.StepFixed();

        VisualMergeEvaluation evaluation = session.VisualMergeEvaluation!;
        Assert.True(evaluation.FirstPassComplete);
        Assert.True(evaluation.MinimumMergeRangeM < 900.0);
        Assert.Equal(0.0, evaluation.PeakClosureKts, 12);
        Assert.Equal(0, evaluation.Overshoots);
        Assert.Equal(20.0, evaluation.ClosureScore, 12);
    }

    [Fact]
    public void FirstPassThenRearQuarterDwellProducesObservableDecisionEvidence() {
        var evaluation = new VisualMergeEvaluation(new VisualMergeEvaluationConfig());
        var atmosphere = StandardAtmosphere1976.Instance;
        double playerMass = FlightModel.F22APublicDataSurrogate.MassKg;
        double opponentMass = FlightModel.Su27SPublicDataSurrogate.MassKg;
        AircraftState player = State(-500.0, 300.0, 0.0, playerMass);
        AircraftState opponent = State(500.0, 285.0, Math.PI, opponentMass);

        evaluation.Step(player, opponent, atmosphere, 0.0);
        evaluation.ObserveTriggerPressed(player, opponent);
        evaluation.Step(State(-50.0, 300.0, 0.0, playerMass),
            State(50.0, 285.0, Math.PI, opponentMass), atmosphere, 0.1);
        evaluation.Step(State(100.0, 300.0, 0.0, playerMass),
            State(-100.0, 285.0, Math.PI, opponentMass), atmosphere, 0.1);
        evaluation.Step(State(200.0, 300.0, 0.0, playerMass),
            State(-200.0, 285.0, Math.PI, opponentMass), atmosphere, 0.1);

        Assert.True(evaluation.FirstPassComplete);
        Assert.True(evaluation.PlayerTriggerInterlocked);
        Assert.Equal("RELEASE TRIGGER TO ARM", evaluation.WeaponsStateCue);
        evaluation.ObserveTriggerReleased();
        Assert.True(evaluation.PlayerWeaponsAuthorized);
        Assert.Equal("GUNS HOT", evaluation.WeaponsStateCue);

        // Both aircraft now point north; ownship is 500 m behind the opponent.
        player = State(0.0, 280.0, 0.0, playerMass);
        opponent = State(500.0, 270.0, 0.0, opponentMass);
        evaluation.Step(player, opponent, atmosphere, 1.0);
        evaluation.ObserveProjectileState(roundsFired: 12, hits: 1);

        Assert.True(evaluation.CurrentRearQuarterValid);
        Assert.Equal(1.0, evaluation.RearQuarterDwellSeconds, 8);
        Assert.True(evaluation.PeakClosureKts > 0.0,
            "closure becomes scoreable only in observed offensive pursuit geometry");
        Assert.Equal(12, evaluation.ProjectileRoundsFired);
        Assert.Equal(1, evaluation.ProjectileHits);
        Assert.InRange(evaluation.Score, 1, 100);
    }

    [Fact]
    public void WeaponsHotTransitionCueSelfClearsAfterThePilotHasSeenIt() {
        var evaluation = new VisualMergeEvaluation(new VisualMergeEvaluationConfig());
        var atmosphere = StandardAtmosphere1976.Instance;
        double playerMass = FlightModel.F22APublicDataSurrogate.MassKg;
        double opponentMass = FlightModel.Su27SPublicDataSurrogate.MassKg;

        evaluation.Step(State(-500.0, 300.0, 0.0, playerMass),
            State(500.0, 285.0, Math.PI, opponentMass), atmosphere, 0.0);
        evaluation.Step(State(-50.0, 300.0, 0.0, playerMass),
            State(50.0, 285.0, Math.PI, opponentMass), atmosphere, 0.1);
        evaluation.Step(State(100.0, 300.0, 0.0, playerMass),
            State(-100.0, 285.0, Math.PI, opponentMass), atmosphere, 0.1);
        evaluation.Step(State(200.0, 300.0, 0.0, playerMass),
            State(-200.0, 285.0, Math.PI, opponentMass), atmosphere, 0.1);

        Assert.True(evaluation.WeaponsHotCueActive);
        Assert.Equal("GUNS HOT", evaluation.WeaponsStateCue);
        evaluation.Step(State(0.0, 300.0, 0.0, playerMass),
            State(2000.0, 285.0, 0.0, opponentMass), atmosphere, 2.0);
        Assert.False(evaluation.WeaponsHotCueActive);
        Assert.Equal("", evaluation.WeaponsStateCue);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void PublicSurrogateTurbofanHasBoundedEighteenThousandFootLapseAndPositivePs(
        bool f22) {
        AircraftParams parameters = f22
            ? FlightModel.F22APublicDataSurrogate
            : FlightModel.Su27SPublicDataSurrogate;
        double mass = f22
            ? 19535.0 + 12000.0 * 0.45359237
            : parameters.MassKg;
        var initial = State(-1000.0, 300.0, 0.0, mass);
        var sim = new AircraftSim(initial, parameters);

        sim.AdvanceEngineOnly(parameters.MaxThrustFraction, Dt);
        double seaLevelRatedThrust = parameters.ThrustMaxN * parameters.MaxThrustFraction;
        double lapse = sim.LastEngineOperatingPoint.NetThrustN / seaLevelRatedThrust;
        Assert.InRange(lapse, 0.75, 0.90);

        double initialSpecificEnergyM = initial.Position.Y
            + initial.Speed * initial.Speed / (2.0 * FlightModel.G0);
        var command = new PilotCommand(1.0, 0.0,
            parameters.MaxThrustFraction, 0.0);
        for (int tick = 0; tick < 5 * AircraftSim.TickHz; tick++)
            sim.Step(command, Dt);
        double finalSpecificEnergyM = sim.State.Position.Y
            + sim.State.Speed * sim.State.Speed / (2.0 * FlightModel.G0);

        Assert.True(finalSpecificEnergyM > initialSpecificEnergyM + 250.0,
            $"{parameters.LateralDerivativeProfileId} failed 18k-ft Ps gate: "
            + $"{initialSpecificEnergyM:F0} -> {finalSpecificEnergyM:F0} m");
    }

    [Fact]
    public void ModernGunProfileDrivesItsOwnDeterministicCadence() {
        var shooter = State(0.0, 250.0, 0.0,
            FlightModel.F22APublicDataSurrogate.MassKg, x: 100.0);
        var target = State(1000.0, 250.0, 0.0,
            FlightModel.Su27SPublicDataSurrogate.MassKg);
        var gun = new GunKill(ammo: 20, hitsToKill: 100,
            profile: GunProfiles.M61A2PublicDataSurrogate);

        gun.Step(true, shooter, target, 0.05);

        Assert.Equal(GunProfiles.M61A2PublicDataSurrogate, gun.Profile);
        Assert.InRange(gun.RoundsFired, 5, 6);
    }
}
