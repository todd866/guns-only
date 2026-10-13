import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '../../../../smoke/node_modules/playwright/index.mjs';

const html = await readFile(new URL('../../../index.html', import.meta.url), 'utf8');
const styles = html.match(/<style>([\s\S]*?)<\/style>/)[1];

for (const [name, width, height] of [['portrait', 390, 844], ['landscape', 844, 390]]) {
  test(`F-22 ${name} result is opaque on the first visible frame`, async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chromium' });
    try {
      const page = await browser.newPage({ viewport: { width, height }, hasTouch: true, isMobile: true });
      await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1">
        <style>${styles}</style><div id="ready-screen" data-mode="debrief" data-f22-result="combat">
          <div class="ready-card"><div class="ready-briefing"><section class="f22-result">
            <div class="f22-row">FIGHT <span>✓ 2/2</span></div>
            <div class="f22-row">BFM <span>D1 ✓ → O2</span></div>
          </section></div></div></div>`);
      await page.evaluate(() => document.documentElement.classList.add('touch-mode', 'run-paused'));
      const paint = await page.evaluate(async () => {
        const screen = document.querySelector('#ready-screen');
        // Establish the hidden frame, then inspect the first visible animation frame.
        getComputedStyle(screen).opacity;
        screen.classList.add('visible');
        await new Promise(requestAnimationFrame);
        const card = getComputedStyle(document.querySelector('.ready-card'));
        return { opacity: getComputedStyle(screen).opacity, cardColor: card.backgroundColor };
      });
      assert.equal(paint.opacity, '1', 'HUD must not bleed through during the result fade');
      assert.match(paint.cardColor, /^rgb\(/, 'card needs an opaque base behind every row/action');
      // Exercise the card independently of the page scrim: underlying HUD colour must not
      // affect any interior pixel. The real stylesheet and cascade remain in force.
      await page.evaluate(() => {
        const screen = document.querySelector('#ready-screen');
        screen.style.background = 'transparent';
        document.body.style.background = '#ff00ff';
      });
      const box = await page.locator('.ready-card').boundingBox();
      const clip = { x: box.x + 8, y: box.y + 8, width: box.width - 16, height: box.height - 16 };
      const first = await page.screenshot({ clip });
      await page.evaluate(() => document.body.style.background = '#00ff00');
      const second = await page.screenshot({ clip });
      assert.deepEqual(second, first, 'changing the HUD behind the card must not alter its pixels');
    } finally { await browser.close(); }
  });
}
