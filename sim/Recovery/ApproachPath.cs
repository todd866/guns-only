using System;
using System.Collections.Generic;

namespace GunsOnly.Sim.Recovery;

public enum ApproachExtensionKind { None, ExtendDownwind, Orbit360 }

public readonly record struct ApproachPathInput(
    Vec3D Start,
    double StartHeadingRad,
    Vec3D StabilisationPoint,
    double LandingHeadingRad,
    double RequiredTrackM,
    double TurnRadiusM);

/// The synthesised path: how the required track distance is actually bought.
public readonly record struct ApproachPathSolution(
    ApproachExtensionKind Kind,
    double DownwindExtensionM,
    int Orbits,
    double TotalTrackM,
    IReadOnlyList<Vec3D> Points,
    bool Saturated = false);

/// Buys track distance. There is no infeasible case: excess energy lengthens the path, exactly as
/// vectoring extends a downwind or issues a 360. Fuel, priced elsewhere, is the real limit.
public static class ApproachPath {
    /// Beyond this the downwind stops being a pattern and becomes a departure; orbits take over.
    public const double MaxDownwindExtensionM = 9_260.0; // 5 NM
    /// Keeps corrupt or astronomical inputs from allocating billions of circle samples.
    public const int MaxMaterializedOrbits = 64;
    const int OrbitSegments = 24;
    const int BaseTurnSegments = 12;

    public static ApproachPathSolution Solve(in ApproachPathInput input) {
        Vec3D start = input.Start.IsFinite ? input.Start : Vec3D.Zero;
        Vec3D stabilise = input.StabilisationPoint.IsFinite
            ? input.StabilisationPoint
            : Vec3D.Zero;
        double landingHeading = double.IsFinite(input.LandingHeadingRad)
            ? input.LandingHeadingRad
            : 0.0;
        double startHeading = double.IsFinite(input.StartHeadingRad)
            ? input.StartHeadingRad
            : landingHeading;
        double required = Finite(input.RequiredTrackM, 0.0);
        double radius = Math.Max(Finite(input.TurnRadiusM, 0.0), 1.0);

        Vec3D landingFwd = HorizontalForward(landingHeading);
        Vec3D landingRight = HorizontalRight(landingHeading);
        double side = SideFor(start, stabilise, landingRight);

        List<Vec3D> direct = BuildDirect(
            start, startHeading, stabilise, landingHeading, radius);
        double directTrack = TrackLength(direct);
        if (required <= directTrack + 1e-6)
            return Solution(ApproachExtensionKind.None, 0.0, 0, direct);

        double minimumDownwind = Math.Min(
            MaxDownwindExtensionM, Math.Max(1_500.0, 2.0 * radius));
        List<Vec3D> maximumDownwind = BuildDownwind(
            start, startHeading, stabilise, landingHeading, landingFwd, landingRight,
            side, MaxDownwindExtensionM, radius);
        double maximumTrack = TrackLength(maximumDownwind);

        if (required <= maximumTrack + 1e-6) {
            double low = minimumDownwind;
            double high = MaxDownwindExtensionM;
            // Monotone geometry: only the two parallel legs lengthen. Binary search keeps the
            // public path length equal to the track the energy solve asked us to buy. 24 halvings
            // of the ~7.8 km bracket resolve to ~0.5 mm; each iteration is a full Dubins build.
            for (int i = 0; i < 24; i++) {
                double mid = 0.5 * (low + high);
                double track = TrackLength(BuildDownwind(
                    start, startHeading, stabilise, landingHeading,
                    landingFwd, landingRight, side, mid, radius));
                if (track >= required) high = mid;
                else low = mid;
            }
            List<Vec3D> downwind = BuildDownwind(
                start, startHeading, stabilise, landingHeading,
                landingFwd, landingRight, side, high, radius);
            return Solution(
                ApproachExtensionKind.ExtendDownwind, high, 0, downwind);
        }

        double loopTrack = OrbitLoopTrack(radius);
        double rawOrbits = Math.Ceiling(
            (required - maximumTrack) / Math.Max(loopTrack, 1.0));
        int orbits = !double.IsFinite(rawOrbits) || rawOrbits >= MaxMaterializedOrbits
            ? MaxMaterializedOrbits
            : Math.Max(1, (int)rawOrbits);
        List<Vec3D> points = BuildOrbits(start, startHeading, side, radius, orbits);
        Append(points, maximumDownwind, skipFirst: true);
        return Solution(
            ApproachExtensionKind.Orbit360,
            MaxDownwindExtensionM,
            orbits,
            points,
            saturated: rawOrbits >= MaxMaterializedOrbits || !double.IsFinite(rawOrbits));
    }

