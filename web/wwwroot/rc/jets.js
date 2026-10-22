// Toy jet body shells for the RC buggy: a real 1:10 chassis wearing a lexan shell shaped like a
// real jet (owner, 2026-10-22: "RC cars with toy plane bodies that resemble real jets").
// Car-local units, nose toward -Z, before VISUAL_SCALE. Wheels sit at x ±0.29, z ±0.25, top y ≈ 0.08,
// so wings ride at y ≈ 0.15 over the tyres like an oversized body shell.
import * as T from '../vendor/three.module.js';

export const JET_KINDS = ['viper', 'eagle', 'hog', 'raptor', 'flanker'];
export const JET_NAMES = { viper: 'F-16 Viper', eagle: 'F-15 Eagle', hog: 'A-10 Warthog', raptor: 'F-22 Raptor', flanker: 'Su-27 Flanker' };
// Shell nodes on buggy.glb that the jet shell replaces; the chassis, shocks and wheels stay visible.
// (graphite is the tub + antenna; a flat plate and our own antenna stand in for it.)
const BUGGY_SHELL = ['Mesh_Body_shell', 'RakedCanopy', 'Mesh_Body_ivory', 'Mesh_Body_graphite'];

function paintMat(color) { return new T.MeshStandardMaterial({ color, roughness: .38, metalness: .05 }); }
const glass = () => new T.MeshStandardMaterial({ color: '#2b2412', roughness: .08, metalness: .85 });
const dark = () => new T.MeshStandardMaterial({ color: '#2a2f33', roughness: .7 });

// A flat plate from [x, z] outline points, thickness t, at height y.
function plate(pts, t, y, mat) {
  const s = new T.Shape(pts.map(([x, z]) => new T.Vector2(x, z)));
  const g = new T.ExtrudeGeometry(s, { depth: t, bevelEnabled: false }); g.rotateX(Math.PI / 2); g.translate(0, y + t / 2, 0);
  return new T.Mesh(g, mat);
}
// Mirror an outline drawn for the right side (x > 0) to make a symmetric pair in one plate.
const both = pts => [...pts, ...pts.slice().reverse().map(([x, z]) => [-x, z])];
// A vertical fin from [z, height] points, rooted at (x, y), canted by `cant` radians.
function fin(pts, x, y, mat, cant = 0) {
  const s = new T.Shape(pts.map(([z, h]) => new T.Vector2(-z, h)));
  const g = new T.ExtrudeGeometry(s, { depth: .012, bevelEnabled: false }); g.translate(0, 0, -.006); g.rotateY(Math.PI / 2);
  const m = new T.Mesh(g, mat); m.position.set(x, y, 0); m.rotation.z = cant; return m;
}
// A body of revolution along Z: radii from nose (z0) to tail (z1).
function tube(r0, r1, z0, z1, y, mat, x = 0, seg = 14) {
  const g = new T.CylinderGeometry(r0, r1, z1 - z0, seg); g.rotateX(-Math.PI / 2);
  const m = new T.Mesh(g, mat); m.position.set(x, y, (z0 + z1) / 2); return m;
}
function cone(r, z0, len, y, mat, x = 0) {
  const g = new T.ConeGeometry(r, len, 14); g.rotateX(-Math.PI / 2);
  const m = new T.Mesh(g, mat); m.position.set(x, y, z0 - len / 2); return m;
}
function canopy(z, y, len, w, h) {
  const m = new T.Mesh(new T.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass());
  m.scale.set(w, h, len); m.position.set(0, y, z); return m;
}

