using GunsOnly.Sim;
using Xunit;

namespace GunsOnly.Sim.Tests;

public sealed class MeshNavTests {
    static MeshPlace Home() => new(
        "recovery.rapier.eastern-dispersed-strip.v1",
        "Eastern dispersed strip",
        0, 0, 20.0, MeshPlaceRole.Home);

    static MeshPlace Crimea() => new(
        "place.ukraine.crimea-coast-survey.v1",
        "Crimea coast survey",
        -280_000, -380_000, null, MeshPlaceRole.Destination);

    static MeshPlace Landmark() => new(
        "place.ukraine.landmark-only.v1",
        "Quiet ridge",
        10_000, 10_000, null, MeshPlaceRole.Landmark);

    [Fact]
    public void LandmarkNeverSelectable_HomeAndDestinationNeedPhase() {
        Assert.False(MeshSelectability.CanSelect(
            MeshPlaceRole.Landmark, MeshNavTransitMode.OpenSegment, phaseAllows: true));
        Assert.False(MeshSelectability.CanSelect(
            MeshPlaceRole.SceneryAnchor, MeshNavTransitMode.OpenSegment, phaseAllows: true));
        Assert.True(MeshSelectability.CanSelect(
            MeshPlaceRole.Destination, MeshNavTransitMode.MissionGated, phaseAllows: true));
        Assert.True(MeshSelectability.CanSelect(
            MeshPlaceRole.Destination, MeshNavTransitMode.OpenSegment, phaseAllows: true));
        Assert.True(MeshSelectability.CanSelect(
            MeshPlaceRole.Home, MeshNavTransitMode.MissionGated, phaseAllows: true));
        Assert.False(MeshSelectability.CanSelect(
            MeshPlaceRole.Home, MeshNavTransitMode.MissionGated, phaseAllows: false));
    }

    [Fact]
    public void OpenSegmentAllowsFreeFix_MissionGatedRejectsFreeFixAndUnknownPlaces() {
        var director = new MeshNavDirector();
        director.Configure(MeshNavTransitMode.OpenSegment, Home(), new[] { Home(), Crimea() });
        Assert.True(director.TrySelectPlace(Crimea().PlaceId, phaseAllows: true));
        Assert.Equal(Crimea().PlaceId, director.Active?.PlaceId);
        Assert.True(director.TrySetFreeFix(-1000, 2000, "FIX"));
        Assert.False(director.Active?.IsPlace);
        Assert.Equal("FIX", director.Active?.DisplayName);

        director.Configure(MeshNavTransitMode.MissionGated, Home(), new[] { Home() });
        Assert.False(director.TrySetFreeFix(-1000, 2000, "FIX"));
        Assert.False(director.TrySelectPlace(Crimea().PlaceId, phaseAllows: true));
        Assert.Equal(Home().PlaceId, director.Active?.PlaceId);
    }

    [Fact]
    public void MissionGatedAllowsDestinationWhenListedInCatalog() {
        var director = new MeshNavDirector();
        director.Configure(
            MeshNavTransitMode.MissionGated,
            Home(),
            new[] { Home(), Crimea(), Landmark() });
        Assert.True(director.TrySelectPlace(Crimea().PlaceId, phaseAllows: true));
        Assert.Equal(Crimea().PlaceId, director.Active?.PlaceId);
        Assert.False(director.TrySelectPlace(Landmark().PlaceId, phaseAllows: true));
    }

    [Fact]
    public void FreeFixRejectedOutsideClamp() {
        var director = new MeshNavDirector();
        director.Configure(MeshNavTransitMode.OpenSegment, Home(), new[] { Home() });
        Assert.False(director.TrySetFreeFix(MeshNavDirector.FreeFixClampM + 1.0, 0.0, null));
        Assert.True(director.TrySetFreeFix(MeshNavDirector.FreeFixClampM, 0.0, null));
    }

    [Fact]
    public void SolutionPricesDestThenReserveOnReturnToHome() {
        var fuel = new FuelModel(
            initialFuelLb: 5000.0,
            capacityLb: 6000.0,
            bingoThresholdLb: 1000.0);
        fuel.Step(60.0, 200.0);

        var position = Vec3D.Zero;
        var dest = new MeshActiveDest(
            IsPlace: true,
            PlaceId: "place.ukraine.mid.v1",
            DisplayName: "Mid",
            EastM: 0.0,
            NorthM: 18_520.0,
            UpM: 120.0);
        var home = new Vec3D(0.0, 120.0, 37_040.0);
        var northAt100Mps = new Vec3D(0.0, 0.0, 100.0);

        MeshNavSolution solution = MeshNavProjection.ProjectSolution(
            fuel,
            position,
            northAt100Mps,
            headingRad: 0.0,
            dest,
            home,
            reserveTargetLb: 3000.0);

        double expectedEtaMinutes = 18_520.0 / 100.0 / 60.0;
        double expectedFuelToDestLb = 200.0 * expectedEtaMinutes;
        double nmPerMin = 100.0 * AirData.MpsToKnots / 60.0;
        double lbPerNm = 200.0 / nmPerMin;
        double expectedFuelDestToHomeLb = 10.0 * lbPerNm;
        double expectedArrivalDest = fuel.FuelLb - expectedFuelToDestLb;
        double expectedArrivalHome = expectedArrivalDest - expectedFuelDestToHomeLb;

        Assert.True(solution.DestLeg.RecoveryPointKnown);
        Assert.Equal(expectedFuelToDestLb,
            solution.DestLeg.FuelToHomeEstimateLb!.Value, precision: 10);
        Assert.Equal(expectedArrivalDest,
            solution.DestLeg.FuelOnArrivalEstimateLb!.Value, precision: 10);
        Assert.Equal(expectedFuelDestToHomeLb,
            solution.FuelDestToHomeLb!.Value, precision: 10);
        Assert.Equal(expectedArrivalHome,
            solution.FuelOnArrivalHomeViaDestLb!.Value, precision: 10);
        Assert.Equal(expectedArrivalHome - 3000.0,
            solution.ReserveMarginViaDestLb!.Value, precision: 10);
    }

    [Fact]
    public void SolutionWithholdsReturnLegWhenDestLegWithholdsFuel() {
        var fuel = new FuelModel(
            initialFuelLb: 5000.0,
            capacityLb: 6000.0,
            bingoThresholdLb: 1000.0);
        fuel.Step(60.0, 200.0);

        MeshNavSolution solution = MeshNavProjection.ProjectSolution(
            fuel,
            Vec3D.Zero,
            new Vec3D(0.0, 0.0, -100.0),
            headingRad: 0.0,
            new MeshActiveDest(true, "d", "D", 0.0, 18_520.0, 120.0),
            new Vec3D(0.0, 120.0, 37_040.0),
            reserveTargetLb: 3000.0);

        Assert.Null(solution.DestLeg.FuelToHomeEstimateLb);
        Assert.Null(solution.FuelDestToHomeLb);
        Assert.Null(solution.FuelOnArrivalHomeViaDestLb);
        Assert.Null(solution.ReserveMarginViaDestLb);
    }
}
