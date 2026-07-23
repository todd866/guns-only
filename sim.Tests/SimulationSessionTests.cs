using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

public class SimulationSessionTests {
    sealed class UnboundedTestAtmosphere : IAtmosphereModel {
        public AtmosphericState Sample(double altitudeM) => new(
            altitudeM, altitudeM, 220.0, 1.0, 0.00001, 297.3);
    }

    sealed class CalmTestWind : GunsOnly.Sim.Turbulence.IWindField {
        public Vec3D Sample(Vec3D _) => Vec3D.Zero;
    }

    static AircraftState CombatState(double x, double y, double z, double speed,
        double chi = 0.0) => new(
            new Vec3D(x, y, z), speed, 0.0, chi, 0.0, FlightModel.Sabre.MassKg);

    static BeatSetup TestFight(AircraftState player, AircraftState opponent,
        CombatConfig combat, FuelConfig? fuel = null) => new(
            "Test fight",
            player,
            opponent,
            new PurePursuitLaw(),
            new() { (0.0, new PilotCommand(1.0, 0.0, 0.85, 0.0)) },
            Combat: combat,
            Fuel: fuel);

    static SimulationSession TailAttackSession(CombatConfig? combat = null) {
        AircraftState player = CombatState(0.0, 3000.0, 0.0, 170.0);
        AircraftState opponent = CombatState(0.0, 3000.0, -160.0, 170.0);
        combat ??= new CombatConfig(PlayerAmmo: 20, OpponentAmmo: 20,
            PlayerHitsToDefeat: 4, OpponentHitsToDefeat: 2);
        var session = new SimulationSession();
        session.StartBeat(() => TestFight(player, opponent, combat));
        return session;
    }

    static void RunUntilFinished(SimulationSession session,
        double maximumSeconds = SimulationSession.TerminalSimulationLimitSeconds + 20.0) {
        int maximumTicks = (int)Math.Ceiling(maximumSeconds * AircraftSim.TickHz);
        for (int i = 0; i < maximumTicks
            && session.Lifecycle != SimulationSession.LifecycleState.Finished; i++)
            session.StepFixed();
    }

    [Fact]
    public void ReadyHoldsEverySimulationStateUntilBegin() {
        var session = new SimulationSession(5);
        AircraftState player = session.Player.State;
        AircraftState bandit = session.Bandit.State;
        Vec3D carrierPosition = session.Carrier!.Position;

        session.FeedKey(GKey.ThrottleUp, true);
        session.FeedKey(GKey.Trigger, true);
        session.Advance(12.0);
        session.StepFixed();

        Assert.Equal(SimulationSession.LifecycleState.Ready, session.Lifecycle);
        Assert.Equal(0.0, session.TimeSeconds);
        Assert.Equal(0, session.Tick);
        Assert.Equal(player, session.Player.State);
        Assert.Equal(bandit, session.Bandit.State);
        Assert.Equal(carrierPosition, session.Carrier.Position);
        Assert.False(session.TriggerDown);
        Assert.Equal(0, session.ShotsTotal);
    }

    [Fact]
    public void RestagingReadyDoesNotConsumeARecoveryAttempt() {
        var session = new SimulationSession(5);

        Assert.Equal(0, session.RecoveryProgress.AttemptCount);
        Assert.Equal(0, session.Difficulty.AttemptIndex);

        session.Restart();
        session.StartBeat(5, Carrier.DeckConfiguration.Angled);

        Assert.Equal(SimulationSession.LifecycleState.Ready, session.Lifecycle);
        Assert.Equal(0, session.RecoveryProgress.AttemptCount);
        Assert.Equal(0, session.Difficulty.AttemptIndex);

        session.Begin();

        Assert.Equal(1, session.RecoveryProgress.AttemptCount);
        Assert.Equal(0, session.Difficulty.AttemptIndex);
    }

    [Fact]
    public void PreflightKeyEdgesCannotLeakAcrossBegin() {
        var preflightInput = new SimulationSession(1);
        var cleanStart = new SimulationSession(1);

        preflightInput.FeedKey(GKey.ThrottleUp, true);
        preflightInput.FeedKey(GKey.PullUp, true);
        preflightInput.FeedKey(GKey.Trigger, true);
        preflightInput.Begin();
        cleanStart.Begin();
        for (int i = 0; i < 240; i++) {
            preflightInput.StepFixed();
            cleanStart.StepFixed();
        }

        Assert.Equal(cleanStart.Player.State, preflightInput.Player.State);
        Assert.Equal(cleanStart.Bandit.State, preflightInput.Bandit.State);
        Assert.Equal(cleanStart.Controls.Command, preflightInput.Controls.Command);
        Assert.Equal(cleanStart.PlayerGun.AmmoRemaining,
            preflightInput.PlayerGun.AmmoRemaining);
        Assert.False(preflightInput.TriggerDown);
        Assert.Equal(0, preflightInput.ShotsTotal);
    }

    [Fact]
    public void AnalogRollIsAcceptedOnlyInActiveFlightAndPauseNeutralizesIt() {
        var session = new SimulationSession(1);

        session.SetAnalogRollControl(0.35);
        session.Begin();
        session.StepFixed();
        Assert.Equal(0.0, session.Controls.Command.RollControl, 10);

        session.SetAnalogRollControl(0.35);
        session.StepFixed();
        Assert.Equal(0.35, session.Controls.Command.RollControl, 10);

        session.SetPaused(true);
        session.SetPaused(false);
        session.StepFixed();
        Assert.Equal(0.0, session.Controls.Command.RollControl, 10);
    }

