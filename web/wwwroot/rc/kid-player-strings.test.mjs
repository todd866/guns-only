import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  LOCATIONS,
  nearestUndiscoveredLocation,
  nearestEventRing,
  roamPullTarget,
  loadProgress,
  distance
} from './open-world/catalog.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

function stripTemplates(s) {
  let i = 0;
  while (i < s.length) {
    if (s[i] === '$' && s[i + 1] === '{') {
      let depth = 1,
        j = i + 2;
      while (j < s.length && depth) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') depth--;
        j++;
      }
      s = s.slice(0, i) + ' X ' + s.slice(j);
      i = 0;
    } else i++;
  }
  return s;
}
const stripForCount = text =>
  stripTemplates(String(text))
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\s·\s/g, ' ')
    .replace(/[^\p{L}\p{N}\s!?'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const wordCount = text => (stripForCount(text) ? stripForCount(text).split(' ').length : 0);

function lintPlayerString(label, text) {
  assert.ok(typeof text === 'string' && text.length > 0, `${label}: empty`);
  assert.ok(!/\benter\b/i.test(text), `${label}: forbidden "Enter" in "${text}"`);
  assert.ok(wordCount(text) <= 6, `${label}: ${wordCount(text)} words (max 6): "${text}"`);
}

function readStringLiteral(source, start) {
  const q = source[start];
  if (q !== "'" && q !== '"' && q !== '`') return null;
  let i = start + 1,
    out = '';
  while (i < source.length) {
    if (source[i] === '\\') {
      out += source[i + 1] ?? '';
      i += 2;
      continue;
    }
    if (source[i] === q) return {text: out, end: i + 1};
    out += source[i++];
  }
  return null;
}

function stringsFromCallouts(source, file) {
  const re = /(?:callout|beep)\(\s*/g;
  let m;
  while ((m = re.exec(source))) {
    let i = m.index + m[0].length;
    while (/\s/.test(source[i])) i++;
    const lit = readStringLiteral(source, i);
    if (lit?.text) lintPlayerString(`${file} callout`, lit.text);
  }
}

function catalogPlayerStrings() {
  for (const p of LOCATIONS) {
    lintPlayerString(`catalog ${p.id} name`, p.name);
    lintPlayerString(`catalog ${p.id} short`, p.short);
  }
}

test('catalog location names stay short and never say Enter', () => {
  catalogPlayerStrings();
});

test('race menu locked-card copy stays short and never says Enter', () => {
  const src = fs.readFileSync(path.join(root, 'race-menu.js'), 'utf8');
  for (const text of ['Soon', 'Win 8 races · find 15 badges', 'Drive around base', 'Pick a race']) {
    lintPlayerString('race-menu', text);
  }
  assert.match(src, /Win 8 races · find 15 badges/);
});

test('main.js callout and beep lines stay short and never say Enter', () => {
  stringsFromCallouts(fs.readFileSync(path.join(root, 'main.js'), 'utf8'), 'main.js');
});

test('roam pull picks nearest undiscovered place, else nearest event ring', () => {
  const fresh = loadProgress({getItem: () => null});
  const atGate = LOCATIONS.find(p => p.id === 'gate').pos;
  const und = nearestUndiscoveredLocation(fresh, atGate);
  assert.ok(und);
  assert.ok(!fresh.discovered.includes(und.id));
  const far = [9000, 0, 9000];
  const undFar = nearestUndiscoveredLocation(fresh, far);
  assert.ok(undFar);
  assert.ok(!fresh.discovered.includes(undFar.id));
  const allFound = {
    ...fresh,
    discovered: LOCATIONS.map(p => p.id)
  };
  assert.equal(nearestUndiscoveredLocation(allFound, atGate), null);
  const ring = nearestEventRing(allFound, atGate);
  assert.ok(ring?.id);
  assert.ok(distance(atGate, ring.pos) < distance(atGate, [9000, 0, 9000]));
  assert.equal(roamPullTarget(allFound, atGate).id, ring.id);
});
