using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;

namespace GunsOnly.Sim.Tests;

public sealed class MeshNavCatalogTests {
    [Fact]
    public void FreeFlyCatalogParsesEmbeddedPlaces() {
        IReadOnlyList<MeshPlace> places = MeshPlaceCatalog.FreeFlyPlaces;
        Assert.Equal(4, places.Count);
        Assert.Contains(places, place => place.PlaceId
            == "place.ukraine.crimea-coast-survey.v1"
            && place.Role == MeshPlaceRole.Destination);
        Assert.Contains(places, place => place.PlaceId
            == "place.ukraine.quiet-ridge-label.v1"
            && place.Role == MeshPlaceRole.Landmark);
    }

    [Fact]
    public void RapierGoFlyAndCircuitsEnableOpenSegment() {
        Assert.True(Beats.RapierGoFly(jobSeed: 7).OpenSegmentNav);
        Assert.True(Beats.RapierCircuits().OpenSegmentNav);
        Assert.False(Beats.RapierIntercept().OpenSegmentNav);
    }

    [Fact]
    public void SessionOpenSegmentExposesCatalogAndAcceptsFreeFix() {
        // Card 11 is the explicit open-segment Rapier laboratory. Production Card 12 is a
        // deterministic mission and deliberately rejects free-tour destinations.
        var session = new SimulationSession(11, Carrier.DeckConfiguration.Angled);
        Assert.Equal(MeshNavTransitMode.OpenSegment, session.MeshNav.Mode);
        Assert.True(session.TrySelectMeshPlace("place.ukraine.crimea-coast-survey.v1"));
        Assert.Equal(
            "place.ukraine.crimea-coast-survey.v1",
            session.MeshNav.Active?.PlaceId);
        Assert.True(session.TrySetMeshFreeFix(-50_000, -60_000, "TOUR"));
        Assert.False(session.MeshNav.Active?.IsPlace);
        session.ClearMeshActiveDest();
        Assert.Equal(
            "recovery.rapier.eastern-dispersed-strip.v1",
            session.MeshNav.Active?.PlaceId);
    }

    [Fact]
    public void SessionMissionGatedRejectsFreeFix() {
        var session = new SimulationSession(10, Carrier.DeckConfiguration.Angled);
        Assert.Equal(MeshNavTransitMode.MissionGated, session.MeshNav.Mode);
        Assert.False(session.TrySetMeshFreeFix(-50_000, -60_000, "TOUR"));
        Assert.False(session.TrySelectMeshPlace("place.ukraine.crimea-coast-survey.v1"));
        Assert.NotNull(session.MeshNav.HomePlate);
    }
}
