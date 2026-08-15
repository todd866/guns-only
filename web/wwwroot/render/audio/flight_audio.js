// Presentation audio façade: one AudioContext, one master, one compressor bus.
// Engine, buffet, airframe cues, gun reports, and GCAS all share mute. Fail-silent — never
// throw into the flight kernel. Prefer this over updateEngineAudio in production.

import {
  attachJetSampleBeds,
  createEngineVoices,
  loadJetSampleBeds,
  replaceJetSampleBeds,
  updateEngineVoices,
} from "./engine_audio.js";
import {
  createCobraAudioVoices,
  updateCobraAudioVoices,
} from "./cobra_audio.js";
import {
  createF14AudioVoices,
  updateF14AudioVoices,
} from "./f14_audio.js";
import {
  COBRA_COCKPIT_SAMPLE_BED,
  F14_COCKPIT_SAMPLE_BED,
  ensureLoopingSampleBed,
} from "./sample_bed.js?v=334";
import { resolvePropulsionCharacter } from "./audio_character.js";
import { standardAtmosphereState } from "./atmosphere_audio.js";
import {
  createContactAcousticVoices,
  createEventVoices,
  fireGunReports,
  updateAirframeCueVoices,
  updateBuffetVoice,
  updateCatapultVoice,
  updateCombatCueVoices,
  updateConfigurationVoices,
  updateContactAcousticVoices,
  updateRcsVoice,
  updateTrapVoice,
} from "./event_audio.js";
import { createWarningVoices, updateWarningVoices } from "./warning_audio.js";
import { createSharedFlightAudioFacade } from "./flight_audio_singleton.js";
import { createRadioVoice, updateRadioVoice } from "./radio_audio.js";

let context = null;
let master = null;
let bus = null;
let propulsionDuck = null;
let engineVoices = null;
let cobraVoices = null;
let f14Voices = null;
let eventVoices = null;
let contactVoices = null;
let formationContactVoices = [];
let formationContactTracks = [];
let warningVoices = null;
let radioVoice = null;
let disabled = false;
let enabled = true;
let sampleLoad = null;
let lastCharacter = null;
let sampleLoadGeneration = 0;
let lastCombatLifecycleKey = "";
let resumePending = null;
let lastAudibleTarget = false;
let lastPublishedRuntimeState = "";
let outputGainTarget = 0;
let backgrounded = globalThis.document?.hidden === true;
let silentQa = false;
let audioSessionId = "";
let audioSessionCreatedAt = "";
let lastStopReason = "";
let lifecycleInstalled = false;
const sampleBedCache = new Map();
// A missing or unreachable bed must not turn the per-frame ensure call into a fetch loop: one
// failed load latches a cooldown, and the next attempt waits out the window. The beds stay
// optional — procedural audio carries the jet until a retry lands.
const SAMPLE_BED_RETRY_MS = 30_000;
const sampleBedFailedAtMs = new Map();
const MPS_TO_KNOTS = 1.9438444924406;
const KNOTS_TO_MPS = 0.5144444444444;
const SEA_LEVEL_DENSITY = 1.225;

function contextNeedsUserResume(audioContext) {
  return audioContext?.state === "suspended" || audioContext?.state === "interrupted";
}

function userActivationAllowsResume() {
  const activation = globalThis.navigator?.userActivation;
  // Older browsers and deterministic Node harnesses do not expose UserActivation. Keep the
  // established best-effort behavior there; where the browser does expose it, never let an
  // auto-launch call create a forever-pending resume promise ahead of the pilot's real gesture.
  return activation == null || activation.isActive === true;
}

function isSilentQaRequested() {
  try {
    return new URLSearchParams(globalThis.location?.search ?? "")
      .get("audioQa") === "silent";
  } catch {
    return false;
  }
}

