using System.Collections;
using System.IO;
using GunsOnly.UnityBridge;
using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Browser live first-merge presentation:
/// cockpit-eye camera (exterior hidden), F-22 canopy glass, Ukraine combat sky, bandit + impostor,
/// period-ish gunsight HUD, tracers, procedural audio. Chase (key C) is debug/replay only.
/// </summary>
public sealed class FirstMergeBootstrap : MonoBehaviour {
    HostClient _host;
    Transform _player;
    Transform _bandit;
    Camera _cam;
    BrowserParitySky _sky;
    F22CanopyGlass _canopy;
    DistantAircraftImpostor _impostor;
    FirstMergeAudio _audio;
    F22UkraineLowAltitudeWorld _lowAltitudeWorld;
    Material _terrainMaterial;
    string _hud = "boot…";
    bool _dumpStarted;
    bool _banditPresent;
    bool _chaseMode;
    Vector3 _playerFwd = Vector3.forward;
    Vector3 _playerUp = Vector3.up;
    float _sepM;
    double _altFt;
    double _hdgDeg;
    float _throttle01 = 0.55f;
    static Material _groundMat;
    static Material _markMat;
    static Material _tracerMat;
    static Material _hillMat;

    // CobraCanyonBootstrap owns the single runtime initializer and selects this presentation only
    // for --mission first-merge. Keeping one initializer avoids a nondeterministic double boot.

    void Awake() {
        Application.runInBackground = true;
        if (QualitySettings.activeColorSpace != ColorSpace.Linear) {
            throw new System.InvalidOperationException(
                "F-22 Web ACES parity requires Unity Linear color space.");
        }
        QualitySettings.SetQualityLevel(QualitySettings.names.Length - 1, true);
        QualitySettings.vSyncCount = 0;
        QualitySettings.shadowDistance = F22PresentationContract.ShadowDistanceM;
        QualitySettings.shadows = ShadowQuality.All;
        QualitySettings.shadowCascades = 2;
        QualitySettings.antiAliasing = 4;
        Screen.fullScreenMode = FullScreenMode.Windowed;
        Screen.SetResolution(1600, 1000, FullScreenMode.Windowed);

        _groundMat = MakeColor(new Color(0.24f, 0.38f, 0.18f));
        _markMat = MakeColor(new Color(1f, 0.92f, 0.15f));
        _hillMat = MakeColor(new Color(0.28f, 0.38f, 0.20f));
        _tracerMat = MakeUnlit(new Color(1f, 0.85f, 0.35f));

        _host = gameObject.AddComponent<HostClient>();
        _host.ConfigureMission(UnityMissionKind.FirstMerge);
        var keyboard = gameObject.AddComponent<KeyboardInput>();
        keyboard.ConfigureMission(UnityMissionKind.FirstMerge);
        if (QaPilot.Enabled) {
            Debug.LogWarning(
                "[GunsOnly] --qa is the Cobra world-plate pilot; F-22 uses its own automatic frame dump");
        }

        _player = BrowserParityJet.Build("PlayerF22", BrowserParityJet.JetLivery.F22);
        _bandit = BrowserParityJet.Build("BanditSu27", BrowserParityJet.JetLivery.Bandit);
        _bandit.gameObject.SetActive(false);
        _player.gameObject.SetActive(false);

        _sky = BrowserParitySky.Attach(transform);
        _canopy = F22CanopyGlass.Attach(transform);
        _impostor = DistantAircraftImpostor.Attach(transform);
        _audio = FirstMergeAudio.Attach(transform);

        var camGo = new GameObject("CockpitCam");
        _cam = camGo.AddComponent<Camera>();
        camGo.AddComponent<F22OutputTransform>();
        _cam.tag = "MainCamera";
        _cam.fieldOfView = F22PresentationContract.CockpitVerticalFovDeg;
        _cam.nearClipPlane = F22PresentationContract.CockpitNearClipM;
        _cam.farClipPlane = F22PresentationContract.CockpitFarClipM;
        _cam.clearFlags = CameraClearFlags.SolidColor;
        _cam.backgroundColor = ToColor(F22UkraineVisualContract.FogLow);
        _cam.allowHDR = true;
        _cam.allowMSAA = true;
        _sky.Apply(3000f, _cam);

        var lightGo = new GameObject("Sun");
        var light = lightGo.AddComponent<Light>();
        light.type = LightType.Directional;
        F22Vector3 sunDirection = F22PresentationContract.SunDirectionUnity;
        light.transform.rotation = Quaternion.LookRotation(
            -new Vector3(sunDirection.X, sunDirection.Y, sunDirection.Z), Vector3.up);
        light.intensity = F22UkraineVisualContract.SunIntensity;
        light.color = ToColor(F22UkraineVisualContract.SunColor);
        light.shadows = LightShadows.Soft;
        light.shadowNearPlane = 10f;
        light.shadowNormalBias = 0.16f;
        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
        Color skyFill = ToColor(F22UkraineVisualContract.HemisphereSky)
            * F22UkraineVisualContract.HemisphereIntensity;
        Color groundFill = ToColor(F22UkraineVisualContract.HemisphereGround)
            * F22UkraineVisualContract.HemisphereIntensity;
        RenderSettings.ambientSkyColor = skyFill;
        RenderSettings.ambientEquatorColor = Color.Lerp(groundFill, skyFill, 0.5f);
        RenderSettings.ambientGroundColor = groundFill;
        RenderSettings.fog = true;
        RenderSettings.fogMode = FogMode.ExponentialSquared;
        RenderSettings.fogColor = ToColor(F22UkraineVisualContract.FogLow);
        RenderSettings.fogDensity = F22UkraineVisualContract.BaseFogDensityPerM
            * F22UkraineVisualContract.AtmosphereDensityScale;
        RenderSettings.reflectionIntensity = 0.92f;

        _lowAltitudeWorld = F22UkraineLowAltitudeWorld.Build(transform);
        _terrainMaterial = _lowAltitudeWorld.TerrainMaterial;
        if (F22UkraineLowAltitudeWorld.NativeQaCaptureEnabled) {
            _canopy.gameObject.SetActive(false);
            _lowAltitudeWorld.ConfigureFixedQaCamera(_cam);
        }

        Debug.Log("[GunsOnly] browser-parity cockpit-eye first-merge ready"
                  + " fov=" + _cam.fieldOfView
                  + " near=" + _cam.nearClipPlane
                  + " far=" + _cam.farClipPlane
                  + " exposure=" + F22UkraineVisualContract.ToneMappingExposure
                  + " theatre=ukraine-modern combatPresentation=1");
        Debug.Log("[GunsOnly] persistentDataPath=" + Application.persistentDataPath
                  + " resolution=" + Screen.width + "x" + Screen.height);
    }

