// Controller rumble (owner, 18 Nov 2026: "better integration for gamepads like my 8bitdo
// controllers"). The Mac app plays it through GameController haptics (Game.swift, rcRumble);
// a browser uses the Gamepad API's vibrationActuator. Either is skipped where the pad or the
// platform has no motors, and nothing here can throw into the game loop.

export const RUMBLE = Object.freeze({
  land: {strong: 0.15, weak: 0.45, ms: 90}, // a landed trick: a light tick
  grind: {strong: 0.05, weak: 0.35, ms: 60}, // onto a rail
  wall: {strong: 0.5, weak: 0.3, ms: 120}, // a wall hit
  bail: {strong: 0.9, weak: 0.6, ms: 260} // a bail or crash
});

/**
 * Rumble every connected pad (or only `pad`, a Gamepad index). Returns 'native', 'web' or null.
 * `env` is injectable for tests: {webkit, pads}.
 */
export function rumble(kind, {pad = null, env = globalThis, pads} = {}) {
  const fx = typeof kind === 'string' ? RUMBLE[kind] : kind;
  if (!fx) return null;
  const native = env.webkit?.messageHandlers?.rcRumble;
  if (native) {
    try {
      native.postMessage({pad, strong: fx.strong, weak: fx.weak, ms: fx.ms});
      return 'native';
    } catch {
      return null;
    }
  }
  let played = 0;
  let list = pads;
  try {
    list ??= Array.from(env.navigator?.getGamepads?.() ?? []);
  } catch {
    list = [];
  }
  for (const p of list) {
    if (!p?.connected || (pad != null && p.index !== pad)) continue;
    const a = p.vibrationActuator;
    if (!a?.playEffect) continue;
    try {
      a.playEffect('dual-rumble', {duration: fx.ms, strongMagnitude: fx.strong, weakMagnitude: fx.weak})?.catch?.(() => {});
      played++;
    } catch {
      /* a pad without dual motors */
    }
  }
  return played ? 'web' : null;
}

/** At most one rumble per kind per `gap` ms, so a scrape along a wall is one buzz, not sixty. */
export function createRumbler({gap = 350, play = rumble, now = () => performance.now()} = {}) {
  const last = new Map();
  return (kind, opts) => {
    const t = now();
    if (t - (last.get(kind) ?? -1e9) < gap) return null;
    last.set(kind, t);
    return play(kind, opts);
  };
}
