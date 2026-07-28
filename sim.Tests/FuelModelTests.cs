using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class FuelModelTests {
    [Fact]
    public void DefaultConstructionUsesPublishedF86FUsableInternalFuel() {
        var fuel = new FuelModel();

        Assert.Equal(2826.0, FuelModel.DefaultFuelLb);
        Assert.Equal(FuelModel.DefaultFuelLb, fuel.CapacityLb);
        Assert.Equal(FuelModel.DefaultFuelLb, fuel.FuelLb);
        Assert.Equal(FuelModel.BingoFuelLb, fuel.BingoThresholdLb);
        Assert.Null(fuel.JokerThresholdLb);
        Assert.Null(fuel.MinimumFuelThresholdLb);
        Assert.Null(fuel.EmergencyFuelThresholdLb);
        Assert.True(fuel.ConsumesFuel);
        Assert.True(fuel.HasFuel);
        Assert.False(fuel.IsJoker);
        Assert.False(fuel.IsBingo);
        Assert.False(fuel.IsMinimumFuel);
        Assert.False(fuel.IsEmergencyFuel);
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
    public void F22ExerciseThresholdsPreserveJokerBingoMinimumAndEmergencySemantics() {
        var fuel = new FuelModel(
            initialFuelLb: 6200.0,
            capacityLb: 18000.0,
            bingoThresholdLb: 4000.0,
            consumesFuel: true,
            jokerThresholdLb: 6000.0,
            minimumFuelThresholdLb: 2100.0,
            emergencyFuelThresholdLb: 1200.0);

        fuel.Step(60.0, 200.0);
        Assert.True(fuel.IsJoker);
        Assert.False(fuel.IsBingo);
        Assert.False(fuel.RtbAdvisory,
            "Joker terminates the event; it does not itself command RTB");

        fuel.Step(60.0, 2000.0);
        Assert.True(fuel.IsBingo);
        Assert.True(fuel.RtbAdvisory);
        Assert.False(fuel.IsMinimumFuel);

        fuel.Step(60.0, 1900.0);
        Assert.True(fuel.IsMinimumFuel);
        Assert.False(fuel.IsEmergencyFuel);

        fuel.Step(60.0, 900.0);
        Assert.True(fuel.IsEmergencyFuel);
    }

    [Fact]
    public void FuelDecisionThresholdsValidateCapacityAndOperationalOrder() {
        Assert.Throws<ArgumentOutOfRangeException>(() => new FuelModel(
            capacityLb: 10000.0, bingoThresholdLb: 4000.0,
            jokerThresholdLb: 3000.0));
        Assert.Throws<ArgumentOutOfRangeException>(() => new FuelModel(
            capacityLb: 10000.0, bingoThresholdLb: 4000.0,
            minimumFuelThresholdLb: 5000.0));
        Assert.Throws<ArgumentOutOfRangeException>(() => new FuelModel(
            capacityLb: 10000.0, bingoThresholdLb: 4000.0,
            minimumFuelThresholdLb: 2000.0, emergencyFuelThresholdLb: 2500.0));
        Assert.Throws<ArgumentOutOfRangeException>(() => new FuelModel(
            capacityLb: 10000.0, bingoThresholdLb: 4000.0,
            jokerThresholdLb: 11000.0));
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
    public void RecoveryProjectionUsesSignedGroundClosureAndProtectsLandingReserve() {
        var fuel = new FuelModel(
            initialFuelLb: 5000.0,
            capacityLb: 6000.0,
            bingoThresholdLb: 1000.0);
        fuel.Step(60.0, 200.0);
        var position = Vec3D.Zero;
        var home = new Vec3D(0.0, 120.0, 18_520.0); // ten horizontal NM north
        var northAt100Mps = new Vec3D(0.0, 0.0, 100.0);

        RecoveryNavigationProjection projection = fuel.ProjectRecoveryTo(
            position, northAt100Mps, headingRad: 0.0, home,
            requiredLandingReserveLb: 3000.0, active: true);

        double expectedEtaMinutes = 18_520.0 / 100.0 / 60.0;
        double expectedFuelToHomeLb = 200.0 * expectedEtaMinutes;
        Assert.True(projection.RecoveryPointKnown);
        Assert.True(projection.Guidance.Active);
        Assert.Equal(100.0 * AirData.MpsToKnots,
            projection.ClosureKts!.Value, precision: 10);
        Assert.Equal(expectedEtaMinutes, projection.EtaMinutes!.Value, precision: 10);
        Assert.Equal(expectedFuelToHomeLb,
            projection.FuelToHomeEstimateLb!.Value, precision: 10);
        Assert.Equal(fuel.FuelLb - expectedFuelToHomeLb,
            projection.FuelOnArrivalEstimateLb!.Value, precision: 10);
        Assert.Equal(3000.0, projection.ReserveTargetLb);
        Assert.Equal(fuel.FuelLb - expectedFuelToHomeLb - 3000.0,
            projection.ReserveMarginLb!.Value, precision: 10);
    }

    [Theory]
    [InlineData(0.0, 0.0, -100.0)]
    [InlineData(100.0, 0.0, 0.0)]
    public void RecoveryProjectionWithholdsEtaAndFuelWhenOutboundOrAbeam(
        double eastMps, double upMps, double northMps) {
        var fuel = new FuelModel(
            initialFuelLb: 5000.0,
            capacityLb: 6000.0,
            bingoThresholdLb: 1000.0);
        fuel.Step(60.0, 200.0);

        RecoveryNavigationProjection projection = fuel.ProjectRecoveryTo(
            Vec3D.Zero,
            new Vec3D(eastMps, upMps, northMps),
            headingRad: 0.0,
            new Vec3D(0.0, 120.0, 18_520.0),
            requiredLandingReserveLb: 3000.0,
            active: true);

        Assert.NotNull(projection.ClosureKts);
        Assert.True(projection.ClosureKts <= 0.0);
        Assert.Null(projection.EtaMinutes);
        Assert.Null(projection.FuelToHomeEstimateLb);
        Assert.Null(projection.FuelOnArrivalEstimateLb);
        Assert.Equal(3000.0, projection.ReserveTargetLb);
        Assert.Null(projection.ReserveMarginLb);
    }

    [Fact]
    public void PoweredRecoveryProjectionWaitsForARealFlowSample() {
        var fuel = new FuelModel(
            initialFuelLb: 5000.0,
            capacityLb: 6000.0,
            bingoThresholdLb: 1000.0);

        RecoveryNavigationProjection projection = fuel.ProjectRecoveryTo(
            Vec3D.Zero,
            new Vec3D(0.0, 0.0, 100.0),
            headingRad: 0.0,
            new Vec3D(0.0, 120.0, 18_520.0),
            requiredLandingReserveLb: 3000.0,
            active: false);

        Assert.NotNull(projection.EtaMinutes);
        Assert.Null(projection.FuelToHomeEstimateLb);
        Assert.Null(projection.FuelOnArrivalEstimateLb);
        Assert.Null(projection.ReserveMarginLb);
    }

    [Fact]
    public void OverheadAtAltitudeIsNotACompletedZeroCostRecovery() {
        var fuel = new FuelModel(
            initialFuelLb: 5000.0,
            capacityLb: 6000.0,
            bingoThresholdLb: 1000.0);
        fuel.Step(60.0, 200.0);
        var home = new Vec3D(-55_000.0, 52.5, -55_000.0);

        RecoveryNavigationProjection projection = fuel.ProjectRecoveryTo(
            new Vec3D(home.X, 3000.0, home.Z),
            new Vec3D(0.0, -100.0, 0.0),
            headingRad: 0.0,
            home,
            requiredLandingReserveLb: 3000.0,
            active: true);

        Assert.True(projection.RecoveryPointKnown);
        Assert.True(projection.Guidance.Active);
        Assert.Equal(0.0, projection.Guidance.RangeM);
        Assert.Equal(0.0, projection.ClosureKts);
        Assert.Null(projection.EtaMinutes);
        Assert.Null(projection.FuelToHomeEstimateLb);
        Assert.Null(projection.FuelOnArrivalEstimateLb);
        Assert.Equal(3000.0, projection.ReserveTargetLb);
        Assert.Null(projection.ReserveMarginLb);
    }

    [Fact]
    public void CompletedRecoveryReportsActualFuelAndReserveAtZeroTravelCost() {
        var fuel = new FuelModel(
            initialFuelLb: 5000.0,
            capacityLb: 6000.0,
            bingoThresholdLb: 1000.0);
        fuel.Step(60.0, 200.0);

        RecoveryNavigationProjection projection =
            fuel.ProjectCompletedRecovery(
                new Vec3D(-55_000.0, 120.0, -54_200.0),
                headingRad: 0.0,
                requiredLandingReserveLb: 3000.0);

        Assert.True(projection.RecoveryPointKnown);
        Assert.False(projection.Guidance.Active);
        Assert.Equal(0.0, projection.Guidance.RangeM);
        Assert.Equal(0.0, projection.ClosureKts);
        Assert.Equal(0.0, projection.EtaMinutes);
        Assert.Equal(0.0, projection.FuelToHomeEstimateLb);
        Assert.Equal(fuel.FuelLb, projection.FuelOnArrivalEstimateLb);
        Assert.Equal(3000.0, projection.ReserveTargetLb);
        Assert.Equal(fuel.FuelLb - 3000.0, projection.ReserveMarginLb);
    }

    [Fact]
    public void ModernVisualMergeAuthorsAHomeAndReserveAboveMinimumFuel() {
        BeatSetup beat = Beats.ModernVisualMerge();
        RecoveryPlan plan = Assert.IsType<RecoveryPlan>(beat.RecoveryPlan);

        double horizontalRangeNm = Math.Sqrt(
            Math.Pow(plan.Position.X - beat.Player.Position.X, 2.0)
            + Math.Pow(plan.Position.Z - beat.Player.Position.Z, 2.0)) / 1852.0;
        Assert.InRange(horizontalRangeNm, 40.0, 45.0);
        Assert.Equal(3000.0, plan.RequiredLandingReserveLb);
        Assert.True(plan.RequiredLandingReserveLb
            > beat.FuelLoadout.MinimumFuelThresholdLb);
        Assert.True(plan.RequiredLandingReserveLb
            > beat.FuelLoadout.EmergencyFuelThresholdLb);
        Assert.True(plan.RequiredLandingReserveLb
            < beat.FuelLoadout.BingoThresholdLb);
        ConventionalRunwayGeometry runway =
            Assert.IsType<ConventionalRunwayGeometry>(plan.ConventionalRunway);
        Assert.Equal(3000.0, runway.LengthM);
        Assert.Equal(45.0, runway.WidthM);
        Assert.Equal(106.75, runway.ElevationM);
        Assert.Equal(Math.PI / 2.0, runway.LandingHeadingRad);
        Assert.Equal(new Vec3D(-61_952.0, 106.75, -56_576.0),
            runway.ThresholdPosition);
        Assert.Equal(new Vec3D(-58_952.0, 106.75, -56_576.0),
            runway.FarEndPosition);
        Assert.Null(Beats.RapierIntercept().RecoveryPlan!.ConventionalRunway);
        Assert.Equal(plan, Beats.ModernAceDuel().RecoveryPlan);
    }

    [Fact]
    public void RecoveryPlanAndProjectionRejectInvalidReserveContracts() {
        Assert.Throws<ArgumentException>(() => new RecoveryPlan(
            "", "Runway", Vec3D.Zero, requiredLandingReserveLb: 1000.0));
        Assert.Throws<ArgumentOutOfRangeException>(() => new RecoveryPlan(
            "recovery.test.v1", "Runway", Vec3D.Zero,
            requiredLandingReserveLb: -1.0));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new ConventionalRunwayGeometry(
                thresholdPosition: Vec3D.Zero,
                landingHeadingRad: 0.0,
                lengthM: 0.0,
                widthM: 45.0));
        var runway = new ConventionalRunwayGeometry(
            thresholdPosition: Vec3D.Zero,
            landingHeadingRad: 0.0,
            lengthM: 3000.0,
            widthM: 45.0);
        Assert.Throws<ArgumentOutOfRangeException>(() => new RecoveryPlan(
            "recovery.test.v1",
            "Runway",
            new Vec3D(30.0, 0.0, 300.0),
            requiredLandingReserveLb: 1000.0,
            conventionalRunway: runway));

        var fuel = new FuelModel(
            initialFuelLb: 5000.0,
            capacityLb: 6000.0,
            bingoThresholdLb: 1000.0);
        Assert.Throws<ArgumentOutOfRangeException>(() => fuel.ProjectRecoveryTo(
            Vec3D.Zero,
            new Vec3D(0.0, 0.0, 100.0),
            headingRad: 0.0,
            new Vec3D(0.0, 0.0, 1000.0),
            requiredLandingReserveLb: 6001.0,
            active: true));
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
