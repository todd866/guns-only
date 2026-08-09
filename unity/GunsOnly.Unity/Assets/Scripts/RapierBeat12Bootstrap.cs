using System;
using GunsOnly.UnityBridge;
using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Reachability seam for the player-facing Rapier beat. Simulation remains in UnityHost; this
/// component only applies wire poses to the exact staged tableau and its opaque sensor camera.
/// </summary>
public sealed class RapierBeat12Bootstrap : MonoBehaviour {
    HostClient _host;
    Transform _platformPoseRoot;
    Transform _vehicleRoot;
    Transform _sky;
    Light _sun;
    Camera _camera;
    RapierLaunchTableau _tableau;
    bool _hasAuthoritativePlatformPose;

    void Awake() {
        Application.runInBackground = true;
        if (QualitySettings.activeColorSpace != ColorSpace.Linear) {
            throw new InvalidOperationException(
                "Rapier Build 299 parity requires Unity Linear color space.");
        }

        QualitySettings.vSyncCount = 0;
        QualitySettings.SetQualityLevel(QualitySettings.names.Length - 1, true);
        QualitySettings.shadowDistance = 4200f;

        _platformPoseRoot = new GameObject("RAPIER_RECOVERY_PLATFORM_POSE").transform;
        _platformPoseRoot.SetParent(transform, false);
        _tableau = RapierLaunchTableauBuilder.Build(_platformPoseRoot);
        // The export reflects mesh-local Z. Platform placement therefore includes one compensating
        // local reflection; keep world atmosphere/light outside that platform transform exactly as
        // they are in Web's scene graph.
        _sky = _tableau.Sky;
        _sun = _tableau.Sun;
        _sky.SetParent(transform, true);
        _sun.transform.SetParent(transform, true);
        // Do not flash the strip at an invented origin while waiting for host authority.
        _tableau.Root.gameObject.SetActive(false);

        _vehicleRoot = new GameObject("RAPIER_OPAQUE_SENSOR_VEHICLE").transform;
        _vehicleRoot.SetParent(transform, false);

        var cameraObject = new GameObject("RapierSensorCamera");
        _camera = cameraObject.AddComponent<Camera>();
        _camera.tag = "MainCamera";
        _tableau.BindSensorCamera(_camera, _vehicleRoot);

        _host = gameObject.AddComponent<HostClient>();
        _host.ConfigureMission(UnityMissionKind.Rapier);
        KeyboardInput keyboard = gameObject.AddComponent<KeyboardInput>();
        keyboard.ConfigureMission(UnityMissionKind.Rapier);

        Debug.Log("[GunsOnly] Rapier beat 12 opaque-sensor tableau awaiting host pose");
    }

    void Update() {
        if (_host == null || !_host.HasPose) return;

        HostClient.PoseFrame pose = _host.Latest;
        if (pose.RecoveryPlatformPresent) {
            ApplyPlatformPose(pose);
            if (!_hasAuthoritativePlatformPose) {
                _hasAuthoritativePlatformPose = true;
                _tableau.Root.gameObject.SetActive(true);
            }
        }

        _vehicleRoot.position = pose.PlayerUnity;
        Vector3 forward = pose.PlayerForwardUnity;
        Vector3 left = pose.PlayerLeftUnity;
        if (forward.sqrMagnitude < 1e-8f) forward = Vector3.forward;
        if (left.sqrMagnitude < 1e-8f) left = Vector3.left;
        forward.Normalize();
        left.Normalize();
        // ENU→Unity reflects Z, reversing handedness. For transmitted true body-left the correct
        // Unity up is therefore forward × left; this retains authoritative pitch and bank.
        Vector3 up = Vector3.Cross(forward, left);
        if (up.sqrMagnitude < 1e-8f) up = Vector3.up;
        else up.Normalize();
        _vehicleRoot.rotation = Quaternion.LookRotation(forward, up);

        _tableau.SetLaunchState(
            pose.CatapultActive,
            (float)pose.CatapultProgress,
            Time.unscaledDeltaTime);
        _tableau.SynchronizeView(_camera, (float)(pose.PlayerAltitudeFt * 0.3048));
    }

    void ApplyPlatformPose(HostClient.PoseFrame pose) {
        _platformPoseRoot.position = pose.RecoveryPlatformUnity;
        // Exported geometry has already crossed the Web→Unity handedness boundary. The Web
        // platform root is still an improper reflected frame: +X remains cross-strip while local
        // +Z (the reflected launch axis) must become Web's local -Z before applying platform yaw.
        _platformPoseRoot.localScale = new Vector3(1f, 1f, -1f);
        Quaternion yaw = Quaternion.AngleAxis(
            (float)(-pose.RecoveryPlatformHeadingRad * Mathf.Rad2Deg),
            Vector3.up);
        Quaternion pitch = Quaternion.AngleAxis(
            (float)pose.RecoveryPlatformPitchDeg,
            Vector3.right);
        _platformPoseRoot.rotation = yaw * pitch;
    }

    void OnGUI() {
        if (_host == null || !_host.HasPose) return;
        HostClient.PoseFrame pose = _host.Latest;
        RapierGoldenPathCue? cue = RapierGoldenPath.Resolve(
            pose.RapierPhaseCode,
            pose.RapierAutomationEnabled,
            pose.RapierAutomationActive,
            pose.RapierCircuitLeg,
            pose.RapierRecoveryGate,
            pose.RapierJobToken,
            pose.RapierDronesRemaining,
            _host.TriggerHeld);
        RapierSensorHud.Draw(cue);
    }

    void OnDestroy() {
        if (_sky != null) Destroy(_sky.gameObject);
        if (_sun != null) Destroy(_sun.gameObject);
        _tableau?.Dispose();
        if (_camera != null) Destroy(_camera.gameObject);
    }
}

}
