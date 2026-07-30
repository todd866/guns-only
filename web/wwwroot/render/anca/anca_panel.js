import { deriveAncaView } from "./anca_view_model.js";

/// Stowable ANCA auxiliary panel. Desktop keeps one quiet control; touch flight omits that control
/// until ANCA owns an exclusive attention condition, leaving the bounded tactical rail as the
/// ordinary phone surface. It remains view-only — stowing or opening the panel never changes
/// aircraft or mission state.

export function createAncaPanelPresentation(documentLike, mount = documentLike.body) {
  const root = documentLike.createElement("aside");
  root.setAttribute("data-anca-panel", "");
  root.setAttribute("aria-label", "ANCA four-layer priority cross-check");
  root.hidden = true;
  root.dataset.open = "false";
  root.innerHTML = `
    <style>
      [data-anca-panel][hidden] { display: none; }
      [data-anca-panel] {
        position: fixed;
        z-index: 9;
        right: max(10px, env(safe-area-inset-right));
        top: max(98px, calc(env(safe-area-inset-top) + 84px));
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 7px;
        color: #bfe9e4;
        font: 700 10px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        letter-spacing: .06em;
        text-shadow: 0 1px 4px #000;
        pointer-events: none;
      }
      [data-anca-panel] .anca-toggle {
        pointer-events: auto;
        min-width: 58px;
        height: 26px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        padding: 0 9px;
        border: 1px solid rgba(191, 233, 228, .24);
        border-radius: 6px;
        background: rgba(6, 15, 18, .72);
        color: rgba(191, 233, 228, .72);
        font: inherit;
        letter-spacing: .12em;
        text-shadow: inherit;
        backdrop-filter: blur(3px);
        cursor: pointer;
      }
      [data-anca-panel] .anca-toggle::after {
        content: "+";
        font-size: 12px;
        line-height: 1;
        opacity: .7;
      }
      [data-anca-panel][data-open="true"] .anca-toggle::after { content: "−"; }
      [data-anca-panel][data-tone="attention"] .anca-toggle {
        border-color: rgba(232, 194, 104, .72);
        color: #e8c268;
      }
      [data-anca-panel][data-tone="attention"] .anca-toggle::before {
        content: "";
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: currentColor;
        box-shadow: 0 0 7px currentColor;
      }
      [data-anca-panel] .anca-drawer {
        width: min(340px, calc(100vw - 20px));
        box-sizing: border-box;
        padding: 10px;
        border: 1px solid rgba(191, 233, 228, .22);
        border-radius: 8px;
        background: rgba(6, 15, 18, .86);
        box-shadow: 0 10px 28px rgba(0, 0, 0, .22);
        backdrop-filter: blur(5px);
        pointer-events: none;
      }
      [data-anca-panel] .anca-drawer[hidden] { display: none; }
      [data-anca-panel] .anca-title {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin: 0 0 8px;
        padding: 0 2px 7px;
        border-bottom: 1px solid rgba(191, 233, 228, .14);
      }
      [data-anca-panel] .anca-title strong {
        letter-spacing: .14em;
        color: rgba(191, 233, 228, .9);
      }
      [data-anca-panel] .anca-title span {
        color: rgba(191, 233, 228, .46);
        font-size: 8px;
        letter-spacing: .08em;
      }
      [data-anca-panel] .anca-row {
        display: grid;
        grid-template-columns: 94px minmax(0, 1fr);
        gap: 10px;
        align-items: baseline;
        padding: 6px 4px;
        border-left: 2px solid transparent;
      }
      [data-anca-panel] .anca-row[hidden] { display: none; }
      [data-anca-panel] .anca-empty {
        padding: 8px 4px 6px;
        color: rgba(191, 233, 228, .5);
        font-size: 9px;
        letter-spacing: .08em;
        text-align: center;
      }
      [data-anca-panel] .anca-empty[hidden] { display: none; }
      [data-anca-panel] .anca-label {
        color: rgba(191, 233, 228, .5);
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      [data-anca-panel] .anca-line {
        display: block;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        text-align: right;
        color: rgba(191, 233, 228, .82);
      }
      [data-anca-panel] .anca-row[data-tone="attention"] {
        border-left-color: #e8c268;
      }
      [data-anca-panel] .anca-row[data-tone="attention"] .anca-label,
      [data-anca-panel] .anca-row[data-tone="attention"] .anca-line {
        color: #e8c268;
      }
      [data-anca-panel] .anca-row[data-tone="active"] {
        border-left-color: #6fc3ff;
      }
      [data-anca-panel] .anca-row[data-tone="active"] .anca-label,
      [data-anca-panel] .anca-row[data-tone="active"] .anca-line {
        color: #6fc3ff;
      }
      /* If an ANCA-exclusive attention condition makes the touch control visible, keep it above
         the lower-right stick and away from the tactical rail. */
      @media (orientation: portrait) {
        .touch-mode [data-anca-panel] {
          top: max(116px, calc(env(safe-area-inset-top) + 116px));
          bottom: auto;
        }
      }
      @media (orientation: landscape) {
        .touch-mode [data-anca-panel] {
          top: max(116px, calc(env(safe-area-inset-top) + 116px));
        }
      }
      @media (orientation: landscape) and (max-height: 430px) {
        /* The closed toggle owns the top-right rail. When opened, shift only the wide read-only
           drawer clear of the right look/fire stick instead of letting it cover a flight input. */
        .touch-mode [data-anca-panel] .anca-drawer {
          width: min(320px, calc(100vw - 156px));
          transform: translateX(-124px);
        }
      }
    </style>
    <button class="anca-toggle" data-anca-toggle type="button"
      aria-expanded="false" aria-controls="anca-auxiliary-drawer"
      aria-label="Show ANCA priority cross-check">ANCA</button>
    <div class="anca-drawer" data-anca-drawer id="anca-auxiliary-drawer" hidden>
      <div class="anca-title">
        <strong>ANCA</strong>
        <span>NOW · NEXT · WHO · VERIFY</span>
      </div>
      <div class="anca-empty" data-anca-empty>
        NO CURRENT PRIORITY IN THESE LAYERS
      </div>
      ${[
        ["aviate", "Aviate"],
        ["navigate", "Navigate"],
        ["communicate", "Communicate"],
        ["administrate", "Administrate"],
      ].map(([key, label]) => `
      <div class="anca-row" data-anca-row="${key}" data-tone="quiet">
        <span class="anca-label">${label}</span>
        <output class="anca-line" data-anca-line="${key}">—</output>
      </div>`).join("")}
    </div>
  `;
  const toggle = root.querySelector("[data-anca-toggle]");
  const drawer = root.querySelector("[data-anca-drawer]");
  const empty = root.querySelector("[data-anca-empty]");
  const rows = Object.fromEntries(
    [...root.querySelectorAll("[data-anca-row]")]
      .map((node) => [node.dataset.ancaRow, node]),
  );
  const lines = Object.fromEntries(
    [...root.querySelectorAll("[data-anca-line]")]
      .map((node) => [node.dataset.ancaLine, node]),
  );
  let open = false;
  let currentView = null;
  const syncVisibility = () => {
    const touchMode = documentLike.documentElement?.classList?.contains("touch-mode") === true;
    root.hidden = !currentView?.visible
      || (touchMode && currentView.tone === "quiet" && !open);
  };
  const setOpen = (nextOpen) => {
    open = nextOpen === true;
    root.dataset.open = open ? "true" : "false";
    drawer.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label",
      open ? "Hide ANCA priority cross-check" : "Show ANCA priority cross-check");
    syncVisibility();
  };
  toggle.addEventListener("click", () => setOpen(!open));
  mount.appendChild(root);
  let disposed = false;

  const update = (state) => {
    if (disposed) return;
    const view = deriveAncaView(state);
    currentView = view;
    if (!view.visible) {
      setOpen(false);
      return;
    }
    syncVisibility();
    root.dataset.tone = view.tone;
    empty.hidden = view.shownRows.length > 0;
    for (const rowView of view.rows) {
      const node = rows[rowView.key];
      const line = lines[rowView.key];
      if (!node || !line) continue;
      node.hidden = !rowView.shown;
      node.dataset.tone = rowView.tone;
      if (line.textContent !== rowView.line) line.textContent = rowView.line;
    }
  };

  return Object.freeze({
    element: root,
    update,
    setOpen,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.remove();
    },
  });
}
