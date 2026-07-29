using GunsOnly.Sim;

namespace GunsOnly.Sim.Tests;

public class CircuitTrafficTests {
    static readonly Vec3D Home = new(1_000.0, 40.0, 2_000.0);
    static readonly Vec3D Initial = new(1_000.0, 1_040.0, -14_000.0);

    [Fact]
    public void TrafficIsPhaseSeparatedAndUsesDistinctCallsigns() {
        CircuitTrafficShip[] traffic = CircuitPatternTraffic.Evaluate(
            42.0, Home, Initial, count: 3);

        Assert.Equal(3, traffic.Length);
        Assert.All(traffic, ship => Assert.True(ship.Present));
        Assert.Equal(3, traffic.Select(ship => ship.Callsign).Distinct().Count());
        Assert.All(traffic, ship => {
            Assert.True(double.IsFinite(ship.X));
            Assert.True(double.IsFinite(ship.Y));
            Assert.True(double.IsFinite(ship.Z));
            Assert.True(double.IsFinite(ship.Chi));
        });
        Assert.All(
            traffic.SelectMany((a, i) => traffic.Skip(i + 1)
                .Select(b => HorizontalDistance(a, b))),
            separation => Assert.True(separation > 500.0, $"separation {separation:F0} m"));
    }

    [Fact]
    public void TrafficMovesContinuouslyWithTangentDerivedHeading() {
        CircuitTrafficShip previous = CircuitPatternTraffic.Evaluate(
            0.0, Home, Initial, count: 1)[0];
        double maximumStepM = 0.0;
        double maximumHeadingStepDeg = 0.0;
        double maximumHeadingAtSeconds = 0.0;
        string maximumHeadingLeg = "";

        for (int sample = 1; sample <= 6_000; sample++) {
            CircuitTrafficShip current = CircuitPatternTraffic.Evaluate(
                sample * 0.1, Home, Initial, count: 1)[0];
            maximumStepM = Math.Max(maximumStepM, HorizontalDistance(previous, current));
            double headingStepDeg =
                Math.Abs(WrapRadians(current.Chi - previous.Chi)) * 180.0 / Math.PI;
            if (headingStepDeg > maximumHeadingStepDeg) {
                maximumHeadingStepDeg = headingStepDeg;
                maximumHeadingAtSeconds = sample * 0.1;
                maximumHeadingLeg = current.Leg;
            }
            previous = current;
        }

        Assert.InRange(maximumStepM, 5.0, 25.0);
        Assert.True(maximumHeadingStepDeg < 2.0,
            $"largest 0.1 s heading change was {maximumHeadingStepDeg:F2} degrees "
            + $"at {maximumHeadingAtSeconds:F1} s on {maximumHeadingLeg}");
    }

    [Fact]
    public void TrafficCompletesThePatternLegsAtPlausibleAltitudes() {
        var legs = new HashSet<string>();
        double minimumAltitude = double.PositiveInfinity;
        double maximumAltitude = double.NegativeInfinity;

        for (int second = 0; second <= 600; second++) {
            CircuitTrafficShip ship = CircuitPatternTraffic.Evaluate(
                second, Home, Initial, count: 1)[0];
            legs.Add(ship.Leg);
            minimumAltitude = Math.Min(minimumAltitude, ship.Y);
            maximumAltitude = Math.Max(maximumAltitude, ship.Y);
        }

        Assert.Contains("DEPART", legs);
        Assert.Contains("CROSSWIND", legs);
        Assert.Contains("DOWNWIND", legs);
        Assert.Contains("BASE", legs);
        Assert.Contains("SHORT_FINAL", legs);
        Assert.Contains("WIRE_FINAL", legs);
        Assert.True(minimumAltitude >= Home.Y + 7.0);
        Assert.InRange(maximumAltitude - Home.Y, 750.0, 770.0);
    }

    static double HorizontalDistance(in CircuitTrafficShip a, in CircuitTrafficShip b) {
        double dx = b.X - a.X;
        double dz = b.Z - a.Z;
        return Math.Sqrt(dx * dx + dz * dz);
    }

    static double WrapRadians(double angle) =>
        Math.Atan2(Math.Sin(angle), Math.Cos(angle));
}
