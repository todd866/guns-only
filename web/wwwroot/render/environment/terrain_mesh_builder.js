// Terrain chunk meshing, expressed as pure array maths with NO dependency on THREE, the DOM, or
// any renderer object.
//
// WHY THIS FILE EXISTS: building one LOD0 chunk measured ~9.5 ms — 57% of a whole 60 fps frame —
// and it ran synchronously on the browser's main thread. Production telemetry from a Build 112
// sortie caught the consequence directly: `geometries` climbed 88 -> 126 inside a single five
// second window and frame_ms_max hit 217-400 ms, while triangles and draw calls stayed flat
// (2.98M / 78 in an 11 fps window versus 2.91M / 72 in a 60 fps one). The renderer was never the
// problem; the meshing was, and no amount of shedding pixels or shadows could touch it.
//
// Splitting the arithmetic out from the THREE object graph is what makes it movable: a Worker can
// run every loop below and post the finished typed arrays back, leaving the main thread only the
// O(1) job of wrapping them in BufferAttributes. Keep this file free of THREE — the moment it
// imports the renderer it stops being loadable in a worker and the stall comes back.

/// Radius of the neighbourhood the baked concavity term compares each sample against.
export const TERRAIN_CONCAVITY_RADIUS_M = 300;
/// Relief that saturates the baked concavity term.
export const TERRAIN_CONCAVITY_RELIEF_M = 120;
/// Broad painted land-cover masses. This survives coarse theatre LODs without becoming a grid.
export const TERRAIN_LANDCOVER_MACRO_CELL_M = 1_800;
/// Close breakup for meadow/scrub colour. LOD interpolation naturally removes it with distance.
export const TERRAIN_LANDCOVER_MESO_CELL_M = 360;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function smoothUnit(value) {
  return value * value * (3 - 2 * value);
}

function clampUnit(value) {
  return Math.min(1, Math.max(0, value));
}

function fraction(value) {
  return value - Math.floor(value);
}

function latticeHash(east, north, seed) {
  let hash = Math.imul(east, 0x1f12_3bb5)
    ^ Math.imul(north, 0x5f35_6495)
    ^ seed;
  hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b_3c6d);
  hash = Math.imul(hash ^ (hash >>> 12), 0x297a_2d39);
  return ((hash ^ (hash >>> 15)) >>> 0) / 0xffff_ffff;
}

function valueNoise1d(positionM, cellM, seed, axisSalt) {
  const position = positionM / cellM;
  const cell = Math.floor(position);
  const blend = smoothUnit(position - cell);
  const start = latticeHash(cell, axisSalt, seed);
  const end = latticeHash(cell + 1, axisSalt, seed);
  return start + (end - start) * blend;
}

/// Precompute four seamless one-dimensional fields along the regular heightfield axes. Combining
/// them non-linearly gives soft 2D masses, but the per-vertex loop performs only array reads and
/// arithmetic. That matters for Worker-less fallback browsers: a 257² chunk should not pay eight
/// integer hashes and two floor/divide pairs at every vertex.
function createLandcoverAxes(boundsLocalM, sampleCount) {
  const [minimumEast, minimumNorth, maximumEast, maximumNorth] = boundsLocalM;
  const spacingEast = (maximumEast - minimumEast) / (sampleCount - 1);
  const spacingNorth = (maximumNorth - minimumNorth) / (sampleCount - 1);
  const macroEast = new Float32Array(sampleCount);
  const macroNorth = new Float32Array(sampleCount);
  const mesoEast = new Float32Array(sampleCount);
  const mesoNorth = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index++) {
    const eastM = minimumEast + index * spacingEast;
    const northM = minimumNorth + index * spacingNorth;
    macroEast[index] = valueNoise1d(
      eastM,
      TERRAIN_LANDCOVER_MACRO_CELL_M,
      0x51a7_2d39,
      0x19b5,
    );
    macroNorth[index] = valueNoise1d(
      northM,
      TERRAIN_LANDCOVER_MACRO_CELL_M * 1.17,
      0x51a7_2d39,
      0x63d1,
    );
    mesoEast[index] = valueNoise1d(
      eastM,
      TERRAIN_LANDCOVER_MESO_CELL_M,
      0x2e6d_8b17,
      0x37a9,
    );
    mesoNorth[index] = valueNoise1d(
      northM,
      TERRAIN_LANDCOVER_MESO_CELL_M * 1.31,
      0x2e6d_8b17,
      0x71c3,
    );
  }
  return { macroEast, macroNorth, mesoEast, mesoNorth };
}

