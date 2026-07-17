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
    [Fact] public void TierOrderingHoldsAtAllSpeeds() {
        foreach (var v in new[] { 41.0, 45.0, 60.0, 90.0, 150.0, 250.0, 400.0 }) {
            var s = At(v);
            Assert.True(Protection.MaxPerformG(s, FlightModel.Sabre) <= Protection.HardMaxG(s, FlightModel.Sabre) + 1e-12,
                $"tier inversion at {v} m/s");
        }
    }
    [Fact] public void VerySlowFlightKeepsOrderingBelowOneG() {
        var s = At(45);
        Assert.True(Protection.HardMaxG(s, FlightModel.Sabre) < 1.0);
        Assert.True(Protection.MaxPerformG(s, FlightModel.Sabre) <= Protection.HardMaxG(s, FlightModel.Sabre));
    }
}
