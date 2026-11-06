// Drive the menus with a controller: d-pad / left stick moves a highlight between the
// buttons of whatever menu is open, A presses it, B goes back. Pure geometry so it can
// be tested without a browser: `items` are {el, x, y} centres, `dir` is [dx, dy].
import {stickAxis} from './gamepad.mjs';
export function nearest(items, from, [dx, dy]) {
  let best = null,
    score = Infinity;
  for (const it of items) {
    if (it === from) continue;
    const vx = it.x - from.x,
      vy = it.y - from.y,
      along = vx * dx + vy * dy;
    if (along <= 1) continue;
    const across = Math.abs(vx * dy - vy * dx),
      s = along + across * 2.5;
    if (s < score) (score = s), (best = it);
  }
  return best;
}
// In a menu, A confirms and B goes back. The same indices as the standard pad.
export const MENU_CONFIRM = 0;
export const MENU_BACK = 1;
const pressed = (p, i) => (p?.buttons?.[i]?.value ?? 0) > 0.5;
function direction(pads) {
  for (const p of pads) {
    const ax = stickAxis(p.axes?.[0]),
      ay = stickAxis(p.axes?.[1]),
      x = (pressed(p, 15) ? 1 : 0) - (pressed(p, 14) ? 1 : 0) || (Math.abs(ax) > 0.5 ? Math.sign(ax) : 0),
      y = (pressed(p, 13) ? 1 : 0) - (pressed(p, 12) ? 1 : 0) || (Math.abs(ay) > 0.5 ? Math.sign(ay) : 0);
    if (x || y) return Math.abs(x) >= Math.abs(y) ? [x, 0] : [0, y];
  }
  return null;
}
// createMenuPad({root, back}) → poll(pads, now) returns true when it used the input.
// root(): the open menu element or null. back(): close it / resume.
export function createMenuPad({root, back, doc = globalThis.document}) {
  let held = '',
    nextAt = 0,
    a = false,
    b = false,
    current = null;
  const visible = el => el.offsetParent !== null && !el.disabled && !el.hidden,
    items = r =>
      [...r.querySelectorAll('button, a[href], select, input:not([type=hidden])')].filter(visible).map(el => {
        const q = el.getBoundingClientRect();
        return {el, x: q.left + q.width / 2, y: q.top + q.height / 2};
      }),
    mark = el => {
      current?.classList.remove('pad-focus');
      current = el;
      if (el) {
        el.classList.add('pad-focus');
        el.focus({preventScroll: false});
      }
    };
  return (pads, now) => {
    const live = Array.from(pads ?? []).filter(p => p?.connected),
      r = root(),
      aNow = live.some(p => pressed(p, MENU_CONFIRM)),
      bNow = live.some(p => pressed(p, MENU_BACK)),
      dir = direction(live);
    if (!r) {
      if (current) mark(null);
      a = aNow;
      b = bNow;
      held = '';
      return false;
    }
    const list = items(r);
    let here = list.find(i => i.el === current);
    if (!here && list.length) mark((here = list[0]).el);
    const key = dir ? dir.join() : '';
    if (key && (key !== held || now >= nextAt) && here) {
      const to = nearest(list, here, dir);
      if (to) mark(to.el);
      nextAt = now + (key !== held ? 380 : 140);
    }
    held = key;
    if (aNow && !a && current) {
      if (current.tagName === 'SELECT') {
        current.selectedIndex = (current.selectedIndex + 1) % current.options.length;
        current.dispatchEvent(new Event('change', {bubbles: true}));
      } else current.click();
    }
    if (bNow && !b) back();
    const used = (aNow && !a) || (bNow && !b) || !!key;
    a = aNow;
    b = bNow;
    return used;
  };
}
