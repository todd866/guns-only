using System.Reflection;
using GunsOnly.Sim;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Web;

/// <summary>Compatibility entry point for the pack-derived 128 m Korea grid.</summary>
internal static class KoreaTerrainTruth {
    const string ResourceName = "GunsOnly.Web.Data.KoreaCentralFront.truth";

    /// Returns null only when a constrained build explicitly sets EmbedKoreaTerrainTruth=false.
    /// Production includes the grid so physics and presentation share the same terrain substrate;
    /// an opted-out build deliberately falls back to sea level.
    public static ITerrainSurface? Load() =>
        PackedTerrainTruth.Load(ResourceName, "Korea central-front");
}

/// <summary>
/// Ukraine theatre truth derived from the exact quantized records streamed by the browser atlas.
/// The 32 m Rapier-site records override the atlas' 256 m coarsest LOD in one coordinate frame;
/// both outputs and their source-record hashes are locked by the adjacent kernel provenance file.
/// </summary>
internal static class UkraineTerrainTruth {
    const string DetailResourceName = "GunsOnly.Web.Data.UkraineRapierSite.truth";
    const string RegionalResourceName = "GunsOnly.Web.Data.UkraineRapierRange.truth";

    public static ITerrainSurface? Load() {
        ITerrainSurface? detail = PackedTerrainTruth.Load(
            DetailResourceName, "Ukraine Rapier-site atlas detail");
        ITerrainSurface? regional = PackedTerrainTruth.Load(
            RegionalResourceName, "Ukraine Rapier-range atlas regional truth");
        if (detail is null || regional is null) return null;
        return new NestedTerrainSurface(regional, detail);
    }
}

/// <summary>
/// A broad low-resolution surface with one or more higher-resolution overrides. Queries inside an
/// override never touch the base, so collision, Auto-GCAS and rendering can add future medevac
/// hero cells without changing the theatre frame.
/// </summary>
internal sealed class NestedTerrainSurface : ITerrainSurface {
    readonly ITerrainSurface _base;
    readonly ITerrainSurface[] _overrides;

    public TerrainBounds Bounds => _base.Bounds;
    public double HorizontalResolutionM { get; }

    public NestedTerrainSurface(ITerrainSurface baseSurface,
        params ITerrainSurface[] overrides) {
        _base = baseSurface ?? throw new ArgumentNullException(nameof(baseSurface));
        _overrides = overrides ?? throw new ArgumentNullException(nameof(overrides));
        if (_overrides.Any(surface => surface is null))
            throw new ArgumentException("terrain overrides cannot contain null", nameof(overrides));
        if (_overrides.Any(surface =>
            !_base.Bounds.Contains(surface.Bounds.MinimumEastM, surface.Bounds.MinimumNorthM)
            || !_base.Bounds.Contains(surface.Bounds.MaximumEastM, surface.Bounds.MaximumNorthM)))
            throw new ArgumentException("terrain overrides must lie inside the base surface",
                nameof(overrides));
        HorizontalResolutionM = Math.Min(_base.HorizontalResolutionM,
            _overrides.Length == 0
                ? _base.HorizontalResolutionM
                : _overrides.Min(surface => surface.HorizontalResolutionM));
    }

    public bool TrySample(double eastM, double northM, out TerrainSample sample) {
        // Last override wins so adding a 1 m LZ patch over the 32 m cell remains deterministic.
        for (int index = _overrides.Length - 1; index >= 0; index--) {
            if (_overrides[index].TrySample(eastM, northM, out sample)) return true;
        }
        return _base.TrySample(eastM, northM, out sample);
    }

    public bool TryHeightM(double eastM, double northM, out double heightM) {
        for (int index = _overrides.Length - 1; index >= 0; index--) {
            if (_overrides[index].TryHeightM(eastM, northM, out heightM)) return true;
        }
        return _base.TryHeightM(eastM, northM, out heightM);
    }
}

