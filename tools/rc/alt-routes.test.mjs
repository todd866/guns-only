// Skill shortcuts (ALT_<name>_NNN in each district GLB), driven with the real car physics:
//  (a) a careful driver (pursuit, the node's own speed: brakes for the dogleg, keeps speed for the
//      kicker) completes every ALT without falling, and it beats a careful driver on the main
//      racing line (7 m/s line speed) between the same two AI nodes;
//  (b) on elevated ALTs, a flat-out driver (full throttle, never brakes) falls off in at least
//      one of four tries, and every fall lands on floor-level walkable ground within 3 s and can
//      (kid mode, which auto-rights) drive away, reverse then forward, with no stall over 2 s.
//      Big Kid has no auto-right by design: a flipped Big Kid car is the R key's job, so only its
//      landing is checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { courseFromGlb, parseGlb, walkNodes } from '../../web/wwwroot/rc/physics/district.mjs';
import { stepSession, readout } from '../../web/wwwroot/rc/physics/session.mjs';
import { drivePath } from './drive-path.mjs';

const DISTRICTS = process.env.RC_DISTRICTS?.split(',') ?? ['housing', 'bx', 'school'];
const DIR = process.env.RC_DISTRICT_DIR ?? fileURLToPath(new URL('../../web/wwwroot/rc/assets/districts/', import.meta.url));
const MAIN_SPEED = 7, WALKABLE = ['asphalt', 'concrete', 'tile', 'wood', 'carpet', 'gymfloor', 'rubber', 'metal', 'gravel', 'grass', 'dirt'];

function altRoutes(buffer) {
  const groups = {};
  walkNodes(parseGlb(buffer), (n, m) => {
    const k = /^ALT_([A-Za-z0-9]+)_(\d{3})$/.exec(n.name ?? '');
    if (k) (groups[k[1]] ??= []).push({ i: Number(k[2]), x: m[12], y: m[13], z: m[14], half: Math.hypot(m[0], m[1], m[2]), speed: n.extras?.speed ?? 4, gap: !!n.extras?.gap });
  });
  for (const g of Object.values(groups)) g.sort((a, b) => a.i - b.i);
  return groups;
}

// Height of the ALT line under (x, z): projection onto the polyline, interpolating node heights.
function lineHeight(nodes, x, z) {
  let best = null;
  for (let i = 0; i + 1 < nodes.length; i++) {
    const a = nodes[i], b = nodes[i + 1], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (!best || d < best.d) best = { d, y: a.y + (b.y - a.y) * t };
  }
  return best;
}

