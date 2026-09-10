using GunsOnly.Sim.Okanagan;

namespace GunsOnly.Sim.Tests.Okanagan;

// Coordinator tests deliberately supply telemetry: they establish the load contract, not handling.
public sealed class OkanaganPayloadTargetTests
{
    [Theory]
    [InlineData(20, false)]
    [InlineData(0, true)]
    [InlineData(-1, true)]
    public void HardMinimumEndsCurrentWorkIndependentOfPriorCycles(double margin, bool mustReturn)
        => Assert.Equal(mustReturn, OkanaganFireMission.FuelRequiresReturn(margin));

    [Theory]
    [InlineData(55, false)]
    [InlineData(20, false)]
    [InlineData(56, true)]
    public void JokerProhibitsStartingAnotherCircuit(double margin, bool mayStart)
        => Assert.Equal(mayStart, OkanaganFireMission.FuelAllowsAnotherCircuit(margin));

    [Fact]
    public void CurrentIngressContinuesBelowJokerButAbortsAtHardReturnMinimum()
    {
        var mission = JoinScoop(OkanaganSortieType.ApexDefence, 925);
        Observe(mission, OkanaganFireMission.ScoopTouchdown, 925, 0, FireBossSurfaceMode.Water);
        double load = mission.Snapshot().ScoopTargetWaterKg;
        Observe(mission, OkanaganFireMission.ScoopTouchdown, 925, load, FireBossSurfaceMode.Water);
        var position = mission.Snapshot().Route[^1].PositionWorldM;
        Observe(mission, position, 900, load);
        Assert.Equal(OkanaganMissionPhase.Ingress, mission.Phase);
        double minimum = mission.Snapshot().FuelPlan.MinimumRtbFuelKg;
        Observe(mission, position, minimum + 20, load);
        Assert.Equal(OkanaganMissionPhase.Ingress, mission.Phase);
        Observe(mission, position, minimum, load);
        Assert.Equal(OkanaganMissionPhase.Rtb, mission.Phase);
    }

    [Theory]
    [InlineData(OkanaganSortieType.WaterCircuits)]
    [InlineData(OkanaganSortieType.FireAttack)]
    [InlineData(OkanaganSortieType.PeachlandDefence)]
    public void ClimbAfterPassingTheDepartureTurnCanContinueAlongTheVisibleRoute(OkanaganSortieType sortie)
    {
        var mission = OkanaganFireMission.Create(sortie);
        double fuel = mission.Snapshot().Aircraft.FuelKg;
        Observe(mission, OkanaganFireMission.RunwayDeparture with { Y = 600 }, fuel, 0);
        Observe(mission, OkanaganFireMission.AirportDeparture with { Y = 600 }, fuel, 0);
        Assert.True(mission.ActiveGateIndex >= 2);
        Observe(mission, OkanaganFireMission.ScoopEntry with { Y = 729 }, fuel, 0);
        Assert.Equal(OkanaganMissionPhase.Depart, mission.Phase);
        Observe(mission, OkanaganFireMission.ScoopEntry with { Y = 730 }, fuel, 0);
        Assert.Equal(OkanaganMissionPhase.JoinScoop, mission.Phase);

        var ungated = OkanaganFireMission.Create(sortie);
        Observe(ungated, OkanaganFireMission.ScoopEntry with { Y = 800 }, fuel, 0);
        Assert.Equal(0, ungated.ActiveGateIndex);
        Assert.Equal(OkanaganMissionPhase.Depart, ungated.Phase);
    }

