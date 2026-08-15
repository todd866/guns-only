import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  COBRA_GOLDEN_PATH_DEFAULTS,
  COBRA_GOLDEN_PATH_SCHEMA,
  cobraGoldenPathFlowOffset,
  cobraGoldenPathObjective,
  cobraGoldenPathState,
  createCobraGoldenPath,
} from "../cobra_golden_path.js";
import { cobraTacticalMapBounds, cobraTacticalMapModel } from "../cobra_tactical_map.js";

function fakeThree() {
  class Color {
    constructor(hex) { this.hex = hex; }
    setHex(hex) { this.hex = hex; return this; }
  }
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  }
  class Object3D {
    constructor() {
      this.children = [];
      this.position = new Vector3();
      this.visible = true;
      this.userData = {};
      this.parent = null;
    }
    add(...objects) {
      for (const object of objects) {
        object.parent = this;
        this.children.push(object);
      }
      return this;
    }
    remove(...objects) {
      for (const object of objects) {
        this.children = this.children.filter((child) => child !== object);
        object.parent = null;
      }
      return this;
    }
    removeFromParent() { this.parent?.remove(this); }
  }
  class Group extends Object3D {}
  class Mesh extends Object3D {
    constructor(geometry, material) {
      super();
      this.isMesh = true;
      this.geometry = geometry;
      this.material = material;
    }
  }
  class BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
      this.usage = null;
      this.needsUpdate = false;
    }
    setUsage(usage) { this.usage = usage; return this; }
  }
  class BufferGeometry {
    constructor() {
      this.attributes = {};
      this.index = null;
      this.boundingSphereComputations = 0;
      this.disposed = false;
    }
    setAttribute(name, attribute) { this.attributes[name] = attribute; return this; }
    setIndex(attribute) { this.index = attribute; return this; }
    computeBoundingSphere() { this.boundingSphereComputations += 1; }
    dispose() { this.disposed = true; }
  }
  class ShaderMaterial {
    constructor(params = {}) {
      Object.assign(this, params);
      this.disposed = false;
    }
    dispose() { this.disposed = true; }
  }
  return {
    Group,
    Mesh,
    BufferGeometry,
    BufferAttribute,
    ShaderMaterial,
    Color,
    AdditiveBlending: "additive",
    NormalBlending: "normal",
    DoubleSide: "double",
    DynamicDrawUsage: "dynamic",
  };
}

/** Render space is x = east, y = up, z = -north. */
function ribbonVertices(path) {
  const mesh = path.group.children[0];
  const positions = mesh.geometry.attributes.position.array;
  const vertices = [];
  for (let index = 0; index < positions.length; index += 3) {
    vertices.push({
      eastM: positions[index],
      upM: positions[index + 1],
      northM: -positions[index + 2],
    });
  }
  return vertices;
}

function playerAt(eastM, northM, altitudeM = 200) {
  return { eastM, northM, altitudeM, headingRad: 0 };
}

const FLAT_GROUND = () => 100;

test("golden path is hidden and builds no curve without an objective", () => {
  const path = createCobraGoldenPath(fakeThree());
  assert.equal(path.group.userData.schema, COBRA_GOLDEN_PATH_SCHEMA);
  assert.equal(path.group.visible, false);

  path.update({
    player: playerAt(0, 0),
    objective: null,
    groundHeightAt: FLAT_GROUND,
    nowSeconds: 12,
    arrivedRadiusM: 400,
  });

  assert.equal(path.group.visible, false);
  assert.equal(path.group.userData.rebuildCount, 0, "no geometry work while hidden");
  assert.equal(path.group.children[0].material.uniforms.uOpacity.value, 0);
  path.dispose();
});

