import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import { TelemetryStateDecoder } from "../../web/wwwroot/render/telemetry/state_delta.js";

export const RAM_LIGHT_MACH = 2.0;
export const FULL_RAM_MACH = 2.8;
export const RECONSTRUCTION_VERSION = 1;
export const MAX_INPUT_BYTES = 256 * 1024 * 1024;
export const MAX_ROWS_PER_INPUT = 2_000_000;

const RAPIER_PHASE_NAMES = Object.freeze({
  1: "LAUNCH",
  2: "CLIMB",
  3: "ACCELERATE",
  4: "RAMCLIMB",
  5: "ZOOM_PULL",
  6: "ZOOM_COAST",
  7: "REENTER_ALIGN",
  8: "DIP_RELIGHT",
  9: "INTERCEPT",
  10: "ATTACK",
  11: "ESCAPE",
  12: "RETURN_TO_BASE",
  13: "RECOVERY",
  14: "COMPLETE",
});

const CONTROL_NAMES = new Map([
  [0, "pull"],
  [1, "push"],
  [2, "roll_left"],
  [3, "roll_right"],
  [4, "rudder_left"],
  [5, "rudder_right"],
  [6, "power_up"],
  [7, "power_down"],
  [8, "fire"],
  [9, "padlock"],
  [10, "handoff_rtb"],
  [12, "limit_override"],
  [13, "gear_toggle"],
  [14, "flaps_up"],
  [15, "flaps_down"],
  [20, "gcas_paddle"],
  ["ArrowDown", "pull"],
  ["ArrowUp", "push"],
  ["ArrowLeft", "roll_left"],
  ["ArrowRight", "roll_right"],
  ["KeyA", "rudder_left"],
  ["KeyD", "rudder_right"],
  ["KeyW", "power_up"],
  ["KeyS", "power_down"],
  ["KeyF", "fire"],
  ["KeyV", "padlock"],
  ["KeyO", "handoff_rtb"],
  ["Space", "limit_override"],
  ["KeyG", "gear_toggle"],
  ["BracketLeft", "flaps_up"],
  ["BracketRight", "flaps_down"],
  ["KeyK", "gcas_paddle"],
]);

const TRACK_STATE_FIELDS = [
  "px", "py", "pz",
  "vx", "vy", "vz",
  "heading_deg", "pitch_deg", "bank_deg", "aoa_deg",
  "mach",
  "indicated_airspeed_kts", "true_airspeed_kts", "ground_speed_kts",
  "alt_ft", "radar_alt_ft", "vertical_speed_fpm",
  "g_actual", "pilot_gz", "requested_g_cmd", "g_cmd",
  "requested_bank_target_deg", "bank_target_deg",
  "throttle", "requested_throttle", "applied_throttle",
  "pilot_aileron", "total_aileron_command_deg",
  "rapier_turbine_thrust_kn", "rapier_ramjet_thrust_kn",
  "rapier_turbine_fuel_ppm", "rapier_ramjet_fuel_ppm",
  "rapier_stagnation_temp_c", "rapier_thermal_margin_c",
  "fuel_lb", "fuel_flow_lb_min", "fuel_joker", "fuel_bingo", "fuel_minimum", "fuel_emergency",
  "rapier_mission_phase", "rapier_mission_phase_name", "rapier_phase_reason",
  "rapier_target_mach", "rapier_target_altitude_ft",
  "rapier_fd_bank_deg", "rapier_fd_target_ktas", "rapier_nose_on_v_err_deg",
  "range_m", "closure_kts", "rapier_pursuit_range_m",
  "engagement_number", "rounds_fired", "bandit_alive",
  "pilot_state", "pilot_control_interlocked",
  "pilot_trigger_interlocked", "player_trigger_interlocked",
  "gear_nose", "gear_left", "gear_right",
  "catapult_active", "arrest_time_s", "arrest_speed_kts",
  "finished", "recovery", "touchdown_grade",
];

