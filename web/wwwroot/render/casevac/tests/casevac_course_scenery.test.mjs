import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  CASEVAC_CAPSULE_VISUAL_STATES,
  CASEVAC_COURSE_SITE_IDS,
  CASEVAC_SCENERY_SCHEMA,
} from "../casevac_course_plan.js";
import {
  createCasevacCourseScenery,
} from "../casevac_course_scenery.js";

function objectNames(root) {
  const names = new Set();
  root.traverse((object) => {
    if (object.name) names.add(object.name);
  });
  return names;
}

function collectResources(root) {
  const geometries = new Set();
  const materials = new Set();
  const instancedMeshes = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) {
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        materials.add(material);
      }
    }
    if (object.isInstancedMesh) instancedMeshes.add(object);
  });
  return { geometries, materials, instancedMeshes };
}

function findByKind(root, kind, siteId = null) {
  const matches = [];
  root.traverse((object) => {
    if (object.userData.casevac?.kind !== kind) return;
    if (siteId && object.userData.casevac.siteId !== siteId) return;
    matches.push(object);
  });
  return matches;
}

function assertInsideBounds(point, bounds, message) {
  const epsilon = 1e-6;
  for (const axis of ["x", "y", "z"]) {
    assert.ok(Number.isFinite(point[axis]), `${message}.${axis} must be finite`);
    assert.ok(
      point[axis] >= bounds.minimum[axis] - epsilon
        && point[axis] <= bounds.maximum[axis] + epsilon,
      `${message}.${axis} must fit the published conservative bounds`,
    );
  }
}

test("builds the complete course as explicitly non-authoritative presentation", () => {
  const scenery = createCasevacCourseScenery(THREE, {
    qualityTier: "balanced",
    seed: 2030,
  });
  const names = objectNames(scenery.group);

  assert.equal(scenery.group.name,
    "CASEVAC_COURSE_SCENERY_PRESENTATION_ONLY");
  assert.equal(scenery.group.userData.casevacScenery.schema,
    CASEVAC_SCENERY_SCHEMA);
  assert.equal(scenery.group.userData.casevacScenery.presentationOnly, true);
  assert.equal(scenery.group.userData.casevacScenery.authoritative, false);
  assert.equal(scenery.group.userData.casevacScenery.collisionSource, false);
  assert.equal(scenery.group.userData.casevacScenery.missionAuthority, false);
  for (const expected of [
    "CASEVAC_PICKUP_SITE_PRESENTATION",
    "CASEVAC_RECEIVER_SITE_PRESENTATION",
    "CASEVAC_PICKUP_PAD_VISUAL",
    "CASEVAC_RECEIVER_PAD_VISUAL",
    "CASEVAC_PAD_H_BAR",
    "CASEVAC_LANDING_ZONE_LIGHTS",
    "CASEVAC_SITE_SIGNAL_SMOKE",
    "CASEVAC_SITE_SIGNAL_SMOKE_PUFFS",
    "CASEVAC_WINDSOCK",
    "CASEVAC_ANONYMOUS_STAFF",
    "CASEVAC_STAFF_ARMS",
    "CASEVAC_STAFF_LEGS",
    "CASEVAC_RESPONSE_VEHICLE",
    "CASEVAC_RESPONSE_VEHICLE_ROOF_MARK",
    "CASEVAC_APPROACH_CUE",
    "CASEVAC_ESCAPE_CUE",
    "CASEVAC_OPAQUE_CAPSULE",
  ]) {
    assert.ok(names.has(expected), `${expected} should be authored`);
  }

  let taggedObjects = 0;
  scenery.group.traverse((object) => {
    const tag = object.userData.casevac;
    assert.ok(tag, `${object.name || object.type} must carry a CASEVAC tag`);
    assert.equal(tag.presentationOnly, true);
    assert.equal(tag.authoritative, false);
    assert.equal(tag.collisionSource, false);
    taggedObjects++;
  });
  assert.ok(taggedObjects > 20);
  for (const unbackedObstacle of [
    "CASEVAC_FENCE_VISUALS",
    "CASEVAC_UTILITY_VISUALS",
    "CASEVAC_PICKUP_TREES",
    "CASEVAC_RECEIVER_TREES",
    "CASEVAC_PICKUP_STRUCTURES",
    "CASEVAC_RECEIVER_STRUCTURES",
  ]) {
    assert.equal(
      names.has(unbackedObstacle),
      false,
      `${unbackedObstacle} must come from projected collision authority`,
    );
  }
  assert.equal(findByKind(scenery.group, "approach-cue")
    .every((cue) => cue.visible === false), true);
  assert.equal(findByKind(scenery.group, "escape-cue")
    .every((cue) => cue.visible === false), true);
  scenery.dispose();
});

