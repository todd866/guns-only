using GunsOnly.UnityBridge;
using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Scene-only output transform matching Three's ACESFilmicToneMapping. Unity OnGUI remains outside
/// this pass, just as the Web HUD canvas remains outside the WebGL scene tone map.
/// </summary>
[RequireComponent(typeof(Camera))]
public sealed class F22OutputTransform : MonoBehaviour {
    Material _material;

    void OnEnable() {
        Shader shader = Resources.Load<Shader>("GunsOnly/F22OutputTransform")
            ?? Shader.Find("GunsOnly/F22OutputTransform");
        if (shader == null) {
            Debug.LogError("[GunsOnly] retained F22 output-transform shader is missing");
            return;
        }
        _material = new Material(shader) {
            name = "F22_WEB_ACES_OUTPUT",
            hideFlags = HideFlags.HideAndDontSave,
        };
        _material.SetFloat("_Exposure", F22UkraineVisualContract.ToneMappingExposure);
    }

    void OnRenderImage(RenderTexture source, RenderTexture destination) {
        if (_material != null)
            Graphics.Blit(source, destination, _material);
        else
            Graphics.Blit(source, destination);
    }

    void OnDisable() {
        if (_material != null) Destroy(_material);
        _material = null;
    }
}

}
