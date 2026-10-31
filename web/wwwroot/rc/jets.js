// Toy jet body shells for the RC buggy: a real 1:10 chassis wearing a lexan shell shaped like a
// real jet (owner, 2026-10-22: "RC cars with toy plane bodies that resemble real jets").
// Car-local units, nose toward -Z. Fit each shell to the same 1:10 envelope.
import * as T from '../vendor/three.module.js';
import {VISUAL_SCALE} from './physics/car.mjs';

export const JET_KINDS = ['viper', 'eagle', 'hog', 'raptor', 'flanker'];
export const JET_NAMES = {
  viper: 'F-16 Viper',
  eagle: 'F-15 Eagle',
  hog: 'A-10 Warthog',
  raptor: 'F-22 Raptor',
  flanker: 'Su-27 Flanker'
};
// Shell nodes on buggy.glb that the jet shell replaces; the chassis, shocks and wheels stay visible.
// (graphite is the tub + antenna; a flat plate and our own antenna stand in for it.)
const BUGGY_SHELL = ['Mesh_Body_shell', 'RakedCanopy', 'Mesh_Body_ivory', 'Mesh_Body_graphite'];

function paintMat(color) {
  return new T.MeshStandardMaterial({color, roughness: 0.38, metalness: 0.05});
}
const glass = () => new T.MeshStandardMaterial({color: '#2b2412', roughness: 0.08, metalness: 0.85});
const dark = () => new T.MeshStandardMaterial({color: '#2a2f33', roughness: 0.7});

// A flat plate from [x, z] outline points, thickness t, at height y.
function plate(pts, t, y, mat) {
  const s = new T.Shape(pts.map(([x, z]) => new T.Vector2(x, z)));
  const g = new T.ExtrudeGeometry(s, {depth: t, bevelEnabled: false});
  g.rotateX(Math.PI / 2);
  g.translate(0, y + t / 2, 0);
  return new T.Mesh(g, mat);
}
// Mirror an outline drawn for the right side (x > 0) to make a symmetric pair in one plate.
const both = pts => [
  ...pts,
  ...pts
    .slice()
    .reverse()
    .map(([x, z]) => [-x, z])
];
// A vertical fin from [z, height] points, rooted at (x, y), canted by `cant` radians.
function fin(pts, x, y, mat, cant = 0) {
  const s = new T.Shape(pts.map(([z, h]) => new T.Vector2(-z, h)));
  const g = new T.ExtrudeGeometry(s, {depth: 0.012, bevelEnabled: false});
  g.translate(0, 0, -0.006);
  g.rotateY(Math.PI / 2);
  const m = new T.Mesh(g, mat);
  m.position.set(x, y, 0);
  m.rotation.z = cant;
  return m;
}
// A body of revolution along Z: radii from nose (z0) to tail (z1).
function tube(r0, r1, z0, z1, y, mat, x = 0, seg = 14) {
  const g = new T.CylinderGeometry(r0, r1, z1 - z0, seg);
  g.rotateX(-Math.PI / 2);
  const m = new T.Mesh(g, mat);
  m.position.set(x, y, (z0 + z1) / 2);
  return m;
}
function cone(r, z0, len, y, mat, x = 0) {
  const g = new T.ConeGeometry(r, len, 14);
  g.rotateX(-Math.PI / 2);
  const m = new T.Mesh(g, mat);
  m.position.set(x, y, z0 - len / 2);
  return m;
}
function canopy(z, y, len, w, h) {
  const m = new T.Mesh(new T.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass());
  m.scale.set(w, h, len);
  m.position.set(0, y, z);
  return m;
}

