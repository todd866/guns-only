using System.Globalization;
using System.Text;
using GunsOnly.Sim;
using GunsOnly.Sim.Casevac;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Web;

/// <summary>
/// Observer-safe browser projection for the flight-first CASEVAC mission.
///
/// The projection deliberately accepts the generic session and then reads only the dedicated
/// CASEVAC runtime. It never reaches through the legacy fixed-wing, opponent, gun, fuel, or
/// physiology accessors. The schema contains aircraft, route, custody, clock, terminal-contact,
/// weather, and assessed debrief evidence only; it contains no patient identity, clinical state,
/// treatment, survival, or clinical outcome.
/// </summary>
internal static class CasevacSnapshotProjection {
    public const string SchemaVersion = "casevac.commander.v1";
    const double RadiansToDegrees = 180.0 / Math.PI;
    // Presentation-only normalization for the deterministic weather sample. The dimensional
    // mm/hr value remains published beside it and retains simulation truth; 4 mm/hr is the
    // declared full-strength rain visual, not a meteorological severity classification.
    const double PresentationRainFullScaleMmPerHour = 4.0;

    public static string BuildState(
        SimulationSession session,
        double worldOriginEastM,
        double worldOriginNorthM,
        bool worldOriginConfigured) {
        ArgumentNullException.ThrowIfNull(session);
        CasevacFlightRuntime flight = session.CasevacFlight
            ?? throw new InvalidOperationException(
                "A CASEVAC projection requires a staged CASEVAC flight runtime.");
        CasevacMissionSnapshot mission = flight.Snapshot;
        PlayerVehicleState vehicle = flight.VehicleState;
        PlayerVehicleObservation observation = flight.VehicleObservation;
        LandingZoneObservation landingZone = flight.LastLandingZone;
        CasevacTargetGuidance guidance = flight.TargetGuidance;
        MissionEnvironmentContract environment = session.Beat.EnvironmentIdentity;
        WeatherProfile? weather = session.Weather;

        Vec3D forward = vehicle.BodyAttitude.Rotate(new Vec3D(0.0, 0.0, 1.0));
        Vec3D up = vehicle.BodyAttitude.Rotate(new Vec3D(0.0, 1.0, 0.0));
        Vec3D wind = weather?.Wind.Sample(vehicle.PositionWorldM)
            ?? observation.WindVelocityMps;
        CloudSample cloud = (weather?.Clouds ?? ClearCloudField.Instance)
            .Sample(vehicle.PositionWorldM, session.TimeSeconds);
        double aglM = flight.LastTickObservation?.ClearanceM
            ?? Math.Max(
                0.0,
                vehicle.PositionWorldM.Y
                    - flight.StartLocation.SurfaceElevationM);
        string sessionPhase = session.Lifecycle switch {
            SimulationSession.LifecycleState.Ready => "READY",
            SimulationSession.LifecycleState.Paused => "PAUSED",
            SimulationSession.LifecycleState.Finished => "FINISHED",
            _ => "ACTIVE"
        };
        bool ready =
            session.Lifecycle == SimulationSession.LifecycleState.Ready;
        bool paused =
            session.Lifecycle == SimulationSession.LifecycleState.Paused;
        bool finished =
            session.Lifecycle == SimulationSession.LifecycleState.Finished;
        string gateState = GateState(mission, landingZone);
        string dwell = DwellKind(mission.Phase);
        double dwellProgress01 = DwellProgress01(
            mission,
            flight.Course.Mission.StabilizationDwellTicks);
        LandingZoneDefinition? limitSite =
            ActiveLimitSite(flight, mission);
        LandingZoneGateProfileDefinition? gateLimits =
            limitSite?.GateProfile;
        CasevacAssessment? assessment = mission.Disposition
            == CasevacDisposition.Pending
                ? null
                : CasevacAssessmentEngine.Assess(flight.Evidence, mission);

        var json = new FlatJson();
        json.String("snapshot_schema_version", SchemaVersion);
        json.Boolean("casevac_mission", true);
        json.Number("casevac_contract_schema_version", mission.SchemaVersion);
        json.Boolean("opponent_present", false);
        // Compatibility lifecycle consumers may read these generic fields, but CASEVAC never
        // projects a combat-shaped Victory/Defeat/Draw result.
        json.String("sortie_outcome", "");
        json.String("pending_sortie_outcome", "");
        json.String("mission_definition_id", session.Beat.MissionIdentity.Id);
        json.String("rules_of_engagement",
            session.Beat.MissionIdentity.RulesOfEngagement);
        json.String("player_aircraft_id", session.Beat.PlayerAircraft.Id);
        json.String("player_aircraft_name",
            session.Beat.PlayerAircraft.DisplayName);
        json.String("player_presentation_id",
            session.Beat.PlayerAircraft.PresentationId);
        json.String("player_entity_id",
            $"entity.player.{session.PlayerSpawnSequence}");
        json.String("player_vehicle_kind", "VERTICAL_LIFT");
        json.String("camera_profile_id",
            "camera.vertical-lift.mission-commander.v1");
        json.String("hud_profile_id", "hud.casevac.commander.v1");
        json.String("input_profile_id",
            "input.vertical-lift.velocity-command.v1");
        json.String("audio_profile_id", "audio.vertical-lift.air-ambulance.v1");

        json.String("theatre_id", environment.TheatreId);
        json.String("location_id", environment.LocationId);
        json.String("world_frame_id", environment.WorldFrameId);
        json.String("terrain_profile_id", environment.TerrainProfileId);
        json.String("terrain_macro_scenery_profile",
            environment.MacroSceneryProfile);
        json.String("terrain_scenery_profile",
            environment.MicroSceneryProfile);
        json.Boolean("terrain_macro_required", true);
        json.Boolean("terrain_micro_required",
            environment.FrameKind
                == MissionEnvironmentFrameKind.LocalHeroCell);
        json.Number("terrain_streaming_radius_m",
            environment.PreferredTerrainStreamingRadiusM, 1);
        json.Boolean("world_origin_configured", worldOriginConfigured);
        json.Number("world_origin_east_m", worldOriginEastM, 1);
        json.Number("world_origin_north_m", worldOriginNorthM, 1);
        json.Number("terrain_placement_east_m",
            environment.MultiplayerTerrainShared
                ? -worldOriginEastM
                : -environment.TerrainSourceAnchorEastM,
            1);
        json.Number("terrain_placement_north_m",
            environment.MultiplayerTerrainShared
                ? -worldOriginNorthM
                : -environment.TerrainSourceAnchorNorthM,
            1);
        json.Boolean("multiplayer_terrain_shared",
            worldOriginConfigured && environment.MultiplayerTerrainShared);
        json.Boolean("terrain_present", session.Terrain is not null);

        json.Number("t", session.TimeSeconds, 4);
        json.Number("tick", session.Tick);
        json.Boolean("ready", ready);
        json.Boolean("paused", paused);
        json.Boolean("finished", finished);
        json.String("session_phase", sessionPhase);

        json.Number("px", vehicle.PositionWorldM.X, 3);
        json.Number("py", vehicle.PositionWorldM.Y, 3);
        json.Number("pz", vehicle.PositionWorldM.Z, 3);
        json.Number("vx", vehicle.GroundVelocityMps.X, 3);
        json.Number("vy", vehicle.GroundVelocityMps.Y, 3);
        json.Number("vz", vehicle.GroundVelocityMps.Z, 3);
        json.Number("pfx", forward.X, 5);
        json.Number("pfy", forward.Y, 5);
        json.Number("pfz", forward.Z, 5);
        // pl* remains the production camera's player-up basis. pu* names the same fact
        // explicitly for CASEVAC-only consumers.
        json.Number("plx", up.X, 5);
        json.Number("ply", up.Y, 5);
        json.Number("plz", up.Z, 5);
        json.Number("pux", up.X, 5);
        json.Number("puy", up.Y, 5);
        json.Number("puz", up.Z, 5);
        json.Number("casevac_pitch_deg",
            observation.PitchRad * RadiansToDegrees, 3);
        json.Number("casevac_bank_deg",
            observation.RollRad * RadiansToDegrees, 3);
        json.Number("casevac_heading_deg",
            PositiveDegrees(observation.YawRad), 3);

        json.String("casevac_scenario_id", mission.ScenarioId);
        json.Number("casevac_mission_epoch_sequence",
            mission.MissionEpochSequence);
        json.String("casevac_phase", PhaseToken(mission.Phase));
        json.String("casevac_custody", CustodyToken(mission.Custody));
        json.String("casevac_disposition",
            DispositionToken(mission.Disposition));
        json.Number("casevac_active_mission_ticks",
            mission.ActiveMissionTicks);
        json.Boolean("casevac_clock_running", mission.ClockRunning);
        json.Boolean("casevac_quiet",
            mission.Phase == CasevacPhase.Quiet);
        json.Number("casevac_quiet_progress_01",
            mission.Phase == CasevacPhase.Quiet
                ? Fraction(
                    mission.QuietProgressTicks,
                    flight.Course.Mission.QuietAftermathTicks)
                : 0.0,
            4);

        json.NullableString("casevac_target_site_id", guidance.TargetId);
        json.NullableNumber("casevac_target_x",
            guidance.TargetId is null ? null : guidance.TargetWorldM.X, 3);
        json.NullableNumber("casevac_target_y",
            guidance.TargetId is null ? null : guidance.TargetWorldM.Y, 3);
        json.NullableNumber("casevac_target_z",
            guidance.TargetId is null ? null : guidance.TargetWorldM.Z, 3);
        json.NullableNumber("casevac_target_range_m",
            guidance.TargetId is null ? null : guidance.HorizontalRangeM, 1);
        json.NullableNumber("casevac_target_bearing_deg",
            guidance.TargetId is null
                ? null
                : PositiveDegrees(guidance.AbsoluteBearingRad),
            2);
        json.NullableNumber("casevac_target_relative_bearing_deg",
            guidance.TargetId is null
                ? null
                : guidance.RelativeBearingRad * RadiansToDegrees,
            2);
        json.NullableNumber("casevac_target_eta_s",
            guidance.TargetId is null
                ? null
                : guidance.EstimatedTimeToTargetSeconds,
            1);

        json.Number("casevac_call_age_s",
            TicksToSeconds(mission.CallAgeTicks), 3);
        json.Number("casevac_requested_handoff_age_s",
            TicksToSeconds(mission.RequestedHandoffAgeTicks), 3);
        json.String("casevac_window",
            mission.RequestedHandoffWindowPassed ? "PASSED" : "OPEN");
        json.String("casevac_requested_window_state",
            mission.RequestedHandoffWindowPassed ? "PASSED" : "OPEN");
        json.Boolean("casevac_requested_window_passed",
            mission.RequestedHandoffWindowPassed);
        json.NullableNumber("casevac_capsule_secured_call_age_s",
            TicksToSeconds(mission.CapsuleSecuredCallAgeTicks), 3);
        json.NullableNumber("casevac_handoff_call_age_s",
            TicksToSeconds(mission.HandoffCallAgeTicks), 3);

        json.String("casevac_gate", gateState);
        json.String("casevac_gate_state", gateState);
        json.String("casevac_gate_class", GateClassToken(
            landingZone.GateClass));
        json.Boolean("casevac_stable_contact", mission.StableContact);
        json.Boolean("casevac_surface_contact",
            landingZone.SurfaceContact);
        json.NullableString("casevac_contact_site_id",
            landingZone.SiteId);
        json.Number("casevac_approach_attempt_id",
            mission.CurrentApproachAttemptId);
        json.Number("casevac_stabilization_progress_ticks",
            mission.StabilizationProgressTicks);
        json.Number("casevac_stabilization_required_ticks",
            flight.Course.Mission.StabilizationDwellTicks);
        json.String("casevac_dwell", dwell);
        json.String("casevac_dwell_kind", dwell);
        json.Number("casevac_dwell_progress_01",
            dwellProgress01, 4);
        json.Number("casevac_operation_progress_ticks",
            mission.OperationProgressTicks);
        json.Number("casevac_operation_required_ticks",
            mission.OperationRequiredTicks);

        AppendLocation(json, "casevac_start", flight.StartLocation);
        AppendLocation(json, "casevac_pickup", flight.PickupLocation);
        AppendLocation(json, "casevac_receiver", flight.ReceiverLocation);
        AppendLocation(json, "casevac_safe_exit", flight.SafeExitLocation);

        json.Boolean("casevac_vehicle_flyable", flight.VehicleFlyable);
        json.String("casevac_contact_kind",
            ContactToken(observation.Contact.Kind));
        json.NullableString("casevac_contact_surface_id",
            observation.Contact.SurfaceId);
        json.Boolean("casevac_contact_stable",
            observation.Contact.IsStable);
        json.Number("casevac_agl_m", aglM, 3);
        json.Number("casevac_gross_mass_kg",
            observation.GrossMassKg, 2);
        json.Number("casevac_payload_mass_kg",
            mission.PayloadMassKg, 2);
        json.String("casevac_occupancy",
            mission.Custody == CapsuleCustody.InAircraft
                ? "OCCUPIED"
                : "EMPTY");
        json.String("casevac_power_assessment",
            observation.Power.Assessment == VehiclePowerAssessment.Assessed
                ? "ASSESSED"
                : "NOT_ASSESSED");
        json.NullableNumber("casevac_power_margin_fraction",
            observation.Power.Assessment == VehiclePowerAssessment.Assessed
                ? observation.Power.HoverPowerMarginFraction
                : null,
            4);
        json.NullableNumber("casevac_power_margin_01",
            observation.Power.Assessment == VehiclePowerAssessment.Assessed
                ? Math.Clamp(
                    observation.Power.HoverPowerMarginFraction,
                    0.0,
                    1.0)
                : null,
            4);
        json.String("casevac_power_margin_state",
            observation.Power.Assessment == VehiclePowerAssessment.Assessed
                ? "ASSESSED"
                : "NOT_ASSESSED");
        json.NullableNumber("casevac_available_power_w",
            observation.Power.Assessment == VehiclePowerAssessment.Assessed
                ? observation.Power.AvailablePowerW
                : null,
            1);
        json.NullableNumber("casevac_applied_power_w",
            observation.Power.Assessment == VehiclePowerAssessment.Assessed
                ? observation.Power.AppliedPowerW
                : null,
            1);
        json.String("casevac_masking_state",
            MaskingToken(flight.LastExposure.MaskingState));
        json.Boolean("casevac_within_safe_masking_band",
            flight.LastExposure.WithinSafeMaskingBand);
        json.Number("casevac_limit_safe_band_min_agl_m",
            flight.Course.World.ExposureField.SafeBandMinimumAglM,
            2);
        json.Number("casevac_limit_safe_band_max_agl_m",
            flight.Course.World.ExposureField.SafeBandMaximumAglM,
            2);
        json.Number("casevac_safe_band_min_agl_m",
            flight.Course.World.ExposureField.SafeBandMinimumAglM,
            2);
        json.Number("casevac_safe_band_max_agl_m",
            flight.Course.World.ExposureField.SafeBandMaximumAglM,
            2);
        json.NullableString("casevac_limit_site_id",
            limitSite?.Id);
        json.NullableNumber("casevac_limit_enter_footprint_radius_m",
            limitSite?.EnterFootprintRadiusM,
            2);
        json.NullableNumber("casevac_limit_enter_lateral_speed_mps",
            gateLimits?.MaximumEnterLateralGroundSpeedMps,
            3);
        json.NullableNumber("casevac_limit_enter_vertical_speed_mps",
            gateLimits?.MaximumEnterAbsoluteVerticalSpeedMps,
            3);
        json.NullableNumber("casevac_limit_enter_pitch_deg",
            gateLimits is null
                ? null
                : gateLimits.MaximumEnterAbsolutePitchRad
                    * RadiansToDegrees,
            2);
        json.NullableNumber("casevac_limit_enter_bank_deg",
            gateLimits is null
                ? null
                : gateLimits.MaximumEnterAbsoluteBankRad
                    * RadiansToDegrees,
            2);
        json.NullableNumber("casevac_lz_enter_radius_m",
            limitSite?.EnterFootprintRadiusM,
            2);
        json.NullableNumber("casevac_lz_max_lateral_speed_mps",
            gateLimits?.MaximumEnterLateralGroundSpeedMps,
            3);
        json.NullableNumber("casevac_lz_max_abs_vertical_speed_mps",
            gateLimits?.MaximumEnterAbsoluteVerticalSpeedMps,
            3);
        json.NullableNumber("casevac_lz_max_abs_pitch_deg",
            gateLimits is null
                ? null
                : gateLimits.MaximumEnterAbsolutePitchRad
                    * RadiansToDegrees,
            2);
        json.NullableNumber("casevac_lz_max_abs_bank_deg",
            gateLimits is null
                ? null
                : gateLimits.MaximumEnterAbsoluteBankRad
                    * RadiansToDegrees,
            2);
        json.Number("casevac_limit_stabilization_dwell_s",
            TicksToSeconds(
                flight.Course.Mission.StabilizationDwellTicks),
            3);
        json.Number("casevac_lateral_speed_mps",
            Math.Sqrt(
                observation.GroundVelocityMps.X
                    * observation.GroundVelocityMps.X
                + observation.GroundVelocityMps.Z
                    * observation.GroundVelocityMps.Z),
            3);
        json.Number("casevac_vertical_speed_mps",
            observation.VerticalSpeedMps,
            3);

        json.String("casevac_weather_id",
            weather?.Id ?? "weather.unspecified.v1");
        json.Number("casevac_wind_x_mps", wind.X, 3);
        json.Number("casevac_wind_y_mps", wind.Y, 3);
        json.Number("casevac_wind_z_mps", wind.Z, 3);
        json.Number("casevac_visibility_m", cloud.VisibilityM, 1);
        // The weather authority publishes a dimensional precipitation rate, not an invented
        // normalized rain intensity. Presentation may consume this exact rate or omit rain.
        json.Number("casevac_precipitation_mm_hr",
            cloud.PrecipitationMmPerHour, 3);
        json.Number("casevac_precipitation_01",
            Math.Clamp(
                cloud.PrecipitationMmPerHour
                    / PresentationRainFullScaleMmPerHour,
                0.0,
                1.0),
            4);

        json.Raw("casevac_recent_events",
            RecentEventsJson(flight.RecentEvents));
        json.String("casevac_assessment_safe",
            AssessmentStatusToken(assessment?.Safe.Status));
        json.String("casevac_assessment_controlled",
            AssessmentStatusToken(assessment?.Controlled.Status));
        json.String("casevac_assessment_masked",
            AssessmentStatusToken(assessment?.Masked.Status));
        json.String("casevac_assessment_timely",
            AssessmentStatusToken(assessment?.Timely.Status));
        json.String("casevac_primary_correction",
            assessment?.PrimaryCorrection.CorrectionText ?? "");
        json.Raw("casevac_debrief",
            assessment is null
                ? "null"
                : DebriefJson(
                    flight,
                    mission,
                    assessment,
                    DebriefVisible(
                        session.Lifecycle,
                        mission.Phase)));
        return json.Finish();
    }

