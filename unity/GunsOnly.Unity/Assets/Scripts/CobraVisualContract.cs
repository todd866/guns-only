using System;
using System.Collections.Generic;
using UnityEngine;

#pragma warning disable 0649 // JsonUtility assigns the serialized backing fields.

namespace GunsOnly.UnityClient {

/// <summary>
/// Typed, fail-closed adapter for the Cobra Canyon Build 299 visual contract.
/// Authority coordinates are east/up/north; this Unity project stores north as -Z.
/// </summary>
[Serializable]
public sealed class CobraVisualContract {
    public const string ResourcesPath =
        "GunsOnly/CobraVietnam/environment/cobra-canyon-visual-contract-v1";
    public const string EnvironmentResourcesPath = "GunsOnly/CobraVietnam/environment";
    public const string ExpectedContractId = "visual-contract.cobra-vietnam.cobra-canyon.v1";
    public const string ExpectedSchemaVersion = "1.0.0";

    static readonly string[] RequiredRawKeys = {
        "schemaVersion", "contractId", "parity", "target", "referenceRenderer",
        "qualityTier", "worldUri", "rule", "coordinateSystem", "name", "handedness", "unit",
        "authorityAxes", "rendererPositionMappings", "cameraConvention", "height",
        "eulerOrder", "yawZeroForward", "yawPositiveTurns", "pitchPositiveTurns", "forwardWorld", "upWorld",
        "rendererForwardMappings", "colourEncoding", "hexValues", "paletteLinearRgb",
        "pngTextures", "lightingAndBlending", "transparentReferenceCompositing", "stage",
        "blend", "unityAdapter", "compensatedRoles", "compensationRule",
        "minimumCompensatedAlpha", "subByteLinearRoles", "unityProjectColorSpace",
        "unityLightsUseLinearIntensity", "lighting", "sunDirectionAuthority",
        "rendererDirectionMappings", "sunColorHex", "sunIntensity",
        "hemisphereSkyColorHex", "hemisphereGroundColorHex", "hemisphereIntensity",
        "fogColorHex", "fogModel", "fogDensityPerM", "transmittanceAtReadableRadius",
        "readableRadiusM", "shadowFloor", "outputTransform", "toneMapping", "exposure",
        "outputColorSpace", "sky", "zenithLinearRgb", "horizonLinearRgb",
        "belowHorizonLinearRgb", "skyCurveExponent", "horizonShoulderFalloff",
        "horizonShoulderWeight", "cloudLinearRgb", "cloudShelf", "terrainMaterial",
        "toneRampGates", "occlusionRange", "concavityNormalizerM", "reliefGain",
        "cloudShadowStrength", "microNormalStrength", "skyFillLinearRgb",
        "sunKeyLinearRgb", "slopeFaceWindow", "elevationBandsM", "parcelPitchM",
        "valleyFloor", "cultivation", "jungle",
        "laterite", "ridge", "rimRock", "deepWater", "shallowWater", "groundMacro",
        "uri", "sizePx", "rendererSamplerMappings", "wrapMode", "worldProjection",
        "canonicalAxes", "rotationConvention", "macroSample", "repeatM", "phase",
        "nearSample", "rotationRowMajor2x2", "triplanarWeightExponent", "planes",
        "phaseByPlane", "horizontal", "eastFacing", "northSouthFacing", "foliageAtlas",
        "alphaCutoff", "regionConvention", "tuple", "imagePixelOrigin", "uvOrigin",
        "uDirection", "vDirection", "importRule", "cardUvMapping", "physicalBottom",
        "physicalTop", "rendererCardUvMappings", "regions", "palm", "hardwood",
        "bambooBanana", "fernScrub", "visualExtentTargetsM", "ambientCanopy",
        "setPieceCanopy", "ambientUnderstory", "setPieceUnderstory", "width", "depth",
        "acceptanceProjection", "projection", "verticalFovDeg", "aspect", "nearClipM",
        "farClipM", "unityPosition", "unityForward", "unityUp", "unityProjectionXSign",
        "unityInvertCulling", "acceptanceViews", "eastM",
        "northM", "aglM", "yawRad", "pitchRad", "ecology", "ambientCluster",
        "probability", "groupSize", "jitterShape", "jitterPerAxisM", "setPiecePolicy",
        "heroSilhouettes", "ironBellBridge", "collisionDeckHeightM",
        "presentationTotalHeightM",
    };

    [SerializeField] string schemaVersion;
    [SerializeField] string contractId;
    [SerializeField] ParitySpec parity;
    [SerializeField] CoordinateSystemSpec coordinateSystem;
    [SerializeField] CameraConventionSpec cameraConvention;
    [SerializeField] ColourEncodingSpec colourEncoding;
    [SerializeField] LightingSpec lighting;
    [SerializeField] OutputTransformSpec outputTransform;
    [SerializeField] SkySpec sky;
    [SerializeField] TerrainMaterialSpec terrainMaterial;
    [SerializeField] PaletteSpec paletteLinearRgb;
    [SerializeField] GroundMacroSpec groundMacro;
    [SerializeField] FoliageAtlasSpec foliageAtlas;
    [SerializeField] AcceptanceProjectionSpec acceptanceProjection;
    [SerializeField] AcceptanceViewSpec[] acceptanceViews;

    public string SchemaVersion => schemaVersion;
    public string ContractId => contractId;
    public ParitySpec Parity => parity;
    public CoordinateSystemSpec CoordinateSystem => coordinateSystem;
    public CameraConventionSpec CameraConvention => cameraConvention;
    public ColourEncodingSpec ColourEncoding => colourEncoding;
    public LightingSpec Lighting => lighting;
    public OutputTransformSpec OutputTransform => outputTransform;
    public SkySpec Sky => sky;
    public TerrainMaterialSpec TerrainMaterial => terrainMaterial;
    public PaletteSpec Palette => paletteLinearRgb;
    public GroundMacroSpec GroundMacro => groundMacro;
    public FoliageAtlasSpec FoliageAtlas => foliageAtlas;
    public AcceptanceProjectionSpec AcceptanceProjection => acceptanceProjection;
    public AcceptanceViewSpec[] AcceptanceViews =>
        acceptanceViews == null ? Array.Empty<AcceptanceViewSpec>()
            : (AcceptanceViewSpec[])acceptanceViews.Clone();

    public static CobraVisualContract LoadOrThrow() {
        var asset = Resources.Load<TextAsset>(ResourcesPath);
        if (asset == null) {
            throw new InvalidOperationException(
                $"Cobra visual contract is missing. Expected a TextAsset at " +
                $"Assets/Resources/{ResourcesPath}.json (Resources path '{ResourcesPath}').");
        }
        return ParseOrThrow(asset.text, "Resources/" + ResourcesPath);
    }

    public static bool TryLoad(out CobraVisualContract contract, out string error) {
        try {
            contract = LoadOrThrow();
            error = null;
            return true;
        }
        catch (Exception ex) {
            contract = null;
            error = ex.Message;
            return false;
        }
    }

    /// <summary>Public for edit-mode tests and non-Resources validation.</summary>
    public static CobraVisualContract ParseOrThrow(string json, string source = "JSON") {
        if (string.IsNullOrWhiteSpace(json))
            throw new InvalidOperationException($"Cobra visual contract at {source} is empty.");

        RequireRawKeys(json, source);

        CobraVisualContract value;
        try {
            value = JsonUtility.FromJson<CobraVisualContract>(json);
        }
        catch (Exception ex) {
            throw new InvalidOperationException(
                $"Cobra visual contract at {source} is not valid JsonUtility JSON: {ex.Message}", ex);
        }
        if (value == null)
            throw new InvalidOperationException(
                $"Cobra visual contract at {source} deserialized to null.");

        value.ValidateOrThrow(source);
        return value;
    }

