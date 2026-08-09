/**
 * Renderer-neutral, camera-local YZF-R1 presence for the helmet view.
 *
 * The frozen contract is the source of truth for both Web and Unity. It describes only
 * portable primitives, metres/radians transforms, and colours in explicit sRGB + linear
 * forms. The Three.js builder below is a consumer of that contract, never a second model.
 */

export const R1_FIRST_PERSON_SCHEMA = "guns-only.r1-first-person.v1";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const transform = (positionM = [0, 0, 0], rotationRad = [0, 0, 0]) => ({
  positionM,
  rotationRad,
});

const colour = (hex, rgb8, linearRgb) => ({
  srgb: { hex, rgb8 },
  linearRgb,
});

const parts = [
  {
    name: "r1-windscreen",
    primitive: "panel",
    verticesM: [
      [-0.31, -0.46, -0.78], [0.31, -0.46, -0.78],
      [-0.27, -0.28, -0.96], [0.27, -0.28, -0.96],
      [-0.18, -0.13, -1.18], [0.18, -0.13, -1.18],
    ],
    triangles: [[0, 1, 2], [1, 3, 2], [2, 3, 4], [3, 5, 4]],
    material: "windscreen",
    ...transform(),
  },
  {
    name: "r1-windscreen-rim",
    primitive: "line-segments",
    segmentsM: [
      [[-0.31, -0.46, -0.775], [-0.27, -0.28, -0.955]],
      [[-0.27, -0.28, -0.955], [-0.18, -0.13, -1.175]],
      [[-0.18, -0.13, -1.175], [0.18, -0.13, -1.175]],
      [[0.18, -0.13, -1.175], [0.27, -0.28, -0.955]],
      [[0.27, -0.28, -0.955], [0.31, -0.46, -0.775]],
    ],
    material: "windscreen-rim",
    ...transform(),
  },
  {
    name: "r1-fairing-left",
    primitive: "panel",
    verticesM: [
      [-0.18, -0.37, -0.89], [-0.56, -0.44, -0.76],
      [-0.92, -0.98, -0.56], [-0.16, -1.02, -0.52],
    ],
    triangles: [[0, 1, 2], [0, 2, 3]],
    material: "yamaha-blue",
    ...transform(),
  },
  {
    name: "r1-fairing-right",
    primitive: "panel",
    verticesM: [
      [0.18, -0.37, -0.89], [0.56, -0.44, -0.76],
      [0.92, -0.98, -0.56], [0.16, -1.02, -0.52],
    ],
    triangles: [[0, 2, 1], [0, 3, 2]],
    material: "yamaha-blue",
    ...transform(),
  },
  {
    name: "r1-fairing-highlight-left",
    primitive: "box",
    dimensionsM: [0.36, 0.025, 0.055],
    material: "highlight-blue",
    ...transform([-0.42, -0.52, -0.70], [0.10, 0.22, -0.18]),
  },
  {
    name: "r1-fairing-highlight-right",
    primitive: "box",
    dimensionsM: [0.36, 0.025, 0.055],
    material: "highlight-blue",
    ...transform([0.42, -0.52, -0.70], [0.10, -0.22, 0.18]),
  },
  {
    name: "r1-tank",
    primitive: "ellipsoid",
    dimensionsM: [0.72, 0.64, 0.94],
    segments: [28, 16],
    material: "yamaha-blue",
    ...transform([0, -0.72, -0.90]),
  },
  {
    name: "r1-tank-pad",
    primitive: "box",
    dimensionsM: [0.20, 0.035, 0.36],
    material: "rubber",
    ...transform([0, -0.43, -0.78], [-0.17, 0, 0]),
  },
  {
    name: "r1-dash",
    primitive: "box",
    dimensionsM: [0.34, 0.13, 0.08],
    material: "satin-black",
    ...transform([0, -0.34, -0.90], [-0.10, 0, 0]),
  },
  {
    name: "r1-dash-glass",
    primitive: "plane",
    dimensionsM: [0.26, 0.072],
    material: "dash-glass",
    ...transform([0, -0.335, -0.855], [-0.10, 0, 0]),
  },
  ...Array.from({ length: 7 }, (_, index) => ({
    name: `r1-tach-light-${index}`,
    primitive: "box",
    dimensionsM: [0.034, 0.012, 0.008],
    material: index >= 5 ? "tach-red" : "tach-green",
    telemetry: { kind: "rpm-segment", index },
    ...transform([-0.105 + index * 0.035, -0.307, -0.850], [-0.10, 0, 0]),
  })),
  {
    name: "r1-clip-ons",
    primitive: "box",
    dimensionsM: [0.20, 0.035, 0.12],
    material: "aluminium",
    ...transform([0, -0.40, -0.85]),
  },
  ...[-1, 1].flatMap((side) => {
    const suffix = side < 0 ? "left" : "right";
    return [
      {
        name: `r1-clip-on-bar-${suffix}`,
        primitive: "cylinder",
        radiusM: 0.018,
        lengthM: 0.28,
        radialSegments: 10,
        material: "aluminium",
        ...transform([side * 0.21, -0.40, -0.84], [0, 0, Math.PI / 2]),
      },
      {
        name: `r1-grip-${suffix}`,
        primitive: "cylinder",
        radiusM: 0.028,
        lengthM: 0.15,
        radialSegments: 12,
        material: "rubber",
        ...transform([side * 0.405, -0.40, -0.82], [0, 0, Math.PI / 2]),
      },
      {
        name: `r1-lever-${suffix}`,
        primitive: "box",
        dimensionsM: [0.15, 0.009, 0.014],
        material: "aluminium",
        ...transform([side * 0.41, -0.35, -0.84], [0, 0, side * -0.10]),
      },
    ];
  }),
];

