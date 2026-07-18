using GunsOnly.Sim;

namespace GunsOnly.Sim.Tests;

public class FuelModelTests {
    [Fact]
    public void BurnScalesFromIdleThroughMilitaryPower() {
        double idle = FuelModel.BurnRateLbPerMinute(0.0, 0.0);
        double cruise = FuelModel.BurnRateLbPerMinute(0.85, 0.85);
        double military = FuelModel.BurnRateLbPerMinute(1.0, 1.0);

        Assert.Equal(18.0, idle, 6);
        Assert.Equal(45.0, cruise, 6);
        Assert.Equal(90.0, military, 6);
        Assert.True(idle < cruise && cruise < military);
    }

    [Fact]
    public void MaximumAfterburnerBurnsMoreThanTwiceMilitaryFlow() {
        double military = FuelModel.BurnRateLbPerMinute(1.0, 1.0);
        double afterburner = FuelModel.BurnRateLbPerMinute(1.35, 1.35);

        Assert.Equal(240.0, afterburner, 6);
        Assert.True(afterburner > military * 2.0);
    }

    [Fact]
    public void SameThrottleHistoryProducesIdenticalFuel() {
        var first = new FuelModel();
        var second = new FuelModel();

        for (int tick = 0; tick < 2400; tick++) {
            double throttle = tick < 600 ? 0.85 : tick < 1800 ? 1.35 : 0.55;
            double thrust = tick < 620 ? 0.85 : tick < 1820 ? 1.35 : 0.55;
            first.Step(1.0 / 120.0, throttle, thrust);
            second.Step(1.0 / 120.0, throttle, thrust);
        }

        Assert.Equal(first.FuelLb, second.FuelLb);
        Assert.Equal(first.BurnLbPerMinute, second.BurnLbPerMinute);
        Assert.Equal(first.FuelTrendLbPerMinute, second.FuelTrendLbPerMinute);
    }

    [Fact]
    public void FuelNeverIncreasesUnderPowerAndClampsAtEmpty() {
        var fuel = new FuelModel(initialFuelLb: 20.0);
        double previous = fuel.FuelLb;

        for (int second = 0; second < 10; second++) {
            fuel.Step(1.0, throttle: 1.35, thrustFraction: 1.35);
            Assert.InRange(fuel.FuelLb, 0.0, previous);
            previous = fuel.FuelLb;
        }

        Assert.Equal(0.0, fuel.FuelLb);
    }
}
