using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Web;

/// <summary>
/// Plain, renderer-independent projection of a <see cref="SimulationSession"/> into the flat browser
/// state contract. This type deliberately carries no browser or JS-interop attributes so the whole
/// snapshot projection can be exercised as ordinary .NET (sim.Tests links this file, mirroring
/// <see cref="SnapshotJson"/> and IncidentReplayProjection). WebBridge's [JSExport] GetState is a thin
/// shim that forwards its static aliases here; the reference is one-way so the projection never
/// recouples to the browser platform.
/// </summary>
internal static class SnapshotProjection {
    static SimulationSession Session = null!;
    static Carrier.DeckConfiguration DeckConfiguration;
    static double WorldOriginEastM;
    static double WorldOriginNorthM;
    static bool WorldOriginConfigured;
    static ITerrainSurface? Terrain;
    static WeatherProfile? _weatherRenderProfile;
    static string? _weatherRenderJson;

    const double CarrierTerrainPlacementEastM = 100_000.0;
    const string SharedTerrainFrameId = "world.korea-central-front.v1";
    const string CarrierTrainingFrameId = "local.carrier-training.v1";


    // Stable presentation IDs are copied from the staged Korea pack contract. The bridge projects
    // semantic bindings only; the renderer/AssetRegistry resolves them to authored or procedural
    // assets. Beat 4 predates that pack and therefore advertises an explicit, unstaged compatibility
    // contract instead of pretending its balloon glider and AEW&C belong to 1950s Korea.
    const string KoreaPackId = "korea-1950s";
    const string KoreaPackVersion = "0.3.0";
    const string KoreaPackUri = "content/packs/korea-1950s/pack.json";
    const string SnapshotSchemaVersion = "1.7.0";
    const string KoreaPresentationProfileId = "presentation.korea-1950s.fixed-wing.v1";
    const string KoreaVisualProfileId = "visual.korea-1950s.default.v1";
    const string KoreaAssetProfileId = "asset.korea-1950s.default.v1";
    const string KoreaAssetManifestId = "manifest.korea-1950s.default.v1";
    const string FixedWingCameraProfileId = "camera.fixed-wing.padlock.v1";
    const string FixedWingHudProfileId = "hud.fixed-wing.guns.v1";
    const string FixedWingInputProfileId = "input.fixed-wing.unified.v1";
    const string FixedWingAudioProfileId = "audio.fixed-wing.jet.v1";
    const string FixedWingEffectsProfileId = "effects.fixed-wing.guns.v1";
    const string PlayerPresentationId = "presentation.vehicle.player.v1";
    const string PlayerCockpitPresentationId = "presentation.cockpit.player.v1";
    const string BanditPresentationId = "presentation.vehicle.bandit.v1";
    const string CarrierPresentationId = "presentation.platform.carrier.v1";

    const string BalloonPackId = "korea-2030s-prototype";
    const string BalloonPackVersion = "0.0.0-prototype";
    const string BalloonPresentationProfileId = "presentation.korea-2030s.balloon.prototype.v1";
    const string BalloonVisualProfileId = "visual.korea-2030s.balloon.prototype.v1";
    const string GliderPresentationId = "presentation.vehicle.glider-strike.v1";
    const string AwacsPresentationId = "presentation.vehicle.awacs-target.v1";

    const string ModernSurrogatePackId = "korea-2030s-public-surrogate";
    const string ModernSurrogatePackVersion = "0.1.0";
    const string ModernSurrogatePresentationProfileId =
        "presentation.modern.visual-merge.public-data-surrogate.v1";
    const string ModernSurrogateVisualProfileId =
        "visual.modern.abstract-contact.public-data-surrogate.v1";

