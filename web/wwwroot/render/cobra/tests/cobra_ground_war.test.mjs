import test from "node:test";
import assert from "node:assert/strict";
import {
  COBRA_BATTLEFIELD_PRESENTATION_PROFILE,
  COBRA_GROUND_WAR_COLORS,
  COBRA_GROUND_WAR_PRESENTATION_SCHEMA,
  COBRA_TARGET_DESIGNATION_PROFILE,
  cobraThreatTracerBurstPlan,
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

test("units use physical body paint, hot faction cues, and role-distinct silhouettes", () => {
  assert.ok(COBRA_GROUND_WAR_COLORS.hostileCue > 0xe00000,
    "the hostile cue must stay hot enough to read under monsoon haze");
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
  assert.notEqual(hostileMat.color.hex, COBRA_GROUND_WAR_COLORS.hostileCue,
    "literal troops should use physical earth paint instead of toy-red whole bodies");
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
  const bridgeSite = findByName(presentation.group,
    "GROUND_SITE_site.iron-bell-bridge.v1");
  assert.equal(findByName(bridgeSite,
    "GROUND_SITE_CONTROL_RING_site.iron-bell-bridge.v1")?.geometry?.constructor?.name,
  "RingGeometry",
  "a control point should be an open ground-contact ring, not a filled gameplay puck");
  presentation.dispose();
});

test("ground battle tracers travel from an authoritative shooter to its authoritative opponent", () => {
  const presentation = createCobraGroundWarPresentation(fakeThree());
  const event = {
    tick: 42,
    kind: "small-arms",
    unit_id: "ground.friendly.infantry.001",
    site_id: "site.iron-bell-bridge.v1",
    faction: "friendly",
    x_m: 10,
    y_m: 100,
    z_m: -20,
    target_x_m: 70,
    target_y_m: 103,
    target_z_m: 35,
  };
  const war = { sites: [], units: [], events: [event] };

  presentation.sync(war);
  presentation.sync(war);
  const tracer = findByName(presentation.group,
    "COBRA_BATTLE_TRACER_42_ground.friendly.infantry.001");
  assert.ok(tracer);
  assert.deepEqual(tracer.userData.source, { x: 10, y: 101.25, z: 20 });
  assert.deepEqual(tracer.userData.target, { x: 70, y: 104, z: -35 });
  assert.equal(
    tracer.geometry.attributes.position.array.length,
    COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundTracerDashCount
      * COBRA_BATTLEFIELD_PRESENTATION_PROFILE.tracerVerticesPerDash * 3,
    "rifle fire must read as thick crossed ribbons across the actual engagement",
  );
  assert.ok(tracer.userData.ribbonWidthM >= 0.5,
    "the tracer must not collapse to a hardware-limited one-pixel line");
  assert.equal(
    tracer.userData.ribbonWidthM,
    COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundTracerGlowWidthM,
  );
  assert.ok(tracer.userData.burstLengthM >= 8,
    "the exact exchange needs enough luminous persistence to read from the cockpit");
  const tracerCore = findByName(presentation.group,
    "COBRA_BATTLE_CORE_TRACER_42_ground.friendly.infantry.001");
  assert.ok(tracerCore, "a bright core must ride inside the broad translucent tracer sheath");
  assert.equal(tracerCore.material.color.hex, 0xe3ffb0,
    "friendly fire keeps a pale green-white core instead of becoming a neutral road reflector");
  assert.ok(tracerCore.userData.ribbonWidthM < tracer.userData.ribbonWidthM);
  assert.equal(
    tracerCore.userData.ribbonWidthM,
    COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundTracerCoreWidthM,
  );
  assert.ok(findByName(presentation.group,
    "COBRA_BATTLE_MUZZLE_FLASH_42_ground.friendly.infantry.001"),
  "an authoritative small-arms event must light its exact shooter position");
  const rifleSmoke = findByName(presentation.group, "COBRA_BATTLE_MUZZLE_SMOKE_42_0");
  assert.ok(rifleSmoke,
    "an exact firing event should read as flash plus powder smoke, not a floating orange ball");
  assert.ok(rifleSmoke.position.y <= 1,
    "rifle powder should hug the muzzle instead of becoming a tall beige chimney");
  assert.equal(findByName(presentation.group, "COBRA_BATTLE_MUZZLE_SMOKE_42_1"), null,
    "rifle fire should use one low puff; multi-lobe smoke is reserved for heavy weapons");
  const effectRoot = findByName(presentation.group, "COBRA_GROUND_WAR_EFFECTS");
  assert.equal(effectRoot.children.filter((child) => child.name === tracer.name).length, 1,
    "a retained event snapshot must not replay the same burst");
  presentation.dispose();
});

test("friendly air-mobile insertion paints a persistent landing-zone smoke cue once", () => {
  const presentation = createCobraGroundWarPresentation(fakeThree());
  const event = {
    tick: 77,
    kind: "air-mobile-insertion",
    site_id: "site.red-earth-quarry.v1",
    faction: "friendly",
    x_m: 300,
    y_m: 120,
    z_m: -450,
  };
  presentation.sync({ sites: [], units: [], events: [event] });
  presentation.sync({ sites: [], units: [], events: [event] });
  const smoke = findByName(presentation.group, "COBRA_LIFT_INSERTION_SMOKE_77");
  assert.ok(smoke, "the player needs to see where the supported squad just landed");
  assert.equal(smoke.material.color.hex, COBRA_GROUND_WAR_COLORS.insertionSmoke);
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

test("DShK packet plan leaves kilometer-range authority rails visually empty", () => {
  const rangeM = 4_000;
  const packet = cobraThreatTracerBurstPlan(rangeM);
  const profile = COBRA_BATTLEFIELD_PRESENTATION_PROFILE;
  const nominalPacketLengthM = profile.threatTracerDashCount
    * profile.threatTracerNominalDashLengthM
    + (profile.threatTracerDashCount - 1) * profile.threatTracerNominalGapM;
  assert.equal(packet.dashLayout.length, profile.threatTracerDashCount);
  assert.ok(Math.abs(packet.packetLengthM - nominalPacketLengthM) < 1e-9);
  assert.ok(packet.packetLengthM < 100,
    "a four-kilometre shot should show tens of metres of tracer, not kilometres of ribbon");
  assert.ok(packet.dashLayout.at(-1).end - packet.dashLayout[0].start < 0.03,
    "the visible packet must occupy under three percent of a tactical-range shot");
  assert.equal(packet.travelFraction, profile.threatTracerTravelFraction);
});

test("a new authority burst draws one occludable muzzle flash and a compact moving packet", () => {
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
  const source = tracers[0].userData.source;
  const aim = tracers[0].userData.aim;
  const delta = {
    x: aim.x - source.x,
    y: aim.y - source.y,
    z: aim.z - source.z,
  };
  const rangeM = Math.hypot(delta.x, delta.y, delta.z);
  const packet = cobraThreatTracerBurstPlan(rangeM);
  assert.deepEqual(tracers[0].userData.dashLayout, packet.dashLayout);
  assert.ok(
    tracers[0].userData.packetLengthM
      <= rangeM * COBRA_BATTLEFIELD_PRESENTATION_PROFILE.threatTracerMaxPacketFraction + 1e-9,
    "DShK streaks must occupy a short packet, never stripe the complete authority line",
  );
  assert.ok(tracers[0].userData.packetLengthM < rangeM * 0.25);
  assert.deepEqual(tracers[0].userData.travel, {
    x: delta.x * packet.travelFraction,
    y: delta.y * packet.travelFraction,
    z: delta.z * packet.travelFraction,
  }, "packet motion must stay on the exact authoritative source-to-aim vector");
  const tracerPositions = tracers[0].geometry.attributes.position.array;
  assert.equal(
    tracerPositions.length,
    COBRA_BATTLEFIELD_PRESENTATION_PROFILE.threatTracerDashCount
      * COBRA_BATTLEFIELD_PRESENTATION_PROFILE.tracerVerticesPerDash * 3,
    "burst must remain a small set of thick streaks rather than a dotted valley ruler",
  );
  assert.equal(
    tracers[0].userData.ribbonWidthM,
    COBRA_BATTLEFIELD_PRESENTATION_PROFILE.threatTracerGlowWidthM,
  );
  assert.ok(tracers[0].userData.ribbonWidthM >= 0.7,
    "DShK fire must remain wider than hardware-limited LineBasicMaterial output");
  for (const effect of [...muzzle, ...tracers]) {
    assert.equal(effect.material.depthTest, true, "ground fire must disappear behind terrain");
    assert.equal(effect.material.depthWrite, false, "transient fire must not write an x-ray depth seam");
    assert.equal(effect.material.toneMapped, false, "warm burst color must survive scene grading");
  }

  const beforeMove = { ...tracers[0].position };
  const movedAt = performance.now();
  tracers[0].userData.bornAt = movedAt
    - COBRA_BATTLEFIELD_PRESENTATION_PROFILE.threatTracerLifetimeMs * 0.45;
  tracers[0].userData.expiresAt = movedAt
    + COBRA_BATTLEFIELD_PRESENTATION_PROFILE.threatTracerLifetimeMs * 0.55;
  presentation.sync(EMPTY_GROUND_WAR, null, damage);
  const movedM = Math.hypot(
    tracers[0].position.x - beforeMove.x,
    tracers[0].position.y - beforeMove.y,
    tracers[0].position.z - beforeMove.z,
  );
  const fullTravelM = Math.hypot(
    tracers[0].userData.travel.x,
    tracers[0].userData.travel.y,
    tracers[0].userData.travel.z,
  );
  assert.ok(movedM > fullTravelM * 0.4 && movedM < fullTravelM * 0.6,
    "the compact packet must visibly advance along its authority rail over its lifetime");

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
