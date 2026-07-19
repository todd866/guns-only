using GunsOnly.Sim;

namespace GunsOnly.Sim.Tests;

public class FuelModelTests {
    [Fact]
    public void DefaultConstructionUsesPublishedF86FUsableInternalFuel() {
        var fuel = new FuelModel();

        Assert.Equal(2826.0, FuelModel.DefaultFuelLb);
        Assert.Equal(FuelModel.DefaultFuelLb, fuel.CapacityLb);
        Assert.Equal(FuelModel.DefaultFuelLb, fuel.FuelLb);
        Assert.Equal(FuelModel.BingoFuelLb, fuel.BingoThresholdLb);
        Assert.True(fuel.ConsumesFuel);
        Assert.True(fuel.HasFuel);
        Assert.False(fuel.IsBingo);
        Assert.False(fuel.RtbAdvisory);
    }

    [Fact]
    public void SamePhysicalFlowHistoryProducesIdenticalFuel() {
        var first = new FuelModel();
        var second = new FuelModel();

        for (int tick = 0; tick < 2400; tick++) {
            double flow = tick < 600 ? 24.0 : tick < 1800 ? 105.47 : 42.0;
            first.Step(1.0 / 120.0, flow);
            second.Step(1.0 / 120.0, flow);
        }

        Assert.Equal(first.FuelLb, second.FuelLb);
        Assert.Equal(first.BurnLbPerMinute, second.BurnLbPerMinute);
        Assert.Equal(first.SmoothedBurnLbPerMinute, second.SmoothedBurnLbPerMinute);
        Assert.Equal(first.FuelTrendLbPerMinute, second.FuelTrendLbPerMinute);
        Assert.Equal(first.MinutesToBingo, second.MinutesToBingo);
        Assert.Equal(first.EnduranceMinutes, second.EnduranceMinutes);
    }

    [Fact]
    public void TenSecondCockpitFilterLagsButQuantityUsesInstantaneousFlow() {
        var fuel = new FuelModel();
        fuel.Step(1.0, 10.0);
        Assert.Equal(10.0, fuel.BurnLbPerMinute, precision: 12);
        Assert.Equal(10.0, fuel.SmoothedBurnLbPerMinute, precision: 12);

        double beforeStepUp = fuel.FuelLb;
        fuel.Step(10.0, 100.0);

        double expectedFiltered = 100.0 + (10.0 - 100.0) / Math.E;
        Assert.Equal(100.0, fuel.BurnLbPerMinute, precision: 12);
        Assert.Equal(expectedFiltered, fuel.SmoothedBurnLbPerMinute, precision: 10);
        Assert.Equal(beforeStepUp - 100.0 * 10.0 / 60.0, fuel.FuelLb, precision: 10);
        Assert.Equal(-expectedFiltered, fuel.FuelTrendLbPerMinute, precision: 10);
    }

    [Fact]
    public void DecisionTimesUseSmoothedLbPerMinuteAndBecomeNullWhenNotApplicable() {
        var aboveBingo = new FuelModel(initialFuelLb: 1040.0);
        aboveBingo.Step(1.0, 90.0);

        Assert.NotNull(aboveBingo.MinutesToBingo);
        Assert.NotNull(aboveBingo.EnduranceMinutes);
        Assert.Equal((aboveBingo.FuelLb - aboveBingo.BingoThresholdLb) / 90.0,
            aboveBingo.MinutesToBingo!.Value, precision: 10);
        Assert.Equal(aboveBingo.FuelLb / 90.0,
            aboveBingo.EnduranceMinutes!.Value, precision: 10);

        var atBingo = new FuelModel(initialFuelLb: FuelModel.BingoFuelLb);
        Assert.Null(atBingo.MinutesToBingo);
        Assert.Null(atBingo.EnduranceMinutes);
        atBingo.Step(1.0, 45.0);
        Assert.Null(atBingo.MinutesToBingo);
        Assert.NotNull(atBingo.EnduranceMinutes);

        var unpowered = new FuelModel(initialFuelLb: 0.0, capacityLb: 0.0,
            bingoThresholdLb: 0.0, consumesFuel: false);
        unpowered.Step(1.0, 100.0);
        Assert.Null(unpowered.MinutesToBingo);
        Assert.Null(unpowered.EnduranceMinutes);
    }

    [Fact]
    public void FinalPartialTickReturnsSupplyFractionAndClampsAtEmpty() {
        var fuel = new FuelModel(initialFuelLb: 1.0, capacityLb: 1.0,
            bingoThresholdLb: 0.0);

        double supplied = fuel.Step(1.0, 120.0); // requests two pounds

        Assert.Equal(0.5, supplied, 12);
        Assert.Equal(0.0, fuel.FuelLb);
        Assert.False(fuel.HasFuel);
        Assert.Equal(0.0, fuel.BurnLbPerMinute);
        Assert.Equal(0.0, fuel.SmoothedBurnLbPerMinute);
    }

    [Fact]
    public void CrossingBingoLatchesRtbAndProvidesBoatSteering() {
        var fuel = new FuelModel(initialFuelLb: FuelModel.BingoFuelLb + 1.0);
        var position = new Vec3D(0.0, 1200.0, 0.0);
        var boat = new Vec3D(1000.0, 20.0, 1000.0);

        Assert.False(fuel.RtbAdvisory);
        fuel.Step(1.0, 90.0);
        var guidance = fuel.GuidanceTo(position, headingRad: 0.0, boat);

        Assert.True(fuel.IsBingo);
        Assert.True(fuel.RtbAdvisory);
        Assert.True(guidance.Active);
        Assert.Equal(Math.PI / 4.0, guidance.BearingRad, 12);
        Assert.Equal(Math.PI / 4.0, guidance.TurnRad, 12);
        Assert.Equal(Math.Sqrt(2_000_000.0), guidance.RangeM, 9);

        fuel.Step(10.0, 0.0);
        Assert.True(fuel.RtbAdvisory);
        Assert.Equal(guidance, fuel.GuidanceTo(position, headingRad: 0.0, boat));
    }

    [Fact]
    public void EngineLessLoadoutNeverBurnsOrRequestsRtb() {
        var fuel = new FuelModel(
            initialFuelLb: 0.0,
            capacityLb: 0.0,
            bingoThresholdLb: 0.0,
            consumesFuel: false);
        var position = new Vec3D(0.0, 3000.0, 0.0);
        var home = new Vec3D(1000.0, 20.0, 1000.0);

        Assert.True(fuel.HasFuel); // "fuel available" means this loadout is not fuel-constrained.
        fuel.Step(600.0, 105.47);

        Assert.Equal(0.0, fuel.FuelLb);
        Assert.Equal(0.0, fuel.BurnLbPerMinute);
        Assert.Equal(0.0, fuel.SmoothedBurnLbPerMinute);
        Assert.Equal(0.0, fuel.FuelTrendLbPerMinute);
        Assert.Null(fuel.MinutesToBingo);
        Assert.Null(fuel.EnduranceMinutes);
        Assert.False(fuel.IsBingo);
        Assert.False(fuel.RtbAdvisory);
        Assert.False(fuel.GuidanceTo(position, headingRad: 0.0, home).Active);
    }
}
