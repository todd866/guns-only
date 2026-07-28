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
  orchardGround: 0x7c7356,
  receiverGround: 0x777b76,
  padEdge: 0xd4c99d,
  pole: 0x5b5650,
  staff: 0x65716c,
  staffHead: 0xc7a681,
  capsule: 0xb8b59f,
  capsuleBand: 0xe2a94f,
  cueApproach: 0xa9d8c0,
  cueEscape: 0xe5bd69,
  rain: 0xb9d3d8,
  rotorWash: 0xcdd6b5,
});

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
  return group;
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
  const bodyGeometry = owner.geometry(new THREE.CylinderGeometry(
    0.22, 0.32, 1, 7, 1,
  ));
  bodyGeometry.translate(0, 0.5, 0);
  const headGeometry = owner.geometry(new THREE.SphereGeometry(0.22, 7, 5));
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
  bodies.name = "CASEVAC_STAFF_BODIES";
  heads.name = "CASEVAC_STAFF_HEADS";
  for (let index = 0; index < people.length; index++) {
    const person = people[index];
    work.quaternion.setFromAxisAngle(work.yAxis, person.yaw);
    if (person.pose === "shielding") {
      work.tiltQuaternion.setFromAxisAngle(work.zAxis, -0.18);
      work.quaternion.multiply(work.tiltQuaternion);
    }
    work.position.set(person.position.x, person.position.y, person.position.z);
    work.scale.set(1, 1.45, 1);
    setInstance(THREE, bodies, index, work.position, work.quaternion, work.scale, work);
    work.position.y += 1.72;
    work.scale.set(1, 1, 1);
    setInstance(THREE, heads, index, work.position, work.quaternion, work.scale, work);
  }
  finishInstances(bodies);
  finishInstances(heads);
  group.add(bodies, heads);
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
    pole: lambert(COLORS.pole),
    staff: lambert(COLORS.staff),
    staffHead: lambert(COLORS.staffHead),
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
    pole: materials.pole,
    staff: materials.staff,
    staffHead: materials.staffHead,
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
  group.add(windsock.group, approach, escape, rain, rotorWash);
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
  };
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
        const wash = rotorWashAtSite(frame, controller);
        controller.rotorWash.visible = wash > 0.005;
        controller.rotorWash.material.opacity = wash * 0.34;
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
