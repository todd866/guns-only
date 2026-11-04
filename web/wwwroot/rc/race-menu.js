import {
  RACE_EVENTS,
  canEnter,
  canEnterEvent,
  locationById,
  dreamlandUnlocked,
  alienWorldUnlocked
} from './open-world/catalog.mjs';

export const CUP_COURSES = Object.freeze([
  {
    cup: 'Home Base',
    color: '#8fd2a7',
    courses: [
      ['district-housing', 'Base Housing', 'Luigi Raceway'],
      ['district-bx', 'BX Dash', 'Moo Moo Farm'],
      ['district-school', 'School Run', 'Mario Raceway'],
      ['splash-down', 'Wavepool Beach', 'Koopa Troopa Beach']
    ]
  },
  {
    cup: 'Flightline',
    color: '#f2b56b',
    courses: [
      ['demo-team-circuit', 'Demo Team Circuit', 'Mario Raceway'],
      ['supply-line', 'Supply Line', 'Kalimari Desert'],
      ['ramp-rat', 'Red Flag Ramp', 'Wario Stadium'],
      ['wing-walker', 'Boneyard Maze', 'Yoshi Valley']
    ]
  },
  {
    cup: 'Dreamland',
    color: '#d99ce0',
    courses: [
      ['cold-start', 'Cold Start', 'Frappe Snowland'],
      ['ice-patrol', 'Ice Patrol', 'Sherbet Land'],
      ['canopy-run', 'Canopy Run', 'D.K.’s Jungle Parkway'],
      ['dreamland', 'Containment Circuit', 'Bowser’s Castle']
    ]
  },
  {
    cup: 'Beyond the Portal',
    color: '#79c7dc',
    courses: [
      ['lunar-paddock', 'Lunar Paddock', 'Moo Moo Farm'],
      ['comet-quarry', 'Comet Quarry', 'Choco Mountain'],
      ['gravity-garden', 'Gravity Garden', 'Royal Raceway'],
      ['night-wave', 'Night Wave', 'Rainbow Road']
    ]
  }
]);
export const BATTLE_ARENAS = Object.freeze([
  ['fuel-depot-ring', 'Fuel Depot Ring', 'Big Donut'],
  ['bx-pallet-forts', 'BX Pallet Forts', 'Block Fort'],
  ['hq-parking-decks', 'HQ Parking Decks', 'Double Deck'],
  ['hangar-roof-deck', 'Hangar Roof Deck', 'Skyscraper']
]);
const eventFor = id => RACE_EVENTS.find(e => e.id === id);
export const raceIsAvailable = (state, event) => Boolean(event) && canEnterEvent(state, event);
const routeFor = id => (eventFor(id)?.points || []).map(p => [Number(p[0]), Number(p[1])]);
export function routePath(points) {
  if (!points.length) return '';
  const minX = Math.min(...points.map(p => p[0])),
    maxX = Math.max(...points.map(p => p[0])),
    minZ = Math.min(...points.map(p => p[1])),
    maxZ = Math.max(...points.map(p => p[1]));
  const sx = 76 / Math.max(1, maxX - minX),
    sz = 42 / Math.max(1, maxZ - minZ);
  return points
    .map((p, i) => `${i ? 'L' : 'M'}${8 + (p[0] - minX) * sx} ${52 - (p[1] - minZ) * sz}`)
    .join(' ');
}
function esc(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]
  );
}
function hrefFor(event, mode, search) {
  const q = new URLSearchParams(search ?? globalThis.location?.search ?? '');
  for (const k of ['track', 'from', 'event', 'mode', 'at', 'cup']) q.delete(k);
  q.set('track', 'hub');
  q.set('event', event);
  q.set('mode', mode);
  return `?${q}`;
}
export function createRaceMenu({
  progress = {},
  search = globalThis.location?.search ?? '',
  onClose = () => {},
  onStartCup = () => {}
} = {}) {
  if (!globalThis.document) throw new TypeError('createRaceMenu requires a document');
  const dialog = document.createElement('dialog');
  dialog.className = 'rc-race-menu';
  dialog.setAttribute('aria-label', 'Choose a race');
  const getProgress = typeof progress === 'function' ? progress : () => progress;
  let cupIndex = 0,
    battle = false,
    lastFocus = null;
  const header = `<form method="dialog" class="rc-race-menu-head"><div><span class="rc-kicker">RACE</span><h2>Choose your race</h2></div><button type="button" data-close aria-label="Close race menu">×</button></form><div class="rc-race-tabs" role="tablist" aria-label="Race series">${CUP_COURSES.map((c, i) => `<button type="button" role="tab" data-cup="${i}">${c.cup}</button>`).join('')}<button type="button" role="tab" data-battle="true">Battle</button></div><div class="rc-race-grid" data-grid></div><button type="button" data-start-cup>Start cup</button>`;
  dialog.innerHTML = header;
  document.body.append(dialog);
  const grid = dialog.querySelector('[data-grid]');
  const draw = () => {
    const state = getProgress() || {};
    if (
      !battle &&
      !(
        cupIndex < 2 ||
        (cupIndex === 2 && dreamlandUnlocked(state)) ||
        (cupIndex === 3 && alienWorldUnlocked(state))
      )
    )
      cupIndex = 0;
    const items = battle ? BATTLE_ARENAS : CUP_COURSES[cupIndex].courses;
    dialog.querySelectorAll('[role=tab]').forEach(b => {
      const i = Number(b.dataset.cup);
      b.hidden = Boolean(
        !battle &&
        Number.isInteger(i) &&
        !(i < 2 || (i === 2 && dreamlandUnlocked(state)) || (i === 3 && alienWorldUnlocked(state)))
      );
      b.setAttribute(
        'aria-selected',
        String(battle ? b.dataset.battle === 'true' : b.dataset.cup === String(cupIndex))
      );
    });
    grid.innerHTML = items
      .map((item, i) => {
        const [id, name, reference] = item,
          event = eventFor(id),
          allowed = raceIsAvailable(state, event),
          locked = !allowed && event?.location === 'lab',
          route = routeFor(id),
          disabled = !allowed,
          reason = !event
            ? 'Coming soon'
            : locked
              ? 'Finish base cups + find all 15 badges'
              : 'Find this course in the base';
        return `<article class="rc-race-card ${disabled ? 'is-locked' : ''}" style="--cup:${battle ? '#c58df2' : CUP_COURSES[cupIndex].color}"><button type="button" data-event="${esc(id)}" data-battle="${battle}" ${disabled ? 'disabled' : ''} title="${esc(reference)}" aria-label="${esc(name)}${disabled ? ` ${esc(reason)}` : ''}"><svg viewBox="0 0 92 60" aria-hidden="true">${route.length ? `<path d="${routePath(route)}"/>` : '<path d="M20 30L46 12L72 30M25 27V50H67V27M40 50V34H52V50"/>'}</svg><span class="rc-race-card-copy"><strong>${esc(name)}</strong>${disabled ? `<em>${esc(reason)}</em>` : ''}</span><span class="rc-race-number">${String(i + 1).padStart(2, '0')}</span></button></article>`;
      })
      .join('');
    const start = dialog.querySelector('[data-start-cup]');
    start.hidden = battle;
    start.disabled = battle || items.some(([id]) => !raceIsAvailable(state, eventFor(id)));
  };
  const close = () => {
    if (dialog.open) dialog.close();
    else if (dialog.hasAttribute('open')) {
      dialog.removeAttribute('open');
      if (lastFocus?.focus) lastFocus.focus();
      onClose();
    } else if (lastFocus?.focus) lastFocus.focus();
  };
  dialog.addEventListener('close', () => {
    if (lastFocus?.focus) lastFocus.focus();
    onClose();
  });
  dialog.querySelector('[data-close]').onclick = close;
  dialog.querySelector('[data-start-cup]').onclick = () => onStartCup(cupIndex);
  dialog.querySelectorAll('[data-cup]').forEach(
    b =>
      (b.onclick = () => {
        battle = false;
        cupIndex = Number(b.dataset.cup);
        draw();
      })
  );
  dialog.querySelector('[data-battle]').onclick = () => {
    battle = true;
    draw();
  };
  grid.addEventListener('click', e => {
    const b = e.target.closest('[data-event]');
    if (!b || b.disabled) return;
    location.href = hrefFor(b.dataset.event, b.dataset.battle === 'true' ? 'furball' : 'race', search);
  });
  dialog.addEventListener('cancel', e => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === 'Tab') {
      const focusables = [...dialog.querySelectorAll('button:not([disabled])')];
      if (!focusables.length) return;
      const first = focusables[0],
        last = focusables.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  const open = () => {
    if (dialog.open) return;
    lastFocus = document.activeElement;
    draw();
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute('open', '');
    dialog.querySelector('[data-cup="0"]').focus();
  };
  return {element: dialog, open, close, isOpen: () => dialog.open};
}
