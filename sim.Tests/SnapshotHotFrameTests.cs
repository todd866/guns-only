using System.Text.Json;
using GunsOnly.Sim.Casevac;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Golden agreement between the per-frame hot buffer and the authoritative JSON snapshot. The hot
/// path intentionally duplicates BuildState's derivation prologue, and these tests are the drift
/// guard: for real sessions across beats (including the recovery-platform block and live tracers),
/// every layout slot must carry exactly the value the parsed JSON field carries — booleans as 1/0,
/// JSON null as NaN, conditional blocks matching key presence, tracer regions element-wise equal.
/// Runs in the same collection as SnapshotProjectionTests because both drive SnapshotProjection's
/// latched statics.
/// </summary>
[Collection("snapshot-projection-statics")]
public class SnapshotHotFrameTests {
    sealed class FlatTerrain : ITerrainSurface {
        public TerrainBounds Bounds =>
            new(-1_000_000.0, 1_000_000.0, -1_000_000.0, 1_000_000.0);
        public double HorizontalResolutionM => 100.0;

        public bool TrySample(double eastM, double northM, out TerrainSample sample) {
            sample = new TerrainSample(0.0, new Vec3D(0.0, 1.0, 0.0));
            return true;
        }
    }

    static SimulationSession StartSession(int beatIndex, ITerrainSurface? terrain) {
        var session = new SimulationSession(beatIndex, Carrier.DeckConfiguration.Angled,
            KoreaWeatherPresets.ForBeat(beatIndex));
        session.Begin();
        if (terrain is not null) session.SetTerrainSurface(terrain);
        return session;
    }

    static (JsonElement Root, double[] Buffer, JsonDocument Document) Project(
        SimulationSession session) {
        string json = SnapshotProjection.BuildState(session, Carrier.DeckConfiguration.Angled,
            0.0, 0.0, false, null);
        var buffer = new double[SnapshotHotFrame.SlotCount];
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        JsonDocument document = JsonDocument.Parse(json);
        return (document.RootElement, buffer, document);
    }

    static void AssertNumberEqual(string name, double expected, double actual) =>
        Assert.True(expected.Equals(actual),
            $"{name}: JSON {expected:R} != slot {actual:R}");