    /// Project the supplied session (plus the world-origin/terrain staging the bridge owns) as one
    /// flat state blob. The parameters are latched into static fields so the moved projection helpers
    /// read them exactly as they read WebBridge's static aliases before the extraction.
    public static string BuildState(SimulationSession session,
        Carrier.DeckConfiguration deckConfiguration, double worldOriginEastM,
        double worldOriginNorthM, bool worldOriginConfigured, ITerrainSurface? terrain) {
        Session = session;
        DeckConfiguration = deckConfiguration;
        WorldOriginEastM = worldOriginEastM;
        WorldOriginNorthM = worldOriginNorthM;
        WorldOriginConfigured = worldOriginConfigured;
        Terrain = terrain;
        AircraftSim _player = Session.Player;
        IBandit _bandit = Session.Bandit;
        BeatSetup _beat = Session.Beat;
        DetentLayer _detents = Session.Controls;
        PilotCommand requestedCommand = _detents.Command;
        PilotCommand appliedCommand = _player.LastAppliedCommand;
        string requestedAlphaDegreesJson = double.IsFinite(requestedCommand.CommandedAlphaRad)
            ? (requestedCommand.CommandedAlphaRad * 57.29577951308232).ToString(
                "F3", System.Globalization.CultureInfo.InvariantCulture)
            : "null";
        bool lateralControlApplied = _player.HasAppliedFlightCommand;
        GunKill _gunKill = Session.PlayerGun;
        GunKill _opponentGun = Session.OpponentGun;
        FuelModel _fuel = Session.PlayerFuel;
        AirframeSystems _systems = Session.PlayerSystems;
        PilotPhysiologyState pilotPhysiology = Session.PilotPhysiologyState;
        string pilotPhysiologyProfileIdJson = JsonString(
            Session.PilotPhysiology.Profile.Id);
        string pilotState = PilotStateToken(Session.PilotState);
        bool pilotGzValid = _player.HasValidPilotNormalAcceleration;
        AutoGcasState autoGcas = Session.AutoGcas;
        AutoGcasPrediction autoGcasPrediction = autoGcas.Prediction;
        GunneryPitchAssistState gunneryPitchAssist = Session.GunneryPitchAssist;
        PadlockRollAssistState padlockRollAssist = Session.BanditPadlockRollAssist;
        string autoGcasProfileIdJson = JsonString(Session.PlayerAutoGcasCapability.Id);
        string autoGcasCueJson = JsonString(autoGcas.Cue);
        Carrier? _carrier = Session.Carrier;
        Carrier.Recovery _recovery = Session.Recovery;
        Carrier.TouchdownResult _touchdown = Session.Touchdown;
        ArrestmentModel _arrestment = Session.Arrestment;
        CatapultLaunchModel _catapult = Session.Catapult;
        DoctrineAdvice _advice = Session.Advice;
        PromptCue _cue = Session.Cue;
        double _simTimeMs = Session.TimeMilliseconds;
        double _closureKts = Session.ClosureKts;
        bool hasEngine = _beat.PlayerAir.ThrustMaxN > 0.0
            && _beat.PlayerAir.MaxThrustFraction > 0.0;
        // Capability identity, rather than a menu-index exception, decides whether the internal
        // compatibility systems object is pilot-facing. Modern airborne surrogates therefore do
        // not inherit an F-86 hydraulic/gear panel they do not actually simulate.
        bool hasSimulatedAirframeSystems = _beat.PlayerAircraft.SystemsSimulated;
        bool ready = Session.Lifecycle == SimulationSession.LifecycleState.Ready;
        bool paused = Session.Lifecycle == SimulationSession.LifecycleState.Paused;
        bool finished = Session.Lifecycle == SimulationSession.LifecycleState.Finished;
        string sessionPhase = Session.Lifecycle switch {
            SimulationSession.LifecycleState.Ready => "READY",
            SimulationSession.LifecycleState.Paused => "PAUSED",
            SimulationSession.LifecycleState.Finished => "FINISHED",
            _ => "ACTIVE"
        };

        bool catapulting = _catapult.IsActive;
        AircraftState s = catapulting ? _catapult.State : _player.State;
        AircraftState b = _bandit.State;
        bool arrested = _arrestment.IsActive && !catapulting;
        Vec3D simulationPosition = arrested ? _arrestment.Position : s.Position;
        Vec3D playerPosition = simulationPosition;
        // Keep all simulation/protection calculations on authoritative local TAS. The bridge
        // derives pilot-facing ideal IAS/CAS from pitot impact pressure; EAS remains a separate
        // aerodynamic diagnostic and earth groundspeed remains explicitly secondary.
        Vec3D groundVelocity;
        Vec3D airVelocity;
        if (catapulting) {
            groundVelocity = s.VelocityVector();
            airVelocity = _carrier is null
                ? groundVelocity
                : groundVelocity - _carrier.SteadyWindWorld;
        } else if (arrested && _carrier is not null) {
            groundVelocity = _carrier.DeckVelocityWorld
                + _carrier.LandingFwd * _arrestment.RelativeSpeedMps
                + new Vec3D(0.0, _carrier.DeckVerticalVelocityMps, 0.0);
            airVelocity = groundVelocity - _carrier.SteadyWindWorld;
        } else {
            groundVelocity = s.VelocityVector();
            airVelocity = _player.AirVelocity;
        }
        double trueAirspeedMps = airVelocity.Length;
        IAtmosphereModel atmosphere = _player.AtmosphereModel;
        AtmosphericState atmosphericState = atmosphere.Sample(playerPosition.Y);
        double indicatedAirspeedMps = AirData.IndicatedAirspeedMps(
            trueAirspeedMps, playerPosition.Y, atmosphere);
        double equivalentAirspeedMps = AirData.EquivalentAirspeedMps(
            trueAirspeedMps, playerPosition.Y, atmosphere);
        double mach = trueAirspeedMps / atmosphericState.SpeedOfSoundMps;
        Vec3D localWindVelocity = groundVelocity - airVelocity;
        CloudSample localCloud = (Session.Weather?.Clouds ?? ClearCloudField.Instance)
            .Sample(playerPosition, _simTimeMs / 1000.0);
        double groundSpeedMps = Math.Sqrt(
            groundVelocity.X * groundVelocity.X + groundVelocity.Z * groundVelocity.Z);
        double positiveLoadFactor = Math.Max(1.0,
            Math.Max(_player.LastNz,
                lateralControlApplied ? appliedCommand.GDemand : 0.0));
        double configuredLiftIncrement =
            Session.PlayerAerodynamicConfiguration.LiftCoefficientIncrement;
        double stallSpeedKias = AirData.StallSpeedKiasAtAltitude(
            s.Mass, _beat.PlayerAir, playerPosition.Y, 1.0, configuredLiftIncrement,
            atmosphere);
        double acceleratedStallSpeedKias = AirData.StallSpeedKiasAtAltitude(
            s.Mass, _beat.PlayerAir, playerPosition.Y, positiveLoadFactor,
            configuredLiftIncrement, atmosphere);
        double cornerSpeedKias = AirData.PositiveCornerSpeedKiasAtAltitude(
            s.Mass, _beat.PlayerAir, playerPosition.Y, configuredLiftIncrement, atmosphere);
        // Recomputed per snapshot build exactly like the corner point above, so the band tracks
        // fuel burn and configuration with the same cadence and stays deterministic.
        (double cornerBandMinKias, double cornerBandMaxKias) =
            AirData.PositiveCornerBandKiasAtAltitude(
                s.Mass, _beat.PlayerAir, playerPosition.Y, configuredLiftIncrement, atmosphere);
        bool waveOff = Session.WaveOffActive;
        string mode = _arrestment.Phase == ArrestmentModel.ArrestmentPhase.Failed
            ? "ARRESTMENT FAILED"
            : Session.TerminalPhaseActive ? "TERMINAL"
            : catapulting ? "CATAPULT"
            : _recovery == Carrier.Recovery.Bolter ? "BOLTER"
            : _arrestment.Phase == ArrestmentModel.ArrestmentPhase.Arrested ? "ARRESTED"
            : _arrestment.Phase == ArrestmentModel.ArrestmentPhase.Stopped ? "STOPPED"
            : waveOff ? "WAVE-OFF" : _detents.ApproachMode ? "APPROACH" : "FREE";
        string context = _advice.Context;
        string lsoJson = "";
        if (_carrier is not null && !arrested && !catapulting) {
            LsoAdvice? lso = Lso.AdviseForMode(_carrier, s, _player.AngleOfAttackRad,
                _carrier.ApproachDirectorPitchOffsetRad, mode == "APPROACH", waveOff);
            context = lso?.Call ?? Lso.FreeFlightCall;
            if (lso is { } paddles) {
                string severity = paddles.Severity switch {
                    LsoSeverity.OnBall => "ON_BALL",
                    LsoSeverity.Correcting => "CORRECTING",
                    _ => "WAVEOFF"
                };
                lsoJson = $"\"lso\":\"{paddles.Call}\",\"lso_severity\":\"{severity}\",";
            }
        }

        Vec3D bl = _bandit.LiftDir;
        Vec3D bf = b.ForwardDir();
        Vec3D pf;
        Vec3D pl;
        if (catapulting) {
            pf = s.BodyAttitude.Rotate(new Vec3D(0.0, 0.0, 1.0));
            pl = s.BodyAttitude.Rotate(new Vec3D(0.0, 1.0, 0.0));
        } else {
            _player.BodyFrame(out pf, out pl);
        }

        double displayPitchRad = Math.Asin(Math.Clamp(pf.Y, -1.0, 1.0));
        double displayBankRad = catapulting ? 0.0 : _player.BodyRollRad;
        double displayHeadingRad = Math.Atan2(pf.X, pf.Z);
        double displayGammaRad = s.Gamma;
        if (arrested && _carrier is not null) {
            displayPitchRad = _arrestment.NosePitchRad;
            displayBankRad = 0.0;
            displayHeadingRad = _carrier.LandingHeadingRad;
            displayGammaRad = 0.0;
            double cosPitch = Math.Cos(displayPitchRad);
            double sinPitch = Math.Sin(displayPitchRad);
            pf = _carrier.LandingFwd * cosPitch + new Vec3D(0, sinPitch, 0);
            pl = _carrier.LandingFwd * -sinPitch + new Vec3D(0, cosPitch, 0);
            context = _arrestment.Phase == ArrestmentModel.ArrestmentPhase.Stopped
                ? "TRAPPED — STOPPED"
                : $"TRAP · WIRE {_arrestment.CaughtWire}";
        } else if (catapulting) {
            context = "TRAPPED - LAUNCHING";
        } else if (_arrestment.Phase == ArrestmentModel.ArrestmentPhase.Failed) {
            context = $"ARRESTMENT FAILED — {ArrestmentFailureToken(_arrestment.FailureReason).Replace('_', ' ')}";
        } else if (_recovery == Carrier.Recovery.Bolter) {
            context = _touchdown.Hook == Carrier.HookOutcome.InFlightEngagement
                ? "BOLTER — IN-FLIGHT ENGAGEMENT"
                : "BOLTER — GO AROUND";
        }
        if (Session.VisualMergeEvaluation is { } mergeEvaluation
            && !Session.TerminalPhaseActive)
            context = mergeEvaluation.Cue;

        RtbGuidance rtb = _carrier is null
            ? default
            : _fuel.GuidanceTo(simulationPosition, displayHeadingRad, _carrier.Position);
        // Finished freezes simulation time. Timed in-flight cues would otherwise remain active
        // forever, so terminal presentation comes from the durable outcome and ordered events.
        bool splashCue = !finished && Session.SplashCueActive;
        string transitionCue = finished ? "" : Session.TransitionCue;
        string configurationCue = finished ? "" : Session.ConfigurationCue;
        string configurationTarget = Session.ConfigurationTarget
            == FlightConfigurationTarget.Recovery ? "RECOVERY" : "COMBAT";
        double surfaceAltitudeM = Session.Terrain?.TrySample(
            playerPosition.X, playerPosition.Z, out TerrainSample terrainSample) == true
                ? terrainSample.HeightM : 0.0;
        if (_carrier is not null && _carrier.WithinDeckFootprint(playerPosition))
            surfaceAltitudeM = playerPosition.Y - _carrier.DeckFrame(playerPosition).height;
        double radarAltitudeM = Math.Max(0.0, playerPosition.Y - surfaceAltitudeM);
        double verticalSpeedMps = arrested ? 0.0 : s.VelocityVector().Y;
        var engine = _player.LastEngineOperatingPoint;
        double sustainedG = Protection.SustainedG(s, _beat.PlayerAir,
            trueAirspeedMps, engine.NetThrustN,
            Session.PlayerAerodynamicConfiguration, atmosphere);

        // Hand-built JSON: no serializer, no reflection, trim-safe, allocation-cheap.
        return "{"
            + PresentationContractJson(_carrier is not null)
            + $"\"world_frame_id\":\"{WorldFrameId(Session.BeatIndex)}\","
            + $"\"world_origin_configured\":{(WorldOriginConfigured ? "true" : "false")},"
            + $"\"world_origin_east_m\":{WorldOriginEastM:F1},\"world_origin_north_m\":{WorldOriginNorthM:F1},"
            + $"\"terrain_placement_east_m\":{TerrainPlacementEastM(Session.BeatIndex):F1},\"terrain_placement_north_m\":{TerrainPlacementNorthM(Session.BeatIndex):F1},"
            + $"\"multiplayer_terrain_shared\":{(WorldOriginConfigured && HasSharedTerrainFrame(Session.BeatIndex) ? "true" : "false")},"
            + $"\"terrain_present\":{(Session.Terrain is not null ? "true" : "false")},"
            + $"\"t\":{_simTimeMs / 1000.0:F4},"
            + $"\"tick\":{Session.Tick},"
            + $"\"ready\":{(ready ? "true" : "false")},\"paused\":{(paused ? "true" : "false")},"
            + $"\"finished\":{(finished ? "true" : "false")},\"session_phase\":\"{sessionPhase}\","
            + $"\"sortie_outcome\":\"{SortieOutcomeToken(Session.Outcome)}\","
            + $"\"pending_sortie_outcome\":\"{SortieOutcomeToken(Session.PendingOutcome)}\","
            + $"\"terminal_phase_active\":{(Session.TerminalPhaseActive ? "true" : "false")},"
            + $"\"player_terminal_state\":\"{TerminalStateToken(Session.PlayerTerminalState)}\","
            + $"\"opponent_terminal_state\":\"{TerminalStateToken(Session.OpponentTerminalState)}\","
            + $"\"player_impact_surface\":\"{ImpactSurfaceToken(Session.PlayerImpactSurface)}\","
            + $"\"opponent_impact_surface\":\"{ImpactSurfaceToken(Session.OpponentImpactSurface)}\","
            + $"\"incident_replay_id\":{Session.IncidentReplay.ClipId},"
            + $"\"incident_replay_available\":{(Session.IncidentReplay.ExportAvailable ? "true" : "false")},"
            + $"\"opponent_body_present\":{(Session.OpponentBodyPresent ? "true" : "false")},"
            + $"\"px\":{playerPosition.X:F3},\"py\":{playerPosition.Y:F3},\"pz\":{playerPosition.Z:F3},"
            // World-frame ground velocity: the browser projects the flight-path marker (FPV) from
            // this exact vector, so the HUD velocity symbol and the rendered world can never
            // disagree about where the jet is actually going.
            + $"\"vx\":{groundVelocity.X:F3},\"vy\":{groundVelocity.Y:F3},\"vz\":{groundVelocity.Z:F3},"
            + $"\"pfx\":{pf.X:F5},\"pfy\":{pf.Y:F5},\"pfz\":{pf.Z:F5},"
            + $"\"plx\":{pl.X:F5},\"ply\":{pl.Y:F5},\"plz\":{pl.Z:F5},"
            + $"\"bx\":{b.Position.X:F3},\"by\":{b.Position.Y:F3},\"bz\":{b.Position.Z:F3},"
            + $"\"bfx\":{bf.X:F5},\"bfy\":{bf.Y:F5},\"bfz\":{bf.Z:F5},"
            + $"\"blx\":{bl.X:F5},\"bly\":{bl.Y:F5},\"blz\":{bl.Z:F5},"
            + $"\"buffet_pitch_deg\":{_player.PitchBuffetRad * 57.2958:F3},\"buffet_roll_deg\":{_player.RollBuffetRad * 57.2958:F3},\"buffet_yaw_deg\":{_player.YawBuffetRad * 57.2958:F3},"
            + $"\"indicated_airspeed_kts\":{indicatedAirspeedMps * AirData.MpsToKnots:F2},"
            // The current pitot/static model has no aircraft-specific indication-error card, so
            // its primary airspeed is ideal CAS. Publish that truth explicitly while retaining the
            // older IAS key for replay and third-party consumer compatibility.
            + $"\"calibrated_airspeed_kts\":{indicatedAirspeedMps * AirData.MpsToKnots:F2},"
            + $"\"equivalent_airspeed_kts\":{equivalentAirspeedMps * AirData.MpsToKnots:F2},"
            + $"\"true_airspeed_kts\":{trueAirspeedMps * AirData.MpsToKnots:F2},"
            + $"\"ground_speed_kts\":{groundSpeedMps * AirData.MpsToKnots:F2},"
            + $"\"mach\":{mach:F4},"
            + $"\"static_temperature_c\":{atmosphericState.TemperatureK - 273.15:F2},"
            + $"\"static_pressure_hpa\":{atmosphericState.PressurePa / 100.0:F2},"
            + $"\"air_density_kg_m3\":{atmosphericState.DensityKgM3:F6},"
            + $"\"wind_x_mps\":{localWindVelocity.X:F3},\"wind_y_mps\":{localWindVelocity.Y:F3},\"wind_z_mps\":{localWindVelocity.Z:F3},"
            + $"\"visibility_m\":{localCloud.VisibilityM:F1},\"cloud_fraction_01\":{localCloud.CloudFraction01:F4},"
            + $"\"cloud_extinction_per_m\":{localCloud.ExtinctionPerMetre:F8},\"precipitation_mm_hr\":{localCloud.PrecipitationMmPerHour:F3},"
            + $"\"cloud_turbulence_x_mps\":{localCloud.TurbulenceVelocityMps.X:F3},\"cloud_turbulence_y_mps\":{localCloud.TurbulenceVelocityMps.Y:F3},\"cloud_turbulence_z_mps\":{localCloud.TurbulenceVelocityMps.Z:F3},"
            + $"\"cloud_vertical_air_mps\":{localCloud.VerticalAirVelocityMps:F3},\"icing_hazard_01\":{localCloud.IcingHazard01:F4},\"lightning_hazard_01\":{localCloud.LightningHazard01:F4},"
            + WeatherRenderJson()
            // Compatibility consumers keep receiving speed_kts, but live snapshots now expose the
            // same ideal calibrated-airspeed truth as the primary KCAS channel above.
            + $"\"speed_kts\":{indicatedAirspeedMps * AirData.MpsToKnots:F2},"
            + $"\"stall_speed_kias\":{stallSpeedKias:F2},"
            + $"\"accelerated_stall_speed_kias\":{acceleratedStallSpeedKias:F2},"
            + $"\"corner_speed_kias\":{cornerSpeedKias:F2},"
            // Corner as a range: the CAS band holding >= 95% of peak instantaneous turn rate.
            + $"\"corner_band_min_kias\":{cornerBandMinKias:F2},"
            + $"\"corner_band_max_kias\":{cornerBandMaxKias:F2},"
            + $"\"stall_speed_kcas\":{stallSpeedKias:F2},"
            + $"\"accelerated_stall_speed_kcas\":{acceleratedStallSpeedKias:F2},"
            + $"\"corner_speed_kcas\":{cornerSpeedKias:F2},"
            + $"\"effective_on_speed_aoa_deg\":{_detents.EffectiveOnSpeedAoARad(_beat.PlayerAir) * 57.29577951308232:F3},"
            + $"\"on_speed_aoa_tolerance_deg\":{Lso.AoaToleranceRad * 57.29577951308232:F3},"
            + $"\"stall_load_factor\":{positiveLoadFactor:F3},\"alt_ft\":{playerPosition.Y * 3.28084:F1},"
            + $"\"radar_alt_ft\":{radarAltitudeM * 3.28084:F1},\"vertical_speed_fpm\":{verticalSpeedMps * 196.8504:F1},"
            + $"\"g_actual\":{_player.LastNz:F3},\"g_cmd\":{appliedCommand.GDemand:F3},"
            + $"\"pilot_physiology_profile_id\":{pilotPhysiologyProfileIdJson},"
            + $"\"pilot_state\":\"{pilotState}\","
            + $"\"pilot_gz\":{pilotPhysiology.NormalAccelerationG:F4},"
            + $"\"pilot_gz_valid\":{(pilotGzValid ? "true" : "false")},"
            + $"\"pilot_positive_onset_rate_g_per_second\":{pilotPhysiology.PositiveOnsetRateGPerSecond:F4},"
            + $"\"pilot_negative_onset_rate_g_per_second\":{pilotPhysiology.NegativeOnsetRateGPerSecond:F4},"
            + $"\"pilot_positive_exposure_g_seconds\":{pilotPhysiology.PositiveExposureGSeconds:F4},"
            + $"\"pilot_negative_exposure_g_seconds\":{pilotPhysiology.NegativeExposureGSeconds:F4},"
            + $"\"pilot_effective_retinal_reserve_01\":{pilotPhysiology.EffectiveRetinalResource01:F5},"
            + $"\"pilot_effective_cerebral_reserve_01\":{pilotPhysiology.EffectiveCerebralResource01:F5},"
            + $"\"pilot_peripheral_vision_01\":{pilotPhysiology.PeripheralVision01:F5},"
            + $"\"pilot_central_vision_01\":{pilotPhysiology.VisualAcuity01:F5},"
            + $"\"pilot_redout_01\":{pilotPhysiology.Redout01:F5},"
            + $"\"pilot_consciousness_01\":{pilotPhysiology.Consciousness01:F5},"
            + $"\"pilot_conscious\":{(pilotPhysiology.Consciousness01 > 0.0 ? "true" : "false")},"
            + $"\"pilot_cognitive_capacity_01\":{pilotPhysiology.CognitiveCapacity01:F5},"
            + $"\"pilot_control_authority_01\":{pilotPhysiology.ControlAuthority01:F5},"
            + $"\"pilot_additional_control_delay_seconds\":{pilotPhysiology.AdditionalControlDelaySeconds:F4},"
            + $"\"pilot_incapacitation_remaining_seconds\":{pilotPhysiology.AbsoluteIncapacitationRemainingSeconds:F4},"
            + $"\"pilot_agsm_engagement_01\":{pilotPhysiology.TechniqueEngagement01:F5},"
            + $"\"pilot_push_pull_penalty_g\":{pilotPhysiology.PushPullPenaltyG:F4},"
            + $"\"pilot_effective_peripheral_loss_g\":{pilotPhysiology.EffectivePositivePeripheralLossG:F4},"
            + $"\"pilot_effective_blackout_g\":{pilotPhysiology.EffectivePositiveBlackoutG:F4},"
            + $"\"pilot_effective_loc_g\":{pilotPhysiology.EffectivePositiveLossOfConsciousnessG:F4},"
            + $"\"pilot_effective_negative_redout_magnitude_g\":{pilotPhysiology.EffectiveNegativeRedoutMagnitudeG:F4},"
            + $"\"pilot_effective_negative_loc_magnitude_g\":{pilotPhysiology.EffectiveNegativeLossOfConsciousnessMagnitudeG:F4},"
            + $"\"pilot_control_interlocked\":{(Session.PilotControlInterlocked ? "true" : "false")},"
            + $"\"pilot_trigger_interlocked\":{(Session.PilotTriggerInterlocked ? "true" : "false")},"
            + $"\"pilot_g_loc_count\":{Session.PilotGLocCount},"
            + $"\"pilot_peak_positive_g\":{Session.PilotPeakPositiveG:F4},"
            + $"\"pilot_peak_negative_g\":{Session.PilotPeakNegativeG:F4},"
            + $"\"auto_gcas_profile_id\":{autoGcasProfileIdJson},"
            + $"\"auto_gcas_available\":{(Session.PlayerAutoGcasCapability.Available ? "true" : "false")},"
            + $"\"auto_gcas_phase\":\"{AutoGcasPhaseToken(autoGcas.Phase)}\","
            + $"\"auto_gcas_active\":{(autoGcas.Active ? "true" : "false")},"
            + $"\"auto_gcas_warning\":{(autoGcas.Warning ? "true" : "false")},"
            + $"\"auto_gcas_cue\":{autoGcasCueJson},"
            + $"\"auto_gcas_inhibit_reason\":\"{AutoGcasInhibitToken(autoGcas.InhibitReason)}\","
            + $"\"auto_gcas_override_held\":{(Session.AutoGcasOverrideHeld ? "true" : "false")},"
            + $"\"auto_gcas_activation_count\":{autoGcas.ActivationCount},"
            + $"\"auto_gcas_override_count\":{autoGcas.PilotOverrideCount},"
            + $"\"auto_gcas_release_count\":{autoGcas.ReleaseCount},"
            + $"\"auto_gcas_active_seconds\":{autoGcas.ActiveSeconds:F4},"
            + $"\"auto_gcas_prediction_valid\":{(autoGcasPrediction.Valid ? "true" : "false")},"
            + $"\"auto_gcas_used_fallback_terrain\":{(autoGcasPrediction.UsedFallbackTerrain ? "true" : "false")},"
            + $"\"auto_gcas_current_clearance_m\":{FiniteNumberJson(autoGcasPrediction.CurrentClearanceM)},"
            + $"\"auto_gcas_pilot_minimum_clearance_m\":{FiniteNumberJson(autoGcasPrediction.PilotMinimumClearanceM)},"
            + $"\"auto_gcas_recovery_minimum_clearance_m\":{FiniteNumberJson(autoGcasPrediction.ImmediateRecoveryMinimumClearanceM)},"
            + $"\"auto_gcas_pilot_violation_time_seconds\":{FiniteNumberJson(autoGcasPrediction.PilotViolationTimeSeconds)},"
            + $"\"auto_gcas_time_available_seconds\":{FiniteNumberJson(autoGcasPrediction.TimeAvailableToAvoidGroundImpactSeconds)},"
            + $"\"auto_gcas_pilot_recovery_credited\":{(autoGcasPrediction.PilotRecoveryCredited ? "true" : "false")},"
            + $"\"bank_target_deg\":{appliedCommand.BankTarget * 57.29577951308232:F3},"
            + $"\"roll_control\":{appliedCommand.RollControl:F3},"
            + $"\"pilot_aileron\":{appliedCommand.RollControl:F3},"
            + $"\"sas_aileron\":{appliedCommand.SasRollControl:F3},"
            + $"\"aileron_command_deg\":{appliedCommand.RollControl * _beat.PlayerAir.MaxAileronDeflectionRad * 57.29577951308232:F3},"
            + $"\"sas_aileron_deg\":{appliedCommand.SasRollControl * _beat.PlayerAir.MaxAileronDeflectionRad * 57.29577951308232:F3},"
            + $"\"total_aileron_command_deg\":{Math.Clamp(appliedCommand.RollControl + appliedCommand.SasRollControl, -1.0, 1.0) * _beat.PlayerAir.MaxAileronDeflectionRad * 57.29577951308232:F3},"
            + $"\"lateral_control_applied\":{(lateralControlApplied ? "true" : "false")},"
            + $"\"direct_lateral_control\":{(appliedCommand.DirectLateralControl ? "true" : "false")},"
            + $"\"requested_g_cmd\":{requestedCommand.GDemand:F3},"
            + $"\"requested_bank_target_deg\":{requestedCommand.BankTarget * 57.29577951308232:F3},"
            + $"\"requested_rudder\":{requestedCommand.Rudder:F3},"
            + $"\"requested_roll_control\":{requestedCommand.RollControl:F3},"
            + $"\"requested_sas_aileron\":{requestedCommand.SasRollControl:F3},"
            + $"\"requested_envelope_override\":{(_detents.Tier == DemandTier.OverDemand ? "true" : "false")},"
            + $"\"requested_alpha_deg\":{requestedAlphaDegreesJson},"
            + $"\"requested_direct_lateral_control\":{(requestedCommand.DirectLateralControl ? "true" : "false")},"
            + $"\"lateral_derivative_profile\":\"{_beat.PlayerAir.LateralDerivativeProfileId}\","
            + $"\"lateral_cl_beta\":{_beat.PlayerAir.ClBeta:F6},\"lateral_cl_p\":{_beat.PlayerAir.ClP:F6},"
            + $"\"lateral_cl_r\":{_beat.PlayerAir.ClR:F6},\"lateral_cl_delta_a_per_rad\":{_beat.PlayerAir.ClDeltaA:F6},"
            + $"\"lateral_cl_delta_r_per_rad\":{_beat.PlayerAir.ClDeltaR:F6},"
            + $"\"roll_moment_nm\":{_player.LastRollMomentNm:F1},"
            + $"\"pitch_thrust_vector_deg\":{_player.LastPitchThrustVectorAngleRad * 57.29577951308232:F3},"
            + $"\"pitch_thrust_vector_moment_nm\":{_player.LastPitchThrustVectorMomentNm:F1},"
            + $"\"pitch_thrust_vector_limit_deg\":{_beat.PlayerAir.PitchThrustVectorMaxRad * 57.29577951308232:F3},"
            + $"\"gunnery_pitch_assist\":{(gunneryPitchAssist.Active ? "true" : "false")},"
            + $"\"gunnery_pitch_error_deg\":{gunneryPitchAssist.PitchLeadErrorRad * 57.29577951308232:F3},"
            + $"\"gunnery_total_lead_error_deg\":{gunneryPitchAssist.TotalLeadErrorRad * 57.29577951308232:F3},"
            + $"\"gunnery_pitch_rate_cmd_dps\":{gunneryPitchAssist.RequestedPitchRateRadPerSecond * 57.29577951308232:F3},"
            + $"\"gunnery_pitch_rate_measured_dps\":{gunneryPitchAssist.MeasuredPitchRateRadPerSecond * 57.29577951308232:F3},"
            + $"\"gunnery_pitch_rate_error_dps\":{gunneryPitchAssist.PitchRateErrorRadPerSecond * 57.29577951308232:F3},"
            + $"\"gunnery_pitch_assist_g\":{gunneryPitchAssist.AssistedLoadFactorG:F3},"
            + $"\"gunnery_pitch_assist_delta_g\":{gunneryPitchAssist.LoadFactorCorrectionG:F3},"
            + $"\"padlock_roll_assist_selected\":{(padlockRollAssist.Selected ? "true" : "false")},"
            + $"\"padlock_roll_assist_geometry_valid\":{(padlockRollAssist.GeometryValid ? "true" : "false")},"
            + $"\"padlock_roll_assist_captured\":{(padlockRollAssist.Captured ? "true" : "false")},"
            + $"\"padlock_roll_assist_active\":{(padlockRollAssist.Active ? "true" : "false")},"
            + $"\"padlock_roll_assist_any_plane\":{(padlockRollAssist.AnyPlane ? "true" : "false")},"
            + $"\"padlock_roll_assist_target_sequence\":{padlockRollAssist.TargetSpawnSequence},"
            + $"\"padlock_roll_plane_magnitude\":{padlockRollAssist.PlaneMagnitude:F6},"
            + $"\"padlock_roll_error_deg\":{padlockRollAssist.RollErrorRad * 57.29577951308232:F3},"
            + $"\"padlock_roll_rate_cmd_dps\":{padlockRollAssist.DesiredRollRateRadPerSecond * 57.29577951308232:F3},"
            + $"\"padlock_roll_rate_measured_dps\":{padlockRollAssist.MeasuredRollRateRadPerSecond * 57.29577951308232:F3},"
            + $"\"padlock_target_plane_rate_dps\":{padlockRollAssist.EstimatedTargetPlaneRateRadPerSecond * 57.29577951308232:F3},"
            + $"\"padlock_roll_assist_aileron\":{padlockRollAssist.SasRollControl:F4},"
            + $"\"high_alpha_recovery\":{(_detents.HighAlphaRecoveryActive ? "true" : "false")},"
            + $"\"g_valley\":{_detents.ValleyG:F3},"
            + $"\"g_maxperform\":{Protection.MaxPerformG(s, _beat.PlayerAir, trueAirspeedMps, atmosphere):F3},"
            + $"\"g_hardmax\":{Protection.HardMaxG(s, _beat.PlayerAir, trueAirspeedMps, atmosphere):F3},"
            + $"\"g_override_max\":{Protection.OverrideMaxG(s, _beat.PlayerAir, trueAirspeedMps, atmosphere):F3},"
            + $"\"sustained\":{sustainedG:F3},"
            + $"\"sticky\":{_detents.StickyOffsetG:F2},\"tier\":{(int)_detents.Tier},"
            + $"\"variant\":{GetVariant()},\"buffet\":{(_player.Buffet ? "true" : "false")},"
            + $"\"pull_limit\":{PullLimitJson(_player.PullLimit)},"
            + $"\"prompt\":{(int)_cue},"
            + $"\"pitch_deg\":{displayPitchRad * 57.2958:F2},\"bank_deg\":{displayBankRad * 57.2958:F2},"
            + $"\"aoa_deg\":{_player.AngleOfAttackRad * 57.2958:F2},\"beta_deg\":{_player.SideslipRad * 57.2958:F2},\"gamma_deg\":{displayGammaRad * 57.2958:F2},"
            + $"\"heading_deg\":{((displayHeadingRad * 57.2958) % 360 + 360) % 360:F2},"
            + $"\"roll_rate_dps\":{s.BodyRates.P * 57.2958:F2},\"pitch_rate_dps\":{s.BodyRates.Q * 57.2958:F2},\"yaw_rate_dps\":{s.BodyRates.R * 57.2958:F2},"
            + $"\"angle_off_deg\":{Geometry.AngleOff(s, b) * 57.2958:F2},"
            + $"\"range_m\":{Geometry.Range(s, b):F1},\"closure_kts\":{_closureKts:F1},"
            + $"\"gun_window\":{(!Session.WeaponsInhibited && CameraSolver.GunWindow(s, b) ? "true" : "false")},"
            + $"\"gun_solution_raw\":{(_gunKill.InstantaneousGunSolution ? "true" : "false")},"
            + $"\"gun_solution\":{(!Session.WeaponsInhibited && _gunKill.GunSolution ? "true" : "false")},"
            + $"\"lead_valid\":{(!Session.WeaponsInhibited && _gunKill.HasLeadSolution ? "true" : "false")},"
            + $"\"lead_x\":{_gunKill.LeadPipper.X:F3},\"lead_y\":{_gunKill.LeadPipper.Y:F3},\"lead_z\":{_gunKill.LeadPipper.Z:F3},"
            + $"\"lead_tof\":{_gunKill.LeadTimeOfFlight:F4},\"ammo\":{_gunKill.AmmoRemaining},"
            + $"\"gun_muzzle_velocity_mps\":{_gunKill.Profile.MuzzleVelocityMps:F2},"
            + $"\"gun_max_flight_s\":{_gunKill.Profile.MaximumFlightSeconds:F3},"
            + $"\"target_wingspan_m\":{(_beat.BanditAir.WingSpanM > 0.0 ? _beat.BanditAir.WingSpanM : Math.Sqrt(4.5 * _beat.BanditAir.WingAreaM2)):F2},"
            + GunTrajectoryJson(playerPosition, groundVelocity, pf, pl, s.BodyRates,
                _gunKill.Profile)
            + $"\"player_gun_profile_id\":\"{_gunKill.Profile.Id}\","
            + $"\"rounds_fired\":{_gunKill.RoundsFired},\"hits\":{_gunKill.HitCount},"
            + $"\"hit\":{(_gunKill.HitThisStep ? "true" : "false")},"
            + $"\"gun_firing\":{(Session.TriggerDown && Session.PlayerWeaponsAuthorized && _gunKill.AmmoRemaining > 0 && _gunKill.BanditAlive ? "true" : "false")},"
            + TracerJson("tracers", _gunKill.RoundsInFlight)
            + $"\"kill_progress\":{_gunKill.KillProgress:F3},"
            + $"\"opponent_health\":{_gunKill.TargetHealth:F3},\"opponent_alive\":{(_gunKill.TargetAlive ? "true" : "false")},"
            + $"\"bandit_health\":{_gunKill.BanditHealth:F3},"
            + $"\"fight\":\"{_gunKill.Outcome}\",\"bandit_alive\":{(_gunKill.BanditAlive ? "true" : "false")},"
            + $"\"player_health\":{_opponentGun.TargetHealth:F3},\"player_alive\":{(_opponentGun.TargetAlive ? "true" : "false")},"
            + $"\"opponent_ammo\":{_opponentGun.AmmoRemaining},"
            + $"\"opponent_gun_profile_id\":\"{_opponentGun.Profile.Id}\","
            + $"\"opponent_rounds_fired\":{_opponentGun.RoundsFired},\"opponent_hits\":{_opponentGun.HitCount},"
            + $"\"opponent_trigger_down\":{(Session.OpponentTriggerDown ? "true" : "false")},"
            + $"\"opponent_gun_firing\":{(Session.OpponentTriggerDown && _opponentGun.AmmoRemaining > 0 && _opponentGun.TargetAlive ? "true" : "false")},"
            + TracerJson("opponent_tracers", _opponentGun.RoundsInFlight)
            + CombatEventsJson()
            + $"\"kill_count\":{Session.KillCount},\"engagement_number\":{Session.EngagementNumber},"
            + $"\"continuous_combat\":{(Session.ContinuousCombat ? "true" : "false")},"
            + $"\"opponent_replacement_pending\":{(Session.OpponentReplacementPending ? "true" : "false")},"
            + $"\"opponent_replacement_s\":{Session.OpponentReplacementSeconds:F3},"
            + $"\"splash_cue\":{(splashCue ? "true" : "false")},"
            + $"\"transition_cue\":{JsonString(transitionCue)},"
            + $"\"configuration_target\":{JsonString(configurationTarget)},"
            + $"\"configuration_automatic\":{(Session.ConfigurationAutomationEnabled ? "true" : "false")},"
            + $"\"configuration_transition\":{(Session.ConfigurationTransitionActive ? "true" : "false")},"
            + $"\"configuration_gear_auto\":{(Session.AutomaticGearSelection ? "true" : "false")},"
            + $"\"configuration_flap_auto\":{(Session.AutomaticFlapSelection ? "true" : "false")},"
            + $"\"configuration_cue\":{JsonString(configurationCue)},"
            // Legacy frozen drives a mobile CSS interlock; Ready/Paused use their dedicated fields.
            + $"\"below_ground\":{(playerPosition.Y <= surfaceAltitudeM ? "true" : "false")},\"frozen\":false,"
            + $"\"shots_total\":{Session.ShotsTotal},\"shots_in_window\":{Session.ShotsInWindow},"
            + $"\"throttle\":{_detents.Throttle:F3},\"requested_throttle\":{requestedCommand.Throttle:F3},"
            + $"\"applied_throttle\":{appliedCommand.Throttle:F3},\"engine\":{_player.ThrustFraction:F3},"
            + $"\"engine_spool_fraction\":{_player.ThrustFraction:F4},"
            + $"\"has_engine\":{(hasEngine ? "true" : "false")},"
            + $"\"max_thrust_fraction\":{_beat.PlayerAir.MaxThrustFraction:F3},"
            + $"\"has_afterburner\":{(_beat.PlayerAir.MaxThrustFraction > 1.0 ? "true" : "false")},"
            + $"\"has_retractable_gear\":{(hasSimulatedAirframeSystems ? "true" : "false")},"
            + $"\"has_flaps\":{(hasSimulatedAirframeSystems ? "true" : "false")},"
            + $"\"has_electrical_system\":{(hasSimulatedAirframeSystems ? "true" : "false")},"
            + $"\"has_utility_hydraulics\":{(hasSimulatedAirframeSystems ? "true" : "false")},"
            + $"\"engine_rpm_pct\":{engine.RpmPercent:F2},\"engine_thrust_lbf\":{engine.NetThrustLbf:F1},"
            + $"\"engine_net_thrust_lbf\":{engine.NetThrustLbf:F1},"
            + $"\"engine_running\":{(engine.Running ? "true" : "false")},"
            + $"\"fuel_lb\":{_fuel.FuelLb:F2},\"fuel_flow_lb_min\":{_fuel.SmoothedBurnLbPerMinute:F2},"
            + $"\"fuel_flow_pph\":{_fuel.SmoothedBurnLbPerMinute * 60.0:F1},"
            + $"\"fuel_trend_lb_min\":{_fuel.FuelTrendLbPerMinute:F2},"
            + $"\"fuel_minutes_to_joker\":{NullableNumberJson(_fuel.MinutesToJoker)},"
            + $"\"fuel_minutes_to_bingo\":{NullableNumberJson(_fuel.MinutesToBingo)},"
            + $"\"fuel_endurance_minutes\":{NullableNumberJson(_fuel.EnduranceMinutes)},"
            + $"\"fuel_capacity_lb\":{_fuel.CapacityLb:F1},\"fuel_bingo_lb\":{_fuel.BingoThresholdLb:F1},"
            + $"\"fuel_joker_lb\":{NullableNumberJson(_fuel.JokerThresholdLb)},"
            + $"\"fuel_minimum_lb\":{NullableNumberJson(_fuel.MinimumFuelThresholdLb)},"
            + $"\"fuel_emergency_lb\":{NullableNumberJson(_fuel.EmergencyFuelThresholdLb)},"
            + $"\"fuel_consumes\":{(_fuel.ConsumesFuel ? "true" : "false")},"
            + $"\"fuel_joker\":{(_fuel.IsJoker ? "true" : "false")},"
            + $"\"fuel_bingo\":{(_fuel.IsBingo ? "true" : "false")},"
            + $"\"fuel_minimum\":{(_fuel.IsMinimumFuel ? "true" : "false")},"
            + $"\"fuel_emergency\":{(_fuel.IsEmergencyFuel ? "true" : "false")},"
            + $"\"rtb\":{(_fuel.RtbAdvisory ? "true" : "false")},\"rtb_steer\":{(rtb.Active ? "true" : "false")},"
            + $"\"rtb_bearing_deg\":{rtb.BearingRad * 57.29577951308232:F2},\"rtb_turn_deg\":{rtb.TurnRad * 57.29577951308232:F2},"
            + $"\"rtb_range_nm\":{rtb.RangeM / 1852.0:F2},"
            + $"\"gear_handle\":\"{GearHandleToken(_systems.GearHandle)}\","
            + $"\"gear_nose\":{_systems.NoseGearPosition:F4},\"gear_left\":{_systems.LeftMainGearPosition:F4},\"gear_right\":{_systems.RightMainGearPosition:F4},"
            + $"\"gear_nose_indication\":\"{GearIndicationToken(_systems.NoseGearIndication)}\","
            + $"\"gear_left_indication\":\"{GearIndicationToken(_systems.LeftMainGearIndication)}\","
            + $"\"gear_right_indication\":\"{GearIndicationToken(_systems.RightMainGearIndication)}\","
            + $"\"gear_unsafe\":{(_systems.GearUnsafeLight ? "true" : "false")},"
            + $"\"gear_warning_horn\":{(_systems.GearWarningHorn ? "true" : "false")},"
            + $"\"gear_limit_exceeded\":{(_systems.GearLimitExceeded ? "true" : "false")},"
            + $"\"flap_lever\":\"{FlapLeverToken(_systems.FlapLever)}\","
            + $"\"flap_left_deg\":{_systems.LeftFlapDegrees:F2},\"flap_right_deg\":{_systems.RightFlapDegrees:F2},"
            + $"\"flap_split\":{(_systems.FlapSplit ? "true" : "false")},"
            + $"\"flap_limit_exceeded\":{(_systems.FlapLimitExceeded ? "true" : "false")},"
            + $"\"primary_bus_powered\":{(_systems.PrimaryBusPowered ? "true" : "false")},"
            + $"\"utility_hydraulic_pressure_psi\":{_systems.UtilityHydraulicPressurePsi:F1},"
            + $"\"utility_hydraulic_nominal_psi\":{_systems.Profile.UtilityHydraulicNominalPsi:F1},"
            + MaintenanceScenarioJson()
            + VisualMergeEvaluationJson()
            + DroneRaidEvaluationJson()
            + $"\"approach\":{(_detents.ApproachMode ? "true" : "false")},"
            + $"\"mode\":\"{mode}\",\"wave_off\":{(waveOff ? "true" : "false")},"
            + lsoJson
            + CarrierJson(simulationPosition)
            + $"\"context\":{JsonString(context)},\"beat\":{JsonString(_beat.Name)}"
            + "}";
    }

