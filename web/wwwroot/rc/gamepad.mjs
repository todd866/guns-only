const axis = v => {
  v = Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
  return Math.abs(v) < 0.12 ? 0 : (Math.sign(v) * (Math.abs(v) - 0.12)) / 0.88;
};
// Every connected pad drives the car, so it does not matter which one the
// player picked up (two 8BitDo pads on one Mac: Chrome lists the idle one
// first). Pads Chrome does not recognise ("" mapping, e.g. an 8BitDo over
// Bluetooth) use the same indices, which match 8BitDo's own HID order for the
// stick and face buttons.
function read(p) {
  const value = i => Math.max(0, Math.min(1, p?.buttons?.[i]?.value ?? 0)),
    rt = value(7),
    lt = value(6),
    // D-pad (12 up, 13 down, 14 left, 15 right): what a kid tries first on an SNES-style pad.
    dy = value(12) - value(13),
    dx = value(15) - value(14),
    sy = 0 - axis(p.axes?.[1]),
    sx = axis(p.axes?.[0]);
  return {
    throttle: rt > 0 ? rt : lt > 0 ? -lt : sy || dy,
    steer: sx || dx,
    brake: value(1) > 0.5,
    drift: value(5) > 0.5,
    fire: value(0) > 0.5,
    start: value(9) > 0.5,
    boost: value(3) > 0.5
  };
}
const stronger = (a, b) => (Math.abs(b) > Math.abs(a) ? b : a);
// The same button position carries a different letter on each pad: an SNES-style pad
// (8BitDo SN30) has B at the bottom and A on the right; an Xbox-style pad has A at the
// bottom. Tell each player the letters printed on the pad in their hands.
export function padGuide(id = '') {
  return /sn30|snes|sf30|nes30|super ?famicom/i.test(id)
    ? 'Green controller: stick or ✚ up to GO · B fire · X boost · R drift · A brake'
    : /ultimate|xbox|xinput|x-?box/i.test(id)
      ? 'Black controller: stick up or RT to GO · A fire · Y boost · RB drift · B brake'
      : 'Controller: stick up or right trigger to GO · bottom button fire · top button boost';
}
const busy = p => p.buttons?.some(b => (b?.value ?? 0) > 0.5) || p.axes?.some(a => Math.abs(a ?? 0) > 0.5);
export function createGamepadInput() {
  let fire = false,
    start = false,
    boost = false;
  const seen = new Set();
  return pads => {
    const live = Array.from(pads ?? []).filter(p => p?.connected),
      all = live.map(read),
      fresh = live.find(p => !seen.has(p.id) && busy(p));
    if (fresh) seen.add(fresh.id);
    if (!all.length) {
      fire = start = boost = false;
      return {throttle: 0, steer: 0, brake: false, drift: false, fire: false, start: false, boost: false, joined: null};
    }
    const m = all.reduce((a, b) => ({
        throttle: stronger(a.throttle, b.throttle),
        steer: stronger(a.steer, b.steer),
        brake: a.brake || b.brake,
        drift: a.drift || b.drift,
        fire: a.fire || b.fire,
        start: a.start || b.start,
        boost: a.boost || b.boost
      })),
      out = {...m, fire: m.fire && !fire, start: m.start && !start, boost: m.boost && !boost, joined: fresh?.id ?? null};
    fire = m.fire;
    start = m.start;
    boost = m.boost;
    return out;
  };
}
