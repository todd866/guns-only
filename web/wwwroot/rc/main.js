import {NY, NY_PARK, bridgeLocal, bridgeWorld} from './open-world/under-bridge.mjs';
import {BOARDWALK, BOARDWALK_PARK, boardwalkLocal, boardwalkWorld} from './open-world/boardwalk.mjs';
import {protectGameControls} from './control-surfaces.mjs';
protectGameControls();
import {fetchAssetBuffer} from './asset-buffer.mjs';
import {bindRCTouchControls} from './touch-controls.mjs';
import {pumpkinRewards} from './livery-data.mjs';
import {trickSize} from './open-world/trick-or-treat.mjs';
import {
  HOLES as CLUB_HOLES,
  CLUB as CLUB_SITE,
  lieAt,
  pickClub,
  strike,
  stepBall,
  createRound,
  holeOf,
  toPin,
  holed,
  finishHole,
  pickUp,
  total as roundTotal,
  parTo
} from './open-world/country-club.mjs';
import {swingPowerOf} from './open-world/golf-swing.mjs';
import {
  approachLane,
  rollBowling,
  scoreFrames,
  frameMarks,
  switchBowlingLane
} from './open-world/bowling.mjs';
import {
  HOT_WHEELS,
  boost as hwBoost,
  boosterPoints,
  guideCar,
  loopEntry,
  stepLoop
} from './open-world/hot-wheels.mjs';
import {createRetreat, stepRetreat, RETREAT} from './physics/retreat.mjs';
import {DRIVE_KEYS, drivingInput, flightInput, trickInput} from './driving-input.mjs';
import {createFlight, toggleFlight, FLIGHT} from './physics/flight.mjs';
import {SCHOOL} from './open-world/flying-school.mjs';
import {SKY_STEER_HINT, skyLandingText, skyDiveCamera} from './open-world/sky-dive.mjs';
import {createSkyDiveReport} from './open-world/sky-dive.js';
import {TENNIS, onTennisCourt, tennisStart, tennisAssist} from './open-world/tennis.mjs';
import {STUNT_JUMPS} from './open-world/stunt-jumps.mjs';
import {DELIVERY} from './open-world/deliveries.mjs';
import {CLOUDS} from './open-world/clouds.mjs';
import {applyLivery} from './livery.js';
import {batchCarParts, unbatchCarParts} from './car-batch.js';
import {createRobot, stepRobot} from './physics/robot.mjs';
import {COMBAT} from './physics/combat.mjs';
import {makeRobotBody, poseRobotBody, makeBoardRider, poseBoardRider} from './robot-body.js';
import {
  makeToyDino,
  poseToyDino,
  makeToyCowboy,
  poseToyCowboy,
  rideRiggedDino,
  poseRiggedDino,
  tintDino,
  wildDino
} from './toy-western-bodies.js';
import {
  loadHerd,
  befriend,
  called,
  wildLeft,
  wildNear,
  DINO_COLOURS,
  DINO_KINDS
} from './open-world/herd.mjs';
import {prepareCharacters, spawnCharacter, hasCharacter} from './open-world/characters.js';
import {loadDex, see, pages, earn, addLoot, takeLoot, GOLD, SEE_RANGE} from './open-world/dex.mjs';
import {loadCamp, saveCamp, visit, give, returnGift, CAMP, FIRE_RANGE} from './open-world/paiute-camp.mjs';
import {createArrows, loose, stepArrows} from './open-world/arrows.mjs';
import {createArrowView} from './open-world/arrows.js';
import {stunOutlaw, OUTLAWS} from './open-world/outlaws.mjs';
import {stunSteer} from './open-world/meadow.mjs';
import {createPortraits} from './open-world/portraits.js';
import {ask, typing} from './open-world/type-prompt.js';
import {renderHint} from './key-hints.js';
import {say, nameFrom} from './open-world/typed.mjs';
import {createAdventure} from './open-world/adventure.js';
import {createIntro} from './open-world/intro.js';
import {createLabView} from './open-world/lab-accident.js';
import {
  LAB_EVENTS,
  GET_OUT,
  beginLab,
  carPoses,
  createLabState,
  labBusy,
  labSeen,
  labUnderground,
  markLabSeen,
  stepLab,
  tourNear
} from './open-world/lab-accident.mjs';
import {createAnnexView} from './open-world/annex.js';
import {
  annexDark,
  annexFell,
  annexRescue,
  createAnnexState,
  leverNear,
  loadAnnex,
  stepAnnex
} from './open-world/annex.mjs';
import {createFileSelect} from './open-world/file-select.js';
import {readSlots, slotSave} from './physics/save-slots.mjs';
import {mineWorld as mineWorldPos} from './open-world/mine.mjs';
import {ITEMS} from './physics/items.mjs';
import {bodyAt, waterHeight} from './physics/water.mjs';
import {vehicleParams, legendCarParams, mountParams, LEGEND_CARS} from './physics/vehicles.mjs';
import {createAdaptiveResolution, stepAdaptiveResolution} from './adaptive-resolution.mjs';
import {createPlaymates, stepPlaymates} from './physics/playmate.mjs';
import {drawDetailedMinimap} from './open-world/minimap.js';
import {createCup, loadCup, saveCup, recordCupRace, nextCupEvent, cupStandings} from './grand-prix.mjs';
import {createRaceMenu, CUP_COURSES} from './race-menu.js';
import {createAlienMarshal} from './alien-marshal.js';
import {createGamepadInput, cameraMove, flyShoulder} from './gamepad.mjs';
import {splitScreenOn, toggleP2SkateForm, p2RobotPad, rivalHumanInput} from './split-p2.mjs';
import {attachDreams} from './open-world/dreams/runner.js';
import {createMenuPad} from './gamepad-menu.mjs';
import {padSvg, padKind} from './pad-art.mjs';
import {createCoach} from './coach.mjs';
import {createTag, setTagOn, stepTag, TAG, hudLine, resultHead, resultStats, tagTelemetry} from './tag.mjs';
import {createHunt, setHuntOn, stepHunt, collect as collectHunt, hudLine as huntHudLine, resultHead as huntResultHead, resultStats as huntResultStats, huntTelemetry} from './hunt.mjs';
import {createTeamRace, teamCard, p2LapChip} from './team-race.mjs';
import {joinPadIndex, joinCardVisible, menuPlayersButton, joinHideUntilAfterLeave} from './join.mjs';
import {frameSeconds, cameraGlide} from './frame-time.mjs';
import {createBootTrace} from './boot-trace.mjs';
import {warmPresentation} from './presentation-warm.mjs';
import {poseCar} from './vehicle-pose.mjs';
import {makeVehicleBody} from './vehicle-bodies.js';
import * as T from '../vendor/three.module.js';
import {
  buildings,
  solids,
  aircraft,
  obstacles,
  collisionSolids,
  ramps,
  checkpoints,
  baseCourse
} from './sim.mjs';
import {recover, readout} from './physics/session.mjs';
import {
  createRace as createRaceBase,
  stepRace,
  placeOf,
  retreatActive,
  RACE_RETREAT_SEEN_KEY
} from './physics/race.mjs';
import {TRACK_FEATURES, placeFeatures} from './physics/features.mjs';
import {modifiers, MISSILES, beamDir, LASER} from './physics/pickups.mjs';
import {heldMissilePose} from './pickup-visuals.mjs';
import {BUGGY, carYaw, createCar, placeCar, rideHeight} from './physics/car.mjs';
import {addBox} from './physics/world.mjs';
import {courseFromGlb} from './physics/district.mjs';
import {GLTFLoader} from '../vendor/three/addons/loaders/GLTFLoader.js';
import {
  LIGHTING,
  isIndoor,
  applyLighting,
  followSun,
  clearcoat,
  studioEnvironment,
  createEffects,
  createRacingLine,
  setupPolish
} from './visuals.js';
import {SoundKit} from './audio.js';
import {nextStep, readStep, STORAGE} from './audio-mix.mjs';
import {JET_KINDS, fitJetShell, paintNoseArt, artTier, NOSE_ART} from './jets.js';
import {createRCTelemetry} from './telemetry.mjs';
import {resultPanel, bindResultPanel, ordinal} from './result-panel.mjs';
import {createWorldSky} from './open-world/sky.js';
import {loadOpenWorld} from './open-world/runtime.js';
import {createWorldUI} from './open-world/ui.js';
import {
  loadProgress,
  canEnter,
  expedition,
  SPECIMENS,
  rcLink,
  nearestLocation,
  roamPullTarget,
  distance as worldDistance,
  locationById,
  eventById,
  eventLaps,
  BOUNDS
} from './open-world/catalog.mjs';
import {setSkateRails} from './physics/grind.mjs';
import {PLAZA, PLAZA_PARK, plazaLocal, plazaWorld} from './open-world/town-plaza.mjs';
import {PLAYGROUND, PLAYGROUND_PARK, playgroundLocal, playgroundWorld} from './open-world/playground.mjs';
import {MARSEILLE_PARK, marseilleLocal, marseilleWorld} from './open-world/marseille.mjs';
import {
  createSkate,
  stepSkate,
  INTRO_PARK,
  createStreetSkate,
  streetFrame,
  scoreTrick,
  bailRun,
  streetPark
} from './physics/skate.mjs';
import {curbRails, residentialCurbRails, parkRails, STREET_RAILS} from './open-world/street-rails.mjs';
import {SEWER_PARK, sewerWorld} from './open-world/sewer.mjs';
import {createBoardTricks, stepBoardTricks, dirOf, boardPose} from './physics/board-tricks.mjs';
import {
  SKATESTREET,
  SKATESTREET_PARK,
  skatestreetLocal,
  skatestreetWorld
} from './open-world/skatestreet.mjs';
import {createNearDetail} from './open-world/near-detail.js';
import {HANGAR, HANGAR_PARK, hangarLocal, hangarWorld} from './open-world/skate-hangar.mjs';
import {SCHOOL_PARK, yardLocal, yardWorld} from './open-world/schoolyard.mjs';
import {createSkateHud, goalCard} from './skate-hud.js';
import {bankPoint, bankLocal} from './open-world/park-lines.mjs';
import {RESIDENTIAL_PARK, parkPoint} from './open-world/residential-frame.mjs';
let bodyKind = 'jet';
try {
  bodyKind = loadProgress(localStorage).body;
} catch {}
function raceRetreatCeremony(options = {}) {
  if (options.roam || options.furball || options.retreatCeremony === false) return false;
  if (options.retreatCeremony === true) return true;
  try {
    return !sessionStorage.getItem(RACE_RETREAT_SEEN_KEY);
  } catch {
    return true;
  }
}
function createRace(course, options = {}) {
  const roam = options.roam || options.furball;
  return createRaceBase(
    {...course, laps: eventLaps(course.event)},
    {
      ...options,
      params: vehicleParams(bodyKind === 'jet' ? 'buggy' : bodyKind),
      retreatCeremony: roam ? false : raceRetreatCeremony(options)
    }
  );
}
const audio = new SoundKit();
const liveSolids = [...collisionSolids],
  hangarFallback = [],
  housingFallback = [],
  aircraftFallback = [];
// ?track=<district> drives an exported Blender district.
// Default is the connected base; ?track=base is the original greybox route.
const entry = new URLSearchParams(location.search);
const legacyTrack = entry.get('track');
if (legacyTrack && legacyTrack !== 'hub') {
  entry.set('track', 'hub');
  if (['housing', 'bx', 'school'].includes(legacyTrack)) entry.set('event', 'district-' + legacyTrack);
  else entry.delete('event');
  history.replaceState(null, '', '?' + entry);
}
let track = 'hub',
  district = null,
  districtError = null,
  openWorld = null;
let adventure = null,
  ladderHint = false;
const intro = createIntro();
let labRide = null,
  labView = null,
  labBoot = false,
  labHanded = false,
  labSkipEdge = false,
  labStored = false,
  labStore = null,
  annex = null,
  annexView = null,
  annexContact = 0.65,
  annexDim = false,
  annexLeverTold = false;
const ANNEX_BG = new T.Color('#07090e');
// Diving (Spirit Mountain's reservoir): with the camera under a water surface, the haze turns
// murky teal and short, and the sky goes with it; surfacing puts the day's own back.
let underState = null;
function underwater() {
  const b = bodyAt(camera.position.x, camera.position.z),
    under = !!b && camera.position.y < waterHeight(b, camera.position.x, camera.position.z) - 0.05;
  // The sky rewrites the fog's colour every frame (before this), so the tint is re-applied while under.
  if (under) {
    underState ??= {
      near: scene.fog.near,
      far: scene.fog.far,
      bg: scene.background,
      water: new T.Color('#1e5964')
    };
    scene.fog.color.copy(underState.water);
    scene.fog.near = 0.5;
    scene.fog.far = 26;
    scene.background = underState.water;
  } else if (underState) {
    scene.fog.near = underState.near;
    scene.fog.far = underState.far;
    scene.background = underState.bg;
    underState = null;
  }
  // Up high (Spirit Mountain, flying) the haze recedes, so the summit looks out over the world.
  if (!under && openWorld) {
    const h = Math.max(0, camera.position.y);
    scene.fog.near = 280 + h * 4;
    scene.fog.far = 680 + h * 12;
    // The dark world (the past): a warm dust haze closes in, so the modern base kilometres off is lost in it.
    if (openWorld.era?.() === 'past') {
      scene.fog.near = 90 + h * 0.6;
      scene.fog.far = 420 + h * 3;
      scene.fog.color.lerp(PAST_DUST, 0.7);
    }
  }
}
const PAST_DUST = new T.Color('#d8c3a0');
try {
  openWorld = await loadOpenWorld(location.search);
} catch (error) {
  const brief = document.getElementById('brief');
  brief.hidden = false;
  brief.dataset.loadFailed = 'true';
  brief.replaceChildren();
  const title = document.createElement('h1');
  title.textContent = 'Base unavailable';
  const retry = document.createElement('button');
  retry.textContent = 'Retry';
  retry.onclick = () => location.reload();
  brief.append(title, retry);
  console.error('Saucer Springs could not load', error);
  throw error;
}
async function loadDistrict(name) {
  const buffer = await fetchAssetBuffer(`./assets/districts/${name}.glb`);
  return {
    course: courseFromGlb(buffer),
    gltf: await new GLTFLoader().parseAsync(buffer, './assets/districts/')
  };
}
if (track && track !== 'hub') {
  for (let attempt = 0; attempt < 2 && !district; attempt++) {
    try {
      district = await loadDistrict(track);
    } catch (error) {
      districtError = error;
      console.error('Saucer Springs district load failed', error);
    }
  }
  if (!district) track = null;
}
const course = openWorld?.course ?? district?.course ?? baseCourse(),
  cps = course.checkpoints;
try {
  labStore = localStorage;
} catch {}
labRide = createLabState({seen: labSeen(labStore)});
labStored = labRide.seen;
annex = createAnnexState(loadAnnex(labStore));
labBoot = !!openWorld?.labShortcut;
// Asset collision proxies join the triangle world the car drives on.
function addSolid(b) {
  liveSolids.push(b);
  addBox(course.world, b.x, b.z, b.w, b.d, b.minY ?? 0, b.h);
}
let assetState = 'prototype';
const artReview = new URLSearchParams(location.search).get('art') === 'review';
const $ = id => document.getElementById(id),
  canvas = $('view');
for (const a of document.querySelectorAll('#tracks a')) {
  const id = a.dataset.track;
  a.href = rcLink(
    id === 'hub' ? {track: 'hub'} : {track: 'hub', event: `district-${id}`, mode: 'drive'},
    location.search
  );
  a.setAttribute('aria-current', String(id === (openWorld?.selected.district ?? track)));
}
if (districtError) {
  const note = document.createElement('p');
  note.textContent = openWorld
    ? ''
    : `The requested area did not download. ${track === 'housing' ? 'Base Housing' : 'Motor pool'} is available; reload to retry.`;
  $('brief')?.append(note);
}
const renderer = new T.WebGLRenderer({canvas, antialias: true});
let lookMode = false,
  lookYaw = 0,
  lookPitch = 0,
  lookIdle = 0,
  lookDrag = null,
  padAim = false;
const lookKeys = new Set();
// A mouse drag on the view looks around any time; it settles back behind you a moment after.
canvas.addEventListener('pointerdown', e => {
  if (e.button === 0 && race.roam) lookDrag = [e.clientX, e.clientY];
});
window.addEventListener('pointermove', e => {
  if (!lookDrag) return;
  lookYaw += (e.clientX - lookDrag[0]) * 0.008;
  lookPitch = Math.max(-0.3, Math.min(1.1, lookPitch + (e.clientY - lookDrag[1]) * 0.005));
  lookDrag = [e.clientX, e.clientY];
  lookIdle = 1.5;
});
window.addEventListener('pointerup', () => {
  lookDrag = null;
});
const adaptive = createAdaptiveResolution({
  max: Math.min(devicePixelRatio, 1.75),
  min: Math.min(devicePixelRatio, 1)
});
renderer.setPixelRatio(adaptive.ratio);
renderer.info.autoReset = false;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new T.Scene();
scene.background = new T.Color('#b2c6c5');
scene.fog = new T.Fog('#b2c6c5', 65, 150);
const camera = new T.PerspectiveCamera(63, 1, 0.06, 210);
const hemi = new T.HemisphereLight(0xd5edf1, 0x5a624a, 1.5);
scene.add(hemi);
const sun = new T.DirectionalLight(0xffd6a0, 3.2);
sun.position.set(-30, 55, -25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {left: -65, right: 65, top: 55, bottom: -55, near: 1, far: 150});
sun.shadow.bias = -0.0003;
scene.add(sun);
// Local shadow coverage keeps tyre contact legible at RC scale.
const contactSun = new T.DirectionalLight(0xffe4bd, 0.65);
contactSun.castShadow = true;
contactSun.shadow.mapSize.set(1024, 1024);
Object.assign(contactSun.shadow.camera, {left: -6, right: 6, top: 6, bottom: -6, near: 0.1, far: 30});
contactSun.shadow.bias = -0.00015;
contactSun.shadow.normalBias = 0.015;
scene.add(contactSun, contactSun.target);
const studio = new T.Scene();
studio.background = new T.Color('#879b9f');
for (const [x, y, z, w, h, d, c] of [
  [0, 6, 0, 10, 0.1, 10, 0xffe9cc],
  [-5, 2, 0, 0.1, 4, 8, 0x536b70],
  [5, 3, 0, 0.1, 3, 6, 0xdceeff]
]) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshBasicMaterial({color: c}));
  m.position.set(x, y, z);
  studio.add(m);
}
const pmrem = new T.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(studio, 0.05).texture;
scene.environmentIntensity = 0.45;
pmrem.dispose();
studio.traverse(o => {
  o.geometry?.dispose();
  o.material?.dispose();
});
// Districts get the polished presentation: per-track lighting, a car-following sun shadow, and a
// brighter studio environment for clear-coat reflections.
if (track) {
  applyLighting({renderer, hemi, sun, contactSun}, isIndoor(track) ? LIGHTING.indoor : LIGHTING.outdoor);
  if (openWorld) {
    Object.assign(sun.shadow.camera, {left: -38, right: 38, top: 38, bottom: -38});
    sun.shadow.camera.updateProjectionMatrix();
    sun.userData.dir.set(-0.95, 1, 0.7).normalize();
    sun.color.set(0xffe4bf);
  }
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 0.6;
  scene.add(sun.target);
}
const fx = createEffects(scene);
const marshal = createAlienMarshal(scene, {scale: 0.32});
let marshalSession = null,
  marshalRecovery = 0,
  marshalUntil = 0,
  marshalLap = 1,
  marshalLapUntil = 0;
// Polished look (HDRI light, bloom, SMAA) on district tracks.
// Default on district tracks (key-to-steer latency measured equal to classic, 7-13 ms); ?gfx=classic
// keeps the old renderer, ?gfx=ao adds screen-space AO.
let polish = null;
let polishReady = Promise.resolve();
if (track && new URLSearchParams(location.search).get('gfx') !== 'classic')
  polishReady = setupPolish({renderer, scene, camera, indoor: isIndoor(track), world: !!openWorld})
    .then(p => {
      polish = p;
      polish.resize(innerWidth, innerHeight);
      // The HDRI now carries the ambient light: drop the old hemisphere fill and rebalance exposure.
      if (!openWorld) {
        hemi.intensity *= 0.35;
        sun.intensity *= 0.85;
        renderer.toneMappingExposure = 0.82;
      }
      return p;
    })
    .catch(e => {
      console.warn('polish off', e);
      return null;
    });
