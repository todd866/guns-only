namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// Composite solid in body metres (+X right, +Y up, +Z forward). No aim forgiveness.
/// Dimensions are public; section widths/thicknesses are surrogate, not measured structure.
/// See docs/airframe-hit-geometry.md for stations, scope and approximation limits.
/// </summary>
public sealed class AirframeHitGeometry {
    readonly Cell[] _cells;
    readonly double _boundingRadius;
    public string Id { get; }
    public Vec3D Minimum { get; }
    public Vec3D Maximum { get; }
    public static AirframeHitGeometry Su27 { get; } = BuildSu27();
    // Su-35 uses the same Su-27 presentation surrogate in this product.
    public static AirframeHitGeometry Su35 => Su27;
    public static AirframeHitGeometry F22 { get; } = BuildF22();

    AirframeHitGeometry(string id, List<Cell> cells) {
        Id = id;
        _cells = cells.ToArray();
        Minimum = new(cells.Min(c => c.Min.X), cells.Min(c => c.Min.Y), cells.Min(c => c.Min.Z));
        Maximum = new(cells.Max(c => c.Max.X), cells.Max(c => c.Max.Y), cells.Max(c => c.Max.Z));
        _boundingRadius = cells.Max(c => c.Vertices.Max(v => v.Length));
    }

    /// Relative endpoints already include target translation. Rotate into the target's body,
    /// using constant beginning-of-tick angular rates, subdivided at 0.002 rad to bound chord
    /// error (<0.01 mm at a 12 m extremity). This also catches a fin rotating across a round.
    public bool TryEntry(in AircraftState target, in Vec3D relativeStart,
        in Vec3D relativeDelta, double elapsedAtStart, double duration, out double fraction) {
        fraction = double.PositiveInfinity;
        double d2 = relativeDelta.Dot(relativeDelta);
        double closest = d2 > 1e-18
            ? Math.Clamp(-relativeStart.Dot(relativeDelta) / d2, 0, 1) : 0;
        Vec3D nearest = relativeStart + relativeDelta * closest;
        if (nearest.Dot(nearest) > _boundingRadius * _boundingRadius) return false;
        QuaternionD attitude = Attitude(target);
        BodyRates rates = target.BodyRates;
        double rate = Math.Sqrt(rates.P * rates.P + rates.Q * rates.Q + rates.R * rates.R);
        int slices = Math.Max(1, (int)Math.Ceiling(rate * duration / 0.002));
        Vec3D start = AtTime(attitude, rates, rate, elapsedAtStart).Conjugate().Rotate(relativeStart);
        for (int i = 0; i < slices; i++) {
            double endFraction = (i + 1.0) / slices;
            Vec3D end = AtTime(attitude, rates, rate, elapsedAtStart + duration * endFraction)
                .Conjugate().Rotate(relativeStart + relativeDelta * endFraction);
            if (TryBodyEntry(start, end - start, out double local)) {
                fraction = (i + local) / slices;
                return true;
            }
            start = end;
        }
        return false;
    }

    static QuaternionD AtTime(QuaternionD attitude, BodyRates rates, double rate, double time) {
        if (rate < 1e-12) return attitude;
        double s = Math.Sin(rate * time * 0.5) / rate;
        return attitude * new QuaternionD(Math.Cos(rate * time * 0.5), -rates.Q * s, rates.R * s, -rates.P * s);
    }

    static QuaternionD Attitude(in AircraftState state) {
        if (state.BodyAttitude.IsFinite && state.BodyAttitude.LengthSquared >= 1e-12)
            return state.BodyAttitude.Normalized();
        Vec3D forward = state.ForwardDir();
        Vec3D right = new(Math.Cos(state.Chi), 0, -Math.Sin(state.Chi));
        Vec3D up = forward.Cross(right);
        Vec3D bankedRight = right * Math.Cos(state.Bank) - up * Math.Sin(state.Bank);
        return QuaternionD.FromFrame(bankedRight, forward.Cross(bankedRight), forward);
    }