/// Water samples arrive as a sentinel rather than a height, so they carry no elevation of their
/// own. Flood the neighbouring bank height inwards so a lake surface sits at its shoreline instead
/// of at zero — a hole punched through the terrain.
export function reconstructWaterHeights(decoded, maximumBankDistanceSamples = 8) {
  const { heights, water, sampleCount } = decoded;
  const reconstructed = heights.slice();
  const resolved = new Uint8Array(water.length);
  for (let index = 0; index < water.length; index++) resolved[index] = water[index] ? 0 : 1;
  const maximumPasses = Math.max(0, Math.round(finite(maximumBankDistanceSamples, 8)));
  for (let pass = 0; pass < maximumPasses; pass++) {
    const updates = [];
    for (let north = 0; north < sampleCount; north++) {
      for (let east = 0; east < sampleCount; east++) {
        const index = north * sampleCount + east;
        if (!water[index] || resolved[index]) continue;
        let bankHeight = Number.POSITIVE_INFINITY;
        for (let northOffset = -1; northOffset <= 1; northOffset++) {
          const adjacentNorth = north + northOffset;
          if (adjacentNorth < 0 || adjacentNorth >= sampleCount) continue;
          for (let eastOffset = -1; eastOffset <= 1; eastOffset++) {
            if (eastOffset === 0 && northOffset === 0) continue;
            const adjacentEast = east + eastOffset;
            if (adjacentEast < 0 || adjacentEast >= sampleCount) continue;
            const adjacent = adjacentNorth * sampleCount + adjacentEast;
            if (resolved[adjacent]) {
              bankHeight = Math.min(bankHeight, reconstructed[adjacent]);
            }
          }
        }
        if (Number.isFinite(bankHeight)) updates.push({ index, bankHeight });
      }
    }
    if (!updates.length) break;
    for (const update of updates) {
      reconstructed[update.index] = update.bankHeight;
      resolved[update.index] = 1;
    }
  }
  return reconstructed;
}

/// Exact central-difference normals for a regular heightfield, written straight into `normals`.
/// This exists instead of computeVertexNormals() because the grid has an analytic answer and the
/// general-purpose accumulation would also sweep the duplicated skirt walls.
function writeHeightfieldNormals(normals, heights, water, sampleCount,
  spacingEast, spacingNorth) {
  for (let north = 0; north < sampleCount; north++) {
    const south = Math.max(0, north - 1);
    const northNeighbour = Math.min(sampleCount - 1, north + 1);
    for (let east = 0; east < sampleCount; east++) {
      const index = north * sampleCount + east;
      const offset = index * 3;
      if (water[index]) {
        normals[offset + 1] = 1;
        continue;
      }
      const west = Math.max(0, east - 1);
      const eastNeighbour = Math.min(sampleCount - 1, east + 1);
      const eastSlope = (
        heights[north * sampleCount + eastNeighbour]
        - heights[north * sampleCount + west]
      ) / Math.max(spacingEast, (eastNeighbour - west) * spacingEast);
      const northSlope = (
        heights[northNeighbour * sampleCount + east]
        - heights[south * sampleCount + east]
      ) / Math.max(spacingNorth, (northNeighbour - south) * spacingNorth);
      const length = Math.hypot(eastSlope, 1, northSlope);
      normals[offset] = -eastSlope / length;
      normals[offset + 1] = 1 / length;
      normals[offset + 2] = northSlope / length;
    }
  }
}