    static int GetVariant() => Session.Variant == ValleyVariant.PhysicsOnly ? 1 : 0;

    // The flat browser snapshot's JSON primitives live in the plain, testable SnapshotJson helper
    // (sim.Tests links and exercises it). These thin delegates keep every existing call site
    // unchanged while removing the duplicate implementation.
    static string NullableNumberJson(double? value) => SnapshotJson.NullableNumberJson(value);

    static string FiniteNumberJson(double value) => SnapshotJson.FiniteNumberJson(value);

    static string JsonString(string? value) => SnapshotJson.JsonString(value);

    /// <summary>
    /// Slowly changing cloud-definition contract for the browser volume renderer. The exact
    /// at-aircraft visibility and hazards above still come from ICloudField.Sample; these immutable
    /// descriptors let presentation reconstruct the surrounding seeded field without inventing a
    /// second weather day. Z remains simulation north here and is flipped once by the JS adapter.
    /// </summary>
    static string WeatherRenderJson() {
        WeatherProfile? profile = Session.Weather;
        if (ReferenceEquals(profile, _weatherRenderProfile) && _weatherRenderJson is not null)
            return _weatherRenderJson;
        var json = new System.Text.StringBuilder(512);
        json.Append("\"weather_profile_id\":").Append(JsonString(profile?.Id));
        if (profile?.Clouds is not LayeredCloudField field) {
            _weatherRenderProfile = profile;
            _weatherRenderJson = json.Append(",\"weather_seed_hex\":\"0000000000000000\","
                + "\"weather_clear_visibility_m\":100000.0,\"weather_layers\":[],"
                + "\"weather_cells\":[],").ToString();
            return _weatherRenderJson;
        }

        json.Append(",\"weather_seed_hex\":\"")
            .Append(field.Seed.ToString("x16", System.Globalization.CultureInfo.InvariantCulture))
            .Append("\",\"weather_clear_visibility_m\":")
            .AppendFormat(System.Globalization.CultureInfo.InvariantCulture, "{0:F1}",
                field.ClearAirVisibilityM)
            .Append(",\"weather_layers\":[");
        for (int i = 0; i < field.Layers.Count; i++) {
            if (i != 0) json.Append(',');
            CloudLayerDefinition layer = field.Layers[i];
            json.AppendFormat(System.Globalization.CultureInfo.InvariantCulture,
                "{{\"base_m\":{0:F1},\"top_m\":{1:F1},\"coverage_01\":{2:F4},"
                + "\"scale_m\":{3:F1},\"edge_m\":{4:F1},\"extinction_per_m\":{5:F8},"
                + "\"liquid_kg_m3\":{6:F7},\"ice_kg_m3\":{7:F7},"
                + "\"precipitation_mm_hr\":{8:F3},\"turbulence_mps\":{9:F3},"
                + "\"vertical_air_mps\":{10:F3},\"icing_01\":{11:F4},"
                + "\"lightning_01\":{12:F4},\"wind_east_mps\":{13:F3},"
                + "\"wind_north_mps\":{14:F3}}}",
                layer.BaseAltitudeM, layer.TopAltitudeM, layer.MeanCloudFraction01,
                layer.HorizontalStructureScaleM, layer.VerticalEdgeTransitionM,
                layer.ExtinctionPerMetreAtFullCloud, layer.LiquidWaterKgPerM3AtFullCloud,
                layer.IceWaterKgPerM3AtFullCloud,
                layer.PrecipitationMmPerHourAtFullCloud,
                layer.TurbulenceRmsMpsAtFullCloud,
                layer.VerticalAirVelocityMpsAtFullCloud,
                layer.IcingHazard01AtFullCloud, layer.LightningHazard01AtFullCloud,
                layer.AdvectionVelocityMps.X, layer.AdvectionVelocityMps.Z);
        }

        json.Append("],\"weather_cells\":[");
        for (int i = 0; i < field.ConvectiveCells.Count; i++) {
            if (i != 0) json.Append(',');
            ConvectiveCellDefinition cell = field.ConvectiveCells[i];
            json.AppendFormat(System.Globalization.CultureInfo.InvariantCulture,
                "{{\"east_m\":{0:F1},\"north_m\":{1:F1},\"base_m\":{2:F1},"
                + "\"top_m\":{3:F1},\"radius_east_m\":{4:F1},"
                + "\"radius_north_m\":{5:F1},\"start_s\":{6:F2},"
                + "\"lifetime_s\":{7:F2},\"transition_s\":{8:F2},"
                + "\"wind_east_mps\":{9:F3},\"wind_north_mps\":{10:F3},"
                + "\"coverage_01\":{11:F4},\"extinction_per_m\":{12:F8},"
                + "\"liquid_kg_m3\":{13:F7},\"ice_kg_m3\":{14:F7},"
                + "\"precipitation_mm_hr\":{15:F3},\"turbulence_mps\":{16:F3},"
                + "\"vertical_air_mps\":{17:F3},\"icing_01\":{18:F4},"
                + "\"lightning_01\":{19:F4}}}",
                cell.InitialCentreWorldM.X, cell.InitialCentreWorldM.Z,
                cell.BaseAltitudeM, cell.TopAltitudeM,
                cell.HorizontalRadiusEastM, cell.HorizontalRadiusNorthM,
                cell.StartTimeSeconds, cell.LifetimeSeconds,
                cell.LifecycleTransitionSeconds, cell.AdvectionVelocityMps.X,
                cell.AdvectionVelocityMps.Z, cell.PeakCloudFraction01,
                cell.PeakExtinctionPerMetre, cell.PeakLiquidWaterKgPerM3,
                cell.PeakIceWaterKgPerM3, cell.PeakPrecipitationMmPerHour,
                cell.PeakTurbulenceRmsMps, cell.PeakVerticalAirVelocityMps,
                cell.PeakIcingHazard01, cell.PeakLightningHazard01);
        }
        _weatherRenderProfile = profile;
        _weatherRenderJson = json.Append("],").ToString();
        return _weatherRenderJson;
    }

