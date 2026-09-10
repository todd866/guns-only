import {
  COBRA_CANYON_CAMP_EMBER_APRON,
  sampleCobraCanyonTerrain,
} from "./cobra_canyon_plan.js?v=359";
import { COBRA_NOISE_CHUNK } from "./cobra_canyon_terrain_material.js?v=359";

// A canopy patch is a small stand of rounded tree crowns. One submission adds the
// missing mid-distance silhouette. These allocations are reserved before the close foliage kit
// gets the remainder. Balanced/desktop retain their old ceilings; mobile's explicit 11,520
// triangle addition is documented in COBRA_CANYON_RENDER_BUDGETS (static terrain left no room).
export const COBRA_CANOPY_BUDGETS = Object.freeze({
  mobile: Object.freeze({ capacity: 144, radiusM: 1200, nearM: 180, fullM: 360 }),
  balanced: Object.freeze({ capacity: 1300, radiusM: 1600, nearM: 200, fullM: 420 }),
  desktop: Object.freeze({ capacity: 1600, radiusM: 1800, nearM: 240, fullM: 480 }),
});
export const COBRA_CANOPY_TRIANGLES = 80;
const CELL_M = 140;
const REBUILD_M = 48;
const TILE_BUILDS_PER_FRAME = 4;
const TAG = Object.freeze({ role: "canopy", presentationOnly: true, authoritative: false,
  collisionSource: false, targetSource: false, targetable: false });

function hash(x) {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}
function unit(seed, salt) { return hash(seed ^ salt) / 4294967296; }
function inside(bounds, x, n, margin = 0) {
  return x >= bounds[0] - margin && n >= bounds[1] - margin
    && x <= bounds[2] + margin && n <= bounds[3] + margin;
}
function pathDistance(points, x, n) {
  let nearest = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]; const b = points[i];
    const dx = b[0] - a[0]; const dn = b[2] - a[2];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (n - a[2]) * dn)
      / Math.max(1, dx * dx + dn * dn)));
    nearest = Math.min(nearest, Math.hypot(x - a[0] - dx * t, n - a[2] - dn * t));
  }
  return nearest;
}

/** Full footprints stay outside authored flight lanes, water, worked ground and mission eyes. */
export function cobraCanopyFootprintAllowed(plan, x, n, radiusM) {
  const bounds = plan.boundsLocalM;
  if (x - radiusM < bounds.minimumEastM || x + radiusM > bounds.maximumEastM
    || n - radiusM < bounds.minimumNorthM || n + radiusM > bounds.maximumNorthM) return false;
  for (const batch of plan.ambientBatches ?? []) {
    if (/plantation-rows|quarry-scrub/.test(batch.kind)
      && inside(batch.boundsLocalM, x, n, radiusM)) return false;
    if (/paddy-mirrors|village-compounds/.test(batch.kind)
      && inside(batch.boundsLocalM, x, n, radiusM)) {
      // These are mixed-biome scatter bounds, not fully occupied fields: both include the whole
      // gorge hillside. Preserve their usable flat ground (kit cutoffs .04/.12) plus a margin,
      // while allowing forest on slopes where neither paddies nor compounds can be placed.
      const slopeLimit = batch.kind === "paddy-mirrors" ? 0.07 : 0.16;
      for (let point = 0; point < 9; point++) {
        const angle = point * Math.PI / 4;
        const ex = x + (point === 8 ? 0 : Math.cos(angle) * radiusM);
        const nn = n + (point === 8 ? 0 : Math.sin(angle) * radiusM);
        if (!inside(batch.boundsLocalM, ex, nn)) continue;
        const dx = sampleCobraCanyonTerrain(plan, ex + 16, nn)
          - sampleCobraCanyonTerrain(plan, ex - 16, nn);
        const dn = sampleCobraCanyonTerrain(plan, ex, nn + 16)
          - sampleCobraCanyonTerrain(plan, ex, nn - 16);
        if (Math.hypot(dx, dn) / 32 < slopeLimit) return false;
      }
    }
  }
  for (const ribbon of plan.terrainRibbons ?? []) {
    if (!/river|road/.test(ribbon.kind)) continue;
    const clear = ribbon.halfWidthM * (ribbon.floorFraction || 0.34) + 30;
    if (pathDistance(ribbon.pointsLocalM, x, n) < clear + radiusM) return false;
  }
  for (const lane of plan.routeLanes ?? []) {
    if (pathDistance(lane.pathLocalM, x, n) < 85 + radiusM) return false;
  }
  for (const landmark of plan.landmarks ?? []) {
    const p = landmark.positionLocalM;
    const clear = /camp-ember/.test(landmark.id) ? 300
      : /iron-bell|plantation-water-tower|red-earth-quarry/.test(landmark.id) ? 305 : 100;
    if (Math.hypot(x - p[0], n - p[2]) < clear + radiusM) return false;
  }
  const apron = COBRA_CANYON_CAMP_EMBER_APRON;
  const heading = apron.finalHeadingDeg * Math.PI / 180;
  const dx = x - apron.eastM; const dn = n - apron.northM;
  if (Math.abs(dx * Math.sin(heading) + dn * Math.cos(heading))
      < apron.protectedLengthM + radiusM
    && Math.abs(dx * Math.cos(heading) - dn * Math.sin(heading))
      < apron.protectedHalfWidthM + radiusM) return false;
  // Wires may extend beyond the route centreline and must remain readable from any approach.
  for (const hazard of plan.hazards ?? []) {
    const c = hazard.collision;
    if (c?.fromLocalM && pathDistance([c.fromLocalM, c.toLocalM], x, n) < 55 + radiusM) return false;
    if (c?.minimumLocalM && inside([c.minimumLocalM[0], c.minimumLocalM[2],
      c.maximumLocalM[0], c.maximumLocalM[2]], x, n, radiusM + 30)) return false;
  }
  return true;
}

