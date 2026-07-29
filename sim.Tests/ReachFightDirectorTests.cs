namespace GunsOnly.Sim.Tests;

public class ReachFightDirectorTests {
    [Fact]
    public void Characterization_BelowCruiseAfterAccel_StillSuggestsRamClimb() {
        var d = new ReachFightDirector();
        // FL650, M2.5, contact 120 km — today's ladder would RamClimb
        ReachFightDecision dec = d.Decide(
            RapierMissionPhase.Accelerate,
            altitudeM: 65_000.0 * 0.3048,
            mach: 2.5,
            qPa: 5_000.0,
            gammaRad: 0.05,
            contactRangeM: 120_000.0,
            fuelLb: 2_400.0,
            reserveFuelLb: 1_200.0,
            zoomLobPreferred: false,
            lobSkip: 0,
            inZoomPhases: false);
        Assert.Equal(MissionIntention.ReachFightGeometry, dec.Intention);
        Assert.Equal(ReachFightStrategy.ClimbBuild, dec.Strategy);
        Assert.Equal(RapierMissionPhase.RamClimb, dec.SuggestedPhase);
        Assert.Equal("ram_climb_to_fl700", dec.PhaseReason);
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
}