function createAudioSessionId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function")
      return globalThis.crypto.randomUUID();
  } catch {
    // Fall through to a local, non-identifying page-instance token.
  }
  return `audio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function setMasterOutput(value, {
  immediate = false,
  timeConstant = 0.02,
} = {}) {
  outputGainTarget = Math.max(0, Number(value) || 0);
  if (!master || !context) return;
  if (immediate) {
    master.gain.cancelScheduledValues?.(context.currentTime);
    if (typeof master.gain.setValueAtTime === "function")
      master.gain.setValueAtTime(outputGainTarget, context.currentTime);
    else
      master.gain.value = outputGainTarget;
    return;
  }
  master.gain.setTargetAtTime(outputGainTarget, context.currentTime, timeConstant);
}

function audioOutputMode() {
  if (disabled) return "disabled";
  if (silentQa) return "silent-qa";
  if (backgrounded) return "background";
  if (!enabled) return "preference-muted";
  if (contextNeedsUserResume(context)) return "suspended";
  if (lastAudibleTarget && outputGainTarget > 0) return "audible";
  return "idle";
}

function flightAudioDiagnosticsLocal() {
  const signalActive = !disabled
    && enabled
    && context?.state === "running"
    && lastAudibleTarget;
  return Object.freeze({
    controller: "shared",
    built: context != null,
    contextState: disabled ? "disabled" : context?.state ?? "unbuilt",
    enabled,
    signalActive,
    audible: signalActive && !silentQa && !backgrounded && outputGainTarget > 0,
    resumePending: resumePending != null,
    outputGainTarget,
    outputMode: audioOutputMode(),
    silentQa,
    pageState: backgrounded ? "background" : "foreground",
    sessionId: audioSessionId,
    createdAt: audioSessionCreatedAt,
    stopReason: lastStopReason,
  });
}

function publishFlightAudioRuntimeState() {
  const root = globalThis.document?.documentElement;
  if (!root?.setAttribute) return;
  const diagnostics = flightAudioDiagnosticsLocal();
  const serialized = [
    diagnostics.controller,
    diagnostics.contextState,
    diagnostics.enabled,
    diagnostics.signalActive,
    diagnostics.audible,
    diagnostics.resumePending,
    diagnostics.outputGainTarget,
    diagnostics.outputMode,
    diagnostics.silentQa,
    diagnostics.pageState,
    diagnostics.sessionId,
    diagnostics.createdAt,
    diagnostics.stopReason,
  ].join("|");
  if (serialized === lastPublishedRuntimeState) return;
  lastPublishedRuntimeState = serialized;
  root.setAttribute("data-audio-controller", diagnostics.controller);
  root.setAttribute("data-audio-context-state", diagnostics.contextState);
  root.setAttribute("data-audio-enabled", String(diagnostics.enabled));
  root.setAttribute("data-audio-signal-active", String(diagnostics.signalActive));
  root.setAttribute("data-audio-audible", String(diagnostics.audible));
  root.setAttribute("data-audio-resume-pending", String(diagnostics.resumePending));
  root.setAttribute("data-audio-output-gain", String(diagnostics.outputGainTarget));
  root.setAttribute("data-audio-output-mode", diagnostics.outputMode);
  root.setAttribute("data-audio-qa-silent", String(diagnostics.silentQa));
  root.setAttribute("data-audio-page-state", diagnostics.pageState);
  root.setAttribute("data-audio-session-id", diagnostics.sessionId);
  root.setAttribute("data-audio-created-at", diagnostics.createdAt);
  root.setAttribute("data-audio-stop-reason", diagnostics.stopReason);
}

function suspendFlightAudioLocal(reason = "manual") {
  lastAudibleTarget = false;
  lastStopReason = String(reason || "manual");
  try {
    setMasterOutput(0, { immediate: true });
  } catch {
    disabled = true;
  }
  try {
    const attempt = context?.suspend?.();
    attempt?.catch?.(() => {});
    attempt?.finally?.(() => publishFlightAudioRuntimeState());
  } catch {
    // The synchronous master cut above remains the safety boundary.
  }
  publishFlightAudioRuntimeState();
  return context != null;
}

function installFlightAudioLifecycle() {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;
  const doc = globalThis.document;
  const win = globalThis.window;
  const enterBackground = (reason, { suspend = true } = {}) => {
    backgrounded = true;
    if (suspend) {
      suspendFlightAudioLocal(reason);
      return;
    }
    lastAudibleTarget = false;
    lastStopReason = reason;
    try {
      setMasterOutput(0, { immediate: true });
    } catch {
      disabled = true;
    }
    publishFlightAudioRuntimeState();
  };
  const enterForeground = () => {
    backgrounded = doc?.hidden === true;
    lastStopReason = backgrounded ? "visibility-hidden" : "awaiting-foreground-frame";
    publishFlightAudioRuntimeState();
  };

  // A hidden RAF cannot be trusted to deliver the normal muted frame. Cut the master directly.
  // Blur keeps the context resumable without another browser permission gesture; a genuinely
  // hidden/navigated page is suspended and can only resume through armFlightAudio.
  win?.addEventListener?.("blur", () => enterBackground("window-blur", { suspend: false }));
  win?.addEventListener?.("focus", enterForeground);
  win?.addEventListener?.("pagehide", () => enterBackground("pagehide"));
  win?.addEventListener?.("pageshow", enterForeground);
  doc?.addEventListener?.("visibilitychange", () => {
    if (doc.hidden) enterBackground("visibility-hidden");
    else enterForeground();
  });
}

function build() {
  const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Ctor) return false;
  context = new Ctor();
  silentQa = isSilentQaRequested();
  backgrounded = globalThis.document?.hidden === true;
  audioSessionId = createAudioSessionId();
  audioSessionCreatedAt = new Date().toISOString();
  lastStopReason = "";

  master = context.createGain();
  master.gain.value = 0;
  master.connect(context.destination);

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 12;
  compressor.ratio.value = 4.5;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.18;
  compressor.connect(master);
  bus = compressor;

  // One multiplicative propulsion duck sits downstream of every aircraft-specific graph and
  // upstream of the shared compressor. Radio owns this gain while a transmission is live; frame
  // updates only touch each graph's authored trim, so an async clip cannot be unducked by RAF.
  propulsionDuck = context.createGain();
  if (typeof propulsionDuck.gain.setValueAtTime === "function")
    propulsionDuck.gain.setValueAtTime(1, context.currentTime);
  else
    propulsionDuck.gain.value = 1;
  propulsionDuck.connect(bus);

  // Keep propulsion behind its authored trim before it reaches the shared compressor. Sample
  // beds otherwise hit the limiter directly and flatten the RPM/power/G distinctions.
  engineVoices = createEngineVoices(context, propulsionDuck, { includeMaster: true });
  eventVoices = createEventVoices(context, bus);
  contactVoices = createContactAcousticVoices(context, bus);
  // The authoritative target graph follows whichever formation slot owns the gun solution.
  // Three bounded supplemental graphs keep the other published w1..w3 aircraft audible without
  // constructing Web Audio nodes in the render loop.
  formationContactVoices = Array.from(
    { length: 3 },
    () => createContactAcousticVoices(context, bus),
  );
  formationContactTracks = formationContactVoices.map(() => ({
    identity: "",
    rangeM: null,
    closureKts: 0,
    at: null,
  }));
  warningVoices = createWarningVoices(context, bus);
  radioVoice = createRadioVoice(context, bus, {
    propulsionDuck,
  });
  installFlightAudioLifecycle();
  publishFlightAudioRuntimeState();
  return true;
}

function ensureJetSamples(state) {
  const character = resolvePropulsionCharacter(state);
  if (character !== lastCharacter) {
    lastCharacter = character;
    sampleLoadGeneration += 1;
  }
  if (character !== "rapier" && character !== "f22") return;
  if (!context || !engineVoices) return;
  // Beds already attached for this character.
  if (engineVoices.hasSampleBeds
    && engineVoices.sampleBedCharacter === character) return;
  const cached = sampleBedCache.get(character);
  if (cached) {
    replaceJetSampleBeds(engineVoices, context, cached, { character });
    return;
  }
  if (sampleLoad?.character === character) return;
  const failedAtMs = sampleBedFailedAtMs.get(character);
  if (failedAtMs !== undefined
    && performance.now() - failedAtMs < SAMPLE_BED_RETRY_MS) return;

  const generation = sampleLoadGeneration;
  const promise = loadJetSampleBeds(context, { character });
  sampleLoad = { character, promise };
  promise
    .then((beds) => {
      if (beds?.mil) {
        sampleBedCache.set(character, beds);
        sampleBedFailedAtMs.delete(character);
      } else {
        sampleBedFailedAtMs.set(character, performance.now());
      }
      if (generation !== sampleLoadGeneration || lastCharacter !== character) return;
      if (engineVoices.hasSampleBeds) {
        replaceJetSampleBeds(engineVoices, context, beds, { character });
      } else {
        attachJetSampleBeds(engineVoices, context, beds, { character });
      }
    })
    .catch(() => {
      sampleBedFailedAtMs.set(character, performance.now());
    })
    .finally(() => {
      if (sampleLoad?.promise === promise) sampleLoad = null;
    });
}

function ensureDedicatedAircraftSampleBed(active, voices, definition) {
  // Selection is the load boundary: pilots who never enter Cobra or Top Gun never fetch these
  // comparatively large recordings. Rejections stay fail-soft and the loader owns its bounded
  // retry window; procedural audio is already live underneath throughout.
  if (!active || !context || !voices?.decodedBedInput) return;
  void ensureLoopingSampleBed(context, voices, definition).catch(() => {});
}

function finiteNumber(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function nonEmptyText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

/// Incident replay deliberately overlays a compact recorded frame onto the final live snapshot.
/// Re-project the audio-owned continuous fields so final-live RPM, q, G, speed-brake, RCS and GCAS
/// state cannot leak into the historical external pass. Ordinary live/external preview snapshots
/// are returned by identity.
export function projectFlightAudioState(state) {
  if (!state || typeof state !== "object") return {};
  const recordedReplay = state.replay_external === true
    && state.suppress_unrecorded_combat_transients === true;
  if (!recordedReplay) return state;

  const altitudeM = finiteNumber(state.py, state.altitude_m) ?? 0;
  const atmosphere = standardAtmosphereState(altitudeM);
  const indicatedKts = Math.max(0,
    finiteNumber(state.indicated_airspeed_kts, state.speed_kts, state.ground_speed_kts) ?? 0);
  // The carrier recorder stores KIAS, not TAS. Recover the no-wind standard-atmosphere TAS which
  // preserves the recorded dynamic pressure while allowing the existing engine/q paths to operate.
  const trueKts = indicatedKts * Math.sqrt(SEA_LEVEL_DENSITY / atmosphere.density);
  const trueMps = trueKts * KNOTS_TO_MPS;
  const enginePower = Math.max(0,
    finiteNumber(state.engine, state.engine_spool_fraction, state.applied_throttle) ?? 0);
  const throttle = Math.max(0,
    finiteNumber(state.throttle, state.applied_throttle) ?? enginePower);
  const pilotG = finiteNumber(state.g_actual) ?? 1;

  return {
    ...state,
    applied_throttle: throttle,
    engine_spool_fraction: enginePower,
    // Dry thrust reaches the governed RPM ceiling; augmentation adds thrust, not another 35% RPM.
    engine_rpm_pct: Math.min(1, enginePower) * 100,
    true_airspeed_kts: trueKts,
    true_airspeed_mps: trueMps,
    air_density_kg_m3: atmosphere.density,
    mach: trueMps / Math.max(1, atmosphere.speedOfSoundMps),
    pilot_gz: pilotG,
    pilot_gz_valid: true,
    pilot_positive_onset_rate_g_per_second: 0,
    pilot_negative_onset_rate_g_per_second: 0,
    // These continuous systems are not recorded in the incident clip. Fail quiet rather than
    // presenting their final-live state as historical evidence.
    speed_brake: 0,
    rapier_rcs_authority: 0,
    rapier_rcs_moment_nm: 0,
    rapier_rcs_firing_frac: 0,
    auto_gcas_active: false,
    auto_gcas_warning: false,
  };
}

/// Give the selected-contact graph a real lifecycle identity. The kernel's range/closure fields
/// follow the selected formation slot, while bandit_aircraft_id alone identifies only the type;
/// without the suffix, changing targets can complete a pass transient armed by another aircraft.
export function projectSelectedContactAudioState(state) {
  if (!state || typeof state !== "object") return {};
  const selectedSlot = Math.max(
    0,
    Math.trunc(finiteNumber(state.selected_player_gun_target_slot) ?? 0),
  );
  const selectedPrefix = selectedSlot > 0 && selectedSlot <= 3 ? `w${selectedSlot}` : "";
  const selectedX = selectedPrefix ? finiteNumber(state[`${selectedPrefix}x`]) : null;
  const selectedY = selectedPrefix ? finiteNumber(state[`${selectedPrefix}y`]) : null;
  const selectedZ = selectedPrefix ? finiteNumber(state[`${selectedPrefix}z`]) : null;
  const selectedPositionValid = [selectedX, selectedY, selectedZ]
    .every((value) => value != null);
  const selectedPresent = selectedPrefix
    ? state[`${selectedPrefix}_present`] === 1
      || state[`${selectedPrefix}_present`] === true
    : state.opponent_body_present !== false;
  const selectedAlive = selectedPrefix
    ? selectedPresent && (
      state[`${selectedPrefix}_alive`] === 1
      || state[`${selectedPrefix}_alive`] === true
    )
    : state.opponent_alive !== false;
  // The kernel's scalar range follows the selected slot before all three world-space
  // coordinates necessarily arrive. Never let stale primary bx/by/bz localize that selected
  // aircraft. Keep the authoritative graph quiet until the position is complete; the matching
  // supplemental graph can still carry the displaced primary.
  const selectedGeometryReady = !selectedPrefix || selectedPositionValid;
  const selectedAcousticallyPresent = selectedPresent && selectedGeometryReady;
  const aircraftId = nonEmptyText(
    state.bandit_aircraft_id,
    state.bandit_audio_class,
    state.bandit_presentation_id,
  );
  const entityId = nonEmptyText(state.bandit_entity_id, "entity.bandit");
  const absent = !selectedAcousticallyPresent;
  const unrecordedReplay = state.replay_external === true
    && state.suppress_unrecorded_combat_transients === true;
  if (!aircraftId && !absent) return state;
  return {
    ...state,
    ...(aircraftId
      ? { bandit_aircraft_id: `${aircraftId}#${entityId}:slot-${selectedSlot}` }
      : {}),
    ...(selectedPrefix
      ? {
        bx: selectedPositionValid ? selectedX : null,
        by: selectedPositionValid ? selectedY : null,
        bz: selectedPositionValid ? selectedZ : null,
      }
      : {}),
    opponent_body_present: selectedAcousticallyPresent,
    opponent_alive: selectedAlive && selectedGeometryReady,
    air_temperature_c: finiteNumber(
      state.air_temperature_c,
      state.static_temperature_c,
    ) ?? 15,
    ...(absent || unrecordedReplay ? { bandit_audio_class: "silent" } : {}),
  };
}

