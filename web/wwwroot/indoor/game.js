import {
  FACILITY,
  SURVEY_PROFILES,
  createIndoorMission,
  missionSnapshot,
  stepIndoorMission,
} from "./sim.js";
import { IndoorPresentation } from "./presentation.js";
import { IndoorAudio, loadIndoorPreferences } from "./audio.js";
import { RELEASE_BUILD } from "../render/release/release_identity.js?v=328";
import {
  indoorActionPolicy,
  indoorBlockedActionMessage,
} from "../render/indoor/control_policy.js?v=328";

const FIXED_STEP = 1 / 60;
const MAX_FRAME_SECONDS = 0.12;
const YAW_RATE = 2.2;
const PITCH_RATE = 1.65;
const INITIAL_AMMO = 36;

const clamp = (value, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));
const byId = (id) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Indoor UI is missing #${id}`);
  return node;
};

const ui = {
  canvas: byId("viewport"),
  boot: byId("boot-status"),
  fatal: byId("fatal"),
  fatalCopy: byId("fatal-copy"),
  briefing: byId("briefing"),
  briefingTitle: byId("briefing-title"),
  missionBrief: byId("mission-brief"),
  missionSet: byId("survey-mission-set"),
  begin: byId("begin-button"),
  pause: byId("pause-screen"),
  pauseToggle: byId("pause-toggle"),
  resume: byId("resume-button"),
  restart: byId("restart-button"),
  help: byId("help-screen"),
  helpOpen: byId("help-open"),
  helpClose: byId("help-close"),
  result: byId("result-screen"),
  flyAgain: byId("fly-again"),
  audioToggle: byId("audio-toggle"),
  linkMode: byId("link-mode"),
  linkDetail: byId("link-detail"),
  feedState: byId("feed-state"),
  feedQuality: byId("feed-quality"),
  controlAuthority: byId("control-authority"),
  fibreLabel: byId("fibre-label"),
  fibreValue: byId("fibre-value"),
  fibreBar: byId("fibre-bar"),
  batteryValue: byId("battery-value"),
  batteryBar: byId("battery-bar"),
  integrityValue: byId("integrity-value"),
  integrityBar: byId("integrity-bar"),
  ammoValue: byId("ammo-value"),
  alertValue: byId("alert-value"),
  relayBlock: byId("relay-block"),
  relayTime: byId("relay-time"),
  relayState: byId("relay-state"),
  combatBlock: byId("combat-block"),
  combatTime: byId("combat-time"),
  combatState: byId("combat-state"),
  missionDoctrine: byId("mission-doctrine"),
  missionObjectiveTitle: byId("mission-objective-title"),
  objectiveList: byId("objective-list"),
  missionClock: byId("mission-clock").querySelector("output"),
  map: byId("minimap"),
  reticle: byId("reticle"),
  range: byId("range-readout"),
  velocityVector: byId("velocity-vector"),
  interaction: byId("interaction-cue"),
  eventCue: byId("event-cue"),
  subtitle: byId("subtitle"),
  detachKicker: byId("detach-kicker"),
  detachCopy: byId("detach-copy"),
  detachPanel: byId("detach-panel"),
  detach: byId("detach-button"),
  returnHome: byId("return-button"),
  broadcast: byId("broadcast-button"),
  signalNoise: byId("signal-noise"),
  hitFlash: byId("hit-flash"),
  announcer: byId("announcer"),
  resultKicker: byId("result-kicker"),
  resultTitle: byId("result-title"),
  resultCopy: byId("result-copy"),
  resultTime: byId("result-time"),
  resultLink: byId("result-link"),
  resultRounds: byId("result-rounds"),
  resultAlert: byId("result-alert"),
  touchMove: byId("move-pad"),
  touchLook: byId("look-pad"),
  touchFire: byId("touch-fire"),
  touchDetach: byId("touch-detach"),
  touchReturn: byId("touch-return"),
  touchBroadcast: byId("touch-broadcast"),
};

const preferences = loadIndoorPreferences();
const touchCapable = navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches;
document.body.classList.toggle("high-contrast", preferences.highContrast);
document.body.classList.toggle("large-text", preferences.largeText);
document.body.classList.toggle("reduced-motion", preferences.reducedMotion);

let selectedMissionId = "attack-site";
let mission = createIndoorMission({ missionId: selectedMissionId });
let snapshot = missionSnapshot(mission);
let presentation = null;
let audio = new IndoorAudio(preferences.audio);
let started = false;
let paused = true;
let resultShown = false;
let helpReturnPaused = false;
let accumulator = 0;
let lastFrameAt = performance.now();
let elapsedPresentation = 0;
let lastVideoFrameAt = lastFrameAt;
let nextVideoFrameAt = 0;
let lastVideoFeedState = "clear";
let lastEventId = 0;
let terminalAt = null;
let maximumAlert = 0;
let lastCollisionCount = 0;
let lastSafeNoticeAt = -Infinity;
let subtitleUntil = 0;
let eventCueUntil = 0;
let detachQueued = false;
let returnQueued = false;
let broadcastHeld = false;
let mouseFire = false;
let pendingYawRadians = 0;
let pendingPitchRadians = 0;
let touchForward = 0;
let touchRight = 0;
let touchYaw = 0;
let touchPitch = 0;
let touchUp = 0;
let gamepadDetachHeld = false;
const heldKeys = new Set();

function formatClock(seconds, tenths = false) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const base = `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}`;
  return tenths ? `${base}.${Math.floor((safe % 1) * 10)}` : base;
}

function alertLabel(value) {
  if (value < 0.16) return "LOW";
  if (value < 0.46) return "SEARCH";
  if (value < 0.75) return "HIGH";
  return "TRACKED";
}

function videoFeedState(state = snapshot) {
  if (state.link.mode === "fiber") return "clear";
  if (state.link.mode === "lost") return "lost";
  if (state.link.rf.videoState) return state.link.rf.videoState;
  const signal = clamp(state.link.rf.signal);
  if (signal >= 0.72) return "clear";
  if (signal >= 0.42) return "degraded";
  if (signal >= 0.08) return "choppy";
  return "lost";
}

function commandControlState(state = snapshot) {
  if (state.link.mode === "fiber") return "direct";
  const authority = clamp(state.drone.autonomy?.authority ?? state.link.rf.signal);
  if (state.link.mode === "lost" || authority < 0.14) return "autonomous";
  if (authority < 0.88 || state.drone.autonomy?.active) return "assisted";
  return "direct";
}

function videoFrameIntervalMs(state = snapshot) {
  if (preferences.reducedMotion) return 0;
  const feed = videoFeedState(state);
  const signal = clamp(state.link.rf.signal);
  if (feed === "clear") return 0;
  if (feed === "degraded") return 64 + (0.72 - signal) * 82;
  if (feed === "choppy") return 145 + (0.42 - signal) * 440;
  // With no command carrier, rare buffered packets still show what the onboard
  // controller is doing; physics never waits for these operator frames.
  return 720;
}

