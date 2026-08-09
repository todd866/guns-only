using System.Text.Json;
using GunsOnly.UnityBridge;

namespace GunsOnly.UnityBridge.Tests;

public class UnityWeekendRideSessionTests {
    [Fact]
    public void TrackDay_StartsAtZero_OnSharedClosedCircuitContract() {
        using var session = UnityWeekendRideSession.StartTrackDay();

        PoseSnapshot pose = session.CapturePose();
        Assert.Equal(0, pose.Tick);
        Assert.Equal(0.0, pose.SimulationTimeS);
        Assert.Equal("Active", pose.Lifecycle);
        Assert.Equal(UnityMissionSelection.WeekendRideMissionPack, pose.MissionPack);
        Assert.False(pose.OpponentPresent);
        Assert.Equal(1, pose.VehicleGear);
        Assert.True(pose.CircuitLengthM > 1_000.0);
        Assert.Equal(0, pose.LapCount);
        Assert.Equal("↑", pose.WeekendCue);

        using JsonDocument route = JsonDocument.Parse(session.RouteJson);
        JsonElement root = route.RootElement;
        Assert.Equal(UnityMissionSelection.WeekendRouteSchema,
            root.GetProperty("schema").GetString());
        Assert.Equal(UnityMissionSelection.WeekendCircuitId,
            root.GetProperty("id").GetString());
        Assert.Equal("closed-circuit", root.GetProperty("route_kind").GetString());
        Assert.True(root.GetProperty("closed").GetBoolean());
        Assert.True(root.GetProperty("pavement_half_width_m").GetDouble()
                    > root.GetProperty("track_width_m").GetDouble() * 0.5);
        Assert.True(root.GetProperty("centreline").GetArrayLength() > 100);
        JsonElement paddock = root.GetProperty("paddock_access");
        Assert.True(double.IsFinite(paddock.GetProperty("x").GetDouble()));
        Assert.True(double.IsFinite(paddock.GetProperty("heading_rad").GetDouble()));
    }

    [Fact]
    public void TypedThrottle_UsesWebAccumulator_AndProjectsGoldenPathContext() {
        using var session = UnityWeekendRideSession.StartTrackDay();
        session.SetControls(1.0, 0.0, 0.0, 0.0, 0.0, 1.0);

        for (int frame = 0; frame < 60; frame++) session.Advance(1.0 / 60.0);
        PoseSnapshot pose = session.CapturePose();

        Assert.Equal(120, pose.Tick);
        Assert.Equal(1.0, pose.SimulationTimeS, 9);
        Assert.True(pose.VehicleSpeedMps > 0.1);
        Assert.True(pose.EngineRpm > 0.0);
        Assert.InRange(pose.VehicleGear, 1, 6);
        Assert.InRange(pose.CircuitProgressM, 0.0, pose.CircuitLengthM);
        Assert.InRange(pose.NextSectorIndex, 0, 3);
        Assert.True(pose.PlayerForward.X * pose.PlayerLeft.X
                    + pose.PlayerForward.Y * pose.PlayerLeft.Y
                    + pose.PlayerForward.Z * pose.PlayerLeft.Z is > -1e-6 and < 1e-6);
    }

    [Fact]
    public void PauseDoesNotAccumulateDebt_AndResetKeepsWireTickMonotone() {
        using var session = UnityWeekendRideSession.StartTrackDay();
        session.SetPaused(true);
        session.AdvanceSeconds(10.0);
        Assert.Equal(0, session.CapturePose().Tick);

        session.SetPaused(false);
        session.Advance(1.0 / 60.0);
        Assert.Equal(2, session.CapturePose().Tick);

        session.AdvanceSeconds(0.5);
        long beforeReset = session.CapturePose().Tick;
        session.ResetToGrid();
        PoseSnapshot reset = session.CapturePose();
        Assert.Equal(beforeReset, reset.Tick);
        Assert.True(reset.SimulationTimeS >= 0.0);
        Assert.Equal(0.0, reset.VehicleSpeedMps, 6);

        session.Advance(1.0 / 60.0);
        Assert.Equal(beforeReset + 2, session.CapturePose().Tick);
    }

    [Fact]
    public void WeekendPoseAndTypedCommand_RoundTripWithoutRoutePerFrame() {
        using var session = UnityWeekendRideSession.StartTrackDay();
        session.SetControls(0.7, 0.1, -0.4, 0.3, -0.2, 1.0);
        session.Advance(1.0 / 60.0);
        PoseSnapshot pose = session.CapturePose();

        string encoded = WireCodec.EncodeFrame(pose);
        Assert.DoesNotContain("centreline", encoded, StringComparison.OrdinalIgnoreCase);
        PoseSnapshot decoded = WireCodec.DecodeFrame(encoded);
        Assert.Equal(pose.VehicleSpeedMps, decoded.VehicleSpeedMps);
        Assert.Equal(pose.EngineRpm, decoded.EngineRpm);
        Assert.Equal(pose.VehicleGear, decoded.VehicleGear);
        Assert.Equal(pose.CircuitProgressM, decoded.CircuitProgressM);
        Assert.Equal(pose.CircuitLengthM, decoded.CircuitLengthM);
        Assert.Equal(pose.NextSectorIndex, decoded.NextSectorIndex);
        Assert.Equal(pose.LapCount, decoded.LapCount);
        Assert.Equal(pose.WeekendCue, decoded.WeekendCue);

        var command = new WireCodec.WireCommand(
            "weekend_controls",
            Throttle: 0.7,
            Brake: 0.1,
            Steer: -0.4,
            RiderLateral: 0.3,
            RiderForeAft: -0.2,
            Clutch: 1.0);
        using var commandStream = new MemoryStream(WireCodec.EncodeCommand(command));
        Assert.True(WireCodec.TryReadCommand(commandStream, out WireCodec.WireCommand decodedCommand));
        Assert.Equal(command, decodedCommand);

        using var routeStream = new MemoryStream(
            WireCodec.EncodeRawLengthPrefixed(session.RouteJson));
        Assert.True(WireCodec.TryReadRawLengthPrefixed(routeStream, out string decodedRoute));
        Assert.Equal(session.RouteJson, decodedRoute);
    }