    public void ValidateOrThrow(string source = "contract") {
        var errors = new List<string>();

        Exact(errors, "schemaVersion", schemaVersion, ExpectedSchemaVersion);
        Exact(errors, "contractId", contractId, ExpectedContractId);

        if (parity == null) errors.Add("parity is missing");
        else parity.Validate(errors);

        if (coordinateSystem == null) errors.Add("coordinateSystem is missing");
        else coordinateSystem.Validate(errors);

        if (cameraConvention == null) errors.Add("cameraConvention is missing");
        else cameraConvention.Validate(errors);

        if (colourEncoding == null) errors.Add("colourEncoding is missing");
        else colourEncoding.Validate(errors);

        if (lighting == null) errors.Add("lighting is missing");
        else lighting.Validate(errors);

        if (outputTransform == null) errors.Add("outputTransform is missing");
        else outputTransform.Validate(errors);

        if (sky == null) errors.Add("sky is missing");
        else sky.Validate(errors);

        if (terrainMaterial == null) errors.Add("terrainMaterial is missing");
        else terrainMaterial.Validate(errors);

        if (paletteLinearRgb == null) errors.Add("paletteLinearRgb is missing");
        else paletteLinearRgb.Validate(errors);

        if (groundMacro == null) errors.Add("groundMacro is missing");
        else groundMacro.Validate(errors);

        if (foliageAtlas == null) errors.Add("foliageAtlas is missing");
        else foliageAtlas.Validate(errors);

        if (acceptanceProjection == null) errors.Add("acceptanceProjection is missing");
        else acceptanceProjection.Validate(errors);

        if (acceptanceViews == null || acceptanceViews.Length == 0) {
            errors.Add("acceptanceViews must contain at least one view");
        } else {
            for (int i = 0; i < acceptanceViews.Length; i++) {
                if (acceptanceViews[i] == null)
                    errors.Add($"acceptanceViews[{i}] is null");
                else
                    acceptanceViews[i].Validate(errors, i);
            }
        }

        if (errors.Count > 0) {
            throw new InvalidOperationException(
                $"Invalid Cobra visual contract at {source}:\n - " + string.Join("\n - ", errors));
        }
    }

    public static Vector3 AuthorityToUnityPosition(float eastM, float upM, float northM) =>
        new(eastM, upM, -northM);

    public static Vector3 AuthorityToUnityPosition(Vector3 eastUpNorthM) =>
        AuthorityToUnityPosition(eastUpNorthM.x, eastUpNorthM.y, eastUpNorthM.z);

    public static Vector3 AuthorityToUnityDirection(float east, float up, float north) =>
        new(east, up, -north);

    public static Vector3 AuthorityToUnityDirection(Vector3 eastUpNorth) =>
        AuthorityToUnityDirection(eastUpNorth.x, eastUpNorth.y, eastUpNorth.z);

    /// <summary>
    /// Reproduce Three.js Euler(pitch,yaw,0,"YXZ") local -Z in Unity coordinates.
    /// </summary>
    public static Vector3 CameraForwardToUnity(float yawRad, float pitchRad) {
        float cosPitch = Mathf.Cos(pitchRad);
        return new Vector3(
            -Mathf.Sin(yawRad) * cosPitch,
            Mathf.Sin(pitchRad),
            -Mathf.Cos(yawRad) * cosPitch).normalized;
    }

    /// <summary>Reproduce the Three.js camera local +Y vector in Unity coordinates.</summary>
    public static Vector3 CameraUpToUnity(float yawRad, float pitchRad) =>
        new Vector3(
            Mathf.Sin(yawRad) * Mathf.Sin(pitchRad),
            Mathf.Cos(pitchRad),
            Mathf.Cos(yawRad) * Mathf.Sin(pitchRad)).normalized;

    /// <summary>Convert authored top-left UV coordinates to Unity's bottom-left sampler.</summary>
    public static Vector2 AuthoredUvToUnity(Vector2 authoredUv) =>
        new(authoredUv.x, 1f - authoredUv.y);

    /// <summary>Convert [uMin,vMin,uMax,vMax] from authored top-left space to Unity UV space.</summary>
    public static Vector4 AuthoredRegionToUnity(Vector4 authoredRegion) =>
        new(authoredRegion.x, 1f - authoredRegion.w, authoredRegion.z, 1f - authoredRegion.y);

    /// <summary>Parse #RRGGBB or #RRGGBBAA sRGB and return a linear-sRGB Unity color.</summary>
    public static Color SrgbHexToLinear(string hex) => ParseSrgbHexToLinear(hex, "hex color");

    public static string ResourcePathForUri(string relativeUri) {
        if (string.IsNullOrWhiteSpace(relativeUri))
            throw new ArgumentException("Resource URI is empty.", nameof(relativeUri));
        if (relativeUri.StartsWith("/", StringComparison.Ordinal) ||
            relativeUri.Contains("..", StringComparison.Ordinal)) {
            throw new ArgumentException(
                $"Resource URI must be relative to {EnvironmentResourcesPath}: '{relativeUri}'.",
                nameof(relativeUri));
        }
        int extension = relativeUri.LastIndexOf('.');
        string withoutExtension = extension > relativeUri.LastIndexOf('/')
            ? relativeUri.Substring(0, extension)
            : relativeUri;
        return EnvironmentResourcesPath + "/" + withoutExtension;
    }

    static void RequireRawKeys(string json, string source) {
        var missing = new List<string>();
        foreach (string key in RequiredRawKeys) {
            if (!HasJsonKey(json, key)) missing.Add(key);
        }
        if (missing.Count > 0) {
            throw new InvalidOperationException(
                $"Cobra visual contract at {source} is missing required JSON key(s) before " +
                $"deserialization: {string.Join(", ", missing)}.");
        }
    }

    // JsonUtility maps a missing primitive to false/zero. Scan the source first so those
    // defaults cannot make an incomplete contract look valid.
    static bool HasJsonKey(string json, string key) {
        string token = "\"" + key + "\"";
        int start = 0;
        while (start < json.Length) {
            int found = json.IndexOf(token, start, StringComparison.Ordinal);
            if (found < 0) return false;
            int cursor = found + token.Length;
            while (cursor < json.Length && char.IsWhiteSpace(json[cursor])) cursor++;
            if (cursor < json.Length && json[cursor] == ':') return true;
            start = found + token.Length;
        }
        return false;
    }

    static Color ParseSrgbHexToLinear(string hex, string field) {
        if (string.IsNullOrEmpty(hex) ||
            (hex.Length != 7 && hex.Length != 9) ||
            hex[0] != '#' ||
            !ColorUtility.TryParseHtmlString(hex, out Color srgb)) {
            throw new ArgumentException(
                $"{field} must be #RRGGBB or #RRGGBBAA sRGB; got '{hex ?? "<null>"}'.",
                nameof(hex));
        }
        return new Color(
            Mathf.GammaToLinearSpace(srgb.r),
            Mathf.GammaToLinearSpace(srgb.g),
            Mathf.GammaToLinearSpace(srgb.b),
            srgb.a);
    }

    static Color LinearColor(float[] rgb, string field) {
        if (!ValidArray(rgb, 3, 0f, 1f))
            throw new InvalidOperationException($"{field} must contain three finite linear RGB values in [0,1].");
        return new Color(rgb[0], rgb[1], rgb[2], 1f);
    }

