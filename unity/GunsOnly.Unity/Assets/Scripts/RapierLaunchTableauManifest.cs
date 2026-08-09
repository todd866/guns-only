using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Typed, fail-closed reader for the renderer-neutral tableau exported from the live Web Build 299
/// Rapier builders. It owns no mission, physics, collision, damage or selection authority.
/// </summary>
public static class RapierLaunchTableauManifest {
    public const string ResourcePath =
        "GunsOnly/Rapier/presentation/rapier-launch-tableau.web-build-299.v1";
    public const string ExpectedManifestSha256 =
        "1794f08e1a211fea3d23ded8e710dba525b889acbbd0903c259a79ba16015fc7";
    public const string ExpectedSemanticSha256 =
        "659c4aefe1f77f84a46fc535cdb354509690295a9c570c0e6230c90284d8a9d5";

    [Serializable]
    internal sealed class ManifestData {
        public string schema;
        public string tableauId;
        public string contentVersion;
        public int sourceWebBuild;
        public string[] sourceBuilders;
        public AuthorityRecord authority;
        public CoordinateSystemRecord coordinateSystem;
        public OutputRecord output;
        public CameraRecord camera;
        public LightingRecord lighting;
        public AtmosphereRecord atmosphere;
        public PlatformRecord platform;
        public BudgetRecord budgets;
        public MaterialRecord[] materials;
        public DrawRecord[] draws;
        public SkyRecord sky;
        public DynamicFxRecord dynamicFx;
        public string semanticSha256;
    }

    [Serializable]
    internal sealed class AuthorityRecord {
        public string mode;
        public string simulationAuthority;
        public string collisionAuthority;
        public string damageAuthority;
        public bool targetable;
        public string dynamicFxAuthority;
    }

    [Serializable]
    internal sealed class CoordinateSystemRecord {
        public string units;
        public string x;
        public string y;
        public string z;
        public string transforms;
    }

    [Serializable]
    internal sealed class OutputRecord {
        public string colorSpace;
        public string workingColorSpace;
        public string toneMapping;
        public float exposure;
        public string antialias;
        public bool logarithmicDepthBuffer;
    }

    [Serializable]
    internal sealed class CameraRecord {
        public string doctrine;
        public string semantic;
        public string nodeName;
        public float[] anchorLocalM;
        public bool exteriorMeshVisibleInLiveFlight;
        public bool cockpitMeshVisibleInLiveFlight;
        public bool persistentFrameChrome;
        public ProjectionRecord projection;
    }

    [Serializable]
    internal sealed class ProjectionRecord {
        public float verticalFovDeg;
        public float nearClipM;
        public float farClipM;
        public string rotationOrder;
    }

    [Serializable]
    internal sealed class LightingRecord {
        public float[] sunDirection;
        public string sunColorSrgbHex;
        public float[] sunColorLinearRgb;
        public float sunIntensity;
        public string hemisphereSkySrgbHex;
        public float[] hemisphereSkyLinearRgb;
        public string hemisphereGroundSrgbHex;
        public float[] hemisphereGroundLinearRgb;
        public float hemisphereIntensity;
        public ShadowRecord shadow;
    }

    [Serializable]
    internal sealed class ShadowRecord {
        public string type;
        public float[] orthographicBoundsM;
        public float nearClipM;
        public float farClipM;
        public float depthBias;
        public float normalBias;
    }

    [Serializable]
    internal sealed class AtmosphereRecord {
        public string model;
        public float clearAirVisibilityM;
        public float clearAirFogDensityPerM;
        public float fogDensityScale;
        public string fogLowSrgbHex;
        public float[] fogLowLinearRgb;
        public string fogHighSrgbHex;
        public float[] fogHighLinearRgb;
        public string cloudFogSrgbHex;
        public float[] cloudFogLinearRgb;
        public float[] hazeLinearRgb;
        public float hazeMix;
        public float[] altitudeBlendM;
        public bool weatherDriven;
        public bool worldEdgeDriven;
    }

    [Serializable]
    internal sealed class PlatformRecord {
        public string presentationId;
        public string rootName;
        public string platformKind;
        public float launchStrokeM;
        public float launchFlatLengthM;
        public float launchArcLengthM;
        public float launchRampRiseM;
        public float referenceAltitudeM;
        public SocketRecord[] sockets;
        public string[] recoveryWireMaterialIds;
    }

    [Serializable]
    internal sealed class SocketRecord {
        public string semantic;
        public string nodeName;
        public float[] positionLocalM;
    }

    [Serializable]
    internal sealed class BudgetRecord {
        public int meshDrawCount;
        public int pointDrawCount;
        public int shadowCasterCount;
        public int renderedTriangleCount;
        public int renderedVertexCount;
        public int staticBoxBatchCount;
        public int staticBoxSourceCount;
    }

