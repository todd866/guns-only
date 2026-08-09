export const WEEKEND_ROAD_NETWORK_SCHEMA = "guns-only.weekend-road-network.v1";
export const WEEKEND_OPEN_ROAD_PRESENTATION_SCHEMA =
  "guns-only.weekend-open-road-presentation.v1";
export const WEEKEND_ROADSIDE_ATLAS_URL =
  "/content/packs/weekend-ride/environment/foliage/weekend-roadside-atlas-v1.png?v=299";

const ROAD_SURFACE_SHA256 =
  "bb9a4033b80a0d7069cb987f73e0c325e10c64c9c1030b73e9b7f6a8819ec713";
const WORLD_GROUND_SHA256 =
  "bb97d9528ad773891d6a704b6d01ab6b145eff451055c827d3a6c05be51641a1";
const ROAD_CLASSES = new Set([
  "circuit-access",
  "country-lane",
  "scenic-road",
  "village-street",
]);

function finitePoint(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  const z = Number(point?.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return Object.freeze({ x, y, z });
}

function distanceM(a, b) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function tangentAt(points, index) {
  const previous = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  const x = next.x - previous.x;
  const z = next.z - previous.z;
  const length = Math.hypot(x, z);
  if (!(length > 1e-6)) throw new Error("Weekend road contains a degenerate tangent.");
  return Object.freeze({ x: x / length, z: z / length });
}

function validateRoad(rawRoad, surfaceElevationM, maximumSampleSpacingM, seenIds) {
  const id = String(rawRoad?.id ?? "");
  const roadClass = String(rawRoad?.road_class ?? "");
  const pavedWidthM = Number(rawRoad?.paved_width_m);
  const declaredLengthM = Number(rawRoad?.length_m);
  if (!id || seenIds.has(id)) throw new Error("Weekend road ids must be unique and non-empty.");
  if (!ROAD_CLASSES.has(roadClass)) throw new Error(`Unknown Weekend road class '${roadClass}'.`);
  if (!(pavedWidthM >= 3 && pavedWidthM <= 20)) {
    throw new Error(`Weekend road '${id}' has an invalid paved width.`);
  }
  const points = Array.from(rawRoad?.centreline ?? [], finitePoint).filter(Boolean);
  if (points.length < 2 || points.length > 8_192) {
    throw new Error(`Weekend road '${id}' requires a bounded sampled centreline.`);
  }
  let sampledLengthM = 0;
  for (let index = 0; index < points.length; index++) {
    if (Math.abs(points[index].y - surfaceElevationM) > 0.01) {
      throw new Error(`Weekend road '${id}' left the authoritative surface elevation.`);
    }
    if (index === 0) continue;
    const spacingM = distanceM(points[index - 1], points[index]);
    if (!(spacingM > 0.001) || spacingM > maximumSampleSpacingM * 1.025) {
      throw new Error(`Weekend road '${id}' violated its sampling contract.`);
    }
    sampledLengthM += spacingM;
  }
  const toleranceM = Math.max(0.01, declaredLengthM * 1e-6);
  if (!(declaredLengthM > 0) || Math.abs(sampledLengthM - declaredLengthM) > toleranceM) {
    throw new Error(`Weekend road '${id}' length does not match its centreline.`);
  }
  seenIds.add(id);
  return Object.freeze({ id, roadClass, pavedWidthM, lengthM: declaredLengthM, points });
}

function validateSurface(raw, expectedId, expectedSha256, expectedMetresPerTile) {
  const metresPerTile = Number(raw?.metres_per_tile);
  if (raw?.asset_id !== expectedId
      || raw?.sha256 !== expectedSha256
      || raw?.color_space !== "sRGB"
      || raw?.wrap_mode !== "mirrored-repeat"
      || raw?.min_filter !== "linear-mipmap-linear"
      || raw?.mag_filter !== "linear"
      || metresPerTile !== expectedMetresPerTile) {
    throw new Error(`Weekend surface '${expectedId}' lost its portable texture contract.`);
  }
  return Object.freeze({
    assetId: expectedId,
    packRelativeUri: String(raw.pack_relative_uri ?? ""),
    sha256: expectedSha256,
    colorSpace: raw.color_space,
    wrapMode: raw.wrap_mode,
    minFilter: raw.min_filter,
    magFilter: raw.mag_filter,
    metresPerTile,
  });
}

function validateRoadside(networkContract, surfaceElevationM) {
  const atlas = networkContract.roadside_atlas;
  if (atlas?.asset_id !== "environment.foliage.weekend-roadside-atlas.v1"
      || atlas?.pack_relative_uri !== "environment/foliage/weekend-roadside-atlas-v1.png"
      || atlas?.sha256 !== "f779abb10692e470381f0d909b61a0876dd91920fb4b86d6f71bbbc1a948abaf"
      || atlas?.color_space !== "sRGB"
      || atlas?.alpha_mode !== "cutout"
      || Number(atlas?.alpha_cutoff) !== 0.42
      || atlas?.mipmaps !== true
      || atlas?.region_origin !== "top-left"
      || atlas?.presentation_only !== true) {
    throw new Error("Weekend roadside atlas lost its renderer-neutral import contract.");
  }
  const expectedRegions = [
    ["eucalyptus", 0, 0, 0.5, 0.5],
    ["dry-grass", 0.5, 0, 0.5, 0.5],
    ["sandstone", 0.5, 0.5, 0.5, 0.5],
    ["scrub", 0, 0.5, 0.5, 0.5],
  ];
  const regions = new Map();
  for (const [index, expected] of expectedRegions.entries()) {
    const region = atlas.regions?.[index];
    const actual = [
      region?.id,
      Number(region?.u_min),
      Number(region?.v_min_from_top),
      Number(region?.u_size),
      Number(region?.v_size),
    ];
    if (actual.some((value, field) => value !== expected[field])
        || !(Number(region?.base_width_m) > 0)
        || !(Number(region?.base_height_m) > 0)) {
      throw new Error("Weekend roadside atlas region ordering or scale changed.");
    }
    regions.set(region.id, Object.freeze({
      id: region.id,
      uMin: actual[1],
      vMinFromTop: actual[2],
      uSize: actual[3],
      vSize: actual[4],
    }));
  }
  if (atlas.regions?.length !== expectedRegions.length) {
    throw new Error("Weekend roadside atlas must retain exactly four regions.");
  }

  const seen = new Set();
  const instances = Object.freeze(Array.from(
    networkContract.roadside_instances ?? [],
    (raw) => {
      const id = String(raw?.id ?? "");
      const region = regions.get(String(raw?.region_id ?? ""));
      const position = finitePoint(raw?.position);
      const headingRad = Number(raw?.heading_rad);
      const widthM = Number(raw?.width_m);
      const heightM = Number(raw?.height_m);
      if (!id || seen.has(id) || !region || !position
          || Math.abs(position.y - surfaceElevationM) > 0.01
          || !Number.isFinite(headingRad)
          || !(widthM >= 2 && widthM <= 30)
          || !(heightM >= 2 && heightM <= 25)) {
        throw new Error("Weekend roadside instance lost its portable placement contract.");
      }
      seen.add(id);
      return Object.freeze({ id, region, position, headingRad, widthM, heightM });
    },
  ));
  if (instances.length < 80 || instances.length > 512) {
    throw new Error("Weekend roadside population must remain bounded and scenic.");
  }
  return Object.freeze({ alphaCutoff: 0.42, regions, instances });
}

export function planWeekendOpenRoad(networkContract) {
  if (networkContract?.schema !== WEEKEND_ROAD_NETWORK_SCHEMA
      || networkContract?.route_kind !== "connected-road-network") {
    throw new Error("Weekend open road requires the versioned connected road-network contract.");
  }
  const surfaceElevationM = Number(networkContract.surface_elevation_m);
  const maximumSampleSpacingM = Number(networkContract.maximum_sample_spacing_m);
  if (!Number.isFinite(surfaceElevationM)
      || !(maximumSampleSpacingM > 0 && maximumSampleSpacingM <= 25)) {
    throw new Error("Weekend open road requires finite surface and sampling semantics.");
  }
  const geometry = networkContract.geometry;
  const roadLiftM = Number(geometry?.road_lift_m);
  const junctionRadialSegments = Number(geometry?.junction_radial_segments);
  if (geometry?.coordinate_system !== "left-handed-east-up-north-metres"
      || geometry?.road_footprint !== "sampled-centreline-ribbon-with-junction-discs"
      || geometry?.road_u_axis !== "distance-along-centreline-metres"
      || geometry?.road_v_axis !== "right-to-left-across-road-metres"
      || geometry?.junction_uv_axes !== "world-east-north-metres"
      || roadLiftM !== 0.065
      || junctionRadialSegments !== 24) {
    throw new Error("Weekend open road lost its portable axis/geometry contract.");
  }
  const roadSurface = validateSurface(
    networkContract.road_surface,
    "environment.texture.weekend-track-asphalt.v1",
    ROAD_SURFACE_SHA256,
    12,
  );
  const worldGroundSurface = validateSurface(
    networkContract.world_ground_surface,
    "environment.texture.weekend-hinterland-ground.v1",
    WORLD_GROUND_SHA256,
    160,
  );
  const roadside = validateRoadside(networkContract, surfaceElevationM);

  const seenIds = new Set();
  const roads = Array.from(networkContract.roads ?? [], (road) =>
    validateRoad(road, surfaceElevationM, maximumSampleSpacingM, seenIds));
  if (roads.length < 5 || roads.length > 64) {
    throw new Error("Weekend open road requires a bounded connected road set.");
  }
  const primaryRouteRoadIds = Object.freeze(
    Array.from(networkContract.primary_route_road_ids ?? [], String));
  if (primaryRouteRoadIds.length < 3
      || primaryRouteRoadIds.some((id) => !seenIds.has(id))) {
    throw new Error("Weekend open road primary route references unknown roads.");
  }
  const primaryRouteLengthM = Number(networkContract.primary_route_length_m);
  if (!(primaryRouteLengthM >= 12_000)) {
    throw new Error("Weekend scenic loop must remain at least 12 km.");
  }

  const junctions = Object.freeze(Array.from(networkContract.junctions ?? [], (raw) => {
    const center = finitePoint(raw?.center);
    const pavedRadiusM = Number(raw?.paved_radius_m);
    const roadIds = Object.freeze(Array.from(raw?.road_ids ?? [], String));
    if (!center || Math.abs(center.y - surfaceElevationM) > 0.01
        || !(pavedRadiusM > 0 && pavedRadiusM <= 12)
        || roadIds.length < 1
        || roadIds.some((id) => !seenIds.has(id))) {
      throw new Error("Weekend road junction is not coherent with the road graph.");
    }
    return Object.freeze({ id: String(raw.id ?? ""), center, pavedRadiusM, roadIds });
  }));
  if (junctions.length < 2) throw new Error("Weekend open road requires graph endpoints.");

  const circuitAccessPoint = finitePoint(networkContract.circuit_access_point);
  const boundsMin = finitePoint(networkContract.bounds_min);
  const boundsMax = finitePoint(networkContract.bounds_max);
  if (!circuitAccessPoint || !boundsMin || !boundsMax
      || boundsMin.x >= boundsMax.x || boundsMin.z >= boundsMax.z) {
    throw new Error("Weekend open road requires coherent access and world bounds.");
  }
  return Object.freeze({
    schema: WEEKEND_OPEN_ROAD_PRESENTATION_SCHEMA,
    networkId: String(networkContract.id ?? ""),
    surfaceElevationM,
    maximumSampleSpacingM,
    circuitAccessPoint,
    bounds: Object.freeze({ minimum: boundsMin, maximum: boundsMax }),
    primaryRouteId: String(networkContract.primary_route_id ?? ""),
    primaryRouteLengthM,
    primaryRouteRoadIds,
    geometry: Object.freeze({ roadLiftM, junctionRadialSegments }),
    roadSurface,
    worldGroundSurface,
    roadside,
    roads: Object.freeze(roads),
    junctions,
  });
}

function buildRoadsideGeometry(THREE, plan) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (const [index, instance] of plan.roadside.instances.entries()) {
    const { position, headingRad, widthM, heightM, region } = instance;
    const rightEast = Math.cos(headingRad);
    const rightNorth = -Math.sin(headingRad);
    const normalEast = Math.sin(headingRad);
    const normalNorth = Math.cos(headingRad);
    const halfWidthM = widthM * 0.5;
    const left = {
      x: position.x - rightEast * halfWidthM,
      z: position.z - rightNorth * halfWidthM,
    };
    const right = {
      x: position.x + rightEast * halfWidthM,
      z: position.z + rightNorth * halfWidthM,
    };
    positions.push(
      left.x, position.y + 0.035, -left.z,
      right.x, position.y + 0.035, -right.z,
      right.x, position.y + heightM, -right.z,
      left.x, position.y + heightM, -left.z,
    );
    for (let vertex = 0; vertex < 4; vertex++) {
      normals.push(normalEast, 0, -normalNorth);
    }
    const u0 = region.uMin;
    const u1 = region.uMin + region.uSize;
    // flipY=false makes Three consume the contract's authored top-left/v-down atlas coordinates
    // directly: the physical card bottom takes vMax and the physical top takes vMin.
    const vBottom = region.vMinFromTop + region.vSize;
    const vTop = region.vMinFromTop;
    uvs.push(u0, vBottom, u1, vBottom, u1, vTop, u0, vTop);
    const base = index * 4;
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function buildRoadGeometry(THREE, plan) {
  const positions = [];
  const uvs = [];
  const indices = [];
  let vertex = 0;
  for (const road of plan.roads) {
    let distanceAlongM = 0;
    for (let index = 0; index < road.points.length; index++) {
      if (index > 0) distanceAlongM += distanceM(road.points[index - 1], road.points[index]);
      const point = road.points[index];
      const tangent = tangentAt(road.points, index);
      const normal = { x: -tangent.z, z: tangent.x };
      for (const side of [-1, 1]) {
        positions.push(
          point.x + normal.x * road.pavedWidthM * 0.5 * side,
          point.y + plan.geometry.roadLiftM,
          -(point.z + normal.z * road.pavedWidthM * 0.5 * side),
        );
        uvs.push(
          distanceAlongM / plan.roadSurface.metresPerTile,
          side * road.pavedWidthM * 0.5 / plan.roadSurface.metresPerTile,
        );
      }
      if (index < road.points.length - 1) {
        indices.push(vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3);
      }
      vertex += 2;
    }
  }

  // Authority queries use distance to finite segments, which gives every road endpoint a round
  // cap. Exported junction discs render that exact footprint and close angular gaps at branches.
  for (const junction of plan.junctions) {
    const centerVertex = vertex++;
    positions.push(
      junction.center.x,
      junction.center.y + plan.geometry.roadLiftM,
      -junction.center.z,
    );
    uvs.push(
      junction.center.x / plan.roadSurface.metresPerTile,
      junction.center.z / plan.roadSurface.metresPerTile,
    );
    for (let segment = 0; segment < plan.geometry.junctionRadialSegments; segment++) {
      const angle = segment / plan.geometry.junctionRadialSegments * Math.PI * 2;
      const x = junction.center.x + Math.cos(angle) * junction.pavedRadiusM;
      const z = junction.center.z + Math.sin(angle) * junction.pavedRadiusM;
      positions.push(x, junction.center.y + plan.geometry.roadLiftM, -z);
      uvs.push(
        x / plan.roadSurface.metresPerTile,
        z / plan.roadSurface.metresPerTile,
      );
      vertex++;
    }
    const firstRingVertex = centerVertex + 1;
    for (let segment = 0; segment < plan.geometry.junctionRadialSegments; segment++) {
      const current = firstRingVertex + segment;
      const next = firstRingVertex
        + ((segment + 1) % plan.geometry.junctionRadialSegments);
      indices.push(centerVertex, current, next);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createWeekendOpenRoadPresentation(THREE, networkContract, options = {}) {
  const plan = planWeekendOpenRoad(networkContract);
  const surfaceTexture = options.surfaceTexture?.isTexture ? options.surfaceTexture : null;
  const roadsideAtlas = options.roadsideAtlas?.isTexture ? options.roadsideAtlas : null;
  if (!roadsideAtlas) {
    throw new Error("Weekend open road requires the canonical roadside atlas texture.");
  }
  if (surfaceTexture) {
    surfaceTexture.colorSpace = THREE.SRGBColorSpace;
    surfaceTexture.wrapS = THREE.MirroredRepeatWrapping;
    surfaceTexture.wrapT = THREE.MirroredRepeatWrapping;
    surfaceTexture.minFilter = THREE.LinearMipmapLinearFilter;
    surfaceTexture.magFilter = THREE.LinearFilter;
    surfaceTexture.needsUpdate = true;
  }
  const material = new THREE.MeshStandardMaterial({
    color: surfaceTexture ? 0xffffff : 0x303735,
    map: surfaceTexture,
    roughness: 0.93,
    metalness: 0.01,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -1,
  });
  const surface = new THREE.Mesh(buildRoadGeometry(THREE, plan), material);
  surface.name = "weekend-open-road-asphalt";
  surface.receiveShadow = true;
  const root = new THREE.Group();
  root.name = "weekend-open-road-network";
  root.add(surface);

  roadsideAtlas.name = "TEX_WEEKEND_ROADSIDE_ATLAS_V1";
  roadsideAtlas.colorSpace = THREE.SRGBColorSpace;
  roadsideAtlas.flipY = false;
  roadsideAtlas.wrapS = THREE.ClampToEdgeWrapping;
  roadsideAtlas.wrapT = THREE.ClampToEdgeWrapping;
  roadsideAtlas.generateMipmaps = true;
  roadsideAtlas.minFilter = THREE.LinearMipmapLinearFilter;
  roadsideAtlas.magFilter = THREE.LinearFilter;
  roadsideAtlas.needsUpdate = true;
  const roadsideMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: roadsideAtlas,
    roughness: 0.95,
    metalness: 0,
    alphaTest: plan.roadside.alphaCutoff,
    transparent: false,
    side: THREE.DoubleSide,
  });
  const roadside = new THREE.Mesh(buildRoadsideGeometry(THREE, plan), roadsideMaterial);
  roadside.name = "weekend-open-road-roadside";
  roadside.castShadow = false;
  roadside.receiveShadow = true;
  root.add(roadside);

  return Object.freeze({
    object3d: root,
    plan,
    dispose() {
      surface.geometry.dispose();
      material.dispose();
      roadside.geometry.dispose();
      roadsideMaterial.dispose();
    },
  });
}
