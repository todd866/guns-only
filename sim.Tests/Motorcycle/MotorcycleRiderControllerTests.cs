using GunsOnly.Sim.Motorcycle;

namespace GunsOnly.Sim.Tests.Motorcycle;

public sealed class MotorcycleRiderControllerTests
{
    static MotorcycleRiderIntent RightTurnIntent => new(
        Throttle: 0.7,
        Brake: 0.0,
        Turn: 1.0,
        BodyLateralBias: 0.0,
        BodyForeAftBias: 0.0,
        GearShiftRequest: 0,
        Clutch: 1.0,
        ClutchMode: MotorcycleClutchMode.Auto);

    static MotorcycleRiderFeedback StableAtSpeed => new(
        SpeedMps: 24.0,
        LeanRad: 0.0,
        LeanRateRadPerSec: 0.0,
        PitchRad: 0.0,
        PitchRateRadPerSec: 0.0,
        FrontGripUse: 0.25,
        RearGripUse: 0.25,
        WheelieBalance: -1.0,
        StoppieBalance: -1.0,
        IsSliding: false);

    [Fact]
    public void RawModeMapsPlayerAxesWithoutReflexIntervention()
    {
        var controller = new MotorcycleRiderController();
        MotorcycleRiderIntent intent = RightTurnIntent with {
            Brake = 0.2,
            BodyLateralBias = -0.4,
            BodyForeAftBias = 0.6,
            GearShiftRequest = 1,
            Clutch = 0.3,
            ClutchMode = MotorcycleClutchMode.Manual,
        };

        MotorcyclePilotCommand command = controller.Step(
            intent,
            StableAtSpeed with { WheelieBalance = 1.0, IsSliding = true },
            MotorcycleControlMode.Raw);

        Assert.Equal(intent.Throttle, command.Throttle);
        Assert.Equal(intent.Brake, command.Brake);
        Assert.Equal(intent.Turn, command.Steer);
        Assert.Equal(intent.BodyLateralBias, command.RiderLateral);
        Assert.Equal(intent.BodyForeAftBias, command.RiderForeAft);
        Assert.Equal(intent.GearShiftRequest, command.GearShiftRequest);
        Assert.Equal(intent.Clutch, command.Clutch);
        Assert.Equal(intent.ClutchMode, command.ClutchMode);
    }

    [Fact]
    public void AssistedTurnHasReactionLatencyAndRateLimitedCountersteer()
    {
        var controller = new MotorcycleRiderController();
        MotorcyclePilotCommand command = default;

        for (int tick = 0; tick < MotorcycleRiderController.AssistedReactionDelayTicks; tick++)
        {
            command = controller.Step(
                RightTurnIntent,
                StableAtSpeed,
                MotorcycleControlMode.Assisted);
            Assert.Equal(0.0, command.Steer, precision: 8);
        }

        command = controller.Step(
            RightTurnIntent,
            StableAtSpeed,
            MotorcycleControlMode.Assisted);

        Assert.InRange(
            command.Steer,
            0.001,
            MotorcycleRiderController.MaximumSteerRatePerSecond / 120.0 + 1e-9);
        Assert.True(command.RiderLateral > 0.0);
    }

    [Fact]
    public void AssistedReflexTrimsWheelieAndStoppieCommands()
    {
        var wheelieController = new MotorcycleRiderController();
        var stoppieController = new MotorcycleRiderController();
        MotorcycleRiderIntent wheelieIntent = RightTurnIntent with { Turn = 0.0, Throttle = 1.0 };
        MotorcycleRiderIntent stoppieIntent = RightTurnIntent with {
            Turn = 0.0,
            Throttle = 0.0,
            Brake = 1.0,
        };

        MotorcyclePilotCommand wheelie = wheelieController.Step(
            wheelieIntent,
            StableAtSpeed with { WheelieBalance = 1.0 },
            MotorcycleControlMode.Assisted);
        MotorcyclePilotCommand stoppie = stoppieController.Step(
            stoppieIntent,
            StableAtSpeed with { StoppieBalance = 1.0 },
            MotorcycleControlMode.Assisted);

        Assert.True(wheelie.Throttle < wheelieIntent.Throttle);
        Assert.True(wheelie.RiderForeAft > 0.0);
        Assert.True(stoppie.Brake < stoppieIntent.Brake);
        Assert.True(stoppie.RiderForeAft < 0.0);
    }

    [Fact]
    public void AssistedThrottleIsProgressiveWhileRawRemainsDirect()
    {
        var assistedController = new MotorcycleRiderController();
        var rawController = new MotorcycleRiderController();
        MotorcycleRiderIntent launch = RightTurnIntent with { Turn = 0.0, Throttle = 1.0 };

        MotorcyclePilotCommand assisted = assistedController.Step(
            launch,
            StableAtSpeed,
            MotorcycleControlMode.Assisted);
        MotorcyclePilotCommand raw = rawController.Step(
            launch,
            StableAtSpeed,
            MotorcycleControlMode.Raw);

        Assert.InRange(
            assisted.Throttle,
            0.001,
            MotorcycleRiderController.MaximumThrottleRatePerSecond / 120.0 + 1e-9);
        Assert.Equal(1.0, raw.Throttle);
    }

    [Fact]
    public void RuntimeAssistedIntentSmoothlyMovesTheRider()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();

        for (int tick = 0; tick < MotorcycleRiderController.AssistedReactionDelayTicks; tick++)
            runtime.StepFixed(RightTurnIntent, MotorcycleControlMode.Assisted);
        Assert.Equal(0.0, runtime.Bike.Telemetry.RiderLateral, precision: 8);

        for (int tick = 0; tick < 60; tick++)
            runtime.StepFixed(RightTurnIntent, MotorcycleControlMode.Assisted);

        Assert.InRange(runtime.Bike.Telemetry.RiderLateral, 0.05, 0.8);
        Assert.InRange(runtime.Bike.Telemetry.RiderForeAft, -1.0, 1.0);
    }
}
