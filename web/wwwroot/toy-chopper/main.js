// Toy Chopper co-op: view + wiring. All game rules live in the pure modules
// (coop_session, missions, targets, gunner, campaign, juice); this file only
// renders the split screen, the HUD and the menus, and forwards the pads.

import * as THREE from "../vendor/three.module.js";
import {AUDIO_CUES, TOY_PALETTE} from "../render/toy/toy_pass.js";
import {createMenuPad} from "../rc/gamepad-menu.mjs";
import {padKind, padSvg} from "../rc/pad-art.mjs";
import {createRCTelemetry} from "../rc/telemetry.mjs";
import {listPads} from "../render/split/pad_flight.mjs";
import {applyResult, campaignRows, loadProgress, saveProgress, unlocked} from "./campaign.mjs";
import {MISSIONS, beginPlay, missionCaption} from "./missions.mjs";
import {friendlyDownFrame} from "./targets.mjs";
import {AIM, gunnerDirection, headingArrowAngle} from "./gunner.mjs";
import {addHit, confettiBurst, createJuice, rumblePulse, stepJuice} from "./juice.mjs";
import {createCoopSession, leaveToTitle, startMission, stepCoop} from "./coop_session.mjs";

const query = new URLSearchParams(location.search);
const theme = query.get("theme") === "light" ? "light" : "dark";
document.body.dataset.theme = theme;
const shotMode = query.get("shot"); // null | "title" | "fly" — deterministic headless scenes

const el = (id) => document.getElementById(id);
const three = el("three");
const overlay = el("overlay");
const octx = overlay.getContext("2d");

// ---------- audio: tiny synth straight off the toy cue table ----------
let ac = null;
function playCue(cue) {
  if (!cue || shotMode) return;
  try {
    ac = ac ?? new (globalThis.AudioContext ?? globalThis.webkitAudioContext)();
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cue.filterHz ?? 800;
    osc.frequency.setValueAtTime(cue.toneHz, t);
    if (cue.altHz) osc.frequency.setValueAtTime(cue.altHz, t + cue.durationS / 2);
    gain.gain.setValueAtTime(cue.gain ?? 0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + (cue.durationS ?? 0.06));
    osc.connect(filter).connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + (cue.durationS ?? 0.06) + 0.02);
  } catch { /* audio is garnish */ }
}

// ---------- scene ----------
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({canvas: three, antialias: false, powerPreference: "high-performance"});
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5));
} catch {
  three.hidden = true; // no WebGL: menus and overlay still work
}
const scene = new THREE.Scene();
scene.background = new THREE.Color(theme === "light" ? "#9ad7ff" : "#1c2436");
scene.fog = new THREE.Fog(scene.background, 60, 140);
scene.add(new THREE.AmbientLight(0xffffff, theme === "light" ? 0.9 : 0.62));
const sun = new THREE.DirectionalLight(theme === "light" ? 0xfff4dd : 0xcdd8ff, theme === "light" ? 0.9 : 0.6);
sun.position.set(30, 50, 10);
scene.add(sun);
const camPilot = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
const camGunner = new THREE.PerspectiveCamera(55, 1, 0.1, 200);

const box = new THREE.BoxGeometry(1, 1, 1);
const ball = new THREE.SphereGeometry(0.5, 10, 8);
const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const mats = new Map();
const mat = (hex) => {
  if (!mats.has(hex)) mats.set(hex, new THREE.MeshLambertMaterial({color: hex}));
  return mats.get(hex);
};
const lawn = new THREE.Mesh(new THREE.CircleGeometry(90, 40), mat(theme === "light" ? "#3f8f4a" : "#2c5e37"));
lawn.rotation.x = -Math.PI / 2;
scene.add(lawn);
const rug = new THREE.Mesh(new THREE.CircleGeometry(20, 28), mat("#c4a574"));
rug.rotation.x = -Math.PI / 2;
rug.position.set(0, 0.02, 40);
scene.add(rug);
for (let i = 0; i < 10; i += 1) { // scattered toy blocks dress the backyard
  const b = new THREE.Mesh(box, mat(TOY_PALETTE.paint[i % TOY_PALETTE.paint.length]));
  b.position.set(Math.sin(i * 2.2) * 55, 0.8, Math.cos(i * 1.7) * 55);
  b.scale.set(1.6, 1.6, 1.6);
  b.rotation.y = i;
  scene.add(b);
}

function makeChopperMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(box, mat("#3cbf45"));
  body.scale.set(1.6, 1.2, 3);
  g.add(body);
  const boom = new THREE.Mesh(box, mat("#3cbf45"));
  boom.scale.set(0.4, 0.4, 2.6);
  boom.position.z = -2.6;
  g.add(boom);
  const rotor = new THREE.Mesh(box, mat("#245c30"));
  rotor.scale.set(5.6, 0.08, 0.4);
  rotor.position.y = 0.9;
  rotor.name = "rotor";
  g.add(rotor);
  const skid = new THREE.Mesh(box, mat("#245c30"));
  skid.scale.set(2, 0.12, 2.6);
  skid.position.y = -0.85;
  g.add(skid);
  return g;
}
const chopperMesh = makeChopperMesh();
scene.add(chopperMesh);

const TOY_BUILDERS = {
  "warmup-balloon": () => tint(ball, TOY_PALETTE.balloon, 2.4),
  "balloon-tower": () => stack([tint(ball, TOY_PALETTE.balloon, 2.2, 0, 2.4), tint(ball, "#3aa0ff", 2, 0, 0.8)]),
  "cardboard-fort": () => tint(box, TOY_PALETTE.cardboard, 5, 0, 1.4),
  "wind-up-tank": () => stack([tint(box, "#c45a3a", 2.2, 0, 0.7), tint(box, TOY_PALETTE.brass, 0.5, 0, 1.6)]),
  "toy-plane": () => stack([tint(box, "#e23b3b", 2.4, 0, 0), tint(box, "#e23b3b", 0.4, 0, 0, {sx: 3.4, sz: 0.7})]),
  "jack-in-the-box": () => stack([tint(box, "#f0c43a", 1.8, 0, 0.9), tint(ball, "#c06bff", 1, 0, 2)]),
  "rubber-band-sniper": () => tint(box, "#4a6e8c", 1, 0, 1, {sy: 2}),
  "blimp-segment": () => tint(ball, TOY_PALETTE.balloon, 4.4),
  "toy-train": () => stack([tint(box, "#3aa0ff", 2.4, 0, 0.9), tint(cyl, "#16181b", 0.9, 1.4, 0.5)]),
  "army-man": () => stack([tint(cyl, TOY_PALETTE.armyGreen, 1, 0, 0.7, {sy: 1.4}), tint(ball, TOY_PALETTE.armyGreen, 0.7, 0, 1.6)]),
};
function tint(geo, color, s = 1, x = 0, y = 0, opt = {}) {
  const m = new THREE.Mesh(geo, mat(color));
  m.scale.set(opt.sx ?? s, opt.sy ?? s, opt.sz ?? s);
  m.position.set(x, y, 0);
  return m;
}
function stack(meshes) {
  const g = new THREE.Group();
  for (const m of meshes) g.add(m);
  return g;
}
function makeAmbulance() {
  const g = new THREE.Group();
  g.add(tint(box, TOY_PALETTE.ambulance, 1.6, 0, 0.7, {sz: 2.6}));
  const cross = tint(box, TOY_PALETTE.ambulanceCross, 0.5, 0, 1.2, {sz: 0.14});
  g.add(cross);
  const light = tint(ball, TOY_PALETTE.ambulanceCross, 0.4, 0, 1.7);
  light.name = "light";
  g.add(light);
  return g;
}

const toyMeshes = new Map();   // toy.id -> group
const shotMeshes = new Map();  // shot.id -> mesh
const splats = [];             // {mesh, ttl}
const ambulances = new Map();  // toy.id -> group