    static Color LinearHdrColor(float[] rgb, string field) {
        if (!ValidArray(rgb, 3, 0f, 16f))
            throw new InvalidOperationException(
                $"{field} must contain three finite non-negative linear RGB values.");
        return new Color(rgb[0], rgb[1], rgb[2], 1f);
    }

    static Vector2 Vec2(float[] values, string field) {
        if (!ValidArray(values, 2))
            throw new InvalidOperationException($"{field} must contain two finite values.");
        return new Vector2(values[0], values[1]);
    }

    static Vector3 Vec3(float[] values, string field) {
        if (!ValidArray(values, 3))
            throw new InvalidOperationException($"{field} must contain three finite values.");
        return new Vector3(values[0], values[1], values[2]);
    }

    static Vector4 Vec4(float[] values, string field) {
        if (!ValidArray(values, 4))
            throw new InvalidOperationException($"{field} must contain four finite values.");
        return new Vector4(values[0], values[1], values[2], values[3]);
    }

    static Vector2Int Size(float[] values, string field) {
        if (!ValidArray(values, 2, 1f, 65536f) ||
            values[0] != Mathf.Round(values[0]) || values[1] != Mathf.Round(values[1])) {
            throw new InvalidOperationException($"{field} must contain two positive integer dimensions.");
        }
        return new Vector2Int((int)values[0], (int)values[1]);
    }

    static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);

    static bool ValidArray(float[] values, int count, float min = float.NegativeInfinity,
        float max = float.PositiveInfinity) {
        if (values == null || values.Length != count) return false;
        for (int i = 0; i < values.Length; i++) {
            if (!Finite(values[i]) || values[i] < min || values[i] > max) return false;
        }
        return true;
    }

    static bool ValidRange(float[] values) =>
        ValidArray(values, 2) && values[0] > 0f && values[1] >= values[0];

    static bool StrictlyIncreasing(float[] values) {
        if (values == null || values.Length == 0) return false;
        for (int i = 1; i < values.Length; i++) {
            if (values[i] <= values[i - 1]) return false;
        }
        return true;
    }

    static void Exact(List<string> errors, string field, string actual, string expected) {
        if (!string.Equals(actual, expected, StringComparison.Ordinal))
            errors.Add($"{field} must be '{expected}', got '{actual ?? "<null>"}'");
    }

    static void CompactExact(List<string> errors, string field, string actual, string expected) {
        if (!string.Equals(Compact(actual), Compact(expected), StringComparison.Ordinal))
            errors.Add($"{field} has the wrong convention; expected '{expected}', got '{actual ?? "<null>"}'");
    }

    static string Compact(string value) {
        if (value == null) return null;
        var chars = new char[value.Length];
        int count = 0;
        for (int i = 0; i < value.Length; i++) {
            if (!char.IsWhiteSpace(value[i])) chars[count++] = value[i];
        }
        return new string(chars, 0, count);
    }

    static void Positive(List<string> errors, string field, float value) {
        if (!Finite(value) || value <= 0f) errors.Add($"{field} must be finite and > 0, got {value}");
    }

    static void NonNegative(List<string> errors, string field, float value) {
        if (!Finite(value) || value < 0f) errors.Add($"{field} must be finite and >= 0, got {value}");
    }

    static void UnitInterval(List<string> errors, string field, float value) {
        if (!Finite(value) || value < 0f || value > 1f)
            errors.Add($"{field} must be finite and in [0,1], got {value}");
    }

    [Serializable]
    public sealed class ParitySpec {
        [SerializeField] string target;
        [SerializeField] string referenceRenderer;
        [SerializeField] string qualityTier;
        [SerializeField] string worldUri;
        [SerializeField] string rule;

        public string Target => target;
        public string ReferenceRenderer => referenceRenderer;
        public string QualityTier => qualityTier;
        public string WorldUri => worldUri;
        public string WorldResourcesPath => ResourcePathForUri(worldUri);
        public string Rule => rule;

        internal void Validate(List<string> errors) {
            Exact(errors, "parity.target", target, "fixed-camera scene parity");
            Exact(errors, "parity.referenceRenderer", referenceRenderer, "web-build-299");
            Exact(errors, "parity.qualityTier", qualityTier, "desktop");
            Exact(errors, "parity.worldUri", worldUri, "cobra-canyon.world.json");
            Exact(errors, "parity.rule", rule,
                "Unity and Web consume the same world, camera, lighting, material, atlas, scale and HUD hierarchy values; renderer adapters may only translate API and axis conventions");
        }
    }

    [Serializable]
    public sealed class CoordinateSystemSpec {
        [SerializeField] string name;
        [SerializeField] string handedness;
        [SerializeField] string unit;
        [SerializeField] AxisSpec authorityAxes;
        [SerializeField] RendererStringMappings rendererPositionMappings;

        public RendererStringMappings RendererPositionMappings => rendererPositionMappings;

        internal void Validate(List<string> errors) {
            Exact(errors, "coordinateSystem.name", name, "east-up-north-metres");
            Exact(errors, "coordinateSystem.handedness", handedness, "left-handed");
            Exact(errors, "coordinateSystem.unit", unit, "metre");
            if (authorityAxes == null) errors.Add("coordinateSystem.authorityAxes is missing");
            else authorityAxes.Validate(errors);
            if (rendererPositionMappings == null) {
                errors.Add("coordinateSystem.rendererPositionMappings is missing");
            } else {
                rendererPositionMappings.ValidateCompact(errors,
                    "coordinateSystem.rendererPositionMappings", "[eastM,upM,-northM]");
            }
        }
    }

    [Serializable]
    public sealed class AxisSpec {
        [SerializeField] string x;
        [SerializeField] string y;
        [SerializeField] string z;

        internal void Validate(List<string> errors) {
            Exact(errors, "coordinateSystem.authorityAxes.x", x, "east");
            Exact(errors, "coordinateSystem.authorityAxes.y", y, "up");
            Exact(errors, "coordinateSystem.authorityAxes.z", z, "north");
        }
    }

    [Serializable]
    public sealed class CameraConventionSpec {
        [SerializeField] string eulerOrder;
        [SerializeField] string height;
        [SerializeField] string yawZeroForward;
        [SerializeField] string yawPositiveTurns;
        [SerializeField] string pitchPositiveTurns;
        [SerializeField] string forwardWorld;
        [SerializeField] string upWorld;
        [SerializeField] RendererStringMappings rendererForwardMappings;

        public RendererStringMappings RendererForwardMappings => rendererForwardMappings;

        internal void Validate(List<string> errors) {
            Exact(errors, "cameraConvention.eulerOrder", eulerOrder, "YXZ");
            CompactExact(errors, "cameraConvention.height", height,
                "terrainHeightM(eastM,northM)+aglM");
            Exact(errors, "cameraConvention.yawZeroForward", yawZeroForward, "+north");
            Exact(errors, "cameraConvention.yawPositiveTurns", yawPositiveTurns, "toward-west");
            Exact(errors, "cameraConvention.pitchPositiveTurns", pitchPositiveTurns, "toward-up");
            CompactExact(errors, "cameraConvention.forwardWorld", forwardWorld,
                "[-sin(yawRad)*cos(pitchRad),sin(pitchRad),cos(yawRad)*cos(pitchRad)]as[east,up,north]");
            CompactExact(errors, "cameraConvention.upWorld", upWorld,
                "[sin(yawRad)*sin(pitchRad),cos(pitchRad),-cos(yawRad)*sin(pitchRad)]as[east,up,north]");
            if (rendererForwardMappings == null) {
                errors.Add("cameraConvention.rendererForwardMappings is missing");
            } else {
                rendererForwardMappings.ValidateCompact(errors,
                    "cameraConvention.rendererForwardMappings", "[east,up,-north]");
            }
        }
    }

