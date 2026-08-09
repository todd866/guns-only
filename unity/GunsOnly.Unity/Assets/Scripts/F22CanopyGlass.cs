using GunsOnly.UnityBridge;
using UnityEngine;
using UnityEngine.Rendering;

namespace GunsOnly.UnityClient {

/// <summary>
/// F-22 live-cockpit shell plus the Web pilot-reflection cue. The mid-axis lines remain omitted:
/// they conflict with the Unity HUD, while the shell/reflection retain the low-text canopy anchor.
/// </summary>
public sealed class F22CanopyGlass : MonoBehaviour {
    Transform _shell;
    Transform _reflection;
    Material _glassMaterial;
    Material _reflectionMaterial;

    public static F22CanopyGlass Attach(Transform parent) {
        var go = new GameObject("F22CanopyGlass");
        go.transform.SetParent(parent, false);
        var glass = go.AddComponent<F22CanopyGlass>();
        glass.Build();
        return glass;
    }

    void Build() {
        Shader shader = Resources.Load<Shader>("GunsOnly/F22Canopy")
            ?? Shader.Find("GunsOnly/F22Canopy")
            ?? Shader.Find("Sprites/Default");
        _glassMaterial = MakeMaterial(
            shader,
            F22PresentationContract.CanopyColor,
            F22PresentationContract.CanopyFresnelColor,
            F22PresentationContract.CanopyShellOpacity,
            F22PresentationContract.CanopyFresnelOpacity,
            F22PresentationContract.CanopyFresnelPower,
            cull: CullMode.Front,
            renderQueue: 3000,
            name: "F22_CANOPY_GLASS");
        _reflectionMaterial = MakeMaterial(
            shader,
            F22PresentationContract.ReflectionColor,
            F22PresentationContract.ReflectionColor,
            F22PresentationContract.ReflectionOpacity,
            fresnelOpacity: 0f,
            fresnelPower: 1f,
            cull: CullMode.Off,
            renderQueue: 3001,
            name: "F22_CANOPY_PILOT_REFLECTION");

        var shellGo = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        shellGo.name = "CanopyShell";
        Object.Destroy(shellGo.GetComponent<Collider>());
        _shell = shellGo.transform;
        _shell.SetParent(transform, false);
        // Unity's primitive sphere has radius 0.5; Web SphereGeometry has radius 1.
        _shell.localScale = new Vector3(1.45f, 0.78f, 1.8f) * 2f;
        _shell.localPosition = new Vector3(0f, -0.42f, 0.32f);
        var shellRenderer = shellGo.GetComponent<Renderer>();
        shellRenderer.sharedMaterial = _glassMaterial;
        shellRenderer.shadowCastingMode = ShadowCastingMode.Off;
        shellRenderer.receiveShadows = false;

        var reflectionGo = GameObject.CreatePrimitive(PrimitiveType.Quad);
        reflectionGo.name = "CanopyPilotReflection";
        Object.Destroy(reflectionGo.GetComponent<Collider>());
        _reflection = reflectionGo.transform;
        _reflection.SetParent(transform, false);
        _reflection.localScale = new Vector3(0.48f, 0.68f, 1f);
        var reflectionRenderer = reflectionGo.GetComponent<Renderer>();
        reflectionRenderer.sharedMaterial = _reflectionMaterial;
        reflectionRenderer.shadowCastingMode = ShadowCastingMode.Off;
        reflectionRenderer.receiveShadows = false;
        reflectionRenderer.sortingOrder = 1;
        ApplyReflection(F22PresentationContract.ReflectionForAzimuth(0f));
    }

    public void Sync(
        Vector3 eyeWorld,
        Quaternion bodyRotation,
        Quaternion lookRotation,
        bool visible) {
        transform.position = eyeWorld;
        transform.rotation = bodyRotation;
        gameObject.SetActive(visible);
        if (!visible || _reflection == null) return;

        Vector3 localLook = Quaternion.Inverse(bodyRotation) * (lookRotation * Vector3.forward);
        float azimuth = Mathf.Atan2(localLook.x, localLook.z);
        ApplyReflection(F22PresentationContract.ReflectionForAzimuth(azimuth));
    }

    void ApplyReflection(ReflectionPose pose) {
        _reflection.localPosition = new Vector3(pose.X, pose.Y, pose.ZUnity);
        _reflection.localRotation = Quaternion.Euler(
            pose.PitchRadUnity * Mathf.Rad2Deg,
            pose.YawRadUnity * Mathf.Rad2Deg,
            0f);
    }

    static Material MakeMaterial(
        Shader shader,
        LinearRgb baseColor,
        LinearRgb fresnelColor,
        float baseOpacity,
        float fresnelOpacity,
        float fresnelPower,
        CullMode cull,
        int renderQueue,
        string name) {
        var material = new Material(shader) { name = name, renderQueue = renderQueue };
        material.SetVector("_BaseColor", new Vector4(baseColor.R, baseColor.G, baseColor.B, 1f));
        material.SetVector(
            "_FresnelColor",
            new Vector4(fresnelColor.R, fresnelColor.G, fresnelColor.B, 1f));
        material.SetFloat("_BaseOpacity", baseOpacity);
        material.SetFloat("_FresnelOpacity", fresnelOpacity);
        material.SetFloat("_FresnelPower", fresnelPower);
        material.SetFloat("_Cull", (float)cull);
        if (material.HasProperty("_Color")) {
            material.SetColor("_Color", new Color(
                baseColor.R, baseColor.G, baseColor.B, baseOpacity));
        }
        return material;
    }

    void OnDestroy() {
        if (_glassMaterial != null) Destroy(_glassMaterial);
        if (_reflectionMaterial != null) Destroy(_reflectionMaterial);
    }
}

}
