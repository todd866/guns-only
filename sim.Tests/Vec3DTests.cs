using GunsOnly.Sim; using Xunit;
public class Vec3DTests {
    [Fact] public void CrossOfUnitXAndUnitYIsUnitZ() {
        var c = new Vec3D(1,0,0).Cross(new Vec3D(0,1,0));
        Assert.Equal(0, c.X, 12); Assert.Equal(0, c.Y, 12); Assert.Equal(1, c.Z, 12);
    }
    [Fact] public void NormalizedHasLengthOne() {
        Assert.Equal(1.0, new Vec3D(3,4,12).Normalized().Length, 12);
    }
    [Fact] public void DotOfOrthogonalIsZero() {
        Assert.Equal(0.0, new Vec3D(1,0,0).Dot(new Vec3D(0,5,0)), 12);
    }
}
