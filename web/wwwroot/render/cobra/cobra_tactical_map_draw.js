/**
 * Canvas drawing for the AH-1G conquest map — the minimap (always on, bottom right) and the
 * full-screen map on M are the SAME function at two pixel sizes.
 *
 * One engine: this module draws `cobraTacticalMapModel` output and nothing else. It never
 * decides who owns a point, how far a capture has run, or where a unit is — the sim published
 * all of that and the projection module already put it in pixels. Every number here is a
 * presentation constant (radius, font, stroke width), never a piece of mission truth.
 *
 * North-up, always: the map is a chart, not a repeater of the compass. Only the player marker
 * rotates.
 */

import { cobraConquestScoreLine } from "./cobra_objective_copy.js?v=339";

// Palette is the shell's own legend (cobra-lab/styles.css --friendly / --hostile /
// .landmark-key / --warm), so the map cannot disagree with the legend swatches beside it.
export const COBRA_MAP_COLORS = Object.freeze({
  backing: "rgba(6, 12, 10, 0.72)",
  border: "rgba(180, 210, 160, 0.32)",
  friendly: "#8fbf5a",
  hostile: "#c45a45",
  contested: "#c2b280",
  player: "#d4b56a",
  objective: "rgba(212, 181, 106, 0.85)",
  label: "rgba(232, 230, 223, 0.88)",
  muted: "rgba(154, 163, 146, 0.9)",
  river: "rgba(96, 152, 186, 0.85)",
  objectiveRing: "rgba(240, 214, 138, 0.95)",
  target: "#ffb020",
  airThreat: "#ff465d",
  threatCoverage: "rgba(255, 70, 93, 0.16)",
});

const MINIMAP = Object.freeze({
  siteRadiusPx: 5,
  contestedRingPx: 8.5,
  progressRingPx: 8,
  unitRadiusPx: 1.6,
  playerRadiusPx: 7,
  objectiveLinePx: 34,
  // Points ARE labelled on the minimap now. Unlabelled dots were the other half of "hard to
  // figure out where to go": the caption named a point the chart could not identify.
  labelFont: "600 8px ui-sans-serif, system-ui, sans-serif",
  furnitureFont: "600 8px ui-sans-serif, system-ui, sans-serif",
  furnitureInsetPx: 10,
});

const FULLMAP = Object.freeze({
  siteRadiusPx: 9,
  contestedRingPx: 16,
  progressRingPx: 15,
  unitRadiusPx: 3,
  playerRadiusPx: 11,
  objectiveLinePx: 54,
  labelFont: "600 12px ui-sans-serif, system-ui, sans-serif",
  furnitureFont: "600 11px ui-sans-serif, system-ui, sans-serif",
  furnitureInsetPx: 18,
});

/**
 * Height of the caption band above the chart, per size. The objective line has to reach the
 * player in PLAY, and `body[data-shell="play"] .objective-hud { display: none }` (Build 302:
 * mission cues live on the instrument, not in a prose card) means the DOM strip is lab-only.
 * So the objective rides on the instrument — it is a chart caption, which is what a map legend
 * has always been, rather than a reopening of that ruling.
 */
export const COBRA_MAP_CAPTION_PX = Object.freeze({ mini: 46, full: 44 });

/**
 * Trim to the band width with an ellipsis. Live orders run long — "DESTROY GARRISON · CAU SONG
 * MA · THE JAW" is 40 characters against a 200 px minimap — and an untrimmed caption is simply
 * cut off by the canvas edge mid-word, which reads as a rendering fault rather than a long name.
 * Falls back to the whole string where the context cannot measure (headless doubles).
 */
