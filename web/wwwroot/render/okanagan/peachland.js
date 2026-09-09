import * as THREE from "../../vendor/three.module.js";

/** Geographic footprints are measured. Materials, roof forms and road widths are surrogates. */
export function createPeachland(data, toWorld, sampleHeight, quality = "desktop") {
  const group = new THREE.Group();
  const name = data?.name ?? "Peachland";
  group.name = `${name} — mapped buildings and streets`;
  if (!data) return group;
  const walls = [], roofs = [], roadSurface = [];
  const wallColors = [], roofColors = [];
  const wallColor = new THREE.Color(), roofColor = new THREE.Color();
  const triangle = (target, a, b, c, colors, color) => {
    target.push(...a, ...b, ...c);
    if (colors) for (let i = 0; i < 3; i += 1) colors.push(color.r, color.g, color.b);
  };
  for (const building of data.buildings) {
    if (quality === "mobile" && building.kind === "Outbuilding") continue;
    wallColor.setHex((data.id === "silverstar" ? [0x9b5142, 0x526e79, 0xc3a360, 0x789072] : [0xbab2a2, 0xb3a393, 0xc5bdaa, 0xa89d8e])[building.id % 4]);
    roofColor.setHex([0x655e54, 0x5d6060, 0x756d60, 0x8b7c69][building.id % 4]);
    for (const polygon of building.polygons) {
      const rings = polygon.map((ring) => ring.slice(0, -1).map(([lon, lat]) => {
        const p = toWorld(lat, lon);
        return new THREE.Vector2(p.x, p.z);
      }));
      const vertices = rings.flat();
      const elevations = vertices.map((v) => sampleHeight(v.x, v.y));
      const centreElevation = elevations.reduce((a, b) => a + b, 0) / elevations.length;
      const bottom = Math.min(...elevations) - 0.5;
      const top = Math.max(centreElevation + building.heightM, Math.max(...elevations) + 1);
      const roof = THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1));
      for (const [a, b, c] of roof) {
        triangle(roofs, [vertices[c].x, top, vertices[c].y], [vertices[b].x, top, vertices[b].y],
          [vertices[a].x, top, vertices[a].y], roofColors, roofColor);
      }
      for (const ring of rings) for (let i = 0; i < ring.length; i += 1) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        triangle(walls, [a.x, bottom, a.y], [b.x, bottom, b.y], [b.x, top, b.y], wallColors, wallColor);
        triangle(walls, [a.x, bottom, a.y], [b.x, top, b.y], [a.x, top, a.y], wallColors, wallColor);
      }
    }
  }
  const buildingMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92,
    side: THREE.DoubleSide });
  const wallMesh = mesh(walls, buildingMaterial, wallColors);
  const roofMesh = mesh(roofs, buildingMaterial, roofColors);
  wallMesh.name = `${name} building footprints`;
  roofMesh.name = `${name} roofs — approximate forms`;
  wallMesh.castShadow = roofMesh.castShadow = quality === "desktop";
  group.add(wallMesh, roofMesh);
  for (const road of data.roads) for (const path of road.paths) {
    const controls = path.map(([lon, lat]) => toWorld(lat, lon));
    const points = [];
    for (let i = 1; i < controls.length; i += 1) {
      const steps = Math.max(1, Math.ceil(controls[i - 1].distanceTo(controls[i]) / 12));
      for (let s = i === 1 ? 0 : 1; s <= steps; s += 1)
        points.push(controls[i - 1].clone().lerp(controls[i], s / steps));
    }
    const sides = points.map((p, i) => {
      const direction = points[Math.min(points.length - 1, i + 1)].clone()
        .sub(points[Math.max(0, i - 1)]).normalize();
      const across = new THREE.Vector3(direction.z, 0, -direction.x);
      return [-1, 1].map((side) => {
        const v = p.clone().addScaledVector(across, road.widthM / 2 * side);
        return [v.x, sampleHeight(v.x, v.z) + 0.35, v.z];
      });
    });
    for (let i = 1; i < sides.length; i += 1) {
      triangle(roadSurface, sides[i - 1][0], sides[i][0], sides[i - 1][1]);
      triangle(roadSurface, sides[i - 1][1], sides[i][0], sides[i][1]);
    }
  }
  const roads = mesh(roadSurface, new THREE.MeshStandardMaterial({ color: 0x666762, roughness: 1,
    side: THREE.DoubleSide }));
  roads.name = `${name} mapped road centrelines`;
  group.add(roads);
  return group;
}

function mesh(positions, material, colors) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (colors) geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const result = new THREE.Mesh(geometry, material);
  result.receiveShadow = true;
  return result;
}

export function withinPeachland(data, latitude, longitude) {
  const b = data?.bounds;
  return Boolean(b && latitude >= b.south && latitude <= b.north && longitude >= b.west && longitude <= b.east);
}

/** Small spatial buckets keep thousands of footprint/road exclusions out of the forest loop. */
export function createPeachlandExclusion(data, toWorld) {
  const buckets = new Map();
  const size = 100;
  const add = (x0, z0, x1, z1, feature) => {
    for (let x = Math.floor(x0 / size); x <= Math.floor(x1 / size); x += 1)
      for (let z = Math.floor(z0 / size); z <= Math.floor(z1 / size); z += 1) {
        const key = `${x},${z}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(feature);
      }
  };
  for (const building of data?.buildings ?? []) for (const polygon of building.polygons) {
    const ring = polygon[0].map(([lon, lat]) => toWorld(lat, lon));
    const x0 = Math.min(...ring.map((p) => p.x)) - 6, x1 = Math.max(...ring.map((p) => p.x)) + 6;
    const z0 = Math.min(...ring.map((p) => p.z)) - 6, z1 = Math.max(...ring.map((p) => p.z)) + 6;
    add(x0, z0, x1, z1, (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
  }
  for (const road of data?.roads ?? []) for (const path of road.paths) {
    const points = path.map(([lon, lat]) => toWorld(lat, lon));
    const margin = road.widthM / 2 + 5;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1], b = points[i];
      const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
      add(Math.min(a.x, b.x) - margin, Math.min(a.z, b.z) - margin,
        Math.max(a.x, b.x) + margin, Math.max(a.z, b.z) + margin, (x, z) => {
          const t = length2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / length2)) : 0;
          return (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2 <= margin * margin;
        });
    }
  }
  return (x, z) => (buckets.get(`${Math.floor(x / size)},${Math.floor(z / size)}`) ?? [])
    .some((contains) => contains(x, z));
}
