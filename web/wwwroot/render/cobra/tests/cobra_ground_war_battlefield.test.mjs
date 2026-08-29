import assert from "node:assert/strict";
import test from "node:test";
import * as REAL_THREE from "../../../vendor/three.module.js";
import {
  COBRA_BATTLEFIELD_PRESENTATION_PROFILE,
  COBRA_GROUND_WAR_COLORS,
  cobraGroundTracerBurstPlan,
  createCobraGroundWarPresentation,
} from "../cobra_ground_war.js";

function fakeThree() {
  const resources = new Set();

  class Disposable {
    constructor() {
      this.disposeCount = 0;
      resources.add(this);
    }
    dispose() { this.disposeCount += 1; }
  }
  class Color {
    constructor(hex) { this.hex = hex; }
    setHex(hex) { this.hex = hex; return this; }
  }
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setScalar(value) { this.x = value; this.y = value; this.z = value; return this; }
  }
  class Object3D {
    constructor() {
      this.children = [];
      this.position = new Vector3();
      this.scale = new Vector3(1, 1, 1);
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
  class Line extends Mesh {}
  class LineSegments extends Mesh {}
  class Geometry extends Disposable {
    constructor(...args) { super(); this.args = args; }
  }
  class BoxGeometry extends Geometry {}
  class CylinderGeometry extends Geometry {}
  class SphereGeometry extends Geometry {}
  class RingGeometry extends Geometry {}
  class OctahedronGeometry extends Geometry {}
  class BufferGeometry extends Geometry {
    constructor() { super(); this.attributes = {}; }
    setAttribute(name, value) { this.attributes[name] = value; }
  }
  class BufferAttribute {
    constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; }
  }
  class MeshStandardMaterial extends Disposable {
    constructor(params = {}) {
      super();
      Object.assign(this, params);
      this.color = new Color(params.color ?? 0xffffff);
      this.emissive = new Color(params.emissive ?? 0x000000);
    }
  }
  class MeshBasicMaterial extends MeshStandardMaterial {}
  class LineBasicMaterial extends MeshStandardMaterial {}

  return {
    THREE: {
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
      AdditiveBlending: "additive",
    },
    resources,
  };
}

function findByName(root, name) {
  if (root?.name === name) return root;
  for (const child of root?.children ?? []) {
    const found = findByName(child, name);
    if (found) return found;
  }
  return null;
}

function findByPrefix(root, prefix) {
  const found = [];
  if (String(root?.name ?? "").startsWith(prefix)) found.push(root);
  for (const child of root?.children ?? []) found.push(...findByPrefix(child, prefix));
  return found;
}

function renderableLeaves(root) {
  const found = [];
  root.traverse?.((object) => {
    if (object.isMesh || object.isLine || object.isLineSegments) found.push(object);
  });
  return found;
}

function unit(id, faction, xM, zM, overrides = {}) {
  return {
    id,
    faction,
    role: "infantry",
    alive: true,
    health: 40,
    max_health: 40,
    x_m: xM,
    y_m: 100,
    z_m: zM,
    home_site_id: "site.iron-bell-bridge.v1",
    ...overrides,
  };
}

function site(overrides = {}) {
  return {
    id: "site.iron-bell-bridge.v1",
    landmark_id: "landmark.cobra-canyon.iron-bell-bridge.v1",
    label: "Iron Bell Bridge",
    local_control: 0,
    owner: "hostile",
    capture_progress: 0.35,
    contested: false,
    x_m: 40,
    y_m: 102,
    z_m: -70,
    capture_radius_m: 220,
    ...overrides,
  };
}

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
    will_hit: false,
    has_impacted: false,
    ...overrides,
  };
}