    internal static bool DebriefVisible(
        SimulationSession.LifecycleState lifecycle,
        CasevacPhase phase) =>
        lifecycle == SimulationSession.LifecycleState.Finished
        && phase is CasevacPhase.Complete
            or CasevacPhase.Aborted
            or CasevacPhase.AircraftLost;

    static void AppendLocation(
        FlatJson json,
        string prefix,
        in CasevacResolvedLocation location) {
        json.String(prefix + "_id", location.Id);
        json.Number(prefix + "_x", location.EastM, 3);
        json.Number(prefix + "_y", location.SurfaceElevationM, 3);
        json.Number(prefix + "_z", location.NorthM, 3);
        json.Number(prefix + "_radius_m", location.RadiusM, 2);
        json.Number(prefix + "_height_m", location.HeightM, 2);
    }

    static LandingZoneDefinition? ActiveLimitSite(
        CasevacFlightRuntime flight,
        CasevacMissionSnapshot mission) {
        if (StringComparer.Ordinal.Equals(
                mission.TargetSiteId,
                flight.Course.World.Pickup.Id))
            return flight.Course.World.Pickup;
        if (StringComparer.Ordinal.Equals(
                mission.TargetSiteId,
                flight.Course.World.Receiver.Id))
            return flight.Course.World.Receiver;
        return mission.Phase switch {
            CasevacPhase.Ready
                or CasevacPhase.Ingress
                or CasevacPhase.PickupApproach
                or CasevacPhase.Loading =>
                    flight.Course.World.Pickup,
            CasevacPhase.Outbound
                or CasevacPhase.DropoffApproach
                or CasevacPhase.Handoff
                or CasevacPhase.Quiet
                or CasevacPhase.Complete =>
                    flight.Course.World.Receiver,
            _ => null
        };
    }