const mats = new Map();
function material(c, glow = false) {
  const key = c + glow;
  if (!mats.has(key))
    mats.set(
      key,
      new T.MeshStandardMaterial({
        color: c,
        roughness: 0.8,
        ...(glow ? {emissive: c, emissiveIntensity: 0.8} : {})
      })
    );
  return mats.get(key);
}
function box(x, y, z, w, h, d, color, parent = scene) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), material(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function sphere(x, y, z, r, color, parent = scene, sx = 1, sy = 1, sz = 1) {
  const m = new T.Mesh(new T.SphereGeometry(r, 14, 10), material(color));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function sign(text, x, y, z, width = 4) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#172e33';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#e5c58a';
  ctx.lineWidth = 8;
  ctx.strokeRect(5, 5, 502, 118);
  ctx.fillStyle = '#f8ebce';
  ctx.font = 'bold 44px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, 256, 79);
  const m = new T.Mesh(
    new T.PlaneGeometry(width, width / 4),
    new T.MeshBasicMaterial({map: new T.CanvasTexture(c), side: T.DoubleSide})
  );
  m.position.set(x, y, z);
  scene.add(m);
  return m;
}
// Deterministic original surface grain at toy-eye distance; no downloaded textures.
for (const [color, repeat] of [
  ['#555f60', 18],
  ['#8b9389', 12],
  ['#7d8766', 30],
  ['#9ca59b', 8]
]) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 128, 128);
  let seed = 717;
  for (let i = 0; i < 3000; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const x = (artReview ? seed >>> 16 : seed) % 128;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const y = (artReview ? seed >>> 16 : seed) % 128;
    ctx.fillStyle = artReview ? (i % 2 ? '#ffffff08' : '#00000008') : i % 2 ? '#ffffff16' : '#00000014';
    ctx.fillRect(x, y, 1, 1);
  }
  const tex = new T.CanvasTexture(c);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = T.SRGBColorSpace;
  material(color).map = tex;
  material(color).color.set('#ffffff');
}
let aliens = [];
if (!track) {
  box(0, -0.2, 0, 130, 0.4, 110, '#7d8766');
  box(0, 0.008, 0, 7, 0.025, 90, '#555f60');
  box(22, 0.01, -36, 48, 0.025, 8, '#555f60');
  box(38, 0.01, 1, 9, 0.025, 80, '#657072');
  box(20, 0.01, 34, 44, 0.025, 8, '#555f60');
  box(20, 0.008, -8, 60, 0.02, 30, '#8b9389');
  for (let z = -42; z < 45; z += 5) box(0, 0.03, z, 0.1, 0.015, 2, '#ded4ad');
  for (let x = 5; x < 45; x += 5) box(x, 0.035, 34, 2, 0.015, 0.1, '#ded4ad');
  // Scale cues: kerbs, drain grates, bollards, grass tufts, human-size doors.
  for (const x of [-3.7, 3.7]) for (let z = -42; z < 44; z += 2) box(x, 0.09, z, 0.25, 0.18, 1.9, '#b9b6a3');
  for (const o of obstacles) {
    box(
      o.x,
      o.h / 2,
      o.z,
      o.w,
      o.h,
      o.d,
      o.kind === 'bollard' ? '#dbc17f' : o.kind === 'crate' ? '#99825d' : '#c2bca7'
    );
    if (o.kind === 'bollard') box(o.x, 0.82, o.z, 0.18, 0.14, 0.18, '#283635');
    if (o.kind === 'crate')
      for (const dx of [-0.4, 0.4]) box(o.x + dx, o.h / 2, o.z, 0.07, o.h + 0.02, o.d + 0.02, '#4c5750');
    if (o.kind === 'barrier')
      for (const dx of [-0.8, 0, 0.8]) box(o.x + dx, 0.45, o.z - 0.26, 0.3, 0.2, 0.025, '#d4a848');
  }
  for (let i = 0; i < 180; i++) {
    const x = Math.sin(i * 91.7) * 55,
      z = Math.cos(i * 38.2) * 45;
    if (Math.abs(x) > 8 && !(x > 25 && x < 49)) box(x, 0.12, z, 0.06, 0.24, 0.07, '#6c7953');
  }
  for (const b of buildings) {
    const firstChild = scene.children.length;
    if (b.kind === 'house') {
      box(b.x, 2.5, b.z, b.w, 5, b.d, '#c1b49a');
      const roof = new T.Mesh(new T.ConeGeometry(6.15, 2, 4), material('#686e68'));
      roof.rotation.y = Math.PI / 4;
      roof.position.set(b.x, 5.8, b.z);
      roof.castShadow = true;
      scene.add(roof);
      for (const dx of [-2.5, 2.5])
        for (const z of [b.z - 4.02, b.z + 4.02]) box(b.x + dx, 2.6, z, 1.3, 1.7, 0.06, '#49636a');
      box(b.x, 1.1, b.z + 4.04, 1.2, 2.2, 0.08, '#58655f');
      box(b.x, 5.7, b.z, 1, 0.3, 1, '#7f8176');
    } else {
      for (const s of solids.filter(
        s => Math.abs(s.x - b.x) < b.w / 2 + 0.1 && Math.abs(s.z - b.z) <= b.d / 2
      ))
        box(s.x, s.h / 2, s.z, s.w, s.h, s.d, b.kind === 'lab' ? '#909d95' : '#7c8b86');
      box(b.x, b.h + 0.12, b.z, b.w + 0.5, 0.25, b.d + 0.5, b.kind === 'lab' ? '#536661' : '#71817c');
      for (let z = b.z - b.d / 2; z <= b.z + b.d / 2; z += 3)
        for (const side of [-1, 1]) box(b.x + (side * b.w) / 2, b.h / 2, z, 0.18, b.h, 0.16, '#b4b9a4');
      sign(
        b.kind === 'lab' ? '09 / RESTRICTED' : 'HANGAR 02',
        b.x,
        b.h - 1,
        b.z - b.d / 2 - 0.24,
        6
      ).rotation.y = Math.PI;
      box(b.x, 0.03, b.z, b.w, 0.06, b.d, '#9ca59b');
      for (const x of [b.x - 6, b.x + 6]) box(x, b.h - 0.3, b.z, 0.15, 0.12, b.d - 2, '#e6d5ad');
    }
    if (b.kind === 'house') housingFallback.push(...scene.children.slice(firstChild));
    if (b.kind === 'hangar') hangarFallback.push(...scene.children.slice(firstChild));
  }
  function plane(x, z) {
    const g = new T.Group();
    g.position.set(x, 1.2, z);
    scene.add(g);
    sphere(0, 0, 0, 1, '#acb5ad', g, 1, 0.7, 4.7);
    box(0, 0, 0.6, 10, 0.16, 2, '#929f96', g);
    box(0, 0.1, 3.6, 4, 0.13, 1, '#919e94', g);
    box(0, 1, 3.7, 0.15, 2, 1.8, '#77867f', g);
    sphere(0, 0.55, -1.4, 0.75, '#354e58', g, 0.65, 0.7, 1.8);
    for (const dx of [-1, 1]) box(dx, -0.85, 1, 0.2, 0.7, 0.2, '#263032', g);
    aircraftFallback.push(g);
  }
  for (const a of aircraft) plane(a.x, a.z);
  for (const r of ramps) {
    const g = new T.BufferGeometry();
    const x = r.w / 2,
      z = r.d / 2,
      h = r.h;
    g.setAttribute(
      'position',
      new T.Float32BufferAttribute([-x, 0, z, x, 0, z, x, h, -z, -x, 0, z, x, h, -z, -x, h, -z], 3)
    );
    g.computeVertexNormals();
    const m = new T.Mesh(
      g,
      new T.MeshStandardMaterial({color: '#bc8b50', side: T.DoubleSide, roughness: 0.9})
    );
    m.position.set(r.x, 0.015, r.z);
    m.receiveShadow = true;
    scene.add(m);
    for (const dx of [-x + 0.12, x - 0.12]) {
      const rail = box(r.x + dx, h / 2 + 0.025, r.z, 0.12, 0.035, Math.hypot(r.d, h), '#ead099');
      rail.rotation.x = Math.atan2(h, r.d);
    }
  }
  // Secret lab: three original containment specimens, reachable through the hangar service doors.
  for (const [i, x] of [33, 38, 43].entries()) {
    box(x, 0.12, 25, 1.7, 0.24, 1.7, '#334e4b');
    const tube = new T.Mesh(
      new T.CylinderGeometry(0.8, 0.8, 2.6, 20, 1, true),
      new T.MeshPhysicalMaterial({
        color: '#72ffce',
        transparent: true,
        opacity: 0.18,
        roughness: 0.15,
        side: T.DoubleSide,
        depthWrite: false
      })
    );
    tube.position.set(x, 1.55, 25);
    scene.add(tube);
    const a = new T.Group();
    a.position.set(x, 0.4, 25);
    scene.add(a);
    sphere(0, 1.35, 0, 0.42, '#99b99e', a, 1.1, 1.3, 0.9);
    sphere(0, 0.6, 0, 0.35, '#779882', a, 0.7, 1.4, 0.7);
    for (const side of [-1, 1]) {
      sphere(side * 0.19, 1.4, -0.31, 0.14, '#152a28', a, 1, 1.4, 0.4);
      box(side * 0.14, 0.12, 0, 0.12, 0.5, 0.13, '#779882', a);
      box(side * 0.34, 0.6, 0, 0.09, 0.6, 0.1, '#779882', a);
    }
    aliens.push(a);
    const light = new T.PointLight('#70ffc5', 8, 5);
    light.position.set(x, 2, 25);
    scene.add(light);
    sign('SPECIMEN ' + (i + 1), x, 2.9, 25, 1.8);
  }
  for (let x = -55; x < 57; x += 4)
    for (const z of [-47, 47]) {
      box(x, 1.2, z, 0.08, 2.4, 0.08, '#646f66');
      box(x, 1.8, z, 4, 0.035, 0.035, '#9ca89c');
      box(x, 0.6, z, 4, 0.035, 0.035, '#9ca89c');
    }
  sign('RAPIER / MOTOR POOL', 0, 2.6, 7, 5);
  sign('QUARTERS', -6, 1.4, -18, 3);
  sign('FLIGHT LINE →', 6, 1.1, -35, 3);
} else {
  // District visuals: VIS_* meshes render; collision and markers stay invisible.
  if (openWorld) await openWorld.attach(scene);
  if (openWorld) {
    adventure = createAdventure(scene, course.world);
    labView = createLabView(scene);
    annexView = createAnnexView(scene);
    $('menu-legend').hidden = !(
      adventure.inventory.legend ||
      (() => {
        try {
          return readSlots(localStorage).slots.some((x, i) => x && slotSave(localStorage, i)?.legend);
        } catch {
          return false;
        }
      })()
    );
  }
  const root = district?.gltf.scene;
  if (root) {
    root.traverse(o => {
      if (/^(COL_|GATE_|START_|AI_|PICKUP_|SPEC_|CAM_)/.test(o.name)) o.visible = false;
      else if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    scene.add(root);
  }
  // District backdrops (ridge, skyline) sit 470–660 m out: draw to 900 m with a light desert haze.
  scene.background = new T.Color('#a9d4ee');
  scene.fog = new T.Fog('#c9dde6', openWorld ? 280 : 180, openWorld ? 680 : 950);
  camera.far = openWorld ? 40000 : 900;
  camera.updateProjectionMatrix();
}
let car = new T.Group();
scene.add(car);
const prototypeBody = new T.Group();
prototypeBody.name = 'Body';
car.add(prototypeBody);
const shell = box(0, 0.15, 0, 0.44, 0.16, 0.75, '#e6a53c', prototypeBody);
box(0, 0.3, 0.04, 0.33, 0.2, 0.32, '#273d45', prototypeBody);
box(0, 0.22, 0.35, 0.55, 0.05, 0.05, '#253436', prototypeBody);
box(0, 0.43, 0.29, 0.016, 0.45, 0.016, '#313d3b', prototypeBody);
for (const x of [-0.15, 0.15]) box(x, 0.19, -0.36, 0.1, 0.06, 0.025, '#fff4be', prototypeBody);
let wheels = [];
for (const z of [-0.25, 0.25])
  for (const x of [-0.29, 0.29]) {
    const name = (z < 0 ? 'F' : 'R') + (x < 0 ? 'L' : 'R'),
      pivot = new T.Group();
    pivot.name = 'Steer_' + name;
    car.add(pivot);
    const wheel = new T.Group();
    wheel.name = 'Wheel_' + name;
    wheel.userData.modelRadius = 0.15;
    wheel.userData.modelWidth = 0.13;
    pivot.add(wheel);
    const tyre = new T.Mesh(
      new T.CylinderGeometry(0.15, 0.15, 0.13, 16).rotateZ(Math.PI / 2),
      material('#202a2a')
    );
    tyre.castShadow = true;
    wheel.add(tyre);
    sphere(0, 0, 0, 0.06, '#b1b6a8', wheel, 1, 1, 1);
    wheels.push({pivot, wheel, front: z < 0});
  }
// Validated original assets are the normal entry; prototype remains an explicit diagnostic fallback.
// Start stays disabled in the HTML until the opening warm-up releases it, so an early click is never lost.
// The establishing shot stays put until that release: shader compile, texture upload, and the
// asset swap used to land in the first moving frames.
let openingHeld = true;
let openingShown = 0;
let restQueued = false;
let openingReleasedAt = 0;
function readyModes() {
  for (const id of ['start', 'menu-race', 'menu-furball']) $(id).disabled = false;
  if (!race.roam) $('start').textContent = '▶ Go';
}
let assetsReady = Promise.resolve();
if (new URLSearchParams(location.search).get('assets') !== 'prototype') {
  assetState = 'loading';
  $('start').disabled = true;
  assetsReady = import('./assets.js')
    .then(async ({loadBuggyAsset, loadHangarAsset, loadStaticAsset}) => {
      const [buggy, hangar] = await Promise.all([
        loadBuggyAsset('./assets/buggy.glb'),
        track ? null : loadHangarAsset('./assets/hangar-slice.glb')
      ]);
      const base =
        artReview && !track
          ? await Promise.all([
              loadStaticAsset('./assets/aircraft.glb', 'Aircraft_Root'),
              loadStaticAsset('./assets/quarters.glb', 'Quarters_Root')
            ])
          : null;
      // Commit the complete visual/collision set together; a failed load retains the prototype.
      scene.remove(car);
      car = fitJetShell(buggy.car, 'viper', '#f28c28');
      paintNoseArt(car.getObjectByName('JetShell'), {tier: artTier(aceKills)});
      wheels = buggy.wheels;
      if (track) clearcoat(car);
      scene.add(car);
      if (hangar) {
        scene.add(hangar.hangar);
        const floor = hangar.hangar.getObjectByName('Floor');
        floor.material = material('#9ca59b').clone();
        floor.material.roughness = 0.68;
        for (const z of [-14, -2]) {
          const lamp = new T.SpotLight(0xffd29a, 110, 22, 1.1, 0.75, 1.4);
          lamp.position.set(35, 6, z);
          lamp.target.position.set(38, 0, z + 2);
          scene.add(lamp, lamp.target);
        }
        sign('02 / ENGINEERING', 38, 4.3, -19.2, 4).rotation.y = Math.PI;
        for (const node of hangarFallback) node.visible = false;
        hangar.collision.forEach(addSolid);
      }
      if (base) {
        for (const node of [...housingFallback, ...aircraftFallback]) node.visible = false;
        for (const a of aircraft) {
          const model = base[0].clone(true);
          model.position.set(a.x, 0, a.z);
          scene.add(model);
          addSolid({x: a.x, z: a.z - 2.6, w: 0.3, d: 0.45, h: 0.75, minY: 0});
        }
        for (const b of buildings.filter(b => b.kind === 'house')) {
          const model = base[1].clone(true);
          model.position.set(b.x, 0, b.z);
          scene.add(model);
        }
      }
      if (artReview && hangar) {
        const {applyArtReview} = await import('./art-review.js');
        applyArtReview({scene, car, hangar: hangar.hangar, renderer, sun, contactSun});
      }
      assetState = 'blender';
      telemetry.boot({assets: 'blender', ms: performance.now()});
      ui.apply();
      // Remaining districts parse GLBs on the main thread. They wait until the opening
      // glide has settled, so that parse does not hitch the camera move.
      restQueued = !!openWorld;
      if (openWorld && new URLSearchParams(location.search).get('detail') !== 'off')
        nearDetail = createNearDetail(scene, openWorld.stream.world);
    })
    .catch(error => {
      assetState = 'failed';
      telemetry.boot({assets: 'failed', ms: performance.now()});
      telemetry.error('assets', error?.message ?? error);
      console.error('RC Blender asset rejected:', error);
      $('brief').hidden = false;
      const warning = document.createElement('p');
      warning.textContent = 'Asset loading failed; prototype fallback is available.';
      $('brief').append(warning);
    });
}
// Gates are inflatable toy-race arches: the next one glows, the rest stay quiet.
const archMat = new T.MeshStandardMaterial({color: '#ff7a2f', roughness: 0.55}),
  archLit = new T.MeshStandardMaterial({
    color: '#ffb347',
    emissive: '#ff7a00',
    emissiveIntensity: 0.7,
    roughness: 0.5
  }),
  stripeMat = new T.MeshStandardMaterial({color: '#fff4e0', roughness: 0.6});
const gates = cps.slice(0, -1).map(([x, z, , half = 2.5], i) => {
  const g = new T.Group(),
    m = course.gates?.[i],
    y = m ? m.pos[1] : (course.event?.points?.[i]?.[2] ?? 0);
  g.position.set(x, y, z);
  if (m) g.rotation.y = Math.atan2(-m.forward[0], -m.forward[2]);
  else if (cps[i][4]) g.rotation.y = Math.atan2(-cps[i][4][0], -cps[i][4][1]);
  scene.add(g);
  const r = half + 0.15,
    arch = new T.Mesh(new T.TorusGeometry(r, 0.14, 12, 32, Math.PI), archMat);
  arch.scale.y = Math.min(1, 1.6 / r);
  arch.castShadow = true;
  g.add(arch);
  for (const dx of [-r, r]) {
    const foot = new T.Mesh(new T.CylinderGeometry(0.2, 0.24, 0.18, 16), stripeMat);
    foot.position.set(dx, 0.09, 0);
    g.add(foot);
  }
  g.userData.arch = arch;
  g.userData.label = sign(String(i + 1).padStart(2, '0'), x, y + r * arch.scale.y + 0.35, z, 1.1);
  return g;
});
// Lifetime Furball kills: they unlock nose art that is painted on the player's jet automatically.
let aceKills = 0;
try {
  aceKills = Number(localStorage.getItem('guns-only.rc.kills')) || 0;
} catch {}
let mode = 'kid';
try {
  if (localStorage.getItem('guns-only.rc.mode') === 'bigKid') mode = 'bigKid';
} catch {}
// ?rivals=0 for a solo time trial.
const rivalCount = Math.max(0, Math.min(7, Number(new URLSearchParams(location.search).get('rivals') ?? 7)));
// Start in the connected base; explicit race destinations start on their grid.
const urlMode = openWorld?.locked
    ? 'drive'
    : openWorld?.selected.battle
      ? 'furball'
      : new URLSearchParams(location.search).get('mode'),
  startRoam = urlMode !== 'race' && urlMode !== 'furball';
let race = createRace(course, {
    mode,
    opponents: urlMode === 'furball' ? Math.max(3, rivalCount) : rivalCount,
    roam: startRoam,
    furball: urlMode === 'furball'
  }),
  s = race.player,
  paused = true,
  keys = new Set(),
  acc = 0,
  last = performance.now(),
  best = 0;
let bestKey = `guns-only.rc.best.v3.${track ?? 'base'}.${openWorld?.selected.id ?? 'lap'}.${mode}`;
let dreams = null;
try {
  best = Number(localStorage.getItem(bestKey)) || 0;
} catch {}
const telemetryTrack = openWorld ? `hub:${openWorld.selected.id}` : track;
const telemetry = createRCTelemetry({track: telemetryTrack, mode});
const bootTrace =
  entry.get('trace') === 'boot'
    ? createBootTrace({
        log: ms => console.log('[boot]', Math.round(ms * 10) / 10),
        onSummary(summary) {
          console.log(
            '[boot] summary',
            `p50=${summary.p50 ?? '—'}`,
            `p95=${summary.p95 ?? '—'}`,
            `max=${summary.max ?? '—'}`,
            `over50=${summary.over50}`,
            `n=${summary.count}`
          );
          telemetry.bootFrames(summary);
        }
      })
    : null;
let nearDetail = null,
  lastTelemetryFlush = performance.now(),
  lastTelemetrySample = 0,
  lastBeat = performance.now(),
  beatTravel = 0,
  beatRecoveries = 0,
  beatSession = null;
window.addEventListener('error', e => telemetry.error('error', e.message));
window.addEventListener('unhandledrejection', e =>
  telemetry.error('rejection', e.reason?.message ?? e.reason)
);
// Once a second: the place the car is at; once a minute: what the player is doing and how far they drove.
function sampleTelemetry(now) {
  if (!started || document.hidden) return;
  const at = openWorld?.near(s.car.pos);
  if (at) telemetry.visit(at.id);
  if (beatSession !== s) {
    beatSession = s;
    beatTravel = s.travel ?? 0;
    beatRecoveries = s.recoveries ?? 0;
  }
  if (now - lastBeat < 60_000) return;
  lastBeat = now;
  const doing = paused
    ? 'paused'
    : skate
      ? 'skate:' + skatePark
      : openWorld?.activity() && !openWorld.activity().done
        ? openWorld.activity().kind
        : race.furball
          ? 'furball'
          : !race.roam
            ? 'race'
            : 'roam';
  telemetry.heartbeat({
    doing,
    place: openWorld ? nearestLocation(s.car.pos).id : track,
    metres: Math.max(0, (s.travel ?? 0) - beatTravel),
    recoveries: Math.max(0, (s.recoveries ?? 0) - beatRecoveries),
    at: robot ? robot.pos : s.car.pos
  });
  beatTravel = s.travel ?? 0;
  beatRecoveries = s.recoveries;
}
// Course features (boost pads, kicker ramps) are placed once into the world and shared by every race.
const trackFeatures =
  track && TRACK_FEATURES[track] ? placeFeatures(course, race.line, TRACK_FEATURES[track]) : null;
race.features = trackFeatures;
const format = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
let started = false;
for (const event of ['pointerdown', 'keydown'])
  window.addEventListener(event, () => audio.start(), {once: true});
// Escape opens the menu (once racing has started): resume, change track, race or free drive, kid, mute.
function pause(value) {
  paused = value;
  document.body.classList.toggle('paused', value);
  if (!value) audio.start();
  keys.clear();
  bowlingHold = null;
  tennisHold = null;
  touchControls?.reset();
  fireQueued = false;
  $('pause').textContent = paused ? '▶' : '⏸';
  if (started && !$('result').hidden) return;
  if (started) {
    $('brief').hidden = !paused;
    $('brief-title').textContent = paused ? 'PAUSED' : 'RC ODYSSEY';
    $('resume').hidden = !paused;
    $('wake').hidden = !dreams?.active();
    $('start').hidden = race.roam;
    $('start').textContent = 'Return to base';
    if (paused) (dreams?.active() ? $('wake') : $('resume')).focus();
    else canvas.focus();
  }
}
let lastThrottle = 0;
let skateTouchGrab = false,
  touchControls = null,
  touchState = {steer: 0, throttle: 0, brake: false};
// Drive = free drive on this track. On the very first press it starts whatever the URL chose (?mode=race|furball).
$('start').onclick = () => {
  telemetry.firstInput('button');
  audio.start();
  $('brief').hidden = true;
  $('result').hidden = true;
  const first = !started;
  started = true;
  if (first) {
    pause(false);
    if (!race.roam) startCountdown();
    $('start').textContent = '▶ Drive';
  } else {
    freeDrive();
    pause(false);
  }
  canvas.focus();
};
$('resume').onclick = () => {
  pause(false);
  canvas.focus();
};
$('wake').onclick = () => {
  dreams?.bail();
  pause(false);
  canvas.focus();
};
function raceReady() {
  if (!openWorld || openWorld.canRace()) return true;
  callout('🎳 Finish bowling first');
  return false;
}
function visitRace(place, kind = 'race') {
  const url = openWorld.eventURL(place, kind);
  if (url) location.href = url;
}
$('menu-race').onclick = () => {
  if (!raceReady()) return;
  if (openWorld && race.roam) {
    const p = nearestLocation(s.car.pos);
    visitRace(p.event || p.track ? p : locationById('ramp'));
    return;
  }
  team.on = false;
  telemetry.firstInput('button');
  audio.start();
  started = true;
  $('brief').hidden = true;
  $('result').hidden = true;
  pause(false);
  startRace();
  canvas.focus();
};
// The Legend of Spirit Mountain: unlocked by the mine's reveal; starts as the robot at the mine mouth.
const fileSelect = createFileSelect({
  onPlay: () => {
    const u = new URL(location.href);
    u.search = '';
    u.searchParams.set('track', 'hub');
    u.searchParams.set('mode', 'legend');
    location.href = u.href;
  }
});
$('menu-legend').onclick = () => fileSelect.show();
let legendStage = 0;
function legendStart() {
  if (urlMode !== 'legend' || !started || !adventure || legendStage > 1) return;
  if (legendStage === 0) {
    const p = legendCarParams(LEGEND_CARS[adventure.inventory.car] ? adventure.inventory.car : 'starter');
    Object.assign(s.car, createCar(p, [...mineWorldPos([0, 0.35, 12])], 0));
    legendStage = 1;
    return;
  }
  if (openWorld.stream.ready(s.car.pos) && !robot) {
    transform();
    legendStage = 2;
    callout('🏔️ Find Spirit Mountain!', 5000);
  }
}
const team = createTeamRace(),
  p2Lap = Object.assign(document.createElement('div'), {id: 'p2-lap', hidden: true});
document.body.append(p2Lap);
const tag = createTag(),
  tagHud = [0, 1].map(i => {
    const el = Object.assign(document.createElement('div'), {className: `tag-chip ${i ? 'right' : 'left'}`, hidden: true});
    document.body.append(el);
    return el;
  }),
  tagResult = Object.assign(document.createElement('div'), {id: 'tag-result', hidden: true});
tagResult.innerHTML = '<div class="tag-card"><h2></h2><p></p></div>';
document.body.append(tagResult);
const tagHead = tagResult.querySelector('h2'),
  tagStats = tagResult.querySelector('p');
const hunt = createHunt(),
  huntHud = [0, 1].map(i => {
    const el = Object.assign(document.createElement('div'), {className: `hunt-chip ${i ? 'right' : 'left'}`, hidden: true});
    document.body.append(el);
    return el;
  }),
  huntResult = Object.assign(document.createElement('div'), {id: 'hunt-result', hidden: true}),
  huntCard = Object.assign(document.createElement('div'), {className: 'hunt-card'}),
  huntHead = document.createElement('h2'),
  huntStats = document.createElement('p');
huntCard.append(huntHead, huntStats);
huntResult.append(huntCard);
document.body.append(huntResult);
function paintHunt() {
  const showResult = hunt.on && hunt.resultLeft > 0;
  huntResult.hidden = !showResult;
  if (showResult) {
    huntHead.textContent = huntResultHead(hunt);
    huntStats.textContent = huntResultStats(hunt).join(' · ');
  }
  const line = huntHudLine(hunt);
  for (const el of huntHud) {
    el.hidden = !line;
    el.textContent = line;
  }
}
$('menu-tag').onclick = () => {
  setTagOn(tag, !tag.on);
  $('menu-tag').setAttribute('aria-pressed', String(tag.on));
  if (tag.on) {
    team.on = false;
    if (hunt.on) {
      setHuntOn(hunt, false);
      $('menu-hunt').setAttribute('aria-pressed', 'false');
      paintHunt();
    }
    callout('🏷️ Tag! Least IT time wins', 2800);
  }
};
$('menu-hunt').onclick = () => {
  setHuntOn(hunt, !hunt.on);
  $('menu-hunt').setAttribute('aria-pressed', String(hunt.on));
  if (hunt.on) {
    if (tag.on) {
      setTagOn(tag, false);
      $('menu-tag').setAttribute('aria-pressed', 'false');
    }
    team.on = false;
  }
  paintHunt();
};
$('menu-team').onclick = () => {
  if (!splitOn || !race.rivals.length || !raceReady()) return;
  if (tag.on) {
    setTagOn(tag, false);
    $('menu-tag').setAttribute('aria-pressed', 'false');
  }
  if (hunt.on) {
    setHuntOn(hunt, false);
    $('menu-hunt').setAttribute('aria-pressed', 'false');
    paintHunt();
  }
  telemetry.firstInput('button');
  audio.start();
  started = true;
  $('brief').hidden = true;
  $('result').hidden = true;
  $('result').classList.remove('team-card');
  pause(false);
  const before = race;
  startRace();
  team.on = race !== before && !race.roam && !race.furball;
  if (team.on) {
    const rv = race.rivals[0];
    if (rv) rv.human = () => ({throttle: 0, steer: 0, brake: true, drift: false, fire: false});
    if (split) split.placed = true;
  }
  canvas.focus();
};
$('menu-players').onclick = () => {
  const t = performance.now(),
    live = Array.from(navigator.getGamepads?.() ?? []).filter(p => p?.connected);
  if (split) leaveSplit(t);
  else {
    const i = joinPadIndex(live, p1Pad);
    if (i != null) joinWithPad(i);
  }
};
$('menu-furball').onclick = () => {
  if (!raceReady()) return;
  if (openWorld) {
    visitRace(locationById('ramp'), 'furball');
    return;
  }
  telemetry.firstInput('button');
  audio.start();
  started = true;
  $('brief').hidden = true;
  $('result').hidden = true;
  goFurball();
  pause(false);
  canvas.focus();
};
$('pause').onclick = () => pause(!paused);
$('reset').onclick = () => {
  telemetry.recover('button', s.car.pos);
  recover(s);
};
function setMode(m) {
  telemetry.setMode(m);
  bestKey = `guns-only.rc.best.v3.${track ?? 'base'}.${openWorld?.selected.id ?? 'lap'}.${m}`;
  best = 0;
  try {
    best = Number(localStorage.getItem(bestKey)) || 0;
  } catch {}
  mode = race.mode = s.mode = s.assist.mode = m;
  s.autoUnstick = m === 'kid';
  $('mode').textContent = m === 'kid' ? 'Kid · B' : 'Big Kid · B';
  $('menu-kid').textContent = m === 'kid' ? 'Kid' : 'Big Kid';
  $('menu-kid').setAttribute('aria-pressed', String(m === 'kid'));
  try {
    localStorage.setItem('guns-only.rc.mode', m);
  } catch {}
}
$('mode').onclick = $('menu-kid').onclick = () => setMode(mode === 'kid' ? 'bigKid' : 'kid');
setMode(mode);
// Mute (M), remembered in this browser.
let muted = false;
try {
  muted = localStorage.getItem('guns-only.rc.muted') === '1';
} catch {}
function setMuted(m, report = true) {
  muted = m;
  if (report) telemetry.mute(m);
  audio.setMuted(m);
  $('mute').textContent = m ? '🔇 M' : '🔊 M';
  $('menu-mute').textContent = m ? '🔇' : '🔊';
  for (const id of ['mute', 'menu-mute']) {
    $(id).setAttribute('aria-label', 'Mute sound');
    $(id).setAttribute('aria-pressed', String(m));
  }
  try {
    localStorage.setItem('guns-only.rc.muted', m ? '1' : '0');
  } catch {}
}
$('mute').onclick = () => setMuted(!muted);
$('menu-mute').onclick = () => setMuted(!muted);
setMuted(muted, false);
// Effects and Engine: off / low / normal, remembered here. The header mute still silences both.
let effectsStep = 'normal',
  engineStep = 'normal';
try {
  effectsStep = readStep(localStorage.getItem(STORAGE.effects));
  engineStep = readStep(localStorage.getItem(STORAGE.engine));
} catch {}
function paintSound() {
  for (const [id, step, name] of [
    ['sound-effects', effectsStep, 'Effects'],
    ['sound-engine', engineStep, 'Engine']
  ]) {
    const el = $(id);
    el.dataset.step = step;
    el.querySelector('.sound-val').textContent = step;
    el.setAttribute('aria-label', `${name} volume ${step}`);
  }
  audio.setMix({effects: effectsStep, engine: engineStep});
}
function cycleSound(which) {
  if (which === 'effects') effectsStep = nextStep(effectsStep);
  else engineStep = nextStep(engineStep);
  try {
    localStorage.setItem(STORAGE.effects, effectsStep);
    localStorage.setItem(STORAGE.engine, engineStep);
  } catch {}
  paintSound();
}
$('sound-effects').onclick = () => cycleSound('effects');
$('sound-engine').onclick = () => cycleSound('engine');
paintSound();
function exit() {
  telemetry.raceQuit('exit');
  telemetry.endSession();
  telemetry.flush({force: true});
  if (window.parent !== window) window.parent.postMessage({type: 'guns-only-rc-exit'}, location.origin);
  else location.href = '../';
}
$('exit').onclick = exit;
window.addEventListener('keydown', e => {
  if (document.querySelector('.rc-race-menu[open]')) return;
  if (e.code === 'Escape') {
    e.preventDefault();
    if (!e.repeat) ui.panel() ? ui.close() : pause(!paused);
    return;
  }
  if (ui.panel() || ['SELECT', 'INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.code === 'Tab') {
    if (!paused && e.target === canvas && !e.shiftKey) {
      e.preventDefault();
      if (!e.repeat) $('atlas').click();
    }
    return;
  }
  if (e.target !== canvas && e.target !== document.body) return;
  if (e.code === 'KeyG') {
    if (!e.repeat) ui.open('garage');
    return;
  }
  if (e.code === 'KeyY' && !e.repeat && race.roam && !paused && openWorld) {
    e.preventDefault();
    sayAloud();
    return;
  }
  if (e.code === 'KeyE') {
    keys.add('KeyE');
    if (!e.repeat) {
      const lad = !paused && adventure?.ladder(robot ? robot.pos : s.car.pos);
      if (robot && tennisPress()) {
        /* start here, then hold to hit */
      } else if (lad) climbLadder(lad);
      else if (robot && bowlingPress()) {
        /* holding to roll */
      } else if (robot && golfCanSwing()) golfHold = 0;
      else if (robot && paiuteCampPress()) {
        /* greeted or shared a gift */
      } else if (robot) useQueued = true;
      else if (!(form === 'board' && boardTricks.air > 0)) enterLocation();
    }
    return;
  }
  // Look around (owner: "I should be able to look around ... wasd move and arrows look"): C turns
  // look mode on and off; in it the arrows swing the camera round you and WASD still moves you.
  if (e.code === 'KeyC' && !e.repeat && race.roam && !paused) {
    lookMode = !lookMode;
    lookKeys.clear();
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) keys.delete(k);
    beep(
      lookMode ? '👀 Look around! [left] [right] [up]' : '👀 Back to driving!',
      lookMode ? 'wow' : 'happy',
      2400
    );
    return;
  }
  if (lookMode && e.code.startsWith('Arrow') && !openWorld?.tennis()?.active) {
    e.preventDefault();
    lookKeys.add(e.code);
    return;
  }
  if (DRIVE_KEYS.includes(e.code)) {
    if (paused) return;
    e.preventDefault();
    telemetry.firstInput('keyboard');
    keys.add(e.code);
    if (!e.repeat) {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') tapUp = performance.now();
      if (e.code === 'KeyS' || e.code === 'ArrowDown') tapDown = performance.now();
    }
  }
  if (e.repeat) return;
  if (intro.active) {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      intro.advance();
    }
    return;
  }
  if (labBusy(labRide) && !e.repeat && (e.code === 'Enter' || e.code === 'Space')) {
    e.preventDefault();
    labSkipEdge = true;
    return;
  }
  if (e.code === 'KeyT' && !paused && race.roam && !skate && !s.flight.mode && !labBusy(labRide) && !dreams?.active()) {
    boostOn = false;
    transform();
  }
  if (
    e.code === 'Space' &&
    !paused &&
    !robot &&
    race.roam &&
    !e.target.closest?.('button,input,select,textarea') &&
    s.skateRide?.active
  )
    hopQueued = true;
  else if (
    e.code === 'Space' &&
    !paused &&
    !robot &&
    race.roam &&
    !e.target.closest?.('button,input,select,textarea') &&
    s.car.grounded &&
    !s.flight.mode &&
    !dreams?.ownsSim()
  )
    s.car.vel = [s.car.vel[0], s.car.vel[1] + (form === 'board' ? FLIGHT.ollie : FLIGHT.hop), s.car.vel[2]];
  if (e.code === 'KeyF') toggleBoost();
  if (e.code === 'KeyR' && !paused && !labBusy(labRide) && !dreams?.active()) {
    boostOn = false;
    telemetry.recover('key', s.car.pos);
    recover(s);
  }
  if (e.code === 'KeyQ' && !paused) {
    if (bowRiding()) bowLoose();
    else if (form === 'board' && boardTricks.air > 0) flipQueued = dirOf(stick());
    else {
      fireQueued = true;
      punchQueued = true;
    }
  }
  if (
    e.code === 'Enter' &&
    !paused &&
    (e.target === canvas || !e.target.closest?.('button,input,select,textarea,a,[tabindex]'))
  ) {
    // In the dark world only a flier flies (the quetzalcoatlus, won at its nest); the rest stay on the ground.
    const pastRide = openWorld?.era?.() === 'past' && form === 'car',
      flier = !!DINO_KINDS[herd().herd[herd().mount]?.kind]?.flies;
    if (pastRide && !flier && !s.flight.mode) beep(`🦖 ${dinoName()} can't fly!`, 'sad');
    else if (
      race.roam &&
      !skate &&
      !adventure?.underground(s.car.pos) &&
      !labUnderground(s.car.pos) &&
      !annexDark(s.car.pos) &&
      !labBusy(labRide) &&
      !dreams?.active()
    ) {
      const was = s.flight.mode,
        m = toggleFlight(s.flight, s.car, {roam: true});
      if (m !== was) {
        audio.boost();
        callout(
          winged()
            ? m === 'fly'
              ? '🪶 Fly! [return] land'
              : '🪶 Going down!'
            : m === 'fly'
              ? mode === 'kid'
                ? '✈ Flying! [down] climb · [up] dive · [return] parachute'
                : '✈ Flying! [return] parachute'
              : '🪂 PARACHUTE',
          2400
        );
      }
    } else fireQueued = true;
  }
  if (e.code === 'KeyB') setMode(mode === 'kid' ? 'bigKid' : 'kid');
  if (e.code === 'KeyM') setMuted(!muted);
  // Couch/TV (Ian, 6 Nov 2026): O must not leave the game. Typing on the laptop while the
  // TV window had focus quit it. Exit stays on the pause menu button.
});
window.addEventListener('keyup', e => {
  keys.delete(e.code);
  lookKeys.delete(e.code);
  if (e.code === 'KeyE' && bowlingHold != null) bowlingRelease();
  if (e.code === 'KeyE' && golfHold != null) golfRelease();
  if (e.code === 'KeyE' && tennisHold != null) tennisRelease();
});
// Couch/TV (Ian, 6 Nov 2026): the TV window loses focus whenever someone types on the laptop, which froze the
// game mid-play. With a controller connected, keep playing on blur; keyboard-only play still pauses.
window.addEventListener('blur', () => {
  if (Array.from(navigator.getGamepads?.() ?? []).some(p => p?.connected)) return;
  pause(true);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause(true);
    telemetry.flush({force: true});
  }
});
touchControls = bindRCTouchControls({
  enabled: () => started && !paused && !document.body.classList.contains('modal-open'),
  onChange: value => {
    touchState = value;
  },
  onGrab: value => {
    skateTouchGrab = value;
  },
  onFire: () => {
    telemetry.firstInput('touch');
    fireQueued = true;
  }
});
$('touch').addEventListener(
  'pointerdown',
  () => {
    if (started && !paused) telemetry.firstInput('touch');
  },
  {capture: true}
);
window.addEventListener('pagehide', () => touchControls.destroy());
window.addEventListener('storage', e => {
  if (e.key === 'guns-only.telemetry-sharing.v1') telemetry.flush({force: true});
});
window.addEventListener('pagehide', () => {
  telemetry.raceQuit('pagehide');
  telemetry.endSession();
  telemetry.flush({force: true});
});
// Two chase cameras side by side. The polish pass is one-camera, so split renders plainly.
globalThis.__rcTv = {get pointers() { return pointers; }, get race() { return race; }, get split() { return split; }, get splitOn() { return splitOn; }};
function renderSplit(sc = scene) {
  if (split?.solo) {
    const cam = split.solo === 1 ? camera : camera2,
      keep = cam.aspect;
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
    renderer.render(sc, cam);
    cam.aspect = keep;
    cam.updateProjectionMatrix();
    return;
  }
  const w = innerWidth,
    h = innerHeight,
    half = Math.floor(w / 2),
    aspect = camera.aspect;
  renderer.setScissorTest(true);
  for (const [cam, x] of [
    [camera, 0],
    [camera2, half]
  ]) {
    cam.aspect = half / h;
    cam.updateProjectionMatrix();
    renderer.setViewport(x, 0, half, h);
    renderer.setScissor(x, 0, half, h);
    renderer.render(sc, cam);
  }
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, w, h);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  polish?.resize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
camera.position.set(course.start.pos[0], course.start.pos[1] + 2, course.start.pos[2] + 8);
// Rivals are clones of the current buggy; on the Blender asset each wears its own jet shell (F-15, A-10, F-22, Su-27, F-16).
// Rivals are tinted clones of whichever buggy is current (prototype, then the Blender asset).
// Rivals wear aggressor-squadron colours (Nellis nod): ghost blue, desert tan, splinter grey, flanker blue, arctic white.
const RIVAL_PAINT = ['#5d7fa3', '#c9a46c', '#8c969c', '#3f5f8a', '#dfe6ea'];
let rivalVis = [],
  rivalSource = null;
// Rival cars cost ~15 draws each, again in each of the two shadow maps. Past 25 m their shadows
// can't be seen (the sun's shadow box is tighter than that around the player), and parked in free
// drive past 150 m they can't be seen at all.
function rivalLod(v, car, me) {
  const d = Math.hypot(car.pos[0] - me.pos[0], car.pos[2] - me.pos[2]),
    cast = d < 25,
    show = !race.roam || d < 150;
  if (v.cast !== cast) {
    v.cast = cast;
    v.group.traverse(o => {
      if (o.isMesh) o.castShadow = cast;
    });
  }
  if (!show) v.group.visible = false;
}
function syncRivals() {
  if (rivalSource === car && rivalVis.length === race.rivals.length) return;
  rivalVis.forEach(v => {
    disposeJet(v.group);
    scene.remove(v.group);
  });
  rivalSource = car;
  rivalVis = race.rivals.map((_, i) => {
    const group = car.clone(true);
    unbatchCarParts(group);
    group.getObjectByName('VehicleBody')?.removeFromParent();
    fitJetShell(group, JET_KINDS[(i + 1) % 5], RIVAL_PAINT[i % 5]);
    clearcoat(group);
    paintNoseArt(group.getObjectByName('JetShell'), {});
    batchCarParts(group);
    scene.add(group);
    const named = ['FL', 'FR', 'RL', 'RR'].map(n => ({
      pivot: group.getObjectByName('Steer_' + n),
      wheel: group.getObjectByName('Wheel_' + n),
      front: n[0] === 'F'
    }));
    return {group, wheels: named.every(w => w.pivot && w.wheel) ? named : []};
  });
}
// Pickup presentation: gift crates, balloons, oil puddles, bubble shields.
let fireQueued = false;
const ICON = {
  zoom: '🔥 Zoom',
  balloon: '💧 Water balloon',
  oil: '🛢 Hydraulic leak',
  bubble: '✨ Chaff',
  foxtwo: '🎯 Fox Two',
  pitbull: '🐶 Pitbull',
  foxone: '📡 Fox One',
  zuni: '🚀 Zuni',
  laser: '👽 Laser turret'
};
const crates = race.pickups.spots.map(sp => {
  const g = new T.Group();
  g.position.set(...sp.pos);
  box(0, 0, 0, 0.22, 0.22, 0.22, '#ff5aa5', g);
  box(0, 0, 0, 0.235, 0.05, 0.235, '#ffe066', g);
  box(0, 0, 0, 0.05, 0.235, 0.235, '#ffe066', g);
  scene.add(g);
  return g;
});
const fxPool = new Map();
function fxMesh(key, make) {
  if (!fxPool.has(key)) {
    const m = make();
    scene.add(m);
    fxPool.set(key, m);
  }
  const m = fxPool.get(key);
  m.visible = true;
  return m;
}
function beamMesh() {
  const g = new T.PlaneGeometry(0.1, 25);
  g.translate(0, 12.5, 0);
  g.rotateX(-Math.PI / 2);
  const m = new T.Mesh(
    g,
    new T.MeshBasicMaterial({
      color: '#5ff8ff',
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: T.AdditiveBlending
    })
  );
  m.userData.noAO = true;
  return m;
}
function missileMesh() {
  const g = new T.Group(),
    body = new T.Mesh(
      new T.CylinderGeometry(0.035, 0.035, 0.26, 10),
      new T.MeshStandardMaterial({color: '#f4f4f0', roughness: 0.5})
    );
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const nose = new T.Mesh(
    new T.ConeGeometry(0.035, 0.08, 10),
    new T.MeshStandardMaterial({color: '#e8352e', roughness: 0.4})
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 0.17;
  g.add(nose);
  for (const r of [0, Math.PI / 2]) {
    const fin = new T.Mesh(
      new T.BoxGeometry(0.12, 0.005, 0.05),
      new T.MeshStandardMaterial({color: '#e8352e'})
    );
    fin.rotation.z = r;
    fin.position.z = -0.11;
    g.add(fin);
  }
  g.traverse(o => {
    o.castShadow = true;
  });
  return g;
}
// Laser turret: a little alien gunner climbs out of the roof behind a stubby cannon.
function alienGunner() {
  const g = new T.Group(),
    skin = new T.MeshStandardMaterial({color: '#7fe07a', roughness: 0.55}),
    dark = new T.MeshStandardMaterial({color: '#15181c', roughness: 0.3}),
    steel = new T.MeshStandardMaterial({color: '#5b6470', roughness: 0.4, metalness: 0.5});
  const body = new T.Mesh(new T.CapsuleGeometry(0.035, 0.05, 4, 10), skin);
  body.position.y = 0.06;
  g.add(body);
  const head = new T.Mesh(new T.SphereGeometry(0.05, 16, 12), skin);
  head.scale.set(1, 1.15, 1);
  head.position.y = 0.14;
  g.add(head);
  // The gunner sits turned round, grinning at the pack it is passing; the cannon still points forward.
  for (const x of [-0.02, 0.02]) {
    const eye = new T.Mesh(new T.SphereGeometry(0.016, 10, 8), dark);
    eye.scale.set(1, 1.5, 0.6);
    eye.position.set(x, 0.15, 0.042);
    g.add(eye);
  }
  const grin = new T.Mesh(new T.TorusGeometry(0.016, 0.003, 4, 10, Math.PI), dark);
  grin.rotation.z = Math.PI;
  grin.position.set(0, 0.122, 0.047);
  g.add(grin);
  const stalk = new T.Mesh(new T.CylinderGeometry(0.003, 0.003, 0.05, 5), skin);
  stalk.position.set(0, 0.205, 0);
  g.add(stalk);
  const bob = new T.Mesh(new T.SphereGeometry(0.009, 8, 6), new T.MeshBasicMaterial({color: '#ff4fd8'}));
  bob.position.set(0, 0.232, 0);
  g.add(bob);
  const arm = new T.Mesh(new T.CapsuleGeometry(0.008, 0.05, 3, 6), skin);
  arm.position.set(0.045, 0.1, 0.01);
  arm.rotation.z = -0.9;
  arm.name = 'wave';
  g.add(arm);
  const mount = new T.Mesh(new T.BoxGeometry(0.07, 0.035, 0.07), steel);
  mount.position.set(0, 0.03, -0.06);
  g.add(mount);
  const barrel = new T.Mesh(new T.CylinderGeometry(0.012, 0.014, 0.14, 10), steel);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.045, -0.13);
  g.add(barrel);
  const tip = new T.Mesh(new T.SphereGeometry(0.014, 8, 6), new T.MeshBasicMaterial({color: '#ff3b30'}));
  tip.position.set(0, 0.045, -0.2);
  g.add(tip);
  g.traverse(o => {
    o.castShadow = true;
  });
  return g;
}
function laserBeam() {
  const g = new T.CylinderGeometry(0.03, 0.03, 1, 8, 1, true);
  g.translate(0, 0.5, 0);
  g.rotateX(Math.PI / 2);
  const m = new T.Mesh(
    g,
    new T.MeshBasicMaterial({
      color: '#ff3b30',
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: T.AdditiveBlending
    })
  );
  m.userData.noAO = true;
  return m;
}
const balloonMat = new T.MeshStandardMaterial({color: '#4fc3ff', roughness: 0.2}),
  oilMat = new T.MeshStandardMaterial({color: '#1b1b22', roughness: 0.05, metalness: 0.6}),
  bubbleMat = new T.MeshPhysicalMaterial({
    color: '#bfefff',
    transparent: true,
    opacity: 0.28,
    roughness: 0,
    depthWrite: false
  });
const SPARK = ['#4fc3ff', '#ffa020', '#d84bff'];
// Flight HUD (owner, 2026-10-30), in the guns-only F-22's language: a horizon and pitch ladder
// that roll with the car, a heading tape, speed and height boxes, and power with the burner.
// Hidden on the ground; landing hands back to driving with a callout.
const hud = $('flight-hud'),
  hg = hud.getContext('2d');
let hudMode = null;
// Riding a winged dinosaur (the quetzalcoatlus): it flies on the same flight model, but without the
// jet's HUD, flame, parachute or retro thrusters; it flaps, glides and lands by itself.
const winged = () => !!(riggedDino?.root.visible && riggedDino.actions.has('glide'));
function drawFlightHud() {
  const mode = race.roam && !robot && !winged() ? s.flight.mode : null;
  if (winged() && !s.flight.mode && hudMode === 'wing') beep('🪶 Landed!', 'happy');
  if (winged()) {
    hudMode = s.flight.mode ? 'wing' : null;
    hud.hidden = true;
  }
  if (mode !== hudMode && !winged()) {
    if (hudMode && !mode && performance.now() > skyLandingUntil) callout('🛬 Landed!');
    hudMode = mode;
    hud.hidden = !mode;
  }
  if (!mode) return;
  const dpr = Math.min(2, devicePixelRatio || 1),
    W = innerWidth,
    H = innerHeight;
  if (hud.width !== Math.round(W * dpr) || hud.height !== Math.round(H * dpr)) {
    hud.width = Math.round(W * dpr);
    hud.height = Math.round(H * dpr);
  }
  // Attitude from the view itself (the chase camera rides the car), so the ladder sits on the real horizon.
  const c = s.car,
    q = camera.quaternion,
    f = new T.Vector3(0, 0, -1).applyQuaternion(q),
    rt = new T.Vector3(1, 0, 0).applyQuaternion(q),
    up = new T.Vector3(0, 1, 0).applyQuaternion(q);
  const pitch = Math.asin(Math.max(-1, Math.min(1, f.y))),
    roll = Math.atan2(-rt.y, up.y),
    heading = ((Math.atan2(f.x, -f.z) * 180) / Math.PI + 360) % 360;
  const ground = course.world.raycast([c.pos[0], c.pos[1] + 0.05, c.pos[2]], [0, -1, 0], 400),
    agl = ground ? ground.dist : null;
  const G = '#7dff9c',
    ink = (w = 2) => {
      hg.lineWidth = w;
      hg.strokeStyle = G;
      hg.fillStyle = G;
      hg.shadowColor = 'rgba(0,20,8,.85)';
      hg.shadowBlur = 4;
    };
  hg.setTransform(dpr, 0, 0, dpr, 0, 0);
  hg.clearRect(0, 0, W, H);
  ink();
  hg.font = '600 15px ui-monospace,Menlo,monospace';
  hg.textBaseline = 'middle';
  const cx = W / 2,
    cy = H * 0.46,
    pxPerDeg = Math.min(W, H) * 0.012;
  // Pitch ladder and horizon, rolled about the waterline.
  hg.save();
  hg.translate(cx, cy);
  hg.rotate(-roll);
  for (let d = -90; d <= 90; d += 10) {
    const y = ((pitch * 180) / Math.PI - d) * pxPerDeg;
    if (Math.abs(y) > H * 0.32) continue;
    const w = d === 0 ? W * 0.22 : W * 0.06;
    hg.setLineDash(d < 0 ? [8, 6] : []);
    hg.beginPath();
    hg.moveTo(-w, y);
    hg.lineTo(-w * 0.25, y);
    hg.moveTo(w * 0.25, y);
    hg.lineTo(w, y);
    hg.stroke();
    if (d) {
      hg.textAlign = 'right';
      hg.fillText(Math.abs(d), -w - 6, y);
      hg.textAlign = 'left';
      hg.fillText(Math.abs(d), w + 6, y);
    }
  }
  hg.setLineDash([]);
  hg.restore();
  // Waterline (where the nose points).
  hg.beginPath();
  hg.moveTo(cx - 34, cy);
  hg.lineTo(cx - 12, cy);
  hg.lineTo(cx - 6, cy + 8);
  hg.moveTo(cx + 34, cy);
  hg.lineTo(cx + 12, cy);
  hg.lineTo(cx + 6, cy + 8);
  hg.stroke();
  // Heading tape.
  const ty = H * 0.74;
  hg.textAlign = 'center';
  for (let d = -30; d <= 30; d += 5) {
    const hdg = Math.round(heading / 5) * 5 + d,
      x = cx + (hdg - heading) * 6;
    if (Math.abs(x - cx) > W * 0.22) continue;
    const v = ((hdg % 360) + 360) % 360;
    hg.beginPath();
    hg.moveTo(x, ty);
    hg.lineTo(x, ty + (v % 10 ? 6 : 12));
    hg.stroke();
    if (v % 10 === 0) hg.fillText(String(v / 10).padStart(2, '0'), x, ty + 24);
  }
  hg.beginPath();
  hg.moveTo(cx, ty - 4);
  hg.lineTo(cx - 6, ty - 14);
  hg.lineTo(cx + 6, ty - 14);
  hg.closePath();
  hg.fill();
  // Speed (left) and height above ground (right) boxes.
  const box = (x, label, value) => {
    hg.strokeRect(x - 44, cy - 16, 88, 32);
    hg.textAlign = 'center';
    hg.font = '600 20px ui-monospace,Menlo,monospace';
    hg.fillText(value, x, cy);
    hg.font = '600 12px ui-monospace,Menlo,monospace';
    hg.fillText(label, x, cy + 30);
  };
  box(
    cx - W * 0.28,
    'KM/H',
    String(Math.round((mode === 'fly' ? s.flight.speed : Math.hypot(...c.vel)) * 3.6))
  );
  box(cx + W * 0.28, 'AGL M', agl == null ? '---' : agl.toFixed(agl < 10 ? 1 : 0));
  // Power and burner, lower left; the one key that matters, bottom centre.
  hg.font = '600 14px ui-monospace,Menlo,monospace';
  hg.textAlign = 'left';
  const px = cx - W * 0.28 - 44,
    py = cy + 70;
  if (mode === 'fly') {
    hg.strokeRect(px, py, 88, 10);
    hg.fillRect(px, py, 88 * s.flight.power, 10);
    hg.fillText('PWR', px, py + 24);
    // Zoom (the afterburner): a lit ZOOM box when it's on, an outlined F ZOOM when it's off (F turns it on).
    hg.strokeRect(px + 96, py - 6, 64, 22);
    if (burning || boostOn) {
      hg.fillRect(px + 96, py - 6, 64, 22);
      hg.fillStyle = '#03240c';
      hg.textAlign = 'center';
      hg.fillText('ZOOM', px + 128, py + 5);
      hg.fillStyle = G;
    } else {
      hg.textAlign = 'center';
      hg.fillText('F ZOOM', px + 128, py + 5);
    }
    hg.textAlign = 'left';
  } else hg.fillText('🪂 CHUTE', px, py + 12);
  hg.textAlign = 'center';
  hg.fillText(mode === 'fly' ? '⏎ parachute · F zoom' : 'floating down…', cx, H * 0.86);
}
// Cold-gas retro thrusters under the car for the last second of a parachute landing (physics/flight.mjs):
// four white puffs pointing down, with a hiss when they light.
let retroJets = null,
  retroWas = false;
