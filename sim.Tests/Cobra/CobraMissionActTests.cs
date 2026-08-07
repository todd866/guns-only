using GunsOnly.Sim.Cobra;
using GunsOnly.Sim.Cobra.GroundWar;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests.Cobra;

public class CobraMissionActTests
{
    static readonly Vec3D Fob = new(-6_500.0, 160.0, -6_200.0);
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
            fobPathAltitudeM: 190.0);
        Assert.NotEmpty(gates);
        Assert.Equal(1, gates.Count(g => g.Active));
        CobraPathGate active = gates.Single(g => g.Active);
        Assert.InRange(active.EastM, Bridge.X - 80.0, Bridge.X + 80.0);
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
            fobPathAltitudeM: 190.0);
        Assert.Single(gates);
        Assert.True(gates[0].Active);
        Assert.Equal(Fob.X, gates[0].EastM);
        Assert.Equal(Fob.Z, gates[0].NorthM);
    }
}
