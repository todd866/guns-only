import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// guns-only.com/rc (no trailing slash) is served without a redirect; relative asset URLs then
// resolve to the site root and 404. The page must pin its own base.
test('the RC page pins <base href="/rc/"> so /rc and /rc/ both load', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /<base href="\/rc\/">/);
});
