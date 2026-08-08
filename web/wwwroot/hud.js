import * as THREE from "./vendor/three.module.js";
import {
  airdataReadout,
  fuelReadout,
  mobileTacticalReadout,
  speedBrakeReadout,
  speedTapeMarkers,
  stallAwareness,
  systemsReadout,
  targetClosureReadout,
  targetRangeReadout,
  verticalSpeedText,
  visualMergeWeaponsCue,
} from "./render/hud/hud_readouts.js";
import { targetDataLineOwner } from "./render/hud/target_data_line.js";
import {
  ContactRangeTracker,
  contactRangeIdentity,
  contactRangeLifecycle,
} from "./render/hud/contact_range_tracker.js";
import {
  BANDIT_TALLY_RANGE_M,
  contactPositionCue,
} from "./render/hud/contact_visibility.js?v=294";
import { sortiePowerCommand } from "./render/hud/sortie_power.js";
import {
  approachEnergyCue,
  approachEnergyPanelY,
  formatApproachEnergyLine,
} from "./render/hud/approach_energy.js";
import {
  carrierAoARelevant,
  carrierConfigurationCue,
  carrierDistanceM,
  carrierRelativeMotion,
  CarrierPatternCueQualifier,
  recoveryPlatformAvailable,
  recoveryPlatformIsMaritime,
} from "./render/hud/carrier_sa.js";
import {
  padlockAttitudeModel,
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
import { timeCompressionHudPresentation } from "./render/telemetry/time_compression.js";
import {
  recoveryGatePresentation,
  rapierCycleTeachPresentation,
  rapierFlightDirectorPresentation,
  rapierGuidancePresentation,
} from "./render/mission/rapier_guidance.js";
import {
  carrierSortieRoutePresentation,
} from "./render/nav/carrier_sortie_route_presentation.js?v=294";
import {
  advanceRapierHighMachInstruments,
  createRapierHighMachHistory,
} from "./render/mission/rapier_high_mach_instruments.js?v=294";
import { limitsPanelPresentation } from "./render/hud/limits_panel.js";
import { hudPhasePresentation } from "./render/hud/hud_phase.js";
import {
  cobraAccelCaretPx,
  cobraHoverStubPixels,
  updateGroundspeedAccelEma,
} from "./render/cobra/cobra_helicopter_fpv.js";
import {
  armFlightAudio,
  setFlightAudioEnabled,
} from "./render/audio/flight_audio.js?v=294";

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
const GUN_HEAT_DISPLAY_THRESHOLD = 0.05;
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
    case "BARRIER":
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
  if (!recoveryPlatformAvailable(state)) return false;
  const mode = hudMode(state);
  return mode === "APPROACH" || mode === "WAVE-OFF";
}

function selectedOpponentIsAlive(state) {
  const selectedAlive = typeof state.opponent_alive === "boolean"
    ? state.opponent_alive
    : state.bandit_alive !== false;
  return selectedAlive && state.fight !== "Splash";
}

function hasGunSolution(state) {
  return state.gun_solution === true;
}

function isFightHudActive(state) {
  // Circuits is pattern school — never paint bandit/gun fight chrome. Its no-opponent contract is
  // structural, so there is no parked compatibility actor for presentation to reinterpret.
  if (state?.rapier_pattern_only === true) return false;
  if (!selectedOpponentIsAlive(state)) return false;
  return !recoveryPlatformAvailable(state)
    || hudMode(state) === "FREE" || hudMode(state) === "WAVE-OFF";
}

