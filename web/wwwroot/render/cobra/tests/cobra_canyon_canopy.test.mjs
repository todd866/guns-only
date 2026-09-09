import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import { planCobraCanyonWorld, sampleCobraCanyonTerrain } from "../cobra_canyon_plan.js";
import { COBRA_CANOPY_BUDGETS, COBRA_CANOPY_TRIANGLES,
  cobraCanopyFootprintAllowed, planCobraCanopyCell, createCobraCanopyField,
} from "../cobra_canyon_canopy.js";
import { createCobraCanyonPresentation, COBRA_CANYON_RENDER_BUDGETS,
  sampleCobraCanyonRenderedBasinHeight,
} from "../cobra_canyon_presentation.js";

const world = JSON.parse(await readFile(new URL(
  "../../../content/packs/cobra-vietnam/environment/cobra-canyon.world.json", import.meta.url), "utf8"));
const plan = planCobraCanyonWorld(world, { qualityTier: "balanced" });
const camera = { x: -3800, y: 460, z: 4600 };
function settle(field, position = camera, ambientBudgetLevel = 0) {
  let frames = 0;
  do {
    field.update({ cameraPosition: position, ambientBudgetLevel });
    assert.ok(++frames <= 200, "bounded cell work must eventually settle");
  } while (field.diagnostics().pendingCells);
}

test("the crown layer has tree proportions and terrain seating with full-footprint mission exclusions", () => {
  const records = [];
  for (let x = -30; x < -7; x++) for (let n = -18; n < 10; n++) {
    const cell = planCobraCanopyCell(plan, x, n);
    assert.deepEqual(cell, planCobraCanopyCell(plan, x, n));
    records.push(...cell);
  }
  assert.ok(records.length > 100, "the representative forest region must not silently go bare");
  for (const record of records) {
    assert.ok(record.height >= 16 && record.height <= 24);
    assert.ok(record.width >= 35 && record.width <= 60 && record.depth >= 30 && record.depth <= 50);
    assert.ok(record.height / Math.max(record.width, record.depth) > 0.26,
      "a tree stand must have real crown height, not become a flat hillside plaque");
    assert.ok(cobraCanopyFootprintAllowed(plan, record.x, record.n, record.radiusM));
    assert.ok(record.y < sampleCobraCanyonTerrain(plan, record.x, record.n));
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      const x = Math.cos(angle) * record.radiusM; const n = Math.sin(angle) * record.radiusM;
      const skirt = record.y + x * record.eastSlope + n * record.northSlope;
      assert.ok(skirt <= sampleCobraCanyonTerrain(plan, record.x + x, record.n + n) + 1e-8,
        "the fitted canopy skirt may not float over sampled ground");
    }
  }
  for (const lane of plan.routeLanes) for (const point of lane.pathLocalM) {
    assert.equal(cobraCanopyFootprintAllowed(plan, point[0], point[2], 120), false);
  }
  for (const point of plan.landmarks.map((landmark) => landmark.positionLocalM)) {
    assert.equal(cobraCanopyFootprintAllowed(plan, point[0], point[2], 120), false);
  }
  assert.equal(cobraCanopyFootprintAllowed(plan, 7990, 0, 120), false);
});

test("resident crowns remain deterministic through travel, budget shedding and repeated disposal", () => {
  for (const qualityTier of Object.keys(COBRA_CANOPY_BUDGETS)) {
    const field = createCobraCanopyField(THREE, plan, { qualityTier });
    const material = field.mesh.material; const geometry = field.mesh.geometry;
    assert.equal(geometry.getAttribute("position").count / 3, COBRA_CANOPY_TRIANGLES);
    assert.equal(field.mesh.castShadow, false, "the extra batch must not add a shadow submission");
    settle(field, { ...camera, y: 12000 });
    assert.ok(field.mesh.count > 30, `${qualityTier} must carry a visible forest layer`);
    const transform = new THREE.Matrix4(); const point = new THREE.Vector3();
    const vertices = geometry.getAttribute("position");
    for (let instance = 0; instance < field.mesh.count; instance++) {
      field.mesh.getMatrixAt(instance, transform);
      for (let vertex = 0; vertex < vertices.count; vertex++) {
        point.fromBufferAttribute(vertices, vertex).applyMatrix4(transform);
        assert.ok(field.mesh.boundingSphere.containsPoint(point),
          "ground crown culling bounds must contain the geometry even for a high first camera");
      }
    }
    const ids = field.mesh.userData.cobraCanyonInstances.map((r) => r.id);
    const matrices = Array.from(field.mesh.instanceMatrix.array.slice(0, field.mesh.count * 16));
    const snapshot = field.diagnostics();
    settle(field);
    assert.equal(field.diagnostics(), snapshot, "parked frames should reuse their diagnostics");
    settle(field, { x: -4400, y: 650, z: -1500 }, 2);
    assert.ok(field.mesh.count <= Math.floor(COBRA_CANOPY_BUDGETS[qualityTier].capacity * 0.6));
    settle(field);
    assert.deepEqual(field.mesh.userData.cobraCanyonInstances.map((r) => r.id), ids);
    assert.deepEqual(Array.from(field.mesh.instanceMatrix.array.slice(0, field.mesh.count * 16)), matrices);
    const disposed = { material: 0, geometry: 0, mesh: 0 };
    for (const [key, resource] of Object.entries({ material, geometry, mesh: field.mesh })) {
      resource.addEventListener("dispose", () => { disposed[key]++; });
    }
    field.dispose(); field.dispose();
    assert.deepEqual(disposed, { material: 1, geometry: 1, mesh: 1 });
  }
});

