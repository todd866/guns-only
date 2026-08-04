using GunsOnly.Sim.Motorcycle;

namespace GunsOnly.Sim.Tests.Motorcycle;

public sealed class PaintedCircuitTests
{
    [Fact]
    public void RapierStripCircuitFitsInside3048By48Pavement()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        Assert.True(circuit.BoundingLengthM + circuit.TrackWidthM
            <= PaintedCircuit.RapierRunwayLengthM);
        Assert.True(circuit.BoundingWidthM + circuit.TrackWidthM
            <= PaintedCircuit.RapierRunwayWidthM);
        foreach (var p in circuit.Centreline)
            Assert.InRange(p.Y, RapierLaunchSite.OperatingSurfaceElevationM - 0.01,
                RapierLaunchSite.OperatingSurfaceElevationM + 0.01);
    }

    [Fact]
    public void ClosedCircuitHasPositiveLengthAndTrackWidth()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        Assert.True(circuit.CircuitLengthM > 1500.0);
        Assert.InRange(circuit.TrackWidthM, 8.0, 20.0);
        Assert.Equal(circuit.Centreline[0], circuit.Centreline[^1]);
        Assert.True(circuit.SectorGateProgressM.Count >= 3);
    }

    [Fact]
    public void CentrelineIsSampledWithContinuousFiniteCurvature()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        Assert.True(circuit.Centreline.Count > 200);

        double maximumHeadingChangeRad = 0.0;
        for (int i = 1; i < circuit.Centreline.Count - 1; i++)
        {
            Vec3D before = circuit.Centreline[i] - circuit.Centreline[i - 1];
            Vec3D after = circuit.Centreline[i + 1] - circuit.Centreline[i];
            double beforeLength = Math.Sqrt(before.X * before.X + before.Z * before.Z);
            double afterLength = Math.Sqrt(after.X * after.X + after.Z * after.Z);
            Assert.InRange(beforeLength, 0.05, 15.0);
            Assert.InRange(afterLength, 0.05, 15.0);
            double dot = (before.X * after.X + before.Z * after.Z)
                / (beforeLength * afterLength);
            maximumHeadingChangeRad = Math.Max(
                maximumHeadingChangeRad,
                Math.Acos(Math.Clamp(dot, -1.0, 1.0)));
        }

        Assert.True(
            maximumHeadingChangeRad < 0.35,
            $"sample-to-sample heading changed {maximumHeadingChangeRad:F3} rad");
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
    public void ForwardOnTrackSamplesThroughEverySectorIncrementLapIndex()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        var state = new PaintedCircuitQueryState();

        PaintedCircuitQueryResult lapCross = default;
        foreach (Vec3D point in circuit.Centreline)
            lapCross = circuit.Query(point, ref state);

        Assert.True(lapCross.CrossedStartFinish);
        Assert.Equal(1, lapCross.LapIndex);
        Assert.Equal(1, state.LapIndex);
    }

    [Fact]
    public void JumpingAcrossStartFinishWithoutSectorsDoesNotCountALap()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        var state = new PaintedCircuitQueryState();
        int closingSegment = circuit.Centreline.Count - 2;

        circuit.Query(circuit.Centreline[closingSegment], ref state);
        PaintedCircuitQueryResult jump = circuit.Query(circuit.Centreline[1], ref state);

        Assert.False(jump.CrossedStartFinish);
        Assert.Equal(0, jump.LapIndex);
    }

    [Fact]
    public void LeavingThePaintedCourseInvalidatesTheCurrentLap()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        var state = new PaintedCircuitQueryState();
        PaintedCircuitQueryResult result = default;

        for (int index = 0; index < circuit.Centreline.Count; index++)
        {
            Vec3D point = circuit.Centreline[index];
            if (index == circuit.Centreline.Count / 2)
                point += new Vec3D(0.0, 0.0, 60.0);
            result = circuit.Query(point, ref state);
        }

        Assert.False(result.CrossedStartFinish);
        Assert.Equal(0, result.LapIndex);
    }

    [Fact]
    public void ReverseTraversalCannotArmSectorsOrCountALap()
    {
        var circuit = PaintedCircuit.RapierStripWeekend();
        var state = new PaintedCircuitQueryState();
        PaintedCircuitQueryResult result = circuit.Query(circuit.Centreline[0], ref state);

        for (int index = circuit.Centreline.Count - 2; index >= 0; index--)
            result = circuit.Query(circuit.Centreline[index], ref state);

        Assert.False(result.CrossedStartFinish);
        Assert.Equal(0, result.LapIndex);
        Assert.Equal(0, state.NextSectorIndex);
    }
}