function retroFx(now) {
  const on = s.flight.mode === 'chute' && !!s.flight.retro && !robot && !winged();
  if (on && !retroJets) {
    retroJets = new T.Group();
    const m = new T.MeshBasicMaterial({
      color: '#eef6ff',
      transparent: true,
      opacity: 0.75,
      depthWrite: false
    });
    for (const [x, z] of [
      [-0.12, -0.16],
      [0.12, -0.16],
      [-0.12, 0.16],
      [0.12, 0.16]
    ]) {
      const c = new T.Mesh(new T.ConeGeometry(0.05, 0.35, 10, 1, true), m);
      c.position.set(x, -0.22, z);
      retroJets.add(c);
    }
  }
  if (retroJets) {
    if (on && retroJets.parent !== car) car.add(retroJets);
    retroJets.visible = on;
    if (on)
      retroJets.children.forEach((c, i) => {
        const k = 0.8 + 0.35 * Math.sin(now * 0.06 + i * 1.7);
        c.scale.set(1, k, 1);
        c.position.y = -0.2 - 0.17 * k;
      });
  }
  if (on && !retroWas) audio.boost();
  retroWas = on;
}
function drawPickups(now) {
  if (robot && adventure?.inside(robot.pos)) return; // the mine HUD owns the item slot
  const pk = race.pickups;
  crates.forEach((g, i) => {
    const sp = pk.spots[i];
    g.visible = sp.ready <= 0;
    g.rotation.y = now * 0.002 + i;
    g.position.y = sp.pos[1] + Math.sin(now * 0.003 + i) * 0.04;
  });
  for (const m of fxPool.values()) m.visible = false;
  // Afterburner flame out of the tail, and the parachute canopy over a floating car.
  if (burning && !winged()) {
    const f = fxMesh('burner', () => {
      const g = new T.Group(),
        outer = new T.Mesh(
          new T.ConeGeometry(0.045, 0.32, 12),
          new T.MeshBasicMaterial({color: '#ff5a0a', transparent: true, opacity: 0.88, depthWrite: false})
        ),
        inner = new T.Mesh(
          new T.ConeGeometry(0.024, 0.2, 10),
          new T.MeshBasicMaterial({
            color: '#bfe4ff',
            transparent: true,
            opacity: 0.9,
            blending: T.AdditiveBlending,
            depthWrite: false
          })
        );
      for (const m of [outer, inner]) {
        m.rotation.x = Math.PI / 2;
        g.add(m);
      }
      outer.position.z = 0.16;
      inner.position.z = 0.1;
      return g;
    });
    f.position.set(...s.car.pos);
    f.quaternion.set(...s.car.q);
    f.translateZ(0.2);
    f.translateY(0.03);
    f.scale.set(1, 1, 0.8 + Math.random() * 0.5);
  }
  if (s.flight.mode === 'chute' && !winged()) {
    const c = fxMesh('chute', () => {
      const g = new T.Group(),
        canopy = new T.Mesh(
          new T.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4),
          new T.MeshStandardMaterial({color: '#ff5a36', roughness: 0.7, side: T.DoubleSide})
        );
      canopy.position.y = 0.62;
      canopy.scale.y = 0.55;
      g.add(canopy);
      const stripe = new T.Mesh(
        new T.SphereGeometry(0.425, 16, 8, 0, Math.PI * 2, Math.PI / 5.2, Math.PI / 14),
        new T.MeshStandardMaterial({color: '#fff4d6', roughness: 0.7, side: T.DoubleSide})
      );
      stripe.position.y = 0.62;
      stripe.scale.y = 0.55;
      g.add(stripe);
      const line = new T.LineSegments(
        new T.BufferGeometry().setFromPoints(
          [
            [-0.33, 0.6, -0.25],
            [-0.08, 0.05, -0.1],
            [0.33, 0.6, -0.25],
            [0.08, 0.05, -0.1],
            [-0.33, 0.6, 0.25],
            [-0.08, 0.05, 0.1],
            [0.33, 0.6, 0.25],
            [0.08, 0.05, 0.1]
          ].map(p => new T.Vector3(...p))
        ),
        new T.LineBasicMaterial({color: '#2b2b2b'})
      );
      g.add(line);
      return g;
    });
    c.position.set(...s.car.pos);
    c.rotation.set(0, -readout(s).yaw, Math.sin(now * 0.003) * 0.08);
  }
  // Foam toy missiles: white body, red nose, a puff of smoke behind; the dangled one hangs off the bumper.
  const drawMissile = (key, pos, dir) => {
    const m = fxMesh(key, missileMesh);
    m.position.set(...pos);
    m.rotation.set(0, Math.atan2(dir[0], dir[2]), 0);
  };
  pk.missiles.forEach((m, i) => {
    drawMissile('m' + i, m.pos, m.dir);
    if (!paused) fx.puff(m.pos);
  });
  // Fox One radar beam: shown while your beam-rider is in the air; steering sweeps it.
  if (pk.missiles.some(m => m.kind === 'foxone' && m.owner === s.car)) {
    const b = fxMesh('beam', beamMesh),
      d = beamDir(s.car);
    b.position.set(s.car.pos[0], s.car.pos[1] + 0.08, s.car.pos[2]);
    b.rotation.set(0, Math.atan2(-d[0], -d[2]), 0);
  }
  // Carried missiles sit on a small rear bumper rack. The rack point matches the
  // defensive trailer collision, so a held Pitbull never visually circles the car.
  [...(pk.dangle ?? [])].forEach((c, i) => {
    const n = pk.ammo.get(c) ?? 1;
    for (let k = 0; k < n; k++) {
      const p = heldMissilePose(c, k, n);
      drawMissile(`rack${i}_${k}`, p.pos, p.dir);
    }
  });
  pk.balloons.forEach((b, i) =>
    fxMesh('b' + i, () => new T.Mesh(new T.SphereGeometry(0.07, 12, 8), balloonMat)).position.set(...b.pos)
  );
  pk.slicks.forEach((o, i) => {
    const m = fxMesh('o' + i, () => {
      const d = new T.Mesh(new T.CircleGeometry(0.5, 20), oilMat);
      d.rotation.x = -Math.PI / 2;
      return d;
    });
    m.position.set(o.pos[0], o.pos[1] - 0.12, o.pos[2]);
  });
  [race.player.car, ...race.rivals.map(r => r.session.car)].forEach((c, i) => {
    const m = modifiers(pk, c);
    if (!m.lasering) return;
    // Pops up over the first 0.4 s, waves while firing, ducks back in over the last 0.3 s.
    const g = fxMesh('alien' + i, alienGunner),
      t = LASER.seconds - m.laserLeft,
      rise = Math.min(1, t / 0.4, m.laserLeft / 0.3);
    g.position.set(...c.pos);
    g.quaternion.set(...c.q);
    g.translateY(0.07 + rise * 0.06 - 0.06);
    g.scale.setScalar(0.4 + 0.6 * rise);
    g.getObjectByName('wave').rotation.z = -0.9 + Math.sin(now * 0.02) * 0.6;
  });
  (pk.zaps ?? []).forEach((z, i) => {
    const b = fxMesh('zap' + i, laserBeam),
      d = [z.to[0] - z.from[0], z.to[1] - z.from[1], z.to[2] - z.from[2]],
      l = Math.hypot(...d);
    b.position.set(...z.from);
    b.lookAt(z.to[0], z.to[1], z.to[2]);
    b.scale.set(1, 1, l);
    const f = fxMesh(
      'flash' + i,
      () =>
        new T.Mesh(
          new T.SphereGeometry(0.12, 12, 8),
          new T.MeshBasicMaterial({
            color: '#ffd0c8',
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            blending: T.AdditiveBlending
          })
        )
    );
    f.position.set(...z.to);
    f.scale.setScalar(0.6 + z.life * 4);
  });
  if ((pk.zaps ?? []).some(z => z.owner === s.car && z.life > 0.19)) audio.fire();
  // Drift sparks off both rear wheels: blue, then orange, then purple as the mini-turbo charges.
  const tier = s.assist.driftTier || 0;
  if (tier) {
    const col = SPARK[tier - 1],
      c = s.car,
      q = new T.Quaternion(...c.q);
    c.params.wheels.forEach((w, wi) => {
      const at = c.wheels[wi].contactPoint;
      if (w.front || !at) return;
      for (let k = 0; k < 3; k++) {
        const m = fxMesh(
          `spark${wi}_${k}`,
          () =>
            new T.Mesh(
              new T.SphereGeometry(0.018, 6, 4),
              new T.MeshBasicMaterial({transparent: true, depthWrite: false, blending: T.AdditiveBlending})
            )
        );
        m.material.color.set(col);
        m.material.opacity = 0.95;
        const j = (now * 0.0037 + k * 0.37 + wi * 0.21) % 1,
          p = new T.Vector3(
            Math.sign(w.at[0]) * (0.02 + j * 0.05),
            0.015 + j * (0.08 - j * 0.06),
            0.03 + j * 0.18
          ).applyQuaternion(q);
        m.position.set(at[0] + p.x, at[1] + p.y, at[2] + p.z);
        m.scale.setScalar((1.5 - j) * (1 + tier * 0.35));
      }
    });
  }
  [race.player.car, ...race.rivals.map(r => r.session.car)].forEach((c, i) => {
    if (modifiers(pk, c).shielded)
      fxMesh('s' + i, () => new T.Mesh(new T.SphereGeometry(0.34, 20, 14), bubbleMat)).position.set(...c.pos);
  });
  // Brevity codes: an empty pickup slot reads WINCHESTER once you have fired something.
  const held = pk.held.get(s.car),
    laserOn = modifiers(pk, s.car);
  if (held) drawPickups.used = true;
  const ammo = pk.ammo.get(s.car);
  $('item').textContent = laserOn.lasering
    ? `👽 LASER ${Math.ceil(laserOn.laserLeft)}s`
    : held
      ? `${ICON[held]}${ammo > 1 ? ' ×' + ammo : ''} · Q`
      : '📻 Out of shots';
  $('item').hidden = !held && !drawPickups.used && !laserOn.lasering;
}
// The racing line shows in both difficulties, in races and in Free Drive (owner, 2026-10-29).
// A sprint's guide stops at the finish: drawn closed it ran a bogus chord back to the start (Hangar Hop: 242 m).
const drivingLine = createRacingLine(scene, race.line, course.world, {
  closed: course.event?.kind !== 'sprint'
});
// Skill shortcuts get their own (narrower) line, so you can see the hard way through.
const altLines = (course.alts ?? []).map(a =>
  createRacingLine(scene, a.nodes, course.world, {closed: false, width: 0.34})
);
const districtGuides = new Map();
let activeDistrictGuide = null;
function disposeRacingLine(line) {
  if (!line) return;
  line.mesh.removeFromParent();
  line.mesh.geometry.dispose();
  line.mesh.material.dispose();
}
const finishTitle = at =>
  at === 1 ? '1st! Wow!' : at === 2 ? '2nd! Nice one' : at === 3 ? '3rd! Good job!' : 'Go again!';
function drawLine(now) {
  const enabled = !s.finished && !race.furball;
  const show = enabled && (!race.roam || !openWorld);
  drivingLine.mesh.visible = show;
  if (show) drivingLine.update(s.car.pos, s.car.speed, now / 1000);
  for (const l of altLines) {
    l.mesh.visible = show;
    if (show) l.update(s.car.pos, s.car.speed, now / 1000);
  }
  const nearby = enabled && openWorld && race.roam ? openWorld.districtAt(s.car.pos) : null;
  activeDistrictGuide = nearby?.id ?? null;
  if (nearby && !districtGuides.has(nearby.id)) {
    const line = nearby.course.ai.map(n => [n.pos[0], n.pos[2], n.halfWidth || 2]);
    districtGuides.set(nearby.id, createRacingLine(scene, line, course.world));
  }
  // Forza-style A to B: a destination picked in Places draws its road route as a racing line.
  const trip =
    enabled && openWorld && race.roam && !s.flight.mode && openWorld.target() ? openWorld.route() : null;
  if (trip !== tripSource) {
    tripSource = trip;
    disposeRacingLine(tripLine);
    tripLine = null;
    if (trip?.length > 1)
      tripLine = createRacingLine(
        scene,
        trip.map(p => [p[0], p[1]]),
        course.world,
        {closed: false, width: 0.7, step: 1}
      );
  }
  if (tripLine) {
    tripLine.mesh.visible = !!trip;
    if (trip) tripLine.update(s.car.pos, s.car.speed, now / 1000);
  }
  const pull =
    enabled && openWorld && race.roam && !s.flight.mode && !openWorld.target() && !nearby
      ? roamPullTarget(openWorld.progress, s.car.pos)
      : null;
  const pullDist = pull ? worldDistance(s.car.pos, pull.pos) : Infinity;
  const pullKey = pull ? pull.id : null;
  const pullMoved =
    pull &&
    (!roamPullFrom ||
      worldDistance(s.car.pos, roamPullFrom) > 14 ||
      worldDistance(pull.pos, roamPullTo) > 1);
  if (pullKey !== roamPullKey || pullMoved) {
    roamPullKey = pullKey;
    disposeRacingLine(roamPullLine);
    roamPullLine = null;
    if (pull && pullDist > 8) {
      roamPullFrom = [...s.car.pos];
      roamPullTo = [...pull.pos];
      roamPullLine = createRacingLine(
        scene,
        [
          [s.car.pos[0], s.car.pos[2]],
          [pull.pos[0], pull.pos[2]]
        ],
        course.world,
        {closed: false, width: 0.55, step: 2}
      );
    }
  } else if (!pull) {
    roamPullKey = null;
    disposeRacingLine(roamPullLine);
    roamPullLine = null;
  }
  if (roamPullLine) {
    roamPullLine.mesh.visible = pullDist >= 60;
    if (roamPullLine.mesh.visible) roamPullLine.update(s.car.pos, s.car.speed, now / 1000);
  }
  for (const [id, l] of districtGuides) {
    l.mesh.visible = id === activeDistrictGuide && !tripLine && !roamPullLine?.mesh.visible;
    if (l.mesh.visible) l.update(s.car.pos, s.car.speed, now / 1000);
  }
}
let tripSource = null,
  tripLine = null,
  roamPullKey = null,
  roamPullLine = null,
  roamPullFrom = null,
  roamPullTo = null;
const place = () => placeOf(race, s);
// Feature visuals: glowing Afterburner chevrons on the road; plywood kickers matching their collision.
const padTex = (() => {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ff7a1a';
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#ffd23f';
  for (let y = 8; y < 128; y += 40) {
    g.beginPath();
    g.moveTo(8, y + 28);
    g.lineTo(32, y);
    g.lineTo(56, y + 28);
    g.lineTo(56, y + 38);
    g.lineTo(32, y + 12);
    g.lineTo(8, y + 38);
    g.fill();
  }
  const t = new T.CanvasTexture(c);
  t.wrapT = T.RepeatWrapping;
  t.colorSpace = T.SRGBColorSpace;
  return t;
})();
const padMeshes = (trackFeatures?.pads ?? []).map(p => {
  const m = new T.Mesh(
    new T.PlaneGeometry(1.4, 1.4),
    new T.MeshStandardMaterial({
      map: padTex,
      emissive: '#ff6a00',
      emissiveMap: padTex,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.92,
      polygonOffset: true,
      polygonOffsetFactor: -2
    })
  );
  m.rotation.set(-Math.PI / 2, 0, Math.atan2(p.fwd[0], p.fwd[2]) + Math.PI, 'YXZ');
  m.rotation.order = 'YXZ';
  m.rotation.y = Math.atan2(p.fwd[0], p.fwd[2]) + Math.PI;
  m.position.set(p.pos[0], p.pos[1] + 0.02, p.pos[2]);
  m.userData.noAO = true;
  scene.add(m);
  return m;
});
for (const k of trackFeatures?.kickers ?? []) {
  const W = 0.8,
    H = 0.28,
    L = 1.8,
    S = 0.5,
    g = new T.BufferGeometry(),
    v = [];
  const P = (a, c, u) => [
    k.pos[0] + k.fwd[0] * a + k.fwd[2] * c,
    k.pos[1] + u,
    k.pos[2] + k.fwd[2] * a - k.fwd[0] * c
  ];
  const tri = (a, b, c) => v.push(...a, ...b, ...c),
    quad = (a, b, c, d) => {
      tri(a, b, c);
      tri(a, c, d);
    };
  quad(P(-L / 2, -W, 0), P(-L / 2, W, 0), P(L / 2, W, H), P(L / 2, -W, H));
  quad(P(L / 2, -W, H), P(L / 2, W, H), P(L / 2 + 0.6, W, 0), P(L / 2 + 0.6, -W, 0));
  for (const sgn of [-1, 1]) {
    quad(
      P(-L / 2, sgn * W, 0),
      P(L / 2, sgn * W, H),
      P(L / 2, sgn * (W + S), 0),
      P(-L / 2, sgn * (W + S), 0)
    );
    quad(
      P(L / 2, sgn * W, H),
      P(L / 2 + 0.6, sgn * W, 0),
      P(L / 2 + 0.6, sgn * (W + S), 0),
      P(L / 2, sgn * (W + S), 0)
    );
  }
  g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  const m = new T.Mesh(
    g,
    new T.MeshStandardMaterial({color: '#c79a5e', roughness: 0.85, side: T.DoubleSide})
  );
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
}
// Radio-style callouts (brevity codes) flash in the banner slot for a moment.
let calloutTimer = 0; // Big Kid has no auto-unstick: after 3 s of throttle against something, say how to get out, once per episode.
// The edge of the map (telemetry 2026-10-30: the owner's son drove for the horizon mountains and got
// stuck on the boundary wall). Near the edge: say so, and route him to Spirit Mountain instead.
let edgeHintAt = -1e9;
function edgeHint(now) {
  if (!openWorld || !race.roam || paused || s.flight.mode) return;
  const p = robot ? robot.pos : s.car.pos,
    d = Math.min(p[0] - BOUNDS[0], BOUNDS[2] - p[0], p[2] - BOUNDS[1], BOUNDS[3] - p[2]);
  if (d > 25 || now - edgeHintAt < 30000) return;
  edgeHintAt = now;
  openWorld.navigate('mountain', s.car.pos);
  audio.radio();
  callout('🏔️ Follow the line!', 5000);
}
let stuckHinted = false;
function stuckHint() {
  if (mode !== 'bigKid' || race.roam || paused || s.finished) {
    stuckHinted = false;
    return;
  }
  if ((s.stuckTime ?? 0) < 3) {
    stuckHinted = false;
    return;
  }
  if (stuckHinted) return;
  stuckHinted = true;
  callout(navigator.maxTouchPoints > 0 ? 'Stuck? Tap Recover' : 'Stuck? [R] fixes it');
}
// The hero only beeps (docs/design/adventure: "The hero beeps; the words are for reading"): a robot
// sound for the feeling, and one short plain line, readable by a six-year-old, for what happened.
function beep(text, mood = 'happy', ms = 2600) {
  callout(text, ms);
  renderHint($('banner'), '🤖 ' + text); // [return] etc. drawn as his MacBook Air's keys
  audio.robot(mood);
}
function callout(text, ms = 1600) {
  const b = $('banner');
  renderHint(b, '📻 ' + text); // [key] tokens drawn as key caps; plain text otherwise
  b.hidden = false;
  b.dataset.callout = '1';
  clearTimeout(calloutTimer);
  calloutTimer = setTimeout(() => {
    delete b.dataset.callout;
    b.textContent = '🎺 Bugle time! Rivals stop — you keep driving';
    b.hidden = !retreatActive(race);
  }, ms);
}
// The RACE ring sits on the start line during free drive; driving into it lines everyone up.
let roamArmedAt = 30;
function goRoam() {
  team.on = false;
  if (openWorld && !race.roam) {
    location.href = rcLink({track: 'hub', at: nearestLocation(s.car.pos).id}, location.search);
    return;
  }
  roamArmedAt = s.travel + 30;
  race.roam = true;
  for (const x of [race.player, ...race.rivals.map(r => r.session)]) x.roam = true;
}
// Furball: battle mode on this track. Balloons ride above every car; the kid gets extra ones.
// Back to the menu from a result card: the menu is the paused brief.
function toMenu() {
  telemetry.raceQuit('menu');
  $('result').hidden = true;
  pause(true);
}
// Free drive on this track from anywhere (a race, a Furball, a result card).
function freeDrive() {
  telemetry.raceQuit('drive');
  if (openWorld) {
    location.href = rcLink({track: 'hub', at: nearestLocation(s.car.pos).id}, location.search);
    return;
  }
  if (!race.roam || race.furball) {
    race = createRace(course, {mode, opponents: rivalCount, roam: true, features: trackFeatures});
    s = race.player;
    reported = false;
  }
  goRoam();
}
function goFurball() {
  team.on = false;
  race = createRace(course, {
    mode,
    opponents: Math.max(3, rivalCount),
    features: trackFeatures,
    furball: true
  });
  s = race.player;
  paintKillMarks();
  reported = false;
  Object.assign(sfx, {gate: 0, coins: 0, held: false, air: 0, retreat: false, finished: false});
  startCountdown();
  callout('FURBALL!');
}
function furballOver(w) {
  if (reported) return;
  reported = true;
  const fb = race.furball,
    result = $('result'),
    name = x => (x === s ? 'You' : (race.rivals.find(r => r.session === x)?.callsign ?? 'Nobody')),
    down = fb.out.has(s.car);
  telemetry.furballOutcome({
    balloonsLeft: down ? 0 : fb.lives.get(s.car),
    pops: fb.pops.get(s.car),
    kills: fb.kills.get(s.car),
    duration: s.time,
    winner: w === s
  });
  result.hidden = false;
  result.classList.remove('team-card');
  result.innerHTML = resultPanel({
    badge: w === s ? 'WIN' : down ? 'OUT' : null,
    badgeTitle: 'Furball result',
    title:
      w === s ? '🎈 You win!' : down ? `💥 ${name(w)} wins` : `🎈 ${name(w)} wins`,
    stats: [
      ['Pops', String(fb.pops.get(s.car) ?? 0)],
      ['Balloons', String(down ? 0 : fb.lives.get(s.car))]
    ],
    again: '🎈 Again'
  });
  pause(true);
  $('again').onclick = () => {
    telemetry.choice('again');
    result.hidden = true;
    goFurball();
    pause(false);
  };
  $('explore').onclick = () => {
    telemetry.choice('drive');
    result.hidden = true;
    race = createRace(course, {mode, opponents: rivalCount, roam: true, features: trackFeatures});
    s = race.player;
    goRoam();
    pause(false);
  };
  $('to-menu').onclick = toMenu;
}
// Kill marks for this round go on every jet; lifetime unlocks only on the player's.
function paintKillMarks() {
  const k = c => race.furball?.kills.get(c) ?? 0;
  paintNoseArt(car.getObjectByName('JetShell'), {tier: artTier(aceKills), marks: k(s.car)});
  race.rivals.forEach((rv, i) => {
    if (rivalVis[i]) paintNoseArt(rivalVis[i].group.getObjectByName('JetShell'), {marks: k(rv.session.car)});
  });
}
// Lives are weather balloons on long tethers, up over the rooftops, so you can see where
// everyone is across the base. A popped one breaks free and sails off into the sky.
const balloonVis = new Map(),
  floaters = [],
  tetherMat = new T.LineBasicMaterial({color: '#3a3f44', transparent: true, opacity: 0.6});
function weatherBalloon(colour) {
  const m = new T.Mesh(
    new T.SphereGeometry(0.3, 18, 12),
    new T.MeshStandardMaterial({
      color: new T.Color(colour).lerp(new T.Color('#ffffff'), 0.55),
      roughness: 0.45
    })
  );
  m.scale.y = 1.12;
  const box = new T.Mesh(new T.BoxGeometry(0.07, 0.09, 0.07), new T.MeshStandardMaterial({color: '#e8e2d0'}));
  box.position.y = -0.55;
  m.add(box);
  return m;
}
function drawLives(now, dt) {
  const fb = race.furball,
    cs = [s.car, ...race.rivals.map(r => r.session.car)];
  for (const [c, v] of balloonVis)
    if (!fb || !cs.includes(c)) {
      scene.remove(v.group);
      balloonVis.delete(c);
    }
  race.rivals.forEach((rv, i) => {
    if (rivalVis[i]) rivalVis[i].group.visible = !fb?.out.has(rv.session.car);
  });
  for (const f of floaters) {
    f.vel[1] += dt * 0.6;
    f.mesh.position.x += f.vel[0] * dt;
    f.mesh.position.y += f.vel[1] * dt;
    f.mesh.position.z += f.vel[2] * dt;
    f.life -= dt;
    f.mesh.scale.multiplyScalar(1 + dt * 0.08);
    if (f.life <= 0) scene.remove(f.mesh);
  }
  for (let k = floaters.length - 1; k >= 0; k--) if (floaters[k].life <= 0) floaters.splice(k, 1);
  if (!fb) return;
  cs.forEach((c, ci) => {
    let v = balloonVis.get(c);
    if (!v) {
      const group = new T.Group(),
        colour = ci ? RIVAL_PAINT[(ci - 1) % 5] : '#f28c28',
        balls = [],
        lines = [];
      for (let j = 0; j < 5; j++) {
        const b = weatherBalloon(colour);
        group.add(b);
        balls.push(b);
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
        const l = new T.Line(g, tetherMat);
        l.frustumCulled = false;
        group.add(l);
        lines.push(l);
      }
      scene.add(group);
      balloonVis.set(c, (v = {group, balls, lines, n: fb.lives.get(c)}));
    }
    const n = fb.out.has(c) ? 0 : fb.lives.get(c);
    v.group.position.set(c.pos[0], c.pos[1], c.pos[2]);
    // Your own bunch flies straight over the chase camera, out of sight; the HUD counts it, and a
    // popped one still sails up past the screen.
    v.group.visible = c !== s.car;
    v.balls.forEach((b, j) => {
      const a = j * 1.26 + now * 0.0004,
        h = 3 + j * 0.38;
      b.position.set(Math.cos(a) * 0.45 + Math.sin(now * 0.0011 + j) * 0.12, h, Math.sin(a) * 0.45);
      b.visible = j < n;
      const p = v.lines[j].geometry.attributes.position;
      p.setXYZ(0, 0, 0.25, 0);
      p.setXYZ(1, b.position.x, h - 0.62, b.position.z);
      p.needsUpdate = true;
      v.lines[j].visible = j < n;
    });
    // Popped: the top balloon(s) cut loose and drift up and away.
    for (let j = n; j < v.n; j++) {
      const m = weatherBalloon(ci ? RIVAL_PAINT[(ci - 1) % 5] : '#f28c28');
      m.position.copy(v.balls[j].position).add(v.group.position);
      scene.add(m);
      floaters.push({mesh: m, vel: [(Math.random() - 0.5) * 0.8, 1.4, (Math.random() - 0.5) * 0.8], life: 6});
    }
    v.n = n;
  });
}
function startRace() {
  if (!raceReady() || openWorld?.setRacing(true) === false) return;
  race = createRace(course, {mode, opponents: rivalCount, features: trackFeatures});
  s = race.player;
  reported = false;
  Object.assign(sfx, {gate: 0, coins: 0, held: false, air: 0, retreat: false, finished: false});
  startCountdown();
}
function drawRoam() {
  gates.forEach(g => {
    g.visible = !race.roam && !race.furball;
  });
}
// Challenge coins (Re-Volt's stars): spinning gold discs; ones banked on an earlier visit show as
// faint ghosts. Banked coins live in this browser only (a per-viewer convenience).
const COIN_KEY = `guns-only.rc.coins.${track ?? 'base'}`;
let banked = new Set();
try {
  banked = new Set(JSON.parse(localStorage.getItem(COIN_KEY) || '[]'));
} catch {}
const coinGeo = new T.CylinderGeometry(0.11, 0.11, 0.025, 24);
coinGeo.rotateX(Math.PI / 2);
const coinMat = new T.MeshPhysicalMaterial({
  color: '#ffcc33',
  metalness: 0.9,
  roughness: 0.25,
  clearcoat: 1,
  emissive: '#8a5a00',
  emissiveIntensity: 0.35
});
const ghostMat = new T.MeshBasicMaterial({
  color: '#ffe9a8',
  transparent: true,
  opacity: 0.25,
  depthWrite: false
});
const coinMeshes = (course.coins ?? []).map(c => {
  const m = new T.Mesh(coinGeo, banked.has(c.name) ? ghostMat : coinMat);
  m.position.set(c.x, c.y + 0.12, c.z);
  m.castShadow = true;
  scene.add(m);
  return m;
});
function drawCoins(now) {
  const at = s.car.pos;
  (course.coins ?? []).forEach((c, i) => {
    const m = coinMeshes[i];
    m.rotation.y = now * 0.004 + i;
    // An 11 cm coin is sub-pixel past ~120 m; drawing all of them across the base cost ~40 draw calls.
    m.visible = !s.coins.includes(c.name) && Math.hypot(c.x - at[0], c.z - at[2]) < 120;
  });
  for (const n of s.coins)
    if (!banked.has(n)) {
      banked.add(n);
      try {
        localStorage.setItem(COIN_KEY, JSON.stringify([...banked]));
      } catch {}
    }
  const total = course.coins?.length ?? 0;
  $('coins').hidden = !total;
  $('coins').textContent = `🪙 ${banked.size}/${total}`;
}
// Rival callsign tags float above each car.
function nameTag(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#0d1b20cc';
  g.fillRect(0, 8, 256, 48);
  g.fillStyle = '#ffce73';
  g.font = 'bold 34px system-ui';
  g.textAlign = 'center';
  g.fillText(text, 128, 45);
  const sp = new T.Sprite(
    new T.SpriteMaterial({map: new T.CanvasTexture(c), depthWrite: false, transparent: true})
  );
  sp.scale.set(0.5, 0.125, 1);
  scene.add(sp);
  return sp;
}
let tags = [];
function drawTags() {
  if (tags.length !== race.rivals.length) {
    tags.forEach(t => scene.remove(t));
    tags = race.rivals.map(rv => nameTag(rv.callsign));
  }
  race.rivals.forEach((rv, i) => {
    const p = rv.session.car.pos;
    tags[i].position.set(p[0], p[1] + 0.42, p[2]);
  });
}
const finishOrder = () =>
  [race.player, ...race.rivals.map(r => r.session)]
    .sort((a, b) => placeOf(race, a) - placeOf(race, b))
    .map(x => (x === s ? 'YOU' : race.rivals.find(r => r.session === x).callsign));
let cameraCar = null;
const desired = new T.Vector3(),
  target = new T.Vector3(),
  map = $('map').getContext('2d');
// Minimap fits the route's bounding box.
const mapBox = (() => {
  const xs = cps.map(c => c[0]),
    zs = cps.map(c => c[1]),
    cx = (Math.min(...xs) + Math.max(...xs)) / 2,
    cz = (Math.min(...zs) + Math.max(...zs)) / 2,
    k = Math.min(
      150 / (Math.max(...xs) - Math.min(...xs) + 10),
      130 / (Math.max(...zs) - Math.min(...zs) + 10)
    );
  return track ? {cx, cz, k} : {cx: 0, cz: 0, k: null};
})();
function drawMap() {
  drawDetailedMinimap(map, {
    world: openWorld,
    course,
    race,
    player: s,
    yaw: readout(s).yaw,
    route: openWorld?.route?.()
  });
}
let reported = false;
// 3-2-1-GO: nobody moves until GO (Re-Volt start).
let countdown = -1,
  lastBeep = 0;
function startCountdown() {
  if (openWorld?.selected.id === 'alley-cat') callout('🎳 Alley Cat race!', 4500);
  telemetry.raceStart({kind: race.furball ? 'furball' : 'race', track: telemetryTrack, mode});
  countdown = 2.999;
  lastBeep = 4;
}
const sfx = {gate: 0, coins: 0, held: false, air: 0, retreat: false, finished: false};
let pumpkinsSmashed = 0;
let punchQueued = false,
  useQueued = false,
  street = null,
  boardTricks = createBoardTricks(),
  flipQueued = null,
  hopQueued = false,
  lastGrind = null,
  robot = null,
  robotBody = null,
  boardRider = null,
  p2BoardRider = null,
  p2Robot = null,
  p2RobotBody = null,
  p2PunchQueued = false,
  form = 'car',
  burning = false,
  boostOn = false,
  lastFlight = null,
  trickCalled = false,
  camHeading = null,
  camEasing = false;
const playmates = createPlaymates();
function soundEvents(r, c) {
  if (s.assist.driftFired) {
    audio.boost();
    if (s.assist.driftFired > 1) callout(s.assist.driftFired > 2 ? 'ULTRA TURBO!' : 'SUPER TURBO!');
  }
  if (s.gate !== sfx.gate) {
    if (s.gate > sfx.gate) audio.gate();
    sfx.gate = s.gate;
  }
  if (s.coins.length > sfx.coins) {
    audio.coin();
    sfx.coins = s.coins.length;
  }
  const held = race.pickups.held.has(c);
  if (held && !sfx.held) audio.pickup();
  sfx.held = held;
  if (c.wallImpact > 1.5) audio.impact(c.wallImpact);
  if (!c.contacts) sfx.air += 1 / 60;
  else {
    if (sfx.air > 0.25) audio.landing(Math.abs(c.vel[1]) + 2);
    sfx.air = 0;
  }
  const rt = retreatActive(race);
  if (rt && !sfx.retreat) audio.bugle();
  sfx.retreat = rt;
  if (s.finished && !sfx.finished) audio.finish();
  sfx.finished = s.finished;
}
function disposeJet(group) {
  const jet = group.getObjectByName('JetShell'),
    geos = new Set(),
    materials = new Set();
  jet?.traverse(o => {
    if (o.geometry) geos.add(o.geometry);
    if (o.material) materials.add(o.material);
  });
  for (const g of geos) g.dispose();
  for (const m of materials) {
    m.map?.dispose();
    m.dispose();
  }
}
// T cycles the toy's forms (docs/design/adventure): car -> walking robot -> skateboard -> car.
// The robot is its own controller; the board rides the car physics with board tuning, so every
// skate-park trick, grind and gap scores for it too.
function transform() {
  tennisStop();
  const r = readout(s),
    paint = openWorld?.progress?.paint ?? '#f28c28',
    carParams = roamCarParams;
  if (form === 'car') {
    robot = createRobot([r.x, r.y - rideHeight(s.car.params) + 0.01, r.z], r.yaw);
    if (!robotBody) {
      robotBody = makeRobotBody(paint);
      scene.add(robotBody);
    }
    robotBody.visible = true;
    car.visible = false;
    s.car.vel = [0, 0, 0];
    s.car.ang = [0, 0, 0];
    form = 'robot';
    callout('🤖 Robot! [T] skateboard');
  }
  // The Legend of Spirit Mountain: the skateboard is the Sewers' item, so until it's found T skips it.
  else if (
    form === 'robot' &&
    (openWorld?.era?.() === 'past' || (urlMode === 'legend' && !adventure?.inventory.items.includes('board')))
  ) {
    // in the past he's a cowboy who rides his dinosaur: no board
    const p = carParams(),
      pos = [robot.pos[0], robot.pos[1] + rideHeight(p) + 0.02, robot.pos[2]];
    Object.assign(s.car, createCar(p, pos, robot.yaw));
    robot = null;
    robotBody.visible = false;
    car.visible = true;
    form = 'car';
    callout(openWorld?.era?.() === 'past' ? `🦖 ${dinoName()}!` : '🚗 CAR');
  } else if (form === 'robot') {
    const p = vehicleParams('board'),
      pos = [robot.pos[0], robot.pos[1] + rideHeight(p) + 0.02, robot.pos[2]];
    Object.assign(s.car, createCar(p, pos, robot.yaw));
    robot = null;
    robotBody.visible = false;
    if (!boardRider) {
      boardRider = makeBoardRider(paint);
      scene.add(boardRider);
    }
    boardRider.visible = true;
    form = 'board';
    startStreet();
    callout('🛹 [space] jump · [Q] flip', 3200);
  } else {
    const p = carParams(),
      pos = [...s.car.pos];
    pos[1] += rideHeight(p) - rideHeight(s.car.params) + 0.02;
    Object.assign(s.car, createCar(p, pos, readout(s).yaw));
    boardRider.visible = false;
    car.visible = true;
    form = 'car';
    endStreet();
    callout('🚗 CAR');
  }
  audio.pickup();
  telemetry.form(form);
}
function applyShell(kind, colour, body = 'jet', look = {}) {
  if (assetState !== 'blender') return;
  unbatchCarParts(car);
  const old = car.getObjectByName('VehicleBody');
  if (old) {
    old.removeFromParent();
    const mats = new Set();
    old.traverse(o => {
      o.geometry?.dispose();
      if (o.material) mats.add(o.material);
    });
    for (const m of mats) m.dispose();
  }
  disposeJet(car);
  fitJetShell(car, kind, colour);
  if (body !== 'jet') {
    disposeJet(car);
    car.getObjectByName('JetShell')?.removeFromParent();
    if (body === 'buggy') {
      for (const n of ['Mesh_Body_shell', 'RakedCanopy', 'Mesh_Body_ivory', 'Mesh_Body_graphite']) {
        const o = car.getObjectByName(n);
        if (o) o.visible = true;
      }
      const shell = car.getObjectByName('Mesh_Body_shell');
      if (shell) {
        shell.material = shell.material.clone();
        shell.material.color.set(colour);
      }
    } else car.add(makeVehicleBody(body, colour));
  }
  clearcoat(car);
  paintNoseArt(car.getObjectByName('JetShell'), {tier: artTier(aceKills)});
  batchCarParts(car);
  applyLivery(car, {paint: colour, ...look});
  if (bodyKind !== body) {
    bodyKind = body;
    const params = vehicleParams(body === 'jet' ? 'buggy' : body),
      pos = [...s.car.pos];
    pos[1] += rideHeight(params) - rideHeight(s.car.params);
    Object.assign(s.car, createCar(params, pos, readout(s).yaw));
  }
  rivalSource = null;
}

let portalTravelling = false,
  gateTravelling = false,
  toyDino = null,
  toyCowboy = null,
  riggedDino = null,
  riggedLoad = null,
  rigs = new Map(),
  rigsLoading = new Set();
const bowState = createArrows(),
  bowView = createArrowView(scene),
  bowOrigin = new T.Vector3();
const bowRiding = () => openWorld?.era() === 'past' && !!(toyDino?.visible || riggedDino?.root.visible);

function bowTargets() {
  const targets = (openWorld?.gang?.()?.enemies ?? []).map(enemy => ({
    id: enemy.id,
    pos: [
      enemy.pos[0],
      (openWorld.groundAt?.(enemy.pos[0], enemy.pos[2]) ?? enemy.pos[1]) + 0.15,
      enemy.pos[2]
    ],
    alive: enemy.alive,
    toy: enemy,
    stun: stunOutlaw,
    // The gang's stomp contact is a little wider than the nose's loot reach. Grab first.
    reach: OUTLAWS.stompRadius
  }));
  for (const [i, steer] of (openWorld?.meadow?.()?.round?.steers ?? []).entries()) {
    steer.id ??= i;
    targets.push({
      id: `steer-${steer.id}`,
      pos: [steer.pos[0], (openWorld.groundAt?.(steer.pos[0], steer.pos[1]) ?? 0) + 1.1, steer.pos[1]],
      alive: steer.alive !== false,
      toy: steer,
      stun: stunSteer,
      reach: 1.6
    });
  }
  return targets;
}

function bowLoose() {
  if (!bowRiding() || paused || !race.roam) return;
  const rider = riggedDino?.root.visible ? riggedDino.rider : toyDino?.userData.rider;
  if (rider) rider.getWorldPosition(bowOrigin);
  else bowOrigin.fromArray(s.car.pos).y += 1.1;
  bowOrigin.y += 0.35;
  if (loose(bowState, {from: bowOrigin.toArray(), heading: readout(s).yaw, targets: bowTargets()})) {
    audio.zap();
    beep('⚡ Zap!', 'happy', 1000);
  }
}

