using GunsOnly.Sim.Okanagan;

namespace GunsOnly.Sim.Tests.Okanagan;

public sealed class OkanaganFireMissionTests
{
    [Fact]
    public void AllThreeSortiesBeginAtKelownaWithADepartureRoute()
    {
        foreach (OkanaganSortieType sortie in Enum.GetValues<OkanaganSortieType>())
        {
            OkanaganMissionSnapshot state = OkanaganFireMission.Create(sortie).Snapshot();
            Assert.Equal(OkanaganMissionPhase.Depart, state.Phase);
            Assert.Equal(FireBossSurfaceMode.Runway, state.Aircraft.SurfaceMode);
            Assert.Equal("DEPART 16", state.Route[0].Label);
            Assert.True(OkanaganGeo.IsOverKelownaRunway(state.Aircraft.PositionWorldM));
        }
    }

    [Fact]
    public void KelownaToLakeLegIsLongerThanOneMinuteAtMissionCruise()
    {
        OkanaganMissionSnapshot state = OkanaganFireMission
            .Create(OkanaganSortieType.WaterCircuits).Snapshot();
        double distanceM = (state.Route[^1].PositionWorldM - state.Aircraft.PositionWorldM).Length;

        Assert.True(distanceM / 62.0 > 60.0,
            $"Kelowna-to-lake leg was only {distanceM / 62.0:F1} seconds at mission cruise");
    }

    [Fact]
    public void SoloAttackHasNoConvenientSupportTraffic()
    {
        OkanaganMissionSnapshot solo = OkanaganFireMission
            .Create(OkanaganSortieType.FireAttack).Snapshot();
        OkanaganMissionSnapshot largeForce = OkanaganFireMission
            .Create(OkanaganSortieType.LargeForceEmployment).Snapshot();

        Assert.Empty(solo.Traffic);
        Assert.Contains(largeForce.Traffic, track => track.Kind == "AIR ATTACK");
        Assert.Contains(largeForce.Traffic, track => track.Kind == "HELICOPTER");
        OkanaganTrafficTrack helicopter = Assert.Single(
            largeForce.Traffic,
            track => track.Kind == "HELICOPTER");
        Assert.True(
            helicopter.PositionWorldM.Y
                - OkanaganCdem.SampleSurfaceHeightM(helicopter.PositionWorldM) >= 160.0,
            "HELCO must orbit above the rendered incident terrain");
    }

    [Fact]
    public void WaterAppliedOnTheFictionalWestFlankReducesFireIntensity()
    {
        var fire = new OkanaganFireGrid();
        fire.Step(1.0);
        double before = fire.TotalIntensity;
        Vec3D target = OkanaganGeo.ToWorld(49.850, -119.655, 810.0);
        double credited = fire.ApplyWater(target, 1_000.0);
        fire.Step(0.5);

        Assert.True(credited > 0.0);
        Assert.True(fire.TotalIntensity < before);
        Assert.True(fire.EffectiveWaterKg > 0.0);
    }

    [Fact]
    public void LocalProjectionRoundTripsTheAirport()
    {
        Vec3D airport = OkanaganGeo.ToWorld(49.9561, -119.3778, 433.0);
        (double latitude, double longitude) = OkanaganGeo.ToGeographic(airport);
        Assert.Equal(49.9561, latitude, precision: 6);
        Assert.Equal(-119.3778, longitude, precision: 6);
    }

    [Fact]
    public void CollisionLakeMatchesTheAuthoredScoopAndKeepsTheFireOnLand()
    {
        Assert.True(OkanaganGeo.IsOverCentralLake(
            OkanaganGeo.ToWorld(49.825, -119.565, 342.0)));
        Assert.True(OkanaganGeo.IsOverCentralLake(
            OkanaganGeo.ToWorld(49.875, -119.515, 342.0)));
        Assert.False(OkanaganGeo.IsOverCentralLake(
            OkanaganGeo.ToWorld(49.850, -119.655, 810.0)));
    }

