import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {addBox} from '../physics/world.mjs';
import {ZOO,ZOO_JETS,createZooState,stepZoo} from './petting-zoo.mjs';
import {ZOO_RAMPS} from './jet-decks.mjs';
import {addDeck,findEdge,addRamp} from './jet-decks.js';

// The petting zoo, drawn (data and facts in petting-zoo.mjs). Four jets built to their real
// shapes and sizes, which matter at toy scale: the car sees them from under the wing.
//   MiG-21: bare metal, nose intake with its shock cone, delta wing, tall fin.
//   MiG-23: green-brown camouflage, side intakes, swing wings (they wave when it wakes).
//   MiG-29 and Su-27: twin engines slung under a flat body, twin fins, grey and blue schemes.
// Each pen is brass posts and a red rope (the car rolls under it), straw, a plaque at toy height.
// Awake: the canopy lifts, the rudders wag like a happy dog, the nav lights blink.
// Code-authored from published overall dimensions; local -z is forward, then turned to face +z.
const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
// Camouflage: blobs over a base, with the underside band (lathe u around .5 is the belly).
const camo = (base, blobs, belly, seed, splinter = false) => canvasTex(512, 256, (x, w, h) => {
  const r = rng(seed); x.fillStyle = base; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 46; i++) {
    x.fillStyle = blobs[i % blobs.length]; x.beginPath();
    const cx = r() * w, cy = r() * h, s = 18 + r() * 46;
    if (splinter) { x.moveTo(cx, cy); for (let k = 0; k < 4; k++) x.lineTo(cx + (r() - .5) * s * 2.4, cy + (r() - .5) * s * 2.4); }
    else for (let k = 0; k <= 10; k++) { const a = k / 10 * Math.PI * 2, q = s * (.6 + r() * .5); x.lineTo(cx + Math.cos(a) * q * 1.5, cy + Math.sin(a) * q); }
    x.fill();
  }
  if (belly) { x.fillStyle = belly; x.fillRect(w * .3, 0, w * .4, h); }
});
const star = () => canvasTex(128, 128, (x) => {
  const pts = r => Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * .4 : r; return [64 + Math.cos(a) * q, 66 + Math.sin(a) * q]; });
  for (const [r, c] of [[62, '#c8262b'], [56, '#ffffff'], [48, '#c8262b']]) { x.fillStyle = c; x.beginPath(); for (const [a, b] of pts(r)) x.lineTo(a, b); x.fill(); }
});
const bort = (n, color) => canvasTex(256, 128, (x) => { x.font = '900 104px system-ui'; x.textAlign = 'center'; x.lineWidth = 10; x.strokeStyle = '#ffffff'; x.strokeText(n, 128, 104); x.fillStyle = color; x.fillText(n, 128, 104); });

const LIVERY = {
  'MiG-21': { skin: () => new T.MeshStandardMaterial({ color: '#dfe3e6', metalness: .3, roughness: .38 }), under: '#d3d8db', radome: '#3c4246', bort: ['21', '#c8262b'] },
  'MiG-23': { skin: () => new T.MeshStandardMaterial({ map: camo('#77744a', ['#4f5a2e', '#8a6a42', '#b5a476'], '#9fc0d0', 23), roughness: .7 }), top: () => camo('#77744a', ['#4f5a2e', '#8a6a42', '#b5a476'], null, 7), under: '#9fc0d0', radome: '#2f3a2c', bort: ['23', '#c8262b'] },
  'MiG-29': { skin: () => new T.MeshStandardMaterial({ map: camo('#aab3b6', ['#7f8f8a', '#c6ccce'], '#c9d1d4', 29, true), roughness: .65 }), top: () => camo('#aab3b6', ['#7f8f8a', '#c6ccce'], null, 9, true), under: '#c9d1d4', radome: '#e2e2da', bort: ['29', '#2e62b8'] },
  'Su-27': { skin: () => new T.MeshStandardMaterial({ map: camo('#8eabc2', ['#6a89a6', '#b7cbd9'], '#c7d6df', 27, true), roughness: .6 }), top: () => camo('#8eabc2', ['#6a89a6', '#b7cbd9'], null, 13, true), under: '#c7d6df', radome: '#d8dcd6', bort: ['27', '#2e62b8'] },
};

