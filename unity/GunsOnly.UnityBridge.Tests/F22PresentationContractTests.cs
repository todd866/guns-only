using GunsOnly.UnityBridge;

namespace GunsOnly.UnityBridge.Tests;

public class UnityMissionSelectionTests {
    [Fact]
    public void CommandLine_DefaultsToCobra_AndAcceptsExplicitPrograms() {
        Assert.Equal(UnityMissionKind.Cobra, UnityMissionSelection.FromCommandLine(Array.Empty<string>()));
        Assert.Equal(
            UnityMissionKind.Cobra,
            UnityMissionSelection.FromCommandLine(new[] { "player", "--mission", "cobra" }));
        Assert.Equal(
            UnityMissionKind.FirstMerge,
            UnityMissionSelection.FromCommandLine(new[] { "player", "--mission=first-merge" }));
        Assert.Equal(
            UnityMissionKind.FirstMerge,
            UnityMissionSelection.FromCommandLine(new[] { "player", "-gunsOnlyMission=f22" }));
    }

    [Fact]
    public void CommandLine_FailsClosedOnUnknownMissingOrConflictingPrograms() {
        Assert.Throws<ArgumentException>(() =>
            UnityMissionSelection.FromCommandLine(new[] { "player", "--mission" }));
        Assert.Throws<ArgumentException>(() =>
            UnityMissionSelection.FromCommandLine(new[] { "player", "--mission=carrier" }));
        Assert.Throws<ArgumentException>(() => UnityMissionSelection.FromCommandLine(new[] {
            "player", "--mission=cobra", "--mission=first-merge",
        }));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            UnityMissionSelection.Argument((UnityMissionKind)99));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            UnityMissionSelection.ExpectedMissionPack((UnityMissionKind)99));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            UnityMissionSelection.ThrottleKeyForPhysicalInput((UnityMissionKind)99, wKey: true));
    }

    [Fact]
    public void PhysicalThrottleMapping_IsProgramAwareWithoutChangingGKeyOrdinals() {
        Assert.Equal(7, UnityMissionSelection.ThrottleKeyForPhysicalInput(
            UnityMissionKind.Cobra, wKey: true));
        Assert.Equal(6, UnityMissionSelection.ThrottleKeyForPhysicalInput(
            UnityMissionKind.Cobra, wKey: false));
        Assert.Equal(6, UnityMissionSelection.ThrottleKeyForPhysicalInput(
            UnityMissionKind.FirstMerge, wKey: true));
        Assert.Equal(7, UnityMissionSelection.ThrottleKeyForPhysicalInput(
            UnityMissionKind.FirstMerge, wKey: false));
    }
}

public class FirstMergeBridgeTests {
    [Fact]
    public void FirstMerge_StartsBeatSevenActive_WithF22WireIdentity() {
        using var session = UnitySimSession.StartFirstMerge();
        Assert.Equal(UnitySimSession.FirstMergeBeatIndex, session.BeatIndex);

        PoseSnapshot before = session.CapturePose();
        Assert.Equal("Active", before.Lifecycle);
        Assert.Equal(UnityMissionSelection.FirstMergeMissionPack, before.MissionPack);
        Assert.True(before.OpponentPresent);
        Assert.False(before.PadlockSelected);
        Assert.False(before.GunSolution);
        Assert.Equal(0, before.PlayerHits);

        session.FeedKeyCode(9, true);
        session.FeedKeyCode(9, false);
        PoseSnapshot padlocked = session.CapturePose();
        Assert.True(padlocked.PadlockSelected);

        session.FeedKeyCode(6, true);
        session.AdvanceSeconds(0.5);
        session.FeedKeyCode(6, false);
        PoseSnapshot after = session.CapturePose();
        Assert.True(after.Tick > before.Tick);
        Assert.Equal("Active", after.Lifecycle);

        PoseSnapshot decoded = WireCodec.DecodeFrame(WireCodec.EncodeFrame(after));
        Assert.Equal(UnityMissionSelection.FirstMergeMissionPack, decoded.MissionPack);
        Assert.Equal(after.Tick, decoded.Tick);
        Assert.True(decoded.PadlockSelected);
        Assert.Equal(after.GunSolution, decoded.GunSolution);
        Assert.Equal(after.PlayerHits, decoded.PlayerHits);
    }
}

