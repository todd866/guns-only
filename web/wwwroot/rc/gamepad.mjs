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
    lt = value(6);
  return {
    throttle: rt > 0 ? rt : lt > 0 ? -lt : 0 - axis(p.axes?.[1]),
    steer: axis(p.axes?.[0]),
    brake: value(1) > 0.5,
    drift: value(5) > 0.5,
    fire: value(0) > 0.5,
    start: value(9) > 0.5,
    boost: value(3) > 0.5
  };
}
const stronger = (a, b) => (Math.abs(b) > Math.abs(a) ? b : a);
export function createGamepadInput() {
  let fire = false,
    start = false,
    boost = false;
  return pads => {
    const all = Array.from(pads ?? []).filter(p => p?.connected).map(read);
    if (!all.length) {
      fire = start = boost = false;
      return {throttle: 0, steer: 0, brake: false, drift: false, fire: false, start: false, boost: false};
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
      out = {...m, fire: m.fire && !fire, start: m.start && !start, boost: m.boost && !boost};
    fire = m.fire;
    start = m.start;
    boost = m.boost;
    return out;
  };
}