const BUILD = {
  viper(p, g) {
    // F-16: single fin, chin intake, bubble canopy, cropped delta.
    g.add(
      tube(0.065, 0.085, -0.42, 0.4, 0.2, p),
      cone(0.065, -0.42, 0.2, 0.2, p),
      canopy(-0.3, 0.25, 0.17, 0.06, 0.075)
    );
    g.add(
      plate(
        both([
          [0.07, -0.08],
          [0.4, 0.17],
          [0.4, 0.24],
          [0.07, 0.26]
        ]),
        0.016,
        0.16,
        p
      )
    );
    g.add(
      plate(
        both([
          [0.07, 0.3],
          [0.22, 0.4],
          [0.22, 0.44],
          [0.07, 0.44]
        ]),
        0.012,
        0.17,
        p
      )
    );
    g.add(
      fin(
        [
          [0.18, 0],
          [0.38, 0.23],
          [0.44, 0.23],
          [0.44, 0]
        ],
        0,
        0.26,
        p
      )
    );
    const intake = new T.Mesh(new T.BoxGeometry(0.1, 0.06, 0.2), dark());
    intake.position.set(0, 0.12, -0.2);
    g.add(intake);
  },
  eagle(p, g) {
    // F-15: wide body, box intakes, big wing, twin upright fins.
    g.add(
      tube(0.06, 0.095, -0.4, 0.4, 0.2, p),
      cone(0.06, -0.4, 0.2, 0.2, p),
      canopy(-0.3, 0.25, 0.15, 0.055, 0.07)
    );
    for (const x of [-0.11, 0.11]) {
      const b = new T.Mesh(new T.BoxGeometry(0.08, 0.1, 0.45), p);
      b.position.set(x, 0.19, 0.02);
      g.add(b);
    }
    g.add(
      plate(
        both([
          [0.12, -0.06],
          [0.44, 0.2],
          [0.44, 0.27],
          [0.12, 0.28]
        ]),
        0.016,
        0.16,
        p
      )
    );
    g.add(
      plate(
        both([
          [0.1, 0.3],
          [0.27, 0.4],
          [0.27, 0.45],
          [0.1, 0.45]
        ]),
        0.012,
        0.16,
        p
      )
    );
    for (const x of [-0.11, 0.11])
      g.add(
        fin(
          [
            [0.2, 0],
            [0.36, 0.2],
            [0.43, 0.2],
            [0.43, 0]
          ],
          x,
          0.23,
          p
        )
      );
  },
  hog(p, g) {
    // A-10: straight wings, podded engines on top, twin fins on the tailplane, the gun.
    g.add(tube(0.075, 0.07, -0.38, 0.38, 0.2, p), canopy(-0.24, 0.26, 0.12, 0.065, 0.07));
    const nose = new T.Mesh(new T.SphereGeometry(0.075, 14, 10), p);
    nose.scale.z = 1.6;
    nose.position.set(0, 0.2, -0.38);
    g.add(nose);
    g.add(tube(0.012, 0.012, -0.62, -0.48, 0.17, dark()));
    g.add(
      plate(
        both([
          [0.07, -0.04],
          [0.48, -0.01],
          [0.48, 0.1],
          [0.07, 0.12]
        ]),
        0.02,
        0.16,
        p
      )
    );
    for (const x of [-0.1, 0.1]) {
      g.add(tube(0.05, 0.05, 0.1, 0.3, 0.31, p, x));
      g.add(tube(0.035, 0.035, 0.1, 0.12, 0.31, dark(), x, 12));
    }
    g.add(
      plate(
        both([
          [0.05, 0.33],
          [0.22, 0.33],
          [0.22, 0.43],
          [0.05, 0.43]
        ]),
        0.014,
        0.22,
        p
      )
    );
    for (const x of [-0.22, 0.22])
      g.add(
        fin(
          [
            [0.3, -0.05],
            [0.33, 0.13],
            [0.45, 0.13],
            [0.45, -0.05]
          ],
          x,
          0.23,
          p
        )
      );
  },
  raptor(p, g) {
    // F-22: diamond wing, chined nose, canted twin fins.
    g.add(
      tube(0.05, 0.095, -0.4, 0.4, 0.2, p),
      cone(0.05, -0.4, 0.22, 0.2, p),
      canopy(-0.28, 0.25, 0.17, 0.055, 0.065)
    );
    g.add(
      plate(
        both([
          [0.08, -0.18],
          [0.24, -0.02],
          [0.46, 0.2],
          [0.44, 0.27],
          [0.1, 0.3]
        ]),
        0.016,
        0.16,
        p
      )
    );
    g.add(
      plate(
        both([
          [0.09, 0.32],
          [0.27, 0.42],
          [0.24, 0.47],
          [0.09, 0.45]
        ]),
        0.012,
        0.16,
        p
      )
    );
    for (const s of [-1, 1])
      g.add(
        fin(
          [
            [0.2, 0],
            [0.34, 0.2],
            [0.42, 0.2],
            [0.42, 0]
          ],
          s * 0.12,
          0.22,
          p,
          s * -0.45
        )
      );
  },
  flanker(p, g) {
    // Su-27: long drooped nose, tunnel between podded engines, outboard fins, tail stinger.
    g.add(
      tube(0.05, 0.07, -0.44, 0.2, 0.21, p),
      cone(0.05, -0.44, 0.24, 0.2, p),
      canopy(-0.32, 0.26, 0.15, 0.055, 0.07)
    );
    for (const x of [-0.1, 0.1]) g.add(tube(0.06, 0.06, -0.1, 0.42, 0.17, p, x));
    g.add(tube(0.04, 0.02, 0.2, 0.5, 0.2, p));
    g.add(
      plate(
        both([
          [0.1, -0.18],
          [0.18, -0.04],
          [0.45, 0.2],
          [0.45, 0.27],
          [0.12, 0.28]
        ]),
        0.016,
        0.16,
        p
      )
    );
    g.add(
      plate(
        both([
          [0.12, 0.32],
          [0.3, 0.42],
          [0.3, 0.46],
          [0.12, 0.46]
        ]),
        0.012,
        0.15,
        p
      )
    );
    for (const x of [-0.2, 0.2])
      g.add(
        fin(
          [
            [0.18, 0],
            [0.34, 0.2],
            [0.42, 0.2],
            [0.42, 0]
          ],
          x,
          0.18,
          p
        )
      );
  }
};