/// <summary>
/// Reads the small immutable quantized-grid contract used by terrain content packs. Keeping the
/// decoder regional-name-free lets a mission select a theatre without duplicating interpolation,
/// normals, validation or water semantics.
/// </summary>
internal static class PackedTerrainTruth {
    static readonly byte[] ExpectedMagic = "GOKTRN1\0"u8.ToArray();

    public static ITerrainSurface? Load(string resourceName, string displayName) {
        using Stream? stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream(resourceName);
        if (stream is null) return null;
        using var reader = new BinaryReader(stream);
        byte[] magic = reader.ReadBytes(8);
        if (!magic.SequenceEqual(ExpectedMagic))
            throw new InvalidDataException($"{displayName} terrain truth has an invalid magic header");
        int version = checked((int)reader.ReadUInt32());
        int width = checked((int)reader.ReadUInt32());
        int height = checked((int)reader.ReadUInt32());
        double spacingM = reader.ReadDouble();
        double originEastM = reader.ReadDouble();
        double originNorthM = reader.ReadDouble();
        double metresPerUnit = reader.ReadDouble();
        short waterSentinel = reader.ReadInt16();
        reader.ReadBytes(10);
        if (version != 1 || width < 2 || height < 2
            || !double.IsFinite(spacingM) || spacingM <= 0.0
            || !double.IsFinite(originEastM) || !double.IsFinite(originNorthM)
            || !double.IsFinite(metresPerUnit) || metresPerUnit <= 0.0)
            throw new InvalidDataException($"{displayName} terrain truth header is invalid");
        long expectedLength = 64L + checked((long)width * height * sizeof(short));
        if (stream.Length != expectedLength)
            throw new InvalidDataException(
                $"{displayName} terrain truth length {stream.Length} does not match {expectedLength}");
        var samples = new short[checked(width * height)];
        for (int index = 0; index < samples.Length; index++)
            samples[index] = reader.ReadInt16();
        return new QuantizedTerrainGrid(originEastM, originNorthM, spacingM,
            width, height, metresPerUnit, waterSentinel, samples);
    }

    sealed class QuantizedTerrainGrid : ITerrainSurface {
        readonly short[] _samples;
        readonly double _metresPerUnit;
        readonly short _waterSentinel;
        readonly int _width;
        readonly int _height;
        readonly double _originEastM;
        readonly double _originNorthM;

        public TerrainBounds Bounds { get; }
        public double HorizontalResolutionM { get; }

        public QuantizedTerrainGrid(double originEastM, double originNorthM,
            double spacingM, int width, int height, double metresPerUnit,
            short waterSentinel, short[] samples) {
            _originEastM = originEastM;
            _originNorthM = originNorthM;
            HorizontalResolutionM = spacingM;
            _width = width;
            _height = height;
            _metresPerUnit = metresPerUnit;
            _waterSentinel = waterSentinel;
            _samples = samples;
            Bounds = new TerrainBounds(originEastM,
                originEastM + (width - 1) * spacingM,
                originNorthM,
                originNorthM + (height - 1) * spacingM);
        }

