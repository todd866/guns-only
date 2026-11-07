import {keyCap as keyboardCap, keyZoom, renderHint as keyboardHint} from '../render/input/key_hints.js';
import {padCap, padGlyph} from './pad-glyphs.mjs';

// Last device the player actually used. Prompts follow it: pad glyphs after a pad,
// MacBook key caps after a key. A connected pad that nobody has touched stays on keys.
let hint = {source: 'key', kind: 'xbox', form: 'car'};

export function setHintInput({source, kind, form} = {}) {
  if (source) hint = {...hint, source};
  if (kind) hint = {...hint, kind};
  if (form) hint = {...hint, form};
}

export function hintInput() {
  return hint;
}

export function keyCap(name, doc = globalThis.document) {
  if (hint.source === 'pad') {
    const glyph = padGlyph(name, hint);
    if (glyph) return padCap(glyph, doc);
  }
  return keyboardCap(name, doc);
}

export {keyZoom};

/**
 * Fill an element with a hint line. [E] is a key cap, or the pad button that does
 * the same thing once the last input came from the pad. No keyboard picture then.
 */
export function renderHint(el, text, doc = globalThis.document) {
  if (hint.source !== 'pad') return keyboardHint(el, text, doc);
  if (el.replaceChildren) el.replaceChildren();
  else el.textContent = '';
  const parts = String(text).split(/\[([^\]]+)\]/);
  parts.forEach((part, i) => {
    if (i % 2) {
      const glyph = padGlyph(part, hint);
      el.append(glyph ? padCap(glyph, doc) : keyboardCap(part, doc));
    } else if (part) el.append(doc.createTextNode(part));
  });
}
