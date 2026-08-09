using GunsOnly.Sim;

namespace GunsOnly.UnityBridge.Tests;

public sealed class UnityRapierGoldenPathTests
{
    [Fact]
    public void MissionPhaseLineUsesDirectorAuthority()
    {
        RapierGoldenPathCue? cue = RapierGoldenPath.Resolve(
            (int)RapierMissionPhase.RamClimb,
            automationEnabled: true,
            automationActive: true,
            circuitLeg: null,
            recoveryGate: 0,
            jobToken: null,
            dronesRemaining: 4,
            triggerHeld: false);

        Assert.Equal("AUTO · RAM CLIMB", cue?.Text);
        Assert.False(cue!.Value.Actionable);
    }

    [Theory]
    [InlineData("TRANSPORT", "HOLD F · GUNS")]
    [InlineData("BALLOON", "HOLD F · GUNS")]
    [InlineData("FORMATION_INTERCEPT", "HOLD F · RELEASE SWARM · 3")]
    public void AttackUsesJobAndAuthoritativeInventory(string job, string expected)
    {
        RapierGoldenPathCue? cue = RapierGoldenPath.Resolve(
            (int)RapierMissionPhase.Attack,
            true,
            true,
            null,
            0,
            job,
            3,
            triggerHeld: false);

        Assert.Equal("attack-action", cue?.Id);
        Assert.Equal(expected, cue?.Text);
        Assert.True(cue!.Value.Actionable);
    }

    [Fact]
    public void HeldTriggerHandsBackToThePhaseLine()
    {
        RapierGoldenPathCue? cue = RapierGoldenPath.Resolve(
            (int)RapierMissionPhase.Attack,
            true,
            false,
            null,
            0,
            "BALLOON",
            0,
            triggerHeld: true);

        Assert.Equal("AUTO STBY · ATTACK", cue?.Text);
        Assert.False(cue!.Value.Actionable);
    }

    [Fact]
    public void RecoveryUsesCircuitLegAndGate()
    {
        RapierGoldenPathCue? cue = RapierGoldenPath.Resolve(
            (int)RapierMissionPhase.Recovery,
            true,
            true,
            "SHORT_FINAL",
            3,
            null,
            0,
            false);

        Assert.Equal("AUTO · SHORT FINAL · GATE 3/4", cue?.Text);
        Assert.False(cue!.Value.Actionable);
    }

    [Fact]
    public void CompleteAcknowledgesAndUnavailableStaysSilent()
    {
        Assert.Equal(
            "MISSION COMPLETE",
            RapierGoldenPath.Resolve(
                (int)RapierMissionPhase.Complete, false, false, null, 0, null, 0, false)?.Text);
        Assert.Null(RapierGoldenPath.Resolve(
            (int)RapierMissionPhase.Unavailable, false, false, null, 0, null, 0, false));
        Assert.Null(RapierGoldenPath.Resolve(
            999, false, false, null, 0, null, 0, false));
    }
}