export class RapierReconstructError extends Error {
  constructor(message) {
    super(message);
    this.name = "RapierReconstructError";
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validateInputPath(inputPath) {
  if (typeof inputPath !== "string" || !inputPath.trim()) {
    throw new RapierReconstructError("input path is required");
  }
  const trimmed = inputPath.trim();
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) {
    throw new RapierReconstructError(
      "network URLs are not accepted; provide a local .jsonl or .jsonl.gz path",
    );
  }
  const normalized = resolve(trimmed);
  if (!normalized.endsWith(".jsonl") && !normalized.endsWith(".jsonl.gz")) {
    throw new RapierReconstructError("input must be a local .jsonl or .jsonl.gz file");
  }
  return normalized;
}

async function readInput(inputPath) {
  const path = validateInputPath(inputPath);
  const fileStat = await stat(path);
  if (fileStat.size > MAX_INPUT_BYTES) {
    throw new RapierReconstructError(`${basename(path)} exceeds ${MAX_INPUT_BYTES} compressed bytes`);
  }
  const sourceBytes = await readFile(path);
  const contentBytes = path.endsWith(".gz") ? gunzipSync(sourceBytes) : sourceBytes;
  if (contentBytes.byteLength > MAX_INPUT_BYTES) {
    throw new RapierReconstructError(`${basename(path)} exceeds ${MAX_INPUT_BYTES} decoded bytes`);
  }
  const lines = contentBytes.toString("utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length > MAX_ROWS_PER_INPUT) {
    throw new RapierReconstructError(`${basename(path)} exceeds ${MAX_ROWS_PER_INPUT} rows`);
  }
  const rows = lines.map((line, index) => {
    try {
      const row = JSON.parse(line);
      if (!isRecord(row)) throw new Error("not an object");
      return row;
    } catch {
      throw new RapierReconstructError(`${basename(path)} line ${index + 1} is not a JSON object`);
    }
  });
  return {
    path,
    basename: basename(path),
    sha256: createHash("sha256").update(sourceBytes).digest("hex"),
    bytes: sourceBytes.byteLength,
    decodedBytes: contentBytes.byteLength,
    rowCount: rows.length,
    rows,
  };
}

export async function loadTelemetryInputs(inputPaths) {
  if (!Array.isArray(inputPaths) || inputPaths.length === 0) {
    throw new RapierReconstructError("at least one --input path is required");
  }
  return Promise.all(inputPaths.map(readInput));
}

function rowStableKey(row) {
  if (!isRecord(row) || typeof row.k !== "string") return null;
  if (row.k === "st" && Number.isSafeInteger(row.q)) return `st:${row.q}`;
  if (row.k === "hdr" && typeof row.batch_id === "string") return `hdr:${row.batch_id}`;
  if (row.k === "perf" && Number.isFinite(row.t)) return `perf:${row.t}`;
  if (row.k === "in") {
    return `in:${row.type ?? ""}:${row.code ?? ""}:${row.sortie ?? ""}:${row.t ?? ""}`;
  }
  return `${row.k}:${JSON.stringify(row)}`;
}

function preferRow(existing, candidate) {
  if (!existing) return candidate;
  if (candidate.k === "st" && isRecord(candidate.s) !== isRecord(existing.s)) {
    return isRecord(candidate.s) ? candidate : existing;
  }
  return JSON.stringify(candidate).length >= JSON.stringify(existing).length ? candidate : existing;
}

function mergeSources(sources) {
  const sessions = new Set(sources.flatMap((source) => source.rows
    .filter((row) => row?.k === "hdr" && typeof row.session === "string")
    .map((row) => row.session)));
  if (sessions.size > 1) {
    throw new RapierReconstructError("inputs contain multiple telemetry sessions");
  }
  const merged = new Map();
  for (const source of sources) {
    for (const row of source.rows) {
      const key = rowStableKey(row);
      if (key) merged.set(key, preferRow(merged.get(key), row));
    }
  }
  return [...merged.values()];
}

function selectHeader(rows) {
  return rows
    .filter((row) => row?.k === "hdr")
    .sort((left, right) => (left.t0 ?? 0) - (right.t0 ?? 0))[0] ?? null;
}

function wallEpochMs(header, sessionMs) {
  if (!Number.isFinite(header?.t0) || !Number.isFinite(sessionMs)) return null;
  return header.t0 + sessionMs;
}

function videoTimeSeconds(wallMs, videoStartEpochMs, videoDurationS) {
  if (!Number.isFinite(wallMs) || !Number.isFinite(videoStartEpochMs)) return null;
  const offset = (wallMs - videoStartEpochMs) / 1000;
  if (Number.isFinite(videoDurationS) && (offset < 0 || offset > videoDurationS)) return null;
  return Number(offset.toFixed(3));
}

function resolveVideoAlignment(rows, header, {
  videoStartEpochMs,
  videoSyncMarker,
  videoSyncSeconds,
  sortieId,
} = {}) {
  const explicitStart = finiteNumber(videoStartEpochMs);
  const markerId = typeof videoSyncMarker === "string" && videoSyncMarker.trim()
    ? videoSyncMarker.trim() : null;
  const markerSeconds = finiteNumber(videoSyncSeconds);
  if (explicitStart !== null && (markerId !== null || markerSeconds !== null)) {
    throw new RapierReconstructError(
      "choose either --video-start-epoch-ms or sync-marker alignment, not both",
    );
  }
  if ((markerId === null) !== (markerSeconds === null)) {
    throw new RapierReconstructError(
      "--video-sync-marker and --video-sync-seconds must be supplied together",
    );
  }
  if (explicitStart !== null) {
    return {
      videoStartEpochMs: explicitStart,
      alignment: "explicit_start_epoch",
      markerId: null,
      markerVideoSeconds: null,
    };
  }
  if (markerId === null) {
    return {
      videoStartEpochMs: null,
      alignment: null,
      markerId: null,
      markerVideoSeconds: null,
    };
  }

  const marker = rows.find((row) => row?.k === "in"
    && row.type === "flight-test-sync"
    && row.code === markerId
    && (!sortieId || row.sortie === sortieId));
  if (!marker) {
    throw new RapierReconstructError(`sync marker not found: ${markerId}`);
  }
  const markerWallMs = finiteNumber(marker.wall_epoch_ms)
    ?? wallEpochMs(header, finiteNumber(marker.t));
  if (markerWallMs === null) {
    throw new RapierReconstructError(`sync marker has no usable time: ${markerId}`);
  }
  return {
    videoStartEpochMs: markerWallMs - markerSeconds * 1000,
    alignment: "flight_test_sync_marker",
    markerId,
    markerVideoSeconds: markerSeconds,
  };
}

function pickFields(state) {
  const picked = {};
  for (const name of TRACK_STATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(state ?? {}, name)) picked[name] = state[name];
  }
  return picked;
}

