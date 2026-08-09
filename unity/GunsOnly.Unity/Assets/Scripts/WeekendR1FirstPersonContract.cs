using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Typed, fail-closed view of the exact renderer-neutral R1 contract exported by Web.
/// It deliberately owns no mission/session/bootstrap policy; Weekend wiring only needs LoadOrThrow.
/// </summary>
public sealed class WeekendR1FirstPersonContract {
    public const string ResourcePath =
        "GunsOnly/WeekendRide/r1-first-person-contract-v1";
    public const string ExpectedSchema = "guns-only.r1-first-person.v1";
    public const string ExpectedSerialization = "canonical-json-v1";
    public const string ExpectedSemanticSha256 =
        "4e43c1f132e9ab8437361adfb626138380e53230794224dae6d64d4a7419cb5d";
    public const string ExpectedFileSha256 =
        "9df341cfe83abbc782fab3049ff0a9fbe67b52ac600d16ad384729ba1c52de5f";

    const string ExpectedSourceModule =
        "web/wwwroot/render/motorcycle/r1_first_person.js";
    const string ExpectedExportName = "R1_FIRST_PERSON_CONTRACT";

    static readonly string[] ExpectedAnchors = {
        "r1-windscreen",
        "r1-windscreen-rim",
        "r1-fairing-left",
        "r1-fairing-right",
        "r1-clip-ons",
        "r1-dash",
        "r1-tank",
    };

    static readonly string[] ExpectedColors = {
        "aluminium",
        "dashGlass",
        "highlightBlue",
        "rubber",
        "satinBlack",
        "tachGreen",
        "tachIdle",
        "tachRed",
        "windscreen",
        "windscreenRim",
        "yamahaBlue",
    };

    static readonly string[] ExpectedMaterials = {
        "aluminium",
        "dash-glass",
        "highlight-blue",
        "rubber",
        "satin-black",
        "tach-green",
        "tach-red",
        "windscreen",
        "windscreen-rim",
        "yamaha-blue",
    };

    static readonly string[] ExpectedParts = {
        "r1-windscreen",
        "r1-windscreen-rim",
        "r1-fairing-left",
        "r1-fairing-right",
        "r1-fairing-highlight-left",
        "r1-fairing-highlight-right",
        "r1-tank",
        "r1-tank-pad",
        "r1-dash",
        "r1-dash-glass",
        "r1-tach-light-0",
        "r1-tach-light-1",
        "r1-tach-light-2",
        "r1-tach-light-3",
        "r1-tach-light-4",
        "r1-tach-light-5",
        "r1-tach-light-6",
        "r1-clip-ons",
        "r1-clip-on-bar-left",
        "r1-grip-left",
        "r1-lever-left",
        "r1-clip-on-bar-right",
        "r1-grip-right",
        "r1-lever-right",
    };

    [Serializable]
    internal sealed class Manifest {
        [SerializeField] internal string schema;
        [SerializeField] internal string serialization;
        [SerializeField] internal string semanticSha256;
        [SerializeField] internal SourceSpec source;
        [SerializeField] internal CoordinateSystemSpec coordinateSystem;
        [SerializeField] internal string[] requiredAnchors;
        [SerializeField] internal ColorSpec[] colors;
        [SerializeField] internal MaterialSpec[] materials;
        [SerializeField] internal TachometerSpec tachometer;
        [SerializeField] internal RenderSpec render;
        [SerializeField] internal PartSpec[] parts;
    }

    [Serializable]
    internal sealed class SourceSpec {
        [SerializeField] internal string module;
        [SerializeField] internal string exportName;
    }

    [Serializable]
    internal sealed class CoordinateSystemSpec {
        [SerializeField] internal string units;
        [SerializeField] internal string handedness;
        [SerializeField] internal string origin;
        [SerializeField] internal string right;
        [SerializeField] internal string up;
        [SerializeField] internal string forward;
        [SerializeField] internal string rotation;
    }

