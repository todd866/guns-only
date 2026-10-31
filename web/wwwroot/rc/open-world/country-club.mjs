// Sunrise Vista Country Club (owner, 31 Oct: "an 18 hole golf course with a minigolf range,
// clubhouse, tennis courts, the whole thing. Like a proper country club"). The land is the real
// course's mapped outline on the base; the routing is original (OSM maps only the outline, and the
// real holes aren't copied). Distances are toy-scaled so a round is a potter, not an afternoon:
// par 3s 80-110 m, par 4s 130-160 m, par 5s 250-300 m; par 70 (six par 3s). World metres, [x, z].
// Drawn by country-club.js; robot golf rules in this file (ball flight, lies, clubs, scorecard).

const H = (n, par, tee, green, extra = {}) => ({
  n,
  par,
  tee,
  green,
  bend: extra.bend ?? null,
  bunkers: extra.bunkers ?? [],
  water: extra.water ?? []
});
export const HOLES = Object.freeze([
  // Front nine: north from the clubhouse, round the top of the course and back.
  H(1, 4, [-300, 2740], [-180, 2650], {
    bunkers: [
      [-196, 2632, 5],
      [-160, 2662, 4]
    ]
  }),
  H(2, 3, [-160, 2620], [-90, 2580], {bunkers: [[-100, 2566, 4]]}),
  H(3, 5, [-80, 2555], [40, 2320], {
    bend: [-20, 2430],
    bunkers: [[-34, 2418, 6]],
    water: [[22, 2352, 14, 9]]
  }),
  H(4, 4, [60, 2290], [90, 2160], {bunkers: [[100, 2178, 5]]}),
  H(5, 3, [70, 2130], [10, 2190], {water: [[40, 2160, 10, 7]]}),
  H(6, 4, [-10, 2230], [-120, 2330], {
    bunkers: [
      [-104, 2318, 5],
      [-134, 2342, 4]
    ]
  }),
  H(7, 4, [-150, 2380], [-260, 2490], {bunkers: [[-210, 2440, 6]]}),
  H(8, 3, [-290, 2505], [-380, 2560], {water: [[-335, 2532, 11, 8]]}),
  H(9, 5, [-450, 2600], [-470, 2760], {
    bend: [-580, 2680],
    bunkers: [
      [-568, 2668, 6],
      [-482, 2748, 5]
    ]
  }),
  // Back nine: south of the clubhouse, round past the tropical garden and home.
  H(10, 4, [-300, 2850], [-180, 2920], {bunkers: [[-170, 2934, 5]]}),
  H(11, 3, [-150, 2945], [-70, 2990], {bunkers: [[-80, 3004, 4]]}),
  H(12, 5, [-40, 3005], [-20, 3220], {
    bend: [40, 3100],
    water: [[10, 3160, 12, 16]],
    bunkers: [[30, 3086, 6]]
  }),
  H(13, 4, [-60, 3240], [-200, 3220], {bunkers: [[-190, 3204, 5]]}),
  H(14, 3, [-230, 3200], [-300, 3140], {water: [[-262, 3172, 9, 8]]}),
  H(15, 4, [-320, 3110], [-450, 3150], {bunkers: [[-436, 3166, 5]]}),
  H(16, 4, [-480, 3180], [-520, 3040], {water: [[-500, 3110, 8, 14]], bunkers: [[-534, 3054, 4]]}),
  H(17, 3, [-500, 3000], [-430, 2950], {bunkers: [[-418, 2938, 4]]}),
  H(18, 5, [-420, 2915], [-385, 2840], {
    bend: [-540, 2875],
    bunkers: [
      [-528, 2864, 6],
      [-372, 2828, 5]
    ]
  })
]);
export const CLUB = Object.freeze({
  clubhouse: {at: [-330, 2795], size: [26, 14]},
  minigolf: {box: [-280, 2772, -232, 2818]}, // x0, z0, x1, z1
  tennis: {box: [-452, 2768, -404, 2822]}, // two courts side by side
  green: 9,
  fairway: 11,
  tee: [7, 4],
  cup: 0.35
});

// The ball's world: what it lands and rolls on.
export const LIE = Object.freeze({
  green: {roll: 1.6, bounce: 0.25},
  fairway: {roll: 5.5, bounce: 0.3},
  tee: {roll: 5.5, bounce: 0.3},
  rough: {roll: 10, bounce: 0.2},
  sand: {roll: 18, bounce: 0.05},
  water: null
});
const segDist = (p, a, b) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(a[0] + dx * t - p[0], a[1] + dz * t - p[1]);
};
export const holeLine = h => (h.bend ? [h.tee, h.bend, h.green] : [h.tee, h.green]);
export const holeLength = h => {
  const l = holeLine(h);
  let s = 0;
  for (let i = 1; i < l.length; i++) s += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
  return s;
};
/** The lie at (x, z) on hole h ('water' first, then sand, green, fairway, tee, else rough). */
export function lieAt(h, p) {
  for (const [x, z, rx, rz] of h.water)
    if (((p[0] - x) / rx) ** 2 + ((p[1] - z) / rz) ** 2 < 1) return 'water';
  for (const [x, z, r] of h.bunkers) if (Math.hypot(p[0] - x, p[1] - z) < r) return 'sand';
  if (Math.hypot(p[0] - h.green[0], p[1] - h.green[1]) < CLUB.green) return 'green';
  if (Math.hypot(p[0] - h.tee[0], p[1] - h.tee[1]) < CLUB.tee[0]) return 'tee';
  const l = holeLine(h);
  for (let i = 1; i < l.length; i++) if (segDist(p, l[i - 1], l[i]) < CLUB.fairway) return 'fairway';
  return 'rough';
}