    [Serializable]
    internal sealed class MaterialRecord {
        public string id;
        public string shaderModel;
        public string name;
        public string colorSrgbHex;
        public float[] colorLinearRgb;
        public string emissiveSrgbHex;
        public float[] emissiveLinearRgb;
        public float roughness;
        public float metalness;
        public float ior;
        public float specularIntensity;
        public string specularColorSrgbHex;
        public float[] specularColorLinearRgb;
        public float clearcoat;
        public float clearcoatRoughness;
        public float envMapIntensity;
        public FinishRecord finish;
        public bool transparent;
        public float opacity;
        public float alphaTest;
        public bool depthTest;
        public bool depthWrite;
        public bool colorWrite;
        public bool toneMapped;
        public string side;
        public string blending;
        public bool polygonOffset;
        public float polygonOffsetFactor;
        public float polygonOffsetUnits;
        public float pointSizePx;
        public bool sizeAttenuation;
    }

    [Serializable]
    internal sealed class FinishRecord {
        public float grain;
        public float grainScale;
        public float panelStrength;
        public float panelScale;
    }

    [Serializable]
    internal sealed class DrawRecord {
        public string id;
        public string name;
        public string semanticPath;
        public string kind;
        public string materialId;
        public TransformRecord transform;
        public TransformRecord[] instances;
        public GeometryRecord geometry;
        public int renderedVertexCount;
        public int renderedPrimitiveCount;
        public bool visibleAtRest;
        public bool castShadow;
        public bool receiveShadow;
        public int renderOrder;
        public bool frustumCulled;
        public int staticBoxCount;
    }

    [Serializable]
    internal sealed class TransformRecord {
        public float[] position;
        public float[] quaternion;
        public float[] scale;
    }

    [Serializable]
    internal sealed class GeometryRecord {
        public string topology;
        public int vertexCount;
        public int elementCount;
        public int primitiveCount;
        public BoundsRecord bounds;
        public AttributesRecord attributes;
        public AttributeRecord index;
    }

    [Serializable]
    internal sealed class BoundsRecord {
        public float[] minimum;
        public float[] maximum;
        public float[] sphereCenter;
        public float sphereRadius;
    }

    [Serializable]
    internal sealed class AttributesRecord {
        public AttributeRecord position;
        public AttributeRecord normal;
        public AttributeRecord uv;
    }

    [Serializable]
    internal sealed class AttributeRecord {
        public string componentType;
        public int itemSize;
        public int count;
        public bool normalized;
        public string encoding;
        public int byteLength;
        public string sha256;
        public string data;
    }

    [Serializable]
    internal sealed class SkyRecord {
        public string name;
        public string shaderModel;
        public string webVertexShaderSha256;
        public string webFragmentShaderSha256;
        public float radiusM;
        public int widthSegments;
        public int heightSegments;
        public float referenceAltitudeM;
        public int renderOrder;
        public bool frustumCulled;
        public SkyVariantRecord variantUniforms;
        public SkyParametersRecord softWorldParameters;
        public GeometryRecord geometry;
    }

    [Serializable]
    internal sealed class SkyVariantRecord {
        public float softWorldMix;
        public float modernCombatMix;
    }

    [Serializable]
    internal sealed class SkyParametersRecord {
        public float[] altitudeBlendM;
        public float[] horizonLowLinearRgb;
        public float[] horizonHighLinearRgb;
        public float[] zenithLowLinearRgb;
        public float[] zenithHighLinearRgb;
        public float skyCurveLow;
        public float skyCurveHigh;
        public float shoulderFalloff;
        public float shoulderGain;
        public float shoulderWeight;
        public float belowHorizonFalloff;
        public float sunCoreExponent;
        public float sunBloomExponent;
        public float sunHaloExponent;
        public float sunCoreGain;
        public float sunBloomGain;
        public float sunHaloGain;
    }

    [Serializable]
    internal sealed class DynamicFxRecord {
        public string webSourceSha256;
        public string[] stateFields;
        public bool restVisibility;
        public string[] pointDrawIds;
        public float postHandoffFadeS;
        public FxLayoutRecord layout;
        public VentFxRecord vent;
        public PortalFxRecord portal;
        public RailFxRecord rail;
        public RibLampFxRecord ribLamps;
        public string note;
    }

    [Serializable]
    internal sealed class FxLayoutRecord {
        public float catapultXM;
        public float railStartZM;
        public float flatLengthM;
    }

    [Serializable]
    internal sealed class VentFxRecord {
        public string drawName;
        public float opacityBase;
        public float opacityProgressGain;
        public float fadeMultiplier;
        public float driftRateBase;
        public float driftRateProgressGain;
        public float driftScale;
        public float driftModuloM;
    }

