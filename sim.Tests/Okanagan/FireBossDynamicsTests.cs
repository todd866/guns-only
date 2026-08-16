using GunsOnly.Sim.Okanagan;

namespace GunsOnly.Sim.Tests.Okanagan;

public sealed class FireBossDynamicsTests
{
    [Fact]
    public void AirborneAuthorityIsTheProductionFixedWingAdapterAndTrajectory()
    {
        FireBossDynamics aircraft = FireBossDynamics.OnScoopApproach();
        AircraftState initial = aircraft.SharedAircraft.State;
        var reference = new AircraftSim(initial,
            FlightModel.At802fFireBossPublicDataSurrogate)
        {
            AerodynamicConfiguration = new AirframeAerodynamicState(
                0.92, 0.0, 0.0, 0.0)
        };
        reference.SeedEnginePowerFraction(0.65);
        var fireBossCommand = new FireBossPilotCommand(
            0.28, 0.36, -0.12, 0.72, false, false);
        PilotCommand sharedCommand = FireBossDynamics.ToSharedPilotCommand(
            fireBossCommand, initial.Bank);

        reference.SetMassKg(aircraft.Telemetry.GrossMassKg);
        reference.Step(sharedCommand, FireBossDynamics.FixedDeltaSeconds);
        aircraft.Step(fireBossCommand);

        AircraftState actual = aircraft.SharedAircraft.State;
        Assert.Equal(FireBossDynamics.DynamicsProviderId,
            GunsOnly.Sim.Vehicles.FixedWingAircraftVehicleAdapter.ProviderId);
        Assert.Equal(1, aircraft.AirbornePhysicsSteps);
        Assert.Equal(reference.State.Position.X, actual.Position.X, precision: 10);
        Assert.Equal(reference.State.Position.Y, actual.Position.Y, precision: 10);
        Assert.Equal(reference.State.Position.Z, actual.Position.Z, precision: 10);
        Assert.Equal(reference.State.Speed, actual.Speed, precision: 10);
        Assert.Equal(reference.State.Gamma, actual.Gamma, precision: 10);
        Assert.Equal(reference.State.Chi, actual.Chi, precision: 10);
        Assert.Equal(reference.State.BodyAttitude.W, actual.BodyAttitude.W, precision: 10);
        Assert.Equal(reference.State.BodyRates.P, actual.BodyRates.P, precision: 10);
        Assert.Equal(reference.State.BodyRates.Q, actual.BodyRates.Q, precision: 10);
        Assert.Equal(reference.State.BodyRates.R, actual.BodyRates.R, precision: 10);
    }

    [Fact]
    public void WaterContactAdvancesTheSurfaceResolverWithoutASecondAirborneSolver()
    {
        FireBossDynamics aircraft = FireBossDynamics.OnScoopLane();

        StepFor(aircraft, 2.0,
            new FireBossPilotCommand(0, 0, 0, 0.65, false, false));

        Assert.Equal(FireBossSurfaceMode.Water, aircraft.Telemetry.SurfaceMode);
        Assert.Equal(0, aircraft.AirbornePhysicsSteps);
        Assert.False(aircraft.SharedAircraft.HasAppliedFlightCommand);
    }

    [Fact]
    public void WaterPayloadCrossesTheSharedAdapterAsAdditiveMassAfterLiftoff()
    {
        FireBossDynamics aircraft = FireBossDynamics.OnScoopLane();
        StepFor(aircraft, 5.0,
            new FireBossPilotCommand(0, 0, 0, 0.76, true, false));
        double partialLoadKg = aircraft.Telemetry.WaterLoadKg;
        int takeoffTicks = 0;
        while (aircraft.Telemetry.SurfaceMode == FireBossSurfaceMode.Water
            && takeoffTicks++ < 30.0 / FireBossDynamics.FixedDeltaSeconds)
            aircraft.Step(new FireBossPilotCommand(1.0, 0, 0, 1.0, false, false));
        aircraft.Step(new FireBossPilotCommand(0.05, 0, 0, 1.0, false, false));

        Assert.Equal(FireBossSurfaceMode.Airborne, aircraft.Telemetry.SurfaceMode);
        Assert.True(partialLoadKg > 500.0);
        Assert.Equal(aircraft.Telemetry.WaterLoadKg,
            aircraft.SharedVehicleState.AdditivePayloadMassKg, precision: 8);
        Assert.InRange(Math.Abs(
            FireBossDynamics.EmptyOperatingMassKg + aircraft.Telemetry.FuelKg
                - aircraft.SharedVehicleState.RecurringBaseMassKg), 0.0, 0.01);
        Assert.InRange(Math.Abs(aircraft.Telemetry.GrossMassKg
            - aircraft.SharedVehicleState.GrossMassKg), 0.0, 0.01);
    }

