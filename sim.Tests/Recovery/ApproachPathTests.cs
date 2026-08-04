using System;
using System.Collections.Generic;
using GunsOnly.Sim;
using GunsOnly.Sim.Recovery;
using Xunit;

namespace GunsOnly.Sim.Tests.Recovery;

public class ApproachPathTests {
    static ApproachPathInput Input(double requiredTrackM) => new(
        Start: new Vec3D(0.0, 2_000.0, -20_000.0),
        StartHeadingRad: 0.0,
        StabilisationPoint: new Vec3D(0.0, 152.0, -1_200.0),
        LandingHeadingRad: 0.0,
        RequiredTrackM: requiredTrackM,
        TurnRadiusM: 2_000.0);

    [Fact]
    public void EnoughTrackFlownDirectNeedsNoExtension() {
        var s = ApproachPath.Solve(Input(requiredTrackM: 12_000.0));
        Assert.Equal(ApproachExtensionKind.None, s.Kind);
        Assert.Equal(0.0, s.DownwindExtensionM);
        Assert.Equal(0, s.Orbits);
        Assert.True(s.TotalTrackM >= 18_800.0);
        Assert.Equal(Input(0).StabilisationPoint.X, s.Points[^1].X, precision: 6);
        Assert.Equal(Input(0).StabilisationPoint.Z, s.Points[^1].Z, precision: 6);
    }

    [Fact]
    public void DirectIngressHonoursCurrentAndFinalHeading() {
        ApproachPathInput input = Input(0.0) with { StartHeadingRad = Math.PI };
        var s = ApproachPath.Solve(input);
        Vec3D first = s.Points[1] - s.Points[0];
        Vec3D last = s.Points[^1] - s.Points[^2];
        Vec3D startForward = new(Math.Sin(input.StartHeadingRad), 0.0, Math.Cos(input.StartHeadingRad));
        Vec3D landingForward = new(
            Math.Sin(input.LandingHeadingRad), 0.0, Math.Cos(input.LandingHeadingRad));

        Assert.True(DirectionCosine(first, startForward) > 0.98,
            "the path must leave tangent to the current heading");
        Assert.True(DirectionCosine(last, landingForward) > 0.98,
            "the final leg must arrive tangent to landing heading");
        Assert.True(s.Points.Count > 3, "a reciprocal start requires a real turn");
    }

    [Fact]
    public void DownwindExtensionPublishesOffAxisWorldGeometry() {
        var s = ApproachPath.Solve(Input(requiredTrackM: 30_000.0));
        Assert.Equal(ApproachExtensionKind.ExtendDownwind, s.Kind);
        Assert.True(s.DownwindExtensionM > 0.0);
        Assert.True(s.TotalTrackM >= 30_000.0);
        Assert.Contains(s.Points, p => Math.Abs(p.X) >= 1_500.0);
        Assert.True(s.Points.Count > 8, "the base turn must be a sampled arc, not one sharp leg");
        Assert.Equal(Input(0).StabilisationPoint.Z, s.Points[^1].Z, precision: 6);
    }

    [Fact]
    public void OrbitPublishesTheCircleItChargesToTrackAvailable() {
        var s = ApproachPath.Solve(Input(requiredTrackM: 100_000.0));
        Assert.Equal(ApproachExtensionKind.Orbit360, s.Kind);
        Assert.Equal(ApproachPath.MaxDownwindExtensionM, s.DownwindExtensionM, precision: 6);
        Assert.True(s.Orbits > 0);
        Assert.True(s.Points.Count >= 16 * s.Orbits);
        Assert.Contains(s.Points, p => Math.Abs(p.X) >= 3_500.0);
        Assert.True(s.TotalTrackM >= 100_000.0);
    }

    [Fact]
    public void MoreExcessNeverReturnsAShorterPath() {
        double previous = 0.0;
        for (double required = 5_000.0; required <= 200_000.0; required += 2_500.0) {
            var s = ApproachPath.Solve(Input(required));
            Assert.True(s.TotalTrackM >= previous - 1e-6,
                $"path shortened at required={required}: {s.TotalTrackM} < {previous}");
            Assert.True(s.TotalTrackM >= required - 1e-6, "path must cover the requirement");
            Assert.Equal(SumLegs(s.Points), s.TotalTrackM, precision: 6);
            previous = s.TotalTrackM;
        }
    }

    [Fact]
    public void DegenerateInputsStillProduceAFlyablePath() {
        var input = Input(50_000.0) with { StartHeadingRad = double.NaN, TurnRadiusM = 0.0 };
        var s = ApproachPath.Solve(input);
        Assert.True(double.IsFinite(s.TotalTrackM));
        Assert.True(s.TotalTrackM >= 0.0);
        Assert.NotEmpty(s.Points);
    }

    [Fact]
    public void AstronomicalRequirementsSaturateWithoutIntegerOverflowOrUnboundedAllocation() {
        var s = ApproachPath.Solve(Input(double.MaxValue));
        Assert.Equal(ApproachPath.MaxMaterializedOrbits, s.Orbits);
        Assert.True(s.Saturated);
        Assert.True(double.IsFinite(s.TotalTrackM));
        Assert.InRange(s.Points.Count, 1, 2_000);
    }

    static double SumLegs(IReadOnlyList<Vec3D> points) {
        double sum = 0.0;
        for (int i = 1; i < points.Count; i++) {
            double dx = points[i].X - points[i - 1].X;
            double dz = points[i].Z - points[i - 1].Z;
            sum += Math.Sqrt(dx * dx + dz * dz);
        }
        return sum;
    }

    static double DirectionCosine(in Vec3D a, in Vec3D b) {
        double aa = Math.Sqrt(a.X * a.X + a.Z * a.Z);
        double bb = Math.Sqrt(b.X * b.X + b.Z * b.Z);
        return a.Dot(b) / Math.Max(1e-9, aa * bb);
    }
}
