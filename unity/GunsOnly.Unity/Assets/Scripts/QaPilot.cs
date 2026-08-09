using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEngine;
using UnityEngine.Experimental.Rendering;

namespace GunsOnly.UnityClient {

/// <summary>
/// Fail-closed playtest pilot. Enabled with <c>-gunsOnlyQa</c> or env <c>GUNSONLY_QA=1</c>.
/// Drives keys through HostClient, dumps end-of-frame PNGs, and writes telemetry.jsonl.
/// </summary>
public sealed class QaPilot : MonoBehaviour {
    const int WorldCaptureWidth = 1600;
    const int WorldCaptureHeight = 1000;
    const int WorldCaptureAntiAliasing = 4;

    HostClient _host;
    Camera _cam;
    CobraParityCamera _parityCamera;
    string _dir;
    readonly List<string> _failures = new();
    int _frameIndex;
    bool _finished;
    double _altAtStart = double.NaN;
    double _altAfterPull = double.NaN;
    double _fwdDotAfterRoll = double.NaN;
    float _fwdX0, _fwdY0, _fwdZ0;
    long _tickAtStart;
    long _tickAtEnd;
    bool _sawOpponent;
    bool _sawConnected;
    bool _worldCaptureRequired;
    int _worldFrameCount;
    bool _audioStateSaved;
    bool _audioWasPaused;
    float _audioVolume;
    bool _cameraStateSaved;
    bool _loggedWorldCaptureTransfer;
    Vector3 _liveCameraPosition;
    Quaternion _liveCameraRotation;
    float _liveCameraFov;
    float _liveCameraAspect;
    float _liveCameraNear;
    float _liveCameraFar;
    bool _liveCameraOrthographic;
    bool _liveCameraHdr;
    bool _liveCameraMsaa;
    RenderTexture _liveCameraTarget;
    RenderTexture _liveRenderTextureActive;
    readonly Dictionary<GameObject, bool> _worldCaptureRoleStates = new();

    /// <summary>True only while QA owns the live camera for a contract acceptance view.</summary>
    public static bool WorldCaptureActive { get; private set; }

    public static bool Enabled {
        get {
            foreach (string arg in Environment.GetCommandLineArgs()) {
                if (arg is "-gunsOnlyQa" or "--gunsOnlyQa") return true;
            }
            string env = Environment.GetEnvironmentVariable("GUNSONLY_QA");
            return env is "1" or "true" or "TRUE" or "yes";
        }
    }

    void Awake() {
        // QaPilot is added before scene audio components. Clamp both pause and gain so QA can
        // exercise the real simulation without producing audible output.
        WorldCaptureActive = false;
        _audioWasPaused = AudioListener.pause;
        _audioVolume = AudioListener.volume;
        _audioStateSaved = true;
        AudioListener.pause = true;
        AudioListener.volume = 0f;
    }

    void OnDisable() {
        RestoreLiveCamera();
        if (!_audioStateSaved) return;
        AudioListener.volume = _audioVolume;
        AudioListener.pause = _audioWasPaused;
        _audioStateSaved = false;
    }

    public void Configure(HostClient host, Camera cam) {
        _host = host;
        _cam = cam;
        _parityCamera = cam != null ? cam.GetComponent<CobraParityCamera>() : null;
    }

    void Start() {
        _dir = Path.Combine(Application.persistentDataPath, "qa");
        Directory.CreateDirectory(_dir);
        foreach (string old in Directory.GetFiles(_dir)) {
            try { File.Delete(old); } catch { /* ignore */ }
        }
        File.WriteAllText(Path.Combine(_dir, "STARTED"), DateTime.UtcNow.ToString("o"));
        Debug.Log("[GunsOnly.QA] started → " + _dir);
        StartCoroutine(RunScript());
    }

