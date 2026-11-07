import test from 'node:test';
import assert from 'node:assert/strict';
import {padGlyph} from './pad-glyphs.mjs';
import {renderHint, setHintInput} from './key-hints.js';

function node() {
  return {
    children: [],
    className: '',
    textContent: '',
    title: '',
    dataset: {},
    append(...items) {
      this.children.push(...items);
    },
    replaceChildren(...items) {
      this.children = [...items];
    }
  };
}

function doc() {
  return {
    createElement: () => node(),
    createTextNode: text => ({text})
  };
}

test('an 8BitDo Ultimate pad shows X for Skate [E], A for jump, and B for morph', () => {
  assert.equal(padGlyph('E', {kind: 'xbox', form: 'car'}).label, 'X');
  assert.equal(padGlyph('space', {kind: 'xbox', form: 'board'}).label, 'A');
  assert.equal(padGlyph('T', {kind: 'xbox', form: 'car'}).label, 'B');
  assert.equal(padGlyph('F', {kind: 'xbox', form: 'car'}).label, 'X');
  assert.equal(padGlyph('return', {kind: 'xbox', form: 'car'}).label, 'A');
  assert.equal(padGlyph('return', {kind: 'xbox', form: 'fly'}).label, 'B');
  assert.equal(padGlyph('Q', {kind: 'xbox', form: 'robot'}).label, 'X');
  assert.equal(padGlyph('E', {kind: 'xbox', form: 'robot'}).label, 'Y');
});

test('a green SN30 pad prints its own letters for the same buttons', () => {
  assert.equal(padGlyph('E', {kind: 'sn30', form: 'car'}).label, 'Y');
  assert.equal(padGlyph('space', {kind: 'sn30', form: 'car'}).label, 'B');
  assert.equal(padGlyph('esc', {kind: 'sn30'}).label, 'A');
});

test('prompts draw pad glyphs after the last input was the pad, and keyboard caps after a key', () => {
  const banner = node();
  const fake = doc();
  setHintInput({source: 'pad', kind: 'xbox', form: 'car'});
  renderHint(banner, '🛹 Skate [E]', fake);
  const glyph = banner.children.find(child => child.dataset?.pad);
  assert.equal(glyph.textContent, 'X');
  assert.equal(glyph.dataset.pad, 'xbox');
  assert.equal(banner.children.some(child => child.className === 'keyzoom'), false);

  setHintInput({source: 'key'});
  const again = node();
  renderHint(again, '🛹 Skate [E]', fake);
  assert.equal(again.children.some(child => child.dataset?.pad), false);
  assert.equal(again.children.find(child => child.tag === 'kbd' || child.textContent === 'E' || child.className?.includes('keycap'))?.textContent, 'E');
});
