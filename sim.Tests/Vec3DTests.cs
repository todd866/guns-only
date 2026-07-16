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
    [Fact] public void PhysicalCrossProductsUseReversedOperandsInThisBasis() {
        var east = new Vec3D(1, 0, 0); var up = new Vec3D(0, 1, 0); var north = new Vec3D(0, 0, 1);
        Assert.Equal(east, up.Cross(north));       // physical: north x up = east
        Assert.Equal(new Vec3D(0, 0, 1), east.Cross(up)); // determinant formula gives +Z here; PHYSICAL east x up = south = -Z, hence the reversed-operand rule above
    }
}