    [Fact]
    public void OperationalLakeRunwayAndFireShareTheCommittedCdem()
    {
        Vec3D scoopExit = OkanaganGeo.ToWorld(49.875, -119.515, 0.0);
        Assert.InRange(OkanaganCdem.SampleRawHeightM(scoopExit), 300.0, 400.0);
        Assert.Equal(342.0, OkanaganCdem.SampleSurfaceHeightM(scoopExit), precision: 6);

        Vec3D runwayThreshold = OkanaganGeo.ToWorld(49.9670, -119.3778, 0.0);
        Assert.Equal(433.0, OkanaganCdem.SampleSurfaceHeightM(runwayThreshold), precision: 6);

        var fire = new OkanaganFireGrid();
        foreach (OkanaganFireCellSnapshot cell in fire.ActiveCells()) {
            Vec3D point = new(cell.X, 0.0, cell.Z);
            Assert.Equal(OkanaganCdem.SampleSurfaceHeightM(point), cell.Y, precision: 6);
        }
    }

    [Fact]
    public void ReserveMarginForcesImmediateReturnWithoutWaitingForADrop()
    {
        OkanaganFireMission mission = OkanaganFireMission.Create(
            OkanaganSortieType.FireAttack, initialFuelKg: 300.0);
        mission.Step(new FireBossPilotCommand(0, 0, 0, 0.65, false, false));

        Assert.Equal(OkanaganMissionPhase.Rtb, mission.Snapshot().Phase);
        Assert.Equal("rtb-crossing", mission.Snapshot().Route[0].Id);
    }

    [Theory]
    [InlineData(0, OkanaganMissionPhase.JoinScoop)]
    [InlineData(1, OkanaganMissionPhase.Rtb)]
    [InlineData(2, OkanaganMissionPhase.Rtb)]
    public void WaterCircuitContractReturnsAfterTheFirstCreditedCycle(
        int completedCycles,
        OkanaganMissionPhase expected)
    {
        Assert.Equal(expected, OkanaganFireMission.NextWaterCircuitPhase(completedCycles));
    }

    [Fact]
    public void WaterCircuitCompletionPolicyRejectsImpossibleNegativeCounts()
    {
        Assert.Throws<ArgumentOutOfRangeException>(
            () => OkanaganFireMission.NextWaterCircuitPhase(-1));
    }

    [Fact]
    public void RunwaySixteenRecoveryApproachesTheNorthThresholdFromTheNorthWest()
    {
        Vec3D northThreshold = OkanaganGeo.ToWorld(
            49.9670, -119.3778, OkanaganGeo.KelownaRunwayElevationM);

        Assert.Equal(northThreshold, OkanaganFireMission.AirportThreshold);
        Assert.InRange(HeadingDeg(
            OkanaganFireMission.AirportInitial,
            OkanaganFireMission.AirportFinal), 155.0, 165.0);
        Assert.InRange(HeadingDeg(
            OkanaganFireMission.AirportFinal,
            OkanaganFireMission.AirportThreshold), 155.0, 165.0);
        Assert.True(OkanaganFireMission.AirportInitial.Y
            > OkanaganFireMission.AirportFinal.Y);
        Assert.True(OkanaganFireMission.AirportFinal.Y
            > OkanaganFireMission.AirportThreshold.Y);
    }