/// Lighting normals from a five-sample neighbourhood while vertex POSITIONS keep the exact sourced
/// grid. This removes coarse tone-ramp shelves on steep walls without moving the flyable floor,
/// the ridge gap, collision truth, or the renderer's LOD elevations.
function smoothSurfaceNormals(normals, heights, water, sampleCount, spacingEast, spacingNorth) {
  const smoothed = new Float32Array(heights.length);
  for (let north = 0; north < sampleCount; north++) {
    for (let east = 0; east < sampleCount; east++) {
      let weightedHeight = 0;
      let totalWeight = 0;
      for (let northOffset = -2; northOffset <= 2; northOffset++) {
        const adjacentNorth = Math.min(sampleCount - 1, Math.max(0, north + northOffset));
        for (let eastOffset = -2; eastOffset <= 2; eastOffset++) {
          const adjacentEast = Math.min(sampleCount - 1, Math.max(0, east + eastOffset));
          const weight = 1 / (1 + Math.abs(eastOffset) + Math.abs(northOffset));
          weightedHeight += heights[adjacentNorth * sampleCount + adjacentEast] * weight;
          totalWeight += weight;
        }
      }
      smoothed[north * sampleCount + east] = weightedHeight / totalWeight;
    }
  }
  for (let north = 0; north < sampleCount; north++) {
    const south = Math.max(0, north - 1);
    const northNeighbour = Math.min(sampleCount - 1, north + 1);
    for (let east = 0; east < sampleCount; east++) {
      const index = north * sampleCount + east;
      const offset = index * 3;
      if (water[index]) {
        normals[offset] = 0;
        normals[offset + 1] = 1;
        normals[offset + 2] = 0;
        continue;
      }
      const west = Math.max(0, east - 1);
      const eastNeighbour = Math.min(sampleCount - 1, east + 1);
      const eastSlope = (
        smoothed[north * sampleCount + eastNeighbour]
        - smoothed[north * sampleCount + west]
      ) / Math.max(spacingEast, (eastNeighbour - west) * spacingEast);
      const northSlope = (
        smoothed[northNeighbour * sampleCount + east]
        - smoothed[south * sampleCount + east]
      ) / Math.max(spacingNorth, (northNeighbour - south) * spacingNorth);
      const length = Math.hypot(eastSlope, 1, northSlope);
      normals[offset] = -eastSlope / length;
      normals[offset + 1] = 1 / length;
      normals[offset + 2] = northSlope / length;
    }
  }
}

/// THREE.BufferGeometry.computeBoundingSphere's exact algorithm — the AABB centre, then the
/// greatest distance from it — reproduced here so the worker can hand back a finished sphere and
/// the main thread never has to walk the position array again.
function boundingSphereOf(positions) {
  let minimumX = Infinity, minimumY = Infinity, minimumZ = Infinity;
  let maximumX = -Infinity, maximumY = -Infinity, maximumZ = -Infinity;
  for (let offset = 0; offset < positions.length; offset += 3) {
    const x = positions[offset];
    const y = positions[offset + 1];
    const z = positions[offset + 2];
    if (x < minimumX) minimumX = x;
    if (y < minimumY) minimumY = y;
    if (z < minimumZ) minimumZ = z;
    if (x > maximumX) maximumX = x;
    if (y > maximumY) maximumY = y;
    if (z > maximumZ) maximumZ = z;
  }
  const centreX = (minimumX + maximumX) * 0.5;
  const centreY = (minimumY + maximumY) * 0.5;
  const centreZ = (minimumZ + maximumZ) * 0.5;
  let maximumRadiusSquared = 0;
  for (let offset = 0; offset < positions.length; offset += 3) {
    const dx = positions[offset] - centreX;
    const dy = positions[offset + 1] - centreY;
    const dz = positions[offset + 2] - centreZ;
    const distanceSquared = dx * dx + dy * dy + dz * dz;
    if (distanceSquared > maximumRadiusSquared) maximumRadiusSquared = distanceSquared;
  }
  return {
    centre: [centreX, centreY, centreZ],
    radius: Math.sqrt(maximumRadiusSquared),
  };
}

