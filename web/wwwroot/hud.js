import * as THREE from "./vendor/three.module.js";
import {
  airdataReadout,
  fuelReadout,
  speedTapeMarkers,
  stallAwareness,
  systemsReadout,
  targetClosureReadout,
  targetRangeReadout,
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
import {
  padlockLiftPlaneModel,
  padlockOrientationModel,
} from "./render/camera/padlock_controller.js";
import {
  HudSignalStabilizer,
  latchedRectVisibility,
  VisibilityEnvelope,
} from "./render/hud/hud_stabilizer.js";
import { AoAIndexerQualifier, DisplayCueQualifier } from "./render/hud/stable_cues.js";
import { fighterHudLayout } from "./render/hud/fighter_layout.js";
import {
  gunFunnelProfile,
  gunFunnelRail,
  gunFunnelEnvelope,
  gunFunnelUsable,
} from "./render/hud/gun_funnel.js";

const GREEN = "#4dff88";
const GREEN_DIM = "rgba(77, 255, 136, 0.68)";
const GREEN_FAINT = "rgba(77, 255, 136, 0.18)";
const AMBER = "#ffb020";
const RED = "#ff465d";
const GLASS = "rgba(2, 10, 16, 0.72)";
const DEG = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const MODE_CUE_SECONDS = 1.5;
const GUN_HEAT_AMBER_THRESHOLD = 0.7;
const GUN_OVERHEAT_FLASH_HZ = 2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finiteHudNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function controlBindingLabel(code, fallback) {
  const labels = {
    ArrowDown: "DOWN", ArrowUp: "UP", ArrowLeft: "LEFT", ArrowRight: "RIGHT",
    Space: "SPACE", BracketLeft: "[", BracketRight: "]",
  };
  const value = String(code ?? fallback ?? "").trim();
  if (labels[value]) return labels[value];
  if (/^Key[A-Z]$/.test(value)) return value.slice(3);
  if (/^Digit[0-9]$/.test(value)) return value.slice(5);
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase();
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
    case "SINK RATE · POWER": return "ADD POWER NOW";
    case "ADD POWER NOW": return "ADD POWER NOW";
    case "COME LEFT": return "COME LEFT";
    case "COME RIGHT": return "COME RIGHT";
    case "WAVE OFF, WAVE OFF": return "WAVE OFF";
    default: return "";
  }
}

