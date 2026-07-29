import {
  applyKoreaSceneryBudgetLevel,
  createKoreaSceneryRuntime,
  disposeKoreaSceneryTile,
} from "./korea_scenery.js";
import {
  buildTerrainMeshArrays,
  reconstructWaterHeights,
  TERRAIN_CONCAVITY_RADIUS_M,
  TERRAIN_CONCAVITY_RELIEF_M,
} from "./terrain_mesh_builder.js";
import {
  addUkraineSoftWorldFog,
  UKRAINE_SOFT_WORLD_FOG_DENSITY_SCALE,
  UKRAINE_SOFT_WORLD_HAZE_MIX,
  UKRAINE_SOFT_WORLD_HAZE_RGB,
} from "./soft_world_atmosphere.js";
import { createMissionFeaturePresentation } from "./mission_features.js";

const DEFAULT_MANIFEST_URL = new URL(
  "../../content/packs/korea-1950s/environment/terrain/central-front.manifest.json",
  import.meta.url,
).href;

const TIER_DISTANCE_METRES = Object.freeze({
  mobile: Object.freeze([10_000, 25_000, 58_000]),
  balanced: Object.freeze([16_000, 42_000, 88_000]),
  // Valley walls remain a primary flight reference well beyond one tile. Keeping the 64 m source
  // grid resident through the first two tile rings prevents the authored 40–60 degree walls from
  // collapsing into visible 128 m contour shelves in low-altitude desktop views.
  desktop: Object.freeze([40_000, 76_000, 128_000]),
  // Ukraine is broad low-relief country. Its authored close detail matters around the aircraft,
  // but holding LOD0 (and its soft-world scenery) for 40 km spends millions of nearly identical
  // canopy vertices. The source itself is 32 m DEM: a 5 km full-detail ring preserves foreground
  // parallax while handing sub-pixel relief to the 64 m and 128 m meshes.
  "ukraine-desktop": Object.freeze([5_000, 24_000, 60_000]),
});

// Ambient scenery has a much shorter useful range than terrain. At 8–12 km the individual
// procedural trees, wires and roofs are sub-pixel, while their broad woodland/parcel structure is
// already present in the worker-baked landcover. Keeping the radii separate prevents weak tiers
// from submitting seven scenery batches for every LOD1 terrain tile in the streamed disc.
const UKRAINE_AMBIENT_SCENERY_RADIUS_M = Object.freeze({
  mobile: 8_000,
  balanced: 12_000,
  desktop: 6_000,
});
const AMBIENT_SCENERY_ALTITUDE_WEIGHT = 3;
const AMBIENT_SCENERY_HYSTERESIS = 0.12;

export function ambientSceneryRadiusM(tier = "balanced", era = null) {
  if (era !== "ukraine-modern") return Number.POSITIVE_INFINITY;
  return UKRAINE_AMBIENT_SCENERY_RADIUS_M[tier]
    ?? UKRAINE_AMBIENT_SCENERY_RADIUS_M.balanced;
}

const TIER_STREAMING = Object.freeze({
  mobile: Object.freeze({ lookAheadSeconds: 12, pageLoads: 1 }),
  balanced: Object.freeze({ lookAheadSeconds: 20, pageLoads: 2 }),
  desktop: Object.freeze({ lookAheadSeconds: 28, pageLoads: 3 }),
});
const MAX_STREAM_LOOK_AHEAD_METRES = 24_000;
const TERRAIN_ALTITUDE_LOD_WEIGHT = 4;

export const TERRAIN_CURVATURE_START_M = 12_000;
export const TERRAIN_EARTH_RADIUS_M = 6_371_000;
const UKRAINE_TRAINING_CORE_HALF_SPAN_M = 8_192;
const UKRAINE_TRAINING_APRON_TRANSITION_M = 4_000;
const UKRAINE_TRAINING_APRON_HEIGHT_M = 78;
// At the Rapier's 21.5 km cruise the true horizon is about 520 km (3.57*sqrt(h) km), so a 100 km
// apron left the pilot looking at a small disc of ground ringed by void. These patches are
// PlaneGeometry(w, h, 1, 1) - two triangles each - so reaching past the horizon costs four quads
// and nothing else. Detail out here is explicitly not wanted; presence is.
const UKRAINE_TRAINING_HORIZON_HALF_SPAN_M = 560_000;

function missionFeatureAmbientExclusionZones(pack) {
  const anchor = pack?.coordinateFrame?.anchorSourceM;
  const anchorEastM = Number(anchor?.eastM);
  const anchorNorthM = Number(anchor?.northM);
  if (!Number.isFinite(anchorEastM) || !Number.isFinite(anchorNorthM)
      || !Array.isArray(pack?.ambientExclusionZones)) return Object.freeze([]);
  return Object.freeze(pack.ambientExclusionZones.flatMap((zone) => {
    const centre = Array.isArray(zone?.centerLocalM)
      ? zone.centerLocalM
      : zone?.centreLocalM;
    const eastOffsetM = Number(centre?.[0]);
    const northOffsetM = Number(centre?.[2]);
    let radiusM = Number(zone?.radiusM);
    if (!(radiusM > 0) && Array.isArray(zone?.pointsLocalM)) {
      radiusM = Math.max(0, ...zone.pointsLocalM.map((point) =>
        Math.hypot(Number(point?.[0]) || 0, Number(point?.[2]) || 0)));
    }
    return Number.isFinite(eastOffsetM) && Number.isFinite(northOffsetM) && radiusM > 0
      ? [Object.freeze({
        eastM: anchorEastM + eastOffsetM,
        northM: anchorNorthM + northOffsetM,
        radiusM,
      })]
      : [];
  }));
}

// Baked terrain occlusion. The sampling radius is expressed in METRES and converted to samples
// per LOD, so a valley reads with the same enclosure at 64 m and at 256 m spacing and does not
// pop across an LOD change. 300 m is about the floor width of a Korean central-highland valley.
// Relief that saturates the attribute clamps at TERRAIN_CONCAVITY_RELIEF_M, so a 1,500 m ridge
// wall does not crush every lesser fold to black. Both live in terrain_mesh_builder.js — the
// meshing maths had to leave this module so a Worker could run it — and are re-exported here
// because they are part of this module's published surface.
export { TERRAIN_CONCAVITY_RADIUS_M, TERRAIN_CONCAVITY_RELIEF_M, reconstructWaterHeights };

export function terrainCurvatureDropM(radialDistanceM) {
  const curvedRadialM = Math.max(finite(radialDistanceM) - TERRAIN_CURVATURE_START_M, 0);
  return curvedRadialM * curvedRadialM / (2 * TERRAIN_EARTH_RADIUS_M);
}

// This is the exact analytic source used by build_ukraine_training_sector.py, rounded onto the
// same 0.1 m storage lattice as the embedded 32 m truth grid. It is used only to continue the four
// synthetic cell edges through the 4 km presentation ring; detailed in-cell rendering still comes
// exclusively from the packed terrain product.
export function ukraineTrainingSourceHeightM(eastM, northM) {
  const macroRoll = 13.5 * Math.sin(eastM / 7_600 + 0.35)
    * Math.cos(northM / 9_800);
  const diagonalRoll = 8 * Math.sin((eastM + northM) / 4_900 - 0.8);
  const fieldScaleRelief = 3.8 * Math.cos((eastM - 1.7 * northM) / 2_650);
  let drainageEastM = -2_500 + 1_650 * Math.sin(northM / 6_400);
  drainageEastM += 420 * Math.sin(northM / 1_900 + 0.6);
  const drainageDistanceM = Math.abs(eastM - drainageEastM);
  const drainage = -19 * Math.exp(-((drainageDistanceM / 920) ** 2));
  const floodplain = -6.5 * Math.exp(-((drainageDistanceM / 2_900) ** 4));
  const easternEscarpment = 25 * Math.exp(
    -(((eastM - 5_600) / 3_500) ** 2)
    - (((northM + 1_200) / 7_200) ** 2),
  );
  const heightM = Math.min(188, Math.max(72,
    118 + macroRoll + diagonalRoll + fieldScaleRelief
      + drainage + floodplain + easternEscarpment));
  return Math.round(heightM * 10) / 10;
}

export function ukraineCoreHalfSpanFromManifest(manifest) {
  const bounds = manifest?.boundsLocalM;
  if (!Array.isArray(bounds) || bounds.length !== 4
      || !bounds.every((value) => Number.isFinite(Number(value)))) {
    return UKRAINE_TRAINING_CORE_HALF_SPAN_M;
  }
  const halfEast = Math.max(Math.abs(Number(bounds[0])), Math.abs(Number(bounds[2])));
  const halfNorth = Math.max(Math.abs(Number(bounds[1])), Math.abs(Number(bounds[3])));
  const halfSpanM = Math.max(halfEast, halfNorth);
  return halfSpanM > 0 ? halfSpanM : UKRAINE_TRAINING_CORE_HALF_SPAN_M;
}

export function ukraineTrainingApronHeightM(eastM, northM,
  coreHalfSpanM = UKRAINE_TRAINING_CORE_HALF_SPAN_M) {
  const core = Math.max(1, finite(coreHalfSpanM, UKRAINE_TRAINING_CORE_HALF_SPAN_M));
  const sourceEastM = Math.max(-core, Math.min(core, finite(eastM)));
  const sourceNorthM = Math.max(-core, Math.min(core, finite(northM)));
  const eastOutsideM = finite(eastM) - sourceEastM;
  const northOutsideM = finite(northM) - sourceNorthM;
  const distanceOutsideM = Math.hypot(eastOutsideM, northOutsideM);
  let fraction = Math.max(0, Math.min(1,
    distanceOutsideM / UKRAINE_TRAINING_APRON_TRANSITION_M));
  fraction = fraction * fraction * (3 - 2 * fraction);
  // The analytic training height field only describes the compact 16 km cell. Theatre-scale
  // cores blend from the flat far datum instead of inventing kilometres of fake relief.
  const edgeHeightM = core <= UKRAINE_TRAINING_CORE_HALF_SPAN_M * 1.5
    ? ukraineTrainingSourceHeightM(sourceEastM, sourceNorthM)
    : UKRAINE_TRAINING_APRON_HEIGHT_M;
  return edgeHeightM
    + (UKRAINE_TRAINING_APRON_HEIGHT_M - edgeHeightM) * fraction;
}

