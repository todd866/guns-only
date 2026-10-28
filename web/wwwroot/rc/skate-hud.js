// Skate session presentation, after Tony Hawk's Pro Skater 2: score and S-K-A-T-E at top
// left, the run clock at top right, the live combo along the bottom, gap and goal pop-ups,
// and the goal card that opens and closes every run. Rules live in physics/skate.mjs.
import { comboText, commas } from './physics/skate.mjs';

const $ = id => document.getElementById(id);
const clock = t => `${Math.floor(Math.ceil(t) / 60)}:${String(Math.ceil(t) % 60).padStart(2, '0')}`;
const escape = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function goalCard({ park, goals, best = 0, run = null, gapsFound = [] }) {
  const done = new Set(goals), fresh = new Set(run?.newGoals ?? []);
  const gapNames = [...new Set(park.gaps.map(g => g.name))];
  const rows = park.goals.map(g => {
    const target = g.score ? commas(g.score) : '';
    return `<li class="${done.has(g.id) ? 'done' : ''}${fresh.has(g.id) ? ' fresh' : ''}"><b aria-hidden="true">${done.has(g.id) ? '✓' : ''}</b><span>${escape(g.label)}</span><em>${target}</em></li>`;
  }).join('');
  const stats = [run ? ['Score', commas(run.score)] : null, ['Best', commas(Math.max(best, run?.score ?? 0))],
    ['Goals', `${done.size}/${park.goals.length}`], ['Gaps', `${gapsFound.length}/${gapNames.length}`]].filter(Boolean);
  return `<div class="result-head"><span class="result-place skate-badge" title="Skate park">🛹</span><h1>${escape(park.name)}</h1></div>`
    + `<ol class="skate-goals" aria-label="Goals">${rows}</ol>`
    + `<dl class="result-stats">${stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`
    + `<div class="result-actions"><button id="skate-go" class="primary">${run ? '↻ Run again' : '▶ Start run'}</button><button id="skate-free">▶ Drive</button></div>`;
}

export function createSkateHud({ scene, T }) {
  const root = $('skate'), pop = $('skate-pop');
  let popTimer = 0, markers = null;
  function popUp(text, kind = '') {
    pop.textContent = text; pop.className = kind; pop.hidden = false;
    void pop.offsetWidth; pop.classList.add('show');
    clearTimeout(popTimer); popTimer = setTimeout(() => { pop.hidden = true; }, 1500);
  }
  // Floating gold letters and a cassette above the park, sprites that always face the camera.
  function sprite(text, colour) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const g = canvas.getContext('2d');
    g.font = `900 ${text.length > 1 ? 54 : 104}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 12; g.strokeStyle = '#1b2a2e'; g.strokeText(text, 64, 68); g.fillStyle = colour; g.fillText(text, 64, 68);
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
    const s = new T.Sprite(new T.SpriteMaterial({ map: texture, depthTest: true, transparent: true }));
    s.scale.set(.55, .55, 1); return s;
  }
  function placeMarkers(park, toWorld) {
    if (markers) return;
    markers = new Map();
    for (const l of park.letters) { const s = sprite(l.letter, '#edbd6a'); s.position.set(...toWorld(l.at)); scene.add(s); markers.set(l.letter, s); }
    if (park.tape) { const s = sprite('📼', '#f3efdc'); s.position.set(...toWorld(park.tape)); scene.add(s); markers.set('tape', s); }
  }
  return {
    start(sk, toWorld) { placeMarkers(sk.park, toWorld); root.hidden = false; document.body.classList.add('skating'); },
    stop() {
      root.hidden = true; document.body.classList.remove('skating');
      if (markers) for (const m of markers.values()) { m.removeFromParent(); m.material.map.dispose(); m.material.dispose(); }
      markers = null;
    },
    event(e) {
      if (e.type === 'gap') popUp(`${e.name}  +${commas(e.points)}`, 'gap');
      else if (e.type === 'bail') popUp('BAIL', 'bail');
      else if (e.type === 'letter') popUp(e.letter, 'letter');
      else if (e.type === 'tape') popUp('SECRET TAPE', 'gap');
      else if (e.type === 'goal') popUp(`✓ ${e.label}`, 'goal');
      else if (e.type === 'land' && e.tricks > 1) popUp(`+${commas(e.total)}`, 'land');
    },
    update(sk, now) {
      $('skate-score').textContent = commas(sk.score);
      $('skate-clock').textContent = clock(sk.left);
      $('skate-clock').classList.toggle('low', sk.left <= 10);
      for (const el of $('skate-letters').children) el.classList.toggle('lit', sk.letters.includes(el.textContent));
      const combo = comboText(sk);
      $('skate-combo').hidden = !combo;
      if (combo) { $('skate-tricks').textContent = combo.tricks; $('skate-points').textContent = combo.score; }
      if (markers) for (const [key, m] of markers) {
        m.visible = key === 'tape' ? !sk.tape : !sk.letters.includes(key);
        m.material.rotation = Math.sin(now * .002 + key.charCodeAt(0)) * .15;
      }
    },
  };
}
