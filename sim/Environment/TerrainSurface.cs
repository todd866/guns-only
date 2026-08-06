namespace GunsOnly.Sim.Environment;

public readonly record struct TerrainBounds(
    double MinimumEastM,
    double MaximumEastM,
    double MinimumNorthM,
    double MaximumNorthM) {
    public bool Contains(double eastM, double northM) =>
        double.IsFinite(eastM) && double.IsFinite(northM)
        && eastM >= MinimumEastM && eastM <= MaximumEastM
        && northM >= MinimumNorthM && northM <= MaximumNorthM;
}

public enum TerrainSurfaceKind { Land, Water }

/// <summary>Terrain height, upward world normal, and physical surface at local coordinates.</summary>
public readonly record struct TerrainSample(double HeightM, Vec3D UpNormal,
    TerrainSurfaceKind Kind = TerrainSurfaceKind.Land);

/// <summary>
/// Renderer-independent terrain truth in the simulation's local X=east, Y=up, Z=north frame.
/// A terrain data pack owns datum/origin conversion; this contract deliberately invents no Korea
/// elevation or global geodesy.
/// </summary>
public interface ITerrainSurface {
    TerrainBounds Bounds { get; }
    double HorizontalResolutionM { get; }
    bool TrySample(double eastM, double northM, out TerrainSample sample);

    /// <summary>
    /// Height alone, for callers that never look at the normal or the surface kind — line-of-sight
    /// and clearance marches above all, which walk tens or hundreds of points per path and read
    /// nothing but HeightM.
    ///
    /// This is not a micro-optimisation. Every grid in this file builds its normal from analytic
    /// derivatives and then NORMALISES it — a divide and a square root per sample — and the packed
    /// theatre grids additionally resolve the water sentinel at the nearest node. None of that is
    /// read by a clearance march. An analytic surface is worse again: it builds its normal by
    /// finite difference, so a full TrySample costs FIVE height evaluations, which is what made the
    /// Cobra gunner's sight line 41.6 ms of every 120 Hz authority tick.
    ///
    /// The default implementation is the honest one — height from a full sample — so an
    /// implementation only overrides this when it genuinely has a cheaper path. Overrides MUST
    /// return exactly TrySample's HeightM and success; <c>EnvironmentTruthTests</c> and
    /// <c>UkraineTerrainTruthTests</c> pin that.
    /// </summary>
    bool TryHeightM(double eastM, double northM, out double heightM) {
        if (!TrySample(eastM, northM, out TerrainSample sample)) {
            heightM = 0.0;
            return false;
        }
        heightM = sample.HeightM;
        return true;
    }
}

/// <summary>
/// Places immutable georeferenced terrain into a mission-local frame without copying its samples.
/// Positive offsets move the source east/north in that frame; simulation queries are translated
/// back to the source before sampling.
/// </summary>
public sealed class TranslatedTerrainSurface : ITerrainSurface {
    readonly ITerrainSurface _source;
    readonly double _eastOffsetM;
    readonly double _northOffsetM;

    public TerrainBounds Bounds { get; }
    public double HorizontalResolutionM => _source.HorizontalResolutionM;

    public TranslatedTerrainSurface(ITerrainSurface source,
        double eastOffsetM, double northOffsetM) {
        _source = source ?? throw new ArgumentNullException(nameof(source));
        DefinitionValidation.Finite(eastOffsetM, nameof(eastOffsetM));
        DefinitionValidation.Finite(northOffsetM, nameof(northOffsetM));
        _eastOffsetM = eastOffsetM;
        _northOffsetM = northOffsetM;
        Bounds = new TerrainBounds(
            source.Bounds.MinimumEastM + eastOffsetM,
            source.Bounds.MaximumEastM + eastOffsetM,
            source.Bounds.MinimumNorthM + northOffsetM,
            source.Bounds.MaximumNorthM + northOffsetM);
    }

    public bool TrySample(double eastM, double northM, out TerrainSample sample) =>
        _source.TrySample(eastM - _eastOffsetM, northM - _northOffsetM, out sample);

