#!/usr/bin/env node

// Exports the exact Build 299 desktop presentation meshes that sit outside the analytical
// basin/river pair and the seven-role asset kit. Web remains the only geometry/placement
// authority; Unity consumes this generated renderer payload instead of reimplementing it.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "../../web/wwwroot/vendor/three.module.js";
import {
  planCobraCanyonWorld,
  validateCobraCanyonWorld,
} from "../../web/wwwroot/render/cobra/cobra_canyon_plan.js";
import {
  createCobraCanyonPresentation,
} from "../../web/wwwroot/render/cobra/cobra_canyon_presentation.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, "../..");
const worldPath = resolve(
  repositoryRoot,
  "content/packs/cobra-vietnam/environment/cobra-canyon.world.json",
);
const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
if (outIndex < 0 || !args[outIndex + 1]) {
  throw new Error("usage: export-core-manifest.mjs --out PATH");
}
const outputPath = resolve(args[outIndex + 1]);

const EXPORTED_ROLES = new Set([
  "roads",
  "heroCells",
  "landmarks",
  "hazards",
  "bridge-deck",
  "bridge-pier",
]);

function rounded(value, places) {
  return Number(Number(value).toFixed(places));
}

function finiteArray(attribute) {
  if (!attribute?.array) return [];
  return Array.from(attribute.array, (value) => rounded(value, 7));
}

function integerArray(index) {
  if (!index?.array) return [];
  return Array.from(index.array, Number);
}

