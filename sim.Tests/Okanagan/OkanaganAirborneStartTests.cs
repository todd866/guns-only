using System.Text.Json;
using GunsOnly.Sim.Okanagan;

namespace GunsOnly.Sim.Tests.Okanagan;

public sealed class OkanaganAirborneStartTests
{
    public static IEnumerable<object[]> DefenceSorties => new[] {
        OkanaganSortieType.PeachlandDefence, OkanaganSortieType.BigWhiteDefence,
        OkanaganSortieType.SilverStarDefence, OkanaganSortieType.ApexDefence,
    }.Select(sortie => new object[] { sortie });

    [Theory]
    [MemberData(nameof(DefenceSorties))]
    public void PlayerStartsLoadedAndAlignedWhileFullSortieStillStartsAtKelowna(OkanaganSortieType sortie)
    {
        var mission = OkanaganFireMission.CreateForPlayer(sortie);
        var state = mission.Snapshot();
        var aircraft = state.Aircraft;
        Assert.Equal(OkanaganMissionPhase.Ingress, state.Phase);
        Assert.Equal(FireBossSurfaceMode.Airborne, aircraft.SurfaceMode);
        Assert.True(aircraft.Flyable);
        Assert.InRange(aircraft.TrueAirspeedMps, 57, 59);
        Assert.InRange(aircraft.WaterLoadKg, 800, FireBossDynamics.MaximumWaterKg);
        Assert.Equal(FireBossDynamics.EmptyOperatingMassKg + aircraft.FuelKg + aircraft.WaterLoadKg,
            aircraft.GrossMassKg, 8);
        Assert.True(aircraft.GrossMassKg <= mission.PerformancePlan.MaximumGrossMassKg + 1e-6);
        Assert.Equal(aircraft.WaterLoadKg * .85, state.DropTargetWaterKg, 8);
        Assert.Equal(aircraft.Throttle, aircraft.EnginePowerFraction, 8);
        Assert.Equal(aircraft.FuelKg, state.FuelPlan.BlockFuelKg);
        Assert.Equal(0, state.FuelPlan.TaxiOutKg);
        Assert.InRange(state.FuelPlan.OutboundTripKg, 10, 20);
        Assert.Equal(FireBossFuelPlan.FinalReserveKg, state.FuelPlan.FinalReserveKg);
        Assert.Equal(state.FuelPlan.ReturnTripKg + state.FuelPlan.OperationalReserveKg
            + state.FuelPlan.FinalReserveKg + state.FuelPlan.TaxiInKg, state.FuelPlan.MinimumRtbFuelKg, 8);
        Assert.True(aircraft.PositionWorldM.Y - OkanaganCdem.SampleSurfaceHeightM(aircraft.PositionWorldM) >= 250);
        Assert.InRange(HorizontalDistance(aircraft.PositionWorldM, state.DropAimWorldM) / aircraft.TrueAirspeedMps, 80, 115);
        var direction = (state.DropAimWorldM - aircraft.PositionWorldM) with { Y = 0 };
        double heading = Math.Atan2(direction.X, direction.Z);
        Assert.InRange(Math.Abs(Math.Atan2(Math.Sin(heading - aircraft.HeadingRad),
            Math.Cos(heading - aircraft.HeadingRad))), 0, 1e-8);

        var full = OkanaganFireMission.Create(sortie).Snapshot();
        Assert.Equal(OkanaganMissionPhase.Depart, full.Phase);
        Assert.Equal(FireBossSurfaceMode.Runway, full.Aircraft.SurfaceMode);
        Assert.Equal(0, full.Aircraft.WaterLoadKg);
        Assert.Equal(FireBossFuelPlan.TaxiOutKg, full.FuelPlan.TaxiOutKg);
    }

    [Fact]
    public void WaterPracticeKeepsItsPhysicalTakeoffAndScoopTraining()
    {
        var state = OkanaganFireMission.CreateForPlayer(OkanaganSortieType.WaterCircuits).Snapshot();
        Assert.Equal(OkanaganMissionPhase.Depart, state.Phase);
        Assert.Equal(FireBossSurfaceMode.Runway, state.Aircraft.SurfaceMode);
        Assert.Equal(0, state.Aircraft.WaterLoadKg);
    }

    [Theory]
    [MemberData(nameof(DefenceSorties))]
    public void LoadedSpawnIsInitiallyFlyableWithNeutralControls(OkanaganSortieType sortie)
    {
        var mission = OkanaganFireMission.CreateForPlayer(sortie);
        var initial = mission.Snapshot();
        var command = new FireBossPilotCommand(0, 0, 0, initial.Aircraft.Throttle, false, false);
        for (int tick = 0; tick < 5 / FireBossDynamics.FixedDeltaSeconds; tick++) mission.Step(command);
        var state = mission.Snapshot();
        Assert.True(state.Aircraft.Flyable);
        Assert.Equal(FireBossSurfaceMode.Airborne, state.Aircraft.SurfaceMode);
        Assert.InRange(state.Aircraft.TrueAirspeedMps, 50, 65);
        Assert.InRange(Math.Abs(state.Aircraft.PositionWorldM.Y - initial.Aircraft.PositionWorldM.Y), 0, 30);
        Assert.Equal(initial.Aircraft.WaterLoadKg, state.Aircraft.WaterLoadKg);
        Assert.Equal(600, mission.Aircraft.AirbornePhysicsSteps);
    }