    public bool TryHeightM(double eastM, double northM, out double heightM) =>
        _source.TryHeightM(eastM - _eastOffsetM, northM - _northOffsetM, out heightM);
}

/// <summary>Immutable regular grid with analytic bilinear height and normal interpolation.</summary>
public sealed class BilinearHeightGrid : ITerrainSurface {
    readonly double[] _heightM;

    public double OriginEastM { get; }
    public double OriginNorthM { get; }
    public double EastSpacingM { get; }
    public double NorthSpacingM { get; }
    public int EastPointCount { get; }
    public int NorthPointCount { get; }
    public TerrainBounds Bounds { get; }
    public double HorizontalResolutionM => Math.Min(EastSpacingM, NorthSpacingM);

    /// <param name="heightMNorthRowsEastColumns">
    /// Heights in metres. First dimension advances north; second advances east. The values are
    /// copied, so later caller mutations cannot alter simulation truth or replay determinism.
    /// </param>
    public BilinearHeightGrid(double originEastM, double originNorthM,
        double eastSpacingM, double northSpacingM,
        double[,] heightMNorthRowsEastColumns)
    {
        DefinitionValidation.Finite(originEastM, nameof(originEastM));
        DefinitionValidation.Finite(originNorthM, nameof(originNorthM));
        DefinitionValidation.Positive(eastSpacingM, nameof(eastSpacingM));
        DefinitionValidation.Positive(northSpacingM, nameof(northSpacingM));
        ArgumentNullException.ThrowIfNull(heightMNorthRowsEastColumns);

        NorthPointCount = heightMNorthRowsEastColumns.GetLength(0);
        EastPointCount = heightMNorthRowsEastColumns.GetLength(1);
        if (NorthPointCount < 2 || EastPointCount < 2)
            throw new ArgumentException("terrain grid requires at least two points on each axis",
                nameof(heightMNorthRowsEastColumns));

        OriginEastM = originEastM;
        OriginNorthM = originNorthM;
        EastSpacingM = eastSpacingM;
        NorthSpacingM = northSpacingM;
        _heightM = new double[NorthPointCount * EastPointCount];
        for (int north = 0; north < NorthPointCount; north++) {
            for (int east = 0; east < EastPointCount; east++) {
                double value = heightMNorthRowsEastColumns[north, east];
                DefinitionValidation.Finite(value, nameof(heightMNorthRowsEastColumns));
                _heightM[Index(east, north)] = value;
            }
        }

        double maximumEastM = originEastM + (EastPointCount - 1) * eastSpacingM;
        double maximumNorthM = originNorthM + (NorthPointCount - 1) * northSpacingM;
        if (!double.IsFinite(maximumEastM) || !double.IsFinite(maximumNorthM))
            throw new ArgumentOutOfRangeException(nameof(heightMNorthRowsEastColumns),
                "grid extent exceeds finite local coordinates");
        Bounds = new TerrainBounds(originEastM, maximumEastM,
            originNorthM, maximumNorthM);
    }