test("batches repeated silhouettes and stays within a fixed draw-object budget", () => {
  const scenery = createCasevacCourseScenery(THREE, {
    qualityTier: "desktop",
  });
  let drawables = 0;
  let instancedCapacity = 0;
  scenery.group.traverse((object) => {
    if (object.isMesh || object.isLine) drawables++;
    if (!object.isInstancedMesh) return;
    instancedCapacity += object.count;
    assert.ok(object.count > 0);
    assert.ok(object.boundingBox);
    assert.ok(object.boundingSphere);
    assert.ok(object.instanceMatrix.array.every(Number.isFinite));
  });

  assert.ok(drawables <= 52,
    `fixed course should remain compact, received ${drawables} drawables`);
  assert.ok(instancedCapacity >= scenery.plan.counts.people);
  assert.ok(instancedCapacity < 300);
  assert.equal(
    findByKind(scenery.group, "tree-trunks").length,
    0,
  );
  assert.equal(
    findByKind(scenery.group, "staff-bodies").length,
    2,
  );
  assert.equal(
    findByKind(scenery.group, "utility-poles").length,
    0,
  );
  scenery.dispose();
});

test("keeps response vehicles outside the pad and limits shadow casters", () => {
  const scenery = createCasevacCourseScenery(THREE, {
    qualityTier: "desktop",
  });
  scenery.group.updateMatrixWorld(true);

  for (const siteId of Object.values(CASEVAC_COURSE_SITE_IDS)) {
    const vehicle = findByKind(
      scenery.group,
      "response-vehicle-silhouette",
      siteId,
    )[0];
    const pad = findByKind(scenery.group, "decorative-pad", siteId)[0];
    assert.ok(vehicle, `${siteId} must have a response vehicle`);
    assert.ok(pad, `${siteId} must have a marked landing pad`);
    assert.equal(vehicle.userData.casevac.presentationOnly, true);
    assert.equal(vehicle.userData.casevac.collisionSource, false);

    const vehicleBounds = new THREE.Box3().setFromObject(vehicle);
    const padBounds = new THREE.Box3().setFromObject(pad);
    assert.equal(
      vehicleBounds.intersectsBox(padBounds),
      false,
      `${siteId} response vehicle must leave the marked pad clear`,
    );
  }

  const shadowCasters = [];
  scenery.group.traverse((object) => {
    if (object.castShadow) shadowCasters.push(object);
  });
  assert.ok(shadowCasters.length > 0, "staff and vehicles should ground the scene");
  assert.ok(shadowCasters.length <= 15,
    `site decor should keep a bounded caster set, received ${shadowCasters.length}`);
  assert.equal(
    findByKind(scenery.group, "landing-zone-lights")
      .every((light) => light.castShadow === false),
    true,
    "emissive landing lights must not render shadow maps",
  );
  assert.equal(
    findByKind(scenery.group, "pad-marking-visual")
      .every((marking) => marking.castShadow === false),
    true,
    "painted pad markings must not render shadow maps",
  );
  scenery.dispose();
});

