import * as THREE from "../../vendor/three.module.js";

export const OKANAGAN_NEAR_FOREST_TIERS = Object.freeze({
  mobile: Object.freeze({ radiusCells: 2, treesPerCell: 18 }),
  balanced: Object.freeze({ radiusCells: 3, treesPerCell: 28 }),
  desktop: Object.freeze({ radiusCells: 3, treesPerCell: 42 }),
});
const CELL_M = 360;

// Integer hashing keeps placement independent of camera motion, quality tier and JS sin precision.
function hash(x, z, index, salt = 0) {
  let value = Math.imul(x, 73856093) ^ Math.imul(z, 19349663) ^ Math.imul(index + salt, 83492791);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/** Surrogate vegetation, not surveyed individual trees. Every tier shares the same candidates. */
export function okanaganNearForestCandidates(cellX, cellZ, count) {
  return Array.from({ length: count }, (_, i) => ({
    x: (cellX + 0.06 + hash(cellX, cellZ, i, 1) * 0.88) * CELL_M,
    z: (cellZ + 0.06 + hash(cellX, cellZ, i, 17) * 0.88) * CELL_M,
    size: 0.7 + hash(cellX, cellZ, i, 31) * 0.8,
    rotation: hash(cellX, cellZ, i, 47) * Math.PI * 2,
    choice: hash(cellX, cellZ, i, 59),
  }));
}

function coniferGeometry() {
  const positions = [];
  // Overlapping bough tiers provide a tree silhouette instead of a single geometric cone.
  for (const [radius, height, base] of [[4.6, 9, 3], [3.7, 9, 7], [2.6, 8, 11]]) {
    const part = new THREE.ConeGeometry(radius, height, 6, 1, true).toNonIndexed();
    part.translate(0, base + height / 2, 0);
    positions.push(...part.attributes.position.array);
    part.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function forestMaterial(color, uniforms, key) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 1 });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `varying vec3 vForestPosition;\n${shader.vertexShader}`
      .replace("#include <worldpos_vertex>", `#include <worldpos_vertex>
        vForestPosition = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = `varying vec3 vForestPosition; uniform vec3 forestViewer; uniform float forestFar;\n${shader.fragmentShader}`
      .replace("#include <alphatest_fragment>", `#include <alphatest_fragment>
        float fade = smoothstep(forestFar * 0.70, forestFar, distance(vForestPosition.xz, forestViewer.xz));
        float stipple = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        if (stipple < fade) discard;`);
  };
  material.customProgramCacheKey = () => `okanagan-near-forest-v1-${key}`;
  return material;
}

/** Two instanced draws, at most 49 resident cells, rebuilding only after crossing a 360 m cell.
 * Positions are sampled once per resident cell. Exclusions are supplied by the existing world.
 * Reflected render roots are supported: viewer is transformed into world-root local coordinates. */
export function createOkanaganNearForest({ quality = "desktop", sampleHeight, accepts, density }) {
  const tier = OKANAGAN_NEAR_FOREST_TIERS[quality] ?? OKANAGAN_NEAR_FOREST_TIERS.desktop;
  const capacity = (tier.radiusCells * 2 + 1) ** 2 * tier.treesPerCell;
  const group = new THREE.Group();
  group.name = "nearby-stable-okanagan-conifers";
  const uniforms = { forestViewer: { value: new THREE.Vector3() }, forestFar: { value: tier.radiusCells * CELL_M } };
  const trunkGeometry = new THREE.CylinderGeometry(0.27, 0.45, 7, 5).translate(0, 3.0, 0);
  const crowns = new THREE.InstancedMesh(coniferGeometry(), forestMaterial(0xffffff, uniforms, "crown"), capacity);
  const trunks = new THREE.InstancedMesh(trunkGeometry, forestMaterial(0x72604b, uniforms, "trunk"), capacity);
  crowns.name = "nearby-conifer-crowns";
  trunks.name = "nearby-conifer-trunks";
  crowns.count = trunks.count = 0;
  crowns.receiveShadow = trunks.receiveShadow = true;
  crowns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  trunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(trunks, crowns);
  const cells = new Map();
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  let centreX = NaN, centreZ = NaN, rebuilds = 0, tested = 0;
  return {
    group,
    update(position) {
      if (!Number.isFinite(position?.x) || !Number.isFinite(position?.z)) return;
      // Positions passed by the mission are geographic-world coordinates, before root reflection.
      group.updateWorldMatrix(true, false);
      uniforms.forestViewer.value.copy(position).applyMatrix4(group.matrixWorld);
      const cx = Math.floor(position.x / CELL_M), cz = Math.floor(position.z / CELL_M);
      if (cx === centreX && cz === centreZ) return;
      centreX = cx; centreZ = cz; rebuilds++;
      const resident = new Set();
      let count = 0;
      for (let z = cz - tier.radiusCells; z <= cz + tier.radiusCells; z++) {
        for (let x = cx - tier.radiusCells; x <= cx + tier.radiusCells; x++) {
          const key = `${x}:${z}`;
          resident.add(key);
          if (!cells.has(key)) {
            const accepted = [];
            for (const point of okanaganNearForestCandidates(x, z, tier.treesPerCell)) {
              tested++;
              if (!accepts(point.x, point.z)) continue;
              const y = sampleHeight(point.x, point.z);
              if (!Number.isFinite(y) || y < 355 || y > 2150 || point.choice > density(point.x, point.z, y)) continue;
              const slope = Math.hypot(sampleHeight(point.x + 15, point.z) - sampleHeight(point.x - 15, point.z),
                sampleHeight(point.x, point.z + 15) - sampleHeight(point.x, point.z - 15)) / 30;
              if (slope > 0.78) continue;
              accepted.push({ ...point, y });
            }
            cells.set(key, accepted);
          }
          for (const point of cells.get(key)) {
            dummy.position.set(point.x, point.y, point.z);
            dummy.rotation.y = point.rotation;
            dummy.scale.setScalar(point.size);
            dummy.updateMatrix();
            crowns.setMatrixAt(count, dummy.matrix); trunks.setMatrixAt(count, dummy.matrix);
            color.setHex(point.y < 900 ? 0x68714b : 0x4e644b).multiplyScalar(0.90 + point.choice * 0.2);
            crowns.setColorAt(count, color);
            count++;
          }
        }
      }
      for (const key of cells.keys()) if (!resident.has(key)) cells.delete(key);
      crowns.count = trunks.count = count;
      crowns.instanceMatrix.needsUpdate = trunks.instanceMatrix.needsUpdate = true;
      if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
      crowns.computeBoundingSphere(); trunks.computeBoundingSphere();
    },
    diagnostics() { return { capacity, trees: crowns.count, residentCells: cells.size, rebuilds, candidatesTested: tested, cellSizeM: CELL_M, drawCalls: 2 }; },
  };
}

const DIGITS = {
  1: ["010", "110", "010", "010", "111"],
  3: ["111", "001", "111", "001", "111"],
  4: ["101", "101", "111", "001", "001"],
  6: ["111", "100", "111", "101", "111"],
};

/** Paint is geometry on the existing authored airport, never a new geographic landmark. */
export function createOkanaganAirportDetails({ centre, along, across, runwayLength, surfaceY, terminalRoofY = surfaceY + 12.87 }) {
  const group = new THREE.Group();
  group.name = "Kelowna airport surface orientation details";
  const positions = { white: [], yellow: [], asphalt: [], roof: [], glass: [] };
  function rect(kind, acrossOffset, alongOffset, width, length, y = surfaceY) {
    const base = positions[kind].length / 3;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) =>
      centre.clone().addScaledVector(across, acrossOffset + x * width / 2)
        .addScaledVector(along, alongOffset + z * length / 2).setY(y));
    for (const index of [0, 2, 1, 0, 3, 2]) positions[kind].push(...corners[index].toArray());
    return base;
  }
  for (const end of [-1, 1]) {
    // At the north end the reader looks down the 16 direction; opposite end reads 34.
    const digits = end < 0 ? "16" : "34";
    for (let digit = 0; digit < 2; digit++) {
      DIGITS[digits[digit]].forEach((row, r) => [...row].forEach((cell, c) => {
        if (cell === "1") rect("white", (digit * 4 + c - 3) * 3.2 * -end,
          end * (runwayLength / 2 - 160) + (2 - r) * 5.2 * -end, 3.25, 5.25);
      }));
    }
    for (const side of [-1, 1]) {
      rect("white", side * 16, end * (runwayLength / 2 - 305), 6.4, 45);
      for (let i = 0; i < 2; i++) rect("white", side * (13 + i * 4), end * (runwayLength / 2 - 450), 2.3, 23);
    }
  }
  // Link only the existing parallel taxiway/apron surfaces. Geometry is an airport surrogate.
  rect("yellow", -104, 0, 0.65, runwayLength - 250, surfaceY + 0.05);
  for (const offset of [-850, -250, 420, 850]) {
    rect("asphalt", -68, offset, 85, 23, surfaceY - 0.2);
    rect("yellow", -68, offset, 82, 0.7, surfaceY + 0.06);
    rect("yellow", -44, offset, 1, 19, surfaceY + 0.07);
  }
  rect("roof", -385, 90, 64, 252, terminalRoofY);
  // Roof bays articulate the already-present terminal box without changing its footprint.
  for (let i = -2; i <= 2; i++) rect("glass", -385, 90 + i * 44, 38, 15, terminalRoofY + 0.015);
  const colors = { white: 0xebe9df, yellow: 0xe4be54, asphalt: 0x565a59, roof: 0xa7a9a3, glass: 0x55737c };
  for (const [kind, vertices] of Object.entries(positions)) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    const material = kind === "white" || kind === "yellow"
      ? new THREE.MeshBasicMaterial({ color: colors[kind] })
      : new THREE.MeshStandardMaterial({ color: colors[kind], roughness: kind === "glass" ? 0.3 : 0.94 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `airport-${kind}-details`;
    group.add(mesh);
  }
  return group;
}

export function animateOkanaganWater(material) {
  const time = { value: 0 };
  material.onBeforeCompile = shader => {
    shader.uniforms.lakeTime = time;
    shader.vertexShader = `varying vec2 vLakeXZ;\n${shader.vertexShader}`
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLakeXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = `varying vec2 vLakeXZ; uniform float lakeTime;\n${shader.fragmentShader}`
      .replace("#include <color_fragment>", `#include <color_fragment>
        float broad = sin(vLakeXZ.x * 0.0007 + sin(vLakeXZ.y * 0.0005)) * 0.025;
        diffuseColor.rgb *= 1.0 + broad;`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        vec2 wave = vec2(cos(dot(vLakeXZ, vec2(0.17, 0.10)) + lakeTime * 0.9),
          sin(dot(vLakeXZ, vec2(-0.12, 0.23)) + lakeTime * 1.15));
        normal = normalize(normal + mat3(viewMatrix) * vec3(wave.x * 0.045, 0.0, wave.y * 0.045));`);
  };
  material.customProgramCacheKey = () => "okanagan-lake-surface-ripples-v1";
  return { update(seconds) { if (Number.isFinite(seconds)) time.value = seconds; }, diagnostics() { return { animated: true, timeSeconds: time.value, vertexDisplacement: false }; } };
}