function buildJet(type, keep) {
  const L = LIVERY[type], root = new T.Group(), body = new T.Group(); root.add(body);
  const mats = {}, M = (key, make) => mats[key] ??= (keep.push(make()), keep.at(-1));
  const skin = M('skin', L.skin), dark = M('dark', () => new T.MeshStandardMaterial({ color: '#1d2124', roughness: .5 })),
    under = M('under', () => new T.MeshStandardMaterial({ color: L.under, roughness: .6, metalness: type === 'MiG-21' ? .3 : 0 })),
    top = L.top ? M('top', () => { const t = L.top(); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1 / 6, 1 / 6); keep.push(t); return new T.MeshStandardMaterial({ map: t, roughness: .65 }); }) : skin,
    radome = M('radome', () => new T.MeshStandardMaterial({ color: L.radome, roughness: .5 })),
    glass = M('glass', () => new T.MeshPhysicalMaterial({ color: '#203848', roughness: .05, metalness: .2, clearcoat: 1, transparent: true, opacity: .82 })),
    metal = M('metal', () => new T.MeshStandardMaterial({ color: '#8d9497', metalness: .8, roughness: .35 })),
    tyre = M('tyre', () => new T.MeshStandardMaterial({ color: '#1a1a1a', roughness: .9 })),
    nozzle = M('nozzle', () => new T.MeshStandardMaterial({ color: '#4a3f37', metalness: .6, roughness: .45 }));
  const mesh = (g, m, parent = body) => { const o = new T.Mesh(g, m); o.castShadow = true; parent.add(o); return o; };
  // Fuselage: a lathe from tail (y < 0) to nose (y > 0), laid along -z.
  const lathe = (prof, m, sx = 1, at = [0, 0, 0], parent = body) => { const g = new T.LatheGeometry(prof.map(([r, y]) => new T.Vector2(r, y)), 28); g.rotateX(-Math.PI / 2); g.scale(sx, 1, 1); g.translate(...at); return mesh(g, m, parent); };
  // A flat plate from a planform [[x, z], ...] (x outboard, z aft), thick, at height y.
  const plate = (pts, thick, y, m, mirror = true, parent = body) => {
    const out = [];
    for (const side of mirror ? [1, -1] : [1]) {
      const s = new T.Shape(pts.map(([x, z]) => new T.Vector2(x * side, z)));
      const g = new T.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * .3, bevelSize: Math.min(.06, thick * .5), bevelSegments: 1 });
      g.rotateX(Math.PI / 2); g.translate(0, y + thick / 2, 0); out.push(mesh(g, m, parent));
    }
    return out;
  };
  // Wings: camouflage on top, the underside colour below.
  const wing = (pts, thick, y, parent = body, mirror = true) => [...plate(pts, thick / 2, y + thick / 4, top, mirror, parent), ...plate(pts, thick / 2, y - thick / 4, under, mirror, parent)];
  // A vertical fin from a side profile [[z, y], ...], centred at x, canted outward by `cant`.
  const fin = (pts, thick, x, cant = 0, parent = body) => {
    const s = new T.Shape(pts.map(([z, y]) => new T.Vector2(z, y))), g = new T.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * .3, bevelSize: Math.min(.05, thick * .5), bevelSegments: 1 });
    g.rotateY(-Math.PI / 2); g.translate(thick / 2, 0, 0); const o = mesh(g, skin, parent); o.position.x = x; o.rotation.z = -cant; return o;
  };
  const pivot = (x, y, z, parent = body) => { const p = new T.Group(); p.position.set(x, y, z); parent.add(p); return p; };
  const gears = [], wheel = (x, z, r, H) => { gears.push([x, z]); const leg = mesh(new T.CylinderGeometry(.06, .06, H - r), metal); leg.position.set(x, -(H - r) / 2 - .1, z); const w = mesh(new T.CylinderGeometry(r, r, r * .7, 18), tyre); w.rotation.z = Math.PI / 2; w.position.set(x, -H + r, z); };
  const decal = (tex, w, h, pos, rotY, parent = body) => { const m = M('decal' + tex.uuid, () => new T.MeshStandardMaterial({ map: tex, transparent: true, roughness: .6, polygonOffset: true, polygonOffsetFactor: -3, depthWrite: false })); const o = new T.Mesh(new T.PlaneGeometry(w, h), m); o.position.set(...pos); o.rotation.y = rotY; parent.add(o); keep.push(o.geometry); return o; };
  const starTex = M('starTex', star), bortTex = M('bortTex', () => bort(...L.bort));
  const parts = { rudders: [], wings: [], stabs: [], lights: [], canopy: null };
  let H, fins = [], spec;
  if (type === 'MiG-21') {
    H = 1.6; spec = { length: 14.5, span: 7.15 };
    const tube = lathe([[.52, -7.25], [.6, -6.9], [.68, -5.5], [.72, -2], [.7, 1.5], [.62, 4], [.52, 6.2], [.47, 7.25]], skin);
    tube.material = skin; tube.geometry.computeVertexNormals();
    const cone = mesh(new T.ConeGeometry(.3, 1.1, 20), radome); cone.rotation.x = -Math.PI / 2; cone.position.z = -7.6;
    { const disc = mesh(new T.CircleGeometry(.46, 24), dark); disc.position.z = -7.1; disc.rotation.y = Math.PI; }
    const tail = mesh(new T.CylinderGeometry(.5, .5, .15, 24, 1, true), nozzle); tail.rotation.x = Math.PI / 2; tail.position.z = 7.2;
    mesh(new T.CircleGeometry(.46, 24), dark).position.z = 7.15;
    const spine = mesh(new T.SphereGeometry(1, 20, 10), skin); spine.scale.set(.3, .32, 3.2); spine.position.set(0, .5, -.2);
    const boom = mesh(new T.CylinderGeometry(.03, .03, 1.8, 8), metal); boom.rotation.x = Math.PI / 2; boom.position.set(0, .35, -8.2);
    mesh(new T.BoxGeometry(.5, .03, 1.2), dark).position.set(0, .66, -5.2);
    wing([[.6, -1.6], [3.57, 2.75], [3.57, 3.3], [.6, 2.9]], .14, -.15);
    fins = [fin([[2.2, .5], [6.6, .5], [6.6, 2.5], [5.6, 2.5]], .12, 0)];
    const rp = pivot(0, 0, 6.5); fin([[0, .7], [.6, .7], [.55, 2.4], [0, 2.4]], .08, 0, 0, rp); parts.rudders.push(rp);
    fin([[4.6, -.55], [6.4, -.55], [6.2, -1.0], [5.4, -1.0]], .08, 0);
    for (const side of [1, -1]) { const sp = pivot(0, -.05, 6.0); plate([[.45 * side, -.4], [2.0 * side, .5], [2.0 * side, .9], [.45 * side, .9]], .07, 0, under, false, sp); parts.stabs.push(sp); }
    const cp = pivot(0, .5, -4.4); const c = mesh(new T.SphereGeometry(.45, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, cp); c.scale.set(.95, .75, 2); c.position.z = .9; parts.canopy = cp;
    wheel(1.35, 1.0, .33, H); wheel(-1.35, 1.0, .33, H); wheel(0, -4.5, .25, H);
    decal(starTex, .9, .9, [.07, 1.5, 5.6], Math.PI / 2); decal(starTex, .9, .9, [-.07, 1.5, 5.6], -Math.PI / 2);
    decal(bortTex, .9, .45, [.69, .15, -5.6], Math.PI / 2); decal(bortTex, .9, .45, [-.69, .15, -5.6], -Math.PI / 2);
  } else if (type === 'MiG-23') {
    H = 1.9; spec = { length: 16.7, span: 13.97 };
    lathe([[.55, -8.35], [.65, -7.8], [.75, -5], [.78, -1], [.72, 2], [.62, 4.5], [.5, 6], [.45, 6.9]], skin);
    const cone = mesh(new T.ConeGeometry(.45, 1.5, 24), radome); cone.rotation.x = -Math.PI / 2; cone.position.z = -7.65;
    const tail = mesh(new T.CylinderGeometry(.55, .5, .3, 24, 1, true), nozzle); tail.rotation.x = Math.PI / 2; tail.position.z = 8.4;
    mesh(new T.CircleGeometry(.5, 24), dark).position.z = 8.3;
    for (const side of [1, -1]) {
      const intake = mesh(new T.BoxGeometry(.5, 1.0, 6.2), skin); intake.position.set(side * .82, -.05, -1.4);
      mesh(new T.BoxGeometry(.42, .9, .05), dark).position.set(side * .84, -.05, -4.52);
    }
    mesh(new T.BoxGeometry(.6, .03, 1.4), dark).position.set(0, .68, -6.2);
    wing([[.8, -1.0], [2.1, .5], [2.1, 2.0], [.8, 2.0]], .2, .1);
    for (const side of [1, -1]) {
      const wp = pivot(side * 2.0, .1, .9); wp.userData.side = side;
      wing([[0, -.7], [5.0 * side, .75], [5.0 * side, 1.95], [0, 1.9]].map(([x, z]) => [x, z]), .14, 0, wp, false);
      const light = new T.Mesh(new T.SphereGeometry(.08, 10, 8), M(side > 0 ? 'green' : 'red', () => new T.MeshStandardMaterial({ color: side > 0 ? '#3cff6a' : '#ff3a3a', emissive: side > 0 ? '#1aff4a' : '#ff1a1a', emissiveIntensity: 0 })));
      light.position.set(5.0 * side, 0, 1.3); wp.add(light); parts.lights.push(light); parts.wings.push(wp);
    }
    fins = [fin([[2.4, .6], [7.6, .6], [8.0, 2.9], [6.8, 2.9]], .14, 0)];
    const rp = pivot(0, 0, 7.5); fin([[0, .8], [.7, .8], [.75, 2.8], [0, 2.8]], .09, 0, 0, rp); parts.rudders.push(rp);
    fin([[5.5, -.6], [7.8, -.6], [7.6, -1.3], [6.4, -1.3]], .09, 0);
    for (const side of [1, -1]) { const sp = pivot(0, -.1, 7.2); plate([[.55 * side, -.6], [2.9 * side, .7], [2.9 * side, 1.3], [.55 * side, 1.1]], .08, 0, under, false, sp); parts.stabs.push(sp); }
    const cp = pivot(0, .55, -5.6); const c = mesh(new T.SphereGeometry(.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, cp); c.scale.set(.95, .8, 1.9); c.position.z = 1.0; parts.canopy = cp;
    wheel(1.33, .8, .38, H); wheel(-1.33, .8, .38, H); wheel(0, -5.2, .3, H);
    decal(starTex, 1.1, 1.1, [.09, 1.9, 6.2], Math.PI / 2); decal(starTex, 1.1, 1.1, [-.09, 1.9, 6.2], -Math.PI / 2);
    decal(bortTex, 1, .5, [.76, .2, -5.4], Math.PI / 2); decal(bortTex, 1, .5, [-.76, .2, -5.4], -Math.PI / 2);
  } else {
    // The twin-engined pair: the Su-27 is the MiG-29's bigger cousin, with a tail stinger.
    const su = type === 'Su-27', k = su ? 1.27 : 1; H = su ? 2.25 : 1.85; spec = { length: su ? 21.9 : 17.3, span: su ? 14.7 : 11.36 };
    const S = v => v * k;
    lathe([[S(.85), S(-2)], [S(.85), S(2)], [S(.75), S(4)], [S(.6), S(5.5)], [S(.45), S(6.8)], [S(.42), S(7.0)]], skin);
    const cone = mesh(new T.ConeGeometry(S(.42), S(1.65), 24), radome); cone.rotation.x = -Math.PI / 2; cone.position.z = S(-7.82);
    const deck = mesh(new T.SphereGeometry(1, 28, 12), skin); deck.scale.set(S(2.15), S(.42), S(6.4)); deck.position.set(0, S(.05), S(1.6));
    for (const side of [1, -1]) {
      const x = side * S(1.05), nac = lathe([[S(.55), S(-6.4)], [S(.6), S(-5)], [S(.62), S(-1)], [S(.58), S(2.5)], [S(.55), S(3.6)]], skin, 1, [x, S(-.38), 0]);
      nac.scale.y = 1;
      const intake = mesh(new T.BoxGeometry(S(.9), S(.85), S(2.4)), skin); intake.position.set(x, S(-.42), S(-3.0));
      mesh(new T.BoxGeometry(S(.8), S(.72), .05), dark).position.set(x, S(-.42), S(-4.22));
      const nz = mesh(new T.CylinderGeometry(S(.5), S(.56), S(.7), 20, 1, true), nozzle); nz.rotation.x = Math.PI / 2; nz.position.set(x, S(-.38), S(6.75));
      const hole = mesh(new T.CircleGeometry(S(.48), 20), dark); hole.position.set(x, S(-.38), S(6.6));
    }
    if (su) { const st = lathe([[S(.05), S(-10.2)], [S(.3), S(-9.4)], [S(.42), S(-7.5)], [S(.45), S(-6)]], skin); st.geometry.computeVertexNormals(); }
    wing([[S(.7), S(-5.2)], [S(1.6), S(-1.6)], [S(2.0), S(.6)], [S(.7), S(1.0)]], S(.14), S(.05));
    wing([[S(1.6), S(-1.6)], [spec.span / 2, S(2.6)], [spec.span / 2, S(3.5)], [S(2.2), S(4.4)], [S(1.4), S(4.4)]], S(.16), 0);
    const fx = su ? S(1.75) : S(1.45), cant = su ? 0 : .1;
    for (const side of [1, -1]) {
      fins.push(fin([[S(3.4), S(.4)], [S(6.7), S(.4)], [S(7.4), S(2.85)], [S(6.2), S(2.85)]], S(.12), side * fx, side * cant));
      const rp = pivot(side * fx, 0, S(6.6)); rp.rotation.z = -side * cant; fin([[0, S(.6)], [S(.75), S(.6)], [S(.8), S(2.7)], [0, S(2.7)]], S(.08), 0, 0, rp); parts.rudders.push(rp);
      const sp = pivot(side * S(1.3), S(-.3), S(6.8)); plate([[0, S(-.6)], [side * S(2.6), S(.6)], [side * S(2.6), S(1.2)], [0, S(1.4)]], S(.08), 0, under, false, sp); parts.stabs.push(sp);
      const light = new T.Mesh(new T.SphereGeometry(.09, 10, 8), M(side > 0 ? 'green' : 'red', () => new T.MeshStandardMaterial({ color: side > 0 ? '#3cff6a' : '#ff3a3a', emissive: side > 0 ? '#1aff4a' : '#ff1a1a', emissiveIntensity: 0 })));
      light.position.set(side * spec.span / 2, 0, S(3.0)); body.add(light); parts.lights.push(light);
      decal(starTex, S(1.1), S(1.1), [side * fx + side * S(.08), S(1.7), S(5.6)], side * Math.PI / 2);
      decal(bortTex, S(.9), S(.45), [side * S(.8), S(.1), S(-4.8)], side * Math.PI / 2);
    }
    const cp = pivot(0, S(.62), S(-5.8)); const c = mesh(new T.SphereGeometry(S(.5), 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, cp); c.scale.set(.95, .85, 2.1); c.position.z = S(1.0); parts.canopy = cp;
    mesh(new T.BoxGeometry(S(.55), .03, S(1.2)), dark).position.set(0, S(.74), S(-6.5));
    wheel(S(1.55), S(1.8), S(.38), H); wheel(-S(1.55), S(1.8), S(.38), H); wheel(0, S(-4.6), S(.28), H);
  }
  // Nav lights for the single-engined MiG-21 (the others have theirs on the wing tips above).
  if (type === 'MiG-21') for (const side of [1, -1]) { const light = new T.Mesh(new T.SphereGeometry(.07, 10, 8), M(side > 0 ? 'green' : 'red', () => new T.MeshStandardMaterial({ color: side > 0 ? '#3cff6a' : '#ff3a3a', emissive: side > 0 ? '#1aff4a' : '#ff1a1a', emissiveIntensity: 0 }))); light.position.set(side * 3.57, -.15, 3.0); body.add(light); parts.lights.push(light); }
  body.position.y = H; body.rotation.y = Math.PI;   // nose to the visitors
  root.userData = { type, parts, H, spec, fins, gears };
  return root;
}

// Static meshes of one jet merge by material (draw calls); pivots and lights stay live.
function mergeStatic(root, keep) {
  root.updateMatrixWorld(true);
  const body = root.children[0], buckets = new Map(), stale = [];
  const inv = new T.Matrix4().copy(body.matrixWorld).invert();
  for (const o of [...body.children]) {
    if (!o.isMesh || o.material.transparent && o.material.depthWrite === false) continue;
    let g = o.geometry.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (g.index) { const f = g.toNonIndexed(); g.dispose(); g = f; }
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    (buckets.get(o.material) ?? buckets.set(o.material, []).get(o.material)).push(g); stale.push(o);
  }
  for (const o of stale) { body.remove(o); o.geometry.dispose(); }
  for (const [m, gs] of buckets) { const g = mergeGeometries(gs, false); gs.forEach(x => x.dispose()); const mesh = new T.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; body.add(mesh); keep.push(g); }
}

function plaque(j, keep) {
  const tex = canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = '#1b3339'; x.fillRect(0, 0, w, h); x.fillStyle = '#f6d58c'; x.fillRect(0, 0, w, 12);
    x.fillStyle = '#f6d58c'; x.font = '800 46px system-ui'; x.textAlign = 'left'; x.fillText(j.name, 24, 70, w - 48);
    x.fillStyle = '#e8efe9'; x.font = '500 28px system-ui'; const words = j.fact.split(' '); let line = '', y = 118;
    for (const word of words) { const next = line ? line + ' ' + word : word; if (x.measureText(next).width > w - 48) { x.fillText(line, 24, y); line = word; y += 34; } else line = next; }
    if (line) x.fillText(line, 24, y);
  });
  keep.push(tex);
  const g = new T.Group(), m = new T.MeshStandardMaterial({ map: tex, roughness: .6 }); keep.push(m);
  const face = new T.Mesh(new T.PlaneGeometry(1.4, .7), m); face.position.y = .62; face.rotation.x = -.35; g.add(face); keep.push(face.geometry);
  return g;
}