    [Fact]
    public void GearCyclesOncePerGPressAndMissionStagingDoesNotOverrideThePilot() {
        var session = new SimulationSession(5);
        double stagedFlapDegrees = session.PlayerSystems.LeftFlapDegrees;

        Assert.Equal(LandingGearHandle.Down, session.PlayerSystems.GearHandle);
        Assert.True(stagedFlapDegrees > 0.0);
        session.Begin();

        session.FeedKey(GKey.GearToggle, true);
        Assert.Equal(LandingGearHandle.Up, session.PlayerSystems.GearHandle);
        session.FeedKey(GKey.GearToggle, true); // host key-repeat while G is still held
        Assert.Equal(LandingGearHandle.Up, session.PlayerSystems.GearHandle);
        session.FeedKey(GKey.GearToggle, false);

        session.FeedKey(GKey.FlapUp, true);
        for (int i = 0; i < 240; i++) session.StepFixed();

        Assert.Equal(LandingGearHandle.Up, session.PlayerSystems.GearHandle);
        Assert.Equal(WingFlapLever.Up, session.PlayerSystems.FlapLever);
        Assert.True(session.PlayerSystems.LeftFlapDegrees < stagedFlapDegrees,
            "the pilot's cleanup command must survive the carrier approach controller");

        session.FeedKey(GKey.FlapUp, false);
        double heldFlapDegrees = session.PlayerSystems.LeftFlapDegrees;
        for (int i = 0; i < 60; i++) session.StepFixed();
        Assert.Equal(WingFlapLever.Hold, session.PlayerSystems.FlapLever);
        Assert.Equal(heldFlapDegrees, session.PlayerSystems.LeftFlapDegrees, precision: 12);

        session.FeedKey(GKey.GearToggle, true);
        Assert.Equal(LandingGearHandle.Down, session.PlayerSystems.GearHandle);
        session.FeedKey(GKey.GearToggle, true); // repeat still cannot reverse the selection
        Assert.Equal(LandingGearHandle.Down, session.PlayerSystems.GearHandle);
        session.FeedKey(GKey.GearToggle, false);
    }

    [Fact]
    public void FlapBracketsAreSpringLoadedExplicitCommands() {
        var session = new SimulationSession(1);
        session.Begin();

        session.FeedKey(GKey.FlapDown, true);
        Assert.Equal(WingFlapLever.Down, session.PlayerSystems.FlapLever);
        for (int i = 0; i < 120; i++) session.StepFixed();
        Assert.True(session.PlayerSystems.LeftFlapDegrees > 0.0);

        session.FeedKey(GKey.FlapDown, false);
        double selectedDegrees = session.PlayerSystems.LeftFlapDegrees;
        Assert.Equal(WingFlapLever.Hold, session.PlayerSystems.FlapLever);
        for (int i = 0; i < 60; i++) session.StepFixed();
        Assert.Equal(selectedDegrees, session.PlayerSystems.LeftFlapDegrees, precision: 12);

        session.FeedKey(GKey.FlapUp, true);
        Assert.Equal(WingFlapLever.Up, session.PlayerSystems.FlapLever);
        session.FeedKey(GKey.FlapDown, true);
        Assert.Equal(WingFlapLever.Hold, session.PlayerSystems.FlapLever);
        session.FeedKey(GKey.FlapDown, false);
        Assert.True(session.PlayerSystems.FlapLever == WingFlapLever.Up,
            "releasing one conflicting selection must resume the other held command");
        session.StepFixed();
        Assert.True(session.PlayerSystems.LeftFlapDegrees < selectedDegrees);
        session.FeedKey(GKey.FlapUp, false);
        Assert.Equal(WingFlapLever.Hold, session.PlayerSystems.FlapLever);
    }

    [Fact]
    public void BeginAdvancesAtFixedRateAndPauseIsAStableHold() {
        var session = new SimulationSession(1);
        AircraftState initial = session.Player.State;

        session.Begin();
        session.Advance(SimulationSession.FixedDeltaSeconds * 2.0);

        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
        Assert.Equal(SimulationSession.FixedDeltaSeconds * 2.0,
            session.TimeSeconds, precision: 12);
        Assert.Equal(2, session.Tick);
        Assert.NotEqual(initial, session.Player.State);

        AircraftState beforePause = session.Player.State;
        double pausedAt = session.TimeSeconds;
        session.FeedKey(GKey.ThrottleUp, true);
        session.SetPaused(true);
        session.Advance(20.0);
        session.StepFixed();

        Assert.Equal(SimulationSession.LifecycleState.Paused, session.Lifecycle);
        Assert.Equal(pausedAt, session.TimeSeconds);
        Assert.Equal(2, session.Tick);
        Assert.Equal(beforePause, session.Player.State);

        session.SetPaused(false);
        double throttleAtResume = session.Controls.Throttle;
        for (int i = 0; i < 120; i++) session.StepFixed();
        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
        Assert.True(session.TimeSeconds > pausedAt);
        Assert.NotEqual(beforePause, session.Player.State);
        Assert.Equal(throttleAtResume, session.Controls.Throttle, precision: 12);
        Assert.Equal(122, session.Tick);
    }

