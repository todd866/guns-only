using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Neon-green first-merge HUD approximating browser <c>hud.js</c>: pitch ladder, heading tape,
/// IAS/ALT tapes, flight-path marker, bandit padlock box. Drawn in OnGUI (screen space).
/// </summary>
public static class BrowserParityHud {
    static readonly Color Hud = new(0.15f, 1f, 0.45f, 0.92f);
    static readonly Color HudDim = new(0.10f, 0.75f, 0.35f, 0.70f);
    static readonly Color Target = new(1f, 0.72f, 0.28f, 0.95f);

    public struct Snapshot {
        public double AltFt, HdgDeg, IasKts, PitchDeg, BankDeg, VsFpm, Mach, SepM;
        public bool BanditPresent;
        public Vector3 BanditScreen; // x,y in GUI space; z>0 in front
        public bool ChaseMode;
        public string DebugLine;
        public string GoldenPathCue;
    }

    public static void Draw(Snapshot s) {
        float w = Screen.width;
        float h = Screen.height;
        float cx = w * 0.5f;
        float cy = h * 0.52f;

        // Bank the ladder with aircraft bank.
        float bankRad = (float)(s.BankDeg * Mathf.Deg2Rad);
        DrawPitchLadder(cx, cy, (float)s.PitchDeg, bankRad, w, h);
        DrawFlightPathMarker(cx, cy, bankRad);
        DrawHeadingTape(w, h, (float)s.HdgDeg);
        DrawSpeedTape(w, h, (float)s.IasKts, (float)s.Mach);
        DrawAltTape(w, h, (float)s.AltFt, (float)s.VsFpm);

        if (s.BanditPresent && s.BanditScreen.z > 0f) {
            DrawTargetBox(s.BanditScreen.x, s.BanditScreen.y, s.SepM);
        } else if (s.BanditPresent) {
            DrawPadlockEdge(w, h, s.BanditScreen);
        }

        if (!string.IsNullOrEmpty(s.DebugLine) && (QaPilot.Enabled || s.ChaseMode)) {
            GUI.color = new Color(0f, 0f, 0f, 0.45f);
            GUI.Box(new Rect(10, 10, 520, 54), GUIContent.none);
            GUI.color = Color.white;
            GUI.Label(new Rect(18, 14, 500, 48), s.DebugLine);
        } else {
            GUI.color = HudDim;
            GUI.Label(new Rect(w - 150, h - 28, 140, 20), "H — CONTROLS");
        }

        if (!string.IsNullOrEmpty(s.GoldenPathCue) && !s.ChaseMode) {
            var cueStyle = new GUIStyle(GUI.skin.label) {
                alignment = TextAnchor.MiddleCenter,
                fontSize = 13,
                fontStyle = FontStyle.Bold,
                normal = { textColor = new Color(0.72f, 1f, 0.82f, 0.96f) },
            };
            Vector2 size = cueStyle.CalcSize(new GUIContent(s.GoldenPathCue));
            float cueWidth = Mathf.Clamp(size.x + 28f, 160f, 280f);
            Rect cueRect = new(w * 0.5f - cueWidth * 0.5f, h - 70f, cueWidth, 28f);
            DrawRect(
                cueRect.x,
                cueRect.y,
                cueRect.width,
                cueRect.height,
                new Color(0.015f, 0.035f, 0.025f, 0.72f));
            DrawHollowRect(
                cueRect.x,
                cueRect.y,
                cueRect.width,
                cueRect.height,
                1f,
                new Color(0.22f, 0.76f, 0.45f, 0.58f));
            GUI.Label(cueRect, s.GoldenPathCue, cueStyle);
        }
    }

    static void DrawFlightPathMarker(float cx, float cy, float bankRad) {
        // Circle with short wings — browser FPM.
        float r = 10f;
        DrawHollowRect(cx - r, cy - r, r * 2, r * 2, 1.5f, Hud);
        DrawRect(cx - r - 14, cy - 1f, 12, 2f, Hud);
        DrawRect(cx + r + 2, cy - 1f, 12, 2f, Hud);
        DrawRect(cx - 1f, cy - r - 10, 2f, 8f, Hud);
    }

    static void DrawPitchLadder(float cx, float cy, float pitchDeg, float bankRad, float w, float h) {
        // 10° steps, scrolled by pitch.
        float pxPerDeg = h / 70f;
        for (int step = -40; step <= 40; step += 10) {
            if (step == 0) continue;
            float y = cy - (step - pitchDeg) * pxPerDeg;
            if (y < 40 || y > h - 40) continue;
            float half = step > 0 ? 48f : 36f;
            // Rotate endpoints around centre by bank.
            Vector2 a = Rotate(new Vector2(cx - half, y), cx, cy, bankRad);
            Vector2 b = Rotate(new Vector2(cx + half, y), cx, cy, bankRad);
            DrawLine(a, b, 1.5f, HudDim);
            GUI.color = HudDim;
            GUI.Label(new Rect(b.x + 4, b.y - 8, 36, 18), step.ToString());
        }
        // Horizon line
        float hy = cy - (0 - pitchDeg) * pxPerDeg;
        Vector2 h0 = Rotate(new Vector2(cx - 110, hy), cx, cy, bankRad);
        Vector2 h1 = Rotate(new Vector2(cx + 110, hy), cx, cy, bankRad);
        DrawLine(h0, h1, 2f, Hud);
    }