function bowStep(dt) {
  if (paused) return;
  const past = openWorld?.era() === 'past',
    targets = past && race.roam ? bowTargets() : [];
  if (!bowRiding() || !race.roam) bowState.arrows.length = 0;
  for (const event of stepArrows(bowState, dt, targets)) {
    if (event.hit == null) continue;
    const target = targets.find(t => t.id === event.hit);
    if (target?.stun(target.toy)) {
      audio.zap();
      beep('⚡ Zap!', 'happy', 1000);
    }
  }
  if (bowRiding() && race.roam) {
    let batteries = 0,
      parts = 0;
    for (const target of targets) {
      if (!target.alive || !(target.toy.stunned > 0) || target.toy.stunLooted) continue;
      if (Math.hypot(target.pos[0] - s.car.pos[0], target.pos[2] - s.car.pos[2]) > target.reach) continue;
      // Don't collect from the ground while flying overhead on a winged mount.
      const feet = s.car.pos[1] - rideHeight(s.car.params),
        ground = openWorld.groundAt?.(target.pos[0], target.pos[2]) ?? target.pos[1] - 1;
      if (Math.abs(feet - ground) > 1.6) continue;
      target.toy.stunLooted = true;
      batteries++;
      parts += 1 + Math.floor(Math.random() * 2);
    }
    if (batteries) {
      addLoot(dexState(), {batteries, parts});
      saveDex();
      audio.creature(herd().herd[herd().mount]?.kind ?? 'rex', 'call');
      beep(
        `🔋 Got ${batteries === 1 ? 'a battery' : `${batteries} batteries`}! ⚙️ Got ${parts} ${parts === 1 ? 'part' : 'parts'}!`,
        'proud',
        2600
      );
    }
  }
  bowView.update(
    bowState,
    targets.filter(t => t.alive && t.toy.stunned > 0),
    dt
  );
}

// The Lake Town's outlaws (open-world/outlaws.mjs): ride the dinosaur through them, or fight on foot.
let outlawWarned = false;
function outlawStep(dt) {
  if (!openWorld?.outlaws || !race.roam || paused) return;
  const riding = !!(toyDino?.visible || riggedDino?.root.visible),
    attack = !!robot && punchQueued;
  if (!adventure) punchQueued = false;
  const ev = openWorld.outlaws({
    pos: robot ? robot.pos : s.car.pos,
    riding,
    speed: Math.hypot(s.car.vel[0], s.car.vel[2]),
    robot,
    input: {attack, lock: keys.has('ShiftLeft') || keys.has('ShiftRight') || padAim},
    mode,
    dt
  });
  const g = openWorld.gang(),
    inTown =
      openWorld.era() === 'past' &&
      g.enemies.some(e => e.alive) &&
      g.enemies.some(
        e =>
          Math.hypot(
            e.pos[0] - (robot ? robot.pos : s.car.pos)[0],
            e.pos[2] - (robot ? robot.pos : s.car.pos)[2]
          ) < 30
      );
  if (inTown && !outlawWarned) {
    outlawWarned = true;
    audio.radio();
    callout(riding ? '🤠 Bad toys! Run them down!' : '🤠 Bad toys! [Q] punch', 4200);
  }
  if (openWorld.era() !== 'past') outlawWarned = false;
  for (const e of ev) {
    if (e.stomp) {
      audio.impact(6);
      beep(`💥 Stomp! ${g.enemies.filter(x => x.alive).length} left`, 'happy', 1600);
      audio.creature(herd().herd[herd().mount]?.kind ?? 'rex', 'call');
    } else if (e.popped) {
      audio.impact(5);
    } else if (e.hurt) {
      audio.impact(3);
      beep(`💥 Ouch! 🔋 ${e.batteries}`, 'sad', 1200);
    }
    if (e.home && robot) {
      robot.pos = [...e.home];
      robot.vel = [0, 0, 0];
      beep('💫 Bonk! Try again.', 'sad');
    }
    if (e.cleared) {
      audio.finish();
      callout(e.reward ? '⭐ The town is free! New paint!' : '⭐ The town is free!', 5500);
      const pr = openWorld.progress;
      if (!pr.playerName)
        setTimeout(
          () =>
            askTyped('⭐ "What is your name?"', {
              placeholder: 'your name',
              max: 12
            }).then(v => {
              pr.playerName = nameFrom(v, 'Partner');
              openWorld.save();
              callout(`⭐ "Thank you, ${pr.playerName}!"`, 4000);
            }),
          2600
        );
      else callout(`⭐ "Thank you, ${pr.playerName}!"`, 4000);
    }
  }
}
// Dig down to the light world (open-world/dig.mjs): in the past, on foot, hold E; Space climbs out.
let flipFrom = 0;
function digStep(dt, now) {
  // Not in the dungeons: the mine and the sewers keep their own authored digging.
  if (!openWorld?.dig || !robot || paused || !race.roam || adventure?.underground(robot.pos)) return;
  const ev = openWorld.dig({
    pos: robot.pos,
    holding: keys.has('KeyE'),
    climb: keys.has('Space'),
    dt,
    time: now / 1000
  });
  for (const e of ev) {
    if (e.start) beep('⛏️ Dig down! [space] up', 'happy', 3000);
    else if (e.block === 'gold') {
      audio.coin();
      const n = earn(dexState(), GOLD.seam);
      saveDex();
      beep(`✨ Gold! +${n}`, 'proud', 1800);
    } else if (e.block === 'portal') {
      audio.radio();
    } else if (e.block) audio.impact(2);
    if (e.out) robot.vel = [0, 0, 0];
    if (e.through) {
      const [x, y, z] = e.position;
      robot.pos = [x, y + 0.3, z];
      robot.vel = [0, 4.5, 0];
      flipFrom = now;
      document.body.classList.remove('portal-flash');
      void document.body.offsetWidth;
      document.body.classList.add('portal-flash');
      document.body.classList.toggle('era-past', e.to === 'past');
      callout(e.to === 'past' ? '🙃 Long ago! Upside down!' : '🙃 Back to now! Upside down!', 4500);
    }
  }
  const floor = openWorld.digging() ? openWorld.digFloor() : null;
  if (floor) {
    robot.pos = [floor[0], floor[1] + 0.02, floor[2]];
    robot.vel = [0, 0, 0];
  }
}
// While digging the camera looks down the shaft; coming out, the world turns the right way up.
function digCamera(now) {
  const c = openWorld?.digCamera?.();
  if (c) {
    camera.position.set(...c.eye);
    camera.lookAt(...c.target);
  }
  const p = (now - flipFrom) / 1600;
  if (flipFrom && p < 1) {
    const q = Math.min(1, Math.max(0, (p - 0.35) / 0.65)),
      k = 1 - q * q * (3 - 2 * q);
    camera.rotateZ(Math.PI * k);
  }
}
// Typing short messages (open-world/typed.mjs, design doc): a word or two, forgiving, never a gate.
// Held keys are let go when the box opens (it keeps every keystroke to itself), so nothing drives
// off on its own; the world keeps turning behind it, without the pause menu in the way.
const askTyped = (q, o = {}) =>
  ask(q, {
    ...o,
    onOpen: () => {
      keys.clear();
      touchControls?.reset();
      fireQueued = false;
    },
    onClose: () => {
      keys.clear();
      canvas.focus();
    }
  });
// The herd (open-world/herd.mjs): every dinosaur you've befriended, the one you ride, the wild ones made friends.
let herdState = null;
const herd = () => (herdState ??= loadHerd(openWorld?.progress ?? {}));
function saveHerd() {
  const h = herd(),
    pr = openWorld.progress;
  pr.herd = h.herd.map(d => ({...d}));
  pr.mount = h.mount;
  pr.wildFriends = [...h.friends];
  pr.dinoName = h.herd[h.mount]?.name ?? pr.dinoName;
  openWorld.save();
}
const dinoName = () => herd().herd[herd().mount]?.name || 'Rex';
// The Dino Book and the purse (open-world/dex.mjs): kinds seen, gold dug up; portraits drawn once per kind.
let dexState_ = null,
  portraits = null,
  dexLook = 0;
const dexState = () => (dexState_ ??= loadDex(openWorld?.progress ?? {}));
function saveDex() {
  const d = dexState(),
    pr = openWorld.progress;
  pr.dexSeen = [...d.seen];
  pr.gold = d.gold;
  pr.batteries = d.batteries;
  pr.parts = d.parts;
  openWorld.save();
}
// Southern Paiute camp (paiute-camp.mjs): friends share; visit the fire, gifts come later.
let campState_ = null,
  campAtFire = false,
  campPresses = 0,
  campGave = false;
const campState = () => (campState_ ??= loadCamp(openWorld?.progress ?? {}));
function saveCampState() {
  saveCamp(openWorld.progress, campState());
  openWorld.save();
}
function nearCampFire(pos) {
  const [fx, fz] = CAMP.fire;
  return openWorld?.era?.() === 'past' && Math.hypot(pos[0] - fx, pos[2] - fz) < FIRE_RANGE;
}
function applyCampGift(kind) {
  if (kind === 'pinon') {
    const g = openWorld?.gang?.();
    if (g?.fighter) g.fighter.batteries = g.fighter.max;
  }
}
function paiuteCampPress() {
  if (!robot || paused || !race.roam || !nearCampFire(robot.pos)) return false;
  campPresses += 1;
  const st = campState();
  if (campPresses === 1) {
    const line = visit(st);
    const gift = returnGift(st, Math.random);
    saveCampState();
    beep(`🔥 ${line}`, 'happy', 3200);
    if (gift?.line) {
      applyCampGift(gift.kind);
      setTimeout(() => beep(`🧺 ${gift.line}`, 'happy', 3200), 900);
    } else if (dexState().batteries > 0) setTimeout(() => callout('🔋 [E] share a battery'), 1400);
  } else if (!campGave && dexState().batteries > 0) {
    // One gift a visit, so a held or hammered E never empties his pockets.
    campGave = true;
    const line = give(st, 'battery');
    if (line) {
      takeLoot(dexState(), {batteries: 1});
      saveDex();
      saveCampState();
      beep(`🔥 ${line}`, 'happy', 2800);
    }
  }
  return true;
}
function campStep(_dt, past) {
  if (!past) {
    campAtFire = false;
    campPresses = 0;
    return;
  }
  const here = robot ? robot.pos : s.car.pos;
  const near = nearCampFire(here);
  if (near !== campAtFire) {
    campPresses = 0;
    campGave = false;
    if (near && robot) callout('🔥 [E] say hi');
  }
  campAtFire = near;
}
// A new page: any wild one (or one of yours) close enough to see, checked a few times a second.
function dexStep(dt, past) {
  const g = $('gold');
  if (g) {
    const show = past || dexState().gold > 0;
    if (g.hidden === show) g.hidden = !show;
    if (show) g.textContent = `💰 ${dexState().gold}`;
  }
  if (!past || (dexLook -= dt) > 0) return;
  dexLook = 0.4;
  const me = robot ? robot.pos : s.car.pos;
  for (const [id, d] of wildViews) {
    const w = wildLeft(herd()).find(x => x.id === id);
    if (!w || !d.root.visible) continue;
    if (
      Math.hypot(d.root.position.x - me[0], d.root.position.z - me[2]) > (w.far ? SEE_RANGE * 3 : SEE_RANGE)
    )
      continue;
    if (see(dexState(), w.kind)) {
      saveDex();
      audio.radio();
      beep(`📖 New page: ${DINO_KINDS[w.kind].name}!`, 'wow', 3200);
    }
  }
}
function sayAloud() {
  askTyped('💬 Say:', {placeholder: 'hello'}).then(v => {
    if (v == null) return;
    const past = openWorld.era?.() === 'past',
      who = called(herd(), v);
    // A dinosaur's name: in the past it comes running (or swaps in under you); in the present it can't hear you.
    if (who && past) {
      const h = herd(),
        swap = who.index !== h.mount || !!robot;
      h.mount = who.index;
      saveHerd();
      if (robot) {
        mountUp();
        beep(`🦖 ${who.dino.name} is here!`, 'happy');
        audio.creature(who.dino.kind, 'call');
      } else if (swap) {
        // A different dinosaur under you: its own body and pace (physics/vehicles.mjs DINO_MOUNTS).
        const p = roamCarParams(),
          pos = [...s.car.pos];
        pos[1] += rideHeight(p) - rideHeight(s.car.params) + 0.05;
        Object.assign(s.car, createCar(p, pos, readout(s).yaw));
        beep(`🦖 ${who.dino.name} is here!`, 'happy');
        audio.creature(who.dino.kind, 'call');
      } else beep(`🦖 You are on ${who.dino.name}!`, 'ask');
      return;
    }
    const r = say(v, {era: past ? 'past' : 'present', mount: who?.dino.name ?? dinoName(), onFoot: !!robot});
    if (r.reply) beep(r.reply, 'happy', 3200);
  });
}
// Off foot and onto the dinosaur (the T cycle's robot→car step, without the board in between).
function mountUp() {
  const p = roamCarParams(),
    pos = [robot.pos[0], robot.pos[1] + rideHeight(p) + 0.02, robot.pos[2]];
  Object.assign(s.car, createCar(p, pos, robot.yaw));
  robot = null;
  if (robotBody) robotBody.visible = false;
  if (boardRider) boardRider.visible = false;
  form = 'car';
  audio.pickup();
  telemetry.form(form);
}
let dinoAsked = false;
function nameDino() {
  if (dinoAsked || herd().herd.length) return;
  dinoAsked = true;
  askTyped('🦖 Name your dino!', {placeholder: 'Rex', max: 12}).then(v => {
    const d = befriend(herd(), {kind: 'rex', name: nameFrom(v, 'Rex'), colour: 0});
    herd().mount = herd().herd.indexOf(d);
    saveHerd();
    beep(`🦖 ${d.name}! Roar!`, 'wow', 3000);
  });
}
// Wild dinosaurs on the lake floor: walk up to one on foot and name it to make friends.
const wildViews = new Map();
let wildAsking = null;
function wildStep(dt, past) {
  if (!openWorld || !past) {
    for (const v of wildViews.values()) v.root.visible = false;
    return;
  }
  const h = herd(),
    left = new Set(wildLeft(h).map(w => w.id)),
    me = robot ? robot.pos : s.car.pos,
    t = performance.now() / 1000;
  for (const w of wildLeft(h))
    if (!wildViews.has(w.id)) {
      // Each kind's own model, loaded the first time one is near; T. rexes in their colour pairs.
      const kind = DINO_KINDS[w.kind];
      if (!hasCharacter(kind.model)) {
        prepareCharacters([kind.model]).catch(() => {});
        continue;
      }
      const d = wildDino(spawnCharacter(scene, kind.model, {clip: 'idle'}));
      if (kind.tint) tintDino(d, DINO_COLOURS[w.colour]);
      wildViews.set(w.id, d);
    }
  for (const [id, d] of wildViews) {
    const w = left.has(id) ? wildLeft(h).find(x => x.id === id) : null;
    if (!w) {
      d.root.visible = false;
      continue;
    }
    // The nest's flier is seen from the Lake Town; the others only when you're close.
    const near = past && Math.hypot(me[0] - w.home[0], me[2] - w.home[2]) < (w.far ? 700 : 160);
    d.root.visible = near;
    if (!near) continue;
    // A lazy wander round its spot: walk a slow circle, stop to look about.
    const a = t * 0.18 + id.length,
      walk = !w.still && Math.sin(t * 0.25 + id.length) > -0.2,
      x = w.home[0] + (w.still ? 0 : Math.cos(a) * 2.5),
      z = w.home[2] + (w.still ? 0 : Math.sin(a) * 2.5);
    d.root.position.set(x, openWorld.groundAt?.(x, z) ?? 8, z);
    d.root.rotation.y = walk ? -a : d.root.rotation.y;
    d.play(walk ? 'walk' : 'idle');
    d.update(dt);
  }
  // Make friends: on foot, close to a wild one, a name.
  const w = past && robot && !wildAsking && !typing() ? wildNear(h, me) : null;
  if (w) {
    wildAsking = w.id;
    askTyped(`🦖 A wild ${DINO_KINDS[w.kind].name}! Name it:`, {
      placeholder: 'Spike',
      max: 12
    }).then(v => {
      if (v == null) {
        setTimeout(() => {
          wildAsking = null;
        }, 4000);
        return;
      }
      const d = befriend(herd(), {kind: w.kind, name: nameFrom(v, 'Spike'), colour: w.colour, wild: w.id});
      saveHerd();
      audio.finish();
      beep(d ? `🦖 ${d.name} is your friend!` : '🦖 Too many dinos!', d ? 'happy' : 'sad', 3500);
      if (d) audio.creature(d.kind, 'call');
      // The quetzalcoatlus: straight onto its back, ready to fly.
      if (d && DINO_KINDS[d.kind]?.flies && robot) {
        herd().mount = herd().herd.indexOf(d);
        saveHerd();
        mountUp();
        beep(`🪶 ${d.name}! [return] fly`, 'wow', 4000);
      }
      wildAsking = null;
    });
  }
}
// The ridden dinosaur's sounds (audio.creature): a footfall at each foot-down of its walk, run or
// gallop clip, a wingbeat at each flap, and a snort when it has stood still a while.
let dinoSaving = false,
  dinoPhase = null,
  dinoStill = 0;
function dinoSounds(dt) {
  const d = riggedDino;
  if (!d?.root.visible || paused) {
    dinoPhase = null;
    return;
  }
  // A flier's save is the animal's own will (owner, 31 Oct: "you can ask your quetz to do anything,
  // but it doesn't wanna crash and it generally won't"): when it pulls you up, it squawks and beats
  // its wings hard, so the save reads as the creature, not an autopilot.
  const saving = s.flight.mode === 'fly' && s.flight.gcas > 0 && d.actions.has('flap');
  if (saving && !dinoSaving) {
    audio.creature(herd().herd[herd().mount]?.kind ?? 'quetzal', 'call');
    d.play('flap', {fade: 0.08, timeScale: 1.8});
  }
  dinoSaving = saving;
  const kind = herd().herd[herd().mount]?.kind ?? 'rex',
    a = d.actions.get(d.clip),
    dur = a?.getClip().duration || 1,
    ph = a ? (a.time / dur) % 1 : 0,
    speed = Math.hypot(s.car.vel[0], s.car.vel[2]);
  if (dinoPhase !== null && dinoPhase !== ph) {
    const crossed = at => (dinoPhase < at && ph >= at) || (dinoPhase > ph && (at >= dinoPhase || ph >= at));
    if (['walk', 'run', 'gallop'].includes(d.clip) && (crossed(0) || crossed(0.5)))
      audio.creature(kind, 'step', Math.min(1, speed / 10));
    if (d.clip === 'flap' && crossed(0.2)) audio.creature(kind, 'flap', 0.8);
    if (d.clip === 'takeoff' && crossed(0.3)) audio.creature(kind, 'flap', 1);
  }
  dinoPhase = ph;
  dinoStill = speed < 0.3 ? dinoStill + dt : 0;
  if (dinoStill > 6) {
    dinoStill = -Math.random() * 4;
    audio.creature(kind, 'snort');
  }
}
// The walking robot / past-era cowboy (audio.footstep): a footfall at each foot-down of the walk.
let footPhase = null;
function footSounds() {
  if (!robot || paused || robot.climb) {
    footPhase = null;
    return;
  }
  const era = openWorld?.era?.() ?? 'present';
  if (era !== 'present' && era !== 'past') {
    footPhase = null;
    return;
  }
  const speed = Math.hypot(robot.vel[0], robot.vel[2]);
  if (!robot.grounded || speed < 0.1) {
    footPhase = null;
    return;
  }
  const ph = (robot.walkPhase / (Math.PI * 2)) % 1;
  if (footPhase !== null && footPhase !== ph) {
    const crossed = at => (footPhase < at && ph >= at) || (footPhase > ph && (at >= footPhase || ph >= at));
    if (crossed(0) || crossed(0.5))
      audio.footstep(era === 'past' ? 'cowboy' : 'robot', Math.min(1, speed / 3));
  }
  footPhase = ph;
}
// The car form's physics: in the dark world (the past) it is the ridden dinosaur's bigger body.
function roamCarParams() {
  if (openWorld?.era?.() === 'past') return mountParams(herd().herd[herd().mount]?.kind ?? 'rex');
  return urlMode === 'legend'
    ? legendCarParams(LEGEND_CARS[adventure?.inventory.car] ? adventure.inventory.car : 'starter')
    : vehicleParams(bodyKind === 'jet' || !bodyKind ? 'buggy' : bodyKind);
}
// The dark world is the past (open-world/dark-world.mjs): a time gate swaps the era and moves the toy.
function timeTrip(trip) {
  if (!trip) return;
  const [x, y, z] = trip.position,
    past = trip.to === 'past';
  if (robot) {
    if (trip.gate !== 'fade') {
      robot.pos = [x, y + 0.05, z];
      robot.vel = [0, 0, 0];
      robot.yaw = trip.yaw;
    }
  } else if (form === 'car') {
    const p = roamCarParams(),
      at =
        trip.gate === 'fade'
          ? [s.car.pos[0], s.car.pos[1] - rideHeight(s.car.params), s.car.pos[2]]
          : [x, y, z];
    Object.assign(
      s.car,
      createCar(p, [at[0], at[1] + rideHeight(p) + 0.06, at[2]], trip.yaw ?? readout(s).yaw)
    );
  } else if (trip.gate !== 'fade') {
    placeCar(s.car, [x, y + rideHeight(s.car.params) + 0.06, z], trip.yaw);
    s.car.vel = [0, 0, 0];
    s.car.ang = [0, 0, 0];
  }
  acc = 0;
  document.body.classList.toggle('era-past', past);
  document.body.classList.remove('portal-flash');
  void document.body.offsetWidth;
  document.body.classList.add('portal-flash');
  audio.pickup();
  callout(
    trip.gate === 'fade'
      ? '⌛ Back to now!'
      : past
        ? trip.gate === 'town'
          ? '⏳ Long ago! The old town.'
          : '⏳ Long ago!'
        : '⌛ Back to now!',
    4200
  );
}
async function travelTo(id) {
  if (!race.roam) return false;
  keys.clear();
  touchControls?.reset();
  fireQueued = false;
  lastThrottle = 0;
  const p = await openWorld?.travel(id);
  if (!p) return false;
  if (openWorld.activity()?.kind === 'bowling') {
    openWorld.cancelActivity(); // a ball left rolling would freeze its frame and keep races locked
    bowlingHold = null;
  }
  openWorld.stopSchool();
  hideSchoolCard();
  tennisStop();
  openWorld.stopDeliveries();
  const {pos, yaw} = p.arrival;
  openWorld.cancelSkyJump();
  skyReport?.hide();
  s.flight.mode = null;
  document.body.classList.toggle('era-past', openWorld.era?.() === 'past');
  if (robot) {
    robot.pos = [pos[0], pos[1] + 0.05, pos[2]];
    robot.vel = [0, 0, 0];
    robot.yaw = yaw;
    // The parked car comes too: the world streams (and the sim waits) around s.car, so leaving it
    // behind froze a jump made on foot at "Road downloading..." for good.
    s.car.pos = [pos[0], pos[1] + rideHeight(s.car.params) + 0.02, pos[2]];
    s.car.vel = [0, 0, 0];
  } else {
    const cp = roamCarParams();
    Object.assign(s.car, createCar(cp, [pos[0], pos[1] + rideHeight(cp) + 0.02, pos[2]], yaw));
  }
  acc = 0;
  cameraCar = null;
  camera.position.set(pos[0] - Math.sin(yaw) * 2, pos[1] + 0.8, pos[2] + Math.cos(yaw) * 2);
  roamArmedAt = s.travel + 30;
  keys.clear();
  touchControls?.reset();
  fireQueued = false;
  return true;
}
// Skate runs (THPS2) in the neighbourhood plaza: E in the park opens the goal card. Shift/RB
// grabs and reverts; on touch, Fire gives a short grab. Progress is remembered per browser.
// Each park: rules, the frame that maps world positions to its [u, v, h], its area, and the
// browser key that remembers its goals.
const SKATE_PARKS = {
  ny: {
    park: NY_PARK,
    key: 'guns-only.rc.skate.v1.ny',
    centre: NY.center,
    radius: 40,
    frame: p => {
      const l = bridgeLocal(p);
      return [l[0], l[2], l[1]];
    },
    world: ([x, z, h]) => bridgeWorld([x, h, z])
  },
  venice: {
    park: BOARDWALK_PARK,
    key: 'guns-only.rc.skate.v1.venice',
    centre: BOARDWALK.center,
    radius: 39,
    frame: p => {
      const l = boardwalkLocal(p);
      return [l[0], l[2], l[1]];
    },
    world: ([x, z, h]) => boardwalkWorld([x, h, z])
  },
  playground: {
    park: PLAYGROUND_PARK,
    key: 'guns-only.rc.skate.v1.playground',
    centre: PLAYGROUND.center,
    radius: 44,
    frame: p => {
      const l = playgroundLocal(p);
      return [l[0], l[2], l[1]];
    },
    world: ([x, z, h]) => playgroundWorld([x, h, z])
  },
  philly: {
    park: PLAZA_PARK,
    key: 'guns-only.rc.skate.v1.philly',
    centre: PLAZA.center,
    radius: 49,
    frame: p => {
      const l = plazaLocal(p);
      return [l[0], l[2], l[1]];
    },
    world: ([x, z, h]) => plazaWorld([x, h, z])
  },
  marseille: {
    park: MARSEILLE_PARK,
    key: 'guns-only.rc.skate.v1.marseille',
    centre: marseilleWorld([0, 0, 0]),
    radius: 53,
    frame: p => {
      const l = marseilleLocal(p);
      return [l[0], l[2], l[1]];
    },
    world: ([x, z, h]) => marseilleWorld([x, h, z])
  },
  skatestreet: {
    park: SKATESTREET_PARK,
    key: 'guns-only.rc.skate.v1.skatestreet',
    centre: SKATESTREET.center,
    radius: 54,
    frame: p => {
      const l = skatestreetLocal(p);
      return [l[0], l[2], l[1]];
    },
    world: ([x, z, h]) => skatestreetWorld([x, h, z])
  },
  intro: {
    park: INTRO_PARK,
    key: 'guns-only.rc.skate.v1.intro',
    centre: RESIDENTIAL_PARK.anchor,
    radius: 34,
    frame: p => {
      const {anchor: a, yaw} = RESIDENTIAL_PARK,
        c = Math.cos(yaw),
        n = Math.sin(yaw),
        x = (p[0] - a[0]) * c - (p[2] - a[2]) * n,
        z = (p[0] - a[0]) * n + (p[2] - a[2]) * c;
      return [...bankLocal([x, p[1], z]), p[1]];
    },
    world: ([u, v, h]) => {
      const b = bankPoint(u, v);
      return parkPoint([b[0], h, b[2]]);
    }
  },
  school: {
    park: SCHOOL_PARK,
    key: 'guns-only.rc.skate.v1.school',
    centre: yardWorld([0, 0, 0]),
    radius: 36,
    frame: p => {
      const l = yardLocal(p);
      return [l[0], l[2], l[1]];
    },
    world: ([x, z, h]) => yardWorld([x, h, z])
  },
  hangar: {
    park: HANGAR_PARK,
    key: 'guns-only.rc.skate.v1.hangar',
    centre: HANGAR.center,
    radius: 36,
    frame: p => {
      const l = hangarLocal(p);
      return [l[0], l[2], l[1]];
    },
    world: ([x, z, h]) => hangarWorld([x, h, z])
  }
};
let skate = null,
  skatePark = null,
  skateHud = null,
  skateGrabUntil = 0;
const skateSaved = id => {
  const saved = {goals: [], best: 0, gaps: []};
  try {
    Object.assign(saved, JSON.parse(localStorage.getItem(SKATE_PARKS[id].key) || '{}'));
  } catch {}
  return saved;
};
const skateParkAt = () => {
  if (!openWorld || !race.roam) return null;
  for (const [id, p] of Object.entries(SKATE_PARKS))
    if (Math.hypot(s.car.pos[0] - p.centre[0], s.car.pos[2] - p.centre[2]) < p.radius) return id;
  return null;
};
// A park that shares its spot with a race (the starting plaza's Neighbourhood Run) offers both.
function skateCard(id, run = null) {
  const result = $('result'),
    saved = skateSaved(id),
    near = openWorld?.near(s.car.pos),
    race =
      near && !near.game && near.kind !== 'discovery' && canEnter(openWorld.progress, near) ? near : null;
  result.classList.remove('team-card');
  result.innerHTML = goalCard({
    park: SKATE_PARKS[id].park,
    goals: saved.goals,
    best: saved.best,
    run,
    gapsFound: saved.gaps,
    race: race && (eventById(race.event ?? (race.track ? 'district-' + race.track : ''))?.name ?? race.name)
  });
  result.hidden = false;
  pause(true);
  if (race)
    $('skate-race').onclick = () => {
      visitRace(race);
    };
  $('skate-go').onclick = () => {
    if (run) telemetry.choice('skate_again');
    startSkateRun(id);
  };
  $('skate-free').onclick = () => {
    if (run) telemetry.choice('skate_free');
    result.hidden = true;
    pause(false);
    canvas.focus();
  };
  $('skate-go').focus();
}
function startSkateRun(id) {
  $('result').hidden = true;
  if (street) {
    street = null;
    document.body.classList.remove('free-skate');
  }
  const def = SKATE_PARKS[id];
  skateHud?.stop();
  skateHud ??= createSkateHud({scene, T});
  skatePark = id;
  skate = createSkate(def.park, skateSaved(id).goals);
  setSkateRails(s, def.park, def.world);
  skateHud.start(skate, def.world);
  telemetry.skateStart(id);
  const {at, toward} = def.park.start,
    p = def.world([...at, def.park.start.height ?? 0]),
    q = def.world([at[0] + toward[0], at[1] + toward[1], 0]),
    ground = course.world.raycast([p[0], p[1] + 3, p[2]], [0, -1, 0], 6)?.point[1] ?? p[1];
  placeCar(
    s.car,
    [p[0], ground + rideHeight(s.car.params) + 0.02, p[2]],
    Math.atan2(q[0] - p[0], -(q[2] - p[2]))
  );
  acc = 0;
  cameraCar = null;
  pause(false);
  canvas.focus();
}
// Free skate (owner, 2026-10-30: tricks on the skateboarding robot, a proper THPS2 clone): on the
// board anywhere in free drive, flips (Q), grabs (E) and spins (steer) combo with manuals, scored
// by the park rules without a clock. A park run takes over while it lasts.
// Up/down count as a trick direction only when tapped just before the trick: W/↑ also rolls
// the board, and holding it would turn every flip into an Impossible.
let tapUp = -1e9,
  tapDown = -1e9;
const stick = () => {
  const now = performance.now(),
    fresh = t => now - t < 350;
  return {
    x: Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')),
    y:
      (keys.has('KeyW') || keys.has('ArrowUp')) && fresh(tapUp)
        ? 1
        : (keys.has('KeyS') || keys.has('ArrowDown')) && fresh(tapDown)
          ? -1
          : 0
  };
};
// The Sewers' way in and out: the manhole in the street, a ladder at each end below.
function climbLadder(l) {
  keys.clear();
  if (robot) {
    robot.pos = [...l.pos];
    robot.vel = [0, 0, 0];
    robot.yaw = l.yaw;
  } else placeCar(s.car, [l.pos[0], l.pos[1] + rideHeight(s.car.params) + 0.02, l.pos[2]], l.yaw);
  acc = 0;
  cameraCar = null;
  camHeading = null;
  audio.gate();
  callout(l.down ? '🕳️ The sewers! Try not to fall in the slime' : '🪜 Back up in the street', 2800);
  if (street) refreshStreetRails();
}
function startStreet() {
  if (street || skate || !race.roam || form !== 'board') return;
  skateHud ??= createSkateHud({scene, T});
  street = createStreetSkate();
  refreshStreetRails();
  skateHud.start(street, streetFrame);
  document.body.classList.add('free-skate');
}
// The Rat King fight in the Sewers' bowl (physics/rat-king.mjs): callouts, sounds and the bump.
function ratEvent(ev) {
  if (ev.wake) {
    audio.radio();
    callout('👑 Rat King! Jump on him', 4200);
  } else if (ev.tell === 'rear') {
    audio.radio();
    callout('🐀 He is going to charge · move!', 1600);
  } else if (ev.charge) {
    audio.impact(2);
  } else if (ev.bump) {
    audio.impact(4);
    callout('💥 Bumped off!', 1400);
    const [ax, az] = ev.away;
    if (robot) {
      robot.vel = [ax * 2.5, 2, az * 2.5];
    } else {
      if (street) bailRun(street);
      s.car.vel = [ax * 3, 2.2, az * 3];
    }
  } else if (ev.ratHit) {
    audio.splash();
    audio.impact(5);
    callout(ev.ratHit < 3 ? `👑 Hit! ${ev.ratHit} of 3 · the slime is rising!` : '👑 Hit! 3 of 3!', 2600);
  } else if (ev.ratFreed) {
    audio.finish();
    callout('👑 Nice rat now! Box is open', 5000);
  } else if (ev.ratGrab) {
    callout('🛹 [E] grab on landing', 2000);
  } else if (ev.ratDodge) {
    callout('🐀 Too fast! Get on your skateboard [T]', 2000);
  }
}
// F (or Y on a pad) toggles boost in free drive; in the air it's the afterburner. Shown on the
// instruments while it's on, and on the flight HUD as AB.
function toggleBoost() {
  if (paused || robot || !race.roam || skate) return;
  // Flying School's rings are set for normal speed: a scripted kid pilot loops 8 of 8 rings at
  // normal power and 0 of 8 with the afterburner (flying-school-pilot.test.mjs).
  if (!boostOn && openWorld?.school()?.active) {
    callout('✈ No zoom in Flying School!', 1800);
    return;
  }
  boostOn = !boostOn;
  callout(
    boostOn
      ? s.flight.mode
        ? '🔥 Zoom on · [F] off'
        : '🔥 Boost on · [F] off'
      : s.flight.mode
        ? 'Zoom off'
        : 'Boost off',
    900
  );
}
// Trick-or-treat (open-world/trick-or-treat.mjs): any trick near a lit porch earns candy. The car's
// tricks are measured here (a jump, a mid-air spin, a long drift); the board's come from its combo
// landings and the robot's from its jumps.
const retreatGame = createRetreat();
function retreatStep(dt) {
  const ready = !!openWorld && race.roam && started && !paused && !ui?.panel() && !s.flight.mode,
    speed = robot ? Math.hypot(robot.vel[0], robot.vel[2]) : s.car.speed;
  for (const e of stepRetreat(
    retreatGame,
    speed,
    ready,
    dt,
    (((worldElapsed % 1200) + 1200) % 1200) / 1200
  )) {
    const word = (e.start ?? e.stopped ?? e.kind) === 'reveille' ? 'REVEILLE' : 'RETREAT';
    if (e.start) {
      audio.bugle();
      callout(
        `🎺 ${word}! Stop for flag!`,
        RETREAT.grace * 1000
      );
    } else if (e.stopped) callout('🫡 Stay still for the flag…', RETREAT.hold * 1000 + 300);
    else if (e.done) {
      audio.finish();
      const pr = openWorld.progress;
      pr.retreats = (pr.retreats ?? 0) + 1;
      openWorld.save();
      callout(`🫡 PERFECT ${word}! All stopped`, 3000);
    } else callout('😅 Oops! You kept going', 2400);
  }
}
// The rocket booster landing on LZ-1 (open-world/booster.mjs): heard and called out when you're near.
function boosterEvent(e) {
  if (e.distance > 2500) return;
  if (e.boom) {
    audio.impact(6);
    setTimeout(() => audio.impact(5), 180);
    callout('💥 Rocket coming! Look up!', 4500);
  } else if (e.burn) {
    audio.boost();
    callout('🚀 Fire! It is slowing down!', 2000);
  } else if (e.landed) {
    audio.finish();
    const pr = openWorld.progress;
    pr.boosters = (pr.boosters ?? 0) + 1;
    openWorld.save();
    callout('🚀 The rocket landed!', 3000);
  }
}
// Sky Tour uses the same fixed flight segments as Flying School. A map jump or recovery
// is never a cloud collection or a gate crossing. Reuse the pilot and previous point each tick.
const skyPrev = [0, 0, 0],
  skyPilot = {pos: null, prevPos: skyPrev, flightMode: null};
let skyLastPlacement = null;
const skyEligible = () => !!openWorld && race.roam && !robot && !skate;
function skyTourStep(placement, dt) {
  if (!skyEligible()) return;
  const moved =
    s.car.placement !== placement || (skyLastPlacement !== null && s.car.placement !== skyLastPlacement);
  skyLastPlacement = s.car.placement;
  if (moved) openWorld.stopCanyon();
  const clouds = openWorld.cloudStep(
    s.car.pos,
    moved ? s.car.pos : skyPrev,
    !moved && s.flight.mode === 'fly'
  );
  if (clouds?.whoosh) audio.cloud();
  if (clouds?.rising) callout('⤴ Rising air!', 2000);
  if (clouds?.collectedMask) {
    for (let i = 0; i < CLOUDS.length; i++)
      if (clouds.collectedMask & (1 << i)) openWorld.progress.clouds.push(CLOUDS[i].id);
    openWorld.save();
    callout(`☁️ Cloud ${openWorld.progress.clouds.length} of ${CLOUDS.length}!`, 2500);
    audio.coin();
  }
  if (moved) return;
  skyPilot.pos = s.car.pos;
  skyPilot.flightMode = s.flight.mode;
  for (const e of openWorld.canyonStep(dt, skyPilot)) {
    if (e.prepare) callout('🏜️ Canyon Run! [return] fly', 3500);
    else if (e.start) callout('🏜️ Fly through gold gates', 3500);
    else if (e.done) {
      openWorld.progress.canyonBest = e.best;
      openWorld.save();
      const medal = e.medal === 'gold' ? '🥇 Gold' : e.medal === 'silver' ? '🥈 Silver' : '🥉 Bronze';
      callout(`🏜️ ${e.time.toFixed(1)}s · ${medal}!`, 5000);
      audio.finish();
    } else if (e.gate) {
      callout(`🏜️ ${e.gate} of ${e.of}`, 1500);
      audio.gate();
    }
  }
}
// Flying School is a place in free drive. The rules and ring meshes live with the world;
// placement, keyboard callouts and the small report card stay with the player here.
let schoolNear = false,
  schoolPlacement = null,
  schoolReport = false;
