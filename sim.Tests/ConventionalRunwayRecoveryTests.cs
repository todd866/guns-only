using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

public sealed class ConventionalRunwayRecoveryTests {
    const double ReferenceHeightM = 1.8;

    static readonly ConventionalRunway Runway = new(
        "runway.test.v1",
        "Test runway",
        threshold: new Vec3D(100.0, 120.0, -200.0),
        headingRad: 0.0,
        lengthM: 3000.0,
        widthM: 45.0);

    [Fact]
    public void RunwayFrameUsesThresholdHeadingAndPublishedTouchdownAim() {
        var point = Runway.SurfacePoint(450.0, 12.0);
        var frame = Runway.Frame(point);

        Assert.Equal(450.0, frame.along, precision: 10);
        Assert.Equal(12.0, frame.cross, precision: 10);
        Assert.Equal(0.0, frame.height, precision: 10);
        Assert.Equal(point, Runway.TouchdownAimPoint + Runway.Right * 12.0);
        Assert.True(Runway.ContainsPavement(point));
        Assert.False(Runway.ContainsPavement(Runway.SurfacePoint(450.0, 23.0)));
    }

    [Fact]
    public void AuthoredF22RecoveryPlanConvertsWithoutGuessingRunwaySemantics() {
        RecoveryPlan plan = Assert.IsType<RecoveryPlan>(
            Doctrine.Beats.ModernVisualMerge().RecoveryPlan);
        ConventionalRunway runway = ConventionalRunway.FromRecoveryPlan(plan);

        Assert.Equal(plan.Position, runway.TouchdownAimPoint);
        Assert.Equal(3000.0, runway.LengthM);
        Assert.Equal(45.0, runway.WidthM);
        Assert.Equal(300.0, runway.TouchdownAimAlongM);
        Assert.Throws<ArgumentException>(() => ConventionalRunway.FromRecoveryPlan(
            new RecoveryPlan("recovery.no-runway.v1", "No runway",
                Vec3D.Zero, requiredLandingReserveLb: 0.0)));
    }

    [Fact]
    public void NominalGearDownTouchdownRollsToAStopOnTheRunway() {
        var recovery = new ConventionalRunwayRecoveryModel(Runway);
        var previous = ApproachState(alongM: 430.0, crossM: 2.0, heightM: 0.25,
            forwardMps: 74.0, lateralMps: 0.4, sinkMps: 2.2);
        var current = ApproachState(alongM: 430.7, crossM: 2.0, heightM: -0.05,
            forwardMps: 74.0, lateralMps: 0.4, sinkMps: 2.2);

        Assert.True(recovery.TryTouchdown(
            previous, current, gearDownAndLocked: true, airspeedMps: 74.0));
        Assert.Equal(RunwayRecoveryPhase.Rollout, recovery.Phase);
        Assert.True(recovery.Touchdown.Survivable);
        Assert.Equal(RunwayTouchdownDeviation.None, recovery.Touchdown.Deviations);

        for (int tick = 0;
             tick < 20_000 && recovery.Phase == RunwayRecoveryPhase.Rollout;
             tick++)
            recovery.Step(1.0 / 120.0, throttleFraction: 0.0);

        Assert.Equal(RunwayRecoveryPhase.Recovered, recovery.Phase);
        var stopped = Runway.Frame(recovery.State.Position);
        Assert.InRange(stopped.along, 800.0, 1400.0);
        Assert.InRange(Math.Abs(stopped.cross), 0.0, Runway.WidthM * 0.5);
        Assert.Equal(ReferenceHeightM, stopped.height, precision: 10);
        Assert.Equal(0.0, recovery.State.Speed, precision: 10);
        Assert.True(recovery.WeightOnWheels);
    }

