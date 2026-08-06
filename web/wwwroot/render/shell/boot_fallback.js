/**
 * The screen a player gets instead of a blank sky.
 *
 * Three routes end here and all three used to end nowhere: WebGL refusing to create a context,
 * a boot that stops advancing, and a module/bridge load that throws. The old `#fatal` card was a
 * phosphor terminal printing a three.js exception string at someone who arrived from a Threads
 * post — technically a screen, practically a dead page.
 *
 * This module owns the WORDS and the ROUTE; index.html owns the markup and the paint. Splitting it
 * that way is what makes the copy testable without a DOM, which matters because the copy is the
 * feature: naming the app the player is inside ("Instagram's built-in browser") is the difference
 * between a shrug and a fixable instruction.
 */

import { embeddedEscapeRoute } from "./inapp_browser.js";

const FALLBACK_REASONS = Object.freeze(["webgl", "stalled", "module", "bridge", "unknown"]);

/**
 * @param {object} options
 * @param {string} options.reason One of FALLBACK_REASONS.
 * @param {object} options.detection Result of detectEmbeddedBrowser().
 * @param {string} options.url Canonical URL to hand to a real browser.
 * @param {string} [options.detail] Technical detail (an exception message), shown as small print.
 */
export function bootFallbackModel({ reason = "unknown", detection = {}, url = "", detail = "" }) {
  const code = FALLBACK_REASONS.includes(reason) ? reason : "unknown";
  const embedded = detection.embedded === true;
  const label = embedded ? (detection.label || "this app's built-in browser") : "this browser";
  const route = embeddedEscapeRoute(url, detection);

  let title;
  let body;
  if (code === "webgl") {
    title = "This browser can’t start 3D graphics";
    body = embedded
      ? `${label} would not give the page a WebGL context, and Guns Only needs one to draw the `
        + "aeroplane. The same link works in Safari or Chrome."
      : "The page could not create a WebGL context. That is usually hardware acceleration being "
        + "switched off, or a graphics driver the browser has blocklisted.";
  } else if (code === "stalled") {
    title = "The flight runtime isn’t finishing its load";
    body = embedded
      ? `${label} limits how much memory and GPU a page may use, and the flight kernel has stopped `
        + "loading here. Opening the same link in a real browser normally starts straight away."
      : "The flight kernel stopped loading. This is usually a dropped connection part-way through "
        + "the download.";
  } else if (code === "module" || code === "bridge") {
    title = "Part of the simulator failed to load";
    body = embedded
      ? `${label} did not finish loading the flight kernel. Opening the link in Safari or Chrome `
        + "avoids the restrictions that stop it."
      : "A required module failed to load. Reloading usually fixes it; if not, the release may be "
        + "mid-deploy.";
  } else {
    title = "Guns Only could not start";
    body = embedded
      ? `${label} stopped the simulator from starting. The same link works in a real browser.`
      : "The simulator stopped before it reached the runway.";
  }

  return Object.freeze({
    reason: code,
    embedded,
    app: embedded ? (detection.app || "unknown") : "none",
    title,
    body,
    steps: embedded ? route.steps : Object.freeze([]),
    action: embedded
      ? Object.freeze({ label: route.actionLabel, href: route.href, kind: route.kind })
      : null,
    copyUrl: route.copyUrl,
    detail: String(detail || "").replace(/\s+/g, " ").trim().slice(0, 240),
    // Reload is always offered: it is the only remedy for a half-deployed release, and it costs
    // a stuck player nothing to try.
    reloadHref: url || ".",
  });
}

/**
 * Paint a model into the #shell-fallback markup and reveal it.
 * Returns true when the overlay was shown.
 */
export function mountBootFallback(documentRef, model) {
  const root = documentRef?.querySelector?.("#shell-fallback");
  if (!root || !model) return false;
  const set = (selector, text) => {
    const node = root.querySelector(selector);
    if (node) node.textContent = text;
  };
  set("#shell-fallback-title", model.title);
  set("#shell-fallback-body", model.body);

  const steps = root.querySelector("#shell-fallback-steps");
  if (steps) {
    steps.textContent = "";
    steps.hidden = model.steps.length === 0;
    for (const step of model.steps) {
      const item = documentRef.createElement("li");
      item.textContent = step;
      steps.append(item);
    }
  }

  const action = root.querySelector("#shell-fallback-open");
  if (action) {
    if (model.action) {
      action.textContent = model.action.label;
      action.setAttribute("href", model.action.href);
      action.hidden = false;
    } else {
      action.hidden = true;
    }
    // Hide the row too, or a desktop card carries the escape button's gap without the button.
    if (action.parentElement) action.parentElement.hidden = !model.action;
  }

  const url = root.querySelector("#shell-fallback-url");
  if (url) url.textContent = model.copyUrl;
  const reload = root.querySelector("#shell-fallback-reload");
  if (reload) reload.setAttribute("href", model.reloadHref);
  const detail = root.querySelector("#shell-fallback-detail");
  if (detail) {
    detail.textContent = model.detail;
    detail.hidden = model.detail.length === 0;
  }

  root.dataset.reason = model.reason;
  root.classList.add("visible");
  root.hidden = false;
  return true;
}
