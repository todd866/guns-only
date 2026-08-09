using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using GunsOnly.UnityBridge;
using UnityEngine;
using Debug = UnityEngine.Debug;
using Process = System.Diagnostics.Process;
using ProcessStartInfo = System.Diagnostics.ProcessStartInfo;

namespace GunsOnly.UnityClient {

/// <summary>
/// TCP client for GunsOnly.UnityHost. Spawns the sidecar host if needed and reconnects only when
/// the reader thread dies — never poll TcpClient.Connected (it false-negatives and kills the stream).
/// </summary>
public sealed class HostClient : MonoBehaviour {
    public string Host = "127.0.0.1";
    public int Port = 18765;
    public UnityMissionKind Mission { get; private set; } = UnityMissionKind.Cobra;

    readonly ConcurrentQueue<PoseFrame> _inbound = new();
    readonly ConcurrentQueue<WeekendRouteFrame> _routeInbound = new();
    TcpClient _client;
    NetworkStream _stream;
    Thread _reader;
    Process _hostProcess;
    volatile bool _running;
    volatile bool _readerAlive;
    readonly object _connectLock = new object();
    bool _connectInProgress;
    PoseFrame _latest;
    WeekendRouteFrame _weekendRoute;
    bool _hasPose;
    bool _hasWeekendRoute;
    float _reconnectAt;
    int _parseFails;
    int _framesSeen;

    public bool HasPose => _hasPose;
    public PoseFrame Latest => _latest;
    public bool HasWeekendRoute => _hasWeekendRoute;
    public WeekendRouteFrame WeekendRoute => _weekendRoute;
    public UnitMarker[] LatestUnits => _hasPose ? (_latest.Units ?? System.Array.Empty<UnitMarker>()) : System.Array.Empty<UnitMarker>();
    public bool Connected => _readerAlive;

    public void ConfigureMission(UnityMissionKind mission) {
        if (_running)
            throw new InvalidOperationException("mission must be configured before HostClient.Start");
        Mission = mission;
    }

    void Start() {
        _running = true;
        TryConnect(spawnHost: true);
    }

    void Update() {
        while (_routeInbound.TryDequeue(out WeekendRouteFrame route)) {
            _weekendRoute = route;
            _hasWeekendRoute = true;
            Debug.Log("[GunsOnly] cached Weekend route " + route.id
                      + " points=" + route.centreline.Length);
        }
        while (_inbound.TryDequeue(out PoseFrame frame)) {
            _latest = frame;
            _hasPose = true;
            _framesSeen++;
            if (_framesSeen == 1) {
                Debug.Log("[GunsOnly] first pose tick=" + frame.Tick
                          + " alt_ft=" + frame.PlayerAltitudeFt.ToString("F0")
                          + " lifecycle=" + frame.Lifecycle);
            }
        }
        if (!_readerAlive && Time.unscaledTime >= _reconnectAt) {
            TryConnect(spawnHost: true);
            _reconnectAt = Time.unscaledTime + 1.0f;
        }
    }

    void OnDestroy() {
        _running = false;
        CloseSocket();
        if (_hostProcess is { HasExited: false }) {
            try { _hostProcess.Kill(); } catch { /* ignore */ }
        }
    }

    public void SendKey(int gkey, bool pressed) {
        if (gkey == 8) TriggerHeld = pressed;
        SendCommand("{\"type\":\"key\",\"key\":" + gkey + ",\"pressed\":" + (pressed ? "true" : "false") + "}");
    }

    public void SendWeekendControls(
        double throttle,
        double brake,
        double steer,
        double riderLateral,
        double riderForeAft,
        double clutch
    ) {
        SendCommand(
            "{\"type\":\"weekend_controls\",\"throttle\":" + Number(throttle)
            + ",\"brake\":" + Number(brake)
            + ",\"steer\":" + Number(steer)
            + ",\"riderLateral\":" + Number(riderLateral)
            + ",\"riderForeAft\":" + Number(riderForeAft)
            + ",\"clutch\":" + Number(clutch) + "}");
    }

