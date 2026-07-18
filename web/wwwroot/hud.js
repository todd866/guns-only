import * as THREE from "./vendor/three.module.js";

const GREEN = "#4dff88";
const GREEN_DIM = "rgba(77, 255, 136, 0.56)";
const GREEN_FAINT = "rgba(77, 255, 136, 0.14)";
const AMBER = "#ffb020";
const RED = "#ff465d";
const GLASS = "rgba(2, 10, 16, 0.72)";
const DEG = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const DEFAULT_FUEL_CAPACITY_LB = 3000;
const DEFAULT_BINGO_FUEL_LB = 800;

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

function hudMode(state) {
  switch (state.mode) {
    case "WAVE-OFF":
    case "APPROACH":
    case "FREE":
    case "ARRESTED":
    case "STOPPED":
      return state.mode;
    default:
      break;
  }
  if (state.wave_off === true) return "WAVE-OFF";
  return state.approach === true ? "APPROACH" : "FREE";
}

function fuelCapacityLb(state) {
  const capacity = Number(state.fuel_capacity_lb);
  return Number.isFinite(capacity) && capacity > 0 ? capacity : DEFAULT_FUEL_CAPACITY_LB;
}

function bingoFuelLb(state) {
  const bingo = Number(state.fuel_bingo_lb);
  return Number.isFinite(bingo) && bingo >= 0 ? bingo : DEFAULT_BINGO_FUEL_LB;
}

function lsoToken(call) {
  switch (call) {
    case "ON THE BALL": return "BALL";
    case "YOU'RE LOW": return "LOW";
    case "YOU'RE HIGH": return "HIGH";
    case "COME LEFT": return "LEFT";
    case "COME RIGHT": return "RIGHT";
    case "WAVE OFF, WAVE OFF": return "WAVE OFF";
    default: return call;
  }
}

function isApproachMode(state) {
  const mode = hudMode(state);
  return mode === "APPROACH" || mode === "WAVE-OFF";
}

function banditIsAlive(state) {
  return state.bandit_alive !== false && state.fight !== "Splash";
}

function hasGunSolution(state) {
  return state.gun_solution === true;
}

function isFightHudActive(state) {
  if (!banditIsAlive(state)) return false;
  return state.carrier !== true || hudMode(state) === "FREE" || hudMode(state) === "WAVE-OFF";
}