/// When a formation slot owns the authoritative selected-contact graph, reuse that slot's
/// supplemental graph for the original primary. This keeps all four aircraft audible without
/// allocating a fifth contact graph.
export function projectPrimaryContactAudioState(
  state,
  { previousRangeM = null, elapsedSeconds = null, smoothedClosureKts = 0 } = {},
) {
  if (!state || typeof state !== "object") return null;
  const selectedSlot = Math.max(
    0,
    Math.trunc(finiteNumber(state.selected_player_gun_target_slot) ?? 0),
  );
  if (selectedSlot < 1 || selectedSlot > 3) return null;

  const present = state.opponent_body_present !== false;
  const alive = state.bandit_alive !== false;
  const px = finiteNumber(state.px);
  const py = finiteNumber(state.py);
  const pz = finiteNumber(state.pz);
  const x = finiteNumber(state.bx);
  const y = finiteNumber(state.by);
  const z = finiteNumber(state.bz);
  const positionValid = [px, py, pz, x, y, z].every((value) => value != null);
  const rangeM = present && positionValid
    ? Math.hypot(x - px, y - py, z - pz)
    : Infinity;
  const dt = finiteNumber(elapsedSeconds);
  const priorRange = finiteNumber(previousRangeM);
  const derivativeKts = Number.isFinite(rangeM)
    && priorRange != null
    && dt != null
    && dt >= 1 / 240
    && dt <= 1
    ? Math.max(-1200, Math.min(1200, (priorRange - rangeM) / dt * MPS_TO_KNOTS))
    : 0;
  const closureKts = (finiteNumber(smoothedClosureKts) ?? 0) * 0.68
    + derivativeKts * 0.32;
  const aircraftId = nonEmptyText(
    state.bandit_aircraft_id,
    state.bandit_audio_class,
    state.bandit_presentation_id,
    "aircraft.fighter-jet",
  );
  const entityId = nonEmptyText(state.bandit_entity_id, "entity.bandit");
  const identity = `${aircraftId}#${entityId}:primary`;
  const unrecordedReplay = state.replay_external === true
    && state.suppress_unrecorded_combat_transients === true;

  return {
    audible: present && alive && positionValid && !unrecordedReplay,
    identity,
    rangeM,
    closureKts,
    state: {
      bandit_aircraft_id: identity,
      bandit_audio_class: state.bandit_audio_class,
      opponent_alive: present && alive,
      opponent_body_present: present,
      range_m: rangeM,
      closure_kts: closureKts,
      player_aircraft_id: state.player_aircraft_id,
      audio_profile_id: state.audio_profile_id,
      audio_perspective: state.audio_perspective,
      camera_perspective: state.camera_perspective,
      replay_external: state.replay_external,
      replay_camera: state.replay_camera,
      px,
      py,
      pz,
      bx: x,
      by: y,
      bz: z,
      pfx: state.pfx,
      pfy: state.pfy,
      pfz: state.pfz,
      plx: state.plx,
      ply: state.ply,
      plz: state.plz,
      // The contact's own forward axis gives the flyby its front/rear aspect, and ownship speed
      // lets Doppler split the closure rate between listener and source instead of charging all
      // of it to the source.
      bfx: finiteNumber(state.bfx),
      bfy: finiteNumber(state.bfy),
      bfz: finiteNumber(state.bfz),
      true_airspeed_kts: finiteNumber(state.true_airspeed_kts),
      air_temperature_c: finiteNumber(
        state.air_temperature_c,
        state.static_temperature_c,
      ) ?? 15,
    },
  };
}