    [Serializable]
    public sealed class ColorSpec {
        [SerializeField] internal string name;
        [SerializeField] internal string srgbHex;
        [SerializeField] internal int[] srgbRgb8;
        [SerializeField] internal float[] linearRgb;

        public string Name => name;
        public string SrgbHex => srgbHex;
        public IReadOnlyList<int> SrgbRgb8 => srgbRgb8;
        public IReadOnlyList<float> LinearRgb => linearRgb;

        internal Color LinearColor => new(linearRgb[0], linearRgb[1], linearRgb[2], 1f);
    }

    [Serializable]
    public sealed class MaterialSpec {
        [SerializeField] internal string name;
        [SerializeField] internal string model;
        [SerializeField] internal string color;
        [SerializeField] internal float roughness;
        [SerializeField] internal float metalness;
        [SerializeField] internal string side;
        [SerializeField] internal float opacity;
        [SerializeField] internal bool transparent;
        [SerializeField] internal bool depthWrite;
        [SerializeField] internal string emissive;
        [SerializeField] internal float emissiveIntensity;

        public string Name => name;
        public string Model => model;
        public string ColorName => color;
        public float Roughness => roughness;
        public float Metalness => metalness;
        public string Side => side;
        public float Opacity => opacity;
        public bool Transparent => transparent;
        public bool DepthWrite => depthWrite;
        public string EmissiveColorName => emissive;
        public float EmissiveIntensity => emissiveIntensity;
    }

    [Serializable]
    public sealed class TelemetrySpec {
        [SerializeField] internal string kind;
        [SerializeField] internal int index;

        public string Kind => kind;
        public int Index => index;
    }

    [Serializable]
    public sealed class PartSpec {
        [SerializeField] internal string name;
        [SerializeField] internal string primitive;
        [SerializeField] internal string material;
        [SerializeField] internal float[] positionM;
        [SerializeField] internal float[] rotationRad;
        [SerializeField] internal float[] dimensionsM;
        [SerializeField] internal float radiusM;
        [SerializeField] internal float lengthM;
        [SerializeField] internal int radialSegments;
        [SerializeField] internal int[] segments;
        [SerializeField] internal float[] verticesM;
        [SerializeField] internal int[] triangles;
        [SerializeField] internal float[] lineSegmentsM;
        [SerializeField] internal TelemetrySpec telemetry;

        public string Name => name;
        public string Primitive => primitive;
        public string MaterialName => material;
        public IReadOnlyList<float> PositionM => positionM;
        public IReadOnlyList<float> RotationRad => rotationRad;
        public IReadOnlyList<float> DimensionsM => dimensionsM;
        public float RadiusM => radiusM;
        public float LengthM => lengthM;
        public int RadialSegments => radialSegments;
        public IReadOnlyList<int> Segments => segments;
        public IReadOnlyList<float> VerticesM => verticesM;
        public IReadOnlyList<int> Triangles => triangles;
        public IReadOnlyList<float> LineSegmentsM => lineSegmentsM;
        public TelemetrySpec Telemetry => telemetry;

        internal float[] PositionValues => positionM;
        internal float[] RotationValues => rotationRad;
        internal float[] DimensionValues => dimensionsM;
        internal int[] SegmentValues => segments;
        internal float[] VertexValues => verticesM;
        internal int[] TriangleValues => triangles;
        internal float[] LineSegmentValues => lineSegmentsM;
    }

    [Serializable]
    public sealed class TachometerSpec {
        [SerializeField] internal float idleRpm;
        [SerializeField] internal float redlineRpm;
        [SerializeField] internal float inactiveEmissiveIntensity;
        [SerializeField] internal float activeEmissiveIntensity;

        public float IdleRpm => idleRpm;
        public float RedlineRpm => redlineRpm;
        public float InactiveEmissiveIntensity => inactiveEmissiveIntensity;
        public float ActiveEmissiveIntensity => activeEmissiveIntensity;
    }

