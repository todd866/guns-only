using System.Text.Json;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests;

[Collection("snapshot-projection-statics")]
public sealed class CasevacSnapshotProjectionTests {
    sealed class FlatTerrain : ITerrainSurface {
        readonly double _heightM;

        public FlatTerrain(double heightM = 40.0) =>
            _heightM = heightM;

        public TerrainBounds Bounds =>
            new(-20_000.0, 20_000.0, -20_000.0, 20_000.0);

        public double HorizontalResolutionM => 4.0;

        public bool TrySample(
            double eastM,
            double northM,
            out TerrainSample sample) {
            sample = new TerrainSample(
                _heightM,
                new Vec3D(0.0, 1.0, 0.0));
            return true;
        }
    }

    static SimulationSession Staged(bool begin = false) {
        var session = new SimulationSession(
            13,
            Carrier.DeckConfiguration.Angled,
            KoreaWeatherPresets.ForBeat(13));
        session.SetTerrainSurface(new FlatTerrain());
        if (begin) {
            session.Begin();
            for (int tick = 0; tick < 12; tick++)
                session.StepFixed();
        }
        return session;
    }

    static JsonDocument Project(SimulationSession session) =>
        JsonDocument.Parse(SnapshotProjection.BuildState(
            session,
            Carrier.DeckConfiguration.Angled,
            0.0,
            0.0,
            false,
            session.Terrain));

    [Fact]
    public void CasevacProjectionBranchesBeforeInvalidFixedWingAndOpponentAccess() {
        SimulationSession session = Staged(begin: true);
        Assert.True(session.CasevacMission);
        Assert.False(session.OpponentPresent);
        Assert.Throws<InvalidOperationException>(() => _ = session.Player);
        Assert.Throws<InvalidOperationException>(() => _ = session.Bandit);

        using JsonDocument document = Project(session);
        JsonElement root = document.RootElement;
        Assert.True(root.GetProperty("casevac_mission").GetBoolean());
        Assert.False(root.GetProperty("opponent_present").GetBoolean());
        Assert.Equal("", root.GetProperty("sortie_outcome").GetString());
        Assert.Equal("", root.GetProperty("pending_sortie_outcome").GetString());

        string[] forbiddenOpponentKinematics = {
            "bx", "by", "bz",
            "bfx", "bfy", "bfz",
            "blx", "bly", "blz"
        };
        foreach (string field in forbiddenOpponentKinematics)
            Assert.False(root.TryGetProperty(field, out _), field);
        Assert.DoesNotContain(
            root.EnumerateObject(),
            property => property.Name.StartsWith(
                    "bandit_",
                    StringComparison.Ordinal)
                || (property.Name.StartsWith(
                        "opponent_",
                        StringComparison.Ordinal)
                    && property.Name != "opponent_present"));
    }

