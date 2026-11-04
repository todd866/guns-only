import assert from "node:assert/strict";
import test from "node:test";

import {
  COBRA_ONBOARDING_CONTENT,
  WEEKEND_RIDE_ONBOARDING_CONTENT,
} from "../controls_content.js";
import {
  bracketizeLegendLine,
  playerFacingContainsEnter,
  renderKeyColumn,
} from "../../input/key_label_ui.js";

class FakeElement {
  constructor(doc, tagName) {
    this.ownerDocument = doc;
    this.tagName = String(tagName).toUpperCase();
    this.parentNode = null;
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.classList = {
      add: (...parts) => {
        for (const part of parts) {
          if (!this.className.split(/\s+/).includes(part)) {
            this.className = this.className ? `${this.className} ${part}` : part;
          }
        }
      },
    };
  }

  append(...children) {
    for (const child of children) {
      if (child?.remove) child.remove();
      if (child) {
        child.parentNode = this;
        this.children.push(child);
      }
    }
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  querySelectorAll(selector) {
    if (selector !== ".keycap") return [];
    const out = [];
    const visit = (node) => {
      if (node.className?.includes?.("keycap") || node.tagName === "KBD") out.push(node);
      for (const child of node.children ?? []) visit(child);
    };
    visit(this);
    return out;
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }
}

class FakeDocument {
  constructor() {
    this.head = new FakeElement(this, "head");
    this.body = new FakeElement(this, "body");
    this.activeElement = this.body;
  }

  createElement(tagName) {
    return new FakeElement(this, tagName);
  }

  createTextNode(value) {
    return {nodeType: 3, textContent: String(value)};
  }
}

test("controls_content desktop rows never say Enter and bracketize strips it", () => {
  for (const content of [COBRA_ONBOARDING_CONTENT, WEEKEND_RIDE_ONBOARDING_CONTENT]) {
    for (const group of content.desktop) {
      for (const [keys, meaning] of group.rows) {
        assert.equal(playerFacingContainsEnter(keys), false, keys);
        assert.equal(playerFacingContainsEnter(meaning), false, meaning);
      }
    }
  }
  assert.doesNotMatch(bracketizeLegendLine("Press Enter to fly"), /\bEnter\b/i);
  assert.match(bracketizeLegendLine("Press Enter to fly"), /\[return\]/i);
});

test("renderKeyColumn draws W / S as two caps", () => {
  const doc = new FakeDocument();
  const cell = doc.createElement("td");
  renderKeyColumn(cell, "W / S", doc);
  const caps = cell.querySelectorAll(".keycap");
  assert.equal(caps.length, 2);
  assert.equal(caps[0].textContent, "W");
  assert.equal(caps[1].textContent, "S");
});
