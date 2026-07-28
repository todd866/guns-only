namespace GunsOnly.Sim;

/// <summary>
/// Fictional Rapier installation contract over the real, atlas-derived terrain substrate.
/// These are construction and support datums, not edits to the natural DEM.
/// </summary>
public static class RapierLaunchSite {
    /// Operating slab/rail base selected from the 32 m atlas survey. The highest natural sample
    /// under the 72 m recovery shoulder plus launch gallery/ramp earthworks is 190.9125 m, leaving
    /// 1.0875 m minimum construction separation without flattening terrain outside the footprint.
    public const double OperatingSurfaceElevationM = 192.0;
    public const double MaximumSurveyedNaturalTerrainM = 190.9125;
    public const double MinimumConstructionSeparationM =
        OperatingSurfaceElevationM - MaximumSurveyedNaturalTerrainM;

    /// Provisional vertical distance from AircraftState's aerodynamic/presentation reference to
    /// its loaded wheel/cradle support plane. It is authored aircraft-side geometry, deliberately
    /// independent of JavaScript mesh bounds, and is shared by launch and fixed-strip recovery.
    public const double AircraftSupportReferenceHeightM = 0.85;

    /// Top of the visible fixed-installation rail above the slab datum.
    public const double LaunchRailHeadHeightM = 0.15;
    public const double AircraftHalfSpanM = 7.35 / 2.0;

    /// Equality with a support plane is contact, not penetration. This tolerance absorbs only
    /// floating-point interpolation at an authored surface; it is never a terrain clamp.
    public const double SurfaceContactToleranceM = 0.02;
}