/// Pure projection for the three additional-aircraft slots in the production snapshot. Positions
/// are authoritative but velocities are not published, so closure is the bounded range derivative
/// across audio frames. Pattern traffic is friendly Rapier traffic; combat formations inherit the
/// staged bandit type.
export function projectFormationContactAudioState(
  state,
  slot,
  { previousRangeM = null, elapsedSeconds = null, smoothedClosureKts = 0 } = {},
) {
  if (!state || typeof state !== "object" || slot < 1 || slot > 3) return null;
  const prefix = `w${slot}`;
  const present = state[`${prefix}_present`] === 1
    || state[`${prefix}_present`] === true;
  const alive = state[`${prefix}_alive`] === 1
    || state[`${prefix}_alive`] === true;
  const px = finiteNumber(state.px);
  const py = finiteNumber(state.py);
  const pz = finiteNumber(state.pz);
  const x = finiteNumber(state[`${prefix}x`]);
  const y = finiteNumber(state[`${prefix}y`]);
  const z = finiteNumber(state[`${prefix}z`]);
  const positionValid = [px, py, pz, x, y, z].every((value) => value != null);
  const rangeM = present && positionValid
    ? Math.hypot(x - px, y - py, z - pz)
    : Infinity;
  const dt = finiteNumber(elapsedSeconds);
  const priorRange = finiteNumber(previousRangeM);
  const derivativeKts = Number.isFinite(rangeM)
    && priorRange != null
    && dt != null
    && dt >= 1 / 240
    && dt <= 1
    ? Math.max(-1200, Math.min(1200, (priorRange - rangeM) / dt * MPS_TO_KNOTS))
    : 0;
  const closureKts = (finiteNumber(smoothedClosureKts) ?? 0) * 0.68
    + derivativeKts * 0.32;
  const selectedSlot = Math.max(
    0,
    Math.trunc(finiteNumber(state.selected_player_gun_target_slot) ?? 0),
  );
  const patternTraffic = state.rapier_pattern_only === true;
  const aircraftId = nonEmptyText(
    patternTraffic ? state.player_aircraft_id : state.bandit_aircraft_id,
    patternTraffic ? state.player_presentation_id : state.bandit_presentation_id,
    patternTraffic ? "aircraft.rapier" : "aircraft.fighter-jet",
  );
  const entityId = nonEmptyText(
    patternTraffic ? state.player_entity_id : state.bandit_entity_id,
    patternTraffic ? "entity.player" : "entity.bandit",
  );
  const identity = `${aircraftId}#${entityId}:${prefix}`;
  const unrecordedReplay = state.replay_external === true
    && state.suppress_unrecorded_combat_transients === true;

  return {
    audible: present && alive && positionValid && selectedSlot !== slot && !unrecordedReplay,
    identity,
    rangeM,
    closureKts,
    state: {
      bandit_aircraft_id: identity,
      opponent_alive: present && alive,
      opponent_body_present: present,
      range_m: rangeM,
      closure_kts: closureKts,
      player_aircraft_id: state.player_aircraft_id,
      audio_profile_id: state.audio_profile_id,
      audio_perspective: state.audio_perspective,
      camera_perspective: state.camera_perspective,
      replay_external: state.replay_external,
      replay_camera: state.replay_camera,
      px,
      py,
      pz,
      bx: x,
      by: y,
      bz: z,
      pfx: state.pfx,
      pfy: state.pfy,
      pfz: state.pfz,
      plx: state.plx,
      ply: state.ply,
      plz: state.plz,
      // Formation slots publish their own forward axis; the flyby aspect term uses it directly
      // rather than falling back to the closure-sign approximation.
      bfx: finiteNumber(state[`${prefix}fx`]),
      bfy: finiteNumber(state[`${prefix}fy`]),
      bfz: finiteNumber(state[`${prefix}fz`]),
      true_airspeed_kts: finiteNumber(state.true_airspeed_kts),
      air_temperature_c: finiteNumber(
        state.air_temperature_c,
        state.static_temperature_c,
      ) ?? 15,
    },
  };
}