/** World-cell seeds, biome bounds and terrain decide the patch; neither camera nor visit order does. */
export function planCobraCanopyCell(plan, cellX, cellN, sampleTerrain = null) {
  const terrain = sampleTerrain ?? ((x, n) => sampleCobraCanyonTerrain(plan, x, n));
  const records = [];
  const cellSeed = hash(Math.imul(cellX, 73856093) ^ Math.imul(cellN, 19349663) ^ 0x43414e4f);
  // A shared anchor groups the four patches into forest islands instead of a uniform stipple.
  const anchorX = cellX * CELL_M + 35 + unit(cellSeed, 1) * 70;
  const anchorN = cellN * CELL_M + 35 + unit(cellSeed, 2) * 70;
  for (let index = 0; index < 4; index++) {
    const seed = hash(cellSeed ^ Math.imul(index + 1, 0x9e3779b1));
    const x = anchorX + (index % 2 ? 1 : -1) * (15 + unit(seed, 3) * 18);
    const n = anchorN + (index < 2 ? -1 : 1) * (15 + unit(seed, 4) * 18);
    const width = 35 + unit(seed, 5) * 25;
    const depth = 30 + unit(seed, 6) * 20;
    const radius = Math.hypot(width, depth) / 2;
    if (!cobraCanopyFootprintAllowed(plan, x, n, radius)) continue;
    const biome = (plan.ambientBatches ?? []).find((batch) => {
      if (!/highland-canopy|riparian-canopy/.test(batch.kind)
        || !inside(batch.boundsLocalM, x, n, -radius)) return false;
      return batch.kind === "highland-canopy" || (plan.terrainRibbons ?? []).some((ribbon) =>
        /river/.test(ribbon.kind) && pathDistance(ribbon.pointsLocalM, x, n) < ribbon.halfWidthM + 650);
    });
    if (!biome) continue;
    const y = terrain(x, n);
    const eastSlope = (terrain(x + radius, n) - terrain(x - radius, n)) / (2 * radius);
    const northSlope = (terrain(x, n + radius) - terrain(x, n - radius)) / (2 * radius);
    if (Math.hypot(eastSlope, northSlope) > 0.9) continue;
    const height = 16 + unit(seed, 7) * 8;
    // Shear a shallow crown layer onto the local slope, then sink its whole skirt beneath sampled
    // ground. Reject crests/curvature that would require a floating or mostly buried rigid patch.
    let residualMin = 0; let residualMax = 0;
    for (let corner = 0; corner < 8; corner++) {
      const angle = corner * Math.PI / 4;
      const ex = Math.cos(angle) * radius; const nn = Math.sin(angle) * radius;
      const residual = terrain(x + ex, n + nn)
        - (y + eastSlope * ex + northSlope * nn);
      residualMin = Math.min(residualMin, residual);
      residualMax = Math.max(residualMax, residual);
    }
    if (residualMax - residualMin > height * 0.8) continue;
    records.push(Object.freeze({ id: `canopy.${cellX}.${cellN}.${index}`, x, n,
      y: y + residualMin - 1, eastSlope, northSlope, width, depth, height,
      radiusM: radius, biomeId: biome.id, yaw: unit(seed, 8) * Math.PI * 2,
      shade: 0.84 + unit(seed, 9) * 0.24 }));
  }
  return Object.freeze(records);
}