    static string PilotStateToken(PilotOperationalState state) => state switch {
        PilotOperationalState.Straining => "STRAINING",
        PilotOperationalState.Grayout => "GRAYOUT",
        PilotOperationalState.Blackout => "BLACKOUT",
        PilotOperationalState.GLoc => "G_LOC",
        PilotOperationalState.Recovering => "RECOVERING",
        PilotOperationalState.Redout => "REDOUT",
        _ => "NORMAL"
    };

    static string AutoGcasPhaseToken(AutoGcasPhase phase) => phase switch {
        AutoGcasPhase.Armed => "ARMED",
        AutoGcasPhase.Warning => "WARNING",
        AutoGcasPhase.FlyUp => "FLY_UP",
        AutoGcasPhase.Inhibited => "INHIBITED",
        _ => "UNAVAILABLE"
    };

    static string AutoGcasInhibitToken(AutoGcasInhibitReason reason) => reason switch {
        AutoGcasInhibitReason.CapabilityUnavailable => "CAPABILITY_UNAVAILABLE",
        AutoGcasInhibitReason.Disabled => "DISABLED",
        AutoGcasInhibitReason.Configuration => "CONFIGURATION",
        AutoGcasInhibitReason.LowAirspeed => "LOW_AIRSPEED",
        AutoGcasInhibitReason.TerrainData => "TERRAIN_DATA",
        AutoGcasInhibitReason.InvalidState => "INVALID_STATE",
        AutoGcasInhibitReason.PilotOverride => "PILOT_OVERRIDE",
        _ => "NONE"
    };

