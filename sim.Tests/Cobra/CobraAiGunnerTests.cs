using GunsOnly.Sim.Cobra;

namespace GunsOnly.Sim.Tests.Cobra;

public class CobraAiGunnerTests
{
    const double FiveDegreesRad = 5.0 * Math.PI / 180.0;

    static CobraAiGunner Create(double acquireSeconds = 0.025,
        double reacquireSeconds = 0.05) => new(new CobraAiGunnerDefinition(
            acquireSeconds,
            reacquireSeconds,
            FiveDegreesRad));

    static CobraGunnerTargetObservation Target(
        string id = "truck-1",
        bool present = true,
        bool friendly = false,
        bool lineOfSight = true,
        bool withinEnvelope = true,
        bool ballisticSolution = true,
        double sightErrorRad = 0.01) => new(
            id,
            present,
            friendly,
            lineOfSight,
            withinEnvelope,
            ballisticSolution,
            sightErrorRad);

    static CobraAiGunnerInput Input(
        long tick,
        string? selected = "truck-1",
        bool consent = true,
        bool armed = true,
        bool serviceable = true,
        CobraGunnerTargetObservation? target = null) => new(
            tick,
            selected,
            consent,
            armed,
            serviceable,
            selected is null ? null : target ?? Target(selected));

    [Fact]
    public void HoldingFireRequestsEngagementOnlyAfterDeterministicAcquisition()
    {
        CobraAiGunner gunner = Create();

        CobraAiGunnerDecision first = gunner.Advance(Input(0));
        CobraAiGunnerDecision second = gunner.Advance(Input(1));
        CobraAiGunnerDecision third = gunner.Advance(Input(2));

        Assert.Equal(CobraAiGunnerState.Acquiring, first.State);
        Assert.Equal(CobraAiGunnerReason.Acquiring, second.Reason);
        Assert.False(first.FireAuthorized);
        Assert.True(third.TrackRequested);
        Assert.True(third.FireAuthorized);
        Assert.Equal(CobraAiGunnerState.Tracking, third.State);
        Assert.Equal(CobraAiGunnerReason.None, third.Reason);
    }

    [Fact]
    public void ReleasingFireImmediatelyMeansCeaseFireWithoutDroppingTrack()
    {
        CobraAiGunner gunner = Create(acquireSeconds: 0.0);
        Assert.True(gunner.Advance(Input(0)).FireAuthorized);

        CobraAiGunnerDecision released = gunner.Advance(Input(1, consent: false));

        Assert.Equal(CobraAiGunnerState.Tracking, released.State);
        Assert.Equal(CobraAiGunnerReason.ConsentReleased, released.Reason);
        Assert.True(released.TrackRequested);
        Assert.False(released.FireAuthorized);
    }

    [Fact]
    public void TabTargetChangeResetsAcquisitionAndReassignsTheAiGunner()
    {
        CobraAiGunner gunner = Create(acquireSeconds: 0.025);
        gunner.Advance(Input(0));
        gunner.Advance(Input(1));
        Assert.True(gunner.Advance(Input(2)).FireAuthorized);

        CobraAiGunnerDecision changed = gunner.Advance(Input(
            3,
            selected: "aaa-2",
            target: Target("aaa-2")));

        Assert.Equal("aaa-2", changed.AssignedTargetId);
        Assert.Equal(CobraAiGunnerState.Acquiring, changed.State);
        Assert.False(changed.FireAuthorized);
    }

    [Fact]
    public void MaskingAndLimitsBreakTrackAndRequireReacquisition()
    {
        CobraAiGunner gunner = Create(acquireSeconds: 0.0, reacquireSeconds: 0.025);
        Assert.True(gunner.Advance(Input(0)).FireAuthorized);

        CobraAiGunnerDecision masked = gunner.Advance(Input(
            1,
            target: Target(lineOfSight: false)));
        CobraAiGunnerDecision limited = gunner.Advance(Input(
            2,
            target: Target(withinEnvelope: false)));
        CobraAiGunnerDecision reacquiring = gunner.Advance(Input(3));

        Assert.Equal(CobraAiGunnerState.Masked, masked.State);
        Assert.Equal(CobraAiGunnerState.OutOfLimits, limited.State);
        Assert.Equal(CobraAiGunnerState.Acquiring, reacquiring.State);
        Assert.False(reacquiring.FireAuthorized);
    }

    [Fact]
    public void InitiallyUnavailableTargetUsesAcquisitionRatherThanReacquisitionTiming()
    {
        CobraAiGunner gunner = Create(acquireSeconds: 0.0, reacquireSeconds: 1.0);

        Assert.Equal(CobraAiGunnerReason.TargetUnavailable, gunner.Advance(Input(
            0,
            target: Target(present: false))).Reason);
        CobraAiGunnerDecision available = gunner.Advance(Input(1));

        Assert.Equal(CobraAiGunnerState.Tracking, available.State);
        Assert.True(available.FireAuthorized);
    }