    [Serializable]
    internal sealed class PortalFxRecord {
        public string drawName;
        public float progressStart;
        public float opacityMaximum;
        public float verticalOscillationM;
        public float verticalOscillationRadPerS;
    }

    [Serializable]
    internal sealed class RailFxRecord {
        public string drawName;
        public float opacityBase;
        public float opacityProgressGain;
        public float fadeMultiplier;
        public float lateralOscillationM;
        public float lateralOscillationRadPerS;
    }

    [Serializable]
    internal sealed class RibLampFxRecord {
        public string drawName;
        public string baseColorSrgbHex;
        public float[] baseColorLinearRgb;
        public string hotColorSrgbHex;
        public float[] hotColorLinearRgb;
        public float activeMixBase;
        public float activeMixProgressGain;
        public float pulseBase;
        public float pulseAmplitude;
        public float pulseRateBase;
        public float pulseRateProgressGain;
        public float fadeMixGain;
    }

    internal static ManifestData LoadOrThrow() {
        TextAsset source = Resources.Load<TextAsset>(ResourcePath);
        if (source == null) {
            throw new InvalidOperationException(
                "Missing canonical Rapier tableau Resources manifest at " + ResourcePath + ".");
        }
        string hash = Sha256Hex(source.bytes);
        if (!string.Equals(hash, ExpectedManifestSha256, StringComparison.Ordinal)) {
            throw new InvalidOperationException(
                "Rapier tableau manifest SHA-256 mismatch: " + hash + ".");
        }
        return ParseAndValidateOrThrow(source.text);
    }

    /// <summary>Public fail-closed Resources probe without exposing mutable manifest DTOs.</summary>
    public static void ValidateResourceOrThrow() {
        _ = LoadOrThrow();
    }

    /// <summary>Editor/build validation entry point; includes the canonical whole-file hash.</summary>
    public static void ValidateJsonOrThrow(string json) {
        if (json == null) throw new InvalidOperationException("Rapier tableau JSON is null.");
        string hash = Sha256Hex(Encoding.UTF8.GetBytes(json));
        if (!string.Equals(hash, ExpectedManifestSha256, StringComparison.Ordinal)) {
            throw new InvalidOperationException(
                "Rapier tableau JSON is not the canonical staged file: " + hash + ".");
        }
        _ = ParseAndValidateOrThrow(json);
    }

    internal static ManifestData ParseAndValidateOrThrow(string json) {
        if (string.IsNullOrWhiteSpace(json)) {
            throw new InvalidOperationException("Rapier tableau JSON is empty.");
        }
        ManifestData manifest;
        try {
            manifest = JsonUtility.FromJson<ManifestData>(json);
        }
        catch (Exception ex) {
            throw new InvalidOperationException("Rapier tableau JSON is malformed.", ex);
        }
        NormalizeUnityNullAttributes(manifest);
        ValidateIdentity(manifest);
        ValidatePresentation(manifest);
        ValidateMaterialsAndDraws(manifest);
        ValidateSkyAndFx(manifest);
        return manifest;
    }

    // JsonUtility materializes an explicit JSON null for a serializable class field as an
    // all-default object. Canonical geometry uses null for non-indexed meshes and point-only
    // normal/UV attributes, so restore those optional records before fail-closed validation.
    static void NormalizeUnityNullAttributes(ManifestData manifest) {
        if (manifest?.draws != null) {
            foreach (DrawRecord draw in manifest.draws) {
                NormalizeUnityNullAttributes(draw?.geometry);
            }
        }
        NormalizeUnityNullAttributes(manifest?.sky?.geometry);
    }

    static void NormalizeUnityNullAttributes(GeometryRecord geometry) {
        if (geometry == null) return;
        if (IsUnityNullAttribute(geometry.index)) geometry.index = null;
        if (geometry.attributes == null) return;
        if (IsUnityNullAttribute(geometry.attributes.normal)) geometry.attributes.normal = null;
        if (IsUnityNullAttribute(geometry.attributes.uv)) geometry.attributes.uv = null;
    }

    static bool IsUnityNullAttribute(AttributeRecord attribute) {
        return attribute != null
            && attribute.componentType == null
            && attribute.itemSize == 0
            && attribute.count == 0
            && !attribute.normalized
            && attribute.encoding == null
            && attribute.byteLength == 0
            && attribute.sha256 == null
            && attribute.data == null;
    }

