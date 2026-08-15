using GunsOnly.Sim.Okanagan;

namespace GunsOnly.Sim.Tests.Okanagan;

public sealed class FireBossDynamicsTests
{
    [Fact]
    public void TwinScoopsFillPublishedLoadInTwelveToFifteenSecondBand()
    {
        FireBossDynamics aircraft = FireBossDynamics.OnScoopLane();
        var scoop = new FireBossPilotCommand(0.0, 0.0, 0.0, 0.78, true, false);
        double seconds = 0.0;
        while (aircraft.Telemetry.WaterLoadKg < FireBossDynamics.MaximumWaterKg - 0.1
            && seconds < 20.0)
        {
            aircraft.Step(scoop);
            seconds += FireBossDynamics.FixedDeltaSeconds;
        }

        Assert.InRange(seconds, 12.0, 15.5);
        Assert.InRange(aircraft.Telemetry.WaterLoadKg,
            FireBossDynamics.MaximumWaterKg - 0.1, FireBossDynamics.MaximumWaterKg);
        Assert.True(aircraft.Telemetry.ScoopValid);
    }

    [Fact]
    public void ReleasingScoopsKeepsARealPartialLoad()
    {
        FireBossDynamics aircraft = FireBossDynamics.OnScoopLane();
        StepFor(aircraft, 5.0, new FireBossPilotCommand(0, 0, 0, 0.78, true, false));
        double partial = aircraft.Telemetry.WaterLoadKg;
        StepFor(aircraft, 3.0, new FireBossPilotCommand(0, 0, 0, 0.55, false, false));

        Assert.InRange(partial, 700.0, 1_400.0);
        Assert.InRange(aircraft.Telemetry.WaterLoadKg, partial,
            partial + FireBossDynamics.ScoopNominalRateKgPerSecond * 1.05);
        Assert.False(aircraft.Telemetry.ScoopsCommanded);
    }

    [Fact]
    public void BankedWaterRunRefusesTheScoop()
    {
        FireBossDynamics aircraft = FireBossDynamics.OnScoopLane();
        StepFor(aircraft, 1.2, new FireBossPilotCommand(0, 1, 0, 0.55, true, false));

        Assert.False(aircraft.Telemetry.ScoopValid);
        Assert.Equal("WINGS LEVEL", aircraft.Telemetry.ScoopFault);
        Assert.Equal(0.0, aircraft.Telemetry.WaterLoadKg);
    }

    [Fact]
    public void FullLoadMakesTheWaterRunAccelerateMoreSlowly()
    {
        FireBossDynamics empty = FireBossDynamics.OnScoopLane();
        FireBossDynamics loaded = FireBossDynamics.OnScoopLane();
        StepFor(loaded, 14.0, new FireBossPilotCommand(0, 0, 0, 0.78, true, false));
        var accelerate = new FireBossPilotCommand(0, 0, 0, 1.0, false, false);
        StepFor(empty, 4.0, accelerate);
        StepFor(loaded, 4.0, accelerate);

        Assert.True(empty.Telemetry.TrueAirspeedMps > loaded.Telemetry.TrueAirspeedMps + 2.0);
        Assert.True(loaded.Telemetry.GrossMassKg > empty.Telemetry.GrossMassKg + 3_000.0);
    }

    [Fact]
    public void FuelPlanProtectsReturnOperationalFinalAndTaxiFuel()
    {
        Vec3D lake = OkanaganGeo.ToWorld(49.84, -119.57, 700.0);
        FireBossFuelSnapshot plan = FireBossFuelPlan.Snapshot(
            FireBossFuelPlan.WaterCircuitsBlockFuelKg, 500.0, lake, 3);

        Assert.Equal(225.0, plan.FinalReserveKg);
        Assert.Equal(plan.ReturnTripKg + plan.OperationalReserveKg
            + plan.FinalReserveKg + plan.TaxiInKg, plan.MinimumRtbFuelKg, precision: 6);
        Assert.DoesNotContain("PERCENT", plan.State);
    }

    [Fact]
    public void FireBossCanDepartKelownaWithoutHittingAFictionalTerrainWall()
    {
        FireBossDynamics aircraft = FireBossDynamics.AtKelownaDeparture(
            FireBossFuelPlan.FireAttackBlockFuelKg);
        StepFor(aircraft, 30.0, new FireBossPilotCommand(0.42, 0, 0, 1.0, false, false));

        Assert.True(aircraft.Telemetry.Flyable);
        Assert.Equal(FireBossSurfaceMode.Airborne, aircraft.Telemetry.SurfaceMode);
        Assert.True(aircraft.Telemetry.PositionWorldM.Y > 500.0);
        Assert.True(aircraft.Telemetry.TrueAirspeedMps > 45.0);
    }

    [Fact]
    public void AuthoredScoopApproachLandsOnWaterRatherThanTerrain()
    {
        FireBossDynamics aircraft = FireBossDynamics.OnScoopApproach();
        StepFor(aircraft, 12.0, new FireBossPilotCommand(-0.28, 0, 0, 0.48, false, false));

        Assert.True(aircraft.Telemetry.Flyable);
        Assert.Equal(FireBossSurfaceMode.Water, aircraft.Telemetry.SurfaceMode);
    }

    [Fact]
    public void ScoopAuthorityNeverExceedsMaximumGrossMass()
    {
        FireBossDynamics aircraft = FireBossDynamics.OnScoopLane(760.0);
        var scoop = new FireBossPilotCommand(0, 0, 0, 0.78, true, false);
        for (int tick = 0; tick < 20.0 / FireBossDynamics.FixedDeltaSeconds
            && aircraft.Telemetry.GrossMassKg < FireBossDynamics.MaximumGrossMassKg - 0.02; tick++)
            aircraft.Step(scoop);
        aircraft.Step(scoop);

        Assert.True(aircraft.Telemetry.GrossMassKg <= FireBossDynamics.MaximumGrossMassKg + 0.01);
        Assert.True(aircraft.Telemetry.WaterLoadKg < FireBossDynamics.MaximumWaterKg);
    }

    [Fact]
    public void EmptyFuelTankRemovesEngineThrust()
    {
        FireBossDynamics powered = FireBossDynamics.OnScoopLane(610.0);
        FireBossDynamics exhausted = FireBossDynamics.OnScoopLane(1.0);
        var command = new FireBossPilotCommand(0, 0, 0, 1.0, false, false);
        StepFor(powered, 16.0, command);
        StepFor(exhausted, 16.0, command);

        Assert.Equal(0.0, exhausted.Telemetry.FuelKg);
        Assert.True(powered.Telemetry.TrueAirspeedMps > exhausted.Telemetry.TrueAirspeedMps + 8.0);
    }

    [Fact]
    public void AuthoredRunwaySixteenFinalCanLandWithoutTerrainFalsePositive()
    {
        FireBossDynamics aircraft = FireBossDynamics.OnKelownaFinal();
        StepFor(aircraft, 28.0, new FireBossPilotCommand(-0.32, 0, 0, 0.30, false, false));

        Assert.True(aircraft.Telemetry.Flyable);
        Assert.Equal(FireBossSurfaceMode.Runway, aircraft.Telemetry.SurfaceMode);
    }

    static void StepFor(FireBossDynamics aircraft, double seconds,
        FireBossPilotCommand command)
    {
        int ticks = (int)Math.Ceiling(seconds / FireBossDynamics.FixedDeltaSeconds);
        for (int tick = 0; tick < ticks; tick++) aircraft.Step(command);
    }
}