function hideSchoolCard() {
  schoolReport = false;
  $('school-hud').hidden = true;
}
$('school-close').onclick = () => {
  hideSchoolCard();
  canvas.focus();
};
function schoolEvent(e) {
  if (e.lessonStart) {
    hideSchoolCard();
    placeCar(s.car, e.start.pos, e.start.yaw);
    s.car.speed = s.car.forwardSpeed = 0;
    s.car.grounded = false;
    s.car.contacts = 0;
    Object.assign(s.flight, createFlight());
    toggleFlight(s.flight, s.car, {roam: true});
    s.flight.speed = FLIGHT.minSpeed + FLIGHT.startPower * (FLIGHT.maxSpeed - FLIGHT.minSpeed);
    // Lessons start level in the air; the normal ground takeoff climb would miss ring one.
    s.flight.climb = 0;
    s.flight.gcas = 0;
    s.flight.heading = null;
    boostOn = false;
    schoolPlacement = s.car.placement;
    cameraCar = null;
    audio.boost();
    callout(
      e.lessonStart === 1
        ? '✈ Fly through the gold rings! [E] stop'
        : e.lessonStart === 2
          ? '✈ Loop! Hold [down] to go round'
          : '🛬 Fly down through the rings! [return] land',
      4500
    );
  } else if (e.schoolDone) {
    const rows = $('school-rows');
    rows.replaceChildren();
    for (const row of e.card) {
      const tr = document.createElement('tr');
      for (const [i, text] of [
        row.name,
        '⭐'.repeat(row.stars),
        `${row.passed}/${row.total}`,
        `${Math.round(row.time)}s`
      ].entries()) {
        const cell = document.createElement(i === 0 ? 'th' : 'td');
        cell.textContent = text;
        if (i === 0) cell.scope = 'row';
        if (i === 1) cell.setAttribute('aria-label', `${row.stars} stars`);
        if (i === 2) cell.title = 'Rings';
        if (i === 3) cell.title = 'Time';
        tr.append(cell);
      }
      rows.append(tr);
    }
    const pr = openWorld.progress;
    pr.flyingSchool = (pr.flyingSchool ?? 0) + 1;
    pr.flyingStars = Math.max(
      pr.flyingStars ?? 0,
      e.card.reduce((n, row) => n + row.stars, 0)
    );
    openWorld.save();
    schoolReport = true;
    $('school-hud').hidden = false;
    audio.finish();
    callout('⭐ Great flying!', 3000);
  } else if (e.lessonDone) {
    audio.gate();
    callout(`${'⭐'.repeat(e.stars)} Great flying!`, 2200);
  } else if (e.landing) {
    callout('🛬 Now land on the runway · [return]', 5000);
  } else if (e.ring) {
    audio.coin();
    callout(`⭕ ${e.ring} of ${e.of}`, 1300);
  }
}
function schoolStep(prevPos, dt) {
  const school = openWorld?.school();
  if (!school?.active) return;
  // Recovery and map jumps are placements, not ring-crossing flight segments.
  if (!race.roam || robot || skate || openWorld.era() === 'past' || s.car.placement !== schoolPlacement) {
    openWorld.stopSchool();
    return;
  }
  for (const e of openWorld.schoolStep(dt, {
    pos: s.car.pos,
    prevPos,
    flightMode: s.flight.mode,
    speed: Math.hypot(...s.car.vel),
    onGround: s.car.grounded
  }))
    schoolEvent(e);
}
function schoolFrame() {
  const eligible = race.roam && !robot && !skate && openWorld.era() !== 'past';
  if (!eligible) openWorld.stopSchool();
  const distance = Math.hypot(s.car.pos[0] - SCHOOL.at[0], s.car.pos[2] - SCHOOL.at[2]);
  if (!eligible || distance > SCHOOL.leaveRadius) hideSchoolCard();
  $('school-hud').hidden = !schoolReport || paused;
  const near =
    eligible &&
    started &&
    !paused &&
    !s.flight.mode &&
    !openWorld.school()?.active &&
    distance <= SCHOOL.startRadius;
  if (near && !schoolNear) callout('✈ Flying School! [E] start', 3500);
  schoolNear = near;
}
// Tennis starts by walking onto the left court. Its score and hold meter share
// one small row; all key hints go through callout/renderHint.
let tennisHold = null,
  tennisNear = false,
  tennisAimHint = false;
const tennisEligible = () => !!(openWorld && started && race.roam && robot && openWorld.era() !== 'past');
function tennisStop() {
  openWorld?.stopTennis();
  tennisHold = null;
  tennisNear = false;
  $('tennis-hud').hidden = true;
}
function tennisPress() {
  if (!tennisEligible() || paused || ui.panel()) return false;
  const game = openWorld.tennis();
  if (!game || !onTennisCourt(robot.pos, game.active ? 4 : 0)) return false;
  if (!game.active) {
    openWorld.startTennis(mode);
    hideSchoolCard();
    // A golf round can follow the robot here; its pending ball placement must
    // not move the player off the court halfway through a rally.
    golfRound = golfBall = golfRestAt = golfHold = null;
    golfWait = 0;
    if (golfMesh) golfMesh.visible = false;
    golfHud();
    const at = tennisStart();
    robot.pos = [at[0], golfGround(at[0], at[2]) + 0.02, at[2]];
    robot.vel = [0, 0, 0];
    robot.climb = null;
    robot.yaw = 0;
    lookMode = false;
    lookKeys.clear();
    lookYaw = lookPitch = 0;
    useQueued = false;
    tennisAimHint = false;
    callout('🎾 Hold [E], let go to hit', 4000);
  } else {
    tennisHold = 0;
    if (!tennisAimHint) {
      callout('🎾 [left] [right] aim', 2200);
      tennisAimHint = true;
    }
  }
  return true;
}
function tennisRelease() {
  const held = tennisHold;
  tennisHold = null;
  if (held == null || !tennisEligible() || paused || ui.panel()) return;
  const aim =
    Number(keys.has('ArrowRight') || keys.has('KeyD')) - Number(keys.has('ArrowLeft') || keys.has('KeyA'));
  if (openWorld.tennisSwing({...robot, power: swingPowerOf(held), aim})) audio.impact(1);
  else if (openWorld.tennis()?.ball) callout('🎾 Wait for the ball!', 1500);
}
function tennisStep(dt, drive) {
  const game = openWorld?.tennis();
  if (!game?.active) return;
  if (!tennisEligible() || !onTennisCourt(robot.pos, 4)) {
    tennisStop();
    return;
  }
  game.mode = mode;
  if (tennisHold != null) tennisHold += dt;
  if (Math.abs(drive.throttle) < 0.1) {
    const [dx, , dz] = tennisAssist(game, robot.pos, dt);
    robot.pos[0] += dx;
    robot.pos[2] += dz;
    robot.walkPhase += Math.hypot(dx, dz) * 9;
  }
  for (const e of openWorld.tennisStep(dt, robot)) {
    if (e.point) {
      tennisHold = null;
      audio.coin();
      callout(e.point === 'you' ? '🎾 Point to you!' : '🎾 Point to bot!', 1700);
    } else if (e.win) {
      if (e.win === 'you') {
        const pr = openWorld.progress;
        pr.tennisWins = Math.min(Number.MAX_SAFE_INTEGER, (pr.tennisWins ?? 0) + 1);
        openWorld.save();
      }
      audio.finish();
      callout(e.win === 'you' ? '🎾 You win!' : '🎾 Bot wins! Play again!', 4000);
    } else if (e.hit) audio.impact(1);
    else if (e.serve) callout('🎾 Hold [E], let go to hit', 2600);
  }
}
function tennisFrame() {
  const game = openWorld?.tennis();
  const here = tennisEligible() && onTennisCourt(robot.pos, 4);
  if (!here && (game?.active || game?.done)) tennisStop();
  if (paused || ui.panel()) tennisHold = null;
  const near = here && !paused && !ui.panel() && onTennisCourt(robot.pos);
  if (near && !tennisNear && !game?.active && !game?.done) callout('🎾 Tennis! [E] play', 3500);
  tennisNear = near;
  $('tennis-hud').hidden = !here || !(game?.active || game?.done) || paused || !!ui.panel();
  if (!game) return;
  const score = `${game.score.you} – ${game.score.bot}`;
  if ($('tennis-score').textContent !== score) $('tennis-score').textContent = score;
  const meter = $('tennis-meter');
  meter.hidden = tennisHold == null;
  if (tennisHold != null) {
    const power = swingPowerOf(tennisHold);
    meter.style.setProperty('--p', power.toFixed(3));
    meter.setAttribute('aria-valuenow', String(Math.round(power * 100)));
  }
}
// The Hot Wheels track (open-world/hot-wheels.mjs): boosters shove, the channel steers, and the loop
// is a ride once you arrive at it fast enough.
let hwLoop = null,
  hwBoosters = null;
const hwNear = () =>
  !!openWorld?.hotWheels?.() &&
  race.roam &&
  !robot &&
  !s.flight.mode &&
  Math.hypot(s.car.pos[0] - HOT_WHEELS.at[0], s.car.pos[2] - HOT_WHEELS.at[2]) < 90;
function hotWheelsPre() {
  if (!hwNear()) {
    hwLoop = null;
    return;
  }
  if (!hwLoop) {
    hwLoop = loopEntry(s.car);
    if (hwLoop) audio.boost();
  }
  if (!hwLoop) {
    hwBoosters ??= boosterPoints();
    const v = hwBoost(hwBoosters, s.car.pos, s.car.vel, 1 / 120);
    if (v !== s.car.vel && !hwBoosting) audio.boost();
    hwBoosting = v !== s.car.vel;
    s.car.vel = v;
    guideCar(openWorld.hotWheels().frames, s.car, 1 / 120);
  }
}
function hotWheelsPost() {
  if (hwLoop && !stepLoop(hwLoop, s.car, 1 / 120)) hwLoop = null;
}
let hwBoosting = false;
// A golf cart parked by the clubhouse at Sunrise Vista (the owner's son asked for one): drive up and
// press E to take it. It becomes your car (swap back any time in the Garage).
const CART_AT = [-312, 2806],
  cartProp = (() => {
    if (!openWorld) return null;
    const g = makeVehicleBody('golf', '#eef0e8');
    for (const [x, z] of [
      [-0.15, -0.2],
      [0.15, -0.2],
      [-0.15, 0.2],
      [0.15, 0.2]
    ]) {
      const w = new T.Mesh(
        new T.CylinderGeometry(0.06, 0.06, 0.05, 14),
        new T.MeshStandardMaterial({color: '#1d1f22', roughness: 0.8})
      );
      w.rotation.z = Math.PI / 2;
      w.position.set(x, -0.11, z);
      g.add(w);
    }
    g.scale.setScalar(1);
    g.rotation.y = 0.6;
    g.position.set(CART_AT[0], -100, CART_AT[1]);
    g.traverse(o => {
      if (o.isMesh) o.castShadow = true;
    });
    scene.add(g);
    return g;
  })();
let cartHinted = false;
function cartNear() {
  if (!cartProp?.visible || robot) return false;
  const p = s.car.pos;
  return Math.hypot(p[0] - CART_AT[0], p[2] - CART_AT[1]) < 3;
}
function cartStep() {
  if (!cartProp) return;
  const p = s.car.pos,
    d = Math.hypot(p[0] - CART_AT[0], p[2] - CART_AT[1]);
  cartProp.visible = openWorld.progress.body !== 'golf' && d < 300 && openWorld.era?.() !== 'past';
  if (cartProp.visible && cartProp.position.y < -50) {
    const hit = course.world.raycast([CART_AT[0], 60, CART_AT[1]], [0, -1, 0], 120);
    if (hit) cartProp.position.y = hit.point[1] + 0.16;
  }
  if (cartNear() && !cartHinted) {
    cartHinted = true;
    audio.radio();
    callout('🛺 A golf cart! [E] drive it', 3500);
  } else if (d > 8) cartHinted = false;
}
function hopInCart() {
  const pr = openWorld.progress;
  if (!pr.discovered.includes('golf')) pr.discovered.push('golf');
  pr.body = 'golf';
  openWorld.save();
  ui.apply();
  cartProp.visible = false;
  audio.finish();
  telemetry.discover('golf-cart', 'item');
  callout('🛺 Golf cart is yours!', 4000);
}
// A job found beside the BX. Its timer only advances in the driving physics step.
let deliveryHinted = false,
  deliveryReportUntil = 0,
  deliveryHudKey = '';
function deliveryDriver() {
  return {
    pos: s.car.pos,
    placement: s.car.placement,
    body: bodyKind,
    driving: !!(
      race.roam &&
      form === 'car' &&
      !robot &&
      !skate &&
      !s.flight.mode &&
      openWorld?.era() !== 'past'
    ),
    impact: s.car.impact
  };
}
function deliveryNear() {
  const driver = deliveryDriver();
  return (
    driver.driving &&
    driver.body === 'golf' &&
    !openWorld?.deliveries()?.active &&
    Math.hypot(driver.pos[0] - DELIVERY.pickup[0], driver.pos[2] - DELIVERY.pickup[2]) <= DELIVERY.startRadius
  );
}
function deliveryStep(dt) {
  for (const e of openWorld.deliveryStep(dt, deliveryDriver())) {
    if (e.delivered) {
      openWorld.progress.parcelsDelivered = (openWorld.progress.parcelsDelivered ?? 0) + 1;
      openWorld.save();
      callout('📦 Delivered! +1', 2400);
      if (e.done) {
        deliveryReportUntil = performance.now() + 8000;
        audio.finish();
      } else audio.coin();
    } else if (e.careful) {
      callout(e.squashed ? '📦 A bit squashed!' : '📦 Careful!', 1800);
    }
  }
}
function deliveryFrame(dt, now) {
  const state = openWorld.deliveries(),
    driver = deliveryDriver(),
    near = started && !paused && !ui.panel() && deliveryNear();
  if (near && !deliveryHinted) callout('📦 Deliveries! [E] start', 3500);
  deliveryHinted = near;
  const hud = $('delivery-hud');
  hud.hidden = paused || !!ui.panel() || !(state?.active || now < deliveryReportUntil);
  if (state) {
    const key = `${state.delivered}/${state.stars}/${state.paused}`;
    if (key !== deliveryHudKey) {
      deliveryHudKey = key;
      $('delivery-count').textContent =
        `${state.paused ? '⏸' : '📦'} Boxes ${state.delivered}/${DELIVERY.runLength}`;
      $('delivery-stars').textContent = `⭐ ${state.stars}`;
      $('delivery-stars').setAttribute('aria-label', `${state.stars} stars`);
    }
  }
  openWorld.drawDeliveries(paused ? 0 : dt, car, {
    present: openWorld.era() !== 'past',
    driving: driver.driving && driver.body === 'golf'
  });
}
// Bowling shares golf's triangular hold/release meter; each lane approach starts robot play.
let bowlingHold = null,
  bowlingHudKey = '';
function bowlingCanRoll() {
  const g = openWorld?.activity();
  return !!(
    robot &&
    !paused &&
    !ui.panel() &&
    race.roam &&
    g?.kind === 'bowling' &&
    g.control === 'robot' &&
    !g.done &&
    !g.launched &&
    approachLane(robot.pos)?.id === g.lane
  );
}
function bowlingPress() {
  if (!robot || paused || ui.panel() || !race.roam || !openWorld || openWorld.era?.() === 'past')
    return false;
  const lane = approachLane(robot.pos);
  let g = openWorld.activity();
  if (!lane) return false;
  if (!g || g.kind !== 'bowling' || g.done) {
    openWorld.startActivity('bowling', {lane: lane.id, control: 'robot', mode});
    g = openWorld.activity();
    robot.yaw = 0;
    telemetry.activityStart('bowling');
  } else if (!g.done && lane.id !== g.lane && switchBowlingLane(g, lane.id)) robot.yaw = 0;
  if (bowlingCanRoll()) bowlingHold = 0;
  return g?.kind === 'bowling';
}
function bowlingRelease() {
  const held = bowlingHold;
  bowlingHold = null;
  if (held == null || !bowlingCanRoll()) return;
  if (rollBowling(openWorld.activity(), {power: swingPowerOf(held), aim: robot.yaw, mode})) audio.impact(2);
}
function bowlingPrepare(dt) {
  let g = openWorld.activity();
  if (g?.kind === 'bowling' && ((g.control === 'robot') !== !!robot || openWorld.era?.() === 'past')) {
    openWorld.cancelActivity();
    bowlingHold = null;
    g = null;
  }
  if (robot && !g && openWorld.era?.() !== 'past') {
    const lane = approachLane(robot.pos);
    if (lane) {
      openWorld.startActivity('bowling', {lane: lane.id, control: 'robot', mode});
      robot.yaw = 0;
      telemetry.activityStart('bowling');
      callout('🎳 [E] hold · let go roll', 4500);
      g = openWorld.activity();
    }
  }
  if (bowlingHold != null) {
    if (bowlingCanRoll()) bowlingHold += dt;
    else bowlingHold = null;
  }
  if (g?.kind === 'bowling' && !g.launched) {
    g.bumpers = mode === 'kid';
    const a = robot ? Math.atan2(Math.sin(robot.yaw), Math.cos(robot.yaw)) : 0;
    g.aim = mode === 'kid' && Math.abs(a) <= 0.3 ? 0 : Math.max(-0.5, Math.min(0.5, a));
  }
}
function bowlingHud() {
  const g = openWorld?.activity(),
    el = $('bowling-hud');
  el.hidden = g?.kind !== 'bowling' || !race.roam;
  if (el.hidden) {
    bowlingHold = null;
    return;
  }
  const key = JSON.stringify([g.frames, g.frame, g.done, g.bumpers, g.control, g.lane]);
  if (key !== bowlingHudKey) {
    bowlingHudKey = key;
    const totals = scoreFrames(g.frames);
    $('bowling-frames').replaceChildren(
      ...g.frames.map((rolls, i) => {
        const frame = document.createElement('span'),
          marks = document.createElement('span'),
          total = document.createElement('strong');
        frame.className = 'bowling-frame';
        frame.classList.toggle('current', !g.done && i === g.frame);
        frame.setAttribute(
          'aria-label',
          `Frame ${i + 1}: ${frameMarks(rolls, i) || '–'}, score ${totals[i] ?? '–'}`
        );
        frame.title = `Frame ${i + 1}`;
        marks.textContent = frameMarks(rolls, i) || String(i + 1);
        total.textContent = totals[i] ?? '·';
        frame.append(marks, total);
        return frame;
      })
    );
    $('bowling-lane').textContent = g.control === 'car' ? '🚗 1' : `🎳 ${g.lane}`;
    $('bowling-lane').title =
      g.control === 'car' ? 'Car Bowling' : `Lane ${g.lane} · ${g.bumpers ? 'Bumpers up' : 'No bumpers'}`;
  }
  const meter = $('bowling-meter');
  meter.hidden = bowlingHold == null;
  if (bowlingHold != null) {
    const power = swingPowerOf(bowlingHold);
    meter.style.setProperty('--p', power.toFixed(3));
    meter.setAttribute('aria-valuenow', String(Math.round(power * 100)));
  }
}
// Robot golf at the country club (open-world/country-club.mjs). As the robot, walk onto the 1st
// tee and a round starts. Stand at the ball, turn to aim (kid mode snaps to the pin when you're
// close), hold E: the meter swings up and down; let go to hit. The club is picked for you. When
// the ball stops you're walked to it, facing the pin. The HUD shows hole, par, strokes, club,
// distance and the meter; every hole and the round end with a callout and a scorecard line.
let golfRound = null,
  golfBall = null,
  golfRestAt = null,
  golfHold = null,
  golfWait = 0,
  golfMesh = null,
  golfDropAt = null;
const golfGround = (x, z) => course.world.raycast([x, 300, z], [0, -1, 0], 400)?.point[1] ?? 0;
function golfCanSwing() {
  return !!(
    golfRound &&
    !golfBall &&
    golfRestAt &&
    robot &&
    Math.hypot(robot.pos[0] - golfRestAt[0], robot.pos[2] - golfRestAt[2]) < 1.6
  );
}
function golfHud() {
  const el = $('golf-hud');
  if (!golfRound) {
    el.hidden = true;
    return;
  }
  const h = holeOf(golfRound),
    at = golfBall ? golfBall.pos : (golfRestAt ?? [h.tee[0], 0, h.tee[1]]),
    lie = lieAt(h, [at[0], at[2]]),
    club = pickClub(lie, toPin(golfRound, [at[0], at[2]]));
  el.hidden = false;
  $('golf-hole').textContent = `⛳ ${h.n}`;
  $('golf-par').textContent = `PAR ${h.par}`;
  $('golf-strokes').textContent = `${golfRound.strokes}`;
  $('golf-club').textContent = club.toUpperCase();
  $('golf-dist').textContent = `${Math.round(toPin(golfRound, [at[0], at[2]]))} m`;
  const m = $('golf-meter');
  m.hidden = golfHold == null;
  if (golfHold != null) m.style.setProperty('--p', swingPowerOf(golfHold).toFixed(3));
}
function golfTee() {
  const h = holeOf(golfRound),
    line = h.bend ?? h.green,
    yaw = Math.atan2(line[0] - h.tee[0], -(line[1] - h.tee[1]));
  golfRestAt = [h.tee[0], golfGround(h.tee[0], h.tee[1]) + 0.04, h.tee[1]];
  golfBall = null;
  golfDropAt = golfRestAt;
  robot.pos = [h.tee[0] - Math.sin(yaw) * 0.5, golfRestAt[1] + 0.02, h.tee[1] + Math.cos(yaw) * 0.5];
  robot.vel = [0, 0, 0];
  robot.yaw = yaw;
  callout(`⛳ Hole ${h.n} · [E] hit`, 3500);
}
function golfRelease() {
  const held = golfHold;
  golfHold = null;
  if (!golfCanSwing()) return;
  const h = holeOf(golfRound),
    at = golfRestAt,
    lie = lieAt(h, [at[0], at[2]]),
    pin = toPin(golfRound, [at[0], at[2]]),
    club = pickClub(lie, pin);
  let yaw = robot.yaw;
  const toward = Math.atan2(h.green[0] - at[0], -(h.green[1] - at[2])),
    off = Math.atan2(Math.sin(toward - yaw), Math.cos(toward - yaw));
  if (mode === 'kid' && Math.abs(off) < 0.45) yaw = toward;
  golfDropAt = at;
  golfBall = strike(at, yaw, club, swingPowerOf(held));
  golfRestAt = null;
  golfRound.strokes++;
  audio.impact(club === 'putter' ? 1 : 3);
}
function golfScoreName(n, par) {
  return n === 1
    ? 'HOLE IN ONE!'
    : ({'-3': 'ALBATROSS!', '-2': 'EAGLE!', '-1': 'BIRDIE!', 0: 'PAR', 1: 'BOGEY', 2: 'DOUBLE BOGEY'}[
        n - par
      ] ?? `${n} strokes`);
}
// The roundup at the spring meadow, the club's twin in the past (open-world/meadow.mjs): the cattle
// shy away from your dinosaur; herd them through the corral gate. Callouts and a best time.
function roundupStep(dt) {
  if (!openWorld?.meadowStep || !race.roam) return;
  for (const e of openWorld.meadowStep(dt, robot ? robot.pos : s.car.pos)) {
    if (e.start) {
      audio.radio();
      callout('🐄 Chase cows to pen', 4500);
    } else if (e.penned && e.penned < e.of) {
      audio.coin();
      callout(`🐄 ${e.penned} of ${e.of} in the pen`, 1800);
    } else if (e.done) {
      audio.finish();
      const pr = openWorld.progress,
        best = pr.roundupBest ?? null,
        t = Math.round(e.time);
      if (best == null || t < best) {
        pr.roundupBest = t;
        openWorld.save();
      }
      callout(`🤠 All in! ${t}s${best == null || t < best ? ' · BEST!' : ''}`, 6000);
    }
  }
}
function golfStep(dt) {
  if (!openWorld || !race.roam || openWorld.era?.() === 'past') {
    return;
  }
  if (openWorld.tennis()?.active) return;
  if (!golfRound) {
    if (robot) {
      const t = CLUB_HOLES[0].tee;
      if (Math.hypot(robot.pos[0] - t[0], robot.pos[2] - t[1]) < 4) {
        golfRound = createRound();
        golfTee();
        audio.finish();
      }
    }
    golfHud();
    return;
  }
  if (!robot) {
    golfRound = null;
    golfBall = null;
    golfRestAt = null;
    golfHud();
    golfMesh && (golfMesh.visible = false);
    return;
  }
  golfMesh ??= (() => {
    const m = new T.Mesh(
      new T.SphereGeometry(0.06, 14, 10),
      new T.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.35,
        emissive: '#666666',
        emissiveIntensity: 0.3
      })
    );
    m.castShadow = true;
    scene.add(m);
    return m;
  })();
  const h = holeOf(golfRound);
  if (golfHold != null) golfHold += dt;
  if (golfBall) {
    for (let i = 0; i < 4; i++) {
      const e = stepBall(golfBall, golfGround, (x, z) => lieAt(h, [x, z]), dt / 4);
      if (holed(h, golfBall)) {
        const n = golfRound.strokes,
          name = golfScoreName(n, h.par);
        finishHole(golfRound);
        audio.finish();
        callout(
          `⛳ ${name} · ${n} hits · ${roundTotal(golfRound)}`,
          4500
        );
        golfBall = null;
        golfWait = 2.2;
        break;
      }
      if (e?.water) {
        audio.splash();
        golfRound.strokes++;
        callout('💦 Splash! One extra shot', 2600);
        golfRestAt = [...golfDropAt];
        golfBall = null;
        golfWait = 1.2;
        break;
      }
      if (e?.landed && e.landed === 'sand') callout('🏖️ In the sand!', 1500);
      if (e?.rest) {
        golfRestAt = [...golfBall.pos];
        golfBall = null;
        golfWait = 1;
        if (pickUp(golfRound)) {
          callout(`⛳ Next hole!`, 2600);
          finishHole(golfRound);
          golfWait = 2;
        } else if (e.rest === 'green') callout('⛳ On the green! Putt', 1600);
        break;
      }
    }
  }
  if (golfWait > 0) {
    golfWait -= dt;
    if (golfWait <= 0) {
      if (golfRound.done) {
        const t = roundTotal(golfRound),
          d = t - parTo(golfRound),
          pr = openWorld.progress;
        const best = pr.golfRoundBest ?? null;
        if (best == null || t < best) {
          pr.golfRoundBest = t;
          openWorld.save();
        }
        audio.finish();
        callout(`🏆 Round done! ${t}s${best == null || t < best ? ' · best!' : ''}`, 6000);
        golfRound = null;
        golfRestAt = null;
      } else if (!golfRestAt) golfTee();
      else {
        const pin = CLUB_HOLES[golfRound.hole].green,
          yaw = Math.atan2(pin[0] - golfRestAt[0], -(pin[1] - golfRestAt[2]));
        robot.pos = [
          golfRestAt[0] - Math.sin(yaw) * 0.5,
          golfRestAt[1] + 0.02,
          golfRestAt[2] + Math.cos(yaw) * 0.5
        ];
        robot.vel = [0, 0, 0];
        robot.yaw = yaw;
      }
    }
  }
  const b = golfBall ? golfBall.pos : golfRestAt;
  golfMesh.visible = !!b;
  if (b) golfMesh.position.set(b[0], b[1] + 0.06, b[2]);
  golfHud();
}
let totTrick = null,
  totAir = 0,
  totSpin = 0,
  totYaw = null,
  totDrift = 0,
  candyRun = 0,
  candyRecord = null,
  pumpkinRecord = null;
function stuntEnabled() {
  return !!(openWorld && race.roam && !robot && !skate && form !== 'board' && !s.flight.mode);
}
function stuntStep(dt) {
  for (const e of openWorld?.stuntStep(dt, s.car, stuntEnabled()) ?? []) {
    if (e.type === 'found') {
      if (e.fresh) {
        openWorld.progress.stuntJumps.push(e.id);
        openWorld.save();
      }
      audio.finish();
      callout(`🚀 Stunt jump! ${e.count} of ${STUNT_JUMPS.length}`, 3000);
    } else if (e.type === 'miss') callout('💥 So close! Try faster', 2400);
  }
}
function trickOrTreatStep(pos, dt, now) {
  if (!openWorld?.trickOrTreat || !race.roam || s.flight.mode) return;
  if (robot) {
    if (!robot.grounded) totAir += dt;
    else {
      if (totAir > 0.3) totTrick ??= {name: 'robot jump', size: trickSize({air: totAir})};
      totAir = 0;
    }
  } else if (form !== 'board') {
    const yaw = readout(s).yaw;
    if (s.car.contacts === 0) {
      totAir += dt;
      if (totYaw != null)
        totSpin += (Math.abs(Math.atan2(Math.sin(yaw - totYaw), Math.cos(yaw - totYaw))) * 180) / Math.PI;
    } else {
      if (totAir > 0.35)
        totTrick ??= {
          name: totSpin >= 300 ? `${Math.round(totSpin / 180) * 180} spin` : 'big jump',
          size: trickSize({air: totAir, spin: totSpin})
        };
      totAir = 0;
      totSpin = 0;
    }
    totYaw = yaw;
    if (s.assist?.drift?.active) totDrift += dt;
    else {
      if (totDrift > 1) totTrick ??= {name: 'drift', size: totDrift > 2.5 ? 'good' : 'small'};
      totDrift = 0;
    }
  }
  for (const ev of openWorld.trickOrTreat(pos, totTrick, now / 1000, dt)) {
    if (ev.ask) {
      audio.radio();
      callout('🎃 Show me a trick!', 2400);
    } else if (ev.treat) {
      audio.coin();
      if (ev.house.boo) audio.impact(3);
      candyRun += ev.candy;
      const pr = openWorld.progress;
      candyRecord ??= pr.candyBest ?? 0;
      const best = candyRecord;
      if (candyRun > (pr.candyBest ?? 0)) {
        pr.candyBest = candyRun;
        openWorld.save();
      }
      callout(
        (ev.house.boo ? '👻 BOO! …only joking! ' : '') +
          (candyRun === 67
            ? '6️⃣7️⃣ SIX SEVEN CANDIES!'
            : `🍬 +${ev.candy} for that ${ev.name}! · ${candyRun} candy` +
              (candyRun > best && best > 0 && candyRun - ev.candy <= best ? ' · NEW RECORD' : '')),
        2800
      );
      $('candy').hidden = false;
      $('candy').textContent = `🍬 ${candyRun}`;
    }
  }
  totTrick = null;
}
function endStreet() {
  if (!street) return;
  street = null;
  railLines.visible = false;
  document.body.classList.remove('free-skate');
  if (!skate) {
    setSkateRails(s, null);
    skateHud?.stop();
  }
}
// Grind lines: every curb and park rail near the board, rebuilt as it moves (never mid-grind),
// drawn as faint gold lines while skating so the kid can see what to ollie onto.
const railLines = new T.Mesh(
  new T.BufferGeometry(),
  new T.MeshBasicMaterial({
    color: '#ffc23a',
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: T.DoubleSide
  })
);
railLines.visible = false;
railLines.frustumCulled = false;
scene.add(railLines);
// The residential district's own street plan (its kerbs are drawn from it, not from the OSM tiles).
let residentialPlan = null;
const loadResidentialPlan = () =>
  (residentialPlan ??= fetch('./assets/world/residential.json')
    .then(r => r.json())
    .then(
      d => ({roads: d.roads ?? [], bounds: d.bounds}),
      () => ({roads: [], bounds: null})
    )
    .then(p => {
      residentialPlan = p;
      refreshStreetRails();
      return p;
    }));
function refreshStreetRails() {
  if (!street || !openWorld) return;
  loadResidentialPlan();
  const near = [s.car.pos[0], s.car.pos[2]],
    y = s.car.pos[1],
    plan = residentialPlan?.roads ? residentialPlan : null;
  const features = [...openWorld.stream.loaded.values()].flatMap(t => t.features ?? []),
    ground = (x, z) => course.world.raycast([x, y + 25, z], [0, -1, 0], 80)?.point[1] ?? null;
  const rails = [
    ...curbRails(features, near, ground, {skip: plan?.bounds}),
    ...(plan ? residentialCurbRails(plan.roads, near, ground) : []),
    ...Object.entries(SKATE_PARKS).flatMap(([id, d]) => parkRails(id, d.park, d.world, near)),
    ...parkRails('sewer', SEWER_PARK, ([u, v, h]) => sewerWorld([u, h, v]), near)
  ];
  street.park = streetPark(rails);
  street.railsAt = near;
  // Each edge as a flat 5 cm ribbon, so it reads from the chase camera.
  const v = [];
  for (const r of rails)
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1],
        b = r.pts[i],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        l = Math.hypot(dx, dz) || 1,
        w = 0.025,
        ox = (-dz / l) * w,
        oz = (dx / l) * w,
        ya = a[2] + 0.012,
        yb = b[2] + 0.012;
      v.push(
        a[0] - ox,
        ya,
        a[1] - oz,
        b[0] - ox,
        yb,
        b[1] - oz,
        b[0] + ox,
        yb,
        b[1] + oz,
        a[0] - ox,
        ya,
        a[1] - oz,
        b[0] + ox,
        yb,
        b[1] + oz,
        a[0] + ox,
        ya,
        a[1] + oz
      );
    }
  railLines.geometry.dispose();
  railLines.geometry = new T.BufferGeometry();
  railLines.geometry.setAttribute('position', new T.Float32BufferAttribute(v, 3));
  railLines.visible = true;
}
function boardStep(input) {
  if (form !== 'board') {
    flipQueued = null;
    return;
  }
  const tk = skate || street;
  if (
    street &&
    !skate &&
    !s.skateRide?.active &&
    !s.skateRide?.manual &&
    Math.hypot(s.car.pos[0] - street.railsAt[0], s.car.pos[2] - street.railsAt[1]) > STREET_RAILS.rebuild
  )
    refreshStreetRails();
  for (const ev of stepBoardTricks(
    boardTricks,
    {
      air: s.car.contacts === 0 && !s.flight.mode,
      flip: flipQueued,
      grab: keys.has('KeyE') ? dirOf(stick()) : null
    },
    1 / 120,
    mode
  )) {
    if (!tk) continue;
    if (ev.type === 'trick') scoreTrick(tk, ev.name, ev.points);
    else {
      bailRun(tk);
      skateHud?.event({type: 'bail'});
      audio.impact(4);
      s.car.vel = [s.car.vel[0] * 0.3, s.car.vel[1], s.car.vel[2] * 0.3];
    }
  }
  flipQueued = null;
  if (street && !skate)
    for (const e of stepSkate(street, s, input, 1 / 120, streetFrame)) {
      skateHud.event(e);
      if (e.type === 'bail') audio.impact(4);
      else if (e.type === 'land' && e.tricks > 1) audio.coin();
      if (e.type === 'touchdown') {
        adventure?.landing(s.car.pos, e.air, e.tricks, mode);
        if (e.tricks.length)
          totTrick = {name: e.tricks.at(-1), size: trickSize({combo: e.tricks.length, air: e.air})};
      }
      if (e.type === 'land') {
        const sh = adventure?.combo(s.car.pos, e.tricks, mode);
        if (sh?.opened) {
          audio.finish();
          callout('🛹 THE SHRINE OPENS!', 3000);
        } else if (sh) callout(`🛹 Need ${sh.need} tricks here`);
      }
    }
}
function endSkate(reason = 'left') {
  if (skate)
    telemetry.skateEnd({
      reason,
      score: skate.score,
      bestCombo: skate.best,
      gaps: skate.gapsFound.size,
      goals: skate.goals.size,
      newGoals: skate.newGoals.length,
      letters: skate.letters.length
    });
  setSkateRails(s, null);
  skate = null;
  skatePark = null;
  skateHud?.stop();
  startStreet();
}
function skateStep(input) {
  if (!skate) return;
  const def = SKATE_PARKS[skatePark];
  if (Math.hypot(s.car.pos[0] - def.centre[0], s.car.pos[2] - def.centre[2]) > def.radius + 26) {
    endSkate();
    return;
  }
  if (fireQueued) skateGrabUntil = performance.now() + 400;
  for (const e of stepSkate(
    skate,
    s,
    {...input, drift: input.drift || performance.now() < skateGrabUntil},
    1 / 120,
    def.frame
  )) {
    skateHud.event(e);
    if (e.type === 'gap' || e.type === 'tape' || e.type === 'letter') audio.coin();
    else if (e.type === 'bail') audio.impact(4);
    else if (e.type === 'goal') audio.gate();
    else if (e.type === 'over') {
      const run = skate,
        id = skatePark,
        saved = skateSaved(id);
      audio.finish();
      saved.goals = [...run.goals];
      saved.best = Math.max(saved.best, run.score);
      saved.gaps = [...new Set([...saved.gaps, ...run.gapsFound])];
      try {
        localStorage.setItem(def.key, JSON.stringify(saved));
      } catch {}
      endSkate('time');
      skateCard(id, run);
      return;
    }
  }
}
let skyReport = null,
  skyLandingUntil = 0;