    static void ValidateIdentity(ManifestData manifest) {
        if (manifest == null
            || manifest.schema != "guns-only.rapier.launch-tableau.v1"
            || manifest.tableauId != "presentation.tableau.rapier-launch.web-build-299.v1"
            || manifest.contentVersion != "1.0.0"
            || manifest.sourceWebBuild != 299
            || manifest.semanticSha256 != ExpectedSemanticSha256) {
            throw new InvalidOperationException("Rapier tableau identity is not Web Build 299 v1.");
        }
        if (manifest.sourceBuilders == null || manifest.sourceBuilders.Length != 3
            || manifest.sourceBuilders[0] != "createRapierDispersedStrip"
            || manifest.sourceBuilders[1] != "createRapier"
            || manifest.sourceBuilders[2] != "createDecisionSupportSky") {
            throw new InvalidOperationException("Rapier tableau source-builder identity drifted.");
        }
        AuthorityRecord authority = manifest.authority;
        if (authority == null || authority.mode != "presentation-only"
            || authority.simulationAuthority != "none"
            || authority.collisionAuthority != "none"
            || authority.damageAuthority != "none"
            || authority.targetable
            || authority.dynamicFxAuthority != "projected-simulation-state") {
            throw new InvalidOperationException("Rapier tableau crossed its authority boundary.");
        }
        CoordinateSystemRecord coordinates = manifest.coordinateSystem;
        if (coordinates == null || coordinates.units != "metres"
            || coordinates.x != "right-east" || coordinates.y != "up"
            || coordinates.z != "three-js-local; launch-forward-is-negative-z"
            || coordinates.transforms != "position-quaternion-scale; quaternion-xyzw") {
            throw new InvalidOperationException("Rapier tableau coordinate contract drifted.");
        }
    }

    static void ValidatePresentation(ManifestData manifest) {
        OutputRecord output = manifest.output;
        if (output == null || output.colorSpace != "srgb"
            || output.workingColorSpace != "linear-srgb"
            || output.toneMapping != "aces-filmic" || !Close(output.exposure, 1.1f)
            || output.antialias != "msaa" || !output.logarithmicDepthBuffer) {
            throw new InvalidOperationException("Rapier output transform drifted from Web.");
        }
        CameraRecord camera = manifest.camera;
        if (camera == null || camera.doctrine != "opaque-sensor-capsule"
            || camera.semantic != "camera.cockpit"
            || camera.nodeName != "SOCKET_CAMERA_COCKPIT"
            || camera.exteriorMeshVisibleInLiveFlight
            || camera.cockpitMeshVisibleInLiveFlight || camera.persistentFrameChrome
            || !VectorEquals(camera.anchorLocalM, 0f, 0.21f, -1.8f)) {
            throw new InvalidOperationException("Rapier opaque sensor camera doctrine drifted.");
        }
        ProjectionRecord projection = camera.projection;
        if (projection == null || !Close(projection.verticalFovDeg, 66f)
            || !Close(projection.nearClipM, 0.06f)
            || !Close(projection.farClipM, 680000f)
            || projection.rotationOrder != "YXZ") {
            throw new InvalidOperationException("Rapier camera projection drifted from Web.");
        }

        LightingRecord lighting = manifest.lighting;
        if (lighting == null || !UnitVector(lighting.sunDirection)
            || lighting.sunColorSrgbHex != "#ffe2b4"
            || lighting.hemisphereSkySrgbHex != "#e8d8b8"
            || lighting.hemisphereGroundSrgbHex != "#3a3428"
            || !Rgb(lighting.sunColorLinearRgb)
            || !Rgb(lighting.hemisphereSkyLinearRgb)
            || !Rgb(lighting.hemisphereGroundLinearRgb)
            || !Close(lighting.sunIntensity, 2.95f)
            || !Close(lighting.hemisphereIntensity, 0.9f)) {
            throw new InvalidOperationException("Rapier lighting contract drifted from Web.");
        }
        ShadowRecord shadow = lighting.shadow;
        if (shadow == null || shadow.type != "pcf-soft"
            || !ArrayEquals(shadow.orthographicBoundsM, -175f, 175f, -175f, 175f)
            || !Close(shadow.nearClipM, 10f) || !Close(shadow.farClipM, 3600f)
            || !Close(shadow.depthBias, -0.00018f, 1e-7f)
            || !Close(shadow.normalBias, 0.16f)) {
            throw new InvalidOperationException("Rapier shadow contract drifted from Web.");
        }

        AtmosphereRecord atmosphere = manifest.atmosphere;
        if (atmosphere == null || atmosphere.model != "exp2-weather-authoritative-soft-world"
            || !Close(atmosphere.clearAirVisibilityM, 100000f)
            || !Close(atmosphere.clearAirFogDensityPerM, 0.0000197788347f, 1e-10f)
            || !Close(atmosphere.fogDensityScale, 0.32f)
            || atmosphere.fogLowSrgbHex != "#a8814b"
            || atmosphere.fogHighSrgbHex != "#8a8470"
            || atmosphere.cloudFogSrgbHex != "#a8814b"
            || !Rgb(atmosphere.fogLowLinearRgb) || !Rgb(atmosphere.fogHighLinearRgb)
            || !Rgb(atmosphere.cloudFogLinearRgb) || !Rgb(atmosphere.hazeLinearRgb)
            || !Close(atmosphere.hazeMix, 0.72f)
            || !ArrayEquals(atmosphere.altitudeBlendM, 1800f, 14000f)
            || !atmosphere.weatherDriven || !atmosphere.worldEdgeDriven) {
            throw new InvalidOperationException("Rapier soft-world atmosphere drifted from Web.");
        }

        PlatformRecord platform = manifest.platform;
        if (platform == null
            || platform.presentationId != "presentation.platform.rapier-dispersed-strip.v1"
            || platform.rootName != "RAPIER_FIXED_DISPERSED_ARRESTING_STRIP"
            || platform.platformKind != "FIXED_ARRESTING_STRIP"
            || !Close(platform.launchStrokeM, 520f)
            || !Close(platform.launchFlatLengthM, 417.48694f, 0.0002f)
            || !Close(platform.referenceAltitudeM, 192f)
            || platform.sockets == null || platform.sockets.Length != 3) {
            throw new InvalidOperationException("Rapier platform semantic contract drifted.");
        }
        string[] expectedSockets = {
            "platform.deck-origin", "platform.recovery-threshold", "platform.launch-end",
        };
        for (int index = 0; index < expectedSockets.Length; index++) {
            SocketRecord socket = platform.sockets[index];
            if (socket == null || socket.semantic != expectedSockets[index]
                || string.IsNullOrEmpty(socket.nodeName) || !Vector3(socket.positionLocalM)) {
                throw new InvalidOperationException("Rapier platform socket record is malformed.");
            }
        }
    }

