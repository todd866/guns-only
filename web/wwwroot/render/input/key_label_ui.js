import {keyCap, renderHint} from "./key_hints.js";

const ARROW_GLYPH = Object.freeze({
  "↑": "up",
  "↓": "down",
  "←": "left",
  "→": "right",
});

const NON_KEY_LABELS = new Set([
  "BREAK", "COVER", "HOLD", "RECOVER", "KEYBOARD", "GAMEPAD", "LB", "RB", "MAP",
]);

/** KeyboardEvent.code or binding label → keyCap hint token. */
export function codeToKeyHint(code) {
  const labels = {
    ArrowDown: "down",
    ArrowUp: "up",
    ArrowLeft: "left",
    ArrowRight: "right",
    Space: "space",
    Escape: "esc",
    Tab: "tab",
    ShiftLeft: "shift",
    ShiftRight: "shift",
    Enter: "return",
    NumpadEnter: "return",
    Backquote: "`",
    BracketLeft: "[",
    BracketRight: "]",
    Comma: ",",
    Period: ".",
    Slash: "/",
  };
  if (labels[code]) return labels[code];
  if (/^Key([A-Z])$/.test(code)) return code.slice(3);
  if (/^Digit([0-9])$/.test(code)) return code.slice(5);
  if (/^F([0-9]+)$/.test(code)) return code;
  return code.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** controlCodeLabel() glyphs → keyCap hint token. */
export function glyphToKeyHint(glyph) {
  const g = String(glyph ?? "").trim();
  if (ARROW_GLYPH[g]) return ARROW_GLYPH[g];
  const lower = g.toLowerCase();
  if (lower === "space") return "space";
  if (lower === "esc" || lower === "escape") return "esc";
  if (lower === "tab") return "tab";
  if (lower === "shift") return "shift";
  if (lower === "return" || lower === "enter") return "return";
  if (/^f\d+$/i.test(g)) return g.toUpperCase();
  if (g.length === 1) return g;
  return g;
}

export function playerFacingContainsEnter(text) {
  return /\bEnter\b/i.test(String(text ?? ""));
}

export function bracketizeLegendLine(line) {
  let out = String(line ?? "");
  out = out.replace(/\bArrows\b/gi, "[left][up][down][right]");
  out = out.replace(/\bESC\b/g, "[esc]");
  out = out.replace(/\bEsc\b/g, "[esc]");
  out = out.replace(/\bEnter\b/gi, "[return]");
  out = out.replace(/\bTab\b/g, "[tab]");
  out = out.replace(/\bShift\b/g, "[shift]");
  out = out.replace(/\bSpace\b/g, "[space]");
  out = out.replace(/\b(F\d+)\b/g, "[$1]");
  out = out.replace(/\b([A-Z])\/([A-Z])\b/g, "[$1] / [$2]");
  out = out.replace(/(^|[ ··])([A-Z])(?=($|[ ·]))/g, "$1[$2]");
  out = out.replace(/[↑↓←→]/g, (g) => `[${ARROW_GLYPH[g]}]`);
  return out;
}

function appendSlash(parent, doc) {
  const sep = doc.createElement("span");
  sep.className = "key-sep";
  sep.setAttribute?.("aria-hidden", "true");
  sep.textContent = "/";
  parent.append(sep);
}

function replaceChildren(el, ...nodes) {
  if (typeof el.replaceChildren === "function") {
    el.replaceChildren(...nodes);
    return;
  }
  el.textContent = "";
  for (const node of nodes) if (node) el.append(node);
}

function appendKeyToken(parent, token, doc) {
  const t = String(token ?? "").trim();
  if (!t) return;
  if (ARROW_GLYPH[t]) {
    parent.append(keyCap(ARROW_GLYPH[t], doc));
    return;
  }
  const lower = t.toLowerCase();
  if (lower === "esc" || lower === "escape") {
    parent.append(keyCap("esc", doc));
    return;
  }
  if (lower === "shift" || lower === "tab" || lower === "space" || lower === "return" || lower === "enter") {
    parent.append(keyCap(lower === "enter" ? "return" : lower, doc));
    return;
  }
  if (/^hold$/i.test(t)) {
    parent.append(doc.createTextNode("hold "));
    return;
  }
  if (/^f\d+$/i.test(t) || (t.length === 1 && !NON_KEY_LABELS.has(t.toUpperCase()))) {
    parent.append(keyCap(t, doc));
    return;
  }
  if (NON_KEY_LABELS.has(t.toUpperCase())) {
    parent.append(doc.createTextNode(t));
    return;
  }
  parent.append(doc.createTextNode(t));
}

function renderKeyTokens(parent, text, doc) {
  for (const token of String(text).split(/\s+/).filter(Boolean)) {
    appendKeyToken(parent, token, doc);
  }
}

/** Onboarding / settings key column: "W / S", "↑ ↓ ← →", "Esc", "Tab / LB". */
export function renderKeyColumn(el, spec, doc = document) {
  replaceChildren(el);
  if (el.classList?.add) el.classList.add("key-column");
  else el.className = `${el.className} key-column`.trim();
  const upper = String(spec ?? "").trim();
  if (!upper || NON_KEY_LABELS.has(upper.toUpperCase()) && !/[\/↑↓←→]/.test(upper)) {
    el.textContent = upper;
    return;
  }
  const slashParts = upper.split(/\s*\/\s*/);
  slashParts.forEach((part, index) => {
    if (index) appendSlash(el, doc);
    const dotParts = part.split(/\s·\s/);
    dotParts.forEach((dotPart, dotIndex) => {
      if (dotIndex) el.append(doc.createTextNode(" · "));
      const hold = dotPart.match(/^hold\s+(.+)$/i);
      if (hold) {
        el.append(doc.createTextNode("hold "));
        renderKeyTokens(el, hold[1], doc);
        return;
      }
      renderKeyTokens(el, dotPart, doc);
    });
  });
}

export function renderControlLegend(el, text, doc = document) {
  replaceChildren(el);
  const raw = String(text ?? "");
  if (!raw) return;
  raw.split("\n").forEach((line, lineIndex) => {
    if (lineIndex) el.append(doc.createElement("br"));
    const row = doc.createElement("span");
    row.className = "key-legend-line";
    renderHint(row, bracketizeLegendLine(line), doc);
    el.append(row);
  });
}

/** ready-hint and similar one-liners; falls back to plain text when no key is named. */
export function renderPlayerKeyHint(el, text, {touch = false, doc = document} = {}) {
  replaceChildren(el);
  const raw = String(text ?? "").trim();
  if (!raw) return;
  if (touch || /^(Tap|Return to|Updating|Verifying|Older|Practice results)/i.test(raw)) {
    el.textContent = raw.replace(/\bEnter\b/gi, "Return");
    return;
  }
  let hint = raw
    .replace(/^Press Enter to /i, "[return] ")
    .replace(/^Press Enter when /i, "[return] when ")
    .replace(/^Press Enter to explore/i, "[return] to explore");
  if (hint === raw) {
    el.textContent = raw.replace(/\bEnter\b/gi, "Return");
    return;
  }
  renderHint(el, hint, doc);
  el.setAttribute("aria-label", raw.replace(/\bEnter\b/gi, "Return"));
}

export function renderKeyHintRow(el, template, doc = document) {
  replaceChildren(el);
  if (el.classList?.add) el.classList.add("key-hint-row");
  else el.className = `${el.className} key-hint-row`.trim();
  renderHint(el, template, doc);
}

export function appendBindingKey(parent, code, doc = document) {
  parent.append(keyCap(codeToKeyHint(code), doc));
}
