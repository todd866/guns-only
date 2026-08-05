import { gunnerStatusText } from "./cobra_gunner_status.js";
import { fighterHudLayout } from "../hud/fighter_layout.js";

const MPS_TO_KT = 3600 / 1852;
const MPS_TO_FPM = 196.850394;

/** Ah1gCobraDefinition.MainRotor.NominalRpm — the 100% NR reference. */
export const AH1G_NOMINAL_ROTOR_RPM = 324;

// Same combiner language as hud.js (which keeps these module-private).
const GREEN = "#4dff88";
const GREEN_DIM = "rgba(77, 255, 136, 0.68)";
const AMBER = "#ffb020";
const RED = "#ff465d";
const GLASS = "rgba(2, 10, 16, 0.72)";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function finiteOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function regimeToken(regime) {
  const raw = String(regime ?? "normal").toLowerCase();
  switch (raw) {
    case "effectivetranslationallift":
    case "effective_translational_lift":
      return "ETL";
    case "vortexringstate":
    case "vortex_ring_state":
      return "VRS";
    case "retreatingbladestall":
    case "retreating_blade_stall":
      return "RBS";
    case "surfacecontact":
    case "surface_contact":
      return "SKID";
    case "rotorstrike":
    case "rotor_strike":
      return "STRIKE";
    case "autorotation":
      return "AUTO";
    default:
      return "NRM";
  }
}

/**
 * Compact AH-1G flight strip for Hold the Bridge. Uses authoritative rotorcraft telemetry only;
 * never invents Nr, torque, or regime from camera height.
 */
export function formatCobraRotorcraftStrip(vehicle, routeGuidance = null) {
  const rotor = vehicle?.rotorcraft ?? {};
  const nr = finite(rotor.main_rotor_rpm);
  const torqueNm = finite(rotor.transmission_torque_nm);
  const collectiveDeg = finite(rotor.collective_root_pitch_rad) * (180 / Math.PI);
  const tasKt = finite(vehicle?.true_airspeed_mps) * MPS_TO_KT;
  const gsKt = finite(vehicle?.ground_speed_mps) * MPS_TO_KT;
  const vsiFpm = finite(vehicle?.vertical_speed_mps) * 196.8504;
  const aglM = routeGuidance?.current_clearance_m ?? rotor.main_rotor_clearance_m;
  const aglText = Number.isFinite(Number(aglM)) && Number(aglM) >= 0
    ? `${Math.round(Number(aglM))}M`
    : "—";
  const warn = [];
  if (rotor.governor_saturated) warn.push("GOV");
  if (finite(rotor.vortex_ring_severity) >= 0.20) warn.push("VRS");
  if (finite(rotor.retreating_blade_stall_severity) >= 0.20) warn.push("RBS");
  if (finite(rotor.mast_bump_risk) >= 0.35) warn.push("MAST");
  const primary = [
    `NR${Math.round(nr)}`,
    `Q${Math.round(torqueNm / 1000)}K`,
    `COL${collectiveDeg.toFixed(1)}°`,
    `TAS${Math.round(tasKt)}`,
    `GS${Math.round(gsKt)}`,
    `AGL${aglText}`,
    `VSI${vsiFpm >= 0 ? "+" : ""}${Math.round(vsiFpm)}`,
    regimeToken(rotor.regime),
  ].join("·");
  return warn.length > 0 ? `${primary} · ${warn.join("·")}` : primary;
}

const LEVEL_RANK = { warning: 0, caution: 1, normal: 2 };

/**
 * Rotorcraft extras model for the production F-22 HUD (Build 264 owner ruling:
 * "standard F-22 HUD plus extras to make it legible as an attack helicopter").
 * Pure presentation truth from the authority snapshot: NR%/TQ% against authoritative
 * limits, hover-graded VSI/AGL, ranked rotor-state annunciations, and the gunner
 * crew line. Never invents Nr, torque, severity, or gunner state.
 */
