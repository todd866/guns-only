using System;
using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Unity's Weekend Ride controls mirror Web exactly: W/S power and brake, A/D turn, arrows
/// move the rider, Q/E shift, C clutch mode, T raw physics, R grid reset, Escape pause.
/// Commands remain rider intent; only the sidecar's motorcycle runtime owns vehicle dynamics.
/// </summary>
public sealed class WeekendRideInput : MonoBehaviour {
    const float HeartbeatSeconds = 0.1f;

    HostClient _host;
    bool _manualClutch;
    bool _rawPhysics;
    bool _paused;
    float _nextHeartbeat;
    Controls _last;
    bool _hasLast;

    public void Configure(HostClient host) {
        _host = host != null ? host : throw new ArgumentNullException(nameof(host));
    }

    void Update() {
        if (_host == null) return;

        if (Input.GetKeyDown(KeyCode.Escape)) {
            _paused = !_paused;
            _host.SetWeekendPaused(_paused);
        }
        if (Input.GetKeyDown(KeyCode.R)) {
            _host.ResetWeekendRide();
        }
        if (Input.GetKeyDown(KeyCode.C)) {
            _manualClutch = !_manualClutch;
            _host.SetWeekendClutchMode(_manualClutch);
        }
        if (Input.GetKeyDown(KeyCode.T)) {
            _rawPhysics = !_rawPhysics;
            _host.SetWeekendControlMode(_rawPhysics);
        }
        if (Input.GetKeyDown(KeyCode.Q)) _host.SendWeekendShift(-1);
        if (Input.GetKeyDown(KeyCode.E)) _host.SendWeekendShift(1);

        Controls current = SampleControls();
        if (!_hasLast || !current.Equals(_last) || Time.unscaledTime >= _nextHeartbeat) {
            _host.SendWeekendControls(
                current.Throttle,
                current.Brake,
                current.Steer,
                current.RiderLateral,
                current.RiderForeAft,
                current.Clutch);
            _last = current;
            _hasLast = true;
            _nextHeartbeat = Time.unscaledTime + HeartbeatSeconds;
        }
    }

    void OnApplicationFocus(bool focused) {
        if (!focused) ReleaseHeldControls();
    }

    void OnDisable() => ReleaseHeldControls();

    Controls SampleControls() => new(
        Input.GetKey(KeyCode.W) ? 1.0 : 0.0,
        Input.GetKey(KeyCode.S) ? 1.0 : 0.0,
        Axis(KeyCode.D, KeyCode.A),
        Axis(KeyCode.RightArrow, KeyCode.LeftArrow),
        Axis(KeyCode.UpArrow, KeyCode.DownArrow),
        _manualClutch
            && (Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift))
                ? 0.0
                : 1.0);

    void ReleaseHeldControls() {
        if (_host == null) return;
        var neutral = new Controls(0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        _host.SendWeekendControls(
            neutral.Throttle,
            neutral.Brake,
            neutral.Steer,
            neutral.RiderLateral,
            neutral.RiderForeAft,
            neutral.Clutch);
        _last = neutral;
        _hasLast = true;
    }

    static double Axis(KeyCode positive, KeyCode negative) =>
        (Input.GetKey(positive) ? 1.0 : 0.0) - (Input.GetKey(negative) ? 1.0 : 0.0);

    readonly struct Controls : IEquatable<Controls> {
        public readonly double Throttle;
        public readonly double Brake;
        public readonly double Steer;
        public readonly double RiderLateral;
        public readonly double RiderForeAft;
        public readonly double Clutch;

        public Controls(
            double throttle,
            double brake,
            double steer,
            double riderLateral,
            double riderForeAft,
            double clutch
        ) {
            Throttle = throttle;
            Brake = brake;
            Steer = steer;
            RiderLateral = riderLateral;
            RiderForeAft = riderForeAft;
            Clutch = clutch;
        }

        public bool Equals(Controls other) =>
            Throttle == other.Throttle
            && Brake == other.Brake
            && Steer == other.Steer
            && RiderLateral == other.RiderLateral
            && RiderForeAft == other.RiderForeAft
            && Clutch == other.Clutch;

        public override bool Equals(object obj) => obj is Controls other && Equals(other);
        public override int GetHashCode() => 0;
    }
}

}