// Clubs: picked for you from the distance to the pin (a kid shouldn't have to know a 7-iron).
export const CLUBS = Object.freeze({
  driver: {loft: 18, speed: 48},
  iron: {loft: 26, speed: 36},
  wedge: {loft: 46, speed: 21},
  putter: {loft: 0, speed: 9}
});
export function pickClub(lie, toPin) {
  if (lie === 'green' || (lie !== 'sand' && toPin < 15)) return 'putter';
  if (lie !== 'sand' && toPin > 105) return 'driver';
  if (toPin > 50) return 'iron';
  return 'wedge';
}

/** Hit: a new ball flight from `at` ([x, y, z]) toward heading yaw (forward (sin, -cos)), power 0..1. */
export function strike(at, yaw, club, power) {
  const c = CLUBS[club],
    v = c.speed * Math.max(0.08, Math.min(1, power)),
    a = (c.loft * Math.PI) / 180;
  // Backspin: the higher the loft, the more the ball checks up where it lands (a wedge stops).
  return {
    pos: [...at],
    vel: [Math.sin(yaw) * v * Math.cos(a), v * Math.sin(a), -Math.cos(yaw) * v * Math.cos(a)],
    rolling: c.loft === 0,
    rest: false,
    t: 0,
    check: Math.min(0.8, (c.loft / 50) ** 2)
  };
}

/**
 * One step of the ball. ground(x, z) -> height; lie(x, z) -> a LIE key. Returns null, or
 * { landed: lie } on a first touchdown, { rest: lie } when it stops, { water: true } in a pond.
 */
export function stepBall(b, ground, lie, dt) {
  if (b.rest) return null;
  b.t += dt;
  const g = ground(b.pos[0], b.pos[2]);
  if (!b.rolling) {
    const sp = Math.hypot(...b.vel),
      drag = 0.005 * sp;
    b.vel = [
      b.vel[0] * (1 - drag * dt),
      b.vel[1] - 9.81 * dt - b.vel[1] * drag * dt,
      b.vel[2] * (1 - drag * dt)
    ];
    b.pos = b.pos.map((v, i) => v + b.vel[i] * dt);
    const gh = ground(b.pos[0], b.pos[2]);
    if (b.pos[1] <= gh) {
      const l = lie(b.pos[0], b.pos[2]);
      b.pos[1] = gh;
      if (l === 'water') {
        b.rest = true;
        return {water: true};
      }
      const L = LIE[l],
        first = !b.bounced;
      b.bounced = true;
      if (first) {
        const k = 1 - (b.check ?? 0);
        b.vel[0] *= k;
        b.vel[2] *= k;
      }
      if (-b.vel[1] > 2.5) {
        b.vel = [b.vel[0] * 0.6, -b.vel[1] * L.bounce, b.vel[2] * 0.6];
        if (b.vel[1] < 1) {
          b.rolling = true;
          b.vel[1] = 0;
        }
      } else {
        b.rolling = true;
        b.vel[1] = 0;
      }
      if (first) return {landed: l};
    }
    return null;
  }
  // Rolling: friction by lie; it follows the ground.
  const l = lie(b.pos[0], b.pos[2]);
  if (l === 'water') {
    b.rest = true;
    return {water: true};
  }
  const sp = Math.hypot(b.vel[0], b.vel[2]),
    dec = LIE[l].roll * dt;
  if (sp <= dec) {
    b.vel = [0, 0, 0];
    b.rest = true;
    b.pos[1] = g;
    return {rest: l};
  }
  const k = (sp - dec) / sp;
  b.vel = [b.vel[0] * k, 0, b.vel[2] * k];
  b.pos = [
    b.pos[0] + b.vel[0] * dt,
    ground(b.pos[0] + b.vel[0] * dt, b.pos[2] + b.vel[2] * dt),
    b.pos[2] + b.vel[2] * dt
  ];
  return null;
}

// A round: strokes per hole, a penalty for the water (drop where it went in), and a kid's limit
// (pick up at par + 4: never stuck on a hole).
export function createRound() {
  return {hole: 0, strokes: 0, scores: [], ball: null, lastLie: null, done: false};
}
export const holeOf = r => HOLES[r.hole];
export function toPin(r, p) {
  const g = holeOf(r).green;
  return Math.hypot(g[0] - p[0], g[1] - p[1]);
}
/** The ball is in the cup if it's this close and slow enough to drop. */
export const holed = (h, b) =>
  Math.hypot(b.pos[0] - h.green[0], b.pos[2] - h.green[1]) < CLUB.cup && Math.hypot(...b.vel) < 4;
export function finishHole(r) {
  r.scores.push(r.strokes);
  r.hole++;
  r.strokes = 0;
  r.ball = null;
  if (r.hole >= HOLES.length) r.done = true;
}
export const pickUp = r => r.strokes >= holeOf(r).par + 4;
export const total = r => r.scores.reduce((a, b) => a + b, 0);
export const parTo = (r, n = r.scores.length) => HOLES.slice(0, n).reduce((a, h) => a + h.par, 0);