export const R1_FIRST_PERSON_CONTRACT = deepFreeze({
  schema: R1_FIRST_PERSON_SCHEMA,
  coordinateSystem: {
    units: "metres",
    handedness: "right",
    origin: "helmet-camera",
    right: "+x",
    up: "+y",
    forward: "-z",
    rotation: "local XYZ radians",
  },
  requiredAnchors: [
    "r1-windscreen",
    "r1-windscreen-rim",
    "r1-fairing-left",
    "r1-fairing-right",
    "r1-clip-ons",
    "r1-dash",
    "r1-tank",
  ],
  colors: {
    yamahaBlue: colour("#0b4d9b", [11, 77, 155], [0.00334654, 0.07421357, 0.32777810]),
    highlightBlue: colour("#1769c4", [23, 105, 196], [0.00856813, 0.14126329, 0.55201140]),
    satinBlack: colour("#111719", [17, 23, 25], [0.00560539, 0.00856813, 0.00972122]),
    rubber: colour("#090c0d", [9, 12, 13], [0.00273174, 0.00367651, 0.00402472]),
    aluminium: colour("#8b9699", [139, 150, 153], [0.25818285, 0.30498731, 0.31854678]),
    windscreen: colour("#9bc3cd", [155, 195, 205], [0.32777810, 0.54572446, 0.61049557]),
    windscreenRim: colour("#1a2b31", [26, 43, 49], [0.01032982, 0.02415763, 0.03071344]),
    dashGlass: colour("#162522", [22, 37, 34], [0.00802319, 0.01850022, 0.01599629]),
    tachIdle: colour("#23302b", [35, 48, 43], [0.01680738, 0.02955683, 0.02415763]),
    tachGreen: colour("#25452f", [37, 69, 47], [0.01850022, 0.05951124, 0.02842604]),
    tachRed: colour("#7a2417", [122, 36, 23], [0.19461783, 0.01764195, 0.00856813]),
  },
  materials: {
    "yamaha-blue": { model: "pbr", color: "yamahaBlue", roughness: 0.34, metalness: 0.18, side: "double" },
    "highlight-blue": { model: "pbr", color: "highlightBlue", roughness: 0.28, metalness: 0.16 },
    "satin-black": { model: "pbr", color: "satinBlack", roughness: 0.76, metalness: 0.12 },
    rubber: { model: "pbr", color: "rubber", roughness: 0.96, metalness: 0.01 },
    aluminium: { model: "pbr", color: "aluminium", roughness: 0.44, metalness: 0.72 },
    windscreen: { model: "unlit", color: "windscreen", opacity: 0.075, transparent: true, depthWrite: false, side: "double" },
    "windscreen-rim": { model: "unlit", color: "windscreenRim", opacity: 0.92, transparent: true },
    "dash-glass": { model: "unlit", color: "dashGlass" },
    "tach-green": { model: "pbr", color: "tachIdle", emissive: "tachGreen", emissiveIntensity: 0.06, roughness: 0.48 },
    "tach-red": { model: "pbr", color: "tachIdle", emissive: "tachRed", emissiveIntensity: 0.06, roughness: 0.48 },
  },
  tachometer: {
    idleRpm: 2_000,
    redlineRpm: 14_500,
    inactiveEmissiveIntensity: 0.06,
    activeEmissiveIntensity: 1.65,
  },
  render: {
    cameraLocal: true,
    fog: false,
    frustumCulled: false,
    renderOrder: 2_000,
  },
  parts,
});

export const R1_FIRST_PERSON_REQUIRED_PARTS = R1_FIRST_PERSON_CONTRACT.requiredAnchors;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function contractColor(THREE, colorName) {
  const rgb = R1_FIRST_PERSON_CONTRACT.colors[colorName]?.linearRgb;
  if (!rgb) throw new Error(`Unknown R1 contract colour: ${colorName}`);
  return new THREE.Color(rgb[0], rgb[1], rgb[2]);
}