    public void SendWeekendShift(int direction) {
        if (direction is < -1 or > 1)
            throw new ArgumentOutOfRangeException(nameof(direction));
        SendCommand("{\"type\":\"weekend_shift\",\"direction\":" + direction + "}");
    }

    public void SetWeekendPaused(bool paused) => SendCommand(
        "{\"type\":\"weekend_pause\",\"pressed\":"
        + (paused ? "true" : "false") + "}");

    public void ResetWeekendRide() => SendCommand("{\"type\":\"weekend_reset\"}");

    public void SetWeekendClutchMode(bool manual) => SendCommand(
        "{\"type\":\"weekend_clutch_mode\",\"mode\":" + (manual ? 1 : 0) + "}");

    public void SetWeekendControlMode(bool raw) => SendCommand(
        "{\"type\":\"weekend_control_mode\",\"mode\":" + (raw ? 1 : 0) + "}");

    public bool TriggerHeld { get; private set; }

    void TryConnect(bool spawnHost) {
        lock (_connectLock) {
            if (_connectInProgress || _readerAlive) return;
            _connectInProgress = true;
        }
        try {
            CloseSocket();
            ResetWeekendRouteCache();
            if (spawnHost) EnsureHostRunning();
            // Never probe with a throwaway TCP connect — that steals host Accept.
            ConnectWithRetry(attempts: 40, delayMs: 100);
            _readerAlive = true;
            _reader = new Thread(ReadLoop) { IsBackground = true, Name = "GunsOnlyHostReader" };
            _reader.Start();
            SendCommand("{\"type\":\"release_weapons\"}");
            Debug.Log("[GunsOnly] connected to " + Host + ":" + Port);
        } catch (Exception ex) {
            Debug.LogWarning("[GunsOnly] connect failed: " + ex.Message);
            _readerAlive = false;
            CloseSocket();
        } finally {
            lock (_connectLock) { _connectInProgress = false; }
        }
    }

    void EnsureHostRunning() {
        if (PortIsListening()) return;
        string hostPath = ResolveHostExecutable();
        if (hostPath == null) {
            throw new FileNotFoundException(
                "GunsOnly.UnityHost not found next to the player. Run bin/unity-build.");
        }
        if (_hostProcess is { HasExited: false }) return;

        var start = new ProcessStartInfo {
            FileName = hostPath,
            Arguments = "--mission " + UnityMissionSelection.Argument(Mission)
                + " --port " + Port,
            WorkingDirectory = Path.GetDirectoryName(hostPath) ?? ".",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        _hostProcess = Process.Start(start)
            ?? throw new InvalidOperationException("failed to start GunsOnly.UnityHost");
        Debug.Log("[GunsOnly] started " + UnityMissionSelection.Argument(Mission)
                  + " host sidecar: " + hostPath + " pid=" + _hostProcess.Id);
        // Wait for listen without Accept-stealing.
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(8);
        while (DateTime.UtcNow < deadline) {
            if (PortIsListening()) return;
            Thread.Sleep(50);
        }
    }

    /// <summary>Listen check via lsof — does not open a client socket.</summary>
    bool PortIsListening() {
        try {
            var psi = new ProcessStartInfo {
                FileName = "/usr/sbin/lsof",
                Arguments = "-nP -iTCP:" + Port + " -sTCP:LISTEN",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };
            using Process p = Process.Start(psi);
            if (p == null) return false;
            string output = p.StandardOutput.ReadToEnd();
            p.WaitForExit(500);
            return output.IndexOf(":" + Port, StringComparison.Ordinal) >= 0;
        } catch {
            return false;
        }
    }

    void ConnectWithRetry(int attempts, int delayMs) {
        Exception last = null;
        for (int i = 0; i < attempts; i++) {
            try {
                _client = new TcpClient { NoDelay = true };
                _client.Connect(Host, Port);
                _stream = _client.GetStream();
                return;
            } catch (Exception ex) {
                last = ex;
                CloseSocket();
                Thread.Sleep(delayMs);
            }
        }
        throw last ?? new IOException("connect failed");
    }

    static string ResolveHostExecutable() {
        string dataPath = Application.dataPath;
        string[] candidates = {
            Path.GetFullPath(Path.Combine(dataPath, "..", "..", "..", "host", "GunsOnly.UnityHost")),
            Path.GetFullPath(Path.Combine(dataPath, "..", "MacOS", "GunsOnly.UnityHost")),
            Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "host", "GunsOnly.UnityHost")),
        };
        foreach (string path in candidates) {
            if (File.Exists(path)) return path;
        }
        return null;
    }