const BUILD = {
  viper(p, g) { // F-16: single fin, chin intake, bubble canopy, cropped delta.
    g.add(tube(.065, .085, -.42, .4, .2, p), cone(.065, -.42, .2, .2, p), canopy(-.3, .25, .17, .06, .075));
    g.add(plate(both([[.07, -.08], [.4, .17], [.4, .24], [.07, .26]]), .016, .16, p));
    g.add(plate(both([[.07, .3], [.22, .4], [.22, .44], [.07, .44]]), .012, .17, p));
    g.add(fin([[.18, 0], [.38, .23], [.44, .23], [.44, 0]], 0, .26, p));
    const intake = new T.Mesh(new T.BoxGeometry(.1, .06, .2), dark()); intake.position.set(0, .12, -.2); g.add(intake);
  },
  eagle(p, g) { // F-15: wide body, box intakes, big wing, twin upright fins.
    g.add(tube(.06, .095, -.4, .4, .2, p), cone(.06, -.4, .2, .2, p), canopy(-.3, .25, .15, .055, .07));
    for (const x of [-.11, .11]) { const b = new T.Mesh(new T.BoxGeometry(.08, .1, .45), p); b.position.set(x, .19, .02); g.add(b); }
    g.add(plate(both([[.12, -.06], [.44, .2], [.44, .27], [.12, .28]]), .016, .16, p));
    g.add(plate(both([[.1, .3], [.27, .4], [.27, .45], [.1, .45]]), .012, .16, p));
    for (const x of [-.11, .11]) g.add(fin([[.2, 0], [.36, .2], [.43, .2], [.43, 0]], x, .23, p));
  },
  hog(p, g) { // A-10: straight wings, podded engines on top, twin fins on the tailplane, the gun.
    g.add(tube(.075, .07, -.38, .38, .2, p), canopy(-.24, .26, .12, .065, .07));
    const nose = new T.Mesh(new T.SphereGeometry(.075, 14, 10), p); nose.scale.z = 1.6; nose.position.set(0, .2, -.38); g.add(nose);
    g.add(tube(.012, .012, -.62, -.48, .17, dark()));
    g.add(plate(both([[.07, -.04], [.48, -.01], [.48, .1], [.07, .12]]), .02, .16, p));
    for (const x of [-.1, .1]) { g.add(tube(.05, .05, .1, .3, .31, p, x)); g.add(tube(.035, .035, .1, .12, .31, dark(), x, 12)); }
    g.add(plate(both([[.05, .33], [.22, .33], [.22, .43], [.05, .43]]), .014, .22, p));
    for (const x of [-.22, .22]) g.add(fin([[.3, -.05], [.33, .13], [.45, .13], [.45, -.05]], x, .23, p));
  },
  raptor(p, g) { // F-22: diamond wing, chined nose, canted twin fins.
    g.add(tube(.05, .095, -.4, .4, .2, p), cone(.05, -.4, .22, .2, p), canopy(-.28, .25, .17, .055, .065));
    g.add(plate(both([[.08, -.18], [.24, -.02], [.46, .2], [.44, .27], [.1, .3]]), .016, .16, p));
    g.add(plate(both([[.09, .32], [.27, .42], [.24, .47], [.09, .45]]), .012, .16, p));
    for (const s of [-1, 1]) g.add(fin([[.2, 0], [.34, .2], [.42, .2], [.42, 0]], s * .12, .22, p, s * -.45));
  },
  flanker(p, g) { // Su-27: long drooped nose, tunnel between podded engines, outboard fins, tail stinger.
    g.add(tube(.05, .07, -.44, .2, .21, p), cone(.05, -.44, .24, .2, p), canopy(-.32, .26, .15, .055, .07));
    for (const x of [-.1, .1]) g.add(tube(.06, .06, -.1, .42, .17, p, x));
    g.add(tube(.04, .02, .2, .5, .2, p));
    g.add(plate(both([[.1, -.18], [.18, -.04], [.45, .2], [.45, .27], [.12, .28]]), .016, .16, p));
    g.add(plate(both([[.12, .32], [.3, .42], [.3, .46], [.12, .46]]), .012, .15, p));
    for (const x of [-.2, .2]) g.add(fin([[.18, 0], [.34, .2], [.42, .2], [.42, 0]], x, .18, p));
  },
};

export function makeJetShell(kind, color) {
  const g = new T.Group(); g.name = 'JetShell'; const p = paintMat(color);
  (BUILD[kind] || BUILD.viper)(p, g);
  const plateMesh = new T.Mesh(new T.BoxGeometry(.4, .03, .82), dark()); plateMesh.position.set(0, .03, -.04); g.add(plateMesh);
  const aerial = new T.Mesh(new T.CylinderGeometry(.004, .004, .42, 6), dark()); aerial.position.set(.13, .38, .14); g.add(aerial);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Swap the buggy's own body shell for a jet shell; returns the car for chaining.
export function fitJetShell(car, kind, color) {
  car.getObjectByName('JetShell')?.removeFromParent();
  for (const n of BUGGY_SHELL) { const o = car.getObjectByName(n); if (o) o.visible = false; }
  car.add(makeJetShell(kind, color)); return car;
}