    [Serializable]
    public sealed class ColourEncodingSpec {
        [SerializeField] string hexValues;
        [SerializeField] string paletteLinearRgb;
        [SerializeField] string pngTextures;
        [SerializeField] string lightingAndBlending;
        [SerializeField] TransparentReferenceCompositingSpec transparentReferenceCompositing;
        [SerializeField] string unityProjectColorSpace;
        [SerializeField] bool unityLightsUseLinearIntensity;

        public TransparentReferenceCompositingSpec TransparentReferenceCompositing =>
            transparentReferenceCompositing;
        public bool UnityLightsUseLinearIntensity => unityLightsUseLinearIntensity;

        internal void Validate(List<string> errors) {
            Exact(errors, "colourEncoding.hexValues", hexValues, "sRGB");
            Exact(errors, "colourEncoding.paletteLinearRgb", paletteLinearRgb, "linear-sRGB");
            Exact(errors, "colourEncoding.pngTextures", pngTextures, "sRGB");
            Exact(errors, "colourEncoding.lightingAndBlending", lightingAndBlending, "linear");
            if (transparentReferenceCompositing == null) {
                errors.Add("colourEncoding.transparentReferenceCompositing is missing");
            } else {
                transparentReferenceCompositing.Validate(errors);
            }
            Exact(errors, "colourEncoding.unityProjectColorSpace", unityProjectColorSpace, "Linear");
            if (!unityLightsUseLinearIntensity)
                errors.Add("colourEncoding.unityLightsUseLinearIntensity must be true");
        }
    }

    [Serializable]
    public sealed class TransparentReferenceCompositingSpec {
        [SerializeField] string stage;
        [SerializeField] string blend;
        [SerializeField] string unityAdapter;
        [SerializeField] string[] compensatedRoles;
        [SerializeField] string compensationRule;
        [SerializeField] float minimumCompensatedAlpha;
        [SerializeField] string[] subByteLinearRoles;

        public string Stage => stage;
        public string Blend => blend;
        public string UnityAdapter => unityAdapter;
        public string[] CompensatedRoles => compensatedRoles == null
            ? Array.Empty<string>() : (string[])compensatedRoles.Clone();
        public string CompensationRule => compensationRule;
        public float MinimumCompensatedAlpha => minimumCompensatedAlpha;
        public string[] SubByteLinearRoles => subByteLinearRoles == null
            ? Array.Empty<string>() : (string[])subByteLinearRoles.Clone();

        internal void Validate(List<string> errors) {
            const string field = "colourEncoding.transparentReferenceCompositing";
            Exact(errors, field + ".stage", stage,
                "after per-object ACESFilm tone mapping, sRGB output encoding and scene fog");
            Exact(errors, field + ".blend", blend, "source-over in sRGB code values");
            Exact(errors, field + ".unityAdapter", unityAdapter,
                "destination-aware source reconstruction before linear framebuffer source-over");
            Exact(errors, field + ".compensationRule", compensationRule, "effectiveAlpha>0.006");
            if (compensatedRoles == null || compensatedRoles.Length != 2
                || compensatedRoles[0] != "mist" || compensatedRoles[1] != "transparent-core") {
                errors.Add(field + ".compensatedRoles must be ['mist','transparent-core']");
            }
            if (!Finite(minimumCompensatedAlpha)
                || Mathf.Abs(minimumCompensatedAlpha - 0.006f) > 0.000001f) {
                errors.Add(field + ".minimumCompensatedAlpha must be 0.006");
            }
            if (subByteLinearRoles == null || subByteLinearRoles.Length != 1
                || subByteLinearRoles[0] != "waterAccent") {
                errors.Add(field + ".subByteLinearRoles must be ['waterAccent']");
            }
        }
    }

    [Serializable]
    public sealed class RendererStringMappings {
        [SerializeField] string threeJs;
        [SerializeField] string unity;

        public string ThreeJs => threeJs;
        public string Unity => unity;

        internal void ValidateCompact(List<string> errors, string field, string expected) {
            CompactExact(errors, field + ".threeJs", threeJs, expected);
            CompactExact(errors, field + ".unity", unity, expected);
        }
    }

    [Serializable]
    public sealed class LightingSpec {
        [SerializeField] float[] sunDirectionAuthority;
        [SerializeField] string sunDirectionMeaning;
        [SerializeField] RendererStringMappings rendererDirectionMappings;
        [SerializeField] string sunColorHex;
        [SerializeField] float sunIntensity;
        [SerializeField] string hemisphereSkyColorHex;
        [SerializeField] string hemisphereGroundColorHex;
        [SerializeField] float hemisphereIntensity;
        [SerializeField] string fogColorHex;
        [SerializeField] string fogModel;
        [SerializeField] float fogDensityPerM;
        [SerializeField] float transmittanceAtReadableRadius;
        [SerializeField] float readableRadiusM;
        [SerializeField] float shadowFloor;

        public Vector3 SunDirectionAuthority => Vec3(sunDirectionAuthority, "lighting.sunDirectionAuthority");
        public Vector3 SunDirectionUnity => AuthorityToUnityDirection(SunDirectionAuthority).normalized;
        public Color SunColorLinear => ParseSrgbHexToLinear(sunColorHex, "lighting.sunColorHex");
        public float SunIntensity => sunIntensity;
        public Color HemisphereSkyColorLinear =>
            ParseSrgbHexToLinear(hemisphereSkyColorHex, "lighting.hemisphereSkyColorHex");
        public Color HemisphereGroundColorLinear =>
            ParseSrgbHexToLinear(hemisphereGroundColorHex, "lighting.hemisphereGroundColorHex");
        public float HemisphereIntensity => hemisphereIntensity;
        public Color FogColorLinear => ParseSrgbHexToLinear(fogColorHex, "lighting.fogColorHex");
        public string FogModel => fogModel;
        public float FogDensityPerM => fogDensityPerM;
        public float TransmittanceAtReadableRadius => transmittanceAtReadableRadius;
        public float ReadableRadiusM => readableRadiusM;
        public float ShadowFloor => shadowFloor;

        internal void Validate(List<string> errors) {
            if (!ValidArray(sunDirectionAuthority, 3)) {
                errors.Add("lighting.sunDirectionAuthority must contain three finite values");
            } else {
                float magnitude = Vec3(sunDirectionAuthority, "lighting.sunDirectionAuthority").magnitude;
                if (Mathf.Abs(magnitude - 1f) > 0.01f)
                    errors.Add($"lighting.sunDirectionAuthority must be unit length, got {magnitude}");
            }
            CompactExact(errors, "lighting.sunDirectionMeaning", sunDirectionMeaning,
                "unit vector from a shaded surface toward the sun as [east,up,north] in authority axes");
            if (rendererDirectionMappings == null) {
                errors.Add("lighting.rendererDirectionMappings is missing");
            } else {
                rendererDirectionMappings.ValidateCompact(errors,
                    "lighting.rendererDirectionMappings", "[east,up,-north]");
            }
            ValidateHex(errors, "lighting.sunColorHex", sunColorHex);
            ValidateHex(errors, "lighting.hemisphereSkyColorHex", hemisphereSkyColorHex);
            ValidateHex(errors, "lighting.hemisphereGroundColorHex", hemisphereGroundColorHex);
            ValidateHex(errors, "lighting.fogColorHex", fogColorHex);
            Positive(errors, "lighting.sunIntensity", sunIntensity);
            Positive(errors, "lighting.hemisphereIntensity", hemisphereIntensity);
            Exact(errors, "lighting.fogModel", fogModel, "exp2");
            Positive(errors, "lighting.fogDensityPerM", fogDensityPerM);
            UnitInterval(errors, "lighting.transmittanceAtReadableRadius", transmittanceAtReadableRadius);
            Positive(errors, "lighting.readableRadiusM", readableRadiusM);
            UnitInterval(errors, "lighting.shadowFloor", shadowFloor);
        }
    }