    void Update() {
        if (!_dumpStarted && !QaPilot.Enabled && Time.unscaledTime > 2.0f) {
            // handled in LateUpdate once pose exists
        }

        if (!_host.HasPose) {
            _hud = "Waiting for GunsOnly.UnityHost on 127.0.0.1:18765…";
            _banditPresent = false;
            return;
        }

        var pose = _host.Latest;
        _player.position = pose.PlayerUnity;
        _playerFwd = pose.PlayerForwardUnity.sqrMagnitude > 1e-6f
            ? pose.PlayerForwardUnity.normalized
            : Vector3.forward;
        Vector3 right = Vector3.Cross(Vector3.up, _playerFwd).normalized;
        if (right.sqrMagnitude < 1e-6f) right = Vector3.right;
        _playerUp = Vector3.Cross(_playerFwd, right).normalized;
        _player.rotation = Quaternion.LookRotation(_playerFwd, _playerUp);

        _banditPresent = pose.OpponentPresent;
        if (pose.OpponentPresent) {
            _bandit.position = pose.BanditUnity;
            Vector3 banditFwd = pose.BanditForwardUnity.sqrMagnitude > 1e-6f
                ? pose.BanditForwardUnity.normalized
                : Vector3.forward;
            _bandit.rotation = Quaternion.LookRotation(banditFwd, Vector3.up);
            if (!_chaseMode) {
                _impostor.UpdateFor(_cam, _bandit, true);
            } else {
                _bandit.gameObject.SetActive(true);
                _impostor.UpdateFor(_cam, _bandit, false);
            }
            _sepM = Vector3.Distance(_player.position, _bandit.position);
        } else {
            _bandit.gameObject.SetActive(false);
            _impostor.UpdateFor(_cam, _bandit, false);
            _sepM = 0f;
        }

        float altM = (float)(pose.PlayerAltitudeFt * 0.3048);
        _altFt = pose.PlayerAltitudeFt;
        _hdgDeg = pose.PlayerHeadingDeg;
        _sky.Apply(altM, _cam);
        _lowAltitudeWorld.ApplyAltitude(altM);

        if (_chaseMode) {
            Vector3 chase = _player.position - _playerFwd * 28f + _playerUp * 10f + right * 16f;
            Vector3 lookAt = _player.position + _playerFwd * 5f + _playerUp * 1.5f;
            _cam.transform.position = Vector3.Lerp(
                _cam.transform.position, chase, 1f - Mathf.Exp(-7f * Time.deltaTime));
            _cam.transform.LookAt(lookAt, Vector3.up);
            _canopy.Sync(
                _cam.transform.position, _player.rotation, _cam.transform.rotation, false);
        } else {
            // Browser compatibility eye: player + up*0.6 + forward*4.0
            Vector3 eye = _player.position + _playerUp * 0.6f + _playerFwd * 4.0f;
            _cam.transform.position = eye;
            _cam.transform.rotation = Quaternion.LookRotation(_playerFwd, _playerUp);
            _canopy.Sync(eye, _player.rotation, _cam.transform.rotation, true);
        }

        // Explicit capture-only seam: a stable 90 m AGL world-art plate. It never changes the
        // simulation pose, controls, golden path, or ordinary first-merge camera.
        if (F22UkraineLowAltitudeWorld.NativeQaCaptureEnabled) {
            _lowAltitudeWorld.ConfigureFixedQaCamera(_cam);
        }

        if (_host.TriggerHeld) {
            SpawnTracerBurst(_player.position + _playerFwd * 5.5f, _playerFwd);
            _throttle01 = Mathf.Max(_throttle01, 0.7f);
        }
        _audio.Tick(_host.TriggerHeld, _throttle01);

        string mode = _chaseMode ? "CHASE" : "COCKPIT";
        _hud =
            $"F-22 first-merge [{mode}]   t={pose.SimulationTimeS:F1}s   tick={pose.Tick}\n" +
            $"alt {_altFt:F0} ft   hdg {_hdgDeg:F0}   sep {_sepM:F0} m\n" +
            $"{pose.Lifecycle}   opponent={(_banditPresent ? "yes" : "no")}   connected={_host.Connected}\n" +
            "Arrows pitch/roll   A/D yaw   W/S throttle   F guns   C chase";
    }

