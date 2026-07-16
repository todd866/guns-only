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