/// Select the object assigned to a supplemental graph. Ordinarily it is w1..w3; for the currently
/// selected live wingman, the authoritative graph owns that wingman and this graph carries the
/// displaced primary instead.
export function projectSupplementalContactAudioState(state, slot, tracking = {}) {
  const formation = projectFormationContactAudioState(state, slot, tracking);
  if (!formation) return null;
  const selectedSlot = Math.max(
    0,
    Math.trunc(finiteNumber(state?.selected_player_gun_target_slot) ?? 0),
  );
  const prefix = `w${slot}`;
  const selectedOwnsAuthoritativeGraph = selectedSlot === slot
    && (state?.[`${prefix}_present`] === 1 || state?.[`${prefix}_present`] === true);
  if (!selectedOwnsAuthoritativeGraph) return formation;
  return projectPrimaryContactAudioState(state, tracking) ?? formation;
}

function updateFormationContacts(state, live) {
  const now = context.currentTime;
  for (let index = 0; index < formationContactVoices.length; index++) {
    const track = formationContactTracks[index];
    const elapsedSeconds = track.at == null ? null : now - track.at;
    let projected = projectSupplementalContactAudioState(state, index + 1, {
      previousRangeM: track.rangeM,
      elapsedSeconds,
      smoothedClosureKts: track.closureKts,
    });
    if (!projected) continue;
    if (track.identity && projected.identity !== track.identity) {
      projected = projectSupplementalContactAudioState(state, index + 1);
    }
    updateContactAcousticVoices(
      formationContactVoices[index],
      context,
      projected.state,
      { enabled: live && projected.audible },
    );
    track.identity = projected.identity;
    track.rangeM = Number.isFinite(projected.rangeM) ? projected.rangeM : null;
    track.closureKts = projected.closureKts;
    track.at = now;
  }
}