function setBar(node, fraction, warning = false) {
  const value = clamp(fraction);
  node.style.transform = `scaleX(${value.toFixed(4)})`;
  node.style.background = warning ? "var(--red)"
    : value < 0.26 ? "var(--amber)" : "var(--green)";
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function showSubtitle(message, duration = 2800) {
  ui.subtitle.textContent = message;
  ui.subtitle.classList.add("visible");
  subtitleUntil = performance.now() + duration;
}

function showEventCue(message, duration = 1400) {
  ui.eventCue.textContent = message;
  ui.eventCue.classList.add("visible");
  eventCueUntil = performance.now() + duration;
}

function announce(message) {
  ui.announcer.textContent = "";
  queueMicrotask(() => { ui.announcer.textContent = message; });
}

function rejectIndoorAction(action, policy) {
  const message = indoorBlockedActionMessage(action, policy);
  showSubtitle(message, 2200);
  announce(message);
  return false;
}

function queueDetach() {
  const policy = indoorActionPolicy(snapshot);
  if (!policy.canDetach) return rejectIndoorAction("detach", policy);
  detachQueued = true;
  return true;
}

function queueReturn() {
  const policy = indoorActionPolicy(snapshot);
  if (!policy.canReturn) return rejectIndoorAction("return", policy);
  returnQueued = true;
  return true;
}

function beginBroadcast() {
  const policy = indoorActionPolicy(snapshot);
  if (!policy.canBroadcast) return rejectIndoorAction("broadcast", policy);
  broadcastHeld = true;
  return true;
}

function phaseState() {
  if (snapshot.status === "success") return "complete";
  if (snapshot.survey?.returnRequested || snapshot.survey?.combat.active) return "action";
  if (snapshot.survey?.objectives.scan.complete) return "detach";
  if (snapshot.link.mode !== "fiber") return "action";
  if (snapshot.checkpoint.reached) return "detach";
  return "ingress";
}

const PROFILE_BRIEFING = Object.freeze({
  "attack-site": {
    doctrine: "STEALTH MANDATORY",
    copy: "Survey tomorrow's attack site without announcing the route. Keep the fibre attached, inspect the marked rooms, then let the onboard controller retrace the quiet path home.",
    begin: "LAUNCH QUIET SURVEY",
  },
  "discretionary-site": {
    doctrine: "DISCRETION",
    copy: "Inspect the abandoned service block and decide in the air: return silently if the site stays quiet, or break away and defend the drone if an investigator appears.",
    begin: "LAUNCH DISCRETIONARY SURVEY",
  },
  "diversion-site": {
    doctrine: "PROVOCATION REQUIRED",
    copy: "Survey tomorrow's diversion site, then broadcast deliberately. Draw out the investigator drone, open the gunfight, and make the response force look the wrong way.",
    begin: "LAUNCH DIVERSION SURVEY",
  },
});

function selectedProfile() {
  return SURVEY_PROFILES[selectedMissionId] ?? null;
}

function updateMissionBriefing() {
  const profile = selectedProfile();
  const copy = PROFILE_BRIEFING[selectedMissionId];
  if (!profile || !copy) return;
  for (const button of ui.missionSet.querySelectorAll("[data-mission-id]")) {
    const selected = button.dataset.missionId === selectedMissionId;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
  }
  ui.missionBrief.textContent = copy.copy;
  ui.begin.textContent = copy.begin;
  ui.missionDoctrine.textContent = `MISSION / ${copy.doctrine}`;
  ui.missionObjectiveTitle.textContent = profile.label;
  document.body.dataset.profile = selectedMissionId;
}

function selectMissionProfile(missionId) {
  if (!SURVEY_PROFILES[missionId] || started) return false;
  selectedMissionId = missionId;
  resetMission({ start: false });
  return true;
}

function updatePhaseStrip() {
  const phase = phaseState();
  const order = ["ingress", "detach", "action"];
  const current = phase === "complete" ? order.length : order.indexOf(phase);
  for (let index = 0; index < order.length; index += 1) {
    const element = document.querySelector(`[data-phase-step="${order[index]}"]`);
    if (!element) continue;
    element.classList.toggle("active", index === current);
    element.classList.toggle("complete", index < current || phase === "complete");
  }
}

function updateObjectives() {
  const survey = snapshot.survey;
  let states;
  if (survey) {
    const scans = survey.objectives.scan;
    const returning = survey.returnRequested;
    const returnComplete = survey.objectives.return.complete;
    if (survey.doctrine === "noisy-provocation") {
      states = [
        {
          label: `Survey marked rooms · ${scans.completed}/${scans.total}`,
          complete: scans.complete,
          active: !scans.complete,
          status: scans.complete ? "DONE" : survey.scanning ? "SCANNING" : "ACTIVE",
        },
        {
          label: "Broadcast a deliberate RF signature",
          complete: survey.objectives.broadcast.complete,
          active: scans.complete && !survey.objectives.broadcast.complete,
          status: survey.objectives.broadcast.complete ? "LOUD" : scans.complete ? "TRANSMIT" : "LOCKED",
        },
        {
          label: "Draw out the investigator drone",
          complete: survey.objectives.investigator.complete,
          active: survey.investigator.summoned && !survey.investigator.arrived,
          status: survey.investigator.arrived ? "ON SITE" : survey.investigator.summoned ? "INBOUND" : "LOCKED",
        },
        {
          label: "Open the drone fight",
          complete: survey.objectives.combat.complete,
          active: survey.investigator.arrived && !survey.combat.active,
          status: survey.combat.active ? "CLOCK LIVE" : survey.investigator.arrived ? "ENGAGE" : "LOCKED",
        },
        {
          label: "Return through the ingress",
          complete: returnComplete,
          active: survey.combat.active && !returnComplete,
          status: returnComplete ? "HOME" : returning ? "AUTO" : survey.combat.active ? "READY" : "LOCKED",
        },
      ];
    } else if (survey.doctrine === "stealth-mandatory") {
      states = [
        {
          label: `Survey marked rooms · ${scans.completed}/${scans.total}`,
          complete: scans.complete,
          active: !scans.complete,
          status: scans.complete ? "DONE" : survey.scanning ? "SCANNING" : "ACTIVE",
        },
        {
          label: "Maintain zero radio emissions",
          complete: returnComplete,
          active: !survey.breach,
          status: survey.breach ? "BREACHED" : "QUIET",
        },
        {
          label: "Avoid investigator detection",
          complete: returnComplete,
          active: !survey.breach,
          status: survey.breach ? "SEEN" : "UNSEEN",
        },
        {
          label: "Silent autonomous return",
          complete: returnComplete,
          active: scans.complete && !returnComplete,
          status: returnComplete ? "HOME" : returning ? "AUTO" : scans.complete ? "READY" : "LOCKED",
        },
      ];
    } else {
      const choiceMade = returning || survey.broadcastSeconds > 0;
      states = [
        {
          label: `Survey marked rooms · ${scans.completed}/${scans.total}`,
          complete: scans.complete,
          active: !scans.complete,
          status: scans.complete ? "DONE" : survey.scanning ? "SCANNING" : "ACTIVE",
        },
        {
          label: "Choose silent return or radio",
          complete: choiceMade,
          active: scans.complete && !choiceMade,
          status: returning ? "RETURN" : survey.broadcastSeconds > 0 ? "RADIO" : scans.complete ? "CHOOSE" : "LOCKED",
        },
        {
          label: "Defend if investigated",
          complete: survey.combat.active,
          active: survey.investigator.arrived && !survey.combat.active,
          status: survey.combat.active ? "ENGAGED" : survey.investigator.arrived ? "CONTACT" : "OPTIONAL",
        },
        {
          label: "Return through the ingress",
          complete: returnComplete,
          active: scans.complete && !returnComplete,
          status: returnComplete ? "HOME" : returning ? "AUTO" : scans.complete ? "READY" : "LOCKED",
        },
      ];
    }
  } else {
    states = [
      {
        label: snapshot.checkpoint.label,
        complete: snapshot.checkpoint.reached,
        active: !snapshot.checkpoint.reached,
        status: snapshot.checkpoint.reached ? "DONE" : "ACTIVE",
      },
      ...snapshot.objectives.map((objective, index) => {
        const previousComplete = index === 0
          ? snapshot.checkpoint.reached
          : snapshot.objectives[index - 1].destroyed;
        return {
          label: objective.label,
          complete: objective.destroyed,
          active: !objective.destroyed && previousComplete,
          status: objective.destroyed ? "DOWN" : previousComplete ? "ACTIVE" : "LOCKED",
        };
      }),
    ];
  }

  while (ui.objectiveList.children.length < states.length) {
    const row = document.createElement("li");
    row.innerHTML = "<b></b><span></span><i></i>";
    ui.objectiveList.append(row);
  }
  while (ui.objectiveList.children.length > states.length) {
    ui.objectiveList.lastElementChild?.remove();
  }
  const rows = [...ui.objectiveList.querySelectorAll("li")];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const state = states[index] ?? { complete: false, active: false, status: "LOCKED" };
    row.querySelector("b").textContent = String(index + 1).padStart(2, "0");
    row.querySelector("span").textContent = state.label;
    row.classList.toggle("complete", state.complete);
    row.classList.toggle("active", state.active);
    const status = row.querySelector("i");
    if (status) status.textContent = state.status;
  }
}

