using GunsOnly.Sim.Propulsion;
using Xunit;

public class J47PerformanceMapTests
{
    const double MetresPerFoot = 0.3048;

    [Fact]
    public void SeaLevelMilitaryPowerIsTheExactGe27Anchor()
    {
        EngineOperatingPoint point = J47PerformanceMap.Evaluate(1.0, 0.0, 0.0);

        Assert.True(point.Running);
        Assert.Equal(J47PerformanceMap.RatedRpm, point.Rpm, 10);
        Assert.Equal(100.0, point.RpmPercent, 10);
        Assert.Equal(5970.0, point.NetThrustLbf, 10);
        Assert.Equal(5970.0 * J47PerformanceMap.NewtonsPerPoundForce,
            point.NetThrustN, 8);
        Assert.Equal(105.47, point.FuelFlowLbPerMinute, 10);
    }

    [Fact]
    public void PowerFractionMeansSeaLevelThrustRatherThanRpm()
    {
        EngineOperatingPoint half = J47PerformanceMap.Evaluate(.5, 0.0, 0.0);

        Assert.Equal(2985.0, half.NetThrustLbf, 8);
        Assert.NotInRange(half.RpmPercent, 49.9, 50.1);
        Assert.InRange(half.RpmPercent, 70.0, 85.0);
    }

    [Fact]
    public void FullPowerReproducesRepresentativeE51B06Rows()
    {
        EngineOperatingPoint at6000 = J47PerformanceMap.Evaluate(
            1.0, 6000.0 * MetresPerFoot, .173);
        Assert.Equal(7955.0, at6000.Rpm, 8);
        Assert.Equal(4284.0, at6000.NetThrustLbf, 8);
        Assert.Equal(4890.0 / 60.0, at6000.FuelFlowLbPerMinute, 8);

        EngineOperatingPoint at25000MachHalf = J47PerformanceMap.Evaluate(
            1.0, 25000.0 * MetresPerFoot, .500);
        Assert.Equal(7900.0, at25000MachHalf.Rpm, 8);
        Assert.Equal(2483.0, at25000MachHalf.NetThrustLbf, 8);
        Assert.Equal(3225.0 / 60.0, at25000MachHalf.FuelFlowLbPerMinute, 8);
    }

    [Fact]
    public void TransonicExtensionReproducesE9G09Row()
    {
        EngineOperatingPoint point = J47PerformanceMap.Evaluate(
            1.0, 25000.0 * MetresPerFoot, .850);

        Assert.Equal(7895.0, point.Rpm, 8);
        Assert.Equal(2647.0, point.NetThrustLbf, 8);
        Assert.Equal(3660.0 / 60.0, point.FuelFlowLbPerMinute, 8);
    }

    [Fact]
    public void PublishedRowsRetainSourceAndRunProvenance()
    {
        J47PublishedRow row = Assert.Single(J47PerformanceMap.SourceRows, r =>
            r.DocumentId == J47MapData.J47DDocumentId && r.Run == 46);
        Assert.Equal(25000.0, row.AltitudeFt);
        Assert.Equal(.500, row.Mach, 6);
        Assert.Equal(7900.0, row.Rpm);
        Assert.Equal(2483.0, row.NetThrustLbf);
        Assert.Equal(3225.0, row.FuelFlowLbPerHour);

        J47PublishedRow anchor = Assert.Single(J47PerformanceMap.SourceRows, r =>
            r.DocumentId == J47MapData.Ge27DocumentId);
        Assert.Equal(5970.0, anchor.NetThrustLbf);
        Assert.Equal(6328.2, anchor.FuelFlowLbPerHour, 8);
    }

    [Fact]
    public void AltitudeAndMachChangeThrustAndFuelFromTheSamePoint()
    {
        EngineOperatingPoint seaLevel = J47PerformanceMap.Evaluate(1.0, 0.0, .176);
        EngineOperatingPoint highLowMach = J47PerformanceMap.Evaluate(
            1.0, 25000.0 * MetresPerFoot, .176);
        EngineOperatingPoint highFast = J47PerformanceMap.Evaluate(
            1.0, 25000.0 * MetresPerFoot, .711);

        Assert.True(highLowMach.NetThrustLbf < seaLevel.NetThrustLbf);
        Assert.True(highLowMach.FuelFlowLbPerMinute < seaLevel.FuelFlowLbPerMinute);
        Assert.True(highFast.NetThrustLbf > highLowMach.NetThrustLbf);
        Assert.True(highFast.FuelFlowLbPerMinute > highLowMach.FuelFlowLbPerMinute);
    }