test("production Three collapses every semantic unit silhouette to one physical body draw", () => {
  const presentation = createCobraGroundWarPresentation(REAL_THREE);
  const roles = new Map([
    ["infantry", 30],
    ["soft-vehicle", 3],
    ["hard-point", 7],
    ["dshk-site", 6],
  ]);
  const units = [...roles.keys()].flatMap((role, index) => [
    unit(`unit.${role}`, index % 2 ? "hostile" : "friendly", index * 25, index * -30, { role }),
    unit(`unit.${role}.wing`, index % 2 ? "friendly" : "hostile", index * 25 + 12,
      index * -30 + 18, { role }),
  ]);
  presentation.sync({ combat_live: true, sites: [], events: [], units });

  for (const [role, semanticPartCount] of roles) {
    const body = presentation.group.getObjectByName(`GROUND_UNIT_unit.${role}`);
    assert.equal(body?.isMesh, true, `${role} must submit one merged physical body`);
    assert.equal(body.userData.presentationPartCount, semanticPartCount,
      `${role} must retain its authored silhouette parts in the merged geometry`);
    assert.equal(renderableLeaves(body).length, 3,
      `${role} should cost one body plus two faction-cue submissions`);
    const wing = presentation.group.getObjectByName(`GROUND_UNIT_unit.${role}.wing`);
    assert.equal(wing.geometry, body.geometry,
      `${role} units must share one compiled physical geometry`);
  }
  presentation.dispose();
});

test("snapshot units carry persistent faction formations and only event-backed facing", () => {
  const { THREE } = fakeThree();
  const presentation = createCobraGroundWarPresentation(THREE);
  const friendly = unit("friendly.squad", "friendly", -30, 10);
  const hostile = unit("hostile.squad", "hostile", 60, -20);

  const firing = {
    tick: 1,
    kind: "small-arms",
    unit_id: friendly.id,
    faction: "friendly",
    x_m: friendly.x_m,
    y_m: friendly.y_m,
    z_m: friendly.z_m,
    target_x_m: hostile.x_m,
    target_y_m: hostile.y_m,
    target_z_m: hostile.z_m,
  };
  presentation.sync({ combat_live: true, sites: [], events: [firing], units: [friendly, hostile] });
  const friendlyMesh = findByName(presentation.group, "GROUND_UNIT_friendly.squad");
  const hostileMesh = findByName(presentation.group, "GROUND_UNIT_hostile.squad");
  const friendlyCue = findByName(presentation.group, "COBRA_UNIT_FACTION_CUE_friendly.squad");
  const hostileCue = findByName(presentation.group, "COBRA_UNIT_FACTION_CUE_hostile.squad");

  assert.ok(friendlyMesh && hostileMesh && friendlyCue && hostileCue);
  assert.equal(friendlyCue.userData.authorityUnitId, friendly.id);
  assert.equal(hostileCue.userData.authorityUnitId, hostile.id);
  assert.equal(friendlyCue.children.length, 2,
    "friendly formation is an open rally ring plus compact lozenge");
  assert.equal(hostileCue.children.length, 2,
    "hostile formation is an open ground frame plus compact lozenge");
  assert.ok(friendlyCue.children.length
    <= COBRA_BATTLEFIELD_PRESENTATION_PROFILE.maxFactionCueMeshesPerUnit);
  assert.ok(hostileCue.children.length
    <= COBRA_BATTLEFIELD_PRESENTATION_PROFILE.maxFactionCueMeshesPerUnit);
  assert.equal(friendlyCue.children[0].material.color.hex, COBRA_GROUND_WAR_COLORS.friendlyCue);
  assert.equal(hostileCue.children[0].material.color.hex, COBRA_GROUND_WAR_COLORS.hostileCue);
  assert.ok(findByName(friendlyCue, "COBRA_FRIENDLY_FORMATION_LOZENGE_friendly.squad")
    .position.y >= 3,
  "the friendly mark must clear low scrub without dominating literal soldiers");
  assert.ok(findByName(hostileCue, "COBRA_HOSTILE_FORMATION_LOZENGE_hostile.squad")
    .position.y >= 3,
  "the hostile mark must remain legible after literal soldiers fall below one pixel");
  assert.notEqual(friendlyCue.children[0].geometry.constructor.name,
    hostileCue.children[0].geometry.constructor.name,
    "faction recognition must survive colour-vision loss and haze");
  assert.deepEqual(friendlyMesh.userData.facingAuthorityTarget,
    { x: hostile.x_m, y: hostile.y_m, z: -hostile.z_m });
  assert.equal(hostileMesh.userData.facingAuthorityTarget, undefined,
    "mere proximity to an opponent does not authorize invented intent");

  presentation.sync({
    combat_live: true,
    sites: [],
    events: [],
    units: [{ ...friendly, alive: false, health: 0 }, hostile],
  });
  assert.equal(friendlyCue.visible, false, "a wreck must not retain a living formation cue");
  assert.equal(findByName(presentation.group, "COBRA_WRECK_EFFECTS_friendly.squad"), null,
    "alive=false alone authorizes a wreck body, not invented persistent combustion");
  presentation.sync({
    combat_live: true,
    sites: [],
    events: [{
      tick: 2,
      kind: "unit-destroyed",
      unit_id: friendly.id,
      site_id: friendly.home_site_id,
      faction: friendly.faction,
      x_m: friendly.x_m,
      y_m: friendly.y_m,
      z_m: friendly.z_m,
    }],
    units: [{ ...friendly, role: "soft-vehicle", alive: false, health: 0 }, hostile],
  });
  const wreck = findByName(presentation.group, "COBRA_WRECK_EFFECTS_friendly.squad");
  assert.ok(wreck?.visible, "an exact dead-unit snapshot owns persistent wreck smoke and fire");
  assert.equal(wreck.userData.authorityField, "observed unit-destroyed/gun-kill event");
  assert.deepEqual(
    { x: wreck.position.x, y: wreck.position.y, z: wreck.position.z },
    { x: friendly.x_m, y: friendly.y_m + 0.2, z: -friendly.z_m },
  );
  assert.equal(findByPrefix(wreck, "COBRA_WRECK_SMOKE_").length, 2);
  assert.equal(findByPrefix(wreck, "COBRA_WRECK_FIRE_").length, 1);
  assert.ok(wreck.children.length <= COBRA_BATTLEFIELD_PRESENTATION_PROFILE.maxWreckMeshes);

  presentation.sync({ combat_live: true, sites: [], events: [], units: [] });
  assert.equal(friendlyMesh.visible, false);
  assert.equal(hostileMesh.visible, false, "absent snapshot units cannot persist as phantom troops");
  assert.equal(wreck.visible, false, "absent wreck truth must clear its persistent smoke and fire");
  presentation.dispose();
});