    [Serializable]
    public sealed class OutputTransformSpec {
        [SerializeField] string toneMapping;
        [SerializeField] float exposure;
        [SerializeField] string outputColorSpace;

        public string ToneMapping => toneMapping;
        public float Exposure => exposure;
        public string OutputColorSpace => outputColorSpace;

        internal void Validate(List<string> errors) {
            Exact(errors, "outputTransform.toneMapping", toneMapping, "ACESFilm");
            Positive(errors, "outputTransform.exposure", exposure);
            Exact(errors, "outputTransform.outputColorSpace", outputColorSpace, "sRGB");
        }
    }

    [Serializable]
    public sealed class SkySpec {
        [SerializeField] float[] zenithLinearRgb;
        [SerializeField] float[] horizonLinearRgb;
        [SerializeField] float[] belowHorizonLinearRgb;
        [SerializeField] float skyCurveExponent;
        [SerializeField] float horizonShoulderFalloff;
        [SerializeField] float horizonShoulderWeight;
        [SerializeField] float[] cloudLinearRgb;
        [SerializeField] float[] cloudShelf;

        public Color Zenith => LinearColor(zenithLinearRgb, "sky.zenithLinearRgb");
        public Color Horizon => LinearColor(horizonLinearRgb, "sky.horizonLinearRgb");
        public Color BelowHorizon =>
            LinearColor(belowHorizonLinearRgb, "sky.belowHorizonLinearRgb");
        public float SkyCurveExponent => skyCurveExponent;
        public float HorizonShoulderFalloff => horizonShoulderFalloff;
        public float HorizonShoulderWeight => horizonShoulderWeight;
        public Color Cloud => LinearColor(cloudLinearRgb, "sky.cloudLinearRgb");
        public Vector2 CloudShelf => Vec2(cloudShelf, "sky.cloudShelf");

        internal void Validate(List<string> errors) {
            ValidateLinearRgb(errors, "sky.zenithLinearRgb", zenithLinearRgb);
            ValidateLinearRgb(errors, "sky.horizonLinearRgb", horizonLinearRgb);
            ValidateLinearRgb(errors, "sky.belowHorizonLinearRgb", belowHorizonLinearRgb);
            Positive(errors, "sky.skyCurveExponent", skyCurveExponent);
            Positive(errors, "sky.horizonShoulderFalloff", horizonShoulderFalloff);
            UnitInterval(errors, "sky.horizonShoulderWeight", horizonShoulderWeight);
            ValidateLinearRgb(errors, "sky.cloudLinearRgb", cloudLinearRgb);
            if (!ValidArray(cloudShelf, 2, 0f, 1f) || cloudShelf[0] >= cloudShelf[1])
                errors.Add("sky.cloudShelf must be an increasing two-value range in [0,1]");
        }
    }

    [Serializable]
    public sealed class TerrainMaterialSpec {
        [SerializeField] float[] toneRampGates;
        [SerializeField] float[] occlusionRange;
        [SerializeField] float concavityNormalizerM;
        [SerializeField] float reliefGain;
        [SerializeField] float cloudShadowStrength;
        [SerializeField] float microNormalStrength;
        [SerializeField] float[] skyFillLinearRgb;
        [SerializeField] float[] sunKeyLinearRgb;
        [SerializeField] float[] slopeFaceWindow;
        [SerializeField] float[] elevationBandsM;
        [SerializeField] float[] parcelPitchM;

        public float[] ToneRampGates => (float[])toneRampGates.Clone();
        public Vector2 OcclusionRange => Vec2(occlusionRange, "terrainMaterial.occlusionRange");
        public float ConcavityNormalizerM => concavityNormalizerM;
        public float ReliefGain => reliefGain;
        public float CloudShadowStrength => cloudShadowStrength;
        public float MicroNormalStrength => microNormalStrength;
        public Color SkyFill => LinearHdrColor(skyFillLinearRgb, "terrainMaterial.skyFillLinearRgb");
        public Color SunKey => LinearHdrColor(sunKeyLinearRgb, "terrainMaterial.sunKeyLinearRgb");
        public Vector2 SlopeFaceWindow => Vec2(slopeFaceWindow, "terrainMaterial.slopeFaceWindow");
        public float[] ElevationBandsM => (float[])elevationBandsM.Clone();
        public Vector2 ParcelPitchM => Vec2(parcelPitchM, "terrainMaterial.parcelPitchM");

        internal void Validate(List<string> errors) {
            if (!ValidArray(toneRampGates, 6, 0f, 1f))
                errors.Add("terrainMaterial.toneRampGates must contain six finite values in [0,1]");
            if (!ValidArray(occlusionRange, 2, 0f) || occlusionRange[0] > occlusionRange[1])
                errors.Add("terrainMaterial.occlusionRange must be an increasing non-negative range");
            Positive(errors, "terrainMaterial.concavityNormalizerM", concavityNormalizerM);
            NonNegative(errors, "terrainMaterial.reliefGain", reliefGain);
            UnitInterval(errors, "terrainMaterial.cloudShadowStrength", cloudShadowStrength);
            UnitInterval(errors, "terrainMaterial.microNormalStrength", microNormalStrength);
            ValidateLinearHdrRgb(errors, "terrainMaterial.skyFillLinearRgb", skyFillLinearRgb);
            ValidateLinearHdrRgb(errors, "terrainMaterial.sunKeyLinearRgb", sunKeyLinearRgb);
            if (!ValidArray(slopeFaceWindow, 2, 0f, 1f) || slopeFaceWindow[0] >= slopeFaceWindow[1])
                errors.Add("terrainMaterial.slopeFaceWindow must be an increasing range in [0,1]");
            if (!ValidArray(elevationBandsM, 4, 0f) || !StrictlyIncreasing(elevationBandsM))
                errors.Add("terrainMaterial.elevationBandsM must contain four increasing non-negative values");
            if (!ValidArray(parcelPitchM, 2, 0f) || parcelPitchM[0] <= 0f || parcelPitchM[1] <= 0f)
                errors.Add("terrainMaterial.parcelPitchM must contain two positive finite values");
        }
    }

    [Serializable]
    public sealed class PaletteSpec {
        [SerializeField] float[] valleyFloor;
        [SerializeField] float[] cultivation;
        [SerializeField] float[] jungle;
        [SerializeField] float[] laterite;
        [SerializeField] float[] ridge;
        [SerializeField] float[] rimRock;
        [SerializeField] float[] deepWater;
        [SerializeField] float[] shallowWater;

        public Color ValleyFloor => LinearColor(valleyFloor, "paletteLinearRgb.valleyFloor");
        public Color Cultivation => LinearColor(cultivation, "paletteLinearRgb.cultivation");
        public Color Jungle => LinearColor(jungle, "paletteLinearRgb.jungle");
        public Color Laterite => LinearColor(laterite, "paletteLinearRgb.laterite");
        public Color Ridge => LinearColor(ridge, "paletteLinearRgb.ridge");
        public Color RimRock => LinearColor(rimRock, "paletteLinearRgb.rimRock");
        public Color DeepWater => LinearColor(deepWater, "paletteLinearRgb.deepWater");
        public Color ShallowWater => LinearColor(shallowWater, "paletteLinearRgb.shallowWater");