export function cobraRotorcraftHudModel(authorityState) {
  const vehicle = authorityState?.vehicle;
  const rotor = vehicle?.rotorcraft;
  if (!vehicle || !rotor) return null;

  const nrPct = finite(rotor.main_rotor_rpm) / AH1G_NOMINAL_ROTOR_RPM * 100;
  const nrLevel = nrPct < 90 || nrPct > 107 ? "warning"
    : nrPct < 97 || nrPct > 103 ? "caution" : "normal";
  const torquePct = finite(rotor.transmission_limit_fraction) * 100;
  const torqueLevel = torquePct > 100 ? "warning"
    : torquePct >= 85 ? "caution" : "normal";

  const gsKt = finite(vehicle.ground_speed_mps) * MPS_TO_KT;
  const vsiFpm = finite(vehicle.vertical_speed_mps) * MPS_TO_FPM;
  const aglM = finiteOrNull(authorityState?.route_guidance?.current_clearance_m)
    ?? finiteOrNull(rotor.main_rotor_clearance_m);
  const vrs = finite(rotor.vortex_ring_severity);
  const rbs = finite(rotor.retreating_blade_stall_severity);
  const mast = finite(rotor.mast_bump_risk);
  const nearGround = aglM !== null && aglM >= 0;
  const hoverEmphasis = gsKt < 12;
  const sinkLevel = vrs >= 0.35 || (nearGround && aglM < 30 && vsiFpm < -700) ? "warning"
    : vrs >= 0.2 || (nearGround && aglM < 60 && vsiFpm < -500) ? "caution" : "normal";

  const warnings = [];
  if (nrPct < 90) warnings.push({ text: "LOW ROTOR", level: "warning" });
  if (vrs >= 0.35) warnings.push({ text: "VORTEX RING", level: "warning" });
  else if (vrs >= 0.2) warnings.push({ text: "SETTLING WITH POWER", level: "caution" });
  if (mast >= 0.35) warnings.push({ text: "MAST BUMP", level: "warning" });
  if (rbs >= 0.6) warnings.push({ text: "BLADE STALL", level: "warning" });
  else if (rbs >= 0.35) warnings.push({ text: "BLADE STALL", level: "caution" });
  if (torquePct > 100) warnings.push({ text: "TORQUE LIMIT", level: "caution" });
  else if (rotor.governor_saturated === true) warnings.push({ text: "GOV LIMIT", level: "caution" });
  warnings.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
  warnings.length = Math.min(warnings.length, 2);

  const gunner = authorityState?.gunner ?? null;
  const war = authorityState?.ground_war ?? null;
  const line = gunnerStatusText(gunner, war);
  const gunnerLevel = war?.ammo_dry === true ? "warning"
    : gunner?.fire_authorized === true ? "firing"
      : gunner?.state === "tracking" ? "ready"
        : gunner?.state === "masked" || gunner?.state === "outoflimits"
          || gunner?.state === "inhibited" ? "caution" : "normal";
  const detailParts = [];
  const targetId = gunner?.selected_target_id;
  if (targetId) detailParts.push(`TGT ${String(targetId).split(".").pop()}`);
  if (war) {
    detailParts.push(war.ammo_dry === true
      ? "AMMO DRY"
      : `AMMO ${Math.max(0, Math.floor(finite(war.ammo_remaining)))}`);
    detailParts.push(war.over_fob === true
      ? "FOB PAD · REARM"
      : `FOB ${(finite(war.fob_range_m) / 1000).toFixed(1)} KM`);
  }

  return {
    rotor: {
      nrPct,
      nrLevel,
      torquePct,
      torqueLevel,
      regime: regimeToken(rotor.regime),
      governorSaturated: rotor.governor_saturated === true,
    },
    hover: { gsKt, vsiFpm, aglM, hoverEmphasis, sinkLevel },
    warnings,
    gunner: { line, level: gunnerLevel, detail: detailParts.join(" · ") },
  };
}

function levelColor(level, normalColor = GREEN) {
  return level === "warning" || level === "firing" ? (level === "firing" ? AMBER : RED)
    : level === "caution" ? AMBER
      : level === "ready" ? GREEN : normalColor;
}

