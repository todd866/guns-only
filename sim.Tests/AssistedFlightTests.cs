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
    public void PortraitAnalogThrottleOwnsTheLeverWhileAssistedFlightIsActive() {
        SimulationSession session = CornerHoldSession();
        for (int i = 0; i < 30; i++) session.StepFixed();
        double automaticThrottle = session.Controls.Throttle;
        Assert.True(session.AssistedAutoThrottleActive);
        double requestedLever01 = 0.20;
        double expectedThrottle = requestedLever01
            * session.Beat.PlayerAir.MaxThrustFraction;

        session.SetAnalogThrottleControl(requestedLever01);
        for (int i = 0; i < 30; i++) session.StepFixed();

        Assert.True(session.AssistedFlight);
        Assert.False(session.AssistedAutoThrottleActive,
            "the HUD's AUTO must clear once the pilot owns the lever");
        Assert.True(automaticThrottle > expectedThrottle + 0.4,
            "the fixture must distinguish corner auto-throttle from the requested phone lever");
        Assert.Equal(expectedThrottle, session.Controls.Throttle, 10);

        session.SetAnalogThrottleControl(0.80);
        session.StepFixed();
        Assert.Equal(0.80 * session.Beat.PlayerAir.MaxThrustFraction,
            session.Controls.Throttle, 10);
    }

    [Fact]
    public void AutoFireUsesInfiniteGunOnlyWhileQualifiedAndPilotTriggerStillWorks() {
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
        Assert.True(session.PlayerGun.HasInfiniteAmmo);
        Assert.Equal(100, session.PlayerGun.AmmoRemaining);

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
    public void NeutralAssistedDemandIgnoresTheTargetButPilotPitchOwnsTheAxis() {
        static SimulationSession Create(bool pull, bool push, double banditZ) {
            AircraftParams parameters = FlightModel.F22APublicDataSurrogate;
            double massKg = parameters.FuelFreeMassKg + 1_000.0 * 0.45359237;
            AircraftState player = State(new Vec3D(0.0, 3_000.0, 0.0),
                210.0, massKg);
            AircraftState bandit = State(new Vec3D(0.0, 3_000.0, banditZ),
                210.0, massKg);
            var session = new SimulationSession();
            session.StartBeat(() => FightBeat(player, bandit, parameters), CalmWeather());
            session.SetAssistedFlight(true);
            session.Begin();
            if (pull) session.FeedKey(GKey.PullUp, true);
            if (push) session.FeedKey(GKey.PushDown, true);
            for (int i = 0; i < 60; i++) session.StepFixed();
            return session;
        }

        SimulationSession neutralAhead = Create(pull: false, push: false, banditZ: 800.0);
        SimulationSession neutralBehind = Create(pull: false, push: false, banditZ: -800.0);
        SimulationSession neutralFar = Create(pull: false, push: false, banditZ: 19_000.0);
        SimulationSession pulling = Create(pull: true, push: false, banditZ: 800.0);
        SimulationSession pushing = Create(pull: false, push: true, banditZ: 800.0);

        // Wings level, hands off: one G whatever is in the sky. The old law pulled 1.4 G toward a
        // target on the nose and carried a portrait pilot to 65 degrees nose-up.
        Assert.Equal(1.0, neutralAhead.Controls.Command.GDemand, 3);
        Assert.Equal(neutralAhead.Controls.Command.GDemand,
            neutralBehind.Controls.Command.GDemand, 6);
        Assert.Equal(neutralAhead.Controls.Command.GDemand,
            neutralFar.Controls.Command.GDemand, 6);
        Assert.True(pulling.Controls.Command.GDemand > neutralAhead.Controls.Command.GDemand + 1.0,
            "held pull must replace, not add to, the assisted baseline");
        Assert.True(pushing.Controls.Command.GDemand < neutralAhead.Controls.Command.GDemand,
            "held push must replace, not fight, the assisted baseline");
    }

    /// The assisted neutral is a bank-compensated path hold and nothing else: no target term, so
    /// there is no cone edge for the command target to step across.
    [Fact]
    public void AssistedNeutralHoldsTheBankedPathWithoutATargetTerm() {
        AircraftParams parameters = FlightModel.F22APublicDataSurrogate;
        var detents = new DetentLayer {
            AssistedFlight = true,
            AssistedCalibratedAirspeedMps = 210.0,
            AssistedTargetCalibratedAirspeedMps = 210.0,
            AirspeedMps = 210.0,
            AtmosphereModel = StandardAtmosphere1976.Instance
        };
        var keys = new KeyGrammar();
        var advice = new DoctrineAdvice(1.0, 0.0, "neutral");
        const double dt = SimulationSession.FixedDeltaSeconds;
        AircraftState level = State(new Vec3D(0.0, 3_000.0, 0.0), 210.0, parameters.MassKg);
        for (int i = 0; i < 240; i++)
            detents.Tick(keys, i * dt * 1000.0, level, parameters, advice, dt);
        Assert.Equal(1.0, detents.Command.GDemand, 6);

        AircraftState banked = level with { Bank = 40.0 * Math.PI / 180.0 };
        for (int i = 240; i < 480; i++)
            detents.Tick(keys, i * dt * 1000.0, banked, parameters, advice, dt);
        Assert.Equal(1.0 / Math.Cos(40.0 * Math.PI / 180.0), detents.Command.GDemand, 6);

        AircraftState steep = level with { Bank = 75.0 * Math.PI / 180.0 };
        for (int i = 480; i < 720; i++)
            detents.Tick(keys, i * dt * 1000.0, steep, parameters, advice, dt);
        Assert.Equal(1.35, detents.Command.GDemand, 6);
    }

    /// Sweep a live target from the nose, through the old 60-degree cone edge, to the beam. The
    /// hands-off requested G must not move at all; the audit measured a 3.6 -> 1.7 G drop in 0.1 s
    /// at that edge with no thumb change.
    [Fact]
    public void SweepingTheTargetAcrossTheOldConeEdgeDoesNotStepNeutralDemand() {
        AircraftParams parameters = FlightModel.F22APublicDataSurrogate;
        double massKg = parameters.FuelFreeMassKg + 1_000.0 * 0.45359237;
        var demands = new List<double>();
        foreach (double offDeg in new[] { 0.0, 30.0, 58.0, 62.0, 90.0 }) {
            double off = offDeg * Math.PI / 180.0;
            AircraftState player = State(new Vec3D(0.0, 3_000.0, 0.0), 210.0, massKg);
            AircraftState bandit = State(
                new Vec3D(2_000.0 * Math.Sin(off), 3_000.0, 2_000.0 * Math.Cos(off)),
                210.0, massKg);
            var session = new SimulationSession();
            session.StartBeat(() => FightBeat(player, bandit, parameters), CalmWeather());
            session.SetAssistedFlight(true);
            session.Begin();
            for (int i = 0; i < 30; i++) session.StepFixed();
            demands.Add(session.Controls.Command.GDemand);
        }
        Assert.True(demands.Max() - demands.Min() < 1e-6,
            "neutral demand moved with target bearing: " + string.Join(", ", demands));
    }

    /// One contract per device, so portrait and landscape are the same law; and the hands-off
    /// assisted law agrees with the unassisted F-22 neutral to well inside 0.05 G at the real
    /// first-merge start, with the rung-0 lead on the nose.
    [Fact]
    public void HandsOffDemandAtTheFirstMergeStartMatchesAcrossContracts() {
        double Demand(bool assisted) {
            var session = new SimulationSession();
            session.StartBeat(() => Beats.ModernVisualMerge());
            session.SetTouchControlModality(true);
            session.SetAssistedFlight(assisted);
            session.Begin();
            double worst = 0.0;
            for (int i = 0; i < 4 * (int)AircraftSim.TickHz; i++) {
                session.StepFixed();
                if (i > 60) worst = Math.Max(worst, session.Controls.Command.GDemand);
            }
            return worst;
        }
        double assistedG = Demand(true);
        double manualG = Demand(false);
        Assert.True(Math.Abs(assistedG - manualG) < 0.05,
            $"hands-off requested G assisted={assistedG:F3} manual={manualG:F3}");
    }
}