// ---------- state ----------
const session = createCoopSession();
const juice = createJuice();
let progress = loadProgress(globalThis.localStorage);
let resultApplied = false;
let gunnerIdleS = 0;
let tele = null;
try { tele = createRCTelemetry(); } catch { tele = null; }

// ---------- pads ----------
function realPads() {
  try { return navigator.getGamepads?.() ?? []; } catch { return []; }
}
// Shot mode drives scripted pads so headless screenshots show real play.
function shotPads(now) {
  const mk = (index, id) => ({connected: true, index, id, mapping: "standard",
    axes: [0, 0, 0, 0], buttons: Array.from({length: 17}, () => ({pressed: false, value: 0}))});
  const p1 = mk(0, "Xbox Wireless Controller");
  const p2 = mk(1, "8Bitdo SN30 Pro");
  if (now > 1 && Math.floor(now * 4) % 2 === 0) p2.buttons[1] = {pressed: true, value: 1}; // SNES A darts
  if (now > 2 && now < 2.6) p2.buttons[0] = {pressed: true, value: 1}; // SNES B lobs
  p1.axes[1] = now > 3 ? -0.3 : 0; // ease forward
  return [p1, p2];
}
const padsSource = shotMode ? () => shotPads(session.now) : realPads;

// ---------- menus ----------
const panels = {title: el("title"), pause: el("pause"), result: el("result")};
function paintTitle() {
  const map = el("map");
  map.innerHTML = "";
  for (const row of campaignRows(progress)) {
    const b = document.createElement("button");
    b.disabled = !row.open;
    b.innerHTML = `<span>${row.label}</span><span>▶</span>`;
    b.addEventListener("click", () => beginMission(row.id));
    map.append(b);
  }
  const stickers = progress.stickers.length ? `🏷 ${progress.stickers.length} stickers` : "🏷 no stickers yet";
  const opened = unlocked(progress).map((u) => u.name).join(" · ") || "earn stars to unlock paints";
  el("shelf").innerHTML = `<span>⭐ ${progress.totalStars}</span><span>${stickers}</span><span>🎁 ${opened}</span>`;
}
function beginMission(id) {
  resultApplied = false;
  startMission(session, id, session.now);
  tele?.activityStart?.(`toy-chopper-${id}`);
}
function actFor(act) {
  if (act === "resume") session.phase = "fly";
  else if (act === "restart") beginMission(session.missionId);
  else if (act === "again") beginMission(session.missionId);
  else if (act === "next") {
    const index = MISSIONS.findIndex((m) => m.id === session.missionId);
    const next = MISSIONS[index + 1];
    if (next && campaignRows(progress)[index + 1].open) beginMission(next.id);
    else { leaveToTitle(session); paintTitle(); }
  } else if (act === "map") { leaveToTitle(session); paintTitle(); }
}
for (const panel of [panels.pause, panels.result]) {
  panel.addEventListener("click", (event) => {
    const act = event.target.closest("button")?.dataset.act;
    if (act) actFor(act);
  });
}
const menuPad = createMenuPad({
  root: () => (session.phase === "title" ? panels.title
    : session.phase === "result" ? panels.result
    : session.phase === "pause" ? panels.pause : null),
  back: () => { if (session.phase === "pause") session.phase = "fly"; },
});