    [Theory]
    [MemberData(nameof(DefenceSorties))]
    public void RealAircraftReachesUsefulDropWithinTwoMinutesAndCompletesSafeHandoff(OkanaganSortieType sortie)
    {
        var mission = OkanaganFireMission.CreateForPlayer(sortie);
        var pilot = new OkanaganTestPilot(mission.Aircraft.InitialElevatorTrim);
        var initial = mission.Snapshot();
        var command = new FireBossPilotCommand(0, 0, 0, initial.Aircraft.Throttle, false, false);
        double? firstDrop = null;
        double minimumClearance = double.PositiveInfinity;
        var samples = new List<object>();
        for (int tick = 0; tick < 420 / FireBossDynamics.FixedDeltaSeconds; tick++)
        {
            var state = mission.Snapshot();
            minimumClearance = Math.Min(minimumClearance, state.Aircraft.PositionWorldM.Y
                - OkanaganCdem.SampleSurfaceHeightM(state.Aircraft.PositionWorldM));
            if (state.DropCreditKg > 0 || state.Sites.Any(site => site.ProtectedByDrop)) firstDrop ??= state.MissionSeconds;
            if (tick % 120 == 0) samples.Add(new { state.MissionSeconds, state.Phase, state.ActiveGateIndex,
                state.Aircraft.PositionWorldM, state.Aircraft.TrueAirspeedMps, state.Aircraft.VerticalSpeedMps,
                state.Aircraft.WaterLoadKg, state.EffectiveDrops, state.EffectiveWaterKg, state.Cue });
            if (state.Phase is OkanaganMissionPhase.Complete or OkanaganMissionPhase.Failed) break;
            if (tick % 12 == 0) command = pilot.Command(state,
                mission.Aircraft.SharedAircraft.LastEngineOperatingPoint.NetThrustN,
                mission.RecommendsShallowLoadedClimb());
            mission.Step(command);
        }
        var final = mission.Snapshot();
        string diagnostic = $"{sortie}: {final.Phase} at {final.MissionSeconds:F1}s, first drop {firstDrop}, "
            + $"gate {final.ActiveGateIndex}/{final.Route.Count}, {final.Aircraft.PositionWorldM}, "
            + $"water {final.Aircraft.WaterLoadKg:F1}, effective {final.EffectiveDrops}, clearance {minimumClearance:F1}";
        string? directory = System.Environment.GetEnvironmentVariable("GUNS_OKANAGAN_FLIGHT_OUTPUT");
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
            File.WriteAllText(Path.Combine(directory, $"airborne-{sortie}.json"), JsonSerializer.Serialize(new {
                diagnostic, firstDrop, minimumClearance, samples, final.Sites, final.IncidentHandedOff }));
        }
        Assert.True(firstDrop is >= 60 and <= 120, diagnostic);
        Assert.Equal(1, final.EffectiveDrops);
        Assert.Equal(1, final.CompletedCycles);
        Assert.True(final.Sites.Count(site => site.ProtectedByDrop) >= 3, diagnostic);
        Assert.True(final.Phase == OkanaganMissionPhase.Complete, diagnostic);
        Assert.True(final.Aircraft.Flyable && final.IncidentHandedOff, diagnostic);
        Assert.True(final.MissionSeconds < 360, diagnostic);
        Assert.True(minimumClearance >= 40, diagnostic);
        Assert.True(HorizontalDistance(final.Aircraft.PositionWorldM, final.DropAimWorldM) > 3_200, diagnostic);
        Assert.True(final.Aircraft.PositionWorldM.Y
            - OkanaganCdem.SampleSurfaceHeightM(final.Aircraft.PositionWorldM) >= 200, diagnostic);
        Assert.True(final.Aircraft.FuelKg > final.FuelPlan.MinimumRtbFuelKg, diagnostic);
    }

    [Fact]
    public void FuelAbortCannotCompleteAnUnworkedDefenceMission()
    {
        var mission = OkanaganFireMission.CreateForPlayer(OkanaganSortieType.BigWhiteDefence, 300);
        var initial = mission.Snapshot();
        mission.Step(new(0, 0, 0, initial.Aircraft.Throttle, false, false));
        var state = mission.Snapshot();
        Assert.Equal(OkanaganMissionPhase.Rtb, state.Phase);
        Assert.Equal(0, state.EffectiveDrops);
        Assert.Equal(0, state.CompletedCycles);
        Assert.False(state.IncidentHandedOff);
    }

    [Theory]
    [InlineData(OkanaganSortieType.BigWhiteDefence, true)]
    [InlineData(OkanaganSortieType.BigWhiteDefence, false)]
    [InlineData(OkanaganSortieType.PeachlandDefence, false)]
    [InlineData(OkanaganSortieType.SilverStarDefence, false)]
    [InlineData(OkanaganSortieType.ApexDefence, false)]
    public void RealMissedReleaseOrEarlyDumpEndsInSafeFailure(OkanaganSortieType sortie, bool dumpBeforeReachingFire)
    {
        var mission = OkanaganFireMission.CreateForPlayer(sortie);
        var pilot = new OkanaganTestPilot(mission.Aircraft.InitialElevatorTrim);
        FireBossPilotCommand command = default;
        double minimumClearance = double.PositiveInfinity;
        for (int tick = 0; tick < 420 / FireBossDynamics.FixedDeltaSeconds; tick++)
        {
            if (tick % 12 == 0)
            {
                var state = mission.Snapshot();
                minimumClearance = Math.Min(minimumClearance, state.Aircraft.PositionWorldM.Y
                    - OkanaganCdem.SampleSurfaceHeightM(state.Aircraft.PositionWorldM));
                if (state.Phase is OkanaganMissionPhase.Complete or OkanaganMissionPhase.Failed) break;
                command = pilot.Command(state, mission.Aircraft.SharedAircraft.LastEngineOperatingPoint.NetThrustN,
                    mission.RecommendsShallowLoadedClimb()) with {
                    DropRequested = dumpBeforeReachingFire && state.MissionSeconds < 3,
                };
            }
            mission.Step(command);
        }
        var final = mission.Snapshot();
        string diagnostic = $"{sortie}, early dump={dumpBeforeReachingFire}: {final.Phase}, {final.MissionSeconds:F1}s, "
            + $"gate {final.ActiveGateIndex}/{final.Route.Count}, clearance {minimumClearance:F1}m, "
            + $"water {final.Aircraft.WaterLoadKg:F1}kg, {final.Aircraft.PositionWorldM}";
        Assert.True(final.Phase == OkanaganMissionPhase.Failed, diagnostic);
        Assert.True(final.Aircraft.Flyable && final.IncidentHandedOff, diagnostic);
        Assert.True(final.MissionSeconds < 360, diagnostic);
        Assert.True(minimumClearance >= 40, diagnostic);
        Assert.Equal(0, final.EffectiveDrops);
        Assert.DoesNotContain(final.Sites, site => site.ProtectedByDrop);
        Assert.Contains("Defence line missed", final.Objective);
        string? directory = System.Environment.GetEnvironmentVariable("GUNS_OKANAGAN_FLIGHT_OUTPUT");
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
            File.WriteAllText(Path.Combine(directory, $"airborne-missed-{sortie}-{dumpBeforeReachingFire}.json"),
                JsonSerializer.Serialize(new { diagnostic, minimumClearance, final.MissionSeconds,
                    final.Aircraft.WaterLoadKg, final.EffectiveDrops, final.IncidentHandedOff }));
        }
    }

    [Fact]
    public void AbortedRecoveryLifecycleDoesNotAwardSuccessfulDefence()
    {
        // Lifecycle coverage only. The tests above prove escape reachability by flying;
        // this observed recovery checks that landing cannot turn an abort into success.
        var mission = OkanaganFireMission.CreateForPlayer(OkanaganSortieType.BigWhiteDefence, 300);
        var telemetry = mission.Snapshot().Aircraft;
        mission.Step(new(0, 0, 0, telemetry.Throttle, false, false));
        for (int tick = 0; tick < 100 && mission.Phase == OkanaganMissionPhase.Rtb; tick++)
        {
            var state = mission.Snapshot();
            var gate = state.Route[Math.Min(state.ActiveGateIndex, state.Route.Count - 1)];
            mission.ObserveFlight(telemetry with { PositionWorldM = gate.PositionWorldM });
        }
        Assert.Equal(OkanaganMissionPhase.Approach, mission.Phase);
        mission.ObserveFlight(telemetry with { PositionWorldM = OkanaganFireMission.AirportThreshold,
            SurfaceMode = FireBossSurfaceMode.Runway, TrueAirspeedMps = 0 });
        var final = mission.Snapshot();
        Assert.Equal(OkanaganMissionPhase.Failed, final.Phase);
        Assert.Equal(0, final.EffectiveDrops);
        Assert.Equal(0, final.CompletedCycles);
        Assert.False(final.IncidentHandedOff);
        Assert.Equal("Aircraft recovered — defence run unfinished", final.Objective);
    }

    static double HorizontalDistance(Vec3D a, Vec3D b) =>
        Math.Sqrt(Math.Pow(a.X - b.X, 2) + Math.Pow(a.Z - b.Z, 2));
}
