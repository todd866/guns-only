/**
 * First-run controls onboarding, shared across mission shells.
 *
 * One implementation, per-mode content (see controls_content.js): each mission page shows a
 * grouped controls card once on its first launch (per-mode localStorage flag), acknowledged by
 * an explicit "Got it" action, and re-openable forever from a small
 * persistent chip (H, matching the F-22 shell's "H · CONTROLS" idiom). The F-22 shell itself
 * keeps its native ready-screen legend + CONTROL QUICKLOOK — this module deliberately does not
 * fork that; it exists for the mission pages that had only a one-line strip.
 *
 * Contextual nudges ride the same module: small, few, one-shot chips ("HOLD W — COLLECTIVE UP")
 * driven by a pure scheduler the host feeds with sim-derived flags every frame.
 */

const STORAGE_PREFIX = "guns-only.onboarding.";

export function onboardingStorageKey(modeId) {
  return `${STORAGE_PREFIX}${modeId}`;
}

/** True until markFirstRunSeen ran for this mode. Storage failures read as pending. */
export function firstRunPending(storage, modeId) {
  try {
    return storage?.getItem?.(onboardingStorageKey(modeId)) == null;
  } catch {
    return true;
  }
}

/** Record that this mode's lesson was intentionally acknowledged/dismissed. Never throws. */
export function markFirstRunSeen(storage, modeId) {
  try {
    storage?.setItem?.(onboardingStorageKey(modeId), "seen");
  } catch {
    // Overlay simply shows again next launch — better than crashing the boot path.
  }
}

/**
 * The F-22 shell's touch contract (app.js): coarse pointer, or touch-capable small viewport,
 * or the localhost-only ?input=touch QA seam. Pure so content selection is unit-testable.
 */
export function resolveTouchControls({ coarsePointer, touchCapable, smallViewport, touchPreview }) {
  return touchPreview === true
    || coarsePointer === true
    || (touchCapable === true && smallViewport === true);
}

/** Gather the touch environment from a live window, mirroring app.js exactly. */
export function detectTouchEnvironment(win = globalThis) {
  const coarsePointer = win.matchMedia?.("(pointer: coarse)").matches === true;
  const touchCapable = (win.navigator?.maxTouchPoints ?? 0) > 0 || "ontouchstart" in win;
  const smallViewport = Math.min(
    win.screen?.width || win.innerWidth,
    win.screen?.height || win.innerHeight,
  ) <= 900 || Math.min(win.innerWidth, win.innerHeight) <= 600;
  const touchPreview = ["localhost", "127.0.0.1"].includes(win.location?.hostname)
    && new URL(win.location.href).searchParams.get("input") === "touch";
  return resolveTouchControls({ coarsePointer, touchCapable, smallViewport, touchPreview });
}

/** Pick the desktop or touch variant of a mode's content. */
export function selectControlsContent(content, { touch }) {
  return Object.freeze({
    title: content.title,
    groups: touch === true ? content.touch : content.desktop,
  });
}

/**
 * Pure keyboard ownership for the modal controls card. Vehicle keys are blocked—not repurposed as
 * an implicit acknowledgement—so the first control input after onboarding is always deliberate.
 */
export function controlsOnboardingKeyAction({
  open,
  code,
  onDismissAction = false,
  reopenKeyCode = "KeyH",
}) {
  if (code === reopenKeyCode) return "toggle";
  if (open !== true) return "ignore";
  if (code === "Escape") return "dismiss";
  if (code === "Tab") return "trap-focus";
  if (onDismissAction === true && (code === "Enter" || code === "Space")) {
    return "acknowledge";
  }
  return "block";
}

/**
 * Pure one-shot nudge scheduler. Feed it sim-derived boolean flags plus elapsed seconds every
 * frame; it returns the nudge to display (or null). Each nudge fires after its condition has
 * held for afterSeconds, stays while the condition holds, and retires forever once the player
 * acts (condition clears) — non-nagging by construction.
 */
