import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { gunzipSync } from "node:zlib";
import { buildReportPayload, createReportHistory, frameTimeStats, REPORT_KEY, REPORT_MAX_ROWS } from "../report_payload.js";
import { captureReportFrame, encodeReportUpload } from "../report_capture.js";
import { TelemetryStateDecoder } from "../../telemetry/state_delta.js";
import { CONTROL_BINDINGS, rebindControl, normalisePlayerSettings } from "../../settings/player_settings.js";

const fixture = (extra = {}) => ({ id: "bde2f463-1d17-4adb-95d1-4ba69ce55153", created: "2026-10-15T12:00:00.000Z",
  now: 150_000, build: "381", revision: "abcdef", url: "https://guns-only.com/?mission=test",
  program: "rapier", mission: "test", beat: 4,
  state: { tick: 60, t: .5, difficulty_rung: 4, weather_seed_hex: "12345678", nested: { all: [1, 2, 3] } },
  settings: { audio: false, bindings: { fire: "KeyF" } }, device: { gpu: "Test GPU" }, camera: { position: [1, 2, 3] }, ...extra });

test("pure report schema includes a full independent keyframe, provenance and all settings", () => {
  const input = fixture();
  const result = buildReportPayload(input);
  assert.deepEqual(result.state.s, input.state);
  assert.equal(result.state.k, "st");
  assert.equal(result.state.build, "381");
  assert.equal(result.revision, "abcdef");
  assert.equal(result.difficulty, 4);
  assert.deepEqual(result.seeds, { weather_seed_hex: "12345678" });
  assert.deepEqual(result.settings, input.settings);
  input.state.nested.all.push(4);
  assert.deepEqual(result.state.s.nested.all, [1, 2, 3]);
  assert.deepEqual(new TelemetryStateDecoder().decode(result.state), result.state.s);
});

test("report caps note, console, rows and UTF-8 bytes while preserving the complete current state", () => {
  const result = buildReportPayload(fixture({ maxBytes: 18_000, note: "x".repeat(3000),
    rows: Array.from({ length: REPORT_MAX_ROWS + 10 }, (_, i) => ({ k: "in", t: 100_000 + i, code: "KeyF", detail: "飛".repeat(300) })),
    warnings: Array.from({ length: 70 }, (_, i) => ({ level: "warn", message: String(i) + "x".repeat(50) })) }));
  assert.equal(result.note.length, 2000);
  assert.equal(result.console.length, 50);
  assert.ok(result.console[0].message.startsWith("20"));
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 18_000);
  assert.ok(result.historyDroppedRows > 0);
  assert.deepEqual(result.state.s, fixture().state);
  assert.equal(result.inputs.at(-1).t, 106009);
});

test("oversized full state or settings reject rather than silently losing fields", () => {
  assert.throws(() => buildReportPayload(fixture({ maxBytes: 1000, state: { vital: "x".repeat(1500) } })), RangeError);
  assert.throws(() => buildReportPayload(fixture({ maxBytes: 1000, settings: { vital: "x".repeat(1500) } })), RangeError);
});

test("120-second local history survives upload-independent reads and retains a decodable boundary", () => {
  const history = createReportHistory();
  for (let i = 0; i <= 3000; i++) {
    history.sample({ tick: i * 6, t: i / 20, fixed: "unchanged".repeat(100), moving: i }, i * 50, "381", []);
    if (i % 100 === 0) history.add({ k: "in", t: i * 50, code: "KeyF", type: "down" });
  }
  const rows = history.snapshot(150_000);
  assert.equal(rows[0].t, 30_000);
  assert.deepEqual(rows, history.snapshot(150_000));
  const decoder = new TelemetryStateDecoder();
  for (const row of rows.filter(row => row.k === "st")) decoder.decode(row);
  assert.equal(decoder.state.moving, 3000);
  const report = buildReportPayload(fixture({ rows, maxBytes: 20_000 }));
  const clipped = new TelemetryStateDecoder();
  for (const row of report.telemetry.filter(row => row.k === "st")) clipped.decode(row);
  assert.equal(clipped.state.moving, 3000);
  assert.ok(report.historyDroppedRows > 0);
});

test("frame times exclude non-finite samples and include percentiles", () => {
  assert.deepEqual(frameTimeStats([10, 20, 30, NaN, -1]), { count: 3, meanMs: 20, p50Ms: 20, p95Ms: 20, p99Ms: 20, maxMs: 30 });
});