function updateLinkReadout() {
  const { link } = snapshot;
  const feed = videoFeedState(snapshot);
  const control = commandControlState(snapshot);
  const authority = clamp(snapshot.drone.autonomy?.authority ?? 1);
  const automation = 1 - authority;
  const target = snapshot.objectives.find(
    (objective) => objective.id === snapshot.drone.autonomy?.targetId,
  );

  document.body.dataset.link = link.mode;
  document.body.dataset.video = feed;
  document.body.dataset.autonomy = control === "direct" ? "off" : "active";
  ui.feedState.dataset.state = feed;
  ui.feedQuality.textContent = {
    clear: "FULL RATE",
    degraded: "DEGRADED",
    choppy: "INTERMITTENT",
    lost: "FRAME HOLD",
  }[feed] ?? "INTERMITTENT";
  ui.controlAuthority.textContent = control === "autonomous"
    ? "BEST-EFFORT AUTONOMY"
    : control === "assisted"
      ? `FLIGHT ASSIST ${Math.round(automation * 100)}%`
      : "DIRECT CONTROL";

  if (link.mode === "fiber") {
    const tension = link.fiber.tension / Math.max(0.001, link.fiber.maxTension);
    ui.linkMode.textContent = tension > 0.7 ? "OPTICAL / TENSION" : "OPTICAL";
    ui.linkDetail.textContent = tension > 0.7 ? "COUPLER WILL RELEASE" : "JAM RESISTANT";
    if (tension > 0.36) {
      ui.fibreLabel.textContent = "TENSION";
      ui.fibreValue.textContent = `${Math.round(tension * 100)}%`;
      setBar(ui.fibreBar, tension, tension > 0.72);
    } else {
      ui.fibreLabel.textContent = "FIBRE";
      ui.fibreValue.textContent = `${Math.round(link.fiber.deployed)} M`;
      setBar(ui.fibreBar, 1 - link.fiber.deployed / link.fiber.maxLength);
    }
    ui.relayBlock.hidden = true;
    ui.signalNoise.style.opacity = "0";
  } else if (link.mode === "rf") {
    const signal = clamp(link.rf.signal);
    ui.linkMode.textContent = "RADIO";
    ui.linkDetail.textContent = `SIGNAL ${Math.round(signal * 100)}%`;
    ui.fibreLabel.textContent = "SIGNAL";
    ui.fibreValue.textContent = `${Math.round(signal * 100)}%`;
    setBar(ui.fibreBar, signal, signal < 0.25);
    ui.relayBlock.hidden = false;
    ui.relayTime.textContent = formatClock(link.rf.survivalTimer);
    const critical = link.rf.survivalTimer < 10 || link.rf.relayIntegrity < 28;
    ui.relayState.textContent = control === "autonomous"
      ? `ONBOARD · ${target?.label?.toUpperCase() ?? "STABILIZE"}`
      : control === "assisted"
        ? `ASSIST ${Math.round(automation * 100)}%`
        : link.rf.relayIntegrity < 50
          ? `STATION ${Math.round(link.rf.relayIntegrity)}%`
          : critical ? "WINDOW CRITICAL" : "STATION HOLDING";
    const noise = {
      clear: 0,
      degraded: 0.24,
      choppy: 0.46,
      lost: 0.62,
    }[feed] ?? 0.35;
    ui.signalNoise.style.opacity = String(clamp(
      noise + (critical ? 0.05 : 0),
      0,
      0.64,
    ));
  } else {
    ui.linkMode.textContent = "AUTONOMY";
    ui.linkDetail.textContent = "COMMAND LINK LOST";
    ui.fibreLabel.textContent = "SIGNAL";
    ui.fibreValue.textContent = "0%";
    setBar(ui.fibreBar, 0, true);
    ui.relayBlock.hidden = false;
    ui.relayTime.textContent = "--:--";
    ui.relayState.textContent = `ONBOARD · ${target?.label?.toUpperCase() ?? "STABILIZE"}`;
    ui.signalNoise.style.opacity = ".64";
  }
}

function updateInteractionCue() {
  const nearestClosedDoor = snapshot.doors
    .filter((door) => !door.open)
    .map((door) => {
      const centre = {
        x: (door.aabb.min.x + door.aabb.max.x) * 0.5,
        y: snapshot.drone.position.y,
        z: (door.aabb.min.z + door.aabb.max.z) * 0.5,
      };
      return { door, separation: distance(snapshot.drone.position, centre) };
    })
    .sort((left, right) => left.separation - right.separation)[0];
  const show = nearestClosedDoor && nearestClosedDoor.separation < 3;
  ui.interaction.hidden = !show;
  if (show) {
    ui.interaction.querySelector("span").textContent = "PROXIMITY HANDSHAKE";
    ui.interaction.querySelector("b").textContent = nearestClosedDoor.door.label.toUpperCase();
  }
}

function updateVelocityVector() {
  const { velocity, yaw } = snapshot.drone;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const localRight = velocity.x * cos + velocity.z * sin;
  const localUp = velocity.y;
  const x = clamp(localRight * 4.2, -26, 26);
  const y = clamp(-localUp * 4.2, -22, 22);
  ui.velocityVector.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
}