    [Serializable]
    public sealed class RenderSpec {
        [SerializeField] internal bool cameraLocal;
        [SerializeField] internal bool fog;
        [SerializeField] internal bool frustumCulled;
        [SerializeField] internal int renderOrder;

        public bool CameraLocal => cameraLocal;
        public bool Fog => fog;
        public bool FrustumCulled => frustumCulled;
        public int RenderOrder => renderOrder;
    }

    readonly Manifest _manifest;
    readonly ReadOnlyCollection<PartSpec> _parts;
    readonly ReadOnlyCollection<string> _requiredAnchors;
    readonly Dictionary<string, ColorSpec> _colors;
    readonly Dictionary<string, MaterialSpec> _materials;

    WeekendR1FirstPersonContract(Manifest manifest) {
        _manifest = manifest;
        _parts = Array.AsReadOnly(manifest.parts);
        _requiredAnchors = Array.AsReadOnly(manifest.requiredAnchors);
        _colors = IndexByName(manifest.colors, color => color.name);
        _materials = IndexByName(manifest.materials, material => material.name);
    }

    public string Schema => _manifest.schema;
    public string SemanticSha256 => _manifest.semanticSha256;
    public IReadOnlyList<string> RequiredAnchors => _requiredAnchors;
    public IReadOnlyList<PartSpec> Parts => _parts;
    public TachometerSpec Tachometer => _manifest.tachometer;
    public RenderSpec Render => _manifest.render;

    public static WeekendR1FirstPersonContract LoadOrThrow() {
        TextAsset source = Resources.Load<TextAsset>(ResourcePath);
        if (source == null) {
            throw new InvalidOperationException(
                "Missing exact Web R1 first-person contract at Resources/" + ResourcePath + ".");
        }
        return FromExactBytes(source.bytes, "Resources/" + ResourcePath);
    }

    /// <summary>Parses only the pinned canonical byte stream; near-miss or restaged JSON fails closed.</summary>
    public static WeekendR1FirstPersonContract FromExactBytes(byte[] bytes, string sourceLabel) {
        if (bytes == null || bytes.Length == 0)
            throw new InvalidOperationException("R1 first-person contract bytes are empty.");
        string fileSha256 = Sha256(bytes);
        if (!string.Equals(fileSha256, ExpectedFileSha256, StringComparison.Ordinal)) {
            throw new InvalidOperationException(
                $"R1 first-person contract byte hash mismatch at {sourceLabel}: "
                + $"expected {ExpectedFileSha256}, got {fileSha256}.");
        }

        string json = Encoding.UTF8.GetString(bytes);
        Manifest manifest;
        try {
            manifest = JsonUtility.FromJson<Manifest>(json);
        } catch (Exception exception) {
            throw new InvalidOperationException(
                "R1 first-person contract JSON is malformed at " + sourceLabel + ".", exception);
        }
        Validate(manifest);
        return new WeekendR1FirstPersonContract(manifest);
    }

    public Color LinearColorOrThrow(string name) {
        if (!_colors.TryGetValue(name, out ColorSpec value))
            throw new InvalidOperationException("Unknown R1 contract colour " + name + ".");
        return value.LinearColor;
    }

    public MaterialSpec MaterialOrThrow(string name) {
        if (!_materials.TryGetValue(name, out MaterialSpec value))
            throw new InvalidOperationException("Unknown R1 contract material " + name + ".");
        return value;
    }