test("an abstract battle ring and opposing standards require explicit live contested-site truth", () => {
  const { THREE } = fakeThree();
  const presentation = createCobraGroundWarPresentation(THREE);
  const contestedRoot = findByName(presentation.group, "COBRA_GROUND_WAR_CONTESTED_SITES");
  const snapshot = (combatLive, contested, units = []) => ({
    combat_live: combatLive,
    units,
    events: [],
    sites: [site({ contested })],
  });

  presentation.sync(snapshot(false, true));
  presentation.sync(snapshot(true, false));
  assert.equal(contestedRoot.children.length, 0,
    "neither a parked mission nor an uncontested point may imply a firefight");

  presentation.sync(snapshot(true, true, [
    unit("friendly.anchor", "friendly", -20, -70, { role: "hard-point" }),
    unit("hostile.anchor", "hostile", 100, -70, { role: "hard-point" }),
  ]));
  const marker = findByName(presentation.group,
    "COBRA_CONTESTED_SITE_site.iron-bell-bridge.v1");
  assert.ok(marker?.visible);
  assert.equal(marker.userData.authorityField, "site.contested");
  assert.equal(marker.children.length, 5);
  assert.ok(marker.children.length
    <= COBRA_BATTLEFIELD_PRESENTATION_PROFILE.maxContestedSiteMeshes);
  assert.equal(findByPrefix(marker, "COBRA_CONTESTED_STANDARD_").length, 4);
  assert.equal(findByName(marker,
    "COBRA_CONTESTED_STANDARD_FRIENDLY_POLE_site.iron-bell-bridge.v1").position.x, -60);
  assert.equal(findByName(marker,
    "COBRA_CONTESTED_STANDARD_HOSTILE_POLE_site.iron-bell-bridge.v1").position.x, 60,
  "opposing standards must sit on exact faction hardpoints, not cluster over the site centre");
  assert.equal(findByPrefix(marker, "COBRA_CONTESTED_RING_").length, 1);
  assert.equal(findByPrefix(marker, "COBRA_CONTESTED_SMOKE_").length, 0);
  assert.equal(findByPrefix(marker, "COBRA_CONTESTED_FIRE_").length, 0,
    "opposing occupancy alone must never fabricate burning or destruction");
  assert.deepEqual(
    { x: marker.position.x, y: marker.position.y, z: marker.position.z },
    { x: 40, y: 102.25, z: 70 },
    "the contested marker must stay anchored to the authority-authored site",
  );

  presentation.sync(snapshot(true, true));
  assert.equal(contestedRoot.children.length, 1, "retained snapshots cannot duplicate markers");
  assert.ok(findByPrefix(marker, "COBRA_CONTESTED_STANDARD_")
    .every((standard) => standard.visible === false),
  "standards require current living faction anchors, not merely a retained contested bit");
  presentation.sync({
    combat_live: true,
    units: [],
    events: [],
    sites: Array.from({ length: 7 }, (_, index) => site({
      id: `site.contested.${index}`,
      x_m: index * 80,
      contested: true,
    })),
  });
  assert.equal(contestedRoot.children.length,
    COBRA_BATTLEFIELD_PRESENTATION_PROFILE.maxContestedSiteMarkers,
  "even a malformed oversized site snapshot cannot grow unbounded marker drawables");
  presentation.sync({
    combat_live: true,
    units: [],
    events: [],
    sites: [site({ id: "site.contested.replacement", contested: true })],
  });
  assert.equal(contestedRoot.children.length, 1);
  assert.ok(findByName(presentation.group, "COBRA_CONTESTED_SITE_site.contested.replacement"),
    "a new contested site must reuse a slot released by old site IDs");
  presentation.sync(snapshot(true, false));
  assert.equal(marker.visible, false);
  presentation.sync({ combat_live: true, units: [], events: [], sites: [] });
  assert.equal(marker.visible, false, "removed sites cannot leave a battle marker behind");
  presentation.dispose();
});