function updateHud() {
  const { drone } = snapshot;
  updateLinkReadout();
  updatePhaseStrip();
  updateObjectives();
  updateInteractionCue();
  updateVelocityVector();

  ui.batteryValue.textContent = `${Math.round(drone.battery)}%`;
  ui.integrityValue.textContent = `${Math.round(drone.integrity)}%`;
  ui.ammoValue.textContent = String(drone.ammo).padStart(2, "0");
  ui.alertValue.textContent = alertLabel(snapshot.alert);
  ui.alertValue.style.color = snapshot.alert > 0.7 ? "var(--red)"
    : snapshot.alert > 0.32 ? "var(--amber)" : "";
  setBar(ui.batteryBar, drone.battery / 100);
  setBar(ui.integrityBar, drone.integrity / 100, drone.integrity < 25);
  ui.missionClock.textContent = formatClock(snapshot.time, true);

  const aim = presentation?.targetInfo;
  ui.reticle.classList.toggle("hot", Boolean(aim));
  ui.range.textContent = aim ? `${aim.kind.toUpperCase()} · ${aim.distance.toFixed(1)} M` : "";

  if (snapshot.link.mode === "fiber") {
    const tension = snapshot.link.fiber.tension / snapshot.link.fiber.maxTension;
    ui.detachKicker.textContent = tension > 0.66
      ? "COUPLER UNDER LOAD" : snapshot.checkpoint.reached ? "BREAKAWAY GATE" : "BREAKAWAY ARMED";
    ui.detachCopy.textContent = snapshot.checkpoint.reached
      ? "Route is clear. X starts the RF clock."
      : tension > 0.66 ? "Automatic release is imminent" : "X detaches fibre at any time";
  }
  if (snapshot.survey) {
    const policy = indoorActionPolicy(snapshot);
    const scansComplete = snapshot.survey.objectives.scan.complete;
    const returning = snapshot.survey.returnRequested;
    ui.returnHome.hidden = !policy.canReturn;
    ui.touchReturn.hidden = !policy.canReturn;
    ui.broadcast.hidden = !policy.canBroadcast;
    ui.touchBroadcast.hidden = !policy.canBroadcast;
    ui.touchFire.hidden = !policy.canFire;
    ui.broadcast.classList.toggle("active", broadcastHeld);
    ui.touchBroadcast.classList.toggle("active", broadcastHeld);
    ui.detach.hidden = !policy.canDetach;
    ui.touchDetach.hidden = !policy.canDetach;
    if (policy.stealthMandatory && !returning) {
      ui.detachKicker.textContent = scansComplete
        ? "SILENT RETURN READY" : "STEALTH PROFILE";
      ui.detachCopy.textContent = scansComplete
        ? "R starts the dark autonomous retrace. Fibre and weapons remain safe."
        : "Keep fibre attached and weapons safe. Survey every marked room first.";
    }
    if (returning) {
      ui.detachKicker.textContent = snapshot.survey.silentReturn
        ? "SILENT AUTONOMOUS RETURN" : "AUTONOMOUS RETURN";
      ui.detachCopy.textContent = "Onboard navigation owns the retrace.";
    } else if (scansComplete) {
      ui.detachKicker.textContent = snapshot.survey.doctrine === "noisy-provocation"
        ? "PROVOCATION PHASE" : "SURVEY CAPTURED";
      ui.detachCopy.textContent = snapshot.survey.doctrine === "noisy-provocation"
        ? "Detach, then hold B to broadcast."
        : policy.stealthMandatory
          ? "R returns dark. Fibre, radio and weapons remain safe."
          : "R returns dark; X exposes the radio.";
    }
  }

  const hitOpacity = presentation?.hitPulse ?? 0;
  ui.hitFlash.style.opacity = String(clamp(hitOpacity * 0.62));
}

function drawMinimap() {
  const context = ui.map.getContext("2d");
  const width = ui.map.width;
  const height = ui.map.height;
  const pad = 15;
  const bounds = FACILITY.bounds;
  const scaleX = (width - pad * 2) / (bounds.max.x - bounds.min.x);
  const scaleZ = (height - pad * 2) / (bounds.max.z - bounds.min.z);
  const x = (value) => pad + (value - bounds.min.x) * scaleX;
  const y = (value) => height - pad - (value - bounds.min.z) * scaleZ;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(2, 10, 9, .94)";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(98, 234, 255, .055)";
  context.lineWidth = 1;
  for (let gridX = Math.ceil(bounds.min.x); gridX <= bounds.max.x; gridX += 2) {
    context.beginPath();
    context.moveTo(x(gridX), pad);
    context.lineTo(x(gridX), height - pad);
    context.stroke();
  }
  for (let gridZ = Math.ceil(bounds.min.z); gridZ <= bounds.max.z; gridZ += 2) {
    context.beginPath();
    context.moveTo(pad, y(gridZ));
    context.lineTo(width - pad, y(gridZ));
    context.stroke();
  }

  context.fillStyle = "rgba(144, 187, 173, .16)";
  for (const wall of FACILITY.walls) {
    if (wall.id === "floor" || wall.id === "ceiling") continue;
    const left = x(wall.aabb.min.x);
    const right = x(wall.aabb.max.x);
    const top = y(wall.aabb.max.z);
    const bottom = y(wall.aabb.min.z);
    context.fillRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
  }

  context.strokeStyle = "rgba(98, 234, 255, .3)";
  context.setLineDash([7, 5]);
  context.lineWidth = 2;
  context.beginPath();
  FACILITY.pathNodes.forEach((node, index) => {
    if (index === 0) context.moveTo(x(node.position.x), y(node.position.z));
    else context.lineTo(x(node.position.x), y(node.position.z));
  });
  context.stroke();
  context.setLineDash([]);

  if (snapshot.link.fiber.trail.length > 1) {
    context.strokeStyle = snapshot.link.mode === "fiber"
      ? "rgba(77, 255, 136, .82)" : "rgba(77, 255, 136, .24)";
    context.lineWidth = 2;
    context.beginPath();
    snapshot.link.fiber.trail.forEach((point, index) => {
      if (index === 0) context.moveTo(x(point.x), y(point.z));
      else context.lineTo(x(point.x), y(point.z));
    });
    context.lineTo(x(snapshot.drone.position.x), y(snapshot.drone.position.z));
    context.stroke();
  }

  for (const objective of snapshot.objectives) {
    context.beginPath();
    context.arc(x(objective.position.x), y(objective.position.z), objective.id === "command-core" ? 5 : 4, 0, Math.PI * 2);
    context.fillStyle = objective.destroyed ? "rgba(120, 255, 195, .18)" : "#62eaff";
    context.fill();
  }

  if (snapshot.alert > 0.12 || snapshot.link.mode !== "fiber") {
    for (const hostile of snapshot.hostiles) {
      if (!hostile.alive) continue;
      context.beginPath();
      context.arc(x(hostile.position.x), y(hostile.position.z), 3.5, 0, Math.PI * 2);
      context.fillStyle = "#ff5ea8";
      context.fill();
    }
  }

  context.save();
  context.translate(x(snapshot.drone.position.x), y(snapshot.drone.position.z));
  context.rotate(snapshot.drone.yaw);
  context.beginPath();
  context.moveTo(0, -7);
  context.lineTo(5, 5);
  context.lineTo(0, 3);
  context.lineTo(-5, 5);
  context.closePath();
  context.fillStyle = "#78ffc3";
  context.shadowColor = "#78ffc3";
  context.shadowBlur = 7;
  context.fill();
  context.restore();
}

