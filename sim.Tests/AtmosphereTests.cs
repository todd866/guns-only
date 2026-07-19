using GunsOnly.Sim;
using Xunit;

public class AtmosphereTests {
    [Fact]
    public void SeaLevelStateMatchesUsStandardAtmosphere1976() {
        AtmosphericState state = Atmosphere.StateAt(0.0);

        Assert.Equal(288.15, state.TemperatureK, 6);
        Assert.Equal(101325.0, state.PressurePa, 3);
        Assert.Equal(1.2250, state.DensityKgM3, 4);
        Assert.Equal(340.294, state.SpeedOfSoundMps, 3);
    }

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
        // 60k ft = 18288 m geometric = 18235.54 m geopotential. The old troposphere-only model
        // said 169 K and a=261 m/s (13% Mach error) — balloon drops live here.
        Assert.Equal(216.65, Atmosphere.Temperature(18288), 2);
        Assert.Equal(0.116276, Atmosphere.Density(18288), 5);
        Assert.Equal(295.1, Atmosphere.SpeedOfSound(18288), 1);
        // The 11--20 km *geopotential* layer is isothermal.
        Assert.Equal(Atmosphere.Temperature(Atmosphere.GeometricAltitude(12_000)),
            Atmosphere.Temperature(Atmosphere.GeometricAltitude(19_000)), 6);
    }

    [Fact] public void AtmosphereIsContinuousAcrossTheTropopause() {
        double tropopauseGeometricM = Atmosphere.GeometricAltitude(11_000.0);
        // Relative tolerance: across a 2 m gap density genuinely changes ~3e-4 relative
        // (scale height ~6.3 km). A real discontinuity would be orders of magnitude larger.
        double below = Atmosphere.Density(tropopauseGeometricM - 1.0);
        double above = Atmosphere.Density(tropopauseGeometricM + 1.0);
        Assert.True(System.Math.Abs(below - above) / below < 1e-3, $"density jumps at the tropopause: {below} vs {above}");
        double tBelow = Atmosphere.Temperature(tropopauseGeometricM - 0.1);
        double tAbove = Atmosphere.Temperature(tropopauseGeometricM + 0.1);
        Assert.True(System.Math.Abs(tBelow - tAbove) < 0.01, $"temperature jumps: {tBelow} vs {tAbove}");
    }

    [Theory]
    [InlineData(11_000.0, 216.65, 22632.06)]
    [InlineData(20_000.0, 216.65, 5474.889)]
    [InlineData(32_000.0, 228.65, 868.0187)]
    public void PublishedLayerBasesAreReachedAtGeopotentialAltitude(double hM,
        double expectedTemperatureK, double expectedPressurePa) {
        AtmosphericState state = Atmosphere.StateAt(Atmosphere.GeometricAltitude(hM));

        Assert.Equal(hM, state.GeopotentialAltitudeM, 6);
        Assert.Equal(expectedTemperatureK, state.TemperatureK, 5);
        // Published layer-base pressures are rounded; the analytic lower-layer solution may land
        // a few hundredths of a Pascal either side of that printed value.
        Assert.InRange(Math.Abs(state.PressurePa - expectedPressurePa), 0.0,
            expectedPressurePa > 1000 ? 0.1 : 0.01);
    }

    [Fact]
    public void GeometricAndGeopotentialAltitudeRoundTrip() {
        foreach (double geometricM in new[] { -400.0, 0.0, 3_048.0, 18_288.0, 50_000.0 }) {
            double h = Atmosphere.GeopotentialAltitude(geometricM);
            Assert.Equal(geometricM, Atmosphere.GeometricAltitude(h), precision: 7);
        }
    }
    [Fact] public void ISAReferenceValuesAt6000m() {
        Assert.Equal(0.6597, Atmosphere.Density(6000), 2);
        Assert.Equal(316.45, Atmosphere.SpeedOfSound(6000), 2);
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
