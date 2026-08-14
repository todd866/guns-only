import test from "node:test";
import assert from "node:assert/strict";
import {
  COBRA_GROUND_WAR_COLORS,
  COBRA_GROUND_WAR_PRESENTATION_SCHEMA,
  COBRA_TARGET_DESIGNATION_PROFILE,
  createCobraGroundWarPresentation,
} from "../cobra_ground_war.js";

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
      this.scale = { setScalar(value) { this.value = value; } };
      this.rotation = { x: 0, y: 0, z: 0 };
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
    removeFromParent() {
      this.parent?.remove(this);
    }
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
  class Line extends Mesh {}
  class LineSegments extends Mesh {}
  class BoxGeometry {
    dispose() {}
  }
  class CylinderGeometry {
    dispose() {}
  }
  class SphereGeometry {
    dispose() {}
  }
  class RingGeometry {
    constructor(...args) { this.args = args; }
    dispose() {}
  }
  class OctahedronGeometry {
    constructor(...args) { this.args = args; }
    dispose() {}
  }
  class BufferGeometry {
    constructor() { this.attributes = {}; }
    setAttribute(name, attribute) { this.attributes[name] = attribute; }
    dispose() {}
  }
  class BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
    }
  }
  class MeshStandardMaterial {
    constructor(params = {}) {
      Object.assign(this, params);
      this.color = new Color(params.color ?? 0xffffff);
      this.emissive = new Color(params.emissive ?? 0x000000);
    }
    dispose() {}
  }
  class MeshBasicMaterial extends MeshStandardMaterial {}
  class LineBasicMaterial extends MeshStandardMaterial {}
  return {
    Group,
    Mesh,
    Line,
    LineSegments,
    BoxGeometry,
    CylinderGeometry,
    SphereGeometry,
    RingGeometry,
    OctahedronGeometry,
    BufferGeometry,
    BufferAttribute,
    MeshStandardMaterial,
    MeshBasicMaterial,
    LineBasicMaterial,
    DoubleSide: "double-side",
  };
}

const EMPTY_GROUND_WAR = Object.freeze({ sites: [], units: [], events: [] });

function threatBurst(overrides = {}) {
  return {
    sequence: 7,
    observer_id: "observer.cobra.dshk.iron-bell.v1",
    source_x_m: 120,
    source_y_m: 104,
    source_z_m: -260,
    target_x_m: 170,
    target_y_m: 134,
    target_z_m: -30,
    impact_x_m: 188,
    impact_y_m: 128,
    impact_z_m: -18,
    fired_at_s: 8,
    impact_at_s: 10.4,
    will_hit: false,
    subsystem: "none",
    has_impacted: false,
    ...overrides,
  };
}

function battleDamageWith(...bursts) {
  return {
    threat_tracking: true,
    receiving_fire: bursts.some((burst) => !burst.has_impacted),
    recent_bursts: bursts,
  };
}

function namedThreatEffects(presentation, prefix = "COBRA_THREAT_") {
  const effectRoot = findByName(presentation.group, "COBRA_GROUND_WAR_EFFECTS");
  return effectRoot.children.filter((effect) => String(effect.name ?? "").startsWith(prefix));
}

test("ground war presentation schema and sync create faction markers from snapshot", () => {
  const presentation = createCobraGroundWarPresentation(fakeThree());
  assert.equal(presentation.group.userData.schema, COBRA_GROUND_WAR_PRESENTATION_SCHEMA);

  presentation.sync({
    control: 0.2,
    sites: [{
      id: "site.iron-bell-bridge.v1",
      landmark_id: "landmark.cobra-canyon.iron-bell-bridge.v1",
      label: "Iron Bell Bridge",
      local_control: 0.4,
      x_m: 0,
      y_m: 100,
      z_m: 0,
      capture_radius_m: 220,
    }],
    units: [{
      id: "ground.hostile.infantryclump.001",
      faction: "hostile",
      role: "infantry",
      alive: true,
      health: 40,
      max_health: 40,
      x_m: 10,
      y_m: 101,
      z_m: -20,
      home_site_id: "site.iron-bell-bridge.v1",
    }, {
      id: "ground.friendly.softvehicle.002",
      faction: "friendly",
      role: "soft-vehicle",
      alive: true,
      health: 80,
      max_health: 90,
      x_m: -12,
      y_m: 101,
      z_m: 8,
      home_site_id: "site.iron-bell-bridge.v1",
    }],
    events: [{
      kind: "gun-kill",
      faction: "hostile",
      x_m: 10,
      y_m: 101,
      z_m: -20,
    }],
  });

  const unitRoot = presentation.group.children.find((child) => child.name === "COBRA_GROUND_WAR_UNITS");
  const siteRoot = presentation.group.children.find((child) => child.name === "COBRA_GROUND_WAR_SITES");
  assert.equal(unitRoot.children.length, 2);
  assert.equal(siteRoot.children.length, 1);
  presentation.dispose();
  assert.equal(unitRoot.children.length, 0);
});