    void SendCommand(string json) {
        if (_stream == null) return;
        byte[] utf8 = Encoding.UTF8.GetBytes(json);
        byte[] packet = new byte[4 + utf8.Length];
        byte[] lenBytes = BitConverter.GetBytes(utf8.Length);
        Buffer.BlockCopy(lenBytes, 0, packet, 0, 4);
        Buffer.BlockCopy(utf8, 0, packet, 4, utf8.Length);
        try { _stream.Write(packet, 0, packet.Length); }
        catch (IOException) { CloseSocket(); }
    }

    void ReadLoop() {
        var lenBuf = new byte[4];
        int got = 0;
        bool routeAccepted = Mission != UnityMissionKind.WeekendRide;
        try {
            File.AppendAllText("/tmp/guns-only-reader.log", DateTime.UtcNow.ToString("o") + " reader start\n");
            while (_running && _stream != null) {
                try {
                    if (!ReadExact(_stream, lenBuf, 4)) break;
                    int len = BitConverter.ToInt32(lenBuf, 0);
                    if (len <= 0 || len > 1_000_000) break;
                    var body = new byte[len];
                    if (!ReadExact(_stream, body, len)) break;
                    string json = Encoding.UTF8.GetString(body);
                    if (TryParseWeekendRoute(json, out WeekendRouteFrame route)) {
                        if (Mission != UnityMissionKind.WeekendRide) {
                            Debug.LogError("[GunsOnly] Weekend route arrived for "
                                           + UnityMissionSelection.Argument(Mission));
                            break;
                        }
                        _routeInbound.Enqueue(route);
                        routeAccepted = true;
                    } else if (!routeAccepted && got == 0) {
                        Debug.LogError(
                            "[GunsOnly] Weekend host did not lead with a valid v1 route contract");
                        break;
                    } else if (TryParsePose(json, out PoseFrame frame)) {
                        if (got == 0 && !UnityMissionSelection.MatchesMissionPack(
                                Mission, frame.MissionPack)) {
                            string mismatch = "selected " + UnityMissionSelection.Argument(Mission)
                                + " but port " + Port + " serves missionPack=" + frame.MissionPack;
                            File.AppendAllText("/tmp/guns-only-reader.log", mismatch + "\n");
                            Debug.LogError("[GunsOnly] " + mismatch);
                            break;
                        }
                        _inbound.Enqueue(frame);
                        got++;
                        if (got == 1 || got % 120 == 0) {
                            File.AppendAllText("/tmp/guns-only-reader.log",
                                "frame#" + got + " tick=" + frame.Tick + " len=" + len + "\n");
                        }
                    } else if (++_parseFails <= 3) {
                        File.AppendAllText("/tmp/guns-only-reader.log", "parse fail: " + json.Substring(0, Math.Min(160, json.Length)) + "\n");
                        Debug.LogWarning("[GunsOnly] pose parse failed: " + json.Substring(0, Math.Min(120, json.Length)));
                    }
                } catch (IOException) {
                    break;
                } catch (Exception ex) {
                    Debug.LogWarning("[GunsOnly] reader error: " + ex.Message);
                    break;
                }
            }
        } finally {
            File.AppendAllText("/tmp/guns-only-reader.log", "reader exit got=" + got + "\n");
            _readerAlive = false;
            CloseSocket();
        }
    }

    void CloseSocket() {
        try { _stream?.Close(); } catch { /* ignore */ }
        try { _client?.Close(); } catch { /* ignore */ }
        _stream = null;
        _client = null;
    }

    void ResetWeekendRouteCache() {
        _hasWeekendRoute = false;
        _weekendRoute = null;
        while (_routeInbound.TryDequeue(out _)) { }
    }

    static bool ReadExact(Stream stream, byte[] buffer, int count) {
        int offset = 0;
        while (offset < count) {
            int n = stream.Read(buffer, offset, count - offset);
            if (n <= 0) return false;
            offset += n;
        }
        return true;
    }

