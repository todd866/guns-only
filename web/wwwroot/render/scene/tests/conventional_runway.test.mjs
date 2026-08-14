import assert from "node:assert/strict";
import test from "node:test";

import {
  CONVENTIONAL_AIRBASE_VISUAL_PROFILE,
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

test("every long-range airbase mesh and point field follows the runway horizon bend", () => {
  const runway = createConventionalRunwayPresentation();
  updateConventionalRunwayPresentation(runway, runwayState());

  const curvedObjects = [];
  runway.group.traverse((object) => {
    if (!object.name.startsWith("AIRBASE_") || !object.material) return;
    curvedObjects.push(object);
    assert.equal(typeof object.material.onBeforeCompile, "function", object.name);
    const shader = { vertexShader: "before\n#include <project_vertex>\nafter" };
    object.material.onBeforeCompile(shader);
    assert.match(shader.vertexShader, /runwayRadialM - 12000\.0/, object.name);
    assert.match(shader.vertexShader, /\/ 12742000\.0/, object.name);
    assert.doesNotMatch(shader.vertexShader, /#include <project_vertex>/, object.name);
  });
  assert.ok(curvedObjects.length >= 30, "full airbase curvature coverage should stay broad");
  assert.ok(curvedObjects.some((object) => object.isPoints),
    "fixed-pixel light fields must share the curvature shader");
});

test("conventional strip never creates carrier recovery hardware", () => {
  const runway = createConventionalRunwayPresentation();
  const names = [];
  runway.group.traverse((object) => names.push(object.name));
  assert.equal(names.some((name) => /WIRE|TAILHOOK|ARREST|CARRIER/.test(name)), false);
});

test("conventional recovery field reads as a bounded airbase without changing runway authority", () => {
  const runway = createConventionalRunwayPresentation();
  updateConventionalRunwayPresentation(runway, runwayState());

  assert.equal(Object.isFrozen(CONVENTIONAL_AIRBASE_VISUAL_PROFILE), true);
  assert.equal(runway.surface.scale.x, 45);
  assert.equal(runway.surface.scale.z, 3_000);
  assert.ok(runway.parallelTaxiway.position.x > 45 * 0.5);
  assert.equal(runway.parallelTaxiway.scale.x,
    CONVENTIONAL_AIRBASE_VISUAL_PROFILE.taxiwayWidthM);
  assert.equal(runway.clearedVerge.scale.x,
    333);
  assert.equal(runway.taxiwayCentreline.material.color.getHex(), 0xd6b85f);
  assert.equal(runway.taxiwayConnectors.length,
    CONVENTIONAL_AIRBASE_VISUAL_PROFILE.connectorFractions.length);
  assert.ok(runway.apron.position.x > runway.parallelTaxiway.position.x);
  assert.equal(runway.hangars.length, 4);
  assert.equal(runway.apronStandLines.length, 4);
  assert.equal(runway.hangars.every((hangar) => !hangar.castShadow), true);
  assert.equal(runway.controlTower.castShadow, true);
  assert.ok(runway.controlTowerCab.position.y > 8);

  assert.equal(runway.edgeLights.geometry.drawRange.count, 82);
  assert.equal(runway.approachLights.geometry.drawRange.count,
    CONVENTIONAL_AIRBASE_VISUAL_PROFILE.approachLightCount);
  assert.equal(runway.thresholdLights.geometry.drawRange.count,
    CONVENTIONAL_AIRBASE_VISUAL_PROFILE.thresholdLightCount);
  assert.equal(runway.runwayEndLights.geometry.drawRange.count,
    CONVENTIONAL_AIRBASE_VISUAL_PROFILE.thresholdLightCount);
  assert.equal(runway.runwayEndLights.material.color.getHex(), 0xff665a);
  assert.equal(runway.towerBeacon.geometry.drawRange.count, 1);
  assert.equal(runway.edgeLights.material.depthTest, true);
  assert.equal(runway.edgeLights.material.depthWrite, false);
  assert.equal(runway.edgeLights.material.toneMapped, false);

  const names = [];
  let realLightCount = 0;
  runway.group.traverse((object) => {
    names.push(object.name);
    if (object.isLight) realLightCount += 1;
  });
  assert.ok(names.includes("AIRBASE_APPROACH_CROSSBAR_1"));
  assert.ok(names.includes("AIRBASE_HANGAR_4"));
  assert.ok(names.includes("AIRBASE_CONTROL_TOWER_CAB"));
  assert.equal(realLightCount, 0);
});

test("airbase layout follows wider strips and does not upload static lights every frame", () => {
  const runway = createConventionalRunwayPresentation();
  const wideState = runwayState({ runway_width_m: 70 });
  updateConventionalRunwayPresentation(runway, wideState);

  const vergeLeftM = runway.clearedVerge.position.x - runway.clearedVerge.scale.x * 0.5;
  const vergeRightM = runway.clearedVerge.position.x + runway.clearedVerge.scale.x * 0.5;
  const hangarRightM = runway.hangars[0].position.x + runway.hangars[0].scale.x * 0.5;
  assert.ok(vergeLeftM < -wideState.runway_width_m * 0.5);
  assert.ok(vergeRightM > hangarRightM);

  const edgeBufferVersion = runway.edgeLights.geometry.getAttribute("position").version;
  updateConventionalRunwayPresentation(runway, { ...wideState, t: 45 });
  assert.equal(runway.edgeLights.geometry.getAttribute("position").version, edgeBufferVersion);
});

test("short conventional strips keep the scored runway but omit the full airbase set dressing", () => {
  const runway = createConventionalRunwayPresentation();
  updateConventionalRunwayPresentation(runway, runwayState({ runway_length_m: 600 }));

  assert.equal(runway.group.visible, true);
  assert.equal(runway.surface.scale.z, 600);
  assert.equal(runway.airbaseDetails.every((object) => object.visible === false), true);
  assert.equal(runway.approachLights.visible, true);
  assert.equal(runway.thresholdLights.visible, true);
});
