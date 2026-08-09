using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Hold the Bridge HUD — match /cobra-lab/ HTML chrome, not the F-22 fighter tape layout.
/// Lab: warm brand lockup, glass objective panel, soft reticle, bottom-right legend.
/// Pitch/speed/alt tapes were cargo-cult from First Merge and are not in the web game.
/// </summary>
public static class CobraRotorHud {
    const float PlayMarginX = 18f;
    const float ObjectiveBottom = 16f;
    const float ObjectiveMaxWidth = 380f;
    const float ObjectiveHeight = 148f;

    // From cobra-lab/styles.css
    static readonly Color Brand = new(0xd4 / 255f, 0xb5 / 255f, 0x6a / 255f, 1f);
    static readonly Color Title = new(0xe8 / 255f, 0xe6 / 255f, 0xdf / 255f, 1f);
    static readonly Color Muted = new(0x9a / 255f, 0xa3 / 255f, 0x92 / 255f, 1f);
    static readonly Color Green = new(0x7d / 255f, 0xcf / 255f, 0x7a / 255f, 1f);
    static readonly Color Friendly = new(0x8f / 255f, 0xbf / 255f, 0x5a / 255f, 0.95f);
    static readonly Color Hostile = new(0xc4 / 255f, 0x5a / 255f, 0x45 / 255f, 0.95f);
    static readonly Color Hazard = new(0xe5 / 255f, 0x79 / 255f, 0x54 / 255f, 0.98f);
    static readonly Color Glass = new(6 / 255f, 12 / 255f, 10 / 255f, 0.55f);
    static readonly Color Line = new(180 / 255f, 210 / 255f, 160 / 255f, 0.18f);
    static readonly Color Reticle = new(180 / 255f, 255 / 255f, 170 / 255f, 0.75f);
    static readonly Color TrackBg = new(1f, 1f, 1f, 0.08f);
    static readonly Color Vignette = new(0f, 0f, 0f, 0.28f);

    static GUIStyle _brand;
    static GUIStyle _title;
    static GUIStyle _muted;
    static GUIStyle _objLine;
    static GUIStyle _objDetail;
    static GUIStyle _war;
    static GUIStyle _trackLabel;
    static GUIStyle _legend;
    static GUIStyle _warn;
    static GUIStyle _warnLeft;
    static GUIStyle _cue;
    static Texture2D _white;

    public struct Snapshot {
        public double AltFt, HdgDeg, IasKts, PitchDeg, BankDeg, VsFpm;
        public double RotorRpm, Collective01, ControlBalance;
        public double ClearanceM, FobRangeM, TorqueNm, TorqueLimitFraction;
        public double VictoryHoldProgress;
        public int AmmoRounds;
        public int HostileKills;
        public bool TargetPresent;
        public Vector3 TargetScreen;
        public float TargetSepM;
        public string TargetLabel;
        public string Lifecycle;
        public string GunStatus;
        public bool TargetSelected;
        public float CameraFovDeg;
        public bool Padlock;
        public string GoldenPathCue;
        public string DebugLine;
    }

    public static void Draw(Snapshot s) {
        EnsureStyles();
        float w = Screen.width;
        float h = Screen.height;
        float cx = w * 0.5f;
        float cy = h * 0.48f; // lab reticle sits at ~48% height

        DrawVignette(w, h);
        DrawPlayChrome(w, s);
        DrawObjectivePanel(w, h, s);
        DrawReticle(cx, cy);
        DrawFactionLegend(w, h);
        // Gun status lives in the objective war-readouts (lab #hud-gunner) — no second
        // floating fighter-style warn plate.

        if (s.TargetPresent) {
            if (s.TargetScreen.z > 0f) {
                DrawTargetBox(s.TargetScreen.x, s.TargetScreen.y, s.TargetSepM);
            } else {
                DrawPadlockEdge(w, h, s.TargetScreen, cx, cy);
            }
        }

        DrawGoldenPathCue(w, h, s.GoldenPathCue);

        if (!string.IsNullOrEmpty(s.DebugLine) && QaPilot.Enabled) {
            // Keep QA telemetry clear of the bottom-left mission card. Production never draws it.
            float debugY = ObjectivePanelY(h) - 24f;
            Fill(12, debugY, 520, 20, Glass);
            Label(18, debugY + 2f, 508, 16, s.DebugLine, _muted);
        }
    }

