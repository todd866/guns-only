using GunsOnly.Server;

namespace GunsOnly.Server.Tests;

public sealed class PresenceProtocolTests {
    static PoseMessage ValidPose(long sequence = 1) => new(
        "pose",
        PresenceProtocol.Version,
        sequence,
        120,
        "mission.perch-attack.v1",
        "presentation.vehicle.player.v1",
        "ACTIVE",
        true,
        [100.0, 1200.0, -300.0],
        [0.0, 0.0, 1.0],
        [0.0, 1.0, 0.0]);

    [Fact]
    public void ValidPoseIsNormalizedAndPreserved() {
        PoseMessage message = ValidPose() with {
            Forward = [0.0, 0.0, 0.8],
            Up = [0.0, 1.2, 0.0]
        };

        Assert.True(PresenceProtocol.TryValidatePose(message, 0, out ValidatedPose pose));
        Assert.Equal(1.0, pose.Forward[2], 10);
        Assert.Equal(1.0, pose.Up[1], 10);
        Assert.Equal(message.Position, pose.Position);
        Assert.Equal(message.MissionId, pose.MissionId);
        Assert.True(pose.BodyPresent);
        Assert.Equal("FLYING", pose.TerminalState);
    }

    [Fact]
    public void ReplayedAndNonFinitePosesAreRejected() {
        Assert.False(PresenceProtocol.TryValidatePose(ValidPose(4), 4, out _));
        Assert.False(PresenceProtocol.TryValidatePose(
            ValidPose(5) with { Position = [double.NaN, 0.0, 0.0] }, 4, out _));
        Assert.False(PresenceProtocol.TryValidatePose(
            ValidPose(5) with { Forward = [0.0, 0.0, 0.0] }, 4, out _));
        Assert.False(PresenceProtocol.TryValidatePose(
            ValidPose(5) with { Up = [0.0, 0.0, 1.0] }, 4, out _));
    }

    [Fact]
    public void UntrustedTokensAreBoundedAndCleaned() {
        PoseMessage message = ValidPose() with {
            MissionId = " mission.good<script>alert(1)</script> ",
            PresentationId = new string('x', 300),
            Phase = "PAUSED OR SOMETHING"
        };

        Assert.True(PresenceProtocol.TryValidatePose(message, 0, out ValidatedPose pose));
        Assert.DoesNotContain('<', pose.MissionId);
        Assert.DoesNotContain(' ', pose.Phase);
        Assert.Equal(128, pose.PresentationId.Length);
        Assert.Equal("ACTIVE", pose.Phase);
    }

    [Fact]
    public void HelloRequiresStableBoundedBrowserKey() {
        Assert.True(PresenceProtocol.TryValidateHello(
            new HelloMessage("hello", PresenceProtocol.Version, "browser-1234567890"),
            out string key));
        Assert.Equal("browser-1234567890", key);
        Assert.False(PresenceProtocol.TryValidateHello(
            new HelloMessage("hello", PresenceProtocol.Version, "short"), out _));
    }

    [Fact]
    public void PhysicalPresenceIsSeparateFromCombatLifeAndLifecycleIsWhitelisted() {
        PoseMessage wreck = ValidPose() with {
            Alive = false,
            EntityId = "entity.player.7",
            BodyPresent = true,
            TerminalState = "destroyed_airborne",
            ImpactSurface = "carrier_structure",
            Phase = "PAUSED"
        };
        Assert.True(PresenceProtocol.TryValidatePose(wreck, 0, out ValidatedPose pose));
        Assert.False(pose.Alive);
        Assert.True(pose.BodyPresent);
        Assert.Equal("DESTROYED_AIRBORNE", pose.TerminalState);
        Assert.Equal("entity.player.7", pose.EntityId);
        Assert.Equal("CARRIER_STRUCTURE", pose.ImpactSurface);
        Assert.Equal("PAUSED", pose.Phase);

        PoseMessage settledWithGunHealth = ValidPose() with {
            Alive = true,
            BodyPresent = true,
            TerminalState = "SETTLED"
        };
        Assert.True(PresenceProtocol.TryValidatePose(
            settledWithGunHealth, 0, out ValidatedPose settled));
        Assert.False(settled.BodyPresent);

        PoseMessage legacyLoss = ValidPose() with { Alive = false };
        Assert.True(PresenceProtocol.TryValidatePose(legacyLoss, 0, out ValidatedPose legacy));
        Assert.False(legacy.BodyPresent);
        Assert.Equal("SETTLED", legacy.TerminalState);

        PoseMessage bounded = ValidPose() with {
            Alive = false,
            BodyPresent = true,
            TerminalState = "SIMULATION_BOUNDED",
            ImpactSurface = "not-real"
        };
        Assert.True(PresenceProtocol.TryValidatePose(bounded, 0, out ValidatedPose boundedPose));
        Assert.Equal("SIMULATION_BOUNDARY", boundedPose.ImpactSurface);
    }

    [Fact]
    public void OriginPolicyRequiresAnExactConfiguredOrigin() {
        const string configured = "https://guns-only.vercel.app,http://localhost:8877";
        Assert.True(PresenceProtocol.IsAllowedOrigin(
            "https://guns-only.vercel.app", configured));
        Assert.True(PresenceProtocol.IsAllowedOrigin("http://localhost:8877", configured));
        Assert.False(PresenceProtocol.IsAllowedOrigin("http://localhost:3000", configured));
        Assert.False(PresenceProtocol.IsAllowedOrigin(
            "https://guns-only.vercel.app.evil.test", configured));
        Assert.False(PresenceProtocol.IsAllowedOrigin(
            "https://guns-only.vercel.app/path", configured));
        Assert.False(PresenceProtocol.IsAllowedOrigin(null, configured));
    }

    [Fact]
    public void SectorsAreSeparatedAndBogeysKeepMoving() {
        double[][] origins = Enumerable.Range(0, 12).Select(PresenceProtocol.SectorOrigin).ToArray();
        for (int left = 0; left < origins.Length; left++)
            for (int right = left + 1; right < origins.Length; right++)
                Assert.True(Math.Sqrt(
                    Math.Pow(origins[left][0] - origins[right][0], 2)
                    + Math.Pow(origins[left][2] - origins[right][2], 2))
                    >= PresenceProtocol.SectorSpacingMetres);

        DateTimeOffset created = DateTimeOffset.FromUnixTimeMilliseconds(1_000_000);
        BogeySnapshot[] first = PresenceProtocol.BogeysForSector(2, created, created.AddSeconds(5));
        BogeySnapshot[] later = PresenceProtocol.BogeysForSector(2, created, created.AddSeconds(15));
        Assert.Equal(PresenceProtocol.BogeysPerSector, first.Length);
        Assert.Equal(first[0].BogeyId, later[0].BogeyId);
        Assert.NotEqual(first[0].Position, later[0].Position);
        Assert.Equal("server-world", first[0].Authority);
        Assert.False(first[0].CombatEligible);
    }
}