    public bool TryBodyEntry(in Vec3D start, in Vec3D delta, out double fraction) {
        fraction = double.PositiveInfinity;
        foreach (Cell cell in _cells)
            if (cell.TryEntry(start, delta, out double entry)) fraction = Math.Min(fraction, entry);
        return double.IsFinite(fraction);
    }

    readonly record struct Plane(Vec3D Normal, double Offset);
    sealed class Cell {
        public readonly Vec3D[] Vertices;
        public readonly Vec3D Min, Max;
        readonly Plane[] _planes;
        readonly Cell[]? _parts;
        public Cell(Vec3D[] vertices, List<(int A, int B, int C)> faces) {
            Vertices = vertices;
            Min = new(vertices.Min(v => v.X), vertices.Min(v => v.Y), vertices.Min(v => v.Z));
            Max = new(vertices.Max(v => v.X), vertices.Max(v => v.Y), vertices.Max(v => v.Z));
            Vec3D centre = vertices.Aggregate(Vec3D.Zero, (a, v) => a + v) * (1.0 / vertices.Length);
            _planes = faces.Select(f => {
                Vec3D a = vertices[f.A];
                Vec3D cross = (vertices[f.B] - a).Cross(vertices[f.C] - a);
                // Tiny but nonzero canopy endpoint tetrahedra still need every bounding plane.
                // Vec3D.Normalized's general 1e-12 cutoff would drop their cap normals.
                double length = cross.Length;
                Vec3D n = length > 0 ? cross * (1 / length) : Vec3D.Zero;
                if (n.Dot(centre - a) > 0) n = n * -1;
                return new Plane(n, n.Dot(a));
            }).Where(p => p.Normal.Length > 0.5).ToArray();
        }
        public Cell(Vec3D[] vertices, Cell[] parts) : this(vertices, new List<(int, int, int)>()) { _parts = parts; }
        public bool TryEntry(in Vec3D start, in Vec3D delta, out double fraction) {
            fraction = 0;
            Vec3D end = start + delta;
            if (Math.Max(start.X, end.X) < Min.X || Math.Min(start.X, end.X) > Max.X
                || Math.Max(start.Y, end.Y) < Min.Y || Math.Min(start.Y, end.Y) > Max.Y
                || Math.Max(start.Z, end.Z) < Min.Z || Math.Min(start.Z, end.Z) > Max.Z) return false;
            if (_parts is not null) {
                fraction = double.PositiveInfinity;
                foreach (Cell part in _parts)
                    if (part.TryEntry(start, delta, out double entry)) fraction = Math.Min(fraction, entry);
                return double.IsFinite(fraction);
            }
            double exit = 1;
            foreach (Plane p in _planes) {
                double distance = p.Normal.Dot(start) - p.Offset;
                double speed = p.Normal.Dot(delta);
                if (Math.Abs(speed) < 1e-14) {
                    if (distance > 1e-10) return false;
                    continue;
                }
                double crossing = -distance / speed;
                if (speed < 0) fraction = Math.Max(fraction, crossing);
                else exit = Math.Min(exit, crossing);
                if (fraction > exit + 1e-12) return false;
            }
            return fraction <= 1 && exit >= 0;
        }
    }