    static void ValidateMaterialsAndDraws(ManifestData manifest) {
        BudgetRecord budget = manifest.budgets;
        if (budget == null || budget.meshDrawCount != 42 || budget.pointDrawCount != 3
            || budget.shadowCasterCount != 18 || budget.renderedTriangleCount != 8128
            || budget.renderedVertexCount != 10148 || budget.staticBoxBatchCount != 10
            || budget.staticBoxSourceCount != 139) {
            throw new InvalidOperationException("Rapier optimized draw/shadow budget drifted.");
        }
        if (manifest.materials == null || manifest.materials.Length != 21
            || manifest.draws == null || manifest.draws.Length != 45) {
            throw new InvalidOperationException("Rapier material/draw table is incomplete.");
        }
        var materialById = new Dictionary<string, MaterialRecord>(StringComparer.Ordinal);
        foreach (MaterialRecord material in manifest.materials) {
            ValidateMaterial(material);
            if (!materialById.TryAdd(material.id, material)) {
                throw new InvalidOperationException("Duplicate Rapier material " + material.id + ".");
            }
        }
        if (manifest.platform.recoveryWireMaterialIds == null
            || manifest.platform.recoveryWireMaterialIds.Length != 4
            || new HashSet<string>(manifest.platform.recoveryWireMaterialIds,
                StringComparer.Ordinal).Count != 4) {
            throw new InvalidOperationException("Rapier recovery wires lost independent materials.");
        }
        foreach (string materialId in manifest.platform.recoveryWireMaterialIds) {
            if (!materialById.ContainsKey(materialId)) {
                throw new InvalidOperationException("Unknown Rapier recovery-wire material.");
            }
        }

        var drawIds = new HashSet<string>(StringComparer.Ordinal);
        int meshDraws = 0, pointDraws = 0, shadows = 0, triangles = 0, vertices = 0;
        int staticBatches = 0, staticSources = 0;
        foreach (DrawRecord draw in manifest.draws) {
            if (draw == null || string.IsNullOrEmpty(draw.id) || string.IsNullOrEmpty(draw.name)
                || string.IsNullOrEmpty(draw.semanticPath) || !drawIds.Add(draw.id)
                || !materialById.TryGetValue(draw.materialId, out MaterialRecord material)) {
                throw new InvalidOperationException("Malformed or duplicate Rapier draw record.");
            }
            bool points = draw.kind == "points";
            bool instanced = draw.kind == "instanced-mesh";
            if (!points && !instanced && draw.kind != "mesh") {
                throw new InvalidOperationException("Unsupported Rapier draw kind " + draw.kind + ".");
            }
            ValidateMaterialForDraw(material, points, draw.id);
            TransformRecord[] instances = draw.instances ?? Array.Empty<TransformRecord>();
            if ((instanced && instances.Length == 0) || (!instanced && instances.Length != 0)) {
                throw new InvalidOperationException("Rapier instance table mismatch for " + draw.id + ".");
            }
            ValidateTransform(draw.transform, draw.id + " object");
            foreach (TransformRecord instance in instances) ValidateTransform(instance, draw.id + " instance");
            ValidateGeometry(draw.geometry, points ? "points" : "triangles", draw.id);
            int copies = instanced ? instances.Length : 1;
            if (draw.renderedVertexCount != draw.geometry.vertexCount * copies
                || draw.renderedPrimitiveCount != draw.geometry.primitiveCount * copies) {
                throw new InvalidOperationException("Rapier rendered count mismatch for " + draw.id + ".");
            }
            if (points) {
                pointDraws++;
                if (draw.visibleAtRest || draw.castShadow || draw.receiveShadow) {
                    throw new InvalidOperationException("Rapier launch FX must be inactive and shadowless at rest.");
                }
            } else {
                meshDraws++;
                vertices += draw.renderedVertexCount;
                triangles += draw.renderedPrimitiveCount;
                if (draw.castShadow) shadows++;
            }
            if (draw.staticBoxCount > 0) {
                staticBatches++;
                staticSources += draw.staticBoxCount;
            }
        }
        if (meshDraws != budget.meshDrawCount || pointDraws != budget.pointDrawCount
            || shadows != budget.shadowCasterCount || triangles != budget.renderedTriangleCount
            || vertices != budget.renderedVertexCount || staticBatches != budget.staticBoxBatchCount
            || staticSources != budget.staticBoxSourceCount) {
            throw new InvalidOperationException("Rapier aggregate render budgets are internally inconsistent.");
        }
    }

