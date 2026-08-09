using System;
using System.Globalization;
using System.IO;
using System.Text;
using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Continuous pose log for human play sessions (not just -gunsOnlyQa).
/// Writes Application.persistentDataPath/flight/telemetry.jsonl and mirrors
/// /tmp/guns-only-flight.jsonl so agents can pull without hunting Library paths.
/// Disable with env GUNSONLY_FLIGHT_TELEMETRY=0. Sample Hz via GUNSONLY_FLIGHT_HZ (default 20).
/// </summary>
public sealed class FlightTelemetry : MonoBehaviour {
    HostClient _host;
    Camera _cam;
    StreamWriter _writer;
    StreamWriter _mirror;
    string _path;
    float _nextSampleAt;
    float _period = 0.05f;
    long _rows;
    long _lastTick = long.MinValue;

    public static bool Enabled {
        get {
            if (QaPilot.Enabled) return false; // QA has its own denser jsonl
            string env = Environment.GetEnvironmentVariable("GUNSONLY_FLIGHT_TELEMETRY");
            if (env is "0" or "false" or "FALSE" or "no" or "off") return false;
            return true;
        }
    }

    public void Configure(HostClient host, Camera cam) {
        _host = host;
        _cam = cam;
    }

    void Start() {
        if (!Enabled) {
            enabled = false;
            return;
        }

        float hz = 20f;
        string hzEnv = Environment.GetEnvironmentVariable("GUNSONLY_FLIGHT_HZ");
        if (!string.IsNullOrEmpty(hzEnv)
            && float.TryParse(hzEnv, NumberStyles.Float, CultureInfo.InvariantCulture, out float parsed)
            && parsed > 0.5f && parsed <= 120f) {
            hz = parsed;
        }
        _period = 1f / hz;

        string dir = Path.Combine(Application.persistentDataPath, "flight");
        Directory.CreateDirectory(dir);
        // Rotate previous run so agents can still open the last session if needed.
        string prev = Path.Combine(dir, "telemetry.prev.jsonl");
        _path = Path.Combine(dir, "telemetry.jsonl");
        try {
            if (File.Exists(_path)) File.Copy(_path, prev, overwrite: true);
        } catch { /* ignore */ }
        try { File.Delete(_path); } catch { /* ignore */ }
        try { File.Delete("/tmp/guns-only-flight.jsonl"); } catch { /* ignore */ }

        _writer = new StreamWriter(_path, append: false, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false)) {
            AutoFlush = true,
        };
        try {
            _mirror = new StreamWriter("/tmp/guns-only-flight.jsonl", append: false,
                new UTF8Encoding(encoderShouldEmitUTF8Identifier: false)) {
                AutoFlush = true,
            };
        } catch {
            _mirror = null;
        }