for (const district of DISTRICTS) {
  const b = fs.readFileSync(DIR + `${district}.glb`), buffer = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const course = courseFromGlb(buffer), routes = altRoutes(buffer);
  const ai = course.ai.map(n => ({ x: n.pos[0], z: n.pos[2] }));
  const nearestAI = p => ai.reduce((bi, q, i) => Math.hypot(q.x - p.x, q.z - p.z) < Math.hypot(ai[bi].x - p.x, ai[bi].z - p.z) ? i : bi, 0);

  test(`${district}: has at least one skill shortcut`, () => assert.ok(Object.keys(routes).length >= 1));

  for (const [name, nodes] of Object.entries(routes)) {
    const floor = Math.min(nodes[0].y, nodes[nodes.length - 1].y);
    const elevated = nodes.some(n => n.y > floor + .45);
    // Narrow (walkway) nodes are hit tightly; wide floor nodes like any racing line.
    const altPath = nodes.map((n, k) => [n.x, n.z, k === 0 ? null : n.half < .6 ? .7 : 1.6, n.speed]);
    const i0 = nearestAI(nodes[0]), i1 = nearestAI(nodes[nodes.length - 1]);
    const mainPath = [];
    for (let i = i0; ; i = (i + 1) % ai.length) { mainPath.push([ai[i].x, ai[i].z]); if (i === i1) break; }
    const fellOff = (s) => {
      const h = lineHeight(nodes, s.car.pos[0], s.car.pos[2]);
      return h.d < 2.5 && h.y > floor + .3 && s.car.pos[1] < h.y - .3;
    };

    for (const mode of ['kid', 'bigKid']) {
      test(`${district} ALT_${name}: a careful ${mode} driver completes it without falling and beats the main line`, (t) => {
        let fell = null;
        const r = drivePath(course, altPath, { mode, maxTime: 90, onStep: (s, t) => { if (!fell && fellOff(s)) fell = t; } });
        assert.ok(r.reached, `stopped at node ${r.target}/${r.nodes} at ${r.at.map(v => v.toFixed(2))} after ${r.t.toFixed(1)} s`);
        assert.equal(fell, null, `fell off at ${fell?.toFixed(2)} s`);
        assert.ok(r.worstStall <= 2, `stalled ${r.worstStall.toFixed(2)} s`);
        const m = drivePath(course, mainPath, { mode, cruise: MAIN_SPEED, maxTime: 120 });
        assert.ok(m.reached, 'main-line comparison run did not finish');
        t.diagnostic(`ALT_${name} ${r.t.toFixed(2)} s vs main ${m.t.toFixed(2)} s`);
        assert.ok(r.t < m.t, `ALT_${name} ${r.t.toFixed(2)} s is not faster than the main line ${m.t.toFixed(2)} s`);
      });
    }

    if (!elevated) continue;
    test(`${district} ALT_${name}: flat-out falls off sometimes, always onto floor-level ground, never stuck`, (t) => {
      const results = [];
      for (const mode of ['kid', 'bigKid']) for (const startSpeed of [0, 6]) {
        let fell = null;
        const r = drivePath(course, altPath, { mode, flatOut: true, startSpeed, maxTime: 60,
          onStep: (s, t) => { if (fellOff(s)) { fell = t; return true; } return false; } });
        const res = { mode, startSpeed, fell: fell !== null, completed: r.reached };
        if (fell !== null) {
          const s = r.session, dt = 1 / 120, start = nodes[0];
          let t = 0, landed = null, stalled = 0, worst = 0, landedOn = null;
          while (t < 6) {
            const q = readout(s);
            let input = { throttle: 0, steer: 0, brake: false };
            if (landed !== null) {
              const since = t - landed;
              if (since < .8) input = { throttle: -1, steer: 0, brake: false };
              else {
                const want = Math.atan2(start.x - q.x, -(start.z - q.z)), e = Math.atan2(Math.sin(want - q.yaw), Math.cos(want - q.yaw));
                input = { throttle: 1, steer: Math.max(-1, Math.min(1, e * 2.5)), brake: false };
              }
            }
            stepSession(s, input, dt);
            t += dt;
            const below = course.world.raycast([s.car.pos[0], s.car.pos[1] + .05, s.car.pos[2]], [0, -1, 0], 3);
            if (landed === null && below && below.point[1] <= floor + .25 && WALKABLE.includes(below.surface) &&
                s.car.pos[1] - below.point[1] < .35 && Math.abs(s.car.vel[1]) < .5) {
              landed = t; landedOn = below.surface;
            }
            if (landed !== null && t - landed > .1) {
              stalled = readout(s).speed < .3 ? stalled + dt : 0;
              worst = Math.max(worst, stalled);
              if (t - landed > 3) break;
            }
            if (landed === null && t > 3) break;
          }
          Object.assign(res, { landedAfter: landed, landedOn, worstStall: worst });
        }
        results.push(res);
      }
      const falls = results.filter(r => r.fell);
      t.diagnostic(JSON.stringify(results.map(r => ({ ...r, landedAfter: r.landedAfter && +r.landedAfter.toFixed(2), worstStall: r.worstStall && +r.worstStall.toFixed(2) }))));
      assert.ok(falls.length >= 1, `flat-out never fell off: ${JSON.stringify(results)}`);
      for (const f of falls) {
        assert.ok(f.landedAfter !== null && f.landedAfter <= 3, `did not land on floor-level walkable ground within 3 s: ${JSON.stringify(f)}`);
        if (f.mode === 'kid') assert.ok(f.worstStall <= 2, `stuck after the fall: ${JSON.stringify(f)}`);
      }
    });
  }
}
