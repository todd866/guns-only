using GunsOnly.UnityBridge;

namespace GunsOnly.UnityBridge.Tests;

public class UnityRapierSessionTests {
    [Fact]
    public void Beat12_StartsActive_OnAuthoritativeFixedStripCatapult() {
        using var session = UnityRapierSession.StartBeat12();

        Assert.Equal(UnityRapierSession.RapierBeatIndex, session.BeatIndex);
        PoseSnapshot pose = session.CapturePose();
        Assert.Equal("Active", pose.Lifecycle);
        Assert.Equal(UnityMissionSelection.RapierMissionPack, pose.MissionPack);
        Assert.True(pose.OpponentPresent);
        Assert.True(pose.AmmoRounds > 0);
        Assert.True(pose.RecoveryPlatformPresent);
        Assert.Equal(192.0, pose.RecoveryPlatform.Y, 6);
        Assert.Equal(-Math.PI / 2.0, pose.RecoveryPlatformHeadingRad, 6);
        Assert.True(pose.CatapultActive);
        Assert.Equal(0.0, pose.CatapultProgress, 6);
    }

    [Fact]
    public void Beat12_ProjectsTheSupportedStrokePoseAndMonotoneLaunchProgress() {
        using var session = UnityRapierSession.StartBeat12();
        PoseSnapshot before = session.CapturePose();

        session.AdvanceSeconds(2.0);
        PoseSnapshot after = session.CapturePose();

        Assert.True(after.Tick > before.Tick);
        Assert.True(after.CatapultActive);
        Assert.True(after.CatapultProgress > before.CatapultProgress);
        Assert.InRange(after.CatapultProgress, 0.03, 0.09);
        Assert.True(Distance(after.Player, before.Player) > 20.0,
            "wire pose must follow the constrained 520 m stroke, not stale free-flight state");
        Assert.Equal("Active", after.Lifecycle);
    }

    [Fact]
    public void Beat12_TransmitsTrueBodyLeftSoUnityReflectionPreservesBankFrame() {
        using var session = UnityRapierSession.StartBeat12();
        session.AdvanceSeconds(1.0);
        PoseSnapshot pose = session.CapturePose();

        Assert.InRange(Length(pose.PlayerForward), 0.999999, 1.000001);
        Assert.InRange(Length(pose.PlayerLeft), 0.999999, 1.000001);
        Assert.InRange(Math.Abs(Dot(pose.PlayerForward, pose.PlayerLeft)), 0.0, 1e-9);

        Vec3 unityForward = ReflectZ(pose.PlayerForward);
        Vec3 unityLeft = ReflectZ(pose.PlayerLeft);
        Vec3 unityUp = Cross(unityForward, unityLeft);
        Assert.True(unityUp.Y > 0.98,
            $"reflected forward x true-left must point up, got {unityUp}");
    }

    [Fact]
    public void ReflectedTableauFrame_AlignsLaunchStartAndAxisWithAuthoritativePose() {
        using var session = UnityRapierSession.StartBeat12();
        PoseSnapshot pose = session.CapturePose();

        // Exported Web rail start (-70, 0, -20) has already reflected Z in the Unity adapter.
        Vec3 reflectedRailStart = new(-70.0, 0.0, 20.0);
        Vec3 worldRailStart = PlaceTableauPoint(
            reflectedRailStart,
            pose.RecoveryPlatform,
            pose.RecoveryPlatformHeadingRad);
        Assert.Equal(pose.Player.X, worldRailStart.X, 6);
        Assert.Equal(-pose.Player.Z, worldRailStart.Z, 6);

        Vec3 worldLaunchAxis = PlaceTableauDirection(
            new Vec3(0.0, 0.0, 1.0),
            pose.RecoveryPlatformHeadingRad);
        Vec3 unityForward = ReflectZ(pose.PlayerForward);
        double horizontalDot = worldLaunchAxis.X * unityForward.X
            + worldLaunchAxis.Z * unityForward.Z;
        Assert.True(horizontalDot > 0.999,
            $"tableau launch axis must face the authoritative westbound stroke: {horizontalDot}");
    }

    [Fact]
    public void WireFrame_RoundTripsRapierPlatformCatapultAndBodyFrame() {
        using var session = UnityRapierSession.StartBeat12();
        session.AdvanceSeconds(0.75);
        PoseSnapshot pose = session.CapturePose();

        string json = WireCodec.EncodeFrame(pose);
        PoseSnapshot decoded = WireCodec.DecodeFrame(json);

        Assert.Equal(pose.Tick, decoded.Tick);
        Assert.Equal(UnityMissionSelection.RapierMissionPack, decoded.MissionPack);
        Assert.Equal(pose.PlayerLeft, decoded.PlayerLeft);
        Assert.Equal(pose.BanditLeft, decoded.BanditLeft);
        Assert.Equal(pose.RecoveryPlatformPresent, decoded.RecoveryPlatformPresent);
        Assert.Equal(pose.RecoveryPlatform, decoded.RecoveryPlatform);
        Assert.Equal(pose.RecoveryPlatformHeadingRad, decoded.RecoveryPlatformHeadingRad);
        Assert.Equal(pose.CatapultActive, decoded.CatapultActive);
        Assert.Equal(pose.CatapultProgress, decoded.CatapultProgress);
        Assert.Equal(pose.AmmoRounds, decoded.AmmoRounds);
        Assert.Equal(pose.RapierPhaseCode, decoded.RapierPhaseCode);
        Assert.Equal(pose.RapierPhaseToken, decoded.RapierPhaseToken);
        Assert.Equal(pose.RapierCircuitLeg, decoded.RapierCircuitLeg);
        Assert.Equal(pose.RapierRecoveryGate, decoded.RapierRecoveryGate);
        Assert.Equal(pose.RapierAutomationEnabled, decoded.RapierAutomationEnabled);
        Assert.Equal(pose.RapierAutomationActive, decoded.RapierAutomationActive);
        Assert.Equal(pose.RapierJobToken, decoded.RapierJobToken);
        Assert.Equal(pose.RapierDronesRemaining, decoded.RapierDronesRemaining);
        Assert.NotEqual("", decoded.RapierPhaseToken);
        Assert.Contains("\"catapultActive\":true", json);
    }

