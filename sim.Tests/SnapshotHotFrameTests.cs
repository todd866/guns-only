using System.Reflection;
using System.Text.Json;
using GunsOnly.Sim.Casevac;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Missiles;
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

    sealed class FixedCloudField(CloudSample sample) : ICloudField {
        public CloudSample Sample(in Vec3D worldPositionM, double simulationTimeSeconds) =>
            sample;
    }

    sealed class FixedPrecipitationField(PrecipitationSample sample) : IPrecipitationField {
        public PrecipitationSample Sample(in Vec3D worldPositionM,
            double simulationTimeSeconds) => sample;
    }

    static SimulationSession StartSession(int beatIndex, ITerrainSurface? terrain) {
        var session = new SimulationSession(beatIndex, Carrier.DeckConfiguration.Angled,
            KoreaWeatherPresets.ForBeat(beatIndex));
        session.Begin();
        if (terrain is not null) session.SetTerrainSurface(terrain);
        return session;
    }

    static AircraftState RunwayApproachState(
        ConventionalRunway runway,
        double heightM,
        double alongM = 430.0,
        double forwardMps = 74.0,
        double sinkMps = 2.2) {
        Vec3D velocity = runway.Forward * forwardMps
            + new Vec3D(0.0, -sinkMps, 0.0);
        double speed = velocity.Length;
        Vec3D bodyUp = new(0.0, 1.0, 0.0);
        Vec3D bodyRight = bodyUp.Cross(runway.Forward).Normalized();
        return new AircraftState(
            runway.SurfacePoint(alongM) + new Vec3D(0.0, heightM, 0.0),
            speed,
            Gamma: Math.Asin(velocity.Y / speed),
            Chi: Math.Atan2(velocity.X, velocity.Z),
            Bank: 0.0,
            Mass: FlightModel.F22APublicDataSurrogate.MassKg,
            BodyAttitude: QuaternionD.FromFrame(
                bodyRight, bodyUp, runway.Forward));
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
        Assert.Equal(25, layout.GetProperty("layout_version").GetInt32());
        Assert.Equal(SnapshotHotFrame.SlotCount, layout.GetProperty("slot_count").GetInt32());
        string[] names = layout.GetProperty("blocks")
            .EnumerateArray()
            .SelectMany(block => block.GetProperty("slots").EnumerateArray())
            .Select(slot => slot.GetProperty("name").GetString()!)
            .ToArray();
        Assert.Contains("padlock_preferred_plane_valid", names);
        Assert.Contains("padlock_preferred_plane_deg", names);
        Assert.Contains("rapier_target_gamma_deg", names);
        Assert.Contains("rapier_relight_dynamic_pressure_kpa", names);
        Assert.Contains("opponent_wing_sweep_deg", names);
        Assert.Contains("wing_sweep_mode_code", names);
        Assert.Contains("f14_structural_fatigue_01", names);
        Assert.Contains("aim9_state_code", names);
        Assert.Contains("aim9_vz", names);

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
                        Assert.True(field.GetBoolean() == (buffer[index] != 0.0),
                            $"{name}: JSON={field.GetBoolean()} hot={buffer[index] != 0.0}");
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
                        Assert.True(field.GetBoolean() == (buffer[index] != 0.0),
                            $"{name}: JSON={field.GetBoolean()} hot={buffer[index] != 0.0}");
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
    [InlineData(11, false)] // Rapier Circuits: traffic and event-driven radio
    [InlineData(14, false)] // finite Panther carrier day: route and sortie schedule stay hot
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
    public void PantherRouteEdgesInvalidateColdLabelsAndPublishHotGuidanceImmediately() {
        SimulationSession session = StartSession(14, null);
        var buffer = new double[SnapshotHotFrame.SlotCount];
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double onDeckVersion = buffer[SnapshotHotFrame.ColdVersionIndex];

        for (int tick = 0; tick < 15 * AircraftSim.TickHz
            && !session.CarrierSortieRtbAvailable; tick++)
            session.StepFixed();
        Assert.True(session.CarrierSortieRtbAvailable);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double departureVersion = buffer[SnapshotHotFrame.ColdVersionIndex];
        Assert.True(departureVersion > onDeckVersion,
            "ON_DECK route/sortie labels did not refresh at catapult handoff");

        session.FeedKey(GKey.KnockItOff, true);
        session.FeedKey(GKey.KnockItOff, false);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        Assert.True(buffer[SnapshotHotFrame.ColdVersionIndex] > departureVersion,
            "RETURN route/fix labels did not refresh on the RTB edge");

        using JsonDocument layoutDocument = JsonDocument.Parse(
            SnapshotHotFrame.LayoutJson());
        JsonElement[] slots = layoutDocument.RootElement.GetProperty("blocks")
            .EnumerateArray()
            .SelectMany(block => block.GetProperty("slots").EnumerateArray())
            .ToArray();
        int SlotIndex(string name) => slots
            .Single(slot => slot.GetProperty("name").GetString() == name)
            .GetProperty("index").GetInt32();
        Assert.Equal(1.0, buffer[SlotIndex("carrier_sortie_route_active")]);
        Assert.Equal(6.0, buffer[SlotIndex("carrier_sortie_route_phase_code")]);
        Assert.Equal(4.0, buffer[SlotIndex("carrier_sortie_route_fix_code")]);
        Assert.Equal(1.0, buffer[SlotIndex("carrier_sortie_route_rtb_requested")]);
        Assert.Equal(1.0, buffer[SlotIndex("straight_deck_barrier_armed")]);

        using JsonDocument stateDocument = JsonDocument.Parse(
            SnapshotProjection.BuildState(session, Carrier.DeckConfiguration.Axial,
                0.0, 0.0, false, null));
        Assert.Equal("RETURN", stateDocument.RootElement
            .GetProperty("carrier_sortie_route_phase").GetString());
        Assert.Equal("RETURN_INITIAL", stateDocument.RootElement
            .GetProperty("carrier_sortie_route_fix").GetString());
    }

    [Fact]
    public void NoOpponentMissionKeepsHotAndColdSnapshotsNeutralWithoutAHiddenActor() {
        BeatSetup circuits = Beats.RapierCircuits(
            Carrier.DeckConfiguration.Angled) with {
            OpponentPresence = OpponentPresence.None
        };
        var session = new SimulationSession();
        session.StartBeat(() => circuits);
        session.Begin();
        Assert.False(session.OpponentPresent);
        Assert.True(session.TrySelectMeshPlace(
            "place.ukraine.crimea-coast-survey.v1"));

        var (root, buffer, document) = Project(session);
        using (document) {
            Assert.False(root.GetProperty("opponent_present").GetBoolean());
            Assert.Equal(JsonValueKind.Null,
                root.GetProperty("bandit_entity_id").ValueKind);
            Assert.Equal(0.0, root.GetProperty("range_m").GetDouble());
            Assert.False(root.GetProperty("gun_solution").GetBoolean());
            AssertHotFrameMatchesJson(root, buffer);
        }
    }

    [Fact]
    public void HotAndJsonSnapshotsPublishIndependentPrecipitationAndSurfaceTruth() {
        WeatherProfile baseline = KoreaWeatherPresets.ForBeat(1);
        var cloud = new CloudSample(
            cloudFraction01: 0.6,
            extinctionPerMetre: 0.001,
            liquidWaterKgPerM3: 0.0005,
            iceWaterKgPerM3: 0.0,
            visibilityM: 4_000.0,
            precipitationMmPerHour: 1.234,
            turbulenceVelocityMps: Vec3D.Zero,
            verticalAirVelocityMps: 0.0,
            icingHazard01: 0.2,
            lightningHazard01: 0.0);
        var rates = new HydrometeorRates(
            rainMmWaterEquivalentPerHour: 1.111,
            snowMmWaterEquivalentPerHour: 2.222,
            freezingDrizzleMmWaterEquivalentPerHour: 0.333,
            freezingRainMmWaterEquivalentPerHour: 0.444,
            icePelletsMmWaterEquivalentPerHour: 0.555,
            graupelMmWaterEquivalentPerHour: 0.666,
            hailMmWaterEquivalentPerHour: 0.777);
        var precipitation = new PrecipitationSample(
            rates,
            extinctionPerMetre: 0.004321,
            visibilityM: 1_200.4);
        var surface = new SurfaceConditionSample(
            surfaceTemperatureK: 268.15,
            snowWaterEquivalentM: 0.045,
            snowDepthM: 0.18,
            snowDensityKgPerM3: 250.0,
            snowAgeSeconds: 86_400.0,
            snowLiquidWaterFraction01: 0.08,
            snowCrust01: 0.35,
            surfaceWetness01: 0.2,
            standingWaterDepthM: 0.003,
            slushDepthM: 0.012,
            glazeIceThicknessM: 0.0015,
            mudDepthM: 0.025,
            frictionCoefficient: 0.22,
            brakingFactor01: 0.38);
        var weather = new WeatherProfile(
            baseline.Atmosphere,
            baseline.Wind,
            new FixedCloudField(cloud),
            terrain: baseline.Terrain,
            id: "weather.snapshot-winter-test.v1",
            precipitation: new FixedPrecipitationField(precipitation),
            surfaceConditions: new UniformSurfaceConditionField(surface));
        var session = new SimulationSession(
            1,
            Carrier.DeckConfiguration.Angled,
            weather);
        session.Begin();

        var (root, buffer, document) = Project(session);
        using (document) {
            Assert.Equal(1_200.4, root.GetProperty("visibility_m").GetDouble());
            Assert.Equal(1.234, root.GetProperty("precipitation_mm_hr").GetDouble());
            Assert.Equal(6.108, root
                .GetProperty("precipitation_total_mm_water_equivalent_hr").GetDouble());
            Assert.Equal(1.111, root
                .GetProperty("precipitation_rain_mm_water_equivalent_hr").GetDouble());
            Assert.Equal(2.222, root
                .GetProperty("precipitation_snow_mm_water_equivalent_hr").GetDouble());
            Assert.Equal(0.004321, root
                .GetProperty("precipitation_extinction_per_m").GetDouble());
            Assert.Equal(1_200.4, root
                .GetProperty("precipitation_visibility_m").GetDouble());
            Assert.Equal(268.15, root.GetProperty("surface_temperature_k").GetDouble());
            Assert.Equal(0.045, root.GetProperty("snow_water_equivalent_m").GetDouble());
            Assert.Equal(0.18, root.GetProperty("snow_depth_m").GetDouble());
            Assert.Equal(0.0015, root.GetProperty("glaze_ice_thickness_m").GetDouble());
            Assert.Equal(0.22, root
                .GetProperty("surface_friction_coefficient").GetDouble());
            Assert.Equal(0.38, root.GetProperty("surface_braking_factor_01").GetDouble());
            AssertHotFrameMatchesJson(root, buffer);
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
    public void CircuitsLaunchStaysRadioSilentAndMatchesHotState() {
        SimulationSession session = StartSession(11, null);
        var buffer = new double[SnapshotHotFrame.SlotCount];
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double settled = buffer[SnapshotHotFrame.ColdVersionIndex];

        session.StepFixed();
        var (root, after, document) = Project(session);
        using (document) {
            Assert.True(after[SnapshotHotFrame.ColdVersionIndex] >= settled);
            Assert.False(root.GetProperty("radio_active").GetBoolean());
            Assert.Equal("", root.GetProperty("radio_id").GetString());
            // First-generation Circuits field names remain aliases for older browser bundles.
            Assert.False(root.GetProperty("rapier_radio_active").GetBoolean());
            Assert.Equal("", root.GetProperty("rapier_radio_id").GetString());
            AssertHotFrameMatchesJson(root, after);
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
    public void F22GearOnlySurrogateKeepsElectricalCapabilityOutOfColdAndHotState() {
        SimulationSession session = StartSession(7, null);
        var (root, buffer, document) = Project(session);
        using (document) {
            Assert.True(root.GetProperty("has_retractable_gear").GetBoolean());
            Assert.False(root.GetProperty("has_electrical_system").GetBoolean());
            Assert.False(root.GetProperty("primary_bus_powered").GetBoolean());

            using JsonDocument layoutDocument =
                JsonDocument.Parse(SnapshotHotFrame.LayoutJson());
            int primaryBusIndex = layoutDocument.RootElement.GetProperty("blocks")
                .EnumerateArray()
                .SelectMany(block => block.GetProperty("slots").EnumerateArray())
                .Single(slot =>
                    slot.GetProperty("name").GetString() == "primary_bus_powered")
                .GetProperty("index").GetInt32();
            Assert.Equal(0.0, buffer[primaryBusIndex]);
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
            Assert.Equal(25, layout.GetProperty("layout_version").GetInt32());
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

    // Build 264 production evidence: opponent_rounds_fired froze at 7 for a whole engagement while
    // four more tracer bursts flew with the wingman alive, because every opponent_* weapon field is
    // the PRIMARY ship's gun and no w1_* gunnery field existed at all. "The bandit never shoots"
    // was therefore a statement about the lead only. Pin per-ship attribution: a wingman that fires
    // while the lead holds fire must be visible AS the wingman, in both wire formats.
    [Fact]
    public void WingmanGunneryIsAttributedPerShipWhileTheLeadHoldsFire() {
        SimulationSession session = StartSession(7, null);
        Assert.Single(session.Wingmen);

        Wingman wingman = session.Wingmen[0];
        var shooter = new AircraftState(
            Vec3D.Zero, 0.0, 0.0, 0.0, 0.0,
            FlightModel.Su27SPublicDataSurrogate.MassKg,
            QuaternionD.Identity);
        var offAxisPlayer = shooter with {
            Position = new Vec3D(500.0, 0.0, 500.0)
        };
        wingman.TriggerDown = true;
        wingman.Gun.Step(true, shooter, offAxisPlayer, 0.0);

        Assert.Equal(1, wingman.Gun.RoundsFired);
        Assert.Equal(0, session.OpponentGun.RoundsFired);
        Assert.False(session.OpponentTriggerDown);

        var (root, buffer, document) = Project(session);
        using (document) {
            Assert.Equal(1, root.GetProperty("w1_rounds_fired").GetInt32());
            Assert.Equal(1, root.GetProperty("w1_trigger_down").GetInt32());
            Assert.Equal(1, root.GetProperty("w1_gun_firing").GetInt32());
            Assert.Equal(wingman.Gun.AmmoRemaining,
                root.GetProperty("w1_ammo").GetInt32());
            Assert.Equal(0, root.GetProperty("w1_hits").GetInt32());

            // The lead-only aggregates must stay at zero: that divergence IS the finding.
            Assert.Equal(0, root.GetProperty("opponent_rounds_fired").GetInt32());
            Assert.False(root.GetProperty("opponent_trigger_down").GetBoolean());
            Assert.False(root.GetProperty("opponent_gun_firing").GetBoolean());
            // The honestly formation-wide fields must see it.
            Assert.True(root.GetProperty("formation_gun_firing").GetBoolean());
            Assert.Single(root.GetProperty("opponent_tracers").EnumerateArray());

            // Unoccupied contact slots publish a neutral gunnery block, not a stale one.
            foreach (string prefix in new[] { "w2", "w3" }) {
                Assert.Equal(0, root.GetProperty($"{prefix}_present").GetInt32());
                Assert.Equal(0, root.GetProperty($"{prefix}_rounds_fired").GetInt32());
                Assert.Equal(0, root.GetProperty($"{prefix}_gun_firing").GetInt32());
                Assert.Equal(0, root.GetProperty($"{prefix}_ammo").GetInt32());
            }

            using JsonDocument layoutDocument =
                JsonDocument.Parse(SnapshotHotFrame.LayoutJson());
            JsonElement[] slots = layoutDocument.RootElement.GetProperty("blocks")
                .EnumerateArray()
                .SelectMany(block => block.GetProperty("slots").EnumerateArray())
                .ToArray();
            int SlotIndex(string name) => slots
                .Single(slot => slot.GetProperty("name").GetString() == name)
                .GetProperty("index").GetInt32();
            Assert.Equal(1.0, buffer[SlotIndex("w1_rounds_fired")]);
            Assert.Equal(1.0, buffer[SlotIndex("w1_gun_firing")]);
            Assert.Equal(0.0, buffer[SlotIndex("opponent_rounds_fired")]);
            Assert.Equal(1.0, buffer[SlotIndex("formation_gun_firing")]);
            Assert.Equal(0.0, buffer[SlotIndex("w2_rounds_fired")]);
            AssertHotFrameMatchesJson(root, buffer);
        }
    }

    // The sortie ledgers are the answer to "a session max() over rounds_fired understates the
    // total, because every per-engagement weapon graph resets". They must bank a wingman's fire
    // that the lead-only counter never sees, and must be monotone across a stepped tick.
    [Fact]
    public void SortieLedgersBankFormationFireThatTheLeadCounterNeverSees() {
        SimulationSession session = StartSession(7, null);
        Wingman wingman = session.Wingmen[0];
        var shooter = new AircraftState(
            Vec3D.Zero, 0.0, 0.0, 0.0, 0.0,
            FlightModel.Su27SPublicDataSurrogate.MassKg,
            QuaternionD.Identity);
        wingman.Gun.Step(true, shooter, shooter with {
            Position = new Vec3D(500.0, 0.0, 500.0)
        }, 0.0);
        Assert.Equal(1, wingman.Gun.RoundsFired);

        session.StepFixed();

        var (root, buffer, document) = Project(session);
        using (document) {
            Assert.True(root.GetProperty("sortie_opponent_rounds_fired").GetInt32() >= 1,
                "the sortie ledger missed a wingman round the lead counter cannot carry");
            Assert.True(root.GetProperty("sortie_rounds_fired").GetInt32() >= 0);
            Assert.True(root.GetProperty("sortie_hits").GetInt32() >= 0);
            AssertHotFrameMatchesJson(root, buffer);
        }
    }

    // service_life_max_g read 0 against an 11.91 G Build 264 sortie. Root cause: the service-life
    // recorder only begins on a scripted-intercept (Rapier) mission and only publishes a record
    // once one has been FINALIZED, so on an ordinary fighter beat the whole block is a zero
    // default. Pin both halves — the honest zero and its explanation, and a live envelope that
    // actually measures the jet that flew.
    [Fact]
    public void LoadFactorEnvelopeIsLiveWhereTheServiceLifeRecordIsRapierScoped() {
        SimulationSession session = StartSession(7, null);
        session.FeedKey(GKey.PullUp, true);
        for (int tick = 0; tick < 3 * AircraftSim.TickHz; tick++)
            session.StepFixed();

        Assert.False(session.RapierMissionAvailable);
        Assert.False(session.RapierServiceLife.Active);
        Assert.True(session.SortiePeakLoadFactorG > 1.5,
            $"the sortie never pulled G: peak {session.SortiePeakLoadFactorG:F3}");

        var (root, buffer, document) = Project(session);
        using (document) {
            Assert.False(root.GetProperty("service_life_capture_active").GetBoolean());
            Assert.False(root.GetProperty("service_life_record_available").GetBoolean());
            Assert.Equal(0.0, root.GetProperty("service_life_max_g").GetDouble());
            Assert.True(root.GetProperty("sortie_peak_g").GetDouble() > 1.5);
            Assert.True(root.GetProperty("sortie_min_g").GetDouble()
                <= root.GetProperty("sortie_peak_g").GetDouble());
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

    /// Production Build 260 (owner flight, cold 1v2): w1_present and w1_alive dropped to 0 at
    /// EXACTLY the tick the PRIMARY died. Promotion is immediate by pinned contract
    /// (ForcedLeaderDefeatPromotesSurvivorImmediatelyWithoutTerminalDelay): the survivor leaves
    /// Wingmen[0] and becomes the opponent in the same tick — so the w1 slot emptied, and the
    /// killed primary detached into _detachedOpponentWrecks, WHICH NEITHER WIRE FORMAT
    /// PROJECTED. Net effect on the wire: an airframe the player is looking at blinks out of
    /// existence at the kill instant. The formation slots must instead keep every airframe that
    /// still physically exists: live wingmen first, then still-falling detached wrecks
    /// (present=1, alive=0 — the exact encoding a shot-down but-still-listed wingman already
    /// uses, so no consumer learns a new state).
    [Fact]
    public void PromotionKeepsEveryAirframeOnTheWire() {
        SimulationSession session = StartSession(7, null);
        Assert.Single(session.Wingmen);
        IBandit survivor = session.Wingmen[0].Bandit;
        Vec3D killPosition = session.Bandit.State.Position;

        session.ForceOpponentDefeatForTest();
        // The pinned promotion contract: the survivor is the opponent immediately.
        Assert.Same(survivor, session.Bandit);
        Assert.Empty(session.Wingmen);
        session.StepFixed();

        var (root, buffer, document) = Project(session);
        using (document) {
            // The living ship stays on the wire as the opponent.
            Assert.True(root.GetProperty("opponent_present").GetBoolean());
            Assert.Equal(
                survivor.State.Position.X, root.GetProperty("bx").GetDouble(), 1);
            // The airframe the player just killed keeps falling on the wire: the freed w1
            // slot carries the detached wreck instead of despawning it mid-air.
            Assert.Equal(1, root.GetProperty("w1_present").GetInt32());
            Assert.Equal(0, root.GetProperty("w1_alive").GetInt32());
            double wreckDriftM = Math.Sqrt(
                Math.Pow(root.GetProperty("w1x").GetDouble() - killPosition.X, 2.0)
                + Math.Pow(root.GetProperty("w1y").GetDouble() - killPosition.Y, 2.0)
                + Math.Pow(root.GetProperty("w1z").GetDouble() - killPosition.Z, 2.0));
            Assert.True(wreckDriftM < 60.0,
                $"w1 should carry the falling ex-primary near its kill position; it is "
                + $"{wreckDriftM:F0} m away");
            AssertHotFrameMatchesJson(root, buffer);
        }
    }

    /// The formation slot a falling wreck occupies is that airframe's identity on the wire: the
    /// renderer is keyed by SLOT (app.js reads w1x/w2x/w3x) and no entity id is projected for
    /// these slots, so a wreck that changes slot teleports across the sky with nothing able to
    /// detect the substitution. The wreck list mutates constantly under a live fight — an egressed
    /// wreck is REMOVED mid-step, an overflowing list evicts a settled hulk, and a wreck simply
    /// settling drops out of the slot-eligible set — and every one of those shifts the positional
    /// offset of every LATER wreck. Slot ownership must therefore follow the airframe, not its
    /// index in a list that moves under it.
    [Fact]
    public void AFallingWreckKeepsItsFormationSlotWhenTheWreckListMutates() {
        SimulationSession session = StartSession(7, null);
        Assert.Single(session.Wingmen);

        session.ForceOpponentDefeatForTest();
        session.StepFixed();
        // Kill the promoted survivor too, so two airframes are falling at once.
        session.ForceOpponentDefeatForTest();
        for (int tick = 0; tick < 3600 && session.DetachedOpponentWrecks.Count < 2; tick++)
            session.StepFixed();
        Assert.Equal(2, session.DetachedOpponentWrecks.Count);

        DetachedOpponentWreck first = session.DetachedOpponentWrecks[0];
        DetachedOpponentWreck second = session.DetachedOpponentWrecks[1];
        int firstSlot = FormationSlotOf(session, first);
        int secondSlot = FormationSlotOf(session, second);
        Assert.InRange(firstSlot, 0, 2);
        Assert.InRange(secondSlot, 0, 2);
        Assert.NotEqual(firstSlot, secondSlot);

        Vec3D secondPosition = second.Aircraft.Position;
        // The earlier wreck comes to rest — an ordinary end for a falling airframe, and the same
        // list edit an egress removal or an overflow eviction makes.
        first.TerminalState = AircraftTerminalState.Settled;

        Assert.Null(FormationSlotOfOrNull(session, first));
        Assert.Equal(secondSlot, FormationSlotOf(session, second));
        var (root, buffer, document) = Project(session);
        using (document) {
            string prefix = $"w{secondSlot + 1}";
            Assert.Equal(1, root.GetProperty($"{prefix}_present").GetInt32());
            Assert.Equal(0, root.GetProperty($"{prefix}_alive").GetInt32());
            Assert.Equal(secondPosition.X, root.GetProperty($"{prefix}x").GetDouble(), 1);
            Assert.Equal(secondPosition.Z, root.GetProperty($"{prefix}z").GetDouble(), 1);
            AssertHotFrameMatchesJson(root, buffer);
        }
    }

    static int? FormationSlotOfOrNull(SimulationSession session, DetachedOpponentWreck wreck) {
        for (int slot = 0; slot < 3; slot++)
            if (ReferenceEquals(session.DetachedWreckForFormationSlot(slot), wreck)) return slot;
        return null;
    }

    static int FormationSlotOf(SimulationSession session, DetachedOpponentWreck wreck) =>
        FormationSlotOfOrNull(session, wreck)
            ?? throw new Xunit.Sdk.XunitException("the wreck occupies no formation slot");

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
            // Two DISTINCT fields, and both must ride the wire. formation_coordination_stale keeps
            // its Build-264 behavioural meaning so cross-build comparison stays honest; the health
            // watchdog is a new field beside it rather than a redefinition of the old one.
            Assert.False(
                root.GetProperty("formation_coordination_health_stale").GetBoolean());
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
            Assert.False(
                soloRoot.GetProperty("formation_coordination_health_stale")
                    .GetBoolean());
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
    public void TopGunAim9PoseRidesHotPathAndSeekerNamesRefreshOnEveryStateEdge() {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.TopGunAcm(TopGunSeat.F14A));
        session.Begin();
        var buffer = new double[SnapshotHotFrame.SlotCount];
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double safeVersion = buffer[SnapshotHotFrame.ColdVersionIndex];

        Assert.True(session.LaunchFoxTwo());
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double seekingVersion = buffer[SnapshotHotFrame.ColdVersionIndex];
        Assert.True(seekingVersion > safeVersion,
            "SAFE -> SEEKING did not refresh the cold seeker-state string");

        session.SeedActiveAim9ForProximityHitForTest();
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double trackingVersion = buffer[SnapshotHotFrame.ColdVersionIndex];
        Assert.True(trackingVersion > seekingVersion,
            "SEEKING -> TRACKING did not refresh the cold seeker-state string");
        var (trackingRoot, trackingBuffer, trackingDocument) = Project(session);
        using (trackingDocument) {
            Assert.Equal("TRACKING",
                trackingRoot.GetProperty("aim9_seeker_state").GetString());
            Assert.Equal((int)Aim9FlightState.Tracking,
                trackingRoot.GetProperty("aim9_state_code").GetInt32());
            Assert.True(trackingRoot.GetProperty("aim9_pose_valid").GetBoolean());
            AssertHotFrameMatchesJson(trackingRoot, trackingBuffer);
        }

        session.StepFixed();
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        Assert.True(buffer[SnapshotHotFrame.ColdVersionIndex] > trackingVersion,
            "TRACKING -> DETONATED did not refresh the cold seeker-state string");
        var (detonatedRoot, detonatedBuffer, detonatedDocument) = Project(session);
        using (detonatedDocument) {
            Assert.Equal("DETONATED",
                detonatedRoot.GetProperty("aim9_seeker_state").GetString());
            Assert.Equal((int)Aim9FlightState.Detonated,
                detonatedRoot.GetProperty("aim9_state_code").GetInt32());
            AssertHotFrameMatchesJson(detonatedRoot, detonatedBuffer);
        }
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
        int rotorWashIntensityIndex =
            SlotIndex("casevac_rotor_wash_intensity_01");
        int rotorWashRadiusIndex =
            SlotIndex("casevac_rotor_wash_radius_m");
        int escapeCueIndex =
            SlotIndex("casevac_show_escape_cue");

        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double settledVersion = buffer[SnapshotHotFrame.ColdVersionIndex];
        double firstTick = buffer[tickIndex];
        double firstCallAge = buffer[callAgeIndex];
        double firstRemainingEnergy = buffer[remainingEnergyIndex];
        Assert.InRange(buffer[rotorWashIntensityIndex], 0.0, 1.0);
        Assert.True(buffer[rotorWashRadiusIndex] > 0.0);
        Assert.Equal(0.0, buffer[escapeCueIndex]);

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
        Assert.Equal(1.0, buffer[escapeCueIndex]);
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

    [Fact]
    public void ColdVersionBumpsOnCombatHandoffPhaseOnlyTransition() {
        BeatSetup authored = Beats.ModernVisualMerge();
        var session = new SimulationSession();
        session.StartBeat(() => authored with {
            Combat = authored.CombatRules with { OpponentAmmo = 0 },
            ContinuousCombat = authored.ContinuousCombat! with {
                MaximumFormationSize = 1
            }
        });
        session.Begin();
        session.FeedKey(GKey.KnockItOff, true);
        session.FeedKey(GKey.KnockItOff, false);
        Assert.Equal(CombatHandoffPhase.Requested, session.CombatHandoffPhase);

        var buffer = new double[SnapshotHotFrame.SlotCount];
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double requestedVersion = buffer[SnapshotHotFrame.ColdVersionIndex];

        session.StepFixed();
        Assert.Equal(CombatHandoffPhase.Drain, session.CombatHandoffPhase);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);

        Assert.True(buffer[SnapshotHotFrame.ColdVersionIndex] > requestedVersion,
            "REQUESTED -> DRAIN did not invalidate the cold phase-name field");
        using JsonDocument document = JsonDocument.Parse(
            SnapshotProjection.BuildState(session, Carrier.DeckConfiguration.Angled,
                0.0, 0.0, false, null));
        Assert.Equal("DRAIN",
            document.RootElement.GetProperty("combat_handoff_phase_name").GetString());
    }

    [Fact]
    public void ColdVersionBumpsImmediatelyWhenRapierPilotCallsItADay() {
        BeatSetup baseline = Beats.RapierIntercept();
        var session = new SimulationSession();
        session.StartBeat(() => baseline with {
            StartsOnCatapult = false,
            Player = baseline.Player with {
                Position = new Vec3D(0.0, 12_000.0, 300_000.0)
            }
        });
        session.Begin();

        var buffer = new double[SnapshotHotFrame.SlotCount];
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double before = buffer[SnapshotHotFrame.ColdVersionIndex];

        session.FeedKey(GKey.KnockItOff, true);
        session.FeedKey(GKey.KnockItOff, false);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);

        Assert.Equal(MissionRtbReason.PilotKnockItOff,
            session.ReturnToBaseReason);
        Assert.True(buffer[SnapshotHotFrame.ColdVersionIndex] > before,
            "the same input boundary must invalidate rtb_reason/rtb_available cold truth");
    }

    [Fact]
    public void ColdVersionBumpsWhenRunwayModelEntersRollout() {
        SimulationSession session = StartSession(7, null);
        ConventionalRunwayRecoveryModel recovery = Assert.IsType<
            ConventionalRunwayRecoveryModel>(session.ConventionalRunwayRecovery);
        var buffer = new double[SnapshotHotFrame.SlotCount];
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double airborneVersion = buffer[SnapshotHotFrame.ColdVersionIndex];

        Assert.True(recovery.TryTouchdown(
            RunwayApproachState(recovery.Runway,
                heightM: recovery.ReferenceHeightM + 0.25),
            RunwayApproachState(recovery.Runway,
                heightM: recovery.ReferenceHeightM - 0.05, alongM: 430.7),
            gearDownAndLocked: true,
            airspeedMps: 74.0));
        Assert.Equal(RunwayRecoveryPhase.Rollout, session.ConventionalRunwayPhase);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);

        Assert.True(buffer[SnapshotHotFrame.ColdVersionIndex] > airborneVersion,
            "AIRBORNE -> ROLLOUT did not invalidate the cold phase-name field");
        using JsonDocument document = JsonDocument.Parse(
            SnapshotProjection.BuildState(session, Carrier.DeckConfiguration.Angled,
                0.0, 0.0, false, null));
        Assert.Equal("ROLLOUT",
            document.RootElement.GetProperty("runway_recovery_phase_name").GetString());
    }

    [Fact]
    public void ColdVersionBumpsOnTheSameFillAsARapierPhaseEdge() {
        SimulationSession session = StartSession(10, null);
        var buffer = new double[SnapshotHotFrame.SlotCount];
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);

        RapierMissionPhase previousPhase = session.RapierPhase;
        bool sawEdge = false;
        for (int tick = 0; tick < 30 * AircraftSim.TickHz; tick++) {
            SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
            double beforeStep = buffer[SnapshotHotFrame.ColdVersionIndex];
            session.StepFixed();
            if (session.RapierPhase == previousPhase) continue;

            SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
            Assert.True(buffer[SnapshotHotFrame.ColdVersionIndex] > beforeStep,
                $"Rapier {previousPhase}->{session.RapierPhase} did not bump cold_version");
            sawEdge = true;
            break;
        }

        Assert.True(sawEdge, "test setup did not reach a Rapier phase edge");
    }

    [Fact]
    public void RapierDynamicCueDoesNotHotLoopColdJsonButReasonEdgesRefreshIt() {
        SimulationSession session = StartSession(10, null);
        var buffer = new double[SnapshotHotFrame.SlotCount];
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double settled = buffer[SnapshotHotFrame.ColdVersionIndex];

        FieldInfo guidanceField = typeof(SimulationSession).GetField(
            "_rapierMissionGuidance",
            BindingFlags.Instance | BindingFlags.NonPublic)!;
        var guidance = (RapierMissionGuidance)guidanceField.GetValue(session)!;
        guidanceField.SetValue(session, guidance with {
            Cue = $"{guidance.Cue} · LIVE MACH"
        });
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        Assert.Equal(settled, buffer[SnapshotHotFrame.ColdVersionIndex]);

        guidanceField.SetValue(session, guidance with {
            PhaseReason = $"{guidance.PhaseReason}-edge"
        });
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        Assert.True(buffer[SnapshotHotFrame.ColdVersionIndex] > settled,
            "Rapier phase-reason edge did not refresh the cold cue/reason projection");
    }
}