function processEvent(event) {
  const seed = Number(event.id) || 0;
  switch (event.type) {
    case "checkpoint-reached":
      showEventCue("INTERIOR CHECKPOINT");
      showSubtitle("Precleared ingress complete. Shed the fibre when you are ready to commit.", 3600);
      audio.objective();
      announce("Interior checkpoint reached. Breakaway is ready.");
      break;
    case "fiber-snagged":
      showEventCue("FIBRE TENSION");
      showSubtitle("The route has caught the line. Ease off—or let the breakaway collar release.", 3100);
      audio.snag();
      announce("Fibre snagged. Tension rising.");
      break;
    case "fiber-detached": {
      const automatic = event.reason !== "manual";
      showEventCue(automatic ? "COUPLER RELEASED" : "BREAKAWAY / RADIO");
      showSubtitle(
        automatic
          ? "Clean separation. Radio handoff is live; the relay window has started."
          : "Fibre clear. The station is exposed now—finish the control loop.",
        3600,
      );
      audio.handoff();
      announce(`Fibre detached. Radio link active. ${Math.round(snapshot.link.rf.survivalTimer)} seconds.`);
      break;
    }
    case "door-opened":
      showEventCue("SHUTTER OPEN");
      audio.tone(280, 0.11, 0.04, "triangle");
      break;
    case "gun-fired":
      audio.shot(false);
      break;
    case "sentry-fired":
      audio.shot(true);
      break;
    case "projectile-impact":
      if (event.position) presentation.impact(event.position, false, seed);
      audio.burst(0.05, 0.035, 950);
      break;
    case "hostile-hit":
    case "objective-hit":
      if (event.position) presentation.impact(event.position, false, seed);
      audio.impact();
      break;
    case "hostile-disabled":
      if (event.position) presentation.impact(event.position, true, seed);
      showEventCue("SENTRY DISABLED");
      audio.objective();
      break;
    case "objective-disabled": {
      if (event.position) presentation.impact(event.position, false, seed);
      const objective = snapshot.objectives.find((candidate) => candidate.id === event.objectiveId);
      showEventCue(`${objective?.label ?? "CONTROL CORE"} DOWN`);
      audio.objective();
      announce(`${objective?.label ?? "Control core"} disabled.`);
      break;
    }
    case "drone-hit":
      if (event.position) presentation.impact(event.position, true, seed);
      presentation.pulseHit(1);
      audio.impact();
      announce("Drone hit.");
      break;
    case "relay-hit":
      if (event.position) presentation.impact(event.position, true, seed);
      presentation.pulseHit(0.48);
      showEventCue("RELAY TAKING FIRE");
      audio.impact();
      announce("Radio relay is taking fire.");
      break;
    case "rf-degraded":
      if (event.signalState === "weak") {
        showEventCue("VIDEO INTERMITTENT");
        showSubtitle("Packets are arriving late. MIDGE-03 is smoothing commands and holding the task.", 3200);
        announce("Video intermittent. Onboard flight assist is maintaining the task.");
      } else {
        showEventCue("VIDEO DEGRADED");
        showSubtitle("Radio is thinning. The flight controller is blending in stabilizing guidance.", 2800);
        announce("Video degraded. Onboard flight assist is active.");
      }
      audio.burst(0.08, 0.028, 1800);
      break;
    case "rf-lost":
      showEventCue("COMMAND LINK LOST", 2200);
      showSubtitle("The picture is stale. MIDGE-03 is continuing the last mission on best-effort autonomy.", 4800);
      audio.burst(0.16, 0.045, 1400);
      audio.tone(270, 0.17, 0.06, "square", 0.08);
      announce("Command link lost. Midge zero three is continuing on best-effort autonomy.");
      break;
    case "rf-recovered":
      showEventCue("RADIO RECOVERED");
      showSubtitle("Fresh video. Command authority is returning to the operator.", 2600);
      audio.handoff();
      announce("Radio recovered. Video and command authority are returning.");
      break;
    case "autonomy-engaged":
      if (snapshot.link.mode !== "lost") {
        showEventCue("FLIGHT ASSIST");
        announce("Onboard flight assist engaged.");
      }
      break;
    case "autonomy-disengaged":
      announce("Direct control restored.");
      break;
    case "survey-scan-started": {
      const scan = snapshot.survey?.scanPoints.find((point) => point.id === event.scanId);
      showEventCue("SURVEY HOLD");
      showSubtitle(`Hold station on ${scan?.label ?? "the observation point"}.`, 1800);
      audio.tone(410, 0.08, 0.025, "sine");
      break;
    }
    case "survey-scan-complete": {
      const scan = snapshot.survey?.scanPoints.find((point) => point.id === event.scanId);
      showEventCue("SURVEY CAPTURED");
      showSubtitle(`${scan?.label ?? "Observation"} recorded. Continue the route.`, 2300);
      audio.objective();
      announce(`${scan?.label ?? "Observation"} recorded.`);
      break;
    }
    case "survey-broadcast-started":
      showEventCue("EW SIGNATURE OPEN");
      showSubtitle("The site can hear you now. Hold B to make the provocation unmistakable.", 3200);
      audio.handoff();
      announce("Deliberate radio signature transmitting.");
      break;
    case "survey-broadcast-complete":
      showEventCue("SIGNATURE CONFIRMED");
      showSubtitle("They have the transmission. Expect an investigator.", 2500);
      audio.objective();
      break;
    case "investigator-summoned":
      showEventCue("ATTENTION DRAWN");
      showSubtitle(`Investigator estimated in ${event.arrivalSeconds?.toFixed?.(1) ?? "a few"} seconds.`, 2600);
      audio.tone(330, 0.14, 0.04, "square");
      break;
    case "investigator-arrived":
      showEventCue("INVESTIGATOR ON SITE");
      showSubtitle("Contact is checking the transmission. Engage only if doctrine permits.", 3300);
      announce("Investigator drone on site.");
      audio.tone(230, 0.18, 0.05, "sawtooth");
      break;
    case "survey-combat-started":
      showEventCue("RESPONSE CLOCK LIVE", 2200);
      showSubtitle(`The first shot started the clock. Reinforcements in ${event.reinforcementSeconds?.toFixed?.(1) ?? "seconds"}.`, 3500);
      announce("Drone combat started. Reinforcement clock is live.");
      audio.handoff();
      break;
    case "reinforcement-arrived":
      showEventCue("SECOND DRONE ARRIVED", 2200);
      showSubtitle("The response force is here. Finish the fight or get the airframe home.", 3200);
      announce("Reinforcement drone has entered the facility.");
      audio.failure();
      break;
    case "survey-return-started":
      showEventCue(event.silent ? "SILENT RETURN" : "AUTONOMOUS RETURN");
      showSubtitle(
        event.silent
          ? "No emissions. MIDGE-03 is retracing the fibre path on onboard navigation."
          : "Return route committed. The onboard controller has the aircraft.",
        3500,
      );
      announce(event.silent ? "Silent autonomous return started." : "Autonomous return started.");
      audio.objective();
      break;
    case "survey-stealth-breached":
      showEventCue("STEALTH BREACHED", 2400);
      showSubtitle("Tomorrow's attack route is compromised. This sortie is over.", 3600);
      announce("Stealth doctrine breached.");
      audio.failure();
      break;
    case "survey-complete":
      showEventCue("SURVEY AIRFRAME HOME", 2300);
      audio.success();
      announce("Survey complete. Drone recovered.");
      break;
    case "mission-complete":
      showEventCue("CONTROL LOOP SEVERED", 2300);
      audio.success();
      announce("Mission complete. Facility control loop severed.");
      break;
    case "mission-failed":
      showEventCue("MISSION ENDED", 2300);
      audio.failure();
      announce("Mission failed.");
      break;
    default:
      break;
  }
}