    static bool TryParsePose(string json, out PoseFrame frame) {
        frame = default;
        try {
            frame = new PoseFrame {
                Tick = ReadLong(json, "tick"),
                SimulationTimeS = ReadDouble(json, "simulationTimeS"),
                Lifecycle = ReadString(json, "lifecycle"),
                Px = ReadDouble(json, "px"),
                Py = ReadDouble(json, "py"),
                Pz = ReadDouble(json, "pz"),
                Pfx = ReadDouble(json, "pfx"),
                Pfy = ReadDouble(json, "pfy"),
                Pfz = ReadDouble(json, "pfz"),
                Plx = ReadDoubleOr(json, "plx", -1),
                Ply = ReadDoubleOr(json, "ply", 0),
                Plz = ReadDoubleOr(json, "plz", 0),
                OpponentPresent = ReadBool(json, "opponentPresent"),
                Bx = ReadDouble(json, "bx"),
                By = ReadDouble(json, "by"),
                Bz = ReadDouble(json, "bz"),
                Bfx = ReadDouble(json, "bfx"),
                Bfy = ReadDouble(json, "bfy"),
                Bfz = ReadDouble(json, "bfz"),
                Blx = ReadDoubleOr(json, "blx", -1),
                Bly = ReadDoubleOr(json, "bly", 0),
                Blz = ReadDoubleOr(json, "blz", 0),
                PlayerAltitudeFt = ReadDouble(json, "playerAltitudeFt"),
                PlayerHeadingDeg = ReadDouble(json, "playerHeadingDeg"),
                WeaponsHold = ReadBoolOr(json, "weaponsHold", false),
                IndicatedAirspeedKts = ReadDoubleOr(json, "indicatedAirspeedKts", 0),
                PitchDeg = ReadDoubleOr(json, "pitchDeg", 0),
                BankDeg = ReadDoubleOr(json, "bankDeg", 0),
                VerticalSpeedFpm = ReadDoubleOr(json, "verticalSpeedFpm", 0),
                Mach = ReadDoubleOr(json, "mach", 0),
                MissionPack = ReadStringOr(json, "missionPack", ""),
                AmmoRounds = (int)ReadDoubleOr(json, "ammoRounds", 0),
                ControlBalance = ReadDoubleOr(json, "controlBalance", 0),
                RotorRpm = ReadDoubleOr(json, "rotorRpm", 0),
                Collective01 = ReadDoubleOr(json, "collective01", 0),
                ClearanceM = ReadDoubleOr(json, "clearanceM", 0),
                FobRangeM = ReadDoubleOr(json, "fobRangeM", 0),
                TorqueNm = ReadDoubleOr(json, "torqueNm", 0),
                TorqueLimitFraction = ReadDoubleOr(json, "torqueLimitFraction", 0),
                Units = ParseUnits(json),
                GunStatus = ReadStringOr(json, "gunStatus", ""),
                VictoryHoldProgress = ReadDoubleOr(json, "victoryHoldProgress", 0),
                HostileKills = (int)ReadDoubleOr(json, "hostileKills", 0),
                CobraTargetSelected = ReadBoolOr(json, "cobraTargetSelected", false),
                RecoveryPlatformPresent = ReadBoolOr(
                    json, "recoveryPlatformPresent", false),
                Rpx = ReadDoubleOr(json, "rpx", 0),
                Rpy = ReadDoubleOr(json, "rpy", 0),
                Rpz = ReadDoubleOr(json, "rpz", 0),
                RecoveryPlatformHeadingRad = ReadDoubleOr(
                    json, "recoveryPlatformHeadingRad", 0),
                RecoveryPlatformPitchDeg = ReadDoubleOr(
                    json, "recoveryPlatformPitchDeg", 0),
                CatapultActive = ReadBoolOr(json, "catapultActive", false),
                CatapultProgress = ReadDoubleOr(json, "catapultProgress", 0),
                VehicleSpeedMps = ReadDoubleOr(json, "vehicleSpeedMps", 0),
                EngineRpm = ReadDoubleOr(json, "engineRpm", 0),
                VehicleGear = (int)ReadDoubleOr(json, "vehicleGear", 0),
                CircuitProgressM = ReadDoubleOr(json, "circuitProgressM", 0),
                CircuitLengthM = ReadDoubleOr(json, "circuitLengthM", 0),
                NextSectorIndex = (int)ReadDoubleOr(json, "nextSectorIndex", 0),
                LapCount = (int)ReadDoubleOr(json, "lapCount", 0),
                PadlockSelected = ReadBoolOr(json, "padlockSelected", false),
                GunSolution = ReadBoolOr(json, "gunSolution", false),
                PlayerHits = (int)ReadDoubleOr(json, "playerHits", 0),
                RapierPhaseCode = (int)ReadDoubleOr(json, "rapierPhaseCode", 0),
                RapierPhaseToken = ReadStringOr(json, "rapierPhaseToken", ""),
                RapierCircuitLeg = ReadStringOr(json, "rapierCircuitLeg", ""),
                RapierRecoveryGate = (int)ReadDoubleOr(json, "rapierRecoveryGate", 0),
                RapierAutomationEnabled = ReadBoolOr(
                    json, "rapierAutomationEnabled", false),
                RapierAutomationActive = ReadBoolOr(
                    json, "rapierAutomationActive", false),
                RapierJobToken = ReadStringOr(json, "rapierJobToken", ""),
                RapierDronesRemaining = (int)ReadDoubleOr(
                    json, "rapierDronesRemaining", 0),
                WeekendCue = ReadStringOr(json, "weekendCue", ""),
            };
            return true;
        } catch {
            return false;
        }
    }