function skyJumpStep() {
  if (!openWorld || !race.roam) return;
  const report = openWorld.stepSkyJump(s.car, s.flight);
  if (!report) return;
  skyLandingUntil = performance.now() + 7000;
  (skyReport ??= createSkyDiveReport()).show(report);
  audio.finish();
  callout(skyLandingText(report), 5000);
}
function startLab() {
  if (!labRide || !beginLab(labRide)) return;
  labHanded = false;
  keys.clear();
  boostOn = false;
  fireQueued = hopQueued = false;
  if (s.flight.mode) s.flight.mode = null;
  const rv = race.rivals[0];
  if (rv?.session?.flight?.mode) rv.session.flight.mode = null;
}
function pinLabCars() {
  const splitRide = !!(split && race.rivals[0]);
  const pose = carPoses(labRide, {split: splitRide, lift: rideHeight(s.car.params)});
  const pin = (car, pos) => {
    car.pos[0] = pos[0];
    car.pos[1] = pos[1];
    car.pos[2] = pos[2];
    car.vel[0] = car.vel[1] = car.vel[2] = 0;
    car.ang[0] = car.ang[1] = car.ang[2] = 0;
    car.q = [...pose.q];
    car.steer = 0;
  };
  pin(s.car, pose.p1);
  if (pose.p2) pin(race.rivals[0].session.car, pose.p2);
}
function labLook() {
  const pads = Array.from(navigator.getGamepads?.() ?? []),
    dead = v => (Math.abs(v ?? 0) < 0.15 ? 0 : v),
    p1 = pads.find(p => p?.connected && p.index !== split?.pad),
    p2 = split ? pads[split.pad] : null,
    key = (a, b) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0);
  return {
    lookX: dead(p1?.axes?.[0]) || key('ArrowRight', 'ArrowLeft'),
    lookY: -dead(p1?.axes?.[1]) || key('ArrowUp', 'ArrowDown'),
    look2X: dead(p2?.axes?.[0]),
    look2Y: p2 ? -dead(p2?.axes?.[1]) : undefined
  };
}
function labSounds(cues) {
  for (const c of cues) {
    if (c === 'beep' || c === 'go') audio.beep(c === 'go');
    // The beam's 'hum' cue is not played: no hums or drones.
    else if (c === 'alarm') audio.tone(740, 0, 0.12, {type: 'square', level: 0.04, cutoff: 1400});
    else if (c === 'spark') audio.tone(180, 0, 0.05, {type: 'triangle', level: 0.05, glide: 90});
  }
}
function labCallout(text) {
  const b = $('banner');
  b.replaceChildren(text);
  b.hidden = false;
  b.dataset.callout = '1';
  clearTimeout(calloutTimer);
  calloutTimer = setTimeout(() => {
    delete b.dataset.callout;
    b.textContent = '🎺 Bugle time! Rivals stop — you keep driving';
    b.hidden = !retreatActive(race);
  }, 7000);
}
function annexPadUse(pad) {
  return (pad?.buttons?.[3]?.value ?? 0) > 0.5;
}
function annexPlayers() {
  const pads = Array.from(navigator.getGamepads?.() ?? []),
    p1 = pads.find(p => p?.connected && p.index !== split?.pad),
    p2 = split ? pads[split.pad] : null,
    players = [
      {
        pos: robot ? robot.pos : s.car.pos,
        use: keys.has('KeyE') || annexPadUse(p1),
        form: robot ? 'robot' : form === 'board' ? 'board' : 'car'
      }
    ];
  // Split stays on while either player walks. The walker is the body the lever and the plates see.
  if (split && race.rivals[0]) {
    const walking = split.p2Form === 'robot' && p2Robot;
    players.push({
      pos: walking ? p2Robot.pos : race.rivals[0].session.car.pos,
      use: annexPadUse(p2),
      form: walking ? 'robot' : split.p2Form === 'board' ? 'board' : 'car'
    });
  }
  return players;
}
function annexSim(dt) {
  if (!annex || !openWorld || paused || labBusy(labRide)) return;
  if (labRide?.phase === 'free') openWorld.stream?.world?.openGate('lab:out');
  const players = annexPlayers();
  const inside = players.some(p => annexDark(p.pos) || annexFell(p.pos));
  if (!inside && annex.checkpoint === 0 && !annex.seen[0]) return;
  stepAnnex(annex, dt, {players, storage: labStore});
  const world = openWorld.stream?.world;
  if (world) {
    if (annex.blocked) world.closeGate('annex:turn');
    else world.openGate('annex:turn');
  }
  const bodies = [
    robot || s.car,
    split?.p2Form === 'robot' && p2Robot ? p2Robot : (race.rivals[0]?.session?.car ?? null)
  ];
  for (const push of annex.pushes) {
    const body = bodies[push.index];
    if (!body?.vel) continue;
    body.vel[0] += push.dv[0];
    body.vel[2] += push.dv[2];
  }
  for (const i of annex.zaps) {
    const body = bodies[i];
    if (!body?.vel) continue;
    body.vel[0] *= 0.12;
    body.vel[2] *= 0.12;
  }
  for (const c of annex.cues.splice(0)) {
    if (c === 'zap') audio.tone(170, 0, 0.05, {type: 'sawtooth', level: 0.05, glide: 42});
    else if (c === 'giggle') audio.tone(880, 0, 0.09, {type: 'sine', level: 0.045, glide: 1400});
    else if (c === 'cheer') audio.coin();
    else if (c === 'lever') audio.beep();
  }
  for (const id of annex.events.splice(0)) {
    telemetry.discover(id, 'annex');
    if (id.startsWith('annex_checkpoint')) callout(`🤖 ${annex.robots} on the roof`);
    else if (id === 'annex_coop_lever' && !annexLeverTold) {
      annexLeverTold = true;
      callout('Hold E');
    }
  }
}
function annexRecoverBody(index) {
  const spot = annexRescue(annex.checkpoint),
    pos = index === 0 ? spot.p1 : spot.p2;
  if (index === 0 && robot) {
    robot.pos = [pos[0], pos[1] + 0.02, pos[2]];
    robot.vel = [0, 0, 0];
    robot.yaw = spot.yaw;
    return;
  }
  if (index === 1 && split?.p2Form === 'robot' && p2Robot) {
    p2Robot.pos = [pos[0], pos[1] + 0.02, pos[2]];
    p2Robot.vel = [0, 0, 0];
    p2Robot.yaw = spot.yaw;
    return;
  }
  const car = index === 0 ? s.car : race.rivals[0]?.session?.car;
  if (car) placeCar(car, [pos[0], pos[1] + rideHeight(car.params), pos[2]], spot.yaw, 0);
}
function annexActors() {
  const rv = race.rivals[0],
    p2on = !!(split && rv),
    walking = p2on && split.p2Form === 'robot' && p2Robot,
    mine = (annex.roofs[0] || 0) + (p2on ? 0 : annex.roofs[1] || 0),
    actors = [
      robot
        ? {pos: robot.pos, yaw: robot.yaw, roof: mine, lamp: annexDark(robot.pos)}
        : {pos: s.car.pos, yaw: readout(s).yaw, roof: mine, lamp: annexDark(s.car.pos)}
    ];
  if (walking)
    actors.push({
      pos: p2Robot.pos,
      yaw: p2Robot.yaw,
      roof: annex.roofs[1] || 0,
      lamp: annexDark(p2Robot.pos)
    });
  else if (p2on)
    actors.push({
      pos: rv.session.car.pos,
      yaw: readout(rv.session).yaw,
      roof: annex.roofs[1] || 0,
      lamp: annexDark(rv.session.car.pos)
    });
  return actors;
}
function annexPresent() {
  if (!annex || !annexView || !openWorld) return;
  if (labBusy(labRide)) {
    annexView.update(annex, []);
    if (annexDim) {
      contactSun.intensity = annexContact;
      annexDim = false;
    }
    return;
  }
  if (annexFell(robot ? robot.pos : s.car.pos)) annexRecoverBody(0);
  if (split && race.rivals[0]) {
    const p2pos = split.p2Form === 'robot' && p2Robot ? p2Robot.pos : race.rivals[0].session.car.pos;
    if (annexFell(p2pos)) annexRecoverBody(1);
  }
  annexView.update(annex, annexActors());
  const dark = annexDark(robot ? robot.pos : s.car.pos);
  if (dark) {
    if (!annexDim) annexContact = contactSun.intensity;
    annexDim = true;
    hemi.intensity = 0.04;
    sun.intensity = 0.02;
    contactSun.intensity = 0.05;
    scene.fog.color.set('#07090e');
    scene.fog.near = 0.35;
    scene.fog.far = 8.5;
    scene.background = ANNEX_BG;
  } else if (annexDim) {
    contactSun.intensity = annexContact;
    annexDim = false;
  }
}
function labFrame(dt) {
  if (!labRide || !openWorld) return;
  if (labBoot && started && !paused) {
    labBoot = false;
    startLab();
  }
  if (labRide.phase === 'idle') {
    labRide.wave += dt;
    labView?.update(labRide);
    return;
  }
  if (!paused) {
    const held = labBusy(labRide);
    stepLab(labRide, dt, held ? {...labLook(), skip: labSkipEdge} : {});
    labSkipEdge = false;
    if (labRide.seen && !labStored) {
      labStored = true;
      markLabSeen(labStore);
    }
    if (held && labBusy(labRide)) pinLabCars();
  }
  for (const id of labRide.events.splice(0)) if (Object.values(LAB_EVENTS).includes(id)) telemetry.discover(id, 'lab');
  labSounds(labRide.cues.splice(0));
  labView?.update(labRide);
  if (labRide.phase === 'free' && !labHanded) {
    labHanded = true;
    const pose = carPoses(labRide, {split: !!(split && race.rivals[0]), lift: rideHeight(s.car.params)});
    placeCar(s.car, pose.p1, pose.yaw, 0);
    if (pose.p2) placeCar(race.rivals[0].session.car, pose.p2, pose.yaw, 0);
    labCallout(labRide.callout || GET_OUT);
    cameraCar = [s.car.pos[0], s.car.pos[1], s.car.pos[2]];
    if (split) {
      split.car = null;
      split.heading = pose.yaw;
    }
    if (annex?.checkpoint > 0) {
      const spot = annexRescue(annex.checkpoint);
      const drop = (car, pos) => placeCar(car, [pos[0], pos[1] + rideHeight(car.params), pos[2]], spot.yaw, 0);
      drop(s.car, spot.p1);
      if (pose.p2) drop(race.rivals[0].session.car, spot.p2);
      cameraCar = [s.car.pos[0], s.car.pos[1], s.car.pos[2]];
      if (split) split.heading = spot.yaw;
    }
    openWorld.stream?.world?.openGate('lab:out');
    if (camera2.userData.labFar) {
      camera2.far = camera2.userData.labFar;
      camera2.updateProjectionMatrix();
    }
  }
}
function enterLocation() {
  if (!openWorld || paused || !race.roam || labBusy(labRide)) return;
  if (annexDark(robot ? robot.pos : s.car.pos)) return;
  // A run in progress comes first: [E] ends it (as it ends a Flying School lesson), so a child can
  // always get out, and no second minigame starts on top of it.
  if (openWorld.school()?.active) {
    openWorld.stopSchool();
    hideSchoolCard();
    callout('', 0);
    return;
  }
  if (openWorld.deliveries()?.active) {
    openWorld.stopDeliveries();
    callout('📦 Deliveries stopped', 2000);
    return;
  }
  if (deliveryNear() && openWorld.startDeliveries(deliveryDriver())) {
    deliveryReportUntil = 0;
    audio.pickup();
    callout('📦 Follow the line!', 3000);
    return;
  }
  if (s.flight.mode || openWorld.skyDive().active) return;
  if (!robot && form === 'car' && !skate && openWorld.skyJumpNear(s.car.pos)) {
    if (openWorld.startSkyJump(s.car, s.flight)) {
      skyReport?.hide();
      boostOn = false;
      keys.clear();
      touchControls?.reset();
      fireQueued = hopQueued = false;
      acc = 0;
      cameraCar = null;
      audio.radio();
      callout(SKY_STEER_HINT, 6500);
    } else callout('🪂 Almost ready… [E] again', 2000); // the sky above is still loading
    return;
  }
  if (
    !robot &&
    !skate &&
    !s.flight.mode &&
    openWorld.era() !== 'past' &&
    Math.hypot(s.car.pos[0] - SCHOOL.at[0], s.car.pos[2] - SCHOOL.at[2]) <= SCHOOL.startRadius
  ) {
    const event = openWorld.startSchool(mode);
    if (event) schoolEvent(event);
    return;
  }
  if (robot && (approachLane(robot.pos) || openWorld.activity()?.kind === 'bowling')) return;
  if (cartNear()) {
    hopInCart();
    return;
  }
  if (skateParkAt() && !skate) {
    skateCard(skateParkAt());
    return;
  }
  if (openWorld.activity() && !openWorld.activity().done) {
    const tee = openWorld.resetActivity();
    if (tee) placeCar(s.car, [tee.pos[0], rideHeight(s.car.params) + 0.02, tee.pos[2]], tee.yaw);
    else if (openWorld.activity()?.done) {
      audio.finish();
      callout(`🎳 Game over · ${openWorld.activity().score}`);
    }
    return;
  }
  if (!robot && form === 'car' && !skate && tourNear(s.car.pos)) {
    startLab();
    return;
  }
  const p = openWorld.near(s.car.pos);
  if (!p) return;
  if (p.game === 'flying-school' || p.game === 'canyon-run') return;
  if (p.game === 'sky-dive') return;
  if (p.game) {
    const tee = openWorld.startActivity(p.game, {mode});
    if (!tee) return;
    telemetry.activityStart(p.game);
    placeCar(s.car, [tee.pos[0], rideHeight(s.car.params) + 0.02, tee.pos[2]], tee.yaw);
    callout(p.game === 'golf' ? 'CAR GOLF · 3 HOLES' : '🎳 Car Bowling · drive at the pins!');
    return;
  }
  if (p.kind === 'discovery' || !canEnter(openWorld.progress, p)) ui.open('map');
  else visitRace(p);
}
// The stats page (owner, 31 Oct: "kinda need a stats page"): records and counts, never a
// completion total (the world should feel endless). Rows: [icon, label, value].
function statRows() {
  const pr = openWorld?.progress ?? {},
    num = n => Number(n || 0).toLocaleString(),
    skateBest = Math.max(0, ...Object.keys(SKATE_PARKS).map(id => skateSaved(id).best || 0));
  return [
    ['🍬', 'Candy this time', num(candyRun)],
    ['🍬', 'Candy record', num(Math.max(pr.candyBest || 0, candyRun)), 'Most trick-or-treat candy in one go'],
    [
      '🎃',
      'Pumpkin record',
      num(Math.max(pr.pumpkinBest || 0, pumpkinsSmashed)),
      'Most pumpkins splatted in one go'
    ],
    ['🎃', 'Pumpkins this time', num(pumpkinsSmashed)],
    ['🎃', 'Pumpkins ever', num(pr.pumpkins)],
    ['📍', 'Places found', num(pr.discovered?.length)],
    ['🚀', 'Stunt jumps', `${pr.stuntJumps?.length ?? 0} of ${STUNT_JUMPS.length}`],
    ['🦎', 'Desert finds', num(pr.specimens?.length)],
    ['🏁', 'Races won', num(Object.keys(pr.raceWins ?? {}).length)],
    ['🛹', 'Best skate score', num(skateBest)],
    ['✈️', 'Splash ones', num(aceKills)],
    ['🫡', 'Perfect retreats & reveilles', num(pr.retreats)],
    ['🚀', 'Booster landings seen', num(pr.boosters)],
    ['☁️', 'Clouds', `${pr.clouds?.length ?? 0} of ${CLOUDS.length}`],
    ['🏜️', 'Canyon Run best', pr.canyonBest ? `${pr.canyonBest.toFixed(1)}s` : '–'],
    ['✈', 'Flying School trips', num(pr.flyingSchool)],
    ['📦', 'Boxes delivered', num(pr.parcelsDelivered)],
    ['⭐', 'Flying School best', pr.flyingStars ? `${pr.flyingStars}/9` : '–'],
    ['🪂', 'Sky jumps', num(pr.skyJumps)],
    ['🎯', 'Best landing', pr.bestLanding == null ? '–' : `${pr.bestLanding.toFixed(1)} m`],
    ['🎾', 'Tennis wins', num(pr.tennisWins)],
    ['⛳', 'Best golf round', pr.golfRoundBest ? `${pr.golfRoundBest}` : '–'],
    ['🤠', 'Fastest roundup', pr.roundupBest ? `${pr.roundupBest} s` : '–'],
    ['🎳', 'Bowling best', pr.bowlingBest != null ? `${pr.bowlingBest}/300` : '–'],
    ['⛳', 'Golf best', pr.golfBest ? `${pr.golfBest} hits` : '–'],
    ...(adventure
      ? [
          ['🔋', 'Battery cells', num(adventure.inventory.cells.length)],
          ['🎒', 'Adventure items', num(adventure.inventory.items.size ?? adventure.inventory.items.length)]
        ]
      : [])
  ];
}
const ui = createWorldUI({
  stats: statRows,
  dex: () =>
    openWorld && {
      pages: pages(dexState(), herd().herd),
      herdNames: kind =>
        herd()
          .herd.filter(d => d.kind === kind)
          .map(d => d.name),
      gold: dexState().gold,
      batteries: dexState().batteries,
      parts: dexState().parts,
      portrait: (model, ready) => (portraits ??= createPortraits(renderer)).get(model, ready)
    },
  world: openWorld,
  getState: () => ({
    pos: robot?.pos ?? s.car.pos,
    yaw: robot?.yaw ?? readout(s).yaw,
    robot: !!robot,
    paused,
    roam: race.roam,
    started,
    flying: !!s.flight.mode,
    labTour: !robot && form === 'car' && !skate && tourNear(s.car.pos) && !labBusy(labRide),
    skyJump: !robot && form === 'car' && !skate ? openWorld?.skyJumpNear(s.car.pos)?.id : null,
    skate: !!skateParkAt() && !skate,
    skating: !!skate
  }),
  pause,
  applyShell,
  onGarage: g => telemetry.garage(g),
  travel: travelTo,
  interact: enterLocation,
  search: location.search,
  onOpen: which => {
    tennisHold = null;
    if (which === 'map') telemetry.mapOpen(s.car.pos);
  }
});
$('interact').addEventListener('pointerdown', e => {
  if (robot && bowlingPress()) {
    e.preventDefault();
    $('interact').setPointerCapture(e.pointerId);
  }
});
$('interact').addEventListener('pointerup', () => {
  if (bowlingHold != null) bowlingRelease();
});
$('interact').addEventListener('pointercancel', () => {
  bowlingHold = null;
});
let cupStorage;
try {
  cupStorage = sessionStorage;
} catch {}
let cup = loadCup(cupStorage);
const cupId = new URLSearchParams(location.search).get('cup');
if (
  !cupId ||
  !CUP_COURSES[Number(cupId)] ||
  cup?.id !== cupId ||
  !cup.events.includes(openWorld?.selected.id) ||
  (cup && cup.events.indexOf(openWorld?.selected.id) > cup.results.length)
)
  cup = null;
function cupURL(event, id) {
  const q = new URLSearchParams(location.search);
  q.set('track', 'hub');
  q.set('event', event);
  q.set('mode', 'race');
  q.set('cup', id);
  return '?' + q;
}
const raceMenu = createRaceMenu({
  progress: () => ui.progress,
  search: location.search,
  onStartCup: index => {
    if (!raceReady()) return;
    const c = CUP_COURSES[index];
    cup = createCup(
      String(index),
      c.courses.map(c => c[0]),
      ['YOU', ...race.rivals.map(r => r.callsign)]
    );
    saveCup(cup, cupStorage);
    location.href = cupURL(cup.events[0], cup.id);
  }
});
$('choose-course').onclick = () => {
  if (!raceReady()) return;
  pause(true);
  raceMenu.open();
};
if (openWorld) {
  $('brief-title').textContent =
    urlMode === 'legend'
      ? 'THE LEGEND OF SPIRIT MOUNTAIN'
      : new URLSearchParams(location.search).has('event') && !openWorld.locked
        ? openWorld.selected.name
        : 'RC ODYSSEY';
  $('start').title = 'Explore Saucer Springs; E enters an event, Tab opens the base map';
}
$('return-world').hidden = !!openWorld;
$('return-world').onclick = () => {
  location.href = rcLink(
    {track: 'hub', from: new URLSearchParams(location.search).get('from') ?? track},
    location.search
  );
};
window.addEventListener('pagehide', () => {
  bowView.dispose();
  openWorld?.dispose();
  worldSky?.dispose();
});
// pagehide tears the world and touch controls down, so a back/forward-cache restore must reload.
window.addEventListener('pageshow', e => {
  if (e.persisted) location.reload();
});
const worldSky = openWorld ? createWorldSky({scene, sun, hemi, contactSun, renderer}) : null;
let worldElapsed = 0;
// Frame cost breakdown for the frame-rate rigs (app vs Chrome): game update+physics vs render submit.
const prof = {
  sim: 0,
  render: 0,
  n: 0,
  calls: 0,
  tris: 0,
  add(r, g) {
    this.render += r;
    this.sim += g;
    this.n++;
  },
  read() {
    const n = Math.max(1, this.n),
      o = {
        update: +(this.sim / n).toFixed(2),
        render: +(this.render / n).toFixed(2),
        calls: Math.round(this.calls / n),
        tris: Math.round(this.tris / n),
        frames: this.n
      };
    this.sim = this.render = this.n = this.calls = this.tris = 0;
    return o;
  }
};
const pollGamepad = createGamepadInput();
// A drawing of the controller in that player's hands, with the buttons lit as they press
// them, shown when they're struggling (sat still, both triggers, pushing a wall, new pad).
const coachEls = [1, 2].map(n => {
    const el = Object.assign(document.createElement('div'), {id: 'coach' + n, className: 'coach', hidden: true});
    el.setAttribute('aria-hidden', 'true');
    document.body.append(el);
    return el;
  }),
  coaches = [createCoach(), createCoach()];
let coachLast = 0,
  coachDrawn = 0,
  p1Last = null;
// Standard face: B morphs (T), X boosts on a car and punches on foot, Y is drift on a car
// and boost / the on-screen Skate button on foot. LB starts flight; a short tap in the air
// opens the chute, a hold rolls. They go through the same key handlers (T, Return).
const padHeld = {},
  p2PadHeld = {};
let useClicked = false,
  p1FlyShoulder = null,
  p2FlyShoulder = null;
const tapKey = code => {
  canvas.dispatchEvent(new KeyboardEvent('keydown', {code, key: code, bubbles: true}));
  canvas.dispatchEvent(new KeyboardEvent('keyup', {code, key: code, bubbles: true}));
};
function useButton(all) {
  const mine = all.filter(p => p?.connected && p.index !== split?.pad),
    play = !paused && !ui.panel(),
    edge = i => {
      const down = mine.some(p => p.buttons[i]?.value > 0.5),
        hit = down && !padHeld[i];
      padHeld[i] = down;
      return hit && play;
    },
    btn = $('interact');
  if (edge(1)) tapKey('KeyT');
  {
    const lb = mine.some(p => p.buttons[4]?.value > 0.5),
      shoulder = flyShoulder(p1FlyShoulder, {flying: !!s.flight.mode, down: lb && play, now: performance.now()});
    p1FlyShoulder = shoulder.state;
    if (play && (shoulder.takeoff || shoulder.chute)) tapKey('Enter');
  }
  if (edge(2)) {
    if (robot) {
      punchQueued = true;
      useQueued = true;
    }
    if (!btn.hidden) {
      btn.click();
      if (!robot) useClicked = true;
    }
  }
  // On foot, Y is still boost and the on-screen Skate / go-in button.
  if (edge(3) && robot && !btn.hidden) {
    btn.click();
    useClicked = true;
  }
  if (split && started && race.rivals[0] && split.pad != null) {
    const gp2 = all[split.pad],
      p2Edge = i => {
        const down = gp2?.connected && (gp2.buttons[i]?.value ?? 0) > 0.5,
          hit = down && !p2PadHeld[i];
        p2PadHeld[i] = down;
        return hit && play;
      };
    if (p2Edge(1)) p2ToggleMorph();
    if (p2Edge(2) && split.p2Form === 'robot') p2PunchQueued = true;
    const lb2 = gp2?.connected && (gp2.buttons[4]?.value ?? 0) > 0.5,
      shoulder2 = flyShoulder(p2FlyShoulder, {
        flying: !!race.rivals[0].session.flight.mode,
        down: lb2 && play,
        now: performance.now()
      });
    p2FlyShoulder = shoulder2.state;
    if (play && (shoulder2.takeoff || shoulder2.chute)) p2ToggleFlight();
  }
  formBar(all);
  formBarP2(all);
  const gp = all[p1Last];
  if (!gp || btn.hidden) return;
  const kind = padKind(gp.id),
    label = robot ? (kind === 'sn30' ? 'X' : 'Y') : kind === 'sn30' ? 'Y' : 'X';
  for (const k of btn.querySelectorAll('kbd'))
    if (k.textContent === 'E' || k.dataset.pad) {
      k.dataset.pad = kind;
      if (k.textContent !== label) k.textContent = label;
    }
}
// Player 1's forms, always on screen: the one you're in is lit, with the pad button that
// changes it (B morph, LB fly) drawn as printed on that pad.
const formEl = Object.assign(document.createElement('div'), {id: 'forms', hidden: true}),
  formEl2 = Object.assign(document.createElement('div'), {id: 'forms-p2', hidden: true});
formEl.setAttribute('aria-label', 'Change: car, walk, skate, fly');
formEl2.setAttribute('aria-label', 'Player 2: car, walk, skate, fly');
document.body.append(formEl, formEl2);
let formKey = '',
  formKey2 = '';
function p2ToggleFlight() {
  const rv = race.rivals[0];
  if (
    !rv ||
    !race.roam ||
    split?.p2Form === 'board' ||
    split?.p2Form === 'robot' ||
    adventure?.underground(s.car.pos) ||
    labUnderground(s.car.pos) ||
    annexDark(rv.session.car.pos) ||
    dreams?.active() ||
    labBusy(labRide)
  )
    return;
  const rs = rv.session,
    was = rs.flight.mode,
    m = toggleFlight(rs.flight, rs.car, {roam: true});
  if (m !== was) audio.boost();
}
function p2ShowBoard(on, paint) {
  if (!on) {
    if (p2BoardRider) p2BoardRider.visible = false;
    return;
  }
  if (!p2BoardRider) {
    p2BoardRider = makeBoardRider(paint);
    scene.add(p2BoardRider);
  }
  p2BoardRider.visible = true;
}
function p2ShowRobot(on) {
  if (!on) {
    p2Robot = null;
    p2PunchQueued = false;
    if (p2RobotBody) p2RobotBody.visible = false;
    return;
  }
  if (!p2RobotBody) {
    p2RobotBody = makeRobotBody(RIVAL_PAINT[0]);
    scene.add(p2RobotBody);
  }
  p2RobotBody.visible = true;
}
// Put the hidden rival car back on its wheels where the walker is standing.
function parkP2Robot() {
  const rv = race.rivals[0];
  if (split?.p2Form === 'robot' && p2Robot && rv) {
    const rs = rv.session,
      p = split.p2CarParams ?? rs.car.params,
      pos = [p2Robot.pos[0], p2Robot.pos[1] + rideHeight(p) + 0.02, p2Robot.pos[2]];
    Object.assign(rs.car, createCar(p, pos, p2Robot.yaw));
  }
  p2ShowRobot(false);
}
function p2ToggleMorph() {
  const rv = race.rivals[0];
  if (!split || !rv || !race.roam || rv.session.flight.mode || dreams?.active()) return;
  const rs = rv.session,
    prev = split.p2Form ?? 'car',
    paint = openWorld?.progress?.paint ?? '#4fb3ff';
  if (prev === 'car') split.p2CarParams = rs.car.params;
  split.p2Form = toggleP2SkateForm(prev);
  split.heading = null;
  const r = readout(rs),
    feet = (params, yaw) => {
      const pos = p2Robot
        ? [p2Robot.pos[0], p2Robot.pos[1] + rideHeight(params) + 0.02, p2Robot.pos[2]]
        : [...rs.car.pos];
      if (!p2Robot) pos[1] += rideHeight(params) - rideHeight(rs.car.params) + 0.02;
      return {pos, yaw: p2Robot ? p2Robot.yaw : yaw};
    };
  if (split.p2Form === 'robot') {
    p2Robot = createRobot([r.x, r.y - rideHeight(rs.car.params) + 0.01, r.z], r.yaw);
    rs.car.vel = [0, 0, 0];
    rs.car.ang = [0, 0, 0];
    p2ShowRobot(true);
    p2ShowBoard(false);
    if (rivalVis[0]) rivalVis[0].group.visible = false;
  } else if (split.p2Form === 'board') {
    const p = vehicleParams('board'),
      at = feet(p, r.yaw);
    p2ShowRobot(false);
    Object.assign(rs.car, createCar(p, at.pos, at.yaw));
    p2ShowBoard(true, paint);
  } else {
    const p = split.p2CarParams ?? rs.car.params,
      at = feet(p, r.yaw);
    p2ShowRobot(false);
    Object.assign(rs.car, createCar(p, at.pos, at.yaw));
    p2ShowBoard(false);
    if (rivalVis[0]) rivalVis[0].group.visible = true;
  }
  audio.pickup();
}
function formBar(all) {
  const gp = all[p1Last];
  formEl.hidden = !gp || !started || !race.roam || !!ui.panel();
  formEl.classList.toggle('left', splitOn);
  if (formEl.hidden) return;
  const kind = padKind(gp.id),
    now = s.flight.mode ? 'fly' : robot ? 'walk' : form === 'board' ? 'skate' : 'car',
    key = kind + now;
  if (key === formKey) return;
  formKey = key;
  const cap = (t, cls) => `<kbd class="cap ${cls}" data-pad="${kind}">${t}</kbd>`,
    morph = kind === 'sn30' ? cap('A', 'face') : cap('B', 'face'),
    fly = kind === 'sn30' ? cap('L', 'bump') : cap('LB', 'bump'),
    f = (k, icon) => `<span class="form${k === now ? ' on' : ''}">${icon}</span>`;
  formEl.innerHTML = `${morph}${f('car', '🚗')}${f('walk', '🚶')}${f('skate', '🛹')}<i></i>${fly}${f('fly', '✈️')}`;
}
function formBarP2(all) {
  const gp = split ? all[split.pad] : null,
    rv = race.rivals[0];
  formEl2.hidden = !gp || !started || !race.roam || !splitOn || !rv || !!ui.panel();
  if (formEl2.hidden) return;
  const kind = padKind(gp.id),
    now = rv.session.flight.mode
      ? 'fly'
      : split.p2Form === 'board'
        ? 'skate'
        : split.p2Form === 'robot'
          ? 'walk'
          : 'car',
    key = kind + now;
  if (key === formKey2) return;
  formKey2 = key;
  const cap = (t, cls) => `<kbd class="cap ${cls}" data-pad="${kind}">${t}</kbd>`,
    morph = kind === 'sn30' ? cap('A', 'face') : cap('B', 'face'),
    fly = kind === 'sn30' ? cap('L', 'bump') : cap('LB', 'bump'),
    f = (k, icon) => `<span class="form${k === now ? ' on' : ''}">${icon}</span>`;
  formEl2.innerHTML = `${morph}${f('car', '🚗')}${f('walk', '🚶')}${f('skate', '🛹')}<i></i>${fly}${f('fly', '✈️')}`;
}
function playingForm(player) {
  if (player === 2) {
    const rv = race.rivals[0];
    if (rv?.session.flight.mode) return 'fly';
    if (split?.p2Form === 'robot') return 'robot';
    if (split?.p2Form === 'board') return 'board';
    return 'car';
  }
  if (s.flight.mode) return 'fly';
  if (robot) return 'robot';
  if (form === 'board' || skate) return 'board';
  return 'car';
}
function coachFrame(all, p1, p2, now) {
  const dt = coachLast ? Math.min(0.1, (now - coachLast) / 1000) : 0;
  coachLast = now;
  const live = all.filter(p => p?.connected),
    busy = p => p.buttons.some(b => b.value > 0.5) || p.axes.some(a => Math.abs(a) > 0.3);
  for (const p of live) if (p.index !== split?.pad && busy(p)) p1Last = p.index;
  const rv0 = race.rivals[0],
    p1Form = playingForm(1),
    p2Form = playingForm(2),
    players = [
      {
        pad: all[p1Last] ?? live.find(p => p.index !== split?.pad),
        input: p1,
        speed: robot ? Math.hypot(robot.vel[0], robot.vel[2]) : readout(s).speed,
        on: started && !paused && !ui.panel(),
        form: p1Form,
        effort: p1Form === 'robot' ? Math.hypot(p1?.moveX || 0, p1?.moveY || 0) : p1?.throttle || 0
      },
      {
        pad: splitOn ? all[split.pad] : null,
        input: p2,
        speed: splitOn && rv0 ? (split?.p2Form === 'robot' && p2Robot ? Math.hypot(p2Robot.vel[0], p2Robot.vel[2]) : readout(rv0.session).speed) : 0,
        on: started && !paused && !ui.panel() && splitOn && !!rv0,
        form: p2Form,
        effort: p2Form === 'robot' ? Math.hypot(p2?.moveX || 0, p2?.moveY || 0) : p2?.throttle || 0
      }
    ],
    draw = now - coachDrawn > 66;
  if (draw) coachDrawn = now;
  players.forEach(({pad: gp, input, speed, on, form: shape, effort}, i) => {
    const el = coachEls[i];
    if (!gp || !input) return void (el.hidden = true);
    const busyNow = gp.buttons.some(b => b.value > 0.5) || gp.axes.some(a => Math.abs(a) > 0.3);
    const c = coaches[i]({dt, speed, throttle: effort, lt: gp.buttons[6]?.value ?? 0, rt: gp.buttons[7]?.value ?? 0, active: on, joined: !!input.joined, touched: busyNow, form: shape});
    el.hidden = !c.show;
    el.classList.toggle('left', splitOn && i === 0);
    el.classList.toggle('right', i === 1);
    if (c.show && draw) {
      const pressed = new Set(gp.buttons.flatMap((b, k) => (b.value > 0.5 ? [k] : [])));
      el.innerHTML = padSvg(padKind(gp.id), {pressed, axes: [...gp.axes]}, {glow: c.glow, width: 440, form: shape});
    }
  });
}
// Split screen: a second controller pressing Start takes over the first rival car; the TV
// splits left (player 1) / right (player 2). Select on that controller goes back to one.
// Skate and flight stay in this split. A walking robot on either side keeps it too.
const camera2 = new T.PerspectiveCamera(63, 1, 0.06, 210),
  pollP2 = createGamepadInput(),
  target2 = new T.Vector3(),
  desired2 = new T.Vector3();
let split = null,
  p1Pad = null,
  startHeld = new Set(),
  splitOn = false,
  joinHideUntil = 0;
const playersUrl2 = new URLSearchParams(location.search).get('players') === '2',
  joinCard = Object.assign(document.createElement('div'), {id: 'join-card', hidden: true});
joinCard.innerHTML = '<div class="join-pad" aria-hidden="true"></div><p class="join-cta">START ▶ join</p>';
document.body.append(joinCard);
let justJoined = false;
function joinWithPad(padIndex) {
  if (split || !started || padIndex == null || padIndex === p1Pad || !race.rivals.length) return;
  split = {pad: padIndex, heading: null, lookYaw: 0, lookPitch: 0, lookIdle: 0, placed: false, fire: false, p2Form: 'car'};
  justJoined = true;
  callout('👥 2 players!', 3000);
  telemetry.choice?.('split', 'join');
}
function leaveSplit(now) {
  if (!split) return;
  parkP2Robot();
  if (p2BoardRider) p2BoardRider.visible = false;
  if (race.rivals[0]) delete race.rivals[0].human;
  split = null;
  joinHideUntil = joinHideUntilAfterLeave(now);
  callout('👤 1 player', 2000);
}
function syncJoinUi(all, now) {
  const live = all.filter(p => p?.connected),
    {hidden, label} = menuPlayersButton({split, live, p1Pad}),
    menuBtn = $('menu-players');
  menuBtn.hidden = hidden;
  if (!hidden) menuBtn.textContent = label;
  const show = joinCardVisible({
    split,
    started,
    paused,
    panelOpen: !!ui.panel(),
    now,
    joinHideUntil,
    playersUrl2,
    hasRival: !!race.rivals.length,
    live,
    p1Pad
  });
  joinCard.hidden = !show;
  if (!show) return;
  const gp = all[joinPadIndex(live, p1Pad)];
  if (!gp) return;
  // Built once per pad, not per frame, so Start's pulse animation actually runs.
  if (joinCard.dataset.pad !== gp.id) {
    joinCard.dataset.pad = gp.id;
    joinCard.querySelector('.join-pad').innerHTML = padSvg(padKind(gp.id), {}, {labels: false, glow: new Set([9]), width: 260});
  }
}
// Finding each other: a light beam over each car, seen only from the OTHER player's camera
// (layer 1 = player 1's beam, drawn by camera2; layer 2 = player 2's, drawn by camera), and
// an edge arrow with the distance when the partner is off screen. LB/L jumps you to them.
const beam = (colour, layer) => {
  const m = new T.Mesh(
    new T.CylinderGeometry(0.22, 0.22, 40, 10, 1, true),
    new T.MeshBasicMaterial({color: colour, transparent: true, opacity: 0.45, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide})
  );
  m.layers.set(layer);
  m.visible = false;
  m.renderOrder = 5;
  scene.add(m);
  return m;
};
const beams = [beam('#ff9a2e', 1), beam('#4fb3ff', 2)],
  finders = [1, 2].map(n => {
    const el = Object.assign(document.createElement('div'), {className: 'finder', hidden: true});
    el.setAttribute('aria-hidden', 'true');
    document.body.append(el);
    return el;
  });
camera.layers.enable(2);
camera2.layers.enable(1);
// A 3D arrow over your own car pointing at your partner, in their colour, seen only from your
// own camera (layer 3 = player 1's, layer 4 = player 2's). Replaces the beams and edge tags.
const pointer = (colour, layer) => {
  const g = new T.Group(),
    mat = new T.MeshBasicMaterial({color: colour, depthTest: false, transparent: true, opacity: 0.95}),
    shaft = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.42, 10), mat),
    head = new T.Mesh(new T.ConeGeometry(0.15, 0.3, 14), mat);
  shaft.rotation.x = head.rotation.x = Math.PI / 2;
  shaft.position.z = 0.05;
  head.position.z = 0.4;
  for (const m of [shaft, head]) {
    m.layers.set(layer);
    m.renderOrder = 10;
    g.add(m);
  }
  g.visible = false;
  scene.add(g);
  return {g, mat, colour};
};
const pointers = [pointer('#4fb3ff', 3), pointer('#ff9a2e', 4)];
camera.layers.enable(3);
camera2.layers.enable(4);
let warpHeld = [false, false],
  warpAt = 0;
