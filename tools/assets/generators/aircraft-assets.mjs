import { consolidateStaticMeshes, preparePbrGeometry } from "./mesh-optimization.mjs";
import {
  applyPbrTextureSet,
  createInstrumentFaceTexture,
  createPanelledSurfaceSet,
  createRoundelDecalTexture,
} from "./pbr-textures.mjs";

const GENERATOR_ID = "guns-only-aircraft-assets/2.0.0";

const PLAYER_ASSET_ID = "vehicle.player.sabre-fury.v1";
const BANDIT_ASSET_ID = "vehicle.bandit.swept-wing.v1";
const COCKPIT_ASSET_ID = "cockpit.player.sabre-fury.v1";
// Pilot eye point in the shared player-aircraft frame. Keep this above the instrument coaming:
// the previous 1.22 m socket placed the camera inside the panel and obscured the forward view.
const PLAYER_COCKPIT_CAMERA = Object.freeze([0, 1.68, -1.18]);

const PLAYER_ANCHORS = Object.freeze([
  { id: "camera.cockpit", node: "SOCKET_CAMERA_COCKPIT" },
  { id: "muzzle.left", node: "SOCKET_MUZZLE_LEFT" },
  { id: "muzzle.right", node: "SOCKET_MUZZLE_RIGHT" },
  { id: "gear.nose", node: "SOCKET_GEAR_NOSE" },
  { id: "gear.left", node: "SOCKET_GEAR_LEFT" },
  { id: "gear.right", node: "SOCKET_GEAR_RIGHT" },
]);

const BANDIT_ANCHORS = Object.freeze([
  { id: "camera.cockpit", node: "SOCKET_CAMERA_COCKPIT" },
  { id: "muzzle.left", node: "SOCKET_MUZZLE_LEFT" },
  { id: "muzzle.right", node: "SOCKET_MUZZLE_RIGHT" },
  { id: "damage.center", node: "SOCKET_DAMAGE_CENTER" },
]);

const COCKPIT_ANCHORS = Object.freeze([
  { id: "camera.cockpit", node: "SOCKET_CAMERA_COCKPIT" },
  { id: "gunsight.origin", node: "SOCKET_GUNSIGHT_ORIGIN" },
  { id: "instrument-panel.origin", node: "SOCKET_INSTRUMENT_PANEL_ORIGIN" },
  { id: "control.stick", node: "SOCKET_CONTROL_STICK" },
  { id: "control.throttle", node: "SOCKET_CONTROL_THROTTLE" },
  { id: "canopy.hinge", node: "SOCKET_CANOPY_HINGE" },
  { id: "muzzle.left", node: "SOCKET_MUZZLE_LEFT" },
  { id: "muzzle.right", node: "SOCKET_MUZZLE_RIGHT" },
]);

function requireThree(THREE) {
  const required = [
    "Box3",
    "BoxGeometry",
    "BufferGeometry",
    "CircleGeometry",
    "CylinderGeometry",
    "DataTexture",
    "Float32BufferAttribute",
    "Group",
    "Mesh",
    "MeshPhysicalMaterial",
    "MeshStandardMaterial",
    "Object3D",
    "Quaternion",
    "SphereGeometry",
    "TorusGeometry",
    "Vector3",
  ];
  const missing = required.filter((name) => typeof THREE?.[name] !== "function");
  if (missing.length > 0) throw new Error(`Aircraft asset generator requires Three exports: ${missing.join(", ")}`);
}

function namedMaterial(THREE, name, parameters, physical = false) {
  const Material = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const material = new Material(parameters);
  material.name = name;
  return material;
}

function namedMesh(THREE, name, geometry, material, options = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  if (options.position) mesh.position.set(...options.position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  if (options.scale) mesh.scale.set(...options.scale);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}

function addBox(THREE, parent, name, size, material, position, rotation = [0, 0, 0]) {
  const mesh = namedMesh(THREE, name, new THREE.BoxGeometry(...size), material, { position, rotation });
  parent.add(mesh);
  return mesh;
}

function addRod(THREE, parent, name, start, end, radius, material, radialSegments = 12) {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const direction = to.clone().sub(from);
  const length = direction.length();
  const mesh = namedMesh(
    THREE,
    name,
    new THREE.CylinderGeometry(radius, radius, length, radialSegments, 1, false),
    material,
    { position: from.clone().add(to).multiplyScalar(0.5).toArray() },
  );
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  parent.add(mesh);
  return mesh;
}

function addSocket(THREE, parent, name, position, rotation = [0, 0, 0]) {
  const socket = new THREE.Object3D();
  socket.name = name;
  socket.position.set(...position);
  socket.rotation.set(...rotation);
  socket.userData.anchor = true;
  parent.add(socket);
  return socket;
}

function loftGeometry(THREE, sections, radialSegments) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const ringSize = radialSegments + 1;
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
    const section = sections[sectionIndex];
    for (let segment = 0; segment <= radialSegments; segment++) {
      const angle = segment / radialSegments * Math.PI * 2;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const shoulder = section.shoulder ?? 1;
      const shapedCosine = Math.sign(cosine) * Math.abs(cosine) ** shoulder;
      const shapedSine = Math.sign(sine) * Math.abs(sine) ** shoulder;
      positions.push(
        (section.x ?? 0) + section.rx * shapedCosine,
        section.y + section.ry * shapedSine,
        section.z,
      );
      uvs.push(segment / radialSegments, sectionIndex / (sections.length - 1));
    }
  }

  for (let ring = 0; ring < sections.length - 1; ring++) {
    const current = ring * ringSize;
    const next = (ring + 1) * ringSize;
    for (let segment = 0; segment < radialSegments; segment++) {
      const following = segment + 1;
      const a = current + segment;
      const b = current + following;
      const c = next + following;
      const d = next + segment;
      indices.push(a, b, c, a, c, d);
    }
  }

  const startCenter = positions.length / 3;
  const first = sections[0];
  positions.push(first.x ?? 0, first.y, first.z);
  uvs.push(0.5, 0);
  for (let segment = 0; segment < radialSegments; segment++) {
    const following = segment + 1;
    indices.push(startCenter, following, segment);
  }

  const endCenter = positions.length / 3;
  const last = sections.at(-1);
  positions.push(last.x ?? 0, last.y, last.z);
  uvs.push(0.5, 1);
  const finalRing = (sections.length - 1) * ringSize;
  for (let segment = 0; segment < radialSegments; segment++) {
    const following = segment + 1;
    indices.push(endCenter, finalRing + segment, finalRing + following);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeTangents();
  geometry.computeBoundingBox();
  return geometry;
}

