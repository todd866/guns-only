namespace GunsOnly.Sim.Turbulence;

/// Deterministic value noise. The precompute-and-replay design needs the field to be identical
/// across two runs from the same seed ON THE SAME BUILD — that is what makes a recorded approach
/// reproduce and a seed name a stable "day". It does NOT need native .NET and WASM to match each
/// other bit-for-bit; only same-build replay is required, and cross-runtime identity would not hold
/// anyway because Math.Exp/Pow in the cascade aren't
/// correctly-rounded across runtimes. This primitive itself uses only integer bit-mixing + IEEE
/// add/multiply, so it is in fact bit-stable everywhere — never System.Random (time-seeded, and
/// its algorithm is not contractually stable across runtimes).
///
/// Value noise (not gradient/Perlin) on purpose: its statistics are simpler to reason about for
/// the multifractal construction in TurbulenceField, and it is band-limited around one lattice
/// unit, so scaling the input coordinate by 2^j gives a clean octave j.
internal static class Hashing {
    // splitmix64 finalizer constants — a well-studied bijective bit-mixer.
    const ulong K1 = 0xbf58476d1ce4e5b9UL;
    const ulong K2 = 0x94d049bb133111ebUL;
    const ulong GOLD = 0x9e3779b97f4a7c15UL;   // 2^64 / golden ratio, the standard mixing stride

    static ulong Mix(ulong z) {
        unchecked {
            z = (z ^ (z >> 30)) * K1;
            z = (z ^ (z >> 27)) * K2;
            return z ^ (z >> 31);
        }
    }

    /// A uniform 64-bit hash of an integer lattice point under a salt. Order-sensitive folding
    /// so (1,0,0) and (0,1,0) do not collide.
    static ulong HashLattice(long ix, long iy, long iz, ulong salt) {
        unchecked {
            ulong h = Mix(salt + GOLD);
            h = Mix(h + GOLD * (ulong)ix);
            h = Mix(h + GOLD * (ulong)iy);
            h = Mix(h + GOLD * (ulong)iz);
            return h;
        }
    }

    /// Lattice value in [-1, 1).
    static double Corner(long ix, long iy, long iz, ulong salt) {
        // top 53 bits → [0,1) exactly, then map to [-1,1). No division by a non-power-of-two.
        double u = (HashLattice(ix, iy, iz, salt) >> 11) * (1.0 / (1UL << 53));
        return u * 2.0 - 1.0;
    }

    // Quintic fade (Perlin's): C2-continuous, so the field and its first two derivatives are
    // smooth across lattice cells — no visible grid creases when the aircraft flies through it.
    static double Fade(double t) => t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
    static double Lerp(double a, double b, double t) => a + (b - a) * t;

    /// Smooth value noise in roughly [-1, 1], band-limited near one input unit. Deterministic
    /// in (x, y, z, salt).
    public static double Value(double x, double y, double z, ulong salt) {
        long ix = (long)System.Math.Floor(x), iy = (long)System.Math.Floor(y), iz = (long)System.Math.Floor(z);
        double fx = x - ix, fy = y - iy, fz = z - iz;
        double u = Fade(fx), v = Fade(fy), w = Fade(fz);

        double c000 = Corner(ix, iy, iz, salt), c100 = Corner(ix + 1, iy, iz, salt);
        double c010 = Corner(ix, iy + 1, iz, salt), c110 = Corner(ix + 1, iy + 1, iz, salt);
        double c001 = Corner(ix, iy, iz + 1, salt), c101 = Corner(ix + 1, iy, iz + 1, salt);
        double c011 = Corner(ix, iy + 1, iz + 1, salt), c111 = Corner(ix + 1, iy + 1, iz + 1, salt);

        double x00 = Lerp(c000, c100, u), x10 = Lerp(c010, c110, u);
        double x01 = Lerp(c001, c101, u), x11 = Lerp(c011, c111, u);
        double y0 = Lerp(x00, x10, v), y1 = Lerp(x01, x11, v);
        return Lerp(y0, y1, w);
    }
}
