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
}