test("persistent wreck smoke is exact, bounded, and released when wreck truth leaves", () => {
  const { THREE, resources } = fakeThree();
  let clockMs = 1_000;
  const presentation = createCobraGroundWarPresentation(THREE, { nowMs: () => clockMs });
  const deadUnits = Array.from({ length: 18 }, (_, index) => unit(
    `wreck.${index}`,
    index % 2 ? "friendly" : "hostile",
    index * 14,
    -index * 9,
    { role: "soft-vehicle", alive: false, health: 0 },
  ));
  const destroyedEvents = deadUnits.map((dead, index) => ({
    tick: index + 1,
    kind: index % 2 ? "unit-destroyed" : "gun-kill",
    unit_id: dead.id,
    site_id: dead.home_site_id,
    faction: dead.faction,
    x_m: dead.x_m,
    y_m: dead.y_m,
    z_m: dead.z_m,
  }));
  presentation.sync({ combat_live: true, sites: [], events: destroyedEvents, units: deadUnits });
  const wreckRoot = findByName(presentation.group, "COBRA_GROUND_WAR_WRECK_EFFECTS");
  assert.equal(wreckRoot.children.length,
    COBRA_BATTLEFIELD_PRESENTATION_PROFILE.maxPersistentWrecks);
  assert.ok(wreckRoot.children.every((wreck) =>
    wreck.children.length <= COBRA_BATTLEFIELD_PRESENTATION_PROFILE.maxWreckMeshes));

  clockMs += COBRA_BATTLEFIELD_PRESENTATION_PROFILE.wreckCombustionLifetimeMs + 1;
  presentation.sync({ combat_live: true, sites: [], events: destroyedEvents, units: deadUnits });
  assert.equal(wreckRoot.children.length, 0,
    "a retained rolling kill event must not restart the wreck-combustion clock every frame");

  const beforeRemoval = [...resources];
  presentation.sync({ combat_live: true, sites: [], events: [], units: [] });
  assert.equal(wreckRoot.children.length, 0);
  assert.ok(beforeRemoval.some((resource) => resource.disposeCount === 1),
    "resources owned by absent wrecks must be released immediately");
  presentation.dispose();
});

