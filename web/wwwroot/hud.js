import * as THREE from "./vendor/three.module.js";
import {
  airdataReadout,
  fuelReadout,
  speedTapeMarkers,
  stallAwareness,
  systemsReadout,
  targetClosureReadout,
  verticalSpeedText,
  visualMergeWeaponsCue,
} from "./render/hud/hud_readouts.js";
import {
  carrierAoARelevant,
  carrierConfigurationCue,
  carrierDistanceM,
  carrierRelativeMotion,
  CarrierPatternCueQualifier,
} from "./render/hud/carrier_sa.js";
import { padlockOrientationModel } from "./render/camera/padlock_controller.js";
import {
  HudSignalStabilizer,
  latchedRectVisibility,
} from "./render/hud/hud_stabilizer.js";
import { AoAIndexerQualifier, DisplayCueQualifier } from "./render/hud/stable_cues.js";

const GREEN = "#4dff88";
const GREEN_DIM = "rgba(77, 255, 136, 0.56)";
const GREEN_FAINT = "rgba(77, 255, 136, 0.14)";
const AMBER = "#ffb020";
const RED = "#ff465d";
const GLASS = "rgba(2, 10, 16, 0.72)";
const DEG = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const FPV_VERTICAL_FOV_DEG = 66;
const MODE_CUE_SECONDS = 1.5;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function snapPixel(value, pixelRatio = 1) {
  const ratio = Math.max(1, Number(pixelRatio) || 1);
  return Math.round(value * ratio) / ratio;
}

function wrap360(value) {
  return ((value % 360) + 360) % 360;
}

function wrapPi(value) {
  return Math.atan2(Math.sin(value), Math.cos(value));
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
    case "ARRESTMENT FAILED":
    case "CATAPULT":
    case "BOLTER":
    case "TERMINAL":
      return state.mode;
    default:
      break;
  }
  if (state.wave_off === true) return "WAVE-OFF";
  return state.approach === true ? "APPROACH" : "FREE";
}

function lsoToken(call) {
  switch (call) {
    case "ON THE BALL": return "BALL";
    case "YOU'RE LOW": return "LOW";
    case "YOU'RE HIGH": return "HIGH";
    case "FAST": return "FAST";
    case "SLOW": return "SLOW";
    case "POWER": return "POWER";
    case "SINK RATE · POWER": return "SINK RATE · POWER";
    case "COME LEFT": return "COME LEFT";
    case "COME RIGHT": return "COME RIGHT";
    case "WAVE OFF, WAVE OFF": return "WAVE OFF";
    default: return "";
  }
}

