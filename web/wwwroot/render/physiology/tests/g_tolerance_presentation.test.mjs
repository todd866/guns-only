import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { gTolerancePresentation } from "../g_tolerance_presentation.js";

test("normal physiology is completely absent from the presentation", () => {
  assert.deepEqual(gTolerancePresentation({
    pilot_state: "NORMAL",
    pilot_peripheral_vision_01: 1,
    pilot_central_vision_01: 1,
    pilot_control_authority_01: 1,
    pilot_cognitive_capacity_01: 1,
  }), {
    active: false,
    stage: "NORMAL",
    vignetteOpacity: 0,
    blackoutOpacity: 0,
    redoutOpacity: 0,
    controlAuthority: 1,
    cognitiveCapacity: 1,
    cue: null,
  });
});

test("gray-out progressively narrows the visual field and teaches the unload", () => {
  const view = gTolerancePresentation({
    pilot_state: "GRAYOUT",
    pilot_peripheral_vision_01: 0.42,
    pilot_central_vision_01: 0.91,
    pilot_control_authority_01: 0.98,
    pilot_cognitive_capacity_01: 0.77,
  });

  assert.equal(view.active, true);
  assert.equal(view.vignetteOpacity, 0.5800000000000001);
  assert.ok(Math.abs(view.blackoutOpacity - 0.09) < 1e-12);
  assert.deepEqual(view.cue, {
    text: "VISION NARROWING · UNLOAD",
    level: "warning",
  });
});

test("G-LOC blacks the view without leaking an impossible visual diagnostic", () => {
  const view = gTolerancePresentation({
    pilot_state: "G-LOC",
    pilot_peripheral_vision_01: 0,
    pilot_central_vision_01: 0.4,
    pilot_control_authority_01: 0,
    pilot_cognitive_capacity_01: 0,
  });

  assert.equal(view.stage, "G_LOC");
  assert.equal(view.blackoutOpacity, 1);
  assert.equal(view.controlAuthority, 0);
  assert.equal(view.cue, null);
});

test("negative G uses a distinct red-out channel", () => {
  const view = gTolerancePresentation({
    pilot_state: "REDOUT",
    pilot_peripheral_vision_01: 0.7,
    pilot_central_vision_01: 0.95,
    pilot_redout_01: 0.52,
  });

  assert.equal(view.redoutOpacity, 0.52);
  assert.equal(view.cue.text, "RED-OUT · UNLOAD");
});

test("post-G-LOC recovery remains visible while cognition and control return", () => {
  const view = gTolerancePresentation({
    pilot_state: "RECOVERING",
    pilot_peripheral_vision_01: 1,
    pilot_central_vision_01: 1,
    pilot_control_authority_01: 0.63,
    pilot_cognitive_capacity_01: 0.44,
  });

  assert.equal(view.active, true);
  assert.equal(view.vignetteOpacity, 0);
  assert.equal(view.cue.text, "RECOVERING · FLY ATTITUDE");
});

test("invalid bridge values fail safe without manufacturing impairment", () => {
  const view = gTolerancePresentation({
    pilot_state: "unknown",
    pilot_peripheral_vision_01: Number.NaN,
    pilot_central_vision_01: Infinity,
    pilot_control_authority_01: -7,
    pilot_redout_01: 9,
  });

  assert.equal(view.stage, "NORMAL");
  assert.equal(view.vignetteOpacity, 0);
  assert.equal(view.blackoutOpacity, 0);
  assert.equal(view.controlAuthority, 0);
  assert.equal(view.redoutOpacity, 1);
  assert.equal(view.active, true);
});

test("production app renders authoritative physiology through a normally hidden layer", async () => {
  const app = await readFile(new URL("../../../app.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../../../index.html", import.meta.url), "utf8");

  assert.match(app, /import \{ gTolerancePresentation \} from "\.\/render\/physiology\/g_tolerance_presentation\.js";/);
  assert.match(app, /renderPilotPhysiology\(presentedState\)/);
  assert.doesNotMatch(app, /g_actual\s*[><=].*(BLACKOUT|G_LOC)/);
  assert.match(html, /id="pilot-physiology" aria-hidden="true" hidden/);
  assert.match(html, /#pilot-physiology\[hidden\] \{ display: none; \}/);
  assert.match(html, /#pilot-physiology\s*\{[\s\S]*?z-index:\s*15;/,
    "physiological occlusion must sit above in-world touch and test-flight UI");
  assert.match(html, /\.run-paused #pilot-physiology \{ display: none !important; \}/,
    "paused meta controls remain deliberately outside the simulated visual channel");
});