test("ground effects never synthesize a target and gun-hit truth is impact-only", () => {
  const { THREE } = fakeThree();
  const presentation = createCobraGroundWarPresentation(THREE);
  const sourceOnly = {
    tick: 11,
    kind: "small-arms",
    unit_id: "friendly.squad",
    faction: "friendly",
    x_m: 10,
    y_m: 100,
    z_m: -20,
    target_x_m: null,
    target_y_m: null,
    target_z_m: null,
  };
  const gunHit = {
    tick: 12,
    kind: "gun-hit",
    unit_id: "hostile.squad",
    faction: "hostile",
    x_m: 70,
    y_m: 102,
    z_m: 35,
  };
  presentation.sync({ combat_live: true, sites: [], units: [], events: [sourceOnly, gunHit] });

  assert.equal(findByPrefix(presentation.group, "COBRA_BATTLE_MUZZLE_FLASH_").length, 1,
    "the small-arms event proves firing at its exact source");
  assert.equal(findByPrefix(presentation.group, "COBRA_BATTLE_TRACER_").length, 0,
    "missing target coordinates must not become the retired vertical fake tracer");
  assert.equal(findByPrefix(presentation.group, "COBRA_GUN_HIT_SPARKS_").length, 1);
  assert.equal(findByPrefix(presentation.group, "COBRA_GUN_HIT_FLASH_").length, 1);
  assert.equal(findByPrefix(presentation.group, "COBRA_GUN_HIT_DUST_").length, 4,
    "an exact hit owns one dust group and three visible lobes at the impact point");

  const quiet = createCobraGroundWarPresentation(THREE);
  quiet.sync({ combat_live: true, sites: [], units: [], events: [] }, null, {
    threat_tracking: true,
    receiving_fire: false,
    acquisition_progress: 1,
    seconds_to_next_impact: 0.01,
    recent_bursts: [],
  });
  assert.equal(findByPrefix(quiet.group, "COBRA_BATTLE_").length, 0);
  assert.equal(findByPrefix(quiet.group, "COBRA_THREAT_").length, 0,
    "tracking and private impact timing still authorize no VFX");
  presentation.dispose();
  quiet.dispose();
});

