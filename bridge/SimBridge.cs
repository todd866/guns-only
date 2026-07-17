using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Godot;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly;

public partial class SimBridge : Node {
    AircraftSim _player = null!;
    RailBandit _bandit = null!;
    BeatSetup _beat = null!;
    KeyGrammar _keys = null!;
    DetentLayer _detents = null!;
    PromptTracker _prompts = null!;
    PromptCue _cue;
    DoctrineAdvice _advice = new(1.0, 0.0, "free");
    double _acc, _simTimeMs;
    double _lastRange, _closureKts, _closureSmooth;
    const double Dt = 1.0 / AircraftSim.TickHz;
    int _shotsInWindow, _shotsTotal;
    bool _triggerDown;

    public override void _Ready() => StartBeat(1);

    public void StartBeat(int index) {
        var variant = _detents?.Variant ?? ValleyVariant.DoctrineDeep;
        _beat = index switch { 2 => Beats.BreakDefense(), 3 => Beats.Saddle(), 4 => Beats.BalloonStrike(), _ => Beats.Perch() };
        _player = new AircraftSim(_beat.Player, _beat.PlayerAir);
        _bandit = new RailBandit(_beat.Bandit, _beat.BanditAir, _beat.BanditTimeline);
        _keys = new KeyGrammar();
        _detents = new DetentLayer { Variant = variant };
        _prompts = new PromptTracker();
        _advice = new DoctrineAdvice(1.0, 0.0, "setup");
        _cue = PromptCue.None;
        _triggerDown = false;
        _acc = 0; _shotsInWindow = 0; _shotsTotal = 0;
        _lastRange = Geometry.Range(_player.State, _bandit.State); _closureKts = 0; _closureSmooth = 0;
        // _simTimeMs deliberately NOT reset: one monotonic clock for grammar timestamps across beats.

        RotateSegment(index, GetVariant());
    }
    public void FeedKey(int gkey, bool pressed) {
        _keys.Feed((GKey)gkey, pressed, _simTimeMs);
        RecordEvent(gkey, pressed);
    }
    public void SetVariant(int v) => _detents.Variant = v == 1 ? ValleyVariant.PhysicsOnly : ValleyVariant.DoctrineDeep;
    public int GetVariant() => _detents.Variant == ValleyVariant.PhysicsOnly ? 1 : 0;
    public void Trigger(bool down) {
        if (down && !_triggerDown) { _shotsTotal++; if (CameraSolver.GunWindow(_player.State, _bandit.State)) _shotsInWindow++; }
        _triggerDown = down;
        RecordEvent(8, down); // GKey.Trigger
    }

    public override void _PhysicsProcess(double delta) {
        _acc = System.Math.Min(_acc + delta, 0.25); // cap catch-up: a suspended app must not replay minutes of sim
        while (_acc >= Dt) {
            _advice = _beat.Law.Advise(_player.State, _bandit.State, _beat.PlayerAir);
            _detents.Tick(_keys, _simTimeMs, _player.State, _beat.PlayerAir, _advice, Dt);
            _cue = _prompts.Cue(_advice, _detents.Command, _detents.Tier);
            _player.Step(_detents.Command, Dt);
            _bandit.Step(Dt);
            double rng = Geometry.Range(_player.State, _bandit.State);
            _closureKts = (_lastRange - rng) / Dt * 1.94384; // +ve = closing; smoothed a touch below
            _closureKts = _closureSmooth = _closureSmooth * 0.9 + _closureKts * 0.1;
            _lastRange = rng;
            _simTimeMs += Dt * 1000.0; _acc -= Dt;

            if (_sessionDir != null) {
                _segTickCounter++;
                if (_segTickCounter % TelemetryEveryNthTick == 0) RecordTelemetrySample();
            }
        }
    }

