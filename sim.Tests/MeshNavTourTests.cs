using GunsOnly.Sim;
using Xunit;

namespace GunsOnly.Sim.Tests;

public sealed class MeshNavTourTests {
    static MeshPlace Home() => new("recovery.rapier.eastern-dispersed-strip.v1", "Eastern dispersed strip", 0, 0, 20.0, MeshPlaceRole.Home);
    static MeshPlace Crimea() => new("place.ukraine.crimea-coast-survey.v1", "Crimea coast survey", -280_000, -380_000, null, MeshPlaceRole.Destination);
    static MeshPlace Mid() => new("place.ukraine.mid.v1", "Mid", 10_000, 20_000, null, MeshPlaceRole.Destination);

    [Fact]
    public void TourAppendsInOrderAndClears() {
        var director = new MeshNavDirector();
        director.Configure(MeshNavTransitMode.OpenSegment, Home(), new[] { Home(), Crimea(), Mid() });
        Assert.True(director.TryTourAppendPlace(Crimea().PlaceId, true));
        Assert.True(director.TryTourAppendPlace(Mid().PlaceId, true));
        Assert.True(director.TryTourAppendFreeFix(1000, 2000, "A"));
        Assert.Equal(3, director.Tour.Count);
        director.ClearTour();
        Assert.Empty(director.Tour);
    }

    [Fact]
    public void TourRespectsSelectabilityAndCap() {
        var director = new MeshNavDirector();
        director.Configure(MeshNavTransitMode.MissionGated, Home(), new[] { Home(), Crimea() });
        Assert.False(director.TryTourAppendFreeFix(1, 2, null));
        Assert.True(director.TryTourAppendPlace(Crimea().PlaceId, true));
        director.Configure(MeshNavTransitMode.OpenSegment, Home(), new[] { Home(), Crimea() });
        for (int i = 0; i < MeshNavDirector.MaxTourStops; i++)
            Assert.True(director.TryTourAppendFreeFix(i, i, $"F{i}"));
        Assert.False(director.TryTourAppendFreeFix(99, 99, "overflow"));
    }
}
