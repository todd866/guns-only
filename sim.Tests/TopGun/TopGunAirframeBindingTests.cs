using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests.TopGun;

public sealed class TopGunAirframeBindingTests
{
    [Fact]
    public void BindsTomcatAndMig28Surrogates()
    {
        Assert.Equal("aircraft.f14a.public-data-surrogate.v1", AircraftCapability.F14ASurrogate.Id);
        Assert.Equal("aircraft.mig-28.f5e-class-fiction.v1", AircraftCapability.Mig28Surrogate.Id);
        Assert.True(AircraftCapability.Mig28Surrogate.PublicDataSurrogate);
        Assert.Contains("fiction", AircraftCapability.Mig28Surrogate.Id, StringComparison.Ordinal);
        Assert.True(FlightModel.F14APublicDataSurrogate.MassKg > 15_000.0);
        Assert.True(FlightModel.Mig28F5EClassSurrogate.MassKg < FlightModel.F14APublicDataSurrogate.MassKg);
    }
}