    [Fact]
    public void RestartBuildsAFreshBeatAndReturnsToReady() {
        var session = new SimulationSession(5, Carrier.DeckConfiguration.Angled);
        Carrier firstCarrier = session.Carrier!;
        long firstPlayerSpawn = session.PlayerSpawnSequence;
        long firstBanditSpawn = session.BanditSpawnSequence;
        long firstCarrierSpawn = session.CarrierSpawnSequence;
        Vec3D initialCarrierPosition = firstCarrier.Position;
        session.Begin();
        session.Advance(0.25);
        double monotonicTime = session.TimeSeconds;
        long monotonicTick = session.Tick;
        Assert.NotEqual(initialCarrierPosition, firstCarrier.Position);

        session.FeedKey(GKey.Restart, true);

        Assert.Equal(SimulationSession.LifecycleState.Ready, session.Lifecycle);
        Assert.Equal(5, session.BeatIndex);
        Assert.Equal(Carrier.DeckConfiguration.Angled, session.DeckConfiguration);
        Assert.NotSame(firstCarrier, session.Carrier);
        Assert.True(session.PlayerSpawnSequence > firstPlayerSpawn);
        Assert.True(session.BanditSpawnSequence > firstBanditSpawn);
        Assert.True(session.CarrierSpawnSequence > firstCarrierSpawn);
        Assert.Equal(monotonicTime, session.TimeSeconds);
        Assert.Equal(monotonicTick, session.Tick);
        AircraftState stagedPlayer = session.Player.State;
        session.Advance(1.0);
        Assert.Equal(stagedPlayer, session.Player.State);
        Assert.Equal(monotonicTime, session.TimeSeconds);
        Assert.Equal(monotonicTick, session.Tick);
    }

    [Fact]
    public void CarrierOverrideDoesNotErasePreferredControlMode() {
        var session = new SimulationSession(1);
        session.SetVariant(ValleyVariant.DoctrineDeep);
        Assert.Equal(ValleyVariant.DoctrineDeep, session.Variant);
        Assert.Equal(ValleyVariant.DoctrineDeep, session.EffectiveVariant);

        session.StartBeat(5);
        Assert.Equal(ValleyVariant.DoctrineDeep, session.Variant);
        Assert.Equal(ValleyVariant.PhysicsOnly, session.EffectiveVariant);

        session.StartBeat(1);
        Assert.Equal(ValleyVariant.DoctrineDeep, session.Variant);
        Assert.Equal(ValleyVariant.DoctrineDeep, session.EffectiveVariant);
    }

    [Fact]
    public void IdenticalInputStreamsRemainDeterministic() {
        var first = new SimulationSession(1);
        var second = new SimulationSession(1);
        first.Begin();
        second.Begin();

        for (int tick = 0; tick < 900; tick++) {
            if (tick == 0) FeedBoth(first, second, GKey.ThrottleUp, true);
            if (tick == 90) FeedBoth(first, second, GKey.PullUp, true);
            if (tick == 260) FeedBoth(first, second, GKey.RollRight, true);
            if (tick == 390) FeedBoth(first, second, GKey.RollRight, false);
            if (tick == 430) FeedBoth(first, second, GKey.PullUp, false);
            if (tick == 600) FeedBoth(first, second, GKey.ThrottleUp, false);
            if (tick == 650) FeedBoth(first, second, GKey.Trigger, true);
            if (tick == 710) FeedBoth(first, second, GKey.Trigger, false);
            first.StepFixed();
            second.StepFixed();
        }

        Assert.Equal(first.TimeMilliseconds, second.TimeMilliseconds);
        Assert.Equal(first.Tick, second.Tick);
        Assert.Equal(first.Player.State, second.Player.State);
        Assert.Equal(first.Bandit.State, second.Bandit.State);
        Assert.Equal(first.Controls.Command, second.Controls.Command);
        Assert.Equal(first.PlayerFuel.FuelLb, second.PlayerFuel.FuelLb);
        Assert.Equal(first.PlayerGun.AmmoRemaining, second.PlayerGun.AmmoRemaining);
        Assert.Equal(first.PlayerGun.RoundsInFlight, second.PlayerGun.RoundsInFlight);
        Assert.Equal(first.OpponentGun.AmmoRemaining, second.OpponentGun.AmmoRemaining);
        Assert.Equal(first.OpponentGun.HitCount, second.OpponentGun.HitCount);
        Assert.Equal(first.OpponentGun.RoundsInFlight, second.OpponentGun.RoundsInFlight);
        Assert.Equal(first.KillCount, second.KillCount);
        Assert.Equal(first.Outcome, second.Outcome);
        Assert.Equal(first.RecentEvents, second.RecentEvents);
        Assert.Equal(first.Carrier, second.Carrier);
    }