function findByName(root, name) {
  if (root.name === name) return root;
  for (const child of root.children ?? []) {
    const found = findByName(child, name);
    if (found) return found;
  }
  return null;
}

test("selection marker tracks the selected unit and clears when unselected", () => {
  const presentation = createCobraGroundWarPresentation(fakeThree());
  const war = {
    control: 0,
    sites: [],
    events: [],
    units: [{
      id: "ground.hostile.infantryclump.001",
      faction: "hostile",
      role: "infantry",
      alive: true,
      health: 40,
      max_health: 40,
      x_m: 10,
      y_m: 101,
      z_m: -20,
      home_site_id: "site.iron-bell-bridge.v1",
    }],
  };

  presentation.sync(war, "ground.hostile.infantryclump.001");
  const selection = findByName(presentation.group, "COBRA_GROUND_WAR_SELECTION");
  assert.ok(selection, "selection marker exists");
  assert.equal(selection.visible, true);
  assert.equal(selection.position.x, 10);
  assert.equal(selection.position.z, 20);

  presentation.sync(war, null);
  assert.equal(selection.visible, false);

  presentation.sync(war, "ground.hostile.infantryclump.999");
  assert.equal(selection.visible, false);
  presentation.dispose();
});

test("selected target designation clears vegetation instead of painting a filled terrain puck", () => {
  const presentation = createCobraGroundWarPresentation(fakeThree());
  const selected = {
    id: "ground.hostile.garrison.001",
    faction: "hostile",
    role: "hard-point",
    alive: true,
    health: 140,
    max_health: 140,
    x_m: 80,
    y_m: 116,
    z_m: -240,
  };

  presentation.sync({ sites: [], events: [], units: [selected] }, selected.id);

  const designation = findByName(presentation.group, "COBRA_GROUND_WAR_SELECTION");
  const groundRing = findByName(designation, "COBRA_TARGET_GROUND_RING");
  const beaconStem = findByName(designation, "COBRA_TARGET_BEACON_STEM");
  const beacon = findByName(designation, "COBRA_TARGET_BEACON");
  assert.ok(groundRing && beaconStem && beacon, "designation needs ring, leader, and airborne mark");
  assert.equal(groundRing.geometry.constructor.name, "RingGeometry",
    "terrain cue must remain an open ring rather than an opaque cylinder");
  assert.deepEqual(groundRing.geometry.args.slice(0, 2), [
    COBRA_TARGET_DESIGNATION_PROFILE.ringInnerRadiusM,
    COBRA_TARGET_DESIGNATION_PROFILE.ringOuterRadiusM,
  ]);
  assert.equal(groundRing.material.depthWrite, false,
    "transparent ring must not punch a depth plate into the ground");
  assert.equal(beacon.position.y, COBRA_TARGET_DESIGNATION_PROFILE.beaconHeightM);
  assert.equal(beacon.material.depthTest, true,
    "designation may clear grass but must still disappear behind terrain");
  assert.equal(beacon.material.toneMapped, false,
    "gold identification colour must survive the monsoon scene grade");
  assert.equal(designation.position.x, selected.x_m);
  assert.equal(designation.position.y, selected.y_m + COBRA_TARGET_DESIGNATION_PROFILE.groundOffsetM);
  assert.equal(designation.position.z, -selected.z_m);

  presentation.sync({ sites: [], events: [], units: [selected] }, null);
  assert.equal(designation.visible, false);
  presentation.dispose();
});