    void LateUpdate() {
        if (!_dumpStarted && _host.HasPose && Time.unscaledTime > 1.8f) {
            _dumpStarted = true;
            StartCoroutine(DumpFrameEndOfFrame(afterPose: true));
        }
    }

    void OnGUI() {
        if (F22UkraineLowAltitudeWorld.NativeQaCaptureEnabled) return;
        if (Event.current != null && Event.current.type == EventType.KeyDown
            && Event.current.keyCode == KeyCode.C) {
            _chaseMode = !_chaseMode;
            _player.gameObject.SetActive(_chaseMode);
            _canopy.gameObject.SetActive(!_chaseMode);
            _cam.fieldOfView = _chaseMode
                ? F22PresentationContract.ChaseVerticalFovDeg
                : F22PresentationContract.CockpitVerticalFovDeg;
            Debug.Log("[GunsOnly] camera mode=" + (_chaseMode ? "CHASE" : "COCKPIT"));
            Event.current.Use();
        }

        Vector3 banditScreen = Vector3.zero;
        if (_banditPresent && _cam != null) {
            Vector3 sp = _cam.WorldToScreenPoint(_bandit.position);
            banditScreen = new Vector3(sp.x, Screen.height - sp.y, sp.z);
        }

        var pose = _host.HasPose ? _host.Latest : default;
        FirstMergeGoldenPathCue? goldenPath = FirstMergeGoldenPath.Resolve(
            pose.Lifecycle,
            pose.OpponentPresent,
            pose.WeaponsHold,
            pose.PadlockSelected,
            pose.GunSolution,
            pose.PlayerHits,
            _host.TriggerHeld);
        BrowserParityHud.Draw(new BrowserParityHud.Snapshot {
            AltFt = _altFt,
            HdgDeg = _hdgDeg,
            IasKts = pose.IndicatedAirspeedKts,
            PitchDeg = pose.PitchDeg,
            BankDeg = pose.BankDeg,
            VsFpm = pose.VerticalSpeedFpm,
            Mach = pose.Mach,
            SepM = _sepM,
            BanditPresent = _banditPresent,
            BanditScreen = banditScreen,
            ChaseMode = _chaseMode,
            DebugLine = _chaseMode ? _hud : null,
            GoldenPathCue = goldenPath?.Text,
        });
    }

    void SpawnTracerBurst(Vector3 origin, Vector3 fwd) {
        if (Time.frameCount % 2 != 0) return;
        var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
        go.name = "Tracer";
        Object.Destroy(go.GetComponent<Collider>());
        go.transform.position = origin;
        go.transform.rotation = Quaternion.LookRotation(fwd, Vector3.up);
        go.transform.localScale = new Vector3(0.08f, 0.08f, 22f);
        var r = go.GetComponent<Renderer>();
        if (r != null) r.sharedMaterial = _tracerMat;
        Object.Destroy(go, 0.28f);
        StartCoroutine(AdvanceTracer(go.transform, fwd));
    }

    IEnumerator AdvanceTracer(Transform tr, Vector3 fwd) {
        float life = 0.28f;
        while (life > 0f && tr != null) {
            tr.position += fwd * 1100f * Time.deltaTime;
            life -= Time.deltaTime;
            yield return null;
        }
    }