    static void AssertHotFrameMatchesJson(JsonElement root, double[] buffer) {
        using JsonDocument layoutDocument = JsonDocument.Parse(SnapshotHotFrame.LayoutJson());
        JsonElement layout = layoutDocument.RootElement;
        Assert.Equal(13, layout.GetProperty("layout_version").GetInt32());
        Assert.Equal(SnapshotHotFrame.SlotCount, layout.GetProperty("slot_count").GetInt32());

        bool casevac = root.TryGetProperty("casevac_mission", out JsonElement casevacMission)
            && casevacMission.GetBoolean();
        JsonElement casevacBlock = layout.GetProperty("casevac_block");
        int casevacPresenceIndex =
            casevacBlock.GetProperty("presence_index").GetInt32();
        if (casevac) {
            Assert.Equal(1.0, buffer[casevacPresenceIndex]);
            foreach (JsonElement slot in
                casevacBlock.GetProperty("slots").EnumerateArray()) {
                string name = slot.GetProperty("name").GetString()!;
                int index = slot.GetProperty("index").GetInt32();
                string kind = slot.GetProperty("kind").GetString()!;
                Assert.True(root.TryGetProperty(name, out JsonElement field),
                    $"casevac.{name}: JSON key missing");
                switch (kind) {
                    case "boolean":
                        Assert.True(buffer[index] is 0.0 or 1.0,
                            $"{name}: boolean slot holds {buffer[index]}");
                        Assert.Equal(field.GetBoolean(), buffer[index] != 0.0);
                        break;
                    case "nullable":
                        if (field.ValueKind == JsonValueKind.Null)
                            Assert.True(double.IsNaN(buffer[index]),
                                $"{name}: JSON null but slot holds {buffer[index]}");
                        else
                            AssertNumberEqual(name, field.GetDouble(), buffer[index]);
                        break;
                    default:
                        AssertNumberEqual(name, field.GetDouble(), buffer[index]);
                        break;
                }
            }

            foreach (string combatKey in new[] {
                "bx",
                "bandit_alive",
                "ammo",
                "tracers",
                "opponent_tracers",
                "gun_trajectory"
            })
                Assert.False(root.TryGetProperty(combatKey, out _),
                    $"CASEVAC projection leaked combat key {combatKey}");
            return;
        }

        Assert.Equal(0.0, buffer[casevacPresenceIndex]);
        foreach (JsonElement block in layout.GetProperty("blocks").EnumerateArray()) {
            int presenceIndex = block.GetProperty("presence_index").GetInt32();
            bool present = presenceIndex < 0 || buffer[presenceIndex] != 0.0;
            string blockName = block.GetProperty("name").GetString()!;

            foreach (JsonElement slot in block.GetProperty("slots").EnumerateArray()) {
                string name = slot.GetProperty("name").GetString()!;
                int index = slot.GetProperty("index").GetInt32();
                string kind = slot.GetProperty("kind").GetString()!;
                bool hasField = root.TryGetProperty(name, out JsonElement field);

                if (!present) {
                    Assert.False(hasField,
                        $"{blockName}.{name}: absent block but JSON key exists");
                    continue;
                }
                Assert.True(hasField, $"{blockName}.{name}: JSON key missing");

                switch (kind) {
                    case "boolean":
                        Assert.True(buffer[index] is 0.0 or 1.0,
                            $"{name}: boolean slot holds {buffer[index]}");
                        Assert.Equal(field.GetBoolean(), buffer[index] != 0.0);
                        break;
                    case "nullable":
                        if (field.ValueKind == JsonValueKind.Null)
                            Assert.True(double.IsNaN(buffer[index]),
                                $"{name}: JSON null but slot holds {buffer[index]}");
                        else
                            AssertNumberEqual(name, field.GetDouble(), buffer[index]);
                        break;
                    default:
                        AssertNumberEqual(name, field.GetDouble(), buffer[index]);
                        break;
                }
            }
        }

        foreach (JsonElement tracer in layout.GetProperty("tracers").EnumerateArray()) {
            string fieldName = tracer.GetProperty("field").GetString()!;
            int countIndex = tracer.GetProperty("count_index").GetInt32();
            int start = tracer.GetProperty("start").GetInt32();
            JsonElement rounds = root.GetProperty(fieldName);
            int count = (int)buffer[countIndex];
            Assert.Equal(rounds.GetArrayLength(), count);
            for (int r = 0; r < count; r++) {
                JsonElement round = rounds[r];
                Assert.Equal(6, round.GetArrayLength());
                for (int c = 0; c < 6; c++)
                    Assert.Equal(round[c].GetDouble(), buffer[start + r * 6 + c]);
            }
        }

        foreach (JsonElement sampleArray in layout.GetProperty("sample_arrays").EnumerateArray()) {
            string fieldName = sampleArray.GetProperty("field").GetString()!;
            int start = sampleArray.GetProperty("start").GetInt32();
            string[] keys = sampleArray.GetProperty("keys").EnumerateArray()
                .Select(k => k.GetString()!).ToArray();
            JsonElement samples = root.GetProperty(fieldName);
            Assert.Equal(sampleArray.GetProperty("samples").GetInt32(),
                samples.GetArrayLength());
            for (int i = 0; i < samples.GetArrayLength(); i++)
                for (int k = 0; k < keys.Length; k++)
                    AssertNumberEqual($"{fieldName}[{i}].{keys[k]}",
                        samples[i].GetProperty(keys[k]).GetDouble(),
                        buffer[start + i * keys.Length + k]);
        }
    }

