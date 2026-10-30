import * as T from '../../vendor/three.module.js';

// The hidden game's reveal (docs/design/adventure): touch the spirit mark at the end of the Old
// Silver Mine and the RC sandbox turns out to be a prologue. Letterbox bars close in, the camera
// rises out through the hill into the sky, a few short story cards, then the title.
// Enter or Space moves to the next card; the last one hands control back at the mine mouth.
export const INTRO_CARDS = Object.freeze([
  'Long ago, good aliens came to Saucer Springs.',
  'Their light woke the toys.',
  'Now bad aliens are sending a signal from the other side…',
  '…through the spirit cave, high on the mountain.',
]);
export const TITLE = Object.freeze({ name: 'SPIRIT MOUNTAIN', sub: 'a toy’s legend' });

export function createIntro(root = document.body) {
  const el = document.createElement('div'); el.id = 'intro'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<style>
body.cinematic :is(#instruments,#item,#map,#banner,#pause,#mute,#atlas,#garage,#mode,#destination,#interact,#flight-hud){visibility:hidden}
#intro{position:fixed;inset:0;z-index:1000;pointer-events:none;font-family:Georgia,'Times New Roman',serif;color:#f4ecd6}
#intro .bar{position:absolute;left:0;right:0;height:0;background:#000;transition:height 1.2s ease}
#intro .bar.top{top:0}#intro .bar.bot{bottom:0}#intro.on .bar{height:12vh}
#intro .card{position:absolute;left:8vw;right:8vw;bottom:15vh;text-align:center;font-size:clamp(20px,3.4vw,42px);line-height:1.3;text-shadow:0 2px 12px #000;opacity:0;transition:opacity .9s ease}
#intro .card.show{opacity:1}
#intro .title{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.2vh;opacity:0;transition:opacity 1.6s ease;background:radial-gradient(ellipse at center,rgba(0,0,0,.15),rgba(0,0,0,.65))}
#intro .title.show{opacity:1}
#intro .title b{font-size:clamp(40px,8vw,112px);letter-spacing:.12em;color:#ffe9a8;text-shadow:0 0 28px #5ff0dc,0 4px 18px #000}
#intro .title i{font-size:clamp(18px,2.4vw,30px);letter-spacing:.3em;text-transform:uppercase;font-style:normal;color:#bfe8e0}
#intro .title small{margin-top:4vh;font:600 15px system-ui;letter-spacing:.2em;color:#f4ecd6;opacity:.8}
#intro .next{position:absolute;right:4vw;bottom:4vh;font:600 13px system-ui;letter-spacing:.15em;opacity:.7}
</style><div class="bar top"></div><div class="bar bot"></div><div class="card"></div>
<div class="title"><b>${TITLE.name}</b><i>${TITLE.sub}</i><small>PRESS ENTER</small></div><div class="next">ENTER ▸</div>`;
  root.appendChild(el);
  const card = el.querySelector('.card'), title = el.querySelector('.title'), next = el.querySelector('.next');
  let active = false, i = -1, t = 0, from = null, over = null, onDone = null;
  const show = n => {
    i = n; t = 0;
    if (i < INTRO_CARDS.length) { card.classList.remove('show'); setTimeout(() => { card.textContent = INTRO_CARDS[i]; card.classList.add('show'); }, i ? 450 : 1200); }
    else { card.classList.remove('show'); title.classList.add('show'); next.hidden = true; }
  };
  return {
    get active() { return active; },
    /** from: where the camera starts; over: a world point to rise above and look out from. */
    play(start, above, done) {
      active = true; document.body.classList.add('cinematic'); from = start.clone(); over = new T.Vector3(...above); onDone = done; el.hidden = false; next.hidden = false;
      title.classList.remove('show'); requestAnimationFrame(() => el.classList.add('on')); show(0);
    },
    advance() {
      if (!active) return;
      if (i < INTRO_CARDS.length) show(i + 1);
      else { active = false; document.body.classList.remove('cinematic'); el.classList.remove('on'); title.classList.remove('show'); card.classList.remove('show'); setTimeout(() => { el.hidden = true; }, 1200); onDone?.(); }
    },
    /** Each frame while active: auto-advance the story cards and fly the camera. */
    update(dt, camera) {
      if (!active) return;
      t += dt; if (i < INTRO_CARDS.length && t > 5.5) show(i + 1);
      // One continuous rise from the robot up through the hill to a high, slowly turning view.
      const k = Math.min(1, (i + Math.min(1, t / 5.5)) / (INTRO_CARDS.length + 1)), e = k * k * (3 - 2 * k);
      const a = .6 + e * 1.4, high = new T.Vector3(over.x + Math.sin(a) * 26, over.y + 22, over.z + Math.cos(a) * 26);
      camera.position.lerpVectors(from, high, e);
      camera.lookAt(over.x - Math.sin(a) * 40, over.y + 6 * e, over.z - Math.cos(a) * 40);
    },
    dispose() { el.remove(); },
  };
}
