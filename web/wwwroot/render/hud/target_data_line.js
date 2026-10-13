/// Which contact's bracket carries the range/closure data line.
///
/// The kernel's range_m and closure_kts follow the player's gun-target selection
/// (selected_player_gun_target_slot), so the line must ride the bracket of the jet those numbers
/// describe — numbers hovering beside a jet they no longer measure taught pilots the wrong range
/// in the 2v1. Slot 0, or an older kernel without the field, keeps the primary. Slot 1 moves the
/// line to the formation wingman's marker. Slots beyond 1 have no dedicated fight-HUD marker yet
/// and stay with the primary rather than vanishing.
export function targetDataLineOwner(state) {
  const slot = Number(state?.selected_player_gun_target_slot);
  return slot === 1 ? "wingman" : "primary";
}

/// Where the selected contact's range/closure line goes. Preference order: right of the bracket,
/// left of it, below it, above it, each only if it fits wholly inside the gutter between the
/// speed and altitude tapes. If nothing fits (a contact hard against a tape), the line is clamped
/// into the gutter below the bracket rather than printed across a tape value box. The contact
/// itself is never covered by the line: below/above clear the bracket.
export function targetDataLinePlacement({
  projection,
  size = 0,
  textWidth = 0,
  textHeight = 14,
  safe = {},
  gutterLeft = -Infinity,
  gutterRight = Infinity,
  avoid = [],
  pad = 4,
} = {}) {
  const px = Number(projection?.x) || 0;
  const py = Number(projection?.y) || 0;
  const half = Number(size) || 0;
  const width = Math.max(0, Number(textWidth) || 0);
  const height = Math.max(0, Number(textHeight) || 0);
  const top = Number.isFinite(safe.top) ? safe.top : -Infinity;
  const bottom = Number.isFinite(safe.bottom) ? safe.bottom : Infinity;
  const left = Math.max(gutterLeft, Number.isFinite(safe.left) ? safe.left : -Infinity);
  const right = Math.min(gutterRight, Number.isFinite(safe.right) ? safe.right : Infinity);
  const clampY = (y) => Math.min(Math.max(y, top), bottom - height);
  const fitsX = (x) => x - pad >= left && x + width + pad <= right;
  const centredX = Math.min(Math.max(px - width / 2, left + pad), right - width - pad);
  // Other instruments the line must not cover (the padlock attitude inset).
  const clear = (x, y) => !(avoid ?? []).some((rect) => rect
    && x - pad < rect.right && x + width + pad > rect.left
    && y < rect.bottom && y + height > rect.top);

  const sideY = clampY(py - height / 2);
  const rightX = px + half + 8;
  if (fitsX(rightX) && clear(rightX, sideY)) return { x: rightX, y: sideY, side: "right" };
  const leftX = px - half - 8 - width;
  if (fitsX(leftX) && clear(leftX, sideY)) return { x: leftX, y: sideY, side: "left" };
  const belowY = py + half + 6;
  if (belowY + height <= bottom && fitsX(centredX) && clear(centredX, belowY)) {
    return { x: centredX, y: belowY, side: "below" };
  }
  const aboveY = py - half - 6 - height;
  if (aboveY >= top && fitsX(centredX) && clear(centredX, aboveY)) {
    return { x: centredX, y: aboveY, side: "above" };
  }
  return {
    x: Math.max(left + pad, centredX),
    y: clampY(belowY),
    side: "clamped",
  };
}