test("Report key is unbound, reserved from rebinding, and appears in settings and HUD", async () => {
  assert.equal(REPORT_KEY, "F8");
  assert.ok(CONTROL_BINDINGS.every(binding => binding.defaultCode !== REPORT_KEY));
  assert.equal(rebindControl(normalisePlayerSettings(), "fire", REPORT_KEY), null);
  assert.notEqual(normalisePlayerSettings({ bindings: { fire: REPORT_KEY } }).bindings.fire, REPORT_KEY);
  const source = await readFile(new URL("../../../app.js", import.meta.url), "utf8");
  const hud = await readFile(new URL("../../../hud.js", import.meta.url), "utf8");
  assert.match(source, /Report<\/th><td><kbd>F8/);
  assert.match(hud, /F8  REPORT/);
  assert.doesNotMatch(source, /event.code === "F8"/); // handled only by the report controller
  assert.match(source, /event.code === "Backquote"[\s\S]*?emitFlightTestSyncMarker/);
});

test("capture freezes scene then HUD synchronously, with bounded JPEG downscaling", async () => {
  const operations = [];
  const surfaces = [];
  const makeCanvas = () => {
    const index = surfaces.length;
    const context = { drawImage: (source, ...bounds) => operations.push({ source, bounds, alpha: context.globalAlpha ?? 1 }) };
    const surface = { width: 0, height: 0, getContext: () => context,
      toBlob(callback, type, quality) {
        assert.equal(type, "image/jpeg"); assert.equal(quality, .85);
        queueMicrotask(() => callback(new Blob([new Uint8Array(index === 0 ? 2000 : 500)], { type })));
      } };
    surfaces.push(surface);
    return surface;
  };
  const scene = { width: 2000, height: 1000 }, hud = { width: 4000, height: 2000 };
  const promise = captureReportFrame(scene, hud, { makeCanvas, maximumBytes: 1000, hudOpacity: .84 });
  assert.equal(operations[0].source, scene);
  assert.equal(operations[1].source, hud);
  assert.equal(operations[1].alpha, .84);
  assert.deepEqual(operations[1].bounds, [0, 0, 2000, 1000]);
  assert.equal((await promise).size, 500);
  assert.ok(surfaces[1].width < surfaces[0].width);
  assert.equal(operations[2].source, surfaces[0]);
});

test("upload envelope contains gzip JSON and bounded JPEG", async () => {
  const report = buildReportPayload(fixture());
  const jpeg = new Blob([new Uint8Array([255, 216, 255, 217])], { type: "image/jpeg" });
  const encoded = JSON.parse(await encodeReportUpload(report, jpeg));
  assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(encoded.reportGzip, "base64"))), report);
  assert.deepEqual(Buffer.from(encoded.jpeg, "base64"), Buffer.from([255, 216, 255, 217]));
});

test("early console ring caps 50 entries, bounds text and preserves original logging", async () => {
  const source = await readFile(new URL("../console_ring.js", import.meta.url), "utf8");
  const calls = [];
  const context = { console: { warn: (...args) => calls.push(args), error() {} },
    window: { addEventListener() {} }, performance: { now: () => 42 } };
  runInNewContext(source, context);
  for (let i = 0; i < 70; i++) context.console.warn(i, "x".repeat(5000));
  assert.equal(calls.length, 70);
  const rows = context.__gunsReportConsole();
  assert.equal(rows.length, 50);
  assert.ok(rows[0].message.startsWith("20 "));
  assert.ok(rows.every(row => row.message.length <= 2048));
});

test("compressed-size fallback keeps the newest tail decodable and reports loss", async () => {
  const history = createReportHistory();
  let seed = 1234;
  const noise = () => Array.from({ length: 100 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed.toString(36);
  }).join("");
  for (let i = 0; i < 100; i++)
    history.sample({ tick: i * 6, fixed: "same".repeat(100), noise: noise() }, 145000 + i * 50, "381", []);
  const report = buildReportPayload(fixture({ rows: history.snapshot(150000) }));
  const envelope = JSON.parse(await encodeReportUpload(report, new Blob([new Uint8Array([255, 216])]), 4000));
  const zipped = Buffer.from(envelope.reportGzip, "base64");
  assert.ok(zipped.length <= 4000);
  const decoded = JSON.parse(gunzipSync(zipped));
  assert.ok(decoded.historyDroppedRows > 0);
  assert.deepEqual(decoded.state, report.state);
  const decoder = new TelemetryStateDecoder();
  for (const row of decoded.telemetry) if (row.k === "st") decoder.decode(row);
  assert.equal(decoder.state.tick, 99 * 6);
});