    static string RecentEventsJson(
        IReadOnlyList<CasevacMissionEventRecord> events) {
        var json = new StringBuilder("[");
        for (int index = 0; index < events.Count; index++) {
            if (index > 0) json.Append(',');
            CasevacMissionEventRecord missionEvent = events[index];
            json.Append("{\"schemaVersion\":")
                .Append(missionEvent.SchemaVersion)
                .Append(",\"sequence\":")
                .Append(missionEvent.Sequence)
                .Append(",\"kind\":")
                .Append(SnapshotJson.JsonString(
                    EventToken(missionEvent.Kind)))
                .Append('}');
        }
        return json.Append(']').ToString();
    }

    static string DebriefJson(
        CasevacFlightRuntime flight,
        CasevacMissionSnapshot mission,
        CasevacAssessment assessment,
        bool visible) {
        CasevacEvidenceRecorder evidence = flight.Evidence;
        CasevacLandingZoneEvidence pickup =
            evidence.GetLandingZoneEvidence(CasevacTerminalLeg.Pickup);
        CasevacLandingZoneEvidence receiver =
            evidence.GetLandingZoneEvidence(CasevacTerminalLeg.Receiver);
        long assessedMaskingTicks =
            evidence.RouteMaskedTicks + evidence.RouteExposedTicks;
        double? safeBandPercent = evidence.RouteObservedTicks > 0
            ? 100.0 * evidence.RouteWithinSafeMaskingBandTicks
                / evidence.RouteObservedTicks
            : null;
        long? pickupToHandoffTicks =
            mission.CapsuleSecuredCallAgeTicks.HasValue
            && mission.HandoffCallAgeTicks.HasValue
            && mission.HandoffCallAgeTicks.Value
                >= mission.CapsuleSecuredCallAgeTicks.Value
                ? mission.HandoffCallAgeTicks.Value
                    - mission.CapsuleSecuredCallAgeTicks.Value
                : null;

        var root = new FlatJson();
        root.Boolean("visible", visible);
        root.String("disposition",
            DispositionToken(mission.Disposition));
        root.NullableNumber("handoffCallAgeSeconds",
            TicksToSeconds(mission.HandoffCallAgeTicks), 3);
        root.Number("requestedHandoffAgeSeconds",
            TicksToSeconds(mission.RequestedHandoffAgeTicks), 3);

        var axes = new FlatJson();
        var safe = new FlatJson();
        safe.String("status", SafeStatus(assessment.Safe.Status));
        safe.NullableNumber("minimumClearanceM",
            double.IsFinite(evidence.MinimumClearanceM)
                ? evidence.MinimumClearanceM
                : null,
            3);
        safe.Number("obstacleContacts",
            flight.ObstacleCollisionLatched ? 1 : 0);
        safe.Number("protectionInterventions",
            evidence.ProtectionInterventionEdges);
        axes.Raw("safe", safe.Finish());

        var controlled = new FlatJson();
        controlled.String("status",
            ControlledStatus(assessment.Controlled.Status));
        controlled.Number("pickupApproaches",
            evidence.GetEventCount(
                CasevacEventKind.PickupApproachEntered));
        controlled.Number("handoffApproaches",
            evidence.GetEventCount(
                CasevacEventKind.DropoffApproachEntered));
        controlled.Number("approachDiscontinuations",
            evidence.GetEventCount(
                CasevacEventKind.ApproachDiscontinued));
        controlled.Number("loadingInterruptions",
            evidence.LoadingPauseCount + evidence.LoadingResetCount);
        controlled.Number("handoffInterruptions",
            evidence.HandoffPauseCount + evidence.HandoffResetCount);
        // Retain exact gate aggregates for future presentation without asking the browser to
        // reconstruct them from samples.
        controlled.Number("pickupAdvanceTicks", pickup.AdvanceTicks);
        controlled.Number("pickupHoldTicks", pickup.HoldTicks);
        controlled.Number("pickupBreakTicks", pickup.BreakTicks);
        controlled.Number("handoffAdvanceTicks", receiver.AdvanceTicks);
        controlled.Number("handoffHoldTicks", receiver.HoldTicks);
        controlled.Number("handoffBreakTicks", receiver.BreakTicks);
        axes.Raw("controlled", controlled.Finish());

        var masked = new FlatJson();
        masked.String("status",
            MaskedStatus(assessment.Masked.Status,
                evidence.RouteMaskedTicks,
                evidence.RouteExposedTicks));
        masked.NullableNumber("safeBandPercent", safeBandPercent, 2);
        masked.Number("exposedSeconds",
            TicksToSeconds(evidence.RouteExposedTicks), 3);
        masked.Number("assessedTicks", assessedMaskingTicks);
        masked.Number("notAssessedTicks",
            evidence.RouteMaskingNotAssessedTicks);
        axes.Raw("masked", masked.Finish());

        var timely = new FlatJson();
        timely.String("status",
            TimelyStatus(assessment.Timely.Status,
                mission.Disposition));
        timely.NullableNumber("callToPickupSeconds",
            TicksToSeconds(mission.CapsuleSecuredCallAgeTicks), 3);
        timely.NullableNumber("pickupToHandoffSeconds",
            TicksToSeconds(pickupToHandoffTicks), 3);
        timely.NullableNumber("totalCallToHandoffSeconds",
            TicksToSeconds(mission.HandoffCallAgeTicks), 3);
        axes.Raw("timely", timely.Finish());
        root.Raw("axes", axes.Finish());
        root.Raw("correction",
            CorrectionJson(flight, mission, assessment.PrimaryCorrection));
        return root.Finish();
    }

