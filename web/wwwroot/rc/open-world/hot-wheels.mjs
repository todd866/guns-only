// A Hot Wheels track (owner, 31 Oct: "hot wheels style tracks could be fun too, look at Forza
// Horizon 5's"). An orange plastic track out on the dry lake by LZ-1: a start tower with a big drop,
// booster pads (the spinning-wheel kind: they shove you up to speed), a full loop, a banked turn,
// a kicker and a jump to a landing ramp. Built from a centre line with an up vector, so it can bank
// and loop; the drivable face always points along `up`, with low rails on both edges.
// Track frame: x forward from the tower, y up, z to the right; placed by HOT_WHEELS.at / yaw.

export const HOT_WHEELS = Object.freeze({
  at: [1880, 0, -820], yaw: Math.PI,     // the tower stands east of the track, which runs west
  width: 1.8, rail: .14, step: .25,
  tower: 7, loopR: 3.2, bankR: 11, bank: .42,
  boostTo: 23, jumpBoost: 12.5, boostAccel: 45,           // m/s and m/s² while on a booster (enough for the loop with room)
});

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };

/** The track's centre line in track frame: [{ p, t, u, booster }] every `step` metres. */
const FRAMES = new WeakMap();   // the centre line is fixed per track: built once
export function trackFrames(H = HOT_WHEELS) {
  if (FRAMES.has(H)) return FRAMES.get(H);
  const out = [], push = (p, t, u, booster = false) => out.push({ p, t: norm(t), u: norm(u), booster });
  let x = 0;
  // The way up: a ramp off the lake up the back of the tower (you drive to the start).
  for (let s = -28; s < 0; s += H.step) { const k = (s + 28) / 28, y = .02 + (H.tower - .02) * k * k * (3 - 2 * k), dy = (H.tower - .02) * 6 * k * (1 - k) / 28; push([s, y, 0], [1, dy, 0], [-dy, 1, 0]); }
  // Start platform on the tower, then the drop: a smooth S from the tower top to the lake floor.
  for (; x < 5; x += H.step) push([x, H.tower, 0], [1, 0, 0], [0, 1, 0]);
  const dropLen = 20;
  for (let s = 0; s < dropLen; s += H.step) {
    const k = s / dropLen, y = .3 + (H.tower - .3) * (.5 + .5 * Math.cos(Math.PI * k)), dy = -(H.tower - .3) * .5 * Math.PI / dropLen * Math.sin(Math.PI * k);
    push([x + s, y, 0], [1, dy, 0], [-dy, 1, 0]);
  }
  x += dropLen;
  // Booster straight into the loop.
  for (let s = 0; s < 10; s += H.step) push([x + s, .3, 0], [1, 0, 0], [0, 1, 0], s > 2 && s < 7);
  x += 10;
  // The loop: up and over, sliding sideways one track-width so the exit clears the entry.
  const R = H.loopR, shift = H.width + .5, n = Math.ceil(2 * Math.PI * R / H.step);
  for (let i = 0; i <= n; i++) {
    const th = i / n * 2 * Math.PI;
    out.loopFrom ??= out.length;
    push([x + R * Math.sin(th), .3 + R * (1 - Math.cos(th)), shift * th / (2 * Math.PI)], [Math.cos(th), Math.sin(th), shift / (2 * Math.PI * R)], [-Math.sin(th), Math.cos(th), 0]);
  }
  out.loopTo = out.length - 1;
  // Out of the loop, then a banked half-turn to the right and back toward the tower side.
  const z0 = shift;
  for (let s = 0; s < 8; s += H.step) push([x + s, .3, z0], [1, 0, 0], [0, 1, 0]);
  x += 8;
  const B = H.bankR, m = Math.ceil(Math.PI * B / H.step);
  for (let i = 0; i <= m; i++) {
    const a = i / m * Math.PI, c = [x, .3, z0 + B], p = [c[0] + B * Math.sin(a), .3 + Math.sin(a) * .6, c[2] - B * Math.cos(a)];
    const t = [Math.cos(a), 0, Math.sin(a)], inward = norm([c[0] - p[0], 0, c[2] - p[2]]), bank = H.bank * Math.sin(Math.min(1, a / .5, (Math.PI - a) / .5) * Math.PI / 2);
    push(p, t, add(scale([0, 1, 0], Math.cos(bank)), scale(inward, Math.sin(bank))));
  }
  // Booster straight back west, a kicker, a gap, and a landing ramp.
  const zb = z0 + 2 * B;
  let xb = x;
  for (let s = 0; s < 12; s += H.step) push([xb - s, .3, zb], [-1, 0, 0], [0, 1, 0], s > 2 && s < 8 ? H.jumpBoost : false);   // a gentler shove: the jump lands on the ramp
  xb -= 12;
  for (let s = 0; s < 3; s += H.step) { const y = .3 + 1.1 * (s / 3) ** 2, dy = 2 * 1.1 * s / 9; push([xb - s, y, zb], [-1, dy, 0], [dy, 1, 0]); }
  xb -= 3 + 7;   // the gap
  for (let s = 0; s < 6; s += H.step) { const y = 1.2 - 1.0 * (s / 6), dy = -1 / 6; push([xb - s, y, zb], [-1, dy, 0], [-dy * -1, 1, 0]); }
  xb -= 6;
  for (let s = 0; s < 4; s += H.step) push([xb - s, .2, zb], [-1, 0, 0], [0, 1, 0]);
  FRAMES.set(H, out);
  return out;
}