    [Fact]
    public void CasevacProjectionPublishesStableObserverSafeFieldContract() {
        SimulationSession session = Staged(begin: true);

        using JsonDocument document = Project(session);
        JsonElement root = document.RootElement;
        string[] required = {
            "snapshot_schema_version",
            "casevac_scenario_id",
            "casevac_mission_epoch_sequence",
            "casevac_phase",
            "casevac_custody",
            "casevac_disposition",
            "casevac_target_site_id",
            "casevac_target_range_m",
            "casevac_target_eta_s",
            "casevac_call_age_s",
            "casevac_requested_handoff_age_s",
            "casevac_window",
            "casevac_requested_window_state",
            "casevac_gate",
            "casevac_gate_state",
            "casevac_dwell",
            "casevac_dwell_kind",
            "casevac_dwell_progress_01",
            "casevac_pickup_x",
            "casevac_pickup_y",
            "casevac_pickup_z",
            "casevac_receiver_x",
            "casevac_receiver_y",
            "casevac_receiver_z",
            "casevac_gross_mass_kg",
            "casevac_payload_mass_kg",
            "casevac_occupancy",
            "casevac_power_margin_fraction",
            "casevac_power_margin_01",
            "casevac_power_margin_state",
            "casevac_agl_m",
            "casevac_limit_safe_band_min_agl_m",
            "casevac_limit_safe_band_max_agl_m",
            "casevac_limit_site_id",
            "casevac_limit_enter_footprint_radius_m",
            "casevac_limit_enter_lateral_speed_mps",
            "casevac_limit_enter_vertical_speed_mps",
            "casevac_limit_enter_pitch_deg",
            "casevac_limit_enter_bank_deg",
            "casevac_limit_stabilization_dwell_s",
            "casevac_safe_band_min_agl_m",
            "casevac_safe_band_max_agl_m",
            "casevac_lz_enter_radius_m",
            "casevac_lz_max_lateral_speed_mps",
            "casevac_lz_max_abs_vertical_speed_mps",
            "casevac_lz_max_abs_pitch_deg",
            "casevac_lz_max_abs_bank_deg",
            "casevac_lateral_speed_mps",
            "casevac_vertical_speed_mps",
            "casevac_weather_id",
            "casevac_wind_x_mps",
            "casevac_precipitation_mm_hr",
            "casevac_precipitation_01",
            "casevac_recent_events",
            "casevac_debrief",
            "px", "py", "pz",
            "pfx", "pfy", "pfz",
            "plx", "ply", "plz"
        };
        foreach (string field in required)
            Assert.True(root.TryGetProperty(field, out _), field);

        Assert.Equal("casevac.commander.v1",
            root.GetProperty("snapshot_schema_version").GetString());
        Assert.Equal("INGRESS",
            root.GetProperty("casevac_phase").GetString());
        Assert.Equal("AT_PICKUP",
            root.GetProperty("casevac_custody").GetString());
        Assert.Equal("PENDING",
            root.GetProperty("casevac_disposition").GetString());
        Assert.Equal(JsonValueKind.Null,
            root.GetProperty("casevac_debrief").ValueKind);
        GunsOnly.Sim.Casevac.CasevacFlightRuntime flight =
            session.CasevacFlight!;
        GunsOnly.Sim.Casevac.LandingZoneDefinition pickup =
            flight.Course.World.Pickup;
        Assert.Equal(
            flight.Course.World.ExposureField.SafeBandMinimumAglM,
            root.GetProperty(
                "casevac_limit_safe_band_min_agl_m").GetDouble(),
            2);
        Assert.Equal(
            flight.Course.World.ExposureField.SafeBandMaximumAglM,
            root.GetProperty(
                "casevac_limit_safe_band_max_agl_m").GetDouble(),
            2);
        Assert.Equal(
            root.GetProperty(
                "casevac_limit_safe_band_min_agl_m").GetDouble(),
            root.GetProperty(
                "casevac_safe_band_min_agl_m").GetDouble());
        Assert.Equal(
            root.GetProperty(
                "casevac_limit_safe_band_max_agl_m").GetDouble(),
            root.GetProperty(
                "casevac_safe_band_max_agl_m").GetDouble());
        Assert.Equal(
            pickup.Id,
            root.GetProperty("casevac_limit_site_id").GetString());
        Assert.Equal(
            pickup.EnterFootprintRadiusM,
            root.GetProperty(
                "casevac_limit_enter_footprint_radius_m").GetDouble(),
            2);
        Assert.Equal(
            pickup.GateProfile.MaximumEnterLateralGroundSpeedMps,
            root.GetProperty(
                "casevac_limit_enter_lateral_speed_mps").GetDouble(),
            3);
        Assert.Equal(
            pickup.GateProfile.MaximumEnterAbsoluteVerticalSpeedMps,
            root.GetProperty(
                "casevac_limit_enter_vertical_speed_mps").GetDouble(),
            3);
        Assert.Equal(
            pickup.GateProfile.MaximumEnterAbsolutePitchRad
                * 180.0 / Math.PI,
            root.GetProperty(
                "casevac_limit_enter_pitch_deg").GetDouble(),
            2);
        Assert.Equal(
            pickup.GateProfile.MaximumEnterAbsoluteBankRad
                * 180.0 / Math.PI,
            root.GetProperty(
                "casevac_limit_enter_bank_deg").GetDouble(),
            2);
        Assert.Equal(
            root.GetProperty(
                "casevac_limit_enter_footprint_radius_m").GetDouble(),
            root.GetProperty(
                "casevac_lz_enter_radius_m").GetDouble());
        Assert.Equal(
            root.GetProperty(
                "casevac_limit_enter_lateral_speed_mps").GetDouble(),
            root.GetProperty(
                "casevac_lz_max_lateral_speed_mps").GetDouble());
        Assert.Equal(
            root.GetProperty(
                "casevac_limit_enter_vertical_speed_mps").GetDouble(),
            root.GetProperty(
                "casevac_lz_max_abs_vertical_speed_mps").GetDouble());
        Assert.Equal(
            root.GetProperty(
                "casevac_limit_enter_pitch_deg").GetDouble(),
            root.GetProperty(
                "casevac_lz_max_abs_pitch_deg").GetDouble());
        Assert.Equal(
            root.GetProperty(
                "casevac_limit_enter_bank_deg").GetDouble(),
            root.GetProperty(
                "casevac_lz_max_abs_bank_deg").GetDouble());
        Assert.Equal(
            flight.Course.Mission.StabilizationDwellTicks
                / AircraftSim.TickHz,
            root.GetProperty(
                "casevac_limit_stabilization_dwell_s").GetDouble(),
            3);
        Assert.DoesNotContain("NaN", document.RootElement.GetRawText());
        Assert.DoesNotContain("Infinity", document.RootElement.GetRawText());
        Assert.DoesNotContain("patient",
            document.RootElement.GetRawText(),
            StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("diagnosis",
            document.RootElement.GetRawText(),
            StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("treatment",
            document.RootElement.GetRawText(),
            StringComparison.OrdinalIgnoreCase);

        JsonElement events =
            root.GetProperty("casevac_recent_events");
        Assert.NotEmpty(events.EnumerateArray());
        foreach (JsonElement missionEvent in events.EnumerateArray()) {
            Assert.Equal(
                new[] { "schemaVersion", "sequence", "kind" },
                missionEvent.EnumerateObject()
                    .Select(property => property.Name)
                    .ToArray());
        }
    }

    [Fact]
    public void LifecycleFieldsRepresentReadyActiveAndPausedWithoutAdvancingOnPause() {
        SimulationSession session = Staged();
        using (JsonDocument readyDocument = Project(session)) {
            JsonElement ready = readyDocument.RootElement;
            Assert.True(ready.GetProperty("ready").GetBoolean());
            Assert.False(ready.GetProperty("paused").GetBoolean());
            Assert.Equal("READY",
                ready.GetProperty("session_phase").GetString());
            Assert.Equal("READY",
                ready.GetProperty("casevac_phase").GetString());
        }

        session.Begin();
        session.StepFixed();
        long activeTick = session.Tick;
        using (JsonDocument activeDocument = Project(session)) {
            JsonElement active = activeDocument.RootElement;
            Assert.False(active.GetProperty("ready").GetBoolean());
            Assert.False(active.GetProperty("paused").GetBoolean());
            Assert.Equal("ACTIVE",
                active.GetProperty("session_phase").GetString());
            Assert.Equal(activeTick,
                active.GetProperty("tick").GetInt64());
        }

        session.SetPaused(true);
        for (int index = 0; index < 10; index++)
            session.StepFixed();
        using JsonDocument pausedDocument = Project(session);
        JsonElement paused = pausedDocument.RootElement;
        Assert.True(paused.GetProperty("paused").GetBoolean());
        Assert.Equal("PAUSED",
            paused.GetProperty("session_phase").GetString());
        Assert.Equal(activeTick, paused.GetProperty("tick").GetInt64());
    }

    [Fact]
    public void CasevacHotFrameIsColdOnlyAndNeverTouchesCombatGraph() {
        SimulationSession session = Staged(begin: true);
        var buffer = new double[SnapshotHotFrame.SlotCount];

        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double firstVersion =
            buffer[SnapshotHotFrame.ColdVersionIndex];
        Assert.True(firstVersion > 0.0);
        Assert.All(
            buffer.Where((_, index) =>
                index != SnapshotHotFrame.ColdVersionIndex),
            value => Assert.Equal(0.0, value));

        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        Assert.True(
            buffer[SnapshotHotFrame.ColdVersionIndex] > firstVersion);
        Assert.All(
            buffer.Where((_, index) =>
                index != SnapshotHotFrame.ColdVersionIndex),
            value => Assert.Equal(0.0, value));
    }

    [Theory]
    [InlineData(
        SimulationSession.LifecycleState.Active,
        GunsOnly.Sim.Casevac.CasevacPhase.Quiet,
        false)]
    [InlineData(
        SimulationSession.LifecycleState.Paused,
        GunsOnly.Sim.Casevac.CasevacPhase.Quiet,
        false)]
    [InlineData(
        SimulationSession.LifecycleState.Active,
        GunsOnly.Sim.Casevac.CasevacPhase.Complete,
        false)]
    [InlineData(
        SimulationSession.LifecycleState.Finished,
        GunsOnly.Sim.Casevac.CasevacPhase.Complete,
        true)]
    [InlineData(
        SimulationSession.LifecycleState.Finished,
        GunsOnly.Sim.Casevac.CasevacPhase.Aborted,
        true)]
    [InlineData(
        SimulationSession.LifecycleState.Finished,
        GunsOnly.Sim.Casevac.CasevacPhase.AircraftLost,
        true)]
    public void DebriefRemainsHiddenThroughQuietAndRequiresFinishedTerminalPhase(
        SimulationSession.LifecycleState lifecycle,
        GunsOnly.Sim.Casevac.CasevacPhase phase,
        bool expected) {
        Assert.Equal(
            expected,
            CasevacSnapshotProjection.DebriefVisible(
                lifecycle,
                phase));
    }
}