    IEnumerator RunScript() {
        // Wait for live poses.
        float waitDeadline = Time.unscaledTime + 15f;
        while (_host == null || !_host.HasPose) {
            if (Time.unscaledTime > waitDeadline) {
                Fail("no pose within 15s");
                Finish();
                yield break;
            }
            yield return null;
        }
        // Let HostClient + bootstrap Update run so HUD/camera catch up before first dump.
        yield return null;
        yield return null;
        yield return new WaitForEndOfFrame();

        var pose0 = _host.Latest;
        _altAtStart = pose0.PlayerAltitudeFt;
        _fwdX0 = pose0.PlayerForwardUnity.x;
        _fwdY0 = pose0.PlayerForwardUnity.y;
        _fwdZ0 = pose0.PlayerForwardUnity.z;
        _tickAtStart = pose0.Tick;
        _sawConnected = _host.Connected;
        _sawOpponent = pose0.OpponentPresent;
        _worldCaptureRequired = string.Equals(
            pose0.MissionPack, "cobra-vietnam", StringComparison.OrdinalIgnoreCase)
            && FindAnyObjectByType<CobraCanyonBootstrap>() != null;
        AppendTelemetry("boot");
        yield return DumpFrame("00_boot");

        // Hold collective up 2.5s — AH-1G altitude response is collective-primary.
        HoldKey(6 /* ThrottleUp / collective */, true);
        float tPull = Time.unscaledTime + 2.5f;
        while (Time.unscaledTime < tPull) {
            AppendTelemetry("pull");
            yield return null;
        }
        HoldKey(6, false);
        _altAfterPull = _host.Latest.PlayerAltitudeFt;
        yield return DumpFrame("01_after_pull");

        // Yaw right 2.2s — heading / forward must rotate (and frames must drift for the judge).
        HoldKey(5 /* RudderRight / yaw */, true);
        float tRoll = Time.unscaledTime + 2.2f;
        while (Time.unscaledTime < tRoll) {
            AppendTelemetry("roll");
            yield return null;
        }
        HoldKey(5, false);
        {
            var f = _host.Latest.PlayerForwardUnity;
            _fwdDotAfterRoll = _fwdX0 * f.x + _fwdY0 * f.y + _fwdZ0 * f.z;
        }
        yield return DumpFrame("02_after_roll");

        // Throttle / collective already exercised in pull phase — nudge forward cyclic.
        HoldKey(1 /* PushDown / forward cyclic */, true);
        float tThr = Time.unscaledTime + 1.2f;
        while (Time.unscaledTime < tThr) {
            AppendTelemetry("throttle");
            yield return null;
        }
        HoldKey(1, false);
        yield return DumpFrame("03_after_throttle");

        // Trigger burst.
        HoldKey(8 /* Trigger */, true);
        float tGun = Time.unscaledTime + 0.8f;
        while (Time.unscaledTime < tGun) {
            AppendTelemetry("guns");
            yield return null;
        }
        HoldKey(8, false);
        yield return DumpFrame("04_after_guns");

        // Settle
        float tSettle = Time.unscaledTime + 1.0f;
        while (Time.unscaledTime < tSettle) {
            AppendTelemetry("settle");
            yield return null;
        }
        yield return DumpFrame("05_final");

        _tickAtEnd = _host.Latest.Tick;
        _sawOpponent = _sawOpponent || _host.Latest.OpponentPresent;
        _sawConnected = _sawConnected && _host.Connected;

        // Fixed, HUD-free render parity views are separate from frame_*.png so the legacy
        // flight/playability judge continues to see exactly its original six-frame sequence.
        if (_worldCaptureRequired) yield return CaptureContractViews();

        JudgeBehavior();
        Finish();
    }

    void JudgeBehavior() {
        if (!_sawConnected) Fail("never connected to host");
        if (!_sawOpponent) Fail("opponent never present (cobra requires hostile ground contact)");
        if (_tickAtEnd <= _tickAtStart + 30) Fail($"tick did not advance enough ({_tickAtStart}→{_tickAtEnd})");
        if (double.IsNaN(_altAfterPull)) Fail("missing altitude after pull");
        double dAlt = Math.Abs(_altAfterPull - _altAtStart);
        // Collective climb on AH-1G — require a clear altitude change.
        if (dAlt < 8.0) Fail($"collective did not change altitude enough (Δ={dAlt:F1} ft, start={_altAtStart:F0})");
        if (double.IsNaN(_fwdDotAfterRoll) || _fwdDotAfterRoll > 0.995) {
            Fail($"yaw did not reorient forward enough (dot={_fwdDotAfterRoll:F4})");
        }
        if (_frameIndex < 4) Fail($"too few QA frames dumped ({_frameIndex})");
        if (_worldCaptureRequired && _worldFrameCount != 3)
            Fail($"expected 3 contract world captures, got {_worldFrameCount}");
    }

    void HoldKey(int gkey, bool pressed) {
        if (_host != null) _host.SendKey(gkey, pressed);
    }

