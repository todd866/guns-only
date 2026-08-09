using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using GunsOnly.Sim.Cobra;
using GunsOnly.UnityBridge;

namespace GunsOnly.UnityHost;

static class Program {
    const double FrameDt = 1.0 / 60.0;

    static int Main(string[] args) {
        bool smoke = args.Any(a => a is "--smoke" or "-smoke");
        double smokeSeconds = 3.0;
        int port = WireCodec.DefaultPort;
        for (int i = 0; i < args.Length; i++) {
            if (args[i] is "--seconds" or "-s"
                && i + 1 < args.Length
                && double.TryParse(args[i + 1], out double parsed)
                && parsed > 0.0) {
                smokeSeconds = parsed;
            }
            if (args[i] is "--port" or "-p"
                && i + 1 < args.Length
                && int.TryParse(args[i + 1], out int parsedPort)
                && parsedPort is > 0 and < 65536) {
                port = parsedPort;
            }
        }

        try {
            UnityMissionKind mission = UnityMissionSelection.FromCommandLine(args);
            using IHostSession session = StartSelectedSession(mission);
            Console.WriteLine(
                $"GunsOnly UnityHost · {session.DisplayName} · " +
                $"status={session.Status}");

            if (smoke) {
                return RunSmoke(session, smokeSeconds);
            }

            return RunServer(session, port);
        } catch (Exception ex) {
            Console.Error.WriteLine($"host fatal: {ex}");
            return 99;
        }
    }

