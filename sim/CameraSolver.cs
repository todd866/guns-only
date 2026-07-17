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
            var pos = own.Position - fwd * 8.5 + upG * 2.6; // eye above the spine: airframe below the sightline, pipper unobstructed
            var lookAt = own.Position + fwd * 200;
            return new CameraPose(pos, lookAt, SafeUp((lookAt - pos).Normalized()));
        }
        // Maneuver: camera sits close behind own ship, nearly ON the own->bandit line
        // (opposite the bandit), so both targets are near-collinear and framing is trivial
        // at chase distance — own ship anchors the frame, the bandit sits beyond it.
        // A slight up-bias keeps the horizon in frame for attitude context. The back-out
        // loop remains only as a last-resort safety for degenerate geometry.
        var los = bandit.Position - own.Position;
        var losDir = los.Length < 1e-6 ? own.ForwardDir() : los.Normalized();
        var back = own.ForwardDir() * 0.15 + losDir * 0.85;
        var backDir = back.Length < 1e-6 ? own.ForwardDir() : back.Normalized();
        // Flatten: keep the camera near the player's horizon plane instead of climbing a
        // steep LOS (a camera on a steep LOS looks straight DOWN through the jet: top-down
        // plan view, bandit occluded, no horizon — rig finding).
        var flat = new Vec3D(backDir.X, backDir.Y * 0.35, backDir.Z);
        if (flat.Length > 1e-6) backDir = flat.Normalized();
        double dist = 18;  // close chase: an 11 m jet should command the frame
        for (int i = 0; i < 6; i++) {
            var camPos = own.Position - backDir * dist + new Vec3D(0, 1, 0) * (dist * 0.20);
            var toOwn = (own.Position - camPos).Normalized();
            var toBandit = (bandit.Position - camPos).Normalized();
            double sep = System.Math.Acos(System.Math.Clamp(toOwn.Dot(toBandit), -1, 1));
            if (sep <= 1.02) {                                   // both fit 0.55 rad half-cone with margin
                var aim = toOwn + toBandit;
                var aimDir = aim.Length < 1e-6 ? toOwn : aim.Normalized();
                double slack = 1.02 - sep;                        // spend spare cone on horizon context
                aimDir = (aimDir + new Vec3D(0, 1, 0) * System.Math.Min(0.12, slack * 0.25)).Normalized();
                var lookAt = camPos + aimDir * System.Math.Max(los.Length, 50);
                return new CameraPose(camPos, lookAt, SafeUp(aimDir));
            }
            dist *= 1.6;                                         // back out and retry
        }
        var camPosF = own.Position - backDir * dist + new Vec3D(0, 1, 0) * (dist * 0.20);
        var aimF = (own.Position - camPosF).Normalized() + (bandit.Position - camPosF).Normalized();
        var aimDirF = aimF.Length < 1e-6 ? (own.Position - camPosF).Normalized() : aimF.Normalized();
        return new CameraPose(camPosF, camPosF + aimDirF * 100, SafeUp(aimDirF));
    }
}
