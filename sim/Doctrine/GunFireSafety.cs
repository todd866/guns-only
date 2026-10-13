using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Doctrine;

/// Release interlock for the fictional player mount. Prediction, not projectile steering.
internal static class GunFireSafety {
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
        int count = (int)Math.Ceiling(life * Math.Max(velocity.Length, 1) / spacing);
        // No undersampling when the terrain cannot fit the bounded query budget.
        if (count > TerrainQueries.MaximumPathSamples) return false;
        count = Math.Max(1, count);
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
