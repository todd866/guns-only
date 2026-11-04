// A rocket booster lands at the base from time to time (owner, 31 Oct: "the base could have some
// SpaceX type landing rockets from time to time. I like space stuff, and we have aliens"). A
// first stage comes back from space onto LZ-1, out in the desert by the Dreamland lab: a sonic boom,
// a coast, a landing burn, legs out, touchdown, and it stands there steaming until the next one.
// Real sizes: a 41 m stage, 3.7 m wide. The profile is authored, not simulated: it just has to
// look right. Data and timing only; drawn by open-world/booster.js.

export const LZ = Object.freeze({at: [2280, -940], radius: 30, name: 'LZ-1'});
export const BOOSTER = Object.freeze({
  first: 75,
  every: 240, // s of free drive before the first landing, then between landings
  top: 1100,
  coast: 120, // m up where it appears, falling at m/s
  burnAt: 400,
  legsAt: 70, // m: the landing burn lights, the legs swing out
  hear: 2500, // m: close enough to hear the boom and get a callout
  stand: 200 // s it stands on the pad after landing
});
const BURN = BOOSTER.coast ** 2 / (2 * BOOSTER.burnAt); // m/s² to stop exactly at the pad

/** Height above the pad, speed down and phase, t seconds after it appears. */
export function boosterAt(t) {
  const coastFor = (BOOSTER.top - BOOSTER.burnAt) / BOOSTER.coast,
    burnFor = BOOSTER.coast / BURN;
  if (t < 0) return {y: BOOSTER.top, v: BOOSTER.coast, phase: 'away'};
  if (t < coastFor) return {y: BOOSTER.top - BOOSTER.coast * t, v: BOOSTER.coast, phase: 'coast'};
  const b = t - coastFor;
  if (b < burnFor) {
    const v = BOOSTER.coast - BURN * b;
    return {y: Math.max(0, BOOSTER.burnAt - (BOOSTER.coast * b - (BURN * b * b) / 2)), v, phase: 'burn'};
  }
  const s = b - burnFor;
  return {y: 0, v: 0, phase: s < BOOSTER.stand ? 'landed' : 'away', since: s};
}
export const landingTime = () => (BOOSTER.top - BOOSTER.burnAt) / BOOSTER.coast + BOOSTER.coast / BURN;

export function createBoosterClock() {
  return {t: -BOOSTER.first, flight: 0};
}
/** Advance the clock; returns events { boom }, { burn }, { landed } as each happens. */
export function stepBooster(c, dt) {
  const ev = [],
    before = boosterAt(c.t).phase;
  c.t += dt;
  if (c.t > landingTime() + BOOSTER.stand + Math.max(0, BOOSTER.every - BOOSTER.stand - landingTime())) {
    c.t = 0;
    c.flight++;
  }
  const now = boosterAt(c.t).phase;
  if (now !== before) {
    if (now === 'coast') ev.push({boom: true});
    if (now === 'burn') ev.push({burn: true});
    if (now === 'landed') ev.push({landed: true});
  }
  return ev;
}