function processEvents() {
  for (const event of snapshot.events) {
    if (event.id <= lastEventId) continue;
    lastEventId = event.id;
    processEvent(event);
  }
}

function outcomeCopy(reason) {
  const copy = {
    "drone-disabled": ["MIDGE-03 disabled", "The drone could not hold the corridor. The control loop remains live."],
    "battery-depleted": ["Battery exhausted", "The airframe settled before the control loop was severed."],
    "relay-disabled": ["Relay station lost", "The local radio station was overrun before the terminal action finished."],
    "rf-window-expired": ["Radio window expired", "The station could not hold the command channel any longer."],
    "stealth-rf-breach": ["Optical route exposed", "The fibre was detached on a zero-emission task, exposing the return route to radio detection."],
    "stealth-broadcast-breach": ["Emission discipline broken", "A deliberate transmission revealed a mission whose doctrine required radio silence."],
    "stealth-fire-breach": ["Weapons discipline broken", "Firing announced the survey before the drone could return with its observations."],
    "stealth-detection-breach": ["Survey detected", "The investigator acquired MIDGE-03 before the silent route was complete."],
    "stealth-doctrine-breach": ["Stealth contract broken", "The mission ended after an action contradicted the zero-emission brief."],
  };
  return copy[reason] ?? ["Mission incomplete", "The facility control loop remains live."];
}

function showResult() {
  if (resultShown) return;
  resultShown = true;
  paused = true;
  terminalAt = null;
  document.exitPointerLock?.();
  document.body.dataset.phase = "result";
  ui.result.classList.add("visible");
  ui.result.setAttribute("aria-hidden", "false");

  if (snapshot.success) {
    if (snapshot.survey) {
      const quiet = snapshot.survey.silentReturn;
      ui.resultKicker.textContent = `${snapshot.survey.label.toUpperCase()} / SURVEY COMPLETE`;
      ui.resultTitle.textContent = quiet ? "Route stayed dark" : "Provocation complete";
      ui.resultCopy.textContent = quiet
        ? "MIDGE-03 recorded the site and retraced the optical ingress without exposing the relay."
        : `The site reacted, the drone fight drew attention, and the airframe made it home with ${Math.round(snapshot.drone.integrity)}% integrity.`;
    } else {
      ui.resultKicker.textContent = "FACILITY NINE / MISSION COMPLETE";
      ui.resultTitle.textContent = "Control loop severed";
      ui.resultCopy.textContent = snapshot.link.mode === "fiber"
        ? "A completely optical run. The station never had to reveal itself."
        : snapshot.link.mode === "lost"
          ? "The command channel collapsed, but MIDGE-03 completed the last task on onboard automation."
          : `The relay held with ${Math.max(0, snapshot.link.rf.survivalTimer).toFixed(1)} seconds remaining.`;
    }
  } else {
    const [title, copy] = outcomeCopy(snapshot.failureReason);
    ui.resultKicker.textContent = "FACILITY NINE / LINK CLOSED";
    ui.resultTitle.textContent = title;
    ui.resultCopy.textContent = copy;
  }
  ui.resultTime.textContent = formatClock(snapshot.time, true);
  ui.resultLink.textContent = snapshot.link.mode === "fiber"
    ? "OPTICAL" : snapshot.link.mode === "lost" ? "AUTONOMY" : "RADIO";
  ui.resultRounds.textContent = `${snapshot.gun.shots} / ${INITIAL_AMMO}`;
  ui.resultAlert.textContent = alertLabel(maximumAlert);
  ui.flyAgain.focus({ preventScroll: true });
}

function pollGamepad() {
  const gamepads = navigator.getGamepads?.() ?? [];
  const gamepad = [...gamepads].find(Boolean);
  if (!gamepad) return { forward: 0, right: 0, up: 0, yaw: 0, pitch: 0, fire: false };
  const deadzone = (value) => Math.abs(value || 0) < 0.13 ? 0 : value;
  const detachHeld = gamepad.buttons[1]?.pressed === true;
  if (detachHeld && !gamepadDetachHeld) queueDetach();
  gamepadDetachHeld = detachHeld;
  return {
    forward: -deadzone(gamepad.axes[1]),
    right: deadzone(gamepad.axes[0]),
    up: (gamepad.buttons[7]?.value || 0) - (gamepad.buttons[6]?.value || 0),
    yaw: deadzone(gamepad.axes[2]),
    pitch: -deadzone(gamepad.axes[3]),
    fire: gamepad.buttons[0]?.pressed === true,
  };
}

function takeMouseAxis(axis, rate) {
  const maximum = rate * FIXED_STEP;
  const value = clamp(axis / maximum, -1, 1);
  return { value, remaining: axis - value * maximum };
}

function buildInput() {
  const gamepad = pollGamepad();
  const actionPolicy = indoorActionPolicy(snapshot);
  const keyboardForward = (heldKeys.has("KeyW") ? 1 : 0) - (heldKeys.has("KeyS") ? 1 : 0);
  const keyboardRight = (heldKeys.has("KeyD") ? 1 : 0) - (heldKeys.has("KeyA") ? 1 : 0);
  const keyboardUp = (heldKeys.has("Space") ? 1 : 0)
    - (heldKeys.has("ShiftLeft") ? 1 : 0);

  const mouseYaw = takeMouseAxis(pendingYawRadians, YAW_RATE);
  const mousePitch = takeMouseAxis(pendingPitchRadians, PITCH_RATE);
  pendingYawRadians = mouseYaw.remaining;
  pendingPitchRadians = mousePitch.remaining;

  const keyboardYaw = (heldKeys.has("ArrowRight") ? 0.68 : 0)
    - (heldKeys.has("ArrowLeft") ? 0.68 : 0);
  const keyboardPitch = (heldKeys.has("ArrowUp") ? 0.68 : 0)
    - (heldKeys.has("ArrowDown") ? 0.68 : 0);
  const requestedFire = mouseFire || heldKeys.has("KeyF") || gamepad.fire;
  if (requestedFire && !actionPolicy.canFire && performance.now() - lastSafeNoticeAt > 1200) {
    lastSafeNoticeAt = performance.now();
    showSubtitle(indoorBlockedActionMessage("fire", actionPolicy), 1800);
  }

  const detach = actionPolicy.canDetach && detachQueued;
  const returnHome = actionPolicy.canReturn && returnQueued;
  detachQueued = false;
  returnQueued = false;
  return {
    forward: clamp(keyboardForward + touchForward + gamepad.forward, -1, 1),
    right: clamp(keyboardRight + touchRight + gamepad.right, -1, 1),
    up: clamp(keyboardUp + touchUp + gamepad.up, -1, 1),
    yaw: clamp(mouseYaw.value + touchYaw + gamepad.yaw + keyboardYaw, -1, 1),
    pitch: clamp(mousePitch.value + touchPitch + gamepad.pitch + keyboardPitch, -1, 1),
    fire: actionPolicy.canFire && requestedFire,
    detachFiber: detach,
    returnHome,
    broadcast: actionPolicy.canBroadcast && broadcastHeld,
    // Facility shutters authenticate automatically at close range so the same mission remains
    // playable on keyboard, touch, and gamepad without a hidden fourth control surface.
    interact: true,
  };
}

