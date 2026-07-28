import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";

import { main as cliMain } from "../rapier_reconstruct_cli.mjs";
import {
  FULL_RAM_MACH,
  RAM_LIGHT_MACH,
  loadTelemetryInputs,
  reconstructRapierFlight,
  reconstructRapierFlightFromInputs,
  trackToCsv,
} from "../rapier_reconstruct.mjs";
import {
  TelemetryStateEncoder,
  TELEMETRY_STATE_ENCODING,
} from "../../../web/wwwroot/render/telemetry/state_delta.js";

const SORTIE_ID = "sortie-test-001";
const SESSION_T0 = 1_700_000_000_000;

function header(batchId = "batch-001", session = "web-test-session") {
  return {
    k: "hdr",
    schema_version: "2.0.0",
    state_encoding: TELEMETRY_STATE_ENCODING,
    keyframe_interval_samples: 4,
    session,
    build: "47",
    batch_id: batchId,
    t0: SESSION_T0,
  };
}

function baseState(overrides = {}) {
  return {
    t: 0,
    telemetry_sortie_id: SORTIE_ID,
    px: 0,
    py: 100,
    pz: 0,
    heading_deg: 90,
    pitch_deg: 5,
    bank_deg: 0,
    aoa_deg: 2,
    mach: 0.4,
    indicated_airspeed_kts: 180,
    true_airspeed_kts: 185,
    ground_speed_kts: 175,
    alt_ft: 500,
    radar_alt_ft: 500,
    vertical_speed_fpm: 0,
    g_actual: 1,
    requested_g_cmd: 1,
    throttle: 0.8,
    rapier_mission_phase: 1,
    rapier_mission_phase_name: "LAUNCH",
    rapier_target_altitude_ft: 56_000,
    fuel_lb: 10_000,
    fuel_joker: false,
    fuel_bingo: false,
    gear_nose: 1,
    gear_left: 1,
    gear_right: 1,
    catapult_active: true,
    engagement_number: 0,
    rounds_fired: 0,
    bandit_alive: true,
    pilot_control_interlocked: false,
    ...overrides,
  };
}

function encodeSortie(states, { timeStepMs = 50, batchId = "batch-001" } = {}) {
  const encoder = new TelemetryStateEncoder({ keyframeIntervalSamples: 4 });
  const rows = [
    header(batchId),
    { k: "in", type: "lifecycle", code: "sortie_started", sortie: SORTIE_ID, t: 900 },
  ];
  for (const [index, state] of states.entries()) {
    rows.push(encoder.encode({
      state,
      time: 1000 + index * timeStepMs,
      build: "47",
      held: index === 1 ? ["ArrowDown"] : [],
    }));
  }
  return rows;
}

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), "guns-rapier-reconstruct-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function writeJsonl(directory, name, rows) {
  const path = join(directory, name);
  await writeFile(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  return path;
}

test("decodes keyframes and deltas into a compact track", () => {
  const rows = encodeSortie(Array.from({ length: 5 }, (_, index) => baseState({
    t: index * 0.05,
    mach: 0.5 + index * 0.1,
    px: index * 10,
  })));
  const reconstruction = reconstructRapierFlight({ rows, sortieId: SORTIE_ID });

  assert.equal(reconstruction.coverage.decoded_samples, 5);
  assert.equal(reconstruction.track[2].mach, 0.7);
  assert.equal(reconstruction.track[4].px, 40);
  assert.equal(reconstruction.summary.control_seconds_observed.pull, 0.05);
});