test("canopy obeys declared allocations and remains visible above the close foliage AGL cutoff", () => {
  for (const qualityTier of Object.keys(COBRA_CANOPY_BUDGETS)) {
    const p = planCobraCanyonWorld(world, { qualityTier });
    const presentation = createCobraCanyonPresentation(THREE, p, { qualityTier });
    try {
      for (let frame = 0; frame < 110; frame++) {
        presentation.update({ cameraPosition: camera, cameraAglM: 700 });
      }
      const d = presentation.diagnostics(); const budget = COBRA_CANYON_RENDER_BUDGETS[qualityTier];
      assert.equal(d.nearRingVisible, false);
      assert.ok(d.roleCounts.canopyInstances > 30, "mid-distance forest survives altitude shedding");
      assert.ok(d.builtTriangles <= budget.maxTriangles);
      assert.ok(d.builtInstances <= budget.maxInstances);
      assert.ok(d.builtDrawCalls <= budget.maxDrawCalls);
      let triangles = 0; let drawCalls = 0;
      presentation.group.traverse((mesh) => {
        if (!mesh.isMesh || !mesh.visible) return;
        const count = mesh.isInstancedMesh ? mesh.count : 1;
        if (!count) return;
        drawCalls++;
        triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 * count;
      });
      assert.equal(d.drawCalls, drawCalls);
      assert.equal(d.triangles, triangles);
    } finally { presentation.dispose(); }
  }
});

test("a continuous 96 m camera move never resizes surviving crown instance transforms", () => {
  const field = createCobraCanopyField(THREE, plan, { qualityTier: "mobile" });
  const transforms = () => new Map(field.mesh.userData.cobraCanyonInstances.map((r, i) =>
    [r.id, Array.from(field.mesh.instanceMatrix.array.slice(i * 16, i * 16 + 16))]));
  try {
    settle(field, camera, 2); // deliberately exhaust the lower-rung mobile resident capacity
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader,
      fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    field.mesh.material.onBeforeCompile(shader);
    const initial = transforms();
    let previousRadius = shader.uniforms.cobraCanopyFadeRange.value.w;
    let checked = 0;
    for (let east = 4; east <= 96; east += 4) {
      field.update({ cameraPosition: { ...camera, x: camera.x + east }, ambientBudgetLevel: 2 });
      const radius = shader.uniforms.cobraCanopyFadeRange.value.w;
      assert.ok(Math.abs(radius - previousRadius) <= 4.000001,
        "capacity-bound far fade must not jump at an occupancy refresh");
      previousRadius = radius;
      for (const [id, matrix] of transforms()) {
        if (!initial.has(id)) continue;
        assert.deepEqual(matrix, initial.get(id), `${id} must fade in the shader, not jump in scale`);
        checked++;
      }
    }
    assert.ok(checked > 100, "the pan must exercise crowns across two occupancy refreshes");
    assert.match(shader.vertexShader, /cameraPosition\.xz - canopyCentre\.xz/);
    assert.match(shader.vertexShader, /transformed \*= canopyFade/);
    assert.ok(shader.uniforms.cobraCanopyFadeRange.value.w > 0);
  } finally { field.dispose(); }
});

