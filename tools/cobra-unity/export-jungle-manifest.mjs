#!/usr/bin/env node

// Exports the exact Build 299 desktop asset-kit geometry and instance transforms for Unity.
// This is a renderer adapter, not a second placement algorithm: Web remains the deterministic
// planner, and Unity consumes this generated manifest byte-for-byte.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "../../web/wwwroot/vendor/three.module.js";
import {
  planCobraCanyonWorld,
  validateCobraCanyonWorld,
} from "../../web/wwwroot/render/cobra/cobra_canyon_plan.js";
import { createCobraCanyonAssetKit } from
  "../../web/wwwroot/render/cobra/cobra_canyon_asset_kit.js";
import {
  COBRA_CANYON_RENDER_BUDGETS,
  sampleCobraCanyonRenderedBasinHeight,
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
  throw new Error("usage: export-jungle-manifest.mjs --out PATH");
}
const outputPath = resolve(args[outIndex + 1]);

function finiteArray(attribute) {
  if (!attribute?.array) return [];
  return Array.from(attribute.array, (value) => Number(Number(value).toFixed(7)));
}

function integerArray(index) {
  if (!index?.array) return [];
  return Array.from(index.array, Number);
}

function roleFrom(mesh) {
  return mesh?.userData?.cobraCanyon?.role
    ?? mesh?.name?.match(/ASSET_([A-Z]+)/)?.[1]?.toLowerCase()
    ?? "unknown";
}

function exportRole(mesh) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  const instanceMetadata = mesh.userData.cobraCanyonInstances ?? [];
  const instances = [];
  for (let index = 0; index < mesh.count; index++) {
    mesh.getMatrixAt(index, matrix);
    matrix.decompose(position, quaternion, scale);
    if (mesh.instanceColor) mesh.getColorAt(index, color);
    else color.setRGB(1, 1, 1);
    const metadata = instanceMetadata[index] ?? {};
    instances.push({
      id: metadata.id ?? `instance-${index}`,
      batchId: metadata.batchId ?? "",
      setPieceId: metadata.setPieceId ?? "",
      archetypeId: metadata.archetypeId ?? "",
      px: Number(position.x.toFixed(6)),
      py: Number(position.y.toFixed(6)),
      pz: Number(position.z.toFixed(6)),
      qx: Number(quaternion.x.toFixed(8)),
      qy: Number(quaternion.y.toFixed(8)),
      qz: Number(quaternion.z.toFixed(8)),
      qw: Number(quaternion.w.toFixed(8)),
      sx: Number(scale.x.toFixed(6)),
      sy: Number(scale.y.toFixed(6)),
      sz: Number(scale.z.toFixed(6)),
      cr: Number(color.r.toFixed(6)),
      cg: Number(color.g.toFixed(6)),
      cb: Number(color.b.toFixed(6)),
    });
  }
  const geometry = mesh.geometry;
  return {
    role: roleFrom(mesh),
    count: mesh.count,
    geometry: {
      positions: finiteArray(geometry.getAttribute("position")),
      normals: finiteArray(geometry.getAttribute("normal")),
      colors: finiteArray(geometry.getAttribute("color")),
      uv: finiteArray(geometry.getAttribute("uv")),
      indices: integerArray(geometry.index),
    },
    instances,
  };
}

const world = validateCobraCanyonWorld(JSON.parse(await readFile(worldPath, "utf8")));
const qualityTier = "desktop";
const plan = planCobraCanyonWorld(world, { qualityTier });
const kit = createCobraCanyonAssetKit(THREE, plan, {
  qualityTier,
  maxInstances: COBRA_CANYON_RENDER_BUDGETS[qualityTier].maxAssetInstances,
  sampleGroundHeight: (eastM, northM) => sampleCobraCanyonRenderedBasinHeight(
    plan,
    qualityTier,
    eastM,
    northM,
  ),
});
const roles = kit.group.children
  .filter((child) => child?.isInstancedMesh)
  .map(exportRole)
  .sort((left, right) => left.role.localeCompare(right.role));
const manifest = {
  schema: "guns-only.cobra-canyon.unity-asset-kit.v1",
  sourceWorldId: plan.worldId,
  sourceContentVersion: world.contentVersion,
  sourceVisualContractId: "visual-contract.cobra-vietnam.cobra-canyon.v1",
  sourceWebBuild: 299,
  qualityTier,
  maximumInstances: COBRA_CANYON_RENDER_BUDGETS[qualityTier].maxAssetInstances,
  roles,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest)}\n`, "utf8");
kit.dispose();
process.stdout.write(
  `wrote ${outputPath}: ${roles.length} roles, ${roles.reduce((sum, role) => sum + role.count, 0)} instances\n`,
);
