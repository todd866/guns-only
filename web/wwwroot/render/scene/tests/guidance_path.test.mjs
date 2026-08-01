import test from "node:test";
import assert from "node:assert/strict";
import {
  createGuidancePath,
  gateToScenePosition,
  GUIDANCE_PATH_DEFAULTS,
} from "../guidance_path.js";

// Minimal THREE stand-in: the module must not need a GL context to be testable.
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  add(v) { return this.set(this.x + v.x, this.y + v.y, this.z + v.z); }
  sub(v) { return this.set(this.x - v.x, this.y - v.y, this.z - v.z); }
  negate() { return this.set(-this.x, -this.y, -this.z); }
  lengthSq() { return this.x ** 2 + this.y ** 2 + this.z ** 2; }
  normalize() {
    const l = Math.sqrt(this.lengthSq()) || 1;
    return this.set(this.x / l, this.y / l, this.z / l);
  }
  setScalar(v) { return this.set(v, v, v); }
}
const THREE = {
  Group: class { constructor() { this.children = []; } add(o) { this.children.push(o); }
    removeFromParent() {} },
  Mesh: class {
    constructor(g, m) {
      this.geometry = g; this.material = m; this.visible = false;
      this.position = new V3(); this.scale = new V3(1, 1, 1);
      this.lookAtTarget = null;
    }
    lookAt(v) { this.lookAtTarget = new V3(v.x, v.y, v.z); }
  },
  PlaneGeometry: class { dispose() {} },
  ShaderMaterial: class {
    constructor(o) { Object.assign(this, o); }
    dispose() {}
  },
  Color: class { constructor(c) { this.value = c; } set(c) { this.value = c; return this; } },
  Vector3: V3,
  AdditiveBlending: "additive",
  DoubleSide: "double",
};

const gatesJson = JSON.stringify([
  { id: "a", label: "A", east_m: 100, north_m: 200, up_m: 300, half_m: 400,
    target_ktas: 250, dirty: false, active: false },
  { id: "b", label: "B", east_m: 500, north_m: 600, up_m: 700, half_m: 800,
    target_ktas: 200, dirty: true, active: true },
]);

test("world north maps to scene -Z, matching the player transform", () => {
  const p = gateToScenePosition({ eastM: 100, northM: 200, upM: 300 });
  assert.deepEqual(p, { x: 100, y: 300, z: -200 });
});

test("the ladder is drawn, one soft volume per gate, scaled to authored tolerance", () => {
  const path = createGuidancePath(THREE);
  const drawn = path.update({ recovery_gates_json: gatesJson });
  assert.equal(drawn, 2, "both gates must be drawn");
  assert.equal(path.object3d.visible, true);

  const meshes = path.object3d.children.filter((m) => m.visible);
  assert.equal(meshes.length, 2);
  // Scale is the authored half-width, so the volume thins out exactly at the kernel's tolerance
  // rather than at some tighter line invented by the renderer.
  assert.equal(meshes[0].scale.x, 400);
  assert.equal(meshes[1].scale.x, 800);
  assert.equal(meshes[0].position.z, -200, "north must be negated into the scene");
});

test("guidance never occludes: additive, depth-tested, never depth-writing, well under opaque", () => {
  const path = createGuidancePath(THREE);
  path.update({ recovery_gates_json: gatesJson });
  const material = path.object3d.children[0].material;
  assert.equal(material.depthWrite, false, "guidance must never write depth");
  assert.equal(material.depthTest, true, "a gate behind a hill stays behind that hill");
  assert.equal(material.blending, "additive", "it must lighten the world, not cover it");
  assert.ok(GUIDANCE_PATH_DEFAULTS.gateOpacity <= 0.25,
    "the pilot has to be able to see past it and disagree");
  assert.ok(GUIDANCE_PATH_DEFAULTS.activeOpacity <= 0.45);
});

test("the whole ladder shares one shader program, so boot does not stutter", () => {
  const seen = new Set();
  const counting = {
    ...THREE,
    ShaderMaterial: class extends THREE.ShaderMaterial {
      constructor(o) { super(o); seen.add(this); }
    },
  };
  const path = createGuidancePath(counting);
  path.update({ recovery_gates_json: gatesJson });
  // 24 materials meant 24 program compilations in the first frames after boot. One material is
  // one compile; per-gate colour rides in as a uniform at draw time.
  assert.equal(seen.size, 1,
    `guidance must compile one shader program, not ${seen.size}`);
  const meshes = path.object3d.children;
  assert.equal(new Set(meshes.map((m) => m.material)).size, 1,
    "every gate must share the one material instance");
});

test("no recovery procedure means nothing is drawn at all", () => {
  const path = createGuidancePath(THREE);
  assert.equal(path.update({}), 0);
  assert.equal(path.object3d.visible, false);
});
