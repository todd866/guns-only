using GunsOnly.Sim; using Xunit;
public class ProtectionTests {
    static AircraftState At(double speed) => new(new Vec3D(0,3000,0), speed, 0, 0, 0, FlightModel.Sabre.MassKg);
    [Fact] public void ProtectionBelowHardMax() {
        var s = At(240);
        Assert.True(Protection.MaxPerformG(s, FlightModel.Sabre) < Protection.HardMaxG(s, FlightModel.Sabre));
    }
    [Fact] public void ProtectionRidesTheWingNotAPilotCap() {
        // Unmanned: no 6G physiological cap. Protection = 92% of the aero limit, structure-bounded.
        var s2 = At(400);
        double expect = System.Math.Min(0.92 * FlightModel.NzAeroMax(s2, FlightModel.Sabre), Protection.HardMaxG(s2, FlightModel.Sabre));
        Assert.Equal(expect, Protection.MaxPerformG(s2, FlightModel.Sabre), 6);
        Assert.True(Protection.MaxPerformG(s2, FlightModel.Sabre) > 6.0, "fast + unmanned should exceed the old 6G pilot cap");
    }
    [Fact] public void HardMaxCapsAtStructural() => Assert.Equal(Protection.StructuralLimitG, Protection.HardMaxG(At(400), FlightModel.Sabre), 6);
    [Fact] public void SlowFlightProtectionIsAeroLimited() {
        var s = At(110);
        Assert.True(Protection.MaxPerformG(s, FlightModel.Sabre) < 3.0);
        Assert.Equal(0.92 * FlightModel.NzAeroMax(s, FlightModel.Sabre), Protection.MaxPerformG(s, FlightModel.Sabre), 6);
    }
    [Fact] public void SustainedGSurvivesEverySpeedAndNeverExceedsProtection() {
        // Guard for a class that has bitten 3x: Clamp(min>max) when the wing can't make 1G.
        foreach (var v in new[] { 41.0, 60.0, 90.0, 150.0, 240.0, 400.0 }) {
            var st = At(v);
            var sus = Protection.SustainedG(st, FlightModel.Sabre);   // must not throw at any speed
            Assert.True(sus > 0);
            Assert.True(sus <= Protection.MaxPerformG(st, FlightModel.Sabre) + 1e-9, $"sustained > protection at {v} m/s");
        }
    }
    [Fact] public void SustainedSitsWellBelowTheWingAtFightingSpeed() {
        // The energy game only exists if thrust sustains far less than the wing can pull.
        var st = At(240);
        var sus = Protection.SustainedG(st, FlightModel.Sabre);
        var wing = Protection.MaxPerformG(st, FlightModel.Sabre);
        Assert.True(wing - sus > 3.0, $"need a real gap: sustained {sus:F1}G vs wing {wing:F1}G");
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