function splitAnchor() {
  return robot ? robot.pos : s.car.pos;
}
function splitFollower() {
  return split?.p2Form === 'robot' && p2Robot ? p2Robot.pos : race.rivals[0].session.car.pos;
}
function findFrame(all, now) {
  const on = splitOn,
    it = tag.on ? tag.it : 0;
  beams.forEach(b => (b.visible = false));
  finders.forEach(f => (f.hidden = true));
  pointers.forEach(p => (p.g.visible = on));
  if (!on) {
    findWarp(all, now);
    return;
  }
  {
    const a = splitAnchor(),
      b = splitFollower(),
      bob = Math.sin(now * 0.004) * 0.05;
    [
      [pointers[0], a, b, 2],
      [pointers[1], b, a, 1]
    ].forEach(([p, from, to, partner]) => {
      const dx = to[0] - from[0],
        dz = to[2] - from[2],
        close = Math.hypot(dx, dz) < 4;
      p.g.visible = !close;
      p.g.position.set(from[0], from[1] + 0.38 + bob * 0.4, from[2]);
      p.g.scale.setScalar(0.4);
      p.g.rotation.y = Math.atan2(dx, dz);
      p.mat.color.set(it === partner ? '#ff4444' : p.colour);
    });
  }
  return findWarp(all, now);
}
function findWarp(all, now) {
  if (!splitOn) return;
  const it = tag.on ? tag.it : 0,
    a = splitAnchor(),
    rv = race.rivals[0],
    b = splitFollower();
  beams[0].position.set(a[0], a[1] + 20, a[2]);
  beams[1].position.set(b[0], b[1] + 20, b[2]);
  const pulse = 0.32 + 0.18 * Math.sin(now * 0.008);
  beams.forEach((beamMesh, i) => {
    const isIt = it === i + 1,
      mat = beamMesh.material;
    if (tag.on && isIt) {
      mat.color.set('#ff4444');
      mat.opacity = pulse;
      beamMesh.scale.set(2, 1, 2);
    } else {
      mat.color.set(i ? '#4fb3ff' : '#ff9a2e');
      mat.opacity = 0.45;
      beamMesh.scale.set(1, 1, 1);
    }
  });
  const d = Math.round(Math.hypot(a[0] - b[0], a[2] - b[2])),
    w = innerWidth / 2,
    h = innerHeight,
    v = new T.Vector3();
  [
    [camera, b, 0, 'P2', '#4fb3ff'],
    [camera2, a, w, 'P1', '#ff9a2e']
  ].forEach(([cam, at, x0, who, colour], i) => {
    const f = finders[i];
    v.set(at[0], at[1] + 0.6, at[2]).project(cam);
    const behind = v.z > 1,
      sx = behind ? -v.x : v.x,
      sy = behind ? -v.y : v.y,
      inside = !behind && Math.abs(sx) < 0.92 && Math.abs(sy) < 0.9;
    const partnerIt = (i === 0 && it === 2) || (i === 1 && it === 1),
      tail = partnerIt ? 'IT!' : `${who} · ${d} m`;
    // On screen: a tag over their car. Off screen: pinned to the edge, pointing at them.
    const k = inside ? 1 : 0.88 / Math.max(Math.abs(sx), Math.abs(sy), 0.001),
      px = x0 + ((sx * k + 1) / 2) * w,
      py = ((1 - sy * k) / 2) * h,
      ang = Math.atan2(-sy, sx);
    f.style.cssText = `left:${px}px;top:${py}px;--c:${partnerIt ? '#ff4444' : colour}`;
    f.innerHTML = `${inside ? '▼' : `<b style="transform:rotate(${ang}rad)">➤</b>`} ${tail}`;
  });
  // LB / L: jump to your partner (2 s apart so a held button doesn't ping-pong).
  const pads = [all.filter(p => p?.connected && p.index !== split.pad), [all[split.pad]].filter(Boolean)];
  pads.forEach((list, i) => {
    const down = list.some(p => p.buttons[8]?.value > 0.5);
    if (down && !warpHeld[i] && now - warpAt > 2000 && !paused && !ui.panel()) {
      warpAt = now;
      if (i === 1) split.placed = false;
      else {
        const spot = [b[0] - 2.5, b[1] + 0.4, b[2]];
        if (robot) {
          robot.pos = [...spot];
          robot.vel = [0, 0, 0];
        }
        s.car.pos = [...spot];
        s.car.vel = [0, 0, 0];
        if (rv.session.car.q) s.car.q = [...rv.session.car.q];
      }
      callout(i === 0 ? '✨ P1 jumped to P2' : '✨ P2 jumped to P1', 1500);
    }
    warpHeld[i] = down;
  });
}
function huntFrame(dt) {
  const menu = $('menu-hunt');
  if (menu.hidden === splitOn) menu.hidden = !splitOn;
  if (!splitOn) {
    if (hunt.on) {
      setHuntOn(hunt, false);
      menu.setAttribute('aria-pressed', 'false');
    }
    huntHud.forEach(el => (el.hidden = true));
    huntResult.hidden = true;
    return;
  }
  if (!hunt.on) {
    huntHud.forEach(el => (el.hidden = true));
    huntResult.hidden = true;
    return;
  }
  stepHunt(hunt, dt, paused || ui.panel());
  paintHunt();
}
function tagFrame(dt) {
  const menu = $('menu-tag');
  if (menu.hidden === splitOn) menu.hidden = !splitOn;
  if (!splitOn) {
    if (tag.on) {
      setTagOn(tag, false);
      menu.setAttribute('aria-pressed', 'false');
    }
    tagHud.forEach(h => (h.hidden = true));
    tagResult.hidden = true;
    return;
  }
  if (!tag.on) {
    tagHud.forEach(h => (h.hidden = true));
    tagResult.hidden = true;
    return;
  }
  const a = splitAnchor(),
    b = splitFollower(),
    dist = Math.hypot(a[0] - b[0], a[2] - b[2]),
    ev = stepTag(tag, dt, dist, paused || ui.panel());
  if (ev.tagged) callout('🏷️ Tagged!', 900);
  const showResult = tag.resultLeft > 0;
  tagResult.hidden = !showResult;
  if (showResult) {
    tagHead.textContent = resultHead(tag);
    tagStats.textContent = resultStats(tag).join(' · ');
  }
  for (let p = 1; p <= 2; p++) {
    const el = tagHud[p - 1];
    if (showResult) {
      el.hidden = true;
      continue;
    }
    const safe = tag.safe === p && tag.safeLeft > 0;
    el.classList.toggle('safe', safe);
    el.textContent = safe ? 'Safe!' : hudLine(tag, p);
    el.hidden = false;
  }
}
function teamFrame() {
  const menu = $('menu-team');
  if (menu.hidden === splitOn) menu.hidden = !splitOn;
  if (!splitOn) {
    team.on = false;
    p2Lap.hidden = true;
    return;
  }
  const show = team.on && started && !race.roam && !race.furball && $('result').hidden && race.rivals[0];
  p2Lap.hidden = !show;
  if (show) p2Lap.textContent = p2LapChip(race.rivals[0].session);
}
const p2Hud = Object.assign(document.createElement('div'), {id: 'p2-hud', hidden: true}),
  splitLine = Object.assign(document.createElement('div'), {id: 'split-line', hidden: true});
