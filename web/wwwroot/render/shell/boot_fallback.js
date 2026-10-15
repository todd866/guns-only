/**
 * The screen a player gets instead of a blank sky.
 *
 * This module owns the words and the route; index.html owns the markup and the paint. Splitting it
 * that way keeps the copy testable without a DOM.
 */

import { embeddedEscapeRoute } from "./inapp_browser.js";

const FALLBACK_REASONS = Object.freeze(["webgl", "stalled", "module", "bridge", "unknown"]);

/**
 * @param {object} options
 * @param {string} options.reason One of FALLBACK_REASONS.
 * @param {object} options.detection Result of detectEmbeddedBrowser().
 * @param {string} options.url Canonical URL to hand to a real browser.
 * @param {string} [options.detail] Technical detail (an exception message), kept behind the info control.
 */
export function bootFallbackModel({ reason = "unknown", detection = {}, url = "", detail = "" }) {
  const code = FALLBACK_REASONS.includes(reason) ? reason : "unknown";
  const embedded = detection.embedded === true;
  const label = embedded ? (detection.label || "this app's built-in browser") : "this browser";
  const route = embeddedEscapeRoute(url, detection);

  const title = "Couldn't start";
  const body = code === "webgl"
    ? (embedded ? `Graphics are unavailable in ${label}.` : "Graphics are unavailable in this browser.")
    : (embedded ? `Loading stopped in ${label}.` : "Check your connection, then try again.");

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
  const copy = root.querySelector("#shell-fallback-copy");
  if (copy) copy.dataset.copyUrl = model.copyUrl;
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

  const reload = root.querySelector("#shell-fallback-reload");
  if (reload) reload.setAttribute("href", model.reloadHref);
  const detail = root.querySelector("#shell-fallback-detail");
  if (detail) {
    const technicalDetail = [model.detail, model.copyUrl ? `URL: ${model.copyUrl}` : ""]
      .filter(Boolean).join(" · ");
    detail.setAttribute("title", technicalDetail || "Technical details unavailable");
    detail.setAttribute("aria-label", `Technical detail: ${technicalDetail || "unavailable"}`);
    detail.hidden = false;
  }

  root.dataset.reason = model.reason;
  root.classList.add("visible");
  root.hidden = false;
  return true;
}

/** Only a recovered stall may disappear on READY; real load/graphics failures persist. */
export function dismissStalledBootFallback(documentRef, launchControl) {
  const root = documentRef?.querySelector?.("#shell-fallback");
  if (!root || root.hidden || root.dataset.reason !== "stalled") return false;
  root.hidden = true;
  root.classList.remove("visible");
  delete root.dataset.reason;
  launchControl?.focus({ preventScroll: true });
  return true;
}