test("ground bursts leave the exact muzzle, travel across the exchange, and keep rifle smoke low", () => {
  const { THREE } = fakeThree();
  const presentation = createCobraGroundWarPresentation(THREE);
  const source = unit("friendly.rifle", "friendly", 10, -20);
  const target = unit("hostile.pit", "hostile", 410, -20, { role: "hard-point" });
  const event = {
    tick: 31,
    kind: "small-arms",
    unit_id: source.id,
    site_id: "site.iron-bell-bridge.v1",
    faction: source.faction,
    x_m: source.x_m,
    y_m: source.y_m,
    z_m: source.z_m,
    target_x_m: target.x_m,
    target_y_m: target.y_m,
    target_z_m: target.z_m,
  };
  presentation.sync({ combat_live: true, sites: [], units: [source, target], events: [event] });

  const plan = cobraGroundTracerBurstPlan(400);
  assert.ok(plan.dashLayout[0].start <= 0.01,
    "the first hot streak must leave the firing position, not materialize mid-line");
  assert.ok(plan.dashLayout.at(-1).end <= 0.16,
    "one frame is a compact projectile packet, not a full-length laser");
  assert.ok(plan.travelFraction + plan.dashLayout.at(-1).end <= 1,
    "the moving packet must remain inside the exact source/target segment");
  assert.ok(plan.travelFraction >= 0.75,
    "the packet must cross enough of the exchange to communicate direction");
  const cockpitRangeM = 900;
  const cockpitPlan = cobraGroundTracerBurstPlan(cockpitRangeM);
  assert.ok(cockpitPlan.dashLengthT * cockpitRangeM >= 20,
    "a tactical-range dash must resolve as a streak rather than the measured six-pixel glint");
  assert.ok(COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundTracerGlowWidthM >= 2,
    "the additive sheath needs enough physical width to survive jungle contrast");
  assert.ok(COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundTracerLifetimeMs >= 1_600,
    "successive authority events need enough overlap for the fight to read during a glance");
  assert.ok(COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundMuzzleFlashLifetimeMs >= 800,
    "the exact firing formation must remain identifiable while its packet departs");

  const flash = findByName(presentation.group,
    "COBRA_BATTLE_MUZZLE_FLASH_31_friendly.rifle");
  const tracer = findByName(presentation.group,
    "COBRA_BATTLE_TRACER_31_friendly.rifle");
  const powder = findByName(presentation.group,
    "COBRA_BATTLE_MUZZLE_POWDER_31_friendly.rifle");
  assert.equal(flash.material.blending, THREE.AdditiveBlending);
  assert.ok(flash.geometry instanceof THREE.OctahedronGeometry,
    "muzzle fire is a sharp directional flare instead of a glowing sphere");
  assert.equal(flash.children.length, 0,
    "one directional flare replaces the oversized white core and saves a draw submission");
  assert.ok(flash.scale.z > flash.scale.x * 3,
    "the flash stretches down the exact firing axis instead of reading as a floating ball");
  assert.equal(flash.userData.aimedAtAuthorityTarget, true);
  assert.equal(tracer.material.blending, THREE.AdditiveBlending);
  const positions = tracer.geometry.attributes.position.array;
  const vertex = (index) => [
    positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2],
  ];
  const distance = (left, right) => Math.hypot(
    left[0] - right[0], left[1] - right[1], left[2] - right[2],
  );
  const tailWidthM = distance(vertex(0), vertex(5));
  const headWidthM = distance(vertex(1), vertex(2));
  assert.ok(tailWidthM <= headWidthM * 0.3,
    "each hot dash needs a sharp projectile tail instead of a constant-width road stripe");
  assert.equal(powder.children.length, 1,
    "rifle fire gets one low powder puff instead of a three-storey smoke chimney");
  assert.ok(powder.children[0].position.y < 1,
    "rifle powder stays around muzzle height; wreck smoke owns the skyline");

  const evidence = presentation.renderedBattleEvidence(event.site_id, event.tick, event.unit_id);
  assert.equal(evidence.tick, event.tick);
  assert.equal(evidence.tracer.segments.length,
    COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundTracerDashCount);
  assert.ok(Math.abs(evidence.tracer.segments[0].start.x_m - source.x_m) < 4,
    "proof reports the actual near-muzzle dash, not the complete authority line");
  assert.equal(evidence.sourceFlash.x_m, source.x_m);
  presentation.dispose();
});

test("heavy ground weapons emit one low powder lobe instead of a retained smoke cluster", () => {
  const { THREE } = fakeThree();
  const presentation = createCobraGroundWarPresentation(THREE);
  const shooter = unit("friendly.truck", "friendly", 10, -20, { role: "soft-vehicle" });
  const target = unit("hostile.pit", "hostile", 210, -20, { role: "hard-point" });
  presentation.sync({
    combat_live: true,
    sites: [],
    units: [shooter, target],
    events: [{
      tick: 32,
      kind: "small-arms",
      unit_id: shooter.id,
      site_id: "site.iron-bell-bridge.v1",
      faction: shooter.faction,
      x_m: shooter.x_m,
      y_m: shooter.y_m,
      z_m: shooter.z_m,
      target_x_m: target.x_m,
      target_y_m: target.y_m,
      target_z_m: target.z_m,
    }],
  });

  const powder = findByName(presentation.group,
    "COBRA_BATTLE_MUZZLE_POWDER_32_friendly.truck");
  assert.equal(powder.children.length, 1,
    "one restrained heavy discharge saves the second translucent sphere draw");
  assert.ok(powder.userData.cobraRiseM <= 1.2,
    "weapon discharge remains low; only destroyed-unit truth owns tall smoke");
  assert.ok(powder.children[0].scale.y < powder.children[0].scale.x * 0.3,
    "heavy powder spreads horizontally instead of stacking into a glowing ball");
  assert.notEqual(powder.children[0].material.blending, THREE.AdditiveBlending);
  presentation.dispose();
});

