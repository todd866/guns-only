using System;
using GunsOnly.Sim;
using GunsOnly.Sim.Turbulence;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// The point of building the generator with a measurement rig: prove the output is actually
/// intermittent/multifractal, not just assert it. A turbulence model that isn't measurably
/// fat-tailed is expensive noise — and the whole reason for this module is that the standard
/// Gaussian models aren't.
public class TurbulenceTests {
    readonly ITestOutputHelper _o;
    public TurbulenceTests(ITestOutputHelper o) => _o = o;

    // ---- statistics helpers -------------------------------------------------------------
    static double Mean(double[] a) { double s = 0; foreach (var x in a) s += x; return s / a.Length; }
    static double Var(double[] a) { double m = Mean(a), s = 0; foreach (var x in a) s += (x - m) * (x - m); return s / a.Length; }
    static double Kurtosis(double[] a) {
        double m = Mean(a), v = Var(a); if (v < 1e-300) return 0;
        double s = 0; foreach (var x in a) { double d = x - m; s += d * d * d * d; }
        return s / a.Length / (v * v);   // raw kurtosis; Gaussian = 3
    }
    // A 1-D transect of one velocity component along +x at fixed y,z.
    static double[] Transect(TurbulenceField f, int n, double dx, int axis = 0, double y = 11.0, double z = 7.0) {
        var a = new double[n];
        for (int i = 0; i < n; i++) a[i] = f.SampleComponent(new Vec3D(i * dx, y, z), axis);
        return a;
    }
    // Increments at a given lag (in samples).
    static double[] Increments(double[] a, int lag) {
        var d = new double[a.Length - lag];
        for (int i = 0; i < d.Length; i++) d[i] = a[i + lag] - a[i];
        return d;
    }
    // Structure-function exponent ζ(q): slope of log<|Δ|^q> vs log(τ) across a scaling range.
    static double Zeta(double[] transect, double dx, double q, int[] lags) {
        int n = lags.Length;
        double sx = 0, sy = 0, sxx = 0, sxy = 0;
        foreach (var lag in lags) {
            var d = Increments(transect, lag);
            double sq = 0; foreach (var v in d) sq += Math.Pow(Math.Abs(v), q);
            sq /= d.Length;
            double lx = Math.Log(lag * dx), ly = Math.Log(sq);
            sx += lx; sy += ly; sxx += lx * lx; sxy += lx * ly;
        }
        return (n * sxy - sx * sy) / (n * sxx - sx * sx);
    }

    // -------------------------------------------------------------------------------------

    [Fact]
    public void DeterministicFromSeed_BitIdentical() {
        // The replay premise: two fields from the same seed on THIS build must agree to the last
        // bit, so a recorded approach reproduces. (Desktop-vs-web bit-identity is NOT required —
        // each shell just has to be good turbulence — so this only checks within-build.)
        var a = new TurbulenceField(seed: 0xABCDEF01UL);
        var b = new TurbulenceField(seed: 0xABCDEF01UL);
        var c = new TurbulenceField(seed: 0xABCDEF02UL);   // different seed → different field
        var rng = new Random(1);
        bool everDiffered = false;
        for (int i = 0; i < 500; i++) {
            var p = new Vec3D(rng.NextDouble() * 4000 - 2000, rng.NextDouble() * 300, rng.NextDouble() * 4000 - 2000);
            var va = a.Sample(p); var vb = b.Sample(p); var vc = c.Sample(p);
            Assert.Equal(va.X, vb.X);   // exact
            Assert.Equal(va.Y, vb.Y);
            Assert.Equal(va.Z, vb.Z);
            if (va.X != vc.X) everDiffered = true;
        }
        Assert.True(everDiffered, "a different seed must produce a different field");
    }

    [Fact]
    public void DeliversTheRequestedRms() {
        // A designer dialing "3 m/s" must GET ~3 m/s per component. The old 1/sqrt(Σa²)
        // normalisation delivered ~0.43× (a reviewer's catch), hidden by a 3×-wide tolerance;
        // the ctor now calibrates the scale empirically, so this asserts within 12%.
        var f = new TurbulenceField(intensityMps: 3.0);
        var t = Transect(f, 1 << 15, 0.5);
        double mean = Mean(t), rms = Math.Sqrt(Var(t));
        _o.WriteLine($"mean={mean:F4}  rms={rms:F3} m/s (target 3.0)");
        foreach (var x in t) Assert.True(double.IsFinite(x));
        Assert.True(Math.Abs(mean) < 0.3, $"mean should be ~0, was {mean:F3}");
        Assert.InRange(rms, 2.64, 3.36);   // 3.0 ± 12% — a real calibration check, not a rubber stamp
    }

    [Fact]
    public void DeliversRequestedRmsAcrossSeedsAndIntensities() {
        // The calibration must hold for every seed (field) and every requested level.
        foreach (var seed in new ulong[] { 1, 2, 3, 99, 12345 })
            foreach (var target in new[] { 1.0, 4.0, 12.0 }) {
                var f = new TurbulenceField(intensityMps: target, seed: seed);
                double rms = Math.Sqrt(Var(Transect(f, 1 << 14, 0.5)));
                Assert.InRange(rms / target, 0.80, 1.20);
            }
    }

