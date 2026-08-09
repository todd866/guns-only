using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>Build 299 sky and fog, driven only by the portable visual contract.</summary>
public static class AtmosphereExtras {
    public static void Build(Transform parent, Camera cam) {
        CobraVisualContract contract = CobraVisualContract.LoadOrThrow();
        var root = new GameObject("AtmosphereExtras").transform;
        root.SetParent(parent, false);

        if (cam != null) {
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = contract.Lighting.FogColorLinear;
            cam.allowHDR = false;
            cam.allowMSAA = true;
            cam.fieldOfView = contract.AcceptanceProjection.VerticalFovDeg;
            cam.nearClipPlane = contract.AcceptanceProjection.NearClipM;
            cam.farClipPlane = contract.AcceptanceProjection.FarClipM;
        }

        RenderSettings.fog = true;
        RenderSettings.fogMode = FogMode.ExponentialSquared;
        RenderSettings.fogColor = contract.Lighting.FogColorLinear;
        RenderSettings.fogDensity = contract.Lighting.FogDensityPerM;
        BuildSkyDome(root, contract);
    }

    static void BuildSkyDome(Transform root, CobraVisualContract contract) {
        var dome = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        dome.name = "COBRA_CANYON_LAB_SKY";
        Object.Destroy(dome.GetComponent<Collider>());
        dome.transform.SetParent(root, false);
        dome.transform.localScale = Vector3.one * 46000f; // Sphere radius .5 => Web radius 23 km.
        var renderer = dome.GetComponent<MeshRenderer>();
        var material = GunsOnlyMats.Sky();
        SetLinearVector(material, "_Zenith", contract.Sky.Zenith);
        SetLinearVector(material, "_Horizon", contract.Sky.Horizon);
        SetLinearVector(material, "_BelowHorizon", contract.Sky.BelowHorizon);
        SetLinearVector(material, "_CloudColor", contract.Sky.Cloud);
        material.SetVector("_CloudShelf", contract.Sky.CloudShelf);
        material.SetFloat("_SkyCurveExponent", contract.Sky.SkyCurveExponent);
        material.SetFloat("_ShoulderFalloff", contract.Sky.HorizonShoulderFalloff);
        material.SetFloat("_ShoulderWeight", contract.Sky.HorizonShoulderWeight);
        material.SetFloat("_Exposure", contract.OutputTransform.Exposure);
        Vector3 sun = contract.Lighting.SunDirectionUnity;
        material.SetVector("_SunDir", new Vector4(sun.x, sun.y, sun.z, 0f));
        renderer.sharedMaterial = material;
        renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        renderer.receiveShadows = false;
    }

    static void SetLinearVector(Material material, string name, Color value) {
        material.SetVector(name, new Vector4(value.r, value.g, value.b, value.a));
    }
}

}
