namespace GunsOnly.Sim.Tests;

public sealed class MeshNavMovingHomeTests {
    [Fact]
    public void MovingHomeUpdatesActiveDestinationAndTourWithoutClearingEither() {
        var nav = new MeshNavDirector();
        var original = new MeshPlace("boat", "Carrier", 10.0, 20.0, 30.0,
            MeshPlaceRole.Home);
        nav.Configure(MeshNavTransitMode.OpenSegment, original, Array.Empty<MeshPlace>());
        Assert.True(nav.TryTourAppendPlace("boat", phaseAllows: true));

        var moved = original with { EastM = 130.0, NorthM = 240.0 };
        nav.UpdateHomePlate(moved);

        Assert.Equal(moved, nav.HomePlate);
        Assert.Equal(moved.EastM, nav.Active!.Value.EastM);
        Assert.Equal(moved.NorthM, nav.Active.Value.NorthM);
        Assert.Single(nav.Tour);
        Assert.Equal(moved.EastM, nav.Tour[0].EastM);
        Assert.Equal(moved.NorthM, nav.Tour[0].NorthM);
    }
}