function synchronizeCombatLifecycle(state) {
  const keyParts = [
    nonEmptyText(state?.player_entity_id),
    nonEmptyText(state?.bandit_entity_id),
    nonEmptyText(state?.event_stream_id, "live"),
  ];
  if (!keyParts[0] && !keyParts[1]) return;
  const key = keyParts.join("|");
  if (key === lastCombatLifecycleKey) return;
  lastCombatLifecycleKey = key;
  // Do not replay cumulative counters from the previous sortie/opponent when the new entity starts
  // below them, and do not invent a destroy edge merely because audio was armed mid-engagement.
  eventVoices.lastHits = Math.max(0, Math.trunc(finiteNumber(state?.hits) ?? 0));
  eventVoices.lastOpponentHits = Math.max(
    0,
    Math.trunc(finiteNumber(state?.opponent_hits) ?? 0),
  );
  eventVoices.lastOpponentAlive = typeof state?.opponent_alive === "boolean"
    ? state.opponent_alive
    : state?.bandit_alive !== false;
}

/// User-gesture unlock. Safe to call repeatedly; no-ops when audio is disabled or unsupported.
function armFlightAudioLocal(state = null) {
  if (disabled || !enabled) return false;
  try {
    if (!context && !build()) {
      disabled = true;
      return false;
    }
    backgrounded = globalThis.document?.hidden === true;
    if (!backgrounded
      && contextNeedsUserResume(context)
      && !resumePending
      && userActivationAllowsResume()) {
      const attempt = context.resume();
      if (attempt?.then) {
        const pending = Promise.resolve(attempt)
          .catch(() => {})
          .finally(() => {
            if (resumePending === pending) resumePending = null;
            publishFlightAudioRuntimeState();
          });
        resumePending = pending;
        publishFlightAudioRuntimeState();
      }
    }
    ensureJetSamples(state);
    return true;
  } catch {
    disabled = true;
    publishFlightAudioRuntimeState();
    return false;
  }
}