    // A prism with corresponding convex rings and planar sides;
    // no whole-aircraft box or convex hull bridges the empty space around swept wings/twin fins.
    static void Prism(List<Cell> cells, Vec3D[] a, Vec3D[] b) {
        int n = a.Length;
        var faces = new List<(int, int, int)> { (0, 1, 2), (n, n + 1, n + 2) };
        for (int i = 0; i < n; i++) {
            int j = (i + 1) % n;
            faces.Add((i, j, n + i));
            faces.Add((j, n + j, n + i));
        }
        cells.Add(new Cell(a.Concat(b).ToArray(), faces));
    }
    readonly record struct Station(double S, double Rx, double Ry, double Y, double N = 2);
    static void Loft(List<Cell> cells, double origin, Station[] stations, double x = 0, int segments = 18) {
        Vec3D[] Ring(Station s) => Enumerable.Range(0, segments).Select(i => {
            double angle = i * 2 * Math.PI / segments;
            double c = Math.Cos(angle), t = Math.Sin(angle);
            return new Vec3D(x + Math.Sign(c) * Math.Pow(Math.Abs(c), 2 / s.N) * s.Rx,
                s.Y + Math.Sign(t) * Math.Pow(Math.Abs(t), 2 / s.N) * s.Ry, origin - s.S);
        }).ToArray();
        for (int i = 1; i < stations.Length; i++) {
            Vec3D[] a = Ring(stations[i - 1]), b = Ring(stations[i]);
            Vec3D ca = new(x, stations[i - 1].Y, origin - stations[i - 1].S);
            Vec3D cb = new(x, stations[i].Y, origin - stations[i].S);
            var parts = new List<Cell>();
            // Changing aspect ratio/exponent makes a loft side quad nonplanar. Clipping both
            // triangle planes as a convex cell would shave the rendered skin. Tetrahedralise
            // each radial wedge instead, preserving the renderer's exact diagonal and volume.
            void Tetra(Vec3D v0, Vec3D v1, Vec3D v2, Vec3D v3) => parts.Add(new Cell(
                new[] { v0,v1,v2,v3 }, new List<(int,int,int)> { (0,1,2),(0,1,3),(0,2,3),(1,2,3) }));
            for (int j = 0; j < segments; j++) {
                int k = (j + 1) % segments;
                Tetra(ca,a[j],a[k],b[j]);
                Tetra(ca,a[k],b[k],b[j]);
                Tetra(ca,cb,b[j],b[k]);
            }
            cells.Add(new Cell(a.Concat(b).ToArray(),parts.ToArray()));
        }
    }
    static void Wing(List<Cell> cells, double origin, double y, double thickness, params (double X, double S)[] polygon) {
        Prism(cells, polygon.Select(p => new Vec3D(p.X, y - thickness / 2, origin - p.S)).ToArray(),
            polygon.Select(p => new Vec3D(p.X, y + thickness / 2, origin - p.S)).ToArray());
    }
    static void Fin(List<Cell> cells, double origin, double x, double thickness,
        double yOffset, double cant, params (double S, double Y)[] polygon) {
        Vec3D Point((double S, double Y) p, double side) => new(
            x + side * thickness / 2 + p.Y * Math.Sin(cant),
            yOffset + p.Y * Math.Cos(cant), origin - p.S);
        Prism(cells, polygon.Select(p => Point(p, -1)).ToArray(), polygon.Select(p => Point(p, 1)).ToArray());
    }