    void AppendTelemetry(string phase) {
        if (_host == null || !_host.HasPose) return;
        var p = _host.Latest;
        var sb = new StringBuilder(256);
        sb.Append('{');
        sb.Append("\"t\":").Append(Time.unscaledTime.ToString("F3")).Append(',');
        sb.Append("\"phase\":\"").Append(phase).Append("\",");
        sb.Append("\"tick\":").Append(p.Tick).Append(',');
        sb.Append("\"sim\":").Append(p.SimulationTimeS.ToString("F3")).Append(',');
        sb.Append("\"alt_ft\":").Append(p.PlayerAltitudeFt.ToString("F1")).Append(',');
        sb.Append("\"hdg\":").Append(p.PlayerHeadingDeg.ToString("F1")).Append(',');
        sb.Append("\"lifecycle\":\"").Append(p.Lifecycle).Append("\",");
        sb.Append("\"opponent\":").Append(p.OpponentPresent ? "true" : "false").Append(',');
        sb.Append("\"connected\":").Append(_host.Connected ? "true" : "false").Append(',');
        sb.Append("\"px\":").Append(p.Px.ToString("F1")).Append(',');
        sb.Append("\"py\":").Append(p.Py.ToString("F1")).Append(',');
        sb.Append("\"pz\":").Append(p.Pz.ToString("F1"));
        if (_cam != null) {
            var c = _cam.transform.position;
            sb.Append(",\"cam_x\":").Append(c.x.ToString("F1"));
            sb.Append(",\"cam_y\":").Append(c.y.ToString("F1"));
            sb.Append(",\"cam_z\":").Append(c.z.ToString("F1"));
        }
        sb.Append('}');
        File.AppendAllText(Path.Combine(_dir, "telemetry.jsonl"), sb.ToString() + "\n");
    }

