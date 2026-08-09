using GunsOnly.UnityBridge;
using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Minimal opaque-sensor mode line. It renders only the current sim-authored phase or the single
/// attack transaction; flight instruments remain presentation work rather than invented data.
/// </summary>
public static class RapierSensorHud {
    static readonly Color PhaseText = new(0.74f, 0.92f, 0.91f, 0.95f);
    static readonly Color PhaseBorder = new(0.30f, 0.63f, 0.64f, 0.62f);
    static readonly Color ActionText = new(1.0f, 0.82f, 0.44f, 0.98f);
    static readonly Color ActionBorder = new(0.96f, 0.57f, 0.20f, 0.72f);

    public static void Draw(RapierGoldenPathCue? cue) {
        if (cue is not RapierGoldenPathCue current || string.IsNullOrEmpty(current.Text))
            return;

        var style = new GUIStyle(GUI.skin.label) {
            alignment = TextAnchor.MiddleCenter,
            fontSize = current.Actionable ? 14 : 12,
            fontStyle = FontStyle.Bold,
        };
        style.normal.textColor = current.Actionable ? ActionText : PhaseText;
        Vector2 measured = style.CalcSize(new GUIContent(current.Text));
        float width = Mathf.Clamp(measured.x + 30f, 170f, 390f);
        float y = current.Actionable ? Screen.height - 68f : 52f;
        Rect rect = new(Screen.width * 0.5f - width * 0.5f, y, width, 28f);

        Color previous = GUI.color;
        GUI.color = new Color(0.008f, 0.020f, 0.023f, 0.76f);
        GUI.DrawTexture(rect, Texture2D.whiteTexture);
        DrawBorder(rect, current.Actionable ? ActionBorder : PhaseBorder);
        GUI.Label(rect, current.Text, style);
        GUI.color = previous;
    }

    static void DrawBorder(Rect rect, Color color) {
        GUI.color = color;
        GUI.DrawTexture(new Rect(rect.x, rect.y, rect.width, 1f), Texture2D.whiteTexture);
        GUI.DrawTexture(
            new Rect(rect.x, rect.yMax - 1f, rect.width, 1f),
            Texture2D.whiteTexture);
        GUI.DrawTexture(new Rect(rect.x, rect.y, 1f, rect.height), Texture2D.whiteTexture);
        GUI.DrawTexture(
            new Rect(rect.xMax - 1f, rect.y, 1f, rect.height),
            Texture2D.whiteTexture);
    }
}

}