    [Theory]
    [InlineData("rapier")]
    [InlineData("ukraine-modern")]
    [InlineData("rapier-balloon-intercept")]
    [InlineData("beat-12")]
    public void MissionSelection_ResolvesRapierAliasesAndFixedWingThrottle(string alias) {
        Assert.Equal(UnityMissionKind.Rapier, UnityMissionSelection.FromName(alias));
        Assert.Equal(UnityMissionKind.Rapier, UnityMissionSelection.FromCommandLine(
            new[] { "player", "--mission=" + alias }));
        Assert.Equal(UnityMissionSelection.RapierArgument,
            UnityMissionSelection.Argument(UnityMissionKind.Rapier));
        Assert.Equal(UnityMissionSelection.RapierMissionPack,
            UnityMissionSelection.ExpectedMissionPack(UnityMissionKind.Rapier));
        Assert.Equal(6, UnityMissionSelection.ThrottleKeyForPhysicalInput(
            UnityMissionKind.Rapier, wKey: true));
        Assert.Equal(7, UnityMissionSelection.ThrottleKeyForPhysicalInput(
            UnityMissionKind.Rapier, wKey: false));
    }

    [Fact]
    public void UnityBootstrap_UsesSingleDispatchExactTableauAndOpaqueSensorCamera() {
        string root = FindRepositoryRoot();
        string dispatcher = File.ReadAllText(Path.Combine(
            root, "unity/GunsOnly.Unity/Assets/Scripts/CobraCanyonBootstrap.cs"));
        string bootstrap = File.ReadAllText(Path.Combine(
            root, "unity/GunsOnly.Unity/Assets/Scripts/RapierBeat12Bootstrap.cs"));

        Assert.Contains("case UnityMissionKind.Rapier", dispatcher);
        Assert.Contains("AddComponent<RapierBeat12Bootstrap>", dispatcher);
        Assert.DoesNotContain("RuntimeInitializeOnLoadMethod", bootstrap);
        Assert.Contains("RapierLaunchTableauBuilder.Build", bootstrap);
        Assert.Contains("BindSensorCamera", bootstrap);
        Assert.Contains("pose.PlayerLeftUnity", bootstrap);
        Assert.Contains("Vector3.Cross(forward, left)", bootstrap);
        Assert.Contains("pose.CatapultActive", bootstrap);
        Assert.Contains("new Vector3(1f, 1f, -1f)", bootstrap);
        Assert.Contains("RapierSensorHud.Draw", bootstrap);
        Assert.DoesNotContain("GUI.Label", bootstrap);
        Assert.DoesNotContain("MeshRenderer", bootstrap);
    }

    static Vec3 ReflectZ(Vec3 value) => new(value.X, value.Y, -value.Z);

    static Vec3 PlaceTableauPoint(Vec3 local, Vec3 platform, double headingRad) {
        Vec3 direction = PlaceTableauDirection(local, headingRad);
        return new Vec3(
            platform.X + direction.X,
            platform.Y + local.Y,
            -platform.Z + direction.Z);
    }

    static Vec3 PlaceTableauDirection(Vec3 local, double headingRad) {
        // Bootstrap local Z reflection followed by Unity yaw = -sim heading.
        double x = local.X;
        double z = -local.Z;
        double yaw = -headingRad;
        return new Vec3(
            Math.Cos(yaw) * x + Math.Sin(yaw) * z,
            local.Y,
            -Math.Sin(yaw) * x + Math.Cos(yaw) * z);
    }

    static Vec3 Cross(Vec3 first, Vec3 second) => new(
        first.Y * second.Z - first.Z * second.Y,
        first.Z * second.X - first.X * second.Z,
        first.X * second.Y - first.Y * second.X);

    static double Dot(Vec3 first, Vec3 second) =>
        first.X * second.X + first.Y * second.Y + first.Z * second.Z;

    static double Length(Vec3 value) => Math.Sqrt(Dot(value, value));

    static double Distance(Vec3 first, Vec3 second) {
        double dx = first.X - second.X;
        double dy = first.Y - second.Y;
        double dz = first.Z - second.Z;
        return Math.Sqrt(dx * dx + dy * dy + dz * dz);
    }

    static string FindRepositoryRoot() {
        string? directory = AppContext.BaseDirectory;
        for (int depth = 0; depth < 12 && directory != null; depth++) {
            if (File.Exists(Path.Combine(directory, "global.json"))
                && Directory.Exists(Path.Combine(directory, "unity/GunsOnly.Unity"))) {
                return directory;
            }
            directory = Directory.GetParent(directory)?.FullName;
        }
        throw new DirectoryNotFoundException("guns-only repository root not found");
    }
}