    IEnumerator CaptureContractViews() {
        if (_cam == null) {
            Fail("contract world capture has no configured camera");
            yield break;
        }
        if (_parityCamera == null || !_parityCamera.isActiveAndEnabled) {
            Fail("contract world capture requires an active CobraParityCamera adapter");
            yield break;
        }

        CobraVisualContract contract = null;
        Exception contractError = null;
        try { contract = CobraVisualContract.LoadOrThrow(); }
        catch (Exception ex) { contractError = ex; }
        if (contractError != null) {
            Fail("contract world capture could not load visual contract: " + contractError.Message);
            yield break;
        }

        var projection = contract.AcceptanceProjection;
        var views = contract.AcceptanceViews;
        if (views.Length != 3) {
            Fail($"visual contract must define exactly 3 acceptance views, got {views.Length}");
            yield break;
        }
        if (Mathf.Abs(projection.VerticalFovDeg - 58f) > 0.001f) {
            Fail($"contract capture requires vertical FOV 58, got {projection.VerticalFovDeg}");
            yield break;
        }
        float captureAspect = WorldCaptureWidth / (float)WorldCaptureHeight;
        if (Mathf.Abs(projection.Aspect - captureAspect) > 0.0001f) {
            Fail($"contract capture aspect {projection.Aspect} does not match " +
                $"{WorldCaptureWidth}x{WorldCaptureHeight} ({captureAspect})");
            yield break;
        }

        // BuildWorldAfterFirstFrame is synchronous once entered, but wait fail-closed in case
        // startup ordering changes and the host pose arrives before the terrain root exists.
        float worldDeadline = Time.unscaledTime + 30f;
        while (GameObject.Find("VietnamTerrainStandIn") == null &&
            Time.unscaledTime < worldDeadline) {
            yield return null;
        }
        if (GameObject.Find("VietnamTerrainStandIn") == null) {
            Fail("contract world capture timed out waiting for VietnamTerrainStandIn");
            yield break;
        }
        if (!ApplyWorldCaptureRoleSuppressions()) {
            RestoreWorldCaptureRoleSuppressions();
            yield break;
        }

        SaveLiveCamera();
        WorldCaptureActive = true;
        GetComponent<CobraCanyonBootstrap>()?.SetWorldCapturePresentationSuppressed(true);

        RenderTexture target = null;
        Texture2D readback = null;
        Exception bufferError = null;
        try {
            target = new RenderTexture(
                WorldCaptureWidth,
                WorldCaptureHeight,
                24,
                RenderTextureFormat.ARGBHalf,
                RenderTextureReadWrite.Linear) {
                name = "GunsOnlyQaWorldCapture",
                // Bootstrap's live desktop tier is 4x MSAA. Match it so the contract plates
                // exercise the same geometry-edge quality instead of a jagged QA-only path.
                antiAliasing = WorldCaptureAntiAliasing,
                useMipMap = false,
                autoGenerateMips = false,
            };
            target.Create();
            if (!target.IsCreated())
                throw new InvalidOperationException("RenderTexture.Create returned no target");
            readback = new Texture2D(
                WorldCaptureWidth, WorldCaptureHeight, TextureFormat.RGBAHalf, false, true);
            if (target.sRGB || readback.isDataSRGB) {
                throw new InvalidOperationException(
                    $"World capture requires linear HDR buffers; target={target.sRGB} "
                    + $"readback={readback.isDataSRGB}");
            }
        }
        catch (Exception ex) { bufferError = ex; }

        if (bufferError != null) {
            Fail("contract world capture buffer setup failed: " + bufferError.Message);
            if (readback != null) Destroy(readback);
            if (target != null) {
                target.Release();
                Destroy(target);
            }
            RestoreLiveCamera();
            yield break;
        }

        try {
            // Advance once with capture ownership asserted. Dynamic presentation is suppressed,
            // so each fixed view can then occupy its own frame without sim/effect drift. This is
            // required for Unity to refresh per-camera globals and GrabPass state before every
            // explicit render; three Camera.Render calls in one frame can otherwise reuse the
            // preceding view's destination/camera state on Metal.
            yield return null;
            for (int i = 0; i < views.Length; i++) {
                var view = views[i];
                float terrainHeightM = CobraTerrainModel.Sample(view.EastM, view.NorthM);
                view.GetUnityPose(terrainHeightM, out Vector3 position, out Quaternion rotation);

                _cam.orthographic = false;
                // Cobra shaders already apply ACES. Keep this target explicitly linear, then
                // apply the same sRGB OETF as Web in the gamma-neutral raw PNG encoder below.
                _cam.allowHDR = false;
                _cam.allowMSAA = true;
                _cam.fieldOfView = projection.VerticalFovDeg;
                _cam.aspect = captureAspect;
                _cam.nearClipPlane = projection.NearClipM;
                _cam.farClipPlane = projection.FarClipM;
                _cam.transform.SetPositionAndRotation(position, rotation);
                yield return null;
                _parityCamera.ApplyProjection();

                string label = $"world_{i:00}_{SafeFileLabel(view.Id)}";
                if (WriteWorldFrame(label, view, target, readback)) _worldFrameCount++;
            }
            // Keep camera ownership through LateUpdate/OnGUI for the capture frame. This hides
            // IMGUI and proves Bootstrap cannot overwrite the last fixed pose before cleanup.
            yield return new WaitForEndOfFrame();
        }
        finally {
            RenderTexture.active = _liveRenderTextureActive;
            _cam.targetTexture = _liveCameraTarget;
            target.Release();
            Destroy(target);
            Destroy(readback);
            RestoreLiveCamera();
        }
    }

    bool WriteWorldFrame(string label, CobraVisualContract.AcceptanceViewSpec view,
        RenderTexture target, Texture2D readback) {
        string path = Path.Combine(_dir, label + ".png");
        RenderTexture priorActive = RenderTexture.active;
        RenderTexture priorTarget = _cam.targetTexture;
        try {
            _cam.targetTexture = target;
            _cam.Render();
            RenderTexture.active = target;
            readback.ReadPixels(
                new Rect(0, 0, WorldCaptureWidth, WorldCaptureHeight), 0, 0, false);
            readback.Apply(false, false);
            if (!_loggedWorldCaptureTransfer) {
                Color centreLinear = readback.GetPixel(
                    WorldCaptureWidth / 2, WorldCaptureHeight / 2);
                Debug.Log(
                    $"[GunsOnly.QA] world transfer targetSrgb={target.sRGB} "
                    + $"targetFormat={target.graphicsFormat} "
                    + $"readbackSrgb={readback.isDataSRGB} "
                    + $"readbackFormat={readback.graphicsFormat} "
                    + $"centreLinear={centreLinear.r:F5},{centreLinear.g:F5},{centreLinear.b:F5}");
                _loggedWorldCaptureTransfer = true;
            }
            byte[] png = EncodeLinearToSrgbPng(readback);
            File.WriteAllBytes(path, png);
            File.WriteAllBytes(Path.Combine(_dir, "world_latest.png"), png);
            Debug.Log($"[GunsOnly.QA] contract frame {path} " +
                $"{WorldCaptureWidth}x{WorldCaptureHeight} fov={_cam.fieldOfView:F1} " +
                $"view={view.Id} bytes={png.Length}");
            return true;
        }
        catch (Exception ex) {
            Fail($"contract frame {view.Id} failed: {ex.Message}");
            Debug.LogError("[GunsOnly.QA] contract capture " + ex);
            return false;
        }
        finally {
            _parityCamera.RestoreGlobalCulling();
            _cam.targetTexture = priorTarget;
            RenderTexture.active = priorActive;
        }
    }

