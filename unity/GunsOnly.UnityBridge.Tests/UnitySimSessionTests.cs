using GunsOnly.Sim.Cobra;
using GunsOnly.UnityBridge;

namespace GunsOnly.UnityBridge.Tests;

public class UnityCobraSessionTests {
    [Fact]
    public void RiverGorge_StartsActive_WithHostileContactAndMoves() {
        using var session = UnityCobraSession.StartRiverGorge();

        Assert.Equal(CobraMissionStatus.Active, session.Status);
        PoseSnapshot before = session.CapturePose();
        Assert.Equal("cobra-vietnam", before.MissionPack);
        Assert.True(before.AmmoRounds > 0);

        session.FeedKeyCode(6, true); // collective up
        session.FeedKeyCode(1, true); // forward cyclic
        session.AdvanceSeconds(2.0);
        PoseSnapshot after = session.CapturePose();

        Assert.Equal(CobraMissionStatus.Active, session.Status);
        double moved = Distance(before.Player, after.Player);
        Assert.True(moved > 5.0 || Math.Abs(after.Player.Y - before.Player.Y) > 3.0,
            $"expected ownship to translate or climb in 2 s, moved {moved:F1} m dy={after.Player.Y - before.Player.Y:F1}");
        Assert.True(after.Player.Y > 50.0,
            $"expected canyon altitude, got Y={after.Player.Y:F1} m");
        Assert.True(after.RotorRpm > 100.0);
    }

    [Fact]
    public void RiverGorge_AcceptsCollectiveAndTriggerKeys() {
        using var session = UnityCobraSession.StartRiverGorge();
        session.FeedKeyCode(8, true);
        session.AdvanceSeconds(0.25);
        session.FeedKeyCode(8, false);
        session.FeedKeyCode(6, true);
        session.AdvanceSeconds(0.5);
        session.FeedKeyCode(6, false);
        Assert.Equal(CobraMissionStatus.Active, session.Status);
    }

    [Fact]
    public void WireFrame_RoundTripsCobraPoseFields() {
        using var session = UnityCobraSession.StartRiverGorge();
        session.AdvanceSeconds(0.1);
        PoseSnapshot pose = session.CapturePose();
        string json = WireCodec.EncodeFrame(pose);
        PoseSnapshot decoded = WireCodec.DecodeFrame(json);
        Assert.Equal(pose.Tick, decoded.Tick);
        Assert.Equal(pose.Player.X, decoded.Player.X, 3);
        Assert.Equal(pose.Player.Y, decoded.Player.Y, 3);
        Assert.Equal(pose.Player.Z, decoded.Player.Z, 3);
        Assert.Equal(pose.MissionPack, decoded.MissionPack);
        Assert.Equal(pose.AmmoRounds, decoded.AmmoRounds);
        Assert.Equal(pose.RotorRpm, decoded.RotorRpm, 1);
        Assert.True(decoded.ClearanceM >= 0.0);
        Assert.True(decoded.FobRangeM >= 0.0);
        Assert.NotNull(decoded.Units);
        Assert.True(decoded.Units!.Length > 0);
    }

    [Fact]
    public void RiverGorge_TriggerOutsideEnvelope_DoesNotDrainAmmo() {
        using var session = UnityCobraSession.StartRiverGorge();
        // Cobra no longer exposes or fires on the preferred seam before a pilot designation.
        session.FeedKeyCode(CobraGoldenPathTracker.CycleTargetInputCode, true);
        session.FeedKeyCode(CobraGoldenPathTracker.CycleTargetInputCode, false);
        // Build 299 spawns the selected hostile inside the turret envelope. Drive a deterministic
        // pedal turn first so this test continues to exercise the safety interlock, not a stale
        // assumption about mission placement.
        session.FeedKeyCode(5, true);
        session.AdvanceSeconds(5.0);
        session.FeedKeyCode(5, false);
        session.AdvanceSeconds(0.25);
        PoseSnapshot before = session.CapturePose();
        Assert.Equal("outoflimits", before.GunStatus);
        int ammo0 = before.AmmoRounds;
        // Point roughly opposite the nearest hostile if we can, else just hold trigger —
        // spawn geometry often starts outside envelope for the closest mark.
        session.FeedKeyCode(8, true);
        session.AdvanceSeconds(1.0);
        session.FeedKeyCode(8, false);
        PoseSnapshot after = session.CapturePose();
        if (after.GunStatus is "outoflimits" or "nosolution" or "none") {
            Assert.Equal(ammo0, after.AmmoRounds);
        }
    }

    [Fact]
    public void WireFrame_RoundTripsGunStatus() {
        using var session = UnityCobraSession.StartRiverGorge();
        PoseSnapshot pose = session.CapturePose();
        Assert.False(string.IsNullOrEmpty(pose.GunStatus));
        PoseSnapshot decoded = WireCodec.DecodeFrame(WireCodec.EncodeFrame(pose));
        Assert.Equal(pose.GunStatus, decoded.GunStatus);
    }

    [Fact]
    public void RiverGorge_CollectiveTravelsAtBrowserLeverRate() {
        using var session = UnityCobraSession.StartRiverGorge();
        double c0 = session.Collective;
        Assert.True(c0 < 0.85, $"hover collective too high to measure rate: {c0:F2}");
        session.FeedKeyCode(6, true); // collective pull (increase)
        session.AdvanceSeconds(0.25);
        session.FeedKeyCode(6, false);
        double dc = session.Collective - c0;
        // Browser: 0.40 full travel / s → 0.10 in 0.25 s. Old Unity path was ~1.8/s.
        Assert.InRange(dc, 0.08, 0.12);
    }

    [Fact]
    public void RiverGorge_IdleCyclicLevelsLatchedPitch() {
        using var session = UnityCobraSession.StartRiverGorge();
        session.FeedKeyCode(1, true); // forward cyclic
        session.AdvanceSeconds(0.6);
        session.FeedKeyCode(1, false);
        double pitched = Math.Abs(session.CapturePose().PitchDeg);
        Assert.True(pitched > 4.0, $"expected latched pitch after forward cyclic, got {pitched:F1}");
        session.AdvanceSeconds(2.0);
        double after = Math.Abs(session.CapturePose().PitchDeg);
        Assert.True(after < pitched * 0.55,
            $"idle leveling should cut pitch {pitched:F1}→{after:F1}");
    }

    static double Distance(Vec3 player, Vec3 other) {
        double dx = player.X - other.X;
        double dy = player.Y - other.Y;
        double dz = player.Z - other.Z;
        return Math.Sqrt(dx * dx + dy * dy + dz * dz);
    }
}
