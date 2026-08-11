// Shadow reception for the hand-written terrain surface shaders.
//
// WHY THIS MODULE EXISTS. `object.receiveShadow = true` is a no-op on a raw `THREE.ShaderMaterial`.
// Three only injects the shadow-map varyings, samplers and `getShadowMask()` into the *built-in*
// material shaders; a ShaderMaterial gets exactly the GLSL it was handed. Both terrain surfaces we
// ship — `cobra_canyon_terrain_material.js` and `korea_terrain.js` — are raw ShaderMaterials, so
// every `receiveShadow` flag on a terrain mesh in this product has been decorative. That is the
// real content of the render-architecture design doc's "no receivers exist, so the pass was
// disabled as waste": there were no receivers because the receivers could not compile one.
//
// This module is the smallest shared thing that fixes it for both, ahead of the design doc's
// stage 2 shading-module extraction. It carries GLSL only — no palette, no tone ramp — so it does
// not pre-empt that extraction or fork it.
//
// HOW TO USE (three r160):
//   vertexShader:   TERRAIN_SHADOW_VERTEX_PARS before main; inside main, set `worldPosition`
//                   (vec4) and `transformedNormal` (vec3, VIEW space) then
//                   TERRAIN_SHADOW_VERTEX_BODY.
//   fragmentShader: TERRAIN_SHADOW_FRAGMENT_PARS before main; call getShadowMask() in main.
//   material:       `lights: true` and `uniforms: withTerrainShadowUniforms(THREE, ownUniforms)`.
//
// BOTH STAGES ASSUME THE CALLER HAS ALREADY WRITTEN `#include <common>`. Three's preprocessor
// inlines every include literally with no de-duplication, so emitting it here would redefine
// `saturate`, `pow2` and friends in korea_terrain.js, which includes common already — a
// compile error rather than a silent one, but a needless one.
//
// `lights: true` is what makes Three define NUM_DIR_LIGHT_SHADOWS / USE_SHADOWMAP and upload the
// shadow uniforms; the merge is what gives those uniforms somewhere to land, because a raw
// ShaderMaterial's uniform set is its own object and Three writes light state into it in place.
//
// TIER HONESTY. When `renderer.shadowMap.enabled` is false — the mobile floor — Three never
// defines USE_SHADOWMAP, `getShadowMask()` compiles to `return 1.0`, and the whole feature costs
// nothing but a handful of dead uniforms. A tier that cannot afford shadows renders without them
// rather than dropping frames.

/** Vertex declarations: shadow coord varyings and the light-space matrices. */
export const TERRAIN_SHADOW_VERTEX_PARS = /* glsl */ `
#include <shadowmap_pars_vertex>
`;

/**
 * Vertex body. Requires `worldPosition` (vec4, world space) and `transformedNormal` (vec3, view
 * space — the chunk rotates it back to world itself) to be in scope.
 */
export const TERRAIN_SHADOW_VERTEX_BODY = /* glsl */ `
#include <shadowmap_vertex>
`;

/**
 * Fragment declarations: shadow samplers, the PCF kernels, and `getShadowMask()`.
 * `receiveShadow` is a bool uniform Three sets on every program from `object.receiveShadow`
 * (WebGLRenderer.setProgram), so the per-object flag keeps working exactly as it reads.
 */
export const TERRAIN_SHADOW_FRAGMENT_PARS = /* glsl */ `
#include <packing>
uniform bool receiveShadow;
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
`;

/**
 * Merges the full light/shadow uniform block under the caller's own uniforms. The whole
 * `UniformsLib.lights` block is merged rather than `UniformsLib.shadowmap` alone because
 * WebGLRenderer writes `directionalLightShadows`, `ambientLightColor` and friends into the
 * material's uniform object unconditionally once `needsLights` is set; a missing key throws.
 */
export function withTerrainShadowUniforms(THREE, uniforms) {
  // NOT `UniformsUtils.merge([...])`, which is the idiom the Three docs suggest and which is
  // wrong here: merge deep-CLONES every value, and in r160 that includes Textures. Applied to
  // korea_terrain it produced a second Texture object wrapping the same Source, breaking the
  // identity `korea_terrain.test.mjs` asserts and, worse, splitting `needsUpdate` bookkeeping
  // across two objects for one upload. The caller's uniform records therefore pass through BY
  // REFERENCE — which also preserves the skirt material's deliberate share-by-reference of the
  // surface material's uniform object. Only the light block, which is all plain arrays and nulls,
  // is cloned, because Three writes live light state into it per material.
  return { ...THREE.UniformsUtils.clone(THREE.UniformsLib.lights), ...uniforms };
}