        internal void Validate(List<string> errors) {
            ValidateLinearRgb(errors, "paletteLinearRgb.valleyFloor", valleyFloor);
            ValidateLinearRgb(errors, "paletteLinearRgb.cultivation", cultivation);
            ValidateLinearRgb(errors, "paletteLinearRgb.jungle", jungle);
            ValidateLinearRgb(errors, "paletteLinearRgb.laterite", laterite);
            ValidateLinearRgb(errors, "paletteLinearRgb.ridge", ridge);
            ValidateLinearRgb(errors, "paletteLinearRgb.rimRock", rimRock);
            ValidateLinearRgb(errors, "paletteLinearRgb.deepWater", deepWater);
            ValidateLinearRgb(errors, "paletteLinearRgb.shallowWater", shallowWater);
        }
    }

    [Serializable]
    public sealed class GroundMacroSpec {
        [SerializeField] string uri;
        [SerializeField] float[] sizePx;
        [SerializeField] RendererSamplerMappingsSpec rendererSamplerMappings;
        [SerializeField] string wrapMode;
        [SerializeField] WorldProjectionSpec worldProjection;
        [SerializeField] MacroSampleSpec macroSample;
        [SerializeField] NearSampleSpec nearSample;
        [SerializeField] string nearProjection;
        [SerializeField] string role;

        public string Uri => uri;
        public string TextureResourcesPath => ResourcePathForUri(uri);
        public Vector2Int SizePx => Size(sizePx, "groundMacro.sizePx");
        public RendererSamplerMappingsSpec RendererSamplerMappings => rendererSamplerMappings;
        public string WrapMode => wrapMode;
        public WorldProjectionSpec WorldProjection => worldProjection;
        public MacroSampleSpec MacroSample => macroSample;
        public NearSampleSpec NearSample => nearSample;

        internal void Validate(List<string> errors) {
            Exact(errors, "groundMacro.uri", uri, "textures/cobra-ground-macro-painted-v1.png");
            ValidateSize(errors, "groundMacro.sizePx", sizePx);
            if (rendererSamplerMappings == null) errors.Add("groundMacro.rendererSamplerMappings is missing");
            else rendererSamplerMappings.Validate(errors, "groundMacro.rendererSamplerMappings");
            Exact(errors, "groundMacro.wrapMode", wrapMode, "mirrored-repeat");
            if (worldProjection == null) errors.Add("groundMacro.worldProjection is missing");
            else worldProjection.Validate(errors);
            if (macroSample == null) errors.Add("groundMacro.macroSample is missing");
            else macroSample.Validate(errors);
            if (nearSample == null) errors.Add("groundMacro.nearSample is missing");
            else nearSample.Validate(errors);
            Exact(errors, "groundMacro.nearProjection", nearProjection, "triplanar slope-aware");
            Exact(errors, "groundMacro.role", role, "presentation-only macro albedo; never geometry or authority");
        }
    }

    [Serializable]
    public sealed class RendererSamplerMappingsSpec {
        [SerializeField] string threeJs;
        [SerializeField] string unity;

        public string ThreeJs => threeJs;
        public string Unity => unity;

        internal void Validate(List<string> errors, string field) {
            Exact(errors, field + ".threeJs", threeJs,
                "texture.flipY=false; sample authored [u,v] directly");
            Exact(errors, field + ".unity", unity,
                "standard TextureImporter bottom-left sampler; sample authored [u,1-v]");
        }
    }

    [Serializable]
    public sealed class WorldProjectionSpec {
        [SerializeField] string canonicalAxes;
        [SerializeField] string threeJs;
        [SerializeField] string unity;
        [SerializeField] string rotationConvention;

        public string Unity => unity;

        internal void Validate(List<string> errors) {
            CompactExact(errors, "groundMacro.worldProjection.canonicalAxes", canonicalAxes,
                "[eastM,southM] where southM=-northM");
            CompactExact(errors, "groundMacro.worldProjection.threeJs", threeJs,
                "[worldPosition.x,worldPosition.z]");
            CompactExact(errors, "groundMacro.worldProjection.unity", unity,
                "[worldPosition.x,worldPosition.z]");
            Exact(errors, "groundMacro.worldProjection.rotationConvention", rotationConvention,
                "row-major matrix times a column vector in the canonical east/south plane");
        }
    }

    [Serializable]
    public sealed class MacroSampleSpec {
        [SerializeField] float repeatM;
        [SerializeField] float[] phase;

        public float RepeatM => repeatM;
        public Vector2 Phase => Vec2(phase, "groundMacro.macroSample.phase");

        internal void Validate(List<string> errors) {
            Positive(errors, "groundMacro.macroSample.repeatM", repeatM);
            if (!ValidArray(phase, 2)) errors.Add("groundMacro.macroSample.phase must contain two finite values");
        }
    }

    [Serializable]
    public sealed class NearSampleSpec {
        [SerializeField] float repeatM;
        [SerializeField] float[] rotationRowMajor2x2;
        [SerializeField] float triplanarWeightExponent;
        [SerializeField] TriplanarPlanesSpec planes;
        [SerializeField] PhaseByPlaneSpec phaseByPlane;

        public float RepeatM => repeatM;
        public Vector4 RotationRowMajor2x2 =>
            Vec4(rotationRowMajor2x2, "groundMacro.nearSample.rotationRowMajor2x2");
        public float TriplanarWeightExponent => triplanarWeightExponent;
        public TriplanarPlanesSpec Planes => planes;
        public PhaseByPlaneSpec PhaseByPlane => phaseByPlane;

        internal void Validate(List<string> errors) {
            Positive(errors, "groundMacro.nearSample.repeatM", repeatM);
            if (!ValidArray(rotationRowMajor2x2, 4)) {
                errors.Add("groundMacro.nearSample.rotationRowMajor2x2 must contain four finite values");
            } else {
                float determinant = rotationRowMajor2x2[0] * rotationRowMajor2x2[3]
                    - rotationRowMajor2x2[1] * rotationRowMajor2x2[2];
                if (Mathf.Abs(determinant) < 0.0001f)
                    errors.Add("groundMacro.nearSample.rotationRowMajor2x2 must be invertible");
            }
            Positive(errors, "groundMacro.nearSample.triplanarWeightExponent", triplanarWeightExponent);
            if (planes == null) errors.Add("groundMacro.nearSample.planes is missing");
            else planes.Validate(errors);
            if (phaseByPlane == null) errors.Add("groundMacro.nearSample.phaseByPlane is missing");
            else phaseByPlane.Validate(errors);
        }
    }

    [Serializable]
    public sealed class TriplanarPlanesSpec {
        [SerializeField] string horizontal;
        [SerializeField] string eastFacing;
        [SerializeField] string northSouthFacing;

        public string Horizontal => horizontal;
        public string EastFacing => eastFacing;
        public string NorthSouthFacing => northSouthFacing;

        internal void Validate(List<string> errors) {
            CompactExact(errors, "groundMacro.nearSample.planes.horizontal", horizontal,
                "[eastM,southM] weighted by abs(upNormal)^4");
            CompactExact(errors, "groundMacro.nearSample.planes.eastFacing", eastFacing,
                "[southM,upM] weighted by abs(eastNormal)^4");
            CompactExact(errors, "groundMacro.nearSample.planes.northSouthFacing", northSouthFacing,
                "[eastM,upM] weighted by abs(southNormal)^4");
        }
    }

    [Serializable]
    public sealed class PhaseByPlaneSpec {
        [SerializeField] float[] horizontal;
        [SerializeField] float[] eastFacing;
        [SerializeField] float[] northSouthFacing;