test("projects wind, rain, flight cues, and rotor wash without becoming authority", () => {
  const scenery = createCasevacCourseScenery(THREE, {
    qualityTier: "mobile",
  });
  const pickupId = CASEVAC_COURSE_SITE_IDS.pickup;
  const pickupApproach = findByKind(
    scenery.group,
    "approach-cue",
    pickupId,
  )[0];
  const pickupEscape = findByKind(
    scenery.group,
    "escape-cue",
    pickupId,
  )[0];
  const receiverApproach = findByKind(
    scenery.group,
    "approach-cue",
    CASEVAC_COURSE_SITE_IDS.receiver,
  )[0];
  const rains = findByKind(scenery.group, "weather-rain-visual");
  const pickupWash = findByKind(
    scenery.group,
    "rotor-wash-visual",
    pickupId,
  )[0];
  const receiverWash = findByKind(
    scenery.group,
    "rotor-wash-visual",
    CASEVAC_COURSE_SITE_IDS.receiver,
  )[0];
  const windsockPivot = findByKind(
    scenery.group,
    "windsock-pivot",
    pickupId,
  )[0];
  const windsockFabric = findByKind(
    scenery.group,
    "windsock-fabric",
    pickupId,
  )[0];
  const pickupSignal = findByKind(
    scenery.group,
    "site-signal-smoke",
    pickupId,
  )[0];
  const receiverSignal = findByKind(
    scenery.group,
    "site-signal-smoke",
    CASEVAC_COURSE_SITE_IDS.receiver,
  )[0];
  const pickupPuffs = findByKind(
    scenery.group,
    "site-signal-smoke-puffs",
    pickupId,
  )[0];
  const smokeBeforeWind = Array.from(pickupPuffs.instanceMatrix.array);
  scenery.update({
    activeSiteId: pickupId,
    showApproachCue: false,
  });
  assert.equal(pickupSignal.visible, false,
    "a navigation target alone must not invent a live ground signal");
  scenery.update({
    elapsedSeconds: 12.5,
    windX: 7,
    windZ: -3,
    precipitation01: 0.65,
    activeSiteId: pickupId,
    showApproachCue: true,
    showEscapeCue: true,
    rotorWash: {
      position: { x: 3, y: 2, z: -4 },
      radiusM: 30,
      intensity01: 0.8,
    },
  });

  assert.equal(pickupApproach.visible, true);
  assert.equal(pickupEscape.visible, true);
  assert.equal(receiverApproach.visible, false);
  assert.equal(rains.every((rain) => rain.visible), true);
  assert.ok(rains[0].material.opacity > 0);
  assert.notEqual(rains[0].position.y, 0);
  assert.ok(windsockPivot.rotation.z < 0);
  assert.ok(windsockFabric.scale.x > 0.62);
  assert.equal(pickupWash.visible, true);
  assert.equal(receiverWash.visible, false);
  assert.ok(pickupWash.material.opacity > 0);
  assert.equal(pickupSignal.visible, true);
  assert.equal(receiverSignal.visible, false);
  assert.deepEqual(pickupSignal.scale.toArray(), [1, 1, 1]);
  assert.deepEqual(pickupSignal.position.toArray(), [-15, 0, 13]);
  assert.notDeepEqual(
    Array.from(pickupPuffs.instanceMatrix.array),
    smokeBeforeWind,
    "wind should bend individual puffs without moving the site anchor",
  );
  const topMatrix = new THREE.Matrix4().fromArray(
    pickupPuffs.instanceMatrix.array,
    (pickupPuffs.count - 1) * 16,
  );
  const topPosition = new THREE.Vector3();
  const topRotation = new THREE.Quaternion();
  const topScale = new THREE.Vector3();
  topMatrix.decompose(topPosition, topRotation, topScale);
  assert.ok(topPosition.x > 2.75 && topPosition.x < 6.5);
  assert.ok(topScale.x <= 1.85 && topScale.z <= 1.85);
  assert.ok(topScale.y <= 2.5);
  assert.equal(pickupPuffs.material.opacity <= 0.4, true);
  assert.equal(pickupPuffs.frustumCulled, false);

  scenery.update({
    precipitation01: 0,
    activeSiteId: "elsewhere",
    showApproachCue: true,
    showEscapeCue: true,
  });
  assert.equal(rains.every((rain) => rain.visible === false), true);
  assert.equal(pickupApproach.visible, false);
  assert.equal(pickupEscape.visible, false);
  assert.equal(pickupWash.visible, false);
  assert.equal(pickupSignal.visible, false);
  scenery.dispose();
});

test("authors a high-contrast landing story without adding collision authority", () => {
  const scenery = createCasevacCourseScenery(THREE, {
    qualityTier: "desktop",
  });
  const lights = findByKind(scenery.group, "landing-zone-lights");
  const signals = findByKind(scenery.group, "site-signal-smoke-puffs");
  const markings = findByKind(scenery.group, "pad-marking-visual");
  const staff = findByKind(scenery.group, "staff-bodies");
  const staffArms = findByKind(scenery.group, "staff-arms");
  const staffLegs = findByKind(scenery.group, "staff-legs");
  const vehicles = findByKind(scenery.group, "response-vehicle-silhouette");
  const vehicleMarks = findByKind(scenery.group, "response-vehicle-roof-mark");
  assert.deepEqual(lights.map((mesh) => mesh.count), [16, 16]);
  assert.deepEqual(signals.map((mesh) => mesh.count), [14, 14]);
  assert.equal(markings.length, 6);
  assert.deepEqual(staff.map((mesh) => mesh.count), [8, 8]);
  assert.deepEqual(staffArms.map((mesh) => mesh.count), [8, 8]);
  assert.deepEqual(staffLegs.map((mesh) => mesh.count), [16, 16]);
  assert.equal(vehicles.length, 2);
  assert.deepEqual(vehicleMarks.map((mesh) => mesh.count), [2, 2]);
  for (const object of [
    ...lights,
    ...signals,
    ...markings,
    ...staff,
    ...staffArms,
    ...staffLegs,
    ...vehicles,
    ...vehicleMarks,
  ]) {
    assert.equal(object.userData.casevac.presentationOnly, true);
    assert.equal(object.userData.casevac.collisionSource, false);
  }
  scenery.dispose();
});