    [Fact]
    public void ElevatorChangesAngleOfAttackAndLoadBeforeItChangesTheFlightPath()
    {
        FireBossDynamics neutral = FireBossDynamics.OnScoopApproach();
        FireBossDynamics pulling = FireBossDynamics.OnScoopApproach();
        StepFor(neutral, 0.8, new FireBossPilotCommand(0, 0, 0, 0.65, false, false));
        StepFor(pulling, 0.8, new FireBossPilotCommand(0.65, 0, 0, 0.65, false, false));

        Assert.True(pulling.Telemetry.AngleOfAttackRad
            > neutral.Telemetry.AngleOfAttackRad + 1.0 * Math.PI / 180.0);
        Assert.True(pulling.Telemetry.LoadFactor > neutral.Telemetry.LoadFactor + 0.10);
        Assert.True(pulling.Telemetry.PitchRateRadPerSecond > 0.0);
        Assert.True(Math.Abs(pulling.Telemetry.PitchRad - pulling.Telemetry.AngleOfAttackRad
            - Math.Asin(pulling.Telemetry.VerticalSpeedMps
                / pulling.Telemetry.TrueAirspeedMps)) < 0.02,
            "body pitch must emerge from flight path plus angle of attack");
    }

    [Fact]
    public void AileronCommandsRollRateAndReleaseDoesNotSnapTheBankLevel()
    {
        FireBossDynamics aircraft = FireBossDynamics.OnScoopApproach();
        StepFor(aircraft, 0.7, new FireBossPilotCommand(0, 0.8, 0, 0.65, false, false));
        double bankAtRelease = aircraft.Telemetry.RollRad;
        double rateAtRelease = aircraft.Telemetry.RollRateRadPerSecond;
        StepFor(aircraft, 0.25, new FireBossPilotCommand(0, 0, 0, 0.65, false, false));

        Assert.True(Math.Abs(bankAtRelease) > 3.0 * Math.PI / 180.0,
            $"bank {bankAtRelease * 180 / Math.PI:F1} deg");
        Assert.True(Math.Sign(rateAtRelease) == Math.Sign(bankAtRelease));
        Assert.True(Math.Abs(aircraft.Telemetry.RollRad) > Math.Abs(bankAtRelease) * 0.75,
            "neutral stick damps roll rate; it does not command wings level");
        Assert.True(Math.Abs(aircraft.Telemetry.RollRateRadPerSecond)
            < Math.Abs(rateAtRelease));
    }

    [Fact]
    public void Pt6PowerHasSpoolInertiaInsteadOfFollowingTheLeverInstantly()
    {
        FireBossDynamics aircraft = FireBossDynamics.AtKelownaDeparture();
        aircraft.Step(new FireBossPilotCommand(0, 0, 0, 1, false, false));
        double firstTick = aircraft.Telemetry.EnginePowerFraction;
        StepFor(aircraft, 1.0, new FireBossPilotCommand(0, 0, 0, 1, false, false));

        Assert.InRange(firstTick, 0.65, 0.67);
        Assert.InRange(aircraft.Telemetry.EnginePowerFraction, 0.80, 0.88);
        Assert.True(aircraft.Telemetry.EnginePowerFraction < 1.0);
    }

    [Fact]
    public void SharedFlightControlsCanFlyAStableWaterApproach()
    {
        FireBossDynamics aircraft = FireBossDynamics.OnScoopApproach();
        FlyApproachToSurface(aircraft, 30.0, 0.42, -1.25);

        Assert.True(aircraft.Telemetry.Flyable);
        Assert.Equal(FireBossSurfaceMode.Water, aircraft.Telemetry.SurfaceMode);
    }

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