    static Transform3D ToGodot(in AircraftState s, in GunsOnly.Sim.Vec3D liftDir) {
        var origin = new Vector3((float)s.Position.X, (float)s.Position.Y, (float)(-s.Position.Z));
        var fwdSim = s.ForwardDir();
        var fwd = new Vector3((float)fwdSim.X, (float)fwdSim.Y, (float)(-fwdSim.Z)).Normalized();
        var up = new Vector3((float)liftDir.X, (float)liftDir.Y, (float)(-liftDir.Z)).Normalized();
        // Basis built directly from the kernel's frame: no world-up reconstruction, no bank
        // rotation, no sign conventions to mirror (review finding: the old path rendered
        // every roll backwards and snapped 180 deg at loop apex).
        var zAxis = -fwd;                          // Godot forward = -Z
        var xAxis = up.Cross(zAxis).Normalized();  // right-handed: x = y cross z
        return new Transform3D(new Basis(xAxis, up, zAxis), origin);
    }
    public Transform3D GetPlayerTransform() => ToGodot(_player.State, _player.LiftDir);
    public Transform3D GetBanditTransform() => ToGodot(_bandit.State, _bandit.LiftDir);

    public Godot.Collections.Dictionary GetHud() {
        var s = _player.State;
        return new Godot.Collections.Dictionary {
            {"t_ms", _simTimeMs},
            {"speed_kts", s.Speed * 1.94384}, {"alt_ft", s.Position.Y * 3.28084},
            {"g_actual", _player.LastNz}, {"g_cmd", _detents.Command.GDemand},
            {"g_valley", _detents.ValleyG},
            {"g_maxperform", Protection.MaxPerformG(s, _beat.PlayerAir)},
            {"g_hardmax", Protection.HardMaxG(s, _beat.PlayerAir)},
            {"sticky", _detents.StickyOffsetG}, {"tier", (int)_detents.Tier},
            {"variant", GetVariant()}, {"buffet", _player.Buffet},
            {"prompt", (int)_cue},
            {"context", _advice.Context},
            {"angle_off_deg", Geometry.AngleOff(s, _bandit.State) * 57.2958},
            {"range_m", Geometry.Range(s, _bandit.State)},
            {"closure_kts", _closureKts},
            {"pitch_deg", s.Gamma * 57.2958},
            {"bank_deg", s.Bank * 57.2958},
            {"heading_deg", ((s.Chi * 57.2958) % 360 + 360) % 360},
            {"gun_window", CameraSolver.GunWindow(s, _bandit.State)},
            {"beat", _beat.Name},
            {"shots_total", _shotsTotal}, {"shots_in_window", _shotsInWindow},
        };
    }
    // Camera access for the rig (GDScript): returns [pos, lookat, up] for the given mode.
    // The pose carries its own up vector — Godot look_at forbids view||up, which a fixed
    // Vector3.UP hits at vertical geometries (review finding).
    public Godot.Collections.Array GetCameraPose(int mode) {
        var pose = CameraSolver.Solve((CameraMode)mode, _player.State, _bandit.State);
        return new Godot.Collections.Array {
            new Vector3((float)pose.Position.X, (float)pose.Position.Y, (float)(-pose.Position.Z)),
            new Vector3((float)pose.LookAt.X, (float)pose.LookAt.Y, (float)(-pose.LookAt.Z)),
            new Vector3((float)pose.Up.X, (float)pose.Up.Y, (float)(-pose.Up.Z)),
        };
    }

    // ------------------------------------------------------------------
    // Live-session black-box recorder. Always on, no env gate: every real
    // session (rig-driven or human) records. A "segment" is one fight
    // between restarts/beat-changes -- StartBeat closes whatever segment
    // was open (if any) and opens the next. Segments are written in the
    // exact scenario schema testrig/rig.gd already consumes, so bin/replay
    // can hand a recorded segment straight to bin/rig unchanged.
    //
    // Never allowed to crash the game: every disk-touching operation is
    // wrapped in try/catch. On any failure, _sessionDir reverts to null
    // and the bridge behaves exactly as if recording didn't exist; the
    // next StartBeat will retry (fresh session dir) in case the failure
    // was transient. Per-tick work stays allocation-light: FeedKey/Trigger
    // append a tiny struct to a List, physics ticks snapshot GetHud() (an
    // allocation the HUD already pays for every rendered frame) every
    // TelemetryEveryNthTick ticks. All string building and file I/O happens
    // only at segment close.
    const int TelemetryEveryNthTick = 12; // 120 Hz sim / 12 = 10 Hz telemetry, matching rig.gd's own cadence

