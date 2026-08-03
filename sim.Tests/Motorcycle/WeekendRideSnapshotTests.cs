using GunsOnly.Sim.Motorcycle;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Motorcycle;

public sealed class WeekendRideSnapshotTests
{
    static MotorcyclePilotCommand SteadyThrottle =>
        new(0.35, 0.0, 0.0, 0.0, 0.0, 0, 1.0, MotorcycleClutchMode.Auto);

    [Fact]
    public void SnapshotPublishesSimClutchEngagementAndRiderInputs()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();
        var launch = SteadyThrottle with {
            Throttle = 0.5,
            RiderLateral = 0.4,
            RiderForeAft = -0.2,
        };
        for (int i = 0; i < 30; i++)
            runtime.StepFixed(launch);

        WeekendRideSnapshot snap = runtime.Snapshot();

        Assert.Equal(MotorcycleClutchMode.Auto, snap.ClutchMode);
        Assert.InRange(snap.ClutchEngagement, 0.35, 0.99);
        Assert.Equal(0.4, snap.RiderLateral, 3);
        Assert.Equal(-0.2, snap.RiderForeAft, 3);
    }

    [Fact]
    public void TipRecoveryFlashSurvivesAutoResetSnapshot()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();
        runtime.DebugForceTipOver();
        runtime.StepFixed(SteadyThrottle);

        WeekendRideSnapshot snap = runtime.Snapshot();

        Assert.False(snap.IsTippedOver);
        Assert.InRange(snap.TipRecoveryFlashSeconds, 1.0, 1.5);
    }

    [Fact]
    public void SnapshotIncludesLeanAndHeadStabilizedView()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();
        var turn = SteadyThrottle with { Steer = 0.8, RiderLateral = 0.6 };
        for (int i = 0; i < 120 * 8; i++)
            runtime.StepFixed(turn);

        WeekendRideSnapshot snap = runtime.Snapshot();

        Assert.True(Math.Abs(snap.LeanRad) > 0.0);
        Assert.True(Math.Abs(snap.ViewRollRad) < Math.Abs(snap.LeanRad));
    }

    [Fact]
    public void SnapshotPublishesContactPatchForcesGripAndCog()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();
        for (int i = 0; i < 120 * 4; i++)
            runtime.StepFixed(SteadyThrottle with { Throttle = 0.7 });

        WeekendRideSnapshot cruise = runtime.Snapshot();
        Assert.InRange(cruise.CogAlongFromRearM, 0.2, YzfR1Definition.WheelbaseM - 0.2);
        Assert.True(cruise.RearLongitudinalForceN > 50.0,
            $"Expected drive at rear, got {cruise.RearLongitudinalForceN:F1} N.");

        for (int i = 0; i < 60; i++)
            runtime.StepFixed(SteadyThrottle with { Throttle = 0.0, Brake = 1.0 });

        WeekendRideSnapshot braking = runtime.Snapshot();
        Assert.True(braking.CogAlongFromRearM > cruise.CogAlongFromRearM + 0.05,
            $"Expected CoG forward under braking: cruise={cruise.CogAlongFromRearM:F3} "
            + $"brake={braking.CogAlongFromRearM:F3}.");
        Assert.True(braking.FrontNormalForceN > cruise.FrontNormalForceN);
        Assert.True(braking.FrontLongitudinalForceN < -50.0);
        Assert.InRange(braking.FrontGripUse, 0.0, 1.0);
        Assert.InRange(braking.RearGripUse, 0.0, 1.0);
    }

    [Fact]
    public void RiderLateralWeightShiftMovesContactPlaneCogSideways()
    {
        var left = WeekendRideMissionRuntime.CreateDefault();
        var right = WeekendRideMissionRuntime.CreateDefault();
        left.Begin();
        right.Begin();
        var baseCmd = SteadyThrottle with { Throttle = 0.45 };
        for (int i = 0; i < 120 * 3; i++)
        {
            left.StepFixed(baseCmd with { RiderLateral = -0.8 });
            right.StepFixed(baseCmd with { RiderLateral = 0.8 });
        }

        Assert.True(right.Snapshot().CogLateralM > left.Snapshot().CogLateralM + 0.02);
    }
}