    [Theory]
    [InlineData(7, false)]  // F-22 modern visual-merge beat: merge block present, no carrier
    [InlineData(5, false)]  // carrier recovery beat: full carrier block
    [InlineData(1, false)]  // grammar/physics slice beat
    [InlineData(4, false)]  // balloon-glider prototype: no engine, alternate pack identity
    [InlineData(6, false)]  // emergency-gear maintenance beat: maintenance block present
    [InlineData(8, false)]  // drone-raid defense: drone_detail block present
    [InlineData(9, false)]  // modern ace duel capstone
    [InlineData(10, false)] // Rapier fixed strip: recovery present, maritime carrier false
    [InlineData(13, false)] // flight-first CASEVAC: separate commander-safe hot block
    [InlineData(7, true)]   // terrain surface drives radar_alt/below_ground paths
    public void HotFrameAgreesWithJsonAcrossBeatsAndSteps(int beatIndex, bool withTerrain) {
        SimulationSession session = StartSession(beatIndex,
            withTerrain ? new FlatTerrain() : null);
        foreach (int steps in new[] { 1, 7, 30, 120, 600 }) {
            for (int tick = 0; tick < steps; tick++) session.StepFixed();
            var (root, buffer, document) = Project(session);
            using (document) AssertHotFrameMatchesJson(root, buffer);
        }
    }

    [Fact]
    public void CasevacReadyFrameKeepsDestinationEnergyPlanAbsentUntilBegin() {
        var session = new SimulationSession(
            13,
            Carrier.DeckConfiguration.Angled,
            KoreaWeatherPresets.ForBeat(13));

        var (readyRoot, readyBuffer, readyDocument) = Project(session);
        using (readyDocument) {
            Assert.Equal(
                JsonValueKind.Null,
                readyRoot.GetProperty(
                    "casevac_destination_energy_target_id").ValueKind);
            Assert.Equal(
                JsonValueKind.Null,
                readyRoot.GetProperty(
                    "casevac_destination_energy_transit_s").ValueKind);
            Assert.Equal(
                JsonValueKind.Null,
                readyRoot.GetProperty(
                    "casevac_destination_reserve_kwh").ValueKind);
            AssertHotFrameMatchesJson(readyRoot, readyBuffer);
        }

        session.Begin();
        session.StepFixed();
        var (activeRoot, activeBuffer, activeDocument) = Project(session);
        using (activeDocument) {
            Assert.Equal(
                JsonValueKind.String,
                activeRoot.GetProperty(
                    "casevac_destination_energy_target_id").ValueKind);
            Assert.Equal(
                JsonValueKind.Number,
                activeRoot.GetProperty(
                    "casevac_destination_energy_transit_s").ValueKind);
            Assert.Equal(
                JsonValueKind.Number,
                activeRoot.GetProperty(
                    "casevac_destination_reserve_kwh").ValueKind);
            AssertHotFrameMatchesJson(activeRoot, activeBuffer);
        }
    }

    [Fact]
    public void FixedStripHotFramePublishesRecoveryPlatformWithoutMaritimeCarrier() {
        SimulationSession session = StartSession(10, null);
        for (int tick = 0; tick < 30; tick++) session.StepFixed();
        var (root, buffer, document) = Project(session);
        using (document) {
            Assert.True(root.GetProperty("recovery_platform").GetBoolean());
            Assert.False(root.GetProperty("carrier").GetBoolean());
            Assert.Equal("FIXED_ARRESTING_STRIP",
                root.GetProperty("platform_kind").GetString());

            using JsonDocument layoutDocument =
                JsonDocument.Parse(SnapshotHotFrame.LayoutJson());
            JsonElement recoveryBlock = layoutDocument.RootElement.GetProperty("blocks")
                .EnumerateArray()
                .Single(block =>
                    block.GetProperty("name").GetString() == "recovery_platform");
            int presenceIndex = recoveryBlock.GetProperty("presence_index").GetInt32();
            Assert.Equal(1.0, buffer[presenceIndex]);

            int SlotIndex(string name) => recoveryBlock.GetProperty("slots").EnumerateArray()
                .Single(slot => slot.GetProperty("name").GetString() == name)
                .GetProperty("index").GetInt32();
            Assert.Equal(1.0, buffer[SlotIndex("recovery_platform")]);
            Assert.Equal(0.0, buffer[SlotIndex("carrier")]);
            AssertHotFrameMatchesJson(root, buffer);
        }
    }