        public bool TrySample(double eastM, double northM, out TerrainSample sample) {
            if (!Bounds.Contains(eastM, northM)) {
                sample = default;
                return false;
            }
            double eastGrid = (eastM - _originEastM) / HorizontalResolutionM;
            double northGrid = (northM - _originNorthM) / HorizontalResolutionM;
            int eastCell = eastM == Bounds.MaximumEastM
                ? _width - 2 : Math.Clamp((int)Math.Floor(eastGrid), 0, _width - 2);
            int northCell = northM == Bounds.MaximumNorthM
                ? _height - 2 : Math.Clamp((int)Math.Floor(northGrid), 0, _height - 2);
            double eastFraction = Math.Clamp(eastGrid - eastCell, 0.0, 1.0);
            double northFraction = Math.Clamp(northGrid - northCell, 0.0, 1.0);
            double h00 = Height(eastCell, northCell);
            double h10 = Height(eastCell + 1, northCell);
            double h01 = Height(eastCell, northCell + 1);
            double h11 = Height(eastCell + 1, northCell + 1);
            double southHeight = Lerp(h00, h10, eastFraction);
            double northHeight = Lerp(h01, h11, eastFraction);
            double heightM = Lerp(southHeight, northHeight, northFraction);
            double eastSlope = ((h10 - h00) * (1.0 - northFraction)
                + (h11 - h01) * northFraction) / HorizontalResolutionM;
            double northSlope = ((h01 - h00) * (1.0 - eastFraction)
                + (h11 - h10) * eastFraction) / HorizontalResolutionM;
            Vec3D normal = new Vec3D(-eastSlope, 1.0, -northSlope).Normalized();
            int nearestEast = Math.Clamp((int)Math.Floor(eastGrid + 0.5), 0, _width - 1);
            int nearestNorth = Math.Clamp((int)Math.Floor(northGrid + 0.5), 0, _height - 1);
            bool water = Raw(nearestEast, nearestNorth) == _waterSentinel;
            sample = new TerrainSample(water ? 0.0 : heightM, normal,
                water ? TerrainSurfaceKind.Water : TerrainSurfaceKind.Land);
            return true;
        }

        /// The same bilinear patch as TrySample, without the two slope divisions, the normal's
        /// square root, or the nearest-node water lookup — none of which a clearance march reads.
        /// Pinned bit-identical to TrySample's HeightM by <c>EnvironmentTruthTests</c> and <c>UkraineTerrainTruthTests</c>: the
        /// water sentinel already collapses to 0.0 inside Height(), so a water cell interpolates
        /// exactly as it does above.
        public bool TryHeightM(double eastM, double northM, out double heightM) {
            if (!Bounds.Contains(eastM, northM)) {
                heightM = 0.0;
                return false;
            }
            double eastGrid = (eastM - _originEastM) / HorizontalResolutionM;
            double northGrid = (northM - _originNorthM) / HorizontalResolutionM;
            int eastCell = eastM == Bounds.MaximumEastM
                ? _width - 2 : Math.Clamp((int)Math.Floor(eastGrid), 0, _width - 2);
            int northCell = northM == Bounds.MaximumNorthM
                ? _height - 2 : Math.Clamp((int)Math.Floor(northGrid), 0, _height - 2);
            double eastFraction = Math.Clamp(eastGrid - eastCell, 0.0, 1.0);
            double northFraction = Math.Clamp(northGrid - northCell, 0.0, 1.0);
            double southHeight = Lerp(Height(eastCell, northCell),
                Height(eastCell + 1, northCell), eastFraction);
            double northHeight = Lerp(Height(eastCell, northCell + 1),
                Height(eastCell + 1, northCell + 1), eastFraction);
            double interpolatedM = Lerp(southHeight, northHeight, northFraction);
            int nearestEast = Math.Clamp((int)Math.Floor(eastGrid + 0.5), 0, _width - 1);
            int nearestNorth = Math.Clamp((int)Math.Floor(northGrid + 0.5), 0, _height - 1);
            heightM = Raw(nearestEast, nearestNorth) == _waterSentinel ? 0.0 : interpolatedM;
            return true;
        }

        short Raw(int east, int north) => _samples[north * _width + east];
        double Height(int east, int north) {
            short value = Raw(east, north);
            return value == _waterSentinel ? 0.0 : value * _metresPerUnit;
        }
        static double Lerp(double a, double b, double fraction) =>
            a + (b - a) * fraction;
    }
}

/// <summary>
/// Coarse, explicitly non-authored safety apron around a compact training grid. The source remains
/// authoritative inside its bounds; outside, edge height/normal blend into a flat datum so AGL,
/// impact and Auto-GCAS do not silently fall back to sea level the instant a fast aircraft crosses
/// the detailed cell. The apron is not suitable for targets, navigation or landing-zone decisions.
/// </summary>
internal sealed class TrainingTerrainApronSurface : ITerrainSurface {
    readonly ITerrainSurface _source;
    readonly double _flatHeightM;
    readonly double _transitionM;