    void SaveLiveCamera() {
        if (_cameraStateSaved || _cam == null) return;
        _liveCameraPosition = _cam.transform.position;
        _liveCameraRotation = _cam.transform.rotation;
        _liveCameraFov = _cam.fieldOfView;
        _liveCameraAspect = _cam.aspect;
        _liveCameraNear = _cam.nearClipPlane;
        _liveCameraFar = _cam.farClipPlane;
        _liveCameraOrthographic = _cam.orthographic;
        _liveCameraHdr = _cam.allowHDR;
        _liveCameraMsaa = _cam.allowMSAA;
        _liveCameraTarget = _cam.targetTexture;
        _liveRenderTextureActive = RenderTexture.active;
        _cameraStateSaved = true;
    }

    void RestoreLiveCamera() {
        GetComponent<CobraCanyonBootstrap>()?.SetWorldCapturePresentationSuppressed(false);
        RestoreWorldCaptureRoleSuppressions();
        WorldCaptureActive = false;
        if (!_cameraStateSaved || _cam == null) {
            _cameraStateSaved = false;
            return;
        }
        _cam.targetTexture = _liveCameraTarget;
        _cam.orthographic = _liveCameraOrthographic;
        _cam.allowHDR = _liveCameraHdr;
        _cam.allowMSAA = _liveCameraMsaa;
        _cam.fieldOfView = _liveCameraFov;
        _cam.aspect = _liveCameraAspect;
        _cam.nearClipPlane = _liveCameraNear;
        _cam.farClipPlane = _liveCameraFar;
        _cam.transform.SetPositionAndRotation(_liveCameraPosition, _liveCameraRotation);
        _parityCamera?.ApplyProjection();
        RenderTexture.active = _liveRenderTextureActive;
        _cameraStateSaved = false;
    }

    bool ApplyWorldCaptureRoleSuppressions() {
        string raw = Environment.GetEnvironmentVariable("GUNS_UNITY_QA_HIDE_ROLES");
        if (string.IsNullOrWhiteSpace(raw)) return true;
        foreach (string token in raw.Split(',')) {
            string role = token.Trim();
            if (role.Length == 0) continue;
            string upper = role.ToUpperInvariant();
            GameObject target = GameObject.Find("COBRA_CANYON_ASSET_" + upper)
                ?? GameObject.Find("COBRA_CANYON_" + upper);
            if (target == null) {
                Fail("contract world capture role suppression matched no object for " + role);
                return false;
            }
            if (!_worldCaptureRoleStates.ContainsKey(target)) {
                _worldCaptureRoleStates.Add(target, target.activeSelf);
                target.SetActive(false);
                Debug.Log("[GunsOnly.QA] suppressed contract role " + role);
            }
        }
        return true;
    }

    void RestoreWorldCaptureRoleSuppressions() {
        foreach (KeyValuePair<GameObject, bool> entry in _worldCaptureRoleStates) {
            if (entry.Key != null) entry.Key.SetActive(entry.Value);
        }
        _worldCaptureRoleStates.Clear();
    }

    static byte[] EncodeLinearToSrgbPng(Texture2D linearReadback) {
        Color[] linearPixels = linearReadback.GetPixels();
        var encodedBytes = new byte[linearPixels.Length * 3];
        for (int i = 0; i < linearPixels.Length; i++) {
            Color pixel = linearPixels[i];
            int offset = i * 3;
            encodedBytes[offset] = LinearToSrgbByte(pixel.r);
            encodedBytes[offset + 1] = LinearToSrgbByte(pixel.g);
            encodedBytes[offset + 2] = LinearToSrgbByte(pixel.b);
        }
        // Unlike Texture2D.EncodeToPNG, this overload is explicitly gamma/profile neutral.
        return ImageConversion.EncodeArrayToPNG(
            encodedBytes,
            GraphicsFormat.R8G8B8_UNorm,
            (uint)linearReadback.width,
            (uint)linearReadback.height,
            (uint)(linearReadback.width * 3));
    }

