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
    public void EngagePathPointsAtTheNextHostileGunPitAfterIronBellFlips()
    {
        CobraCanyonDefinition definition = CobraCanyonDefinition.Create();
        CobraCanyonRouteDefinition route = definition.Route(CobraCanyonRouteChoice.RiverGorge);
        var war = new CobraGroundWarRuntime(definition, definition.CreateTerrainSurface(), seed: 7);
        ContestedSite ironBell = war.Sites.Single(site =>
            site.LandmarkId == "landmark.cobra-canyon.iron-bell-bridge.v1");
        ContestedSite plantation = war.Sites.Single(site =>
            site.LandmarkId == "landmark.cobra-canyon.plantation-water-tower.v1");
        ironBell.SetInitialOwner(GroundSiteOwner.Friendly);
        Assert.Equal(GroundSiteOwner.Hostile, plantation.Owner);

        Vec3D aircraft = new(ironBell.PositionWorldM.X, ironBell.PositionWorldM.Y + 40.0, ironBell.PositionWorldM.Z);
        IReadOnlyList<CobraPathGate> gates = CobraMissionActProgress.BuildPathGates(
            CobraMissionAct.Engage,
            route,
            Fob,
            fobPathAltitudeM: 232.0,
            aircraftWorldM: aircraft,
            terrain: definition.CreateTerrainSurface(),
            sites: war.Sites);

        CobraPathGate active = Assert.Single(gates, gate => gate.Active);
        double toPlantation = Horizontal(active.EastM, active.NorthM, plantation.PositionWorldM);
        double toBridge = Horizontal(active.EastM, active.NorthM, ironBell.PositionWorldM);
        Assert.True(toPlantation <= plantation.CaptureRadiusM,
            $"active gate is {toPlantation:F0} m from Phu Rieng, outside {plantation.CaptureRadiusM:F0} m");
        Assert.True(toBridge > ironBell.CaptureRadiusM,
            "the active gate must leave the bridge once Iron Bell is friendly");
    }

    [Fact]
    public void GunPitChainClearsTerrainOnEverySegment()
    {
        CobraCanyonDefinition definition = CobraCanyonDefinition.Create();
        CobraCanyonRouteDefinition route = definition.Route(CobraCanyonRouteChoice.RiverGorge);
        var war = new CobraGroundWarRuntime(definition, definition.CreateTerrainSurface(), seed: 7);
        ContestedSite ironBell = war.Sites.Single(site =>
            site.LandmarkId == "landmark.cobra-canyon.iron-bell-bridge.v1");
        ironBell.SetInitialOwner(GroundSiteOwner.Friendly);
        Vec3D aircraft = new(ironBell.PositionWorldM.X, ironBell.PositionWorldM.Y + 40.0, ironBell.PositionWorldM.Z);
        IReadOnlyList<CobraPathGate> flat = CobraMissionActProgress.BuildPathGates(
            CobraMissionAct.Engage, route, Fob, 232.0, aircraft, terrain: null, sites: war.Sites);
        Assert.Equal(4, flat.Count);
        var ridge = new RidgeOnSegment(flat, segmentIndex: 1, heightM: 640.0, radiusM: 150.0);
        IReadOnlyList<CobraPathGate> cleared = CobraMissionActProgress.BuildPathGates(
            CobraMissionAct.Engage, route, Fob, 232.0, aircraft, ridge, war.Sites);

        double floorM = ridge.RidgeHeightM + CobraMissionActProgress.GunPitCueClearanceM;
        Assert.True(cleared[0].UpM >= floorM - 0.01);
        Assert.True(cleared[1].UpM >= floorM - 0.01);
        Assert.True(cleared[2].UpM < floorM - 50.0,
            "a ridge on an earlier segment must not lift every later gate");
        Assert.Equal(flat[^1].EastM, cleared[^1].EastM, 6);
        Assert.InRange(cleared[^1].UpM, flat[^1].UpM - 1.0, flat[^1].UpM + 1.0);
    }

    [Fact]
    public void GunPitChainClearsTheRidgeBetweenTheAircraftAndTheFirstCue()
    {
        CobraCanyonDefinition definition = CobraCanyonDefinition.Create();
        CobraCanyonRouteDefinition route = definition.Route(CobraCanyonRouteChoice.RiverGorge);
        var war = new CobraGroundWarRuntime(definition, definition.CreateTerrainSurface(), seed: 7);
        ContestedSite ironBell = war.Sites.Single(site =>
            site.LandmarkId == "landmark.cobra-canyon.iron-bell-bridge.v1");
        ironBell.SetInitialOwner(GroundSiteOwner.Friendly);
        Vec3D aircraft = new(ironBell.PositionWorldM.X, ironBell.PositionWorldM.Y + 40.0, ironBell.PositionWorldM.Z);
        IReadOnlyList<CobraPathGate> flat = CobraMissionActProgress.BuildPathGates(
            CobraMissionAct.Engage, route, Fob, 232.0, aircraft, terrain: null, sites: war.Sites);
        Assert.Equal(4, flat.Count);
        double segmentM = Math.Sqrt(
            Math.Pow(flat[0].EastM - aircraft.X, 2) + Math.Pow(flat[0].NorthM - aircraft.Z, 2));
        int samples = Math.Max(1, (int)Math.Ceiling(segmentM / 100.0));
        int sample = Math.Max(1, samples / 2);
        double t = (double)sample / samples;
        double ridgeEast = aircraft.X + (flat[0].EastM - aircraft.X) * t;
        double ridgeNorth = aircraft.Z + (flat[0].NorthM - aircraft.Z) * t;
        const double ridgeHeightM = 640.0;
        var ridge = new RidgeAt(ridgeEast, ridgeNorth, ridgeHeightM, radiusM: 30.0);
        IReadOnlyList<CobraPathGate> cleared = CobraMissionActProgress.BuildPathGates(
            CobraMissionAct.Engage, route, Fob, 232.0, aircraft, ridge, war.Sites);

        double floorM = ridgeHeightM + CobraMissionActProgress.GunPitCueClearanceM;
        double chordM = aircraft.Y + (cleared[0].UpM - aircraft.Y) * t;
        Assert.True(chordM >= floorM - 0.01,
            $"aircraft-to-first-cue chord is {chordM:F1} m at the ridge, below {floorM:F1} m");
        Assert.True(cleared[2].UpM < floorM - 50.0,
            "a ridge before the first cue must not lift every later gate");
        Assert.Equal(flat[^1].EastM, cleared[^1].EastM, 6);
    }

    sealed class RidgeAt(double eastM, double northM, double heightM, double radiusM) : ITerrainSurface
    {
        public TerrainBounds Bounds => new(-1_000_000, 1_000_000, -1_000_000, 1_000_000);
        public double HorizontalResolutionM => 50;
        public bool TrySample(double sampleEastM, double sampleNorthM, out TerrainSample sample) =>
            throw new InvalidOperationException("gun-pit marches use TryHeightM");
        public bool TryHeightM(double sampleEastM, double sampleNorthM, out double sampledHeightM)
        {
            double de = sampleEastM - eastM;
            double dn = sampleNorthM - northM;
            sampledHeightM = de * de + dn * dn < radiusM * radiusM ? heightM : 0.0;
            return true;
        }
    }

    sealed class RidgeOnSegment : ITerrainSurface
    {
        readonly double _eastM;
        readonly double _northM;
        public double RidgeHeightM { get; }

        readonly double _radiusM;

        public RidgeOnSegment(
            IReadOnlyList<CobraPathGate> flat, int segmentIndex, double heightM, double radiusM)
        {
            CobraPathGate a = flat[segmentIndex - 1];
            CobraPathGate b = flat[segmentIndex];
            _eastM = (a.EastM + b.EastM) * 0.5;
            _northM = (a.NorthM + b.NorthM) * 0.5;
            RidgeHeightM = heightM;
            _radiusM = radiusM;
        }

        public TerrainBounds Bounds => new(-1_000_000, 1_000_000, -1_000_000, 1_000_000);
        public double HorizontalResolutionM => 50;
        public bool TrySample(double eastM, double northM, out TerrainSample sample) =>
            throw new InvalidOperationException("gun-pit marches use TryHeightM");
        public bool TryHeightM(double eastM, double northM, out double sampledHeightM)
        {
            double de = eastM - _eastM;
            double dn = northM - _northM;
            sampledHeightM = de * de + dn * dn < _radiusM * _radiusM ? RidgeHeightM : 0.0;
            return true;
        }
    }

    static double Horizontal(double eastM, double northM, in Vec3D site)
    {
        double de = eastM - site.X;
        double dn = northM - site.Z;
        return Math.Sqrt(de * de + dn * dn);
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
        Assert.All(gates.Take(2), gate =>
            Assert.True(gate.UpM >= CampEmberOperations.PadElevationM + 42.0));
        Assert.True(gates[^1].UpM < CampEmberOperations.PadElevationM + 42.0,
            "the connector must descend into the nap-of-earth route instead of preserving pad altitude");
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
    public void IngressPathDoesNotRegressAfterPassingAFlownWaypoint()
    {
        CobraCanyonRouteDefinition route = CobraCanyonDefinition.Create()
            .Route(CobraCanyonRouteChoice.RiverGorge);
        int joinIndex = 3;
        CobraCanyonRoutePoint second = route.Points[joinIndex + 1];
        CobraCanyonRoutePoint third = route.Points[joinIndex + 2];
        Vec3D seventyFivePercentAlong = new(
            second.EastM + (third.EastM - second.EastM) * 0.75,
            second.PathAltitudeM,
            second.NorthM + (third.NorthM - second.NorthM) * 0.75);

        IReadOnlyList<CobraPathGate> gates = CobraMissionActProgress.BuildPathGates(
            CobraMissionAct.Ingress,
            route,
            Fob,
            fobPathAltitudeM: 232.0,
            aircraftWorldM: seventyFivePercentAlong);

        CobraPathGate active = gates.Single(gate => gate.Active);
        Assert.Equal(third.EastM, active.EastM);
        Assert.Equal(third.NorthM, active.NorthM);
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