    static void EnsureStyles() {
        if (_white == null) _white = Texture2D.whiteTexture;
        if (_brand != null) return;
        _brand = new GUIStyle(GUI.skin.label) {
            fontSize = 10,
            fontStyle = FontStyle.Bold,
            alignment = TextAnchor.MiddleLeft,
            clipping = TextClipping.Clip,
            normal = { textColor = Brand },
        };
        _title = new GUIStyle(GUI.skin.label) {
            fontSize = 22,
            fontStyle = FontStyle.Bold,
            alignment = TextAnchor.MiddleLeft,
            clipping = TextClipping.Clip,
            normal = { textColor = Title },
        };
        _muted = new GUIStyle(GUI.skin.label) {
            fontSize = 12,
            fontStyle = FontStyle.Normal,
            alignment = TextAnchor.MiddleLeft,
            clipping = TextClipping.Clip,
            normal = { textColor = Muted },
        };
        _objLine = new GUIStyle(GUI.skin.label) {
            fontSize = 12,
            fontStyle = FontStyle.Bold,
            alignment = TextAnchor.MiddleLeft,
            clipping = TextClipping.Clip,
            normal = { textColor = new Color(0xf2 / 255f, 0xf0 / 255f, 0xe6 / 255f) },
        };
        _objDetail = new GUIStyle(_muted) { fontSize = 11 };
        _war = new GUIStyle(GUI.skin.label) {
            fontSize = 11,
            fontStyle = FontStyle.Normal,
            alignment = TextAnchor.MiddleLeft,
            clipping = TextClipping.Clip,
            normal = { textColor = Green },
        };
        // Lab .balance-track b / .hold-track span — right, 9px, letter-spaced muted.
        _trackLabel = new GUIStyle(GUI.skin.label) {
            fontSize = 9,
            fontStyle = FontStyle.Bold,
            alignment = TextAnchor.MiddleRight,
            clipping = TextClipping.Clip,
            normal = { textColor = Muted },
        };
        _legend = new GUIStyle(_muted) {
            fontSize = 10,
            normal = { textColor = new Color(230 / 255f, 230 / 255f, 220 / 255f, 0.72f) },
        };
        _warn = new GUIStyle(GUI.skin.label) {
            fontSize = 12,
            fontStyle = FontStyle.Bold,
            alignment = TextAnchor.MiddleCenter,
            clipping = TextClipping.Clip,
            normal = { textColor = Hazard },
        };
        _warnLeft = new GUIStyle(_warn) {
            alignment = TextAnchor.MiddleLeft,
            fontSize = 11,
        };
        _cue = new GUIStyle(GUI.skin.label) {
            fontSize = 12,
            fontStyle = FontStyle.Bold,
            alignment = TextAnchor.MiddleCenter,
            clipping = TextClipping.Clip,
            normal = { textColor = new Color(0xcf / 255f, 0xe3 / 255f, 0xb8 / 255f, 0.96f) },
        };
    }

    /// <summary>Soft edge falloff matching .viewport::after in styles.css.</summary>
    static void DrawVignette(float w, float h) {
        // Lab uses radial darken + light top/bottom gradients — not heavy side pillars.
        Fill(0, 0, w, h * 0.08f, new Color(0f, 0f, 0f, 0.14f));
        Fill(0, h * 0.90f, w, h * 0.10f, new Color(0f, 0f, 0f, 0.20f));
        Fill(0, 0, w * 0.015f, h, new Color(0f, 0f, 0f, 0.12f));
        Fill(w * 0.985f, 0, w * 0.015f, h, new Color(0f, 0f, 0f, 0.12f));
    }

