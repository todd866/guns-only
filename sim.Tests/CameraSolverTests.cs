using GunsOnly.Sim; using Xunit;
public class CameraSolverTests {
    static AircraftState At(Vec3D p, double chi) => new(p, 180, 0, chi, 0, 6900);
    static double AngleFrom(CameraPose pose, Vec3D target) {
        var f = (pose.LookAt - pose.Position).Normalized();
        var t = (target - pose.Position).Normalized();
        return System.Math.Acos(System.Math.Clamp(f.Dot(t), -1, 1));
    }
    [Theory]
    [InlineData(300, 0, 400)] [InlineData(-800, 200, 1200)] [InlineData(50, -100, 150)]
    public void ManeuverModeKeepsBothShipsInsideSixtyDegreeCone(double bx, double by, double bz) {
        var own = At(new Vec3D(0, 3000, 0), 0);
        var bandit = At(new Vec3D(bx, 3000 + by, bz), 0.5);
        var pose = CameraSolver.Solve(CameraMode.Maneuver, own, bandit);
        Assert.True(AngleFrom(pose, own.Position) < 0.55, "own ship out of frame");
        Assert.True(AngleFrom(pose, bandit.Position) < 0.55, "bandit out of frame");
    }
    [Fact] public void GunModeLooksAlongOwnNose() {
        var own = At(new Vec3D(0, 3000, 0), 0);
        var bandit = At(new Vec3D(0, 3000, 600), 0);
        var pose = CameraSolver.Solve(CameraMode.Gun, own, bandit);
        var f = (pose.LookAt - pose.Position).Normalized();
        Assert.True(f.Dot(own.ForwardDir()) > 0.995);
    }
    [Fact] public void GunWindowRequiresRangeAndAngle() {
        var own = At(new Vec3D(0, 3000, 0), 0);
        Assert.True(CameraSolver.GunWindow(own, At(new Vec3D(20, 3010, 500), 0)));
        Assert.False(CameraSolver.GunWindow(own, At(new Vec3D(20, 3010, 1500), 0)));   // too far
        Assert.False(CameraSolver.GunWindow(own, At(new Vec3D(600, 3010, 300), 0)));   // too wide
    }
}