    static int RunSmoke(IHostSession session, double seconds) {
        if (session is IWeekendHostSession weekend) {
            weekend.SetControls(1.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        } else {
            // Aircraft authorities retain GKey 6 as power increase. GKey 1 creates a visible
            // response without teaching this presentation host any vehicle dynamics.
            session.FeedKeyCode(6, true); // throttle/collective up
            session.FeedKeyCode(1, true); // push / forward cyclic
        }
        PoseSnapshot before = session.CapturePose();
        session.AdvanceSeconds(seconds);
        PoseSnapshot after = session.CapturePose();
        double dx = after.Player.X - before.Player.X;
        double dy = after.Player.Y - before.Player.Y;
        double dz = after.Player.Z - before.Player.Z;
        double moved = Math.Sqrt(dx * dx + dy * dy + dz * dz);
        Console.WriteLine(
            $"smoke ok · mission={UnityMissionSelection.Argument(session.Mission)} " +
            $"t={after.SimulationTimeS:F2}s tick={after.Tick} " +
            $"alt_ft={after.PlayerAltitudeFt:F0} moved_m={moved:F1} " +
            $"ammo={after.AmmoRounds} control={after.ControlBalance:F2} " +
            $"nr={after.RotorRpm:F0} opponent={after.OpponentPresent} " +
            $"status={after.Lifecycle}");
        if (!session.IsActive) return 2;
        if (after.Tick <= before.Tick) return 3;
        switch (session.Mission) {
            case UnityMissionKind.Cobra:
                if (after.RotorRpm < 100.0) return 4;
                break;
            case UnityMissionKind.FirstMerge:
                if (!after.OpponentPresent) return 5;
                break;
            case UnityMissionKind.Rapier:
                if (!after.OpponentPresent
                    || !after.CatapultActive
                    || after.CatapultProgress <= before.CatapultProgress) return 6;
                break;
            case UnityMissionKind.WeekendRide:
                if (after.OpponentPresent
                    || after.VehicleSpeedMps <= before.VehicleSpeedMps
                    || after.CircuitLengthM <= 0.0
                    || string.IsNullOrWhiteSpace(
                        ((IWeekendHostSession)session).RouteJson)) return 8;
                break;
            default:
                return 7;
        }
        return 0;
    }

    static int RunServer(IHostSession session, int port) {
        var listener = new TcpListener(IPAddress.Loopback, port);
        listener.Start();
        Console.WriteLine($"listening on {WireCodec.DefaultHost}:{port}");
        Console.Out.Flush();
        Console.WriteLine("waiting for Unity client (or Ctrl+C)…");
        Console.Out.Flush();

        while (true) {
            using TcpClient client = listener.AcceptTcpClient();
            client.NoDelay = true;
            using NetworkStream stream = client.GetStream();
            Console.WriteLine("client connected");
            Console.Out.Flush();
            ServeClient(session, stream);
            Console.WriteLine("client disconnected — waiting for next");
            Console.Out.Flush();
        }
    }

    static void ServeClient(IHostSession session, NetworkStream stream) {
        if (session is IWeekendHostSession weekend) {
            try {
                // Same immutable v1 JSON returned by Web. Unity caches it and all following
                // frames stay compact pose/context snapshots.
                stream.Write(WireCodec.EncodeRawLengthPrefixed(weekend.RouteJson));
            } catch (IOException) {
                return;
            }
        }

        var clock = Stopwatch.StartNew();
        double simDebt = 0.0;
        long lastMs = clock.ElapsedMilliseconds;

        while (true) {
            long nowMs = clock.ElapsedMilliseconds;
            double wallDt = Math.Clamp((nowMs - lastMs) / 1000.0, 0.0, 0.25);
            lastMs = nowMs;
            simDebt += wallDt;

            try {
                DrainCommands(stream, session);
            } catch (Exception ex) {
                Console.Error.WriteLine($"command drain error: {ex.Message}");
                return;
            }

            while (simDebt >= FrameDt) {
                session.Advance(FrameDt);
                simDebt -= FrameDt;
            }

            PoseSnapshot pose = session.CapturePose();
            byte[] packet = WireCodec.EncodeLengthPrefixed(pose);
            try {
                stream.Write(packet);
            } catch (IOException) {
                return;
            }

            Thread.Sleep(1);
        }
    }

    static void DrainCommands(NetworkStream stream, IHostSession session) {
        while (stream.DataAvailable) {
            if (!WireCodec.TryReadCommand(stream, out WireCodec.WireCommand command)) break;
            switch (command.Type.ToLowerInvariant()) {
                case "key":
                    session.FeedKeyCode(command.Key, command.Pressed);
                    break;
                case "release_weapons":
                    session.ReleaseWeaponsHold();
                    break;
                case "weekend_controls":
                    if (session is IWeekendHostSession weekendControls) {
                        weekendControls.SetControls(
                            command.Throttle,
                            command.Brake,
                            command.Steer,
                            command.RiderLateral,
                            command.RiderForeAft,
                            command.Clutch);
                    }
                    break;
                case "weekend_shift":
                    if (session is IWeekendHostSession weekendShift)
                        weekendShift.FeedShift(command.Direction);
                    break;
                case "weekend_pause":
                    if (session is IWeekendHostSession weekendPause)
                        weekendPause.SetPaused(command.Pressed);
                    break;
                case "weekend_reset":
                    if (session is IWeekendHostSession weekendReset)
                        weekendReset.ResetToGrid();
                    break;
                case "weekend_clutch_mode":
                    if (session is IWeekendHostSession weekendClutch)
                        weekendClutch.SetClutchMode(command.Mode);
                    break;
                case "weekend_control_mode":
                    if (session is IWeekendHostSession weekendMode)
                        weekendMode.SetControlMode(command.Mode);
                    break;
                case "ping":
                    break;
            }
        }
    }

    static IHostSession StartSelectedSession(UnityMissionKind mission) {
        switch (mission) {
            case UnityMissionKind.Cobra:
                return new CobraHostSession(UnityCobraSession.StartRiverGorge());
            case UnityMissionKind.FirstMerge:
                return new FirstMergeHostSession(UnitySimSession.StartFirstMerge());
            case UnityMissionKind.Rapier:
                return new RapierHostSession(UnityRapierSession.StartBeat12());
            case UnityMissionKind.WeekendRide:
                return new WeekendHostSession(UnityWeekendRideSession.StartTrackDay());
            default:
                throw new ArgumentOutOfRangeException(nameof(mission), mission, null);
        }
    }

    interface IHostSession : IDisposable {
        UnityMissionKind Mission { get; }
        string DisplayName { get; }
        string Status { get; }
        bool IsActive { get; }
        void FeedKeyCode(int keyCode, bool pressed);
        void ReleaseWeaponsHold();
        void Advance(double deltaSeconds);
        void AdvanceSeconds(double seconds);
        PoseSnapshot CapturePose();
    }

    interface IWeekendHostSession {
        string RouteJson { get; }
        void SetControls(
            double throttle,
            double brake,
            double steer,
            double riderLateral,
            double riderForeAft,
            double clutch);
        void FeedShift(int direction);
        void SetPaused(bool paused);
        void ResetToGrid();
        void SetClutchMode(int mode);
        void SetControlMode(int mode);
    }

    sealed class CobraHostSession : IHostSession {
        readonly UnityCobraSession _session;
        public CobraHostSession(UnityCobraSession session) => _session = session;
        public UnityMissionKind Mission => UnityMissionKind.Cobra;
        public string DisplayName => "cobra-vietnam River Gorge";
        public string Status => _session.Status.ToString();
        public bool IsActive => _session.Status == CobraMissionStatus.Active;
        public void FeedKeyCode(int keyCode, bool pressed) =>
            _session.FeedKeyCode(keyCode, pressed);
        public void ReleaseWeaponsHold() => _session.ReleaseWeaponsHold();
        public void Advance(double deltaSeconds) => _session.Advance(deltaSeconds);
        public void AdvanceSeconds(double seconds) => _session.AdvanceSeconds(seconds);
        public PoseSnapshot CapturePose() => _session.CapturePose();
        public void Dispose() => _session.Dispose();
    }

    sealed class FirstMergeHostSession : IHostSession {
        readonly UnitySimSession _session;
        public FirstMergeHostSession(UnitySimSession session) => _session = session;
        public UnityMissionKind Mission => UnityMissionKind.FirstMerge;
        public string DisplayName => "korea-1950s First Merge (F-22)";
        public string Status => _session.Lifecycle.ToString();
        public bool IsActive => string.Equals(Status, "Active", StringComparison.Ordinal);
        public void FeedKeyCode(int keyCode, bool pressed) =>
            _session.FeedKeyCode(keyCode, pressed);
        public void ReleaseWeaponsHold() => _session.ReleaseWeaponsHold();
        public void Advance(double deltaSeconds) => _session.Advance(deltaSeconds);
        public void AdvanceSeconds(double seconds) => _session.AdvanceSeconds(seconds);
        public PoseSnapshot CapturePose() => _session.CapturePose();
        public void Dispose() => _session.Dispose();
    }

    sealed class RapierHostSession : IHostSession {
        readonly UnityRapierSession _session;
        public RapierHostSession(UnityRapierSession session) => _session = session;
        public UnityMissionKind Mission => UnityMissionKind.Rapier;
        public string DisplayName => "ukraine-modern Rapier Balloon Intercept";
        public string Status => _session.Lifecycle.ToString();
        public bool IsActive => string.Equals(Status, "Active", StringComparison.Ordinal);
        public void FeedKeyCode(int keyCode, bool pressed) =>
            _session.FeedKeyCode(keyCode, pressed);
        public void ReleaseWeaponsHold() => _session.ReleaseWeaponsHold();
        public void Advance(double deltaSeconds) => _session.Advance(deltaSeconds);
        public void AdvanceSeconds(double seconds) => _session.AdvanceSeconds(seconds);
        public PoseSnapshot CapturePose() => _session.CapturePose();
        public void Dispose() => _session.Dispose();
    }

    sealed class WeekendHostSession : IHostSession, IWeekendHostSession {
        readonly UnityWeekendRideSession _session;
        public WeekendHostSession(UnityWeekendRideSession session) => _session = session;
        public UnityMissionKind Mission => UnityMissionKind.WeekendRide;
        public string DisplayName => "weekend-ride YZF-R1 Closed Circuit";
        public string Status => _session.Phase.ToString();
        public bool IsActive => string.Equals(Status, "Active", StringComparison.Ordinal);
        public string RouteJson => _session.RouteJson;
        public void FeedKeyCode(int keyCode, bool pressed) =>
            _session.FeedKeyCode(keyCode, pressed);
        public void ReleaseWeaponsHold() { }
        public void SetControls(
            double throttle,
            double brake,
            double steer,
            double riderLateral,
            double riderForeAft,
            double clutch
        ) => _session.SetControls(
            throttle, brake, steer, riderLateral, riderForeAft, clutch);
        public void FeedShift(int direction) => _session.FeedShift(direction);
        public void SetPaused(bool paused) => _session.SetPaused(paused);
        public void ResetToGrid() => _session.ResetToGrid();
        public void SetClutchMode(int mode) => _session.SetClutchMode(mode);
        public void SetControlMode(int mode) => _session.SetControlMode(mode);
        public void Advance(double deltaSeconds) => _session.Advance(deltaSeconds);
        public void AdvanceSeconds(double seconds) => _session.AdvanceSeconds(seconds);
        public PoseSnapshot CapturePose() => _session.CapturePose();
        public void Dispose() => _session.Dispose();
    }
}