function contractMaterial(THREE, materialName, line = false) {
  const spec = R1_FIRST_PERSON_CONTRACT.materials[materialName];
  if (!spec) throw new Error(`Unknown R1 contract material: ${materialName}`);
  const common = {
    color: contractColor(THREE, spec.color),
    fog: R1_FIRST_PERSON_CONTRACT.render.fog,
    transparent: spec.transparent === true,
    opacity: spec.opacity ?? 1,
    depthWrite: spec.depthWrite !== false,
  };
  if (!line && spec.side === "double") common.side = THREE.DoubleSide;
  if (line) return new THREE.LineBasicMaterial(common);
  if (spec.model === "unlit") return new THREE.MeshBasicMaterial(common);
  return new THREE.MeshStandardMaterial({
    ...common,
    roughness: spec.roughness ?? 0.5,
    metalness: spec.metalness ?? 0,
    emissive: spec.emissive ? contractColor(THREE, spec.emissive) : new THREE.Color(0, 0, 0),
    emissiveIntensity: spec.emissiveIntensity ?? 1,
  });
}

function panelGeometry(THREE, part) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(part.verticesM.flat(), 3),
  );
  geometry.setIndex(part.triangles.flat());
  geometry.computeVertexNormals();
  return geometry;
}

function lineGeometry(THREE, part) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(part.segmentsM.flat(2), 3),
  );
  return geometry;
}

function createContractObject(THREE, part) {
  let geometry;
  if (part.primitive === "panel") geometry = panelGeometry(THREE, part);
  else if (part.primitive === "line-segments") geometry = lineGeometry(THREE, part);
  else if (part.primitive === "box") geometry = new THREE.BoxGeometry(...part.dimensionsM);
  else if (part.primitive === "plane") geometry = new THREE.PlaneGeometry(...part.dimensionsM);
  else if (part.primitive === "ellipsoid") {
    geometry = new THREE.SphereGeometry(0.5, part.segments[0], part.segments[1]);
  } else if (part.primitive === "cylinder") {
    geometry = new THREE.CylinderGeometry(
      part.radiusM,
      part.radiusM,
      part.lengthM,
      part.radialSegments,
    );
  } else {
    throw new Error(`Unsupported R1 contract primitive: ${part.primitive}`);
  }

  const isLine = part.primitive === "line-segments";
  const material = contractMaterial(THREE, part.material, isLine);
  const object = isLine
    ? new THREE.LineSegments(geometry, material)
    : new THREE.Mesh(geometry, material);
  object.name = part.name;
  object.position.fromArray(part.positionM);
  object.rotation.fromArray([...part.rotationRad, "XYZ"]);
  if (part.primitive === "ellipsoid") object.scale.fromArray(part.dimensionsM);
  object.frustumCulled = R1_FIRST_PERSON_CONTRACT.render.frustumCulled;
  object.renderOrder = R1_FIRST_PERSON_CONTRACT.render.renderOrder;
  object.userData.cameraLocal = true;
  object.userData.contractPrimitive = part.primitive;
  if (part.telemetry) object.userData.telemetry = part.telemetry;
  return object;
}

export function createR1FirstPersonRig(THREE) {
  if (!THREE?.Group || !THREE?.Mesh) {
    throw new TypeError("createR1FirstPersonRig requires a Three.js namespace");
  }

  const root = new THREE.Group();
  root.name = "r1-first-person";
  root.userData.schema = R1_FIRST_PERSON_CONTRACT.schema;
  root.userData.cameraLocal = R1_FIRST_PERSON_CONTRACT.render.cameraLocal;
  root.userData.contract = R1_FIRST_PERSON_CONTRACT;

  const tachLights = [];
  for (const part of R1_FIRST_PERSON_CONTRACT.parts) {
    const object = createContractObject(THREE, part);
    root.add(object);
    if (part.telemetry?.kind === "rpm-segment") tachLights.push(object);
  }
  tachLights.sort((a, b) => a.userData.telemetry.index - b.userData.telemetry.index);

  function update(state = {}) {
    const tach = R1_FIRST_PERSON_CONTRACT.tachometer;
    const rpm = Number.isFinite(state.rpm) ? state.rpm : 0;
    const lit = Math.round(clamp(
      (rpm - tach.idleRpm) / (tach.redlineRpm - tach.idleRpm),
      0,
      1,
    ) * tachLights.length);
    for (let index = 0; index < tachLights.length; index++) {
      tachLights[index].material.emissiveIntensity = index < lit
        ? tach.activeEmissiveIntensity
        : tach.inactiveEmissiveIntensity;
    }
  }

  function dispose() {
    root.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material?.dispose?.());
      } else {
        object.material?.dispose?.();
      }
    });
  }

  return Object.freeze({ object3d: root, update, dispose });
}
