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

let context = null;
let master = null;
let bus = null;
let engineVoices = null;
let eventVoices = null;
let contactVoices = null;
let formationContactVoices = [];
let formationContactTracks = [];
let warningVoices = null;
let disabled = false;
let enabled = true;
let sampleLoad = null;
let lastCharacter = null;
let sampleLoadGeneration = 0;
let lastCombatLifecycleKey = "";
let resumePending = null;
const sampleBedCache = new Map();
const MPS_TO_KNOTS = 1.9438444924406;
const KNOTS_TO_MPS = 0.5144444444444;
const SEA_LEVEL_DENSITY = 1.225;

function build() {
  const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Ctor) return false;
  context = new Ctor();

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

  // Keep propulsion behind its authored trim before it reaches the shared compressor. Sample
  // beds otherwise hit the limiter directly and flatten the RPM/power/G distinctions.
  engineVoices = createEngineVoices(context, bus, { includeMaster: true });
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

  const generation = sampleLoadGeneration;
  const promise = loadJetSampleBeds(context, { character });
  sampleLoad = { character, promise };
  promise
    .then((beds) => {
      if (beds?.mil) sampleBedCache.set(character, beds);
      if (generation !== sampleLoadGeneration || lastCharacter !== character) return;
      if (engineVoices.hasSampleBeds) {
        replaceJetSampleBeds(engineVoices, context, beds, { character });
      } else {
        attachJetSampleBeds(engineVoices, context, beds, { character });
      }
    })
    .catch(() => {})
    .finally(() => {
      if (sampleLoad?.promise === promise) sampleLoad = null;
    });
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
export function armFlightAudio(state = null) {
  if (disabled || !enabled) return false;
  try {
    if (!context && !build()) {
      disabled = true;
      return false;
    }
    if (context.state === "suspended" && !resumePending) {
      const attempt = context.resume();
      if (attempt?.then) {
        const pending = Promise.resolve(attempt)
          .catch(() => {})
          .finally(() => {
            if (resumePending === pending) resumePending = null;
          });
        resumePending = pending;
      }
    }
    ensureJetSamples(state);
    return true;
  } catch {
    disabled = true;
    return false;
  }
}

export function setFlightAudioEnabled(nextEnabled) {
  enabled = Boolean(nextEnabled);
  if (!master || !context) return enabled;
  try {
    master.gain.setTargetAtTime(enabled ? 0.55 : 0, context.currentTime, 0.02);
  } catch {
    disabled = true;
  }
  return enabled;
}

export function isFlightAudioEnabled() {
  return enabled;
}

/// Drive every continuous voice from the flat snapshot. `triggerHeld` gates gun reports.
export function updateFlightAudio(state, {
  muted = false,
  triggerHeld = false,
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
    if (context.state === "suspended") {
      // Updates run every animation frame and are not a reliable user gesture. Keep the graph
      // inaudible here; armFlightAudio owns the single in-flight resume attempt.
      master.gain.setTargetAtTime(0, context.currentTime, 0.02);
      return;
    }

    const audioState = projectFlightAudioState(state);
    ensureJetSamples(audioState);
    synchronizeCombatLifecycle(audioState);

    const live = enabled && !muted;
    // Collapse continuous gains on mute/pause (view loop still ticks while paused).
    updateEngineVoices(engineVoices, context, audioState, { muted: !live });
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
    master.gain.setTargetAtTime(live ? 0.55 : 0, context.currentTime, live ? 0.18 : 0.02);
  } catch {
    disabled = true;
  }
}
