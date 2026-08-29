import * as THREE from "../vendor/three.module.js";

const COLORS = Object.freeze({
  void: 0x020605,
  shadow: 0x17272b,
  wall: 0x405b5c,
  floor: 0x30383a,
  warm: 0x6b6456,
  green: 0x4dff88,
  cyan: 0x62eaff,
  amber: 0xffb020,
  danger: 0xff465d,
  hostile: 0xb94f55,
});

const vector = (value) => new THREE.Vector3(value.x, value.y, value.z);
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

function boxSize(box) {
  return new THREE.Vector3(
    box.max.x - box.min.x,
    box.max.y - box.min.y,
    box.max.z - box.min.z,
  );
}

function boxCenter(box) {
  return new THREE.Vector3(
    (box.min.x + box.max.x) * 0.5,
    (box.min.y + box.max.y) * 0.5,
    (box.min.z + box.max.z) * 0.5,
  );
}

function seededUnit(seed) {
  const value = Math.sin(seed * 91.17 + 14.31) * 43758.5453;
  return value - Math.floor(value);
}

function makeGradientTexture() {
  const texture = new THREE.DataTexture(
    new Uint8Array([36, 91, 163, 232]),
    4,
    1,
    THREE.RedFormat,
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function disposeObject(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) {
      for (const material of object.material) material.dispose?.();
    } else {
      object.material?.dispose?.();
    }
  });
}

function roundedBoxGeometry(width, height, depth, radius = 0.12) {
  const bevel = Math.max(0.01, Math.min(radius, width * 0.18, height * 0.18, depth * 0.18));
  const shape = new THREE.Shape();
  const halfWidth = width * 0.5 - bevel;
  const halfHeight = height * 0.5 - bevel;
  shape.moveTo(-halfWidth, -halfHeight);
  shape.lineTo(halfWidth, -halfHeight);
  shape.lineTo(halfWidth, halfHeight);
  shape.lineTo(-halfWidth, halfHeight);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.02, depth - bevel * 2),
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 1,
  });
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

function meshBox(size, position, material, radius = 0) {
  const geometry = radius > 0
    ? roundedBoxGeometry(size.x, size.y, size.z, radius)
    : new THREE.BoxGeometry(size.x, size.y, size.z);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  return mesh;
}

function setShadow(root, enabled) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = enabled;
    object.receiveShadow = enabled;
  });
}

function createRelayModel(materials) {
  const group = new THREE.Group();
  group.name = "relay-station";

  const base = meshBox(
    new THREE.Vector3(1.35, 0.22, 1.05),
    new THREE.Vector3(0, 0.11, 0),
    materials.dark,
    0.08,
  );
  group.add(base);

  const body = meshBox(
    new THREE.Vector3(0.92, 1.1, 0.72),
    new THREE.Vector3(0, 0.76, 0),
    materials.warm,
    0.11,
  );
  group.add(body);

  const face = meshBox(
    new THREE.Vector3(0.61, 0.5, 0.025),
    new THREE.Vector3(0, 0.83, -0.37),
    materials.relayScreen,
    0.02,
  );
  face.userData.noTone = true;
  group.add(face);

  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 1.1, 8),
    materials.metal,
  );
  antenna.position.set(0.29, 1.72, 0.08);
  group.add(antenna);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.21, 0.025, 6, 18),
    materials.green,
  );
  ring.position.set(0.29, 2.15, 0.08);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  return group;
}

function createObjectiveModel(materials, index) {
  const group = new THREE.Group();
  group.name = `objective-${index}`;

  const frame = new THREE.Mesh(
    new THREE.TorusGeometry(0.71, 0.085, 6, 8),
    materials.warm,
  );
  frame.rotation.z = Math.PI / 8;
  group.add(frame);

  const outer = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.49, 1),
    materials.objectiveShell,
  );
  outer.name = "shell";
  group.add(outer);

  const inner = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.29, 1),
    materials.objective,
  );
  inner.name = "core";
  group.add(inner);

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.88, 0.018, 4, 48),
    materials.objective,
  );
  halo.name = "halo";
  group.add(halo);

  const floorMark = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.75, 20),
    materials.objectiveFloor,
  );
  floorMark.position.y = -1.96;
  floorMark.rotation.x = -Math.PI / 2;
  floorMark.name = "floor-mark";
  group.add(floorMark);

  return group;
}

