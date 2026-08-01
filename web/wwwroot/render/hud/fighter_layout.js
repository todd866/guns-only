function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function inset(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

// One geometry contract keeps the primary flight reference stable while secondary data stays at
// the edge of the combiner.  Drawing code consumes these lanes instead of independently inventing
// y coordinates, which is what allowed heading, warnings and weapon status to collide.
export function fighterHudLayout({
  width,
  height,
  touchMode = false,
  compactMobile = false,
  safeInsets = {},
} = {}) {
  const viewportWidth = Math.max(1, Number(width) || 1);
  const viewportHeight = Math.max(1, Number(height) || 1);
  const safe = {
    top: inset(safeInsets.top),
    right: inset(safeInsets.right),
    bottom: inset(safeInsets.bottom),
    left: inset(safeInsets.left),
  };
  const sideSafe = Math.max(safe.left, safe.right);
  const tapeInset = sideSafe > 0
    ? clamp(Math.max(viewportWidth * 0.055 + sideSafe, sideSafe + 56), 48, 140)
    : clamp(viewportWidth * 0.055, 48, 78);
  // The tape value boxes must sit on the SAME line as the gunsight/waterline, so speed, pipper
  // and altitude read across one row. Measured on an iPhone 13: the boresight-at-level projects to
  // 0.50 * height, but the old touch expression (0.49H - safe.bottom/2) put the boxes at 0.46H --
  // 16 px above the pipper, which is the "don't quite line up" the tapes had. The -safe.bottom/2
  // lift was the culprit; the tapes clear the controls without it (bottom of tape ~0.68H, sticks
  // begin below 0.72H).
  const instrumentCenterY = touchMode
    ? viewportHeight * 0.50
    : viewportHeight * 0.51;
  const tapeHeight = Math.min(
    touchMode ? 278 : 288,
    Math.max(touchMode ? 186 : 204, viewportHeight * (touchMode ? 0.36 : 0.40)),
  );
  const headingY = safe.top + (touchMode ? 42 : viewportHeight < 480 ? 46 : 62);
  const headingAvailableWidth = Math.max(
    120,
    viewportWidth - safe.left - safe.right - 92,
  );
  const headingWidth = Math.min(
    touchMode ? 300 : 360,
    viewportWidth * (touchMode ? 0.68 : 0.34),
    headingAvailableWidth,
  );
  const warningY = headingY + 54;
  const weaponCueY = Math.min(
    instrumentCenterY - 36,
    Math.max(warningY + 76, instrumentCenterY - (touchMode ? 86 : 102)),
  );
  const secondaryBottom = viewportHeight - safe.bottom - (touchMode ? 108 : 18);
  const tapeHalfWidth = 35;
  const targetTop = Math.max(headingY + 78, warningY + 36);

  return {
    tapeInset,
    tapeHeight,
    instrumentCenterY,
    heading: {
      y: headingY,
      width: headingWidth,
      top: headingY - 30,
      bottom: headingY + 36,
    },
    warningY,
    weaponCueY,
    modeCueY: Math.min(
      viewportHeight - safe.bottom - (touchMode ? 156 : 88),
      instrumentCenterY + (touchMode ? 86 : 102),
    ),
    secondaryBottom,
    targetSafe: {
      left: compactMobile ? safe.left + 24 : tapeInset + tapeHalfWidth + 20,
      right: compactMobile
        ? viewportWidth - safe.right - 24
        : viewportWidth - tapeInset - tapeHalfWidth - 20,
      top: targetTop,
      bottom: viewportHeight - safe.bottom - (touchMode ? 138 : 112),
    },
    ladderSafe: {
      left: compactMobile ? safe.left + 22 : tapeInset + tapeHalfWidth + 10,
      right: compactMobile
        ? viewportWidth - safe.right - 22
        : viewportWidth - tapeInset - tapeHalfWidth - 10,
      top: headingY + 72,
      bottom: viewportHeight - safe.bottom - (touchMode ? 128 : 106),
    },
  };
}
