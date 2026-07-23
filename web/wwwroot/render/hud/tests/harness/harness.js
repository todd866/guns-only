// Deterministic HUD visual-test harness.
//
// Feeds hud.js the SAME frame contract app.js builds every render frame (see FlightView.hudFrame
// and the this.hud.draw(hudFrame) call site in app.js), but from fixed synthetic scenarios instead
// of a live kernel: a real THREE.PerspectiveCamera (66° vfov, matching app.js), body-axis player
// vectors, world bandit/lead points, and the padlock sensor angles derived through the production
// padlock_controller math. now defaults to 0 and dt is a fixed step, so renders are deterministic;
// callers can request another explicit time to inspect animation phases.
//
// This file is a test instrument. It is excluded from publish by the csproj's
// wwwroot/render/**/tests/** rule and must never ship.

import * as THREE from "../../../../vendor/three.module.js";
import { createHud } from "../../../../hud.js";
import {
  desiredPadlockAngles,
  targetLookAngles,
} from "../../../camera/padlock_controller.js";
import { SCENARIOS, buildScenarioState, scenarioByName } from "./scenarios.js";

// Viewport is parameterizable so the same deterministic scenarios render at phone portrait
// sizes too — a layout that only ever renders at desktop landscape is untested for the
// portrait assisted mode ("if I can find a problem in the first 5 seconds we need better
// tests").
const urlParams = new URLSearchParams(globalThis.location?.search ?? "");
const WIDTH = Math.max(320, Number(urlParams.get("w")) || 1300);
const HEIGHT = Math.max(320, Number(urlParams.get("h")) || 900);
const DEG = Math.PI / 180;
const BACKGROUND = "#08192e"; // solid dark blue so the green/amber strokes read on their own
const SETTLE_FRAMES = 6; // lets acquire/attack envelopes (pipper, cues) reach steady state
const FIXED_DT = 1 / 30;

const canvas = document.querySelector("#hud");
const label = document.querySelector("#label");

// Attitude quaternion from heading/pitch/bank using the render-space conventions app.js feeds the
// HUD: +X east, +Y up, -Z north; heading clockwise from north; positive bank drops the right wing.
function playerQuaternion({ headingDeg = 0, pitchDeg = 0, bankDeg = 0 }) {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(pitchDeg * DEG, -headingDeg * DEG, -bankDeg * DEG, "YXZ"),
  );
}

// Body-relative direction (azimuth right positive, elevation up positive) to a world unit vector.
function bodyDirection(quaternion, { azimuthDeg = 0, elevationDeg = 0 }) {
  const azimuth = azimuthDeg * DEG;
  const elevation = elevationDeg * DEG;
  return new THREE.Vector3(
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    -Math.cos(azimuth) * Math.cos(elevation),
  ).applyQuaternion(quaternion);
}

const GRAVITY_MPS2 = 9.80665;
const MUZZLE_OFFSET_M = 4.0;
const EFFECTIVE_TOF_S = 0.9;
const TRAJECTORY_SAMPLES = 9;
const KTS_TO_MPS = 0.514444;

// Sim-frame (X east, Y up, Z north) mirror of GunKill.BallisticFunnelPoint: the world position,
// NOW, of a round fired `age` seconds ago, retrodicted from the current state under the current
// steady rotation. Computed in SIM coordinates (render z negated) so the vector algebra — cross
// products included — matches the kernel exactly; the caller flips z back for render use.
function ballisticFunnelPointSim({ position, velocity, forward, omega }, muzzleVelocityMps, age) {
  const rotate = (v, axis, angle) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return v.clone().multiplyScalar(cos)
      .addScaledVector(new THREE.Vector3().crossVectors(axis, v), sin)
      .addScaledVector(axis, axis.dot(v) * (1 - cos));
  };
  const omegaMagnitude = omega.length();
  let firedForward = forward.clone();
  let firedVelocity = velocity.clone();
  let flownPath = velocity.clone().multiplyScalar(age);
  if (omegaMagnitude > 1e-9) {
    const axis = omega.clone().multiplyScalar(1 / omegaMagnitude);
    const angle = omegaMagnitude * age;
    firedForward = rotate(forward, axis, -angle);
    firedVelocity = rotate(velocity, axis, -angle);
    const axial = axis.clone().multiplyScalar(axis.dot(velocity));
    const planar = velocity.clone().sub(axial);
    const binormal = new THREE.Vector3().crossVectors(axis, velocity);
    flownPath = planar.multiplyScalar(Math.sin(angle) / omegaMagnitude)
      .addScaledVector(binormal, (Math.cos(angle) - 1) / omegaMagnitude)
      .addScaledVector(axial, age);
  }
  return position.clone().sub(flownPath)
    .addScaledVector(firedForward, MUZZLE_OFFSET_M)
    .addScaledVector(firedForward, muzzleVelocityMps * age)
    .addScaledVector(firedVelocity, age)
    .add(new THREE.Vector3(0, -0.5 * GRAVITY_MPS2 * age * age, 0));
}