    [Fact]
    public void CarrierInputStreamsRemainDeterministic() {
        var first = new SimulationSession(5, Carrier.DeckConfiguration.Angled);
        var second = new SimulationSession(5, Carrier.DeckConfiguration.Angled);
        first.Begin();
        second.Begin();

        for (int tick = 0; tick < 1_200; tick++) {
            if (tick == 0) FeedBoth(first, second, GKey.ThrottleUp, true);
            if (tick == 40) FeedBoth(first, second, GKey.PullUp, true);
            if (tick == 320) FeedBoth(first, second, GKey.RollLeft, true);
            if (tick == 430) FeedBoth(first, second, GKey.RollLeft, false);
            if (tick == 520) FeedBoth(first, second, GKey.PullUp, false);
            if (tick == 700) FeedBoth(first, second, GKey.ThrottleUp, false);
            if (tick == 760) FeedBoth(first, second, GKey.Trigger, true);
            if (tick == 820) FeedBoth(first, second, GKey.Trigger, false);
            first.StepFixed();
            second.StepFixed();
        }

        Carrier firstCarrier = first.Carrier!;
        Carrier secondCarrier = second.Carrier!;
        Assert.Equal(first.Lifecycle, second.Lifecycle);
        Assert.Equal(first.TimeMilliseconds, second.TimeMilliseconds);
        Assert.Equal(first.Tick, second.Tick);
        Assert.Equal(first.Player.State, second.Player.State);
        Assert.Equal(first.Bandit.State, second.Bandit.State);
        Assert.Equal(firstCarrier.Position, secondCarrier.Position);
        Assert.Equal(firstCarrier.DeckPitchRad, secondCarrier.DeckPitchRad);
        Assert.Equal(firstCarrier.DeckHeaveM, secondCarrier.DeckHeaveM);
        Assert.Equal(firstCarrier.DeckVerticalVelocityMps,
            secondCarrier.DeckVerticalVelocityMps);
        Assert.Equal(first.Difficulty, second.Difficulty);
        Assert.Equal(first.Recovery, second.Recovery);
        Assert.Equal(first.Touchdown, second.Touchdown);
        Assert.Equal(first.Arrestment.Phase, second.Arrestment.Phase);
        Assert.Equal(first.Catapult.Phase, second.Catapult.Phase);
        Assert.Equal(first.RecoveryProgress.AttemptCount,
            second.RecoveryProgress.AttemptCount);
        Assert.Equal(first.RecoveryProgress.CleanTrapCount,
            second.RecoveryProgress.CleanTrapCount);
        Assert.Equal(first.RecoveryProgress.RecentSetbacks,
            second.RecoveryProgress.RecentSetbacks);
        Assert.Equal(first.PlayerFuel.FuelLb, second.PlayerFuel.FuelLb);
        Assert.Equal(first.PlayerGun.AmmoRemaining, second.PlayerGun.AmmoRemaining);
        Assert.Equal(first.PlayerGun.RoundsFired, second.PlayerGun.RoundsFired);
        Assert.Equal(first.PlayerGun.RoundsInFlight, second.PlayerGun.RoundsInFlight);
        Assert.Equal(first.OpponentGun.AmmoRemaining, second.OpponentGun.AmmoRemaining);
        Assert.Equal(first.OpponentGun.HitCount, second.OpponentGun.HitCount);
        Assert.Equal(first.OpponentGun.RoundsInFlight, second.OpponentGun.RoundsInFlight);
        Assert.Equal(first.Outcome, second.Outcome);
        Assert.Equal(first.RecentEvents, second.RecentEvents);
    }

    [Fact]
    public void ReadyGliderPublishesItsEngineLessThrottleStop() {
        var session = new SimulationSession(4);

        Assert.Equal(SimulationSession.LifecycleState.Ready, session.Lifecycle);
        Assert.Equal(0.0, session.Beat.PlayerAir.MaxThrustFraction);
        Assert.Equal(0.0, session.Controls.Throttle);
        Assert.Equal(0.0, session.Controls.Command.Throttle);
    }

    [Fact]
    public void TerminalVictoryDoesNotReplaceTheOpponentOrResetTheGun() {
        var session = new SimulationSession(3);
        long firstBanditSpawn = session.BanditSpawnSequence;
        session.Begin();
        session.FeedKey(GKey.Trigger, true);

        bool sawResolvingSplash = false;
        for (int i = 0; i < (SimulationSession.TerminalSimulationLimitSeconds + 20.0)
            * AircraftSim.TickHz
            && session.Lifecycle != SimulationSession.LifecycleState.Finished; i++) {
            session.StepFixed();
            sawResolvingSplash |= session.SplashCueActive;
        }

        Assert.Equal(1, session.KillCount);
        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
        Assert.Equal(SortieOutcome.Victory, session.Outcome);
        Assert.True(session.PlayerGun.HasInfiniteAmmo);
        Assert.Equal(GunKill.DefaultAmmo, session.PlayerGun.AmmoRemaining);
        Assert.True(session.PlayerGun.RoundsFired > 0);
        Assert.Equal(FightOutcome.Splash, session.PlayerGun.Outcome);
        Assert.False(session.PlayerGun.TargetAlive);
        Assert.Equal(firstBanditSpawn, session.BanditSpawnSequence);
        Assert.True(sawResolvingSplash,
            "a kill must acknowledge splash while physical impact is still resolving");
        Assert.False(session.SplashCueActive);
    }

    [Fact]
    public void AlignedArmedOpponentFiresButOffAxisOpponentDoesNot() {
        var aligned = TailAttackSession();
        aligned.Begin();
        for (int i = 0; i < 12; i++) aligned.StepFixed();

        Assert.Equal(SimulationSession.LifecycleState.Active, aligned.Lifecycle);
        Assert.True(aligned.OpponentGun.RoundsFired > 0);
        Assert.True(aligned.OpponentGun.AmmoRemaining < 20);
        Assert.True(aligned.OpponentTriggerDown);

        AircraftState player = CombatState(0.0, 3000.0, 0.0, 170.0);
        AircraftState offAxis = CombatState(300.0, 3000.0, 0.0, 170.0);
        var offAxisSession = new SimulationSession();
        offAxisSession.StartBeat(() => TestFight(player, offAxis,
            new CombatConfig(PlayerAmmo: 20, OpponentAmmo: 20)));
        offAxisSession.Begin();
        for (int i = 0; i < 60; i++) offAxisSession.StepFixed();

        Assert.Equal(0, offAxisSession.OpponentGun.RoundsFired);
        Assert.Equal(20, offAxisSession.OpponentGun.AmmoRemaining);
        Assert.False(offAxisSession.OpponentTriggerDown);
    }

    [Fact]
    public void BalloonTargetIsExplicitlyUnarmedAndGliderHasFiftyRounds() {
        var session = new SimulationSession(4);

        Assert.Equal(50, session.Beat.CombatRules.PlayerAmmo);
        Assert.Equal(0, session.Beat.CombatRules.OpponentAmmo);
        Assert.Equal(50, session.PlayerGun.AmmoRemaining);
        Assert.Equal(0, session.OpponentGun.AmmoRemaining);
        Assert.Equal(FuelConfig.EngineLess, session.Beat.FuelLoadout);
        Assert.Equal(0.0, session.PlayerFuel.CapacityLb);
        Assert.Equal(0.0, session.PlayerFuel.FuelLb);
        Assert.False(session.PlayerFuel.ConsumesFuel);
        Assert.False(session.PlayerFuel.IsBingo);
        Assert.False(session.PlayerFuel.RtbAdvisory);

        session.Begin();
        for (int i = 0; i < 2 * AircraftSim.TickHz; i++) session.StepFixed();

        Assert.Equal(0, session.OpponentGun.RoundsFired);
        Assert.Empty(session.OpponentGun.RoundsInFlight);
        Assert.Equal(0.0, session.PlayerFuel.FuelLb);
        Assert.Equal(0.0, session.PlayerFuel.BurnLbPerMinute);
        Assert.Equal(0.0, session.PlayerFuel.FuelTrendLbPerMinute);
        Assert.False(session.PlayerFuel.IsBingo);
        Assert.False(session.PlayerFuel.RtbAdvisory);
    }