    static long ReadLong(string json, string key) => (long)ReadDouble(json, key);

    static bool ReadBool(string json, string key) {
        string token = Extract(json, key);
        return token is "true" or "1";
    }

    static bool ReadBoolOr(string json, string key, bool fallback) {
        try { return ReadBool(json, key); }
        catch { return fallback; }
    }

    static string ReadString(string json, string key) => Extract(json, key).Trim('"');

    static string ReadStringOr(string json, string key, string fallback) {
        try { return ReadString(json, key); }
        catch { return fallback; }
    }

    static double ReadDouble(string json, string key) =>
        double.Parse(Extract(json, key), System.Globalization.CultureInfo.InvariantCulture);

    static double ReadDoubleOr(string json, string key, double fallback) {
        try { return ReadDouble(json, key); }
        catch { return fallback; }
    }

    static string Number(double value) {
        if (double.IsNaN(value) || double.IsInfinity(value))
            throw new ArgumentOutOfRangeException(nameof(value));
        return value.ToString("R", System.Globalization.CultureInfo.InvariantCulture);
    }

    static bool TryParseWeekendRoute(string json, out WeekendRouteFrame route) {
        route = null;
        try {
            if (json.IndexOf("\"schema\":\"" + UnityMissionSelection.WeekendRouteSchema + "\"",
                    StringComparison.Ordinal) < 0) {
                return false;
            }
            WeekendRouteFrame parsed = JsonUtility.FromJson<WeekendRouteFrame>(json);
            if (parsed == null || !parsed.Validate()) return false;
            route = parsed;
            return true;
        } catch {
            return false;
        }
    }

    static UnitMarker[] ParseUnits(string json) {
        const string needle = "\"units\":";
        int i = json.IndexOf(needle, System.StringComparison.OrdinalIgnoreCase);
        if (i < 0) return System.Array.Empty<UnitMarker>();
        i = json.IndexOf('[', i);
        if (i < 0) return System.Array.Empty<UnitMarker>();
        int depth = 0;
        int end = -1;
        for (int j = i; j < json.Length; j++) {
            char c = json[j];
            if (c == '[') depth++;
            else if (c == ']') {
                depth--;
                if (depth == 0) { end = j; break; }
            }
        }
        if (end < 0) return System.Array.Empty<UnitMarker>();
        string arr = json.Substring(i, end - i + 1);
        var list = new System.Collections.Generic.List<UnitMarker>(32);
        int pos = 0;
        while (true) {
            int obj = arr.IndexOf('{', pos);
            if (obj < 0) break;
            int objEnd = arr.IndexOf('}', obj);
            if (objEnd < 0) break;
            string o = arr.Substring(obj, objEnd - obj + 1);
            list.Add(new UnitMarker {
                Faction = (byte)ReadDoubleOr(o, "faction", 0),
                Role = (byte)ReadDoubleOr(o, "role", 0),
                X = (float)ReadDoubleOr(o, "x", 0),
                Y = (float)ReadDoubleOr(o, "y", 0),
                Z = (float)ReadDoubleOr(o, "z", 0),
                Health01 = (float)ReadDoubleOr(o, "health01", 1),
            });
            pos = objEnd + 1;
            if (list.Count >= 36) break;
        }
        return list.ToArray();
    }

