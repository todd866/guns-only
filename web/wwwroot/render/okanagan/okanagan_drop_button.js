/** A held drop button owns its pointer until release, even outside the button. */
export function bindOkanaganDropButton(element, { canPress, onChange }) {
  let pointerId = null;

  function release(event) {
    if (pointerId === null || (event && event.pointerId !== pointerId)) return;
    const releasedPointer = pointerId;
    pointerId = null;
    onChange(false);
    // Clear ownership before releasing capture: lostpointercapture may fire synchronously.
    try { element.releasePointerCapture(releasedPointer); } catch {}
  }

  function press(event) {
    if (pointerId !== null || !canPress()) return;
    event.preventDefault();
    try { element.setPointerCapture(event.pointerId); } catch { return; }
    pointerId = event.pointerId;
    onChange(true);
  }

  element.addEventListener("pointerdown", press);
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    element.addEventListener(type, release);

  return Object.freeze({
    release: () => release(),
    dispose() {
      release();
      element.removeEventListener("pointerdown", press);
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
        element.removeEventListener(type, release);
    },
  });
}