const toSim = (v) => new THREE.Vector3(v.x, v.y, -v.z);
const toRender = (v) => new THREE.Vector3(v.x, v.y, -v.z);

export function buildFrame(scenario) {
  const state = buildScenarioState(scenario);
  const view = scenario.view ?? {};
  const quaternion = playerQuaternion(scenario.player);
  const playerForward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
  const playerUp = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
  const playerRight = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
  const playerPosition = new THREE.Vector3(0, (scenario.player.altFt ?? 8000) * 0.3048, 0);

  // World velocity: true airspeed along the flight-path direction — body forward rotated down by
  // alpha and laterally by beta. The snapshot carries vx/vy/vz in SIM coordinates (Z north) just
  // like the kernel, so hud.js exercises the same z-flip it performs in production.
  const aoaDeg = Number(state.aoa_deg) || 0;
  const betaDeg = Number(state.beta_deg) || 0;
  const speedMps = (Number(state.true_airspeed_kts) || 450) * KTS_TO_MPS;
  const playerVelocity = bodyDirection(quaternion, {
    azimuthDeg: betaDeg,
    elevationDeg: -aoaDeg,
  }).multiplyScalar(speedMps);
  state.vx = playerVelocity.x;
  state.vy = playerVelocity.y;
  state.vz = -playerVelocity.z;

  // gun_trajectory: the kernel's bullets-in-the-air locus, mirrored here (sim frame) so the
  // deterministic scenarios feed hud.js the same contract SnapshotProjection emits. Body rates
  // follow the kernel's integrator convention: omega_world = right*(-Q) + up*(R) + forward*(-P).
  const shooter = {
    position: toSim(playerPosition),
    velocity: toSim(playerVelocity),
    forward: toSim(playerForward),
    omega: toSim(playerRight).multiplyScalar(-(Number(state.pitch_rate_dps) || 0) * DEG)
      .addScaledVector(toSim(playerUp), (Number(state.yaw_rate_dps) || 0) * DEG)
      .addScaledVector(toSim(playerForward), -(Number(state.roll_rate_dps) || 0) * DEG),
  };
  const muzzleVelocity = Number(state.gun_muzzle_velocity_mps) || 870;
  const horizonSeconds = Math.min(Number(state.gun_max_flight_s) || 1.75, EFFECTIVE_TOF_S);
  state.gun_trajectory = Array.from({ length: TRAJECTORY_SAMPLES }, (_, index) => {
    const age = horizonSeconds * index / (TRAJECTORY_SAMPLES - 1);
    const p = ballisticFunnelPointSim(shooter, muzzleVelocity, age);
    return {
      x: p.x, y: p.y, z: p.z,
      r: p.clone().sub(shooter.position).length(),
    };
  });

  // A valid-solution funnel scenario pins the bandit ON the ballistic locus at its declared
  // range (SHOOT is then geometrically true); otherwise the bandit sits on the declared
  // body-relative bearing.
  let banditPosition;
  if (scenario.bandit.onTrajectory === true) {
    const targetRange = scenario.bandit.rangeM;
    let lo = 0;
    let hi = Number(state.gun_max_flight_s) || 1.75;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      const p = ballisticFunnelPointSim(shooter, muzzleVelocity, mid);
      if (p.clone().sub(shooter.position).length() < targetRange) lo = mid;
      else hi = mid;
    }
    banditPosition = toRender(
      ballisticFunnelPointSim(shooter, muzzleVelocity, (lo + hi) / 2),
    );
  } else {
    banditPosition = playerPosition.clone().addScaledVector(
      bodyDirection(quaternion, scenario.bandit),
      scenario.bandit.rangeM,
    );
  }
  const banditForward = playerPosition.clone().sub(banditPosition).normalize();
  const leadPipper = scenario.lead
    ? playerPosition.clone().addScaledVector(
      bodyDirection(quaternion, scenario.lead),
      scenario.lead.rangeM,
    )
    : banditPosition.clone();

  // Sensor gimbal: lookYawDeg/lookPitchDeg are the deterministic equivalent of app.js's manual
  // drag/two-finger look and feed both the camera and HUD-frame look contract. "auto" is reserved
  // for padlock: it reproduces the controller's protected-offset TRACK solution. That off-axis
  // solution does not change camera focal length; it changes apparent pixel/angle spacing through
  // ordinary gnomonic distortion, so manual-look scenarios must not use it as a focal probe.
  let sensorYaw = 0;
  let sensorPitch = 0;
  const hasManualLook = Number.isFinite(Number(view.lookYawDeg))
    || Number.isFinite(Number(view.lookPitchDeg));
  if (hasManualLook) {
    sensorYaw = (Number(view.lookYawDeg) || 0) * DEG;
    sensorPitch = (Number(view.lookPitchDeg) || 0) * DEG;
  } else if (view.sensor === "auto") {
    const localTarget = banditPosition.clone().sub(playerPosition).normalize()
      .applyQuaternion(quaternion.clone().invert());
    const desired = desiredPadlockAngles(targetLookAngles(localTarget, 0), {
      aspect: WIDTH / HEIGHT,
      verticalFovRad: 66 * DEG,
    });
    sensorYaw = desired.yawRad;
    sensorPitch = desired.pitchRad;
  } else if (view.sensor) {
    sensorYaw = (view.sensor.yawDeg ?? 0) * DEG;
    sensorPitch = (view.sensor.pitchDeg ?? 0) * DEG;
  }

  // Camera exactly as app.js builds it: the compatibility eye point bolted to the body axis, then
  // the sensor gimbal applied in the local frame (negative yaw sign matches app.js).
  const camera = new THREE.PerspectiveCamera(66, WIDTH / HEIGHT, 0.06, 680000);
  camera.position.copy(playerPosition)
    .addScaledVector(playerUp, 0.6)
    .addScaledVector(playerForward, 4.0);
  const yawQuaternion = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), -sensorYaw);
  const pitchQuaternion = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(1, 0, 0), sensorPitch);
  camera.quaternion.copy(quaternion).multiply(yawQuaternion).multiply(pitchQuaternion);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  return {
    state,
    camera,
    playerPosition,
    playerForward,
    playerUp,
    playerRight,
    playerVelocity,
    banditPosition,
    banditForward,
    leadPipper,
    aimPoint: null,
    directorPoint: null,
    flightPathPoint: null,
    sensorYaw,
    sensorPitch,
    lookYaw: hasManualLook ? sensorYaw : 0,
    lookPitch: hasManualLook ? sensorPitch : 0,
    padlock: view.padlock === true,
    padlockTarget: view.padlockTarget ?? "bandit",
    padlockPhase: view.padlockPhase ?? "OFF",
    manualLookActive: view.manualLookActive === true,
    padlockTrackPrimed: view.primeTrack === true,
    periodGunsightVisible: false,
    triggerHeld: scenario.triggerHeld === true,
    dt: FIXED_DT,
    now: 0,
  };
}

