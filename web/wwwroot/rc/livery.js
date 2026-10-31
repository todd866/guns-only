import * as T from '../vendor/three.module.js';

// Liveries for every body (owner, 2026-10-30: "more livery complexity", "an extensive car mod
// workplace"). The bodies have no paint UVs, so a pattern is drawn procedurally in the car's own
// frame: x across, y up, z nose (-1) to tail (+1), each normalised to the painted parts' box.
// The paint materials are recognised by their colour and patched in place.
import { LIVERIES, TRIMS } from './livery-data.mjs';
export { LIVERIES, TRIMS };
const PATTERN = Object.fromEntries(LIVERIES.map((l, i) => [l.id, i]));

const MASK = `
uniform vec3 uTrim; uniform int uPattern; varying vec3 vLiv;
float livHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float livNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(livHash(i), livHash(i + vec2(1, 0)), f.x), mix(livHash(i + vec2(0, 1)), livHash(i + vec2(1, 1)), f.x), f.y); }
vec4 livery(vec3 p){
  if (uPattern == 1) { float s = step(abs(abs(p.x) - 0.17), 0.08) * step(-0.35, p.y); return vec4(uTrim, s); }
  if (uPattern == 2) { return vec4(uTrim, 1.0 - smoothstep(-0.12, -0.06, p.y + 0.15 * p.z)); }
  if (uPattern == 3) { float c = mod(floor(p.x * 4.0) + floor(p.z * 7.0) + floor(p.y * 4.0), 2.0); return vec4(uTrim, c); }
  if (uPattern == 4) { float n = livNoise(p.xz * vec2(3.5, 5.0) + p.y * 2.0) + 0.5 * livNoise(p.zy * 7.0 + 3.1);
    return vec4(n > 1.05 ? uTrim * 0.5 : uTrim, step(0.68, n)); }
  if (uPattern == 5) { float edge = 0.05 + 0.32 * abs(sin(p.x * 7.0 + p.y * 3.0)) + 0.12 * sin(p.y * 11.0);
    float t = 1.0 - smoothstep(edge - 0.02, edge + 0.02, p.z);
    vec3 c = mix(vec3(1.0, 0.86, 0.22), uTrim, smoothstep(edge - 0.45, edge - 0.05, p.z)); return vec4(c, t); }
  if (uPattern == 6) { float mouth = step(p.z, -0.55) * step(p.y, 0.05) * step(-0.75, p.y);
    float teeth = step(abs(fract(p.x * 7.0) - 0.5) * 0.22, abs(p.y + 0.33) - 0.06) ;
    float eye = step(length(vec2(abs(p.x) - 0.45, (p.z + 0.45) * 1.4)), 0.09) * step(0.0, p.y);
    vec3 c = mix(vec3(0.55, 0.06, 0.1), vec3(0.97), (1.0 - teeth));
    return eye > 0.5 ? vec4(0.05, 0.05, 0.06, 1.0) : vec4(c, mouth); }
  if (uPattern == 7) { float zig = (abs(fract(p.z * 2.2) - 0.5) * 4.0 - 1.0) * 0.16 - 0.08;   // a bolt along each flank
    return vec4(mix(uTrim, vec3(1.0), 0.15), step(abs(p.y - zig), 0.075)); }
  if (uPattern == 8) { float s = sin(p.z * 17.0 + livNoise(p.xy * 3.0) * 3.0 + abs(p.x) * 5.0);   // jagged stripes across
    return vec4(uTrim, step(0.55, s) * step(-0.7, p.y)); }
  if (uPattern == 9) { vec2 q = p.xz * vec2(4.0, 6.0) + vec2(p.y * 2.0, 0.0), cell = floor(q), l = fract(q) - 0.5;   // scattered five-point stars
    float r = length(l), a = atan(l.y, l.x), k = 0.17 + 0.09 * cos(5.0 * a + livHash(cell) * 6.28);
    return vec4(uTrim, step(r, k) * step(0.45, livHash(cell + 7.0))); }
  if (uPattern == 10) { // six seven: a big 67 on a white roundel across the roof, read from the chase camera
    vec2 q = vec2((p.x + 0.44) / 0.88, (-p.z + 0.5) / 1.0);
    if (p.y < 0.15 || q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return vec4(uTrim, step(0.9, abs(p.x)) * step(-0.2, p.y));
    float d = q.x < 0.5 ? 6.0 : 7.0; vec2 u = vec2(fract(q.x * 2.0), q.y); u = (u - vec2(0.16, 0.1)) / vec2(0.68, 0.8);
    float t = 0.17, inx = step(0.0, u.x) * step(u.x, 1.0);
    float a = inx * step(1.0 - t, u.y) * step(u.y, 1.0), g = inx * step(abs(u.y - 0.5), t * 0.5), dd = inx * step(0.0, u.y) * step(u.y, t);
    float fl = step(0.0, u.x) * step(u.x, t) * step(0.5, u.y) * step(u.y, 1.0), el = step(0.0, u.x) * step(u.x, t) * step(0.0, u.y) * step(u.y, 0.5);
    float br = step(1.0 - t, u.x) * step(u.x, 1.0) * step(0.5, u.y) * step(u.y, 1.0), cr = step(1.0 - t, u.x) * step(u.x, 1.0) * step(0.0, u.y) * step(u.y, 0.5);
    float on = d < 6.5 ? max(max(max(a, g), max(dd, fl)), max(el, cr)) : max(max(a, br), cr);
    return on > 0.5 ? vec4(0.06, 0.06, 0.08, 1.0) : vec4(0.97, 0.96, 0.92, 1.0); }
  if (uPattern == 11) { // sheriff star: a big gold six-point star on each door and the bonnet, a gold pinstripe below
    // (car bodies; the jet shells only show the pinstripe)
    vec3 gold = vec3(0.95, 0.76, 0.25); vec2 q = vec2(0.0); bool on = false;
    if (abs(p.x) > 0.55 && p.y < 0.2) { q = vec2(p.z / 0.42, (p.y + 0.12) / 0.3) * 0.5; on = true; }
    else if (p.y > 0.0 && p.z < -0.25) { q = vec2(p.x / 0.5, (p.z + 0.62) / 0.3) * 0.5; on = true; }
    if (on) { float r = length(q), a = atan(q.y, q.x), k = 0.34 + 0.14 * cos(6.0 * a);
      if (r < k) return vec4(r < 0.12 ? vec3(0.6, 0.42, 0.1) : gold, 1.0); }
    return vec4(gold, step(abs(p.y + 0.48), 0.03)); }
  return vec4(uTrim, 0.0);
}`;

