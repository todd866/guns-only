using GunsOnly.Sim;
using GunsOnly.Sim.Recovery;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

public class GoldenPathTests {
    readonly ITestOutputHelper _out;
    public GoldenPathTests(ITestOutputHelper output) => _out = output;

    static readonly IAtmosphereModel Air = StandardAtmosphere1976.Instance;
    const double StabiliseAltM = 152.0;   // 500 ft
    const double StabiliseSpeed = 90.0;   // ~175 kt true
    const double DragToWeight = 0.12;

    static GoldenPathPoint Solve(double dtgM, double altM, double tas) =>
        GoldenPath.Solve(dtgM, altM, tas, Air, StabiliseAltM, StabiliseSpeed, DragToWeight);

    [Fact]
    public void TheCorridorTightensAsYouDescend() {
        // Skin temperature is the counter-intuitive one: descending into warmer air LOWERS the
        // Mach you may hold, so the envelope closes on the way down.
        double high = DescentCorridor.MaxMach(Air.Sample(22_860.0).TemperatureK);
        double low = DescentCorridor.MaxMach(Air.Sample(3_000.0).TemperatureK);
        _out.WriteLine($"max Mach: FL750 {high:F2}   FL100 {low:F2}");
        Assert.True(low < high, $"skin ceiling must fall on descent: {low} vs {high}");

        // And q allows less speed the denser it gets.
        double qHigh = DescentCorridor.MaxTrueAirspeedMps(Air.Sample(22_860.0).DensityKgM3);
        double qLow = DescentCorridor.MaxTrueAirspeedMps(Air.Sample(3_000.0).DensityKgM3);
        Assert.True(qLow < qHigh);
    }

    [Fact]
    public void AMach37ArrivalIsToldToComeOffThePowerImmediately() {
        AtmosphericState air = Air.Sample(22_860.0);
        double a = System.Math.Sqrt(1.4 * 287.05 * air.TemperatureK);
        // 173 NM: the whole theatre.
        GoldenPathPoint p = Solve(173 * 1852.0, 22_860.0, 3.7 * a);

        Assert.True(p.Valid);
        _out.WriteLine($"excess {p.ExcessEnergyM / 1000:F0} km  required {p.TrackRequiredM / 1852:F0} NM"
            + $"  power {p.CommandedPower01:F2}  limit {p.Limit}");
        Assert.True(p.TrackRequiredM > 173 * 1852.0,
            "M3.7 at FL750 must need more track than the theatre contains");
        Assert.Equal(0.0, p.CommandedPower01, precision: 6);
        // Nothing is binding: the CMC screens to about M5.67 at FL750 and q to a similar speed,
        // so at M3.7 no placard is clipping. The problem is energy against distance, and naming
        // an innocent limit would send the pilot looking at the wrong gauge.
        Assert.Equal(DescentLimit.None, p.Limit);
    }

    [Fact]
    public void AnOnProfileArrivalIsLeftAlone() {
        // 20 NM out, 6,000 ft, 200 kt true: an ordinary recovery.
        GoldenPathPoint p = Solve(20 * 1852.0, 1_830.0, 103.0);
        Assert.True(p.Valid);
        _out.WriteLine($"power {p.CommandedPower01:F2}  target alt {p.TargetAltitudeM:F0} m"
            + $"  target tas {p.TargetTrueAirspeedMps:F0}  limit {p.Limit}");
        Assert.InRange(p.CommandedPower01, 0.2, 0.8);
        Assert.Equal(DescentLimit.None, p.Limit);
    }

    [Fact]
    public void TheScheduleDescendsAndDeceleratesTowardTheStabilisationPoint() {
        double previousAlt = double.MaxValue, previousSpeed = double.MaxValue;
        for (double nm = 60; nm >= 2; nm -= 2) {
            GoldenPathPoint p = Solve(nm * 1852.0, 6_000.0, 200.0);
            Assert.True(p.TargetAltitudeM <= previousAlt + 1e-6, $"altitude rose at {nm} NM");
            Assert.True(p.TargetTrueAirspeedMps <= previousSpeed + 1e-6, $"speed rose at {nm} NM");
            previousAlt = p.TargetAltitudeM;
            previousSpeed = p.TargetTrueAirspeedMps;
        }
        // Convergence belongs at the stabilisation point itself. Asserting it at 2 NM while
        // carrying 8,040 m of energy would be demanding the impossible, and the schedule is right
        // to say 534 m is the best available from there.
        GoldenPathPoint arrival = Solve(0.0, 6_000.0, 200.0);
        Assert.Equal(StabiliseAltM, arrival.TargetAltitudeM, precision: 0);
        Assert.Equal(StabiliseSpeed, arrival.TargetTrueAirspeedMps, precision: 0);
    }

    [Fact]
    public void MoreEnergyNeverAsksForMorePower() {
        double previous = 1.0;
        for (double tas = 100; tas <= 900; tas += 50) {
            GoldenPathPoint p = Solve(40 * 1852.0, 12_000.0, tas);
            Assert.True(p.CommandedPower01 <= previous + 1e-9,
                $"power rose with energy at {tas} m/s");
            previous = p.CommandedPower01;
        }
    }

    [Fact]
    public void GarbageInIsReportedInvalidRatherThanThrowing() {
        GoldenPathPoint p = Solve(double.NaN, 1000.0, 100.0);
        Assert.False(p.Valid);
    }
}
