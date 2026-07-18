namespace GunsOnly.Sim.Turbulence;

/// A deterministic, world-space, INTERMITTENT turbulence field. Sample it at a position and get
/// a gust-velocity vector (m/s). The field is a fixed property of the air: the turbulence lives
/// at a place, not at a clock time, so a pilot who skirts a rough patch is spared and one who
/// flies the centreline is not — the encounter emerges from the path, which is exactly what a
/// clock-locked disturbance time series (a "cutscene") cannot do.
///
/// WHY THIS EXISTS. Every flight sim's turbulence "never feels like turbulence" (a former RAAF
/// pilot's judgement, echoed by the MIL-F-8785C user guide, which admits atmospheric turbulence
/// "has been shown to be non-Gaussian" yet mandates a Gaussian generator "for the current
/// purposes"). A linear filter of Gaussian noise is Gaussian: symmetric, self-cancelling, and
/// the nervous system habituates to it as engine hum in seconds. Real turbulence is INTERMITTENT
/// — quiet, quiet, SLAM — and that non-stationarity is the alerting quality. The industry chose
/// Gaussian because a real-time RNG model trades intermittency against run-to-run repeatability.
/// Precompute-and-replay dissolves that trade: this field is fat-tailed AND bit-identical every
/// run, because it is a pure deterministic function of position and seed.
///
/// CONSTRUCTION (a wavelet / multiplicative-cascade synthesis — the honest generator of
/// multifractal intermittency, not the cheap single-envelope approximation):
///     v_c(p) = Norm * Intensity * Σ_j  a_j * M_j(p) * N_{c,j}(p)
///   • N_{c,j}: band-limited value noise at octave j for component c (x,y,z independent).
///   • a_j = 2^(-j*Hurst): the amplitude envelope that fixes the SPECTRUM. Hurst=1/3 gives the
///     Kolmogorov -5/3 velocity spectrum (S2(τ) ~ τ^(2H)).
///   • M_j(p) = exp(Σ_{k<=j} [σ·g_k(p) - σ²·varG/2]): the MULTIPLICATIVE CASCADE. A rough patch
///     at a coarse scale multiplicatively amplifies every finer scale inside it — the log-
///     amplitude is a sum of band-limited noises across octaves, i.e. a log-correlated field,
///     which is precisely what makes the result multifractal (concave ζ(q)) rather than a
///     bumpy Gaussian. σ = Intermittency controls how fat the tails get.
///
/// WHAT THIS IS AND ISN'T. This is the UNIVERSAL texture — the statistical character of
/// turbulence, which is roughly scale-invariant and measured, so we can get it right with no
/// ship data. It is HOMOGENEOUS and ISOTROPIC. The ship-specific part — where the burble pocket
/// sits behind a rounded-down stern, the vertical-gust dominance near the deck, the range
/// schedule of intensity down the groove — is a separate spatial-envelope layer that multiplies
/// this field's output. Texture here; placement there. (See guns-only-carrier-pivot memory.)
///
/// Pure kernel: no Godot/three.js, float64, allocation-free per sample, WASM-safe.
public sealed class TurbulenceField {
    readonly int _octaves;
    readonly double _hurst;
    readonly double _sigma;          // intermittency
    readonly double _intensity;      // target RMS, m/s (approximate — the field is normalised to ~unit RMS then scaled)
    readonly double _invOuter;       // 1 / outer length scale (m)
    readonly double[] _amp;          // a_j = 2^(-j*Hurst)
    readonly double _scale;          // calibrated so per-component RMS == intensityMps (see ctor)
    readonly ulong _saltG, _saltX, _saltY, _saltZ;

    // Measured variance of the value-noise primitive: 0.160 over 4M samples (a 1-octave field
    // isolates one raw Hashing.Value draw), corroborated analytically at 0.1604. Used only for
    // the cascade's APPROXIMATELY mean-preserving correction — approximate because value noise
    // is platykurtic, so the lognormal identity E[e^{σg}]=e^{σ²Var/2} holds only for Gaussian g;
    // the delivered RMS is calibrated empirically below regardless, so this only affects the
    // small per-octave spectral tilt. It does NOT bias the velocity mean (velocity = M ·
    // zero-mean noise, so E[velocity]=0 for any M), which a volume-mean probe confirmed at
    // <0.5% of RMS.
    const double ValueNoiseVar = 0.16;

    public const double DefaultOuterScaleM = 60.0;   // integral length ~ ship-island scale