function resetInput() {
  heldKeys.clear();
  mouseFire = false;
  pendingYawRadians = 0;
  pendingPitchRadians = 0;
  touchForward = 0;
  touchRight = 0;
  touchYaw = 0;
  touchPitch = 0;
  touchUp = 0;
  detachQueued = false;
  returnQueued = false;
  broadcastHeld = false;
}

function requestControl() {
  if (touchCapable || document.pointerLockElement === ui.canvas) return;
  ui.canvas.requestPointerLock?.().catch?.(() => {});
}

function setPaused(next, showScreen = true) {
  if (!started || resultShown) return;
  paused = next;
  resetInput();
  ui.pause.classList.toggle("visible", paused && showScreen);
  ui.pause.setAttribute("aria-hidden", String(!(paused && showScreen)));
  document.body.dataset.phase = paused ? "paused" : "active";
  if (paused) {
    document.exitPointerLock?.();
    if (showScreen) ui.resume.focus({ preventScroll: true });
  } else {
    lastFrameAt = performance.now();
    ui.canvas.focus({ preventScroll: true });
  }
}

function togglePause() {
  if (!started || resultShown || ui.help.classList.contains("visible")) return;
  setPaused(!paused);
}

function openHelp() {
  if (ui.help.classList.contains("visible")) return;
  helpReturnPaused = paused;
  if (started && !resultShown) setPaused(true, false);
  ui.pause.classList.remove("visible");
  ui.help.classList.add("visible");
  ui.help.setAttribute("aria-hidden", "false");
  ui.helpClose.focus({ preventScroll: true });
}

function closeHelp() {
  if (!ui.help.classList.contains("visible")) return;
  ui.help.classList.remove("visible");
  ui.help.setAttribute("aria-hidden", "true");
  if (started && !resultShown && !helpReturnPaused) setPaused(false, false);
  else if (started && !resultShown) setPaused(true, true);
  else ui.begin.focus({ preventScroll: true });
}

function beginMission() {
  if (started) return;
  started = true;
  paused = false;
  document.body.dataset.phase = "active";
  ui.briefing.classList.remove("visible");
  ui.briefing.setAttribute("aria-hidden", "true");
  ui.canvas.focus({ preventScroll: true });
  void audio.start();
  showSubtitle("Follow the cyan survey markers. Hold each observation point; the fibre keeps the route quiet.", 4200);
  announce("Indoor mission started. Optical link clean.");
  lastFrameAt = performance.now();
  lastVideoFrameAt = lastFrameAt;
  nextVideoFrameAt = 0;
}

function resetMission({ start = true } = {}) {
  mission = createIndoorMission({ missionId: selectedMissionId });
  snapshot = missionSnapshot(mission);
  accumulator = 0;
  lastEventId = 0;
  terminalAt = null;
  maximumAlert = 0;
  lastCollisionCount = 0;
  resultShown = false;
  resetInput();
  ui.result.classList.remove("visible");
  ui.result.setAttribute("aria-hidden", "true");
  ui.pause.classList.remove("visible");
  ui.help.classList.remove("visible");
  document.body.dataset.link = "fiber";
  document.body.dataset.video = "clear";
  document.body.dataset.autonomy = "off";
  document.body.dataset.phase = start ? "active" : "briefing";
  started = start;
  paused = !start;
  if (start) {
    void audio.start();
    ui.canvas.focus({ preventScroll: true });
    showSubtitle("New airframe. Optical link clean.", 2200);
  } else {
    ui.briefing.classList.add("visible");
    ui.briefing.setAttribute("aria-hidden", "false");
    updateMissionBriefing();
    ui.begin.focus({ preventScroll: true });
  }
  lastVideoFrameAt = performance.now();
  nextVideoFrameAt = 0;
  lastVideoFeedState = "clear";
  presentation?.update(snapshot, 0, elapsedPresentation);
  updateHud();
  drawMinimap();
}

function installStick(element, onValue) {
  const knob = element.querySelector("i");
  let pointerId = null;

  const update = (event) => {
    const rect = element.getBoundingClientRect();
    const x = (event.clientX - (rect.left + rect.width * 0.5)) / (rect.width * 0.36);
    const y = (event.clientY - (rect.top + rect.height * 0.5)) / (rect.height * 0.36);
    const magnitude = Math.hypot(x, y);
    const scale = magnitude > 1 ? 1 / magnitude : 1;
    const value = { x: x * scale, y: y * scale };
    knob.style.transform =
      `translate(calc(-50% + ${value.x * 26}px), calc(-50% + ${value.y * 26}px))`;
    onValue(value);
  };

  const finish = (event) => {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    knob.style.transform = "translate(-50%, -50%)";
    onValue({ x: 0, y: 0 });
  };

  element.addEventListener("pointerdown", (event) => {
    if (pointerId !== null) return;
    event.preventDefault();
    pointerId = event.pointerId;
    element.setPointerCapture?.(event.pointerId);
    update(event);
  });
  element.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    update(event);
  });
  element.addEventListener("pointerup", finish);
  element.addEventListener("pointercancel", finish);
  element.addEventListener("lostpointercapture", finish);
}

function installHoldButton(button, pressed, released) {
  let pointer = null;
  const end = (event) => {
    if (event.pointerId !== pointer) return;
    pointer = null;
    button.classList.remove("active");
    released();
  };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    pointer = event.pointerId;
    button.setPointerCapture?.(pointer);
    button.classList.add("active");
    pressed();
  });
  button.addEventListener("pointerup", end);
  button.addEventListener("pointercancel", end);
  button.addEventListener("lostpointercapture", end);
}

