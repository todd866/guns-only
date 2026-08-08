import { gunnerStatusText } from "./cobra_gunner_status.js";
import { fighterHudLayout } from "../hud/fighter_layout.js";

const MPS_TO_KT = 3600 / 1852;
const MPS_TO_FPM = 196.850394;
const M_TO_FT = 3.28084;
const M_TO_NM = 1 / 1852;

/** Player-facing slant range. Gun marks use feet inside 1 NM; nav/FOB always uses NM. */
export function formatAviationRange(rangeM, { style = "tactical" } = {}) {
  const meters = Number(rangeM);
  if (!Number.isFinite(meters) || meters < 0) return "—";
  const nm = meters * M_TO_NM;
  if (style === "nav" || nm >= 1) return `${nm.toFixed(1)} NM`;
  return `${Math.round(meters * M_TO_FT)} FT`;
}

/** Player-facing AGL / radar altitude in feet. */
export function formatAviationAgl(aglM) {
  const meters = Number(aglM);
  if (!Number.isFinite(meters) || meters < 0) return null;
  return Math.max(0, Math.round(meters * M_TO_FT));
}

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
  const hubClearanceM = Number(rotor.main_rotor_clearance_m);
  const routeClearanceM = Number(routeGuidance?.current_clearance_m);
  const aglM = Number.isFinite(hubClearanceM) && hubClearanceM >= 0
    ? hubClearanceM
    : routeClearanceM;
  const aglFt = formatAviationAgl(aglM);
  const aglText = aglFt === null ? "—" : `${aglFt}FT`;
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
  // 100% IS the transmission limit (Ah1gCobraDefinition: 1100 shp), and a loaded Cobra
  // hovers in the low nineties. Caution opens only where the pilot is about to spend the
  // limit; an 85% band would sit amber through every hover and teach him to ignore it.
  const torqueLevel = torquePct > 100 ? "warning"
    : torquePct >= 97 ? "caution" : "normal";

  const gsKt = finite(vehicle.ground_speed_mps) * MPS_TO_KT;
  const vsiFpm = finite(vehicle.vertical_speed_mps) * MPS_TO_FPM;
  // Prefer hub clearance (rotorcraft truth) over route guidance clearance. Guidance uses
  // CG−terrain and can read 0–2 m while the eye is still high above the river; the hub
  // sample matches the strike/contact path (Build 267 owner RALT complaint).
  const hubClearanceM = finiteOrNull(rotor.main_rotor_clearance_m);
  const routeClearanceM = finiteOrNull(authorityState?.route_guidance?.current_clearance_m);
  const aglM = hubClearanceM !== null && hubClearanceM >= 0
    ? hubClearanceM
    : routeClearanceM;
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
  if (rbs >= 0.75) warnings.push({ text: "BLADE STALL", level: "warning" });
  else if (rbs >= 0.55) warnings.push({ text: "BLADE STALL", level: "caution" });
  if (torquePct > 100) warnings.push({ text: "TORQUE LIMIT", level: "caution" });
  else if (rotor.governor_saturated === true) warnings.push({ text: "GOV LIMIT", level: "caution" });
  warnings.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
  warnings.length = Math.min(warnings.length, 2);

  const gunner = authorityState?.gunner ?? null;
  const war = authorityState?.ground_war ?? null;
  const line = gunnerStatusText(gunner, war);
  // GREEN means "hold F and it shoots" — nothing weaker. A turret that is tracking but has
  // no ballistic solution, or is still slewing onto the sight line, is not a ready gun; it
  // stays in the dim normal treatment so the ready cue keeps its meaning.
  const gunnerLevel = war?.ammo_dry === true ? "warning"
    : gunner?.fire_authorized === true ? "firing"
      : gunner?.state === "tracking" && gunner?.reason === "ConsentReleased" ? "ready"
        : gunner?.state === "masked" || gunner?.state === "outoflimits"
          || gunner?.state === "inhibited" || gunner?.reason === "WeaponsSafe"
          ? "caution" : "normal";
  const detailParts = [];
  const targetId = gunner?.selected_target_id;
  // The gunner's mark, resolved to authority world truth so the extras can bracket it
  // through the real camera. A dead or absent unit designates nothing: a bracket the
  // turret is not actually on is worse than no bracket.
  const unit = targetId
    ? (war?.units ?? []).find((candidate) => candidate?.id === targetId && candidate.alive === true)
    : null;
  const designation = unit === undefined || unit === null ? null : {
    id: unit.id,
    label: String(unit.id).split(".").pop(),
    level: gunnerLevel,
    worldX: finite(unit.x_m),
    worldY: finite(unit.y_m),
    worldZ: finite(unit.z_m),
    rangeM: Math.hypot(
      finite(unit.x_m) - finite(vehicle.x_m),
      finite(unit.y_m) - finite(vehicle.y_m),
      finite(unit.z_m) - finite(vehicle.z_m),
    ),
  };
  if (targetId) detailParts.push(`TGT ${String(targetId).split(".").pop()}`);
  // Slant range keeps an out-of-frame target quantified — the turret's arc is far wider
  // than the combiner, so "on target" often means "off the glass".
  if (designation) {
    // Owner ruling: American/aviation units on the play HUD — feet inside 1 NM, else NM.
    detailParts.push(formatAviationRange(designation.rangeM));
  }
  if (war) {
    detailParts.push(war.ammo_dry === true
      ? "AMMO DRY"
      : `AMMO ${Math.max(0, Math.floor(finite(war.ammo_remaining)))}`);
    detailParts.push(war.over_fob === true
      ? "FOB PAD · REARM"
      : `FOB ${formatAviationRange(finite(war.fob_range_m), { style: "nav" })}`);
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
    hover: {
      gsKt,
      vsiFpm,
      aglM,
      aglFt: formatAviationAgl(aglM),
      hoverEmphasis,
      sinkLevel,
    },
    warnings,
    gunner: { line, level: gunnerLevel, detail: detailParts.join(" · ") },
    designation,
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
  projectWorldPoint = null,
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
    const aglFt = model.hover.aglFt;
    ctx.fillText(aglFt === null ? "RALT ---" : `RALT ${aglFt} FT`,
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

  // Turret designation: a bracket on the gunner's mark, projected through the SAME
  // camera hud.js projects its own symbology through, so the mark and the world agree.
  // Range-scaled and never clamped to the frame edge — a bracket parked on the bezel
  // would claim the turret is looking somewhere it is not. The slant range on the crew
  // line is what carries an off-glass target.
  if (model.designation && typeof projectWorldPoint === "function") {
    const point = projectWorldPoint(
      model.designation.worldX, model.designation.worldY, model.designation.worldZ,
    );
    if (point && point.inFrame === true) {
      const color = levelColor(model.designation.level);
      // Grows as the target does, but never smaller than a bracket a pilot can find at a
      // glance: at 6 km the honest angular size is a couple of pixels, which is a smudge.
      const half = Math.max(10, Math.min(23, 14_000 / Math.max(300, model.designation.rangeM)));
      const arm = half * 0.5;
      ctx.strokeStyle = color;
      ctx.lineWidth = model.designation.level === "firing" ? 2.2 : 1.6;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const cx = point.x + sx * half;
        const cy = point.y + sy * half;
        ctx.moveTo(cx - sx * arm, cy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy - sy * arm);
      }
      ctx.stroke();
      ctx.textAlign = "left";
      ctx.fillStyle = color;
      ctx.font = `800 10px ${MONO}`;
      ctx.fillText(model.designation.label, point.x + half + 5, point.y - half + 5);
    }
  }

  // Rotor-state annunciations sit ABOVE the ROTOR panel (left tape lane) — never the centre
  // warning lane. Owner: centre-screen BLADE STALL / VRS plates 24/7 are unusable chrome.
  {
    let y = panelTop - 14;
    ctx.textAlign = "center";
    const x = Math.min(Math.max(layout.tapeInset, 52 + 4), width - 52 - 4);
    for (const warning of model.warnings) {
      const color = warning.level === "warning" ? RED : AMBER;
      ctx.font = `800 10px ${MONO}`;
      const plateWidth = Math.min(112, ctx.measureText(warning.text).width + 14);
      panel(ctx, x - plateWidth / 2, y - 9, plateWidth, 18, color);
      ctx.fillStyle = color;
      ctx.shadowBlur = 0;
      ctx.fillText(warning.text, x, y);
      y -= 20;
    }
  }

  // Gunner crew line, bottom centre: the one line that explains why the turret is
  // or is not firing, with the target/ammo/FOB context beneath it. On narrow
  // viewports the mission card owns the bottom band, so the line steps above it.
  {
    const cardClearance = width < 720 ? 196 : 0;
    const bottom = height - Math.max(Number(safeInsets?.bottom) || 0, cardClearance);
    let heroY = bottom - 46;
    // On a narrow shell the mission card pushes the crew line up into exactly the band the
    // ROTOR and HOVER panels occupy, and the gun state ends up written across NR%. When the
    // bottom anchor lands anywhere near that band, the line steps above the panels instead.
    const panelBandFloor = panelTop + 56 + 40;
    if (heroY < panelBandFloor) heroY = panelTop - 48;
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
