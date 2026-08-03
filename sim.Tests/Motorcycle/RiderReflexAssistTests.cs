using GunsOnly.Sim.Motorcycle;

namespace GunsOnly.Sim.Tests.Motorcycle;

public sealed class RiderReflexAssistTests
{
    static readonly double GrossNormalN = YzfR1Definition.CombinedMassKg * 9.80665;

    [Fact]
    public void PitchReflexPeaksNearWheelieBalanceAndIsIdleWhenBothWheelsLoaded()
    {
        var nearBalance = RiderReflexAssists.Evaluate(
            frontNormalN: GrossNormalN * 0.04,
            rearNormalN: GrossNormalN * 0.96,
            pitchRateRadps: 0.5,
            leanRad: 0.0,
            riderLateral: 0.0,
            previousKneeDown: false);

        var cruise = RiderReflexAssists.Evaluate(
            frontNormalN: GrossNormalN * 0.48,
            rearNormalN: GrossNormalN * 0.52,
            pitchRateRadps: 0.0,
            leanRad: 0.0,
            riderLateral: 0.0,
            previousKneeDown: false);

        Assert.InRange(nearBalance.PitchReflexAuthority, 0.4, 1.0);
        Assert.Equal(0.0, cruise.PitchReflexAuthority, 3);
        Assert.True(nearBalance.WheelieBalance > cruise.WheelieBalance);
    }

    [Fact]
    public void KneeDownRequiresHighLeanAndLateralWeightShiftNotPitch()
    {
        var pitchedUpright = RiderReflexAssists.Evaluate(
            frontNormalN: GrossNormalN * 0.02,
            rearNormalN: GrossNormalN * 0.98,
            pitchRateRadps: 1.2,
            leanRad: 0.0,
            riderLateral: 0.0,
            previousKneeDown: false);

        var carved = RiderReflexAssists.Evaluate(
            frontNormalN: GrossNormalN * 0.45,
            rearNormalN: GrossNormalN * 0.55,
            pitchRateRadps: 0.0,
            leanRad: -0.45,
            riderLateral: 0.85,
            previousKneeDown: false);

        var carvedWithoutKnee = RiderReflexAssists.Evaluate(
            frontNormalN: GrossNormalN * 0.45,
            rearNormalN: GrossNormalN * 0.55,
            pitchRateRadps: 0.0,
            leanRad: -0.45,
            riderLateral: 0.0,
            previousKneeDown: false);

        Assert.False(pitchedUpright.KneeDown);
        Assert.True(carved.KneeDown);
        Assert.True(carved.LeanHoldAuthority > carvedWithoutKnee.LeanHoldAuthority);
        Assert.True(carved.KneeProximity > carvedWithoutKnee.KneeProximity);
    }

    [Fact]
    public void PitchAndKneeChannelsDoNotShareLatchState()
    {
        var wheelieLatchAttempt = RiderReflexAssists.Evaluate(
            frontNormalN: GrossNormalN * 0.03,
            rearNormalN: GrossNormalN * 0.97,
            pitchRateRadps: 0.8,
            leanRad: 0.0,
            riderLateral: 0.0,
            previousKneeDown: true);

        Assert.True(wheelieLatchAttempt.PitchReflexAuthority > 0.3);
        Assert.False(wheelieLatchAttempt.KneeDown);
    }

    [Fact]
    public void PitchRegimeClearsKneeLatchEvenInDeepCarve()
    {
        var carvedWheelie = RiderReflexAssists.Evaluate(
            frontNormalN: GrossNormalN * 0.03,
            rearNormalN: GrossNormalN * 0.97,
            pitchRateRadps: 0.8,
            leanRad: -0.45,
            riderLateral: 0.85,
            previousKneeDown: true);

        Assert.True(carvedWheelie.PitchReflexAuthority > 0.3);
        Assert.False(carvedWheelie.KneeDown);
        Assert.Equal(0.0, carvedWheelie.LeanHoldAuthority);
    }

    [Fact]
    public void StoppieBalancePeaksWhenFrontDominatesLoad()
    {
        var stoppie = RiderReflexAssists.Evaluate(
            frontNormalN: GrossNormalN * 0.92,
            rearNormalN: GrossNormalN * 0.08,
            pitchRateRadps: -0.4,
            leanRad: 0.0,
            riderLateral: 0.0,
            previousKneeDown: false);

        Assert.InRange(stoppie.StoppieBalance, 0.4, 1.0);
        Assert.InRange(stoppie.PitchReflexAuthority, 0.4, 1.0);
    }
}
