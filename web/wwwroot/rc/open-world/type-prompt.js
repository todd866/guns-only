// The type box (typed.mjs): one short line asked, a big box to type in, Enter to answer. Enter on
// an empty box and Esc are fine answers too: a kid is never stuck here. Instrument-style: one row,
// the question and the box side by side, above the speed readout.
import {keyCap} from '../key-hints.js';

const CSS =
  'position:fixed;left:50%;bottom:112px;transform:translateX(-50%);z-index:6;display:flex;align-items:center;gap:10px;' +
  'background:#142a30f0;border:1px solid #a2b8b138;border-left:3px solid #edbd6a;border-radius:6px;padding:8px 10px;font:600 16px system-ui;color:#f3efdc;max-width:calc(100vw - 32px)';
const BOX =
  'font:700 20px system-ui;width:min(220px,44vw);background:#06242e;color:#fff;border:2px solid #4fc3ff;border-radius:6px;padding:4px 8px;outline:none';

let open = null;
export const typing = () => !!open;

/** Ask one line. Resolves with what was typed ('' for an empty Enter) or null for Esc. */
export function ask(question, {placeholder = '', max = 16, onOpen = () => {}, onClose = () => {}} = {}) {
  open?.cancel();
  return new Promise(resolve => {
    const bar = document.createElement('div'),
      label = document.createElement('span'),
      input = document.createElement('input'),
      hint = document.createElement('span');
    bar.style.cssText = CSS;
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', question);
    label.textContent = question;
    input.style.cssText = BOX;
    input.maxLength = max;
    input.placeholder = placeholder;
    input.setAttribute('aria-label', question);
    input.autocomplete = 'off';
    input.spellcheck = false;
    hint.replaceChildren(keyCap('return')); // as printed on his MacBook Air, not 'Enter'
    hint.style.cssText = 'font:500 12px system-ui;color:#9bb3b2';
    bar.append(label, input, hint);
    document.body.append(bar);
    const done = value => {
      if (open !== handle) return;
      open = null;
      bar.remove();
      onClose();
      resolve(value);
    };
    const handle = {cancel: () => done(null)};
    open = handle;
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') done(input.value);
      else if (e.key === 'Escape') done(null);
    });
    input.addEventListener('keyup', e => e.stopPropagation());
    onOpen();
    setTimeout(() => input.focus(), 0);
  });
}