/// Every array a terrain chunk mesh needs, and nothing that belongs to a renderer. The result is
/// structured-clone/transfer safe, which is the whole point: it crosses a worker boundary.
///
/// `boundsLocalM` is the chunk's [minEast, minNorth, maxEast, maxNorth]; `decoded` is
/// decodeTerrainRecord's { heights, water, sampleCount }.
export function buildTerrainMeshArrays(boundsLocalM, decoded) {
  const { water, sampleCount } = decoded;
  const includeLandcover = decoded.includeLandcover !== false;
  const surfaceHeights = reconstructWaterHeights(decoded);
  const [minimumEast, minimumNorth, maximumEast, maximumNorth] = boundsLocalM;
  const centreEast = (minimumEast + maximumEast) * 0.5;
  const centreNorth = (minimumNorth + maximumNorth) * 0.5;
  const spacingEast = (maximumEast - minimumEast) / (sampleCount - 1);
  const spacingNorth = (maximumNorth - minimumNorth) / (sampleCount - 1);
  const baseVertexCount = sampleCount * sampleCount;
  const perimeter = [];
  for (let east = 0; east < sampleCount; east++) perimeter.push(east);
  for (let north = 1; north < sampleCount; north++) {
    perimeter.push(north * sampleCount + sampleCount - 1);
  }
  for (let east = sampleCount - 2; east >= 0; east--) {
    perimeter.push((sampleCount - 1) * sampleCount + east);
  }
  for (let north = sampleCount - 2; north > 0; north--) {
    perimeter.push(north * sampleCount);
  }
  const skirtDepthM = Math.max(200,
    Math.min(650, Math.max(spacingEast, spacingNorth) * 1.5));
  // Duplicate both the top and bottom skirt vertices so side-wall normals cannot darken the
  // sourced top surface. Skirts overlap mismatched neighbour edges without changing truth.
  const skirtVertexCount = perimeter.length * 2;
  const vertexCount = baseVertexCount + skirtVertexCount;
  const positions = new Float32Array(vertexCount * 3);
  const waterValues = new Float32Array(vertexCount);
  const landcover = new Uint8Array(includeLandcover ? vertexCount * 2 : 0);
  const landcoverAxes = includeLandcover
    ? createLandcoverAxes(boundsLocalM, sampleCount)
    : null;
  for (let north = 0; north < sampleCount; north++) {
    for (let east = 0; east < sampleCount; east++) {
      const index = north * sampleCount + east;
      const worldEastM = minimumEast + east * spacingEast;
      const worldNorthM = minimumNorth + north * spacingNorth;
      positions[index * 3] = worldEastM - centreEast;
      positions[index * 3 + 1] = surfaceHeights[index];
      positions[index * 3 + 2] = -(worldNorthM - centreNorth);
      waterValues[index] = water[index];
      if (includeLandcover) {
        const macroEast = landcoverAxes.macroEast[east];
        const macroNorth = landcoverAxes.macroNorth[north];
        const mesoEast = landcoverAxes.mesoEast[east];
        const mesoNorth = landcoverAxes.mesoNorth[north];
        const macro = Math.min(1, Math.max(0,
          macroEast * 0.46
            + macroNorth * 0.34
            + (1 - Math.abs(macroEast - macroNorth)) * 0.20));
        const meso = Math.min(1, Math.max(0,
          mesoEast * 0.48
            + mesoNorth * 0.34
            + mesoEast * mesoNorth * 0.18));
        // X: meadow → scrub → woodland succession.
        landcover[index * 2] = Math.round(clampUnit(
          macro * 0.68 + meso * 0.32,
        ) * 255);

        // Y: seamless former-field history. Absolute metre coordinates keep it identical at
        // neighbouring chunk edges; the existing smooth macro/meso fields warp the large rotated
        // parcels away from a cadastral grid. Fine strips/access tracks fade out automatically as
        // source spacing becomes too coarse, so LOD2/3 cannot alias them in the distance.
        const fieldAcross = worldEastM * 0.894427 + worldNorthM * 0.447214
          + (macro - 0.5) * 280;
        const fieldAlong = -worldEastM * 0.447214 + worldNorthM * 0.894427
          + (meso - 0.5) * 220;
        const parcelEast = Math.floor(fieldAcross / 420);
        const parcelNorth = Math.floor(fieldAlong / 820);
        const parcelTone = fraction(
          parcelEast * 0.754877666 + parcelNorth * 0.569840296,
        );
        const detailWeight = clampUnit(
          (192 - Math.max(spacingEast, spacingNorth)) / 128,
        );
        const stripTone = 1 - Math.abs(fraction(fieldAcross / 180) * 2 - 1);
        const trackDistanceM = Math.abs(fraction(fieldAlong / 1_000) - 0.5) * 1_000;
        const trackBlend = clampUnit((trackDistanceM - 14) / 46);
        const track = (1 - smoothUnit(trackBlend)) * detailWeight;
        const fieldTone = clampUnit(
          0.08 + (parcelTone * 0.45 + stripTone * 0.55 * detailWeight) * 0.86,
        );
        landcover[index * 2 + 1] = Math.round(
          (fieldTone + (0.015 - fieldTone) * track) * 255,
        );
      }
    }
  }
  // Baked ambient occlusion: each sample against the mean of its ring neighbours. Negative means
  // the sample sits below its surroundings (enclosed valley floor); positive means it stands proud
  // (ridge crest). This is the term that makes dissected terrain legible, and baking it here keeps
  // the fragment shader free of neighbourhood sampling.
  const spacingM = Math.max(spacingEast, spacingNorth);
  const ringSamples = Math.max(1, Math.min(
    Math.floor((sampleCount - 1) / 2),
    Math.round(TERRAIN_CONCAVITY_RADIUS_M / spacingM),
  ));
  const concavity = new Float32Array(vertexCount);
  for (let north = 0; north < sampleCount; north++) {
    for (let east = 0; east < sampleCount; east++) {
      const index = north * sampleCount + east;
      let total = 0;
      let count = 0;
      for (let northStep = -1; northStep <= 1; northStep++) {
        for (let eastStep = -1; eastStep <= 1; eastStep++) {
          if (northStep === 0 && eastStep === 0) continue;
          const sampleNorth = Math.min(sampleCount - 1,
            Math.max(0, north + northStep * ringSamples));
          const sampleEast = Math.min(sampleCount - 1,
            Math.max(0, east + eastStep * ringSamples));
          total += surfaceHeights[sampleNorth * sampleCount + sampleEast];
          count++;
        }
      }
      const relative = surfaceHeights[index] - total / count;
      const raw = Math.min(1, Math.max(0,
        relative / TERRAIN_CONCAVITY_RELIEF_M * 0.5 + 0.5));
      // A chunk can only see its own samples, so a clamped neighbourhood at the boundary would
      // give the SAME world position different occlusion in each of the two chunks sharing it —
      // a visible seam grid every tile span. Fading to exactly 0.5 over the ring width makes both
      // sides agree by construction, at the cost of occlusion in a band that is a few percent of
      // the tile. Do not replace this with cross-chunk sampling: it would make geometry depend on
      // neighbour load order and break determinism.
      const edgeDistance = Math.min(east, north,
        sampleCount - 1 - east, sampleCount - 1 - north);
      const edgeFade = Math.min(1, edgeDistance / ringSamples);
      concavity[index] = 0.5 + (raw - 0.5) * edgeFade;
    }
  }
  const indices = [];
  for (let north = 0; north < sampleCount - 1; north++) {
    for (let east = 0; east < sampleCount - 1; east++) {
      const southwest = north * sampleCount + east;
      const southeast = southwest + 1;
      const northwest = southwest + sampleCount;
      const northeast = northwest + 1;
      // Renderer space flips north into -Z, so this winding keeps the sourced surface front-facing
      // with +Y normals. Reversing these triples makes the entire peninsula back-face culled.
      indices.push(southwest, southeast, northwest);
      indices.push(southeast, northeast, northwest);
    }
  }
  const surfaceTriangleCount = indices.length / 3;
  const skirtStart = baseVertexCount;
  for (let perimeterIndex = 0; perimeterIndex < perimeter.length; perimeterIndex++) {
    const sourceIndex = perimeter[perimeterIndex];
    const topIndex = skirtStart + perimeterIndex * 2;
    const bottomIndex = topIndex + 1;
    positions[topIndex * 3] = positions[sourceIndex * 3];
    positions[topIndex * 3 + 1] = positions[sourceIndex * 3 + 1];
    positions[topIndex * 3 + 2] = positions[sourceIndex * 3 + 2];
    positions[bottomIndex * 3] = positions[sourceIndex * 3];
    positions[bottomIndex * 3 + 1] = positions[sourceIndex * 3 + 1] - skirtDepthM;
    positions[bottomIndex * 3 + 2] = positions[sourceIndex * 3 + 2];
    waterValues[topIndex] = water[sourceIndex];
    waterValues[bottomIndex] = water[sourceIndex];
    if (includeLandcover) {
      landcover[topIndex * 2] = landcover[sourceIndex * 2];
      landcover[topIndex * 2 + 1] = landcover[sourceIndex * 2 + 1];
      landcover[bottomIndex * 2] = landcover[sourceIndex * 2];
      landcover[bottomIndex * 2 + 1] = landcover[sourceIndex * 2 + 1];
    }
    concavity[topIndex] = concavity[sourceIndex];
    concavity[bottomIndex] = concavity[sourceIndex];
  }
  for (let perimeterIndex = 0; perimeterIndex < perimeter.length; perimeterIndex++) {
    const next = (perimeterIndex + 1) % perimeter.length;
    if (water[perimeter[perimeterIndex]] && water[perimeter[next]]) continue;
    const top = skirtStart + perimeterIndex * 2;
    const bottom = top + 1;
    const nextTop = skirtStart + next * 2;
    const nextBottom = nextTop + 1;
    indices.push(top, bottom, nextTop, nextTop, bottom, nextBottom);
  }
  const normals = new Float32Array(vertexCount * 3);
  writeHeightfieldNormals(
    normals, surfaceHeights, water, sampleCount, spacingEast, spacingNorth);
  smoothSurfaceNormals(
    normals, surfaceHeights, water, sampleCount, spacingEast, spacingNorth);
  // A skirt's geometric wall normal has dot(N, sun) ~= 0 and renders near-black at the current
  // shadow floor. Set every skirt vertex from its source top-surface normal — which
  // smoothSurfaceNormals has just refined — so the curtain shades as a continuation of the terrain
  // edge it hides and never reads as a black slab. This must remain after smoothing so skirts
  // inherit the same final normal as the surface edge they hang from.
  const boundaryNormals = new Float32Array(perimeter.length * 3);
  for (let perimeterIndex = 0; perimeterIndex < perimeter.length; perimeterIndex++) {
    const sourceOffset = perimeter[perimeterIndex] * 3;
    const topOffset = (skirtStart + perimeterIndex * 2) * 3;
    const bottomOffset = topOffset + 3;
    for (let axis = 0; axis < 3; axis++) {
      const value = normals[sourceOffset + axis];
      normals[topOffset + axis] = value;
      normals[bottomOffset + axis] = value;
      boundaryNormals[perimeterIndex * 3 + axis] = value;
    }
  }
  // Match THREE's own index-width choice so nothing downstream sees a wider buffer than before.
  const indexArray = vertexCount > 65535
    ? Uint32Array.from(indices)
    : Uint16Array.from(indices);
  return {
    positions,
    normals,
    waterValues,
    landcover,
    concavity,
    indices: indexArray,
    centreEast,
    centreNorth,
    triangleCount: indices.length / 3,
    surfaceTriangleCount,
    // Two material groups so the flat top surface can render single-sided (THREE.FrontSide halves
    // its fragment work — this is where the "face-full of ground" fill cost lives) while the thin
    // perimeter skirts stay double-sided. A seam skirt is viewed from either side depending on
    // which neighbour is lower, so single-siding it could open the very crack it exists to hide;
    // the skirt area is negligible, so keeping only it double-sided costs almost nothing.
    surfaceIndexCount: surfaceTriangleCount * 3,
    skirtDepthM,
    boundingSphere: boundingSphereOf(positions),
    boundaryIndices: Uint32Array.from(perimeter),
    boundaryNormals,
  };
}

/// The buffers worth moving rather than copying when this crosses a worker boundary.
export function terrainMeshTransferables(built) {
  return [
    built.positions.buffer,
    built.normals.buffer,
    built.waterValues.buffer,
    built.landcover.buffer,
    built.concavity.buffer,
    built.indices.buffer,
    built.boundaryIndices.buffer,
    built.boundaryNormals.buffer,
  ];
}
