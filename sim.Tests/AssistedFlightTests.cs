using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim.Tests;

public class AssistedFlightTests {
    const double TestAltitudeM = 6_000.0;

    sealed class CalmWind : IWindField {
        public Vec3D Sample(Vec3D position) => Vec3D.Zero;
    }

    static WeatherProfile CalmWeather() => new(
        StandardAtmosphere1976.Instance, new CalmWind());

    static AircraftState State(Vec3D position, double speedMps, double massKg,
        double chi = 0.0, double bank = 0.0) => new(
            position, speedMps, 0.0, chi, bank, massKg);

    static BeatSetup FightBeat(AircraftState player, AircraftState bandit,
        AircraftParams? playerParameters = null, CombatConfig? combat = null,
        double initialThrottle = 0.0) => new(
            "assisted flight test",
            player,
            bandit,
            new PurePursuitLaw(),
            new() { (0.0, new PilotCommand(1.0, 0.0, 0.6, 0.0)) },
            PlayerParams: playerParameters,
            Combat: combat ?? new CombatConfig(PlayerAmmo: 0, OpponentAmmo: 0),
            Fuel: new FuelConfig(CapacityLb: 1_000.0, InitialFuelLb: 1_000.0,
                BingoThresholdLb: 0.0, ConsumesFuel: false),
            InitialThrottle: initialThrottle);

    static double CornerKias(SimulationSession session) =>
        AirData.PositiveCornerSpeedKiasAtAltitude(
            session.Player.State.Mass,
            session.Beat.PlayerAir,
            session.Player.State.Position.Y,
            session.PlayerAerodynamicConfiguration.LiftCoefficientIncrement,
            session.Player.AtmosphereModel);

    static SimulationSession CornerHoldSession(double initialOffsetKts = -70.0) {
        AircraftParams parameters = FlightModel.F22APublicDataSurrogate;
        double testMassKg = parameters.FuelFreeMassKg + 1_000.0 * 0.45359237;
        double cornerKias = AirData.PositiveCornerSpeedKiasAtAltitude(
            testMassKg, parameters, TestAltitudeM,
            atmosphere: StandardAtmosphere1976.Instance);
        double initialTasMps = AirData.TrueAirspeedForCalibratedAirspeedMps(
            (cornerKias + initialOffsetKts) / AirData.MpsToKnots,
            TestAltitudeM, StandardAtmosphere1976.Instance);
        AircraftState player = State(new Vec3D(0.0, TestAltitudeM, 0.0),
            initialTasMps, testMassKg, bank: 40.0 * Math.PI / 180.0);
        // Far abeam keeps the target outside the 60-degree nose cone and removes gunnery assist,
        // leaving the 1.05-G hold-the-path baseline as the repeatable speed-hold load.
        AircraftState bandit = State(new Vec3D(-100_000.0, TestAltitudeM, 0.0),
            initialTasMps, testMassKg);
        var session = new SimulationSession();
        session.StartBeat(() => FightBeat(player, bandit, parameters), CalmWeather());
        session.SetAssistedFlight(true);
        session.Begin();
        return session;
    }

    [Fact]
    public void NudgeUsesFiveThirtyKnotPositionsAndRestagingResetsTheMode() {
        var session = new SimulationSession(7);

        Assert.False(session.AssistedFlight);
        Assert.Equal(0, session.AssistedSpeedBiasKts);
        session.SetAssistedFlight(true);
        for (int i = 0; i < 5; i++) session.NudgeAssistedSpeed(99);
        Assert.True(session.AssistedFlight);
        Assert.Equal(60, session.AssistedSpeedBiasKts);

        session.NudgeAssistedSpeed(0);
        Assert.Equal(60, session.AssistedSpeedBiasKts);
        for (int i = 0; i < 9; i++) session.NudgeAssistedSpeed(-7);
        Assert.Equal(-60, session.AssistedSpeedBiasKts);

        session.Restart();
        Assert.False(session.AssistedFlight);
        Assert.Equal(0, session.AssistedSpeedBiasKts);
    }

