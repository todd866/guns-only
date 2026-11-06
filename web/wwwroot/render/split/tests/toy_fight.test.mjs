import assert from "node:assert/strict";
import test from "node:test";

import {aiCommand} from "../toy_ai.mjs";
import {CAST, hitAccepted} from "../toy_cast.mjs";
import {assistDirection, stepCraft} from "../toy_flight.mjs";
import {hudRows, menuRows, pauseRows, resultRows} from "../toy_hud.mjs";
import {faceIndex, readFlightPad, tvStick} from "../pad_flight.mjs";
import {CALLOUTS, calloutFor, RESPAWN_S, scoreHit} from "../toy_score.mjs";
import {
  applyMenu,
  beginToyFight,
  createToyFight,
  splitTelemetry,
  stepToyFight,
} from "../toy_session.mjs";

function pad({index = 0, id = "8BitDo Ultimate 2", axes = [0, 0, 0, 0], buttons = {}, mapping = "standard"} = {}) {
  return {
    connected: true,
    mapping,
    index,
    id,
    axes,
    buttons: Array.from({length: 16}, (_, i) => ({
      pressed: Number(buttons[i]) > 0.5,
      value: Number(buttons[i]) || 0,
    })),
  };
}

function jet(extra = {}) {
  return {
    kind: "jet",
    kindId: "army",
    x: 0, y: 8, z: 0,
    heading: 0, pitch: 0, bank: 0,
    speed: 12, lever: 0.5, vy: 0, rotor: 0,
    coolDart: 0, coolBalloon: 0, invuln: 0, splat: 0, pop: 0,
    ...extra,
  };
}

test("couch stick ignores rest noise and keeps full throw", () => {
  assert.equal(tvStick(0.2), 0);
  assert.equal(tvStick(-0.2), 0);
  assert.equal(tvStick(1), 1);
  assert.equal(tvStick(-1), -1);
  const mid = tvStick(0.6);
  const linear = (0.6 - 0.2) / 0.8;
  assert.ok(mid > 0 && mid < linear);
});

test("printed A throws a dart and printed B a balloon on both 8BitDo layouts", () => {
  const xbox = readFlightPad(pad({axes: [0, 1, 0, 0], buttons: {0: 1, 6: 1, 5: 1}}), {});
  assert.ok(xbox.pitch > 0, "pull raises the nose");
  assert.equal(xbox.dartEdge, true);
  assert.equal(xbox.balloonEdge, false);
  assert.ok(xbox.throttleRate < 0);
  assert.equal(xbox.rudder, 1);
  assert.equal(faceIndex(xbox.id, "A"), 0);

  const snes = readFlightPad(pad({
    id: "8BitDo SN30 Pro",
    buttons: {1: 1, 9: 1},
  }), {});
  assert.equal(snes.kind, "sn30");
  assert.equal(snes.dartEdge, true);
  assert.equal(snes.balloonEdge, false);
  assert.equal(snes.startEdge, true);
  assert.equal(faceIndex(snes.id, "B"), 0);

  const held = readFlightPad(pad({id: "8BitDo SN30 Pro", buttons: {1: 1, 9: 1}}), snes);
  assert.equal(held.dartEdge, false);
  assert.equal(held.startEdge, false);

  const bluetooth = readFlightPad(pad({mapping: "", buttons: {0: 1}}), {});
  assert.equal(bluetooth.connected, true);
  assert.equal(bluetooth.dartEdge, true);
});

test("two pads stay on their own seats", () => {
  const left = readFlightPad(pad({index: 0, axes: [1, 0, 0, 0]}), {});
  const right = readFlightPad(pad({index: 1, axes: [-1, 0, 0, 0]}), {});
  assert.ok(left.roll > 0);
  assert.ok(right.roll < 0);
  assert.notEqual(left.index, right.index);
});

test("callouts stay inside Splat, Got you, and Pop", () => {
  assert.equal(calloutFor({weapon: "balloon", downed: true}), "Splat!");
  assert.equal(calloutFor({weapon: "dart", downed: true}), "Got you!");
  assert.equal(calloutFor({weapon: "dart", downed: false}), "Pop!");
  assert.deepEqual(CALLOUTS, ["Splat!", "Got you!", "Pop!"]);
  const banned = /kill|dead|death|blood|explod|wreck|destroy|missile/i;
  for (const entry of CAST) {
    assert.equal(banned.test(entry.name + entry.beat), false, entry.id);
  }
});

test("a popped toy is back after 3 s with its balloon", () => {
  const session = createToyFight();
  session.split = true;
  beginToyFight(session);
  const p1 = session.crafts.find((craft) => craft.seat === "p1");
  p1.downFor = RESPAWN_S;
  p1.balloons = 0;
  let now = 0;
  while (now < RESPAWN_S + 0.05) {
    now += 0.05;
    stepToyFight(session, {dt: 0.05, pads: [], now});
  }
  assert.equal(p1.balloons, p1.maxBalloons);
  assert.equal(p1.downFor, 0);
  assert.ok(p1.y > 1);
});

