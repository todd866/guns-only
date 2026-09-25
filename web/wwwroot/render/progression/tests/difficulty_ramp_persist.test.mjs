import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { experienceById } from "../campaign_progression.js";
import {
  createDirectorPersistence,
  DIRECTOR_STATE_STORAGE,
  DIRECTOR_STATE_STORAGE_V1,
  routeRestoresDirector,
} from "../difficulty_ramp_persist.js";

const VALLEY = "mission.modern.visual-merge.first-run-valley.v1";
const V1 = "v1|1|1|1|0|0|0.0|0|0|0|0|0|0|0|0";
const V2_RUNG_2 = "v2|2|1|1|0|-|0|0|0|0.0|0|0|0|0|0|0|1|0|0|0";

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function observed(overrides) {
  return {
    programId: "first-merge",
    mission_id: VALLEY,
    engagement_number: 1,
    kill_count: 0,
    difficulty_rung: 0,
    session_phase: "active",
    ...overrides,
  };
}

test("director state saves after an engagement and on hide, and restores on the valley", () => {
  const storage = memoryStorage();
  const armed = [];
  let exported = V2_RUNG_2;
  const store = createDirectorPersistence({
    storage,
    exportState: () => exported,
    armState: (blob) => armed.push(blob),
    missionActive: (state) => state === undefined || state.mission_id === VALLEY,
  });

  assert.equal(store.persistObservation(observed()), false);
  assert.equal(storage.getItem(DIRECTOR_STATE_STORAGE), null);
  assert.equal(store.persistObservation(observed({ engagement_number: 2, kill_count: 1 })), true);
  assert.equal(storage.getItem(DIRECTOR_STATE_STORAGE), V2_RUNG_2);

  storage.removeItem(DIRECTOR_STATE_STORAGE);
  assert.equal(store.onPageHide(), true);
  assert.equal(storage.getItem(DIRECTOR_STATE_STORAGE), V2_RUNG_2);
  storage.removeItem(DIRECTOR_STATE_STORAGE);
  assert.equal(store.onVisibilityChange(false), false);
  assert.equal(storage.getItem(DIRECTOR_STATE_STORAGE), null);
  assert.equal(store.onVisibilityChange(true), true);
  assert.equal(storage.getItem(DIRECTOR_STATE_STORAGE), V2_RUNG_2);

  storage.setItem(DIRECTOR_STATE_STORAGE, "this-is-not-a-director-blob");
  const corrupt = store.restore();
  assert.equal(corrupt.kind, "corrupt");
  assert.equal(corrupt.rung, 0);
  assert.equal(armed.length, 0);

  storage.removeItem(DIRECTOR_STATE_STORAGE);
  storage.setItem(DIRECTOR_STATE_STORAGE_V1, V1);
  const migrated = store.restore();
  assert.equal(migrated.kind, "v1");
  assert.equal(migrated.rung, 0);
  assert.deepEqual(armed, [V1]);

  storage.setItem(DIRECTOR_STATE_STORAGE, V2_RUNG_2);
  assert.equal(routeRestoresDirector({ valley: true }), true);
  assert.equal(routeRestoresDirector({ programId: "top-gun" }), false);
  assert.equal(routeRestoresDirector({ programId: "first-merge" }), true);
  const valley = routeRestoresDirector({ valley: true }) ? store.restore() : null;
  assert.equal(valley.kind, "v2");
  assert.equal(valley.rung, 2);
  assert.equal(armed.at(-1), V2_RUNG_2);
});

test("the guns-only sortie is two engagements and then a landing", () => {
  const guns = experienceById("first-merge");
  assert.match(guns.shortObjective, /Two gun engagements, then land/);
  assert.doesNotMatch(guns.shortObjective, /endless/i);
});

test("the guns-only ready brief does not promise an opening ace pair or an endless sortie", async () => {
  const app = await readFile(new URL("../../../app.js", import.meta.url), "utf8");
  assert.doesNotMatch(app, /opening wave is a pair of Aces/);
  assert.doesNotMatch(app, /Splash the pair/);
  assert.doesNotMatch(app, /F-22A · endless/);
  assert.match(app, /Two gun kills open the next sortie on a pair\. Landing ends this one\./);
});
