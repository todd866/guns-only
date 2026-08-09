using System.Collections;
using System.IO;
using GunsOnly.UnityBridge;
using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Hold the Bridge / Cobra Canyon presentation: rear-seat AH-1G eye, Vietnam gorge terrain,
/// neon rotor HUD, ground-war markers. Chase (C) is debug only.
/// </summary>
public sealed class CobraCanyonBootstrap : MonoBehaviour {
    HostClient _host;
    Ah1gPresence _presence;
    Camera _cam;
    QaPilot _qa;
    Transform _unitsRoot;
    readonly System.Collections.Generic.List<Transform> _unitMarkers = new();
    bool _dumpStarted;
    bool _padlock;
    float _gimbalYawRad;
    float _gimbalPitchRad;
    int _selectedHostile = -1; // index into _units hostiles; -1 = use pose bandit sample
    Vector3 _playerFwd = Vector3.forward;
    Vector3 _playerUp = Vector3.up;
    HostClient.PoseFrame _pose;
    HostClient.UnitMarker[] _units = System.Array.Empty<HostClient.UnitMarker>();
    float _sepM;
    Vector3 _padlockTargetUnity;
    bool _padlockTargetValid;
    static Material _friendlyMat;
    static Material _hostileMat;
    static Material _tracerMat;
    static Material _selectedMat;
    static Material _muzzleMat;
    static Material _wreckMat;
    float _tracerCooldown;
    Transform _tipRing;
    MeshRenderer _tipRingMr;
    Transform _tipFlag;
    MeshRenderer _tipFlagMr;
    Light _muzzleLight;
    Transform _muzzleFlash;
    float _muzzleFlashT;
    Transform _selectionRing;
    Transform _rotorWash;
    MeshRenderer _rotorWashMr;
    CobraVisualContract _visualContract;
    bool _worldCapturePresentationSuppressed;
    bool _unitsRootWasActive;
    bool _tipRingWasActive;
    bool _tipFlagWasActive;
    bool _rotorWashWasActive;
    bool _muzzleFlashWasActive;
    bool _muzzleLightWasEnabled;
    readonly CobraGoldenPathTracker _goldenPath = new();

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSplashScreen)]
    static void BeforeSplash() {
        // Must be true before splash — PlayerSettings.runInBackground=0 used to freeze
        // unfocused launches on "Made with Unity" until the human clicked the window.
        Application.runInBackground = true;
    }

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void AutoBoot() {
        if (FindAnyObjectByType<CobraCanyonBootstrap>() != null) return;
        if (FindAnyObjectByType<FirstMergeBootstrap>() != null) return;
        if (FindAnyObjectByType<RapierBeat12Bootstrap>() != null) return;
        if (FindAnyObjectByType<WeekendRideBootstrap>() != null) return;
        UnityMissionKind mission;
        try {
            mission = UnityMissionSelection.FromCommandLine(System.Environment.GetCommandLineArgs());
        } catch (System.Exception ex) {
            Debug.LogError("[GunsOnly] Unity mission selection failed: " + ex.Message);
            return;
        }
        foreach (var cam in FindObjectsByType<Camera>(FindObjectsSortMode.None)) {
            if (cam != null) Destroy(cam.gameObject);
        }
        // Extension point for future Unity programs: add one explicit presentation case here.
        switch (mission) {
            case UnityMissionKind.Cobra: {
                var cobra = new GameObject("GunsOnlyCobraCanyon");
                cobra.AddComponent<CobraCanyonBootstrap>();
                break;
            }
            case UnityMissionKind.FirstMerge: {
                var firstMerge = new GameObject("GunsOnlyFirstMerge");
                firstMerge.AddComponent<FirstMergeBootstrap>();
                break;
            }
            case UnityMissionKind.Rapier: {
                var rapier = new GameObject("GunsOnlyRapierBeat12");
                rapier.AddComponent<RapierBeat12Bootstrap>();
                break;
            }
            case UnityMissionKind.WeekendRide: {
                var weekend = new GameObject("GunsOnlyWeekendRide");
                weekend.AddComponent<WeekendRideBootstrap>();
                break;
            }
            default:
                throw new System.ArgumentOutOfRangeException(nameof(mission), mission, null);
        }
    }

    void Awake() {
        Application.runInBackground = true;
        _visualContract = CobraVisualContract.LoadOrThrow();
        if (QualitySettings.activeColorSpace != ColorSpace.Linear) {
            throw new System.InvalidOperationException(
                "Cobra Build 299 parity requires Unity Linear color space.");
        }
        QualitySettings.vSyncCount = 0;
        // Ultra + long canyon shadows — this is the whole point of Unity vs the browser.
        QualitySettings.SetQualityLevel(QualitySettings.names.Length - 1, true);
        QualitySettings.shadowDistance = 4200f;
        QualitySettings.shadows = ShadowQuality.Disable;
        QualitySettings.shadowCascades = 2;
        QualitySettings.antiAliasing = 4;
        Screen.fullScreenMode = FullScreenMode.Windowed;
        Screen.SetResolution(1600, 1000, FullScreenMode.Windowed);

        // Browser cobra_ground_war.js: olive friendly / rust hostile — Unlit so 6 km markers survive.
        _friendlyMat = MakeUnlit(new Color(0x8f / 255f, 0xbf / 255f, 0x5a / 255f));
        _hostileMat = MakeUnlit(new Color(0xc4 / 255f, 0x5a / 255f, 0x45 / 255f));
        _tracerMat = MakeUnlit(new Color(1f, 0.85f, 0.35f));
        _selectedMat = MakeUnlit(new Color(1f, 0.84f, 0.42f));
        _muzzleMat = MakeUnlit(new Color(1f, 0.92f, 0.55f));
        _wreckMat = MakeUnlit(new Color(0x3a / 255f, 0x34 / 255f, 0x2c / 255f));

        _host = gameObject.AddComponent<HostClient>();
        _host.ConfigureMission(UnityMissionKind.Cobra);
        var keyboard = gameObject.AddComponent<KeyboardInput>();
        keyboard.ConfigureMission(UnityMissionKind.Cobra);
        if (QaPilot.Enabled) {
            _qa = gameObject.AddComponent<QaPilot>();
        }

        _presence = Ah1gPresence.Build(transform);

        var camGo = new GameObject("RearSeatCam");
        _cam = camGo.AddComponent<Camera>();
        var parityCamera = camGo.AddComponent<CobraParityCamera>();
        _cam.tag = "MainCamera";
        _cam.fieldOfView = _visualContract.AcceptanceProjection.VerticalFovDeg;
        _cam.nearClipPlane = _visualContract.AcceptanceProjection.NearClipM;
        _cam.farClipPlane = _visualContract.AcceptanceProjection.FarClipM;
        _cam.clearFlags = CameraClearFlags.SolidColor;
        _cam.backgroundColor = _visualContract.Lighting.FogColorLinear;
        _cam.allowMSAA = true;
        _cam.depthTextureMode = DepthTextureMode.Depth;
        parityCamera.Configure(_visualContract.AcceptanceProjection);

        if (FlightTelemetry.Enabled) {
            var tel = gameObject.AddComponent<FlightTelemetry>();
            tel.Configure(_host, _cam);
        }

        Cursor.visible = false;
        Cursor.lockState = CursorLockMode.Confined;

        // Web Build 299 one-sun doctrine. Unity directional rays follow transform.forward,
        // while the contract stores the inverse surface-to-sun direction.
        var lightGo = new GameObject("Sun");
        var light = lightGo.AddComponent<Light>();
        light.type = LightType.Directional;
        Vector3 surfaceToSun = _visualContract.Lighting.SunDirectionUnity;
        light.transform.rotation = Quaternion.LookRotation(-surfaceToSun, Vector3.up);
        light.intensity = _visualContract.Lighting.SunIntensity;
        light.color = _visualContract.Lighting.SunColorLinear;
        light.shadows = LightShadows.None;
        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
        RenderSettings.ambientSkyColor = _visualContract.Lighting.HemisphereSkyColorLinear
            * _visualContract.Lighting.HemisphereIntensity;
        RenderSettings.ambientEquatorColor = Color.Lerp(
            _visualContract.Lighting.HemisphereGroundColorLinear,
            _visualContract.Lighting.HemisphereSkyColorLinear,
            0.5f) * _visualContract.Lighting.HemisphereIntensity;
        RenderSettings.ambientGroundColor = _visualContract.Lighting.HemisphereGroundColorLinear
            * _visualContract.Lighting.HemisphereIntensity;
        RenderSettings.fog = true;
        RenderSettings.fogMode = FogMode.ExponentialSquared;
        RenderSettings.fogColor = _visualContract.Lighting.FogColorLinear;
        RenderSettings.fogDensity = _visualContract.Lighting.FogDensityPerM;
        RenderSettings.reflectionIntensity = 0.30f;

        // Defer heavy gorge mesh work one frame so the player leaves splash/load
        // immediately (sky + HUD) instead of blocking on basin/jungle bake.
        StartCoroutine(BuildWorldAfterFirstFrame());

        _unitsRoot = new GameObject("GroundUnits").transform;
        _unitsRoot.SetParent(transform, false);

        Debug.Log($"[GunsOnly] cobra-vietnam {_visualContract.ContractId} Web Build 299 parity ready");
        if (_qa != null) _qa.Configure(_host, _cam);
    }

    IEnumerator BuildWorldAfterFirstFrame() {
        yield return null;
        VietnamTerrainStandIn.Build(transform);
        AtmosphereExtras.Build(transform, _cam);
        BuildTipControlRing();
        BuildMuzzleFlash();
        BuildRotorWash();
        Debug.Log("[GunsOnly] mats lit-terrain+river+skin presence=ah1g shadows=off");
    }

    void Update() {
        if (_worldCapturePresentationSuppressed) return;
        if (Input.GetKeyDown(KeyCode.V)) {
            // Presentation-only attention: toggle padlock on the selected hostile.
            if (_padlock) {
                _padlock = false;
            } else if (TryResolvePadlockTarget(out _, out _)) {
                _padlock = true;
            }
        }
        if (!_host.HasPose) return;
        PullPose();
        SyncUnitMarkers();
        SyncTipControlRing();
        SyncMuzzleFlash();
        SyncRotorWash();

        // Tracers + flash only when the bridge actually fires — not while OUT OF LIMITS.
        bool firing = string.Equals(_pose.GunStatus, "firing", System.StringComparison.OrdinalIgnoreCase);
        _tracerCooldown = Mathf.Max(0f, _tracerCooldown - Time.deltaTime);
        if (firing && _tracerCooldown <= 0f) {
            SpawnTracer();
            PunchMuzzleFlash();
            _tracerCooldown = 0.045f; // ~22 Hz — readable burst, not a solid brick
        }
    }

    void PullPose() {
        _pose = _host.Latest;
        _units = _host.LatestUnits;
        _playerFwd = _pose.PlayerForwardUnity;
        if (_playerFwd.sqrMagnitude < 1e-6f) _playerFwd = Vector3.forward;

        // Full body attitude — waterline includes pitch AND roll. Do not gravity-level.
        Quaternion bodyRot = BodyRotationFromPose(_pose);
        _playerUp = bodyRot * Vector3.up;
        _presence.ApplyPose(_pose.PlayerUnity, bodyRot, (float)_pose.RotorRpm, Time.deltaTime);

        if (_pose.OpponentPresent) {
            _sepM = Vector3.Distance(_pose.PlayerUnity, _pose.BanditUnity);
        }
    }

    /// <summary>
    /// Waterline camera by default. V padlock slews a head gimbal toward the selected
    /// hostile (browser padlock_controller rates/limits) — still HUD-only, never chase.
    /// </summary>
    void ApplyPilotCamera(Vector3 eye, Quaternion bodyRot) {
        float dt = Time.deltaTime;
        const float yawLimit = 165f * Mathf.Deg2Rad;
        const float pitchLimit = 88f * Mathf.Deg2Rad;
        const float trackYawRate = 240f * Mathf.Deg2Rad;
        const float trackPitchRate = 180f * Mathf.Deg2Rad;
        const float returnYawRate = 540f * Mathf.Deg2Rad;
        const float returnPitchRate = 420f * Mathf.Deg2Rad;

        float desiredYaw = 0f;
        bool tracking = _padlock && TryResolvePadlockTarget(out _padlockTargetUnity, out _sepM);
        // cobra-lab syncAuthorityCamera: bodyPitch + 0.08 look bias when forward.
        float desiredPitch = tracking ? 0f : 0.08f;
        _padlockTargetValid = tracking;
        if (!tracking) _padlock = false;

        if (tracking) {
            Vector3 local = Quaternion.Inverse(bodyRot) * (_padlockTargetUnity - eye);
            float horiz = Mathf.Sqrt(local.x * local.x + local.z * local.z);
            float targetYaw = horiz < 0.02f ? _gimbalYawRad : Mathf.Atan2(local.x, local.z);
            // Keep nearest shoulder vs current gimbal (avoid ±180 whip).
            targetYaw = _gimbalYawRad + Mathf.DeltaAngle(
                _gimbalYawRad * Mathf.Rad2Deg, targetYaw * Mathf.Rad2Deg) * Mathf.Deg2Rad;
            float targetPitch = Mathf.Atan2(local.y, Mathf.Max(0.02f, horiz));
            // Leave a residual so nose-to-target geometry still reads (browser desiredPadlockAngles).
            float aspect = _cam != null && _cam.pixelHeight > 0
                ? _cam.pixelWidth / (float)_cam.pixelHeight : 16f / 9f;
            float halfV = (_cam != null ? _cam.fieldOfView : 58f) * 0.5f * Mathf.Deg2Rad;
            float halfH = Mathf.Atan(Mathf.Tan(halfV) * aspect);
            float protYaw = Mathf.Clamp(halfH * 0.55f, 8f * Mathf.Deg2Rad, 30f * Mathf.Deg2Rad);
            float protPitch = Mathf.Clamp(halfV * 0.48f, 7f * Mathf.Deg2Rad, 17f * Mathf.Deg2Rad);
            float yawResidual = Mathf.Clamp(targetYaw * 0.20f, -protYaw, protYaw);
            float pitchResidual = Mathf.Clamp(targetPitch * 0.20f, -protPitch, protPitch);
            desiredYaw = Mathf.Clamp(targetYaw - yawResidual, -yawLimit, yawLimit);
            desiredPitch = Mathf.Clamp(targetPitch - pitchResidual, -pitchLimit, pitchLimit);
        }

        float yawRate = tracking ? trackYawRate : returnYawRate;
        float pitchRate = tracking ? trackPitchRate : returnPitchRate;
        float gain = tracking ? 12f : 24f;
        _gimbalYawRad = MoveBounded(_gimbalYawRad, desiredYaw, dt, gain, yawRate);
        _gimbalPitchRad = MoveBounded(_gimbalPitchRad, desiredPitch, dt, gain, pitchRate);
        if (!tracking && Mathf.Abs(_gimbalYawRad) < 1e-4f) _gimbalYawRad = 0f;
        // Settle onto the lab +0.08 forward bias, not absolute zero.
        if (!tracking && Mathf.Abs(_gimbalPitchRad - 0.08f) < 1e-4f) _gimbalPitchRad = 0.08f;

        // Body attitude × head gimbal (yaw about body up, pitch about body right).
        Quaternion gimbal = Quaternion.Euler(
            -_gimbalPitchRad * Mathf.Rad2Deg,
            _gimbalYawRad * Mathf.Rad2Deg,
            0f);
        _cam.transform.position = eye;
        _cam.transform.rotation = bodyRot * gimbal;
    }

    static float MoveBounded(float current, float desired, float dt, float gain, float maxRate) {
        dt = Mathf.Clamp(dt, 0f, 0.25f);
        if (dt <= 0f) return current;
        float error = desired - current;
        float expo = error * (1f - Mathf.Exp(-Mathf.Max(0f, gain) * dt));
        float step = Mathf.Clamp(expo, -maxRate * dt, maxRate * dt);
        return current + step;
    }

    bool TryResolvePadlockTarget(out Vector3 unityPos, out float sepM) {
        unityPos = default;
        sepM = 0f;
        if (!_pose.CobraTargetSelected) return false;
        if (_selectedHostile >= 0 && _selectedHostile < _units.Length
            && _units[_selectedHostile].Faction != 0) {
            var u = _units[_selectedHostile];
            unityPos = HostClient.SimToUnityPublic(u.X, u.Y, u.Z);
            sepM = Vector3.Distance(_pose.PlayerUnity, unityPos);
            return true;
        }
        if (_pose.OpponentPresent) {
            unityPos = _pose.BanditUnity;
            sepM = Vector3.Distance(_pose.PlayerUnity, unityPos);
            return true;
        }
        // A designated target can survive one sparse-marker frame while the next authority
        // sample arrives. This fallback is never reachable before Tab/V because of the gate above.
        for (int i = 0; i < _units.Length; i++) {
            if (_units[i].Faction == 0) continue;
            unityPos = HostClient.SimToUnityPublic(_units[i].X, _units[i].Y, _units[i].Z);
            sepM = Vector3.Distance(_pose.PlayerUnity, unityPos);
            _selectedHostile = i;
            return true;
        }
        return false;
    }

    void CycleSelectedHostile() {
        if (_units.Length == 0) return;
        int start = _selectedHostile < 0 ? -1 : _selectedHostile;
        for (int step = 1; step <= _units.Length; step++) {
            int i = (start + step) % _units.Length;
            if (_units[i].Faction == 0) continue;
            _selectedHostile = i;
            return;
        }
    }

    static Quaternion BodyRotationFromPose(HostClient.PoseFrame pose) {
        Vector3 fwd = pose.PlayerForwardUnity;
        if (fwd.sqrMagnitude < 1e-6f) fwd = Vector3.forward;
        Quaternion leveled = Quaternion.LookRotation(fwd, Vector3.up);
        return leveled * Quaternion.Euler(0f, 0f, -(float)pose.BankDeg);
    }

    void LateUpdate() {
        // QaPilot temporarily owns the live camera for deterministic contract captures.
        if (QaPilot.WorldCaptureActive) return;
        if (!_host.HasPose || _cam == null) return;
        PullPose();

        Vector3 eye = _presence.EyeWorld();
        _presence.SetExteriorVisible(false); // HUD-only — never chase exterior
        Quaternion bodyRot = BodyRotationFromPose(_pose);
        _playerUp = bodyRot * Vector3.up;
        ApplyPilotCamera(eye, bodyRot);

        _cam.backgroundColor = _visualContract.Lighting.FogColorLinear;

        if (!QaPilot.Enabled && !_dumpStarted && Time.unscaledTime > 2.2f
            && _pose.PlayerAltitudeFt > 50.0 && _pose.RotorRpm > 50.0) {
            _dumpStarted = true;
            StartCoroutine(DumpFrameEndOfFrame());
        }
    }

    IEnumerator DumpFrameEndOfFrame() {
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
            Debug.Log("[GunsOnly] wrote acceptance frame → " + abs
                      + " " + w + "x" + h
                      + " afterPose=True"
                      + " bytes=" + png.Length);
        } catch (System.Exception ex) {
            Debug.LogError("[GunsOnly] frame dump failed: " + ex.Message);
        }
    }

    void OnGUI() {
        if (QaPilot.WorldCaptureActive) return;
        if (!_host.HasPose) {
            GUI.color = Color.white;
            GUI.Label(new Rect(20, 20, 600, 40),
                "Waiting for GunsOnly.UnityHost (cobra-vietnam) on 127.0.0.1:18765…");
            return;
        }

        PullPose();

        Vector3 targetScreen = Vector3.zero;
        bool targetPresent = TryResolvePadlockTarget(out Vector3 tgt, out float sep);
        if (targetPresent && _cam != null) {
            _sepM = sep;
            Vector3 sp = _cam.WorldToScreenPoint(tgt);
            // Behind-camera contacts still need an edge cue — keep z sign for HUD.
            targetScreen = new Vector3(sp.x, Screen.height - sp.y, sp.z);
        }

        CobraGoldenPathCue? goldenPath = _goldenPath.Advance(new CobraGoldenPathState(
            _pose.Lifecycle,
            _pose.Collective01,
            _pose.CobraTargetSelected,
            _pose.GunStatus,
            _pose.VictoryHoldProgress));

        CobraRotorHud.Draw(new CobraRotorHud.Snapshot {
            AltFt = _pose.PlayerAltitudeFt,
            HdgDeg = _pose.PlayerHeadingDeg,
            IasKts = _pose.IndicatedAirspeedKts,
            PitchDeg = _pose.PitchDeg,
            BankDeg = _pose.BankDeg,
            VsFpm = _pose.VerticalSpeedFpm,
            RotorRpm = _pose.RotorRpm,
            Collective01 = _pose.Collective01,
            ControlBalance = _pose.ControlBalance,
            AmmoRounds = _pose.AmmoRounds,
            ClearanceM = _pose.ClearanceM,
            FobRangeM = _pose.FobRangeM,
            TorqueNm = _pose.TorqueNm,
            TorqueLimitFraction = _pose.TorqueLimitFraction,
            VictoryHoldProgress = _pose.VictoryHoldProgress,
            HostileKills = _pose.HostileKills,
            TargetPresent = targetPresent,
            TargetScreen = targetScreen,
            TargetSepM = _sepM,
            Lifecycle = _pose.Lifecycle,
            GunStatus = _pose.GunStatus,
            TargetSelected = _pose.CobraTargetSelected,
            CameraFovDeg = _cam != null ? _cam.fieldOfView : 58f,
            Padlock = _padlock,
            GoldenPathCue = goldenPath?.Text,
            DebugLine = QaPilot.Enabled
                ? $"cobra t={_pose.SimulationTimeS:F1}s tick={_pose.Tick} " +
                  $"ammo={_pose.AmmoRounds} ctl={_pose.ControlBalance:F2} " +
                  $"gun={_pose.GunStatus} nr={_pose.RotorRpm:F0} ralt={_pose.ClearanceM:F0}m"
                : null,
        });
    }

    void SyncUnitMarkers() {
        // Match browser cobra_ground_war.js: lit role-scaled boxes (olive/rust), gold
        // selection ring — not neon telephone-pole IFF pins.
        while (_unitMarkers.Count < _units.Length) {
            var root = new GameObject("Unit").transform;
            root.SetParent(_unitsRoot, false);

            var body = GameObject.CreatePrimitive(PrimitiveType.Cube);
            body.name = "Body";
            body.transform.SetParent(root, false);
            Object.Destroy(body.GetComponent<Collider>());
            body.transform.localPosition = new Vector3(0f, 0.5f, 0f);
            body.transform.localScale = Vector3.one;
            var tint = new Material(_friendlyMat) { name = "UnitTint" };
            body.GetComponent<MeshRenderer>().sharedMaterial = tint;
            body.GetComponent<MeshRenderer>().shadowCastingMode =
                UnityEngine.Rendering.ShadowCastingMode.Off;

            _unitMarkers.Add(root);
        }

        if (_selectionRing == null) {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            go.name = "SelectionRing";
            Object.Destroy(go.GetComponent<Collider>());
            _selectionRing = go.transform;
            _selectionRing.SetParent(_unitsRoot, false);
            _selectionRing.localScale = new Vector3(22f, 0.35f, 22f);
            var mr = go.GetComponent<MeshRenderer>();
            mr.sharedMaterial = new Material(_selectedMat) { name = "SelectRingMat",
                color = new Color(1f, 0.84f, 0.42f, 0.72f) };
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            go.SetActive(false);
        }

        // The host owns designation. Before Tab/V there is deliberately no gold ring; after
        // designation, bind the ring to the
        // authoritative bandit sample rather than maintaining a second Unity-only target index.
        if (!_pose.CobraTargetSelected) {
            _selectedHostile = -1;
        } else {
            int selected = -1;
            float bestSel = float.MaxValue;
            if (_pose.OpponentPresent) {
                Vector3 bandit = _pose.BanditUnity;
                for (int i = 0; i < _units.Length; i++) {
                    if (_units[i].Faction == 0) continue;
                    Vector3 p = HostClient.SimToUnityPublic(_units[i].X, _units[i].Y, _units[i].Z);
                    float d = (p - bandit).sqrMagnitude;
                    if (d >= bestSel) continue;
                    bestSel = d;
                    selected = i;
                }
                if (bestSel > 80f * 80f) selected = -1;
            }
            _selectedHostile = selected;
        }
        int selectedIdx = _selectedHostile;

        for (int i = 0; i < _unitMarkers.Count; i++) {
            if (i >= _units.Length) {
                _unitMarkers[i].gameObject.SetActive(false);
                continue;
            }
            var u = _units[i];
            var t = _unitMarkers[i];
            t.gameObject.SetActive(true);
            // Role scales mirror browser roleScale(): soft-vehicle / hard-point / infantry.
            Vector3 size = u.Role == 1 ? new Vector3(7.2f, 3.2f, 3.4f)
                : u.Role == 2 ? new Vector3(4.4f, 5.5f, 4.4f)
                : new Vector3(3.2f, 2.4f, 3.2f);
            t.position = HostClient.SimToUnityPublic(u.X, u.Y, u.Z);
            var body = t.Find("Body");
            if (body != null) {
                body.localScale = size;
                body.localPosition = new Vector3(0f, size.y * 0.5f, 0f);
                float health = Mathf.Clamp01(u.Health01);
                Color baseCol = health < 0.05f
                    ? _wreckMat.color
                    : (u.Faction == 0 ? _friendlyMat : _hostileMat).color;
                if (i == selectedIdx) baseCol = Color.Lerp(baseCol, _selectedMat.color, 0.35f);
                baseCol *= Mathf.Lerp(0.45f, 1f, Mathf.Max(0.05f, health));
                baseCol.a = 1f;
                var mr = body.GetComponent<MeshRenderer>();
                if (mr != null && mr.sharedMaterial != null) mr.sharedMaterial.color = baseCol;
            }
        }

        if (_selectionRing != null) {
            bool show = selectedIdx >= 0 && selectedIdx < _units.Length;
            _selectionRing.gameObject.SetActive(show);
            if (show) {
                var u = _units[selectedIdx];
                Vector3 p = HostClient.SimToUnityPublic(u.X, u.Y, u.Z);
                _selectionRing.position = p + Vector3.up * 0.4f;
                float pulse = 1f + 0.06f * Mathf.Sin(Time.unscaledTime * 6f);
                _selectionRing.localScale = new Vector3(22f * pulse, 0.35f, 22f * pulse);
            }
        }
    }

    void BuildTipControlRing() {
        // Match cobra_ground_war.js ensureSite: CylinderGeometry(18,18,1.2) pad + 14 m flag.
        VietnamTerrainStandIn.SamplePublic(-2710f, -500f, out float tipGround, out _);
        // UnityOf(east,alt,north) → (east, alt, -north); tip north=-500 → Unity Z=+500.
        Vector3 tip = new(-2710f, tipGround + 1.2f, 500f);

        var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        go.name = "TipControlRing";
        Object.Destroy(go.GetComponent<Collider>());
        _tipRing = go.transform;
        _tipRing.SetParent(transform, false);
        _tipRing.position = tip;
        _tipRingMr = go.GetComponent<MeshRenderer>();
        var mat = new Material(Shader.Find("Unlit/Color") ?? Shader.Find("Sprites/Default"));
        mat.color = new Color(0.92f, 0.78f, 0.42f);
        _tipRingMr.sharedMaterial = mat;
        _tipRingMr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        _tipRingMr.receiveShadows = false;
        // Unity cylinder default height 2 → scale.y 0.6 → 1.2 m; radius 0.5 → scale.xz 36 → Ø36 m.
        _tipRing.localScale = new Vector3(36f, 0.6f, 36f);

        var flagGo = GameObject.CreatePrimitive(PrimitiveType.Cube);
        flagGo.name = "TipControlFlag";
        Object.Destroy(flagGo.GetComponent<Collider>());
        _tipFlag = flagGo.transform;
        _tipFlag.SetParent(transform, false);
        _tipFlag.position = tip + new Vector3(0f, 8f, 0f);
        _tipFlag.localScale = new Vector3(1.2f, 14f, 1.2f);
        _tipFlagMr = flagGo.GetComponent<MeshRenderer>();
        _tipFlagMr.sharedMaterial = new Material(mat);
        _tipFlagMr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        _tipFlagMr.receiveShadows = false;
    }

    void SyncTipControlRing() {
        if (_tipRingMr == null || _tipRingMr.sharedMaterial == null) return;
        float control = Mathf.Clamp((float)_pose.ControlBalance, -1f, 1f);
        // Browser siteControlColor: olive / sand / rust — not neon cyan/red.
        Color c = control >= 0f
            ? Color.Lerp(new Color(0.92f, 0.78f, 0.42f), new Color(0.56f, 0.75f, 0.35f), control)
            : Color.Lerp(new Color(0.92f, 0.78f, 0.42f), new Color(0.77f, 0.35f, 0.27f), -control);
        float pulse = 1f + 0.06f * Mathf.Sin(Time.unscaledTime * (2.2f + Mathf.Abs(control) * 4f));
        c.a = 0.65f + 0.30f * Mathf.Abs(control);
        _tipRingMr.sharedMaterial.color = c;
        if (_tipFlagMr != null && _tipFlagMr.sharedMaterial != null)
            _tipFlagMr.sharedMaterial.color = c;
        float r = 36f * (0.90f + 0.20f * Mathf.Abs(control)) * pulse;
        _tipRing.localScale = new Vector3(r, 0.6f, r);
    }

    void BuildRotorWash() {
        // Soft dust disc under the skids — IGE hover cue. Fades with height and forward speed
        // (ETL kills the wash), so it never paints a permanent brown pancake under cruise.
        var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        go.name = "RotorWash";
        Object.Destroy(go.GetComponent<Collider>());
        _rotorWash = go.transform;
        _rotorWash.SetParent(transform, false);
        _rotorWash.localScale = new Vector3(18f, 0.08f, 18f);
        _rotorWashMr = go.GetComponent<MeshRenderer>();
        var mat = new Material(Shader.Find("Sprites/Default") ?? Shader.Find("Unlit/Color"));
        mat.color = new Color(0.55f, 0.48f, 0.34f, 0.0f);
        _rotorWashMr.sharedMaterial = mat;
        _rotorWashMr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        _rotorWashMr.receiveShadows = false;
        go.SetActive(false);
    }

    void SyncRotorWash() {
        if (_rotorWash == null || _rotorWashMr == null) return;
        float raltM = (float)_pose.ClearanceM;
        float iasKts = Mathf.Abs((float)_pose.IndicatedAirspeedKts);
        float nr = (float)_pose.RotorRpm;
        // Visible below ~40 m AGL, rotor spinning, and slower than ~35 kt.
        float height01 = 1f - Mathf.Clamp01(raltM / 40f);
        float speed01 = 1f - Mathf.Clamp01(iasKts / 35f);
        float nr01 = Mathf.Clamp01((nr - 180f) / 120f);
        float strength = height01 * speed01 * nr01;
        bool on = strength > 0.04f;
        if (_rotorWash.gameObject.activeSelf != on) _rotorWash.gameObject.SetActive(on);
        if (!on) return;

        Vector3 pos = _pose.PlayerUnity;
        // Sit just above the sampled surface (clearance is hub-ish; bias toward skids).
        pos.y -= Mathf.Max(0.5f, raltM - 0.4f);
        _rotorWash.position = pos;
        float pulse = 1f + 0.04f * Mathf.Sin(Time.unscaledTime * (9f + nr * 0.02f));
        float radius = Mathf.Lerp(10f, 28f, strength) * pulse;
        _rotorWash.localScale = new Vector3(radius, 0.08f, radius);
        var c = new Color(0.55f, 0.48f, 0.34f, 0.12f + 0.38f * strength);
        _rotorWashMr.sharedMaterial.color = c;
    }

    void BuildMuzzleFlash() {
        var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        go.name = "MuzzleFlash";
        Object.Destroy(go.GetComponent<Collider>());
        _muzzleFlash = go.transform;
        _muzzleFlash.SetParent(transform, false);
        _muzzleFlash.localScale = Vector3.one * 0.55f;
        var mr = go.GetComponent<MeshRenderer>();
        mr.sharedMaterial = _muzzleMat;
        mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        go.SetActive(false);

        var lightGo = new GameObject("MuzzleLight");
        lightGo.transform.SetParent(transform, false);
        _muzzleLight = lightGo.AddComponent<Light>();
        _muzzleLight.type = LightType.Point;
        _muzzleLight.range = 28f;
        _muzzleLight.intensity = 0f;
        _muzzleLight.color = new Color(1f, 0.85f, 0.45f);
        _muzzleLight.shadows = LightShadows.None;
    }

    void PunchMuzzleFlash() {
        _muzzleFlashT = 0.055f;
    }

    void SyncMuzzleFlash() {
        if (_muzzleFlash == null || _cam == null) return;
        _muzzleFlashT = Mathf.Max(0f, _muzzleFlashT - Time.deltaTime);
        bool on = _muzzleFlashT > 0f;
        if (_muzzleFlash.gameObject.activeSelf != on) _muzzleFlash.gameObject.SetActive(on);
        if (!on) {
            if (_muzzleLight != null) _muzzleLight.intensity = 0f;
            return;
        }
        // Chin turret approx — slightly below/forward of rear-seat eye.
        Vector3 origin = _cam.transform.position
            + _cam.transform.forward * 2.4f
            + _cam.transform.up * -0.85f
            + _cam.transform.right * 0.12f;
        _muzzleFlash.position = origin;
        float t = _muzzleFlashT / 0.055f;
        float scale = Mathf.Lerp(0.15f, 0.85f, t);
        _muzzleFlash.localScale = Vector3.one * scale;
        if (_muzzleLight != null) {
            _muzzleLight.transform.position = origin;
            _muzzleLight.intensity = 6.5f * t;
        }
    }

    void SpawnTracer() {
        if (_cam == null) return;
        var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
        go.name = "Tracer";
        go.transform.SetParent(_unitsRoot, true);
        Object.Destroy(go.GetComponent<Collider>());
        go.GetComponent<MeshRenderer>().sharedMaterial = _tracerMat;
        Vector3 origin = _cam.transform.position + _cam.transform.forward * 1.5f + _cam.transform.right * 0.35f;
        Vector3 aim = _pose.OpponentPresent
            ? (_pose.BanditUnity - origin).normalized
            : _cam.transform.forward;
        go.transform.position = origin + aim * 22f;
        go.transform.rotation = Quaternion.LookRotation(aim, _cam.transform.up);
        go.transform.localScale = new Vector3(0.06f, 0.06f, 28f);
        Destroy(go, 0.18f);
    }

    /// <summary>
    /// Web's parked acceptance views remove the dynamic ground-war layer. QaPilot uses this
    /// reversible switch so fixed Unity plates contain the same authored scene and no live
    /// units, control cue, rotor wash, muzzle flash, or tracer effects.
    /// </summary>
    public void SetWorldCapturePresentationSuppressed(bool suppressed) {
        if (suppressed == _worldCapturePresentationSuppressed) return;
        _worldCapturePresentationSuppressed = suppressed;
        if (suppressed) {
            _unitsRootWasActive = _unitsRoot != null && _unitsRoot.gameObject.activeSelf;
            _tipRingWasActive = _tipRing != null && _tipRing.gameObject.activeSelf;
            _tipFlagWasActive = _tipFlag != null && _tipFlag.gameObject.activeSelf;
            _rotorWashWasActive = _rotorWash != null && _rotorWash.gameObject.activeSelf;
            _muzzleFlashWasActive = _muzzleFlash != null && _muzzleFlash.gameObject.activeSelf;
            _muzzleLightWasEnabled = _muzzleLight != null && _muzzleLight.enabled;
            if (_unitsRoot != null) _unitsRoot.gameObject.SetActive(false);
            if (_tipRing != null) _tipRing.gameObject.SetActive(false);
            if (_tipFlag != null) _tipFlag.gameObject.SetActive(false);
            if (_rotorWash != null) _rotorWash.gameObject.SetActive(false);
            if (_muzzleFlash != null) _muzzleFlash.gameObject.SetActive(false);
            if (_muzzleLight != null) _muzzleLight.enabled = false;
            return;
        }

        if (_unitsRoot != null) _unitsRoot.gameObject.SetActive(_unitsRootWasActive);
        if (_tipRing != null) _tipRing.gameObject.SetActive(_tipRingWasActive);
        if (_tipFlag != null) _tipFlag.gameObject.SetActive(_tipFlagWasActive);
        if (_rotorWash != null) _rotorWash.gameObject.SetActive(_rotorWashWasActive);
        if (_muzzleFlash != null) _muzzleFlash.gameObject.SetActive(_muzzleFlashWasActive);
        if (_muzzleLight != null) _muzzleLight.enabled = _muzzleLightWasEnabled;
    }

    void SetPresenceVisible(bool visible) {
        if (_presence == null) return;
        foreach (var r in _presence.GetComponentsInChildren<Renderer>()) {
            r.enabled = visible;
        }
    }

    static Material MakeUnlit(Color c) {
        var sh = Shader.Find("Unlit/Color") ?? Shader.Find("Standard");
        return new Material(sh) { color = c };
    }
}

}