test("dogfight ends at 5 and a second Start joins", () => {
  const session = createToyFight();
  session.split = true;
  session.p1Pad = 0;
  session.p2Pad = 1;
  beginToyFight(session);
  const p1 = session.crafts.find((craft) => craft.seat === "p1");
  const p2 = session.crafts.find((craft) => craft.seat === "p2");
  for (let i = 0; i < 5; i += 1) {
    p2.downFor = 0;
    p2.invuln = 0;
    p2.balloons = 1;
    scoreHit(session, {by: p1, target: p2, weapon: "dart"});
  }
  stepToyFight(session, {dt: 0.05, pads: [], now: 1});
  assert.equal(session.pops.p1, 5);
  assert.equal(session.phase, "result");
  assert.equal(session.winner, "p1");

  const fresh = createToyFight();
  beginToyFight(fresh);
  stepToyFight(fresh, {
    dt: 0.05,
    now: 1,
    pads: [pad({index: 0}), pad({index: 1, buttons: {9: 1}})],
  });
  assert.equal(fresh.split, true);
  assert.ok(fresh.crafts.some((craft) => craft.seat === "p2"));
  assert.deepEqual(splitTelemetry(fresh), {split: 1, mode: "dogfight"});
});

test("co-op darts do not pop the other player", () => {
  const session = createToyFight();
  applyMenu(session, "mode");
  session.split = true;
  beginToyFight(session);
  assert.equal(session.mode, "coop");
  assert.ok(session.crafts.some((craft) => craft.team === "bad"));
  const p1 = session.crafts.find((craft) => craft.seat === "p1");
  const p2 = session.crafts.find((craft) => craft.seat === "p2");
  p2.invuln = 0;
  p2.x = p1.x;
  p2.y = p1.y;
  p2.z = p1.z + 1;
  session.shots.push({
    id: "friendly",
    owner: p1.id,
    weapon: "dart",
    team: "good",
    seat: "p1",
    x: p2.x, y: p2.y, z: p2.z,
    vx: 0, vy: 0, vz: 0,
    age: 0, life: 1, radius: 2, splash: 0,
  });
  stepToyFight(session, {dt: 0.05, pads: [], now: 1});
  assert.equal(p2.balloons, 1);
  assert.equal(session.pops.team, 0);
});

test("each bad toy takes a different hit", () => {
  const front = {x: 0, y: 8, z: 10};
  assert.equal(hitAccepted({kindId: "wind-up-robot", ai: {phase: "run"}}, {weapon: "dart"}, front), false);
  assert.equal(hitAccepted({kindId: "wind-up-robot", ai: {phase: "wind"}}, {weapon: "dart"}, front), true);
  assert.equal(hitAccepted({kindId: "jack-in-the-box", ai: {open: false}}, {weapon: "dart"}, front), true);
  assert.equal(hitAccepted({kindId: "rubber-band-sniper", ai: {stretching: false}}, {weapon: "dart"}, front), false);
  assert.equal(hitAccepted({kindId: "rubber-band-sniper", ai: {stretching: true}}, {weapon: "dart"}, front), true);
  assert.equal(hitAccepted({kindId: "evil-teddy"}, {weapon: "dart"}, front), false);
  assert.equal(hitAccepted({kindId: "evil-teddy"}, {weapon: "balloon"}, front), true);
  assert.equal(hitAccepted({kindId: "plastic-dinosaur", ai: {phase: "run"}}, {weapon: "dart"}, front), false);
  assert.equal(hitAccepted({kindId: "plastic-dinosaur", ai: {phase: "pause"}}, {weapon: "dart"}, front), true);
  assert.equal(hitAccepted({kindId: "tin-soldier-wrong-colour", y: 6}, {weapon: "dart"}, {y: 6}), false);
  assert.equal(hitAccepted({kindId: "tin-soldier-wrong-colour", y: 6}, {weapon: "dart"}, {y: 9}), true);
  assert.equal(hitAccepted({kindId: "spinning-top-swarm", ai: {phase: "spin"}}, {weapon: "dart"}, front), false);
  assert.equal(hitAccepted({kindId: "spinning-top-swarm", ai: {phase: "wobble"}}, {weapon: "dart"}, front), true);
  assert.equal(hitAccepted({kindId: "toy-chest-boss"}, {weapon: "dart"}, front), false);
  assert.equal(hitAccepted({kindId: "toy-chest-boss"}, {weapon: "balloon"}, front), true);
  assert.equal(CAST.length, 10);
});

test("behaviours stay distinct", () => {
  const wind = {kindId: "wind-up-robot", x: 0, y: 6, z: 0, heading: 0, lever: 0.2, ai: {t: 0, phase: "run"}};
  aiCommand(wind, [], 1.5);
  assert.equal(wind.ai.phase, "wind");
  const dino = {kindId: "plastic-dinosaur", x: 0, y: 3, z: 0, heading: 0, lever: 1, ai: {}};
  const turn = aiCommand(dino, [{x: 30, y: 3, z: 0}], 0.05);
  assert.ok(Math.abs(turn.rudder) <= 0.32);
  const boss = {kindId: "toy-chest-boss", x: 0, y: 8, z: 0, heading: 0, lever: 0.3, ai: {t: 0, lid: true}};
  aiCommand(boss, [], 3.1);
  assert.equal(boss.ai.lid, false);
  assert.equal(boss.ai.spit, true);
});