    static string Extract(string json, string key) {
        string needle = "\"" + key + "\":";
        int i = 0;
        while (true) {
            i = json.IndexOf(needle, i, StringComparison.OrdinalIgnoreCase);
            if (i < 0) throw new InvalidOperationException(key);
            // Require a JSON object key boundary so "tick" does not match inside longer names.
            if (i == 0 || json[i - 1] is '{' or ',' or ' ' or '\n' or '\r' or '\t') break;
            i += needle.Length;
        }
        i += needle.Length;
        while (i < json.Length && char.IsWhiteSpace(json[i])) i++;
        if (json[i] == '"') {
            int end = json.IndexOf('"', i + 1);
            return json.Substring(i, end - i + 1);
        }
        int j = i;
        while (j < json.Length && json[j] is not (',' or '}' or ']')) j++;
        return json.Substring(i, j - i).Trim();
    }

    public struct UnitMarker {
        public byte Faction;
        public byte Role;
        public float X, Y, Z;
        public float Health01;
    }

    public struct PoseFrame {
        public long Tick;
        public double SimulationTimeS;
        public string Lifecycle;
        public double Px, Py, Pz;
        public double Pfx, Pfy, Pfz;
        public double Plx, Ply, Plz;
        public bool OpponentPresent;
        public double Bx, By, Bz;
        public double Bfx, Bfy, Bfz;
        public double Blx, Bly, Blz;
        public double PlayerAltitudeFt;
        public double PlayerHeadingDeg;
        public bool WeaponsHold;
        public double IndicatedAirspeedKts;
        public double PitchDeg;
        public double BankDeg;
        public double VerticalSpeedFpm;
        public double Mach;
        public string MissionPack;
        public int AmmoRounds;
        public double ControlBalance;
        public double RotorRpm;
        public double Collective01;
        public double ClearanceM;
        public double FobRangeM;
        public double TorqueNm;
        public double TorqueLimitFraction;
        public UnitMarker[] Units;
        public string GunStatus;
        public double VictoryHoldProgress;
        public int HostileKills;
        public bool CobraTargetSelected;
        public bool RecoveryPlatformPresent;
        public double Rpx, Rpy, Rpz;
        public double RecoveryPlatformHeadingRad;
        public double RecoveryPlatformPitchDeg;
        public bool CatapultActive;
        public double CatapultProgress;
        public double VehicleSpeedMps;
        public double EngineRpm;
        public int VehicleGear;
        public double CircuitProgressM;
        public double CircuitLengthM;
        public int NextSectorIndex;
        public int LapCount;
        public bool PadlockSelected;
        public bool GunSolution;
        public int PlayerHits;
        public int RapierPhaseCode;
        public string RapierPhaseToken;
        public string RapierCircuitLeg;
        public int RapierRecoveryGate;
        public bool RapierAutomationEnabled;
        public bool RapierAutomationActive;
        public string RapierJobToken;
        public int RapierDronesRemaining;
        public string WeekendCue;

        public Vector3 PlayerUnity => SimToUnity(Px, Py, Pz);
        public Vector3 BanditUnity => SimToUnity(Bx, By, Bz);
        public Vector3 PlayerForwardUnity => SimToUnity(Pfx, Pfy, Pfz).normalized;
        public Vector3 PlayerLeftUnity => SimToUnity(Plx, Ply, Plz).normalized;
        public Vector3 BanditForwardUnity => SimToUnity(Bfx, Bfy, Bfz).normalized;
        public Vector3 BanditLeftUnity => SimToUnity(Blx, Bly, Blz).normalized;
        public Vector3 RecoveryPlatformUnity => SimToUnity(Rpx, Rpy, Rpz);