    static void Validate(Manifest manifest) {
        if (manifest == null)
            throw new InvalidOperationException("R1 first-person contract is empty.");
        if (manifest.schema != ExpectedSchema
            || manifest.serialization != ExpectedSerialization
            || manifest.semanticSha256 != ExpectedSemanticSha256) {
            throw new InvalidOperationException("R1 first-person schema or semantic digest drifted.");
        }
        if (manifest.source == null
            || manifest.source.module != ExpectedSourceModule
            || manifest.source.exportName != ExpectedExportName) {
            throw new InvalidOperationException("R1 first-person Web authority is invalid.");
        }
        CoordinateSystemSpec coordinates = manifest.coordinateSystem;
        if (coordinates == null
            || coordinates.units != "metres"
            || coordinates.handedness != "right"
            || coordinates.origin != "helmet-camera"
            || coordinates.right != "+x"
            || coordinates.up != "+y"
            || coordinates.forward != "-z"
            || coordinates.rotation != "local XYZ radians") {
            throw new InvalidOperationException("R1 first-person coordinate convention is invalid.");
        }
        ValidateExactStrings(manifest.requiredAnchors, ExpectedAnchors, "required anchor");
        ValidateColors(manifest.colors);
        ValidateMaterials(manifest.materials);
        ValidateTachometer(manifest.tachometer);
        ValidateRender(manifest.render);
        ValidateParts(manifest.parts, manifest.requiredAnchors, manifest.materials);
    }

    static void ValidateColors(ColorSpec[] colors) {
        if (colors == null || colors.Length != ExpectedColors.Length)
            throw new InvalidOperationException("R1 colour record count drifted.");
        var seen = new HashSet<string>(StringComparer.Ordinal);
        for (int index = 0; index < colors.Length; index++) {
            ColorSpec color = colors[index];
            if (color == null || color.name != ExpectedColors[index] || !seen.Add(color.name)
                || color.srgbHex == null || color.srgbHex.Length != 7
                || color.srgbHex[0] != '#'
                || color.srgbRgb8 == null || color.srgbRgb8.Length != 3
                || color.linearRgb == null || color.linearRgb.Length != 3
                || !Finite(color.linearRgb)) {
                throw new InvalidOperationException("Malformed R1 colour record at index " + index + ".");
            }
            for (int channel = 0; channel < 3; channel++) {
                int srgb8 = color.srgbRgb8[channel];
                if (srgb8 < 0 || srgb8 > 255)
                    throw new InvalidOperationException("Out-of-range R1 sRGB channel for " + color.name + ".");
                float srgb = srgb8 / 255f;
                float expectedLinear = srgb <= 0.04045f
                    ? srgb / 12.92f
                    : Mathf.Pow((srgb + 0.055f) / 1.055f, 2.4f);
                if (Mathf.Abs(expectedLinear - color.linearRgb[channel]) > 0.000002f) {
                    throw new InvalidOperationException(
                        "R1 explicit linear colour does not match sRGB for " + color.name + ".");
                }
            }
        }
    }

    static void ValidateMaterials(MaterialSpec[] materials) {
        if (materials == null || materials.Length != ExpectedMaterials.Length)
            throw new InvalidOperationException("R1 material record count drifted.");
        var colors = new HashSet<string>(ExpectedColors, StringComparer.Ordinal);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        for (int index = 0; index < materials.Length; index++) {
            MaterialSpec material = materials[index];
            if (material == null || material.name != ExpectedMaterials[index]
                || !seen.Add(material.name)
                || material.model is not ("pbr" or "unlit")
                || !colors.Contains(material.color)
                || material.side is not ("front" or "double")
                || !Finite(material.roughness, material.metalness, material.opacity,
                    material.emissiveIntensity)
                || material.roughness < 0f || material.roughness > 1f
                || material.metalness < 0f || material.metalness > 1f
                || material.opacity < 0f || material.opacity > 1f
                || material.emissiveIntensity < 0f
                || (!string.IsNullOrEmpty(material.emissive) && !colors.Contains(material.emissive))) {
                throw new InvalidOperationException("Malformed R1 material record at index " + index + ".");
            }
            if (!material.transparent && Mathf.Abs(material.opacity - 1f) > 0.000001f)
                throw new InvalidOperationException("Opaque R1 material has fractional opacity: " + material.name + ".");
            if (material.model == "unlit" && material.metalness != 0f)
                throw new InvalidOperationException("Unlit R1 material carries metallic response: " + material.name + ".");
        }
    }