    [Fact]
    public void GearUpOrUnsafeSinkProducesAPhysicalCrashNotARecovery() {
        var gearUp = new ConventionalRunwayRecoveryModel(Runway);
        Assert.True(gearUp.TryTouchdown(
            ApproachState(450.0, 0.0, 0.2, 72.0, 0.0, 2.0),
            ApproachState(450.7, 0.0, -0.1, 72.0, 0.0, 2.0),
            gearDownAndLocked: false,
            airspeedMps: 72.0));
        Assert.Equal(RunwayRecoveryPhase.Crashed, gearUp.Phase);
        Assert.True(gearUp.Touchdown.Deviations.HasFlag(
            RunwayTouchdownDeviation.GearNotDown));

        var hard = new ConventionalRunwayRecoveryModel(Runway);
        Assert.True(hard.TryTouchdown(
            ApproachState(450.0, 0.0, 0.2, 72.0, 0.0, 6.5),
            ApproachState(450.7, 0.0, -0.1, 72.0, 0.0, 6.5),
            gearDownAndLocked: true,
            airspeedMps: 72.0));
        Assert.Equal(RunwayRecoveryPhase.Crashed, hard.Phase);
        Assert.True(hard.Touchdown.Deviations.HasFlag(
            RunwayTouchdownDeviation.ExcessiveSink));
    }

    [Fact]
    public void ContactOutsidePavementRemainsOwnedByNaturalTerrain() {
        var recovery = new ConventionalRunwayRecoveryModel(Runway);
        bool contacted = recovery.TryTouchdown(
            ApproachState(450.0, 30.0, 0.2, 72.0, 0.0, 2.0),
            ApproachState(450.7, 30.0, -0.1, 72.0, 0.0, 2.0),
            gearDownAndLocked: true,
            airspeedMps: 72.0);

        Assert.False(contacted);
        Assert.Equal(RunwayRecoveryPhase.Airborne, recovery.Phase);
        Assert.False(recovery.Touchdown.Contact);
    }

    [Fact]
    public void HighPowerAfterADeepTouchdownCanOverrunTheRunway() {
        var recovery = new ConventionalRunwayRecoveryModel(Runway);
        Assert.True(recovery.TryTouchdown(
            ApproachState(1750.0, 0.0, 0.2, 92.0, 0.0, 2.0),
            ApproachState(1750.8, 0.0, -0.1, 92.0, 0.0, 2.0),
            gearDownAndLocked: true,
            airspeedMps: 92.0));
        Assert.True(recovery.Touchdown.Deviations.HasFlag(
            RunwayTouchdownDeviation.LongLanding));

        for (int tick = 0;
             tick < 20_000 && recovery.Phase == RunwayRecoveryPhase.Rollout;
             tick++)
            recovery.Step(1.0 / 120.0, throttleFraction: 1.0);

        Assert.Equal(RunwayRecoveryPhase.Excursion, recovery.Phase);
        Assert.True(Runway.Frame(recovery.State.Position).along > Runway.LengthM);
    }

    [Fact]
    public void AuthoritativeAirspeedIsSeparateFromGroundRollAndCrosswindComponents() {
        var fastGround = new ConventionalRunwayRecoveryModel(Runway);
        Assert.True(fastGround.TryTouchdown(
            ApproachState(450.0, 0.0, 0.2, 104.0, 0.0, 2.0),
            ApproachState(451.0, 0.0, -0.1, 104.0, 0.0, 2.0),
            gearDownAndLocked: true,
            airspeedMps: 74.0));
        Assert.Equal(RunwayRecoveryPhase.Rollout, fastGround.Phase);
        Assert.False(fastGround.Touchdown.Deviations.HasFlag(
            RunwayTouchdownDeviation.TooFast));
        Assert.Equal(104.0, fastGround.Touchdown.ForwardSpeedMps, precision: 10);
        Assert.Equal(74.0, fastGround.Touchdown.AirspeedMps, precision: 10);

        var fastAir = new ConventionalRunwayRecoveryModel(Runway);
        Assert.True(fastAir.TryTouchdown(
            ApproachState(450.0, 0.0, 0.2, 74.0, 0.0, 2.0),
            ApproachState(450.7, 0.0, -0.1, 74.0, 0.0, 2.0),
            gearDownAndLocked: true,
            airspeedMps: 104.0));
        Assert.Equal(RunwayRecoveryPhase.Crashed, fastAir.Phase);
        Assert.True(fastAir.Touchdown.Deviations.HasFlag(
            RunwayTouchdownDeviation.TooFast));

        var crosswindDrift = new ConventionalRunwayRecoveryModel(Runway);
        Assert.True(crosswindDrift.TryTouchdown(
            ApproachState(450.0, 0.0, 0.2, 74.0, 8.0, 2.0),
            ApproachState(450.7, 0.1, -0.1, 74.0, 8.0, 2.0),
            gearDownAndLocked: true,
            airspeedMps: 74.0));
        Assert.Equal(RunwayRecoveryPhase.Crashed, crosswindDrift.Phase);
        Assert.True(crosswindDrift.Touchdown.Deviations.HasFlag(
            RunwayTouchdownDeviation.ExcessiveLateralSpeed));
    }

