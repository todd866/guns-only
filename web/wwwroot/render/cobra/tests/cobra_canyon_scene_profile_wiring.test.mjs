import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { COBRA_CANYON_VISUAL_PROFILE } from "../cobra_canyon_visual_profile.js";
import { flatGroundLight } from "../cobra_canyon_terrain_material.js";

const root = new URL("../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

function luminance([red, green, blue]) {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

test("visual profile keeps the painted-tactical invariants", () => {
  const profile = COBRA_CANYON_VISUAL_PROFILE;
  assert.equal(profile.profileId, "visual.cobra-vietnam.painted-tactical.v3");
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(Object.isFrozen(profile.terrainPaint), true);
  assert.equal(Object.isFrozen(profile.terrainPaint.bands), true);
  assert.equal(Object.isFrozen(profile.water), true);

  const sun = profile.sunDirectionWorld;
  assert.ok(Math.abs(Math.hypot(...sun) - 1) < 1e-6, "sun direction must be unit length");

  // Haze and view radius are one knob: fog density = 1.87 / radius. Keep the readable world
  // between ~19 km and ~40 km so the rim layers without dissolving (adaptive-world-radius
  // doctrine) — and never again the Build 264 no-fog setting.
  const radiusM = 1.87 / profile.fog.density;
  assert.ok(radiusM > 19_000 && radiusM < 40_000,
    `fog radius ${radiusM.toFixed(0)} m must sit in the painted-depth band`);

  // Value-structure guards, straight from the terrain-legibility diagnosis: no 40% value floor,
  // enclosure occlusion must both sink valleys and lift crests, and the sun key must be warmer
  // AND brighter than the sky fill (painted light is coloured light, not dimmed light).
  const paint = profile.terrainPaint;
  assert.ok(paint.shadowFloor <= 0.20, "shadow floor must stay below the flat-wash threshold");
  assert.ok(paint.shadowFloor >= 0.08, "shadow floor must not crush to black");
  assert.ok(paint.occlusionRange[0] < 1 && paint.occlusionRange[1] > 1,
    "occlusion range must darken concave and brighten convex terrain");
  assert.ok(luminance(paint.sunKey) > luminance(paint.skyFill),
    "sun key must be brighter than sky fill");
  assert.ok(paint.sunKey[0] > paint.sunKey[2], "sun key must be warm");
  assert.ok(paint.skyFill[2] > paint.skyFill[0], "sky fill must be cool");

  // Elevation gates must be ordered and must actually straddle THIS heightfield: the basin runs
  // 98-932 m and its floor sits near 250 m. Korea's 70-1500 m gates collapse it into one band,
  // which is the Build 264 monotone.
  const gates = paint.elevationBandsM;
  assert.equal(gates.length, 4);
  for (let index = 1; index < gates.length; index++) {
    assert.ok(gates[index] > gates[index - 1], "elevation gates must ascend");
  }
  assert.ok(gates[0] > 120 && gates[0] < 260, "lowland must fade out inside the basin floor");
  assert.ok(gates[3] < 932, "rim rock must be reachable on this heightfield");

  // The albedo bands must actually differ, and wild versus worked ground must separate in hue —
  // when both collapsed onto Korea's single olive valley tone the patchwork vanished.
  const bandLuminances = Object.values(paint.bands).map(luminance);
  assert.ok(Math.max(...bandLuminances) - Math.min(...bandLuminances) > 0.12,
    "albedo bands must span a real value range");
  const { valleyFloor, cultivationGold } = paint.bands;
  assert.ok(cultivationGold[0] - valleyFloor[0] > 0.10,
    "worked ground must separate from wild ground in hue, not only in value");

  // The river's gravel bar lives inside the authored ribbon, so 1.0 stays the waterline.
  assert.ok(profile.water.shoreWindow[0] < 1 && profile.water.shoreWindow[1] > 1,
    "the shore window must straddle the waterline");
  assert.ok(luminance(profile.water.bankColor) > luminance(profile.water.deepColor),
    "gravel must read lighter than open channel");
});

test("the canyon reads as the same product as the F-22: one sun, one air, one light rig", async () => {
  const app = await source("app.js");
  const terrain = await source("render/environment/korea_terrain.js");
  const profile = COBRA_CANYON_VISUAL_PROFILE;

  // OWNER RULING 2026-08-06: "all the different games [must] have very similar vibe graphically
  // to F-22." These assertions read the F-22's own source and fail if this scene drifts off it —
  // or if the F-22 moves and this scene is not moved with it. Both are the same bug.
  const appSun = app.match(
    /const SUN_DIRECTION = new THREE\.Vector3\(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/,
  );
  assert.ok(appSun, "app.js must still declare SUN_DIRECTION");
  const appSunVector = [Number(appSun[1]), Number(appSun[2]), Number(appSun[3])];
  const appSunLength = Math.hypot(...appSunVector);
  for (let axis = 0; axis < 3; axis++) {
    assert.ok(Math.abs(profile.sunDirectionWorld[axis] - appSunVector[axis] / appSunLength) < 1e-6,
      "the canyon must fly under the F-22's sun");
  }

  assert.match(app, /this\.fogLow = new THREE\.Color\(0x6f8790\)/);
  assert.equal(profile.fog.color, 0x6f8790, "the canyon must recede into the F-22's air");
  assert.match(app, /this\.ambient = new THREE\.HemisphereLight\(0xb5cad0, 0x102229, 0\.78\)/);
  assert.equal(profile.lighting.hemisphereSkyColor, 0xb5cad0);
  assert.match(app, /this\.sun = new THREE\.DirectionalLight\(0xffe2b4, 2\.65\)/);
  assert.equal(profile.lighting.sunColor, 0xffe2b4);
  assert.equal(profile.lighting.sunIntensity, 2.65);

  // korea_terrain's shipped surface constants, adopted rather than reinvented.
  assert.match(terrain, /uShadowFloor: \{ value: finite\(options\.shadowFloor, ukraine \? 0\.16 : 0\.12\) \}/);
  assert.equal(profile.terrainPaint.shadowFloor, 0.12);
  assert.match(terrain, /finite\(options\.occlusionMin, 0\.55\)/);
  assert.match(terrain, /finite\(options\.occlusionMax, 1\.10\)/);
  assert.deepEqual([...profile.terrainPaint.occlusionRange], [0.55, 1.10]);
  assert.match(terrain, /finite\(options\.cloudShadowStrength, 0\.34\)/);
  assert.equal(profile.terrainPaint.cloudShadowStrength, 0.34);
  assert.match(terrain, /finite\(options\.hazeBands, ukraine \? 0 : 6\)/);
  assert.equal(profile.fog.hazeBands, 6);
  assert.match(terrain, /finite\(options\.hazeBandBlend, ukraine \? 0 : 0\.65\)/);
  assert.equal(profile.fog.hazeBandBlend, 0.65);

  // The two-softstep tone ramp, gate for gate, is what puts both worlds' terrain in the same
  // value structure under the same sun.
  assert.match(terrain, /0\.42 \* smoothstep\(0\.26, 0\.40, halfLambert\)/);
  assert.match(terrain, /0\.58 \* smoothstep\(0\.58, 0\.76, halfLambert\)/);
  assert.deepEqual(
    profile.terrainPaint.toneRampGates.map((gate) => [gate.start, gate.end, gate.weight]),
    [[0.26, 0.40, 0.42], [0.58, 0.76, 0.58]],
  );
  // Hue-separated painted light, verbatim.
  assert.match(terrain, /vec3 skyFill = vec3\(0\.62, 0\.74, 1\.00\)/);
  assert.match(terrain, /vec3 sunKey {2}= vec3\(1\.06, 1\.01, 0\.92\)/);
  assert.deepEqual([...profile.terrainPaint.skyFill], [0.62, 0.74, 1.0]);
  assert.deepEqual([...profile.terrainPaint.sunKey], [1.06, 1.01, 0.92]);
});

test("the canyon sky is the decision-support sky's cool branch", async () => {
  const builders = await source("render/scene/scene_builders.js");
  const sky = COBRA_CANYON_VISUAL_PROFILE.sky;
  assert.match(builders, /vec3 horizonCool = mix\(vec3\(0\.34, 0\.47, 0\.52\)/);
  assert.deepEqual([...sky.horizonColor], [0.34, 0.47, 0.52]);
  assert.match(builders, /vec3 zenithCool = mix\(vec3\(0\.035, 0\.16, 0\.34\)/);
  assert.deepEqual([...sky.zenithColor], [0.035, 0.16, 0.34]);
  assert.match(builders, /vec3 belowCool = vec3\(0\.022, 0\.075, 0\.095\)/);
  assert.deepEqual([...sky.belowHorizonColor], [0.022, 0.075, 0.095]);
  // Same curve, same shoulder: mix(0.42, 0.28, altitudeMix) at zero altitude, and exp(-|y| * 70).
  assert.match(builders, /mix\(0\.42, 0\.28, altitudeMix\)/);
  assert.equal(sky.skyCurveExponent, 0.42);
  assert.match(builders, /exp\(-abs\(direction\.y\) \* mix\(70\.0, 48\.0, uSoftWorld\)\)/);
  assert.equal(sky.horizonShoulderFalloff, 70);
});

test("cobra lab scene constants consume the shared visual profile", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /COBRA_CANYON_VISUAL_PROFILE/);
  assert.match(main, /cobra_canyon_visual_profile\.js\?v=\d+/);
  // Fog, background, hemisphere, sun and sky uniforms all read the profile.
  assert.match(main, /FogExp2\(sceneProfile\.fog\.color, sceneProfile\.fog\.density\)/);
  assert.match(main, /sceneProfile\.lighting\.hemisphereSkyColor/);
  assert.match(main, /sun\.position\.copy\(sunDirection\)/);
  assert.match(main, /sceneProfile\.sky\.zenithColor/);
  assert.match(main, /sceneProfile\.sky\.horizonColor/);
  // The lab sky runs the shared tone-map/encode tail, or its linear colours ship raw.
  assert.match(main, /#include <tonemapping_fragment>/);
  assert.match(main, /#include <colorspace_fragment>/);
  // The Build 264 washed-out scene constants must never return.
  assert.doesNotMatch(main, /0x6f8a7e/i);
  assert.doesNotMatch(main, /0x8fa08f/i);
  assert.doesNotMatch(main, /0xf0f4e6/i);
  assert.doesNotMatch(main, /0\.000038/);
});

test("the basin and river surfaces run the shared painted recipe, per fragment", async () => {
  const presentation = await source("render/cobra/cobra_canyon_presentation.js");
  assert.match(presentation, /cobra_canyon_terrain_material\.js\?v=\d+/);
  assert.match(presentation, /createCobraCanyonBasinMaterial/);
  assert.match(presentation, /createCobraCanyonRiverMaterial/);
  // Baked vertex colour was the Build 264 monotone's mechanism at this vertex spacing.
  assert.doesNotMatch(presentation, /vertexColors/);

  const material = await source("render/cobra/cobra_canyon_terrain_material.js");
  assert.match(material, /halfLambert \*= halfLambert;/);
  assert.match(material, /uToneGateWeights\.x \* smoothstep\(uToneGateLow/);
  assert.match(material, /mix\(uSkyFill, uSunKey, toneRamp\) \* toneRamp/);
  assert.match(material, /mix\(uOcclusionRange\.x, uOcclusionRange\.y, clamp\(vConcavity/);
  assert.match(material, /floor\(aerial \* bands\) \/ bands/);
  // The sin hash breaks down past ~1e5, which silenced the near-field octaves entirely.
  assert.doesNotMatch(material, /return fract\(sin\(dot\(/);
});

test("the river's gravel bars are lit like the ground they sit in", () => {
  const light = flatGroundLight(COBRA_CANYON_VISUAL_PROFILE);
  assert.equal(light.length, 3);
  // Level ground under this sun: dimmed, warm-shifted, and never brighter than full key.
  for (const channel of light) {
    assert.ok(channel > 0.2 && channel < 1,
      `flat-ground light ${channel.toFixed(3)} must be a real daylight multiplier`);
  }
  // Level ground sits partway up the ramp, so its light is still fill-dominated — but it must
  // have moved measurably toward the warm key, or the tone ramp is not tinting at all.
  const paint = COBRA_CANYON_VISUAL_PROFILE.terrainPaint;
  assert.ok(light[0] / light[2] > paint.skyFill[0] / paint.skyFill[2],
    "flat ground must have moved off the pure sky fill toward the sun key");
});