/** Track frame -> world. */
export function toWorld(p, H = HOT_WHEELS) {
  const c = Math.cos(H.yaw), s = Math.sin(H.yaw);
  return [H.at[0] + p[0] * c + p[2] * s, H.at[1] + p[1], H.at[2] - p[0] * s + p[2] * c];
}
const dirWorld = (v, H) => { const c = Math.cos(H.yaw), s = Math.sin(H.yaw); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };

/**
 * Collision and drawing: quads [a, b, c, d] counter-clockwise seen from the drivable side, in
 * world space. kind 'deck' for the riding surface (and its booster strips), 'rail' for the edges.
 */
export function trackQuads(H = HOT_WHEELS) {
  const f = trackFrames(H), quads = [];
  for (let i = 1; i < f.length; i++) {
    const A = f[i - 1], B = f[i];
    if (Math.hypot(...[0, 1, 2].map(k => B.p[k] - A.p[k])) > H.step * 3) continue;   // the jump gap
    const sa = scale(norm(cross(A.t, A.u)), H.width / 2), sb = scale(norm(cross(B.t, B.u)), H.width / 2);
    const L0 = add(A.p, scale(sa, -1)), R0 = add(A.p, sa), L1 = add(B.p, scale(sb, -1)), R1 = add(B.p, sb);
    quads.push({ kind: A.booster ? 'booster' : 'deck', v: [L0, L1, R1, R0], up: A.u });
    for (const [e0, e1] of [[L0, L1], [R0, R1]]) quads.push({ kind: 'rail', v: [e0, e1, add(e1, scale(B.u, H.rail)), add(e0, scale(A.u, H.rail))] });
  }
  return quads.map(q => {
    const v = q.v.map(p => toWorld(p, H));
    if (q.kind === 'rail') return { ...q, v };
    // Wind so the face points along the track's up.
    const e1 = [0, 1, 2].map(k => v[1][k] - v[0][k]), e2 = [0, 1, 2].map(k => v[2][k] - v[0][k]), n = cross(e1, e2), up = dirWorld(q.up, H);
    return { ...q, v: n[0] * up[0] + n[1] * up[1] + n[2] * up[2] >= 0 ? v : [v[0], v[3], v[2], v[1]] };
  });
}

