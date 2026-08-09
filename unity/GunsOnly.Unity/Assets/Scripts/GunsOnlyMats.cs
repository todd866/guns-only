using System;
using UnityEngine;
using UnityEngine.Rendering;

namespace GunsOnly.UnityClient {

/// <summary>
/// Materials that must survive Mac player stripping. Prefabs under
/// <c>Resources/GunsOnly/</c> pin the GunsOnly/* shaders into the build;
/// runtime code clones them rather than <c>Shader.Find</c> alone.
/// </summary>
public static class GunsOnlyMats {
    static Texture2D _webMistMask;

    public static Material Clone(string resourcesPath) {
        var src = Resources.Load<Material>(resourcesPath);
        if (src != null) return new Material(src);
        Debug.LogWarning("[GunsOnly] missing Resources material " + resourcesPath);
        var sh = Shader.Find("Legacy Shaders/Diffuse")
            ?? Shader.Find("Unlit/Color")
            ?? Shader.Find("Sprites/Default");
        return new Material(sh);
    }

    public static Material Terrain(Texture albedo) {
        CobraVisualContract contract = CobraVisualContract.LoadOrThrow();
        CobraVisualContract.TerrainMaterialSpec paint = contract.TerrainMaterial;
        CobraVisualContract.GroundMacroSpec ground = contract.GroundMacro;
        var mat = Clone("GunsOnly/BasinLit");
        ConfigureGroundTexture(albedo, TextureWrapMode.Mirror);
        SetTexture(mat, "_GroundMacro", albedo);
        SetFloat(mat, "_HasGroundMacro", albedo != null ? 1f : 0f);
        ApplyCobraShared(mat, contract);
        SetFloat(mat, "_ShadowFloor", contract.Lighting.ShadowFloor);
        SetVector(mat, "_OcclusionRange", paint.OcclusionRange);
        SetVector(mat, "_SlopeFaceWindow", paint.SlopeFaceWindow);
        float[] toneRamp = paint.ToneRampGates;
        SetVector(mat, "_ToneGateLow", new Vector4(toneRamp[0], toneRamp[1], 0f, 0f));
        SetVector(mat, "_ToneGateHigh", new Vector4(toneRamp[3], toneRamp[4], 0f, 0f));
        SetVector(mat, "_ToneGateWeights", new Vector4(toneRamp[2], toneRamp[5], 0f, 0f));
        SetFloat(mat, "_ReliefGain", paint.ReliefGain);
        SetFloat(mat, "_CloudShadowStrength", paint.CloudShadowStrength);
        SetFloat(mat, "_MicroNormalStrength", paint.MicroNormalStrength);
        SetVector(mat, "_ParcelPitchM", paint.ParcelPitchM);
        SetLinearVector(mat, "_SkyFill", paint.SkyFill);
        SetLinearVector(mat, "_SunKey", paint.SunKey);
        float[] elevationBands = paint.ElevationBandsM;
        SetVector(mat, "_ElevationBands", new Vector4(
            elevationBands[0], elevationBands[1], elevationBands[2], elevationBands[3]));
        SetFloat(mat, "_GroundMacroRepeatM", ground.MacroSample.RepeatM);
        SetVector(mat, "_GroundMacroPhase", ground.MacroSample.Phase);
        SetFloat(mat, "_GroundNearRepeatM", ground.NearSample.RepeatM);
        SetVector(mat, "_GroundNearRotation", ground.NearSample.RotationRowMajor2x2);
        SetFloat(mat, "_GroundNearWeightExponent", ground.NearSample.TriplanarWeightExponent);
        SetVector(mat, "_GroundNearPhaseHorizontal", ground.NearSample.PhaseByPlane.Horizontal);
        SetVector(mat, "_GroundNearPhaseEastFacing", ground.NearSample.PhaseByPlane.EastFacing);
        SetVector(mat, "_GroundNearPhaseNorthSouthFacing",
            ground.NearSample.PhaseByPlane.NorthSouthFacing);
        SetLinearVector(mat, "_ValleyFloor", contract.Palette.ValleyFloor);
        SetLinearVector(mat, "_CultivationGold", contract.Palette.Cultivation);
        SetLinearVector(mat, "_JungleMid", contract.Palette.Jungle);
        SetLinearVector(mat, "_LateriteSlope", contract.Palette.Laterite);
        SetLinearVector(mat, "_RidgeSage", contract.Palette.Ridge);
        SetLinearVector(mat, "_RimRock", contract.Palette.RimRock);
        return mat;
    }