// ---------- juice plumbing ----------
function project(x, y, z, cam, half) {
  const v = new THREE.Vector3(x, y, z).project(cam);
  const w = overlay.width / 2;
  return {
    x: (half === "right" ? w : 0) + (v.x * 0.5 + 0.5) * w,
    y: (0.5 - v.y * 0.5) * overlay.height,
    behind: v.z > 1,
  };
}
function rumbleAll(pulse) {
  for (const pad of listPads(padsSource())) {
    pad?.vibrationActuator?.playEffect?.("dual-rumble", pulse);
  }
}
function spillPaint(x, z, big) {
  const paint = TOY_PALETTE.paint[Math.floor(Math.random() * TOY_PALETTE.paint.length)];
  const s = new THREE.Mesh(new THREE.CircleGeometry(big ? 2.6 : 1.4, 14), mat(paint));
  s.rotation.x = -Math.PI / 2;
  s.position.set(x, 0.04 + splats.length * 0.002, z);
  scene.add(s);
  splats.push({mesh: s, ttl: 9});
}
function onEvents() {
  for (const e of session.events) {
    if (e.type === "pop") {
      const p = project(e.x, e.y, e.z, camGunner, "right");
      addHit(juice, {big: e.big, sx: p.x / overlay.width, sy: p.y / overlay.height});
      spillPaint(e.x, e.z, e.big);
      playCue(e.big ? AUDIO_CUES.destroy : AUDIO_CUES.hit);
      rumbleAll(rumblePulse(e.big));
    } else if (e.type === "chip") {
      playCue(AUDIO_CUES.hit);
      rumbleAll(rumblePulse(false));
    } else if (e.type === "friendly-splat") {
      playCue(AUDIO_CUES.siren);
      rumbleAll(rumblePulse(false, true));
    } else if (e.type === "splash") {
      spillPaint(e.x, e.z, true);
      playCue(AUDIO_CUES.balloon);
    } else if (e.type === "dart-fire") playCue(AUDIO_CUES.gun);
    else if (e.type === "balloon-throw") playCue(AUDIO_CUES.balloon);
    else if (e.type === "wobble") rumbleAll(rumblePulse(true));
    else if (e.type === "mission-clear") onClear();
  }
}
function onClear() {
  confettiBurst(juice, 90, {x: 0.5, y: 0.35});
  playCue(AUDIO_CUES.destroy);
  if (!resultApplied && session.result) {
    resultApplied = true;
    const {stars, telemetry} = session.result;
    const applied = applyResult(progress, session.missionId, stars, telemetry);
    progress = applied.progress;
    saveProgress(globalThis.localStorage, progress);
    tele?.activityEnd?.({game: `toy-chopper-${session.missionId}`,
      score: telemetry.pops, total: telemetry.shots});
    const starRow = (who, n) => `<div class="row"><span>${who}</span><span class="stars">${"★".repeat(n)}${"☆".repeat(3 - n)}</span></div>`;
    el("result-stars").innerHTML = starRow("✈ Pilot", stars.pilot) + starRow("🎯 Gunner", stars.gunner)
      + `<div class="row"><span>accuracy ${Math.round(telemetry.accuracy * 100)}%</span><span>pops ${telemetry.pops}</span><span>medic runs ${telemetry.friendlySplats}</span></div>`;
    const news = [...applied.newStickers.map((s) => `🏷 ${s.name}`), ...applied.newUnlocks.map((u) => `🎁 ${u.name}`)];
    el("result-new").innerHTML = news.map((n) => `<span>${n}</span>`).join("") || "<span>⭐ collected</span>";
  }
}

