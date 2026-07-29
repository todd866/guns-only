import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");

const [catalogue, indoor, game, styles] = await Promise.all([
  readFile(path.join(ROOT, "web/wwwroot/index.html"), "utf8"),
  readFile(path.join(ROOT, "web/wwwroot/indoor/index.html"), "utf8"),
  readFile(path.join(ROOT, "web/wwwroot/indoor/game.js"), "utf8"),
  readFile(path.join(ROOT, "web/wwwroot/indoor/style.css"), "utf8"),
]);

test("catalogue exposes Indoor as a native route without pretending it is a fixed-wing beat", () => {
  const links = [...catalogue.matchAll(
    /<a\b([^>]*)class="sortie-choice"([^>]*)href="\/indoor\/"([^>]*)>/gi,
  )];
  assert.equal(links.length, 1, "the catalogue should contain one Indoor mission link");
  assert.doesNotMatch(links[0][0], /data-program-node=/,
    "Indoor owns a separate six-degree-of-freedom kernel, not a numeric SimulationSession beat");
  assert.match(links[0][0], /data-experience="indoor"/);
  assert.match(catalogue,
    /Five flight experiences on the road to the 2040 battlespace, from low-level medical transport to the stratosphere\./);
});

test("Indoor entrypoint advertises its complete control and mission contract", () => {
  for (const id of [
    "viewport",
    "begin-button",
    "detach-button",
    "broadcast-button",
    "return-button",
    "survey-mission-set",
    "objective-list",
    "minimap",
    "result-screen",
    "touch-controls",
    "boot-status",
    "feed-state",
    "video-tear",
  ]) {
    assert.match(indoor, new RegExp(`id="${id}"`), `missing Indoor surface #${id}`);
  }
  assert.match(indoor, /W \/ S/);
  assert.match(indoor, /ARROWS/);
  assert.match(indoor, /X detaches fibre/);
  assert.match(indoor, /HOLD B/);
  for (const missionId of ["attack-site", "discretionary-site", "diversion-site"]) {
    assert.match(indoor, new RegExp(`data-mission-id="${missionId}"`));
  }
  assert.match(indoor, /Fictional systems and facility/);
  assert.match(indoor, /type="module" src="\.\/game\.js"/);
});

test("Indoor keeps the Guns-Only keyboard grammar while remapping aircraft axes to translation", () => {
  assert.match(game,
    /heldKeys\.has\("KeyW"\) \? 1 : 0\)[\s\S]*heldKeys\.has\("KeyS"\) \? 1 : 0\)/,
    "W/S must own forward/back translation");
  assert.match(game,
    /heldKeys\.has\("KeyD"\) \? 1 : 0\)[\s\S]*heldKeys\.has\("KeyA"\) \? 1 : 0\)/,
    "A/D must own right/left strafe");
  assert.match(game,
    /heldKeys\.has\("ArrowRight"\)[\s\S]*heldKeys\.has\("ArrowLeft"\)/,
    "left/right arrows must rotate the view");
  assert.match(game,
    /heldKeys\.has\("ArrowUp"\)[\s\S]*heldKeys\.has\("ArrowDown"\)/,
    "up/down arrows must pitch the view");
  assert.match(game,
    /heldKeys\.has\("Space"\) \? 1 : 0\)[\s\S]*heldKeys\.has\("ShiftLeft"\) \? 1 : 0\)/,
    "Space and Left Shift must own climb and descent");
  assert.match(game, /event\.code === "KeyX"[\s\S]*detachQueued = true/,
    "X must own the deliberate fibre breakaway");
  assert.match(game, /event\.code === "KeyB"[\s\S]*broadcastHeld = true/,
    "B must own the deliberate RF/EW signature");
  assert.match(game, /returnHome,[\s\S]*broadcast: broadcastHeld/,
    "the UI must send return and broadcast doctrine choices into the kernel");
});

test("Indoor makes downlink loss visible while keeping simulation cadence independent", () => {
  assert.match(game, /function videoFeedState\(/);
  assert.match(game, /function videoFrameIntervalMs\(/);
  assert.match(game,
    /function deliverVideoFrame\([\s\S]*presentation\.update\([\s\S]*presentation\.render\(\)/,
    "the operator feed should hold delivered frames without pausing the simulation");
  assert.match(game,
    /mission = stepIndoorMission\([\s\S]*function deliverVideoFrame/,
    "the fixed-step simulation must continue independently from video delivery");
  assert.match(styles, /body\[data-video="degraded"\] #video-tear/);
  assert.match(styles, /body\[data-video="choppy"\] #video-tear/);
  assert.match(styles, /body\[data-video="lost"\] #video-tear/);
  assert.match(styles, /body\[data-autonomy="active"\] #relay-block/);
});
