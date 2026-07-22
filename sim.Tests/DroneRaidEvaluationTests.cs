using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class DroneRaidEvaluationTests {
    const double AltitudeM = 2200.0;

    static AircraftState State(double x, double z, double speed = 115.0,
        double heading = Math.PI) => new(
        new Vec3D(x, AltitudeM, z), speed, 0.0, heading, 0.0, 500.0);

    static DroneRaidScenarioDefinition Definition(int targets = 2) => new(
        defendedPoint: Vec3D.Zero,
        defendedRadiusM: 750.0,
        targets: Enumerable.Range(0, targets)
            .Select(index => State(index * 500.0, 8000.0)));

    [Fact]
    public void MissionEightOwnsStableEraCapabilityAndStagedRaidContracts() {
        BeatSetup beat = Beats.DroneRaidDefense();
        var session = new SimulationSession(8);

        Assert.Equal("mission.korea-2030s.drone-raid-defence.prototype.v1",
            beat.MissionIdentity.Id);
        Assert.Equal(MissionContentFamily.Korea2030sPrototype,
            beat.MissionIdentity.ContentFamily);
        Assert.True(beat.MissionIdentity.PublicDataSurrogate);
        Assert.Equal("KOREA_2030S_PROXY", beat.MissionIdentity.Era);
        Assert.Equal("GUNS_ONLY_DEFENSIVE_INTERCEPT",
            beat.MissionIdentity.RulesOfEngagement);
        Assert.Equal("aircraft.f22a.public-data-surrogate.v1",
            beat.PlayerAircraft.Id);
        Assert.Equal("aircraft.one-way-attack-drone.prototype.v1",
            beat.BanditAircraft.Id);
        Assert.Equal(DroneRaidScenarioDefinition.ResolutionMode,
            "STAGED_STREAM_MISSION_KILL");
        Assert.Equal(4, beat.DroneRaid!.Targets.Count);
        Assert.Equal(480, session.PlayerGun.AmmoRemaining);
        Assert.Equal("gun.m61a2.public-data-surrogate.v1",
            session.PlayerGun.Profile.Id);
        Assert.Equal(0, session.OpponentGun.AmmoRemaining);
        Assert.Equal(5500.0, session.PlayerFuel.JokerThresholdLb);
        Assert.Equal(3500.0, session.PlayerFuel.BingoThresholdLb);
        Assert.Equal(2100.0, session.PlayerFuel.MinimumFuelThresholdLb);
        Assert.Equal(1200.0, session.PlayerFuel.EmergencyFuelThresholdLb);
        Assert.NotNull(session.DroneRaidEvaluation);
        Assert.False(session.DroneRaidEvaluation!.Started);

        session.Begin();

        Assert.True(session.DroneRaidEvaluation.Started);
        Assert.Equal(1, session.DroneRaidEvaluation.ActiveTargetNumber);
        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
    }

    [Fact]
    public void ScoreRewardsZeroLeakersFastNeutralizationAndShortBursts() {
        var evaluation = new DroneRaidEvaluation(Definition());
        evaluation.Begin(timeSeconds: 100.0, cumulativeRoundsFired: 0);

        evaluation.RecordNeutralized(timeSeconds: 112.0, cumulativeRoundsFired: 12);
        evaluation.RecordNeutralized(timeSeconds: 126.0, cumulativeRoundsFired: 30);

        Assert.True(evaluation.Finished);
        Assert.True(evaluation.ZeroLeakers);
        Assert.Equal(2, evaluation.Kills);
        Assert.Equal(0, evaluation.Leakers);
        Assert.Equal(13.0, evaluation.AverageTimeToNeutralizeSeconds, 8);
        Assert.Equal(15.0, evaluation.RoundsPerKill, 8);
        Assert.Equal(60, evaluation.ContainmentScore);
        Assert.Equal(25, evaluation.TimeScore);
        Assert.Equal(15, evaluation.FireDisciplineScore);
        Assert.Equal(100, evaluation.Score);
        Assert.Equal("RAID DEFEATED · ZERO LEAKERS", evaluation.Cue);
    }

    [Fact]
    public void ALeakerCostsContainmentPointsAndWastedRoundsRemainInDisciplineMetric() {
        var evaluation = new DroneRaidEvaluation(Definition());
        evaluation.Begin(timeSeconds: 0.0, cumulativeRoundsFired: 0);

        evaluation.RecordLeaked(timeSeconds: 40.0, cumulativeRoundsFired: 35);
        evaluation.RecordNeutralized(timeSeconds: 60.0, cumulativeRoundsFired: 70);

        Assert.True(evaluation.Finished);
        Assert.False(evaluation.ZeroLeakers);
        Assert.Equal(1, evaluation.Kills);
        Assert.Equal(1, evaluation.Leakers);
        Assert.Equal(70.0, evaluation.RoundsPerKill, 8);
        Assert.Equal(20, evaluation.ContainmentScore);
        Assert.InRange(evaluation.FireDisciplineScore, 0, 3);
        Assert.True(evaluation.Score < 60);
    }

    [Fact]
    public void OwnshipLossCountsEveryUnresolvedRaiderAndCannotEarnZeroLeakerBonus() {
        var evaluation = new DroneRaidEvaluation(Definition());
        evaluation.Begin(timeSeconds: 0.0, cumulativeRoundsFired: 0);
        evaluation.RecordNeutralized(timeSeconds: 12.0, cumulativeRoundsFired: 12);

        evaluation.RecordOwnshipLost(timeSeconds: 18.0, cumulativeRoundsFired: 15);

        Assert.True(evaluation.Finished);
        Assert.True(evaluation.OwnshipLost);
        Assert.False(evaluation.ZeroLeakers);
        Assert.Equal(1, evaluation.Kills);
        Assert.Equal(1, evaluation.Leakers);
        Assert.Equal(evaluation.TotalTargets, evaluation.TargetsResolved);
        Assert.Equal(20, evaluation.ContainmentScore);
        Assert.DoesNotContain("ZERO LEAKERS", evaluation.Cue);
    }

    [Fact]
    public void GeometryCueIdentifiesTailChaseAndComputesTimeToDefendedRing() {
        var evaluation = new DroneRaidEvaluation(Definition(targets: 1));
        evaluation.Begin(timeSeconds: 0.0, cumulativeRoundsFired: 0);
        AircraftState target = State(0.0, 4000.0, speed: 100.0);
        AircraftState player = State(0.0, 5200.0, speed: 180.0);

        evaluation.Step(1.0, player, target,
            gunSolution: false, cumulativeRoundsFired: 0);

        Assert.True(evaluation.TailChaseGeometry);
        Assert.Equal(32.5, evaluation.TargetTimeToLeakSeconds, 8);
        Assert.Equal("STOP TAIL CHASE · CUT INSIDE THE RAID TRACK", evaluation.Cue);
    }

    [Fact]
    public void RetargetingAfterALeakerPreservesMagazineEvidenceButDropsOldRounds() {
        var gun = new GunKill(ammo: 20, hitsToKill: 2);
        AircraftState own = new(new Vec3D(0.0, AltitudeM, 0.0),
            200.0, 0.0, 0.0, 0.0, 1000.0);
        AircraftState distant = new(new Vec3D(0.0, AltitudeM, 2000.0),
            100.0, 0.0, 0.0, 0.0, 500.0);
        gun.Step(true, own, distant, 0.1);

        GunKill next = gun.CreateForRetargetedTarget();

        Assert.Equal(gun.AmmoRemaining, next.AmmoRemaining);
        Assert.Equal(gun.RoundsFired, next.RoundsFired);
        Assert.NotEmpty(gun.RoundsInFlight);
        Assert.Empty(next.RoundsInFlight);
        Assert.Equal(FightOutcome.Flying, next.Outcome);
    }

    [Fact]
    public void PhysicalProjectileKillAdvancesTheAuthoritativeStagedTarget() {
        AircraftState player = new(new Vec3D(0.0, AltitudeM, 0.0),
            200.0, 0.0, 0.0, 0.0, FlightModel.Sabre.MassKg);
        AircraftState first = new(new Vec3D(0.0, AltitudeM, 260.0),
            100.0, 0.0, 0.0, 0.0, 500.0);
        AircraftState second = first with {
            Position = new Vec3D(0.0, AltitudeM, 2200.0)
        };
        var definition = new DroneRaidScenarioDefinition(
            defendedPoint: new Vec3D(0.0, 0.0, 10000.0),
            defendedRadiusM: 100.0,
            targets: new[] { first, second });
        BeatSetup setup = new("Close-range staged raid", player, first,
            new GunsSaddleLaw(),
            new() { (0.0, new PilotCommand(1.0, 0.0, 0.8, 0.0)) },
            Combat: new CombatConfig(
                PlayerAmmo: 30,
                OpponentAmmo: 0,
                PlayerHitsToDefeat: 1,
                OpponentHitsToDefeat: 1),
            DroneRaid: definition);
        var session = new SimulationSession();
        session.StartBeat(() => setup);
        long firstSpawnSequence = session.BanditSpawnSequence;
        session.Begin();
        session.FeedKey(GKey.Trigger, true);

        for (int tick = 0; tick < 2 * AircraftSim.TickHz
            && session.KillCount == 0; tick++) session.StepFixed();

        Assert.Equal(1, session.KillCount);
        Assert.Equal(1, session.DroneRaidEvaluation!.Kills);
        Assert.Equal(2, session.DroneRaidEvaluation.ActiveTargetNumber);
        Assert.Equal(firstSpawnSequence + 1, session.BanditSpawnSequence);
        Assert.Equal(second.Position, session.Bandit.State.Position);
        Assert.Equal(FightOutcome.Flying, session.PlayerGun.Outcome);
        Assert.Equal(0, session.PlayerGun.HitCount);
        Assert.Empty(session.PlayerGun.RoundsInFlight);
        Assert.True(session.PlayerGun.RoundsFired > 0);
        Assert.True(session.OpponentBodyPresent);
        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
    }

    [Fact]
    public void UnopposedRaidEventuallyProducesFourObservableLeakersAndDefeat() {
        var session = new SimulationSession(8);
        long initialSpawnSequence = session.BanditSpawnSequence;
        session.Begin();

        for (int tick = 0; tick < 6 * 60 * AircraftSim.TickHz
            && session.Lifecycle == SimulationSession.LifecycleState.Active; tick++)
            session.StepFixed();

        DroneRaidEvaluation evaluation = session.DroneRaidEvaluation!;
        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
        Assert.Equal(SortieOutcome.Defeat, session.Outcome);
        Assert.True(evaluation.Finished);
        Assert.Equal(0, evaluation.Kills);
        Assert.Equal(4, evaluation.Leakers);
        Assert.Equal(initialSpawnSequence + 3, session.BanditSpawnSequence);
        Assert.False(session.OpponentBodyPresent);
        Assert.Contains(session.RecentEvents,
            entry => entry.Type == SessionEventType.RaidTargetLeaked);
        Assert.Equal(SessionEventType.SortieFinished,
            session.RecentEvents[^1].Type);
    }
}