test("assist is per player: kid cannot stall, pilot can", () => {
  const session = createToyFight();
  session.split = true;
  applyMenu(session, "p2assist");
  assert.equal(session.assist.p1, "kid");
  assert.equal(session.assist.p2, "pilot");
  beginToyFight(session);
  const p1 = session.crafts.find((craft) => craft.seat === "p1");
  const p2 = session.crafts.find((craft) => craft.seat === "p2");
  assert.equal(p1.assist, "kid");
  assert.equal(p2.assist, "pilot");
  // Chop both throttles and glide: the kid seat keeps flying speed, the
  // pilot seat is allowed to slow into the stall.
  p1.lever = 0;
  p2.lever = 0;
  p1.y = p2.y = 20;
  let pilotStalled = false;
  for (let i = 0; i < 400; i += 1) {
    stepCraft(p1, {pitch: 0, roll: 0, rudder: 0, throttleRate: -1}, 0.05);
    stepCraft(p2, {pitch: 0.4, roll: 0, rudder: 0, throttleRate: -1}, 0.05);
    pilotStalled = pilotStalled || p2.stalled === true;
  }
  assert.equal(p1.stalled, false, `kid speed ${p1.speed.toFixed(1)} stays above Vs`);
  assert.equal(pilotStalled, true, "the raw aeroplane can be flown into the stall");
});

test("jet pull climbs and a chopper can hover", () => {
  const plane = jet();
  const y0 = plane.y;
  for (let i = 0; i < 30; i += 1) stepCraft(plane, {pitch: 1, roll: 0, rudder: 0, throttleRate: 0}, 0.05);
  assert.ok(plane.pitch > 0.4);
  assert.ok(plane.y > y0);

  const heli = jet({kind: "chopper", y: 5, lever: 0.5, speed: 0, vy: 0});
  for (let i = 0; i < 40; i += 1) stepCraft(heli, {pitch: 0, roll: 0, rudder: 0, throttleRate: 0}, 0.05);
  assert.ok(Math.abs(heli.y - 5) < 0.25);
  assert.ok(heli.speed < 1);
});

test("aim help bends inside the cone only", () => {
  const from = {x: 0, y: 0, z: 0};
  const ahead = {x: 0, y: 0, z: 1};
  const helped = assistDirection(from, ahead, [{x: 3, y: 0, z: 20, downFor: 0}]);
  assert.ok(helped.x > 0.05);
  const missed = assistDirection(from, ahead, [{x: 40, y: 0, z: 6, downFor: 0}]);
  assert.equal(missed.x, 0);
});

test("a foam dart pops the other jet", () => {
  const session = createToyFight();
  session.split = true;
  session.p1Pad = 0;
  session.p2Pad = 1;
  beginToyFight(session);
  const p1 = session.crafts.find((craft) => craft.seat === "p1");
  const p2 = session.crafts.find((craft) => craft.seat === "p2");
  p1.x = 0; p1.y = 8; p1.z = 0; p1.heading = 0; p1.pitch = 0; p1.speed = 0; p1.lever = 0;
  p2.x = 0; p2.y = 8; p2.z = 12; p2.heading = 0; p2.pitch = 0; p2.speed = 0; p2.lever = 0; p2.invuln = 0;
  const pads = [pad({index: 0, buttons: {0: 1}}), pad({index: 1})];
  let now = 0;
  for (let i = 0; i < 120; i += 1) {
    now += 1 / 60;
    p2.invuln = 0;
    stepToyFight(session, {dt: 1 / 60, pads, now});
  }
  assert.ok(session.pops.p1 >= 1, `pops ${session.pops.p1}`);
  assert.ok(["Got you!", "Pop!", "Splat!"].includes(session.callout?.text) || session.pops.p1 >= 1);
});

test("menus and HUDs are one row per instrument", () => {
  const session = createToyFight();
  session.split = true;
  beginToyFight(session);
  const menu = menuRows(session);
  assert.equal(menu.length, 5);
  assert.deepEqual(menu.map((row) => row.datum), ["mode", "toy", "assist", "assist", ""]);
  const hud = hudRows(session, "p1");
  assert.equal(hud.length, 7);
  assert.deepEqual(hud.map((row) => row.datum), ["pops", "ready", "ready", "thr", "spd", "alt", "g"]);
  assert.match(hud[0].pips, /[●○]/);
  assert.equal(pauseRows("👤 1 player").length, 4);
  assert.equal(pauseRows("").length, 3);
  const games = pauseRows("").at(-1);
  assert.equal(games.act, "games");
  assert.equal(games.symbol, "🏠");
  assert.equal(games.value, "Games");
  const done = resultRows(session);
  assert.equal(done.some((row) => row.value === "AGAIN"), true);
  assert.equal(done.some((row) => /win|dead|kill/i.test(row.value)), false);
});
