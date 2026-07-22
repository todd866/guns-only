namespace GunsOnly.Sim.Doctrine;
public static class Geometry {
    public static double Range(in AircraftState own, in AircraftState bandit) => (bandit.Position - own.Position).Length;
    public static double Range(in AircraftState own, in ActorObservation contact) =>
        (contact.Position - own.Position).Length;
    public static double Range(in ActorObservation own, in AircraftState contact) =>
        (contact.Position - own.Position).Length;
    public static double AngleOff(in AircraftState own, in AircraftState bandit) {
        var los = (bandit.Position - own.Position).Normalized();
        double d = System.Math.Clamp(own.ForwardDir().Dot(los), -1, 1);
        return System.Math.Acos(d);
    }
    public static double AngleOff(in AircraftState own, in ActorObservation contact) {
        var los = (contact.Position - own.Position).Normalized();
        double d = System.Math.Clamp(own.ForwardDir().Dot(los), -1, 1);
        return System.Math.Acos(d);
    }
    /// Bank (rad, world-relative) that rotates the lift vector into the plane containing velocity and the target.
    public static double BankToPlaceLiftVectorOn(in AircraftState own, Vec3D worldTarget) {
        var vhat = own.ForwardDir();
        var los = (worldTarget - own.Position).Normalized();
        var e = los - vhat * los.Dot(vhat);              // LOS component perpendicular to path
        if (e.Length < 1e-6) return own.Bank;             // dead ahead: keep current bank
        var eHat = e.Normalized();
        var up = new Vec3D(0, 1, 0);
        // World basis (east, up, north) is LEFT-handed: physical direction products
        // take reversed operand order vs the standard determinant Cross (see Vec3D docs).
        var right0 = up.Cross(vhat);                      // level-right basis (physical vhat x up)
        if (right0.Length < 1e-6) return own.Bank;        // vertical path: bank undefined, hold
        right0 = right0.Normalized();
        var upPerp0 = vhat.Cross(right0).Normalized();    // "wings-level lift" direction
        return System.Math.Atan2(eHat.Dot(right0), eHat.Dot(upPerp0));
    }
}
