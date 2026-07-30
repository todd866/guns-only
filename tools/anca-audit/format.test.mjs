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
    views[0].view.rows.map((row) => row.tone),
    ["steady", "quiet", "steady", "quiet"],
    "routine launch configuration carries steady context but must not manufacture a priority",
  );

  // The wire subset has to resolve a mission kind, or deriveAncaView falls through to "other"
  // and reports an empty panel for every scenario -- an audit that cannot fail.
  assert.ok(
    views.every((entry) => entry.record.state.rapier_mission_available === true),
    "Rapier scenarios must expose the mission-kind discriminator",
  );
  assert.equal(views[0].view.rows[2].line, "CONTROL · DEPARTING");

  const airborne = views.find((entry) => entry.record.sample === "t+2s");
  assert.ok(airborne, "t+2s sample present");
  assert.equal(airborne.view.rows[2].tone, "steady");
  assert.equal(airborne.view.rows[2].line, "CONTROL · DEPARTING");
  assert.equal(
    airborne.view.rows[3].line,
    "LAUNCH · VERIFY 1/4 → AIRBORNE",
  );

  // A live transmission is background traffic, not a priority: it neither promotes the
  // Communicate row nor leaks its script into the panel.
  const transmitting = views.find((entry) => entry.record.state.radio_active === true);
  assert.ok(transmitting, "a sample transmits");
  assert.equal(transmitting.view.rows[2].tone, "steady");
  assert.doesNotMatch(transmitting.view.rows[2].line, /AUTO TX/);
  for (const entry of views) {
    const spoken = String(entry.record.state.radio_text ?? "");
    for (const row of entry.view.rows) {
      if (spoken.length > 0) assert.notEqual(row.line, spoken);
      assert.doesNotMatch(row.line, /Ghost One One|cleared for launch/i);
    }
  }

  const climb = views.find((entry) => entry.record.sample === "t+30s");
  assert.ok(climb, "t+30s sample present");
  assert.equal(
    climb.view.rows[3].line,
    "—",
    "completed checks and stale radio state must clear instead of lingering",
  );
  assert.ok(
    climb.view.rows.every((row) => row.tone !== "active"),
    "a settled climb holds no priority",
  );
});