let lastRenderedFrame = null;

async function renderScenario(name, now = 0) {
  const scenario = scenarioByName(name);
  if (!scenario) throw new Error(`unknown HUD scenario: ${name}`);
  window.__hudReady = null;

  // A fresh CombatHud per scenario: no qualifier/envelope/latch state can leak between renders.
  const hud = createHud(canvas);
  hud.setAudioEnabled(false);
  hud.resize(WIDTH, HEIGHT, 1);
  const frame = buildFrame(scenario);
  frame.now = Number.isFinite(Number(now)) ? Number(now) : 0;
  if (scenario.view?.primeTrack === true) {
    const requestedPhase = frame.padlockPhase;
    frame.padlockPhase = "TRACK";
    hud.draw(frame);
    frame.padlockPhase = requestedPhase;
  }
  for (let i = 0; i < SETTLE_FRAMES; i += 1) hud.draw(frame);
  lastRenderedFrame = frame;

  if (label) label.textContent = `${name} — ${scenario.about}`;
  window.__hudReady = name;
  return name;
}

// Independent projections for the assertion layer: world points pushed through the frame's REAL
// PerspectiveCamera with THREE's own math, bypassing every hud.js drawing path. assertions.mjs
// compares hud.js's recorded debug geometry against these.
function projectProbe(camera, world) {
  const cameraPoint = world.clone().applyMatrix4(camera.matrixWorldInverse);
  const ndc = world.clone().project(camera);
  return {
    x: (ndc.x * 0.5 + 0.5) * WIDTH,
    y: (-ndc.y * 0.5 + 0.5) * HEIGHT,
    behind: cameraPoint.z >= -0.01,
  };
}

