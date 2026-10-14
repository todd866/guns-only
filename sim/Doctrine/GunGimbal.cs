namespace GunsOnly.Sim.Doctrine;

/// Authored game assist, NOT an assertion that the real F-22 has a movable M61 mount.
/// A body-relative mount: finite travel and slew, with ordinary unguided rounds after release.
public sealed record GunGimbalConfig(double ConeHalfAngleRad, double SlewRateRadPerSecond) {
    public static GunGimbalConfig ForAssist(double scale) =>
        new(12.0 * Math.Clamp(scale, 0, 1) * Math.PI / 180, 60.0 * Math.PI / 180);
}

internal sealed class GunGimbal {
    // Fictional external nose mount, 0.15 m forward of the 18.9 m F-22 solid.
    public const double MuzzleStationM = 9.6;
    public bool Tracking { get; private set; }
    Vec3D _localAxis = new(0, 0, 1);
    public void CopyFrom(GunGimbal other) { _localAxis = other._localAxis; Tracking = false; }
    public double OffsetRad => Math.Acos(Math.Clamp(_localAxis.Z, -1, 1));

    public Vec3D MuzzlePosition(in AircraftState own) =>
        own.Position + Attitude(own).Rotate(new Vec3D(0, 0, MuzzleStationM));

    public Vec3D Direction(in AircraftState own) => Attitude(own).Rotate(_localAxis).Normalized();

    public void Step(in AircraftState own, in Vec3D lead, bool track,
        GunGimbalConfig? config, double dt) {
        Tracking = false;
        if (config is null || config.ConeHalfAngleRad <= 0) {
            _localAxis = new(0, 0, 1);
            return;
        }
        Vec3D desired = track ? Attitude(own).Conjugate().Rotate(lead).Normalized() : new(0, 0, 1);
        bool eligible = track && Math.Acos(Math.Clamp(desired.Z, -1, 1)) <= config.ConeHalfAngleRad;
        if (!eligible) desired = new(0, 0, 1);
        double angle = Math.Acos(Math.Clamp(_localAxis.Dot(desired), -1, 1));
        double step = config.SlewRateRadPerSecond * dt;
        if (angle <= step || angle < 1e-10) _localAxis = desired;
        else _localAxis = (_localAxis * (Math.Sin(angle - step) / Math.Sin(angle))
            + desired * (Math.Sin(step) / Math.Sin(angle))).Normalized();
        Tracking = eligible && Math.Acos(Math.Clamp(_localAxis.Dot(desired), -1, 1)) < 0.1 * Math.PI / 180;
    }

    static QuaternionD Attitude(in AircraftState state) {
        if (state.BodyAttitude.IsFinite && state.BodyAttitude.LengthSquared >= 1e-12)
            return state.BodyAttitude.Normalized();
        Vec3D f = state.ForwardDir();
        Vec3D r = new(Math.Cos(state.Chi), 0, -Math.Sin(state.Chi));
        Vec3D u = f.Cross(r);
        Vec3D br = r * Math.Cos(state.Bank) - u * Math.Sin(state.Bank);
        return QuaternionD.FromFrame(br, f.Cross(br), f);
    }
}
