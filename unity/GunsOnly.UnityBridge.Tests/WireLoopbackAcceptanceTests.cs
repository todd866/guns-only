using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using GunsOnly.UnityBridge;

namespace GunsOnly.UnityBridge.Tests;

/// <summary>
/// Fail-closed proof that a real host process serves poses over TCP and accepts input —
/// no Unity Editor, no human Play Mode.
/// </summary>
public class WireLoopbackAcceptanceTests {
    [Theory]
    [InlineData(UnityMissionSelection.CobraArgument, UnityMissionSelection.CobraMissionPack, false, false)]
    [InlineData(UnityMissionSelection.FirstMergeArgument, UnityMissionSelection.FirstMergeMissionPack, false, false)]
    [InlineData(UnityMissionSelection.RapierArgument, UnityMissionSelection.RapierMissionPack, true, false)]
    [InlineData(UnityMissionSelection.WeekendRideArgument, UnityMissionSelection.WeekendRideMissionPack, false, true)]
    public void HostProcess_ServesSelectedMissionPoses_AndAcceptsTrigger(
        string mission,
        string expectedMissionPack,
        bool expectedCatapult,
        bool expectedWeekend) {
        bool expectedCobra = mission == UnityMissionSelection.CobraArgument;
        string hostDll = FindHostDll();
        Assert.True(File.Exists(hostDll), $"missing host dll at {hostDll}");

        int port = FreePort();
        string? dotnet = ResolveDotnet();

        var psi = new ProcessStartInfo {
            FileName = dotnet,
            Arguments = $"\"{hostDll}\" --mission {mission} --port {port}",
            WorkingDirectory = Path.GetDirectoryName(hostDll)!,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };
        string? dotnetRoot = Environment.GetEnvironmentVariable("DOTNET_ROOT");
        if (!string.IsNullOrEmpty(dotnetRoot))
            psi.Environment["DOTNET_ROOT"] = dotnetRoot;

        using var host = Process.Start(psi)
            ?? throw new InvalidOperationException("failed to start host");
        var stdout = new StringBuilder();
        var stderr = new StringBuilder();
        host.OutputDataReceived += (_, e) => { if (e.Data != null) stdout.AppendLine(e.Data); };
        host.ErrorDataReceived += (_, e) => { if (e.Data != null) stderr.AppendLine(e.Data); };
        host.BeginOutputReadLine();
        host.BeginErrorReadLine();

        try {
            Assert.True(
                WaitForListening(stdout, host, TimeSpan.FromSeconds(20)),
                $"host did not print listening. stdout:\n{stdout}\nstderr:\n{stderr}");

            using var client = new TcpClient { NoDelay = true };
            client.Connect(IPAddress.Loopback, port);
            using NetworkStream stream = client.GetStream();
            stream.ReadTimeout = 5000;
            stream.WriteTimeout = 5000;

            stream.Write(WireCodec.EncodeCommand(new WireCodec.WireCommand("release_weapons")));

            if (expectedWeekend) {
                Assert.True(WireCodec.TryReadRawLengthPrefixed(stream, out string routeJson));
                using JsonDocument route = JsonDocument.Parse(routeJson);
                Assert.Equal(UnityMissionSelection.WeekendRouteSchema,
                    route.RootElement.GetProperty("schema").GetString());
                Assert.Equal(UnityMissionSelection.WeekendCircuitId,
                    route.RootElement.GetProperty("id").GetString());
                Assert.True(route.RootElement.TryGetProperty("paddock_access", out _));
                stream.Write(WireCodec.EncodeCommand(new WireCodec.WireCommand(
                    "weekend_controls", Throttle: 1.0, Clutch: 1.0)));
            }

            Assert.True(
                WireCodec.TryReadLengthPrefixed(stream, out PoseSnapshot first),
                $"no first pose. stdout:\n{stdout}\nstderr:\n{stderr}");
            Assert.Equal("Active", first.Lifecycle);
            Assert.Equal(expectedMissionPack, first.MissionPack);
            Assert.Equal(!expectedWeekend && !expectedCobra, first.OpponentPresent);
            if (expectedCobra) Assert.False(first.CobraTargetSelected);
            Assert.True(first.PlayerAltitudeFt > (expectedWeekend ? 200.0 : 500.0));
            Assert.Equal(expectedCatapult, first.CatapultActive);
            if (expectedCatapult) {
                Assert.True(first.RecoveryPlatformPresent);
                Assert.Equal(192.0, first.RecoveryPlatform.Y, 3);
            }

            if (!expectedWeekend) {
                if (expectedCobra) {
                    stream.Write(WireCodec.EncodeCommand(new WireCodec.WireCommand(
                        "key", Key: CobraGoldenPathTracker.CycleTargetInputCode, Pressed: true)));
                    stream.Write(WireCodec.EncodeCommand(new WireCodec.WireCommand(
                        "key", Key: CobraGoldenPathTracker.CycleTargetInputCode, Pressed: false)));
                }
                stream.Write(WireCodec.EncodeCommand(
                    new WireCodec.WireCommand("key", Key: 8, Pressed: true)));
            }
            PoseSnapshot later = first;
            var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(2);
            int frames = 0;
            while (DateTime.UtcNow < deadline) {
                Assert.True(WireCodec.TryReadLengthPrefixed(stream, out later));
                frames++;
            }
            if (!expectedWeekend) {
                stream.Write(WireCodec.EncodeCommand(
                    new WireCodec.WireCommand("key", Key: 8, Pressed: false)));
            }

            Assert.True(frames >= 30, $"expected ≥30 pose frames in 2s, got {frames}");
            Assert.True(later.Tick > first.Tick, "sim tick did not advance");
            Assert.Equal("Active", later.Lifecycle);
            if (expectedCobra) {
                Assert.True(later.CobraTargetSelected);
                Assert.True(later.OpponentPresent);
            }
            if (expectedCatapult) {
                Assert.True(later.CatapultActive);
                Assert.True(later.CatapultProgress > first.CatapultProgress);
            }
            if (expectedWeekend) {
                Assert.True(later.VehicleSpeedMps > first.VehicleSpeedMps);
                Assert.True(later.CircuitLengthM > 1_000.0);
                Assert.InRange(later.CircuitProgressM, 0.0, later.CircuitLengthM);
            }
        } finally {
            try {
                if (!host.HasExited) host.Kill(entireProcessTree: true);
            } catch { /* ignore */ }
        }
    }