    /// Position along the path measured from ownship. Horizontal track drives the interpolation;
    /// callers own altitude scheduling independently.
    public static Vec3D PointAtDistanceFromStart(
        in ApproachPathSolution path, double distanceM) {
        if (path.Points.Count == 0) return Vec3D.Zero;
        double remaining = Math.Clamp(distanceM, 0.0, path.TotalTrackM);
        for (int i = 1; i < path.Points.Count; i++) {
            Vec3D from = path.Points[i - 1];
            Vec3D to = path.Points[i];
            double leg = HorizontalDistance(from, to);
            if (remaining <= leg || i == path.Points.Count - 1) {
                double t = leg > 1e-9 ? Math.Clamp(remaining / leg, 0.0, 1.0) : 1.0;
                return new Vec3D(
                    from.X + (to.X - from.X) * t,
                    0.0,
                    from.Z + (to.Z - from.Z) * t);
            }
            remaining -= leg;
        }
        Vec3D last = path.Points[^1];
        return new Vec3D(last.X, 0.0, last.Z);
    }

    static List<Vec3D> BuildDirect(
        in Vec3D start,
        double startHeading,
        in Vec3D stabilise,
        double landingHeading,
        double radius) =>
        BuildHeadingConstrained(
            start, startHeading, stabilise, landingHeading, radius);

    static List<Vec3D> BuildDownwind(
        in Vec3D start,
        double startHeading,
        in Vec3D stabilise,
        double landingHeading,
        in Vec3D landingFwd,
        in Vec3D landingRight,
        double side,
        double extensionM,
        double radius) {
        double width = Math.Max(1_000.0, 2.0 * radius);
        Vec3D lateral = landingRight * (side * width);
        Vec3D near = stabilise + lateral;
        Vec3D far = near - landingFwd * extensionM;
        Vec3D turnCentre = stabilise
            + landingRight * (side * width * 0.5)
            - landingFwd * extensionM;
        Vec3D turnRadial = far - turnCentre;
        var points = BuildHeadingConstrained(
            start,
            startHeading,
            near,
            landingHeading + Math.PI,
            radius);
        AddDistinct(points, Horizontal(far));
        for (int i = 1; i <= BaseTurnSegments; i++) {
            double angle = side * Math.PI * i / BaseTurnSegments;
            AddDistinct(points, turnCentre + RotateHorizontal(turnRadial, angle));
        }
        AddDistinct(points, Horizontal(stabilise));
        return points;
    }

    enum DubinsSegment { Left, Straight, Right }

    readonly record struct DubinsCandidate(
        bool Valid,
        double FirstLength,
        double SecondLength,
        double ThirdLength,
        DubinsSegment First,
        DubinsSegment Second,
        DubinsSegment Third) {
        public double TotalLength => FirstLength + SecondLength + ThirdLength;
    }

    readonly record struct HorizontalPose(double X, double Z, double HeadingRad);

    /// Shortest of the four always-feasible circle/straight/circle paths. This makes the ingress
    /// obey the current nose direction and arrive tangent to the authored landing direction; the
    /// old two-point join could command an instantaneous reversal.
    static List<Vec3D> BuildHeadingConstrained(
        in Vec3D start,
        double startHeading,
        in Vec3D end,
        double endHeading,
        double radius) {
        Vec3D start2 = Horizontal(start);
        Vec3D end2 = Horizontal(end);
        double rho = Math.Max(1.0, radius);
        // Dubins formulae use yaw counter-clockwise from +X. Aircraft chi is clockwise from north.
        double startYaw = Math.PI / 2.0 - startHeading;
        double endYaw = Math.PI / 2.0 - endHeading;
        double dx = (end2.X - start2.X) / rho;
        double dz = (end2.Z - start2.Z) / rho;
        double d = Math.Sqrt(dx * dx + dz * dz);
        double theta = Math.Atan2(dz, dx);
        double alpha = Mod2Pi(startYaw - theta);
        double beta = Mod2Pi(endYaw - theta);

        DubinsCandidate best = default;
        Consider(ref best, Lsl(alpha, beta, d));
        Consider(ref best, Rsr(alpha, beta, d));
        Consider(ref best, Lsr(alpha, beta, d));
        Consider(ref best, Rsl(alpha, beta, d));
        if (!best.Valid) {
            // Same-turn circle paths are geometrically feasible for finite poses, but retain a
            // safe fallback rather than leaking an empty path if round-off defeats that invariant.
            return new List<Vec3D> { start2, end2 };
        }

        var points = new List<Vec3D> { start2 };
        var pose = new HorizontalPose(start2.X, start2.Z, startYaw);
        AppendDubinsSegment(points, ref pose, best.First, best.FirstLength, rho);
        AppendDubinsSegment(points, ref pose, best.Second, best.SecondLength, rho);
        AppendDubinsSegment(points, ref pose, best.Third, best.ThirdLength, rho);
        // Formula round-off is sub-millimetric. Pin the public endpoint to authored truth.
        if (points.Count == 1) points.Add(end2);
        else points[^1] = end2;
        return points;
    }