    [Fact]
    public void HotFrameAgreesWithJsonWhileFiring() {
        // Beat 1 has no visual-merge interlock, so a held trigger puts rounds in the air at once
        // and the tracer regions get live (non-empty) golden coverage.
        SimulationSession session = StartSession(1, null);
        session.FeedKey(GKey.Trigger, true);
        bool sawRoundsInFlight = false;
        for (int burst = 0; burst < 40; burst++) {
            for (int tick = 0; tick < 30; tick++) session.StepFixed();
            sawRoundsInFlight |= session.PlayerGun.RoundsInFlight.Count > 0
                || session.OpponentGun.RoundsInFlight.Count > 0;
            var (root, buffer, document) = Project(session);
            using (document) AssertHotFrameMatchesJson(root, buffer);
            if (sawRoundsInFlight && burst > 2) break;
        }
        Assert.True(sawRoundsInFlight, "no rounds in flight during 10 s of held trigger");
    }

    [Fact]
    public void SlotOneSeparatesSelectedDamageAndAggregatesFormationWeaponTelemetry() {
        SimulationSession session = StartSession(7, null);
        Assert.Single(session.Wingmen);
        Assert.True(session.SetPlayerGunTargetSlot(0));

        GunKill playerGun = session.PlayerGun;
        long primaryTargetId = playerGun.SelectedTargetId;
        var shooter = new AircraftState(
            Vec3D.Zero, 0.0, 0.0, 0.0, 0.0,
            FlightModel.F22APublicDataSurrogate.MassKg,
            QuaternionD.Identity);
        var syntheticPrimary = shooter with {
            Position = new Vec3D(0.0, 0.0, 100.0)
        };
        var primaryTargets = new[] {
            new GunTarget(primaryTargetId, syntheticPrimary)
        };

        playerGun.Step(true, shooter, primaryTargetId, primaryTargets, 0.0);
        for (int tick = 0; tick < AircraftSim.TickHz
            && playerGun.DamageFor(primaryTargetId).HitCount == 0; tick++)
            playerGun.Step(false, shooter, primaryTargetId, primaryTargets,
                SimulationSession.FixedDeltaSeconds);
        Assert.Equal(1, playerGun.DamageFor(primaryTargetId).HitCount);

        Assert.True(session.SetPlayerGunTargetSlot(1));
        Assert.Equal(0, playerGun.HitCount);
        Assert.Equal(1, playerGun.TotalHitCount);

        Wingman wingman = session.Wingmen[0];
        var offAxisPlayer = shooter with {
            Position = new Vec3D(500.0, 0.0, 500.0)
        };
        wingman.Gun.Step(true, shooter, offAxisPlayer, 0.0);
        Assert.Single(wingman.Gun.RoundsInFlight);
        Assert.Empty(session.OpponentGun.RoundsInFlight);
        session.RecordPlayerHitsForTest(1);

        var (root, buffer, document) = Project(session);
        using (document) {
            Assert.Equal(1,
                root.GetProperty("selected_player_gun_target_slot").GetInt32());
            Assert.Equal(1, root.GetProperty("hits").GetInt32());
            Assert.Equal(0, root.GetProperty("selected_target_hits").GetInt32());
            Assert.Equal(1, root.GetProperty("opponent_hits").GetInt32());
            Assert.Single(root.GetProperty("opponent_tracers").EnumerateArray());
            Assert.Equal(
                Geometry.Range(session.Player.State, wingman.Bandit.State),
                root.GetProperty("range_m").GetDouble(),
                1);

            using JsonDocument layoutDocument =
                JsonDocument.Parse(SnapshotHotFrame.LayoutJson());
            JsonElement layout = layoutDocument.RootElement;
            Assert.Equal(13, layout.GetProperty("layout_version").GetInt32());
            JsonElement[] slots = layout.GetProperty("blocks")
                .EnumerateArray()
                .SelectMany(block => block.GetProperty("slots").EnumerateArray())
                .ToArray();
            int SlotIndex(string name) => slots
                .Single(slot => slot.GetProperty("name").GetString() == name)
                .GetProperty("index").GetInt32();
            Assert.Equal(1.0, buffer[SlotIndex("selected_player_gun_target_slot")]);
            Assert.Equal(1.0, buffer[SlotIndex("hits")]);
            Assert.Equal(0.0, buffer[SlotIndex("selected_target_hits")]);
            Assert.Equal(1.0, buffer[SlotIndex("opponent_hits")]);
            AssertHotFrameMatchesJson(root, buffer);
        }
    }

