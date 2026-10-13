/**
 * CONTROL QUICKLOOK (H) as a key card: one cell per control, [KEY CAP] ACTION, primary flight and
 * weapon controls first and bright, the rest dim. Package a8 (2026-10-13): the keyboard is the
 * core experience and the core player is a child, so FIRE comes first and the card shows only
 * controls that exist in this sortie (no Rapier automation or missile keys in an F-22 gunfight).
 * Explanations stay out of the cells; the action word names what the key does.
 */

const CAP_GLYPHS = Object.freeze({
  ArrowDown: "↓", ArrowUp: "↑", ArrowLeft: "←", ArrowRight: "→",
  Space: "SPACE", BracketLeft: "[", BracketRight: "]",
  Comma: "<", Period: ">", Slash: "/", Escape: "ESC", Tab: "TAB", Backquote: "`",
});

/** Short key-cap text for a KeyboardEvent.code (remapped bindings included). */
export function keyCapLabel(code, fallback = "") {
  const value = String(code ?? fallback ?? "").trim() || String(fallback);
  if (CAP_GLYPHS[value]) return CAP_GLYPHS[value];
  if (/^Key[A-Z]$/.test(value)) return value.slice(3);
  if (/^Digit[0-9]$/.test(value)) return value.slice(5);
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase();
}

/**
 * @param {object} options
 * @param {Record<string,string>} [options.bindings] action -> KeyboardEvent.code
 * @param {"f22"|"valley"|"topgun"|"rapier"} [options.mode]
 * @param {boolean} [options.gcasAvailable]
 * @param {boolean} [options.f14WingSweep]
 * @param {string|null} [options.foxTwo] Top Gun missile label (e.g. "FOX TWO ×2")
 * @returns {{caps: string[], action: string, primary: boolean}[]}
 */
export function controlQuicklookEntries({
  bindings = {}, mode = "f22", gcasAvailable = false, f14WingSweep = false, foxTwo = null,
} = {}) {
  const cap = (action, fallback) => keyCapLabel(bindings?.[action], fallback);
  const fireAction = mode === "valley" ? "FIRE · FOX 2 → GUNS" : "FIRE";
  const entries = [
    { caps: [cap("fire", "KeyF")], action: fireAction, primary: true },
    { caps: [cap("pull", "ArrowDown"), cap("push", "ArrowUp")], action: "PULL · PUSH", primary: true },
    { caps: [cap("rollLeft", "ArrowLeft"), cap("rollRight", "ArrowRight")], action: "ROLL", primary: true },
    { caps: [cap("powerUp", "KeyW"), cap("powerDown", "KeyS")], action: "POWER", primary: true },
    { caps: [cap("padlock", "KeyV")], action: "PADLOCK", primary: true },
    { caps: [cap("limitOverride", "Space")], action: "LIMIT OVR", primary: true },
  ];
  if (mode === "topgun") {
    entries.push({ caps: ["R"], action: foxTwo ? foxTwo.replace(/^R\s+/, "") : "FOX TWO", primary: true });
  }
  entries.push(
    { caps: [cap("rudderLeft", "KeyA"), cap("rudderRight", "KeyD")], action: "RUDDER", primary: false },
    { caps: ["TAB"], action: "NEXT TARGET", primary: false },
    { caps: ["DRAG"], action: "LOOK", primary: false },
    { caps: [cap("gearToggle", "KeyG")], action: "GEAR", primary: false },
    { caps: [cap("flapUp", "BracketLeft"), cap("flapDown", "BracketRight")], action: "FLAPS", primary: false },
    { caps: [cap("hookToggle", "KeyU")], action: "HOOK", primary: false },
  );
  if (f14WingSweep) {
    entries.push(
      { caps: [cap("wingSweepForward", "Comma"), cap("wingSweepAft", "Period")], action: "WING SWEEP", primary: false },
      { caps: [cap("wingSweepAuto", "Slash")], action: "SWEEP AUTO", primary: false },
    );
  }
  if (gcasAvailable) entries.push({ caps: [cap("gcasOverride", "KeyK")], action: "AGCAS PADDLE", primary: false });
  if (mode === "rapier") {
    entries.push(
      { caps: ["P"], action: "AUTOMATION", primary: false },
      { caps: ["Z"], action: "MISSILE", primary: false },
    );
  }
  entries.push(
    mode === "topgun"
      ? { caps: [cap("knockItOff", "KeyO")], action: "RTB", primary: false }
      : { caps: ["R"], action: "RESTART", primary: false },
    { caps: ["T"], action: "TIME COMP", primary: false },
    { caps: ["M"], action: "SOUND", primary: false },
    { caps: ["`"], action: "SYNC MARK", primary: false },
    { caps: ["ESC"], action: "PAUSE", primary: false },
    { caps: ["H"], action: "HIDE", primary: false },
  );
  return entries;
}
