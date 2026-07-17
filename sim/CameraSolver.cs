using GunsOnly.Sim.Doctrine;
namespace GunsOnly.Sim;
public enum CameraMode { Free, Maneuver, Gun }
public readonly record struct CameraPose(Vec3D Position, Vec3D LookAt, Vec3D Up);

public static class CameraSolver {
    public static bool GunWindow(in AircraftState own, in AircraftState bandit) =>
        Geometry.Range(own, bandit) < 800 && Geometry.AngleOff(own, bandit) < 0.2094; // 12 deg

    /// Orthogonalized up for a view direction: world-up projected off the view axis,
    /// falling back to world-north when the view is near-vertical (Godot look_at forbids view||up).
    static Vec3D SafeUp(in Vec3D viewDir) {
        var up = new Vec3D(0, 1, 0);
        var u = up - viewDir * up.Dot(viewDir);
        if (u.Length > 0.05) return u.Normalized();
        var north = new Vec3D(0, 0, 1);
        return (north - viewDir * north.Dot(viewDir)).Normalized();
    }

    public static CameraPose Solve(CameraMode mode, in AircraftState own, in AircraftState bandit) {
        if (mode == CameraMode.Gun) {
            var fwd = own.ForwardDir();
            var upG = SafeUp(fwd);
            var pos = own.Position - fwd * 9 + upG * 2.5;
            var lookAt = own.Position + fwd * 200;
            return new CameraPose(pos, lookAt, SafeUp((lookAt - pos).Normalized()));
        }
        // Maneuver: behind own ship, biased opposite the bandit; aim along the BISECTOR of the
        // camera->own and camera->bandit rays; back the camera out until both fit the cone.
        var los = bandit.Position - own.Position;
        var losDir = los.Length < 1e-6 ? own.ForwardDir() : los.Normalized();
        var back = own.ForwardDir() * 0.35 + losDir * 0.65;
        var backDir = back.Length < 1e-6 ? own.ForwardDir() : back.Normalized();
        double dist = 26;
        for (int i = 0; i < 6; i++) {
            var camPos = own.Position - backDir * dist + new Vec3D(0, 1, 0) * (dist * 0.27);
            var toOwn = (own.Position - camPos).Normalized();
            var toBandit = (bandit.Position - camPos).Normalized();
            double sep = System.Math.Acos(System.Math.Clamp(toOwn.Dot(toBandit), -1, 1));
            if (sep <= 1.02) {                                   // both fit 0.55 rad half-cone with margin
                var aim = toOwn + toBandit;
                var aimDir = aim.Length < 1e-6 ? toOwn : aim.Normalized();
                var lookAt = camPos + aimDir * System.Math.Max(los.Length, 50);
                return new CameraPose(camPos, lookAt, SafeUp(aimDir));
            }
            dist *= 1.6;                                         // back out and retry
        }
        var camPosF = own.Position - backDir * dist + new Vec3D(0, 1, 0) * (dist * 0.27);
        var aimF = (own.Position - camPosF).Normalized() + (bandit.Position - camPosF).Normalized();
        var aimDirF = aimF.Length < 1e-6 ? (own.Position - camPosF).Normalized() : aimF.Normalized();
        return new CameraPose(camPosF, camPosF + aimDirF * 100, SafeUp(aimDirF));
    }
}