test("the chevron sequence points at the objective and its drawn length is capped", () => {
  const path = createCobraGoldenPath(fakeThree());
  // Objective 6 km away — far beyond the 1.5 km draw cap.
  path.update({
    player: playerAt(0, 0),
    objective: { siteId: "site.a", eastM: 0, northM: 6_000 },
    groundHeightAt: FLAT_GROUND,
    nowSeconds: 0,
    arrivedRadiusM: 400,
  });

  assert.equal(path.group.visible, true);
  const vertices = ribbonVertices(path);
  const nearM = Math.min(...vertices.map((v) => Math.hypot(v.eastM - 0, v.northM - 6_000)));
  const nearEnd = vertices[0];
  const farEnd = vertices[vertices.length - 1];
  const nearRangeM = Math.hypot(nearEnd.eastM, nearEnd.northM - 6_000);
  const farRangeM = Math.hypot(farEnd.eastM, farEnd.northM - 6_000);
  assert.ok(farRangeM < nearRangeM, "far end must be closer to the objective than the near end");
  assert.ok(nearM > 0);

  // Spine length: near end starts at the lead offset, far end no further than lead + cap.
  const spineStartNorthM = nearEnd.northM;
  const spineEndNorthM = farEnd.northM;
  const drawnM = spineEndNorthM - spineStartNorthM;
  assert.ok(drawnM > 0, "the ribbon runs toward the objective");
  assert.ok(
    drawnM <= COBRA_GOLDEN_PATH_DEFAULTS.maxLengthM + 1,
    `drawn length ${drawnM} must stay inside the ${COBRA_GOLDEN_PATH_DEFAULTS.maxLengthM} m cap`,
  );
  // It also must not start on top of the pilot.
  assert.ok(spineStartNorthM > 40, "the first open chevron starts ahead of the ship");
  path.dispose();
});

test("every ribbon vertex clears a ridge fed to the terrain sampler", () => {
  const path = createCobraGoldenPath(fakeThree());
  // A 500 m ridge crest halfway along the run, over a 100 m floor.
  const groundHeightAt = (eastM, northM) => {
    const crestM = 400 * Math.exp(-((northM - 900) ** 2) / (2 * 180 ** 2));
    return 100 + crestM;
  };

  path.update({
    player: playerAt(0, 0),
    objective: { siteId: "site.ridge", eastM: 0, northM: 4_000 },
    groundHeightAt,
    nowSeconds: 0,
    arrivedRadiusM: 400,
  });

  const vertices = ribbonVertices(path);
  let sawRidge = false;
  for (const vertex of vertices) {
    const groundM = groundHeightAt(vertex.eastM, vertex.northM);
    if (groundM > 300) sawRidge = true;
    assert.ok(
      // 0.05 m of slack because positions live in a Float32Array, not because the margin is soft.
      vertex.upM >= groundM + path.group.userData.clearanceM - 0.05,
      `vertex at north ${vertex.northM} sits ${vertex.upM - groundM} m over ${groundM} m ground`,
    );
  }
  assert.ok(sawRidge, "the fixture must actually put a ridge under the path");
  path.dispose();
});

test("corridor rides just below eye height within a safe nap-of-earth band", () => {
  const path = createCobraGoldenPath(fakeThree());
  path.update({
    player: playerAt(0, 0, 142),
    objective: { siteId: "site.a", eastM: 0, northM: 3_000 },
    groundHeightAt: FLAT_GROUND,
    nowSeconds: 0,
    arrivedRadiusM: 75,
  });
  assert.equal(path.group.userData.clearanceM, 38,
    "100 m terrain + 42 m eye AGL - 4 m bias keeps the cues above the canopy");
  assert.ok(path.group.userData.clearanceM >= COBRA_GOLDEN_PATH_DEFAULTS.minClearanceM);
  assert.ok(path.group.userData.clearanceM <= COBRA_GOLDEN_PATH_DEFAULTS.maxClearanceM);
  path.dispose();
});

test("opacity reaches zero inside the arrival radius", () => {
  const path = createCobraGoldenPath(fakeThree());
  const material = path.group.children[0].material;

  path.update({
    player: playerAt(0, 0),
    objective: { siteId: "site.a", eastM: 0, northM: 3_000 },
    groundHeightAt: FLAT_GROUND,
    nowSeconds: 4,
    arrivedRadiusM: 400,
  });
  assert.ok(material.uniforms.uOpacity.value > 0, "the path is lit while there is distance to run");

  path.update({
    player: playerAt(0, 2_700),
    objective: { siteId: "site.a", eastM: 0, northM: 3_000 },
    groundHeightAt: FLAT_GROUND,
    nowSeconds: 5,
    arrivedRadiusM: 400,
  });
  assert.equal(material.uniforms.uOpacity.value, 0, "arrived: the cue stops nagging");
  assert.equal(material.opacity, 0);
  assert.equal(path.group.visible, false);
  path.dispose();
});

