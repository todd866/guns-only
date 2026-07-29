using GunsOnly.Sim;
using Xunit;

namespace GunsOnly.Sim.Tests;

public sealed class MissionChecklistTests {
    static MissionChecklistState Base(double t = 0.0) => new(
        TimeSeconds: t,
        MissionActive: true,
        RapierMissionAvailable: true,
        RapierPhase: RapierMissionPhase.Launch,
        CatapultStroke: false,
        SystemsSimulated: true,
        AllGearUp: false,
        AllGearDown: true,
        FlapsUp: false,
        FlapsLanding: true,
        WeaponsAuthorized: false);

    [Fact]
    public void LaunchChecklistActivatesInLaunchPhaseAndCompletesItemsFromSimTruth() {
        var director = new MissionChecklistDirector();

        var status = director.Step(Base(0.0));
        Assert.True(status.Active);
        Assert.Equal(MissionChecklistId.Launch, status.Id);
        Assert.Equal(0, status.Done);
        Assert.Equal(4, status.Total);
        Assert.Equal("CAT STROKE", status.NextItem);

        // Stroke begins, then the aircraft is airborne (stroke edge down), cleans up.
        director.Step(Base(1.0) with { CatapultStroke = true });
        status = director.Step(Base(2.0) with { CatapultStroke = false });
        Assert.Equal(2, status.Done);
        Assert.Equal("GEAR UP", status.NextItem);

        status = director.Step(Base(3.0) with {
            AllGearDown = false, AllGearUp = true });
        Assert.Equal(3, status.Done);

        status = director.Step(Base(4.0) with {
            AllGearDown = false, AllGearUp = true,
            FlapsLanding = false, FlapsUp = true });
        Assert.Equal(4, status.Done);
        Assert.Equal("", status.NextItem);
    }

    [Fact]
    public void ItemsCompleteExactlyOnceAndNeverUncomplete() {
        var director = new MissionChecklistDirector();
        director.Step(Base(0.0) with { CatapultStroke = true });
        var afterAirborne = director.Step(Base(1.0));
        Assert.Equal(2, afterAirborne.Done);

        // Truth regressing (stroke flag again) must not un-complete or re-complete.
        var again = director.Step(Base(2.0) with { CatapultStroke = true });
        Assert.Equal(2, again.Done);
    }

    [Fact]
    public void CompletionEmitsItsCallTokenForExactlyOneTick() {
        var director = new MissionChecklistDirector();
        director.Step(Base(0.0) with { CatapultStroke = true });
        director.Step(Base(1.0));
        var gearUp = director.Step(Base(2.0) with {
            AllGearDown = false, AllGearUp = true });
        Assert.Equal("LAUNCH_GEAR_UP", gearUp.CompletedCall);
        var next = director.Step(Base(3.0) with {
            AllGearDown = false, AllGearUp = true });
        Assert.Equal("", next.CompletedCall);
    }

    [Fact]
    public void UnsimulatedSystemsNeverAssertGearOrFlapTruth() {
        var director = new MissionChecklistDirector();
        director.Step(Base(0.0) with { CatapultStroke = true });
        director.Step(Base(1.0));
        // A compatibility AirframeSystems object reports up-and-locked; without
        // SystemsSimulated the checklist must not count it.
        var status = director.Step(Base(2.0) with {
            SystemsSimulated = false, AllGearDown = false, AllGearUp = true,
            FlapsLanding = false, FlapsUp = true });
        Assert.Equal(2, status.Done);
        Assert.Equal(4, status.Total);
    }

    [Fact]
    public void ResetReturnsToNoneAndReplaysCleanly() {
        var director = new MissionChecklistDirector();
        director.Step(Base(0.0) with { CatapultStroke = true });
        director.Step(Base(1.0));
        director.Reset();
        Assert.Equal(MissionChecklistStatus.None,
            director.Step(Base(0.0) with { MissionActive = false }));
        var status = director.Step(Base(1.0));
        Assert.Equal(MissionChecklistId.Launch, status.Id);
        Assert.Equal(0, status.Done);
    }

    [Fact]
    public void NoRapierMissionMeansNoChecklist() {
        var director = new MissionChecklistDirector();
        var status = director.Step(Base(0.0) with { RapierMissionAvailable = false });
        Assert.False(status.Active);
        Assert.Equal(MissionChecklistId.None, status.Id);
    }

    [Fact]
    public void LaterChecklistsNeverRegressToEarlierOnes() {
        var director = new MissionChecklistDirector();
        director.Step(Base(0.0));
        var recovery = director.Step(Base(1.0) with {
            RapierPhase = RapierMissionPhase.Recovery });
        Assert.Equal(MissionChecklistId.Recovery, recovery.Id);
        // Phase machine wobbling back through Intercept must not resurrect COMMIT.
        var held = director.Step(Base(2.0) with {
            RapierPhase = RapierMissionPhase.Intercept });
        Assert.Equal(MissionChecklistId.Recovery, held.Id);
    }
}