    static byte LinearToSrgbByte(float linear) {
        linear = Mathf.Clamp01(linear);
        float srgb = linear <= 0.0031308f
            ? linear * 12.92f
            : 1.055f * Mathf.Pow(linear, 1f / 2.4f) - 0.055f;
        return (byte)Mathf.Clamp(Mathf.RoundToInt(srgb * 255f), 0, 255);
    }

    static string SafeFileLabel(string value) {
        if (string.IsNullOrWhiteSpace(value)) return "unnamed";
        var safe = new StringBuilder(value.Length);
        foreach (char c in value) {
            safe.Append(char.IsLetterOrDigit(c) || c is '-' or '_' ? c : '_');
        }
        return safe.ToString();
    }

    IEnumerator DumpFrame(string label) {
        yield return new WaitForEndOfFrame();
        string path = Path.Combine(_dir, $"frame_{_frameIndex:00}_{label}.png");
        try {
            int w = Screen.width;
            int h = Screen.height;
            var tex = new Texture2D(w, h, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, w, h), 0, 0, false);
            tex.Apply(false, false);
            byte[] png = tex.EncodeToPNG();
            Destroy(tex);
            File.WriteAllBytes(path, png);
            // Also mirror last frame for quick inspection.
            File.WriteAllBytes(Path.Combine(_dir, "latest.png"), png);
            File.WriteAllBytes("/tmp/guns-only-accept.png", png);
            _frameIndex++;
            Debug.Log("[GunsOnly.QA] frame " + path + " " + w + "x" + h + " bytes=" + png.Length);
        } catch (Exception ex) {
            Fail("frame dump failed: " + ex.Message);
            Debug.LogError("[GunsOnly.QA] " + ex);
        }
    }

    void Fail(string reason) {
        _failures.Add(reason);
        Debug.LogError("[GunsOnly.QA] FAIL: " + reason);
    }

    void Finish() {
        if (_finished) return;
        _finished = true;
        bool ok = _failures.Count == 0;
        var sb = new StringBuilder();
        sb.Append("{\n");
        sb.Append("  \"ok\": ").Append(ok ? "true" : "false").Append(",\n");
        sb.Append("  \"frames\": ").Append(_frameIndex).Append(",\n");
        sb.Append("  \"world_capture_required\": ")
            .Append(_worldCaptureRequired ? "true" : "false").Append(",\n");
        sb.Append("  \"world_frames\": ").Append(_worldFrameCount).Append(",\n");
        sb.Append("  \"tick_start\": ").Append(_tickAtStart).Append(",\n");
        sb.Append("  \"tick_end\": ").Append(_tickAtEnd).Append(",\n");
        sb.Append("  \"alt_start_ft\": ").Append(_altAtStart.ToString("F1")).Append(",\n");
        sb.Append("  \"alt_after_pull_ft\": ").Append(_altAfterPull.ToString("F1")).Append(",\n");
        sb.Append("  \"fwd_dot_after_roll\": ").Append(_fwdDotAfterRoll.ToString("F4")).Append(",\n");
        sb.Append("  \"opponent\": ").Append(_sawOpponent ? "true" : "false").Append(",\n");
        sb.Append("  \"failures\": [");
        for (int i = 0; i < _failures.Count; i++) {
            if (i > 0) sb.Append(", ");
            sb.Append('"').Append(_failures[i].Replace("\"", "'")).Append('"');
        }
        sb.Append("]\n}\n");
        string resultPath = Path.Combine(_dir, "result.json");
        File.WriteAllText(resultPath, sb.ToString());
        File.WriteAllText(Path.Combine(_dir, ok ? "PASS" : "FAIL"), sb.ToString());
        Debug.Log("[GunsOnly.QA] finished ok=" + ok + " → " + resultPath);
        // Quit so the harness can collect artifacts without a stuck window.
        Application.Quit(ok ? 0 : 17);
    }
}

}
