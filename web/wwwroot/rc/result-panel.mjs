// Finish and Furball result panel: a place badge, the podium plus your row, labelled stats and
// the three actions. The rest of the finishing order expands in place from a "…" button.
const escape = text =>
  String(text).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
export const ordinal = n =>
  n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'));
const TITLES = ['Sierra Hotel!', 'Good hustle, Airman!', 'On the podium!'];
export const placeTitle = place => TITLES[place - 1] ?? 'Next sortie!';

/**
 * @param {{badge?: string, badgeTitle?: string, title: string, order?: string[], you?: number,
 *   stats: [string, string][], again: string}} result
 * `order` lists callsigns by finishing place with the player as 'YOU'; `you` is the player's place.
 */
export function resultPanel({
  badge,
  badgeTitle = 'Finishing place',
  title,
  order = [],
  you = 0,
  stats,
  again
}) {
  // Podium plus your place; the hidden middle stays in the list behind a "…" toggle.
  const keep = place => place <= 3 || place === you || (you <= 3 && place === 4);
  let gap = false;
  const standings = order.length
    ? `<ol class="result-order" aria-label="Finishing order">${order
        .map((name, i) => {
          const place = i + 1,
            hidden = !keep(place),
            toggle =
              hidden && !gap
                ? '<li class="gap"><button type="button" aria-label="Show full finishing order" aria-expanded="false">…</button></li>'
                : '';
          gap ||= hidden;
          const classes = [place === you && 'you', hidden && 'mid'].filter(Boolean).join(' ');
          return `${toggle}<li${classes ? ` class="${classes}"` : ''}><b>${place}</b> ${escape(name)}</li>`;
        })
        .join('')}</ol>`
    : '';
  return (
    `<div class="result-head">${badge ? `<span class="result-place" title="${escape(badgeTitle)}">${badge}</span>` : ''}<h1>${escape(title)}</h1></div>${standings}` +
    `<dl class="result-stats">${stats.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>` +
    `<div class="result-actions"><button id="again" class="primary">${again}</button><button id="explore">▶ Drive</button><button id="to-menu">⏸ Menu</button></div>`
  );
}

export function bindResultPanel(root) {
  const toggle = root.querySelector('.result-order .gap button');
  toggle?.addEventListener('click', () => {
    root.querySelector('.result-order').classList.add('open');
    toggle.parentElement.remove();
  });
}
