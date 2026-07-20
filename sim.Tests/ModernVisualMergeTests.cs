using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class ModernVisualMergeTests {
    const double AltitudeM = 5486.4;
    const double Dt = 1.0 / AircraftSim.TickHz;

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