test("the material never punches a hole in the world", () => {
  const path = createCobraGoldenPath(fakeThree());
  const material = path.group.children[0].material;
  assert.equal(material.blending, "normal",
    "normal alpha avoids the white additive bloom seen in the first visual pass");
  assert.equal(material.depthTest, true);
  assert.equal(material.depthWrite, false);
  assert.equal(material.transparent, true);
  assert.ok(COBRA_GOLDEN_PATH_DEFAULTS.peakOpacity >= 0.75,
    "the route must survive grass and haze instead of disappearing politely");
  assert.ok(COBRA_GOLDEN_PATH_DEFAULTS.peakOpacity < 0.9,
    "the route remains look-through rather than becoming an opaque wall");
  const mesh = path.group.children[0];
  assert.equal(mesh.material.toneMapped, false, "gold stays legible under exposure changes");
  assert.equal(mesh.castShadow, false);
  assert.equal(mesh.receiveShadow, false);
  path.dispose();
});

test("markers cannot form a vertical light pillar", () => {
  assert.equal("markerUprightHeightM" in COBRA_GOLDEN_PATH_DEFAULTS, false,
    "the failed bright end ticks stay deleted");
  assert.equal("markerTickHalfWidthM" in COBRA_GOLDEN_PATH_DEFAULTS, false);
  assert.ok(COBRA_GOLDEN_PATH_DEFAULTS.markerHeightM <= 5,
    "each separated V stays a compact flight-director cue, not a gate or pillar");
});

test("the flow offset is a pure function of nowSeconds", () => {
  assert.equal(cobraGoldenPathFlowOffset(7.5), cobraGoldenPathFlowOffset(7.5));
  assert.notEqual(cobraGoldenPathFlowOffset(0), cobraGoldenPathFlowOffset(1.7));
  for (const seconds of [0, 0.25, 3, 61.4, 9_999]) {
    const offset = cobraGoldenPathFlowOffset(seconds);
    assert.ok(offset >= 0 && offset < 1, `offset ${offset} must wrap into [0,1)`);
  }
  assert.equal(cobraGoldenPathFlowOffset(Number.NaN), 0);
  assert.equal(cobraGoldenPathFlowOffset(4, 1), 0, "whole cycles land back on phase zero");

  // And it reaches the shader.
  const path = createCobraGoldenPath(fakeThree());
  const material = path.group.children[0].material;
  const state = {
    player: playerAt(0, 0),
    objective: { siteId: "site.a", eastM: 0, northM: 3_000 },
    groundHeightAt: FLAT_GROUND,
    nowSeconds: 3.3,
    arrivedRadiusM: 400,
  };
  path.update(state);
  const first = material.uniforms.uFlow.value;
  path.update({ ...state, nowSeconds: 3.3 });
  assert.equal(material.uniforms.uFlow.value, first, "same time in, same offset out");
  path.update({ ...state, nowSeconds: 5.1 });
  assert.notEqual(material.uniforms.uFlow.value, first, "time must move the flow");
  path.dispose();
});

test("the curve is rebuilt only on a real move or a new objective", () => {
  const path = createCobraGoldenPath(fakeThree());
  const objective = { siteId: "site.a", eastM: 0, northM: 5_000 };
  const base = {
    objective,
    groundHeightAt: FLAT_GROUND,
    nowSeconds: 0,
    arrivedRadiusM: 400,
  };

  path.update({ ...base, player: playerAt(0, 0) });
  assert.equal(path.group.userData.rebuildCount, 1);

  // 10 m along track: under the 25 m threshold, so no regeneration.
  path.update({ ...base, player: playerAt(0, 10), nowSeconds: 1 });
  assert.equal(path.group.userData.rebuildCount, 1, "a sub-25 m move must not rebuild the curve");
  // The flow still advanced, so the ribbon is alive even when the geometry is not touched.
  assert.ok(path.group.children[0].material.uniforms.uFlow.value > 0);

  path.update({ ...base, player: playerAt(0, 40), nowSeconds: 2 });
  assert.equal(path.group.userData.rebuildCount, 2, "past 25 m the spine is re-sampled");

  path.update({
    ...base,
    objective: { siteId: "site.b", eastM: 900, northM: 5_000 },
    player: playerAt(0, 40),
    nowSeconds: 3,
  });
  assert.equal(path.group.userData.rebuildCount, 3, "a new objective always rebuilds");
  path.dispose();
});