test("the real Iron Bell and player-eye views contain exposed crowns and ground-rooted leaf cards", () => {
  const presentation = createCobraCanyonPresentation(THREE, plan, { qualityTier: "balanced" });
  const drawn = (x, n) => sampleCobraCanyonRenderedBasinHeight(plan, "balanced", x, n);
  try {
    for (const pose of [
      { x: -2710.01458, y: 213.46917, z: 861.04990, yaw: -0.013888, pitch: 0, fov: 58 },
      { x: -3050, y: 165.15396, z: 700, yaw: -1.075, pitch: -0.05, fov: 56 },
    ]) {
      const camera = new THREE.PerspectiveCamera(pose.fov, 1.6, 0.5, 12000);
      camera.position.set(pose.x, pose.y, pose.z); camera.rotation.order = "YXZ";
      camera.rotation.set(pose.pitch, pose.yaw, 0); camera.updateMatrixWorld();
      for (let frame = 0; frame < 110; frame++) presentation.update({ cameraPosition: camera.position });
      presentation.group.updateMatrixWorld(true);
      const crowns = presentation.group.children.find((o) => o.name === "COBRA_MIDFIELD_CANOPY");
      const basin = presentation.group.children.find((o) => o.userData.cobraCanyon?.role === "basin");
      const ray = new THREE.Raycaster();
      let exposed = 0; let unoccluded = 0;
      for (const r of crowns.userData.cobraCanyonInstances) {
        const worldTop = new THREE.Vector3(r.x, r.y + r.height, -r.n);
        const top = worldTop.clone().project(camera);
        if (Math.abs(top.x) < 1 && Math.abs(top.y) < 1 && top.z > 0 && top.z < 1
          && r.y + r.height > drawn(r.x, r.n) + 2) {
          exposed++;
          const distance = worldTop.distanceTo(camera.position);
          ray.set(camera.position, worldTop.sub(camera.position).normalize()); ray.far = distance - 0.1;
          if (!ray.intersectObject(basin).length) unoccluded++;
        }
      }
      assert.ok(exposed >= 20,
        `the flight view needs canopy coverage, not ${exposed} offscreen/buried crown candidates`);
      assert.ok(unoccluded >= 8, `only ${unoccluded} projected crowns clear the drawn terrain sightline`);
      let checked = 0;
      presentation.group.traverse((mesh) => {
        if (mesh.name !== "COBRA_CANYON_ASSET_JUNGLE") return;
        for (let i = 0; i < mesh.count; i++) {
          const r = mesh.userData.cobraCanyonInstances[i];
          const root = mesh.instanceMatrix.array[i * 16 + 13];
          assert.ok(root <= drawn(r.eastM, r.northM) + 0.001,
            "capped cards must never float over the coarser drawn hillside");
          checked++;
        }
      });
      assert.ok(checked > 100, "the actual flight-view resident cards must be exercised");
    }
  } finally { presentation.dispose(); }
});

