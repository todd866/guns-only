import * as THREE from "./vendor/three.module.js";

const GREEN = "#4dff88";
const GREEN_DIM = "rgba(77, 255, 136, 0.56)";
const GREEN_FAINT = "rgba(77, 255, 136, 0.14)";
const AMBER = "#ffb020";
const RED = "#ff465d";
const GLASS = "rgba(2, 10, 16, 0.72)";
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

  getLayout() {
    const tapeInset = clamp(this.width * 0.055, 48, 78);
    const tapeHalfWidth = 35;
    const safePadding = 20;
    return {
      tapeInset,
      targetSafe: {
        left: tapeInset + tapeHalfWidth + safePadding,
        right: this.width - tapeInset - tapeHalfWidth - safePadding,
        top: 151,
        bottom: this.height - 112,
      },
      ladderSafe: {
        left: tapeInset + tapeHalfWidth + 10,
        right: this.width - tapeInset - tapeHalfWidth - 10,
        top: 144,
        bottom: this.height - 106,
      },
    };
  }

  drawPitchLadder(anchor, state) {
    if (!anchor || anchor.behind || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return;

    const ctx = this.ctx;
    const bank = -(Number(state.bank_deg) || 0) * DEG;
    const pitch = Number(state.pitch_deg) || 0;
    const radius = Math.max(120, this.height * 0.42);
    const pixelsPerDegree = clamp(this.height / 66, 7.2, 12.5);
    const cosBank = Math.cos(bank);
    const sinBank = Math.sin(bank);
    const layout = this.getLayout();
    const safe = layout.ladderSafe;
    const screenCenterX = this.width * 0.5;
    const screenCenterY = this.height * 0.5;
    const rotatePoint = (x, y) => ({
      x: anchor.x + x * cosBank - y * sinBank,
      y: anchor.y + x * sinBank + y * cosBank,
    });
    const segment = (x1, y1, x2, y2) => {
      const a = rotatePoint(x1, y1);
      const b = rotatePoint(x2, y2);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    };

    ctx.save();
    // Clip in screen space around the projected airframe nose. Rung centres and endpoints are
    // rotated first below, so a high-bank rung cannot be admitted by its pre-roll vertical offset.
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(safe.left, safe.top, Math.max(0, safe.right - safe.left), Math.max(0, safe.bottom - safe.top));
    ctx.clip();

    ctx.font = "500 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const firstRung = Math.max(-90, Math.ceil((pitch - 25) / 5) * 5);
    const lastRung = Math.min(90, Math.floor((pitch + 25) / 5) * 5);

    for (let rung = firstRung; rung <= lastRung; rung += 5) {
      const localY = (pitch - rung) * pixelsPerDegree;
      const rungCenter = rotatePoint(0, localY);
      const rotatedDistance = Math.hypot(rungCenter.x - anchor.x, rungCenter.y - anchor.y);
      if (rotatedDistance > radius + 1) continue;

      const major = rung % 10 === 0;
      const halfWidth = rung === 0 ? 106 : major ? 67 : 43;
      const centerGap = rung === 0 ? 29 : 20;
      ctx.strokeStyle = rung === 0 ? GREEN : GREEN_DIM;
      ctx.fillStyle = rung === 0 ? GREEN : GREEN_DIM;
      ctx.lineWidth = rung === 0 ? 1.65 : 1.05;
      ctx.setLineDash(rung < 0 ? [5, 5] : []);
      ctx.beginPath();
      segment(-halfWidth, localY, -centerGap, localY);
      segment(centerGap, localY, halfWidth, localY);
      if (major && rung !== 0) {
        const tooth = rung > 0 ? 6 : -6;
        segment(-halfWidth, localY, -halfWidth, localY + tooth);
        segment(halfWidth, localY, halfWidth, localY + tooth);
      } else if (rung === 0) {
        segment(-centerGap, localY, -centerGap + 7, localY - 5);
        segment(centerGap, localY, centerGap - 7, localY - 5);
      }
      ctx.stroke();

      if (major) {
        ctx.setLineDash([]);
        const leftLabel = rotatePoint(-halfWidth - 14, localY);
        const rightLabel = rotatePoint(halfWidth + 14, localY);
        const leftDistance = Math.hypot(leftLabel.x - screenCenterX, leftLabel.y - screenCenterY);
        const rightDistance = Math.hypot(rightLabel.x - screenCenterX, rightLabel.y - screenCenterY);
        const label = leftDistance <= rightDistance ? leftLabel : rightLabel;
        ctx.save();
        ctx.translate(label.x, label.y);
        ctx.rotate(bank);
        ctx.fillText(String(Math.abs(rung)), 0, 0.5);
        ctx.restore();
      }
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawAirframeSymbols(anchor, state) {
    if (!anchor || anchor.behind || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return;
    const ctx = this.ctx;
    const bank = (Number(state.bank_deg) || 0) * DEG;

    ctx.save();
    ctx.translate(anchor.x, anchor.y);
    ctx.rotate(-bank);
    this.setLine(GREEN, 1.15);
    ctx.shadowColor = "rgba(77, 255, 136, 0.3)";
    ctx.shadowBlur = 3;

    // The kernel exposes a single physical forward/velocity vector, so the compact FPM and
    // boresight share one projected axis without inventing a second world-up-derived vector.
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.moveTo(-16, 0);
    ctx.lineTo(-5, 0);
    ctx.moveTo(5, 0);
    ctx.lineTo(16, 0);
    ctx.moveTo(0, -5);
    ctx.lineTo(0, -11);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-6, -18);
    ctx.lineTo(0, -22);
    ctx.lineTo(6, -18);
    ctx.moveTo(-8, -22);
    ctx.lineTo(-3, -22);
    ctx.moveTo(3, -22);
    ctx.lineTo(8, -22);
    ctx.stroke();

    if (state.gun_window) {
      ctx.strokeStyle = AMBER;
      ctx.shadowColor = "rgba(255, 176, 32, 0.48)";
      ctx.shadowBlur = 4;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2;
        ctx.moveTo(Math.cos(angle) * 21, Math.sin(angle) * 21);
        ctx.lineTo(Math.cos(angle) * 26, Math.sin(angle) * 26);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  drawBandit(frame) {
    const { state, camera, banditPosition } = frame;
    const projection = this.project(banditPosition, camera);
    const safe = this.getLayout().targetSafe;
    const color = state.gun_window ? AMBER : GREEN;
    const ctx = this.ctx;
    const size = state.gun_window ? 32 : 27;
    const inside = !projection.behind
      && projection.x >= safe.left + size
      && projection.x <= safe.right - size
      && projection.y >= safe.top + size
      && projection.y <= safe.bottom - size;

    if (inside) {
      const corner = 8;
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

      const lines = [
        formatRange(state.range_m),
        `C ${formatSigned(state.closure_kts)} KT`,
        `AOFF ${Math.round(Number(state.angle_off_deg) || 0)}°`,
      ];
      ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
      const textHeight = 35;
      const rightX = projection.x + size + 8;
      const useRight = rightX + textWidth + 8 <= safe.right;
      const textX = useRight ? rightX : projection.x - size - 8 - textWidth;
      const textY = clamp(projection.y - 17, safe.top, safe.bottom - textHeight);
      ctx.fillStyle = "rgba(1, 8, 12, 0.68)";
      ctx.fillRect(textX - 4, textY - 2, textWidth + 8, textHeight + 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = color;
      ctx.fillText(lines[0], textX, textY);
      ctx.fillStyle = GREEN_DIM;
      ctx.fillText(lines[1], textX, textY + 12);
      ctx.fillText(lines[2], textX, textY + 24);
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

    const safeCenterX = (safe.left + safe.right) * 0.5;
    const safeCenterY = (safe.top + safe.bottom) * 0.5;
    const halfWidth = (safe.right - safe.left) * 0.5;
    const halfHeight = (safe.bottom - safe.top) * 0.5;
    const scale = Math.min(
      halfWidth / Math.max(Math.abs(dx), 0.0001),
      halfHeight / Math.max(Math.abs(dy), 0.0001),
    );
    const x = safeCenterX + dx * scale;
    const y = safeCenterY + dy * scale;
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
    const labelText = `${formatRange(state.range_m)}  C ${formatSigned(state.closure_kts)}  AOFF ${Math.round(Number(state.angle_off_deg) || 0)}°`;
    ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const labelWidth = ctx.measureText(labelText).width;
    const labelX = clamp(x - (dx / length) * 34, safe.left + labelWidth * 0.5 + 5, safe.right - labelWidth * 0.5 - 5);
    const labelY = clamp(y - (dy / length) * 30, safe.top + 8, safe.bottom - 8);
    ctx.fillStyle = "rgba(1, 8, 12, 0.68)";
    ctx.fillRect(labelX - labelWidth * 0.5 - 4, labelY - 7, labelWidth + 8, 14);
    ctx.fillStyle = AMBER;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(labelText, labelX, labelY);
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
    const y = 47;
    const half = width / 2;

    const wash = ctx.createLinearGradient(0, y - 25, 0, y + 34);
    wash.addColorStop(0, "rgba(1, 9, 14, 0)");
    wash.addColorStop(0.36, "rgba(1, 9, 14, 0.48)");
    wash.addColorStop(1, "rgba(1, 9, 14, 0)");
    ctx.fillStyle = wash;
    ctx.fillRect(x0 - 12, y - 25, width + 24, 62);
    ctx.fillStyle = GREEN_DIM;
    ctx.font = "600 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("SA / REL BEARING", x0, y - 13);

    this.setLine("rgba(77, 255, 136, 0.68)", 1);
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
    const y = 113;
    const pixelsPerDegree = width / 100;

    ctx.fillStyle = "rgba(2, 10, 16, 0.3)";
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

  // `floor` omits rungs below a physical limit. Without it the label was clamped with
  // Math.max(0, mark) while the rung still drew, so sub-sea-level altitudes rendered as a
  // stack of identical "0"s — a tape that reads plausible while saying nothing.
  drawVerticalTape({ value, x, label, step, decimals = 0, suffix = "", floor = null, trend = 0 }) {
    const ctx = this.ctx;
    const centerY = this.height * 0.51;
    const tapeHeight = Math.min(310, this.height * 0.43);
    const halfHeight = tapeHeight / 2;
    const pixelsPerStep = 34;
    const rightSide = x > this.width / 2;
    const pxPerUnit = pixelsPerStep / step;

    const wash = ctx.createLinearGradient(x - 34, 0, x + 34, 0);
    if (rightSide) {
      wash.addColorStop(0, "rgba(1, 9, 14, 0)");
      wash.addColorStop(1, "rgba(1, 9, 14, 0.58)");
    } else {
      wash.addColorStop(0, "rgba(1, 9, 14, 0.58)");
      wash.addColorStop(1, "rgba(1, 9, 14, 0)");
    }
    ctx.fillStyle = wash;
    ctx.fillRect(x - 34, centerY - halfHeight - 22, 68, tapeHeight + 44);
    ctx.fillStyle = GREEN_DIM;
    ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, centerY - halfHeight - 10);

    ctx.strokeStyle = "rgba(77, 255, 136, 0.24)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const spineX = rightSide ? x - 32 : x + 32;
    ctx.moveTo(spineX, centerY - halfHeight);
    ctx.lineTo(spineX, centerY + halfHeight);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 33, centerY - halfHeight, 66, tapeHeight);
    ctx.clip();
    const base = Math.floor(value / step) * step;
    for (let i = -7; i <= 7; i++) {
      const mark = base + i * step;
      if (floor !== null && mark < floor) continue;
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
      ctx.fillText(mark.toFixed(decimals), rightSide ? x + 24 : x - 24, y);
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

    // Trend caret: a vertical line from the current value to where the value is heading (value +
    // trend over the lookahead), clamped to the tape. Amber, so accel/decel reads at a glance.
    if (Math.abs(trend) > 0.5) {
      const spineX = rightSide ? x - 32 : x + 32;
      const trendY = clamp(centerY - trend * pxPerUnit, centerY - halfHeight, centerY + halfHeight);
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(spineX, centerY);
      ctx.lineTo(spineX, trendY);
      ctx.stroke();
      // arrowhead
      const dir = trend > 0 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(spineX, trendY);
      ctx.lineTo(spineX - 3, trendY - dir * 4);
      ctx.lineTo(spineX + 3, trendY - dir * 4);
      ctx.closePath();
      ctx.fillStyle = AMBER;
      ctx.fill();
    }
  }

  drawGTape(state) {
    const ctx = this.ctx;
    const x = 28;
    const y = this.height - 88;
    const width = Math.min(258, this.width * 0.27);
    const maxG = Math.max(10, Number(state.g_hardmax) || 10);
    const mapG = (g) => x + clamp((Number(g) || 0) / maxG, 0, 1) * width;
    const tierColor = state.tier === 3 ? AMBER : GREEN;

    const wash = ctx.createLinearGradient(x - 8, 0, x + width + 8, 0);
    wash.addColorStop(0, "rgba(1, 9, 14, 0.62)");
    wash.addColorStop(0.78, "rgba(1, 9, 14, 0.36)");
    wash.addColorStop(1, "rgba(1, 9, 14, 0)");
    ctx.fillStyle = wash;
    ctx.fillRect(x - 8, y - 31, width + 16, 58);
    ctx.fillStyle = GREEN_DIM;
    ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("G LOAD", x, y - 20);
    ctx.textAlign = "right";
    ctx.fillStyle = tierColor;
    ctx.fillText(`${(Number(state.g_actual) || 0).toFixed(1)} G`, x + width, y - 20);

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
    ].map(([g, label, color]) => ({ x: mapG(g), label, color }))
      .sort((a, b) => a.x - b.x);
    const minLabelGap = 17;
    const labelPositions = markers.map((marker) => marker.x);
    for (let i = 1; i < labelPositions.length; i++) {
      labelPositions[i] = Math.max(labelPositions[i], labelPositions[i - 1] + minLabelGap);
    }
    const lastLabelPosition = labelPositions[labelPositions.length - 1];
    if (lastLabelPosition > x + width) {
      const overflow = lastLabelPosition - (x + width);
      for (let i = 0; i < labelPositions.length; i++) labelPositions[i] -= overflow;
      for (let i = labelPositions.length - 2; i >= 0; i--) {
        labelPositions[i] = Math.min(labelPositions[i], labelPositions[i + 1] - minLabelGap);
      }
    }
    ctx.font = "600 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    markers.forEach((marker, index) => {
      const labelX = clamp(labelPositions[index], x, x + width);
      ctx.strokeStyle = marker.color;
      ctx.fillStyle = marker.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(marker.x, y - 6);
      ctx.lineTo(marker.x, y + 6);
      ctx.moveTo(marker.x, y + 7);
      ctx.lineTo(labelX, y + 13);
      ctx.stroke();
      ctx.fillText(marker.label, labelX, y + 20);
    });

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

    ctx.fillStyle = "rgba(1, 9, 14, 0.44)";
    ctx.fillRect(18, 20, 118, 22);
    ctx.strokeStyle = padlock ? "rgba(255, 176, 32, 0.6)" : "rgba(77, 255, 136, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(18, 20);
    ctx.lineTo(18, 42);
    ctx.lineTo(26, 42);
    ctx.moveTo(128, 20);
    ctx.lineTo(136, 20);
    ctx.lineTo(136, 42);
    ctx.stroke();
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

  // A fight ending, and the low-altitude caution that precedes one. Nothing drew these before:
  // the sim had no ground, so a hard pull could fly the aircraft to -10,679 ft and keep going
  // with the world rendered black and the HUD still cheerfully reading out closure.
  drawEnding(frame) {
    const { state, now } = frame;
    const ctx = this.ctx;
    const alt = Number(state.alt_ft) || 0;

    // Deck caution: amber and quiet until it isn't. Silent above the deck so it means something.
    if (!state.frozen && state.below_deck) {
      const urgent = alt < 2000;
      if (!urgent || Math.sin(now * Math.PI * 5) > -0.2) {
        ctx.fillStyle = urgent ? RED : AMBER;
        ctx.font = "800 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(urgent ? "PULL UP" : "DECK", this.width / 2, this.height - 104);
      }
    }

    if (!state.frozen) return;

    // Carrier recovery outcome takes precedence over the generic impact banner.
    const rec = state.recovery;
    let title = state.below_ground ? "IMPACT" : "KNOCK IT OFF";
    let good = false;
    if (rec === "Trap") { title = "TRAP"; good = true; }
    else if (rec === "RampStrike") title = "RAMP STRIKE";
    else if (rec === "InTheWater") title = "IN THE WATER";

    const impact = state.below_ground || rec === "RampStrike" || rec === "InTheWater";
    const accent = good ? GREEN : (impact ? RED : AMBER);
    ctx.save();
    ctx.fillStyle = good ? "rgba(2, 20, 10, 0.5)" : (impact ? "rgba(28, 2, 6, 0.58)" : "rgba(1, 9, 14, 0.5)");
    ctx.fillRect(0, 0, this.width, this.height);

    const w = 360;
    const h = 92;
    const x = (this.width - w) / 2;
    const y = this.height / 2 - h / 2;
    ctx.fillStyle = GLASS;
    roundedRect(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = accent;
    ctx.font = "800 22px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText(title, this.width / 2, y + 30);

    ctx.fillStyle = GREEN_DIM;
    ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText(
      impact
        ? `${Math.round(Number(state.speed_kts) || 0)} KTS · ${Math.round(Number(state.g_actual) || 0)} G · ${Math.round(Number(state.pitch_deg) || 0)}° NOSE LOW`
        : "FIGHT TERMINATED",
      this.width / 2,
      y + 55
    );
    ctx.fillStyle = GREEN;
    ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText("R  RESTART", this.width / 2, y + 76);
    ctx.restore();
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

  drawThrottle(state) {
    const thr = Number(state.throttle);
    if (!Number.isFinite(thr)) return;
    const ctx = this.ctx;
    const w = 130, h = 12;
    const x = 30, y = this.height - 132;
    ctx.fillStyle = "rgba(1, 9, 14, 0.5)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(77, 255, 136, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = thr >= 0.99 ? AMBER : GREEN;
    ctx.fillRect(x + 1, y + 1, (w - 2) * clamp(thr, 0, 1), h - 2);
    ctx.strokeStyle = "rgba(77, 255, 136, 0.4)";
    for (const d of [0.55, 0.85]) {
      const tx = x + w * d;
      ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx, y + h); ctx.stroke();
    }
    ctx.fillStyle = GREEN_DIM;
    ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const label = thr <= 0.01 ? "IDLE" : thr >= 0.99 ? "MIL" : `${Math.round(thr * 100)}%`;
    ctx.fillText(`THROTTLE  ${label}   ·  W / S`, x, y - 8);
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

  drawLegend(frozen = false) {
    if (!this.legendVisible || frozen) return;
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

    // Speed trend: smoothed dV/dt, projected ~6 s ahead (the classic acceleration caret).
    const spd = Number(frame.state.speed_kts) || 0;
    const dt = Math.max(1e-3, Number(frame.dt) || 1 / 60);
    if (this._prevSpeed === undefined) this._prevSpeed = spd;
    const inst = (spd - this._prevSpeed) / dt;                 // kts/s
    this._speedRate = (this._speedRate || 0) * 0.92 + inst * 0.08;
    this._prevSpeed = spd;
    const speedTrend = clamp(this._speedRate * 6, -60, 60);    // project 6 s, cap for tape sanity

    const tapeInset = this.getLayout().tapeInset;
    this.drawVerticalTape({
      value: spd,
      x: tapeInset,
      label: "KTS",
      floor: 0,
      step: 20,
      decimals: 0,
      trend: speedTrend,
    });
    this.drawVerticalTape({
      value: Number(frame.state.alt_ft) || 0,
      x: this.width - tapeInset,
      label: "ALT FT",
      floor: 0,
      step: frame.state.alt_ft > 10000 ? 1000 : 500,
      decimals: 0,
    });
    this.drawGTape(frame.state);
    this.drawThrottle(frame.state);
    this.drawWarnings(frame);
    this.drawPrompt(frame.state);
    this.drawFooter(frame.state);
    this.drawLegend(Boolean(frame.state.frozen));
    this.drawEnding(frame);
  }
}

export function createHud(canvas) {
  return new CombatHud(canvas);
}
