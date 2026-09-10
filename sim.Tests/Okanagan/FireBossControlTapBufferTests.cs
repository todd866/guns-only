using System.Text.Json;
using GunsOnly.Sim.Okanagan;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests.Okanagan;

public sealed class FireBossControlTapBufferTests
{
    static FireBossPilotCommand Neutral => new(0, 0, 0, 0.8, false, false, 0.12);

    [Theory]
    [InlineData(0, 1.0)]
    [InlineData(0, -1.0)]
    [InlineData(1, 1.0)]
    [InlineData(1, -1.0)]
    [InlineData(2, 1.0)]
    [InlineData(2, -1.0)]
    public void UnsampledHundredMillisecondTapHasSameImpulseAtEveryRenderCadence(int axis, double sign)
    {
        double[] totals = { 0, 0, 0 };
        foreach (int ticksPerFrame in new[] { 1, 2, 12 })
        {
            var taps = new FireBossControlTapBuffer();
            taps.Queue(axis, sign, 0.1);
            int emitted = 0;
            for (int frame = 0; frame < 24 / ticksPerFrame; frame++)
                for (int tick = 0; tick < ticksPerFrame; tick++)
                {
                    FireBossPilotCommand command = taps.Apply(Neutral);
                    double[] values = { command.Pitch, command.Roll, command.Yaw };
                    if (values[axis] != 0) emitted++;
                    Assert.Equal(emitted <= 12 && values[axis] != 0 ? sign : 0, values[axis]);
                    Assert.Equal(Neutral.ElevatorTrim, command.ElevatorTrim);
                    Assert.Equal(Neutral.Throttle, command.Throttle);
                    for (int other = 0; other < 3; other++)
                        if (other != axis) Assert.Equal(0, values[other]);
                }
            Assert.Equal(12, emitted);
            totals[axis] = emitted * FireBossDynamics.FixedDeltaSeconds;
        }
        Assert.Equal(0.1, totals[axis], 10);
    }

    [Fact]
    public void TinyAndLongPressesRemainBoundedAndNeutralReturnsWithoutAReleaseCallback()
    {
        foreach ((double duration, int expected) in new[] { (0.0, 2), (0.001, 2), (9.0, 12) })
        {
            var taps = new FireBossControlTapBuffer();
            taps.Queue(0, 1, duration);
            for (int i = 0; i < expected; i++) Assert.Equal(1, taps.Apply(Neutral).Pitch);
            Assert.Equal(0, taps.Apply(Neutral).Pitch);
            Assert.Equal(expected, taps.PitchTicks);
        }
    }

    [Fact]
    public void BurstsCannotBuildABacklogAndOppositePendingTapsCancel()
    {
        var taps = new FireBossControlTapBuffer();
        for (int i = 0; i < 1000; i++) taps.Queue(1, 1, 0.1);
        for (int i = 0; i < 12; i++) Assert.Equal(1, taps.Apply(Neutral).Roll);
        Assert.Equal(0, taps.Apply(Neutral).Roll);
        taps.Queue(1, 1, 0.1);
        taps.Queue(1, -1, 0.1);
        Assert.Equal(0, taps.Apply(Neutral).Roll);
    }

    [Fact]
    public void HeldInputOwnsAxisAndFocusOrPauseClearDropsEveryPendingPulse()
    {
        var taps = new FireBossControlTapBuffer();
        taps.Queue(0, 1, 0.1);
        taps.Queue(1, 1, 0.1);
        Assert.Equal(-0.5, taps.Apply(Neutral with { Pitch = -0.5 }).Pitch);
        Assert.True(taps.Apply(Neutral).Pitch == 0, "held input cancels its pending replay");
        taps.Clear();
        Assert.Equal(Neutral, taps.Apply(Neutral));
        taps.Queue(2, 1, 0.1);
        taps.Reset();
        Assert.Equal(Neutral, taps.Apply(Neutral));
        Assert.Equal(0, taps.RollTicks);
    }

    [Fact]
    public void BrowserProjectionCarriesPilotTrimAndCompletedWithinFrameTapEvidence()
    {
        var mission = OkanaganFireMission.Create(OkanaganSortieType.WaterCircuits);
        var taps = new FireBossControlTapBuffer();
        taps.Queue(0, 1, 0.05);
        FireBossPilotCommand applied = Neutral;
        for (int tick = 0; tick < 12; tick++) mission.Step(applied = taps.Apply(Neutral));
        using JsonDocument json = JsonDocument.Parse(OkanaganSnapshotProjection.BuildStateJson(mission, applied, taps));
        Assert.Equal(0.12, json.RootElement.GetProperty("elevator_trim").GetDouble());
        Assert.Equal(0, json.RootElement.GetProperty("applied_controls").GetProperty("pitch").GetDouble());
        Assert.Equal(6, json.RootElement.GetProperty("input_tap_ticks").GetProperty("pitch").GetInt64());
    }

    [Fact]
    public void PendingNeutralAndTrimChangesDoNotRewriteTheLastFlownCommand()
    {
        var mission = OkanaganFireMission.Create(OkanaganSortieType.WaterCircuits);
        FireBossPilotCommand applied = Neutral with { Pitch = 0.35, Roll = -0.2, Yaw = 0.1,
            DropRequested = true };
        mission.Step(applied);
        FireBossPilotCommand pending = applied with { Pitch = 0, Roll = 0, Yaw = 0,
            DropRequested = false, ElevatorTrim = 0.14 };
        using JsonDocument json = JsonDocument.Parse(OkanaganSnapshotProjection.BuildStateJson(
            mission, applied, pendingCommand: pending));
        JsonElement flown = json.RootElement.GetProperty("applied_controls");
        JsonElement queued = json.RootElement.GetProperty("pending_controls");
        Assert.Equal(0.35, flown.GetProperty("pitch").GetDouble());
        Assert.Equal(-0.2, flown.GetProperty("roll").GetDouble());
        Assert.True(flown.GetProperty("drop").GetBoolean());
        Assert.Equal(0.12, flown.GetProperty("elevator_trim").GetDouble());
        Assert.Equal(0.12, json.RootElement.GetProperty("elevator_trim").GetDouble());
        foreach (string axis in new[] { "pitch", "roll", "yaw" })
            Assert.Equal(0, queued.GetProperty(axis).GetDouble());
        Assert.False(queued.GetProperty("drop").GetBoolean());
        Assert.Equal(0.14, queued.GetProperty("elevator_trim").GetDouble());
        Assert.Equal(0.8, queued.GetProperty("throttle").GetDouble());
    }
}