    static AirframeHitGeometry BuildSu27() {
        var c = new List<Cell>();
        const double o = 11.2;
        // Stations and component placement follow su27_surrogate.js (LOD0), not a hit-rate fit.
        Loft(c, o, new Station[] {
            new(0,.03,.03,-.14), new(.7,.3,.29,-.1), new(1.8,.5,.48,.04),
            new(2.6,.6,.58,.08), new(2.75,.61,.59,.08), new(4,.72,.7,.16),
            new(5.6,.8,.78,.2), new(7.2,.92,.78,.18), new(9.2,1.06,.7,.12,2.4),
            new(11.5,1.3,.62,.1,3), new(14,1.42,.56,.06,3.2), new(16.2,1.2,.48,.02,3),
            new(18,.66,.4,0), new(19.4,.44,.36,0), new(21.3,.32,.27,0), new(21.935,.05,.05,0) });
        Loft(c, o, new Station[] { new(7.2,.34,.3,.9), new(8.4,.5,.36,.86),
            new(11.5,.58,.34,.7), new(14.5,.46,.26,.5), new(17,.2,.12,.32) }, segments: 12);
        // Canopy ellipse sampled longitudinally; it is part of the solid, not a giant cockpit box.
        Loft(c, o, Enumerable.Range(0, 13).Select(i => {
            double angle = i * Math.PI / 12;
            double r = Math.Max(1e-6, Math.Sin(angle));
            return new Station(6 - 1.8 * Math.Cos(angle), .52 * r, .5 * r, .98);
        }).ToArray());
        const double tip = 14.698 / 2 - .2;
        double le = 9.6 + (tip - 2) * Math.Tan(42 * Math.PI / 180);
        foreach (int side in new[] { -1, 1 }) {
            Loft(c, o, new Station[] { new(7,.54,.62,-.8,4.5), new(9,.57,.63,-.76,4),
                new(12.5,.6,.6,-.66,3.4), new(16,.64,.62,-.42,2.6), new(18.4,.62,.6,-.36,2.1),
                new(18.9,.6,.58,-.35), new(19.9,.56,.54,-.33) }, side * 1.38, 14);
            Loft(c, o, new Station[] { new(14.8,.12,.1,-.12,3), new(16,.3,.2,-.14,3),
                new(20.2,.28,.18,-.14,3), new(20.9,.08,.06,-.14,3) }, side * 2.3, 8);
            var outline = new (double X, double S)[] { (0,5.1),(.62,5.3),(.98,6.5),(1.42,8),
                (2,9.6),(tip,le),(tip,le+1.55),(2.3,16.5),(0,16.5) };
            // Fan from the inboard trailing edge lies inside this star-shaped half-planform.
            for (int i = 0; i < outline.Length - 2; i++)
                Wing(c, o, -.08, .2, (0,16.5), (side*outline[i].X,outline[i].S),
                    (side*outline[i+1].X,outline[i+1].S));
            Wing(c, o, -.16, .12, (side*1.95,17.6),(side*4.94,20.35),(side*4.94,21.25),(side*1.95,20.9));
            Wing(c, o, -.02, .16, (side*(tip),13.5),(side*(tip+.2),13.5),
                (side*(tip+.2),16.9),(side*tip,16.9));
            Fin(c, o, side*2.3, .14, .02, 0, (15.9,0),(19.95,0),(19.8,3.25),(18.6,3.25));
            Fin(c, o, side*2.05, .1, -.26, side*.26, (15.7,0),(17.6,0),(17.45,-1.05),(16.9,-1.05));
        }
        return new("su27s-render-surrogate", c);
    }

    static AirframeHitGeometry BuildF22() {
        var c = new List<Cell>();
        const double o = 9.45; // published 18.9 m length, 13.6 m span; provisional sections
        Loft(c, o, new Station[] { new(0,.02,.02,0), new(1.5,.45,.35,0),
            new(4,1,.65,.1),new(7,1.6,.8,0),new(10,2.1,.7,0,3),new(14,1.8,.6,0,3),
            new(17.5,1.45,.45,0,3),new(18.9,1.2,.3,0,3) });
        Loft(c, o, new Station[] { new(3.3,.02,.02,.6),new(4.8,.55,.55,.85),
            new(6.6,.4,.25,.8),new(7.3,.02,.02,.65) });
        foreach (int side in new[] { -1, 1 }) {
            Wing(c, o, 0, .18, (side*1.4,6.1),(side*6.8,11.5),(side*6.8,12.3),(side*1.6,14));
            Wing(c, o, 0, .14, (side*1.45,14),(side*4.25,16.9),(side*3.6,18.9),(side*1.2,18.9));
            Fin(c, o, side*1.65, .16, .3, side*.48, (13.0,0),(17.9,0),(16.8,2.8),(15.5,2.8));
        }
        return new("f22a-public-dimensions-surrogate", c);
    }
}