/** Patch the paint on `root` (the car group). Safe to call again after a body or paint change. */
export function applyLivery(root, { paint, trim = TRIMS[0].color, pattern = 'solid' } = {}) {
  if (!root) return 0;
  const target = new T.Color(paint).getHexString(), meshes = [];
  root.updateMatrixWorld(true);
  root.traverse(o => { if (o.isMesh && o.visible !== false && o.material?.color && !Array.isArray(o.material) && o.material.color.getHexString() === target) meshes.push(o); });
  if (!meshes.length) return 0;
  const inv = new T.Matrix4().copy(root.matrixWorld).invert(), box = new T.Box3(), v = new T.Vector3();
  for (const m of meshes) { const pos = m.geometry.attributes.position, to = new T.Matrix4().multiplyMatrices(inv, m.matrixWorld); for (let i = 0; i < pos.count; i += 3) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(to)); }
  const size = box.getSize(new T.Vector3()).max(new T.Vector3(1e-3, 1e-3, 1e-3));
  const u = root.userData.livery ??= { uInv: { value: new T.Matrix4() }, uMin: { value: new T.Vector3() }, uSize: { value: new T.Vector3(1, 1, 1) }, uTrim: { value: new T.Color() }, uPattern: { value: 0 } };
  u.uMin.value.copy(box.min); u.uSize.value.copy(size); u.uTrim.value.set(trim); u.uPattern.value = PATTERN[pattern] ?? 0;
  for (const m of meshes) {
    m.onBeforeRender = () => u.uInv.value.copy(root.matrixWorld).invert();
    if (m.material.userData.livery === u) continue;
    m.material.userData.livery = u;
    m.material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = 'uniform mat4 uInv; uniform vec3 uMin; uniform vec3 uSize; varying vec3 vLiv;\n' + shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n vLiv = ((uInv * modelMatrix * vec4(transformed, 1.0)).xyz - uMin) / uSize * 2.0 - 1.0;');
      shader.fragmentShader = MASK + '\n' + shader.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\n { vec4 l = livery(vLiv); diffuseColor.rgb = mix(diffuseColor.rgb, l.rgb, l.a); }');
    };
    m.material.customProgramCacheKey = () => 'rc-livery';
    m.material.needsUpdate = true;
  }
  return meshes.length;
}