        var hdr = new StringBuilder(192);
        hdr.Append("{\"k\":\"hdr\",\"t\":").Append(F(Time.unscaledTime));
        hdr.Append(",\"utc\":\"").Append(DateTime.UtcNow.ToString("o")).Append('"');
        hdr.Append(",\"hz\":").Append(F(hz));
        hdr.Append(",\"path\":\"").Append(Esc(_path)).Append('"');
        hdr.Append(",\"mission\":\"cobra-vietnam\"}");
        WriteLine(hdr.ToString());
        Debug.Log("[GunsOnly] flight telemetry → " + _path + " (mirror /tmp/guns-only-flight.jsonl)");
        _nextSampleAt = Time.unscaledTime;
    }

    void LateUpdate() {
        if (_writer == null || _host == null || !_host.HasPose) return;
        if (Time.unscaledTime < _nextSampleAt) return;
        _nextSampleAt = Time.unscaledTime + _period;

        var p = _host.Latest;
        // Skip exact duplicate ticks (host paused / client catching up).
        if (p.Tick == _lastTick && _rows > 0) return;
        _lastTick = p.Tick;

        var sb = new StringBuilder(420);
        sb.Append("{\"k\":\"pose\",\"t\":").Append(F(Time.unscaledTime));
        sb.Append(",\"tick\":").Append(p.Tick);
        sb.Append(",\"sim\":").Append(F(p.SimulationTimeS));
        sb.Append(",\"life\":\"").Append(Esc(p.Lifecycle ?? "")).Append('"');
        sb.Append(",\"alt_ft\":").Append(F1(p.PlayerAltitudeFt));
        sb.Append(",\"hdg\":").Append(F1(p.PlayerHeadingDeg));
        sb.Append(",\"ias_kts\":").Append(F1(p.IndicatedAirspeedKts));
        sb.Append(",\"pitch\":").Append(F1(p.PitchDeg));
        sb.Append(",\"bank\":").Append(F1(p.BankDeg));
        sb.Append(",\"vs_fpm\":").Append(F0(p.VerticalSpeedFpm));
        sb.Append(",\"nr\":").Append(F0(p.RotorRpm));
        sb.Append(",\"coll\":").Append(F2(p.Collective01));
        sb.Append(",\"tq_frac\":").Append(F2(p.TorqueLimitFraction));
        sb.Append(",\"ctl\":").Append(F2(p.ControlBalance));
        sb.Append(",\"ammo\":").Append(p.AmmoRounds);
        sb.Append(",\"gun\":\"").Append(Esc(p.GunStatus ?? "")).Append('"');
        sb.Append(",\"ralt_m\":").Append(F1(p.ClearanceM));
        sb.Append(",\"fob_m\":").Append(F0(p.FobRangeM));
        sb.Append(",\"px\":").Append(F1(p.Px));
        sb.Append(",\"py\":").Append(F1(p.Py));
        sb.Append(",\"pz\":").Append(F1(p.Pz));
        sb.Append(",\"opp\":").Append(p.OpponentPresent ? "true" : "false");
        if (p.OpponentPresent) {
            sb.Append(",\"bx\":").Append(F1(p.Bx));
            sb.Append(",\"by\":").Append(F1(p.By));
            sb.Append(",\"bz\":").Append(F1(p.Bz));
            float sep = Vector3.Distance(p.PlayerUnity, p.BanditUnity);
            sb.Append(",\"sep_m\":").Append(F0(sep));
        }
        if (p.Units != null) sb.Append(",\"units\":").Append(p.Units.Length);
        if (_cam != null) {
            var c = _cam.transform.position;
            var e = _cam.transform.eulerAngles;
            sb.Append(",\"cam_x\":").Append(F1(c.x));
            sb.Append(",\"cam_y\":").Append(F1(c.y));
            sb.Append(",\"cam_z\":").Append(F1(c.z));
            sb.Append(",\"cam_pitch\":").Append(F1(NormalizeSigned(e.x)));
            sb.Append(",\"cam_yaw\":").Append(F1(e.y));
            sb.Append(",\"cam_roll\":").Append(F1(NormalizeSigned(e.z)));
        }
        sb.Append('}');
        WriteLine(sb.ToString());
        _rows++;
    }

    void OnDestroy() => Close();
    void OnApplicationQuit() => Close();

    void Close() {
        if (_writer == null) return;
        try {
            WriteLine("{\"k\":\"end\",\"t\":" + F(Time.unscaledTime)
                      + ",\"rows\":" + _rows
                      + ",\"utc\":\"" + DateTime.UtcNow.ToString("o") + "\"}");
        } catch { /* ignore */ }
        try { _writer.Dispose(); } catch { /* ignore */ }
        try { _mirror?.Dispose(); } catch { /* ignore */ }
        _writer = null;
        _mirror = null;
        Debug.Log("[GunsOnly] flight telemetry closed rows=" + _rows + " → " + _path);
    }

    void WriteLine(string line) {
        try { _writer.WriteLine(line); } catch { /* ignore */ }
        try { _mirror?.WriteLine(line); } catch { /* ignore */ }
    }

    static float NormalizeSigned(float deg) {
        deg %= 360f;
        if (deg > 180f) deg -= 360f;
        return deg;
    }

    static string F(double v) => v.ToString("F3", CultureInfo.InvariantCulture);
    static string F0(double v) => v.ToString("F0", CultureInfo.InvariantCulture);
    static string F1(double v) => v.ToString("F1", CultureInfo.InvariantCulture);
    static string F2(double v) => v.ToString("F2", CultureInfo.InvariantCulture);
    static string Esc(string s) => s.Replace("\\", "\\\\").Replace("\"", "\\\"");
}

}
