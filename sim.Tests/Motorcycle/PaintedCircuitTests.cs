using GunsOnly.Sim.Motorcycle;

namespace GunsOnly.Sim.Tests.Motorcycle;

public sealed class PaintedCircuitTests
{
    [Fact]
    public void RapierStripCircuitFitsInside3048By48Pavement()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        Assert.True(circuit.BoundingLengthM <= 3048.0);
        Assert.True(circuit.BoundingWidthM <= 48.0);
        foreach (var p in circuit.Centreline)
            Assert.InRange(p.Y, RapierLaunchSite.OperatingSurfaceElevationM - 0.01,
                RapierLaunchSite.OperatingSurfaceElevationM + 0.01);
    }

    [Fact]
    public void ClosedCircuitHasPositiveLengthAndTrackWidth()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        Assert.True(circuit.CircuitLengthM > 1500.0);
        Assert.InRange(circuit.TrackWidthM, 6.0, 12.0);
        Assert.Equal(circuit.Centreline[0], circuit.Centreline[^1]);
        Assert.True(circuit.SectorGateProgressM.Count >= 3);
    }

    [Fact]
    public void QueryReportsOnTrackNearCentrelineAndOffTrackFarAway()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        Vec3D onCentre = circuit.Centreline[circuit.Centreline.Count / 2];
        var onTrack = circuit.Query(onCentre);
        Assert.True(onTrack.OnTrack);
        Assert.InRange(onTrack.ProgressM, 0.0, circuit.CircuitLengthM);

        var offTrack = circuit.Query(onCentre + new Vec3D(0.0, 0.0, 80.0));
        Assert.False(offTrack.OnTrack);
    }

    [Fact]
    public void CrossingStartFinishIncrementsLapIndex()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        var state = new PaintedCircuitQueryState();

        var start = circuit.Query(circuit.StartFinishCentre, ref state);
        Assert.Equal(0, start.LapIndex);
        Assert.False(start.CrossedStartFinish);

        int closingSegment = circuit.Centreline.Count - 2;
        Vec3D beforeLine = Lerp(
            circuit.Centreline[closingSegment],
            circuit.Centreline[closingSegment + 1],
            0.92);
        Vec3D afterLine = Lerp(
            circuit.Centreline[0],
            circuit.Centreline[1],
            0.08);

        circuit.Query(beforeLine, ref state);
        var lapCross = circuit.Query(afterLine, ref state);
        Assert.True(lapCross.CrossedStartFinish);
        Assert.Equal(1, lapCross.LapIndex);
        Assert.Equal(1, state.LapIndex);
    }

    static Vec3D Lerp(Vec3D a, Vec3D b, double t) =>
        new(
            a.X + (b.X - a.X) * t,
            a.Y + (b.Y - a.Y) * t,
            a.Z + (b.Z - a.Z) * t);
}