    [Fact]
    public void InvertedBankPitchAndHeadingMisalignmentCannotBecomeWheelRollout() {
        static void AssertRejected(
            AircraftState previous,
            AircraftState current,
            RunwayTouchdownDeviation expected) {
            var recovery = new ConventionalRunwayRecoveryModel(Runway);
            Assert.True(recovery.TryTouchdown(
                previous,
                current,
                gearDownAndLocked: true,
                airspeedMps: 74.0));
            Assert.Equal(RunwayRecoveryPhase.Crashed, recovery.Phase);
            Assert.True(recovery.Touchdown.Deviations.HasFlag(expected),
                $"expected {expected}, actual {recovery.Touchdown.Deviations}");
        }

        AssertRejected(
            ApproachState(450.0, 0.0, 0.2, 74.0, 0.0, 2.0,
                bankRad: Math.PI),
            ApproachState(450.7, 0.0, -0.1, 74.0, 0.0, 2.0,
                bankRad: Math.PI),
            RunwayTouchdownDeviation.Inverted);
        AssertRejected(
            ApproachState(450.0, 0.0, 0.2, 74.0, 0.0, 2.0,
                bankRad: 20.0 * Math.PI / 180.0),
            ApproachState(450.7, 0.0, -0.1, 74.0, 0.0, 2.0,
                bankRad: 20.0 * Math.PI / 180.0),
            RunwayTouchdownDeviation.ExcessiveBank);
        AssertRejected(
            ApproachState(450.0, 0.0, 0.2, 74.0, 0.0, 2.0,
                pitchRad: 25.0 * Math.PI / 180.0),
            ApproachState(450.7, 0.0, -0.1, 74.0, 0.0, 2.0,
                pitchRad: 25.0 * Math.PI / 180.0),
            RunwayTouchdownDeviation.ExcessivePitch);
        AssertRejected(
            ApproachState(450.0, 0.0, 0.2, 74.0, 0.0, 2.0,
                headingOffsetRad: 20.0 * Math.PI / 180.0),
            ApproachState(450.7, 0.0, -0.1, 74.0, 0.0, 2.0,
                headingOffsetRad: 20.0 * Math.PI / 180.0),
            RunwayTouchdownDeviation.ExcessiveHeading);
    }

