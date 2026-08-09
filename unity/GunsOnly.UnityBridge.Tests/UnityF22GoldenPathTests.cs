namespace GunsOnly.UnityBridge.Tests;

public sealed class UnityF22GoldenPathTests
{
    [Fact]
    public void ActiveMergeBeginsWithPadlockCue()
    {
        FirstMergeGoldenPathCue? cue = FirstMergeGoldenPath.Resolve(
            "Active", true, false, false, false, 0, false);

        Assert.Equal("acquire-padlock", cue?.Id);
        Assert.Equal("V · PADLOCK TARGET", cue?.Text);
    }

    [Fact]
    public void PadlockHandsOffToFlightDirectorUntilSolution()
    {
        Assert.Null(FirstMergeGoldenPath.Resolve(
            "Active", true, false, true, false, 0, false));
    }

    [Fact]
    public void QualifiedSolutionOwnsFireCue()
    {
        FirstMergeGoldenPathCue? cue = FirstMergeGoldenPath.Resolve(
            "Active", true, false, true, true, 0, false);

        Assert.Equal("fire-guns", cue?.Id);
        Assert.Equal("HOLD F · GUNS", cue?.Text);
    }

    [Theory]
    [InlineData("Ready", true, false, false, false, 0, false)]
    [InlineData("Active", false, false, false, false, 0, false)]
    [InlineData("Active", true, true, false, false, 0, false)]
    [InlineData("Active", true, false, true, true, 1, false)]
    [InlineData("Active", true, false, true, true, 0, true)]
    public void CueRetiresOutsideTheFirstSuccessPath(
        string lifecycle,
        bool opponentPresent,
        bool weaponsHold,
        bool padlockSelected,
        bool gunSolution,
        int playerHits,
        bool triggerHeld)
    {
        Assert.Null(FirstMergeGoldenPath.Resolve(
            lifecycle,
            opponentPresent,
            weaponsHold,
            padlockSelected,
            gunSolution,
            playerHits,
            triggerHeld));
    }
}
