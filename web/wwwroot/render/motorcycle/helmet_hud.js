/** Helmet-mounted canvas HUD for the YZF-R1 weekend ride. No gun funnel / padlock. */

export const REDLINE_RPM = 14_500;
export const IDLE_RPM = 2_000;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function speedKmh(state) {
  const mps = Math.hypot(state.vx ?? 0, state.vy ?? 0, state.vz ?? 0);
  return mps * 3.6;
}

export function formatLapTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—:——";
  const centiseconds = Math.floor(seconds * 100 + 1e-6);
  const minutes = Math.floor(centiseconds / 6_000);
  const wholeSeconds = Math.floor((centiseconds % 6_000) / 100);
  const hundredths = centiseconds % 100;
  return `${minutes}:${String(wholeSeconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

/** Pure minimap placement: clamps the rider dot to the widget frame, flags off-map. */
export function minimapDotPlacement(bounds, frame, px, pz) {
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanZ = Math.max(1, bounds.maxZ - bounds.minZ);
  const innerSize = frame.size - frame.inset * 2;
  const rawX = frame.x + frame.inset + ((px - bounds.minX) / spanX) * innerSize;
  const rawY = frame.y + frame.inset + ((pz - bounds.minZ) / spanZ) * innerSize;
  const x = Math.min(frame.x + frame.size - frame.inset, Math.max(frame.x + frame.inset, rawX));
  const y = Math.min(frame.y + frame.size - frame.inset, Math.max(frame.y + frame.inset, rawY));
  return Object.freeze({ x, y, clamped: x !== rawX || y !== rawY });
}

export function trackDayStatusLine(state = {}) {
  if ((state.tip_recovery_flash_s ?? 0) > 0) {
    return Object.freeze({ text: "TIP-OVER · RECOVERED", tone: "danger" });
  }
  if ((state.phase ?? "ready") === "paused") {
    return Object.freeze({ text: "PAUSED · ESC RESUME", tone: "caution" });
  }
  if (state.on_track === false) {
    return Object.freeze({
      text: "OFF COURSE · RETURN BETWEEN CURBS",
      tone: "danger",
    });
  }
  const mode = state.control_mode === "raw" ? "RAW" : "RIDER ASSIST";
  const lap = state.lap ?? 0;
  return Object.freeze({
    text: `${mode} · LAP ${lap} · ${formatLapTime(state.lap_time_s)} · OFF ${(state.off_track_s ?? 0).toFixed(0)}s`,
    tone: "normal",
  });
}

export class HelmetHud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = 1;
    this.width = 0;
    this.height = 0;
    this._circuit = null;
    this._minimapBounds = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
  }

  /** Cache the immutable circuit polyline once; the per-frame snapshot no longer carries it. */
  setCircuit(circuit) {
    if (!Array.isArray(circuit) || circuit.length === 0) return;
    this._circuit = circuit;
    this.updateMinimapBounds(circuit);
  }

  resize(width, height, dpr = window.devicePixelRatio || 1) {
    this.dpr = dpr;
    this.width = width;
    this.height = height;
    const backingW = Math.max(1, Math.round(width * dpr));
    const backingH = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== backingW || this.canvas.height !== backingH) {
      this.canvas.width = backingW;
      this.canvas.height = backingH;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  updateMinimapBounds(circuit) {
    if (!Array.isArray(circuit) || circuit.length === 0) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const point of circuit) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    }
    const padM = 40;
    this._minimapBounds = {
      minX: minX - padM,
      maxX: maxX + padM,
      minZ: minZ - padM,
      maxZ: maxZ + padM,
    };
  }

  draw(state) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.clearRect(0, 0, w, h);

    this.drawHorizonReticle(ctx, w, h);
    this.drawSpeedBlock(ctx, w, h, state);
    this.drawRpmGear(ctx, w, h, state);
    this.drawLeanBlock(ctx, w, h, state);
    this.drawInputBars(ctx, w, h, state);
    this.drawClutchMode(ctx, w, h, state);
    this.drawMinimap(ctx, w, h, state);
    this.drawPitchBalanceTape(ctx, w, h, state);
    this.drawContactPatchInstrument(ctx, w, h, state);
    this.drawKneeCue(ctx, w, h, state);
    this.drawStatusStrip(ctx, w, h, state);
  }

  drawHorizonReticle(ctx, w, h) {
    const cx = w * 0.5;
    const cy = h * 0.52;
    ctx.save();
    ctx.strokeStyle = "rgba(230, 236, 217, 0.42)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 18, cy);
    ctx.lineTo(cx - 6, cy);
    ctx.moveTo(cx + 6, cy);
    ctx.lineTo(cx + 18, cy);
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx, cy - 3);
    ctx.moveTo(cx, cy + 3);
    ctx.lineTo(cx, cy + 10);
    ctx.stroke();
    ctx.restore();
  }

  drawSpeedBlock(ctx, w, h, state) {
    const kmh = speedKmh(state);
    const x = w * 0.08;
    const y = h * 0.78;
    ctx.save();
    ctx.fillStyle = "rgba(8, 16, 13, 0.72)";
    ctx.strokeStyle = "rgba(196, 210, 171, 0.28)";
    ctx.lineWidth = 1;
    roundRect(ctx, x - 10, y - 34, 118, 62, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#9ca997";
    ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("SPD", x, y - 18);
    ctx.fillStyle = "#e9ede2";
    ctx.font = "700 28px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(String(Math.round(kmh)), x, y + 8);
    ctx.fillStyle = "#c7b78c";
    ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("km/h", x + 64, y + 8);
    ctx.restore();
  }

  drawRpmGear(ctx, w, h, state) {
    const rpm = Number.isFinite(state.rpm) ? state.rpm : 0;
    const gear = Number.isFinite(state.gear) ? state.gear : 0;
    const x = w * 0.5 - 70;
    const y = h * 0.86;
    const barW = 140;
    const fill = clamp((rpm - IDLE_RPM) / (REDLINE_RPM - IDLE_RPM), 0, 1);
    const redStart = clamp((12_000 - IDLE_RPM) / (REDLINE_RPM - IDLE_RPM), 0, 1);

    ctx.save();
    ctx.fillStyle = "rgba(8, 16, 13, 0.72)";
    ctx.strokeStyle = "rgba(196, 210, 171, 0.28)";
    roundRect(ctx, x - 12, y - 42, barW + 56, 54, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#9ca997";
    ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("RPM", x, y - 24);

    ctx.fillStyle = "rgba(221, 226, 206, 0.15)";
    roundRect(ctx, x, y - 14, barW, 8, 3);
    ctx.fill();
    if (redStart < 1) {
      ctx.fillStyle = "rgba(229, 121, 84, 0.22)";
      roundRect(ctx, x + barW * redStart, y - 14, barW * (1 - redStart), 8, 3);
      ctx.fill();
    }
    ctx.fillStyle = fill > redStart ? "#e57954" : "#91ac78";
    roundRect(ctx, x, y - 14, barW * fill, 8, 3);
    ctx.fill();

    ctx.fillStyle = "#e6ebdf";
    ctx.font = "650 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(String(Math.round(rpm)), x, y + 4);

    ctx.fillStyle = "#d5b56f";
    ctx.font = "800 22px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "right";
    ctx.fillText(gear <= 0 ? "N" : String(gear), x + barW + 36, y + 2);
    ctx.textAlign = "left";
    ctx.restore();
  }

  drawLeanBlock(ctx, w, h, state) {
    const leanDeg = (state.lean_rad ?? 0) * (180 / Math.PI);
    const pitchDeg = (state.pitch_rad ?? 0) * (180 / Math.PI);
    // Right edge, tucked below the CONTACT instrument (h*0.5 ± 84) so the two never overlap.
    const x = w - 24;
    const y = h * 0.5 + 118;
    ctx.save();
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(8, 16, 13, 0.72)";
    ctx.strokeStyle = "rgba(196, 210, 171, 0.28)";
    roundRect(ctx, x - 78, y - 28, 86, 68, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#9ca997";
    ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("LEAN", x - 8, y - 10);
    ctx.fillStyle = "#e9ede2";
    ctx.font = "700 20px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(`${leanDeg >= 0 ? "+" : ""}${leanDeg.toFixed(0)}°`, x - 8, y + 14);
    ctx.fillStyle = "#9ca997";
    ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(`PITCH ${pitchDeg >= 0 ? "+" : ""}${pitchDeg.toFixed(0)}°`, x - 8, y + 32);
    ctx.restore();
  }

  drawInputBars(ctx, w, h, state) {
    const x = w * 0.08;
    const y = h * 0.9;
    const barW = 96;
    const throttle = clamp(state.throttle ?? 0, 0, 1);
    const brake = clamp(state.brake ?? 0, 0, 1);
    ctx.save();
    ctx.fillStyle = "#9ca997";
    ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("THR", x, y - 2);
    ctx.fillStyle = "rgba(221, 226, 206, 0.15)";
    roundRect(ctx, x + 28, y - 10, barW, 6, 2);
    ctx.fill();
    ctx.fillStyle = "#91ac78";
    roundRect(ctx, x + 28, y - 10, barW * throttle, 6, 2);
    ctx.fill();

    ctx.fillStyle = "#9ca997";
    ctx.fillText("BRK", x, y + 12);
    ctx.fillStyle = "rgba(221, 226, 206, 0.15)";
    roundRect(ctx, x + 28, y + 4, barW, 6, 2);
    ctx.fill();
    ctx.fillStyle = "#e57954";
    roundRect(ctx, x + 28, y + 4, barW * brake, 6, 2);
    ctx.fill();
    ctx.restore();
  }

  drawClutchMode(ctx, w, h, state) {
    const manual = state.clutch_mode === "manual";
    const clutch = clamp(state.clutch ?? 1, 0, 1);
    const x = w * 0.34;
    const y = h * 0.9;
    ctx.save();
    ctx.fillStyle = manual ? "#d5b56f" : "#9ca997";
    ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(manual ? "CLUTCH MANUAL" : "CLUTCH AUTO", x, y);
    if (manual) {
      ctx.fillStyle = "rgba(221, 226, 206, 0.15)";
      roundRect(ctx, x, y + 6, 72, 5, 2);
      ctx.fill();
      ctx.fillStyle = "#c7b78c";
      roundRect(ctx, x, y + 6, 72 * clutch, 5, 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawMinimap(ctx, w, h, state) {
    const size = Math.min(132, w * 0.18);
    const x = w - size - 18;
    const y = 18;
    const { minX, maxX, minZ, maxZ } = this._minimapBounds;
    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);

    ctx.save();
    ctx.fillStyle = "rgba(8, 16, 13, 0.78)";
    ctx.strokeStyle = "rgba(196, 210, 171, 0.35)";
    roundRect(ctx, x, y, size, size, 6);
    ctx.fill();
    ctx.stroke();

    const circuit = this._circuit ?? state.circuit;
    if (Array.isArray(circuit) && circuit.length > 1) {
      ctx.strokeStyle = "rgba(145, 172, 120, 0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < circuit.length; i++) {
        const px = x + 8 + ((circuit[i].x - minX) / spanX) * (size - 16);
        const py = y + 8 + ((circuit[i].z - minZ) / spanZ) * (size - 16);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    if (Number.isFinite(state.px) && Number.isFinite(state.pz)) {
      const dot = minimapDotPlacement(
        this._minimapBounds,
        { x, y, size, inset: 8 },
        state.px,
        state.pz,
      );
      if (dot.clamped) {
        // Off-map: hollow ring pinned to the frame edge points back at the strip.
        ctx.strokeStyle = "#e57954";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 4.5, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#d5b56f";
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#171b14";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    ctx.fillStyle = "#9ca997";
    ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("TRACK", x + 8, y + size - 6);
    ctx.restore();
  }

  drawPitchBalanceTape(ctx, w, h, state) {
    const tapeW = 16;
    const tapeH = Math.min(220, h * 0.34);
    const x = 18;
    const y = h * 0.5 - tapeH * 0.5;
    const wheelie = state.wheelie_balance ?? 0;
    const stoppie = state.stoppie_balance ?? 0;
    const reflex = clamp(state.pitch_reflex ?? 0, 0, 1);
    const bias = wheelie - stoppie;

    ctx.save();
    ctx.fillStyle = "rgba(8, 16, 13, 0.72)";
    ctx.strokeStyle = "rgba(196, 210, 171, 0.28)";
    roundRect(ctx, x - 4, y - 18, tapeW + 36, tapeH + 30, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#9ca997";
    ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("BAL", x, y - 6);

    ctx.fillStyle = "rgba(221, 226, 206, 0.12)";
    roundRect(ctx, x, y, tapeW, tapeH, 4);
    ctx.fill();

    if (reflex > 0) {
      const bandH = tapeH * 0.22;
      const bandY = y + tapeH * 0.5 - bandH * 0.5;
      ctx.fillStyle = `rgba(143, 204, 167, ${0.15 + reflex * 0.35})`;
      roundRect(ctx, x, bandY, tapeW, bandH, 3);
      ctx.fill();
    }

    const markerY = y + tapeH * (0.5 - bias * 0.21);
    ctx.strokeStyle = "#d5b56f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 2, markerY);
    ctx.lineTo(x + tapeW + 2, markerY);
    ctx.stroke();

    ctx.fillStyle = "#b8c1b2";
    ctx.font = "600 8px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("W", x + tapeW + 6, y + 8);
    ctx.fillText("S", x + tapeW + 6, y + tapeH);
    ctx.restore();
  }

  /**
   * Top-down front/rear contact patches: grip-use heatmap (load-scaled), force arrows, CoG.
   * All values come from the sim snapshot — no invented heat in presentation.
   */
  drawContactPatchInstrument(ctx, w, h, state) {
    const panelW = 132;
    const panelH = 168;
    const x = w - panelW - 16;
    const y = h * 0.5 - panelH * 0.5;
    const wheelbaseM = Math.max(0.5, state.wheelbase_m ?? 1.405);
    const frontN = Math.max(0, state.front_normal_n ?? 0);
    const rearN = Math.max(0, state.rear_normal_n ?? 0);
    const totalN = frontN + rearN;
    const weightN = totalN > 1e-3 ? totalN : 1;
    const frontLoad = frontN / weightN;
    const rearLoad = rearN / weightN;
    const frontGrip = clamp(state.front_grip_use ?? 0, 0, 1);
    const rearGrip = clamp(state.rear_grip_use ?? 0, 0, 1);
    const forceScale = 1 / Math.max(800, weightN * 0.55);

    ctx.save();
    ctx.fillStyle = "rgba(8, 16, 13, 0.78)";
    ctx.strokeStyle = "rgba(196, 210, 171, 0.28)";
    roundRect(ctx, x, y, panelW, panelH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#9ca997";
    ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("CONTACT", x + 10, y + 14);
    ctx.fillText("F", x + panelW * 0.5 - 3, y + 28);
    ctx.fillText("R", x + panelW * 0.5 - 3, y + panelH - 10);

    const plotX = x + panelW * 0.5;
    const plotTop = y + 36;
    const plotBottom = y + panelH - 22;
    const plotMid = (plotTop + plotBottom) * 0.5;
    const axleSpan = plotBottom - plotTop - 28;
    const frontY = plotTop + 14;
    const rearY = plotBottom - 14;

    ctx.strokeStyle = "rgba(196, 210, 171, 0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(plotX, frontY);
    ctx.lineTo(plotX, rearY);
    ctx.stroke();

    this._drawContactPatch(ctx, plotX, frontY, frontLoad, frontGrip, {
      longN: state.front_long_force_n ?? 0,
      latN: state.front_lat_force_n ?? 0,
      forceScale,
      label: "F",
    });
    this._drawContactPatch(ctx, plotX, rearY, rearLoad, rearGrip, {
      longN: state.rear_long_force_n ?? 0,
      latN: state.rear_lat_force_n ?? 0,
      forceScale,
      label: "R",
    });

    const along = clamp(state.cog_along_from_rear_m ?? wheelbaseM * 0.5, 0, wheelbaseM);
    const lateralM = state.cog_lateral_m ?? 0;
    const cogY = rearY - (along / wheelbaseM) * (rearY - frontY);
    const lateralScale = 28 / 0.35;
    const cogX = plotX + clamp(lateralM * lateralScale, -34, 34);

    const envCenterAlong = state.cog_envelope_center_along_m ?? wheelbaseM * 0.48;
    const envHalfAlong = Math.max(0.05, state.cog_envelope_half_along_m ?? 0.28);
    const envHalfLat = Math.max(0.02, state.cog_envelope_half_lateral_m ?? 0.10);
    const envCy = rearY - (clamp(envCenterAlong, 0, wheelbaseM) / wheelbaseM) * (rearY - frontY);
    const envRx = envHalfLat * lateralScale;
    const envRy = (envHalfAlong / wheelbaseM) * (rearY - frontY);
    const inside = state.cog_inside_envelope === true;
    const skill = clamp(state.rider_skill ?? 0, 0, 1);

    ctx.strokeStyle = inside
      ? `rgba(143, 204, 167, ${0.35 + skill * 0.35})`
      : "rgba(229, 121, 84, 0.45)";
    ctx.fillStyle = inside
      ? `rgba(143, 204, 167, ${0.06 + skill * 0.08})`
      : "rgba(229, 121, 84, 0.05)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.ellipse(plotX, envCy, envRx, envRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "rgba(213, 181, 111, 0.55)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(plotX, plotMid);
    ctx.lineTo(cogX, cogY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = inside ? "#d5b56f" : "#e57954";
    ctx.strokeStyle = "#171b14";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cogX, cogY, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#171b14";
    ctx.font = "700 7px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText("CG", cogX, cogY + 2.5);
    ctx.textAlign = "left";

    ctx.fillStyle = "#b8c1b2";
    ctx.font = "600 8px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(`${Math.round(frontLoad * 100)}%`, x + 8, frontY + 4);
    ctx.fillText(`${Math.round(rearLoad * 100)}%`, x + 8, rearY + 4);
    ctx.fillText(`SK ${Math.round(skill * 100)}`, x + 8, y + panelH - 8);
    if ((state.cerebellar_assist_scale ?? 1) > 1.02 && inside) {
      ctx.fillStyle = "#8fcca7";
      ctx.fillText(`×${(state.cerebellar_assist_scale ?? 1).toFixed(2)}`, x + 52, y + panelH - 8);
    }
    ctx.restore();
  }

  _drawContactPatch(ctx, cx, cy, loadFraction, gripUse, forces) {
    const load = clamp(loadFraction, 0, 1);
    const grip = clamp(gripUse, 0, 1);
    const rx = 10 + load * 14;
    const ry = 16 + load * 10;
    const heat = gripHeatColor(grip, load);
    ctx.save();
    ctx.fillStyle = heat.fill;
    ctx.strokeStyle = heat.stroke;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const longPx = clamp(-(forces.longN ?? 0) * forces.forceScale * 36, -34, 34);
    const latPx = clamp((forces.latN ?? 0) * forces.forceScale * 36, -34, 34);
    if (Math.abs(longPx) > 1.5 || Math.abs(latPx) > 1.5) {
      drawForceArrow(ctx, cx, cy, latPx, longPx, grip > 0.85 ? "#e57954" : "#c4d2ab");
    }
    ctx.restore();
  }

  drawKneeCue(ctx, w, h, state) {
    if (state.knee_down !== true) return;
    if ((state.pitch_reflex ?? 0) > 0) return;
    const proximity = clamp(state.knee_proximity ?? 0, 0, 1);
    const hold = clamp(state.lean_hold ?? 0, 0, 1);
    const intensity = clamp(proximity * 0.65 + hold * 0.35, 0, 1);
    const x = w * 0.5;
    const y = h * 0.68;
    ctx.save();
    ctx.globalAlpha = 0.35 + intensity * 0.55;
    ctx.strokeStyle = "#8fcca7";
    ctx.lineWidth = 2 + intensity * 2;
    ctx.beginPath();
    ctx.arc(x - 42, y, 10 + intensity * 6, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 42, y, 10 + intensity * 6, Math.PI * 0.15, Math.PI * 0.85, true);
    ctx.stroke();
    ctx.fillStyle = "#dce8df";
    ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText("KNEE", x, y + 24);
    ctx.restore();
  }

  drawStatusStrip(ctx, w, h, state) {
    const status = trackDayStatusLine(state);
    const x = w * 0.5;
    const y = 14;
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = status.tone === "danger"
      ? "#e57954"
      : status.tone === "caution"
        ? "#d5b56f"
        : "#9ca997";
    ctx.fillText(status.text, x, y);
    ctx.restore();
  }
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width * 0.5, height * 0.5);
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
}

/** Cool (low grip use / unloaded) → amber → hot (near friction limit). */
function gripHeatColor(gripUse, loadFraction) {
  const g = clamp(gripUse, 0, 1);
  const load = clamp(loadFraction, 0, 1);
  const alpha = 0.12 + load * 0.55;
  if (g < 0.35) {
    return {
      fill: `rgba(120, 160, 140, ${alpha})`,
      stroke: "rgba(168, 196, 170, 0.7)",
    };
  }
  if (g < 0.7) {
    return {
      fill: `rgba(213, 181, 111, ${alpha})`,
      stroke: "rgba(213, 181, 111, 0.85)",
    };
  }
  return {
    fill: `rgba(229, 121, 84, ${alpha})`,
    stroke: "rgba(229, 121, 84, 0.95)",
  };
}

function drawForceArrow(ctx, x, y, dx, dy, color) {
  const len = Math.hypot(dx, dy);
  if (len < 1.5) return;
  const ux = dx / len;
  const uy = dy / len;
  const head = Math.min(7, len * 0.35);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx, y + dy);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + dx, y + dy);
  ctx.lineTo(x + dx - ux * head - uy * head * 0.55, y + dy - uy * head + ux * head * 0.55);
  ctx.lineTo(x + dx - ux * head + uy * head * 0.55, y + dy - uy * head - ux * head * 0.55);
  ctx.closePath();
  ctx.fill();
}
