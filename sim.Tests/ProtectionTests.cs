using GunsOnly.Sim; using Xunit;
public class ProtectionTests {
    static AircraftState At(double speed) => new(new Vec3D(0,3000,0), speed, 0, 0, 0, FlightModel.Sabre.MassKg);
    [Fact] public void SabreFullBackstickProtectionReachesHardMax() {
        var s = At(240);
        Assert.Equal(Protection.HardMaxG(s, FlightModel.Sabre),
            Protection.MaxPerformG(s, FlightModel.Sabre), 6);
    }
    [Fact] public void SabreProtectionUsesItsDocumentedSevenGLimit() {
        var s2 = At(400);
        double expect = System.Math.Min(FlightModel.Sabre.MaxPerformFraction
            * FlightModel.NzAeroMax(s2, FlightModel.Sabre), Protection.HardMaxG(s2, FlightModel.Sabre));
        Assert.Equal(expect, Protection.MaxPerformG(s2, FlightModel.Sabre), 6);
        Assert.Equal(7.0, Protection.MaxPerformG(s2, FlightModel.Sabre), 6);
    }
    [Fact] public void HardMaxCapsAtStructural() => Assert.Equal(
        FlightModel.Sabre.PositiveStructuralLimitG, Protection.HardMaxG(At(400), FlightModel.Sabre), 6);
    [Fact] public void SlowFlightProtectionIsAeroLimited() {
        var s = At(110);
        Assert.True(Protection.MaxPerformG(s, FlightModel.Sabre) < 3.0);
        Assert.Equal(FlightModel.NzAeroMax(s, FlightModel.Sabre),
            Protection.MaxPerformG(s, FlightModel.Sabre), 6);
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
        // Accurate F-86 energy game: about 5 G sustained under a +7 G instantaneous boundary.
        var st = At(240);
        var sus = Protection.SustainedG(st, FlightModel.Sabre);
        var wing = Protection.MaxPerformG(st, FlightModel.Sabre);
        Assert.InRange(sus, 4.7, 5.3);
        Assert.InRange(wing - sus, 1.7, 2.3);
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
