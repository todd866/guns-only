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
});

const MINIMAP = Object.freeze({
  siteRadiusPx: 4.5,
  contestedRingPx: 8,
  progressRingPx: 7.5,
  unitRadiusPx: 1.6,
  playerRadiusPx: 6,
  objectiveLinePx: 22,
  labelFont: "",
});

const FULLMAP = Object.freeze({
  siteRadiusPx: 9,
  contestedRingPx: 16,
  progressRingPx: 15,
  unitRadiusPx: 3,
  playerRadiusPx: 11,
  objectiveLinePx: 54,
  labelFont: "600 12px ui-sans-serif, system-ui, sans-serif",
});

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
      ctx.strokeStyle = COBRA_MAP_COLORS.friendly;
      ctx.lineWidth = full ? 3 : 2;
      ctx.stroke();
    }

    if (full && site.label) {
      ctx.font = metrics.labelFont;
      ctx.fillStyle = COBRA_MAP_COLORS.label;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(String(site.label).toUpperCase(), site.x, site.y + metrics.siteRadiusPx + 6);
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
  ];
  const left = 18;
  let top = model.heightPx - 18 - entries.length * 18;
  ctx.font = "500 11px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const entry of entries) {
    ctx.fillStyle = entry.color;
    ctx.fillRect(left, top, 10, 10);
    ctx.fillStyle = COBRA_MAP_COLORS.muted;
    ctx.fillText(entry.text, left + 18, top + 5);
    top += 18;
  }
  ctx.fillStyle = COBRA_MAP_COLORS.muted;
  ctx.fillText("M CLOSES THE MAP · THE FIGHT CONTINUES", left, model.heightPx - 8);
}

/**
 * Paints `model` into `ctx`, which must already be sized (and DPR-scaled) to
 * `model.widthPx` x `model.heightPx` CSS pixels.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<import("./cobra_tactical_map.js").cobraTacticalMapModel>} model
 * @param {{ full?: boolean, nowSeconds?: number }} [options]
 */
export function drawCobraTacticalMap(ctx, model, { full = false, nowSeconds = 0 } = {}) {
  if (!ctx || !model) return;
  const width = model.widthPx;
  const height = model.heightPx;
  if (!(width > 0) || !(height > 0)) return;
  const metrics = full ? FULLMAP : MINIMAP;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  // Everything is clipped to the map box: a site clamped to the edge draws a disc whose rim
  // would otherwise bleed over the combiner, and a stray marker outside the frame reads as a
  // rendering fault rather than an off-map contact.
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();

  // 1. Backing and border, matching the shell's glass chrome.
  ctx.fillStyle = COBRA_MAP_COLORS.backing;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = COBRA_MAP_COLORS.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  drawUnits(ctx, model, metrics);
  drawSites(ctx, model, metrics, { full, nowSeconds });
  drawObjectiveLine(ctx, model, metrics);
  drawPlayer(ctx, model, metrics);
  if (full) {
    drawTicketBars(ctx, model);
    drawLegend(ctx, model);
  }
  ctx.restore();
}
