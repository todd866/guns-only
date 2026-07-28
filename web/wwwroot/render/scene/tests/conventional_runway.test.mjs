import assert from "node:assert/strict";
import test from "node:test";

import {
  createConventionalRunwayPresentation,
  updateConventionalRunwayPresentation,
} from "../scene_builders.js";

function runwayState(overrides = {}) {
  return {
    runway_available: true,
    runway_threshold_x: -55_000,
    runway_threshold_y: 52.5,
    runway_threshold_z: -55_300,
    runway_heading_deg: 0,
    runway_length_m: 3_000,
    runway_width_m: 45,
    runway_touchdown_x: -55_000,
    runway_touchdown_y: 52.5,
    runway_touchdown_z: -55_000,
    ...overrides,
  };
}

test("conventional runway remains hidden until an authoritative finite strip is available", () => {
  const runway = createConventionalRunwayPresentation();
  assert.equal(runway.group.visible, false);

  updateConventionalRunwayPresentation(runway, runwayState({ runway_available: false }));
  assert.equal(runway.group.visible, false);

  updateConventionalRunwayPresentation(runway, runwayState({ runway_length_m: null }));
  assert.equal(runway.group.visible, false);

  updateConventionalRunwayPresentation(runway, runwayState({ runway_threshold_x: null }));
  assert.equal(runway.group.visible, false);
});

test("conventional runway maps the simulation frame and dimensions into the mirrored scene", () => {
  const runway = createConventionalRunwayPresentation();
  updateConventionalRunwayPresentation(runway, runwayState());

  assert.equal(runway.group.visible, true);
  assert.deepEqual(runway.group.position.toArray(), [-55_000, 52.555, 55_300]);
  assert.ok(Math.abs(runway.group.rotation.y - Math.PI) < 1e-12);
  assert.deepEqual(runway.surface.scale.toArray(), [45, 1, 3_000]);
  assert.equal(runway.surface.position.z, 1_500);
  assert.equal(runway.aimingBars[0].position.z, 300);
  assert.equal(runway.aimingBars[1].position.z, 300);
});

test("eastbound runway rotates local rollout forward toward renderer east", () => {
  const runway = createConventionalRunwayPresentation();
  updateConventionalRunwayPresentation(runway, runwayState({
    runway_heading_deg: 90,
    runway_touchdown_x: -54_700,
    runway_touchdown_z: -55_300,
  }));

  assert.ok(Math.abs(runway.group.rotation.y - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(runway.aimingBars[0].position.z - 300) < 1e-9);
});

test("runway follows terrain horizon curvature and keeps its shoulder above the atlas", () => {
  const runway = createConventionalRunwayPresentation();
  updateConventionalRunwayPresentation(runway, runwayState());

  const shader = {
    vertexShader: "before\n#include <project_vertex>\nafter",
  };
  runway.surface.material.onBeforeCompile(shader);
  assert.match(shader.vertexShader, /runwayRadialM - 12000\.0/);
  assert.match(shader.vertexShader, /\/ 12742000\.0/);
  assert.doesNotMatch(shader.vertexShader, /#include <project_vertex>/);

  const unitSlabHeightM = runway.visualShoulder.geometry.parameters.height;
  const shoulderTopM = runway.group.position.y
    + runway.visualShoulder.position.y
    + unitSlabHeightM * runway.visualShoulder.scale.y * 0.5;
  assert.ok(shoulderTopM > runwayState().runway_threshold_y);
  assert.ok(shoulderTopM < runwayState().runway_threshold_y + 0.02);
});

test("conventional strip never creates carrier recovery hardware", () => {
  const runway = createConventionalRunwayPresentation();
  const names = [];
  runway.group.traverse((object) => names.push(object.name));
  assert.equal(names.some((name) => /WIRE|TAILHOOK|ARREST|CARRIER/.test(name)), false);
});
