namespace GunsOnly.Sim.Tests;

public class ReachFightDirectorTests {
    [Fact]
    public void Fl650AfterAccel_SelectsLevelDashNotRamClimbPrison() {
        var d = new ReachFightDirector();
        ReachFightDecision dec = d.Decide(
            RapierMissionPhase.Accelerate,
            altitudeM: 65_000.0 * 0.3048,
            mach: 2.5,
            qPa: 5_000.0,
            gammaRad: 0.05,
            contactRangeM: 80_000.0,
            fuelLb: 2_400.0,
            reserveFuelLb: 1_200.0,
            zoomLobPreferred: false,
            lobSkip: 0,
            inZoomPhases: false);
        Assert.Equal(ReachFightStrategy.LevelDash, dec.Strategy);
        Assert.Equal(RapierMissionPhase.Intercept, dec.SuggestedPhase);
        Assert.Equal("intercept_dash", dec.PhaseReason);
    }

    [Fact]
    public void AirborneAttachMidDash_LevelDashIntercept() {
        var d = new ReachFightDirector();
        ReachFightDecision dec = d.Decide(
            RapierMissionPhase.Launch,
            altitudeM: 70_000.0 * 0.3048,
            mach: 2.8,
            qPa: 4_000.0,
            gammaRad: 0.0,
            contactRangeM: 80_000.0,
            fuelLb: 2_200.0,
            reserveFuelLb: 1_200.0,
            zoomLobPreferred: false,
            lobSkip: 0,
            inZoomPhases: false);
        Assert.Equal(ReachFightStrategy.LevelDash, dec.Strategy);
        Assert.Equal(RapierMissionPhase.Intercept, dec.SuggestedPhase);
        Assert.Equal("intercept_dash", dec.PhaseReason);
    }

    [Fact]
    public void DirectJoin_WhenNotLevelDashEligible() {
        var d = new ReachFightDirector();
        ReachFightDecision dec = d.Decide(
            RapierMissionPhase.Intercept,
            altitudeM: 70_000.0 * 0.3048,
            mach: 2.0,
            qPa: 4_000.0,
            gammaRad: 0.0,
            contactRangeM: 80_000.0,
            fuelLb: 2_200.0,
            reserveFuelLb: 1_200.0,
            zoomLobPreferred: false,
            lobSkip: 0,
            inZoomPhases: false);
        Assert.Equal(ReachFightStrategy.DirectJoin, dec.Strategy);
        Assert.Equal(RapierMissionPhase.Intercept, dec.SuggestedPhase);
        Assert.Equal("direct_join", dec.PhaseReason);
    }

    [Fact]
    public void LowAndSlow_StillClimbBuild() {
        var d = new ReachFightDirector();
        ReachFightDecision dec = d.Decide(
            RapierMissionPhase.Launch,
            altitudeM: 5_000.0,
            mach: 0.9,
            qPa: 20_000.0,
            gammaRad: 0.2,
            contactRangeM: 200_000.0,
            fuelLb: 2_400.0,
            reserveFuelLb: 1_200.0,
            zoomLobPreferred: false,
            lobSkip: 0,
            inZoomPhases: false);
        Assert.Equal(ReachFightStrategy.ClimbBuild, dec.Strategy);
        Assert.Equal(RapierMissionPhase.Climb, dec.SuggestedPhase);
    }

    [Fact]
    public void Characterization_AtCruise_SuggestsInterceptDash() {
        var d = new ReachFightDirector();
        ReachFightDecision dec = d.Decide(
            RapierMissionPhase.RamClimb,
            altitudeM: 70_000.0 * 0.3048,
            mach: 3.0,
            qPa: 4_000.0,
            gammaRad: 0.0,
            contactRangeM: 80_000.0,
            fuelLb: 2_400.0,
            reserveFuelLb: 1_200.0,
            zoomLobPreferred: false,
            lobSkip: 0,
            inZoomPhases: false);
        Assert.Equal(ReachFightStrategy.LevelDash, dec.Strategy);
        Assert.Equal(RapierMissionPhase.Intercept, dec.SuggestedPhase);
        Assert.Equal("intercept_dash", dec.PhaseReason);
    }

    [Fact]
    public void Characterization_ContactInside30km_HandsOffEmploy() {
        var d = new ReachFightDirector();
        ReachFightDecision dec = d.Decide(
            RapierMissionPhase.Intercept,
            altitudeM: 12_000.0,
            mach: 1.2,
            qPa: 8_000.0,
            gammaRad: 0.0,
            contactRangeM: 20_000.0,
            fuelLb: 2_000.0,
            reserveFuelLb: 1_200.0,
            zoomLobPreferred: false,
            lobSkip: 0,
            inZoomPhases: false);
        Assert.Equal(MissionIntention.Employ, dec.Intention);
        Assert.Equal(RapierMissionPhase.Attack, dec.SuggestedPhase);
        Assert.Equal("contact_leq_30km", dec.PhaseReason);
    }

