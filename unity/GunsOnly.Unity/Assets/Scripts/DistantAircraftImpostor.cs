using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Browser <c>distant_aircraft_impostor</c>: when the mesh subtends too few pixels, draw a
/// depth-tested dark contact silhouette at a bounded screen size (never enlarges the mesh).
/// </summary>
public sealed class DistantAircraftImpostor : MonoBehaviour {
    Transform _core;
    Transform _edge;
    Material _coreMat;
    Material _edgeMat;
    bool _active;

    const float MinPx = 8f;
    const float MaxPx = 14f;
    const float EnterBelowPx = 10f;
    const float ExitAbovePx = 14f;
    const float TargetDiameterM = 12f;

    public static DistantAircraftImpostor Attach(Transform parent) {
        var go = new GameObject("DistantAircraftImpostor");
        go.transform.SetParent(parent, false);
        var imp = go.AddComponent<DistantAircraftImpostor>();
        imp.Build();
        return imp;
    }

    void Build() {
        _coreMat = Unlit(new Color(0.03f, 0.04f, 0.05f, 1f));
        _edgeMat = Unlit(new Color(0.84f, 0.77f, 0.61f, 0.24f));

        _core = GameObject.CreatePrimitive(PrimitiveType.Quad).transform;
        _core.name = "ImpostorCore";
        _core.SetParent(transform, false);
        Object.Destroy(_core.GetComponent<Collider>());
        _core.GetComponent<Renderer>().sharedMaterial = _coreMat;

        _edge = GameObject.CreatePrimitive(PrimitiveType.Quad).transform;
        _edge.name = "ImpostorEdge";
        _edge.SetParent(transform, false);
        Object.Destroy(_edge.GetComponent<Collider>());
        _edge.GetComponent<Renderer>().sharedMaterial = _edgeMat;
        _edge.localScale = Vector3.one * 1.35f;

        SetVisible(false);
    }

    public void UpdateFor(Camera cam, Transform bandit, bool present) {
        if (!present || cam == null || bandit == null) {
            SetVisible(false);
            return;
        }

        Vector3 to = bandit.position - cam.transform.position;
        float depth = Vector3.Dot(to, cam.transform.forward);
        if (depth < 5f) {
            SetVisible(false);
            return;
        }

        float fovRad = cam.fieldOfView * Mathf.Deg2Rad;
        float projectedPx = Screen.height * TargetDiameterM
            / (2f * depth * Mathf.Tan(fovRad * 0.5f));

        if (!_active && projectedPx <= EnterBelowPx) _active = true;
        if (_active && projectedPx >= ExitAbovePx) _active = false;

        if (!_active) {
            SetVisible(false);
            bandit.gameObject.SetActive(true);
            return;
        }

        // Hide mesh when impostor fully owns the contact (browser modelHideOpacity ~0.985).
        bandit.gameObject.SetActive(projectedPx > EnterBelowPx * 0.5f);

        float px = Mathf.Clamp(Mathf.Max(projectedPx, MinPx), MinPx, MaxPx);
        float worldSize = px * 2f * depth * Mathf.Tan(fovRad * 0.5f) / Screen.height;

        Vector3 pos = bandit.position - cam.transform.forward * 7f; // depth bias
        transform.position = pos;
        transform.rotation = Quaternion.LookRotation(cam.transform.forward, cam.transform.up);
        _core.localScale = new Vector3(worldSize * 0.55f, worldSize, 1f);
        _edge.localScale = new Vector3(worldSize * 0.75f, worldSize * 1.35f, 1f);
        SetVisible(true);
    }

    void SetVisible(bool on) {
        gameObject.SetActive(on);
    }

    static Material Unlit(Color c) {
        Shader s = Shader.Find("Sprites/Default") ?? Shader.Find("Unlit/Color");
        var m = new Material(s);
        if (m.HasProperty("_Color")) m.SetColor("_Color", c);
        m.color = c;
        return m;
    }
}

}
