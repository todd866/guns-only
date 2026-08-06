import test from "node:test";
import assert from "node:assert/strict";

import { detectEmbeddedBrowser } from "../inapp_browser.js";
import { bootFallbackModel, mountBootFallback } from "../boot_fallback.js";

const THREADS_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15"
  + " (KHTML, like Gecko) Mobile/15E148 [FBAN/Barcelona;FBAV/342.0.0.30.106;]";
const CHROME_ANDROID_WEBVIEW = "Mozilla/5.0 (Linux; Android 13; SM-T500 Build/TP1A; wv)"
  + " AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.0.0 Safari/537.36";
const CHROME_DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
  + " (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

test("the WebGL failure names the app and offers the way out", () => {
  // Build 263's Android tablet logged a fatal `Error creating WebGL context.` and the player saw
  // an exception string. This is the sentence that replaces it.
  const model = bootFallbackModel({
    reason: "webgl",
    detection: detectEmbeddedBrowser({ userAgent: CHROME_ANDROID_WEBVIEW }),
    url: "https://guns-only.com/",
    detail: "Error creating WebGL context.",
  });
  assert.equal(model.reason, "webgl");
  assert.equal(model.embedded, true);
  assert.match(model.title, /3D graphics/i);
  assert.match(model.body, /WebGL/);
  assert.match(model.body, /Safari or Chrome/);
  assert.equal(model.action.kind, "intent", "Android really can be handed to a real browser");
  assert.equal(model.copyUrl, "https://guns-only.com/");
  assert.equal(model.detail, "Error creating WebGL context.",
    "the technical reason stays on screen as small print, so a report is still possible");
});

test("a stalled boot inside a webview explains itself in the player's terms", () => {
  const model = bootFallbackModel({
    reason: "stalled",
    detection: detectEmbeddedBrowser({ userAgent: THREADS_IOS }),
    url: "https://guns-only.com/",
  });
  assert.match(model.title, /isn’t finishing/i);
  assert.match(model.body, /Threads/, "the app the player is inside must be named");
  assert.ok(model.steps.length >= 2);
  assert.match(model.steps.join(" "), /Open in Safari/);
  assert.equal(model.action.kind, "safari-scheme");
});

test("a desktop failure does not tell the player to leave a browser they already have", () => {
  const model = bootFallbackModel({
    reason: "webgl",
    detection: detectEmbeddedBrowser({ userAgent: CHROME_DESKTOP }),
    url: "https://guns-only.com/",
  });
  assert.equal(model.embedded, false);
  assert.equal(model.action, null);
  assert.deepEqual([...model.steps], []);
  assert.match(model.body, /hardware acceleration|driver/i);
});

test("every reason produces a title, a body and a reload route", () => {
  for (const reason of ["webgl", "stalled", "module", "bridge", "unknown", "nonsense"]) {
    const model = bootFallbackModel({
      reason,
      detection: detectEmbeddedBrowser({ userAgent: THREADS_IOS }),
      url: "https://guns-only.com/",
    });
    assert.ok(model.title.length > 0, `${reason} has no title`);
    assert.ok(model.body.length > 0, `${reason} has no body`);
    assert.equal(model.reloadHref, "https://guns-only.com/");
  }
  assert.equal(bootFallbackModel({ reason: "nonsense", url: "x" }).reason, "unknown");
});

// A tiny stub document: enough shape for the mount to be exercised without a DOM dependency.
function stubDocument() {
  const make = (id) => ({
    id,
    textContent: "",
    hidden: false,
    dataset: {},
    attributes: {},
    children: [],
    classList: { added: new Set(), add(name) { this.added.add(name); } },
    setAttribute(name, value) { this.attributes[name] = value; },
    append(child) { this.children.push(child); },
    querySelector(selector) { return this.nodes?.get(selector) ?? null; },
  });
  const nodes = new Map();
  for (const id of [
    "#shell-fallback-title", "#shell-fallback-body", "#shell-fallback-steps",
    "#shell-fallback-open", "#shell-fallback-url", "#shell-fallback-reload",
    "#shell-fallback-detail",
  ]) nodes.set(id, make(id));
  const root = make("#shell-fallback");
  root.nodes = nodes;
  return {
    createElement: () => make("li"),
    querySelector: (selector) => (selector === "#shell-fallback" ? root : null),
    root,
    nodes,
  };
}

test("mounting fills the markup and reveals the overlay", () => {
  const documentRef = stubDocument();
  const model = bootFallbackModel({
    reason: "stalled",
    detection: detectEmbeddedBrowser({ userAgent: THREADS_IOS }),
    url: "https://guns-only.com/",
  });
  assert.equal(mountBootFallback(documentRef, model), true);
  assert.equal(documentRef.root.classList.added.has("visible"), true);
  assert.equal(documentRef.root.hidden, false);
  assert.equal(documentRef.root.dataset.reason, "stalled");
  assert.equal(documentRef.nodes.get("#shell-fallback-title").textContent, model.title);
  assert.equal(documentRef.nodes.get("#shell-fallback-url").textContent, "https://guns-only.com/");
  assert.equal(documentRef.nodes.get("#shell-fallback-open").hidden, false);
  assert.equal(documentRef.nodes.get("#shell-fallback-steps").children.length, model.steps.length);
  assert.equal(documentRef.nodes.get("#shell-fallback-detail").hidden, true,
    "an empty technical detail must not leave a blank line on the card");
});

test("mounting is a no-op rather than a throw when the markup is absent", () => {
  assert.equal(mountBootFallback({ querySelector: () => null }, { title: "x" }), false);
  assert.equal(mountBootFallback(null, null), false);
});