    static string CorrectionJson(
        CasevacFlightRuntime flight,
        CasevacMissionSnapshot mission,
        CasevacPrimaryCorrection correction) {
        if (!correction.IsAvailable
            || !correction.StartSourceTick.HasValue)
            return "null";
        string? kind = correction.Kind switch {
            CasevacPrimaryCorrectionKind.StabilizePickupContact =>
                "LOADING_STABILITY",
            CasevacPrimaryCorrectionKind.StabilizeHandoffContact =>
                "HANDOFF_STABILITY",
            CasevacPrimaryCorrectionKind.ReviewRecordedRouteSegment
                when correction.Stream == CasevacEvidenceStream.Route =>
                    "ROUTE_MASKING",
            CasevacPrimaryCorrectionKind.ReviewRecordedRouteSegment =>
                "APPROACH_DISCIPLINE",
            // PreserveAircraftMargin lacks the margin percentage required by the current
            // presentation contract, so it fails closed instead of fabricating one.
            _ => null
        };
        if (kind is null) return "null";

        long activeTicks = Math.Max(
            0L,
            correction.StartSourceTick.Value
                - mission.MissionBeginSourceTick);
        double atCallAgeSeconds = TicksToSeconds(
            checked(
                flight.Course.Mission.InitialCallAgeTicks
                    + activeTicks));
        var json = new FlatJson();
        json.String("kind", kind);
        json.Number("atCallAgeSeconds", atCallAgeSeconds, 3);
        if (kind is "ROUTE_MASKING" or "APPROACH_DISCIPLINE") {
            if (!correction.EndSourceTick.HasValue
                || correction.EndSourceTick.Value
                    < correction.StartSourceTick.Value)
                return "null";
            long inclusiveTicks = checked(
                correction.EndSourceTick.Value
                    - correction.StartSourceTick.Value + 1L);
            json.Number("intervalSeconds",
                TicksToSeconds(inclusiveTicks), 3);
            if (kind == "APPROACH_DISCIPLINE")
                json.String("site",
                    correction.Stream == CasevacEvidenceStream.ReceiverTerminal
                        ? "RECEIVER"
                        : "PICKUP");
        } else if (kind == "LOADING_STABILITY") {
            json.Number("count",
                flight.Evidence.LoadingPauseCount
                    + flight.Evidence.LoadingResetCount);
        } else if (kind == "HANDOFF_STABILITY") {
            json.Number("count",
                flight.Evidence.HandoffPauseCount
                    + flight.Evidence.HandoffResetCount);
        }
        return json.Finish();
    }