function phaseCode(point) {
  return Math.floor(Number(point?.rapier_mission_phase) || 0);
}

function phaseLabel(point) {
  const code = phaseCode(point);
  return RAPIER_PHASE_NAMES[code] ?? (code ? `PHASE_${code}` : null);
}

function decodeStateRows(stateRows) {
  const decoder = new TelemetryStateDecoder();
  const decoded = [];
  const gaps = [];
  for (const row of stateRows) {
    const previousQ = decoder.sequence;
    try {
      const state = decoder.decode(row);
      if (Number.isSafeInteger(previousQ) && row.q !== previousQ + 1) {
        gaps.push({
          kind: "q_gap",
          expected_q: previousQ + 1,
          received_q: row.q,
          session_ms: finiteNumber(row.t),
          recovered_by_keyframe: isRecord(row.s),
        });
      }
      decoded.push({ row, state });
    } catch (error) {
      gaps.push({
        kind: "decode",
        at_q: row.q,
        session_ms: finiteNumber(row.t),
        keyframe: isRecord(row.s),
        message: error.message,
      });
      if (!isRecord(row.s)) continue;
      decoder.state = null;
      decoder.sequence = null;
      try {
        decoded.push({ row, state: decoder.decode(row) });
      } catch (retryError) {
        gaps.push({
          kind: "decode_recovery_failed",
          at_q: row.q,
          session_ms: finiteNumber(row.t),
          message: retryError.message,
        });
      }
    }
  }
  return { decoded, gaps };
}

function sortieMatches(state, sortieId) {
  return !sortieId || state?.telemetry_sortie_id === sortieId;
}

