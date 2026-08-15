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
            OkanaganGeo.ToWorld(49.825, -119.580, 342.0)));
        Assert.True(OkanaganGeo.IsOverCentralLake(
            OkanaganGeo.ToWorld(49.875, -119.555, 342.0)));
        Assert.False(OkanaganGeo.IsOverCentralLake(
            OkanaganGeo.ToWorld(49.850, -119.655, 810.0)));
    }

    [Fact]
    public void OperationalLakeRunwayAndFireShareTheCommittedCdem()
    {
        Vec3D scoopExit = OkanaganGeo.ToWorld(49.875, -119.555, 0.0);
        Assert.True(OkanaganCdem.SampleRawHeightM(scoopExit) > 400.0);
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
}
