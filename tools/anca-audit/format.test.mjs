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
  assert.match(views[0].view.rows[0].line, /GEAR/);

  const airborne = views.find((entry) => entry.record.sample === "t+2s");
  assert.ok(airborne, "t+2s sample present");
  assert.equal(airborne.view.rows[2].tone, "active");
  assert.match(airborne.view.rows[2].line, /cleared for launch/i);
  assert.match(airborne.view.rows[3].line, /LAUNCH/);

  const climb = views.find((entry) => entry.record.sample === "t+30s");
  assert.ok(climb, "t+30s sample present");
  assert.match(climb.view.rows[0].line, /GEAR UP/);
  assert.match(climb.view.rows[2].line, /PACKAGE|UHF/);
  assert.match(climb.view.rows[3].line, /LAUNCH 4\/4/);
});
