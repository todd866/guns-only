import { deriveAncaView } from "./anca_view_model.js";

/// Persistent ANCA spine/panel. Desktop: four full rows, top-right. Portrait/touch: four
/// letter chips on the right edge, kept clear of the touch stick reservation; tapping a chip
/// reveals its row line for 6 s. View-only by doctrine — the only interaction is peeking at
/// a row; the automation runs everything the panel reports.
const EXPAND_MS = 6000;

export function createAncaPanelPresentation(documentLike, mount = documentLike.body) {
  const root = documentLike.createElement("aside");
  root.setAttribute("data-anca-panel", "");
  root.setAttribute("aria-label", "ANCA situational awareness");
  root.innerHTML = `
    <style>
      [data-anca-panel] {
        position: fixed;
        z-index: 9;
        right: max(10px, env(safe-area-inset-right));
        top: 50%;
        transform: translateY(-50%);
        display: flex;
        flex-direction: column;
        gap: 6px;
        color: #bfe9e4;
        font: 700 10px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        letter-spacing: .06em;
        text-shadow: 0 1px 4px #000;
        pointer-events: none;
      }
      [data-anca-panel] .anca-row {
        display: flex;
        align-items: center;
        gap: 7px;
        justify-content: flex-end;
      }
      [data-anca-panel] .anca-chip {
        pointer-events: auto;
        width: 26px;
        height: 26px;
        display: grid;
        place-items: center;
        padding: 0;
        border: 1px solid rgba(191, 233, 228, .3);
        border-radius: 6px;
        background: rgba(6, 15, 18, .82);
        color: inherit;
        font: inherit;
        letter-spacing: inherit;
        backdrop-filter: blur(3px);
        opacity: .55;
      }
      [data-anca-panel] .anca-line {
        display: none;
        max-width: min(46vw, 330px);
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        padding: 5px 8px;
        border: 1px solid rgba(191, 233, 228, .22);
        border-radius: 6px;
        background: rgba(6, 15, 18, .82);
        backdrop-filter: blur(3px);
      }
      [data-anca-panel] .anca-row.expanded .anca-line { display: block; }
      [data-anca-panel] .anca-row[data-tone="steady"] .anca-chip { opacity: .85; }
      [data-anca-panel] .anca-row[data-tone="attention"] .anca-chip {
        opacity: 1; border-color: #e8c268; color: #e8c268;
      }
      [data-anca-panel] .anca-row[data-tone="active"] .anca-chip {
        opacity: 1; border-color: #6fc3ff; color: #6fc3ff;
      }
      /* Desktop: full rows always visible, top-right. */
      html:not(.touch-mode) [data-anca-panel] {
        top: max(98px, calc(env(safe-area-inset-top) + 84px));
        transform: none;
      }
      html:not(.touch-mode) [data-anca-panel] .anca-line { display: block; }
      /* Portrait touch: hold the spine above the movement stick reservation
         (stick is min(36vw, 156px) square plus its safe-area bottom inset) AND the
         radio caption box that rides above the sticks while a call is up — the
         caption is ~120px tall, so the spine clears stick + caption together. */
      @media (orientation: portrait) {
        .touch-mode [data-anca-panel] {
          top: auto;
          transform: none;
          bottom: max(280px, calc(env(safe-area-inset-bottom) + min(36vw, 156px) + 124px));
        }
      }
    </style>
    ${["aviate", "navigate", "communicate", "administrate"].map((key, index) => `
      <div class="anca-row" data-anca-row="${key}" data-tone="quiet">
        <output class="anca-line" data-anca-line="${key}">—</output>
        <button class="anca-chip" data-anca-chip="${key}" type="button"
          aria-label="${key} status">${"ANCA"[index]}</button>
      </div>`).join("")}
  `;
  const rows = Object.fromEntries(
    [...root.querySelectorAll("[data-anca-row]")]
      .map((node) => [node.dataset.ancaRow, node]),
  );
  const lines = Object.fromEntries(
    [...root.querySelectorAll("[data-anca-line]")]
      .map((node) => [node.dataset.ancaLine, node]),
  );
  const expandedUntil = Object.create(null);
  for (const chip of root.querySelectorAll("[data-anca-chip]")) {
    chip.addEventListener("click", () => {
      expandedUntil[chip.dataset.ancaChip] = Date.now() + EXPAND_MS;
    });
  }
  mount.appendChild(root);
  let disposed = false;

  const update = (state) => {
    if (disposed) return;
    const view = deriveAncaView(state);
    root.hidden = !view.visible;
    if (root.hidden) return;
    const now = Date.now();
    for (const rowView of view.rows) {
      const node = rows[rowView.key];
      const line = lines[rowView.key];
      if (!node || !line) continue;
      node.dataset.tone = rowView.tone;
      if (line.textContent !== rowView.line) line.textContent = rowView.line;
      node.classList.toggle("expanded", (expandedUntil[rowView.key] ?? 0) > now);
    }
  };

  return Object.freeze({
    element: root,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.remove();
    },
  });
}