function gunCue(state, hitFlash, solution = hasGunSolution(state)) {
  if (state.gun_overheat === true) return "OVERHEAT";
  if (hitFlash) return "HITS";
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

// Single source of truth for "the padlock view is genuinely looking away from the nose".
// drawPadlockSa draws its off-axis cues (including the bandit edge caret) exactly when this is
// true, and drawBandit suppresses its own off-screen locator under the same predicate, so the
// two arrows can never disagree about where the bandit is.
function padlockLooksOffAxis(frame) {
  return Math.abs(Number(frame.sensorYaw) || 0) > 10 * DEG
    || Math.abs(Number(frame.sensorPitch) || 0) > 8 * DEG
    || frame.manualLookActive === true;
}

class CombatHud {
  constructor(canvas) {
    this.canvas = canvas;
    // Render a complete HUD frame away from the visible canvas, then replace the presentation
    // surface in one copy operation. This prevents a compositor flush from exposing the clear or
    // a partially drawn HUD while the WebGL frame beneath it is already visible.
    this._hudSurface = document.createElement("canvas");
    this.ctx = this._hudSurface.getContext("2d", { alpha: true });
    this._presentationCtx = canvas.getContext("2d", { alpha: true });
    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;
    this.legendVisible = false;
    this.touchMode = false;
    this.controlBindings = null;
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
    this._funnelTargetProj = { x: 0, y: 0, ndcX: 0, ndcY: 0, cameraX: 0, cameraY: 0, cameraZ: 0, behind: false };
    this._trajectoryProj = { x: 0, y: 0, ndcX: 0, ndcY: 0, cameraX: 0, cameraY: 0, cameraZ: 0, behind: false };
    this.velocityDirection = new THREE.Vector3();
    // Harness-only geometry record (window.__HUD_DEBUG__); null in production, so the hot draw
    // path pays a single boolean test per frame.
    this._debug = null;
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
    this._lsoDisplayCue = new DisplayCueQualifier({
      acquireSeconds: 0.55,
      releaseSeconds: 0.50,
    });
    this._gunSolutionCue = new DisplayCueQualifier({ acquireSeconds: 0.05, releaseSeconds: 0.09 });
    this._gunSolutionEntityId = "";
    this._signals = new HudSignalStabilizer();
    this._leadPipperEnvelope = new VisibilityEnvelope({
      attackSeconds: 0.035,
      releaseSeconds: 0.12,
    });
    this._buffetEnvelope = new VisibilityEnvelope({ releaseSeconds: 0.22 });
    this._pullUpEnvelope = new VisibilityEnvelope({ releaseSeconds: 0.24 });
    this._lastLeadPipperX = null;
    this._lastLeadPipperY = null;
    this._banditMarkerInside = false;
    this._banditMarkerEntityId = "";
    this._padlockLiftCaptured = false;
    this._padlockCaptureEntityId = "";
    this._padlockTrackEstablished = false;
  }

  resize(width, height, pixelRatio, safeInsets = null) {
    const nextWidth = Math.max(1, Number(width) || 1);
    const nextHeight = Math.max(1, Number(height) || 1);
    const nextPixelRatio = Math.max(1, Number(pixelRatio) || 1);
    const backingWidth = Math.max(1, Math.round(nextWidth * nextPixelRatio));
    const backingHeight = Math.max(1, Math.round(nextHeight * nextPixelRatio));
    const backingStoreChanged = this.canvas.width !== backingWidth
      || this.canvas.height !== backingHeight
      || this._hudSurface.width !== backingWidth
      || this._hudSurface.height !== backingHeight;
    this.width = nextWidth;
    this.height = nextHeight;
    this.pixelRatio = nextPixelRatio;
    if (safeInsets) this.safeInsets = safeInsets;
    this.canvas.style.width = `${nextWidth}px`;
    this.canvas.style.height = `${nextHeight}px`;
    if (!backingStoreChanged) return;
    this.canvas.width = backingWidth;
    this.canvas.height = backingHeight;
    this._hudSurface.width = backingWidth;
    this._hudSurface.height = backingHeight;
  }

  commitFrame() {
    const ctx = this._presentationCtx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(this._hudSurface, 0, 0);
    ctx.restore();
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

  setControlBindings(bindings) {
    this.controlBindings = bindings && typeof bindings === "object" ? { ...bindings } : null;
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
    return this.setAudioEnabled(!this.audioEnabled);
  }

  setAudioEnabled(enabled) {
    this.audioEnabled = Boolean(enabled);
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
      && frame.state.gun_overheat !== true;
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

  getTapeInset() {
    return this.getLayout().tapeInset;
  }

  getInstrumentCenterY() {
    return this.getLayout().instrumentCenterY;
  }

  getLayout() {
    return fighterHudLayout({
      width: this.width,
      height: this.height,
      touchMode: this.touchMode,
      safeInsets: this.safeInsets,
    });
  }

  drawPitchLadder(state, camera) {
    const ctx = this.ctx;
    const bank = -(Number(state.bank_deg) || 0) * DEG;
    const pitch = Number(state.pitch_deg) || 0;
    const radius = Math.max(120, this.height * 0.42);
    const projection = camera?.projectionMatrix?.elements;
    const matrixScaleY = Number(projection?.[5]);
    // The ladder is drawn with the SAME projection as the rendered world — no synthetic
    // pixels-per-degree fallback. Without a live camera matrix there is no honest ladder.
    if (!Number.isFinite(matrixScaleY) || matrixScaleY <= 0) return;
    const focalLengthY = this.height * 0.5 * matrixScaleY;
    // Match the PerspectiveCamera principal point. The normal FPV camera has no view offset, so
    // this is the exact canvas centre; retaining the matrix term keeps the HUD calibrated if that
    // ever changes.
    const projectionCenterX = this.width * (0.5 - (Number(projection?.[8]) || 0) * 0.5);
    const projectionCenterY = this.height * (0.5 + (Number(projection?.[9]) || 0) * 0.5);
    const cosBank = Math.cos(bank);
    const sinBank = Math.sin(bank);
    const layout = this.getLayout();
    const safe = layout.ladderSafe;
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
    // Declutter exclusion: rungs must not stab through the gunsight/FPV working area at screen
    // centre. Even-odd clip = everything except a circle around the projection centre. The rungs
    // keep their own centre gap as well, so the ladder still reads as one instrument.
    const exclusionRadius = clamp(this.height * 0.115, 72, 102);
    ctx.beginPath();
    ctx.rect(0, 0, this.width, this.height);
    ctx.arc(projectionCenterX, projectionCenterY, exclusionRadius, 0, Math.PI * 2);
    ctx.clip("evenodd");

    ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
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
      const edgeAlpha = clamp((radius + 1 - rotatedDistance) / 26, 0, 1);
      if (edgeAlpha <= 0) continue;

      const major = rung % 10 === 0;
      // Long continuous bars (F-16 style): the horizon is the dominant rung, majors are long
      // enough to read as one line under bank, minors stay short so the ladder does not bar-code.
      const halfWidth = rung === 0 ? 188 : major ? 96 : 50;
      const centerGap = rung === 0 ? 30 : 22;

      if (this._debug) {
        const a = rotatePoint(-halfWidth, localY);
        const b = rotatePoint(halfWidth, localY);
        this._debug.ladderRungs.push({
          deg: rung,
          cx: rungCenter.x,
          cy: rungCenter.y,
          x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          angleRad: bank,
          localY,
        });
      }

      ctx.save();
      ctx.globalAlpha *= edgeAlpha;
      ctx.strokeStyle = rung === 0 ? GREEN : GREEN_DIM;
      ctx.fillStyle = rung === 0 ? GREEN : GREEN_DIM;
      ctx.lineWidth = rung === 0 ? 1.8 : major ? 1.2 : 1.0;
      // Negative rungs: calm long dashes, not confetti.
      ctx.setLineDash(rung < 0 ? [12, 7] : []);
      ctx.beginPath();
      segment(-halfWidth, localY, -centerGap, localY);
      segment(centerGap, localY, halfWidth, localY);
      ctx.stroke();
      if (major && rung !== 0) {
        // Solid end teeth pointing toward the horizon, even on dashed negative rungs.
        ctx.setLineDash([]);
        const tooth = rung > 0 ? 7 : -7;
        ctx.beginPath();
        segment(-halfWidth, localY, -halfWidth, localY + tooth);
        segment(halfWidth, localY, halfWidth, localY + tooth);
        ctx.stroke();
      } else if (rung === 0) {
        ctx.beginPath();
        segment(-centerGap, localY, -centerGap + 8, localY - 5);
        segment(centerGap, localY, centerGap - 8, localY - 5);
        ctx.stroke();
      }

      if (major) {
        // Numbers on BOTH ends, counter-rotated so they always read upright under any bank.
        ctx.setLineDash([]);
        const text = String(Math.abs(rung));
        for (const end of [-1, 1]) {
          const label = rotatePoint(end * (halfWidth + 15), localY);
          ctx.fillText(text, label.x, label.y + 0.5);
        }
      }
      ctx.restore();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ONE projection pipeline for the airframe symbols. The camera is bolted to the body axis, so
  // the WATERLINE is the projected body-forward direction (the nose anchor computed in draw()) and
  // is drawn body-referenced — screen-aligned by construction, no bank decal. The FPV is the
  // projected WORLD VELOCITY direction through the same camera: the alpha gap between the two is
  // therefore true by construction (focal * tan(aoa) along body-down), and sideslip shows up
  // laterally for free. No synthetic pixels-per-degree offset exists anywhere in this path.
  drawAirframeSymbols(anchor, state, fpvAnchor = null) {
    if (!anchor || anchor.behind || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return;
    const ctx = this.ctx;

    ctx.save();
    this.setLine(GREEN, 1.15);
    ctx.shadowColor = "rgba(77, 255, 136, 0.3)";
    ctx.shadowBlur = 3;

    // WATERLINE / boresight (the nose = gun line). The gun window lives here, because the gun
    // points along the body axis, not the flight path.
    ctx.save();
    ctx.translate(anchor.x, anchor.y);
    ctx.beginPath();
    ctx.moveTo(-15, 0);
    ctx.lineTo(-6, 0);
    ctx.lineTo(0, 5);
    ctx.lineTo(6, 0);
    ctx.lineTo(15, 0);
    ctx.stroke();
    ctx.restore();

    // FPV — the PRIMARY flight symbol: circle + wings + tail tick, projected from the actual
    // velocity vector (deck-relative in the carrier groove, world ground velocity otherwise).
    const fpvVisible = fpvAnchor && !fpvAnchor.behind
      && Number.isFinite(fpvAnchor.x) && Number.isFinite(fpvAnchor.y);
    if (fpvVisible) {
      ctx.save();
      ctx.translate(fpvAnchor.x, fpvAnchor.y);
      this.setLine(GREEN, 1.7);
      ctx.shadowColor = "rgba(77, 255, 136, 0.42)";
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.moveTo(-24, 0);
      ctx.lineTo(-7, 0);
      ctx.moveTo(7, 0);
      ctx.lineTo(24, 0);
      ctx.moveTo(0, -7);
      ctx.lineTo(0, -14);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  drawGunHeat(state) {
    const ctx = this.ctx;
    const heat = clamp(Number(state.gun_heat) || 0, 0, 1);
    const overheated = state.gun_overheat === true;
    const caution = heat >= GUN_HEAT_AMBER_THRESHOLD;
    const color = caution ? AMBER : GREEN;
    const width = 76;
    const height = 7;
    const right = this.width - this.safeInsets.right - 18;
    const x = right - width;
    const y = this.safeInsets.top + 18;

    ctx.save();
    ctx.font = "700 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.fillText("GUN TEMP", x, y - 2);
    ctx.textAlign = "right";
    ctx.fillText(String(Math.round(heat * 100)).padStart(3, "0"), right, y - 2);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y + 2, Math.max(0, (width - 4) * heat), height - 4);

    // Fixed caution and overheat reference ticks make this a temperature instrument, not a
    // generic progress bar. The latch remains authoritative in the separate annunciation.
    ctx.strokeStyle = GREEN_DIM;
    ctx.beginPath();
    ctx.moveTo(x + width * GUN_HEAT_AMBER_THRESHOLD, y - 1);
    ctx.lineTo(x + width * GUN_HEAT_AMBER_THRESHOLD, y + height + 1);
    ctx.stroke();
    ctx.restore();

    if (this._debug) {
      this._debug.gunHeat = {
        present: true,
        heat,
        fillFraction: heat,
        caution,
        overheated,
      };
    }
  }

  drawGunSight(frame, anchor) {
    if (!isFightHudActive(frame.state)) {
      this._leadPipperEnvelope.reset();
      this._lastLeadPipperX = null;
      this._lastLeadPipperY = null;
      return;
    }

    const { state, triggerHeld, camera, leadPipper, now } = frame;
    const hits = Number(state.hits) || 0;
    if (hits < this._lastHudHits) this._lastHudHits = hits;
    if (!Array.isArray(state.recent_events) && hits > this._lastHudHits) {
      this._hitFlashUntil = now + 0.34;
    }
    this._lastHudHits = hits;
    const hitFlash = now < this._hitFlashUntil;
    const solution = frame.visualGunSolution === true;
    const ctx = this.ctx;
    const overheated = state.gun_overheat === true;
    const cue = gunCue(state, hitFlash, solution);
    const cueColor = overheated ? RED : hitFlash || solution ? GREEN : RED;
    const overheatVisible = !overheated
      || Math.floor((Number(now) || 0) * GUN_OVERHEAT_FLASH_HZ * 2) % 2 === 0;

    // Barrel temperature and a qualified SHOOT/HITS/OVERHEAT state remain available while the
    // pilot is looking away from the waterline. The reticle still belongs to the nose projection.
    this.drawGunHeat(state);
    ctx.save();
    if (cue && overheatVisible) {
      ctx.fillStyle = cueColor;
      ctx.font = "800 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(cue, this.width / 2, this.getLayout().weaponCueY);
    }
    ctx.restore();
    if (this._debug) {
      this._debug.gunOverheatAnnunciation = {
        latched: overheated,
        visible: overheated && overheatVisible,
        text: overheated && overheatVisible ? cue : "",
      };
    }

    if (!anchor || anchor.behind || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
      this._leadPipperEnvelope.reset();
      this._lastLeadPipperX = null;
      this._lastLeadPipperY = null;
      return;
    }

    this.drawGunFunnel(frame, anchor);

    let rawPipperVisible = false;
    if (state.lead_valid === true && leadPipper) {
      const leadProjection = this.project(leadPipper, camera, this.projectionA);
      if (!leadProjection.behind && Number.isFinite(leadProjection.x)
        && Number.isFinite(leadProjection.y)) {
        // Draw the exact world point emitted by GunKill through the same live PerspectiveCamera
        // that rendered the FPV. The old reciprocal screen-space offset put the visible cue on the
        // opposite side of the required gun line when a pilot steered the nose toward it.
        rawPipperVisible = leadProjection.x > -50 && leadProjection.x < this.width + 50
          && leadProjection.y > -50 && leadProjection.y < this.height + 50;
        if (rawPipperVisible) {
          this._lastLeadPipperX = leadProjection.x;
          this._lastLeadPipperY = leadProjection.y;
        }
      }
    }
    const pipperAlpha = this._leadPipperEnvelope.update(rawPipperVisible, frame.dt);
    const pipperVisible = pipperAlpha > 0.01
      && Number.isFinite(this._lastLeadPipperX) && Number.isFinite(this._lastLeadPipperY);

    if (pipperVisible) {
      const pipperX = this._lastLeadPipperX;
      const pipperY = this._lastLeadPipperY;
      const wasted = triggerHeld && !solution;
      const color = hitFlash ? GREEN : wasted ? RED : solution ? GREEN : AMBER;
      ctx.save();
      ctx.globalAlpha *= pipperAlpha;
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

  drawGunFunnel(frame, anchor) {
    const ctx = this.ctx;
    const { state, camera } = frame;

    // The gun cross always owns boresight, whether or not a ranging solution exists. It is a
    // body symbol seen through a body-fixed camera, so it is screen-aligned — no bank decal.
    ctx.save();
    ctx.translate(anchor.x, anchor.y);
    this.setLine("rgba(77, 255, 136, 0.70)", 1.15);
    ctx.beginPath();
    ctx.moveTo(-14, 0); ctx.lineTo(-4, 0);
    ctx.moveTo(4, 0); ctx.lineTo(14, 0);
    ctx.moveTo(0, -9); ctx.lineTo(0, -3);
    ctx.moveTo(0, 3); ctx.lineTo(0, 9);
    ctx.stroke();
    ctx.restore();

    // The wingspan-ranging funnel exists only when it can actually range: a live target, a
    // valid lead solution to key off (a real sight cages otherwise), a known wingspan, and a
    // range inside the effective envelope.
    const profile = gunFunnelProfile(state);
    const envelope = gunFunnelEnvelope(profile);
    if (!gunFunnelUsable(state, envelope)) return;

    // A REAL gunsight funnel: the kernel's gun_trajectory is the bullets-in-the-air locus (where
    // rounds fired over the last second actually ARE — gravity droop and own-ship rotation lag
    // included, closed form). Each sample is projected through the SAME live camera that renders
    // the world, so the funnel follows where bullets actually go and is correct under any bank BY
    // CONSTRUCTION. The rails sit perpendicular to the local projected path, one wingspan apart
    // at each sample's range (halfWidth = focal * span/2 / r — a FIXED calibrated scale). The
    // pilot pulls the target between the rails: where its wings fill the funnel width reads range.
    const trajectory = Array.isArray(state.gun_trajectory) ? state.gun_trajectory : null;
    if (!trajectory || trajectory.length < 2) return;
    const focalLengthPx = this.width * 0.5
      * (Number(camera?.projectionMatrix?.elements?.[0]) || 1);
    const projected = [];
    for (const sample of trajectory) {
      const x = Number(sample?.x);
      const y = Number(sample?.y);
      const z = Number(sample?.z);
      const rangeM = Number(sample?.r);
      if (![x, y, z, rangeM].every(Number.isFinite)) continue;
      // Kernel positions are sim-frame (Z north); render space flips Z, same as bx/by/bz.
      this.worldPoint.set(x, y, -z);
      const p = this.project(this.worldPoint, camera, this._trajectoryProj);
      if (p.behind || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      projected.push({ x: p.x, y: p.y, rangeM });
    }
    const rail = gunFunnelRail(projected, {
      targetWingspanM: profile.targetWingspanM,
      focalLengthPx,
      nearRangeM: envelope.nearRangeM,
      farRangeM: envelope.farRangeM,
    });
    if (rail.length < 2) return;
    if (this._debug) this._debug.funnel = rail.map((s) => ({ ...s }));

    // Green means inside effective gun range (the gate above); brighten on the authoritative
    // lead solution so it reads as SHOOT. Deliberately not gun_window, which is only a coarse
    // 800 m / 12-degree framing cone, not a firing solution.
    const solution = frame.visualGunSolution === true;
    const railColor = solution ? "rgba(77, 255, 136, 0.92)" : "rgba(77, 255, 136, 0.68)";

    ctx.save();
    this.setLine(railColor, solution ? 1.9 : 1.3);
    ctx.shadowColor = solution ? "rgba(77, 255, 136, 0.5)" : "rgba(77, 255, 136, 0.28)";
    ctx.shadowBlur = solution ? 6 : 3;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      rail.forEach((s, i) => {
        const x = s.x + side * s.perpX * s.halfWidthPx;
        const y = s.y + side * s.perpY * s.halfWidthPx;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Near / mid / far range gradations across the rails, along the local perpendicular.
    ctx.strokeStyle = railColor;
    ctx.lineWidth = 1;
    for (const i of [0, Math.floor(rail.length / 2), rail.length - 1]) {
      const s = rail[i];
      ctx.beginPath();
      for (const side of [-1, 1]) {
        ctx.moveTo(s.x + side * s.perpX * (s.halfWidthPx + 4),
          s.y + side * s.perpY * (s.halfWidthPx + 4));
        ctx.lineTo(s.x + side * s.perpX * (s.halfWidthPx - 2),
          s.y + side * s.perpY * (s.halfWidthPx - 2));
      }
      ctx.stroke();
    }
    ctx.restore();

    // drawBandit owns the one target marker. Adding another diamond here made the funnel,
    // lead pipper and target box collapse into an unreadable knot near a valid solution.
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
    if (this._debug) {
      this._debug.banditPx = {
        x: projection.x,
        y: projection.y,
        behind: projection.behind === true,
      };
    }
    const layout = this.getLayout();
    const safe = layout.targetSafe;
    const solution = frame.visualGunSolution === true;
    const padlockedBandit = frame.padlock && frame.padlockTarget !== "carrier";
    const color = padlockedBandit || solution ? AMBER : GREEN;
    const ctx = this.ctx;
    const size = solution ? 32 : padlockedBandit ? 30 : 27;
    const markerEntityId = String(state.bandit_entity_id ?? "legacy");
    if (markerEntityId !== this._banditMarkerEntityId) {
      this._banditMarkerEntityId = markerEntityId;
      this._banditMarkerInside = false;
    }
    const inside = latchedRectVisibility(
      this._banditMarkerInside,
      projection,
      { left: 8, top: 8, right: this.width - 8, bottom: this.height - 8 },
      4,
      6,
    );
    this._banditMarkerInside = inside;
    if (this._debug) {
      this._debug.banditLocator = { markerInside: inside, arrowDrawn: false };
    }

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

      // The selected padlock target gets one centre dot inside the ordinary target brackets.
      // drawPadlockSa deliberately does not add a second diamond over the same aircraft.
      if (padlockedBandit) {
        ctx.fillStyle = AMBER;
        ctx.beginPath();
        ctx.arc(projection.x, projection.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      const closure = targetClosureReadout(state.closure_kts);
      const dataLine = `${targetRangeReadout(state.range_m).compactText} · ${closure.compactText}`;
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

    // Combat padlock owns one edge locator at every look angle. Drawing the ordinary forward-HUD
    // arrow as well would create two differently referenced directions around the threshold.
    if (frame.padlock && frame.padlockTarget !== "carrier") return;

    // Direction from the CAMERA-SPACE target vector — the same continuous rule the padlock
    // caret uses. The old projected-point path blew up near the side plane and switched frames
    // entirely for a target behind, which is exactly the "arrow bouncing around" the pilot
    // reported twice. Ambiguous only exactly dead-astern, where the previous smoothed direction
    // is retained through a bounded per-frame slew.
    let dx;
    let dy;
    this.relative.copy(frame.banditPosition).sub(frame.playerPosition)
      .transformDirection(frame.camera.matrixWorldInverse);
    const locatorPlaneMagnitude = Math.hypot(this.relative.x, this.relative.y);
    if (locatorPlaneMagnitude > 0.02) {
      dx = this.relative.x / locatorPlaneMagnitude;
      dy = -this.relative.y / locatorPlaneMagnitude;
    } else if (Number.isFinite(this._locatorArrowAngle)) {
      dx = Math.cos(this._locatorArrowAngle);
      dy = Math.sin(this._locatorArrowAngle);
    } else {
      dx = 1;
      dy = 0;
    }
    // Bounded angular slew (6 rad/s) kills frame-to-frame jitter without lying about
    // direction. The smoothing state resets whenever display time is not flowing continuously
    // forward (a fresh frame after the marker owned the glyph, a scenario switch in the
    // harness), so a stale angle can never lag a newly appearing arrow.
    const rawAngle = Math.atan2(dy, dx);
    const nowT = Number(frame.now) || 0;
    const continuous = Number.isFinite(this._locatorArrowAngle)
      && nowT > this._locatorArrowLastNow
      && nowT - this._locatorArrowLastNow < 0.25;
    if (continuous) {
      const step = clamp(wrapPi(rawAngle - this._locatorArrowAngle),
        -6 * (Number(frame.dt) || 0.016), 6 * (Number(frame.dt) || 0.016));
      this._locatorArrowAngle = this._locatorArrowAngle + step;
    } else {
      this._locatorArrowAngle = rawAngle;
    }
    this._locatorArrowLastNow = nowT;
    dx = Math.cos(this._locatorArrowAngle);
    dy = Math.sin(this._locatorArrowAngle);

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

    if (this._debug && this._debug.banditLocator) {
      this._debug.banditLocator.arrowDrawn = true;
      this._debug.banditLocator.dirX = dx;
      this._debug.banditLocator.dirY = dy;
    }
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
    const fullLabel = `${Math.abs(azimuth) > 150 ? "6 · " : ""}${targetRangeReadout(state.range_m).compactText} · ${closure.compactText}`;
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
    const rawHeading = finiteHudNumber(state.heading_deg);
    const heading = Number.isFinite(headingDeg) ? headingDeg : rawHeading;
    const headingValid = Number.isFinite(heading);
    const layout = this.getLayout();
    const width = layout.heading.width;
    const x0 = (this.width - width) / 2;
    const y = layout.heading.y;
    const pixelsPerDegree = width / 100;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y - 14, width, 34);
    ctx.clip();
    ctx.strokeStyle = "rgba(77, 255, 136, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y + 12.5);
    ctx.lineTo(this.width / 2 - 29, y + 12.5);
    ctx.moveTo(this.width / 2 + 29, y + 12.5);
    ctx.lineTo(x0 + width, y + 12.5);
    ctx.stroke();
    this.setLine(GREEN_DIM, 1);
    ctx.font = "500 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    if (headingValid) {
      const first = Math.floor((heading - 55) / 5) * 5;
      for (let mark = first; mark <= heading + 55; mark += 5) {
        const delta = ((mark - heading + 540) % 360) - 180;
        const x = snapPixel(this.width / 2 + delta * pixelsPerDegree, this.pixelRatio);
        const major = mark % 10 === 0;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + (major ? 7 : 4));
        ctx.stroke();
        if (major) {
          ctx.fillText(String(Math.round(wrap360(mark) / 10)).padStart(2, "0"), x, y - 12);
        }
      }
    }
    ctx.restore();

    ctx.fillStyle = "rgba(2, 10, 16, 0.72)";
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(this.width / 2 - 22, y - 15);
    ctx.lineTo(this.width / 2 + 22, y - 15);
    ctx.lineTo(this.width / 2 + 22, y + 11);
    ctx.lineTo(this.width / 2 + 5, y + 11);
    ctx.lineTo(this.width / 2, y + 16);
    ctx.lineTo(this.width / 2 - 5, y + 11);
    ctx.lineTo(this.width / 2 - 22, y + 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = GREEN;
    ctx.font = "700 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const shownHeading = Number.isFinite(headingDigits) ? headingDigits : heading;
    ctx.fillText(Number.isFinite(shownHeading)
      ? String(Math.round(wrap360(shownHeading))).padStart(3, "0") : "---",
      this.width / 2, y - 2);
    if (padlock) {
      ctx.fillStyle = GREEN_DIM;
      ctx.font = "750 7px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillText("OWN HDG", this.width / 2, y - 25);
    }

    // At bingo the boat caret stays on the visible edge of the tape until the pilot turns it in.
    // This is guidance only: no flight-control command is fed back into the kernel.
    const boatTurn = finiteHudNumber(state.rtb_turn_deg);
    if (headingValid && state.rtb_steer === true && Number.isFinite(boatTurn)) {
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
    const playerEast = finiteHudNumber(state.px);
    const playerNorth = finiteHudNumber(state.pz);
    const raiderEast = finiteHudNumber(state.bx);
    const raiderNorth = finiteHudNumber(state.bz);
    if (headingValid && raidActive && [playerEast, playerNorth, raiderEast, raiderNorth]
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
      ctx.fillText("SPLASH", this.width / 2, cueY + 23);
      ctx.shadowBlur = 0;
      ctx.fillStyle = GREEN_DIM;
      ctx.font = "700 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      const replacementPending = state.opponent_replacement_pending === true;
      const replacementSeconds = Math.max(0,
        Number(state.opponent_replacement_s) || 0);
      const nextEngagement = Math.max(2,
        Math.floor(Number(state.engagement_number) || Math.max(1, kills)) + 1);
      const detail = replacementPending
        ? `BANDIT ${nextEngagement} IN ${replacementSeconds.toFixed(1)} SEC · KILLS ${kills}`
        : `IMPACT PHYSICS RUNNING · KILLS ${kills}`;
      ctx.fillText(detail, this.width / 2, cueY + 47);
    }
    ctx.restore();
  }

  drawRtbCue(state) {
    if (state.rtb !== true) return;
    if (["TERMINAL", "ARRESTED", "STOPPED", "CATAPULT"].includes(hudMode(state))) return;

    const ctx = this.ctx;
    const fuel = fuelReadout(state);
    const bearing = finiteHudNumber(state.rtb_bearing_deg);
    const turn = finiteHudNumber(state.rtb_turn_deg);
    const rangeNm = finiteHudNumber(state.rtb_range_nm);
    const hasSteer = state.rtb_steer === true
      && Number.isFinite(bearing) && Number.isFinite(turn) && Number.isFinite(rangeNm);
    const direction = Math.abs(turn) < 3 ? "STEADY"
      : `TURN ${turn < 0 ? "L" : "R"} ${Math.round(Math.abs(turn))}°`;
    const boatDetail = hasSteer
      ? `BOAT ${String(Math.round(wrap360(bearing))).padStart(3, "0")}° · ${rangeNm.toFixed(1)} NM · ${direction}`
      : "BREAK OFF · RECOVER";
    const detail = fuel.bingo ? `${boatDetail} · ${fuel.decisionText}` : boatDetail;
    const headline = fuel.emergencyFuel ? "EMER FUEL - RTB"
      : fuel.minimumFuel ? "MIN FUEL - RTB" : "BINGO - RTB";
    const accent = fuel.emergencyFuel ? RED : AMBER;
    const width = Math.min(this.touchMode ? 264 : 330, this.width - 34);
    const height = 44;
    const x = (this.width - width) / 2;
    const y = this.getLayout().weaponCueY - 56;

    ctx.save();
    this.glassPanel(x, y, width, height, accent);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = accent;
    ctx.font = "800 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText(headline, this.width / 2, y + 14);
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
    const y = this.getLayout().modeCueY;

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
    const layout = this.getLayout();
    const x = layout.tapeInset + 47;
    const y = layout.instrumentCenterY;

    ctx.save();
    ctx.fillStyle = GREEN_DIM;
    ctx.font = "700 7px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`α ${aoa.toFixed(1)}`, x, y - 34);

    const row = (label, rowY, active) => {
      ctx.fillStyle = active ? accent : "rgba(77, 255, 136, 0.22)";
      ctx.font = `${active ? 800 : 600} ${active ? 13 : 10}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      if (active) {
        ctx.shadowColor = accent;
        ctx.shadowBlur = 5;
      }
      ctx.fillText(label, x, rowY);
      ctx.shadowBlur = 0;
    };
    row("▽", y - 17, fast);
    row("○", y + 1, !fast && !slow);
    row("△", y + 19, slow);
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
    const layout = this.getLayout();
    const centerY = layout.instrumentCenterY;
    const tapeHeight = layout.tapeHeight;
    const halfHeight = tapeHeight / 2;
    const pixelsPerStep = 34;
    const rightSide = x > this.width / 2;
    const pxPerUnit = pixelsPerStep / step;
    const valueValid = Number.isFinite(value);
    const displayValueValid = valueValid && Number.isFinite(displayValue);

    const wash = ctx.createLinearGradient(x - 34, 0, x + 34, 0);
    if (rightSide) {
      wash.addColorStop(0, "rgba(1, 9, 14, 0)");
      wash.addColorStop(1, "rgba(1, 9, 14, 0.29)");
    } else {
      wash.addColorStop(0, "rgba(1, 9, 14, 0.29)");
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
    if (valueValid && (lowSpeed?.unit === "KCAS" || lowSpeed?.unit === "KIAS")
        && Number.isFinite(lowSpeed.boundaryKts)) {
      const tapeTop = centerY - halfHeight;
      const tapeBottom = centerY + halfHeight;
      const yForSpeed = (speedKias) => centerY - (speedKias - value) * pxPerUnit;
      const boundaryY = yForSpeed(lowSpeed.boundaryKts);
      if (Number.isFinite(lowSpeed.amberTopKts)
          && lowSpeed.amberTopKts > lowSpeed.boundaryKts) {
        const amberTopY = yForSpeed(lowSpeed.amberTopKts);
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

    if (valueValid) {
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
    }

    for (const marker of fixedMarkers) {
      if (!valueValid || (marker?.unit !== "KCAS" && marker?.unit !== "KIAS")
          || !Number.isFinite(marker.value)) continue;
      if (Number.isFinite(marker.bandMinValue) && Number.isFinite(marker.bandMaxValue)
          && marker.bandMaxValue > marker.bandMinValue) {
        const bandTop = clamp(centerY - (marker.bandMaxValue - value) * pxPerUnit,
          centerY - halfHeight, centerY + halfHeight);
        const bandBottom = clamp(centerY - (marker.bandMinValue - value) * pxPerUnit,
          centerY - halfHeight, centerY + halfHeight);
        if (bandBottom > bandTop) {
          // Subtle wash for the >=95%-of-peak turn-rate band; the COR caret stays the peak cue.
          ctx.fillStyle = "rgba(255, 176, 32, 0.13)";
          ctx.fillRect(x - 33, bandTop, 66, bandBottom - bandTop);
        }
      }
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
    ctx.fillText(displayValueValid ? `${displayValue.toFixed(decimals)}${suffix}` : "---",
      x, centerY + 0.5);

    // Trend caret: a vertical line from the current value to where the value is heading (value +
    // trend over the lookahead), clamped to the tape. Amber, so accel/decel reads at a glance.
    const trendAlpha = valueValid && Number.isFinite(trend)
      ? clamp((Math.abs(trend) - 2) / 4, 0, 1) : 0;
    if (trendAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha *= trendAlpha;
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
      ctx.restore();
    }
  }

  drawAirdataLabels(state, speedX, altitudeX, display = {}) {
    const data = airdataReadout(state);
    const groundKts = Number.isFinite(display.groundKts) ? display.groundKts : null;
    const verticalSpeedFpm = Number.isFinite(display.verticalSpeedDigits)
      ? display.verticalSpeedDigits : data.verticalSpeedFpm;
    const groundText = Number.isFinite(groundKts)
      ? `G/S ${Math.round(Math.max(0, groundKts))} KT`
      : data.groundText;
    const speedSecondaryText = data.machText ?? groundText;
    const verticalText = verticalSpeedText(verticalSpeedFpm);
    const ctx = this.ctx;
    const layout = this.getLayout();
    const centerY = layout.instrumentCenterY;
    const tapeHeight = layout.tapeHeight;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = GREEN_DIM;
    ctx.font = "800 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText(data.unitText, speedX, centerY - tapeHeight / 2 - 12);
    ctx.fillText("ALT FT", altitudeX, centerY - tapeHeight / 2 - 12);

    // Earth-relative speed stays with airspeed; vertical motion stays with altitude. Both remain
    // numeric rather than adding two more analogue instruments to the transparent world view.
    // They live BELOW the tape clip window: tape tick labels scroll continuously with the value
    // and can land anywhere inside the tape, so a readout inside that band (the old centerY+18
    // position) collided with them near round altitudes. Below the clip they can never touch.
    const readoutY = centerY + tapeHeight / 2 + 13;
    ctx.fillStyle = "rgba(3, 13, 20, 0.88)";
    roundedRect(ctx, speedX - 31, readoutY - 7, 62, 14, 3);
    ctx.fill();
    roundedRect(ctx, altitudeX - 37, readoutY - 7, 74, 14, 3);
    ctx.fill();
    ctx.fillStyle = GREEN_DIM;
    ctx.font = "700 7px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText(speedSecondaryText, speedX, readoutY);
    // Assisted flight (portrait): the throttle is holding corner velocity; say so where the
    // pilot's speed attention already lives. Guarded on field presence for older snapshots.
    if (state.assisted_flight === true) {
      const bias = Number(state.assisted_speed_bias_kts) || 0;
      ctx.fillStyle = AMBER;
      ctx.font = "800 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillText(bias === 0 ? "AUTO \u00B7 CORNER"
        : `AUTO \u00B7 COR${bias > 0 ? "+" : ""}${bias}KT`, speedX, readoutY + 14);
    }
    ctx.font = "700 6.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText(verticalText, altitudeX, readoutY);
    ctx.restore();
  }

  drawGTape(state) {
    const ctx = this.ctx;
    const layout = this.getLayout();
    const x = this.safeInsets.left + 24;
    const y = layout.secondaryBottom - 9;
    const width = Math.min(166, Math.max(112, this.width * 0.18));
    const maxG = Math.max(10, Number(state.g_hardmax) || 10);
    const mapG = (g) => x + clamp((Number(g) || 0) / maxG, 0, 1) * width;
    const tierColor = state.tier === 3 ? AMBER : GREEN;

    const wash = ctx.createLinearGradient(x - 6, 0, x + width + 6, 0);
    wash.addColorStop(0, "rgba(1, 9, 14, 0.42)");
    wash.addColorStop(0.72, "rgba(1, 9, 14, 0.20)");
    wash.addColorStop(1, "rgba(1, 9, 14, 0)");
    ctx.fillStyle = wash;
    ctx.fillRect(x - 6, y - 27, width + 12, 50);
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
    const warningY = this.getLayout().warningY;
    const maxWarningLines = 3;
    let occupiedLines = 0;
    if (this._debug) this._debug.warningLine = null;

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
      if (this._debug) this._debug.warningLine = text;
    } else if (state.auto_gcas_available === true
      && state.auto_gcas_inhibit_reason === "LOW_LEVEL_STANDBY") {
      // Deliberate low-level standby is a status, not an alert: the pilot descended through
      // the 1000 ft AO gate on purpose and the failsafe stood itself down. Dim, no glow.
      ctx.fillStyle = "rgba(255, 176, 32, 0.55)";
      ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText("GCAS STBY", this.width / 2, warningY);
      occupiedLines += 1;
      if (this._debug) this._debug.warningLine = "GCAS STBY";
    }

    if (state.tier === 3) {
      const alphaOverride = Number.isFinite(state.requested_alpha_deg);
      ctx.shadowColor = "rgba(255, 176, 32, 0.58)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = AMBER;
      ctx.font = "800 19px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(alphaOverride ? "AOA LIMIT OFF" : "G LIMIT OVERRIDE",
        this.width / 2, warningY + occupiedLines * 21);
      ctx.shadowBlur = 0;
      occupiedLines += 1;
    }

    const buffetAlpha = this._buffetEnvelope.update(state.buffet === true, frame.dt, {
      instantAttack: true,
    });
    if (buffetAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha *= buffetAlpha;
      ctx.fillStyle = RED;
      ctx.font = "800 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText("BUFFET · CL MAX", this.width / 2,
        warningY + occupiedLines * 21);
      ctx.restore();
      occupiedLines += 1;
    }

    // Why the jet is not pulling harder RIGHT NOW. Pilot report (Build 69): "sometimes it feels
    // like it's stopped pulling entirely" — the wing was at CLmax and TVC saturated with only
    // subtle cues. The kernel now names the binding limit; say it plainly.
    const pullLimit = state.pull_limit;
    if ((pullLimit === "STRUCTURAL" || pullLimit === "TVC")
        && occupiedLines < maxWarningLines) {
      ctx.fillStyle = AMBER;
      ctx.font = "800 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(pullLimit === "TVC" ? "TVC SATURATED" : "STRUCTURAL LIMIT",
        this.width / 2, warningY + occupiedLines * 21);
      occupiedLines += 1;
    }

    for (const warning of systems?.warnings ?? []) {
      if (occupiedLines >= maxWarningLines) break;
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
    const pullUpActive = state.auto_gcas_available !== true
        && Number.isFinite(radarAltFt) && Number.isFinite(verticalSpeedFpm)
        && radarAltFt < 500 && verticalSpeedFpm < -1000;
    const pullUpAlpha = this._pullUpEnvelope.update(pullUpActive, frame.dt, {
      instantAttack: true,
    });
    if (pullUpAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha *= pullUpAlpha;
      ctx.fillStyle = RED;
      ctx.font = "800 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const pullUpY = frame.padlock
        ? Math.max(this.safeInsets.top + 150, this.height - this.safeInsets.bottom - 286)
        : this.height - this.safeInsets.bottom - 104;
      ctx.fillText("PULL UP", this.width / 2, pullUpY);
      ctx.restore();
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
    // Power is a supporting energy cue, not a third flight-data tape.  A thin actual-output rail
    // plus a command caret preserves spool-lag information without blocking the outside world.
    const layout = this.getLayout();
    const centerY = layout.instrumentCenterY;
    const h = layout.tapeHeight;
    const railWidth = 6;
    const x = layout.tapeInset - 46;
    const y = centerY - h / 2;
    const yOf = (f) => y + h - (clamp(f, 0, maxT) / maxT) * h;

    ctx.fillStyle = "rgba(1, 9, 14, 0.34)";
    ctx.fillRect(x, y, railWidth, h);
    ctx.strokeStyle = "rgba(77, 255, 136, 0.28)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, railWidth, h);
    if (hasAfterburner) {
      ctx.fillStyle = "rgba(255, 176, 32, 0.16)";
      ctx.fillRect(x, yOf(maxT), railWidth, yOf(1.0) - yOf(maxT));
    }
    // Engine fill is actual output; the gap to the caret is the spool lag the pilot feels.
    const ey = yOf(eng);
    ctx.fillStyle = eng > 1.005 ? AMBER : GREEN;
    ctx.fillRect(x + 1.5, ey, railWidth - 3, y + h - ey);
    ctx.strokeStyle = "rgba(77, 255, 136, 0.38)";
    ctx.lineWidth = 1;
    for (const fraction of [0.55, 0.85, 1.0]) {
      const detentY = yOf(fraction);
      ctx.beginPath();
      ctx.moveTo(x - 2, detentY);
      ctx.lineTo(x + railWidth + 2, detentY);
      ctx.stroke();
    }
    const ly = yOf(thr);
    ctx.fillStyle = thr > 1.005 ? AMBER : GREEN;
    ctx.beginPath();
    ctx.moveTo(x + railWidth + 1, ly);
    ctx.lineTo(x + railWidth + 8, ly - 4);
    ctx.lineTo(x + railWidth + 8, ly + 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = GREEN_DIM;
    ctx.font = "750 7px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PWR", x + railWidth / 2, y - 9);

    if (hasAfterburner && eng > 1.005) {
      ctx.font = "800 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillStyle = AMBER;
      ctx.fillText("A/B", x + railWidth / 2, y + h + 10);
    }
  }

  drawFuel(state) {
    if (!Number.isFinite(Number(state.fuel_lb))) return;
    const readout = fuelReadout(state);
    const fuel = readout.fuelLb;
    const trend = Math.min(0, Number(state.fuel_trend_lb_min) || 0);
    const capacity = readout.capacityLb;
    const bingoThreshold = readout.bingoThresholdLb;
    const advisory = readout.statusText !== null;
    const accent = readout.critical ? RED : advisory ? AMBER : GREEN;
    const ctx = this.ctx;
    const layout = this.getLayout();
    const width = Math.min(176,
      this.width - this.safeInsets.left - this.safeInsets.right - 36);
    const height = 42;
    const x = this.width - this.safeInsets.right - width - 18;
    const y = layout.secondaryBottom - height;
    const barX = x + 9;
    const barY = y + 36;
    const barWidth = width - 18;
    const fuelRatio = capacity > 0 ? clamp(fuel / capacity, 0, 1) : 0;
    const currentX = barX + barWidth * fuelRatio;
    const projectedRatio = capacity > 0 ? clamp((fuel + trend * 5) / capacity, 0, 1) : 0;
    const projectedX = barX + barWidth * projectedRatio;

    ctx.save();
    roundedRect(ctx, x, y, width, height, 4);
    ctx.fillStyle = "rgba(1, 9, 14, 0.38)";
    ctx.fill();
    ctx.strokeStyle = advisory ? accent : "rgba(77, 255, 136, 0.20)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textBaseline = "middle";
    ctx.fillStyle = accent;
    ctx.font = "800 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.fillText(readout.quantityText, x + 9, y + 10);
    ctx.fillStyle = advisory ? accent : GREEN;
    ctx.font = "800 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "right";
    ctx.fillText(readout.flowText, x + width - 9, y + 10);
    ctx.fillStyle = advisory ? accent : GREEN_DIM;
    ctx.font = "800 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.fillText(readout.decisionDisplayText, x + 9, y + 25);

    ctx.fillStyle = "rgba(77, 255, 136, 0.12)";
    ctx.fillRect(barX, barY, barWidth, 3);
    ctx.fillStyle = accent;
    ctx.fillRect(barX, barY, barWidth * fuelRatio, 3);
    if (readout.consumesFuel && capacity > 0) {
      const bingoX = barX + barWidth * clamp(bingoThreshold / capacity, 0, 1);
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bingoX, barY - 2);
      ctx.lineTo(bingoX, barY + 5);
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
    const fuelY = this.getLayout().secondaryBottom - 42;
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
      this._padlockLiftCaptured = false;
      this._padlockCaptureEntityId = "";
      this._padlockTrackEstablished = false;
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

    const isBanditPadlock = frame.padlockTarget !== "carrier";
    const targetLabel = isBanditPadlock ? "BANDIT" : "BOAT";
    if (isBanditPadlock) {
      const captureEntityId = String(frame.state.bandit_entity_id ?? "legacy");
      if (captureEntityId !== this._padlockCaptureEntityId) {
        this._padlockCaptureEntityId = captureEntityId;
        this._padlockLiftCaptured = false;
        this._padlockTrackEstablished = false;
      }
      if (frame.manualLookActive) {
        this._padlockTrackEstablished = false;
      } else if (frame.padlockPhase === "TRACK") {
        this._padlockTrackEstablished = true;
      }
    } else {
      this._padlockLiftCaptured = false;
      this._padlockTrackEstablished = false;
      this._padlockCaptureEntityId = "";
    }
    const phase = frame.manualLookActive ? "MANUAL LOOK" : frame.padlockPhase || "TRACK";
    const exitBinding = this.touchMode
      ? "PADLOCK: EXIT"
      : `${controlBindingLabel(this.controlBindings?.padlock, "KeyV")}: FORWARD`;
    const modeTitle = `${targetLabel} PADLOCK`;
    const cameraSettling = isBanditPadlock && this._padlockTrackEstablished
      && phase !== "TRACK" && !frame.manualLookActive;
    const modeStatus = frame.manualLookActive
      ? "RELEASE LOOK TO REACQUIRE"
      : phase === "TRACK" ? `TRACKING · ${exitBinding}`
        : cameraSettling ? `CAMERA SETTLING · ${exitBinding}` : `${phase} TARGET`;
    padlockCtx.save();
    padlockCtx.font = "800 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const titleWidth = padlockCtx.measureText(modeTitle).width;
    padlockCtx.font = "750 7px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const statusWidth = padlockCtx.measureText(modeStatus).width;
    const modeWidth = Math.min(this.width - 28, Math.max(titleWidth, statusWidth) + 20);
    const modeX = (this.width - modeWidth) / 2;
    const modeY = Math.max(this.safeInsets.top + 3, this.getLayout().heading.top - 30);
    this.glassPanel(modeX, modeY, modeWidth, 28, frame.manualLookActive ? AMBER : GREEN_DIM);
    padlockCtx.fillStyle = frame.manualLookActive ? AMBER : GREEN;
    padlockCtx.textAlign = "center";
    padlockCtx.textBaseline = "middle";
    padlockCtx.font = "800 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    padlockCtx.fillText(this.fitText(modeTitle, modeWidth - 12), this.width / 2, modeY + 9);
    padlockCtx.fillStyle = frame.manualLookActive ? AMBER : GREEN_DIM;
    padlockCtx.font = "750 7px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    padlockCtx.fillText(this.fitText(modeStatus, modeWidth - 12), this.width / 2, modeY + 20);

    // Combat padlock always owns its director and locator, including near the forward-view
    // threshold. Boat padlock only needs this compact SA when the pilot deliberately looks away.
    const dedicatedSa = isBanditPadlock || padlockLooksOffAxis(frame);
    if (dedicatedSa) {
      const state = frame.state;
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
      const blink = Math.floor((Number(frame.now) || 0) * 5) % 2 === 0;
      const pitchDeg = Number(state.pitch_deg) || 0;
      const radarAltFt = Number.isFinite(Number(state.radar_alt_ft))
        ? Number(state.radar_alt_ft) : Number(state.alt_ft);
      const sinkFpm = Number(state.vertical_speed_fpm);
      const noseLow = pitchDeg < -2 || (Number.isFinite(sinkFpm) && sinkFpm < -1500);
      const groundDanger = Number.isFinite(radarAltFt) && radarAltFt < 2000 && noseLow;
      const centralPullUp = state.auto_gcas_active === true
        || state.auto_gcas_warning === true
        || (state.auto_gcas_available !== true
          && radarAltFt < 500 && sinkFpm < -1000);

      // Where is the bandit in this view. In padlock the sensor is slaved to it, so it usually sits
      // near centre (offset toward the nose by the protected-offset geometry); a manual slew can
      // push it off-screen or behind, so we always resolve a screen direction to point at it.
      const banditProj = this.project(frame.banditPosition, padlockCamera, this._funnelTargetProj);
      const banditOnScreen = isBanditPadlock && !banditProj.behind
        && Number.isFinite(banditProj.x) && Number.isFinite(banditProj.y)
        && banditProj.x >= 8 && banditProj.x <= this.width - 8
        && banditProj.y >= 8 && banditProj.y <= this.height - 8;
      // Unit screen direction from view-centre toward the bandit (for the edge caret + clock).
      // Derived from the CAMERA-SPACE target direction, not from projected screen coordinates:
      // the perspective projection blows up and flips as the target crosses the side plane, and
      // the old behind-branch (mirroring the nose direction) pointed at where the NOSE was, not
      // where the TARGET is — the "wandering arrow". The camera-space (x, -y) direction is the
      // way to slew the view toward the target and is continuous through the whole sphere,
      // ambiguous only exactly dead-astern.
      let banditDirX = 0;
      let banditDirY = 0;
      let banditDirValid = false;
      if (isBanditPadlock) {
        this.relative.copy(frame.banditPosition).sub(frame.playerPosition)
          .transformDirection(padlockCamera.matrixWorldInverse);
        const planeMagnitude = Math.hypot(this.relative.x, this.relative.y);
        if (planeMagnitude > 0.02) {
          banditDirX = this.relative.x / planeMagnitude;
          banditDirY = -this.relative.y / planeMagnitude;
          banditDirValid = true;
        }
      }

      const statusDirective = (text, accent) => {
        padlockCtx.save();
        padlockCtx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        const directiveWidth = Math.min(right - left,
          Math.max(94, padlockCtx.measureText(text).width + 24));
        const directiveY = top + 2;
        this.glassPanel(centreX - directiveWidth / 2, directiveY,
          directiveWidth, 24, accent);
        padlockCtx.fillStyle = accent;
        padlockCtx.textAlign = "center";
        padlockCtx.textBaseline = "middle";
        padlockCtx.fillText(this.fitText(text, directiveWidth - 14),
          centreX, directiveY + 12);
        padlockCtx.restore();
      };

      const steeringAvailable = isBanditPadlock && this._padlockTrackEstablished
        && !frame.manualLookActive && !groundDanger && !centralPullUp;
      if (!steeringAvailable) this._padlockLiftCaptured = false;
      if (isBanditPadlock && !this._padlockTrackEstablished && !frame.manualLookActive
          && !groundDanger && !centralPullUp) {
        statusDirective("ACQUIRING BANDIT", AMBER);
      }

      // === STEERING TRUTH: kernel-first physical roll error; the drawing lives in the
      // body-fixed locator inset below (drawPadlockLocatorInset), never in camera space.
      const targetVectorLength = this.relative.copy(frame.banditPosition)
        .sub(frame.playerPosition).length();
      if (targetVectorLength > 1e-6) this.relative.multiplyScalar(1 / targetVectorLength);
      // In production, the fixed-tick controller publishes the exact geometry and capture latch it
      // is using for the mild roll hold. Harnesses and older snapshots retain the independent JS
      // calculation as a compatibility/falsification path, never as actuator authority.
      // Detect the authoritative schema by field presence, not by its current selected value. On
      // the first TRACK frame the bridge transition has not yet reached the next snapshot; falling
      // back on a false value would flash the old zero-dwell JS capture before kernel truth arrives.
      const kernelSteeringReported = Object.prototype.hasOwnProperty.call(
        state, "padlock_roll_assist_selected");
      const kernelRollErrorDeg = Number(state.padlock_roll_error_deg);
      const steering = steeringAvailable && orientation.liftValid
        ? kernelSteeringReported ? {
          valid: state.padlock_roll_assist_selected === true
            && state.padlock_roll_assist_geometry_valid === true
            && Number.isFinite(kernelRollErrorDeg),
          captured: state.padlock_roll_assist_captured === true,
          anyPlane: state.padlock_roll_assist_any_plane === true,
          rollErrorRad: Number.isFinite(kernelRollErrorDeg)
            ? kernelRollErrorDeg * DEG : null,
        } : padlockLiftPlaneModel({
          targetRight: this.relative.dot(frame.playerRight),
          targetUp: this.relative.dot(frame.playerUp),
          targetForward: this.relative.dot(frame.playerForward),
          wasCaptured: this._padlockLiftCaptured,
        }) : null;
      this._padlockLiftCaptured = steering?.valid ? steering.captured : false;
      if (steering?.valid) {
        if (this._debug) {
          this._debug.padlockDirector = {
            rollErrorRad: steering.rollErrorRad,
            captured: steering.captured,
            anyPlane: steering.anyPlane,
            assistActive: state.padlock_roll_assist_active === true,
          };
        }
      }

      this.drawPadlockLocatorInset(frame, {
        centreX, top, bottom, left, right,
        steering, groundDanger, centralPullUp, blink,
        pitchDeg, radarAltFt, sinkFpm,
      });

      // === BANDIT LOCATOR: drawBandit owns the single on-screen target box. This layer only adds
      // an edge caret when a manual slew puts that target off-screen or behind the current view.
      if (this._debug && isBanditPadlock) {
        this._debug.padlockLocator = {
          dirX: banditDirX,
          dirY: banditDirY,
          valid: banditDirValid,
          drawn: !banditOnScreen && banditDirValid,
        };
      }
      if (isBanditPadlock) {
        padlockCtx.save();
        if (!banditOnScreen && banditDirValid) {
          const scale = Math.min(
            (banditDirX >= 0 ? right - centreX : centreX - left) / Math.max(Math.abs(banditDirX), 0.001),
            (banditDirY >= 0 ? bottom - centreY : centreY - top) / Math.max(Math.abs(banditDirY), 0.001),
          );
          const edgeX = centreX + banditDirX * scale;
          const edgeY = centreY + banditDirY * scale;
          padlockCtx.save();
          padlockCtx.translate(edgeX, edgeY);
          padlockCtx.rotate(Math.atan2(banditDirY, banditDirX));
          this.setLine(AMBER, 2.0);
          padlockCtx.beginPath();
          padlockCtx.moveTo(12, 0);
          padlockCtx.lineTo(-5, -8);
          padlockCtx.lineTo(-1, 0);
          padlockCtx.lineTo(-5, 8);
          padlockCtx.closePath();
          padlockCtx.stroke();
          padlockCtx.restore();
          // Rough clock: 12 o'clock = top of view. Screen-referenced, an at-a-glance heads-up.
          const clockAngle = Math.atan2(banditDirX, -banditDirY); // 0 = up, +CW
          let clock = Math.round(((clockAngle / (Math.PI * 2)) * 12 + 12)) % 12;
          if (clock === 0) clock = 12;
          padlockCtx.fillStyle = AMBER;
          padlockCtx.font = "800 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
          padlockCtx.textAlign = "center";
          padlockCtx.textBaseline = "middle";
          const labelX = clamp(edgeX - banditDirX * 16, left + 12, right - 12);
          const labelY = clamp(edgeY - banditDirY * 16, top + 8, bottom - 8);
          padlockCtx.fillText(`${clock} O'C`, labelX, labelY);
        }
        padlockCtx.restore();
      }

      // NOSE tick: a small amber caret at the waterline projection (or the view edge if the nose is
      // off-screen), so the pilot keeps a sense of where the jet points relative to the padlock.
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
        this.setLine("rgba(255, 176, 32, 0.86)", 2.0);
        padlockCtx.beginPath();
        padlockCtx.moveTo(12, 0);
        padlockCtx.lineTo(-6, -7);
        padlockCtx.lineTo(-2, 0);
        padlockCtx.lineTo(-6, 7);
        padlockCtx.stroke();
        padlockCtx.rotate(-Math.atan2(noseDirectionY, noseDirectionX));
      }
      padlockCtx.fillStyle = "rgba(255, 176, 32, 0.85)";
      padlockCtx.font = "800 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      padlockCtx.textAlign = "center";
      padlockCtx.textBaseline = "alphabetic";
      padlockCtx.fillText("NOSE", 0, anchorVisible ? 16 : -11);
      padlockCtx.restore();

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

  // One body-fixed ownship instrument for padlock: a true ADI (attitude from the jet, never
  // the camera), a fixed waterline, the physical roll gate at the signed body-frame roll error,
  // radar altitude and vertical trend. Chevrons always mean keyboard roll direction; nothing in
  // here is mirrored by camera azimuth or target hemisphere, which is the whole point.
  drawPadlockLocatorInset(frame, {
    centreX, top, bottom, left, right,
    steering, groundDanger, centralPullUp, blink,
    pitchDeg, radarAltFt, sinkFpm,
  }) {
    const ctx = this.ctx;
    const state = frame.state;
    const radius = clamp(Math.min(right - left, bottom - top) * 0.16, 50, 66);
    const cx = centreX;
    const cy = clamp(centreY0(top, bottom), top + radius + 30, bottom - radius - 34);
    function centreY0(topPx, bottomPx) {
      return topPx + (bottomPx - topPx) * 0.5 + 118;
    }
    const bankRad = (Number(state.bank_deg) || 0) * DEG;
    const now = Number(frame.now) || 0;
    const rimColor = groundDanger ? RED : GREEN_DIM;

    // Body-frame target hemisphere for the AFT / shoulder language. Independent of the camera:
    // "aft" means behind the WING LINE of the jet, and the shoulder is where the target actually
    // is, so the label survives every sensor slew.
    this.relative.copy(frame.banditPosition).sub(frame.playerPosition);
    const relLength = this.relative.length();
    let aftLabel = null;
    if (relLength > 1e-6) {
      this.relative.multiplyScalar(1 / relLength);
      const targetForward = this.relative.dot(frame.playerForward);
      const targetRight = this.relative.dot(frame.playerRight);
      if (targetForward < -0.17) {
        // Exactly astern has no meaningful shoulder; do not invent one.
        aftLabel = Math.abs(targetRight) < 0.05
          ? "TARGET AFT"
          : `TARGET AFT \u00B7 ${targetRight >= 0 ? "R" : "L"} SHOULDER`;
      }
    }
    if (frame.shoulderHandoffLatched) aftLabel = "SHOULDER SWAP";

    ctx.save();

    if (aftLabel) {
      ctx.fillStyle = frame.shoulderHandoffLatched ? AMBER : "rgba(255, 176, 32, 0.85)";
      ctx.font = "800 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(aftLabel, cx, cy - radius - 14);
    }

    // Backing disc + rim.
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(3, 13, 20, 0.55)";
    ctx.fill();
    ctx.strokeStyle = rimColor;
    ctx.lineWidth = 1.25;
    if (groundDanger) {
      ctx.shadowColor = "rgba(255, 70, 93, 0.6)";
      ctx.shadowBlur = blink ? 9 : 3;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // True ADI: rotate by -bank so a right bank raises the horizon's right end, exactly like a
    // real attitude indicator; pitch displaces the line along the rotated vertical (nose up
    // pushes the horizon down). All from ownship attitude — valid at every camera angle,
    // including straight up and straight down where the old camera-projected horizon vanished.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-bankRad);
    const horizonOffsetPx = clamp(pitchDeg * (radius / 45), -radius * 0.72, radius * 0.72);
    const horizonColor = groundDanger ? RED : GREEN_DIM;
    ctx.strokeStyle = horizonColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-radius, horizonOffsetPx);
    ctx.lineTo(radius, horizonOffsetPx);
    ctx.stroke();
    // Ground-side hatching: short strokes into the earth half.
    ctx.lineWidth = 1;
    for (const t of [-0.72, -0.36, 0, 0.36, 0.72]) {
      ctx.beginPath();
      ctx.moveTo(t * radius, horizonOffsetPx);
      ctx.lineTo(t * radius - 4, horizonOffsetPx + 7);
      ctx.stroke();
    }
    // Sky tick above the horizon at the rotated zenith side.
    ctx.fillStyle = horizonColor;
    ctx.beginPath();
    ctx.moveTo(0, horizonOffsetPx - 10);
    ctx.lineTo(-4, horizonOffsetPx - 3);
    ctx.lineTo(4, horizonOffsetPx - 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Fixed waterline aircraft symbol: the thing being flown, never rotating in its own
    // instrument. Wings, centre dot, fin along positive lift.
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - 15, cy);
    ctx.lineTo(cx - 5, cy);
    ctx.moveTo(cx + 5, cy);
    ctx.lineTo(cx + 15, cy);
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(cx, cy - 9);
    ctx.stroke();
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.arc(cx, cy, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Steering layer.
    const neutral = steering?.valid === true && steering.anyPlane === true;
    const captured = steering?.valid === true && !neutral && steering.captured === true;
    const rollErrorRad = steering?.valid === true && Number.isFinite(steering.rollErrorRad)
      ? steering.rollErrorRad : null;
    const upAngle = -Math.PI / 2;
    let gateAngleFromUpRad = null;

    if (neutral) {
      // Dead six: every plane works. A calm dashed ring plus PULL — never an invented roll cue.
      ctx.strokeStyle = "#7dffb0";
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#7dffb0";
      ctx.font = "800 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PULL", cx, cy + radius * 0.55);
      gateAngleFromUpRad = 0;
    } else if (steering?.valid === true && rollErrorRad !== null) {
      gateAngleFromUpRad = captured ? 0 : rollErrorRad;
      const gateAngle = upAngle + gateAngleFromUpRad;
      const gateColor = captured ? "#7dffb0" : AMBER;
      const gateRadius = radius - 8;

      // Lift line: from the waterline symbol straight up — where a pull throws the nose.
      const liftColor = captured ? "#7dffb0" : GREEN_DIM;
      ctx.strokeStyle = liftColor;
      ctx.fillStyle = liftColor;
      ctx.lineWidth = captured ? 3 : 1.8;
      ctx.shadowColor = captured ? "rgba(77, 255, 136, 0.8)" : "transparent";
      ctx.shadowBlur = captured ? 10 : 0;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 12);
      ctx.lineTo(cx, cy - gateRadius + 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - gateRadius + 1);
      ctx.lineTo(cx - 4, cy - gateRadius + 8);
      ctx.lineTo(cx + 4, cy - gateRadius + 8);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      // The physical roll gate on the ring at the signed body-frame error: positive error means
      // roll RIGHT (clockwise from up). Two radial brackets frame the slot the lift line must
      // reach.
      ctx.strokeStyle = gateColor;
      ctx.lineWidth = 2.4;
      for (const side of [-0.14, 0.14]) {
        const a = gateAngle + side;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (gateRadius - 6), cy + Math.sin(a) * (gateRadius - 6));
        ctx.lineTo(cx + Math.cos(a) * (gateRadius + 4), cy + Math.sin(a) * (gateRadius + 4));
        ctx.stroke();
      }

      if (!captured) {
        // Animated chevrons along the shortest arc from up toward the gate; their travel
        // direction IS the keyboard roll direction.
        const chevronCount = Math.abs(gateAngleFromUpRad) > 70 * DEG ? 3 : 2;
        const phase = (now * 0.55) % 1;
        for (let index = 0; index < chevronCount; index += 1) {
          const fraction = 0.18 + (((index / chevronCount) + phase) % 1) * 0.66;
          const a = upAngle + gateAngleFromUpRad * fraction;
          const tangent = a + (gateAngleFromUpRad < 0 ? -Math.PI / 2 : Math.PI / 2);
          const chevronX = cx + Math.cos(a) * gateRadius;
          const chevronY = cy + Math.sin(a) * gateRadius;
          ctx.save();
          ctx.translate(chevronX, chevronY);
          ctx.rotate(tangent);
          ctx.globalAlpha = 0.6 + fraction * 0.4;
          ctx.fillStyle = AMBER;
          ctx.beginPath();
          ctx.moveTo(6, 0);
          ctx.lineTo(-3.5, -4.4);
          ctx.lineTo(-0.8, 0);
          ctx.lineTo(-3.5, 4.4);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      } else {
        // Captured: streaming pull-flow chevrons up the lift line.
        const phase = (now * 0.7) % 1;
        for (let index = 0; index < 3; index += 1) {
          const fraction = ((index / 3) + phase) % 1;
          const y = cy - 14 - fraction * (gateRadius - 22);
          ctx.globalAlpha = 0.5 + fraction * 0.5;
          ctx.fillStyle = "#7dffb0";
          ctx.beginPath();
          ctx.moveTo(cx, y - 5);
          ctx.lineTo(cx - 4.5, y);
          ctx.lineTo(cx, y - 1.5);
          ctx.lineTo(cx + 4.5, y);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    // Radar altitude + vertical trend under the disc: the "do not hit the ground" numbers in
    // the same glance as the roll cue.
    ctx.fillStyle = groundDanger ? RED : GREEN_DIM;
    ctx.font = "700 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const readoutY = cy + radius + 11;
    const raglText = Number.isFinite(radarAltFt)
      ? `R ${Math.round(radarAltFt).toLocaleString("en-US")} FT` : "R ---";
    const vsText = Number.isFinite(sinkFpm) && Math.abs(sinkFpm) >= 100
      ? `${sinkFpm >= 0 ? "\u2191" : "\u2193"} ${(Math.abs(sinkFpm) / 1000).toFixed(1)}K` : "";
    ctx.fillText(vsText ? `${raglText}   ${vsText}` : raglText, cx, readoutY);
    // Pitch numeral beside the disc so attitude reads without decoding the ADI.
    ctx.textAlign = "left";
    ctx.fillText(`${pitchDeg >= 0 ? "+" : ""}${Math.round(pitchDeg)}\u00B0`,
      cx + radius + 8, cy);

    if (groundDanger && blink && !centralPullUp) {
      ctx.fillStyle = RED;
      ctx.font = "800 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(255, 70, 93, 0.7)";
      ctx.shadowBlur = 8;
      ctx.fillText("GROUND \u00B7 PULL UP", cx, readoutY + 16);
      ctx.shadowBlur = 0;
    }
    ctx.restore();

    if (this._debug) {
      this._debug.padlockInset = {
        x: cx,
        y: cy,
        radius,
        gateAngleFromUpRad,
        neutral,
        captured,
        bankDeg: Number(state.bank_deg) || 0,
        pitchDeg,
        horizonOffsetPx: clamp(pitchDeg * (radius / 45), -radius * 0.72, radius * 0.72),
        aftLabel,
      };
    }
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
      ? frame.displayAirdata.altitudeFt : finiteHudNumber(state.alt_ft);
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
    const speedText = Number.isFinite(displayIndicated)
      ? `${Math.round(displayIndicated)} ${airdata.speedUnit}` : `--- ${airdata.speedUnit}`;
    const altitudeText = Number.isFinite(displayAltitude)
      ? `${Math.round(displayAltitude)} FT` : "--- FT";
    drawFit(`${speedText} · ${altitudeText}${aoaText}`,
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
    if (this.canvas) this.canvas.__weaponsCueHit = null;
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
    // The SAFE annunciation is also the control: tapping it releases the first-pass hold.
    // Publish the hit rect in CSS-pixel HUD coordinates for the pointer layer.
    if (this.canvas && frame.state.weapons_inhibited === true) {
      this.canvas.__weaponsCueHit =
        { x: (this.width - width) / 2, y: y - 14, w: width, h: 28 };
    }
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
    const urgent = rawCall === "WAVE OFF" || rawCall === "ADD POWER NOW"
      || severity === "WAVEOFF";
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

  // Until the pilot opens the legend once, a quiet persistent chip teaches that it exists —
  // the single highest-value control fact a new player can learn.
  drawLegendHint() {
    if (!this.showLegendHint || this.legendVisible || this.touchMode) return;
    const ctx = this.ctx;
    ctx.save();
    const text = "H \u00B7 CONTROLS";
    ctx.font = "800 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const width = ctx.measureText(text).width + 18;
    const x = this.width - this.safeInsets.right - width - 12;
    const y = this.height - this.safeInsets.bottom - 40;
    this.glassPanel(x, y, width, 20, GREEN_DIM);
    ctx.fillStyle = GREEN_DIM;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + width / 2, y + 10);
    ctx.restore();
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

    const binding = (action, fallback) => controlBindingLabel(this.controlBindings?.[action], fallback);

    const wideLines = [
      `${binding("pull", "ArrowDown")} / ${binding("push", "ArrowUp")}  PULL / PUSH   ·   ${binding("rollLeft", "ArrowLeft")} / ${binding("rollRight", "ArrowRight")}  ROLL   ·   ${binding("rudderLeft", "KeyA")} / ${binding("rudderRight", "KeyD")}  RUDDER   ·   ${binding("powerUp", "KeyW")} / ${binding("powerDown", "KeyS")}  THROTTLE`,
      `${binding("gearToggle", "KeyG")}  GEAR   ·   ${binding("flapUp", "BracketLeft")} / ${binding("flapDown", "BracketRight")}  FLAPS UP / DOWN (RELEASE TO HOLD)   ·   ${binding("fire", "KeyF")}  GUNS   ·   ${binding("padlock", "KeyV")}  TARGET / BOAT PADLOCK   ·   DRAG LOOK / 2-FINGER TEMP LOOK`,
      `${binding("limitOverride", "Space")}  LIMIT OVERRIDE (HIGH-Q G / LOW-Q AOA · REFUSES AUTO-GCAS — CAN DEPART)   ·   R  RESTART   ·   M  SOUND   ·   H  HIDE`,
    ];
    const compactLines = [
      `${binding("pull", "ArrowDown")} / ${binding("push", "ArrowUp")}  PULL / PUSH   ·   ${binding("rollLeft", "ArrowLeft")} / ${binding("rollRight", "ArrowRight")}  ROLL`,
      `${binding("rudderLeft", "KeyA")} / ${binding("rudderRight", "KeyD")}  RUDDER   ·   ${binding("powerUp", "KeyW")} / ${binding("powerDown", "KeyS")}  THROTTLE`,
      `${binding("gearToggle", "KeyG")}  GEAR   ·   ${binding("flapUp", "BracketLeft")} / ${binding("flapDown", "BracketRight")}  FLAPS UP / DOWN (RELEASE = HOLD)`,
      `${binding("limitOverride", "Space")}  LIMIT OVR (HIGH-Q G / LOW-Q AOA — CAN DEPART)   ·   ${binding("fire", "KeyF")}  GUNS   ·   M  SOUND`,
      `${binding("padlock", "KeyV")}  PADLOCK   ·   DRAG LOOK / 2-FINGER TEMP LOOK   ·   R  RESTART   ·   H  HIDE`,
    ];
    if (gcasAvailable) {
      wideLines.push(`${binding("gcasOverride", "KeyK")}  AGCAS PADDLE (HOLD TO OVERRIDE AN ACTIVE FLY-UP)`);
      compactLines.push(`${binding("gcasOverride", "KeyK")}  AGCAS PADDLE (HOLD TO OVERRIDE FLY-UP)`);
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
      this._leadPipperEnvelope.reset();
      this._lastLeadPipperX = null;
      this._lastLeadPipperY = null;
    }
    frame.visualGunSolution = this._gunSolutionCue.update(
      { key: hasGunSolution(frame.state) ? "solution" : "no-solution" },
      frame.dt,
    )?.key === "solution";

    // Harness-only geometry contract (assertions.mjs): populated when window.__HUD_DEBUG__ is
    // set, a single falsy test per frame otherwise.
    this._debug = globalThis.__HUD_DEBUG__ === true
      ? {
        waterlinePx: null,
        fpvPx: null,
        ladderRungs: [],
        funnel: null,
        banditPx: null,
        gunHeat: null,
        gunOverheatAnnunciation: null,
      }
      : null;

    this.worldPoint.copy(frame.playerPosition).addScaledVector(frame.playerForward, 10000);
    const noseAnchor = this.project(this.worldPoint, frame.camera, this.noseProjection);
    // FPV anchor: ONE projection pipeline for every mode. The carrier groove supplies the actual
    // deck-relative flight path point; everywhere else the world ground-velocity vector from the
    // kernel snapshot is projected through the same camera. No synthetic screen offsets.
    let fpvAnchor = null;
    if (isApproachMode(frame.state) && frame.flightPathPoint) {
      fpvAnchor = this.project(frame.flightPathPoint, frame.camera, this.projectionB);
    } else {
      const vx = Number(frame.state.vx);
      const vy = Number(frame.state.vy);
      const vz = Number(frame.state.vz);
      const speed = Math.hypot(vx, vy, vz);
      if (Number.isFinite(speed) && speed > 0.5) {
        // Snapshot velocity is sim-frame (Z north); render space flips Z, same as px/py/pz.
        this.velocityDirection.set(vx, vy, -vz).multiplyScalar(10000 / speed);
        this.worldPoint.copy(frame.playerPosition).add(this.velocityDirection);
        fpvAnchor = this.project(this.worldPoint, frame.camera, this.projectionB);
      }
    }
    if (this._debug) {
      this._debug.waterlinePx = noseAnchor.behind
        ? null : { x: noseAnchor.x, y: noseAnchor.y };
      this._debug.fpvPx = fpvAnchor && !fpvAnchor.behind
        ? { x: fpvAnchor.x, y: fpvAnchor.y } : null;
      const m = frame.camera?.projectionMatrix?.elements;
      this._debug.focalXPx = this.width * 0.5 * (Number(m?.[0]) || 0);
      this._debug.focalYPx = this.height * 0.5 * (Number(m?.[5]) || 0);
    }
    const directorAnchor = frame.directorPoint
      ? this.project(frame.directorPoint, frame.camera, this.projectionC)
      : null;
    const systems = systemsReadout(frame.state);
    const carrierPadlock = frame.padlock && frame.padlockTarget === "carrier";

    if (!frame.padlock) this.drawPitchLadder(frame.state, frame.camera);
    this.drawAirframeSymbols(noseAnchor, frame.state, fpvAnchor);
    this.drawGunSight(frame, noseAnchor);
    this.drawAimPoint(frame, noseAnchor, directorAnchor);
    this.drawBandit(frame);
    this.drawHeadingTape(frame.state, { headingDeg: display.headingDeg, headingDigits: display.headingDigits, padlock: frame.padlock });
    this.drawRtbCue(frame.state);

    // Speed trend: a windowed presentation estimate projected ~6 s ahead. The rate estimator
    // deliberately ignores one-frame IAS reversals so the caret reports energy trend, not noise.
    const spd = display.indicatedKts;
    const speedTrend = clamp(display.indicatedRateKtsPerSecond * 6, -60, 60);

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
    this.drawAirdataLabels(frame.state, tapeInset, this.width - tapeInset, display);
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
    this.drawLegendHint();
    this.drawLegend(frame);
    this.drawModeCue(frame);
    this.drawOutcomeCues(frame);
    this.drawDamageFeedback(frame);
    if (this._debug) {
      globalThis.__HUD_GEOMETRY = this._debug;
      this._debug = null;
    }
    this.commitFrame();
  }
}

export function createHud(canvas) {
  return new CombatHud(canvas);
}