    public TerrainBounds Bounds { get; }
    public double HorizontalResolutionM => _source.HorizontalResolutionM;

    public TrainingTerrainApronSurface(ITerrainSurface source, double marginM,
        double flatHeightM, double transitionM) {
        _source = source ?? throw new ArgumentNullException(nameof(source));
        if (!double.IsFinite(marginM) || marginM <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(marginM));
        if (!double.IsFinite(flatHeightM))
            throw new ArgumentOutOfRangeException(nameof(flatHeightM));
        if (!double.IsFinite(transitionM) || transitionM <= 0.0 || transitionM > marginM)
            throw new ArgumentOutOfRangeException(nameof(transitionM));
        _flatHeightM = flatHeightM;
        _transitionM = transitionM;
        Bounds = new TerrainBounds(
            source.Bounds.MinimumEastM - marginM,
            source.Bounds.MaximumEastM + marginM,
            source.Bounds.MinimumNorthM - marginM,
            source.Bounds.MaximumNorthM + marginM);
    }

    public bool TrySample(double eastM, double northM, out TerrainSample sample) {
        if (!Bounds.Contains(eastM, northM)) {
            sample = default;
            return false;
        }
        if (_source.TrySample(eastM, northM, out sample)) return true;

        double sourceEastM = Math.Clamp(eastM,
            _source.Bounds.MinimumEastM, _source.Bounds.MaximumEastM);
        double sourceNorthM = Math.Clamp(northM,
            _source.Bounds.MinimumNorthM, _source.Bounds.MaximumNorthM);
        if (!_source.TrySample(sourceEastM, sourceNorthM, out TerrainSample edge)) {
            sample = default;
            return false;
        }
        double eastOutsideM = eastM - sourceEastM;
        double northOutsideM = northM - sourceNorthM;
        double distanceOutsideM = Math.Sqrt(
            eastOutsideM * eastOutsideM + northOutsideM * northOutsideM);
        double fraction = Math.Clamp(distanceOutsideM / _transitionM, 0.0, 1.0);
        fraction = fraction * fraction * (3.0 - 2.0 * fraction);
        Vec3D blendedNormal = new(
            edge.UpNormal.X * (1.0 - fraction),
            edge.UpNormal.Y * (1.0 - fraction) + fraction,
            edge.UpNormal.Z * (1.0 - fraction));
        sample = new TerrainSample(
            edge.HeightM + (_flatHeightM - edge.HeightM) * fraction,
            blendedNormal.Normalized(),
            TerrainSurfaceKind.Land);
        return true;
    }

    /// The same apron, height only. Inside the source this is the source's own cheap height path;
    /// outside it, the blend toward the flat datum uses exactly the expression above, so the two
    /// agree bit-for-bit on both sides of the boundary.
    public bool TryHeightM(double eastM, double northM, out double heightM) {
        if (!Bounds.Contains(eastM, northM)) {
            heightM = 0.0;
            return false;
        }
        if (_source.TryHeightM(eastM, northM, out heightM)) return true;

        double sourceEastM = Math.Clamp(eastM,
            _source.Bounds.MinimumEastM, _source.Bounds.MaximumEastM);
        double sourceNorthM = Math.Clamp(northM,
            _source.Bounds.MinimumNorthM, _source.Bounds.MaximumNorthM);
        if (!_source.TryHeightM(sourceEastM, sourceNorthM, out double edgeHeightM)) {
            heightM = 0.0;
            return false;
        }
        double eastOutsideM = eastM - sourceEastM;
        double northOutsideM = northM - sourceNorthM;
        double distanceOutsideM = Math.Sqrt(
            eastOutsideM * eastOutsideM + northOutsideM * northOutsideM);
        double fraction = Math.Clamp(distanceOutsideM / _transitionM, 0.0, 1.0);
        fraction = fraction * fraction * (3.0 - 2.0 * fraction);
        heightM = edgeHeightM + (_flatHeightM - edgeHeightM) * fraction;
        return true;
    }
}