function crownGeometry(THREE) {
  const positions = []; const normals = []; const colors = [];
  const add = (p, normal, shade) => {
    positions.push(...p); normals.push(...normal); colors.push(shade, shade, shade);
  };
  // Two 40-triangle crowns buy an upper shoulder ring and a shallow rounded cap. Four cheaper
  // ring-to-tip lobes formed conspicuous pointed roofs even with smooth lighting.
  for (let crown = 0; crown < 2; crown++) {
    const cx = crown ? 0.16 : -0.16; const cz = crown ? 0.075 : -0.075;
    const top = crown ? 1 : 0.92;
    const point = (index, ring) => {
      const a = index * Math.PI / 4 + crown * 0.31;
      const r = [0.16, 0.32, 0.245][ring];
      const y = [-0.12, top * 0.50, top * 0.86][ring];
      const radialNormal = [0.75, 0.95, 0.50][ring];
      return { p: [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r],
        n: [Math.cos(a) * radialNormal, [-0.2, 0.1, 0.8][ring], Math.sin(a) * radialNormal],
        shade: [0.78, 0.94, 1.0][ring] };
    };
    const emit = (...vertices) => vertices.forEach((v) => add(v.p, v.n, v.shade));
    for (let segment = 0; segment < 8; segment++) {
      for (let ring = 0; ring < 2; ring++) {
        const a = point(segment, ring); const b = point(segment + 1, ring);
        const c = point(segment, ring + 1); const d = point(segment + 1, ring + 1);
        emit(a, c, b); emit(b, c, d);
      }
      emit(point(segment, 2), { p: [cx, top, cz], n: [0, 1, 0], shade: 1.04 },
        point(segment + 1, 2));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createCobraCanopyField(THREE, plan, {
  qualityTier = "balanced", sampleTerrain = null, surfaceTextures = null,
} = {}) {
  const budget = COBRA_CANOPY_BUDGETS[qualityTier] ?? COBRA_CANOPY_BUDGETS.balanced;
  const geometry = crownGeometry(THREE);
  const fadeRange = { value: new THREE.Vector4(budget.nearM, budget.fullM,
    budget.radiusM * 0.78, budget.radiusM) };
  const canopySurface = surfaceTextures?.canopy ?? null;
  const material = new THREE.MeshLambertMaterial({ color: canopySurface ? 0xffffff : 0x435332, vertexColors: true,
    emissive: 0x172012, emissiveIntensity: 0.18 });
  // Stable metre-scale variation separates overlapping crowns without a texture or a second
  // draw. Sampling world position keeps the pattern attached to the hillside through LOD fade.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.cobraCanopyFadeRange = fadeRange;
    if (canopySurface) shader.uniforms.uCanopySurface = { value: canopySurface };
    // Three's default column-length correction assumes no instance shear. Our terrain-fitting
    // matrix shears Y, so use the cofactor (inverse transpose × positive determinant) instead.
    // normal_vertex normalizes it afterward; this is GLSL ES 1 compatible and keeps model/view
    // normalMatrix, sidedness and every other standard material step intact.
    const normalChunk = THREE.ShaderChunk.defaultnormal_vertex.replace(
      /transformedNormal \/= vec3\( dot\( im[^\n]+\n\s*transformedNormal = im \* transformedNormal;/,
      `transformedNormal = mat3(cross(im[1], im[2]), cross(im[2], im[0]),
        cross(im[0], im[1])) * transformedNormal;`,
    );
    shader.vertexShader = `varying vec3 vCanopyWorld;
      varying vec3 vCanopyWorldNormal;
      uniform vec4 cobraCanopyFadeRange;\n${shader.vertexShader}`.replace(
      "#include <defaultnormal_vertex>", normalChunk,
    ).replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       vec3 canopyCentre = (modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.)).xyz;
       float canopyDistance = length(cameraPosition.xz - canopyCentre.xz);
       float canopyFade = smoothstep(cobraCanopyFadeRange.x, cobraCanopyFadeRange.y, canopyDistance)
         * (1.0 - smoothstep(cobraCanopyFadeRange.z, cobraCanopyFadeRange.w, canopyDistance));
       transformed *= canopyFade;`,
    ).replace(
      "#include <project_vertex>",
      `#include <project_vertex>
       vCanopyWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`,
    );
    shader.vertexShader = shader.vertexShader.replace("#include <normal_vertex>",
      `#include <normal_vertex>
       vCanopyWorldNormal = inverseTransformDirection(transformedNormal, viewMatrix);`);
    shader.fragmentShader = `varying vec3 vCanopyWorld;
      varying vec3 vCanopyWorldNormal;
      ${canopySurface ? "uniform sampler2D uCanopySurface;" : ""}
      ${COBRA_NOISE_CHUNK}\n${shader.fragmentShader}`.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
       float canopyMottle = cobraNoise(vCanopyWorld.xz / 11.0) * 0.6
         + cobraNoise(vCanopyWorld.xz / 43.0) * 0.4;
       ${canopySurface
    ? `vec3 canopyWeights = pow(abs(normalize(vCanopyWorldNormal)), vec3(4.0));
       canopyWeights /= max(dot(canopyWeights, vec3(1.0)), 0.0001);
       vec3 canopyAlbedo = texture2D(uCanopySurface, vCanopyWorld.yz / 12.0).rgb * canopyWeights.x
         + texture2D(uCanopySurface, vCanopyWorld.xz / 12.0).rgb * canopyWeights.y
         + texture2D(uCanopySurface, vCanopyWorld.xy / 12.0).rgb * canopyWeights.z;
       diffuseColor.rgb *= canopyAlbedo * mix(0.85, 1.10, canopyMottle);`
    : "diffuseColor.rgb *= mix(vec3(0.62, 0.73, 0.65), vec3(1.20, 1.12, 0.95), canopyMottle);"}`,
    );
  };
  material.customProgramCacheKey = () => `cobra-canopy-rounded-triplanar-v5-${canopySurface ? "surface" : "fallback"}`;
  const mesh = new THREE.InstancedMesh(geometry, material, budget.capacity);
  mesh.name = "COBRA_MIDFIELD_CANOPY";
  mesh.userData.cobraCanyon = TAG;
  mesh.userData.cobraCanyonInstances = [];
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(budget.capacity * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = false; mesh.receiveShadow = true; mesh.count = 0;
  // Two resident windows bound memory despite the finer cells; evicted seeds regenerate exactly.
  const cache = new Map();
  const cacheCapacity = Math.ceil((budget.radiusM * 2 / CELL_M + 3) ** 2 * 2);
  let windowKeys = new Set();
  const matrix = new THREE.Matrix4(); const tint = new THREE.Color();
  let queue = []; let cursor = 0; let camera = null; let level = -1; let disposed = false;
  let radiusTarget = budget.radiusM; let fadeRadius = budget.radiusM;
  let lastViewX = NaN; let lastViewN = NaN; let initiallySettled = false;
  let snapshot = Object.freeze({ drawCalls: 0, instances: 0, triangles: 0, pendingCells: 0 });
  const builtMetrics = Object.freeze({ drawCalls: 1, instances: budget.capacity,
    triangles: budget.capacity * COBRA_CANOPY_TRIANGLES });
  function update({ cameraPosition, ambientBudgetLevel = 0 } = {}) {
    if (disposed || !cameraPosition || !Number.isFinite(cameraPosition.x)
      || !Number.isFinite(cameraPosition.z)) return;
    const x = cameraPosition.x; const n = -cameraPosition.z;
    // When a dense cell exhausts capacity, its achieved outer radius may change on a 48 m
    // occupancy refresh. Move that boundary by at most the actual camera travel each frame,
    // before the parked-frame early return. This is deterministic and needs no clock/timers.
    const travel = Number.isFinite(lastViewX) ? Math.hypot(x - lastViewX, n - lastViewN) : 0;
    fadeRadius += Math.max(-travel, Math.min(travel, radiusTarget - fadeRadius));
    lastViewX = x; lastViewN = n;
    fadeRange.value.z = fadeRadius * 0.78; fadeRange.value.w = fadeRadius;
    const moved = !camera || Math.hypot(x - camera.x, n - camera.n) >= REBUILD_M;
    const nextLevel = Math.max(0, Math.min(2, Math.trunc(ambientBudgetLevel)));
    // A new quality rung or an explicit camera jump is a new residency request. It must settle
    // to its own radius even if the pilot stays parked afterward. Ordinary camera motion keeps
    // the continuous radius limit above; a >96 m single-frame move is treated as a teleport.
    if (travel > REBUILD_M * 2 || (level >= 0 && nextLevel !== level)) initiallySettled = false;
    if (!moved && nextLevel === level && cursor >= queue.length) return;
    if (moved) {
      camera = { x, n };
      const bounds = plan.boundsLocalM;
      queue = [];
      for (let cx = Math.max(Math.floor(bounds.minimumEastM / CELL_M), Math.floor((x - budget.radiusM) / CELL_M));
        cx < Math.min(Math.ceil(bounds.maximumEastM / CELL_M), Math.ceil((x + budget.radiusM) / CELL_M)); cx++) {
        for (let cn = Math.max(Math.floor(bounds.minimumNorthM / CELL_M), Math.floor((n - budget.radiusM) / CELL_M));
          cn < Math.min(Math.ceil(bounds.maximumNorthM / CELL_M), Math.ceil((n + budget.radiusM) / CELL_M)); cn++) {
          queue.push({ cx, cn, distance: Math.hypot((cx + 0.5) * CELL_M - x, (cn + 0.5) * CELL_M - n) });
        }
      }
      queue.sort((a, b) => a.distance - b.distance || a.cx - b.cx || a.cn - b.cn);
      windowKeys = new Set(queue.map((cell) => `${cell.cx}:${cell.cn}`));
      cursor = 0;
    }
    level = nextLevel;
    let built = 0;
    while (cursor < queue.length && built < TILE_BUILDS_PER_FRAME) {
      const cell = queue[cursor]; const key = `${cell.cx}:${cell.cn}`;
      if (!cache.has(key)) {
        cache.set(key, planCobraCanopyCell(plan, cell.cx, cell.cn, sampleTerrain)); built++;
      }
      cursor++;
    }
    if (cache.size > cacheCapacity) {
      for (const key of cache.keys()) {
        if (!windowKeys.has(key)) cache.delete(key);
        if (cache.size <= cacheCapacity) break;
      }
    }
    const candidates = [];
    for (let i = 0; i < cursor; i++) {
      const cell = queue[i];
      for (const record of cache.get(`${cell.cx}:${cell.cn}`)) {
        const distance = Math.hypot(record.x - camera.x, record.n - camera.n);
        // Keep zero-scale neighbours resident across the complete next 48 m step; the vertex
        // shader follows the actual camera continuously while occupancy rebuilds remain bounded.
        if (distance > budget.nearM - REBUILD_M && distance < budget.radiusM + REBUILD_M) {
          candidates.push({ record, distance });
        }
      }
    }
    candidates.sort((a, b) => a.distance - b.distance || a.record.id.localeCompare(b.record.id));
    const capacity = Math.floor(budget.capacity * [1, 0.8, 0.6][level]);
    const selected = candidates.slice(0, capacity);
    const achievedRadius = candidates.length > capacity
      ? Math.min(budget.radiusM, candidates[capacity].distance) : budget.radiusM;
    radiusTarget = achievedRadius;
    if (!initiallySettled) {
      fadeRadius = achievedRadius;
      fadeRange.value.z = fadeRadius * 0.78; fadeRange.value.w = fadeRadius;
      initiallySettled = cursor >= queue.length;
    }
    let verticalBoundM = 0;
    for (let i = 0; i < selected.length; i++) {
      const { record: r } = selected[i];
      verticalBoundM = Math.max(verticalBoundM, Math.abs(r.y) + r.height
        + Math.hypot(r.eastSlope, r.northSlope) * r.radiusM);
      const w = r.width; const d = r.depth;
      const c = Math.cos(r.yaw); const s = Math.sin(r.yaw);
      const sx = r.eastSlope; const sz = -r.northSlope;
      matrix.set(c * w, 0, -s * d, r.x,
        (sx * c + sz * s) * w, r.height, (-sx * s + sz * c) * d, r.y,
        s * w, 0, c * d, -r.n,
        0, 0, 0, 1);
      mesh.setMatrixAt(i, matrix);
      tint.setRGB(r.shade, r.shade, r.shade); mesh.setColorAt(i, tint);
    }
    mesh.count = selected.length;
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    // Ground geometry must not inherit the pilot's altitude as its culling centre. The measured
    // vertical extent also covers shear on steep slopes and a first update from high overhead.
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(camera.x, 0, -camera.n),
      Math.hypot(budget.radiusM + 200, verticalBoundM));
    mesh.userData.cobraCanyonInstances = selected.map(({ record }) => record);
    snapshot = Object.freeze({ drawCalls: mesh.count ? 1 : 0, instances: mesh.count,
      triangles: mesh.count * COBRA_CANOPY_TRIANGLES, pendingCells: queue.length - cursor });
  }
  return Object.freeze({ mesh, builtMetrics, update, diagnostics: () => snapshot,
    dispose() {
      if (disposed) return;
      disposed = true; mesh.removeFromParent(); mesh.count = 0;
      mesh.dispose(); geometry.dispose(); material.dispose(); cache.clear(); queue = []; windowKeys.clear();
      snapshot = Object.freeze({ drawCalls: 0, instances: 0, triangles: 0, pendingCells: 0 });
    } });
}