    static string GearHandleToken(LandingGearHandle handle) => handle switch {
        LandingGearHandle.Down => "DOWN",
        _ => "UP"
    };

    static string FlapLeverToken(WingFlapLever lever) => lever switch {
        WingFlapLever.Up => "UP",
        WingFlapLever.Down => "DOWN",
        _ => "HOLD"
    };

    static string GearIndicationToken(LandingGearIndication indication) => indication switch {
        LandingGearIndication.UpLocked => "UP_LOCKED",
        LandingGearIndication.DownLocked => "DOWN_LOCKED",
        _ => "STRIPED"
    };

    static string MaintenanceScenarioJson() {
        F86EmergencyGearRecoveryScenario? scenario = Session.MaintenanceScenario;
        if (scenario is null)
            return "\"maintenance_scenario\":false,";

        string state = scenario.State switch {
            F86EmergencyGearRecoveryState.AwaitingStart => "AWAITING_START",
            F86EmergencyGearRecoveryState.NormalCheck => "NORMAL_CHECK",
            F86EmergencyGearRecoveryState.ObserveNormalExtension => "OBSERVE_NORMAL_EXTENSION",
            F86EmergencyGearRecoveryState.ConfigureForEmergencyExtension => "CONFIGURE",
            F86EmergencyGearRecoveryState.EmergencyExtend => "EMERGENCY_EXTEND",
            F86EmergencyGearRecoveryState.VerifyDownlocks => "VERIFY_DOWNLOCKS",
            F86EmergencyGearRecoveryState.Recover => "RECOVER",
            F86EmergencyGearRecoveryState.Recovered => "RECOVERED",
            _ => "AIRCRAFT_LOST"
        };
        return "\"maintenance_scenario\":true,"
            + $"\"maintenance_state\":\"{state}\","
            + $"\"maintenance_instruction\":{JsonString(scenario.PilotInstruction)},"
            + $"\"maintenance_score\":{scenario.Score},"
            + $"\"maintenance_max_score\":{scenario.MaximumScore},"
            + $"\"maintenance_demerits\":{scenario.DemeritCount},"
            + $"\"maintenance_procedure_complete\":{(scenario.ProcedurallyComplete ? "true" : "false")},"
            + $"\"maintenance_recovered\":{(scenario.Recovered ? "true" : "false")},";
    }