    [Fact]
    public void F22HandoffRemainsActiveUntilGearDownRunwayStopThenDiscontinues() {
        BeatSetup authored = Beats.ModernVisualMerge();
        var session = new SimulationSession();
        session.StartBeat(() => authored with {
            InitialThrottle = 0.0,
            Combat = authored.CombatRules with { OpponentAmmo = 0 },
            ContinuousCombat = authored.ContinuousCombat! with {
                MaximumFormationSize = 1
            }
        });
        session.Begin();

        Assert.Null(session.Carrier);
        ConventionalRunwayRecoveryModel recovery = Assert.IsType<
            ConventionalRunwayRecoveryModel>(session.ConventionalRunwayRecovery);
        session.FeedKey(GKey.GearToggle, true);
        session.FeedKey(GKey.GearToggle, false);
        session.StepFixed(8 * (int)AircraftSim.TickHz);
        Assert.True(session.PlayerSystems.AllGearDownAndLocked);

        session.FeedKey(GKey.KnockItOff, true);
        session.FeedKey(GKey.KnockItOff, false);
        for (int tick = 0; tick < 8 && !session.PlayerRtbActive; tick++)
            session.StepFixed();
        Assert.True(session.PlayerRtbActive);

        session.Player.AdoptExternalKinematics(ApproachStateFor(
            recovery.Runway,
            alongM: 430.0,
            crossM: 0.5,
            heightM: 0.05,
            forwardMps: 74.0,
            lateralMps: 0.2,
            sinkMps: 2.2,
            session.Player.State.Mass));
        double fuelAtFinalLb = session.PlayerFuel.FuelLb;

        for (int tick = 0;
             tick < 10_000
                && session.Lifecycle == SimulationSession.LifecycleState.Active;
             tick++)
            session.StepFixed();

        Assert.Equal(
            SimulationSession.LifecycleState.Finished, session.Lifecycle);
        Assert.Equal(
            RunwayRecoveryPhase.Recovered, session.ConventionalRunwayPhase);
        Assert.Equal(CombatHandoffPhase.Recovered, session.CombatHandoffPhase);
        Assert.Equal(SortieOutcome.Discontinued, session.Outcome);
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
        Assert.False(session.PlayerRtbActive);
        Assert.True(session.PlayerFuel.FuelLb <= fuelAtFinalLb);
        Assert.Contains(session.RecentEvents, item =>
            item.Type == SessionEventType.SortieFinished
            && item.Outcome == SortieOutcome.Discontinued);
    }