// ---------- per-frame scene sync ----------
function syncToys() {
  const seen = new Set();
  for (const toy of session.mission?.toys ?? []) {
    seen.add(toy.id);
    let g = toyMeshes.get(toy.id);
    if (!g) {
      g = (TOY_BUILDERS[toy.type] ?? TOY_BUILDERS["warmup-balloon"])();
      toyMeshes.set(toy.id, g);
      scene.add(g);
    }
    g.position.set(toy.x, toy.y, toy.z);
    g.rotation.y = toy.heading;
    if (toy.state === "popped") {
      g.scale.multiplyScalar(0.7); // shrink away
      if (g.scale.x < 0.05) { scene.remove(g); toyMeshes.delete(toy.id); }
    } else if (toy.wobble > 0) {
      g.rotation.z = Math.sin(session.now * 30) * 0.12;
    } else g.rotation.z = 0;
    // Friendly down: classic plastic pose + the toy ambulance
    if (toy.type === "army-man") syncAmbulance(toy, g);
  }
  for (const [id, g] of toyMeshes) {
    if (!seen.has(id)) { scene.remove(g); toyMeshes.delete(id); }
  }
}
function syncAmbulance(toy, g) {
  const frame = friendlyDownFrame(toy, session.now);
  g.rotation.z = frame?.fallen || frame?.stretcher ? Math.PI / 2 : 0;
  let amb = ambulances.get(toy.id);
  if (frame && (frame.siren || frame.stretcher)) {
    if (!amb) { amb = makeAmbulance(); ambulances.set(toy.id, amb); scene.add(amb); }
    const spawn = session.mission.def.squad?.spawn ?? {x: 0, z: 0};
    const t = frame.travel;
    amb.position.set(spawn.x + (toy.x - spawn.x) * t, 0.3, spawn.z + (toy.z - spawn.z) * t);
    amb.rotation.y = Math.atan2(toy.x - spawn.x, toy.z - spawn.z) + (frame.phase === "trundle-home" ? Math.PI : 0);
    amb.rotation.z = frame.wobble ? Math.sin(session.now * 18) * 0.08 : 0; // wobbly wheels
    amb.getObjectByName("light").visible = frame.flash ? Math.floor(session.now * 6) % 2 === 0 : false;
  } else if (amb) {
    scene.remove(amb);
    ambulances.delete(toy.id);
  }
}
function syncShots() {
  const seen = new Set();
  for (const shot of session.shots) {
    seen.add(shot.id);
    let m = shotMeshes.get(shot.id);
    if (!m) {
      m = new THREE.Mesh(ball, mat(shot.weapon === "balloon" ? TOY_PALETTE.balloon : TOY_PALETTE.dart));
      m.scale.setScalar(shot.weapon === "balloon" ? 0.9 : 0.45);
      shotMeshes.set(shot.id, m);
      scene.add(m);
    }
    m.position.set(shot.x, shot.y, shot.z);
  }
  for (const [id, m] of shotMeshes) {
    if (!seen.has(id)) { scene.remove(m); shotMeshes.delete(id); }
  }
}
function syncChopper(dt) {
  const c = session.chopper;
  if (!c) { chopperMesh.visible = false; return; }
  chopperMesh.visible = true;
  chopperMesh.position.set(c.x, c.y, c.z);
  chopperMesh.rotation.set(c.pitch, c.heading, -c.bank, "YXZ");
  if (session.wobbleS > 0) chopperMesh.rotation.z += Math.sin(session.now * 25) * 0.1;
  const rotor = chopperMesh.getObjectByName("rotor");
  rotor.rotation.y += dt * (10 + c.lever * 25);
}

// ---------- cameras ----------
const chase = new THREE.Vector3();
function placeCameras(dt) {
  const c = session.chopper;
  if (!c) return;
  const back = 10, up = 4;
  const want = new THREE.Vector3(
    c.x - Math.sin(c.heading) * back, c.y + up, c.z - Math.cos(c.heading) * back);
  if (chase.lengthSq() === 0) chase.copy(want);
  chase.lerp(want, 1 - Math.exp(-3.5 * dt)); // smoothed for a TV
  camPilot.position.copy(chase);
  camPilot.lookAt(c.x, c.y + 1, c.z);
  // Door cam: mounted at the open starboard door, swings with the aim.
  const doorYaw = c.heading + Math.PI / 2;
  camGunner.position.set(c.x + Math.sin(doorYaw) * 1.5, c.y + 0.3, c.z + Math.cos(doorYaw) * 1.5);
  const aimYaw = c.heading + session.gunner.yaw;
  camGunner.rotation.set(0, 0, 0, "YXZ");
  camGunner.rotation.y = Math.PI + aimYaw; // three cameras look down -z
  camGunner.rotation.x = session.gunner.pitch;
  camGunner.rotation.z = -c.bank * 0.35; // feel the chopper motion
  camGunner.fov = 55 * (session.gunner.zoom ? AIM.zoomFov : 1);
  camGunner.updateProjectionMatrix();
}