    public bool TrySample(double eastM, double northM, out TerrainSample sample) {
        if (!Bounds.Contains(eastM, northM)) {
            sample = default;
            return false;
        }

        double eastGrid = (eastM - OriginEastM) / EastSpacingM;
        double northGrid = (northM - OriginNorthM) / NorthSpacingM;
        int eastCell = eastM == Bounds.MaximumEastM
            ? EastPointCount - 2
            : Math.Clamp((int)Math.Floor(eastGrid), 0, EastPointCount - 2);
        int northCell = northM == Bounds.MaximumNorthM
            ? NorthPointCount - 2
            : Math.Clamp((int)Math.Floor(northGrid), 0, NorthPointCount - 2);
        double eastFraction = Math.Clamp(eastGrid - eastCell, 0.0, 1.0);
        double northFraction = Math.Clamp(northGrid - northCell, 0.0, 1.0);

        double h00 = Height(eastCell, northCell);
        double h10 = Height(eastCell + 1, northCell);
        double h01 = Height(eastCell, northCell + 1);
        double h11 = Height(eastCell + 1, northCell + 1);
        double southHeight = Lerp(h00, h10, eastFraction);
        double northHeight = Lerp(h01, h11, eastFraction);
        double heightM = Lerp(southHeight, northHeight, northFraction);

        // Analytic derivatives of the same bilinear patch. In the X=east/Y=up/Z=north world,
        // (-dh/dx, 1, -dh/dz) is the upward geometric normal despite the sim's left-handed labels.
        double eastSlope = ((h10 - h00) * (1.0 - northFraction)
            + (h11 - h01) * northFraction) / EastSpacingM;
        double northSlope = ((h01 - h00) * (1.0 - eastFraction)
            + (h11 - h10) * eastFraction) / NorthSpacingM;
        Vec3D normal = new Vec3D(-eastSlope, 1.0, -northSlope).Normalized();
        sample = new TerrainSample(heightM, normal);
        return true;
    }

    /// The same bilinear patch, without the two slope divisions and the normal's square root.
    /// Pinned bit-identical to TrySample's HeightM by <c>EnvironmentTruthTests</c> and <c>UkraineTerrainTruthTests</c>.
    public bool TryHeightM(double eastM, double northM, out double heightM) {
        if (!Bounds.Contains(eastM, northM)) {
            heightM = 0.0;
            return false;
        }

        double eastGrid = (eastM - OriginEastM) / EastSpacingM;
        double northGrid = (northM - OriginNorthM) / NorthSpacingM;
        int eastCell = eastM == Bounds.MaximumEastM
            ? EastPointCount - 2
            : Math.Clamp((int)Math.Floor(eastGrid), 0, EastPointCount - 2);
        int northCell = northM == Bounds.MaximumNorthM
            ? NorthPointCount - 2
            : Math.Clamp((int)Math.Floor(northGrid), 0, NorthPointCount - 2);
        double eastFraction = Math.Clamp(eastGrid - eastCell, 0.0, 1.0);
        double northFraction = Math.Clamp(northGrid - northCell, 0.0, 1.0);

        double southHeight = Lerp(Height(eastCell, northCell),
            Height(eastCell + 1, northCell), eastFraction);
        double northHeight = Lerp(Height(eastCell, northCell + 1),
            Height(eastCell + 1, northCell + 1), eastFraction);
        heightM = Lerp(southHeight, northHeight, northFraction);
        return true;
    }

    public TerrainSample Sample(double eastM, double northM) {
        if (!TrySample(eastM, northM, out TerrainSample sample))
            throw new ArgumentOutOfRangeException(nameof(eastM),
                "terrain coordinate lies outside the immutable grid bounds");
        return sample;
    }

    int Index(int east, int north) => north * EastPointCount + east;
    double Height(int east, int north) => _heightM[Index(east, north)];
    static double Lerp(double a, double b, double t) => a + (b - a) * t;
}

/// <summary>Clearance and terrain-masking queries shared by visual, EO, and flight systems.</summary>
public static class TerrainQueries {
    public static double ClearanceM(ITerrainSurface terrain, in Vec3D worldPositionM) {
        ArgumentNullException.ThrowIfNull(terrain);
        ValidatePoint(worldPositionM, nameof(worldPositionM));
        if (!terrain.TrySample(worldPositionM.X, worldPositionM.Z,
            out TerrainSample sample))
            throw new ArgumentOutOfRangeException(nameof(worldPositionM),
                "position lies outside terrain truth bounds");
        return worldPositionM.Y - sample.HeightM;
    }