    static string VisualMergeEvaluationJson() {
        VisualMergeEvaluation? evaluation = Session.VisualMergeEvaluation;
        if (evaluation is null)
            return "\"visual_merge_evaluation\":false,\"weapons_inhibited\":false,"
                + "\"player_trigger_interlocked\":false,\"weapons_hot_cue\":false,"
                + "\"weapons_state_cue\":\"\",";
        return "\"visual_merge_evaluation\":true,"
            + $"\"weapons_inhibited\":{(evaluation.WeaponsInhibited ? "true" : "false")},"
            + $"\"player_trigger_interlocked\":{(evaluation.PlayerTriggerInterlocked ? "true" : "false")},"
            + $"\"weapons_hot_cue\":{(evaluation.WeaponsHotCueActive ? "true" : "false")},"
            + $"\"weapons_state_cue\":{JsonString(evaluation.WeaponsStateCue)},"
            + $"\"first_pass_complete\":{(evaluation.FirstPassComplete ? "true" : "false")},"
            + $"\"visual_merge_score\":{evaluation.Score},"
            + $"\"minimum_merge_range_m\":{evaluation.MinimumMergeRangeM:F1},"
            + $"\"minimum_energy_kias\":{evaluation.MinimumEnergyKias:F1},"
            + $"\"peak_closure_kts\":{evaluation.PeakClosureKts:F1},"
            + $"\"closure_decision_score\":{evaluation.ClosureScore:F1},"
            + $"\"rear_quarter_valid\":{(evaluation.CurrentRearQuarterValid ? "true" : "false")},"
            + $"\"rear_quarter_dwell_s\":{evaluation.RearQuarterDwellSeconds:F2},"
            + $"\"head_on_trigger_violations\":{evaluation.HeadOnTriggerViolations},"
            + $"\"high_aspect_trigger_violations\":{evaluation.HighAspectTriggerViolations},"
            + $"\"overshoot_count\":{evaluation.Overshoots},"
            + $"\"evaluated_projectile_rounds\":{evaluation.ProjectileRoundsFired},"
            + $"\"evaluated_projectile_hits\":{evaluation.ProjectileHits},";
    }

    static string DroneRaidEvaluationJson() {
        DroneRaidEvaluation? evaluation = Session.DroneRaidEvaluation;
        if (evaluation is null)
            return "\"drone_raid_evaluation\":false,";

        string timeToLeak = double.IsFinite(evaluation.TargetTimeToLeakSeconds)
            ? evaluation.TargetTimeToLeakSeconds.ToString("F2",
                System.Globalization.CultureInfo.InvariantCulture)
            : "null";
        return "\"drone_raid_evaluation\":true,"
            + $"\"drone_raid_mode\":\"{DroneRaidScenarioDefinition.ResolutionMode}\","
            + $"\"drone_raid_score\":{evaluation.Score},"
            + $"\"drone_raid_max_score\":{evaluation.MaximumScore},"
            + $"\"drone_raid_containment_score\":{evaluation.ContainmentScore},"
            + $"\"drone_raid_time_score\":{evaluation.TimeScore},"
            + $"\"drone_raid_fire_discipline_score\":{evaluation.FireDisciplineScore},"
            + $"\"drone_raid_targets_total\":{evaluation.TotalTargets},"
            + $"\"drone_raid_targets_resolved\":{evaluation.TargetsResolved},"
            + $"\"drone_raid_active_target\":{evaluation.ActiveTargetNumber},"
            + $"\"drone_raid_kills\":{evaluation.Kills},"
            + $"\"drone_raid_leakers\":{evaluation.Leakers},"
            + $"\"drone_raid_zero_leakers\":{(evaluation.ZeroLeakers ? "true" : "false")},"
            + $"\"drone_raid_finished\":{(evaluation.Finished ? "true" : "false")},"
            + $"\"drone_raid_ownship_lost\":{(evaluation.OwnshipLost ? "true" : "false")},"
            + $"\"drone_raid_target_elapsed_s\":{evaluation.ActiveTargetElapsedSeconds:F2},"
            + $"\"drone_raid_time_to_leak_s\":{timeToLeak},"
            + $"\"drone_raid_average_ttn_s\":{evaluation.AverageTimeToNeutralizeSeconds:F2},"
            + $"\"drone_raid_rounds_per_kill\":{evaluation.RoundsPerKill:F2},"
            + $"\"drone_raid_tail_chase\":{(evaluation.TailChaseGeometry ? "true" : "false")},"
            + $"\"drone_raid_cue\":{JsonString(evaluation.Cue)},";
    }

    /// Stable pack/profile identity and entity-to-presentation bindings for the current snapshot.
    /// Session-owned spawn sequences yield a fresh entity ID on the exact snapshot where a logical
    /// vehicle replaces the prior one, including restart and crash respawn. This keeps render-
    /// instance lifetime out of display names, coordinates, and resettable mission counters.
    static string PresentationContractJson(bool hasCarrier) {
        MissionContract mission = Session.Beat.MissionIdentity;
        AircraftCapability player = Session.Beat.PlayerAircraft;
        AircraftCapability bandit = Session.Beat.BanditAircraft;
        // Content family expresses the world/era; presentation follows the actual vehicle stack.
        // Both 2030s missions share a family, but the balloon glider and F-22 drone-defence
        // surrogate must not advertise one another's compatibility profile.
        bool balloonPrototype = player.Id == AircraftCapability.BalloonGliderPrototype.Id;
        bool modernSurrogate = mission.ContentFamily
            == MissionContentFamily.ModernPublicDataSurrogate
            || player.Id == AircraftCapability.F22ASurrogate.Id;
        string packId = modernSurrogate ? ModernSurrogatePackId
            : balloonPrototype ? BalloonPackId : KoreaPackId;
        string packVersion = modernSurrogate ? ModernSurrogatePackVersion
            : balloonPrototype ? BalloonPackVersion : KoreaPackVersion;
        string packUriJson = modernSurrogate || balloonPrototype
            ? "null" : $"\"{KoreaPackUri}\"";
        string presentationProfileId = modernSurrogate
            ? ModernSurrogatePresentationProfileId
            : balloonPrototype ? BalloonPresentationProfileId : KoreaPresentationProfileId;
        string visualProfileId = modernSurrogate
            ? ModernSurrogateVisualProfileId
            : balloonPrototype ? BalloonVisualProfileId : KoreaVisualProfileId;
        string assetProfileJson = modernSurrogate || balloonPrototype
            ? "null" : $"\"{KoreaAssetProfileId}\"";
        string assetManifestJson = modernSurrogate || balloonPrototype
            ? "null" : $"\"{KoreaAssetManifestId}\"";
        string audioProfileJson = modernSurrogate || balloonPrototype
            ? "null" : $"\"{FixedWingAudioProfileId}\"";
        string cockpitPresentationJson = modernSurrogate || balloonPrototype
            ? "null" : $"\"{PlayerCockpitPresentationId}\"";
        string carrierEntityJson = hasCarrier
            ? $"\"entity.carrier.{Session.CarrierSpawnSequence}\"" : "null";
        string carrierPresentationJson = hasCarrier ? $"\"{CarrierPresentationId}\"" : "null";
        // Production telemetry must know which AI tier a fight was against. Skill exists only on
        // the two doctrine pilots; scripted rail/wreck actors project null, never a fake tier.
        string banditSkillJson = Session.Bandit switch {
            NeutralMergeBandit merge => $"\"{PilotSkillToken(merge.Skill)}\"",
            ReactiveBandit reactive => $"\"{PilotSkillToken(reactive.Skill)}\"",
            _ => "null"
        };

        return $"\"snapshot_schema_version\":\"{SnapshotSchemaVersion}\","
            + $"\"pack_id\":\"{packId}\",\"pack_version\":\"{packVersion}\","
            + $"\"content_pack_uri\":{packUriJson},"
            + $"\"mission_definition_id\":{JsonString(mission.Id)},"
            + $"\"mission_era\":\"{mission.Era}\","
            + $"\"rules_of_engagement\":\"{mission.RulesOfEngagement}\","
            + $"\"public_data_surrogate\":{(mission.PublicDataSurrogate ? "true" : "false")},"
            + $"\"presentation_profile_id\":\"{presentationProfileId}\","
            + $"\"visual_profile_id\":\"{visualProfileId}\","
            + $"\"asset_profile_id\":{assetProfileJson},\"asset_manifest_id\":{assetManifestJson},"
            + $"\"camera_profile_id\":\"{FixedWingCameraProfileId}\","
            + $"\"hud_profile_id\":\"{FixedWingHudProfileId}\","
            + $"\"input_profile_id\":\"{FixedWingInputProfileId}\","
            + $"\"audio_profile_id\":{audioProfileJson},"
            + $"\"effects_profile_id\":\"{FixedWingEffectsProfileId}\","
            + $"\"player_aircraft_id\":{JsonString(player.Id)},"
            + $"\"player_aircraft_name\":{JsonString(player.DisplayName)},"
            + $"\"player_systems_profile_id\":{JsonString(player.SystemsProfileId)},"
            + $"\"player_systems_simulated\":{(player.SystemsSimulated ? "true" : "false")},"
            + $"\"player_entity_id\":\"entity.player.{Session.PlayerSpawnSequence}\","
            + $"\"player_presentation_id\":{JsonString(player.PresentationId)},"
            + $"\"cockpit_presentation_id\":{cockpitPresentationJson},"
            + $"\"bandit_aircraft_id\":{JsonString(bandit.Id)},"
            + $"\"bandit_aircraft_name\":{JsonString(bandit.DisplayName)},"
            + $"\"bandit_systems_profile_id\":{JsonString(bandit.SystemsProfileId)},"
            + $"\"bandit_systems_simulated\":{(bandit.SystemsSimulated ? "true" : "false")},"
            + $"\"bandit_entity_id\":\"entity.bandit.{Session.BanditSpawnSequence}\","
            + $"\"bandit_presentation_id\":{JsonString(bandit.PresentationId)},"
            + $"\"bandit_skill\":{banditSkillJson},"
            + $"\"carrier_entity_id\":{carrierEntityJson},"
            + $"\"carrier_presentation_id\":{carrierPresentationJson},";
    }