    public static Material River(Texture groundMacro = null) {
        CobraVisualContract contract = CobraVisualContract.LoadOrThrow();
        var mat = Clone("GunsOnly/RiverWater");
        ConfigureGroundTexture(groundMacro, TextureWrapMode.Mirror);
        SetTexture(mat, "_GroundMacro", groundMacro);
        SetFloat(mat, "_HasGroundMacro", groundMacro != null ? 1f : 0f);
        ApplyCobraShared(mat, contract);
        SetLinearVector(mat, "_DeepWater", contract.Palette.DeepWater);
        SetLinearVector(mat, "_ShallowWater", contract.Palette.ShallowWater);
        SetLinearVector(mat, "_BankGravel", new Color(0.100f, 0.112f, 0.064f, 1f));
        SetLinearVector(mat, "_BankLight", FlatGroundLight(contract));
        SetVector(mat, "_ShoreWindow", new Vector2(0.86f, 1.10f));
        SetFloat(mat, "_GroundMacroRepeatM", contract.GroundMacro.MacroSample.RepeatM);
        SetVector(mat, "_GroundMacroPhase", contract.GroundMacro.MacroSample.Phase);
        return mat;
    }

    public static Material CobraAsset(string role, Texture foliageAtlas) {
        CobraVisualContract contract = CobraVisualContract.LoadOrThrow();
        Material mat;
        if (role == "jungle") {
            mat = Clone("GunsOnly/CobraFoliage");
            ConfigureGroundTexture(foliageAtlas, TextureWrapMode.Clamp);
            SetTexture(mat, "_MainTex", foliageAtlas);
            SetFloat(mat, "_Cutoff", contract.FoliageAtlas.AlphaCutoff);
        } else if (role is "mist" or "waterAccent") {
            mat = Clone("GunsOnly/CobraMist");
            SetFloat(mat, "_Opacity", role == "mist" ? 0.14f : 0.004f);
            SetFloat(mat, "_HasMask", role == "mist" ? 1f : 0f);
            SetTexture(mat, "_MainTex", role == "mist" ? WebMistMask() : Texture2D.whiteTexture);
            SetLinearVector(mat, "_BaseColor", CobraVisualContract.SrgbHexToLinear(
                role == "mist" ? "#d8e5e1" : "#6c8c86"));
        } else {
            mat = Clone("GunsOnly/CobraAsset");
            SetLinearVector(mat, "_SunColor", contract.Lighting.SunColorLinear);
            SetFloat(mat, "_SunIntensity", contract.Lighting.SunIntensity);
            SetLinearVector(mat, "_SkyColor", contract.Lighting.HemisphereSkyColorLinear);
            SetLinearVector(mat, "_GroundColor", contract.Lighting.HemisphereGroundColorLinear);
            SetFloat(mat, "_HemisphereIntensity", contract.Lighting.HemisphereIntensity);
        }
        ApplyCobraShared(mat, contract);
        return mat;
    }

    public static Material CobraCore(
        string role,
        Color baseColor,
        Color emissiveColor,
        float opacity,
        bool transparent,
        bool doubleSided,
        bool depthWrite,
        bool polygonOffset,
        float polygonOffsetFactor,
        float polygonOffsetUnits,
        int renderOrder) {
        CobraVisualContract contract = CobraVisualContract.LoadOrThrow();
        var mat = Clone(transparent
            ? "GunsOnly/CobraTransparentAsset"
            : "GunsOnly/CobraAsset");
        SetLinearVector(mat, "_BaseColor", baseColor);
        SetLinearVector(mat, "_EmissiveColor", emissiveColor);
        SetFloat(mat, "_Opacity", opacity);
        SetLinearVector(mat, "_SunColor", contract.Lighting.SunColorLinear);
        SetFloat(mat, "_SunIntensity", contract.Lighting.SunIntensity);
        SetLinearVector(mat, "_SkyColor", contract.Lighting.HemisphereSkyColorLinear);
        SetLinearVector(mat, "_GroundColor", contract.Lighting.HemisphereGroundColorLinear);
        SetFloat(mat, "_HemisphereIntensity", contract.Lighting.HemisphereIntensity);
        SetFloat(mat, "_Cull", doubleSided ? (float)CullMode.Off : (float)CullMode.Back);
        SetFloat(mat, "_ZWrite", depthWrite ? 1f : 0f);
        SetFloat(mat, "_SrcBlend", transparent ? (float)BlendMode.SrcAlpha : (float)BlendMode.One);
        SetFloat(mat, "_DstBlend", transparent
            ? (float)BlendMode.OneMinusSrcAlpha : (float)BlendMode.Zero);
        SetFloat(mat, "_OffsetFactor", polygonOffset ? polygonOffsetFactor : 0f);
        SetFloat(mat, "_OffsetUnits", polygonOffset ? polygonOffsetUnits : 0f);
        mat.SetOverrideTag("RenderType", transparent ? "Transparent" : "Opaque");
        mat.renderQueue = (transparent ? (int)RenderQueue.Transparent : (int)RenderQueue.Geometry)
            + renderOrder;
        mat.name = "COBRA_CANYON_" + role.ToUpperInvariant().Replace('-', '_') + "_MATERIAL";
        ApplyCobraShared(mat, contract);
        return mat;
    }

    public static Material Sky() => Clone("GunsOnly/SkyDome");

