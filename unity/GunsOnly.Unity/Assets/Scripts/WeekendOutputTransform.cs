using System;
using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Scene-only output transform matching Three r160 ACES, sRGB conversion, then Exp2 fog. OnGUI
/// guidance remains outside this pass, like the separate Web HUD canvas.
/// </summary>
[RequireComponent(typeof(Camera))]
public sealed class WeekendOutputTransform : MonoBehaviour {
    Material _material;
    float _exposure = 1.04f;
    Vector4 _fogDisplaySrgb;
    float _fogDensity = 0.00016f;

    public void Configure(double exposure) {
        Configure(
            exposure,
            WeekendCircuitPresentationResource.DisplaySrgbHexVector("a8b8b7"),
            0.00016);
    }

    public void Configure(WeekendCircuitRenderProfileFrame profile) {
        if (profile == null || profile.fog == null)
            throw new ArgumentNullException(nameof(profile));
        Configure(
            profile.tone_mapping_exposure,
            WeekendCircuitPresentationResource.DisplaySrgbHexVector(profile.fog.srgb_hex),
            profile.fog.density);
    }

    public void Configure(double exposure, Vector4 fogDisplaySrgb, double fogDensity) {
        if (!double.IsFinite(exposure) || exposure <= 0.0 || exposure > 8.0)
            throw new ArgumentOutOfRangeException(nameof(exposure));
        if (!double.IsFinite(fogDensity) || fogDensity < 0.0 || fogDensity > 0.1)
            throw new ArgumentOutOfRangeException(nameof(fogDensity));
        _exposure = (float)exposure;
        _fogDisplaySrgb = fogDisplaySrgb;
        _fogDensity = (float)fogDensity;
        EnsureMaterial();
        ApplyUniforms();
    }

    void OnEnable() {
        EnsureMaterial();
    }

    void EnsureMaterial() {
        if (_material != null) return;
        Shader shader = Resources.Load<Shader>(
            "GunsOnly/WeekendRide/Circuit/WeekendCircuitOutput")
            ?? Shader.Find("GunsOnly/WeekendCircuitOutput");
        if (shader == null)
            throw new InvalidOperationException(
                "Three Weekend output/fog compatibility shader is missing.");
        _material = new Material(shader) {
            name = "WEEKEND_WEB_ACES_SRGB_FOG_OUTPUT",
            hideFlags = HideFlags.HideAndDontSave,
        };
        if (_fogDisplaySrgb == default) {
            _fogDisplaySrgb =
                WeekendCircuitPresentationResource.DisplaySrgbHexVector("a8b8b7");
        }
        ApplyUniforms();
    }

    void ApplyUniforms() {
        if (_material == null) return;
        _material.SetFloat("_Exposure", _exposure);
        _material.SetVector("_FogColor", _fogDisplaySrgb);
        _material.SetFloat("_FogDensity", _fogDensity);
    }

    void OnRenderImage(RenderTexture source, RenderTexture destination) {
        Apply(source, destination);
    }

    /// <summary>
    /// Explicit seam for deterministic off-screen capture: render/resolve the scene first, then
    /// apply the same material used by the production Camera callback into a non-MSAA target.
    /// </summary>
    public void Apply(RenderTexture source, RenderTexture destination) {
        if (source == null) throw new ArgumentNullException(nameof(source));
        EnsureMaterial();
        if (_material == null)
            throw new InvalidOperationException("Weekend output material was not initialized.");
        Graphics.Blit(source, destination, _material);
    }

    void OnDisable() {
        if (_material != null) {
            if (Application.isPlaying) Destroy(_material);
            else DestroyImmediate(_material);
        }
        _material = null;
    }
}

}