    static void DrawPlayChrome(float w, Snapshot s) {
        // mission-lockup: brand · title · airframe  |  status
        Label(18, 14, 100, 14, "GUNS ONLY", _brand);
        Label(118, 8, 280, 28, "Hold the Bridge", _title);
        Label(360, 16, 200, 16, "AH-1G · River Gorge", _muted);

        string status = s.Padlock
            ? "PADLOCK"
            : string.Equals(s.Lifecycle, "Active", System.StringComparison.OrdinalIgnoreCase) ||
              string.IsNullOrEmpty(s.Lifecycle)
                ? "AH-1G ONLINE"
                : s.Lifecycle.ToUpperInvariant();
        Color statusDot = s.Padlock ? Hazard : Green;
        Fill(w - 168, 20, 7, 7, statusDot);
        Label(w - 154, 14, 140, 18, status, _muted);
    }

    static void DrawObjectivePanel(float w, float h, Snapshot s) {
        // Web Build299: fixed bottom-left mission card, 18 px side margin, 16 px bottom
        // margin and a 380 px desktop cap. OnGUI cannot reproduce backdrop-filter blur,
        // but its colour, border, padding and information hierarchy match the DOM card.
        float x = PlayMarginX;
        float y = ObjectivePanelY(h);
        float pw = Mathf.Min(ObjectiveMaxWidth, Mathf.Max(1f, w - PlayMarginX * 2f));
        float ph = ObjectiveHeight;
        Fill(x, y, pw, ph, Glass);
        Stroke(x, y, pw, ph, 1f, Line);

        float control = (float)s.ControlBalance;
        string life = string.IsNullOrEmpty(s.Lifecycle) ? "Active" : s.Lifecycle;
        string line;
        string detail;
        if (!string.Equals(life, "Active", System.StringComparison.OrdinalIgnoreCase)) {
            line = $"MISSION {life.ToUpperInvariant()}";
            detail = control >= 0f ? "Tip was friendly when it ended" : "Tip was hostile when it ended";
        } else if (s.AmmoRounds <= 0) {
            line = "BINGO / DRY · REARM AT CAMP EMBER";
            detail = "Put the skids on the Camp Ember pad, then return to the fight";
        } else if (control <= -0.75f) {
            bool overFob = s.FobRangeM <= 40.0;
            line = overFob ? "BRIDGE FALLING · LEAVE THE PAD" : "BRIDGE FALLING";
            detail = overFob
                ? "Control is tipping hostile — get back over the fight and put rounds in"
                : "Hostiles own the meter — Tab a mark and hold F before the hold expires";
        } else if (control < -0.25f) {
            bool overFob = s.FobRangeM <= 40.0;
            line = overFob ? "HOSTILES GAINING · RETURN TO FIGHT" : "HOSTILES GAINING · ENGAGE";
            detail = overFob
                ? "The pad will not hold the bridge — fly back to the fight and engage"
                : "Tip control back toward friendly before the lose timer starts";
        } else if (s.AmmoRounds < 180) {
            line = "BINGO AMMO · CAMP EMBER SOON";
            detail = "Gun can under a fifth — break off for the pad before it runs dry";
        } else if (s.VictoryHoldProgress > 0.01) {
            int holdPct = Mathf.RoundToInt((float)s.VictoryHoldProgress * 100f);
            line = $"HOLDING FRIENDLY CONTROL · {holdPct}%";
            detail = "Keep tipping the fight — do not let hostiles claw it back";
        } else if (s.TargetSelected) {
            line = "TIP CONTROL FRIENDLY · HOLD 45s";
            detail = "Hold F when GUN ON TARGET — Tab cycles marks";
        } else {
            line = "TIP CONTROL FRIENDLY · HOLD 45s";
            detail = "W collective up · S down · Tab target · hold F gunner";
        }

        Label(x + 14, y + 10, pw - 28, 16, line, _objLine);
        Label(x + 14, y + 28, pw - 28, 14, detail, _objDetail);

        // Lab .balance-track / .hold-track: labels RIGHT above each track (not left — left
        // "HOLD" used to sit on the CONTROL bar and OCR as HEALTH).
        float trackX = x + 14f;
        float trackW = pw - 28f;
        float trackY = y + 56f;
        Fill(trackX, trackY, trackW, 8f, TrackBg);
        float controlPct = Mathf.Clamp01((control + 1f) * 0.5f);
        float markerX = trackX + controlPct * trackW;
        Fill(markerX - 1.5f, trackY - 1f, 3f, 10f, Friendly);
        Label(trackX + trackW - 72f, trackY - 15f, 68f, 12, "CONTROL", _trackLabel);

        float holdY = trackY + 26f;
        Fill(trackX, holdY, trackW, 8f, TrackBg);
        // Lab hold-track uses victory_hold_progress (0..1), not control proxy.
        float holdFrac = Mathf.Clamp01((float)s.VictoryHoldProgress);
        if (holdFrac > 0.01f) {
            Fill(trackX, holdY, Mathf.Max(2f, trackW * holdFrac), 8f, Friendly);
        }
        Label(trackX + trackW - 88f, holdY - 15f, 84f, 12,
            $"HOLD {Mathf.RoundToInt(holdFrac * 100f)}%", _trackLabel);

        // Preserve the native operational readouts below the Web objective/track hierarchy.
        // The browser paints these through its canvas HUD; OnGUI has no separate combiner pass.
        float nrPct = Mathf.Clamp01((float)s.RotorRpm / 324f) * 100f;
        float raltFt = (float)s.ClearanceM * 3.28084f;
        string fob = s.FobRangeM <= 40.0
            ? "FOB PAD · REARM"
            : $"FOB {(s.FobRangeM / 1000.0):F1} KM";
        string gun = GunStatusShort(s);
        string tgt = s.Padlock && s.TargetPresent
            ? (string.IsNullOrEmpty(s.TargetLabel) ? "TARGET HOSTILE" : $"TARGET {s.TargetLabel}")
            : "TARGET —";
        float ry = holdY + 18f;
        Label(x + 14, ry, pw - 28, 14,
            $"AMMO {Mathf.Max(0, s.AmmoRounds)}   {fob}   KILLS {s.HostileKills}   {tgt}", _war);
        bool gunBad = gun is "DRY" or "OUT OF LIMITS" or "NO SOLUTION" or "MASKED";
        Label(x + 14, ry + 16, 150, 14, $"GUN {gun}", gunBad ? _warnLeft : _war);
        Label(x + 168, ry + 16, pw - 182, 14,
            $"NR {Mathf.RoundToInt(nrPct)}%   RALT {Mathf.RoundToInt(raltFt)} FT", _war);
    }