        public Vector2 Horizontal => Vec2(horizontal, "groundMacro.nearSample.phaseByPlane.horizontal");
        public Vector2 EastFacing => Vec2(eastFacing, "groundMacro.nearSample.phaseByPlane.eastFacing");
        public Vector2 NorthSouthFacing =>
            Vec2(northSouthFacing, "groundMacro.nearSample.phaseByPlane.northSouthFacing");

        internal void Validate(List<string> errors) {
            if (!ValidArray(horizontal, 2)) errors.Add("groundMacro.nearSample.phaseByPlane.horizontal must contain two finite values");
            if (!ValidArray(eastFacing, 2)) errors.Add("groundMacro.nearSample.phaseByPlane.eastFacing must contain two finite values");
            if (!ValidArray(northSouthFacing, 2)) errors.Add("groundMacro.nearSample.phaseByPlane.northSouthFacing must contain two finite values");
        }
    }

    [Serializable]
    public sealed class FoliageAtlasSpec {
        [SerializeField] string uri;
        [SerializeField] float[] sizePx;
        [SerializeField] float alphaCutoff;
        [SerializeField] RegionConventionSpec regionConvention;
        [SerializeField] RendererSamplerMappingsSpec rendererSamplerMappings;
        [SerializeField] CardUvMappingSpec cardUvMapping;
        [SerializeField] RendererCardUvMappingsSpec rendererCardUvMappings;
        [SerializeField] FoliageRegionsSpec regions;
        [SerializeField] VisualExtentTargetsSpec visualExtentTargetsM;

        public string Uri => uri;
        public string TextureResourcesPath => ResourcePathForUri(uri);
        public Vector2Int SizePx => Size(sizePx, "foliageAtlas.sizePx");
        public float AlphaCutoff => alphaCutoff;
        public RendererSamplerMappingsSpec RendererSamplerMappings => rendererSamplerMappings;
        public CardUvMappingSpec CardUvMapping => cardUvMapping;
        public RendererCardUvMappingsSpec RendererCardUvMappings => rendererCardUvMappings;
        public FoliageRegionsSpec Regions => regions;
        public VisualExtentTargetsSpec VisualExtentTargetsM => visualExtentTargetsM;

        internal void Validate(List<string> errors) {
            Exact(errors, "foliageAtlas.uri", uri, "foliage/foliage-atlas-painted-v2.png");
            ValidateSize(errors, "foliageAtlas.sizePx", sizePx);
            if (!Finite(alphaCutoff) || alphaCutoff <= 0f || alphaCutoff >= 1f)
                errors.Add($"foliageAtlas.alphaCutoff must be finite and in (0,1), got {alphaCutoff}");
            if (regionConvention == null) errors.Add("foliageAtlas.regionConvention is missing");
            else regionConvention.Validate(errors);
            if (rendererSamplerMappings == null) errors.Add("foliageAtlas.rendererSamplerMappings is missing");
            else rendererSamplerMappings.Validate(errors, "foliageAtlas.rendererSamplerMappings");
            if (cardUvMapping == null) errors.Add("foliageAtlas.cardUvMapping is missing");
            else cardUvMapping.ValidateAuthored(errors);
            if (rendererCardUvMappings == null) errors.Add("foliageAtlas.rendererCardUvMappings is missing");
            else rendererCardUvMappings.Validate(errors);
            if (regions == null) errors.Add("foliageAtlas.regions is missing");
            else regions.Validate(errors);
            if (visualExtentTargetsM == null) errors.Add("foliageAtlas.visualExtentTargetsM is missing");
            else visualExtentTargetsM.Validate(errors);
        }
    }

    [Serializable]
    public sealed class RegionConventionSpec {
        [SerializeField] string tuple;
        [SerializeField] string imagePixelOrigin;
        [SerializeField] string uvOrigin;
        [SerializeField] string uDirection;
        [SerializeField] string vDirection;
        [SerializeField] string importRule;

        internal void Validate(List<string> errors) {
            CompactExact(errors, "foliageAtlas.regionConvention.tuple", tuple, "[uMin,vMin,uMax,vMax]");
            Exact(errors, "foliageAtlas.regionConvention.imagePixelOrigin", imagePixelOrigin, "top-left");
            Exact(errors, "foliageAtlas.regionConvention.uvOrigin", uvOrigin, "top-left");
            Exact(errors, "foliageAtlas.regionConvention.uDirection", uDirection, "right");
            Exact(errors, "foliageAtlas.regionConvention.vDirection", vDirection, "down");
            Exact(errors, "foliageAtlas.regionConvention.importRule", importRule,
                "disable implicit vertical flipping so v=0 addresses the authored top row");
        }
    }

    [Serializable]
    public sealed class CardUvMappingSpec {
        [SerializeField] string physicalBottom;
        [SerializeField] string physicalTop;

        public string PhysicalBottom => physicalBottom;
        public string PhysicalTop => physicalTop;

        internal void ValidateAuthored(List<string> errors,
            string field = "foliageAtlas.cardUvMapping") {
            CompactExact(errors, field + ".physicalBottom", physicalBottom, "[u,vMax]");
            CompactExact(errors, field + ".physicalTop", physicalTop, "[u,vMin]");
        }

        internal void ValidateUnity(List<string> errors) {
            CompactExact(errors, "foliageAtlas.rendererCardUvMappings.unity.physicalBottom",
                physicalBottom, "[u,1-vMax]");
            CompactExact(errors, "foliageAtlas.rendererCardUvMappings.unity.physicalTop",
                physicalTop, "[u,1-vMin]");
        }
    }

    [Serializable]
    public sealed class RendererCardUvMappingsSpec {
        [SerializeField] CardUvMappingSpec threeJs;
        [SerializeField] CardUvMappingSpec unity;

        public CardUvMappingSpec ThreeJs => threeJs;
        public CardUvMappingSpec Unity => unity;

        internal void Validate(List<string> errors) {
            if (threeJs == null) errors.Add("foliageAtlas.rendererCardUvMappings.threeJs is missing");
            else threeJs.ValidateAuthored(errors, "foliageAtlas.rendererCardUvMappings.threeJs");
            if (unity == null) errors.Add("foliageAtlas.rendererCardUvMappings.unity is missing");
            else unity.ValidateUnity(errors);
        }
    }

    [Serializable]
    public sealed class FoliageRegionsSpec {
        [SerializeField] float[] palm;
        [SerializeField] float[] hardwood;
        [SerializeField] float[] bambooBanana;
        [SerializeField] float[] fernScrub;

        public Vector4 PalmAuthored => Vec4(palm, "foliageAtlas.regions.palm");
        public Vector4 HardwoodAuthored => Vec4(hardwood, "foliageAtlas.regions.hardwood");
        public Vector4 BambooBananaAuthored => Vec4(bambooBanana, "foliageAtlas.regions.bambooBanana");
        public Vector4 FernScrubAuthored => Vec4(fernScrub, "foliageAtlas.regions.fernScrub");
        public Vector4 PalmUnity => AuthoredRegionToUnity(PalmAuthored);
        public Vector4 HardwoodUnity => AuthoredRegionToUnity(HardwoodAuthored);
        public Vector4 BambooBananaUnity => AuthoredRegionToUnity(BambooBananaAuthored);
        public Vector4 FernScrubUnity => AuthoredRegionToUnity(FernScrubAuthored);

        internal void Validate(List<string> errors) {
            ValidateRegion(errors, "foliageAtlas.regions.palm", palm);
            ValidateRegion(errors, "foliageAtlas.regions.hardwood", hardwood);
            ValidateRegion(errors, "foliageAtlas.regions.bambooBanana", bambooBanana);
            ValidateRegion(errors, "foliageAtlas.regions.fernScrub", fernScrub);
        }
    }