    static void DrawHeadingTape(float w, float h, float hdg) {
        float cx = w * 0.5f;
        float y = 28f;
        float tapeW = 280f;
        DrawRect(cx - tapeW * 0.5f, y - 2, tapeW, 26, new Color(0f, 0f, 0f, 0.35f));
        for (int d = -40; d <= 40; d += 10) {
            float heading = Mathf.Repeat(hdg + d, 360f);
            float x = cx + d * 3.2f;
            DrawRect(x - 1, y + 4, 2, d % 20 == 0 ? 14 : 8, HudDim);
            if (d % 20 == 0) {
                GUI.color = HudDim;
                GUI.Label(new Rect(x - 14, y + 16, 32, 16), ((int)heading).ToString("000"));
            }
        }
        // Current box
        DrawHollowRect(cx - 28, y - 2, 56, 24, 2f, Hud);
        GUI.color = Hud;
        var style = new GUIStyle(GUI.skin.label) { fontSize = 16, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter };
        GUI.Label(new Rect(cx - 28, y - 2, 56, 24), ((int)Mathf.Repeat(hdg, 360f)).ToString("000"), style);
    }

    static void DrawSpeedTape(float w, float h, float ias, float mach) {
        float x = w * 0.18f;
        float cy = h * 0.52f;
        DrawRect(x - 50, cy - 90, 70, 180, new Color(0f, 0f, 0f, 0.30f));
        for (int d = -60; d <= 60; d += 20) {
            float v = ias + d;
            float y = cy - d * 1.4f;
            DrawRect(x - 8, y - 1, 16, 2, HudDim);
            GUI.color = HudDim;
            GUI.Label(new Rect(x - 48, y - 8, 40, 16), ((int)v).ToString());
        }
        DrawHollowRect(x - 50, cy - 14, 70, 28, 2f, Hud);
        GUI.color = Hud;
        var style = new GUIStyle(GUI.skin.label) { fontSize = 18, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter };
        GUI.Label(new Rect(x - 50, cy - 14, 70, 28), ((int)ias).ToString(), style);
        GUI.Label(new Rect(x - 48, cy + 20, 70, 18), $"M {mach:0.00}");
    }

    static void DrawAltTape(float w, float h, float alt, float vs) {
        float x = w * 0.82f;
        float cy = h * 0.52f;
        DrawRect(x - 20, cy - 90, 90, 180, new Color(0f, 0f, 0f, 0.30f));
        for (int d = -600; d <= 600; d += 200) {
            float v = alt + d;
            float y = cy - d * 0.12f;
            DrawRect(x - 8, y - 1, 16, 2, HudDim);
            GUI.color = HudDim;
            GUI.Label(new Rect(x + 12, y - 8, 56, 16), ((int)v).ToString());
        }
        DrawHollowRect(x - 20, cy - 14, 90, 28, 2f, Hud);
        GUI.color = Hud;
        var style = new GUIStyle(GUI.skin.label) { fontSize = 16, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter };
        GUI.Label(new Rect(x - 20, cy - 14, 90, 28), ((int)alt).ToString(), style);
        string vsLabel = vs >= 0 ? $"V/S +{(int)vs} FPM" : $"V/S {(int)vs} FPM";
        GUI.Label(new Rect(x - 30, cy + 22, 110, 18), vsLabel);
    }

    static void DrawTargetBox(float x, float y, double sepM) {
        float s = 22f;
        DrawHollowRect(x - s, y - s, s * 2, s * 2, 2f, Target);
        GUI.color = Target;
        float nm = (float)(sepM / 1852.0);
        GUI.Label(new Rect(x - 70, y + s + 2, 140, 18), $"TARGET  ·  {nm:0.0}NM");
    }

    static void DrawPadlockEdge(float w, float h, Vector3 sp) {
        Vector2 dir = new Vector2(sp.x - w * 0.5f, sp.y - h * 0.5f);
        if (dir.sqrMagnitude < 1f) dir = Vector2.right;
        dir.Normalize();
        float ex = Mathf.Clamp(w * 0.5f + dir.x * w * 0.42f, 30f, w - 30f);
        float ey = Mathf.Clamp(h * 0.5f + dir.y * h * 0.42f, 30f, h - 30f);
        DrawHollowRect(ex - 10, ey - 10, 20, 20, 2f, Target);
        GUI.color = Target;
        GUI.Label(new Rect(ex - 30, ey + 12, 70, 18), "PADLOCK");
    }

    static Vector2 Rotate(Vector2 p, float cx, float cy, float rad) {
        float dx = p.x - cx, dy = p.y - cy;
        float c = Mathf.Cos(rad), s = Mathf.Sin(rad);
        return new Vector2(cx + dx * c - dy * s, cy + dx * s + dy * c);
    }

    static void DrawLine(Vector2 a, Vector2 b, float thickness, Color col) {
        Vector2 d = b - a;
        float len = d.magnitude;
        if (len < 0.5f) return;
        float angle = Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg;
        GUI.color = col;
        Matrix4x4 prev = GUI.matrix;
        GUIUtility.RotateAroundPivot(angle, a);
        GUI.DrawTexture(new Rect(a.x, a.y - thickness * 0.5f, len, thickness), Texture2D.whiteTexture);
        GUI.matrix = prev;
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
