import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  UKRAINE_SOFT_WORLD_ATMOSPHERE_UNIFORM_NAMES,
} from "../../environment/soft_world_atmosphere.js";

import {
  CONVENTIONAL_AIRBASE_VISUAL_PROFILE,
  createConventionalRunwayPresentation,
  RUNWAY_LIGHT_OPACITY,
  runwayLightOpacity,
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

function atmosphereFixture() {
  return Object.fromEntries(UKRAINE_SOFT_WORLD_ATMOSPHERE_UNIFORM_NAMES
    .map((name) => [name, { value: name.includes("Color") ? new THREE.Color() : 0 }]));
}

function compiledShader(material) {
  const type = material.isPointsMaterial ? "points"
    : material.isMeshBasicMaterial ? "basic" : "standard";
  const shader = { ...THREE.ShaderLib[type], uniforms: {} };
  material.onBeforeCompile(shader);
  return shader;
}

test("all conventional runway surfaces and light fields share live terrain haze without double fog", () => {
  const runway = createConventionalRunwayPresentation();
  const atmosphere = atmosphereFixture();
  updateConventionalRunwayPresentation(runway, runwayState(), atmosphere);
  const materialTypes = new Set();
  runway.group.traverse((object) => {
    if (!object.material) return;
    const material = object.material;
    materialTypes.add(material.type);
    assert.equal(material.fog, false, object.name);
    assert.equal(material.toneMapped, true, `${object.name}: same haze output transform as terrain`);
    const shader = compiledShader(material);
    for (const name of UKRAINE_SOFT_WORLD_ATMOSPHERE_UNIFORM_NAMES) {
      assert.equal(shader.uniforms[name], atmosphere[name], `${object.name}: ${name}`);
    }
    assert.match(shader.vertexShader, /runwayRadialM - 12000\.0/, object.name);
    assert.match(shader.vertexShader, /vSoftWorldFogDistance = length\(mvPosition.xyz\)/);
    assert.match(shader.fragmentShader, /uFogDensity \* uAtmosphereDensityScale/);
    assert.match(shader.fragmentShader, /uWorldEdgeM \* 0.72/);
    assert.match(shader.fragmentShader, /outgoingLight = mix\(/);
    assert.match(material.customProgramCacheKey(), /terrain-curvature-v1\|ukraine-soft-world-fog-v1$/);
    const version = material.version;
    updateConventionalRunwayPresentation(runway, runwayState(), atmosphere);
    assert.equal(material.version, version, "steady frames do not recompile runway shaders");
    atmosphere.uFogDensity.value = 0.00007;
    assert.equal(shader.uniforms.uFogDensity.value, 0.00007, "weather remains live");
  });
  assert.deepEqual([...materialTypes].sort(),
    ["MeshBasicMaterial", "MeshStandardMaterial", "PointsMaterial"]);
});

test("runway fog follows replacement terrain and restores scene fog in terrain-free modes", () => {
  const runway = createConventionalRunwayPresentation();
  const materials = new Map();
  runway.group.traverse(({ material }) => {
    if (material) materials.set(material, {
      compile: material.onBeforeCompile, key: material.customProgramCacheKey(), fog: material.fog,
      toneMapped: material.toneMapped,
    });
  });
  const first = atmosphereFixture();
  const second = atmosphereFixture();
  updateConventionalRunwayPresentation(runway, runwayState(), first);
  updateConventionalRunwayPresentation(runway, runwayState(), second);
  for (const material of materials.keys()) {
    const shader = compiledShader(material);
    assert.equal(shader.uniforms.uFogColor, second.uFogColor);
    assert.notEqual(shader.uniforms.uFogColor, first.uFogColor);
    assert.equal(shader.fragmentShader.match(/float softWorldFogDensity =/g).length, 1);
  }
  updateConventionalRunwayPresentation(runway, runwayState());
  for (const [material, original] of materials) {
    assert.equal(material.onBeforeCompile, original.compile);
    assert.equal(material.customProgramCacheKey(), original.key);
    assert.equal(material.fog, original.fog);
    assert.equal(material.toneMapped, original.toneMapped);
    assert.equal(material.userData.ukraineSoftWorldFog, undefined);
    assert.doesNotMatch(compiledShader(material).fragmentShader, /softWorldFogDensity/);
  }
  updateConventionalRunwayPresentation(runway, runwayState(), second);
  assert.equal(compiledShader(runway.surface.material).uniforms.uFogColor, second.uFogColor);
  updateConventionalRunwayPresentation(runway, runwayState(), { uFogColor: second.uFogColor });
  assert.equal(runway.surface.material.fog, true, "incomplete atmosphere retains scene fog");
  assert.doesNotMatch(compiledShader(runway.surface.material).fragmentShader, /softWorldFogDensity/);
});

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

test("runway light sprites fade out at fight range and return for any recovery", () => {
  const nm = 1852;
  const at = (rangeNm, extra = {}) => runwayState({
    px: -55_000, pz: -55_300 - rangeNm * nm, ...extra,
  });
  assert.equal(runwayLightOpacity(at(3)), RUNWAY_LIGHT_OPACITY);
  assert.equal(runwayLightOpacity(at(6)), RUNWAY_LIGHT_OPACITY);
  const mid = runwayLightOpacity(at(8));
  assert.ok(mid > 0.3 && mid < 0.7, `8 NM is half-faded, got ${mid}`);
  assert.equal(runwayLightOpacity(at(13)), 0, "no lit cluster under the gunsight at fight range");
  assert.equal(runwayLightOpacity(at(13, { player_rtb_active: true })), RUNWAY_LIGHT_OPACITY);
  assert.equal(runwayLightOpacity(at(13, { approach_guidance_active: true })), RUNWAY_LIGHT_OPACITY);
  assert.equal(runwayLightOpacity(runwayState()), RUNWAY_LIGHT_OPACITY,
    "no ownship pose: never hide the field");

  const runway = createConventionalRunwayPresentation();
  updateConventionalRunwayPresentation(runway, at(13));
  assert.equal(runway.edgeLights.visible, false);
  assert.equal(runway.towerBeacon.visible, false);
  updateConventionalRunwayPresentation(runway, at(13, { player_rtb_active: true }));
  assert.equal(runway.edgeLights.visible, true);
  assert.equal(runway.towerBeacon.visible, true);
  assert.equal(runway.edgeLights.material.opacity, RUNWAY_LIGHT_OPACITY);

  // A short strip keeps its beacon hidden whatever the range.
  const short = createConventionalRunwayPresentation();
  updateConventionalRunwayPresentation(short, { ...at(2), runway_length_m: 900 });
  assert.equal(short.towerBeacon.visible, false);
  assert.equal(short.edgeLights.visible, true);
});