    [Theory]
    [InlineData(OkanaganSortieType.WaterCircuits, 610.0)]
    [InlineData(OkanaganSortieType.FireAttack, 760.0)]
    [InlineData(OkanaganSortieType.PeachlandDefence, 925.0)]
    public void ScoopTargetUsesFuelAtEntryAndDoesNotChaseLaterFuelBurn(OkanaganSortieType sortie, double fuel)
    {
        var mission = JoinScoop(sortie, fuel);
        double target = Math.Min(FireBossDynamics.MaximumGrossMassKg, mission.PerformancePlan.MaximumGrossMassKg)
            - FireBossDynamics.EmptyOperatingMassKg - fuel;
        Assert.True(mission.PerformancePlan.MeetsClimbRequirement);
        Observe(mission, OkanaganFireMission.ScoopTouchdown, fuel, 0, FireBossSurfaceMode.Water);
        Assert.Equal(target, mission.Snapshot().ScoopTargetWaterKg, 8);
        Assert.True(target < 2800, "this fixture must expose the old unreachable 2,800 kg gate");

        Observe(mission, OkanaganFireMission.ScoopTouchdown, fuel - 20, target - 2, FireBossSurfaceMode.Water);
        Assert.Equal(OkanaganMissionPhase.Scoop, mission.Phase);
        Assert.Equal(target, mission.Snapshot().ScoopTargetWaterKg, 8);
        Assert.Equal(0, mission.Snapshot().DropTargetWaterKg);

        Observe(mission, OkanaganFireMission.ScoopTouchdown, fuel - 20, target, FireBossSurfaceMode.Water);
        Assert.Equal(OkanaganMissionPhase.Climb, mission.Phase);
        Assert.Equal(target * .85, mission.Snapshot().DropTargetWaterKg, 8);
        Assert.Equal(target, mission.Snapshot().ScoopTargetWaterKg, 8);
        Assert.Contains("STEP TO", mission.Snapshot().Cue);
        var rotating = mission.Snapshot().Aircraft with {
            TrueAirspeedMps = OkanaganFireMission.SuggestedWaterRotationSpeedMps(mission.Snapshot().Aircraft) + 1,
        };
        mission.ObserveFlight(rotating);
        Assert.Equal("SCOOPS UP · ROTATE", mission.Snapshot().Cue);
    }

    [Fact]
    public void MountainRoutePlansLessWaterThanLowCircuitAtTheSameFuel()
    {
        var low = JoinScoop(OkanaganSortieType.WaterCircuits, 925);
        var high = JoinScoop(OkanaganSortieType.ApexDefence, 925);
        Observe(low, OkanaganFireMission.ScoopTouchdown, 925, 0, FireBossSurfaceMode.Water);
        Observe(high, OkanaganFireMission.ScoopTouchdown, 925, 0, FireBossSurfaceMode.Water);
        Assert.True(high.Snapshot().ScoopTargetWaterKg < low.Snapshot().ScoopTargetWaterKg);
        Assert.Equal(925, high.Snapshot().Aircraft.FuelKg);
        Assert.True(high.Snapshot().ScoopTargetWaterKg > 0);
        Assert.True(high.Snapshot().ScoopTargetWaterKg + 925 + FireBossDynamics.EmptyOperatingMassKg
            <= high.PerformancePlan.MaximumGrossMassKg + 1e-6);
    }

    [Fact]
    public void AbortedLoadReleaseAdvisesLakeJettisonWithoutCreditingWork()
    {
        var mission = JoinScoop(OkanaganSortieType.ApexDefence, 925);
        Observe(mission, OkanaganFireMission.ScoopTouchdown, 925, 0, FireBossSurfaceMode.Water);
        double load = mission.Snapshot().ScoopTargetWaterKg;
        Observe(mission, OkanaganFireMission.ScoopTouchdown, 925, load, FireBossSurfaceMode.Water);
        var lake = OkanaganFireMission.ScoopEntry with { Y = 900 };
        Observe(mission, lake, 200, load);
        Assert.Equal(OkanaganMissionPhase.Rtb, mission.Phase);
        Assert.Equal("RTB · RELEASE LOAD OVER LAKE", mission.Snapshot().Cue);

        var pilot = new OkanaganTestPilot(mission.Aircraft.InitialElevatorTrim);
        var state = mission.Snapshot();
        Assert.True(pilot.Command(state, 0, false).DropRequested);
        var overLand = state with { Aircraft = state.Aircraft with { PositionWorldM = OkanaganFireMission.AirportInitial } };
        Assert.False(pilot.Command(overLand, 0, false).DropRequested);

        double retained = FireBossDynamics.MaximumLandingMassKg - FireBossDynamics.EmptyOperatingMassKg - 200;
        Observe(mission, lake, 200, retained, released:load - retained);
        Assert.False(OkanaganFireMission.NeedsRecoveryLoadRelease(mission.Phase, mission.Snapshot().Aircraft));
        Assert.Equal(0, mission.CompletedCycles);
        Assert.Equal(0, mission.Snapshot().EffectiveWaterKg);
    }

