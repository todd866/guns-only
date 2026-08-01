using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// The Korea carrier beat, and the separation that lets it exist.
///
/// CarrierApproach is composed by other missions as their generic recovery fixture. Before the
/// split, giving Korea the aircraft it actually flew meant changing every other mission's
/// recovery aircraft too — which is not a hypothetical, it broke three Rapier automation tests.
/// Rapier recovery and a carrier landing share a schedule and a deck; they do not share an
/// aeroplane.
/// </summary>
public class KoreaCarrierBeatTests {
    [Fact]
    public void TheKoreaBeatFliesThePantherThatActuallyDidThis() {
        BeatSetup korea = Beats.KoreaCarrierApproach();

        Assert.Equal(FlightModel.F9F2Panther, korea.PlayerAir);
        Assert.Equal("aircraft.f9f2.v1", korea.PlayerAircraft.Id);
        Assert.Equal(MissionContentFamily.Korea1950s, korea.MissionIdentity.ContentFamily);
        // Axial is the subject, not a default: a straight deck is what removes the bolter.
        Assert.Equal(Carrier.DeckConfiguration.Axial, korea.Carrier!.Configuration);
    }

    [Fact]
    public void TheSharedFixtureIsUnchangedForEveryoneElse() {
        BeatSetup shared = Beats.CarrierApproach();

        Assert.Equal(FlightModel.Sabre, shared.PlayerAir);
        Assert.Equal("aircraft.f86f30.v1", shared.PlayerAircraft.Id);
    }

    [Fact]
    public void OnSpeedFollowsTheAirframeRatherThanACarriedOverNumber() {
        double sabre = Beats.CarrierApproach().Player.Speed;
        double panther = Beats.KoreaCarrierApproach().Player.Speed;

        // The Panther stalls slower than the Sabre (more CL on a straight wing at less mass), so
        // holding the fixture's 70 m/s would have flown its approach fast and quietly made the
        // deck easier. The stall MARGIN transfers between aeroplanes; the raw speed does not.
        Assert.True(panther < sabre,
            $"Panther on-speed {panther:F1} should be below the Sabre's {sabre:F1}");
        double sabreStall = AirData.StallSpeedKias(FlightModel.Sabre.MassKg, FlightModel.Sabre)
            / AirData.MpsToKnots;
        double pantherStall = AirData.StallSpeedKias(
            FlightModel.F9F2Panther.MassKg, FlightModel.F9F2Panther) / AirData.MpsToKnots;
        Assert.Equal(sabre / sabreStall, panther / pantherStall, 3);
    }

    [Fact]
    public void AnAirframeCannotBeFlownUnderAnotherAircraftsIdentity() {
        // The failure this prevents happened: an airframe swap changed PlayerAir and left
        // PlayerAircraft still reporting an F-86. Naming an airframe now requires its identity.
        Assert.Throws<ArgumentException>(() =>
            Beats.CarrierApproach(Carrier.DeckConfiguration.Axial, FlightModel.F9F2Panther));
    }
}