    static void ValidateMaterial(MaterialRecord material) {
        if (material == null || string.IsNullOrEmpty(material.id)
            || (material.shaderModel != "three-mesh-physical"
                && material.shaderModel != "three-mesh-basic"
                && material.shaderModel != "three-points")
            || !Rgb(material.colorLinearRgb) || !Rgb(material.emissiveLinearRgb)
            || !Rgb(material.specularColorLinearRgb) || material.finish == null
            || !Finite(material.roughness, material.metalness, material.ior,
                material.specularIntensity, material.clearcoat, material.clearcoatRoughness,
                material.envMapIntensity, material.opacity, material.alphaTest,
                material.polygonOffsetFactor, material.polygonOffsetUnits, material.pointSizePx,
                material.finish.grain, material.finish.grainScale,
                material.finish.panelStrength, material.finish.panelScale)
            || material.opacity < 0f || material.opacity > 1f
            || material.side != "front" || (material.blending != "normal"
                && material.blending != "additive")) {
            throw new InvalidOperationException("Malformed Rapier material record.");
        }
    }

    static void ValidateMaterialForDraw(MaterialRecord material, bool points, string drawId) {
        bool supportedPoint = material.shaderModel == "three-points"
            && material.transparent && material.blending == "additive"
            && material.depthTest && !material.depthWrite && material.colorWrite
            && Close(material.alphaTest, 0f) && material.sizeAttenuation
            && !material.toneMapped;
        bool supportedMesh = material.shaderModel != "three-points"
            && !material.transparent && material.blending == "normal"
            && material.depthTest && material.depthWrite && material.colorWrite
            && Close(material.opacity, 1f) && Close(material.alphaTest, 0f)
            && !material.sizeAttenuation;
        if (points ? !supportedPoint : !supportedMesh) {
            throw new InvalidOperationException(
                "Rapier draw " + drawId + " uses a material contract the Unity adapter cannot honor.");
        }
    }