    /// <summary>
    /// ~9 closed-form samples of the gun's bullets-in-the-air locus (GunKill.BallisticFunnelPoint):
    /// where a round fired age seconds ago is NOW, ages evenly spaced out to the effective
    /// wingspan-ranging envelope. r is each sample's current range from the shooter, which is the
    /// scale the HUD funnel's wingspan half-width keys on. A deterministic pure function of the
    /// emitted player state (position, velocity, body axes, body rates) — the HUD only projects.
    /// </summary>
    static string GunTrajectoryJson(in Vec3D shooterPosition, in Vec3D shooterVelocity,
        in Vec3D bodyForward, in Vec3D bodyUp, in BodyRates bodyRates, GunProfile profile) {
        const int SampleCount = 9;
        double horizonSeconds = Math.Min(profile.MaximumFlightSeconds,
            GunKill.EffectiveRangingFlightSeconds);
        Vec3D angularVelocity = GunKill.WorldAngularVelocity(bodyForward, bodyUp, bodyRates);
        var json = new System.Text.StringBuilder(32 + SampleCount * 64);
        json.Append("\"gun_trajectory\":[");
        for (int i = 0; i < SampleCount; i++) {
            if (i != 0) json.Append(',');
            double age = horizonSeconds * i / (SampleCount - 1);
            Vec3D p = GunKill.BallisticFunnelPoint(shooterPosition, shooterVelocity,
                bodyForward, angularVelocity, profile.MuzzleVelocityMps, age);
            json.AppendFormat(System.Globalization.CultureInfo.InvariantCulture,
                "{{\"x\":{0:F2},\"y\":{1:F2},\"z\":{2:F2},\"r\":{3:F1}}}",
                p.X, p.Y, p.Z, (p - shooterPosition).Length);
        }
        json.Append("],");
        return json.ToString();
    }

    // Flat numeric arrays keep the web hot path compact: [x,y,z,vx,vy,vz].
    static string TracerJson(string propertyName, IReadOnlyList<GunRound> rounds) {
        const int MaxRenderedTracers = 48;
        int first = Math.Max(0, rounds.Count - MaxRenderedTracers);
        var json = new System.Text.StringBuilder(propertyName.Length + 8
            + (rounds.Count - first) * 72);
        json.Append('"').Append(propertyName).Append("\":[");
        for (int i = first; i < rounds.Count; i++) {
            if (i != first) json.Append(',');
            GunRound round = rounds[i];
            json.AppendFormat(System.Globalization.CultureInfo.InvariantCulture,
                "[{0:F3},{1:F3},{2:F3},{3:F3},{4:F3},{5:F3}]",
                round.Position.X, round.Position.Y, round.Position.Z,
                round.Velocity.X, round.Velocity.Y, round.Velocity.Z);
        }
        json.Append("],");
        return json.ToString();
    }

    static string PullLimitJson(PullLimitStatus status) => status.Reason switch {
        PullLimitReason.AerodynamicClMax => "\"CLMAX\"",
        PullLimitReason.Structural => "\"STRUCTURAL\"",
        PullLimitReason.TvcSaturated => "\"TVC\"",
        _ => "null",
    };

    static string PilotSkillToken(PilotSkill skill) => skill switch {
        PilotSkill.Novice => "NOVICE",
        PilotSkill.Veteran => "VETERAN",
        PilotSkill.Ace => "ACE",
        _ => "COMPETENT"
    };

    static string SortieOutcomeToken(SortieOutcome outcome) => outcome switch {
        SortieOutcome.Victory => "VICTORY",
        SortieOutcome.Defeat => "DEFEAT",
        SortieOutcome.Draw => "DRAW",
        _ => "NONE"
    };

    static string EventTypeToken(SessionEventType type) => type switch {
        SessionEventType.Hit => "HIT",
        SessionEventType.Destroyed => "DESTROYED",
        SessionEventType.Impact => "IMPACT",
        SessionEventType.Settled => "SETTLED",
        SessionEventType.TerminalLimitReached => "TERMINAL_LIMIT_REACHED",
        SessionEventType.SortieFinished => "SORTIE_FINISHED",
        SessionEventType.ArrestmentFailed => "ARRESTMENT_FAILED",
        SessionEventType.RaidTargetLeaked => "RAID_TARGET_LEAKED",
        SessionEventType.OpponentSpawned => "OPPONENT_SPAWNED",
        SessionEventType.AutoGcasTransition => "AUTO_GCAS_TRANSITION",
        _ => "UNKNOWN"
    };

    static string ArrestmentFailureToken(
        ArrestmentModel.ArrestmentFailureReason reason) => reason switch {
        ArrestmentModel.ArrestmentFailureReason.EnergyCapacityExceeded =>
            "ENERGY_CAPACITY_EXCEEDED",
        ArrestmentModel.ArrestmentFailureReason.RunoutExhausted =>
            "RUNOUT_EXHAUSTED",
        ArrestmentModel.ArrestmentFailureReason.LineLoadExceeded =>
            "LINE_LOAD_EXCEEDED",
        _ => "NONE"
    };

    static string TerminalStateToken(AircraftTerminalState state) => state switch {
        AircraftTerminalState.DestroyedAirborne => "DESTROYED_AIRBORNE",
        AircraftTerminalState.Impacted => "IMPACTED",
        AircraftTerminalState.Settled => "SETTLED",
        AircraftTerminalState.SimulationBounded => "SIMULATION_BOUNDED",
        _ => "FLYING"
    };

    static string ImpactSurfaceToken(ImpactSurface surface) => surface switch {
        ImpactSurface.Water => "WATER",
        ImpactSurface.Ground => "GROUND",
        ImpactSurface.FlightDeck => "FLIGHT_DECK",
        ImpactSurface.CarrierStructure => "CARRIER_STRUCTURE",
        ImpactSurface.SimulationBoundary => "SIMULATION_BOUNDARY",
        _ => "NONE"
    };

    static bool HasSharedTerrainFrame(int index) => index is not (5 or 6);

    static string WorldFrameId(int index) => HasSharedTerrainFrame(index)
        ? SharedTerrainFrameId : CarrierTrainingFrameId;

    static double TerrainPlacementEastM(int index) => HasSharedTerrainFrame(index)
        ? -WorldOriginEastM : CarrierTerrainPlacementEastM;

    static double TerrainPlacementNorthM(int index) => HasSharedTerrainFrame(index)
        ? -WorldOriginNorthM : 0.0;

    static string CombatRoleToken(CombatRole role) => role switch {
        CombatRole.Player => "PLAYER",
        CombatRole.Opponent => "OPPONENT",
        _ => "NONE"
    };

    static string CombatEventsJson() {
        IReadOnlyList<SessionEvent> events = Session.RecentEvents;
        var json = new System.Text.StringBuilder(24 + events.Count * 128);
        json.Append("\"recent_events\":[");
        for (int i = 0; i < events.Count; i++) {
            if (i != 0) json.Append(',');
            SessionEvent e = events[i];
            json.Append("{\"sequence\":").Append(e.Sequence)
                .Append(",\"tick\":").Append(e.Tick)
                .Append(",\"type\":\"").Append(EventTypeToken(e.Type))
                .Append("\",\"source\":\"").Append(CombatRoleToken(e.Source))
                .Append("\",\"target\":\"").Append(CombatRoleToken(e.Target))
                .Append("\",\"count\":").Append(e.Count)
                .Append(",\"outcome\":\"").Append(SortieOutcomeToken(e.Outcome))
                .Append("\",\"surface\":\"").Append(ImpactSurfaceToken(e.Surface))
                .Append('"');
            if (e.EntitySequence > 0) {
                string entityKind = e.Target == CombatRole.Player ? "player" : "bandit";
                json.Append(",\"entity_id\":\"entity.").Append(entityKind).Append('.')
                    .Append(e.EntitySequence).Append('"');
            }
            if (e.HasKinematics) {
                json.AppendFormat(System.Globalization.CultureInfo.InvariantCulture,
                    ",\"position\":[{0:F3},{1:F3},{2:F3}],\"velocity\":[{3:F3},{4:F3},{5:F3}]",
                    e.Position.X, e.Position.Y, e.Position.Z,
                    e.Velocity.X, e.Velocity.Y, e.Velocity.Z);
            }
            if (e.Type == SessionEventType.AutoGcasTransition
                && e.AutoGcasPhase is { } autoGcasPhase
                && e.AutoGcasInhibitReason is { } autoGcasInhibitReason) {
                json.Append(",\"auto_gcas_phase\":\"")
                    .Append(AutoGcasPhaseToken(autoGcasPhase))
                    .Append("\",\"auto_gcas_inhibit_reason\":\"")
                    .Append(AutoGcasInhibitToken(autoGcasInhibitReason))
                    .Append("\",\"auto_gcas_cue\":")
                    .Append(JsonString(e.AutoGcasCue))
                    .Append(",\"auto_gcas_activation_count\":")
                    .Append(e.AutoGcasActivationCount)
                    .Append(",\"auto_gcas_release_count\":")
                    .Append(e.AutoGcasReleaseCount)
                    .Append(",\"auto_gcas_override_count\":")
                    .Append(e.AutoGcasOverrideCount);
            }
            json.Append('}');
        }
        json.Append("],");
        return json.ToString();
    }