function perfAt(perfRows, sessionMs) {
  let low = 0;
  let high = perfRows.length - 1;
  let hit = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (perfRows[middle].t <= sessionMs) {
      hit = perfRows[middle];
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return hit;
}

function projectTrackPoint(row, state, header, videoOptions, perfRows) {
  const sessionMs = finiteNumber(row.t);
  const wallMs = wallEpochMs(header, sessionMs);
  const point = {
    q: row.q,
    session_ms: sessionMs,
    sim_s: finiteNumber(state.t),
    wall_epoch_ms: wallMs === null ? undefined : Math.round(wallMs),
    held: Array.isArray(row.held) ? [...row.held] : [],
    ...pickFields(state),
  };
  const videoS = videoTimeSeconds(
    wallMs,
    videoOptions.videoStartEpochMs,
    videoOptions.videoDurationS,
  );
  if (videoS !== null) point.video_s = videoS;
  point.rapier_mission_phase_label = phaseLabel(point);
  if (point.rapier_mission_phase_name !== undefined) {
    point.rapier_phase_label_matches = point.rapier_mission_phase_name === phaseLabel(point);
  }
  const perf = perfAt(perfRows, sessionMs);
  if (perf) {
    for (const field of [
      "frame_ms_p50", "frame_ms_p95", "frame_ms_max", "frames_over_22ms",
      "governor_level", "scenery_suppressed", "draw_calls", "triangles",
    ]) {
      if (Object.prototype.hasOwnProperty.call(perf, field)) point[field] = perf[field];
    }
  }
  return point;
}

function continuousIntervals(track) {
  const intervals = [];
  let open = null;
  for (const point of track) {
    const contiguous = open
      && point.q === open.last_q + 1
      && point.session_ms - open.last_session_ms > 0
      && point.session_ms - open.last_session_ms <= 250;
    if (!contiguous) {
      if (open) intervals.push(open);
      open = {
        first_q: point.q,
        last_q: point.q,
        first_session_ms: point.session_ms,
        last_session_ms: point.session_ms,
        first_video_s: point.video_s ?? null,
        last_video_s: point.video_s ?? null,
        samples: 1,
      };
      continue;
    }
    open.last_q = point.q;
    open.last_session_ms = point.session_ms;
    if (point.video_s !== undefined) {
      if (open.first_video_s === null) open.first_video_s = point.video_s;
      open.last_video_s = point.video_s;
    }
    open.samples += 1;
  }
  if (open) intervals.push(open);
  return intervals;
}

function recordIntervalGaps(intervals) {
  const gaps = [];
  for (let index = 1; index < intervals.length; index += 1) {
    const previous = intervals[index - 1];
    const current = intervals[index];
    gaps.push({
      kind: "interval",
      from_q: previous.last_q,
      to_q: current.first_q,
      missing_samples: Math.max(0, current.first_q - previous.last_q - 1),
      session_ms_delta: current.first_session_ms - previous.last_session_ms,
    });
  }
  return gaps;
}

function coverageFromIntervals(intervals, videoDurationS) {
  const coveredS = intervals.reduce((sum, interval) => {
    if (!Number.isFinite(interval.first_video_s) || !Number.isFinite(interval.last_video_s)) return sum;
    return sum + Math.max(0, interval.last_video_s - interval.first_video_s);
  }, 0);
  return {
    covered_video_s: Number(coveredS.toFixed(3)),
    covered_video_fraction: Number.isFinite(videoDurationS) && videoDurationS > 0
      ? Number((coveredS / videoDurationS).toFixed(4))
      : null,
  };
}

function edgeEvent(kind, point, evidence) {
  return {
    kind,
    q: point.q,
    session_ms: point.session_ms,
    sim_s: point.sim_s,
    wall_epoch_ms: point.wall_epoch_ms,
    video_s: point.video_s,
    evidence,
  };
}

function weightOffWheelsEvidence(previous, point) {
  const gearRetracting = ["gear_nose", "gear_left", "gear_right"].some((field) => {
    const before = finiteNumber(previous[field]);
    const after = finiteNumber(point[field]);
    return before !== null && after !== null && before >= 0.99 && after < 0.99;
  });
  if (gearRetracting) {
    return { gear_retraction: true, radar_alt_ft: finiteNumber(point.radar_alt_ft) };
  }
  const previousRadar = finiteNumber(previous.radar_alt_ft);
  const radar = finiteNumber(point.radar_alt_ft);
  const groundSpeed = finiteNumber(point.ground_speed_kts);
  if (
    previousRadar !== null
    && radar !== null
    && groundSpeed !== null
    && previousRadar <= 50
    && radar > 50
    && groundSpeed > 80
  ) {
    return {
      radar_alt_ft: radar,
      ground_speed_kts: groundSpeed,
    };
  }
  return null;
}

function detectEvents(track) {
  const events = [];
  for (let index = 1; index < track.length; index += 1) {
    const previous = track[index - 1];
    const point = track[index];
    if (point.q !== previous.q + 1 || point.session_ms - previous.session_ms > 250) continue;

    if (phaseCode(point) && phaseCode(point) !== phaseCode(previous)) {
      events.push(edgeEvent("rapier_mission_phase", point, {
        from_phase: phaseCode(previous),
        to_phase: phaseCode(point),
        from_label: phaseLabel(previous),
        to_label: phaseLabel(point),
        observed_cold_name: point.rapier_mission_phase_name ?? null,
        observed_cold_reason: point.rapier_phase_reason ?? null,
        cold_label_matches: point.rapier_phase_label_matches ?? null,
      }));
    }

    const mach = finiteNumber(point.mach);
    const previousMach = finiteNumber(previous.mach);
    for (const [threshold, kind] of [
      [RAM_LIGHT_MACH, "ram_light_crossing"],
      [FULL_RAM_MACH, "full_ram_crossing"],
    ]) {
      if (previousMach !== null && mach !== null && previousMach < threshold && mach >= threshold) {
        events.push(edgeEvent(kind, point, { mach, threshold, direction: "up" }));
      }
    }

    for (const field of ["fuel_joker", "fuel_bingo", "fuel_minimum", "fuel_emergency"]) {
      if (point[field] === true && previous[field] !== true) {
        events.push(edgeEvent("fuel_threshold", point, {
          field,
          fuel_lb: finiteNumber(point.fuel_lb),
        }));
      }
    }
    for (const field of [
      "pilot_control_interlocked",
      "pilot_trigger_interlocked",
      "player_trigger_interlocked",
    ]) {
      if (point[field] !== previous[field] && typeof point[field] === "boolean") {
        events.push(edgeEvent(
          point[field] ? "pilot_interlock" : "pilot_interlock_cleared",
          point,
          { field },
        ));
      }
    }

    if (finiteNumber(point.engagement_number) !== finiteNumber(previous.engagement_number)) {
      events.push(edgeEvent("engagement_change", point, {
        from: finiteNumber(previous.engagement_number),
        to: finiteNumber(point.engagement_number),
        bandit_alive: point.bandit_alive ?? null,
      }));
    }
    if (
      finiteNumber(point.rounds_fired) !== null
      && finiteNumber(previous.rounds_fired) !== null
      && point.rounds_fired > previous.rounds_fired
    ) {
      events.push(edgeEvent("rounds_fired", point, {
        from: previous.rounds_fired,
        to: point.rounds_fired,
      }));
    }

    const wowEvidence = weightOffWheelsEvidence(previous, point);
    if (wowEvidence) events.push(edgeEvent("weight_off_wheels", point, wowEvidence));

    if (
      finiteNumber(point.arrest_time_s) !== null
      && finiteNumber(point.arrest_time_s) > (finiteNumber(previous.arrest_time_s) ?? 0)
    ) {
      events.push(edgeEvent("landing", point, {
        arrest_time_s: point.arrest_time_s,
        arrest_speed_kts: finiteNumber(point.arrest_speed_kts),
        recovery: point.recovery ?? null,
        touchdown_grade: point.touchdown_grade ?? null,
      }));
    } else if (point.finished === true && previous.finished !== true) {
      events.push(edgeEvent("landing", point, {
        finished: true,
        recovery: point.recovery ?? null,
        touchdown_grade: point.touchdown_grade ?? null,
      }));
    }
  }
  return events;
}

function detectGapBracketedThresholds(track) {
  const events = [];
  for (let index = 1; index < track.length; index += 1) {
    const previous = track[index - 1];
    const point = track[index];
    const discontinuous = point.q !== previous.q + 1 || point.session_ms - previous.session_ms > 250;
    if (!discontinuous) continue;
    const previousMach = finiteNumber(previous.mach);
    const mach = finiteNumber(point.mach);
    if (previousMach === null || mach === null) continue;
    for (const [threshold, kind] of [
      [RAM_LIGHT_MACH, "ram_light_bracketed_by_gap"],
      [FULL_RAM_MACH, "full_ram_bracketed_by_gap"],
    ]) {
      if (previousMach < threshold && mach >= threshold) {
        events.push(edgeEvent(kind, point, {
          threshold,
          before_q: previous.q,
          before_mach: previousMach,
          after_q: point.q,
          after_mach: mach,
          exact_crossing_observed: false,
        }));
      }
    }
  }
  return events;
}

const EXTREMA = [
  ["max_mach", "mach", "max"],
  ["max_alt_ft", "alt_ft", "max"],
  ["max_radar_alt_ft", "radar_alt_ft", "max"],
  ["max_vertical_speed_fpm", "vertical_speed_fpm", "max"],
  ["min_vertical_speed_fpm", "vertical_speed_fpm", "min"],
  ["max_ias_kts", "indicated_airspeed_kts", "max"],
  ["max_tas_kts", "true_airspeed_kts", "max"],
  ["max_ground_speed_kts", "ground_speed_kts", "max"],
  ["max_g_actual", "g_actual", "max"],
  ["min_g_actual", "g_actual", "min"],
  ["max_pilot_gz", "pilot_gz", "max"],
  ["max_abs_bank_deg", "bank_deg", "abs"],
  ["max_aoa_deg", "aoa_deg", "max"],
  ["min_thermal_margin_c", "rapier_thermal_margin_c", "min"],
  ["max_stagnation_temp_c", "rapier_stagnation_temp_c", "max"],
  ["min_fuel_lb", "fuel_lb", "min"],
  ["max_target_closure_kts", "closure_kts", "max"],
  ["min_target_range_m", "range_m", "min"],
];

function summarizeTrack(track) {
  const summary = {
    samples: track.length,
    phase_dwell_s_observed: {},
    control_seconds_observed: {},
  };
  for (const [summaryKey, field, direction] of EXTREMA) {
    const candidates = track.filter((point) => finiteNumber(point[field]) !== null);
    if (!candidates.length) {
      summary[summaryKey] = null;
      continue;
    }
    const hit = candidates.reduce((best, point) => {
      const value = finiteNumber(point[field]);
      const bestValue = finiteNumber(best[field]);
      if (direction === "max") return value > bestValue ? point : best;
      if (direction === "min") return value < bestValue ? point : best;
      return Math.abs(value) > Math.abs(bestValue) ? point : best;
    });
    summary[summaryKey] = {
      value: finiteNumber(hit[field]),
      q: hit.q,
      session_ms: hit.session_ms,
      video_s: hit.video_s,
    };
  }
  summary.start = track[0] ?? null;
  summary.end = track.at(-1) ?? null;

  for (let index = 1; index < track.length; index += 1) {
    const previous = track[index - 1];
    const point = track[index];
    const delta = (point.session_ms - previous.session_ms) / 1000;
    if (point.q !== previous.q + 1 || delta <= 0 || delta > 0.25) continue;
    const phase = phaseLabel(previous);
    if (phase) {
      summary.phase_dwell_s_observed[phase] = Number(
        ((summary.phase_dwell_s_observed[phase] ?? 0) + delta).toFixed(3),
      );
    }
    for (const key of previous.held) {
      const name = CONTROL_NAMES.get(key) ?? CONTROL_NAMES.get(Number(key)) ?? `key_${key}`;
      summary.control_seconds_observed[name] = Number(
        ((summary.control_seconds_observed[name] ?? 0) + delta).toFixed(3),
      );
    }
  }
  return summary;
}

function extremaEvents(track, summary) {
  return EXTREMA.flatMap(([summaryKey, field]) => {
    const hit = summary[summaryKey];
    if (!hit) return [];
    const point = track.find((candidate) => candidate.q === hit.q);
    return point ? [edgeEvent(`extrema_${summaryKey}`, point, {
      field,
      value: hit.value,
    })] : [];
  });
}

function lifecycleEvents(rows, sortieId, header, videoOptions) {
  return rows
    .filter((row) => row?.k === "in"
      && row.type === "lifecycle"
      && (!sortieId || row.sortie === sortieId))
    .map((row) => {
      const wallMs = wallEpochMs(header, finiteNumber(row.t));
      return {
        kind: row.code,
        session_ms: finiteNumber(row.t),
        wall_epoch_ms: wallMs,
        video_s: videoTimeSeconds(
          wallMs,
          videoOptions.videoStartEpochMs,
          videoOptions.videoDurationS,
        ),
        evidence: {
          sortie: row.sortie ?? null,
          sortie_outcome: row.sortie_outcome ?? null,
          reason: row.reason ?? null,
        },
      };
    });
}

function flightTestSyncEvents(rows, sortieId, header, videoOptions) {
  return rows
    .filter((row) => row?.k === "in"
      && row.type === "flight-test-sync"
      && (!sortieId || row.sortie === sortieId))
    .map((row) => {
      const projectedWallMs = wallEpochMs(header, finiteNumber(row.t));
      const wallMs = finiteNumber(row.wall_epoch_ms) ?? projectedWallMs;
      return {
        kind: "flight_test_sync",
        session_ms: finiteNumber(row.t),
        wall_epoch_ms: wallMs,
        video_s: videoTimeSeconds(
          wallMs,
          videoOptions.videoStartEpochMs,
          videoOptions.videoDurationS,
        ),
        evidence: {
          marker_id: row.code ?? null,
          sample_key: row.sample_key ?? null,
          held: Array.isArray(row.held) ? [...row.held] : [],
        },
      };
    });
}

function projectPerformance(perfRows, header, videoOptions) {
  return perfRows.map((row) => {
    const wallMs = wallEpochMs(header, finiteNumber(row.t));
    const projected = {
      ...row,
      wall_epoch_ms: wallMs,
    };
    const videoS = videoTimeSeconds(
      wallMs,
      videoOptions.videoStartEpochMs,
      videoOptions.videoDurationS,
    );
    if (videoS !== null) projected.video_s = videoS;
    return projected;
  });
}

function summarizePerformance(performance) {
  const inWindow = performance.filter((row) => row.video_s !== undefined);
  const rows = inWindow.length ? inWindow : performance;
  const maximum = (field) => {
    const values = rows.map((row) => finiteNumber(row[field])).filter((value) => value !== null);
    return values.length ? Math.max(...values) : null;
  };
  const sum = (field) => rows.reduce((total, row) => total + (finiteNumber(row[field]) ?? 0), 0);
  return {
    scope: inWindow.length ? "video_window" : "all_available",
    windows: rows.length,
    p95_frame_ms_max: maximum("frame_ms_p95"),
    frame_ms_max: maximum("frame_ms_max"),
    frames_over_22ms: sum("frames_over_22ms"),
    governor_level_max: maximum("governor_level"),
    scenery_suppressed_windows: rows.filter((row) => row.scenery_suppressed === 1).length,
    sim_ms_max: maximum("sim_ms_max"),
    view_ms_max: maximum("view_ms_max"),
    time_compression_cost_dropped_ticks: sum("time_compression_cost_dropped_ticks"),
  };
}

export function reconstructRapierFlight({
  rows,
  sources = [],
  sortieId = null,
  videoStartEpochMs = undefined,
  videoDurationS = undefined,
  videoSyncMarker = undefined,
  videoSyncSeconds = undefined,
  rawRowCount = null,
} = {}) {
  if (!Array.isArray(rows)) throw new RapierReconstructError("rows must be an array");
  const header = selectHeader(rows);
  const perfRows = rows
    .filter((row) => row?.k === "perf" && Number.isFinite(row.t))
    .sort((left, right) => left.t - right.t);
  const stateRows = rows
    .filter((row) => row?.k === "st" && Number.isSafeInteger(row.q))
    .sort((left, right) => left.q - right.q || (left.t ?? 0) - (right.t ?? 0));
  const { decoded, gaps: decodeGaps } = decodeStateRows(stateRows);
  const resolvedAlignment = resolveVideoAlignment(rows, header, {
    videoStartEpochMs,
    videoSyncMarker,
    videoSyncSeconds,
    sortieId,
  });
  const videoOptions = {
    videoStartEpochMs: resolvedAlignment.videoStartEpochMs,
    videoDurationS: finiteNumber(videoDurationS),
  };
  const track = decoded
    .filter(({ state }) => sortieMatches(state, sortieId))
    .map(({ row, state }) => projectTrackPoint(row, state, header, videoOptions, perfRows));
  const intervals = continuousIntervals(track);
  const intervalCoverage = coverageFromIntervals(intervals, videoOptions.videoDurationS);
  const summary = summarizeTrack(track);
  const videoTrack = track.filter((point) => point.video_s !== undefined);
  const videoSummary = videoTrack.length ? summarizeTrack(videoTrack) : null;
  const performance = projectPerformance(perfRows, header, videoOptions);
  const events = [
    ...lifecycleEvents(rows, sortieId, header, videoOptions),
    ...flightTestSyncEvents(rows, sortieId, header, videoOptions),
    ...detectEvents(track),
    ...detectGapBracketedThresholds(track),
    ...extremaEvents(track, summary),
  ].sort((left, right) => (left.session_ms ?? 0) - (right.session_ms ?? 0));

  return {
    version: RECONSTRUCTION_VERSION,
    generated_at: new Date().toISOString(),
    sortie_id: sortieId,
    session: header?.session ?? null,
    build: header?.build ?? null,
    sources: sources.map((source) => ({
      path: source.path,
      basename: source.basename,
      sha256: source.sha256,
      bytes: source.bytes,
      decoded_bytes: source.decodedBytes,
      row_count: source.rowCount,
    })),
    coverage: {
      input_rows: rawRowCount ?? rows.length,
      merged_rows: rows.length,
      state_rows: stateRows.length,
      decoded_samples: track.length,
      duplicate_rows_suppressed: Math.max(0, (rawRowCount ?? rows.length) - rows.length),
      first_q: track[0]?.q ?? null,
      last_q: track.at(-1)?.q ?? null,
      first_session_ms: track[0]?.session_ms ?? null,
      last_session_ms: track.at(-1)?.session_ms ?? null,
      intervals,
      ...intervalCoverage,
      video_window: Number.isFinite(videoOptions.videoStartEpochMs) ? {
        start_epoch_ms: videoOptions.videoStartEpochMs,
        duration_s: videoOptions.videoDurationS,
        samples_in_window: track.filter((point) => point.video_s !== undefined).length,
        alignment: resolvedAlignment.alignment,
        sync_marker_id: resolvedAlignment.markerId,
        sync_marker_video_s: resolvedAlignment.markerVideoSeconds,
      } : null,
    },
    gaps: [...decodeGaps, ...recordIntervalGaps(intervals)],
    summary,
    video_summary: videoSummary,
    performance_summary: summarizePerformance(performance),
    events,
    track,
    performance,
  };
}

export async function reconstructRapierFlightFromInputs(options) {
  const sources = await loadTelemetryInputs(options.inputPaths);
  const rawRowCount = sources.reduce((total, source) => total + source.rowCount, 0);
  return reconstructRapierFlight({
    rows: mergeSources(sources),
    sources,
    rawRowCount,
    sortieId: options.sortieId ?? null,
    videoStartEpochMs: options.videoStartEpochMs,
    videoDurationS: options.videoDurationS,
    videoSyncMarker: options.videoSyncMarker,
    videoSyncSeconds: options.videoSyncSeconds,
  });
}

const CSV_COLUMNS = [
  "q", "session_ms", "sim_s", "wall_epoch_ms", "video_s",
  "mach", "indicated_airspeed_kts", "true_airspeed_kts", "ground_speed_kts",
  "alt_ft", "radar_alt_ft", "vertical_speed_fpm",
  "heading_deg", "pitch_deg", "bank_deg", "aoa_deg",
  "g_actual", "requested_g_cmd", "rapier_mission_phase",
  "rapier_mission_phase_label", "rapier_mission_phase_name",
  "rapier_target_altitude_ft", "fuel_lb", "range_m", "closure_kts", "governor_level",
];

function csvEscape(value) {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function trackToCsv(track) {
  return `${[
    CSV_COLUMNS.join(","),
    ...track.map((point) => CSV_COLUMNS.map((column) => csvEscape(point[column])).join(",")),
  ].join("\n")}\n`;
}