        Assert.True(empty.Telemetry.TrueAirspeedMps > loaded.Telemetry.TrueAirspeedMps + 2.0,
            $"empty {empty.Telemetry.TrueAirspeedMps:F1} m/s, loaded {loaded.Telemetry.TrueAirspeedMps:F1} m/s");
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
        int rotateTicks = 0;
        while (aircraft.Telemetry.SurfaceMode == FireBossSurfaceMode.Runway
            && rotateTicks++ < 15.0 / FireBossDynamics.FixedDeltaSeconds)
            aircraft.Step(new FireBossPilotCommand(0.42, 0, 0, 1.0, false, false));
        StepFor(aircraft, 12.0,
            new FireBossPilotCommand(0.04, 0, 0, 1.0, false, false));

        Assert.True(aircraft.Telemetry.Flyable,
            $"surface {aircraft.Telemetry.SurfaceMode}, altitude {aircraft.Telemetry.PositionWorldM.Y:F1} m, speed {aircraft.Telemetry.TrueAirspeedMps:F1} m/s, vs {aircraft.Telemetry.VerticalSpeedMps:F2}");
        Assert.Equal(FireBossSurfaceMode.Airborne, aircraft.Telemetry.SurfaceMode);
        Assert.True(aircraft.Telemetry.PositionWorldM.Y > 500.0);
        Assert.True(aircraft.Telemetry.TrueAirspeedMps > 45.0);
    }

    [Fact]
    public void AuthoredScoopApproachLandsOnWaterRatherThanTerrain()
    {
        FireBossDynamics aircraft = FireBossDynamics.OnScoopApproach();
        FlyApproachToSurface(aircraft, 30.0, 0.42, -1.25);

        Assert.True(aircraft.Telemetry.Flyable,
            $"surface {aircraft.Telemetry.SurfaceMode}, sink {aircraft.Telemetry.VerticalSpeedMps:F1} m/s, pitch {aircraft.Telemetry.PitchRad * 180 / Math.PI:F1} deg");
        Assert.True(aircraft.Telemetry.SurfaceMode == FireBossSurfaceMode.Water,
            $"surface {aircraft.Telemetry.SurfaceMode}, altitude {aircraft.Telemetry.PositionWorldM.Y:F1} m, sink {aircraft.Telemetry.VerticalSpeedMps:F1} m/s");
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
        FlyApproachToSurface(aircraft, 45.0, 0.30, -1.65);

        Assert.True(aircraft.Telemetry.Flyable,
            $"surface {aircraft.Telemetry.SurfaceMode}, altitude {aircraft.Telemetry.PositionWorldM.Y:F1} m, sink {aircraft.Telemetry.VerticalSpeedMps:F1} m/s, speed {aircraft.Telemetry.TrueAirspeedMps:F1} m/s");
        Assert.True(aircraft.Telemetry.SurfaceMode == FireBossSurfaceMode.Runway,
            $"surface {aircraft.Telemetry.SurfaceMode}, altitude {aircraft.Telemetry.PositionWorldM.Y:F1} m, sink {aircraft.Telemetry.VerticalSpeedMps:F1} m/s");
    }

    static void StepFor(FireBossDynamics aircraft, double seconds,
        FireBossPilotCommand command)
    {
        int ticks = (int)Math.Ceiling(seconds / FireBossDynamics.FixedDeltaSeconds);
        for (int tick = 0; tick < ticks; tick++) aircraft.Step(command);
    }

    static void FlyApproachToSurface(FireBossDynamics aircraft, double maximumSeconds,
        double throttle, double targetVerticalSpeedMps)
    {
        int ticks = (int)Math.Ceiling(maximumSeconds / FireBossDynamics.FixedDeltaSeconds);
        for (int tick = 0; tick < ticks
            && aircraft.Telemetry.SurfaceMode == FireBossSurfaceMode.Airborne; tick++)
        {
            double pitchCommand = Math.Clamp(
                (targetVerticalSpeedMps - aircraft.Telemetry.VerticalSpeedMps) * 0.08,
                -0.24, 0.24);
            aircraft.Step(new FireBossPilotCommand(
                pitchCommand, 0, 0, throttle, false, false));
        }
    }
}