    static string GateState(
        CasevacMissionSnapshot mission,
        in LandingZoneObservation landingZone) {
        if (mission.Phase is CasevacPhase.Outbound
            or CasevacPhase.Ingress
            or CasevacPhase.AbortReturn)
            return "OUTSIDE";
        if (mission.Phase is CasevacPhase.Quiet
            or CasevacPhase.Complete)
            return "COMPLETE";
        if (!landingZone.InsideTerminalVolume)
            return "OUTSIDE";
        if (mission.StableContact
            && landingZone.GateClass == LandingZoneGateClass.Hold)
            return "PAUSED";
        if (mission.StableContact
            && landingZone.GateClass == LandingZoneGateClass.Advance)
            return "STABLE";
        if (mission.StabilizationProgressTicks > 0
            && landingZone.GateClass == LandingZoneGateClass.Advance)
            return "STABILIZING";
        return "UNSTABLE";
    }

    static string DwellKind(CasevacPhase phase) => phase switch {
        CasevacPhase.PickupApproach
            or CasevacPhase.DropoffApproach => "STABILIZATION",
        CasevacPhase.Loading => "LOADING",
        CasevacPhase.Handoff => "HANDOFF",
        _ => "NONE"
    };

    static double DwellProgress01(
        CasevacMissionSnapshot mission,
        int stabilizationRequiredTicks) => mission.Phase switch {
        CasevacPhase.PickupApproach
            or CasevacPhase.DropoffApproach =>
                Fraction(
                    mission.StabilizationProgressTicks,
                    stabilizationRequiredTicks),
        CasevacPhase.Loading or CasevacPhase.Handoff =>
            Fraction(
                mission.OperationProgressTicks,
                mission.OperationRequiredTicks),
        _ => 0.0
    };

