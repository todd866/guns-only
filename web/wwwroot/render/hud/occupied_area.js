// One occupied-area contract between the DOM touch controls and the canvas HUD.
//
// The touch layout publishes the rectangles its visible controls actually occupy (CSS px, viewport
// coordinates). Canvas plates that sit low on the screen ask for the clear bottom above whatever
// control shares their horizontal span instead of assuming a fixed 108 px strip. That fixed strip
// is what let the practice paragraph cover FIRE and the objective plate cover PADLOCK.

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Keep only well-formed, non-empty rectangles as frozen {id,left,top,right,bottom}. */
export function normaliseOccupiedRects(rects) {
  if (!Array.isArray(rects)) return Object.freeze([]);
  const result = [];
  for (const rect of rects) {
    const left = finite(rect?.left);
    const top = finite(rect?.top);
    const right = finite(rect?.right) ?? (left !== null ? left + (finite(rect?.width) ?? 0) : null);
    const bottom = finite(rect?.bottom) ?? (top !== null ? top + (finite(rect?.height) ?? 0) : null);
    if (left === null || top === null || right === null || bottom === null) continue;
    if (right - left < 1 || bottom - top < 1) continue;
    result.push(Object.freeze({ id: String(rect?.id ?? ""), left, top, right, bottom }));
  }
  return Object.freeze(result);
}

export function rectsIntersect(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Lowest y a plate spanning [left, right] may reach without touching a control: the fallback,
 * or `gap` px above the highest control top that overlaps the span horizontally.
 */
export function clearBottomFor(rects, left, right, fallbackBottom, { gap = 6 } = {}) {
  let bottom = finite(fallbackBottom) ?? Infinity;
  const spanLeft = Math.min(finite(left) ?? 0, finite(right) ?? 0);
  const spanRight = Math.max(finite(left) ?? 0, finite(right) ?? 0);
  for (const rect of rects ?? []) {
    if (rect.left >= spanRight || rect.right <= spanLeft) continue;
    bottom = Math.min(bottom, rect.top - gap);
  }
  return bottom;
}

/** Every pair (plate, control) that overlaps; empty means the contract holds. */
export function occupiedAreaCollisions(plates, controls) {
  const collisions = [];
  for (const plate of normaliseOccupiedRects(plates)) {
    for (const control of normaliseOccupiedRects(controls)) {
      if (rectsIntersect(plate, control)) collisions.push({ plate: plate.id, control: control.id });
    }
  }
  return collisions;
}