        static Vector3 SimToUnity(double east, double up, double north) =>
            new((float)east, (float)up, (float)(-north));
    }

    [Serializable]
    public sealed class WeekendRouteFrame {
        public string schema;
        public string id;
        public string mode;
        public string route_kind;
        public bool closed;
        public double track_width_m;
        public double pavement_half_width_m;
        public double surface_elevation_m;
        public double circuit_length_m;
        public double[] sector_gate_progress;
        public WeekendRouteStart start;
        public WeekendRouteStart paddock_access;
        public WeekendRoutePoint[] centreline;

        public bool Validate() {
            if (!string.Equals(schema, UnityMissionSelection.WeekendRouteSchema,
                    StringComparison.Ordinal)
                || !string.Equals(id, UnityMissionSelection.WeekendCircuitId,
                    StringComparison.Ordinal)
                || !string.Equals(mode, "track-day", StringComparison.Ordinal)
                || !string.Equals(route_kind, "closed-circuit", StringComparison.Ordinal)
                || !closed
                || !FinitePositive(track_width_m)
                || !FinitePositive(pavement_half_width_m)
                || pavement_half_width_m < track_width_m * 0.5
                || !Finite(surface_elevation_m)
                || !FinitePositive(circuit_length_m)
                || start == null
                || !start.IsFinite
                || paddock_access == null
                || !paddock_access.IsFinite
                || Math.Abs(paddock_access.y - surface_elevation_m) > 0.01
                || centreline == null
                || centreline.Length is < 4 or > 4096
                || sector_gate_progress == null
                || sector_gate_progress.Length == 0) {
                return false;
            }

            double previousGate = 0.0;
            foreach (double gate in sector_gate_progress) {
                if (!Finite(gate) || gate <= previousGate || gate >= 1.0) return false;
                previousGate = gate;
            }

            double sampledLengthM = 0.0;
            for (int index = 0; index < centreline.Length; index++) {
                WeekendRoutePoint point = centreline[index];
                if (point == null || !point.IsFinite) return false;
                if (index == 0) continue;
                double dx = point.x - centreline[index - 1].x;
                double dz = point.z - centreline[index - 1].z;
                sampledLengthM += Math.Sqrt(dx * dx + dz * dz);
            }
            WeekendRoutePoint first = centreline[0];
            WeekendRoutePoint last = centreline[centreline.Length - 1];
            double closureDx = first.x - last.x;
            double closureDz = first.z - last.z;
            double startDx = first.x - start.x;
            double startDz = first.z - start.z;
            double toleranceM = Math.Max(0.1, circuit_length_m * 0.001);
            return Math.Sqrt(closureDx * closureDx + closureDz * closureDz) <= 0.01
                && Math.Sqrt(startDx * startDx + startDz * startDz) <= 0.01
                && Math.Abs(first.y - surface_elevation_m) <= 0.01
                && Math.Abs(sampledLengthM - circuit_length_m) <= toleranceM;
        }

        static bool Finite(double value) => !double.IsNaN(value) && !double.IsInfinity(value);
        static bool FinitePositive(double value) => Finite(value) && value > 0.0;
    }

    [Serializable]
    public sealed class WeekendRouteStart {
        public double x;
        public double y;
        public double z;
        public double heading_rad;

        public bool IsFinite => Finite(x) && Finite(y) && Finite(z) && Finite(heading_rad);
        static bool Finite(double value) => !double.IsNaN(value) && !double.IsInfinity(value);
    }

    [Serializable]
    public sealed class WeekendRoutePoint {
        public double x;
        public double y;
        public double z;

        public bool IsFinite => Finite(x) && Finite(y) && Finite(z);
        static bool Finite(double value) => !double.IsNaN(value) && !double.IsInfinity(value);
    }

    public static Vector3 SimToUnityPublic(double east, double up, double north) =>
        new((float)east, (float)up, (float)(-north));
}

}
