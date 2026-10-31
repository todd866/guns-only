import * as T from '../../vendor/three.module.js';

// Water surface from Ben Haire's brief (native/saucer-springs/WATER-AND-LIGHTING.md), in a form
// WebGL2 can run so the website and the Mac app get the same water:
// - a Gerstner swell displacing a dense grid, with analytic normals from the wave derivatives;
// - Fresnel reflection of the real sky and sun (the physical material's environment and specular);
// - colour that deepens with the view path through the water (depth absorption);
// - Jacobian foam: where the horizontal displacement folds (determinant small), the crest breaks.
// Visual only: the physics keeps its flat water.
// The wave set lives with the physics so the cars ride the waves that are drawn.
import {SWELL} from '../physics/water.mjs';
export {SWELL};
const CHOP = 0.0; // pure sine heights: the physics samples heights without horizontal shift   // Gerstner Q: how far crests pinch toward each other (0 = sine, 1 = cusp)

export function createWaterSurface({
  size = [100, 60],
  segments = [200, 120],
  position = [0, 0, 0],
  shallow = '#1fb2c4',
  deep = '#08608a',
  swell = SWELL,
  floor = -Infinity
} = {}) {
  const geometry = new T.PlaneGeometry(size[0], size[1], segments[0], segments[1]);
  geometry.rotateX(-Math.PI / 2);
  const material = new T.MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: 0.12,
    metalness: 0,
    ior: 1.33,
    transparent: true,
    opacity: 0.9,
    envMapIntensity: 4, // the open world dims its environment to 6% for diffuse fill; water must still mirror the sky
    specularIntensity: 1
  });
  // One vec4 uniform per wave (direction x, z; steepness; wavelength), unrolled in the shader: a
  // vec4 array uniform arrived with zero wavelengths and threw NaN vertices into the sky.
  const uniforms = {
    uTime: {value: 0},
    uShallow: {value: new T.Color(shallow)},
    uDeep: {value: new T.Color(deep)}
  };
  swell.forEach(([x, z, q, l], i) => {
    const n = Math.hypot(x, z);
    uniforms[`uW${i}`] = {value: new T.Vector4(x / n, z / n, q, Math.max(0.5, l))};
  });
  const N = swell.length,
    waveDecl = swell.map((_, i) => `uniform vec4 uW${i};`).join(' ');
  const waveCalls = swell.map((_, i) => `gerstner(uW${i}, gp, gN, jxx, jzz, jxz, crest);`).join('\n        ');
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      `uniform float uTime; ${waveDecl} varying float vFoam; varying float vCrest;
      // One Gerstner wave (GPU Gems 1, ch. 1): displacement, analytic normal and the Jacobian.
      void gerstner(vec4 w, inout vec3 gp, inout vec3 gN, inout float jxx, inout float jzz, inout float jxz, inout float crest) {
        vec2 d = w.xy; float a = w.z, k = 6.2831853 / w.w, c = sqrt(9.8 / k), qa = ${CHOP.toFixed(3)} * a;
        float f = k * (dot(d, position.xz) - c * uTime), sf = sin(f), cf = cos(f);
        gp.x += d.x * qa * cf; gp.z += d.y * qa * cf; gp.y += a * sf; crest += sf * a * k;
        gN.x -= d.x * k * a * cf; gN.z -= d.y * k * a * cf; gN.y -= ${CHOP.toFixed(3)} * k * a * sf;
        jxx -= k * qa * d.x * d.x * sf; jzz -= k * qa * d.y * d.y * sf; jxz -= k * qa * d.x * d.y * sf;
      }\n` +
      shader.vertexShader
        .replace(
          '#include <beginnormal_vertex>',
          `
        vec3 gp = position; vec3 gN = vec3(0.0, 1.0, 0.0); float jxx = 1.0, jzz = 1.0, jxz = 0.0, crest = 0.0;
        ${waveCalls}
        // Troughs flatten at the pool floor instead of cutting through it.
        gp.y = max(gp.y, ${Number.isFinite(floor) ? floor.toFixed(3) : '-1e6'});
        vFoam = 1.0 - smoothstep(0.84, 0.93, jxx * jzz - jxz * jxz); vCrest = crest;
        vec3 objectNormal = normalize(gN);`
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = gp;');
    shader.fragmentShader =
      'uniform vec3 uShallow; uniform vec3 uDeep; varying float vFoam; varying float vCrest;\n' +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
        // Depth absorption: a grazing view travels further through the water and reads deeper;
        // troughs read deeper than crests. Foam whitens folded crests.
        float facing = clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
        float path = clamp(0.45 + (1.0 - facing) * 0.7 - vCrest * 2.0, 0.0, 1.0);
        diffuseColor.rgb = mix(uShallow, uDeep, path);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.98, 1.0), vFoam);
        diffuseColor.a = mix(0.9, 0.98, max(1.0 - facing, vFoam));`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\n        roughnessFactor = mix(roughnessFactor, 0.85, vFoam);'
        );
  };
  material.customProgramCacheKey = () => `rc-water-${N}`;
  material.userData.uniforms = uniforms;
  const mesh = new T.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.receiveShadow = true;
  mesh.name = 'GerstnerWater';
  // The swell displaces up to a metre: keep the bounds generous so it is never culled at the edges.
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += 0.5;
  return {
    mesh,
    update(time) {
      uniforms.uTime.value = time;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    }
  };
}
