import * as THREE from "./vendor/three.module.js";
import { createHud } from "./hud.js";
import {
  boundingSphereDiameterFromSize,
  disposeSceneResources,
  estimateProjectedPixelHeight,
  maximumAxisScale,
} from "./render/assets/index.js?runtime=2";
import { createThreeR160AssetRegistry } from "./render/assets/three_r160_loader.js?runtime=2";
import { applyCarrierRootPose } from "./render/carrier/carrier_motion.js";
import {
  advanceForwardGimbal,
  advancePadlockGimbal,
  PADLOCK_LIMITS,
} from "./render/camera/padlock_controller.js";
import { sortieResultCopy } from "./render/debrief/sortie_result.js";
import { pointsLedgerPresentation } from "./render/debrief/points_ledger.js";
import { createDamageSmokeTrail } from "./render/effects/damage_smoke_trail.js";
import { createTacticalCloudField } from "./render/environment/tactical_clouds.js";
import { loadKoreaTerrain } from "./render/environment/korea_terrain.js";
import {
  PresentationEventStreams,
  presentationVector,
  terminalVisualEvents,
} from "./render/events/presentation_event_stream.js";
import {
  applyEscortFormationPose,
  createCockpitHeadPresentation,
  createDistantAircraftImpostor,
  createPeriodGunsight,
} from "./render/presentation/index.js";
import {
  advanceIncidentReplay,
  IncidentReplayController,
  incidentReplayLabels,
} from "./render/replay/incident_replay.js";
import {
  buildInfoUrl,
  CANONICAL_PRODUCTION_ORIGIN,
  createReleaseIdentity,
  normalizeBuildInfo,
  runningBuildInfoUrl,
} from "./render/release/release_identity.js";
import {
  createPilotActionController,
  projectTestFlightState,
  testFlightConsoleRelevant,
  TEST_FLIGHT_ACTIONS,
} from "./render/systems/test_flight_console.js";
import {
  carrierPadlockSupersededByCombat,
  contextualPadlockTarget,
  circuitsPadlockTargets,
  padlockTargetValid,
} from "./render/hud/carrier_sa.js";
import {
  applyLookDelta,
  trackpadLookDelta,
} from "./render/input/look_gesture.js";
import { mobileControlProfile } from "./render/input/mobile_control_profile.js";
import { mobileThrottleRockerState } from "./render/input/mobile_throttle_rocker.js";
import {
  mobileRollCommand,
  shouldTransmitAnalogRoll,
  smoothTilt,
  StableTiltCalibration,
  TiltSensorWatchdog,
} from "./render/input/mobile_tilt_input.js";
import { mobileVirtualStickState } from "./render/input/mobile_virtual_stick.js";
import {
  GlobalRoomClient,
  resolveGlobalRoomUrl,
} from "./render/presence/global_room_client.js";
import {
  presenceStatusPresentation,
  presenceTelemetryContext,
  projectRemoteContact,
  remoteContactVisible,
  snapshotForTerrainFrame,
  shouldResetRemoteInterpolation,
} from "./render/presence/presence_presentation.js";
import { RemoteAssetResolutionPolicy } from "./render/presence/remote_asset_policy.js";
import { gTolerancePresentation } from "./render/physiology/g_tolerance_presentation.js";
import { createHotSnapshotSource } from "./render/state/hot_snapshot.js";
import {
  CAMPAIGN_NODES,
  campaignNode,
  campaignNodeQualified,
  campaignNodeUnlocked,
  loadCampaignProfile,
  nextCampaignNode,
  qualifyCampaignNode,
  recommendedCampaignNode,
  saveCampaignProfile,
} from "./render/progression/campaign_progression.js";
import { createFramePerfAggregator } from "./render/telemetry/frame_perf.js";
import { MeasuredTimeCompressionBudget } from "./render/telemetry/time_compression.js";
import {
  buildTelemetryBatch,
  retainNewestTelemetryRows,
} from "./render/telemetry/telemetry_batch.js";
import {
  CONTROL_BINDINGS,
  controlCodeLabel,
  keyboardMapForSettings,
  loadPlayerSettings,
  rebindControl,
  resetControlBindings,
  savePlayerSettings,
} from "./render/settings/player_settings.js";
import {
  AUTHORITY_TICK_HZ,
  DEFAULT_TELEMETRY_TICK_STRIDE,
  TELEMETRY_SAMPLE_SCHEDULE,
  TELEMETRY_SAMPLE_TARGET_HZ,
  TelemetrySampleScheduler,
} from "./render/telemetry/sample_scheduler.js";
import {
  DEFAULT_KEYFRAME_INTERVAL_SAMPLES,
  ensureTelemetryChunkHeader,
  ensureTelemetryChunkKeyframe,
  releaseTelemetryMaterializedStates,
  TelemetryStateEncoder,
  TELEMETRY_STATE_ENCODING,
} from "./render/telemetry/state_delta.js";
import { createVisualRuntime } from "./render/visual/index.js";
import {
  createKoreaEffectsFactory,
  createKoreaEnvironmentFactory,
} from "./render/visual/korea_pack_adapters.js";
import { AsyncTransitionQueue } from "./render/visual/async_transition_queue.js";
import {
  configureSceneBuilders,
  createAwacs,
  createBanditDestruction,
  createCarrier,
  createCarrierRuntimePresentation,
  createDecisionSupportSea,
  createDecisionSupportSky,
  createDrone,
  createGlider,
  createGunEffects,
  createHiddenPresentation,
  createLitEnvironment,
  createOneWayAttackDrone,
  createRapier,
  createRapierDispersedStrip,
  createRapierGunDrone,
} from "./render/scene/scene_builders.js";
import {
  setFlightAudioEnabled,
  updateFlightAudio,
} from "./render/audio/flight_audio.js";

const DEG = Math.PI / 180;
const MAX_GIMBAL_YAW = PADLOCK_LIMITS.yawRad;
const MAX_GIMBAL_PITCH = PADLOCK_LIMITS.pitchRad;
const TRACKPAD_LOOK_RELEASE_MS = 110;
const MAX_TRACERS = 48;
const SUN_DIRECTION = new THREE.Vector3(0.32, 0.78, -0.53).normalize();
const CLEAR_AIR_VISIBILITY_M = 100_000;

// Production visuals must carry decision-relevant truth. The generated Korea environment and
// cockpit remain useful authoring fixtures in their labs, but neither is allowed into the flying
// view until it represents authoritative state and passes an in-mission visual review. Pack weapon
// and damage effects remain enabled because each one is evidence of a real simulation event.
const PRODUCTION_PACK_ENVIRONMENT_ENABLED = false;
// Tactical clouds are authoritative weather. Production uses the bounded impostor path; the richer
// ray-marched path stays available for an explicit, frame-governed high-end mode.
const PRODUCTION_SIMULATED_CLOUDS_ENABLED = true;
const PRODUCTION_ESCORT_PRESENTATION_ENABLED = false;
const PRODUCTION_NONCOMBAT_WORLD_BOGEYS_VISIBLE = false;
const PRODUCTION_KOREA_TERRAIN_ENABLED = true;
// Keep production on the pack-owned, validated terrain product. A peninsula atlas must not become
// browser-reachable until its source lock, pack manifest, licence closure, and custom-host delivery
// have passed the same release gate as the rest of the pack.
const DEVELOPMENT_KOREA_ATLAS_MANIFEST_URL = null;
const UKRAINE_2030S_TERRAIN_ID = "terrain.ukraine.rapier-range.atlas.v1";
const UKRAINE_TRAINING_TERRAIN_MANIFEST_URL = new URL(
  "./content/packs/ukraine-modern/environment/terrain-atlas/rapier-range.atlas.manifest.json",
  import.meta.url,
).href;

const sceneCanvas = document.querySelector("#scene");
const hudCanvas = document.querySelector("#hud");
const bootScreen = document.querySelector("#boot");
const bootStatus = document.querySelector("#boot-status");
const fatalScreen = document.querySelector("#fatal");
const fatalMessage = document.querySelector("#fatal-message");
const multiplayerStatus = document.querySelector("#multiplayer-status");
const pauseButton = document.querySelector("#pause-button");
const flightAnnouncer = document.querySelector("#flight-announcer");
const pilotPhysiology = document.querySelector("#pilot-physiology");
const pilotPhysiologyCue = document.querySelector("#pilot-physiology-cue");
const viewStatus = document.querySelector("#view-status");
const touchGcasPaddle = document.querySelector("#touch-gcas-paddle");
const touchControls = document.querySelector("#touch-controls");
const touchPadlockButton = touchControls?.querySelector('[data-pulse-key="KeyV"]') ?? null;
const touchThrottleControls = document.querySelector("#touch-throttle-controls");
const touchThrottleRocker = touchControls?.querySelector('[data-mobile-action="throttle-rocker"]') ?? null;
const touchThrottleRockerKnob = document.querySelector("#touch-throttle-rocker-knob");
const touchWaveOffButton = document.querySelector("#touch-wave-off");
const touchContextControls = document.querySelector("#touch-context-controls");
const touchGearButton = document.querySelector("#touch-gear");
const touchFlapUpButton = document.querySelector("#touch-flap-up");
const touchFlapDownButton = document.querySelector("#touch-flap-down");
const touchLimitOverride = document.querySelector("#touch-limit-override");
const touchFireButton = document.querySelector("#touch-fire");
const fallbackStick = touchControls?.querySelector('[data-mobile-action="virtual-stick"]') ?? null;
const fallbackStickKnob = document.querySelector("#fallback-stick-knob");
const tiltPrompt = document.querySelector("#tilt-prompt");
const tiltStatus = document.querySelector("#tilt-status");
const readyScreen = document.querySelector("#ready-screen");
const readyKicker = document.querySelector("#ready-kicker");
const readyTitle = document.querySelector("#ready-title");
const readyBrief = document.querySelector("#ready-brief");
const readySortie = document.querySelector("#ready-sortie");
const readyConfig = document.querySelector("#ready-config");
const readySortieLabel = document.querySelector("#ready-sortie-label");
const readyConfigLabel = document.querySelector("#ready-config-label");
const readyControls = document.querySelector("#ready-controls");
const readyDeckConfig = document.querySelector("#ready-deck-config");
const readyDeckButtons = [...document.querySelectorAll("[data-deck-configuration]")];
const readyCircuitsPreflight = document.querySelector("#ready-circuits-preflight");
const readyCircuitsLegs = document.querySelector("#ready-circuits-legs");
const readyCircuitsCue = document.querySelector("#ready-circuits-cue");
const readyCircuitsModes = document.querySelector("#ready-circuits-modes");
const readyCircuitsConfigBody = document.querySelector("#ready-circuits-config-body");
const readyMenuTitle = document.querySelector("#ready-menu-title");
const readyMenuHelp = document.querySelector("#ready-menu-help");
const readySelector = document.querySelector("#ready-selector");
const readyProgramButtons = [...document.querySelectorAll("[data-program-node]")];
const readyProgramStatuses = [...document.querySelectorAll("[data-program-status]")];
const readyProgramProgress = document.querySelector("#ready-program-progress");
const readyStart = document.querySelector("#ready-start");
const readyReplay = document.querySelector("#ready-replay");
const readySettings = document.querySelector("#ready-settings");
const readyRestart = document.querySelector("#ready-restart");
const readyReturn = document.querySelector("#ready-return");
const readyHint = document.querySelector("#ready-hint");
const readyBuild = document.querySelector("#ready-build");
const readyBuildReload = document.querySelector("#ready-build-reload");
const incidentReplayOverlay = document.querySelector("#incident-replay-overlay");
const incidentReplayTitle = incidentReplayOverlay?.querySelector(".replay-title") ?? null;
const incidentReplayTime = document.querySelector("#incident-replay-time");
const incidentReplayMetrics = document.querySelector("#incident-replay-metrics");
const incidentReplayEvent = document.querySelector("#incident-replay-event");
const incidentReplayOutcome = document.querySelector("#incident-replay-outcome");
const incidentReplayGrade = document.querySelector("#incident-replay-grade");
const incidentReplayCause = document.querySelector("#incident-replay-cause");
const incidentReplayCorrection = document.querySelector("#incident-replay-correction");
const incidentReplayProgress = document.querySelector("#incident-replay-progress");
const incidentReplayDecision = document.querySelector("#incident-replay-decision");
const incidentReplaySkip = document.querySelector("#incident-replay-skip");
const incidentReplayScrubber = document.querySelector("#incident-replay-scrubber");
const incidentReplayPlay = document.querySelector("#incident-replay-play");
const incidentReplayEventJump = document.querySelector("#incident-replay-event-jump");
const incidentReplayRate = document.querySelector("#incident-replay-rate");
const incidentReplayCamera = document.querySelector("#incident-replay-camera");
const settingsScreen = document.querySelector("#settings-screen");
const settingsClose = document.querySelector("#settings-close");
const settingsCloseBottom = document.querySelector("#settings-close-bottom");
const settingsAudio = document.querySelector("#setting-audio");
const settingsAutoGcas = document.querySelector("#setting-autogcas");
const settingsHighContrast = document.querySelector("#setting-high-contrast");
const settingsReducedMotion = document.querySelector("#setting-reduced-motion");
const settingsLargeText = document.querySelector("#setting-large-text");
const settingsTiltSensitivity = document.querySelector("#setting-tilt-sensitivity");
const settingsTiltSensitivityValue = document.querySelector("#setting-tilt-sensitivity-value");
const settingsKeyboardBindings = document.querySelector("#settings-keyboard-bindings");
const settingsBindings = document.querySelector("#settings-bindings");
const settingsResetBindings = document.querySelector("#settings-reset-bindings");
const navConsole = document.querySelector("#nav-console");
const navUi = navConsole ? Object.freeze({
  destination: document.querySelector("#nav-destination"),
  bearing: document.querySelector("#nav-bearing"),
  range: document.querySelector("#nav-range"),
  eta: document.querySelector("#nav-eta"),
  turn: document.querySelector("#nav-turn"),
  fuelNeed: document.querySelector("#nav-fuel-need"),
  fuelHave: document.querySelector("#nav-fuel-have"),
  fuelMargin: document.querySelector("#nav-fuel-margin"),
  nmPerMin: document.querySelector("#nav-nm-per-min"),
  lbPerMin: document.querySelector("#nav-lb-per-min"),
  lbPerNm: document.querySelector("#nav-lb-per-nm"),
  groundspeed: document.querySelector("#nav-groundspeed"),
  gross: document.querySelector("#nav-gross"),
  thrust: document.querySelector("#nav-thrust"),
  skin: document.querySelector("#nav-skin"),
  contactRange: document.querySelector("#nav-contact-range"),
  contactEti: document.querySelector("#nav-contact-eti"),
}) : null;

/// Populate the navigation console. Every figure here already existed somewhere in the snapshot;
/// what was missing was one place to read them together, and the fuel comparison that turns them
/// into a decision rather than trivia.
function updateNavConsole(state) {
  if (!navConsole || !navUi) return;
  const relevant = state?.rapier_mission_available === true;
  navConsole.hidden = !relevant;
  if (!relevant) return;
  const set = (node, text, condition) => {
    if (!node) return;
    node.textContent = text;
    node.dataset.state = condition;
  };
  const num = (key) => Number(state?.[key]);
  const finite = (value) => Number.isFinite(value);

  const rangeNm = num("rtb_range_nm");
  const bearing = num("rtb_bearing_deg");
  const turnDeg = num("rtb_turn_deg");
  const ktas = Math.max(1, num("true_airspeed_kts") || 0);
  const homeKnown = finite(rangeNm) && finite(bearing);
  const patternOnly = state?.rapier_pattern_only === true;
  const legRaw = typeof state?.rapier_circuit_leg === "string" ? state.rapier_circuit_leg : "";
  const legLabel = legRaw ? legRaw.replaceAll("_", " ") : "";
  const patternAltFt = finite(num("rapier_target_altitude_ft"))
    ? Math.round(num("rapier_target_altitude_ft")) : null;
  const patternSpeedKt = finite(num("rapier_fd_target_ktas"))
    ? Math.round(num("rapier_fd_target_ktas")) : null;

  // Destination follows the PHASE. Circuits never shows CONTACT · INTERCEPT.
  const phase = Math.floor(Number(state?.rapier_mission_phase) || 0);
  const outbound = !patternOnly && phase >= 1 && phase <= 10;
  const gate = Math.max(0, Math.floor(Number(state?.rapier_recovery_gate) || 0));
  const guidanceRangeM = Math.hypot(
    (num("rapier_guidance_x") || 0) - (num("px") || 0),
    (num("rapier_guidance_y") || 0) - (num("py") || 0),
    (num("rapier_guidance_z") || 0) - (num("pz") || 0),
  );
  const boxNm = Number.isFinite(guidanceRangeM) ? guidanceRangeM / 1852 : Number.NaN;
  set(navUi.destination,
    patternOnly
      ? (legLabel
        ? (gate > 0 ? `CIRCUITS · ${legLabel} · BOX ${gate}/4` : `CIRCUITS · ${legLabel}`)
        : "CIRCUITS · PATTERN")
      : !homeKnown && !outbound ? "--"
        : outbound
          ? (gate > 0 ? `GATE ${gate}/4` : "CONTACT · INTERCEPT")
          : "DISPERSED STRIP · HOME",
    "normal");
  set(navUi.bearing, homeKnown
    ? `${String(Math.round((bearing % 360 + 360) % 360)).padStart(3, "0")}°` : "--",
    homeKnown ? "normal" : "unknown");
  const contactNm = num("range_m") / 1852;
  const shownRangeNm = patternOnly && Number.isFinite(boxNm) ? boxNm
    : outbound && Number.isFinite(contactNm) ? contactNm
      : rangeNm;
  set(navUi.range, Number.isFinite(shownRangeNm)
    ? (patternOnly && shownRangeNm < 10
      ? `${shownRangeNm.toFixed(1)} NM`
      : `${Math.round(shownRangeNm)} NM`)
    : "--",
    Number.isFinite(shownRangeNm) ? "normal" : "unknown");

  // Time to run uses CLOSURE toward home, not true airspeed. On a ballistic lob much of TAS is
  // vertical, so range/TAS reads optimistic climbing and pessimistic descending — and fuel required
  // is time-to-run times flow, so the error propagates straight into the decision number.
  const bearingRad = (finite(bearing) ? bearing : 0) * Math.PI / 180;
  const closureKts = ((num("vx") || 0) * Math.sin(bearingRad)
    + (num("vz") || 0) * Math.cos(bearingRad)) * 1.94384;
  const closingKts = closureKts > 1 ? closureKts : ktas;
  const minutesToRun = patternOnly && Number.isFinite(boxNm)
    ? boxNm / Math.max(1, ktas) * 60
    : homeKnown ? rangeNm / closingKts * 60 : Number.NaN;
  set(navUi.eta, finite(minutesToRun) ? `${Math.max(0, Math.round(minutesToRun))} MIN` : "--",
    finite(minutesToRun) ? "normal" : "unknown");
  set(navUi.turn, finite(turnDeg)
    ? (Math.abs(turnDeg) < 3 ? "STEADY"
      : `${turnDeg < 0 ? "LEFT" : "RIGHT"} ${Math.round(Math.abs(turnDeg))}°`) : "--",
    finite(turnDeg) ? "normal" : "unknown");

  // The decision number. Required fuel is priced at the CURRENT flow, so a pilot who pulls the
  // lever back watches it improve — which is exactly the trade the egress is about.
  const fuelLb = num("fuel_lb");
  const flowPph = num("fuel_flow_pph");
  const needLb = finite(minutesToRun) && finite(flowPph) ? flowPph * minutesToRun / 60 : Number.NaN;
  const marginLb = fuelLb - needLb;
  set(navUi.fuelNeed, finite(needLb) ? `${Math.round(needLb)} LB` : "--",
    finite(needLb) ? "normal" : "unknown");
  set(navUi.fuelHave, finite(fuelLb) ? `${Math.round(fuelLb)} LB` : "--",
    finite(fuelLb) ? "normal" : "unknown");
  set(navUi.fuelMargin,
    finite(marginLb)
      ? (marginLb < 0 ? `SHORT ${Math.round(-marginLb)} LB`
        : `+${Math.round(marginLb)} LB`)
      : "--",
    !finite(marginLb) ? "unknown"
      : marginLb < 0 ? "fault"
        : marginLb < needLb * 0.10 ? "caution" : "normal");

  // THE NAV TRIAD, and it leads the console because it is how the pilot actually thinks:
  // miles per minute, pounds per minute, pounds per mile. Everything else on this panel is
  // derived from these three, and lb/nm is the one that decides whether a speed is affordable —
  // it is the only figure that improves when you slow down.
  const groundKts = num("ground_speed_kts");
  const nmPerMin = Number.isFinite(groundKts) ? groundKts / 60 : Number.NaN;
  const lbPerMin = Number.isFinite(flowPph) ? flowPph / 60 : Number.NaN;
  const lbPerNm = Number.isFinite(lbPerMin) && nmPerMin > 0.01
    ? lbPerMin / nmPerMin : Number.NaN;
  set(navUi.nmPerMin, Number.isFinite(nmPerMin) ? `${nmPerMin.toFixed(1)} NM/MIN` : "--",
    Number.isFinite(nmPerMin) ? "normal" : "unknown");
  set(navUi.lbPerMin, Number.isFinite(lbPerMin) ? `${Math.round(lbPerMin)} LB/MIN` : "--",
    Number.isFinite(lbPerMin) ? "normal" : "unknown");
  set(navUi.lbPerNm, Number.isFinite(lbPerNm) ? `${lbPerNm.toFixed(2)} LB/NM` : "--",
    Number.isFinite(lbPerNm) ? "normal" : "unknown");
  set(navUi.groundspeed, finite(groundKts)
    ? `${Math.round(groundKts).toLocaleString("en-US")} KT`
    : "--", finite(groundKts) ? "normal" : "unknown");

  const grossLb = num("player_gross_lb");
  set(navUi.gross, finite(grossLb) ? `${Math.round(grossLb).toLocaleString("en-US")} LB` : "--",
    finite(grossLb) ? "normal" : "unknown");
  const thrustLbf = num("engine_net_thrust_lbf");
  set(navUi.thrust, finite(thrustLbf)
    ? `${Math.round(thrustLbf).toLocaleString("en-US")} LBF` : "--",
    finite(thrustLbf) ? "normal" : "unknown");

  const skinC = num("rapier_stagnation_temp_c");
  const marginC = num("rapier_thermal_margin_c");
  set(navUi.skin, finite(skinC)
    ? `${Math.round(skinC)}°C · ${finite(marginC) ? (marginC >= 0 ? `${Math.round(marginC)}°C MARGIN` : `${Math.round(-marginC)}°C OVER`) : "--"}`
    : "--",
    !finite(marginC) ? "unknown" : marginC < 0 ? "fault" : marginC < 40 ? "caution" : "normal");

  const contactRangeM = num("range_m");
  const rangeLabel = document.querySelector("#nav-contact-range")
    ?.closest(".tf-indication")?.querySelector(".tf-label");
  const etiLabel = document.querySelector("#nav-contact-eti")
    ?.closest(".tf-indication")?.querySelector(".tf-label");
  if (patternOnly) {
    if (rangeLabel) rangeLabel.textContent = "Pattern alt";
    if (etiLabel) etiLabel.textContent = "Pattern speed";
    const call = typeof state?.rapier_circuit_comms === "string" ? state.rapier_circuit_comms : "";
    set(navUi.contactRange, patternAltFt !== null ? `${patternAltFt} FT` : "--",
      patternAltFt !== null ? "normal" : "unknown");
    set(navUi.contactEti, patternSpeedKt !== null
      ? `${patternSpeedKt} KT${call ? ` · ${call}` : ""}`
      : (call || "PATTERN"),
      "normal");
  } else {
    if (rangeLabel) rangeLabel.textContent = "Contact range";
    if (etiLabel) etiLabel.textContent = "Time to intercept";
    set(navUi.contactRange, finite(contactRangeM)
      ? `${(contactRangeM / 1852).toFixed(0)} NM` : "--",
      finite(contactRangeM) ? "normal" : "unknown");
    // Negative means the kernel judged it meaningless — inside 20 km, or no closure.
    const etiMin = num("rapier_intercept_eti_min");
    set(navUi.contactEti, finite(etiMin) && etiMin >= 0
      ? `${etiMin.toFixed(1)} MIN` : "MERGE",
      finite(etiMin) && etiMin >= 0 ? "normal" : "unknown");
  }
}



function bindCircuitsSystemsActions() {
  for (const button of document.querySelectorAll("[data-circuits-action]")) {
    button.addEventListener("click", () => {
      const action = button.getAttribute("data-circuits-action");
      if (action === "toggleClean" && typeof bridge?.SetCircuitsCleanMode === "function") {
        const next = latestState?.rapier_circuits_clean !== true;
        bridge.SetCircuitsCleanMode(next);
        if (viewStatus) viewStatus.textContent = next
          ? "Circuits clean mode on · no random faults"
          : "Circuits attrition armed";
      } else if (action === "induceFault" && typeof bridge?.InduceCircuitsUtilityFault === "function") {
        bridge.InduceCircuitsUtilityFault();
      }
    });
  }
}

const CONSOLE_LAYOUT_STORAGE = "guns-only.console-layout.v1";
const CIRCUITS_PREFLIGHT_STORAGE = "guns-only.circuits-preflight-open.v1";

function circuitsPreflightOpenPreference() {
  try {
    const stored = globalThis.localStorage?.getItem(CIRCUITS_PREFLIGHT_STORAGE);
    if (stored === null || stored === undefined) return true; // first Circuits visit: open
    return stored === "1";
  } catch {
    return true;
  }
}

function saveCircuitsPreflightOpenPreference(open) {
  try {
    globalThis.localStorage?.setItem(CIRCUITS_PREFLIGHT_STORAGE, open ? "1" : "0");
  } catch {
    // Ignore quota / private-mode failures; disclosure still works for the session.
  }
}

let circuitsPreflightRenderedFor = "";

function renderCircuitsPreflight(brief) {
  if (!readyCircuitsPreflight) return;
  const legs = brief?.preflightLegs;
  const modes = brief?.preflightModes;
  const show = selectedProgramNodeId === "rapier-circuits"
    && Array.isArray(legs) && legs.length > 0
    && Array.isArray(modes) && modes.length > 0;
  readyCircuitsPreflight.hidden = !show;
  if (!show) {
    circuitsPreflightRenderedFor = "";
    return;
  }
  if (circuitsPreflightRenderedFor === selectedProgramNodeId) return;

  if (readyCircuitsLegs) {
    readyCircuitsLegs.replaceChildren(...legs.map((leg) => {
      const item = document.createElement("li");
      item.textContent = leg.label;
      item.title = `${leg.intent} · ${leg.cue}`;
      return item;
    }));
  }
  if (readyCircuitsCue) {
    readyCircuitsCue.textContent = brief.preflightCue
      || "INITIAL / DOWNWIND ~300 KT · FINAL ~180 KT · hook down always";
  }
  if (readyCircuitsModes) {
    readyCircuitsModes.replaceChildren(...modes.map((mode) => {
      const chip = document.createElement("div");
      chip.className = "ready-circuits-mode";
      chip.setAttribute("role", "listitem");
      const label = document.createElement("strong");
      label.textContent = mode.label;
      const detail = document.createElement("span");
      detail.textContent = mode.detail;
      chip.append(label, detail);
      return chip;
    }));
  }
  if (readyCircuitsConfigBody) {
    readyCircuitsConfigBody.replaceChildren(...legs.map((leg) => {
      const row = document.createElement("tr");
      const name = document.createElement("th");
      name.scope = "row";
      name.textContent = leg.label;
      const cue = document.createElement("td");
      cue.textContent = `${leg.intent} · ${leg.cue}`;
      row.append(name, cue);
      return row;
    }));
  }
  readyCircuitsPreflight.open = circuitsPreflightOpenPreference();
  circuitsPreflightRenderedFor = selectedProgramNodeId;
}
function loadConsoleLayout() {
  try {
    return JSON.parse(localStorage.getItem(CONSOLE_LAYOUT_STORAGE) || "{}") || {};
  } catch {
    return {};
  }
}
function saveConsoleLayout(layout) {
  try {
    localStorage.setItem(CONSOLE_LAYOUT_STORAGE, JSON.stringify(layout));
  } catch {
    /* ignore quota */
  }
}
function enableDraggableConsole(panel) {
  if (!panel) return;
  const summary = panel.querySelector(":scope > summary");
  if (!summary) return;
  const layout = loadConsoleLayout();
  const saved = layout[panel.id];
  if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
    panel.style.left = `${saved.left}px`;
    panel.style.top = `${saved.top}px`;
    panel.style.right = "auto";
  }
  let drag = null;
  summary.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    // Ignore clicks on the collapse affordance region near the right edge.
    const rect = summary.getBoundingClientRect();
    if (event.clientX > rect.right - 48) return;
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origLeft: panel.getBoundingClientRect().left,
      origTop: panel.getBoundingClientRect().top,
      moved: false,
    };
    summary.setPointerCapture(event.pointerId);
  });
  summary.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    event.preventDefault();
    const left = Math.min(window.innerWidth - 80, Math.max(8, drag.origLeft + dx));
    const top = Math.min(window.innerHeight - 48, Math.max(8, drag.origTop + dy));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = "auto";
  });
  const endDrag = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.moved) {
      event.preventDefault();
      const next = loadConsoleLayout();
      next[panel.id] = {
        left: panel.getBoundingClientRect().left,
        top: panel.getBoundingClientRect().top,
      };
      saveConsoleLayout(next);
    }
    drag = null;
  };
  summary.addEventListener("pointerup", endDrag);
  summary.addEventListener("pointercancel", endDrag);
  summary.addEventListener("click", (event) => {
    // After a drag, suppress the details toggle once.
    if (summary.dataset.dragSuppressClick === "1") {
      event.preventDefault();
      delete summary.dataset.dragSuppressClick;
    }
  });
  summary.addEventListener("pointerup", (event) => {
    if (event.pointerId === undefined) return;
  }, true);
}

const testFlightConsole = document.querySelector("#test-flight-console");
enableDraggableConsole(navConsole);
enableDraggableConsole(testFlightConsole);
bindCircuitsSystemsActions();
const testFlightUi = testFlightConsole ? Object.freeze({
  engineRpm: document.querySelector("#tf-engine-rpm"),
  engineRunning: document.querySelector("#tf-engine-running"),
  primaryBus: document.querySelector("#tf-primary-bus"),
  hydraulicPressure: document.querySelector("#tf-hydraulic-pressure"),
  gearHandle: document.querySelector("#tf-gear-handle"),
  gearNose: document.querySelector("#tf-gear-nose"),
  gearLeft: document.querySelector("#tf-gear-left"),
  gearRight: document.querySelector("#tf-gear-right"),
  flapLever: document.querySelector("#tf-flap-lever"),
  flapLeft: document.querySelector("#tf-flap-left"),
  flapRight: document.querySelector("#tf-flap-right"),
  warningLine: document.querySelector("#tf-warning-line"),
  procedureLine: document.querySelector("#tf-procedure-line"),
  procedureScore: document.querySelector("#tf-procedure-score"),
  buttons: [...testFlightConsole.querySelectorAll("[data-test-action]")],
}) : null;

const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches === true;
const touchCapable = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
const smallViewport = Math.min(
  window.screen?.width || window.innerWidth,
  window.screen?.height || window.innerHeight,
) <= 900 || Math.min(window.innerWidth, window.innerHeight) <= 600;
const mobileControls = coarsePointer || (touchCapable && smallViewport);
document.documentElement.classList.toggle("touch-mode", mobileControls);
// Portrait + touch = assisted flight: tilt flies, throttle holds corner velocity, guns fire
// while the solution is qualified. Landscape keeps the full manual control set.
const portraitMedia = window.matchMedia?.("(orientation: portrait)");
// Assisted flight requires a genuinely coarse touch pointer. mobileControls alone also admits
// small desktop windows (tall narrow window == "portrait"), which put the autopilot on a
// keyboard pilot — reported from the desktop within minutes.
const assistedEligible = coarsePointer && touchCapable;
function syncAssistedFlight() {
  const assisted = assistedEligible && portraitMedia?.matches === true;
  document.documentElement.classList.toggle("portrait-assist", assisted);
  bridge?.SetAssistedFlight?.(assisted);
}
portraitMedia?.addEventListener?.("change", () => syncAssistedFlight());
// iOS Safari/CriOS has no element-fullscreen API: standalone (Add to Home Screen) is the only
// way to shed the browser chrome. Say so once, on the ready screen, only where it applies.
const isIosBrowserTab = /iPhone|iPad/.test(navigator.userAgent)
  && window.matchMedia?.("(display-mode: standalone)").matches !== true
  && navigator.standalone !== true;
const iosFullscreenHint = isIosBrowserTab && mobileControls
  ? " Fullscreen on iPhone: Share \u2192 Add to Home Screen, then fly from the icon."
  : "";

// Keep the phone controls in two shallow, thumb-sized edge groups. The page owns the base visual
// treatment; this mobile-only override owns the live control geometry so the HUD can reserve a
// matching clear strip without changing the desktop layout.
if (mobileControls) {
  settingsKeyboardBindings?.removeAttribute("open");
  const mobileLayout = document.createElement("style");
  mobileLayout.id = "mobile-flight-layout";
  mobileLayout.textContent = `
    .touch-mode .touch-left,
    .touch-mode .touch-right {
      bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
      gap: 5px;
      transform: none;
    }

    .touch-mode .touch-left {
      left: calc(env(safe-area-inset-left, 0px) + 8px);
    }

    .touch-mode .touch-right {
      right: calc(env(safe-area-inset-right, 0px) + 8px);
    }

    .touch-mode .touch-control {
      min-width: 46px;
      min-height: 44px;
      padding: 5px 7px;
      font-size: 9px;
      letter-spacing: .045em;
    }

    .touch-mode .touch-wave {
      min-width: 58px;
      height: 48px;
    }

    .touch-mode .touch-context {
      display: grid;
      grid-template-columns: repeat(3, 50px);
      gap: 4px;
    }

    .touch-mode .touch-utility {
      min-width: 50px;
      min-height: 44px;
      padding: 4px 5px;
      font-size: 7.5px;
    }

    .touch-mode .touch-actions {
      gap: 6px;
    }

    .touch-mode .touch-fire {
      width: 60px;
      min-width: 60px;
      height: 60px;
      min-height: 60px;
      font-size: 11px;
    }

    .touch-mode #fallback-stick {
      bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
    }

    .touch-mode.run-frozen .touch-left,
    .touch-mode.run-frozen .touch-right,
    .touch-mode.run-frozen #fallback-stick,
    .touch-mode.run-paused .touch-left,
    .touch-mode.run-paused .touch-right,
    .touch-mode.run-paused #fallback-stick,
    .touch-mode.run-paused #tilt-status,
    .touch-mode.run-frozen #tilt-status,
    .touch-mode.run-frozen #tilt-prompt,
    .touch-mode.run-frozen #rotate-hint {
      display: none;
      pointer-events: none;
    }
  `;
  document.head.append(mobileLayout);
}

// Centralised, deliberately conservative quality knobs. The shader work stays identical across
// tiers; mobile saves fill-rate and vertex cost while desktop keeps the silhouette and deck edges
// crisp. These are evaluated once and never branch inside the render loop.
const VISUAL_QUALITY = Object.freeze({
  tier: mobileControls ? "mobile" : ((navigator.deviceMemory || 8) <= 4 ? "balanced" : "desktop"),
  pixelRatioCap: mobileControls ? 1.4 : ((navigator.deviceMemory || 8) <= 4 ? 1.6 : 2),
  oceanRadialSegments: mobileControls ? 112 : 145,
  oceanAngularSegments: mobileControls ? 144 : 192,
  oceanDetailOctaves: mobileControls ? 4 : ((navigator.deviceMemory || 8) <= 4 ? 5 : 7),
  shadowMapSize: mobileControls ? 512 : ((navigator.deviceMemory || 8) <= 4 ? 1024 : 2048),
  cloudOctaves: mobileControls ? 2 : 3,
  carrierSprayCount: mobileControls ? 28 : 44,
});

configureSceneBuilders({
  visualQuality: VISUAL_QUALITY,
  mobileControls,
  maxTracers: MAX_TRACERS,
  fogDensityForVisibility,
  clearAirVisibilityM: CLEAR_AIR_VISIBILITY_M,
});

let playerSettings = loadPlayerSettings();
const touchGkeyByDefaultCode = new Map(CONTROL_BINDINGS.map(
  ({ defaultCode, gkey }) => [defaultCode, gkey],
));
for (const action of Object.values(TEST_FLIGHT_ACTIONS))
  touchGkeyByDefaultCode.set(action.code, action.gkey);
const keyMap = new Map();
function rebuildKeyboardMap() {
  keyMap.clear();
  for (const [code, gkey] of keyboardMapForSettings(playerSettings)) keyMap.set(code, gkey);
  keyMap.set("KeyR", 11);
  const remappableGkeys = new Set(CONTROL_BINDINGS.map(({ gkey }) => gkey));
  for (const action of Object.values(TEST_FLIGHT_ACTIONS)) {
    if (!remappableGkeys.has(action.gkey)) keyMap.set(action.code, action.gkey);
  }
}
rebuildKeyboardMap();

const heldKeys = new Set();
const activeGkeys = new Map();

// --- Telemetry recorder ----------------------------------------------------------------------
// Tuning feel by guesswork is a waste of time; this captures every input event and a 20 Hz state
// trace from a real playthrough, then POSTs immutable batches to /telemetry (same origin, so the dev
// server writes them to disk for analysis). A failed POST must never disturb the simulation.
// The release module owns the human build. The entrypoint query remains an independent cache key,
// so a mixed shell/app can be detected instead of silently reporting whichever integer happened
// to be embedded in stale HTML. Production metadata adds commit/deployment discrimination when
// Vercel provides it, while local development remains fully offline.
const ENTRYPOINT_BUILD = new URL(import.meta.url).searchParams.get("v") || "dev";
let buildIdentity = createReleaseIdentity({ entrypointBuild: ENTRYPOINT_BUILD });
const BUILD = buildIdentity.telemetryBuild;
const BUILD_IDENTITY_REVALIDATE_MS = 60_000;
let runningBuildInfo = null;
let lastKnownBuildInfo = null;
let buildIdentityLookup = null;
let buildIdentityLastCheckedAt = Number.NEGATIVE_INFINITY;
let buildIdentityLookupAttempted = false;
let buildIdentityLookupSucceeded = false;
const TELEMETRY_TICK_STRIDE = DEFAULT_TELEMETRY_TICK_STRIDE;
// Preserve the 20 Hz reconstruction trace, but amortize Function and Blob-object overhead into
// 30-second immutable chunks. The bounded buffer still holds more than a full interval.
const TELEMETRY_FLUSH_INTERVAL_MS = 30_000;
const TELEMETRY_MAX_BACKOFF_MS = 5 * 60_000;
const TELEMETRY_BUFFER_LIMIT = 1_500;
const TELEMETRY_SCHEMA_VERSION = "2.0.0";
const TELEMETRY_SESSION_STARTED_AT = Date.now();

function newTelemetryBatchId() {
  const unique = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.floor(Math.random() * 1e12)}`;
  return `batch-${unique}`.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 128);
}

// Closed-loop frame governor. The pilot's requirement is "rock solid 60fps", and their explicit
// trade: "I'd rather fight up in the clouds with zero scenery if that's what it takes."
//
// Fixed quality tiers are chosen once at load from deviceMemory, which cannot know what a
// particular fight costs — and a 1v2 costs materially more than a duel, because each additional
// lookahead pilot adds a synchronous decision burst on the main thread. So this watches actual
// delivered frames and sheds work until the budget is met, worst-looking-thing-last:
//
//   1  view distance  bounds synchronous terrain streaming and closes the haze with it
//   2  shadows        removes the largest remaining fill-rate cost
//   3  scenery        ordinary high-altitude sorties may shed it as the final fallback
//
// The fictional Ukraine low-level programme is the deliberate exception to step 3: its fields,
// shelterbelts, wires, roads and settlement silhouettes are mission-essential orientation cues.
// That bounded instanced layer stays while shadows still go.
//
// It only ever steps DOWN within a sortie. Stepping back up on a quiet moment is how governors
// oscillate, and an oscillating frame rate reads worse than a consistently lower one.
const FRAME_GOVERNOR_WINDOW_MS = 1000;
// One missed display interval, not a 50 ms stall. The original threshold was 50 ms, which is why
// production tapes reported ~0 long frames while p95 sat at 33 ms: the pilot was feeling 30 fps
// and the counter was blind to it.
// How much simulated time one rendered frame may ever catch up. This is a SPIRAL BRAKE, not a
// performance tuning knob.
//
// The kernel runs 120 Hz fixed ticks, so a 60 fps frame owes it 2 ticks. The old cap was 0.25 s —
// THIRTY ticks in a single frame, each one stepping the player, every bandit's lookahead, and the
// terrain queries underneath them. That turns any one-off hitch into a self-sustaining stall: the
// long frame runs a huge catch-up, the catch-up makes the next frame long, and it feeds itself
// until the scene happens to get cheaper. A Build 114 tape shows exactly that signature — windows
// where the MEDIAN frame sat at 166 ms and 283 ms for five seconds straight (6 fps and 3.6 fps),
// with geometries, programs and scene objects all flat, so nothing was being built or compiled. It
// was the loop eating itself.
//
// Ten ticks recovers an ordinary five-frame hitch inside one frame and still leaves 5x headroom
// over the 2 ticks a healthy frame needs. Past that the simulation deliberately loses wall-clock
// time rather than chase it. Slight slow motion during a stall is the correct trade: the pilot
// keeps control authority and the frame rate recovers, instead of both being surrendered for
// several seconds. It also removes a quarter-second window in which the pilot's stick was frozen
// while the aircraft flew on — which is how a low-altitude fight ends in a smoking hole.
const SIM_CATCHUP_CAP_SECONDS = 10 / 120;
const timeCompressionBudget = new MeasuredTimeCompressionBudget();

const FRAME_GOVERNOR_LATE_FRAME_MS = 22;
const FRAME_GOVERNOR_TRIP_FRACTION = 0.08;   // 8% of a window's frames arriving late

// Streaming radii to fall back through, in metres. Terrain chunk builds are the dominant cost —
// one LOD0 chunk is ~9.5 ms of synchronous main-thread work, 57% of a 60 fps budget — so the only
// lever that reliably buys frames is having fewer chunks in flight.
const FRAME_GOVERNOR_RADII_M = [26_000, 18_000, 12_000];
// Terrain starts lazy at a local radius so Ready waits only for the aircraft's neighborhood.
// Once that cell is resident, the mission contract expands streaming to its normal flight radius
// in the background (32 km for the hero cell, 112 km for Rapier's regional corridor).
const TERRAIN_INITIAL_WARMUP_RADIUS_M = 12_000;
/// How far inside the streamed world edge the haze must close. Fog reaches 2% transmission at the
/// visibility figure, so matching visibility exactly to the radius still leaves the boundary
/// faintly drawn; 0.85 puts the last of the terrain behind effectively opaque air.
const WORLD_EDGE_VISIBILITY_FRACTION = 0.85;

const frameGovernor = {
  level: 0,
  windowStartedAt: 0,
  lateFrames: 0,
  windowFrames: 0,

  observe(deltaMs, nowMs, view) {
    if (!Number.isFinite(deltaMs) || !view) return;
    this.windowFrames += 1;
    if (deltaMs > FRAME_GOVERNOR_LATE_FRAME_MS) this.lateFrames += 1;
    if (nowMs - this.windowStartedAt < FRAME_GOVERNOR_WINDOW_MS) return;
    const late = this.windowFrames > 0 ? this.lateFrames / this.windowFrames : 0;
    this.windowStartedAt = nowMs;
    this.lateFrames = 0;
    this.windowFrames = 0;
    if (late >= FRAME_GOVERNOR_TRIP_FRACTION) this.shed(view);
  },

  idle(nowMs) {
    // Ready, pause and replay frames include loading/UI work that says nothing about sortie
    // performance. Keep the earned quality level, but begin a fresh observation window on resume.
    this.windowStartedAt = Number.isFinite(nowMs) ? nowMs : 0;
    this.lateFrames = 0;
    this.windowFrames = 0;
  },

  // Ordered by what actually costs frames, measured — NOT by what looks most expendable. Shadows
  // and resolution were the original first moves and they were the wrong ones: a production tape
  // showed an 11 fps window drawing 2.98M triangles in 78 calls and a 60 fps window drawing 2.91M
  // in 72. Shedding pixels against a CPU-bound chunk-build stall buys nothing.
  shed(view) {
    if (this.level >= 4) return;
    this.level += 1;
    try {
      if (this.level <= FRAME_GOVERNOR_RADII_M.length) {
        const radiusM = FRAME_GOVERNOR_RADII_M[this.level - 1];
        const changed = view.terrainPresentation?.setStreamingRadiusM?.(radiusM);
        announceGovernor(`View distance ${Math.round(radiusM / 1000)} km · holding 60`);
        if (changed === false && this.level < FRAME_GOVERNOR_RADII_M.length) return;
      } else {
        // Only once distance is exhausted does the picture itself start going.
        const shadowCasters = [];
        view.scene?.traverse?.((object) => {
          if (object.castShadow === true) {
            shadowCasters.push(object);
            object.castShadow = false;
          }
        });
        view.frameGovernorShadowState = {
          enabled: view.renderer.shadowMap.enabled,
          casters: shadowCasters,
        };
        view.renderer.shadowMap.enabled = false;
        const lowLevelSceneryRequired = view.terrainMicroRequired === true;
        if (!lowLevelSceneryRequired) {
          view.terrainGovernorSuppressesAmbientScenery = true;
          void view.terrainPresentation?.disableAmbientScenery?.();
        }
        announceGovernor(lowLevelSceneryRequired
          ? "Shadows off · low-level scenery retained · holding 60"
          : "Shadows and scenery off · holding 60");
      }
    } catch (error) {
      console.warn("Frame governor could not shed load.", error);
    }
    recorder.event("perf", "FrameGovernor", { level: this.level });
  },

  reset(view = null) {
    // A new sortie re-earns its quality: one bad moment should not permanently downgrade a session.
    this.level = 0;
    this.lateFrames = 0;
    this.windowFrames = 0;
    this.windowStartedAt = 0;
    if (!view) return;
    const shadowState = view.frameGovernorShadowState;
    if (shadowState) {
      view.renderer.shadowMap.enabled = shadowState.enabled;
      for (const object of shadowState.casters) {
        if (object) object.castShadow = true;
      }
      view.frameGovernorShadowState = null;
    }
    view.terrainGovernorSuppressesAmbientScenery = false;
    if (Number.isFinite(view.terrainNominalStreamingRadiusM)) {
      view.terrainPresentation?.setStreamingRadiusM?.(
        view.terrainNominalStreamingRadiusM);
    }
    if (view.terrainMicroRequired === true) {
      void view.terrainPresentation?.enableAmbientScenery?.();
    }
  },
};

function announceGovernor(message) {
  if (viewStatus) viewStatus.textContent = message;
}

// The fight director's pacing estimate, persisted across page loads.
//
// The gauntlet cold-started at the 2.4 G Novice warm-up every time the page was reloaded, so a
// pilot who had fought their way up to walking over Aces was handed an opponent physically capped
// at 2.4 G — against the 8-12 G they pull — on every fresh session. A short sortie meant the
// warm-up was the ONLY opponent they ever met, which is why successive difficulty builds kept
// feeling like nothing had changed: they were improving fights that were rarely reached.
//
// The payload is opaque to this layer and self-validating on the far side: anything malformed is
// rejected wholesale and the sortie opens cold, so a corrupt value can never half-apply.
const DIRECTOR_STATE_STORAGE = "guns-only.fight-director.v1";

function loadDirectorState() {
  try { return globalThis.localStorage?.getItem(DIRECTOR_STATE_STORAGE) || ""; }
  catch { return ""; }
}

function saveDirectorState() {
  try {
    const state = bridge?.ExportDirectorState?.();
    if (state) globalThis.localStorage?.setItem(DIRECTOR_STATE_STORAGE, state);
  } catch { /* persistence must never be able to disturb a sortie */ }
}

function restoreDirectorState() {
  try {
    const saved = loadDirectorState();
    if (saved) bridge?.ImportDirectorState?.(saved);
  } catch { /* a bad stored value opens a normal cold sortie */ }
}

// Renderer/scene counters for the 0.2 Hz perf row. Frame deltas say a stall HAPPENED; these say
// what was accumulating when it did. `geometries`/`textures` are the leak detector — they are
// live GPU resource counts, so a monotone rise across a sortie is a leak rather than load.
// Sampled once per closed 5 s window, never per frame; `activeView` is null before the first
// sortie stages, which is why every read is optional.
function sampleSceneCounters() {
  const info = activeView?.renderer?.info;
  if (!info) return null;
  let sceneObjects = 0;
  activeView.scene?.traverse?.(() => { sceneObjects += 1; });
  return {
    draw_calls: info.render?.calls ?? 0,
    triangles: info.render?.triangles ?? 0,
    geometries: info.memory?.geometries ?? 0,
    textures: info.memory?.textures ?? 0,
    programs: info.programs?.length ?? 0,
    scene_objects: sceneObjects,
  };
}

const recorder = {
  session: `web-${TELEMETRY_SESSION_STARTED_AT}-${Math.floor(Math.random() * 1e6)}`,
  build: BUILD,
  buildIdentity: buildIdentity.telemetry,
  buf: [],
  lastSampleKey: null,
  lastPost: performance.now(),
  samples: 0,
  flushes: 0,
  errors: 0,
  droppedRows: 0,
  lastError: null,
  lastPayloadBytes: 0,
  _headerSent: false,
  _sending: null,
  _pendingBatch: null,
  _retryDelay: TELEMETRY_FLUSH_INTERVAL_MS,
  _nextPost: performance.now() + TELEMETRY_FLUSH_INTERVAL_MS,
  _lastContext: new Map(),
  _stateEncoder: new TelemetryStateEncoder(),
  _sampleScheduler: new TelemetrySampleScheduler({ strideTicks: TELEMETRY_TICK_STRIDE }),
  _framePerf: createFramePerfAggregator({ sampleScene: () => sampleSceneCounters() }),
  _sortieSequence: 0,
  _sortie: null,
  _lastSessionPhase: null,
  chunkHeader(batchId = null) {
    const header = {
      k: "hdr",
      schema_version: TELEMETRY_SCHEMA_VERSION,
      build: this.build,
      session: this.session,
      ua: navigator.userAgent,
      t0: TELEMETRY_SESSION_STARTED_AT,
      state_encoding: TELEMETRY_STATE_ENCODING,
      keyframe_interval_samples: DEFAULT_KEYFRAME_INTERVAL_SAMPLES,
      authority_tick_hz: AUTHORITY_TICK_HZ,
      state_sample_target_hz: TELEMETRY_SAMPLE_TARGET_HZ,
      state_sample_stride_ticks: TELEMETRY_TICK_STRIDE,
      state_sample_schedule: TELEMETRY_SAMPLE_SCHEDULE,
      build_identity: this.buildIdentity,
    };
    if (batchId) header.batch_id = batchId;
    return header;
  },
  enqueue(row) {
    this.buf.push(row);
    if (this.buf.length > TELEMETRY_BUFFER_LIMIT) {
      const overflow = this.buf.length - TELEMETRY_BUFFER_LIMIT;
      this.buf = ensureTelemetryChunkKeyframe(
        retainNewestTelemetryRows(this.buf, TELEMETRY_BUFFER_LIMIT),
      );
      this.droppedRows += overflow;
    }
  },
  ensureHeader() {
    if (this._headerSent) return;
    this.enqueue(this.chunkHeader());
    this._headerSent = true;
  },
  startSortie({ mission, deckConfiguration } = {}) {
    try {
      if (this._sortie) this.endSortie("superseded");
      this._sortieSequence += 1;
      const id = `sortie-${TELEMETRY_SESSION_STARTED_AT}-${this._sortieSequence}`;
      this._sortie = Object.freeze({
        id,
        sequence: this._sortieSequence,
        mission: Math.round(Number(mission) || 0),
        deck_configuration: String(deckConfiguration || "NONE"),
        started_at: Date.now(),
      });
      this._lastSessionPhase = null;
      this._sampleScheduler.reset();
      this._stateEncoder.forceKeyframe();
      this.context("sortie", { ...this._sortie, phase: "ACTIVE" });
      this.event("lifecycle", "sortie_started", {
        mission: this._sortie.mission,
        deck_configuration: this._sortie.deck_configuration,
      });
      return id;
    } catch (e) {
      this.errors++;
      this.lastError = String(e);
      return null;
    }
  },
  endSortie(reason = "ended", state = null) {
    try {
      if (!this._sortie) return;
      const sortie = this._sortie;
      this.event("lifecycle", "sortie_ended", {
        reason,
        mission: sortie.mission,
        session_phase: state?.session_phase ?? null,
        sortie_outcome: state?.sortie_outcome ?? null,
        recovery: state?.recovery ?? null,
      });
      this.context("sortie", { ...sortie, phase: "ENDED", reason });
      this._sortie = null;
    } catch (e) { this.errors++; this.lastError = String(e); }
  },
  // One "perf" row per 5 s window of requestAnimationFrame deltas: the 20 Hz state stream is
  // sim-tick-scheduled and cannot see render stalls. Perf rows are diagnostic garnish — when the
  // bounded queue is already full it is the perf row that is skipped, never a state row that the
  // enqueue overflow trim would displace from the head of the queue.
  /// Attribute a block of main-thread milliseconds to a named phase of the render loop. Guarded
  /// like everything else here: instrumentation must never be able to cost a frame or kill one.
  observeFramePhase(name, milliseconds) {
    try { this._framePerf.observePhase(name, milliseconds); }
    catch (e) { this.errors++; this.lastError = String(e); }
  },
  observeTimeCompression(plan) {
    try { this._framePerf.observeTimeCompression(plan); }
    catch (e) { this.errors++; this.lastError = String(e); }
  },
  observeFrameDelta(deltaMs) {
    try {
      const summary = this._framePerf.observe(deltaMs, performance.now());
      if (!summary) return;
      // Read-only browser QA seam: phase ownership of a reported hitch can be inspected without
      // making the recorder or kernel mutable from the page.
      document.documentElement.dataset.framePerf = JSON.stringify(summary);
      if (this.buf.length >= TELEMETRY_BUFFER_LIMIT) return;
      this.ensureHeader();
      this.enqueue({ k: "perf", t: Math.round(performance.now()), ...summary });
    } catch (e) { this.errors++; this.lastError = String(e); }
  },
  // Every method is fully guarded: telemetry must NEVER be able to crash the flight loop (an
  // earlier version did — an oversized keepalive-fetch body throws, and it killed the sim).
  event(type, code, detail = {}) {
    try {
      this.ensureHeader();
      this.enqueue({
        k: "in",
        t: Math.round(performance.now()),
        sortie: this._sortie?.id ?? null,
        type,
        code,
        held: [...heldKeys],
        ...detail,
      });
    }
    catch (e) { this.errors++; this.lastError = String(e); }
  },
  context(type, value) {
    try {
      const key = JSON.stringify(value);
      if (this._lastContext.get(type) === key) return;
      this._lastContext.set(type, key);
      this.ensureHeader();
      this.enqueue({
        k: "ctx",
        t: Math.round(performance.now()),
        sortie: this._sortie?.id ?? null,
        type,
        value,
      });
      if (performance.now() >= this._nextPost) this.flush();
    } catch (e) { this.errors++; this.lastError = String(e); }
  },
  sample(state) {
    try {
      this.samples++;
      // The renderer can run far faster than the authority. Record an initial state and then one
      // diagnostic sample per six elapsed fixed ticks (20 Hz). Elapsed scheduling is essential:
      // render loops that observe ticks 1, 7, 13... never hit a modulo-zero boundary. Protection,
      // lifecycle, terminal, and authoritative-event edges bypass the cadence even at a same-tick
      // presentation update.
      if (!state) return;
      const sampleDecision = this._sampleScheduler.observe(state);
      const tick = sampleDecision.tick;
      const lifecycleChanged = sampleDecision.lifecycleChanged;
      const protectionChanged = sampleDecision.protectionChanged;
      const terminalChanged = sampleDecision.terminalChanged;
      const finishedEdge = state?.finished === true && sampleDecision.finishedEdge;
      this._lastSessionPhase = String(state?.session_phase || "UNKNOWN").toUpperCase();
      this.lastSampleKey = tick === null ? `time:${state?.t}` : `tick:${tick}`;
      if (!sampleDecision.record) return;
      // The header always precedes state or multiplayer context, so downloaded chunks retain an
      // unambiguous build/session identity even when the room connects before the first sim tick.
      this.ensureHeader();
      if (lifecycleChanged) this._stateEncoder.forceKeyframe();
      if (protectionChanged || terminalChanged || sampleDecision.recentEventChanged
        || sampleDecision.tickReset) this._stateEncoder.forceKeyframe();
      const telemetryState = this._sortie
        ? { ...state, telemetry_sortie_id: this._sortie.id }
        : state;
      const row = this._stateEncoder.encode({
        state: telemetryState,
        time: Math.round(performance.now()),
        build: this.build,
        held: heldKeys,
      });
      row.authority_tick_delta = sampleDecision.authorityTickDelta;
      row.sample_reason = sampleDecision.reasons.join("+");
      this.enqueue(row);
      if (finishedEdge) {
        this.event("lifecycle", "sortie_finished", {
          mission: this._sortie?.mission ?? null,
          sortie_outcome: state?.sortie_outcome ?? null,
          recovery: state?.recovery ?? null,
          touchdown_grade: state?.touchdown_grade ?? null,
          touchdown_primary_correction: state?.touchdown_primary_correction ?? null,
        });
        this.endSortie("finished", state);
        this.flush({ force: true });
        return;
      }
      if (performance.now() >= this._nextPost) this.flush();
    } catch (e) { this.errors++; this.lastError = String(e); }
  },
  flush({ force = false } = {}) {
    try {
      const now = performance.now();
      if ((!this.buf.length && !this._pendingBatch)
        || this._sending || (!force && now < this._nextPost)) return;
      let batch = this._pendingBatch;
      if (!batch) {
        // Defensive recovery guard: no retained queue may be serialized with a leading delta,
        // even after an outage/truncation path added in a future recorder revision.
        this.buf = ensureTelemetryChunkKeyframe(this.buf);
        const batchId = newTelemetryBatchId();
        this.buf = ensureTelemetryChunkHeader(this.buf, this.chunkHeader(batchId));
        batch = buildTelemetryBatch({
          session: this.session,
          batchId,
          rows: this.buf,
        });
        // A byte/row capacity split can fall between periodic keyframes. Promote the first retained
        // state while its non-enumerable materialized snapshot is still available in memory.
        this.buf = ensureTelemetryChunkKeyframe(batch.remainingRows);
        releaseTelemetryMaterializedStates(batch.rows);
        this.droppedRows += batch.droppedRows;
        if (!batch.payload) {
          this._nextPost = performance.now() + TELEMETRY_FLUSH_INTERVAL_MS;
          return;
        }
        this._pendingBatch = batch;
        // Samples collected while this immutable upload is in flight form the next chunk. Start
        // that chunk with a full state so every ordinary 30-second Blob is independently useful.
        this._stateEncoder.forceKeyframe();
      }
      this.lastPost = now;
      this.lastPayloadBytes = batch.requestBytes;
      this._nextPost = Number.POSITIVE_INFINITY;
      this.flushes++;
      // NO keepalive: its 64 KB body cap is what threw before. A single in-flight request owns this
      // exact batch ID and body across retries; samples collected while it runs remain buffered for
      // the next immutable chunk. The server's deterministic Blob path makes an acknowledged retry
      // idempotent even if the first response was lost after storage succeeded.
      let drainAfterSuccess = false;
      this._sending = Promise.resolve().then(() => fetch("/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: batch.payload,
      }))
        .then((response) => {
          if (!response.ok) {
            const error = new Error(`HTTP ${response.status}`);
            error.status = response.status;
            throw error;
          }
          this._pendingBatch = null;
          this._retryDelay = TELEMETRY_FLUSH_INTERVAL_MS;
          drainAfterSuccess = this.buf.length > 0;
          this._nextPost = performance.now()
            + (drainAfterSuccess ? 0 : TELEMETRY_FLUSH_INTERVAL_MS);
        })
        .catch((e) => {
          this.errors++;
          this.lastError = "fetch:" + String(e);
          if (e?.status === 400 || e?.status === 413 || e?.status === 422) {
            // A receiver rejection is permanent for this exact idempotent body. Drop only that
            // bounded batch and continue with newer trace data instead of retrying poison forever.
            this.droppedRows += batch.rows.length;
            this._pendingBatch = null;
            drainAfterSuccess = this.buf.length > 0;
            this._nextPost = performance.now()
              + (drainAfterSuccess ? 0 : TELEMETRY_FLUSH_INTERVAL_MS);
            return;
          }
          // Transport/storage failures retain the exact pending body and back off. Newer rows stay
          // independently bounded, so a prolonged outage cannot grow browser memory without limit.
          this._retryDelay = Math.min(TELEMETRY_MAX_BACKOFF_MS, this._retryDelay * 2);
          this._nextPost = performance.now() + this._retryDelay;
        })
        .finally(() => {
          this._sending = null;
          if (drainAfterSuccess && this.buf.length > 0) {
            queueMicrotask(() => this.flush({ force: true }));
          }
        });
    } catch (e) { this.errors++; this.lastError = String(e); }
  },
};
globalThis.__rec = recorder;   // inspectable: __rec.samples / .flushes / .errors / .lastError

function renderBuildIdentity() {
  if (!readyBuild) return;
  readyBuild.textContent = buildIdentity.label;
  readyBuild.dataset.state = buildIdentity.state;
  readyBuild.title = buildIdentity.stale
    ? "This tab is not running the current production release. Reload before flying."
    : `Application ${buildIdentity.telemetryBuild}`;
  if (readyBuildReload) readyBuildReload.hidden = !buildIdentity.stale;
}

function buildIdentityBlocksSortie() {
  return buildIdentity.stale || buildIdentity.state === "checking";
}

function applyBuildIdentity(nextIdentity) {
  const changed = JSON.stringify(buildIdentity.telemetry)
    !== JSON.stringify(nextIdentity.telemetry);
  buildIdentity = nextIdentity;
  globalThis.__gunsBuild = buildIdentity;
  recorder.build = buildIdentity.telemetryBuild;
  recorder.buildIdentity = buildIdentity.telemetry;
  // If deployment metadata arrives after the first sample, the next stored state is a keyframe
  // carrying the resolved identity rather than an ambiguous continuation of the provisional one.
  if (changed) {
    recorder._stateEncoder.forceKeyframe();
    recorder.context("build_identity", buildIdentity.telemetry);
  }
  renderBuildIdentity();
  renderPauseUi();
  queueMicrotask(tryAutoLaunch);
}

function resolvedBuildIdentity() {
  return createReleaseIdentity({
    entrypointBuild: ENTRYPOINT_BUILD,
    running: runningBuildInfo,
    current: lastKnownBuildInfo,
    lookup: buildIdentityLookupSucceeded
      ? "complete" : buildIdentityLookupAttempted ? "unverified" : "checking",
  });
}

async function fetchBuildInfo(url, signal) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error(`build-info HTTP ${response.status}`);
  const info = normalizeBuildInfo(await response.json());
  if (!info) throw new Error("invalid build-info response");
  return info;
}

function resolveBuildIdentity({ force = false } = {}) {
  const now = Date.now();
  if (buildIdentityLookup) return buildIdentityLookup;
  if (!force && now - buildIdentityLastCheckedAt < BUILD_IDENTITY_REVALIDATE_MS) {
    return Promise.resolve(buildIdentity);
  }
  buildIdentityLastCheckedAt = now;
  buildIdentityLookupAttempted = true;

  buildIdentityLookup = (async () => {
    const currentUrl = buildInfoUrl(window.location);
    if (!currentUrl) {
      buildIdentityLookupSucceeded = true;
      applyBuildIdentity(resolvedBuildIdentity());
      return buildIdentity;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    try {
      const runningUrl = runningBuildInfoUrl(window.location);
      // A direct Vercel deployment has two identities: its immutable same-origin code and the
      // canonical production alias. Capture the former once before comparing the latter. On the
      // canonical alias both URLs are the same, so the one response below establishes both.
      if (!runningBuildInfo && runningUrl && runningUrl !== currentUrl) {
        try {
          runningBuildInfo = await fetchBuildInfo(runningUrl, controller.signal);
        } catch {
          // Continue to the canonical lookup. An unavailable old endpoint should not manufacture
          // a stale decision, while a different entrypoint build remains independently detectable.
        }
      }
      const current = await fetchBuildInfo(currentUrl, controller.signal);
      // The first matching production response identifies the deployment this app started on.
      // Later lookups are comparisons against that immutable baseline, including BFCache restores.
      if (!runningBuildInfo
        && ENTRYPOINT_BUILD === current.build && current.build === buildIdentity.releaseBuild) {
        runningBuildInfo = current;
      }
      lastKnownBuildInfo = current;
      buildIdentityLookupSucceeded = true;
      applyBuildIdentity(resolvedBuildIdentity());
    } catch {
      // A transient metadata failure must not erase a previously verified stale/current decision.
      applyBuildIdentity(resolvedBuildIdentity());
    } finally {
      clearTimeout(timeout);
    }
    return buildIdentity;
  })().finally(() => {
    buildIdentityLookup = null;
  });
  return buildIdentityLookup;
}

async function reloadCurrentBuild() {
  // Cache-first service-worker responses pin app.js?v=N and unversioned modules until the
  // cache name changes. A plain navigation to the same release therefore keeps serving the
  // stale shell — the "Reload current build" button looked dead. Drop the worker and its
  // caches first, then hard-navigate to the canonical production origin.
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("guns-only-"))
          .map((key) => caches.delete(key)),
      );
    }
  } catch (error) {
    console.warn("Could not clear offline caches before reload.", error);
  }

  const destination = new URL(
    window.location.pathname || "/",
    CANONICAL_PRODUCTION_ORIGIN,
  );
  destination.searchParams.delete("mission");
  if (selectedProgramNodeId) {
    destination.searchParams.set("program", selectedProgramNodeId);
  }
  destination.searchParams.set(
    "build",
    buildIdentity.currentBuild || buildIdentity.releaseBuild,
  );
  destination.searchParams.set("_reload", String(Date.now()));
  window.location.replace(destination.href);
}

// Ordinary fetch has no guaranteed unload delivery, but forcing the current tail as soon as the
// page becomes hidden gives it the best available head start without reintroducing keepalive's
// 64 KB cap. The single-flight guard makes duplicate lifecycle events harmless.
window.addEventListener("pagehide", () => {
  recorder.endSortie("pagehide", latestState);
  recorder.flush({ force: true });
});
window.addEventListener("beforeunload", () => {
  recorder.endSortie("beforeunload", latestState);
  recorder.flush({ force: true });
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) recorder.flush({ force: true });
  else if (!document.hidden) void resolveBuildIdentity();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) void resolveBuildIdentity({ force: true });
});
window.addEventListener("focus", () => void resolveBuildIdentity());

let bridge = null;
let snapshotSource = null;
const keyOwners = new Map();
let padlock = false;
let padlockTarget = "bandit";
let padlockEntityId = "";
let padlockPhase = "OFF";
let padlockTrackEstablished = false;
/// KILL CAM. Shooting an aircraft down used to drop the padlock on the same frame the rounds
/// landed — the camera snapped forward and the pilot never saw the result of their own gunnery,
/// which is the single most satisfying thing in the sortie. The lock is now HELD on the aircraft
/// that just died, and when the fight moves on it JUMPS to whoever is left rather than dumping the
/// pilot into the forward view to go and find them again.
///
/// The kernel already had the window: ContinuousCombatConfig.ReplacementDelaySeconds is the pause
/// between a kill and the next opponent, and promotion of a surviving wingman happens at the end of
/// it. This is a client-side timer rather than a new wire field because it is a CAMERA decision,
/// not simulation truth — the fight does not care where the pilot is looking.
const PADLOCK_KILL_CAM_MS = 3_500;
/// ...but the beat is CUT SHORT the moment the survivor starts converting on the player. "I don't
/// wanna linger if he's about to start shooting me" — a kill cam that keeps the pilot's eyes on a
/// falling wreck while the other one closes to guns is a camera that gets them killed. The floor
/// exists so the SPLASH still registers rather than flickering past.
const PADLOCK_KILL_CAM_MINIMUM_MS = 900;
/// What counts as "about to start shooting": inside a mile and a half with his nose inside a
/// quarter-turn of the player. This is deliberately WIDER than the bandit's actual firing gate
/// (120-900 m, 3-5 degrees of nose error) because the camera has to leave BEFORE the shot, not
/// react to it.
const PADLOCK_KILL_CAM_THREAT_RANGE_M = 1_800;
const PADLOCK_KILL_CAM_THREAT_COS = Math.cos(25 * DEG);
let padlockKillCamUntilMs = 0;
/// The engagement the current lock belongs to. A promoted wingman is the SAME fight and the camera
/// should follow it; a replacement wave is a new tally and must be acquired deliberately.
let padlockEngagement = null;
let appliedBanditPadlockRollAssist = null;
let dragging = false;
let activePointer = null;
let lastPointerX = 0;
let lastPointerY = 0;
let trackpadLookActive = false;
let trackpadLookReleaseTimer = 0;
let gimbalReturnFast = false;
let sensorYaw = 0;
let sensorPitch = 0;
let resetMobileInput = () => {};
let releaseHiddenMobileControls = () => {};
let setMobileFrozen = () => {};
let activeView = null;
let latestState = null;
let campaignProfile = loadCampaignProfile();
let pointsLedgerAppliedKey = "";
const requestedProgramNode = campaignNode(
  new URLSearchParams(window.location.search).get("program"),
);
const initialProgramNode = requestedProgramNode
  && campaignNodeUnlocked(campaignProfile, requestedProgramNode.id)
  ? requestedProgramNode : recommendedCampaignNode(campaignProfile);
let selectedProgramNodeId = initialProgramNode.id;
// The recommended front door remains the mission-7 infinite gauntlet, while an explicit programme
// deep link must launch the card it highlights rather than silently staging a different mission.
let selectedBeat = initialProgramNode.mission;
let stagedBeat = selectedBeat;
let selectedDeckConfiguration = 1;
let stagedDeckConfiguration = selectedDeckConfiguration;
let resetFrameClock = () => {};
let bridgePauseApplied = null;
let testFlightActionController = null;
let multiplayer = null;
let incidentReplay = null;
let appliedMultiplayerWorldOrigin = "";
const pauseReasons = new Set(["ready"]);
let autoLaunchPending = true;
let terrainLaunchWarmupPromise = null;
let terrainLaunchWarmupFailedKey = null;
let settingsReturnFocus = null;
let bindingCaptureAction = null;
let lastAccessibilityAnnouncement = "";

function renderSettingsBindings() {
  if (!settingsBindings) return;
  const nodes = CONTROL_BINDINGS.map((definition) => {
    const row = document.createElement("div");
    row.className = "settings-binding";
    const label = document.createElement("span");
    label.textContent = definition.label;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.bindAction = definition.action;
    button.dataset.capturing = String(bindingCaptureAction === definition.action);
    button.textContent = bindingCaptureAction === definition.action
      ? "Press key" : controlCodeLabel(playerSettings.bindings[definition.action]);
    row.append(label, button);
    return row;
  });
  settingsBindings.replaceChildren(...nodes);
}

function applyPlayerSettings() {
  // See-through symbology: the pilot must be able to read the bandit THROUGH the HUD.
  if (hudCanvas) hudCanvas.style.opacity = String(playerSettings.hudBrightness);
  if (activeView?.hud) activeView.hud.showLegendHint = !playerSettings.legendSeen;
  document.documentElement.classList.toggle("high-contrast", playerSettings.highContrast);
  document.documentElement.classList.toggle("forced-reduced-motion", playerSettings.reducedMotion);
  document.documentElement.classList.toggle("large-interface-text", playerSettings.largeText);
  setFlightAudioEnabled(playerSettings.audio);
  activeView?.hud.setAudioEnabled(playerSettings.audio);
  activeView?.hud.setControlBindings?.(playerSettings.bindings);
  if (settingsAudio) settingsAudio.checked = playerSettings.audio;
  if (settingsAutoGcas) settingsAutoGcas.checked = playerSettings.autoGcas !== false;
  activeView && bridge?.SetAutoGcasEnabled?.(playerSettings.autoGcas !== false);
  if (settingsHighContrast) settingsHighContrast.checked = playerSettings.highContrast;
  if (settingsReducedMotion) settingsReducedMotion.checked = playerSettings.reducedMotion;
  if (settingsLargeText) settingsLargeText.checked = playerSettings.largeText;
  if (settingsTiltSensitivity) settingsTiltSensitivity.value = String(playerSettings.tiltSensitivity);
  if (settingsTiltSensitivityValue)
    settingsTiltSensitivityValue.textContent = `${playerSettings.tiltSensitivity.toFixed(2)}×`;
  renderSettingsBindings();
}

function commitPlayerSettings(next) {
  playerSettings = savePlayerSettings(next);
  rebuildKeyboardMap();
  applyPlayerSettings();
  recorder.context("player_settings", {
    audio: playerSettings.audio,
    highContrast: playerSettings.highContrast,
    reducedMotion: playerSettings.reducedMotion,
    largeText: playerSettings.largeText,
    tiltSensitivity: playerSettings.tiltSensitivity,
  });
}

function settingsFocusables() {
  return [...settingsScreen.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )];
}

function openSettings() {
  if (!settingsScreen || settingsScreen.classList.contains("visible")) return;
  settingsReturnFocus = document.activeElement;
  bindingCaptureAction = null;
  applyPlayerSettings();
  setPauseReason("settings", true);
  readyScreen.inert = true;
  sceneCanvas.inert = true;
  settingsScreen.classList.add("visible");
  settingsScreen.setAttribute("aria-hidden", "false");
  settingsClose?.focus({ preventScroll: true });
}

function closeSettings() {
  if (!settingsScreen?.classList.contains("visible")) return false;
  bindingCaptureAction = null;
  settingsScreen.classList.remove("visible");
  settingsScreen.setAttribute("aria-hidden", "true");
  readyScreen.inert = false;
  setPauseReason("settings", false);
  const focusTarget = settingsReturnFocus?.isConnected ? settingsReturnFocus
    : readyScreen.classList.contains("visible") ? readyStart : sceneCanvas;
  focusTarget?.focus({ preventScroll: true });
  settingsReturnFocus = null;
  return true;
}

function announceFlightState(state) {
  if (!flightAnnouncer || !state) return;
  const urgentLso = ["WAVEOFF", "CORRECTING"].includes(String(state.lso_severity || ""))
    ? String(state.lso || "") : "";
  const announcement = state.finished === true
    ? `Sortie complete. ${String(state.sortie_outcome || "complete").toLowerCase()}.`
    : urgentLso || String(state.transition_cue || "");
  if (!announcement || announcement === lastAccessibilityAnnouncement) return;
  lastAccessibilityAnnouncement = announcement;
  flightAnnouncer.textContent = announcement;
}

settingsBindings?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-bind-action]");
  if (!button) return;
  bindingCaptureAction = button.dataset.bindAction;
  renderSettingsBindings();
  settingsBindings.querySelector(`[data-bind-action="${bindingCaptureAction}"]`)
    ?.focus({ preventScroll: true });
});

settingsScreen?.addEventListener("keydown", (event) => {
  if (event.code !== "Tab" || !settingsScreen.classList.contains("visible")) return;
  const focusable = settingsFocusables();
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
});

window.addEventListener("keydown", (event) => {
  if (!bindingCaptureAction || !settingsScreen?.classList.contains("visible")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.code === "Escape") {
    bindingCaptureAction = null;
    renderSettingsBindings();
    return;
  }
  const rebound = rebindControl(playerSettings, bindingCaptureAction, event.code);
  if (!rebound) return;
  bindingCaptureAction = null;
  commitPlayerSettings(rebound);
}, { capture: true });

for (const button of [settingsClose, settingsCloseBottom])
  button?.addEventListener("click", closeSettings);
settingsAutoGcas?.addEventListener("change", () => commitPlayerSettings({
  ...playerSettings, autoGcas: settingsAutoGcas.checked,
}));
settingsAudio?.addEventListener("change", () => commitPlayerSettings({
  ...playerSettings, audio: settingsAudio.checked,
}));
settingsHighContrast?.addEventListener("change", () => commitPlayerSettings({
  ...playerSettings, highContrast: settingsHighContrast.checked,
}));
settingsReducedMotion?.addEventListener("change", () => commitPlayerSettings({
  ...playerSettings, reducedMotion: settingsReducedMotion.checked,
}));
settingsLargeText?.addEventListener("change", () => commitPlayerSettings({
  ...playerSettings, largeText: settingsLargeText.checked,
}));
settingsTiltSensitivity?.addEventListener("input", () => commitPlayerSettings({
  ...playerSettings, tiltSensitivity: Number(settingsTiltSensitivity.value),
}));
settingsResetBindings?.addEventListener("click", () => commitPlayerSettings(
  resetControlBindings(playerSettings),
));
applyPlayerSettings();

readyBuildReload?.addEventListener("click", reloadCurrentBuild);
globalThis.__gunsBuild = buildIdentity;
renderBuildIdentity();
recorder.context("build_identity", buildIdentity.telemetry);
queueMicrotask(() => void resolveBuildIdentity());

function applyMultiplayerWorldOrigin(status) {
  if (!status) return;
  if (status.phase === "online" && Array.isArray(status.spawnOrigin)
    && status.spawnOrigin.length === 3 && status.spawnOrigin.every(Number.isFinite)) {
    const originKey = `${status.worldEpoch || "world.unknown"}|${status.spawnOrigin.join(",")}`;
    if (bridge && originKey !== appliedMultiplayerWorldOrigin
      && bridge.SetWorldOrigin(status.spawnOrigin[0], status.spawnOrigin[2]) === true) {
      appliedMultiplayerWorldOrigin = originKey;
    }
  }
}

function renderMultiplayerStatus(status) {
  if (!status) return;
  if (!multiplayerStatus) return;
  const presentation = presenceStatusPresentation(status);
  multiplayerStatus.dataset.phase = status.phase;
  multiplayerStatus.dataset.playerId = status.playerId || "";
  multiplayerStatus.dataset.worldEpoch = status.worldEpoch || "";
  multiplayerStatus.dataset.worldOrigin = Array.isArray(status.spawnOrigin)
    ? status.spawnOrigin.join(",") : "";
  multiplayerStatus.dataset.callsign = presentation.callsign;
  multiplayerStatus.dataset.bogeys = String(presentation.bogeys);
  multiplayerStatus.textContent = presentation.text;
  multiplayerStatus.title = presentation.title;
  // Initial connection is useful context; repeated reconnect/offline status is not a flight cue.
  // Keep transport truth in diagnostics and telemetry without pinning failure noise over the HUD.
  multiplayerStatus.hidden = presentation.phase !== "connecting";
  multiplayerStatus.setAttribute("aria-live", multiplayerStatus.hidden ? "off" : "polite");
  recorder.context("multiplayer", presenceTelemetryContext(status));
}

function renderPilotPhysiology(state) {
  syncMobileControlProfile(state);
  if (!pilotPhysiology) return;
  const presentation = gTolerancePresentation(state);
  // The physiology remains authoritative, but a replay chase/deck camera is not looking through
  // the pilot's eyes. Do not paint first-person retinal occlusion over a third-person replay.
  const externalCamera = activeView?.externalCameraActive === true;
  const presentationVisible = presentation.active && !externalCamera;
  pilotPhysiology.hidden = !presentationVisible;
  pilotPhysiology.setAttribute("aria-hidden", String(!presentationVisible));
  pilotPhysiology.dataset.state = presentation.stage;
  pilotPhysiology.style.setProperty(
    "--pilot-vignette-opacity",
    presentation.vignetteOpacity.toFixed(4),
  );
  pilotPhysiology.style.setProperty(
    "--pilot-blackout-opacity",
    presentation.blackoutOpacity.toFixed(4),
  );
  pilotPhysiology.style.setProperty(
    "--pilot-redout-opacity",
    presentation.redoutOpacity.toFixed(4),
  );
  if (pilotPhysiologyCue) {
    pilotPhysiologyCue.hidden = presentation.cue === null || externalCamera;
    pilotPhysiologyCue.textContent = presentation.cue?.text ?? "";
    pilotPhysiologyCue.dataset.level = presentation.cue?.level ?? "";
  }
}

function syncMobileControlProfile(state) {
  if (!mobileControls || !touchControls) return;
  const profile = mobileControlProfile(state);
  if (touchThrottleControls) touchThrottleControls.hidden = !profile.throttle;
  if (touchWaveOffButton) touchWaveOffButton.hidden = !profile.waveOff;
  if (touchGearButton) touchGearButton.hidden = !profile.gear;
  if (touchFlapUpButton) touchFlapUpButton.hidden = !profile.flaps;
  if (touchFlapDownButton) touchFlapDownButton.hidden = !profile.flaps;
  if (touchPadlockButton) touchPadlockButton.hidden = !profile.padlock;
  if (touchLimitOverride) touchLimitOverride.hidden = !profile.limitOverride;
  if (touchFireButton) touchFireButton.hidden = !profile.fire;
  if (touchGcasPaddle) touchGcasPaddle.hidden = !profile.gcasOverride;
  if (touchContextControls) {
    touchContextControls.hidden = !profile.gear && !profile.flaps;
  }
  releaseHiddenMobileControls();
}

const MISSION_BRIEFS = Object.freeze({
  1: {
    activity: "dogfight",
    kicker: "BFM drill · mission 01",
    title: "Perch Attack",
    sortie: "Offensive conversion",
    configuration: "F-86F-30 · guns hot · high-six perch",
    card: "Start high at the bandit's six and convert the perch into a gun solution.",
    brief: "Convert altitude and position into a controlled gun solution. Stay in plane, manage closure, and do not trade the perch for an overshoot.",
    controls: "Arrows fly · W/S power · F guns · V padlock · Tab target\nSpace releases the G limiter · H opens controls",
  },
  2: {
    activity: "dogfight",
    kicker: "BFM drill · mission 02",
    title: "Break Defense",
    sortie: "Defensive reaction",
    configuration: "F-86F-30 · guns hot · bandit high six",
    card: "A bandit begins at your high six. Survive, then reverse the fight.",
    brief: "Survive the opening break, preserve energy, and reverse the geometry when the attacker spends too much nose authority.",
    controls: "Arrows fly · W/S power · F guns · V padlock · Tab target\nSpace releases the G limiter · H opens controls",
  },
  3: {
    activity: "gunnery",
    kicker: "BFM drill · mission 03",
    title: "Saddle + Shot",
    sortie: "Gunnery setup",
    configuration: "F-86F-30 · guns hot · tracking start",
    card: "Track a weaving target and fire only from a stable gun solution.",
    brief: "Settle behind the target, control angle-off and closure, then fire only when the lead solution stabilises inside the gun envelope.",
    controls: "Arrows fly · W/S power · F guns · V padlock · Tab target\nFire only after the lead solution settles",
  },
  4: {
    activity: "gunnery",
    kicker: "Intercept · mission 04",
    title: "Balloon Strike",
    sortie: "Engine-less diving pass",
    configuration: "Engine-less glider · 50 rounds · one pass",
    card: "Trade a finite altitude budget for one engine-less attack on an AWACS.",
    brief: "You are already in the terminal geometry with no engine. Dispose of excess altitude in a controlled dive, protect enough IAS for one gun solution, and do not plan a second attack.",
    controls: "Arrows fly · F guns · V padlock · Tab target\nNo engine: altitude is the complete energy budget",
  },
  5: {
    activity: "carrier",
    kicker: "Carrier conversion · programme 04",
    title: "F-35C Carrier Conversion",
    sortie: "One recovery attempt · trap or bolter",
    configuration: "F-35C public-data carrier surrogate · recovery only · angled deck",
    card: "Convert to the carrier after three Raptor qualifications, then fly one scored pass.",
    brief: "This is a reduced-order F-35C carrier surrogate, not an OEM systems or flight-control model. Use power to control glideslope, hold lineup inside the angled landing area, and fly through touchdown without a flare. A trap or bolter ends the attempt with its recorded grade and primary correction.",
    controls: "W/S power · arrows fly · V padlocks the boat\nFly the on-speed AOA cue · power for glideslope · no flare",
  },
  6: {
    activity: "carrier",
    kicker: "Maintenance test flight · mission 06",
    title: "Degraded Recovery",
    sortie: "Utility-hydraulic failure · emergency gear · RTB",
    card: "Diagnose a failed normal gear extension and recover aboard safely.",
    brief: "Diagnose the failed normal extension from indications and elapsed time. Emergency-extend below the limit, verify every downlock, then recover aboard.",
    controls: "G normal gear · E emergency release · I inspect downlocks\nW/S power · arrows fly · V padlocks the boat",
  },
  7: {
    activity: "dogfight",
    kicker: "2030s Ukraine theatre · mission 07",
    title: "F-22A vs Su-27S",
    sortie: "Continuous visual merges · public-data surrogates · guns only",
    configuration: "F-22 public-data surrogate · 480 rounds across all fights · Joker 6,000 LB · Bingo 4,000 LB · Auto-GCAS armed",
    card: "Splash successive Su-27 surrogates; each replacement enters through a fresh neutral merge.",
    brief: "Each splash stages another offset Su-27 visual merge after a short destruction dwell. Fuel, ammunition, ownship damage, and kill count persist, so burst discipline matters; every new opponent starts guns-safe through the first pass. Fight for the rear quarter, preserve energy, and manage both G onset and duration: 9 G is available, but vision and consciousness are physiological state. Auto-GCAS responds only to predicted terrain collision; hold K to paddle an active fly-up. No missiles or unmodelled modern sensors.",
    controls: "Arrows fly · W/S power · F guns · V padlock · Tab target\nSpace releases the G limiter · hold K only to paddle an active Auto-GCAS fly-up",
  },
  8: {
    activity: "defence",
    kicker: "2030s Ukraine · Soniachne detail cell · mission 08",
    title: "Low-Level Drone Intercept",
    sortie: "Fictional Soniachne sector · four sequential raiders · guns only",
    configuration: "F-22 public-data surrogate · 480 rounds · low-level VMC · Auto-GCAS armed · one authoritative target at a time",
    card: "Intercept four low-flying fictional raiders over a stylized Ukrainian rural training sector.",
    brief: "This is the first low-altitude scenery slice: a fictional Ukrainian lowland, true-scale terrain, and four sequential airborne raiders. One target is authoritative at a time, and the next enters only after the current raider is killed or leaks. Fly cutoff geometry, use the terrain as a real flight reference, take the first valid gun solution, and protect ammunition. Buildings are ambient scenery in this slice—not ground targets or collision truth. Auto-GCAS is terrain-triggered and K is its held paddle override.",
    controls: "Arrows fly · W/S power · F guns · V padlock · Tab target\n480 rounds for four raiders · hold K only during an active Auto-GCAS fly-up",
  },
});

const CAMPAIGN_BRIEFS = Object.freeze({
  "first-merge": Object.freeze({
    kicker: "2030s Ukraine · F-22A · endless",
    title: "Guns Only",
    sortie: "F-22A vs escalating opposition · guns only · first pass safe",
    configuration: "F-22 public-data surrogate · 480 rounds · Joker 6,000 LB · Bingo 4,000 LB · Auto-GCAS armed",
    brief: "You are already at the visual merge, and the opening wave is a pair of Aces. Survive the first pass, fight into the rear quarter, and keep going — the fight director watches how you actually flew and moves the pilot tier, the opponent's jet and the number of aircraft you face. Win and it stays hard. Lose twice and it eases. There is no radar, missile, stealth, or classified-system simulation hiding behind the labels.",
    controls: "Arrows fly · W/S power · F guns · V padlock · Tab target\nSpace releases the G limiter · H opens controls",
  }),
  "low-level-drone": Object.freeze({
    ...MISSION_BRIEFS[8],
    kicker: "2030s Ukraine · fictional Soniachne detail cell",
    title: "Low-Level Drone Intercept",
    sortie: "F-22A defensive intercept · four staged low-flying raiders · guns only",
    configuration: "F-22 public-data surrogate · 480 rounds · true-scale lowland terrain · Auto-GCAS armed",
  }),
  "endurance-merge": Object.freeze({
    ...MISSION_BRIEFS[7],
    kicker: "Raptor programme · qualification 03",
    title: "Endurance Merge",
    sortie: "Successive visual merges · persistent fuel, ammunition, and damage",
    brief: "Two splashes earn carrier conversion. Each replacement Su-27 enters through a fresh neutral merge while fuel, ammunition, damage, and your kill count persist. Burst discipline and G management now matter across the whole sortie, not just one fight.",
    controls: "Arrows fly · W/S power · F guns · V padlock · Tab target\nSplash two bandits in one sortie to qualify",
  }),
  "rapier-circuits": Object.freeze({
    kicker: "2030s Ukraine · overhead circuit practice",
    title: "Rapier Circuits",
    sortie: "Ski-jump · overhead pattern · touch-and-go · trap",
    configuration: "Attritable Rapier brick · full fuel · hook down · no contact",
    brief: "Military overhead · ~1,800 ft AGL · 300 KT initial/downwind · 180 KT final · fly the boxes · trap the wire. P = DEMO; touch stick = DIRECT; P off = MONITOR. No Mach dash.",
    controls: "P DEMO ↔ MONITOR · stick takeover = DIRECT · arrows/W/S · T time · V threshold · Tab traffic\nFly the boxes · trap the wire",
    preflightCue: "INITIAL / DOWNWIND ~300 KT · FINAL ~180 KT · hook down always",
    preflightLegs: Object.freeze([
      Object.freeze({ id: "DEPART", label: "DEPART", intent: "Ski-jump → climb → join INITIAL", cue: "Pattern alt ~1,500–2,000 ft AGL" }),
      Object.freeze({ id: "INITIAL", label: "INITIAL", intent: "Runway heading, midfield", cue: "~300 KT · hook down" }),
      Object.freeze({ id: "BREAK", label: "BREAK", intent: "~180° to downwind", cue: "~45° bank" }),
      Object.freeze({ id: "DOWNWIND", label: "DOWNWIND", intent: "Opposite parallel, abeam", cue: "~2–2.5 NM offset · ~300 KT" }),
      Object.freeze({ id: "BASE", label: "BASE", intent: "Continuous turn to final", cue: "Shed toward ~220 KT" }),
      Object.freeze({ id: "SHORT_FINAL", label: "SHORT FINAL", intent: "T&G / go-around before midfield gear", cue: "~180 KT" }),
      Object.freeze({ id: "WIRE_FINAL", label: "WIRE", intent: "Accept trap; aerobrake → wire", cue: "~170–180 KT" }),
    ]),
    preflightModes: Object.freeze([
      Object.freeze({ id: "DEMO", label: "DEMO (P)", detail: "Auto on · watch the boxes" }),
      Object.freeze({ id: "DIRECT", label: "DIRECT", detail: "Touch stick · FD/boxes stay" }),
      Object.freeze({ id: "MONITOR", label: "MONITOR", detail: "P off · you own it" }),
    ]),
  }),
  "rapier-intercept": Object.freeze({
    kicker: "Eastern corridor · guns-only",
    title: "Rapier Intercept",
    sortie: "Rapier turbo-ramjet interceptor · guns-only · one-pass sweep · pursued recovery",
    configuration: "Fictional TBCC Rapier · design dash M4 (fiction) · OFT peak ~M3.7 · CMC hot structure · reusable gun-drones · 3,100 LB alert fuel",
    brief: "Mission automation owns the long profile by default: use full augmentation to launch, climb around M0.90 to FL560 (56,000 ft), and drive cleanly through the transonic drag rise. RAM LIGHT begins at M1.6 and full ram arrives at M2.2; at FL315 the aircraft can gather speed but cannot cross into full ram, so hold the altitude profile, ram-climb to FL700, and dash. Mach and KTAS, range, closure, and intercept ETA stay visible throughout the long leg. Treat briefing Mach 4 as aspirational — measured energy-ladder peaks near M3.7. At the formation, press F to release the gun-drone load; Rapier egresses while drones fight. Return, shed energy for marshal, lineup, and four large square gates into wire three.",
    controls: "P mission automation · F release gun-drones · arrows/W/S pilot takeover\nT safe time compression · V padlock · Tab target · fly every recovery square · trap on wire three",
  }),
  "ace-duel": Object.freeze({
    kicker: "Raptor programme · final exam",
    title: "Ace Duel",
    sortie: "F-22A vs Su-27S ace · lone guns-only duel · first pass safe",
    configuration: "F-22 public-data surrogate · 480 rounds · Joker 6,000 LB · Bingo 4,000 LB · Auto-GCAS armed",
    brief: "The programme's final exam: one merge, one bandit, flown by the best pilot the ladder can field. This Su-27 surrogate reads the fight a manoeuvre ahead—it converts the merge and takes it into the vertical. Survive the first pass, then out-fly a genuine ace for the rear quarter and splash it. There is no radar, missile, stealth, or classified-system simulation hiding behind the labels.",
    controls: "Arrows fly · W/S power · F guns · V padlock · Tab target\nSplash the ace to complete the programme · Space releases the G limiter",
  }),
});

// Codes whose bridge DOWN edge used the source-aware direct throttle path. Their matching UP edge
// must use the same path so the simulation grammar never classifies a rocker hold as a keyboard
// tap or double-tap arm (which once consumed a prior legitimate keyboard throttle tap).
const directThrottleHeld = new Map(); // code -> increase (true = throttle up)

function pressMappedKey(code, source, gkeyOverride = undefined,
  directThrottleIncrease = undefined) {
  const gkey = gkeyOverride ?? keyMap.get(code);
  if (!bridge || gkey === undefined || pauseReasons.size > 0) return false;
  let owners = keyOwners.get(code);
  if (!owners) {
    owners = new Set();
    keyOwners.set(code, owners);
  }
  if (owners.has(source)) return true;
  owners.add(source);
  if (owners.size > 1) return true;
  heldKeys.add(code);
  activeGkeys.set(code, gkey);
  if (directThrottleIncrease !== undefined
    && typeof bridge.FeedDirectThrottle === "function") {
    bridge.FeedDirectThrottle(directThrottleIncrease, true);
    directThrottleHeld.set(code, directThrottleIncrease);
  } else {
    bridge.FeedKey(gkey, true);
  }
  recorder.event("down", code, { source });
  return true;
}

function releaseMappedKey(code, source) {
  const owners = keyOwners.get(code);
  if (!owners?.delete(source)) return false;
  if (owners.size) return false;
  keyOwners.delete(code);
  heldKeys.delete(code);
  const gkey = activeGkeys.get(code) ?? keyMap.get(code);
  const directIncrease = directThrottleHeld.get(code);
  directThrottleHeld.delete(code);
  if (bridge && directIncrease !== undefined
    && typeof bridge.FeedDirectThrottle === "function") {
    bridge.FeedDirectThrottle(directIncrease, false);
  } else if (bridge && gkey !== undefined) bridge.FeedKey(gkey, false);
  activeGkeys.delete(code);
  recorder.event("up", code, { source });
  return true;
}

function releaseAllMappedKeys(reason = "system-neutralise") {
  // System neutralisation is a real control transition. Record each release after removing it from
  // heldKeys so event-only telemetry can reconstruct blur/pause/visibility boundaries faithfully.
  for (const code of [...heldKeys]) {
    const owners = [...(keyOwners.get(code) ?? [])];
    const gkey = activeGkeys.get(code) ?? keyMap.get(code);
    const directIncrease = directThrottleHeld.get(code);
    directThrottleHeld.delete(code);
    if (bridge && directIncrease !== undefined
      && typeof bridge.FeedDirectThrottle === "function") {
      bridge.FeedDirectThrottle(directIncrease, false);
    } else if (bridge && gkey !== undefined) bridge.FeedKey(gkey, false);
    heldKeys.delete(code);
    activeGkeys.delete(code);
    recorder.event("up", code, {
      source: "system",
      reason,
      neutralised: true,
      owners,
    });
  }
  keyOwners.clear();
}

function isGkeyHeld(gkey) {
  return [...activeGkeys.values()].includes(gkey);
}

function setTestFlightValue(node, text, state = null) {
  if (!node) return;
  if (node.textContent !== text) node.textContent = text;
  if (state !== null && node.dataset.state !== state) node.dataset.state = state;
}

function renderTestFlightConsole(state) {
  if (!testFlightUi) return;
  const projected = projectTestFlightState(state);
  const airborneSortie = state.ready !== true && state.paused !== true && state.finished !== true;
  updateNavConsole(airborneSortie ? state : null);
  // AVAILABLE vs RELEVANT. The console reads engine, bus, hydraulics and gear, and a pilot may
  // want any of those at any moment — so the collapsed tab is present for the whole sortie and the
  // pilot opens it when they choose. Relevance still drives data-relevance, which is what makes it
  // shout during a maintenance beat or an abnormal indication rather than sitting there as decor.
  const relevant = airborneSortie && testFlightConsoleRelevant(projected);
  if (testFlightConsole) {
    const wasHidden = testFlightConsole.hidden;
    testFlightConsole.hidden = !airborneSortie;
    testFlightConsole.dataset.relevance = projected.maintenance.active
      ? "maintenance"
      : projected.warnings.length ? "abnormal" : relevant ? "transition" : "none";
    if (!airborneSortie && !wasHidden) {
      testFlightConsole.open = false;
      testFlightActionController?.releaseAll();
    }
  }
  if (!airborneSortie) return;

  setTestFlightValue(testFlightUi.engineRpm, projected.engine.rpmText, projected.engine.state);
  setTestFlightValue(testFlightUi.engineRunning,
    projected.engine.runningText, projected.engine.state);
  setTestFlightValue(testFlightUi.primaryBus,
    projected.electrical.primaryBusText, projected.electrical.state);
  setTestFlightValue(testFlightUi.hydraulicPressure,
    projected.hydraulic.pressureText, projected.hydraulic.state);
  setTestFlightValue(testFlightUi.gearHandle, projected.gear.handleText);
  setTestFlightValue(testFlightUi.gearNose,
    projected.gear.nose.text, projected.gear.nose.state);
  setTestFlightValue(testFlightUi.gearLeft,
    projected.gear.left.text, projected.gear.left.state);
  setTestFlightValue(testFlightUi.gearRight,
    projected.gear.right.text, projected.gear.right.state);
  setTestFlightValue(testFlightUi.flapLever, projected.flaps.leverText,
    projected.flaps.overspeed ? "warning" : "nominal");
  const flapState = projected.flaps.overspeed || projected.flaps.split ? "warning" : "nominal";
  setTestFlightValue(testFlightUi.flapLeft, projected.flaps.leftText, flapState);
  setTestFlightValue(testFlightUi.flapRight, projected.flaps.rightText, flapState);
  setTestFlightValue(testFlightUi.warningLine,
    projected.warningText, projected.warningLevel);
  setTestFlightValue(testFlightUi.procedureLine, projected.maintenance.instructionText,
    projected.maintenance.complete ? "nominal" : projected.maintenance.active ? "caution" : "inactive");
  setTestFlightValue(testFlightUi.procedureScore, projected.maintenance.scoreText,
    projected.maintenance.recovered ? "nominal" : "caution");

  const disabled = !bridge || pauseReasons.size > 0;
  if (disabled && testFlightActionController?.activeOwnerCount) {
    testFlightActionController.releaseAll();
  }
  for (const button of testFlightUi.buttons) {
    const maintenanceOnly = button.dataset.maintenanceOnly === "true";
    button.disabled = disabled || (maintenanceOnly && !projected.maintenance.active);
  }
}

function installTestFlightConsole() {
  if (!testFlightConsole || !testFlightUi) return;
  const buttonsByAction = new Map(testFlightUi.buttons
    .map((button) => [button.dataset.testAction, button]));
  const suppressClickUntil = new WeakMap();
  let assistiveSequence = 0;

  testFlightActionController = createPilotActionController({
    press: (code, owner) => pressMappedKey(code, `test-flight:${owner}`),
    release: (code, owner) => releaseMappedKey(code, `test-flight:${owner}`),
    onChange: ({ actionId, active }) => {
      const button = buttonsByAction.get(actionId);
      if (!button) return;
      button.dataset.active = String(active);
      button.setAttribute("aria-pressed", String(active));
    },
  });

  function pointerOwner(event) {
    return `pointer:${event.pointerId}`;
  }

  function finishPointer(event) {
    testFlightActionController.releaseOwner(pointerOwner(event));
  }

  for (const button of testFlightUi.buttons) {
    const actionId = button.dataset.testAction;
    button.dataset.active = "false";
    button.setAttribute("aria-pressed", "false");

    button.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClickUntil.set(button, performance.now() + 1200);
      const owner = pointerOwner(event);
      if (!testFlightActionController.begin(actionId, owner)) return;
      try { button.setPointerCapture(event.pointerId); } catch { /* pointer already ended */ }
    }, { passive: false });
    button.addEventListener("pointerup", finishPointer);
    button.addEventListener("pointercancel", finishPointer);
    button.addEventListener("lostpointercapture", finishPointer);

    button.addEventListener("keydown", (event) => {
      if (event.code !== "Space" && event.code !== "Enter" && event.code !== "NumpadEnter") return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      suppressClickUntil.set(button, performance.now() + 1200);
      testFlightActionController.begin(actionId, `keyboard:${actionId}:${event.code}`);
    }, { passive: false });
    button.addEventListener("keyup", (event) => {
      if (event.code !== "Space" && event.code !== "Enter" && event.code !== "NumpadEnter") return;
      event.preventDefault();
      event.stopPropagation();
      testFlightActionController.releaseOwner(`keyboard:${actionId}:${event.code}`);
    }, { passive: false });
    button.addEventListener("blur", () => {
      testFlightActionController.releaseOwner(`keyboard:${actionId}:Space`);
      testFlightActionController.releaseOwner(`keyboard:${actionId}:Enter`);
      testFlightActionController.releaseOwner(`keyboard:${actionId}:NumpadEnter`);
    });

    // Assistive technology may synthesize click without pointer or key events. Give that path a
    // safe down/up pulse; real pointer and keyboard clicks are suppressed because their lifecycle
    // was already handled above.
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if ((suppressClickUntil.get(button) || 0) >= performance.now()) return;
      const owner = `assistive:${++assistiveSequence}`;
      if (testFlightActionController.begin(actionId, owner)) {
        queueMicrotask(() => testFlightActionController?.releaseOwner(owner));
      }
    });
    button.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  const releaseConsoleActions = () => testFlightActionController?.releaseAll();
  const consoleSummary = testFlightConsole.querySelector("summary");
  const syncConsoleDisclosure = () => {
    consoleSummary?.setAttribute("aria-expanded", String(testFlightConsole.open));
    if (!testFlightConsole.open) releaseConsoleActions();
    // Limits teaching: Systems and Nav are diagnostic — never both open.
    if (testFlightConsole.open && navConsole?.open) navConsole.open = false;
  };
  consoleSummary?.addEventListener("click", (event) => {
    event.preventDefault();
    // Some engines apply the native <details> toggle before click listeners run. The mirrored
    // accessibility state records the pre-activation intent, so it is the stable source here.
    testFlightConsole.open = consoleSummary.getAttribute("aria-expanded") !== "true";
    syncConsoleDisclosure();
  });
  window.addEventListener("pointerup", finishPointer);
  window.addEventListener("pointercancel", finishPointer);
  window.addEventListener("blur", releaseConsoleActions);
  window.addEventListener("pagehide", releaseConsoleActions);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) releaseConsoleActions();
  });
  testFlightConsole.addEventListener("toggle", syncConsoleDisclosure);

  // Preserve scarce phone screen area until the pilot explicitly opens test instrumentation.
  if (mobileControls || window.innerWidth <= 620 || window.innerHeight <= 430) {
    testFlightConsole.open = false;
  }
  syncConsoleDisclosure();
}

function clearFlightInput(reason = "presentation-reset") {
  resetMobileInput();
  releaseAllMappedKeys(reason);
  dragging = false;
  activePointer = null;
  trackpadLookActive = false;
  if (trackpadLookReleaseTimer) window.clearTimeout(trackpadLookReleaseTimer);
  trackpadLookReleaseTimer = 0;
  gimbalReturnFast = true;
  sceneCanvas.classList.remove("dragging");
}

function manualLookActive() {
  return dragging || trackpadLookActive;
}

// Padlock selection remains a presentation decision, but the resulting low-authority hold is a
// fixed-tick simulation control law. Cross the bridge only on semantic state transitions; camera
// pixels and render cadence never become actuator input.
function syncBanditPadlockRollAssist() {
  const selected = padlock && padlockTarget === "bandit"
    && padlockTrackEstablished && !manualLookActive();
  if (!bridge || typeof bridge.SetBanditPadlockRollAssist !== "function"
      || selected === appliedBanditPadlockRollAssist) return;
  bridge.SetBanditPadlockRollAssist(selected);
  appliedBanditPadlockRollAssist = selected;
}

function padlockLabel(target = padlockTarget) {
  if (latestState?.rapier_pattern_only === true) {
    if (target === "carrier") return "THRESHOLD";
    if (target === "wingman") return "TRAFFIC 2";
    if (target === "traffic2") return "TRAFFIC 3";
    if (target === "traffic3") return "TRAFFIC 4";
    return "THRESHOLD";
  }
  return target === "carrier" ? "BOAT" : target === "wingman" ? "WINGMAN" : "BANDIT";
}

/// True when the wave has a second aircraft to look at. Padlock cycles through the contacts that
/// actually exist, so a 1v1 keeps its plain on/off toggle.
function wingmanPadlockAvailable(state = latestState) {
  return state?.w1_present === 1 && state?.w1_alive === 1;
}

function syncPadlockUi(announcement = null) {
  if (touchPadlockButton) {
    touchPadlockButton.classList.toggle("active", padlock);
    touchPadlockButton.setAttribute("aria-pressed", String(padlock));
    touchPadlockButton.setAttribute(
      "aria-label",
      padlock ? `Release ${padlockLabel().toLowerCase()} padlock` : "Padlock target or nearby carrier",
    );
  }
  if (announcement && viewStatus) viewStatus.textContent = announcement;
}

function releasePadlock(reason = "manual", { announce = true, record = true } = {}) {
  if (!padlock) return false;
  const releasedTarget = padlockTarget;
  const releasedEntityId = padlockEntityId;
  padlock = false;
  padlockTarget = "bandit";
  padlockEntityId = "";
  padlockKillCamUntilMs = 0;
  padlockEngagement = null;
  padlockPhase = "RETURN";
  padlockTrackEstablished = false;
  gimbalReturnFast = true;
  syncBanditPadlockRollAssist();
  const message = reason === "manual"
    ? "Padlock off · forward view"
    : reason === "combat task"
      ? "Boat padlock off · V for bandit"
    : `Padlock lost · ${reason}`;
  syncPadlockUi(announce ? message : null);
  if (record) recorder.event("view", "Padlock", {
    selected: false,
    target: releasedTarget,
    entity_id: releasedEntityId,
    reason,
  });
  return true;
}

function resetMissionPresentation() {
  frameGovernor.reset(activeView);
  terrainLaunchWarmupFailedKey = null;
  clearFlightInput("mission-reset");
  incidentReplay?.stop();
  renderIncidentReplay(null);
  if (padlock) releasePadlock("mission reset", { announce: false, record: false });
  else syncPadlockUi();
  sensorYaw = 0;
  sensorPitch = 0;
  padlockPhase = "OFF";
  padlockTrackEstablished = false;
  appliedBanditPadlockRollAssist = null;
  syncBanditPadlockRollAssist();
  gimbalReturnFast = false;
  activeView?.cancelCloudBreakEntry();
  activeView?.hud.setLegendVisible?.(false);
}

/// Point the padlock at `target` without passing through the forward view. Used both by V when it
/// first acquires and by Tab when it swaps contacts mid-fight.
function acquirePadlock(target, reason) {
  padlock = true;
  padlockTarget = target;
  padlockEntityId = target === "carrier" ? "carrier"
    : target === "traffic2" ? "traffic2"
    : target === "traffic3" ? "traffic3"
    : target === "wingman"
      ? `${projectedId(latestState?.bandit_entity_id)}.wingman`
      : projectedId(latestState?.bandit_entity_id);
  padlockPhase = manualLookActive() ? "SLEW" : "ACQUIRE";
  padlockTrackEstablished = false;
  gimbalReturnFast = false;
  padlockKillCamUntilMs = 0;
  padlockEngagement = Number(latestState?.engagement_number);
  syncBanditPadlockRollAssist();
  syncPadlockUi(`${padlockLabel()} padlock on`);
  recorder.event("view", "Padlock", {
    selected: true,
    target: padlockTarget,
    entity_id: padlockEntityId,
    reason,
  });
}

/// The contact to jump to when the padlocked one dies: whichever of the pair is still fighting.
function survivingPadlockTarget(state) {
  if (padlockTarget !== "wingman" && wingmanPadlockAvailable(state)) return "wingman";
  if (padlockTarget !== "bandit" && padlockTargetValid(state, "bandit")) return "bandit";
  return null;
}

/// Is `target` converting on the player right now? Pure geometry off the hot frame — position and
/// the body forward axis, both in the kernel's east/up/north frame, which is why nothing here
/// negates Z the way the renderer does.
function contactThreateningPlayer(state, target) {
  const prefix = target === "wingman" ? "w1" : "b";
  const toPlayerX = Number(state.px) - Number(state[`${prefix}x`]);
  const toPlayerY = Number(state.py) - Number(state[`${prefix}y`]);
  const toPlayerZ = Number(state.pz) - Number(state[`${prefix}z`]);
  const rangeM = Math.hypot(toPlayerX, toPlayerY, toPlayerZ);
  if (!Number.isFinite(rangeM) || rangeM <= 0
    || rangeM > PADLOCK_KILL_CAM_THREAT_RANGE_M) return false;
  const noseAlignment = (
    Number(state[`${prefix}fx`]) * toPlayerX
    + Number(state[`${prefix}fy`]) * toPlayerY
    + Number(state[`${prefix}fz`]) * toPlayerZ
  ) / rangeM;
  return Number.isFinite(noseAlignment) && noseAlignment >= PADLOCK_KILL_CAM_THREAT_COS;
}

/// The contact V should acquire from cold: whatever the situation makes obvious, except that a
/// just-shot leader still occupying the primary slot hands off to the survivor.
function defaultPadlockTarget() {
  const target = contextualPadlockTarget(latestState);
  // The pilot shot the leader down and pressed V expecting to look at the survivor — "he should
  // still be there", and he is. The primary slot holds the DEAD leader until promotion fires a
  // couple of seconds later, and a dead aircraft is not padlock-eligible, so acquisition used to
  // silently fail in exactly the moment the pilot most wants to find the other one.
  if (target === "bandit" && !padlockTargetValid(latestState, "bandit")
      && wingmanPadlockAvailable()) {
    return "wingman";
  }
  return target;
}

/// TAB — swap which contact the padlock holds, WITHOUT letting go of it. Cycling used to be folded
/// into V, which meant the only way from one bandit to the other was through the forward view: the
/// pilot lost sight of both aircraft for the two seconds the gimbal took to centre and come back.
/// In a 1v2 that is the whole fight. V is now purely "am I padlocked", Tab is purely "at whom".
function cyclePadlockTarget() {
  if (!padlock) {
    acquirePadlock(defaultPadlockTarget(), "cycle");
    return;
  }
  if (latestState?.rapier_pattern_only === true) {
    const order = circuitsPadlockTargets(latestState);
    if (order.length < 2) {
      syncPadlockUi(`${padlockLabel()} padlock · no other traffic`);
      return;
    }
    const index = Math.max(0, order.indexOf(padlockTarget));
    acquirePadlock(order[(index + 1) % order.length], "cycle");
    return;
  }
  if (!wingmanPadlockAvailable()) {
    // Nothing to cycle to. Say so rather than silently doing nothing to a pressed key.
    syncPadlockUi(`${padlockLabel()} padlock · no other contact`);
    return;
  }
  acquirePadlock(padlockTarget === "bandit" ? "wingman" : "bandit", "cycle");
}

/// V — padlock on or off. It keeps the contact Tab last selected, so V is a view toggle and
/// nothing else.
function togglePadlock() {
  if (padlock) {
    releasePadlock("manual");
    return;
  }
  padlock = true;
  padlockTarget = defaultPadlockTarget();
  padlockEntityId = padlockTarget === "carrier" ? "carrier"
    : padlockTarget === "traffic2" ? "traffic2"
    : padlockTarget === "traffic3" ? "traffic3"
    : padlockTarget === "wingman"
      ? `${projectedId(latestState?.bandit_entity_id)}.wingman`
      : projectedId(latestState?.bandit_entity_id);
  padlockPhase = manualLookActive() ? "SLEW" : "ACQUIRE";
  padlockTrackEstablished = false;
  gimbalReturnFast = false;
  syncBanditPadlockRollAssist();
  syncPadlockUi(`${padlockLabel()} padlock on`);
  recorder.event("view", "Padlock", {
    selected: true,
    target: padlockTarget,
    entity_id: padlockEntityId,
    reason: "manual",
  });
}

function missionBrief() {
  return CAMPAIGN_BRIEFS[selectedProgramNodeId]
    || MISSION_BRIEFS[selectedBeat] || CAMPAIGN_BRIEFS["first-merge"];
}

function healthPercent(value) {
  const health = Number(value);
  return Math.round(clamp(Number.isFinite(health) ? health : 1, 0, 1) * 100);
}

function signedReplayTime(seconds) {
  const value = Number(seconds) || 0;
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)} s`;
}

function renderIncidentReplay(frame) {
  const clip = incidentReplay?.clip;
  const active = Boolean(frame && clip);
  document.documentElement.classList.toggle("incident-replay", active);
  incidentReplayOverlay?.classList.toggle("visible", active);
  incidentReplayOverlay?.setAttribute("aria-hidden", String(!active));
  if (!active) return;

  const analysis = clip.analysis;
  const playbackRate = incidentReplay.playbackRate;
  if (incidentReplayTitle) incidentReplayTitle.textContent = `REPLAY · ${incidentReplay.camera}`;
  incidentReplayTime.textContent = `${signedReplayTime(frame.t)} · ${playbackRate.toFixed(2).replace(/\.00$/, "").replace(/0$/, "")}×${incidentReplay.paused ? " · PAUSED" : ""}`;
  incidentReplayMetrics.textContent = [
    `${Math.round(frame.kias)} KIAS`,
    `G/S ${Math.round(frame.gsKts)} KT`,
    `SINK ${Math.round(frame.sinkFpm)} FPM`,
    `AOA ${frame.aoaDeg.toFixed(1)}°`,
    `PWR ${Math.round(frame.throttleCommand * 100)}% / ENG ${Math.round(frame.enginePower * 100)}%`,
    `γ ${frame.gammaDeg.toFixed(1)}° · ${frame.nz.toFixed(1)} G`,
    `CLOSURE ${Math.round(frame.closureKts)} KT`,
    `X ${frame.deckCrossM.toFixed(1)} M · H ${frame.deckHeightM.toFixed(1)} M`,
    `CTRL ${frame.gDemand.toFixed(1)} G · BANK ${frame.bankTargetDeg.toFixed(0)}° · RUD ${frame.rudder.toFixed(1)}`,
    `GEAR N/L/R ${Math.round(frame.gearNose * 100)}/${Math.round(frame.gearLeft * 100)}/${Math.round(frame.gearRight * 100)}% · ${incidentReplayLabels.gearIndication(frame.gearNoseIndication)}/${incidentReplayLabels.gearIndication(frame.gearLeftIndication)}/${incidentReplayLabels.gearIndication(frame.gearRightIndication)}`,
    `FLAP L/R ${frame.flapLeftDeg.toFixed(0)}°/${frame.flapRightDeg.toFixed(0)}° ${incidentReplayLabels.flapLever(frame.flapLever)}`,
    `HOOK ${incidentReplayLabels.hook(frame.hook)}${frame.wire > 0 ? ` · WIRE ${Math.round(frame.wire)}` : ""}`,
    frame.arrestFailureReason > 0
      ? `ARREST ${incidentReplayLabels.arrestmentFailure(frame.arrestFailureReason)} · ${frame.arrestAbsorbedEnergyMj.toFixed(2)}/${frame.arrestInitialEnergyMj.toFixed(2)} MJ · REM ${frame.arrestRemainingEnergyMj.toFixed(2)} MJ · LOAD ${frame.arrestPeakLoadKn.toFixed(0)}/${frame.arrestMaxLineLoadKn.toFixed(0)} KN`
      : null,
  ].filter(Boolean).join("  ·  ");
  const eventSurface = frame.eventSurface || frame.surface;
  const carrierSolid = incidentReplayLabels.carrierSolid(frame.carrierSolid);
  incidentReplayEvent.textContent = frame.eventSequence > 0
    ? `${incidentReplayLabels.event(frame.eventType)} · ${incidentReplayLabels.surface(eventSurface)}${carrierSolid !== "NONE" ? ` · LAST CARRIER CONTACT ${carrierSolid}` : ""} · ${incidentReplayLabels.terminal(frame.terminal)}`
    : "RECORDED APPROACH · NO TERMINAL EVENT YET";
  const touchdown = analysis.touchdownAssessment;
  const grade = touchdown.grade === "NONE" ? "NO TOUCHDOWN GRADE" : touchdown.grade;
  const deviations = touchdown.deviations.length > 0
    ? touchdown.deviations.join(" | ") : "NO RECORDED DEVIATIONS";
  const passGrade = String(latestState?.carrier_pass_grade || "NONE").replaceAll("_", " ");
  const passPhases = String(latestState?.carrier_pass_phase_summary || "").replaceAll("_", " ");
  const passCorrection = String(latestState?.carrier_pass_primary_correction || "NONE")
    .replaceAll("_", " ");
  const waveOff = latestState?.carrier_pass_waveoff_required === true
    ? latestState?.carrier_pass_waveoff_complied === true
      ? "WAVE-OFF COMPLIED" : "WAVE-OFF NOT COMPLIED"
    : null;
  incidentReplayOutcome.textContent = `PHYSICAL OUTCOME · ${analysis.physicalOutcome}`;
  incidentReplayGrade.textContent = [
    `FULL-PASS GRADE · ${passGrade}`,
    waveOff,
    passPhases || null,
    passCorrection !== "NONE" ? `FULL-PASS PRIMARY · ${passCorrection}` : null,
    `TOUCHDOWN ASSESSMENT · ${grade} · ${deviations} · PRIMARY ${touchdown.primaryCorrection}`,
    `${touchdown.profile} v${touchdown.version}`,
  ].filter(Boolean).join("  ·  ");
  incidentReplayCause.textContent = `CAUSAL CHAIN · ${analysis.causalChain.slice(0, 2).join(" → ")}`;
  incidentReplayCorrection.textContent = `MARKED DECISION · ${analysis.correction}`;
  const progress = clamp((frame.t - clip.startTime) / Math.max(clip.duration, 1e-9), 0, 1);
  const decision = clamp((analysis.decisionTime - clip.startTime)
    / Math.max(clip.duration, 1e-9), 0, 1);
  incidentReplayProgress.style.width = `${progress * 100}%`;
  incidentReplayDecision.style.left = `${decision * 100}%`;
  incidentReplayDecision.dataset.reached = String(frame.t >= analysis.decisionTime);
  if (incidentReplayScrubber) incidentReplayScrubber.value = String(Math.round(progress * 1000));
  if (incidentReplayPlay) incidentReplayPlay.textContent = incidentReplay.paused ? "Play" : "Pause";
  if (incidentReplayRate) incidentReplayRate.value = String(playbackRate);
  if (incidentReplayCamera) incidentReplayCamera.value = incidentReplay.camera;
}

function renderCampaignProgress() {
  // Every mission is always available. No counter, locks or status chips: the menu's whole job is
  // to let the pilot pick an aircraft and environment, then go.
  if (readyProgramProgress) readyProgramProgress.textContent = "";
  for (const button of readyProgramButtons) {
    const nodeId = button.dataset.programNode;
    const selected = nodeId === selectedProgramNodeId;
    button.disabled = false;
    button.setAttribute("aria-pressed", String(selected));
    button.closest(".sortie-option")?.setAttribute("data-selected", String(selected));
    button.closest(".sortie-option")?.setAttribute("data-program-state", "available");
    if (selected) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  }
  for (const status of readyProgramStatuses) status.textContent = "";
  if (readyDeckConfig) readyDeckConfig.hidden = true;
  renderCircuitsPreflight(missionBrief());
  for (const button of readyDeckButtons) {
    button.setAttribute("aria-pressed", String(
      Number(button.dataset.deckConfiguration) === selectedDeckConfiguration,
    ));
  }
}

function readyScreenFocusables() {
  return [...readyScreen.querySelectorAll(
    'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.closest("[hidden]"));
}

function focusReadyScreen() {
  if (!readyScreen.classList.contains("visible")) return;
  const selectedMission = readyScreen.querySelector(
    `[data-program-node="${selectedProgramNodeId}"]`,
  );
  // Keep Enter-to-fly honest: when the primary action is available it owns initial focus. During
  // release verification the selected card is the safe focusable fallback, never a disabled button.
  const target = !readyStart.disabled ? readyStart : selectedMission;
  target?.focus({ preventScroll: true });
}

function droneRaidDebriefFacts(state) {
  const score = Math.round(Number(state?.drone_raid_score) || 0);
  const maximum = Math.round(Number(state?.drone_raid_max_score) || 100);
  const kills = Math.max(0, Math.round(Number(state?.drone_raid_kills) || 0));
  const leakers = Math.max(0, Math.round(Number(state?.drone_raid_leakers) || 0));
  const roundsPerKill = Number(state?.drone_raid_rounds_per_kill);
  const facts = [`Raid score ${score}/${maximum}`, `${kills} down`];
  if (leakers > 0) facts.push(`${leakers} leaker${leakers === 1 ? "" : "s"}`);
  if (kills > 0 && Number.isFinite(roundsPerKill))
    facts.push(`${roundsPerKill.toFixed(1)} rounds/kill`);
  return facts.join(" · ");
}

function carrierQualificationDebriefFacts(state) {
  const recovery = String(state?.recovery || "").toUpperCase();
  const touchdownGrade = String(state?.touchdown_grade || "UNASSESSED")
    .replaceAll("_", " ")
    .replaceAll("HARDSINKRATE", "HARD SINK RATE");
  const touchdownCorrection = String(state?.touchdown_primary_correction || "NONE")
    .replaceAll("_", " ");
  const passGrade = String(state?.carrier_pass_grade || "UNASSESSED")
    .replaceAll("_", " ");
  const passCorrection = String(state?.carrier_pass_primary_correction || "NONE")
    .replaceAll("_", " ");
  const phases = String(state?.carrier_pass_phase_summary || "")
    .replaceAll("_", " ");
  const waveOff = state?.carrier_pass_waveoff_required === true
    ? state?.carrier_pass_waveoff_complied === true
      ? "wave-off complied" : "wave-off not complied"
    : "";
  const wire = Math.max(0, Math.round(Number(state?.wire) || 0));
  let touchdown;
  if (recovery === "TRAP" || String(state?.arrest_phase || "").toUpperCase() === "STOPPED") {
    touchdown = [touchdownGrade === "NONE" ? "not assessed" : touchdownGrade,
      wire > 0 ? `wire ${wire}` : "wire caught"].join(" · ");
  } else if (state?.bolter === true || recovery === "BOLTER") {
    touchdown = [touchdownGrade === "NONE" ? "not assessed" : touchdownGrade,
      "no wire"].join(" · ");
  } else touchdown = touchdownGrade === "NONE" ? "not assessed" : touchdownGrade;
  return Object.freeze({
    passGrade: passGrade === "NONE" ? "NOT ASSESSED" : passGrade,
    phases,
    waveOff,
    passCorrection: passCorrection === "NONE" ? "none recorded" : passCorrection,
    touchdown,
    touchdownCorrection: touchdownCorrection === "NONE"
      ? "none recorded" : touchdownCorrection,
  });
}

function carrierQualificationPhysicalOutcome(state) {
  const recovery = String(state?.recovery || "").toUpperCase().replaceAll("_", "");
  const surface = String(state?.player_impact_surface || "").toUpperCase();
  if (state?.bolter === true || recovery === "BOLTER") return "Bolter";
  if (recovery === "TRAP" || String(state?.arrest_phase || "").toUpperCase() === "STOPPED")
    return "Recovered";
  if (recovery === "INTHEWATER" || surface === "WATER") return "In the water";
  if (recovery === "RAMPSTRIKE") return "Ramp strike";
  if (surface === "CARRIER_STRUCTURE") return "Carrier structure impact";
  if (surface === "FLIGHT_DECK") return "Flight deck impact";
  if (surface === "SIMULATION_BOUNDARY") return "Simulation boundary";
  return "Attempt complete";
}

function isCarrierQualificationState(state) {
  return state?.carrier === true
    && [
      "mission.carrier-qualification.v1",
      "mission.modern.f35c.carrier-conversion.public-data-surrogate.v1",
    ].includes(String(state?.mission_definition_id || "").toLowerCase());
}

function recordCampaignQualification(state) {
  const result = qualifyCampaignNode(campaignProfile, selectedProgramNodeId, state);
  if (!result.newlyQualified) return false;
  campaignProfile = saveCampaignProfile(result.profile);
  renderCampaignProgress();
  recorder.event("progression", "qualification_earned", {
    node: selectedProgramNodeId,
    mission: selectedBeat,
  });
  return true;
}

function renderPauseUi(state = latestState) {
  const ready = pauseReasons.has("ready");
  const finished = pauseReasons.has("finished");
  const help = pauseReasons.has("help");
  const calibrating = pauseReasons.has("calibration");
  const terrainLoading = pauseReasons.has("terrain");
  const background = pauseReasons.has("background");
  const sessionPaused = pauseReasons.has("session");
  const settingsPaused = pauseReasons.has("settings");
  const showScreen = !help && !calibrating
    && (ready || finished || background || sessionPaused || settingsPaused);
  const brief = missionBrief();
  const wasScreenVisible = readyScreen.classList.contains("visible");
  const startWasDisabled = readyStart.disabled;

  readyScreen.dataset.mode = ready ? "program" : finished ? "debrief" : "pause";
  if (readySelector) readySelector.hidden = !ready;
  if (readyDeckConfig && !ready) readyDeckConfig.hidden = true;
  if (readyCircuitsPreflight && !ready) readyCircuitsPreflight.hidden = true;
  if (ready) renderCampaignProgress();
  if (readyMenuTitle) {
    readyMenuTitle.textContent = ready
      ? "Pick an aircraft" : finished ? "Sortie complete" : "Flight paused";
  }
  if (readyMenuHelp) {
    readyMenuHelp.textContent = (ready
      ? "Both are available. Fly whichever you feel like."
      : finished
        ? "Review the result, or go again."
        : "The deterministic flight clock is stopped and all controls are neutralised.")
      + (ready ? iosFullscreenHint : "");
  }

  document.documentElement.classList.toggle("run-paused", pauseReasons.size > 0);
  sceneCanvas.inert = showScreen;
  touchControls.inert = showScreen;
  if (testFlightConsole) testFlightConsole.inert = showScreen;
  if (!showScreen && wasScreenVisible && readyScreen.contains(document.activeElement)) {
    const focusOwner = calibrating
      ? tiltPrompt?.querySelector("button:not([disabled])")
      : sceneCanvas;
    focusOwner?.focus({ preventScroll: true });
  }
  readyScreen.classList.toggle("visible", showScreen);
  readyScreen.setAttribute("aria-hidden", String(!showScreen));
  if (readySettings) readySettings.hidden = !showScreen;
  if (readyRestart) {
    readyRestart.hidden = ready;
    readyRestart.textContent = finished ? "Fly again" : "Restart sortie";
  }
  if (readyReturn) {
    readyReturn.hidden = ready;
    readyReturn.textContent = "Mission program";
  }

  if (finished) {
    const result = sortieResultCopy(state);
    const replayAnalysis = incidentReplay?.clip?.analysis;
    const carrierQualification = isCarrierQualificationState(state);
    const carrierFacts = carrierQualification
      ? carrierQualificationDebriefFacts(state) : null;
    const ledgerMission = String(state?.mission_definition_id || "").toLowerCase();
    const ledgerIsRapier = ledgerMission.includes("rapier");
    const ledgerNet = Math.trunc(Number(state?.points_sortie_net) || 0);
    const ledgerApplyKey = [
      ledgerMission,
      String(state?.sortie_outcome || ""),
      String(ledgerNet),
    ].join("|");
    const ledgerAlreadyApplied = ledgerApplyKey === pointsLedgerAppliedKey;
    const ledgerBalanceBefore = ledgerAlreadyApplied
      ? Math.trunc(Number(campaignProfile.pointsBalance) || 0) - ledgerNet
      : Math.trunc(Number(campaignProfile.pointsBalance) || 0);
    const ledger = pointsLedgerPresentation(state, ledgerBalanceBefore);
    if (ledger && ledgerIsRapier && !ledgerAlreadyApplied) {
      pointsLedgerAppliedKey = ledgerApplyKey;
      campaignProfile = saveCampaignProfile({
        ...campaignProfile,
        pointsBalance: ledger.balanceAfter,
      });
    }
    readyKicker.textContent = ledger?.kicker || result.kicker;
    readyTitle.textContent = result.title;
    readyBrief.textContent = replayAnalysis
      ? `${result.brief} ${replayAnalysis.physicalOutcome}. Next pass: ${replayAnalysis.correction}`
      : ledger
        ? `${result.brief} ${ledger.clearanceText}.`
        : result.brief;
    if (readySortieLabel) readySortieLabel.textContent = carrierQualification
      ? "Physical outcome" : "Sortie";
    if (readyConfigLabel) readyConfigLabel.textContent = carrierQualification
      ? "Full-pass assessment" : ledger ? "Allocation" : "Result";
    readySortie.textContent = carrierQualification
      ? `${carrierQualificationPhysicalOutcome(state)}${Number(state?.wire) > 0 ? ` · wire ${Math.round(Number(state.wire))}` : ""}`
      : `${brief.title} · ${String(state?.sortie_outcome || "complete").toLowerCase()}`;
    readyConfig.textContent = state?.maintenance_scenario === true
      ? `Procedure ${Math.round(Number(state?.maintenance_score) || 0)}/${Math.round(Number(state?.maintenance_max_score) || 100)} · ${Math.round(Number(state?.maintenance_demerits) || 0)} demerits`
      : state?.drone_raid_evaluation === true
        ? droneRaidDebriefFacts(state)
        : state?.visual_merge_evaluation === true
          ? `Decision score ${Math.round(Number(state?.visual_merge_score) || 0)}/100 · rear-quarter dwell ${(Number(state?.rear_quarter_dwell_s) || 0).toFixed(1)} s · ${Math.round(Number(state?.evaluated_projectile_hits) || 0)} projectile hits`
          : carrierQualification
            ? [carrierFacts.passGrade, carrierFacts.waveOff, carrierFacts.phases]
              .filter(Boolean).join(" · ")
            : ledger
              ? `${ledger.netText} · ${ledger.balanceText} · ${ledger.clearanceText}`
              : replayAnalysis
              ? `Sim touchdown ${replayAnalysis.touchdownAssessment.grade === "NONE" ? "not graded" : replayAnalysis.touchdownAssessment.grade} · ${replayAnalysis.touchdownAssessment.profile} v${replayAnalysis.touchdownAssessment.version} · replay cached · causal review is not an LSO grade`
              : `Airframe ${healthPercent(state?.player_health)}% · opponent ${healthPercent(state?.opponent_health)}%`;
    readyReplay.hidden = !incidentReplay?.clip;
    // No qualification, so the debrief offers the only two things that make sense: go again, or
    // pick the other aircraft.
    readyStart.textContent = "Fly again";
    if (readyControls) readyControls.textContent = carrierQualification
      ? `Full-pass primary · ${carrierFacts.passCorrection}\nTouchdown assessment · ${carrierFacts.touchdown}\nTouchdown primary · ${carrierFacts.touchdownCorrection}`
      : ledger
        ? `${ledger.lines.map((line) => `${line.label} · ${line.pointsText}`).join("\n") || "No lines"}\n${ledger.clearanceText}`
        : "Fly again, or open the mission list to take the other aircraft up";
    readyHint.textContent = background
      ? "Return to the game to restage"
      : ledger?.clearance === "GROUNDED"
        ? "Exception denied · grounded pending allocation — Press Enter to fly again"
        : "Press Enter to fly again";
  } else if (ready) {
    if (readySortieLabel) readySortieLabel.textContent = "Sortie";
    if (readyConfigLabel) readyConfigLabel.textContent = "Configuration";
    readyReplay.hidden = true;
    readyKicker.textContent = brief.kicker;
    readyTitle.textContent = brief.title;
    readyBrief.textContent = brief.brief;
    readySortie.textContent = brief.sortie;
    readyConfig.textContent = selectedBeat === 5
      ? "F-35C reduced-order public-data surrogate · recovery only · angled deck"
      : selectedBeat === 6
        ? "Maintenance profile · axial deck"
        : brief.configuration || "Guns hot · air start";
    if (readyControls) readyControls.textContent = brief.controls
      || "Arrows fly · W/S power · F guns · V padlock · Tab target\nH opens controls · R restarts";
    readyStart.textContent = `Fly ${brief.title}`;
    readyHint.textContent = background ? "Return to the game to fly" : "Press Enter to fly";
  } else {
    if (readySortieLabel) readySortieLabel.textContent = "Sortie";
    if (readyConfigLabel) readyConfigLabel.textContent = "Status";
    readyReplay.hidden = true;
    readyKicker.textContent = "Simulation paused";
    readyTitle.textContent = "Hold Position";
    readyBrief.textContent = "The deterministic flight clock is stopped. No aircraft, weapons, fuel, or carrier state advances while the sortie is paused.";
    readySortie.textContent = brief.title;
    readyConfig.textContent = "Inputs neutralised";
    if (readyControls) readyControls.textContent = "Press Enter to resume · R restages the selected sortie";
    readyStart.textContent = "Resume flight";
    readyHint.textContent = "Press Enter to resume";
  }

  renderBuildIdentity();
  if (buildIdentity.stale) {
    readyHint.textContent = "Older or mixed build detected · reload the current release";
  } else if (buildIdentity.state === "checking" && ready) {
    readyHint.textContent = "Verifying current release…";
  } else if (terrainLoading && ready) {
    readyHint.textContent = "Loading nearby terrain and low-level scenery…";
  }

  // Ready cannot be dismissed while another safety interlock is still active. The relevant
  // prompt (controls or tilt calibration) owns the screen until its own reason clears.
  const blockers = [...pauseReasons].filter((reason) =>
    reason !== "ready" && reason !== "finished"
      && reason !== "background" && reason !== "session");
  readyStart.disabled = buildIdentityBlocksSortie()
    || blockers.length > 0 || ((ready || finished) && background);

  if (showScreen && !settingsPaused && !wasScreenVisible) queueMicrotask(focusReadyScreen);
  else if (showScreen && !settingsPaused && startWasDisabled && !readyStart.disabled)
    queueMicrotask(focusReadyScreen);
}

function applyBridgePause() {
  const shouldPause = pauseReasons.size > 0;
  if (!bridge || bridgePauseApplied === shouldPause) return;
  bridge.SetPaused(shouldPause);
  bridgePauseApplied = shouldPause;
}

function setPauseReason(reason, active) {
  const wasPaused = pauseReasons.size > 0;
  if (active) pauseReasons.add(reason);
  else pauseReasons.delete(reason);
  const paused = pauseReasons.size > 0;
  if (active) clearFlightInput(`pause:${reason}`);
  applyBridgePause();
  renderPauseUi();
  if (wasPaused && !paused) resetFrameClock();
  queueMicrotask(tryAutoLaunch);
}

function enterReady({ resetBridge = true, focus = true } = {}) {
  const preserveCalibration = pauseReasons.has("calibration");
  const preserveBackground = pauseReasons.has("background");
  if (resetBridge) recorder.endSortie("restaged", latestState);
  pointsLedgerAppliedKey = "";
  resetMissionPresentation();
  pauseReasons.clear();
  pauseReasons.add("ready");
  if (preserveCalibration) pauseReasons.add("calibration");
  if (preserveBackground) pauseReasons.add("background");
  if (resetBridge && bridge) {
    if ([5, 6].includes(selectedBeat)
      && bridge.GetDeckConfiguration() !== selectedDeckConfiguration) {
      bridge.SetDeckConfiguration(selectedDeckConfiguration);
    }
    // Respawning into the SAME gauntlet keeps the fight director's pacing memory: a pilot who
    // fought their way up to Ace and died must not be sent back to the Novice warm-up. StartBeat
    // resets that memory (correct when picking a mission), so prefer RestartSortie when the staged
    // mission is unchanged and fall back only when it actually differs.
    const sameSortie = stagedBeat === selectedBeat
      && stagedDeckConfiguration === selectedDeckConfiguration
      && bridge.RestartSortie?.(selectedBeat);
    if (!sameSortie) {
      bridge.StartBeat(selectedBeat);
      // StartBeat resets the director by design (picking a mission is not a respawn), so the
      // persisted estimate has to be reapplied AFTER it.
      restoreDirectorState();
    }
    stagedBeat = selectedBeat;
    stagedDeckConfiguration = selectedDeckConfiguration;
    recorder.event("lifecycle", "sortie_staged", {
      mission: selectedBeat,
      deck_configuration: selectedDeckConfiguration === 1 ? "ANGLED" : "AXIAL",
    });
  }
  if ([5, 6].includes(selectedBeat)) activeView?.clearRemotePlayers();
  bridgePauseApplied = true; // StartBeat is an authoritative transition to Ready.
  renderPauseUi();
  resetFrameClock();
  if (focus) queueMicrotask(focusReadyScreen);
}

function selectCampaignNode(nodeId, { focus = true } = {}) {
  const node = campaignNode(nodeId);
  if (!node || !campaignNodeUnlocked(campaignProfile, node.id)) return false;
  const previous = selectedProgramNodeId;
  selectedProgramNodeId = node.id;
  selectedBeat = node.mission;
  selectedDeckConfiguration = selectedBeat === 5 ? 1 : selectedDeckConfiguration;
  const missionUrl = new URL(window.location.href);
  missionUrl.searchParams.delete("mission");
  missionUrl.searchParams.set("program", selectedProgramNodeId);
  window.history.replaceState(window.history.state, "", missionUrl);
  recorder.event("ui", "program_node_previewed", {
    node: selectedProgramNodeId,
    mission: selectedBeat,
    previous_node: previous,
  });
  renderPauseUi();
  if (focus) queueMicrotask(focusReadyScreen);
  return true;
}

function launchMission(index = selectedBeat) {
  if (Number(index) !== selectedBeat) return false;
  const deckChanged = [5, 6].includes(selectedBeat)
    && stagedDeckConfiguration !== selectedDeckConfiguration;
  if (!pauseReasons.has("ready") || stagedBeat !== selectedBeat || deckChanged) {
    enterReady({ resetBridge: true, focus: false });
  }
  if (prepareMissionTerrain(index)) {
    autoLaunchPending = true;
    return false;
  }
  activeView?.hud.armAudio();
  return beginFlight();
}

function restartMission() {
  enterReady();
}

function restartMissionNow() {
  enterReady();
  return launchMission(selectedBeat);
}

function returnToCatalogue() {
  enterReady();
  return true;
}

function tryAutoLaunch() {
  if (!autoLaunchPending || !bridge || !pauseReasons.has("ready")
    || buildIdentityBlocksSortie()) return false;
  const blockers = [...pauseReasons].filter((reason) => reason !== "ready");
  if (blockers.length) return false;
  autoLaunchPending = false;
  return launchMission(selectedBeat);
}

function terrainWarmupKey(state) {
  if (state?.terrain_present !== true || !state?.terrain_profile_id) return null;
  const eastM = Number(state.terrain_placement_east_m) || 0;
  const northM = Number(state.terrain_placement_north_m) || 0;
  return [
    state.terrain_profile_id,
    eastM.toFixed(1),
    northM.toFixed(1),
    state.terrain_micro_required === true ? "micro" : "macro",
  ].join(":");
}

function terrainDiagnosticsCoverStagedAircraft(terrain, state) {
  if (terrain?.terrainId !== state?.terrain_profile_id) return false;
  const expectedEastM = Number(state?.terrain_placement_east_m) || 0;
  const expectedNorthM = Number(state?.terrain_placement_north_m) || 0;
  if (Number.isFinite(Number(terrain?.placementEastM))
      && Math.abs(Number(terrain.placementEastM) - expectedEastM) > 0.5) return false;
  if (Number.isFinite(Number(terrain?.placementNorthM))
      && Math.abs(Number(terrain.placementNorthM) - expectedNorthM) > 0.5) return false;
  const residentChunks = Number.isFinite(Number(terrain?.localResidentChunks))
    ? Number(terrain.localResidentChunks) : Number(terrain?.residentChunks);
  if (residentChunks <= 0) return false;
  if (state?.terrain_micro_required !== true) return true;
  const sceneryChunks = Number.isFinite(Number(terrain?.localSceneryChunks))
    ? Number(terrain.localSceneryChunks) : Number(terrain?.sceneryChunks);
  return terrain?.sceneryEra === state?.terrain_scenery_profile
    && terrain?.ambientSceneryEnabled !== false
    && sceneryChunks > 0;
}

function missionTerrainReady(state) {
  if (state?.terrain_present !== true) return true;
  const terrain = activeView?.presentationDiagnostics?.().terrain;
  return terrainDiagnosticsCoverStagedAircraft(terrain, state);
}

async function warmTerrainAroundReadyAircraft(terrain, state, view) {
  if (!terrain) return false;
  await terrain.ready;
  // The paused render loop positions the camera from the staged aircraft and requests its near
  // LODs. Give it two frames to enqueue that work, then wait for both geometry and instanced
  // scenery to settle before releasing the deterministic flight clock.
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await terrain.whenIdle?.();
  const diagnostics = terrain.diagnostics?.();
  if (!terrainDiagnosticsCoverStagedAircraft(diagnostics, state)) return false;
  view?.applyTerrainFlightPolicy?.();
  return true;
}

function prepareMissionTerrain(index) {
  const stagedState = snapshotSource?.frame?.(performance.now());
  const terrainKey = stagedState?.terrain_present === true
    ? stagedState?.terrain_profile_id : null;
  const warmupKey = terrainWarmupKey(stagedState);
  activeView?.configureTerrainMission?.(stagedState);
  if (!terrainKey || missionTerrainReady(stagedState)) {
    activeView?.applyTerrainFlightPolicy?.();
    return false;
  }
  if (terrainLaunchWarmupFailedKey === warmupKey) return false;
  if (terrainLaunchWarmupPromise) return true;
  if (!activeView || !stagedState) return false;

  setPauseReason("terrain", true);
  if (viewStatus) {
    viewStatus.textContent = stagedState.terrain_micro_required === true
      ? "Loading low-level terrain and scenery…"
      : "Loading Ukraine theatre terrain…";
  }
  const warmupView = activeView;
  const work = Promise.resolve(warmupView.ensureTerrainPresentation(stagedState))
    .then((terrain) => warmTerrainAroundReadyAircraft(terrain, stagedState, warmupView))
    .catch(() => false);
  let deadlineTimer = 0;
  const deadline = new Promise((resolve) => {
    deadlineTimer = window.setTimeout(() => {
      warmupView.cancelTerrainPresentationRequest(terrainKey);
      resolve(false);
    }, 15_000);
  });
  terrainLaunchWarmupPromise = Promise.race([work, deadline]).then((ready) => {
    if (!ready) {
      terrainLaunchWarmupFailedKey = warmupKey;
      if (viewStatus) {
        viewStatus.textContent = "Detailed terrain unavailable · presentation fallback active";
      }
    } else {
      terrainLaunchWarmupFailedKey = null;
    }
  }).finally(() => {
    if (deadlineTimer) window.clearTimeout(deadlineTimer);
    terrainLaunchWarmupPromise = null;
    if (selectedBeat === Number(index)) {
      setPauseReason("terrain", false);
    } else {
      pauseReasons.delete("terrain");
      autoLaunchPending = false;
      applyBridgePause();
      renderPauseUi();
    }
  });
  return true;
}

function toggleSessionPause() {
  if (settingsScreen?.classList.contains("visible")) return closeSettings();
  if (incidentReplay?.active) return false;
  if (pauseReasons.has("ready") || pauseReasons.has("finished")) return false;
  if (pauseReasons.has("session")) {
    setPauseReason("session", false);
    return true;
  }
  if (pauseReasons.has("help")) {
    activeView?.hud.setLegendVisible(false);
    setPauseReason("help", false);
    return true;
  }
  setPauseReason("session", true);
  return true;
}

function selectDeckConfiguration(value) {
  if (![5, 6].includes(selectedBeat) || !pauseReasons.has("ready")) return false;
  selectedDeckConfiguration = Number(value) === 1 ? 1 : 0;
  recorder.event("ui", "deck_configuration_previewed", {
    mission: selectedBeat,
    deck_configuration: selectedDeckConfiguration === 1 ? "ANGLED" : "AXIAL",
  });
  renderPauseUi();
  return true;
}

function toggleDeckAndReady() {
  selectDeckConfiguration(selectedDeckConfiguration === 1 ? 0 : 1);
}

function beginFlight() {
  if (buildIdentityBlocksSortie() || !bridge || !pauseReasons.has("ready")) return false;
  const blockers = [...pauseReasons].filter((reason) => reason !== "ready");
  if (blockers.length) return false;
  clearFlightInput();
  recorder.startSortie({
    mission: selectedBeat,
    deckConfiguration: selectedDeckConfiguration === 1 ? "ANGLED" : "AXIAL",
  });
  // Touch pilots get the widened gunnery assist; tilt input cannot hold a funnel.
  bridge.SetTouchControlModality?.(mobileControls);
  bridge.SetAutoGcasEnabled?.(playerSettings.autoGcas !== false);
  syncAssistedFlight();
  // Fullscreen where the platform allows it (Android Chrome). iOS has no element fullscreen;
  // the Add-to-Home-Screen standalone app is the fullscreen path there (see ready-screen hint).
  if (mobileControls && !document.fullscreenElement
      && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen({ navigationUI: "hide" })
      .catch(() => {});
  }
  bridge.Begin();
  // Ready/warmup frames are deliberately excluded from the performance sample, and every sortie
  // starts from its mission-authored terrain radius and restored shadow/scenery policy.
  frameGovernor.reset(activeView);
  activeView?.beginCloudBreakEntry();
  pauseReasons.delete("ready");
  bridgePauseApplied = false;
  renderPauseUi();
  resetFrameClock();
  sceneCanvas.focus({ preventScroll: true });
  return true;
}

function activateReadyAction() {
  if (buildIdentityBlocksSortie()) return false;
  if (pauseReasons.has("finished")) {
    const nextNode = nextCampaignNode(campaignProfile, selectedProgramNodeId);
    if (nextNode) selectCampaignNode(nextNode.id, { focus: false });
    return restartMissionNow();
  }
  if (pauseReasons.has("ready")) return launchMission(selectedBeat);
  if (pauseReasons.has("session")) {
    setPauseReason("session", false);
    return true;
  }
  if (pauseReasons.has("background")) {
    setPauseReason("background", false);
    return true;
  }
  return false;
}

function reconcileBridgeLifecycle(state) {
  // Finished is durable simulation state, not a timer or renderer inference. It owns an explicit
  // interlock until the pilot stages a fresh Ready sortie.
  if (state?.finished === true) {
    if (!pauseReasons.has("finished")) {
      pauseReasons.delete("session");
      setPauseReason("finished", true);
    }
    return;
  }

  // Restart can also originate inside the bridge (for example a future outcome action). Always
  // reflect that authoritative Ready phase instead of leaving the player at an invisible freeze.
  if (state?.ready === true) {
    if (!pauseReasons.has("ready")) enterReady({ resetBridge: false });
    return;
  }

  // Local pause reasons already drove this bridge into Paused. A Paused state with no such reason
  // came from the authoritative session itself, so surface a resumable hold instead of accepting
  // controls against a clock which is silently stopped.
  if (state?.paused === true && pauseReasons.size === 0) {
    setPauseReason("session", true);
  } else if (state?.paused === false && pauseReasons.has("session")) {
    setPauseReason("session", false);
  }
}

readyStart.addEventListener("click", () => {
  activeView?.hud.armAudio();
  activateReadyAction();
});

readySelector?.addEventListener("click", (event) => {
  const select = event.target.closest("[data-program-node]");
  if (select) selectCampaignNode(select.dataset.programNode);
});

readyDeckConfig?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-deck-configuration]");
  if (button) selectDeckConfiguration(Number(button.dataset.deckConfiguration));
});

readyCircuitsPreflight?.addEventListener("toggle", () => {
  if (readyCircuitsPreflight.hidden) return;
  saveCircuitsPreflightOpenPreference(readyCircuitsPreflight.open);
});

readyScreen.addEventListener("keydown", (event) => {
  if (event.code !== "Tab" || !readyScreen.classList.contains("visible")) return;
  const focusable = readyScreenFocusables();
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
});

readyReplay?.addEventListener("click", () => {
  if (!incidentReplay?.start(performance.now())) return;
  clearFlightInput();
  pauseReasons.delete("finished");
  applyBridgePause();
  renderPauseUi();
  resetFrameClock();
});

readySettings?.addEventListener("click", openSettings);
readyRestart?.addEventListener("click", restartMissionNow);
readyReturn?.addEventListener("click", returnToCatalogue);
pauseButton?.addEventListener("click", toggleSessionPause);

function skipIncidentReplay() {
  if (!incidentReplay?.active) return false;
  incidentReplay.stop();
  renderIncidentReplay(null);
  return true;
}

incidentReplaySkip?.addEventListener("click", skipIncidentReplay);
incidentReplayPlay?.addEventListener("click", () => {
  incidentReplay?.togglePaused(performance.now());
});
incidentReplayEventJump?.addEventListener("click", () => {
  incidentReplay?.jumpToNextEvent(performance.now());
});
incidentReplayScrubber?.addEventListener("input", () => {
  incidentReplay?.seekFraction(Number(incidentReplayScrubber.value) / 1000,
    performance.now());
});
incidentReplayRate?.addEventListener("change", () => {
  incidentReplay?.setPlaybackRate(Number(incidentReplayRate.value), performance.now());
});
incidentReplayCamera?.addEventListener("change", () => {
  incidentReplay?.setCamera(incidentReplayCamera.value);
});

function setBootStatus(message) {
  bootStatus.textContent = message;
}

function waitForGlobal(getter, timeoutMs = 15000) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    function poll() {
      const value = getter();
      if (value) {
        resolve(value);
      } else if (performance.now() - started > timeoutMs) {
        reject(new Error("The .NET WebAssembly loader did not become available."));
      } else {
        requestAnimationFrame(poll);
      }
    }
    poll();
  });
}

function showFatal(error) {
  console.error(error);
  bootScreen.classList.add("ready");
  fatalMessage.textContent = error instanceof Error ? `${error.message}\n\n${error.stack ?? ""}` : String(error);
  fatalScreen.classList.add("visible");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function expStep(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

// FogExp2 reaches two per cent transmission at the reported meteorological visibility. Keeping
// this conversion at the renderer boundary makes visibility a projection of weather truth rather
// than an art preset.
function fogDensityForVisibility(visibilityM) {
  const physicalVisibility = clamp(Number(visibilityM) || CLEAR_AIR_VISIBILITY_M, 150, 200_000);
  return Math.sqrt(-Math.log(0.02)) / physicalVisibility;
}

function gameViewport() {
  const viewport = window.visualViewport;
  return {
    width: Math.max(1, Math.round(viewport?.width || window.innerWidth)),
    height: Math.max(1, Math.round(viewport?.height || window.innerHeight)),
  };
}

function gameSafeInsets() {
  const style = getComputedStyle(document.documentElement);
  const inset = (name) => Math.max(0, Number.parseFloat(style.getPropertyValue(name)) || 0);
  return {
    top: inset("--safe-top"),
    right: inset("--safe-right"),
    bottom: inset("--safe-bottom"),
    left: inset("--safe-left"),
  };
}

function carrierPresentationScale(state) {
  const deckLength = Number.isFinite(state.deck_len) ? Math.max(100, state.deck_len) : 250;
  const deckWidth = Number.isFinite(state.deck_w) ? Math.max(18, state.deck_w) : 30;
  return { scaleX: deckWidth / 30, scaleZ: deckLength / 250 };
}

function updateCarrierWaterPresentation(presentation, state, nowSeconds, fogColor, fogDensity,
  seaLocalY = 0) {
  const { scaleX, scaleZ } = carrierPresentationScale(state);
  for (let i = 0; i < presentation.wakes.length; i++) {
    presentation.wakes[i].scale.set(scaleX, 1, scaleZ);
    presentation.wakes[i].position.y = seaLocalY + 0.18;
    presentation.wakeUniforms[i].uTime.value = nowSeconds;
    presentation.wakeUniforms[i].uFogColor.value.copy(fogColor);
    presentation.wakeUniforms[i].uFogDensity.value = fogDensity;
  }
  presentation.spray.scale.set(scaleX, 1, scaleZ);
  presentation.spray.position.y = seaLocalY;
  presentation.sprayUniforms.uTime.value = nowSeconds;
  presentation.sprayUniforms.uFogColor.value.copy(fogColor);
  presentation.sprayUniforms.uFogDensity.value = fogDensity;
}

function updateRecoveryWireHighlight(presentation, state) {
  const caughtWire = state.arrest_phase === "ARRESTED" || state.arrest_phase === "STOPPED"
    ? Math.max(0, Math.min(4, Number(state.wire) || 0)) : 0;
  if (caughtWire === presentation.highlightedWire) return;
  presentation.highlightedWire = caughtWire;
  for (let i = 0; i < presentation.wires.length; i++) {
    const caught = i + 1 === caughtWire;
    presentation.wires[i].material.color.setHex(caught ? 0xffd060 : 0xc9b47a);
    presentation.wires[i].material.emissive.setHex(caught ? 0x5a2b00 : 0x000000);
  }
}

function updateCarrierRecoveryOverlay(
  presentation,
  state,
  scaleGroup = true,
  fixedLongitudinalSpacing = false,
) {
  const deckScale = carrierPresentationScale(state);
  // Ship recovery markings scale with the authored 250 x 30 m compatibility deck. A fixed
  // arresting strip still needs the projected runway width, but scaling its live fallback by
  // 1,200 / 250 longitudinally would turn the physical 5.2 m wire spacing into 24.96 m.
  const scaleX = deckScale.scaleX;
  const scaleZ = fixedLongitudinalSpacing ? 1 : deckScale.scaleZ;
  if (scaleGroup) presentation.group.scale.set(scaleX, 1, scaleZ);

  // Resolve the kernel touchdown point into the established carrier-local frame. This keeps the
  // painted wire zone coincident with tx/tz even when heading or deck dimensions vary.
  if (Number.isFinite(state.tx) && Number.isFinite(state.tz)) {
    const heading = Number.isFinite(state.cheading) ? state.cheading : 0;
    const dx = state.tx - state.cx;
    const dz = state.cz - state.tz; // sim Z was negated for the render world
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    presentation.landingArea.position.x = (c * dx + s * dz) / scaleX;
    presentation.landingArea.position.z = (-s * dx + c * dz) / scaleZ;
    const landingHeading = Number.isFinite(state.landing_heading) ? state.landing_heading : heading;
    presentation.landingArea.rotation.y = -(landingHeading - heading);
  }

  const axial = state.deck_config !== "ANGLED";
  presentation.barrier.visible = axial;
  if (presentation.ols) {
    const along = Number(state.deck_along);
    const height = Number(state.deck_height);
    const deckLength = Number.isFinite(state.deck_len) ? state.deck_len : 250;
    const range = Number.isFinite(along) ? Math.max(0, -deckLength * 0.2 - along) : 0;
    const error = Number.isFinite(height) ? range * 0.06116 - height : 0;
    const tolerance = Math.max(1.5, range * 0.004);
    // Positive error means low, so the meatball moves below the green datum row.
    presentation.ols.ball.position.y = clamp(-error / tolerance, -1.35, 1.35) * 0.56;
    presentation.ols.group.visible = range < 6500 || state.approach === true;
    presentation.ols.waveOff.visible = state.wave_off === true
      || state.lso_severity === "WAVEOFF";
    presentation.ols.ball.visible = !presentation.ols.waveOff.visible;
  }
  updateRecoveryWireHighlight(presentation, state);
}

function updateCarrierVisual(carrier, state, nowSeconds, fogColor, fogDensity, worldY = carrier.position.y) {
  const { scaleX, scaleZ } = carrierPresentationScale(state);
  const deckAltitude = Number.isFinite(state.deck_alt) ? Math.max(8, state.deck_alt) : 20;
  carrier.userData.structure.scale.set(scaleX, 1, scaleZ);
  carrier.userData.hull.scale.y = deckAltitude / 20;
  updateCarrierWaterPresentation(carrier.userData, state, nowSeconds, fogColor, fogDensity, -worldY);
  updateCarrierRecoveryOverlay(carrier.userData.recoveryPresentation, state, false);
}

const AUTHORED_CARRIER_RECOVERY_NODES = /^(?:LANDING_CENTRE_(?:LINE|DASHES)|RECOVERY_THRESHOLD_BAR|ARRESTING_WIRE_[1-4]|BARRIER_|LSO_DATUM_LIGHTS)/;

function hideAuthoredCarrierRecoveryNodes(carrier) {
  if (!carrier || carrier.userData.runtimeRecoveryNodesHidden === true) return;
  carrier.traverse((object) => {
    if (AUTHORED_CARRIER_RECOVERY_NODES.test(object.name)) object.visible = false;
  });
  carrier.userData.runtimeRecoveryNodesHidden = true;
}

function updateCarrierRuntimePresentation(runtime, carrier, state, nowSeconds, fogColor, fogDensity) {
  const recoveryPlatform = state.recovery_platform === true || state.carrier === true;
  const maritime = state.carrier === true;
  const fixedStrip = state.platform_kind === "FIXED_ARRESTING_STRIP";
  if (!recoveryPlatform) {
    runtime.recovery.group.visible = false;
    runtime.water.group.visible = false;
    return;
  }

  // The water rig is scene-owned and persists across compatibility/GLB swaps. It shares only XZ
  // position and heading, so simulated deck pitch and heave can never tip or lift the ocean foam.
  runtime.water.group.visible = maritime;
  if (maritime) {
    applyCarrierRootPose(THREE, runtime.water.group, state, {
      seaLevel: true,
      scratch: runtime.poseScratch,
    });
    updateCarrierWaterPresentation(runtime.water, state, nowSeconds, fogColor, fogDensity);
  }

  // The procedural fixed strip owns a metre-authored recovery zone. Reuse those exact wires for
  // live caught-wire highlighting and suppress the scene-level carrier overlay, avoiding duplicate
  // paint and preserving the simulation's 5.2 m spacing. During an asset swap (or for an authored
  // strip without exposed wire nodes), retain one physical-scale fallback instead.
  if (fixedStrip) {
    const fixedStripRecovery = carrier?.userData?.fixedStripRecoveryPresentation;
    if (fixedStripRecovery) {
      runtime.recovery.group.visible = false;
      updateRecoveryWireHighlight(fixedStripRecovery, state);
      return;
    }
    runtime.recovery.group.visible = true;
    hideAuthoredCarrierRecoveryNodes(carrier);
    applyCarrierRootPose(THREE, runtime.recovery.group, state, {
      followPitch: true,
      scratch: runtime.poseScratch,
    });
    updateCarrierRecoveryOverlay(runtime.recovery, state, true, true);
    return;
  }

  // Procedural compatibility carriers already own this exact recovery layer. Authored GLBs retain
  // their hull/island and trade only their fixed wire/centreline nodes for the live kernel overlay.
  const embeddedRecovery = carrier?.userData?.landingArea && carrier?.userData?.barrier;
  for (const wake of carrier?.userData?.wakes ?? []) wake.visible = false;
  if (carrier?.userData?.spray) carrier.userData.spray.visible = false;
  runtime.recovery.group.visible = !embeddedRecovery;
  if (embeddedRecovery) return;

  hideAuthoredCarrierRecoveryNodes(carrier);
  applyCarrierRootPose(THREE, runtime.recovery.group, state, {
    followPitch: true,
    scratch: runtime.poseScratch,
  });
  updateCarrierRecoveryOverlay(runtime.recovery, state);
}

function updateTracerChannel(channel, rounds, authoredLengthMetres = null) {
  const count = Math.min(Array.isArray(rounds) ? rounds.length : 0, MAX_TRACERS);
  for (let i = 0; i < count; i++) {
    const round = rounds[i];
    const offset = i * 6;
    const x = Number(round?.[0]) || 0;
    const y = Number(round?.[1]) || 0;
    const z = -(Number(round?.[2]) || 0);
    const vx = Number(round?.[3]) || 0;
    const vy = Number(round?.[4]) || 0;
    const vz = -(Number(round?.[5]) || 0);
    const speed = Math.max(1, Math.hypot(vx, vy, vz));
    // Round positions remain simulation truth. Once a pack is active, only the rendered streak
    // length comes from its effect profile; no duplicate presentation tracer integrates its own
    // trajectory beside the authoritative projectile.
    const streak = Number.isFinite(authoredLengthMetres)
      ? Math.max(0.1, authoredLengthMetres)
      : clamp(speed * 0.014, 9, 20);
    channel.positions[offset] = x - vx / speed * streak;
    channel.positions[offset + 1] = y - vy / speed * streak;
    channel.positions[offset + 2] = z - vz / speed * streak;
    channel.positions[offset + 3] = x;
    channel.positions[offset + 4] = y;
    channel.positions[offset + 5] = z;
    const headOffset = i * 3;
    channel.headPositions[headOffset] = x;
    channel.headPositions[headOffset + 1] = y;
    channel.headPositions[headOffset + 2] = z;
  }
  channel.tracers.geometry.setDrawRange(0, count * 2);
  channel.tracers.geometry.attributes.position.needsUpdate = count > 0;
  channel.tracers.visible = count > 0;
  channel.glow.visible = count > 0;
  channel.heads.geometry.setDrawRange(0, count);
  channel.heads.geometry.attributes.position.needsUpdate = count > 0;
  channel.heads.visible = count > 0;
}

function updateMuzzleChannel(channel, active, origin, forward, quaternion, roundsFired,
  flashOffset, coneOffset, intensity) {
  channel.flash.visible = active;
  channel.cone.visible = active;
  channel.flash.position.copy(origin).addScaledVector(forward, flashOffset);
  channel.flash.quaternion.copy(quaternion);
  channel.cone.position.copy(origin).addScaledVector(forward, coneOffset);
  channel.cone.quaternion.copy(quaternion);
  channel.light.position.copy(channel.flash.position);
  if (active) {
    const pulse = 0.82 + 0.18 * Math.sin(roundsFired * 2.17);
    channel.flash.scale.set(1.45 * pulse, 0.72 * pulse, 2.7 * pulse);
    channel.cone.scale.set(0.9 * pulse, 0.9 * pulse, 1.45 * pulse);
    channel.flash.material.opacity = 0.84;
    channel.cone.material.opacity = 0.72;
    channel.light.intensity = intensity;
  } else {
    channel.flash.material.opacity = 0;
    channel.cone.material.opacity = 0;
    channel.light.intensity = 0;
  }
}

// Browser MSAA already preserves the geometric edges the pilot uses. A direct path avoids adding
// bloom or other full-frame treatment whose only justification would be that the graphics stack
// supports it. Event effects still render normally through the same scene.
function createDecisionSupportPostStack({ renderer, scene, camera, config }) {
  let activeScene = scene;
  let activeCamera = camera;
  return {
    render() { renderer.render(activeScene, activeCamera); },
    setSize() {},
    configure() {},
    setSceneCamera(nextScene, nextCamera) {
      activeScene = nextScene;
      activeCamera = nextCamera;
    },
    diagnostics() {
      return Object.freeze({
        mode: "direct",
        reason: "production-decision-support",
        toneMapping: config.renderer?.toneMapping ?? "aces_filmic",
      });
    },
    dispose() {},
  };
}

// Production presentation boundary. The simulation projects stable presentation IDs; this manager
// resolves them through the staged content pack and owns every registry instance it attaches. The
// current procedural meshes remain first-class compatibility fallbacks, so a missing/unbuilt pack
// can never turn a playable mission into a blank scene.
const STAGED_PACK_URLS = Object.freeze({
  "korea-1950s": "./content/packs/korea-1950s/pack.json",
});
const DEFAULT_PLAYER_PRESENTATION_ID = "presentation.vehicle.player.v1";
const DEFAULT_TARGET_PRESENTATION_ID = "presentation.vehicle.bandit.v1";
const DEFAULT_COCKPIT_PRESENTATION_ID = "presentation.cockpit.player.v1";
const DEFAULT_CARRIER_PRESENTATION_ID = "presentation.platform.carrier.v1";
const DEFAULT_ESCORT_PRESENTATION_ID = "presentation.platform.escort.v1";
const RAPIER_GUN_DRONE_PRESENTATION_ID =
  "presentation.vehicle.rapier-gun-drone.prototype.v1";

// The current cockpit GLB is an authoring/reference asset, not an acceptable production view: its
// opaque slabs and oversized canopy structure obscure the exact airdata and energy cues this sim
// is trying to teach. Keep it available in Asset Lab, but ship the information-efficient SA view
// until a cockpit presentation passes an actual in-mission visual review.
const PRODUCTION_AUTHORED_COCKPIT_ENABLED = false;

const COMPATIBILITY_PRESENTATION_FACTORIES = new Map([
  ["presentation.vehicle.bandit.v1", createDrone],
  ["presentation.vehicle.awacs-target.v1", createAwacs],
  ["presentation.vehicle.player.v1", createDrone],
  ["presentation.vehicle.glider-strike.v1", createGlider],
  // Mission 7 deliberately uses the existing abstract contact body until purpose-built,
  // reviewed silhouettes exist. Its capability/telemetry identity remains explicit; this is a
  // visibility aid for a guns-only visual fight, not a claim to an F-22 or Su-27 exterior model.
  ["presentation.vehicle.f22a.public-data-surrogate.v1", createDrone],
  ["presentation.vehicle.su27s.public-data-surrogate.v1", createDrone],
  ["presentation.vehicle.one-way-attack-drone.prototype.v1", createOneWayAttackDrone],
  ["presentation.vehicle.rapier-gun-drone.prototype.v1", createRapierGunDrone],
  ["presentation.vehicle.rapier.public-data-surrogate.v1", createRapier],
  [DEFAULT_COCKPIT_PRESENTATION_ID, createHiddenPresentation],
  ["presentation.platform.carrier.v1", createCarrier],
  ["presentation.platform.rapier-dispersed-strip.v1", createRapierDispersedStrip],
  [DEFAULT_ESCORT_PRESENTATION_ID, createHiddenPresentation],
]);
const ABSTRACT_ONLY_PRESENTATION_IDS = new Set([
  "presentation.vehicle.f22a.public-data-surrogate.v1",
  "presentation.vehicle.su27s.public-data-surrogate.v1",
]);

function projectedId(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function aircraftAlive(state, terminalField, fallback) {
  const terminal = state?.[terminalField];
  if (typeof terminal === "string" && terminal.length > 0) return terminal === "FLYING";
  return fallback;
}

function assetErrorText(error) {
  if (!error) return null;
  const code = error.code ? `[${error.code}] ` : "";
  return `${code}${error.message ?? String(error)}`;
}

class PresentationAssetManager {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.activePack = null;
    this.activePackKey = "";
    this.requestedPackKey = "";
    this.loadedPacks = new Map();
    this.dynamicSlots = new Set();
    this.packEpoch = 0;
    this.lastError = null;
    this.lastState = null;
    this.requested = {
      snapshotSchemaVersion: "",
      packId: "",
      packVersion: "",
      packUri: "",
      presentationProfileId: "",
      visualProfileId: "",
      assetProfileId: "",
      assetManifestId: "",
      playerEntityId: "",
      playerPresentationId: "",
      cockpitPresentationId: "",
      banditEntityId: "",
      banditPresentationId: DEFAULT_TARGET_PRESENTATION_ID,
      supportPresentationId: "",
      carrierEntityId: "",
      carrierPresentationId: DEFAULT_CARRIER_PRESENTATION_ID,
      escortEntityId: "",
      escortPresentationId: DEFAULT_ESCORT_PRESENTATION_ID,
    };

    this.cockpitSlot = this.createSlot("cockpit", DEFAULT_COCKPIT_PRESENTATION_ID,
      createHiddenPresentation);
    this.playerExteriorSlot = this.createSlot("player-exterior", DEFAULT_PLAYER_PRESENTATION_ID,
      createDrone);
    this.targetSlot = this.createSlot("target", DEFAULT_TARGET_PRESENTATION_ID, createDrone);
    // The second aircraft of a formation wave. Same presentation as the primary — it is the same
    // kind of jet — but its own slot so both can be drawn at once.
    this.wingmanSlot = this.createSlot("wingman", DEFAULT_TARGET_PRESENTATION_ID, createDrone);
    this.wingman2Slot = this.createSlot("wingman-2", DEFAULT_TARGET_PRESENTATION_ID, createDrone);
    this.wingman3Slot = this.createSlot("wingman-3", DEFAULT_TARGET_PRESENTATION_ID, createDrone);
    this.rapierGunDroneSlot = this.createSlot("rapier-gun-drone",
      RAPIER_GUN_DRONE_PRESENTATION_ID, createRapierGunDrone);
    this.carrierSlot = this.createSlot("carrier", DEFAULT_CARRIER_PRESENTATION_ID, createCarrier);
    this.escortSlot = this.createSlot("escort", DEFAULT_ESCORT_PRESENTATION_ID,
      createHiddenPresentation);
    this.cockpitSlot.root.visible = false;
    this.playerExteriorSlot.root.visible = false;
    this.targetSlot.root.visible = false;
    this.wingmanSlot.root.visible = false;
    this.wingman2Slot.root.visible = false;
    this.wingman3Slot.root.visible = false;
    this.rapierGunDroneSlot.root.visible = false;
    this.carrierSlot.root.visible = false;
    this.escortSlot.root.visible = false;

    this.runtime = null;
    try {
      this.runtime = createThreeR160AssetRegistry({
        renderer,
        baseUrl: document.baseURI,
        fallbackFactories: new Map([
          ["procedural://fighter/current", (context) => createDrone(context)],
          ["procedural://cockpit/current", () => createHiddenPresentation()],
          ["procedural://carrier/current", (context) => createCarrier(context)],
          ["procedural://platform/escort/current", () => createHiddenPresentation()],
        ]),
        registryOptions: { logger: console },
      });
    } catch (error) {
      this.lastError = assetErrorText(error);
      console.warn("Graphics asset runtime unavailable; procedural presentation remains active.", error);
    }
  }

  createSlot(name, presentationId, fallbackFactory, parent = this.scene) {
    const root = new THREE.Group();
    root.name = `Presentation_${name}`;
    parent.add(root);
    const slot = {
      name,
      root,
      entityId: "",
      presentationId,
      fallbackFactory,
      object: null,
      instance: null,
      activeKey: "",
      pendingKey: "",
      failedKey: "",
      epoch: 0,
      error: null,
      semanticAnchorNodes: new Map(),
      boundingSphereDiameterMetres: null,
      lodWorldScale: new THREE.Vector3(1, 1, 1),
    };
    this.showCompatibility(slot);
    return slot;
  }

  createDynamicSlot(name, presentationId, entityId, fallbackFactory, parent = this.scene) {
    const remoteAssetPolicy = new RemoteAssetResolutionPolicy(presentationId, entityId);
    const slot = this.createSlot(name, remoteAssetPolicy.presentationId, fallbackFactory, parent);
    slot.dynamic = true;
    slot.remoteAssetPolicy = remoteAssetPolicy;
    slot.root.visible = true;
    this.dynamicSlots.add(slot);
    this.setPresentation(slot, remoteAssetPolicy.presentationId, remoteAssetPolicy.entityId);
    return slot;
  }

  updateDynamicSlot(slot, presentationId, entityId, projectedPixelHeight) {
    if (!this.dynamicSlots.has(slot)) return false;
    // Entity identity is continuity/diagnostic truth, not an asset-cache key. A remote peer may
    // legitimately begin another sortie (and is not trusted enough to make that an allocation
    // primitive), so only a presentation change replaces the visual instance.
    const policyUpdate = slot.remoteAssetPolicy.update(presentationId, entityId);
    if (policyUpdate.presentationChanged) {
      this.setPresentation(slot, policyUpdate.presentationId, policyUpdate.entityId);
    } else {
      slot.entityId = policyUpdate.entityId;
    }
    slot.projectedPixelHeight = Number.isFinite(projectedPixelHeight)
      ? Math.max(0, projectedPixelHeight)
      : Number.POSITIVE_INFINITY;
    // A newly received contact has no camera range until its first presentation update. Keep the
    // cheap procedural fallback for that one frame instead of treating an unknown range as
    // Infinity and needlessly requesting the hero LOD.
    if (!Number.isFinite(projectedPixelHeight)) return true;
    this.resolveSlot(slot, { preload: true });
    return true;
  }

  async releaseDynamicSlot(slot) {
    if (!this.dynamicSlots.delete(slot)) return;
    slot.epoch += 1;
    slot.root.removeFromParent();
    const instance = slot.instance;
    const object = slot.object;
    slot.instance = null;
    slot.object = null;
    if (instance) await Promise.resolve(instance.release()).catch(() => undefined);
    else if (object) disposeSceneResources(object);
  }

  compatibilityFactory(slot) {
    return COMPATIBILITY_PRESENTATION_FACTORIES.get(slot.presentationId) ?? slot.fallbackFactory;
  }

  qualitySettings() {
    const tiers = this.activePack?.profile?.qualityTiers;
    return Array.isArray(tiers)
      ? tiers.find((tier) => tier?.id === VISUAL_QUALITY.tier)?.settings ?? {}
      : {};
  }

  prepareObject(object) {
    const settings = this.qualitySettings();
    const anisotropy = Math.min(
      Math.max(1, Number(settings.anisotropy) || 1),
      Math.max(1, Number(this.renderer.capabilities?.getMaxAnisotropy?.()) || 1),
    );
    object.traverse?.((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const transparent = materials.some((material) => material
        && (material.transparent === true || Number(material.opacity) < 0.999));
      for (const material of materials) {
        if (!material) continue;
        for (const property of [
          "map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap",
          "alphaMap",
        ]) {
          const texture = material[property];
          if (texture?.isTexture && texture.anisotropy !== anisotropy) {
            texture.anisotropy = anisotropy;
            texture.needsUpdate = true;
          }
        }
      }
      child.castShadow = child.userData?.noShadow !== true && !transparent;
      child.receiveShadow = true;
    });
    return object;
  }

  releaseDetached(instance, object) {
    try {
      if (instance) {
        void Promise.resolve(instance.release()).catch((error) => {
          console.warn("Graphics asset instance release failed.", error);
        });
      } else if (object) {
        disposeSceneResources(object);
      }
    } catch (error) {
      console.warn("Graphics asset cleanup failed.", error);
    }
  }

  swap(slot, object, metadata) {
    const previousInstance = slot.instance;
    const previousObject = slot.object;
    slot.root.clear();
    slot.object = this.prepareObject(object);
    const localBounds = new THREE.Box3().setFromObject(slot.object);
    const localSize = new THREE.Vector3();
    localBounds.getSize(localSize);
    const localDiameter = localBounds.isEmpty()
      ? 0
      : boundingSphereDiameterFromSize(localSize);
    slot.boundingSphereDiameterMetres = Number.isFinite(localDiameter) && localDiameter > 0
      ? localDiameter
      : null;
    slot.semanticAnchorNodes = new Map(
      (Array.isArray(metadata.descriptor?.anchors) ? metadata.descriptor.anchors : [])
        .filter((anchor) => typeof anchor?.id === "string" && typeof anchor?.node === "string")
        .map((anchor) => [anchor.id, anchor.node]),
    );
    slot.instance = metadata.instance ?? null;
    slot.activeKey = metadata.key;
    slot.pendingKey = "";
    slot.failedKey = "";
    slot.error = null;
    slot.root.add(slot.object);
    // Runtime platform updates pose the stable slot root, while compatibility factories attach
    // their authored interaction hooks to the object placed inside it. Mirror the fixed-strip
    // recovery hook onto the stable root so live wire highlighting reaches the exact procedural
    // 5.2 m meshes instead of falling back to a second overlay.
    if (slot.object.userData?.fixedStripRecoveryPresentation) {
      slot.root.userData.fixedStripRecoveryPresentation =
        slot.object.userData.fixedStripRecoveryPresentation;
    } else {
      delete slot.root.userData.fixedStripRecoveryPresentation;
    }
    if (previousObject !== slot.object) this.releaseDetached(previousInstance, previousObject);
  }

  showCompatibility(slot) {
    const identity = slot.dynamic ? "shared-presentation" : slot.entityId || "unprojected";
    const key = `compatibility:${slot.presentationId}:${identity}`;
    if (slot.activeKey === key && slot.object) return;
    const factory = this.compatibilityFactory(slot);
    try {
      this.swap(slot, factory(), { key, instance: null });
    } catch (error) {
      slot.error = assetErrorText(error);
      this.lastError = slot.error;
      console.warn(`Compatibility visual failed for ${slot.presentationId}.`, error);
    }
  }

  setPresentation(slot, presentationId, entityId) {
    if (slot.presentationId === presentationId && slot.entityId === entityId) return;
    slot.presentationId = presentationId;
    slot.entityId = entityId;
    slot.epoch += 1;
    slot.pendingKey = "";
    slot.failedKey = "";
    this.showCompatibility(slot);
  }

  packRequest(state) {
    const packId = projectedId(state.pack_id, projectedId(state.content_pack_id));
    const packVersion = projectedId(state.pack_version);
    const explicitUri = projectedId(state.content_pack_uri);
    const relativeUri = explicitUri || STAGED_PACK_URLS[packId] || "";
    let packUri = relativeUri ? new URL(relativeUri, document.baseURI).href : "";
    if (packUri && packVersion) {
      const packUrl = new URL(packUri);
      if (packUrl.origin === window.location.origin) {
        packUrl.searchParams.set("packVersion", packVersion);
        packUri = packUrl.href;
      }
    }
    const snapshotSchemaVersion = projectedId(state.snapshot_schema_version);
    const presentationProfileId = projectedId(state.presentation_profile_id);
    const visualProfileId = projectedId(state.visual_profile_id);
    const assetProfileId = projectedId(state.asset_profile_id);
    const assetManifestId = projectedId(state.asset_manifest_id);
    return {
      snapshotSchemaVersion,
      packId,
      packVersion,
      packUri,
      presentationProfileId,
      visualProfileId,
      assetProfileId,
      assetManifestId,
      key: packUri ? [
        snapshotSchemaVersion,
        packId,
        packVersion,
        presentationProfileId,
        visualProfileId,
        assetProfileId,
        assetManifestId,
        packUri,
      ].join("|") : "",
    };
  }

  invalidatePackInstances() {
    for (const slot of [
      this.cockpitSlot,
      this.playerExteriorSlot,
      this.targetSlot,
      this.wingmanSlot,
      this.wingman2Slot,
      this.wingman3Slot,
      this.rapierGunDroneSlot,
      this.carrierSlot,
      this.escortSlot,
      ...this.dynamicSlots,
    ]) {
      slot.epoch += 1;
      slot.pendingKey = "";
      slot.failedKey = "";
      slot.remoteAssetPolicy?.resetDescriptorFailure();
      this.showCompatibility(slot);
    }
  }

  requestPack(state) {
    const request = this.packRequest(state);
    this.requested.snapshotSchemaVersion = request.snapshotSchemaVersion;
    this.requested.packId = request.packId;
    this.requested.packVersion = request.packVersion;
    this.requested.packUri = request.packUri;
    this.requested.presentationProfileId = request.presentationProfileId;
    this.requested.visualProfileId = request.visualProfileId;
    this.requested.assetProfileId = request.assetProfileId;
    this.requested.assetManifestId = request.assetManifestId;
    if (request.key === this.requestedPackKey) return;

    this.requestedPackKey = request.key;
    this.activePack = null;
    this.activePackKey = "";
    this.invalidatePackInstances();
    const epoch = ++this.packEpoch;
    if (!request.key || !this.runtime) return;

    const cached = this.loadedPacks.get(request.key);
    if (cached) {
      this.activatePack(cached, request, epoch);
      return;
    }

    void this.runtime.registry.loadPack(request.packUri, {
      activate: false,
      profileId: request.presentationProfileId || undefined,
    })
      .then((pack) => {
        if (epoch !== this.packEpoch) return;
        this.loadedPacks.set(request.key, pack);
        this.activatePack(pack, request, epoch);
      })
      .catch((error) => {
        if (epoch !== this.packEpoch) return;
        this.lastError = assetErrorText(error);
        console.warn(`Content pack ${request.packId || request.packUri} could not be loaded; using procedural presentation.`, error);
      });
  }

  activatePack(pack, request, epoch) {
    if (epoch !== this.packEpoch || request.key !== this.requestedPackKey) return;
    const identities = [
      ["snapshot schema", request.snapshotSchemaVersion, pack.compatibility?.snapshotSchemaVersion],
      ["pack", request.packId, pack.id],
      ["pack version", request.packVersion, pack.packVersion],
      ["presentation profile", request.presentationProfileId, pack.profile?.presentationProfileId],
      ["visual profile", request.visualProfileId, pack.profile?.id],
      ["asset profile", request.assetProfileId, pack.profile?.assetProfile?.id],
      ["asset manifest", request.assetManifestId, pack.manifest?.id],
    ];
    for (const [label, expected, actual] of identities) {
      if (expected && actual !== expected) {
        this.lastError = `Loaded ${label} ${actual ?? "(none)"} does not match projected ${label} ${expected}.`;
        return;
      }
    }
    this.runtime.registry.activatePack(pack);
    this.activePack = pack;
    this.activePackKey = request.key;
    this.lastError = null;
    this.resolveVisibleSlots();
  }

  projectedPixels(slot, descriptor) {
    if (slot.dynamic && Number.isFinite(slot.projectedPixelHeight)) {
      return slot.projectedPixelHeight;
    }
    const state = this.lastState;
    if (!state) return Number.POSITIVE_INFINITY;
    let distance = Number.POSITIVE_INFINITY;
    const extensionBounds = descriptor?.extensions?.boundsMetres;
    const declaredDiameter = Array.isArray(extensionBounds)
      && extensionBounds.length >= 3
      && extensionBounds.slice(0, 3).every((value) => Number.isFinite(Number(value)) && Number(value) >= 0)
      ? boundingSphereDiameterFromSize(extensionBounds)
      : null;
    let localDiameter = Number(slot.boundingSphereDiameterMetres ?? declaredDiameter);
    if (!Number.isFinite(localDiameter) || localDiameter <= 0) {
      localDiameter = slot.name === "carrier" ? 255 : 16;
    }
    slot.root.updateWorldMatrix(true, false);
    const rootWorldScale = slot.root.getWorldScale(slot.lodWorldScale);
    const worldDiameter = localDiameter * maximumAxisScale(rootWorldScale);
    if (slot.name === "target") {
      distance = Number(state.range_m);
    } else if (slot.name === "carrier" && [state.px, state.py, state.pz, state.cx, state.cy, state.cz]
      .every(Number.isFinite)) {
      distance = Math.hypot(state.cx - state.px, state.cy - state.py, state.cz - state.pz);
    }
    if (!Number.isFinite(distance) || distance < 0) return Number.POSITIVE_INFINITY;
    return estimateProjectedPixelHeight({
      worldHeight: worldDiameter,
      distance,
      verticalFovRadians: THREE.MathUtils.degToRad(this.camera.fov),
      viewportHeight: Math.max(1, this.renderer.domElement.clientHeight || window.innerHeight),
    });
  }

  lodSelectionPixels(projectedPixelHeight) {
    if (!Number.isFinite(projectedPixelHeight)) return projectedPixelHeight;
    const bias = Number(this.qualitySettings().lodBias) || 0;
    return projectedPixelHeight * (2 ** -bias);
  }

  resolveSlot(slot, { preload = false } = {}) {
    if (ABSTRACT_ONLY_PRESENTATION_IDS.has(slot.presentationId)) return;
    if (!this.activePack || !this.runtime || (!slot.root.visible && !preload)) return;
    const registry = this.runtime.registry;
    const descriptorScope = {
      packId: this.activePack.id,
      profileId: this.activePack.profile.id,
    };
    const descriptorFailureKey = [
      "descriptor",
      descriptorScope.packId,
      descriptorScope.profileId,
      slot.presentationId,
    ].join(":");
    if (slot.remoteAssetPolicy
      ? !slot.remoteAssetPolicy.shouldAttemptDescriptor(descriptorScope)
      : slot.failedKey === descriptorFailureKey) return;
    let descriptor;
    try {
      descriptor = registry.getAssetDescriptor(slot.presentationId, { pack: this.activePack });
    } catch (error) {
      const message = assetErrorText(error);
      this.showCompatibility(slot);
      // Unknown/unbound presentation IDs remain on their compatibility visual without throwing
      // again every render frame. Pack invalidation or a presentation change clears failedKey.
      slot.remoteAssetPolicy?.rememberDescriptorFailure(descriptorScope);
      slot.failedKey = descriptorFailureKey;
      slot.error = message;
      this.lastError = message;
      return;
    }

    const projectedPixelHeight = this.projectedPixels(slot, descriptor);
    const lodPixelHeight = this.lodSelectionPixels(projectedPixelHeight);
    let lod = null;
    if (descriptor.kind === "gltf") {
      try {
        lod = registry.selectLod(slot.presentationId, lodPixelHeight, {
          pack: this.activePack,
          currentLod: slot.instance?.lod ?? null,
        });
      } catch (error) {
        const message = assetErrorText(error);
        this.showCompatibility(slot);
        slot.error = message;
        this.lastError = message;
        return;
      }
    }
    const assetIdentity = lod?.uri ?? descriptor.fallback ?? descriptor.id;
    const instanceIdentity = slot.entityId || "unprojected";
    const key = slot.remoteAssetPolicy
      ? slot.remoteAssetPolicy.registryInstanceKey(descriptorScope, assetIdentity)
      : `registry:${this.activePack.id}:${this.activePack.profile.id}:${slot.presentationId}:${instanceIdentity}:${assetIdentity}`;
    if (slot.activeKey === key) {
      if (slot.pendingKey && slot.pendingKey !== key) {
        slot.epoch += 1;
        slot.pendingKey = "";
      }
      return;
    }
    if (slot.pendingKey === key || slot.failedKey === key) return;
    const epoch = ++slot.epoch;
    slot.pendingKey = key;
    slot.error = null;
    void registry.instantiate(slot.presentationId, {
      pack: this.activePack,
      projectedPixelHeight: lodPixelHeight,
      currentLod: lod,
    }).then((instance) => {
      if (epoch !== slot.epoch || this.activePackKey !== this.requestedPackKey) {
        return Promise.resolve(instance.release());
      }
      this.swap(slot, instance.scene, { key, instance, descriptor });
      return undefined;
    }).catch((error) => {
      if (epoch !== slot.epoch) return;
      const message = assetErrorText(error);
      console.warn(`Asset resolution failed for ${slot.presentationId}; compatibility visual retained.`, error);
      this.showCompatibility(slot);
      slot.pendingKey = "";
      slot.failedKey = key;
      slot.error = message;
      this.lastError = message;
    });
  }

  resolveVisibleSlots() {
    // The exterior is hidden in the cockpit, but must be ready before the first incident replay.
    // Loading it here prevents a replay from beginning on the compatibility mesh and swapping
    // models halfway through the recorded lesson.
    this.resolveSlot(this.playerExteriorSlot, { preload: true });
    this.resolveSlot(this.cockpitSlot);
    this.resolveSlot(this.targetSlot);
    if (this.wingmanSlot.root.visible) this.resolveSlot(this.wingmanSlot);
    if (this.wingman2Slot.root.visible) this.resolveSlot(this.wingman2Slot);
    if (this.wingman3Slot.root.visible) this.resolveSlot(this.wingman3Slot);
    if (this.rapierGunDroneSlot.root.visible) this.resolveSlot(this.rapierGunDroneSlot);
    this.resolveSlot(this.carrierSlot);
    this.resolveSlot(this.escortSlot);
    for (const slot of this.dynamicSlots) {
      if (Number.isFinite(slot.projectedPixelHeight)) this.resolveSlot(slot, { preload: true });
    }
  }

  semanticAnchor(slot, semanticId) {
    if (!slot?.object) return null;
    const nodeName = slot.semanticAnchorNodes?.get(semanticId);
    return typeof nodeName === "string" && nodeName.length > 0
      ? slot.object.getObjectByName(nodeName)
      : null;
  }

  sync(state) {
    this.lastState = state;
    this.requested.playerEntityId = projectedId(state.player_entity_id);
    this.requested.playerPresentationId = projectedId(state.player_presentation_id);
    this.requested.cockpitPresentationId = projectedId(state.cockpit_presentation_id);
    this.requested.banditEntityId = projectedId(state.bandit_entity_id);
    this.requested.banditPresentationId = projectedId(
      state.bandit_presentation_id,
      DEFAULT_TARGET_PRESENTATION_ID,
    );
    this.requested.supportPresentationId = projectedId(state.support_presentation_id);
    this.requested.carrierEntityId = projectedId(state.carrier_entity_id);
    this.requested.carrierPresentationId = projectedId(
      state.carrier_presentation_id,
      DEFAULT_CARRIER_PRESENTATION_ID,
    );
    this.requested.escortEntityId = state.carrier === true
      ? `${this.requested.carrierEntityId || "entity.carrier"}.escort.1`
      : "";
    this.requested.escortPresentationId = DEFAULT_ESCORT_PRESENTATION_ID;
    this.setPresentation(
      this.cockpitSlot,
      this.requested.cockpitPresentationId || DEFAULT_COCKPIT_PRESENTATION_ID,
      this.requested.playerEntityId,
    );
    this.setPresentation(
      this.playerExteriorSlot,
      this.requested.playerPresentationId || DEFAULT_PLAYER_PRESENTATION_ID,
      this.requested.playerEntityId,
    );
    this.setPresentation(
      this.targetSlot,
      this.requested.banditPresentationId,
      this.requested.banditEntityId,
    );
    this.setPresentation(
      this.wingmanSlot,
      this.requested.banditPresentationId,
      `${this.requested.banditEntityId}.wingman.1`,
    );
    this.setPresentation(
      this.wingman2Slot,
      this.requested.banditPresentationId,
      `${this.requested.banditEntityId}.wingman.2`,
    );
    this.setPresentation(
      this.wingman3Slot,
      this.requested.banditPresentationId,
      `${this.requested.banditEntityId}.wingman.3`,
    );
    this.setPresentation(
      this.rapierGunDroneSlot,
      RAPIER_GUN_DRONE_PRESENTATION_ID,
      `${this.requested.playerEntityId || "entity.player"}.gun-drone.1`,
    );
    this.setPresentation(
      this.carrierSlot,
      this.requested.carrierPresentationId,
      this.requested.carrierEntityId,
    );
    this.setPresentation(
      this.escortSlot,
      this.requested.escortPresentationId,
      this.requested.escortEntityId,
    );
    const replayExternal = state.replay_external === true;
    this.cockpitSlot.root.visible = PRODUCTION_AUTHORED_COCKPIT_ENABLED
      && !replayExternal
      && this.requested.cockpitPresentationId !== "";
    this.playerExteriorSlot.root.visible = replayExternal
      && String(state.replay_camera || "CHASE") !== "COCKPIT";
    this.targetSlot.root.visible = state.opponent_body_present !== false;
    // Admission gate for asset resolution, not merely a draw toggle: a 1v1 wave must not pay for
    // a second aircraft's assets at all.
    this.wingmanSlot.root.visible = state.w1_present === 1;
    this.wingman2Slot.root.visible = state.w2_present === 1;
    this.wingman3Slot.root.visible = state.w3_present === 1;
    this.rapierGunDroneSlot.root.visible = state.rd1_present === 1;
    this.carrierSlot.root.visible = state.recovery_platform === true;
    // A hidden decorative escort must not even enter asset resolution: visibility here is the
    // resolver's admission gate, not merely a later draw toggle in FlightView.update().
    this.escortSlot.root.visible = PRODUCTION_ESCORT_PRESENTATION_ENABLED
      && state.carrier === true;
    this.requestPack(state);
    this.resolveVisibleSlots();
  }

  slotDiagnostics(slot) {
    const instance = slot.instance;
    return Object.freeze({
      entityId: slot.entityId || null,
      presentationId: slot.presentationId,
      assetId: instance?.assetId ?? null,
      source: instance ? "registry" : "compatibility",
      fallback: instance?.fallback ?? true,
      fallbackKey: instance?.fallbackKey ?? (slot.object ? `compatibility:${slot.presentationId}` : null),
      lod: instance?.lod?.id ?? null,
      boundingSphereDiameterMetres: slot.boundingSphereDiameterMetres,
      pending: slot.pendingKey !== "",
      error: slot.error,
    });
  }

  diagnostics() {
    const cache = this.runtime?.registry.cacheStats() ?? null;
    return Object.freeze({
      requested: Object.freeze({ ...this.requested }),
      loadedPackId: this.activePack?.id ?? null,
      loadedPackVersion: this.activePack?.packVersion ?? null,
      loadedPresentationProfileId: this.activePack?.profile?.presentationProfileId ?? null,
      loadedProfileId: this.activePack?.profile?.id ?? null,
      loadedAssetProfileId: this.activePack?.profile?.assetProfile?.id ?? null,
      loadedManifestId: this.activePack?.manifest?.id ?? null,
      player: Object.freeze({
        entityId: this.requested.playerEntityId || null,
        presentationId: this.requested.playerPresentationId || null,
        cockpit: this.slotDiagnostics(this.cockpitSlot),
        exterior: this.slotDiagnostics(this.playerExteriorSlot),
      }),
      target: this.slotDiagnostics(this.targetSlot),
      carrier: this.slotDiagnostics(this.carrierSlot),
      escort: this.slotDiagnostics(this.escortSlot),
      supportPresentationId: this.requested.supportPresentationId || null,
      cache: cache ? Object.freeze({ ...cache }) : null,
      error: this.lastError,
    });
  }

  async dispose() {
    this.packEpoch += 1;
    for (const slot of [
      this.cockpitSlot,
      this.playerExteriorSlot,
      this.targetSlot,
      this.wingmanSlot,
      this.wingman2Slot,
      this.wingman3Slot,
      this.rapierGunDroneSlot,
      this.carrierSlot,
      this.escortSlot,
      ...this.dynamicSlots,
    ]) {
      slot.epoch += 1;
      slot.root.removeFromParent();
      const instance = slot.instance;
      const object = slot.object;
      slot.instance = null;
      slot.object = null;
      if (instance) await Promise.resolve(instance.release()).catch(() => undefined);
      else if (object) disposeSceneResources(object);
    }
    this.dynamicSlots.clear();
    const runtime = this.runtime;
    this.runtime = null;
    if (runtime) await runtime.dispose();
  }
}

function createRemoteCallsignSprite(callsign, hostile = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 48;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(2, 12, 18, .72)";
  context.fillRect(0, 4, canvas.width, 40);
  context.strokeStyle = hostile ? "rgba(255, 92, 72, .82)" : "rgba(77, 255, 136, .68)";
  context.lineWidth = 2;
  context.strokeRect(1, 5, canvas.width - 2, 38);
  context.fillStyle = hostile ? "#ffe1db" : "#d9ffe5";
  context.font = "700 23px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(callsign, canvas.width / 2, canvas.height / 2 + 1, canvas.width - 14);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    opacity: 0.86,
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(0, 8.5, 0);
  sprite.scale.set(22, 4.125, 1);
  sprite.userData.disposeRemoteLabel = () => {
    texture.dispose();
    material.dispose();
  };
  return sprite;
}

class RemoteAircraftManager {
  constructor(scene, presentationAssets, renderer, camera) {
    this.scene = scene;
    this.presentationAssets = presentationAssets;
    this.renderer = renderer;
    this.camera = camera;
    this.aircraft = new Map();
    this.forward = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.zAxis = new THREE.Vector3();
    this.matrix = new THREE.Matrix4();
  }

  create(contact, kind) {
    const contactId = kind === "bogey" ? contact.bogeyId : contact.playerId;
    const projection = projectRemoteContact(contact);
    const root = new THREE.Group();
    root.name = `${kind === "bogey" ? "WorldBogey" : "RemoteAircraft"}_${contactId}`;
    const label = createRemoteCallsignSprite(contact.callsign, kind === "bogey");
    root.add(label);
    this.scene.add(root);
    const slot = this.presentationAssets.createDynamicSlot(
      `remote-${kind}-${contactId}`,
      projection.presentationId,
      projection.entityId ?? contactId,
      () => createDrone(kind === "player" ? { parameters: { livery: "navy-blue" } } : undefined),
      root,
    );
    const distantContact = createDistantAircraftImpostor(THREE, {
      coreColor: kind === "bogey" ? 0x170706 : 0x06140b,
      edgeColor: kind === "bogey" ? 0xff5c48 : 0x4dff88,
    });
    this.scene.add(distantContact.object3d);
    const entry = {
      root,
      slot,
      label,
      distantContact,
      contactId,
      kind,
      callsign: contact.callsign,
      sequence: -1,
      targetPosition: new THREE.Vector3(),
      targetQuaternion: new THREE.Quaternion(),
      initialised: false,
      alive: true,
      bodyPresent: true,
      terminalState: "FLYING",
      impactSurface: "NONE",
      phase: "ACTIVE",
      missionId: "mission.unknown",
      presentationId: projection.presentationId,
      entityId: null,
      streamId: null,
      continuityKey: null,
    };
    this.aircraft.set(contactId, entry);
    return entry;
  }

  setTarget(entry, contact) {
    const projection = projectRemoteContact(contact);
    const resetInterpolation = shouldResetRemoteInterpolation(entry.continuityKey, projection);
    entry.targetPosition.set(contact.position[0], contact.position[1], -contact.position[2]);
    this.forward.set(contact.forward[0], contact.forward[1], -contact.forward[2]).normalize();
    this.up.set(contact.up[0], contact.up[1], -contact.up[2]).normalize();
    this.zAxis.copy(this.forward).negate();
    this.right.copy(this.up).cross(this.zAxis).normalize();
    this.matrix.makeBasis(this.right, this.up, this.zAxis);
    entry.targetQuaternion.setFromRotationMatrix(this.matrix).normalize();
    entry.sequence = contact.sequence;
    entry.alive = projection.alive;
    entry.bodyPresent = projection.bodyPresent;
    entry.terminalState = projection.terminalState;
    entry.impactSurface = projection.impactSurface;
    entry.phase = projection.phase;
    entry.missionId = projection.missionId;
    entry.presentationId = projection.presentationId;
    entry.entityId = projection.entityId;
    entry.streamId = projection.streamId;
    entry.continuityKey = projection.continuityKey;
    entry.root.visible = remoteContactVisible(projection);
    this.presentationAssets.updateDynamicSlot(
      entry.slot,
      projection.presentationId,
      projection.entityId ?? entry.contactId,
      entry.slot.projectedPixelHeight,
    );
    if (!entry.initialised || resetInterpolation) {
      entry.root.position.copy(entry.targetPosition);
      entry.root.quaternion.copy(entry.targetQuaternion);
      entry.initialised = true;
      entry.distantContact.reset();
    }
  }

  releaseEntry(entry) {
    entry.root.removeFromParent();
    entry.label.userData.disposeRemoteLabel?.();
    entry.distantContact.dispose();
    return this.presentationAssets.releaseDynamicSlot(entry.slot);
  }

  sync(snapshot, ownPlayerId) {
    const seen = new Set();
    const contacts = [
      ...(snapshot?.players ?? [])
        .filter((player) => player?.playerId !== ownPlayerId)
        .map((contact) => ({ contact, kind: "player", id: contact.playerId })),
      ...(PRODUCTION_NONCOMBAT_WORLD_BOGEYS_VISIBLE ? snapshot?.bogeys ?? [] : [])
        .map((contact) => ({ contact, kind: "bogey", id: contact.bogeyId })),
    ];
    for (const { contact, kind, id } of contacts) {
      if (!contact || !id) continue;
      seen.add(id);
      const entry = this.aircraft.get(id) ?? this.create(contact, kind);
      const continuity = projectRemoteContact(contact).continuityKey;
      if (continuity !== entry.continuityKey || contact.sequence > entry.sequence)
        this.setTarget(entry, contact);
    }
    for (const [playerId, entry] of this.aircraft) {
      if (seen.has(playerId)) continue;
      this.aircraft.delete(playerId);
      void this.releaseEntry(entry);
    }
  }

  update(dt, cameraPosition, { historicalReplay = false } = {}) {
    const blend = 1 - Math.exp(-Math.max(0, dt) * 12);
    for (const entry of this.aircraft.values()) {
      entry.root.visible = remoteContactVisible(entry, { historicalReplay });
      if (!entry.initialised || !entry.bodyPresent) {
        entry.slot.root.visible = false;
        entry.label.visible = false;
        entry.distantContact.reset();
        continue;
      }
      // Keep following current room truth while hidden during replay. When the review ends, live
      // contacts reappear at their current smoothed pose instead of where replay began.
      entry.root.position.lerp(entry.targetPosition, blend);
      entry.root.quaternion.slerp(entry.targetQuaternion, blend);
      const distance = entry.root.position.distanceTo(cameraPosition);
      const diameter = entry.slot.boundingSphereDiameterMetres ?? 12;
      const projectedPixelHeight = estimateProjectedPixelHeight({
        worldHeight: diameter,
        distance,
        verticalFovRadians: THREE.MathUtils.degToRad(this.camera.fov),
        viewportHeight: Math.max(1, this.renderer.domElement.clientHeight || window.innerHeight),
      });
      this.presentationAssets.updateDynamicSlot(
        entry.slot,
        entry.presentationId,
        entry.entityId ?? entry.contactId,
        projectedPixelHeight,
      );
      entry.slot.root.scale.setScalar(1);
      entry.slot.root.updateWorldMatrix(true, false);
      if (!entry.root.visible) {
        entry.slot.root.visible = false;
        entry.label.visible = false;
        entry.distantContact.reset();
        continue;
      }
      const contactPresentation = entry.distantContact.update({
        camera: this.camera,
        renderer: this.renderer,
        target: entry.slot.root,
        targetDiameterMetres: diameter,
        projectedPixels: projectedPixelHeight,
        visible: entry.alive,
        deltaSeconds: dt,
      });
      entry.slot.root.visible = !entry.alive || contactPresentation.modelVisible;
      entry.label.visible = entry.root.visible;
    }
  }

  diagnostics() {
    return Object.freeze({
      rendered: this.aircraft.size,
      pilots: Object.freeze([...this.aircraft.entries()].map(([playerId, entry]) => Object.freeze({
        playerId,
        kind: entry.kind,
        callsign: entry.callsign,
        sequence: entry.sequence,
        alive: entry.alive,
        bodyPresent: entry.bodyPresent,
        terminalState: entry.terminalState,
        impactSurface: entry.impactSurface,
        phase: entry.phase,
        missionId: entry.missionId,
        presentationId: entry.presentationId,
        entityId: entry.entityId,
        streamId: entry.streamId,
        visual: this.presentationAssets.slotDiagnostics(entry.slot),
        distantContact: Object.freeze({ ...entry.distantContact.state }),
      }))),
    });
  }

  async dispose() {
    const releases = [...this.aircraft.values()].map((entry) => this.releaseEntry(entry));
    this.aircraft.clear();
    await Promise.allSettled(releases);
  }
}

class FlightView {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: sceneCanvas,
      antialias: true,
      powerPreference: "high-performance",
      // Rapier/Ukraine need this. With near=0.06 and far=680 km a 24-bit linear depth buffer's
      // world-space LSB is ~400 m at 20 km slant and ~2.5 km at 50 km — larger than the 78 m
      // horizon apron height — so apron/terrain/sea depth-tie into the shattered flicker on tape.
      // Log depth costs early-Z; the high-altitude presentation cost of turning it off is worse.
      logarithmicDepthBuffer: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.setClearColor(0x020611, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // The authored eye point sits inside a 1.5 m-wide cockpit, so the near plane must stay inside
    // the canopy rails and instrument coaming. Logarithmic depth keeps the ocean/apron horizon
    // stable across that clip range.
    this.camera = new THREE.PerspectiveCamera(66, 1, 0.06, 680000);
    this.camera.rotation.order = "YXZ";

    this.scene = new THREE.Scene();
    this.environmentTarget = createLitEnvironment(this.renderer);
    this.scene.environment = this.environmentTarget.texture;
    this.fogLow = new THREE.Color(0x6f8790);
    this.fogHigh = new THREE.Color(0x263d55);
    this.fogColor = this.fogLow.clone();
    this.scene.fog = new THREE.FogExp2(
      this.fogColor,
      fogDensityForVisibility(CLEAR_AIR_VISIBILITY_M),
    );
    this.sky = createDecisionSupportSky();
    this.sea = createDecisionSupportSea();
    this.tacticalClouds = PRODUCTION_SIMULATED_CLOUDS_ENABLED
      ? createTacticalCloudField(THREE, {
        qualityTier: VISUAL_QUALITY.tier,
        sunDirection: SUN_DIRECTION,
        // Keep authoritative weather visible in production without paying the full-resolution
        // overlapping ray-march cost. The volumetric path remains available to an explicit
        // high-end quality mode once it is backed by a production frame-time governor.
        volumetric: false,
      })
      : {
        group: new THREE.Group(),
        update: () => 0,
        configureFromState: () => false,
        beginCloudBreak: () => Object.freeze({ active: false, phase: "disabled" }),
        updateCloudBreak: () => Object.freeze({ active: false, phase: "disabled" }),
        cancelCloudBreak: () => Object.freeze({ active: false, phase: "disabled" }),
        cloudBreakDiagnostics: () => Object.freeze({ active: false, phase: "disabled" }),
        dispose() {},
      };
    this.tacticalClouds.group.name = "AUTHORITATIVE_WEATHER_CLOUDS";
    this.tacticalClouds.group.visible = PRODUCTION_SIMULATED_CLOUDS_ENABLED;
    this.scene.add(this.sky.mesh, this.sea.mesh, this.tacticalClouds.group);
    this.cloudFogColor = new THREE.Color(0xb8c6c8);
    this.cloudBreakActive = false;
    this.cloudBreakPresentation = this.tacticalClouds.cloudBreakDiagnostics();

    this.ambient = new THREE.HemisphereLight(0xb5cad0, 0x102229, 0.78);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffe2b4, 2.65);
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sun, this.sunTarget);
    this.sun.target = this.sunTarget;
    this.sun.shadow.mapSize.set(VISUAL_QUALITY.shadowMapSize, VISUAL_QUALITY.shadowMapSize);
    this.sun.shadow.camera.left = -175;
    this.sun.shadow.camera.right = 175;
    this.sun.shadow.camera.top = 175;
    this.sun.shadow.camera.bottom = -175;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 3600;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.00018;
    this.sun.shadow.normalBias = 0.16;

    this.presentationAssets = new PresentationAssetManager(this.renderer, this.scene, this.camera);
    this.cockpitHead = createCockpitHeadPresentation(THREE);
    this.periodGunsight = createPeriodGunsight(THREE);
    this.banditContact = createDistantAircraftImpostor(THREE);
    this.scene.add(this.periodGunsight.object3d, this.banditContact.object3d);
    this.visualRuntime = null;
    this.visualRuntimeRequestedKey = "";
    this.visualRuntimeEpoch = 0;
    this.visualRuntimeError = null;
    this.visualRuntimeTransitions = new AsyncTransitionQueue();
    this.packEnvironmentAdapter = null;
    this.packEffectsAdapter = null;
    this.disposed = false;
    this.remoteAircraft = new RemoteAircraftManager(
      this.scene,
      this.presentationAssets,
      this.renderer,
      this.camera,
    );
    this.carrierRuntime = createCarrierRuntimePresentation();
    this.scene.add(this.carrierRuntime.recovery.group, this.carrierRuntime.water.group);
    this.banditDestruction = createBanditDestruction();
    this.gunEffects = createGunEffects();
    this.playerDamageSmoke = createDamageSmokeTrail(THREE, {
      name: "PLAYER_DAMAGE_SMOKE",
      capacity: VISUAL_QUALITY.tier === "mobile" ? 32 : 56,
      pixelRatio: Math.min(window.devicePixelRatio || 1, VISUAL_QUALITY.pixelRatioCap),
    });
    this.banditDamageSmoke = createDamageSmokeTrail(THREE, {
      name: "BANDIT_DAMAGE_SMOKE",
      capacity: VISUAL_QUALITY.tier === "mobile" ? 32 : 56,
      pixelRatio: Math.min(window.devicePixelRatio || 1, VISUAL_QUALITY.pixelRatioCap),
    });
    this.scene.add(
      this.banditDestruction,
      this.gunEffects,
      this.playerDamageSmoke.points,
      this.banditDamageSmoke.points,
    );

    this.playerPosition = new THREE.Vector3();
    this.playerForward = new THREE.Vector3(0, 0, -1);
    this.playerUp = new THREE.Vector3(0, 1, 0);
    this.playerRight = new THREE.Vector3(1, 0, 0);
    this.playerMuzzleLeftPosition = new THREE.Vector3();
    this.playerMuzzleRightPosition = new THREE.Vector3();
    this.opponentMuzzleLeftPosition = new THREE.Vector3();
    this.opponentMuzzleRightPosition = new THREE.Vector3();
    this.playerQuaternion = new THREE.Quaternion();
    this.externalCameraActive = false;
    this.banditPosition = new THREE.Vector3();
    this.carrierPosition = new THREE.Vector3();
    this.carrierPadlockPosition = new THREE.Vector3();
    this.playerDamagePosition = new THREE.Vector3();
    this.banditDamagePosition = new THREE.Vector3();
    this.effectNormal = new THREE.Vector3(0, 1, 0);
    this.leadPipper = new THREE.Vector3();
    this.banditQuaternion = new THREE.Quaternion();
    this.wingmanPosition = new THREE.Vector3();
    this.wingmanQuaternion = new THREE.Quaternion();
    this.wingman2Position = new THREE.Vector3();
    this.wingman2Quaternion = new THREE.Quaternion();
    this.wingman3Position = new THREE.Vector3();
    this.wingman3Quaternion = new THREE.Quaternion();
    this.rapierGunDronePosition = new THREE.Vector3();
    this.rapierGunDroneQuaternion = new THREE.Quaternion();
    this.playerFrame = this.createAttitudeFrame();
    this.banditFrame = this.createAttitudeFrame();
    this.wingmanFrame = this.createAttitudeFrame();
    this.wingman2Frame = this.createAttitudeFrame();
    this.wingman3Frame = this.createAttitudeFrame();
    this.rapierGunDroneFrame = this.createAttitudeFrame();
    this.banditEntityId = "";
    this.playerEntityId = "";
    this.banditWasAlive = true;
    this.banditSplashTime = -1;
    this.banditDestructionForcedUntil = -1;
    this.lastRoundsFired = 0;
    this.lastOpponentRoundsFired = 0;
    this.lastHitCount = 0;
    this.muzzleFlashUntil = -1;
    this.opponentMuzzleFlashUntil = -1;
    this.hitSparkTime = -1;
    this.lastCombatEventSequence = 0;
    this.combatEventStreams = new PresentationEventStreams();
    this.combatEventPosition = new THREE.Vector3();
    this.combatEventVelocity = new THREE.Vector3();
    this.aimPoint = new THREE.Vector3();   // published forward recovery cue, distinct from wire three
    this.approachDirectorPoint = new THREE.Vector3();
    this.approachCueDirection = new THREE.Vector3();
    this.deckFlightPathPoint = new THREE.Vector3();
    this.deckRelativeVelocity = new THREE.Vector3();
    this.localTarget = new THREE.Vector3();
    this.localYawQuaternion = new THREE.Quaternion();
    this.localPitchQuaternion = new THREE.Quaternion();
    this.localGimbalQuaternion = new THREE.Quaternion();
    this.inversePlayerQuaternion = new THREE.Quaternion();
    this.xAxis = new THREE.Vector3(1, 0, 0);
    this.yAxis = new THREE.Vector3(0, 1, 0);
    this.shadowTargetPosition = new THREE.Vector3();
    this.shadowRight = new THREE.Vector3();
    this.shadowUp = new THREE.Vector3();

    this.hud = createHud(hudCanvas);
    this.hudFrame = {
      state: null,
      camera: this.camera,
      playerPosition: this.playerPosition,
      playerForward: this.playerForward,
      playerUp: this.playerUp,
      playerRight: this.playerRight,
      banditPosition: this.banditPosition,
      banditForward: this.banditFrame.forward,
      // The second aircraft of a formation wave. The HUD needs its own symbology: a pilot who
      // cannot see where the other one is cannot fight two of them.
      wingmanPosition: this.wingmanPosition,
      // Refreshed every frame below. This is only the initial value: the constructor runs before
      // any snapshot exists, and a boolean captured here would stay false forever — which is
      // exactly what hid the wingman's bracket and stopped V falling through to it.
      wingmanPresent: false,
      leadPipper: this.leadPipper,
      aimPoint: null,
      directorPoint: null,
      flightPathPoint: null,
      sensorYaw: 0,
      sensorPitch: 0,
      lookYaw: 0,
      lookPitch: 0,
      padlock: false,
      padlockTarget: "bandit",
      padlockPhase: "OFF",
      manualLookActive: false,
      periodGunsightVisible: false,
      triggerHeld: false,
      dt: 0,
      now: 0,
    };
    this.terrainPresentation = null;
    this.terrainPresentationError = null;
    this.terrainPresentationPromise = null;
    this.terrainPresentationKey = null;
    this.terrainPresentationRequestedKey = null;
    this.terrainSceneryEraPromise = null;
    this.terrainPresentationFailureKey = null;
    this.terrainPresentationRetryAtMs = 0;
    this.terrainPresentationRequestEpoch = 0;
    this.terrainPresentationAbortController = null;
    this.terrainMicroRequired = false;
    this.terrainNominalStreamingRadiusM = 64_000;
    this.terrainGovernorSuppressesAmbientScenery = false;
    this.frameGovernorShadowState = null;
    this.resize();
  }

  beginCloudBreakEntry() {
    this.cloudBreakPresentation = this.tacticalClouds.beginCloudBreak();
    this.cloudBreakActive = this.cloudBreakPresentation.active;
    this.tacticalClouds.group.visible = this.cloudBreakActive
      || PRODUCTION_SIMULATED_CLOUDS_ENABLED;
  }

  cancelCloudBreakEntry() {
    if (!this.cloudBreakActive) return;
    this.cloudBreakPresentation = this.tacticalClouds.cancelCloudBreak();
    this.cloudBreakActive = false;
  }

  configureTerrainMission(state = null) {
    this.terrainMicroRequired = state?.terrain_micro_required === true;
    const radiusM = Number(state?.terrain_streaming_radius_m);
    if (Number.isFinite(radiusM) && radiusM >= TERRAIN_INITIAL_WARMUP_RADIUS_M) {
      this.terrainNominalStreamingRadiusM = radiusM;
    }
  }

  applyTerrainFlightPolicy() {
    if (!this.terrainPresentation
        || !Number.isFinite(this.terrainNominalStreamingRadiusM)) return false;
    return this.terrainPresentation.setStreamingRadiusM?.(
      this.terrainNominalStreamingRadiusM) ?? false;
  }

  ensureTerrainPresentation(state = null) {
    this.configureTerrainMission(state);
    const ukraineTheatre = state?.terrain_profile_id === UKRAINE_2030S_TERRAIN_ID;
    // ADR-0003 soft world: warm dusty atmosphere for the Ukraine theatre without flipping the
    // Korea pack-environment kill switch. Decision-support sky stays the production path.
    if (this.sky?.uniforms?.uSoftWorld) {
      this.sky.uniforms.uSoftWorld.value = ukraineTheatre ? 1 : 0;
    }
    if (ukraineTheatre) {
      this.fogLow.set(0xd2c4a8);
      this.fogHigh.set(0x5a7088);
      this.cloudFogColor.set(0xd2c4a8);
      if (this.sea?.mesh) this.sea.mesh.visible = false;
    } else {
      this.fogLow.set(0x6f8790);
      this.fogHigh.set(0x263d55);
      this.cloudFogColor.set(0xb8c6c8);
      if (this.sea?.mesh) this.sea.mesh.visible = true;
    }
    const terrainPackId = this.presentationAssets.requested.packId
      || this.presentationAssets.activePack?.id || "korea-1950s";
    const sceneryEra = ukraineTheatre
      ? (state?.terrain_scenery_profile || "ukraine-modern")
      : (state?.terrain_scenery_profile
        || (terrainPackId.includes("modern") || selectedBeat === 7 || selectedBeat === 9
          || selectedBeat === 10 ? "modern" : "1950s"));
    const terrainKey = ukraineTheatre
      ? UKRAINE_2030S_TERRAIN_ID
      : "terrain.korea.central-front.v2";
    const manifestUrl = ukraineTheatre
      ? UKRAINE_TRAINING_TERRAIN_MANIFEST_URL
      : DEVELOPMENT_KOREA_ATLAS_MANIFEST_URL;
    if (!PRODUCTION_KOREA_TERRAIN_ENABLED || this.disposed) {
      return Promise.resolve(this.terrainPresentation);
    }
    if (this.terrainPresentationFailureKey
      && this.terrainPresentationFailureKey !== terrainKey) {
      this.terrainPresentationFailureKey = null;
      this.terrainPresentationRetryAtMs = 0;
    }
    if (this.terrainPresentationFailureKey === terrainKey
      && performance.now() < this.terrainPresentationRetryAtMs) {
      return Promise.resolve(null);
    }
    if (this.terrainPresentation && this.terrainPresentationKey !== terrainKey) {
      this.terrainPresentationRequestEpoch += 1;
      this.terrainPresentationAbortController?.abort();
      this.terrainPresentationAbortController = null;
      this.terrainPresentation.dispose();
      this.terrainPresentation = null;
      this.terrainPresentationPromise = null;
      this.terrainPresentationKey = null;
      this.terrainSceneryEraPromise = null;
    }
    if (this.terrainPresentation) {
      const terrainDiagnostics = this.terrainPresentation.diagnostics();
      const needsAmbientScenery = state?.terrain_micro_required === true
        && this.terrainGovernorSuppressesAmbientScenery !== true
        && terrainDiagnostics.ambientSceneryEnabled === false;
      if ((terrainDiagnostics.sceneryEra !== sceneryEra || needsAmbientScenery)
        && !this.terrainSceneryEraPromise) {
        const presentation = this.terrainPresentation;
        this.terrainSceneryEraPromise = Promise.resolve(
          terrainDiagnostics.sceneryEra !== sceneryEra
            ? presentation.setSceneryEra(sceneryEra)
            : presentation.enableAmbientScenery?.(),
        ).catch((error) => {
          if (!this.disposed) {
            this.terrainPresentationError = String(error?.message ?? error);
            console.warn("Korea scenery era could not be changed.", error);
          }
          return null;
        });
        void this.terrainSceneryEraPromise.finally(() => {
          this.terrainSceneryEraPromise = null;
        });
      }
      return this.terrainSceneryEraPromise?.then(() => this.terrainPresentation)
        ?? Promise.resolve(this.terrainPresentation);
    }
    if (this.terrainPresentationPromise) {
      if (this.terrainPresentationRequestedKey === terrainKey) {
        return this.terrainPresentationPromise;
      }
      return this.terrainPresentationPromise.then(() => this.ensureTerrainPresentation(state));
    }
    this.terrainPresentationError = null;
    this.terrainPresentationRequestedKey = terrainKey;
    const requestEpoch = ++this.terrainPresentationRequestEpoch;
    const abortController = new AbortController();
    this.terrainPresentationAbortController = abortController;
    const request = loadKoreaTerrain(THREE, {
      manifestUrl,
      qualityTier: VISUAL_QUALITY.tier,
      maximumConcurrentLoads: VISUAL_QUALITY.tier === "mobile" ? 3 : 6,
      lazyChunks: true,
      chunkLoadRadiusM: TERRAIN_INITIAL_WARMUP_RADIUS_M,
      chunkEvictRadiusM: TERRAIN_INITIAL_WARMUP_RADIUS_M + 16_000,
      sceneryEra,
      sunDirection: SUN_DIRECTION,
      fetch: (input, init = {}) => fetch(input, {
        ...init,
        signal: abortController.signal,
      }),
    }).then((terrain) => {
      if (this.disposed || requestEpoch !== this.terrainPresentationRequestEpoch) {
        terrain.dispose();
        return null;
      }
      this.terrainPresentation = terrain;
      this.terrainPresentationKey = terrainKey;
      this.terrainPresentationFailureKey = null;
      this.terrainPresentationRetryAtMs = 0;
      this.scene.add(terrain.group);
      return terrain;
    }).catch((error) => {
      if (!this.disposed && requestEpoch === this.terrainPresentationRequestEpoch) {
        this.terrainPresentationError = String(error?.message ?? error);
        this.terrainPresentationFailureKey = terrainKey;
        this.terrainPresentationRetryAtMs = performance.now() + 15_000;
        console.warn("Korea terrain unavailable; ocean presentation retained.", error);
      }
      return null;
    });
    this.terrainPresentationPromise = request;
    void request.finally(() => {
      if (this.terrainPresentationPromise === request) this.terrainPresentationPromise = null;
    });
    return request;
  }

  cancelTerrainPresentationRequest(terrainKey) {
    // A requested theatre can be chained behind the previous theatre's still-pending load. The
    // warmup deadline belongs to the requested theatre, but it must cancel whichever fetch is
    // actually blocking that request rather than requiring both keys to match.
    const hasInFlightRequest = this.terrainPresentationPromise !== null;
    const ownsPresentation = this.terrainPresentationKey === terrainKey;
    if ((!hasInFlightRequest && !ownsPresentation) || this.disposed) return false;
    this.terrainPresentationRequestEpoch += 1;
    this.terrainPresentationAbortController?.abort();
    this.terrainPresentationAbortController = null;
    if (this.terrainPresentationKey === terrainKey) {
      this.terrainPresentation?.dispose();
      this.terrainPresentation = null;
      this.terrainPresentationKey = null;
    }
    this.terrainPresentationPromise = null;
    this.terrainPresentationRequestedKey = null;
    this.terrainPresentationFailureKey = terrainKey;
    this.terrainPresentationRetryAtMs = performance.now() + 15_000;
    this.terrainPresentationError = "Terrain warmup timed out.";
    return true;
  }

  resize() {
    const { width, height } = gameViewport();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, VISUAL_QUALITY.pixelRatioCap);
    const safeInsets = gameSafeInsets();
    document.documentElement.style.setProperty("--game-width", `${width}px`);
    document.documentElement.style.setProperty("--game-height", `${height}px`);
    this.hud.resize(width, height, pixelRatio, safeInsets);
    const surfaceChanged = this._surfaceWidth !== width
      || this._surfaceHeight !== height
      || this._surfacePixelRatio !== pixelRatio;
    if (!surfaceChanged) return;
    this._surfaceWidth = width;
    this._surfaceHeight = height;
    this._surfacePixelRatio = pixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    const carrierVisual = this.presentationAssets.carrierSlot.object;
    if (carrierVisual?.userData.sprayUniforms) {
      carrierVisual.userData.sprayUniforms.uPixelRatio.value = pixelRatio;
    }
    this.carrierRuntime.water.sprayUniforms.uPixelRatio.value = pixelRatio;
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.visualRuntime?.resize(width, height, window.devicePixelRatio || 1);
  }

  queueVisualRuntimeTransition(operation) {
    const task = this.visualRuntimeTransitions.enqueue(operation);
    void task.catch((error) => {
      if (!this.disposed) console.warn("Pack visual runtime transition failed.", error);
    });
    return task;
  }

  ensureVisualRuntime() {
    const pack = this.presentationAssets.activePack;
    const key = this.presentationAssets.activePackKey;
    if (!pack?.profile || !key) {
      if (!this.visualRuntimeRequestedKey && !this.visualRuntime) return;
      this.visualRuntimeRequestedKey = "";
      const epoch = ++this.visualRuntimeEpoch;
      this.visualRuntimeError = null;
      void this.queueVisualRuntimeTransition(async () => {
        if (epoch !== this.visualRuntimeEpoch || this.disposed) return;
        const previous = this.visualRuntime;
        this.visualRuntime = null;
        await Promise.resolve(previous?.dispose()).catch((error) => {
          console.warn("Pack visual runtime cleanup failed.", error);
        });
      });
      return;
    }
    if (key === this.visualRuntimeRequestedKey) return;

    this.visualRuntimeRequestedKey = key;
    const epoch = ++this.visualRuntimeEpoch;
    this.visualRuntimeError = null;
    const profileUrl = new URL("visual-profile.json", this.presentationAssets.requested.packUri).href;
    const isKoreaPack = pack.id === "korea-1950s";
    const environmentFactory = PRODUCTION_PACK_ENVIRONMENT_ENABLED && isKoreaPack
      ? createKoreaEnvironmentFactory(THREE, {
        profileUrl,
        packVersion: pack.packVersion,
        sunDirection: SUN_DIRECTION,
        onActivated: (adapter) => {
          if (epoch !== this.visualRuntimeEpoch || key !== this.presentationAssets.activePackKey
            || this.disposed) return;
          this.packEnvironmentAdapter = adapter;
          this.sky.mesh.visible = false;
          this.sea.mesh.visible = false;
          this.tacticalClouds.group.visible = false;
        },
        onDeactivated: (adapter) => {
          if (this.packEnvironmentAdapter !== adapter) return;
          this.packEnvironmentAdapter = null;
          if (!this.disposed) {
            this.sky.mesh.visible = true;
            this.sea.mesh.visible = true;
            this.tacticalClouds.group.visible = PRODUCTION_SIMULATED_CLOUDS_ENABLED;
            this.scene.fog = new THREE.FogExp2(
              this.fogColor,
              fogDensityForVisibility(CLEAR_AIR_VISIBILITY_M),
            );
          }
        },
      })
      : undefined;
    const effectsFactory = isKoreaPack
      ? createKoreaEffectsFactory(THREE, {
        profileUrl,
        packVersion: pack.packVersion,
        onActivated: (adapter) => {
          if (epoch !== this.visualRuntimeEpoch || key !== this.presentationAssets.activePackKey
            || this.disposed) return;
          this.packEffectsAdapter = adapter;
          this.applyPackGunStyle(adapter);
        },
        onDeactivated: (adapter) => {
          if (this.packEffectsAdapter !== adapter) return;
          this.packEffectsAdapter = null;
          this.applyPackGunStyle();
        },
      })
      : undefined;

    void this.queueVisualRuntimeTransition(async () => {
      if (epoch !== this.visualRuntimeEpoch || key !== this.presentationAssets.activePackKey
        || this.disposed) return;
      const previous = this.visualRuntime;
      this.visualRuntime = null;
      await Promise.resolve(previous?.dispose())
        .catch((error) => console.warn("Previous visual runtime cleanup failed.", error));
      if (epoch !== this.visualRuntimeEpoch || key !== this.presentationAssets.activePackKey
        || this.disposed) return;

      let runtime;
      try {
        runtime = await createVisualRuntime({
          renderer: this.renderer,
          scene: this.scene,
          camera: this.camera,
          profile: pack.profile,
          profileUrl,
          tierId: VISUAL_QUALITY.tier,
          mode: "combat",
          lights: { ambient: this.ambient, sun: this.sun },
          environmentFactory,
          effectsFactory,
          manageFog: Boolean(environmentFactory),
          postStackFactory: createDecisionSupportPostStack,
          manageRendererSize: false,
          // The production cockpit and normal-flight ownship exterior are hidden, while terrain
          // does not consume the directional shadow map. Preserve the pass where it has visible
          // receivers (carrier work and desktop external replay) instead of paying for it in combat.
          shadowModes: mobileControls ? ["carrier"] : ["carrier", "replay"],
          shadowHalfExtents: { combat: 44, carrier: 190, replay: 160 },
          onResolutionChange: (pixelRatio) => {
            const carrierVisual = this.presentationAssets.carrierSlot.object;
            if (carrierVisual?.userData.sprayUniforms) {
              carrierVisual.userData.sprayUniforms.uPixelRatio.value = pixelRatio;
            }
            this.carrierRuntime.water.sprayUniforms.uPixelRatio.value = pixelRatio;
          },
          onDiagnostic: (diagnostic) => console.debug("Visual runtime", diagnostic),
        });
      } catch (error) {
        if (epoch !== this.visualRuntimeEpoch || this.disposed) return;
        this.visualRuntimeError = String(error?.message ?? error);
        if (!this.packEnvironmentAdapter) {
          this.scene.fog = new THREE.FogExp2(this.fogColor, 0.000055);
        }
        console.warn("Pack visual runtime unavailable; direct renderer retained.", error);
        return;
      }
      if (epoch !== this.visualRuntimeEpoch || key !== this.presentationAssets.activePackKey
        || this.disposed) {
        await runtime.dispose();
        return;
      }
      this.visualRuntime = runtime;
      this.banditContact.setColors(
        pack.profile.readability?.targetSilhouetteColor ?? 0xd7e7ec,
        0xd6c59b,
      );
      const { width, height } = gameViewport();
      runtime.resize(width, height, window.devicePixelRatio || 1);
    });
  }

  createAttitudeFrame() {
    return {
      forward: new THREE.Vector3(),
      up: new THREE.Vector3(),
      right: new THREE.Vector3(),
      zAxis: new THREE.Vector3(),
      matrix: new THREE.Matrix4(),
      quaternion: new THREE.Quaternion(),
    };
  }

  frameFromState(state, prefix, frame) {
    frame.forward.set(state[`${prefix}fx`], state[`${prefix}fy`], -state[`${prefix}fz`]).normalize();
    frame.up.set(state[`${prefix}lx`], state[`${prefix}ly`], -state[`${prefix}lz`]).normalize();

    // Sim X/Y/Z is east/up/north (left-handed physical space). Flipping Z gives three.js
    // coordinates. Build the full attitude from the kernel's forward/lift frame: using a
    // world-up lookAt here reverses roll and becomes singular at a loop apex.
    frame.zAxis.copy(frame.forward).negate();
    frame.right.copy(frame.up).cross(frame.zAxis).normalize();
    frame.matrix.makeBasis(frame.right, frame.up, frame.zAxis);
    frame.quaternion.setFromRotationMatrix(frame.matrix).normalize();
    return frame;
  }

  updateSunAndShadows(isCarrier, carrierRoot) {
    const extent = isCarrier ? 190 : 44;
    const target = isCarrier ? carrierRoot.position : this.playerPosition;
    const texelSize = extent * 2 / Math.max(1, VISUAL_QUALITY.shadowMapSize);

    // Snap the tracked volume in the sun's light-space plane. This keeps fine cockpit rails and
    // deck markings from crawling as the world translates under a fixed-resolution shadow map.
    this.shadowRight.crossVectors(SUN_DIRECTION, this.yAxis).normalize();
    this.shadowUp.crossVectors(this.shadowRight, SUN_DIRECTION).normalize();
    this.shadowTargetPosition.copy(target);
    const lightX = this.shadowTargetPosition.dot(this.shadowRight);
    const lightY = this.shadowTargetPosition.dot(this.shadowUp);
    this.shadowTargetPosition
      .addScaledVector(this.shadowRight, Math.round(lightX / texelSize) * texelSize - lightX)
      .addScaledVector(this.shadowUp, Math.round(lightY / texelSize) * texelSize - lightY);

    if (this.shadowExtent !== extent) {
      this.shadowExtent = extent;
      this.sun.shadow.camera.left = -extent;
      this.sun.shadow.camera.right = extent;
      this.sun.shadow.camera.top = extent;
      this.sun.shadow.camera.bottom = -extent;
      this.sun.shadow.camera.updateProjectionMatrix();
    }
    // Desktop dogfights receive cockpit/airframe self-shadow; mobile retains the carrier-only
    // path because fill-rate, not shadow-map resolution, is its dominant cost.
    this.sun.castShadow = isCarrier || !mobileControls;
    this.sunTarget.position.copy(this.shadowTargetPosition);
    this.sun.position.copy(this.shadowTargetPosition).addScaledVector(SUN_DIRECTION, 1600);
    this.sunTarget.updateMatrixWorld();
  }

  updateGimbal(dt) {
    if (manualLookActive()) {
      padlockPhase = padlock ? "SLEW" : "FREE";
      padlockTrackEstablished = false;
      syncBanditPadlockRollAssist();
      return;
    }

    if (padlock) {
      const trackedPosition = padlockTarget === "carrier"
        ? this.carrierPadlockPosition
        : padlockTarget === "traffic2" ? this.wingman2Position
        : padlockTarget === "traffic3" ? this.wingman3Position
        : padlockTarget === "wingman" ? this.wingmanPosition
        : this.banditPosition;
      this.localTarget.copy(trackedPosition).sub(this.playerPosition).normalize();
      this.inversePlayerQuaternion.copy(this.playerQuaternion).invert();
      this.localTarget.applyQuaternion(this.inversePlayerQuaternion);
      const next = advancePadlockGimbal({
        localTarget: this.localTarget,
        yawRad: sensorYaw,
        pitchRad: sensorPitch,
        deltaSeconds: dt,
        aspect: this.camera.aspect,
        verticalFovRad: this.camera.fov * DEG,
        returning: gimbalReturnFast,
      });
      sensorYaw = next.yawRad;
      sensorPitch = next.pitchRad;
      if (next.shoulderHandoff) this.shoulderHandoffAtS = this.lastFrameNowSeconds ?? 0;
      if (next.trackingErrorRad < 0.6 * DEG) gimbalReturnFast = false;
      padlockPhase = next.trackingErrorRad < 1.5 * DEG
        ? "TRACK"
        : gimbalReturnFast ? "RETURN" : "ACQUIRE";
      if (padlockPhase === "TRACK") padlockTrackEstablished = true;
      syncBanditPadlockRollAssist();
    } else {
      const next = advanceForwardGimbal({
        yawRad: sensorYaw,
        pitchRad: sensorPitch,
        deltaSeconds: dt,
      });
      sensorYaw = next.yawRad;
      sensorPitch = next.pitchRad;
      if (next.trackingErrorRad < 0.25 * DEG) {
        gimbalReturnFast = false;
        padlockPhase = "OFF";
      } else {
        padlockPhase = "RETURN";
      }
      padlockTrackEstablished = false;
      syncBanditPadlockRollAssist();
    }
  }

  packEffectsActive() {
    return this.packEffectsAdapter !== null
      && this.visualRuntime?.adapters?.effects === this.packEffectsAdapter;
  }

  packEnvironmentActive() {
    return this.packEnvironmentAdapter !== null
      && this.visualRuntime?.adapters?.environment === this.packEnvironmentAdapter;
  }

  emitPackEffect(eventId, payload) {
    return this.packEffectsActive()
      && this.visualRuntime.dispatchEffect(eventId, payload) === true;
  }

  applyPackGunStyle(adapter = null) {
    const tracer = adapter?.effects?.profile?.events?.["event.weapon.gun-fire.v1"]?.tracer;
    const data = this.gunEffects.userData;
    const channels = [data.outgoingTracers, data.incomingTracers];
    if (tracer) {
      for (const channel of channels) {
        channel.tracers.material.color.set(tracer.color);
        channel.glow.material.color.set(tracer.coreColor ?? tracer.color);
        channel.heads.material.color.set(tracer.coreColor ?? tracer.color);
      }
      return;
    }
    data.outgoingTracers.tracers.material.color.set(0xffd36a);
    data.outgoingTracers.glow.material.color.set(0xff731d);
    data.outgoingTracers.heads.material.color.set(0xfff0b0);
    data.incomingTracers.tracers.material.color.set(0xff8b68);
    data.incomingTracers.glow.material.color.set(0xff2d1d);
    data.incomingTracers.heads.material.color.set(0xffe2c4);
  }

  updateBanditDestruction(alive, nowSeconds, forceSplash = false, eventPosition = null) {
    const effect = this.banditDestruction;
    if (this.packEffectsActive()) {
      // Authored one-shots belong to ordered simulation events. Health/alive edges are retained
      // only for legacy fallback state and must not create a second, causally unseeded explosion.
      this.banditWasAlive = alive;
      effect.visible = false;
      return;
    }
    const data = effect.userData;
    const fogDensity = Number(this.scene.fog?.density) || 0;
    for (const material of [data.outer.material, data.inner.material,
      ...data.smoke.map((puff) => puff.material)]) {
      material.uniforms.uFogColor.value.copy(this.fogColor);
      material.uniforms.uFogDensity.value = fogDensity;
    }
    if (forceSplash) {
      this.banditSplashTime = nowSeconds;
      this.banditDestructionForcedUntil = nowSeconds + 4.8;
      this.banditWasAlive = true;
      effect.position.copy(eventPosition ?? this.banditPosition);
      effect.visible = true;
    }

    const forced = nowSeconds < this.banditDestructionForcedUntil;
    if (alive && !forced) {
      this.banditWasAlive = true;
      this.banditSplashTime = -1;
      this.banditDestructionForcedUntil = -1;
      effect.visible = false;
      return;
    }

    if (!forced && (this.banditWasAlive || this.banditSplashTime < 0)) {
      this.banditSplashTime = nowSeconds;
      effect.position.copy(this.banditPosition);
      effect.visible = true;
    }
    if (forced && !forceSplash) this.banditWasAlive = alive;
    else if (!forced) this.banditWasAlive = false;

    const age = nowSeconds - this.banditSplashTime;
    if (age >= 4.8) {
      this.banditDestructionForcedUntil = -1;
      effect.visible = false;
      return;
    }

    effect.visible = true;
    const burst = clamp(age / 0.72, 0, 1);
    data.outer.scale.setScalar(1.5 + burst * 12.5);
    data.inner.scale.setScalar(0.9 + burst * 7.0);
    data.outer.material.uniforms.uAlpha.value = Math.max(0, 0.92 * (1 - age / 1.15));
    data.inner.material.uniforms.uAlpha.value = Math.max(0, 1 - age / 0.72);
    data.outer.material.uniforms.uAge.value = age;
    data.inner.material.uniforms.uAge.value = age;
    data.flash.intensity = Math.max(0, 68 * (1 - age / 0.48));

    const shockActive = age < 1.05;
    data.shockwave.visible = shockActive;
    if (shockActive) {
      data.shockwave.quaternion.copy(this.camera.quaternion);
      data.shockwave.scale.setScalar(1.5 + age * 19.0);
      data.shockwave.material.opacity = Math.max(0, 0.82 * (1 - age / 1.05));
    }

    const debrisActive = age < 2.4;
    data.debris.visible = debrisActive;
    if (debrisActive) {
      const debrisPositions = data.debrisPositions;
      const debrisDirections = data.debrisDirections;
      for (let i = 0; i < debrisDirections.length; i += 3) {
        const speed = 15 + (i / 3 % 7) * 1.7;
        debrisPositions[i] = debrisDirections[i] * age * speed;
        debrisPositions[i + 1] = debrisDirections[i + 1] * age * speed - 4.9 * age * age;
        debrisPositions[i + 2] = debrisDirections[i + 2] * age * speed;
      }
      data.debris.geometry.attributes.position.needsUpdate = true;
      data.debris.material.opacity = Math.max(0, 1 - age / 2.4);
    } else {
      data.debris.material.opacity = 0;
    }

    for (let i = 0; i < data.smoke.length; i++) {
      const puff = data.smoke[i];
      const puffAge = age - puff.userData.delay;
      if (puffAge <= 0) {
        puff.visible = false;
        continue;
      }
      puff.visible = true;
      puff.position.copy(puff.userData.direction).multiplyScalar(puffAge * (4.8 + i * 0.45));
      puff.position.y += puffAge * 4.6;
      puff.scale.setScalar(2.2 + puffAge * (3.3 + i * 0.12));
      puff.material.uniforms.uAge.value = puffAge;
      puff.material.uniforms.uAlpha.value = Math.max(
        0, Math.min(0.58, puffAge * 1.4) * (1 - age / 4.8),
      );
    }
  }

  muzzleWorldPosition(slot, semanticId, fallbackPosition, forward, right,
    fallbackForwardOffset, fallbackLateralOffset, out) {
    const anchor = this.presentationAssets.semanticAnchor(slot, semanticId);
    if (anchor) {
      anchor.getWorldPosition(out);
      return out;
    }
    return out.copy(fallbackPosition)
      .addScaledVector(forward, fallbackForwardOffset)
      .addScaledVector(right, fallbackLateralOffset);
  }

  updateGunEffects(state, nowSeconds) {
    const data = this.gunEffects.userData;
    const packEffectsActive = this.packEffectsActive();
    const authoredTracerLength = packEffectsActive
      ? this.packEffectsAdapter.effects.profile.events?.["event.weapon.gun-fire.v1"]
        ?.tracer?.lengthMetres
      : null;
    updateTracerChannel(data.outgoingTracers, state.tracers, authoredTracerLength);
    updateTracerChannel(data.incomingTracers, state.opponent_tracers, authoredTracerLength);

    const roundsFired = Number(state.rounds_fired) || 0;
    if (roundsFired < this.lastRoundsFired) this.lastRoundsFired = roundsFired;
    const playerFired = roundsFired > this.lastRoundsFired;
    if (playerFired) this.muzzleFlashUntil = nowSeconds + 0.048;
    this.lastRoundsFired = roundsFired;
    const playerWeaponSlot = this.presentationAssets.cockpitSlot.root.visible
      ? this.presentationAssets.cockpitSlot
      : this.presentationAssets.playerExteriorSlot;
    this.muzzleWorldPosition(
      playerWeaponSlot, "muzzle.left", this.playerPosition, this.playerForward, this.playerRight,
      6.25, -0.42, this.playerMuzzleLeftPosition,
    );
    this.muzzleWorldPosition(
      playerWeaponSlot, "muzzle.right", this.playerPosition, this.playerForward, this.playerRight,
      6.25, 0.42, this.playerMuzzleRightPosition,
    );
    if (playerFired && packEffectsActive) {
      this.emitPackEffect("event.weapon.gun-fire.v1", {
        position: this.playerMuzzleLeftPosition,
        direction: this.playerForward,
        tracer: false,
      });
      this.emitPackEffect("event.weapon.gun-fire.v1", {
        position: this.playerMuzzleRightPosition,
        direction: this.playerForward,
        tracer: false,
      });
    }
    updateMuzzleChannel(
      data.playerMuzzle,
      !packEffectsActive && nowSeconds < this.muzzleFlashUntil,
      this.playerMuzzleLeftPosition,
      this.playerForward,
      this.playerQuaternion,
      roundsFired,
      0.12,
      0.85,
      22,
    );
    updateMuzzleChannel(
      data.playerMuzzleRight,
      !packEffectsActive && nowSeconds < this.muzzleFlashUntil,
      this.playerMuzzleRightPosition,
      this.playerForward,
      this.playerQuaternion,
      roundsFired + 1,
      0.12,
      0.85,
      22,
    );

    const opponentRoundsFired = Number(state.opponent_rounds_fired) || 0;
    if (opponentRoundsFired < this.lastOpponentRoundsFired) {
      this.lastOpponentRoundsFired = opponentRoundsFired;
    }
    const opponentFired = opponentRoundsFired > this.lastOpponentRoundsFired;
    if (opponentFired) {
      this.opponentMuzzleFlashUntil = nowSeconds + 0.048;
    }
    this.lastOpponentRoundsFired = opponentRoundsFired;
    this.muzzleWorldPosition(
      this.presentationAssets.targetSlot,
      "muzzle.left",
      this.banditPosition,
      this.banditFrame.forward,
      this.banditFrame.right,
      3.9,
      -0.4,
      this.opponentMuzzleLeftPosition,
    );
    this.muzzleWorldPosition(
      this.presentationAssets.targetSlot,
      "muzzle.right",
      this.banditPosition,
      this.banditFrame.forward,
      this.banditFrame.right,
      3.9,
      0.4,
      this.opponentMuzzleRightPosition,
    );
    if (opponentFired && packEffectsActive) {
      this.emitPackEffect("event.weapon.gun-fire.v1", {
        position: this.opponentMuzzleLeftPosition,
        direction: this.banditFrame.forward,
        tracer: false,
      });
      this.emitPackEffect("event.weapon.gun-fire.v1", {
        position: this.opponentMuzzleRightPosition,
        direction: this.banditFrame.forward,
        tracer: false,
      });
    }
    updateMuzzleChannel(
      data.opponentMuzzle,
      !packEffectsActive && nowSeconds < this.opponentMuzzleFlashUntil,
      this.opponentMuzzleLeftPosition,
      this.banditFrame.forward,
      this.banditQuaternion,
      opponentRoundsFired,
      0.12,
      0.8,
      16,
    );
    updateMuzzleChannel(
      data.opponentMuzzleRight,
      !packEffectsActive && nowSeconds < this.opponentMuzzleFlashUntil,
      this.opponentMuzzleRightPosition,
      this.banditFrame.forward,
      this.banditQuaternion,
      opponentRoundsFired + 1,
      0.12,
      0.8,
      16,
    );

    const hits = Number(state.hits) || 0;
    if (hits < this.lastHitCount) this.lastHitCount = hits;
    // v1.1 uses ordered events so a splash inside a multi-tick Advance cannot erase the edge.
    // Retain the cumulative counter only as compatibility for an older snapshot.
    if (!Array.isArray(state.recent_events) && hits > this.lastHitCount) {
      this.hitSparkTime = nowSeconds;
    }
    this.lastHitCount = hits;
    const sparkAge = nowSeconds - this.hitSparkTime;
    const sparksActive = !packEffectsActive && sparkAge >= 0 && sparkAge < 0.34;
    data.sparks.visible = sparksActive;
    if (sparksActive) {
      const sparkPositions = data.sparkPositions;
      const directions = data.sparkDirections;
      for (let i = 0; i < directions.length; i += 3) {
        const velocity = 18 + (i / 3) * 1.15;
        sparkPositions[i] = this.banditPosition.x + directions[i] * sparkAge * velocity;
        sparkPositions[i + 1] = this.banditPosition.y + directions[i + 1] * sparkAge * velocity
          - 4.9 * sparkAge * sparkAge;
        sparkPositions[i + 2] = this.banditPosition.z + directions[i + 2] * sparkAge * velocity;
      }
      data.sparks.geometry.attributes.position.needsUpdate = true;
      data.sparks.material.opacity = 1 - sparkAge / 0.34;
      data.hitLight.position.copy(this.banditPosition);
      data.hitLight.intensity = 18 * (1 - sparkAge / 0.34);
    } else {
      data.sparks.material.opacity = 0;
      data.hitLight.intensity = 0;
    }
  }

  updateDamageSmoke(state, nowSeconds, fogDensity) {
    const banditHealth = Number(state.bandit_health ?? state.opponent_health);
    const playerHealth = Number(state.player_health);
    const banditAlive = aircraftAlive(state, "opponent_terminal_state",
      state.bandit_alive !== false && state.opponent_alive !== false);
    const playerAlive = aircraftAlive(state, "player_terminal_state", state.player_alive !== false);
    const damageAnchor = this.presentationAssets.semanticAnchor(
      this.presentationAssets.targetSlot,
      "damage.center",
    );
    if (damageAnchor) damageAnchor.getWorldPosition(this.banditDamagePosition);
    else this.banditDamagePosition.copy(this.banditPosition);

    if (banditAlive && Number.isFinite(banditHealth) && banditHealth < 0.999) {
      this.banditDamageSmoke.emit(this.banditDamagePosition, nowSeconds);
    }
    if (playerAlive && Number.isFinite(playerHealth) && playerHealth < 0.999) {
      this.playerDamagePosition.copy(this.playerPosition).addScaledVector(this.playerForward, -3.8);
      this.playerDamageSmoke.emit(this.playerDamagePosition, nowSeconds);
    }
    const pixelRatio = this.renderer.getPixelRatio();
    this.banditDamageSmoke.update(nowSeconds, this.fogColor, fogDensity, pixelRatio);
    this.playerDamageSmoke.update(nowSeconds, this.fogColor, fogDensity, pixelRatio);
  }

  consumeCombatEvents(state, nowSeconds) {
    const consumption = this.combatEventStreams.consume(
      state.event_stream_id,
      state.recent_events,
    );
    if (consumption.streamChanged) {
      this.packEffectsAdapter?.clear?.();
      this.playerDamageSmoke.clear();
      this.banditDamageSmoke.clear();
      this.hitSparkTime = -1;
      this.muzzleFlashUntil = -1;
      this.opponentMuzzleFlashUntil = -1;
      this.lastRoundsFired = Number(state.rounds_fired) || 0;
      this.lastOpponentRoundsFired = Number(state.opponent_rounds_fired) || 0;
      this.lastHitCount = Number(state.hits) || 0;
      this.banditSplashTime = -1;
      this.banditDestructionForcedUntil = -1;
      this.banditDestruction.visible = false;
    }
    this.lastCombatEventSequence = consumption.cursor;

    for (const event of consumption.events) {
      this.hud.noteCombatEvent?.(event, nowSeconds);
      const recordedPosition = presentationVector(event.position);
      const position = recordedPosition
        ? this.combatEventPosition.set(...recordedPosition)
        : event.target === "PLAYER" ? this.playerPosition : this.banditPosition;
      if (event.type === "HIT" && event.target === "OPPONENT") {
        this.hitSparkTime = nowSeconds;
        this.effectNormal.copy(this.banditPosition).sub(this.playerPosition).normalize();
        this.emitPackEffect("event.weapon.gun-impact.v1", {
          position,
          normal: this.effectNormal,
          seed: event.sequence,
        });
      } else if (event.type === "HIT" && event.target === "PLAYER") {
        this.effectNormal.copy(this.playerPosition).sub(this.banditPosition).normalize();
        this.emitPackEffect("event.weapon.gun-impact.v1", {
          position,
          normal: this.effectNormal,
          seed: event.sequence,
        });
      }
    }

    for (const event of terminalVisualEvents(consumption.events)) {
      const recordedPosition = presentationVector(event.position);
      const recordedVelocity = presentationVector(event.velocity);
      const position = recordedPosition
        ? this.combatEventPosition.set(...recordedPosition)
        : event.target === "PLAYER" ? this.playerPosition : this.banditPosition;
      const velocity = recordedVelocity
        ? this.combatEventVelocity.set(...recordedVelocity)
        : undefined;
      if (this.packEffectsActive()) {
        this.emitPackEffect("event.vehicle.destroyed.v1", {
          position,
          velocity,
          seed: event.sequence,
        });
        if (event.target === "OPPONENT") this.banditWasAlive = false;
      } else if (event.target === "OPPONENT") {
        // A replacement may already own banditPosition when an older detached wreck reaches the
        // surface. Anchor the fallback burst to the event's immutable physics pose, not the live
        // target slot, so an old impact cannot make the current opponent appear to explode.
        this.updateBanditDestruction(true, nowSeconds, true, position);
      }
    }
  }

  update(state, dt, nowSeconds) {
    this.configureTerrainMission(state);
    // The sortie chooser owns Ready. Defer the manifest and all height ranges until gameplay has
    // actually begun, then retain the single shared presentation across pause/replay/restage.
    // Only fetch the multi-megabyte visual terrain when the sim actually has a terrain surface.
    // Constrained builds can explicitly omit terrain truth and retain the sea-level fallback.
    if (state?.ready !== true && state?.terrain_present === true) {
      void this.ensureTerrainPresentation(state);
    }
    const terrainDiagnostics = this.terrainPresentation?.diagnostics?.();
    const radarAltitudeFt = Number(state?.radar_altitude_ft);
    if (state?.terrain_micro_required !== true && Number.isFinite(radarAltitudeFt)) {
      if (radarAltitudeFt >= 12_000 && terrainDiagnostics?.ambientSceneryEnabled === true) {
        void this.terrainPresentation.disableAmbientScenery?.();
      } else if (radarAltitudeFt <= 6_000
        && this.terrainGovernorSuppressesAmbientScenery !== true
        && terrainDiagnostics?.ambientSceneryEnabled === false) {
        void this.terrainPresentation.enableAmbientScenery?.();
      }
    }
    const nextBanditEntityId = projectedId(state.bandit_entity_id);
    // Padlock is bound to a specific visual tally. It may not silently transfer to a replacement
    // drone/bandit, survive loss of consciousness, or keep tracking stale/replay geometry.
    if (padlock && state.pilot_conscious === false) {
      releasePadlock("pilot incapacitated");
    } else if (padlock && padlockTarget === "carrier"
        && carrierPadlockSupersededByCombat(state)) {
      releasePadlock("combat task");
    } else if (padlock && padlockTarget === "bandit" && padlockEntityId
        && nextBanditEntityId !== padlockEntityId) {
      // The primary slot changed under the lock. A promoted wingman is the SAME engagement still
      // running, and making the pilot re-find it by hand is exactly the complaint; a replacement
      // WAVE is a new tally and must still be acquired deliberately, which is the contract that
      // stops a lock silently transferring to an aircraft the pilot never saw arrive.
      if (Number(state.engagement_number) === padlockEngagement
        && padlockTargetValid(state, "bandit")) {
        acquirePadlock("bandit", "auto-jump");
        syncPadlockUi("BANDIT padlock · wingman engaged");
      } else {
        releasePadlock("target changed");
      }
    } else if (padlock && !padlockTargetValid(state, padlockTarget)) {
      // KILL CAM: the lock survives the death of the thing it was locked to, for a beat.
      const nowMs = nowSeconds * 1000;
      if (!padlockKillCamUntilMs) padlockKillCamUntilMs = nowMs + PADLOCK_KILL_CAM_MS;
      const survivor = survivingPadlockTarget(state);
      const heldMs = PADLOCK_KILL_CAM_MS - (padlockKillCamUntilMs - nowMs);
      const cutShort = heldMs >= PADLOCK_KILL_CAM_MINIMUM_MS
        && survivor !== null && contactThreateningPlayer(state, survivor);
      if (nowMs < padlockKillCamUntilMs && !cutShort) {
        padlockPhase = "SPLASH";
      } else if (survivor) {
        acquirePadlock(survivor, cutShort ? "threat" : "auto-jump");
        if (cutShort) syncPadlockUi(`${padlockLabel()} padlock · THREAT`);
      } else {
        releasePadlock("target unavailable");
      }
    } else if (padlock) {
      padlockKillCamUntilMs = 0;
    }
    const playerFrame = this.frameFromState(state, "p", this.playerFrame);
    const banditFrame = this.frameFromState(state, "b", this.banditFrame);
    const nextPlayerEntityId = projectedId(state.player_entity_id);
    if (this.banditEntityId && nextBanditEntityId !== this.banditEntityId) {
      this.banditDamageSmoke.clear();
      this.banditContact.reset();
    }
    if (this.playerEntityId && nextPlayerEntityId !== this.playerEntityId) {
      this.playerDamageSmoke.clear();
      this.cockpitHead.reset(state);
    }
    this.banditEntityId = nextBanditEntityId;
    this.playerEntityId = nextPlayerEntityId;

    this.playerPosition.set(state.px, state.py, -state.pz);
    this.playerForward.copy(playerFrame.forward);
    this.playerUp.copy(playerFrame.up);
    this.playerRight.copy(playerFrame.right);
    this.playerQuaternion.copy(playerFrame.quaternion);
    this.banditPosition.set(state.bx, state.by, -state.bz);
    if (state.recovery_platform === true && Number.isFinite(state.cx)
        && Number.isFinite(state.cy) && Number.isFinite(state.cz)) {
      this.carrierPosition.set(state.cx, state.cy, -state.cz);
      if (Number.isFinite(state.tx) && Number.isFinite(state.ty) && Number.isFinite(state.tz)) {
        this.carrierPadlockPosition.set(state.tx, state.ty, -state.tz);
      } else {
        this.carrierPadlockPosition.copy(this.carrierPosition);
      }
    }
    this.banditQuaternion.copy(banditFrame.quaternion);
    if (state.w1_present === 1) {
      this.wingmanPosition.set(state.w1x, state.w1y, -state.w1z);
      // The hot-frame wingman fields deliberately follow the same ${prefix}fx/${prefix}lx naming
      // as the player and primary, so the existing attitude helper reads them unchanged.
      this.wingmanQuaternion.copy(
        this.frameFromState(state, "w1", this.wingmanFrame).quaternion);
    }
    if (state.w2_present === 1) {
      this.wingman2Position.set(state.w2x, state.w2y, -state.w2z);
      this.wingman2Quaternion.copy(
        this.frameFromState(state, "w2", this.wingman2Frame).quaternion);
    }
    if (state.w3_present === 1) {
      this.wingman3Position.set(state.w3x, state.w3y, -state.w3z);
      this.wingman3Quaternion.copy(
        this.frameFromState(state, "w3", this.wingman3Frame).quaternion);
    }
    if (state.rd1_present === 1) {
      this.rapierGunDronePosition.set(state.rd1x, state.rd1y, -state.rd1z);
      this.rapierGunDroneQuaternion.copy(
        this.frameFromState(state, "rd1", this.rapierGunDroneFrame).quaternion);
    }
    if (state.lead_valid === true && Number.isFinite(state.lead_x)
      && Number.isFinite(state.lead_y) && Number.isFinite(state.lead_z)) {
      this.leadPipper.set(state.lead_x, state.lead_y, -state.lead_z);
    }
    this.consumeCombatEvents(state, nowSeconds);

    const replayExternal = state.replay_external === true;
    const replayCamera = String(state.replay_camera || "CHASE");
    this.externalCameraActive = replayExternal && replayCamera !== "COCKPIT";
    this.presentationAssets.sync(state);
    this.ensureVisualRuntime();
    const cockpitRoot = this.presentationAssets.cockpitSlot.root;
    const playerExteriorRoot = this.presentationAssets.playerExteriorSlot.root;
    cockpitRoot.position.copy(this.playerPosition);
    cockpitRoot.quaternion.copy(this.playerQuaternion);
    cockpitRoot.scale.setScalar(1);
    cockpitRoot.updateMatrixWorld(true);
    playerExteriorRoot.position.copy(this.playerPosition);
    playerExteriorRoot.quaternion.copy(this.playerQuaternion);
    playerExteriorRoot.scale.setScalar(1);
    playerExteriorRoot.updateMatrixWorld(true);

    const gunsightAnchor = cockpitRoot.visible
      ? this.presentationAssets.semanticAnchor(
        this.presentationAssets.cockpitSlot,
        "gunsight.origin",
      )
      : null;
    if (gunsightAnchor !== this.periodGunsight.anchor) {
      if (gunsightAnchor) this.periodGunsight.attach(gunsightAnchor);
      else this.periodGunsight.detach();
    }

    if (replayExternal) {
      // Recorded aircraft and carrier motion own the scene. The camera is presentation-only and
      // tracks only recorded frames. Camera choice cannot feed back into physics or replay time.
      if (replayCamera === "COCKPIT") {
        this.camera.position.copy(this.playerPosition)
          .addScaledVector(this.playerUp, 0.6)
          .addScaledVector(this.playerForward, 4.0);
        this.camera.quaternion.copy(this.playerQuaternion);
      } else if (replayCamera === "DECK") {
        const heading = Number(state.cheading) || 0;
        this.camera.position.copy(this.carrierPosition);
        this.camera.position.x -= Math.sin(heading) * 82;
        this.camera.position.y += 23;
        this.camera.position.z += Math.cos(heading) * 82;
        this.localTarget.copy(this.playerPosition).addScaledVector(this.playerUp, 2);
        this.camera.up.set(0, 1, 0);
        this.camera.lookAt(this.localTarget);
      } else {
        this.camera.position.copy(this.playerPosition)
          .addScaledVector(this.playerForward, -28)
          .addScaledVector(this.playerUp, 10)
          .addScaledVector(this.playerRight, 16);
        this.localTarget.copy(this.playerPosition)
          .addScaledVector(this.playerForward, 5)
          .addScaledVector(this.playerUp, 1.5);
        this.camera.up.set(0, 1, 0);
        this.camera.lookAt(this.localTarget);
      }
    } else {
      this.updateGimbal(dt);
      const cockpitCamera = cockpitRoot.visible
        ? this.presentationAssets.semanticAnchor(
          this.presentationAssets.cockpitSlot,
          "camera.cockpit",
        )
        : null;
      if (cockpitCamera) {
        cockpitCamera.getWorldPosition(this.camera.position);
      } else {
        // Pack-neutral compatibility eye point. Authored cockpits own their precise camera
        // placement through the camera.cockpit semantic anchor above.
        this.camera.position.copy(this.playerPosition)
          .addScaledVector(this.playerUp, 0.6)
          .addScaledVector(this.playerForward, 4.0);
      }
      // Positive sensor yaw means look right. In three.js local +Y rotation turns -Z left,
      // hence the deliberate negative sign here.
      this.localYawQuaternion.setFromAxisAngle(this.yAxis, -sensorYaw);
      this.localPitchQuaternion.setFromAxisAngle(this.xAxis, sensorPitch);
      this.localGimbalQuaternion.copy(this.localYawQuaternion).multiply(this.localPitchQuaternion);
      this.camera.quaternion.copy(this.playerQuaternion).multiply(this.localGimbalQuaternion);
    }
    // Padlock is an orientation aid, not a cinematic camera. Applying buffet/head-lag after the
    // target solve makes the contact and every view-relative cue wander by a degree or two.
    if (replayExternal || padlock) this.cockpitHead.reset(state);
    else this.cockpitHead.update(this.camera, state, dt);
    this.camera.updateMatrixWorld(true);
    const gunsightPresentation = this.periodGunsight.update(this.camera, state, dt);
    if (this.cloudBreakActive) {
      this.cloudBreakPresentation = this.tacticalClouds.updateCloudBreak({
        camera: this.camera,
        nowSeconds,
        terrainStats: this.terrainPresentation?.diagnostics() ?? null,
        trueAirspeedKts: state.true_airspeed_kts,
      });
      this.cloudBreakActive = this.cloudBreakPresentation.active;
    }
    const cloudBreak = this.cloudBreakPresentation;

    const cameraAltitude = Math.max(0, this.camera.position.y);
    let fogDensity;
    if (this.packEnvironmentActive()) {
      // The pack owns the sky, ocean, cloud layers, and linear scene fog. Keep a small equivalent
      // density only for legacy custom shaders that still consume an exponential scalar.
      this.fogColor.copy(this.scene.fog?.color ?? this.fogLow);
      fogDensity = 1 / Math.max(1, Number(this.scene.fog?.far) || 56000);
    } else {
      const atmosphereMix = smoothstep(1800, 14000, cameraAltitude);
      // Visibility is weather truth, but it may never exceed the distance at which the world
      // actually stops. Streamed radius and fog are ONE knob: a 12 km world under 100 km
      // visibility draws terrain that ends at a dead-straight chunk boundary in clear air. The
      // pilot filed that as "still getting some z buffer issues I think" — it is not a depth
      // artefact, it is the edge of the map with no haze over it, and the frame governor created
      // it in Build 114 by shedding view distance without closing the visibility behind it.
      // The VISUAL edge, not the streaming edge. With a horizon apron the world continues far
      // past the last streamed chunk, so capping fog at the chunk radius needlessly closed the
      // view — and forcing the radius up to reopen it streamed a huge disc of chunks for terrain
      // that is not authored out there. Falls back to the streaming radius when there is no apron.
      const worldRadiusM = Number(this.terrainPresentation?.visibleWorldRadiusM
        ?? this.terrainPresentation?.streamingRadiusM);
      const reportedVisibilityM = clamp(
        Math.min(
          Number(state.visibility_m) || CLEAR_AIR_VISIBILITY_M,
          Number.isFinite(worldRadiusM) && worldRadiusM > 0
            // Fog reaches 2% transmission at the reported visibility, so closing it slightly
            // INSIDE the geometric edge is what actually hides the boundary rather than tinting it.
            ? worldRadiusM * WORLD_EDGE_VISIBILITY_FRACTION
            : Number.POSITIVE_INFINITY,
        ),
        150,
        200_000,
      );
      const baseFogDensity = fogDensityForVisibility(reportedVisibilityM);
      this.fogColor.copy(this.fogLow).lerp(this.fogHigh, atmosphereMix);
      // Layer/cell definitions describe the weather around the aircraft; local cloud fraction
      // only says whether the eye point is presently in condensate. Never hide nearby clouds just
      // because the pilot is flying through one of the holes between them.
      const cloudTruthActive = PRODUCTION_SIMULATED_CLOUDS_ENABLED
        && ((Array.isArray(state.weather_layers) && state.weather_layers.length > 0)
          || (Array.isArray(state.weather_cells) && state.weather_cells.length > 0));
      this.tacticalClouds.group.visible = cloudTruthActive || cloudBreak.active;
      if (this.tacticalClouds.cloudMesh) {
        this.tacticalClouds.cloudMesh.visible = cloudTruthActive;
        this.tacticalClouds.shadowMesh.visible = cloudTruthActive;
      }
      if (cloudTruthActive) {
        this.tacticalClouds.configureFromState(state);
        this.tacticalClouds.update(
          this.camera.position,
          Number(state.t) || 0,
          this.fogColor,
          baseFogDensity,
          SUN_DIRECTION,
        );
      }
      // Visibility is the exact LayeredCloudField sample from WASM. The renderer changes the
      // scattering colour while inside condensate, but must not add a second invented extinction.
      const localCloudFraction = clamp(Number(state.cloud_fraction_01) || 0, 0, 1);
      const localExtinction = Math.max(0, Number(state.cloud_extinction_per_m) || 0);
      fogDensity = Math.max(baseFogDensity, cloudBreak.fogDensity || 0);
      let cloudColorMix = 0;
      if (localCloudFraction > 0.001 || localExtinction > 0) {
        cloudColorMix = clamp(localCloudFraction * 1.18 + localExtinction * 18, 0, 0.88);
      }
      cloudColorMix = Math.max(cloudColorMix, (cloudBreak.opacity || 0) * 0.94);
      if (cloudColorMix > 0) this.fogColor.lerp(this.cloudFogColor, cloudColorMix);
      this.scene.fog.color.copy(this.fogColor);
      this.scene.fog.density = fogDensity;
    }

    // The bridge owns the one terrain-frame transform used by both physics and presentation.
    // Shared-world sorties apply the inverse room origin; authored hero/coastal/Rapier cells use
    // their mission contract's fixed source anchor and remain excluded from remote presentation.
    const terrainPlacementEastM = Number(state.terrain_placement_east_m);
    const terrainPlacementNorthM = Number(state.terrain_placement_north_m);
    this.terrainPresentation?.update({
      cameraPosition: this.camera.position,
      deltaSeconds: dt,
      fogColor: this.fogColor,
      fogDensity,
      sunDirection: SUN_DIRECTION,
      placementEastM: Number.isFinite(terrainPlacementEastM) ? terrainPlacementEastM : 0,
      placementNorthM: Number.isFinite(terrainPlacementNorthM) ? terrainPlacementNorthM : 0,
    });

    const isCarrier = state.carrier === true;
    const isRecoveryPlatform = state.recovery_platform === true;
    const banditAlive = aircraftAlive(state, "opponent_terminal_state",
      state.bandit_alive !== false && state.fight !== "Splash");
    const banditBodyPresent = state.opponent_body_present !== false
      && state.rapier_pattern_only !== true;
    const targetRoot = this.presentationAssets.targetSlot.root;
    const carrierRoot = this.presentationAssets.carrierSlot.root;
    const escortRoot = this.presentationAssets.escortSlot.root;
    targetRoot.visible = banditBodyPresent;
    carrierRoot.visible = isRecoveryPlatform;
    escortRoot.visible = isCarrier && PRODUCTION_ESCORT_PRESENTATION_ENABLED;
    if (isRecoveryPlatform) {
      // Sim frame X=east, Y=up, Z=north; render flips Z. Deck-centre origin at deck height.
      // The hull follows the moving deck's bow-up pitch; water effects use a separate level root.
      applyCarrierRootPose(THREE, carrierRoot, state, {
        followPitch: true,
        scratch: this.carrierRuntime.poseScratch,
      });
      // Presentation formation is derived only from the projected carrier frame. The model origin
      // sits five metres above its waterline socket; formation truth remains outside the renderer.
      if (isCarrier) {
        applyEscortFormationPose(THREE, escortRoot, state, {
          station: "starboard-quarter",
          alongMetres: -760,
          crossMetres: 460,
          waterlineY: 5,
        });
      }
      const carrierVisual = this.presentationAssets.carrierSlot.object;
      if (isCarrier && carrierVisual?.userData.structure) {
        updateCarrierVisual(
          carrierVisual,
          state,
          nowSeconds,
          this.fogColor,
          fogDensity,
          carrierRoot.position.y,
        );
      }
      if (Number.isFinite(state.ax)) this.aimPoint.set(state.ax, state.ay, -state.az);
      else if (Number.isFinite(state.tx)) this.aimPoint.set(state.tx, state.ty, -state.tz);
      this.approachCueDirection.copy(this.aimPoint).sub(this.playerPosition);
      const cueHorizontal = Math.hypot(
        this.approachCueDirection.x,
        this.approachCueDirection.z,
      );
      const directorOffset = Number(state.approach_director_pitch_deg) * DEG;
      if (cueHorizontal > 1e-6 && Number.isFinite(directorOffset)) {
        const directorPitch = Math.atan2(this.approachCueDirection.y, cueHorizontal)
          + directorOffset;
        const directorHorizontal = Math.cos(directorPitch);
        this.approachDirectorPoint.set(
          this.approachCueDirection.x / cueHorizontal * directorHorizontal,
          Math.sin(directorPitch),
          this.approachCueDirection.z / cueHorizontal * directorHorizontal,
        ).multiplyScalar(10000).add(this.playerPosition);
      }
      this.deckRelativeVelocity.set(state.deck_vx, state.deck_vy, -state.deck_vz);
      if (this.deckRelativeVelocity.lengthSq() > 1e-6) {
        this.deckFlightPathPoint.copy(this.playerPosition)
          .addScaledVector(this.deckRelativeVelocity.normalize(), 10000);
      }
    }
    // Fail-silent: flight_audio disables itself permanently on any error rather than
    // letting an audio problem reach the flight kernel. Mute follows player settings.
    updateFlightAudio(state, {
      muted: !playerSettings.audio,
      triggerHeld: isGkeyHeld(8),
      nowSeconds,
    });
    updateCarrierRuntimePresentation(
      this.carrierRuntime,
      this.presentationAssets.carrierSlot.object,
      state,
      nowSeconds,
      this.fogColor,
      fogDensity,
    );
    // Deliberately do not dispatch event.platform.wake.v1 here. The pack's one-shot showcase wake
    // has no moving-anchor contract; production keeps the continuously attached, sea-level shader
    // wake driven by authoritative carrier pose until that contract can preserve ship motion.

    targetRoot.position.copy(this.banditPosition);
    targetRoot.quaternion.copy(this.banditQuaternion);
    const wingmanRoot = this.presentationAssets.wingmanSlot.root;
    const wingmanPresent = state.w1_present === 1 && state.w1_alive === 1;
    wingmanRoot.visible = wingmanPresent;
    if (wingmanPresent) {
      wingmanRoot.position.copy(this.wingmanPosition);
      wingmanRoot.quaternion.copy(this.wingmanQuaternion);
      wingmanRoot.scale.setScalar(1);
      wingmanRoot.updateMatrixWorld(true);
    }
    const wingman2Root = this.presentationAssets.wingman2Slot.root;
    const wingman2Present = state.w2_present === 1 && state.w2_alive === 1;
    wingman2Root.visible = wingman2Present;
    if (wingman2Present) {
      wingman2Root.position.copy(this.wingman2Position);
      wingman2Root.quaternion.copy(this.wingman2Quaternion);
      wingman2Root.scale.setScalar(1);
      wingman2Root.updateMatrixWorld(true);
    }
    const wingman3Root = this.presentationAssets.wingman3Slot.root;
    const wingman3Present = state.w3_present === 1 && state.w3_alive === 1;
    wingman3Root.visible = wingman3Present;
    if (wingman3Present) {
      wingman3Root.position.copy(this.wingman3Position);
      wingman3Root.quaternion.copy(this.wingman3Quaternion);
      wingman3Root.scale.setScalar(1);
      wingman3Root.updateMatrixWorld(true);
    }
    const rapierGunDroneRoot = this.presentationAssets.rapierGunDroneSlot.root;
    const rapierGunDronePresent = state.rd1_present === 1 && state.rd1_alive === 1;
    rapierGunDroneRoot.visible = rapierGunDronePresent;
    if (rapierGunDronePresent) {
      rapierGunDroneRoot.position.copy(this.rapierGunDronePosition);
      rapierGunDroneRoot.quaternion.copy(this.rapierGunDroneQuaternion);
      rapierGunDroneRoot.scale.setScalar(1);
      rapierGunDroneRoot.updateMatrixWorld(true);
    }
    // Keep authored geometry at physical scale. A separate depth-tested contact owns the exact
    // 8–14 px readability floor and fades with hysteresis at the mesh hand-off.
    targetRoot.scale.setScalar(1);
    targetRoot.updateMatrixWorld(true);
    const contact = this.banditContact.update({
      camera: this.camera,
      renderer: this.renderer,
      target: targetRoot,
      targetDiameterMetres: this.presentationAssets.targetSlot.boundingSphereDiameterMetres ?? 12,
      visible: banditBodyPresent && banditAlive,
      deltaSeconds: dt,
    });
    targetRoot.visible = banditBodyPresent && (!banditAlive || contact.modelVisible);
    const targetVisual = this.presentationAssets.targetSlot.object;
    if (targetVisual?.userData.rotodome) targetVisual.userData.rotodome.rotation.y = nowSeconds * 0.42;
    this.updateBanditDestruction(banditAlive, nowSeconds);
    this.updateGunEffects(state, nowSeconds);
    this.updateDamageSmoke(state, nowSeconds, fogDensity);
    this.remoteAircraft.update(dt, this.camera.position, { historicalReplay: replayExternal });

    this.sky.mesh.position.copy(this.camera.position);
    this.sky.uniforms.uAltitude.value = cameraAltitude;
    if (!this.packEnvironmentAdapter) {
      const terrainId = this.terrainPresentation?.diagnostics?.().terrainId;
      // Far field over Ukraine (and any land theatre) is the horizon apron, not ocean. The
      // decision-support sea only fills the frame when there is no terrain presentation at all.
      this.sea.mesh.visible = !terrainId;
    }
    this.sea.mesh.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.sea.uniforms.uAltitude.value = cameraAltitude;
    this.sea.uniforms.uFogColor.value.copy(this.fogColor);
    this.sea.uniforms.uFogDensity.value = fogDensity;
    this.sea.uniforms.uTime.value = nowSeconds;
    const windTargetX = Number(state.wind_x_mps) || 0;
    const windTargetZ = -(Number(state.wind_z_mps) || 0); // simulation Z is negated in render space
    const windBlend = expStep(0.55, dt); // weather/turbulence changes must not rotate the sea frame-to-frame
    this.sea.uniforms.uWind.value.x += (windTargetX - this.sea.uniforms.uWind.value.x) * windBlend;
    this.sea.uniforms.uWind.value.y += (windTargetZ - this.sea.uniforms.uWind.value.y) * windBlend;
    this.sea.uniforms.uWindSpeed.value = this.sea.uniforms.uWind.value.length();

    const shadowFocus = isRecoveryPlatform ? carrierRoot.position : this.playerPosition;
    if (this.visualRuntime?.initialized) {
      // Establish the authored sun direction first; the shared runtime then owns shadow-map
      // bounds, texel snapping, adaptive resolution, post-processing and the final color transform.
      this.sunTarget.position.copy(shadowFocus);
      this.sun.position.copy(shadowFocus).addScaledVector(SUN_DIRECTION, 1600);
      this.visualRuntime.update({
        deltaSeconds: dt,
        elapsedSeconds: nowSeconds,
        frameTimeMs: dt * 1000,
        mode: replayExternal ? "replay" : isRecoveryPlatform ? "carrier" : "combat",
        shadowFocus,
      });
      this.visualRuntime.render(dt);
    } else {
      this.updateSunAndShadows(isRecoveryPlatform, carrierRoot);
      this.renderer.render(this.scene, this.camera);
    }
    const hudFrame = this.hudFrame;
    hudFrame.state = state;
    hudFrame.aimPoint = isRecoveryPlatform ? this.aimPoint : null;
    hudFrame.directorPoint = isRecoveryPlatform ? this.approachDirectorPoint : null;
    hudFrame.flightPathPoint = isRecoveryPlatform ? this.deckFlightPathPoint : null;
    hudFrame.sensorYaw = sensorYaw;
    hudFrame.sensorPitch = sensorPitch;
    // The HUD frame carries the same current eye-line offsets that orient the render camera.
    // Forward symbology can therefore remain airframe-referenced during drag/two-finger look and
    // throughout the smooth return to boresight. Padlock retains its existing sensor contract.
    hudFrame.lookYaw = padlock ? 0 : sensorYaw;
    hudFrame.lookPitch = padlock ? 0 : sensorPitch;
    hudFrame.padlock = padlock;
    hudFrame.padlockTarget = padlockTarget;
    hudFrame.wingmanPresent = state.w1_present === 1 && state.w1_alive === 1;
    hudFrame.padlockPhase = padlockPhase;
    hudFrame.manualLookActive = manualLookActive();
    hudFrame.periodGunsightVisible = gunsightPresentation.visible;
    hudFrame.triggerHeld = isGkeyHeld(8);
    hudFrame.dt = dt;
    hudFrame.now = nowSeconds;
    this.lastFrameNowSeconds = nowSeconds;
    hudFrame.shoulderHandoffLatched = this.shoulderHandoffAtS !== undefined
      && nowSeconds - this.shoulderHandoffAtS < 0.35;
    this.hud.draw(hudFrame);
  }

  presentationDiagnostics() {
    return Object.freeze({
      ...this.presentationAssets.diagnostics(),
      visualRuntime: this.visualRuntime?.diagnostics() ?? null,
      visualRuntimeError: this.visualRuntimeError,
      terrain: this.terrainPresentation?.diagnostics() ?? null,
      terrainError: this.terrainPresentationError,
      cloudBreak: this.tacticalClouds.cloudBreakDiagnostics(),
      multiplayer: this.remoteAircraft.diagnostics(),
    });
  }

  syncRemotePlayers(snapshot, ownPlayerId, localState) {
    this.remoteAircraft.sync(snapshotForTerrainFrame(snapshot, localState), ownPlayerId);
    return this.remoteAircraft.aircraft.size;
  }

  clearRemotePlayers() {
    this.remoteAircraft.sync({ players: [], bogeys: [] }, null);
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.visualRuntimeEpoch += 1;
    this.terrainPresentationRequestEpoch += 1;
    this.terrainPresentationAbortController?.abort();
    this.terrainPresentationAbortController = null;
    this.terrainPresentation?.dispose();
    this.terrainPresentation = null;
    this.terrainPresentationKey = null;
    this.terrainPresentationRequestedKey = null;
    this.terrainPresentationFailureKey = null;
    this.terrainPresentationRetryAtMs = 0;
    await this.terrainPresentationPromise?.catch(() => undefined);
    await this.terrainSceneryEraPromise?.catch(() => undefined);
    await this.visualRuntimeTransitions.idle();
    const visualRuntime = this.visualRuntime;
    this.visualRuntime = null;
    if (visualRuntime) await visualRuntime.dispose().catch(() => undefined);
    this.periodGunsight.dispose();
    this.banditContact.dispose();
    await this.remoteAircraft.dispose();
    this.tacticalClouds.dispose();
    this.playerDamageSmoke.dispose();
    this.banditDamageSmoke.dispose();
    this.carrierRuntime.recovery.group.removeFromParent();
    this.carrierRuntime.water.group.removeFromParent();
    disposeSceneResources(this.carrierRuntime.recovery.group);
    disposeSceneResources(this.carrierRuntime.water.group);
    this.sky.mesh.removeFromParent();
    this.sea.mesh.removeFromParent();
    this.banditDestruction.removeFromParent();
    this.gunEffects.removeFromParent();
    disposeSceneResources(this.sky.mesh);
    disposeSceneResources(this.sea.mesh);
    disposeSceneResources(this.banditDestruction);
    disposeSceneResources(this.gunEffects);
    await this.presentationAssets.dispose();
    if (this.scene.environment === this.environmentTarget.texture) this.scene.environment = null;
    this.environmentTarget.dispose();
    this.renderer.dispose();
  }
}

function installMobileInput(view) {
  if (!mobileControls || !touchControls) return;

  view.hud.setTouchMode?.(true);
  const TILT_DEADZONE = 5;
  const TILT_RELEASE = 3;
  const PITCH_GAIN = 1.15;
  const ROLL_GAIN = 1;
  const activeControls = new Map();
  const tiltKeys = { pitch: null, roll: null };
  const tiltTitle = tiltPrompt?.querySelector("strong");
  const tiltCopy = tiltPrompt?.querySelector("p");
  const orientationSupported = typeof globalThis.DeviceOrientationEvent !== "undefined";
  let tiltState = "off";
  let orientationListening = false;
  let calibration = null;
  let calibrationAngle = null;
  let latestOrientation = null;
  let filteredPitch = 0;
  let filteredRoll = 0;
  let lastOrientationSampleMs = null;
  let lastAnalogRollCommand = 0;
  let throttleRockerPointerId = null;
  let throttleRockerControl = null;
  const virtualStickAxes = { roll: null, pitch: null };
  let virtualStickPointerId = null;
  let suspended = false;
  let frozen = false;
  let frozenRestartSent = false;
  const tiltCalibration = new StableTiltCalibration();
  const tiltWatchdog = new TiltSensorWatchdog({
    onStale: handleOrientationStale,
    onFallback: () => {
      if (!suspended && !frozen && !document.hidden
          && (tiltState === "waiting" || tiltState === "enabled")) {
        useThumbStick("TILT SIGNAL LOST · STICK");
      }
    },
  });

  function status(message) {
    if (tiltStatus) tiltStatus.textContent = message;
  }

  function screenAngle() {
    const raw = window.screen?.orientation?.angle ?? window.orientation ?? 0;
    return ((Number(raw) || 0) % 360 + 360) % 360;
  }

  function orientationAxes(event) {
    if (event.beta == null || event.gamma == null) return null;
    const beta = Number(event.beta);
    const gamma = Number(event.gamma);
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
    const angle = screenAngle();
    if (angle === 90) return { roll: beta, pitch: -gamma, angle };
    if (angle === 270) return { roll: -beta, pitch: gamma, angle };
    if (angle === 180) return { roll: -gamma, pitch: -beta, angle };
    return { roll: gamma, pitch: beta, angle };
  }

  function angleDelta(value, centre) {
    return ((value - centre + 540) % 360) - 180;
  }

  function releaseTiltAxes() {
    for (const axis of ["pitch", "roll"]) {
      const code = tiltKeys[axis];
      if (code) releaseMappedKey(code, `tilt:${axis}`);
      tiltKeys[axis] = null;
    }
    forceAnalogRollNeutral();
  }

  function updateTiltAxis(axis, value, negativeCode, positiveCode) {
    const source = `tilt:${axis}`;
    const active = tiltKeys[axis];
    if (active) {
      const keep = active === negativeCode ? value < -TILT_RELEASE : value > TILT_RELEASE;
      if (keep) return;
      releaseMappedKey(active, source);
      tiltKeys[axis] = null;
    }
    const next = value <= -TILT_DEADZONE ? negativeCode : value >= TILT_DEADZONE ? positiveCode : null;
    if (next && pressMappedKey(next, source)) tiltKeys[axis] = next;
  }

  function setAnalogRollCommand(value) {
    if (typeof bridge?.SetAnalogRollControl !== "function") return false;
    const command = clamp(Number(value) || 0, -1, 1);
    // Phone sensors and pointer moves can report sub-noise changes faster than the fixed clock.
    // Keep the latest command without needlessly crossing the WASM bridge for the same value —
    // but ALWAYS transmit the transition to exact neutral: suppressing it latched a stale
    // sub-noise roll command, and the simulation's G-LOC interlock releases only at exactly zero.
    if (shouldTransmitAnalogRoll(command, lastAnalogRollCommand)) {
      bridge.SetAnalogRollControl(command);
      lastAnalogRollCommand = command;
    }
    return true;
  }

  function forceAnalogRollNeutral() {
    if (typeof bridge?.SetAnalogRollControl !== "function") return false;
    bridge.SetAnalogRollControl(0);
    lastAnalogRollCommand = 0;
    return true;
  }

  function updateAnalogRoll(value) {
    return setAnalogRollCommand(mobileRollCommand(value));
  }

  function releaseThrottleRockerCommand(control) {
    if (!control) return;
    // WAVE OFF can co-own Touch:KeyW. Only the owner that sends the final key-up may discard the
    // pending tap; otherwise releasing the rocker would change the still-held wave-off command.
    const wasDirect = directThrottleHeld.has(control.code);
    const released = releaseMappedKey(control.code, control.source);
    // The source-aware direct hold never leaves a deferred tap behind; only a legacy keyboard-
    // grammar edge (older bridge, or a co-owned wave-off press) still needs release suppression.
    if (released && !wasDirect
      && typeof bridge?.SuppressPendingThrottleTap === "function") {
      bridge.SuppressPendingThrottleTap(control.physicalCode === "KeyW");
    }
  }

  function setThrottleRockerCode(physicalCode, source) {
    const active = throttleRockerControl;
    if (active?.physicalCode === physicalCode && active.source === source) return true;
    releaseThrottleRockerCommand(active);
    throttleRockerControl = null;
    if (!physicalCode) return true;
    const code = `Touch:${physicalCode}`;
    const gkey = touchGkeyByDefaultCode.get(physicalCode);
    if (!pressMappedKey(code, source, gkey, physicalCode === "KeyW")) return false;
    throttleRockerControl = { code, physicalCode, source };
    return true;
  }

  function renderThrottleRocker(power = 0, physicalCode = null) {
    if (!touchThrottleRocker) return;
    const height = touchThrottleRocker.clientHeight;
    const knobHeight = touchThrottleRockerKnob?.offsetHeight ?? 0;
    const travel = Math.max(0, (height - knobHeight) / 2 - 5);
    const direction = physicalCode === "KeyW" ? "up"
      : physicalCode === "KeyS" ? "down" : "neutral";
    touchThrottleRocker.style.setProperty("--throttle-y",
      `${-clamp(Number(power) || 0, -1, 1) * travel}px`);
    touchThrottleRocker.dataset.active = String(
      throttleRockerPointerId !== null || throttleRockerControl !== null,
    );
    touchThrottleRocker.dataset.direction = direction;
    touchThrottleRocker.setAttribute("aria-label", direction === "up"
      ? "Throttle rocker — increasing power"
      : direction === "down" ? "Throttle rocker — decreasing power" : "Throttle rocker");
  }

  function releaseThrottleRocker() {
    const pointerId = throttleRockerPointerId;
    throttleRockerPointerId = null;
    const active = throttleRockerControl;
    throttleRockerControl = null;
    releaseThrottleRockerCommand(active);
    renderThrottleRocker();
    if (pointerId !== null && touchThrottleRocker?.hasPointerCapture?.(pointerId)) {
      try { touchThrottleRocker.releasePointerCapture(pointerId); } catch { /* already released */ }
    }
  }

  function updateThrottleRockerPointer(event) {
    if (!touchThrottleRocker || event.pointerId !== throttleRockerPointerId) return;
    const state = mobileThrottleRockerState(event, touchThrottleRocker.getBoundingClientRect(), {
      code: throttleRockerControl?.physicalCode ?? null,
    });
    const source = `touch:throttle-rocker:pointer:${event.pointerId}`;
    if (!setThrottleRockerCode(state.code, source)) {
      releaseThrottleRocker();
      return;
    }
    renderThrottleRocker(state.power, state.code);
  }

  function beginThrottleRocker(event) {
    if (!touchThrottleRocker || touchThrottleRocker.closest?.("[hidden]")
      || frozen || suspended || document.hidden || pauseReasons.size > 0) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (throttleRockerPointerId !== null) return;
    event.preventDefault();
    event.stopPropagation();
    releaseThrottleRocker();
    throttleRockerPointerId = event.pointerId;
    touchThrottleRocker.focus({ preventScroll: true });
    try { touchThrottleRocker.setPointerCapture(event.pointerId); } catch { /* pointer may be gone */ }
    updateThrottleRockerPointer(event);
  }

  function moveThrottleRocker(event) {
    if (event.pointerId !== throttleRockerPointerId) return;
    if (touchThrottleRocker?.closest?.("[hidden]")
      || frozen || suspended || document.hidden || pauseReasons.size > 0) {
      releaseThrottleRocker();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    updateThrottleRockerPointer(event);
  }

  function endThrottleRocker(event) {
    if (event.pointerId !== throttleRockerPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    releaseThrottleRocker();
  }

  function throttleRockerKeyboardEvent(event, pressed) {
    const physicalCode = event.code === "ArrowUp" ? "KeyW"
      : event.code === "ArrowDown" ? "KeyS" : null;
    if (!physicalCode) return;
    event.preventDefault();
    event.stopPropagation();
    const keyboardSource = "touch:throttle-rocker:keyboard";
    if (!pressed) {
      if (throttleRockerControl?.source === keyboardSource
        && throttleRockerControl.physicalCode === physicalCode) releaseThrottleRocker();
      return;
    }
    if (throttleRockerPointerId !== null || touchThrottleRocker?.closest?.("[hidden]")
      || frozen || suspended || document.hidden || pauseReasons.size > 0) return;
    if (!setThrottleRockerCode(physicalCode, keyboardSource)) return;
    renderThrottleRocker(physicalCode === "KeyW" ? 0.78 : -0.78, physicalCode);
  }

  function setVirtualStickAxis(axis, physicalCode, source) {
    const active = virtualStickAxes[axis];
    if (active?.physicalCode === physicalCode && active.source === source) return;
    if (active) releaseMappedKey(active.code, active.source);
    virtualStickAxes[axis] = null;
    if (!physicalCode) return;
    const code = `Touch:${physicalCode}`;
    const gkey = touchGkeyByDefaultCode.get(physicalCode);
    if (pressMappedKey(code, source, gkey)) {
      virtualStickAxes[axis] = { code, physicalCode, source };
    }
  }

  function renderVirtualStick(x = 0, y = 0) {
    if (!fallbackStick) return;
    const active = Math.abs(x) > 0.01 || Math.abs(y) > 0.01;
    const diameter = Math.min(fallbackStick.clientWidth, fallbackStick.clientHeight);
    const knobDiameter = Math.max(fallbackStickKnob?.offsetWidth ?? 0,
      fallbackStickKnob?.offsetHeight ?? 0);
    const travel = Math.max(0, (diameter - knobDiameter) / 2 - 4);
    fallbackStick.style.setProperty("--stick-x", `${x * travel}px`);
    fallbackStick.style.setProperty("--stick-y", `${y * travel}px`);
    fallbackStick.dataset.active = String(active);
  }

  function releaseVirtualStick() {
    const pointerId = virtualStickPointerId;
    virtualStickPointerId = null;
    for (const axis of ["roll", "pitch"]) {
      const active = virtualStickAxes[axis];
      if (active) releaseMappedKey(active.code, active.source);
      virtualStickAxes[axis] = null;
    }
    forceAnalogRollNeutral();
    renderVirtualStick();
    if (pointerId !== null && fallbackStick?.hasPointerCapture?.(pointerId)) {
      try { fallbackStick.releasePointerCapture(pointerId); } catch { /* already released */ }
    }
  }

  function updateVirtualStickPointer(event) {
    if (!fallbackStick || event.pointerId !== virtualStickPointerId) return;
    const state = mobileVirtualStickState(event, fallbackStick.getBoundingClientRect(), {
      rollCode: virtualStickAxes.roll?.physicalCode ?? null,
      pitchCode: virtualStickAxes.pitch?.physicalCode ?? null,
    });
    const source = `touch:virtual-stick:pointer:${event.pointerId}`;
    if (setAnalogRollCommand(state.x)) {
      setVirtualStickAxis("roll", null, `${source}:roll`);
    } else {
      setVirtualStickAxis("roll", state.rollCode, `${source}:roll`);
    }
    setVirtualStickAxis("pitch", state.pitchCode, `${source}:pitch`);
    renderVirtualStick(state.x, state.y);
  }

  function renderVirtualStickKeyboard() {
    const roll = virtualStickAxes.roll?.physicalCode;
    const pitch = virtualStickAxes.pitch?.physicalCode;
    renderVirtualStick(roll === "ArrowLeft" ? -0.72 : roll === "ArrowRight" ? 0.72 : 0,
      pitch === "ArrowUp" ? -0.72 : pitch === "ArrowDown" ? 0.72 : 0);
  }

  function beginVirtualStick(event) {
    if (!fallbackStick || tiltState !== "fallback" || frozen || suspended
      || document.hidden || pauseReasons.size > 0) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (virtualStickPointerId !== null && event.pointerId !== virtualStickPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    releaseVirtualStick();
    virtualStickPointerId = event.pointerId;
    fallbackStick.focus({ preventScroll: true });
    try { fallbackStick.setPointerCapture(event.pointerId); } catch { /* pointer may be gone */ }
    updateVirtualStickPointer(event);
  }

  function moveVirtualStick(event) {
    if (event.pointerId !== virtualStickPointerId) return;
    if (tiltState !== "fallback" || frozen || suspended
      || document.hidden || pauseReasons.size > 0) {
      releaseVirtualStick();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    updateVirtualStickPointer(event);
  }

  function endVirtualStick(event) {
    if (event.pointerId !== virtualStickPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    releaseVirtualStick();
  }

  function virtualStickKeyboardEvent(event, pressed) {
    if (tiltState !== "fallback"
      || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) return;
    event.preventDefault();
    event.stopPropagation();
    const axis = ["ArrowLeft", "ArrowRight"].includes(event.code) ? "roll" : "pitch";
    const active = virtualStickAxes[axis];
    if (!pressed && active?.physicalCode !== event.code) return;
    setVirtualStickAxis(axis, pressed ? event.code : null,
      `touch:virtual-stick:keyboard:${axis}`);
    renderVirtualStickKeyboard();
  }

  function captureCentre(sample, message = "TILT CENTRED", timestampMs = performance.now()) {
    tiltWatchdog.recovered();
    releaseVirtualStick();
    calibration = { roll: sample.roll, pitch: sample.pitch };
    calibrationAngle = sample.angle;
    tiltCalibration.reset();
    filteredPitch = 0;
    filteredRoll = 0;
    lastOrientationSampleMs = timestampMs;
    releaseTiltAxes();
    document.documentElement.classList.remove("tilt-pending");
    tiltStatus?.setAttribute("aria-label", "Recenter tilt controls");
    status(message);
    setPauseReason("calibration", false);
  }

  function awaitFreshCentre(message = "TILT RECENTRING…") {
    tiltWatchdog.beginRecovery();
    setPauseReason("calibration", true);
    tiltState = "waiting";
    calibration = null;
    calibrationAngle = null;
    tiltCalibration.reset();
    filteredPitch = 0;
    filteredRoll = 0;
    lastOrientationSampleMs = null;
    releaseTiltAxes();
    if (tiltTitle) tiltTitle.textContent = "HOLD LEVEL — RECENTRING";
    if (tiltCopy) tiltCopy.textContent = "Hold your flying angle while the controls find a fresh centre.";
    document.documentElement.classList.add("tilt-pending");
    status(message);
  }

  function handleOrientationStale() {
    if (suspended || frozen || document.hidden
        || (tiltState !== "waiting" && tiltState !== "enabled")) return;
    awaitFreshCentre("TILT SIGNAL LOST · HOLD LEVEL");
  }

  function stopOrientationListener() {
    tiltWatchdog.stop();
    if (orientationListening) {
      window.removeEventListener("deviceorientation", handleOrientation);
      orientationListening = false;
    }
  }

  function useThumbStick(message) {
    stopOrientationListener();
    releaseTiltAxes();
    releaseVirtualStick();
    tiltState = "fallback";
    document.documentElement.classList.remove("tilt-pending", "tilt-enabled");
    document.documentElement.classList.add("tilt-fallback");
    tiltStatus?.setAttribute("aria-label", "Switch to tilt controls");
    status(message || "THUMB STICK");
    setPauseReason("calibration", false);
  }

  function handleOrientation(event) {
    if (suspended || frozen || document.hidden
        || (tiltState !== "waiting" && tiltState !== "enabled")) return;
    const sample = orientationAxes(event);
    if (!sample) return;
    const timestampMs = performance.now();
    latestOrientation = sample;
    tiltWatchdog.sample();

    if (tiltState === "waiting" || !calibration || calibrationAngle !== sample.angle) {
      if (tiltState !== "waiting") awaitFreshCentre("SCREEN ROTATED · HOLD LEVEL");
      const centre = tiltCalibration.add(sample, timestampMs);
      if (!centre) return;
      tiltState = "enabled";
      captureCentre(centre, calibrationAngle === null ? "TILT CENTRED" : "TILT RECENTRED",
        timestampMs);
      document.documentElement.classList.remove("tilt-pending", "tilt-fallback");
      document.documentElement.classList.add("tilt-enabled");
      return;
    }

    // Keep liveness monitoring active behind pause/settings overlays without restoring actuator
    // input until the flight clock is released again.
    if (pauseReasons.size > 0) {
      lastOrientationSampleMs = timestampMs;
      releaseTiltAxes();
      return;
    }

    const sensitivity = playerSettings.tiltSensitivity;
    const pitch = clamp(angleDelta(sample.pitch, calibration.pitch)
      * PITCH_GAIN * sensitivity, -30, 30);
    const roll = clamp(angleDelta(sample.roll, calibration.roll)
      * ROLL_GAIN * sensitivity, -30, 30);
    const deltaSeconds = lastOrientationSampleMs === null
      ? 0 : Math.max(0, timestampMs - lastOrientationSampleMs) / 1000;
    lastOrientationSampleMs = timestampMs;
    filteredPitch = smoothTilt(filteredPitch, pitch, deltaSeconds);
    filteredRoll = smoothTilt(filteredRoll, roll, deltaSeconds);
    // Rung-1 assisted flight: tilt owns ROLL ONLY. Fore/aft phone wobble is not a pitch
    // intention — it kicked the about-right auto-pull off constantly ("very pitch-sensitive",
    // first portrait flight). Pitch bias belongs to the PULL/EASE chips alone.
    if (document.documentElement.classList.contains("portrait-assist")) {
      updateTiltAxis("pitch", 0, "ArrowUp", "ArrowDown");
    } else {
      updateTiltAxis("pitch", filteredPitch, "ArrowUp", "ArrowDown");
    }
    if (!updateAnalogRoll(filteredRoll)) {
      updateTiltAxis("roll", filteredRoll, "ArrowLeft", "ArrowRight");
    }
  }

  function startOrientationListener() {
    releaseVirtualStick();
    setPauseReason("calibration", true);
    if (!orientationListening) {
      window.addEventListener("deviceorientation", handleOrientation, { passive: true });
      orientationListening = true;
    }
    tiltState = "waiting";
    calibration = null;
    calibrationAngle = null;
    tiltCalibration.reset();
    lastOrientationSampleMs = null;
    status("WAITING FOR TILT…");
    if (tiltTitle) tiltTitle.textContent = "HOLD LEVEL — CALIBRATING";
    if (tiltCopy) tiltCopy.textContent = "Hold the device at your comfortable flying angle while the sensor centres.";
    tiltWatchdog.beginRecovery();
  }

  async function enableTilt() {
    if (tiltState === "requesting" || tiltState === "waiting") return;
    if (tiltState === "enabled" && latestOrientation) {
      awaitFreshCentre();
      return;
    }
    if (!orientationSupported) {
      useThumbStick("TILT UNAVAILABLE · STICK");
      return;
    }

    setPauseReason("calibration", true);
    tiltState = "requesting";
    status("REQUESTING TILT…");
    try {
      const requestPermission = globalThis.DeviceOrientationEvent?.requestPermission;
      if (typeof requestPermission === "function") {
        const permission = await requestPermission.call(globalThis.DeviceOrientationEvent);
        if (permission !== "granted") {
          useThumbStick("TILT DENIED · STICK");
          return;
        }
      }
      startOrientationListener();
    } catch (error) {
      console.warn("Tilt permission unavailable", error);
      useThumbStick("TILT DENIED · STICK");
    }
  }

  function recenterTilt() {
    releaseVirtualStick();
    setPauseReason("calibration", true);
    if (tiltState === "enabled" && latestOrientation) {
      awaitFreshCentre();
      return;
    }
    if (!orientationSupported) {
      useThumbStick("TILT UNAVAILABLE · STICK");
      return;
    }
    if (tiltTitle) tiltTitle.textContent = "TAP TO ENABLE TILT";
    if (tiltCopy) tiltCopy.textContent = "Hold your flying angle; this becomes centre. Then tilt forward to push, back to pull, and left/right to roll.";
    document.documentElement.classList.remove("tilt-fallback");
    document.documentElement.classList.add("tilt-pending");
    tiltState = "off";
    tiltStatus?.setAttribute("aria-label", "Choose tilt or thumb-stick controls");
    status("TILT OFF");
  }

  function setControlActive(button) {
    const active = [...activeControls.values()].some((control) => control.button === button);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }

  function endControl(event) {
    const control = activeControls.get(event.pointerId);
    if (!control) return;
    releaseMappedKey(control.code, control.source);
    activeControls.delete(event.pointerId);
    setControlActive(control.button);
  }

  releaseHiddenMobileControls = () => {
    for (const [pointerId, control] of [...activeControls]) {
      if (!control.button.closest?.("[hidden]")) continue;
      releaseMappedKey(control.code, control.source);
      activeControls.delete(pointerId);
      setControlActive(control.button);
    }
    if ((throttleRockerPointerId !== null || throttleRockerControl)
      && touchThrottleRocker?.closest?.("[hidden]")) releaseThrottleRocker();
  };

  function restartFrozenRun(event) {
    if (!frozen || frozenRestartSent) return;
    frozenRestartSent = true;
    event.preventDefault();
    event.stopImmediatePropagation();
    resetMobileInput();
    const source = "touch:frozen-restart";
    if (!pressMappedKey("KeyR", source)) {
      frozenRestartSent = false;
      return;
    }
    releaseMappedKey("KeyR", source);
  }

  // Capture before either canvas-look or a control can claim the pointer. Once an outcome freezes
  // the run, the entire dimmed HUD is one restart target, including the visible result banner.
  window.addEventListener("pointerdown", restartFrozenRun, { capture: true, passive: false });

  touchControls.querySelectorAll("[data-hold-key]").forEach((button, index) => {
    button.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      endControl(event);
      const physicalCode = button.dataset.holdKey;
      const code = `Touch:${physicalCode}`;
      const gkey = touchGkeyByDefaultCode.get(physicalCode);
      const source = `touch:${index}:${event.pointerId}`;
      if (!pressMappedKey(code, source, gkey)) return;
      if (physicalCode === "KeyF") view.hud.armAudio();
      activeControls.set(event.pointerId, { button, code, source });
      setControlActive(button);
      try { button.setPointerCapture(event.pointerId); } catch { /* pointer may already be gone */ }
    }, { passive: false });
    button.addEventListener("pointerup", endControl);
    button.addEventListener("pointercancel", endControl);
    button.addEventListener("lostpointercapture", endControl);
  });

  let pulseSequence = 0;
  touchControls.querySelectorAll("[data-pulse-key]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const physicalCode = button.dataset.pulseKey;
      const code = `Touch:${physicalCode}`;
      const gkey = touchGkeyByDefaultCode.get(physicalCode);
      const source = `touch:pulse:${++pulseSequence}`;
      if (!pressMappedKey(code, source, gkey)) return;
      if (physicalCode === "KeyV") togglePadlock();
      releaseMappedKey(code, source);
      // Padlock is a selected view mode. Its pressed state is owned by syncPadlockUi for the full
      // lock lifetime; momentarily flashing it like GEAR made touch users think the lock had ended.
      if (physicalCode === "KeyV") return;
      button.classList.add("active");
      button.setAttribute("aria-pressed", "true");
      window.setTimeout(() => {
        button.classList.remove("active");
        button.setAttribute("aria-pressed", "false");
      }, 140);
    });
  });

  touchThrottleRocker?.addEventListener("pointerdown", beginThrottleRocker, { passive: false });
  touchThrottleRocker?.addEventListener("pointermove", moveThrottleRocker, { passive: false });
  touchThrottleRocker?.addEventListener("pointerup", endThrottleRocker, { passive: false });
  touchThrottleRocker?.addEventListener("pointercancel", endThrottleRocker, { passive: false });
  touchThrottleRocker?.addEventListener("lostpointercapture", endThrottleRocker,
    { passive: false });
  touchThrottleRocker?.addEventListener("keydown",
    (event) => throttleRockerKeyboardEvent(event, true));
  touchThrottleRocker?.addEventListener("keyup",
    (event) => throttleRockerKeyboardEvent(event, false));
  touchThrottleRocker?.addEventListener("blur", () => {
    if (throttleRockerControl?.source === "touch:throttle-rocker:keyboard") {
      releaseThrottleRocker();
    }
  });
  touchThrottleRocker?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  fallbackStick?.addEventListener("pointerdown", beginVirtualStick, { passive: false });
  fallbackStick?.addEventListener("pointermove", moveVirtualStick, { passive: false });
  fallbackStick?.addEventListener("pointerup", endVirtualStick, { passive: false });
  fallbackStick?.addEventListener("pointercancel", endVirtualStick, { passive: false });
  fallbackStick?.addEventListener("lostpointercapture", endVirtualStick, { passive: false });
  fallbackStick?.addEventListener("keydown", (event) => virtualStickKeyboardEvent(event, true));
  fallbackStick?.addEventListener("keyup", (event) => virtualStickKeyboardEvent(event, false));
  fallbackStick?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  touchControls.querySelector('[data-mobile-action="enable-tilt"]')?.addEventListener("click", enableTilt);
  touchControls.querySelector('[data-mobile-action="buttons-only"]')?.addEventListener("click", () => {
    useThumbStick("THUMB STICK");
  });
  touchControls.querySelector('[data-mobile-action="recenter"]')?.addEventListener("click", recenterTilt);
  touchControls.querySelectorAll("[data-assist-nudge]").forEach((button) => {
    button.addEventListener("click", () => {
      bridge?.NudgeAssistedSpeed?.(Number(button.dataset.assistNudge) || 0);
    });
  });
  touchControls.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("pointerup", endControl);
  window.addEventListener("pointercancel", endControl);
  window.addEventListener("pointerup", endThrottleRocker);
  window.addEventListener("pointercancel", endThrottleRocker);
  window.addEventListener("pointerup", endVirtualStick);
  window.addEventListener("pointercancel", endVirtualStick);

  const preventGesture = (event) => {
    if (event.type === "touchmove" && event.target.closest?.(
      "#ready-screen, #settings-screen, #incident-replay-overlay, #test-flight-console",
    )) return;
    event.preventDefault();
  };
  document.addEventListener("touchmove", preventGesture, { passive: false });
  document.addEventListener("gesturestart", preventGesture, { passive: false });
  document.addEventListener("gesturechange", preventGesture, { passive: false });
  document.addEventListener("gestureend", preventGesture, { passive: false });
  document.addEventListener("dblclick", preventGesture, { passive: false });

  function orientationChanged() {
    releaseThrottleRocker();
    releaseVirtualStick();
    if (tiltState === "enabled" || tiltState === "waiting") awaitFreshCentre();
  }

  window.addEventListener("orientationchange", orientationChanged, { passive: true });
  window.screen?.orientation?.addEventListener?.("change", orientationChanged);
  window.addEventListener("blur", () => {
    suspended = true;
    tiltWatchdog.stop();
    releaseThrottleRocker();
    releaseVirtualStick();
    releaseTiltAxes();
  });
  window.addEventListener("pagehide", () => {
    tiltWatchdog.stop();
    releaseThrottleRocker();
    releaseVirtualStick();
    releaseTiltAxes();
  });
  window.addEventListener("focus", () => {
    suspended = false;
    if (tiltState === "enabled" || tiltState === "waiting") awaitFreshCentre();
  });
  document.addEventListener("visibilitychange", () => {
    suspended = document.hidden;
    if (suspended) {
      tiltWatchdog.stop();
      resetMobileInput();
      releaseAllMappedKeys("visibility-hidden");
    } else if (tiltState === "enabled" || tiltState === "waiting") {
      awaitFreshCentre();
    }
  });

  resetMobileInput = () => {
    const buttons = new Set();
    for (const control of activeControls.values()) releaseMappedKey(control.code, control.source);
    for (const control of activeControls.values()) buttons.add(control.button);
    activeControls.clear();
    for (const button of buttons) setControlActive(button);
    releaseThrottleRocker();
    releaseVirtualStick();
    releaseTiltAxes();
    filteredPitch = 0;
    filteredRoll = 0;
    lastOrientationSampleMs = null;
  };

  setMobileFrozen = (nextFrozen) => {
    const next = nextFrozen === true;
    if (next === frozen) return;
    frozen = next;
    frozenRestartSent = false;
    document.documentElement.classList.toggle("run-frozen", frozen);
    if (frozen) {
      tiltWatchdog.stop();
      resetMobileInput();
    } else if (tiltState === "enabled" || tiltState === "waiting") {
      awaitFreshCentre();
    }
  };

  if (orientationSupported) {
    setPauseReason("calibration", true);
    document.documentElement.classList.add("tilt-pending");
    status("TILT OFF");
  } else {
    useThumbStick("TILT UNAVAILABLE · STICK");
  }

  globalThis.__gunsMobile = {
    active: true,
    get tiltState() { return tiltState; },
    get calibration() { return calibration ? { ...calibration } : null; },
    recenter: recenterTilt,
  };
}

function nativeInteractiveOwnsKey(event) {
  const target = event.target;
  if (target.closest?.("input, select, textarea")) return true;
  if (!target.closest?.("button, a[href], [role=button]")) return false;
  return [
    "Enter", "NumpadEnter", "Space",
    "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End",
  ].includes(event.code);
}

function installInput(view) {
  window.addEventListener("keydown", (event) => {
    // Native controls own Enter, Space and arrow-key semantics while focused. This prevents the
    // dialog's mission buttons from leaking into flight shortcuts or launching the previous card.
    if (nativeInteractiveOwnsKey(event)) return;
    if (keyMap.has(event.code)
      || ["BracketLeft", "BracketRight", "F1", "Enter", "NumpadEnter", "Escape",
        "KeyT", "KeyP"].includes(event.code)) {
      event.preventDefault();
    }
    if (event.repeat || !bridge) return;

    if (event.code === "Escape") {
      if (closeSettings()) return;
      if (skipIncidentReplay()) return;
      if (toggleSessionPause()) return;
    }

    if (event.code === "Enter" || event.code === "NumpadEnter") {
      view.hud.armAudio();
      activateReadyAction();
      return;
    }

    if (event.code === "F1") {
      bridge.SetVariant(bridge.GetVariant() === 0 ? 1 : 0);
      return;
    }

    if (event.code === "KeyT") {
      const enabled = bridge.ToggleTimeCompression();
      recorder.event("time-compression", enabled ? "enabled" : "disabled");
      return;
    }

    if (event.code === "KeyP") {
      const enabled = bridge.ToggleRapierAutomation();
      recorder.event("rapier-automation", enabled ? "enabled" : "disabled");
      return;
    }

    if (event.code === "KeyC") {
      toggleDeckAndReady();
      return;
    }

    if (event.code === "KeyN" && navConsole && !navConsole.hidden) {
      navConsole.open = !navConsole.open;
      if (navConsole.open && testFlightConsole?.open) {
        testFlightConsole.open = false;
        testFlightConsole.querySelector("summary")
          ?.setAttribute("aria-expanded", "false");
      }
      recorder.event("nav-console", navConsole.open ? "open" : "closed");
      return;
    }

    if (event.code === "KeyH") {
      const visible = view.hud.toggleLegend();
      setPauseReason("help", visible);
      if (!playerSettings.legendSeen)
        commitPlayerSettings({ ...playerSettings, legendSeen: true });
      return;
    }

    if (event.code === "KeyM") {
      commitPlayerSettings({ ...playerSettings, audio: !playerSettings.audio });
      return;
    }

    if (event.code === "KeyR") {
      restartMissionNow();
      return;
    }

    // Tab cycles which contact the padlock holds. It is deliberately NOT a mapped game key: it
    // carries no held state and must never reach the kernel's key grammar. preventDefault is
    // essential — the browser default would walk focus out of the canvas mid-fight.
    if (event.code === "Tab") {
      // The ready and settings screens run their own Tab focus traps. Leave those alone: hijacking
      // Tab in a menu would make the menu unreachable by keyboard.
      if (readyScreen.classList.contains("visible")
        || settingsScreen?.classList.contains("visible")) return;
      event.preventDefault();
      cyclePadlockTarget();
      return;
    }

    const gkey = keyMap.get(event.code);
    if (gkey === undefined) return;
    if (!pressMappedKey(event.code, "keyboard")) return;
    if (gkey === 9) togglePadlock();
    if (gkey === 8) view.hud.armAudio();
  }, { passive: false });

  window.addEventListener("keyup", (event) => {
    if (nativeInteractiveOwnsKey(event)) return;
    if (keyMap.has(event.code) || ["BracketLeft", "BracketRight"].includes(event.code)) {
      event.preventDefault();
    }
    if (!bridge) return;
    releaseMappedKey(event.code, "keyboard");
  }, { passive: false });

  window.addEventListener("blur", () => {
    setPauseReason("background", true);
  });

  window.addEventListener("focus", () => {
    if (!document.hidden) setPauseReason("background", false);
  });
  document.addEventListener("visibilitychange", () => {
    setPauseReason("background", document.hidden || !document.hasFocus());
  });

  sceneCanvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    // Tapping the GUNS SAFE annunciation arms the gun instead of starting a look drag.
    const cueHit = hudCanvas?.__weaponsCueHit;
    if (cueHit) {
      const hudRect = hudCanvas.getBoundingClientRect();
      const hx = event.clientX - hudRect.left;
      const hy = event.clientY - hudRect.top;
      if (hx >= cueHit.x && hx <= cueHit.x + cueHit.w
        && hy >= cueHit.y && hy <= cueHit.y + cueHit.h) {
        bridge?.ReleaseWeaponsHold?.();
        return;
      }
    }
    dragging = true;
    // Stand the fixed-tick augmentation down before the next RAF advances simulation. Waiting for
    // updateGimbal would permit one catch-up frame of assist after the pilot starts a manual look.
    padlockTrackEstablished = false;
    syncBanditPadlockRollAssist();
    activePointer = event.pointerId;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    gimbalReturnFast = false;
    sceneCanvas.classList.add("dragging");
    sceneCanvas.setPointerCapture(event.pointerId);
    sceneCanvas.focus({ preventScroll: true });
  });

  sceneCanvas.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== activePointer) return;
    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    ({ yawRad: sensorYaw, pitchRad: sensorPitch } = applyLookDelta(
      { yawRad: sensorYaw, pitchRad: sensorPitch },
      { yawRad: dx * 0.0027, pitchRad: -dy * 0.00245 },
      { yawRad: MAX_GIMBAL_YAW, pitchRad: MAX_GIMBAL_PITCH },
    ));
  });

  function endDrag(event) {
    if (event.pointerId !== activePointer) return;
    dragging = false;
    activePointer = null;
    // Manual slew is temporary. Keep the selected padlock, then return quickly to its target;
    // without padlock selected, return to the forward view.
    gimbalReturnFast = true;
    sceneCanvas.classList.remove("dragging");
    if (sceneCanvas.hasPointerCapture(event.pointerId)) sceneCanvas.releasePointerCapture(event.pointerId);
  }

  sceneCanvas.addEventListener("pointerup", endDrag);
  sceneCanvas.addEventListener("pointercancel", endDrag);

  sceneCanvas.addEventListener("wheel", (event) => {
    if (event.ctrlKey || Math.abs(event.deltaX) + Math.abs(event.deltaY) < 0.01) return;
    event.preventDefault();
    const delta = trackpadLookDelta(event, window.innerHeight);
    ({ yawRad: sensorYaw, pitchRad: sensorPitch } = applyLookDelta(
      { yawRad: sensorYaw, pitchRad: sensorPitch },
      delta,
      { yawRad: MAX_GIMBAL_YAW, pitchRad: MAX_GIMBAL_PITCH },
    ));
    trackpadLookActive = true;
    padlockTrackEstablished = false;
    syncBanditPadlockRollAssist();
    gimbalReturnFast = false;
    if (trackpadLookReleaseTimer) window.clearTimeout(trackpadLookReleaseTimer);
    trackpadLookReleaseTimer = window.setTimeout(() => {
      trackpadLookReleaseTimer = 0;
      trackpadLookActive = false;
      // Do not cancel padlock: this is the precise moment the temporary head slew hands control
      // back to either the target tracker or the forward-view recenter.
      gimbalReturnFast = true;
    }, TRACKPAD_LOOK_RELEASE_MS);
  }, { passive: false });

  let resizeFrame = 0;
  function scheduleResize() {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      view.resize();
    });
  }
  window.addEventListener("resize", scheduleResize, { passive: true });
  window.addEventListener("orientationchange", scheduleResize, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleResize, { passive: true });
  window.visualViewport?.addEventListener("scroll", scheduleResize, { passive: true });
  installMobileInput(view);
}

async function boot() {
  setBootStatus("STARTING .NET RUNTIME…");
  const blazor = await waitForGlobal(() => globalThis.Blazor);
  await blazor.start();

  setBootStatus("LINKING FLIGHT KERNEL…");
  const runtimeAccessor = await waitForGlobal(() => globalThis.getDotnetRuntime);
  const { getAssemblyExports, getConfig } = await runtimeAccessor(0);
  await getConfig();
  const assemblyExports = await getAssemblyExports("GunsOnly.Web");
  bridge = assemblyExports.GunsOnly.Web.WebBridge;
  // Per-frame state now rides the kernel's numeric hot buffer; the full JSON snapshot is
  // re-fetched only when its cold_version slot bumps (or on the source's fallback interval).
  // The MemoryView is fetched once; copyTo re-derives the WASM view per call, so a persistent
  // Float64Array copy stays valid across memory growth.
  const hotFrameView = bridge.GetHotFrame();
  const hotFrameCopy = new Float64Array(hotFrameView.length);
  snapshotSource = createHotSnapshotSource({
    layoutJson: bridge.GetHotLayout(),
    readHotFrame: () => {
      hotFrameView.copyTo(hotFrameCopy, 0);
      return hotFrameCopy;
    },
    fetchColdState: () => JSON.parse(bridge.GetState()),
    // A quiet/settled renderer may have its animation frames throttled by the browser. Keep the
    // correctness fallback on a wall-clock timer as well as on version edges so cold strings and
    // events cannot remain stale merely because terrain work stopped producing frames.
    backgroundFallback: true,
    // Full JSON is a correctness backstop, not a 4 Hz render input. At 250 ms the large snapshot
    // parse monopolised the main thread during Rapier's gallery launch and produced the recorded
    // 3–5 fps cadence even after the adaptive renderer had disabled shadows and scenery.
    fallbackMs: 5_000,
  });
  incidentReplay = new IncidentReplayController((clipId) => bridge.ConsumeIncidentReplay(clipId));
  // QA hook: browser automation confirms the JSON cold path actually went low-rate.
  Object.defineProperty(globalThis, "__gunsSnapshotBridge", {
    configurable: true,
    value: Object.freeze({ diagnostics: () => snapshotSource.diagnostics() }),
  });
  bridge.StartBeat(selectedBeat);   // initialise the sortie; Begin is the explicit clock release
  bridgePauseApplied = true;

  setBootStatus("CALIBRATING SENSOR…");
  const view = new FlightView();
  activeView = view;
  applyPlayerSettings();
  multiplayer = new GlobalRoomClient({
    url: resolveGlobalRoomUrl(),
    onSnapshot: (snapshot, ownPlayerId) => {
      const rendered = view.syncRemotePlayers(snapshot, ownPlayerId, latestState);
      if (multiplayerStatus) {
        multiplayerStatus.dataset.rendered = String(rendered);
        multiplayerStatus.dataset.snapshotTime = String(snapshot.serverTimeMs || 0);
        multiplayerStatus.dataset.bogeySequence = String(snapshot.bogeys?.[0]?.sequence ?? -1);
        multiplayerStatus.dataset.bogeyPosition = snapshot.bogeys?.[0]?.position?.join(",") || "";
      }
    },
    onStatus: (status) => {
      applyMultiplayerWorldOrigin(status);
      renderMultiplayerStatus(status);
    },
  });
  multiplayer.start();

  let previous = performance.now();
  resetFrameClock = () => { previous = performance.now(); };
  installInput(view);
  syncPadlockUi();
  installTestFlightConsole();
  renderPauseUi();
  queueMicrotask(tryAutoLaunch);
  let firstFrame = true;

  globalThis.__gunsLifecycle = {
    get reasons() { return [...pauseReasons]; },
    get selectedBeat() { return selectedBeat; },
    get stagedBeat() { return stagedBeat; },
    begin: launchMission,
    restart: restartMission,
  };
  Object.defineProperty(globalThis, "__gunsView", {
    configurable: true,
    value: Object.freeze({
      snapshot: () => Object.freeze({
        padlock,
        target: padlock ? padlockTarget : "forward",
        entityId: padlockEntityId,
        phase: padlockPhase,
        manualLook: manualLookActive(),
        yawDeg: sensorYaw / DEG,
        pitchDeg: sensorPitch / DEG,
      }),
    }),
  });
  const assetDiagnostics = {};
  Object.defineProperties(assetDiagnostics, {
    snapshot: {
      enumerable: true,
      get: () => view.presentationDiagnostics(),
    },
    diagnostics: {
      enumerable: true,
      value: () => view.presentationDiagnostics(),
    },
  });
  Object.defineProperty(globalThis, "__gunsAssets", {
    configurable: true,
    value: Object.freeze(assetDiagnostics),
  });
  Object.defineProperty(globalThis, "__gunsMultiplayer", {
    configurable: true,
    value: Object.freeze({
      diagnostics: () => multiplayer?.diagnostics() ?? null,
      get snapshot() { return multiplayer?.diagnostics() ?? null; },
    }),
  });
  window.addEventListener("pagehide", () => {
    multiplayer?.stop();
    snapshotSource?.dispose?.();
    void view.dispose();
  }, { once: true });

  function tick(now) {
    try {
      // Raw (unclamped) render-frame delta: the perf telemetry must see the true stall length,
      // not the 0.25 s simulation-advance cap.
      const renderDeltaMs = now - previous;
      recorder.observeFrameDelta(renderDeltaMs);
      const dt = clamp(renderDeltaMs / 1000, 0, SIM_CATCHUP_CAP_SECONDS);
      const compressionPlan = timeCompressionBudget.plan(
        renderDeltaMs, SIM_CATCHUP_CAP_SECONDS,
      );
      previous = now;
      // Phase probes. A frame delta proves a stall happened; only these say where. Each is a pair
      // of performance.now() reads around a block that could plausibly own a hundred milliseconds.
      const phaseStart = performance.now();
      const tickBeforeAdvance = Number(latestState?.tick) || 0;
      let kernelSelectedCompressionFactor = 1;
      if (pauseReasons.size === 0) {
        kernelSelectedCompressionFactor = bridge.Advance(
          dt, compressionPlan.maximumFactor,
        );
      }
      else bridge.RefreshHotFrame();
      const afterSim = performance.now();
      const simPhaseMilliseconds = afterSim - phaseStart;
      recorder.observeFramePhase("sim", simPhaseMilliseconds);
      const state = snapshotSource.frame(now);
      const executedTicks = Math.max(0,
        (Number(state.tick) || 0) - tickBeforeAdvance);
      timeCompressionBudget.observeSimPhase(simPhaseMilliseconds, executedTicks);
      recorder.observeTimeCompression({
        requestedTicks: kernelSelectedCompressionFactor > 1
          ? compressionPlan.requestedTicks : compressionPlan.baseTicks,
        executedTicks,
        costDroppedTicks: kernelSelectedCompressionFactor > 1
          ? compressionPlan.droppedTicks : 0,
        factor: Math.max(kernelSelectedCompressionFactor,
          Number(state.time_compression_factor) || 1),
      });
      recorder.observeFramePhase("snap", performance.now() - afterSim);
      latestState = state;
      const replayPresentation = advanceIncidentReplay(incidentReplay, state, now);
      const replayFrame = replayPresentation.frame;
      const replayActive = replayPresentation.active;
      if (!replayActive && pauseReasons.size === 0 && state.session_phase === "ACTIVE") {
        frameGovernor.observe(renderDeltaMs, now, activeView);
      } else {
        frameGovernor.idle(now);
      }
      if (!replayActive) {
        recordCampaignQualification(state);
        reconcileBridgeLifecycle(state);
      }
      const beforeMultiplayer = performance.now();
      multiplayer?.publish(state);
      recorder.observeFramePhase("mp", performance.now() - beforeMultiplayer);
      // Debug/QA hook: lets browser automation inspect live control response, session lifecycle,
      // and state that a screenshot cannot establish. Keep this projection read-only; production
      // gameplay authority remains in SimulationSession.
      globalThis.__gunsState = state;
      globalThis.__gunsBridge = bridge;
      setMobileFrozen(state.frozen || replayActive);
      const beforeTelemetry = performance.now();
      recorder.sample(state);
      const afterTelemetry = performance.now();
      recorder.observeFramePhase("tele", afterTelemetry - beforeTelemetry);
      renderTestFlightConsole(state);
      announceFlightState(state);
      const presentedState = replayPresentation.presentedState;
      const beforeView = performance.now();
      recorder.observeFramePhase("dom", beforeView - afterTelemetry);
      view.update(presentedState, replayActive ? dt : pauseReasons.size > 0 ? 0 : dt, now / 1000);
      const afterView = performance.now();
      recorder.observeFramePhase("view", afterView - beforeView);
      renderPilotPhysiology(presentedState);
      renderIncidentReplay(replayFrame);
      renderPauseUi(state);
      recorder.observeFramePhase("ui", performance.now() - afterView);
      if (firstFrame) {
        firstFrame = false;
        bootScreen.classList.add("ready");
      }
      requestAnimationFrame(tick);
    } catch (error) {
      showFatal(error);
    }
  }

  requestAnimationFrame(tick);
}

// Offline support for an installed copy. Registered AFTER boot so a worker problem can never
// prevent the game from starting: the sortie is the product, offline is an enhancement.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch((error) => {
      console.warn("Offline support unavailable.", error);
    });
  });
}

boot().catch(showFatal);
