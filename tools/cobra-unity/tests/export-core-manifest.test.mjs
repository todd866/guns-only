import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDir, "../../..");
const exporter = resolve(repositoryRoot, "tools/cobra-unity/export-core-manifest.mjs");
const canonical = resolve(
  repositoryRoot,
  "content/packs/cobra-vietnam/environment/cobra-canyon-core-kit-desktop-v1.json",
);
const staged = resolve(
  repositoryRoot,
  "web/wwwroot/content/packs/cobra-vietnam/environment/cobra-canyon-core-kit-desktop-v1.json",
);

function runExporter(output) {
  return spawnSync(process.execPath, [exporter, "--out", output], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

test("Web Build 299 deterministically exports the exact staged Unity core kit", async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), "guns-only-cobra-unity-core-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const firstOutput = join(scratch, "core-first.json");
  const secondOutput = join(scratch, "core-second.json");
  const firstRun = runExporter(firstOutput);
  const secondRun = runExporter(secondOutput);
  assert.equal(firstRun.status, 0, `${firstRun.stdout}\n${firstRun.stderr}`);
  assert.equal(secondRun.status, 0, `${secondRun.stdout}\n${secondRun.stderr}`);

  const [expectedBytes, stagedBytes, firstBytes, secondBytes] = await Promise.all([
    readFile(canonical),
    readFile(staged),
    readFile(firstOutput),
    readFile(secondOutput),
  ]);
  assert.deepEqual(stagedBytes, expectedBytes, "published source copy drifted");
  assert.deepEqual(firstBytes, expectedBytes, "exported Web presentation drifted");
  assert.deepEqual(secondBytes, firstBytes, "two exports were not byte deterministic");
  assert.equal(firstBytes.at(-1), 0x0a, "manifest must end with exactly one newline");
});