    static void ValidateSkyAndFx(ManifestData manifest) {
        SkyRecord sky = manifest.sky;
        if (sky == null || sky.name != "DECISION_SUPPORT_SKY"
            || sky.shaderModel != "decision-support-sky-soft-world"
            || sky.webFragmentShaderSha256 !=
                "7a1b826de9868f901efe65aec87ab2d11b11fa0e9e8234cba01dfa503fd497a0"
            || !Close(sky.radiusM, 4096f) || sky.widthSegments != 36
            || sky.heightSegments != 20 || !Close(sky.referenceAltitudeM, 192f)
            || sky.renderOrder != -100 || sky.frustumCulled || sky.variantUniforms == null
            || !Close(sky.variantUniforms.softWorldMix, 1f)
            || !Close(sky.variantUniforms.modernCombatMix, 0f)
            || sky.softWorldParameters == null) {
            throw new InvalidOperationException("Rapier soft-world sky contract drifted.");
        }
        ValidateGeometry(sky.geometry, "triangles", "sky");
        if (sky.geometry.vertexCount != 777 || sky.geometry.primitiveCount != 1368) {
            throw new InvalidOperationException("Rapier sky geometry drifted from Web.");
        }
        SkyParametersRecord skyParameters = sky.softWorldParameters;
        if (!ArrayEquals(skyParameters.altitudeBlendM, 2500f, 18000f)
            || !Rgb(skyParameters.horizonLowLinearRgb)
            || !Rgb(skyParameters.horizonHighLinearRgb)
            || !Rgb(skyParameters.zenithLowLinearRgb)
            || !Rgb(skyParameters.zenithHighLinearRgb)
            || !Close(skyParameters.skyCurveLow, 0.18f)
            || !Close(skyParameters.skyCurveHigh, 0.13f)
            || !Close(skyParameters.sunCoreExponent, 1800f)
            || !Close(skyParameters.sunBloomExponent, 42f)) {
            throw new InvalidOperationException("Rapier sky shader parameters drifted.");
        }

        DynamicFxRecord fx = manifest.dynamicFx;
        if (fx == null || fx.webSourceSha256 !=
                "480bb2dc8f11268885acda201a4b54da1c0cb1a311efd522a51c4e4d3e70336e"
            || fx.stateFields == null || fx.stateFields.Length != 2
            || fx.stateFields[0] != "catapult_active"
            || fx.stateFields[1] != "catapult_progress" || fx.restVisibility
            || fx.pointDrawIds == null || fx.pointDrawIds.Length != 3
            || !Close(fx.postHandoffFadeS, 1.2f) || fx.layout == null
            || fx.vent == null || fx.portal == null || fx.rail == null || fx.ribLamps == null
            || !Close(fx.layout.catapultXM, -70f)
            || !Close(fx.layout.railStartZM, -20f)
            || !Close(fx.layout.flatLengthM, manifest.platform.launchFlatLengthM)
            || fx.vent.drawName != "LAUNCH_FX_VENT_DUST"
            || fx.portal.drawName != "LAUNCH_FX_PORTAL_SHEET"
            || fx.rail.drawName != "LAUNCH_FX_RAIL_SHIMMER"
            || fx.ribLamps.drawName != "LAUNCH_GALLERY_RIB_LAMPS"
            || !Rgb(fx.ribLamps.baseColorLinearRgb) || !Rgb(fx.ribLamps.hotColorLinearRgb)) {
            throw new InvalidOperationException("Rapier launch FX response contract drifted.");
        }
        var expectedPointIds = new HashSet<string>(fx.pointDrawIds, StringComparer.Ordinal);
        int matched = 0;
        foreach (DrawRecord draw in manifest.draws) {
            if (draw.kind == "points" && expectedPointIds.Contains(draw.id)) matched++;
        }
        if (matched != 3) throw new InvalidOperationException("Rapier launch FX draw binding is incomplete.");
    }

    static void ValidateGeometry(GeometryRecord geometry, string topology, string label) {
        if (geometry == null || geometry.topology != topology || geometry.vertexCount <= 0
            || geometry.attributes == null || geometry.attributes.position == null
            || geometry.bounds == null || !Vector3(geometry.bounds.minimum)
            || !Vector3(geometry.bounds.maximum) || !Vector3(geometry.bounds.sphereCenter)
            || !Finite(geometry.bounds.sphereRadius) || geometry.bounds.sphereRadius <= 0f) {
            throw new InvalidOperationException("Malformed Rapier geometry " + label + ".");
        }
        float[] positions = DecodeFloatAttributeOrThrow(
            geometry.attributes.position, 3, geometry.vertexCount, label + ".position");
        if (positions.Length != geometry.vertexCount * 3) {
            throw new InvalidOperationException("Rapier vertex count mismatch for " + label + ".");
        }
        if (topology == "triangles") {
            _ = DecodeFloatAttributeOrThrow(
                geometry.attributes.normal, 3, geometry.vertexCount, label + ".normal");
        } else if (geometry.attributes.normal != null) {
            throw new InvalidOperationException("Rapier point draw unexpectedly carries normals.");
        }
        if (geometry.attributes.uv != null) {
            _ = DecodeFloatAttributeOrThrow(
                geometry.attributes.uv, 2, geometry.vertexCount, label + ".uv");
        }
        int elementCount;
        if (geometry.index != null) {
            uint[] indices = DecodeIndexAttributeOrThrow(geometry.index, label + ".index");
            foreach (uint index in indices) {
                if (index >= geometry.vertexCount) {
                    throw new InvalidOperationException("Out-of-range Rapier index in " + label + ".");
                }
            }
            elementCount = indices.Length;
        } else {
            elementCount = geometry.vertexCount;
        }
        int expectedPrimitives = topology == "triangles" ? elementCount / 3 : elementCount;
        if (elementCount != geometry.elementCount || geometry.primitiveCount != expectedPrimitives
            || (topology == "triangles" && elementCount % 3 != 0)) {
            throw new InvalidOperationException("Rapier topology count mismatch for " + label + ".");
        }
    }

