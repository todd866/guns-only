using GunsOnly.Sim; using Xunit;
public class ProtectionTests {
    static AircraftState At(double speed) => new(new Vec3D(0,3000,0), speed, 0, 0, 0, FlightModel.Sabre.MassKg);
    [Fact] public void ProtectionBelowHardMax() {
        var s = At(240);
        Assert.True(Protection.MaxPerformG(s, FlightModel.Sabre) < Protection.HardMaxG(s, FlightModel.Sabre));
    }
    [Fact] public void ProtectionCapsAtSixG() => Assert.Equal(6.0, Protection.MaxPerformG(At(400), FlightModel.Sabre), 6);
    [Fact] public void HardMaxCapsAtStructural() => Assert.Equal(7.33, Protection.HardMaxG(At(400), FlightModel.Sabre), 6);
    [Fact] public void SlowFlightProtectionIsAeroLimited() {
        var s = At(110);
        Assert.True(Protection.MaxPerformG(s, FlightModel.Sabre) < 3.0);
        Assert.Equal(0.92 * FlightModel.NzAeroMax(s, FlightModel.Sabre), Protection.MaxPerformG(s, FlightModel.Sabre), 6);
    }
}