test("hashes immutable source bytes and accepts gzip input", async (t) => {
  const directory = await temporaryDirectory(t);
  const rows = encodeSortie([
    baseState({ mach: 1 }),
    baseState({ mach: 1.1, t: 0.05 }),
  ]);
  const body = `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
  const compressed = gzipSync(body);
  const path = join(directory, "chunk.jsonl.gz");
  await writeFile(path, compressed);

  const sources = await loadTelemetryInputs([path]);
  assert.equal(
    sources[0].sha256,
    createHash("sha256").update(compressed).digest("hex"),
  );
  assert.equal(sources[0].rows.length, rows.length);
});

test("uses session epoch plus row elapsed time for video alignment", () => {
  const rows = encodeSortie([
    baseState({ t: 0 }),
    baseState({ t: 0.05, mach: 0.6 }),
    baseState({ t: 0.10, mach: 0.7 }),
    baseState({ t: 0.15, mach: 0.8 }),
  ]);
  rows.push({
    k: "perf",
    t: 1025,
    frame_ms_p95: 17.1,
    frame_ms_max: 18.2,
    frames_over_22ms: 0,
    governor_level: 2,
    scenery_suppressed: 1,
  });
  const reconstruction = reconstructRapierFlight({
    rows,
    sortieId: SORTIE_ID,
    videoStartEpochMs: SESSION_T0 + 1000,
    videoDurationS: 0.08,
  });

  assert.equal(reconstruction.track[0].wall_epoch_ms, SESSION_T0 + 1000);
  assert.equal(reconstruction.track[0].video_s, 0);
  assert.equal(reconstruction.track[1].video_s, 0.05);
  assert.equal(reconstruction.track.at(-1).video_s, undefined);
  assert.equal(reconstruction.coverage.video_window.samples_in_window, 2);
  assert.equal(reconstruction.video_summary.max_mach.value, 0.6);
  assert.equal(reconstruction.performance_summary.scope, "video_window");
  assert.equal(reconstruction.performance_summary.p95_frame_ms_max, 17.1);

  const clipped = reconstructRapierFlight({
    rows,
    sortieId: SORTIE_ID,
    videoStartEpochMs: SESSION_T0 + 1025,
    videoDurationS: 0.08,
  });
  assert.equal(clipped.coverage.covered_video_s, 0.05);
  assert.equal(clipped.coverage.intervals[0].first_video_s, 0.025);
});

test("projects pilot sync markers into the video-aligned event timeline", () => {
  const rows = encodeSortie([
    baseState({ t: 0 }),
    baseState({ t: 0.05 }),
  ]);
  rows.push({
    k: "in",
    t: 1025,
    sortie: SORTIE_ID,
    type: "flight-test-sync",
    code: "MARK-003",
    sample_key: "tick:120",
    held: [],
    wall_epoch_ms: SESSION_T0 + 1025,
  });

  const reconstruction = reconstructRapierFlight({
    rows,
    sortieId: SORTIE_ID,
    videoStartEpochMs: SESSION_T0 + 1000,
    videoDurationS: 2,
  });
  const marker = reconstruction.events.find(
    (event) => event.kind === "flight_test_sync",
  );

  assert.equal(marker.evidence.marker_id, "MARK-003");
  assert.equal(marker.evidence.sample_key, "tick:120");
  assert.equal(marker.video_s, 0.025);
});

test("derives recording start from a visible sync marker", () => {
  const rows = encodeSortie([
    baseState({ t: 0 }),
    baseState({ t: 0.05 }),
  ]);
  rows.push({
    k: "in",
    t: 1250,
    sortie: SORTIE_ID,
    type: "flight-test-sync",
    code: "MARK-004",
    sample_key: "tick:150",
    wall_epoch_ms: SESSION_T0 + 1250,
  });

  const reconstruction = reconstructRapierFlight({
    rows,
    sortieId: SORTIE_ID,
    videoSyncMarker: "MARK-004",
    videoSyncSeconds: 5,
    videoDurationS: 10,
  });
  const marker = reconstruction.events.find(
    (event) => event.kind === "flight_test_sync",
  );

  assert.equal(reconstruction.coverage.video_window.alignment,
    "flight_test_sync_marker");
  assert.equal(reconstruction.coverage.video_window.start_epoch_ms,
    SESSION_T0 - 3750);
  assert.equal(reconstruction.coverage.video_window.sync_marker_id, "MARK-004");
  assert.equal(marker.video_s, 5);
  assert.equal(reconstruction.track[0].video_s, 4.75);
});

test("sync alignment rejects ambiguous or incomplete options", () => {
  const rows = encodeSortie([baseState()]);
  assert.throws(() => reconstructRapierFlight({
    rows,
    videoSyncMarker: "MARK-001",
  }), /must be supplied together/);
  assert.throws(() => reconstructRapierFlight({
    rows,
    videoStartEpochMs: SESSION_T0,
    videoSyncMarker: "MARK-001",
    videoSyncSeconds: 0,
  }), /choose either/);
});

test("merges out-of-order chunks, suppresses duplicates, and records coverage gaps", async (t) => {
  const directory = await temporaryDirectory(t);
  const encoder = new TelemetryStateEncoder({ keyframeIntervalSamples: 4 });
  const encoded = Array.from({ length: 8 }, (_, index) => encoder.encode({
    state: baseState({ t: index * 0.05, px: index }),
    time: 1000 + index * 50,
    build: "47",
  }));
  const pathA = await writeJsonl(directory, "a.jsonl", [header("a"), ...encoded.slice(0, 4)]);
  const pathB = await writeJsonl(
    directory,
    "b.jsonl",
    [header("b"), ...encoded.slice(4), encoded[3]],
  );
  const reconstruction = await reconstructRapierFlightFromInputs({
    inputPaths: [pathB, pathA],
    sortieId: SORTIE_ID,
  });

  assert.equal(reconstruction.coverage.decoded_samples, 8);
  assert.ok(reconstruction.coverage.duplicate_rows_suppressed >= 1);

  const gapped = reconstructRapierFlight({
    rows: [
      header("gap"),
      { k: "st", q: 0, t: 1000, s: baseState({ t: 0, mach: 1.9 }) },
      { k: "st", q: 4, t: 1200, s: baseState({ t: 0.2, px: 4, mach: 2.1 }) },
    ],
    sortieId: SORTIE_ID,
    videoStartEpochMs: SESSION_T0 + 1000,
    videoDurationS: 1,
  });
  assert.equal(gapped.coverage.intervals.length, 2);
  assert.ok(gapped.gaps.some((gap) => gap.kind === "q_gap"));
  assert.ok(gapped.events.some((event) => event.kind === "ram_light_bracketed_by_gap"
    && event.evidence.exact_crossing_observed === false));
  assert.equal(gapped.summary.phase_dwell_s_observed.LAUNCH, undefined);
});

test("rejects inputs from multiple sessions", async (t) => {
  const directory = await temporaryDirectory(t);
  const pathA = await writeJsonl(directory, "a.jsonl", [
    header("a", "session-a"),
    { k: "st", q: 0, t: 1000, s: baseState() },
  ]);
  const pathB = await writeJsonl(directory, "b.jsonl", [
    header("b", "session-b"),
    { k: "st", q: 1, t: 1050, s: baseState({ t: 0.05 }) },
  ]);
  await assert.rejects(
    reconstructRapierFlightFromInputs({ inputPaths: [pathA, pathB] }),
    /multiple telemetry sessions/,
  );
});

test("keeps numeric mission phase canonical when cold phase text lags", () => {
  const rows = encodeSortie([
    baseState({
      t: 0,
      rapier_mission_phase: 2,
      rapier_mission_phase_name: "CLIMB",
    }),
    baseState({
      t: 0.05,
      rapier_mission_phase: 3,
      rapier_mission_phase_name: "CLIMB",
      rapier_phase_reason: "climb_to_fl560",
    }),
  ]);
  const reconstruction = reconstructRapierFlight({ rows, sortieId: SORTIE_ID });
  const event = reconstruction.events.find((candidate) => candidate.kind === "rapier_mission_phase");

  assert.equal(reconstruction.track[1].rapier_mission_phase_label, "ACCELERATE");
  assert.equal(reconstruction.track[1].rapier_phase_label_matches, false);
  assert.equal(event.evidence.to_label, "ACCELERATE");
  assert.equal(event.evidence.observed_cold_name, "CLIMB");
  assert.equal(event.evidence.cold_label_matches, false);
});

test("derives RAM crossings, extrema, takeoff, interlocks, and landing from numeric fields", () => {
  const rows = encodeSortie([
    baseState({
      t: 0,
      mach: 1.9,
      radar_alt_ft: 20,
      rapier_mission_phase: 3,
      rapier_mission_phase_name: "ACCELERATE",
    }),
    baseState({
      t: 0.05,
      mach: 2.05,
      radar_alt_ft: 120,
      gear_nose: 0.8,
      pilot_control_interlocked: true,
      rapier_mission_phase: 3,
      rapier_mission_phase_name: "ACCELERATE",
    }),
    baseState({
      t: 0.10,
      mach: 2.75,
      radar_alt_ft: 500,
      gear_nose: 0,
      pilot_control_interlocked: true,
      rapier_mission_phase: 4,
      rapier_mission_phase_name: "RAMCLIMB",
    }),
    baseState({
      t: 0.15,
      mach: 2.85,
      radar_alt_ft: 10,
      gear_nose: 1,
      arrest_time_s: 1.2,
      arrest_speed_kts: 120,
      finished: true,
      recovery: "WIRE_3",
      rapier_mission_phase: 14,
      rapier_mission_phase_name: "COMPLETE",
    }),
  ]);
  const reconstruction = reconstructRapierFlight({ rows, sortieId: SORTIE_ID });

  assert.ok(reconstruction.events.some((event) => event.kind === "ram_light_crossing"
    && event.evidence.threshold === RAM_LIGHT_MACH));
  assert.ok(reconstruction.events.some((event) => event.kind === "full_ram_crossing"
    && event.evidence.threshold === FULL_RAM_MACH));
  assert.ok(reconstruction.events.some((event) => event.kind === "weight_off_wheels"));
  assert.ok(reconstruction.events.some((event) => event.kind === "pilot_interlock"));
  assert.ok(reconstruction.events.some((event) => event.kind === "landing"));
  assert.equal(reconstruction.summary.max_mach.value, 2.85);
});

test("filters sorties and fails closed on an orphan delta", () => {
  const encoder = new TelemetryStateEncoder({ keyframeIntervalSamples: 4 });
  const rows = [
    header(),
    encoder.encode({ state: baseState({ mach: 1.5 }), time: 1000, build: "47" }),
    encoder.encode({
      state: { ...baseState({ mach: 2.5 }), telemetry_sortie_id: "sortie-other" },
      time: 1050,
      build: "47",
    }),
  ];
  const reconstruction = reconstructRapierFlight({ rows, sortieId: SORTIE_ID });
  assert.equal(reconstruction.coverage.decoded_samples, 1);
  assert.equal(reconstruction.track[0].mach, 1.5);

  const orphan = reconstructRapierFlight({
    rows: [header(), { k: "st", q: 1, t: 1000, d: { mach: 9.9 } }],
  });
  assert.equal(orphan.coverage.decoded_samples, 0);
  assert.ok(orphan.gaps.some((gap) => gap.kind === "decode"));
});

test("exports CSV and CLI writes JSON plus optional CSV", async (t) => {
  const directory = await temporaryDirectory(t);
  const inputPath = await writeJsonl(directory, "chunk.jsonl", encodeSortie([
    baseState({ mach: 1 }),
    baseState({ mach: 1.1, t: 0.05 }),
  ]));
  const outputPath = join(directory, "out.json");
  const csvPath = join(directory, "track.csv");
  const logs = [];
  const errors = [];
  await cliMain([
    "--input", inputPath,
    "--output", outputPath,
    "--csv", csvPath,
    "--sortie-id", SORTIE_ID,
    "--video-start-epoch-ms", String(SESSION_T0 + 1000),
    "--video-duration-s", "60.5",
  ], {
    log: (value) => logs.push(String(value)),
    error: (value) => errors.push(String(value)),
  });

  assert.equal(JSON.parse(logs.at(-1)).status, "reconstructed");
  const written = JSON.parse(await readFile(outputPath, "utf8"));
  const csv = await readFile(csvPath, "utf8");
  assert.equal(written.track.length, 2);
  assert.equal(trackToCsv(written.track), csv);
  assert.match(csv, /^q,session_ms,sim_s/);
  assert.match(errors.join("\n"), /local immutable files/);
});

test("CLI help rejects browser downloads and network URLs", async (t) => {
  const directory = await temporaryDirectory(t);
  const output = [];
  await cliMain(["--help"], {
    log: (value) => output.push(String(value)),
    error: () => {},
  });
  assert.match(output.join("\n"), /Never download telemetry through the Vercel dashboard/);
  await assert.rejects(
    cliMain([
      "--input", "https://example.com/chunk.jsonl.gz",
      "--output", join(directory, "out.json"),
    ], { log: () => {}, error: () => {} }),
    /network URLs are not accepted/,
  );
});
