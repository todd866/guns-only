namespace GunsOnly.Sim;

/// Unit quaternion rotating the body (right, up, forward) basis into world coordinates.
public readonly record struct QuaternionD(double W, double X, double Y, double Z) {
    public static QuaternionD Identity => new(1, 0, 0, 0);
    public double LengthSquared => W * W + X * X + Y * Y + Z * Z;
    public bool IsFinite => double.IsFinite(W) && double.IsFinite(X) && double.IsFinite(Y) && double.IsFinite(Z);
    public QuaternionD Normalized() {
        double n = System.Math.Sqrt(LengthSquared);
        return n < 1e-12 ? Identity : this * (1.0 / n);
    }
    public QuaternionD Conjugate() => new(W, -X, -Y, -Z);
    public Vec3D Rotate(in Vec3D v) {
        var q = Normalized();
        var r = q * new QuaternionD(0, v.X, v.Y, v.Z) * q.Conjugate();
        return new Vec3D(r.X, r.Y, r.Z);
    }
    public static QuaternionD FromFrame(in Vec3D right, in Vec3D up, in Vec3D forward) {
        double m00 = right.X, m01 = up.X, m02 = forward.X;
        double m10 = right.Y, m11 = up.Y, m12 = forward.Y;
        double m20 = right.Z, m21 = up.Z, m22 = forward.Z;
        double trace = m00 + m11 + m22;
        QuaternionD q;
        if (trace > 0) {
            double s = System.Math.Sqrt(trace + 1.0) * 2.0;
            q = new QuaternionD(0.25 * s, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s);
        } else if (m00 > m11 && m00 > m22) {
            double s = System.Math.Sqrt(1.0 + m00 - m11 - m22) * 2.0;
            q = new QuaternionD((m21 - m12) / s, 0.25 * s, (m01 + m10) / s, (m02 + m20) / s);
        } else if (m11 > m22) {
            double s = System.Math.Sqrt(1.0 + m11 - m00 - m22) * 2.0;
            q = new QuaternionD((m02 - m20) / s, (m01 + m10) / s, 0.25 * s, (m12 + m21) / s);
        } else {
            double s = System.Math.Sqrt(1.0 + m22 - m00 - m11) * 2.0;
            q = new QuaternionD((m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, 0.25 * s);
        }
        return q.Normalized();
    }
    public static QuaternionD operator +(QuaternionD a, QuaternionD b) =>
        new(a.W + b.W, a.X + b.X, a.Y + b.Y, a.Z + b.Z);
    public static QuaternionD operator -(QuaternionD q) => new(-q.W, -q.X, -q.Y, -q.Z);
    public static QuaternionD operator *(QuaternionD q, double s) => new(q.W * s, q.X * s, q.Y * s, q.Z * s);
    public static QuaternionD operator *(QuaternionD a, QuaternionD b) => new(
        a.W * b.W - a.X * b.X - a.Y * b.Y - a.Z * b.Z,
        a.W * b.X + a.X * b.W + a.Y * b.Z - a.Z * b.Y,
        a.W * b.Y - a.X * b.Z + a.Y * b.W + a.Z * b.X,
        a.W * b.Z + a.X * b.Y - a.Y * b.X + a.Z * b.W);
}

/// Principal-axis angular rates: roll p, pitch q, yaw r, radians per second.
public readonly record struct BodyRates(double P, double Q, double R) {
    public bool IsFinite => double.IsFinite(P) && double.IsFinite(Q) && double.IsFinite(R);
    public static BodyRates operator +(BodyRates a, BodyRates b) => new(a.P + b.P, a.Q + b.Q, a.R + b.R);
    public static BodyRates operator *(BodyRates v, double s) => new(v.P * s, v.Q * s, v.R * s);
}

/// World frame: X east, Y up, Z north. Chi: 0 = north, positive toward east. Angles in radians, SI units.
/// Bank remains the augmented flight-path bank for API compatibility; BodyAttitude is authoritative.
public record struct AircraftState(Vec3D Position, double Speed, double Gamma, double Chi, double Bank, double Mass,
    QuaternionD BodyAttitude = default, BodyRates BodyRates = default) {
    public Vec3D VelocityVector() => ForwardDir() * Speed;
    public Vec3D ForwardDir() => new(
        System.Math.Sin(Chi) * System.Math.Cos(Gamma),
        System.Math.Sin(Gamma),
        System.Math.Cos(Chi) * System.Math.Cos(Gamma));
}