function createSentryModel(materials, index, role = "sentry") {
  const group = new THREE.Group();
  group.name = `sentry-${index}`;

  const body = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.29, 1),
    role === "investigator" ? materials.amber : materials.hostile,
  );
  body.scale.set(1.35, 0.75, 1);
  group.add(body);

  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 10, 6),
    materials.danger,
  );
  eye.position.set(0, 0, -0.31);
  group.add(eye);

  for (const side of [-1, 1]) {
    const arm = meshBox(
      new THREE.Vector3(0.38, 0.045, 0.06),
      new THREE.Vector3(side * 0.35, 0, 0),
      materials.metal,
    );
    group.add(arm);
    const rotor = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.025, 5, 20),
      materials.hostileDark,
    );
    rotor.position.set(side * 0.58, 0.03, 0);
    rotor.rotation.x = Math.PI / 2;
    rotor.name = "rotor";
    group.add(rotor);
  }

  const gun = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.05, 0.34, 7),
    materials.metal,
  );
  gun.position.set(0, -0.12, -0.34);
  gun.rotation.x = Math.PI / 2;
  group.add(gun);

  return group;
}

function createSurveyMarker(materials) {
  const group = new THREE.Group();
  group.name = "survey-marker";
  group.visible = false;

  const outerMaterial = materials.cyan.clone();
  outerMaterial.transparent = true;
  outerMaterial.opacity = 0.56;
  const outer = new THREE.Mesh(
    new THREE.TorusGeometry(0.68, 0.026, 5, 36),
    outerMaterial,
  );
  outer.name = "scan-ring";
  outer.rotation.x = Math.PI / 2;
  group.add(outer);

  const hoopMaterial = materials.cyan.clone();
  hoopMaterial.transparent = true;
  hoopMaterial.opacity = 0.3;
  const hoop = new THREE.Mesh(
    new THREE.TorusGeometry(0.46, 0.018, 5, 28),
    hoopMaterial,
  );
  hoop.name = "scan-hoop";
  group.add(hoop);

  const progressMaterial = materials.green.clone();
  progressMaterial.transparent = true;
  progressMaterial.opacity = 0.44;
  const progress = new THREE.Mesh(
    new THREE.TorusGeometry(0.33, 0.024, 5, 28),
    progressMaterial,
  );
  progress.name = "scan-progress";
  progress.rotation.x = Math.PI / 2;
  group.add(progress);

  const beaconMaterial = materials.cyan.clone();
  beaconMaterial.transparent = true;
  beaconMaterial.opacity = 0.72;
  const beacon = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.09, 0),
    beaconMaterial,
  );
  beacon.name = "scan-beacon";
  group.add(beacon);

  return group;
}

function hostileIsPresent(hostile) {
  return hostile?.alive === true
    && hostile.active === true
    && hostile.present === true;
}

export function indoorRouteCueState({
  pathIndex,
  routeProgress = 0,
  linkMode = "fiber",
  direction = "ingress",
} = {}) {
  const offset = direction === "return"
    ? Number(routeProgress) - Number(pathIndex)
    : Number(pathIndex) - Number(routeProgress);
  const visible = linkMode === "fiber" && offset >= 1 && offset <= 2;
  return Object.freeze({
    visible,
    opacity: visible ? (offset === 1 ? 0.68 : 0.2) : 0,
  });
}

function createDroneFrame(materials) {
  const group = new THREE.Group();
  group.name = "camera-airframe";

  for (const side of [-1, 1]) {
    const arm = meshBox(
      new THREE.Vector3(0.46, 0.025, 0.035),
      new THREE.Vector3(side * 0.42, -0.34, -0.7),
      materials.frame,
    );
    arm.rotation.z = side * 0.2;
    group.add(arm);

    const guard = new THREE.Mesh(
      new THREE.TorusGeometry(0.21, 0.014, 5, 28, Math.PI * 0.86),
      materials.frame,
    );
    guard.position.set(side * 0.66, -0.3, -0.72);
    guard.rotation.z = side > 0 ? Math.PI * 0.57 : Math.PI * 1.43;
    group.add(guard);
  }

  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.09, 0.018, 6, 18),
    materials.green,
  );
  collar.position.set(0, -0.31, 0.04);
  collar.rotation.x = Math.PI / 2;
  collar.name = "fiber-collar";
  group.add(collar);

  group.visible = true;
  return group;
}

