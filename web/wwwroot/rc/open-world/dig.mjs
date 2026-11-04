// Dig down to the other world (owner, 31 Oct: "you can always mine-craft mine down to the portal
// level and spawn in the light world, that would be funny, literally the upside down then"; and
// digging is the robot's whole point, "in the light and dark worlds"). On foot in either world,
// hold E: the toy digs a shaft one chunky block at a time through grass, dirt, clay, stone and gold
// ore. The block under it all is the portal layer; break it and you come out of the ground in the
// other world at the same spot. Space climbs back out; a tap of E (an item's use) never starts one.
// Pure: the runtime and main pass position, ground and keys; this returns events.
export const DIG = Object.freeze({
  block: 0.5, // metres: chunky next to a 0.3 m cowboy
  seconds: 0.38, // per block while E is held
  layers: Object.freeze(['grass', 'dirt', 'dirt', 'clay', 'stone', 'stone', 'gold', 'stone', 'portal']),
  cancelMove: 0.35, // walking this far from the hole before it is a block deep calls it off
  startHold: 0.3 // seconds of E held before a dig starts, so a tap stays an item's use
});
export const PORTAL_DEPTH = DIG.layers.indexOf('portal'); // blocks dug before the portal block

export const createDig = () => ({active: false, at: null, depth: 0, t: 0, hold: 0});
/** The other world: where the portal layer lets you out. */
export const otherEra = era => (era === 'past' ? 'present' : 'past');
export const layerAt = depth => DIG.layers[Math.min(depth, DIG.layers.length - 1)];
/** Where the digger stands: on the floor of the shaft. */
export const digFloor = s => (s.active ? [s.at[0], s.at[1] - s.depth * DIG.block, s.at[2]] : null);

/**
 * One step. o: { era, pos (the toy, on foot), ground (surface height there), holding (E held),
 * climb (Space pressed), dt }. Events: { start }, { block: layer, depth }, { through: [x, z], to }
 * (the other world), { out } (climbed back up).
 */
export function stepDig(s, o) {
  const ev = [],
    dt = o.dt ?? 1 / 60;
  if (!s.active) {
    s.hold = o.holding && o.pos ? s.hold + dt : 0;
    if (s.hold < DIG.startHold) return ev;
    Object.assign(s, {
      active: true,
      at: [o.pos[0], o.ground ?? o.pos[1], o.pos[2]],
      depth: 0,
      t: 0,
      hold: 0,
      era: o.era
    });
    ev.push({start: [...s.at]});
  }
  if (o.climb || o.era !== s.era) {
    Object.assign(s, createDig());
    ev.push({out: true});
    return ev;
  }
  if (s.depth === 0 && o.pos && Math.hypot(o.pos[0] - s.at[0], o.pos[2] - s.at[2]) > DIG.cancelMove) {
    Object.assign(s, createDig());
    ev.push({out: true});
    return ev;
  }
  if (!o.holding) {
    s.t = 0;
    return ev;
  }
  s.t += dt;
  if (s.t < DIG.seconds) return ev;
  s.t -= DIG.seconds;
  const layer = layerAt(s.depth);
  if (layer === 'portal') {
    const at = [s.at[0], s.at[2]];
    const to = otherEra(s.era);
    Object.assign(s, createDig());
    ev.push({block: 'portal', depth: PORTAL_DEPTH}, {through: at, to});
    return ev;
  }
  s.depth++;
  ev.push({block: layer, depth: s.depth});
  return ev;
}
