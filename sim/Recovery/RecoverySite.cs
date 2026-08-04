using System;

namespace GunsOnly.Sim.Recovery;

/// Where the approach ends: a threshold on a landing surface with a heading and elevation.
/// Heights published by the solver are absolute MSL; stabilisation is surface elevation plus the
/// airframe/deck relative shelf so a strip at 192 m never schedules a floor at 152 m MSL.
public readonly record struct RecoverySite(
    bool Known,
    Vec3D Threshold,
    double SurfaceElevationM,
    double LandingHeadingRad,
    string Label) {
    public static RecoverySite Unknown => new(false, default, 0.0, 0.0, "");

    public double StabilisationAltitudeMsl(double stabiliseHeightAboveSurfaceM) =>
        SurfaceElevationM + Math.Max(0.0, stabiliseHeightAboveSurfaceM);
}

/// Resolves the recovery site from the surfaces the session already knows about. Pure selection;
/// no solve.
public static class RecoverySiteResolver {
    /// Prefer the physical carrier/strip whenever one exists. The intent gate decides whether
    /// guidance is visible; site selection must not fall back to a staged Home Plate while a
    /// moving deck continues to steam.
    public static RecoverySite Resolve(
        Carrier? carrier,
        MeshPlace? homePlate,
        bool recoveryPointKnown,
        Vec3D? recoveryPoint,
        double? recoveryHeadingRad) {
        if (carrier is not null) {
            Vec3D touch = carrier.TouchdownPoint;
            return new RecoverySite(
                true,
                touch,
                touch.Y,
                carrier.LandingHeadingRad,
                carrier.IsMaritime ? "SHIP" : "STRIP");
        }

        if (homePlate is { } home && double.IsFinite(home.EastM) && double.IsFinite(home.NorthM)) {
            double elev = home.UpM is { } up && double.IsFinite(up) ? up : 0.0;
            double heading = recoveryHeadingRad is { } h && double.IsFinite(h) ? h : 0.0;
            return new RecoverySite(
                true,
                new Vec3D(home.EastM, elev, home.NorthM),
                elev,
                heading,
                string.IsNullOrWhiteSpace(home.DisplayName) ? "HOME" : home.DisplayName);
        }

        if (recoveryPointKnown
            && recoveryPoint is { } point
            && point.IsFinite) {
            double heading = recoveryHeadingRad is { } h && double.IsFinite(h) ? h : 0.0;
            return new RecoverySite(
                true, point, point.Y, heading, "HOME");
        }

        return RecoverySite.Unknown;
    }
}
