using System;
using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Preserves the Web reference camera's screen chirality when the same numeric world is rendered
/// by Unity. Three cameras look down local -Z while Unity cameras look down local +Z, so a numeric
/// LookAt/pose maps the camera-right basis to its negative. The clip-X reflection repairs that
/// handedness and the matching, render-scoped culling inversion preserves front faces.
/// </summary>
[DisallowMultipleComponent]
[RequireComponent(typeof(Camera))]
public sealed class WeekendParityCamera : MonoBehaviour {
    public const float UnityProjectionXSign = -1f;
    public const bool UnityInvertCulling = true;

    Camera _camera;
    bool _renderScopeActive;
    bool _previousInvertCulling;

    public static WeekendParityCamera Attach(Camera camera) {
        if (camera == null) throw new ArgumentNullException(nameof(camera));
        WeekendParityCamera parity = camera.GetComponent<WeekendParityCamera>()
            ?? camera.gameObject.AddComponent<WeekendParityCamera>();
        parity.ApplyProjection();
        return parity;
    }

    public void ApplyProjection() {
        if (_camera == null) _camera = GetComponent<Camera>();
        if (_camera == null) return;
        _camera.ResetProjectionMatrix();
        Matrix4x4 reflection = Matrix4x4.Scale(
            new Vector3(UnityProjectionXSign, 1f, 1f));
        _camera.projectionMatrix = reflection * _camera.projectionMatrix;
    }

    void Awake() {
        _camera = GetComponent<Camera>();
        ApplyProjection();
    }

    void OnPreCull() {
        ApplyProjection();
        if (!UnityInvertCulling || _renderScopeActive) return;
        _previousInvertCulling = GL.invertCulling;
        GL.invertCulling = true;
        _renderScopeActive = true;
    }

    void OnPostRender() => RestoreRenderScope();

    void OnDisable() {
        RestoreRenderScope();
        if (_camera != null) _camera.ResetProjectionMatrix();
    }

    void OnDestroy() => RestoreRenderScope();

    void RestoreRenderScope() {
        if (!_renderScopeActive) return;
        GL.invertCulling = _previousInvertCulling;
        _renderScopeActive = false;
    }
}

}