    static double Fraction(long value, long required) =>
        required > 0
            ? Math.Clamp(value / (double)required, 0.0, 1.0)
            : 0.0;

    static double TicksToSeconds(long ticks) =>
        ticks / AircraftSim.TickHz;

    static double? TicksToSeconds(long? ticks) =>
        ticks.HasValue ? TicksToSeconds(ticks.Value) : null;

    static double PositiveDegrees(double angleRad) {
        double degrees = angleRad * RadiansToDegrees % 360.0;
        return degrees < 0.0 ? degrees + 360.0 : degrees;
    }

    static string PhaseToken(CasevacPhase phase) => phase switch {
        CasevacPhase.Ready => "READY",
        CasevacPhase.Ingress => "INGRESS",
        CasevacPhase.PickupApproach => "PICKUP_APPROACH",
        CasevacPhase.Loading => "LOADING",
        CasevacPhase.Outbound => "OUTBOUND",
        CasevacPhase.DropoffApproach => "DROPOFF_APPROACH",
        CasevacPhase.Handoff => "HANDOFF",
        CasevacPhase.Quiet => "QUIET",
        CasevacPhase.Complete => "COMPLETE",
        CasevacPhase.AbortReturn => "ABORT_RETURN",
        CasevacPhase.Aborted => "ABORTED",
        _ => "AIRCRAFT_LOST"
    };