function airfoilPairGeometry(THREE, options) {
  const {
    rootX,
    tipX,
    rootLeadingZ,
    rootTrailingZ,
    tipLeadingZ,
    tipTrailingZ,
    y,
    rootThickness,
    tipThickness,
    spanSegments,
    chordSegments,
    dihedral = 0,
    camber = 0.02,
  } = options;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (const sign of [-1, 1]) {
    const offset = positions.length / 3;
    const rowSize = chordSegments + 1;
    const surfaceSize = (spanSegments + 1) * rowSize;
    for (const surfaceSign of [1, -1]) {
      for (let span = 0; span <= spanSegments; span++) {
        const spanT = span / spanSegments;
        const x = sign * (rootX + (tipX - rootX) * spanT);
        const baseY = y + dihedral * spanT;
        const leading = rootLeadingZ + (tipLeadingZ - rootLeadingZ) * spanT;
        const trailing = rootTrailingZ + (tipTrailingZ - rootTrailingZ) * spanT;
        const thickness = rootThickness + (tipThickness - rootThickness) * spanT;
        for (let chord = 0; chord <= chordSegments; chord++) {
          const chordT = chord / chordSegments;
          const z = leading + (trailing - leading) * chordT;
          const profile = Math.sin(Math.PI * chordT) ** 0.72;
          const camberOffset = Math.sin(Math.PI * chordT) * camber;
          positions.push(x, baseY + camberOffset + surfaceSign * thickness * profile * 0.5, z);
          uvs.push(chordT, sign < 0 ? 0.5 - spanT * 0.5 : 0.5 + spanT * 0.5);
        }
      }
    }

    const top = (span, chord) => offset + span * rowSize + chord;
    const bottom = (span, chord) => offset + surfaceSize + span * rowSize + chord;
    const topOrder = sign > 0
      ? (a, b, c, d) => indices.push(a, d, c, a, c, b)
      : (a, b, c, d) => indices.push(a, b, c, a, c, d);
    const bottomOrder = sign > 0
      ? (a, b, c, d) => indices.push(a, b, c, a, c, d)
      : (a, b, c, d) => indices.push(a, d, c, a, c, b);

    for (let span = 0; span < spanSegments; span++) {
      for (let chord = 0; chord < chordSegments; chord++) {
        topOrder(top(span, chord), top(span + 1, chord), top(span + 1, chord + 1), top(span, chord + 1));
        bottomOrder(bottom(span, chord), bottom(span + 1, chord), bottom(span + 1, chord + 1), bottom(span, chord + 1));
      }
    }

    for (let span = 0; span < spanSegments; span++) {
      const topLeadingA = top(span, 0);
      const topLeadingB = top(span + 1, 0);
      const bottomLeadingB = bottom(span + 1, 0);
      const bottomLeadingA = bottom(span, 0);
      const topTrailingA = top(span, chordSegments);
      const topTrailingB = top(span + 1, chordSegments);
      const bottomTrailingB = bottom(span + 1, chordSegments);
      const bottomTrailingA = bottom(span, chordSegments);
      if (sign > 0) {
        indices.push(topLeadingA, topLeadingB, bottomLeadingB, topLeadingA, bottomLeadingB, bottomLeadingA);
        indices.push(topTrailingA, bottomTrailingB, topTrailingB, topTrailingA, bottomTrailingA, bottomTrailingB);
      } else {
        indices.push(topLeadingA, bottomLeadingB, topLeadingB, topLeadingA, bottomLeadingA, bottomLeadingB);
        indices.push(topTrailingA, topTrailingB, bottomTrailingB, topTrailingA, bottomTrailingB, bottomTrailingA);
      }
    }

    const tipSpan = spanSegments;
    for (let chord = 0; chord < chordSegments; chord++) {
      const a = top(tipSpan, chord);
      const b = top(tipSpan, chord + 1);
      const c = bottom(tipSpan, chord + 1);
      const d = bottom(tipSpan, chord);
      if (sign > 0) indices.push(a, d, c, a, c, b);
      else indices.push(a, b, c, a, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeTangents();
  geometry.computeBoundingBox();
  return geometry;
}

function prismYZGeometry(THREE, points, halfThickness) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const zValues = points.map(([z]) => z);
  const yValues = points.map(([, y]) => y);
  const minZ = Math.min(...zValues);
  const maxZ = Math.max(...zValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  for (const x of [-halfThickness, halfThickness]) {
    for (const [z, y] of points) {
      positions.push(x, y, z);
      uvs.push((z - minZ) / (maxZ - minZ), (y - minY) / (maxY - minY));
    }
  }
  const count = points.length;
  for (let index = 1; index < count - 1; index++) {
    indices.push(0, index + 1, index);
    indices.push(count, count + index, count + index + 1);
  }
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;
    const a = index;
    const b = next;
    const c = count + next;
    const d = count + index;
    indices.push(a, b, c, a, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeTangents();
  geometry.computeBoundingBox();
  return geometry;
}

function panelGeometry(THREE, points) {
  const geometry = new THREE.BufferGeometry();
  const positions = points.flat();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  geometry.computeTangents();
  return geometry;
}

function playerMaterials(THREE, lod) {
  const panelSet = lod < 2 ? createPanelledSurfaceSet(THREE, `PLAYER_LOD${lod}_PANELLED`, {
    size: lod === 0 ? 256 : 128,
    seed: 1951,
    warmth: 0.12,
    grime: lod === 0 ? 0.13 : 0.08,
    roughness: 0.84,
    metalness: 0.98,
  }) : null;
  const materials = {
    navy: namedMaterial(THREE, "PLAYER_NAVY_ENAMEL", { color: 0x19394c, metalness: 0.42, roughness: 0.42 }),
    alloy: namedMaterial(THREE, "PLAYER_BRUSHED_ALLOY", { color: 0xaeb8ba, metalness: 0.78, roughness: 0.3 }),
    dark: namedMaterial(THREE, "PLAYER_INTAKE_EXHAUST", { color: 0x11181b, metalness: 0.35, roughness: 0.52 }),
    marking: namedMaterial(THREE, "PLAYER_SQUADRON_MARKING", { color: 0xe6c87c, metalness: 0.18, roughness: 0.48 }),
  };
  if (panelSet) {
    applyPbrTextureSet(materials.navy, panelSet, { normalScale: 0.55, aoIntensity: 0.62 });
    applyPbrTextureSet(materials.alloy, panelSet, { normalScale: 0.72, aoIntensity: 0.76 });
    materials.decal = namedMaterial(THREE, "PLAYER_WING_INSIGNIA_DECAL", {
      color: 0xffffff,
      metalness: 0.04,
      roughness: 0.72,
      map: createRoundelDecalTexture(THREE),
      transparent: true,
      alphaTest: 0.32,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
  }
  if (lod < 2) {
    materials.glass = namedMaterial(THREE, "PLAYER_CANOPY_GLASS", {
      color: 0x6ea3b4,
      metalness: 0.05,
      roughness: 0.14,
      transmission: 0.38,
      transparent: true,
      opacity: 0.66,
      depthWrite: false,
    }, true);
  }
  if (lod === 0) {
    materials.red = namedMaterial(THREE, "PLAYER_PORT_NAV_LIGHT", {
      color: 0xff4b3f,
      emissive: 0xff2418,
      emissiveIntensity: 1.6,
      metalness: 0,
      roughness: 0.32,
    });
    materials.green = namedMaterial(THREE, "PLAYER_STARBOARD_NAV_LIGHT", {
      color: 0x40e88d,
      emissive: 0x1bcc68,
      emissiveIntensity: 1.6,
      metalness: 0,
      roughness: 0.32,
    });
  }
  return materials;
}

function banditMaterials(THREE, lod) {
  const panelSet = lod < 2 ? createPanelledSurfaceSet(THREE, `BANDIT_LOD${lod}_NATURAL_METAL`, {
    size: lod === 0 ? 256 : 128,
    seed: 1953,
    warmth: -0.08,
    grime: lod === 0 ? 0.16 : 0.08,
    roughness: 0.72,
    metalness: 1,
  }) : null;
  const materials = {
    alloy: namedMaterial(THREE, "BANDIT_NATURAL_METAL", { color: 0xb9c0c0, metalness: 0.9, roughness: 0.26 }),
    dark: namedMaterial(THREE, "BANDIT_INTAKE_EXHAUST", { color: 0x14191a, metalness: 0.5, roughness: 0.42 }),
    red: namedMaterial(THREE, "BANDIT_IDENTIFICATION_RED", { color: 0x9f2922, metalness: 0.36, roughness: 0.42 }),
    charcoal: namedMaterial(THREE, "BANDIT_PANEL_CHARCOAL", { color: 0x31393a, metalness: 0.62, roughness: 0.34 }),
  };
  if (panelSet) applyPbrTextureSet(materials.alloy, panelSet, { normalScale: 0.78, aoIntensity: 0.74 });
  if (lod < 2) {
    materials.glass = namedMaterial(THREE, "BANDIT_CANOPY_GLASS", {
      color: 0x6b8e97,
      metalness: 0.08,
      roughness: 0.12,
      transmission: 0.34,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    }, true);
  }
  return materials;
}

function cockpitMaterials(THREE) {
  const panelSet = createPanelledSurfaceSet(THREE, "COCKPIT_WORN_PANEL", {
    size: 256,
    seed: 1950,
    warmth: 0.22,
    grime: 0.2,
    roughness: 0.92,
    metalness: 0.72,
  });
  const materials = {
    tub: namedMaterial(THREE, "COCKPIT_DARK_TUB", { color: 0x17201f, metalness: 0.18, roughness: 0.72 }),
    panel: namedMaterial(THREE, "COCKPIT_INSTRUMENT_PANEL", { color: 0x101514, metalness: 0.28, roughness: 0.58 }),
    console: namedMaterial(THREE, "COCKPIT_SIDE_CONSOLE", { color: 0x26302e, metalness: 0.24, roughness: 0.62 }),
    gauge: namedMaterial(THREE, "COCKPIT_GAUGE_FACE", {
      color: 0xffffff,
      metalness: 0.02,
      roughness: 0.82,
      map: createInstrumentFaceTexture(THREE),
      emissive: 0x111914,
      emissiveIntensity: 0.22,
    }),
    needle: namedMaterial(THREE, "COCKPIT_GAUGE_NEEDLE", { color: 0xdce0ce, metalness: 0.08, roughness: 0.65 }),
    leather: namedMaterial(THREE, "COCKPIT_SEAT_LEATHER", { color: 0x5b3827, metalness: 0.02, roughness: 0.94 }),
    harness: namedMaterial(THREE, "COCKPIT_HARNESS_WEBBING", { color: 0xc4b690, metalness: 0.02, roughness: 0.92 }),
    red: namedMaterial(THREE, "COCKPIT_SAFETY_RED", { color: 0xb5382f, metalness: 0.16, roughness: 0.52 }),
    metal: namedMaterial(THREE, "COCKPIT_WORN_METAL", { color: 0x89928f, metalness: 0.76, roughness: 0.34 }),
    lamp: namedMaterial(THREE, "COCKPIT_WARNING_LAMP", {
      color: 0xff6a34,
      emissive: 0xff431c,
      emissiveIntensity: 1.8,
      metalness: 0,
      roughness: 0.32,
    }),
    glass: namedMaterial(THREE, "COCKPIT_OPTICAL_GLASS", {
      color: 0x92c3cc,
      metalness: 0,
      roughness: 0.08,
      transmission: 0.72,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    }, true),
  };
  for (const material of [materials.tub, materials.panel, materials.console, materials.metal]) {
    applyPbrTextureSet(material, panelSet, { normalScale: 0.58, aoIntensity: 0.82 });
  }
  return materials;
}

function buildPlayerExterior(THREE, lod) {
  const detail = [
    { radial: 48, wingSpan: 12, wingChord: 10, sphereWidth: 40, sphereHeight: 20, torus: 32 },
    { radial: 28, wingSpan: 7, wingChord: 6, sphereWidth: 24, sphereHeight: 12, torus: 20 },
    { radial: 14, wingSpan: 3, wingChord: 3, sphereWidth: 14, sphereHeight: 7, torus: 12 },
  ][lod];
  const materials = playerMaterials(THREE, lod);
  const scene = new THREE.Group();
  scene.name = `PLAYER_SABRE_FURY_LOD${lod}`;
  scene.userData = { assetId: PLAYER_ASSET_ID, lod, generator: GENERATOR_ID, units: "metres", forward: "-Z" };

  const bodySections = [
    { z: -6.25, rx: 0.36, ry: 0.35, y: 0.3 },
    { z: -5.75, rx: 0.62, ry: 0.58, y: 0.32 },
    { z: -4.55, rx: 0.76, ry: 0.72, y: 0.34 },
    { z: -2.65, rx: 0.84, ry: 0.82, y: 0.36 },
    { z: -0.65, rx: 0.87, ry: 0.84, y: 0.34 },
    { z: 1.55, rx: 0.78, ry: 0.74, y: 0.32 },
    { z: 3.35, rx: 0.62, ry: 0.58, y: 0.3 },
    { z: 4.65, rx: 0.37, ry: 0.36, y: 0.28 },
    { z: 5.2, rx: 0.2, ry: 0.2, y: 0.28 },
  ];
  scene.add(namedMesh(THREE, "Fuselage", loftGeometry(THREE, bodySections, detail.radial), materials.navy));

  scene.add(namedMesh(THREE, "MainWings", airfoilPairGeometry(THREE, {
    rootX: 0.54,
    tipX: 5.58,
    rootLeadingZ: -1.95,
    rootTrailingZ: 1.95,
    tipLeadingZ: -0.12,
    tipTrailingZ: 2.18,
    y: 0.29,
    rootThickness: 0.25,
    tipThickness: 0.08,
    spanSegments: detail.wingSpan,
    chordSegments: detail.wingChord,
    dihedral: 0.12,
    camber: 0.035,
  }), materials.alloy));

  if (materials.decal) {
    for (const side of [-1, 1]) {
      const decal = namedMesh(THREE, side < 0 ? "LeftWingRoundel" : "RightWingRoundel",
        new THREE.CircleGeometry(lod === 0 ? 0.5 : 0.43, lod === 0 ? 48 : 24), materials.decal, {
          position: [side * 3.42, 0.505, 0.82],
          rotation: [-Math.PI / 2, 0, side * 0.04],
          castShadow: false,
          receiveShadow: false,
        });
      decal.renderOrder = 2;
      scene.add(decal);
    }
  }

  scene.add(namedMesh(THREE, "Tailplanes", airfoilPairGeometry(THREE, {
    rootX: 0.26,
    tipX: 2.28,
    rootLeadingZ: 3.35,
    rootTrailingZ: 4.78,
    tipLeadingZ: 3.82,
    tipTrailingZ: 4.82,
    y: 0.55,
    rootThickness: 0.14,
    tipThickness: 0.05,
    spanSegments: Math.max(2, Math.ceil(detail.wingSpan * 0.45)),
    chordSegments: Math.max(2, Math.ceil(detail.wingChord * 0.5)),
    dihedral: 0.035,
    camber: 0.012,
  }), materials.alloy));

  scene.add(namedMesh(THREE, "VerticalFin", prismYZGeometry(THREE, [
    [2.72, 0.46],
    [4.78, 0.4],
    [4.22, 2.62],
    [3.32, 3.42],
  ], lod === 2 ? 0.075 : 0.11), materials.navy));

  const intake = namedMesh(THREE, "NoseIntake", new THREE.CylinderGeometry(0.43, 0.43, 0.08, detail.radial, 1, false), materials.dark, {
    position: [0, 0.3, -6.27],
    rotation: [Math.PI / 2, 0, 0],
    scale: [1, 1, 0.9],
  });
  scene.add(intake);
  scene.add(namedMesh(THREE, "IntakeLip", new THREE.TorusGeometry(0.46, 0.075, Math.max(8, detail.torus / 2), detail.torus), materials.marking, {
    position: [0, 0.3, -6.32],
    scale: [1, 0.91, 1],
  }));

  const exhaust = namedMesh(THREE, "ExhaustNozzle", new THREE.CylinderGeometry(0.23, 0.31, 0.3, detail.radial, 1, true), materials.dark, {
    position: [0, 0.28, 5.19],
    rotation: [Math.PI / 2, 0, 0],
  });
  scene.add(exhaust);

  const canopyMaterial = materials.glass ?? materials.dark;
  const canopy = namedMesh(THREE, "Canopy", new THREE.SphereGeometry(1, detail.sphereWidth, detail.sphereHeight, 0, Math.PI * 2, 0, Math.PI / 2), canopyMaterial, {
    position: [0, 1.08, -1.18],
    scale: [0.66, 0.62, 1.52],
  });
  scene.add(canopy);
  addRod(THREE, scene, "CanopyCenterFrame", [0, 1.12, -2.57], [0, 1.66, -0.38], lod === 2 ? 0.045 : 0.032, materials.navy, Math.max(8, detail.radial / 3));

  if (lod < 2) {
    for (const z of [-3.52, 2.28, 3.72]) {
      const radius = z < 0 ? 0.73 : z < 3 ? 0.66 : 0.48;
      const ring = namedMesh(THREE, `FuselageBand_${String(z).replace("-", "M").replace(".", "P")}`,
        new THREE.TorusGeometry(radius, lod === 0 ? 0.018 : 0.024, 8, detail.torus), materials.marking, {
          position: [0, 0.31, z],
          scale: [1, z < 0 ? 0.94 : 0.92, 1],
        });
      scene.add(ring);
    }
    for (const side of [-1, 1]) {
      const port = namedMesh(THREE, side < 0 ? "GunPortLeft" : "GunPortRight",
        new THREE.CylinderGeometry(0.075, 0.075, 0.24, 12, 1, false), materials.dark, {
          position: [side * 0.36, 0.15, -5.95],
          rotation: [Math.PI / 2, 0, 0],
        });
      scene.add(port);
    }
  }

  if (lod === 0) {
    for (const side of [-1, 1]) {
      const fairing = namedMesh(THREE, side < 0 ? "LeftWingRootFairing" : "RightWingRootFairing",
        new THREE.SphereGeometry(1, 24, 12), materials.navy, {
          position: [side * 0.75, 0.32, 0.1],
          scale: [0.52, 0.24, 1.72],
        });
      scene.add(fairing);
      addBox(THREE, scene, side < 0 ? "LeftWingFence" : "RightWingFence", [0.035, 0.32, 1.5], materials.navy,
        [side * 3.05, 0.52, 0.82], [0, side * 0.08, 0]);
      const lightMaterial = side < 0 ? materials.red : materials.green;
      scene.add(namedMesh(THREE, side < 0 ? "PortNavigationLight" : "StarboardNavigationLight",
        new THREE.SphereGeometry(0.09, 12, 8), lightMaterial, {
          position: [side * 5.56, 0.43, 1.72],
        }));
    }
    addRod(THREE, scene, "PitotProbe", [0.28, 0.32, -6.2], [0.28, 0.32, -6.68], 0.018, materials.alloy, 10);
  }

  addSocket(THREE, scene, "SOCKET_CAMERA_COCKPIT", PLAYER_COCKPIT_CAMERA);
  addSocket(THREE, scene, "SOCKET_MUZZLE_LEFT", [-0.36, 0.15, -6.08]);
  addSocket(THREE, scene, "SOCKET_MUZZLE_RIGHT", [0.36, 0.15, -6.08]);
  addSocket(THREE, scene, "SOCKET_GEAR_NOSE", [0, -0.56, -3.88]);
  addSocket(THREE, scene, "SOCKET_GEAR_LEFT", [-1.82, 0.04, 0.22]);
  addSocket(THREE, scene, "SOCKET_GEAR_RIGHT", [1.82, 0.04, 0.22]);
  preparePbrGeometry(scene);
  return scene;
}

function buildBanditExterior(THREE, lod) {
  const detail = [
    { radial: 44, wingSpan: 11, wingChord: 9, sphereWidth: 38, sphereHeight: 18, torus: 30 },
    { radial: 26, wingSpan: 6, wingChord: 5, sphereWidth: 22, sphereHeight: 11, torus: 18 },
    { radial: 14, wingSpan: 3, wingChord: 3, sphereWidth: 14, sphereHeight: 7, torus: 12 },
  ][lod];
  const materials = banditMaterials(THREE, lod);
  const scene = new THREE.Group();
  scene.name = `BANDIT_SWEPT_WING_LOD${lod}`;
  scene.userData = { assetId: BANDIT_ASSET_ID, lod, generator: GENERATOR_ID, units: "metres", forward: "-Z" };

  const bodySections = [
    { z: -5.42, rx: 0.48, ry: 0.47, y: 0.34 },
    { z: -4.95, rx: 0.73, ry: 0.68, y: 0.36 },
    { z: -3.45, rx: 0.82, ry: 0.79, y: 0.38 },
    { z: -1.15, rx: 0.86, ry: 0.82, y: 0.39 },
    { z: 1.1, rx: 0.74, ry: 0.71, y: 0.37 },
    { z: 2.85, rx: 0.56, ry: 0.54, y: 0.35 },
    { z: 4.05, rx: 0.35, ry: 0.34, y: 0.34 },
    { z: 4.58, rx: 0.19, ry: 0.19, y: 0.34 },
  ];
  scene.add(namedMesh(THREE, "Fuselage", loftGeometry(THREE, bodySections, detail.radial), materials.alloy));

  scene.add(namedMesh(THREE, "MainWings", airfoilPairGeometry(THREE, {
    rootX: 0.5,
    tipX: 5.02,
    rootLeadingZ: -1.56,
    rootTrailingZ: 1.7,
    tipLeadingZ: 0.12,
    tipTrailingZ: 1.86,
    y: 0.47,
    rootThickness: 0.24,
    tipThickness: 0.07,
    spanSegments: detail.wingSpan,
    chordSegments: detail.wingChord,
    dihedral: -0.035,
    camber: 0.028,
  }), materials.alloy));

  scene.add(namedMesh(THREE, "HighTailplanes", airfoilPairGeometry(THREE, {
    rootX: 0.24,
    tipX: 2.05,
    rootLeadingZ: 2.67,
    rootTrailingZ: 4.02,
    tipLeadingZ: 3.1,
    tipTrailingZ: 4.08,
    y: 1.26,
    rootThickness: 0.13,
    tipThickness: 0.045,
    spanSegments: Math.max(2, Math.ceil(detail.wingSpan * 0.45)),
    chordSegments: Math.max(2, Math.ceil(detail.wingChord * 0.5)),
    dihedral: 0.02,
    camber: 0.01,
  }), materials.charcoal));

  scene.add(namedMesh(THREE, "VerticalFin", prismYZGeometry(THREE, [
    [2.2, 0.48],
    [4.14, 0.44],
    [3.82, 2.76],
    [3.0, 3.32],
  ], lod === 2 ? 0.07 : 0.1), materials.red));

  scene.add(namedMesh(THREE, "NoseIntake", new THREE.CylinderGeometry(0.54, 0.54, 0.09, detail.radial, 1, false), materials.dark, {
    position: [0, 0.34, -5.44],
    rotation: [Math.PI / 2, 0, 0],
    scale: [1, 1, 0.9],
  }));
  scene.add(namedMesh(THREE, "RedIntakeLip", new THREE.TorusGeometry(0.57, 0.08, Math.max(8, detail.torus / 2), detail.torus), materials.red, {
    position: [0, 0.34, -5.49],
    scale: [1, 0.93, 1],
  }));
  addBox(THREE, scene, "IntakeSplitter", [0.065, 0.91, 0.11], materials.charcoal, [0, 0.34, -5.53]);

  scene.add(namedMesh(THREE, "ExhaustNozzle", new THREE.CylinderGeometry(0.22, 0.29, 0.34, detail.radial, 1, true), materials.dark, {
    position: [0, 0.34, 4.56],
    rotation: [Math.PI / 2, 0, 0],
  }));

  const canopyMaterial = materials.glass ?? materials.charcoal;
  scene.add(namedMesh(THREE, "BubbleCanopy", new THREE.SphereGeometry(1, detail.sphereWidth, detail.sphereHeight, 0, Math.PI * 2, 0, Math.PI / 2), canopyMaterial, {
    position: [0, 1.12, -0.82],
    scale: [0.62, 0.68, 1.34],
  }));
  if (lod < 2) {
    addRod(THREE, scene, "CanopyRearFrame", [-0.58, 1.02, 0.2], [0.58, 1.02, 0.2], 0.03, materials.red, 10);
  }

  if (lod < 2) {
    for (const side of [-1, 1]) {
      addBox(THREE, scene, side < 0 ? "LeftWingFence" : "RightWingFence", [0.035, 0.34, 1.28], materials.red,
        [side * 2.72, 0.66, 0.8], [0, side * 0.08, 0]);
      const gun = namedMesh(THREE, side < 0 ? "LeftGunFairing" : "RightGunFairing",
        new THREE.CylinderGeometry(0.095, 0.13, 0.68, 14, 1, false), materials.charcoal, {
          position: [side * 0.42, 0.02, -4.55],
          rotation: [Math.PI / 2, 0, 0],
        });
      scene.add(gun);
    }
    scene.add(namedMesh(THREE, "TailIdentificationBand", new THREE.TorusGeometry(0.46, 0.055, 10, detail.torus), materials.red, {
      position: [0, 0.35, 3.42],
      scale: [1, 0.94, 1],
    }));
  }

  if (lod === 0) {
    for (const side of [-1, 1]) {
      scene.add(namedMesh(THREE, side < 0 ? "LeftWingRootBlister" : "RightWingRootBlister",
        new THREE.SphereGeometry(1, 22, 11), materials.charcoal, {
          position: [side * 0.72, 0.42, 0.0],
          scale: [0.48, 0.2, 1.38],
        }));
    }
    addRod(THREE, scene, "NoseProbe", [0, 0.7, -5.25], [0, 0.7, -5.88], 0.016, materials.charcoal, 10);
  }

  addSocket(THREE, scene, "SOCKET_CAMERA_COCKPIT", [0, 1.22, -0.84]);
  addSocket(THREE, scene, "SOCKET_MUZZLE_LEFT", [-0.42, 0.02, -4.87]);
  addSocket(THREE, scene, "SOCKET_MUZZLE_RIGHT", [0.42, 0.02, -4.87]);
  addSocket(THREE, scene, "SOCKET_DAMAGE_CENTER", [0, 0.38, -0.1]);
  preparePbrGeometry(scene);
  return scene;
}

function buildCockpit(THREE) {
  const materials = cockpitMaterials(THREE);
  const scene = new THREE.Group();
  scene.name = "PLAYER_SABRE_FURY_COCKPIT_LOD0";
  scene.userData = { assetId: COCKPIT_ASSET_ID, lod: 0, generator: GENERATOR_ID, units: "metres", forward: "-Z" };

  addBox(THREE, scene, "CockpitFloor", [1.14, 0.12, 3.05], materials.tub, [0, 0.28, -1.12]);
  addBox(THREE, scene, "LeftTubWall", [0.12, 0.86, 2.9], materials.tub, [-0.66, 0.68, -1.08], [0, 0, -0.05]);
  addBox(THREE, scene, "RightTubWall", [0.12, 0.86, 2.9], materials.tub, [0.66, 0.68, -1.08], [0, 0, 0.05]);
  addBox(THREE, scene, "RearBulkhead", [1.3, 1.25, 0.14], materials.tub, [0, 0.94, 0.33], [-0.06, 0, 0]);

  addBox(THREE, scene, "InstrumentPanel", [1.28, 0.78, 0.15], materials.panel, [0, 1.02, -2.43], [-0.08, 0, 0]);
  addBox(THREE, scene, "InstrumentCoaming", [1.4, 0.12, 0.58], materials.tub, [0, 1.46, -2.27], [-0.06, 0, 0]);
  addBox(THREE, scene, "LeftConsole", [0.34, 0.19, 1.8], materials.console, [-0.5, 0.69, -1.16], [0.03, 0, -0.08]);
  addBox(THREE, scene, "RightConsole", [0.34, 0.19, 1.8], materials.console, [0.5, 0.69, -1.16], [0.03, 0, 0.08]);

  const gauges = [
    [-0.42, 1.2, 0.13],
    [-0.14, 1.23, 0.13],
    [0.14, 1.23, 0.13],
    [0.42, 1.2, 0.13],
    [-0.39, 0.92, 0.12],
    [-0.13, 0.92, 0.115],
    [0.13, 0.92, 0.115],
    [0.39, 0.92, 0.12],
    [-0.26, 0.68, 0.1],
    [0, 0.68, 0.1],
    [0.26, 0.68, 0.1],
  ];
  for (let index = 0; index < gauges.length; index++) {
    const [x, y, radius] = gauges[index];
    const gauge = namedMesh(THREE, `Gauge_${String(index + 1).padStart(2, "0")}`,
      new THREE.CylinderGeometry(radius, radius, 0.025, 28, 1, false), materials.gauge, {
        position: [x, y, -2.34],
        rotation: [Math.PI / 2, 0, 0],
      });
    scene.add(gauge);
    addRod(THREE, scene, `GaugeNeedle_${String(index + 1).padStart(2, "0")}`,
      [x, y, -2.318], [x + radius * 0.55 * Math.cos(index * 0.71), y + radius * 0.55 * Math.sin(index * 0.71), -2.318],
      0.008, materials.needle, 8);
  }

  for (let index = 0; index < 6; index++) {
    const side = index < 3 ? -1 : 1;
    const local = index % 3;
    const switchBase = namedMesh(THREE, `${side < 0 ? "Left" : "Right"}ConsoleSwitch_${local + 1}`,
      new THREE.CylinderGeometry(0.026, 0.026, 0.08, 10, 1, false), materials.metal, {
        position: [side * (0.44 + local * 0.025), 0.83, -1.68 + local * 0.38],
        rotation: [0, 0, side * 0.18],
      });
    scene.add(switchBase);
  }

  const seatBack = addBox(THREE, scene, "SeatBack", [0.72, 0.98, 0.18], materials.leather, [0, 0.94, 0.08], [-0.12, 0, 0]);
  seatBack.castShadow = true;
  addBox(THREE, scene, "SeatCushion", [0.74, 0.2, 0.62], materials.leather, [0, 0.45, -0.19], [0.02, 0, 0]);
  addBox(THREE, scene, "Headrest", [0.46, 0.28, 0.18], materials.leather, [0, 1.49, -0.02], [-0.1, 0, 0]);
  addBox(THREE, scene, "LeftHarness", [0.09, 0.74, 0.035], materials.harness, [-0.2, 1.05, -0.04], [-0.14, 0, -0.14]);
  addBox(THREE, scene, "RightHarness", [0.09, 0.74, 0.035], materials.harness, [0.2, 1.05, -0.04], [-0.14, 0, 0.14]);

  addRod(THREE, scene, "ControlColumn", [0, 0.43, -1.34], [0, 0.91, -1.24], 0.035, materials.metal, 14);
  addRod(THREE, scene, "ControlGrip", [-0.11, 0.91, -1.24], [0.11, 0.91, -1.24], 0.055, materials.panel, 14);
  addRod(THREE, scene, "ThrottleLever", [-0.52, 0.8, -1.16], [-0.48, 1.02, -1.08], 0.025, materials.metal, 12);
  scene.add(namedMesh(THREE, "ThrottleGrip", new THREE.SphereGeometry(0.075, 16, 9), materials.red, {
    position: [-0.48, 1.03, -1.08],
    scale: [0.8, 1.2, 0.8],
  }));

  addBox(THREE, scene, "GunsightBody", [0.25, 0.24, 0.32], materials.panel, [0, 1.56, -2.18], [-0.04, 0, 0]);
  const gunsightGlass = namedMesh(THREE, "GunsightCombinerGlass", panelGeometry(THREE, [
    [-0.16, 1.62, -2.32],
    [0.16, 1.62, -2.32],
    [0.14, 1.89, -2.25],
    [-0.14, 1.89, -2.25],
  ]), materials.glass);
  gunsightGlass.castShadow = false;
  scene.add(gunsightGlass);

  const leftWindshield = namedMesh(THREE, "LeftWindshield", panelGeometry(THREE, [
    [-0.68, 1.38, -2.2],
    [-0.04, 1.42, -2.32],
    [-0.03, 1.9, -1.96],
    [-0.48, 1.84, -1.82],
  ]), materials.glass);
  leftWindshield.castShadow = false;
  scene.add(leftWindshield);
  const rightWindshield = namedMesh(THREE, "RightWindshield", panelGeometry(THREE, [
    [0.04, 1.42, -2.32],
    [0.68, 1.38, -2.2],
    [0.48, 1.84, -1.82],
    [0.03, 1.9, -1.96],
  ]), materials.glass);
  rightWindshield.castShadow = false;
  scene.add(rightWindshield);

  addRod(THREE, scene, "LeftWindshieldFrame", [-0.68, 1.38, -2.2], [-0.48, 1.84, -1.82], 0.026, materials.metal, 12);
  addRod(THREE, scene, "RightWindshieldFrame", [0.68, 1.38, -2.2], [0.48, 1.84, -1.82], 0.026, materials.metal, 12);
  addRod(THREE, scene, "WindshieldCenterFrame", [0, 1.42, -2.32], [0, 1.9, -1.96], 0.024, materials.metal, 12);
  addRod(THREE, scene, "LeftCanopyRail", [-0.67, 1.35, -2.14], [-0.67, 1.44, 0.22], 0.03, materials.metal, 12);
  addRod(THREE, scene, "RightCanopyRail", [0.67, 1.35, -2.14], [0.67, 1.44, 0.22], 0.03, materials.metal, 12);

  for (let index = 0; index < 4; index++) {
    scene.add(namedMesh(THREE, `WarningLamp_${index + 1}`, new THREE.SphereGeometry(0.035, 12, 7), materials.lamp, {
      position: [-0.18 + index * 0.12, 1.4, -2.34],
      scale: [1, 0.65, 0.45],
    }));
  }

  preparePbrGeometry(scene);
  consolidateStaticMeshes(THREE, scene, {
    preserveNames: [
      "ControlColumn", "ControlGrip", "ThrottleLever", "ThrottleGrip",
      "GunsightCombinerGlass", "LeftWindshield", "RightWindshield",
    ],
  });

  addSocket(THREE, scene, "SOCKET_CAMERA_COCKPIT", PLAYER_COCKPIT_CAMERA);
  addSocket(THREE, scene, "SOCKET_GUNSIGHT_ORIGIN", [0, 1.72, -2.28]);
  addSocket(THREE, scene, "SOCKET_INSTRUMENT_PANEL_ORIGIN", [0, 1.02, -2.34]);
  addSocket(THREE, scene, "SOCKET_CONTROL_STICK", [0, 0.9, -1.24]);
  addSocket(THREE, scene, "SOCKET_CONTROL_THROTTLE", [-0.48, 1.02, -1.08]);
  addSocket(THREE, scene, "SOCKET_CANOPY_HINGE", [0, 1.47, 0.22], [0, 0, Math.PI / 2]);
  addSocket(THREE, scene, "SOCKET_MUZZLE_LEFT", [-0.36, 0.15, -6.08]);
  addSocket(THREE, scene, "SOCKET_MUZZLE_RIGHT", [0.36, 0.15, -6.08]);
  return scene;
}

function sceneMetrics(THREE, scene) {
  let nodes = 0;
  let meshes = 0;
  let triangles = 0;
  let drawCalls = 0;
  const materials = new Set();
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    nodes++;
    if (!object.isMesh) return;
    meshes++;
    const positionCount = object.geometry?.getAttribute("position")?.count ?? 0;
    const elementCount = object.geometry?.index?.count ?? positionCount;
    triangles += Math.floor(elementCount / 3) * (object.isInstancedMesh ? object.count : 1);
    const materialList = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materialList) if (material) materials.add(material);
    drawCalls += Array.isArray(object.material)
      ? Math.max(1, object.geometry?.groups?.length ?? 0)
      : 1;
  });
  const bounds = new THREE.Box3().setFromObject(scene);
  const size = bounds.getSize(new THREE.Vector3());
  const minimum = bounds.min;
  const maximum = bounds.max;
  const round = (value) => Number(value.toFixed(3));
  return Object.freeze({
    nodes,
    meshes,
    triangles,
    drawCalls,
    materials: materials.size,
    materialNames: [...materials].map((material) => material.name).sort(),
    bounds: {
      min: [round(minimum.x), round(minimum.y), round(minimum.z)],
      max: [round(maximum.x), round(maximum.y), round(maximum.z)],
      size: [round(size.x), round(size.y), round(size.z)],
    },
  });
}

function finalizeSpec(THREE, definition) {
  const metrics = sceneMetrics(THREE, definition.scene);
  return Object.freeze({
    assetId: definition.assetId,
    output: definition.output,
    level: definition.level,
    scene: definition.scene,
    anchors: definition.anchors.map((anchor) => ({ ...anchor })),
    metadata: Object.freeze({
      generator: GENERATOR_ID,
      displayName: definition.displayName,
      role: definition.role,
      level: definition.level,
      minProjectedPixels: definition.minProjectedPixels,
      coordinates: { units: "metres", up: "+Y", forward: "-Z", handedness: "right" },
      intendedDimensionsMetres: definition.intendedDimensionsMetres,
      budgets: definition.budgets,
      anchors: definition.anchors.map((anchor) => ({ ...anchor })),
      metrics,
      notes: definition.notes,
    }),
  });
}

/**
 * Builds deterministic Three scenes for the Korea starter pack. The caller owns
 * serialization and disposal. No Three or exporter module is imported here so
 * tests and alternate tooling can inject the exact runtime Three namespace.
 */
export function buildAircraftAssetSpecs(THREE) {
  requireThree(THREE);
  const specs = [];
  const fighterLevels = [
    { minProjectedPixels: 180, budgets: { triangles: 12000, drawCalls: 24, materials: 8, textureMemoryMiB: 2, maxTextureDimension: 256 } },
    { minProjectedPixels: 48, budgets: { triangles: 5000, drawCalls: 16, materials: 6, textureMemoryMiB: 1, maxTextureDimension: 128 } },
    { minProjectedPixels: 0, budgets: { triangles: 1800, drawCalls: 9, materials: 4, textureMemoryMiB: 0, maxTextureDimension: 1 } },
  ];

  for (let level = 0; level < fighterLevels.length; level++) {
    const levelDefinition = fighterLevels[level];
    specs.push(finalizeSpec(THREE, {
      assetId: PLAYER_ASSET_ID,
      output: `models/player-swept-jet/lod${level}.glb`,
      level,
      scene: buildPlayerExterior(THREE, level),
      anchors: PLAYER_ANCHORS,
      displayName: `Player Sabre/Fury-class exterior LOD ${level}`,
      role: "player-exterior",
      minProjectedPixels: levelDefinition.minProjectedPixels,
      budgets: levelDefinition.budgets,
      intendedDimensionsMetres: { length: 11.88, span: 11.16, height: 3.98 },
      notes: "Stylized-realistic naval early-jet silhouette with nose intake, swept wing, low tailplane, UV0/tangents, panelled PBR surfaces, and generic roundel decals on close LODs.",
    }));
    specs.push(finalizeSpec(THREE, {
      assetId: BANDIT_ASSET_ID,
      output: `models/bandit-swept-jet/lod${level}.glb`,
      level,
      scene: buildBanditExterior(THREE, level),
      anchors: BANDIT_ANCHORS,
      displayName: `Bandit swept-wing exterior LOD ${level}`,
      role: "bandit-exterior",
      minProjectedPixels: levelDefinition.minProjectedPixels,
      budgets: levelDefinition.budgets,
      intendedDimensionsMetres: { length: 10.46, span: 10.04, height: 3.68 },
      notes: "Distinct compact interceptor silhouette with central intake splitter, high tailplane, UV0/tangents, panelled natural-metal PBR finish, and red recognition panels.",
    }));
  }

  specs.push(finalizeSpec(THREE, {
    assetId: COCKPIT_ASSET_ID,
    output: "models/player-cockpit/lod0.glb",
    level: 0,
    scene: buildCockpit(THREE),
    anchors: COCKPIT_ANCHORS,
    displayName: "Player Sabre/Fury-class first-person cockpit",
    role: "player-cockpit-interior",
    minProjectedPixels: 0,
    budgets: { triangles: 12000, drawCalls: 20, materials: 12, textureMemoryMiB: 2, maxTextureDimension: 256 },
    intendedDimensionsMetres: { width: 1.4, occupiedLength: 3.2, height: 1.95 },
    notes: "First-person cockpit tub with deterministic instrument and worn-panel PBR atlases, consolidated static batches, gunsight combiner, controls, seat, canopy structure, and stable interaction sockets.",
  }));

  return Object.freeze(specs);
}

export const AIRCRAFT_ASSET_IDS = Object.freeze({
  playerExterior: PLAYER_ASSET_ID,
  banditExterior: BANDIT_ASSET_ID,
  playerCockpit: COCKPIT_ASSET_ID,
});
