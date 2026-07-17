using GunsOnly.Sim; using Xunit;
public class AtmosphereTests {
    [Fact] public void SeaLevelDensityIsISA() => Assert.Equal(1.225, Atmosphere.Density(0), 3);
    [Fact] public void DensityFallsWithAltitude() => Assert.True(Atmosphere.Density(6000) < 0.7 * Atmosphere.Density(0));
    [Fact] public void SeaLevelSpeedOfSound() => Assert.InRange(Atmosphere.SpeedOfSound(0), 335, 345);
    [Fact] public void VelocityVectorMatchesHeadingConvention() {
        // chi=0 => north(+Z); chi=pi/2 => east(+X); gamma>0 => climbing(+Y)
        var s = new AircraftState(Vec3D.Zero, 100, 0, 0, 0, 5000);
        var v = s.VelocityVector();
        Assert.Equal(100, v.Z, 9); Assert.Equal(0, v.X, 9);
        var e = s with { Chi = System.Math.PI/2 };
        Assert.Equal(100, e.VelocityVector().X, 9);
    }
    [Fact] public void StratosphereIsIsothermalAtBalloonAltitude() {
        // 60k ft = 18288 m: real ISA is 216.65 K / 0.1153 kg/m^3 / a=295.1 m/s. The old
        // troposphere-only model said 169 K and a=261 (13% Mach error) — balloon drops live here.
        Assert.Equal(216.65, Atmosphere.Temperature(18288), 2);
        Assert.Equal(0.1153, Atmosphere.Density(18288), 3);
        Assert.Equal(295.1, Atmosphere.SpeedOfSound(18288), 1);
        // and it must not keep lapsing above the tropopause
        Assert.Equal(Atmosphere.Temperature(12000), Atmosphere.Temperature(19000), 6);
    }
    [Fact] public void AtmosphereIsContinuousAcrossTheTropopause() {
        // Relative tolerance: across a 2 m gap density genuinely changes ~3e-4 relative
        // (scale height ~6.3 km). A real discontinuity would be orders of magnitude larger.
        double below = Atmosphere.Density(10999), above = Atmosphere.Density(11001);
        Assert.True(System.Math.Abs(below - above) / below < 1e-3, $"density jumps at the tropopause: {below} vs {above}");
        double tBelow = Atmosphere.Temperature(10999.9), tAbove = Atmosphere.Temperature(11000.1);
        Assert.True(System.Math.Abs(tBelow - tAbove) < 0.01, $"temperature jumps: {tBelow} vs {tAbove}");
    }
    [Fact] public void ISAReferenceValuesAt6000m() {
        Assert.Equal(0.6597, Atmosphere.Density(6000), 2);
        Assert.Equal(316.4, Atmosphere.SpeedOfSound(6000), 1);
    }
    [Fact] public void GammaSignGivesClimbAndDescend() {
        var climb = new AircraftState(Vec3D.Zero, 100, 0.5235987755982988, 0, 0, 5000); // +30 deg
        Assert.Equal(50.0, climb.VelocityVector().Y, 6);
        Assert.InRange(climb.VelocityVector().Z, 86.5, 86.7);
        var dive = climb with { Gamma = -0.5235987755982988 };
        Assert.Equal(-50.0, dive.VelocityVector().Y, 6);
        Assert.Equal(1.0, climb.ForwardDir().Length, 9);
    }
}