    [Fact]
    public void SharedFormationDamageDrivesPlayerHealthAndAliveInBothProjections() {
        SimulationSession session = StartSession(7, null);
        session.RecordPlayerHitsForTest(session.Beat.CombatRules.PlayerHitsToDefeat);
        session.StepFixed();

        Assert.Equal(0.0, session.PlayerHealth);
        Assert.False(session.PlayerAlive);
        Assert.NotEqual(AircraftTerminalState.Flying, session.PlayerTerminalState);

        var (root, buffer, document) = Project(session);
        using (document) {
            Assert.Equal(0.0, root.GetProperty("player_health").GetDouble());
            Assert.False(root.GetProperty("player_alive").GetBoolean());
            using JsonDocument layoutDocument =
                JsonDocument.Parse(SnapshotHotFrame.LayoutJson());
            JsonElement[] slots = layoutDocument.RootElement.GetProperty("blocks")
                .EnumerateArray()
                .SelectMany(block => block.GetProperty("slots").EnumerateArray())
                .ToArray();
            int SlotIndex(string name) => slots
                .Single(slot => slot.GetProperty("name").GetString() == name)
                .GetProperty("index").GetInt32();
            Assert.Equal(0.0, buffer[SlotIndex("player_health")]);
            Assert.Equal(0.0, buffer[SlotIndex("player_alive")]);
            AssertHotFrameMatchesJson(root, buffer);
        }
    }

    [Fact]
    public void FormationCoordinationProjectsColdRolesAndHotPictureAge() {
        SimulationSession coordinated = StartSession(7, null);
        bool sawUsableDelayedPicture = false;
        for (int tick = 0; tick < 8 * AircraftSim.TickHz; tick++) {
            coordinated.StepFixed();
            if (coordinated.FormationCoordinationAgeSeconds is { } ageSeconds
                && ageSeconds > SimulationSession.FixedDeltaSeconds
                && !coordinated.FormationCoordinationStale) {
                sawUsableDelayedPicture = true;
                break;
            }
        }
        Assert.True(sawUsableDelayedPicture,
            "the formation never exposed a usable communication-aged picture");

        var (root, buffer, document) = Project(coordinated);
        using (document) {
            string[] roles = {
                root.GetProperty("bandit_coordination_role").GetString()!,
                root.GetProperty("w1_coordination_role").GetString()!
            };
            Assert.Contains("PRESSURE", roles);
            Assert.Contains("BRACKET", roles);
            Assert.True(root.GetProperty("formation_coordination_age_s").GetDouble()
                > SimulationSession.FixedDeltaSeconds);
            Assert.False(root.GetProperty("formation_coordination_stale").GetBoolean());
            AssertHotFrameMatchesJson(root, buffer);
        }

        SimulationSession independent = StartSession(9, null);
        independent.StepFixed();
        var (soloRoot, soloBuffer, soloDocument) = Project(independent);
        using (soloDocument) {
            Assert.Equal("NONE",
                soloRoot.GetProperty("bandit_coordination_role").GetString());
            Assert.Equal("NONE",
                soloRoot.GetProperty("w1_coordination_role").GetString());
            Assert.Equal(JsonValueKind.Null,
                soloRoot.GetProperty("formation_coordination_age_s").ValueKind);
            Assert.False(
                soloRoot.GetProperty("formation_coordination_stale").GetBoolean());
            AssertHotFrameMatchesJson(soloRoot, soloBuffer);
        }
    }