    static void AppendDubinsSegment(
        List<Vec3D> points,
        ref HorizontalPose pose,
        DubinsSegment segment,
        double normalizedLength,
        double radius) {
        if (!(normalizedLength > 1e-9)) return;
        int steps = segment == DubinsSegment.Straight
            ? Math.Max(1, (int)Math.Ceiling(
                normalizedLength * radius / Math.Max(250.0, radius * 0.5)))
            : Math.Max(1, (int)Math.Ceiling(normalizedLength / (Math.PI / 12.0)));
        double step = normalizedLength / steps;
        for (int i = 0; i < steps; i++) {
            if (segment == DubinsSegment.Straight) {
                pose = pose with {
                    X = pose.X + Math.Cos(pose.HeadingRad) * step * radius,
                    Z = pose.Z + Math.Sin(pose.HeadingRad) * step * radius,
                };
            } else {
                double sign = segment == DubinsSegment.Left ? 1.0 : -1.0;
                double nextHeading = pose.HeadingRad + sign * step;
                pose = new HorizontalPose(
                    pose.X + sign * radius
                        * (Math.Sin(nextHeading) - Math.Sin(pose.HeadingRad)),
                    pose.Z + sign * radius
                        * (Math.Cos(pose.HeadingRad) - Math.Cos(nextHeading)),
                    nextHeading);
            }
            AddDistinct(points, new Vec3D(pose.X, 0.0, pose.Z));
        }
    }

    static DubinsCandidate Lsl(double alpha, double beta, double d) {
        double p2 = 2.0 + d * d - 2.0 * Math.Cos(alpha - beta)
            + 2.0 * d * (Math.Sin(alpha) - Math.Sin(beta));
        if (p2 < -1e-10) return default;
        double tmp = Math.Atan2(
            Math.Cos(beta) - Math.Cos(alpha),
            d + Math.Sin(alpha) - Math.Sin(beta));
        return Candidate(
            Mod2Pi(-alpha + tmp),
            Math.Sqrt(Math.Max(0.0, p2)),
            Mod2Pi(beta - tmp),
            DubinsSegment.Left,
            DubinsSegment.Straight,
            DubinsSegment.Left);
    }

    static DubinsCandidate Rsr(double alpha, double beta, double d) {
        double p2 = 2.0 + d * d - 2.0 * Math.Cos(alpha - beta)
            + 2.0 * d * (Math.Sin(beta) - Math.Sin(alpha));
        if (p2 < -1e-10) return default;
        double tmp = Math.Atan2(
            Math.Cos(alpha) - Math.Cos(beta),
            d - Math.Sin(alpha) + Math.Sin(beta));
        return Candidate(
            Mod2Pi(alpha - tmp),
            Math.Sqrt(Math.Max(0.0, p2)),
            Mod2Pi(-beta + tmp),
            DubinsSegment.Right,
            DubinsSegment.Straight,
            DubinsSegment.Right);
    }

    static DubinsCandidate Lsr(double alpha, double beta, double d) {
        double p2 = -2.0 + d * d + 2.0 * Math.Cos(alpha - beta)
            + 2.0 * d * (Math.Sin(alpha) + Math.Sin(beta));
        if (p2 < -1e-10) return default;
        double p = Math.Sqrt(Math.Max(0.0, p2));
        double tmp = Math.Atan2(
            -Math.Cos(alpha) - Math.Cos(beta),
            d + Math.Sin(alpha) + Math.Sin(beta))
            - Math.Atan2(-2.0, p);
        return Candidate(
            Mod2Pi(-alpha + tmp),
            p,
            Mod2Pi(-beta + tmp),
            DubinsSegment.Left,
            DubinsSegment.Straight,
            DubinsSegment.Right);
    }