// ---------- overlay ----------
function drawOverlay() {
  const w = overlay.width, h = overlay.height;
  octx.clearRect(0, 0, w, h);
  if (session.phase !== "fly" && session.phase !== "brief" && session.phase !== "result") return;
  const inFlight = session.phase === "fly" || session.phase === "brief";
  if (inFlight && session.split !== false) {
    octx.fillStyle = "#0008";
    octx.fillRect(w / 2 - 2, 0, 4, h);
  }
  if (inFlight) {
    // Gunner reticle (right half centre)
    const cx = w * 0.75, cy = h * 0.5;
    octx.strokeStyle = "#ffffffcc";
    octx.lineWidth = 2;
    octx.beginPath();
    octx.arc(cx, cy, session.gunner.zoom ? 26 : 16, 0, Math.PI * 2);
    octx.moveTo(cx - 26, cy); octx.lineTo(cx - 8, cy);
    octx.moveTo(cx + 8, cy); octx.lineTo(cx + 26, cy);
    octx.stroke();
    // Lock diamond in both halves
    if (session.lock) {
      for (const [cam, half] of [[camGunner, "right"], [camPilot, "left"]]) {
        const p = project(session.lock.x, session.lock.y, session.lock.z, cam, half);
        const inHalf = half === "right" ? p.x >= w / 2 : p.x < w / 2;
        if (p.behind || !inHalf) continue;
        octx.strokeStyle = half === "right" ? "#ffd34d" : "#5dde6a";
        octx.lineWidth = 2.5;
        octx.beginPath();
        octx.moveTo(p.x, p.y - 14); octx.lineTo(p.x + 14, p.y);
        octx.lineTo(p.x, p.y + 14); octx.lineTo(p.x - 14, p.y);
        octx.closePath();
        octx.stroke();
      }
    }
    // Balloon lob preview
    if (session.lobPreview) {
      octx.strokeStyle = TOY_PALETTE.balloon;
      octx.lineWidth = 3;
      octx.setLineDash([6, 8]);
      octx.beginPath();
      let started = false;
      for (const pt of session.lobPreview) {
        const p = project(pt.x, pt.y, pt.z, camGunner, "right");
        if (p.behind || p.x < w / 2) continue;
        if (!started) { octx.moveTo(p.x, p.y); started = true; }
        else octx.lineTo(p.x, p.y);
      }
      octx.stroke();
      octx.setLineDash([]);
    }
    // Pilot-heading arrow in the gunner's half
    const a = headingArrowAngle(session.gunner);
    octx.save();
    octx.translate(w * 0.75, h * 0.9);
    octx.rotate(a);
    octx.fillStyle = "#5dde6a";
    octx.beginPath();
    octx.moveTo(0, -16); octx.lineTo(10, 10); octx.lineTo(-10, 10);
    octx.closePath();
    octx.fill();
    octx.restore();
    // Hit markers
    for (const mark of juice.markers) {
      octx.strokeStyle = mark.friendly ? "#5dde6a" : mark.big ? "#ff4f8d" : "#ffd34d";
      octx.lineWidth = mark.big ? 4 : 2.5;
      const mx = mark.sx * w, my = mark.sy * h, r = (0.4 - mark.ttl) * 90 + 10;
      octx.beginPath();
      for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        octx.moveTo(mx + dx * r, my + dy * r);
        octx.lineTo(mx + dx * (r - 8), my + dy * (r - 8));
      }
      octx.stroke();
    }
  }
  // Confetti (result + big pops)
  for (const c of juice.confetti) {
    octx.save();
    octx.translate(c.x * w, (1 - c.y) * h);
    octx.rotate(c.spin);
    octx.fillStyle = `hsl(${c.hue} 90% 60%)`;
    octx.fillRect(-4, -2, 8, 4);
    octx.restore();
  }
}

