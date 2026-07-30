#!/usr/bin/env node
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deriveAncaView } from "../../web/wwwroot/render/anca/anca_view_model.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "fixtures", "rapier-launch.sample.jsonl");

test("fixture samples drive deriveAncaView into real A/N/C/A rows", () => {
  const lines = readFileSync(fixturePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  assert.ok(lines.length >= 3, "fixture needs several samples");

  const views = lines.map((line) => {
    const record = JSON.parse(line);
    return { record, view: deriveAncaView(record.state) };
  });

  assert.equal(views[0].view.visible, true);
  assert.deepEqual(
    views[0].view.rows.map((row) => row.line),
    ["—", "—", "—", "—"],
    "routine launch configuration must not manufacture a priority",
  );

  const airborne = views.find((entry) => entry.record.sample === "t+2s");
  assert.ok(airborne, "t+2s sample present");
  assert.equal(airborne.view.rows[2].tone, "active");
  assert.equal(airborne.view.rows[2].line, "RAPIER TOWER · AUTO TX");
  assert.doesNotMatch(airborne.view.rows[2].line, /cleared for launch/i);
  assert.equal(
    airborne.view.rows[3].line,
    "LAUNCH · VERIFY 1/4 → AIRBORNE",
  );

  const climb = views.find((entry) => entry.record.sample === "t+30s");
  assert.ok(climb, "t+30s sample present");
  assert.deepEqual(
    climb.view.rows.map((row) => row.line),
    ["—", "—", "—", "—"],
    "completed checks and stale radio state must clear instead of lingering",
  );
});
