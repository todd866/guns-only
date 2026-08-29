/**
 * Return only elements that participate in sequential keyboard navigation.
 * Roving radio groups leave their unselected buttons in the DOM with tabindex=-1;
 * matching `button` alone would incorrectly make those buttons dialog boundaries.
 */
export function okanaganDialogFocusables(nodes = []) {
  return Array.from(nodes).filter((node) =>
    node?.disabled !== true && Number(node?.tabIndex) >= 0);
}

/** Return the wrap target for a dialog Tab press, or null for native in-dialog movement. */
export function okanaganDialogTabTarget(nodes, activeElement, shiftKey = false) {
  const focusable = okanaganDialogFocusables(nodes);
  if (focusable.length === 0) return null;
  const first = focusable[0];
  const last = focusable.at(-1);
  const focusOutside = !focusable.includes(activeElement);
  if (shiftKey && (focusOutside || activeElement === first)) return last;
  if (!shiftKey && (focusOutside || activeElement === last)) return first;
  return null;
}
