// Keyboard hint tokens ([E], [return]) drawn as the button that does the same thing
// on an 8BitDo pad. Standard Gamepad indices. Xbox letters are the Ultimate 2;
// the green SN30 prints different letters on those same indices.

const XBOX = {
  0: 'A',
  1: 'B',
  2: 'X',
  3: 'Y',
  4: 'LB',
  5: 'RB',
  6: 'LT',
  7: 'RT',
  8: '⧉',
  9: '≡',
  12: '▲',
  13: '▼',
  14: '◀',
  15: '▶'
};
const SN30 = {
  0: 'B',
  1: 'A',
  2: 'Y',
  3: 'X',
  4: 'L',
  5: 'R',
  6: 'L2',
  7: 'R2',
  8: 'SELECT',
  9: 'START',
  12: '▲',
  13: '▼',
  14: '◀',
  15: '▶'
};
const LETTERS = {xbox: XBOX, sn30: SN30};

// What the key does on the car. Robot and flight swap a few of these in indexFor.
const KEY = {
  e: 2,
  f: 2,
  q: 2,
  space: 0,
  enter: 0,
  return: 0,
  t: 1,
  tab: 8,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
  esc: 1,
  escape: 1
};

function indexFor(name, form) {
  const key = String(name ?? '').toLowerCase();
  if (form === 'robot' && (key === 'e' || key === 'f')) return 3;
  if (form === 'robot' && key === 'q') return 2;
  if ((key === 'return' || key === 'enter') && form === 'fly') return 1;
  return KEY[key] ?? null;
}

/** The pad button for a hint token, or null when that key has no pad equivalent. */
export function padGlyph(name, {kind = 'xbox', form = 'car'} = {}) {
  const index = indexFor(name, form);
  if (index == null) return null;
  const letters = LETTERS[kind] ?? LETTERS.xbox;
  const label = letters[index];
  if (!label) return null;
  const face = {0: 'a', 1: 'b', 2: 'x', 3: 'y'}[index] ?? '';
  const shape = index <= 3 ? 'face' : index >= 12 ? 'dpad' : 'bump';
  return {label, kind: letters === SN30 ? 'sn30' : kind === 'sn30' ? 'sn30' : 'xbox', shape, face, index, title: `${label} on the controller`};
}

export function padCap(glyph, doc = globalThis.document) {
  const el = doc.createElement('kbd');
  el.className = `cap pad ${glyph.shape}`;
  el.dataset.pad = glyph.kind;
  if (glyph.face) el.dataset.face = glyph.face;
  el.textContent = glyph.label;
  el.title = glyph.title;
  el.setAttribute?.('aria-label', glyph.title);
  return el;
}