    [Serializable]
    public sealed class VisualExtentTargetsSpec {
        [SerializeField] string meaning;
        [SerializeField] ExtentRangeSpec ambientCanopy;
        [SerializeField] ExtentRangeSpec setPieceCanopy;
        [SerializeField] ExtentRangeSpec ambientUnderstory;
        [SerializeField] ExtentRangeSpec setPieceUnderstory;

        public ExtentRangeSpec AmbientCanopy => ambientCanopy;
        public ExtentRangeSpec SetPieceCanopy => setPieceCanopy;
        public ExtentRangeSpec AmbientUnderstory => ambientUnderstory;
        public ExtentRangeSpec SetPieceUnderstory => setPieceUnderstory;

        internal void Validate(List<string> errors) {
            Exact(errors, "foliageAtlas.visualExtentTargetsM.meaning", meaning,
                "final pre-yaw foliage-card bounds, not renderer matrix scale");
            ValidateExtent(errors, "ambientCanopy", ambientCanopy);
            ValidateExtent(errors, "setPieceCanopy", setPieceCanopy);
            ValidateExtent(errors, "ambientUnderstory", ambientUnderstory);
            ValidateExtent(errors, "setPieceUnderstory", setPieceUnderstory);
        }
    }

    [Serializable]
    public sealed class ExtentRangeSpec {
        [SerializeField] float[] width;
        [SerializeField] float[] height;
        [SerializeField] float[] depth;

        public Vector2 Width => Vec2(width, "foliage extent width");
        public Vector2 Height => Vec2(height, "foliage extent height");
        public Vector2 Depth => Vec2(depth, "foliage extent depth");

        internal bool Valid => ValidRange(width) && ValidRange(height) && ValidRange(depth);
    }

    [Serializable]
    public sealed class AcceptanceProjectionSpec {
        [SerializeField] string projection;
        [SerializeField] float verticalFovDeg;
        [SerializeField] float aspect;
        [SerializeField] float nearClipM;
        [SerializeField] float farClipM;
        [SerializeField] string unityPosition;
        [SerializeField] string unityForward;
        [SerializeField] string unityUp;
        [SerializeField] float unityProjectionXSign;
        [SerializeField] bool unityInvertCulling;

        public float VerticalFovDeg => verticalFovDeg;
        public float Aspect => aspect;
        public float NearClipM => nearClipM;
        public float FarClipM => farClipM;
        public float UnityProjectionXSign => unityProjectionXSign;
        public bool UnityInvertCulling => unityInvertCulling;

        internal void Validate(List<string> errors) {
            Exact(errors, "acceptanceProjection.projection", projection, "perspective");
            if (!Finite(verticalFovDeg) || verticalFovDeg <= 1f || verticalFovDeg >= 179f)
                errors.Add($"acceptanceProjection.verticalFovDeg must be in (1,179), got {verticalFovDeg}");
            Positive(errors, "acceptanceProjection.aspect", aspect);
            Positive(errors, "acceptanceProjection.nearClipM", nearClipM);
            Positive(errors, "acceptanceProjection.farClipM", farClipM);
            if (Finite(nearClipM) && Finite(farClipM) && farClipM <= nearClipM)
                errors.Add("acceptanceProjection.farClipM must be greater than nearClipM");
            CompactExact(errors, "acceptanceProjection.unityPosition", unityPosition,
                "[eastM,terrainHeightM(eastM,northM)+aglM,-northM]");
            CompactExact(errors, "acceptanceProjection.unityForward", unityForward,
                "[-sin(yawRad)*cos(pitchRad),sin(pitchRad),-cos(yawRad)*cos(pitchRad)]");
            CompactExact(errors, "acceptanceProjection.unityUp", unityUp,
                "[sin(yawRad)*sin(pitchRad),cos(pitchRad),cos(yawRad)*sin(pitchRad)]");
            if (unityProjectionXSign != -1f)
                errors.Add($"acceptanceProjection.unityProjectionXSign must be -1, got {unityProjectionXSign}");
            if (!unityInvertCulling)
                errors.Add("acceptanceProjection.unityInvertCulling must be true");
        }
    }

    [Serializable]
    public sealed class AcceptanceViewSpec {
        [SerializeField] string id;
        [SerializeField] float eastM;
        [SerializeField] float northM;
        [SerializeField] float aglM;
        [SerializeField] float yawRad;
        [SerializeField] float pitchRad;

        public string Id => id;
        public float EastM => eastM;
        public float NorthM => northM;
        public float AglM => aglM;
        public float YawRad => yawRad;
        public float PitchRad => pitchRad;
        public Vector3 UnityForward => CameraForwardToUnity(yawRad, pitchRad);
        public Vector3 UnityUp => CameraUpToUnity(yawRad, pitchRad);

        public Vector3 UnityPosition(float terrainHeightM) {
            if (!Finite(terrainHeightM))
                throw new ArgumentOutOfRangeException(nameof(terrainHeightM),
                    "Terrain height must be finite.");
            return AuthorityToUnityPosition(eastM, terrainHeightM + aglM, northM);
        }

        public void GetUnityPose(float terrainHeightM, out Vector3 position,
            out Quaternion rotation) {
            position = UnityPosition(terrainHeightM);
            rotation = Quaternion.LookRotation(UnityForward, UnityUp);
        }

        internal void Validate(List<string> errors, int index) {
            string field = $"acceptanceViews[{index}]";
            if (string.IsNullOrWhiteSpace(id)) errors.Add(field + ".id is empty");
            if (!Finite(eastM)) errors.Add(field + ".eastM must be finite");
            if (!Finite(northM)) errors.Add(field + ".northM must be finite");
            Positive(errors, field + ".aglM", aglM);
            if (!Finite(yawRad)) errors.Add(field + ".yawRad must be finite");
            if (!Finite(pitchRad)) errors.Add(field + ".pitchRad must be finite");
        }
    }

    static void ValidateHex(List<string> errors, string field, string value) {
        try { ParseSrgbHexToLinear(value, field); }
        catch (ArgumentException ex) { errors.Add(ex.Message); }
    }

    static void ValidateLinearRgb(List<string> errors, string field, float[] value) {
        if (!ValidArray(value, 3, 0f, 1f))
            errors.Add(field + " must contain three finite linear RGB values in [0,1]");
    }

    static void ValidateLinearHdrRgb(List<string> errors, string field, float[] value) {
        if (!ValidArray(value, 3, 0f, 16f))
            errors.Add(field + " must contain three finite non-negative linear RGB values");
    }

    static void ValidateSize(List<string> errors, string field, float[] value) {
        if (!ValidArray(value, 2, 1f, 65536f) ||
            value[0] != Mathf.Round(value[0]) || value[1] != Mathf.Round(value[1]))
            errors.Add(field + " must contain two positive integer dimensions");
    }

    static void ValidateRegion(List<string> errors, string field, float[] value) {
        if (!ValidArray(value, 4, 0f, 1f)) {
            errors.Add(field + " must be [uMin,vMin,uMax,vMax] in [0,1]");
            return;
        }
        if (value[0] >= value[2] || value[1] >= value[3])
            errors.Add(field + " must have min coordinates below max coordinates");
    }

    static void ValidateExtent(List<string> errors, string name, ExtentRangeSpec extent) {
        if (extent == null)
            errors.Add("foliageAtlas.visualExtentTargetsM." + name + " is missing");
        else if (!extent.Valid)
            errors.Add("foliageAtlas.visualExtentTargetsM." + name +
                " width/height/depth must be positive [min,max] ranges");
    }
}

}

#pragma warning restore 0649
