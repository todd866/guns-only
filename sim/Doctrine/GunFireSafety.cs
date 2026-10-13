using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Doctrine;

/// Release interlock for the fictional player mount. Prediction, not projectile steering.
internal static class GunFireSafety {
    // Full two-second M61 flight, including aircraft translation, needs >256 samples at
    // production terrain's 8 m spacing. Keep the fine spacing and a gun-specific bound;
    // 4096 also accommodates the 1 m minimum spacing at normal F-22 speeds.
    internal const int MaximumPathSamples = 4096;
    public static bool PathClear(Vec3D muzzle, Vec3D velocity, double life,
        ITerrainSurface? terrain, AircraftState? friendly = null) {
        Vec3D gravity = new(0, -GunKill.GravityMps2, 0);
        Vec3D end = muzzle + velocity * life + gravity * (0.5 * life * life);
        double ceiling = Math.Max(0, terrain?.MaximumHeightM ?? 0);
        bool terrainPossible = Math.Min(muzzle.Y, end.Y) <= ceiling;
        if (!terrainPossible && friendly is null) return true;
        double resolution = terrain?.HorizontalResolutionM ?? 20;
        double spacing = double.IsFinite(resolution) && resolution > 0
            ? Math.Clamp(resolution * 0.25, 1, 20) : 5;
        // Acceleration can increase speed during flight. Bound arc length by the larger
        // endpoint speed (norm of the linear velocity is convex), not just launch speed.
        double maxSpeed = Math.Max(velocity.Length, (velocity + gravity * life).Length);
        double samples = Math.Ceiling(life * Math.Max(maxSpeed, 1) / spacing);
        // No undersampling when the terrain cannot fit the bounded query budget.
        if (!double.IsFinite(samples) || samples > MaximumPathSamples) return false;
        int count = Math.Max(1, (int)samples);
        Vec3D previous = muzzle;
        for (int i = 0; i <= count; i++) {
            double t = life * i / count;
            Vec3D point = muzzle + velocity * t + gravity * (0.5 * t * t);
            if (terrainPossible) {
                double height = 0;
                if (terrain is not null && (!terrain.TryHeightM(point.X, point.Z, out height)
                    || !double.IsFinite(height))) return false;
                // A spacing-sized clearance margin conservatively blocks near-surface fire.
                if (point.Y <= Math.Max(0, height) + spacing) return false;
            }
            if (i > 0 && friendly is AircraftState friend) {
                double startT = life * (i - 1) / count;
                Vec3D rel = previous - friend.Position - friend.VelocityVector() * startT;
                Vec3D delta = point - previous - friend.VelocityVector() * (t - startT);
                if (AirframeHitGeometry.F22.TryEntry(friend, rel, delta, startT, t - startT, out _))
                    return false;
            }
            previous = point;
        }
        return true;
    }
}