    [Fact]
    public void HandoffStopPublishesFinishAfterSameTickOpponentImpactAndKeepsDiscontinued() {
        BeatSetup authored = Beats.ModernVisualMerge();
        var session = new SimulationSession();
        session.StartBeat(() => authored with {
            InitialThrottle = 0.0,
            Combat = authored.CombatRules with {
                PlayerAmmo = 0,
                OpponentAmmo = 0
            },
            ContinuousCombat = authored.ContinuousCombat! with {
                MaximumFormationSize = 1
            }
        });
        session.Begin();
        ConventionalRunwayRecoveryModel recovery = Assert.IsType<
            ConventionalRunwayRecoveryModel>(session.ConventionalRunwayRecovery);
        session.FeedKey(GKey.GearToggle, true);
        session.FeedKey(GKey.GearToggle, false);
        session.StepFixed(8 * (int)AircraftSim.TickHz);
        Assert.True(session.PlayerSystems.AllGearDownAndLocked);
        session.FeedKey(GKey.ThrottleDown, true);
        session.StepFixed(2 * (int)AircraftSim.TickHz);
        session.FeedKey(GKey.ThrottleDown, false);
        Assert.Equal(0.0, session.Controls.Throttle, precision: 10);

        session.FeedKey(GKey.KnockItOff, true);
        session.FeedKey(GKey.KnockItOff, false);
        for (int tick = 0; tick < 8 && !session.PlayerRtbActive; tick++)
            session.StepFixed();
        Assert.True(session.PlayerRtbActive);

        session.Player.AdoptExternalKinematics(ApproachStateFor(
            recovery.Runway,
            alongM: 430.0,
            crossM: 0.5,
            heightM: 0.05,
            forwardMps: 74.0,
            lateralMps: 0.2,
            sinkMps: 2.2,
            session.Player.State.Mass));
        for (int tick = 0;
             tick < 10_000
                && (session.ConventionalRunwayPhase
                        == RunwayRecoveryPhase.Airborne
                    || recovery.State.Speed > 1.04);
             tick++)
            session.StepFixed();

        Assert.Equal(RunwayRecoveryPhase.Rollout,
            session.ConventionalRunwayPhase);
        Assert.InRange(recovery.State.Speed, 1.0, 1.04);
        Assert.Equal(AircraftTerminalState.Flying,
            session.OpponentTerminalState);

        long eventSequenceBeforeStop = session.RecentEvents.Count == 0
            ? 0L : session.RecentEvents[^1].Sequence;
        // Raise authoritative terrain beneath the still-live opponent only for the final rollout
        // tick. Ownship is already constrained to runway pavement, so this deterministically makes
        // opponent impact/destruction coincide with the wheel-stop transition under test.
        session.SetTerrainSurface(new FlatTerrain(
            session.Bandit.State.Position.Y + 500.0));
        session.StepFixed();

        Assert.Equal(RunwayRecoveryPhase.Recovered,
            session.ConventionalRunwayPhase);
        Assert.Equal(SimulationSession.LifecycleState.Finished,
            session.Lifecycle);
        Assert.Equal(SortieOutcome.Discontinued, session.PendingOutcome);
        Assert.Equal(SortieOutcome.Discontinued, session.Outcome);

        SessionEvent[] stopEvents = session.RecentEvents
            .Where(item => item.Sequence > eventSequenceBeforeStop)
            .ToArray();
        SessionEvent impact = Assert.Single(stopEvents, item =>
            item.Type == SessionEventType.Impact
            && item.Target == CombatRole.Opponent);
        SessionEvent destroyed = Assert.Single(stopEvents, item =>
            item.Type == SessionEventType.Destroyed
            && item.Target == CombatRole.Opponent);
        SessionEvent finished = Assert.Single(stopEvents, item =>
            item.Type == SessionEventType.SortieFinished);
        Assert.True(impact.Sequence < destroyed.Sequence);
        Assert.True(destroyed.Sequence < finished.Sequence);
        Assert.Equal(stopEvents[^1], finished);
        Assert.Equal(SortieOutcome.Discontinued, finished.Outcome);

        SessionEvent[] stableEvents = session.RecentEvents.ToArray();
        session.StepFixed();
        Assert.Equal(SortieOutcome.Discontinued, session.PendingOutcome);
        Assert.Equal(SortieOutcome.Discontinued, session.Outcome);
        Assert.Equal(stableEvents, session.RecentEvents);
    }

    [Fact]
    public void F22GearUpRunwayContactIsARealGroundLoss() {
        BeatSetup authored = Beats.ModernVisualMerge();
        var session = new SimulationSession();
        session.StartBeat(() => authored with {
            InitialThrottle = 0.0,
            Combat = authored.CombatRules with { OpponentAmmo = 0 },
            ContinuousCombat = authored.ContinuousCombat! with {
                MaximumFormationSize = 1
            }
        });
        session.Begin();
        ConventionalRunwayRecoveryModel recovery = Assert.IsType<
            ConventionalRunwayRecoveryModel>(session.ConventionalRunwayRecovery);
        Assert.True(session.PlayerSystems.AllGearUpAndLocked);

        session.Player.AdoptExternalKinematics(ApproachStateFor(
            recovery.Runway,
            alongM: 430.0,
            crossM: 0.0,
            heightM: 0.05,
            forwardMps: 74.0,
            lateralMps: 0.0,
            sinkMps: 2.2,
            session.Player.State.Mass));
        for (int tick = 0;
             tick < 12 && session.ConventionalRunwayPhase
                == RunwayRecoveryPhase.Airborne;
             tick++)
            session.StepFixed();

        Assert.Equal(
            RunwayRecoveryPhase.Crashed, session.ConventionalRunwayPhase);
        Assert.True(session.RunwayTouchdown.Deviations.HasFlag(
            RunwayTouchdownDeviation.GearNotDown));
        Assert.NotEqual(
            AircraftTerminalState.Flying, session.PlayerTerminalState);
        Assert.Equal(ImpactSurface.Ground, session.PlayerImpactSurface);
    }