test("the objective is the same site the tactical map calls the objective", () => {
  const sites = [
    { id: "site.near-friendly", label: "Camp Ember", owner: "friendly", x_m: 100, z_m: 100 },
    { id: "site.far-hostile", label: "The Jaw", owner: "hostile", x_m: 0, z_m: 6_000 },
    { id: "site.near-hostile", label: "Iron Bell", owner: "hostile", x_m: 0, z_m: 1_200 },
  ];
  const player = { eastM: 0, northM: 0, headingRad: 0 };
  const model = cobraTacticalMapModel({
    sites,
    units: [],
    tickets: { friendly: 100, hostile: 100 },
    player,
    bounds: cobraTacticalMapBounds(sites),
    widthPx: 200,
    heightPx: 200,
    showUnits: false,
  });
  const mine = cobraGoldenPathObjective({ sites }, player);
  assert.equal(mine.siteId, model.objective.siteId);
  assert.equal(mine.siteId, "site.far-hostile");

  // No hostile site, no path.
  assert.equal(cobraGoldenPathObjective({ sites: [sites[0]] }, player), null);
  assert.equal(cobraGoldenPathObjective(null, player), null);
});

test("RTB path switches to Camp Ember and stays lit to pad range", () => {
  const groundWar = {
    fob: { x_m: -6_775, z_m: -6_200 },
    sites: [{ id: "site.hostile", owner: "hostile", x_m: 0, z_m: 2_000 }],
  };
  const objective = cobraGoldenPathObjective(groundWar, playerAt(0, 0), "rtb");
  assert.deepEqual(objective, {
    siteId: "camp-ember-rtb",
    eastM: -6_775,
    northM: -6_200,
    mode: "rtb",
  });

  const state = cobraGoldenPathState({
    groundWar,
    pose: { x_m: -6_600, y_m: 160, z_m: -6_200, yaw_rad: 0 },
    groundHeightAt: FLAT_GROUND,
    nowSeconds: 4,
    missionAct: "rtb",
    speedKts: 29,
    sinkFpm: 200,
  });
  assert.equal(state.objective.siteId, "camp-ember-rtb");
  assert.equal(state.arrivedRadiusM, COBRA_GOLDEN_PATH_DEFAULTS.rtbArrivedRadiusM);
  assert.ok(state.arrivedRadiusM < 120, "return guidance remains visible inside the old 400 m cutoff");
  assert.equal(state.recoveryVisual.phase, "flare");
  assert.equal(state.recoveryVisual.alert, true);
});

test("RTB corridor shows approach state by funnel width, colour and pulse", () => {
  const path = createCobraGoldenPath(fakeThree());
  const material = path.group.children[0].material;
  const common = {
    player: playerAt(0, 0, 140),
    objective: { siteId: "ember-route-gate-0", eastM: 0, northM: 900, mode: "route" },
    groundHeightAt: FLAT_GROUND,
    arrivedRadiusM: 75,
  };
  path.update({
    ...common,
    nowSeconds: 0,
    recoveryVisual: { phase: "stabilize", halfWidthM: 14, alert: false, colorHex: 0xffad3d },
  });
  assert.equal(path.group.userData.markerHalfWidthM, 14, "far-final gates read as a broad funnel");
  assert.equal(material.uniforms.uColor.value.hex, 0xffad3d);

  path.update({
    ...common,
    nowSeconds: 0.5,
    recoveryVisual: { phase: "short-final", halfWidthM: 10, alert: true, colorHex: 0xff613f },
  });
  assert.equal(path.group.userData.markerHalfWidthM, 10, "short-final gates visibly tighten");
  assert.equal(material.uniforms.uColor.value.hex, 0xff613f, "unstable energy turns the path coral");
  assert.ok(material.opacity < COBRA_GOLDEN_PATH_DEFAULTS.peakOpacity,
    "an unstable path pulses instead of adding another text panel");
  path.dispose();
});