    [Fact]
    public void ShallowLoadedHoldAdviceWaitsForTerrainClearEstablishedClimb()
    {
        var mission = JoinScoop(OkanaganSortieType.ApexDefence, 925);
        Observe(mission, OkanaganFireMission.ScoopTouchdown, 925, 0, FireBossSurfaceMode.Water);
        double load = mission.Snapshot().ScoopTargetWaterKg;
        Observe(mission, OkanaganFireMission.ScoopTouchdown, 925, load, FireBossSurfaceMode.Water);
        var liftoff = mission.Snapshot().Route[0].PositionWorldM;
        Observe(mission, liftoff, 900, load);
        var gate = mission.Snapshot().Route[mission.ActiveGateIndex];
        Assert.Equal("lake-climb", gate.Id);
        Observe(mission, gate.PositionWorldM with { Y = 900 }, 900, load);
        Assert.False(mission.RecommendsShallowLoadedClimb());
        Observe(mission, gate.PositionWorldM with { Y = gate.PositionWorldM.Y - 90 }, 900, load);
        Assert.True(mission.RecommendsShallowLoadedClimb());
        Assert.Equal("CLIMB · SHALLOW TURNS WITH LOAD", mission.Snapshot().Cue);
        Observe(mission, (gate.PositionWorldM + new Vec3D(3_000, 0, 0)) with { Y = gate.PositionWorldM.Y - 90 }, 900, load);
        Assert.False(mission.RecommendsShallowLoadedClimb());
    }

    [Fact]
    public void EarlyMountainAbortReturnsFromActualPositionInsteadOfVisitingTheFire()
    {
        var mission = JoinScoop(OkanaganSortieType.ApexDefence, 925);
        Observe(mission, OkanaganFireMission.ScoopTouchdown, 925, 0, FireBossSurfaceMode.Water);
        double load = mission.Snapshot().ScoopTargetWaterKg;
        Observe(mission, OkanaganFireMission.ScoopTouchdown, 925, load, FireBossSurfaceMode.Water);
        Observe(mission, mission.Snapshot().Route[^1].PositionWorldM, 900, load);
        Assert.Equal(OkanaganMissionPhase.Ingress, mission.Phase);
        Assert.False(mission.Snapshot().IncidentActive);

        // Reproduced outbound abort position, still tens of kilometres before the incident.
        var abort = new Vec3D(-21_653, 2450, -32_662);
        Observe(mission, abort, 400, load);
        Assert.Equal(OkanaganMissionPhase.Rtb, mission.Phase);
        var route = mission.Snapshot().Route.ToArray();
        Assert.DoesNotContain(route, gate => gate.Id == "sector-exit");
        Assert.Equal("escape-climb", route[0].Id);
        Assert.Equal(abort.X, route[0].PositionWorldM.X);
        Assert.Equal(abort.Z, route[0].PositionWorldM.Z);
        Assert.True(route[0].PositionWorldM.Y >= abort.Y);
        int lake = Array.FindIndex(route, gate => gate.Id == "lake-return");
        Assert.True(lake > 0);
        for (int i = 1; i <= lake; i++)
        for (int j = 0; j <= 50; j++)
        {
            Vec3D a = route[i - 1].PositionWorldM, b = route[i].PositionWorldM;
            Vec3D point = a + (b - a) * (j / 50.0);
            Assert.True(point.Y - OkanaganCdem.SampleSurfaceHeightM(point) >= 250,
                $"Early return corridor loses terrain margin: {point}");
        }
        Observe(mission, abort + new Vec3D(100, 0, 100), 399, load);
        Assert.Equal(route[0], mission.Snapshot().Route[0]);
    }

