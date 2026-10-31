// Key hints a six-year-old can find on a MacBook Air (owner, 31 Oct: "he's looking at a macbook air
// keyboard, 'enter' doesn't necessarily mean anything"; "we can also show a zoomed in picture of the
// keyboard"). A hint like "[return] fly" draws the key as it looks on his keyboard (its own legend,
// "return" not "Enter", a blank bar for space) and, beside the line, a zoomed-in picture of that
// corner of the keyboard with the key lit gold, so he finds it by shape and place as well as word.

// The MacBook Air's letter block in key units (1 = a letter key), legends as printed on the keys.
const ROWS = [
  [
    ['`'],
    ['1'],
    ['2'],
    ['3'],
    ['4'],
    ['5'],
    ['6'],
    ['7'],
    ['8'],
    ['9'],
    ['0'],
    ['-'],
    ['='],
    ['delete', 1.5]
  ],
  [['tab', 1.5], ['Q'], ['W'], ['E'], ['R'], ['T'], ['Y'], ['U'], ['I'], ['O'], ['P'], ['['], [']'], ['\\']],
  [
    ['caps lock', 1.75],
    ['A'],
    ['S'],
    ['D'],
    ['F'],
    ['G'],
    ['H'],
    ['J'],
    ['K'],
    ['L'],
    [';'],
    ["'"],
    ['return', 1.75]
  ],
  [['shift', 2.25], ['Z'], ['X'], ['C'], ['V'], ['B'], ['N'], ['M'], [','], ['.'], ['/'], ['shift', 2.25]],
  [
    ['fn'],
    ['control'],
    ['option'],
    ['command', 1.25],
    ['space', 5],
    ['command', 1.25],
    ['option'],
    ['◀'],
    ['▲▼'],
    ['▶']
  ]
];
// Hint words → the key's legend. Case doesn't matter in a hint.
const ALIAS = {
  enter: 'return',
  return: 'return',
  space: 'space',
  shift: 'shift',
  tab: 'tab',
  esc: 'esc',
  up: '▲▼',
  down: '▲▼',
  left: '◀',
  right: '▶'
};
const KEYS = (() => {
  const out = [];
  ROWS.forEach((row, r) => {
    let x = 0;
    for (const [label, w = 1] of row) {
      out.push({label, x, y: r, w});
      x += w;
    }
  });
  return out;
})();
const find = name => {
  const want = ALIAS[name.toLowerCase()] ?? name.toUpperCase();
  return KEYS.find(k => k.label === want) ?? null;
};

/** The key cap as it looks on his keyboard: a rounded key with its own legend (space is blank). */
export function keyCap(name) {
  const k = find(name),
    el = document.createElement('kbd');
  el.className = 'keycap' + (k && k.w > 1.4 ? ' wide' : '');
  // The up and down arrows share one split key; the cap shows the half to press.
  const half = {up: '▲', down: '▼'}[name.toLowerCase()];
  el.textContent = half ?? (!k ? name : k.label === 'space' ? '' : k.label);
  if (k?.label === 'space') el.classList.add('space');
  el.title = half
    ? `the ${name.toLowerCase()} arrow`
    : k
      ? k.label === 'space'
        ? 'the long bar at the bottom'
        : `the ${k.label} key`
      : name;
  return el;
}

/** A zoomed-in picture of the keyboard around the key, the key lit gold. 5 keys wide, 3 rows high. */
export function keyZoom(name) {
  const k = find(name);
  if (!k) return null;
  const U = 22,
    cx = k.x + k.w / 2,
    // The crop stays on the keyboard (15 key units wide): an edge key like return sits at the side.
    x0 = Math.max(0, Math.min(15 - 5, cx - 2.5)),
    y0 = Math.max(0, Math.min(ROWS.length - 3, k.y - 1)),
    ns = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${5 * U} ${3 * U}`);
  svg.setAttribute('class', 'keyzoom');
  svg.setAttribute('aria-hidden', 'true');
  for (const key of KEYS) {
    if (key.y < y0 || key.y > y0 + 2 || key.x + key.w < x0 || key.x > x0 + 5) continue;
    const lit = key === k,
      r = document.createElementNS(ns, 'rect'),
      t = document.createElementNS(ns, 'text');
    r.setAttribute('x', (key.x - x0) * U + 1.5);
    r.setAttribute('y', (key.y - y0) * U + 1.5);
    r.setAttribute('width', key.w * U - 3);
    r.setAttribute('height', U - 3);
    r.setAttribute('rx', 3);
    r.setAttribute('class', lit ? 'lit' : '');
    svg.append(r);
    if (key.label !== 'space') {
      t.setAttribute('x', (key.x - x0 + key.w / 2) * U);
      t.setAttribute('y', (key.y - y0) * U + U * 0.62);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('class', lit ? 'lit' : '');
      t.textContent = key.label.length > 4 && !lit ? '' : key.label;
      svg.append(t);
    }
  }
  return svg;
}

/**
 * Fill an element with a hint line: "[return] fly" → the zoomed picture of the first key, then the
 * words with each [key] drawn as a key cap. Plain text otherwise (typed names stay text, never HTML).
 */
export function renderHint(el, text) {
  el.replaceChildren();
  const parts = String(text).split(/\[([^\]]+)\]/);
  const first = parts.length > 1 ? keyZoom(parts[1]) : null;
  if (first) el.append(first);
  parts.forEach((p, i) => {
    if (i % 2) el.append(keyCap(p));
    else if (p) el.append(document.createTextNode(p));
  });
}