function isCircuitTrafficHudActive(state) {
  return state?.rapier_pattern_only === true;
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

// Where the ladder hangs, and what pitch it reads, when the ladder is referenced to the CAMERA
// rather than to the airframe. Both come from the camera's own world matrix, so any sight bias,
// gunner lean or look offset the camera carries is already included and needs no echo elsewhere.
// Returns null when the camera cannot supply an honest attitude, which makes the caller fall
// back to the airframe-conformal path rather than draw a made-up horizon.
export function cameraPitchAnchor(camera, width, height) {
  const world = camera?.matrixWorld?.elements;
  const projection = camera?.projectionMatrix?.elements;
  if (!world || !projection) return null;
  // three.js cameras look down local -Z; the third basis column is that axis in world space.
  const forwardY = -Number(world[9]);
  if (!Number.isFinite(forwardY)) return null;
  // The principal point is the centre only for an unskewed frustum; read it off the projection
  // so an off-centre or windowed frustum still anchors where the optical axis actually lands.
  const centerX = width * 0.5 * (1 + (Number(projection[8]) || 0));
  const centerY = height * 0.5 * (1 - (Number(projection[9]) || 0));
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return null;
  return {
    centerX,
    centerY,
    pitchDeg: Math.asin(clamp(forwardY, -1, 1)) / DEG,
  };
}

/**
 * Banked ladder-horizon point (camera pitch × bank). When `ladderReference` is camera (Cobra),
 * the waterline W parks here so it agrees with the conformal 0 rung through sight bias —
 * owner ruling over the classical body-forward gap.
 */
export function cameraReferencedAirframeAnchors(camera, width, height, state = {}) {
  const attitude = cameraPitchAnchor(camera, width, height);
  const projection = camera?.projectionMatrix?.elements;
  const matrixScaleY = Number(projection?.[5]);
  if (!attitude || !Number.isFinite(matrixScaleY) || matrixScaleY <= 0) return null;
  const focalY = height * 0.5 * matrixScaleY;
  const localY = Math.tan(attitude.pitchDeg * DEG) * focalY;
  const bank = -(Number(state.bank_deg) || 0) * DEG;
  const cosBank = Math.cos(bank);
  const sinBank = Math.sin(bank);
  return {
    waterline: {
      x: attitude.centerX - localY * sinBank,
      y: attitude.centerY + localY * cosBank,
      behind: false,
    },
  };
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
    this.presentationProfile = "standard";
    this.controlBindings = null;
    this.safeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
    // Rectangles claimed by contact labels this frame; draw() clears it each pass. Initialized
    // here so a label drawn before the first full frame cannot read undefined.
    this._contactLabelSlots = [];

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
    this._heliAccelEmaKtPerSec = 0;
    this._heliAccelSpeedMps = null;
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
    this._lastGcasReleaseCount = 0;
    this._gcasBottomLine = null;
    this._gcasBottomLineUntil = -Infinity;
    this._lastHudHits = 0;
    this._hitFlashUntil = -1;
    this._damageFlashUntil = -1;
    this._destroyedFlashUntil = -1;
    this._flightTestSyncMarker = "";
    this._flightTestSyncMarkerStartedAt = -Infinity;
    this._flightTestSyncMarkerUntil = -Infinity;
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
    this._wingmanLocatorArrowAngle = null;
    // Per-contact range/closure tracking so BOTH bandits carry numbers, not just the selected gun
    // target. The kernel publishes range/closure only for the selected contact; the other one's
    // range comes from its position and its closure from the range-RATE across frames (smoothed).
    // Samples are keyed to snapshot entity/sortie identity so a replacement in the same formation
    // role cannot inherit the previous aircraft's motion.
    this._contactRangeTracker = new ContactRangeTracker();
    this._rapierHighMachHistory = createRapierHighMachHistory();
    this._wingmanLocatorArrowLastNow = -Infinity;
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

  setPresentationProfile(profile) {
    this.presentationProfile = String(profile || "standard");
    if (this.presentationProfile !== "standard") this.legendVisible = false;
  }

  usesMobileTacticalProfile() {
    return this.presentationProfile === "portrait_dual_stick"
      || this.presentationProfile === "touch_dual_stick";
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
    // Shared flight bus owns unlock; keep this as the gesture entry from controls / ready.
    armFlightAudio();
  }

  toggleAudio() {
    return this.setAudioEnabled(!this.audioEnabled);
  }

  setAudioEnabled(enabled) {
    this.audioEnabled = Boolean(enabled);
    setFlightAudioEnabled(this.audioEnabled);
    return this.audioEnabled;
  }

  showFlightTestSyncMarker(markerId, nowSeconds) {
    const now = Number(nowSeconds);
    if (!Number.isFinite(now)) return false;
    this._flightTestSyncMarker = String(markerId || "MARK").slice(0, 24);
    this._flightTestSyncMarkerStartedAt = now;
    this._flightTestSyncMarkerUntil = now + 1.0;
    return true;
  }

  drawFlightTestSyncMarker(frame) {
    const now = Number(frame?.now);
    if (!Number.isFinite(now) || now >= this._flightTestSyncMarkerUntil) return;
    const ctx = this.ctx;
    const elapsed = Math.max(0, now - this._flightTestSyncMarkerStartedAt);
    const bright = Math.floor(elapsed * 10) % 2 === 0;
    const text = `FLIGHT TEST SYNC · ${this._flightTestSyncMarker}`;
    const y = this.safeInsets.top + 44;

    ctx.save();
    ctx.strokeStyle = bright ? "#ffffff" : AMBER;
    ctx.lineWidth = bright ? 4 : 2;
    ctx.strokeRect(5, 5, this.width - 10, this.height - 10);
    ctx.font = "900 15px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const width = Math.min(this.width - 32, ctx.measureText(text).width + 30);
    const x = (this.width - width) / 2;
    ctx.fillStyle = "rgba(0, 0, 0, 0.88)";
    ctx.fillRect(x, y, width, 34);
    ctx.strokeStyle = bright ? "#ffffff" : AMBER;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, 33);
    ctx.fillStyle = bright ? "#ffffff" : AMBER;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, this.width / 2, y + 17);
    ctx.restore();
  }

  updateGunAudio(_frame) {
    // Gun reports live on the shared flight bus (updateFlightAudio).
  }

  updateGcasAudio(_frame) {
    // GCAS aural lives on the shared flight bus (updateFlightAudio).
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
      compactMobile: this.usesMobileTacticalProfile(),
      safeInsets: this.safeInsets,
    });
  }

  drawPitchLadder(
    state,
    camera,
    boresightAnchor = null,
    compactMobile = false,
    reference = "airframe",
  ) {
    const ctx = this.ctx;
    const bank = -(Number(state.bank_deg) || 0) * DEG;
    // An airframe-conformal ladder only tells the truth while the camera's optical axis lies
    // along body-forward. The Cobra's rear seat holds a fixed +0.08 rad sight bias plus a
    // <=0.05 rad gunner-target lean, so the anchor sits up to ~0.13 rad off axis and a gnomonic
    // rung offset stops being a translation — the horizon rung drifted ~100 px below the visible
    // horizon and read as a permanent nose-down attitude. hud.js already concedes the principle
    // by suppressing this ladder in padlock. Camera reference anchors at the principal point and
    // measures pitch off the camera itself, so the 0 rung lands exactly on the drawn horizon.
    const cameraReferenced = reference === "camera";
    const cameraAttitude = cameraReferenced ? cameraPitchAnchor(camera, this.width, this.height) : null;
    const pitch = cameraAttitude ? cameraAttitude.pitchDeg : Number(state.pitch_deg) || 0;
    const radius = Math.max(120, this.height * 0.42);
    const projection = camera?.projectionMatrix?.elements;
    const matrixScaleY = Number(projection?.[5]);
    // The ladder is drawn with the SAME projection as the rendered world — no synthetic
    // pixels-per-degree fallback. Without a live camera matrix there is no honest ladder.
    if (!Number.isFinite(matrixScaleY) || matrixScaleY <= 0) return;
    // Camera reference needs no boresight: its origin is the principal point, which exists in
    // every forward view. Airframe reference still refuses to draw without an honest anchor.
    if (!cameraAttitude
      && (!boresightAnchor || boresightAnchor.behind
        || !Number.isFinite(boresightAnchor.x) || !Number.isFinite(boresightAnchor.y))) return;
    const focalLengthY = this.height * 0.5 * matrixScaleY;
    // The ladder belongs to the AIRFRAME, not the pilot's eye line. Its local origin is therefore
    // the projected body-forward direction computed through the actual render camera. With a
    // forward view this is the PerspectiveCamera principal point; drag-look/two-finger-look moves
    // it by the gnomonic look offset (focal * tan(angle)), so the complete ladder slides toward and
    // then through the viewport edge with the waterline instead of remaining glued to the screen.
    const projectionCenterX = cameraAttitude ? cameraAttitude.centerX : boresightAnchor.x;
    const projectionCenterY = cameraAttitude ? cameraAttitude.centerY : boresightAnchor.y;
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
    // Clip in screen space around the projected airframe boresight. Rung centres and endpoints are
    // rotated first below, so a high-bank rung cannot be admitted by its pre-roll vertical offset.
    ctx.beginPath();
    ctx.arc(projectionCenterX, projectionCenterY, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(safe.left, safe.top, Math.max(0, safe.right - safe.left), Math.max(0, safe.bottom - safe.top));
    ctx.clip();
    // Declutter exclusion: rungs must not stab through the gunsight/FPV working area at boresight.
    // Even-odd clip = everything except a circle around the projected nose. The rungs
    // keep their own centre gap as well, so the ladder still reads as one instrument.
    const exclusionRadius = clamp(this.height * 0.115, 72, 102);
    ctx.beginPath();
    ctx.rect(0, 0, this.width, this.height);
    ctx.arc(projectionCenterX, projectionCenterY, exclusionRadius, 0, Math.PI * 2);
    ctx.clip("evenodd");

    ctx.font = `${compactMobile ? "700 8px" : "600 10px"} ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const rungStep = compactMobile ? 10 : 5;
    const pitchWindow = compactMobile ? 20 : 25;
    const firstRung = Math.max(-90,
      Math.ceil((pitch - pitchWindow) / rungStep) * rungStep);
    const lastRung = Math.min(90,
      Math.floor((pitch + pitchWindow) / rungStep) * rungStep);
    if (compactMobile) ctx.globalAlpha *= 0.64;

    for (let rung = firstRung; rung <= lastRung; rung += rungStep) {
      // Perspective projection, not a fixed pixels-per-degree approximation. At level attitude the
      // In the forward view the 0 rung is exactly on camera centre; +10/-10 are equal and opposite
      // about it. Pitching up moves the true-horizontal 0 rung down by the same projection used by
      // the rendered world, while manual look translates the whole calibrated ladder with the nose.
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
      const halfWidth = compactMobile
        ? (rung === 0 ? Math.min(132, this.width * 0.33) : Math.min(68, this.width * 0.18))
        : rung === 0 ? 188 : major ? 96 : 50;
      const centerGap = compactMobile ? 18 : rung === 0 ? 30 : 22;

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
        const labelEnds = compactMobile ? [1] : [-1, 1];
        for (const end of labelEnds) {
          const label = rotatePoint(end * (halfWidth + 15), localY);
          ctx.fillText(text, label.x, label.y + 0.5);
        }
      }
      ctx.restore();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ONE projection pipeline for the airframe symbols. The WATERLINE is the projected
  // body-forward direction (nose anchor) — classical aircraft reference, screen-aligned.
  // The FPV is world ground velocity through the same camera. When state.heli_flight_path
  // is set (Cobra), conformal FPV blanks below cruise GS and a hover stub + cues take over.
  drawAirframeSymbols(anchor, state, fpvAnchor = null, {
    hoverStub = null,
    accelCaretPx = 0,
    dt = 0,
  } = {}) {
    if (!anchor || anchor.behind || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return;
    const ctx = this.ctx;
    const heli = state?.heli_flight_path === true;
    const level = heli ? String(state.heli_fpv_level || "normal") : "normal";
    const pathColor = level === "warning" ? RED : level === "caution" ? AMBER : GREEN;
    const pathColorDim = level === "warning" ? "rgba(255, 70, 93, 0.55)"
      : level === "caution" ? "rgba(255, 176, 32, 0.55)"
        : "rgba(77, 255, 136, 0.42)";

    ctx.save();
    this.setLine(GREEN, 1.15);
    ctx.shadowColor = "rgba(77, 255, 136, 0.3)";
    ctx.shadowBlur = 3;

    // WATERLINE — body axis. Never bank-rotated onto the horizon (that was the Build 266 mistake).
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

    const fpvVisible = fpvAnchor && !fpvAnchor.behind
      && Number.isFinite(fpvAnchor.x) && Number.isFinite(fpvAnchor.y);
    if (fpvVisible) {
      ctx.save();
      ctx.translate(fpvAnchor.x, fpvAnchor.y);
      this.setLine(pathColor, 1.7);
      ctx.shadowColor = pathColorDim;
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
      if (heli && state.heli_fpv_gun_ready === true) {
        // Inboard gun-ready tick — only when Hold F actually fires.
        ctx.beginPath();
        ctx.moveTo(-4, 10);
        ctx.lineTo(0, 16);
        ctx.lineTo(4, 10);
        ctx.stroke();
      }
      if (heli && Math.abs(accelCaretPx) >= 1) {
        const tip = accelCaretPx > 0 ? -7 - Math.abs(accelCaretPx) : 7 + Math.abs(accelCaretPx);
        const base = accelCaretPx > 0 ? -7 : 7;
        ctx.beginPath();
        ctx.moveTo(0, base);
        ctx.lineTo(-4, tip);
        ctx.lineTo(4, tip);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    } else if (heli && hoverStub && hoverStub.lengthPx > 1) {
      // Screen-fixed plan-view velocity stub from the waterline (hover / transition).
      ctx.save();
      ctx.translate(anchor.x, anchor.y);
      this.setLine(pathColor, 1.55);
      ctx.shadowColor = pathColorDim;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.moveTo(0, 0);
      ctx.lineTo(hoverStub.dx, hoverStub.dy);
      ctx.stroke();
      if (Math.abs(accelCaretPx) >= 1) {
        const len = hoverStub.lengthPx || 1;
        const ux = hoverStub.dx / len;
        const uy = hoverStub.dy / len;
        const tipScale = accelCaretPx > 0 ? 1 : -1;
        const tipX = hoverStub.dx + ux * tipScale * Math.abs(accelCaretPx);
        const tipY = hoverStub.dy + uy * tipScale * Math.abs(accelCaretPx);
        const px = -uy * 4;
        const py = ux * 4;
        ctx.beginPath();
        ctx.moveTo(hoverStub.dx + px, hoverStub.dy + py);
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(hoverStub.dx - px, hoverStub.dy - py);
        ctx.stroke();
      }
      if (state.heli_fpv_gun_ready === true) {
        ctx.beginPath();
        ctx.moveTo(-4, 8);
        ctx.lineTo(0, 14);
        ctx.lineTo(4, 8);
        ctx.stroke();
      }
      ctx.restore();
    }
    void dt;
    ctx.restore();
  }

  drawGunHeat(state) {
    const ctx = this.ctx;
    const heat = clamp(Number(state.gun_heat) || 0, 0, 1);
    const overheated = state.gun_overheat === true;
    const present = overheated
      || state.gun_firing === true
      || heat >= GUN_HEAT_DISPLAY_THRESHOLD;
    if (!present) {
      if (this._debug) {
        this._debug.gunHeat = {
          present: false,
          heat,
          fillFraction: 0,
          caution: false,
          overheated: false,
        };
      }
      return;
    }
    const caution = heat >= GUN_HEAT_AMBER_THRESHOLD;
    // Mobile folds qualified temperature into the persistent GUN line. A second top-right bar
    // consumed the exact pixels needed for target and energy state, while OVERHEAT still owns its
    // urgent centre annunciation.
    if (this.usesMobileTacticalProfile()) {
      if (this._debug) {
        this._debug.gunHeat = {
          present: true,
          heat,
          fillFraction: heat,
          caution,
          overheated,
          integrated: true,
        };
      }
      return;
    }
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

    if (!anchor || anchor.behind || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)
        || anchor.x < -20 || anchor.x > this.width + 20
        || anchor.y < -20 || anchor.y > this.height + 20) {
      this._leadPipperEnvelope.reset();
      this._lastLeadPipperX = null;
      this._lastLeadPipperY = null;
      // NO CAGED-GUN TEXT. This printed "GUN CAGED · TARGET n · FOLLOW ROLL / PULL" mid-screen
      // whenever the padlocked target's pipper was off-screen or behind, which in a padlock fight
      // is most of the time — so it read as a label appearing at random. It was also redundant:
      // the padlock director already publishes a signed roll error on the instrument, which tells
      // the pilot which way to roll and by how much rather than telling them that a gun they can
      // already see is caged. A cue the pilot cannot act on more precisely than the instrument
      // beside it is noise.
      if (this._debug) this._debug.offAxisGunCue = null;
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
    if (this._debug) this._debug.gunCrossPx = { x: anchor.x, y: anchor.y };
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

  /// The range/closure data line beside a contact's bracket. Factored so the primary designator
  /// and the formation-wingman marker render the identical instrument: the kernel's range_m and
  /// closure_kts follow the player's gun-target selection, so exactly one bracket — the selected
  /// jet's — carries the numbers.
  drawTargetDataLine(projection, size, state, color) {
    const ctx = this.ctx;
    const safe = this.getLayout().targetSafe;
    const mobileTactical = this.usesMobileTacticalProfile();
    const closure = targetClosureReadout(state.closure_kts);
    const dataLine = `${targetRangeReadout(state.range_m).compactText} · ${closure.compactText}`;
    ctx.font = `${mobileTactical ? "800 10px" : "600 9px"} ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    const textWidth = ctx.measureText(dataLine).width;
    const textHeight = mobileTactical ? 17 : 14;
    const rightX = projection.x + size + 8;
    const useRight = rightX + textWidth + 8 <= safe.right;
    const textX = useRight ? rightX : projection.x - size - 8 - textWidth;
    const textY = clamp(projection.y - textHeight / 2, safe.top, safe.bottom - textHeight);
    ctx.fillStyle = mobileTactical ? "rgba(1, 8, 12, 0.78)" : "rgba(1, 8, 12, 0.68)";
    ctx.fillRect(textX - 4, textY, textWidth + 8, textHeight);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(dataLine, textX, textY + textHeight / 2);
  }

  /// Range and closure for a contact that is NOT the selected gun target, so both bandits show
  /// "<range>NM · <closure>". Range is straight from the two positions; closure is the range-rate
  /// over the frame, EMA-smoothed so it does not jitter. Positive closure = closing.
  contactRangeClosureText(position, frame, role) {
    const player = frame.playerPosition;
    if (!position || !player) return { rangeText: "---", closureText: "" };
    const { rangeM, closureKts } = this._contactRangeTracker.update({
      identity: contactRangeIdentity(frame.state, role),
      lifecycle: contactRangeLifecycle(frame.state),
      position,
      playerPosition: player,
      nowSeconds: frame.now,
    });
    return {
      rangeText: targetRangeReadout(rangeM).compactText,
      closureText: closureKts == null ? "" : targetClosureReadout(closureKts).compactText,
    };
  }

  drawWingmanLocator(frame, selected = true) {
    if (frame.padlock) return;
    const locatorColor = selected ? AMBER : GREEN;
    const position = frame.wingmanPosition;
    this.relative.copy(position).sub(frame.playerPosition)
      .transformDirection(frame.camera.matrixWorldInverse);
    const planeMagnitude = Math.hypot(this.relative.x, this.relative.y);
    let rawAngle;
    if (planeMagnitude > 0.02) {
      rawAngle = Math.atan2(-this.relative.y / planeMagnitude,
        this.relative.x / planeMagnitude);
    } else if (Number.isFinite(this._wingmanLocatorArrowAngle)) {
      rawAngle = this._wingmanLocatorArrowAngle;
    } else {
      rawAngle = 0;
    }

    const now = Number(frame.now) || 0;
    const continuous = Number.isFinite(this._wingmanLocatorArrowAngle)
      && now > this._wingmanLocatorArrowLastNow
      && now - this._wingmanLocatorArrowLastNow < 0.25;
    if (continuous) {
      this._wingmanLocatorArrowAngle += clamp(
        wrapPi(rawAngle - this._wingmanLocatorArrowAngle),
        -6 * (Number(frame.dt) || 0.016),
        6 * (Number(frame.dt) || 0.016),
      );
    } else {
      this._wingmanLocatorArrowAngle = rawAngle;
    }
    this._wingmanLocatorArrowLastNow = now;

    const dx = Math.cos(this._wingmanLocatorArrowAngle);
    const dy = Math.sin(this._wingmanLocatorArrowAngle);
    const safe = this.getLayout().targetSafe;
    const centreX = (safe.left + safe.right) * 0.5;
    const centreY = (safe.top + safe.bottom) * 0.5;
    const scale = Math.min(
      (safe.right - safe.left) * 0.5 / Math.max(Math.abs(dx), 0.0001),
      (safe.bottom - safe.top) * 0.5 / Math.max(Math.abs(dy), 0.0001),
    );
    const x = centreX + dx * scale;
    const y = centreY + dy * scale;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(dy, dx));
    this.setLine(locatorColor, 2.0);
    ctx.fillStyle = selected ? "rgba(255, 176, 32, 0.24)" : "rgba(77, 255, 136, 0.18)";
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, -8);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Both bandits carry range/closure. The selected one uses the kernel's authoritative
    // range_m/closure_kts; the unselected wingman computes its own from position + range-rate so it
    // is never just a bare name (owner: "I still don't have speed/distance labels on both bandits").
    let label;
    if (selected) {
      const range = targetRangeReadout(frame.state.range_m).compactText;
      const closure = targetClosureReadout(frame.state.closure_kts).compactText;
      label = `TARGET 2 · SELECTED · ${range} · ${closure}`;
    } else {
      const rc = this.contactRangeClosureText(frame.wingmanPosition, frame, "wingman");
      label = rc.closureText
        ? `TARGET 2 · ${rc.rangeText} · ${rc.closureText}`
        : `TARGET 2 · ${rc.rangeText}`;
    }
    ctx.font = "800 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const fitted = this.fitText(label, Math.max(80, safe.right - safe.left - 12));
    const width = ctx.measureText(fitted).width;
    const labelX = clamp(x - dx * 40,
      safe.left + width * 0.5 + 5, safe.right - width * 0.5 - 5);
    const labelY = clamp(y - dy * 28, safe.top + 8, safe.bottom - 8);
    ctx.fillStyle = "rgba(1, 8, 12, 0.78)";
    ctx.fillRect(labelX - width * 0.5 - 4, labelY - 7, width + 8, 14);
    ctx.fillStyle = locatorColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fitted, labelX, labelY);

    if (this._debug) {
      this._debug.selectedTargetLocator = {
        owner: "wingman",
        x,
        y,
        dirX: dx,
        dirY: dy,
        label,
      };
    }
  }

  /// Symbology for the second aircraft of a formation. Deliberately a SMALLER, thinner bracket in
  /// the same green, going amber when the pilot padlocks it with V. The range/closure data line
  /// follows the player's gun-target selection: padlock TRAFFIC 2 and its bracket carries the
  /// numbers while the primary's goes quiet — the instrument sits on the jet it measures.
  drawWingman(frame) {
    const { state, camera } = frame;
    if (frame.wingmanPresent !== true) return;
    if (frame.padlock && frame.padlockTarget === "carrier") return;
    // Fight formation wingman uses fight HUD; Circuits uses the same slots for pattern traffic.
    if (!isFightHudActive(state) && !isCircuitTrafficHudActive(state)) return;
    const circuitTraffic = isCircuitTrafficHudActive(state);
    const selected = !circuitTraffic && targetDataLineOwner(state) === "wingman";
    const projection = this.project(frame.wingmanPosition, camera);
    // Same tally discipline as the primary: no positional bracket for a BVR contact.
    let rangeM = Number.POSITIVE_INFINITY;
    if (frame.wingmanPosition && frame.playerPosition) {
      const dx = frame.wingmanPosition.x - frame.playerPosition.x;
      const dy = frame.wingmanPosition.y - frame.playerPosition.y;
      const dz = frame.wingmanPosition.z - frame.playerPosition.z;
      rangeM = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    const inside = projection.x > 8 && projection.x < this.width - 8
      && projection.y > 8 && projection.y < this.height - 8;
    const onScreen = projection.behind !== true && inside;
    const padlocked = frame.padlock && (frame.padlockTarget === "wingman"
      || frame.padlockTarget === "traffic2"
      || frame.padlockTarget === "traffic3");
    const solution = selected && frame.visualGunSolution === true;
    const color = padlocked || selected || solution ? AMBER : GREEN;
    const positionCue = contactPositionCue(rangeM, onScreen);
    if (!circuitTraffic && positionCue === "box") {
      this.drawVisibleTargetBox(
        projection.x,
        projection.y,
        color,
        frame,
        selected,
        { role: "wingman", targetLabel: "TARGET 2" },
      );
      if (this._debug) {
        this._debug.wingmanLocator = {
          arrowDrawn: false,
          boxDrawn: true,
          rangeM,
        };
      }
      return;
    }
    if (positionCue !== "bracket") {
      // Always show the second bandit's bearing, selected or not — both must be visible at once.
      this.drawWingmanLocator(frame, selected);
      return;
    }

    const ctx = this.ctx;
    const size = solution ? 30 : padlocked || selected ? 26 : 20;
    const corner = 6;
    this.setLine(color, padlocked ? 1.5 : 1.05);
    ctx.shadowColor = padlocked
      ? "rgba(255, 176, 32, 0.40)" : "rgba(77, 255, 136, 0.26)";
    ctx.shadowBlur = 4;
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
    if (padlocked) {
      ctx.fillStyle = AMBER;
      ctx.beginPath();
      ctx.arc(projection.x, projection.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (selected) {
      ctx.font = "800 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillStyle = AMBER;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      this.placeContactLabel(solution ? "TARGET 2 · SHOOT" : "TARGET 2 · SELECTED",
        projection.x, projection.y + size + 5);
      this.drawTargetDataLine(projection, size, state, color);
    } else if (!circuitTraffic) {
      // Named AND ranged even when it is not the gun target, so both on-screen bandits carry their
      // numbers, not just the selected one.
      const rc = this.contactRangeClosureText(frame.wingmanPosition, frame, "wingman");
      const text = rc.closureText
        ? `TARGET 2 · ${rc.rangeText} · ${rc.closureText}` : `TARGET 2 · ${rc.rangeText}`;
      ctx.font = "700 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillStyle = GREEN;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      this.placeContactLabel(text, projection.x, projection.y + size + 5);
    }
    if (circuitTraffic && padlocked) {
      ctx.font = "600 9px ui-monospace, monospace";
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("TRAFFIC", projection.x, projection.y + size + 6);
    }
  }

  /// A square target box for a visible-but-distant contact, with its range/closure label.
  /// Corner brackets, not a solid square, so it never occludes the aircraft it frames.
  drawVisibleTargetBox(
    x,
    y,
    color,
    frame,
    selected,
    { role = "bandit", targetLabel = "TARGET 1" } = {},
  ) {
    const ctx = this.ctx;
    const size = 18;
    const corner = 6;
    this.setLine(color, 1.35);
    ctx.shadowColor = color === AMBER
      ? "rgba(255, 176, 32, 0.34)" : "rgba(77, 255, 136, 0.30)";
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(x - size, y - size + corner);
    ctx.lineTo(x - size, y - size);
    ctx.lineTo(x - size + corner, y - size);
    ctx.moveTo(x + size - corner, y - size);
    ctx.lineTo(x + size, y - size);
    ctx.lineTo(x + size, y - size + corner);
    ctx.moveTo(x + size, y + size - corner);
    ctx.lineTo(x + size, y + size);
    ctx.lineTo(x + size - corner, y + size);
    ctx.moveTo(x - size + corner, y + size);
    ctx.lineTo(x - size, y + size);
    ctx.lineTo(x - size, y + size - corner);
    ctx.stroke();
    ctx.shadowBlur = 0;
    const state = frame.state;
    let label;
    if (selected) {
      label = `${targetLabel} · SELECTED · ${targetRangeReadout(state.range_m).compactText}`
        + ` · ${targetClosureReadout(state.closure_kts).compactText}`;
    } else {
      const position = role === "wingman" ? frame.wingmanPosition : frame.banditPosition;
      const rc = this.contactRangeClosureText(position, frame, role);
      label = rc.closureText
        ? `${targetLabel} · ${rc.rangeText} · ${rc.closureText}`
        : `${targetLabel} · ${rc.rangeText}`;
    }
    ctx.font = `${selected ? "800" : "700"} 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    this.placeContactLabel(label, x, y + size + 5);
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
    // Beyond plausible tally there is nothing to SEE: positional brackets for a BVR contact
    // read as a visible aircraft and horizon-flatten into a false co-altitude cue (owner
    // report 2026-07-29: "if the bad guy is 360nm away why can I see him?"). The contact
    // keeps its bearing locator and data line; brackets wait for tally range.
    const primaryRangeM = banditPosition && frame.playerPosition
      ? banditPosition.distanceTo(frame.playerPosition) : Number(state.range_m);
    const bvrContact = primaryRangeM > BANDIT_TALLY_RANGE_M;
    const selectedPrimary = targetDataLineOwner(state) === "primary";
    const solution = selectedPrimary && frame.visualGunSolution === true;
    const padlockedBandit = frame.padlock && frame.padlockTarget === "bandit";
    const color = padlockedBandit || selectedPrimary || solution ? AMBER : GREEN;
    const ctx = this.ctx;
    const mobileTactical = this.usesMobileTacticalProfile();
    const size = solution ? 32
      : padlockedBandit || selectedPrimary ? (mobileTactical ? 32 : 30)
        : mobileTactical ? 29 : 27;
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
      this._debug.banditLocator = {
        markerInside: inside && !bvrContact,
        arrowDrawn: false,
        bvrContact,
      };
    }

    if (inside && !bvrContact) {
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

      // The numbers follow the gun-target selection; when TRAFFIC 2 is selected the data
      // line rides its bracket (drawWingman) rather than hovering beside a jet it no longer
      // measures.
      if (targetDataLineOwner(state) === "primary")
        this.drawTargetDataLine(projection, size, state, color);
      if (selectedPrimary) {
        ctx.font = "800 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        ctx.fillStyle = AMBER;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        this.placeContactLabel(solution ? "TARGET 1 · SHOOT" : "TARGET 1 · SELECTED",
          projection.x, projection.y + size + 5);
      } else if (frame.wingmanPresent === true) {
        // In a 2v1 the unselected primary is also named AND ranged, so both bandits carry numbers.
        const rc = this.contactRangeClosureText(banditPosition, frame, "bandit");
        const text = rc.closureText
          ? `TARGET 1 · ${rc.rangeText} · ${rc.closureText}` : `TARGET 1 · ${rc.rangeText}`;
        ctx.font = "700 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        ctx.fillStyle = GREEN;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        this.placeContactLabel(text, projection.x, projection.y + size + 5);
      }

      return;
    }

    // Combat padlock owns one edge locator at every look angle. Drawing the ordinary forward-HUD
    // arrow as well would create two differently referenced directions around the threshold.
    if (frame.padlock && frame.padlockTarget !== "carrier") return;
    // BOTH BANDITS ARE ALWAYS SHOWN. This used to `return` unless the primary was the selected gun
    // target, so at any moment only ONE of the two bandits had an off-screen cue -- the other
    // vanished, which is the owner's "the wingman ran away and I couldn't see him" (2026-08-01):
    // both must be clearly visible at all times. The primary now keeps its locator whether or not
    // it is selected; `color` is already GREEN when unselected and AMBER when it is, so the two
    // arrows read as "the one I'm on" vs "the other one" without a second, competing gun readout.

    // A LOCATOR IS FOR SOMETHING YOU CANNOT SEE. If the contact is in front and projects inside
    // the display, do not draw one: the marker already says where it is, and an arrow adds a
    // second, contradictory answer.
    //
    // Without this the locator drew whenever a target was selected, and the scale below ALWAYS
    // projects it onto the rect boundary -- so it sat on the edge even with the contact dead
    // ahead. Centring the target collapses dx/dy toward zero, where the direction is noise, and
    // the arrow whips around the edge pointing offscreen at the exact moment the pilot has
    // finally pointed at the thing it is meant to point to.
    //
    // Turn toward the arrow and it leaves. That is the whole affordance.
    const locatorOnScreen = projection.behind !== true
      && projection.x > this.safeInsets.left + 12
      && projection.x < this.width - this.safeInsets.right - 12
      && projection.y > this.safeInsets.top + 12
      && projection.y < this.height - this.safeInsets.bottom - 12;
    // Only stand down when something ELSE is already showing where the contact is. Inside tally
    // range that is the marker. A BVR contact has no marker by design -- there is nothing to see
    // at 137 NM -- so suppressing its arrow too would leave the pilot with no cue whatever, which
    // is worse than the bug being fixed and is what the geometry contract caught.
    if (locatorOnScreen && !bvrContact) {
      if (this._debug) this._debug.locatorArrow = null;
      this._locatorArrowLastNow = Number(frame.now) || 0;
      return;
    }

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
    // A BVR contact gets a BEARING, and a bearing belongs on the display edge. Clamping it to
    // targetSafe instead put a 137 NM contact's chevron mid-screen, planted over the terrain,
    // where it reads as "the enemy is there in the dirt" rather than "turn that way" -- the same
    // complaint as the brackets, which were already fixed for exactly this reason. targetSafe's
    // bottom deliberately stops above the tape area, so on a phone its "edge" is nowhere near
    // the edge of the screen.
    //
    // Inside tally range the contact is a real thing you can see, so the protected tape area
    // still applies and the locator stays where the rest of the HUD lives.
    const edgeInsetPx = 10;
    const atDisplayEdge = frame.padlock || bvrContact;
    const locatorLeft = atDisplayEdge
      ? this.safeInsets.left + edgeInsetPx : safe.left;
    const locatorRight = atDisplayEdge
      ? this.width - this.safeInsets.right - edgeInsetPx : safe.right;
    const locatorTop = frame.padlock ? Math.max(safe.top, this.safeInsets.top + 78)
      : bvrContact ? this.safeInsets.top + edgeInsetPx : safe.top;
    const locatorBottom = frame.padlock
      ? Math.max(locatorTop + 20, safe.bottom)
      : bvrContact
        ? Math.max(locatorTop + 20, this.height - this.safeInsets.bottom - edgeInsetPx)
        : safe.bottom;
    const safeCenterX = (locatorLeft + locatorRight) * 0.5;
    const safeCenterY = (locatorTop + locatorBottom) * 0.5;
    const halfWidth = (locatorRight - locatorLeft) * 0.5;
    const halfHeight = (locatorBottom - locatorTop) * 0.5;
    // A BVR contact that projects ON screen is drawn AT the projection, not flung out to the
    // edge. Clamping it outward is what made the arrow "point offscreen when I point at the thing
    // it is meant to point to": centring the target collapses dx/dy toward zero, where direction
    // is noise, and the edge projection then whips the arrow around the rim. Placed at the
    // projection it simply sits on the contact and stops moving.
    // A contact CLOSE ENOUGH TO SEE that projects on screen gets a SQUARE TARGET BOX on it, not a
    // bearing arrow. An arrow answers "which way is it" -- right for something off-screen or truly
    // out of sight; a box answers "there it is" -- right when it is a visible dot in front of you
    // (owner, at 13 NM: "that should be a square"). The box is gated on VISIBLE_TARGET_RANGE_M so a
    // genuinely BVR contact (160 NM) still gets only a bearing arrow and never a false "aircraft
    // here" bracket -- the distinction the geometry contract protects.
    if (contactPositionCue(primaryRangeM, locatorOnScreen) === "box") {
      this.drawVisibleTargetBox(projection.x, projection.y, color, frame, selectedPrimary);
      if (this._debug && this._debug.banditLocator) this._debug.banditLocator.arrowDrawn = false;
      return;
    }
    let x;
    let y;
    if (bvrContact && locatorOnScreen) {
      x = projection.x;
      y = projection.y;
    } else {
      const scale = Math.min(
        halfWidth / Math.max(Math.abs(dx), 0.0001),
        halfHeight / Math.max(Math.abs(dy), 0.0001),
      );
      x = safeCenterX + dx * scale;
      y = safeCenterY + dy * scale;
    }
    const angle = Math.atan2(dy, dx);

    if (this._debug && this._debug.banditLocator) {
      this._debug.banditLocator.arrowDrawn = true;
      this._debug.banditLocator.dirX = dx;
      this._debug.banditLocator.dirY = dy;
    }
    // Green when this is not the selected target, amber when it is. An unselected primary (you are
    // on TARGET 2) still gets a clearly-visible green arrow rather than disappearing.
    const locatorAmber = selectedPrimary || padlockedBandit || solution || frame.padlock;
    const locatorFill = locatorAmber
      ? (frame.padlock ? "rgba(255, 176, 32, 0.28)" : "rgba(255, 176, 32, 0.16)")
      : "rgba(77, 255, 136, 0.18)";
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    this.setLine(locatorAmber ? AMBER : GREEN, frame.padlock ? 2.25 : 1.6);
    ctx.fillStyle = locatorFill;
    ctx.shadowColor = frame.padlock ? "rgba(255, 176, 32, 0.68)" : "transparent";
    ctx.shadowBlur = frame.padlock ? 8 : 0;
    const locatorTip = mobileTactical ? 17 : 12;
    const locatorTail = mobileTactical ? -10 : -8;
    const locatorHalfHeight = mobileTactical ? 10 : 8;
    ctx.beginPath();
    ctx.moveTo(locatorTip, 0);
    ctx.lineTo(locatorTail, -locatorHalfHeight);
    ctx.lineTo(mobileTactical ? -3 : -3, 0);
    ctx.lineTo(locatorTail, locatorHalfHeight);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    const length = Math.hypot(dx, dy) || 1;
    const azimuth = angles.azimuth * RAD_TO_DEG;
    // The off-screen locator's caption follows the same ownership: an arrow to the primary
    // must not be captioned with the selected wingman's range.
    const numbersHere = targetDataLineOwner(state) === "primary";
    const closure = targetClosureReadout(state.closure_kts);
    // When the primary is NOT the selected gun target, state.range_m/closure_kts belong to the
    // wingman -- so compute the primary's own numbers from its position, and always show them.
    const primaryNumbers = numbersHere
      ? `${targetRangeReadout(state.range_m).compactText} · ${closure.compactText}`
      : (() => {
        const rc = this.contactRangeClosureText(frame.banditPosition, frame, "bandit");
        return rc.closureText ? `${rc.rangeText} · ${rc.closureText}` : rc.rangeText;
      })();
    const sixPrefix = Math.abs(azimuth) > 150 ? "6 · " : "";
    const fullLabel = mobileTactical
      ? `${sixPrefix}TGT 1 · ${primaryNumbers}`
      : `${sixPrefix}TARGET 1 · ${primaryNumbers}`;
    ctx.font = `${mobileTactical ? "800 10px" : "600 9px"} ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    const labelText = this.fitText(fullLabel, Math.max(60, locatorRight - locatorLeft - 12));
    const labelWidth = ctx.measureText(labelText).width;
    const labelX = clamp(x - (dx / length) * 34, locatorLeft + labelWidth * 0.5 + 5, locatorRight - labelWidth * 0.5 - 5);
    const labelHeight = mobileTactical ? 17 : 14;
    // This locator label is centred on labelY and carries its own backing plate, so it cannot go
    // through placeContactLabel unchanged — but it must still share the same per-frame registry,
    // or an off-screen contact's label lands on top of an on-screen contact's. That is exactly
    // what happened at phone width: TARGET 1's locator printed through TARGET 2's data line.
    const labelY = this.reserveContactLabelRow(
      clamp(y - (dy / length) * 30, locatorTop + 8, locatorBottom - 8),
      labelX - labelWidth * 0.5 - 4,
      labelX + labelWidth * 0.5 + 4,
      labelHeight,
      { centred: true },
    );
    ctx.fillStyle = "rgba(1, 8, 12, 0.68)";
    ctx.fillRect(labelX - labelWidth * 0.5 - 4,
      labelY - labelHeight * 0.5, labelWidth + 8, labelHeight);
    ctx.fillStyle = locatorAmber ? AMBER : GREEN;
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

    // A finite carrier-day route owns the heading caret before generic fuel/home steering. The
    // presenter has already fail-closed contradictory phase/fix geometry, so the HUD never repairs
    // or reinterprets route state locally.
    const carrierRoute = carrierSortieRoutePresentation(state);
    const carrierRouteActive = state?.carrier_sortie_route_active === true;
    const routeTurn = carrierRoute?.turnDeg;
    if (headingValid && Number.isFinite(routeTurn)) {
      const shownTurn = clamp(routeTurn, -48, 48);
      const routeX = this.width / 2 + shownTurn * pixelsPerDegree;
      const routeAccent = carrierRoute.rtbActionRequired ? AMBER : GREEN;
      ctx.fillStyle = routeAccent;
      ctx.strokeStyle = routeAccent;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(routeX - 6, y - 21);
      ctx.lineTo(routeX, y - 15);
      ctx.lineTo(routeX + 6, y - 21);
      ctx.stroke();
      ctx.font = "800 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      const routeLabel = Math.abs(routeTurn) > 48
        ? (routeTurn < 0 ? "◀ RTE" : "RTE ▶") : "RTE";
      ctx.fillText(routeLabel, routeX, y - 28);
      if (this._debug) {
        this._debug.carrierRouteCaret = {
          drawn: true,
          source: "carrier-route",
          turnDeg: routeTurn,
          x: routeX,
          phase: carrierRoute.phaseToken,
          fix: carrierRoute.fixToken,
        };
      }
    }

    // At bingo the boat caret stays on the visible edge of the tape until the pilot turns it in.
    // This is guidance only: no flight-control command is fed back into the kernel.
    const boatTurn = finiteHudNumber(state.rtb_turn_deg);
    if (!carrierRouteActive && headingValid
        && state.rtb_steer === true && Number.isFinite(boatTurn)) {
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
      if (this._debug) {
        this._debug.boatRtbCaret = {
          drawn: true,
          source: "home-rtb",
          turnDeg: boatTurn,
          x: boatX,
        };
      }
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
      const width = Math.min(330, this.width - 34);
      const height = CombatHud.ANNUNCIATION_ROW;
      const cueX = (this.width - width) / 2;
      // TOP of the screen, not a quarter of the way down it. These banners were landing squarely
      // over the gunsight and the aircraft the pilot had just shot — "these banners don't need to
      // be in the middle of the screen", and they especially do not need to be there during the
      // kill cam, which exists precisely so the pilot can watch that aircraft come apart. The top
      // band is free: the multiplayer badge holds the left corner and GUN TEMP the right.
      const cueY = this.annunciationTop();
      this.glassPanel(cueX, cueY, width, height, GREEN);
      ctx.fillStyle = GREEN;
      ctx.shadowColor = "rgba(77, 255, 136, 0.62)";
      ctx.shadowBlur = 12;
      ctx.font = "800 15px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("SPLASH", cueX + 12, cueY + height / 2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = GREEN_DIM;
      ctx.textAlign = "right";
      ctx.font = "700 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      const replacementPending = state.opponent_replacement_pending === true;
      const replacementSeconds = Math.max(0,
        Number(state.opponent_replacement_s) || 0);
      const nextEngagement = Math.max(2,
        Math.floor(Number(state.engagement_number) || Math.max(1, kills)) + 1);
      const detail = replacementPending
        ? `BANDIT ${nextEngagement} IN ${replacementSeconds.toFixed(1)} SEC · KILLS ${kills}`
        : `IMPACT PHYSICS RUNNING · KILLS ${kills}`;
      ctx.fillText(detail, cueX + width - 12, cueY + height / 2);
    }
    ctx.restore();
  }

  drawRtbCue(state) {
    if (state.rtb !== true) return;
    // Continuous recovery guidance already carries destination, energy and next-path intent.
    // Drawing the generic RTB card as well consumes the only safe compact-HUD lane.
    if (state?.approach_guidance_active === true && state?.approach_valid === true) return;
    // An active route owns the guidance channel even if its payload is malformed. Falling back to
    // Home/BINGO here would turn rejected carrier geometry into apparently valid steering.
    if (state?.carrier_sortie_route_active === true) return;
    if (["TERMINAL", "ARRESTED", "STOPPED", "CATAPULT", "BARRIER"]
      .includes(hudMode(state))) return;

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
    if (this._debug) {
      this._debug.rtbCue = {
        drawn: true,
        source: "home-rtb",
        headline,
        detail,
        x,
        y,
        width,
        height,
      };
    }
    ctx.restore();
  }

  drawApproachEnergyCue(state) {
    const cue = approachEnergyCue(state);
    if (!cue) {
      if (this._debug) this._debug.approachEnergyCue = null;
      return;
    }
    const ctx = this.ctx;
    const line = formatApproachEnergyLine(cue);
    const width = Math.min(this.touchMode ? 300 : 380, this.width - 34);
    const height = 28;
    const x = (this.width - width) / 2;
    const y = approachEnergyPanelY(this.getLayout(), height);
    if (y === null) {
      if (this._debug) this._debug.approachEnergyCue = {
        drawn: false,
        reason: "no-safe-lane",
      };
      return;
    }

    ctx.save();
    this.glassPanel(x, y, width, height, "rgba(242, 217, 160, 0.85)");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(242, 217, 160, 0.95)";
    ctx.font = "750 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText(line, this.width / 2, y + height / 2);
    if (this._debug) {
      this._debug.approachEnergyCue = {
        drawn: true,
        label: cue.label,
        targetAltM: cue.targetAltM,
        targetTasMps: cue.targetTasMps,
        altErrorM: cue.altErrorM,
        tasErrorMps: cue.tasErrorMps,
        line,
      };
    }
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
      this._modeCue = mode === "FREE"
        ? (state?.rapier_pattern_only === true ? "CIRCUITS" : "FIGHT")
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
    if (!recoveryPlatformAvailable(state)) return;
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
    if (!isApproachMode(state)) {
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

  drawPortraitFlightState(state, display = {}) {
    const ctx = this.ctx;
    const speed = Number.isFinite(display.indicatedDigits)
      ? Math.round(display.indicatedDigits) : Math.round(Number(state.ias_kts) || 0);
    const altitude = Number.isFinite(display.altitudeDigits)
      ? Math.round(display.altitudeDigits) : Math.round(Number(state.alt_ft) || 0);
    const bias = Number(state.assisted_speed_bias_kts) || 0;
    const auto = state.assisted_flight === true
      ? (bias === 0 ? "AUTO CORNER" : `AUTO COR${bias > 0 ? "+" : ""}${bias}`)
      : "MANUAL";
    const top = this.safeInsets.top + 18;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const text = `${speed} KT · ${auto} · ${altitude} FT`;
    const width = Math.min(this.width - 32, ctx.measureText(text).width + 22);
    ctx.fillStyle = "rgba(2, 10, 16, 0.68)";
    roundedRect(ctx, (this.width - width) / 2, top - 10, width, 20, 5);
    ctx.fill();
    ctx.fillStyle = state.assisted_flight === true ? AMBER : GREEN;
    ctx.fillText(text, this.width / 2, top);
    ctx.restore();
  }

  drawMobileTacticalState(frame, display = {}) {
    const state = frame.state;
    const fightActive = isFightHudActive(state);
    const targetNumber = targetDataLineOwner(state) === "wingman" ? 2 : 1;
    const condensed = this.width < 360;
    const tactical = mobileTacticalReadout(state, display, {
      fightActive,
      targetNumber,
      tallyRangeM: BANDIT_TALLY_RANGE_M,
      condensed,
    });
    const guidance = rapierGuidancePresentation(state);
    const carrierRoute = carrierSortieRoutePresentation(state);
    const cycle = rapierCycleTeachPresentation(state);
    let directiveText = carrierRoute
      ? `${carrierRoute.guidanceDirective}`
        + `${carrierRoute.rtbActionRequired ? " · TAP RTB" : ""}`
      : guidance?.text ?? "";
    let directiveLevel = carrierRoute?.rtbActionRequired === true
      ? "active" : guidance?.level ?? "manual";

    // Outbound Rapier automation has two distinct truths: what the aircraft is doing now and the
    // command it is chasing. The desktop tapes/limits used to carry the latter; the mobile rail
    // must not reduce that to the unexplained "PILOT · CLIMB · FL560" seen in the field capture.
    const phase = Math.floor(Number(state.rapier_mission_phase) || 0);
    const targetMach = finiteHudNumber(state.rapier_target_mach);
    const targetAltitudeFt = finiteHudNumber(state.rapier_target_altitude_ft);
    const patternOnly = state.rapier_pattern_only === true;
    if (guidance && !patternOnly && phase >= 1 && phase < 10
        && (targetMach !== null || targetAltitudeFt !== null)) {
      const tokens = guidance.text.split(" · ");
      const command = [];
      if (targetMach !== null && targetMach > 0)
        command.push(`M${targetMach.toFixed(2)}`);
      if (targetAltitudeFt !== null && targetAltitudeFt > 0) {
        command.push(targetAltitudeFt >= 18_000
          ? `FL${String(Math.round(targetAltitudeFt / 100)).padStart(3, "0")}`
          : `${Math.round(targetAltitudeFt)} FT`);
      }
      directiveText = `${tokens.slice(0, 2).join(" · ")}`
        + `${command.length ? ` · CMD ${command.join(" · ")}` : ""}`;
    }
    // Normal cycle/skin chatter stays out of a phone fight. A qualified thermal condition
    // displaces the ordinary directive in the same bounded row instead of opening another card.
    if (cycle?.thermalLevel === "caution" || cycle?.thermalLevel === "fault") {
      directiveText = cycle.skinText;
      directiveLevel = cycle.thermalLevel === "fault" ? "attack" : "active";
    }
    if (condensed) directiveText = directiveText.replaceAll(" · ", "·");

    const rows = [
      { key: "actual", text: tactical.actualText, color: GREEN },
    ];
    if (tactical.contextText) {
      rows.push({
        key: "context",
        text: tactical.contextText,
        color: tactical.weapon.level === "warning" ? RED
          : tactical.weapon.level === "caution" ? AMBER
            : GREEN_DIM,
      });
    }
    if (directiveText) {
      rows.push({
        key: "directive",
        text: directiveText,
        color: directiveLevel === "attack" ? RED
          : directiveLevel === "active" ? AMBER : GREEN_DIM,
      });
    }

    const ctx = this.ctx;
    const largeText = document.documentElement.classList.contains("large-interface-text");
    const fontSize = largeText ? 11 : 10;
    const rowPitch = fontSize + 7;
    const height = 10 + rows.length * rowPitch;
    const phone = this.width < 520;
    const leftReserve = phone ? 70 : 14;
    const availableWidth = Math.max(150,
      this.width - this.safeInsets.left - this.safeInsets.right - leftReserve - 14);
    ctx.save();
    ctx.font = `800 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    const measuredWidth = rows.reduce((maximum, row) =>
      Math.max(maximum, ctx.measureText(row.text).width), 0) + 22;
    const width = Math.min(availableWidth, Math.max(176, measuredWidth));
    const x = phone
      ? this.width - this.safeInsets.right - width - 10
      : (this.width - width) / 2;
    const y = this.safeInsets.top + 7;
    roundedRect(ctx, x, y, width, height, 5);
    ctx.fillStyle = "rgba(1, 8, 13, 0.58)";
    ctx.fill();
    ctx.strokeStyle = "rgba(77, 255, 136, 0.16)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const drawnRows = [];
    rows.forEach((row, index) => {
      ctx.fillStyle = row.color;
      ctx.font = `${row.key === "actual" ? "800" : "750"} ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      const drawnText = this.fitText(row.text, width - 16);
      drawnRows.push({ key: row.key, text: drawnText });
      ctx.fillText(drawnText,
        x + width / 2, y + 8 + index * rowPitch);
    });
    ctx.restore();

    if (this._debug) {
      this._debug.mobileTactical = {
        profile: this.presentationProfile,
        x,
        y,
        width,
        height,
        fontSize,
        condensed,
        actualText: tactical.actualText,
        contextText: tactical.contextText,
        directiveText,
        drawnRows,
        target: tactical.target,
        weapon: tactical.weapon,
      };
    }
  }

  drawGTape(state) {
    const actualG = Number(state.g_actual) || 0;
    const overrideSelected = state.requested_envelope_override === true;
    // ALWAYS VISIBLE. This used to appear only above 3 G, in tier 3, or with the override
    // selected, on declutter grounds. That is the wrong trade for an accelerometer: every
    // aeroplane that can pull G has one permanently in view, and a G meter that appears only once
    // you are already pulling 3 cannot teach you what your hands are doing below 3 -- which is
    // most of a circuit, all of an approach, and the part of a roll where this airframe's inertia
    // coupling is worth watching.
    //
    // It declutters by WEIGHT rather than by disappearing: the backing wash fades toward nothing
    // at 1 G and reaches full strength by 3 G, which is where the old code used to pop it into
    // existence. So the numbers and the needle are always readable, and the furniture around them
    // gets out of the way when you are not manoeuvring.
    const ctx = this.ctx;
    const layout = this.getLayout();
    const x = this.safeInsets.left + 24;
    const y = layout.secondaryBottom - 9;
    const width = Math.min(166, Math.max(112, this.width * 0.18));
    const hardG = Math.max(0, Number(state.g_hardmax) || 0);
    const overrideG = Math.max(hardG, Number(state.g_override_max) || hardG);
    const maxG = Math.max(10, hardG,
      overrideSelected ? overrideG : 0,
      Math.abs(actualG));
    const mapG = (g) => x + clamp((Number(g) || 0) / maxG, 0, 1) * width;
    const tierColor = actualG > hardG + 0.05 ? RED
      : overrideSelected || state.tier === 3 ? AMBER : GREEN;

    // 0 at 1 G, 1 by 3 G. Never below 0.28, so the tape always has enough backing to read
    // against a bright sky rather than vanishing into it.
    const prominence = clamp((Math.abs(actualG) - 1.0) / 2.0, 0, 1);
    const washScale = 0.28 + 0.72 * prominence;
    const wash = ctx.createLinearGradient(x - 6, 0, x + width + 6, 0);
    wash.addColorStop(0, `rgba(1, 9, 14, ${(0.42 * washScale).toFixed(3)})`);
    wash.addColorStop(0.72, `rgba(1, 9, 14, ${(0.20 * washScale).toFixed(3)})`);
    wash.addColorStop(1, "rgba(1, 9, 14, 0)");
    if (this._debug) {
      this._debug.gTape = { x: x - 6, y: y - 27, width: width + 12, height: 50 };
    }
    ctx.fillStyle = wash;
    ctx.fillRect(x - 6, y - 27, width + 12, 50);
    ctx.fillStyle = GREEN_DIM;
    ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(overrideSelected ? "G · OVR" : "G", x, y - 20);
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
      [hardG, "L", RED],
      ...(overrideG > hardG + 0.05 ? [[overrideG, "X", AMBER]] : []),
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
    const gcasReleaseCount = Math.max(0,
      Math.trunc(Number(state.auto_gcas_release_count) || 0));
    if (gcasReleaseCount < this._lastGcasReleaseCount) {
      // Restart/replay rewind: a prior sortie's edge must not leak into the new timeline.
      this._gcasBottomLine = null;
      this._gcasBottomLineUntil = -Infinity;
    } else if (gcasReleaseCount > this._lastGcasReleaseCount) {
      const bottomFt = Number(state.gcas_last_flyup_bottom_ft);
      const completedFlyUps = Math.max(0,
        Math.trunc(Number(state.gcas_flyup_count) || 0));
      if (state.gcas_last_flyup_bottom_ft !== null
        && Number.isFinite(bottomFt) && completedFlyUps > 0) {
        const roundedBottomFt = Math.round(bottomFt);
        const marginFt = Math.round(bottomFt - 100);
        this._gcasBottomLine = `GCAS BOTTOM ${roundedBottomFt} FT · `
          + `${marginFt >= 0 ? "+" : ""}${marginFt} VS 100 FT MSD`;
        this._gcasBottomLineUntil = now + 7;
      }
    }
    this._lastGcasReleaseCount = gcasReleaseCount;
    const gcasBottomLineVisible = this._gcasBottomLine !== null
      && now < this._gcasBottomLineUntil;
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
    } else if (gcasBottomLineVisible) {
      // Post-save evidence is a status, not another warning: quiet dim amber, no glow.
      ctx.fillStyle = "rgba(255, 176, 32, 0.55)";
      ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(this._gcasBottomLine, this.width / 2, warningY);
      occupiedLines += 1;
      if (this._debug) this._debug.warningLine = this._gcasBottomLine;
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
    const mobileTactical = this.usesMobileTacticalProfile();
    const titleSize = mobileTactical
      ? title.length > 32 ? 9 : title.length > 24 ? 10 : 12
      : title.length > 32 ? 12 : title.length > 24 ? 15 : 18;
    ctx.font = `800 ${titleSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    const w = mobileTactical
      ? Math.min(270, this.width - 34, Math.max(124, ctx.measureText(title).width + 28))
      : Math.min(360, this.width - 34);
    const h = mobileTactical ? 27 : CombatHud.ANNUNCIATION_ROW;
    const x = (this.width - w) / 2;
    // Stacks UNDER the splash banner when both are up, which they routinely are: a kill raises
    // SPLASH and the promotion that follows raises WINGMAN ENGAGED a beat later.
    const splashUp = state.splash_cue === true && state.finished !== true;
    const y = this.annunciationTop() + (splashUp ? CombatHud.ANNUNCIATION_ROW + 4 : 0);
    this.glassPanel(x, y, w, h, accent);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = accent;
    ctx.shadowColor = trapped ? "rgba(77, 255, 136, 0.50)" : "transparent";
    ctx.shadowBlur = trapped ? 9 : 0;
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
    // Outboard of the speed tape. On a phone the tape sits close to the edge, so the desktop
    // offset would push the rail off-screen entirely — clamp it into the safe area instead. The
    // pilot commands thrust with a rocker or the left stick and had NO readout of it anywhere on
    // the phone; the strip rows are full (adding a token there ellipsized them and blocked two
    // deploys), so power belongs here, as an instrument, not as more text.
    // 13 px of clearance, not 2: the PWR caption is centred on the rail, so a rail hard against
    // the edge clips its own label.
    const x = Math.max(
      (this.safeInsets?.left ?? 0) + 13, layout.tapeInset - 46);
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

    // Two-sided commanded-power bug from the per-airframe sortie schedule. The pilot's whole
    // energy task is to put the lever caret on this: no "PULL POWER" caption and no number to read.
    // GoldenPath's legacy power solve is deliberately not a fallback here: it can never exceed 0.5
    // by construction, so presenting it as a full throttle command would make low/slow look trim.
    const sortieValid = state?.sortie_valid === true;
    const commandedPower = sortiePowerCommand(state);
    if (commandedPower !== null) {
      const by = yOf(clamp(commandedPower, 0, 1));
      ctx.save();
      ctx.strokeStyle = "rgba(242, 217, 160, 0.72)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x - 7, by);
      ctx.lineTo(x - 1, by - 4);
      ctx.lineTo(x - 1, by + 4);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = GREEN_DIM;
    ctx.font = "750 7px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Name the leg above the rail rather than anywhere else on the glass: the pilot's question
    // "what am I supposed to be doing" and their question "where should this lever be" have the
    // same answer, so they belong in the same glance.
    ctx.fillText(sortieValid && typeof state?.sortie_leg === "string"
      ? String(state.sortie_leg).toUpperCase() : "PWR", x + railWidth / 2, y - 9);

    // On a straight deck the wave-off is not a reflex, it is a decision with a price: the engine
    // has to be given time to answer. Count that time down, and turn it amber when it is gone,
    // because past it the only remaining outcome is the barrier.
    const waveOff = Number(state?.sortie_waveoff_s);
    if (sortieValid && state?.sortie_leg === "Groove" && Number.isFinite(waveOff)) {
      ctx.font = "800 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillStyle = waveOff > 0.05 ? GREEN : AMBER;
      ctx.fillText(waveOff > 0.05 ? `WVOFF ${waveOff.toFixed(1)}` : "COMMITTED",
        x + railWidth / 2, y - 19);
    }

    if (hasAfterburner && eng > 1.005) {
      ctx.font = "800 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillStyle = AMBER;
      ctx.fillText("A/B", x + railWidth / 2, y + h + 10);
    }

    // Idle-commanded speed brake. It belongs to the PWR rail because the LEVER commands it —
    // pulling to idle with the gear up is the pilot action — and because drawThrottle is the one
    // secondary block drawn unconditionally from drawFrame. It STACKS BELOW the rail rather than
    // flanking it: x is layout.tapeInset - 46, and tapeInset floors at 48, so at a 430-wide
    // portrait viewport x is 2 and there is no room to the left; the throttle caret owns
    // x + railWidth + 1 .. + 8 at the very lever position (idle) where the brake deploys, so
    // there is no room to the right either. AMBER while it travels, GREEN once fully splayed,
    // nothing at all when stowed.
    const brake = speedBrakeReadout(state);
    const brakeWidth = 16;
    // Five rows, not three: at three the 1 px stroke left a single interior row to carry the whole
    // travel fraction, so the pilot could read amber-versus-green but not how far out the surface
    // actually was — and travel is the thing that proves the automation ran.
    const brakeHeight = 5;
    const brakeX = x;
    const brakeY = y + h + 17;
    // The airdata chip panel starts one pixel inside the rail's left column at every viewport, so
    // the bar is pulled one column left of it rather than sharing that seam.
    const brakeFillWidth = Math.max(0, (brakeWidth - 2) * brake.deployment);
    let brakeDrawn = false;
    if (brake.visible) {
      ctx.save();
      const brakeColor = brake.deployed ? GREEN : AMBER;
      ctx.strokeStyle = brakeColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(brakeX + 0.5, brakeY + 0.5, brakeWidth - 1, brakeHeight - 1);
      ctx.fillStyle = brakeColor;
      ctx.fillRect(brakeX + 1, brakeY + 1, brakeFillWidth, brakeHeight - 2);
      ctx.font = "800 7px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(brake.text, brakeX, brakeY + brakeHeight + 8);
      ctx.restore();
      brakeDrawn = true;
    }
    if (this._debug) {
      this._debug.speedBrake = {
        available: brake.available,
        visible: brake.visible,
        deployment: brake.deployment,
        deployed: brake.deployed,
        transit: brake.transit,
        text: brake.text,
        // `drawn` is set INSIDE the canvas branch on purpose. Everything else here is the
        // readout's opinion, which a geometry assertion can satisfy while the drawing code is
        // deleted — that exact mutation passed all 904 assertions during review.
        drawn: brakeDrawn,
        fillWidth: brakeDrawn ? brakeFillWidth : 0,
        color: brakeDrawn ? (brake.deployed ? GREEN : AMBER) : null,
        x: brakeX,
        y: brakeY,
        width: brakeWidth,
        height: brakeHeight,
      };
    }
  }

  drawLimitsPanel(state) {
    const phaseHud = hudPhasePresentation(state);
    if (phaseHud.mission !== "other" && !phaseHud.surfaces.limitsFuel) {
      this._limitsPanelRect = null;
      if (this._debug) this._debug.limitsPanel = null;
      return;
    }
    const panel = limitsPanelPresentation(state);
    if (!panel) {
      this._limitsPanelRect = null;
      if (this._debug) this._debug.limitsPanel = null;
      return;
    }
    const accent = panel.accent === "fault" ? RED
      : panel.accent === "caution" ? AMBER : GREEN;
    const ctx = this.ctx;
    const layout = this.getLayout();
    const phase = Math.floor(Number(state.rapier_mission_phase) || 0);
    const compact = state.rapier_mission_available === true
      && state.rapier_pattern_only !== true
      && panel.accent === "normal"
      && phase >= 1
      && phase < 11;
    const rows = compact && panel.rows.length > 1
      ? [panel.rows[0], panel.rows[panel.heroIndex]]
      : panel.rows;
    const heroIndex = compact ? rows.length - 1 : panel.heroIndex;
    const width = Math.min(168,
      this.width - this.safeInsets.left - this.safeInsets.right - 36);
    const rowPitch = 13;
    const height = 10 + rows.length * rowPitch + 8;
    const x = this.width - this.safeInsets.right - width - 18;
    // Keep clear of the persistent H · CONTROLS chip in the same corner.
    const legendReserve = (!this.legendVisible && !this.touchMode) ? 28 : 0;
    const y = layout.secondaryBottom - height - legendReserve;
    this._limitsPanelRect = { x, y, width, height };

    if (this._debug) {
      this._debug.limitsPanel = {
        profile: panel.profile,
        accent: panel.accent,
        compact,
        heroIndex,
        rows: rows.map((entry) => ({
          label: entry.label,
          value: entry.value,
          unit: entry.unit,
        })),
        x,
        y,
        width,
        height,
        reserveMin: panel.reserveMin ?? null,
        etaMinutes: panel.etaMinutes ?? null,
      };
    }

    ctx.save();
    roundedRect(ctx, x, y, width, height, 4);
    ctx.fillStyle = "rgba(1, 9, 14, 0.42)";
    ctx.fill();
    ctx.strokeStyle = panel.accent === "normal"
      ? "rgba(77, 255, 136, 0.20)" : accent;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textBaseline = "middle";
    for (let i = 0; i < rows.length; i += 1) {
      const entry = rows[i];
      const rowY = y + 10 + i * rowPitch;
      const hero = i === heroIndex;
      ctx.fillStyle = hero ? accent : (panel.accent === "normal" ? GREEN_DIM : accent);
      ctx.font = hero
        ? "800 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
        : "700 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "left";
      ctx.fillText(entry.label, x + 8, rowY);
      ctx.textAlign = "right";
      const valueText = entry.unit ? `${entry.value} ${entry.unit}` : entry.value;
      ctx.fillText(valueText, x + width - 8, rowY);
    }

    const barX = x + 8;
    const barY = y + height - 6;
    const barWidth = width - 16;
    ctx.fillStyle = "rgba(77, 255, 136, 0.12)";
    ctx.fillRect(barX, barY, barWidth, 2);
    ctx.fillStyle = accent;
    ctx.fillRect(barX, barY, barWidth * clamp(panel.fuelRatio ?? 0, 0, 1), 2);
    if ((panel.bingoRatio ?? 0) > 0) {
      const bingoX = barX + barWidth * clamp(panel.bingoRatio, 0, 1);
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bingoX, barY - 2);
      ctx.lineTo(bingoX, barY + 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawRapierHighMachInstruments(panel) {
    if (!panel?.visible) return;
    const rows = Array.isArray(panel.rows) ? panel.rows : [];
    if (rows.length === 0 && !panel.cue?.text) return;
    const ctx = this.ctx;
    const width = Math.min(254,
      this.width - this.safeInsets.left - this.safeInsets.right - 36);
    const cueHeight = panel.cue?.text ? 15 : 0;
    const height = 12 + cueHeight + rows.length * 14;
    const x = this.safeInsets.left + 18;
    const legendReserve = (!this.legendVisible && !this.touchMode) ? 28 : 0;
    const y = this.getLayout().secondaryBottom - 36 - 8 - height - legendReserve;
    const levelColor = (level) => level === "danger" ? RED
      : level === "caution" ? AMBER : GREEN;

    if (this._debug) {
      this._debug.rapierHighMachInstruments = {
        x,
        y,
        width,
        height,
        cue: panel.cue?.text ?? "",
        rows: rows.map((row) => ({ ...row })),
      };
    }

    ctx.save();
    roundedRect(ctx, x, y, width, height, 4);
    ctx.fillStyle = "rgba(1, 9, 14, 0.54)";
    ctx.fill();
    ctx.strokeStyle = levelColor(panel.level);
    ctx.globalAlpha = panel.level === "normal" ? 0.28 : 0.82;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    let rowY = y + 9;
    if (panel.cue?.text) {
      ctx.font = "800 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillStyle = levelColor(panel.cue.level);
      ctx.fillText(panel.cue.text, x + 8, rowY, width - 16);
      rowY += cueHeight;
    }
    ctx.font = "700 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    for (const row of rows) {
      ctx.fillStyle = levelColor(row.level);
      ctx.fillText(row.text, x + 8, rowY, width - 16);
      rowY += 14;
    }
    ctx.restore();
  }

  /// Compact high-Mach causal glass for production Rapier, with the legacy one-line cycle cue
  /// retained outside its climb/dash/reentry phases.
  drawRapierCycleTeach(state) {
    // Circuits is overhead-pattern school — no Intercept TBCC / skin teach panel.
    if (state?.rapier_pattern_only === true) return;
    const highMach = advanceRapierHighMachInstruments(
      this._rapierHighMachHistory,
      state,
    );
    this._rapierHighMachHistory = highMach.history;
    if (highMach.presentation) {
      this.drawRapierHighMachInstruments(highMach.presentation);
      return;
    }
    const teach = rapierCycleTeachPresentation(state);
    if (!teach) return;
    const ctx = this.ctx;
    const width = Math.min(214,
      this.width - this.safeInsets.left - this.safeInsets.right - 36);
    // One quiet line while thermals are normal; the full lesson card only when the thermal
    // state is actually talking (owner verdict 2026-07-29: the always-on card was UX noise).
    const expanded = teach.thermalLevel !== "normal";
    const height = expanded ? 72 : 20;
    const x = this.safeInsets.left + 18;
    const legendReserve = (!this.legendVisible && !this.touchMode) ? 28 : 0;
    // The G-tape wash begins 36 px above secondaryBottom. Keep an explicit gap instead of sharing
    // those pixels, which is what drew the green G rail through the old 88 px lesson card.
    const y = this.getLayout().secondaryBottom - 36 - 8 - height - legendReserve;
    const thermalAccent = teach.thermalLevel === "fault" ? RED
      : teach.thermalLevel === "caution" ? AMBER : GREEN;
    const modeAccent = teach.overDynamicPressure || teach.mode === "RAM LOCKED" ? RED
      : teach.mode === "HANDOVER" ? AMBER
      : teach.mode === "TURBINE" ? GREEN : AMBER;

    if (this._debug) {
      this._debug.rapierCycleTeach = {
        mode: teach.mode,
        skinText: teach.skinText,
        explainer: teach.explainer,
        mach: teach.mach,
        turbineLbf: teach.turbineLbf,
        ramLbf: teach.ramLbf,
        x,
        y,
        width,
        height,
      };
    }

    ctx.save();
    roundedRect(ctx, x, y, width, height, 4);
    ctx.fillStyle = "rgba(1, 9, 14, 0.48)";
    ctx.fill();
    ctx.strokeStyle = teach.overDynamicPressure ? RED
      : teach.thermalLevel === "normal" ? "rgba(77, 255, 136, 0.22)" : thermalAccent;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    if (!expanded) {
      const skinLabel = teach.dynamicPressureText
        ? ` · ${teach.dynamicPressureText}`
        : Number.isFinite(teach.skinC) ? ` · SKIN ${Math.round(teach.skinC)}°C` : "";
      ctx.font = "800 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillStyle = modeAccent;
      ctx.fillText(`CYCLE ${teach.mode} · M${teach.mach.toFixed(2)}${skinLabel}`,
        x + 8, y + 10);
      ctx.restore();
      return;
    }
    ctx.font = "800 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillStyle = modeAccent;
    ctx.fillText(`CYCLE ${teach.mode} · M${teach.mach.toFixed(2)}`, x + 8, y + 11);

    ctx.font = "800 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillStyle = thermalAccent;
    ctx.fillText(teach.skinText, x + 8, y + 26);

    // Schema 1.19 renamed the freestream recovery channel to recoveryC; the old wallC key
    // read undefined here and printed "ADIABATIC WALL NaN°C" on every teach card.
    if (Number.isFinite(teach.recoveryC)) {
      ctx.font = "600 7px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillStyle = GREEN_DIM;
      ctx.fillText(`ADIABATIC WALL ${Math.round(teach.recoveryC)}°C`, x + 8, y + 39);
    }

    const barX = x + 8;
    const barWidth = width - 16;
    const drawShare = (label, share, lbf, rowY, color) => {
      ctx.fillStyle = GREEN_FAINT;
      ctx.fillRect(barX, rowY, barWidth, 5);
      ctx.fillStyle = color;
      ctx.fillRect(barX, rowY, barWidth * clamp(share, 0, 1), 5);
      ctx.font = "700 7px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillStyle = color;
      ctx.textAlign = "left";
      ctx.fillText(label, barX, rowY - 5);
      ctx.textAlign = "right";
      ctx.fillText(`${Math.round(lbf).toLocaleString("en-US")} LBF`,
        barX + barWidth, rowY - 5);
    };
    drawShare("TURBINE/AB", teach.turbineShare, teach.turbineLbf, y + 53, GREEN);
    drawShare("RAMJET", teach.ramShare, teach.ramLbf, y + 67, AMBER);
    ctx.restore();
  }

  drawSystemsPanel(systems, state = null) {
    if (!systems?.available || !systems.relevant) return;
    // Rapier Intercept: gear/systems chrome only in recovery — warnings still annunciate.
    const phaseHud = hudPhasePresentation(state ?? {});
    if (phaseHud.mission === "rapier_intercept" && !phaseHud.surfaces.systemsGear) return;
    if (phaseHud.mission === "rapier_circuits"
      && !phaseHud.surfaces.systemsGear
      && systems.warnings.length === 0) return;
    const ctx = this.ctx;
    const circuitVerifyDue = phaseHud.mission === "rapier_circuits"
      && phaseHud.surfaces.systemsGear;
    const circuitLandingLeg = circuitVerifyDue
      && ["DOWNWIND", "BASE", "SHORT_FINAL", "WIRE_FINAL"].includes(phaseHud.circuitLeg);
    const compactVerify = circuitVerifyDue && systems.warnings.length === 0;
    const warning = systems.warnings.some((item) => item.level === "warning");
    const caution = systems.warnings.length > 0 || circuitVerifyDue;
    const accent = warning ? RED : caution ? AMBER : GREEN;
    const width = this.touchMode ? 184 : 228;
    const height = compactVerify ? 48 : this.touchMode ? 62 : 72;
    const x = this.width - this.safeInsets.right - width - 18;
    const fuelY = this.getLayout().secondaryBottom - 42;
    const lowerPanelTop = this._limitsPanelRect?.y ?? fuelY;
    const y = Math.max(this.safeInsets.top + 24, lowerPanelTop - height - 8);
    if (this._debug) {
      this._debug.systemsPanel = { x, y, width, height };
    }
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
    ctx.fillText(circuitVerifyDue
      ? `GEAR ${circuitLandingLeg ? "↓" : "↑"} REQD`
      : `GEAR ${gearArrow}`, x + 9, y + 13);

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
    ctx.fillText(circuitVerifyDue
      ? `${systems.flapLabel ?? "FLAP"} ${circuitLandingLeg ? "DN" : "UP"} REQD`
      : `${systems.flapLabel ?? "FLAP"} ${flapLever}`, x + 9, y + 34);
    ctx.textAlign = "right";
    ctx.fillText(systems.flapPositionText, x + width - 9, y + 34);

    if (compactVerify) {
      ctx.restore();
      return;
    }

    const rpm = systems.engineRpmPct === null ? "RPM --"
      : `RPM ${Math.round(systems.engineRpmPct)}%`;
    const engineText = systems.propulsionText
      ?? (systems.engineRunning === false ? `${rpm} OUT` : rpm);
    const hydText = systems.utilityHydraulicPressurePsi === null
      ? "HYD --"
      : `HYD ${Math.round(systems.utilityHydraulicPressurePsi)}`;
    const inletText = systems.inletRecovery === null
      ? ""
      : ` · INLET ${Math.round(systems.inletRecovery * 100)}%`;
    const busText = systems.primaryBusPowered === null ? "BUS --"
      : systems.primaryBusPowered ? "BUS ON" : "BUS OFF";
    ctx.font = "700 7px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillStyle = systems.engineRunning === false ? RED : GREEN_DIM;
    ctx.textAlign = "left";
    ctx.fillText(engineText, x + 9, y + height - 10);
    ctx.fillStyle = GREEN_DIM;
    ctx.textAlign = "center";
    ctx.fillText(`${hydText}${inletText}`, x + width * 0.59, y + height - 10);
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
    if (frame.padlockTarget === "carrier"
        && !recoveryPlatformAvailable(frame.state)) {
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

    const patternOnly = frame.state?.rapier_pattern_only === true;
    const isBanditPadlock = frame.padlockTarget !== "carrier";
    const isCombatPadlock = !patternOnly
      && (frame.padlockTarget === "bandit" || frame.padlockTarget === "wingman");
    const padlockTargetPosition = frame.padlockTargetPosition ?? frame.banditPosition;
    const targetLabel = patternOnly
      ? (frame.padlockTarget === "carrier" ? "THRESHOLD"
        : frame.padlockTarget === "wingman" ? "TRAFFIC 2"
        : frame.padlockTarget === "traffic2" ? "TRAFFIC 3"
        : frame.padlockTarget === "traffic3" ? "TRAFFIC 4"
        : "THRESHOLD")
      : frame.padlockTarget === "wingman" ? "TARGET 2"
        : isBanditPadlock ? "TARGET 1"
        : recoveryPlatformIsMaritime(frame.state) ? "BOAT" : "STRIP";
    if (isBanditPadlock) {
      const captureEntityId = String(
        frame.padlockTargetEntityId || frame.state.bandit_entity_id || "legacy",
      );
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
    const modeTitle = isCombatPadlock
      ? `${targetLabel} · SELECTED · PADLOCK`
      : `${targetLabel} PADLOCK`;
    const cameraSettling = isBanditPadlock && this._padlockTrackEstablished
      && phase !== "TRACK" && !frame.manualLookActive;
    const modeStatus = frame.manualLookActive
      ? "RELEASE LOOK TO REACQUIRE"
      : phase === "TRACK" ? `TRACKING · ${exitBinding}`
        : cameraSettling ? `CAMERA SETTLING · ${exitBinding}` : `${phase} TARGET`;
    if (this._debug) {
      this._debug.padlockMode = {
        targetLabel,
        title: modeTitle,
        status: modeStatus,
        target: frame.padlockTarget,
      };
    }
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
    // threshold. Recovery-platform padlock needs this compact SA only when the pilot deliberately
    // looks away.
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
      // Cobra deliberately omits radar_alt_ft (nap-of-earth would arm jet proximity forever).
      // Never fall back to MSL alt_ft — that made GROUND·PULL UP flash on every slight nose-down
      // in the gorge (owner 2026-08-08). Without true radar altitude, padlock groundDanger is off.
      const radarAltFt = Number(state.radar_alt_ft);
      const sinkFpm = Number(state.vertical_speed_fpm);
      const noseLow = pitchDeg < -5
        || (Number.isFinite(sinkFpm) && sinkFpm < -1800);
      const groundDanger = Number.isFinite(radarAltFt) && radarAltFt < 2000 && noseLow;
      const centralPullUp = state.auto_gcas_active === true
        || state.auto_gcas_warning === true
        || (state.auto_gcas_available !== true
          && Number.isFinite(radarAltFt)
          && Number.isFinite(sinkFpm)
          && radarAltFt < 500 && sinkFpm < -1000);

      // Where is the bandit in this view. In padlock the sensor is slaved to it, so it usually sits
      // near centre (offset toward the nose by the protected-offset geometry); a manual slew can
      // push it off-screen or behind, so we always resolve a screen direction to point at it.
      const banditProj = this.project(
        padlockTargetPosition, padlockCamera, this._funnelTargetProj,
      );
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
        this.relative.copy(padlockTargetPosition).sub(frame.playerPosition)
          .transformDirection(padlockCamera.matrixWorldInverse);
        const planeMagnitude = Math.hypot(this.relative.x, this.relative.y);
        if (planeMagnitude > 0.02) {
          banditDirX = this.relative.x / planeMagnitude;
          banditDirY = -this.relative.y / planeMagnitude;
          banditDirValid = true;
        }
      }

      const statusDirective = (text, accent) => {
        if (this._debug) this._debug.padlockDirective = text;
        padlockCtx.save();
        padlockCtx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        const directiveWidth = Math.min(right - left,
          Math.max(94, padlockCtx.measureText(text).width + 24));
        const directiveY = Math.max(top + 2, this.annunciationBottom(frame.state));
        this.glassPanel(centreX - directiveWidth / 2, directiveY,
          directiveWidth, 24, accent);
        padlockCtx.fillStyle = accent;
        padlockCtx.textAlign = "center";
        padlockCtx.textBaseline = "middle";
        padlockCtx.fillText(this.fitText(text, directiveWidth - 14),
          centreX, directiveY + 12);
        padlockCtx.restore();
      };

      const steeringAvailable = isCombatPadlock && this._padlockTrackEstablished
        && !frame.manualLookActive && !groundDanger && !centralPullUp;
      if (!steeringAvailable) this._padlockLiftCaptured = false;
      if (isBanditPadlock && !this._padlockTrackEstablished && !frame.manualLookActive
          && !groundDanger && !centralPullUp) {
        statusDirective(patternOnly ? "ACQUIRING" : `ACQUIRING ${targetLabel}`, AMBER);
      }

      // === STEERING TRUTH: kernel-first physical roll error; the live drawing is the body-fixed
      // action strip below, never a camera-space inference.
      const targetVectorLength = this.relative.copy(padlockTargetPosition)
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
      const preferredPlaneValid = state.padlock_preferred_plane_valid === true;
      const preferredPlaneDeg = Number(state.padlock_preferred_plane_deg);
      const assistCaptured = state.padlock_roll_assist_captured === true;
      const presentationCaptured = steeringAvailable && Number.isFinite(kernelRollErrorDeg)
        && (Math.abs(kernelRollErrorDeg) <= 11
          || (this._padlockLiftCaptured && Math.abs(kernelRollErrorDeg) <= 18));
      const steering = steeringAvailable && orientation.liftValid
        ? kernelSteeringReported ? {
          valid: state.padlock_roll_assist_selected === true
            && state.padlock_roll_assist_geometry_valid === true
            && Number.isFinite(kernelRollErrorDeg),
          captured: preferredPlaneValid
            ? presentationCaptured
            : (assistCaptured || presentationCaptured),
          anyPlane: state.padlock_roll_assist_any_plane === true,
          rollErrorRad: Number.isFinite(kernelRollErrorDeg)
            ? kernelRollErrorDeg * DEG : null,
        } : padlockLiftPlaneModel({
          targetRight: this.relative.dot(frame.playerRight),
          targetUp: this.relative.dot(frame.playerUp),
          targetForward: this.relative.dot(frame.playerForward),
          wasCaptured: this._padlockLiftCaptured,
        }) : null;
      this._padlockLiftCaptured = steering?.valid
        ? kernelSteeringReported ? presentationCaptured : steering.captured
        : false;
      if (steering?.valid) {
        if (this._debug) {
          this._debug.padlockDirector = {
            rollErrorRad: steering.rollErrorRad,
            captured: steering.captured,
            anyPlane: steering.anyPlane,
            assistActive: state.padlock_roll_assist_active === true,
            preferredPlaneValid,
            preferredPlaneRad: preferredPlaneValid && Number.isFinite(preferredPlaneDeg)
              ? preferredPlaneDeg * DEG : null,
          };
        }
      }

      if (!steering?.valid && steeringAvailable && !groundDanger && !centralPullUp) {
        statusDirective(`${targetLabel} · STEERING UNAVAILABLE`, AMBER);
      }

      // The pitch ladder is suppressed in padlock (a body-fixed ladder lies once the camera is
      // slewed off boresight), which left the pilot with no attitude reference at all at the
      // exact moment they are pulling across the horizon on someone else's tail. The round ADI
      // is that reference: attitude read from the jet, never from the camera. The action strip
      // keeps the steering directive; the dial answers "which way is up".
      this.drawPadlockLocatorInset(frame, {
        centreX, top, bottom, left, right,
        steering, groundDanger, centralPullUp, blink,
        pitchDeg, radarAltFt, sinkFpm,
        targetPosition: padlockTargetPosition,
      });

      // The action strip is deliberately not drawn. It restated as text what the ADI shows as
      // geometry -- "T2 ROLL R 167" over a dial already displaying that roll error on its gate --
      // and its panel sat across the ball's horizon. A command to the pilot belongs in the
      // instrument, not in a banner covering it.

      // === BANDIT LOCATOR: drawBandit owns the single on-screen target box. A temporary manual
      // look already has one complete instruction — RELEASE LOOK TO REACQUIRE — so do not chase
      // that with a second edge arrow and clock cue. The locator only covers genuine servo lag.
      if (this._debug && isBanditPadlock) {
        this._debug.padlockLocator = {
          dirX: banditDirX,
          dirY: banditDirY,
          valid: banditDirValid,
          drawn: !frame.manualLookActive && !banditOnScreen && banditDirValid,
        };
      }
      if (isBanditPadlock && !frame.manualLookActive) {
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

      if (!frame.manualLookActive) {
        // NOSE tick: a small amber caret at the waterline projection (or the view edge if the nose
        // is off-screen), so the pilot keeps a sense of where the jet points relative to padlock.
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

    }
    padlockCtx.restore();

    if (frame.padlockTarget === "carrier") {
      // The pattern map solves recovery geometry while tracking the platform, but it should not
      // cover the world while the pilot is deliberately slewing their head away from it.
      if (!frame.manualLookActive) this.drawCarrierPadlockSa(frame, systems);
      return;
    }
    this._carrierPatternCue.reset();
    // IAS/altitude/G/power/fuel and target range/closure remain in their normal locations. The old
    // duplicate bottom instrument card added eye travel without adding any decision information.
    return;

  }

  // One quiet, body-fixed action cue for padlock. The earlier miniature ADI made the pilot decode
  // a second horizon, a bank scale, an animated roll gate, an aft label, and a text directive at
  // the same time. This strip answers the actual control question directly: roll left/right or
  // pull. Pitch, bank, radar altitude, and aft hemisphere remain as compact cross-checks.
  drawPadlockActionStrip(frame, {
    centreX, top, bottom, left, right,
    steering, groundDanger, centralPullUp,
    pitchDeg, radarAltFt, sinkFpm, targetPosition, targetLabel,
  }) {
    const ctx = this.ctx;
    const state = frame.state;
    const bankDeg = Number(state.bank_deg) || 0;
    const rollErrorRad = steering?.valid === true && Number.isFinite(steering.rollErrorRad)
      ? steering.rollErrorRad : null;
    const urgentPull = groundDanger || centralPullUp;
    const captured = steering?.valid === true
      && (steering.anyPlane === true || steering.captured === true);

    let direction = null;
    let action = null;
    let accent = AMBER;
    let directive = null;
    if (urgentPull) {
      direction = "up";
      action = "PULL UP";
      accent = RED;
    } else if (captured) {
      direction = "up";
      action = "PULL";
      accent = "#7dffb0";
      directive = `${targetLabel} · PULL · BRING NOSE TO TARGET`;
    } else if (rollErrorRad !== null) {
      direction = rollErrorRad >= 0 ? "right" : "left";
      const degrees = Math.max(1, Math.round(Math.abs(rollErrorRad) / DEG));
      action = `ROLL ${direction.toUpperCase()} ${degrees}\u00B0`;
      directive = `${targetLabel} · ${action}`;
    }

    // During acquisition the top status line already owns the job. Do not leave a passive
    // attitude ornament on screen while there is no valid control command.
    if (!action) {
      if (this._debug) this._debug.padlockAction = null;
      return;
    }

    this.relative.copy(targetPosition ?? frame.banditPosition).sub(frame.playerPosition);
    const relLength = this.relative.length();
    let hemisphere = null;
    if (relLength > 1e-6) {
      this.relative.multiplyScalar(1 / relLength);
      const targetForward = this.relative.dot(frame.playerForward);
      const targetRight = this.relative.dot(frame.playerRight);
      if (targetForward < -0.17) {
        hemisphere = Math.abs(targetRight) < 0.05
          ? "AFT" : `AFT ${targetRight >= 0 ? "R" : "L"}`;
      }
    }
    if (frame.shoulderHandoffLatched) hemisphere = "AFT SIDE CHANGED";

    const width = clamp((right - left) * 0.34, 168, 238);
    const height = 58;
    const cx = centreX;
    const cy = clamp(top + (bottom - top) * 0.68, top + 62, bottom - 62);
    const x = cx - width / 2;
    const y = cy - height / 2;

    ctx.save();
    ctx.fillStyle = "rgba(1, 8, 12, 0.7)";
    ctx.strokeStyle = accent;
    ctx.lineWidth = urgentPull ? 1.8 : 1.2;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 5);
    ctx.fill();
    ctx.stroke();

    // One static chevron. It is deliberately not animated: motion here competed with the moving
    // world and made an already time-critical instruction feel like another target locator.
    const arrowX = direction === "left" ? x + 20
      : direction === "right" ? x + width - 20 : cx;
    const arrowY = direction === "up" ? y + 13 : y + 22;
    ctx.save();
    ctx.translate(arrowX, arrowY);
    ctx.rotate(direction === "left" ? Math.PI
      : direction === "up" ? -Math.PI / 2 : 0);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-4, -7);
    ctx.moveTo(8, 0);
    ctx.lineTo(-4, 7);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = accent;
    ctx.font = "900 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const compactTargetLabel = targetLabel.replace(/^TARGET\s+/, "T");
    const compactAction = action
      .replace(/^ROLL RIGHT /, "ROLL R ")
      .replace(/^ROLL LEFT /, "ROLL L ");
    const displayLabel = `${compactTargetLabel} · ${compactAction}`;
    ctx.fillText(this.fitText(displayLabel, width - 44), cx, y + 21);

    // Pitch, bank, radar altitude and vertical trend used to be spelled out here. The ADI draws
    // all four, and a dial is read faster than "P -3 B L98 R 9,675". Only the body-frame
    // hemisphere survives as text, because the dial cannot say which shoulder the target is over.
    if (hemisphere) {
      ctx.fillStyle = urgentPull ? "rgba(255, 220, 224, 0.9)" : GREEN_DIM;
      ctx.font = "750 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillText(this.fitText(hemisphere, width - 16), cx, y + 43);
    }
    ctx.restore();

    if (this._debug) {
      this._debug.padlockDirective = directive ?? `${targetLabel} · ${action}`;
      this._debug.padlockAction = {
        x, y, width, height,
        action,
        direction,
        rollErrorRad,
        captured,
        bankDeg,
        pitchDeg,
        radarAltFt,
        hemisphere,
        displayLabel,
      };
    }
  }

  // The live padlock attitude reference, drawn alongside drawPadlockActionStrip: the strip owns
  // the steering directive, this owns attitude. Restored after it was retired to "geometry
  // archaeology" — with the pitch ladder already suppressed in padlock, retiring it left no
  // attitude reference on screen at all.
  // One body-fixed ownship instrument for padlock: a true ADI (attitude from the jet, never
  // the camera), a fixed waterline, the physical roll gate at the signed body-frame roll error,
  // radar altitude and vertical trend. Chevrons always mean keyboard roll direction; nothing in
  // here is mirrored by camera azimuth or target hemisphere, which is the whole point.
  drawPadlockLocatorInset(frame, {
    centreX, top, bottom, left, right,
    steering, groundDanger, centralPullUp, blink,
    pitchDeg, radarAltFt, sinkFpm, targetPosition,
  }) {
    const ctx = this.ctx;
    const state = frame.state;
    const radius = clamp(Math.min(right - left, bottom - top) * 0.16, 50, 66);
    const cx = centreX;
    const cy = clamp(centreY0(top, bottom), top + radius + 30, bottom - radius - 34);
    function centreY0(topPx, bottomPx) {
      // Low, never centre. An instrument parked over the middle of the screen covers the thing
      // the pilot is actually looking at -- the target and the horizon beyond it -- which is the
      // same mistake the text strip made, just rounder.
      return topPx + (bottomPx - topPx) * 0.78;
    }
    // Reserve the outside of the instrument for steering. The attitude ball and its bank scale
    // remain a self-contained conventional instrument; amber/green director marks cannot be
    // mistaken for the horizon or the aircraft's actual bank.
    const ballRadius = radius - 6;
    const directorRadius = radius + 2;
    const attitude = padlockAttitudeModel({
      pitchDeg,
      bankDeg: Number(state.bank_deg) || 0,
      radius: ballRadius,
    });
    const bankRad = attitude.bankRad;
    // The instrument is now the steering presentation, so it has to be inspectable by the HUD
    // geometry harness the way the retired text strip was.
    if (this._debug) {
      this._debug.padlockAttitude = {
        bankDeg: Number(state.bank_deg) || 0,
        pitchDeg,
        radius: ballRadius,
      };
    }
    const now = Number(frame.now) || 0;
    const rimColor = groundDanger ? RED : GREEN_DIM;

    // Body-frame target hemisphere for the AFT / shoulder language. Independent of the camera:
    // "aft" means behind the WING LINE of the jet, and the shoulder is where the target actually
    // is, so the label survives every sensor slew.
    this.relative.copy(targetPosition ?? frame.banditPosition).sub(frame.playerPosition);
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

    // Conventional attitude ball. A strong sky/earth split is deliberately used here rather than
    // another transparent HUD line: with the pilot's eyes off-boresight, the inset must answer
    // "which way is up?" before any steering interpretation begins.
    ctx.beginPath();
    ctx.arc(cx, cy, ballRadius + 3, 0, Math.PI * 2);
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

    // The ball moves behind a fixed miniature aircraft: right bank raises the horizon's right end;
    // nose-up moves the horizon down. Unlike the old clamped line, the true horizon is allowed to
    // leave the window beyond about 35 degrees, producing honest all-sky/all-earth steep attitudes.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, ballRadius, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-bankRad);
    const horizonOffsetPx = attitude.horizonOffsetPx;
    const fillSpan = ballRadius * 4;
    ctx.fillStyle = "rgba(34, 112, 151, 0.72)";
    ctx.fillRect(-fillSpan, -fillSpan, fillSpan * 2, fillSpan + horizonOffsetPx);
    ctx.fillStyle = groundDanger
      ? "rgba(132, 38, 43, 0.82)" : "rgba(117, 76, 43, 0.78)";
    ctx.fillRect(-fillSpan, horizonOffsetPx, fillSpan * 2, fillSpan * 2);

    // Ten-degree pitch ladder carried by the sphere. The rung matching current pitch crosses the
    // fixed aircraft; negative attitudes use dashed marks, matching the forward HUD vocabulary.
    ctx.font = "700 6px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let rung = -80; rung <= 80; rung += 10) {
      const y = (attitude.pitchDeg - rung) * attitude.pixelsPerDegree;
      if (Math.abs(y) > ballRadius + 5) continue;
      const horizon = rung === 0;
      const halfWidth = horizon ? ballRadius : rung % 20 === 0 ? 18 : 12;
      const centreGap = horizon ? 0 : 5;
      const color = groundDanger && horizon ? RED
        : horizon ? "rgba(236, 255, 241, 0.98)" : "rgba(224, 255, 235, 0.84)";
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = horizon ? 1.8 : 1.0;
      ctx.setLineDash(rung < 0 ? [4, 3] : []);
      ctx.beginPath();
      if (horizon) {
        ctx.moveTo(-halfWidth, y);
        ctx.lineTo(halfWidth, y);
      } else {
        ctx.moveTo(-halfWidth, y);
        ctx.lineTo(-centreGap, y);
        ctx.moveTo(centreGap, y);
        ctx.lineTo(halfWidth, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      if (!horizon && rung % 20 === 0) {
        const label = String(Math.abs(rung));
        ctx.fillText(label, -halfWidth - 6, y);
        ctx.fillText(label, halfWidth + 6, y);
      }
    }
    ctx.setLineDash([]);
    ctx.restore();

    // Fixed bank scale with a moving bank pointer. This is intentionally distinct from the outer
    // lift-plane gate: the pilot can read actual bank without decoding the director.
    ctx.strokeStyle = "rgba(224, 255, 235, 0.82)";
    ctx.fillStyle = "rgba(236, 255, 241, 0.96)";
    ctx.lineWidth = 1;
    for (const bankTickDeg of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const angle = -Math.PI / 2 + bankTickDeg * DEG;
      const major = bankTickDeg === 0 || Math.abs(bankTickDeg) === 30
        || Math.abs(bankTickDeg) === 60;
      const outer = ballRadius - 2;
      const inner = outer - (major ? 6 : 3.5);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();
    }
    const bankPointerAngle = -Math.PI / 2 + bankRad;
    const pointerTipRadius = ballRadius - 9;
    const pointerBaseRadius = ballRadius - 3;
    const pointerHalfAngle = 4 * DEG;
    ctx.beginPath();
    ctx.moveTo(
      cx + Math.cos(bankPointerAngle) * pointerTipRadius,
      cy + Math.sin(bankPointerAngle) * pointerTipRadius,
    );
    ctx.lineTo(
      cx + Math.cos(bankPointerAngle - pointerHalfAngle) * pointerBaseRadius,
      cy + Math.sin(bankPointerAngle - pointerHalfAngle) * pointerBaseRadius,
    );
    ctx.lineTo(
      cx + Math.cos(bankPointerAngle + pointerHalfAngle) * pointerBaseRadius,
      cy + Math.sin(bankPointerAngle + pointerHalfAngle) * pointerBaseRadius,
    );
    ctx.closePath();
    ctx.fill();

    // Reassert the true horizon over the filled ball. At shallow attitudes this is the fastest
    // reference; at steep attitudes the sky/earth field and pitch ladder carry the picture.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, ballRadius, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-bankRad);
    const horizonColor = groundDanger ? RED : "rgba(236, 255, 241, 0.98)";
    ctx.strokeStyle = horizonColor;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-ballRadius, horizonOffsetPx);
    ctx.lineTo(ballRadius, horizonOffsetPx);
    ctx.stroke();
    ctx.restore();

    // Fixed miniature aircraft: bright and backed by a dark under-stroke so it remains the
    // unmistakable stationary reference over either hemisphere.
    ctx.strokeStyle = "rgba(2, 10, 14, 0.88)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - 17, cy);
    ctx.lineTo(cx - 5, cy);
    ctx.moveTo(cx + 5, cy);
    ctx.lineTo(cx + 17, cy);
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(cx, cy - 10);
    ctx.stroke();
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(2, 10, 14, 0.88)";
    ctx.beginPath();
    ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.arc(cx, cy, 1.7, 0, Math.PI * 2);
    ctx.fill();

    // Steering layer.
    const neutral = steering?.valid === true && steering.anyPlane === true;
    const captured = steering?.valid === true && !neutral && steering.captured === true;
    const rollErrorRad = steering?.valid === true && Number.isFinite(steering.rollErrorRad)
      ? steering.rollErrorRad : null;
    const upAngle = -Math.PI / 2;
    let gateAngleFromUpRad = null;

    if (neutral) {
      // Dead six: every plane works. A calm outer ring plus PULL — never an invented roll cue.
      ctx.strokeStyle = "#7dffb0";
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, directorRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#7dffb0";
      ctx.font = "800 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PULL", cx, cy + ballRadius * 0.52);
      gateAngleFromUpRad = 0;
    } else if (steering?.valid === true && rollErrorRad !== null) {
      gateAngleFromUpRad = captured ? 0 : rollErrorRad;
      const gateAngle = upAngle + gateAngleFromUpRad;
      const gateColor = captured ? "#7dffb0" : AMBER;
      const gateRadius = directorRadius;

      // Current lift datum lives on the OUTER director ring. Keeping it off the attitude ball
      // prevents steering symbology from masquerading as actual bank or pitch.
      const liftColor = captured ? "#7dffb0" : GREEN_DIM;
      ctx.strokeStyle = liftColor;
      ctx.fillStyle = liftColor;
      ctx.lineWidth = captured ? 2.8 : 1.8;
      ctx.shadowColor = captured ? "rgba(77, 255, 136, 0.8)" : "transparent";
      ctx.shadowBlur = captured ? 10 : 0;
      ctx.beginPath();
      ctx.moveTo(cx, cy - gateRadius + 7);
      ctx.lineTo(cx, cy - gateRadius - 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - gateRadius - 5);
      ctx.lineTo(cx - 4.5, cy - gateRadius + 3);
      ctx.lineTo(cx + 4.5, cy - gateRadius + 3);
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
        // Animated chevrons stay outside the ball along the shortest arc from the lift datum to
        // the gate; their travel direction IS the keyboard roll direction.
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
        // Captured: the roll task has ended. A short, unmistakable pull director may now enter the
        // ball, but it does not rotate and cannot be confused with the moving attitude sphere.
        ctx.fillStyle = "#7dffb0";
        ctx.font = "800 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("PULL", cx, cy + ballRadius * 0.52);
        const phase = (now * 0.7) % 1;
        for (let index = 0; index < 3; index += 1) {
          const fraction = ((index / 3) + phase) % 1;
          const y = cy - 13 - fraction * (ballRadius * 0.48);
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
    // Compact digital cross-checks flank the ball; they verify, rather than substitute for, the
    // now fully readable attitude picture.
    ctx.textAlign = "left";
    ctx.fillText(`P ${pitchDeg >= 0 ? "+" : ""}${Math.round(pitchDeg)}\u00B0`,
      cx + radius + 8, cy);
    const bankDeg = Number(state.bank_deg) || 0;
    ctx.textAlign = "right";
    ctx.fillText(
      Math.abs(bankDeg) < 0.5
        ? "B 0\u00B0"
        : `B ${bankDeg > 0 ? "R" : "L"}${Math.round(Math.abs(bankDeg))}\u00B0`,
      cx - radius - 8,
      cy,
    );

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
        bankDeg,
        pitchDeg: attitude.pitchDeg,
        ballRadius,
        bankPointerAngleRad: bankPointerAngle,
        horizonOffsetPx: attitude.horizonOffsetPx,
        aftLabel,
      };
    }
  }

  drawCarrierPadlockSa(frame, systems = null) {
    const state = frame.state;
    const maritime = recoveryPlatformIsMaritime(state);
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
    ctx.fillText(maritime ? "DECK UP" : "STRIP UP", mapLeft + 5, mapTop + 7);
    ctx.fillText("INITIAL", clamp(initial.x + 4, mapLeft + 3, mapRight - 38),
      clamp(initial.y, mapTop + 6, mapBottom - 6));
    ctx.fillText("180", clamp(downwind180.x - 17, mapLeft + 3, mapRight - 18),
      clamp(downwind180.y, mapTop + 6, mapBottom - 6));
    ctx.fillText("FINAL", clamp(finalTurn.x + 4, mapLeft + 3, mapRight - 31),
      clamp(finalTurn.y - 6, mapTop + 6, mapBottom - 6));
    if (maritime) {
      ctx.fillStyle = AMBER;
      const wodText = `WOD ${Math.round(Number(state.wod_kts) || 0)}`;
      ctx.fillText(wodText, clamp(deckCentre.x + 18, mapLeft + 3, mapRight - 42),
        clamp(deckCentre.y + 3, mapTop + 6, mapBottom - 6));
    }

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
    const distanceText = `${distanceM === null ? "---" : (distanceM / 1852).toFixed(1)} NM`;
    const headingText = maritime
      ? `BRC ${String(Math.round(brc)).padStart(3, "0")}° · FNL ${String(Math.round(finalCourse)).padStart(3, "0")}°`
      : `FINAL COURSE ${String(Math.round(finalCourse)).padStart(3, "0")}°`;
    drawFit(`${maritime ? "BOAT" : "STRIP"} ${distanceText} · ${headingText}`, 3, GREEN_DIM);
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
    if (!recoveryPlatformAvailable(state)
        || (mode !== "APPROACH" && mode !== "WAVE-OFF")) {
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

  // A quiet persistent chip teaching that the legend exists — the single highest-value control
  // fact a new player can learn. It used to retire itself the first time H was pressed, on the
  // theory that the lesson had landed; in practice the binding is exactly the one a pilot forgets
  // between sessions, and a dim 20 px chip is cheap. It stays.
  drawLegendHint() {
    if (this.showLegendHint !== true || this.legendVisible || this.touchMode) return;
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

  drawTimeCompression(frame) {
    const presentation = timeCompressionHudPresentation(frame.state);
    if (!presentation) return;
    const ctx = this.ctx;
    const accent = presentation.level === "active" ? AMBER : GREEN_DIM;
    ctx.save();
    ctx.font = "800 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const width = ctx.measureText(presentation.text).width + 22;
    const x = (this.width - width) / 2;
    const y = this.height - this.safeInsets.bottom - (this.touchMode ? 146 : 65);
    this.glassPanel(x, y, width, 23, accent);
    ctx.fillStyle = accent;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(presentation.text, this.width / 2, y + 11.5);
    ctx.restore();
  }

  drawCarrierSortieGuidance(frame, { showModeLine = true } = {}) {
    const route = carrierSortieRoutePresentation(frame.state);
    if (!route || !showModeLine) return;
    const guidanceText = route.guidanceDirective;
    const promptText = route.keyboardPrompt;
    const lines = promptText ? [guidanceText, promptText] : [guidanceText];
    const accent = route.rtbActionRequired ? AMBER : GREEN_DIM;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = "800 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const width = Math.min(
      this.width - this.safeInsets.left - this.safeInsets.right - 24,
      Math.max(...lines.map((line) => ctx.measureText(line).width)) + 24,
    );
    const height = promptText ? 36 : 22;
    const x = (this.width - width) / 2;
    const occupied = this.annunciationBottom(frame.state);
    const y = Math.max(this.getLayout().heading.bottom + 8, occupied + 2);
    this.glassPanel(x, y, width, height, accent);
    ctx.fillStyle = accent;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      this.fitText(guidanceText, width - 18),
      this.width / 2,
      y + (promptText ? 10 : 11),
    );
    if (promptText) {
      ctx.fillText(this.fitText(promptText, width - 18), this.width / 2, y + 26);
    }
    if (this._debug) {
      this._debug.carrierSortieRoute = {
        text: lines.join(" | "),
        guidanceDirective: route.guidanceDirective,
        keyboardPrompt: route.keyboardPrompt,
        source: "carrier-route",
        phase: route.phaseToken,
        fix: route.fixToken,
        rtbActionRequired: route.rtbActionRequired,
        x,
        y,
        width,
        height,
      };
    }
    ctx.restore();
  }

  drawRapierGuidance(frame, { showModeLine = true } = {}) {
    const presentation = rapierGuidancePresentation(frame.state);
    if (!presentation) return;
    const ctx = this.ctx;
    const accent = presentation.level === "attack"
      ? RED : presentation.level === "active" ? AMBER : GREEN_DIM;
    ctx.save();
    const gate = Math.max(0,
      Math.floor(Number(frame.state.rapier_recovery_gate) || 0));
    // THRESHOLD SQUARE. A fixed marker on the touchdown point itself, drawn whenever the mission
    // is heading home, so there is always something to aim at that is the RUNWAY rather than the
    // next intermediate gate. The gate squares move; this one does not, which is what makes it
    // usable as the thing you padlock with V and fly toward.
    const missionPhase = Math.floor(Number(frame.state.rapier_mission_phase) || 0);
    if (missionPhase >= 11
        && Number.isFinite(frame.state.tx)
        && Number.isFinite(frame.state.ty)
        && Number.isFinite(frame.state.tz)) {
      this.worldPoint.set(frame.state.tx, frame.state.ty, -frame.state.tz);
      const threshold = this.project(this.worldPoint, frame.camera, this.projectionA);
      if (!threshold.behind) {
        const r = 26;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(threshold.x, threshold.y - r);
        ctx.lineTo(threshold.x + r, threshold.y);
        ctx.lineTo(threshold.x, threshold.y + r);
        ctx.lineTo(threshold.x - r, threshold.y);
        ctx.closePath();
        ctx.stroke();
        ctx.font = "600 11px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = accent;
        ctx.fillText("THRESHOLD", threshold.x, threshold.y + r + 14);
      }
    }

    // Geometry only — no GATE essay over the sight. Gate index lives on the quiet mode line.
    // Circuits / Mesh recovery: project a real sky square (world metres) so the box grows as you
    // close and reads as an energy/config gate, not fixed-pixel HUD chrome.
    {
      const gateInfo = recoveryGatePresentation(frame.state);
      // `rapier_guidance_*` is also the outbound mission waypoint. In CLIMB that waypoint is the
      // BVR contact, so the old unconditional fallback drew a giant recovery box around a jet
      // 158 NM away while the target layer correctly refused to claim visual tally. Only an
      // authored Circuit/Mesh gate—or an old recovery recording already on gate 1+—may use it.
      const legacyRecoveryGate = !gateInfo && missionPhase >= 11 && gate > 0;
      const gateX = gateInfo?.worldX
        ?? (gateInfo || legacyRecoveryGate ? frame.state.rapier_guidance_x : null);
      const gateY = gateInfo?.worldY
        ?? (gateInfo || legacyRecoveryGate ? frame.state.rapier_guidance_y : null);
      const gateZ = gateInfo?.worldZ
        ?? (gateInfo || legacyRecoveryGate ? frame.state.rapier_guidance_z : null);
      if (Number.isFinite(gateX)
        && Number.isFinite(gateY)
        && Number.isFinite(gateZ)) {
      this.worldPoint.set(gateX, gateY, -gateZ);
      const halfM = gateInfo?.halfM ?? 0;
      const projectedGate = this.project(this.worldPoint, frame.camera, this.projectionA);
      if (!projectedGate.behind) {
        if (this._debug) {
          this._debug.recoveryGate = {
            drawn: true,
            phase: missionPhase,
            gate,
            source: gateInfo ? "procedure" : "legacy-recovery",
            x: projectedGate.x,
            y: projectedGate.y,
            halfM,
          };
        }
        let stroke = AMBER;
        if (gateInfo?.accent === "open") stroke = GREEN;
        else if (gateInfo?.accent === "fault") stroke = RED;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = gateInfo?.inVolume ? 3.5 : 2.5;
        ctx.shadowColor = gateInfo?.accent === "open"
          ? "rgba(77, 255, 136, 0.55)"
          : "rgba(255, 176, 32, 0.55)";
        ctx.shadowBlur = 8;

        if (halfM > 0 && gateInfo) {
          // Square in a plane facing the gate flight direction (kernel face, Z flip for three.js).
          let fx = gateInfo.faceX;
          let fy = gateInfo.faceY;
          let fz = -gateInfo.faceZ;
          let fLen = Math.hypot(fx, fy, fz);
          if (fLen < 1e-6) {
            fx = 0; fy = 0; fz = 1; fLen = 1;
          }
          fx /= fLen; fy /= fLen; fz /= fLen;
          // Right = worldUp × face; up = face × right — keeps the window upright.
          let rx = -fz; let ry = 0; let rz = fx;
          let rLen = Math.hypot(rx, ry, rz);
          if (rLen < 1e-6) { rx = 1; ry = 0; rz = 0; rLen = 1; }
          rx /= rLen; ry /= rLen; rz /= rLen;
          let ux = fy * rz - fz * ry;
          let uy = fz * rx - fx * rz;
          let uz = fx * ry - fy * rx;
          const uLen = Math.hypot(ux, uy, uz) || 1;
          ux /= uLen; uy /= uLen; uz /= uLen;
          const cx = this.worldPoint.x;
          const cy = this.worldPoint.y;
          const cz = this.worldPoint.z;
          const corners = [
            [cx + halfM * (-rx - ux), cy + halfM * (-ry - uy), cz + halfM * (-rz - uz)],
            [cx + halfM * (rx - ux), cy + halfM * (ry - uy), cz + halfM * (rz - uz)],
            [cx + halfM * (rx + ux), cy + halfM * (ry + uy), cz + halfM * (rz + uz)],
            [cx + halfM * (-rx + ux), cy + halfM * (-ry + uy), cz + halfM * (-rz + uz)],
          ];
          const screen = [];
          let anyBehind = false;
          for (let i = 0; i < 4; i += 1) {
            this.worldPoint.set(corners[i][0], corners[i][1], corners[i][2]);
            const p = this.project(this.worldPoint, frame.camera, this.projectionB);
            if (p.behind) anyBehind = true;
            screen.push({ x: p.x, y: p.y, behind: p.behind });
          }
          if (!anyBehind) {
            ctx.beginPath();
            ctx.moveTo(screen[0].x, screen[0].y);
            for (let i = 1; i < 4; i += 1) ctx.lineTo(screen[i].x, screen[i].y);
            ctx.closePath();
            ctx.stroke();
            // Corner ticks reinforce "window in the sky".
            const tick = 0.22;
            for (let i = 0; i < 4; i += 1) {
              const a = screen[i];
              const b = screen[(i + 1) % 4];
              const d = screen[(i + 3) % 4];
              ctx.beginPath();
              ctx.moveTo(a.x + (b.x - a.x) * tick, a.y + (b.y - a.y) * tick);
              ctx.lineTo(a.x, a.y);
              ctx.lineTo(a.x + (d.x - a.x) * tick, a.y + (d.y - a.y) * tick);
              ctx.stroke();
            }
          } else {
            // Fallback: screen-space square if the plane clips.
            const half = Math.max(28, Math.min(120, 90000 / Math.max(80, -projectedGate.cameraZ)));
            const x0 = projectedGate.x - half;
            const x1 = projectedGate.x + half;
            const y0 = projectedGate.y - half;
            const y1 = projectedGate.y + half;
            const corner = Math.max(10, half * 0.28);
            ctx.beginPath();
            ctx.moveTo(x0 + corner, y0); ctx.lineTo(x0, y0); ctx.lineTo(x0, y0 + corner);
            ctx.moveTo(x1 - corner, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + corner);
            ctx.moveTo(x0, y1 - corner); ctx.lineTo(x0, y1); ctx.lineTo(x0 + corner, y1);
            ctx.moveTo(x1, y1 - corner); ctx.lineTo(x1, y1); ctx.lineTo(x1 - corner, y1);
            ctx.stroke();
          }
          this.worldPoint.set(gateX, gateY, -gateZ);
          const labelAt = this.project(this.worldPoint, frame.camera, this.projectionA);
          ctx.shadowBlur = 0;
          ctx.font = "700 11px ui-monospace, monospace";
          ctx.fillStyle = stroke;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          const label = gateInfo.boxLabel || presentation.boxLabel;
          if (label) ctx.fillText(label, labelAt.x, labelAt.y + 18);
          if (gateInfo.configLine) {
            ctx.font = "600 9px ui-monospace, monospace";
            ctx.fillStyle = gateInfo.configOk ? GREEN_DIM : stroke;
            ctx.fillText(gateInfo.configLine, labelAt.x, labelAt.y + 32);
          }
        } else {
          const half = [88, 76, 64, 54, 44][Math.min(4, gate)];
          const x0 = projectedGate.x - half;
          const x1 = projectedGate.x + half;
          const y0 = projectedGate.y - half;
          const y1 = projectedGate.y + half;
          const corner = Math.max(13, half * 0.34);
          ctx.beginPath();
          ctx.moveTo(x0 + corner, y0); ctx.lineTo(x0, y0); ctx.lineTo(x0, y0 + corner);
          ctx.moveTo(x1 - corner, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + corner);
          ctx.moveTo(x0, y1 - corner); ctx.lineTo(x0, y1); ctx.lineTo(x0 + corner, y1);
          ctx.moveTo(x1, y1 - corner); ctx.lineTo(x1, y1); ctx.lineTo(x1 - corner, y1);
          ctx.stroke();
          ctx.shadowBlur = 0;
          if (presentation.boxLabel) {
            ctx.font = "700 11px ui-monospace, monospace";
            ctx.fillStyle = AMBER;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText(presentation.boxLabel, projectedGate.x, y1 + 8);
          }
        }
        ctx.shadowBlur = 0;
      }
      }
    }

    const fd = rapierFlightDirectorPresentation(frame.state);
    // Intercept v1: no center FD essays/carets. Circuits keeps the director.
    if (fd?.centerFdCommands) {
      const cx = this.width * 0.5;
      const cy = this.height * 0.52;
      const bankClamp = Math.max(-35, Math.min(35, fd.bankErrorDeg));
      const pitchClamp = Math.max(-25, Math.min(25, fd.altErrorFt / 80));
      ctx.strokeStyle = GREEN;
      ctx.fillStyle = GREEN;
      ctx.lineWidth = 2;
      // Bank caret — moves laterally with director bank error.
      ctx.beginPath();
      ctx.moveTo(cx + bankClamp * 2.2, cy - 52);
      ctx.lineTo(cx + bankClamp * 2.2 - 7, cy - 40);
      ctx.lineTo(cx + bankClamp * 2.2 + 7, cy - 40);
      ctx.closePath();
      ctx.stroke();
      // Pitch caret — moves vertically with altitude error to target.
      ctx.beginPath();
      ctx.moveTo(cx + 58, cy - pitchClamp);
      ctx.lineTo(cx + 46, cy - pitchClamp - 7);
      ctx.lineTo(cx + 46, cy - pitchClamp + 7);
      ctx.closePath();
      ctx.stroke();
      if (fd.speedCall) {
        ctx.font = "700 10px ui-monospace, monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const speedText = `${fd.speedCall} · ${Math.round(fd.targetKtas)} KT`;
        ctx.fillText(speedText, cx + 64, cy - pitchClamp);
      }
      if (fd.altitudeCall) {
        const danger = fd.altitudeSeverity === "danger";
        const caution = danger || fd.altitudeSeverity === "caution";
        const blink = Math.floor((Number(frame.now) || 0) * 4) % 2 === 0;
        ctx.font = `${danger ? "900 14px" : "800 11px"} ui-monospace, monospace`;
        ctx.textBaseline = "middle";
        if (danger) {
          const warningWidth = Math.min(
            this.width - 32,
            ctx.measureText(fd.altitudeCall).width + 30,
          );
          const warningX = cx - warningWidth / 2;
          const warningY = cy - 112;
          ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
          ctx.fillRect(warningX, warningY, warningWidth, 32);
          ctx.strokeStyle = blink ? "#ffffff" : RED;
          ctx.lineWidth = blink ? 3 : 2;
          ctx.strokeRect(warningX + 0.5, warningY + 0.5, warningWidth - 1, 31);
          ctx.fillStyle = blink ? "#ffffff" : RED;
          ctx.textAlign = "center";
          ctx.fillText(fd.altitudeCall, cx, warningY + 16);
        } else {
          ctx.fillStyle = caution ? AMBER : GREEN;
          ctx.textAlign = "left";
          ctx.fillText(fd.altitudeCall, cx + 64, cy - pitchClamp - 15);
        }
      }
    }

    if (!showModeLine) {
      ctx.restore();
      return;
    }

    // Quiet mode line — one short row under the heading tape. Engine bars and triad essays are gone.
    ctx.font = "800 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const width = Math.min(
      this.width - this.safeInsets.left - this.safeInsets.right - 24,
      ctx.measureText(presentation.text).width + 24,
    );
    const x = (this.width - width) / 2;
    const occupied = this.annunciationBottom(frame.state);
    const y = Math.max(this.getLayout().heading.bottom + 8, occupied + 2);
    if (this._debug) {
      this._debug.rapierModeLine = {
        text: presentation.text,
        detail: presentation.detail ?? "",
        level: presentation.level,
        x,
        y,
        width,
        height: 22,
        gate,
        phase: missionPhase,
      };
    }
    this.glassPanel(x, y, width, 22, accent);
    ctx.fillStyle = accent;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.fitText(presentation.text, width - 18),
      this.width / 2, y + 11);
    ctx.restore();
  }

  /// Row pitch for deconflicted contact labels. Matches the 9px label font's line box.
  static get CONTACT_LABEL_ROW() { return 12; }

  /// Every contact data line is placed through here. Each label is anchored to its OWN contact's
  /// bracket, so nothing stopped two contacts that project close together from printing their
  /// lines on top of each other, and nothing stopped a label beside a contact near the edge from
  /// printing straight through the speed or altitude tape. Both were visible on the same mobile
  /// frame (2026-08-02) once BOTH bandits started carrying range and closure: the layout was
  /// authored when only one contact was ever labelled.
  ///
  /// Clamp into the tape gutters the layout already publishes, then push down a row at a time
  /// until the line clears every label already placed this frame. Placement follows draw order,
  /// so the selected target keeps its natural position beneath its bracket and later contacts are
  /// the ones that move.
  placeContactLabel(text, x, y) {
    const ctx = this.ctx;
    const half = ctx.measureText(text).width / 2;
    const layout = this.getLayout();
    // Clamp against the TAPES, not targetSafe. targetSafe falls back to the plain safe-area inset
    // in the compact-mobile profile, so on a phone it does not exclude the tapes at all — which is
    // exactly where a contact label was seen printing through the altitude tape.
    const gutterLeft = layout.tapeInset + layout.tapeHalfWidth + 6;
    const gutterRight = this.width - layout.tapeInset - layout.tapeHalfWidth - 6;
    // A label wider than the gutter cannot satisfy both edges; keep the left edge visible rather
    // than centring it and losing both ends.
    const clampedX = Math.min(
      Math.max(x, gutterLeft + half),
      Math.max(gutterLeft + half, gutterRight - half),
    );
    const placedY = this.reserveContactLabelRow(
      y, clampedX - half, clampedX + half, CombatHud.CONTACT_LABEL_ROW);
    ctx.fillText(text, clampedX, placedY);
  }

  /// Claim a row in this frame's contact-label registry and return the y to draw at. Shared by the
  /// top-baseline data lines and the vertically-centred locator plate, which must deconflict
  /// against each other and not merely within their own kind.
  reserveContactLabelRow(y, left, right, height, { centred = false } = {}) {
    const topOf = (value) => (centred ? value - height / 2 : value);
    let placedY = y;
    // Bounded. A label that cannot find clear air within four rows is in a crowded corner, and
    // walking it further only strands it further from the bracket it belongs to.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const top = topOf(placedY);
      const collides = this._contactLabelSlots.some((slot) =>
        top < slot.bottom && top + height > slot.top
        && left < slot.right && right > slot.left);
      if (!collides) break;
      placedY += height;
    }
    const top = topOf(placedY);
    this._contactLabelSlots.push({ left, right, top, bottom: top + height });
    return placedY;
  }

  /// Top of the annunciation stack. Banners used to land a quarter of the way down the screen —
  /// squarely over the gunsight and over the aircraft the pilot had just shot, which is the one
  /// thing the kill cam exists to show them. They now sit in the band between the bottom of the
  /// heading tape and the top of the target/padlock region, both of which the layout publishes, so
  /// this cannot drift when the tape moves for touch mode or a short viewport.
  annunciationTop() {
    return this.getLayout().heading.bottom + 6;
  }

  /// Row pitch for stacked annunciations. Both banners are deliberately SHORT: the free band is
  /// about 67 px on a desktop viewport and two cues are routinely up together, because a kill
  /// raises SPLASH and the promotion that follows raises WINGMAN ENGAGED a beat later.
  static get ANNUNCIATION_ROW() { return 34; }

  /// Where the annunciation stack ends for this frame. Persistent status — the padlock directive —
  /// gets out of the way of transient banners rather than being overprinted by them: a cue the
  /// pilot cannot read is worse than a cue that has moved.
  annunciationBottom(state) {
    const splash = state?.splash_cue === true && state?.finished !== true;
    const title = (typeof state?.transition_cue === "string" && state.transition_cue)
      || (typeof state?.configuration_cue === "string" && state.configuration_cue);
    const rows = (splash ? 1 : 0) + (title ? 1 : 0);
    if (!rows) return 0;
    return this.annunciationTop()
      + rows * CombatHud.ANNUNCIATION_ROW + (rows - 1) * 4 + 6;
  }

  drawLegend(frame) {
    if (!this.legendVisible || this.touchMode || document.documentElement.classList.contains("touch-mode")) return;
    const ctx = this.ctx;
    const panelWidth = Math.min(930, this.width - 34);
    const compact = this.width < 760;
    const gcasAvailable = frame.state.auto_gcas_available === true;
    const panelHeight = compact ? (gcasAvailable ? 256 : 229) : (gcasAvailable ? 222 : 191);
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
      `${binding("gearToggle", "KeyG")}  GEAR   ·   ${binding("flapUp", "BracketLeft")} / ${binding("flapDown", "BracketRight")}  FLAPS UP / DOWN (RELEASE TO HOLD)   ·   ${binding("fire", "KeyF")}  GUNS   ·   ${binding("padlock", "KeyV")}  PADLOCK ON / OFF   ·   TAB  NEXT CONTACT   ·   DRAG LOOK`,
      `${binding("limitOverride", "Space")}  LIMIT OVERRIDE (HIGH-Q G / LOW-Q AOA · REFUSES AUTO-GCAS — CAN DEPART)   ·   R  RESTART   ·   M  SOUND   ·   \`  SYNC MARK   ·   H  HIDE`,
      "T  TIME COMPRESSION ON / OFF",
      "P  RAPIER MISSION AUTOMATION   ·   Z  SHORT-RANGE MISSILE",
    ];
    const compactLines = [
      `${binding("pull", "ArrowDown")} / ${binding("push", "ArrowUp")}  PULL / PUSH   ·   ${binding("rollLeft", "ArrowLeft")} / ${binding("rollRight", "ArrowRight")}  ROLL`,
      `${binding("rudderLeft", "KeyA")} / ${binding("rudderRight", "KeyD")}  RUDDER   ·   ${binding("powerUp", "KeyW")} / ${binding("powerDown", "KeyS")}  THROTTLE`,
      `${binding("gearToggle", "KeyG")}  GEAR   ·   ${binding("flapUp", "BracketLeft")} / ${binding("flapDown", "BracketRight")}  FLAPS UP / DOWN (RELEASE = HOLD)`,
      `${binding("limitOverride", "Space")}  LIMIT OVR (HIGH-Q G / LOW-Q AOA — CAN DEPART)   ·   ${binding("fire", "KeyF")}  GUNS   ·   M  SOUND`,
      `${binding("padlock", "KeyV")}  PADLOCK   ·   TAB  NEXT CONTACT   ·   R  RESTART   ·   \`  SYNC MARK   ·   H  HIDE`,
      "T  TIME COMPRESSION ON / OFF",
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
    // Contact-label collision avoidance is per-frame; stale rectangles would push this frame's
    // labels down for no reason.
    this._contactLabelSlots = [];
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
        gunCrossPx: null,
        ladderRungs: [],
        funnel: null,
        banditPx: null,
        gunHeat: null,
        gunOverheatAnnunciation: null,
        presentationProfile: this.presentationProfile,
        mobileTactical: null,
        desktopFlightChrome: false,
        limitsPanel: null,
        systemsPanel: null,
        carrierRouteCaret: null,
        carrierSortieRoute: null,
        boatRtbCaret: null,
        rtbCue: null,
        rapierCycleTeach: null,
        rapierModeLine: null,
        recoveryGate: null,
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
    const mobileTactical = this.usesMobileTacticalProfile();

    if (!frame.padlock) {
      this.drawPitchLadder(
        frame.state,
        frame.camera,
        noseAnchor,
        mobileTactical,
        frame.ladderReference,
      );
    }
    // Camera-referenced ladder (Cobra): horizon stays conformal through the eye. Waterline
    // shares that camera horizon when ladderReference is camera (owner: W must match camera).
    // Helicopter snapshots gate cruise FPV / hover stub.
    const heli = frame.state?.heli_flight_path === true;
    const heliMode = heli ? String(frame.state.heli_fpv_mode || "cruise") : "cruise";
    let symbolFpv = fpvAnchor;
    let hoverStub = null;
    let accelCaretPx = 0;
    if (heli) {
      const speedMps = Math.hypot(
        Number(frame.state.vx) || 0,
        Number(frame.state.vy) || 0,
        Number(frame.state.vz) || 0,
      );
      const accel = updateGroundspeedAccelEma(
        this._heliAccelEmaKtPerSec,
        this._heliAccelSpeedMps,
        speedMps,
        frame.dt,
      );
      this._heliAccelEmaKtPerSec = accel.emaKtPerSec;
      this._heliAccelSpeedMps = accel.speedMps;
      accelCaretPx = cobraAccelCaretPx(accel.emaKtPerSec);
      if (heliMode === "hover") {
        symbolFpv = null;
        hoverStub = cobraHoverStubPixels(
          frame.state.heli_hover_east_kt,
          frame.state.heli_hover_north_kt,
        );
      }
    }
    const cameraWaterline = frame.ladderReference === "camera"
      ? cameraReferencedAirframeAnchors(
        frame.camera, this.width, this.height, frame.state,
      )?.waterline
      : null;
    const symbolAnchor = cameraWaterline ?? noseAnchor;
    if (this._debug) {
      this._debug.waterlinePx = symbolAnchor && !symbolAnchor.behind
        ? { x: symbolAnchor.x, y: symbolAnchor.y } : null;
      if (symbolFpv && !symbolFpv.behind) {
        this._debug.fpvPx = { x: symbolFpv.x, y: symbolFpv.y };
      } else if (hoverStub) {
        this._debug.fpvPx = {
          x: symbolAnchor.x + hoverStub.dx,
          y: symbolAnchor.y + hoverStub.dy,
        };
      }
    }
    this.drawAirframeSymbols(symbolAnchor, frame.state, symbolFpv, {
      hoverStub,
      accelCaretPx,
      dt: frame.dt,
    });
    this.drawGunSight(frame, noseAnchor);
    this.drawAimPoint(frame, noseAnchor, directorAnchor);
    this.drawBandit(frame);
    this.drawWingman(frame);
    if (!mobileTactical) {
      this.drawHeadingTape(frame.state, {
        headingDeg: display.headingDeg,
        headingDigits: display.headingDigits,
        padlock: frame.padlock,
      });
    }
    this.drawRtbCue(frame.state);
    this.drawApproachEnergyCue(frame.state);

    // Speed trend: a windowed presentation estimate projected ~6 s ahead. The rate estimator
    // deliberately ignores one-frame IAS reversals so the caret reports energy trend, not noise.
    const spd = display.indicatedKts;
    const speedTrend = clamp(display.indicatedRateKtsPerSecond * 6, -60, 60);

    if (mobileTactical) {
      // Speed and altitude tapes on the phone. The mobile profile replaced them with a line of
      // text -- "M.61 - 339 KCAS - 10K" -- which tells you the numbers but not the one thing a
      // tape is for: which way they are going and how fast. A pilot flies the trend, and on a
      // phone, where the whole sortie is flown with two thumbs and no peripheral instruments,
      // that matters more, not less. The strip stays: it carries Mach, corner and closure, none
      // of which a tape shows.
      //
      // The existing layout already has room. At 390 px wide the tapes sit at x = 48 and
      // x = 342 with a 35 px half-width, leaving the pitch ladder its middle 224 px.
      const mobileTapeInset = this.getLayout().tapeInset;
      this.drawVerticalTape({
        value: spd,
        displayValue: display.indicatedDigits,
        x: mobileTapeInset,
        floor: 0,
        step: 20,
        decimals: 0,
        trend: speedTrend,
        lowSpeed: stallAwareness(frame.state),
        fixedMarkers: speedTapeMarkers(frame.state),
      });
      this.drawVerticalTape({
        value: display.altitudeFt,
        displayValue: display.altitudeDigits,
        x: this.width - mobileTapeInset,
        floor: 0,
        step: frame.state.alt_ft > 10000 ? 1000 : 500,
        decimals: 0,
      });
      // The phone gets the power rail too. It was desktop-only, which left the one control the
      // pilot holds for the entire sortie with no feedback at all.
      this.drawThrottle(frame.state);
      this.drawMobileTacticalState(frame, display);
    } else {
      if (this._debug) this._debug.desktopFlightChrome = true;
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
      this.drawLimitsPanel(frame.state);
      this.drawRapierCycleTeach(frame.state);
    }
    this.drawWarnings(frame, systems);
    if (!carrierPadlock) {
      if (!mobileTactical) this.drawSystemsPanel(systems, frame.state);
      this.drawAoAIndexer(frame.state, frame.dt);
    }
    this.drawPadlockSa(frame, systems, noseAnchor);
    if (!mobileTactical) this.drawSortieStatus(frame);
    this.drawVisualMergeWeaponsCue(frame);
    this.drawFooter(frame);
    if (!mobileTactical) this.drawTimeCompression(frame);
    this.drawCarrierSortieGuidance(frame, { showModeLine: !mobileTactical });
    this.drawRapierGuidance(frame, { showModeLine: !mobileTactical });
    if (!mobileTactical) {
      this.drawLegendHint();
      this.drawLegend(frame);
    }
    this.drawModeCue(frame);
    this.drawOutcomeCues(frame);
    this.drawDamageFeedback(frame);
    this.drawFlightTestSyncMarker(frame);
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