    static void ValidateTachometer(TachometerSpec tachometer) {
        if (tachometer == null
            || !Finite(tachometer.idleRpm, tachometer.redlineRpm,
                tachometer.inactiveEmissiveIntensity, tachometer.activeEmissiveIntensity)
            || Mathf.Abs(tachometer.idleRpm - 2000f) > 0.001f
            || Mathf.Abs(tachometer.redlineRpm - 14500f) > 0.001f
            || Mathf.Abs(tachometer.inactiveEmissiveIntensity - 0.06f) > 0.000001f
            || Mathf.Abs(tachometer.activeEmissiveIntensity - 1.65f) > 0.000001f) {
            throw new InvalidOperationException("R1 tachometer contract drifted.");
        }
    }

    static void ValidateRender(RenderSpec render) {
        if (render == null || !render.cameraLocal || render.fog || render.frustumCulled
            || render.renderOrder != 2000) {
            throw new InvalidOperationException("R1 camera-local render contract drifted.");
        }
    }

    static void ValidateParts(
        PartSpec[] parts,
        string[] requiredAnchors,
        MaterialSpec[] materials
    ) {
        if (parts == null || parts.Length != ExpectedParts.Length)
            throw new InvalidOperationException("R1 first-person part count drifted.");
        var materialNames = new HashSet<string>(StringComparer.Ordinal);
        foreach (MaterialSpec material in materials) materialNames.Add(material.name);
        var names = new HashSet<string>(StringComparer.Ordinal);
        var tachIndices = new HashSet<int>();

        for (int index = 0; index < parts.Length; index++) {
            PartSpec part = parts[index];
            if (part == null || part.name != ExpectedParts[index] || !names.Add(part.name)
                || !materialNames.Contains(part.material)
                || part.positionM == null || part.positionM.Length != 3 || !Finite(part.positionM)
                || part.rotationRad == null || part.rotationRad.Length != 3 || !Finite(part.rotationRad)
                || part.dimensionsM == null || part.segments == null || part.verticesM == null
                || part.triangles == null || part.lineSegmentsM == null || part.telemetry == null
                || !Finite(part.radiusM, part.lengthM)
                || part.radiusM < 0f || part.lengthM < 0f) {
                throw new InvalidOperationException("Malformed R1 part at index " + index + ".");
            }
            ValidatePrimitive(part);
            if (part.telemetry.kind == "rpm-segment") {
                if (part.telemetry.index < 0 || part.telemetry.index > 6
                    || !tachIndices.Add(part.telemetry.index)
                    || part.name != "r1-tach-light-" + part.telemetry.index) {
                    throw new InvalidOperationException("Malformed R1 tach segment " + part.name + ".");
                }
            } else if (!string.IsNullOrEmpty(part.telemetry.kind) || part.telemetry.index != -1) {
                throw new InvalidOperationException("Unsupported R1 telemetry on " + part.name + ".");
            }
        }

        if (tachIndices.Count != 7)
            throw new InvalidOperationException("R1 tachometer must expose exactly seven segments.");
        foreach (string anchor in requiredAnchors) {
            if (!names.Contains(anchor))
                throw new InvalidOperationException("Missing R1 required anchor " + anchor + ".");
        }
    }