    [Fact]
    public void FriendlyUnavailableAndUnserviceableTargetsFailClosed()
    {
        CobraAiGunner friendlyGunner = Create(acquireSeconds: 0.0);
        CobraAiGunner unavailableGunner = Create(acquireSeconds: 0.0);
        CobraAiGunner brokenGunner = Create(acquireSeconds: 0.0);

        CobraAiGunnerDecision friendly = friendlyGunner.Advance(Input(
            0,
            target: Target(friendly: true)));
        CobraAiGunnerDecision unavailable = unavailableGunner.Advance(Input(
            0,
            target: Target(present: false)));
        CobraAiGunnerDecision broken = brokenGunner.Advance(Input(
            0,
            serviceable: false));

        Assert.Equal(CobraAiGunnerReason.FriendlyTarget, friendly.Reason);
        Assert.Equal(CobraAiGunnerReason.TargetUnavailable, unavailable.Reason);
        Assert.Equal(CobraAiGunnerReason.TurretUnserviceable, broken.Reason);
        Assert.False(friendly.TrackRequested);
        Assert.False(unavailable.FireAuthorized);
        Assert.False(broken.FireAuthorized);
    }

    [Theory]
    [InlineData(false, true, 0.01, CobraAiGunnerReason.WeaponsSafe)]
    [InlineData(true, false, 0.01, CobraAiGunnerReason.NoBallisticSolution)]
    [InlineData(true, true, 0.10, CobraAiGunnerReason.SightNotCoincident)]
    public void WeaponAndSolutionInterlocksRemainAuthoritative(
        bool armed,
        bool solution,
        double sightErrorRad,
        CobraAiGunnerReason expected)
    {
        CobraAiGunner gunner = Create(acquireSeconds: 0.0);

        CobraAiGunnerDecision decision = gunner.Advance(Input(
            0,
            armed: armed,
            target: Target(ballisticSolution: solution, sightErrorRad: sightErrorRad)));

        Assert.Equal(CobraAiGunnerState.Tracking, decision.State);
        Assert.Equal(expected, decision.Reason);
        Assert.False(decision.FireAuthorized);
    }

    [Theory]
    [InlineData(false, true, 0.01, CobraAiGunnerReason.WeaponsSafe)]
    [InlineData(false, false, 0.01, CobraAiGunnerReason.NoBallisticSolution)]
    [InlineData(false, true, 0.10, CobraAiGunnerReason.WeaponsSafe)]
    [InlineData(true, true, 0.10, CobraAiGunnerReason.SightNotCoincident)]
    [InlineData(true, true, 0.01, CobraAiGunnerReason.ConsentReleased)]
    public void PhysicalAndArmamentGatesOutrankConsentSoHoldFCueIsHonest(
        bool armed,
        bool solution,
        double sightErrorRad,
        CobraAiGunnerReason expected)
    {
        CobraAiGunner gunner = Create(acquireSeconds: 0.0);

        CobraAiGunnerDecision decision = gunner.Advance(Input(
            0,
            consent: false,
            armed: armed,
            target: Target(ballisticSolution: solution, sightErrorRad: sightErrorRad)));

        Assert.Equal(CobraAiGunnerState.Tracking, decision.State);
        Assert.Equal(expected, decision.Reason);
        Assert.False(decision.FireAuthorized);
    }

    [Fact]
    public void NoSelectedTargetCannotBeInventedByHoldingFire()
    {
        CobraAiGunner gunner = Create(acquireSeconds: 0.0);

        CobraAiGunnerDecision decision = gunner.Advance(Input(
            0,
            selected: null,
            consent: true));

        Assert.Equal(CobraAiGunnerState.AwaitingTarget, decision.State);
        Assert.Equal(CobraAiGunnerReason.NoTarget, decision.Reason);
        Assert.Null(decision.AssignedTargetId);
        Assert.False(decision.TrackRequested);
        Assert.False(decision.FireAuthorized);
    }

    [Fact]
    public void FixedTickInputsProduceBitStableCrewDecisions()
    {
        CobraAiGunner first = Create();
        CobraAiGunner second = Create();
        CobraAiGunnerDecision[] firstRun = new CobraAiGunnerDecision[12];
        CobraAiGunnerDecision[] secondRun = new CobraAiGunnerDecision[12];

        for (long tick = 0; tick < firstRun.Length; tick++) {
            bool lineOfSight = tick is not 5 and not 6;
            CobraAiGunnerInput input = Input(
                tick,
                target: Target(lineOfSight: lineOfSight));
            firstRun[tick] = first.Advance(input);
            secondRun[tick] = second.Advance(input);
        }

        Assert.Equal(firstRun, secondRun);
    }

    [Fact]
    public void FreshAirframeCanJoinAnExistingMissionTickLineWithoutInheritingTrack()
    {
        CobraAiGunner gunner = Create(acquireSeconds: 0.0);
        Assert.True(gunner.Advance(Input(0)).FireAuthorized);

        gunner.RebaseAuthorityTick(1_954);
        CobraAiGunnerDecision fresh = gunner.Advance(Input(1_954, consent: false));

        Assert.Equal(1_954, fresh.AuthorityTick);
        Assert.Equal(CobraAiGunnerState.Tracking, fresh.State);
        Assert.False(fresh.FireAuthorized);
        Assert.Throws<ArgumentOutOfRangeException>(() => gunner.RebaseAuthorityTick(-1));
    }

    [Fact]
    public void InvalidDefinitionsTicksAndObservationsAreRejected()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new CobraAiGunnerDefinition(-1.0, 0.0, FiveDegreesRad).Validate());
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new CobraAiGunnerDefinition(0.0, 0.0, 0.0).Validate());

        CobraAiGunner gunner = Create();
        Assert.Throws<InvalidOperationException>(() => gunner.Advance(Input(1)));

        CobraAiGunner invalidObservationGunner = Create();
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            invalidObservationGunner.Advance(Input(
                0,
                target: Target(sightErrorRad: double.NaN))));
    }
}
