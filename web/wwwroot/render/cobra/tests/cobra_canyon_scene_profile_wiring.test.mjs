import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  FOLIAGE_UV_BAMBOO,
  FOLIAGE_UV_HARDWOOD,
  FOLIAGE_UV_PALM,
  FOLIAGE_UV_SCRUB,
} from "../cobra_canyon_foliage.js";
import {
  COBRA_CANYON_VISUAL_PROFILE,
  cobraAuthorityDirectionToThree,
} from "../cobra_canyon_visual_profile.js";
import {
  createCobraCanyonBasinMaterial,
  createCobraCanyonRiverMaterial,
  flatGroundLight,
} from "../cobra_canyon_terrain_material.js";

const webRoot = new URL("../../../", import.meta.url);
const repositoryRoot = new URL("../../../../../", import.meta.url);
const CONTRACT_PATH = "content/packs/cobra-vietnam/environment/cobra-canyon-visual-contract.v1.json";

async function webSource(path) {
  return readFile(new URL(path, webRoot), "utf8");
}

async function repositorySource(path) {
  return readFile(new URL(path, repositoryRoot), "utf8");
}

function luminance([red, green, blue]) {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function materialThreeStub() {
  class Vector2 {
    constructor(x, y) { Object.assign(this, { x, y }); }
  }
  class Vector3 {
    constructor(x, y, z) { Object.assign(this, { x, y, z }); }
  }
  class Vector4 {
    constructor(x, y, z, w) { Object.assign(this, { x, y, z, w }); }
  }
  class Color {
    constructor(value) { this.value = value; }
  }
  class ShaderMaterial {
    constructor(options) { Object.assign(this, options); }
  }
  return { Vector2, Vector3, Vector4, Color, ShaderMaterial, DoubleSide: "DoubleSide" };
}

function uvTuple(region) {
  return [region.u0, region.v0, region.u1, region.v1];
}

test("visual profile keeps the humid-readable theatre invariants", () => {
  const profile = COBRA_CANYON_VISUAL_PROFILE;
  assert.equal(profile.schemaVersion, "4.0.0");
  assert.equal(profile.profileId, "visual.cobra-vietnam.humid-readable.v4");
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(Object.isFrozen(profile.terrainPaint), true);
  assert.equal(Object.isFrozen(profile.terrainPaint.bands), true);
  assert.equal(Object.isFrozen(profile.water), true);

  const sun = profile.sunDirectionAuthority;
  assert.ok(Math.abs(Math.hypot(...sun) - 1) < 1e-6, "sun direction must be unit length");
  assert.deepEqual(cobraAuthorityDirectionToThree([0, 0, 1]), [0, 0, -1],
    "authority +north must map to Three.js -Z");
  assert.throws(() => cobraAuthorityDirectionToThree([0, Number.NaN, 1]), /finite/);

  const readableRadiusM = 1.87 / profile.fog.density;
  assert.ok(readableRadiusM > 8_000 && readableRadiusM < 12_000,
    `fog radius ${readableRadiusM.toFixed(0)} m must layer the ridges without hiding the gorge`);

  const paint = profile.terrainPaint;
  assert.ok(paint.shadowFloor >= 0.25 && paint.shadowFloor <= 0.40,
    "humid gorge shadows must retain form without crushing or flattening");
  assert.ok(paint.occlusionRange[0] >= 0.85 && paint.occlusionRange[0] < 1,
    "concave terrain must remain readable rather than turning into a black wall");
  assert.ok(paint.occlusionRange[1] > 1 && paint.occlusionRange[1] <= 1.12,
    "convex terrain must receive a restrained lift");
  assert.ok(paint.reliefGain <= 0.30, "relief must not print the terrain triangles");
  assert.ok(paint.cloudShadowStrength <= 0.20,
    "cloud shadow must remain subordinate to the landform hierarchy");
  assert.ok(paint.microNormalStrength > 0 && paint.microNormalStrength <= 0.25,
    "micro-normal response must add near detail without sparkling at distance");
  assert.ok(luminance(paint.sunKey) > luminance(paint.skyFill),
    "sun key must be brighter than sky fill");
  assert.ok(paint.sunKey[0] > paint.sunKey[2], "sun key must be warm");
  assert.ok(paint.skyFill[2] > paint.skyFill[0], "sky fill must be cool");

  const gates = paint.elevationBandsM;
  assert.equal(gates.length, 4);
  for (let index = 1; index < gates.length; index++) {
    assert.ok(gates[index] > gates[index - 1], "elevation gates must ascend");
  }
  assert.ok(gates[0] > 120 && gates[0] < 260, "lowland must fade inside the basin floor");
  assert.ok(gates[3] < 932, "rim rock must be reachable on this heightfield");

  const bandLuminances = Object.values(paint.bands).map(luminance);
  assert.ok(Math.max(...bandLuminances) - Math.min(...bandLuminances) > 0.12,
    "landcover bands must span a useful value range");
  assert.ok(profile.water.shoreWindow[0] < 1 && profile.water.shoreWindow[1] > 1,
    "shore window must straddle the waterline");
  assert.ok(luminance(profile.water.bankColor) > luminance(profile.water.deepColor),
    "banks must read lighter than the channel");
});

test("the portable contract is staged byte-for-byte and matches Web plus its QA cameras", async () => {
  const [sourceText, stagedText, shotSource, foliageSource, assetKitSource] = await Promise.all([
    repositorySource(CONTRACT_PATH),
    webSource(CONTRACT_PATH),
    repositorySource("tools/cobra-scenery-gate/shot.mjs"),
    webSource("render/cobra/cobra_canyon_foliage.js"),
    webSource("render/cobra/cobra_canyon_asset_kit.js"),
  ]);
  assert.equal(stagedText, sourceText, "published visual contract must match source byte-for-byte");

  const contract = JSON.parse(sourceText);
  const profile = COBRA_CANYON_VISUAL_PROFILE;
  assert.equal(contract.schemaVersion, "1.0.0");
  assert.equal(contract.coordinateSystem.name, "east-up-north-metres");
  assert.equal(contract.coordinateSystem.handedness, "left-handed");
  assert.deepEqual(contract.coordinateSystem.authorityAxes, { x: "east", y: "up", z: "north" });
  assert.equal(contract.coordinateSystem.rendererPositionMappings.threeJs, "[eastM, upM, -northM]");
  assert.equal(contract.coordinateSystem.rendererPositionMappings.unity, "[eastM, upM, -northM]");
  assert.equal(contract.cameraConvention.yawZeroForward, "+north");
  assert.equal(contract.cameraConvention.eulerOrder, "YXZ");
  assert.equal(contract.cameraConvention.yawPositiveTurns, "toward-west");
  assert.match(contract.cameraConvention.forwardWorld, /sin\(yawRad\).*cos\(pitchRad\)/);
  assert.equal(contract.cameraConvention.rendererForwardMappings.unity, "[east,up,-north]");
  assert.equal(contract.colourEncoding.hexValues, "sRGB");
  assert.equal(contract.colourEncoding.paletteLinearRgb, "linear-sRGB");
  assert.deepEqual(contract.colourEncoding.transparentReferenceCompositing, {
    stage: "after per-object ACESFilm tone mapping, sRGB output encoding and scene fog",
    blend: "source-over in sRGB code values",
    unityAdapter: "destination-aware source reconstruction before linear framebuffer source-over",
    compensatedRoles: ["mist", "transparent-core"],
    compensationRule: "effectiveAlpha>0.006",
    minimumCompensatedAlpha: 0.006,
    subByteLinearRoles: ["waterAccent"],
  });
  assert.equal(contract.colourEncoding.unityProjectColorSpace, "Linear");
  assert.equal(contract.colourEncoding.unityLightsUseLinearIntensity, true);
  assert.equal(contract.artDirection.uiRule, "minimal-text mission menus remain unchanged");
  assert.deepEqual(contract.lighting.sunDirectionAuthority, profile.sunDirectionAuthority.map(
    (value) => Number(value.toFixed(6)),
  ));
  assert.match(contract.lighting.sunDirectionMeaning, /surface toward the sun/);
  assert.equal(contract.lighting.rendererDirectionMappings.threeJs, "[east,up,-north]");
  assert.equal(contract.lighting.rendererDirectionMappings.unity, "[east,up,-north]");
  assert.equal(contract.lighting.fogColorHex,
    `#${profile.fog.color.toString(16).padStart(6, "0")}`);
  assert.ok(Math.abs(contract.lighting.readableRadiusM - (1.87 / profile.fog.density)) < 2);
  assert.equal(contract.lighting.shadowFloor, profile.terrainPaint.shadowFloor);
  assert.deepEqual(contract.paletteLinearRgb, {
    valleyFloor: [...profile.terrainPaint.bands.valleyFloor],
    cultivation: [...profile.terrainPaint.bands.cultivationGold],
    jungle: [...profile.terrainPaint.bands.jungleMid],
    laterite: [...profile.terrainPaint.bands.lateriteSlope],
    ridge: [...profile.terrainPaint.bands.ridgeSage],
    rimRock: [...profile.terrainPaint.bands.rimRock],
    deepWater: [...profile.water.deepColor],
    shallowWater: [...profile.water.shallowColor],
  });
  assert.equal(contract.groundMacro.uri, "textures/cobra-ground-macro-painted-v1.png");
  assert.match(contract.groundMacro.rendererSamplerMappings.threeJs, /flipY=false/);
  assert.match(contract.groundMacro.rendererSamplerMappings.unity, /\[u,1-v\]/);
  assert.equal(contract.groundMacro.worldProjection.canonicalAxes,
    "[eastM,southM] where southM=-northM");
  assert.equal(contract.groundMacro.worldProjection.threeJs,
    "[worldPosition.x,worldPosition.z]");
  assert.equal(contract.groundMacro.worldProjection.unity,
    "[worldPosition.x,worldPosition.z]");
  assert.deepEqual(contract.groundMacro.macroSample, { repeatM: 6200, phase: [0.17, -0.11] });
  assert.deepEqual(contract.groundMacro.nearSample.rotationRowMajor2x2,
    [0.866, -0.5, 0.5, 0.866]);
  assert.equal(contract.groundMacro.nearSample.repeatM, 850);
  assert.equal(contract.groundMacro.nearSample.triplanarWeightExponent, 4);
  assert.deepEqual(contract.groundMacro.nearSample.phaseByPlane, {
    horizontal: [0.31, 0.23],
    eastFacing: [0.61, -0.17],
    northSouthFacing: [-0.23, 0.47],
  });
  assert.equal(contract.groundMacro.nearProjection, "triplanar slope-aware");
  assert.equal(contract.foliageAtlas.uri, "foliage/foliage-atlas-painted-v2.png");
  assert.equal(contract.foliageAtlas.alphaCutoff, 0.38);
  assert.equal(contract.foliageAtlas.regionConvention.uvOrigin, "top-left");
  assert.equal(contract.foliageAtlas.regionConvention.vDirection, "down");
  assert.match(contract.foliageAtlas.rendererSamplerMappings.threeJs, /flipY=false/);
  assert.match(contract.foliageAtlas.rendererSamplerMappings.unity, /\[u,1-v\]/);
  assert.deepEqual(contract.foliageAtlas.cardUvMapping, {
    physicalBottom: "[u,vMax]",
    physicalTop: "[u,vMin]",
  });
  assert.deepEqual(contract.foliageAtlas.rendererCardUvMappings.unity, {
    physicalBottom: "[u,1-vMax]",
    physicalTop: "[u,1-vMin]",
  });
  assert.deepEqual(contract.foliageAtlas.regions, {
    palm: uvTuple(FOLIAGE_UV_PALM),
    hardwood: uvTuple(FOLIAGE_UV_HARDWOOD),
    bambooBanana: uvTuple(FOLIAGE_UV_BAMBOO),
    fernScrub: uvTuple(FOLIAGE_UV_SCRUB),
  });
  assert.deepEqual(contract.foliageAtlas.visualExtentTargetsM.ambientCanopy,
    { width: [62, 81], height: [28, 36], depth: [36, 49] });
  assert.deepEqual(contract.ecology.ambientCluster, {
    probability: 0.82,
    groupSize: 3,
    jitterShape: "axis-aligned square",
    jitterPerAxisM: [-27.5, 27.5],
  });
  assert.match(foliageSource, /texture\.flipY = false/,
    "Web must use the contract's authored top-left atlas orientation");
  assert.match(assetKitSource, /const uvBl = \[region\.u0, region\.v1\]/);
  assert.match(assetKitSource, /const uvTr = \[region\.u1, region\.v0\]/);
  assert.match(assetKitSource, /seededUnit\(seed, 0x51633e2d\) < 0\.82/);
  assert.match(assetKitSource, /Math\.floor\(ordinal \/ 3\)/);
  assert.match(assetKitSource, /quota\.role === "jungle" \? 55 : 120/);
  assert.equal(contract.heroSilhouettes.ironBellBridge.collisionDeckHeightM, 8);
  assert.equal(contract.heroSilhouettes.ironBellBridge.presentationTotalHeightM, 16);
  assert.deepEqual(contract.acceptanceProjection, {
    projection: "perspective",
    verticalFovDeg: 58,
    aspect: 1.6,
    nearClipM: 0.5,
    farClipM: 32000,
    unityPosition: "[eastM, terrainHeightM(eastM,northM)+aglM, -northM]",
    unityForward:
      "[-sin(yawRad)*cos(pitchRad), sin(pitchRad), -cos(yawRad)*cos(pitchRad)]",
    unityUp:
      "[sin(yawRad)*sin(pitchRad), cos(pitchRad), cos(yawRad)*sin(pitchRad)]",
    unityProjectionXSign: -1,
    unityInvertCulling: true,
  });
  assert.deepEqual(contract.acceptanceViews.map(({ id }) => id),
    ["camp-ember", "mid-gorge", "iron-bell"]);
  assert.match(shotSource, /VISUAL_CONTRACT\.acceptanceViews\.map/,
    "visual QA must consume the contract cameras instead of copying their coordinates");

  const THREE = materialThreeStub();
  const expectedThree = cobraAuthorityDirectionToThree(profile.sunDirectionAuthority);
  for (const material of [
    createCobraCanyonBasinMaterial(THREE, profile),
    createCobraCanyonRiverMaterial(THREE, profile),
  ]) {
    const direction = material.uniforms.uSunDirection.value;
    assert.deepEqual([direction.x, direction.y, direction.z], expectedThree,
      "every Web shader must consume the authority-to-Three mapped sun");
  }
});

test("the canyon keeps the shared product sun and sky while adapting the theatre air", async () => {
  const [app, builders] = await Promise.all([
    webSource("app.js"),
    webSource("render/scene/scene_builders.js"),
  ]);
  const profile = COBRA_CANYON_VISUAL_PROFILE;

  const appSun = app.match(
    /const SUN_DIRECTION = new THREE\.Vector3\(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/,
  );
  assert.ok(appSun, "app.js must still declare SUN_DIRECTION");
  const appSunVector = [Number(appSun[1]), Number(appSun[2]), Number(appSun[3])];
  const appSunLength = Math.hypot(...appSunVector);
  const cobraSunThree = cobraAuthorityDirectionToThree(profile.sunDirectionAuthority);
  for (let axis = 0; axis < 3; axis++) {
    assert.ok(Math.abs(cobraSunThree[axis] - appSunVector[axis] / appSunLength) < 1e-6,
      "Cobra Canyon and the F-22 must share a sun direction");
  }

  assert.match(app, /this\.ambient = new THREE\.HemisphereLight\(0xb5cad0, 0x102229, 0\.78\)/);
  assert.equal(profile.lighting.hemisphereSkyColor, 0xb5cad0);
  assert.match(app, /this\.sun = new THREE\.DirectionalLight\(0xffe2b4, 2\.65\)/);
  assert.equal(profile.lighting.sunColor, 0xffe2b4);
  assert.equal(profile.lighting.sunIntensity, 2.65);

  assert.match(builders, /vec3 horizonCoolDefault = mix\([\s\S]{0,40}?vec3\(0\.34, 0\.47, 0\.52\)/);
  assert.deepEqual([...profile.sky.horizonColor], [0.34, 0.47, 0.52]);
  assert.match(builders, /vec3 zenithCoolDefault = mix\([\s\S]{0,40}?vec3\(0\.035, 0\.16, 0\.34\)/);
  assert.deepEqual([...profile.sky.zenithColor], [0.035, 0.16, 0.34]);
  assert.match(builders, /exp\(-abs\(direction\.y\) \* mix\(70\.0, 48\.0, uSoftWorld\)\)/);
  assert.equal(profile.sky.horizonShoulderFalloff, 70);
});

test("cobra lab consumes the shared profile and keeps continuous sky/fog output", async () => {
  const main = await webSource("cobra-lab/main.js");
  assert.match(main, /COBRA_CANYON_VISUAL_PROFILE/);
  assert.match(main, /cobra_canyon_visual_profile\.js\?v=\d+/);
  assert.match(main, /FogExp2\(sceneProfile\.fog\.color, sceneProfile\.fog\.density\)/);
  assert.match(main, /sceneProfile\.lighting\.hemisphereSkyColor/);
  assert.match(main, /sun\.position\.copy\(sunDirection\)/);
  assert.match(main, /sceneProfile\.sky\.zenithColor/);
  assert.match(main, /sceneProfile\.sky\.horizonColor/);
  assert.match(main, /#include <tonemapping_fragment>/);
  assert.match(main, /#include <colorspace_fragment>/);
  assert.doesNotMatch(main, /0\.000038/);
});

test("basin and river use multi-scale authored material without quantized aerial bands", async () => {
  const [presentation, material] = await Promise.all([
    webSource("render/cobra/cobra_canyon_presentation.js"),
    webSource("render/cobra/cobra_canyon_terrain_material.js"),
  ]);
  assert.match(presentation, /createCobraCanyonBasinMaterial/);
  assert.match(presentation, /createCobraCanyonRiverMaterial/);
  assert.doesNotMatch(presentation, /vertexColors/);

  assert.match(material, /uniform sampler2D uGroundMacro/);
  assert.match(material, /groundUv \/ 6200\.0/);
  assert.match(material, /groundUv \/ 850\.0/);
  assert.match(material, /vec3 triplanarWeight = pow\(abs\(geometryNormal\), vec3\(4\.0\)\)/);
  assert.match(material, /1\.0 - smoothstep\(240\.0, 1700\.0, viewDistanceM\)/);
  assert.match(material,
    /mix\(uSkyFill, uSunKey, toneRamp\) \* \(0\.72 \+ toneRamp \* 0\.28\)/);
  assert.match(material, /1\.0 - exp\(-fogDensity \* fogDensity/);
  assert.doesNotMatch(material, /floor\(aerial/,
    "aerial perspective must stay continuous rather than forming visible bands");
  assert.doesNotMatch(material, /return fract\(sin\(dot\(/,
    "large-world noise must not use the precision-breaking sin hash");
});

test("flat ground retains daylight colour and never exceeds the full key", () => {
  const light = flatGroundLight(COBRA_CANYON_VISUAL_PROFILE);
  assert.equal(light.length, 3);
  const profile = COBRA_CANYON_VISUAL_PROFILE;
  const halfLambert = (profile.sunDirectionAuthority[1] * 0.5 + 0.5) ** 2;
  const ramp = profile.terrainPaint.toneRampGates.reduce((sum, gate) => {
    const unit = Math.min(1, Math.max(0, (halfLambert - gate.start) / (gate.end - gate.start)));
    return sum + gate.weight * unit * unit * (3 - 2 * unit);
  }, 0);
  const tone = profile.terrainPaint.shadowFloor + (1 - profile.terrainPaint.shadowFloor) * ramp;
  const ambientCarry = 0.72 + tone * 0.28;
  for (const channel of light) {
    assert.ok(channel > 0.2 && channel < 1,
      `flat-ground light ${channel.toFixed(3)} must be a real daylight multiplier`);
  }
  const paint = profile.terrainPaint;
  const expected = paint.skyFill.map((fill, channel) =>
    (fill + (paint.sunKey[channel] - fill) * tone) * ambientCarry);
  for (let channel = 0; channel < light.length; channel++) {
    assert.ok(Math.abs(light[channel] - expected[channel]) < 1e-12,
      "CPU river-bank lighting must match the basin shader's ambient-carry formula");
  }
  assert.ok(light[0] / light[2] > paint.skyFill[0] / paint.skyFill[2],
    "flat ground must move from cool fill toward the warm sun key");
});
