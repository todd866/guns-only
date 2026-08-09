namespace GunsOnly.UnityBridge.Tests;

public sealed class UnityCobraGoldenPathTests
{
    static CobraGoldenPathState State(
        double collective = 0.59,
        bool targetSelected = false,
        string gun = "tracking",
        double victory = 0,
        string lifecycle = "Active") =>
        new(lifecycle, collective, targetSelected, gun, victory);

    [Fact]
    public void SpawnBeginsWithTheWebCollectiveCue()
    {
        var tracker = new CobraGoldenPathTracker();

        CobraGoldenPathCue? cue = tracker.Advance(State());

        Assert.Equal("lift", cue?.Id);
        Assert.Equal("HOLD W — COLLECTIVE UP", cue?.Text);
    }

    [Fact]
    public void LiftHandsOffToTheWebTargetAndEngageCue()
    {
        var tracker = new CobraGoldenPathTracker();

        CobraGoldenPathCue? cue = tracker.Advance(State(collective: 0.68));

        Assert.Equal("acquire-target", cue?.Id);
        Assert.Equal("TAB TO TARGET · HOLD F TO ENGAGE", cue?.Text);
    }

    [Fact]
    public void AuthoritativeTrackingTargetOwnsTheShortFireCue()
    {
        var tracker = new CobraGoldenPathTracker();

        CobraGoldenPathCue? cue = tracker.Advance(State(
            collective: 0.68,
            targetSelected: true,
            gun: "tracking"));

        Assert.Equal("fire", cue?.Id);
        Assert.Equal("HOLD F · GUNS", cue?.Text);
    }

    [Fact]
    public void GunLimitsDoNotGiveFalseFirePermission()
    {
        foreach (string gun in new[] { "outoflimits", "nosolution", "masked" })
        {
            var tracker = new CobraGoldenPathTracker();
            Assert.Null(tracker.Advance(State(
                collective: 0.68,
                targetSelected: true,
                gun: gun)));
        }
    }

    [Fact]
    public void AuthoritativeFiringRetiresTheEngagementCueForTheSortie()
    {
        var tracker = new CobraGoldenPathTracker();

        Assert.Null(tracker.Advance(State(
            collective: 0.59,
            targetSelected: true,
            gun: "firing")));
        Assert.Null(tracker.Advance(State(
            collective: 0.59,
            targetSelected: false,
            gun: "tracking")));
    }

    [Fact]
    public void VictoryProgressAndTerminalLifecycleStaySilent()
    {
        var victory = new CobraGoldenPathTracker();
        var ended = new CobraGoldenPathTracker();

        Assert.Null(victory.Advance(State(collective: 0.68, victory: 0.01)));
        Assert.Null(ended.Advance(State(lifecycle: "Victory")));
    }

    [Fact]
    public void DryGunDefersToTheExistingRearmObjective()
    {
        var tracker = new CobraGoldenPathTracker();

        Assert.Null(tracker.Advance(State(
            collective: 0.68,
            targetSelected: false,
            gun: "dry")));
    }

    [Fact]
    public void SessionKeepsThePreferredGunnerMarkHiddenUntilTabDesignatesIt()
    {
        using UnityCobraSession session = UnityCobraSession.StartRiverGorge();
        PoseSnapshot before = session.CapturePose();

        Assert.False(before.OpponentPresent);
        Assert.False(before.CobraTargetSelected);

        session.FeedKeyCode(CobraGoldenPathTracker.CycleTargetInputCode, true);
        session.FeedKeyCode(CobraGoldenPathTracker.CycleTargetInputCode, false);
        PoseSnapshot designated = session.CapturePose();

        Assert.True(designated.CobraTargetSelected);
        Assert.True(designated.OpponentPresent);
        PoseSnapshot decoded = WireCodec.DecodeFrame(WireCodec.EncodeFrame(designated));
        Assert.True(decoded.CobraTargetSelected);
    }

    [Fact]
    public void TriggerCannotFireBeforeAnAuthoritativeDesignation()
    {
        using UnityCobraSession session = UnityCobraSession.StartRiverGorge();
        PoseSnapshot before = session.CapturePose();

        session.FeedKeyCode(8, true);
        session.AdvanceSeconds(0.75);
        session.FeedKeyCode(8, false);
        PoseSnapshot after = session.CapturePose();

        Assert.False(after.CobraTargetSelected);
        Assert.False(after.OpponentPresent);
        Assert.Equal("none", after.GunStatus);
        Assert.Equal(before.AmmoRounds, after.AmmoRounds);
    }
}