test("moves the single opaque capsule only from projected custody state", () => {
  const scenery = createCasevacCourseScenery(THREE);
  const capsule = scenery.group.getObjectByName("CASEVAC_OPAQUE_CAPSULE");
  const pickup = scenery.group.getObjectByName(
    "CASEVAC_PICKUP_SITE_PRESENTATION",
  );
  const receiver = scenery.group.getObjectByName(
    "CASEVAC_RECEIVER_SITE_PRESENTATION",
  );

  assert.ok(capsule);
  assert.equal(capsule.parent, pickup);
  assert.equal(capsule.visible, true);
  assert.equal(capsule.userData.visualCustody,
    CASEVAC_CAPSULE_VISUAL_STATES.atPickup);

  scenery.update({
    capsuleCustody: CASEVAC_CAPSULE_VISUAL_STATES.inAircraft,
  });
  assert.equal(capsule.visible, false);
  assert.equal(capsule.userData.visualCustody,
    CASEVAC_CAPSULE_VISUAL_STATES.inAircraft);

  scenery.update({
    capsuleCustody: CASEVAC_CAPSULE_VISUAL_STATES.atReceiver,
  });
  assert.equal(capsule.parent, receiver);
  assert.equal(capsule.visible, true);
  assert.equal(capsule.userData.visualCustody,
    CASEVAC_CAPSULE_VISUAL_STATES.atReceiver);

  scenery.update({ capsuleCustody: "CLAIMED_BY_DECORATION" });
  assert.equal(capsule.visible, false);
  assert.equal(capsule.userData.visualCustody, "UNKNOWN");
  scenery.dispose();
});

test("publishes conservative finite bounds for translated and yawed site anchors", () => {
  const scenery = createCasevacCourseScenery(THREE, {
    qualityTier: "desktop",
    anchors: {
      pickup: { x: -140, y: 12, z: 90, yaw: Math.PI * 0.25 },
      receiver: { x: 620, y: -3, z: -510, yaw: -Math.PI / 3 },
    },
  });
  const pickup = scenery.group.getObjectByName(
    "CASEVAC_PICKUP_SITE_PRESENTATION",
  );
  const receiver = scenery.group.getObjectByName(
    "CASEVAC_RECEIVER_SITE_PRESENTATION",
  );
  assert.deepEqual(pickup.position.toArray(), [-140, 12, 90]);
  assert.equal(pickup.rotation.y, Math.PI * 0.25);
  assert.deepEqual(receiver.position.toArray(), [620, -3, -510]);
  assert.equal(receiver.rotation.y, -Math.PI / 3);

  scenery.group.updateMatrixWorld(true);
  const actual = new THREE.Box3().setFromObject(scenery.group);
  const published = scenery.group.userData.casevacScenery.bounds;
  assertInsideBounds(actual.min, published, "actual.min");
  assertInsideBounds(actual.max, published, "actual.max");
  assert.ok(published.minimum.x < published.maximum.x);
  assert.ok(published.minimum.y < published.maximum.y);
  assert.ok(published.minimum.z < published.maximum.z);
  scenery.dispose();
});

test("disposes every owned resource exactly once and detaches idempotently", () => {
  const scenery = createCasevacCourseScenery(THREE, {
    qualityTier: "balanced",
  });
  const scene = new THREE.Scene();
  scene.add(scenery.group);
  const resources = collectResources(scenery.group);
  const disposeCounts = new Map();
  for (const resource of [
    ...resources.geometries,
    ...resources.materials,
    ...resources.instancedMeshes,
  ]) {
    disposeCounts.set(resource, 0);
    resource.addEventListener("dispose", () => {
      disposeCounts.set(resource, disposeCounts.get(resource) + 1);
    });
  }

  scenery.dispose();
  scenery.dispose();
  scenery.update({
    elapsedSeconds: 100,
    precipitation01: 1,
    capsuleCustody: CASEVAC_CAPSULE_VISUAL_STATES.atReceiver,
  });

  assert.equal(scenery.disposed, true);
  assert.equal(scenery.group.parent, null);
  assert.equal(scenery.group.userData.casevacScenery.disposed, true);
  for (const [resource, count] of disposeCounts) {
    assert.equal(
      count,
      1,
      `${resource.type || resource.constructor.name} should dispose once`,
    );
  }
});

test("rejects missing renderer capabilities and unknown quality tiers", () => {
  assert.throws(
    () => createCasevacCourseScenery({}, {}),
    /requires THREE\.Group/,
  );
  assert.throws(
    () => createCasevacCourseScenery(THREE, { qualityTier: "cinematic" }),
    /Unknown CASEVAC scenery quality tier/,
  );
});
