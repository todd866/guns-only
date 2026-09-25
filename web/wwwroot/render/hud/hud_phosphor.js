// Combiner presentation for the in-flight HUD. Geometry stays with the caller: every helper
// here is a stroke, a plate, or a fade around a point the projective instruments already chose.

const HUD_FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export const PHOSPHOR_PRESETS = {
  green: {
    id: "green",
    core: "#4dff88",
    hot: "#d8ffe6",
    glow: "rgba(77, 255, 136, 0.34)",
    plate: "rgba(2, 14, 10, 0.78)",
  },
  amber: {
    id: "amber",
    core: "#ffc14a",
    hot: "#fff1cc",
    glow: "rgba(255, 193, 74, 0.36)",
    plate: "rgba(16, 10, 2, 0.78)",
  },
  white: {
    id: "white",
    core: "#e7fff1",
    hot: "#ffffff",
    glow: "rgba(231, 255, 241, 0.28)",
    plate: "rgba(4, 8, 10, 0.82)",
  },
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function hudMetricScale(width, height) {
  const shortSide = Math.min(finite(width, 1280), finite(height, 720));
  return clamp(shortSide / 720, 0.82, 1.55);
}

export function hudFont(sizePx, { weight = 700, scale = 1 } = {}) {
  const size = Math.max(7, Math.round(finite(sizePx, 10) * finite(scale, 1) * 10) / 10);
  return `${weight} ${size}px ${HUD_FONT}`;
}

export function resolveHudPhosphor({
  preset = "green",
  highContrast = false,
  reducedMotion = false,
  width = 1280,
  height = 720,
} = {}) {
  const palette = PHOSPHOR_PRESETS[preset] ?? PHOSPHOR_PRESETS.green;
  return {
    palette,
    highContrast: highContrast === true,
    reducedMotion: reducedMotion === true,
    scale: hudMetricScale(width, height),
    glowAlpha: highContrast ? 0 : palette.id === "white" ? 0.22 : 0.34,
  };
}

export function readHudPhosphorOptions(root, { width = 1280, height = 720 } = {}) {
  const dataset = root?.dataset ?? {};
  const className = typeof root?.className === "string" ? root.className : "";
  const preset = String(dataset.hudPhosphor || "green").toLowerCase();
  return resolveHudPhosphor({
    preset,
    highContrast: className.includes("high-contrast"),
    reducedMotion: className.includes("forced-reduced-motion"),
    width,
    height,
  });
}

// Smooth 0..1 envelope. Reduced motion holds the peak so a warning never flickers.
export function easedPresence(ageSeconds, { attack = 0.12, hold = 0.18, release = 0.45, reducedMotion = false } = {}) {
  const age = finite(ageSeconds, 0);
  if (reducedMotion) return age < 0 ? 0 : 1;
  if (age < 0) return 0;
  if (age < attack) return clamp(age / Math.max(attack, 0.001), 0, 1);
  if (age < attack + hold) return 1;
  const fade = (age - attack - hold) / Math.max(release, 0.001);
  return clamp(1 - fade * fade, 0, 1);
}

export function annunciatorChrome(level) {
  switch (level) {
    case "critical":
      return { fill: "rgba(42, 6, 12, 0.82)", stroke: "#ff465d", label: "#ff465d", weight: 800 };
    case "caution":
      return { fill: "rgba(28, 16, 2, 0.78)", stroke: "#ffb020", label: "#ffb020", weight: 800 };
    case "confirm":
      return { fill: "rgba(2, 18, 10, 0.8)", stroke: "#4dff88", label: "#d8ffe6", weight: 800 };
    default:
      return { fill: "rgba(2, 10, 16, 0.62)", stroke: "rgba(77, 255, 136, 0.45)", label: "#4dff88", weight: 700 };
  }
}

// Lead-computing reticle in local space. The origin is the projected pipper; nothing here
// shifts that point. In range closes the inner arc and thickens the cardinal ticks.
export function leadPipperSpec({ inRange = false, hit = false, wasted = false, scale = 1 } = {}) {
  const s = finite(scale, 1);
  const radius = 17 * s;
  const tickInner = 13 * s;
  const tickOuter = (inRange ? 27 : 24) * s;
  const dot = (hit ? 2.6 : 2) * s;
  let stroke = "#ffb020";
  if (hit || inRange) stroke = "#4dff88";
  else if (wasted) stroke = "#ff465d";
  return {
    radius,
    tickInner,
    tickOuter,
    dot,
    stroke,
    lineWidth: (inRange || hit ? 2.05 : 1.5) * s,
    arc: inRange || hit ? Math.PI * 2 : Math.PI * 1.35,
    inRange: inRange === true,
    hit: hit === true,
  };
}

export function traceLeadPipper(ctx, spec) {
  ctx.beginPath();
  ctx.arc(0, 0, spec.radius, -Math.PI / 2, -Math.PI / 2 + spec.arc);
  ctx.moveTo(-spec.tickOuter, 0);
  ctx.lineTo(-spec.tickInner, 0);
  ctx.moveTo(spec.tickInner, 0);
  ctx.lineTo(spec.tickOuter, 0);
  ctx.moveTo(0, -spec.tickOuter);
  ctx.lineTo(0, -spec.tickInner);
  ctx.moveTo(0, spec.tickInner);
  ctx.lineTo(0, spec.tickOuter);
}

// Corner brackets for a target designator. Centre stays on the projected contact.
export function traceCornerBrackets(ctx, size, corner, inset = 0) {
  const s = size - inset;
  const c = Math.min(corner, s);
  ctx.moveTo(-s, -s + c);
  ctx.lineTo(-s, -s);
  ctx.lineTo(-s + c, -s);
  ctx.moveTo(s - c, -s);
  ctx.lineTo(s, -s);
  ctx.lineTo(s, -s + c);
  ctx.moveTo(s, s - c);
  ctx.lineTo(s, s);
  ctx.lineTo(s - c, s);
  ctx.moveTo(-s + c, s);
  ctx.lineTo(-s, s);
  ctx.lineTo(-s, s - c);
}

// Off-screen caret. Tip is +x in local space; the caller rotates it onto the bearing.
export function traceOffscreenArrow(ctx, { scale = 1 } = {}) {
  const s = finite(scale, 1);
  ctx.moveTo(12 * s, 0);
  ctx.lineTo(-8 * s, -8 * s);
  ctx.lineTo(-3 * s, 0);
  ctx.lineTo(-8 * s, 8 * s);
  ctx.closePath();
}

// Small impact ticks that bloom out of a projected point and die. Positions are offsets.
export function hitMarkerOffsets(ageSeconds, count, { reducedMotion = false } = {}) {
  const n = clamp(Math.floor(finite(count, 1)), 1, 6);
  const age = Math.max(0, finite(ageSeconds, 0));
  const travel = reducedMotion ? 10 : 10 + 22 * (1 - Math.exp(-age * 7));
  const alpha = reducedMotion ? (age < 0.34 ? 1 : 0) : clamp(1 - age / 0.34, 0, 1);
  const offsets = [];
  for (let i = 0; i < n; i += 1) {
    const angle = (-Math.PI / 2) + (i / n) * Math.PI * 2;
    offsets.push({
      x: Math.cos(angle) * travel,
      y: Math.sin(angle) * travel,
      alpha,
      size: 4 + (reducedMotion ? 0 : age * 6),
    });
  }
  return offsets;
}

export function traceHitMarker(ctx, size) {
  const s = finite(size, 4);
  ctx.moveTo(-s, -s);
  ctx.lineTo(s, s);
  ctx.moveTo(s, -s);
  ctx.lineTo(-s, s);
}

// Kill confirmation. Alpha eases out; the banner itself stays where the caller puts it.
export function killFlashPresentation(ageSeconds, { reducedMotion = false } = {}) {
  const age = Math.max(0, finite(ageSeconds, 0));
  if (reducedMotion) {
    return { alpha: age < 0.45 ? 0.22 : 0, ring: 0.4 };
  }
  const alpha = 0.28 * Math.exp(-age * 2.4);
  return { alpha, ring: clamp(age / 0.55, 0, 1) };
}

// Bank index drawn in the ladder's centre hole. Ticks rotate with bank; the caret is screen-up.
export function bankIndexTicks(bankRad) {
  const marks = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60];
  return marks.map((deg) => ({
    deg,
    major: deg % 30 === 0,
    rad: bankRad + deg * Math.PI / 180,
  }));
}

export function strokePhosphorPass(ctx, { glow, lineWidthBoost = 2.1, alpha = 0.28 } = {}) {
  if (!glow || alpha <= 0) return;
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = glow;
  ctx.lineWidth += lineWidthBoost;
  ctx.setLineDash([]);
  ctx.stroke();
  ctx.restore();
}

export function traceAnnunciatorPlate(ctx, x, y, width, height) {
  const r = 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.lineTo(x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.lineTo(x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.lineTo(x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.closePath();
}
