import * as T from '../../vendor/three.module.js';
import {createAircraft} from './aircraft-catalog.js';
import {createFlyoverSchedule, stepFlyovers, shipPosition} from './flyovers.mjs';

// Flyover renderer: one cached aircraft per (type, slot), shown only while its pass is live.
// The RC camera sees only ~200 m and fogs from 65 m, so a real jet at real range would never draw.
// Each ship is drawn along its true sightline but pulled in to SKY_RANGE and shrunk by the same
// factor: identical angle and apparent size, inside the far plane, and unfogged against the sky.
const SKY_RANGE = 170,
  LARGER = 2.2;
export function createFlyovers(scene) {
  const state = createFlyoverSchedule(),
    pool = new Map(),
    shown = [];
  let sounds = [];
  const ship = (type, i) => {
    const key = `${type}#${i}`;
    if (!pool.has(key)) {
      const g = createAircraft(type),
        mats = new Map();
      g.name = `Flyover ${key}`;
      g.visible = false;
      // Own unfogged materials: the parked landmark jets share the catalogue's materials.
      g.traverse(o => {
        o.castShadow = false;
        o.frustumCulled = false;
        if (o.material) {
          if (!mats.has(o.material)) {
            const m = o.material.clone();
            m.fog = false; // Seen from below against bright sky the jets read as black cut-outs; a little self-light keeps the paint.
            if (m.emissive && m.color) {
              m.emissive.copy(m.color).multiplyScalar(0.38);
            }
            mats.set(o.material, m);
          }
          o.material = mats.get(o.material);
        }
      });
      const d = g.userData.dimensions,
        role = g.userData.role;
      if (role === 'fighter' || role === 'strike') {
        const n = g.userData.engineCount ?? 1,
          flame = new T.MeshBasicMaterial({
            color: '#ffb347',
            transparent: true,
            opacity: 0.85,
            blending: T.AdditiveBlending,
            depthWrite: false,
            fog: false
          });
        mats.set(flame, flame);
        for (let e = 0; e < n; e++) {
          const c = new T.Mesh(new T.ConeGeometry(d.height * 0.09, d.length * 0.28, 10), flame);
          c.rotation.x = Math.PI / 2;
          c.position.set(
            n > 1 ? (e - 0.5) * d.height * 0.22 : 0,
            d.height * 0.02,
            d.length * 0.5 + d.length * 0.12
          );
          c.name = 'afterburner';
          g.add(c);
        }
      }
      g.userData.flyoverMaterials = [...mats.values()];
      scene.add(g);
      pool.set(key, g);
    }
    return pool.get(key);
  };
  return {
    state,
    update(dt, pos, {quiet = false, eye = pos, heading = null} = {}) {
      const e = stepFlyovers(state, pos, dt, {quiet, heading});
      if (e.started) {
        shown.splice(0).forEach(g => (g.visible = false));
        e.started.ships.forEach((s, i) => {
          const g = ship(s.type, i);
          g.rotation.set(0, Math.atan2(-e.started.dir[0], -e.started.dir[1]), 0);
          g.visible = true;
          shown.push(g);
        });
      }
      if (e.roar) sounds.push(e.roar);
      if (e.ended) shown.splice(0).forEach(g => (g.visible = false));
      const p = state.active;
      if (p)
        shown.forEach((g, i) => {
          const [x, y, z] = shipPosition(p, i),
            d = Math.hypot(x - eye[0], y - eye[1], z - eye[2]),
            k = Math.min(1, SKY_RANGE / Math.max(1, d));
          g.position.set(eye[0] + (x - eye[0]) * k, eye[1] + (y - eye[1]) * k, eye[2] + (z - eye[2]) * k);
          g.scale.setScalar(k * LARGER);
          g.rotation.z = Math.sin(p.t * 0.7 + i) * 0.04;
        });
    },
    debug() {
      return shown.map(g => ({
        v: g.visible,
        p: g.position.toArray().map(Math.round),
        k: +g.scale.x.toFixed(3),
        kids: g.children.length,
        parent: !!g.parent
      }));
    },
    sounds() {
      const s = sounds;
      sounds = [];
      return s;
    },
    dispose() {
      for (const g of pool.values()) {
        g.removeFromParent();
        g.userData.flyoverMaterials?.forEach(m => m.dispose());
      }
      pool.clear();
    }
  };
}