test("canopy shader normals match inverse transpose for flat and steep sheared instances", () => {
  const field = createCobraCanopyField(THREE, plan, { qualityTier: "balanced" });
  try {
    settle(field, { x: -3050, y: 165, z: 700 });
    const records = field.mesh.userData.cobraCanyonInstances;
    const steep = records.reduce((best, r, i) =>
      Math.hypot(r.eastSlope, r.northSlope) > Math.hypot(records[best].eastSlope, records[best].northSlope)
        ? i : best, 0);
    assert.ok(Math.hypot(records[steep].eastSlope, records[steep].northSlope) > 0.5);
    const matrix = new THREE.Matrix4(); field.mesh.getMatrixAt(steep, matrix);
    for (const transform of [new THREE.Matrix4().makeScale(150, 18, 120), matrix]) {
      const columns = [0, 1, 2].map((index) => new THREE.Vector3().setFromMatrixColumn(transform, index));
      const cofactor = [columns[1].clone().cross(columns[2]), columns[2].clone().cross(columns[0]),
        columns[0].clone().cross(columns[1])];
      const inverseTranspose = new THREE.Matrix3().getNormalMatrix(transform);
      const normals = field.mesh.geometry.getAttribute("normal");
      for (let vertex = 0; vertex < normals.count; vertex++) {
        const normal = new THREE.Vector3().fromBufferAttribute(normals, vertex);
        const shaderNormal = cofactor[0].clone().multiplyScalar(normal.x)
          .addScaledVector(cofactor[1], normal.y).addScaledVector(cofactor[2], normal.z).normalize();
        const expected = normal.clone().applyMatrix3(inverseTranspose).normalize();
        assert.ok(shaderNormal.distanceTo(expected) < 1e-12);
      }
    }
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader,
      fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    field.mesh.material.onBeforeCompile(shader);
    assert.match(shader.vertexShader, /mat3\(cross\(im\[1\], im\[2\]\), cross\(im\[2\], im\[0\]\),\s*cross\(im\[0\], im\[1\]\)\)/);
    assert.doesNotMatch(shader.vertexShader, /dot\( im\[ 0 \]/,
      "the incompatible standard instance correction must be replaced, not run afterward");
  } finally { field.dispose(); }
});

test("optional canopy albedo is sampled in world metres and retains page-owned texture lifetime", () => {
  const texture = new THREE.Texture(); texture.colorSpace = THREE.SRGBColorSpace;
  let disposed = 0; texture.addEventListener("dispose", () => { disposed++; });
  const painted = createCobraCanopyField(THREE, plan, { surfaceTextures: { canopy: texture } });
  const fallback = createCobraCanopyField(THREE, plan);
  try {
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader,
      fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    painted.mesh.material.onBeforeCompile(shader);
    assert.equal(shader.uniforms.uCanopySurface.value, texture);
    assert.match(shader.fragmentShader, /texture2D\(uCanopySurface, vCanopyWorld\.xz \/ 12\.0\)/);
    assert.match(shader.fragmentShader, /texture2D\(uCanopySurface, vCanopyWorld\.yz \/ 12\.0\)/);
    assert.match(shader.fragmentShader, /texture2D\(uCanopySurface, vCanopyWorld\.xy \/ 12\.0\)/);
    assert.match(shader.vertexShader, /inverseTransformDirection\(transformedNormal, viewMatrix\)/);
    assert.equal(painted.mesh.material.color.getHex(), 0xffffff);
    assert.notEqual(painted.mesh.material.customProgramCacheKey(), fallback.mesh.material.customProgramCacheKey());
  } finally { painted.dispose(); fallback.dispose(); }
  assert.equal(disposed, 0, "rebuilding a field must not dispose the shared page texture");
  texture.dispose();
});

test("stationary quality recovery and a parked teleport settle to the same radius as a fresh field", () => {
  const pose = { x: -3050, y: 260, z: 700 };
  const create = () => {
    const field = createCobraCanopyField(THREE, plan, { qualityTier: "balanced" });
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader,
      fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    field.mesh.material.onBeforeCompile(shader);
    return { field, range: shader.uniforms.cobraCanopyFadeRange.value };
  };
  const fresh = create(); const recovered = create(); const teleported = create();
  try {
    settle(fresh.field, pose, 0);
    settle(recovered.field, pose, 2);
    const constrained = recovered.range.w;
    settle(recovered.field, pose, 0);
    assert.ok(recovered.range.w > constrained + 20,
      "restoring quality while parked must actually extend the drawn forest");
    assert.deepEqual(recovered.range.toArray(), fresh.range.toArray());
    assert.equal(recovered.field.mesh.count, fresh.field.mesh.count);
    settle(teleported.field, { x: -4600, y: 800, z: -2500 }, 0);
    settle(teleported.field, pose, 0);
    assert.deepEqual(teleported.range.toArray(), fresh.range.toArray(),
      "camera jumps must not retain the previous location's fade radius indefinitely");
  } finally { fresh.field.dispose(); recovered.field.dispose(); teleported.field.dispose(); }
});

test("balanced and desktop retain their full canopy reach in all four reviewed flight windows", () => {
  const poses = [
    { x: -2710.01458, y: 213.46917, z: 861.0499 },
    { x: -3050, y: 165, z: 700 },
    { x: -3605, y: 232, z: 4712 },
    { x: -4557, y: 176, z: 3661 },
  ];
  for (const qualityTier of ["balanced", "desktop"]) {
    const p = planCobraCanyonWorld(world, { qualityTier });
    const field = createCobraCanopyField(THREE, p, { qualityTier,
      sampleTerrain: (x, n) => sampleCobraCanyonRenderedBasinHeight(p, qualityTier, x, n) });
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader,
      fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    field.mesh.material.onBeforeCompile(shader);
    try {
      for (const pose of poses) {
        settle(field, pose);
        assert.equal(shader.uniforms.cobraCanopyFadeRange.value.w,
          COBRA_CANOPY_BUDGETS[qualityTier].radiusM,
          `${qualityTier} must fund the full flight-view forest radius at ${pose.x},${pose.z}`);
        assert.ok(field.mesh.count < COBRA_CANOPY_BUDGETS[qualityTier].capacity,
          "the reviewed window needs room for every eligible tree stand");
      }
    } finally { field.dispose(); }
  }
});