// ---------- HUD DOM ----------
function syncDom() {
  panels.title.hidden = session.phase !== "title";
  panels.pause.hidden = session.phase !== "pause";
  panels.result.hidden = session.phase !== "result";
  const mission = session.mission;
  const chip = el("chip");
  if (mission && (session.phase === "fly" || session.phase === "brief")) {
    const left = mission.toys.filter((t) => t.team === "bad" && t.state === "alive").length;
    chip.textContent = session.phase === "brief"
      ? `🚁 ${mission.def.name} — ${mission.def.brief}`
      : `🎯 ${mission.def.name} · ${left} to splat · ⭐${mission.stats.pops}`;
    chip.hidden = false;
  } else chip.hidden = true;
  const caption = el("caption");
  const line = mission ? missionCaption(mission, session.now) : null;
  caption.hidden = !line;
  if (line) caption.textContent = line;
  el("seat1").hidden = session.phase === "title";
  el("seat2").hidden = session.phase === "title" || !session.split;
  const pads = listPads(padsSource());
  el("join").hidden = !(session.phase === "fly" && !session.split && pads.length >= 2);
  // Controller coach for an idle gunner
  const coach = el("coach");
  if (session.split && session.phase === "fly" && gunnerIdleS > 6) {
    if (coach.hidden) {
      const pad = pads.find((p) => p.index === session.p2Pad);
      coach.innerHTML = padSvg(padKind(pad?.id ?? ""), {}, {labels: false, glow: new Set(["stick", 0]), width: 240})
        + `<div class="hint">stick = aim · A = dart!</div>`;
      coach.hidden = false;
    }
  } else coach.hidden = true;
}

// ---------- resize + loop ----------
function resize() {
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 1.5);
  renderer?.setSize(innerWidth, innerHeight, false);
  overlay.width = innerWidth * dpr;
  overlay.height = innerHeight * dpr;
  overlay.style.width = `${innerWidth}px`;
  overlay.style.height = `${innerHeight}px`;
  // The overlay draws in device pixels throughout (project() returns them).
  const aspect = (innerWidth / 2) / innerHeight;
  camPilot.aspect = aspect;
  camGunner.aspect = aspect;
  camPilot.updateProjectionMatrix();
  camGunner.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

function renderSplit() {
  if (!renderer) return;
  const w = three.clientWidth * renderer.getPixelRatio();
  const h = three.clientHeight * renderer.getPixelRatio();
  renderer.setScissorTest(true);
  renderer.setViewport(0, 0, w / 2, h);
  renderer.setScissor(0, 0, w / 2, h);
  renderer.render(scene, camPilot);
  renderer.setViewport(w / 2, 0, w / 2, h);
  renderer.setScissor(w / 2, 0, w / 2, h);
  renderer.render(scene, camGunner);
}

paintTitle();
if (shotMode) {
  beginMission("balloon-fort");
  if (shotMode === "title") leaveToTitle(session);
  else { // straight into flight, gunner already aboard
    session.split = true;
    session.p2Pad = 1;
    session.phase = "fly";
    beginPlay(session.mission, session.now);
  }
}

let last = performance.now();
function frame(nowMs) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min(0.05, (nowMs - last) / 1000));
  last = nowMs;
  const pads = padsSource();
  const usedByMenu = menuPad(pads, nowMs);
  const scale = stepJuice(juice, dt); // hit-stop slows the world, never the UI
  if (!usedByMenu || session.phase === "fly") {
    stepCoop(session, {dt: dt * scale, pads, now: session.now + dt * scale});
    onEvents();
  }
  const p2 = listPads(pads).find((p) => p.index === session.p2Pad);
  const touched = p2?.buttons?.some((b) => (b?.value ?? 0) > 0.3) || Math.abs(p2?.axes?.[0] ?? 0) > 0.3 || Math.abs(p2?.axes?.[1] ?? 0) > 0.3;
  gunnerIdleS = touched ? 0 : gunnerIdleS + dt;
  for (let i = splats.length - 1; i >= 0; i -= 1) {
    splats[i].ttl -= dt;
    if (splats[i].ttl <= 0) { scene.remove(splats[i].mesh); splats.splice(i, 1); }
  }
  syncToys();
  syncShots();
  syncChopper(dt);
  placeCameras(dt);
  renderSplit();
  drawOverlay();
  syncDom();
  if (shotMode) globalThis.__shotReady = session.now > 6;
}
requestAnimationFrame(frame);