function setFlightAudioEnabledLocal(nextEnabled) {
  enabled = Boolean(nextEnabled);
  if (!enabled) lastAudibleTarget = false;
  if (!master || !context) {
    publishFlightAudioRuntimeState();
    return enabled;
  }
  try {
    const liveOutput = enabled
      && lastAudibleTarget
      && !silentQa
      && !backgrounded
      && context?.state === "running";
    setMasterOutput(liveOutput ? 0.55 : 0);
  } catch {
    disabled = true;
  }
  publishFlightAudioRuntimeState();
  return enabled;
}

function isFlightAudioEnabledLocal() {
  return enabled;
}

/** Pure mutual-exclusion plan for the ownship propulsion graphs. */
export function flightPropulsionGraphGates(state, live) {
  const propulsionCharacter = resolvePropulsionCharacter(state);
  const cobraActive = propulsionCharacter === "cobra";
  const f14Active = propulsionCharacter === "f14";
  const audibleFrame = live === true;
  return Object.freeze({
    propulsionCharacter,
    cobraActive,
    f14Active,
    jetMuted: !audibleFrame || cobraActive || f14Active,
    cobraMuted: !audibleFrame || !cobraActive,
    f14Muted: !audibleFrame || !f14Active,
    radioEngine: cobraActive ? "cobra" : f14Active ? "f14" : "jet",
  });
}

