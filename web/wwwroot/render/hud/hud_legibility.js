export const HUD_LEGIBLE_UNDERLAY = "rgba(0, 0, 0, 0.78)";
export const HUD_LEGIBLE_STROKE_WIDTH = 2.4;

const ESSENTIAL_GREEN = new Set([
  "#4dff88",
  "#7dffb0",
  "rgba(77, 255, 136, 0.68)",
  "rgba(77, 255, 136, 0.42)",
]);

export function isEssentialHudGreenFill(fillStyle) {
  if (typeof fillStyle !== "string") return false;
  return ESSENTIAL_GREEN.has(fillStyle.trim().toLowerCase());
}

export function captureCanvasTextStyle(ctx) {
  return {
    fillStyle: ctx.fillStyle,
    strokeStyle: ctx.strokeStyle,
    lineWidth: ctx.lineWidth,
    lineJoin: ctx.lineJoin,
    miterLimit: ctx.miterLimit,
    font: ctx.font,
    textAlign: ctx.textAlign,
    textBaseline: ctx.textBaseline,
    globalAlpha: ctx.globalAlpha,
    shadowBlur: ctx.shadowBlur,
    shadowColor: ctx.shadowColor,
  };
}

export function canvasTextStyleMatches(ctx, snapshot) {
  return Object.entries(snapshot).every(([key, value]) => ctx[key] === value);
}

/**
 * Stroke a dark halo then fill green HUD copy. Restores every canvas text style it touches.
 * Geometry and alignment come from the caller's existing font/textAlign/textBaseline.
 */
export function fillLegibleHudText(ctx, text, x, y, {
  fillStyle = ctx.fillStyle,
  maxWidth,
  underlay = HUD_LEGIBLE_UNDERLAY,
  strokeWidth = HUD_LEGIBLE_STROKE_WIDTH,
} = {}) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeStyle = underlay;
  ctx.lineWidth = strokeWidth;
  ctx.fillStyle = fillStyle;
  if (maxWidth === undefined) {
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  } else {
    ctx.strokeText(text, x, y, maxWidth);
    ctx.fillText(text, x, y, maxWidth);
  }
  ctx.restore();
}