    // Build 64 reconciliation: the HUD projects the FPV from vx/vy/vz and the gunsight funnel
    // from gun_trajectory every frame, so both must ride the hot buffer — a 250 ms-stale funnel
    // is a wrong gunsight. Pin them against the JSON while the jet is rolling and pulling, which
    // exercises BallisticFunnelPoint's own-ship rotation integral with non-trivial body rates.
    [Fact]
    public void FunnelTrajectoryAndGroundVelocityRideTheHotPathWhileManeuvering() {
        SimulationSession session = StartSession(7, null);
        session.FeedKey(GKey.RollLeft, true);
        session.FeedKey(GKey.PullUp, true);
        for (int burst = 0; burst < 6; burst++) {
            for (int tick = 0; tick < 45; tick++) session.StepFixed();
            var (root, buffer, document) = Project(session);
            using (document) {
                AssertHotFrameMatchesJson(root, buffer);

                using JsonDocument layoutDocument =
                    JsonDocument.Parse(SnapshotHotFrame.LayoutJson());
                JsonElement layout = layoutDocument.RootElement;
                JsonElement trajectory = layout.GetProperty("sample_arrays")
                    .EnumerateArray()
                    .Single(t => t.GetProperty("field").GetString() == "gun_trajectory");
                int start = trajectory.GetProperty("start").GetInt32();
                Assert.Equal(9, trajectory.GetProperty("samples").GetInt32());

                JsonElement jsonTrajectory = root.GetProperty("gun_trajectory");
                Assert.Equal(9, jsonTrajectory.GetArrayLength());
                for (int i = 0; i < 9; i++) {
                    AssertNumberEqual($"gun_trajectory[{i}].x",
                        jsonTrajectory[i].GetProperty("x").GetDouble(), buffer[start + i * 4]);
                    AssertNumberEqual($"gun_trajectory[{i}].y",
                        jsonTrajectory[i].GetProperty("y").GetDouble(), buffer[start + i * 4 + 1]);
                    AssertNumberEqual($"gun_trajectory[{i}].z",
                        jsonTrajectory[i].GetProperty("z").GetDouble(), buffer[start + i * 4 + 2]);
                    AssertNumberEqual($"gun_trajectory[{i}].r",
                        jsonTrajectory[i].GetProperty("r").GetDouble(), buffer[start + i * 4 + 3]);
                }

                int SlotIndex(string name) => layout.GetProperty("blocks").EnumerateArray()
                    .SelectMany(b => b.GetProperty("slots").EnumerateArray())
                    .Single(slot => slot.GetProperty("name").GetString() == name)
                    .GetProperty("index").GetInt32();
                AssertNumberEqual("vx", root.GetProperty("vx").GetDouble(),
                    buffer[SlotIndex("vx")]);
                AssertNumberEqual("vy", root.GetProperty("vy").GetDouble(),
                    buffer[SlotIndex("vy")]);
                AssertNumberEqual("vz", root.GetProperty("vz").GetDouble(),
                    buffer[SlotIndex("vz")]);
            }
        }
    }

    [Fact]
    public void ColdVersionIsStableAcrossFillsAndBumpsOnLifecycleEdges() {
        SimulationSession session = StartSession(7, null);
        for (int tick = 0; tick < 30; tick++) session.StepFixed();
        var buffer = new double[SnapshotHotFrame.SlotCount];

        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double afterFirst = buffer[SnapshotHotFrame.ColdVersionIndex];
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        Assert.Equal(afterFirst, buffer[SnapshotHotFrame.ColdVersionIndex]);

        session.SetPaused(true);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double afterPause = buffer[SnapshotHotFrame.ColdVersionIndex];
        Assert.True(afterPause > afterFirst, "pause edge did not bump cold_version");

        session.SetPaused(false);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        Assert.True(buffer[SnapshotHotFrame.ColdVersionIndex] > afterPause,
            "unpause edge did not bump cold_version");

        SnapshotHotFrame.Fill(buffer, session, 100.0, 0.0, true);
        Assert.True(buffer[SnapshotHotFrame.ColdVersionIndex] > afterPause + 1,
            "world-origin change did not bump cold_version");
    }

