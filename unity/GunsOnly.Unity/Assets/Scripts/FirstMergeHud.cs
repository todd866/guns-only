using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Browser live-play HUD (cockpit eye): waterline/gun cross, padlock, alt/hdg, canopy-aware.
/// Chase mode keeps a smaller boresight pipper for debug (key C).
/// </summary>
public static class FirstMergeHud {
    public static void Draw(
        Camera cam,
        bool chaseMode,
        Transform player,
        Vector3 playerForward,
        Transform bandit,
        bool banditPresent,
        double altFt,
        double hdgDeg,
        float sepM,
        string status) {
        float w = Screen.width;
        float h = Screen.height;

        if (chaseMode) {
            DrawChasePipper(cam, player, playerForward, w, h);
        } else {
            DrawCockpitChrome(w, h, altFt, hdgDeg, sepM);
        }

        if (banditPresent && bandit != null && cam != null) {
            DrawPadlock(cam, bandit.position, w, h);
        }

        const int pad = 14;
        var rect = new Rect(pad, pad, 600, chaseMode ? 108 : 88);
        GUI.color = new Color(0f, 0f, 0f, 0.55f);
        GUI.Box(rect, GUIContent.none);
        GUI.color = new Color(0.85f, 0.95f, 0.88f, 1f);
        var style = new GUIStyle(GUI.skin.label) { fontSize = 14 };
        GUI.Label(new Rect(pad + 10, pad + 6, 580, 80), status, style);
    }

    static void DrawCockpitChrome(float w, float h, double altFt, double hdgDeg, float sepM) {
        float cx = w * 0.5f;
        float cy = h * 0.52f;
        // Period gunsight colour (browser DEFAULT_COLOR 0xffb347) — amber combiner.
        Color pip = new Color(1f, 0.70f, 0.28f, 0.88f);
        DrawRect(cx - 16, cy - 1.2f, 32, 2.4f, pip);
        DrawRect(cx - 1.2f, cy - 16, 2.4f, 32, pip);
        DrawHollowRect(cx - 26, cy - 26, 52, 52, 1.6f, pip);
        DrawRect(cx - 1.5f, cy - 1.5f, 3f, 3f, pip);

        // Waterline dashes left/right of boresight.
        Color wl = new Color(0.55f, 0.95f, 0.70f, 0.75f);
        DrawRect(cx - 120, cy - 1f, 40, 2f, wl);
        DrawRect(cx + 80, cy - 1f, 40, 2f, wl);

        // Alt / heading tapes (simplified browser airdata).
        GUI.color = wl;
        var style = new GUIStyle(GUI.skin.label) { fontSize = 18, fontStyle = FontStyle.Bold };
        GUI.Label(new Rect(w - 160, h * 0.42f, 140, 28), $"{altFt:F0} ft", style);
        GUI.Label(new Rect(cx - 40, 36, 80, 28), $"{hdgDeg:000}", style);
        if (sepM > 0f) {
            GUI.Label(new Rect(cx - 70, h - 48, 140, 24), $"SEP {sepM:F0} m", style);
        }
    }

    static void DrawChasePipper(Camera cam, Transform player, Vector3 fwd, float w, float h) {
        float cx = w * 0.5f;
        float cy = h * 0.5f;
        if (cam != null && player != null && fwd.sqrMagnitude > 1e-6f) {
            Vector3 aim = player.position + fwd.normalized * 80f + Vector3.up * 1.2f;
            Vector3 sp = cam.WorldToScreenPoint(aim);
            if (sp.z > 1f) {
                cx = sp.x;
                cy = h - sp.y;
            }
        }
        Color pip = new Color(0.40f, 0.95f, 0.62f, 0.88f);
        DrawRect(cx - 14, cy - 1.25f, 28, 2.5f, pip);
        DrawRect(cx - 1.25f, cy - 14, 2.5f, 28, pip);
        DrawHollowRect(cx - 22, cy - 22, 44, 44, 1.8f, pip);
    }

    static void DrawPadlock(Camera cam, Vector3 world, float w, float h) {
        Vector3 sp = cam.WorldToScreenPoint(world);
        bool inFront = sp.z > 0f;
        float x = sp.x;
        float y = h - sp.y;
        Color cue = new Color(1f, 0.55f, 0.2f, 0.95f);

        if (inFront && x > 40 && x < w - 40 && y > 40 && y < h - 40) {
            float s = Mathf.Clamp(220000f / Mathf.Max(sp.z, 80f), 12f, 42f);
            DrawHollowRect(x - s * 0.7f, y - s * 0.7f, s * 1.4f, s * 1.4f, 2f, cue);
            DrawRect(x - 1, y - s, 2, s * 2, cue);
            DrawRect(x - s, y - 1, s * 2, 2, cue);
            GUI.color = cue;
            GUI.Label(new Rect(x - 30, y + s + 4, 60, 18), "BANDIT");
        } else {
            Vector2 dir;
            if (!inFront) {
                dir = new Vector2(x - w * 0.5f, y - h * 0.5f);
                if (dir.sqrMagnitude < 1f) dir = Vector2.right;
                dir = -dir.normalized;
            } else {
                dir = new Vector2(x - w * 0.5f, y - h * 0.5f).normalized;
            }
            float ex = Mathf.Clamp(w * 0.5f + dir.x * (w * 0.42f), 24f, w - 24f);
            float ey = Mathf.Clamp(h * 0.5f + dir.y * (h * 0.42f), 24f, h - 24f);
            DrawHollowRect(ex - 10, ey - 10, 20, 20, 2f, cue);
            GUI.color = cue;
            GUI.Label(new Rect(ex - 28, ey + 12, 70, 18), "PADLOCK");
        }
    }

    static void DrawHollowRect(float x, float y, float w, float h, float t, Color c) {
        DrawRect(x, y, w, t, c);
        DrawRect(x, y + h - t, w, t, c);
        DrawRect(x, y, t, h, c);
        DrawRect(x + w - t, y, t, h, c);
    }

    static void DrawRect(float x, float y, float w, float h, Color c) {
        GUI.color = c;
        GUI.DrawTexture(new Rect(x, y, w, h), Texture2D.whiteTexture);
    }
}

}
