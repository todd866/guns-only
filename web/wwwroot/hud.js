import * as THREE from "./vendor/three.module.js";

const GREEN = "#4dff88";
const GREEN_DIM = "rgba(77, 255, 136, 0.48)";
const GREEN_FAINT = "rgba(77, 255, 136, 0.16)";
const AMBER = "#ffb020";
const AMBER_DIM = "rgba(255, 176, 32, 0.5)";
const RED = "#ff465d";
const GLASS = "rgba(3, 13, 20, 0.58)";
const DEG = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrap360(value) {
  return ((value % 360) + 360) % 360;
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
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

function formatRange(metres) {
  if (!Number.isFinite(metres)) return "---";
  if (metres < 1000) return `${Math.round(metres)} M`;
  if (metres < 10000) return `${(metres / 1000).toFixed(1)} KM`;
  return `${Math.round(metres / 1000)} KM`;
}

function formatSigned(value) {
  if (!Number.isFinite(value)) return "---";
  const rounded = Math.round(value);
  return `${rounded >= 0 ? "+" : "−"}${Math.abs(rounded)}`;
}

class CombatHud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;
    this.legendVisible = true;

    this.worldPoint = new THREE.Vector3();
    this.ndc = new THREE.Vector3();
    this.cameraPoint = new THREE.Vector3();
    this.relative = new THREE.Vector3();
  }

  resize(width, height, pixelRatio) {
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.canvas.width = Math.max(1, Math.round(width * pixelRatio));
    this.canvas.height = Math.max(1, Math.round(height * pixelRatio));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  toggleLegend() {
    this.legendVisible = !this.legendVisible;
  }

  project(world, camera) {
    this.cameraPoint.copy(world).applyMatrix4(camera.matrixWorldInverse);
    const behind = this.cameraPoint.z >= -0.01;
    this.ndc.copy(world).project(camera);
    return {
      x: (this.ndc.x * 0.5 + 0.5) * this.width,
      y: (-this.ndc.y * 0.5 + 0.5) * this.height,
      ndcX: this.ndc.x,
      ndcY: this.ndc.y,
      cameraX: this.cameraPoint.x,
      cameraY: this.cameraPoint.y,
      cameraZ: this.cameraPoint.z,
      behind,
    };
  }

  setLine(color = GREEN, width = 1.35) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  glassPanel(x, y, width, height, border = GREEN_FAINT) {
    const ctx = this.ctx;
    roundedRect(ctx, x, y, width, height, 5);
    ctx.fillStyle = GLASS;
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  drawFrameWash() {
    const ctx = this.ctx;
    const vignette = ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.48,
      Math.min(this.width, this.height) * 0.16,
      this.width * 0.5,
      this.height * 0.5,
      Math.max(this.width, this.height) * 0.72,
    );
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(0.72, "rgba(0, 8, 11, 0.025)");
    vignette.addColorStop(1, "rgba(0, 5, 8, 0.22)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = "rgba(100, 255, 190, 0.018)";
    for (let y = 0; y < this.height; y += 4) ctx.fillRect(0, y, this.width, 1);
  }

  drawPitchLadder(anchor, state) {
    if (!anchor || anchor.behind || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return;

    const ctx = this.ctx;
    const bank = Number(state.bank_deg) || 0;
    const pitch = Number(state.pitch_deg) || 0;
    const radius = clamp(Math.min(this.width, this.height) * 0.245, 150, 245);
    const pixelsPerDegree = clamp(this.height / 205, 3.35, 5.1);

    ctx.save();
    ctx.translate(anchor.x, anchor.y);
    ctx.rotate(-bank * DEG);

    // The disc is established in the already-rolled ladder coordinate system. Clipping the
    // unrotated rungs first makes their long baselines sweep across the frame at high bank.
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.clip();

    ctx.font = "500 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1.25;

    for (let rung = -90; rung <= 90; rung += 5) {
      const y = (pitch - rung) * pixelsPerDegree;
      if (Math.abs(y) > radius + 8) continue;

      const major = rung % 10 === 0;
      const halfWidth = rung === 0 ? 92 : major ? 54 : 34;
      const centerGap = rung === 0 ? 26 : 18;
      ctx.strokeStyle = rung === 0 ? AMBER_DIM : GREEN_DIM;
      ctx.fillStyle = GREEN_DIM;
      ctx.setLineDash(rung < 0 ? [6, 4] : []);
      ctx.beginPath();
      ctx.moveTo(-halfWidth, y);
      ctx.lineTo(-centerGap, y);
      ctx.moveTo(centerGap, y);
      ctx.lineTo(halfWidth, y);
      if (major && rung !== 0) {
        const tooth = rung > 0 ? 6 : -6;
        ctx.moveTo(-halfWidth, y);
        ctx.lineTo(-halfWidth, y + tooth);
        ctx.moveTo(halfWidth, y);
        ctx.lineTo(halfWidth, y + tooth);
      }
      ctx.stroke();

      if (major && rung !== 0) {
        ctx.setLineDash([]);
        ctx.fillText(String(Math.abs(rung)), -halfWidth - 16, y + 1);
        ctx.fillText(String(Math.abs(rung)), halfWidth + 16, y + 1);
      }
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawAirframeSymbols(anchor, state) {
    if (!anchor || anchor.behind || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return;
    const ctx = this.ctx;
    const bank = (Number(state.bank_deg) || 0) * DEG;
    const color = state.gun_window ? AMBER : GREEN;

    ctx.save();
    ctx.translate(anchor.x, anchor.y);
    ctx.rotate(-bank);
    this.setLine(GREEN, 1.5);
    ctx.shadowColor = "rgba(77, 255, 136, 0.4)";
    ctx.shadowBlur = 5;

    // Flight-path marker. The kernel exposes a single physical forward/velocity vector, so
    // its small pipper and the airframe boresight intentionally share the same projected axis.
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.moveTo(-28, 0);
    ctx.lineTo(-7, 0);
    ctx.moveTo(7, 0);
    ctx.lineTo(28, 0);
    ctx.moveTo(0, -7);
    ctx.lineTo(0, -17);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-9, -25);
    ctx.lineTo(0, -31);
    ctx.lineTo(9, -25);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.shadowColor = state.gun_window ? "rgba(255, 176, 32, 0.52)" : "rgba(77, 255, 136, 0.32)";
    ctx.setLineDash([4, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, 48, -Math.PI * 0.82, Math.PI * 0.82);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const inner = 42;
      const outer = i % 2 === 0 ? 54 : 49;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.fillText(
      state.gun_window ? "IN RNG" : `AOFF ${Math.round(Number(state.angle_off_deg) || 0)}°`,
      60,
      -2,
    );
    ctx.fillStyle = GREEN_DIM;
    ctx.fillText(`${state.shots_in_window ?? 0}/${state.shots_total ?? 0}`, 60, 11);
    ctx.restore();
  }

  drawBandit(frame) {
    const { state, camera, banditPosition } = frame;
    const projection = this.project(banditPosition, camera);
    const margin = 48;
    const inside = !projection.behind
      && projection.x >= margin
      && projection.x <= this.width - margin
      && projection.y >= margin
      && projection.y <= this.height - margin;
    const color = state.gun_window ? AMBER : GREEN;
    const ctx = this.ctx;

    if (inside) {
      const size = state.gun_window ? 42 : 34;
      const corner = 10;
      this.setLine(color, state.gun_window ? 1.8 : 1.35);
      ctx.shadowColor = state.gun_window ? "rgba(255, 176, 32, 0.46)" : "rgba(77, 255, 136, 0.34)";
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.moveTo(projection.x - size, projection.y - size + corner);
      ctx.lineTo(projection.x - size, projection.y - size);
      ctx.lineTo(projection.x - size + corner, projection.y - size);
      ctx.moveTo(projection.x + size - corner, projection.y - size);
      ctx.lineTo(projection.x + size, projection.y - size);
      ctx.lineTo(projection.x + size, projection.y - size + corner);
      ctx.moveTo(projection.x + size, projection.y + size - corner);
      ctx.lineTo(projection.x + size, projection.y + size);
      ctx.lineTo(projection.x + size - corner, projection.y + size);
      ctx.moveTo(projection.x - size + corner, projection.y + size);
      ctx.lineTo(projection.x - size, projection.y + size);
      ctx.lineTo(projection.x - size, projection.y + size - corner);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = color;
      ctx.fillText(formatRange(state.range_m), projection.x + size + 8, projection.y - 13);
      ctx.fillStyle = GREEN_DIM;
      ctx.fillText(`C ${formatSigned(state.closure_kts)} KT`, projection.x + size + 8, projection.y + 2);
      return;
    }

    let dx;
    let dy;
    if (!projection.behind && Number.isFinite(projection.x) && Number.isFinite(projection.y)) {
      dx = projection.x - this.width / 2;
      dy = projection.y - this.height / 2;
    } else {
      dx = projection.cameraX;
      dy = -projection.cameraY;
      if (Math.abs(dx) + Math.abs(dy) < 0.001) dy = this.height;
    }

    const halfWidth = this.width / 2 - margin;
    const halfHeight = this.height / 2 - margin;
    const scale = Math.min(
      halfWidth / Math.max(Math.abs(dx), 0.0001),
      halfHeight / Math.max(Math.abs(dy), 0.0001),
    );
    const x = this.width / 2 + dx * scale;
    const y = this.height / 2 + dy * scale;
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    this.setLine(AMBER, 1.6);
    ctx.fillStyle = "rgba(255, 176, 32, 0.16)";
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, -8);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    const length = Math.hypot(dx, dy) || 1;
    const labelX = x - (dx / length) * 26;
    const labelY = y - (dy / length) * 26;
    ctx.fillStyle = AMBER;
    ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${formatRange(state.range_m)}  C ${formatSigned(state.closure_kts)}`, labelX, labelY);
  }

  banditAngles(frame) {
    this.relative.copy(frame.banditPosition).sub(frame.playerPosition).normalize();
    const right = this.relative.dot(frame.playerRight);
    const up = this.relative.dot(frame.playerUp);
    const forward = this.relative.dot(frame.playerForward);
    return {
      azimuth: Math.atan2(right, forward),
      elevation: Math.atan2(up, Math.hypot(right, forward)),
    };
  }

  drawSaBar(frame) {
    const ctx = this.ctx;
    const angles = this.banditAngles(frame);
    const width = Math.min(760, Math.max(280, this.width - 180));
    const x0 = (this.width - width) / 2;
    const centerX = this.width / 2;
    const y = 48;
    const half = width / 2;

    this.glassPanel(x0 - 12, y - 24, width + 24, 66, "rgba(77, 255, 136, 0.19)");
    ctx.fillStyle = GREEN_DIM;
    ctx.font = "600 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("SA / REL BEARING", x0, y - 13);

    this.setLine(GREEN_DIM, 1);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + width, y);
    ctx.stroke();

    for (let degrees = -180; degrees <= 180; degrees += 30) {
      const x = centerX + (degrees / 180) * half;
      const cardinal = degrees % 90 === 0;
      ctx.strokeStyle = cardinal ? GREEN : GREEN_DIM;
      ctx.beginPath();
      ctx.moveTo(x, y - (cardinal ? 6 : 3));
      ctx.lineTo(x, y + (cardinal ? 8 : 5));
      ctx.stroke();
    }

    const labels = [
      [-180, "6"],
      [-90, "9"],
      [0, "12"],
      [90, "3"],
      [180, "6"],
    ];
    ctx.fillStyle = GREEN;
    ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    for (const [degrees, label] of labels) {
      const x = centerX + (degrees / 180) * half;
      ctx.fillText(label, x, y + 22);
    }

    const sensorX = centerX + clamp(frame.sensorYaw / Math.PI, -1, 1) * half;
    ctx.fillStyle = AMBER;
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(sensorX - 6, y - 12);
    ctx.lineTo(sensorX, y - 5);
    ctx.lineTo(sensorX + 6, y - 12);
    ctx.stroke();

    const banditX = centerX + clamp(angles.azimuth / Math.PI, -1, 1) * half;
    const banditY = y - clamp(angles.elevation * RAD_TO_DEG, -45, 45) * 0.82;
    ctx.strokeStyle = frame.state.gun_window ? AMBER : GREEN;
    ctx.fillStyle = "rgba(3, 13, 20, 0.75)";
    ctx.lineWidth = 1.35;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(banditX, y);
    ctx.lineTo(banditX, banditY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.save();
    ctx.translate(banditX, banditY);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-5, -5, 10, 10);
    ctx.strokeRect(-5, -5, 10, 10);
    ctx.restore();
  }

  drawHeadingTape(state) {
    const ctx = this.ctx;
    const heading = Number(state.heading_deg) || 0;
    const width = Math.min(440, this.width * 0.42);
    const x0 = (this.width - width) / 2;
    const y = 116;
    const pixelsPerDegree = width / 100;

    ctx.fillStyle = "rgba(3, 13, 20, 0.36)";
    ctx.fillRect(x0 - 8, y - 14, width + 16, 34);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y - 14, width, 34);
    ctx.clip();
    this.setLine(GREEN_DIM, 1);
    ctx.font = "500 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const first = Math.floor((heading - 55) / 5) * 5;
    for (let mark = first; mark <= heading + 55; mark += 5) {
      const delta = ((mark - heading + 540) % 360) - 180;
      const x = this.width / 2 + delta * pixelsPerDegree;
      const major = mark % 10 === 0;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + (major ? 7 : 4));
      ctx.stroke();
      if (major) ctx.fillText(String(Math.round(wrap360(mark) / 10)).padStart(2, "0"), x, y - 12);
    }
    ctx.restore();

    ctx.fillStyle = GLASS;
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(this.width / 2 - 24, y - 17);
    ctx.lineTo(this.width / 2 + 24, y - 17);
    ctx.lineTo(this.width / 2 + 24, y + 13);
    ctx.lineTo(this.width / 2 + 6, y + 13);
    ctx.lineTo(this.width / 2, y + 19);
    ctx.lineTo(this.width / 2 - 6, y + 13);
    ctx.lineTo(this.width / 2 - 24, y + 13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = GREEN;
    ctx.font = "700 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(Math.round(wrap360(heading))).padStart(3, "0"), this.width / 2, y - 1);
  }

  drawVerticalTape({ value, x, label, step, decimals = 0, suffix = "" }) {
    const ctx = this.ctx;
    const centerY = this.height * 0.51;
    const tapeHeight = Math.min(310, this.height * 0.43);
    const halfHeight = tapeHeight / 2;
    const pixelsPerStep = 34;
    const rightSide = x > this.width / 2;

    this.glassPanel(x - 34, centerY - halfHeight - 22, 68, tapeHeight + 44, "rgba(77, 255, 136, 0.12)");
    ctx.fillStyle = GREEN_DIM;
    ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, centerY - halfHeight - 10);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 33, centerY - halfHeight, 66, tapeHeight);
    ctx.clip();
    const base = Math.floor(value / step) * step;
    for (let i = -7; i <= 7; i++) {
      const mark = base + i * step;
      const y = centerY - ((mark - value) / step) * pixelsPerStep;
      this.setLine(GREEN_DIM, 1);
      ctx.beginPath();
      if (rightSide) {
        ctx.moveTo(x - 28, y);
        ctx.lineTo(x - 19, y);
      } else {
        ctx.moveTo(x + 19, y);
        ctx.lineTo(x + 28, y);
      }
      ctx.stroke();
      ctx.fillStyle = GREEN_DIM;
      ctx.font = "500 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = rightSide ? "right" : "left";
      ctx.fillText(Math.max(0, mark).toFixed(decimals), rightSide ? x + 24 : x - 24, y);
    }
    ctx.restore();

    ctx.fillStyle = "rgba(3, 13, 20, 0.9)";
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    if (rightSide) {
      ctx.moveTo(x - 37, centerY);
      ctx.lineTo(x - 29, centerY - 8);
      ctx.lineTo(x + 31, centerY - 8);
      ctx.lineTo(x + 31, centerY + 8);
      ctx.lineTo(x - 29, centerY + 8);
    } else {
      ctx.moveTo(x + 37, centerY);
      ctx.lineTo(x + 29, centerY - 8);
      ctx.lineTo(x - 31, centerY - 8);
      ctx.lineTo(x - 31, centerY + 8);
      ctx.lineTo(x + 29, centerY + 8);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = GREEN;
    ctx.font = "700 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${value.toFixed(decimals)}${suffix}`, x, centerY + 0.5);
  }

  drawGTape(state) {
    const ctx = this.ctx;
    const x = 34;
    const y = this.height - 92;
    const width = Math.min(265, this.width * 0.28);
    const maxG = Math.max(10, Number(state.g_hardmax) || 10);
    const mapG = (g) => x + clamp((Number(g) || 0) / maxG, 0, 1) * width;
    const tierColor = state.tier === 3 ? AMBER : GREEN;

    ctx.fillStyle = GLASS;
    ctx.fillRect(x - 8, y - 24, width + 16, 50);
    ctx.fillStyle = GREEN_DIM;
    ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("G LOAD", x, y - 14);
    ctx.textAlign = "right";
    ctx.fillStyle = tierColor;
    ctx.fillText(`${(Number(state.g_actual) || 0).toFixed(1)} G`, x + width, y - 14);

    ctx.strokeStyle = GREEN_DIM;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.stroke();

    const markers = [
      [state.sustained, "S", GREEN_DIM],
      [state.g_valley, "V", GREEN],
      [state.g_maxperform, "M", AMBER],
      [state.g_hardmax, "H", RED],
    ];
    ctx.font = "600 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    for (const [g, label, color] of markers) {
      const mx = mapG(g);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx, y - 6);
      ctx.lineTo(mx, y + 6);
      ctx.stroke();
      ctx.fillText(label, mx, y + 15);
    }

    const actualX = mapG(state.g_actual);
    ctx.fillStyle = tierColor;
    ctx.beginPath();
    ctx.moveTo(actualX, y - 9);
    ctx.lineTo(actualX - 5, y - 15);
    ctx.lineTo(actualX + 5, y - 15);
    ctx.closePath();
    ctx.fill();
  }

  drawWarnings(frame) {
    const { state, now, padlock } = frame;
    const ctx = this.ctx;

    this.glassPanel(18, 18, 118, 25, padlock ? "rgba(255, 176, 32, 0.44)" : "rgba(77, 255, 136, 0.12)");
    ctx.fillStyle = padlock ? AMBER : "rgba(77, 255, 136, 0.36)";
    ctx.font = "700 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(padlock ? "◆ PADLOCK" : "◇ PADLOCK OFF", 77, 31);

    if (state.tier === 3) {
      const flash = Math.sin(now * Math.PI * 4) > -0.2;
      if (flash) {
        ctx.shadowColor = "rgba(255, 176, 32, 0.58)";
        ctx.shadowBlur = 10;
        ctx.fillStyle = AMBER;
        ctx.font = "800 19px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        ctx.textAlign = "center";
        ctx.fillText("OVERRIDE", this.width / 2, 166);
        ctx.shadowBlur = 0;
      }

      if (state.buffet) {
        ctx.fillStyle = RED;
        ctx.font = "800 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        ctx.textAlign = "center";
        ctx.fillText("BUFFET", this.width / 2, 187);
      }
    }
  }

  drawPrompt(state) {
    const cues = ["", "PULL ↓", "EASE ↑", "UNLOAD ↑", "◀ ROLL", "ROLL ▶"];
    const cue = cues[state.prompt] ?? "";
    if (!cue) return;
    const ctx = this.ctx;
    const y = this.height - 74;
    ctx.font = "800 18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const width = ctx.measureText(cue).width + 34;
    this.glassPanel((this.width - width) / 2, y - 18, width, 34, "rgba(255, 176, 32, 0.38)");
    ctx.fillStyle = AMBER;
    ctx.shadowColor = "rgba(255, 176, 32, 0.42)";
    ctx.shadowBlur = 7;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cue, this.width / 2, y);
    ctx.shadowBlur = 0;
  }

  fitText(text, maxWidth) {
    const ctx = this.ctx;
    if (ctx.measureText(text).width <= maxWidth) return text;
    let value = text;
    while (value.length > 3 && ctx.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1);
    return `${value}…`;
  }

  drawFooter(state) {
    const ctx = this.ctx;
    const y = this.height - 18;
    ctx.fillStyle = "rgba(2, 10, 15, 0.64)";
    ctx.fillRect(0, this.height - 34, this.width, 34);
    ctx.strokeStyle = "rgba(77, 255, 136, 0.16)";
    ctx.beginPath();
    ctx.moveTo(0, this.height - 34.5);
    ctx.lineTo(this.width, this.height - 34.5);
    ctx.stroke();

    ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textBaseline = "middle";
    ctx.fillStyle = GREEN;
    ctx.textAlign = "left";
    ctx.fillText(this.fitText(String(state.beat ?? "MISSION"), this.width * 0.3), 18, y);

    ctx.fillStyle = "rgba(214, 239, 226, 0.54)";
    ctx.textAlign = "center";
    ctx.fillText(this.fitText(String(state.context ?? ""), this.width * 0.34), this.width / 2, y);

    ctx.fillStyle = GREEN;
    ctx.textAlign = "right";
    ctx.fillText(`VARIANT ${state.variant === 1 ? "B" : "A"}`, this.width - 18, y);
  }

  drawLegend() {
    if (!this.legendVisible) return;
    const ctx = this.ctx;
    const panelWidth = Math.min(930, this.width - 34);
    const compact = this.width < 760;
    const panelHeight = compact ? 202 : 164;
    const x = (this.width - panelWidth) / 2;
    const y = (this.height - panelHeight) / 2;

    ctx.fillStyle = "rgba(0, 7, 12, 0.22)";
    ctx.fillRect(0, 0, this.width, this.height);
    roundedRect(ctx, x, y, panelWidth, panelHeight, 8);
    ctx.fillStyle = "rgba(3, 13, 20, 0.79)";
    ctx.fill();
    ctx.strokeStyle = "rgba(77, 255, 136, 0.23)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = GREEN;
    ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("CONTROL QUICKLOOK", this.width / 2, y + 23);

    const wideLines = [
      "DOWN / UP  PULL / PUSH   ·   LEFT / RIGHT  ROLL   ·   A / D  RUDDER   ·   W / S  THROTTLE",
      "SPACE  OVERRIDE (MAX G — CAN DEPART)   ·   F  GUNS   ·   V  PADLOCK   ·   DRAG  LOOK",
      "1–4  MISSION   ·   R  RESTART   ·   K  KNOCK-IT-OFF   ·   F1  VARIANT   ·   H  HIDE",
    ];
    const compactLines = [
      "DOWN / UP  PULL / PUSH   ·   LEFT / RIGHT  ROLL",
      "A / D  RUDDER   ·   W / S  THROTTLE",
      "SPACE  OVERRIDE (MAX G — CAN DEPART)   ·   F  GUNS",
      "V  PADLOCK   ·   DRAG  LOOK   ·   1–4  MISSION",
      "R  RESTART   ·   K  KNOCK-IT-OFF   ·   F1  VARIANT   ·   H  HIDE",
    ];
    const lines = compact ? compactLines : wideLines;
    const lineHeight = compact ? 27 : 31;
    const startY = y + (compact ? 59 : 61);
    ctx.fillStyle = "rgba(207, 244, 222, 0.68)";
    ctx.font = `${compact ? 8 : 10}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    lines.forEach((line, index) => ctx.fillText(line, this.width / 2, startY + index * lineHeight));
  }

  draw(frame) {
    const ctx = this.ctx;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawFrameWash();

    this.worldPoint.copy(frame.playerPosition).addScaledVector(frame.playerForward, 10000);
    const noseAnchor = this.project(this.worldPoint, frame.camera);

    this.drawPitchLadder(noseAnchor, frame.state);
    this.drawAirframeSymbols(noseAnchor, frame.state);
    this.drawBandit(frame);
    this.drawSaBar(frame);
    this.drawHeadingTape(frame.state);

    const tapeInset = clamp(this.width * 0.055, 48, 78);
    this.drawVerticalTape({
      value: Number(frame.state.speed_kts) || 0,
      x: tapeInset,
      label: "KTS",
      step: 20,
      decimals: 0,
    });
    this.drawVerticalTape({
      value: Number(frame.state.alt_ft) || 0,
      x: this.width - tapeInset,
      label: "ALT FT",
      step: frame.state.alt_ft > 10000 ? 1000 : 500,
      decimals: 0,
    });
    this.drawGTape(frame.state);
    this.drawWarnings(frame);
    this.drawPrompt(frame.state);
    this.drawFooter(frame.state);
    this.drawLegend();
  }
}

export function createHud(canvas) {
  return new CombatHud(canvas);
}
