/**
 * Surface detail for AUTHORED STRUCTURES — bridge deck, piers, roads, hero cells, landmarks.
 *
 * The basin already carries five octaves of procedural landcover, so the world under these
 * objects has grain while the objects themselves were flat `MeshLambertMaterial` fills. At
 * 30 m AGL the bridge deck is most of the screen, which is why the frame read as cardboard
 * sitting on a detailed world (docs/art-direction/bfv-graphics-gap-2026-08-12.md).
 *
 * The detail is driven by WORLD POSITION, not UVs: these meshes are merged, non-unwrapped
 * geometry, and world-space grain also keeps tiling continuous across a merge seam.
 */

import { COBRA_NOISE_CHUNK } from "./cobra_canyon_terrain_material.js";

/**
 * Per-role surface character. `grainMetres` is the size of the dominant feature — a deck
 * plank band, a rutted road, a weathered concrete pier — and `wear` is how far the value can
 * darken in the worn areas. Both are deliberately human-scale: a 30 m AGL pass has to SEE
 * the change, not merely have it present.
 */
export const COBRA_STRUCTURE_SURFACES = Object.freeze({
  "bridge-deck": Object.freeze({ grainMetres: 1.6, wear: 0.30, streak: 0.55 }),
  "bridge-pier": Object.freeze({ grainMetres: 2.4, wear: 0.26, streak: 0.20 }),
  roads: Object.freeze({ grainMetres: 3.2, wear: 0.34, streak: 0.45 }),
  heroCells: Object.freeze({ grainMetres: 6.0, wear: 0.22, streak: 0.10 }),
  landmarks: Object.freeze({ grainMetres: 1.1, wear: 0.20, streak: 0.15 }),
});

const FALLBACK_SURFACE = Object.freeze({ grainMetres: 2.0, wear: 0.22, streak: 0.20 });

// Hangs off <begin_vertex>, which every three.js material shader contains. An earlier version
// keyed off <worldpos_vertex> — that chunk is only emitted when an envmap/shadow/distance
// define is set, so on the bridge deck the replace silently did nothing, the varying stayed at
// the origin, and the "detail" collapsed to one constant tint across the whole deck. The frame
// looked untouched and the pixel diff was a uniform 5 levels, which is what a constant looks
// like. Never key an injection off a conditional chunk.
// INSTANCING IS THE WHOLE TRICK HERE. These props are InstancedMeshes: `modelMatrix` is the
// shared group transform, so `modelMatrix * transformed` gives every instance the SAME world
// coordinate, every instance samples the same noise, and the detail collapses to one flat tint
// across the entire deck. It looks exactly like "the shader did nothing" — the frame is
// unchanged and the pixel diff is a uniform handful of levels. The per-instance transform must
// be folded in first.
const STRUCTURE_VERTEX_HOOK = /* glsl */ `
#include <begin_vertex>
vec4 cobraStructureLocal = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  cobraStructureLocal = instanceMatrix * cobraStructureLocal;
#endif
vCobraStructureWorld = (modelMatrix * cobraStructureLocal).xyz;
// Normals need the INVERSE-TRANSPOSE, not the matrix itself. composeBox authors independent
// XYZ scales, and under non-uniform scale a plain mat3 skews the normal — which flips the
// triplanar axis pick below and grains those faces along the wrong plane. Compensating by
// squared column length is the inverse-transpose for a scale+rotation matrix and stays
// WebGL1-safe (GLSL ES 1.0 has no inverse()).
mat3 cobraStructureBasis = mat3(modelMatrix);
#ifdef USE_INSTANCING
  cobraStructureBasis = cobraStructureBasis * mat3(instanceMatrix);
#endif
vec3 cobraStructureInvScale = vec3(
  1.0 / max(1e-8, dot(cobraStructureBasis[0], cobraStructureBasis[0])),
  1.0 / max(1e-8, dot(cobraStructureBasis[1], cobraStructureBasis[1])),
  1.0 / max(1e-8, dot(cobraStructureBasis[2], cobraStructureBasis[2])));
vCobraStructureNormal =
  normalize(cobraStructureBasis * (normal * cobraStructureInvScale));
`;

const STRUCTURE_FRAGMENT_DETAIL = /* glsl */ `
#include <color_fragment>
{
  // Triplanar-lite: pick the two axes least aligned with the surface normal so a deck (facing
  // up) grains across its length and a pier (facing sideways) grains down its height. A single
  // xz projection would smear vertical faces into stripes.
  vec3 n = abs(normalize(vCobraStructureNormal));
  vec2 uv = n.y > max(n.x, n.z)
    ? vCobraStructureWorld.xz
    : (n.x > n.z ? vCobraStructureWorld.zy : vCobraStructureWorld.xy);
  float grain = cobraNoise(uv / max(0.05, uCobraGrainMetres));
  float fine = cobraNoise(uv / max(0.02, uCobraGrainMetres * 0.28));
  float cobraStructureDetail = mix(grain, fine, 0.42);
  // Wear darkens; it never brightens. A structure that lightens under traffic reads as glow.
  float worn = smoothstep(0.34, 0.86, cobraStructureDetail);
  diffuseColor.rgb *= 1.0 - uCobraWear * worn;
  // Longitudinal streaking along the dominant axis: run marks, tyre tracks, water staining.
  float streak = cobraNoise(vec2(uv.x / max(0.05, uCobraGrainMetres * 6.0), uv.y * 0.06));
  diffuseColor.rgb *= 1.0 - uCobraStreak * 0.18 * smoothstep(0.45, 0.95, streak);
}
`;

/**
 * A structure material with procedural surface detail.
 *
 * @param {string} role one of COBRA_STRUCTURE_SURFACES; unknown roles fall back rather than
 *   throw, because a scene build must never die on an unrecognised prop.
 */
export function createCobraStructureMaterial(THREE, role, parameters = {}) {
  const surface = COBRA_STRUCTURE_SURFACES[role] ?? FALLBACK_SURFACE;
  const material = new THREE.MeshLambertMaterial({
    color: parameters.color ?? 0xffffff,
    emissive: parameters.emissive ?? 0x000000,
    flatShading: parameters.flatShading ?? false,
    side: parameters.side ?? THREE.FrontSide,
    vertexColors: parameters.vertexColors ?? false,
  });
  material.userData.cobraStructureRole = role;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCobraGrainMetres = { value: surface.grainMetres };
    shader.uniforms.uCobraWear = { value: surface.wear };
    shader.uniforms.uCobraStreak = { value: surface.streak };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vCobraStructureWorld;
varying vec3 vCobraStructureNormal;`,
      )
      .replace("#include <begin_vertex>", STRUCTURE_VERTEX_HOOK);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vCobraStructureWorld;
varying vec3 vCobraStructureNormal;
uniform float uCobraGrainMetres;
uniform float uCobraWear;
uniform float uCobraStreak;
${COBRA_NOISE_CHUNK}`,
      )
      .replace("#include <color_fragment>", STRUCTURE_FRAGMENT_DETAIL);
  };
  // One key for every role: the injected GLSL is IDENTICAL across roles (only uniform values
  // differ), so per-role keys would split the program cache for nothing. three appends this to
  // its own key, which already separates flatShading/side/vertexColors variants — and this
  // still keeps patched materials from sharing a program with unpatched Lamberts.
  material.customProgramCacheKey = () => "cobra-structure";
  return material;
}