public class F22PresentationContractTests {
    [Fact]
    public void CameraAndOutputConstants_MatchWebFlightView() {
        Assert.Equal(66f, F22PresentationContract.CockpitVerticalFovDeg);
        Assert.Equal(0.06f, F22PresentationContract.CockpitNearClipM);
        Assert.Equal(680000f, F22PresentationContract.CockpitFarClipM);
        Assert.Equal(1.02f, F22PresentationContract.ToneMappingExposure);
        Assert.Equal(3600f, F22PresentationContract.ShadowDistanceM);
        Assert.InRange(F22PresentationContract.ClearAirFogDensity, 0.0000197f, 0.0000199f);

        F22Vector3 sun = F22PresentationContract.SunDirectionUnity;
        double length = Math.Sqrt(sun.X * sun.X + sun.Y * sun.Y + sun.Z * sun.Z);
        Assert.InRange(length, 0.999999, 1.000001);
        Assert.True(sun.Z < 0f);
    }

    [Fact]
    public void CanopyReflection_IsForwardOfEye_AndMovesSymmetricallyWithLookAzimuth() {
        ReflectionPose centre = F22PresentationContract.ReflectionForAzimuth(0f);
        Assert.True(centre.ZUnity > 0f, "Unity +Z is forward; the reflection must not sit behind the eye");
        Assert.Equal(1.28f, centre.ZUnity, 3);

        ReflectionPose right = F22PresentationContract.ReflectionForAzimuth((float)(Math.PI / 2));
        ReflectionPose left = F22PresentationContract.ReflectionForAzimuth((float)(-Math.PI / 2));
        Assert.Equal(0.34f, right.X, 3);
        Assert.Equal(-right.X, left.X, 3);
        Assert.Equal(1.42f, right.ZUnity, 3);
        Assert.Equal(right.ZUnity, left.ZUnity, 3);
        Assert.Equal(-right.YawRadUnity, left.YawRadUnity, 3);
        Assert.True(right.YawRadUnity > 0f);
    }

    [Fact]
    public void ContinuousFuselageLoft_HasExactWebTopologyAndConnectedStationBands() {
        LoftStation[] stations = F22PresentationContract.CreateFuselageStations();
        LoftData loft = F22PresentationContract.BuildLoft(
            stations, F22PresentationContract.FuselageRadialSegments);

        Assert.Equal(8, loft.StationCount);
        Assert.Equal(18, loft.RadialSegments);
        Assert.Equal(8 * 18, loft.Vertices.Length);
        Assert.Equal(7 * 18 * 6, loft.Indices.Length);
        Assert.Equal(-5.65f, loft.Vertices.Min(vertex => vertex.Z), 3);
        Assert.Equal(6.65f, loft.Vertices.Max(vertex => vertex.Z), 3);
        Assert.Equal(-0.82f, loft.Vertices.Min(vertex => vertex.X), 3);
        Assert.Equal(0.82f, loft.Vertices.Max(vertex => vertex.X), 3);
        Assert.All(loft.Vertices, vertex => {
            Assert.True(float.IsFinite(vertex.X));
            Assert.True(float.IsFinite(vertex.Y));
            Assert.True(float.IsFinite(vertex.Z));
        });
        Assert.All(loft.Indices, index => Assert.InRange(index, 0, loft.Vertices.Length - 1));
        AssertConnectedBands(loft);
    }

