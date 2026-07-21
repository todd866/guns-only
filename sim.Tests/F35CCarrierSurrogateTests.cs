using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class F35CCarrierSurrogateTests {
    [Fact]
    public void BeatFiveIsAnExplicitPublicDataCarrierSurrogate() {
        var session = new SimulationSession(5, Carrier.DeckConfiguration.Angled);

        Assert.Equal("mission.modern.f35c.carrier-conversion.public-data-surrogate.v1",
            session.Beat.MissionIdentity.Id);
        Assert.True(session.Beat.MissionIdentity.PublicDataSurrogate);
        Assert.Equal("aircraft.f35c.public-data-carrier-surrogate.v1",
            session.Beat.PlayerAircraft.Id);
        Assert.Equal(FlightModel.F35CPublicDataCarrierSurrogate, session.Beat.PlayerAir);
        Assert.Equal(7.5, session.Beat.PlayerAir.PositiveStructuralLimitG, 8);
        Assert.True(session.PlayerSystemsSimulated);
        Assert.True(session.ConfigurationAutomationEnabled);
        Assert.Equal(FlightConfigurationTarget.Recovery, session.ConfigurationTarget);
        Assert.True(session.Beat.RecoveryCompletesSortie);
    }

    [Fact]
    public void HistoricalCarrierFixtureRemainsTruthfullyF86() {
        BeatSetup historical = Beats.CarrierApproach();

        Assert.Equal("aircraft.f86f30.v1", historical.PlayerAircraft.Id);
        Assert.Equal(FlightModel.Sabre, historical.PlayerAir);
        Assert.Equal(MissionContentFamily.Korea1950s,
            historical.MissionIdentity.ContentFamily);
    }
}