function computeProbes(frame) {
  const camera = frame.camera;
  const m = camera.projectionMatrix.elements;
  const focalXPx = WIDTH * 0.5 * m[0];
  const focalYPx = HEIGHT * 0.5 * m[5];
  const projectionCenter = {
    x: WIDTH * (0.5 - m[8] * 0.5),
    y: HEIGHT * (0.5 + m[9] * 0.5),
  };
  const lookYaw = Number(frame.lookYaw) || 0;
  const lookPitch = Number(frame.lookPitch) || 0;
  const boresightForward = Math.cos(lookYaw) * Math.cos(lookPitch) > 1e-6;
  // Independent closed-form projection of body-forward through app.js's
  // body * yaw(-lookYaw) * pitch(lookPitch) camera orientation.
  const lookBoresight = boresightForward
    ? {
      x: projectionCenter.x - focalXPx * Math.tan(lookYaw) / Math.cos(lookPitch),
      y: projectionCenter.y + focalYPx * Math.tan(lookPitch),
    }
    : null;
  const position = frame.playerPosition;
  const far = (direction) => position.clone().addScaledVector(direction, 10000);
  const velocityDirection = frame.playerVelocity.clone().normalize();
  const targetDirection = frame.banditPosition.clone().sub(frame.playerPosition).normalize();
  const targetRight = targetDirection.dot(frame.playerRight);
  const targetUp = targetDirection.dot(frame.playerUp);
  const targetForward = targetDirection.dot(frame.playerForward);

  // Projected world-up direction near the view axis: two points on a vertical world line ahead
  // of the aircraft. In a gnomonic projection a straight world line is a straight screen line,
  // so this is the exact screen direction of "world up" for the horizon-perpendicular check.
  const horizontalForward = new THREE.Vector3(
    frame.playerForward.x, 0, frame.playerForward.z,
  );
  let worldUpScreen = null;
  let horizonScreen = null;
  if (horizontalForward.lengthSq() > 1e-9) {
    horizontalForward.normalize();
    const base = position.clone().addScaledVector(horizontalForward, 10000);
    const lifted = base.clone().add(new THREE.Vector3(0, 600, 0));
    const a = projectProbe(camera, base);
    const b = projectProbe(camera, lifted);
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    worldUpScreen = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    // Two points on the true horizon (world-horizontal directions straddling the view axis).
    const side = new THREE.Vector3().crossVectors(
      new THREE.Vector3(0, 1, 0), horizontalForward,
    ).normalize();
    const h1 = projectProbe(camera, position.clone()
      .addScaledVector(horizontalForward, 10000).addScaledVector(side, -1500));
    const h2 = projectProbe(camera, position.clone()
      .addScaledVector(horizontalForward, 10000).addScaledVector(side, 1500));
    const horizonLength = Math.hypot(h2.x - h1.x, h2.y - h1.y) || 1;
    horizonScreen = { x: (h2.x - h1.x) / horizonLength, y: (h2.y - h1.y) / horizonLength };
  }

  return {
    focalXPx,
    focalYPx,
    nominalFocalYPx: HEIGHT * 0.5 / Math.tan(66 * DEG * 0.5),
    projectionCenter,
    lookBoresight,
    waterline: projectProbe(camera, far(frame.playerForward)),
    fpv: projectProbe(camera, far(velocityDirection)),
    bandit: projectProbe(camera, frame.banditPosition),
    trajectory: (frame.state.gun_trajectory ?? []).map((sample) => ({
      ...projectProbe(camera, new THREE.Vector3(sample.x, sample.y, -sample.z)),
      rangeM: sample.r,
    })),
    worldUpScreen,
    horizonScreen,
    padlockPlaneMagnitude: Math.hypot(targetRight, targetUp),
    padlockRollErrorRad: Math.hypot(targetRight, targetUp) < 0.035 && targetForward < 0
      ? 0 : Math.atan2(targetRight, targetUp),
    padlockTargetForward: targetForward,
    padlockTargetRight: targetRight,
    // Independent expectation for the off-axis locator: camera-space target direction mapped to
    // screen (+y down). Continuous through the aft hemisphere, unlike a perspective projection.
    banditCameraDir: (() => {
      const rel = new THREE.Vector3().copy(frame.banditPosition)
        .sub(frame.playerPosition)
        .transformDirection(camera.matrixWorldInverse);
      const planeMagnitude = Math.hypot(rel.x, rel.y);
      return planeMagnitude > 0.02
        ? { x: rel.x / planeMagnitude, y: -rel.y / planeMagnitude }
        : null;
    })(),
  };
}