export function makeJetShell(kind, color) {
  const g = new T.Group();
  g.name = 'JetShell';
  g.userData.kind = kind;
  const p = paintMat(color);
  (BUILD[kind] || BUILD.viper)(p, g);
  const plateMesh = new T.Mesh(new T.BoxGeometry(0.4, 0.03, 0.82), dark());
  plateMesh.position.set(0, 0.03, -0.04);
  g.add(plateMesh);
  const aerial = new T.Mesh(new T.CylinderGeometry(0.004, 0.004, 0.42, 6), dark());
  aerial.position.set(0.13, 0.38, 0.14);
  g.add(aerial);
  g.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  const size = new T.Box3().setFromObject(g).getSize(new T.Vector3());
  g.scale.set(0.32 / (size.x * VISUAL_SCALE), 0.8, 0.42 / (size.z * VISUAL_SCALE));
  return g;
}

// Swap the buggy's own body shell for a jet shell; returns the car for chaining.
export function fitJetShell(car, kind, color) {
  car.getObjectByName('JetShell')?.removeFromParent();
  for (const n of BUGGY_SHELL) {
    const o = car.getObjectByName(n);
    if (o) o.visible = false;
  }
  car.add(makeJetShell(kind, color));
  return car;
}

// Nose art. Each type's main fuselage tube as [nose radius, tail radius, nose z, tail z, y]; the art
// is a transparent sleeve over the whole tube, painted on a canvas that wraps the fuselage.
// Canvas x runs round the fuselage (0 = spine, 0.25 = right side, 0.5 = belly, 0.75 = left side);
// canvas top is the nose. The chase camera sees the spine, sides and tail, so the kill marks and
// stripes live there; the shark mouth is for whoever you meet head-on.
const NOSE = {
  viper: [0.065, 0.085, -0.42, 0.4, 0.2],
  eagle: [0.06, 0.095, -0.4, 0.4, 0.2],
  hog: [0.075, 0.07, -0.38, 0.38, 0.2],
  raptor: [0.05, 0.095, -0.4, 0.4, 0.2],
  flanker: [0.05, 0.07, -0.44, 0.2, 0.21]
};
// Unlocked by lifetime Furball kills and painted on automatically (owner, 2026-10-22).
export const NOSE_ART = [
  {kills: 1, name: 'SHARK MOUTH'},
  {kills: 3, name: 'LIGHTNING BOLT'},
  {kills: 6, name: 'CHECKERBOARD'},
  {kills: 10, name: 'GOLD STARS'}
];
export const artTier = kills => NOSE_ART.filter(a => kills >= a.kills).length;

