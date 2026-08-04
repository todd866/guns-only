import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  SHELL_HEALTH_SCHEMA,
  classifyShellDevice,
  classifyShellFatal,
  createShellHealthBeacon,
} from "../shell_health.js";

test("classifies Threads iPhone as ios phone-portrait with threads arrival", () => {
  const device = classifyShellDevice(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Threads",
    { width: 390, height: 844 },
  );
  assert.equal(device.platform, "ios");
  assert.equal(device.arrival, "threads");
  assert.equal(device.browser, "in-app");
  assert.equal(device.viewport_bucket, "phone-portrait");
  assert.ok(device.ua_family.includes("Threads") || device.ua_family.includes("Mobile"));
});

test("classifies Android Chrome landscape", () => {
  const device = classifyShellDevice(
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
    { width: 844, height: 390 },
  );
  assert.equal(device.platform, "android");
  assert.equal(device.arrival, "chrome");
  assert.equal(device.viewport_bucket, "phone-landscape");
});

test("fatal classifier maps WebGL and bridge failures", () => {
  assert.equal(classifyShellFatal(new Error("Could not create WebGL context")).reason, "webgl");
  assert.equal(classifyShellFatal(new Error("getDotnetRuntime timed out")).reason, "bridge");
  assert.equal(classifyShellFatal(new Error("Failed to fetch dynamically imported module")).reason, "module");
  assert.equal(classifyShellFatal(new Error("Array buffer allocation failed")).reason, "oom");
  assert.equal(classifyShellFatal(new Error("something else")).reason, "unknown");
  assert.ok(classifyShellFatal(new Error("x".repeat(400))).message.length <= 160);
});

test("beacon posts shell-health rows on milestone and fatal without opt-in gate", async () => {
  const posts = [];
  const beacon = createShellHealthBeacon({
    build: "261",
    revision: "abc",
    userAgent: "Mozilla/5.0 (iPhone) Threads",
    viewport: () => ({ width: 390, height: 844 }),
    now: () => 12.5,
    epochMs: () => 1_700_000_000_000,
    fetchImpl: async (url, init) => {
      posts.push({ url, body: JSON.parse(init.body), keepalive: init.keepalive === true });
      return { ok: true, status: 204 };
    },
  });

  assert.equal(beacon.schema, SHELL_HEALTH_SCHEMA);
  assert.match(beacon.session, /^shell-\d+-\d+$/);
  assert.equal(beacon.mark("script_load"), true);
  assert.equal(beacon.mark("script_load"), false);
  assert.equal(beacon.mark("bridge_ready"), true);
  assert.equal(beacon.mark("webgl_ok"), true);
  await beacon.flush();
  assert.ok(posts.length >= 1);
  const latest = posts.at(-1).body;
  assert.equal(latest.session, beacon.session);
  assert.equal(latest.rows[0].k, "hdr");
  assert.equal(latest.rows[0].schema_version, SHELL_HEALTH_SCHEMA);
  assert.equal(latest.rows[0].channel, "shell-health");
  assert.equal(latest.rows[0].platform, "ios");
  assert.ok(latest.rows.some((row) => row.milestone === "script_load"));
  assert.ok(latest.rows.some((row) => row.milestone === "bridge_ready"));
  assert.ok(latest.rows.some((row) => row.milestone === "webgl_ok"));
  assert.equal(latest.rows.some((row) => row.code === "fatal"), false);

  beacon.fatal(new Error("WebGL context lost"));
  await beacon.flush({ force: true });
  const last = posts.at(-1).body;
  const fatal = last.rows.find((row) => row.code === "fatal");
  assert.equal(fatal.reason, "webgl");
  assert.match(fatal.message, /WebGL/i);
});

test("app wires shell health and keeps gameplay telemetry opt-in", async () => {
  const app = await readFile(new URL("../../../app.js", import.meta.url), "utf8");
  const index = await readFile(new URL("../../../index.html", import.meta.url), "utf8");
  assert.match(app, /shell_health\.js/);
  assert.match(app, /createShellHealthBeacon/);
  assert.match(app, /shellHealth\.mark\(["']script_load["']\)|mark\(["']script_load["']\)/);
  assert.match(app, /shellHealth\.fatal|shellHealth\?\.fatal/);
  assert.match(index, /shell-health|shell health|boot and fatal/i);
  assert.match(index, /Share detailed flight diagnostics/);
  assert.match(index, /Off by default/);
});
