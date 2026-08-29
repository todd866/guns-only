import {
  CASEVAC_CAPSULE_ID,
  CASEVAC_CAPSULE_VISUAL_STATES,
  CASEVAC_COURSE_SITE_IDS,
  CASEVAC_DEFAULT_ANCHORS,
  CASEVAC_SCENERY_SCHEMA,
  planCasevacCourseScenery,
} from "./casevac_course_plan.js";

/**
 * Builds decorative CASEVAC course scenery.
 *
 * Presentation boundary: this module does not provide collision, contact,
 * landing-zone, obstacle, exposure, weather, mission, or custody authority.
 * Its update hooks consume already-projected presentation values only.
 */

const COLORS = Object.freeze({
  orchardGround: 0x615b42,
  receiverGround: 0x5e6460,
  padEdge: 0xf2e3aa,
  padMarking: 0xece6c8,
  landingLight: 0xffcf68,
  pickupSignal: 0xd97b32,
  receiverSignal: 0x54a86c,
  pole: 0x5b5650,
  staff: 0xe3a94f,
  staffHead: 0xc7a681,
  staffLegs: 0x303536,
  pickupVehicle: 0xb84c35,
  receiverVehicle: 0xe5e0d0,
  vehicleCab: 0x26383d,
  pickupVehicleMarking: 0xf3eee0,
  receiverVehicleMarking: 0xc84d3e,
  vehicleWheel: 0x242728,
  vehicleBeacon: 0xff9c36,
  capsule: 0xb8b59f,
  capsuleBand: 0xe2a94f,
  cueApproach: 0xa9d8c0,
  cueEscape: 0xe5bd69,
  rain: 0xb9d3d8,
  rotorWash: 0xd8c48d,
});

// The site needs a few grounded silhouettes, not a shadow-map copy of every
// emissive bulb, painted marking, smoke puff, and thin cue. Keep this list
// deliberately small so the low-level approach is readable before the frame
// governor has to intervene.
const SHADOW_CASTER_KINDS = new Set([
  "staff-bodies",
  "staff-heads",
  "staff-arms",
  "staff-legs",
  "response-vehicle-body",
  "response-vehicle-cab",
  "response-vehicle-wheels",
]);
const SHADOW_RECEIVER_KINDS = new Set([
  "pad-surface-visual",
  ...SHADOW_CASTER_KINDS,
]);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalAnchor(value, fallback) {
  return Object.freeze({
    x: finite(value?.x, fallback.x),
    y: finite(value?.y, fallback.y),
    z: finite(value?.z, fallback.z),
    yaw: finite(value?.yaw, 0),
  });
}

function tagPresentationOnly(object, kind, siteId = null) {
  object.userData.casevac = Object.freeze({
    schema: CASEVAC_SCENERY_SCHEMA,
    kind,
    siteId,
    presentationOnly: true,
    authoritative: false,
    collisionSource: false,
  });
  return object;
}

function materialList(material) {
  return Array.isArray(material) ? material : [material];
}

function validateThree(THREE) {
  const required = [
    "Group",
    "Mesh",
    "InstancedMesh",
    "BufferGeometry",
    "Float32BufferAttribute",
    "Vector3",
    "Quaternion",
    "Matrix4",
    "BoxGeometry",
    "SphereGeometry",
    "CylinderGeometry",
    "ConeGeometry",
    "RingGeometry",
    "MeshLambertMaterial",
    "MeshBasicMaterial",
    "LineBasicMaterial",
    "LineSegments",
    "Line",
  ];
  for (const name of required) {
    if (typeof THREE?.[name] !== "function")
      throw new TypeError(`CASEVAC scenery requires THREE.${name}.`);
  }
}

function createResourceOwner() {
  const geometries = new Set();
  const materials = new Set();
  return {
    geometries,
    materials,
    geometry(value) {
      geometries.add(value);
      return value;
    },
    material(value) {
      materials.add(value);
      return value;
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      geometries.clear();
      materials.clear();
    },
  };
}

function setInstance(THREE, mesh, index, position, quaternion, scale, work) {
  work.matrix.compose(position, quaternion, scale);
  mesh.setMatrixAt(index, work.matrix);
}

function finishInstances(mesh) {
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox?.();
  mesh.computeBoundingSphere?.();
  return mesh;
}