test("hostiles use hotter paint and role-distinct silhouettes", () => {
  assert.ok(COBRA_GROUND_WAR_COLORS.hostile > 0xe00000,
    "hostile red must stay hot enough to read under monsoon haze");
  const presentation = createCobraGroundWarPresentation(fakeThree());
  presentation.sync({
    control: -0.4,
    sites: [],
    events: [],
    units: [{
      id: "u.hostile.inf",
      faction: "hostile",
      role: "infantry",
      alive: true,
      health: 40,
      max_health: 40,
      x_m: 0,
      y_m: 100,
      z_m: 0,
    }, {
      id: "u.hostile.truck",
      faction: "hostile",
      role: "soft-vehicle",
      alive: true,
      health: 80,
      max_health: 80,
      x_m: 20,
      y_m: 100,
      z_m: 0,
    }, {
      id: "u.hostile.gun",
      faction: "hostile",
      role: "hard-point",
      alive: true,
      health: 60,
      max_health: 60,
      x_m: -20,
      y_m: 100,
      z_m: 0,
    }, {
      id: "observer.ridge-east.v1",
      faction: "hostile",
      role: "dshk-site",
      alive: true,
      health: 105,
      max_health: 105,
      x_m: 40,
      y_m: 103,
      z_m: 0,
    }],
  });

  const unitRoot = presentation.group.children.find((child) => child.name === "COBRA_GROUND_WAR_UNITS");
  const infantry = unitRoot.children.find((mesh) => mesh.name.includes("u.hostile.inf"));
  const truck = unitRoot.children.find((mesh) => mesh.name.includes("u.hostile.truck"));
  const gun = unitRoot.children.find((mesh) => mesh.name.includes("u.hostile.gun"));
  const dshk = unitRoot.children.find((mesh) => mesh.name.includes("observer.ridge-east"));
  assert.ok(infantry && truck && gun && dshk);

  assert.equal(infantry.userData.role, "infantry");
  assert.equal(truck.userData.role, "soft-vehicle");
  assert.equal(gun.userData.role, "hard-point");
  assert.equal(dshk.userData.role, "dshk-site");
  assert.ok(infantry.children.length >= 6, "infantry needs bodies+heads");
  assert.ok(truck.children.length >= 3, "soft-vehicle needs cab/bed/tarp");
  assert.ok(gun.children.length >= 3, "hard-point needs pit/shield/barrel");
  assert.ok(dshk.children.length >= 6, "DShK needs tripod/shield/receiver/barrel");

  for (const unit of [infantry, truck, gun, dshk]) {
    assert.ok(unit.children.every((mesh) => mesh.castShadow === true),
      `${unit.userData.role} leaf meshes must cast contact shadows`);
    assert.ok(unit.children.every((mesh) => mesh.receiveShadow === true),
      `${unit.userData.role} leaf meshes must receive world shadows`);
  }

  // Material lives on leaf meshes after applyUnitMaterial.
  const hostileMat = infantry.children[0].material;
  assert.equal(hostileMat.color.hex, COBRA_GROUND_WAR_COLORS.hostile);
  assert.equal(hostileMat.emissive.hex, COBRA_GROUND_WAR_COLORS.hostileEmissive);
  presentation.dispose();
});

test("Camp Ember FOB site never gets the translucent control disc", () => {
  const presentation = createCobraGroundWarPresentation(fakeThree());
  presentation.sync({
    control: 0.5,
    sites: [{
      id: "site.camp-ember.v1",
      landmark_id: "landmark.cobra-canyon.camp-ember.v1",
      label: "Camp Ember",
      local_control: 0.9,
      x_m: -6775,
      y_m: 218,
      z_m: -6200,
      capture_radius_m: 120,
    }, {
      id: "site.iron-bell-bridge.v1",
      landmark_id: "landmark.cobra-canyon.iron-bell-bridge.v1",
      label: "Iron Bell Bridge",
      local_control: 0.1,
      x_m: 0,
      y_m: 100,
      z_m: 0,
      capture_radius_m: 220,
    }],
    units: [],
  });
  const siteRoot = presentation.group.children.find((child) => child.name === "COBRA_GROUND_WAR_SITES");
  assert.ok(siteRoot);
  assert.equal(
    siteRoot.children.some((mesh) => String(mesh.name).includes("camp-ember")),
    false,
  );
  assert.equal(
    siteRoot.children.some((mesh) => String(mesh.name).includes("iron-bell")),
    true,
  );
  presentation.dispose();
});

test("tracking authority alone produces no ground-fire visual", () => {
  const presentation = createCobraGroundWarPresentation(fakeThree());
  presentation.sync(EMPTY_GROUND_WAR, null, {
    threat_tracking: true,
    receiving_fire: false,
    tracking_observers: 3,
    acquisition_progress: 0.96,
    seconds_to_next_impact: 0.2,
    recent_bursts: [],
  });

  assert.deepEqual(namedThreatEffects(presentation), [],
    "tracking, acquisition and private timing must never become browser VFX");
  presentation.dispose();
});

