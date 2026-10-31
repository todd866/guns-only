// Flip and grab tricks for the skateboarding robot, after Tony Hawk's Pro Skater 2 (owner,
// 2026-10-30: "a proper THPS2 clone"). In the air, Q + a direction flips the board and E + a
// direction grabs it; tapping Q again mid-flip doubles it. Spins come from steering in the air
// (physics/assists.mjs) and the combo, special meter and banking live in physics/skate.mjs.
//
// Directions follow the THPS2 pad: none/left Kickflip, right Heelflip, up Impossible, down
// Pop Shove-It; grabs: none Method, left Melon, right Indy, up Nosegrab, down Tailgrab.
// Landing mid-flip bails in Big Kid; in kid mode the board finishes the flip for you.

export const FLIPS = Object.freeze({
  none: {name: 'Kickflip', axis: 'z', turn: 1, points: 300},
  left: {name: 'Kickflip', axis: 'z', turn: 1, points: 300},
  right: {name: 'Heelflip', axis: 'z', turn: -1, points: 300},
  up: {name: 'Impossible', axis: 'x', turn: 1, points: 400},
  down: {name: 'Pop Shove-It', axis: 'y', turn: 0.5, points: 250}
});
export const GRABS = Object.freeze({
  none: 'Method',
  left: 'Melon',
  right: 'Indy',
  up: 'Nosegrab',
  down: 'Tailgrab'
});
export const BOARD = Object.freeze({
  flipTime: 0.36, // s per full turn of the board
  liftoff: 0.08, // s off the ground before it counts as air (not every bump is a trick)
  grabBase: 150,
  grabRate: 450,
  grabCap: 1.5, // points: base + rate per second held, capped
  doubleBy: 0.7, // a second tap before this fraction of the flip doubles it
  kidSave: 0.75 // Big Kid: land before this fraction of the flip and you bail
});

export const dirOf = ({x = 0, y = 0} = {}) =>
  Math.abs(x) < 0.5 && Math.abs(y) < 0.5
    ? 'none'
    : Math.abs(y) >= Math.abs(x)
      ? y > 0
        ? 'up'
        : 'down'
      : x < 0
        ? 'left'
        : 'right';

export function createBoardTricks() {
  return {air: 0, flip: null, grab: null, angle: 0};
}

/**
 * One physics step. input: { air (no wheels down), flip (a direction when Q was just pressed),
 * grab (a direction while E is held, else null) }. Returns events:
 * { type: 'trick', name, points } and { type: 'bail' }.
 */
export function stepBoardTricks(b, input, dt, mode = 'kid') {
  const events = [];
  b.air = input.air ? b.air + dt : 0;
  const flying = b.air >= BOARD.liftoff;
  if (flying && input.flip) {
    const f = b.flip;
    const def = FLIPS[input.flip] ?? FLIPS.none;
    if (f && !f.doubled && f.def.name === def.name && f.t / f.dur < BOARD.doubleBy) {
      f.doubled = true;
      f.dur *= 2;
      f.name = `Double ${def.name}`;
      f.points = Math.round(def.points * 2.2);
    } else if (!f)
      b.flip = {
        def,
        name: def.name,
        points: def.points,
        t: 0,
        dur: BOARD.flipTime * Math.max(1, Math.abs(def.turn)),
        doubled: false
      };
  }
  if (b.flip) {
    const f = b.flip;
    f.t += dt;
    if (f.t >= f.dur) {
      events.push({type: 'trick', name: f.name, points: f.points});
      b.flip = null;
    }
  }
  if (flying && input.grab && !b.grab) b.grab = {name: GRABS[input.grab] ?? GRABS.none, t: 0};
  if (b.grab) {
    b.grab.t += dt;
    if (!input.grab || !flying) {
      events.push(grabScore(b.grab));
      b.grab = null;
    }
  }
  // Wheels down: a flip still turning is either finished for you (kid) or a bail (Big Kid).
  if (!input.air && b.flip) {
    const f = b.flip;
    b.flip = null;
    if (mode === 'kid' || f.t / f.dur >= BOARD.kidSave)
      events.push({type: 'trick', name: f.name, points: f.points});
    else events.push({type: 'bail'});
  }
  b.angle = b.flip
    ? b.flip.def.turn * 2 * Math.PI * (b.flip.doubled ? 2 : 1) * Math.min(1, b.flip.t / b.flip.dur)
    : 0;
  return events;
}

const grabScore = g => ({
  type: 'trick',
  name: g.name,
  points: Math.round(BOARD.grabBase + BOARD.grabRate * Math.min(BOARD.grabCap, g.t))
});

/** What the board and rider look like this frame: the flip axis and angle, and the grab held. */
export const boardPose = b => ({axis: b.flip?.def.axis ?? null, angle: b.angle, grab: b.grab?.name ?? null});