/** Boosters: within a booster strip, drive the car along the track up to boostTo. Returns the new velocity. */
export function boost(boosters, pos, vel, dt, H = HOT_WHEELS) {
  for (const b of boosters) {
    if (Math.hypot(pos[0] - b.p[0], pos[1] - b.p[1], pos[2] - b.p[2]) > H.width * .7) continue;
    const along = vel[0] * b.t[0] + vel[1] * b.t[1] + vel[2] * b.t[2], to = b.to ?? H.boostTo;
    if (along >= to || along < 1) return vel;
    const dv = Math.min(to - along, H.boostAccel * dt);
    return [vel[0] + b.t[0] * dv, vel[1] + b.t[1] * dv, vel[2] + b.t[2] * dv];
  }
  return vel;
}
/**
 * Track guidance, as on the real toy: the plastic channel keeps a car in its lane. Near the deck,
 * sideways drift across the track is damped and the car is pulled back toward the centre line, so
 * it follows the loop's sideways shift and the banked turn instead of climbing the rails.
 * frames: worldFrames(); returns the new velocity.
 */
export function guide(frames, pos, vel, dt, H = HOT_WHEELS) {
  let best = null, bd = Infinity;
  for (const f of frames) { const d = (pos[0] - f.p[0]) ** 2 + (pos[1] - f.p[1]) ** 2 + (pos[2] - f.p[2]) ** 2; if (d < bd) { bd = d; best = f; } }
  if (!best || bd > (H.width * .9) ** 2) return vel;
  const side = best.side, off = (pos[0] - best.p[0]) * side[0] + (pos[1] - best.p[1]) * side[1] + (pos[2] - best.p[2]) * side[2];
  // Steer the sideways speed toward one that closes the offset in about an eighth of a second.
  const lat = vel[0] * side[0] + vel[1] * side[1] + vel[2] * side[2], dv = (-off * 8 - lat) * Math.min(1, 15 * dt);
  return [vel[0] + side[0] * dv, vel[1] + side[1] * dv, vel[2] + side[2] * dv];
}
/** The centre line in world space with its sideways direction, for guide(). */
export const worldFrames = (H = HOT_WHEELS) => trackFrames(H).map(f => ({ p: toWorld(f.p, H), side: dirWorld(norm(cross(f.t, f.u)), H), t: dirWorld(f.t, H), u: dirWorld(f.u, H) }));
/**
 * guide() for a whole car: velocity as above, and the body turned toward the track's direction (the
 * channel steers the wheels), so a turn is driven, not scrubbed sideways.
 */