    static string ResolveDotnet() {
        string? root = Environment.GetEnvironmentVariable("DOTNET_ROOT");
        if (!string.IsNullOrEmpty(root)) {
            string candidate = Path.Combine(root, "dotnet");
            if (File.Exists(candidate)) return candidate;
        }
        return "dotnet";
    }

    static int FreePort() {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        int port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    static string FindHostDll() {
        string? dir = AppContext.BaseDirectory;
        for (int i = 0; i < 10 && dir is not null; i++) {
            string beside = Path.Combine(dir, "GunsOnly.UnityHost.dll");
            if (File.Exists(beside)) return beside;

            string sln = Path.Combine(dir, "GunsOnly.sln");
            if (File.Exists(sln)) {
                foreach (string cfg in new[] { "Debug", "Release" }) {
                    string built = Path.Combine(dir, "unity", "GunsOnly.UnityHost", "bin", cfg,
                        "net8.0", "GunsOnly.UnityHost.dll");
                    if (File.Exists(built)) return built;
                }
            }
            dir = Directory.GetParent(dir)?.FullName;
        }
        throw new FileNotFoundException("GunsOnly.UnityHost.dll not found — build the host project first");
    }

    static bool WaitForListening(StringBuilder stdout, Process host, TimeSpan timeout) {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline) {
            if (stdout.ToString().Contains("listening on", StringComparison.Ordinal))
                return true;
            if (host.HasExited) return false;
            Thread.Sleep(20);
        }
        return stdout.ToString().Contains("listening on", StringComparison.Ordinal);
    }
}
