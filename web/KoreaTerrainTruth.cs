using System.Reflection;
using GunsOnly.Sim;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Web;

/// <summary>Loads the pack-derived 128 m Korea grid without coupling the simulation library to it.</summary>
internal static class KoreaTerrainTruth {
    const string ResourceName = "GunsOnly.Web.Data.KoreaCentralFront.truth";
    static readonly byte[] ExpectedMagic = "GOKTRN1\0"u8.ToArray();

    public static ITerrainSurface Load() {
        using Stream stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"missing embedded terrain truth {ResourceName}");
        using var reader = new BinaryReader(stream);
        byte[] magic = reader.ReadBytes(8);
        if (!magic.SequenceEqual(ExpectedMagic))
            throw new InvalidDataException("Korea terrain truth has an invalid magic header");
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
            throw new InvalidDataException("Korea terrain truth header is invalid");
        long expectedLength = 64L + checked((long)width * height * sizeof(short));
        if (stream.Length != expectedLength)
            throw new InvalidDataException(
                $"Korea terrain truth length {stream.Length} does not match {expectedLength}");
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

        short Raw(int east, int north) => _samples[north * _width + east];
        double Height(int east, int north) {
            short value = Raw(east, north);
            return value == _waterSentinel ? 0.0 : value * _metresPerUnit;
        }
        static double Lerp(double a, double b, double fraction) =>
            a + (b - a) * fraction;
    }
}