test("a new authority burst draws one occludable muzzle flash and warm dashed tracer", () => {
  const presentation = createCobraGroundWarPresentation(fakeThree());
  const burst = threatBurst();
  const damage = battleDamageWith(burst);

  presentation.sync(EMPTY_GROUND_WAR, null, damage);
  const muzzle = namedThreatEffects(presentation, "COBRA_THREAT_MUZZLE_FLASH_");
  const tracers = namedThreatEffects(presentation, "COBRA_THREAT_TRACER_");
  assert.equal(muzzle.length, 1);
  assert.equal(tracers.length, 1);
  assert.deepEqual(
    { x: muzzle[0].position.x, y: muzzle[0].position.y, z: muzzle[0].position.z },
    { x: burst.source_x_m, y: burst.source_y_m, z: -burst.source_z_m },
    "muzzle flash must use the authority-authored observer position",
  );
  assert.deepEqual(tracers[0].userData.source,
    { x: burst.source_x_m, y: burst.source_y_m, z: -burst.source_z_m });
  assert.deepEqual(tracers[0].userData.aim,
    { x: burst.impact_x_m, y: burst.impact_y_m, z: -burst.impact_z_m });
  const tracerPositions = tracers[0].geometry.attributes.position.array;
  assert.ok(tracerPositions.length > 6,
    "burst must read as separated tracer dashes, not a continuous laser");
  assert.deepEqual(Array.from(tracerPositions.slice(0, 3)),
    [burst.source_x_m, burst.source_y_m, -burst.source_z_m]);
  assert.deepEqual(Array.from(tracerPositions.slice(-3)),
    [burst.impact_x_m, burst.impact_y_m, -burst.impact_z_m]);
  for (const effect of [...muzzle, ...tracers]) {
    assert.equal(effect.material.depthTest, true, "ground fire must disappear behind terrain");
    assert.equal(effect.material.depthWrite, false, "transient fire must not write an x-ray depth seam");
    assert.equal(effect.material.toneMapped, false, "warm burst color must survive scene grading");
  }

  presentation.sync(EMPTY_GROUND_WAR, null, damage);
  assert.equal(namedThreatEffects(presentation, "COBRA_THREAT_MUZZLE_FLASH_").length, 1,
    "repeated snapshots must not replay a burst");
  assert.equal(namedThreatEffects(presentation, "COBRA_THREAT_TRACER_").length, 1,
    "repeated snapshots must not duplicate a tracer");
  presentation.dispose();
});

test("hit sparks require a pending burst to transition to an authoritative impacted hit", () => {
  const presentation = createCobraGroundWarPresentation(fakeThree());
  const pending = threatBurst({ sequence: 12, will_hit: true, has_impacted: false });
  presentation.sync(EMPTY_GROUND_WAR, null, battleDamageWith(pending));
  assert.equal(namedThreatEffects(presentation, "COBRA_THREAT_HIT_SPARKS_").length, 0,
    "a pending will_hit field is not a final verdict and must not leak");

  const miss = { ...pending, will_hit: false, has_impacted: true };
  presentation.sync(EMPTY_GROUND_WAR, null, battleDamageWith(miss));
  assert.equal(namedThreatEffects(presentation, "COBRA_THREAT_HIT_SPARKS_").length, 0,
    "an authoritative miss must not spark on the aircraft");

  const nextPending = threatBurst({ sequence: 13, will_hit: false, has_impacted: false });
  presentation.sync(EMPTY_GROUND_WAR, null, battleDamageWith(miss, nextPending));
  const hit = { ...nextPending, will_hit: true, has_impacted: true, subsystem: "scas" };
  presentation.sync(EMPTY_GROUND_WAR, null, battleDamageWith(miss, hit));
  const sparks = namedThreatEffects(presentation, "COBRA_THREAT_HIT_SPARKS_");
  assert.equal(sparks.length, 1);
  assert.equal(sparks[0].name, "COBRA_THREAT_HIT_SPARKS_13");
  assert.equal(sparks[0].material.depthTest, true);
  assert.equal(sparks[0].material.depthWrite, false);
  assert.equal(sparks[0].material.toneMapped, false);

  presentation.sync(EMPTY_GROUND_WAR, null, battleDamageWith(miss, hit));
  assert.equal(namedThreatEffects(presentation, "COBRA_THREAT_HIT_SPARKS_").length, 1,
    "repeated impacted snapshots must not replay sparks");
  presentation.dispose();
});

test("null authority clears threat effects and event memory for a fresh route", () => {
  const presentation = createCobraGroundWarPresentation(fakeThree());
  const burst = threatBurst({ sequence: 1 });
  presentation.sync(EMPTY_GROUND_WAR, null, battleDamageWith(burst));
  assert.equal(namedThreatEffects(presentation).length, 2);

  presentation.sync(null, null, null);
  assert.equal(namedThreatEffects(presentation).length, 0,
    "old-route flashes and tracers must not survive authority reset");

  presentation.sync(EMPTY_GROUND_WAR, null, battleDamageWith(burst));
  assert.equal(namedThreatEffects(presentation).length, 2,
    "a restarted sequence must be eligible to present once again");
  presentation.dispose();
});

test("joining after an already-impacted burst never invents a fresh hit transition", () => {
  const presentation = createCobraGroundWarPresentation(fakeThree());
  presentation.sync(EMPTY_GROUND_WAR, null, battleDamageWith(threatBurst({
    sequence: 31,
    will_hit: true,
    has_impacted: true,
    subsystem: "engine",
  })));
  assert.deepEqual(namedThreatEffects(presentation), [],
    "a retained event must not replay old fire or invent a new impact");
  presentation.dispose();
});