    [Fact]
    public void BuiltInDogfightStagesAtMilWithEngagementFuelAndBriefCue() {
        var session = new SimulationSession(1);

        Assert.Equal(FuelConfig.FighterEngagement, session.Beat.FuelLoadout);
        Assert.Equal(FuelModel.DefaultFuelLb, session.PlayerFuel.CapacityLb);
        Assert.Equal(1800.0, session.PlayerFuel.FuelLb);
        Assert.Equal(FuelModel.BingoFuelLb, session.PlayerFuel.BingoThresholdLb);
        Assert.True(session.PlayerFuel.ConsumesFuel);
        Assert.Equal(1.0, session.Controls.Throttle, precision: 12);
        Assert.Equal(1.0, session.Player.ThrustFraction, precision: 12);
        Assert.True(session.Player.LastEngineOperatingPoint.Running);

        session.Begin();
        Assert.Equal("MIL SET · FIGHT", session.TransitionCue);
        session.StepFixed();

        Assert.True(session.PlayerFuel.FuelLb < 1800.0);
        Assert.True(session.PlayerFuel.BurnLbPerMinute > 0.0);
        Assert.False(session.PlayerFuel.IsBingo);
        Assert.False(session.PlayerFuel.RtbAdvisory);
    }

    [Fact]
    public void F35CCarrierConversionKeepsItsExplicitFuelAndApproachPower() {
        var session = new SimulationSession(5);

        Assert.Equal(new FuelConfig(
            CapacityLb: 19750.0,
            InitialFuelLb: 9000.0,
            BingoThresholdLb: 3000.0,
            ConsumesFuel: true), session.Beat.FuelLoadout);
        Assert.Equal(9000.0, session.PlayerFuel.FuelLb);
        Assert.Equal(0.82, session.Controls.Throttle, precision: 12);
    }

    [Fact]
    public void MaintenanceKeepsItsOwnFullFuelAndApproachPower() {
        var session = new SimulationSession(6);

        Assert.Equal(FuelConfig.PoweredJet, session.Beat.FuelLoadout);
        Assert.Equal(FuelModel.DefaultFuelLb, session.PlayerFuel.FuelLb);
        Assert.Equal(0.85, session.Controls.Throttle, precision: 12);
    }

    [Fact]
    public void WaterImpactSettlesBeforeFinishAndRestartRebuildsFuel() {
        var loadout = new FuelConfig(
            CapacityLb: 120.0,
            InitialFuelLb: 73.0,
            BingoThresholdLb: 15.0,
            ConsumesFuel: true);
        AircraftState crashed = CombatState(0.0, -1.0, 0.0, 90.0);
        AircraftState opponent = CombatState(0.0, 1200.0, 1000.0, 130.0);
        var session = new SimulationSession();
        session.StartBeat(() => TestFight(crashed, opponent,
            new CombatConfig(PlayerAmmo: 0, OpponentAmmo: 0), loadout));
        long stagedSpawn = session.PlayerSpawnSequence;

        session.Begin();
        session.StepFixed();

        Assert.Equal(stagedSpawn, session.PlayerSpawnSequence);
        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
        Assert.Equal(AircraftTerminalState.Impacted, session.PlayerTerminalState);
        Assert.Equal(ImpactSurface.Water, session.PlayerImpactSurface);
        Assert.Contains(session.RecentEvents, e => e.Type == SessionEventType.Impact
            && e.Surface == ImpactSurface.Water);
        Assert.DoesNotContain(session.RecentEvents,
            e => e.Type == SessionEventType.SortieFinished);
        Assert.Equal(120.0, session.PlayerFuel.CapacityLb);
        Assert.True(session.PlayerFuel.FuelLb < 73.0);
        Assert.Equal(15.0, session.PlayerFuel.BingoThresholdLb);
        Assert.True(session.PlayerFuel.ConsumesFuel);

        FuelModel lostAircraftFuel = session.PlayerFuel;
        RunUntilFinished(session);

        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
        Assert.Equal(AircraftTerminalState.Settled, session.PlayerTerminalState);
        Assert.Equal(SortieOutcome.Defeat, session.Outcome);
        Assert.Equal(SessionEventType.SortieFinished, session.RecentEvents[^1].Type);
        Assert.DoesNotContain(session.RecentEvents,
            e => e.Type == SessionEventType.TerminalLimitReached);

        session.Restart();

        Assert.NotSame(lostAircraftFuel, session.PlayerFuel);
        Assert.True(session.PlayerSpawnSequence > stagedSpawn);
        Assert.Equal(120.0, session.PlayerFuel.CapacityLb);
        Assert.Equal(73.0, session.PlayerFuel.FuelLb);
        Assert.Equal(15.0, session.PlayerFuel.BingoThresholdLb);
        Assert.True(session.PlayerFuel.ConsumesFuel);
        Assert.False(session.PlayerFuel.IsBingo);
        Assert.False(session.PlayerFuel.RtbAdvisory);
    }

