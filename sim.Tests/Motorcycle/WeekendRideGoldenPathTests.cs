using GunsOnly.Sim.Motorcycle;

namespace GunsOnly.Sim.Tests.Motorcycle;

public sealed class WeekendRideGoldenPathTests
{
    readonly PaintedCircuit _circuit = PaintedCircuit.WeekendTrackDay();
    readonly WeekendHinterlandRoadNetwork _roads;

    public WeekendRideGoldenPathTests()
    {
        _roads = WeekendHinterlandRoadNetwork.CreateDefault(
            _circuit.PaddockAccessPointWorldM);
    }

    [Fact]
    public void FirstLapUsesOnlyTemporaryRouteSymbols()
    {
        WeekendRideGoldenPathCue launch = Resolve(
            _circuit.StartFinishCentre,
            speedMps: 0.0,
            lapCount: 0,
            circuitProgressM: 0.0,
            nextSectorIndex: 0);
        Assert.Equal(new WeekendRideGoldenPathCue("launch", "↑"), launch);

        double gateProgressM = _circuit.SectorGateProgressM[0] * _circuit.CircuitLengthM;
        WeekendRideGoldenPathCue sector = Resolve(
            _circuit.StartFinishCentre,
            speedMps: 24.0,
            lapCount: 0,
            circuitProgressM: gateProgressM - 100.0,
            nextSectorIndex: 0);
        Assert.Equal("sector", sector.Kind);
        Assert.Contains(sector.Token, new[] { "↱", "↰" });

        WeekendRideGoldenPathCue finish = Resolve(
            _circuit.StartFinishCentre,
            speedMps: 28.0,
            lapCount: 0,
            circuitProgressM: _circuit.CircuitLengthM - 100.0,
            nextSectorIndex: _circuit.SectorGateProgressM.Count);
        Assert.Equal(new WeekendRideGoldenPathCue("finish", "◎"), finish);
    }

    [Fact]
    public void CompletedLapLeadsThroughPaddockThenRetiresInOpenWorld()
    {
        WeekendRideGoldenPathCue acknowledged = Resolve(
            _circuit.StartFinishCentre,
            speedMps: 20.0,
            lapCount: 1,
            lapAcknowledgementRemainingS: 1.0);
        Assert.Equal(new WeekendRideGoldenPathCue("lap", "✓"), acknowledged);

        WeekendRideGoldenPathCue exit = Resolve(
            _circuit.StartFinishCentre,
            speedMps: 20.0,
            lapCount: 1);
        Assert.Equal("paddock-exit", exit.Kind);
        Assert.Contains(exit.Token, new[] { "↑", "↗", "↖", "↷", "↶" });

        WeekendRideGoldenPathCue freeRide = Resolve(
            _roads.CircuitAccessPointWorldM,
            speedMps: 16.0,
            lapCount: 1,
            openRoadDistanceM: 120.0,
            onOpenRoad: true);
        Assert.Equal(new WeekendRideGoldenPathCue("free-ride", "∞"), freeRide);

        WeekendRideGoldenPathCue complete = Resolve(
            _roads.CircuitAccessPointWorldM,
            speedMps: 16.0,
            lapCount: 1,
            openRoadDistanceM: WeekendRideGoldenPath.OpenRoadSuccessDistanceM,
            onOpenRoad: true);
        Assert.Equal(WeekendRideGoldenPathCue.None, complete);
    }

    [Fact]
    public void LeavingCircuitBeforeAValidLapPointsBackToAuthorityAccess()
    {
        Vec3D offCircuit = _roads.CircuitAccessPointWorldM + new Vec3D(0.0, 0.0, -300.0);
        WeekendRideGoldenPathCue cue = Resolve(
            offCircuit,
            headingRad: Math.PI,
            speedMps: 12.0,
            lapCount: 0,
            circuitProgressM: 0.0,
            nextSectorIndex: 0,
            onOpenRoad: true);
        Assert.Equal("return-to-circuit", cue.Kind);
        Assert.NotEmpty(cue.Token);
    }

    WeekendRideGoldenPathCue Resolve(
        Vec3D position,
        double headingRad = 0.0,
        double speedMps = 0.0,
        int lapCount = 0,
        double circuitProgressM = 0.0,
        int nextSectorIndex = 0,
        double lapAcknowledgementRemainingS = 0.0,
        double openRoadDistanceM = 0.0,
        bool onOpenRoad = false) =>
        WeekendRideGoldenPath.Resolve(
            _circuit,
            _roads,
            position,
            headingRad,
            speedMps,
            lapCount,
            circuitProgressM,
            nextSectorIndex,
            lapAcknowledgementRemainingS,
            openRoadDistanceM,
            onOpenRoad);
}