test("Unity core kit contains every non-terrain Web draw submission and its render contract", async () => {
  const manifest = JSON.parse(await readFile(canonical, "utf8"));
  assert.equal(manifest.schema, "guns-only.cobra-canyon.unity-core-kit.v1");
  assert.equal(manifest.sourceWebBuild, 299);
  assert.equal(manifest.qualityTier, "desktop");
  assert.deepEqual(manifest.coordinateSystem, {
    units: "metres",
    x: "east",
    y: "up",
    z: "negative-north",
    transforms: "three-js-trs",
  });
  assert.deepEqual(manifest.excludedPresentationRoles, ["basin", "river", "assetKit"]);
  assert.equal(manifest.drawCalls, 6);
  assert.equal(manifest.instanceCount, 43);
  assert.equal(manifest.renderedTriangles, 1_836);

  assert.deepEqual(
    manifest.roles.map((role) => role.role),
    ["bridge-deck", "bridge-pier", "hazards", "heroCells", "landmarks", "roads"],
  );
  const roles = Object.fromEntries(manifest.roles.map((role) => [role.role, role]));
  assert.deepEqual(
    Object.fromEntries(manifest.roles.map((role) => [role.role, {
      meshKind: role.meshKind,
      count: role.count,
      positions: role.geometry.positions.length / 3,
      normals: role.geometry.normals.length / 3,
      uv: role.geometry.uv.length / 2,
      indices: role.geometry.indices.length,
      triangles: role.geometry.triangles,
      renderedTriangles: role.renderedTriangles,
    }])),
    {
      "bridge-deck": {
        meshKind: "instanced", count: 1, positions: 864, normals: 864,
        uv: 0, indices: 0, triangles: 288, renderedTriangles: 288,
      },
      "bridge-pier": {
        meshKind: "instanced", count: 2, positions: 108, normals: 108,
        uv: 0, indices: 0, triangles: 36, renderedTriangles: 72,
      },
      hazards: {
        meshKind: "instanced", count: 23, positions: 24, normals: 24,
        uv: 24, indices: 36, triangles: 12, renderedTriangles: 276,
      },
      heroCells: {
        meshKind: "static", count: 1, positions: 324, normals: 324,
        uv: 0, indices: 0, triangles: 108, renderedTriangles: 108,
      },
      landmarks: {
        meshKind: "instanced", count: 17, positions: 28, normals: 28,
        uv: 28, indices: 48, triangles: 16, renderedTriangles: 272,
      },
      roads: {
        meshKind: "static", count: 1, positions: 2_460, normals: 2_460,
        uv: 0, indices: 0, triangles: 820, renderedTriangles: 820,
      },
    },
  );

  assert.deepEqual(
    Object.fromEntries(manifest.roles.map((role) => [role.role, {
      color: role.material.colorSrgbHex,
      emissive: role.material.emissiveSrgbHex,
      flat: role.material.flatShading,
      side: role.material.side,
      transparent: role.material.transparent,
      opacity: role.material.opacity,
      depthWrite: role.material.depthWrite,
      polygonOffset: role.material.polygonOffset,
      polygonOffsetFactor: role.material.polygonOffsetFactor,
      polygonOffsetUnits: role.material.polygonOffsetUnits,
    }])),
    {
      "bridge-deck": {
        color: "a95b42", emissive: "35130c", flat: false, side: "front",
        transparent: false, opacity: 1, depthWrite: true,
        polygonOffset: false, polygonOffsetFactor: 0, polygonOffsetUnits: 0,
      },
      "bridge-pier": {
        color: "8b8979", emissive: "24241d", flat: false, side: "front",
        transparent: false, opacity: 1, depthWrite: true,
        polygonOffset: false, polygonOffsetFactor: 0, polygonOffsetUnits: 0,
      },
      hazards: {
        color: "e96a43", emissive: "411006", flat: true, side: "front",
        transparent: false, opacity: 1, depthWrite: true,
        polygonOffset: false, polygonOffsetFactor: 0, polygonOffsetUnits: 0,
      },
      heroCells: {
        color: "6a5030", emissive: "000000", flat: false, side: "front",
        transparent: true, opacity: 0.16, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      },
      landmarks: {
        color: "ffffff", emissive: "000000", flat: false, side: "front",
        transparent: false, opacity: 1, depthWrite: true,
        polygonOffset: false, polygonOffsetFactor: 0, polygonOffsetUnits: 0,
      },
      roads: {
        color: "b0683c", emissive: "241008", flat: true, side: "double",
        transparent: false, opacity: 1, depthWrite: true,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
      },
    },
  );

  assert.equal(roles.landmarks.rendering.hasInstanceColors, true);
  assert.deepEqual(
    [roles.landmarks.instances[0].cr, roles.landmarks.instances[0].cg,
      roles.landmarks.instances[0].cb],
    [0.48, 0.36, 0.22],
  );
  assert.equal(
    roles["bridge-deck"].instances[0].id,
    "hazard.cobra-canyon.iron-bell-deck.v1",
  );
  assert.deepEqual(
    {
      position: [roles["bridge-deck"].instances[0].px,
        roles["bridge-deck"].instances[0].py,
        roles["bridge-deck"].instances[0].pz],
      scale: [roles["bridge-deck"].instances[0].sx,
        roles["bridge-deck"].instances[0].sy,
        roles["bridge-deck"].instances[0].sz],
      localYBounds: roles["bridge-deck"].geometry.positions
        .filter((_, index) => index % 3 === 1)
        .reduce(
          ([minimum, maximum], value) => [Math.min(minimum, value), Math.max(maximum, value)],
          [Infinity, -Infinity],
        ),
      visualExtendsCollisionY: roles["bridge-deck"].rendering.visualExtendsCollisionY,
    },
    {
      position: [-2_710, 146, 500],
      scale: [130, 8, 32],
      localYBounds: [-0.5, 1.5],
      visualExtendsCollisionY: true,
    },
    "Iron Bell's open truss crown must extend above its authored collision AABB",
  );
  assert.deepEqual(
    roles["bridge-pier"].instances.map((instance) => ({
      id: instance.id,
      position: [instance.px, instance.py, instance.pz],
      scale: [instance.sx, instance.sy, instance.sz],
    })),
    [
      {
        id: "hazard.cobra-canyon.iron-bell-east-pier.v1",
        position: [-2_656, 120, 500],
        scale: [14, 48, 30],
      },
      {
        id: "hazard.cobra-canyon.iron-bell-west-pier.v1",
        position: [-2_764, 120, 500],
        scale: [14, 48, 30],
      },
    ],
  );
  for (const role of manifest.roles) {
    assert.equal(role.material.shader, "lambert");
    assert.equal(role.material.colorSpace, "linear-srgb");
    assert.equal(role.material.emissiveIntensity, 1);
    assert.equal(role.material.fog, true);
    assert.equal(role.rendering.castShadow, false);
    assert.equal(role.rendering.receiveShadow, true);
    assert.equal(role.geometry.positions.length, role.geometry.normals.length);
    const vertexCount = role.geometry.positions.length / 3;
    assert.ok(role.geometry.indices.every((index) => index >= 0 && index < vertexCount));
    assert.equal(role.instances.length, role.meshKind === "instanced" ? role.count : 0);
    for (const instance of role.instances) {
      for (const key of ["px", "py", "pz", "qx", "qy", "qz", "qw", "sx", "sy", "sz"])
        assert.ok(Number.isFinite(instance[key]), `${role.role}.${instance.id}.${key}`);
      const quaternionLength = Math.hypot(instance.qx, instance.qy, instance.qz, instance.qw);
      assert.ok(Math.abs(quaternionLength - 1) < 1e-6, `${role.role}.${instance.id} quaternion`);
      assert.ok(instance.sx > 0 && instance.sy > 0 && instance.sz > 0);
    }
  }
  for (const role of [roles["bridge-deck"], roles["bridge-pier"], roles.hazards]) {
    assert.equal(role.rendering.renderOrder, 4);
    assert.equal(role.rendering.frustumCulled, false);
    assert.equal(role.rendering.hazardCue, true);
  }
  for (const role of [roles["bridge-pier"], roles.hazards, roles.heroCells,
    roles.landmarks, roles.roads]) {
    assert.equal(role.rendering.visualExtendsCollisionY, false);
  }
});
