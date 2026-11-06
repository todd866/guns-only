// TOY GUNSHIP: view + wiring. All game rules live in the pure modules (orbit,
// tv_cam, gunship_targets, gunship_mission, gunship_session); this file only
// renders the night backyard split screen, the toy-camera overlay and the
// menus, and forwards the pads. Rewards land in the toy-chopper campaign.

import * as THREE from "../vendor/three.module.js";
import {AUDIO_CUES, TOY_PALETTE} from "../render/toy/toy_pass.js";
import {createMenuPad} from "../rc/gamepad-menu.mjs";
import {padKind, padSvg} from "../rc/pad-art.mjs";
import {createRCTelemetry} from "../rc/telemetry.mjs";
import {listPads} from "../render/split/pad_flight.mjs";
import {applyResult, loadProgress, saveProgress, unlocked} from "../toy-chopper/campaign.mjs";
import {addHit, confettiBurst, createJuice, rumblePulse, stepJuice} from "../toy-chopper/juice.mjs";
import {CRATE, searchlightAim, SEARCHLIGHT} from "./orbit.mjs";
import {GUNS, ZOOMS, zoomMag} from "./tv_cam.mjs";
import {BOSS, friendlyDownFrame, toyWindow} from "./gunship_targets.mjs";
import {GUNSHIP_MISSION, SQUAD, YARD, beginPlay, missionCaption} from "./gunship_mission.mjs";
import {WASHOUT_S, createGunshipSession, leaveToTitle, startGunship, stepGunship} from "./gunship_session.mjs";

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

// ---------- the night backyard ----------
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({canvas: three, antialias: false, powerPreference: "high-performance"});
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5));
} catch {
  three.hidden = true; // no WebGL: menus and overlay still work
}
const night = theme === "light"; // "light" theme = dusk, still a night mission
const scene = new THREE.Scene();
scene.background = new THREE.Color(night ? "#223154" : "#0a1124");
scene.fog = new THREE.Fog(scene.background, 70, 170);
scene.add(new THREE.AmbientLight(0xbdd0ff, night ? 0.55 : 0.34));
const moon = new THREE.DirectionalLight(0xaec4ff, night ? 0.7 : 0.55);
moon.position.set(-20, 60, -30);
scene.add(moon);
const windowGlow = new THREE.PointLight(0xffd9a0, 1.2, 60);
windowGlow.position.set(SEARCHLIGHT.window.x, SEARCHLIGHT.window.y, SEARCHLIGHT.window.z);
scene.add(windowGlow);

const camPilot = new THREE.PerspectiveCamera(60, 1, 0.1, 260);
const camGunner = new THREE.PerspectiveCamera(50, 1, 0.1, 260);

const box = new THREE.BoxGeometry(1, 1, 1);
const ball = new THREE.SphereGeometry(0.5, 10, 8);
const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const cone = new THREE.ConeGeometry(0.5, 1, 10);
const mats = new Map();
const mat = (hex) => {
  if (!mats.has(hex)) mats.set(hex, new THREE.MeshLambertMaterial({color: hex}));
  return mats.get(hex);
};
function tint(geo, color, s = 1, x = 0, y = 0, opt = {}) {
  const m = new THREE.Mesh(geo, mat(color));
  m.scale.set(opt.sx ?? s, opt.sy ?? s, opt.sz ?? s);
  m.position.set(x, y, opt.z ?? 0);
  return m;
}
function stack(meshes) {
  const g = new THREE.Group();
  for (const m of meshes) g.add(m);
  return g;
}