    [Fact]
    public void BuiltInBeatUsesExplicitTerrainForGroundImpactTruth() {
        var terrain = new BilinearHeightGrid(-10_000.0, -10_000.0,
            10_000.0, 10_000.0,
            new double[,]
            {
                { 4_000.0, 4_000.0, 4_000.0 },
                { 4_000.0, 4_000.0, 4_000.0 },
                { 4_000.0, 4_000.0, 4_000.0 }
            });
        var session = new SimulationSession();
        session.StartBeatWithTerrain(1, terrain);

        Assert.Same(terrain, session.Terrain);
        session.Begin();
        session.StepFixed();

        Assert.Equal(AircraftTerminalState.Impacted, session.PlayerTerminalState);
        Assert.Equal(ImpactSurface.Ground, session.PlayerImpactSurface);
        Assert.Contains(session.RecentEvents, e => e.Type == SessionEventType.Impact
            && e.Target == CombatRole.Player && e.Surface == ImpactSurface.Ground);
    }

    [Fact]
    public void TerrainCanBeReanchoredWithoutRestagingTheActiveSortie() {
        var initialTerrain = new BilinearHeightGrid(-10_000.0, -10_000.0,
            10_000.0, 10_000.0,
            new double[,]
            {
                { 0.0, 0.0, 0.0 },
                { 0.0, 0.0, 0.0 },
                { 0.0, 0.0, 0.0 }
            });
        var reanchoredTerrain = new BilinearHeightGrid(-10_000.0, -10_000.0,
            10_000.0, 10_000.0,
            new double[,]
            {
                { 4_000.0, 4_000.0, 4_000.0 },
                { 4_000.0, 4_000.0, 4_000.0 },
                { 4_000.0, 4_000.0, 4_000.0 }
            });
        var session = new SimulationSession();
        session.StartBeatWithTerrain(1, initialTerrain);
        long playerSpawn = session.PlayerSpawnSequence;
        session.Begin();

        session.SetTerrainSurface(reanchoredTerrain);
        session.StepFixed();

        Assert.Same(reanchoredTerrain, session.Terrain);
        Assert.Equal(playerSpawn, session.PlayerSpawnSequence);
        Assert.Equal(AircraftTerminalState.Impacted, session.PlayerTerminalState);
        Assert.Equal(ImpactSurface.Ground, session.PlayerImpactSurface);
    }

    [Fact]
    public void CarrierSortieGroundWreckRemainsOnTerrainInsteadOfFallingToSea() {
        var terrain = new BilinearHeightGrid(-10_000.0, -10_000.0,
            10_000.0, 10_000.0,
            new double[,]
            {
                { 150.0, 150.0, 150.0 },
                { 150.0, 150.0, 150.0 },
                { 150.0, 150.0, 150.0 }
            });
        var session = new SimulationSession();
        session.StartBeatWithTerrain(5, terrain);
        session.Begin();

        for (int tick = 0; tick < 20 * AircraftSim.TickHz
            && session.PlayerTerminalState != AircraftTerminalState.Settled; tick++) {
            session.StepFixed();
        }

        Assert.Equal(AircraftTerminalState.Settled, session.PlayerTerminalState);
        Assert.Equal(ImpactSurface.Ground, session.PlayerImpactSurface);
        Assert.True(session.Player.State.Position.Y >= 149.9,
            $"ground wreck fell below terrain: {session.Player.State.Position.Y:F2} m");
        Assert.DoesNotContain(session.RecentEvents, e => e.Type == SessionEventType.Impact
            && e.Target == CombatRole.Player && e.Surface == ImpactSurface.Water);
    }

    [Fact]
    public void OpponentDamageFallsImpactsSettlesThenFreezesUntilRestart() {
        var session = TailAttackSession();
        long initialPlayerSpawn = session.PlayerSpawnSequence;
        session.Begin();

        for (int i = 0; i < 5 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying; i++)
            session.StepFixed();

        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
        Assert.Equal(AircraftTerminalState.DestroyedAirborne,
            session.PlayerTerminalState);
        Assert.Equal(SortieOutcome.None, session.Outcome);
        Assert.Equal(SortieOutcome.Defeat, session.PendingOutcome);
        Assert.Equal(FightOutcome.Splash, session.OpponentGun.Outcome);
        Assert.Equal(0.0, session.OpponentGun.TargetHealth, 12);
        Assert.Contains(session.RecentEvents, e => e.Type == SessionEventType.Hit
            && e.Source == CombatRole.Opponent && e.Target == CombatRole.Player);
        Assert.Contains(session.RecentEvents, e => e.Type == SessionEventType.Destroyed
            && e.Source == CombatRole.Opponent && e.Target == CombatRole.Player);
        Assert.DoesNotContain(session.RecentEvents,
            e => e.Type == SessionEventType.SortieFinished);

        AircraftState destroyedPlayer = session.Player.State;
        for (int i = 0; i < 2 * AircraftSim.TickHz; i++) session.StepFixed();
        Assert.NotEqual(destroyedPlayer.Position, session.Player.State.Position);
        Assert.True(session.Player.State.Position.Y < destroyedPlayer.Position.Y,
            $"damaged flight did not descend: {destroyedPlayer.Position.Y:F1} -> "
            + $"{session.Player.State.Position.Y:F1} m");

        RunUntilFinished(session);
        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
        Assert.Equal(SortieOutcome.Defeat, session.Outcome);
        SessionEvent impact = Assert.Single(session.RecentEvents,
            e => e.Type == SessionEventType.Impact
                && e.Target == CombatRole.Player);
        SessionEvent settled = Assert.Single(session.RecentEvents,
            e => e.Type == SessionEventType.Settled
                && e.Target == CombatRole.Player);
        SessionEvent finished = Assert.Single(session.RecentEvents,
            e => e.Type == SessionEventType.SortieFinished);
        Assert.True(impact.Sequence > session.RecentEvents.Single(
            e => e.Type == SessionEventType.Destroyed
                && e.Target == CombatRole.Player).Sequence);
        Assert.True(settled.Sequence > impact.Sequence);
        Assert.True(finished.Sequence > settled.Sequence);
        Assert.Equal(ImpactSurface.Water, impact.Surface);
        Assert.Equal(SortieOutcome.Defeat, finished.Outcome);
        Assert.DoesNotContain(session.RecentEvents,
            e => e.Type == SessionEventType.TerminalLimitReached);

        double finishedTime = session.TimeSeconds;
        long finishedTick = session.Tick;
        AircraftState finishedPlayer = session.Player.State;
        AircraftState finishedOpponent = session.Bandit.State;
        int finishedAmmo = session.OpponentGun.AmmoRemaining;
        SessionEvent[] finishedEvents = session.RecentEvents.ToArray();
        session.FeedKey(GKey.PullUp, true);
        session.Advance(20.0);
        session.StepFixed();

        Assert.Equal(finishedTime, session.TimeSeconds);
        Assert.Equal(finishedTick, session.Tick);
        Assert.Equal(finishedPlayer, session.Player.State);
        Assert.Equal(finishedOpponent, session.Bandit.State);
        Assert.Equal(finishedAmmo, session.OpponentGun.AmmoRemaining);
        Assert.Equal(finishedEvents, session.RecentEvents);

        long lastEventSequence = finishedEvents[^1].Sequence;
        session.Restart();
        Assert.Equal(SimulationSession.LifecycleState.Ready, session.Lifecycle);
        Assert.Equal(SortieOutcome.None, session.Outcome);
        Assert.Empty(session.RecentEvents);
        Assert.True(session.PlayerSpawnSequence > initialPlayerSpawn);

        session.Begin();
        RunUntilFinished(session);
        Assert.Equal(SortieOutcome.Defeat, session.Outcome);
        Assert.True(session.RecentEvents[0].Sequence > lastEventSequence);
    }

