using GunsOnly.Sim.Doctrine;
namespace GunsOnly.Sim;
public enum CameraMode { Free, Maneuver, Gun }
public readonly record struct CameraPose(Vec3D Position, Vec3D LookAt, Vec3D Up);

public static class CameraSolver {
    public static bool GunWindow(in AircraftState own, in AircraftState bandit) =>
        Geometry.Range(own, bandit) < 800 && Geometry.AngleOff(own, bandit) < 0.2094; // 12 deg

    public static CameraPose Solve(CameraMode mode, in AircraftState own, in AircraftState bandit) {
        var up = new Vec3D(0, 1, 0);
        if (mode == CameraMode.Gun) {
            var pos = own.Position - own.ForwardDir() * 9 + up * 2.5;
            return new CameraPose(pos, own.Position + own.ForwardDir() * 200, up);
        }
        // Maneuver: camera behind own ship, biased opposite the bandit so both frame.
        var los = (bandit.Position - own.Position);
        var losDir = los.Normalized();
        var back = (own.ForwardDir() * 0.35 + losDir * 0.65).Normalized();
        var pos2 = own.Position - back * 26 + up * 7;
        var lookAt = own.Position + los * 0.45;
        return new CameraPose(pos2, lookAt, up);
    }
}