export function createNudgeScheduler(definitions) {
  if (!Array.isArray(definitions)) throw new TypeError("definitions must be an array");
  const slots = definitions.map((definition) => {
    if (typeof definition?.when !== "function") {
      throw new TypeError(`nudge ${definition?.id ?? "?"} needs a when(state) predicate`);
    }
    return {
      definition,
      afterSeconds: Number.isFinite(definition.afterSeconds) ? definition.afterSeconds : 3,
      heldSeconds: 0,
      fired: false,
      retired: false,
    };
  });
  return {
    advance(state, deltaSeconds) {
      const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
      let active = null;
      for (const slot of slots) {
        if (slot.retired) continue;
        const holding = slot.definition.when(state) === true;
        if (slot.fired) {
          if (!holding) { slot.retired = true; continue; }
        } else if (holding) {
          slot.heldSeconds += dt;
          if (slot.heldSeconds >= slot.afterSeconds) slot.fired = true;
        } else {
          slot.heldSeconds = 0;
        }
        if (slot.fired && !active) active = slot.definition;
      }
      return active;
    },
  };
}

const STYLE_ID = "first-run-controls-style";

/* Injected once per document, app.js-style, so mission stylesheets stay untouched and the
   overlay cannot fork per mode. Palette follows the mission HUD card idiom (dark glass,
   hairline border, warm accent). */
const OVERLAY_CSS = `
#controls-onboarding {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: rgba(3, 6, 5, 0.55);
  font-family: ui-sans-serif, system-ui, sans-serif;
}
#controls-onboarding[hidden] { display: none !important; }
.controls-onboarding-card {
  min-width: min(460px, 94vw);
  max-width: min(560px, 94vw);
  max-height: min(82vh, 640px);
  overflow-y: auto;
  padding: 20px 24px 18px;
  border: 1px solid rgba(180, 210, 160, 0.22);
  background: rgba(6, 10, 9, 0.94);
  color: #e8e6df;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.5);
}
.controls-onboarding-card h2 {
  margin: 0 0 14px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: #f2f0e6;
}
.controls-onboarding-group { margin: 0 0 14px; }
.controls-onboarding-group > b {
  display: block;
  margin-bottom: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: #d4b56a;
}
.controls-onboarding-group table { border-collapse: collapse; width: 100%; }
.controls-onboarding-group td {
  padding: 3px 0;
  font-size: 12px;
  vertical-align: baseline;
}
.controls-onboarding-group td:first-child {
  width: 96px;
  padding-right: 14px;
  white-space: nowrap;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 11px;
  font-weight: 700;
  color: #cfe3b8;
}
.controls-onboarding-group td:last-child { color: #9aa392; }
.controls-onboarding-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
}
.controls-onboarding-foot small { color: #9aa392; font-size: 10px; letter-spacing: 0.06em; }
#controls-onboarding-dismiss {
  min-height: 38px;
  padding: 0 20px;
  border: 1px solid rgba(212, 181, 106, 0.45);
  background: rgba(212, 181, 106, 0.12);
  color: #f0e6c8;
  font: inherit;
  font-size: 12px;
  letter-spacing: 0.08em;
  cursor: pointer;
}
#controls-onboarding-reopen {
  position: fixed;
  left: 14px;
  bottom: max(14px, env(safe-area-inset-bottom));
  z-index: 39;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid rgba(180, 210, 160, 0.28);
  background: rgba(6, 10, 9, 0.82);
  color: #cfe3b8;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 10px;
  letter-spacing: 0.1em;
  cursor: pointer;
}
#controls-onboarding-reopen[hidden] { display: none !important; }
#controls-onboarding-nudge {
  position: fixed;
  left: 50%;
  /* Above the bike's bottom-centre RPM card and the Cobra's gun pods alike. */
  bottom: 24%;
  transform: translateX(-50%);
  z-index: 38;
  padding: 8px 16px;
  border: 1px solid rgba(212, 181, 106, 0.5);
  background: rgba(6, 10, 9, 0.88);
  color: #f0e6c8;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 12px;
  letter-spacing: 0.12em;
  white-space: nowrap;
}
#controls-onboarding-nudge[hidden] { display: none !important; }
@media (max-height: 500px) and (orientation: landscape) {
  #controls-onboarding { padding: 8px; }
  .controls-onboarding-card {
    max-height: calc(100dvh - 16px);
    padding: 14px 18px 12px;
  }
  .controls-onboarding-card h2 { margin-bottom: 9px; }
  .controls-onboarding-group { margin-bottom: 9px; }
  .controls-onboarding-foot {
    position: sticky;
    bottom: -12px;
    margin: 8px -18px -12px;
    padding: 9px 18px 12px;
    background: rgba(6, 10, 9, 0.98);
  }
}
`;