    [Theory]
    [InlineData("weekend")]
    [InlineData("weekend-ride")]
    [InlineData("r1")]
    [InlineData("track-day")]
    public void MissionSelection_ResolvesWeekendAliases(string alias) {
        Assert.Equal(UnityMissionKind.WeekendRide, UnityMissionSelection.FromName(alias));
        Assert.Equal(UnityMissionKind.WeekendRide,
            UnityMissionSelection.FromCommandLine(new[] { "player", "--mission", alias }));
        Assert.Equal(UnityMissionSelection.WeekendRideArgument,
            UnityMissionSelection.Argument(UnityMissionKind.WeekendRide));
        Assert.Equal(UnityMissionSelection.WeekendRideMissionPack,
            UnityMissionSelection.ExpectedMissionPack(UnityMissionKind.WeekendRide));
    }

    [Fact]
    public void NativeReachability_UsesOneDispatcher_SharedRoute_AndNoPlaceholderHud() {
        string root = FindRepositoryRoot();
        string dispatcher = File.ReadAllText(Path.Combine(
            root, "unity/GunsOnly.Unity/Assets/Scripts/CobraCanyonBootstrap.cs"));
        string bootstrap = File.ReadAllText(Path.Combine(
            root, "unity/GunsOnly.Unity/Assets/Scripts/WeekendRideBootstrap.cs"));
        string input = File.ReadAllText(Path.Combine(
            root, "unity/GunsOnly.Unity/Assets/Scripts/WeekendRideInput.cs"));
        string renderer = File.ReadAllText(Path.Combine(
            root, "unity/GunsOnly.Unity/Assets/Scripts/WeekendRideCircuitRenderer.cs"));
        string resource = File.ReadAllText(Path.Combine(
            root, "unity/GunsOnly.Unity/Assets/Scripts/WeekendCircuitPresentationResource.cs"));

        Assert.Contains("case UnityMissionKind.WeekendRide", dispatcher);
        Assert.Contains("AddComponent<WeekendRideBootstrap>", dispatcher);
        Assert.DoesNotContain("RuntimeInitializeOnLoadMethod", bootstrap);
        Assert.DoesNotContain("OnGUI", bootstrap);
        Assert.Contains("WeekendR1FirstPersonRig.AttachTo", bootstrap);
        Assert.Contains("WeekendCircuitPresentationResource.Load()", bootstrap);
        Assert.Contains("WeekendRideCircuitRenderer.Build", bootstrap);
        Assert.Contains("WeekendHinterlandRoadRenderer.Attach", bootstrap);
        Assert.Contains("_camera.farClipPlane = (float)_presentation.render_profile.camera.far_m",
            bootstrap);
        Assert.Contains("_camera.allowHDR = true", bootstrap);
        Assert.Contains("output.Configure(_presentation.render_profile)", bootstrap);
        Assert.Contains("RenderSettings.fog = false", bootstrap);
        Assert.Contains("WeekendParityCamera.Attach(_camera)", bootstrap);
        Assert.Contains("_host.WeekendRoute", bootstrap);
        Assert.Contains("KeyCode.W", input);
        Assert.Contains("KeyCode.Q", input);
        Assert.Contains("KeyCode.E", input);
        Assert.Contains("SetWeekendPaused", input);
        Assert.Contains("WeekendCircuitPresentationResource.Load()", renderer);
        Assert.Contains(
            "WeekendCircuitPresentationResource.ValidateRouteOrThrow(presentation, route)",
            renderer);
        Assert.Contains("WeekendCircuitPresentationFrame presentation", renderer);
        Assert.Contains("foreach (WeekendCircuitLeafFrame leaf", renderer);
        Assert.Contains("MatrixFromThree", renderer);
        Assert.Contains("reverse triangle winding once", renderer);
        Assert.Contains("ExpectedSemanticSha256", resource);
        Assert.Contains("frame.scene.leaf_count != 110", resource);
        Assert.DoesNotContain("BuildRibbon", renderer);
        Assert.DoesNotContain("MakeStandard", renderer);
        Assert.DoesNotContain("WeekendRoutePoint {", renderer);
    }

    static string FindRepositoryRoot() {
        string? directory = AppContext.BaseDirectory;
        for (int index = 0; index < 12 && directory != null; index++) {
            if (File.Exists(Path.Combine(directory, "GunsOnly.sln"))) return directory;
            directory = Directory.GetParent(directory)?.FullName;
        }
        throw new DirectoryNotFoundException("GunsOnly repository root not found");
    }
}