function gunCue(state, hitFlash, solution = hasGunSolution(state)) {
  if (hitFlash) return "HITS";
  if ((Number(state.ammo) || 0) <= 0) return "EMPTY";
  if (solution) return "SHOOT";
  return "";
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
    // Keep HUD and WebGL scene in the browser's ordinary compositing path. A desynchronized 2D
    // canvas may present one compositor frame ahead of the scene beneath it, which reads as a
    // whole-HUD tear/flicker during fast manoeuvring.
    this.ctx = canvas.getContext("2d", { alpha: true });
    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;
    this.legendVisible = false;
    this.touchMode = false;
    this.safeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

    this.worldPoint = new THREE.Vector3();
    this.ndc = new THREE.Vector3();
    this.cameraPoint = new THREE.Vector3();
    this.relative = new THREE.Vector3();
    this.noseCameraVector = new THREE.Vector3();
    this.liftCameraVector = new THREE.Vector3();
    this.worldUpCameraVector = new THREE.Vector3();
    this.worldUpVector = new THREE.Vector3(0, 1, 0);
    this.banditAnglesValue = { azimuth: 0, elevation: 0 };
    this.projectionA = { x: 0, y: 0, ndcX: 0, ndcY: 0, cameraX: 0, cameraY: 0, cameraZ: 0, behind: false };
    this.projectionB = { x: 0, y: 0, ndcX: 0, ndcY: 0, cameraX: 0, cameraY: 0, cameraZ: 0, behind: false };
    this.projectionC = { x: 0, y: 0, ndcX: 0, ndcY: 0, cameraX: 0, cameraY: 0, cameraZ: 0, behind: false };
    this.noseProjection = { x: 0, y: 0, ndcX: 0, ndcY: 0, cameraX: 0, cameraY: 0, cameraZ: 0, behind: false };
    this.audioEnabled = true;
    this._audioCtx = null;
    this._gunAudioGain = null;
    this._gunAudioFiring = false;
    this._gcasAudioGain = null;
    this._gcasAudioOscillator = null;
    this._gcasAudioLevel = -1;
    this._lastHudHits = 0;
    this._hitFlashUntil = -1;
    this._damageFlashUntil = -1;
    this._destroyedFlashUntil = -1;
    this._incomingHitCount = 0;
    this._lastMode = null;
    this._modeCue = null;
    this._modeCueStartedAt = -Infinity;
    this._lastDifficulty = null;
    this._difficultyCueStartedAt = -Infinity;
    this._carrierPatternCue = new CarrierPatternCueQualifier();
    this._aoaIndexerCue = new AoAIndexerQualifier();
    this._lsoDisplayCue = new DisplayCueQualifier();
    this._gunSolutionCue = new DisplayCueQualifier({ acquireSeconds: 0.05, releaseSeconds: 0.09 });
    this._gunSolutionEntityId = "";
    this._signals = new HudSignalStabilizer();
    this._banditMarkerInside = false;
    this._banditMarkerEntityId = "";
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
    if (this.touchMode) return false;
    this.legendVisible = !this.legendVisible;
    return this.legendVisible;
  }

  setLegendVisible(visible) {
    this.legendVisible = Boolean(visible) && !this.touchMode;
    return this.legendVisible;
  }

  setTouchMode(enabled) {
    this.touchMode = Boolean(enabled);
    if (this.touchMode) this.legendVisible = false;
  }

  noteCombatEvent(event, now) {
    if (!event || !Number.isFinite(now)) return;
    if (event.type === "HIT" && event.target === "OPPONENT") {
      this._hitFlashUntil = Math.max(this._hitFlashUntil, now + 0.34);
    } else if (event.type === "HIT" && event.target === "PLAYER") {
      this._incomingHitCount = Math.max(1, Math.floor(Number(event.count) || 1));
      this._damageFlashUntil = Math.max(this._damageFlashUntil, now + 0.48);
    } else if (event.type === "DESTROYED" && event.target === "PLAYER") {
      this._damageFlashUntil = Math.max(this._damageFlashUntil, now + 0.85);
      this._destroyedFlashUntil = Math.max(this._destroyedFlashUntil, now + 1.2);
    }
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
      const gcasOscillator = audio.createOscillator();
      const gcasGain = audio.createGain();
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
      gcasOscillator.type = "square";
      gcasOscillator.frequency.value = 760;
      gcasGain.gain.value = 0;
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
      gcasOscillator.connect(gcasGain);
      gcasGain.connect(audio.destination);
      oscillator.start();
      noise.start();
      gcasOscillator.start();
      this._audioCtx = audio;
      this._gunAudioGain = master;
      this._gcasAudioGain = gcasGain;
      this._gcasAudioOscillator = gcasOscillator;
    }
    if (this._audioCtx.state === "suspended") this._audioCtx.resume().catch(() => {});
  }

  toggleAudio() {
    this.audioEnabled = !this.audioEnabled;
    this._gunAudioFiring = false;
    if (!this.audioEnabled && this._gunAudioGain && this._audioCtx)
      this._gunAudioGain.gain.setTargetAtTime(0, this._audioCtx.currentTime, 0.012);
    if (!this.audioEnabled && this._gcasAudioGain && this._audioCtx)
      this._gcasAudioGain.gain.setTargetAtTime(0, this._audioCtx.currentTime, 0.012);
    this._gcasAudioLevel = -1;
    return this.audioEnabled;
  }

  updateGunAudio(frame) {
    const firing = this.audioEnabled && frame.triggerHeld && frame.state.gun_firing === true
      && (Number(frame.state.ammo) || 0) > 0;
    if (firing && !this._audioCtx) this.armAudio();
    if (!this._gunAudioGain || !this._audioCtx) return;
    if (firing === this._gunAudioFiring) return;
    this._gunAudioFiring = firing;
    const target = firing ? 0.028 : 0;
    this._gunAudioGain.gain.setTargetAtTime(target, this._audioCtx.currentTime, firing ? 0.008 : 0.018);
  }

  updateGcasAudio(frame) {
    const active = frame.state.auto_gcas_active === true;
    const warning = frame.state.auto_gcas_warning === true;
    // A conscious pilot receives an aural attention getter. During actual G-LOC the model does
    // not grant the player an impossible auditory channel; recovery remains visible in telemetry
    // and the debrief after consciousness returns.
    const conscious = frame.state.pilot_conscious !== false;
    const rateHz = active ? 6 : warning ? 3 : 0;
    const phaseOn = rateHz > 0
      && Math.floor((Number(frame.now) || 0) * rateHz * 2) % 2 === 0;
    const level = this.audioEnabled && conscious && phaseOn
      ? active ? 0.024 : 0.014 : 0;
    if (level > 0 && !this._audioCtx) this.armAudio();
    if (!this._gcasAudioGain || !this._gcasAudioOscillator || !this._audioCtx) return;
    if (level === this._gcasAudioLevel) return;
    this._gcasAudioLevel = level;
    this._gcasAudioOscillator.frequency.setTargetAtTime(
      active ? 920 : 760, this._audioCtx.currentTime, 0.006,
    );
    this._gcasAudioGain.gain.setTargetAtTime(level, this._audioCtx.currentTime, 0.008);
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

  getTapeInset() {
    const sideSafe = Math.max(this.safeInsets.left, this.safeInsets.right);
    return sideSafe > 0
      ? clamp(Math.max(this.width * 0.055 + sideSafe, sideSafe + 56), 48, 140)
      : clamp(this.width * 0.055, 48, 78);
  }

  getInstrumentCenterY() {
    return this.touchMode
      ? this.height * 0.49 - this.safeInsets.bottom * 0.5
      : this.height * 0.51;
  }

  getLayout() {
    const tapeInset = this.getTapeInset();
    const tapeHalfWidth = 35;
    const safePadding = 20;
    const controlClearance = this.touchMode ? 138 : 112;
    return {
      tapeInset,
      targetSafe: {
        left: tapeInset + tapeHalfWidth + safePadding,
        right: this.width - tapeInset - tapeHalfWidth - safePadding,
        top: 151,
        bottom: this.height - this.safeInsets.bottom - controlClearance,
      },
      ladderSafe: {
        left: tapeInset + tapeHalfWidth + 10,
        right: this.width - tapeInset - tapeHalfWidth - 10,
        top: 144,
        bottom: this.height - this.safeInsets.bottom - (this.touchMode ? 128 : 106),
      },
    };
  }

  drawPitchLadder(state, camera) {
    const ctx = this.ctx;
    const bank = -(Number(state.bank_deg) || 0) * DEG;
    const pitch = Number(state.pitch_deg) || 0;
    const radius = Math.max(120, this.height * 0.42);
    const projection = camera?.projectionMatrix?.elements;
    const matrixScaleY = Number(projection?.[5]);
    const fallbackScaleY = 1 / Math.tan(FPV_VERTICAL_FOV_DEG * DEG * 0.5);
    const focalLengthY = this.height * 0.5
      * (Number.isFinite(matrixScaleY) && matrixScaleY > 0 ? matrixScaleY : fallbackScaleY);
    // Match the PerspectiveCamera principal point. The normal FPV camera has no view offset, so
    // this is the exact canvas centre; retaining the matrix term keeps the HUD calibrated if that
    // ever changes.
    const projectionCenterX = this.width * (0.5 - (Number(projection?.[8]) || 0) * 0.5);
    const projectionCenterY = this.height * (0.5 + (Number(projection?.[9]) || 0) * 0.5);
    const cosBank = Math.cos(bank);
    const sinBank = Math.sin(bank);
    const layout = this.getLayout();
    const safe = layout.ladderSafe;
    const screenCenterX = this.width * 0.5;
    const screenCenterY = this.height * 0.5;
    const rotatePoint = (x, y) => ({
      x: projectionCenterX + x * cosBank - y * sinBank,
      y: projectionCenterY + x * sinBank + y * cosBank,
    });
    const segment = (x1, y1, x2, y2) => {
      const a = rotatePoint(x1, y1);
      const b = rotatePoint(x2, y2);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    };

    ctx.save();
    // Clip in screen space around the camera projection centre. Rung centres and endpoints are
    // rotated first below, so a high-bank rung cannot be admitted by its pre-roll vertical offset.
    ctx.beginPath();
    ctx.arc(projectionCenterX, projectionCenterY, radius, 0, Math.PI * 2);
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
      // Perspective projection, not a fixed pixels-per-degree approximation. At level attitude the
      // 0 rung is exactly on the camera centre; +10/-10 are equal and opposite about it. Pitching up
      // moves the true-horizontal 0 rung down by the same projection used by the rendered world.
      const localY = Math.tan((pitch - rung) * DEG) * focalLengthY;
      const rungCenter = rotatePoint(0, localY);
      const rotatedDistance = Math.hypot(
        rungCenter.x - projectionCenterX,
        rungCenter.y - projectionCenterY,
      );
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

  drawAirframeSymbols(anchor, state, flightPathAnchor = null) {
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

    // Outside recovery the air-relative approximation remains useful. In the carrier groove the
    // caller supplies the actual deck-relative velocity projected through the camera: wind-over-
    // deck and the moving landing area otherwise put this marker in the wrong place.
    const projectedFpm = isApproachMode(state) && flightPathAnchor
      && !flightPathAnchor.behind && Number.isFinite(flightPathAnchor.x)
      && Number.isFinite(flightPathAnchor.y);
    ctx.save();
    if (projectedFpm) {
      ctx.rotate(bank);
      ctx.translate(flightPathAnchor.x - anchor.x, flightPathAnchor.y - anchor.y);
    } else {
      ctx.translate(0, aoaPx);
    }
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
    if (!isFightHudActive(frame.state)) return;

    const { state, triggerHeld, camera, leadPipper, now } = frame;
    const hits = Number(state.hits) || 0;
    if (hits < this._lastHudHits) this._lastHudHits = hits;
    if (!Array.isArray(state.recent_events) && hits > this._lastHudHits) {
      this._hitFlashUntil = now + 0.34;
    }
    this._lastHudHits = hits;
    const hitFlash = now < this._hitFlashUntil;
    const leadValid = state.lead_valid === true && leadPipper;
    const solution = frame.visualGunSolution === true;
    const ctx = this.ctx;
    const ammo = Math.max(0, Number(state.ammo) || 0);
    const cue = gunCue(state, hitFlash, solution);
    const cueColor = hitFlash || solution ? GREEN : RED;

    // Ammunition and a qualified SHOOT/HITS state remain available while the pilot is looking
    // away from the waterline. The reticle itself still belongs to the actual nose projection.
    ctx.save();
    ctx.font = "700 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillStyle = GREEN_DIM;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `G${String(ammo).padStart(3, "0")}`,
      this.width - this.safeInsets.right - 18,
      this.safeInsets.top + 20,
    );
    if (cue) {
      ctx.fillStyle = cueColor;
      ctx.font = "800 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(cue, this.width / 2, Math.max(212, this.safeInsets.top + 210));
    }
    ctx.restore();

    if (!anchor || anchor.behind || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return;

    // The pack cockpit carries an actual infinity-collimated reflector sight. Keep this canvas
    // fallback only for compatibility cockpits that do not publish a gunsight.origin anchor.
    if (frame.periodGunsightVisible !== true) {
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
    }

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
      ctx.restore();
    }

  }

  // The deck diamond and waterline director are one published recovery contract. Align the stable
  // waterline with the upper director; the separately projected FPM remains the honest sink/path
  // readout. Chasing a lagging FPM at the physical wires was the old guaranteed-crash instruction.
  drawAimPoint(frame, noseAnchor, directorAnchor = null) {
    const { aimPoint, camera, state } = frame;
    if (!isApproachMode(state) || !aimPoint || !noseAnchor || noseAnchor.behind) return;
    const p = this.project(aimPoint, camera);
    if (p.behind || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;

    const ctx = this.ctx;
    const projectedDirector = directorAnchor && !directorAnchor.behind
      && Number.isFinite(directorAnchor.x) && Number.isFinite(directorAnchor.y);

    ctx.save();
    // Dashed command error from the waterline to its director — fly this to zero. The FPM is drawn
    // independently from actual deck-relative velocity and is deliberately not a chase command.
    ctx.strokeStyle = "rgba(255, 176, 32, 0.45)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    if (projectedDirector) {
      ctx.beginPath();
      ctx.moveTo(noseAnchor.x, noseAnchor.y);
      ctx.lineTo(directorAnchor.x, directorAnchor.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // The forward recovery-cue diamond. Wire three remains physically aft of this reference.
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
    if (projectedDirector) {
      // Open upper caret = waterline director. It is visually distinct from both the deck diamond
      // and the circular FPM, so the three symbols cannot be mistaken for one another.
      ctx.beginPath();
      ctx.moveTo(directorAnchor.x - 12, directorAnchor.y + 5);
      ctx.lineTo(directorAnchor.x, directorAnchor.y - 5);
      ctx.lineTo(directorAnchor.x + 12, directorAnchor.y + 5);
      ctx.moveTo(directorAnchor.x - 19, directorAnchor.y);
      ctx.lineTo(directorAnchor.x - 12, directorAnchor.y);
      ctx.moveTo(directorAnchor.x + 12, directorAnchor.y);
      ctx.lineTo(directorAnchor.x + 19, directorAnchor.y);
      ctx.stroke();
      ctx.font = "700 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("WL", directorAnchor.x + 23, directorAnchor.y);
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  drawBandit(frame) {
    const { state, camera, banditPosition } = frame;
    if (frame.padlock && frame.padlockTarget === "carrier") return;
    if (!isFightHudActive(state)) return;
    const angles = this.banditAngles(frame);
    const projection = this.project(banditPosition, camera);
    const layout = this.getLayout();
    const safe = layout.targetSafe;
    const solution = frame.visualGunSolution === true;
    const color = solution ? AMBER : GREEN;
    const ctx = this.ctx;
    const size = solution ? 32 : 27;
    const markerEntityId = String(state.bandit_entity_id ?? "legacy");
    if (markerEntityId !== this._banditMarkerEntityId) {
      this._banditMarkerEntityId = markerEntityId;
      this._banditMarkerInside = false;
    }
    const inside = latchedRectVisibility(
      this._banditMarkerInside,
      projection,
      safe,
      size,
      6,
    );
    this._banditMarkerInside = inside;

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

      const closure = targetClosureReadout(state.closure_kts);
      const dataLine = `${formatRange(state.range_m).replace(" ", "")} · ${closure.compactText}`;
      ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      const textWidth = ctx.measureText(dataLine).width;
      const textHeight = 14;
      const rightX = projection.x + size + 8;
      const useRight = rightX + textWidth + 8 <= safe.right;
      const textX = useRight ? rightX : projection.x - size - 8 - textWidth;
      const textY = clamp(projection.y - textHeight / 2, safe.top, safe.bottom - textHeight);
      ctx.fillStyle = "rgba(1, 8, 12, 0.68)";
      ctx.fillRect(textX - 4, textY, textWidth + 8, textHeight);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      ctx.fillText(dataLine, textX, textY + textHeight / 2);

      return;
    }

    let dx;
    let dy;
    if (!projection.behind && Number.isFinite(projection.x) && Number.isFinite(projection.y)) {
      dx = projection.x - this.width / 2;
      dy = projection.y - this.height / 2;
    } else {
      // Camera-space X/Y collapse to zero for a target exactly behind the pilot. Resolve that
      // singular case from own-ship-relative bearing and current head angle so the locator always
      // points along the shortest pan back to the bandit instead of arbitrarily pointing down.
      const yawError = wrapPi(angles.azimuth - (Number(frame.sensorYaw) || 0));
      const pitchError = clamp(
        angles.elevation - (Number(frame.sensorPitch) || 0),
        -Math.PI / 2,
        Math.PI / 2,
      );
      dx = Math.sin(yawError);
      dy = -Math.sin(pitchError);
      if (Math.abs(dx) + Math.abs(dy) < 0.02) {
        dx = yawError < 0 || (yawError === 0 && angles.azimuth < 0) ? -1 : 1;
      }
    }

    // Padlock locators live at the actual display edge; normal HUD locators retain the protected
    // tape area. Keep these as scalars so the hot draw path creates no extra layout object.
    const locatorLeft = safe.left;
    const locatorRight = safe.right;
    const locatorTop = frame.padlock ? Math.max(safe.top, this.safeInsets.top + 78) : safe.top;
    const locatorBottom = frame.padlock
      ? Math.max(locatorTop + 20, safe.bottom)
      : safe.bottom;
    const safeCenterX = (locatorLeft + locatorRight) * 0.5;
    const safeCenterY = (locatorTop + locatorBottom) * 0.5;
    const halfWidth = (locatorRight - locatorLeft) * 0.5;
    const halfHeight = (locatorBottom - locatorTop) * 0.5;
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
    this.setLine(AMBER, frame.padlock ? 2.25 : 1.6);
    ctx.fillStyle = frame.padlock ? "rgba(255, 176, 32, 0.28)" : "rgba(255, 176, 32, 0.16)";
    ctx.shadowColor = frame.padlock ? "rgba(255, 176, 32, 0.68)" : "transparent";
    ctx.shadowBlur = frame.padlock ? 8 : 0;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, -8);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    const length = Math.hypot(dx, dy) || 1;
    const azimuth = angles.azimuth * RAD_TO_DEG;
    const closure = targetClosureReadout(state.closure_kts);
    const fullLabel = `${Math.abs(azimuth) > 150 ? "6 · " : ""}${formatRange(state.range_m).replace(" ", "")} · ${closure.compactText}`;
    ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const labelText = this.fitText(fullLabel, Math.max(60, locatorRight - locatorLeft - 12));
    const labelWidth = ctx.measureText(labelText).width;
    const labelX = clamp(x - (dx / length) * 34, locatorLeft + labelWidth * 0.5 + 5, locatorRight - labelWidth * 0.5 - 5);
    const labelY = clamp(y - (dy / length) * 30, locatorTop + 8, locatorBottom - 8);
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

  drawHeadingTape(state, { headingDeg = null, headingDigits = null, padlock = false } = {}) {
    const ctx = this.ctx;
    const heading = Number.isFinite(headingDeg) ? headingDeg : Number(state.heading_deg) || 0;
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
      const x = snapPixel(this.width / 2 + delta * pixelsPerDegree, this.pixelRatio);
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
    const shownHeading = Number.isFinite(headingDigits) ? headingDigits : heading;
    ctx.fillText(String(Math.round(wrap360(shownHeading))).padStart(3, "0"), this.width / 2, y - 1);
    if (padlock) {
      ctx.fillStyle = GREEN_DIM;
      ctx.font = "750 7px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillText("OWN HDG", this.width / 2, y - 27);
    }

    // At bingo the boat caret stays on the visible edge of the tape until the pilot turns it in.
    // This is guidance only: no flight-control command is fed back into the kernel.
    const boatTurn = Number(state.rtb_turn_deg);
    if (state.rtb_steer === true && Number.isFinite(boatTurn)) {
      const shownTurn = clamp(boatTurn, -48, 48);
      const boatX = this.width / 2 + shownTurn * pixelsPerDegree;
      ctx.fillStyle = AMBER;
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(boatX - 6, y - 21);
      ctx.lineTo(boatX, y - 15);
      ctx.lineTo(boatX + 6, y - 21);
      ctx.stroke();
      ctx.font = "800 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillText(Math.abs(boatTurn) > 48 ? (boatTurn < 0 ? "◀ B" : "B ▶") : "B", boatX, y - 28);
    }

    // Exact line-of-sight bearing to the one authoritative raider. This is deliberately not an
    // invented cutoff solution or defended-point bearing: the mission cue still tells the pilot
    // whether to lead or cut across, while this caret makes the current target's steering bearing
    // unambiguous even when it is outside the visible heading-tape span.
    const raidActive = state.drone_raid_evaluation === true
      && state.finished !== true && state.drone_raid_finished !== true;
    const playerEast = Number(state.px);
    const playerNorth = Number(state.pz);
    const raiderEast = Number(state.bx);
    const raiderNorth = Number(state.bz);
    if (raidActive && [playerEast, playerNorth, raiderEast, raiderNorth]
      .every(Number.isFinite)) {
      const east = raiderEast - playerEast;
      const north = raiderNorth - playerNorth;
      if (Math.hypot(east, north) > 1) {
        const raiderBearing = wrap360(Math.atan2(east, north) * RAD_TO_DEG);
        const raiderTurn = ((raiderBearing - heading + 540) % 360) - 180;
        const shownTurn = clamp(raiderTurn, -48, 48);
        const raiderX = this.width / 2 + shownTurn * pixelsPerDegree;
        const rawTarget = Number(state.drone_raid_active_target);
        const target = Number.isFinite(rawTarget) ? Math.max(1, Math.floor(rawTarget)) : 1;
        const label = Math.abs(raiderTurn) > 48
          ? (raiderTurn < 0 ? `◀ R${target}` : `R${target} ▶`)
          : `R${target}`;
        ctx.fillStyle = AMBER;
        ctx.strokeStyle = AMBER;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(raiderX - 6, y + 27);
        ctx.lineTo(raiderX, y + 21);
        ctx.lineTo(raiderX + 6, y + 27);
        ctx.stroke();
        ctx.font = "800 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        ctx.fillText(label, raiderX, y + 35);
      }
    }
  }

  drawSortieStatus(frame) {
    const { state } = frame;
    const ctx = this.ctx;
    const kills = Math.max(0, Math.floor(Number(state.kill_count) || 0));
    const raid = state.drone_raid_evaluation === true;

    ctx.save();
    if (raid && state.finished !== true && state.drone_raid_finished !== true) {
      const x = this.safeInsets.left + 18;
      const y = this.safeInsets.top + 17;
      // On narrow screens reserve the upper-right ammunition readout instead of painting a full-
      // width raid card underneath it.
      const narrowRaidLayout = this.width - this.safeInsets.left - this.safeInsets.right < 420;
      const rightClearance = narrowRaidLayout ? 82 : 18;
      const width = Math.max(1, Math.min(350, this.width - this.safeInsets.left
        - this.safeInsets.right - 18 - rightClearance));
      const total = Math.max(1, Math.floor(Number(state.drone_raid_targets_total) || 1));
      const raidKills = Math.max(0, Math.floor(Number(state.drone_raid_kills) || 0));
      const leakers = Math.max(0, Math.floor(Number(state.drone_raid_leakers) || 0));
      const rawActiveTarget = Number(state.drone_raid_active_target);
      const activeTarget = Number.isFinite(rawActiveTarget)
        ? clamp(Math.floor(rawActiveTarget), 1, total)
        : clamp(raidKills + leakers + 1, 1, total);
      const rawTimeToLeak = state.drone_raid_time_to_leak_s;
      const timeToLeak = typeof rawTimeToLeak === "number" && Number.isFinite(rawTimeToLeak)
        ? rawTimeToLeak : null;
      const roundsPerKill = Number(state.drone_raid_rounds_per_kill);
      const timeText = timeToLeak === null ? "—" : `${Math.ceil(Math.max(0, timeToLeak))}s`;
      const cue = typeof state.drone_raid_cue === "string" ? state.drone_raid_cue : "";
      const headerParts = [`RAIDER ${activeTarget}/${total} ACTIVE`, `${raidKills} DOWN`];
      if (leakers > 0) headerParts.push(`${leakers} LEAKER${leakers === 1 ? "" : "S"}`);
      const metricParts = [`TLEAK ${timeText}`];
      if (raidKills > 0 && Number.isFinite(roundsPerKill))
        metricParts.push(`RPK ${roundsPerKill.toFixed(1)}`);

      this.glassPanel(x, y, width, 61, leakers > 0 ? AMBER : GREEN);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "800 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillStyle = leakers > 0 ? AMBER : GREEN;
      ctx.fillText(this.fitText(headerParts.join(" · "), width - 20),
        x + 10, y + 13);
      ctx.fillStyle = GREEN_DIM;
      ctx.font = "700 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillText(this.fitText(metricParts.join(" · "), width - 20),
        x + 10, y + 31);
      ctx.fillStyle = leakers > 0 ? AMBER : GREEN;
      ctx.fillText(this.fitText(cue, width - 20), x + 10, y + 49);
    } else if (!raid && kills > 0) {
      const x = this.safeInsets.left + 18;
      const y = this.safeInsets.top + 17;
      ctx.font = "800 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      const tally = `KILLS ${String(kills).padStart(2, "0")}`;
      const tallyWidth = ctx.measureText(tally).width + 18;
      this.glassPanel(x, y, tallyWidth, 23, GREEN);
      ctx.fillStyle = GREEN;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tally, x + tallyWidth / 2, y + 12);
    }

    if (!raid && state.splash_cue === true && state.finished !== true) {
      const width = Math.min(310, this.width - 34);
      const height = 63;
      const cueX = (this.width - width) / 2;
      const cueY = state.rtb === true
        ? Math.max(this.safeInsets.top + 258, this.height * 0.31)
        : Math.max(this.safeInsets.top + 225, this.height * 0.27);
      this.glassPanel(cueX, cueY, width, height, GREEN);
      ctx.fillStyle = GREEN;
      ctx.shadowColor = "rgba(77, 255, 136, 0.62)";
      ctx.shadowBlur = 12;
      ctx.font = "800 24px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillText("SPLASH!", this.width / 2, cueY + 23);
      ctx.shadowBlur = 0;
      ctx.fillStyle = GREEN_DIM;
      ctx.font = "700 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillText(`NEW BANDIT · KILLS ${kills}`, this.width / 2, cueY + 47);
    }
    ctx.restore();
  }

  drawRtbCue(state) {
    if (state.rtb !== true) return;
    if (["TERMINAL", "ARRESTED", "STOPPED", "CATAPULT"].includes(hudMode(state))) return;

    const ctx = this.ctx;
    const fuel = fuelReadout(state);
    const bearing = Number(state.rtb_bearing_deg);
    const turn = Number(state.rtb_turn_deg);
    const rangeNm = Number(state.rtb_range_nm);
    const hasSteer = state.rtb_steer === true
      && Number.isFinite(bearing) && Number.isFinite(turn) && Number.isFinite(rangeNm);
    const direction = Math.abs(turn) < 3 ? "STEADY"
      : `TURN ${turn < 0 ? "L" : "R"} ${Math.round(Math.abs(turn))}°`;
    const boatDetail = hasSteer
      ? `BOAT ${String(Math.round(wrap360(bearing))).padStart(3, "0")}° · ${rangeNm.toFixed(1)} NM · ${direction}`
      : "BREAK OFF · RECOVER";
    const detail = fuel.bingo ? `${boatDetail} · ${fuel.decisionText}` : boatDetail;
    const width = Math.min(this.touchMode ? 264 : 330, this.width - 34);
    const height = 44;
    const x = (this.width - width) / 2;
    const y = Math.max(this.safeInsets.top + 198, 203);

    ctx.save();
    this.glassPanel(x, y, width, height, AMBER);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = AMBER;
    ctx.font = "800 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText("BINGO - RTB", this.width / 2, y + 14);
    ctx.fillStyle = GREEN_DIM;
    ctx.font = "700 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText(detail, this.width / 2, y + 32);
    ctx.restore();
  }

  drawModeCue(frame) {
    const { state, now } = frame;
    const ctx = this.ctx;
    const mode = hudMode(state);
    if (this._lastMode === null) {
      this._lastMode = mode;
      return;
    }
    if (mode !== this._lastMode) {
      this._lastMode = mode;
      this._modeCue = mode === "FREE" ? "FIGHT"
        : mode === "APPROACH" ? "APPROACH"
        : mode === "WAVE-OFF" ? "WAVE-OFF" : null;
      this._modeCueStartedAt = now;
    }

    const age = now - this._modeCueStartedAt;
    if (!this._modeCue || age < 0 || age >= MODE_CUE_SECONDS) return;

    const waveOff = this._modeCue === "WAVE-OFF";
    const accent = waveOff ? RED : this._modeCue === "APPROACH" ? GREEN : AMBER;
    const fade = clamp((MODE_CUE_SECONDS - age) / 0.55, 0, 1);
    const width = Math.min(136, this.width - 34);
    const height = 27;
    const x = (this.width - width) / 2;
    const y = Math.max(143, this.safeInsets.top + 138);

    ctx.save();
    ctx.globalAlpha = fade;
    this.glassPanel(x, y, width, height, waveOff ? "rgba(255, 70, 93, 0.72)" : accent);
    if (waveOff) {
      // Keep the urgent cue stable. Alternating fills looked like renderer flicker and made the
      // wording harder to acquire during the exact manoeuvre where the pilot is busiest.
      ctx.fillStyle = "rgba(255, 70, 93, 0.13)";
      roundedRect(ctx, x + 1, y + 1, width - 2, height - 2, 4);
      ctx.fill();
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = accent;
    ctx.font = "800 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText(this._modeCue, this.width / 2, y + height / 2 + 0.5);
    ctx.restore();
  }

  drawDifficulty(frame) {
    const { state } = frame;
    if (state.carrier !== true) return;
    const level = clamp(Math.round(Number(state.difficulty_level) || 0), 0, 5);
    if (this._lastDifficulty === null) {
      this._lastDifficulty = level;
      return;
    }
    if (level !== this._lastDifficulty) {
      this._lastDifficulty = level;
      this._difficultyCueStartedAt = now;
    }
    const age = now - this._difficultyCueStartedAt;
    if (age < 0 || age >= MODE_CUE_SECONDS) return;

    const text = `L${level}`;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = clamp((MODE_CUE_SECONDS - age) / 0.45, 0, 1);
    ctx.font = "800 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const y = Math.max(184, this.safeInsets.top + 179);
    const accent = state.difficulty_spike === true ? AMBER : GREEN_DIM;
    ctx.fillStyle = accent;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, this.width / 2, y);
    ctx.restore();
  }

  drawAoAIndexer(state, dt = 0) {
    if (state.carrier !== true || !isApproachMode(state)) {
      this._aoaIndexerCue.reset();
      return;
    }
    const aoa = Number(state.aoa_deg);
    const onSpeed = Number(state.effective_on_speed_aoa_deg);
    const tolerance = Number(state.on_speed_aoa_tolerance_deg);
    const qualified = this._aoaIndexerCue.update({ aoa, onSpeed, tolerance }, dt);
    if (!qualified) return;

    const fast = qualified === "FAST";
    const slow = qualified === "SLOW";
    const accent = fast ? AMBER : slow ? RED : GREEN;
    const ctx = this.ctx;
    const x = this.getLayout().tapeInset + 45;
    const y = this.getInstrumentCenterY() - 38;
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
  drawVerticalTape({
    value,
    displayValue = value,
    x,
    step,
    decimals = 0,
    suffix = "",
    floor = null,
    trend = 0,
    lowSpeed = null,
    fixedMarkers = [],
  }) {
    const ctx = this.ctx;
    const centerY = this.getInstrumentCenterY();
    const tapeHeight = Math.min(310, this.height * (this.touchMode ? 0.36 : 0.43));
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

    // Low-speed awareness is derived from the same q*S*CLmax boundary as the flight model. An
    // amber region appears only when the kernel supplies a separately derived maneuver margin.
    if (lowSpeed?.unit === "KIAS"
        && Number.isFinite(lowSpeed.boundaryKias)) {
      const tapeTop = centerY - halfHeight;
      const tapeBottom = centerY + halfHeight;
      const yForSpeed = (speedKias) => centerY - (speedKias - value) * pxPerUnit;
      const boundaryY = yForSpeed(lowSpeed.boundaryKias);
      if (Number.isFinite(lowSpeed.amberTopKias)
          && lowSpeed.amberTopKias > lowSpeed.boundaryKias) {
        const amberTopY = yForSpeed(lowSpeed.amberTopKias);
        const amberY0 = clamp(amberTopY, tapeTop, tapeBottom);
        const amberY1 = clamp(boundaryY, tapeTop, tapeBottom);
        if (amberY1 > amberY0) {
          ctx.fillStyle = "rgba(255, 176, 32, 0.19)";
          ctx.fillRect(x - 33, amberY0, 66, amberY1 - amberY0);
        }
      }

      const redY = clamp(boundaryY, tapeTop, tapeBottom);
      if (tapeBottom > redY) {
        ctx.fillStyle = "rgba(255, 70, 93, 0.20)";
        ctx.fillRect(x - 33, redY, 66, tapeBottom - redY);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - 33, redY, 66, tapeBottom - redY);
        ctx.clip();
        ctx.strokeStyle = "rgba(255, 70, 93, 0.50)";
        ctx.lineWidth = 1;
        for (let hatchY = redY - 58; hatchY < tapeBottom + 58; hatchY += 9) {
          ctx.beginPath();
          ctx.moveTo(x - 33, hatchY + 58);
          ctx.lineTo(x + 33, hatchY - 8);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    const base = Math.floor(value / step) * step;
    for (let i = -7; i <= 7; i++) {
      const mark = base + i * step;
      if (floor !== null && mark < floor) continue;
      const y = snapPixel(
        centerY - ((mark - value) / step) * pixelsPerStep,
        this.pixelRatio,
      );
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

    for (const marker of fixedMarkers) {
      if (marker?.unit !== "KIAS" || !Number.isFinite(marker.value)) continue;
      const rawY = centerY - (marker.value - value) * pxPerUnit;
      const markerY = clamp(rawY, centerY - halfHeight + 7, centerY + halfHeight - 7);
      const offscale = rawY < centerY - halfHeight || rawY > centerY + halfHeight;
      ctx.fillStyle = AMBER;
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x + 32, markerY);
      ctx.lineTo(x + 24, markerY - 5);
      ctx.lineTo(x + 24, markerY + 5);
      ctx.closePath();
      ctx.fill();
      ctx.font = "800 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "right";
      const direction = offscale ? (rawY < centerY ? "↑" : "↓") : "";
      ctx.fillText(`${marker.label}${direction}`, x + 20, markerY + 0.5);
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
    ctx.fillText(`${displayValue.toFixed(decimals)}${suffix}`, x, centerY + 0.5);

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

  drawAirdataLabels(state, x, display = {}) {
    const data = airdataReadout(state);
    const groundKts = Number.isFinite(display.groundKts) ? display.groundKts : null;
    const verticalSpeedFpm = Number.isFinite(display.verticalSpeedDigits)
      ? display.verticalSpeedDigits : data.verticalSpeedFpm;
    const groundText = Number.isFinite(groundKts)
      ? `G/S ${Math.round(Math.max(0, groundKts))}`
      : data.groundText;
    const verticalText = verticalSpeedText(verticalSpeedFpm);
    const ctx = this.ctx;
    const centerY = this.getInstrumentCenterY();
    const tapeHeight = Math.min(310, this.height * (this.touchMode ? 0.36 : 0.43));

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = GREEN_DIM;
    ctx.font = "800 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText(data.unitText, x, centerY - tapeHeight / 2 - 12);

    // Earth-relative speed and the aircraft's actual vertical motion sit directly under IAS.
    // They stay numerically explicit instead of adding another decorative analogue instrument.
    ctx.fillStyle = "rgba(3, 13, 20, 0.88)";
    roundedRect(ctx, x - 31, centerY + 11, 62, 27, 3);
    ctx.fill();
    ctx.strokeStyle = "rgba(77, 255, 136, 0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 27, centerY + 24.5);
    ctx.lineTo(x + 27, centerY + 24.5);
    ctx.stroke();
    ctx.fillStyle = GREEN_DIM;
    ctx.font = "700 7px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText(groundText, x, centerY + 17.5);
    ctx.font = "700 6.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText(verticalText, x, centerY + 31.5);
    ctx.restore();
  }

  drawGTape(state) {
    const ctx = this.ctx;
    const x = this.safeInsets.left + 28;
    const y = this.height - this.safeInsets.bottom - (this.touchMode ? 121 : 88);
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
    ctx.fillText("G", x, y - 20);
    ctx.textAlign = "right";
    ctx.fillStyle = tierColor;
    ctx.fillText((Number(state.g_actual) || 0).toFixed(1), x + width, y - 20);

    ctx.strokeStyle = GREEN_DIM;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.stroke();

    const sustained = Number(state.sustained);
    const markers = [
      ...(Number.isFinite(sustained) && sustained >= 1.0
        ? [[sustained, "S", GREEN_DIM]] : []),
      [state.g_hardmax, "L", RED],
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

  drawWarnings(frame, systems = null) {
    const { state, now } = frame;
    const ctx = this.ctx;
    const warningY = state.mode ? 220 : 166;
    let occupiedLines = 0;

    const gcasActive = state.auto_gcas_active === true;
    const gcasWarning = state.auto_gcas_warning === true;
    const gcasLowEnergy = state.auto_gcas_available === true
      && state.auto_gcas_inhibit_reason === "LOW_AIRSPEED"
      && Number(state.radar_alt_ft) < 1500
      && Number(state.vertical_speed_fpm) < -500;
    const gcasTerrainUnavailable = state.auto_gcas_available === true
      && state.auto_gcas_inhibit_reason === "TERRAIN_DATA"
      && Number(state.radar_alt_ft) < 3000
      && Number(state.vertical_speed_fpm) < -1000;
    if (gcasActive || gcasWarning || gcasLowEnergy || gcasTerrainUnavailable) {
      const text = gcasActive ? "AUTO GCAS · FLYUP"
        : gcasWarning ? "PULL UP"
          : gcasLowEnergy ? "AIRSPEED" : "GCAS TERRAIN";
      ctx.shadowColor = gcasActive || gcasWarning
        ? "rgba(255, 70, 93, 0.62)" : "rgba(255, 176, 32, 0.5)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = gcasActive || gcasWarning ? RED : AMBER;
      ctx.font = "800 16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(text, this.width / 2, warningY);
      ctx.shadowBlur = 0;
      occupiedLines += 1;
    }

    if (state.tier === 3) {
      const alphaOverride = Number.isFinite(state.requested_alpha_deg);
      ctx.shadowColor = "rgba(255, 176, 32, 0.58)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = AMBER;
      ctx.font = "800 19px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(alphaOverride ? "AOA LIMIT OFF" : "G LIMIT OVERRIDE",
        this.width / 2, warningY);
      ctx.shadowBlur = 0;
      occupiedLines += 1;
    }

    if (state.buffet) {
      ctx.fillStyle = RED;
      ctx.font = "800 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText("BUFFET · CL MAX", this.width / 2,
        warningY + occupiedLines * 21);
      occupiedLines += 1;
    }

    for (const warning of systems?.warnings ?? []) {
      const urgent = warning.level === "warning";
      ctx.fillStyle = urgent ? RED : AMBER;
      ctx.font = "800 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(warning.text, this.width / 2, warningY + occupiedLines * 21);
      occupiedLines += 1;
    }
  }

  // Physical proximity warning plus brief, non-blocking outcome transitions. Neither path owns
  // simulation time: the aircraft, carrier and opponent continue moving behind every cue.
  drawOutcomeCues(frame) {
    const { state } = frame;
    const ctx = this.ctx;
    const radarAltFt = Number(state.radar_alt_ft);
    const verticalSpeedFpm = Number(state.vertical_speed_fpm);

    // Actual surface proximity only: no training floor. A normal carrier approach (~650 fpm) is
    // quiet; a fast sink close to sea/deck level gets the urgent warning.
    if (state.auto_gcas_available !== true
        && Number.isFinite(radarAltFt) && Number.isFinite(verticalSpeedFpm)
        && radarAltFt < 500 && verticalSpeedFpm < -1000) {
      ctx.fillStyle = RED;
      ctx.font = "800 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const pullUpY = frame.padlock
        ? Math.max(this.safeInsets.top + 150, this.height - this.safeInsets.bottom - 286)
        : this.height - this.safeInsets.bottom - 104;
      ctx.fillText("PULL UP", this.width / 2, pullUpY);
    }

    const transitionTitle = typeof state.transition_cue === "string"
      ? state.transition_cue : "";
    const configurationTitle = typeof state.configuration_cue === "string"
      ? state.configuration_cue : "";
    const title = transitionTitle || configurationTitle;
    if (!title) return;
    const respawn = title.includes("RESPAWN");
    const trapped = title.includes("TRAPPED");
    const ready = title.includes("READY TO FIGHT") || title.includes("CONFIGURED");
    const accent = respawn ? RED : trapped || ready ? GREEN : AMBER;
    ctx.save();
    const w = Math.min(360, this.width - 34);
    const h = 48;
    const x = (this.width - w) / 2;
    const y = Math.max(this.safeInsets.top + 188, this.height * 0.24);
    this.glassPanel(x, y, w, h, accent);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = accent;
    ctx.shadowColor = trapped ? "rgba(77, 255, 136, 0.50)" : "transparent";
    ctx.shadowBlur = trapped ? 9 : 0;
    ctx.font = `800 ${title.length > 32 ? 12 : title.length > 24 ? 15 : 18}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.fillText(this.fitText(title, w - 24), this.width / 2, y + h / 2);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  drawDamageFeedback(frame) {
    const { state, now } = frame;
    const hitActive = now < this._damageFlashUntil;
    const destroyedActive = now < this._destroyedFlashUntil;
    if (!hitActive && !destroyedActive) return;

    const ctx = this.ctx;
    ctx.save();
    if (hitActive || destroyedActive) {
      const hitPhase = hitActive ? clamp((this._damageFlashUntil - now) / 0.48, 0, 1) : 0;
      const destroyedPhase = destroyedActive
        ? clamp((this._destroyedFlashUntil - now) / 1.2, 0, 1)
        : 0;
      const alpha = Math.max(hitPhase * 0.78, destroyedPhase * 0.9);
      const wash = ctx.createRadialGradient(
        this.width * 0.5,
        this.height * 0.48,
        Math.min(this.width, this.height) * 0.18,
        this.width * 0.5,
        this.height * 0.5,
        Math.max(this.width, this.height) * 0.68,
      );
      wash.addColorStop(0, "rgba(255, 35, 57, 0)");
      wash.addColorStop(0.62, `rgba(255, 35, 57, ${alpha * 0.08})`);
      wash.addColorStop(1, `rgba(255, 35, 57, ${alpha * 0.62})`);
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, this.width, this.height);

      ctx.fillStyle = RED;
      ctx.shadowColor = "rgba(255, 70, 93, 0.75)";
      ctx.shadowBlur = 12;
      ctx.font = "850 15px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const hitSuffix = this._incomingHitCount > 1 ? ` ×${this._incomingHitCount}` : "";
      ctx.fillText(destroyedActive ? "AIRFRAME LOST" : `AIRFRAME HIT${hitSuffix}`,
        this.width / 2, this.height - this.safeInsets.bottom - 136);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  fitText(text, maxWidth) {
    const ctx = this.ctx;
    if (ctx.measureText(text).width <= maxWidth) return text;
    let value = text;
    while (value.length > 3 && ctx.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1);
    return `${value}…`;
  }

  drawThrottle(state) {
    if (state.has_engine === false || state.fuel_consumes === false) return;
    const thr = Number(state.throttle);           // commanded lever, 0..1.3
    const eng = Number(state.engine_spool_fraction ?? state.engine); // spool/RPM state; LAGS lever
    if (!Number.isFinite(thr)) return;
    const ctx = this.ctx;
    const reportedMaximum = Number(state.max_thrust_fraction);
    const maxT = Number.isFinite(reportedMaximum) && reportedMaximum > 0
      ? reportedMaximum
      : 1.0;
    const hasAfterburner = state.has_afterburner === true && maxT > 1.0;
    // Big vertical bar immediately left of the speed tape, same height, so throttle reads as a
    // primary instrument next to airspeed.
    const centerY = this.getInstrumentCenterY();
    const h = Math.min(310, this.height * (this.touchMode ? 0.36 : 0.43));
    const w = 22;
    const x = this.getLayout().tapeInset - 52;
    const y = centerY - h / 2;
    const yOf = (f) => y + h - (clamp(f, 0, maxT) / maxT) * h;

    ctx.fillStyle = "rgba(1, 9, 14, 0.6)"; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(77, 255, 136, 0.35)"; ctx.lineWidth = 1.2; ctx.strokeRect(x, y, w, h);
    if (hasAfterburner) {
      ctx.fillStyle = "rgba(255, 176, 32, 0.16)";
      ctx.fillRect(x, yOf(maxT), w, yOf(1.0) - yOf(maxT));
    }
    // ENGINE fill = actual output; the GAP up to the lever caret is the spool lag you feel
    const ey = yOf(eng);
    ctx.fillStyle = eng > 1.005 ? AMBER : GREEN;
    ctx.fillRect(x + 1.5, ey, w - 3, y + h - ey);
    // Detent lines remain legible without standing labels.
    ctx.strokeStyle = "rgba(77, 255, 136, 0.45)"; ctx.lineWidth = 1;
    for (const f of [0.55, 0.85, 1.0]) { const t = yOf(f); ctx.beginPath(); ctx.moveTo(x, t); ctx.lineTo(x + w, t); ctx.stroke(); }
    // commanded LEVER caret: a bold triangle on the right edge showing where you set it
    const ly = yOf(thr);
    ctx.fillStyle = thr > 1.005 ? AMBER : GREEN;
    ctx.beginPath(); ctx.moveTo(x + w + 1, ly); ctx.lineTo(x + w + 11, ly - 6); ctx.lineTo(x + w + 11, ly + 6); ctx.closePath(); ctx.fill();

    if (hasAfterburner && eng > 1.005) {
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.font = "800 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillStyle = AMBER;
      ctx.fillText("A/B", x + w / 2, y + h + 11);
    }
  }

  drawFuel(state) {
    if (!Number.isFinite(Number(state.fuel_lb))) return;
    const readout = fuelReadout(state);
    const fuel = readout.fuelLb;
    const trend = Math.min(0, Number(state.fuel_trend_lb_min) || 0);
    const capacity = readout.capacityLb;
    const bingoThreshold = readout.bingoThresholdLb;
    const accent = readout.critical ? RED : readout.bingo ? AMBER : GREEN;
    const ctx = this.ctx;
    const width = Math.min(this.touchMode ? 176 : 218, this.width - this.safeInsets.left - this.safeInsets.right - 36);
    const height = 56;
    const x = this.touchMode
      ? Math.max(
        this.safeInsets.left + 18,
        this.width - this.getTapeInset() - 47 - width,
      )
      : this.width - this.safeInsets.right - width - 18;
    const y = this.height - this.safeInsets.bottom - (this.touchMode ? 124 : 92);
    const barX = x + 10;
    const barY = y + 45;
    const barWidth = width - 20;
    const fuelRatio = capacity > 0 ? clamp(fuel / capacity, 0, 1) : 0;
    const currentX = barX + barWidth * fuelRatio;
    const projectedRatio = capacity > 0 ? clamp((fuel + trend * 5) / capacity, 0, 1) : 0;
    const projectedX = barX + barWidth * projectedRatio;

    ctx.save();
    this.glassPanel(x, y, width, height, accent);
    ctx.font = "700 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = accent;
    ctx.font = "800 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.fillText(`${String(Math.round(fuel)).padStart(4, "0")} LB`, x + 10, y + 13);
    ctx.fillStyle = readout.bingo ? accent : GREEN;
    ctx.font = "800 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "right";
    ctx.fillText(readout.flowText, x + width - 10, y + 11);
    if (readout.flowUnitText) {
      ctx.fillStyle = GREEN_DIM;
      ctx.font = "650 6px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillText(readout.flowUnitText, x + width - 10, y + 21);
    }
    ctx.fillStyle = readout.bingo ? accent : GREEN_DIM;
    ctx.font = "800 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.fillText(readout.decisionText, x + 10, y + 29);

    ctx.fillStyle = "rgba(77, 255, 136, 0.12)";
    ctx.fillRect(barX, barY, barWidth, 5);
    ctx.fillStyle = accent;
    ctx.fillRect(barX, barY, barWidth * fuelRatio, 5);
    if (readout.consumesFuel && capacity > 0) {
      const bingoX = barX + barWidth * clamp(bingoThreshold / capacity, 0, 1);
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bingoX, barY - 2);
      ctx.lineTo(bingoX, barY + 7);
      ctx.stroke();
    }

    // Five-minute fuel trend: the vector points from current quantity to projected quantity.
    if (readout.consumesFuel && currentX - projectedX > 1.5) {
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

  drawSystemsPanel(systems) {
    if (!systems?.available || !systems.relevant) return;
    const ctx = this.ctx;
    const warning = systems.warnings.some((item) => item.level === "warning");
    const caution = systems.warnings.length > 0;
    const accent = warning ? RED : caution ? AMBER : GREEN;
    const width = this.touchMode ? 184 : 228;
    const height = this.touchMode ? 62 : 72;
    const x = this.width - this.safeInsets.right - width - 18;
    const fuelY = this.height - this.safeInsets.bottom - (this.touchMode ? 124 : 92);
    const y = Math.max(this.safeInsets.top + 24, fuelY - height - 8);
    const gearArrow = systems.gearHandle === "DOWN" ? "↓"
      : systems.gearHandle === "UP" ? "↑" : "—";
    const flapLever = systems.flapLever === "DOWN" ? "DN"
      : systems.flapLever === "HOLD" ? "HOLD"
        : systems.flapLever === "UP" ? "UP" : "--";
    const stateColor = (leg) => leg.state === "down" ? GREEN
      : leg.state === "transit" ? AMBER
        : leg.state === "up" ? GREEN_DIM : "rgba(207, 244, 222, 0.27)";

    ctx.save();
    this.glassPanel(x, y, width, height, accent);
    ctx.textBaseline = "middle";
    ctx.font = "800 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillStyle = systems.gearUnsafe || systems.gearLimitExceeded ? accent : GREEN;
    ctx.textAlign = "left";
    ctx.fillText(`GEAR ${gearArrow}`, x + 9, y + 13);

    if (systems.gearAvailable) {
      const legEntries = [
        ["N", systems.gear.nose],
        ["L", systems.gear.left],
        ["R", systems.gear.right],
      ];
      const legStartX = x + width - 89;
      legEntries.forEach(([label, leg], index) => {
        const legX = legStartX + index * 27;
        ctx.strokeStyle = stateColor(leg);
        ctx.lineWidth = 1;
        ctx.strokeRect(legX, y + 5, 21, 18);
        ctx.fillStyle = stateColor(leg);
        ctx.font = "800 7px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${label}:${leg.text}`, legX + 10.5, y + 14);
      });
    }

    ctx.font = "800 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = systems.flapSplit || systems.flapLimitExceeded ? accent : GREEN;
    ctx.fillText(`FLAP ${flapLever}`, x + 9, y + 34);
    ctx.textAlign = "right";
    ctx.fillText(systems.flapPositionText, x + width - 9, y + 34);

    const rpm = systems.engineRpmPct === null ? "RPM --"
      : `RPM ${Math.round(systems.engineRpmPct)}%`;
    const engineText = systems.engineRunning === false ? `${rpm} OUT` : rpm;
    const hydText = systems.utilityHydraulicPressurePsi === null
      ? "HYD --"
      : `HYD ${Math.round(systems.utilityHydraulicPressurePsi)}`;
    const busText = systems.primaryBusPowered === null ? "BUS --"
      : systems.primaryBusPowered ? "BUS ON" : "BUS OFF";
    ctx.font = "700 7px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillStyle = systems.engineRunning === false ? RED : GREEN_DIM;
    ctx.textAlign = "left";
    ctx.fillText(engineText, x + 9, y + height - 10);
    ctx.fillStyle = GREEN_DIM;
    ctx.textAlign = "center";
    ctx.fillText(hydText, x + width * 0.59, y + height - 10);
    ctx.fillStyle = systems.primaryBusPowered === false ? AMBER : GREEN_DIM;
    ctx.textAlign = "right";
    ctx.fillText(busText, x + width - 9, y + height - 10);
    ctx.restore();
  }

  drawPadlockSa(frame, systems = null, noseAnchor = null) {
    if (!frame.padlock) {
      this._carrierPatternCue.reset();
      return;
    }

    const padlockCtx = this.ctx;
    const padlockCamera = frame.camera;
    this.noseCameraVector.copy(frame.playerForward)
      .transformDirection(padlockCamera.matrixWorldInverse);
    this.liftCameraVector.copy(frame.playerUp)
      .transformDirection(padlockCamera.matrixWorldInverse);
    this.worldUpCameraVector.copy(this.worldUpVector)
      .transformDirection(padlockCamera.matrixWorldInverse);
    const orientation = padlockOrientationModel({
      noseCamera: this.noseCameraVector,
      liftCamera: this.liftCameraVector,
      worldUpCamera: this.worldUpCameraVector,
      sensorYawRad: frame.sensorYaw,
      sensorPitchRad: frame.sensorPitch,
    });

    const targetLabel = frame.padlockTarget === "carrier" ? "BOAT" : "BANDIT";
    const phase = frame.manualLookActive ? "SLEW · RELEASE TO RETURN" : frame.padlockPhase || "TRACK";
    const modeText = `${targetLabel} PADLOCK · ${phase} · V FORWARD`;
    padlockCtx.save();
    padlockCtx.font = "800 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const modeWidth = Math.min(this.width - 28, padlockCtx.measureText(modeText).width + 18);
    const modeX = (this.width - modeWidth) / 2;
    const modeY = this.safeInsets.top + 54;
    this.glassPanel(modeX, modeY, modeWidth, 20, frame.manualLookActive ? AMBER : GREEN_DIM);
    padlockCtx.fillStyle = frame.manualLookActive ? AMBER : GREEN;
    padlockCtx.textAlign = "center";
    padlockCtx.textBaseline = "middle";
    padlockCtx.fillText(this.fitText(modeText, modeWidth - 12), this.width / 2, modeY + 10);

    // These cues exist only when the pilot is actually looking away from the waterline. Together
    // they answer the useful BFM question: where is the nose, which way should I roll, then pull?
    const offAxis = Math.abs(Number(frame.sensorYaw) || 0) > 10 * DEG
      || Math.abs(Number(frame.sensorPitch) || 0) > 8 * DEG
      || frame.manualLookActive === true;
    if (offAxis) {
      const targetSafe = this.getLayout().targetSafe;
      const left = targetSafe.left + 12;
      const right = targetSafe.right - 12;
      const top = Math.max(
        targetSafe.top + 12,
        this.safeInsets.top + (this.height < 400 ? 112 : 148),
      );
      const bottom = Math.min(
        targetSafe.bottom - 12,
        this.height - this.safeInsets.bottom - (this.touchMode ? 116 : 70),
      );
      const centreX = (left + right) * 0.5;
      const centreY = clamp(
        this.getInstrumentCenterY(),
        top + 26,
        Math.max(top + 26, bottom - 26),
      );
      const anchorVisible = noseAnchor && !noseAnchor.behind
        && Number.isFinite(noseAnchor.x) && Number.isFinite(noseAnchor.y)
        && noseAnchor.x >= left && noseAnchor.x <= right
        && noseAnchor.y >= top && noseAnchor.y <= bottom;
      let noseX;
      let noseY;
      let noseDirectionX;
      let noseDirectionY;
      if (anchorVisible) {
        noseX = noseAnchor.x;
        noseY = noseAnchor.y;
        noseDirectionX = orientation.nose.x;
        noseDirectionY = orientation.nose.y;
      } else {
        let dx = orientation.nose.x;
        let dy = orientation.nose.y;
        if (noseAnchor && !noseAnchor.behind
            && Number.isFinite(noseAnchor.x) && Number.isFinite(noseAnchor.y)) {
          dx = noseAnchor.x - centreX;
          dy = noseAnchor.y - centreY;
          const magnitude = Math.hypot(dx, dy) || 1;
          dx /= magnitude;
          dy /= magnitude;
        }
        const scale = Math.min(
          (dx >= 0 ? right - centreX : centreX - left) / Math.max(Math.abs(dx), 0.001),
          (dy >= 0 ? bottom - centreY : centreY - top) / Math.max(Math.abs(dy), 0.001),
        );
        noseX = centreX + dx * scale;
        noseY = centreY + dy * scale;
        noseDirectionX = dx;
        noseDirectionY = dy;
      }

      padlockCtx.save();
      padlockCtx.translate(noseX, noseY);
      if (!anchorVisible) {
        padlockCtx.rotate(Math.atan2(noseDirectionY, noseDirectionX));
        this.setLine(AMBER, 1.7);
        padlockCtx.beginPath();
        padlockCtx.moveTo(11, 0);
        padlockCtx.lineTo(-5, -7);
        padlockCtx.lineTo(-2, 0);
        padlockCtx.lineTo(-5, 7);
        padlockCtx.stroke();
        padlockCtx.rotate(-Math.atan2(noseDirectionY, noseDirectionX));
      }
      padlockCtx.fillStyle = AMBER;
      padlockCtx.font = "800 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      padlockCtx.textAlign = "center";
      padlockCtx.fillText("NOSE", 0, anchorVisible ? 17 : -12);
      padlockCtx.restore();

      // Lift-vector caret is centred in the current view, not on a duplicated attitude gauge. A
      // roll moves this caret around the target; a pull moves the nose in the indicated direction.
      if (orientation.liftValid) {
        const pullRadius = 47;
        const pullX = centreX + orientation.lift.x * pullRadius;
        const pullY = centreY + orientation.lift.y * pullRadius;
        padlockCtx.strokeStyle = GREEN;
        padlockCtx.fillStyle = GREEN;
        padlockCtx.lineWidth = 1.5;
        padlockCtx.beginPath();
        padlockCtx.moveTo(centreX + orientation.lift.x * 29, centreY + orientation.lift.y * 29);
        padlockCtx.lineTo(pullX, pullY);
        padlockCtx.stroke();
        padlockCtx.save();
        padlockCtx.translate(pullX, pullY);
        padlockCtx.rotate(Math.atan2(orientation.lift.y, orientation.lift.x));
        padlockCtx.beginPath();
        padlockCtx.moveTo(7, 0);
        padlockCtx.lineTo(-4, -4);
        padlockCtx.lineTo(-4, 4);
        padlockCtx.closePath();
        padlockCtx.fill();
        padlockCtx.restore();
        padlockCtx.font = "750 7px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        padlockCtx.textAlign = "center";
        padlockCtx.fillText("PULL", pullX + orientation.lift.x * 14, pullY + orientation.lift.y * 14);
      }

      if (orientation.horizonValid) {
        const horizonX = centreX;
        const horizonY = clamp(centreY + 75, top + 24, bottom - 18);
        padlockCtx.strokeStyle = GREEN_DIM;
        padlockCtx.lineWidth = 1.2;
        padlockCtx.beginPath();
        padlockCtx.moveTo(
          horizonX - orientation.horizon.x * 25,
          horizonY - orientation.horizon.y * 25,
        );
        padlockCtx.lineTo(
          horizonX + orientation.horizon.x * 25,
          horizonY + orientation.horizon.y * 25,
        );
        padlockCtx.stroke();
        padlockCtx.fillStyle = GREEN_DIM;
        padlockCtx.beginPath();
        padlockCtx.moveTo(
          horizonX + orientation.worldUp.x * 16,
          horizonY + orientation.worldUp.y * 16,
        );
        padlockCtx.lineTo(
          horizonX + orientation.worldUp.x * 8 - orientation.horizon.x * 3,
          horizonY + orientation.worldUp.y * 8 - orientation.horizon.y * 3,
        );
        padlockCtx.lineTo(
          horizonX + orientation.worldUp.x * 8 + orientation.horizon.x * 3,
          horizonY + orientation.worldUp.y * 8 + orientation.horizon.y * 3,
        );
        padlockCtx.closePath();
        padlockCtx.fill();
      }
    }
    padlockCtx.restore();

    if (frame.padlockTarget === "carrier") {
      // The pattern map solves recovery geometry when tracking the boat, but it should not cover
      // the world while the pilot is deliberately slewing their head away from it.
      if (!frame.manualLookActive) this.drawCarrierPadlockSa(frame, systems);
      return;
    }
    this._carrierPatternCue.reset();
    // IAS/altitude/G/power/fuel and target range/closure remain in their normal locations. The old
    // duplicate bottom instrument card added eye travel without adding any decision information.
    return;

  }

  drawCarrierPadlockSa(frame, systems = null) {
    const state = frame.state;
    const ctx = this.ctx;
    const sideMargin = 12;
    const availableWidth = Math.max(1,
      this.width - this.safeInsets.left - this.safeInsets.right - sideMargin * 2);
    const compact = availableWidth < 620 || this.height < 560;
    const width = Math.min(compact ? 480 : 660, availableWidth);
    const nominalHeight = compact ? 164 : 174;
    const controlClearance = this.touchMode ? 148 : 108;
    const bottomLimit = this.height - this.safeInsets.bottom - controlClearance;
    const minimumHeight = compact ? 92 : 132;
    // Short landscape phones need the pattern card above three rows of real system controls.
    // Move the card upward and allow a denser row pitch; never preserve a nominal panel height by
    // drawing through the buttons the pilot is trying to use.
    const desiredTop = this.safeInsets.top + (compact ? 112 : 150);
    const topLimit = Math.min(desiredTop,
      Math.max(this.safeInsets.top + 64, bottomLimit - minimumHeight));
    const height = Math.max(minimumHeight,
      Math.min(nominalHeight, bottomLimit - topLimit));
    const x = this.safeInsets.left + (availableWidth - width) / 2 + sideMargin;
    const y = Math.max(topLimit, bottomLimit - height);
    const inset = compact ? 8 : 12;
    const mapWidth = compact ? Math.max(126, width * 0.44) : Math.min(300, width * 0.47);
    const mapLeft = x + inset;
    const mapTop = y + inset;
    const mapRight = mapLeft + mapWidth;
    const mapBottom = y + height - inset;
    const mapHeight = mapBottom - mapTop;
    const mapCentreX = mapLeft + mapWidth * 0.61;
    const mapCentreY = mapTop + Math.min(31, mapHeight * 0.22);
    const metresPerPixel = Math.max(48, 5900 / Math.max(82, mapHeight - 22));
    const cue = this._carrierPatternCue.update(state, frame.dt);
    const configuration = carrierConfigurationCue(systems);
    const along = Number(state.deck_along);
    const cross = Number(state.deck_cross);
    const relativeMotion = carrierRelativeMotion(state);
    const deckLength = Math.max(180, Number(state.deck_len) || 250);
    const deckWidth = Math.max(25, Number(state.deck_w) || 32);
    const mapPoint = (alongM, crossM) => ({
      x: mapCentreX + crossM / metresPerPixel,
      y: mapCentreY - alongM / metresPerPixel,
    });

    ctx.save();
    this.glassPanel(x, y, width, height, "rgba(255, 176, 32, 0.52)");
    ctx.fillStyle = "rgba(1, 8, 12, 0.46)";
    roundedRect(ctx, mapLeft, mapTop, mapWidth, mapHeight, 5);
    ctx.fill();

    // The inbound initial begins astern, crosses toward the bow, then breaks into a port
    // downwind. A small starboard offset keeps the high-speed initial distinct from final.
    const initial = mapPoint(-5556, 320);
    const breakPoint = mapPoint(450, 320);
    const downwindEntry = mapPoint(250, -900);
    const downwind180 = mapPoint(-1650, -900);
    const finalTurn = mapPoint(-2250, 0);
    const deckCentre = mapPoint(0, 0);

    ctx.save();
    roundedRect(ctx, mapLeft, mapTop, mapWidth, mapHeight, 5);
    ctx.clip();
    ctx.strokeStyle = "rgba(77, 255, 136, 0.38)";
    ctx.lineWidth = 1.25;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(initial.x, initial.y);
    ctx.lineTo(breakPoint.x, breakPoint.y);
    ctx.bezierCurveTo(
      mapPoint(250, -160).x, mapPoint(250, -160).y,
      mapPoint(500, -760).x, mapPoint(500, -760).y,
      downwindEntry.x, downwindEntry.y,
    );
    ctx.lineTo(downwind180.x, downwind180.y);
    ctx.bezierCurveTo(
      mapPoint(-2050, -900).x, mapPoint(-2050, -900).y,
      mapPoint(-2450, -420).x, mapPoint(-2450, -420).y,
      finalTurn.x, finalTurn.y,
    );
    ctx.lineTo(deckCentre.x, deckCentre.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const deckPxLength = Math.max(7, deckLength / metresPerPixel);
    const deckPxWidth = Math.max(3, deckWidth / metresPerPixel);
    ctx.fillStyle = "rgba(77, 255, 136, 0.42)";
    ctx.fillRect(
      deckCentre.x - deckPxWidth / 2,
      deckCentre.y - deckPxLength / 2,
      deckPxWidth,
      deckPxLength,
    );
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(deckCentre.x + 11, deckCentre.y - 15);
    ctx.lineTo(deckCentre.x + 11, deckCentre.y + 15);
    ctx.lineTo(deckCentre.x + 7, deckCentre.y + 9);
    ctx.moveTo(deckCentre.x + 11, deckCentre.y + 15);
    ctx.lineTo(deckCentre.x + 15, deckCentre.y + 9);
    ctx.stroke();

    if (Number.isFinite(along) && Number.isFinite(cross)) {
      const rawOwnship = mapPoint(along, cross);
      const ownshipX = clamp(rawOwnship.x, mapLeft + 8, mapRight - 8);
      const ownshipY = clamp(rawOwnship.y, mapTop + 8, mapBottom - 8);
      const offScale = ownshipX !== rawOwnship.x || ownshipY !== rawOwnship.y;
      const track = relativeMotion.trackRad ?? 0;
      ctx.save();
      ctx.translate(ownshipX, ownshipY);
      ctx.rotate(track);
      ctx.fillStyle = offScale ? AMBER : GREEN;
      ctx.strokeStyle = offScale ? AMBER : GREEN;
      ctx.shadowColor = offScale ? "rgba(255, 176, 32, 0.55)" : "rgba(77, 255, 136, 0.60)";
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(-4.5, 5.5);
      ctx.lineTo(0, 3);
      ctx.lineTo(4.5, 5.5);
      ctx.closePath();
      if (offScale) ctx.stroke();
      else ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    ctx.fillStyle = GREEN_DIM;
    ctx.font = "650 7px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("DECK UP", mapLeft + 5, mapTop + 7);
    ctx.fillText("INITIAL", clamp(initial.x + 4, mapLeft + 3, mapRight - 38),
      clamp(initial.y, mapTop + 6, mapBottom - 6));
    ctx.fillText("180", clamp(downwind180.x - 17, mapLeft + 3, mapRight - 18),
      clamp(downwind180.y, mapTop + 6, mapBottom - 6));
    ctx.fillText("FINAL", clamp(finalTurn.x + 4, mapLeft + 3, mapRight - 31),
      clamp(finalTurn.y - 6, mapTop + 6, mapBottom - 6));
    ctx.fillStyle = AMBER;
    const wodText = `WOD ${Math.round(Number(state.wod_kts) || 0)}`;
    ctx.fillText(wodText, clamp(deckCentre.x + 18, mapLeft + 3, mapRight - 42),
      clamp(deckCentre.y + 3, mapTop + 6, mapBottom - 6));

    const dataLeft = mapRight + (compact ? 9 : 15);
    const dataRight = x + width - inset;
    const dataWidth = Math.max(20, dataRight - dataLeft);
    const distanceM = carrierDistanceM(state);
    const airdata = airdataReadout(state);
    const displayIndicated = Number.isFinite(frame.displayAirdata?.indicatedKts)
      ? frame.displayAirdata.indicatedKts : airdata.indicatedKts;
    const displayAltitude = Number.isFinite(frame.displayAirdata?.altitudeFt)
      ? frame.displayAirdata.altitudeFt : Number(state.alt_ft) || 0;
    const brc = wrap360((Number(state.cheading) || 0) * RAD_TO_DEG);
    const finalCourse = wrap360((Number(state.landing_heading) || 0) * RAD_TO_DEG);
    const showRecoveryAoA = carrierAoARelevant(cue.phase);
    const aoa = Number(state.aoa_deg);
    const onSpeed = Number(state.effective_on_speed_aoa_deg);
    const tolerance = Number(state.on_speed_aoa_tolerance_deg);
    const aoaState = showRecoveryAoA
      ? this._aoaIndexerCue.update({ aoa, onSpeed, tolerance }, frame.dt)
      : (this._aoaIndexerCue.reset(), null);
    const aoaText = showRecoveryAoA && Number.isFinite(aoa)
      ? ` · α ${aoa.toFixed(1)}° ${aoaState === "FAST" ? "FAST" : aoaState === "SLOW" ? "SLOW" : aoaState === "ON_SPEED" ? "ON" : ""}`
      : "";
    const gearWarning = systems?.gearWarningHorn || systems?.gearLimitExceeded
      || systems?.gearUnsafe;
    const rowStep = (height - 24) / 6;
    const rowY = (index) => y + 14 + rowStep * index;
    const drawFit = (text, index, color = GREEN_DIM, font = null) => {
      ctx.fillStyle = color;
      ctx.font = font ?? `${compact ? 650 : 700} ${compact ? 7 : 8}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.fillText(this.fitText(text, dataWidth), dataLeft, rowY(index));
    };

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    drawFit(cue.title, 0, AMBER,
      `800 ${compact ? 11 : 13}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`);
    drawFit(cue.instruction, 1, GREEN,
      `700 ${compact ? 7 : 9}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`);
    drawFit(`${Math.round(displayIndicated)} KIAS · ${Math.round(displayAltitude)} FT${aoaText}`,
      2, aoaState === "SLOW" ? RED : aoaState === "FAST" ? AMBER : GREEN_DIM);
    drawFit(`BOAT ${distanceM === null ? "---" : (distanceM / 1852).toFixed(1)} NM · BRC ${String(Math.round(brc)).padStart(3, "0")}° · FNL ${String(Math.round(finalCourse)).padStart(3, "0")}°`,
      3, GREEN_DIM);
    drawFit(`REL ${Number.isFinite(along) ? Math.round(along) : "---"} M · XTK ${Number.isFinite(cross) ? formatSigned(cross) : "---"} M · TRK ${Number.isFinite(relativeMotion.trackRad) ? `${formatSigned(relativeMotion.trackRad * RAD_TO_DEG)}°` : "---"}`,
      4, GREEN_DIM);
    drawFit(configuration.gearText, 5,
      configuration.gearLocked ? GREEN : gearWarning ? RED : AMBER);
    drawFit(configuration.flapText, 6,
      configuration.flapSplit ? RED : configuration.flapsKnown ? GREEN : GREEN_DIM);
    ctx.restore();
  }

  drawVisualMergeWeaponsCue(frame) {
    const cue = visualMergeWeaponsCue(frame.state);
    if (!cue) return;

    const ctx = this.ctx;
    const accent = cue.level === "warning" ? RED
      : cue.level === "caution" ? AMBER : GREEN;
    const y = this.height - this.safeInsets.bottom - (this.touchMode ? 110 : 21);
    ctx.save();
    ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const maximumWidth = Math.max(72,
      this.width - this.safeInsets.left - this.safeInsets.right - 20);
    const width = Math.min(maximumWidth,
      Math.max(92, ctx.measureText(cue.text).width + 28));
    this.glassPanel((this.width - width) / 2, y - 14, width, 28, accent);
    ctx.fillStyle = accent;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.fitText(cue.text, width - 18), this.width / 2, y);
    ctx.restore();
  }

  drawFooter(frame) {
    const state = frame.state;
    const mode = hudMode(state);
    if (state.carrier !== true || (mode !== "APPROACH" && mode !== "WAVE-OFF")) {
      this._lsoDisplayCue.reset();
      return;
    }
    const rawCall = lsoToken(String(state.lso ?? state.context ?? ""));
    const severity = String(state.lso_severity ?? "").toUpperCase();
    const urgent = rawCall === "WAVE OFF" || severity === "WAVEOFF";
    const cue = this._lsoDisplayCue.update(rawCall ? {
      key: `${rawCall}:${severity}`,
      call: rawCall,
      severity,
    } : null, frame.dt, { urgent });
    if (!cue) return;

    const ctx = this.ctx;
    const accent = cue.call === "WAVE OFF" ? RED : cue.severity === "CORRECTING" ? AMBER : GREEN;
    const y = this.height - this.safeInsets.bottom - (this.touchMode ? 110 : 21);
    ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const width = Math.max(72, ctx.measureText(cue.call).width + 28);
    this.glassPanel((this.width - width) / 2, y - 14, width, 28, accent);
    ctx.fillStyle = accent;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cue.call, this.width / 2, y);
  }

  drawLegend(frame) {
    if (!this.legendVisible || this.touchMode || document.documentElement.classList.contains("touch-mode")) return;
    const ctx = this.ctx;
    const panelWidth = Math.min(930, this.width - 34);
    const compact = this.width < 760;
    const gcasAvailable = frame.state.auto_gcas_available === true;
    const panelHeight = compact ? (gcasAvailable ? 229 : 202) : (gcasAvailable ? 195 : 164);
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
      "G  GEAR   ·   [ / ]  FLAPS UP / DOWN (RELEASE TO HOLD)   ·   F  GUNS   ·   V  TARGET / BOAT PADLOCK   ·   DRAG LOOK / 2-FINGER TEMP LOOK",
      "SPACE  LIMIT OVERRIDE (HIGH-Q G / LOW-Q AOA — CAN DEPART)   ·   1–8  MISSION   ·   R  RESTART   ·   M  SOUND   ·   H  HIDE",
    ];
    const compactLines = [
      "DOWN / UP  PULL / PUSH   ·   LEFT / RIGHT  ROLL",
      "A / D  RUDDER   ·   W / S  THROTTLE",
      "G  GEAR   ·   [ / ]  FLAPS UP / DOWN (RELEASE = HOLD)",
      "SPACE  LIMIT OVR (HIGH-Q G / LOW-Q AOA — CAN DEPART)   ·   F  GUNS   ·   M  SOUND",
      "V  PADLOCK   ·   DRAG LOOK / 2-FINGER TEMP LOOK   ·   1–8  MISSION   ·   R  RESTART   ·   H  HIDE",
    ];
    if (gcasAvailable) {
      wideLines.push("K  AGCAS PADDLE (HOLD TO OVERRIDE AN ACTIVE FLY-UP)");
      compactLines.push("K  AGCAS PADDLE (HOLD TO OVERRIDE FLY-UP)");
    }
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
    this.updateGunAudio(frame);
    this.updateGcasAudio(frame);
    const display = this._signals.update(frame.state, frame.dt);
    frame.displayAirdata = display;
    const gunSolutionEntityId = String(frame.state.player_entity_id ?? "legacy");
    if (gunSolutionEntityId !== this._gunSolutionEntityId) {
      this._gunSolutionEntityId = gunSolutionEntityId;
      this._gunSolutionCue.reset();
    }
    frame.visualGunSolution = this._gunSolutionCue.update(
      { key: hasGunSolution(frame.state) ? "solution" : "no-solution" },
      frame.dt,
    )?.key === "solution";

    this.worldPoint.copy(frame.playerPosition).addScaledVector(frame.playerForward, 10000);
    const noseAnchor = this.project(this.worldPoint, frame.camera, this.noseProjection);
    const flightPathAnchor = frame.flightPathPoint
      ? this.project(frame.flightPathPoint, frame.camera, this.projectionB)
      : null;
    const directorAnchor = frame.directorPoint
      ? this.project(frame.directorPoint, frame.camera, this.projectionC)
      : null;
    const systems = systemsReadout(frame.state);
    const carrierPadlock = frame.padlock && frame.padlockTarget === "carrier";

    if (!frame.padlock) this.drawPitchLadder(frame.state, frame.camera);
    this.drawAirframeSymbols(noseAnchor, frame.state, flightPathAnchor);
    this.drawGunSight(frame, noseAnchor);
    this.drawAimPoint(frame, noseAnchor, directorAnchor);
    this.drawBandit(frame);
    this.drawHeadingTape(frame.state, { headingDeg: display.headingDeg, headingDigits: display.headingDigits, padlock: frame.padlock });
    this.drawRtbCue(frame.state);

    // Speed trend: smoothed dV/dt, projected ~6 s ahead (the classic acceleration caret).
    const spd = display.indicatedKts;
    const dt = Math.max(1e-3, Number(frame.dt) || 1 / 60);
    const speedEntityId = String(frame.state.player_entity_id ?? "legacy");
    if (this._speedEntityId !== speedEntityId) {
      this._speedEntityId = speedEntityId;
      this._prevSpeed = spd;
      this._speedRate = 0;
    }
    if (this._prevSpeed === undefined) this._prevSpeed = spd;
    const inst = (spd - this._prevSpeed) / dt;                 // kts/s
    const speedBlend = 1 - Math.exp(-dt / 0.20);
    this._speedRate = (this._speedRate || 0)
      + speedBlend * (inst - (this._speedRate || 0));
    this._prevSpeed = spd;
    const speedTrend = clamp(this._speedRate * 6, -60, 60);    // project 6 s, cap for tape sanity

    const tapeInset = this.getLayout().tapeInset;
    this.drawVerticalTape({
      value: spd,
      displayValue: display.indicatedDigits,
      x: tapeInset,
      floor: 0,
      step: 20,
      decimals: 0,
      trend: speedTrend,
      lowSpeed: stallAwareness(frame.state),
      fixedMarkers: speedTapeMarkers(frame.state),
    });
    this.drawAirdataLabels(frame.state, tapeInset, display);
    this.drawVerticalTape({
      value: display.altitudeFt,
      displayValue: display.altitudeDigits,
      x: this.width - tapeInset,
      floor: 0,
      step: frame.state.alt_ft > 10000 ? 1000 : 500,
      decimals: 0,
    });
    if (isFightHudActive(frame.state)) this.drawGTape(frame.state);
    this.drawThrottle(frame.state);
    this.drawFuel(frame.state);
    this.drawWarnings(frame, systems);
    if (!carrierPadlock) {
      this.drawSystemsPanel(systems);
      this.drawAoAIndexer(frame.state, frame.dt);
    }
    this.drawPadlockSa(frame, systems, noseAnchor);
    this.drawSortieStatus(frame);
    this.drawVisualMergeWeaponsCue(frame);
    this.drawFooter(frame);
    this.drawLegend(frame);
    this.drawModeCue(frame);
    this.drawOutcomeCues(frame);
    this.drawDamageFeedback(frame);
  }
}

export function createHud(canvas) {
  return new CombatHud(canvas);
}
