using GunsOnly.Sim.Cobra;
using GunsOnly.Sim.Cobra.GroundWar;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests.Cobra;

public class CobraMissionActTests
{
    static readonly Vec3D Fob = CampEmberOperations.CentreWorldM;
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
        Vec3D away = new(Fob.X + 800.0, Fob.Y + 40.0, Fob.Z);
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
    public void DepartureDoesNotHandOffUntilTheAuthoredConnectorJoin()
    {
        CobraCanyonRouteDefinition route = CobraCanyonDefinition.Create()
            .Route(CobraCanyonRouteChoice.RidgeShadow);
        Vec3D join = CobraMissionActProgress.DepartureJoinWorldM(route, Fob);
        Vec3D onlyPastOldThreshold = new(Fob.X + 800.0, Fob.Y + 40.0, Fob.Z);
        Assert.True((join - onlyPastOldThreshold).Length > CobraMissionActProgress.DepartureJoinRadiusM);
        Assert.Equal(
            CobraMissionAct.Depart,
            CobraMissionActProgress.Next(
                CobraMissionAct.Depart, onlyPastOldThreshold, Fob, Bridge, 0.0,
                HoldTheBridgeOutcome.Pending, CobraMissionStatus.Active, 40.0, join));
        Assert.Equal(
            CobraMissionAct.Ingress,
            CobraMissionActProgress.Next(
                CobraMissionAct.Depart, join, Fob, Bridge, 0.0,
                HoldTheBridgeOutcome.Pending, CobraMissionStatus.Active, 40.0, join));
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
    public void VictoryOutcomeArmsRtbAndOnlyStablePadRecoveryCompletes()
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

        Vec3D overPad = new(Fob.X, Fob.Y + 2.0, Fob.Z);
        Assert.Equal(
            CobraMissionAct.Rtb,
            CobraMissionActProgress.Next(
                CobraMissionAct.Rtb,
                overPad,
                Fob,
                Bridge,
                1.0,
                HoldTheBridgeOutcome.Victory,
                CobraMissionStatus.Active,
                clearanceM: 3.0));

        Assert.Equal(
            CobraMissionAct.Complete,
            CobraMissionActProgress.Next(
                CobraMissionAct.Rtb,
                overPad,
                Fob,
                Bridge,
                1.0,
                HoldTheBridgeOutcome.Victory,
                CobraMissionStatus.Active,
                clearanceM: 3.0,
                stableRecoveryAtFob: true));
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
    public void DepartPathUsesTheProtectedGoAroundLane()
    {
        CobraCanyonDefinition definition = CobraCanyonDefinition.Create();
        CobraCanyonRouteDefinition route = definition.Route(CobraCanyonRouteChoice.RiverGorge);
        IReadOnlyList<CobraPathGate> gates = CobraMissionActProgress.BuildPathGates(
            CobraMissionAct.Depart,
            route,
            Fob,
            fobPathAltitudeM: Fob.Y + 30.0,
            terrain: definition.CreateTerrainSurface());
        Assert.Equal(6, gates.Count);
        CobraPathGate active = gates.Single(g => g.Active);
        Vec3D first = CampEmberOperations.PointAlongFinal(140.0);
        Assert.Equal(first.X, active.EastM, 6);
        Assert.Equal(first.Z, active.NorthM, 6);
        Assert.True(active.UpM > CampEmberOperations.PadElevationM + 20.0);
        CobraCanyonRoutePoint routeJoin = route.Points[3];
        Assert.Equal(routeJoin.EastM, gates[^1].EastM, 6);
        Assert.Equal(routeJoin.NorthM, gates[^1].NorthM, 6);
        Assert.All(gates, gate =>
            Assert.True(gate.UpM >= CampEmberOperations.PadElevationM + 42.0));
    }

    [Fact]
    public void IngressPathAdvancesActiveGatePastFlownWaypoints()
    {
        CobraCanyonRouteDefinition route = CobraCanyonDefinition.Create()
            .Route(CobraCanyonRouteChoice.RiverGorge);
        int joinIndex = 3;
        CobraCanyonRoutePoint first = route.Points[joinIndex];
        CobraCanyonRoutePoint second = route.Points[joinIndex + 1];
        // Park on the nearest safe route join so the next cue advances toward the bridge.
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
    public void RtbPathIsAStabilizedSixGateFinal()
    {
        CobraCanyonRouteDefinition route = CobraCanyonDefinition.Create()
            .Route(CobraCanyonRouteChoice.RiverGorge);
        IReadOnlyList<CobraPathGate> gates = CobraMissionActProgress.BuildPathGates(
            CobraMissionAct.Rtb,
            route,
            Fob,
            fobPathAltitudeM: 232.0);
        Assert.Equal(6, gates.Count);
        Assert.Single(gates, gate => gate.Active);
        Assert.Equal(Fob.X, gates[^1].EastM, 6);
        Assert.Equal(Fob.Z, gates[^1].NorthM, 6);
        Assert.True(gates[0].UpM > gates[^1].UpM + 250.0);
    }
}