    internal static float[] DecodeFloatAttributeOrThrow(
        AttributeRecord attribute, int itemSize, int count, string label) {
        if (attribute == null || attribute.componentType != "float32"
            || attribute.itemSize != itemSize || attribute.count != count || attribute.normalized
            || attribute.encoding != "base64-f32le") {
            throw new InvalidOperationException("Malformed Rapier float attribute " + label + ".");
        }
        byte[] bytes = DecodeBytesOrThrow(attribute, checked(itemSize * count * 4), label);
        var values = new float[itemSize * count];
        for (int index = 0; index < values.Length; index++) {
            int offset = index * 4;
            int bits = bytes[offset]
                | bytes[offset + 1] << 8
                | bytes[offset + 2] << 16
                | bytes[offset + 3] << 24;
            values[index] = BitConverter.Int32BitsToSingle(bits);
            if (!Finite(values[index])) {
                throw new InvalidOperationException("Non-finite Rapier float in " + label + ".");
            }
        }
        return values;
    }

    internal static uint[] DecodeIndexAttributeOrThrow(AttributeRecord attribute, string label) {
        if (attribute == null || attribute.componentType != "uint32" || attribute.itemSize != 1
            || attribute.count <= 0 || attribute.normalized || attribute.encoding != "base64-u32le") {
            throw new InvalidOperationException("Malformed Rapier index attribute " + label + ".");
        }
        byte[] bytes = DecodeBytesOrThrow(attribute, checked(attribute.count * 4), label);
        var values = new uint[attribute.count];
        for (int index = 0; index < values.Length; index++) {
            int offset = index * 4;
            values[index] = (uint)(bytes[offset]
                | bytes[offset + 1] << 8
                | bytes[offset + 2] << 16
                | bytes[offset + 3] << 24);
        }
        return values;
    }

    static byte[] DecodeBytesOrThrow(AttributeRecord attribute, int expectedLength, string label) {
        if (attribute.byteLength != expectedLength || string.IsNullOrEmpty(attribute.sha256)
            || string.IsNullOrEmpty(attribute.data)) {
            throw new InvalidOperationException("Rapier attribute metadata mismatch for " + label + ".");
        }
        byte[] bytes;
        try {
            bytes = Convert.FromBase64String(attribute.data);
        }
        catch (FormatException ex) {
            throw new InvalidOperationException("Malformed Rapier base64 for " + label + ".", ex);
        }
        if (bytes.Length != expectedLength
            || !string.Equals(Convert.ToBase64String(bytes), attribute.data, StringComparison.Ordinal)
            || !string.Equals(Sha256Hex(bytes), attribute.sha256, StringComparison.Ordinal)) {
            throw new InvalidOperationException("Rapier byte/hash mismatch for " + label + ".");
        }
        return bytes;
    }

    static void ValidateTransform(TransformRecord value, string label) {
        if (value == null || !Vector3(value.position) || !Vector3(value.scale)
            || value.quaternion == null || value.quaternion.Length != 4
            || !Finite(value.quaternion) || value.scale[0] <= 0f
            || value.scale[1] <= 0f || value.scale[2] <= 0f) {
            throw new InvalidOperationException("Malformed Rapier transform " + label + ".");
        }
        float length = value.quaternion[0] * value.quaternion[0]
            + value.quaternion[1] * value.quaternion[1]
            + value.quaternion[2] * value.quaternion[2]
            + value.quaternion[3] * value.quaternion[3];
        if (!Close(length, 1f, 0.001f)) {
            throw new InvalidOperationException("Non-unit Rapier quaternion " + label + ".");
        }
    }

    static bool Rgb(float[] value) => value != null && value.Length == 3
        && Finite(value) && value[0] >= 0f && value[1] >= 0f && value[2] >= 0f;

    static bool Vector3(float[] value) => value != null && value.Length == 3 && Finite(value);

    static bool UnitVector(float[] value) {
        if (!Vector3(value)) return false;
        float length = value[0] * value[0] + value[1] * value[1] + value[2] * value[2];
        return Close(length, 1f, 0.001f);
    }

    static bool VectorEquals(float[] value, float x, float y, float z) => Vector3(value)
        && Close(value[0], x) && Close(value[1], y) && Close(value[2], z);

    static bool ArrayEquals(float[] value, params float[] expected) {
        if (value == null || value.Length != expected.Length) return false;
        for (int index = 0; index < value.Length; index++) {
            if (!Close(value[index], expected[index])) return false;
        }
        return true;
    }

    static bool Finite(params float[] values) {
        if (values == null) return false;
        foreach (float value in values) {
            if (float.IsNaN(value) || float.IsInfinity(value)) return false;
        }
        return true;
    }

    static bool Close(float actual, float expected, float tolerance = 0.0001f) =>
        Mathf.Abs(actual - expected) <= tolerance;

    static string Sha256Hex(byte[] bytes) {
        using SHA256 sha = SHA256.Create();
        byte[] digest = sha.ComputeHash(bytes);
        var result = new StringBuilder(digest.Length * 2);
        foreach (byte value in digest) result.Append(value.ToString("x2"));
        return result.ToString();
    }
}

}