    [Fact]
    public void RunwayStopWithoutKnockItOffDoesNotBypassLiveCombat() {
        SimulationSession session = StageRunwaySession(Beats.ModernVisualMerge());
        Assert.Equal(CombatHandoffPhase.Available, session.CombatHandoffPhase);

        LandAndStop(session);

        Assert.Equal(RunwayRecoveryPhase.Recovered,
            session.ConventionalRunwayPhase);
        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
        Assert.Equal(SortieOutcome.None, session.Outcome);
        Assert.Equal(CombatHandoffPhase.Available, session.CombatHandoffPhase);
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);

        double stoppedFuelLb = session.PlayerFuel.FuelLb;
        double stoppedMassKg = session.Player.State.Mass;
        session.StepFixed(2 * (int)AircraftSim.TickHz);
        Assert.Equal(RunwayRecoveryPhase.Recovered,
            session.ConventionalRunwayPhase);
        Assert.Equal(ReferenceHeightM,
            session.ConventionalRunwayRecovery!.Runway.Frame(
                session.Player.State.Position).height,
            precision: 10);
        Assert.Equal(0.0, session.Player.State.Speed, precision: 10);
        double burnedFuelLb = stoppedFuelLb - session.PlayerFuel.FuelLb;
        Assert.True(burnedFuelLb > 0.0);
        Assert.Equal(
            stoppedMassKg - burnedFuelLb * 0.45359237,
            session.Player.State.Mass,
            precision: 8);
        Assert.Equal(
            session.Player.State.Mass,
            session.ConventionalRunwayRecovery!.State.Mass,
            precision: 10);
        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
        Assert.DoesNotContain(session.RecentEvents, item =>
            item.Type == SessionEventType.SortieFinished);
    }

    [Fact]
    public void UnsupportedAceDuelRunwayStopDoesNotBypassItsSingleFight() {
        SimulationSession session = StageRunwaySession(Beats.ModernAceDuel());
        Assert.Equal(CombatHandoffPhase.Unavailable, session.CombatHandoffPhase);

        session.FeedKey(GKey.KnockItOff, true);
        session.FeedKey(GKey.KnockItOff, false);
        session.StepFixed();
        Assert.Equal(CombatHandoffPhase.Unavailable, session.CombatHandoffPhase);

        LandAndStop(session);

        Assert.Equal(RunwayRecoveryPhase.Recovered,
            session.ConventionalRunwayPhase);
        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
        Assert.Equal(SortieOutcome.None, session.Outcome);
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
        Assert.True(session.LiveOpponentCount > 0);
        Assert.DoesNotContain(session.RecentEvents, item =>
            item.Type == SessionEventType.SortieFinished);
    }

    static AircraftState ApproachState(
        double alongM,
        double crossM,
        double heightM,
        double forwardMps,
        double lateralMps,
        double sinkMps,
        double headingOffsetRad = 0.0,
        double pitchRad = 0.0,
        double bankRad = 0.0) {
        Vec3D velocity = Runway.Forward * forwardMps
            + Runway.Right * lateralMps
            + new Vec3D(0.0, -sinkMps, 0.0);
        double speed = velocity.Length;
        return new AircraftState(
            Runway.SurfacePoint(alongM, crossM)
                + new Vec3D(0.0, ReferenceHeightM + heightM, 0.0),
            speed,
            Gamma: Math.Asin(velocity.Y / speed),
            Chi: Math.Atan2(velocity.X, velocity.Z),
            Bank: 0.0,
            Mass: FlightModel.F22APublicDataSurrogate.MassKg,
            BodyAttitude: ApproachAttitude(
                Runway.HeadingRad + headingOffsetRad, pitchRad, bankRad));
    }

    static AircraftState ApproachStateFor(
        ConventionalRunway runway,
        double alongM,
        double crossM,
        double heightM,
        double forwardMps,
        double lateralMps,
        double sinkMps,
        double massKg) {
        Vec3D velocity = runway.Forward * forwardMps
            + runway.Right * lateralMps
            + new Vec3D(0.0, -sinkMps, 0.0);
        double speed = velocity.Length;
        return new AircraftState(
            runway.SurfacePoint(alongM, crossM)
                + new Vec3D(0.0, ReferenceHeightM + heightM, 0.0),
            speed,
            Gamma: Math.Asin(velocity.Y / speed),
            Chi: Math.Atan2(velocity.X, velocity.Z),
            Bank: 0.0,
            Mass: massKg,
            BodyAttitude: ApproachAttitude(runway.HeadingRad));
    }

    static QuaternionD ApproachAttitude(
        double headingRad,
        double pitchRad = 0.0,
        double bankRad = 0.0) {
        Vec3D forward = new(
            Math.Sin(headingRad) * Math.Cos(pitchRad),
            Math.Sin(pitchRad),
            Math.Cos(headingRad) * Math.Cos(pitchRad));
        Vec3D levelRight = new(
            Math.Cos(headingRad),
            0.0,
            -Math.Sin(headingRad));
        Vec3D levelUp = forward.Cross(levelRight).Normalized();
        Vec3D bodyUp = levelUp * Math.Cos(bankRad)
            + levelRight * Math.Sin(bankRad);
        Vec3D bodyRight = bodyUp.Cross(forward).Normalized();
        return QuaternionD.FromFrame(bodyRight, bodyUp, forward);
    }

    static SimulationSession StageRunwaySession(BeatSetup authored) {
        var session = new SimulationSession();
        session.StartBeat(() => authored with {
            InitialThrottle = 0.0,
            Combat = authored.CombatRules with { OpponentAmmo = 0 },
            ContinuousCombat = authored.ContinuousCombat is null
                ? null
                : authored.ContinuousCombat with { MaximumFormationSize = 1 }
        });
        session.Begin();
        Assert.IsType<ConventionalRunwayRecoveryModel>(
            session.ConventionalRunwayRecovery);
        session.FeedKey(GKey.GearToggle, true);
        session.FeedKey(GKey.GearToggle, false);
        session.StepFixed(8 * (int)AircraftSim.TickHz);
        Assert.True(session.PlayerSystems.AllGearDownAndLocked);
        return session;
    }

    sealed class FlatTerrain : ITerrainSurface {
        readonly double _heightM;

        public FlatTerrain(double heightM) => _heightM = heightM;

        public TerrainBounds Bounds { get; } =
            new(-1_000_000.0, 1_000_000.0, -1_000_000.0, 1_000_000.0);
        public double HorizontalResolutionM => 1.0;

        public bool TrySample(double eastM, double northM,
            out TerrainSample sample) {
            if (!Bounds.Contains(eastM, northM)) {
                sample = default;
                return false;
            }
            sample = new TerrainSample(
                _heightM, new Vec3D(0.0, 1.0, 0.0), TerrainSurfaceKind.Land);
            return true;
        }
    }

    static void LandAndStop(SimulationSession session) {
        ConventionalRunwayRecoveryModel recovery = Assert.IsType<
            ConventionalRunwayRecoveryModel>(session.ConventionalRunwayRecovery);
        session.Player.AdoptExternalKinematics(ApproachStateFor(
            recovery.Runway,
            alongM: 430.0,
            crossM: 0.5,
            heightM: 0.05,
            forwardMps: 74.0,
            lateralMps: 0.2,
            sinkMps: 2.2,
            session.Player.State.Mass));

        for (int tick = 0;
             tick < 10_000
                && session.ConventionalRunwayPhase
                    != RunwayRecoveryPhase.Recovered
                && session.Lifecycle
                    == SimulationSession.LifecycleState.Active;
             tick++)
            session.StepFixed();
    }
}