    struct RecEvent { public double T; public int Key; public bool Pressed; }
    struct TelemetrySample { public double T; public Godot.Collections.Dictionary Hud; public Vector3 PlayerPos; public Vector3 BanditPos; }

    string _sessionDir;                  // "user://sessions/<session>/", or null when recording is disabled
    int _segIndex;                       // 0 = no segment opened yet this session
    int _segBeat, _segVariant;
    double _segStartMs;
    int _segTickCounter;
    readonly List<RecEvent> _segEvents = new();
    readonly List<TelemetrySample> _segTelemetry = new();

    void RecordEvent(int gkey, bool pressed) {
        if (_sessionDir == null) return;
        _segEvents.Add(new RecEvent { T = _simTimeMs / 1000.0, Key = gkey, Pressed = pressed });
    }

    void RecordTelemetrySample() {
        try {
            _segTelemetry.Add(new TelemetrySample {
                T = _simTimeMs / 1000.0,
                Hud = GetHud(),
                PlayerPos = GetPlayerTransform().Origin,
                BanditPos = GetBanditTransform().Origin,
            });
        } catch { _sessionDir = null; } // never let a recording hiccup take the game down
    }

    // Opens session dir (lazily, on the very first call) and rotates to a fresh segment,
    // closing+writing whatever segment was previously open. No-op-safe: any failure along
    // the way leaves _sessionDir null and recording quietly stays off.
    void RotateSegment(int beatIndex, int variant) {
        try {
            if (_sessionDir == null) {
                var candidate = "user://sessions/" + SessionName() + "/";
                if (DirAccess.MakeDirRecursiveAbsolute(candidate) != Error.Ok) return;
                _sessionDir = candidate;
            } else if (_segIndex > 0) {
                CloseSegmentInternal();
            }
            _segIndex++;
            _segBeat = beatIndex;
            _segVariant = variant;
            _segStartMs = _simTimeMs;
            _segEvents.Clear();
            _segTelemetry.Clear();
            _segTickCounter = 0;
        } catch {
            _sessionDir = null;
        }
    }

    static string SessionName() {
        var stamp = Time.GetDatetimeStringFromSystem(false, true).Replace(":", "-").Replace(" ", "_");
        return $"sess-{stamp}-{OS.GetProcessId()}";
    }

    // Flushes the segment currently open (if any) to disk. Called both on ordinary
    // segment rotation and on shutdown; idempotent via the _segIndex > 0 guard callers apply.
    void CloseSegmentInternal() {
        var durationS = System.Math.Max(0.0, (_simTimeMs - _segStartMs) / 1000.0);
        var jsonPath = _sessionDir + $"seg{_segIndex}-beat{_segBeat}.json";
        using (var f = FileAccess.Open(jsonPath, FileAccess.ModeFlags.Write)) {
            f?.StoreString(BuildSegmentJson(_segBeat, _segVariant, durationS, _segEvents, _segStartMs));
        }
        var telPath = _sessionDir + $"seg{_segIndex}-beat{_segBeat}.telemetry.jsonl";
        using (var tf = FileAccess.Open(telPath, FileAccess.ModeFlags.Write)) {
            if (tf != null) foreach (var sample in _segTelemetry) tf.StoreLine(BuildTelemetryLine(sample, _segStartMs));
        }
    }

