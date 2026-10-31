const axis = v => {
  v = Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
  return Math.abs(v) < 0.12 ? 0 : (Math.sign(v) * (Math.abs(v) - 0.12)) / 0.88;
};
export function createGamepadInput() {
  let fire = false,
    start = false,
    boost = false;
  return pads => {
    const p = Array.from(pads ?? []).find(p => p?.connected && p.mapping === 'standard'),
      value = i => Math.max(0, Math.min(1, p?.buttons?.[i]?.value ?? 0));
    if (!p) {
      fire = start = boost = false;
      return {throttle: 0, steer: 0, brake: false, drift: false, fire: false, start: false, boost: false};
    }
    const f = value(0) > 0.5,
      s = value(9) > 0.5,
      y = value(3) > 0.5,
      out = {
        throttle: value(7) > 0 ? value(7) : value(6) > 0 ? -value(6) : -axis(p.axes?.[1]),
        steer: axis(p.axes?.[0]),
        brake: value(1) > 0.5,
        drift: value(5) > 0.5,
        fire: f && !fire,
        start: s && !start,
        boost: y && !boost
      };
    fire = f;
    start = s;
    boost = y;
    return out;
  };
}