    static string CustodyToken(CapsuleCustody custody) => custody switch {
        CapsuleCustody.AtPickup => "AT_PICKUP",
        CapsuleCustody.InAircraft => "IN_AIRCRAFT",
        _ => "AT_RECEIVER"
    };

    static string DispositionToken(
        CasevacDisposition disposition) => disposition switch {
        CasevacDisposition.TransferredOnTime => "TRANSFERRED_ON_TIME",
        CasevacDisposition.TransferredAfterRequestedTime =>
            "TRANSFERRED_AFTER_REQUESTED_TIME",
        CasevacDisposition.ControlledAbort => "CONTROLLED_ABORT",
        CasevacDisposition.AircraftLostEmpty => "AIRCRAFT_LOST_EMPTY",
        CasevacDisposition.AircraftLostOccupied =>
            "AIRCRAFT_LOST_OCCUPIED",
        _ => "PENDING"
    };

    static string GateClassToken(
        LandingZoneGateClass gateClass) => gateClass switch {
        LandingZoneGateClass.Advance => "ADVANCE",
        LandingZoneGateClass.Hold => "HOLD",
        _ => "BREAK"
    };

    static string ContactToken(VehicleContactKind kind) => kind switch {
        VehicleContactKind.Airborne => "AIRBORNE",
        VehicleContactKind.SurfaceContact => "SURFACE_CONTACT",
        VehicleContactKind.StableSurfaceContact =>
            "STABLE_SURFACE_CONTACT",
        VehicleContactKind.HardImpact => "HARD_IMPACT",
        _ => "UNKNOWN"
    };

    static string MaskingToken(CasevacMaskingState state) => state switch {
        CasevacMaskingState.Masked => "MASKED",
        CasevacMaskingState.Exposed => "EXPOSED",
        _ => "NOT_ASSESSED"
    };

    static string AssessmentStatusToken(
        CasevacAssessmentStatus? status) => status switch {
        CasevacAssessmentStatus.Assessed => "ASSESSED",
        CasevacAssessmentStatus.Pass => "PASS",
        CasevacAssessmentStatus.Developing => "DEVELOPING",
        _ => "NOT_ASSESSED"
    };

