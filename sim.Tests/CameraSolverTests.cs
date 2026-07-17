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
    [Fact] public void BanditDirectlyAboveKeepsBothFramed() {
        var own = At(new Vec3D(0, 3000, 0), 0);
        var bandit = At(new Vec3D(0, 3400, 0), 0);
        var pose = CameraSolver.Solve(CameraMode.Maneuver, own, bandit);
        Assert.True(AngleFrom(pose, own.Position) < 0.55, "own ship out of frame with bandit above");
        Assert.True(AngleFrom(pose, bandit.Position) < 0.55, "bandit out of frame when directly above");
    }
    [Fact] public void PosesAlwaysCarryUsableUp() {
        var casesOwn = new[] {
            At(new Vec3D(0, 3000, 0), 0),
            new AircraftState(new Vec3D(0, 3000, 0), 180, 1.5707, 0, 0, 6900), // straight up
        };
        var bandit = At(new Vec3D(0, 3400, 0), 0);
        foreach (var own in casesOwn) foreach (var mode in new[] { CameraMode.Maneuver, CameraMode.Gun }) {
            var pose = CameraSolver.Solve(mode, own, bandit);
            var view = (pose.LookAt - pose.Position).Normalized();
            Assert.Equal(1.0, pose.Up.Length, 6);
            Assert.True(System.Math.Abs(pose.Up.Dot(view)) < 0.99, $"up parallel to view in {mode}");
        }
    }
}