    [Fact]
    public void AssistedCornerHoldConvergesAndStaysWithinTenKnots() {
        SimulationSession session = CornerHoldSession();
        double initialErrorKts = Math.Abs(
            session.Player.IndicatedAirspeedMps * AirData.MpsToKnots - CornerKias(session));
        Assert.True(initialErrorKts > 50.0);

        int settleTicks = (int)(45 * AircraftSim.TickHz);
        for (int i = 0; i < settleTicks; i++) session.StepFixed();

        double maximumHoldErrorKts = 0.0;
        for (int i = 0; i < 5 * AircraftSim.TickHz; i++) {
            session.StepFixed();
            double calibratedKts = session.Player.IndicatedAirspeedMps * AirData.MpsToKnots;
            maximumHoldErrorKts = Math.Max(maximumHoldErrorKts,
                Math.Abs(calibratedKts - CornerKias(session)));
        }

        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
        Assert.True(maximumHoldErrorKts <= 10.0,
            $"hold error={maximumHoldErrorKts:F1}, "
            + $"IAS={session.Player.IndicatedAirspeedMps * AirData.MpsToKnots:F1} "
            + $"corner={CornerKias(session):F1} throttle={session.Controls.Throttle:F2} "
            + $"thrust={session.Player.ThrustFraction:F2} alt={session.Player.State.Position.Y:F0}");
    }

    [Fact]
    public void HeldThrottleStandsCornerHoldDownAndNeutralReleasesItBack() {
        SimulationSession session = CornerHoldSession();
        for (int i = 0; i < 30; i++) session.StepFixed();
        double automaticThrottle = session.Controls.Throttle;

        session.FeedKey(GKey.ThrottleDown, true);
        for (int i = 0; i < 60; i++) session.StepFixed();
        double manualThrottle = session.Controls.Throttle;
        Assert.True(manualThrottle < automaticThrottle - 0.2,
            $"held S did not take the lever: auto={automaticThrottle:F3}, manual={manualThrottle:F3}");

        session.FeedKey(GKey.ThrottleDown, false);
        session.StepFixed();

        Assert.True(session.Controls.Throttle > manualThrottle + 0.2,
            $"neutral did not release to corner hold: manual={manualThrottle:F3}, released={session.Controls.Throttle:F3}");
    }

    [Fact]
    public void AutoFireConsumesAmmoOnlyWhileQualifiedAndPilotTriggerStillWorks() {
        var wideGun = GunProfiles.SixM3FiftyCal with {
            Id = "gun.assisted-flight-test.v1",
            EffectiveHitRadiusM = 45.0
        };
        AircraftState player = State(new Vec3D(0.0, 3_000.0, 0.0),
            180.0, FlightModel.Sabre.MassKg);
        AircraftState bandit = State(new Vec3D(0.0, 3_000.0, 400.0),
            180.0, FlightModel.Sabre.MassKg);
        var combat = new CombatConfig(PlayerAmmo: 100, OpponentAmmo: 0,
            OpponentHitsToDefeat: 1_000, PlayerGun: wideGun);
        var session = new SimulationSession();
        session.StartBeat(() => FightBeat(player, bandit, combat: combat,
            initialThrottle: 0.85), CalmWeather());
        session.SetAssistedFlight(true);
        session.Begin();

        bool sawQualified = false;
        bool sawAutomaticRound = false;
        for (int i = 0; i < 120 && !sawAutomaticRound; i++) {
            bool qualifiedAtTriggerDecision = session.PlayerGun.GunSolution;
            int roundsBefore = session.PlayerGun.RoundsFired;
            session.StepFixed();
            int roundsAfter = session.PlayerGun.RoundsFired;
            sawQualified |= qualifiedAtTriggerDecision;
            if (roundsAfter > roundsBefore) {
                Assert.True(qualifiedAtTriggerDecision,
                    "assisted fire bypassed the qualified gun solution");
                sawAutomaticRound = true;
            }
        }
        Assert.True(sawQualified);
        Assert.True(sawAutomaticRound);
        Assert.True(session.PlayerGun.AmmoRemaining < 100);

        session.FeedKey(GKey.PushDown, true);
        for (int i = 0; i < 240 && session.PlayerGun.GunSolution; i++) {
            bool qualifiedAtTriggerDecision = session.PlayerGun.GunSolution;
            int roundsBefore = session.PlayerGun.RoundsFired;
            session.StepFixed();
            if (session.PlayerGun.RoundsFired > roundsBefore)
                Assert.True(qualifiedAtTriggerDecision);
        }
        Assert.False(session.PlayerGun.GunSolution);
        int roundsAtSolutionLoss = session.PlayerGun.RoundsFired;
        for (int i = 0; i < 60; i++) session.StepFixed();
        Assert.Equal(roundsAtSolutionLoss, session.PlayerGun.RoundsFired);

        session.FeedKey(GKey.Trigger, true);
        session.StepFixed();
        Assert.True(session.PlayerGun.RoundsFired > roundsAtSolutionLoss,
            "the player's normal trigger must remain available outside the assisted solution");
    }

