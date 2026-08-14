using System.Text.Json;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Propulsion;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Execution coverage for the flat browser state projection. SnapshotProjection is linked out of the
/// browser-only WebBridge so the ~1100-line snapshot boundary can be driven as ordinary .NET: a real
/// session is stepped a handful of ticks and its projection is parsed and structurally checked. This
/// guards the whole hand-built JSON contract against a stray NaN/Infinity token or a malformed field.
/// </summary>
[Collection("snapshot-projection-statics")]
public class SnapshotProjectionTests {
    sealed class FlatTerrain : ITerrainSurface {
        readonly double _heightM;

        public FlatTerrain(double heightM) => _heightM = heightM;

        public TerrainBounds Bounds =>
            new(-1_000_000.0, 1_000_000.0, -1_000_000.0, 1_000_000.0);
        public double HorizontalResolutionM => 100.0;

        public bool TrySample(double eastM, double northM, out TerrainSample sample) {
            sample = new TerrainSample(_heightM, new Vec3D(0.0, 1.0, 0.0));
            return true;
        }
    }

    static string ProjectAfterSteps(int beatIndex, int ticks, ITerrainSurface? terrain) {
        var session = new SimulationSession(beatIndex, Carrier.DeckConfiguration.Angled,
            KoreaWeatherPresets.ForBeat(beatIndex));
        session.Begin();
        for (int tick = 0; tick < ticks; tick++)
            session.StepFixed();
        // Terrain reaches the projection through the session (Session.Terrain), not the dead BuildState
        // terrain parameter, so drive it here to exercise the terrain_present / sea-level paths.
        if (terrain is not null) session.SetTerrainSurface(terrain);
        return SnapshotProjection.BuildState(session, Carrier.DeckConfiguration.Angled,
            0.0, 0.0, false, terrain);
    }

    [Fact]
    public void TopGunTomcatPublishesDedicatedTf30AudioProfile() {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.TopGunAcm(TopGunSeat.F14A));
        session.Begin();

        using JsonDocument document = JsonDocument.Parse(
            SnapshotProjection.BuildState(session, Carrier.DeckConfiguration.Angled,
                0.0, 0.0, false, null));

