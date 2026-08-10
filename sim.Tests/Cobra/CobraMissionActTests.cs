using GunsOnly.Sim.Cobra;
using GunsOnly.Sim.Cobra.GroundWar;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests.Cobra;

public class CobraMissionActTests
{
    static readonly Vec3D Fob = new(-6_775.0, 202.0, -6_200.0);
    static readonly Vec3D Bridge = new(-2_710.0, 146.0, -500.0);

    [Fact]
    public void FreshPadStaysDepart()
    {
        CobraMissionAct next = CobraMissionActProgress.Next(
            CobraMissionAct.Depart,
            Fob,
            Fob,
            Bridge,
            victoryHoldProgress: 0.0,
            HoldTheBridgeOutcome.Pending,
            CobraMissionStatus.Active,
            clearanceM: 2.0);
        Assert.Equal(CobraMissionAct.Depart, next);
    }

    [Fact]
    public void LeavingThePadArmsIngress()
    {
        Vec3D away = new(Fob.X + 250.0, Fob.Y + 40.0, Fob.Z);
        CobraMissionAct next = CobraMissionActProgress.Next(
            CobraMissionAct.Depart,
            away,
            Fob,
            Bridge,
            0.0,
            HoldTheBridgeOutcome.Pending,
            CobraMissionStatus.Active,
            clearanceM: 40.0);
        Assert.Equal(CobraMissionAct.Ingress, next);
    }

    [Fact]
    public void NearIronBellBridgeArmsEngage()
    {
        Vec3D near = new(Bridge.X + 80.0, Bridge.Y + 40.0, Bridge.Z);
        CobraMissionAct next = CobraMissionActProgress.Next(
            CobraMissionAct.Ingress,
            near,
            Fob,
            Bridge,
            0.0,
            HoldTheBridgeOutcome.Pending,
            CobraMissionStatus.Active,
            clearanceM: 40.0);
        Assert.Equal(CobraMissionAct.Engage, next);
    }

    [Fact]
    public void VictoryHoldProgressPromotesToHold()
    {
        CobraMissionAct next = CobraMissionActProgress.Next(
            CobraMissionAct.Engage,
            Bridge,
            Fob,
            Bridge,
            victoryHoldProgress: 0.2,
            HoldTheBridgeOutcome.Pending,
            CobraMissionStatus.Active,
            clearanceM: 40.0);
        Assert.Equal(CobraMissionAct.Hold, next);
    }

    [Fact]
    public void VictoryOutcomeArmsRtbAndPadCompletes()
    {
        Assert.Equal(
            CobraMissionAct.Rtb,
            CobraMissionActProgress.Next(
                CobraMissionAct.Hold,
                Bridge,
                Fob,
                Bridge,
                1.0,
                HoldTheBridgeOutcome.Victory,
                CobraMissionStatus.Victory,
                clearanceM: 40.0));

        Assert.Equal(
            CobraMissionAct.Complete,
            CobraMissionActProgress.Next(
                CobraMissionAct.Rtb,
                new Vec3D(Fob.X, Fob.Y + 2.0, Fob.Z),
                Fob,
                Bridge,
                1.0,
                HoldTheBridgeOutcome.Victory,
                CobraMissionStatus.Victory,
                clearanceM: 3.0));
    }

    [Fact]
    public void PathGatesHighlightBridgeDuringEngage()
    {
        CobraCanyonRouteDefinition route = CobraCanyonDefinition.Create()
            .Route(CobraCanyonRouteChoice.RiverGorge);
        IReadOnlyList<CobraPathGate> gates = CobraMissionActProgress.BuildPathGates(
            CobraMissionAct.Engage,
            route,
            Fob,
            fobPathAltitudeM: 232.0);
        Assert.NotEmpty(gates);
        Assert.Equal(1, gates.Count(g => g.Active));
        CobraPathGate active = gates.Single(g => g.Active);
        Assert.InRange(active.EastM, Bridge.X - 80.0, Bridge.X + 80.0);
    }

    [Fact]
    public void DepartPathGatesSitAtNapOfEarthNotCorridorFloor()
    {
        CobraCanyonRouteDefinition route = CobraCanyonDefinition.Create()
            .Route(CobraCanyonRouteChoice.RiverGorge);
        CobraCanyonRoutePoint first = route.Points[0];
        IReadOnlyList<CobraPathGate> gates = CobraMissionActProgress.BuildPathGates(
            CobraMissionAct.Depart,
            route,
            Fob,
            fobPathAltitudeM: first.PathAltitudeM + first.TargetAglM);
        CobraPathGate active = gates.Single(g => g.Active);
        Assert.Equal(first.EastM, active.EastM);
        Assert.Equal(first.NorthM, active.NorthM);
        Assert.Equal(first.PathAltitudeM + first.TargetAglM, active.UpM, 6);
        Assert.True(
            active.UpM > first.PathAltitudeM + 10.0,
            "soft gates must read as airborne volumes, not river-floor boxes");
    }

    [Fact]
    public void IngressPathAdvancesActiveGatePastFlownWaypoints()
    {
        CobraCanyonRouteDefinition route = CobraCanyonDefinition.Create()
            .Route(CobraCanyonRouteChoice.RiverGorge);
        CobraCanyonRoutePoint first = route.Points[0];
        CobraCanyonRoutePoint second = route.Points[1];
        // Park on the first gate so it counts as flown — next soft cue should be gate 1.
        Vec3D onFirst = new(first.EastM, first.PathAltitudeM, first.NorthM);
        IReadOnlyList<CobraPathGate> gates = CobraMissionActProgress.BuildPathGates(
            CobraMissionAct.Ingress,
            route,
            Fob,
            fobPathAltitudeM: 232.0,
            aircraftWorldM: onFirst);
        Assert.Equal(1, gates.Count(g => g.Active));
        CobraPathGate active = gates.Single(g => g.Active);
        Assert.Equal(second.EastM, active.EastM);
        Assert.Equal(second.NorthM, active.NorthM);
    }

    [Fact]
    public void RtbPathIsASingleCampEmberGate()
    {
        CobraCanyonRouteDefinition route = CobraCanyonDefinition.Create()
            .Route(CobraCanyonRouteChoice.RiverGorge);
        IReadOnlyList<CobraPathGate> gates = CobraMissionActProgress.BuildPathGates(
            CobraMissionAct.Rtb,
            route,
            Fob,
            fobPathAltitudeM: 232.0);
        Assert.Single(gates);
        Assert.True(gates[0].Active);
        Assert.Equal(Fob.X, gates[0].EastM);
        Assert.Equal(Fob.Z, gates[0].NorthM);
    }
}
