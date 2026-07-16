namespace GunsOnly.Sim;
/// World frame: X east, Y up, Z north. Chi: 0 = north, positive toward east. Angles in radians, SI units.
public record struct AircraftState(Vec3D Position, double Speed, double Gamma, double Chi, double Bank, double Mass) {
    public Vec3D VelocityVector() => ForwardDir() * Speed;
    public Vec3D ForwardDir() => new(
        System.Math.Sin(Chi) * System.Math.Cos(Gamma),
        System.Math.Sin(Gamma),
        System.Math.Cos(Chi) * System.Math.Cos(Gamma));
}
