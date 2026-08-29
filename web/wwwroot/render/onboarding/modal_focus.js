/** True only for controls that actually occupy the rendered dialog. CSS-hidden hints remain in
 * the DOM for responsive disclosure, but they must never become phantom focus-trap endpoints. */
export function renderedDialogControl(element, style = null) {
  if (!element || element.closest?.("[hidden]") || element.getClientRects?.().length === 0) {
    return false;
  }
  const resolvedStyle = style ?? globalThis.getComputedStyle?.(element);
  return resolvedStyle?.display !== "none" && resolvedStyle?.visibility !== "hidden";
}

/**
 * Resolve only the wrap/recovery edges. Returning null leaves an ordinary interior Tab movement
 * to the browser. An outside active element is recovered because aria-modal must own focus even
 * after a browser or assistive-technology focus repair.
 */
export function dialogTabDestination({
  focusables = [],
  activeElement = null,
  shiftKey = false,
} = {}) {
  if (!Array.isArray(focusables) || focusables.length === 0) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const activeIndex = focusables.indexOf(activeElement);
  if (activeIndex < 0) return shiftKey ? last : first;
  if (shiftKey && activeIndex === 0) return last;
  if (!shiftKey && activeIndex === focusables.length - 1) return first;
  return null;
}