/// Drive every continuous voice from the flat snapshot. `triggerHeld` gates gun reports.
function updateFlightAudioLocal(state, {
  muted = false,
  triggerHeld = false,
  radioVoiceEnabled = true,
  nowSeconds = 0,
} = {}) {
  if (disabled) return;
  try {
    // Preference-off audio stays allocation-free until the user explicitly enables it.
    if (!enabled && !context) return;
    if (!context && !build()) {
      disabled = true;
      return;
    }
    if (contextNeedsUserResume(context)) {
      // Updates run every animation frame and are not a reliable user gesture. Keep the graph
      // inaudible here; armFlightAudio owns the single in-flight resume attempt. Safari reports
      // the same user-gesture requirement as "interrupted" after calls, route changes, and sleep.
      setMasterOutput(0);
      lastAudibleTarget = false;
      publishFlightAudioRuntimeState();
      return;
    }

    const audioState = projectFlightAudioState(state);
    const live = enabled && !muted && !backgrounded;
    const propulsionGates = flightPropulsionGraphGates(audioState, live);
    const { cobraActive, f14Active } = propulsionGates;
    // Cobra owns a small dedicated rotorcraft graph, allocated only on its first live frame.
    // It still feeds the same compressor/master and therefore inherits preference mute,
    // lifecycle suspension, and ?audioQa=silent without a second AudioContext or output path.
    if (cobraActive && !cobraVoices)
      cobraVoices = createCobraAudioVoices(context, propulsionDuck);
    // The Tomcat graph is likewise lazy and bus-owned. Its twin-engine/intake/wing-sweep identity
    // must not leak into the generic fixed-wing graph used by the MiG-28 and older aircraft.
    if (f14Active && !f14Voices)
      f14Voices = createF14AudioVoices(context, propulsionDuck);
    ensureDedicatedAircraftSampleBed(cobraActive, cobraVoices, COBRA_COCKPIT_SAMPLE_BED);
    ensureDedicatedAircraftSampleBed(f14Active, f14Voices, F14_COCKPIT_SAMPLE_BED);
    ensureJetSamples(audioState);
    synchronizeCombatLifecycle(audioState);

    lastAudibleTarget = live;
    // Collapse continuous gains on mute/pause (view loop still ticks while paused).
    // Generic jet, F-14, and Cobra propulsion are mutually exclusive. Combat events,
    // warnings, contacts, and radio below remain shared and continue to receive the same frame.
    updateEngineVoices(engineVoices, context, audioState, {
      muted: propulsionGates.jetMuted,
    });
    if (cobraVoices) {
      updateCobraAudioVoices(cobraVoices, context, audioState, {
        muted: propulsionGates.cobraMuted,
      });
    }
    if (f14Voices) {
      updateF14AudioVoices(f14Voices, context, audioState, {
        muted: propulsionGates.f14Muted,
      });
    }
    updateBuffetVoice(eventVoices, context, audioState, { enabled: live });
    updateAirframeCueVoices(eventVoices, context, audioState, { enabled: live });
    updateConfigurationVoices(eventVoices, context, audioState, { enabled: live });
    updateContactAcousticVoices(
      contactVoices,
      context,
      projectSelectedContactAudioState(audioState),
      { enabled: live },
    );
    updateFormationContacts(audioState, live);
    updateCatapultVoice(eventVoices, context, audioState, { enabled: live });
    updateRcsVoice(eventVoices, context, audioState, { enabled: live });
    updateTrapVoice(eventVoices, context, audioState, { enabled: live });
    updateCombatCueVoices(eventVoices, context, audioState, { enabled: live });
    fireGunReports(eventVoices, context, audioState, { enabled: live, triggerHeld });
    updateWarningVoices(warningVoices, context, audioState, {
      enabled: live,
      nowSeconds,
    });
    // Radio owns the shared downstream duck multiplier, independent of which mutually-exclusive
    // aircraft graph is live. No per-frame graph trim can overwrite an async transmission duck.
    updateRadioVoice(radioVoice, context, state, {
      enabled: live && radioVoiceEnabled,
    });
    setMasterOutput(live && !silentQa ? 0.55 : 0, {
      timeConstant: live && !silentQa ? 0.18 : 0.02,
    });
    publishFlightAudioRuntimeState();
  } catch {
    disabled = true;
    lastAudibleTarget = false;
    publishFlightAudioRuntimeState();
  }
}

const sharedFlightAudio = createSharedFlightAudioFacade({
  arm: armFlightAudioLocal,
  setEnabled: setFlightAudioEnabledLocal,
  isEnabled: isFlightAudioEnabledLocal,
  diagnostics: flightAudioDiagnosticsLocal,
  suspend: suspendFlightAudioLocal,
  update: updateFlightAudioLocal,
}, import.meta.url);

/// User-gesture unlock. Safe to call repeatedly; every import identity reaches the shared graph.
export function armFlightAudio(state = null) {
  return sharedFlightAudio.arm(state);
}

export function setFlightAudioEnabled(nextEnabled) {
  return sharedFlightAudio.setEnabled(nextEnabled);
}

export function isFlightAudioEnabled() {
  return sharedFlightAudio.isEnabled();
}

export function flightAudioDiagnostics() {
  return sharedFlightAudio.diagnostics();
}

/// Immediate cleanup hook for QA harnesses and lifecycle owners. It always cuts the master before
/// asking the browser to suspend, so a rejected suspend cannot leave a ghost engine running.
export function suspendFlightAudio(reason = "manual") {
  return sharedFlightAudio.suspend(reason);
}

/// Drive every continuous voice from the flat snapshot. `triggerHeld` gates gun reports.
export function updateFlightAudio(state, options = {}) {
  return sharedFlightAudio.update(state, options);
}