    static void ValidatePrimitive(PartSpec part) {
        switch (part.primitive) {
            case "box":
                PositiveDimensions(part.dimensionsM, 3, part.name);
                RequireEmptyGeometry(part, allowDimensions: true);
                break;
            case "plane":
                PositiveDimensions(part.dimensionsM, 2, part.name);
                RequireEmptyGeometry(part, allowDimensions: true);
                break;
            case "ellipsoid":
                PositiveDimensions(part.dimensionsM, 3, part.name);
                if (part.segments.Length != 2 || part.segments[0] < 3 || part.segments[1] < 2
                    || part.verticesM.Length != 0 || part.triangles.Length != 0
                    || part.lineSegmentsM.Length != 0 || part.radiusM != 0f || part.lengthM != 0f
                    || part.radialSegments != 0) {
                    throw new InvalidOperationException("Malformed R1 ellipsoid " + part.name + ".");
                }
                break;
            case "cylinder":
                if (part.dimensionsM.Length != 0 || part.radiusM <= 0f || part.lengthM <= 0f
                    || part.radialSegments < 3 || part.segments.Length != 0
                    || part.verticesM.Length != 0 || part.triangles.Length != 0
                    || part.lineSegmentsM.Length != 0) {
                    throw new InvalidOperationException("Malformed R1 cylinder " + part.name + ".");
                }
                break;
            case "panel":
                if (part.dimensionsM.Length != 0 || part.radiusM != 0f || part.lengthM != 0f
                    || part.radialSegments != 0 || part.segments.Length != 0
                    || part.verticesM.Length < 12 || part.verticesM.Length % 3 != 0
                    || part.triangles.Length < 6 || part.triangles.Length % 3 != 0
                    || !Finite(part.verticesM) || part.lineSegmentsM.Length != 0) {
                    throw new InvalidOperationException("Malformed R1 panel " + part.name + ".");
                }
                int vertexCount = part.verticesM.Length / 3;
                foreach (int triangleIndex in part.triangles) {
                    if (triangleIndex < 0 || triangleIndex >= vertexCount)
                        throw new InvalidOperationException("Out-of-range R1 panel index on " + part.name + ".");
                }
                break;
            case "line-segments":
                if (part.dimensionsM.Length != 0 || part.radiusM != 0f || part.lengthM != 0f
                    || part.radialSegments != 0 || part.segments.Length != 0
                    || part.verticesM.Length != 0 || part.triangles.Length != 0
                    || part.lineSegmentsM.Length < 6 || part.lineSegmentsM.Length % 6 != 0
                    || !Finite(part.lineSegmentsM)) {
                    throw new InvalidOperationException("Malformed R1 line segments " + part.name + ".");
                }
                break;
            default:
                throw new InvalidOperationException("Unsupported R1 primitive " + part.primitive + ".");
        }
    }

    static void RequireEmptyGeometry(PartSpec part, bool allowDimensions) {
        if ((!allowDimensions && part.dimensionsM.Length != 0)
            || part.radiusM != 0f || part.lengthM != 0f || part.radialSegments != 0
            || part.segments.Length != 0 || part.verticesM.Length != 0
            || part.triangles.Length != 0 || part.lineSegmentsM.Length != 0) {
            throw new InvalidOperationException("Unexpected R1 geometry fields on " + part.name + ".");
        }
    }

    static void PositiveDimensions(float[] dimensions, int expected, string name) {
        if (dimensions == null || dimensions.Length != expected || !Finite(dimensions))
            throw new InvalidOperationException("Malformed R1 dimensions on " + name + ".");
        foreach (float value in dimensions) {
            if (value <= 0f)
                throw new InvalidOperationException("Non-positive R1 dimension on " + name + ".");
        }
    }

    static void ValidateExactStrings(string[] values, string[] expected, string label) {
        if (values == null || values.Length != expected.Length)
            throw new InvalidOperationException("R1 " + label + " count drifted.");
        for (int index = 0; index < values.Length; index++) {
            if (values[index] != expected[index])
                throw new InvalidOperationException("R1 " + label + " drifted at index " + index + ".");
        }
    }

    static Dictionary<string, T> IndexByName<T>(T[] values, Func<T, string> name) {
        var result = new Dictionary<string, T>(StringComparer.Ordinal);
        foreach (T value in values) result.Add(name(value), value);
        return result;
    }

    static bool Finite(params float[] values) {
        if (values == null) return false;
        foreach (float value in values) {
            if (float.IsNaN(value) || float.IsInfinity(value)) return false;
        }
        return true;
    }

    static string Sha256(byte[] bytes) {
        using SHA256 hash = SHA256.Create();
        byte[] digest = hash.ComputeHash(bytes);
        var value = new StringBuilder(digest.Length * 2);
        foreach (byte item in digest) value.Append(item.ToString("x2"));
        return value.ToString();
    }
}

}
