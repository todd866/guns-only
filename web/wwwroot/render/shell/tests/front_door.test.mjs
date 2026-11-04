import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  FRONT_DOOR_CLASSES,
  FRONT_DOOR_VARIANTS,
  F22_FIRST_MERGE_MISSION,
  applyFrontDoor,
  readDirectorWinStreak,
  readFrontDoorReturningPlayer,
  resolveFrontDoor,
} from "../front_door.js";
import { DIRECTOR_STATE_STORAGE } from "../../progression/difficulty_ramp_persist.js";
import { f22PersonalBestKey } from "../../debrief/f22_result_instrument.js";

const [indexHtml, appJs, doorCss] = await Promise.all([
  readFile(new URL("../../../index.html", import.meta.url), "utf8"),
  readFile(new URL("../../../app.js", import.meta.url), "utf8"),
  readFile(new URL("../front_door.css", import.meta.url), "utf8"),
]);

function createFakeRoot(initialClasses = ["run-paused"], initialAttrs = { lang: "en", "data-launch": "booting" }) {
  const classes = new Set(initialClasses);
  const attrs = new Map(Object.entries(initialAttrs));
  let mutations = 0;
  const classList = {
    contains(name) { return classes.has(name); },
    add(...names) {
      for (const name of names) {
        mutations += 1;
        classes.add(name);
      }
    },
    remove(...names) {
      for (const name of names) {
        mutations += 1;
        classes.delete(name);
      }
    },
  };
  const serialize = () => {
    const classAttr = [...classes].join(" ");
    const attrString = [...attrs.entries()]
      .map(([k, v]) => `${k}="${v}"`)
      .join(" ");
    return `<html ${attrString} class="${classAttr}">`;
  };
  return {
    classList,
    classes,
    serialize,
    get mutations() { return mutations; },
  };
}

test("front door variant applies only with ?frontDoor= and leaves default DOM byte-identical without it", () => {
  assert.deepEqual(FRONT_DOOR_VARIANTS, ["a", "b", "c"]);
  assert.deepEqual(FRONT_DOOR_CLASSES, [
    "front-door-a",
    "front-door-b",
    "front-door-c",
  ]);

  for (const url of [
    "https://guns-only.com/",
    "https://guns-only.com/?program=first-merge",
    "https://guns-only.com/?frontDoor=",
    "https://guns-only.com/?frontDoor=unknown",
  ]) {
    const root = createFakeRoot();
    const before = root.serialize();
    const resolved = applyFrontDoor(root, { href: url });
    assert.equal(resolved, null);
    assert.equal(root.mutations, 0, `unexpected DOM mutation for ${url}`);
    assert.equal(root.serialize(), before, `default DOM must stay byte-identical for ${url}`);
    for (const className of FRONT_DOOR_CLASSES) {
      assert.equal(root.classList.contains(className), false);
    }
  }

  const root = createFakeRoot();
  for (const variant of FRONT_DOOR_VARIANTS) {
    const resolved = applyFrontDoor(root, {
      href: `https://guns-only.com/?frontDoor=${variant.toUpperCase()}`,
    });
    assert.equal(resolved, variant);
    const active = FRONT_DOOR_CLASSES.filter((c) => root.classList.contains(c));
    assert.deepEqual(active, [`front-door-${variant}`]);
  }

  const initialRoot = createFakeRoot();
  assert.equal(applyFrontDoor(root, { href: "https://guns-only.com/" }), null);
  assert.equal(root.serialize(), initialRoot.serialize());
});

test("returning-player readings use director rung, win streak, and mission personal best", () => {
  const blob = "v3|2|1|1|0|-|0|3|0|0.0|0|0|0|0|0|0|1|0|0|0|1";
  assert.equal(readDirectorWinStreak(blob), 3);
  const storage = {
    getItem(key) {
      if (key === DIRECTOR_STATE_STORAGE) return blob;
      if (key === f22PersonalBestKey({ mission_definition_id: F22_FIRST_MERGE_MISSION })) return "1350";
      return null;
    },
  };
  assert.deepEqual(readFrontDoorReturningPlayer(storage), {
    rung: 2,
    streak: 3,
    personalBest: 1350,
  });
});

test("front_door.css is linked from index.html and rules stay scoped to front-door classes", () => {
  assert.match(
    indexHtml,
    /<link rel="stylesheet" href="\.\/render\/shell\/front_door\.css">/,
  );
  assert.match(
    indexHtml,
    /^<!doctype html>\n<html lang="en" class="run-paused" data-launch="booting">/,
    "authored <html> tag in index.html must remain unchanged by default",
  );
  assert.match(appJs, /applyFrontDoor\(document\.documentElement,\s*window\.location\)/);
  assert.match(appJs, /syncFrontDoor\(document,\s*window\.location\)/);
  for (const line of doorCss.split("\n")) {
    if (line.includes("#ready-screen") && !line.includes("front-door")) {
      assert.fail(`unscoped ready-screen rule: ${line.trim()}`);
    }
  }
  for (const variant of FRONT_DOOR_VARIANTS) {
    assert.match(doorCss, new RegExp(`\\.front-door-${variant}\\b`), `missing .front-door-${variant} in CSS`);
  }
});
