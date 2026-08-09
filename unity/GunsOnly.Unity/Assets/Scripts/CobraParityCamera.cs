using System;
using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Adapts Unity's +Z camera basis to the Web reference camera's Three.js -Z basis.
/// Both renderers keep the same [east,up,-north] world mapping; a horizontal clip-space
/// reflection is therefore required to preserve screen handedness. This component owns that
/// reflection and the matching culling inversion for every live and QA render.
/// </summary>
[DisallowMultipleComponent]
[RequireComponent(typeof(Camera))]
public sealed class CobraParityCamera : MonoBehaviour {
    Camera _camera;
    float _projectionXSign = -1f;
    bool _invertCulling = true;
    bool _ownsCullingInversion;

    public void Configure(CobraVisualContract.AcceptanceProjectionSpec projection) {
        if (projection == null) throw new ArgumentNullException(nameof(projection));
        _projectionXSign = projection.UnityProjectionXSign;
        _invertCulling = projection.UnityInvertCulling;
        if (_projectionXSign != -1f || !_invertCulling) {
            throw new InvalidOperationException(
                "Cobra Web parity requires X-reflected projection and inverted culling.");
        }
        ApplyProjection();
    }

    public void ApplyProjection() {
        if (_camera == null) _camera = GetComponent<Camera>();
        if (_camera == null) return;
        _camera.ResetProjectionMatrix();
        Matrix4x4 reflection = Matrix4x4.Scale(new Vector3(_projectionXSign, 1f, 1f));
        _camera.projectionMatrix = reflection * _camera.projectionMatrix;
    }

    public void RestoreGlobalCulling() {
        if (!_ownsCullingInversion) return;
        GL.invertCulling = false;
        _ownsCullingInversion = false;
    }

    void Awake() {
        _camera = GetComponent<Camera>();
        ApplyProjection();
    }

    void OnPreCull() {
        ApplyProjection();
        if (_invertCulling) {
            GL.invertCulling = true;
            _ownsCullingInversion = true;
        }
    }

    void OnPostRender() => RestoreGlobalCulling();

    void OnDisable() {
        RestoreGlobalCulling();
        if (_camera != null) _camera.ResetProjectionMatrix();
    }

    void OnDestroy() => RestoreGlobalCulling();
}

}