// Lawn + the landmarks the squad marches past.
const lawn = new THREE.Mesh(new THREE.CircleGeometry(95, 44), mat(night ? "#24502e" : "#16331e"));
lawn.rotation.x = -Math.PI / 2;
scene.add(lawn);
function landmark(group, at) {
  group.position.set(at.x, 0, at.z);
  scene.add(group);
  return group;
}
const sandpit = new THREE.Mesh(new THREE.CircleGeometry(8, 20), mat("#cbb27a"));
sandpit.rotation.x = -Math.PI / 2;
sandpit.position.set(YARD.sandpit.x, 0.03, YARD.sandpit.z);
scene.add(sandpit);
landmark(stack([
  tint(cyl, "#16181b", 1, 0, 1.6, {sx: 7, sz: 7, sy: 0.3}),               // trampoline bed
  tint(cyl, "#4a5568", 0.3, 5, 0.8, {sy: 1.6}), tint(cyl, "#4a5568", 0.3, -5, 0.8, {sy: 1.6}),
  tint(cyl, "#4a5568", 0.3, 0, 0.8, {sy: 1.6, z: 5}), tint(cyl, "#4a5568", 0.3, 0, 0.8, {sy: 1.6, z: -5}),
]), YARD.trampoline);
landmark(stack([
  tint(box, "#8a5a2b", 3, 0, 1.4), tint(cone, "#6e4620", 1.4, 0, 3.4, {sx: 3.4, sz: 3.4}),
]), YARD.kennel);
landmark(stack([
  tint(cyl, "#6e4620", 1.6, 0, 2.6, {sy: 5.2}),                           // trunk
  tint(box, "#8a5a2b", 5, 0, 6, {sy: 2.4}),                               // house
  tint(ball, "#2d6b38", 5.5, 0, 9.5),                                     // canopy
]), YARD.treehouse);
const pool = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 1, 20), mat("#3aa0ff"));
pool.position.set(YARD.pool.x, 0.5, YARD.pool.z);
scene.add(pool);
for (let i = 0; i < 26; i += 1) { // the fence
  const a = (i / 26) * Math.PI * 2;
  scene.add(tint(box, "#5b4632", 0.5, Math.sin(a) * 44, 1.2, {sy: 2.4, z: Math.cos(a) * 44}));
}
// The house corner with the glowing bedroom window (searchlight source).
const house = stack([
  tint(box, "#3c4458", 10, 0, 5, {sy: 10, sz: 8}),
  tint(box, "#ffd9a0", 2.6, 0, 8, {sz: 0.3, z: 4.1}),
]);
landmark(house, {x: SEARCHLIGHT.window.x, z: SEARCHLIGHT.window.z - 4});
// Searchlight beam: a long cone from the window plus a pool of light on the sky band.
const beam = new THREE.Mesh(new THREE.ConeGeometry(7, 40, 16, 1, true),
  new THREE.MeshBasicMaterial({color: 0xfff2c0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false}));
scene.add(beam);

// The chunky toy cargo plane.
function makePlane() {
  const g = new THREE.Group();
  g.add(tint(box, "#3cbf45", 2.2, 0, 0, {sz: 6}));                        // fat fuselage
  g.add(tint(box, "#2f9e3a", 0.8, 0, 0.4, {sx: 9, sz: 1.8}));             // big wing
  g.add(tint(box, "#2f9e3a", 0.5, 0, 1.2, {sx: 3, z: -2.9}));             // tail
  for (const side of [-2.6, 2.6]) {
    g.add(tint(box, "#245c30", 0.7, side, 0.1, {sz: 1.4}));
    const prop = tint(box, "#ffd34d", 0.1, side, 0.1, {sx: 1.8, sy: 1.8, z: 0.8});
    prop.name = `prop${side}`;
    g.add(prop);
  }
  g.add(tint(ball, "#ffd34d", 0.8, 0, -0.8, {z: 1.6}));                   // toy camera turret
  return g;
}
const planeMesh = makePlane();
scene.add(planeMesh);

