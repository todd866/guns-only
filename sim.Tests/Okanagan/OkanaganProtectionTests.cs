using GunsOnly.Sim.Okanagan;

namespace GunsOnly.Sim.Tests.Okanagan;

public sealed class OkanaganProtectionTests
{
    [Theory]
    [InlineData(OkanaganSortieType.PeachlandDefence)]
    [InlineData(OkanaganSortieType.BigWhiteDefence)]
    [InlineData(OkanaganSortieType.SilverStarDefence)]
    [InlineData(OkanaganSortieType.ApexDefence)]
    public void CoordinatorCompletesAttackHandoffAndRunwayRecovery(OkanaganSortieType sortie)
    {
        var mission = OkanaganFireMission.Create(sortie);
        var flight = mission.Snapshot().Aircraft;
        void Observe(Vec3D position, FireBossSurfaceMode surface = FireBossSurfaceMode.Airborne,
            double load = 2800, double released = 0, double speed = 58) {
            flight = flight with { PositionWorldM = position, SurfaceMode = surface, WaterLoadKg = load,
                WaterReleasedThisTickKg = released, TrueAirspeedMps = speed };
            mission.ObserveFlight(flight);
        }
        Observe(OkanaganFireMission.AirportDeparture, load:0);
        Assert.Equal(OkanaganMissionPhase.JoinScoop,mission.Phase);
        Observe(OkanaganFireMission.ScoopTouchdown,FireBossSurfaceMode.Water);
        Assert.Equal(OkanaganMissionPhase.Climb,mission.Phase);
        Observe(mission.Snapshot().Route[^1].PositionWorldM);
        Assert.Equal(OkanaganMissionPhase.Ingress,mission.Phase);
        var ingress=mission.Snapshot().Route;
        foreach(var gate in ingress) Observe(gate.PositionWorldM);
        Assert.Equal(OkanaganMissionPhase.Drop,mission.Phase);
        Assert.True(mission.ActiveGateIndex >= ingress.Count-3,"Drop phase must not reset passed ingress gates.");
        Vec3D target=mission.Snapshot().DropAimWorldM;
        for(int i=0;i<240;i++) Observe(target with {Y=target.Y+100},load:2800-i*10,released:10);
        Assert.Equal(OkanaganMissionPhase.Rtb,mission.Phase);
        Assert.Equal(1,mission.CompletedCycles);
        var recovery=mission.Snapshot().Route;
        // A pilot may climb in the safe sector without revisiting the exact release coordinates.
        Observe(recovery[0].PositionWorldM+new Vec3D(1800,0,0),load:400);
        Assert.Equal(1,mission.ActiveGateIndex);
        foreach(var gate in recovery.Skip(1)) Observe(gate.PositionWorldM,load:400);
        Assert.True(mission.Snapshot().IncidentHandedOff);
        Assert.Equal(OkanaganMissionPhase.Approach,mission.Phase);
        Observe(OkanaganFireMission.AirportFinal,load:400);
        Observe(OkanaganFireMission.AirportThreshold,FireBossSurfaceMode.Runway,load:400,speed:0);
        Assert.Equal(OkanaganMissionPhase.Complete,mission.Phase);
        Assert.Equal(OkanaganSortieType.WaterCircuits==sortie,mission.Snapshot().Sites.Count==0);
    }

    [Theory]
    [InlineData(OkanaganSortieType.PeachlandDefence, 400, 1000)]
    [InlineData(OkanaganSortieType.BigWhiteDefence, 1650, 1900)]
    [InlineData(OkanaganSortieType.SilverStarDefence, 1500, 1800)]
    [InlineData(OkanaganSortieType.ApexDefence, 1500, 1800)]
    public void DefenceSectorsUseMappedSitesAndRealMountainHeights(OkanaganSortieType sortie, double low, double high)
    {
        var incident = OkanaganIncident.For(sortie)!;
        Assert.InRange(incident.Centre.Y, low, high);
        Assert.InRange(incident.Sites.Count, 20, 100);
        Assert.Contains(incident.Sites, s => s.Kind is "housing" or "building");
        if (sortie != OkanaganSortieType.PeachlandDefence) Assert.Contains(incident.Sites, s => s.Kind == "lift");
        foreach (var site in incident.Sites) Assert.Equal(OkanaganCdem.SampleSurfaceHeightM(site.Position), site.Position.Y, 6);
        var state = OkanaganFireMission.Create(sortie).Snapshot();
        Assert.False(state.IncidentActive);
        Assert.Equal(925, state.Aircraft.FuelKg);
        Assert.All(state.Sites, s => Assert.Equal("intact", s.Status));
    }