    /// <summary>
    /// The most lookups one clearance march is ever allowed to make, whatever its length.
    ///
    /// Without a bound the cost of this query is unbounded in the DISTANCE BETWEEN TWO AIRCRAFT,
    /// which no caller controls. Measured on beat 10 (Rapier intercept) with the production
    /// Ukraine truth: the opposing formation is staged 360 km out, ReactiveBandit.TryLowAttackPlan
    /// runs against it on every 120 Hz tick per bandit, and each call marched 43,917 samples —
    /// 179,000 terrain lookups per tick, 2.3-3.1 ms of a 8.33 ms tick, in terrain alone.
    ///
    /// 256 is chosen from the geometry the callers actually need, not from a cost target. The
    /// longest march any of them legitimately asks for is ~2 km (LowBlockPerchCommand clamps its
    /// reach to 1,800 m; NeedsTerrainRecovery looks 2.5 s ahead; the merge-spawn sweep is 1,600 m;
    /// a lookahead segment is metres). Over 2 km, 256 samples is 7.8 m spacing — at or finer than
    /// the unbounded quarter-resolution step on every terrain in the game, so for every query in
    /// that band this bound changes NOTHING and the march stays bit-identical. It engages only
    /// past ~2 km, where the caller is asking a question about ground it cannot reach anyway.
    /// </summary>
    public const int MaximumPathSamples = 256;

    /// <summary>
    /// Minimum vertical clearance along a straight sensor/flight segment. Sampling is no coarser
    /// than one quarter of the terrain's declared resolution, bounding missed bilinear curvature,
    /// until <see cref="MaximumPathSamples"/> caps the march; callers can demand a still finer
    /// maximum step for close obstacle work.
    ///
    /// Height only: this march reads no normal and no surface kind, so it goes through
    /// ITerrainSurface.TryHeightM rather than paying for a normal it discards at every step.
    /// </summary>
    public static double MinimumClearanceM(ITerrainSurface terrain,
        in Vec3D startWorldM, in Vec3D endWorldM, double maximumHorizontalStepM = 25.0)
    {
        ArgumentNullException.ThrowIfNull(terrain);
        ValidatePoint(startWorldM, nameof(startWorldM));
        ValidatePoint(endWorldM, nameof(endWorldM));
        DefinitionValidation.Positive(maximumHorizontalStepM,
            nameof(maximumHorizontalStepM));
        DefinitionValidation.Positive(terrain.HorizontalResolutionM,
            nameof(terrain.HorizontalResolutionM));

        Vec3D delta = endWorldM - startWorldM;
        double horizontalDistanceM = Math.Sqrt(delta.X * delta.X + delta.Z * delta.Z);
        double stepM = Math.Min(maximumHorizontalStepM,
            terrain.HorizontalResolutionM * 0.25);
        double rawSteps = Math.Ceiling(horizontalDistanceM / stepM);
        if (!double.IsFinite(rawSteps) || rawSteps > int.MaxValue)
            throw new ArgumentOutOfRangeException(nameof(maximumHorizontalStepM),
                "terrain path requires more samples than can be represented");
        int steps = Math.Clamp((int)rawSteps, 1, MaximumPathSamples);
        double minimumClearanceM = double.MaxValue;

        for (int i = 0; i <= steps; i++) {
            double fraction = (double)i / steps;
            Vec3D position = startWorldM + delta * fraction;
            if (!terrain.TryHeightM(position.X, position.Z, out double heightM))
                throw new ArgumentOutOfRangeException(nameof(endWorldM),
                    "terrain path leaves the available truth bounds");
            minimumClearanceM = Math.Min(minimumClearanceM,
                position.Y - heightM);
        }
        return minimumClearanceM;
    }

    public static bool HasLineOfSight(ITerrainSurface terrain,
        in Vec3D observerWorldM, in Vec3D targetWorldM,
        double requiredClearanceM = 0.0, double maximumHorizontalStepM = 25.0)
    {
        DefinitionValidation.NonNegative(requiredClearanceM,
            nameof(requiredClearanceM));
        return MinimumClearanceM(terrain, observerWorldM, targetWorldM,
            maximumHorizontalStepM) >= requiredClearanceM;
    }

    static void ValidatePoint(in Vec3D point, string name) {
        if (!CloudSample.IsFinite(point)) throw new ArgumentOutOfRangeException(name);
    }
}