function vectorArray(value) {
  return [rounded(value.r, 9), rounded(value.g, 9), rounded(value.b, 9)];
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function transformFromMatrix(matrix) {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  return {
    px: rounded(position.x, 6),
    py: rounded(position.y, 6),
    pz: rounded(position.z, 6),
    qx: rounded(quaternion.x, 8),
    qy: rounded(quaternion.y, 8),
    qz: rounded(quaternion.z, 8),
    qw: rounded(quaternion.w, 8),
    sx: rounded(scale.x, 6),
    sy: rounded(scale.y, 6),
    sz: rounded(scale.z, 6),
  };
}

function materialFrom(mesh) {
  const material = mesh.material;
  if (!material?.isMeshLambertMaterial) {
    throw new TypeError(`${mesh.name} must use the Web MeshLambertMaterial contract.`);
  }
  const side = material.side === THREE.DoubleSide
    ? "double"
    : material.side === THREE.BackSide
      ? "back"
      : "front";
  const blending = material.blending === THREE.NormalBlending ? "normal" : String(material.blending);
  return {
    shader: "lambert",
    name: material.name,
    colorSpace: "linear-srgb",
    colorSrgbHex: material.color.getHexString(THREE.SRGBColorSpace),
    colorLinearRgb: vectorArray(material.color),
    emissiveSrgbHex: material.emissive.getHexString(THREE.SRGBColorSpace),
    emissiveLinearRgb: vectorArray(material.emissive),
    emissiveIntensity: rounded(material.emissiveIntensity, 6),
    flatShading: material.flatShading === true,
    side,
    transparent: material.transparent === true,
    opacity: rounded(material.opacity, 6),
    alphaTest: rounded(material.alphaTest, 6),
    depthTest: material.depthTest === true,
    depthWrite: material.depthWrite === true,
    colorWrite: material.colorWrite === true,
    fog: material.fog === true,
    vertexColors: material.vertexColors === true,
    blending,
    premultipliedAlpha: material.premultipliedAlpha === true,
    toneMapped: material.toneMapped === true,
    polygonOffset: material.polygonOffset === true,
    polygonOffsetFactor: rounded(material.polygonOffsetFactor, 6),
    polygonOffsetUnits: rounded(material.polygonOffsetUnits, 6),
  };
}

function geometryFrom(mesh) {
  const geometry = mesh.geometry;
  const positions = finiteArray(geometry.getAttribute("position"));
  const indices = integerArray(geometry.index);
  return {
    name: geometry.name,
    topology: "triangles",
    positions,
    normals: finiteArray(geometry.getAttribute("normal")),
    colors: finiteArray(geometry.getAttribute("color")),
    uv: finiteArray(geometry.getAttribute("uv")),
    indices,
    triangles: Math.floor((indices.length || positions.length / 3) / 3),
  };
}

function metadataFrom(mesh, index) {
  const source = mesh.userData.cobraCanyonInstances?.[index] ?? {};
  return {
    id: String(source.id ?? `${mesh.userData.cobraCanyon.role}.${index}`),
    sourceId: String(source.landmarkId ?? ""),
    kind: String(source.kind ?? ""),
    authoredHazard: source.authoredHazard === true,
    routeEnvelopeAdjusted: source.routeEnvelopeAdjusted === true,
    routeEnvelopeClearanceM: Number.isFinite(source.routeEnvelopeClearanceM)
      ? rounded(source.routeEnvelopeClearanceM, 6)
      : null,
  };
}

function instancesFrom(mesh) {
  if (!mesh.isInstancedMesh) return [];
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const instances = [];
  for (let index = 0; index < mesh.count; index++) {
    mesh.getMatrixAt(index, matrix);
    if (mesh.instanceColor) mesh.getColorAt(index, color);
    else color.setRGB(1, 1, 1);
    instances.push({
      ...metadataFrom(mesh, index),
      ...transformFromMatrix(matrix),
      cr: rounded(color.r, 6),
      cg: rounded(color.g, 6),
      cb: rounded(color.b, 6),
    });
  }
  return instances;
}

function exportRole(mesh) {
  const role = mesh.userData.cobraCanyon.role;
  const geometry = geometryFrom(mesh);
  const instances = instancesFrom(mesh);
  const instanceCount = mesh.isInstancedMesh ? mesh.count : 0;
  return {
    role,
    meshKind: mesh.isInstancedMesh ? "instanced" : "static",
    count: mesh.isInstancedMesh ? mesh.count : 1,
    geometry,
    objectTransform: transformFromMatrix(mesh.matrix),
    material: materialFrom(mesh),
    rendering: {
      visible: mesh.visible === true,
      castShadow: mesh.castShadow === true,
      receiveShadow: mesh.receiveShadow === true,
      renderOrder: mesh.renderOrder,
      frustumCulled: mesh.frustumCulled === true,
      hazardCue: mesh.userData.cobraCanyon.hazardCue === true,
      visualExtendsCollisionY: mesh.userData.cobraCanyon.visualExtendsCollisionY === true,
      hasInstanceColors: Boolean(mesh.instanceColor),
    },
    instances,
    renderedTriangles: geometry.triangles * Math.max(1, instanceCount),
  };
}

const world = validateCobraCanyonWorld(JSON.parse(await readFile(worldPath, "utf8")));
const qualityTier = "desktop";
const plan = planCobraCanyonWorld(world, { qualityTier });
const presentation = createCobraCanyonPresentation(THREE, plan, { qualityTier });
const roles = presentation.group.children
  .filter((child) => EXPORTED_ROLES.has(child?.userData?.cobraCanyon?.role))
  .map(exportRole)
  .sort((left, right) => compareAscii(left.role, right.role));

if (roles.length !== EXPORTED_ROLES.size) {
  const found = new Set(roles.map((role) => role.role));
  const missing = [...EXPORTED_ROLES].filter((role) => !found.has(role));
  presentation.dispose();
  throw new Error(`Build 299 core presentation roles missing: ${missing.join(", ")}`);
}

const manifest = {
  schema: "guns-only.cobra-canyon.unity-core-kit.v1",
  sourceWorldId: plan.worldId,
  sourceContentVersion: world.contentVersion,
  sourceVisualContractId: "visual-contract.cobra-vietnam.cobra-canyon.v1",
  sourceWebBuild: 299,
  qualityTier,
  coordinateSystem: {
    units: "metres",
    x: "east",
    y: "up",
    z: "negative-north",
    transforms: "three-js-trs",
  },
  excludedPresentationRoles: ["basin", "river", "assetKit"],
  drawCalls: roles.length,
  instanceCount: roles.reduce((sum, role) => sum + role.instances.length, 0),
  renderedTriangles: roles.reduce((sum, role) => sum + role.renderedTriangles, 0),
  roles,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest)}\n`, "utf8");
presentation.dispose();
process.stdout.write(
  `wrote ${outputPath}: ${roles.length} roles, ${manifest.instanceCount} instances, `
    + `${manifest.renderedTriangles} rendered triangles\n`,
);