function ensureStyles(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = OVERLAY_CSS;
  doc.head.append(style);
}

/**
 * Build the overlay + persistent re-open chip and wire explicit acknowledgement. While open it
 * owns focus and consumes vehicle input. That extra deliberate action is important: dismissing a
 * lesson must never also add collective, throttle, cyclic, steering, or weapons input.
 */
export function createControlsOnboarding({
  modeId,
  content,
  storage = globalThis.localStorage,
  doc = globalThis.document,
  touch = detectTouchEnvironment(),
  reopenKeyCode = "KeyH",
  focusTarget = null,
  nudges = [],
  canOpen = () => true,
}) {
  ensureStyles(doc);
  const variant = selectControlsContent(content, { touch });

  const overlay = doc.createElement("div");
  overlay.id = "controls-onboarding";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-hidden", "true");

  const card = doc.createElement("div");
  card.className = "controls-onboarding-card";
  const heading = doc.createElement("h2");
  heading.id = "controls-onboarding-title";
  heading.textContent = variant.title;
  overlay.setAttribute("aria-labelledby", heading.id);
  card.append(heading);
  for (const group of variant.groups) {
    const section = doc.createElement("div");
    section.className = "controls-onboarding-group";
    const label = doc.createElement("b");
    label.textContent = group.label;
    section.append(label);
    const table = doc.createElement("table");
    for (const [keys, meaning] of group.rows) {
      const row = doc.createElement("tr");
      const keyCell = doc.createElement("td");
      keyCell.textContent = keys;
      const meaningCell = doc.createElement("td");
      meaningCell.textContent = meaning;
      row.append(keyCell, meaningCell);
      table.append(row);
    }
    section.append(table);
    card.append(section);
  }
  const foot = doc.createElement("div");
  foot.className = "controls-onboarding-foot";
  const hint = doc.createElement("small");
  hint.textContent = touch
    ? "Tap Got it to continue"
    : "Enter confirms · Esc closes · H reopens";
  const dismissButton = doc.createElement("button");
  dismissButton.id = "controls-onboarding-dismiss";
  dismissButton.type = "button";
  dismissButton.textContent = "Got it";
  foot.append(hint, dismissButton);
  card.append(foot);
  overlay.append(card);

  const reopenChip = doc.createElement("button");
  reopenChip.id = "controls-onboarding-reopen";
  reopenChip.type = "button";
  reopenChip.textContent = touch ? "? · CONTROLS" : "H · CONTROLS";
  reopenChip.setAttribute("aria-label", "Show controls");

  const nudgeChip = doc.createElement("div");
  nudgeChip.id = "controls-onboarding-nudge";
  nudgeChip.hidden = true;
  nudgeChip.setAttribute("aria-live", "polite");

  doc.body.append(overlay, reopenChip, nudgeChip);

  const scheduler = createNudgeScheduler(nudges);
  let disposed = false;
  let previousFocus = null;
  const backgroundInert = new Map();

  function referenceAvailable() {
    try {
      return typeof canOpen === "function" ? canOpen() !== false : canOpen !== false;
    } catch {
      return false;
    }
  }

  function setBackgroundInert(inert) {
    if (inert) {
      backgroundInert.clear();
      for (const child of doc.body.children) {
        if (child === overlay || child === reopenChip || child === nudgeChip) continue;
        backgroundInert.set(child, child.inert === true);
        child.inert = true;
      }
      return;
    }
    for (const [child, wasInert] of backgroundInert) {
      if (child.isConnected !== false) child.inert = wasInert;
    }
    backgroundInert.clear();
  }

  function isOpen() { return !overlay.hidden; }
  function open() {
    if (isOpen() || !referenceAvailable()) return false;
    previousFocus = doc.activeElement;
    setBackgroundInert(true);
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    reopenChip.hidden = true;
    nudgeChip.hidden = true;
    dismissButton.focus?.({ preventScroll: true });
    return true;
  }
  function dismiss() {
    if (!isOpen()) return;
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    reopenChip.hidden = false;
    setBackgroundInert(false);
    markFirstRunSeen(storage, modeId);
    const explicitFocusTarget = typeof focusTarget === "function" ? focusTarget() : focusTarget;
    const previousFocusUsable = previousFocus && previousFocus !== doc.body
      && previousFocus.isConnected !== false
      && previousFocus.disabled !== true
      && !previousFocus.closest?.("[hidden], [inert]");
    const focusOwner = previousFocusUsable ? previousFocus : explicitFocusTarget ?? reopenChip;
    focusOwner.focus?.({ preventScroll: true });
    previousFocus = null;
  }
  function maybeShowFirstRun() {
    if (!firstRunPending(storage, modeId)) return false;
    // Opening is not acknowledgement. A reload, aborted boot, failed renderer, or pagehide while
    // this card owns the screen must leave the lesson pending for the next successful launch.
    return open();
  }

  function onKeyDown(event) {
    const action = controlsOnboardingKeyAction({
      open: isOpen(),
      code: event.code,
      onDismissAction: event.target === dismissButton,
      reopenKeyCode,
    });
    if (action === "ignore") return;
    // A route-owned dialog gets first refusal. When its lock is active the controls reference must
    // neither open nor steal H from that owner; the persistent chip follows the same open() guard.
    if (action === "toggle" && !isOpen() && !referenceAvailable()) return;
    event.preventDefault();
    event.stopImmediatePropagation?.();
    if (action === "toggle") {
      if (isOpen()) dismiss(); else open();
    } else if (action === "dismiss" || action === "acknowledge") {
      dismiss();
    } else if (action === "trap-focus") {
      dismissButton.focus?.({ preventScroll: true });
    }
  }
  function onOverlayInteraction(event) { event.stopPropagation?.(); }
  function onChipClick(event) {
    event.stopPropagation();
    if (isOpen()) dismiss(); else open();
  }
  function onDismissClick(event) {
    event.stopPropagation();
    dismiss();
  }

  doc.addEventListener("keydown", onKeyDown, true);
  overlay.addEventListener("pointerdown", onOverlayInteraction);
  overlay.addEventListener("click", onOverlayInteraction);
  dismissButton.addEventListener("click", onDismissClick);
  reopenChip.addEventListener("click", onChipClick);

  return {
    open,
    dismiss,
    isOpen,
    maybeShowFirstRun,
    touch,
    /** Host calls once per frame with sim-derived flags; renders/clears the nudge chip. */
    advanceNudges(state, deltaSeconds) {
      if (disposed) return;
      const active = isOpen() || !referenceAvailable()
        ? null : scheduler.advance(state, deltaSeconds);
      if (active) {
        if (nudgeChip.textContent !== active.text) nudgeChip.textContent = active.text;
        nudgeChip.hidden = false;
      } else {
        nudgeChip.hidden = true;
      }
    },
    dispose() {
      disposed = true;
      if (isOpen()) {
        overlay.hidden = true;
        setBackgroundInert(false);
      }
      doc.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
      reopenChip.remove();
      nudgeChip.remove();
    },
  };
}
