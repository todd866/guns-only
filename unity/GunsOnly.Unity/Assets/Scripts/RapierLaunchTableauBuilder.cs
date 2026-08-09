using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace GunsOnly.UnityClient {

/// <summary>
/// Runtime handles for the Web-canonical Rapier launch tableau. The caller owns mission selection,
/// simulation projection and vehicle pose; this object only renders already-projected truth.
/// </summary>
public sealed class RapierLaunchTableau : IDisposable {
    readonly RapierLaunchTableauManifest.ManifestData _manifest;
    readonly Dictionary<string, DrawHandle> _draws;
    readonly List<Mesh> _meshes;
    readonly List<Material> _materials;
    readonly Material _skyMaterial;
    Transform _cockpitCameraAnchor;
    Transform _boundSensorCamera;
    bool _strokeActive;
    float _fadeRemainingS;
    float _timeS;
    float _lastVentOpacity;
    float _lastPortalOpacity;
    float _lastRailOpacity;

    internal RapierLaunchTableau(
        RapierLaunchTableauManifest.ManifestData manifest,
        Transform root,
        Transform sky,
        Light sun,
        Dictionary<string, DrawHandle> draws,
        List<Mesh> meshes,
        List<Material> materials,
        Material skyMaterial,
        Transform deckOrigin,
        Transform recoveryThreshold,
        Transform launchEnd) {
        _manifest = manifest;
        Root = root;
        Sky = sky;
        Sun = sun;
        _draws = draws;
        _meshes = meshes;
        _materials = materials;
        _skyMaterial = skyMaterial;
        DeckOrigin = deckOrigin;
        RecoveryThreshold = recoveryThreshold;
        LaunchEnd = launchEnd;
        ResetLaunchFx();
    }

    public Transform Root { get; }
    public Transform Sky { get; }
    public Light Sun { get; }
    public Transform DeckOrigin { get; }
    public Transform RecoveryThreshold { get; }
    public Transform LaunchEnd { get; }
    public Transform CockpitCameraAnchor => _cockpitCameraAnchor;

    /// <summary>
    /// Create the canonical camera semantic under a Unity-axis vehicle root. The staged source
    /// remains exactly [0,.21,-1.8] in Three.js; the adapter reflects Z to [+1.8] for Unity.
    /// No exterior mesh, canopy, bezel or persistent prose is created.
    /// </summary>
    public Transform AttachCockpitCameraAnchor(Transform unityVehicleRoot) {
        if (unityVehicleRoot == null) throw new ArgumentNullException(nameof(unityVehicleRoot));
        if (_cockpitCameraAnchor == null) {
            _cockpitCameraAnchor = new GameObject(_manifest.camera.nodeName).transform;
        }
        _cockpitCameraAnchor.SetParent(unityVehicleRoot, false);
        _cockpitCameraAnchor.localPosition = RapierLaunchTableauBuilder.WebPosition(
            _manifest.camera.anchorLocalM);
        _cockpitCameraAnchor.localRotation = Quaternion.identity;
        _cockpitCameraAnchor.localScale = Vector3.one;
        return _cockpitCameraAnchor;
    }

    /// <summary>
    /// One-time camera binding. The future beat-12 bootstrap supplies the Unity vehicle root and
    /// continues to own pose/gimbal updates; this method only applies the canonical semantic datum
    /// and Web projection.
    /// </summary>
    public Transform BindSensorCamera(Camera camera, Transform unityVehicleRoot) {
        if (camera == null) throw new ArgumentNullException(nameof(camera));
        if (_boundSensorCamera != null && _boundSensorCamera != camera.transform) {
            throw new InvalidOperationException(
                "Rapier tableau already has a caller-owned sensor camera bound.");
        }
        Transform anchor = AttachCockpitCameraAnchor(unityVehicleRoot);
        camera.transform.SetParent(anchor, false);
        _boundSensorCamera = camera.transform;
        camera.transform.localPosition = Vector3.zero;
        camera.transform.localRotation = Quaternion.identity;
        camera.fieldOfView = _manifest.camera.projection.verticalFovDeg;
        camera.nearClipPlane = _manifest.camera.projection.nearClipM;
        camera.farClipPlane = _manifest.camera.projection.farClipM;
        camera.allowHDR = true;
        camera.allowMSAA = true;
        camera.clearFlags = CameraClearFlags.SolidColor;
        camera.backgroundColor = RapierLaunchTableauBuilder.LinearColor(
            _manifest.atmosphere.fogLowLinearRgb);
        return anchor;
    }

    /// <summary>Keep Web's camera-centred sky and altitude-dependent gradient in lockstep.</summary>
    public void SynchronizeView(Camera camera, float cameraAltitudeM) {
        if (camera == null) throw new ArgumentNullException(nameof(camera));
        Sky.position = camera.transform.position;
        Sky.rotation = Quaternion.identity;
        float altitude = Mathf.Max(0f, cameraAltitudeM);
        _skyMaterial.SetFloat("_AltitudeM", altitude);
        float[] blend = _manifest.atmosphere.altitudeBlendM;
        float altitudeUnit = Mathf.InverseLerp(blend[0], blend[1], altitude);
        float altitudeMix = Mathf.SmoothStep(0f, 1f, altitudeUnit);
        Vector3 low = RapierLaunchTableauBuilder.LinearVector(
            _manifest.atmosphere.fogLowLinearRgb);
        Vector3 high = RapierLaunchTableauBuilder.LinearVector(
            _manifest.atmosphere.fogHighLinearRgb);
        Vector3 fog = Vector3.Lerp(low, high, altitudeMix);
        var fogVector = new Vector4(fog.x, fog.y, fog.z, 1f);
        foreach (Material material in _materials) {
            if (material != null && material.HasProperty("_FogColor")) {
                material.SetVector("_FogColor", fogVector);
            }
        }
        Color fogColor = new Color(fog.x, fog.y, fog.z, 1f);
        RenderSettings.fogColor = fogColor;
        camera.backgroundColor = fogColor;
    }

    /// <summary>
    /// Project Web's deterministic catapult visual response. The caller must pass only authoritative
    /// <c>catapult_active</c> and <c>catapult_progress</c>. Delta is presentation/unscaled time,
    /// matching Web's render clock, and is clamped to Web's 100 ms maximum update step.
    /// </summary>
    public void SetLaunchState(bool active, float progress, float deltaSeconds) {
        RapierLaunchTableauManifest.DynamicFxRecord fx = _manifest.dynamicFx;
        progress = Mathf.Clamp01(progress);
        float delta = Mathf.Clamp(deltaSeconds, 0f, 0.1f);
        if (active) {
            if (!_strokeActive) {
                _strokeActive = true;
                _fadeRemainingS = 0f;
                _timeS = 0f;
                ResetFxTransforms();
                SetFxActive(true);
            }
        } else if (_strokeActive) {
            _strokeActive = false;
            _fadeRemainingS = fx.postHandoffFadeS;
        }

        if (!_strokeActive && _fadeRemainingS <= 0f) {
            ResetLaunchFx();
            return;
        }

        _timeS += delta;
        float ventOpacity;
        float portalOpacity;
        float railOpacity;
        if (_strokeActive) {
            ventOpacity = fx.vent.opacityBase + progress * fx.vent.opacityProgressGain;
            portalOpacity = progress > fx.portal.progressStart
                ? Mathf.Min(fx.portal.opacityMaximum,
                    (progress - fx.portal.progressStart)
                    / (1f - fx.portal.progressStart) * fx.portal.opacityMaximum)
                : 0f;
            railOpacity = fx.rail.opacityBase + progress * fx.rail.opacityProgressGain;
            _lastVentOpacity = ventOpacity;
            _lastPortalOpacity = portalOpacity;
            _lastRailOpacity = railOpacity;
        } else {
            _fadeRemainingS = Mathf.Max(0f, _fadeRemainingS - delta);
            float fade = _fadeRemainingS / fx.postHandoffFadeS;
            ventOpacity = _lastVentOpacity * fade * fx.vent.fadeMultiplier;
            portalOpacity = _lastPortalOpacity * fade;
            railOpacity = _lastRailOpacity * fade * fx.rail.fadeMultiplier;
            if (_fadeRemainingS <= 0f) {
                ResetLaunchFx();
                return;
            }
        }

        DrawHandle vents = Draw(fx.vent.drawName);
        DrawHandle portal = Draw(fx.portal.drawName);
        DrawHandle rail = Draw(fx.rail.drawName);
        float drift = _timeS * (fx.vent.driftRateBase
            + progress * fx.vent.driftRateProgressGain);
        SetWebLocalPosition(vents.Transform,
            fx.layout.catapultXM,
            0f,
            -((drift * fx.vent.driftScale) % fx.vent.driftModuloM));
        SetWebLocalPosition(portal.Transform,
            fx.layout.catapultXM,
            Mathf.Sin(_timeS * fx.portal.verticalOscillationRadPerS)
                * fx.portal.verticalOscillationM,
            WebRestZ(portal));
        SetWebLocalPosition(rail.Transform,
            fx.layout.catapultXM
                + Mathf.Sin(_timeS * fx.rail.lateralOscillationRadPerS)
                    * fx.rail.lateralOscillationM,
            0f,
            fx.layout.railStartZM - fx.layout.flatLengthM * progress);
        SetOpacity(vents.Material, ventOpacity);
        SetOpacity(portal.Material, portalOpacity);
        SetOpacity(rail.Material, railOpacity);
        UpdateRibLampColor(progress);
    }

    public void ResetLaunchFx() {
        _strokeActive = false;
        _fadeRemainingS = 0f;
        _timeS = 0f;
        _lastVentOpacity = 0f;
        _lastPortalOpacity = 0f;
        _lastRailOpacity = 0f;
        ResetFxTransforms();
        SetFxActive(false);
        RapierLaunchTableauManifest.RibLampFxRecord lamps = _manifest.dynamicFx.ribLamps;
        SetLinearRgb(Draw(lamps.drawName).Material, "_BaseColor", lamps.baseColorLinearRgb, 1f);
    }

    void UpdateRibLampColor(float progress) {
        RapierLaunchTableauManifest.RibLampFxRecord fx = _manifest.dynamicFx.ribLamps;
        Vector3 baseColor = RapierLaunchTableauBuilder.LinearVector(fx.baseColorLinearRgb);
        Vector3 hotColor = RapierLaunchTableauBuilder.LinearVector(fx.hotColorLinearRgb);
        Vector3 color;
        if (_strokeActive) {
            color = Vector3.Lerp(baseColor, hotColor,
                fx.activeMixBase + progress * fx.activeMixProgressGain);
            float pulse = fx.pulseBase + fx.pulseAmplitude
                * Mathf.Sin(_timeS * (fx.pulseRateBase + progress * fx.pulseRateProgressGain));
            color *= pulse;
        } else {
            float fade = _fadeRemainingS / _manifest.dynamicFx.postHandoffFadeS;
            color = Vector3.Lerp(baseColor, hotColor, fx.fadeMixGain * fade);
        }
        DrawHandle lamps = Draw(fx.drawName);
        lamps.Material.SetVector("_BaseColor", new Vector4(color.x, color.y, color.z, 1f));
    }

    void ResetFxTransforms() {
        RapierLaunchTableauManifest.DynamicFxRecord fx = _manifest.dynamicFx;
        DrawHandle vents = Draw(fx.vent.drawName);
        DrawHandle portal = Draw(fx.portal.drawName);
        DrawHandle rail = Draw(fx.rail.drawName);
        vents.Transform.localPosition = vents.RestPosition;
        portal.Transform.localPosition = portal.RestPosition;
        rail.Transform.localPosition = rail.RestPosition;
        SetOpacity(vents.Material, 0f);
        SetOpacity(portal.Material, 0f);
        SetOpacity(rail.Material, 0f);
    }

    void SetFxActive(bool active) {
        foreach (string drawId in _manifest.dynamicFx.pointDrawIds) {
            if (!_draws.TryGetValue(drawId, out DrawHandle handle)) {
                throw new InvalidOperationException("Missing staged Rapier FX draw " + drawId + ".");
            }
            handle.Transform.gameObject.SetActive(active);
        }
    }

    DrawHandle Draw(string name) {
        if (_draws.TryGetValue(name, out DrawHandle handle)) return handle;
        throw new InvalidOperationException("Missing staged Rapier draw " + name + ".");
    }

    static float WebRestZ(DrawHandle handle) => -handle.RestPosition.z;

    static void SetWebLocalPosition(Transform target, float x, float y, float z) {
        target.localPosition = new Vector3(x, y, -z);
    }

    static void SetOpacity(Material material, float opacity) {
        material.SetFloat("_Opacity", opacity);
    }

    static void SetLinearRgb(Material material, string property, float[] rgb, float alpha) {
        material.SetVector(property, new Vector4(rgb[0], rgb[1], rgb[2], alpha));
    }

    public void Dispose() {
        // The bootstrap owns the camera. Keep it alive when disposing the tableau-owned anchor.
        if (_boundSensorCamera != null && _boundSensorCamera.parent == _cockpitCameraAnchor) {
            _boundSensorCamera.SetParent(null, true);
        }
        _boundSensorCamera = null;
        if (_cockpitCameraAnchor != null) DestroyObject(_cockpitCameraAnchor.gameObject);
        if (Root != null) DestroyObject(Root.gameObject);
        foreach (Mesh mesh in _meshes) if (mesh != null) DestroyObject(mesh);
        foreach (Material material in _materials) if (material != null) DestroyObject(material);
    }

    static void DestroyObject(UnityEngine.Object value) {
        if (value == null) return;
        if (Application.isPlaying) UnityEngine.Object.Destroy(value);
        else UnityEngine.Object.DestroyImmediate(value);
    }

    internal sealed class DrawHandle {
        public string Id;
        public Transform Transform;
        public Material Material;
        public Vector3 RestPosition;
    }
}

/// <summary>
/// Builds the static world, atmosphere and inactive launch-FX geometry from the exact Web export.
/// Web→Unity conversion is one explicit Z reflection at this boundary; no Unity stand-in geometry
/// or second placement algorithm exists.
/// </summary>
public static class RapierLaunchTableauBuilder {
    const string LitShaderPath = "GunsOnly/Rapier/RapierTableauLit";
    const string SkyShaderPath = "GunsOnly/Rapier/RapierSoftWorldSky";
    const string FxShaderPath = "GunsOnly/Rapier/RapierLaunchFx";

    public static RapierLaunchTableau Build(Transform parent) =>
        BuildValidated(parent, RapierLaunchTableauManifest.LoadOrThrow());

    internal static RapierLaunchTableau BuildValidated(
        Transform parent,
        RapierLaunchTableauManifest.ManifestData manifest) {
        if (parent == null) throw new ArgumentNullException(nameof(parent));
        if (manifest == null) throw new ArgumentNullException(nameof(manifest));

        var root = new GameObject("RAPIER_LAUNCH_TABLEAU_WEB_BUILD_299").transform;
        root.SetParent(parent, false);
        var meshes = new List<Mesh>();
        var materials = new List<Material>();
        var materialById = BuildMaterials(manifest, materials);
        var draws = new Dictionary<string, RapierLaunchTableau.DrawHandle>(StringComparer.Ordinal);

        foreach (RapierLaunchTableauManifest.DrawRecord draw in manifest.draws) {
            Mesh mesh = BuildMesh(draw.geometry, draw.instances, draw.kind == "instanced-mesh",
                draw.id);
            meshes.Add(mesh);
            var go = new GameObject(draw.name);
            go.transform.SetParent(root, false);
            ApplyWebTransform(go.transform, draw.transform);
            go.SetActive(draw.visibleAtRest);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = materialById[draw.materialId];
            renderer.shadowCastingMode = draw.castShadow
                ? ShadowCastingMode.On : ShadowCastingMode.Off;
            renderer.receiveShadows = draw.receiveShadow;
            renderer.allowOcclusionWhenDynamic = draw.frustumCulled;
            renderer.sortingOrder = draw.renderOrder;
            var handle = new RapierLaunchTableau.DrawHandle {
                Id = draw.id,
                Transform = go.transform,
                Material = renderer.sharedMaterial,
                RestPosition = go.transform.localPosition,
            };
            draws.Add(draw.id, handle);
            draws.Add(draw.name, handle);
        }

        Mesh skyMesh = BuildMesh(manifest.sky.geometry, Array.Empty<RapierLaunchTableauManifest.TransformRecord>(),
            false, "sky");
        meshes.Add(skyMesh);
        Material skyMaterial = BuildSkyMaterial(manifest);
        materials.Add(skyMaterial);
        var skyGo = new GameObject(manifest.sky.name);
        skyGo.transform.SetParent(root, false);
        skyGo.AddComponent<MeshFilter>().sharedMesh = skyMesh;
        var skyRenderer = skyGo.AddComponent<MeshRenderer>();
        skyRenderer.sharedMaterial = skyMaterial;
        skyRenderer.shadowCastingMode = ShadowCastingMode.Off;
        skyRenderer.receiveShadows = false;
        skyRenderer.allowOcclusionWhenDynamic = false;
        skyRenderer.sortingOrder = manifest.sky.renderOrder;

        Light sun = BuildSun(root, manifest);
        ApplyGlobalPresentation(manifest);
        Transform deckOrigin = BuildSocket(root, manifest.platform.sockets[0]);
        Transform recoveryThreshold = BuildSocket(root, manifest.platform.sockets[1]);
        Transform launchEnd = BuildSocket(root, manifest.platform.sockets[2]);
        return new RapierLaunchTableau(
            manifest, root, skyGo.transform, sun, draws, meshes, materials, skyMaterial,
            deckOrigin, recoveryThreshold, launchEnd);
    }

    static Dictionary<string, Material> BuildMaterials(
        RapierLaunchTableauManifest.ManifestData manifest,
        List<Material> owned) {
        Shader lit = LoadShaderOrThrow(LitShaderPath);
        Shader fx = LoadShaderOrThrow(FxShaderPath);
        var result = new Dictionary<string, Material>(StringComparer.Ordinal);
        foreach (RapierLaunchTableauManifest.MaterialRecord source in manifest.materials) {
            bool points = source.shaderModel == "three-points";
            var material = new Material(points ? fx : lit) {
                name = "RAPIER_" + source.id.Replace('.', '_').ToUpperInvariant(),
                renderQueue = (source.transparent
                    ? (int)RenderQueue.Transparent : (int)RenderQueue.Geometry),
            };
            SetVector(material, "_BaseColor", source.colorLinearRgb, 1f);
            SetVector(material, "_EmissiveColor", source.emissiveLinearRgb, 1f);
            SetVector(material, "_SpecularColor", source.specularColorLinearRgb, 1f);
            material.SetFloat("_Roughness", source.roughness);
            material.SetFloat("_Metalness", source.metalness);
            material.SetFloat("_Ior", source.ior);
            material.SetFloat("_SpecularIntensity", source.specularIntensity);
            material.SetFloat("_Clearcoat", source.clearcoat);
            material.SetFloat("_ClearcoatRoughness", source.clearcoatRoughness);
            material.SetFloat("_EnvMapIntensity", source.envMapIntensity);
            material.SetFloat("_FinishGrain", source.finish.grain);
            material.SetFloat("_FinishScale", source.finish.grainScale);
            material.SetFloat("_PanelStrength", source.finish.panelStrength);
            material.SetFloat("_PanelScale", source.finish.panelScale);
            material.SetFloat("_Opacity", source.opacity);
            material.SetFloat("_Unlit", source.shaderModel == "three-mesh-basic" ? 1f : 0f);
            material.SetFloat("_ToneMapped", source.toneMapped ? 1f : 0f);
            material.SetFloat("_PointSize", source.pointSizePx);
            material.SetFloat("_Cull", source.side == "double"
                ? (float)CullMode.Off : source.side == "back"
                    ? (float)CullMode.Front : (float)CullMode.Back);
            material.SetFloat("_ZWrite", source.depthWrite ? 1f : 0f);
            material.SetFloat("_ZTest", source.depthTest
                ? (float)CompareFunction.LessEqual : (float)CompareFunction.Always);
            material.SetFloat("_OffsetFactor",
                source.polygonOffset ? source.polygonOffsetFactor : 0f);
            material.SetFloat("_OffsetUnits",
                source.polygonOffset ? source.polygonOffsetUnits : 0f);
            ApplySharedPresentation(material, manifest);
            owned.Add(material);
            result.Add(source.id, material);
        }
        return result;
    }

    static Material BuildSkyMaterial(RapierLaunchTableauManifest.ManifestData manifest) {
        var material = new Material(LoadShaderOrThrow(SkyShaderPath)) {
            name = "RAPIER_SOFT_WORLD_SKY_WEB_BUILD_299",
            renderQueue = (int)RenderQueue.Background,
        };
        RapierLaunchTableauManifest.SkyParametersRecord source = manifest.sky.softWorldParameters;
        SetVector(material, "_HorizonLow", source.horizonLowLinearRgb, 1f);
        SetVector(material, "_HorizonHigh", source.horizonHighLinearRgb, 1f);
        SetVector(material, "_ZenithLow", source.zenithLowLinearRgb, 1f);
        SetVector(material, "_ZenithHigh", source.zenithHighLinearRgb, 1f);
        SetVector(material, "_FogColor", manifest.atmosphere.fogLowLinearRgb, 1f);
        SetVector(material, "_HazeColor", manifest.atmosphere.hazeLinearRgb, 1f);
        SetVector(material, "_SunDirection", WebDirection(manifest.lighting.sunDirection), 0f);
        material.SetFloat("_HazeMix", manifest.atmosphere.hazeMix);
        material.SetFloat("_AltitudeM", manifest.sky.referenceAltitudeM);
        material.SetVector("_AltitudeBlendM", new Vector4(
            source.altitudeBlendM[0], source.altitudeBlendM[1], 0f, 0f));
        material.SetFloat("_SkyCurveLow", source.skyCurveLow);
        material.SetFloat("_SkyCurveHigh", source.skyCurveHigh);
        material.SetFloat("_ShoulderFalloff", source.shoulderFalloff);
        material.SetFloat("_ShoulderGain", source.shoulderGain);
        material.SetFloat("_ShoulderWeight", source.shoulderWeight);
        material.SetFloat("_BelowFalloff", source.belowHorizonFalloff);
        material.SetFloat("_SunCoreExponent", source.sunCoreExponent);
        material.SetFloat("_SunBloomExponent", source.sunBloomExponent);
        material.SetFloat("_SunHaloExponent", source.sunHaloExponent);
        material.SetFloat("_SunCoreGain", source.sunCoreGain);
        material.SetFloat("_SunBloomGain", source.sunBloomGain);
        material.SetFloat("_SunHaloGain", source.sunHaloGain);
        material.SetFloat("_Exposure", manifest.output.exposure);
        return material;
    }

    static void ApplySharedPresentation(
        Material material,
        RapierLaunchTableauManifest.ManifestData manifest) {
        SetVector(material, "_SunDirection", WebDirection(manifest.lighting.sunDirection), 0f);
        SetVector(material, "_SunColor", manifest.lighting.sunColorLinearRgb, 1f);
        SetVector(material, "_SkyColor", manifest.lighting.hemisphereSkyLinearRgb, 1f);
        SetVector(material, "_GroundColor", manifest.lighting.hemisphereGroundLinearRgb, 1f);
        SetVector(material, "_FogColor", manifest.atmosphere.fogLowLinearRgb, 1f);
        SetVector(material, "_HazeColor", manifest.atmosphere.hazeLinearRgb, 1f);
        material.SetFloat("_SunIntensity", manifest.lighting.sunIntensity);
        material.SetFloat("_HemisphereIntensity", manifest.lighting.hemisphereIntensity);
        material.SetFloat("_FogDensity", manifest.atmosphere.clearAirFogDensityPerM);
        material.SetFloat("_FogDensityScale", manifest.atmosphere.fogDensityScale);
        material.SetFloat("_HazeMix", manifest.atmosphere.hazeMix);
        material.SetFloat("_Exposure", manifest.output.exposure);
    }

    static Mesh BuildMesh(
        RapierLaunchTableauManifest.GeometryRecord geometry,
        RapierLaunchTableauManifest.TransformRecord[] instances,
        bool instanced,
        string label) {
        float[] sourcePositions = RapierLaunchTableauManifest.DecodeFloatAttributeOrThrow(
            geometry.attributes.position, 3, geometry.vertexCount, label + ".position");
        float[] sourceNormals = geometry.attributes.normal == null ? null
            : RapierLaunchTableauManifest.DecodeFloatAttributeOrThrow(
                geometry.attributes.normal, 3, geometry.vertexCount, label + ".normal");
        float[] sourceUv = geometry.attributes.uv == null ? null
            : RapierLaunchTableauManifest.DecodeFloatAttributeOrThrow(
                geometry.attributes.uv, 2, geometry.vertexCount, label + ".uv");
        uint[] sourceIndices = geometry.index == null ? null
            : RapierLaunchTableauManifest.DecodeIndexAttributeOrThrow(
                geometry.index, label + ".index");
        int copies = instanced ? instances.Length : 1;
        int sourceElements = sourceIndices?.Length ?? geometry.vertexCount;
        var vertices = new Vector3[checked(geometry.vertexCount * copies)];
        var finishPositions = new List<Vector3>(vertices.Length);
        var normals = sourceNormals == null ? null : new Vector3[vertices.Length];
        var uv = sourceUv == null ? null : new Vector2[vertices.Length];
        var indices = new int[checked(sourceElements * copies)];

        for (int copy = 0; copy < copies; copy++) {
            Matrix4x4 transform = instanced ? UnityMatrix(instances[copy]) : Matrix4x4.identity;
            Matrix4x4 normalTransform = transform.inverse.transpose;
            int vertexOffset = copy * geometry.vertexCount;
            for (int vertex = 0; vertex < geometry.vertexCount; vertex++) {
                int source3 = vertex * 3;
                Vector3 webLocal = new Vector3(
                    sourcePositions[source3], sourcePositions[source3 + 1], sourcePositions[source3 + 2]);
                Vector3 unityLocal = new Vector3(webLocal.x, webLocal.y, -webLocal.z);
                vertices[vertexOffset + vertex] = transform.MultiplyPoint3x4(unityLocal);
                // The Web finish shader samples pre-instance, pre-reflection geometry position.
                finishPositions.Add(webLocal);
                if (normals != null) {
                    Vector3 webNormal = new Vector3(
                        sourceNormals[source3], sourceNormals[source3 + 1], sourceNormals[source3 + 2]);
                    Vector3 unityNormal = new Vector3(webNormal.x, webNormal.y, -webNormal.z);
                    normals[vertexOffset + vertex] = normalTransform.MultiplyVector(unityNormal).normalized;
                }
                if (uv != null) {
                    int source2 = vertex * 2;
                    uv[vertexOffset + vertex] = new Vector2(
                        sourceUv[source2], sourceUv[source2 + 1]);
                }
            }
            int indexOffset = copy * sourceElements;
            for (int element = 0; element < sourceElements; element++) {
                uint sourceIndex = sourceIndices != null
                    ? sourceIndices[element] : (uint)element;
                indices[indexOffset + element] = vertexOffset + (int)sourceIndex;
            }
            // The single Web→Unity Z reflection reverses winding once.
            if (geometry.topology == "triangles") {
                for (int triangle = 0; triangle < sourceElements; triangle += 3) {
                    int left = indexOffset + triangle + 1;
                    int right = indexOffset + triangle + 2;
                    (indices[left], indices[right]) = (indices[right], indices[left]);
                }
            }
        }

        var mesh = new Mesh {
            name = "RAPIER_" + label.Replace('.', '_').ToUpperInvariant() + "_GEOMETRY",
            indexFormat = vertices.Length > ushort.MaxValue ? IndexFormat.UInt32 : IndexFormat.UInt16,
            vertices = vertices,
        };
        if (normals != null) mesh.normals = normals;
        if (uv != null) mesh.uv = uv;
        mesh.SetUVs(1, finishPositions);
        mesh.SetIndices(indices,
            geometry.topology == "points" ? MeshTopology.Points : MeshTopology.Triangles,
            0,
            calculateBounds: true);
        mesh.RecalculateBounds();
        return mesh;
    }

    static Transform BuildSocket(
        Transform root,
        RapierLaunchTableauManifest.SocketRecord source) {
        var socket = new GameObject(source.nodeName).transform;
        socket.SetParent(root, false);
        socket.localPosition = WebPosition(source.positionLocalM);
        return socket;
    }

    static Light BuildSun(
        Transform root,
        RapierLaunchTableauManifest.ManifestData manifest) {
        var go = new GameObject("RAPIER_SUN_WEB_BUILD_299");
        go.transform.SetParent(root, false);
        var light = go.AddComponent<Light>();
        light.type = LightType.Directional;
        Vector3 direction = WebDirection(manifest.lighting.sunDirection);
        light.transform.rotation = Quaternion.LookRotation(-direction, Vector3.up);
        light.color = LinearColor(manifest.lighting.sunColorLinearRgb);
        light.intensity = manifest.lighting.sunIntensity;
        light.shadows = LightShadows.Soft;
        light.shadowNearPlane = manifest.lighting.shadow.nearClipM;
        light.shadowBias = Mathf.Abs(manifest.lighting.shadow.depthBias);
        light.shadowNormalBias = manifest.lighting.shadow.normalBias;
        return light;
    }

    static void ApplyGlobalPresentation(RapierLaunchTableauManifest.ManifestData manifest) {
        RenderSettings.ambientMode = AmbientMode.Trilight;
        Color sky = LinearColor(manifest.lighting.hemisphereSkyLinearRgb)
            * manifest.lighting.hemisphereIntensity;
        Color ground = LinearColor(manifest.lighting.hemisphereGroundLinearRgb)
            * manifest.lighting.hemisphereIntensity;
        RenderSettings.ambientSkyColor = sky;
        RenderSettings.ambientEquatorColor = Color.Lerp(ground, sky, 0.5f);
        RenderSettings.ambientGroundColor = ground;
        RenderSettings.fog = true;
        RenderSettings.fogMode = FogMode.ExponentialSquared;
        RenderSettings.fogColor = LinearColor(manifest.atmosphere.fogLowLinearRgb);
        RenderSettings.fogDensity = manifest.atmosphere.clearAirFogDensityPerM
            * manifest.atmosphere.fogDensityScale;
    }

    internal static Vector3 WebPosition(float[] value) =>
        new Vector3(value[0], value[1], -value[2]);

    internal static Vector3 WebDirection(float[] value) => WebPosition(value).normalized;

    internal static Quaternion WebQuaternion(float[] value) =>
        new Quaternion(-value[0], -value[1], value[2], value[3]);

    internal static Vector3 LinearVector(float[] value) =>
        new Vector3(value[0], value[1], value[2]);

    internal static Color LinearColor(float[] value) =>
        new Color(value[0], value[1], value[2], 1f);

    static Matrix4x4 UnityMatrix(RapierLaunchTableauManifest.TransformRecord value) =>
        Matrix4x4.TRS(WebPosition(value.position), WebQuaternion(value.quaternion),
            new Vector3(value.scale[0], value.scale[1], value.scale[2]));

    static void ApplyWebTransform(
        Transform target,
        RapierLaunchTableauManifest.TransformRecord source) {
        target.localPosition = WebPosition(source.position);
        target.localRotation = WebQuaternion(source.quaternion);
        target.localScale = new Vector3(source.scale[0], source.scale[1], source.scale[2]);
    }

    static Shader LoadShaderOrThrow(string path) {
        Shader shader = Resources.Load<Shader>(path);
        if (shader == null) {
            throw new InvalidOperationException("Missing retained Rapier shader " + path + ".");
        }
        return shader;
    }

    static void SetVector(Material material, string property, float[] rgb, float alpha) {
        material.SetVector(property, new Vector4(rgb[0], rgb[1], rgb[2], alpha));
    }

    static void SetVector(Material material, string property, Vector3 xyz, float w) {
        material.SetVector(property, new Vector4(xyz.x, xyz.y, xyz.z, w));
    }
}

}