    [Fact]
    public void LongRangeHighEnergy_DefaultInterceptMayPickZoomLob() {
        var d = new ReachFightDirector();
        ReachFightDecision dec = d.Decide(
            RapierMissionPhase.RamClimb,
            altitudeM: 21_500.0,
            mach: 3.5,
            qPa: 4_000.0,
            gammaRad: 0.05,
            contactRangeM: 200_000.0,
            fuelLb: 2_400.0,
            reserveFuelLb: 1_200.0,
            zoomLobPreferred: false,
            lobSkip: 0,
            inZoomPhases: false);
        Assert.Equal(ReachFightStrategy.ZoomLob, dec.Strategy);
        Assert.Equal(RapierMissionPhase.ZoomPull, dec.SuggestedPhase);
    }

    [Fact]
    public void SubShelfMach2_DoesNotPickNegativeScoreZoomLob() {
        var d = new ReachFightDirector();
        ReachFightDecision dec = d.Decide(
            RapierMissionPhase.RamClimb,
            altitudeM: 15_000.0,
            mach: 2.0,
            qPa: 5_000.0,
            gammaRad: 0.05,
            contactRangeM: 200_000.0,
            fuelLb: 2_400.0,
            reserveFuelLb: 1_200.0,
            zoomLobPreferred: false,
            lobSkip: 0,
            inZoomPhases: false);
        Assert.Equal(ReachFightStrategy.ClimbBuild, dec.Strategy);
        Assert.Equal(RapierMissionPhase.RamClimb, dec.SuggestedPhase);
        Assert.Equal("ram_climb_to_fl700", dec.PhaseReason);
    }

    [Fact]
    public void Hysteresis_PreventsFlipFlopOnTinyScoreDelta() {
        var d = new ReachFightDirector();
        ReachFightDecision first = d.Decide(
            RapierMissionPhase.RamClimb,
            altitudeM: 21_500.0,
            mach: 3.5,
            qPa: 4_000.0,
            gammaRad: 0.05,
            contactRangeM: 200_000.0,
            fuelLb: 2_400.0,
            reserveFuelLb: 1_200.0,
            zoomLobPreferred: false,
            lobSkip: 0,
            inZoomPhases: false);
        Assert.Equal(ReachFightStrategy.ZoomLob, first.Strategy);
        ReachFightDecision second = d.Decide(
            RapierMissionPhase.RamClimb,
            altitudeM: 21_500.0,
            mach: 3.5,
            qPa: 4_000.0,
            gammaRad: 0.05,
            contactRangeM: 95_000.0,
            fuelLb: 2_400.0,
            reserveFuelLb: 1_200.0,
            zoomLobPreferred: false,
            lobSkip: 0,
            inZoomPhases: false);
        Assert.Equal(ReachFightStrategy.ZoomLob, second.Strategy);
    }

    [Fact]
    public void ZoomLobPreferred_StillForced() {
        var d = new ReachFightDirector();
        ReachFightDecision dec = d.Decide(
            RapierMissionPhase.RamClimb,
            altitudeM: 21_500.0,
            mach: 3.5,
            qPa: 4_000.0,
            gammaRad: 0.05,
            contactRangeM: 80_000.0,
            fuelLb: 2_400.0,
            reserveFuelLb: 1_200.0,
            zoomLobPreferred: true,
            lobSkip: 0,
            inZoomPhases: false);
        Assert.Equal(ReachFightStrategy.ZoomLob, dec.Strategy);
    }

    [Fact]
    public void DeadSlowInside30km_DoesNotEmploy() {
        var d = new ReachFightDirector();
        ReachFightDecision dec = d.Decide(
            RapierMissionPhase.Intercept,
            altitudeM: 12_000.0,
            mach: 0.85,
            qPa: 8_000.0,
            gammaRad: 0.0,
            contactRangeM: 20_000.0,
            fuelLb: 2_000.0,
            reserveFuelLb: 1_200.0,
            zoomLobPreferred: false,
            lobSkip: 0,
            inZoomPhases: false);
        Assert.NotEqual(MissionIntention.Employ, dec.Intention);
        Assert.NotEqual(RapierMissionPhase.Attack, dec.SuggestedPhase);
        Assert.Equal(MissionIntention.ReachFightGeometry, dec.Intention);
    }
}