function installInput() {
  window.addEventListener("keydown", (event) => {
    if (["KeyH", "Escape", "KeyR", "KeyX", "KeyB", "Space"].includes(event.code)) event.preventDefault();
    if (event.repeat && ["KeyH", "Escape", "KeyR", "KeyX"].includes(event.code)) return;
    if (event.code === "KeyH") {
      if (ui.help.classList.contains("visible")) closeHelp();
      else openHelp();
      return;
    }
    if (event.code === "Escape") {
      if (ui.help.classList.contains("visible")) closeHelp();
      else togglePause();
      return;
    }
    if (event.code === "KeyR") {
      if (resultShown) resetMission({ start: true });
      else if (started && !paused && snapshot.survey) queueReturn();
      return;
    }
    if (event.code === "KeyX" && started && !paused && snapshot.link.mode === "fiber") {
      queueDetach();
      return;
    }
    if (event.code === "KeyB" && started && !paused && snapshot.survey) {
      beginBroadcast();
      return;
    }
    heldKeys.add(event.code);
  });
  window.addEventListener("keyup", (event) => {
    heldKeys.delete(event.code);
    if (event.code === "KeyB") broadcastHeld = false;
  });
  window.addEventListener("blur", resetInput);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && started && !resultShown) setPaused(true, false);
  });

  document.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== ui.canvas || paused) return;
    const sensitivity = preferences.sensitivity * 0.00225;
    pendingYawRadians += event.movementX * sensitivity;
    const vertical = event.movementY * sensitivity * (preferences.invertLook ? 1 : -1);
    pendingPitchRadians += vertical;
  });
  ui.canvas.addEventListener("pointerdown", (event) => {
    if (!started || paused || resultShown || event.button !== 0) return;
    event.preventDefault();
    if (!touchCapable && document.pointerLockElement !== ui.canvas) {
      requestControl();
      return;
    }
    mouseFire = true;
  });
  window.addEventListener("pointerup", () => { mouseFire = false; });
  ui.canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  installStick(ui.touchMove, ({ x, y }) => {
    touchRight = x;
    touchForward = -y;
  });
  installStick(ui.touchLook, ({ x, y }) => {
    touchYaw = x * 0.8;
    touchPitch = -y * 0.68;
  });
  for (const button of document.querySelectorAll("[data-touch-hold]")) {
    const direction = button.dataset.touchHold === "up" ? 1 : -1;
    installHoldButton(button, () => { touchUp = direction; }, () => { touchUp = 0; });
  }
  installHoldButton(ui.touchFire, () => { mouseFire = true; }, () => { mouseFire = false; });
  ui.touchDetach.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    queueDetach();
  });
  installHoldButton(
    ui.touchReturn,
    queueReturn,
    () => {},
  );
  installHoldButton(
    ui.touchBroadcast,
    beginBroadcast,
    () => { broadcastHeld = false; },
  );
}

function bindUi() {
  for (const button of ui.missionSet.querySelectorAll("[data-mission-id]")) {
    button.addEventListener("click", () => selectMissionProfile(button.dataset.missionId));
  }
  ui.begin.addEventListener("click", beginMission);
  ui.pauseToggle.addEventListener("click", togglePause);
  ui.resume.addEventListener("click", () => setPaused(false));
  ui.restart.addEventListener("click", () => resetMission({ start: true }));
  ui.helpOpen.addEventListener("click", openHelp);
  ui.helpClose.addEventListener("click", closeHelp);
  ui.flyAgain.addEventListener("click", () => resetMission({ start: true }));
  ui.detach.addEventListener("click", queueDetach);
  ui.returnHome.addEventListener("click", queueReturn);
  installHoldButton(
    ui.broadcast,
    beginBroadcast,
    () => { broadcastHeld = false; },
  );
  ui.audioToggle.addEventListener("click", () => {
    audio.setEnabled(!audio.enabled);
    ui.audioToggle.textContent = audio.enabled ? "AUDIO ON" : "AUDIO OFF";
    ui.audioToggle.setAttribute("aria-pressed", String(audio.enabled));
    if (audio.enabled) void audio.start();
  });
  ui.audioToggle.textContent = audio.enabled ? "AUDIO ON" : "AUDIO OFF";
  ui.audioToggle.setAttribute("aria-pressed", String(audio.enabled));
  window.addEventListener("resize", () => presentation?.resize());
}

function advanceSimulation() {
  const input = buildInput();
  mission = stepIndoorMission(mission, input, FIXED_STEP);
  snapshot = missionSnapshot(mission);
  maximumAlert = Math.max(maximumAlert, snapshot.alert);
  if (snapshot.drone.collisionCount > lastCollisionCount) {
    lastCollisionCount = snapshot.drone.collisionCount;
    presentation.pulseHit(0.23);
    audio.burst(0.045, 0.025, 430);
  }
  processEvents();
  audio.update(snapshot, input);
}

function deliverVideoFrame(now, fallbackSeconds) {
  if (!presentation) return;
  const feed = videoFeedState(snapshot);
  const changed = feed !== lastVideoFeedState;
  const interval = videoFrameIntervalMs(snapshot);
  if (!changed && interval > 0 && now < nextVideoFrameAt) return;

  const videoSeconds = Math.min(
    0.5,
    Math.max(fallbackSeconds, (now - lastVideoFrameAt) / 1000),
  );
  presentation.update(snapshot, videoSeconds, elapsedPresentation);
  presentation.render();
  lastVideoFrameAt = now;
  lastVideoFeedState = feed;
  nextVideoFrameAt = interval > 0 ? now + interval : now;
}

function frame(now) {
  const frameSeconds = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - lastFrameAt) / 1000));
  lastFrameAt = now;
  elapsedPresentation += frameSeconds;

  if (started && !paused && snapshot.status === "active") {
    accumulator += frameSeconds;
    let substeps = 0;
    while (accumulator >= FIXED_STEP && substeps < 8) {
      advanceSimulation();
      accumulator -= FIXED_STEP;
      substeps += 1;
    }
    if (substeps === 8) accumulator = 0;
  }

  if (snapshot.status !== "active" && terminalAt === null && !resultShown) {
    terminalAt = now + (preferences.reducedMotion ? 250 : 1050);
  }
  if (terminalAt !== null && now >= terminalAt) showResult();

  deliverVideoFrame(now, frameSeconds);
  updateHud();
  drawMinimap();

  if (now >= subtitleUntil) ui.subtitle.classList.remove("visible");
  if (now >= eventCueUntil) ui.eventCue.classList.remove("visible");
  requestAnimationFrame(frame);
}

function exposeDiagnostics() {
  const diagnostics = {
    ready: true,
    get state() { return snapshot; },
    get phase() { return document.body.dataset.phase; },
    get paused() { return paused; },
    get videoState() { return videoFeedState(snapshot); },
    get controlState() { return commandControlState(snapshot); },
    get selectedMissionId() { return selectedMissionId; },
    get profiles() { return Object.keys(SURVEY_PROFILES); },
    get audioDiagnostics() { return audio.diagnostics(); },
    begin: beginMission,
    restart: () => resetMission({ start: true }),
    detach: queueDetach,
    returnHome: queueReturn,
    selectMission: selectMissionProfile,
  };
  globalThis.__gunsIndoor = diagnostics;
}

function showFatal(error) {
  console.error(error);
  ui.boot.hidden = true;
  ui.fatalCopy.textContent = error instanceof Error ? error.message : String(error);
  ui.fatal.classList.add("visible");
  ui.fatal.setAttribute("aria-hidden", "false");
  globalThis.__gunsIndoor = {
    ready: false,
    fatal: ui.fatalCopy.textContent,
  };
}

try {
  presentation = new IndoorPresentation(ui.canvas, FACILITY, {
    reducedMotion: preferences.reducedMotion,
    touch: touchCapable,
  });
  installInput();
  bindUi();
  presentation.update(snapshot, 0, 0);
  updateHud();
  drawMinimap();
  presentation.render();
  ui.boot.hidden = true;
  exposeDiagnostics();
  requestAnimationFrame(frame);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(`../service-worker.js?v=${RELEASE_BUILD}`).catch(() => {});
  }
} catch (error) {
  showFatal(error);
}