class CombatHud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;
    this.legendVisible = true;
    this.touchMode = false;
    this.safeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

    this.worldPoint = new THREE.Vector3();
    this.ndc = new THREE.Vector3();
    this.cameraPoint = new THREE.Vector3();
    this.relative = new THREE.Vector3();
    this.banditAnglesValue = { azimuth: 0, elevation: 0 };
    this.projectionA = { x: 0, y: 0, ndcX: 0, ndcY: 0, cameraX: 0, cameraY: 0, cameraZ: 0, behind: false };
    this.noseProjection = { x: 0, y: 0, ndcX: 0, ndcY: 0, cameraX: 0, cameraY: 0, cameraZ: 0, behind: false };
    this.audioEnabled = true;
    this._audioCtx = null;
    this._gunAudioGain = null;
    this._gunAudioFiring = false;
    this._lastHudHits = 0;
    this._hitFlashUntil = -1;
    this._difficultySignature = null;
    this._difficultyCueUntil = -1;
  }

  resize(width, height, pixelRatio, safeInsets = null) {
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    if (safeInsets) this.safeInsets = safeInsets;
    this.canvas.width = Math.max(1, Math.round(width * pixelRatio));
    this.canvas.height = Math.max(1, Math.round(height * pixelRatio));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  toggleLegend() {
    this.legendVisible = !this.legendVisible;
  }

  setTouchMode(enabled) {
    this.touchMode = Boolean(enabled);
    if (this.touchMode) this.legendVisible = false;
  }

  armAudio() {
    if (!this.audioEnabled) return;
    if (!this._audioCtx) {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) return;
      const audio = new AudioContextClass();
      const master = audio.createGain();
      const filter = audio.createBiquadFilter();
      const oscillator = audio.createOscillator();
      const noise = audio.createBufferSource();
      const buffer = audio.createBuffer(1, 4096, audio.sampleRate);
      const samples = buffer.getChannelData(0);
      let seed = 0x47554e53;
      for (let i = 0; i < samples.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        samples[i] = ((seed / 0xffffffff) * 2 - 1) * 0.24;
      }
      oscillator.type = "sawtooth";
      oscillator.frequency.value = 63;
      noise.buffer = buffer;
      noise.loop = true;
      filter.type = "lowpass";
      filter.frequency.value = 820;
      filter.Q.value = 0.72;
      master.gain.value = 0;
      oscillator.connect(filter);
      noise.connect(filter);
      filter.connect(master);
      master.connect(audio.destination);
      oscillator.start();
      noise.start();
      this._audioCtx = audio;
      this._gunAudioGain = master;
    }
    if (this._audioCtx.state === "suspended") this._audioCtx.resume().catch(() => {});
  }

  toggleAudio() {
    this.audioEnabled = !this.audioEnabled;
    this._gunAudioFiring = false;
    if (!this.audioEnabled && this._gunAudioGain && this._audioCtx)
      this._gunAudioGain.gain.setTargetAtTime(0, this._audioCtx.currentTime, 0.012);
    return this.audioEnabled;
  }

  updateGunAudio(frame) {
    const firing = this.audioEnabled && frame.triggerHeld && frame.state.gun_firing === true
      && !frame.state.frozen && (Number(frame.state.ammo) || 0) > 0;
    if (firing && !this._audioCtx) this.armAudio();
    if (!this._gunAudioGain || !this._audioCtx) return;
    if (firing === this._gunAudioFiring) return;
    this._gunAudioFiring = firing;
    const target = firing ? 0.028 : 0;
    this._gunAudioGain.gain.setTargetAtTime(target, this._audioCtx.currentTime, firing ? 0.008 : 0.018);
  }

  project(world, camera, out = this.projectionA) {
    this.cameraPoint.copy(world).applyMatrix4(camera.matrixWorldInverse);
    const behind = this.cameraPoint.z >= -0.01;
    this.ndc.copy(world).project(camera);
    out.x = (this.ndc.x * 0.5 + 0.5) * this.width;
    out.y = (-this.ndc.y * 0.5 + 0.5) * this.height;
    out.ndcX = this.ndc.x;
    out.ndcY = this.ndc.y;
    out.cameraX = this.cameraPoint.x;
    out.cameraY = this.cameraPoint.y;
    out.cameraZ = this.cameraPoint.z;
    out.behind = behind;
    return out;
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
    const sideSafe = Math.max(this.safeInsets.left, this.safeInsets.right);
    const tapeInset = sideSafe > 0
      ? clamp(Math.max(this.width * 0.055 + sideSafe, sideSafe + 56), 48, 140)
      : clamp(this.width * 0.055, 48, 78);
    const tapeHalfWidth = 35;
    const safePadding = 20;
    return {
      tapeInset,
      targetSafe: {
        left: tapeInset + tapeHalfWidth + safePadding,
        right: this.width - tapeInset - tapeHalfWidth - safePadding,
        top: 151,
        bottom: this.height - this.safeInsets.bottom - 112,
      },
      ladderSafe: {
        left: tapeInset + tapeHalfWidth + 10,
        right: this.width - tapeInset - tapeHalfWidth - 10,
        top: 144,
        bottom: this.height - this.safeInsets.bottom - 106,
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

    // The camera is bolted to the BODY axis now, so screen centre is the WATERLINE / gun line (the
    // nose), and the velocity vector sits angle-of-attack BELOW it. Drawing both is what restores
    // "pitch authority": a pull raises the waterline against the world even at CLmax, while the FPM
    // shows the jet still isn't climbing — the back-side sight picture, made legible.
    const ppd = clamp(this.height / 66, 7.2, 12.5);
    const aoaPx = (Number(state.aoa_deg) || 0) * ppd;   // velocity vector is AoA below the waterline

    // WATERLINE / boresight at screen centre (the nose = gun line). The gun window lives here,
    // because the gun points along the body axis, not the flight path.
    ctx.beginPath();
    ctx.moveTo(-15, 0);
    ctx.lineTo(-6, 0);
    ctx.lineTo(0, 5);
    ctx.lineTo(6, 0);
    ctx.lineTo(15, 0);
    ctx.stroke();

    // FLIGHT-PATH MARKER (velocity vector): AoA below the waterline — where the jet is ACTUALLY
    // going. Fly IT onto the ball. On the back side a pull raises the waterline but the FPM barely
    // moves ("nose up, still sinking → add power").
    ctx.save();
    ctx.translate(0, aoaPx);
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.moveTo(-16, 0);
    ctx.lineTo(-5, 0);
    ctx.moveTo(5, 0);
    ctx.lineTo(16, 0);
    ctx.moveTo(0, -5);
    ctx.lineTo(0, -11);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  drawGunSight(frame, anchor) {
    if (!isFightHudActive(frame.state)
      || !anchor || anchor.behind || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return;

    const { state, triggerHeld, camera, leadPipper, now } = frame;
    const leadValid = state.lead_valid === true && leadPipper;
    const solution = hasGunSolution(state);
    const hits = Number(state.hits) || 0;
    if (hits < this._lastHudHits) this._lastHudHits = hits;
    if (hits > this._lastHudHits) this._hitFlashUntil = now + 0.34;
    this._lastHudHits = hits;
    const hitFlash = now < this._hitFlashUntil;
    const progress = clamp(Number(state.kill_progress) || 0, 0, 1);
    const ctx = this.ctx;

    // Fixed boresight: the barrels point here. This never chases the target or changes meaning.
    ctx.save();
    ctx.translate(anchor.x, anchor.y);
    this.setLine("rgba(77, 255, 136, 0.72)", 1.2);
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2;
      ctx.moveTo(Math.cos(angle) * 18, Math.sin(angle) * 18);
      ctx.lineTo(Math.cos(angle) * 35, Math.sin(angle) * 35);
    }
    ctx.stroke();
    ctx.restore();

    let pipperX = anchor.x;
    let pipperY = anchor.y;
    let pipperVisible = false;
    if (leadValid) {
      const leadProjection = this.project(leadPipper, camera, this.projectionA);
      if (!leadProjection.behind && Number.isFinite(leadProjection.x)
        && Number.isFinite(leadProjection.y)) {
        // Draw the exact world point emitted by GunKill through the same live PerspectiveCamera
        // that rendered the FPV. The old reciprocal screen-space offset put the visible cue on the
        // opposite side of the required gun line when a pilot steered the nose toward it.
        pipperX = leadProjection.x;
        pipperY = leadProjection.y;
        pipperVisible = pipperX > -50 && pipperX < this.width + 50
          && pipperY > -50 && pipperY < this.height + 50;
      }
    }

    if (pipperVisible) {
      const wasted = triggerHeld && !solution;
      const color = hitFlash ? GREEN : wasted ? RED : solution ? GREEN : AMBER;
      ctx.save();
      ctx.strokeStyle = "rgba(255, 176, 32, 0.30)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(anchor.x, anchor.y);
      ctx.lineTo(pipperX, pipperY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.translate(pipperX, pipperY);
      this.setLine(color, solution || triggerHeld ? 2.0 : 1.45);
      ctx.shadowColor = hitFlash ? "rgba(77, 255, 136, 0.8)" : "rgba(255, 176, 32, 0.52)";
      ctx.shadowBlur = solution || hitFlash ? 9 : 4;
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.moveTo(-25, 0); ctx.lineTo(-13, 0);
      ctx.moveTo(13, 0); ctx.lineTo(25, 0);
      ctx.moveTo(0, -25); ctx.lineTo(0, -13);
      ctx.moveTo(0, 13); ctx.lineTo(0, 25);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = "800 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(hitFlash ? "HIT" : solution ? "SHOOT" : "LEAD", 0, -28);
      ctx.restore();
    }

    const ammo = Math.max(0, Number(state.ammo) || 0);
    const cue = hitFlash ? `HIT ${hits}`
      : ammo === 0 ? "GUN EMPTY"
      : !leadValid ? "NO LEAD"
      : triggerHeld && !solution ? "CHECK FIRE"
      : solution ? "SHOOT" : "LEAD";
    const cueColor = hitFlash || solution ? GREEN
      : ammo === 0 || (triggerHeld && !solution) ? RED : AMBER;
    ctx.save();
    ctx.font = "800 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const cueWidth = Math.max(132, ctx.measureText(cue).width + 20);
    const cueX = this.width / 2 - cueWidth / 2;
    const cueY = Math.max(204, this.safeInsets.top + 202);
    ctx.fillStyle = "rgba(1, 8, 12, 0.76)";
    ctx.fillRect(cueX, cueY, cueWidth, progress > 0 ? 43 : 29);
    ctx.strokeStyle = "rgba(255, 176, 32, 0.34)";
    ctx.strokeRect(cueX, cueY, cueWidth, progress > 0 ? 43 : 29);
    ctx.fillStyle = cueColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cue, this.width / 2, cueY + 10);
    ctx.fillStyle = GREEN_DIM;
    ctx.font = "700 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText(
      `GUN ${String(ammo).padStart(3, "0")} · H ${hits}`,
      this.width / 2,
      cueY + 21,
    );
    if (progress > 0) {
      const barWidth = cueWidth - 18;
      const barX = cueX + 9;
      const barY = cueY + 34;
      ctx.fillStyle = "rgba(1, 8, 12, 0.78)";
      ctx.fillRect(barX, barY, barWidth, 4);
      ctx.fillStyle = "rgba(77, 255, 136, 0.16)";
      ctx.fillRect(barX, barY, barWidth, 4);
      ctx.fillStyle = GREEN;
      ctx.fillRect(barX, barY, barWidth * progress, 4);
    }
    ctx.restore();
  }

  // The carrier touchdown aim point: an amber diamond on the deck you fly the VELOCITY VECTOR onto.
  // The nose points long (on-speed high-alpha attitude); the flight path is the truth. Put the FPM
  // on the diamond and you track to the wires — the reference the pilot otherwise lacks.
  drawAimPoint(frame, noseAnchor) {
    const { aimPoint, camera, state } = frame;
    if (!isApproachMode(state) || !aimPoint || !noseAnchor || noseAnchor.behind) return;
    const p = this.project(aimPoint, camera);
    if (p.behind || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;

    const ctx = this.ctx;
    // Where the velocity-vector marker currently sits: AoA below the waterline, rolled with bank
    // (matches drawAirframeSymbols so the deviation line lands on the drawn FPM).
    const ppd = clamp(this.height / 66, 7.2, 12.5);
    const aoaPx = (Number(state.aoa_deg) || 0) * ppd;
    const bank = (Number(state.bank_deg) || 0) * DEG;
    const fpmX = noseAnchor.x + Math.sin(bank) * aoaPx;
    const fpmY = noseAnchor.y + Math.cos(bank) * aoaPx;

    ctx.save();
    // Dashed deviation line from the flight path to the aim point — fly it to zero.
    ctx.strokeStyle = "rgba(255, 176, 32, 0.45)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(fpmX, fpmY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // The touchdown diamond.
    ctx.strokeStyle = AMBER;
    ctx.fillStyle = AMBER;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = "rgba(255, 176, 32, 0.5)";
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 9);
    ctx.lineTo(p.x + 9, p.y);
    ctx.lineTo(p.x, p.y + 9);
    ctx.lineTo(p.x - 9, p.y);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  drawBandit(frame) {
    const { state, camera, banditPosition } = frame;
    if (!isFightHudActive(state)) return;
    const angles = this.banditAngles(frame);
    const projection = this.project(banditPosition, camera);
    const safe = this.getLayout().targetSafe;
    const solution = hasGunSolution(state);
    const color = solution ? AMBER : GREEN;
    const ctx = this.ctx;
    const size = solution ? 32 : 27;
    const inside = !projection.behind
      && projection.x >= safe.left + size
      && projection.x <= safe.right - size
      && projection.y >= safe.top + size
      && projection.y <= safe.bottom - size;

    if (inside) {
      const corner = 8;
      this.setLine(color, solution ? 1.8 : 1.35);
      ctx.shadowColor = solution ? "rgba(255, 176, 32, 0.46)" : "rgba(77, 255, 136, 0.34)";
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

      ctx.fillStyle = color;
      ctx.font = "800 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(solution ? "SHOOT" : "BOGEY", projection.x, projection.y - size - 5);

      const rangeLine = formatRange(state.range_m);
      const closureLine = `C ${formatSigned(state.closure_kts)} KT`;
      const angleLine = `AOFF ${Math.round(Number(state.angle_off_deg) || 0)}°`;
      ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      const textWidth = Math.max(
        ctx.measureText(rangeLine).width,
        ctx.measureText(closureLine).width,
        ctx.measureText(angleLine).width,
      );
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
      ctx.fillText(rangeLine, textX, textY);
      ctx.fillStyle = GREEN_DIM;
      ctx.fillText(closureLine, textX, textY + 12);
      ctx.fillText(angleLine, textX, textY + 24);

      const progress = clamp(Number(state.kill_progress) || 0, 0, 1);
      if (progress > 0) {
        const barWidth = size * 2;
        const barX = projection.x - size;
        const barY = projection.y + size + 5;
        ctx.fillStyle = "rgba(1, 8, 12, 0.78)";
        ctx.fillRect(barX - 2, barY - 2, barWidth + 4, 7);
        ctx.fillStyle = "rgba(77, 255, 136, 0.2)";
        ctx.fillRect(barX, barY, barWidth, 3);
        ctx.fillStyle = solution ? AMBER : GREEN;
        ctx.fillRect(barX, barY, barWidth * progress, 3);
      }
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
    const azimuth = angles.azimuth * RAD_TO_DEG;
    const fullLabel = `${Math.abs(azimuth) > 150 ? "6 · " : ""}${formatRange(state.range_m)} · C ${formatSigned(state.closure_kts)} · AO ${Math.round(Number(state.angle_off_deg) || 0)}°`;
    ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const labelText = this.fitText(fullLabel, Math.max(60, safe.right - safe.left - 12));
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
    this.banditAnglesValue.azimuth = Math.atan2(right, forward);
    this.banditAnglesValue.elevation = Math.atan2(up, Math.hypot(right, forward));
    return this.banditAnglesValue;
  }

  drawSaBar(frame) {
    if (!isFightHudActive(frame.state)) return;
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
    const azimuthDeg = Math.round(angles.azimuth * RAD_TO_DEG);
    const relativeBearing = Math.abs(azimuthDeg) < 2
      ? "RB 0°"
      : `RB ${azimuthDeg < 0 ? "L" : "R"}${Math.abs(azimuthDeg)}°`;
    ctx.fillText(
      this.fitText(`BOGEY · ${relativeBearing} · E ${formatSigned(Math.round(angles.elevation * RAD_TO_DEG))}°`, width),
      x0,
      y - 13,
    );

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
    ctx.strokeStyle = hasGunSolution(frame.state) ? AMBER : GREEN;
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

  drawMode(state) {
    const ctx = this.ctx;
    const mode = hudMode(state);
    const waveOff = mode === "WAVE-OFF";
    const approach = mode === "APPROACH";
    const rolling = state.arrest_phase === "ARRESTED";
    const stopped = state.arrest_phase === "STOPPED";
    const carrierFight = state.carrier === true && (mode === "FREE" || waveOff) && banditIsAlive(state);
    const title = rolling
      ? `TRAP · WIRE ${Number(state.wire) || "—"}`
      : stopped ? "TRAP · STOP" : waveOff
      ? "WAVE OFF"
      : approach ? "APPROACH" : carrierFight ? "FIGHT" : "FREE";
    const accent = waveOff ? RED : rolling ? AMBER : approach || stopped ? GREEN : carrierFight ? AMBER : "rgba(77, 255, 136, 0.46)";
    const width = Math.min(250, this.width - 34);
    const height = 31;
    const x = (this.width - width) / 2;
    const y = Math.max(143, this.safeInsets.top + 138);

    ctx.save();
    this.glassPanel(x, y, width, height, waveOff ? "rgba(255, 70, 93, 0.72)" : accent);
    if (waveOff) {
      ctx.fillStyle = Math.sin((Number(state.t) || 0) * Math.PI * 4) > -0.35
        ? "rgba(255, 70, 93, 0.13)"
        : "rgba(255, 176, 32, 0.08)";
      roundedRect(ctx, x + 1, y + 1, width - 2, height - 2, 4);
      ctx.fill();
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = accent;
    ctx.font = "800 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText(title, this.width / 2, y + height / 2 + 0.5);
    ctx.restore();
  }

  // One compact conditions line. It stays glanceable for the pass, while a restart that selects
  // different deterministic weather briefly calls attention to the shift without adding a new
  // persistent instrument or modal briefing.
  drawDifficulty(state) {
    if (state.carrier !== true) return;
    const level = Math.max(0, Math.round(Number(state.difficulty_level) || 0));
    const attempt = Math.max(1, Math.round(Number(state.difficulty_attempt) || 1));
    const label = String(state.difficulty_label || "CALM");
    const signature = `${attempt}:${level}:${label}`;
    const simTime = Number(state.t) || 0;
    if (signature !== this._difficultySignature) {
      if (this._difficultySignature !== null) this._difficultyCueUntil = simTime + 2.4;
      this._difficultySignature = signature;
    }

    const shifted = simTime < this._difficultyCueUntil;
    const status = state.difficulty_eased === true ? "EASED"
      : state.difficulty_spike === true ? "CHALLENGE"
      : "";
    const text = `${shifted ? "CONDITIONS SHIFT · " : ""}L${level} · ${label}${status ? ` · ${status}` : ""}`;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = "700 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const width = Math.min(this.width - 34, Math.max(112, ctx.measureText(text).width + 24));
    const height = 21;
    const x = (this.width - width) / 2;
    const y = Math.max(179, this.safeInsets.top + 174);
    const accent = shifted || state.difficulty_spike === true ? AMBER : GREEN_DIM;
    this.glassPanel(x, y, width, height, accent);
    ctx.fillStyle = accent;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, this.width / 2, y + height / 2 + 0.5);
    ctx.restore();
  }

  drawAoAIndexer(state) {
    if (state.carrier !== true || !isApproachMode(state)) return;
    const aoa = Number(state.aoa_deg);
    if (!Number.isFinite(aoa)) return;

    const fast = aoa < 9.8;
    const slow = aoa > 11.4;
    const accent = fast ? AMBER : slow ? RED : GREEN;
    const ctx = this.ctx;
    const x = this.getLayout().tapeInset + 45;
    const y = this.height * 0.51 - 38;
    const width = 70;
    const height = 76;

    ctx.save();
    this.glassPanel(x, y, width, height, accent);
    ctx.fillStyle = GREEN_DIM;
    ctx.font = "650 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`α ${aoa.toFixed(1)}°`, x + width / 2, y + 11);

    const row = (label, rowY, active) => {
      ctx.fillStyle = active ? accent : "rgba(77, 255, 136, 0.22)";
      ctx.font = `${active ? 800 : 600} 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.fillText(label, x + width / 2, rowY);
    };
    row("▽", y + 29, fast);
    row("○", y + 47, !fast && !slow);
    row("△", y + 65, slow);
    ctx.restore();
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
    const x = this.safeInsets.left + 28;
    const y = this.height - this.safeInsets.bottom - 88;
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
    const padlockLabel = "◆ PADLOCK";
    const padlockWidth = 94;
    const padlockX = this.safeInsets.left + 18;

    if (padlock) {
      ctx.fillStyle = "rgba(1, 9, 14, 0.44)";
      ctx.fillRect(padlockX, 20, padlockWidth, 22);
      ctx.strokeStyle = "rgba(255, 176, 32, 0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(padlockX, 20, padlockWidth, 22);
      ctx.fillStyle = AMBER;
      ctx.font = "700 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(padlockLabel, padlockX + padlockWidth / 2, 31);
    }

    if (state.tier === 3) {
      const warningY = state.mode ? 220 : 166;
      const flash = Math.sin(now * Math.PI * 4) > -0.2;
      if (flash) {
        ctx.shadowColor = "rgba(255, 176, 32, 0.58)";
        ctx.shadowBlur = 10;
        ctx.fillStyle = AMBER;
        ctx.font = "800 19px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        ctx.textAlign = "center";
        ctx.fillText("OVERRIDE", this.width / 2, warningY);
        ctx.shadowBlur = 0;
      }

      if (state.buffet) {
        ctx.fillStyle = RED;
        ctx.font = "800 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        ctx.textAlign = "center";
        ctx.fillText("BUFFET", this.width / 2, warningY + 21);
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
        ctx.fillText(urgent ? "PULL UP" : "DECK", this.width / 2, this.height - this.safeInsets.bottom - 104);
      }
    }

    if (!state.frozen) return;

    // A gun kill is the sortie payoff; carrier recovery still retains its established outcome path.
    const rec = state.recovery;
    const splash = state.fight === "Splash" || state.bandit_alive === false;
    const stoppedTrap = rec === "Trap" && state.arrest_phase === "STOPPED";
    let title = splash ? "SPLASH!" : state.below_ground ? "IMPACT" : "KNOCK IT OFF";
    let good = splash || stoppedTrap;
    if (!splash && stoppedTrap) title = "TRAPPED — STOPPED";
    else if (!splash && rec === "Trap") { title = "TRAP"; good = true; }
    else if (rec === "RampStrike") title = "RAMP STRIKE";
    else if (rec === "InTheWater") title = "IN THE WATER";

    const impact = !splash && (state.below_ground || rec === "RampStrike" || rec === "InTheWater");
    const accent = good ? GREEN : (impact ? RED : AMBER);
    ctx.save();
    ctx.fillStyle = splash
      ? "rgba(1, 16, 9, 0.42)"
      : good ? "rgba(2, 20, 10, 0.5)" : (impact ? "rgba(28, 2, 6, 0.58)" : "rgba(1, 9, 14, 0.5)");
    ctx.fillRect(0, 0, this.width, this.height);

    const w = Math.min(splash || stoppedTrap ? 430 : 360, this.width - 34);
    const h = splash || stoppedTrap ? 112 : 92;
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
    ctx.shadowColor = splash ? "rgba(77, 255, 136, 0.62)" : "transparent";
    ctx.shadowBlur = splash ? 12 : 0;
    ctx.font = `800 ${splash ? 31 : stoppedTrap ? 26 : 22}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.fillText(title, this.width / 2, y + (splash || stoppedTrap ? 34 : 30));
    ctx.shadowBlur = 0;

    ctx.fillStyle = GREEN_DIM;
    ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText(
      splash
        ? "KILL CONFIRMED"
        : stoppedTrap
        ? `WIRE ${Number(state.wire) || "—"} · 0 KTS · ${(Number(state.arrest_distance_m) || 0).toFixed(0)} M PULL-OUT`
        : impact
        ? `${Math.round(Number(state.speed_kts) || 0)} KTS · ${Math.round(Number(state.g_actual) || 0)} G · ${Math.round(Number(state.pitch_deg) || 0)}° NOSE LOW`
        : "TERMINATED",
      this.width / 2,
      y + (splash || stoppedTrap ? 68 : 55)
    );
    ctx.fillStyle = GREEN;
    ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText(this.touchMode ? "TAP RESTART" : "R  RESTART", this.width / 2, y + (splash || stoppedTrap ? 94 : 76));
    ctx.restore();
  }

  drawPrompt(state) {
    const cues = ["", "PULL ↓", "EASE ↑", "UNLOAD ↑", "◀ ROLL", "ROLL ▶"];
    const cue = cues[state.prompt] ?? "";
    if (!cue) return;
    const ctx = this.ctx;
    const y = this.height - this.safeInsets.bottom - 74;
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
    const thr = Number(state.throttle);           // commanded lever, 0..1.3
    const eng = Number(state.engine);             // actual engine output (spooled, LAGS the lever)
    if (!Number.isFinite(thr)) return;
    const ctx = this.ctx;
    const maxT = 1.3;                              // top of scale = full afterburner
    // Big vertical bar immediately left of the speed tape, same height, so throttle reads as a
    // primary instrument next to airspeed.
    const centerY = this.height * 0.51;
    const h = Math.min(310, this.height * 0.43);
    const w = 22;
    const x = this.getLayout().tapeInset - 52;
    const y = centerY - h / 2;
    const yOf = (f) => y + h - (clamp(f, 0, maxT) / maxT) * h;

    ctx.fillStyle = "rgba(1, 9, 14, 0.6)"; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(77, 255, 136, 0.35)"; ctx.lineWidth = 1.2; ctx.strokeRect(x, y, w, h);
    // afterburner zone (above MIL) shaded amber
    ctx.fillStyle = "rgba(255, 176, 32, 0.16)"; ctx.fillRect(x, yOf(maxT), w, yOf(1.0) - yOf(maxT));
    // ENGINE fill = actual output; the GAP up to the lever caret is the spool lag you feel
    const ey = yOf(eng);
    ctx.fillStyle = eng > 1.005 ? AMBER : GREEN;
    ctx.fillRect(x + 1.5, ey, w - 3, y + h - ey);
    // detent lines + MIL/AB labels inside
    ctx.strokeStyle = "rgba(77, 255, 136, 0.45)"; ctx.lineWidth = 1;
    for (const f of [0.55, 0.85, 1.0]) { const t = yOf(f); ctx.beginPath(); ctx.moveTo(x, t); ctx.lineTo(x + w, t); ctx.stroke(); }
    // commanded LEVER caret: a bold triangle on the right edge showing where you set it
    const ly = yOf(thr);
    ctx.fillStyle = thr > 1.005 ? AMBER : GREEN;
    ctx.beginPath(); ctx.moveTo(x + w + 1, ly); ctx.lineTo(x + w + 11, ly - 6); ctx.lineTo(x + w + 11, ly + 6); ctx.closePath(); ctx.fill();

    ctx.textBaseline = "middle";
    ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillStyle = GREEN_DIM; ctx.textAlign = "center";
    ctx.fillText("THR", x + w / 2, y - 11);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(77,255,136,0.7)"; ctx.fillText("MIL", x - 4, yOf(1.0));
    ctx.fillStyle = AMBER; ctx.fillText("A/B", x - 4, yOf(maxT) + 7);
    // Big lever readout below the scale.
    const label = thr <= 0.01 ? "IDLE" : thr > 1.005 ? "A/B" : thr >= 0.995 ? "MIL" : `${Math.round(thr * 100)}%`;
    ctx.textAlign = "center";
    ctx.font = "800 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillStyle = eng > 1.005 ? AMBER : GREEN; ctx.fillText(label, x + w / 2, y + h + 12);
  }

  drawFuel(state) {
    const fuel = Number(state.fuel_lb);
    if (!Number.isFinite(fuel)) return;

    const burn = Math.max(0, Number(state.fuel_burn_lb_min) || 0);
    const trend = Math.min(0, Number(state.fuel_trend_lb_min) || 0);
    const capacity = fuelCapacityLb(state);
    const bingoThreshold = bingoFuelLb(state);
    const bingo = state.fuel_bingo === true || fuel <= bingoThreshold;
    const critical = fuel <= bingoThreshold * 0.5;
    const accent = critical ? RED : bingo ? AMBER : GREEN;
    const ctx = this.ctx;
    const width = Math.min(218, this.width - this.safeInsets.left - this.safeInsets.right - 36);
    const height = 63;
    const x = this.width - this.safeInsets.right - width - 18;
    const y = this.height - this.safeInsets.bottom - 101;
    const barX = x + 10;
    const barY = y + 49;
    const barWidth = width - 20;
    const fuelRatio = clamp(fuel / capacity, 0, 1);
    const currentX = barX + barWidth * fuelRatio;
    const projectedX = barX + barWidth * clamp((fuel + trend * 5) / capacity, 0, 1);

    ctx.save();
    this.glassPanel(x, y, width, height, accent);
    ctx.font = "700 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = GREEN_DIM;
    ctx.fillText("FUEL · T5", x + 10, y + 10);
    if (bingo) {
      ctx.textAlign = "right";
      ctx.fillStyle = accent;
      ctx.font = "800 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillText(critical ? "FUEL LOW" : "BINGO", x + width - 10, y + 10);
    }

    ctx.fillStyle = accent;
    ctx.font = "800 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.fillText(`${String(Math.round(fuel)).padStart(4, "0")} LB`, x + 10, y + 29);
    ctx.fillStyle = bingo ? accent : GREEN_DIM;
    ctx.font = "700 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "right";
    ctx.fillText(`FF ${Math.round(burn)} LB/M`, x + width - 10, y + 29);

    ctx.fillStyle = "rgba(77, 255, 136, 0.12)";
    ctx.fillRect(barX, barY, barWidth, 5);
    ctx.fillStyle = accent;
    ctx.fillRect(barX, barY, barWidth * fuelRatio, 5);
    const bingoX = barX + barWidth * clamp(bingoThreshold / capacity, 0, 1);
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bingoX, barY - 2);
    ctx.lineTo(bingoX, barY + 7);
    ctx.stroke();

    // Five-minute fuel trend: the vector points from current quantity to projected quantity.
    if (currentX - projectedX > 1.5) {
      const vectorY = barY - 5;
      ctx.strokeStyle = accent;
      ctx.fillStyle = accent;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(currentX, vectorY);
      ctx.lineTo(projectedX, vectorY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(projectedX, vectorY);
      ctx.lineTo(projectedX + 5, vectorY - 3);
      ctx.lineTo(projectedX + 5, vectorY + 3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawPadlockSa(frame) {
    if (!frame.padlock) return;

    const state = frame.state;
    const ctx = this.ctx;
    const width = Math.min(520, Math.max(300, this.width - 36));
    const height = 112;
    const x = (this.width - width) / 2;
    const y = Math.max(this.safeInsets.top + 205, this.height - this.safeInsets.bottom - 231);
    const attitudeX = x + 52;
    const attitudeY = y + 52;
    const attitudeRadius = 33;
    const pitch = clamp(Number(state.pitch_deg) || 0, -90, 90);
    const bank = (Number(state.bank_deg) || 0) * DEG;
    const horizonY = clamp(pitch * 1.05, -attitudeRadius + 7, attitudeRadius - 7);
    const dataLeft = x + 108;
    const dataWidth = width - 118;
    const targetLeft = dataLeft + dataWidth * 0.53;
    const ownFuel = Math.max(0, Number(state.fuel_lb) || 0);
    const bingoThreshold = bingoFuelLb(state);
    const ownFuelLow = state.fuel_bingo === true || ownFuel <= bingoThreshold;

    ctx.save();
    this.glassPanel(x, y, width, height, "rgba(255, 176, 32, 0.48)");

    // Fixed-aircraft mini attitude indicator. The rotated horizon and its arrow show gravity-up
    // even while the camera is looking away from the nose; exact pitch/bank remain below it.
    ctx.save();
    ctx.beginPath();
    ctx.arc(attitudeX, attitudeY, attitudeRadius, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(attitudeX, attitudeY);
    ctx.rotate(-bank);
    ctx.fillStyle = "rgba(77, 255, 136, 0.055)";
    ctx.fillRect(-attitudeRadius * 2, -attitudeRadius * 2, attitudeRadius * 4, horizonY + attitudeRadius * 2);
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-attitudeRadius * 1.5, horizonY);
    ctx.lineTo(attitudeRadius * 1.5, horizonY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, horizonY - 13);
    ctx.lineTo(-4, horizonY - 7);
    ctx.moveTo(0, horizonY - 13);
    ctx.lineTo(4, horizonY - 7);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = GREEN_DIM;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(attitudeX, attitudeY, attitudeRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = AMBER;
    ctx.beginPath();
    ctx.moveTo(attitudeX, attitudeY - attitudeRadius - 4);
    ctx.lineTo(attitudeX - 4, attitudeY - attitudeRadius + 3);
    ctx.lineTo(attitudeX + 4, attitudeY - attitudeRadius + 3);
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(attitudeX - 20, attitudeY);
    ctx.lineTo(attitudeX - 6, attitudeY);
    ctx.lineTo(attitudeX, attitudeY + 4);
    ctx.lineTo(attitudeX + 6, attitudeY);
    ctx.lineTo(attitudeX + 20, attitudeY);
    ctx.stroke();
    ctx.fillStyle = GREEN_DIM;
    ctx.font = "650 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`P ${formatSigned(pitch)}° · B ${formatSigned(Number(state.bank_deg) || 0)}°`, attitudeX, y + 96);

    ctx.strokeStyle = "rgba(77, 255, 136, 0.20)";
    ctx.beginPath();
    ctx.moveTo(x + 102, y + 9);
    ctx.lineTo(x + 102, y + height - 9);
    ctx.moveTo(targetLeft - 9, y + 12);
    ctx.lineTo(targetLeft - 9, y + height - 12);
    ctx.stroke();

    ctx.font = "800 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = GREEN_DIM;
    ctx.fillText("OWN", dataLeft, y + 15);
    ctx.fillStyle = AMBER;
    ctx.fillText("TGT", targetLeft, y + 15);

    ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillStyle = GREEN;
    ctx.fillText(`IAS ${Math.round(Number(state.speed_kts) || 0)} KT`, dataLeft, y + 35);
    ctx.fillText(`ALT ${Math.round(Number(state.alt_ft) || 0)} FT`, dataLeft, y + 54);
    ctx.fillText(`G ${(Number(state.g_actual) || 0).toFixed(1)} · α ${(Number(state.aoa_deg) || 0).toFixed(1)}°`, dataLeft, y + 73);
    ctx.fillStyle = ownFuelLow ? (ownFuel <= bingoThreshold * 0.5 ? RED : AMBER) : GREEN;
    ctx.fillText(
      `${ownFuelLow ? "BINGO " : "F "}${Math.round(ownFuel)} · FF ${Math.round(Number(state.fuel_burn_lb_min) || 0)}`,
      dataLeft,
      y + 92,
    );

    ctx.fillStyle = AMBER;
    ctx.fillText(`R ${formatRange(state.range_m)}`, targetLeft, y + 35);
    ctx.fillText(`C ${formatSigned(state.closure_kts)} KT`, targetLeft, y + 54);
    ctx.fillText(`AO ${Math.round(Number(state.angle_off_deg) || 0)}°`, targetLeft, y + 73);
    ctx.restore();
  }

  drawFooter(state) {
    const mode = hudMode(state);
    if (state.carrier !== true || mode !== "APPROACH") return;
    const call = lsoToken(String(state.lso ?? state.context ?? ""));
    if (!call) return;

    const ctx = this.ctx;
    const y = this.height - this.safeInsets.bottom - 21;
    ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const width = Math.max(72, ctx.measureText(call).width + 28);
    this.glassPanel((this.width - width) / 2, y - 14, width, 28, "rgba(77, 255, 136, 0.34)");
    ctx.fillStyle = state.lso_severity === "CORRECTING" ? AMBER : GREEN;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(call, this.width / 2, y);
  }

  drawLegend(frozen = false) {
    if (!this.legendVisible || frozen || this.touchMode || document.documentElement.classList.contains("touch-mode")) return;
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
      "SPACE  OVERRIDE (MAX G — CAN DEPART)   ·   F  GUNS   ·   V  PADLOCK   ·   M  SOUND   ·   DRAG  LOOK",
      "1–5  MISSION   ·   C  AXIAL / ANGLED DECK   ·   R  RESTART   ·   K  KNOCK-IT-OFF   ·   F1  VARIANT   ·   H  HIDE",
    ];
    const compactLines = [
      "DOWN / UP  PULL / PUSH   ·   LEFT / RIGHT  ROLL",
      "A / D  RUDDER   ·   W / S  THROTTLE",
      "SPACE  OVERRIDE (MAX G — CAN DEPART)   ·   F  GUNS   ·   M  SOUND",
      "V  PADLOCK   ·   DRAG  LOOK   ·   1–5  MISSION",
      "C  AXIAL / ANGLED DECK   ·   R  RESTART   ·   K  KNOCK-IT-OFF   ·   F1  VARIANT   ·   H  HIDE",
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
    this.updateGunAudio(frame);

    this.worldPoint.copy(frame.playerPosition).addScaledVector(frame.playerForward, 10000);
    const noseAnchor = this.project(this.worldPoint, frame.camera, this.noseProjection);

    this.drawPitchLadder(noseAnchor, frame.state);
    this.drawAirframeSymbols(noseAnchor, frame.state);
    this.drawGunSight(frame, noseAnchor);
    this.drawAimPoint(frame, noseAnchor);
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
    // On very short padlock viewports the own-ship brick carries fuel/flow; avoid stacking the
    // full gauge underneath it. Normal and larger padlock layouts retain the trend tape.
    if (!frame.padlock || this.height >= 520) this.drawFuel(frame.state);
    this.drawWarnings(frame);
    this.drawAoAIndexer(frame.state);
    this.drawPadlockSa(frame);
    this.drawPrompt(frame.state);
    this.drawFooter(frame.state);
    this.drawLegend(Boolean(frame.state.frozen));
    this.drawMode(frame.state);
    this.drawDifficulty(frame.state);
    // Build stamp (top-left): so a stale cached tab is instantly obvious. Bump on each publish.
    ctx.save();
    ctx.fillStyle = "rgba(77, 255, 136, 0.35)";
    ctx.font = "600 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("BUILD 28", this.safeInsets.left + 8, this.safeInsets.top + 8);
    ctx.restore();
    this.drawEnding(frame);
  }
}

export function createHud(canvas) {
  return new CombatHud(canvas);
}