    [Fact]
    public void TerminalGuardReportsUnresolvedStateWithoutFakeSettledEvent() {
        // Keep staging inside the standard-atmosphere constructor used by the rail bandit. Both
        // aircraft start on the same steep ballistic path, with the bandit 160 m directly astern;
        // the explicit unbounded near-vacuum weather is applied before the first tick. The failed
        // airframe therefore remains airborne with residual motion at the 180-second guard.
        const double altitudeM = 70_000.0;
        const double gamma = 1.2;
        const double speedMps = 1_000.0;
        var flightDirection = new Vec3D(0.0, Math.Sin(gamma), Math.Cos(gamma));
        var bodyRight = new Vec3D(1.0, 0.0, 0.0);
        var bodyUp = flightDirection.Cross(bodyRight);
        var attitude = QuaternionD.FromFrame(bodyRight, bodyUp, flightDirection);
        var playerPosition = new Vec3D(0.0, altitudeM, 0.0);
        AircraftState player = new(playerPosition, speedMps, gamma, 0.0, 0.0,
            FlightModel.Sabre.MassKg, BodyAttitude: attitude);
        AircraftState opponent = new(playerPosition - flightDirection * 160.0,
            speedMps, gamma, 0.0, 0.0, FlightModel.Sabre.MassKg,
            BodyAttitude: attitude);
        var weather = new WeatherProfile(new UnboundedTestAtmosphere(),
            new CalmTestWind());
        var session = new SimulationSession(weather: weather);
        session.StartBeat(() => TestFight(player, opponent,
            new CombatConfig(PlayerAmmo: 0, OpponentAmmo: 20,
                PlayerHitsToDefeat: 1, OpponentHitsToDefeat: 99)));
        session.Begin();

        for (int i = 0; i < 10 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying; i++)
            session.StepFixed();
        Assert.Equal(AircraftTerminalState.DestroyedAirborne,
            session.PlayerTerminalState);

        RunUntilFinished(session,
            SimulationSession.TerminalSimulationLimitSeconds + 20.0);

        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
        Assert.Equal(AircraftTerminalState.SimulationBounded,
            session.PlayerTerminalState);
        Assert.Equal(ImpactSurface.SimulationBoundary, session.PlayerImpactSurface);
        Assert.True(session.Player.State.Position.Y > 0.0,
            "fixture must remain physically unresolved at the numerical guard");
        Assert.True(session.Player.State.Speed > 0.0,
            "the bounded state must retain residual motion");
        SessionEvent boundary = Assert.Single(session.RecentEvents,
            e => e.Type == SessionEventType.TerminalLimitReached
                && e.Target == CombatRole.Player);
        SessionEvent finished = Assert.Single(session.RecentEvents,
            e => e.Type == SessionEventType.SortieFinished);
        Assert.True(boundary.Sequence < finished.Sequence);
        Assert.DoesNotContain(session.RecentEvents,
            e => e.Type == SessionEventType.Settled
                && e.Target == CombatRole.Player);
    }