    [Fact]
    public void ContinuousNacelleLoft_HasExactWebTopologyAndNoMidBodyGap() {
        LoftData loft = F22PresentationContract.BuildLoft(
            F22PresentationContract.CreateNacelleStations(),
            F22PresentationContract.NacelleRadialSegments);
        Assert.Equal(4 * 14, loft.Vertices.Length);
        Assert.Equal(3 * 14 * 6, loft.Indices.Length);
        AssertConnectedBands(loft);
    }

    static void AssertConnectedBands(LoftData loft) {
        int cursor = 0;
        for (int station = 0; station < loft.StationCount - 1; station++) {
            int first = station * loft.RadialSegments;
            int second = first + loft.RadialSegments;
            for (int segment = 0; segment < loft.RadialSegments; segment++) {
                int next = (segment + 1) % loft.RadialSegments;
                Assert.Equal(new[] {
                    first + segment, second + segment, first + next,
                    first + next, second + segment, second + next,
                }, loft.Indices[cursor..(cursor + 6)]);
                cursor += 6;
            }
        }
        Assert.Equal(loft.Indices.Length, cursor);
    }
}

public class UnityF22PlayerWiringTests {
    [Fact]
    public void PlayerSelectionAndHostSpawn_UseTheSharedMissionContract() {
        string root = FindRepositoryRoot();
        string bootstrap = File.ReadAllText(Path.Combine(
            root, "unity/GunsOnly.Unity/Assets/Scripts/CobraCanyonBootstrap.cs"));
        string hostClient = File.ReadAllText(Path.Combine(
            root, "unity/GunsOnly.Unity/Assets/Scripts/HostClient.cs"));
        string keyboard = File.ReadAllText(Path.Combine(
            root, "unity/GunsOnly.Unity/Assets/Scripts/KeyboardInput.cs"));

        Assert.Contains("UnityMissionSelection.FromCommandLine", bootstrap);
        Assert.Contains("case UnityMissionKind.Cobra", bootstrap);
        Assert.Contains("case UnityMissionKind.FirstMerge", bootstrap);
        Assert.Contains("UnityMissionSelection.Argument(Mission)", hostClient);
        Assert.Contains("UnityMissionSelection.MatchesMissionPack", hostClient);
        Assert.Contains("UnityMissionSelection.ThrottleKeyForPhysicalInput", keyboard);
        Assert.Contains("KeyCode.V => Padlock", keyboard);
    }

    [Fact]
    public void FirstMergeCameraCanopyAndLoft_AreWiredToTheTestedContract() {
        string root = FindRepositoryRoot();
        string firstMerge = File.ReadAllText(Path.Combine(
            root, "unity/GunsOnly.Unity/Assets/Scripts/FirstMergeBootstrap.cs"));
        string canopy = File.ReadAllText(Path.Combine(
            root, "unity/GunsOnly.Unity/Assets/Scripts/F22CanopyGlass.cs"));
        string jet = File.ReadAllText(Path.Combine(
            root, "unity/GunsOnly.Unity/Assets/Scripts/BrowserParityJet.cs"));

        Assert.Contains("F22PresentationContract.CockpitVerticalFovDeg", firstMerge);
        Assert.Contains("F22PresentationContract.CockpitNearClipM", firstMerge);
        Assert.Contains("F22PresentationContract.CockpitFarClipM", firstMerge);
        Assert.Contains("AddComponent<F22OutputTransform>", firstMerge);
        Assert.DoesNotContain("AtmosphereExtras.Build", firstMerge);
        Assert.Contains("F22PresentationContract.ReflectionForAzimuth", canopy);
        Assert.Contains("lookRotation * Vector3.forward", canopy);
        Assert.Contains("F22PresentationContract.BuildLoft", jet);

        Assert.True(File.Exists(Path.Combine(
            root, "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/F22Canopy.shader")));
        Assert.True(File.Exists(Path.Combine(
            root, "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/F22OutputTransform.shader")));
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
