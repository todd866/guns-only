using System;
using GunsOnly.UnityBridge;
using UnityEngine;
using UnityEngine.Rendering;

namespace GunsOnly.UnityClient {

/// <summary>Frozen Web F-22 warm-combat sky, specialized to the Ukraine theatre.</summary>
public sealed class BrowserParitySky {
    public const string ShaderResourcePath = "GunsOnly/UkraineModern/F22UkraineCombatSky";

    readonly GameObject _meshObject;
    readonly Material _material;

    BrowserParitySky(GameObject meshObject, Material material) {
        _meshObject = meshObject;
        _material = material;
    }

    public void Apply(float altM, Camera cam) {
        LinearRgb fogLinear = F22UkraineVisualContract.FogForAltitude(altM);
        Color fog = ToColor(fogLinear);
        _material.SetFloat("_AltitudeM", Mathf.Max(0f, altM));
        _material.SetVector("_FogColor", ToVector(fogLinear));
        if (cam != null) {
            _meshObject.transform.position = cam.transform.position;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = fog;
        }
        RenderSettings.fogColor = fog;
        RenderSettings.fogDensity = F22UkraineVisualContract.BaseFogDensityPerM
            * F22UkraineVisualContract.AtmosphereDensityScale;
    }

    public static BrowserParitySky Attach(Transform parent) {
        Shader shader = Resources.Load<Shader>(ShaderResourcePath)
            ?? Shader.Find("GunsOnly/F22UkraineCombatSky");
        if (shader == null) {
            throw new InvalidOperationException(
                "Missing retained F-22 Ukraine combat sky shader at Resources/"
                + ShaderResourcePath);
        }

        var material = new Material(shader) {
            name = "F22_UKRAINE_WARM_COMBAT_SKY",
            renderQueue = (int)RenderQueue.Background,
        };
        F22Vector3 sun = F22PresentationContract.SunDirectionUnity;
        material.SetVector("_SunDirection", new Vector4(sun.X, sun.Y, sun.Z, 0f));
        material.SetVector(
            "_AtmosphereHazeColor",
            ToVector(F22UkraineVisualContract.AtmosphereHaze));
        material.SetFloat(
            "_AtmosphereHazeMix",
            F22UkraineVisualContract.AtmosphereHazeMix);

        var sphere = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        sphere.name = "F22UkraineCombatSky";
        sphere.transform.SetParent(parent, false);
        // Unity's primitive radius is 0.5; Web SphereGeometry radius is 4096 m.
        sphere.transform.localScale = Vector3.one * 8192f;
        UnityEngine.Object.Destroy(sphere.GetComponent<Collider>());
        var renderer = sphere.GetComponent<MeshRenderer>();
        renderer.sharedMaterial = material;
        renderer.shadowCastingMode = ShadowCastingMode.Off;
        renderer.receiveShadows = false;
        return new BrowserParitySky(sphere, material);
    }

    public void Dispose() {
        if (_material != null) UnityEngine.Object.Destroy(_material);
        if (_meshObject != null) UnityEngine.Object.Destroy(_meshObject);
    }

    static Color ToColor(LinearRgb value) => new(value.R, value.G, value.B, 1f);
    static Vector4 ToVector(LinearRgb value) => new(value.R, value.G, value.B, 1f);
}

}
