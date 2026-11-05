// Drawings of the two 8BitDo pads on the home TV, lit live from the Gamepad API (standard
// mapping: 0 bottom, 1 right, 2 left, 3 top, 4 LB, 5 RB, 6 LT, 7 RT, 8 select, 9 start,
// 12-15 d-pad, axes 0/1 left stick, 2/3 right stick). Pure strings so tests and the
// design sheet use the same art as the game.
export const padKind = (id = '') => (/sn30|snes|sf30|nes30/i.test(id) ? 'sn30' : 'xbox');

// What each control does in the car. `at` is the control's index in that pad's layout below.
export const ACTIONS = [
  {act: 'GO', ctl: 'stick', why: 'push up'},
  {act: 'GO', ctl: 7},
  {act: 'FIRE', ctl: 0},
  {act: 'BOOST', ctl: 3},
  {act: 'DRIFT', ctl: 5},
  {act: 'MORPH', ctl: 2},
  {act: 'FLY', ctl: 4}
];

const LAYOUT = {
  sn30: {
    body: '<path d="M70 40h160a62 62 0 0 1 0 124H70a62 62 0 0 1 0-124z" fill="#4fd06a" fill-opacity=".78" stroke="#1d6b31" stroke-width="3"/>',
    shoulder: {6: [58, 0, 54, 16, 'L2'], 7: [188, 0, 54, 16, 'R2'], 4: [44, 19, 70, 18, 'L'], 5: [186, 19, 70, 18, 'R']},
    face: {3: [236, 72, 'X'], 1: [262, 98, 'A'], 0: [236, 124, 'B'], 2: [210, 98, 'Y']},
    faceFill: () => '#2c8f45',
    dpad: [74, 98],
    sticks: [[118, 140], [182, 140]],
    small: {8: [132, 92, 'SELECT'], 9: [168, 92, 'START']}
  },
  xbox: {
    body: '<path d="M78 38h144c34 0 52 22 60 60l12 56c4 22-18 36-36 20l-30-30H72l-30 30c-18 16-40 2-36-20l12-56c8-38 26-60 60-60z" fill="#24272b" stroke="#000" stroke-width="3"/>',
    shoulder: {6: [62, -2, 52, 18, 'LT'], 7: [186, -2, 52, 18, 'RT'], 4: [52, 18, 70, 18, 'LB'], 5: [178, 18, 70, 18, 'RB']},
    face: {3: [232, 66, 'Y'], 1: [258, 92, 'B'], 0: [232, 118, 'A'], 2: [206, 92, 'X']},
    faceFill: i => ({0: '#3d9a4a', 1: '#c8453f', 2: '#3f73c8', 3: '#d8b13a'})[i],
    dpad: [112, 128],
    sticks: [[80, 84], [188, 128]],
    small: {8: [130, 74, '⧉'], 9: [170, 74, '≡']}
  }
};
const ON = '#ffd34d';