// Assertion-layer entry point: render with the hud.js debug-geometry contract enabled and return
// both sides of the comparison as plain JSON.
window.__debugScenario = async (name) => {
  window.__HUD_DEBUG__ = true;
  try {
    await renderScenario(name);
  } finally {
    window.__HUD_DEBUG__ = false;
  }
  const frame = lastRenderedFrame;
  const scenario = scenarioByName(name);
  return {
    name,
    geometry: window.__HUD_GEOMETRY ?? null,
    probes: computeProbes(frame),
    padlock: frame.padlock === true,
    padlockState: {
      phase: frame.padlockPhase,
      manualLookActive: frame.manualLookActive,
      target: frame.padlockTarget,
      trackPrimed: frame.padlockTrackPrimed,
    },
    look: {
      yawDeg: frame.lookYaw / DEG,
      pitchDeg: frame.lookPitch / DEG,
    },
    state: {
      aoa_deg: frame.state.aoa_deg,
      beta_deg: frame.state.beta_deg,
      pitch_deg: frame.state.pitch_deg,
      bank_deg: frame.state.bank_deg,
      range_m: frame.state.range_m,
      target_wingspan_m: frame.state.target_wingspan_m,
      lead_valid: frame.state.lead_valid,
      gun_solution: frame.state.gun_solution,
      bandit_alive: frame.state.bandit_alive,
      gun_heat: frame.state.gun_heat,
      gun_overheat: frame.state.gun_overheat,
      gun_firing: frame.state.gun_firing,
    },
    triggerHeld: frame.triggerHeld,
    banditOnTrajectory: scenario?.bandit?.onTrajectory === true,
  };
};

// The exact pixels a reviewer should judge: the HUD strokes composited over the solid background
// (the live game shows them over the 3D world). Returned as a PNG data URL so the runner writes
// files without depending on viewport/device-pixel-ratio behavior.
function composedPng() {
  const composed = document.createElement("canvas");
  composed.width = canvas.width;
  composed.height = canvas.height;
  const ctx = composed.getContext("2d");
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, composed.width, composed.height);
  ctx.drawImage(canvas, 0, 0);
  return composed.toDataURL("image/png");
}

// One glanceable contact sheet: every scenario rendered sequentially into a labeled grid.
async function contactSheetPng(columns = 4, scale = 1 / 3) {
  const cellWidth = Math.round(WIDTH * scale);
  const cellHeight = Math.round(HEIGHT * scale);
  const labelHeight = 22;
  const rows = Math.ceil(SCENARIOS.length / columns);
  const sheet = document.createElement("canvas");
  sheet.width = columns * cellWidth;
  sheet.height = rows * (cellHeight + labelHeight);
  const ctx = sheet.getContext("2d");
  ctx.fillStyle = "#02070f";
  ctx.fillRect(0, 0, sheet.width, sheet.height);

  for (let index = 0; index < SCENARIOS.length; index += 1) {
    const scenario = SCENARIOS[index];
    await renderScenario(scenario.name);
    const x = (index % columns) * cellWidth;
    const y = Math.floor(index / columns) * (cellHeight + labelHeight);
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(x, y + labelHeight, cellWidth, cellHeight);
    ctx.drawImage(canvas, x, y + labelHeight, cellWidth, cellHeight);
    ctx.strokeStyle = "rgba(77, 255, 136, 0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + labelHeight + 0.5, cellWidth - 1, cellHeight - 1);
    ctx.fillStyle = "#4dff88";
    ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(scenario.name, x + 6, y + labelHeight / 2);
  }
  return sheet.toDataURL("image/png");
}

window.__scenarioNames = SCENARIOS.map((scenario) => scenario.name);
window.__renderScenario = renderScenario;
window.__composedPng = composedPng;
window.__contactSheetPng = contactSheetPng;
window.__hudReady = null;

const params = new URLSearchParams(window.location.search);
const requested = params.get("scenario");
if (requested) {
  renderScenario(requested, params.get("now") ?? 0).catch((error) => {
    window.__hudError = String(error?.message ?? error);
    if (label) label.textContent = window.__hudError;
  });
} else if (params.get("all")) {
  // Runner-driven mode: expose the API and report ready without rendering anything yet.
  window.__hudReady = "harness";
}