// ---------- toy builders: every bad guy reads at a glance ----------
const TOY_BUILDERS = {
  "balloon-tower": () => stack([tint(ball, TOY_PALETTE.balloon, 2.2, 0, 2.4), tint(ball, "#3aa0ff", 2, 0, 0.8)]),
  "sandcastle": () => stack([tint(cone, "#cbb27a", 2.4, 0, 1.2), tint(cone, "#cbb27a", 1.2, 1.2, 0.8), tint(cone, "#cbb27a", 1.2, -1.2, 0.8)]),
  "wind-up-tank": () => stack([tint(box, "#c45a3a", 2.2, 0, 0.7), tint(box, TOY_PALETTE.brass, 0.5, 0, 1.6), tint(cyl, "#8c3a24", 0.4, 0, 1.1, {sy: 0.4, z: 1.4})]),
  "wind-up-robot": () => stack([tint(box, "#9aa7b8", 1.4, 0, 1.2, {sy: 2}), tint(ball, "#e23b3b", 0.3, 0.3, 2, {z: 0.6}), tint(ball, "#e23b3b", 0.3, -0.3, 2, {z: 0.6}), tint(box, TOY_PALETTE.brass, 0.5, 0, 1.4, {z: -0.9})]),
  "jack-in-the-box": () => {
    const g = stack([tint(box, "#f0c43a", 1.8, 0, 0.9)]);
    const head = tint(ball, "#c06bff", 1, 0, 2.2);
    head.name = "head";
    g.add(head);
    return g;
  },
  "rubber-band-sniper": () => stack([tint(box, "#4a6e8c", 0.8, 0, 1, {sy: 2}), tint(box, "#d8cdb6", 0.3, 0, 1.8, {sx: 1.6})]),
  "evil-teddy": () => stack([tint(ball, "#8d4a3a", 2.2, 0, 1.1), tint(ball, "#8d4a3a", 0.8, 0.8, 2.2), tint(ball, "#8d4a3a", 0.8, -0.8, 2.2), tint(box, "#16181b", 0.3, 0, 1.4, {sx: 1, z: 1})]),
  "plastic-dinosaur": () => stack([tint(box, "#3f8f4a", 1.6, 0, 1, {sz: 3.4}), tint(box, "#3f8f4a", 1, 0, 2, {z: 1.6}), tint(box, "#d8f5a0", 1, 0, 0.8, {sz: 2, sy: 0.4})]),
  "rc-car": () => stack([tint(box, "#e23b3b", 1.6, 0, 0.5, {sz: 2.6, sy: 0.6}), tint(cyl, "#16181b", 0.6, 0.9, 0.3, {sy: 0.3}), tint(cyl, "#16181b", 0.6, -0.9, 0.3, {sy: 0.3}), tint(box, "#d0d6de", 0.08, 0.6, 1.4, {sy: 1.6})]),
  "tin-soldier": () => stack([tint(cyl, "#b4232c", 0.9, 0, 1, {sy: 2}), tint(ball, "#e8bb8f", 0.7, 0, 2.3), tint(cyl, "#16181b", 0.7, 0, 3, {sy: 1})]),
  "spinning-top": () => stack([tint(cone, "#3aa0ff", 2, 0, 1, {sy: -2}), tint(ball, "#ffd34d", 0.5, 0, 2.1)]),
  "pool-dinosaur": () => {
    const g = stack([
      tint(ball, "#5dde6a", 7, 0, 3),                                     // inflatable body
      tint(ball, "#5dde6a", 4, 0, 7.5, {z: 3}),                           // neck
      tint(ball, "#5dde6a", 3, 0, 10, {z: 5}),                            // grinning head
      tint(ball, "#16181b", 0.5, 1, 10.5, {z: 6.6}), tint(ball, "#16181b", 0.5, -1, 10.5, {z: 6.6}),
    ]);
    g.name = "boss";
    return g;
  },
  "army-man": () => stack([tint(cyl, TOY_PALETTE.armyGreen, 1, 0, 0.7, {sy: 1.4}), tint(ball, TOY_PALETTE.armyGreen, 0.7, 0, 1.6), tint(box, TOY_PALETTE.armyGreen, 0.2, 0.5, 1.1, {sx: 1})]),
};
function makeAmbulance() {
  const g = new THREE.Group();
  g.add(tint(box, TOY_PALETTE.ambulance, 1.6, 0, 0.7, {sz: 2.6}));
  g.add(tint(box, TOY_PALETTE.ambulanceCross, 0.5, 0, 1.2, {sz: 0.14}));
  const light = tint(ball, TOY_PALETTE.ambulanceCross, 0.4, 0, 1.7);
  light.name = "light";
  g.add(light);
  return g;
}

