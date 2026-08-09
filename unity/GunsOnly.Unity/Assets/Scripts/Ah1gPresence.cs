using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// AH-1G presence. Cockpit FOV stays empty on purpose — Hold the Bridge is HUD-only.
/// Exterior mesh exists for optional tooling but live play never enables it.
/// Unity +Z forward (browser −Z negated).
/// </summary>
public sealed class Ah1gPresence : MonoBehaviour {
    public static readonly Vector3 RearSeatEyeLocalM = new(0f, 1.12f, -1.05f);

    Transform _rotor;
    Transform _tailRotor;
    Transform[] _blades;
    Transform _exterior;
    float _bladeAngle;
    float _tailAngle;

    public static Ah1gPresence Build(Transform parent) {
        var go = new GameObject("AH1G_PRESENCE");
        go.transform.SetParent(parent, false);
        var presence = go.AddComponent<Ah1gPresence>();
        presence.BuildMesh();
        return presence;
    }

    void BuildMesh() {
        // Live Hold the Bridge is HUD-only — no exterior mesh at all. A deactivated
        // Exterior still occasionally leaked a dark helo silhouette onto the river in
        // the Mac player; skip building it so the eye transform is the only presence.
        _exterior = new GameObject("Exterior").transform;
        _exterior.SetParent(transform, false);
        _exterior.gameObject.SetActive(false);
        _rotor = null;
        _tailRotor = null;
        _blades = null;
    }

    public void SetExteriorVisible(bool visible) {
        if (_exterior != null) _exterior.gameObject.SetActive(visible);
    }

    public void ApplyPose(Vector3 unityPos, Quaternion unityRot, float rotorRpm, float dt) {
        transform.position = unityPos;
        transform.rotation = unityRot;
        float omega = rotorRpm * Mathf.PI * 2f / 60f;
        _bladeAngle += omega * dt;
        _tailAngle += omega * 4.2f * dt;
        if (_rotor != null) _rotor.localRotation = Quaternion.Euler(0f, _bladeAngle * Mathf.Rad2Deg, 0f);
        if (_tailRotor != null)
            _tailRotor.localRotation = Quaternion.Euler(_tailAngle * Mathf.Rad2Deg, 0f, 90f);
        if (_blades != null) {
            for (int i = 0; i < _blades.Length; i++) {
                _blades[i].localRotation = Quaternion.Euler(0f, _bladeAngle * Mathf.Rad2Deg + i * 90f, 0f);
            }
        }
    }

    public Vector3 EyeWorld() => transform.TransformPoint(RearSeatEyeLocalM);

    Transform BoxOn(Transform parent, string name, Vector3 size, Vector3 localPos, Material mat) {
        var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
        go.name = name;
        go.transform.SetParent(parent, false);
        go.transform.localPosition = localPos;
        go.transform.localScale = size;
        Object.Destroy(go.GetComponent<Collider>());
        var mr = go.GetComponent<MeshRenderer>();
        mr.sharedMaterial = mat;
        mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
        mr.receiveShadows = true;
        return go.transform;
    }

    static Material Lit(Color c, float gloss, Color? emission = null) =>
        GunsOnlyMats.Skin(c, gloss, emission);
}

}