test("depart and ingress follow the authority's active route gate before the combat objective", () => {
  const state = cobraGoldenPathState({
    groundWar: {
      sites: [{ id: "site.hostile", owner: "hostile", x_m: 4_000, z_m: 6_000 }],
    },
    pathGates: [
      { east_m: 400, north_m: 700, active: false },
      { east_m: 900, north_m: 1_200, active: true },
      { east_m: 1_500, north_m: 2_000, active: false },
    ],
    pose: { x_m: 0, y_m: 120, z_m: 0, yaw_rad: 0 },
    groundHeightAt: FLAT_GROUND,
    nowSeconds: 5,
    missionAct: "ingress",
  });

  assert.deepEqual(state.objective, {
    siteId: "ember-route-gate-1",
    eastM: 900,
    northM: 1_200,
    mode: "route",
    routePoints: [
      { eastM: 900, northM: 1_200 },
      { eastM: 1_500, northM: 2_000 },
    ],
  });
});

test("departure stays on the authority's active leg and uses a tight route arrival radius", () => {
  const state = cobraGoldenPathState({
    groundWar: null,
    pathGates: [
      { east_m: 275, north_m: 0, active: true },
      { east_m: 850, north_m: 1_100, active: false },
    ],
    pose: { x_m: 0, y_m: 120, z_m: 0, yaw_rad: 0 },
    groundHeightAt: FLAT_GROUND,
    nowSeconds: 1,
    missionAct: "depart",
  });

  assert.deepEqual(state.objective, {
    siteId: "ember-route-gate-0",
    eastM: 275,
    northM: 0,
    mode: "depart",
    routePoints: [
      { eastM: 275, northM: 0 },
      { eastM: 850, northM: 1_100 },
    ],
  });
  assert.equal(state.arrivedRadiusM, COBRA_GOLDEN_PATH_DEFAULTS.routeArrivedRadiusM);
  assert.ok(state.arrivedRadiusM < 100,
    "the first 275 m departure leg remains fully readable from the pad");
});

test("departure consumes authority altitude and never draws a descending cue", () => {
  const path = createCobraGoldenPath(fakeThree(), {
    markerCount: 8,
    markerSpacingM: 50,
    maxLengthM: 600,
  });
  path.update({
    player: playerAt(0, 0, 102),
    objective: {
      siteId: "ember-route-gate-0",
      eastM: 160,
      northM: 0,
      upM: 145,
      mode: "depart",
      routePoints: [
        { eastM: 160, northM: 0, upM: 145 },
        { eastM: 320, northM: 120, upM: 168 },
      ],
    },
    groundHeightAt: () => 100,
    nowSeconds: 0,
    arrivedRadiusM: 24,
  });
  const positions = path.group.children[0].geometry.attributes.position.array;
  const apexHeights = [];
  for (let marker = 0; marker < path.group.userData.activeMarkerCount; marker += 1)
    apexHeights.push(positions[(marker * 8 + 3) * 3 + 1]);
  for (let index = 1; index < apexHeights.length; index += 1)
    assert.ok(apexHeights[index] >= apexHeights[index - 1] - 1e-6);
  assert.ok(Math.min(...apexHeights) >= 142,
    "departure cue stays at least 42 m above the sampled forest");
});

test("short legs use a readable handful of cues instead of compressing into a stack", () => {
  const path = createCobraGoldenPath(fakeThree());
  path.update({
    player: playerAt(0, 0, 120),
    objective: { siteId: "ember-route-gate-0", eastM: 275, northM: 0, mode: "route" },
    groundHeightAt: FLAT_GROUND,
    nowSeconds: 0,
    arrivedRadiusM: 75,
  });
  assert.equal(path.group.userData.activeMarkerCount, 5);
  const positions = path.group.children[0].geometry.attributes.position.array;
  const hiddenStart = path.group.userData.activeMarkerCount * 8 * 3;
  for (let index = hiddenStart + 3; index < positions.length; index += 3) {
    assert.equal(positions[index], positions[hiddenStart], "unused cue vertices are degenerate");
    assert.equal(positions[index + 1], positions[hiddenStart + 1]);
    assert.equal(positions[index + 2], positions[hiddenStart + 2]);
  }
  path.dispose();
});

