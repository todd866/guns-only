import test from "node:test";
import assert from "node:assert/strict";
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

test("the ribbon points at the objective and its drawn length is capped", () => {
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
  assert.ok(spineStartNorthM > 50, "the ribbon starts ahead of the ship");
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
      vertex.upM >= groundM + COBRA_GOLDEN_PATH_DEFAULTS.clearanceM - 0.05,
      `vertex at north ${vertex.northM} sits ${vertex.upM - groundM} m over ${groundM} m ground`,
    );
  }
  assert.ok(sawRidge, "the fixture must actually put a ridge under the path");
  path.dispose();
});

test("clearance stays in the comfortable 60-90 m flying band", () => {
  assert.ok(COBRA_GOLDEN_PATH_DEFAULTS.clearanceM >= 60);
  assert.ok(COBRA_GOLDEN_PATH_DEFAULTS.clearanceM <= 90);
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
  assert.equal(material.blending, "additive");
  assert.equal(material.depthTest, true);
  assert.equal(material.depthWrite, false);
  assert.equal(material.transparent, true);
  assert.ok(
    COBRA_GOLDEN_PATH_DEFAULTS.peakOpacity <= 0.25,
    "subtle sunlit mist, not a neon quest marker",
  );
  const mesh = path.group.children[0];
  assert.equal(mesh.castShadow, false);
  assert.equal(mesh.receiveShadow, false);
  path.dispose();
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
  assert.equal(mine.siteId, "site.near-hostile");

  // No hostile site, no path.
  assert.equal(cobraGoldenPathObjective({ sites: [sites[0]] }, player), null);
  assert.equal(cobraGoldenPathObjective(null, player), null);
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

test("the ribbon is one mesh, one material, and a small triangle count", () => {
  const path = createCobraGoldenPath(fakeThree());
  assert.equal(path.group.children.length, 1);
  const mesh = path.group.children[0];
  const triangles = mesh.geometry.index.array.length / 3;
  assert.ok(triangles <= 256, `${triangles} triangles must stay a rounding error in the budget`);
  assert.equal(mesh.geometry.attributes.position.array.length / 3, (COBRA_GOLDEN_PATH_DEFAULTS.segments + 1) * 4);

  path.dispose();
  assert.equal(mesh.geometry.disposed, true);
  assert.equal(mesh.material.disposed, true);
  assert.equal(path.group.children.length, 0);
});