function fitText(ctx, text, maxWidthPx) {
  if (typeof ctx.measureText !== "function" || !(maxWidthPx > 0)) return text;
  if (ctx.measureText(text).width <= maxWidthPx) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidthPx) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed.trimEnd()}…`;
}

function drawCaption(ctx, caption, { widthPx, headerPx, full, scoreLine = null }) {
  if ((!caption?.line && !(scoreLine && !full)) || !(headerPx > 0)) return;
  ctx.save();
  ctx.fillStyle = COBRA_MAP_COLORS.label;
  ctx.font = full
    ? "600 15px ui-sans-serif, system-ui, sans-serif"
    : "600 10px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  const padPx = full ? 12 : 7;
  const roomPx = widthPx - padPx * 2;
  if (!full) {
    // Three lines on the minimap: the order, the place, then the conquest score. Real orders
    // run to 40 characters
    // ("DESTROY GARRISON · CAU SONG MA · THE JAW") and a single 200 px line ellipsises away
    // exactly the half the player needs — which point to fly to.
    if (caption?.line) {
      const split = caption.line.indexOf(" · ");
      const verb = split > 0 ? caption.line.slice(0, split) : caption.line;
      const place = split > 0 ? caption.line.slice(split + 3) : "";
      ctx.fillText(fitText(ctx, verb, roomPx), padPx, headerPx * 0.2);
      if (place) {
        ctx.fillStyle = COBRA_MAP_COLORS.muted;
        ctx.font = "400 10px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText(fitText(ctx, place, roomPx), padPx, headerPx * 0.49);
      }
    }
    if (scoreLine) {
      ctx.fillStyle = COBRA_MAP_COLORS.label;
      ctx.font = "600 8px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(fitText(ctx, scoreLine, roomPx), padPx, headerPx * 0.8);
    }
  } else {
    ctx.fillText(fitText(ctx, caption.line, roomPx), padPx, headerPx * 0.34);
  }
  if (caption?.detail && full) {
    ctx.fillStyle = COBRA_MAP_COLORS.muted;
    ctx.font = "400 12px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(fitText(ctx, caption.detail, roomPx), padPx, headerPx * 0.72);
  }
  ctx.strokeStyle = COBRA_MAP_COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, headerPx - 0.5);
  ctx.lineTo(widthPx, headerPx - 0.5);
  ctx.stroke();
  ctx.restore();
}

/**
 * The terrain relief and the river, drawn UNDER the markers.
 *
 * This is the difference between a chart and a black box with dots on it. The owner's verdict
 * on the first cut was "really hard to figure out where to go", and the reason is that a map
 * with no land on it cannot be matched against anything visible out of the windscreen — the
 * valley, the ridges and the river are the only references a pilot has. BF:Vietnam's minimap
 * is readable for exactly this reason: terrain first, flags on top.
 */
function drawTerrain(ctx, model, backdrop) {
  if (backdrop) {
    // Baked once per mission; see cobra_tactical_map_relief.js.
    ctx.drawImage(backdrop, 0, 0, model.widthPx, model.heightPx);
  }
  const river = model.river ?? [];
  if (river.length < 2) return;
  ctx.save();
  ctx.strokeStyle = COBRA_MAP_COLORS.river;
  ctx.lineWidth = Math.max(1.5, model.widthPx / 90);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(river[0].x, river[0].y);
  for (let index = 1; index < river.length; index++) ctx.lineTo(river[index].x, river[index].y);
  ctx.stroke();
  ctx.restore();
}

/**
 * A ring and a range readout on the point you are being sent to.
 *
 * Four discs of similar size, one of which happens to be the objective, still makes the player
 * work out WHICH one the caption is naming. BF marks the objective flag distinctly; this does
 * the same, and prints the range so "am I supposed to fly that way" has a number attached.
 */
function drawObjectiveMarker(ctx, model, metrics) {
  const objective = model.objective;
  if (!objective) return;
  const target = (model.sites ?? []).find((site) => site.id === objective.siteId);
  if (!target) return;

  ctx.save();
  ctx.strokeStyle = COBRA_MAP_COLORS.objectiveRing;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(target.x, target.y, metrics.siteRadiusPx + 5, 0, Math.PI * 2);
  ctx.stroke();

  const rangeM = Number(objective.rangeM);
  if (Number.isFinite(rangeM)) {
    ctx.fillStyle = COBRA_MAP_COLORS.objectiveRing;
    ctx.font = metrics.labelFont || "600 9px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const text = rangeM < 1000 ? `${Math.round(rangeM)} m` : `${(rangeM / 1000).toFixed(1)} km`;
    ctx.fillText(text, target.x, target.y - metrics.siteRadiusPx - 8);
  }
  ctx.restore();
}

/** North arrow and a scale bar — a chart without either is a picture. */
function drawChartFurniture(ctx, model, metrics, metresPerPixel) {
  ctx.save();
  ctx.fillStyle = COBRA_MAP_COLORS.muted;
  ctx.font = metrics.furnitureFont;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const inset = metrics.furnitureInsetPx;
  ctx.fillText("N", model.widthPx - inset, inset + 7);
  ctx.beginPath();
  ctx.moveTo(model.widthPx - inset, inset + 1);
  ctx.lineTo(model.widthPx - inset - 3.5, inset - 5);
  ctx.lineTo(model.widthPx - inset + 3.5, inset - 5);
  ctx.closePath();
  ctx.fill();

  if (Number.isFinite(metresPerPixel) && metresPerPixel > 0) {
    // Round the bar to a whole kilometre so the number is readable at a glance.
    const barMetres = metresPerPixel * (model.widthPx * 0.28) > 1500 ? 2000 : 1000;
    const barPx = barMetres / metresPerPixel;
    const y = model.heightPx - inset;
    ctx.strokeStyle = COBRA_MAP_COLORS.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(inset, y);
    ctx.lineTo(inset + barPx, y);
    ctx.moveTo(inset, y - 3);
    ctx.lineTo(inset, y + 3);
    ctx.moveTo(inset + barPx, y - 3);
    ctx.lineTo(inset + barPx, y + 3);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillText(`${barMetres / 1000} km`, inset + barPx + 5, y);
  }
  ctx.restore();
}

function factionColor(faction) {
  return faction === "hostile" ? COBRA_MAP_COLORS.hostile : COBRA_MAP_COLORS.friendly;
}

function drawUnits(ctx, model, metrics) {
  for (const unit of model.units ?? []) {
    ctx.beginPath();
    ctx.arc(unit.x, unit.y, metrics.unitRadiusPx, 0, Math.PI * 2);
    ctx.fillStyle = factionColor(unit.faction);
    ctx.globalAlpha = unit.offMap ? 0.35 : 0.75;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawThreatCoverage(ctx, model, { full, metresPerPixel }) {
  if (!full || !(Number.isFinite(metresPerPixel) && metresPerPixel > 0)) return;
  ctx.save();
  for (const symbol of model.tacticalSymbols ?? []) {
    if (symbol.kind !== "air-threat" || !(symbol.rangeM > 0)) continue;
    ctx.beginPath();
    ctx.arc(symbol.x, symbol.y, symbol.rangeM / metresPerPixel, 0, Math.PI * 2);
    ctx.strokeStyle = COBRA_MAP_COLORS.threatCoverage;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

function drawTacticalSymbols(ctx, model, metrics, { full }) {
  for (const symbol of model.tacticalSymbols ?? []) {
    const radius = full ? 8 : 5.5;
    ctx.save();
    ctx.translate(symbol.x, symbol.y);
    ctx.globalAlpha = symbol.offMap ? 0.45 : 1;
    if (symbol.kind === "air-threat") {
      // Triangle is conventional threat language; it is deliberately unlike the round site
      // ownership marks and the diamond target mark.
      ctx.beginPath();
      ctx.moveTo(0, -radius);
      ctx.lineTo(radius * 0.9, radius * 0.75);
      ctx.lineTo(-radius * 0.9, radius * 0.75);
      ctx.closePath();
      ctx.strokeStyle = COBRA_MAP_COLORS.airThreat;
      ctx.lineWidth = full ? 2 : 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, radius * 0.12, full ? 1.8 : 1.2, 0, Math.PI * 2);
      ctx.fillStyle = COBRA_MAP_COLORS.airThreat;
      ctx.fill();
      ctx.fillStyle = COBRA_MAP_COLORS.airThreat;
      ctx.font = full
        ? "800 10px ui-monospace, monospace"
        : "800 7px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("AA", 0, radius + 2);
    } else {
      ctx.strokeStyle = COBRA_MAP_COLORS.target;
      ctx.lineWidth = full ? 2.5 : 2;
      ctx.beginPath();
      ctx.moveTo(0, -radius);
      ctx.lineTo(radius, 0);
      ctx.lineTo(0, radius);
      ctx.lineTo(-radius, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = COBRA_MAP_COLORS.target;
      ctx.font = full
        ? "800 10px ui-monospace, monospace"
        : "800 7px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("TGT", 0, radius + 3);
    }
    ctx.restore();
  }
}

function drawSites(ctx, model, metrics, { full, nowSeconds }) {
  for (const site of model.sites ?? []) {
    // 2. The disc: who holds the point, in the legend's own two colours.
    ctx.beginPath();
    ctx.arc(site.x, site.y, metrics.siteRadiusPx, 0, Math.PI * 2);
    ctx.fillStyle = factionColor(site.owner);
    ctx.fill();

    if (site.contested) {
      // A contested point pulses so a still frame and a live frame both read as "being fought
      // over" — the ring is the legend's contested colour, never a third ownership colour.
      const pulse = 0.55 + 0.45 * Math.sin(nowSeconds * 4);
      ctx.beginPath();
      ctx.arc(site.x, site.y, metrics.contestedRingPx, 0, Math.PI * 2);
      ctx.strokeStyle = COBRA_MAP_COLORS.contested;
      ctx.lineWidth = full ? 2.5 : 1.5;
      ctx.globalAlpha = pulse;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 3. Capture progress as a clockwise arc from north. Zero progress draws nothing at all:
    // a full-circle-at-zero would read as a completed capture.
    const progress = Number(site.progress);
    if (Number.isFinite(progress) && progress > 0) {
      ctx.beginPath();
      ctx.arc(
        site.x,
        site.y,
        metrics.progressRingPx,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * Math.min(1, progress),
      );
      // The ring belongs to whoever is TAKING the point, which is the side that does not own
      // it: the sim publishes capture_progress as progress toward the non-owner. Painting it
      // friendly unconditionally drew a friendly ring on a friendly point being overrun — the
      // map said you were winning a point you were losing, on the one instrument that exists
      // to tell you otherwise.
      ctx.strokeStyle = site.owner === "friendly"
        ? COBRA_MAP_COLORS.hostile
        : COBRA_MAP_COLORS.friendly;
      ctx.lineWidth = full ? 3 : 2;
      ctx.stroke();
    }

    // The full map names every point. The MINIMAP names only the one you are being sent to:
    // four names at 200 px overran the chart edge and collided with each other, and the
    // question a minimap has to answer is "which of these am I going to", not "what is
    // everything called". The rest are identified by position, colour and the full map.
    const naming = full || site.id === model.objective?.siteId;
    if (site.label && metrics.labelFont && naming) {
      ctx.font = metrics.labelFont;
      ctx.fillStyle = COBRA_MAP_COLORS.label;
      // Points clamped to a map edge would otherwise have their names centred on the edge and
      // sliced in half by the canvas — "RED EARTH QUARRY" lost its last four characters in
      // review. Names near an edge hang inward instead.
      const edgePx = model.widthPx * 0.18;
      ctx.textAlign = site.x > model.widthPx - edgePx
        ? "right"
        : (site.x < edgePx ? "left" : "center");
      ctx.textBaseline = "top";
      // Trim to the chart, so a long name cannot be sliced by the canvas edge.
      ctx.fillText(
        fitText(ctx, String(site.label).toUpperCase(), model.widthPx * 0.62),
        site.x,
        site.y + metrics.siteRadiusPx + 6,
      );
    }
  }
}

function drawPlayer(ctx, model, metrics) {
  const player = model.player;
  if (!player) return;
  const r = metrics.playerRadiusPx;
  ctx.save();
  ctx.translate(player.x, player.y);
  // Canvas rotates clockwise for positive angles and the marker is authored nose-up, so a
  // heading of 0 points north and +pi/2 points east — the chart convention, unrotated map.
  ctx.rotate(player.headingRad ?? 0);
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.62, r * 0.72);
  ctx.lineTo(0, r * 0.34);
  ctx.lineTo(-r * 0.62, r * 0.72);
  ctx.closePath();
  ctx.fillStyle = COBRA_MAP_COLORS.player;
  ctx.fill();
  ctx.strokeStyle = "rgba(10, 14, 10, 0.9)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawObjectiveLine(ctx, model, metrics) {
  const objective = model.objective;
  const player = model.player;
  if (!objective || !player) return;
  const target = (model.sites ?? []).find((site) => site.id === objective.siteId);
  if (!target) return;
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0.001)) return;
  const reach = Math.min(metrics.objectiveLinePx, length);
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(player.x + (dx / length) * reach, player.y + (dy / length) * reach);
  ctx.strokeStyle = COBRA_MAP_COLORS.objective;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawTicketBars(ctx, model) {
  const tickets = model.tickets ?? { friendly: 0, hostile: 0 };
  const friendly = Math.max(0, Number(tickets.friendly) || 0);
  const hostile = Math.max(0, Number(tickets.hostile) || 0);
  // Both pools share one scale so the bars are comparable: the larger pool is full width.
  const scale = Math.max(friendly, hostile, 1);
  const barWidth = Math.min(260, model.widthPx * 0.32);
  const left = 18;
  const rows = [
    { label: "FRIENDLY", value: friendly, color: COBRA_MAP_COLORS.friendly, top: 18 },
    { label: "HOSTILE", value: hostile, color: COBRA_MAP_COLORS.hostile, top: 44 },
  ];
  ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const row of rows) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.fillRect(left, row.top, barWidth, 8);
    ctx.fillStyle = row.color;
    ctx.fillRect(left, row.top, barWidth * (row.value / scale), 8);
    ctx.fillStyle = COBRA_MAP_COLORS.label;
    ctx.fillText(`${row.label} ${Math.round(row.value)}`, left + barWidth + 12, row.top + 4);
  }
}

function drawLegend(ctx, model) {
  const entries = [
    { color: COBRA_MAP_COLORS.friendly, text: "FRIENDLY POINT" },
    { color: COBRA_MAP_COLORS.hostile, text: "HOSTILE POINT" },
    { color: COBRA_MAP_COLORS.contested, text: "CONTESTED" },
    { color: COBRA_MAP_COLORS.player, text: "YOU" },
    { color: COBRA_MAP_COLORS.target, text: "◇ TARGET" },
    { color: COBRA_MAP_COLORS.airThreat, text: "△ AA THREAT / RANGE RING" },
  ];
  // Bottom RIGHT, which is the corner the minimap vacates when the full map opens. Bottom-left
  // is the shell's own "H · CONTROLS" button and the legend was landing on top of it.
  const swatchLeft = model.widthPx - 236;
  let top = model.heightPx - 34 - entries.length * 18;
  ctx.font = "500 11px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const entry of entries) {
    ctx.fillStyle = entry.color;
    ctx.fillRect(swatchLeft, top, 10, 10);
    ctx.fillStyle = COBRA_MAP_COLORS.muted;
    ctx.fillText(entry.text, swatchLeft + 18, top + 5);
    top += 18;
  }
  ctx.fillStyle = COBRA_MAP_COLORS.muted;
  ctx.textAlign = "right";
  ctx.fillText("M CLOSES THE MAP · THE FIGHT CONTINUES", model.widthPx - 18, model.heightPx - 18);
  ctx.textAlign = "left";
}

/**
 * Paints `model` into `ctx`, which must already be sized (and DPR-scaled) to
 * `model.widthPx` x `model.heightPx` CSS pixels.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<import("./cobra_tactical_map.js").cobraTacticalMapModel>} model
 * @param {{ full?: boolean, nowSeconds?: number }} [options]
 */
export function drawCobraTacticalMap(
  ctx,
  model,
  { full = false, nowSeconds = 0, caption = null, headerPx = 0, backdrop = null,
    metresPerPixel = null } = {},
) {
  if (!ctx || !model) return;
  const width = model.widthPx;
  const height = model.heightPx;
  if (!(width > 0) || !(height > 0)) return;
  const metrics = full ? FULLMAP : MINIMAP;
  const scoreLine = full ? null : cobraConquestScoreLine(model);
  const threatCount = (model.tacticalSymbols ?? [])
    .filter((symbol) => symbol.kind === "air-threat").length;
  const targetCount = (model.tacticalSymbols ?? [])
    .filter((symbol) => symbol.kind === "target").length;
  const tacticalLine = model.objective
    ? `◇ ${String(model.objective.label ?? "TARGET").toUpperCase()} · ${targetCount} TGT · △ ${threatCount} AA`
    : scoreLine;
  // The model was built for the CHART box; the caption band sits above it, so the panel is
  // taller than the projection and everything below the band is drawn translated.
  const band = (caption?.line || scoreLine) && headerPx > 0 ? headerPx : 0;

  ctx.save();
  ctx.clearRect(0, 0, width, height + band);
  if (band > 0) {
    ctx.fillStyle = COBRA_MAP_COLORS.backing;
    ctx.fillRect(0, 0, width, band);
    drawCaption(ctx, caption, {
      widthPx: width,
      headerPx: band,
      full,
      scoreLine: full ? scoreLine : tacticalLine,
    });
    ctx.translate(0, band);
  }
  // Everything is clipped to the map box: a site clamped to the edge draws a disc whose rim
  // would otherwise bleed over the combiner, and a stray marker outside the frame reads as a
  // rendering fault rather than an off-map contact.
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();

  // 1. Backing and border, matching the shell's glass chrome.
  ctx.fillStyle = COBRA_MAP_COLORS.backing;
  ctx.fillRect(0, 0, width, height);

  // 2. THE LAND, before any marker. See drawTerrain.
  drawTerrain(ctx, model, backdrop);

  ctx.strokeStyle = COBRA_MAP_COLORS.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  drawThreatCoverage(ctx, model, { full, metresPerPixel });
  drawUnits(ctx, model, metrics);
  drawSites(ctx, model, metrics, { full, nowSeconds });
  drawObjectiveLine(ctx, model, metrics);
  drawObjectiveMarker(ctx, model, metrics);
  drawTacticalSymbols(ctx, model, metrics, { full });
  drawPlayer(ctx, model, metrics);
  drawChartFurniture(ctx, model, metrics, metresPerPixel);
  if (full) {
    drawTicketBars(ctx, model);
    drawLegend(ctx, model);
  }
  ctx.restore();
}