    static string SafeStatus(CasevacAssessmentStatus status) => status switch {
        CasevacAssessmentStatus.Pass => "CLEAR",
        CasevacAssessmentStatus.Developing => "REVIEW",
        _ => "NOT_ASSESSED"
    };

    static string ControlledStatus(
        CasevacAssessmentStatus status) => status switch {
        CasevacAssessmentStatus.Pass => "CONTROLLED",
        CasevacAssessmentStatus.Developing => "REVIEW",
        _ => "NOT_ASSESSED"
    };

    static string MaskedStatus(
        CasevacAssessmentStatus status,
        long maskedTicks,
        long exposedTicks) {
        if (status == CasevacAssessmentStatus.NotAssessed)
            return "NOT_ASSESSED";
        if (maskedTicks > 0 && exposedTicks == 0)
            return "MASKED";
        if (exposedTicks > 0 && maskedTicks == 0)
            return "EXPOSED";
        return "MIXED";
    }

    static string TimelyStatus(
        CasevacAssessmentStatus status,
        CasevacDisposition disposition) {
        if (status == CasevacAssessmentStatus.NotAssessed)
            return "NOT_ASSESSED";
        return disposition == CasevacDisposition.TransferredOnTime
            ? "WITHIN_REQUEST"
            : disposition
                == CasevacDisposition.TransferredAfterRequestedTime
                    ? "WINDOW_PASSED"
                    : "NOT_ASSESSED";
    }

    static string EventToken(CasevacEventKind kind) => kind switch {
        CasevacEventKind.CasevacTaskStarted => "CASEVAC_TASK_STARTED",
        CasevacEventKind.PickupApproachEntered =>
            "PICKUP_APPROACH_ENTERED",
        CasevacEventKind.DropoffApproachEntered =>
            "DROPOFF_APPROACH_ENTERED",
        CasevacEventKind.ApproachAttemptStarted =>
            "APPROACH_ATTEMPT_STARTED",
        CasevacEventKind.ApproachDiscontinued =>
            "APPROACH_DISCONTINUED",
        CasevacEventKind.StableContactEntered =>
            "STABLE_CONTACT_ENTERED",
        CasevacEventKind.StableContactExited =>
            "STABLE_CONTACT_EXITED",
        CasevacEventKind.LoadingStarted => "LOADING_STARTED",
        CasevacEventKind.LoadingPaused => "LOADING_PAUSED",
        CasevacEventKind.LoadingResumed => "LOADING_RESUMED",
        CasevacEventKind.LoadingReset => "LOADING_RESET",
        CasevacEventKind.CapsuleSecured => "CAPSULE_SECURED",
        CasevacEventKind.RequestedHandoffWindowPassed =>
            "REQUESTED_HANDOFF_WINDOW_PASSED",
        CasevacEventKind.HandoffStarted => "HANDOFF_STARTED",
        CasevacEventKind.HandoffPaused => "HANDOFF_PAUSED",
        CasevacEventKind.HandoffResumed => "HANDOFF_RESUMED",
        CasevacEventKind.HandoffReset => "HANDOFF_RESET",
        CasevacEventKind.HandoffCompleted => "HANDOFF_COMPLETED",
        CasevacEventKind.AbortReturnStarted => "ABORT_RETURN_STARTED",
        CasevacEventKind.CasevacAborted => "CASEVAC_ABORTED",
        _ => "CASEVAC_AIRCRAFT_LOST"
    };

    /// <summary>Small trim-safe writer for the flat contract and its two bounded nested values.</summary>
    sealed class FlatJson {
        readonly StringBuilder _json = new("{");
        bool _hasProperty;
        bool _finished;

        public void String(string name, string value) =>
            Raw(name, SnapshotJson.JsonString(value));

        public void NullableString(string name, string? value) =>
            Raw(name, value is null ? "null" : SnapshotJson.JsonString(value));

        public void Boolean(string name, bool value) =>
            Raw(name, value ? "true" : "false");

        public void Number(string name, long value) =>
            Raw(name, value.ToString(CultureInfo.InvariantCulture));

        public void Number(
            string name,
            double value,
            int decimals = 4) =>
            Raw(name, NumberToken(value, decimals));

        public void NullableNumber(
            string name,
            double? value,
            int decimals = 4) =>
            Raw(name, value.HasValue
                ? NumberToken(value.Value, decimals)
                : "null");

        public void Raw(string name, string rawJson) {
            if (_finished)
                throw new InvalidOperationException(
                    "Cannot append to a completed JSON object.");
            if (_hasProperty) _json.Append(',');
            _hasProperty = true;
            _json.Append(SnapshotJson.JsonString(name))
                .Append(':')
                .Append(rawJson);
        }

        public string Finish() {
            if (!_finished) {
                _json.Append('}');
                _finished = true;
            }
            return _json.ToString();
        }

        static string NumberToken(double value, int decimals) {
            if (!double.IsFinite(value)) return "null";
            return value.ToString(
                "F" + Math.Clamp(decimals, 0, 9),
                CultureInfo.InvariantCulture);
        }
    }
}