    [Fact]
    public void CasevacHotNumbersAdvanceWithoutColdFetchPerFrameAndColdEdgesStillBump() {
        SimulationSession session = StartSession(13, null);
        session.StepFixed();
        var buffer = new double[SnapshotHotFrame.SlotCount];
        using JsonDocument layoutDocument =
            JsonDocument.Parse(SnapshotHotFrame.LayoutJson());
        JsonElement casevacBlock =
            layoutDocument.RootElement.GetProperty("casevac_block");
        int SlotIndex(string name) => casevacBlock.GetProperty("slots")
            .EnumerateArray()
            .Single(slot => slot.GetProperty("name").GetString() == name)
            .GetProperty("index").GetInt32();
        int tickIndex = SlotIndex("tick");
        int callAgeIndex = SlotIndex("casevac_call_age_s");
        int remainingEnergyIndex =
            SlotIndex("casevac_energy_remaining_kwh");

        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double settledVersion = buffer[SnapshotHotFrame.ColdVersionIndex];
        double firstTick = buffer[tickIndex];
        double firstCallAge = buffer[callAgeIndex];
        double firstRemainingEnergy = buffer[remainingEnergyIndex];

        for (int tick = 0; tick < 30; tick++) {
            session.StepFixed();
            SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
            Assert.Equal(settledVersion,
                buffer[SnapshotHotFrame.ColdVersionIndex]);
        }
        Assert.True(buffer[tickIndex] > firstTick);
        Assert.True(buffer[callAgeIndex] > firstCallAge);
        Assert.True(buffer[remainingEnergyIndex] < firstRemainingEnergy);

        session.SetPaused(true);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double pausedVersion = buffer[SnapshotHotFrame.ColdVersionIndex];
        Assert.True(pausedVersion > settledVersion);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        Assert.Equal(pausedVersion,
            buffer[SnapshotHotFrame.ColdVersionIndex]);

        session.SetPaused(false);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double activeVersion = buffer[SnapshotHotFrame.ColdVersionIndex];
        Assert.True(activeVersion > pausedVersion);

        session.FeedKey(GKey.KnockItOff, true);
        session.FeedKey(GKey.KnockItOff, false);
        session.StepFixed();
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double abortVersion = buffer[SnapshotHotFrame.ColdVersionIndex];
        Assert.True(abortVersion > activeVersion,
            "phase/event/string edge did not bump CASEVAC cold_version");
        Assert.Equal(CasevacPhase.AbortReturn,
            session.CasevacFlight!.Snapshot.Phase);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        Assert.Equal(abortVersion,
            buffer[SnapshotHotFrame.ColdVersionIndex]);
    }

    // The mode string and LSO advisory travel only in the cold JSON but are frame-cadence
    // presentation in carrier beats: an edge between two fallback polls must re-fetch the
    // JSON that same fill, not up to 250 ms later.
    [Fact]
    public void ColdVersionBumpsOnApproachModeEdgesInACarrierBeat() {
        SimulationSession session = StartSession(5, null);
        for (int tick = 0; tick < 30; tick++) session.StepFixed();
        var buffer = new double[SnapshotHotFrame.SlotCount];
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double settled = buffer[SnapshotHotFrame.ColdVersionIndex];

        session.Controls.ApproachMode = !session.Controls.ApproachMode;
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        Assert.True(buffer[SnapshotHotFrame.ColdVersionIndex] > settled,
            "mode FREE<->APPROACH edge did not bump cold_version");

        session.Controls.ApproachMode = !session.Controls.ApproachMode;
        double toggledBack = buffer[SnapshotHotFrame.ColdVersionIndex];
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        Assert.True(buffer[SnapshotHotFrame.ColdVersionIndex] > toggledBack,
            "mode APPROACH<->FREE exit edge did not bump cold_version");
    }
}