const toyMeshes = new Map();   // toy.id -> group
const crateMeshes = new Map(); // crate.id -> group
const splats = [];             // {mesh, ttl}
const ambulances = new Map();  // toy.id -> group

// ---------- state ----------
const session = createGunshipSession();
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
  if (now > 2.5 && now < 3.1) p2.buttons[0] = {pressed: true, value: 1}; // SNES B balloon
  p2.axes[0] = now > 1.5 ? -0.5 : 0; // sweep the camera toward the sandpit
  p2.axes[1] = now > 1.5 ? 0.4 : 0;
  if (now > 3 && now < 3.2) p1.buttons[0] = {pressed: true, value: 1};  // crate away
  return [p1, p2];
}
const padsSource = shotMode ? () => shotPads(session.now) : realPads;

// ---------- menus ----------
const panels = {title: el("title"), pause: el("pause"), result: el("result")};
function paintTitle() {
  const map = el("map");
  map.innerHTML = "";
  const entry = progress.stars[GUNSHIP_MISSION.id] ?? {pilot: 0, gunner: 0};
  const b = document.createElement("button");
  b.innerHTML = `<span>${GUNSHIP_MISSION.name} · ✈${"★".repeat(entry.pilot).padEnd(3, "☆")} ⌖${"★".repeat(entry.gunner).padEnd(3, "☆")}</span><span>▶</span>`;
  b.addEventListener("click", beginWatch);
  map.append(b);
  const stickers = progress.stickers.length ? `🏷 ${progress.stickers.length} stickers` : "🏷 no stickers yet";
  const opened = unlocked(progress).map((u) => u.name).join(" · ") || "earn stars to unlock paints";
  el("shelf").innerHTML = `<span>⭐ ${progress.totalStars}</span><span>${stickers}</span><span>🎁 ${opened}</span>`;
}
function beginWatch() {
  resultApplied = false;
  startGunship(session, session.now);
  tele?.activityStart?.("toy-gunship");
}
function actFor(act) {
  if (act === "resume") session.phase = "fly";
  else if (act === "restart" || act === "again") beginWatch();
  else if (act === "map") { leaveToTitle(session); paintTitle(); }
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
  const s = new THREE.Mesh(new THREE.CircleGeometry(big ? 2.8 : 1.4, 14), mat(paint));
  s.rotation.x = -Math.PI / 2;
  s.position.set(x, 0.04 + splats.length * 0.002, z);
  scene.add(s);
  splats.push({mesh: s, ttl: 10});
}
function onEvents() {
  for (const e of session.events) {
    if (e.type === "pop") {
      const p = project(e.x, 0.8, e.z, camGunner, "right");
      addHit(juice, {big: e.big, sx: p.x / overlay.width, sy: p.y / overlay.height});
      spillPaint(e.x, e.z, e.big);
      playCue(e.big ? AUDIO_CUES.destroy : AUDIO_CUES.hit);
      rumbleAll(rumblePulse(e.big));
      if (e.boss) confettiBurst(juice, 120, {x: 0.75, y: 0.5});
    } else if (e.type === "chip" || e.type === "deflect") {
      playCue(e.type === "chip" ? AUDIO_CUES.hit : AUDIO_CUES.bonk);
      if (e.type === "chip") rumbleAll(rumblePulse(false));
    } else if (e.type === "friendly-splat") {
      playCue(AUDIO_CUES.siren);
      rumbleAll(rumblePulse(false, true));
    } else if (e.type === "splash") {
      spillPaint(e.x, e.z, true);
      playCue(AUDIO_CUES.balloon);
    } else if (e.type === "confetti-pop") {
      const p = project(e.x, 0.5, e.z, camGunner, "right");
      confettiBurst(juice, 70, {x: p.x / overlay.width, y: 1 - p.y / overlay.height});
      addHit(juice, {big: true, sx: p.x / overlay.width, sy: p.y / overlay.height});
      playCue(AUDIO_CUES.destroy);
      rumbleAll(rumblePulse(true));
    } else if (e.type === "boss-phase" || e.type === "boss-rise") {
      rumbleAll(rumblePulse(true));
      playCue(AUDIO_CUES.destroy);
    } else if (e.type === "dart-fire") playCue(AUDIO_CUES.gun);
    else if (e.type === "balloon-drop") playCue(AUDIO_CUES.balloon);
    else if (e.type === "confetti-fire") playCue(AUDIO_CUES.missile);
    else if (e.type === "crate-away") playCue(AUDIO_CUES.bonk);
    else if (e.type === "crate-on-target") playCue(AUDIO_CUES.destroy);
    else if (e.type === "spotted") rumbleAll(rumblePulse(true));
    else if (e.type === "mission-clear") onClear();
  }
}
function onClear() {
  confettiBurst(juice, 110, {x: 0.5, y: 0.35});
  playCue(AUDIO_CUES.destroy);
  if (!resultApplied && session.result) {
    resultApplied = true;
    const {stars, telemetry} = session.result;
    const applied = applyResult(progress, GUNSHIP_MISSION.id, stars, telemetry);
    progress = applied.progress;
    saveProgress(globalThis.localStorage, progress);
    tele?.activityEnd?.({game: "toy-gunship", score: telemetry.pops, total: telemetry.shots});
    const starRow = (who, n) => `<div class="row"><span>${who}</span><span class="stars">${"★".repeat(n)}${"☆".repeat(3 - n)}</span></div>`;
    el("result-stars").innerHTML = starRow("✈ Pilot", stars.pilot) + starRow("⌖ Gunner", stars.gunner)
      + `<div class="row"><span>accuracy ${Math.round(telemetry.accuracy * 100)}%</span><span>pops ${telemetry.pops}</span><span>medic runs ${telemetry.friendlySplats}</span><span>crates ${telemetry.cratesOnTarget}/${telemetry.crates}</span></div>`;
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
      g = (TOY_BUILDERS[toy.type] ?? TOY_BUILDERS["balloon-tower"])();
      toyMeshes.set(toy.id, g);
      scene.add(g);
    }
    g.position.set(toy.x, toy.y, toy.z);
    g.rotation.y = toy.heading;
    if (toy.state === "popped") {
      g.scale.multiplyScalar(0.72); // shrink away
      if (g.scale.x < 0.05) { scene.remove(g); toyMeshes.delete(toy.id); }
      continue;
    }
    g.rotation.z = toy.wobble > 0 ? Math.sin(session.now * 30) * 0.12 : 0;
    if (toy.type === "jack-in-the-box") {
      const head = g.getObjectByName("head");
      head.position.y = toyWindow(toy) === "up" ? 2.6 : 1.1;
      head.visible = toyWindow(toy) === "up";
    } else if (toy.type === "spinning-top") {
      g.rotation.y = session.now * (toyWindow(toy) === "wobble" ? 4 : 22);
      g.rotation.z = toyWindow(toy) === "wobble" ? Math.sin(session.now * 9) * 0.3 : 0;
    } else if (toy.type === "plastic-dinosaur" && toyWindow(toy) === "mouth-open") {
      g.rotation.x = -0.15; // rears back, mouth open
    } else if (toy.type === "pool-dinosaur") {
      const rise = Math.min(1, (session.now - toy.spawnedAt) / BOSS.riseS);
      const inflate = 0.55 + 0.45 * (toy.hp / toy.maxHp);
      g.scale.setScalar(rise * inflate);
      g.position.y = -6 * (1 - rise);
    } else if (toy.type === "army-man") {
      syncAmbulance(toy, g);
    }
  }
  for (const [id, g] of toyMeshes) {
    if (!seen.has(id)) { scene.remove(g); toyMeshes.delete(id); }
  }
}
function syncAmbulance(toy, g) {
  const frame = friendlyDownFrame(toy, session.now);
  g.rotation.z = frame?.fallen || frame?.stretcher ? Math.PI / 2 : 0; // the classic plastic pose
  let amb = ambulances.get(toy.id);
  if (frame && (frame.siren || frame.stretcher)) {
    if (!amb) { amb = makeAmbulance(); ambulances.set(toy.id, amb); scene.add(amb); }
    const spawn = SQUAD.spawn;
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
function syncCrates() {
  const seen = new Set();
  for (const crate of session.crates) {
    seen.add(crate.id);
    let g = crateMeshes.get(crate.id);
    if (!g) {
      g = stack([tint(box, "#c4a574", 1.4, 0, 0), tint(cone, "#f4f7fb", 2.2, 0, 2.2, {sx: 3, sz: 3})]);
      g.children[1].name = "chute";
      crateMeshes.set(crate.id, g);
      scene.add(g);
    }
    g.position.set(crate.x, crate.y, crate.z);
    g.getObjectByName("chute").visible = !crate.landed;
  }
  for (const [id, g] of crateMeshes) {
    if (!seen.has(id)) { scene.remove(g); crateMeshes.delete(id); }
  }
}
function syncPlane(dt) {
  if (!session.pose || session.phase === "title") { planeMesh.visible = false; beam.visible = false; return; }
  planeMesh.visible = true;
  const p = session.pose;
  planeMesh.position.set(p.x, p.y, p.z);
  planeMesh.rotation.set(0, p.heading, p.bank, "YXZ");
  if (session.wobbleS > 0) planeMesh.rotation.z += Math.sin(session.now * 25) * 0.1;
  for (const side of [-2.6, 2.6]) {
    planeMesh.getObjectByName(`prop${side}`).rotation.z += dt * (14 + session.orbit.speed * 40);
  }
  // Searchlight: cone from the window toward its sweep point on the sky band.
  beam.visible = true;
  const aim = searchlightAim(session.now);
  const from = SEARCHLIGHT.window;
  const to = new THREE.Vector3(aim.x, session.orbit.alt, aim.z);
  const origin = new THREE.Vector3(from.x, from.y, from.z);
  const mid = origin.clone().lerp(to, 0.5);
  beam.position.copy(mid);
  beam.scale.set(1, origin.distanceTo(to) / 40, 1);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(origin).normalize());
  beam.material.opacity = session.light.caught ? 0.34 : 0.16;
}

// ---------- cameras ----------
const chase = new THREE.Vector3();
function placeCameras(dt) {
  const p = session.pose;
  if (!p) return;
  const back = 13, up = 5;
  const want = new THREE.Vector3(
    p.x - Math.sin(p.heading) * back, p.y + up, p.z - Math.cos(p.heading) * back);
  if (chase.lengthSq() === 0) chase.copy(want);
  chase.lerp(want, 1 - Math.exp(-3.5 * dt)); // smoothed for a TV
  camPilot.position.copy(chase);
  camPilot.lookAt(p.x, p.y, p.z);
  // Toy camera: straight down over the aim point; zoom = height.
  const mag = zoomMag(session.cam);
  camGunner.position.set(session.cam.x, 64 / mag, session.cam.z);
  camGunner.up.set(0, 0, 1); // screen-up is north, matching the gunner's stick
  camGunner.lookAt(session.cam.x, 0, session.cam.z);
}

// ---------- overlay: the toy-camera look, readouts, juice ----------
function rightFrame(w, h) {
  // High-contrast toy-camera dressing: navy wash, thick frame, corner brackets.
  octx.fillStyle = session.cam.washoutS > 0
    ? `rgba(255, 244, 214, ${0.55 * session.cam.washoutS / WASHOUT_S})`
    : "rgba(10, 16, 38, 0.18)";
  octx.fillRect(w / 2, 0, w / 2, h);
  octx.strokeStyle = "#dfe9ff";
  octx.lineWidth = 6;
  octx.strokeRect(w / 2 + 8, 8, w / 2 - 16, h - 16);
  const cx = w * 0.75, cy = h * 0.5;
  // Chunky crosshair.
  octx.strokeStyle = "#ffffff";
  octx.lineWidth = 5;
  octx.beginPath();
  octx.arc(cx, cy, 34, 0, Math.PI * 2);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    octx.moveTo(cx + dx * 44, cy + dy * 44);
    octx.lineTo(cx + dx * 70, cy + dy * 70);
  }
  octx.stroke();
  octx.fillStyle = "#ffffff";
  octx.fillRect(cx - 3, cy - 3, 6, 6);
}
function markToys(w, h) {
  // Friend/foe marking the camera can't miss: green rings, amber diamonds.
  for (const toy of session.mission?.toys ?? []) {
    if (toy.state === "popped") continue;
    const p = project(toy.x, 0.5, toy.z, camGunner, "right");
    if (p.behind || p.x < w / 2 + 14 || p.x > w - 14 || p.y < 14 || p.y > h - 14) continue;
    if (toy.team === "good") {
      octx.strokeStyle = "#5dde6a";
      octx.lineWidth = 3.5;
      octx.beginPath();
      octx.arc(p.x, p.y, toy.state === "splatted" ? 9 : 13, 0, Math.PI * 2);
      octx.stroke();
    } else {
      const r = toy.type === "pool-dinosaur" ? 30 : 11;
      octx.strokeStyle = toy.invulnS > 0 ? "#93a7c4" : "#ffb64d";
      octx.lineWidth = 3.5;
      octx.beginPath();
      octx.moveTo(p.x, p.y - r); octx.lineTo(p.x + r, p.y);
      octx.lineTo(p.x, p.y + r); octx.lineTo(p.x - r, p.y);
      octx.closePath();
      octx.stroke();
    }
  }
  // Lock diamond (bright) in both halves.
  if (session.lock) {
    for (const [cam, half] of [[camGunner, "right"], [camPilot, "left"]]) {
      const p = project(session.lock.x, 0.5, session.lock.z, cam, half);
      const inHalf = half === "right" ? p.x >= w / 2 : p.x < w / 2;
      if (p.behind || !inHalf) continue;
      octx.strokeStyle = "#ffd34d";
      octx.lineWidth = 4;
      octx.beginPath();
      octx.moveTo(p.x, p.y - 17); octx.lineTo(p.x + 17, p.y);
      octx.lineTo(p.x, p.y + 17); octx.lineTo(p.x - 17, p.y);
      octx.closePath();
      octx.stroke();
    }
  }
  // Inbound rounds: a tightening ring where each one will land.
  for (const round of session.rounds) {
    const p = project(round.x, 0.1, round.z, camGunner, "right");
    if (p.behind || p.x < w / 2) continue;
    const gun = GUNS[round.gun];
    const frac = Math.max(0, (round.impactAt - session.now) / (gun.delayS || 0.1));
    octx.strokeStyle = round.gun === "balloon" ? TOY_PALETTE.balloon : round.gun === "confetti" ? "#c06bff" : TOY_PALETTE.dart;
    octx.lineWidth = 3;
    octx.setLineDash([6, 6]);
    octx.beginPath();
    octx.arc(p.x, p.y, 10 + frac * 26, 0, Math.PI * 2);
    octx.stroke();
    octx.setLineDash([]);
  }
}
function drawReadouts(w, h, dpr) {
  // Instrument rows, one per fact, symbol + gauge + value + the word.
  const row = (x, y, text, color = "#dfe9ff") => {
    octx.fillStyle = color;
    octx.fillText(text, x, y);
  };
  const gauge = (x, y, frac, color) => {
    octx.fillStyle = "#2a3a5c";
    octx.fillRect(x, y - 8 * dpr, 52 * dpr, 9 * dpr);
    octx.fillStyle = color;
    octx.fillRect(x, y - 8 * dpr, 52 * dpr * Math.max(0, Math.min(1, frac)), 9 * dpr);
  };
  octx.font = `700 ${13 * dpr}px ui-monospace, Menlo, monospace`;
  octx.textAlign = "left";
  // Gunner block, top-right of the toy camera.
  const gx = w - 196 * dpr;
  let gy = 34 * dpr;
  const lh = 20 * dpr;
  row(gx, gy, `⌖ ZOOM ${ZOOMS[session.cam.zoom].label}`); gy += lh;
  const gunRow = (sym, id, label) => {
    const cool = session.cam.cool[id];
    const frac = 1 - cool / GUNS[id].cooldownS;
    gauge(gx + 14 * dpr, gy, frac, cool > 0 ? "#ffb64d" : "#5dde6a");
    row(gx, gy, sym);
    row(gx + 72 * dpr, gy, cool > 0 ? `${label} ${cool.toFixed(1)}s` : `${label} ready`,
      cool > 0 ? "#93a7c4" : "#dfe9ff");
    gy += lh;
  };
  gunRow("▸", "dart", "DART");
  gunRow("◍", "balloon", "BLLN");
  gunRow("✦", "confetti", "CNFT");
  // Pilot block, bottom-left of the chase view.
  const px = 16 * dpr;
  let py = h - 76 * dpr;
  row(px, py, `◌ ORBIT ${session.orbit.radius.toFixed(0)} m`); py += lh;
  row(px, py, `⬍ ALT ${session.orbit.alt.toFixed(0)} m`); py += lh;
  gauge(px + 150 * dpr, py, session.orbit.speed / 0.45, "#5dde6a");
  row(px, py, `➤ SPEED`); py += lh;
  const crateCool = Math.max(0, CRATE.cooldownS - (session.now - session.lastDropAt));
  gauge(px + 150 * dpr, py, 1 - crateCool / CRATE.cooldownS, crateCool > 0 ? "#ffb64d" : "#5dde6a");
  row(px, py, crateCool > 0 ? `▣ CRATE ${crateCool.toFixed(1)}s` : "▣ CRATE ready");
  // Spotted warning, by colour and position over the pilot half.
  if (session.light.caught) {
    octx.textAlign = "center";
    octx.fillStyle = "#ffd34d";
    octx.font = `800 ${16 * dpr}px system-ui`;
    octx.fillText("☀ SPOTTED — break orbit", w * 0.25, 40 * dpr);
    octx.textAlign = "left";
  }
}
function drawOverlay(dpr) {
  const w = overlay.width, h = overlay.height;
  octx.clearRect(0, 0, w, h);
  const inFlight = session.phase === "fly" || session.phase === "brief" || session.phase === "pause";
  if (inFlight) {
    rightFrame(w, h);
    markToys(w, h);
    drawReadouts(w, h, dpr);
    octx.fillStyle = "#05070f";
    octx.fillRect(w / 2 - 3, 0, 6, h);
    // Hit markers.
    for (const mark of juice.markers) {
      octx.strokeStyle = mark.friendly ? "#5dde6a" : mark.big ? "#ff4f8d" : "#ffd34d";
      octx.lineWidth = mark.big ? 5 : 3;
      const mx = mark.sx * w, my = mark.sy * h, r = (0.4 - mark.ttl) * 90 + 10;
      octx.beginPath();
      for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        octx.moveTo(mx + dx * r, my + dy * r);
        octx.lineTo(mx + dx * (r - 8), my + dy * (r - 8));
      }
      octx.stroke();
    }
  }
  // Confetti (big pops + the clear).
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
    const left = mission.toys.filter((t) => t.team === "bad" && !t.prop && t.state === "alive").length;
    chip.textContent = session.phase === "brief"
      ? `🛩 ${mission.def.name} — ${mission.def.brief}`
      : `⌖ ${mission.def.name} · ${left} to splat · ⭐${mission.stats.pops}`;
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
  // Controller coach for an idle gunner.
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
let dpr = 1;
function resize() {
  dpr = Math.min(globalThis.devicePixelRatio || 1, 1.5);
  renderer?.setSize(innerWidth, innerHeight, false);
  overlay.width = innerWidth * dpr;
  overlay.height = innerHeight * dpr;
  overlay.style.width = `${innerWidth}px`;
  overlay.style.height = `${innerHeight}px`;
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
  beginWatch();
  if (shotMode === "title") leaveToTitle(session);
  else { // straight into the watch, gunner already aboard
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
    stepGunship(session, {dt: dt * scale, pads, now: session.now + dt * scale});
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
  syncCrates();
  syncPlane(dt);
  placeCameras(dt);
  renderSplit();
  drawOverlay(dpr);
  syncDom();
  if (shotMode) globalThis.__shotReady = session.now > 6;
}
requestAnimationFrame(frame);