    static float ObjectivePanelY(float screenHeight) =>
        Mathf.Max(44f, screenHeight - ObjectiveHeight - ObjectiveBottom);

    static string GunStatusShort(Snapshot s) {
        string status = string.IsNullOrEmpty(s.GunStatus) ? "none" : s.GunStatus.ToLowerInvariant();
        return status switch {
            "dry" => "DRY",
            "outoflimits" => "OUT OF LIMITS",
            "nosolution" => "NO SOLUTION",
            "masked" => "MASKED",
            "firing" => "FIRING",
            "tracking" => "TRACKING",
            _ => "READY",
        };
    }

    static void DrawReticle(float cx, float cy) {
        // Lab .reticle: 34px crosshair, opacity ~0.45, soft green — not a neon ring.
        float arm = 10f;
        float t = 1.2f;
        Fill(cx - 0.6f, cy - arm, t, arm - 3f, Reticle);
        Fill(cx - 0.6f, cy + 3f, t, arm - 3f, Reticle);
        Fill(cx - arm, cy - 0.6f, arm - 3f, t, Reticle);
        Fill(cx + 3f, cy - 0.6f, arm - 3f, t, Reticle);
    }

    static void DrawGunWarn(float w, float h, Snapshot s) {
        string status = string.IsNullOrEmpty(s.GunStatus) ? "none" : s.GunStatus.ToLowerInvariant();
        string warn = status switch {
            "dry" => "GUN DRY",
            "outoflimits" => "GUN OUT OF LIMITS",
            "nosolution" => "GUN NO SOLUTION",
            "masked" => "GUN MASKED",
            _ => null,
        };
        if (warn == null) return;
        float cx = w * 0.5f;
        Fill(cx - 110, h * 0.62f, 220, 22, Glass);
        Stroke(cx - 110, h * 0.62f, 220, 22, 1f, Hazard);
        Label(cx - 106, h * 0.62f + 2, 212, 18, warn, _warn);
    }