    [Fact]
    public void IsIntermittent_KurtosisRisesAtFinerScales() {
        // THE defining signature of real turbulence: the flatness (kurtosis) of velocity
        // increments GROWS as the scale shrinks. Gaussian turbulence has kurtosis 3 at every
        // scale — that is exactly what makes it feel like a stationary hum.
        var f = new TurbulenceField(intermittency: 0.5);
        var t = Transect(f, 1 << 16, 0.25);         // dx 0.25 m: samples the finest eddy (0.47 m) ~2x
        double kCoarse = Kurtosis(Increments(t, 128));   // τ = 32 m (near outer scale)
        double kFine = Kurtosis(Increments(t, 8));       // τ = 2 m  (cleanly above finest eddy 0.47 m)
        _o.WriteLine($"increment kurtosis: coarse(τ=32m)={kCoarse:F2}  fine(τ=2m)={kFine:F2}  (Gaussian=3)");
        Assert.True(kFine > kCoarse + 0.5, $"kurtosis must rise toward fine scales: fine={kFine:F2} coarse={kCoarse:F2}");
        Assert.True(kFine > 3.3, $"fine-scale increments must be leptokurtic (fat-tailed), was {kFine:F2}");
    }

    [Fact]
    public void IsMultifractal_ZetaIsConcave() {
        // The rigorous test. Monofractal/Gaussian: ζ(q) = q·H, a straight line, so ζ(q)/q is
        // constant. Multifractal: ζ(q) is CONCAVE, so ζ(q)/q strictly decreases in q. That
        // concavity IS intermittency, and it cannot come from any linear (Gaussian) model.
        var f = new TurbulenceField(intermittency: 0.5);
        double dx = 0.25;
        var t = Transect(f, 1 << 16, dx);
        int[] lags = { 8, 16, 32, 64, 128 };   // τ = 2..32 m, cleanly inside the inertial range
        double z1 = Zeta(t, dx, 1.0, lags);
        double z2 = Zeta(t, dx, 2.0, lags);
        double z3 = Zeta(t, dx, 3.0, lags);
        double z4 = Zeta(t, dx, 4.0, lags);
        _o.WriteLine($"ζ(1)={z1:F3} ζ(2)={z2:F3} ζ(3)={z3:F3} ζ(4)={z4:F3}");
        _o.WriteLine($"ζ(q)/q: {z1:F3} {z2 / 2:F3} {z3 / 3:F3} {z4 / 4:F3}  (must strictly DECREASE for multifractality)");
        Assert.True(z1 > z2 / 2, "ζ(1) > ζ(2)/2");
        Assert.True(z2 / 2 > z3 / 3, "ζ(2)/2 > ζ(3)/3");
        Assert.True(z3 / 3 > z4 / 4, "ζ(3)/3 > ζ(4)/4 — concavity all the way out");
    }

    [Fact]
    public void SpectrumSlopeIsNearKolmogorov() {
        // The second-order structure function S2(τ) ~ τ^(2H); Hurst 1/3 → ζ(2) ≈ 2/3, which is
        // the Kolmogorov -5/3 energy spectrum. Intermittency shaves ζ(2) slightly below 2H, so
        // accept a band around it rather than a point.
        var f = new TurbulenceField(hurst: 1.0 / 3.0, intermittency: 0.5);
        double dx = 0.25;
        var t = Transect(f, 1 << 16, dx);
        double z2 = Zeta(t, dx, 2.0, new[] { 8, 16, 32, 64, 128 });
        _o.WriteLine($"ζ(2)={z2:F3}  (Kolmogorov 2H = 0.667; intermittency pulls it slightly below)");
        Assert.InRange(z2, 0.45, 0.85);
    }

    [Fact]
    public void MonofractalControl_ZeroIntermittencyIsNotConcave() {
        // Falsification guard: with intermittency OFF, the concavity test must FAIL to fire —
        // otherwise the multifractal test is measuring an artefact of the construction rather
        // than the cascade. ζ(q)/q should be ~flat here.
        var f = new TurbulenceField(intermittency: 0.0);
        double dx = 0.25;
        var t = Transect(f, 1 << 16, dx);
        int[] lags = { 8, 16, 32, 64, 128 };
        double spread = Zeta(t, dx, 1.0, lags) - Zeta(t, dx, 4.0, lags) / 4.0;
        double f5 = new TurbulenceField(intermittency: 0.5) is var mf
            ? Zeta(Transect(mf, 1 << 16, dx), dx, 1.0, lags) - Zeta(Transect(mf, 1 << 16, dx), dx, 4.0, lags) / 4.0
            : 0;
        _o.WriteLine($"ζ(1)-ζ(4)/4:  monofractal={spread:F3}   intermittent={f5:F3}  (intermittent must be larger)");
        Assert.True(f5 > spread + 0.02, "the cascade must produce materially more concavity than the σ=0 control");
    }
}