function createUkraineApronStripGeometry(THREE, bounds, targetSpacingM = 256,
  coreHalfSpanM = UKRAINE_TRAINING_CORE_HALF_SPAN_M) {
  const [minimumEastM, minimumNorthM, maximumEastM, maximumNorthM] = bounds;
  const eastSpanM = maximumEastM - minimumEastM;
  const northSpanM = maximumNorthM - minimumNorthM;
  // The strip's long/tangential axis meets the detailed terrain edge. Keep it on the packed
  // truth grid's 32 m lattice so every inner-ring vertex is byte-identical to collision/AGL truth;
  // the shorter/radial axis can stay coarse because it only presents the 4 km safety blend.
  // Theatre-scale edges cannot afford a 32 m lattice (hundreds of km × 32 m → millions of verts).
  const longSpacingM = coreHalfSpanM > UKRAINE_TRAINING_CORE_HALF_SPAN_M * 1.5 ? 2_048 : 32;
  const eastSpacingM = eastSpanM > northSpanM ? longSpacingM : targetSpacingM;
  const northSpacingM = northSpanM > eastSpanM ? longSpacingM : targetSpacingM;
  const eastSegments = Math.max(1,
    Math.ceil(eastSpanM / eastSpacingM));
  const northSegments = Math.max(1,
    Math.ceil(northSpanM / northSpacingM));
  const columns = eastSegments + 1;
  const rows = northSegments + 1;
  const positions = new Float32Array(columns * rows * 3);
  const indices = [];
  let offset = 0;
  for (let row = 0; row < rows; row++) {
    const northM = minimumNorthM
      + (maximumNorthM - minimumNorthM) * row / northSegments;
    for (let column = 0; column < columns; column++) {
      const eastM = minimumEastM
        + (maximumEastM - minimumEastM) * column / eastSegments;
      positions[offset++] = eastM;
      positions[offset++] = ukraineTrainingApronHeightM(eastM, northM, coreHalfSpanM);
      positions[offset++] = -northM;
    }
  }
  for (let row = 0; row < northSegments; row++) {
    for (let column = 0; column < eastSegments; column++) {
      const southwest = row * columns + column;
      const southeast = southwest + 1;
      const northwest = southwest + columns;
      const northeast = northwest + 1;
      indices.push(southwest, southeast, northwest, southeast, northeast, northwest);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createUkraineTrainingHorizonApron(THREE,
  coreHalfSpanM = UKRAINE_TRAINING_CORE_HALF_SPAN_M) {
  const core = Math.max(1, finite(coreHalfSpanM, UKRAINE_TRAINING_CORE_HALF_SPAN_M));
  const root = new THREE.Group();
  root.name = "FICTIONAL_UKRAINE_PRESENTATION_APRON_SYSTEM";
  const metadata = Object.freeze({
    authoritative: false,
    collision: false,
    targetable: false,
    purpose: "visual-horizon-apron-with-physics-matched-transition",
    transitionM: UKRAINE_TRAINING_APRON_TRANSITION_M,
    // Inner edge of the apron must sit outside authored terrain. The compact training cell is
    // 16.4 km; theatre.v2 is 262 km. Using the training constant against the theatre made the
    // flat apron overlap every streamed chunk inside ~12–40 km, and at Rapier slant ranges a
    // 24-bit linear depth buffer cannot separate the 78 m apron from real ground.
    coreHalfSpanM: core,
  });
  root.userData.terrain = metadata;

  const transitionMaterial = new THREE.MeshLambertMaterial({
    color: 0x7c8b52,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const outer = core + UKRAINE_TRAINING_APRON_TRANSITION_M;
  const transitionBounds = [
    [-outer, core, outer, outer],
    [-outer, -outer, outer, -core],
    [core, -core, outer, core],
    [-outer, -core, -core, core],
  ];
  const transition = new THREE.Group();
  transition.name = "FICTIONAL_UKRAINE_PRESENTATION_TRANSITION_RING";
  for (const [index, bounds] of transitionBounds.entries()) {
    const mesh = new THREE.Mesh(
      createUkraineApronStripGeometry(THREE, bounds, 256, core),
      transitionMaterial,
    );
    mesh.name = `FICTIONAL_UKRAINE_TRANSITION_STRIP_${index + 1}`;
    mesh.receiveShadow = false;
    mesh.userData.terrain = metadata;
    transition.add(mesh);
  }
  root.add(transition);

  // The flat apron must LOSE every depth tie rather than fight one. It is presentation-only
  // filler; wherever any real ground is also drawn, that ground should win outright. Without this
  // the apron and the other ground surface were coplanar over the whole visible field and
  // z-fought into a shattered speckle across the entire terrain — which is what "the flickery
  // terrain is still everywhere" actually was. transitionMaterial already yielded this way; the
  // flat patches were the ones left tying, and extending them to 560 km made it cover the screen.
  const flatMaterial = new THREE.MeshLambertMaterial({
    color: 0x59652b,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  });
  transitionMaterial.userData.clearSurfaceColor = transitionMaterial.color.clone();
  flatMaterial.userData.clearSurfaceColor = flatMaterial.color.clone();
  root.userData.THREE = THREE;
  root.userData.winterSurfaceMaterials = [transitionMaterial, flatMaterial];
  const horizon = UKRAINE_TRAINING_HORIZON_HALF_SPAN_M;
  const flatPatches = [
    [-horizon, outer, horizon, horizon],
    [-horizon, -horizon, horizon, -outer],
    [outer, -outer, horizon, outer],
    [-horizon, -outer, -outer, outer],
  ];
  for (const [index, bounds] of flatPatches.entries()) {
    const [minEast, minNorth, maxEast, maxNorth] = bounds;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(maxEast - minEast, maxNorth - minNorth, 1, 1)
        .rotateX(-Math.PI * 0.5),
      flatMaterial,
    );
    mesh.name = index === 0
      ? "FICTIONAL_UKRAINE_PRESENTATION_ONLY_LAND_APRON"
      : `FICTIONAL_UKRAINE_PRESENTATION_ONLY_LAND_APRON_${index + 1}`;
    mesh.position.set(
      (minEast + maxEast) * 0.5,
      UKRAINE_TRAINING_APRON_HEIGHT_M,
      -(minNorth + maxNorth) * 0.5,
    );
    mesh.receiveShadow = false;
    mesh.userData.terrain = metadata;
    root.add(mesh);
  }
  return root;
}

const TERRAIN_VERTEX = /* glsl */ `
uniform float uEarthRadiusM;
uniform float uCurvatureStartM;
attribute float terrainWater;
#ifdef UKRAINE_SCENERY
attribute vec2 landcover;
#endif
varying vec3 vTerrainNormal;
varying vec3 vTerrainWorldPosition;
varying float vTerrainHeight;
varying float vTerrainWater;
#ifdef UKRAINE_SCENERY
varying vec2 vTerrainLandcover;
#endif
attribute float concavity;
varying float vConcavity;
#include <common>
#include <logdepthbuf_pars_vertex>

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  // The shared collision format retains a water sentinel rather than a second surface height.
  // Renderer-side water vertices are reconstructed at their bank elevation below; this small lift
  // keeps the analytic water treatment cleanly above its supporting surface without a slot trench.
  world.y += terrainWater * 0.35;
  float radial = distance(world.xz, cameraPosition.xz);
  float curvedRadial = max(radial - uCurvatureStartM, 0.0);
  world.y -= curvedRadial * curvedRadial / (2.0 * uEarthRadiusM);
  vTerrainNormal = normalize(mat3(modelMatrix) * normal);
  vTerrainWorldPosition = world.xyz;
  vTerrainHeight = position.y;
  vTerrainWater = terrainWater;
  #ifdef UKRAINE_SCENERY
  vTerrainLandcover = landcover;
  #endif
  vConcavity = concavity;
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`;

const TERRAIN_FRAGMENT = /* glsl */ `
uniform vec3 uSunDirection;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uAtmosphereDensityScale;
uniform vec3 uAtmosphereHazeColor;
uniform float uAtmosphereHazeMix;
uniform float uWorldEdgeM;
uniform float uModernScenery;
uniform float uParcelTint;
uniform float uShadowFloor;
uniform vec2 uOcclusionRange;
uniform float uHazeBands;
uniform float uHazeBandBlend;
uniform float uSnowCover01;
uniform float uSnowWetness01;
uniform float uGlazeIce01;
varying float vConcavity;
varying vec3 vTerrainNormal;
varying vec3 vTerrainWorldPosition;
varying float vTerrainHeight;
varying float vTerrainWater;
#ifdef UKRAINE_SCENERY
varying vec2 vTerrainLandcover;
#endif
#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  vec3 normal = normalize(vTerrainNormal);
  float elevation = smoothstep(70.0, 1250.0, vTerrainHeight);
  float highRidge = smoothstep(680.0, 1500.0, vTerrainHeight);
  float steepness = 1.0 - clamp(normal.y, 0.0, 1.0);
  float valleyFloor = (1.0 - smoothstep(240.0, 560.0, vTerrainHeight))
    * (1.0 - smoothstep(0.035, 0.11, steepness));
  float upperSlope = smoothstep(320.0, 980.0, vTerrainHeight);
  // normal.y hides useful angle separation near vertical: 20 degrees is only 0.06 steepness.
  // These thresholds deliberately open the slope palette before a wall becomes cliff-like.
  float slopeFace = smoothstep(0.035, 0.19, steepness);
  float exposedFace = smoothstep(0.10, 0.30, steepness)
    * (0.24 + 0.76 * smoothstep(420.0, 1050.0, vTerrainHeight));

  #ifndef MODERN_SCENERY
  // This is an authored 1950s readability treatment, not a claim of per-pixel historical land
  // cover. Geometry and water are sourced; vegetation/cultivation become dated data layers later.
  vec3 valley = vec3(0.22, 0.27, 0.075);
  vec3 upland = vec3(0.075, 0.13, 0.035);
  vec3 drySlope = vec3(0.27, 0.17, 0.075);
  vec3 ridge = vec3(0.32, 0.31, 0.26);
  vec3 albedo = mix(valley, upland, smoothstep(210.0, 880.0, vTerrainHeight));
  albedo = mix(albedo, drySlope, slopeFace * (0.24 + upperSlope * 0.54));
  albedo = mix(albedo, ridge, max(highRidge * 0.64, exposedFace * 0.72));
  // Parcel/cultivation tint is the shader's most expensive fragment work (four sin() plus two
  // nested sin()). It is a fine-grain readability treatment only visible up close, so a tier
  // uniform gates it off entirely on the mobile/balanced visual tiers where fill-rate is scarce,
  // and in the modern era where the final era mix discards this complete period-lighting path.
  // uParcelTint is a compile-time-constant-per-material uniform, so the branch is fully coherent.
  if (uParcelTint > 0.5) {
    float lowland = (1.0 - smoothstep(180.0, 720.0, vTerrainHeight))
      * (1.0 - smoothstep(0.08, 0.42, steepness));
    float parcelA = 0.5 + 0.5 * sin(vTerrainWorldPosition.x * 0.0061
      + sin(vTerrainWorldPosition.z * 0.0017) * 1.8);
    float parcelB = 0.5 + 0.5 * sin(vTerrainWorldPosition.z * 0.0083
      + sin(vTerrainWorldPosition.x * 0.0013) * 2.1);
    float parcels = smoothstep(0.31, 0.69, parcelA * 0.56 + parcelB * 0.44);
    vec3 periodCultivation = mix(vec3(0.19, 0.24, 0.055), vec3(0.36, 0.31, 0.09), parcels);
    vec3 modernCultivation = mix(vec3(0.12, 0.24, 0.050), vec3(0.31, 0.29, 0.075), parcels);
    albedo = mix(albedo, mix(periodCultivation, modernCultivation, uModernScenery),
      lowland * (0.22 + parcels * 0.24));
  }

  float diffuse = uShadowFloor
    + (1.0 - uShadowFloor) * max(dot(normal, normalize(uSunDirection)), 0.0);
  vec3 lit = albedo * diffuse;

  #else
  // 2030s stylized treatment (docs/art-direction.md / ADR-0003). Korea-modern keeps a harder
  // illustrative tone ramp for silhouette readability; Ukraine uses a Ghibli-adjacent soft world
  // (warmer agricultural planes, continuous lighting, warm atmospheric haze) while instruments
  // stay cold. The 1950s era keeps the sourced-realism lean above.
  float bandStep = smoothstep(0.12, 0.22, elevation) * 0.34
    + smoothstep(0.42, 0.55, elevation) * 0.33
    + smoothstep(0.75, 0.88, elevation) * 0.33;
  // Sage/olive lowlands, umber slopes and cool-grey ridges form the authored modern-era bands.
  // Values stay deliberately below the old pale-bone range so ACES preserves colour separation.
  #ifdef UKRAINE_SCENERY
  // ADR-0003 soft world + Stage C rewild: continent-scale human no-go that reads as succession —
  // meadow → scrub → young woodland — not a live cadastral crop map. Metre-true DEM underneath;
  // fictional strip / no identifiable live-war locality.
  vec3 sValley = vec3(0.38, 0.52, 0.24);
  vec3 sFoothill = vec3(0.28, 0.42, 0.18);
  vec3 sUpland = vec3(0.22, 0.34, 0.15);
  vec3 sRock = vec3(0.36, 0.32, 0.24);
  vec3 sRidge = vec3(0.40, 0.38, 0.32);
  #else
  vec3 sValley = vec3(0.15, 0.24, 0.055);
  vec3 sFoothill = vec3(0.070, 0.13, 0.032);
  vec3 sUpland = vec3(0.040, 0.075, 0.030);
  vec3 sRock = vec3(0.25, 0.15, 0.060);
  vec3 sRidge = vec3(0.31, 0.29, 0.23);
  #endif
  vec3 sAlbedo = mix(sValley, sFoothill, bandStep);
  sAlbedo = mix(sAlbedo, sUpland, upperSlope * 0.76);
  #ifdef UKRAINE_SCENERY
  // Ukraine's low-hundreds-of-metres theatre cannot use the Korean 70–1,500 m elevation ramp:
  // that put nearly every regional vertex in one olive band. These broad steps span the actual
  // Rapier atlas and keep the 212.5 m Soniachne datum inside the readable mid-value range.
  float ukraineElevationBand = smoothstep(38.0, 78.0, vTerrainHeight) * 0.20
    + smoothstep(112.0, 182.0, vTerrainHeight) * 0.31
    + smoothstep(228.0, 380.0, vTerrainHeight) * 0.49;
  sAlbedo = mix(sValley, sFoothill, ukraineElevationBand * 0.68);
  sAlbedo = mix(sAlbedo, sUpland,
    smoothstep(128.0, 158.0, vTerrainHeight) * 0.20);

  // Worker-baked, seamless land cover. X carries broad meadow → scrub → woodland succession;
  // Y carries warm/cool meadow variation. Interpolation naturally removes the 360 m component
  // on coarse LODs, while close terrain gets readable colour structure without evaluating six
  // nested sin() calls for every ground fragment.
  vec2 softLandcover = clamp(vTerrainLandcover, 0.0, 1.0);
  float succession = softLandcover.x;
  float fieldHistory = softLandcover.y;
  float fieldTone = smoothstep(0.10, 0.90, fieldHistory);
  vec3 meadowCover = mix(vec3(0.23, 0.45, 0.12), vec3(0.70, 0.57, 0.22),
    fieldTone);
  vec3 rewildCover = mix(meadowCover, vec3(0.28, 0.46, 0.20),
    smoothstep(0.30, 0.62, succession));
  rewildCover = mix(rewildCover, vec3(0.16, 0.32, 0.14),
    smoothstep(0.64, 0.90, succession));
  float rewildFloor = (1.0 - smoothstep(0.05, 0.20, steepness))
    * (1.0 - smoothstep(380.0, 520.0, vTerrainHeight));
  float openField = rewildFloor * (1.0 - smoothstep(0.48, 0.70, succession));
  float trackCue = (1.0 - smoothstep(0.06, 0.18, fieldHistory)) * openField;
  rewildCover = mix(rewildCover, vec3(0.43, 0.35, 0.20), trackCue * 0.55);
  float dryMeadow = smoothstep(0.68, 0.92, fieldHistory)
    * (1.0 - smoothstep(0.48, 0.68, succession));
  rewildCover = mix(rewildCover, vec3(0.58, 0.56, 0.30), dryMeadow * 0.34);
  #else
  float patchwork = 0.5 + 0.5 * sin(vTerrainWorldPosition.x * 0.00023
    + sin(vTerrainWorldPosition.z * 0.00017) * 2.3);
  vec3 cultivation = mix(vec3(0.17, 0.25, 0.050), vec3(0.32, 0.29, 0.075),
    smoothstep(0.32, 0.68, patchwork));
  #endif
  #ifdef UKRAINE_SCENERY
  sAlbedo = mix(sAlbedo, rewildCover,
    rewildFloor * (0.72 + (1.0 - ukraineElevationBand) * 0.12));
  sAlbedo *= mix(1.06, 0.92, ukraineElevationBand);
  #else
  sAlbedo = mix(sAlbedo, cultivation, valleyFloor * (0.34 + patchwork * 0.30));
  #endif
  sAlbedo = mix(sAlbedo, sRock, slopeFace * (0.20 + upperSlope * 0.48));
  sAlbedo = mix(sAlbedo, sRidge, max(highRidge * 0.55, exposedFace * 0.62));
  float halfLambert = dot(normal, normalize(uSunDirection)) * 0.5 + 0.5;
  halfLambert *= halfLambert;
  #ifdef UKRAINE_SCENERY
  // Continuous soft lighting — painterly value without the hard two-step toon posterization.
  float toneRamp = uShadowFloor
    + (1.0 - uShadowFloor) * mix(0.62, 1.0, halfLambert);
  vec3 rimTint = vec3(0.18, 0.14, 0.07);
  #else
  float toneRamp = uShadowFloor
    + (1.0 - uShadowFloor) * (0.42 * smoothstep(0.26, 0.40, halfLambert)
      + 0.58 * smoothstep(0.58, 0.76, halfLambert));
  vec3 rimTint = vec3(0.055, 0.075, 0.11);
  #endif
  vec3 viewDirection = normalize(cameraPosition - vTerrainWorldPosition);
  float rim = pow(1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0), 3.0);
  vec3 stylizedLit = sAlbedo * toneRamp
    + rim * rimTint * (0.4 + 0.6 * clamp(normal.y, 0.0, 1.0));
  #ifdef UKRAINE_SCENERY
  // Low-relief macro normals need a bounded directional cue so sun-facing versus lee-facing
  // terrain still separates without hard toon steps, textures, or micro-scenery at altitude.
  vec2 regionalSunDirection = normalize(uSunDirection.xz + vec2(0.0001));
  float regionalReliefLight = clamp(
    0.96 + dot(normal.xz, regionalSunDirection) * 7.5,
    0.86,
    1.04);
  stylizedLit *= regionalReliefLight;
  #endif

  vec3 lit = stylizedLit;
  #endif

  #ifdef UKRAINE_SCENERY
  // Winter state comes from the simulation's surface-condition field. A coherent uniform branch
  // makes the normal green-world path pay essentially nothing; when active, snow follows broad
  // ground shape and the already-computed organic succession field rather than a tiled texture.
  // Water is composited later and therefore remains water rather than turning into painted snow.
  if (uSnowCover01 > 0.001 || uGlazeIce01 > 0.001) {
    float snowRetention = 1.0 - smoothstep(0.16, 0.62, steepness);
    float snowBreakup = mix(0.82, 1.06, succession);
    float snowMask = clamp(uSnowCover01 * snowRetention * snowBreakup, 0.0, 1.0);
    float snowLight = mix(0.66, 1.03,
      max(dot(normal, normalize(uSunDirection)), 0.0));
    vec3 drySnow = vec3(0.91, 0.90, 0.84);
    vec3 wetSnow = vec3(0.73, 0.79, 0.80);
    vec3 snowLit = mix(drySnow, wetSnow, uSnowWetness01) * snowLight;
    lit = mix(lit, snowLit, snowMask);

    float glazeMask = clamp(uGlazeIce01, 0.0, 1.0)
      * smoothstep(0.18, 0.92, normal.y) * (1.0 - snowMask * 0.74);
    vec3 glazeLit = mix(lit, vec3(0.67, 0.79, 0.83) * snowLight, 0.48);
    lit = mix(lit, glazeLit, glazeMask);
  }
  #endif

  // Baked enclosure darkens valley floors and lets ridge crests catch light. This is the term the
  // renderer was missing relative to the source hillshade in central-front-preview.png. Applied to
  // the terrain BEFORE water is composited, so open water keeps its own analytic shading.
  float terrainOcclusion = clamp(vConcavity, 0.0, 1.0);
  #ifdef UKRAINE_SCENERY
  // The broad real-DEM plain clusters tightly around the seam-neutral 0.5 value. Expand that
  // small source signal so drainage and low crowns survive ACES without moving the exact neutral
  // boundary value shared by adjacent chunks.
  terrainOcclusion = clamp(0.5 + (terrainOcclusion - 0.5) * 4.0, 0.0, 1.0);
  #endif
  lit *= mix(uOcclusionRange.x, uOcclusionRange.y, terrainOcclusion);

  // Inland source-water samples share the same analytic language as the shipped ocean: cool
  // blue-green body colour, grazing-angle sky reflection, restrained sun glint and metre-scale
  // directional breakup. The bank-height reconstruction in createTerrainGeometry keeps this
  // surface on the valley floor instead of stretching sentinel vertices down to sea level.
  // Era-independent: the rivers exist in both Koreas, so the water term sits outside the
  // compiled era specialization with its own view vector.
  vec3 waterView = normalize(cameraPosition - vTerrainWorldPosition);
  float waterFacing = clamp(dot(normal, waterView), 0.0, 1.0);
  float waterFresnel = pow(1.0 - waterFacing, 3.0);
  float waterRipple = sin(vTerrainWorldPosition.x * 0.012
      + vTerrainWorldPosition.z * 0.006)
    + 0.55 * sin(vTerrainWorldPosition.x * -0.005
      + vTerrainWorldPosition.z * 0.017 + 1.7);
  vec3 waterLit = mix(vec3(0.025, 0.13, 0.17), vec3(0.10, 0.30, 0.34),
    0.24 + waterFresnel * 0.58);
  waterLit *= 0.94 + waterRipple * 0.035;
  vec3 waterHalf = normalize(waterView + normalize(uSunDirection));
  waterLit += vec3(0.88, 0.82, 0.66)
    * pow(max(dot(normal, waterHalf), 0.0), 96.0) * 0.42;
  float waterMask = smoothstep(0.18, 0.82, vTerrainWater);
  #ifdef UKRAINE_SCENERY
  // Softer pond/river body — teal glass rather than electric map-blue.
  waterLit = mix(vec3(0.06, 0.18, 0.20), vec3(0.16, 0.34, 0.36),
    0.30 + waterFresnel * 0.48);
  waterLit *= 0.96 + waterRipple * 0.028;
  waterLit += vec3(0.90, 0.84, 0.68)
    * pow(max(dot(normal, waterHalf), 0.0), 72.0) * 0.28;
  #endif
  lit = mix(lit, waterLit, waterMask);

  // Aerial perspective: period haze whites the world out from altitude. Korea-modern thins
  // density toward cool sky blue. Ukraine soft-world (ADR-0003) hazes warm and dusty so distance
  // reads as atmosphere rather than a blue poster wash.
  #ifdef MODERN_SCENERY
  #ifdef UKRAINE_SCENERY
  float fogDensity = uFogDensity * uAtmosphereDensityScale;
  // Warm dusty atmosphere — Ghibli-adjacent distance, not cool poster blue.
  vec3 hazeColor = mix(uFogColor, uAtmosphereHazeColor, uAtmosphereHazeMix);
  #else
  float fogDensity = uFogDensity * 0.45;
  vec3 hazeColor = vec3(0.36, 0.52, 0.68);
  #endif
  #else
  float fogDensity = uFogDensity;
  vec3 hazeColor = uFogColor;
  #endif
  float distanceToCamera = length(cameraPosition - vTerrainWorldPosition);
  float aerial = 1.0 - exp(-fogDensity * fogDensity
    * distanceToCamera * distanceToCamera);
  #ifdef UKRAINE_SCENERY
  // Painterly mid-field haze is intentionally thin (0.42×). That same thinning leaves the
  // streamed disc readable as a render-square against sky / cool void. Force warm haze opaque
  // approaching the visual world edge so distance stays Ghibli atmosphere, not a tile boundary.
  if (uWorldEdgeM > 1.0) {
    // Start the bury early: at altitude the disc silhouette still reads square if haze only
    // thickens in the last 15% of the stream radius.
    float edgeHide = smoothstep(uWorldEdgeM * 0.40, uWorldEdgeM * 0.72, distanceToCamera);
    aerial = max(aerial, edgeHide);
  }
  #endif
  if (uHazeBands > 0.5) {
    float banded = floor(aerial * uHazeBands) / uHazeBands;
    aerial = mix(aerial, banded, uHazeBandBlend);
  }
  vec3 color = mix(lit, hazeColor, clamp(aerial, 0.0, 1.0));
  gl_FragColor = vec4(color, 1.0);
  #include <logdepthbuf_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function validateTerrainManifest(value) {
  if (!value || value.schemaVersion !== "1.0.0"
    || typeof value.terrainId !== "string"
    || !Array.isArray(value.boundsLocalM) || value.boundsLocalM.length !== 4
    || !value.boundsLocalM.every(Number.isFinite)
    || !value.bundle || typeof value.bundle.uri !== "string"
    || !/^[0-9a-f]{64}$/.test(value.bundle.sha256)
    || !Number.isSafeInteger(value.bundle.byteLength) || value.bundle.byteLength <= 0
    || !Array.isArray(value.chunks) || value.chunks.length === 0) {
    throw new TypeError("Invalid Korea terrain manifest.");
  }
  const quantization = value.quantization;
  if (!quantization || quantization.storage !== "little-endian-signed-int16"
    || !Number.isFinite(quantization.metresPerUnit)
    || quantization.metresPerUnit <= 0
    || !Number.isInteger(quantization.waterSentinel)) {
    throw new TypeError("Invalid Korea terrain quantization contract.");
  }
  for (const chunk of value.chunks) {
    if (typeof chunk?.id !== "string"
      || !Array.isArray(chunk.boundsLocalM) || chunk.boundsLocalM.length !== 4
      || !chunk.boundsLocalM.every(Number.isFinite)
      || !Array.isArray(chunk.lods) || chunk.lods.length === 0) {
      throw new TypeError("Invalid Korea terrain chunk contract.");
    }
    for (const [level, lod] of chunk.lods.entries()) {
      if (lod.level !== level || !Number.isInteger(lod.sampleCount) || lod.sampleCount < 2
        || !Number.isSafeInteger(lod.byteOffset) || lod.byteOffset < 0
        || !Number.isSafeInteger(lod.byteLength) || lod.byteLength !== lod.sampleCount ** 2 * 2
        || lod.byteOffset + lod.byteLength > value.bundle.byteLength) {
        throw new TypeError(`Invalid Korea terrain LOD record for ${chunk.id}.`);
      }
    }
  }
  return value;
}

export function validateTerrainAtlasManifest(value) {
  if (!value || value.schemaVersion !== "2.0.0"
    || typeof value.terrainId !== "string"
    || !Array.isArray(value.boundsLocalM) || value.boundsLocalM.length !== 4
    || !value.boundsLocalM.every(Number.isFinite)
    || !Number.isFinite(value.tileSpanM) || value.tileSpanM <= 0
    || !Number.isFinite(value.pageSpanM) || value.pageSpanM < value.tileSpanM
    || !Array.isArray(value.pages) || value.pages.length === 0) {
    throw new TypeError("Invalid Korea terrain atlas manifest.");
  }
  const ids = new Set();
  for (const page of value.pages) {
    if (typeof page?.id !== "string" || ids.has(page.id)
      || !Array.isArray(page.boundsLocalM) || page.boundsLocalM.length !== 4
      || !page.boundsLocalM.every(Number.isFinite)
      || typeof page.manifest?.uri !== "string"
      || !/^[0-9a-f]{64}$/.test(page.manifest.sha256)
      || !Number.isSafeInteger(page.manifest.byteLength)
      || page.manifest.byteLength <= 0) {
      throw new TypeError(`Invalid Korea terrain atlas page: ${page?.id ?? "unknown"}.`);
    }
    ids.add(page.id);
  }
  return value;
}

function distanceToBounds(eastM, northM, bounds) {
  const deltaEast = eastM < bounds[0] ? bounds[0] - eastM
    : eastM > bounds[2] ? eastM - bounds[2] : 0;
  const deltaNorth = northM < bounds[1] ? bounds[1] - northM
    : northM > bounds[3] ? northM - bounds[3] : 0;
  return Math.hypot(deltaEast, deltaNorth);
}

export function selectTerrainLod(distanceM, tier = "balanced", lodCount = 4,
  currentLevel = null, hysteresis = 0.12) {
  const thresholds = TIER_DISTANCE_METRES[tier] ?? TIER_DISTANCE_METRES.balanced;
  const distance = Math.max(0, finite(distanceM));
  const maximumLevel = Math.max(0, lodCount - 1);
  // Floor the near-ground LOD on the weak tiers: mobile/balanced never draw the 257^2 LOD0 surface
  // (nor its LOD0-only near-chunk tree/building scenery) even at the surface, capping fill-rate and
  // overdraw where it hurts most. Desktop retains full LOD0 detail. Clamped to the chunk's coarsest
  // available level so a single-LOD chunk is unaffected.
  const minimumLevel = tier === "desktop" || tier === "ukraine-desktop"
    ? 0
    : Math.min(1, maximumLevel);
  let selected = thresholds.findIndex((threshold) => distance < threshold);
  if (selected < 0) selected = thresholds.length;
  selected = Math.min(maximumLevel, Math.max(minimumLevel, selected));
  if (!Number.isInteger(currentLevel) || currentLevel < 0 || currentLevel > maximumLevel) {
    return selected;
  }
  const margin = Math.min(0.45, Math.max(0, finite(hysteresis, 0.12)));
  let level = Math.max(minimumLevel, currentLevel);
  while (level > minimumLevel && distance < thresholds[level - 1] * (1 - margin)) level--;
  while (level < maximumLevel && distance >= thresholds[level] * (1 + margin)) level++;
  return level;
}

export function decodeTerrainRecord(buffer, record, quantization) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== record.byteLength) {
    throw new RangeError("Terrain record byte length does not match its manifest.");
  }
  const view = new DataView(buffer);
  const count = record.sampleCount ** 2;
  const heights = new Float32Array(count);
  const water = new Uint8Array(count);
  const scale = quantization.metresPerUnit;
  const sentinel = quantization.waterSentinel;
  for (let index = 0; index < count; index++) {
    const value = view.getInt16(index * 2, true);
    const isWater = value === sentinel;
    water[index] = isWater ? 1 : 0;
    heights[index] = isWater ? 0 : value * scale;
  }
  return { heights, water, sampleCount: record.sampleCount };
}

/// Wrap a finished mesh from terrain_mesh_builder.js in renderer objects. Everything here is O(1)
/// in the size of the chunk — BufferAttribute construction only takes ownership of an array it is
/// handed — which is exactly why the arithmetic was moved out: this part is safe on a render
/// frame, and the loops that produce those arrays were not.
export function assembleTerrainGeometry(THREE, built) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(built.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(built.normals, 3));
  geometry.setAttribute("terrainWater", new THREE.BufferAttribute(built.waterValues, 1));
  if (built.landcover.length > 0) {
    geometry.setAttribute("landcover", new THREE.BufferAttribute(built.landcover, 2, true));
  }
  geometry.setAttribute("concavity", new THREE.BufferAttribute(built.concavity, 1));
  geometry.setIndex(new THREE.BufferAttribute(built.indices, 1));
  geometry.addGroup(0, built.surfaceIndexCount, 0);
  if (built.indices.length > built.surfaceIndexCount) {
    geometry.addGroup(built.surfaceIndexCount,
      built.indices.length - built.surfaceIndexCount, 1);
  }
  const sphere = built.boundingSphere;
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(sphere.centre[0], sphere.centre[1], sphere.centre[2]), sphere.radius);
  return {
    geometry,
    centreEast: built.centreEast,
    centreNorth: built.centreNorth,
    triangleCount: built.triangleCount,
    surfaceTriangleCount: built.surfaceTriangleCount,
    skirtDepthM: built.skirtDepthM,
    normalBoundary: Object.freeze({
      indices: built.boundaryIndices,
      normals: built.boundaryNormals,
    }),
  };
}

/// Build a chunk mesh synchronously. This is the fallback path (and the one the tests drive); the
/// streaming runtime prefers the worker pool, which runs the identical builder off-thread.
export function createTerrainGeometry(THREE, chunk, decoded) {
  return assembleTerrainGeometry(THREE, buildTerrainMeshArrays(chunk.boundsLocalM, decoded));
}


export class TerrainBundleReader {
  constructor(bundleUrl, byteLength, fetchImpl = fetch, maximumCachedRanges = 96) {
    this.bundleUrl = bundleUrl;
    this.byteLength = byteLength;
    // Native window.fetch rejects an arbitrary receiver. Wrapping it keeps the eventual request a
    // bare call instead of `reader.fetch(...)`, which otherwise binds `this` to this reader and
    // leaves every terrain chunk stuck in its retry loop with an "Illegal invocation" error.
    this.fetch = (...args) => fetchImpl(...args);
    this.completeBuffer = null;
    this.rangeCache = new Map();
    this.pendingRanges = new Map();
    this.rangeCapability = null;
    this.capabilityProbe = null;
    this.networkRequests = 0;
    this.networkBytes = 0;
    this.rangeCacheHits = 0;
    this.maximumCachedRanges = Math.max(1, Math.round(finite(maximumCachedRanges, 96)));
  }

  async read(record) {
    if (this.completeBuffer) {
      this.rangeCacheHits++;
      return this.completeBuffer.slice(record.byteOffset, record.byteOffset + record.byteLength);
    }
    const key = `${record.byteOffset}:${record.byteLength}`;
    const cached = this.rangeCache.get(key);
    if (cached) {
      this.rangeCacheHits++;
      this.rangeCache.delete(key);
      this.rangeCache.set(key, cached);
      return cached;
    }
    const pending = this.pendingRanges.get(key);
    if (pending) {
      this.rangeCacheHits++;
      return pending;
    }
    if (this.rangeCapability === null && this.capabilityProbe) {
      await this.capabilityProbe;
      return this.read(record);
    }
    const request = this.readRange(record, key);
    this.pendingRanges.set(key, request);
    const isCapabilityProbe = this.rangeCapability === null;
    if (isCapabilityProbe) this.capabilityProbe = request;
    try {
      return await request;
    } finally {
      if (this.pendingRanges.get(key) === request) this.pendingRanges.delete(key);
      if (isCapabilityProbe && this.capabilityProbe === request
        && this.rangeCapability === null) this.capabilityProbe = null;
    }
  }

  async readRange(record, key) {
    const end = record.byteOffset + record.byteLength - 1;
    this.networkRequests++;
    const response = await this.fetch(this.bundleUrl, {
      headers: { Range: `bytes=${record.byteOffset}-${end}` },
    });
    if (!response.ok) {
      throw new Error(`Terrain bundle request failed: ${response.status} ${this.bundleUrl}`);
    }
    const buffer = await response.arrayBuffer();
    this.networkBytes += buffer.byteLength;
    if (response.status === 200) {
      if (buffer.byteLength !== this.byteLength) {
        throw new RangeError("Terrain server ignored Range and returned an incomplete bundle.");
      }
      this.completeBuffer = buffer;
      this.rangeCapability = false;
      this.rangeCache.clear();
      return buffer.slice(record.byteOffset, record.byteOffset + record.byteLength);
    }
    if (response.status !== 206 || buffer.byteLength !== record.byteLength) {
      throw new RangeError("Terrain range response does not match its manifest record.");
    }
    this.rangeCapability = true;
    this.rangeCache.set(key, buffer);
    while (this.rangeCache.size > this.maximumCachedRanges) {
      this.rangeCache.delete(this.rangeCache.keys().next().value);
    }
    return buffer;
  }

  diagnostics() {
    return Object.freeze({
      networkRequests: this.networkRequests,
      networkBytes: this.networkBytes,
      cachedRanges: this.rangeCache.size,
      pendingRanges: this.pendingRanges.size,
      rangeCacheHits: this.rangeCacheHits,
      completeBundleFallback: this.completeBuffer !== null,
      rangeSupported: this.rangeCapability,
    });
  }
}

export function createTerrainMaterial(THREE, options = {}) {
  const illustrative = options.sceneryEra === "modern"
    || options.sceneryEra === "ukraine-modern";
  const ukraine = options.sceneryEra === "ukraine-modern";
  const material = new THREE.ShaderMaterial({
    name: "MAT_KOREA_CENTRAL_FRONT_TERRAIN",
    vertexShader: TERRAIN_VERTEX,
    fragmentShader: TERRAIN_FRAGMENT,
    // The winding leaves the sourced top surface front-facing with +Y normals (see the geometry
    // comment above), so single-siding it halves the dominant terrain fragment cost. The seam
    // skirts keep their own double-sided material via a geometry group.
    side: THREE.FrontSide,
    defines: {
      ...(illustrative ? { MODERN_SCENERY: 1 } : {}),
      ...(ukraine ? { UKRAINE_SCENERY: 1 } : {}),
    },
    uniforms: {
      uEarthRadiusM: { value: TERRAIN_EARTH_RADIUS_M },
      uCurvatureStartM: { value: TERRAIN_CURVATURE_START_M },
      uSunDirection: {
        value: (options.sunDirection ?? new THREE.Vector3(0.32, 0.78, -0.53)).clone().normalize(),
      },
      uFogColor: {
        value: new THREE.Color(options.fogColor ?? (ukraine ? 0xd2c4a8 : 0x6f8790)),
      },
      uFogDensity: { value: finite(options.fogDensity, ukraine ? 0.000052 : 0.000055) },
      uAtmosphereDensityScale: {
        value: ukraine ? UKRAINE_SOFT_WORLD_FOG_DENSITY_SCALE : 1,
      },
      uAtmosphereHazeColor: {
        value: new THREE.Color(...UKRAINE_SOFT_WORLD_HAZE_RGB),
      },
      uAtmosphereHazeMix: {
        value: ukraine ? UKRAINE_SOFT_WORLD_HAZE_MIX : 0,
      },
      // 0 = no edge bury. Set each frame from visibleWorldRadiusM so Shared/dogfight stream
      // discs haze out instead of reading as squares.
      uWorldEdgeM: { value: finite(options.worldEdgeM, 0) },
      uModernScenery: { value: illustrative ? 1 : 0 },
      // Full-detail parcel/cultivation tint only affects the period desktop treatment. Modern
      // shading discards periodLit, so skip its four otherwise invisible sin() calls there too.
      uParcelTint: {
        value: options.qualityTier === "desktop" && !illustrative ? 1 : 0,
      },
      // Darkest-slope lighting. The old 0.43 / 0.40 floors put every slope in the world inside the
      // top 60% of the value range, which is why densely dissected Korean terrain rendered as a
      // flat wash. Legibility now comes from value, and hue separation keeps dark slopes readable.
      // Ukraine soft-world lifts the floor so lee slopes stay painterly rather than crushed.
      uShadowFloor: { value: finite(options.shadowFloor, ukraine ? 0.20 : 0.12) },
      // Baked-occlusion multiplier at fully concave (x) and fully convex (y).
      uOcclusionRange: {
        value: new THREE.Vector2(
          finite(options.occlusionMin, ukraine ? 0.70 : 0.55),
          finite(options.occlusionMax, 1.10),
        ),
      },
      // Discrete aerial-perspective planes. Korea-modern keeps stronger banding; Ukraine softens
      // the posterization so distance reads as continuous atmosphere (ADR-0003).
      uHazeBands: { value: finite(options.hazeBands, ukraine ? 3 : 6) },
      uHazeBandBlend: { value: finite(options.hazeBandBlend, ukraine ? 0.18 : 0.65) },
      // Surface truth is opt-in and defaults to the existing snow-free presentation.
      uSnowCover01: { value: Math.max(0, Math.min(1, finite(options.snowCover01))) },
      uSnowWetness01: { value: Math.max(0, Math.min(1, finite(options.snowWetness01))) },
      uGlazeIce01: { value: Math.max(0, Math.min(1, finite(options.glazeIce01))) },
    },
  });
  // Non-Ukraine chunks skip the two-byte-per-vertex field entirely. A neutral default keeps
  // the shared shader valid if a presentation is restyled after its meshes are resident.
  material.defaultAttributeValues.landcover = [0.5, 0.5];
  return material;
}

// Companion material for the perimeter skirts only. It shares the surface material's uniforms
// object by reference, so every uniform update (fog, sun, era) reaches both with no extra work; it
// differs solely in rendering both faces so a seam skirt is never culled from the viewing side.
function createTerrainSkirtMaterial(THREE, surfaceMaterial) {
  const material = new THREE.ShaderMaterial({
    name: "MAT_KOREA_CENTRAL_FRONT_TERRAIN_SKIRT",
    vertexShader: TERRAIN_VERTEX,
    fragmentShader: TERRAIN_FRAGMENT,
    side: THREE.DoubleSide,
    defines: { ...surfaceMaterial.defines },
    uniforms: surfaceMaterial.uniforms,
  });
  material.defaultAttributeValues.landcover = [0.5, 0.5];
  return material;
}

function setTerrainMaterialEra(material, era) {
  const modern = era === "modern" || era === "ukraine-modern";
  const ukraine = era === "ukraine-modern";
  const wasModern = material.defines?.MODERN_SCENERY === 1;
  const wasUkraine = material.defines?.UKRAINE_SCENERY === 1;
  material.uniforms.uModernScenery.value = modern ? 1 : 0;
  if (modern === wasModern && ukraine === wasUkraine) return;
  material.defines = {
    ...(modern ? { MODERN_SCENERY: 1 } : {}),
    ...(ukraine ? { UKRAINE_SCENERY: 1 } : {}),
  };
  material.needsUpdate = true;
}

function setTerrainWinterSurface(material, snowCover01, snowWetness01, glazeIce01) {
  if (Number.isFinite(snowCover01)) {
    material.uniforms.uSnowCover01.value = Math.max(0, Math.min(1, snowCover01));
  }
  if (Number.isFinite(snowWetness01)) {
    material.uniforms.uSnowWetness01.value = Math.max(0, Math.min(1, snowWetness01));
  }
  if (Number.isFinite(glazeIce01)) {
    material.uniforms.uGlazeIce01.value = Math.max(0, Math.min(1, glazeIce01));
  }
}

function setApronWinterSurface(apron, snowCover01, snowWetness01, glazeIce01) {
  const materials = apron?.userData?.winterSurfaceMaterials;
  if (!Array.isArray(materials)) return;
  const snow = Math.max(0, Math.min(1, finite(snowCover01)));
  const wet = Math.max(0, Math.min(1, finite(snowWetness01)));
  const glaze = Math.max(0, Math.min(1, finite(glazeIce01)));
  const key = `${snow.toFixed(4)}:${wet.toFixed(4)}:${glaze.toFixed(4)}`;
  if (apron.userData.winterSurfaceKey === key) return;
  apron.userData.winterSurfaceKey = key;
  const snowColor = new apron.userData.THREE.Color(0xebe8d7)
    .lerp(new apron.userData.THREE.Color(0xb9c9cc), wet);
  const glazeColor = new apron.userData.THREE.Color(0xaac8d1);
  for (const material of materials) {
    material.color.copy(material.userData.clearSurfaceColor)
      .lerp(snowColor, snow)
      .lerp(glazeColor, glaze * (1 - snow * 0.7) * 0.42);
  }
}

function meshSceneryGroup(mesh) {
  return mesh?.children?.find((child) => child.userData?.scenery) ?? null;
}

function disposeMeshScenery(mesh) {
  if (!mesh) return;
  for (const child of [...mesh.children]) {
    if (child.userData?.scenery) disposeKoreaSceneryTile(child);
  }
  delete mesh.userData.scenery;
}

class TerrainChunkBuildScheduler {
  constructor(options = {}) {
    this.requestFrame = options.requestTerrainBuildFrame
      ?? globalThis.requestAnimationFrame?.bind(globalThis)
      ?? ((callback) => setTimeout(callback, 0));
    this.cancelFrame = options.cancelTerrainBuildFrame
      ?? globalThis.cancelAnimationFrame?.bind(globalThis)
      ?? clearTimeout;
    this.queue = [];
    this.nextSequence = 0;
    this.frameHandle = null;
    this.disposed = false;
  }

  enqueue(owner, priority, build, discard) {
    const work = {
      owner,
      priority,
      build,
      discard,
      sequence: this.nextSequence++,
    };
    if (this.disposed) {
      discard();
      return null;
    }
    this.queue.push(work);
    this.scheduleFrame();
    return work;
  }

  scheduleFrame() {
    if (this.disposed || this.frameHandle !== null || !this.queue.length) return;
    this.frameHandle = this.requestFrame(() => {
      this.frameHandle = null;
      try {
        this.buildNext();
      } finally {
        this.scheduleFrame();
      }
    });
  }

  buildNext() {
    if (this.disposed || !this.queue.length) return;
    this.queue.sort((left, right) => {
      const leftPriority = finite(left.priority(), Number.POSITIVE_INFINITY);
      const rightPriority = finite(right.priority(), Number.POSITIVE_INFINITY);
      return leftPriority - rightPriority || left.sequence - right.sequence;
    });
    this.queue.shift().build();
  }

  cancel(work) {
    if (!work) return false;
    const index = this.queue.indexOf(work);
    if (index < 0) return false;
    this.queue.splice(index, 1);
    work.discard();
    this.cancelFrameIfIdle();
    return true;
  }

  cancelOwner(owner) {
    const cancelled = this.queue.filter((work) => work.owner === owner);
    this.queue = this.queue.filter((work) => work.owner !== owner);
    for (const work of cancelled) work.discard();
    this.cancelFrameIfIdle();
  }

  cancelFrameIfIdle() {
    if (this.queue.length || this.frameHandle === null) return;
    this.cancelFrame(this.frameHandle);
    this.frameHandle = null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frameHandle !== null) this.cancelFrame(this.frameHandle);
    this.frameHandle = null;
    for (const work of this.queue.splice(0)) work.discard();
  }
}

/// A small pool of Workers that mesh terrain chunks off the render thread.
///
/// This is the fix for the dominant frame stall. One LOD0 chunk takes ~9.5 ms of pure array
/// arithmetic — 57% of a 60 fps frame — and the build scheduler above could only ever spread that
/// cost one chunk per animation frame, which turns a burst of streaming into a run of 33-50 ms
/// frames. Telemetry from a Build 112 sortie showed `geometries` going 88 -> 126 inside one five
/// second window with frame_ms_max at 217-400 ms, while triangles and draw calls barely moved:
/// the work was never on the GPU, so no amount of shedding pixels could reach it.
///
/// The pool is strictly an optimisation. Every failure mode — no Worker constructor (Node, older
/// embedders), a module that will not load, a runtime error mid-build — resolves to `null` and the
/// caller meshes synchronously exactly as before. Never let a worker failure fail a chunk.
class TerrainMeshWorkerPool {
  constructor(options = {}) {
    this.disposed = false;
    this.nextRequestId = 1;
    this.pending = new Map();
    this.workers = [];
    const createWorker = options.createTerrainMeshWorker ?? defaultTerrainMeshWorkerFactory();
    if (!createWorker) return;
    // Leave the render thread and the WASM sim their own cores. Terrain meshing is bursty, so two
    // or three workers drain a streaming burst quickly without starving the fight.
    const requested = Math.max(1, Math.min(3,
      Math.floor(finite(options.terrainMeshWorkerCount,
        (globalThis.navigator?.hardwareConcurrency ?? 4) - 2))));
    for (let index = 0; index < requested; index++) {
      try {
        const worker = createWorker();
        worker.onmessage = (event) => this.receive(worker, event.data);
        worker.onerror = () => this.retire(worker);
        worker.onmessageerror = () => this.retire(worker);
        this.workers.push({ worker, inFlight: 0 });
      } catch {
        break;
      }
    }
  }

  get available() {
    return !this.disposed && this.workers.length > 0;
  }

  get inFlight() {
    let total = 0;
    for (const slot of this.workers) total += slot.inFlight;
    return total;
  }

  /// Mesh one chunk off-thread. Resolves with the built arrays, or with `null` if the pool cannot
  /// service the request — in which case the caller must build it synchronously.
  build(boundsLocalM, decoded, sceneryPlanRequest = null) {
    if (!this.available) return Promise.resolve(null);
    let chosen = this.workers[0];
    for (const slot of this.workers) if (slot.inFlight < chosen.inFlight) chosen = slot;
    const id = this.nextRequestId++;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve, slot: chosen });
      chosen.inFlight++;
      try {
        // heights/water go as clones, not transfers: the caller keeps using them for scenery, and
        // a detached array would leave the fallback path with nothing to rebuild from.
        chosen.worker.postMessage({
          type: "build",
          id,
          boundsLocalM,
        heights: decoded.heights,
        water: decoded.water,
        sampleCount: decoded.sampleCount,
        includeLandcover: decoded.includeLandcover,
        sceneryPlanRequest,
      });
      } catch {
        this.settle(id, null);
        this.retire(chosen.worker);
      }
    });
  }

  receive(worker, message) {
    if (message?.type === "ready") return;
    if (!message || typeof message.id !== "number") return;
    this.settle(message.id, message.type === "built" ? message.built : null);
    if (message.type === "failed") this.retire(worker);
  }

  settle(id, built) {
    const request = this.pending.get(id);
    if (!request) return;
    this.pending.delete(id);
    request.slot.inFlight = Math.max(0, request.slot.inFlight - 1);
    request.resolve(built);
  }

  /// Drop a worker that has proved unusable and release everything queued on it to the synchronous
  /// path. A pool that shrinks to zero simply reports itself unavailable from then on.
  retire(worker) {
    const index = this.workers.findIndex((slot) => slot.worker === worker);
    if (index < 0) return;
    const [slot] = this.workers.splice(index, 1);
    for (const [id, request] of [...this.pending]) {
      if (request.slot !== slot) continue;
      this.pending.delete(id);
      request.resolve(null);
    }
    try {
      slot.worker.terminate();
    } catch {
      // A worker that cannot be terminated is already gone.
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const [, request] of this.pending) request.resolve(null);
    this.pending.clear();
    for (const slot of this.workers.splice(0)) {
      try {
        slot.worker.terminate();
      } catch {
        // Already gone.
      }
    }
  }
}

/// Module Workers exist in browsers and not in the Node test harness, and a bundler-less static
/// deploy needs the URL resolved against this module. Returning null puts every build back on the
/// synchronous path, which is correct rather than fatal.
function defaultTerrainMeshWorkerFactory() {
  if (typeof Worker !== "function") return null;
  let url;
  try {
    url = new URL("./terrain_mesh_worker.js", import.meta.url);
  } catch {
    return null;
  }
  return () => new Worker(url, { type: "module" });
}

class KoreaTerrainPresentation {
  constructor(THREE, manifest, reader, options) {
    this.THREE = THREE;
    this.manifest = manifest;
    this.reader = reader;
    this.qualityTier = options.qualityTier ?? "balanced";
    this.group = new THREE.Group();
    const ukraineTheatre = manifest.terrainId
      === "terrain.ukraine.soniachne-theatre.v2"
      || manifest.terrainId === "terrain.ukraine.soniachne-training.v1";
    this.group.name = options.groupName ?? (ukraineTheatre
      ? "UKRAINE_SONIACHNE_2030S_TERRAIN"
      : "KOREA_CENTRAL_FRONT_TERRAIN");
    // The detailed truth cell is deliberately compact. A bounded 4 km ring follows the exact
    // synthetic edge source and the same smooth blend as TrainingTerrainApronSurface before
    // reaching the 78 m far datum. It remains presentation-only and explicitly owns no targets,
    // obstacles or LZ truth; all authored mission geometry stays inside the detailed cell.
    // Match the Ukraine terrain FAMILY, not one exact id. This was pinned to
    // "terrain.ukraine.soniachne-training.v1"; the product was later renamed to
    // "...soniachne-theatre.v2" and this silently stopped matching, so the horizon apron was never
    // built at all. Without it visibleWorldRadiusM falls back to the 40 km chunk radius, fog closes
    // to 34 km, and beyond the streamed square there is simply no geometry — which is the reported
    // "flickering terrain with blue beyond the square". The blue was the sky showing through where
    // the ground should have been.
    //
    // Size the apron from the manifest bounds. Theatre.v2 is ±131 km; the old training constant
    // (±8.2 km) left the flat apron overlapping every streamed chunk and z-fighting at altitude.
    this.horizonApronCoreHalfSpanM = ukraineCoreHalfSpanFromManifest(manifest);
    this.horizonApron = /^terrain\.ukraine\./.test(String(manifest.terrainId ?? ""))
      ? createUkraineTrainingHorizonApron(THREE, this.horizonApronCoreHalfSpanM)
      : null;
    if (this.horizonApron) {
      this.group.add(this.horizonApron);
    }
    this.material = options.material ?? createTerrainMaterial(THREE, options);
    this.ownsMaterial = !options.material;
    this.horizonApron?.traverse?.((object) => {
      const objectMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of objectMaterials) {
        if (material) addUkraineSoftWorldFog(material, this.material.uniforms);
      }
    });
    this.skirtMaterial = options.skirtMaterial
      ?? createTerrainSkirtMaterial(THREE, this.material);
    this.ownsSkirtMaterial = !options.skirtMaterial;
    this.missionFeaturePack = options.missionFeaturePack ?? null;
    this.missionFeaturePackSha256 = String(options.missionFeaturePackSha256 ?? "");
    // Atlas pages intentionally do not receive the feature pack itself: doing so would instantiate
    // the authored clinic/LZ once per page. They do still need the parent's translated exclusion
    // zones so worker-prepared ambient scenery yields to that single atlas-root presentation.
    this.ambientExclusionZones = options.ambientExclusionZones
      ?? missionFeatureAmbientExclusionZones(this.missionFeaturePack);
    this.missionFeaturePresentation = this.missionFeaturePack
      ? createMissionFeaturePresentation(THREE, this.missionFeaturePack, {
        qualityTier: this.qualityTier,
        atmosphereUniforms: this.material.uniforms,
      })
      : null;
    if (this.missionFeaturePresentation?.group) {
      this.group.add(this.missionFeaturePresentation.group);
    }
    // Atlas pages share the parent's scenery runtime. Preserve its era when the child is created
    // so theatre-specific LOD policy (notably Ukraine's tight desktop LOD0 ring) is not silently
    // lost at the page boundary.
    this.sceneryEra = options.sceneryEra ?? options.sceneryRuntime?.era ?? null;
    this.ambientSceneryRadiusM = Number.isFinite(options.ambientSceneryRadiusM)
      ? Math.max(0, options.ambientSceneryRadiusM)
      : ambientSceneryRadiusM(this.qualityTier, this.sceneryEra);
    this.ambientSceneryBudgetLevel = Math.max(0,
      Math.min(2, Math.round(finite(options.ambientSceneryBudgetLevel))));
    this.terrainLandcoverEnabled = options.terrainLandcoverEnabled !== undefined
      ? options.terrainLandcoverEnabled === true
      : this.sceneryEra === "ukraine-modern"
        || /^terrain\.ukraine\./.test(String(manifest.terrainId ?? ""));
    this.ambientSceneryEnabled = this.sceneryEra !== null;
    this.sceneryRuntime = options.sceneryRuntime
      ?? (this.sceneryEra ? createKoreaSceneryRuntime(THREE, {
        era: this.sceneryEra,
        qualityTier: this.qualityTier,
        atmosphereUniforms: this.material.uniforms,
        ambientExclusionZones: this.ambientExclusionZones,
      }) : null);
    this.ownsSceneryRuntime = !options.sceneryRuntime && this.sceneryRuntime !== null;
    this.updatesSceneryRuntime = options.updateSceneryRuntime !== false;
    this.entries = new Map(manifest.chunks.map((chunk) => [chunk.id, {
      chunk,
      mesh: null,
      level: null,
      requestedLevel: null,
      requestToken: 0,
      error: null,
      normalBoundary: null,
      buildWork: null,
      priorityDistance: Number.POSITIVE_INFINITY,
      coverageDistance: Number.POSITIVE_INFINITY,
      sceneryDistance: Number.POSITIVE_INFINITY,
    }]));
    this.queue = [];
    this.activeLoads = 0;
    this.pendingBuilds = 0;
    this.maximumLoads = Math.max(1, Math.round(finite(options.maximumConcurrentLoads, 6)));
    this.buildScheduler = options.chunkBuildScheduler
      ?? new TerrainChunkBuildScheduler(options);
    this.ownsBuildScheduler = !options.chunkBuildScheduler;
    this.meshWorkers = options.terrainMeshWorkers
      ?? new TerrainMeshWorkerPool(options);
    this.ownsMeshWorkers = !options.terrainMeshWorkers;
    this.chunkLoadRadiusM = Number.isFinite(options.chunkLoadRadiusM)
      ? Math.max(0, options.chunkLoadRadiusM) : Number.POSITIVE_INFINITY;
    // Same contract as the atlas: the renderer clamps visibility to the world edge, and a
    // presentation that could not answer would silently opt out of that and show the boundary.
    this.chunkEvictRadiusM = Number.isFinite(options.chunkEvictRadiusM)
      ? Math.max(this.chunkLoadRadiusM, options.chunkEvictRadiusM)
      : Number.POSITIVE_INFINITY;
    this.disposed = false;
    this.worldEastM = 0;
    this.worldNorthM = 0;
    this.hasLocalCoverage = false;
    this.loadedBytes = 0;
    this.idleWaiters = [];
    this.ready = options.lazyChunks === true
      ? Promise.resolve([])
      : Promise.all(manifest.chunks.map((chunk) =>
        this.requestLevel(this.entries.get(chunk.id), chunk.lods.length - 1)));
  }

  requestLevel(entry, level) {
    if (this.disposed || entry.level === level && entry.mesh || entry.requestedLevel === level) {
      return Promise.resolve(entry.mesh);
    }
    if (entry.buildWork) this.buildScheduler.cancel(entry.buildWork);
    entry.requestedLevel = level;
    const token = ++entry.requestToken;
    return new Promise((resolve) => {
      this.queue.push({ entry, level, token, resolve });
      this.pump();
    });
  }

  pump() {
    while (!this.disposed && this.activeLoads < this.maximumLoads && this.queue.length) {
      const work = this.queue.shift();
      if (work.token !== work.entry.requestToken) {
        work.resolve(work.entry.mesh);
        continue;
      }
      this.activeLoads++;
      void this.load(work).finally(() => {
        this.activeLoads--;
        this.pump();
        this.resolveIdleWaiters();
      });
    }
    this.resolveIdleWaiters();
  }

  resolveIdleWaiters() {
    if (this.activeLoads || this.queue.length || this.pendingBuilds) return;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }

  whenIdle() {
    if (!this.activeLoads && !this.queue.length && !this.pendingBuilds) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  replaceSceneryRuntime(runtime, ownsRuntime = false) {
    if (this.disposed || runtime === this.sceneryRuntime) return Promise.resolve([]);
    const previousRuntime = this.sceneryRuntime;
    const disposePrevious = this.ownsSceneryRuntime;
    this.sceneryRuntime = runtime;
    this.ownsSceneryRuntime = ownsRuntime;
    const replacements = [];
    for (const entry of this.entries.values()) {
      const mesh = entry.mesh;
      const level = entry.level;
      if (!mesh || !Number.isInteger(level)) continue;
      disposeMeshScenery(mesh);
      if (!runtime) continue;
      const record = entry.chunk.lods[level];
      replacements.push(this.reader.read(record).then((buffer) => {
        if (this.disposed || this.sceneryRuntime !== runtime
          || entry.mesh !== mesh || entry.level !== level) return null;
        const decoded = decodeTerrainRecord(buffer, record, this.manifest.quantization);
        const scenery = runtime.createTile(entry.chunk, decoded, level);
        if (!scenery) return null;
        applyKoreaSceneryBudgetLevel(scenery, this.ambientSceneryBudgetLevel);
        scenery.visible = entry.sceneryDistance <= this.ambientSceneryRadiusM;
        mesh.add(scenery);
        mesh.userData.scenery = scenery.userData.scenery;
        return scenery;
      }).catch((error) => {
        if (!this.disposed && entry.mesh === mesh) {
          entry.error = String(error?.message ?? error);
        }
        return null;
      }));
    }
    if (disposePrevious) previousRuntime?.dispose();
    return Promise.all(replacements);
  }

  get streamingRadiusM() {
    return this.chunkLoadRadiusM;
  }

  /// Where the world VISUALLY stops for fog. The Ukraine apron sits at the theatre edge
  /// (±131 km for v2), not at the streamed disc. Opening fog to 560 km while only streaming
  /// 12–48 km leaves a sky hole between the last chunk and the apron — a dead-straight square
  /// in clear air. Keep fog on the streamed radius until chunks reach the apron; then fog may
  /// open so the apron can carry the far horizon (Rapier ~145 km stream).
  get visibleWorldRadiusM() {
    if (!this.horizonApron) return this.chunkLoadRadiusM;
    if (this.chunkLoadRadiusM + UKRAINE_TRAINING_APRON_TRANSITION_M
        >= this.horizonApronCoreHalfSpanM) {
      return UKRAINE_TRAINING_HORIZON_HALF_SPAN_M;
    }
    return this.chunkLoadRadiusM;
  }

  setStreamingRadiusM(loadRadiusM) {
    if (this.disposed || !Number.isFinite(loadRadiusM) || loadRadiusM <= 0) return false;
    const previous = this.chunkLoadRadiusM;
    this.chunkLoadRadiusM = Math.max(0, loadRadiusM);
    const representativeSpanM = Math.max(1, ...this.manifest.chunks.map((chunk) =>
      Math.max(
        chunk.boundsLocalM[2] - chunk.boundsLocalM[0],
        chunk.boundsLocalM[3] - chunk.boundsLocalM[1],
      )));
    this.chunkEvictRadiusM = Math.max(
      this.chunkLoadRadiusM + representativeSpanM,
      this.chunkLoadRadiusM * 1.25,
    );
    return this.chunkLoadRadiusM !== previous;
  }

  setSceneryEra(era) {
    if (this.disposed || era === this.sceneryEra) return Promise.resolve([]);
    this.sceneryEra = era;
    this.ambientSceneryRadiusM = ambientSceneryRadiusM(this.qualityTier, era);
    this.ambientSceneryEnabled = era !== null;
    const runtime = era ? createKoreaSceneryRuntime(this.THREE, {
      era,
      qualityTier: this.qualityTier,
      atmosphereUniforms: this.material.uniforms,
      ambientExclusionZones: this.ambientExclusionZones,
    }) : null;
    setTerrainMaterialEra(this.material, era);
    setTerrainMaterialEra(this.skirtMaterial, era);
    this.material.uniforms.uParcelTint.value =
      this.qualityTier === "desktop" && !["modern", "ukraine-modern"].includes(era) ? 1 : 0;
    return this.replaceSceneryRuntime(runtime, runtime !== null);
  }

  setAmbientSceneryBudgetLevel(level = 0) {
    if (this.disposed) return false;
    const next = Math.max(0, Math.min(2, Math.round(finite(level))));
    if (next === this.ambientSceneryBudgetLevel) return false;
    this.ambientSceneryBudgetLevel = next;
    for (const entry of this.entries.values()) {
      const scenery = meshSceneryGroup(entry.mesh);
      if (scenery) applyKoreaSceneryBudgetLevel(scenery, next);
    }
    return true;
  }

  // High-altitude sorties retain the Ukraine material's macro fields and relief while shedding
  // individual ambient trees/buildings/lines. This is intentionally separate from setSceneryEra:
  // changing the era would recolour the theatre back into a different world.
  disableAmbientScenery() {
    if (this.disposed || !this.sceneryRuntime) return Promise.resolve([]);
    this.ambientSceneryEnabled = false;
    return this.replaceSceneryRuntime(null, false);
  }

  enableAmbientScenery() {
    if (this.disposed || this.sceneryRuntime || !this.sceneryEra) return Promise.resolve([]);
    this.ambientSceneryEnabled = true;
    const runtime = createKoreaSceneryRuntime(this.THREE, {
      era: this.sceneryEra,
      qualityTier: this.qualityTier,
      atmosphereUniforms: this.material.uniforms,
      ambientExclusionZones: this.ambientExclusionZones,
    });
    return this.replaceSceneryRuntime(runtime, true);
  }

  async load(work) {
    const { entry, level, token, resolve } = work;
    const record = entry.chunk.lods[level];
    try {
      const buffer = await this.reader.read(record);
      if (this.disposed || token !== entry.requestToken) {
        resolve(entry.mesh);
        return;
      }
      const decoded = decodeTerrainRecord(buffer, record, this.manifest.quantization);
      decoded.includeLandcover = this.terrainLandcoverEnabled;
      work.buildPending = true;
      this.pendingBuilds++;
      // Mesh off-thread when a worker pool is up. `meshed` is null whenever that is not possible,
      // and the scheduled job below then does the identical arithmetic inline — the pool changes
      // WHERE the ~9.5 ms is spent, never WHETHER the chunk appears.
      const maximumSceneryLevel = this.qualityTier === "desktop" ? 0 : 1;
      const sceneryPlanRequest = this.sceneryRuntime && level <= maximumSceneryLevel
        ? {
          chunk: {
            id: entry.chunk.id,
            boundsLocalM: entry.chunk.boundsLocalM,
            generation: entry.chunk.generation,
          },
          options: {
            era: this.sceneryEra,
            qualityTier: this.qualityTier,
            ring: level >= 1 ? "mid" : "near",
            ambientExclusionZones: this.ambientExclusionZones,
          },
        }
        : null;
      const meshed = await this.meshWorkers.build(
        entry.chunk.boundsLocalM,
        decoded,
        sceneryPlanRequest,
      );
      if (this.disposed || token !== entry.requestToken) {
        this.finishBuild(work);
        return;
      }
      let scheduled = null;
      scheduled = this.buildScheduler.enqueue(
        this,
        () => entry.priorityDistance,
        () => {
          if (entry.buildWork === scheduled) entry.buildWork = null;
          this.build(work, decoded, meshed);
        },
        () => {
          if (entry.buildWork === scheduled) entry.buildWork = null;
          this.finishBuild(work);
        },
      );
      entry.buildWork = scheduled;
    } catch (error) {
      if (token === entry.requestToken) {
        entry.requestedLevel = null;
        entry.error = String(error?.message ?? error);
      }
      resolve(entry.mesh);
    }
  }

  build(work, decoded, meshed = null) {
    const { entry, level, token } = work;
    const record = entry.chunk.lods[level];
    try {
      if (this.disposed || token !== entry.requestToken
        || entry.mesh && entry.level === level) return;
      const built = meshed
        ? assembleTerrainGeometry(this.THREE, meshed)
        : createTerrainGeometry(this.THREE, entry.chunk, decoded);
      const mesh = new this.THREE.Mesh(built.geometry,
        [this.material, this.skirtMaterial]);
      mesh.name = `TERRAIN_${entry.chunk.id.toUpperCase()}_LOD${level}`;
      mesh.position.set(built.centreEast, 0, -built.centreNorth);
      mesh.userData.terrain = Object.freeze({
        chunkId: entry.chunk.id,
        level,
        triangles: built.triangleCount,
        spacingM: record.spacingM,
      });
      const scenery = this.sceneryRuntime?.createTile(
        entry.chunk,
        decoded,
        level,
        meshed?.sceneryPlan,
      );
      if (scenery) {
        applyKoreaSceneryBudgetLevel(scenery, this.ambientSceneryBudgetLevel);
        scenery.visible = entry.sceneryDistance <= this.ambientSceneryRadiusM;
        mesh.add(scenery);
        mesh.userData.scenery = scenery.userData.scenery;
      }
      mesh.frustumCulled = true;
      const previous = entry.mesh;
      entry.mesh = mesh;
      entry.level = level;
      entry.requestedLevel = null;
      entry.error = null;
      entry.normalBoundary = built.normalBoundary;
      this.loadedBytes += record.byteLength;
      this.group.add(mesh);
      if (previous) {
        disposeMeshScenery(previous);
        previous.removeFromParent();
        previous.geometry.dispose();
      }
      this.reconcileLoadedBoundaryNormals();
    } catch (error) {
      if (token === entry.requestToken) {
        entry.requestedLevel = null;
        entry.error = String(error?.message ?? error);
      }
    } finally {
      this.finishBuild(work);
    }
  }

  finishBuild(work) {
    if (!work.buildPending) return;
    work.buildPending = false;
    this.pendingBuilds--;
    work.resolve(work.entry.mesh);
    this.resolveIdleWaiters();
  }

  reconcileLoadedBoundaryNormals() {
    const verticesByPosition = new Map();
    const touchedAttributes = new Set();
    for (const entry of this.entries.values()) {
      const mesh = entry.mesh;
      const boundary = entry.normalBoundary;
      if (!mesh || !boundary || !Number.isInteger(entry.level)) continue;
      const positions = mesh.geometry.getAttribute("position");
      const normals = mesh.geometry.getAttribute("normal");
      touchedAttributes.add(normals);
      for (let boundaryIndex = 0; boundaryIndex < boundary.indices.length; boundaryIndex++) {
        const vertexIndex = boundary.indices[boundaryIndex];
        const offset = boundaryIndex * 3;
        const nx = boundary.normals[offset];
        const ny = boundary.normals[offset + 1];
        const nz = boundary.normals[offset + 2];
        normals.setXYZ(vertexIndex, nx, ny, nz);
        const eastM = mesh.position.x + positions.getX(vertexIndex);
        const renderNorthM = mesh.position.z + positions.getZ(vertexIndex);
        const key = `${entry.level}:${eastM}:${renderNorthM}`;
        const shared = verticesByPosition.get(key) ?? [];
        shared.push({ normals, vertexIndex, nx, ny, nz });
        verticesByPosition.set(key, shared);
      }
    }
    for (const shared of verticesByPosition.values()) {
      if (shared.length < 2) continue;
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (const vertex of shared) {
        nx += vertex.nx;
        ny += vertex.ny;
        nz += vertex.nz;
      }
      const length = Math.hypot(nx, ny, nz);
      if (length <= Number.EPSILON) continue;
      nx /= length;
      ny /= length;
      nz /= length;
      for (const vertex of shared) {
        vertex.normals.setXYZ(vertex.vertexIndex, nx, ny, nz);
      }
    }
    for (const attribute of touchedAttributes) attribute.needsUpdate = true;
  }

  evictEntry(entry) {
    if (!entry.mesh && entry.requestedLevel === null) return;
    if (entry.buildWork) this.buildScheduler.cancel(entry.buildWork);
    entry.requestToken++;
    entry.requestedLevel = null;
    disposeMeshScenery(entry.mesh);
    entry.mesh?.geometry.dispose();
    entry.mesh?.removeFromParent();
    entry.mesh = null;
    entry.level = null;
    entry.normalBoundary = null;
  }

  setPlacement(eastM = 0, northM = 0) {
    const nextEastM = finite(eastM);
    const nextNorthM = finite(northM);
    if (nextEastM !== this.worldEastM || nextNorthM !== this.worldNorthM) {
      // Until update supplies a camera in the new placement, resident chunks describe the old
      // mission's coverage and must not make a location-local warmup look complete.
      this.hasLocalCoverage = false;
    }
    this.worldEastM = nextEastM;
    this.worldNorthM = nextNorthM;
    this.group.position.set(this.worldEastM, 0, -this.worldNorthM);
  }

  update({ cameraPosition, streamPosition, elapsedSeconds, windX, windZ, fogColor, fogDensity,
    sunDirection, snowCover01, snowWetness01, glazeIce01,
    cameraAglM, placementEastM, placementNorthM } = {}) {
    if (this.disposed) return;
    if (placementEastM !== undefined || placementNorthM !== undefined) {
      this.setPlacement(placementEastM ?? this.worldEastM, placementNorthM ?? this.worldNorthM);
    }
    if (this.updatesSceneryRuntime) {
      this.sceneryRuntime?.update({
        elapsedSeconds,
        windX,
        windZ,
        cameraPosition,
        cameraAglM,
        placementEastM: this.worldEastM,
        placementNorthM: this.worldNorthM,
      });
    }
    if (fogColor) this.material.uniforms.uFogColor.value.copy(fogColor);
    if (Number.isFinite(fogDensity)) this.material.uniforms.uFogDensity.value = fogDensity;
    if (Number.isFinite(this.visibleWorldRadiusM) && this.visibleWorldRadiusM > 0) {
      this.material.uniforms.uWorldEdgeM.value = this.visibleWorldRadiusM;
    }
    if (sunDirection) this.material.uniforms.uSunDirection.value.copy(sunDirection).normalize();
    setTerrainWinterSurface(this.material, snowCover01, snowWetness01, glazeIce01);
    setApronWinterSurface(this.horizonApron, snowCover01, snowWetness01, glazeIce01);
    if (!cameraPosition) return;

    const requests = [];
    const priorityPosition = streamPosition ?? cameraPosition;
    const cameraEastM = cameraPosition.x - this.worldEastM;
    const cameraNorthM = -cameraPosition.z - this.worldNorthM;
    const streamEastM = priorityPosition.x - this.worldEastM;
    const streamNorthM = -priorityPosition.z - this.worldNorthM;
    for (const entry of this.entries.values()) {
      const bounds = entry.chunk.boundsLocalM;
      // Residency is distance to the tile footprint, not its centre. Macro chunks are up to
      // 65.5 km wide, so a 12 km streaming radius must still load the chunk directly under the
      // aircraft even when its centre is tens of kilometres away.
      const cameraDistance = distanceToBounds(cameraEastM, cameraNorthM, bounds);
      const streamDistance = distanceToBounds(streamEastM, streamNorthM, bounds);
      const distance = Math.min(cameraDistance, streamDistance);
      entry.priorityDistance = distance;
      entry.coverageDistance = distance;
      const heightRecord = entry.chunk.lods[entry.level ?? 0] ?? entry.chunk.lods[0];
      const terrainTopM = finite(heightRecord?.maximumHeightM, finite(cameraPosition.y));
      const cameraAglM = Math.max(0, finite(cameraPosition.y) - terrainTopM);
      entry.sceneryDistance = Math.hypot(
        cameraDistance,
        cameraAglM * AMBIENT_SCENERY_ALTITUDE_WEIGHT,
      );
      const scenery = meshSceneryGroup(entry.mesh);
      if (scenery) {
        const thresholdM = Number.isFinite(this.ambientSceneryRadiusM)
          ? this.ambientSceneryRadiusM * (scenery.visible === false
            ? 1 - AMBIENT_SCENERY_HYSTERESIS
            : 1 + AMBIENT_SCENERY_HYSTERESIS)
          : Number.POSITIVE_INFINITY;
        scenery.visible = entry.sceneryDistance <= thresholdM;
      }
      if (distance > this.chunkEvictRadiusM) {
        this.evictEntry(entry);
        continue;
      }
      if (distance > this.chunkLoadRadiusM) continue;
      // Screen-space terrain error depends on slant range, not only the camera's ground
      // projection. Weight altitude so a Rapier at 12-22 km does not draw the 32 m hero mesh while
      // the macro theatre underneath is hundreds of kilometres wide.
      const lodDistance = Math.hypot(
        distance,
        Math.max(0, finite(cameraPosition.y)) * TERRAIN_ALTITUDE_LOD_WEIGHT,
      );
      const lodTier = this.qualityTier === "desktop" && this.sceneryEra === "ukraine-modern"
        ? "ukraine-desktop"
        : this.qualityTier;
      const level = selectTerrainLod(lodDistance, lodTier,
        entry.chunk.lods.length, entry.level);
      if (level !== entry.level && level !== entry.requestedLevel) {
        requests.push({ entry, level, distance });
      }
    }
    requests.sort((left, right) => left.distance - right.distance);
    for (const request of requests) this.requestLevel(request.entry, request.level);
    this.hasLocalCoverage = true;
  }

  diagnostics() {
    const levels = {};
    let errors = 0;
    let residentChunks = 0;
    let sceneryChunks = 0;
    let visibleSceneryChunks = 0;
    let localResidentChunks = 0;
    let localSceneryChunks = 0;
    for (const entry of this.entries.values()) {
      const key = entry.level === null ? "pending" : `lod${entry.level}`;
      levels[key] = (levels[key] ?? 0) + 1;
      if (entry.mesh) residentChunks++;
      if (entry.mesh?.userData?.scenery) sceneryChunks++;
      if (meshSceneryGroup(entry.mesh)?.visible !== false) {
        if (entry.mesh?.userData?.scenery) visibleSceneryChunks++;
      }
      const locallyCovered = this.hasLocalCoverage
        && Number.isFinite(entry.coverageDistance)
        && entry.coverageDistance <= this.chunkLoadRadiusM;
      if (entry.mesh && locallyCovered) localResidentChunks++;
      if (entry.mesh?.userData?.scenery && locallyCovered) localSceneryChunks++;
      if (entry.error) errors++;
    }
    return Object.freeze({
      terrainId: this.manifest.terrainId,
      qualityTier: this.qualityTier,
      sceneryEra: this.sceneryEra,
      ambientSceneryEnabled: this.ambientSceneryEnabled,
      placementEastM: this.worldEastM,
      placementNorthM: this.worldNorthM,
      chunks: this.entries.size,
      residentChunks,
      sceneryChunks,
      visibleSceneryChunks,
      localResidentChunks,
      localSceneryChunks,
      ambientSceneryRadiusM: this.ambientSceneryRadiusM,
      ambientSceneryBudgetLevel: this.ambientSceneryBudgetLevel,
      levels: Object.freeze(levels),
      activeLoads: this.activeLoads,
      queuedLoads: this.queue.length,
      queuedBuilds: this.pendingBuilds,
      loadedBytes: this.loadedBytes,
      transfer: this.reader.diagnostics(),
      horizonApron: this.horizonApron !== null,
      missionFeaturePackId: this.missionFeaturePack?.featurePackId ?? null,
      missionFeaturePackSha256: this.missionFeaturePackSha256 || null,
      missionFeatures: this.missionFeaturePresentation?.diagnostics?.() ?? null,
      errors,
      disposed: this.disposed,
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const work of this.queue.splice(0)) work.resolve(work.entry.mesh);
    this.buildScheduler.cancelOwner(this);
    for (const entry of this.entries.values()) {
      entry.requestToken++;
      disposeMeshScenery(entry.mesh);
      entry.mesh?.geometry.dispose();
      entry.mesh?.removeFromParent();
      entry.mesh = null;
      entry.normalBoundary = null;
    }
    this.resolveIdleWaiters();
    if (this.ownsSceneryRuntime) this.sceneryRuntime?.dispose();
    if (this.ownsMaterial) this.material.dispose();
    if (this.ownsSkirtMaterial) this.skirtMaterial.dispose();
    if (this.ownsBuildScheduler) this.buildScheduler.dispose();
    if (this.ownsMeshWorkers) this.meshWorkers.dispose();
    this.missionFeaturePresentation?.dispose?.();
    this.missionFeaturePresentation = null;
    const apronGeometries = new Set();
    const apronMaterials = new Set();
    this.horizonApron?.traverse?.((object) => {
      if (object.geometry) apronGeometries.add(object.geometry);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) if (material) apronMaterials.add(material);
    });
    for (const geometry of apronGeometries) geometry.dispose();
    for (const material of apronMaterials) material.dispose();
    this.horizonApron = null;
    this.group.removeFromParent();
  }
}

function versionedAssetUrl(uri, baseUrl, sha256) {
  const result = new URL(uri, baseUrl);
  if (result.origin === new URL(baseUrl).origin && /^[0-9a-f]{64}$/.test(sha256)) {
    result.searchParams.set("sha256", sha256);
  }
  return result.href;
}

class KoreaTerrainAtlasPresentation {
  constructor(THREE, manifest, manifestUrl, options) {
    this.THREE = THREE;
    this.manifest = manifest;
    this.manifestUrl = manifestUrl;
    // Same receiver trap as TerrainBundleReader: `this.fetch(url)` would bind the atlas instance
    // into native window.fetch and fail every page load with "Illegal invocation".
    const fetchImpl = options.fetch ?? fetch;
    this.fetch = (...args) => fetchImpl(...args);
    this.qualityTier = options.qualityTier ?? "balanced";
    const tierStreaming = TIER_STREAMING[this.qualityTier] ?? TIER_STREAMING.balanced;
    const thresholds = TIER_DISTANCE_METRES[this.qualityTier] ?? TIER_DISTANCE_METRES.balanced;
    const defaultLoadRadiusM = thresholds.at(-1) + manifest.tileSpanM * Math.SQRT2;
    this.chunkLoadRadiusM = Math.max(0,
      finite(options.chunkLoadRadiusM, manifest.streaming?.chunkLoadRadiusM ?? defaultLoadRadiusM));
    this.chunkEvictRadiusM = Math.max(this.chunkLoadRadiusM,
      finite(options.chunkEvictRadiusM,
        manifest.streaming?.chunkEvictRadiusM ?? this.chunkLoadRadiusM + 24_000));
    this.pageLoadRadiusM = Math.max(this.chunkLoadRadiusM,
      finite(options.pageLoadRadiusM,
        manifest.streaming?.pageLoadRadiusM ?? this.chunkLoadRadiusM));
    this.pageEvictRadiusM = Math.max(this.pageLoadRadiusM,
      finite(options.pageEvictRadiusM,
        manifest.streaming?.pageEvictRadiusM ?? this.chunkEvictRadiusM + 32_000));
    // Preserve the atlas author's prefetch/eviction hysteresis when the public radius changes.
    // These are relative margins, not absolute floors: an adaptive 12 km radius must not leave
    // page loading pinned to a prior 112 km mission radius.
    this.chunkEvictLeadM = Math.max(0, this.chunkEvictRadiusM - this.chunkLoadRadiusM);
    this.pageLoadLeadM = Math.max(0, this.pageLoadRadiusM - this.chunkLoadRadiusM);
    this.pageEvictLeadM = Math.max(0, this.pageEvictRadiusM - this.pageLoadRadiusM);
    this.lookAheadSeconds = Math.max(0,
      finite(options.lookAheadSeconds,
        manifest.streaming?.lookAheadSeconds ?? tierStreaming.lookAheadSeconds));
    this.maximumPageLoads = Math.max(1, Math.round(finite(options.maximumPageLoads,
      tierStreaming.pageLoads)));
    // The public option is a theatre-wide concurrency budget. Dividing it across concurrently
    // active pages prevents a desktop atlas from multiplying six reads by three page loaders.
    this.maximumChunkLoads = Math.max(1,
      Math.round(finite(options.maximumConcurrentLoads, 6)));
    this.maximumChunkLoadsPerPage = Math.max(1,
      Math.floor(this.maximumChunkLoads / this.maximumPageLoads));
    this.maximumCachedRanges = Math.max(1,
      Math.round(finite(options.maximumCachedRanges, 8)));
    this.buildScheduler = new TerrainChunkBuildScheduler(options);
    // One pool for the whole atlas. Workers are expensive to spin up and the pages share a
    // single render thread to protect, so pooling them here matches the build scheduler.
    this.meshWorkers = new TerrainMeshWorkerPool(options);
    this.sceneryEra = options.sceneryEra ?? manifest.scenery?.defaultProfile ?? null;
    this.ambientSceneryRadiusM = Number.isFinite(options.ambientSceneryRadiusM)
      ? Math.max(0, options.ambientSceneryRadiusM)
      : ambientSceneryRadiusM(this.qualityTier, this.sceneryEra);
    this.ambientSceneryBudgetLevel = Math.max(0,
      Math.min(2, Math.round(finite(options.ambientSceneryBudgetLevel))));
    this.ambientSceneryEnabled = this.sceneryEra !== null;
    this.group = new THREE.Group();
    const ukraineAtlas = /^terrain\.ukraine\./.test(String(manifest.terrainId ?? ""));
    this.group.name = ukraineAtlas
      ? "UKRAINE_RAPIER_RANGE_TERRAIN_ATLAS"
      : "KOREA_PENINSULA_TERRAIN_ATLAS";
    this.material = createTerrainMaterial(THREE, { ...options, sceneryEra: this.sceneryEra });
    this.skirtMaterial = createTerrainSkirtMaterial(THREE, this.material);
    this.missionFeaturePack = options.missionFeaturePack ?? null;
    this.missionFeaturePackSha256 = String(options.missionFeaturePackSha256 ?? "");
    this.ambientExclusionZones = missionFeatureAmbientExclusionZones(
      this.missionFeaturePack,
    );
    this.missionFeaturePresentation = this.missionFeaturePack
      ? createMissionFeaturePresentation(THREE, this.missionFeaturePack, {
        qualityTier: this.qualityTier,
        atmosphereUniforms: this.material.uniforms,
      })
      : null;
    if (this.missionFeaturePresentation?.group) {
      this.group.add(this.missionFeaturePresentation.group);
    }
    this.sceneryRuntime = this.sceneryEra
      ? createKoreaSceneryRuntime(THREE, {
        era: this.sceneryEra,
        qualityTier: this.qualityTier,
        atmosphereUniforms: this.material.uniforms,
        ambientExclusionZones: this.ambientExclusionZones,
      })
      : null;
    this.pages = new Map(manifest.pages.map((page) => [page.id, {
      descriptor: page,
      presentation: null,
      pending: null,
      queued: false,
      generation: 0,
      error: null,
    }]));
    this.pageQueue = [];
    this.activePageLoads = 0;
    this.idleWaiters = [];
    this.disposed = false;
    this.worldEastM = 0;
    this.worldNorthM = 0;
    this.hasLocalCoverage = false;
    this.previousCameraLocal = null;
    this.lastUpdate = null;
    this.loadedPageManifests = 0;
    this.ready = Promise.resolve([]);
  }

  setPlacement(eastM = 0, northM = 0) {
    const nextEastM = finite(eastM);
    const nextNorthM = finite(northM);
    if (nextEastM !== this.worldEastM || nextNorthM !== this.worldNorthM) {
      this.hasLocalCoverage = false;
      this.previousCameraLocal = null;
      this.lastUpdate = null;
    }
    this.worldEastM = nextEastM;
    this.worldNorthM = nextNorthM;
    this.group.position.set(this.worldEastM, 0, -this.worldNorthM);
  }

  /// Shrink or restore the streaming radius at runtime.
  ///
  /// Terrain chunk builds are the dominant frame cost in a real sortie: the scheduler already
  /// limits itself to ONE chunk per animation frame, but a single LOD0 chunk costs roughly 9.5 ms
  /// to build synchronously — 57% of a 60 fps budget — so a burst of streaming turns into a run of
  /// 33-50 ms frames no matter how few triangles are on screen. Measured in production: a window
  /// where live geometries jumped 88 -> 126 is exactly where the long frames began, while draw
  /// calls and triangle counts were indistinguishable between a 60 fps window and an 11 fps one.
  ///
  /// Fewer chunks in flight is therefore the lever that actually works, and shedding view distance
  /// before pixels is the right order: blur and haze are survivable, stutter is not.
  /// How far the world actually extends right now. The renderer needs this to keep FOG honest:
  /// visibility and streamed radius are ONE knob, not two. Shedding the radius without closing the
  /// haze leaves the terrain ending at a dead-straight chunk boundary in clear air — the pilot
  /// filed it as "still getting some z buffer issues I think", and it is not a depth artefact at
  /// all, it is the edge of the loaded world with nothing drawn over it.
  get streamingRadiusM() {
    return this.chunkLoadRadiusM;
  }

  /// Atlas pages own their own aprons; fog still follows the streamed disc unless a page has
  /// already reached the theatre apron (same contract as KoreaTerrainPresentation).
  get visibleWorldRadiusM() {
    const core = ukraineCoreHalfSpanFromManifest(this.manifest);
    const ukraineAtlas = /^terrain\.ukraine\./.test(String(this.manifest.terrainId ?? ""));
    if (!ukraineAtlas) return this.chunkLoadRadiusM;
    if (this.chunkLoadRadiusM + UKRAINE_TRAINING_APRON_TRANSITION_M >= core) {
      return UKRAINE_TRAINING_HORIZON_HALF_SPAN_M;
    }
    return this.chunkLoadRadiusM;
  }

  setStreamingRadiusM(loadRadiusM) {
    if (this.disposed || !Number.isFinite(loadRadiusM) || loadRadiusM <= 0) return false;
    const previous = this.chunkLoadRadiusM;
    this.chunkLoadRadiusM = Math.max(0, loadRadiusM);
    // Keep eviction outside loading or chunks would be dropped the instant they arrive and
    // rebuilt immediately — the worst possible outcome for the cost this exists to avoid.
    this.chunkEvictRadiusM = Math.max(
      this.chunkLoadRadiusM + this.chunkEvictLeadM,
      this.chunkLoadRadiusM * 1.25,
    );
    // Page and child radii must move with the public atlas radius. The previous monotonic `max`
    // made the frame governor cosmetic after a page had loaded: the atlas reported 12 km while
    // its page presentations kept streaming and drawing the old 48–112 km disc.
    this.pageLoadRadiusM = this.chunkLoadRadiusM + this.pageLoadLeadM;
    this.pageEvictRadiusM = this.pageLoadRadiusM + this.pageEvictLeadM;
    for (const state of this.pages.values()) {
      state.presentation?.setStreamingRadiusM(this.chunkLoadRadiusM);
    }
    return this.chunkLoadRadiusM !== previous;
  }
  setSceneryEra(era) {
    if (this.disposed || era === this.sceneryEra) return Promise.resolve([]);
    const runtime = era ? createKoreaSceneryRuntime(this.THREE, {
      era,
      qualityTier: this.qualityTier,
      atmosphereUniforms: this.material.uniforms,
      ambientExclusionZones: this.ambientExclusionZones,
    }) : null;
    const previousRuntime = this.sceneryRuntime;
    this.sceneryEra = era;
    this.ambientSceneryRadiusM = ambientSceneryRadiusM(this.qualityTier, era);
    this.ambientSceneryEnabled = era !== null;
    this.sceneryRuntime = runtime;
    setTerrainMaterialEra(this.material, era);
    setTerrainMaterialEra(this.skirtMaterial, era);
    this.material.uniforms.uParcelTint.value =
      this.qualityTier === "desktop" && !["modern", "ukraine-modern"].includes(era) ? 1 : 0;
    const replacements = [];
    for (const state of this.pages.values()) {
      if (state.presentation) {
        state.presentation.sceneryEra = era;
        state.presentation.ambientSceneryRadiusM = this.ambientSceneryRadiusM;
        replacements.push(state.presentation.replaceSceneryRuntime(runtime, false));
      }
    }
    previousRuntime?.dispose();
    return Promise.all(replacements);
  }

  setAmbientSceneryBudgetLevel(level = 0) {
    if (this.disposed) return false;
    const next = Math.max(0, Math.min(2, Math.round(finite(level))));
    if (next === this.ambientSceneryBudgetLevel) return false;
    this.ambientSceneryBudgetLevel = next;
    for (const state of this.pages.values()) {
      state.presentation?.setAmbientSceneryBudgetLevel(next);
    }
    return true;
  }

  disableAmbientScenery() {
    if (this.disposed || !this.sceneryRuntime) return Promise.resolve([]);
    this.ambientSceneryEnabled = false;
    const previousRuntime = this.sceneryRuntime;
    this.sceneryRuntime = null;
    const replacements = [];
    for (const state of this.pages.values()) {
      if (state.presentation) {
        replacements.push(state.presentation.replaceSceneryRuntime(null, false));
      }
    }
    previousRuntime.dispose();
    return Promise.all(replacements);
  }

  enableAmbientScenery() {
    if (this.disposed || this.sceneryRuntime || !this.sceneryEra) return Promise.resolve([]);
    const runtime = createKoreaSceneryRuntime(this.THREE, {
      era: this.sceneryEra,
      qualityTier: this.qualityTier,
      atmosphereUniforms: this.material.uniforms,
      ambientExclusionZones: this.ambientExclusionZones,
    });
    this.sceneryRuntime = runtime;
    this.ambientSceneryEnabled = true;
    const replacements = [];
    for (const state of this.pages.values()) {
      if (state.presentation) {
        replacements.push(state.presentation.replaceSceneryRuntime(runtime, false));
      }
    }
    return Promise.all(replacements);
  }

  requestPage(state, distance) {
    if (this.disposed || state.presentation || state.pending || state.queued) return;
    state.queued = true;
    this.pageQueue.push({ state, distance, generation: state.generation });
    this.pageQueue.sort((left, right) => left.distance - right.distance);
    this.pumpPages();
  }

  pumpPages() {
    while (!this.disposed && this.activePageLoads < this.maximumPageLoads
      && this.pageQueue.length) {
      const work = this.pageQueue.shift();
      work.state.queued = false;
      if (work.generation !== work.state.generation || work.state.presentation) continue;
      this.activePageLoads++;
      const pending = this.loadPage(work);
      work.state.pending = pending;
      void pending.finally(() => {
        if (work.state.pending === pending) work.state.pending = null;
        this.activePageLoads--;
        this.pumpPages();
        this.resolveIdleWaiters();
      });
    }
    this.resolveIdleWaiters();
  }

  async loadPage({ state, generation }) {
    const descriptor = state.descriptor;
    const pageManifestUrl = versionedAssetUrl(descriptor.manifest.uri,
      this.manifestUrl, descriptor.manifest.sha256);
    try {
      const response = await this.fetch(pageManifestUrl);
      if (!response.ok) {
        throw new Error(`Terrain page manifest request failed: ${response.status} ${pageManifestUrl}`);
      }
      const pageManifest = validateTerrainManifest(await response.json());
      const bundleUrl = versionedAssetUrl(pageManifest.bundle.uri,
        pageManifestUrl, pageManifest.bundle.sha256);
      const reader = new TerrainBundleReader(bundleUrl, pageManifest.bundle.byteLength,
        this.fetch, this.maximumCachedRanges);
      const presentation = new KoreaTerrainPresentation(this.THREE, pageManifest, reader, {
        qualityTier: this.qualityTier,
        maximumConcurrentLoads: this.maximumChunkLoadsPerPage,
        chunkLoadRadiusM: this.chunkLoadRadiusM,
        chunkEvictRadiusM: this.chunkEvictRadiusM,
        lazyChunks: true,
        material: this.material,
        skirtMaterial: this.skirtMaterial,
        sceneryEra: this.sceneryEra,
        ambientSceneryRadiusM: this.ambientSceneryRadiusM,
        ambientSceneryBudgetLevel: this.ambientSceneryBudgetLevel,
        ambientExclusionZones: this.ambientExclusionZones,
        sceneryRuntime: this.sceneryRuntime,
        updateSceneryRuntime: false,
        chunkBuildScheduler: this.buildScheduler,
        terrainMeshWorkers: this.meshWorkers,
        groupName: `KOREA_TERRAIN_PAGE_${descriptor.id.toUpperCase()}`,
      });
      if (this.disposed || generation !== state.generation) {
        presentation.dispose();
        return;
      }
      state.presentation = presentation;
      state.error = null;
      this.loadedPageManifests++;
      this.group.add(presentation.group);
      if (this.lastUpdate) presentation.update(this.lastUpdate);
    } catch (error) {
      if (!this.disposed && generation === state.generation) {
        state.error = String(error?.message ?? error);
      }
    }
  }

  evictPage(state) {
    if (!state.presentation && !state.pending && !state.queued) return;
    state.generation++;
    state.queued = false;
    state.presentation?.dispose();
    state.presentation = null;
    state.error = null;
  }

  resolveIdleWaiters() {
    if (this.activePageLoads || this.pageQueue.length) return;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }

  async whenIdle() {
    if (this.activePageLoads || this.pageQueue.length) {
      await new Promise((resolve) => this.idleWaiters.push(resolve));
    }
    await Promise.all([...this.pages.values()]
      .map((state) => state.presentation?.whenIdle()).filter(Boolean));
  }

  update({ cameraPosition, streamPosition, deltaSeconds, elapsedSeconds, windX, windZ, fogColor,
    fogDensity, sunDirection, snowCover01, snowWetness01, glazeIce01,
    cameraAglM, placementEastM, placementNorthM } = {}) {
    if (this.disposed) return;
    if (placementEastM !== undefined || placementNorthM !== undefined) {
      this.setPlacement(placementEastM ?? this.worldEastM, placementNorthM ?? this.worldNorthM);
    }
    this.sceneryRuntime?.update({
      elapsedSeconds,
      windX,
      windZ,
      cameraPosition,
      cameraAglM,
      placementEastM: this.worldEastM,
      placementNorthM: this.worldNorthM,
    });
    if (fogColor) this.material.uniforms.uFogColor.value.copy(fogColor);
    if (Number.isFinite(fogDensity)) this.material.uniforms.uFogDensity.value = fogDensity;
    if (Number.isFinite(this.visibleWorldRadiusM) && this.visibleWorldRadiusM > 0) {
      this.material.uniforms.uWorldEdgeM.value = this.visibleWorldRadiusM;
    }
    if (sunDirection) this.material.uniforms.uSunDirection.value.copy(sunDirection).normalize();
    setTerrainWinterSurface(this.material, snowCover01, snowWetness01, glazeIce01);
    if (!cameraPosition) return;

    const cameraLocal = new this.THREE.Vector3(
      cameraPosition.x - this.worldEastM,
      cameraPosition.y,
      cameraPosition.z + this.worldNorthM,
    );
    const streamLocal = streamPosition
      ? new this.THREE.Vector3(
        streamPosition.x - this.worldEastM,
        streamPosition.y,
        streamPosition.z + this.worldNorthM,
      )
      : cameraLocal.clone();
    if (!streamPosition && this.previousCameraLocal && Number.isFinite(deltaSeconds)
      && deltaSeconds > 0) {
      const lookAhead = cameraLocal.clone().sub(this.previousCameraLocal)
        .multiplyScalar(this.lookAheadSeconds / deltaSeconds);
      const length = lookAhead.length();
      if (length > MAX_STREAM_LOOK_AHEAD_METRES) {
        lookAhead.multiplyScalar(MAX_STREAM_LOOK_AHEAD_METRES / length);
      }
      streamLocal.add(lookAhead);
    }
    if (!this.previousCameraLocal) this.previousCameraLocal = cameraLocal.clone();
    else this.previousCameraLocal.copy(cameraLocal);

    this.lastUpdate = {
      cameraPosition: cameraLocal,
      streamPosition: streamLocal,
      elapsedSeconds,
      windX,
      windZ,
      fogColor,
      fogDensity,
      sunDirection,
      snowCover01,
      snowWetness01,
      glazeIce01,
      placementEastM: 0,
      placementNorthM: 0,
    };
    const cameraEastM = cameraLocal.x;
    const cameraNorthM = -cameraLocal.z;
    const streamEastM = streamLocal.x;
    const streamNorthM = -streamLocal.z;
    const requested = [];
    for (const state of this.pages.values()) {
      const bounds = state.descriptor.boundsLocalM;
      const distance = Math.min(
        distanceToBounds(cameraEastM, cameraNorthM, bounds),
        distanceToBounds(streamEastM, streamNorthM, bounds),
      );
      if (distance > this.pageEvictRadiusM) {
        this.evictPage(state);
        continue;
      }
      state.presentation?.update(this.lastUpdate);
      if (distance <= this.pageLoadRadiusM && !state.presentation
        && !state.pending && !state.queued) requested.push({ state, distance });
    }
    requested.sort((left, right) => left.distance - right.distance);
    for (const request of requested) this.requestPage(request.state, request.distance);
    this.hasLocalCoverage = true;
  }

  diagnostics() {
    let residentPages = 0;
    let residentChunks = 0;
    let sceneryChunks = 0;
    let visibleSceneryChunks = 0;
    let localResidentChunks = 0;
    let localSceneryChunks = 0;
    let errors = 0;
    let networkRequests = 0;
    let networkBytes = 0;
    for (const state of this.pages.values()) {
      if (state.presentation) {
        residentPages++;
        const page = state.presentation.diagnostics();
        residentChunks += page.residentChunks;
        sceneryChunks += Number(page.sceneryChunks) || 0;
        visibleSceneryChunks += Number(page.visibleSceneryChunks) || 0;
        localResidentChunks += Number(page.localResidentChunks) || 0;
        localSceneryChunks += Number(page.localSceneryChunks) || 0;
        networkRequests += page.transfer.networkRequests;
        networkBytes += page.transfer.networkBytes;
      }
      if (state.error) errors++;
    }
    return Object.freeze({
      terrainId: this.manifest.terrainId,
      qualityTier: this.qualityTier,
      sceneryEra: this.sceneryEra,
      ambientSceneryEnabled: this.ambientSceneryEnabled,
      placementEastM: this.worldEastM,
      placementNorthM: this.worldNorthM,
      pages: this.pages.size,
      residentPages,
      residentChunks,
      sceneryChunks,
      visibleSceneryChunks,
      localResidentChunks: this.hasLocalCoverage ? localResidentChunks : 0,
      localSceneryChunks: this.hasLocalCoverage ? localSceneryChunks : 0,
      ambientSceneryRadiusM: this.ambientSceneryRadiusM,
      ambientSceneryBudgetLevel: this.ambientSceneryBudgetLevel,
      maximumChunkLoads: this.maximumChunkLoads,
      maximumChunkLoadsPerPage: this.maximumChunkLoadsPerPage,
      activePageLoads: this.activePageLoads,
      queuedPageLoads: this.pageQueue.length,
      loadedPageManifests: this.loadedPageManifests,
      networkRequests,
      networkBytes,
      missionFeaturePackId: this.missionFeaturePack?.featurePackId ?? null,
      missionFeaturePackSha256: this.missionFeaturePackSha256 || null,
      missionFeatures: this.missionFeaturePresentation?.diagnostics?.() ?? null,
      errors,
      disposed: this.disposed,
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pageQueue.length = 0;
    for (const state of this.pages.values()) {
      state.generation++;
      state.presentation?.dispose();
      state.presentation = null;
    }
    for (const resolve of this.idleWaiters.splice(0)) resolve();
    this.sceneryRuntime?.dispose();
    this.material.dispose();
    this.skirtMaterial.dispose();
    this.buildScheduler.dispose();
    this.meshWorkers.dispose();
    this.missionFeaturePresentation?.dispose?.();
    this.missionFeaturePresentation = null;
    this.group.removeFromParent();
  }
}

export async function loadKoreaTerrain(THREE, options = {}) {
  const manifestUrl = new URL(options.manifestUrl ?? DEFAULT_MANIFEST_URL,
    options.baseUrl ?? import.meta.url).href;
  const fetchImpl = options.fetch ?? fetch;
  const response = await fetchImpl(manifestUrl);
  if (!response.ok) {
    throw new Error(`Terrain manifest request failed: ${response.status} ${manifestUrl}`);
  }
  const value = await response.json();
  if (value?.schemaVersion === "2.0.0") {
    const atlas = validateTerrainAtlasManifest(value);
    return new KoreaTerrainAtlasPresentation(THREE, atlas, manifestUrl, options);
  }
  const manifest = validateTerrainManifest(value);
  const bundleUrl = versionedAssetUrl(manifest.bundle.uri,
    manifestUrl, manifest.bundle.sha256);
  const reader = new TerrainBundleReader(bundleUrl,
    manifest.bundle.byteLength, fetchImpl, options.maximumCachedRanges);
  return new KoreaTerrainPresentation(THREE, manifest, reader, options);
}