    [Fact]
    public void NeutralAutoPullIsAboutRightButPilotPitchOwnsTheAxis() {
        static SimulationSession Create(bool pull, bool push) {
            AircraftParams parameters = FlightModel.F22APublicDataSurrogate;
            double massKg = parameters.FuelFreeMassKg + 1_000.0 * 0.45359237;
            AircraftState player = State(new Vec3D(0.0, 3_000.0, 0.0),
                210.0, massKg);
            AircraftState bandit = State(new Vec3D(0.0, 3_000.0, 800.0),
                210.0, massKg);
            var session = new SimulationSession();
            session.StartBeat(() => FightBeat(player, bandit, parameters), CalmWeather());
            session.SetAssistedFlight(true);
            session.Begin();
            if (pull) session.FeedKey(GKey.PullUp, true);
            if (push) session.FeedKey(GKey.PushDown, true);
            session.StepFixed();
            return session;
        }

        SimulationSession neutral = Create(pull: false, push: false);
        SimulationSession pulling = Create(pull: true, push: false);
        SimulationSession pushing = Create(pull: false, push: true);
        double maxPerform = Protection.MaxPerformG(neutral.Player.State,
            neutral.Beat.PlayerAir, neutral.Player.AirspeedMps,
            neutral.Player.AtmosphereModel);

        Assert.True(neutral.Controls.Command.GDemand > 1.0);
        Assert.True(neutral.Controls.Command.GDemand < Math.Min(4.0, maxPerform));
        Assert.True(pulling.Controls.Command.GDemand > neutral.Controls.Command.GDemand,
            "held pull must replace, not add to, the assisted baseline");
        Assert.True(pushing.Controls.Command.GDemand < neutral.Controls.Command.GDemand,
            "held push must replace, not fight, the assisted baseline");
    }

    // Pilot-tuned contract (2026-07-23, "portrait is pulling way too hard by default"): the
    // auto-pull is about-right, growing with off-axis angle. On the nose it relaxes to a light
    // sustaining pull and lets the gunnery correction do the fine tracking; the full protected
    // repositioning pull belongs only to a target near the 60-degree cone edge; outside the cone
    // the assist holds the path instead of climbing away.
    [Fact]
    public void AutoPullGrowsWithOffAxisAngleAndHoldsPathOutsideTheCone() {
        AircraftParams parameters = FlightModel.F22APublicDataSurrogate;
        AircraftState state = State(new Vec3D(0.0, 3_000.0, 0.0),
            210.0, parameters.MassKg);
        var detents = new DetentLayer {
            AssistedFlight = true,
            AssistedTargetWithinNoseCone = true,
            AssistedTargetNoseAngleRad = 0.0,
            AssistedCalibratedAirspeedMps = 210.0,
            AssistedTargetCalibratedAirspeedMps = 210.0,
            AirspeedMps = 210.0,
            AtmosphereModel = StandardAtmosphere1976.Instance
        };
        var keys = new KeyGrammar();
        var advice = new DoctrineAdvice(1.0, 0.0, "neutral");
        const double dt = SimulationSession.FixedDeltaSeconds;

        for (int i = 0; i < 240; i++)
            detents.Tick(keys, i * dt * 1000.0, state, parameters, advice, dt);
        Assert.Equal(1.4, detents.Command.GDemand, 6);

        detents.AssistedTargetNoseAngleRad = System.Math.PI / 3.0;
        for (int i = 240; i < 480; i++)
            detents.Tick(keys, i * dt * 1000.0, state, parameters, advice, dt);
        double maxPerform = Protection.MaxPerformG(state, parameters, 210.0,
            StandardAtmosphere1976.Instance);
        Assert.Equal(Math.Min(4.0, maxPerform), detents.Command.GDemand, 6);

        detents.AssistedTargetWithinNoseCone = false;
        detents.AssistedTargetNoseAngleRad = 2.0;
        for (int i = 480; i < 720; i++)
            detents.Tick(keys, i * dt * 1000.0, state, parameters, advice, dt);
        Assert.Equal(1.0, detents.Command.GDemand, 6);
    }
}