        Assert.Equal("aircraft.f14a.public-data-surrogate.v1",
            document.RootElement.GetProperty("player_aircraft_id").GetString());
        Assert.Equal("audio.f14a.tf30-twin.v1",
            document.RootElement.GetProperty("audio_profile_id").GetString());
    }

    [Fact]
    public void PantherCarrierDayPublishesFiniteRouteRtbAndBarrierTruth() {
        var session = new SimulationSession();
        session.StartBeat(Beats.KoreaSortie);
        session.Begin();

        using (JsonDocument onDeckDocument = JsonDocument.Parse(
            SnapshotProjection.BuildState(session, Carrier.DeckConfiguration.Axial,
                0.0, 0.0, false, null))) {
            JsonElement onDeck = onDeckDocument.RootElement;
            Assert.False(onDeck.GetProperty("opponent_present").GetBoolean());
            Assert.False(onDeck.GetProperty("opponent_body_present").GetBoolean());
            Assert.Equal(JsonValueKind.Null,
                onDeck.GetProperty("bandit_entity_id").ValueKind);
            Assert.Equal(JsonValueKind.Null,
                onDeck.GetProperty("bandit_aircraft_id").ValueKind);
            Assert.Equal(0.0, onDeck.GetProperty("range_m").GetDouble());
            Assert.Equal(0, onDeck.GetProperty("opponent_rounds_fired").GetInt32());
            Assert.False(onDeck.GetProperty("gun_solution").GetBoolean());
            Assert.True(onDeck.GetProperty("carrier_sortie_route_active").GetBoolean());
            Assert.Equal("PROVISIONAL_KOREA_CARRIER_DAY_V1",
                onDeck.GetProperty("carrier_sortie_route_profile_id").GetString());
            Assert.Equal("ON_DECK",
                onDeck.GetProperty("carrier_sortie_route_phase").GetString());
            Assert.Equal("DEPARTURE",
                onDeck.GetProperty("carrier_sortie_route_fix").GetString());
            Assert.False(onDeck.GetProperty(
                "carrier_sortie_route_rtb_available").GetBoolean());
            Assert.True(onDeck.GetProperty("straight_deck_barrier_armed").GetBoolean());
            Assert.False(onDeck.GetProperty(
                "straight_deck_barrier_engaged").GetBoolean());
            Assert.Equal("OnDeck", onDeck.GetProperty("sortie_leg").GetString());
            Assert.Equal(0, onDeck.GetProperty("sortie_leg_code").GetInt32());
        }

        for (int tick = 0; tick < 15 * AircraftSim.TickHz
            && !session.CarrierSortieRtbAvailable; tick++)
            session.StepFixed();
        Assert.True(session.CarrierSortieRtbAvailable);
        session.FeedKey(GKey.KnockItOff, true);
        session.FeedKey(GKey.KnockItOff, false);

        using JsonDocument returnDocument = JsonDocument.Parse(
            SnapshotProjection.BuildState(session, Carrier.DeckConfiguration.Axial,
                0.0, 0.0, false, null));
        JsonElement returning = returnDocument.RootElement;
        Assert.Equal("RETURN",
            returning.GetProperty("carrier_sortie_route_phase").GetString());
        Assert.Equal("RETURN_INITIAL",
            returning.GetProperty("carrier_sortie_route_fix").GetString());
        Assert.True(returning.GetProperty(
            "carrier_sortie_route_rtb_requested").GetBoolean());
        Assert.True(returning.GetProperty("player_rtb_active").GetBoolean());
        Assert.Equal("PILOT_KNOCK_IT_OFF",
            returning.GetProperty("rtb_reason").GetString());
        Assert.True(double.IsFinite(returning.GetProperty(
            "carrier_sortie_route_target_bearing_deg").GetDouble()));
        Assert.True(double.IsFinite(returning.GetProperty(
            "carrier_sortie_route_target_turn_deg").GetDouble()));
        Assert.True(returning.GetProperty(
            "carrier_sortie_route_distance_m").GetDouble() > 0.0);
    }

    [Fact]
    public void F22PublishesCallItADayAvailabilityAndBingoReason() {
        BeatSetup authored = Beats.ModernVisualMerge();
        var session = new SimulationSession();
        session.StartBeat(() => authored with {
            Fuel = authored.FuelLoadout with {
                InitialFuelLb = authored.FuelLoadout.BingoThresholdLb
            }
        });
        session.Begin();

        using (JsonDocument beforeDocument = JsonDocument.Parse(
            SnapshotProjection.BuildState(session, Carrier.DeckConfiguration.Angled,
                0.0, 0.0, false, null))) {
            JsonElement before = beforeDocument.RootElement;
            Assert.True(before.GetProperty("rtb_available").GetBoolean());
            Assert.Equal("NONE", before.GetProperty("rtb_reason").GetString());
        }

        session.StepFixed();
        using JsonDocument afterDocument = JsonDocument.Parse(
            SnapshotProjection.BuildState(session, Carrier.DeckConfiguration.Angled,
                0.0, 0.0, false, null));
        JsonElement after = afterDocument.RootElement;
        Assert.False(after.GetProperty("rtb_available").GetBoolean());
        Assert.True(after.GetProperty("player_rtb_active").GetBoolean());
        Assert.Equal("BINGO_FUEL", after.GetProperty("rtb_reason").GetString());
        Assert.True(after.GetProperty("rtb_automatic").GetBoolean());
    }

    [Fact]
    public void RapierSnapshotSeparatesWallRecoveryStagnationAndCmcCapability() {
        using JsonDocument document = JsonDocument.Parse(
            ProjectAfterSteps(beatIndex: 10, ticks: 12, terrain: null));
        JsonElement root = document.RootElement;

        double skinC = root.GetProperty("rapier_skin_temp_c").GetDouble();
        double recoveryC = root.GetProperty("rapier_recovery_temp_c").GetDouble();
        double stagnationC = root.GetProperty("rapier_stagnation_temp_c").GetDouble();
        double cmcCapabilityC = root.GetProperty("rapier_cmc_capability_c").GetDouble();
        double cmcMarginC = root.GetProperty("rapier_cmc_margin_c").GetDouble();
        double bindingEffectiveC =
            root.GetProperty("rapier_thermal_effective_temp_c").GetDouble();
        double bindingCapabilityC =
            root.GetProperty("rapier_thermal_capability_c").GetDouble();
        double bindingMarginC = root.GetProperty("rapier_thermal_margin_c").GetDouble();

        Assert.True(stagnationC >= recoveryC,
            $"T0 {stagnationC:F0} C must be at least recovery {recoveryC:F0} C");
        Assert.True(double.IsFinite(skinC));
        Assert.Equal(1200.0, cmcCapabilityC);
        Assert.Equal(cmcCapabilityC - stagnationC, cmcMarginC);
        Assert.Equal("insulated-warm-panel",
            root.GetProperty("rapier_thermal_zone").GetString());
        Assert.Equal(350.0, bindingCapabilityC);
        Assert.Equal(bindingCapabilityC - bindingEffectiveC, bindingMarginC);
        Assert.NotEqual(cmcMarginC, bindingMarginC);
        Assert.Equal(root.GetProperty("rapier_skin_mach_limit").GetDouble(),
            root.GetProperty("rapier_material_mach_ceiling").GetDouble());
        Assert.True(double.IsFinite(
            root.GetProperty("rapier_target_gamma_deg").GetDouble()));
        Assert.Equal(RapierMissionDirector.RelightDynamicPressurePa / 1000.0,
            root.GetProperty("rapier_relight_dynamic_pressure_kpa").GetDouble(), 2);
    }

    [Fact]
    public void RapierFinalizedExposurePublishesReviewEvidenceWithoutDamageOrCost() {
        var session = new SimulationSession(
            beatIndex: 10,
            weather: KoreaWeatherPresets.ForBeat(10));
        session.Begin();
        session.StepFixed(120);
        session.Restart();

        using JsonDocument document = JsonDocument.Parse(
            SnapshotProjection.BuildState(
                session,
                Carrier.DeckConfiguration.Angled,
                0.0,
                0.0,
                false,
                null));
        JsonElement root = document.RootElement;

        Assert.True(root.GetProperty(
            "service_life_record_available").GetBoolean());
        Assert.Equal(1, root.GetProperty(
            "service_life_record_sequence").GetInt64());
        Assert.Equal("COMPLETE", root.GetProperty(
            "service_life_evidence_status").GetString());
        Assert.Equal(64, root.GetProperty(
            "service_life_record_sha256").GetString()!.Length);
        Assert.Equal("not_computed", root.GetProperty(
            "service_life_damage_assessment").GetString());
        Assert.Equal("not_computed", root.GetProperty(
            "service_life_cost_projection").GetString());
        Assert.Equal(
            session.RapierServiceLife.LatestRecord!
                .Mechanical.MaximumLoadMilliG / 1000.0,
            root.GetProperty("service_life_max_g").GetDouble());
    }

    [Fact]
    public void ProductionBalloonCardAndOtherArcadeRapierCardsDoNotPublishEconomy() {
        foreach (int arcadeBeat in new[] { 7, 10, 11, 12 }) {
            using JsonDocument arcadeDocument = JsonDocument.Parse(
                ProjectAfterSteps(arcadeBeat, ticks: 1, terrain: null));
            Assert.False(arcadeDocument.RootElement.GetProperty(
                "rapier_economy_active").GetBoolean());
            Assert.Equal(0, arcadeDocument.RootElement.GetProperty(
                "rapier_economy_sortie_net_credits").GetInt32());
        }
    }

    [Theory]
    [InlineData(7, 12)]   // F-22 modern visual-merge beat
    [InlineData(8, 12)]   // fictional Ukraine low-level drone intercept
    [InlineData(9, 12)]   // single Ace duel in the same theatre
    [InlineData(10, 12)]  // Rapier fixed-strip sortie
    [InlineData(11, 12)]  // Rapier Circuits with traffic and structured R/T
    [InlineData(12, 12)]  // varied Rapier operations contract
    [InlineData(5, 30)]   // carrier recovery beat
    [InlineData(1, 8)]    // grammar/physics slice beat
    public void BuildStateEmitsParseableFiniteJson(int beatIndex, int ticks) {
        string json = ProjectAfterSteps(beatIndex, ticks, null);

        // (a) the hand-built blob is valid JSON.
        using JsonDocument document = JsonDocument.Parse(json);
        JsonElement root = document.RootElement;

        // (b) no invalid numeric token slipped through a finite guard.
        Assert.DoesNotContain("NaN", json);
        Assert.DoesNotContain("Infinity", json);

        // (c) terrain-frame fields the multiplayer substrate depends on are present.
        Assert.True(root.TryGetProperty("terrain_placement_east_m", out _));
        Assert.True(root.TryGetProperty("terrain_placement_north_m", out _));
        Assert.True(root.TryGetProperty("world_frame_id", out JsonElement worldFrameId));
        Assert.False(string.IsNullOrEmpty(worldFrameId.GetString()));

        // (e) the F-22 arcade opener flies over sea level: no terrain surface, so the browser can
        // skip the multi-megabyte visual-terrain fetch.
        Assert.False(root.GetProperty("terrain_present").GetBoolean());

        // (d) spot-check stable contract fields.
        Assert.Equal("1.26.0",
            root.GetProperty("snapshot_schema_version").GetString());
        Assert.Contains("\"rapier_intention\"", json);
        Assert.Contains("\"rapier_strategy\"", json);
        Assert.Equal(TurboRamjetPerformanceMap.RamFadeStartMach,
            root.GetProperty("rapier_ram_light_mach").GetDouble(), 10);
        Assert.Equal(TurboRamjetPerformanceMap.FullRamMach,
            root.GetProperty("rapier_full_ram_mach").GetDouble(), 10);
        Assert.Equal(TurboRamjetPerformanceMap.TurbineGoneMach,
            root.GetProperty("rapier_turbine_gone_mach").GetDouble(), 10);
        Assert.Equal(RapierMissionDirector.MeasuredDashMach,
            root.GetProperty("rapier_design_dash_mach").GetDouble(), 10);
        Assert.True(root.TryGetProperty("rapier_inlet_unstart", out JsonElement inletUnstart));
        Assert.True(inletUnstart.ValueKind is JsonValueKind.True or JsonValueKind.False);
        Assert.True(root.TryGetProperty("rapier_over_q", out JsonElement overQ));
        Assert.True(overQ.ValueKind is JsonValueKind.True or JsonValueKind.False);
        Assert.Contains(root.GetProperty("bandit_coordination_role").GetString(),
            new[] { "NONE", "PRESSURE", "BRACKET", "EXTEND" });
        Assert.Contains(root.GetProperty("w1_coordination_role").GetString(),
            new[] { "NONE", "PRESSURE", "BRACKET", "EXTEND" });
        JsonElement coordinationAge =
            root.GetProperty("formation_coordination_age_s");
        Assert.True(coordinationAge.ValueKind == JsonValueKind.Null
            || coordinationAge.GetDouble() >= 0.0);
        Assert.True(root.GetProperty("formation_coordination_stale").ValueKind
            is JsonValueKind.True or JsonValueKind.False);
        Assert.True(
            root.GetProperty("formation_coordination_health_stale").ValueKind
                is JsonValueKind.True or JsonValueKind.False);
        Assert.True(root.TryGetProperty("time_compression_factor",
            out JsonElement timeCompressionFactor));
        Assert.InRange(timeCompressionFactor.GetInt32(), 1, 16);
        Assert.InRange(root.GetProperty("time_compression_requested_factor").GetInt32(),
            1, 16);
        Assert.InRange(root.GetProperty("time_compression_safety_factor_cap").GetInt32(),
            1, 8);
        Assert.True(root.TryGetProperty("time_compression_inhibit_reason", out _));
        // The automatic speed brake is an F-22 surrogate surface: beats 7/8/9 carry it, the F-86
        // and carrier beats project a hard 0.0 with the capability off, so the HUD shows no dead
        // instrument. This block is a [Theory] over beats 7, 5 and 1 — assert per beat, not flat.
        Assert.Equal(beatIndex is 7 or 8 or 9,
            root.GetProperty("has_speed_brake").GetBoolean());
        Assert.InRange(root.GetProperty("speed_brake").GetDouble(), 0.0, 1.0);
        Assert.Equal(JsonValueKind.Null,
            root.GetProperty("gcas_last_flyup_bottom_ft").ValueKind);
        Assert.Equal(0, root.GetProperty("gcas_flyup_count").GetInt32());
        Assert.InRange(root.GetProperty("gun_heat").GetDouble(), 0.0, 1.0);
        Assert.False(root.GetProperty("gun_overheat").GetBoolean());
        Assert.False(root.GetProperty("assisted_flight").GetBoolean());
        Assert.Equal(0, root.GetProperty("assisted_speed_bias_kts").GetInt32());
        Assert.False(string.IsNullOrEmpty(root.GetProperty("beat").GetString()));
        Assert.Equal(root.GetProperty("indicated_airspeed_kts").GetDouble(),
            root.GetProperty("calibrated_airspeed_kts").GetDouble(), 10);
        Assert.Equal(root.GetProperty("stall_speed_kias").GetDouble(),
            root.GetProperty("stall_speed_kcas").GetDouble(), 10);
        Assert.Equal(root.GetProperty("corner_speed_kias").GetDouble(),
            root.GetProperty("corner_speed_kcas").GetDouble(), 10);
        // Corner band: the >= 95%-of-peak turn-rate CAS range strictly brackets the corner caret.
        double cornerKias = root.GetProperty("corner_speed_kias").GetDouble();
        double cornerBandMin = root.GetProperty("corner_band_min_kias").GetDouble();
        double cornerBandMax = root.GetProperty("corner_band_max_kias").GetDouble();
        Assert.True(cornerBandMin < cornerKias && cornerKias < cornerBandMax);
        // Fielded AI tier: doctrine pilots project their tier, scripted rail actors project null.
        // The legacy Rapier intercept fields a doctrine pilot. Card 12 intentionally targets a
        // free balloon, so it must not acquire a fighter skill tier merely to satisfy old copy.
        JsonElement banditSkill = root.GetProperty("bandit_skill");
        if (beatIndex is 7 or 9) Assert.Equal("ACE", banditSkill.GetString());
        else if (beatIndex is 10) {
            Assert.Equal(JsonValueKind.String, banditSkill.ValueKind);
            Assert.False(string.IsNullOrWhiteSpace(banditSkill.GetString()),
                "a doctrine pilot must project which tier it is flying");
        } else Assert.Equal(JsonValueKind.Null, banditSkill.ValueKind);
        Assert.InRange(Math.Abs(root.GetProperty("fuel_flow_lb_min").GetDouble() * 60.0
            - root.GetProperty("fuel_flow_pph").GetDouble()), 0.0, 0.31);
        Assert.True(root.TryGetProperty("fuel_joker_lb", out JsonElement jokerThreshold));
        Assert.True(root.TryGetProperty("fuel_minimum_lb", out JsonElement minimumThreshold));
        Assert.True(root.TryGetProperty("fuel_emergency_lb", out JsonElement emergencyThreshold));
        Assert.True(root.TryGetProperty("fuel_minutes_to_joker", out _));
        Assert.True(root.TryGetProperty("fuel_joker", out _));
        Assert.True(root.TryGetProperty("fuel_minimum", out _));
        Assert.True(root.TryGetProperty("fuel_emergency", out _));
        bool recoveryPointKnown = beatIndex is 5 or 7 or 9 or 10 or 11 or 12;
        Assert.Equal(recoveryPointKnown,
            root.GetProperty("recovery_point_known").GetBoolean());
        bool runwayAvailable = beatIndex is 7 or 9;
        Assert.Equal(runwayAvailable,
            root.GetProperty("runway_available").GetBoolean());
        Assert.False(root.GetProperty("player_rtb_active").GetBoolean());
        JsonElement recoveryClosure = root.GetProperty("rtb_closure_kts");
        JsonElement recoveryEta = root.GetProperty("rtb_eta_min");
        JsonElement fuelToHome = root.GetProperty("fuel_to_home_estimate_lb");
        JsonElement fuelOnArrival =
            root.GetProperty("fuel_on_arrival_estimate_lb");
        JsonElement reserveTarget = root.GetProperty("fuel_reserve_target_lb");
        JsonElement reserveMargin = root.GetProperty("fuel_reserve_margin_lb");
        string[] runwayFields = {
            "runway_threshold_x", "runway_threshold_y", "runway_threshold_z",
            "runway_heading_deg", "runway_length_m", "runway_width_m",
            "runway_touchdown_x", "runway_touchdown_y", "runway_touchdown_z",
        };
        if (!runwayAvailable) {
            foreach (string field in runwayFields)
                Assert.Equal(JsonValueKind.Null, root.GetProperty(field).ValueKind);
        }
        if (!recoveryPointKnown) {
            Assert.Equal(JsonValueKind.Null, recoveryClosure.ValueKind);
            Assert.Equal(JsonValueKind.Null, recoveryEta.ValueKind);
            Assert.Equal(JsonValueKind.Null, fuelToHome.ValueKind);
            Assert.Equal(JsonValueKind.Null, fuelOnArrival.ValueKind);
            Assert.Equal(JsonValueKind.Null, reserveTarget.ValueKind);
            Assert.Equal(JsonValueKind.Null, reserveMargin.ValueKind);
        } else {
            Assert.Equal(JsonValueKind.Number, recoveryClosure.ValueKind);
        }
        if (beatIndex is 7 or 9) {
            Assert.Equal("recovery.f22a.soniachne-west-runway.v1",
                root.GetProperty("recovery_id").GetString());
            Assert.Equal("Soniachne west recovery runway",
                root.GetProperty("recovery_display_name").GetString());
            Assert.Equal(-61_952.0,
                root.GetProperty("runway_threshold_x").GetDouble());
            Assert.Equal(106.75,
                root.GetProperty("runway_threshold_y").GetDouble());
            Assert.Equal(-56_576.0,
                root.GetProperty("runway_threshold_z").GetDouble());
            Assert.Equal(90.0,
                root.GetProperty("runway_heading_deg").GetDouble());
            Assert.Equal(3_000.0,
                root.GetProperty("runway_length_m").GetDouble());
            Assert.Equal(45.0,
                root.GetProperty("runway_width_m").GetDouble());
            Assert.Equal(-61_652.0,
                root.GetProperty("runway_touchdown_x").GetDouble());
            Assert.Equal(106.75,
                root.GetProperty("runway_touchdown_y").GetDouble());
            Assert.Equal(-56_576.0,
                root.GetProperty("runway_touchdown_z").GetDouble());
            Assert.True(recoveryClosure.GetDouble() < 0.0,
                "the opening northbound F-22 is outbound from its southwest runway");
            Assert.Equal(JsonValueKind.Null, recoveryEta.ValueKind);
            Assert.Equal(JsonValueKind.Null, fuelToHome.ValueKind);
            Assert.Equal(JsonValueKind.Null, fuelOnArrival.ValueKind);
            Assert.Equal(3000.0, reserveTarget.GetDouble());
            Assert.Equal(JsonValueKind.Null, reserveMargin.ValueKind);
        } else if (beatIndex is 10 or 12) {
            Assert.Equal("recovery.rapier.eastern-dispersed-strip.v1",
                root.GetProperty("recovery_id").GetString());
            Assert.Equal("Eastern dispersed strip",
                root.GetProperty("recovery_display_name").GetString());
            Assert.Equal(600.0, reserveTarget.GetDouble());
        } else if (beatIndex == 5) {
            // Legacy carrier qualification knows deck geometry but does not invent a mission
            // landing reserve where content has authored none.
            Assert.Equal(JsonValueKind.Null, reserveTarget.ValueKind);
            Assert.Equal(JsonValueKind.Null, reserveMargin.ValueKind);
            Assert.Equal("", root.GetProperty("recovery_id").GetString());
            Assert.Equal("", root.GetProperty("recovery_display_name").GetString());
        }
        if (beatIndex is 7 or 9) {
            Assert.Equal(6000.0, jokerThreshold.GetDouble());
            Assert.Equal(2100.0, minimumThreshold.GetDouble());
            Assert.Equal(1200.0, emergencyThreshold.GetDouble());
        } else if (beatIndex == 8) {
            Assert.Equal(5500.0, jokerThreshold.GetDouble());
            Assert.Equal(2100.0, minimumThreshold.GetDouble());
            Assert.Equal(1200.0, emergencyThreshold.GetDouble());
        } else if (beatIndex is 10 or 12) {
            // The Rapier's thresholds are now the fuel plan rather than authored numbers:
            // minimum is MFR (approach 300 lb + FFR 500 lb) and emergency is FFR itself.
            Assert.Equal(2000.0, jokerThreshold.GetDouble());
            Assert.Equal(FuelPlan.MinimumFuelReserveLb, minimumThreshold.GetDouble());
            Assert.Equal(FuelPlan.FixedFuelReserveLb, emergencyThreshold.GetDouble());
        } else if (beatIndex == 11) {
            Assert.Equal(1400.0, jokerThreshold.GetDouble());
            Assert.Equal(FuelPlan.MinimumFuelReserveLb, minimumThreshold.GetDouble());
            Assert.Equal(FuelPlan.FixedFuelReserveLb, emergencyThreshold.GetDouble());
        } else {
            Assert.Equal(JsonValueKind.Null, jokerThreshold.ValueKind);
            Assert.Equal(JsonValueKind.Null, minimumThreshold.ValueKind);
            Assert.Equal(JsonValueKind.Null, emergencyThreshold.ValueKind);
        }
        Assert.False(root.GetProperty("padlock_roll_assist_selected").GetBoolean());
        Assert.False(root.GetProperty("padlock_roll_assist_active").GetBoolean());
        Assert.True(double.IsFinite(
            root.GetProperty("padlock_roll_error_deg").GetDouble()));
        Assert.True(double.IsFinite(
            root.GetProperty("padlock_roll_assist_aileron").GetDouble()));

        // (f) the ballistic gun trajectory the HUD funnel projects: nine finite samples whose
        // range from the shooter increases monotonically away from the muzzle station.
        JsonElement trajectory = root.GetProperty("gun_trajectory");
        Assert.Equal(JsonValueKind.Array, trajectory.ValueKind);
        Assert.Equal(9, trajectory.GetArrayLength());
        double previousRange = double.NegativeInfinity;
        foreach (JsonElement sample in trajectory.EnumerateArray()) {
            Assert.True(double.IsFinite(sample.GetProperty("x").GetDouble()));
            Assert.True(double.IsFinite(sample.GetProperty("y").GetDouble()));
            Assert.True(double.IsFinite(sample.GetProperty("z").GetDouble()));
            double range = sample.GetProperty("r").GetDouble();
            Assert.True(double.IsFinite(range) && range > previousRange);
            previousRange = range;
        }
        // The far sample must reach the effective ranging envelope while staying inside the
        // physical maximum: muzzle velocity times the 0.9 s effective flight time, give or take
        // the shooter's own motion.
        Assert.InRange(previousRange, 300.0, 1400.0);

        // (g) world ground velocity is emitted for the projected flight-path marker.
        Assert.True(double.IsFinite(root.GetProperty("vx").GetDouble()));
        Assert.True(double.IsFinite(root.GetProperty("vy").GetDouble()));
        Assert.True(double.IsFinite(root.GetProperty("vz").GetDouble()));
    }

    [Fact]
    public void ColdStateProjectsAssistedFlightSelectionAndSpeedBias() {
        var session = new SimulationSession(7, Carrier.DeckConfiguration.Angled,
            KoreaWeatherPresets.ForBeat(7));
        session.SetAssistedFlight(true);
        session.NudgeAssistedSpeed(1);
        session.NudgeAssistedSpeed(1);

        string json = SnapshotProjection.BuildState(session,
            Carrier.DeckConfiguration.Angled, 0.0, 0.0, false, terrain: null);
        using JsonDocument document = JsonDocument.Parse(json);
        JsonElement root = document.RootElement;

        Assert.True(root.GetProperty("assisted_flight").GetBoolean());
        Assert.Equal(60, root.GetProperty("assisted_speed_bias_kts").GetInt32());
    }

    [Fact]
    public void SystemsCapabilityProjectionDoesNotInventF22ElectricalOrHydraulicSystems() {
        using JsonDocument f22 = JsonDocument.Parse(ProjectAfterSteps(7, 8, null));
        JsonElement f22Root = f22.RootElement;
        Assert.True(f22Root.GetProperty("has_retractable_gear").GetBoolean());
        Assert.False(f22Root.GetProperty("has_flaps").GetBoolean());
        Assert.False(f22Root.GetProperty("has_electrical_system").GetBoolean());
        Assert.False(f22Root.GetProperty("has_utility_hydraulics").GetBoolean());
        Assert.False(f22Root.GetProperty("primary_bus_powered").GetBoolean());
        Assert.Equal(0.0,
            f22Root.GetProperty("utility_hydraulic_nominal_psi").GetDouble());
        Assert.Equal(0.0,
            f22Root.GetProperty("utility_hydraulic_pressure_psi").GetDouble());

        using JsonDocument f86 = JsonDocument.Parse(ProjectAfterSteps(1, 8, null));
        JsonElement f86Root = f86.RootElement;
        Assert.True(f86Root.GetProperty("has_retractable_gear").GetBoolean());
        Assert.True(f86Root.GetProperty("has_flaps").GetBoolean());
        Assert.True(f86Root.GetProperty("has_electrical_system").GetBoolean());
        Assert.True(f86Root.GetProperty("has_utility_hydraulics").GetBoolean());
        Assert.True(f86Root.GetProperty("primary_bus_powered").GetBoolean());
        Assert.Equal(3000.0,
            f86Root.GetProperty("utility_hydraulic_nominal_psi").GetDouble());
        Assert.InRange(
            f86Root.GetProperty("utility_hydraulic_pressure_psi").GetDouble(),
            2999.0, 3000.0);
    }

    [Fact]
    public void VoluntaryHandoffActivatesF22SteeringWithoutInventingOutboundEta() {
        var session = new SimulationSession(7, Carrier.DeckConfiguration.Angled,
            KoreaWeatherPresets.ForBeat(7));
        session.Begin();
        Assert.True(session.CombatHandoffAvailable);
        Assert.False(session.PlayerFuel.RtbAdvisory);

        session.FeedKey(GKey.KnockItOff, true);
        session.FeedKey(GKey.KnockItOff, false);
        for (int tick = 0; tick < 4
            && session.CombatHandoffPhase < CombatHandoffPhase.ReliefEngaged; tick++)
            session.StepFixed();
        Assert.True(session.PlayerRtbActive);

        string json = SnapshotProjection.BuildState(session,
            Carrier.DeckConfiguration.Angled, 0.0, 0.0, false, terrain: null);
        using JsonDocument document = JsonDocument.Parse(json);
        JsonElement root = document.RootElement;

        Assert.False(root.GetProperty("rtb").GetBoolean(),
            "voluntary handoff must not manufacture a Bingo crossing");
        Assert.InRange(root.GetProperty("combat_handoff_phase").GetInt32(),
            (int)CombatHandoffPhase.ReliefEngaged,
            (int)CombatHandoffPhase.ReliefLost);
        Assert.Contains(root.GetProperty("combat_handoff_phase_name").GetString(),
            new[] { "RELIEF_ENGAGED", "PLAYER_RTB", "RELIEF_LOST" });
        Assert.True(root.GetProperty("combat_handoff_requested").GetBoolean());
        Assert.True(root.GetProperty("combat_handoff_active").GetBoolean());
        Assert.Equal(0, root.GetProperty("relief_kills").GetInt32());
        Assert.True(root.GetProperty("player_rtb_active").GetBoolean());
        Assert.True(root.GetProperty("rtb_steer").GetBoolean());
        Assert.True(root.GetProperty("recovery_point_known").GetBoolean());
        Assert.True(root.GetProperty("rtb_closure_kts").GetDouble() < 0.0);
        Assert.Equal(JsonValueKind.Null,
            root.GetProperty("rtb_eta_min").ValueKind);
        Assert.Equal(JsonValueKind.Null,
            root.GetProperty("fuel_to_home_estimate_lb").ValueKind);
        Assert.Equal(JsonValueKind.Null,
            root.GetProperty("fuel_on_arrival_estimate_lb").ValueKind);
        Assert.Equal(JsonValueKind.Null,
            root.GetProperty("fuel_reserve_margin_lb").ValueKind);
    }

    [Fact]
    public void ReliefEventsKeepFriendlyRoleAndEntityIdentity() {
        var session = new SimulationSession(7, Carrier.DeckConfiguration.Angled,
            KoreaWeatherPresets.ForBeat(7));
        session.Begin();
        session.FeedKey(GKey.KnockItOff, true);
        session.FeedKey(GKey.KnockItOff, false);
        for (int tick = 0; tick < 4
            && session.CombatHandoffPhase < CombatHandoffPhase.ReliefEngaged; tick++)
            session.StepFixed();

        ReliefFighter relief = Assert.IsType<ReliefFighter>(session.Relief);
        session.RecordReliefHitsForTest(
            session.Beat.CombatRules.PlayerHitsToDefeat);

        using JsonDocument document = JsonDocument.Parse(
            SnapshotProjection.BuildState(session,
                Carrier.DeckConfiguration.Angled, 0.0, 0.0, false, terrain: null));
        JsonElement[] reliefEvents = document.RootElement
            .GetProperty("recent_events")
            .EnumerateArray()
            .Where(e => e.GetProperty("target").GetString() == "RELIEF")
            .ToArray();

        Assert.Contains(reliefEvents,
            e => e.GetProperty("type").GetString() == "HIT");
        Assert.Contains(reliefEvents,
            e => e.GetProperty("type").GetString() == "DESTROYED");
        Assert.All(reliefEvents, e => {
            Assert.Equal("OPPONENT", e.GetProperty("source").GetString());
            Assert.Equal(
                $"entity.relief.{relief.SpawnSequence}",
                e.GetProperty("entity_id").GetString());
        });
    }

    [Fact]
    public void BuildStateProjectsTheFieldedBanditSkillTierForBothDoctrinePilots() {
        // ReactiveBandit path: no built-in beat stages one directly, so drive a custom setup.
        var session = new SimulationSession();
        session.StartBeat(() => Doctrine.Beats.Perch() with {
            UsesReactiveBandit = true,
            BanditSkill = Doctrine.PilotSkill.Veteran,
        });
        session.Begin();
        for (int tick = 0; tick < 8; tick++) session.StepFixed();
        string reactiveJson = SnapshotProjection.BuildState(session,
            Carrier.DeckConfiguration.Angled, 0.0, 0.0, false, null);
        using JsonDocument reactive = JsonDocument.Parse(reactiveJson);
        Assert.Equal("VETERAN",
            reactive.RootElement.GetProperty("bandit_skill").GetString());

        // NeutralMergeBandit path at a non-default tier: the climactic Ace duel beat.
        string aceJson = ProjectAfterSteps(9, 8, null);
        using JsonDocument ace = JsonDocument.Parse(aceJson);
        Assert.Equal("ACE", ace.RootElement.GetProperty("bandit_skill").GetString());
    }

    [Fact]
    public void BuildStateReportsTerrainPresentWhenTheSessionHasATerrainSurface() {
        string json = ProjectAfterSteps(7, 12, new FlatTerrain(0.0));

        using JsonDocument document = JsonDocument.Parse(json);
        Assert.DoesNotContain("NaN", json);
        Assert.DoesNotContain("Infinity", json);
        Assert.True(document.RootElement.GetProperty("terrain_present").GetBoolean());
    }

    [Fact]
    public void BeatEightPublishesTheSharedUkraineTheatreWithALocalHeroCell() {
        var session = new SimulationSession(8, Carrier.DeckConfiguration.Angled,
            KoreaWeatherPresets.ForBeat(8));
        session.SetTerrainSurface(new FlatTerrain(90.0));
        session.Begin();

        string json = SnapshotProjection.BuildState(session, Carrier.DeckConfiguration.Angled,
            40_000.0, 80_000.0, true, session.Terrain);

        using JsonDocument document = JsonDocument.Parse(json);
        JsonElement root = document.RootElement;
        Assert.Equal("theatre.ukraine.soniachne-2030s.v1",
            root.GetProperty("theatre_id").GetString());
        Assert.Equal("location.ukraine.soniachne-hero-cell.v1",
            root.GetProperty("location_id").GetString());
        Assert.Equal("world.ukraine.soniachne-2030s.v1",
            root.GetProperty("world_frame_id").GetString());
        Assert.Equal("terrain.ukraine.rapier-range.atlas.v1",
            root.GetProperty("terrain_profile_id").GetString());
        Assert.Equal("ukraine-2030s-macro",
            root.GetProperty("terrain_macro_scenery_profile").GetString());
        Assert.Equal("ukraine-modern",
            root.GetProperty("terrain_scenery_profile").GetString());
        Assert.True(root.GetProperty("terrain_macro_required").GetBoolean());
        Assert.True(root.GetProperty("terrain_micro_required").GetBoolean());
        Assert.Equal(Ukraine2030sTheatre.HeroFeaturePackId,
            root.GetProperty("mission_feature_pack_id").GetString());
        Assert.Equal(Ukraine2030sTheatre.HeroFeaturePackSha256,
            root.GetProperty("mission_feature_pack_sha256").GetString());
        Assert.True(root.GetProperty("mission_feature_pack_required").GetBoolean());
        Assert.Equal("unassessed",
            root.GetProperty("lz_assessment_status").GetString());
        Assert.Equal(32_000.0,
            root.GetProperty("terrain_streaming_radius_m").GetDouble());
        Assert.Equal(0.0, root.GetProperty("terrain_placement_east_m").GetDouble());
        Assert.Equal(0.0, root.GetProperty("terrain_placement_north_m").GetDouble());
        Assert.False(root.GetProperty("multiplayer_terrain_shared").GetBoolean());
    }

    [Fact]
    public void RapierPublishesTheRegionalUkraineCorridorAndFixedStrip() {
        var session = new SimulationSession(10, Carrier.DeckConfiguration.Angled,
            KoreaWeatherPresets.ForBeat(10));
        session.SetTerrainSurface(new FlatTerrain(118.0));
        session.Begin();

        string json = SnapshotProjection.BuildState(session, Carrier.DeckConfiguration.Angled,
            40_000.0, 80_000.0, true, session.Terrain);

        using JsonDocument document = JsonDocument.Parse(json);
        JsonElement root = document.RootElement;
        Assert.Equal("theatre.ukraine.soniachne-2030s.v1",
            root.GetProperty("theatre_id").GetString());
        Assert.Equal("location.ukraine.soniachne-rapier-corridor.v1",
            root.GetProperty("location_id").GetString());
        Assert.Equal("world.ukraine.soniachne-2030s.v1",
            root.GetProperty("world_frame_id").GetString());
        Assert.Equal("terrain.ukraine.rapier-range.atlas.v1",
            root.GetProperty("terrain_profile_id").GetString());
        Assert.InRange(root.GetProperty("radar_alt_ft").GetDouble(), 2.7, 2.9);
        Assert.False(root.GetProperty("below_ground").GetBoolean());
        Assert.Equal(0.0, root.GetProperty("rapier_rcs_moment_nm").GetDouble());
        Assert.Equal(0.0, root.GetProperty("rapier_rcs_firing_frac").GetDouble());
        Assert.True(root.GetProperty("terrain_macro_required").GetBoolean());
        Assert.False(root.GetProperty("terrain_micro_required").GetBoolean());
        Assert.Equal(Ukraine2030sTheatre.RapierStripFeaturePackId,
            root.GetProperty("mission_feature_pack_id").GetString());
        Assert.Equal(Ukraine2030sTheatre.RapierStripFeaturePackSha256,
            root.GetProperty("mission_feature_pack_sha256").GetString());
        Assert.True(root.GetProperty("mission_feature_pack_required").GetBoolean());
        Assert.Equal("unassessed",
            root.GetProperty("lz_assessment_status").GetString());
        Assert.Equal(145_000.0,
            root.GetProperty("terrain_streaming_radius_m").GetDouble());
        Assert.Equal(0.0, root.GetProperty("terrain_placement_east_m").GetDouble());
        Assert.Equal(0.0, root.GetProperty("terrain_placement_north_m").GetDouble());
        Assert.False(root.GetProperty("multiplayer_terrain_shared").GetBoolean());

        Assert.False(root.GetProperty("carrier").GetBoolean());
        Assert.True(root.GetProperty("recovery_platform").GetBoolean());
        Assert.Equal("FIXED_ARRESTING_STRIP",
            root.GetProperty("platform_kind").GetString());
        Assert.Equal("presentation.platform.rapier-dispersed-strip.v1",
            root.GetProperty("platform_presentation_id").GetString());
        Assert.Equal("presentation.vehicle.rapier.public-data-surrogate.v1",
            root.GetProperty("player_presentation_id").GetString());
        Assert.Equal(3_048.0, root.GetProperty("deck_len").GetDouble());
        Assert.Equal(0.0, root.GetProperty("wod_kts").GetDouble());
    }

    [Fact]
    public void EveryBuiltInUsesALocalUkraineInstanceAndIgnoresRoomOrigin() {
        for (int beatIndex = 1; beatIndex <= 10; beatIndex++) {
            MissionEnvironmentContract environment =
                Beats.BuiltIn(beatIndex, Carrier.DeckConfiguration.Angled).EnvironmentIdentity;
            Assert.Equal(Ukraine2030sTheatre.TheatreId, environment.TheatreId);
            Assert.Equal(Ukraine2030sTheatre.WorldFrameId, environment.WorldFrameId);
            Assert.False(environment.AcceptsMultiplayerWorldOrigin);
            Assert.False(environment.MultiplayerTerrainShared);

            var session = new SimulationSession(beatIndex, Carrier.DeckConfiguration.Angled,
                KoreaWeatherPresets.ForBeat(beatIndex));
            string firstJson = SnapshotProjection.BuildState(session,
                Carrier.DeckConfiguration.Angled, 40_000.0, 80_000.0, true, null);
            string secondJson = SnapshotProjection.BuildState(session,
                Carrier.DeckConfiguration.Angled, -120_000.0, 160_000.0, true, null);
            using JsonDocument firstDocument = JsonDocument.Parse(firstJson);
            using JsonDocument secondDocument = JsonDocument.Parse(secondJson);
            JsonElement first = firstDocument.RootElement;
            JsonElement second = secondDocument.RootElement;

            Assert.False(first.GetProperty("multiplayer_terrain_shared").GetBoolean());
            Assert.False(second.GetProperty("multiplayer_terrain_shared").GetBoolean());
            Assert.Equal(-environment.TerrainSourceAnchorEastM,
                first.GetProperty("terrain_placement_east_m").GetDouble());
            Assert.Equal(-environment.TerrainSourceAnchorNorthM,
                first.GetProperty("terrain_placement_north_m").GetDouble());
            Assert.Equal(first.GetProperty("terrain_placement_east_m").GetDouble(),
                second.GetProperty("terrain_placement_east_m").GetDouble());
            Assert.Equal(first.GetProperty("terrain_placement_north_m").GetDouble(),
                second.GetProperty("terrain_placement_north_m").GetDouble());
        }
    }
}
