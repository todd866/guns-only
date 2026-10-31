// Trick-or-treat on Halloween (owner, 31 Oct: "a trick or treating minigame... you have to go
// around doing skateboard/car/whatever tricks"). Some porches have their light on and a candy
// bowl out. Roll up to one and a toy asks for a trick; land any trick near the door and you get
// candy, more for a bigger trick. Now and then the house plays a trick on you first (a ghost
// pops out: BOO!), then gives the candy anyway. Each house gives once per visit to the street.
// Data and rules only; drawn by open-world/trick-or-treat.js.

export const TOT = Object.freeze({
  every: 3, // one porch in three has its light on
  reach: 6, // m from the porch step: close enough to knock (and to be seen doing a trick)
  leave: 12, // m: walked away, so the next approach asks again
  boo: 6, // one house in six plays a trick first
  reset: 300 // s away from every lit house before they all refill
});
// Candy by trick: the bigger the trick, the bigger the handful.
export const CANDY = Object.freeze({small: 1, good: 2, big: 3});

/** Lit houses from the residential porches (residential-yards.js): every TOT.every-th one. */
export function treatHouses(porches = []) {
  return porches
    .filter((_, i) => i % TOT.every === 0)
    .map((p, i) => ({
      id: p.index ?? i,
      x: p.x,
      z: p.z,
      y: p.y ?? 0,
      yaw: p.yaw ?? 0,
      boo: i % TOT.boo === TOT.boo - 1
    }));
}

export function createTrickOrTreat(houses) {
  return {houses, given: new Set(), asked: null, candy: 0, lastNear: -Infinity};
}

/**
 * One frame. pos = the car/robot; trick = null, or { name, size: 'small'|'good'|'big' } when a trick
 * was landed this frame. Returns events: { ask, house }, { boo, house }, { treat, house, candy, total, name }.
 */
export function stepTrickOrTreat(t, pos, trick, time) {
  const events = [];
  let near = null,
    nearD = Infinity;
  for (const h of t.houses) {
    const d = Math.hypot(pos[0] - h.x, pos[2] - h.z);
    if (d < nearD) {
      nearD = d;
      near = h;
    }
  }
  if (nearD < TOT.leave) t.lastNear = time;
  else if (time - t.lastNear > TOT.reset && t.given.size) t.given.clear();
  if (t.asked && (t.asked !== near || nearD > TOT.leave)) t.asked = null;
  if (!near || nearD > TOT.reach || t.given.has(near.id)) return events;
  if (t.asked !== near) {
    t.asked = near;
    events.push({ask: true, house: near});
  }
  if (trick) {
    t.given.add(near.id);
    const candy = CANDY[trick.size] ?? CANDY.small;
    t.candy += candy;
    if (near.boo) events.push({boo: true, house: near});
    events.push({treat: true, house: near, candy, total: t.candy, name: trick.name});
  }
  return events;
}

/** How big a trick is: by airtime, spin or combo length. */
export function trickSize({air = 0, spin = 0, combo = 0} = {}) {
  if (combo >= 3 || air >= 1.2 || spin >= 540) return 'big';
  if (combo >= 2 || air >= 0.7 || spin >= 300) return 'good';
  return 'small';
}