    [Fact]
    public void TransitDoesNotConsumeTheDefenceExerciseBeforeArrival()
    {
        var mission = OkanaganFireMission.Create(OkanaganSortieType.BigWhiteDefence);
        var idle = new FireBossPilotCommand(0,0,0,0,false,false);
        for (int i=0;i<120*60;i++) mission.Step(idle);
        var state=mission.Snapshot();
        Assert.False(state.IncidentActive);
        Assert.All(state.Sites, s => Assert.Equal(1,s.Integrity));
    }

    [Theory]
    [InlineData(OkanaganSortieType.PeachlandDefence)]
    [InlineData(OkanaganSortieType.BigWhiteDefence)]
    [InlineData(OkanaganSortieType.SilverStarDefence)]
    [InlineData(OkanaganSortieType.ApexDefence)]
    public void WaterChangesActualSiteCondition(OkanaganSortieType sortie)
    {
        var incident=OkanaganIncident.For(sortie)!;
        var untreated=new OkanaganFireGrid(incident); var treated=new OkanaganFireGrid(incident);
        var before=new OkanaganProtection(incident.Sites); var after=new OkanaganProtection(incident.Sites);
        // A finite 3,100 kg pass following the hottest threatened sites, with an untreated control.
        for (int i=0;i<600;i++) {
            untreated.Step(.5);treated.Step(.5);
            if(i>=100 && i<131) {
                var target=incident.Sites.OrderByDescending(s=>treated.ExposureAt(s.Position)).First().Position;
                treated.ApplyWater(target,100);after.ApplyWater(target,100);
            }
            before.Step(.5,untreated);after.Step(.5,treated);
        }
        var control=before.Snapshot(); var result=after.Snapshot();
        Assert.Contains(control,s=>s.EverThreatened);
        Assert.Contains(control,s=>s.Status is "damaged" or "lost");
        Assert.True(result.Sum(s=>s.Integrity)>control.Sum(s=>s.Integrity)+.01,"A finite drop must improve the actual sector condition.");
    }

    [Fact]
    public void LostSitesCannotBeResurrectedAndUnexposedSitesEarnNoProtectionScore()
    {
        var fire=new OkanaganFireGrid();
        var cell=fire.ActiveCells().First();
        var p=new Vec3D(cell.X,cell.Y,cell.Z);
        var protection=new OkanaganProtection([new("test","Test structure","housing",p,1)]);
        Assert.Equal(0,protection.OutcomeScore);
        protection.Step(10000,fire);
        Assert.Equal("lost",protection.Snapshot()[0].Status);
        protection.ApplyWater(p,3104);
        Assert.Equal(0,protection.Snapshot()[0].Integrity);
    }

    [Theory]
    [InlineData(80,1)]
    [InlineData(285,.5)]
    [InlineData(500,0)]
    [InlineData(-1,0)]
    public void HighOrInvalidReleasesCannotEarnFullGroundEffect(double agl,double fraction)
        => Assert.Equal(fraction,OkanaganFireMission.DropDeliveryFraction(agl),8);

    [Theory]
    [InlineData(OkanaganSortieType.BigWhiteDefence)]
    [InlineData(OkanaganSortieType.SilverStarDefence)]
    [InlineData(OkanaganSortieType.ApexDefence)]
    public void MountainIngressGatesAndDropLineClearMeasuredTerrain(OkanaganSortieType sortie)
    {
        var mission=OkanaganFireMission.Create(sortie);
        var route=mission.RouteFor(OkanaganMissionPhase.Ingress).ToArray();
        Assert.True(route[0].PositionWorldM.Y>1700);
        foreach(var gate in route) Assert.True(gate.PositionWorldM.Y-OkanaganCdem.SampleSurfaceHeightM(gate.PositionWorldM)>=99);
        for(int i=1;i<route.Length;i++) for(int j=0;j<=50;j++) {
            Vec3D a=route[i-1].PositionWorldM,b=route[i].PositionWorldM,p=a+(b-a)*(j/50.0);
            Assert.True(p.Y-OkanaganCdem.SampleSurfaceHeightM(p)>30,$"{sortie} corridor intersects relief: {p}");
        }
    }
}