    /// <param name="octaves">Number of cascade scales. 8 spans ~3 decades — enough inertial range to be multifractal.</param>
    /// <param name="outerScaleM">Largest eddy (integral length), metres.</param>
    /// <param name="hurst">Velocity Hurst exponent. 1/3 → Kolmogorov -5/3 spectrum.</param>
    /// <param name="intermittency">Cascade log-amplitude std σ. 0 → monofractal (Gaussian-ish); larger → fatter tails.</param>
    /// <param name="intensityMps">Target PER-COMPONENT RMS gust speed, m/s (the σ_u/σ_v/σ_w convention). Delivered within ~1%.</param>
    /// <param name="seed">Selects the field. Different seeds = different "days"/sea states = the variants.</param>
    public TurbulenceField(
        int octaves = 8,
        double outerScaleM = DefaultOuterScaleM,
        double hurst = 1.0 / 3.0,
        double intermittency = 0.45,
        double intensityMps = 1.0,
        ulong seed = 0x5715_C0FF_EE15_600DUL)
    {
        if (octaves < 1) octaves = 1;
        _octaves = octaves;
        _hurst = hurst;
        _sigma = intermittency;
        _intensity = intensityMps;
        _invOuter = 1.0 / outerScaleM;

        _amp = new double[octaves];
        for (int j = 0; j < octaves; j++)
            _amp[j] = System.Math.Pow(2.0, -j * hurst);

        // Derive independent salts from the seed so the four noise stacks (cascade + 3 velocity
        // components) never share a lattice, while the whole field stays a function of one seed.
        _saltG = Salt(seed, 0xA1);
        _saltX = Salt(seed, 0xB2);
        _saltY = Salt(seed, 0xC3);
        _saltZ = Salt(seed, 0xD4);

        // CALIBRATE the delivered RMS empirically. The obvious 1/sqrt(Σ a_j²) normalisation
        // assumed unit-variance octave noise, but the value noise is variance ~0.16 AND the
        // cascade injects energy (E[M²]>1 for σ>0), so the true RMS/intensity ratio depends on
        // (σ, H, octaves) in a way with no clean closed form (value noise isn't lognormal). A
        // reviewer measured the old normalisation delivering ~0.43× the requested intensity.
        // So: sample the raw field over a deterministic probe cloud spanning many outer scales
        // and set _scale = intensity / measured-RMS. One-time, ~65k samples, sub-millisecond,
        // and it honours intensityMps for ANY parameter combination. Deterministic from seed.
        _scale = 1.0;   // RawSample uses _amp only, not _scale — safe to measure now
        const int cal = 8192;
        double box = 40.0 * outerScaleM;   // span many integral lengths so large eddies are represented
        ulong r = Salt(seed, 0xCA1B);
        double sumSq = 0.0;
        for (int i = 0; i < cal; i++) {
            var p = new Vec3D(NextUnit(ref r) * box, NextUnit(ref r) * box, NextUnit(ref r) * box);
            var (rx, ry, rz) = RawSample(p);
            sumSq += rx * rx + ry * ry + rz * rz;
        }
        double rmsPerComponent = System.Math.Sqrt(sumSq / (3.0 * cal));
        _scale = rmsPerComponent > 1e-12 ? intensityMps / rmsPerComponent : 0.0;
    }

    // Deterministic uniform in [0,1) via a splitmix step on the state. Only used for the
    // one-time RMS calibration cloud, never in the hot path.
    static double NextUnit(ref ulong state) {
        unchecked {
            state += 0x9e3779b97f4a7c15UL;
            ulong z = state;
            z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9UL;
            z = (z ^ (z >> 27)) * 0x94d049bb133111ebUL;
            z ^= z >> 31;
            return (z >> 11) * (1.0 / (1UL << 53));
        }
    }

    static ulong Salt(ulong seed, ulong tag) {
        unchecked {
            ulong z = seed ^ (tag * 0x9e3779b97f4a7c15UL);
            z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9UL;
            z = (z ^ (z >> 27)) * 0x94d049bb133111ebUL;
            return z ^ (z >> 31);
        }
    }

    /// The gust-velocity vector (m/s) at a world position. Deterministic and finite.
    public Vec3D Sample(Vec3D worldPos) {
        var (vx, vy, vz) = RawSample(worldPos);
        var v = new Vec3D(vx * _scale, vy * _scale, vz * _scale);
        // Non-finite is impossible with bounded value noise, but a hard guard keeps a bad
        // parameter set from ever leaking a NaN into the integrator.
        if (!double.IsFinite(v.X) || !double.IsFinite(v.Y) || !double.IsFinite(v.Z)) return Vec3D.Zero;
        return v;
    }

    // The cascade, unscaled. Sample() applies the calibrated _scale; the ctor calls this before
    // _scale is known, to measure the RMS it needs to calibrate against.
    (double, double, double) RawSample(Vec3D worldPos) {
        double px = worldPos.X * _invOuter, py = worldPos.Y * _invOuter, pz = worldPos.Z * _invOuter;

        double vx = 0.0, vy = 0.0, vz = 0.0;
        double logM = 0.0;
        double meanCorr = 0.5 * _sigma * _sigma * ValueNoiseVar;
        double freq = 1.0;

        for (int j = 0; j < _octaves; j++) {
            double sx = px * freq, sy = py * freq, sz = pz * freq;

            // Advance the multiplicative cascade by this octave's contribution, then M_j = exp(logM).
            double g = Hashing.Value(sx, sy, sz, _saltG + (ulong)j);
            logM += _sigma * g - meanCorr;
            double m = System.Math.Exp(logM);

            double a = _amp[j] * m;
            vx += a * Hashing.Value(sx, sy, sz, _saltX + (ulong)j);
            vy += a * Hashing.Value(sx, sy, sz, _saltY + (ulong)j);
            vz += a * Hashing.Value(sx, sy, sz, _saltZ + (ulong)j);

            freq *= 2.0;   // lacunarity 2: each octave halves the eddy size
        }
        return (vx, vy, vz);
    }

    /// Scalar disturbance along one axis — convenience for the 1-D statistics rig and for a
    /// consumer that only wants, say, the vertical gust.
    public double SampleComponent(Vec3D worldPos, int axis) {
        var v = Sample(worldPos);
        return axis == 0 ? v.X : axis == 1 ? v.Y : v.Z;
    }
}