test("Cobra corridor previews bends through upcoming authority gates", () => {
  const path = createCobraGoldenPath(fakeThree(), {
    markerCount: 8,
    markerSpacingM: 100,
    maxLengthM: 900,
  });
  path.update({
    player: playerAt(0, 0, 140),
    objective: {
      siteId: "ember-route-gate-0",
      eastM: 0,
      northM: 350,
      mode: "route",
      routePoints: [
        { eastM: 0, northM: 350 },
        { eastM: 450, northM: 350 },
        { eastM: 650, northM: 700 },
      ],
    },
    groundHeightAt: FLAT_GROUND,
    nowSeconds: 0,
    arrivedRadiusM: 75,
  });
  const vertices = ribbonVertices(path);
  assert.ok(vertices.some((vertex) => vertex.northM > 300 && vertex.eastM > 100),
    "future chevrons must turn onto the next published leg");
  assert.ok(path.group.userData.routePointCount >= 2);
  path.dispose();
});

test("depart and ingress hide instead of failing open to an enemy when route truth is unusable", () => {
  const common = {
    groundWar: {
      sites: [{ id: "site.hostile", owner: "hostile", x_m: 1_000, z_m: 1_000 }],
    },
    pose: { x_m: 0, y_m: 120, z_m: 0, yaw_rad: 0 },
    groundHeightAt: FLAT_GROUND,
    nowSeconds: 1,
  };
  assert.equal(cobraGoldenPathState({
    ...common,
    missionAct: "depart",
    pathGates: [],
  }).objective, null);
  assert.equal(cobraGoldenPathState({
    ...common,
    missionAct: "ingress",
    pathGates: [{ east_m: Number.NaN, north_m: 50, active: true }],
  }).objective, null);
});

test("production wiring passes authority path gates into the Cobra corridor", async () => {
  const source = await readFile(
    new URL("../../../cobra-lab/main.js", import.meta.url),
    "utf8",
  );
  const call = source.match(/goldenPath\?\.update\(cobraGoldenPathState\(\{([\s\S]*?)\}\)\);/u)?.[1] ?? "";
  assert.match(call, /pathGates:\s*authorityState\?\.path_gates/u);
  assert.match(call, /speedKts:/u);
  assert.match(call, /sinkFpm:/u);
});

test("frame state hides the path on the tour and parked cameras", () => {
  const groundWar = {
    sites: [{ id: "site.hostile", owner: "hostile", x_m: 0, z_m: 2_000 }],
  };
  const pose = { x_m: 0, y_m: 220, z_m: 0, yaw_rad: 0.4 };

  const flying = cobraGoldenPathState({
    groundWar,
    pose,
    groundHeightAt: FLAT_GROUND,
    nowSeconds: 8,
  });
  assert.equal(flying.objective.siteId, "site.hostile");
  assert.equal(flying.player.eastM, 0);
  assert.equal(flying.player.northM, 0);
  assert.equal(flying.player.altitudeM, 220);
  assert.equal(flying.nowSeconds, 8);
  assert.equal(flying.arrivedRadiusM, COBRA_GOLDEN_PATH_DEFAULTS.arrivedRadiusM);

  const onRails = cobraGoldenPathState({
    groundWar,
    pose,
    groundHeightAt: FLAT_GROUND,
    nowSeconds: 8,
    suppressed: true,
  });
  assert.equal(onRails.objective, null, "tour and parked review cameras get no guidance ribbon");

  const noPose = cobraGoldenPathState({
    groundWar,
    pose: null,
    groundHeightAt: FLAT_GROUND,
    nowSeconds: 8,
  });
  assert.equal(noPose.objective, null);
});

test("open chevrons are one mesh, one material, and a small triangle count", () => {
  const path = createCobraGoldenPath(fakeThree());
  assert.equal(path.group.children.length, 1);
  assert.equal(path.group.userData.style, "open-chevrons");
  assert.equal(path.group.userData.markerCount, COBRA_GOLDEN_PATH_DEFAULTS.markerCount);
  const mesh = path.group.children[0];
  const triangles = mesh.geometry.index.array.length / 3;
  assert.ok(triangles <= 128, `${triangles} triangles must stay a rounding error in the budget`);
  assert.equal(mesh.geometry.attributes.position.array.length / 3,
    COBRA_GOLDEN_PATH_DEFAULTS.markerCount * 8);

  path.dispose();
  assert.equal(mesh.geometry.disposed, true);
  assert.equal(mesh.material.disposed, true);
  assert.equal(path.group.children.length, 0);
});
