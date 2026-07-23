const STORAGE_KEY = "guns-only.player-settings.v1";

export const CONTROL_BINDINGS = Object.freeze([
  Object.freeze({ action: "pull", label: "Pull", defaultCode: "ArrowDown", gkey: 0 }),
  Object.freeze({ action: "push", label: "Push", defaultCode: "ArrowUp", gkey: 1 }),
  Object.freeze({ action: "rollLeft", label: "Roll left", defaultCode: "ArrowLeft", gkey: 2 }),
  Object.freeze({ action: "rollRight", label: "Roll right", defaultCode: "ArrowRight", gkey: 3 }),
  Object.freeze({ action: "rudderLeft", label: "Rudder left", defaultCode: "KeyA", gkey: 4 }),
  Object.freeze({ action: "rudderRight", label: "Rudder right", defaultCode: "KeyD", gkey: 5 }),
  Object.freeze({ action: "powerUp", label: "Power up", defaultCode: "KeyW", gkey: 6 }),
  Object.freeze({ action: "powerDown", label: "Power down", defaultCode: "KeyS", gkey: 7 }),
  Object.freeze({ action: "fire", label: "Fire", defaultCode: "KeyF", gkey: 8 }),
  Object.freeze({ action: "padlock", label: "Padlock", defaultCode: "KeyV", gkey: 9 }),
  Object.freeze({ action: "limitOverride", label: "Limit override", defaultCode: "Space", gkey: 12 }),
  Object.freeze({ action: "gearToggle", label: "Gear toggle", defaultCode: "KeyG", gkey: 13 }),
  Object.freeze({ action: "flapUp", label: "Flaps up", defaultCode: "BracketLeft", gkey: 14 }),
  Object.freeze({ action: "flapDown", label: "Flaps down", defaultCode: "BracketRight", gkey: 15 }),
  Object.freeze({ action: "gcasOverride", label: "Auto-GCAS paddle", defaultCode: "KeyK", gkey: 20 }),
]);

const RESERVED_CODES = new Set([
  "Escape", "Enter", "NumpadEnter", "Tab", "F1", "KeyC", "KeyH", "KeyM", "KeyR",
  "KeyE", "KeyN", "KeyI", "TestFlightGearHornCutout",
  "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8",
]);

const defaultBindings = () => Object.fromEntries(
  CONTROL_BINDINGS.map(({ action, defaultCode }) => [action, defaultCode]),
);

export const DEFAULT_PLAYER_SETTINGS = Object.freeze({
  audio: true,
  highContrast: false,
  reducedMotion: false,
  largeText: false,
  tiltSensitivity: 1,
  // Combat feedback (Build 71): symbology at full opacity blocks the view of the bandit behind
  // it. Default slightly translucent; 1.0 remains available for bright daylight displays.
  hudBrightness: 0.84,
  legendSeen: false,
  bindings: Object.freeze(defaultBindings()),
});

const bool = (value, fallback) => typeof value === "boolean" ? value : fallback;
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function normalisePlayerSettings(value = {}) {
  const candidateBindings = value?.bindings && typeof value.bindings === "object"
    ? value.bindings : {};
  const bindings = defaultBindings();
  const processed = new Set();
  for (const definition of CONTROL_BINDINGS) {
    const candidate = candidateBindings[definition.action];
    if (typeof candidate === "string" && candidate.length <= 40
      && !RESERVED_CODES.has(candidate)) {
      const displaced = CONTROL_BINDINGS.find((other) =>
        other.action !== definition.action && bindings[other.action] === candidate);
      if (!displaced || !processed.has(displaced.action)) {
        const previous = bindings[definition.action];
        bindings[definition.action] = candidate;
        if (displaced) bindings[displaced.action] = previous;
      }
    }
    processed.add(definition.action);
  }
  return Object.freeze({
    audio: bool(value?.audio, DEFAULT_PLAYER_SETTINGS.audio),
    highContrast: bool(value?.highContrast, DEFAULT_PLAYER_SETTINGS.highContrast),
    reducedMotion: bool(value?.reducedMotion, DEFAULT_PLAYER_SETTINGS.reducedMotion),
    largeText: bool(value?.largeText, DEFAULT_PLAYER_SETTINGS.largeText),
    tiltSensitivity: Math.max(0.65, Math.min(1.6,
      finite(value?.tiltSensitivity, DEFAULT_PLAYER_SETTINGS.tiltSensitivity))),
    hudBrightness: Math.max(0.5, Math.min(1.0,
      finite(value?.hudBrightness, DEFAULT_PLAYER_SETTINGS.hudBrightness))),
    legendSeen: bool(value?.legendSeen, DEFAULT_PLAYER_SETTINGS.legendSeen),
    bindings: Object.freeze(bindings),
  });
}

export function loadPlayerSettings(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return normalisePlayerSettings(raw ? JSON.parse(raw) : {});
  } catch {
    return normalisePlayerSettings();
  }
}

export function savePlayerSettings(settings, storage = globalThis.localStorage) {
  const normalised = normalisePlayerSettings(settings);
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(normalised)); }
  catch { /* Private or locked-down browsing keeps settings session-local. */ }
  return normalised;
}

export function keyboardMapForSettings(settings) {
  const normalised = normalisePlayerSettings(settings);
  return new Map(CONTROL_BINDINGS.map((definition) => [
    normalised.bindings[definition.action], definition.gkey,
  ]));
}

export function rebindControl(settings, action, code) {
  const definition = CONTROL_BINDINGS.find((candidate) => candidate.action === action);
  if (!definition || typeof code !== "string" || !code || code.length > 40
    || RESERVED_CODES.has(code)) return null;
  const current = normalisePlayerSettings(settings);
  const bindings = { ...current.bindings };
  const displacedAction = CONTROL_BINDINGS.find(
    (candidate) => candidate.action !== action && bindings[candidate.action] === code,
  )?.action;
  const previous = bindings[action];
  bindings[action] = code;
  if (displacedAction) bindings[displacedAction] = previous;
  return normalisePlayerSettings({ ...current, bindings });
}

export function resetControlBindings(settings) {
  return normalisePlayerSettings({ ...normalisePlayerSettings(settings), bindings: defaultBindings() });
}

export function controlCodeLabel(code) {
  const labels = {
    ArrowDown: "↓", ArrowUp: "↑", ArrowLeft: "←", ArrowRight: "→",
    Space: "Space", BracketLeft: "[", BracketRight: "]",
  };
  if (labels[code]) return labels[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return code.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export const playerSettingsStorageKey = STORAGE_KEY;