    public static Material Skin(Color color, float gloss = 0.12f, Color? emission = null) {
        var mat = Clone("GunsOnly/LitSkin");
        if (mat.HasProperty("_Color")) mat.SetColor("_Color", color);
        if (mat.HasProperty("_Shininess")) mat.SetFloat("_Shininess", gloss);
        if (emission.HasValue && mat.HasProperty("_Emission"))
            mat.SetColor("_Emission", emission.Value);
        return mat;
    }

    static void ApplyCobraShared(Material mat, CobraVisualContract contract) {
        Vector3 sun = contract.Lighting.SunDirectionUnity;
        SetVector(mat, "_SunDirection", new Vector4(sun.x, sun.y, sun.z, 0f));
        SetVector(mat, "_SunDir", new Vector4(sun.x, sun.y, sun.z, 0f));
        SetLinearVector(mat, "_FogColor", contract.Lighting.FogColorLinear);
        SetFloat(mat, "_FogDensity", contract.Lighting.FogDensityPerM);
        SetFloat(mat, "_Exposure", contract.OutputTransform.Exposure);
    }

    static Color FlatGroundLight(CobraVisualContract contract) {
        float halfLambert = Mathf.Pow(contract.Lighting.SunDirectionAuthority.y * 0.5f + 0.5f, 2f);
        float[] gates = contract.TerrainMaterial.ToneRampGates;
        float ramp = gates[2] * SmoothStep(gates[0], gates[1], halfLambert)
            + gates[5] * SmoothStep(gates[3], gates[4], halfLambert);
        float tone = contract.Lighting.ShadowFloor
            + (1f - contract.Lighting.ShadowFloor) * ramp;
        float carry = 0.72f + tone * 0.28f;
        Color skyFill = contract.TerrainMaterial.SkyFill;
        Color sunKey = contract.TerrainMaterial.SunKey;
        return Color.Lerp(skyFill, sunKey, tone) * carry;
    }

    static void ConfigureGroundTexture(Texture texture, TextureWrapMode wrapMode) {
        if (texture == null) return;
        texture.wrapMode = wrapMode;
        texture.filterMode = FilterMode.Trilinear;
        texture.anisoLevel = Mathf.Max(4, texture.anisoLevel);
    }

    /// <summary>
    /// Exact 64x32 byte-quantized mask created by Web's createMistTexture(). It stays linear:
    /// THREE.DataTexture has no sRGB color-space tag, so its RGB bytes are shader values.
    /// </summary>
    static Texture2D WebMistMask() {
        if (_webMistMask != null) return _webMistMask;
        const int width = 64;
        const int height = 32;
        var pixels = new Color32[width * height];
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                double nx = (x + 0.5) / width * 2.0 - 1.0;
                double ny = (y + 0.5) / height * 2.0 - 1.0;
                double ellipse = Math.Max(0.0, 1.0 - Math.Sqrt(
                    nx * 0.86 * nx * 0.86 + ny * 1.34 * ny * 1.34));
                double edge = ellipse * ellipse * (3.0 - 2.0 * ellipse);
                double breakup = 0.78 + 0.22 * Math.Sin(
                    x * 0.47 + Math.Sin(y * 0.31) * 1.7);
                byte alpha = (byte)Math.Max(0, Math.Min(255,
                    Math.Floor(255.0 * edge * breakup + 0.5)));
                pixels[y * width + x] = new Color32(222, 232, 230, alpha);
            }
        }
        _webMistMask = new Texture2D(width, height, TextureFormat.RGBA32, false, true) {
            name = "COBRA_CANYON_SOFT_MIST_MASK",
            wrapMode = TextureWrapMode.Clamp,
            filterMode = FilterMode.Bilinear,
            anisoLevel = 1,
        };
        _webMistMask.SetPixels32(pixels);
        _webMistMask.Apply(updateMipmaps: false, makeNoLongerReadable: true);
        return _webMistMask;
    }

    static float SmoothStep(float minimum, float maximum, float value) {
        float unit = Mathf.Clamp01((value - minimum) / Mathf.Max(1e-6f, maximum - minimum));
        return unit * unit * (3f - 2f * unit);
    }

    static void SetTexture(Material mat, string name, Texture value) {
        if (mat.HasProperty(name)) mat.SetTexture(name, value);
    }

    static void SetLinearVector(Material mat, string name, Color value) {
        if (mat.HasProperty(name)) {
            mat.SetVector(name, new Vector4(value.r, value.g, value.b, value.a));
        }
    }

    static void SetFloat(Material mat, string name, float value) {
        if (mat.HasProperty(name)) mat.SetFloat(name, value);
    }

    static void SetVector(Material mat, string name, Vector4 value) {
        if (mat.HasProperty(name)) mat.SetVector(name, value);
    }

    static void SetVector(Material mat, string name, Vector2 value) {
        SetVector(mat, name, new Vector4(value.x, value.y, 0f, 0f));
    }
}

}