function drawNose(tier, marks) {
  const W = 512,
    H = 512,
    cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d');
  if (tier >= 3)
    for (let i = 0; i < 32; i++)
      for (let r = 0; r < 3; r++) {
        c.fillStyle = (i + r) % 2 ? '#111' : '#f4f4f4';
        c.fillRect((i * W) / 32, H - 48 + r * 16, W / 32, 16);
      }
  if (tier >= 1) {
    // Flying Tigers shark mouth, cheek to cheek under the nose, with an eye above each end.
    const x0 = W * 0.14,
      x1 = W * 0.86;
    c.fillStyle = '#b3122a';
    c.beginPath();
    c.moveTo(x0, 24);
    c.quadraticCurveTo(W / 2, 230, x1, 24);
    c.quadraticCurveTo(W / 2, 110, x0, 24);
    c.fill();
    c.fillStyle = '#fff';
    for (let k = 0; k < 15; k++) {
      const t = (k + 0.5) / 15,
        x = x0 + (x1 - x0) * t,
        y = 24 + Math.sin(t * Math.PI) * 84;
      c.beginPath();
      c.moveTo(x - 8, y - 2);
      c.lineTo(x + 8, y - 2);
      c.lineTo(x, y + 16);
      c.fill();
    }
    for (const u of [0.17, 0.83]) {
      c.fillStyle = '#fff';
      c.beginPath();
      c.ellipse(W * u, 30, 20, 15, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#111';
      c.beginPath();
      c.arc(W * u + (u < 0.5 ? 6 : -6), 33, 9, 0, Math.PI * 2);
      c.fill();
    }
  }
  if (tier >= 2) {
    c.fillStyle = '#ffd400';
    for (const u of [0.25, 0.75]) {
      const x = W * u;
      c.beginPath();
      c.moveTo(x - 10, 150);
      c.lineTo(x + 14, 150);
      c.lineTo(x + 2, 260);
      c.lineTo(x + 26, 260);
      c.lineTo(x - 18, 440);
      c.lineTo(x - 4, 300);
      c.lineTo(x - 26, 300);
      c.closePath();
      c.fill();
    }
  }
  const star = (x, y, r, fill) => {
    c.fillStyle = fill;
    c.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5,
        rr = k % 2 ? r * 0.45 : r;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.fill();
  };
  for (let m = 0; m < Math.min(marks, 8); m++)
    for (const x of [W * 0.05, W * 0.95]) star(x, 200 + m * 30, 14, tier >= 4 ? '#ffc61a' : '#e8352e');
  const tex = new T.CanvasTexture(cv);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Repaint a shell's nose art: `tier` from lifetime kills, `marks` = kills this round.
export function paintNoseArt(shell, {tier = 0, marks = 0} = {}) {
  if (!shell) return;
  const key = tier + ':' + marks;
  if (shell.userData.art === key) return;
  shell.userData.art = key;
  const old = shell.getObjectByName('NoseArt');
  if (old) {
    old.material.map.dispose();
    old.material.dispose();
    old.geometry.dispose();
    old.removeFromParent();
  }
  if (!tier && !marks) return;
  const [r0, r1, z0, z1, y] = NOSE[shell.userData.kind] ?? NOSE.viper,
    len = z1 - z0;
  const g = new T.CylinderGeometry(r0 * 1.04, r1 * 1.04, len, 24, 1, true);
  g.rotateX(-Math.PI / 2);
  const m = new T.Mesh(
    g,
    new T.MeshStandardMaterial({
      map: drawNose(tier, marks),
      transparent: true,
      roughness: 0.35,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      depthWrite: false
    })
  );
  m.name = 'NoseArt';
  m.userData.noAO = true;
  m.position.set(0, y, z0 + len / 2);
  shell.add(m);
}