export function guideCar(frames, car, dt, H = HOT_WHEELS) {
  const v = guide(frames, car.pos, car.vel, dt, H); if (v === car.vel) return false;
  car.vel = v;
  let best = frames[0], bd = Infinity; for (const f of frames) { const d = (car.pos[0] - f.p[0]) ** 2 + (car.pos[1] - f.p[1]) ** 2 + (car.pos[2] - f.p[2]) ** 2; if (d < bd) { bd = d; best = f; } }
  const q = car.q, fwd = [-(2 * (q[0] * q[2] + q[3] * q[1])), -(2 * (q[1] * q[2] - q[3] * q[0])), -(1 - 2 * (q[0] * q[0] + q[1] * q[1]))];
  // Signed turn from forward to the track tangent about the track's up; yaw rate toward it.
  const c = cross(fwd, best.t), err = Math.atan2(c[0] * best.u[0] + c[1] * best.u[1] + c[2] * best.u[2], fwd[0] * best.t[0] + fwd[1] * best.t[1] + fwd[2] * best.t[2]);
  const rate = Math.max(-4, Math.min(4, err * 8)), ang = car.ang, along = ang[0] * best.u[0] + ang[1] * best.u[1] + ang[2] * best.u[2], dw = (rate - along) * Math.min(1, 12 * dt);
  car.ang = [ang[0] + best.u[0] * dw, ang[1] + best.u[1] * dw, ang[2] + best.u[2] * dw];
  return true;
}
// The loop is ridden, not simulated: at RC scale a loop at speed pulls ~15 g, more than a 1:10
// car's suspension can hold, so the hull scrapes and the energy goes. Arrive fast enough and the
// car is carried round on the track (speed falls with height and comes back), then let go at the
// exit; too slow and it isn't taken, and rolls back down like the real toy.
export const LOOP = Object.freeze({ enter: 9, catch: 1.2, height: .16 });
/** Start a loop ride if the car is at the loop's entry, moving along it fast enough. */
export function loopEntry(car, H = HOT_WHEELS) {
  const f = trackFrames(H), a = f[f.loopFrom], p = toWorld(a.p, H), t = dirWorld(a.t, H);
  const along = car.vel[0] * t[0] + car.vel[1] * t[1] + car.vel[2] * t[2];
  if (Math.hypot(car.pos[0] - p[0], car.pos[2] - p[2]) > LOOP.catch || along < LOOP.enter) return null;
  return { i: f.loopFrom, s: 0, v0: along };
}
/** One step of the ride: places the car on the loop. Returns false once it's out the other end. */
export function stepLoop(ride, car, dt, H = HOT_WHEELS) {
  const f = trackFrames(H), from = f.loopFrom, to = f.loopTo, y0 = f[from].p[1];
  const at = k => f[Math.min(to, from + k)], seg = H.step;
  const here = at(Math.floor(ride.s / seg)), v = Math.max(4, Math.sqrt(Math.max(0, ride.v0 ** 2 - 2 * 9.81 * (here.p[1] - y0))));
  ride.s += v * dt;
  const k = ride.s / seg, a = at(Math.floor(k)), b = at(Math.floor(k) + 1), w = k - Math.floor(k);
  if (from + Math.floor(k) >= to) return false;
  const p = [0, 1, 2].map(j => a.p[j] + (b.p[j] - a.p[j]) * w), t = norm([0, 1, 2].map(j => a.t[j] + (b.t[j] - a.t[j]) * w)), u = norm([0, 1, 2].map(j => a.u[j] + (b.u[j] - a.u[j]) * w));
  const wt = dirWorld(t, H), wu = dirWorld(u, H);
  car.pos = toWorld([p[0] + u[0] * LOOP.height, p[1] + u[1] * LOOP.height, p[2] + u[2] * LOOP.height], H);
  car.vel = wt.map(c => c * v); car.ang = [0, 0, 0];
  car.q = basisQuat(wt, wu);
  return true;
}
// Car body: forward is local -z, up is local +y.
function basisQuat(fwd, up) {
  const z = fwd.map(c => -c), x = norm(cross(up, z)), y = cross(z, x);
  const m00 = x[0], m01 = y[0], m02 = z[0], m10 = x[1], m11 = y[1], m12 = z[1], m20 = x[2], m21 = y[2], m22 = z[2], tr = m00 + m11 + m22;
  if (tr > 0) { const S = Math.sqrt(tr + 1) * 2; return [(m21 - m12) / S, (m02 - m20) / S, (m10 - m01) / S, .25 * S]; }
  if (m00 > m11 && m00 > m22) { const S = Math.sqrt(1 + m00 - m11 - m22) * 2; return [.25 * S, (m01 + m10) / S, (m02 + m20) / S, (m21 - m12) / S]; }
  if (m11 > m22) { const S = Math.sqrt(1 + m11 - m00 - m22) * 2; return [(m01 + m10) / S, .25 * S, (m12 + m21) / S, (m02 - m20) / S]; }
  const S = Math.sqrt(1 + m22 - m00 - m11) * 2; return [(m02 + m20) / S, (m12 + m21) / S, .25 * S, (m10 - m01) / S];
}
/** Booster centre points in world space, with their world direction. */
export const boosterPoints = (H = HOT_WHEELS) => trackFrames(H).filter(f => f.booster).map(f => ({ p: toWorld(f.p, H), t: dirWorld(f.t, H), to: typeof f.booster === 'number' ? f.booster : H.boostTo }));
/** Where to start: the tower top, facing down the track. */
export const startPose = (H = HOT_WHEELS) => ({ pos: toWorld([1.5, H.tower + .25, 0], H), yaw: H.yaw + Math.PI / 2 });