    // Handles both the window-close (X button) request and the ordinary scene-teardown
    // path so a segment in flight is never silently dropped, however the process ends.
    public override void _Notification(int what) {
        if (what == NotificationWMCloseRequest) FlushSession();
    }
    public override void _ExitTree() => FlushSession();

    void FlushSession() {
        try {
            if (_sessionDir != null && _segIndex > 0) {
                CloseSegmentInternal();
                _segIndex = 0; // guards against a second flush (both hooks can fire) double-writing
            }
        } catch { }
    }

    string BuildSegmentJson(int beat, int variant, double durationS, List<RecEvent> events, double segStartMs) {
        var sb = new StringBuilder(256 + events.Count * 40);
        var segStartS = segStartMs / 1000.0;
        sb.Append('{');
        sb.Append("\"name\":"); WriteJsonString(sb, $"live-seg{_segIndex}-beat{beat}"); sb.Append(',');
        sb.Append("\"beat\":").Append(beat).Append(',');
        sb.Append("\"variant\":").Append(variant).Append(',');
        sb.Append("\"duration_s\":"); WriteJsonNumber(sb, durationS); sb.Append(',');
        sb.Append("\"events\":[");
        for (int i = 0; i < events.Count; i++) {
            if (i > 0) sb.Append(',');
            var e = events[i];
            sb.Append("{\"t\":"); WriteJsonNumber(sb, e.T - segStartS);
            sb.Append(",\"key\":").Append(e.Key);
            sb.Append(",\"pressed\":").Append(e.Pressed ? "true" : "false");
            sb.Append('}');
        }
        sb.Append("],");
        sb.Append("\"notes\":"); WriteJsonString(sb, "Live-captured session segment (black-box recorder).");
        sb.Append('}');
        return sb.ToString();
    }

    static string BuildTelemetryLine(TelemetrySample s, double segStartMs) {
        var sb = new StringBuilder(512);
        sb.Append("{\"t\":"); WriteJsonNumber(sb, s.T - segStartMs / 1000.0);
        sb.Append(",\"hud\":"); WriteHudJson(sb, s.Hud);
        sb.Append(",\"player_pos\":["); WriteVec3(sb, s.PlayerPos); sb.Append(']');
        sb.Append(",\"bandit_pos\":["); WriteVec3(sb, s.BanditPos); sb.Append(']');
        sb.Append('}');
        return sb.ToString();
    }

    static void WriteVec3(StringBuilder sb, Vector3 v) {
        WriteJsonNumber(sb, v.X); sb.Append(','); WriteJsonNumber(sb, v.Y); sb.Append(','); WriteJsonNumber(sb, v.Z);
    }

    static void WriteHudJson(StringBuilder sb, Godot.Collections.Dictionary hud) {
        sb.Append('{');
        bool first = true;
        foreach (var kv in hud) {
            if (!first) sb.Append(','); first = false;
            WriteJsonString(sb, kv.Key.AsString());
            sb.Append(':');
            WriteVariantJson(sb, kv.Value);
        }
        sb.Append('}');
    }

    static void WriteVariantJson(StringBuilder sb, Variant v) {
        switch (v.VariantType) {
            case Variant.Type.Bool: sb.Append(v.AsBool() ? "true" : "false"); break;
            case Variant.Type.Int: sb.Append(v.AsInt64()); break;
            case Variant.Type.Float: WriteJsonNumber(sb, v.AsDouble()); break;
            case Variant.Type.String: WriteJsonString(sb, v.AsString()); break;
            default: WriteJsonString(sb, v.ToString()); break;
        }
    }

    static void WriteJsonNumber(StringBuilder sb, double d) {
        if (double.IsNaN(d) || double.IsInfinity(d)) { sb.Append('0'); return; }
        sb.Append(d.ToString(CultureInfo.InvariantCulture));
    }

    static void WriteJsonString(StringBuilder sb, string s) {
        sb.Append('"');
        foreach (var c in s) {
            switch (c) {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                    else sb.Append(c);
                    break;
            }
        }
        sb.Append('"');
    }
}
