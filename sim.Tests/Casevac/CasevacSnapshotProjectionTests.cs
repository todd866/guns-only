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

    sealed class CoordinateTerrain : ITerrainSurface {
        public TerrainBounds Bounds =>
            new(-20_000.0, 20_000.0, -20_000.0, 20_000.0);

        public double HorizontalResolutionM => 4.0;

        public bool TrySample(
            double eastM,
            double northM,
            out TerrainSample sample) {
            sample = new TerrainSample(
                HeightAt(eastM, northM),
                new Vec3D(0.0, 1.0, 0.0));
            return true;
        }

        public static double HeightAt(
            double eastM,
            double northM) =>
            50.0 + eastM * 0.001 + northM * 0.002;
    }

    static SimulationSession Staged(
        bool begin = false,
        ITerrainSurface? terrain = null) {
        var session = new SimulationSession(
            13,
            Carrier.DeckConfiguration.Angled,
            KoreaWeatherPresets.ForBeat(13));
        session.SetTerrainSurface(terrain ?? new FlatTerrain());
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
            "casevac_collision_obstacles",
            "casevac_routes",
            "casevac_gross_mass_kg",
            "casevac_payload_mass_kg",
            "casevac_occupancy",
            "casevac_power_margin_fraction",
            "casevac_power_margin_01",
            "casevac_power_margin_state",
            "casevac_energy_model_id",
            "casevac_energy_initial_kwh",
            "casevac_energy_remaining_kwh",
            "casevac_energy_remaining_fraction",
            "casevac_energy_planning_endurance_s",
            "casevac_energy_planning_endurance_min",
            "casevac_energy_planning_power_kw",
            "casevac_energy_planning_ground_speed_mps",
            "casevac_energy_planning_arrival_allowance_s",
            "casevac_energy_depleted",
            "casevac_destination_energy_target_id",
            "casevac_destination_energy_transit_s",
            "casevac_destination_reserve_kwh",
            "casevac_destination_reserve_fraction",
            "casevac_destination_reserve_endurance_s",
            "casevac_destination_reserve_min",
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
    public void ProjectsTheFictionalEnergyLedgerAndDeclaredPlanningAssumptions() {
        SimulationSession session = Staged(begin: true);
        GunsOnly.Sim.Casevac.CasevacFlightRuntime flight =
            session.CasevacFlight!;
        GunsOnly.Sim.Casevac.CasevacDestinationEnergyPlan plan =
            flight.DestinationEnergyPlan;

        using JsonDocument document = Project(session);
        JsonElement root = document.RootElement;

        Assert.Equal(
            GunsOnly.Sim.Casevac.CasevacFlightRuntime.EnergyModelId,
            root.GetProperty("casevac_energy_model_id").GetString());
        Assert.Equal(
            flight.InitialUsableEnergyJ / 3_600_000.0,
            root.GetProperty("casevac_energy_initial_kwh").GetDouble(),
            4);
        Assert.Equal(
            flight.RemainingUsableEnergyJ / 3_600_000.0,
            root.GetProperty("casevac_energy_remaining_kwh").GetDouble(),
            4);
        Assert.Equal(
            flight.RemainingEnergyFraction,
            root.GetProperty(
                "casevac_energy_remaining_fraction").GetDouble(),
            6);
        Assert.Equal(
            flight.PlanningEnduranceSeconds,
            root.GetProperty(
                "casevac_energy_planning_endurance_s").GetDouble(),
            3);
        Assert.Equal(
            flight.PlanningEnduranceSeconds / 60.0,
            root.GetProperty(
                "casevac_energy_planning_endurance_min").GetDouble(),
            3);
        Assert.Equal(
            GunsOnly.Sim.Casevac.CasevacFlightRuntime.PlanningPowerW
                / 1_000.0,
            root.GetProperty(
                "casevac_energy_planning_power_kw").GetDouble(),
            3);
        Assert.Equal(
            GunsOnly.Sim.Casevac.CasevacFlightRuntime
                .PlanningGroundSpeedMps,
            root.GetProperty(
                "casevac_energy_planning_ground_speed_mps").GetDouble(),
            3);
        Assert.Equal(
            GunsOnly.Sim.Casevac.CasevacFlightRuntime
                .PlanningArrivalAllowanceSeconds,
            root.GetProperty(
                "casevac_energy_planning_arrival_allowance_s").GetDouble(),
            3);
        Assert.False(
            root.GetProperty("casevac_energy_depleted").GetBoolean());
        Assert.Equal(
            plan.TargetId,
            root.GetProperty(
                "casevac_destination_energy_target_id").GetString());
        Assert.Equal(
            plan.PlannedTransitSeconds,
            root.GetProperty(
                "casevac_destination_energy_transit_s").GetDouble(),
            3);
        Assert.Equal(
            plan.ProjectedReserveEnergyJ / 3_600_000.0,
            root.GetProperty(
                "casevac_destination_reserve_kwh").GetDouble(),
            4);
        Assert.Equal(
            plan.ProjectedReserveFraction,
            root.GetProperty(
                "casevac_destination_reserve_fraction").GetDouble(),
            6);
        Assert.Equal(
            plan.ProjectedReserveEnduranceSeconds,
            root.GetProperty(
                "casevac_destination_reserve_endurance_s").GetDouble(),
            3);
        Assert.Equal(
            plan.ProjectedReserveEnduranceSeconds / 60.0,
            root.GetProperty(
                "casevac_destination_reserve_min").GetDouble(),
            3);
        Assert.True(
            root.GetProperty(
                "casevac_energy_remaining_kwh").GetDouble()
            < root.GetProperty(
                "casevac_energy_initial_kwh").GetDouble());
    }

    [Fact]
    public void ProjectsEveryResolvedCollisionPrimitiveWithoutBrowserInference() {
        SimulationSession session = Staged(begin: true);

        using JsonDocument document = Project(session);
        JsonElement root = document.RootElement;
        JsonElement[] projected = root
            .GetProperty("casevac_collision_obstacles")
            .EnumerateArray()
            .ToArray();
        IReadOnlyList<GunsOnly.Sim.Casevac.CasevacResolvedCollisionObstacle>
            expected = session.CasevacFlight!.ResolvedCollisionObstacles;

        Assert.Equal(expected.Count, projected.Length);
        Assert.InRange(
            projected.Length,
            1,
            CasevacSnapshotProjection
                .MaximumProjectedCollisionObstacleCount);
        for (int index = 0; index < projected.Length; index++) {
            GunsOnly.Sim.Casevac.CasevacResolvedCollisionObstacle obstacle =
                expected[index];
            JsonElement item = projected[index];
            Assert.Equal(
                obstacle.Id,
                item.GetProperty("id").GetString());
            Assert.Equal(
                obstacle.RadiusM,
                item.GetProperty("radius_m").GetDouble(),
                6);

            if (obstacle.Primitive
                == GunsOnly.Sim.Casevac.CasevacCollisionPrimitive
                    .CapsuleSegment) {
                Assert.Equal(
                    new[] {
                        "id", "primitive", "radius_m",
                        "start_world_m", "end_world_m"
                    },
                    item.EnumerateObject()
                        .Select(property => property.Name)
                        .ToArray());
                Assert.Equal(
                    "CAPSULE_SEGMENT",
                    item.GetProperty("primitive").GetString());
                AssertProjectedPoint(
                    item.GetProperty("start_world_m"),
                    obstacle.FirstWorldM);
                AssertProjectedPoint(
                    item.GetProperty("end_world_m"),
                    obstacle.SecondWorldM);
            } else {
                Assert.Equal(
                    new[] {
                        "id", "primitive", "radius_m",
                        "minimum_world_m", "maximum_world_m"
                    },
                    item.EnumerateObject()
                        .Select(property => property.Name)
                        .ToArray());
                Assert.Equal(
                    "AXIS_ALIGNED_BOX",
                    item.GetProperty("primitive").GetString());
                AssertProjectedPoint(
                    item.GetProperty("minimum_world_m"),
                    obstacle.FirstWorldM);
                AssertProjectedPoint(
                    item.GetProperty("maximum_world_m"),
                    obstacle.SecondWorldM);
            }
        }
    }

    [Fact]
    public void ProjectsBoundedExactReferenceRoutesWithPresentationLabels() {
        SimulationSession session = Staged(
            begin: true,
            terrain: new CoordinateTerrain());

        using JsonDocument document = Project(session);
        JsonElement[] projected = document.RootElement
            .GetProperty("casevac_routes")
            .EnumerateArray()
            .ToArray();
        IReadOnlyList<GunsOnly.Sim.Casevac.CasevacResolvedRoute>
            expected = session.CasevacFlight!.ResolvedRoutes;

        Assert.Equal(expected.Count, projected.Length);
        Assert.InRange(
            projected.Length,
            1,
            CasevacSnapshotProjection.MaximumProjectedRouteCount);
        Assert.Equal(
            new[] {
                "Direct pickup",
                "Masked pickup",
                "Direct handoff",
                "Masked handoff"
            },
            projected.Select(route =>
                    route.GetProperty("label").GetString())
                .ToArray());
        Assert.Equal(
            new[] { "DIRECT", "MASKED", "DIRECT", "MASKED" },
            projected.Select(route =>
                    route.GetProperty("kind").GetString())
                .ToArray());

        for (int routeIndex = 0;
            routeIndex < projected.Length;
            routeIndex++) {
            GunsOnly.Sim.Casevac.CasevacResolvedRoute route =
                expected[routeIndex];
            JsonElement item = projected[routeIndex];
            Assert.Equal(route.Id,
                item.GetProperty("id").GetString());
            Assert.Equal(route.StartLocationId,
                item.GetProperty("start_location_id").GetString());
            Assert.Equal(route.EndLocationId,
                item.GetProperty("end_location_id").GetString());
            Assert.Equal(route.HorizontalLengthM,
                item.GetProperty("horizontal_length_m").GetDouble(),
                3);
            double expectedBearing =
                PositiveDegrees(Math.Atan2(
                    route.Points[1].EastM
                        - route.Points[0].EastM,
                    route.Points[1].NorthM
                        - route.Points[0].NorthM));
            Assert.Equal(expectedBearing,
                item.GetProperty("initial_bearing_deg").GetDouble(),
                3);

            JsonElement[] points = item
                .GetProperty("control_points")
                .EnumerateArray()
                .ToArray();
            Assert.Equal(route.Points.Count, points.Length);
            Assert.InRange(
                points.Length,
                2,
                CasevacSnapshotProjection
                    .MaximumProjectedRouteControlPointCount);
            for (int pointIndex = 0;
                pointIndex < points.Length;
                pointIndex++) {
                GunsOnly.Sim.Casevac.CasevacResolvedRouteControlPoint
                    point = route.Points[pointIndex];
                JsonElement projectedPoint = points[pointIndex];
                Assert.Equal(point.Id,
                    projectedPoint.GetProperty("id").GetString());
                Assert.False(string.IsNullOrWhiteSpace(
                    projectedPoint.GetProperty(
                        "landmark_label").GetString()));
                Assert.Equal(point.EastM,
                    projectedPoint.GetProperty("east_m").GetDouble(),
                    3);
                Assert.Equal(point.SurfaceElevationM,
                    projectedPoint.GetProperty(
                        "surface_elevation_m").GetDouble(),
                    3);
                Assert.Equal(
                    CoordinateTerrain.HeightAt(
                        point.EastM,
                        point.NorthM),
                    projectedPoint.GetProperty(
                        "surface_elevation_m").GetDouble(),
                    3);
                Assert.Equal(point.NorthM,
                    projectedPoint.GetProperty("north_m").GetDouble(),
                    3);
                Assert.Equal(point.TargetAglM,
                    projectedPoint.GetProperty(
                        "target_agl_m").GetDouble(),
                    3);
                Assert.Equal(point.CorridorRadiusM,
                    projectedPoint.GetProperty(
                        "corridor_radius_m").GetDouble(),
                    3);
            }
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
    public void CasevacHotFrameUsesDedicatedBlockAndNeverTouchesCombatGraph() {
        SimulationSession session = Staged(begin: true);
        var buffer = new double[SnapshotHotFrame.SlotCount];
        using JsonDocument layoutDocument =
            JsonDocument.Parse(SnapshotHotFrame.LayoutJson());
        JsonElement layout = layoutDocument.RootElement;
        JsonElement casevacBlock = layout.GetProperty("casevac_block");
        int casevacPresenceIndex =
            casevacBlock.GetProperty("presence_index").GetInt32();

        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        double firstVersion =
            buffer[SnapshotHotFrame.ColdVersionIndex];
        Assert.True(firstVersion > 0.0);
        Assert.Equal(1.0, buffer[casevacPresenceIndex]);
        Assert.Contains(
            casevacBlock.GetProperty("slots").EnumerateArray(),
            slot => {
                int index = slot.GetProperty("index").GetInt32();
                return buffer[index] != 0.0
                    && !double.IsNaN(buffer[index]);
            });
        foreach (JsonElement block in
            layout.GetProperty("blocks").EnumerateArray()) {
            int presenceIndex =
                block.GetProperty("presence_index").GetInt32();
            if (presenceIndex >= 0)
                Assert.Equal(0.0, buffer[presenceIndex]);
        }

        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        Assert.Equal(
            firstVersion,
            buffer[SnapshotHotFrame.ColdVersionIndex]);
        Assert.Equal(1.0, buffer[casevacPresenceIndex]);
    }

    static void AssertProjectedPoint(
        JsonElement projected,
        in GunsOnly.Sim.Vec3D expected) {
        Assert.Equal(
            new[] { "x", "y", "z" },
            projected.EnumerateObject()
                .Select(property => property.Name)
                .ToArray());
        Assert.Equal(expected.X,
            projected.GetProperty("x").GetDouble(), 6);
        Assert.Equal(expected.Y,
            projected.GetProperty("y").GetDouble(), 6);
        Assert.Equal(expected.Z,
            projected.GetProperty("z").GetDouble(), 6);
    }

    static double PositiveDegrees(double angleRad) {
        double degrees = angleRad * 180.0 / Math.PI % 360.0;
        return degrees < 0.0 ? degrees + 360.0 : degrees;
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