    [Fact]
    public void TargetIncludesRetainedWaterAndZeroAllowanceCannotCompleteAScoop()
    {
        var mission = JoinScoop(OkanaganSortieType.WaterCircuits, 610);
        Observe(mission, OkanaganFireMission.ScoopTouchdown, 610, 200, FireBossSurfaceMode.Water);
        Assert.Equal(FireBossDynamics.MaximumGrossMassKg - FireBossDynamics.EmptyOperatingMassKg - 610,
            mission.Snapshot().ScoopTargetWaterKg, 8);

        var overweight = JoinScoop(OkanaganSortieType.WaterCircuits, 610);
        var flight = overweight.Snapshot().Aircraft with {
            PositionWorldM = OkanaganFireMission.ScoopTouchdown, SurfaceMode = FireBossSurfaceMode.Water,
            GrossMassKg = FireBossDynamics.MaximumGrossMassKg + 10,
        };
        overweight.ObserveFlight(flight);
        Assert.Equal(0, overweight.Snapshot().ScoopTargetWaterKg);
        Assert.Equal(OkanaganMissionPhase.Scoop, overweight.Phase);
        Assert.Equal(0, overweight.Snapshot().DropTargetWaterKg);
    }

    [Fact]
    public void DeliveryMustReachCapturedFractionOfAcquiredLoad()
    {
        var mission = JoinScoop(OkanaganSortieType.WaterCircuits, 610);
        Observe(mission, OkanaganFireMission.ScoopTouchdown, 610, 0, FireBossSurfaceMode.Water);
        double load = mission.Snapshot().ScoopTargetWaterKg;
        Observe(mission, OkanaganFireMission.ScoopTouchdown, 610, load, FireBossSurfaceMode.Water);
        Observe(mission, OkanaganFireMission.CircuitDownwind, 610, load);
        Assert.Equal(OkanaganMissionPhase.Downwind, mission.Phase);
        double drop = mission.Snapshot().DropTargetWaterKg;
        Observe(mission, OkanaganFireMission.TrainingDrop, 610, load - drop + 2, released:drop - 2);
        Assert.Equal(OkanaganMissionPhase.Downwind, mission.Phase);
        Assert.Equal(0, mission.CompletedCycles);
        Observe(mission, OkanaganFireMission.TrainingDrop, 610, load - drop, released:2);
        Assert.Equal(OkanaganMissionPhase.Rtb, mission.Phase);
        Assert.Equal(1, mission.CompletedCycles);
    }

    static OkanaganFireMission JoinScoop(OkanaganSortieType sortie, double fuel)
    {
        var mission = OkanaganFireMission.Create(sortie, fuel);
        Observe(mission, OkanaganFireMission.RunwayDeparture, fuel, 0);
        Observe(mission, OkanaganFireMission.AirportDeparture, fuel, 0);
        Assert.Equal(OkanaganMissionPhase.JoinScoop, mission.Phase);
        return mission;
    }

    static void Observe(OkanaganFireMission mission, Vec3D position, double fuel, double water,
        FireBossSurfaceMode surface = FireBossSurfaceMode.Airborne, double released = 0) =>
        mission.ObserveFlight(mission.Snapshot().Aircraft with {
            PositionWorldM = position, SurfaceMode = surface, WaterLoadKg = water, FuelKg = fuel,
            GrossMassKg = FireBossDynamics.EmptyOperatingMassKg + fuel + water,
            WaterReleasedThisTickKg = released,
        });
}