    IEnumerator DumpFrameEndOfFrame(bool afterPose) {
        yield return new WaitForEndOfFrame();
        string abs = Path.Combine(Application.persistentDataPath, "guns-only-frame.png");
        try {
            int w = Screen.width;
            int h = Screen.height;
            var tex = new Texture2D(w, h, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, w, h), 0, 0, false);
            tex.Apply(false, false);
            byte[] png = tex.EncodeToPNG();
            Destroy(tex);
            File.WriteAllBytes(abs, png);
            File.WriteAllBytes("/tmp/guns-only-accept.png", png);
            if (F22UkraineLowAltitudeWorld.NativeQaCaptureEnabled) {
                File.WriteAllBytes("/tmp/guns-only-f22-low-altitude-90m.png", png);
            }
            Debug.Log("[GunsOnly] wrote acceptance frame → " + abs
                      + " " + w + "x" + h
                      + " afterPose=" + afterPose
                      + " bytes=" + png.Length);
        } catch (System.Exception ex) {
            Debug.LogError("[GunsOnly] frame dump failed: " + ex.Message);
        }
    }

    void BuildGround() {
        var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
        ground.name = "Ground";
        ground.transform.localScale = Vector3.one * 12000f;
        ground.transform.position = Vector3.zero;
        var r = ground.GetComponent<Renderer>();
        if (r != null) r.sharedMaterial = _groundMat;

        // Ridges readable from ~10k ft (browser streams Korea elevation; this is a stand-in).
        var rng = new System.Random(7);
        for (int i = 0; i < 64; i++) {
            float x = (float)(rng.NextDouble() * 80000 - 40000);
            float z = (float)(rng.NextDouble() * 80000 - 40000);
            float s = 400f + (float)rng.NextDouble() * 1400f;
            float h = 200f + (float)rng.NextDouble() * 900f;
            var hill = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            hill.name = "Hill";
            hill.transform.position = new Vector3(x, h * 0.25f, z);
            hill.transform.localScale = new Vector3(s, h, s * (0.6f + (float)rng.NextDouble() * 0.8f));
            Object.Destroy(hill.GetComponent<Collider>());
            var hr = hill.GetComponent<Renderer>();
            if (hr != null) hr.sharedMaterial = _hillMat;
        }

        for (int i = 0; i < 24; i++) {
            float x = (float)(rng.NextDouble() * 12000 - 6000);
            float z = (float)(rng.NextDouble() * 12000 - 6000);
            var patch = GameObject.CreatePrimitive(PrimitiveType.Cube);
            patch.name = "FieldPatch";
            patch.transform.position = new Vector3(x, 1.5f, z);
            patch.transform.localScale = new Vector3(
                200f + (float)rng.NextDouble() * 500f,
                3f,
                200f + (float)rng.NextDouble() * 500f);
            Object.Destroy(patch.GetComponent<Collider>());
            var pr = patch.GetComponent<Renderer>();
            if (pr != null) {
                float t = (float)rng.NextDouble();
                pr.sharedMaterial = MakeColor(Color.Lerp(
                    new Color(0.18f, 0.32f, 0.14f),
                    new Color(0.32f, 0.40f, 0.18f), t));
            }
        }

        var strip = GameObject.CreatePrimitive(PrimitiveType.Cube);
        strip.name = "NorthStrip";
        strip.transform.position = new Vector3(0f, 2f, -2500f);
        strip.transform.localScale = new Vector3(120f, 4f, 5000f);
        Object.Destroy(strip.GetComponent<Collider>());
        var sr = strip.GetComponent<Renderer>();
        if (sr != null) sr.sharedMaterial = _markMat;
    }

    void OnDestroy() {
        _sky?.Dispose();
        if (_terrainMaterial != null) Destroy(_terrainMaterial);
    }

    static Material MakeColor(Color c) {
        Shader shader =
            Shader.Find("Standard")
            ?? Shader.Find("Unlit/Color")
            ?? Shader.Find("Sprites/Default");
        var m = new Material(shader);
        if (m.HasProperty("_Color")) m.SetColor("_Color", c);
        if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", 0.05f);
        if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", 0.2f);
        m.color = c;
        return m;
    }

    static Material MakeUnlit(Color c) {
        Shader shader =
            Shader.Find("Unlit/Color")
            ?? Shader.Find("Sprites/Default")
            ?? Shader.Find("Standard");
        var m = new Material(shader);
        if (m.HasProperty("_Color")) m.SetColor("_Color", c);
        m.color = c;
        return m;
    }

    static Color ToColor(LinearRgb value) => new Color(value.R, value.G, value.B, 1f);
}

}
