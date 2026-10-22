// Course features added in code (no Blender export): Afterburner boost pads and kicker ramps,
// placed on straight stretches of the racing line, away from gates. Ramps are wedges with sloped
// sides so a car can never wedge against them; their surface is wood.
import { add, sub, scale, cross, dot, norm } from './math.mjs';

export const TRACK_FEATURES = { housing: { pads: 3, kickers: 3 } };

export function placeFeatures(course, line, { pads = 0, kickers = 0 } = {}) {
  const n = line.length, cps = course.checkpoints;
  // Straightness and clearance score per node.
  const cand = [];
  for (let i = 0; i < n; i++) {
    const a = line[(i - 1 + n) % n], b = line[i], c = line[(i + 1) % n];
    const h1 = Math.atan2(b[0] - a[0], b[1] - a[1]), h2 = Math.atan2(c[0] - b[0], c[1] - b[1]);
    const turn = Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1)));
    const gateGap = Math.min(...cps.map(g => Math.hypot(g[0] - b[0], g[1] - b[1])));
    if (turn < 0.12 && gateGap > 8) cand.push({ i, heading: Math.atan2(c[0] - a[0], c[1] - a[1]) });
  }
  // Spread picks round the lap: alternate kickers and pads, at least 6 nodes apart.
  const picks = [], want = pads + kickers;
  for (let k = 0; k < want && cand.length; k++) {
    const target = Math.floor((k + 0.5) * n / want);
    const best = cand.filter(c => picks.every(p => Math.min(Math.abs(p.i - c.i), n - Math.abs(p.i - c.i)) >= 6))
      .sort((x, y) => Math.abs(x.i - target) - Math.abs(y.i - target))[0];
    if (best) picks.push(best);
  }
  const out = { pads: [], kickers: [] };
  picks.forEach((p, k) => {
    const [x, z] = line[p.i], hit = course.world.raycast([x, 20, z], [0, -1, 0], 40), y = hit ? hit.point[1] : 0;
    const f = [Math.sin(p.heading), 0, Math.cos(p.heading)], r = [f[2], 0, -f[0]];
    const kind = (k % 2 === 0 && out.kickers.length < kickers) || out.pads.length >= pads ? 'kicker' : 'pad';
    if (kind === 'pad') out.pads.push({ pos: [x, y, z], fwd: f, half: 0.7 });
    else { addKicker(course.world, [x, y, z], f, r); out.kickers.push({ pos: [x, y, z], fwd: f }); }
  });
  return out;
}

// Wedge 1.8 m long, 1.6 m wide, 0.28 m high at the lip, with 0.5 m sloped sides.
function addKicker(world, base, f, r) {
  const L = 1.8, W = 0.8, H = 0.28, S = 0.5;
  const P = (along, across, up) => add(add(add(base, scale(f, along)), scale(r, across)), [0, up, 0]);
  const quad = (a, b, c, d, out) => { const nrm = cross(sub(b, a), sub(c, a)); if (dot(nrm, out) < 0) world.addQuad(a, d, c, b, 'wood'); else world.addQuad(a, b, c, d, 'wood'); };
  const t0 = P(-L / 2, -W, 0), t1 = P(-L / 2, W, 0), t2 = P(L / 2, W, H), t3 = P(L / 2, -W, H);
  quad(t0, t1, t2, t3, [0, 1, 0]);                                                   // ramp face
  quad(t3, t2, P(L / 2 + 0.6, W, 0), P(L / 2 + 0.6, -W, 0), add(f, [0, 1, 0]));     // gentle back slope
  for (const s of [-1, 1]) {                                                         // sloped sides
    const o = scale(r, s), e = W + S;
    quad(P(-L / 2, s * W, 0), P(L / 2, s * W, H), P(L / 2, s * e, 0), P(-L / 2, s * e, 0), add(o, [0, 1, 0]));
    quad(P(L / 2, s * W, H), P(L / 2 + 0.6, s * W, 0), P(L / 2 + 0.6, s * e, 0), P(L / 2, s * e, 0), add(o, [0, 1, 0]));
  }
}

// Boost pads: crossing one gives a short Afterburner (via the pickups effect system).
export function padHit(features, car) {
  return features.pads.some(p => { const d = sub(car.pos, p.pos); return Math.abs(dot(d, p.fwd)) < 0.7 && Math.abs(dot(d, [p.fwd[2], 0, -p.fwd[0]])) < p.half && Math.abs(d[1]) < 0.5; });
}
