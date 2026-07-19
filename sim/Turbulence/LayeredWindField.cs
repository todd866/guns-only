namespace GunsOnly.Sim.Turbulence;

/// <summary>One geometric-altitude wind-vector point, in metres and metres per second.</summary>
public readonly record struct WindVectorLevel(
    double GeometricAltitudeM,
    Vec3D VelocityMps);

/// <summary>
/// Immutable vertical wind sounding. Cartesian vectors are interpolated component-by-component,
/// which naturally handles direction crossings such as 350 to 010 degrees and also preserves
/// the physically meaningful speed reduction in a strongly veering layer. Below/above the
/// sounding, the nearest resolved vector is held constant. Optional turbulence is composed after
/// the mean-field interpolation so deterministic gust structure remains world-position based.
/// </summary>
public sealed class LayeredWindField : IWindField {
    readonly WindVectorLevel[] _levels;
    readonly IWindField? _turbulence;

    public double MinimumGeometricAltitudeM => _levels[0].GeometricAltitudeM;
    public double MaximumGeometricAltitudeM => _levels[^1].GeometricAltitudeM;
    public IReadOnlyList<WindVectorLevel> Levels { get; }
    public IWindField? Turbulence => _turbulence;

    public LayeredWindField(
        IEnumerable<WindVectorLevel> levels,
        IWindField? turbulence = null)
    {
        ArgumentNullException.ThrowIfNull(levels);
        _levels = levels.ToArray();
        if (_levels.Length < 2)
            throw new ArgumentException("a wind sounding requires at least two vector levels", nameof(levels));

        for (int i = 0; i < _levels.Length; i++) {
            var level = _levels[i];
            if (!double.IsFinite(level.GeometricAltitudeM))
                throw new ArgumentOutOfRangeException(nameof(levels), "wind altitudes must be finite metres");
            if (!IsFinite(level.VelocityMps))
                throw new ArgumentOutOfRangeException(nameof(levels), "wind vectors must be finite metres per second");
            if (i > 0 && level.GeometricAltitudeM <= _levels[i - 1].GeometricAltitudeM)
                throw new ArgumentException("wind altitudes must be strictly increasing", nameof(levels));
        }

        _turbulence = turbulence;
        Levels = Array.AsReadOnly(_levels);
    }

    public Vec3D Sample(Vec3D worldPos) {
        if (!IsFinite(worldPos))
            throw new ArgumentOutOfRangeException(nameof(worldPos), "world position must be finite metres");

        Vec3D mean = MeanWindAt(worldPos.Y);
        return _turbulence is null ? mean : mean + _turbulence.Sample(worldPos);
    }

    Vec3D MeanWindAt(double geometricAltitudeM) {
        if (geometricAltitudeM <= MinimumGeometricAltitudeM) return _levels[0].VelocityMps;
        if (geometricAltitudeM >= MaximumGeometricAltitudeM) return _levels[^1].VelocityMps;

        int low = 0;
        int high = _levels.Length - 1;
        while (high - low > 1) {
            int mid = low + (high - low) / 2;
            if (geometricAltitudeM < _levels[mid].GeometricAltitudeM) high = mid;
            else low = mid;
        }

        var lower = _levels[low];
        var upper = _levels[high];
        double fraction = (geometricAltitudeM - lower.GeometricAltitudeM)
            / (upper.GeometricAltitudeM - lower.GeometricAltitudeM);
        return lower.VelocityMps + (upper.VelocityMps - lower.VelocityMps) * fraction;
    }

    static bool IsFinite(Vec3D value) =>
        double.IsFinite(value.X) && double.IsFinite(value.Y) && double.IsFinite(value.Z);
}