    // Empty for non-carrier beats; otherwise supplies the carrier render and recovery contract.
    static string CarrierJson(in Vec3D playerPosition) {
        Carrier? carrier = Session.Carrier;
        if (carrier is null) return "";
        Carrier c = carrier;
        AircraftSim player = Session.Player;
        Carrier.TouchdownResult touchdown = Session.Touchdown;
        Carrier.Recovery recovery = Session.Recovery;
        ArrestmentModel arrestment = Session.Arrestment;
        CatapultLaunchModel catapult = Session.Catapult;
        RecoveryDifficulty difficulty = Session.Difficulty;
        CarrierPassResult pass = Session.CarrierPass;
        BurbleField? burble = Session.Burble;

        var (along, cross, height) = c.LandingFrame(playerPosition);
        string config = c.Configuration == Carrier.DeckConfiguration.Angled ? "ANGLED" : "AXIAL";
        string arrestPhase = arrestment.Phase switch {
            ArrestmentModel.ArrestmentPhase.Arrested => "ARRESTED",
            ArrestmentModel.ArrestmentPhase.Stopped => "STOPPED",
            ArrestmentModel.ArrestmentPhase.Failed => "FAILED",
            _ => "NONE"
        };
        bool contacted = touchdown.Recovery != Carrier.Recovery.Flying;
        double airspeed = contacted
            ? touchdown.IndicatedAirspeedMps
            : player.IndicatedAirspeedMps;
        double closure = catapult.IsActive ? catapult.RelativeSpeedMps
            : arrestment.IsActive ? arrestment.RelativeSpeedMps
            : contacted ? touchdown.ClosureMps : c.DeckClosureMps(player.State);
        double sink = contacted ? touchdown.SinkRateMps : c.DeckSinkRateMps(player.State);
        Vec3D deckVelocity = c.DeckRelativeVelocity(player.State);
        double inClose = burble?.InCloseStrength(player.State.Position) ?? 0.0;
        int wire = arrestment.CaughtWire != 0 ? arrestment.CaughtWire : touchdown.Wire;
        string quality = touchdown.Quality.ToString().ToUpperInvariant();
        string hook = touchdown.Hook.ToString().ToUpperInvariant();
        string grade = touchdown.Grade switch {
            Carrier.TouchdownGrade.NoGrade => "NO GRADE",
            _ => touchdown.Grade.ToString().ToUpperInvariant()
        };
        string deviations = touchdown.Deviations.ToString().ToUpperInvariant()
            .Replace(", ", "|");
        string correction = touchdown.PrimaryCorrection switch {
            Carrier.TouchdownCorrection.WaveOffEarlier => "WAVE OFF EARLIER",
            Carrier.TouchdownCorrection.AddPowerEarlier => "ADD POWER EARLIER",
            Carrier.TouchdownCorrection.StabilizeIas => "STABILIZE IAS",
            Carrier.TouchdownCorrection.EstablishLineupEarlier => "ESTABLISH LINEUP EARLIER",
            Carrier.TouchdownCorrection.FlyOnSpeedAoa => "FLY ON-SPEED AOA",
            Carrier.TouchdownCorrection.FlyThroughNoFlare => "FLY THROUGH — DO NOT FLARE",
            Carrier.TouchdownCorrection.MeetAdaptiveTarget => "MEET TRAINING TARGET",
            _ => "NONE"
        };
        string passGrade = pass.Grade switch {
            CarrierPassGrade.NoGrade => "NO GRADE",
            _ => pass.Grade.ToString().ToUpperInvariant()
        };
        string passDeviations = pass.Deviations.ToString().ToUpperInvariant()
            .Replace(", ", "|");
        string passCorrection = pass.PrimaryCorrection switch {
            Carrier.TouchdownCorrection.WaveOffEarlier => "WAVE OFF EARLIER",
            Carrier.TouchdownCorrection.AddPowerEarlier => "ADD POWER EARLIER",
            Carrier.TouchdownCorrection.StabilizeIas => "STABILIZE IAS",
            Carrier.TouchdownCorrection.EstablishLineupEarlier => "ESTABLISH LINEUP EARLIER",
            Carrier.TouchdownCorrection.FlyOnSpeedAoa => "FLY ON-SPEED AOA",
            Carrier.TouchdownCorrection.FlyThroughNoFlare => "FLY THROUGH — DO NOT FLARE",
            Carrier.TouchdownCorrection.MeetAdaptiveTarget => "MEET TRAINING TARGET",
            _ => "NONE"
        };
        return $"\"carrier\":true,"
            + $"\"cx\":{c.Position.X:F2},\"cy\":{c.Position.Y:F2},\"cz\":{c.Position.Z:F2},"
            + $"\"cheading\":{c.HeadingRad:F5},\"deck_len\":{c.DeckLengthM:F1},\"deck_w\":{c.DeckHalfWidthM * 2:F1},\"deck_alt\":{c.DeckAltM:F1},"
            + $"\"landing_heading\":{c.LandingHeadingRad:F5},\"deck_config\":\"{config}\","
            + $"\"tx\":{c.TouchdownPoint.X:F2},\"ty\":{c.TouchdownPoint.Y:F2},\"tz\":{c.TouchdownPoint.Z:F2},"
            + $"\"ax\":{c.ApproachCuePoint.X:F2},\"ay\":{c.ApproachCuePoint.Y:F2},\"az\":{c.ApproachCuePoint.Z:F2},"
            + $"\"approach_cue_lead_m\":{c.ApproachCueLeadM:F1},"
            + $"\"approach_director_pitch_deg\":{c.ApproachDirectorPitchOffsetRad * 57.29577951308232:F3},"
            + $"\"deck_vx\":{deckVelocity.X:F3},\"deck_vy\":{deckVelocity.Y:F3},\"deck_vz\":{deckVelocity.Z:F3},"
            + $"\"deck_along\":{along:F1},\"deck_cross\":{cross:F1},\"deck_height\":{height:F1},"
            + $"\"difficulty_level\":{difficulty.Level},\"difficulty_baseline\":{difficulty.SkillBaselineLevel},"
            + $"\"difficulty_floor\":{difficulty.FloorLevel},\"difficulty_attempt\":{difficulty.AttemptIndex + 1},"
            + $"\"difficulty_variation\":{difficulty.Variation},\"difficulty_label\":\"{difficulty.Label}\","
            + $"\"difficulty_eased\":{(difficulty.IsEased ? "true" : "false")},"
            + $"\"difficulty_spike\":{(difficulty.IsSpike ? "true" : "false")},\"clean_traps\":{Session.RecoveryProgress.CleanTrapCount},"
            + $"\"deck_pitch_deg\":{c.DeckPitchRad * 57.2958:F3},\"deck_heave_m\":{c.DeckHeaveM:F3},"
            + $"\"wod_kts\":{Carrier.WindOverDeckKts:F1},"
            + $"\"approach_airspeed_kts\":{airspeed * 1.94384:F2},\"deck_closure_kts\":{closure * 1.94384:F2},"
            + $"\"sink_rate_mps\":{sink:F3},\"sink_rate_fpm\":{sink * 196.8504:F1},"
            + $"\"in_close_burble\":{inClose:F3},\"in_close\":{(inClose > 0.20 ? "true" : "false")},"
            + $"\"recovery\":\"{recovery}\",\"bolter\":{(recovery == Carrier.Recovery.Bolter ? "true" : "false")},"
            + $"\"wire\":{wire},\"touchdown_quality\":\"{quality}\",\"hook_outcome\":\"{hook}\","
            + $"\"touchdown_grade\":\"{grade}\",\"touchdown_deviations\":{JsonString(deviations)},"
            + $"\"touchdown_primary_correction\":{JsonString(correction)},"
            + $"\"carrier_pass_grade\":\"{passGrade}\",\"carrier_pass_deviations\":{JsonString(passDeviations)},"
            + $"\"carrier_pass_primary_correction\":{JsonString(passCorrection)},"
            + $"\"carrier_pass_phase_summary\":{JsonString(pass.PhaseSummary)},"
            + $"\"carrier_pass_waveoff_required\":{(pass.WaveOffRequired ? "true" : "false")},"
            + $"\"carrier_pass_waveoff_complied\":{(pass.WaveOffComplied ? "true" : "false")},"
            + $"\"soft_trap\":{(touchdown.Quality == Carrier.TouchdownQuality.Soft && recovery == Carrier.Recovery.Trap ? "true" : "false")},"
            + $"\"hard_trap\":{(touchdown.Quality == Carrier.TouchdownQuality.Hard && recovery == Carrier.Recovery.Trap ? "true" : "false")},"
            + $"\"arrest_phase\":\"{arrestPhase}\",\"arrest_speed_kts\":{arrestment.RelativeSpeedMps * 1.94384:F2},"
            + $"\"arrest_time_s\":{arrestment.ElapsedSeconds:F3},\"arrest_distance_m\":{arrestment.DistanceM:F2},"
            + $"\"arrest_runout_target_m\":{arrestment.RunoutTargetM:F1},\"wire_stretch_m\":{arrestment.WireStretchM:F3},"
            + $"\"wire_tension_kn\":{arrestment.TensionN / 1000.0:F2},\"arrest_decel_g\":{arrestment.DecelerationMps2 / FlightModel.G0:F3},"
            + $"\"arrest_peak_decel_g\":{arrestment.PeakDecelerationMps2 / FlightModel.G0:F3},"
            + $"\"arrest_profile\":\"{arrestment.Capability.Id}\","
            + $"\"arrest_failure_reason\":\"{ArrestmentFailureToken(arrestment.FailureReason)}\","
            + $"\"arrest_initial_energy_mj\":{arrestment.InitialEnergyJ / 1_000_000.0:F4},"
            + $"\"arrest_absorbed_energy_mj\":{arrestment.AbsorbedEnergyJ / 1_000_000.0:F4},"
            + $"\"arrest_remaining_energy_mj\":{arrestment.RemainingEnergyJ / 1_000_000.0:F4},"
            + $"\"arrest_rated_energy_mj\":{arrestment.Capability.RatedEnergyJ / 1_000_000.0:F4},"
            + $"\"arrest_force_curve_work_mj\":{arrestment.Capability.ForceCurveWorkJ / 1_000_000.0:F4},"
            + $"\"arrest_effective_energy_mj\":{arrestment.Capability.EffectiveEnergyCapacityJ / 1_000_000.0:F4},"
            + $"\"arrest_max_line_load_kn\":{arrestment.Capability.MaximumLineLoadN / 1000.0:F2},"
            + $"\"arrest_peak_load_kn\":{arrestment.PeakLoadN / 1000.0:F2},"
            + $"\"arrest_residual_speed_kts\":{arrestment.ResidualSpeedMps * AirData.MpsToKnots:F2},"
            + $"\"arrest_initial_closure_kts\":{arrestment.InitialRelativeSpeedMps * AirData.MpsToKnots:F2},";
    }
}
