using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim;

public enum PathfinderFootprintClass { Unknown, Clear, Populated }

/// Authored inhabited ground boundary in world X/Z metres; Y is ignored. Boundary contact counts.
public sealed class PathfinderPopulatedArea {
    public string Id { get; }
    public IReadOnlyList<Vec3D> Vertices { get; }
    public PathfinderPopulatedArea(string id, IEnumerable<Vec3D> vertices) {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        var points = vertices.ToArray();
        if (points.Length < 3 || points.Any(p => !p.IsFinite))
            throw new ArgumentException("A populated polygon needs at least three finite vertices.", nameof(vertices));
        double twiceArea = 0;
        for (int i = 0; i < points.Length; i++) {
            var a = points[i]; var b = points[(i + 1) % points.Length];
            twiceArea += a.X * b.Z - b.X * a.Z;
        }
        if (Math.Abs(twiceArea) < 1e-6)
            throw new ArgumentException("A populated polygon must enclose area.", nameof(vertices));
        Id = id;
        Vertices = Array.AsReadOnly(points);
    }

    internal bool Intersects(Vec3D centre, double radius) {
        bool inside = false;
        for (int i = 0, j = Vertices.Count - 1; i < Vertices.Count; j = i++) {
            var a = Vertices[j]; var b = Vertices[i];
            double dx = b.X - a.X, dz = b.Z - a.Z;
            double length2 = dx * dx + dz * dz;
            double t = length2 > 0 ? Math.Clamp(((centre.X - a.X) * dx
                + (centre.Z - a.Z) * dz) / length2, 0, 1) : 0;
            double ex = centre.X - a.X - t * dx, ez = centre.Z - a.Z - t * dz;
            if (ex * ex + ez * ez <= radius * radius + 1e-8) return true;
            if ((a.Z > centre.Z) != (b.Z > centre.Z)
                && centre.X < a.X + (centre.Z - a.Z) * dx / dz) inside = !inside;
        }
        return inside;
    }
}

public readonly record struct PathfinderFootprint(Vec3D Centre, double RadiusM, double FallSeconds) {
    public PathfinderFootprintClass Classify(IEnumerable<PathfinderPopulatedArea> areas) {
        if (!Centre.IsFinite || !double.IsFinite(RadiusM) || RadiusM < 0
            || !double.IsFinite(FallSeconds) || FallSeconds < 0)
            return PathfinderFootprintClass.Unknown;
        foreach (var area in areas)
            if (area.Intersects(Centre, RadiusM)) return PathfinderFootprintClass.Populated;
        return PathfinderFootprintClass.Clear;
    }
}

/// Provisional tumbling-payload linear drag surrogate. Live debris and the prediction use the
/// same fall law and shared sounding. No wall-clock randomness or instantaneous ground teleport.
public sealed class PathfinderDebris {
    public const double TerminalFallSpeedMps = 55;
    public const double HorizontalResponseSeconds = 10;
    public const double WindUncertaintyMps = 2;
    public const double ScatterRadiusM = 30;
    readonly IWindField _wind;
    readonly double _groundY;
    public Vec3D Position { get; private set; }
    public Vec3D Velocity { get; private set; }
    public bool Landed { get; private set; }

    public PathfinderDebris(Vec3D position, Vec3D velocity, IWindField wind, double groundY = 0) {
        if (!position.IsFinite || !velocity.IsFinite || !double.IsFinite(groundY))
            throw new ArgumentException("Debris kinematics and datum must be finite.");
        Position = position; Velocity = velocity;
        _wind = wind ?? throw new ArgumentNullException(nameof(wind));
        _groundY = groundY;
    }

    public void Step(double dt) {
        if (!double.IsFinite(dt) || dt < 0) throw new ArgumentOutOfRangeException(nameof(dt));
        // Bounded substeps retain the same height-dependent sounding in prediction and live fall.
        while (dt > 1e-12 && !Landed) {
            double h = Math.Min(dt, 0.25);
            var wind = _wind.Sample(Position);
            double verticalTau = TerminalFallSpeedMps / Doctrine.GunKill.GravityMps2;
            double eh = Math.Exp(-h / HorizontalResponseSeconds), ev = Math.Exp(-h / verticalTau);
            var next = Position + new Vec3D(
                wind.X * h + (Velocity.X - wind.X) * HorizontalResponseSeconds * (1 - eh),
                -TerminalFallSpeedMps * h + (Velocity.Y + TerminalFallSpeedMps) * verticalTau * (1 - ev),
                wind.Z * h + (Velocity.Z - wind.Z) * HorizontalResponseSeconds * (1 - eh));
            Velocity = new(wind.X + (Velocity.X - wind.X) * eh,
                -TerminalFallSpeedMps + (Velocity.Y + TerminalFallSpeedMps) * ev,
                wind.Z + (Velocity.Z - wind.Z) * eh);
            if (next.Y <= _groundY) {
                double fraction = Position.Y > _groundY
                    ? Math.Clamp((Position.Y - _groundY) / (Position.Y - next.Y), 0, 1) : 0;
                Position += (next - Position) * fraction;
                Position = Position with { Y = _groundY };
                Velocity = Vec3D.Zero;
                Landed = true;
            } else Position = next;
            dt -= h;
        }
    }

    public static PathfinderFootprint Predict(Vec3D position, Vec3D velocity,
        IWindField wind, double groundY = 0) {
        var falling = new PathfinderDebris(position, velocity, wind, groundY);
        double seconds = 0;
        while (!falling.Landed && seconds < 3600) {
            falling.Step(0.25);
            seconds += 0.25;
        }
        return falling.Landed
            ? new(falling.Position, ScatterRadiusM + WindUncertaintyMps * seconds, seconds)
            : new(falling.Position, double.NaN, seconds);
    }
}