export function createPettingZoo(scene, world) {
  const root = new T.Group(); root.name = 'PettingZoo'; const keep = [], state = createZooState(), jets = new Map();
  const brass = new T.MeshStandardMaterial({ color: '#c9a24a', metalness: .85, roughness: .3 }), rope = new T.MeshStandardMaterial({ color: '#b3202a', roughness: .8 }), straw = new T.MeshStandardMaterial({ color: '#d6b25e', roughness: 1 }), post = new T.MeshStandardMaterial({ color: '#3a4448', roughness: .6 });
  keep.push(brass, rope, straw, post);
  const posts = [], ropes = [], bales = [];
  const at = (g, x, y, z) => { g.translate(x, y, z); return g; };
  for (const j of ZOO_JETS) {
    const jet = buildJet(j.type, keep); mergeStatic(jet, keep); jet.position.set(j.at[0], 0, j.at[1]); root.add(jet);
    const { spec, parts } = jet.userData; jets.set(j.type, { jet, parts, wake: 0 });
    // Some jets have a ramp up onto the wing from behind (jet-decks.mjs): their skin is solid.
    for (const r of ZOO_RAMPS.filter(r => r.type === j.type)) {
      jet.updateMatrixWorld(true); addDeck(world, jet.children[0].children.filter(o => o.isMesh));
      const e = findEdge(world, r, [j.at[1] - 16, j.at[1] + 12]); if (e) addRamp(root, world, r, e.edge, e.top, keep);
    }
    // Wheels are solid: you can bump the jet's legs, but never get stuck under it.
    for (const [gx, gz] of jet.userData.gears) addBox(world, j.at[0] - gx, j.at[1] - gz, .5, .5, 0, 1.2);   // turned to face +z
    // The pen: brass posts round the jet, rope at .5 m (the car rolls under it), open at the nose.
    const rx = spec.span / 2 + 2.2, rz = spec.length / 2 + 2.2, n = 18, pts = [];
    for (let i = 0; i <= n; i++) { const a = Math.PI * .62 + i / n * Math.PI * 1.76; pts.push([j.at[0] + Math.sin(a) * rx, j.at[1] + Math.cos(a) * rz]); }
    for (const [x, z] of pts) { posts.push(at(new T.CylinderGeometry(.05, .07, .7, 10), x, .35, z), at(new T.SphereGeometry(.08, 10, 8), x, .72, z), at(new T.CylinderGeometry(.18, .2, .05, 14), x, .025, z)); }
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], len = Math.hypot(bx - ax, bz - az), mid = new T.Vector3((ax + bx) / 2, .5, (az + bz) / 2);
      const curve = new T.QuadraticBezierCurve3(new T.Vector3(ax, .62, az), new T.Vector3(mid.x, .38, mid.z), new T.Vector3(bx, .62, bz));
      ropes.push(new T.TubeGeometry(curve, 8, .025, 6, false)); void len;
    }
    // Straw and a feed trough, because it's a zoo.
    for (const [dx, dz, r] of [[-rx * .7, -rz * .5, .2], [rx * .75, -rz * .3, -.3], [-rx * .55, rz * .4, .5]]) { const b = new T.BoxGeometry(1.2, .55, .7); b.rotateY(r); bales.push(at(b, j.at[0] + dx, .275, j.at[1] + dz)); }
    const p = plaque(j, keep); p.position.set(j.at[0] + 2.6, 0, j.at[1] + rz + .6); root.add(p);
    posts.push(at(new T.CylinderGeometry(.04, .04, .45, 8), j.at[0] + 2.6, .22, j.at[1] + rz + .6));
  }
  // The gate: an arch over the way in, with the zoo's name, and a sign that isn't joking.
  const [gx, gz] = ZOO.gate;
  for (const side of [-1, 1]) { posts.push(at(new T.CylinderGeometry(.35, .4, 7, 14), gx + side * 7, 3.5, gz)); addBox(world, gx + side * 7, gz, .8, .8, 0, 7); }
  const arch = canvasTex(1024, 256, (x, w, h) => { x.fillStyle = '#1b3339'; x.fillRect(0, 0, w, h); x.strokeStyle = '#f6d58c'; x.lineWidth = 14; x.strokeRect(10, 10, w - 20, h - 20); x.fillStyle = '#f6d58c'; x.font = '900 120px system-ui'; x.textAlign = 'center'; x.fillText('PETTING ZOO', w / 2, 170); });
  const archMat = new T.MeshStandardMaterial({ map: arch, roughness: .6 }), archMesh = new T.Mesh(new T.PlaneGeometry(13, 3.25), archMat); archMesh.position.set(gx, 6.2, gz + .02); root.add(archMesh); const archBack = archMesh.clone(); archBack.position.z = gz - .02; archBack.rotation.y = Math.PI; root.add(archBack); keep.push(arch, archMat, archMesh.geometry);
  const feed = canvasTex(512, 256, (x, w, h) => { x.fillStyle = '#f3efe1'; x.fillRect(0, 0, w, h); x.fillStyle = '#b3202a'; x.fillRect(0, 0, w, 16); x.font = '900 54px system-ui'; x.textAlign = 'center'; x.fillText('PLEASE DON’T', w / 2, 92); x.fillText('FEED THE MiGs', w / 2, 160); x.fillStyle = '#1b3339'; x.font = '600 30px system-ui'; x.fillText('(they only eat jet fuel)', w / 2, 220); });
  const feedMat = new T.MeshStandardMaterial({ map: feed, roughness: .6 }), feedSign = new T.Mesh(new T.PlaneGeometry(1.6, .8), feedMat); feedSign.position.set(gx + 4, .9, gz - 1.5); root.add(feedSign); keep.push(feed, feedMat, feedSign.geometry);
  posts.push(at(new T.CylinderGeometry(.05, .05, .9, 8), gx + 4, .45, gz - 1.52));
  for (const [gs, m] of [[posts, brass], [ropes, rope], [bales, straw]]) {
    const flat = gs.map(g => { const f = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(f.attributes)) if (!['position', 'normal', 'uv'].includes(k)) f.deleteAttribute(k); return f; });
    const g = mergeGeometries(flat, false); gs.forEach(x => x.dispose()); const mesh = new T.Mesh(g, m); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); keep.push(g);
  }
  void post;
  scene.add(root);
  let time = 0;
  return {
    root,
    /** One frame: wakes the jets near the car and returns facts to tell ({ zoo, name, text }). */
    step(pos, dt) {
      time += dt;
      const far = Math.hypot(pos[0] - gx, pos[2] - gz) > ZOO.show; root.visible = !far; if (far) return [];
      const events = stepZoo(state, pos, time);
      for (const [type, j] of jets) {
        j.wake = Math.max(0, Math.min(1, j.wake + (state.awake.get(type) ? dt * .8 : -dt * .5))); const w = j.wake * j.wake * (3 - 2 * j.wake), p = j.parts;
        if (p.canopy) p.canopy.rotation.x = -.75 * w;
        p.rudders.forEach((r, i) => { r.rotation.y = Math.sin(time * 7 + i) * .38 * w; });
        p.stabs.forEach((s, i) => { s.rotation.x = Math.sin(time * 2.2 + i * Math.PI) * .12 * w; });
        // The MiG-23 waves: its wings sweep from 16° to 72° and back.
        p.wings.forEach(g => { const sweep = (16 + (72 - 16) * (.5 - .5 * Math.cos(time * 1.3))) * Math.PI / 180, rest = 16 * Math.PI / 180; g.rotation.y = -g.userData.side * (rest + (sweep - rest) * w - rest); });
        const blink = w > .1 && (time * 1.5 % 1) < .25 ? 2.5 : 0; p.lights.forEach(l => { l.material.emissiveIntensity = blink; });
      }
      return events;
    },
    dispose() { root.removeFromParent(); keep.forEach(x => x.dispose?.()); },
  };
}