test("rendered proof disambiguates reciprocal shooters that share one authority tick", () => {
  const { THREE } = fakeThree();
  const presentation = createCobraGroundWarPresentation(THREE);
  const reciprocal = [
    { tick: 44, kind: "small-arms", unit_id: "friendly.rifle", faction: "friendly",
      site_id: "site.iron-bell-bridge.v1", x_m: 0, y_m: 100, z_m: 0,
      target_x_m: 200, target_y_m: 100, target_z_m: 0 },
    { tick: 44, kind: "small-arms", unit_id: "hostile.rifle", faction: "hostile",
      site_id: "site.iron-bell-bridge.v1", x_m: 200, y_m: 100, z_m: 0,
      target_x_m: 0, target_y_m: 100, target_z_m: 0 },
  ];
  presentation.sync({ combat_live: true, sites: [], units: [], events: reciprocal });
  const friendly = presentation.renderedBattleEvidence(
    reciprocal[0].site_id, 44, "friendly.rifle",
  );
  const hostile = presentation.renderedBattleEvidence(
    reciprocal[0].site_id, 44, "hostile.rifle",
  );
  assert.equal(friendly.unitId, "friendly.rifle");
  assert.equal(friendly.faction, "friendly");
  assert.equal(hostile.unitId, "hostile.rifle");
  assert.equal(hostile.faction, "hostile");
  assert.notDeepEqual(friendly.sourceFlash, hostile.sourceFlash);
  const friendlyTracer = findByName(presentation.group,
    "COBRA_BATTLE_TRACER_44_friendly.rifle");
  const hostileTracer = findByName(presentation.group,
    "COBRA_BATTLE_TRACER_44_hostile.rifle");
  assert.ok(friendlyTracer && hostileTracer,
    "one reciprocal authority tick must render both sides of the exchange together");
  assert.notEqual(friendlyTracer.material.color.hex, hostileTracer.material.color.hex,
    "opposing moving packets need distinct hot faction colours");
  for (const tracer of [friendlyTracer, hostileTracer]) {
    assert.equal(tracer.userData.ribbonWidthM,
      COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundTracerGlowWidthM);
    assert.equal(
      tracer.userData.expiresAt - tracer.userData.bornAt,
      COBRA_BATTLEFIELD_PRESENTATION_PROFILE.groundTracerLifetimeMs,
      "both factions receive the same readable presentation lifetime",
    );
  }
  presentation.dispose();
});