function createLineGeometry(THREE, owner, segments, yOffset = 0) {
  const positions = [];
  for (const segment of segments) {
    positions.push(
      segment.from.x,
      segment.from.y + yOffset,
      segment.from.z,
      segment.to.x,
      segment.to.y + yOffset,
      segment.to.z,
    );
  }
  const geometry = owner.geometry(new THREE.BufferGeometry());
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createPad(THREE, owner, pad, siteId, materials) {
  const group = tagPresentationOnly(new THREE.Group(), "decorative-pad", siteId);
  group.name = `CASEVAC_${siteId.includes("pickup") ? "PICKUP" : "RECEIVER"}_PAD_VISUAL`;
  const geometry = owner.geometry(new THREE.BoxGeometry(1, 1, 1));
  const slab = tagPresentationOnly(
    new THREE.Mesh(geometry, materials.pad),
    "pad-surface-visual",
    siteId,
  );
  slab.name = "CASEVAC_PAD_SURFACE_PRESENTATION_ONLY";
  slab.position.set(
    pad.position.x,
    pad.position.y + pad.sizeM.y * 0.5,
    pad.position.z,
  );
  slab.scale.set(pad.sizeM.x, pad.sizeM.y, pad.sizeM.z);
  const edgeGeometry = owner.geometry(new THREE.RingGeometry(
    pad.sizeM.x * 0.46,
    pad.sizeM.x * 0.51,
    32,
  ));
  const edge = tagPresentationOnly(
    new THREE.Mesh(edgeGeometry, materials.padEdge),
    "pad-edge-visual",
    siteId,
  );
  edge.name = "CASEVAC_PAD_EDGE_PRESENTATION_ONLY";
  edge.rotation.x = -Math.PI * 0.5;
  edge.position.set(pad.position.x, pad.position.y + pad.sizeM.y + 0.012,
    pad.position.z);
  group.add(slab, edge);
  const markGeometry = owner.geometry(new THREE.BoxGeometry(1, 1, 1));
  for (const part of [
    { name: "LEFT", size: [1.1, 0.025, 8], x: -3.2, z: 0 },
    { name: "RIGHT", size: [1.1, 0.025, 8], x: 3.2, z: 0 },
    { name: "BAR", size: [6.4, 0.025, 1.1], x: 0, z: 0 },
  ]) {
    const marking = tagPresentationOnly(
      new THREE.Mesh(markGeometry, materials.padMarking),
      "pad-marking-visual",
      siteId,
    );
    marking.name = `CASEVAC_PAD_H_${part.name}`;
    marking.position.set(
      pad.position.x + part.x,
      pad.position.y + pad.sizeM.y + 0.035,
      pad.position.z + part.z,
    );
    marking.scale.set(...part.size);
    group.add(marking);
  }
  return group;
}

function createLandingLights(
  THREE,
  owner,
  positions,
  siteId,
  material,
  work,
) {
  const geometry = owner.geometry(new THREE.SphereGeometry(0.22, 7, 5));
  const lights = tagPresentationOnly(
    new THREE.InstancedMesh(geometry, material, positions.length),
    "landing-zone-lights",
    siteId,
  );
  lights.name = "CASEVAC_LANDING_ZONE_LIGHTS";
  for (let index = 0; index < positions.length; index++) {
    const position = positions[index];
    work.position.set(position.x, position.y, position.z);
    work.quaternion.identity();
    work.scale.set(1, 1, 1);
    setInstance(
      THREE,
      lights,
      index,
      work.position,
      work.quaternion,
      work.scale,
      work,
    );
  }
  return finishInstances(lights);
}

function createSignalSmoke(
  THREE,
  owner,
  definition,
  siteId,
  material,
  work,
) {
  const group = tagPresentationOnly(
    new THREE.Group(),
    "site-signal-smoke",
    siteId,
  );
  group.name = "CASEVAC_SITE_SIGNAL_SMOKE";
  group.position.set(
    definition.position.x,
    definition.position.y,
    definition.position.z,
  );
  group.visible = false;
  const geometry = owner.geometry(new THREE.SphereGeometry(1, 12, 8));
  const puffs = tagPresentationOnly(
    new THREE.InstancedMesh(geometry, material, definition.puffs),
    "site-signal-smoke-puffs",
    siteId,
  );
  puffs.name = "CASEVAC_SITE_SIGNAL_SMOKE_PUFFS";
  const instances = [];
  for (let index = 0; index < definition.puffs; index++) {
    const progress = index / Math.max(1, definition.puffs - 1);
    const angle = index * 2.17;
    const drift = 0.14 + progress * 0.72;
    const radius = 0.44 + progress * 1.32;
    const verticalRadius = 0.7 + progress * 1.65;
    instances.push(Object.freeze({
      progress,
      angle,
      drift,
      radius,
      verticalRadius,
      baseY: 2.2 + progress * definition.heightM,
    }));
    work.position.set(
      Math.cos(angle) * drift,
      2.2 + progress * definition.heightM,
      Math.sin(angle) * drift * 0.55,
    );
    work.quaternion.identity();
    work.scale.set(radius, verticalRadius, radius);
    setInstance(
      THREE,
      puffs,
      index,
      work.position,
      work.quaternion,
      work.scale,
      work,
    );
  }
  finishInstances(puffs);
  // The plume bends inside this bounded authored envelope. Avoid a stale instance bound popping
  // it out while wind changes; fourteen small puffs are cheaper than a per-frame bounds rebuild.
  puffs.frustumCulled = false;
  group.add(puffs);
  return { group, puffs, instances: Object.freeze(instances) };
}

function createStaff(
  THREE,
  owner,
  people,
  siteId,
  materials,
  work,
) {
  const group = tagPresentationOnly(
    new THREE.Group(),
    "anonymous-staff-silhouettes",
    siteId,
  );
  group.name = "CASEVAC_ANONYMOUS_STAFF";
  const bodyGeometry = owner.geometry(new THREE.BoxGeometry(0.58, 1, 0.36));
  bodyGeometry.translate(0, 0.5, 0);
  const headGeometry = owner.geometry(new THREE.SphereGeometry(0.22, 7, 5));
  const armGeometry = owner.geometry(new THREE.BoxGeometry(1, 1, 1));
  const legGeometry = owner.geometry(new THREE.BoxGeometry(0.17, 0.78, 0.19));
  const bodies = tagPresentationOnly(
    new THREE.InstancedMesh(bodyGeometry, materials.staff, people.length),
    "staff-bodies",
    siteId,
  );
  const heads = tagPresentationOnly(
    new THREE.InstancedMesh(headGeometry, materials.staffHead, people.length),
    "staff-heads",
    siteId,
  );
  const arms = tagPresentationOnly(
    new THREE.InstancedMesh(armGeometry, materials.staff, people.length),
    "staff-arms",
    siteId,
  );
  const legs = tagPresentationOnly(
    new THREE.InstancedMesh(legGeometry, materials.staffLegs, people.length * 2),
    "staff-legs",
    siteId,
  );
  bodies.name = "CASEVAC_STAFF_BODIES";
  heads.name = "CASEVAC_STAFF_HEADS";
  arms.name = "CASEVAC_STAFF_ARMS";
  legs.name = "CASEVAC_STAFF_LEGS";
  for (let index = 0; index < people.length; index++) {
    const person = people[index];
    work.quaternion.setFromAxisAngle(work.yAxis, person.yaw);
    if (person.pose === "shielding") {
      work.tiltQuaternion.setFromAxisAngle(work.zAxis, -0.18);
      work.quaternion.multiply(work.tiltQuaternion);
    }
    work.position.set(
      person.position.x,
      person.position.y + 0.76,
      person.position.z,
    );
    work.scale.set(1, 1.18, 1);
    setInstance(THREE, bodies, index, work.position, work.quaternion, work.scale, work);
    const cosine = Math.cos(person.yaw);
    const sine = Math.sin(person.yaw);
    for (let leg = 0; leg < 2; leg++) {
      const side = leg === 0 ? -0.15 : 0.15;
      work.position.set(
        person.position.x + cosine * side,
        person.position.y + 0.39,
        person.position.z - sine * side,
      );
      work.scale.set(1, 1, 1);
      setInstance(
        THREE,
        legs,
        index * 2 + leg,
        work.position,
        work.quaternion,
        work.scale,
        work,
      );
    }
    work.position.set(person.position.x, person.position.y + 1.5, person.position.z);
    work.scale.set(person.pose === "ready" ? 0.82 : 0.68, 0.12, 0.14);
    setInstance(THREE, arms, index, work.position, work.quaternion, work.scale, work);
    work.position.set(person.position.x, person.position.y + 2.12, person.position.z);
    work.scale.set(1, 1, 1);
    setInstance(THREE, heads, index, work.position, work.quaternion, work.scale, work);
  }
  finishInstances(bodies);
  finishInstances(heads);
  finishInstances(arms);
  finishInstances(legs);
  group.add(bodies, heads, arms, legs);
  return group;
}

function createResponseVehicle(
  THREE,
  owner,
  definition,
  siteId,
  materials,
  work,
) {
  const group = tagPresentationOnly(
    new THREE.Group(),
    "response-vehicle-silhouette",
    siteId,
  );
  group.name = "CASEVAC_RESPONSE_VEHICLE";
  group.position.set(
    definition.position.x,
    definition.position.y,
    definition.position.z,
  );
  group.rotation.y = definition.yaw;

  const body = tagPresentationOnly(
    new THREE.Mesh(
      owner.geometry(new THREE.BoxGeometry(5.4, 0.9, 2.25)),
      materials.vehicleBody,
    ),
    "response-vehicle-body",
    siteId,
  );
  body.name = "CASEVAC_RESPONSE_VEHICLE_BODY";
  body.position.y = 0.82;
  const cab = tagPresentationOnly(
    new THREE.Mesh(
      owner.geometry(new THREE.BoxGeometry(2.35, 1.18, 2.02)),
      materials.vehicleCab,
    ),
    "response-vehicle-cab",
    siteId,
  );
  cab.name = "CASEVAC_RESPONSE_VEHICLE_CAB";
  cab.position.set(1.05, 1.72, 0);

  const markGeometry = owner.geometry(new THREE.BoxGeometry(1, 1, 1));
  const roofMarks = tagPresentationOnly(
    new THREE.InstancedMesh(markGeometry, materials.vehicleMarking, 2),
    "response-vehicle-roof-mark",
    siteId,
  );
  roofMarks.name = "CASEVAC_RESPONSE_VEHICLE_ROOF_MARK";
  for (const [index, scale] of [
    [0, [1.35, 0.07, 0.32]],
    [1, [0.32, 0.07, 1.35]],
  ]) {
    work.position.set(0.98, 2.34, 0);
    work.quaternion.identity();
    work.scale.set(...scale);
    setInstance(
      THREE,
      roofMarks,
      index,
      work.position,
      work.quaternion,
      work.scale,
      work,
    );
  }
  finishInstances(roofMarks);

  const wheelGeometry = owner.geometry(new THREE.SphereGeometry(1, 8, 6));
  const wheels = tagPresentationOnly(
    new THREE.InstancedMesh(wheelGeometry, materials.vehicleWheel, 4),
    "response-vehicle-wheels",
    siteId,
  );
  wheels.name = "CASEVAC_RESPONSE_VEHICLE_WHEELS";
  let wheelIndex = 0;
  for (const x of [-1.75, 1.72]) {
    for (const z of [-1.08, 1.08]) {
      work.position.set(x, 0.45, z);
      work.quaternion.identity();
      work.scale.set(0.48, 0.48, 0.22);
      setInstance(
        THREE,
        wheels,
        wheelIndex++,
        work.position,
        work.quaternion,
        work.scale,
        work,
      );
    }
  }
  finishInstances(wheels);

  const beacon = tagPresentationOnly(
    new THREE.Mesh(
      owner.geometry(new THREE.SphereGeometry(0.16, 8, 5)),
      materials.vehicleBeacon,
    ),
    "response-vehicle-beacon",
    siteId,
  );
  beacon.name = "CASEVAC_RESPONSE_VEHICLE_BEACON";
  beacon.position.set(-0.2, 1.42, 0);
  group.add(body, cab, roofMarks, wheels, beacon);
  return group;
}

function createWindsock(THREE, owner, definition, siteId, materials) {
  const group = tagPresentationOnly(new THREE.Group(), "windsock", siteId);
  group.name = "CASEVAC_WINDSOCK";
  group.position.set(
    definition.position.x,
    definition.position.y,
    definition.position.z,
  );
  const mastGeometry = owner.geometry(new THREE.CylinderGeometry(
    0.07, 0.1, definition.mastHeightM, 7, 1,
  ));
  const mast = tagPresentationOnly(
    new THREE.Mesh(mastGeometry, materials.pole),
    "windsock-mast",
    siteId,
  );
  mast.position.y = definition.mastHeightM * 0.5;
  const pivot = tagPresentationOnly(new THREE.Group(), "windsock-pivot", siteId);
  pivot.position.y = definition.mastHeightM - 0.28;
  const sockGeometry = owner.geometry(new THREE.CylinderGeometry(
    0.13, 0.34, 2.6, 10, 1, true,
  ));
  sockGeometry.rotateZ(-Math.PI * 0.5);
  const sock = tagPresentationOnly(
    new THREE.Mesh(sockGeometry, materials.windsock),
    "windsock-fabric",
    siteId,
  );
  sock.name = "CASEVAC_WINDSOCK_FABRIC";
  sock.position.x = 1.25;
  pivot.add(sock);
  group.add(mast, pivot);
  return { group, pivot, sock };
}

function createCue(
  THREE,
  owner,
  cue,
  siteId,
  kind,
  material,
  arrowMaterial,
  work,
) {
  const group = tagPresentationOnly(
    new THREE.Group(),
    `${kind}-cue`,
    siteId,
  );
  group.name = `CASEVAC_${kind.toUpperCase()}_CUE`;
  group.visible = false;
  const points = cue.points.map((item) =>
    new THREE.Vector3(item.x, item.y, item.z));
  const geometry = owner.geometry(new THREE.BufferGeometry().setFromPoints(points));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const line = tagPresentationOnly(
    new THREE.Line(geometry, material),
    `${kind}-path`,
    siteId,
  );
  line.name = `CASEVAC_${kind.toUpperCase()}_PATH`;
  const arrowGeometry = owner.geometry(new THREE.ConeGeometry(0.7, 2.1, 3, 1));
  const arrows = tagPresentationOnly(
    new THREE.InstancedMesh(
      arrowGeometry,
      arrowMaterial,
      Math.max(0, points.length - 1),
    ),
    `${kind}-direction-arrows`,
    siteId,
  );
  arrows.name = `CASEVAC_${kind.toUpperCase()}_ARROWS`;
  for (let index = 1; index < points.length; index++) {
    work.direction.subVectors(points[index], points[index - 1]).normalize();
    work.position.lerpVectors(points[index - 1], points[index], 0.57);
    work.quaternion.setFromUnitVectors(work.yAxis, work.direction);
    work.scale.set(1, 1, 1);
    setInstance(
      THREE,
      arrows,
      index - 1,
      work.position,
      work.quaternion,
      work.scale,
      work,
    );
  }
  finishInstances(arrows);
  group.add(line, arrows);
  return group;
}

function createRain(THREE, owner, streaks, siteId, material) {
  const segments = streaks.map((streak) => ({
    from: { x: streak.x, y: streak.y, z: streak.z },
    to: {
      x: streak.x - 0.18,
      y: streak.y - streak.lengthM,
      z: streak.z + 0.08,
    },
  }));
  const rain = tagPresentationOnly(
    new THREE.LineSegments(
      createLineGeometry(THREE, owner, segments),
      material,
    ),
    "weather-rain-visual",
    siteId,
  );
  rain.name = "CASEVAC_RAIN_PRESENTATION";
  rain.visible = false;
  return rain;
}

function createRotorWash(THREE, owner, siteId, material) {
  const geometry = owner.geometry(new THREE.RingGeometry(5.5, 7.4, 36));
  const ring = tagPresentationOnly(
    new THREE.Mesh(geometry, material),
    "rotor-wash-visual",
    siteId,
  );
  ring.name = "CASEVAC_ROTOR_WASH_PRESENTATION";
  ring.rotation.x = -Math.PI * 0.5;
  ring.position.y = 0.2;
  ring.visible = false;
  return ring;
}

function createCapsule(THREE, owner, materials) {
  const group = tagPresentationOnly(
    new THREE.Group(),
    "opaque-casualty-capsule-silhouette",
  );
  group.name = "CASEVAC_OPAQUE_CAPSULE";
  group.userData.capsuleId = CASEVAC_CAPSULE_ID;
  const bodyGeometry = owner.geometry(new THREE.BoxGeometry(2.55, 0.76, 0.92));
  const body = tagPresentationOnly(
    new THREE.Mesh(bodyGeometry, materials.capsule),
    "capsule-body",
  );
  const bandGeometry = owner.geometry(new THREE.BoxGeometry(0.16, 0.82, 0.98));
  for (const x of [-0.74, 0.74]) {
    const band = tagPresentationOnly(
      new THREE.Mesh(bandGeometry, materials.capsuleBand),
      "capsule-retention-band",
    );
    band.position.x = x;
    group.add(band);
  }
  body.castShadow = true;
  group.add(body);
  return group;
}

function createMaterials(THREE, owner) {
  const lambert = (color, options = {}) => {
    const parameters = {
      color,
      emissive: options.emissive ?? color,
      emissiveIntensity: options.emissiveIntensity ?? 0.08,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1,
    };
    if (options.side !== undefined) parameters.side = options.side;
    if (options.depthWrite !== undefined)
      parameters.depthWrite = options.depthWrite;
    return owner.material(new THREE.MeshLambertMaterial(parameters));
  };
  const basic = (color, options = {}) => {
    const parameters = {
      color,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1,
    };
    if (options.side !== undefined) parameters.side = options.side;
    if (options.depthWrite !== undefined)
      parameters.depthWrite = options.depthWrite;
    return owner.material(new THREE.MeshBasicMaterial(parameters));
  };
  return {
    pad: lambert(COLORS.orchardGround),
    receiverPad: lambert(COLORS.receiverGround),
    padEdge: basic(COLORS.padEdge, {
      side: THREE.DoubleSide,
    }),
    padMarking: basic(COLORS.padMarking),
    landingLight: lambert(COLORS.landingLight, {
      emissive: COLORS.landingLight,
      emissiveIntensity: 1.8,
    }),
    pole: lambert(COLORS.pole),
    staff: lambert(COLORS.staff),
    staffHead: lambert(COLORS.staffHead),
    staffLegs: lambert(COLORS.staffLegs),
    pickupVehicle: lambert(COLORS.pickupVehicle, {
      emissiveIntensity: 0.12,
    }),
    receiverVehicle: lambert(COLORS.receiverVehicle, {
      emissiveIntensity: 0.1,
    }),
    vehicleCab: lambert(COLORS.vehicleCab),
    pickupVehicleMarking: basic(COLORS.pickupVehicleMarking),
    receiverVehicleMarking: basic(COLORS.receiverVehicleMarking),
    vehicleWheel: lambert(COLORS.vehicleWheel),
    vehicleBeacon: lambert(COLORS.vehicleBeacon, {
      emissive: COLORS.vehicleBeacon,
      emissiveIntensity: 1.45,
    }),
    windsock: lambert(COLORS.capsuleBand, {
      side: THREE.DoubleSide,
    }),
    capsule: lambert(COLORS.capsule),
    capsuleBand: lambert(COLORS.capsuleBand),
    approachLine: owner.material(new THREE.LineBasicMaterial({
      color: COLORS.cueApproach,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    })),
    approachArrow: basic(COLORS.cueApproach, {
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    }),
    escapeLine: owner.material(new THREE.LineBasicMaterial({
      color: COLORS.cueEscape,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    })),
    escapeArrow: basic(COLORS.cueEscape, {
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    }),
    rain: owner.material(new THREE.LineBasicMaterial({
      color: COLORS.rain,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })),
    rotorWash: [
      basic(COLORS.rotorWash, {
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      basic(COLORS.rotorWash, {
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    ],
    signalSmoke: [
      lambert(COLORS.pickupSignal, {
        emissive: COLORS.pickupSignal,
        emissiveIntensity: 0.1,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      }),
      lambert(COLORS.receiverSignal, {
        emissive: COLORS.receiverSignal,
        emissiveIntensity: 0.1,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      }),
    ],
  };
}

function globalBounds(plan, anchors) {
  const siteBounds = [
    [plan.sites.pickup, anchors.pickup],
    [plan.sites.receiver, anchors.receiver],
  ];
  const minimum = { x: Infinity, y: Infinity, z: Infinity };
  const maximum = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const [site, anchor] of siteBounds) {
    const radiusX = Math.max(
      Math.abs(site.envelope.minimum.x),
      Math.abs(site.envelope.maximum.x),
    );
    const radiusZ = Math.max(
      Math.abs(site.envelope.minimum.z),
      Math.abs(site.envelope.maximum.z),
    );
    const cosine = Math.abs(Math.cos(anchor.yaw));
    const sine = Math.abs(Math.sin(anchor.yaw));
    const rotatedRadiusX = cosine * radiusX + sine * radiusZ;
    const rotatedRadiusZ = sine * radiusX + cosine * radiusZ;
    minimum.x = Math.min(minimum.x, anchor.x - rotatedRadiusX);
    maximum.x = Math.max(maximum.x, anchor.x + rotatedRadiusX);
    minimum.y = Math.min(minimum.y, anchor.y + site.envelope.minimum.y);
    maximum.y = Math.max(maximum.y, anchor.y + site.envelope.maximum.y);
    minimum.z = Math.min(minimum.z, anchor.z - rotatedRadiusZ);
    maximum.z = Math.max(maximum.z, anchor.z + rotatedRadiusZ);
  }
  return Object.freeze({
    minimum: Object.freeze(minimum),
    maximum: Object.freeze(maximum),
  });
}

function createSite(
  THREE,
  owner,
  key,
  definition,
  anchor,
  materials,
  work,
) {
  const group = tagPresentationOnly(
    new THREE.Group(),
    `${key}-site-scenery`,
    definition.id,
  );
  group.name = `CASEVAC_${key.toUpperCase()}_SITE_PRESENTATION`;
  group.position.set(anchor.x, anchor.y, anchor.z);
  group.rotation.y = anchor.yaw;
  const siteMaterials = {
    pad: key === "pickup" ? materials.pad : materials.receiverPad,
    padEdge: materials.padEdge,
    padMarking: materials.padMarking,
    pole: materials.pole,
    staff: materials.staff,
    staffHead: materials.staffHead,
    staffLegs: materials.staffLegs,
    vehicleBody: key === "pickup"
      ? materials.pickupVehicle
      : materials.receiverVehicle,
    vehicleCab: materials.vehicleCab,
    vehicleMarking: key === "pickup"
      ? materials.pickupVehicleMarking
      : materials.receiverVehicleMarking,
    vehicleWheel: materials.vehicleWheel,
    vehicleBeacon: materials.vehicleBeacon,
    windsock: materials.windsock,
  };
  group.add(
    createPad(THREE, owner, definition.pad, definition.id, siteMaterials),
    createStaff(
      THREE,
      owner,
      definition.people,
      definition.id,
      siteMaterials,
      work,
    ),
    createLandingLights(
      THREE,
      owner,
      definition.landingLights,
      definition.id,
      materials.landingLight,
      work,
    ),
    createResponseVehicle(
      THREE,
      owner,
      definition.responseVehicle,
      definition.id,
      siteMaterials,
      work,
    ),
  );
  const windsock = createWindsock(
    THREE,
    owner,
    definition.windsock,
    definition.id,
    siteMaterials,
  );
  const approach = createCue(
    THREE,
    owner,
    definition.approachCue,
    definition.id,
    "approach",
    materials.approachLine,
    materials.approachArrow,
    work,
  );
  const escape = createCue(
    THREE,
    owner,
    definition.escapeCue,
    definition.id,
    "escape",
    materials.escapeLine,
    materials.escapeArrow,
    work,
  );
  const rain = createRain(
    THREE,
    owner,
    definition.rain,
    definition.id,
    materials.rain,
  );
  const rotorWash = createRotorWash(
    THREE,
    owner,
    definition.id,
    materials.rotorWash[key === "pickup" ? 0 : 1],
  );
  const signal = createSignalSmoke(
    THREE,
    owner,
    definition.signal,
    definition.id,
    materials.signalSmoke[key === "pickup" ? 0 : 1],
    work,
  );
  group.add(windsock.group, approach, escape, rain, rotorWash, signal.group);
  group.traverse((object) => {
    if (!object.isMesh || object.material?.transparent === true) return;
    const kind = object.userData.casevac?.kind;
    object.castShadow = SHADOW_CASTER_KINDS.has(kind);
    object.receiveShadow = SHADOW_RECEIVER_KINDS.has(kind);
  });
  group.userData.casevacSite = Object.freeze({
    id: definition.id,
    role: definition.role,
    presentationOnly: true,
    authoritative: false,
    collisionSource: false,
  });
  return {
    key,
    id: definition.id,
    definition,
    anchor,
    group,
    windsock,
    approach,
    escape,
    rain,
    rotorWash,
    signal,
  };
}

function updateSignalSmoke(THREE, controller, elapsedSeconds, windX, windZ, work) {
  const cosine = Math.cos(controller.anchor.yaw);
  const sine = Math.sin(controller.anchor.yaw);
  const localWindX = cosine * windX + sine * windZ;
  const localWindZ = -sine * windX + cosine * windZ;
  for (let index = 0; index < controller.signal.instances.length; index++) {
    const puff = controller.signal.instances[index];
    const windProgress = Math.pow(puff.progress, 1.32) * 0.58;
    const breathing = 0.97
      + Math.sin(elapsedSeconds * 0.72 + puff.angle) * 0.035;
    const sway = Math.sin(elapsedSeconds * 0.38 + puff.angle * 0.7)
      * (0.08 + puff.progress * 0.28);
    work.position.set(
      Math.cos(puff.angle) * puff.drift
        + localWindX * windProgress + sway,
      puff.baseY
        + Math.sin(elapsedSeconds * 0.44 + puff.angle) * 0.12,
      Math.sin(puff.angle) * puff.drift * 0.55
        + localWindZ * windProgress + sway * 0.45,
    );
    work.quaternion.identity();
    work.scale.set(
      puff.radius * breathing,
      puff.verticalRadius * breathing,
      puff.radius * breathing,
    );
    setInstance(
      THREE,
      controller.signal.puffs,
      index,
      work.position,
      work.quaternion,
      work.scale,
      work,
    );
  }
  controller.signal.puffs.instanceMatrix.needsUpdate = true;
}

function activeSiteKey(value) {
  if (value === "pickup" || value === CASEVAC_COURSE_SITE_IDS.pickup)
    return "pickup";
  if (value === "receiver" || value === CASEVAC_COURSE_SITE_IDS.receiver)
    return "receiver";
  return null;
}

function rotorWashAtSite(frame, controller) {
  const wash = frame?.rotorWash;
  const intensity = clamp(finite(wash?.intensity01), 0, 1);
  const radiusM = clamp(finite(wash?.radiusM, 24), 1, 80);
  if (intensity <= 0 || !wash?.position) return 0;
  const dx = finite(wash.position.x) - controller.anchor.x;
  const dz = finite(wash.position.z) - controller.anchor.z;
  const distance = Math.hypot(dx, dz);
  return intensity * clamp(1 - distance / radiusM, 0, 1);
}

function updateWindsock(controller, windX, windZ) {
  const speed = Math.hypot(windX, windZ);
  if (speed > 0.05)
    controller.group.rotation.y = -Math.atan2(windZ, windX);
  const extension = clamp(speed / 12, 0.18, 1);
  const droop = (1 - extension) * 0.72;
  controller.pivot.rotation.z = -droop;
  controller.sock.scale.x = 0.62 + extension * 0.38;
  controller.sock.material.opacity = 0.76 + extension * 0.24;
  controller.sock.material.transparent = extension < 0.99;
}

function applyCapsuleState(capsule, state, sites) {
  const custody = Object.values(CASEVAC_CAPSULE_VISUAL_STATES).includes(state)
    ? state
    : null;
  capsule.userData.visualCustody = custody ?? "UNKNOWN";
  if (custody === CASEVAC_CAPSULE_VISUAL_STATES.inAircraft || custody === null) {
    capsule.visible = false;
    return;
  }
  const site = custody === CASEVAC_CAPSULE_VISUAL_STATES.atReceiver
    ? sites.receiver
    : sites.pickup;
  if (capsule.parent !== site.group) site.group.add(capsule);
  capsule.position.set(
    site.definition.capsuleStand.x,
    site.definition.capsuleStand.y,
    site.definition.capsuleStand.z,
  );
  capsule.rotation.set(0, custody === CASEVAC_CAPSULE_VISUAL_STATES.atReceiver
    ? Math.PI * 0.5
    : -Math.PI * 0.18, 0);
  capsule.visible = true;
}

export function createCasevacCourseScenery(THREE, options = {}) {
  validateThree(THREE);
  const plan = planCasevacCourseScenery(options);
  const owner = createResourceOwner();
  const root = tagPresentationOnly(
    new THREE.Group(),
    "casevac-course-scenery-root",
  );
  root.name = "CASEVAC_COURSE_SCENERY_PRESENTATION_ONLY";
  const anchors = Object.freeze({
    pickup: normalAnchor(options.anchors?.pickup, CASEVAC_DEFAULT_ANCHORS.pickup),
    receiver: normalAnchor(
      options.anchors?.receiver,
      CASEVAC_DEFAULT_ANCHORS.receiver,
    ),
  });
  const work = {
    matrix: new THREE.Matrix4(),
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    tiltQuaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    yAxis: new THREE.Vector3(0, 1, 0),
    zAxis: new THREE.Vector3(0, 0, 1),
  };
  const materials = createMaterials(THREE, owner);
  const sites = {
    pickup: createSite(
      THREE,
      owner,
      "pickup",
      plan.sites.pickup,
      anchors.pickup,
      materials,
      work,
    ),
    receiver: createSite(
      THREE,
      owner,
      "receiver",
      plan.sites.receiver,
      anchors.receiver,
      materials,
      work,
    ),
  };
  root.add(sites.pickup.group, sites.receiver.group);
  const capsule = createCapsule(THREE, owner, materials);
  applyCapsuleState(
    capsule,
    options.capsuleCustody ?? CASEVAC_CAPSULE_VISUAL_STATES.atPickup,
    sites,
  );
  const bounds = globalBounds(plan, anchors);
  root.userData.casevacScenery = {
    schema: CASEVAC_SCENERY_SCHEMA,
    presentationOnly: true,
    authoritative: false,
    collisionSource: false,
    missionAuthority: false,
    qualityTier: plan.qualityTier,
    seed: plan.seed,
    counts: plan.counts,
    bounds,
    disposed: false,
  };
  let disposed = false;
  let elapsedSecondsState = 0;

  const api = {
    group: root,
    plan,
    anchors,
    update(frame = {}) {
      if (disposed) return;
      const elapsedSeconds = finite(
        frame.elapsedSeconds ?? frame.timeSeconds,
        elapsedSecondsState,
      );
      const windX = finite(frame.windX ?? frame.wind?.x);
      const windZ = finite(frame.windZ ?? frame.wind?.z);
      const precipitation01 = clamp(finite(
        frame.precipitation01 ?? frame.weather?.precipitation01,
      ), 0, 1);
      elapsedSecondsState = elapsedSeconds;
      const windAngle = Math.atan2(windX, Math.abs(windZ) + 0.001);
      materials.rain.opacity = precipitation01 * 0.52;
      materials.rain.needsUpdate = true;
      const activeKey = activeSiteKey(frame.activeSiteId);
      for (const controller of Object.values(sites)) {
        updateWindsock(controller.windsock, windX, windZ);
        controller.rain.visible = precipitation01 > 0.01;
        controller.rain.position.y =
          -((elapsedSeconds * (4.5 + precipitation01 * 5.5)) % 6);
        controller.rain.rotation.z = -windAngle * 0.16;
        controller.approach.visible = frame.showApproachCue === true
          && activeKey === controller.key;
        controller.escape.visible = frame.showEscapeCue === true
          && activeKey === controller.key;
        // A target ID is navigation truth for the whole leg, not permission to invent a ground
        // signal kilometres early. The explicit terminal cue is the bounded presentation edge.
        const signalActive = frame.showApproachCue === true
          && activeKey === controller.key;
        controller.signal.group.visible = signalActive;
        if (signalActive) {
          updateSignalSmoke(
            THREE,
            controller,
            elapsedSeconds,
            windX,
            windZ,
            work,
          );
        }
        const wash = rotorWashAtSite(frame, controller);
        controller.rotorWash.visible = wash > 0.005;
        controller.rotorWash.material.opacity = wash * 0.5;
        if (wash > 0.005 && frame.rotorWash?.position) {
          const worldDx = finite(frame.rotorWash.position.x) - controller.anchor.x;
          const worldDz = finite(frame.rotorWash.position.z) - controller.anchor.z;
          const cosine = Math.cos(controller.anchor.yaw);
          const sine = Math.sin(controller.anchor.yaw);
          controller.rotorWash.position.x = cosine * worldDx + sine * worldDz;
          controller.rotorWash.position.z = -sine * worldDx + cosine * worldDz;
        }
        const pulse = 1 + wash * (0.18
          + 0.05 * Math.sin(elapsedSeconds * 7.5));
        controller.rotorWash.scale.set(pulse, pulse, pulse);
        controller.rotorWash.rotation.z = elapsedSeconds * (0.35 + wash);
      }
      if (Object.hasOwn(frame, "capsuleCustody"))
        applyCapsuleState(capsule, frame.capsuleCustody, sites);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.userData.casevacScenery.disposed = true;
      root.traverse((object) => {
        if (object.isInstancedMesh && typeof object.dispose === "function")
          object.dispose();
      });
      root.removeFromParent();
      owner.dispose();
    },
    get disposed() {
      return disposed;
    },
  };
  return Object.freeze(api);
}