function panel(ctx, x, y, width, height, border) {
  const r = Math.min(5, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = GLASS;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * Paint the rotorcraft extras onto the SAME combiner canvas hud.js just committed,
 * in the same layout lanes (fighterHudLayout) and visual language. Draw order in
 * the render loop is hud.draw(frame) then this, every frame.
 */
export function drawCobraRotorcraftHud(ctx, model, {
  width,
  height,
  pixelRatio = 1,
  safeInsets = null,
} = {}) {
  if (!model || !ctx) return;
  const layout = fighterHudLayout({ width, height, safeInsets: safeInsets ?? {} });
  const centerY = layout.instrumentCenterY;
  const tapeHalf = layout.tapeHeight / 2;
  const panelTop = centerY + tapeHalf + 26;

  ctx.save();
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.textBaseline = "middle";

  // ROTOR panel under the speed tape: NR% is the rotorcraft's life instrument, TQ%
  // the limit the collective spends. Levels follow authoritative limits, not vibes.
  {
    const w = 104;
    const h = 56;
    const x = Math.min(Math.max(layout.tapeInset, w / 2 + 4), width - w / 2 - 4);
    const nrColor = levelColor(model.rotor.nrLevel);
    const worst = LEVEL_RANK[model.rotor.nrLevel] < LEVEL_RANK[model.rotor.torqueLevel]
      ? model.rotor.nrLevel : model.rotor.torqueLevel;
    panel(ctx, x - w / 2, panelTop, w, h, levelColor(worst, "rgba(77, 255, 136, 0.28)"));
    ctx.textAlign = "center";
    ctx.fillStyle = nrColor;
    ctx.font = `800 15px ${MONO}`;
    ctx.fillText(`NR ${Math.round(model.rotor.nrPct)}%`, x, panelTop + 13);
    ctx.fillStyle = levelColor(model.rotor.torqueLevel);
    ctx.font = `800 11px ${MONO}`;
    ctx.fillText(`TQ ${Math.round(model.rotor.torquePct)}%`, x, panelTop + 30);
    ctx.fillStyle = GREEN_DIM;
    ctx.font = `700 8px ${MONO}`;
    ctx.fillText(
      model.rotor.governorSaturated ? `${model.rotor.regime} · GOV` : model.rotor.regime,
      x, panelTop + 45,
    );
  }

  // HOVER panel under the altitude tape: radar AGL and sink, graded for the hover
  // regime where the F-22 tapes are least expressive.
  {
    const w = 116;
    const h = 56;
    const x = Math.max(Math.min(width - layout.tapeInset, width - w / 2 - 4), w / 2 + 4);
    const sinkColor = levelColor(model.hover.sinkLevel);
    panel(ctx, x - w / 2, panelTop, w, h,
      model.hover.hoverEmphasis ? sinkColor : "rgba(77, 255, 136, 0.28)");
    ctx.textAlign = "center";
    ctx.fillStyle = model.hover.sinkLevel === "normal" ? GREEN : sinkColor;
    ctx.font = `800 15px ${MONO}`;
    const agl = model.hover.aglM;
    ctx.fillText(agl === null ? "RALT ---" : `RALT ${Math.max(0, Math.round(agl))} M`,
      x, panelTop + 13);
    const vsi = model.hover.vsiFpm;
    const vsiText = `${vsi > 25 ? "↑" : vsi < -25 ? "↓" : "·"} ${Math.abs(Math.round(vsi / 50) * 50)} FPM`;
    ctx.fillStyle = sinkColor === GREEN && !model.hover.hoverEmphasis ? GREEN_DIM : sinkColor;
    ctx.font = `800 ${model.hover.hoverEmphasis ? 13 : 11}px ${MONO}`;
    ctx.fillText(vsiText, x, panelTop + 30);
    ctx.fillStyle = GREEN_DIM;
    ctx.font = `700 8px ${MONO}`;
    ctx.fillText(model.hover.hoverEmphasis ? `HOVER · GS ${Math.round(model.hover.gsKt)}` : `GS ${Math.round(model.hover.gsKt)} KT`,
      x, panelTop + 45);
  }

  // Rotor-state annunciations in the F-22 warning lane (empty for the Cobra: no
  // GCAS/stall/gear chrome is armed by the adapter's snapshot).
  {
    let y = layout.warningY;
    ctx.textAlign = "center";
    for (const warning of model.warnings) {
      const color = warning.level === "warning" ? RED : AMBER;
      ctx.shadowColor = warning.level === "warning"
        ? "rgba(255, 70, 93, 0.62)" : "rgba(255, 176, 32, 0.5)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = color;
      ctx.font = `800 16px ${MONO}`;
      ctx.fillText(warning.text, width / 2, y);
      ctx.shadowBlur = 0;
      y += 20;
    }
  }

  // Gunner crew line, bottom centre: the one line that explains why the turret is
  // or is not firing, with the target/ammo/FOB context beneath it. On narrow
  // viewports the mission card owns the bottom band, so the line steps above it.
  {
    const cardClearance = width < 720 ? 196 : 0;
    const bottom = height - Math.max(Number(safeInsets?.bottom) || 0, cardClearance);
    const heroY = bottom - 46;
    const color = levelColor(model.gunner.level, GREEN_DIM);
    ctx.font = `800 12px ${MONO}`;
    const heroWidth = Math.max(120, ctx.measureText(model.gunner.line).width + 26);
    panel(ctx, (width - heroWidth) / 2, heroY - 13, heroWidth, 26, color);
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.fillText(model.gunner.line, width / 2, heroY);
    if (model.gunner.detail) {
      ctx.fillStyle = GREEN_DIM;
      ctx.font = `700 9px ${MONO}`;
      ctx.fillText(model.gunner.detail, width / 2, heroY + 21);
    }
  }

  ctx.restore();
}