    [Fact]
    public void InterpolationIsContinuousAcrossAltitudeAndMachNodes()
    {
        const double epsilon = 1e-6;
        double altitudeM = 15000.0 * MetresPerFoot;
        EngineOperatingPoint belowAltitude = J47PerformanceMap.Evaluate(.72,
            altitudeM - epsilon, .42);
        EngineOperatingPoint aboveAltitude = J47PerformanceMap.Evaluate(.72,
            altitudeM + epsilon, .42);
        Assert.InRange(Math.Abs(belowAltitude.NetThrustLbf - aboveAltitude.NetThrustLbf), 0.0, .001);
        Assert.InRange(Math.Abs(belowAltitude.FuelFlowLbPerMinute - aboveAltitude.FuelFlowLbPerMinute), 0.0, .001);

        EngineOperatingPoint belowMach = J47PerformanceMap.Evaluate(.72,
            25000.0 * MetresPerFoot, .500 - epsilon);
        EngineOperatingPoint aboveMach = J47PerformanceMap.Evaluate(.72,
            25000.0 * MetresPerFoot, .500 + epsilon);
        Assert.InRange(Math.Abs(belowMach.NetThrustLbf - aboveMach.NetThrustLbf), 0.0, .1);
        Assert.InRange(Math.Abs(belowMach.FuelFlowLbPerMinute - aboveMach.FuelFlowLbPerMinute), 0.0, .01);
    }

    [Fact]
    public void InputsAreBoundedToThePublishedEnvelope()
    {
        EngineOperatingPoint low = J47PerformanceMap.Evaluate(-4.0, -1000.0, -2.0);
        EngineOperatingPoint lowEdge = J47PerformanceMap.Evaluate(0.0, 0.0, 0.0);
        Assert.Equal(lowEdge, low);

        EngineOperatingPoint high = J47PerformanceMap.Evaluate(4.0, 1_000_000.0, 4.0);
        EngineOperatingPoint highEdge = J47PerformanceMap.Evaluate(1.0,
            J47PerformanceMap.MaximumMappedAltitudeM, J47PerformanceMap.MaximumMappedMach);
        Assert.Equal(highEdge, high);
        Assert.True(high.NetThrustLbf >= 0.0);
        Assert.True(high.FuelFlowLbPerMinute >= 0.0);
    }

    [Fact]
    public void PublishedConditionPowerSweepsAreMonotone()
    {
        (double AltitudeFt, double Mach)[] conditions =
        {
            (0.0, 0.0), (6000.0, .173), (15000.0, .164), (15000.0, .500),
            (25000.0, .176), (25000.0, .500), (25000.0, .711),
            (25000.0, .850), (25000.0, .975),
            (35000.0, .159), (45000.0, .180),
        };
        foreach ((double altitudeFt, double mach) in conditions)
        {
            double previousThrust = -1.0;
            double previousFuel = -1.0;
            for (int i = 0; i <= 100; i++)
            {
                EngineOperatingPoint point = J47PerformanceMap.Evaluate(
                    i / 100.0, altitudeFt * MetresPerFoot, mach);
                Assert.True(point.NetThrustLbf + 1e-9 >= previousThrust,
                    $"thrust fell {previousThrust}->{point.NetThrustLbf} at {altitudeFt} ft, M {mach}, power {i / 100.0}");
                Assert.True(point.FuelFlowLbPerMinute + 1e-9 >= previousFuel,
                    $"fuel flow fell {previousFuel}->{point.FuelFlowLbPerMinute} at {altitudeFt} ft, M {mach}, power {i / 100.0}");
                previousThrust = point.NetThrustLbf;
                previousFuel = point.FuelFlowLbPerMinute;
            }
        }
    }

    [Fact]
    public void RunningIdleAndStoppedEngineAreDistinct()
    {
        EngineOperatingPoint idle = J47PerformanceMap.Evaluate(0.0, 0.0, 0.0);
        Assert.True(idle.Running);
        Assert.Equal(J47PerformanceMap.IdleRpm, idle.Rpm, 8);
        Assert.Equal(0.0, idle.NetThrustLbf, 10);
        Assert.True(idle.FuelFlowLbPerMinute > 0.0);

        EngineOperatingPoint stopped = J47PerformanceMap.Evaluate(.8, 5000.0, .6,
            running: false);
        Assert.Equal(EngineOperatingPoint.Stopped, stopped);
    }

    [Fact]
    public void EvaluationIsBitDeterministic()
    {
        EngineOperatingPoint expected = J47PerformanceMap.Evaluate(.67321, 5432.1, .61234);
        for (int i = 0; i < 1000; i++)
            Assert.Equal(expected, J47PerformanceMap.Evaluate(.67321, 5432.1, .61234));
    }

    [Theory]
    [InlineData(double.NaN, 0.0, 0.0)]
    [InlineData(0.5, double.PositiveInfinity, 0.0)]
    [InlineData(0.5, 0.0, double.NegativeInfinity)]
    public void NonFiniteInputsAreRejected(double power, double altitudeM, double mach)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            J47PerformanceMap.Evaluate(power, altitudeM, mach));
    }
}