    static void DrawFactionLegend(float w, float h) {
        // Lab .legend — 16 px right/bottom, 10 px keys and 6 px row gap.
        float x = w - 118f;
        float y = h - 58f;
        Fill(x, y + 4, 10, 10, Friendly);
        Label(x + 16, y, 90, 16, "friendly", _legend);
        Fill(x, y + 20, 10, 10, Hostile);
        Label(x + 16, y + 16, 90, 16, "hostile", _legend);
        Fill(x, y + 36, 10, 10, Hazard);
        Label(x + 16, y + 32, 90, 16, "contested", _legend);
    }

    static void DrawPadlockEdge(float w, float h, Vector3 sp, float cx, float cy) {
        Vector2 dir = new Vector2(sp.x - cx, sp.y - cy);
        if (dir.sqrMagnitude < 1f) dir = Vector2.right;
        dir.Normalize();
        float ex = Mathf.Clamp(cx + dir.x * (w * 0.42f), 24f, w - 24f);
        float ey = Mathf.Clamp(cy + dir.y * (h * 0.38f), 40f, h - 48f);
        Fill(ex - 10, ey - 1.5f, 20, 3f, Hazard);
        Fill(ex - 1.5f, ey - 10, 3f, 20, Hazard);
    }

    static void DrawTargetBox(float x, float y, float sepM) {
        float s = Mathf.Clamp(34f - sepM * 0.01f, 14f, 34f);
        Stroke(x - s * 0.5f, y - s * 0.5f, s, s, 1.5f, Hazard);
        Label(x - 28, y + s * 0.5f + 2, 56, 14, $"{sepM:F0}m", _muted);
    }

    static void DrawGoldenPathCue(float w, float h, string text) {
        if (string.IsNullOrEmpty(text)) return;
        Vector2 size = _cue.CalcSize(new GUIContent(text));
        float width = Mathf.Clamp(size.x + 28f, 180f, 360f);
        float x = w * 0.5f - width * 0.5f;
        float y = h - 58f;
        Fill(x, y, width, 26f, new Color(6 / 255f, 12 / 255f, 10 / 255f, 0.72f));
        Stroke(x, y, width, 26f, 1f, new Color(180 / 255f, 210 / 255f, 160 / 255f, 0.34f));
        Label(x, y, width, 26f, text, _cue);
    }

    static void Label(float x, float y, float ww, float hh, string text, GUIStyle style) {
        GUI.color = Color.white;
        GUI.Label(new Rect(x, y, ww, hh), text, style);
    }

    static void Fill(float x, float y, float ww, float hh, Color c) {
        GUI.color = c;
        GUI.DrawTexture(new Rect(x, y, ww, hh), _white);
        GUI.color = Color.white;
    }

    static void Stroke(float x, float y, float ww, float hh, float t, Color c) {
        Fill(x, y, ww, t, c);
        Fill(x, y + hh - t, ww, t, c);
        Fill(x, y, t, hh, c);
        Fill(x + ww - t, y, t, hh, c);
    }
}

}
