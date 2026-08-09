using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>Quiet symbol-only consumer of the sim-authored Weekend first-success cue.</summary>
public sealed class WeekendRideGoldenPathHud : MonoBehaviour {
    HostClient _host;
    GUIStyle _style;
    Texture2D _panel;

    public static WeekendRideGoldenPathHud Attach(GameObject owner, HostClient host) {
        if (owner == null) throw new System.ArgumentNullException(nameof(owner));
        if (host == null) throw new System.ArgumentNullException(nameof(host));
        WeekendRideGoldenPathHud hud = owner.AddComponent<WeekendRideGoldenPathHud>();
        hud._host = host;
        return hud;
    }

    void OnGUI() {
        if (_host == null || !_host.HasPose) return;
        string token = _host.Latest.WeekendCue;
        if (string.IsNullOrEmpty(token)) return;
        EnsureStyle();
        const float width = 58f;
        const float height = 48f;
        var rect = new Rect(
            (Screen.width - width) * 0.5f,
            Screen.height - height - 24f,
            width,
            height);
        GUI.Label(rect, token, _style);
    }

    void EnsureStyle() {
        if (_style != null) return;
        _panel = new Texture2D(1, 1, TextureFormat.RGBA32, false, true) {
            name = "weekend-golden-path-panel",
        };
        _panel.SetPixel(0, 0, new Color(0.025f, 0.035f, 0.03f, 0.72f));
        _panel.Apply(false, true);
        _style = new GUIStyle(GUI.skin.label) {
            alignment = TextAnchor.MiddleCenter,
            fontSize = 27,
            fontStyle = FontStyle.Bold,
            normal = { textColor = new Color(0.84f, 0.95f, 0.72f, 0.96f) },
        };
        _style.normal.background = _panel;
    }

    void OnDestroy() {
        if (_panel != null) Destroy(_panel);
    }
}

}
