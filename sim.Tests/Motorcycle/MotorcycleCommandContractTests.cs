using GunsOnly.Sim.Motorcycle;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Motorcycle;

public sealed class MotorcycleCommandContractTests {
    [Fact]
    public void FromMotorcycleSetsCommandFamily() {
        var cmd = new MotorcyclePilotCommand(
            Throttle: 0.4,
            Brake: 0.0,
            Steer: -0.2,
            RiderLateral: 0.5,
            RiderForeAft: -0.25,
            GearShiftRequest: 1,
            Clutch: 1.0,
            ClutchMode: MotorcycleClutchMode.Auto);
        PlayerVehicleCommand envelope = PlayerVehicleCommand.FromMotorcycle(cmd);
        Assert.Equal(VehicleCommandFamily.MotorcyclePilot, envelope.Family);
        Assert.Equal(0.4, envelope.Motorcycle.Throttle);
        Assert.Equal(MotorcycleClutchMode.Auto, envelope.Motorcycle.ClutchMode);
    }
}