test("authority exchanges are visually amplified, deduplicated, and hard-capped", () => {
  const { THREE } = fakeThree();
  const presentation = createCobraGroundWarPresentation(THREE);
  const events = Array.from({ length: 40 }, (_, index) => ({
    tick: index + 1,
    kind: "small-arms",
    unit_id: `unit.${index}`,
    site_id: `site.battle-${index % 3}.v1`,
    faction: index % 2 ? "friendly" : "hostile",
    x_m: index * 2,
    y_m: 100,
    z_m: -30,
    target_x_m: 200 - index,
    target_y_m: 102,
    target_z_m: 45,
  }));
  const war = { combat_live: true, sites: [], units: [], events };

  presentation.sync(war);
  const effectRoot = findByName(presentation.group, "COBRA_GROUND_WAR_EFFECTS");
  const transients = () => effectRoot.children.filter((effect) =>
    effect.userData.cobraGroundEventEffect || effect.userData.cobraThreatEffect);
  assert.equal(transients().length,
    COBRA_BATTLEFIELD_PRESENTATION_PROFILE.maxGroundTransientEffects,
  "event storms must evict oldest presentation effects at the fixed budget");
  presentation.sync(war);
  assert.equal(transients().length,
    COBRA_BATTLEFIELD_PRESENTATION_PROFILE.maxGroundTransientEffects,
    "retained event windows cannot replay effects");

  const pending = threatBurst({ sequence: 91 });
  presentation.sync(war, null, { recent_bursts: [pending] });
  const threatTracer = findByName(presentation.group, "COBRA_THREAT_TRACER_91");
  assert.ok(findByName(presentation.group, "COBRA_THREAT_MUZZLE_FLASH_91"));
  assert.equal(
    threatTracer.geometry.attributes.position.array.length,
    COBRA_BATTLEFIELD_PRESENTATION_PROFILE.threatTracerDashCount
      * COBRA_BATTLEFIELD_PRESENTATION_PROFILE.tracerVerticesPerDash * 3,
  );
  assert.ok(transients().length <= COBRA_BATTLEFIELD_PRESENTATION_PROFILE.maxTransientEffects);

  const laterEvents = events.map((event) => ({ ...event, tick: event.tick + 40 }));
  presentation.sync({ ...war, events: laterEvents }, null, { recent_bursts: [pending] });
  assert.ok(findByName(presentation.group, "COBRA_THREAT_TRACER_91"),
    "a dense ground tableau must not evict flight-critical incoming-fire feedback");

  const hit = { ...pending, has_impacted: true, will_hit: true, subsystem: "scas" };
  presentation.sync(war, null, { recent_bursts: [hit] });
  assert.ok(findByName(presentation.group, "COBRA_THREAT_HIT_SPARKS_91"));
  assert.ok(findByName(presentation.group, "COBRA_THREAT_HIT_FLASH_91"));
  presentation.sync(war, null, { recent_bursts: [hit] });
  assert.equal(findByPrefix(presentation.group, "COBRA_THREAT_HIT_SPARKS_91").length, 1);
  assert.ok(transients().length <= COBRA_BATTLEFIELD_PRESENTATION_PROFILE.maxTransientEffects);
  presentation.dispose();
});

test("authority reset and idempotent disposal clear every battlefield resource exactly once", () => {
  const { THREE, resources } = fakeThree();
  const scene = new THREE.Group();
  const presentation = createCobraGroundWarPresentation(THREE);
  scene.add(presentation.group);
  const pending = threatBurst({ sequence: 5 });
  presentation.sync({
    combat_live: true,
    sites: [site({ contested: true })],
    units: [unit("friendly.squad", "friendly", -30, 10),
      unit("hostile.squad", "hostile", 60, -20)],
    events: [{
      tick: 20,
      kind: "small-arms",
      unit_id: "friendly.squad",
      faction: "friendly",
      x_m: -30,
      y_m: 100,
      z_m: 10,
      target_x_m: 60,
      target_y_m: 100,
      target_z_m: -20,
    }],
  }, null, { recent_bursts: [pending] });

  presentation.sync(null, null, null);
  assert.equal(findByName(presentation.group, "GROUND_UNIT_friendly.squad").visible, false);
  assert.equal(findByName(presentation.group,
    "COBRA_CONTESTED_SITE_site.iron-bell-bridge.v1"), null,
  "clearing authority releases contested-site slots instead of retaining hidden IDs");
  assert.equal(findByPrefix(presentation.group, "COBRA_BATTLE_").length, 0);
  assert.equal(findByPrefix(presentation.group, "COBRA_THREAT_").length, 0);

  const resourceCount = resources.size;
  presentation.dispose();
  presentation.dispose();
  presentation.sync({ combat_live: true, sites: [], units: [], events: [] });
  assert.equal(resources.size, resourceCount, "a disposed presentation must stay inert");
  assert.equal(presentation.group.parent, null);
  for (const resource of resources) {
    assert.equal(resource.disposeCount, 1,
      `${resource.constructor.name} must be released exactly once`);
  }
});
