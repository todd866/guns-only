namespace GunsOnly.Sim;
public readonly record struct Vec3D(double X, double Y, double Z) {
    public static Vec3D Zero => new(0, 0, 0);
    public static Vec3D operator +(Vec3D a, Vec3D b) => new(a.X+b.X, a.Y+b.Y, a.Z+b.Z);
    public static Vec3D operator -(Vec3D a, Vec3D b) => new(a.X-b.X, a.Y-b.Y, a.Z-b.Z);
    public static Vec3D operator *(Vec3D a, double s) => new(a.X*s, a.Y*s, a.Z*s);
    public double Dot(Vec3D b) => X*b.X + Y*b.Y + Z*b.Z;
    public Vec3D Cross(Vec3D b) => new(Y*b.Z - Z*b.Y, Z*b.X - X*b.Z, X*b.Y - Y*b.X);
    public double Length => System.Math.Sqrt(Dot(this));
    public Vec3D Normalized() { var l = Length; return l < 1e-12 ? Zero : this * (1.0/l); }
}
