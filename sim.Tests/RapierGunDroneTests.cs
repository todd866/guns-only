namespace GunsOnly.Sim.Tests;

public class RapierGunDroneTests {
    [Fact]
    public void GunDroneSurrogateMatchesVerticalSliceMassAndPropulsionCard() {
        AircraftParams drone = FlightModel.RapierGunDroneSurrogate;

        Assert.Equal(360.0, drone.MassKg, 0);
        Assert.Equal(4.0, drone.WingAreaM2, 3);
        Assert.Equal(1800.0, drone.ThrustMaxN, 0);
        Assert.Equal(1.0, drone.MaxThrustFraction, 3);
        Assert.Equal(593.15, drone.SkinTemperatureLimitK, 2);
        Assert.Equal(280.0, drone.FuelFreeMassKg, 0);
        Assert.InRange(drone.WingSpanM, 5.0, 6.0);
        Assert.True(drone.PositiveStructuralLimitG >= 4.0);
    }
}