document.body.append(p2Hud, splitLine);
function splitInput(all, now) {
  const live = all.filter(p => p?.connected);
  const starts = new Set(live.filter(p => p.buttons[9]?.value > 0.5).map(p => p.index));
  // Nobody has played yet and one of two pads presses Start on the join card: the OTHER pad
  // is player 1, so the kid pressing Start joins instead of becoming player 1 by accident.
  if (p1Pad == null && !split && started && live.length > 1 && race.rivals.length)
    for (const i of starts)
      if (!startHeld.has(i) && $('join-card') && !$('join-card').hidden) p1Pad = live.find(p => p.index !== i).index;
  p1Pad ??= live.find(p => p.buttons.some(b => b.value > 0.5))?.index ?? null;
  if (!split && started && p1Pad != null && race.rivals.length)
    for (const i of starts)
      if (i !== p1Pad && !startHeld.has(i)) joinWithPad(i);
  startHeld = starts;
  if (split && !all[split.pad]?.connected) {
    parkP2Robot();
    if (p2BoardRider) p2BoardRider.visible = false;
    if (race.rivals[0]) delete race.rivals[0].human;
    split = null;
    joinHideUntil = joinHideUntilAfterLeave(now);
  }
  // Who's actually playing: if one player leaves the pad for a minute, the other gets the
  // whole screen until they press something again.
  if (split) {
    const t = performance.now(),
      busy = p => p?.connected && (p.buttons.some(b => b.value > 0.5) || p.axes.some(a => Math.abs(a) > 0.3));
    if (all.some(p => p && p.index !== split.pad && busy(p)) || split.p1At == null) split.p1At = t;
    if (busy(all[split.pad]) || split.p2At == null) split.p2At = t;
    const idle1 = t - split.p1At > 60000,
      idle2 = t - split.p2At > 60000;
    split.solo = idle1 && !idle2 ? 2 : idle2 && !idle1 ? 1 : 0;
  }
  const p1 = pollGamepad(split ? all.filter(p => p && p.index !== split.pad) : all, playingForm(1)),
    p2 = split ? pollP2([all[split.pad]], playingForm(2)) : null;
  if (p2?.fire) split.fire = true;
  return {p1, p2};
}
// Home TV: who is doing what. Each pad's active time and buttons per 5 s window, with the
// mode, posted to the serving laptop (local builds only, never the public site).
const padLog = (() => {
  const local = /^(127\.0\.0\.1|localhost)$/.test(location.hostname),
    acc = new Map();
  let windowStart = 0,
    last = 0;
  return (pads, now) => {
    if (!local) return;
    const dt = last ? Math.min(250, now - last) : 0;
    last = now;
    for (const p of Array.from(pads ?? []).filter(p => p?.connected)) {
      const pressed = p.buttons.flatMap((b, i) => (b.value > 0.5 ? [i] : [])),
        moving = p.axes.some(a => Math.abs(a) > 0.3);
      const a = acc.get(p.id) ?? {pad: p.index, activeMs: 0, buttons: {}};
      if (pressed.length || moving) a.activeMs += dt;
      for (const i of pressed) a.buttons[i] = (a.buttons[i] ?? 0) + 1;
      acc.set(p.id, a);
    }
    if (!windowStart) windowStart = now;
    if (now - windowStart < 5000) return;
    const who = [...acc].filter(([, a]) => a.activeMs > 0).map(([id, a]) => ({id, ...a, activeMs: Math.round(a.activeMs)}));
    if (who.length)
      navigator.sendBeacon('/pad-log', JSON.stringify({
        at: new Date().toISOString(), mode, track: telemetryTrack, paused, panel: !!ui.panel(), started,
        vehicle: robot ? 'robot' : skate ? 'skate' : s.flight.mode ? 'flight' : 'car',
        split: split
          ? (() => {
              const c2 = race.rivals[0]?.session;
              return {p2Pad: split.pad, on: splitOn, solo: split.solo ?? 0, p2Speed: c2 ? Math.round(Math.hypot(c2.car.vel[0], c2.car.vel[2]) * 3.6) : null, p2Form: c2?.flight.mode ? 'flight' : split.p2Form ?? 'car'};
            })()
          : null,
        p1Pad,
        covering: ['#brief', '#result', '.overlay', '#intro', '#tag-result', '#hunt-result', '#coach1', '#coach2', '#keys-panel', '#join-card']
          .flatMap(q => [...document.querySelectorAll(q)])
          .filter(el => !el.hidden && el.offsetParent !== null)
          .map(el => el.id || el.className),
        tag: tagTelemetry(tag),
        hunt: huntTelemetry(hunt),
        place: openWorld ? nearestLocation(s.car.pos).short : null, speed: Math.round(Math.hypot(...(s.car.vel ?? [0, 0, 0])) * 3.6), who
      }));
    acc.clear();
    windowStart = now;
  };
})();
// Menus answer the controller too: the open dialog, else the pause/start menu.
const menuPad = createMenuPad({
  root: () =>
    document.querySelector('.overlay:not([hidden])') ??
    ($('result').hidden || !$('result').querySelector('button') ? null : $('result')) ??
    ($('brief').hidden ? null : $('brief')),
  back: () => {
    if (ui.panel()) return ui.close();
    const card = $('result');
    if (!card.hidden) return [...card.querySelectorAll('button')].find(b => /drive|close|×|back|ok/i.test(b.textContent))?.click();
    if (started && paused) pause(false);
  }
});
const frameMs = [];
dreams = attachDreams({
  scene,
  renderer,
  camera,
  camera2,
  audio,
  telemetry,
  coinsEl: $('dream-coins'),
  wakeEl: $('wake'),
  rideHeight: () => rideHeight(s.car.params),
  poseRobot: poseRobotBody,
  snapshot() {
    const yaw = readout(s).yaw;
    const list = [
      {
        id: 'p1',
        pos: form === 'robot' && robot ? [...robot.pos] : [...s.car.pos],
        yaw: form === 'robot' && robot ? robot.yaw : yaw,
        vel: form === 'robot' && robot ? [...robot.vel] : [...s.car.vel],
        form,
        carPos: [...s.car.pos],
        carYaw: yaw,
        carVel: [...s.car.vel]
      }
    ];
    if (split && race.rivals[0]) {
      const c = race.rivals[0].session.car,
        y2 = carYaw(c),
        walking = split.p2Form === 'robot' && p2Robot;
      list.push({
        id: 'p2',
        pos: walking ? [...p2Robot.pos] : [...c.pos],
        yaw: walking ? p2Robot.yaw : y2,
        vel: walking ? [...p2Robot.vel] : [...c.vel],
        form: walking ? 'robot' : split.p2Form === 'board' ? 'board' : 'car',
        carPos: [...c.pos],
        carYaw: y2,
        carVel: [...c.vel]
      });
    }
    return list;
  },
  visuals() {
    const list = [];
    if (form === 'robot' && robotBody) list.push({mesh: robotBody, kind: 'robot'});
    else if (form === 'board' && boardRider) list.push({mesh: boardRider, kind: 'board'});
    else list.push({mesh: car, kind: 'car'});
    if (dreams.active() && (dreams.wantsSplit() || split) && race.rivals[0]) {
      if (split?.p2Form === 'robot' && p2RobotBody) list.push({mesh: p2RobotBody, kind: 'robot'});
      else if (split?.p2Form === 'board' && p2BoardRider) list.push({mesh: p2BoardRider, kind: 'board'});
      else if (rivalVis[0]) list.push({mesh: rivalVis[0].group, kind: 'car'});
    }
    return list;
  },
  park(stored) {
    const [a, b] = stored ?? [];
    if (a) {
      if (form === 'robot' && robot) {
        robot.pos[0] = a.pos[0];
        robot.pos[1] = a.pos[1];
        robot.pos[2] = a.pos[2];
        robot.yaw = a.yaw;
        robot.vel[0] = robot.vel[1] = robot.vel[2] = 0;
      }
      const pos = a.form === 'robot' ? a.carPos : a.pos;
      s.car.pos[0] = pos[0];
      s.car.pos[1] = pos[1];
      s.car.pos[2] = pos[2];
      s.car.vel[0] = s.car.vel[1] = s.car.vel[2] = 0;
      s.car.ang[0] = s.car.ang[1] = s.car.ang[2] = 0;
    }
    if (b && race.rivals[0]) {
      if (b.form === 'robot' && split?.p2Form === 'robot' && p2Robot) {
        p2Robot.pos[0] = b.pos[0];
        p2Robot.pos[1] = b.pos[1];
        p2Robot.pos[2] = b.pos[2];
        p2Robot.yaw = b.yaw;
        p2Robot.vel[0] = p2Robot.vel[1] = p2Robot.vel[2] = 0;
      }
      const c = race.rivals[0].session.car,
        pos = b.form === 'robot' ? b.carPos : b.pos;
      c.pos[0] = pos[0];
      c.pos[1] = pos[1];
      c.pos[2] = pos[2];
      c.vel[0] = c.vel[1] = c.vel[2] = 0;
      c.ang[0] = c.ang[1] = c.ang[2] = 0;
    }
  }
});
function frame(now) {
  // Two presented frames stay on the establishing shot so a leftover driver stall does not
  // move the camera. The glide, the session, and adaptive resolution start after that.
  if (openingHeld && openingShown >= 2) {
    openingHeld = false;
    openingReleasedAt = now;
    adaptive.frames = [];
    adaptive.since = 0;
    adaptive.calm = 0;
    last = now;
  }
  if (openingHeld) openingShown++;
  // Sound starts on a click or key; a household on controllers never makes one, so any pad
  // press wakes it too (the browser allows it once the page has had any real interaction).
  if (audio.ctx?.state !== 'running' && Array.from(navigator.getGamepads?.() ?? []).some(p => p?.buttons.some(b => b.pressed)))
    audio.start();
  const allPads = Array.from(navigator.getGamepads?.() ?? []),
    {p1: pad, p2: pad2} = splitInput(allPads, now);
  syncJoinUi(allPads, now);
  splitOn = splitScreenOn({
    split,
    rival: race.rivals[0],
    started,
    p1Robot: !!robot,
    p2Robot: split?.p2Form === 'robot' && !!p2Robot
  }) || !!dreams?.wantsSplit();
  {
    const rv = splitOn ? race.rivals[0] : null,
      p2Gp = split ? allPads[split.pad] : null;
    for (const x of race.rivals) if (x !== rv && x.human) delete x.human;
    if (rv) {
      rv.human = () => {
        const f = split?.fire;
        if (split) split.fire = false;
        const tb = tag.on && tag.it === 2 && !tag.resultLeft ? TAG.itBoost : 1;
        return rivalHumanInput({
          paused,
          uiPanel: !!ui.panel(),
          pad2: pad2 ?? {throttle: 0, steer: 0, brake: false, drift: false, boost: false},
          gp: p2Gp,
          mode,
          session: rv.session,
          fire: f,
          tagBoost: tb,
          p2Form: split?.p2Form ?? 'car'
        });
      };
      // Keep the two toys together: the world only streams around player 1.
      // A walker is the body that counts, otherwise the parked car gets hauled back alone.
      const anchor = robot ? robot.pos : s.car.pos,
        follower = split?.p2Form === 'robot' && p2Robot ? p2Robot.pos : rv.session.car.pos;
      // Pushing and going nowhere for 3 s (nose in a hill, wedged on a wall): back on the road.
      const rs = rv.session.car;
      split.stuck =
        split.p2Form === 'robot'
          ? 0
          : !paused && pad2 && pad2.throttle > 0.3 && Math.hypot(rs.vel?.[0] ?? 0, rs.vel?.[2] ?? 0) < 0.5
            ? (split.stuck ?? 0) + 1 / 60
            : 0;
      if (split.stuck > 3) {
        split.stuck = 0;
        recover(rv.session);
        split.heading = null;
      }
      // Fell through the world (the ground only streams in round player 1): straight back up.
      // Flying spreads the pair out and lifts player 1, so loosen the tether and skip the fall check.
      const airborne = !!s.flight.mode || !!rv.session.flight.mode,
        teamRacing = team.on && !race.roam && !race.furball;
      if (
        !teamRacing &&
        (!split.placed ||
          Math.hypot(anchor[0] - follower[0], anchor[2] - follower[2]) > (airborne ? 400 : 120) ||
          (!airborne && follower[1] < anchor[1] - 20))
      ) {
        split.placed = true;
        const spot = [anchor[0] + 2.5, anchor[1] + 0.4, anchor[2]];
        if (split.p2Form === 'robot' && p2Robot) {
          p2Robot.pos = [...spot];
          p2Robot.vel = [0, 0, 0];
        }
        rv.session.car.pos = [...spot];
        rv.session.car.vel = [0, 0, 0];
        if (s.car.q) rv.session.car.q = [...s.car.q];
        split.heading = null;
      }
    }
  }
  if (menuPad(navigator.getGamepads?.(), now)) pad.fire = pad.boost = false;
  padLog(navigator.getGamepads?.(), now);
  coachFrame(allPads, pad, pad2, now);
  useButton(allPads);
  findFrame(allPads, now);
  if (pad.start || (pad2?.start && split && !justJoined)) {
    if (!started) $('start').click();
    else if (!ui.panel()) pause(!paused);
  }
  justJoined = false;
  padAim = !!(robot && pad.aim);
  if ((pad.map || pad2?.map) && started && !ui.panel()) $('atlas').click();
  if (!paused && !ui.panel() && pad.fire && !labBusy(labRide)) {
    fireQueued = true;
    if (robot) punchQueued = true;
  }
  if (labBusy(labRide) && (pad.fire || pad.jump)) labSkipEdge = true;
  if (pad.boost && !ui.panel() && !useClicked && !leverNear(robot ? robot.pos : s.car.pos)) toggleBoost();
  useClicked = false;
  {
    const b = $('boost'),
      on = boostOn && race.roam && !robot && !skate;
    if (b.hidden === on) {
      b.hidden = !on;
    }
    if (on) b.textContent = s.flight.mode ? '🔥 ZOOM · F' : '🔥 BOOST · F';
  }
  if (!started && !$('start').disabled && !openingHeld) {
    started = true;
    paused = false;
    $('brief').hidden = true;
    $('pause').textContent = '⏸';
    if (!race.roam) startCountdown();
  }
  const timeScale = openWorld?.stuntScale(s.car, Math.max(0, now - last) / 1000, stuntEnabled()) ?? 1,
    dt = frameSeconds(now, last) * timeScale;
  openWorld?.skyTourFrame(paused || ui.panel() ? 0 : dt, skyEligible(), mode);
  const frameDelta = Math.max(0, now - last);
  telemetry.observeFrame(frameDelta, !paused && countdown <= 0 && !document.hidden);
  frameMs.push(frameDelta);
  if (frameMs.length > 600) frameMs.shift();
  bootTrace?.frame(frameDelta, now);
  {
    // Boot hitches are shader and upload stalls, not a reason to drop the pixel ratio.
    const r = !paused && started && !openingHeld ? stepAdaptiveResolution(adaptive, frameDelta) : null;
    if (r) {
      renderer.setPixelRatio(r);
      polish?.setPixelRatio?.(r);
    }
  }
  last = now;
  tagFrame(dt);
  huntFrame(dt);
  teamFrame();
  if (!paused && !ui.panel() && countdown > 0) {
    countdown -= dt;
    const n = Math.ceil(countdown);
    if (n < lastBeep) {
      lastBeep = n;
      n > 0 ? audio.beep() : audio.beep(true);
    }
    $('countdown').hidden = countdown <= -0.6;
    $('countdown').textContent = countdown > 0 ? String(n) : 'GO!';
    if (countdown <= 0 && countdown > -0.6) {
    }
    acc = 0;
  }
  if (!paused && !ui.panel() && countdown <= 0 && (!openWorld || openWorld.stream.ready(s.car.pos))) {
    const dreamInput = () => {
      const clamp = v => Math.max(-1, Math.min(1, v)),
        d = drivingInput(keys, {
          ...pad,
          steer: touchState.steer || pad.steer,
          throttle: touchState.throttle || pad.throttle,
          brake: touchState.brake || pad.brake
        });
      return [
        {move: clamp((d.steer || 0) + (d.throttle || 0)), jump: keys.has('Space') || !!(pad.jump || hopQueued)},
        pad2 ? {move: clamp((pad2.steer || 0) + (pad2.throttle || 0)), jump: !!pad2.jump} : {move: 0, jump: false}
      ];
    };
    dreams.frame(dt, dreamInput(), {
      paused: false,
      search: location.search,
      positions: [
        form === 'robot' && robot ? robot.pos : s.car.pos,
        split && race.rivals[0]
          ? split.p2Form === 'robot' && p2Robot
            ? p2Robot.pos
            : race.rivals[0].session.car.pos
          : null
      ].filter(Boolean)
    });
    $('countdown').hidden = countdown <= -0.6;
    if (countdown > -0.6) countdown -= dt;
    acc += dt;
    prof.simStart = performance.now();
    while (acc >= 1 / 120) {
      if (dreams.ownsSim()) {
        dreams.substep(1 / 120, dreamInput());
        fireQueued = false;
        hopQueued = false;
        acc -= 1 / 120;
        continue;
      }
      const drive = drivingInput(keys, {
          ...pad,
          steer: touchState.steer || pad.steer,
          throttle: touchState.throttle || pad.throttle,
          brake: touchState.brake || pad.brake
        }),
        throttleIn = drive.throttle;
      if (
        pad.jump &&
        !robot &&
        race.roam &&
        s.car.grounded &&
        !s.flight.mode &&
        !dreams?.ownsSim()
      ) {
        s.car.vel = [s.car.vel[0], s.car.vel[1] + (form === 'board' ? FLIGHT.ollie : FLIGHT.hop), s.car.vel[2]];
        pad.jump = false;
      }
      if (
        pad2?.jump &&
        split?.p2Form !== 'robot' &&
        race.rivals[0] &&
        !race.rivals[0].session.flight.mode &&
        race.rivals[0].session.car.grounded
      ) {
        const rc = race.rivals[0].session.car;
        rc.vel = [rc.vel[0], rc.vel[1] + (split.p2Form === 'board' ? FLIGHT.ollie : FLIGHT.hop), rc.vel[2]];
        pad2.jump = false;
      }
      if (fireQueued && race.pickups.held.get(s.car)) {
        const it = race.pickups.held.get(s.car);
        telemetry.itemUse(it);
        it === 'zoom' ? audio.boost() : audio.fire();
      }
      if (skate && fireQueued) skateGrabUntil = performance.now() + 400;
      const skateInput = skate
        ? {...drive, drift: drive.drift || skateTouchGrab || performance.now() < skateGrabUntil}
        : drive;
      // A winged dinosaur flies with the proximity assist in every mode (no levelling, a late save).
      const keyFl = flightInput(keys),
        fl = {
          pitch: keyFl.pitch || pad.pitch || 0,
          roll: keyFl.roll || pad.roll || 0,
          yaw: keyFl.yaw || 0,
          power: keyFl.power || pad.power || 0,
          assist: mode === 'kid' || winged(),
          proximity: winged()
        };
      if (s.flight.mode === 'chute') fl.steer = drive.steer || pad.moveX || 0;
      fl.burner = boostOn && race.roam && !skate;
      fl.lift = skyEligible() && s.flight.mode === 'fly' ? openWorld.cloudLift(s.car.pos) : 0;
      {
        const was = burning;
        burning = fl.burner && (!!s.flight.mode || throttleIn > 0);
        if (burning && !was) audio.boost();
      }
      if (robot && !openWorld?.digging?.()) {
        const keyWalk = drivingInput(keys, {}),
          keyboard = keyWalk.throttle !== 0 || keyWalk.steer !== 0,
          camYaw = (camHeading ?? robot.yaw) + lookYaw;
        stepRobot(
          robot,
          intro.active
            ? {}
            : bowlingHold != null
              ? {throttle: 0, steer: (keyboard ? keyWalk.steer : pad.moveX) * 0.13}
              : keyboard
                ? {throttle: keyWalk.throttle, steer: keyWalk.steer, jump: keys.has('Space') || pad.jumpHeld}
                : {
                    move: cameraMove(camYaw, pad.moveX, pad.moveY),
                    jump: keys.has('Space') || pad.jumpHeld,
                    sprint: pad.sprint
                  },
          course.world,
          1 / 120
        );
      }
      if (split?.p2Form === 'robot' && p2Robot) {
        const walk = p2RobotPad(allPads[split.pad], (split.heading ?? p2Robot.yaw) + (split.lookYaw || 0));
        stepRobot(
          p2Robot,
          {move: walk.move, jump: walk.jump, sprint: walk.sprint},
          course.world,
          1 / 120
        );
        if (p2PunchQueued) {
          p2PunchQueued = false;
          p2Robot.punch = COMBAT.punchTime;
          p2Robot.use = COMBAT.punchTime;
          p2Robot.vel[0] += Math.sin(p2Robot.yaw) * COMBAT.lunge;
          p2Robot.vel[2] -= Math.cos(p2Robot.yaw) * COMBAT.lunge;
        } else if (p2Robot.punch > 0) {
          p2Robot.punch = Math.max(0, p2Robot.punch - 1 / 120);
          p2Robot.use = p2Robot.punch;
        }
      }
      hotWheelsPre();
      tennisStep(1 / 120, drive);
      const schoolPrev = openWorld?.school()?.active ? [...s.car.pos] : null;
      const skyPlacement = s.car.placement;
      skyPrev[0] = s.car.pos[0];
      skyPrev[1] = s.car.pos[1];
      skyPrev[2] = s.car.pos[2];
      const tagBoost = tag.on && tag.it === 1 && !tag.resultLeft ? TAG.itBoost : 1;
      const labHold = labBusy(labRide);
      if (!labHold) annexSim(1 / 120);
      stepRace(
        race,
        robot || labHold
          ? {throttle: 0, steer: 0, brake: true}
          : {
              ...skateInput,
              ...trickInput(keys),
              boardSpin: form === 'board',
              hop: hopQueued,
              grindDir: form === 'board' ? stick() : null,
              fire: fireQueued,
              flight: fl,
              boost: (fl.burner && !s.flight.mode ? FLIGHT.burnerBoost : 1) * tagBoost
            },
        1 / 120
      );
      if (race.retreatMarkSeen) {
        try {
          sessionStorage.setItem(RACE_RETREAT_SEEN_KEY, '1');
        } catch {}
        race.retreatMarkSeen = false;
      }
      hotWheelsPost();
      skyJumpStep();
      skateStep(skateInput);
      boardStep(skateInput);
      if (openWorld)
        for (const session of [s, ...race.rivals.map(r => r.session)]) openWorld.step(session.car, 1 / 120);
      skyTourStep(skyPlacement, 1 / 120);
      if (schoolPrev) schoolStep(schoolPrev, 1 / 120);
      stuntStep(1 / 120);
      if (openWorld) deliveryStep(1 / 120);
      if (openWorld && race.roam) {
        bowlingPrepare(1 / 120);
        const activity = openWorld.stepActivity(
          1 / 120,
          openWorld.activity()?.control === 'robot' ? robot : s.car
        );
        if (activity?.cancelled) bowlingHold = null;
        if (activity?.gutter) callout('Gutter ball…');
        if (activity?.rolled && !activity.finished) {
          if (activity.strike) {
            audio.finish();
            callout('🎳 STRIKE!');
          } else if (activity.spare) {
            audio.coin();
            callout('🎳 Spare!');
          }
        }
        if (activity?.tee)
          placeCar(
            s.car,
            [activity.tee.pos[0], rideHeight(s.car.params) + 0.02, activity.tee.pos[2]],
            activity.tee.yaw
          );
        if (activity?.sunk) {
          audio.coin();
          callout('IN THE CUP');
        }
        if (activity?.finished) {
          telemetry.activityEnd({
            game: openWorld.activity()?.kind ?? (activity.score != null ? 'bowling' : 'golf'),
            score: activity.score,
            total: activity.total
          });
          audio.finish();
          callout(
            activity.score != null
              ? `🎳 Game over · ${activity.score}`
              : `CAR GOLF · ${activity.total} HITS · BEST ${openWorld.progress.golfBest}`
          );
        }
      }
      fireQueued = false;
      hopQueued = false;
      acc -= 1 / 120;
      lastThrottle = throttleIn || pad.throttle;
      soundEvents(readout(s), s.car);
    }
  }
  if (s.flight.mode !== lastFlight) {
    telemetry.flight({
      mode: s.flight.mode ?? 'land',
      from: lastFlight ?? 'ground',
      assist: mode === 'kid',
      at: s.car.pos
    });
    lastFlight = s.flight.mode;
  }
  document.body.classList.toggle('race-mode', !race.roam && started && !paused);
  document.body.classList.toggle('driving', started && !paused);
  tennisFrame();
  const r = robot
      ? {
          ...readout(s),
          x: robot.pos[0],
          y: robot.pos[1] + 0.12,
          z: robot.pos[2],
          yaw: robot.yaw,
          speed: Math.hypot(robot.vel[0], robot.vel[2])
        }
      : readout(s),
    c = s.car,
    p = BUGGY;
  if (robot && robotBody) poseRobotBody(robotBody, robot);
  {
    const past = openWorld?.era?.() === 'past';
    polish?.setOld?.(past ? 0.35 : 0); // The ridden dinosaur: the rigged one (open-world/characters.js) once loaded, the parts-built one until then.
    // One rig per kind (open-world/herd.mjs DINO_KINDS), loaded the first time that kind is ridden;
    // until it's ready the last rig (or the parts-built dinosaur) stands in.
    if (past) {
      const active = herd().herd[herd().mount],
        model = DINO_KINDS[active?.kind ?? 'rex']?.model ?? 'dino';
      if (!rigs.has(model) && !rigsLoading.has(model)) {
        rigsLoading.add(model);
        prepareCharacters([model])
          .then(ok => {
            if (!ok) return;
            const d = rideRiggedDino(spawnCharacter(scene, model));
            d.root.visible = false;
            rigs.set(model, d);
          })
          .catch(() => {});
      }
      const want = rigs.get(model);
      if (want && want !== riggedDino) {
        if (riggedDino) riggedDino.root.visible = false;
        riggedDino = want;
      }
    }
    if (past && form === 'car') {
      car.visible = false;
      if (!typing()) nameDino();
      if (riggedDino) {
        const a = herd().herd[herd().mount];
        if (a && riggedDino.tinted !== a && DINO_KINDS[a.kind]?.tint && riggedDino.kind === 'dino')
          riggedDino.tinted = tintDino(riggedDino, DINO_COLOURS[a.colour]) && a;
      }
      if (riggedDino) {
        if (toyDino) toyDino.visible = false;
        riggedDino.root.visible = true;
        poseRiggedDino(riggedDino, s.car, rideHeight(s.car.params), dt, s.flight.mode);
      } else {
        if (!toyDino) {
          toyDino = makeToyDino();
          scene.add(toyDino);
        }
        toyDino.visible = true;
        poseToyDino(toyDino, s.car, rideHeight(s.car.params), dt);
      }
    } else if (toyDino?.visible || riggedDino?.root.visible) {
      if (toyDino) toyDino.visible = false;
      if (riggedDino) riggedDino.root.visible = false;
      if (form === 'car') car.visible = true;
    }
    if (past && robot) {
      if (!toyCowboy) {
        toyCowboy = makeToyCowboy();
        scene.add(toyCowboy);
      }
      if (robotBody) robotBody.visible = false;
      toyCowboy.visible = true;
      poseToyCowboy(toyCowboy, robot);
    } else if (toyCowboy?.visible) {
      toyCowboy.visible = false;
      if (robot && robotBody) robotBody.visible = true;
    }
  }
  if (form === 'board' && boardRider) {
    poseBoardRider(boardRider, s.car, s.car.steer / 0.42, boardPose(boardTricks));
    car.visible = false;
  }
  if (marshalSession !== s) {
    marshalSession = s;
    marshalRecovery = s.recoveries;
    marshalLap = s.lap;
    marshalUntil = marshalLapUntil = 0;
  }
  if (s.recoveries !== marshalRecovery) {
    marshalRecovery = s.recoveries;
    marshalUntil = now + 1600;
  }
  if (s.lap !== marshalLap) {
    marshalLap = s.lap;
    marshalLapUntil = now + 2400;
  }
  const rescue = now < marshalUntil,
    showLap = now < marshalLapUntil;
  marshal.root.visible =
    started && (countdown > -0.6 || rescue || showLap || retreatActive(race) || s.finished);
  const mx = rescue ? 0 : Math.sin(r.yaw) * 2.4 + Math.cos(r.yaw) * 0.8,
    mz = rescue ? 0 : -Math.cos(r.yaw) * 2.4 + Math.sin(r.yaw) * 0.8;
  marshal.root.position.set(r.x + mx, r.y + (rescue ? 1.3 : 0.64), r.z + mz);
  marshal.root.rotation.y = Math.PI - r.yaw;
  marshal.update({
    time: now / 1000,
    car: c,
    countdown: countdown > 0 ? Math.ceil(countdown) : countdown > -0.6 ? 0 : -1,
    recovering: rescue,
    retreat: retreatActive(race),
    finish: s.finished,
    lap: showLap ? s.lap : undefined,
    laps: s.laps,
    alienUnlocked:
      !!openWorld?.progress.discovered.includes('lab') && canEnter(openWorld.progress, locationById('lab'))
  });
  nearDetail?.update(s.car.pos);
  if (openWorld) {
    if (!paused) {
      openWorld.traffic(race);
      if ((s.assist.balanceTime ?? 0) > 0.6 && !trickCalled) {
        trickCalled = true;
        callout(s.assist.balance > 0 ? 'WHEELIE!' : 'STOPPIE!');
      }
      if (!s.assist.balance) trickCalled = false;
      if (race.roam && !race.furball && race.rivals.length) {
        const e = stepPlaymates(playmates, {
          player: s,
          rivals: race.rivals,
          mode,
          time: now / 1000,
          dt,
          ready: !skate && !s.flight.mode && s.car.speed > 1.5 && !openWorld.target(),
          world: {places: openWorld.places(), route: (pos, place) => openWorld.routeTo(pos, place)}
        });
        if (e?.start) {
          const {rival, dest, spawn} = e.start;
          placeCar(rival.session.car, [spawn.pos[0], spawn.pos[1] + 0.05, spawn.pos[2]], spawn.yaw);
          openWorld.navigate(dest.id, s.car.pos);
          audio.radio();
          callout(`🏁 ${rival.callsign}: race you to ${dest.short}!`);
          telemetry.playmate({dest: dest.id, result: 'start'});
        }
        if (e?.finish) {
          const {winner, dest, rival} = e.finish;
          rival.follow = {path: null};
          if (winner === 'player') {
            audio.finish();
            callout(`🏆 You beat ${rival.callsign} to ${dest.short}!`);
          } else {
            openWorld.navigate(null, s.car.pos);
            callout(`${rival.callsign} got there first!`);
          }
          telemetry.playmate({dest: dest.id, result: winner});
        }
        if (e?.timeout) {
          const t = e.timeout;
          t.rival.follow = null;
          openWorld.navigate(null, s.car.pos);
          if (t.ignored) callout(`${t.rival.callsign}: maybe next time! 👋`);
          telemetry.playmate({dest: t.dest.id, result: t.ignored ? 'ignored' : 'timeout', closed: t.closed});
        }
      }
      bowStep(dt);
      outlawStep(dt);
      digStep(dt, now);
      wildStep(dt, openWorld?.era?.() === 'past');
      campStep(dt, openWorld?.era?.() === 'past');
      dexStep(dt, openWorld?.era?.() === 'past');
      edgeHint(now);
      legendStart();
      if (adventure) {
        const here = robot ? robot.pos : s.car.pos;
        {
          const lh = !paused && adventure.ladder(here);
          if (lh && !ladderHint) {
            ladderHint = true;
            callout(lh.down ? '🕳️ A manhole! [E] climb down' : '🪜 A ladder! [E] climb up', 2600);
          } else if (!lh) ladderHint = false;
        }
        const attackNow = !!robot && punchQueued,
          useNow = !!robot && useQueued;
        punchQueued = useQueued = false;
        for (const ev of adventure.step(
          here,
          dt,
          robot
            ? {
                robot,
                mode,
                input: {attack: attackNow, use: useNow, lock: keys.has('ShiftLeft') || keys.has('ShiftRight') || padAim}
              }
            : null,
          {mode, air: robot ? !robot.grounded : s.car.contacts === 0 && !s.skateRide?.active}
        )) {
          ratEvent(ev);
          if (ev.washed) {
            audio.splash();
            callout(
              ev.bowl
                ? '🌊 Splash! Stay where it is dry'
                : '🌊 Whoosh! The slime took you back · ride the pipes across'
            );
            if (robot) {
              robot.pos = [...ev.washed];
              robot.vel = [0, 0, 0];
            } else {
              placeCar(
                s.car,
                [ev.washed[0], ev.washed[1] + rideHeight(s.car.params) + 0.02, ev.washed[2]],
                Math.PI / 2
              );
              acc = 0;
            }
          } else if (ev.popped) {
            audio.impact(5);
          } else if (ev.hurt) {
            audio.impact(3);
          } else if (ev.knockout) {
            callout('💫 Bonk! Back to the door');
          }
          if (ev.item) {
            telemetry.discover(ev.item, 'item');
            audio.finish();
            callout(`${ev.icon} Got ${ev.name}! ${ev.does}`, 5000);
          } else if (ev.cell) {
            audio.coin();
            callout(ev.battery ? '🔋 A new battery!' : `🔋 Battery cell ${ev.cell}/${ev.of}`);
          } else if (ev.dug) {
            audio.impact(6);
            callout('⛏️ The rock crumbles!');
          } else if (ev.locked === 'dig') {
            callout('🪨 Need a strong digger');
          } else if (ev.spiritMark) {
            audio.radio();
            intro.play(camera.position, [robot.pos[0], robot.pos[1], robot.pos[2]], () => {
              robot.pos = [...mineWorldPos([0, 0.3, 10.5])];
              robot.vel = [0, 0, 0];
              robot.yaw = Math.PI;
              adventure.unlockLegend();
              $('menu-legend').hidden = false;
              callout('🏔️ Spirit Mountain game!', 5000);
            });
          } else if (ev.rescued) {
            audio.finish();
            callout('✨ Nice alien saved!');
          } else if (ev.boss === 'wake') {
            audio.radio();
            callout('⚠️ Digger woke up! Watch');
          } else if (ev.tell === 'sweep') {
            callout('↔️ Here comes the arm! [space] jump');
          } else if (ev.tell === 'slam') {
            callout('🎯 Move off the red ring!');
          } else if (ev.slam) {
            audio.impact(6);
            callout('💥 Stuck! [Q] punch box');
          } else if (ev.hit === 'boss') {
            audio.impact(5);
          } else if (ev.freed) {
            audio.finish();
            callout('💙 Digger free! Door open');
          }
          if (ev.got === 'small') {
            audio.coin();
            callout('🗝️ SMALL KEY');
          } else if (ev.got === 'big') {
            audio.finish();
            callout('🔑 BIG KEY!');
          } else if (ev.plate) {
            audio.gate();
            callout('A gate rumbles open somewhere…');
          } else if (ev.opened) {
            audio.gate();
          } else if (ev.locked === 'locked') {
            callout('🔒 Locked · find a key');
          } else if (ev.locked === 'boss') {
            callout('🚧 The digger is in the way');
          } else if (ev.locked === 'big key') {
            callout('🔒 This lock needs the BIG KEY');
          } else if (ev.locked === 'combo') {
            callout(`🛹 Do ${mode === 'kid' ? 2 : 4} tricks here`, 3200);
          } else if (ev.locked) {
            callout('🔒 ' + ev.locked);
          }
        }
        if (robotBody)
          robotBody.userData.lamp ??= (() => {
            const l = new T.PointLight('#bfe8ff', 2.2, 4.5, 1.6);
            l.position.set(0, 0.27, -0.06);
            robotBody.add(l);
            return l;
          })();
        if (robotBody?.userData.lamp)
          robotBody.userData.lamp.visible = !!robot && adventure.inside(robot.pos);
      }
      trickOrTreatStep(robot ? robot.pos : c.pos, dt, now);
      golfStep(dt);
      roundupStep(dt);
      cartStep();
      retreatStep(dt);
      if (!paused) for (const e of openWorld.boosterStep(dt, c.pos)) boosterEvent(e);
      schoolFrame();
      for (const f of openWorld.zooStep(robot ? robot.pos : c.pos, dt)) {
        audio.radio();
        callout(f.zoo === 'sign' ? `🐾 ${f.text}` : `✈️ ${f.name} · ${f.text}`, 5500);
      }
      const smashers = [[1, c]];
      if (splitOn && race.rivals[0]?.session?.car) smashers.push([2, race.rivals[0].session.car]);
      const splats = [];
      for (const [player, car] of smashers) {
        const hits = openWorld.seasonStep(car.pos, car.vel, now / 1000);
        if (!hits.length) continue;
        splats.push(...hits);
        collectHunt(hunt, player, hits.length);
      }
      if (splats.length) {
        paintHunt();
        pumpkinsSmashed += splats.length;
        audio.splat();
        const pr = openWorld.progress,
          before = pr.pumpkins ?? 0;
        pumpkinRecord ??= pr.pumpkinBest;
        const record = pumpkinRecord;
        pr.pumpkins = before + splats.length;
        if (pumpkinsSmashed > record) pr.pumpkinBest = pumpkinsSmashed;
        openWorld.save();
        const earned = pumpkinRewards(before, pr.pumpkins);
        if (earned.length) {
          audio.finish();
          callout(
            earned.some(l => l.id === 'sixseven')
              ? '6️⃣7️⃣ SIX SEVEN!! 67 pumpkins · new livery in the Garage: SIX SEVEN'
              : `🎃 ${earned[0].pumpkins} PUMPKINS! New in the Garage: the ${earned[0].name.toUpperCase()}`,
            5000
          );
        } else if (pumpkinsSmashed > record && pumpkinsSmashed - splats.length <= record) {
          audio.finish();
          callout(`🏆 NEW RECORD! ${pumpkinsSmashed} pumpkins`, 4000);
        } else
          callout(
            pumpkinsSmashed === 67
              ? '6️⃣7️⃣ SIX SEVEN!'
              : `SPLAT! 🎃 ${pumpkinsSmashed} · record ${Math.max(record, pumpkinsSmashed)}`
          );
        telemetry.pumpkin(pumpkinsSmashed);
      }
      const collected = openWorld.collect(s.seen);
      if (collected.unlocked) {
        callout('NEW PLACE: DREAMLAND');
        openWorld.navigate('lab', c.pos);
      } else if (collected.found.length) {
        callout(collected.found.at(-1).name + ' badge found');
        audio.coin();
        for (const f of collected.found) telemetry.discover(f.id, 'specimen');
      }
    }
    openWorld.update(
      now / 1000,
      c.pos,
      camera,
      p => {
        telemetry.discover(p.id, 'place');
        callout(p.short + ' discovered');
      },
      robot?.pos ?? c.pos
    );
    for (const jet of openWorld.skySounds()) audio.jet(jet);
    if (race.roam && !paused && !gateTravelling && openWorld.timeGate) {
      gateTravelling = true;
      openWorld
        .timeGate(robot ? robot.pos : c.pos, now / 1000)
        .then(timeTrip)
        .finally(() => {
          gateTravelling = false;
        });
    }
    if (race.roam && !paused && !portalTravelling) {
      portalTravelling = true;
      openWorld
        .portal(c.pos, now / 1000)
        .then(trip => {
          if (!trip) return;
          placeCar(s.car, [trip.position[0], rideHeight(s.car.params) + 0.06, trip.position[2]], Math.PI);
          acc = 0;
          document.body.classList.remove('portal-flash');
          void document.body.offsetWidth;
          document.body.classList.add('portal-flash');
          callout(trip.to === 'alien' ? 'BEYOND THE PORTAL' : 'RC ODYSSEY');
        })
        .finally(() => {
          portalTravelling = false;
        });
    }
    const waiting = !openWorld.stream.ready(c.pos);
    $('stream-status').hidden = !waiting;
    if (waiting) acc = 0;
  }
  ui.update(now);
  bowlingHud();
  contactSun.position.set(
    r.x - 4,
    r.y + (artReview && Math.abs(r.x - 38) < 9 && Math.abs(r.z + 8) < 11 ? 4 : 8),
    r.z - 5
  );
  contactSun.target.position.set(r.x, r.y, r.z);
  {
    const g = s.skateRide?.active;
    audio.grinding(!!g && !paused, g?.speed ?? 0);
    if (g && g.id !== lastGrind) audio.landing(2.5);
    lastGrind = g?.id ?? null;
  }
  {
    const p1body =
        toyDino?.visible || riggedDino?.root.visible
          ? 'dino'
          : robot
            ? 'robot'
            : form === 'board'
              ? 'board'
              : 'car',
      showSplit = splitOn && !split?.solo,
      players = [
        {
          speed: r.speed,
          throttle: lastThrottle,
          slip: c.wheels.filter(w => w.slip).length / 4,
          body: p1body,
          seat: 0,
          split: showSplit
        }
      ];
    if (showSplit && race.rivals[0]) {
      const c2 = race.rivals[0].session.car;
      players.push({
        speed: Math.hypot(c2.vel?.[0] ?? 0, c2.vel?.[2] ?? 0),
        throttle: pad2?.throttle ?? 0,
        slip: (c2.wheels?.filter(w => w.slip).length ?? 0) / 4,
        body: split?.p2Form === 'robot' ? 'robot' : split?.p2Form === 'board' ? 'board' : 'car',
        seat: 1,
        split: true
      });
    }
    audio.update({
      speed: r.speed,
      throttle: lastThrottle,
      slip: players[0].slip,
      surface: c.wheels.find(w => w.surface)?.surface,
      paused: paused || countdown > 0,
      body: p1body,
      players
    });
  }
  dinoSounds(dt);
  footSounds();
  if (openWorld?.chickens && !paused)
    for (const e of openWorld.chickens({
      pos: robot ? robot.pos : s.car.pos,
      riding: !!(toyDino?.visible || riggedDino?.root.visible),
      dt
    }))
      if (e.scatter) audio.creature('hen', 'cluck');
  if (openWorld?.paiuteCamp && !paused)
    openWorld.paiuteCamp({
      pos: robot ? robot.pos : s.car.pos,
      dt
    });
  if (track) followSun(sun, car.position);
  if (worldSky) {
    if (!paused) worldElapsed += dt;
    const light = worldSky.update(
      worldElapsed,
      c.pos,
      c.pos[0] > 9000 || (!!openWorld.selected.night && !openWorld.locked)
    );
    openWorld.lighting(light.day, c.pos);
  }
  if (!paused) {
    for (const cc of [c, ...race.rivals.map(rv => rv.session.car)]) fx.carFeedback(cc, dt);
    for (const e of race.events.splice(0))
      if (e.type === 'splash') {
        fx.splash(e.car?.pos ?? e.pos);
        audio.splash();
      } else if (e.type === 'boom') {
        fx.boom(e.car?.pos ?? e.pos);
        audio.impact(5);
      } else if (e.type === 'winchester' && e.car === s.car) {
        callout('📻 Out of shots');
        audio.radio();
      } else if (e.type === 'downed') {
        fx.boom(e.car.pos);
        let msg =
          e.by === s.car
            ? '📻 Got one!'
            : e.left === 2 && !race.furball.out.has(s.car)
              ? '📻 Last one flying!'
              : null;
        if (e.by === s.car) {
          const was = artTier(aceKills);
          aceKills++;
          try {
            localStorage.setItem('guns-only.rc.kills', aceKills);
          } catch {}
          if (artTier(aceKills) > was) msg += ` · ${NOSE_ART[was].name}!`;
        }
        paintKillMarks();
        if (msg) {
          callout(msg);
          audio.radio();
        }
      } else if (e.type === 'furball-over') furballOver(e.winner);
  }
  fx.update(dt);
  labFrame(dt);
  poseCar(car, wheels, c);
  if (openWorld) deliveryFrame(dt, now);
  syncRivals();
  race.rivals.forEach((rv, i) => {
    const p2OwnBody = splitOn && i === 0 && (split?.p2Form === 'board' || split?.p2Form === 'robot');
    if (!p2OwnBody) poseCar(rivalVis[i].group, rivalVis[i].wheels, rv.session.car);
    rivalLod(rivalVis[i], rv.session.car, splitOn && i === 0 ? rv.session.car : c);
    if (p2OwnBody) rivalVis[i].group.visible = false;
  });
  if (splitOn && split?.p2Form === 'board' && p2BoardRider && race.rivals[0]) {
    const rc = race.rivals[0].session.car;
    p2BoardRider.visible = true;
    poseBoardRider(p2BoardRider, rc, rc.steer / 0.42, null);
  } else if (p2BoardRider?.visible) p2BoardRider.visible = false;
  if (splitOn && split?.p2Form === 'robot' && p2Robot && p2RobotBody) {
    p2RobotBody.visible = true;
    poseRobotBody(p2RobotBody, p2Robot);
    if (p2Robot.punch > 0) p2RobotBody.userData.arms[1].rotation.x = -1.4;
  } else if (p2RobotBody?.visible) p2RobotBody.visible = false;
  // Low chase camera behind the heading; pulled in front of any wall between it and the car.
  if (cameraCar)
    camera.position.add(new T.Vector3(r.x - cameraCar[0], r.y - cameraCar[1], r.z - cameraCar[2]));
  cameraCar = [r.x, r.y, r.z];
  // A vert air points the nose at the sky, so its heading means nothing: hold the heading the car
  // launched on, rise with it and look at it through the turn, then ease back once it lands.
  const vertArc = s.assist.quarter?.arc?.vert ? s.assist.quarter.arc : null,
    bossAt = robot && adventure?.bossFrame(robot.pos),
    wantYaw = vertArc
      ? vertArc.yaw + Math.PI
      : bossAt
        ? Math.atan2(bossAt[0] - r.x, -(bossAt[2] - r.z))
        : r.yaw;
  if (camHeading === null || (!vertArc && !camEasing)) camHeading = wantYaw;
  else {
    const d = Math.atan2(Math.sin(wantYaw - camHeading), Math.cos(wantYaw - camHeading));
    camHeading += d * Math.min(1, dt * (vertArc ? 10 : 4));
    camEasing = !!vertArc || Math.abs(d) > 0.04;
  }
  // Looking around: the right stick orbits (stick up looks up). On foot it stays where you
  // leave it until R3. Everywhere else it springs back about a second after you let go.
  // Look mode's arrows and a mouse drag do the same swing.
  {
    const held = k => (lookKeys.has(k) ? 1 : 0),
      stick = !paused && !ui.panel() && (Math.abs(pad.lookX) > 0 || Math.abs(pad.lookY) > 0),
      foot = !!robot;
    if (pad.recentre && !paused) {
      lookYaw = 0;
      lookPitch = 0;
      lookIdle = 0;
    } else if (stick) {
      lookYaw += pad.lookX * dt * 1.7;
      lookPitch = Math.max(-0.35, Math.min(1.05, lookPitch - pad.lookY * dt * 1.15));
      lookIdle = foot ? 1e9 : 1;
    }
    if (lookMode) {
      lookYaw += (held('ArrowRight') - held('ArrowLeft')) * dt * 2.2;
      lookPitch = Math.max(-0.3, Math.min(1.1, lookPitch + (held('ArrowUp') - held('ArrowDown')) * dt * 1.3));
    } else if (!foot && !stick) {
      if (lookIdle > 10) lookIdle = 1;
      if ((lookIdle -= dt) <= 0) {
        lookYaw *= Math.exp(-dt * 2.5);
        lookPitch *= Math.exp(-dt * 2.5);
      }
    }
  }
  const camYaw = camHeading + lookYaw;
  // The boss fight pulls back and up so the robot and the whole excavator share the frame.
  // Riding a dinosaur in the dark world (the past) puts the toy up high: the camera pulls back with it.
  const jumpCamera =
      s.flight.mode === 'chute' && openWorld?.skyDive().active ? skyDiveCamera(c.pos, camYaw) : null,
    mount = riggedDino?.root.visible ? 2 : toyDino?.visible ? 2.6 : 1,
    back = (bossAt ? 2.6 : (1.36 + Math.min(0.24, r.speed * 0.015)) * mount) * (padAim ? 0.62 : 1),
    eye = [r.x, r.y + 0.12 * mount, r.z];
  desired.set(
    r.x - Math.sin(camYaw) * back * Math.cos(lookPitch),
    r.y + (bossAt ? 0.95 : mount > 1 ? 0.8 * mount : 0.55) + Math.sin(lookPitch) * back,
    r.z + Math.cos(camYaw) * back * Math.cos(lookPitch)
  );
  if (jumpCamera) desired.fromArray(jumpCamera.eye);
  const ray = [desired.x - eye[0], desired.y - eye[1], desired.z - eye[2]],
    dist = Math.hypot(...ray),
    hit = course.world.raycast(
      eye,
      ray.map(v => v / dist),
      dist
    );
  if (hit) {
    const k = Math.max(0.15, hit.dist - 0.12) / dist;
    desired.set(eye[0] + ray[0] * k, eye[1] + ray[1] * k, eye[2] + ray[2] * k);
  }
  camera.fov += ((bossAt ? 70 : 60 + Math.min(5, r.speed * 0.3)) - camera.fov) * Math.min(1, dt * 3);
  camera.updateProjectionMatrix();
  camera.position.lerp(desired, cameraGlide(openingHeld, dt, 7));
  // Distant districts parse on the main thread. Wait until the opening glide is over,
  // then start them from a timer so the parse is not inside this frame.
  if (restQueued && !openingHeld && performance.now() - openingReleasedAt > 2500 && camera.position.distanceTo(desired) < 0.5) {
    restQueued = false;
    setTimeout(() => openWorld?.loadBackground?.(), 0);
  }
  // Sweep the smoothed position too: damping must not carry the camera through a wall.
  const actualRay = [camera.position.x - eye[0], camera.position.y - eye[1], camera.position.z - eye[2]],
    actualDistance = Math.hypot(...actualRay);
  if (actualDistance > 0.01) {
    const obstruction = course.world.raycast(
      eye,
      actualRay.map(v => v / actualDistance),
      actualDistance
    );
    if (obstruction) {
      const k = Math.max(0.08, obstruction.dist - 0.08) / actualDistance;
      camera.position.set(eye[0] + actualRay[0] * k, eye[1] + actualRay[1] * k, eye[2] + actualRay[2] * k);
    }
  }
  const portrait = camera.aspect < 0.8,
    portraitAim = -0.3 - Math.max(0, 740 - innerHeight) * 0.003;
  if (jumpCamera) target.fromArray(jumpCamera.look);
  else if (vertArc) target.set(r.x, r.y + 0.1, r.z);
  else
    target.set(
      r.x + Math.sin(camYaw) * 1.05,
      r.y + (portrait ? portraitAim : mount > 1 ? 0.35 * mount : 0.18),
      r.z - Math.cos(camYaw) * 1.05
    );
  // Flying, the camera rides behind the car along its own nose and rolls with it, like a jet's
  // chase view, so the HUD horizon matches the real one. On the ground the camera stays level.
  if (s.flight.mode === 'fly') {
    const q = new T.Quaternion(c.q[0], c.q[1], c.q[2], c.q[3]),
      fw = new T.Vector3(0, 0, -1).applyQuaternion(q),
      cu = new T.Vector3(0, 1, 0).applyQuaternion(q);
    if (Math.abs(lookYaw) + Math.abs(lookPitch) > 1e-3) {
      fw.applyAxisAngle(cu, -lookYaw);
      fw.applyAxisAngle(new T.Vector3().crossVectors(fw, cu).normalize(), -lookPitch);
    }
    desired.set(r.x, r.y, r.z).addScaledVector(fw, -2.3).addScaledVector(cu, 0.55);
    camera.position.lerp(desired, cameraGlide(openingHeld, dt, 9));
    camera.up.lerp(cu, 1 - Math.exp(-dt * 6)).normalize();
    target.set(r.x, r.y, r.z).addScaledVector(fw, 3);
  } else camera.up.lerp(new T.Vector3(0, 1, 0), 1 - Math.exp(-dt * 6)).normalize();
  // A steady court view from behind your baseline, low like a TV end view: both players and the ball
  // read at toy size (an overhead view from 18 m up shrank the 1 m robots and the ball to dots).
  if (tennisEligible() && openWorld.tennis()?.active) {
    const [x, z] = TENNIS.center,
      y = golfGround(x, z);
    const zoom = Math.max(1, 0.55 / camera.aspect);
    camera.position.set(x, y + 5 * zoom, z + TENNIS.halfLength + 5 * zoom);
    camera.up.set(0, 1, 0);
    target.set(x, y + 0.4, z - 3);
  }
  camera.lookAt(target);
  if (splitOn) {
    const rs2 = race.rivals[0].session,
      walking = split?.p2Form === 'robot' && p2Robot,
      r2 = walking
        ? {
            x: p2Robot.pos[0],
            y: p2Robot.pos[1] + 0.12,
            z: p2Robot.pos[2],
            yaw: p2Robot.yaw,
            speed: Math.hypot(p2Robot.vel[0], p2Robot.vel[2])
          }
        : readout(rs2),
      d = split.heading == null ? 0 : Math.atan2(Math.sin(r2.yaw - split.heading), Math.cos(r2.yaw - split.heading));
    split.heading = split.heading == null ? r2.yaw : split.heading + d * Math.min(1, dt * 4);
    if (pad2 && !paused && !ui.panel()) {
      const looking = Math.abs(pad2.lookX) > 0 || Math.abs(pad2.lookY) > 0,
        foot2 = split.p2Form === 'robot';
      if (pad2.recentre) split.lookYaw = split.lookPitch = split.lookIdle = 0;
      else if (looking) {
        split.lookYaw = (split.lookYaw || 0) + pad2.lookX * dt * 1.7;
        split.lookPitch = Math.max(-0.35, Math.min(1.05, (split.lookPitch || 0) - pad2.lookY * dt * 1.15));
        split.lookIdle = foot2 ? 1e9 : 1;
      } else if (!foot2) {
        if ((split.lookIdle ?? 0) > 10) split.lookIdle = 1;
        split.lookIdle = (split.lookIdle || 0) - dt;
        if (split.lookIdle <= 0) {
          split.lookYaw = (split.lookYaw || 0) * Math.exp(-dt * 2.5);
          split.lookPitch = (split.lookPitch || 0) * Math.exp(-dt * 2.5);
        }
      }
    }
    const hy = split.heading + (split.lookYaw || 0),
      hp = split.lookPitch || 0,
      back = (1.36 + Math.min(0.24, r2.speed * 0.015)) * (walking && pad2?.aim ? 0.62 : 1),
      eye2 = [r2.x, r2.y + 0.12, r2.z];
    desired2.set(
      r2.x - Math.sin(hy) * back * Math.cos(hp),
      r2.y + 0.55 + Math.sin(hp) * back,
      r2.z + Math.cos(hy) * back * Math.cos(hp)
    );
    const ray2 = [desired2.x - eye2[0], desired2.y - eye2[1], desired2.z - eye2[2]],
      dist2 = Math.hypot(...ray2),
      hit2 = dist2 > 0.01 && course.world.raycast(eye2, ray2.map(v => v / dist2), dist2);
    if (hit2) {
      const k = Math.max(0.15, hit2.dist - 0.12) / dist2;
      desired2.set(eye2[0] + ray2[0] * k, eye2[1] + ray2[1] * k, eye2[2] + ray2[2] * k);
    }
    // Carry the camera with the car first (as player 1's does), then smooth only the swing.
    if (split.car) camera2.position.add(new T.Vector3(r2.x - split.car[0], r2.y - split.car[1], r2.z - split.car[2]));
    split.car = [r2.x, r2.y, r2.z];
    if (camera2.position.distanceTo(desired2) > 30) camera2.position.copy(desired2);
    else camera2.position.lerp(desired2, 1 - Math.exp(-dt * 7));
    camera2.fov = 60 + Math.min(5, r2.speed * 0.3);
    target2.set(r2.x + Math.sin(hy) * 1.05, r2.y + 0.18, r2.z - Math.cos(hy) * 1.05);
    if (!walking && rs2.flight.mode === 'fly') {
      const c2 = rs2.car,
        q = new T.Quaternion(c2.q[0], c2.q[1], c2.q[2], c2.q[3]),
        fw = new T.Vector3(0, 0, -1).applyQuaternion(q),
        cu = new T.Vector3(0, 1, 0).applyQuaternion(q);
      if (Math.abs(split.lookYaw || 0) + Math.abs(split.lookPitch || 0) > 1e-3) {
        fw.applyAxisAngle(cu, -(split.lookYaw || 0));
        fw.applyAxisAngle(new T.Vector3().crossVectors(fw, cu).normalize(), -(split.lookPitch || 0));
      }
      desired2.set(r2.x, r2.y, r2.z).addScaledVector(fw, -2.3).addScaledVector(cu, 0.55);
      camera2.position.lerp(desired2, 1 - Math.exp(-dt * 9));
      camera2.up.lerp(cu, 1 - Math.exp(-dt * 6)).normalize();
      target2.set(r2.x, r2.y, r2.z).addScaledVector(fw, 3);
    } else camera2.up.lerp(new T.Vector3(0, 1, 0), 1 - Math.exp(-dt * 6)).normalize();
    camera2.lookAt(target2);
    p2Hud.textContent = `P2 · ${Math.round((!walking && rs2.flight.mode ? rs2.flight.speed : r2.speed) * 3.6)} km/h`;
  }
  p2Hud.hidden = splitLine.hidden = !splitOn;
  document.body.classList.toggle('split', splitOn && !split?.solo);
  splitLine.hidden ||= !!split?.solo;
  digCamera(now);
  if (intro.active) intro.update(dt, camera);
  if (labBusy(labRide)) labView?.aim(camera, camera2, labRide, {split: !!splitOn, lift: rideHeight(s.car.params)});
  underwater();
  if (ui.panel() === 'garage') {
    const a = now * 0.00022,
      d = portrait ? 1.7 : 1.05;
    camera.position.set(r.x + Math.sin(a) * d, r.y + (portrait ? 0.75 : 0.48), r.z + Math.cos(a) * d);
    camera.fov = 48;
    if (portrait) camera.clearViewOffset();
    else
      camera.setViewOffset(
        innerWidth,
        innerHeight,
        (innerWidth > 900 ? 330 : 315) / 2,
        0,
        innerWidth,
        innerHeight
      );
    camera.updateProjectionMatrix();
    camera.lookAt(r.x, r.y + (portrait ? portraitAim : 0.08), r.z);
  } else if (camera.view?.enabled) camera.clearViewOffset();
  gates.forEach((g, i) => {
    const next = i === (s.gate === cps.length - 1 ? 0 : s.gate);
    g.userData.arch.material = next ? archLit : archMat;
    g.userData.label.visible = false;
    g.userData.label.quaternion.copy(camera.quaternion);
  });
  aliens.forEach((a, i) => {
    a.position.y = 0.4 + Math.sin(now * 0.0015 + i) * 0.07;
  });
  $('speed').textContent = Math.round(r.speed * 3.6);
  {
    const f = adventure?.fighter?.();
    const hud = $('item');
    if (robot && f && adventure.inside(robot.pos)) {
      hud.hidden = false;
      hud.textContent =
        '🔋'.repeat(Math.max(0, f.batteries)) +
        '▫️'.repeat(Math.max(0, f.max - f.batteries)) +
        (adventure.state.keys ? `  🗝️×${adventure.state.keys}` : '') +
        (adventure.state.bigKey ? '  🔑' : '') +
        (adventure.inventory.items.length
          ? '  ' + adventure.inventory.items.map(id => ITEMS[id].icon).join('')
          : '');
      hud.title = adventure.inventory.items.map(id => `${ITEMS[id].name}: ${ITEMS[id].does}`).join('\n');
    }
  }
  $('clock').hidden = race.roam && !race.furball;
  $('clock').textContent = format(race.furball ? race.furball.left : s.time);
  drawLives(now, dt);
  drawPickups(now);
  drawFlightHud();
  retroFx(now);
  drawLine(now);
  drawRoam(now);
  drawCoins(now);
  $('gate').textContent = race.furball
    ? `FURBALL · 🎈${race.furball.out.has(s.car) ? 0 : race.furball.lives.get(s.car)} · ${race.rivals.filter(r => !race.furball.out.has(r.session.car)).length} bandits`
    : race.roam
      ? openWorld
        ? nearestLocation(s.car.pos).short
        : 'FREE DRIVE'
      : `${race.rivals.length ? `P${place()}/${race.rivals.length + 1} · ` : ''}${s.laps > 1 ? `LAP ${s.lap}/${s.laps}` : `${Math.min(s.gate + 1, cps.length)}/${cps.length}`}`;
  if (!$('banner').dataset.callout) $('banner').hidden = !retreatActive(race);
  $('secret').hidden = !course.secrets.length;
  $('secret').textContent = openWorld
    ? `◇ ${openWorld.progress.specimens.length}/${SPECIMENS.length} badges${expedition(openWorld.progress).complete ? ' ★' : ''}`
    : `◇ ${s.found}/${course.secrets.length}`;
  drawMap();
  if (splitOn && rivalVis[0] && (split?.p2Form === 'board' || split?.p2Form === 'robot'))
    rivalVis[0].group.visible = false;
  annexPresent();
  dreams.present(dt);
  const dreamScene = dreams.scene();
  ((prof.renderStart = performance.now()),
    renderer.info.reset(),
    dreamScene
      ? splitOn
        ? renderSplit(dreamScene)
        : renderer.render(dreamScene, camera)
      : splitOn
        ? renderSplit()
        : polish
          ? polish.render()
          : renderer.render(scene, camera),
    dreams.ripple(),
    (prof.calls += renderer.info.render.calls),
    (prof.tris += renderer.info.render.triangles),
    prof.add(performance.now() - prof.renderStart, prof.renderStart - (prof.simStart ?? prof.renderStart)));
  if (skate || street) skateHud.update(skate || street, now);
  const partner = team.on && !race.roam && !race.furball ? race.rivals[0]?.session : null;
  // Team place is the better finish, so the card waits until player 2 is in too.
  if (s.finished && !reported && !(partner && !partner.finished)) {
    reported = true;
    openWorld?.finish(s.time, s.lapTimes);
    telemetry.raceFinish({
      place: place(),
      time: s.time,
      gap: null,
      recoveries: s.recoveries,
      altTaken: null,
      turbos: s.assist.turbos ?? 0
    });
    if (!best || s.time < best) {
      best = s.time;
      try {
        localStorage.setItem(bestKey, best);
      } catch {}
    }
    const result = $('result');
    result.hidden = false;
    const at = place(),
      ranked = race.rivals.length,
      teamLine = partner?.finished ? teamCard(at, placeOf(race, partner)) : null;
    result.classList.toggle('team-card', !!teamLine);
    result.innerHTML = resultPanel({
      badge: teamLine ? null : ranked ? `${at}<sup>${ordinal(at).slice(String(at).length)}</sup>` : null,
      title: teamLine
        ? teamLine
        : openWorld?.selected.location === 'lab' && expedition(openWorld.progress).complete
          ? 'Dreamland done!'
          : ranked
            ? finishTitle(at)
            : 'Lap done!',
      order: teamLine || !ranked ? [] : finishOrder(),
      you: at,
      stats: [
        ['Time', format(s.time)],
        ['Best', format(best)],
        ['Badges', `${openWorld ? openWorld.progress.specimens.length : s.found}/${course.secrets.length}`],
        ...(course.coins?.length ? [['Coins', `${banked.size}/${course.coins.length}`]] : [])
      ],
      again: '🏁 Again'
    });
    bindResultPanel(result);
    pause(true);
    $('again').onclick = () => {
      telemetry.choice('again');
      s = (race = createRace(course, {mode, opponents: rivalCount, features: trackFeatures})).player;
      if (team.on && race.rivals[0])
        race.rivals[0].human = () => ({throttle: 0, steer: 0, brake: true, drift: false, fire: false});
      if (team.on && split) split.placed = true;
      reported = false;
      Object.assign(sfx, {gate: 0, coins: 0, held: false, air: 0, retreat: false, finished: false});
      startCountdown();
      result.hidden = true;
      pause(false);
    };
    $('explore').onclick = () => {
      telemetry.choice('drive');
      result.hidden = true;
      goRoam();
      pause(false);
    };
    $('to-menu').onclick = toMenu;
    if (cup) {
      const order = [s, ...race.rivals.map(r => r.session)]
        .sort((a, b) => placeOf(race, a) - placeOf(race, b))
        .map(x => (x === s ? 'YOU' : race.rivals.find(r => r.session === x).callsign));
      recordCupRace(cup, openWorld.selected.id, order);
      saveCup(cup, cupStorage);
      const scores = document.createElement('p');
      scores.textContent = cupStandings(cup)
        .map(r => `${r.rank}. ${r.id} ${r.points}`)
        .join(' · ');
      scores.className = 'result-cup';
      result.querySelector('.result-actions').before(scores);
      const next = nextCupEvent(cup);
      if (next) {
        const button = document.createElement('button');
        button.textContent = 'Next race';
        button.className = 'primary';
        button.onclick = () => (location.href = cupURL(next, cup.id));
        $('again').classList.remove('primary');
        result.querySelector('.result-actions').prepend(button);
      } else if (!teamLine) {
        result.querySelector('h1').textContent =
          CUP_COURSES[Number(cup.id)].cup + ' Cup · ' + cupStandings(cup).find(r => r.id === 'YOU').rank;
      }
    }
  }
  if (now - lastTelemetrySample >= 1000) {
    lastTelemetrySample = now;
    sampleTelemetry(now);
  }
  stuckHint();
  if (now - lastTelemetryFlush >= 15_000) {
    lastTelemetryFlush = now;
    telemetry.flush();
  }
  requestAnimationFrame(frame);
}
// Read-only diagnostics for QA. Simulation tests use the same public step function.
window.__gunsOnlyRC = {
  bow: () => ({
    arrows: bowState.arrows.length,
    stunned: bowTargets()
      .filter(t => t.alive && t.toy.stunned > 0)
      .map(t => t.id),
    loot: {batteries: dexState().batteries, parts: dexState().parts}
  }),
  form: () => form,
  qaEra: era => openWorld?.qaEra?.(era),
  roundup: () =>
    openWorld?.meadow?.()?.round && {
      penned: openWorld.meadow().round.penned,
      steers: openWorld.meadow().round.steers.map(s => s.pos.map(v => +v.toFixed(1)))
    },
  golf: () => ({
    hole: golfRound?.hole,
    strokes: golfRound?.strokes,
    rest: golfRestAt,
    ball: golfBall?.pos,
    wait: golfWait,
    robot: robot?.pos
  }),
  era: () => openWorld?.era?.() ?? 'present',
  toyDino: () => toyDino,
  flock: () =>
    openWorld?.flock?.()?.hens.map(h => ({state: h.state, x: +h.x.toFixed(1), z: +h.z.toFixed(1)})),
  sounds: () => ({
    heard: {...(audio.heard ?? {})},
    motor: +(audio.motorLow?.gain.gain.value ?? 0).toFixed(3)
  }),
  dex: () => openWorld && {seen: [...dexState().seen], gold: dexState().gold},
  herd: () =>
    herdState && {
      herd: herd().herd,
      mount: herd().mount,
      friends: herd().friends,
      wild: [...wildViews].map(([id, d]) => ({
        id,
        visible: d.root.visible,
        pos: d.root.position.toArray().map(v => +v.toFixed(1))
      }))
    },
  typing: () => typing(),
  farm: () => openWorld?.farm?.() ?? null,
  dig: () => ({digging: !!openWorld?.digging?.(), floor: openWorld?.digFloor?.()}),
  riggedDino: () => riggedDino && {visible: riggedDino.root.visible, clip: riggedDino.clip},
  outlaws: () =>
    openWorld
      ?.gang?.()
      .enemies.filter(e => e.alive)
      .map(e => [+e.pos[0].toFixed(1), +e.pos[2].toFixed(1)]) ?? null,
  boosterClock: t => {
    const b = openWorld?.booster?.();
    if (b && t != null) b.clock.t = t;
    return b?.clock.t ?? null;
  },
  treatHouses: () => openWorld?.treatHouses?.() ?? [],
  candy: () => candyRun,
  jetDecks: () => openWorld?.jetDecks() ?? null,
  ratKing: () =>
    adventure && {
      state: adventure.rat.state,
      hits: adventure.rat.hits,
      freed: adventure.rat.freed,
      at: [...adventure.rat.at],
      level: +adventure.rat.level.toFixed(3)
    },
  robotTo: (p, yaw) => {
    if (robot) {
      robot.pos = [...p];
      robot.vel = [0, 0, 0];
      if (yaw != null) robot.yaw = yaw;
    }
  },
  boss: () =>
    adventure && {state: adventure.boss.state, hits: adventure.boss.hits, freed: adventure.boss.freed},
  sewer: () =>
    adventure && {
      open: [...adventure.sewerState.open],
      keys: adventure.sewerState.keys,
      opened: [...adventure.sewerState.opened],
      items: [...adventure.inventory.items]
    },
  mine: () =>
    adventure && {
      keys: adventure.state.keys,
      bigKey: adventure.state.bigKey,
      open: [...adventure.state.open],
      opened: [...adventure.state.opened]
    },
  robot: () =>
    robot && {
      pos: robot.pos.map(v => +v.toFixed(3)),
      yaw: +robot.yaw.toFixed(3),
      grounded: robot.grounded,
      crouched: robot.crouched,
      climbing: !!robot.climb
    },
  transform: () => transform(),
  camera: () => {
    const d = camera.getWorldDirection(new T.Vector3());
    return {
      pos: camera.position.toArray(),
      yaw: Math.atan2(d.x, -d.z),
      pitch: Math.asin(d.y),
      fov: camera.fov
    };
  },
  scene: () => scene,
  collision: () => course.world,
  carObject: () => car,
  pumpkins: () => pumpkinsSmashed,
  playmate: (force = false) => {
    if (force && !playmates.active) playmates.next = 0;
    const a = playmates.active;
    return (
      a && {
        dest: a.dest.id,
        rival: a.rival.session.car.pos.map(v => +v.toFixed(1)),
        i: a.rival.follow?.i,
        n: a.rival.follow?.path?.length
      }
    );
  },
  navigate: id => {
    openWorld?.navigate(id, s.car.pos);
    return openWorld?.route().slice(0, 40) ?? [];
  },
  flying: () => ({
    mode: s.flight.mode,
    speed: s.flight.speed,
    burning,
    roam: race.roam,
    target: document.activeElement?.id
  }),
  flyover: before => openWorld?.qaFlyover(before),
  place: (pos, yaw = 0) => {
    placeCar(s.car, pos, yaw);
    s.car.vel = [0, 0, 0];
    s.car.ang = [0, 0, 0];
  },
  skate: left => {
    if (skate && left != null) skate.left = left;
    return (
      skate && {
        score: skate.score,
        left: skate.left,
        letters: [...skate.letters],
        goals: [...skate.goals],
        combo: skate.combo?.tricks.length ?? 0
      }
    );
  },
  give: (item, n) => {
    race.pickups.held.set(s.car, item);
    if (n > 1) race.pickups.ammo.set(s.car, n);
    else race.pickups.ammo.delete(s.car);
  },
  profile: () => prof.read(),
  frames: () => {
    const a = [...frameMs].sort((x, y) => x - y);
    return {p50: a[a.length >> 1], p95: a[Math.floor(a.length * 0.95)], max: a.at(-1), ratio: adaptive.ratio};
  },
  audio: () => Object.keys(audio.samples || {}),
  line: () => race.line.map(p => [p[0], p[1]]),
  snapshot: () => ({
    ...readout(s),
    rivals: race.rivals.map(rv => ({
      name: rv.callsign,
      x: rv.session.car.pos[0],
      z: rv.session.car.pos[2],
      finished: rv.session.finished
    })),
    drifting: !!s.assist.drift?.active,
    time: s.time,
    lap: s.lap,
    laps: s.laps,
    lapTimes: [...s.lapTimes],
    gate: s.gate,
    running: s.running,
    finished: s.finished,
    hits: s.hits,
    found: s.found,
    seen: [...s.seen],
    travel: s.travel,
    recoveries: s.recoveries,
    mode,
    paused,
    guide: drivingLine.mesh.visible ? 'course' : activeDistrictGuide,
    assets: assetState,
    item: race.pickups.held.get(s.car) ?? null,
    place: place(),
    track,
    world: openWorld
      ? {
          ...openWorld.stream.stats(),
          ready: openWorld.stream.ready(s.car.pos),
          discovered: [...openWorld.progress.discovered],
          event: openWorld.selected.id,
          locked: openWorld.locked,
          golf: openWorld.activity(),
          golfBest: openWorld.progress.golfBest,
          bowlingBest: openWorld.progress.bowlingBest,
          specimens: [...openWorld.progress.specimens],
          expedition: expedition(openWorld.progress)
        }
      : null,
    vehicle: {
      topSpeed: s.car.params.topSpeed,
      wheelRadius: s.car.params.wheelRadius,
      mass: s.car.params.mass
    },
    body: ui.progress.body,
    shell: ui.progress.shell,
    paint: ui.progress.paint,
    audioSilent: audio.silent
  }),
  renderer: () => renderer.info.render,
  nearDetail: () => nearDetail?.stats() ?? null,
  checkpoints: () => cps.map(c => [c[0], c[1]])
};
// Compile and upload before the establishing shot moves. District GLBs stay queued
// until the glide settles, and adaptive resolution does not sample the warm-up.
async function openWhenSettled() {
  // No animation frame until the asset swap, polish passes, and texture uploads are done.
  // Starting the loop earlier put shader compiles and GLB parsing into the opening glide.
  try {
    await Promise.all([assetsReady, polishReady]);
    await warmPresentation(renderer, scene, camera);
    const draw = () => (polish ? polish.render() : renderer.render(scene, camera));
    draw();
    draw();
  } catch (error) {
    console.warn('opening warm', error);
  }
  adaptive.frames = [];
  adaptive.since = 0;
  adaptive.calm = 0;
  last = performance.now();
  readyModes();
  requestAnimationFrame(frame);
}
openWhenSettled();