    [Fact]
    public void WaterCircuitUsesTheNearKelownaLakeAndRemovesTheDeadTransit()
    {
        Vec3D start = OkanaganGeo.ToWorld(
            49.9670, -119.3778, OkanaganGeo.KelownaRunwayElevationM);
        Vec3D[] nominalPath = [
            start,
            OkanaganFireMission.RunwayDeparture,
            OkanaganFireMission.AirportDeparture,
            OkanaganFireMission.ScoopEntry,
            OkanaganFireMission.ScoopTouchdown,
            OkanaganFireMission.ScoopExit,
            OkanaganFireMission.CircuitCrosswind,
            OkanaganFireMission.CircuitDownwind,
            OkanaganFireMission.TrainingDrop,
            OkanaganFireMission.RtbCrossing,
            OkanaganFireMission.AirportInitial,
            OkanaganFireMission.AirportFinal,
            OkanaganFireMission.AirportThreshold,
        ];
        double distanceM = nominalPath.Zip(nominalPath.Skip(1), HorizontalDistance).Sum();

        Assert.InRange(distanceM, 32_000.0, 35_000.0);
        Assert.InRange(distanceM / 55.0 / 60.0, 9.5, 10.75);
        Assert.All(new[] {
            OkanaganFireMission.ScoopEntry,
            OkanaganFireMission.ScoopTouchdown,
            OkanaganFireMission.ScoopExit,
            OkanaganFireMission.CircuitDownwind,
            OkanaganFireMission.TrainingDrop,
        }, point => Assert.True(OkanaganGeo.IsOverCentralLake(point),
            $"authored water-circuit point {point} left Okanagan Lake"));
        Assert.False(OkanaganGeo.IsOverCentralLake(OkanaganFireMission.RtbCrossing));
        Assert.InRange(HorizontalDistance(
            OkanaganFireMission.AirportDeparture,
            OkanaganFireMission.ScoopEntry), 6_500.0, 7_250.0);
    }

    [Fact]
    public void FiniteTrainingDropPointsAtRtbInsteadOfAdvertisingASecondScoop()
    {
        OkanaganRouteGate[] waterCircuit = OkanaganFireMission
            .Create(OkanaganSortieType.WaterCircuits)
            .RouteFor(OkanaganMissionPhase.Downwind)
            .ToArray();
        OkanaganRouteGate[] fireAttack = OkanaganFireMission
            .Create(OkanaganSortieType.FireAttack)
            .RouteFor(OkanaganMissionPhase.Downwind)
            .ToArray();

        Assert.Equal(new[] { "downwind-entry", "training-drop", "circuit-exit" },
            waterCircuit.Select(gate => gate.Id));
        Assert.Equal(OkanaganFireMission.RtbCrossing,
            waterCircuit[^1].PositionWorldM);
        Assert.DoesNotContain(waterCircuit,
            gate => gate.Id == "base-turn" || gate.PositionWorldM == OkanaganFireMission.ScoopEntry);
        Assert.Equal("base-turn", fireAttack[^1].Id);
        Assert.Contains("RTB", OkanaganFireMission.RadioCallFor(
            OkanaganSortieType.WaterCircuits, OkanaganMissionPhase.Downwind));
        Assert.True(OkanaganFireMission.RadioCallFor(
            OkanaganSortieType.FireAttack, OkanaganMissionPhase.Downwind)
            .Contains("scoop", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void TransientRadioCallsStayBelowTheOutsideViewDensityBudget()
    {
        foreach (OkanaganSortieType sortie in Enum.GetValues<OkanaganSortieType>())
        foreach (OkanaganMissionPhase phase in Enum.GetValues<OkanaganMissionPhase>())
        {
            string call = OkanaganFireMission.RadioCallFor(sortie, phase);
            int words = call.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
            Assert.True(words <= 9,
                $"{sortie}/{phase} radio has {words} words: {call}");
            Assert.True(call.Length <= 54,
                $"{sortie}/{phase} radio has {call.Length} characters: {call}");
        }
    }

    static double HeadingDeg(in Vec3D from, in Vec3D to)
    {
        double degrees = Math.Atan2(to.X - from.X, to.Z - from.Z) * 180.0 / Math.PI;
        return (degrees + 360.0) % 360.0;
    }

    static double HorizontalDistance(Vec3D from, Vec3D to) => Math.Sqrt(
        Math.Pow(to.X - from.X, 2.0)
            + Math.Pow(to.Z - from.Z, 2.0));
}