    [Fact]
    public void SameTickMutualDestructionProducesOrderedDrawEvents() {
        AircraftState player = CombatState(0.0, 3000.0, -90.0, 170.0, 0.0);
        AircraftState opponent = CombatState(0.0, 3000.0, 90.0, 170.0, Math.PI);
        var session = new SimulationSession();
        session.StartBeat(() => TestFight(player, opponent,
            new CombatConfig(PlayerAmmo: 20, OpponentAmmo: 20,
                PlayerHitsToDefeat: 2, OpponentHitsToDefeat: 2)));
        session.Begin();
        session.FeedKey(GKey.Trigger, true);

        RunUntilFinished(session);

        Assert.Equal(SortieOutcome.Draw, session.Outcome);
        Assert.Equal(1, session.KillCount);
        Assert.Equal(FightOutcome.Splash, session.PlayerGun.Outcome);
        Assert.Equal(FightOutcome.Splash, session.OpponentGun.Outcome);
        long destructionTick = session.RecentEvents.First(
            e => e.Type == SessionEventType.Destroyed).Tick;
        SessionEvent[] destruction = session.RecentEvents
            .Where(e => e.Tick == destructionTick
                && e.Type is SessionEventType.Hit or SessionEventType.Destroyed)
            .ToArray();
        Assert.Collection(destruction,
            e => Assert.Equal((SessionEventType.Hit, CombatRole.Player, CombatRole.Opponent),
                (e.Type, e.Source, e.Target)),
            e => Assert.Equal((SessionEventType.Hit, CombatRole.Opponent, CombatRole.Player),
                (e.Type, e.Source, e.Target)),
            e => Assert.Equal((SessionEventType.Destroyed, CombatRole.Player, CombatRole.Opponent),
                (e.Type, e.Source, e.Target)),
            e => Assert.Equal((SessionEventType.Destroyed, CombatRole.Opponent, CombatRole.Player),
                (e.Type, e.Source, e.Target)));
        SessionEvent finished = Assert.Single(session.RecentEvents,
            e => e.Type == SessionEventType.SortieFinished);
        Assert.Equal(SortieOutcome.Draw, finished.Outcome);
        Assert.True(session.RecentEvents.Where(e => e.Type == SessionEventType.Settled)
            .All(e => e.Sequence < finished.Sequence));
        Assert.True(session.RecentEvents.Zip(session.RecentEvents.Skip(1),
            (a, b) => b.Sequence > a.Sequence).All(inOrder => inOrder));
    }

    [Fact]
    public void CatchUpAdvanceRetainsDestructionThenPhysicalTicksContinue() {
        AircraftState player = CombatState(0.0, 3000.0, 0.0, 170.0);
        AircraftState opponent = CombatState(0.0, 3000.0, 40.0, 170.0);
        var session = new SimulationSession();
        session.StartBeat(() => TestFight(player, opponent,
            new CombatConfig(PlayerAmmo: 20, OpponentAmmo: 0,
                PlayerHitsToDefeat: 4, OpponentHitsToDefeat: 2)));
        session.Begin();
        session.FeedKey(GKey.Trigger, true);

        session.Advance(0.25);

        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
        Assert.Equal(SortieOutcome.None, session.Outcome);
        Assert.Equal(SortieOutcome.Victory, session.PendingOutcome);
        Assert.Equal(AircraftTerminalState.DestroyedAirborne,
            session.OpponentTerminalState);
        Assert.True(session.Tick <= 0.25 / SimulationSession.FixedDeltaSeconds);
        Assert.Equal(session.Tick * SimulationSession.FixedDeltaSeconds,
            session.TimeSeconds, precision: 12);
        Assert.Contains(session.RecentEvents, e => e.Type == SessionEventType.Hit);
        Assert.Contains(session.RecentEvents, e => e.Type == SessionEventType.Destroyed);
        Assert.DoesNotContain(session.RecentEvents,
            e => e.Type == SessionEventType.SortieFinished);

        RunUntilFinished(session);
        Assert.Equal(SortieOutcome.Victory, session.Outcome);
        Assert.Equal(SessionEventType.SortieFinished, session.RecentEvents[^1].Type);
    }

    [Fact]
    public void RecentEventStreamIsBoundedWithoutResettingMonotonicSequence() {
        AircraftState player = CombatState(0.0, 3000.0, 0.0, 170.0);
        AircraftState opponent = CombatState(0.0, 3000.0, 40.0, 170.0);
        var session = new SimulationSession();
        session.StartBeat(() => TestFight(player, opponent,
            new CombatConfig(PlayerAmmo: 100, OpponentAmmo: 0,
                PlayerHitsToDefeat: 4, OpponentHitsToDefeat: 70)));
        session.Begin();
        session.FeedKey(GKey.Trigger, true);

        RunUntilFinished(session);

        Assert.Equal(SortieOutcome.Victory, session.Outcome);
        Assert.Equal(SimulationSession.RecentEventCapacity, session.RecentEvents.Count);
        Assert.True(session.RecentEvents[0].Sequence > 1,
            "old events must be evicted instead of resetting the sequence epoch");
        Assert.True(session.RecentEvents.Zip(session.RecentEvents.Skip(1),
            (a, b) => b.Sequence > a.Sequence).All(inOrder => inOrder));
        Assert.Equal(SessionEventType.SortieFinished, session.RecentEvents[^1].Type);
    }

    [Fact]
    public void ProductionCarrierSessionCanFirewallPullAndFlyAway() {
        var session = new SimulationSession(5);
        double initialAltitude = session.Player.State.Position.Y;
        Assert.True(session.Carrier!.InApproachSlot(session.Player.State));

        session.Begin();
        session.FeedKey(GKey.ThrottleUp, true);
        session.FeedKey(GKey.PullUp, true);
        for (int i = 0; i < 14 * AircraftSim.TickHz; i++) session.StepFixed();

        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
        Assert.Equal(Carrier.Recovery.Flying, session.Recovery);
        Assert.False(session.Controls.ApproachMode);
        Assert.True(session.Player.State.Position.Y > initialAltitude + 60.0,
            $"fly-away only climbed {session.Player.State.Position.Y - initialAltitude:F1} m");
    }

    static void FeedBoth(SimulationSession first, SimulationSession second,
        GKey key, bool pressed) {
        first.FeedKey(key, pressed);
        second.FeedKey(key, pressed);
    }
}
