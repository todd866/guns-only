using GunsOnly.UnityBridge;
using UnityEngine;
using UnityEngine.Rendering;

namespace GunsOnly.UnityClient {

/// <summary>
/// Weekend Ride's native presentation entry point. It consumes host-authored pose/context and
/// the one-time v1 route, attaches the exported R1 near-field rig, and never advances physics.
/// </summary>
public sealed class WeekendRideBootstrap : MonoBehaviour {
    const float EyeHeightM = 1.55f;

    HostClient _host;
    Camera _camera;
    WeekendR1FirstPersonRig _r1;
    WeekendRideCircuitRenderer _circuit;
    WeekendHinterlandRoadRenderer _openRoad;
    WeekendCircuitPresentationFrame _presentation;
    HostClient.PoseFrame _pose;

    void Awake() {
        Application.runInBackground = true;
        if (QualitySettings.activeColorSpace != ColorSpace.Linear) {
            throw new System.InvalidOperationException(
                "Weekend Ride Web parity requires Unity Linear color space.");
        }
        QualitySettings.vSyncCount = 0;
        QualitySettings.antiAliasing = 4;
        QualitySettings.shadows = ShadowQuality.Disable;
        QualitySettings.shadowDistance = 2500f;
        _presentation = WeekendCircuitPresentationResource.Load();

        _host = gameObject.AddComponent<HostClient>();
        _host.ConfigureMission(UnityMissionKind.WeekendRide);
        WeekendRideGoldenPathHud.Attach(gameObject, _host);
        WeekendRideInput input = gameObject.AddComponent<WeekendRideInput>();
        input.Configure(_host);

        var cameraObject = new GameObject("WeekendHelmetCamera");
        _camera = cameraObject.AddComponent<Camera>();
        _camera.tag = "MainCamera";
        _camera.fieldOfView = (float)_presentation.render_profile.camera.vertical_fov_deg;
        _camera.nearClipPlane = (float)_presentation.render_profile.camera.near_m;
        _camera.farClipPlane = (float)_presentation.render_profile.camera.far_m;
        _camera.clearFlags = CameraClearFlags.SolidColor;
        _camera.backgroundColor = WeekendCircuitPresentationResource.LinearSrgbHex(
            _presentation.render_profile.background_srgb_hex);
        _camera.allowHDR = true;
        _camera.allowMSAA = true;
        WeekendParityCamera.Attach(_camera);
        WeekendOutputTransform output = cameraObject.AddComponent<WeekendOutputTransform>();
        output.Configure(_presentation.render_profile);
        _r1 = WeekendR1FirstPersonRig.AttachTo(_camera.transform);

        ConfigureWorldLight(_presentation.render_profile);
        Cursor.visible = false;
        Cursor.lockState = CursorLockMode.Confined;
        Debug.Log("[GunsOnly] weekend-ride native authority + R1 first-person rig ready");
    }

    void Update() {
        if (_circuit == null && _host.HasWeekendRoute) {
            _circuit = WeekendRideCircuitRenderer.Build(
                transform,
                _host.WeekendRoute,
                _presentation);
            _openRoad = WeekendHinterlandRoadRenderer.Attach(transform);
            Debug.Log("[GunsOnly] Weekend closed circuit built from host route "
                      + _circuit.RouteId + " with open-road network " + _openRoad.NetworkId);
        }

        if (!_host.HasPose) return;
        _pose = _host.Latest;
        Vector3 forward = _pose.PlayerForwardUnity;
        Vector3 left = _pose.PlayerLeftUnity;
        if (forward.sqrMagnitude < 1e-8f) forward = Vector3.forward;
        if (left.sqrMagnitude < 1e-8f) left = Vector3.left;
        Vector3 up = Vector3.Cross(forward, left).normalized;
        if (up.sqrMagnitude < 1e-8f) up = Vector3.up;

        _camera.transform.SetPositionAndRotation(
            _pose.PlayerUnity + Vector3.up * EyeHeightM,
            Quaternion.LookRotation(forward, up));
        _r1.SetEngineRpm((float)_pose.EngineRpm);
    }

    static void ConfigureWorldLight(WeekendCircuitRenderProfileFrame profile) {
        // Three applies fog after ACES and output-color conversion. Unity's built-in fog runs
        // before the camera post-pass, so the dedicated Weekend output transform owns fog.
        RenderSettings.fog = false;
        RenderSettings.fogMode = FogMode.ExponentialSquared;
        RenderSettings.fogColor = WeekendCircuitPresentationResource.LinearSrgbHex(
            profile.fog.srgb_hex);
        RenderSettings.fogDensity = (float)profile.fog.density;
        RenderSettings.ambientMode = AmbientMode.Trilight;
        RenderSettings.ambientSkyColor = WeekendCircuitPresentationResource.LinearSrgbHex(
            profile.hemisphere.sky_srgb_hex) * (float)profile.hemisphere.intensity;
        RenderSettings.ambientGroundColor = WeekendCircuitPresentationResource.LinearSrgbHex(
            profile.hemisphere.ground_srgb_hex) * (float)profile.hemisphere.intensity;
        RenderSettings.ambientEquatorColor = Color.Lerp(
            RenderSettings.ambientGroundColor,
            RenderSettings.ambientSkyColor,
            0.5f);

        var sunObject = new GameObject("WeekendSun");
        Light sun = sunObject.AddComponent<Light>();
        sun.type = LightType.Directional;
        sun.color = WeekendCircuitPresentationResource.LinearSrgbHex(profile.sun.srgb_hex);
        sun.intensity = (float)profile.sun.intensity;
        sun.shadows = LightShadows.None;
        // Web light sits at scene (-1200, 2400, 900) and targets the world origin.
        Vector3 webLightPosition = new(
            (float)profile.sun.position[0],
            (float)profile.sun.position[1],
            (float)profile.sun.position[2]);
        sun.transform.rotation = Quaternion.LookRotation(-webLightPosition.normalized, Vector3.up);
    }
}

}