function createSpark(material, position, seed = 0) {
  const group = new THREE.Group();
  const shardMaterial = material.clone();
  group.position.copy(position);
  group.userData.age = 0;
  group.userData.life = 0.42;
  group.userData.velocity = [];

  for (let index = 0; index < 9; index += 1) {
    const shard = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 0.025, 0.11 + seededUnit(seed + index) * 0.12),
      shardMaterial,
    );
    const direction = new THREE.Vector3(
      seededUnit(seed + index * 3 + 1) * 2 - 1,
      seededUnit(seed + index * 3 + 2) * 2 - 0.25,
      seededUnit(seed + index * 3 + 3) * 2 - 1,
    ).normalize();
    shard.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    group.userData.velocity.push(direction.multiplyScalar(1.5 + seededUnit(seed + index + 20) * 2.5));
    group.add(shard);
  }
  return group;
}

export class IndoorPresentation {
  constructor(canvas, facility, options = {}) {
    this.canvas = canvas;
    this.facility = facility;
    this.reducedMotion = options.reducedMotion === true;
    this.touch = options.touch === true;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.void);
    this.scene.fog = new THREE.FogExp2(COLORS.void, 0.028);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.touch,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.touch ? 1.15 : 1.5));

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.03, 130);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);

    this.gradient = makeGradientTexture();
    const toon = (color, emissive = 0x000000, emissiveIntensity = 1) =>
      new THREE.MeshToonMaterial({
        color,
        emissive,
        emissiveIntensity,
        gradientMap: this.gradient,
        side: THREE.DoubleSide,
      });
    const basic = (color, opacity = 1) => new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.materials = {
      wall: toon(COLORS.wall),
      wallDark: toon(COLORS.shadow),
      floor: toon(COLORS.floor),
      dark: toon(0x101c1c),
      warm: toon(COLORS.warm),
      metal: toon(0x293536),
      hostile: toon(COLORS.hostile, 0x310b12, 0.7),
      hostileDark: toon(0x57232b),
      danger: basic(COLORS.danger),
      green: basic(COLORS.green),
      cyan: basic(COLORS.cyan),
      amber: basic(COLORS.amber),
      objective: basic(COLORS.cyan),
      objectiveShell: toon(0x36585d, 0x0b2931, 0.7),
      objectiveFloor: basic(COLORS.cyan, 0.35),
      relayScreen: basic(COLORS.green),
      frame: basic(0x6a8f82, 0.72),
      projectilePlayer: basic(0xffe4a6),
      projectileHostile: basic(COLORS.danger),
      fiber: new THREE.LineBasicMaterial({
        color: COLORS.green,
        transparent: true,
        opacity: 0.96,
        toneMapped: false,
      }),
      spark: basic(0xffd472),
      inactive: basic(0x21312e, 0.26),
    };

    const hemisphere = new THREE.HemisphereLight(0xa8ffe0, 0x07110f, 1.1);
    this.scene.add(hemisphere);
    const key = new THREE.DirectionalLight(0xd6ffec, 1.35);
    key.position.set(-7, 12, 10);
    key.castShadow = !this.touch;
    key.shadow.mapSize.set(this.touch ? 512 : 1024, this.touch ? 512 : 1024);
    key.shadow.camera.left = -17;
    key.shadow.camera.right = 17;
    key.shadow.camera.top = 21;
    key.shadow.camera.bottom = -21;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 50;
    this.scene.add(key);

    this.world = new THREE.Group();
    this.world.name = "facility";
    this.scene.add(this.world);
    this.doorMeshes = new Map();
    this.objectiveModels = new Map();
    this.hostileModels = new Map();
    this.surveyModels = new Map();
    this.visibleHostileIds = new Set();
    this.projectileModels = new Map();
    this.routeRings = [];
    this.routeProgress = 0;
    this.lastRouteTick = -1;
    this.lastRouteDirection = "ingress";
    this.sparks = [];
    this.lastProjectilePositions = new Map();
    this.aimMeshes = [];
    this.occluderMeshes = [];
    this.shake = 0;
    this.hitPulse = 0;
    this.targetInfo = null;
    this.surveyTargetInfo = null;

    this.buildFacility();
    this.fiberGeometry = new THREE.BufferGeometry();
    this.fiberLine = new THREE.Line(this.fiberGeometry, this.materials.fiber);
    this.fiberLine.frustumCulled = false;
    this.scene.add(this.fiberLine);

    this.droneFrame = createDroneFrame(this.materials);
    this.camera.add(this.droneFrame);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 36;

    this.resize();
  }

  buildFacility() {
    const floorIds = new Set(["floor"]);
    const ceilingIds = new Set(["ceiling"]);
    for (const wall of this.facility.walls) {
      const size = boxSize(wall.aabb);
      const center = boxCenter(wall.aabb);
      const material = floorIds.has(wall.id)
        ? this.materials.floor
        : ceilingIds.has(wall.id) ? this.materials.wallDark
          : wall.id.includes("spine") ? this.materials.warm : this.materials.wall;
      const mesh = meshBox(size, center, material, Math.min(0.12, size.x * 0.18, size.z * 0.18));
      mesh.name = wall.id;
      mesh.userData.kind = "solid";
      mesh.userData.id = wall.id;
      this.world.add(mesh);
      this.occluderMeshes.push(mesh);
    }

    for (const door of this.facility.doors) {
      const size = boxSize(door.aabb);
      const center = boxCenter(door.aabb);
      const group = new THREE.Group();
      group.position.copy(center);
      group.name = door.id;

      const slab = meshBox(
        new THREE.Vector3(size.x, size.y, Math.max(size.z, 0.11)),
        new THREE.Vector3(),
        this.materials.warm,
        0.08,
      );
      slab.userData.kind = "solid";
      slab.userData.id = door.id;
      group.add(slab);
      this.occluderMeshes.push(slab);

      for (const x of [-size.x * 0.5 - 0.12, size.x * 0.5 + 0.12]) {
        const jamb = meshBox(
          new THREE.Vector3(0.18, size.y + 0.6, 0.42),
          new THREE.Vector3(x, 0, 0),
          this.materials.dark,
          0.04,
        );
        group.add(jamb);
      }
      const lintel = meshBox(
        new THREE.Vector3(size.x + 0.55, 0.22, 0.42),
        new THREE.Vector3(0, size.y * 0.5 + 0.22, 0),
        this.materials.dark,
        0.04,
      );
      group.add(lintel);
      this.world.add(group);
      this.doorMeshes.set(door.id, { group, slab, closedY: center.y });
    }

    const relay = createRelayModel(this.materials);
    relay.position.copy(vector(this.facility.relayPosition));
    relay.position.y = 0;
    relay.rotation.y = Math.PI;
    this.world.add(relay);
    this.relayModel = relay;

    for (let index = 1; index < this.facility.pathNodes.length; index += 1) {
      const node = this.facility.pathNodes[index];
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(index === this.facility.pathNodes.length - 1 ? 0.8 : 0.63, 0.027, 5, 32),
        index === this.facility.pathNodes.length - 1 ? this.materials.amber : this.materials.cyan,
      );
      ring.position.copy(vector(node.position));
      ring.userData.pathIndex = index;
      ring.userData.baseScale = index === this.facility.pathNodes.length - 1 ? 1.1 : 1;
      this.routeRings.push(ring);
      this.world.add(ring);
    }

    for (let index = 0; index < this.facility.objectiveNodes.length; index += 1) {
      const objective = this.facility.objectiveNodes[index];
      const model = createObjectiveModel(this.materials, index);
      model.position.copy(vector(objective.position));
      model.userData.kind = "objective";
      model.userData.id = objective.id;
      model.traverse((child) => {
        if (child.isMesh && child.name !== "floor-mark") {
          child.userData.kind = "objective";
          child.userData.id = objective.id;
          this.aimMeshes.push?.(child);
        }
      });
      this.objectiveModels.set(objective.id, model);
      this.world.add(model);
    }

    for (let index = 0; index < this.facility.sentryDrones.length; index += 1) {
      const sentry = this.facility.sentryDrones[index];
      const model = createSentryModel(this.materials, index);
      model.position.copy(vector(sentry.position));
      model.visible = false;
      model.userData.kind = "hostile";
      model.userData.id = sentry.id;
      model.traverse((child) => {
        if (!child.isMesh) return;
        child.userData.kind = "hostile";
        child.userData.id = sentry.id;
      });
      this.hostileModels.set(sentry.id, model);
      this.world.add(model);
    }

    this.buildDetails();
    setShadow(this.world, !this.touch);
  }

  buildDetails() {
    const width = this.facility.bounds.max.x - this.facility.bounds.min.x;
    const depth = this.facility.bounds.max.z - this.facility.bounds.min.z;

    const grid = new THREE.GridHelper(
      Math.max(width, depth),
      Math.round(Math.max(width, depth)),
      0x3f6b60,
      0x253c37,
    );
    grid.position.y = 0.012;
    grid.material.transparent = true;
    grid.material.opacity = 0.17;
    this.world.add(grid);

    for (const z of [-13.2, -8.8, -2.1, 2.8, 8.8, 13.2]) {
      const panel = meshBox(
        new THREE.Vector3(5.4, 0.035, 0.44),
        new THREE.Vector3(0, this.facility.bounds.max.y - 0.2, z),
        this.materials.cyan,
        0.04,
      );
      panel.material = panel.material.clone();
      panel.material.opacity = 0.28;
      panel.material.transparent = true;
      this.world.add(panel);
    }

    for (const x of [-8.55, 8.55]) {
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, depth - 2, 8),
        this.materials.warm,
      );
      pipe.position.set(x, 1.15, 0);
      pipe.rotation.x = Math.PI / 2;
      this.world.add(pipe);
      for (const z of [-11, -5.8, 0, 5.8, 11]) {
        const brace = new THREE.Mesh(
          new THREE.TorusGeometry(0.31, 0.055, 5, 12),
          this.materials.dark,
        );
        brace.position.set(x, 1.15, z);
        this.world.add(brace);
      }
    }

    for (const side of [-1, 1]) {
      for (const z of [-12.8, -9.8, 8.2, 11.2]) {
        const cabinet = meshBox(
          new THREE.Vector3(1.15, 1.8, 0.78),
          new THREE.Vector3(side * 8.75, 0.9, z),
          this.materials.dark,
          0.1,
        );
        cabinet.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        this.world.add(cabinet);
        const screen = meshBox(
          new THREE.Vector3(0.42, 0.35, 0.03),
          new THREE.Vector3(side * 8.34, 1.13, z),
          z < 0 ? this.materials.amber : this.materials.green,
          0.02,
        );
        screen.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        this.world.add(screen);
      }
    }

    for (const zone of this.facility.snagZones) {
      const center = boxCenter(zone.aabb);
      const size = boxSize(zone.aabb);
      const rack = new THREE.Group();
      rack.position.copy(center);
      for (let index = -1; index <= 1; index += 1) {
        const rail = meshBox(
          new THREE.Vector3(size.x, 0.04, 0.04),
          new THREE.Vector3(0, index * Math.min(0.5, size.y * 0.18), 0),
          this.materials.amber,
        );
        rail.material = rail.material.clone();
        rail.material.opacity = 0.28;
        rail.material.transparent = true;
        rack.add(rail);
      }
      rack.userData.snagZone = zone.id;
      this.world.add(rack);
    }
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  impact(position, hostile = false, seed = 0) {
    const material = hostile ? this.materials.danger : this.materials.spark;
    const spark = createSpark(material, vector(position), seed);
    this.sparks.push(spark);
    this.scene.add(spark);
  }

  pulseHit(amount = 1) {
    this.hitPulse = Math.max(this.hitPulse, amount);
    if (!this.reducedMotion) this.shake = Math.max(this.shake, amount * 0.055);
  }

  updateFiber(snapshot) {
    const trail = snapshot.link.fiber.trail.map(vector);
    if (snapshot.link.mode === "fiber") trail.push(vector(snapshot.drone.position));
    if (trail.length < 2) {
      this.fiberLine.visible = false;
      return;
    }
    this.fiberLine.visible = true;
    this.fiberGeometry.setFromPoints(trail);
    this.materials.fiber.color.setHex(snapshot.link.mode === "fiber" ? COLORS.green : 0x315a48);
    this.materials.fiber.opacity = snapshot.link.mode === "fiber" ? 0.96 : 0.32;
    const collar = this.droneFrame.getObjectByName("fiber-collar");
    if (collar) {
      collar.visible = snapshot.link.mode === "fiber";
      collar.material = snapshot.link.fiber.tension > 0.66
        ? this.materials.amber : this.materials.green;
    }
  }

  updateDoors(snapshot, dt) {
    for (const door of snapshot.doors) {
      const model = this.doorMeshes.get(door.id);
      if (!model) continue;
      const target = door.open ? this.facility.bounds.max.y + 2.2 : model.closedY;
      model.group.position.y = THREE.MathUtils.damp(model.group.position.y, target, 8, dt);
      model.group.visible = model.group.position.y < this.facility.bounds.max.y + 1.5;
    }
  }

  updateObjectives(snapshot, elapsed) {
    for (const model of this.objectiveModels.values()) model.visible = false;
    if (snapshot.survey) return;

    for (let index = 0; index < snapshot.objectives.length; index += 1) {
      const objective = snapshot.objectives[index];
      const model = this.objectiveModels.get(objective.id);
      if (!model) continue;
      const damage = 1 - objective.integrity / Math.max(1, objective.maxIntegrity);
      model.visible = !objective.destroyed || damage < 1;
      model.rotation.y = elapsed * (0.45 + index * 0.09);
      const core = model.getObjectByName("core");
      const halo = model.getObjectByName("halo");
      if (core) {
        core.scale.setScalar(objective.destroyed ? 0.01 : 1 + Math.sin(elapsed * 3 + index) * 0.04);
      }
      if (halo) {
        halo.rotation.x = elapsed * 0.62 + index;
        halo.rotation.y = elapsed * 0.41;
        halo.scale.setScalar(1 + Math.sin(elapsed * 2.1 + index) * 0.08);
      }
      model.traverse((child) => {
        if (!child.isMesh || child.name === "floor-mark") return;
        child.visible = !objective.destroyed;
      });
    }
  }

  ensureSurveyMarker(point) {
    let model = this.surveyModels.get(point.id);
    if (model) return model;

    model = createSurveyMarker(this.materials);
    model.userData.id = point.id;
    model.userData.label = point.label;
    model.userData.phase = this.surveyModels.size * 1.73;
    this.surveyModels.set(point.id, model);
    this.world.add(model);
    return model;
  }

  updateSurvey(snapshot, elapsed) {
    for (const model of this.surveyModels.values()) model.visible = false;
    this.surveyTargetInfo = null;
    const survey = snapshot.survey;
    if (!survey) return;

    const doctrineColor = survey.doctrine === "noisy-provocation"
      ? COLORS.amber
      : survey.doctrine === "discretionary" ? COLORS.green : COLORS.cyan;

    for (const point of survey.scanPoints ?? []) {
      const model = this.ensureSurveyMarker(point);
      const progress = clamp01(point.dwell / Math.max(0.001, point.dwellRequired));
      const current = survey.currentScanId === point.id;
      const color = point.complete ? COLORS.green : doctrineColor;
      const radiusScale = Math.max(0.65, (Number(point.radius) || 0.9) / 0.9);
      const pulse = this.reducedMotion
        ? 1
        : 1 + Math.sin(elapsed * (current ? 2.1 : 1.1) + model.userData.phase)
          * (current ? 0.035 : 0.016);

      // A captured room stays captured in the objective list and on the minimap. Keeping its
      // full-size 3D hoops in the corridor made the next leg harder to see and could stack two
      // markers over one doorway.
      model.visible = !point.complete;
      model.position.copy(vector(point.position));
      model.scale.setScalar(radiusScale * pulse);
      model.rotation.y = this.reducedMotion
        ? 0
        : elapsed * (current ? 0.42 : 0.12) + model.userData.phase;
      model.userData.label = point.label;
      model.userData.complete = point.complete;

      const outer = model.getObjectByName("scan-ring");
      const hoop = model.getObjectByName("scan-hoop");
      const progressRing = model.getObjectByName("scan-progress");
      const beacon = model.getObjectByName("scan-beacon");
      for (const part of [outer, hoop, beacon]) part?.material?.color?.setHex(color);
      if (outer) outer.material.opacity = point.complete ? 0.22 : current ? 0.88 : 0.52;
      if (hoop) hoop.material.opacity = point.complete ? 0.12 : current ? 0.5 : 0.26;
      if (progressRing) {
        progressRing.visible = !point.complete;
        progressRing.scale.setScalar(0.52 + progress * 0.48);
        progressRing.material.opacity = 0.22 + progress * 0.64;
      }
      if (beacon) {
        beacon.material.opacity = point.complete ? 0.3 : current ? 0.94 : 0.66;
        beacon.scale.setScalar(point.complete ? 0.72 : 0.86 + progress * 0.28);
      }

      if (current) {
        this.surveyTargetInfo = {
          id: point.id,
          label: point.label,
          progress,
          complete: point.complete,
        };
      }
    }
  }

  ensureHostileModel(hostile) {
    let model = this.hostileModels.get(hostile.id);
    if (model) return model;

    model = createSentryModel(
      this.materials,
      this.hostileModels.size,
      hostile.role,
    );
    model.position.copy(vector(hostile.position));
    model.visible = false;
    model.userData.kind = "hostile";
    model.userData.id = hostile.id;
    model.userData.role = hostile.role;
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.userData.kind = "hostile";
      child.userData.id = hostile.id;
    });
    setShadow(model, !this.touch);
    this.hostileModels.set(hostile.id, model);
    this.world.add(model);
    return model;
  }

  updateHostiles(snapshot, elapsed) {
    this.visibleHostileIds.clear();
    for (const model of this.hostileModels.values()) model.visible = false;

    for (const hostile of snapshot.hostiles) {
      if (!hostileIsPresent(hostile)) continue;
      const model = this.ensureHostileModel(hostile);
      model.visible = true;
      this.visibleHostileIds.add(hostile.id);
      model.position.copy(vector(hostile.position));
      const toDrone = vector(snapshot.drone.position).sub(model.position);
      if (toDrone.lengthSq() > 0.001) {
        model.rotation.y = Math.atan2(toDrone.x, -toDrone.z);
      }
      for (const rotor of model.children.filter((child) => child.name === "rotor")) {
        rotor.rotation.z = elapsed * 19;
      }
    }
  }

  updateProjectiles(snapshot) {
    const live = new Set();
    for (const projectile of snapshot.projectiles) {
      live.add(projectile.id);
      let model = this.projectileModels.get(projectile.id);
      if (!model) {
        model = new THREE.Mesh(
          new THREE.SphereGeometry(projectile.owner === "player" ? 0.045 : 0.07, 7, 5),
          projectile.owner === "player"
            ? this.materials.projectilePlayer : this.materials.projectileHostile,
        );
        model.userData.owner = projectile.owner;
        this.projectileModels.set(projectile.id, model);
        this.scene.add(model);
      }
      model.position.copy(vector(projectile.position));
      const direction = vector(projectile.velocity).normalize();
      model.scale.set(1, 1, projectile.owner === "player" ? 4.5 : 2.5);
      model.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
      this.lastProjectilePositions.set(projectile.id, vector(projectile.position));
    }
    for (const [id, model] of this.projectileModels) {
      if (live.has(id)) continue;
      this.scene.remove(model);
      model.geometry.dispose();
      this.projectileModels.delete(id);
      this.lastProjectilePositions.delete(id);
    }
  }

  updateRoute(snapshot, elapsed) {
    let nearest = 0;
    let nearestDistance = Infinity;
    const dronePosition = vector(snapshot.drone.position);
    for (let index = 0; index < this.facility.pathNodes.length; index += 1) {
      const separation = dronePosition.distanceTo(vector(this.facility.pathNodes[index].position));
      if (separation < nearestDistance) {
        nearestDistance = separation;
        nearest = index;
      }
    }
    const tick = Number(snapshot.tick) || 0;
    if (tick < this.lastRouteTick) this.routeProgress = 0;
    this.lastRouteTick = tick;
    // Nearest-node transitions occur at the authored segment midpoint. Ratcheting that index
    // keeps a passed cue from reappearing without requiring the pilot to hit a 1 m 3D sphere.
    this.routeProgress = Math.max(this.routeProgress, nearest);
    const returning = snapshot.survey?.returnRequested === true;
    this.lastRouteDirection = returning ? "return" : "ingress";
    const cueProgress = returning ? nearest : this.routeProgress;
    this.lastRouteCueAnchor = cueProgress;

    for (const ring of this.routeRings) {
      const cue = indoorRouteCueState({
        pathIndex: ring.userData.pathIndex,
        routeProgress: cueProgress,
        linkMode: snapshot.link.mode,
        direction: returning ? "return" : "ingress",
      });
      ring.visible = cue.visible;
      ring.material.opacity = cue.opacity;
      ring.material.transparent = true;
      const pulse = ring.userData.baseScale * (1 + Math.sin(elapsed * 2.4 + ring.userData.pathIndex) * 0.045);
      ring.scale.setScalar(pulse);
    }
  }

  updateRelay(snapshot, elapsed) {
    if (!this.relayModel) return;
    const antennaRing = this.relayModel.children.find((child) => child.geometry?.type === "TorusGeometry");
    if (antennaRing) {
      antennaRing.rotation.z = elapsed * (snapshot.link.mode === "rf" ? 2.6 : 0.5);
      antennaRing.material = snapshot.link.mode === "rf"
        ? (snapshot.link.rf.survivalTimer < 10 ? this.materials.danger : this.materials.amber)
        : this.materials.green;
    }
  }

  updateSparks(dt) {
    for (let index = this.sparks.length - 1; index >= 0; index -= 1) {
      const spark = this.sparks[index];
      spark.userData.age += dt;
      const fraction = spark.userData.age / spark.userData.life;
      for (let childIndex = 0; childIndex < spark.children.length; childIndex += 1) {
        const child = spark.children[childIndex];
        const velocity = spark.userData.velocity[childIndex];
        child.position.addScaledVector(velocity, dt);
        velocity.y -= 4.6 * dt;
        child.scale.setScalar(Math.max(0, 1 - fraction));
      }
      if (fraction >= 1) {
        this.scene.remove(spark);
        disposeObject(spark);
        this.sparks.splice(index, 1);
      }
    }
  }

  updateAim(snapshot) {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const targets = [];
    for (const objective of snapshot.objectives) {
      if (objective.destroyed) continue;
      const model = this.objectiveModels.get(objective.id);
      if (model) targets.push(...model.children.filter((child) => child.isMesh && child.visible));
    }
    for (const hostile of snapshot.hostiles) {
      if (!this.visibleHostileIds.has(hostile.id)) continue;
      const model = this.hostileModels.get(hostile.id);
      if (model?.visible) {
        targets.push(...model.children.filter((child) => child.isMesh && child.visible));
      }
    }
    const hit = this.raycaster.intersectObjects([...targets, ...this.occluderMeshes], false)[0]
      ?? null;
    this.targetInfo = hit && ["objective", "hostile"].includes(hit.object.userData.kind) ? {
      distance: hit.distance,
      kind: hit.object.userData.kind,
      id: hit.object.userData.id,
    } : null;
  }

  update(snapshot, dt, elapsed) {
    const drone = snapshot.drone;
    this.camera.position.copy(vector(drone.position));
    this.camera.rotation.set(drone.pitch, drone.yaw, 0, "YXZ");
    if (this.shake > 0 && !this.reducedMotion) {
      const magnitude = this.shake;
      this.camera.rotation.z += Math.sin(elapsed * 89) * magnitude;
      this.camera.rotation.x += Math.sin(elapsed * 71 + 1.4) * magnitude * 0.45;
      this.shake = Math.max(0, this.shake - dt * 0.23);
    }
    this.camera.updateMatrixWorld();

    const speed = Math.hypot(drone.velocity.x, drone.velocity.y, drone.velocity.z);
    if (!this.reducedMotion) {
      this.droneFrame.position.y = Math.sin(elapsed * 21) * 0.004 * Math.min(1, speed);
      this.droneFrame.rotation.z = THREE.MathUtils.damp(
        this.droneFrame.rotation.z,
        -drone.velocity.x * 0.013,
        6,
        dt,
      );
    }

    this.updateFiber(snapshot);
    this.updateDoors(snapshot, dt);
    this.updateObjectives(snapshot, elapsed);
    this.updateSurvey(snapshot, elapsed);
    this.updateHostiles(snapshot, elapsed);
    this.updateProjectiles(snapshot);
    this.updateRoute(snapshot, elapsed);
    this.updateRelay(snapshot, elapsed);
    this.updateSparks(dt);
    this.updateAim(snapshot);
    this.hitPulse = Math.max(0, this.hitPulse - dt * 3.5);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  diagnostics() {
    const visibleSurveyMarkerIds = [...this.surveyModels]
      .filter(([, model]) => model.visible)
      .map(([id]) => id);
    const visibleCompletedSurveyMarkerIds = [...this.surveyModels]
      .filter(([, model]) => model.visible && model.userData.complete === true)
      .map(([id]) => id);
    return Object.freeze({
      rendererReady: this.canvas.width > 0
        && this.canvas.height > 0
        && this.renderer.getContext().isContextLost() === false,
      framebufferWidth: this.canvas.width,
      framebufferHeight: this.canvas.height,
      visibleRouteCueCount: this.routeRings.filter((ring) => ring.visible).length,
      visibleRouteCueIndices: Object.freeze(this.routeRings
        .filter((ring) => ring.visible)
        .map((ring) => ring.userData.pathIndex)),
      routeProgress: this.routeProgress,
      routeDirection: this.lastRouteDirection ?? "ingress",
      routeCueAnchor: this.lastRouteCueAnchor ?? 0,
      renderFrameCount: this.renderer.info.render.frame,
      renderTriangleCount: this.renderer.info.render.triangles,
      webglContextLost: this.renderer.getContext().isContextLost(),
      visibleSurveyMarkerIds: Object.freeze(visibleSurveyMarkerIds),
      visibleCompletedSurveyMarkerIds: Object.freeze(visibleCompletedSurveyMarkerIds),
    });
  }

  dispose() {
    disposeObject(this.scene);
    for (const material of Object.values(this.materials)) material.dispose?.();
    this.gradient.dispose();
    this.renderer.dispose();
  }
}

export { COLORS };