    static DubinsCandidate Rsl(double alpha, double beta, double d) {
        double p2 = d * d - 2.0 + 2.0 * Math.Cos(alpha - beta)
            - 2.0 * d * (Math.Sin(alpha) + Math.Sin(beta));
        if (p2 < -1e-10) return default;
        double p = Math.Sqrt(Math.Max(0.0, p2));
        double tmp = Math.Atan2(
            Math.Cos(alpha) + Math.Cos(beta),
            d - Math.Sin(alpha) - Math.Sin(beta))
            - Math.Atan2(2.0, p);
        return Candidate(
            Mod2Pi(alpha - tmp),
            p,
            Mod2Pi(beta - tmp),
            DubinsSegment.Right,
            DubinsSegment.Straight,
            DubinsSegment.Left);
    }

    static DubinsCandidate Candidate(
        double first,
        double second,
        double third,
        DubinsSegment firstKind,
        DubinsSegment secondKind,
        DubinsSegment thirdKind) =>
        new(
            true,
            first,
            second,
            third,
            firstKind,
            secondKind,
            thirdKind);

    static void Consider(ref DubinsCandidate best, in DubinsCandidate candidate) {
        if (candidate.Valid && (!best.Valid || candidate.TotalLength < best.TotalLength))
            best = candidate;
    }

    static double Mod2Pi(double value) {
        double wrapped = value % (2.0 * Math.PI);
        return wrapped < 0.0 ? wrapped + 2.0 * Math.PI : wrapped;
    }

    static List<Vec3D> BuildOrbits(
        in Vec3D start,
        double startHeading,
        double side,
        double radius,
        int orbits) {
        Vec3D start2 = Horizontal(start);
        Vec3D right = HorizontalRight(startHeading);
        Vec3D centre = start2 + right * (side * radius);
        Vec3D radial = start2 - centre;
        var points = new List<Vec3D>(1 + OrbitSegments * orbits) { start2 };
        for (int orbit = 0; orbit < orbits; orbit++) {
            for (int i = 1; i <= OrbitSegments; i++) {
                double angle = side * 2.0 * Math.PI * i / OrbitSegments;
                AddDistinct(points, centre + RotateHorizontal(radial, angle));
            }
        }
        return points;
    }

    static double OrbitLoopTrack(double radius) =>
        OrbitSegments * 2.0 * radius * Math.Sin(Math.PI / OrbitSegments);

    static ApproachPathSolution Solution(
        ApproachExtensionKind kind,
        double extension,
        int orbits,
        List<Vec3D> points,
        bool saturated = false) =>
        new(kind, extension, orbits, TrackLength(points), points, saturated);

    static double TrackLength(IReadOnlyList<Vec3D> points) {
        double total = 0.0;
        for (int i = 1; i < points.Count; i++)
            total += HorizontalDistance(points[i - 1], points[i]);
        return total;
    }

    static double HorizontalDistance(in Vec3D a, in Vec3D b) {
        double dx = b.X - a.X;
        double dz = b.Z - a.Z;
        return Math.Sqrt(dx * dx + dz * dz);
    }

    static Vec3D Horizontal(in Vec3D value) => new(value.X, 0.0, value.Z);
    static Vec3D HorizontalForward(double heading) =>
        new(Math.Sin(heading), 0.0, Math.Cos(heading));
    static Vec3D HorizontalRight(double heading) =>
        new(Math.Cos(heading), 0.0, -Math.Sin(heading));
    static Vec3D RotateHorizontal(in Vec3D value, double angle) {
        double cos = Math.Cos(angle);
        double sin = Math.Sin(angle);
        return new Vec3D(
            cos * value.X + sin * value.Z,
            0.0,
            -sin * value.X + cos * value.Z);
    }

    static double SideFor(in Vec3D start, in Vec3D stabilise, in Vec3D right) {
        double cross = Horizontal(start - stabilise).Dot(right);
        return cross < 0.0 ? -1.0 : 1.0;
    }

    static void Append(List<Vec3D> destination, IReadOnlyList<Vec3D> source, bool skipFirst) {
        for (int i = skipFirst ? 1 : 0; i < source.Count; i++)
            AddDistinct(destination, source[i]);
    }

    static void AddDistinct(List<Vec3D> points, in Vec3D point) {
        if (points.Count == 0 || HorizontalDistance(points[^1], point) > 1e-6)
            points.Add(point);
    }

    static double Finite(double value, double fallback) =>
        double.IsFinite(value) ? Math.Max(value, 0.0) : fallback;
}
