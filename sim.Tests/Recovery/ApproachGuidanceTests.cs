using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Recovery;
using Xunit;

namespace GunsOnly.Sim.Tests.Recovery;

public class ApproachGuidanceTests {
    static RecoverySite StripSite() => new(
        Known: true,
        Threshold: new Vec3D(0.0, 192.0, 0.0),
        SurfaceElevationM: 192.0,
        LandingHeadingRad: 0.0,
        Label: "STRIP");

    [Fact]
    public void IntentRequiresAKnownSite() {
        Assert.False(ApproachGuidance.IntentActive(
            flightActive: true, siteKnown: false,
            playerRtbActive: true, fuelRecoveryPressure: true,
            carrierPhase: CarrierSortieRoutePhase.Return,
            patternOnlyCircuitsActive: true, recoveryProcedureSelected: true));
    }

    [Fact]
    public void PlayerRtbArmsIntentWhenSiteKnown() {
        Assert.True(ApproachGuidance.IntentActive(
            flightActive: true, siteKnown: true,
            playerRtbActive: true, fuelRecoveryPressure: false,
            carrierPhase: CarrierSortieRoutePhase.Outbound,
            patternOnlyCircuitsActive: false, recoveryProcedureSelected: false));
    }

    [Fact]
    public void OutboundWithoutRtbDoesNotArm() {
        Assert.False(ApproachGuidance.IntentActive(
            flightActive: true, siteKnown: true,
            playerRtbActive: false, fuelRecoveryPressure: false,
            carrierPhase: CarrierSortieRoutePhase.Outbound,
            patternOnlyCircuitsActive: false, recoveryProcedureSelected: false));
    }

    [Fact]
    public void TerminalFlightNeverKeepsRecoveryGuidanceArmed() {
        Assert.False(ApproachGuidance.IntentActive(
            flightActive: false, siteKnown: true,
            playerRtbActive: true, fuelRecoveryPressure: true,
            carrierPhase: CarrierSortieRoutePhase.Recovery,
            patternOnlyCircuitsActive: true, recoveryProcedureSelected: true));
    }

    [Fact]
    public void PublishMaterializesWorldGatesWithSurfaceRelativeStabilise() {
        var state = ApproachGuidance.Publish(
            guidanceActive: true,
            site: StripSite(),
            position: new Vec3D(0.0, 2_000.0, 20_000.0),
            trueAirspeedMps: 150.0,
            currentHeadingRad: Math.PI,
            stabiliseHeightAboveSurfaceM: 152.0,
            stabiliseSpeedMps: 90.0,
            dragToWeight: 0.12,
            turnRadiusM: 2_000.0);

        Assert.True(state.GuidanceActive);
        Assert.True(state.Valid);
        Assert.NotEmpty(state.Gates);
        Assert.Equal("GATE 1", state.NextLabel);
        Assert.True(state.Gates[0].Active);
        Assert.False(state.Gates[^1].Active);
        Assert.Equal(192.0 + 152.0, state.Gates[^1].TargetAltitudeM, precision: 1);
        Assert.NotEqual(StripSite().Threshold.Z, state.Gates[^1].NorthM);
        Assert.Contains(state.Gates, g => g.Active);
        string json = ApproachGuidance.GatesJson(state);
        Assert.Contains("target_alt_m", json);
        Assert.Contains("east_m", json);
    }

    [Fact]
    public void InactivePublishClearsGates() {
        var state = ApproachGuidance.Publish(
            guidanceActive: false,
            site: StripSite(),
            position: new Vec3D(0.0, 1_000.0, 10_000.0),
            trueAirspeedMps: 120.0,
            currentHeadingRad: Math.PI,
            stabiliseHeightAboveSurfaceM: 152.0,
            stabiliseSpeedMps: 90.0,
            dragToWeight: 0.12,
            turnRadiusM: 2_000.0);
        Assert.False(state.GuidanceActive);
        Assert.Empty(state.Gates);
    }

    [Fact]
    public void HomePlateResolverCarriesAuthoredHeightAndHeading() {
        var home = new MeshPlace("home", "HOME", 100.0, 200.0, 50.0, MeshPlaceRole.Home);
        RecoverySite site = RecoverySiteResolver.Resolve(
            carrier: null,
            homePlate: home,
            recoveryPointKnown: false,
            recoveryPoint: null,
            recoveryHeadingRad: Math.PI / 2.0);
        Assert.True(site.Known);
        Assert.Equal(100.0, site.Threshold.X);
        Assert.Equal(200.0, site.Threshold.Z);
        Assert.Equal(50.0, site.SurfaceElevationM);
        Assert.Equal(Math.PI / 2.0, site.LandingHeadingRad);
    }

    [Fact]
    public void PhysicalCarrierAlwaysOverridesItsStaleHomePlate() {
        BeatSetup beat = Beats.RapierCircuits();
        Carrier carrier = Assert.IsType<Carrier>(beat.Carrier);
        var staleHome = new MeshPlace(
            "home", "STALE HOME",
            carrier.Position.X - 20_000.0,
            carrier.Position.Z - 20_000.0,
            carrier.Position.Y,
            MeshPlaceRole.Home);

        RecoverySite site = RecoverySiteResolver.Resolve(
            carrier,
            staleHome,
            recoveryPointKnown: true,
            recoveryPoint: carrier.TouchdownPoint,
            recoveryHeadingRad: carrier.LandingHeadingRad);

        Assert.Equal(carrier.TouchdownPoint.X, site.Threshold.X, precision: 6);
        Assert.Equal(carrier.TouchdownPoint.Z, site.Threshold.Z, precision: 6);
        Assert.Equal(carrier.LandingHeadingRad, site.LandingHeadingRad, precision: 6);
    }
}