// state: {pressed: Set<int>, axes: [x,y,...]}, glow: Set of control keys to pulse ('stick', 0, 3...).
export function padSvg(kind, {pressed = new Set(), axes = [0, 0, 0, 0]} = {}, {labels = true, glow = new Set(), width = 300, skip = []} = {}) {
  const L = LAYOUT[kind],
    lit = i => pressed.has(i),
    pulse = k => (glow.has(k) ? ' class="pad-glow"' : ''),
    out = [`<svg viewBox="-64 -6 456 200" width="${width}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui" font-weight="800">`];
  for (const [i, [x, y, w, h, t]] of Object.entries(L.shoulder))
    out.push(
      `<g${pulse(+i)}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${lit(+i) ? ON : kind === 'sn30' ? '#3aa955' : '#3a3e44'}" stroke="#0008"/><text x="${x + w / 2}" y="${y + h - 3.5}" font-size="10" text-anchor="middle" fill="${lit(+i) ? '#000' : '#fff'}">${t}</text></g>`
    );
  out.push(L.body);
  // D-pad
  const [dx, dy] = L.dpad,
    arm = (i, x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${lit(i) ? ON : '#16181b'}"/>`;
  out.push(`<g${pulse('dpad')}>`, arm(12, dx - 9, dy - 27, 18, 20), arm(13, dx - 9, dy + 7, 18, 20), arm(14, dx - 27, dy - 9, 20, 18), arm(15, dx + 7, dy - 9, 20, 18), `<rect x="${dx - 9}" y="${dy - 9}" width="18" height="18" fill="#16181b"/></g>`);
  // Sticks: the cap moves with the stick.
  L.sticks.forEach(([x, y], n) => {
    const ax = axes[n * 2] ?? 0,
      ay = axes[n * 2 + 1] ?? 0,
      moved = Math.hypot(ax, ay) > 0.3;
    out.push(
      `<g${n === 0 ? pulse('stick') : ''}><circle cx="${x}" cy="${y}" r="19" fill="#0d0f11" stroke="${kind === 'xbox' ? '#46c8ff' : '#1d6b31'}" stroke-width="${kind === 'xbox' ? 3 : 2}"/><circle cx="${x + ax * 8}" cy="${y + ay * 8}" r="13" fill="${moved && n === 0 ? ON : '#2b2f34'}" stroke="#000"/></g>`
    );
  });
  for (const [i, [x, y, t]] of Object.entries(L.small))
    out.push(`<g${pulse(+i)}><rect x="${x - 13}" y="${y - 5}" width="26" height="10" rx="5" fill="${lit(+i) ? ON : '#16181b'}"/><text x="${x}" y="${y + 17}" font-size="7" fill="#fffa" text-anchor="middle">${t}</text></g>`);
  for (const [i, [x, y, t]] of Object.entries(L.face))
    out.push(
      `<g${pulse(+i)}><circle cx="${x}" cy="${y}" r="13" fill="${lit(+i) ? ON : '#111'}" stroke="${L.faceFill(+i)}" stroke-width="3"/><text x="${x}" y="${y + 5}" font-size="14" text-anchor="middle" fill="${lit(+i) ? '#000' : L.faceFill(+i) === '#2c8f45' ? '#c9f5d1' : L.faceFill(+i)}">${t}</text></g>`
    );
  if (labels) {
    // Action tags beside the controls they belong to, outside the body so they never cover it.
    const at = {stick: [L.sticks[0][0], L.sticks[0][1], -1], 0: [...L.face[0], 1], 3: [...L.face[3], 1], 5: [L.shoulder[5][0] + L.shoulder[5][2], L.shoulder[5][1] + 9, 1], 7: [L.shoulder[7][0] + L.shoulder[7][2], L.shoulder[7][1] + 8, 1], 2: [...L.face[2], 1], 4: [L.shoulder[4][0], L.shoulder[4][1] + 9, -1]};
    const place = {stick: [-58, kind === 'xbox' ? 84 : 150], 0: [304, 132], 3: [304, 84], 5: [304, 44], 7: [304, 8], 2: [304, 108], 4: [-58, 34]};
    for (const {act, ctl, why} of ACTIONS.filter(a => !skip.includes(a.act))) {
      const [cx, cy] = at[ctl],
        [tx, ty] = place[ctl],
        right = tx > 150;
      out.push(
        `<g${pulse(ctl)}><line x1="${cx}" y1="${cy}" x2="${right ? tx - 4 : tx + 54}" y2="${ty - 4}" stroke="#fff8" stroke-width="1.5"/><text x="${tx}" y="${ty}" font-size="17" fill="${act === 'GO' ? ON : '#fff'}">${act}</text>${why ? `<text x="${tx}" y="${ty + 12}" font-size="11" fill="#fffa">${why}</text>` : ''}</g>`
      );
    }
  }
  out.push('</svg>');
  return out.join('');
}
