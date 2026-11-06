import test from "node:test";
import assert from "node:assert/strict";
import {
  PROGRESS_KEY, applyResult, campaignRows, emptyProgress, loadProgress,
  missionUnlocked, saveProgress, totalStars, unlocked,
} from "../campaign.mjs";

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    dump: () => Object.fromEntries(map),
  };
}

test("progress round-trips through storage", () => {
  const storage = memoryStorage();
  const {progress} = applyResult(emptyProgress(), "balloon-fort", {pilot: 2, gunner: 3}, {pops: 6, shots: 10, hits: 6, accuracy: 0.6});
  assert.equal(saveProgress(storage, progress), true);
  const back = loadProgress(storage);
  assert.deepEqual(back.stars["balloon-fort"], {pilot: 2, gunner: 3});
  assert.equal(back.totalStars, 5);
});

test("corrupt or missing storage degrades to empty progress", () => {
  assert.deepEqual(loadProgress(undefined), emptyProgress());
  assert.deepEqual(loadProgress(memoryStorage({[PROGRESS_KEY]: "{nope"})), emptyProgress());
  const weird = memoryStorage({[PROGRESS_KEY]: JSON.stringify({stars: null, stickers: [1, "first-pop"]})});
  const got = loadProgress(weird);
  assert.deepEqual(got.stars, {});
  assert.deepEqual(got.stickers, ["first-pop"]);
});

test("stars keep the best run and never regress", () => {
  let {progress} = applyResult(emptyProgress(), "balloon-fort", {pilot: 3, gunner: 2}, {});
  ({progress} = applyResult(progress, "balloon-fort", {pilot: 1, gunner: 3}, {}));
  assert.deepEqual(progress.stars["balloon-fort"], {pilot: 3, gunner: 3});
});

test("the ladder: a mission opens once the one before has any star", () => {
  const none = emptyProgress();
  assert.equal(missionUnlocked(none, "balloon-fort"), true);
  assert.equal(missionUnlocked(none, "toy-train"), false);
  const {progress} = applyResult(none, "balloon-fort", {pilot: 1, gunner: 1}, {});
  assert.equal(missionUnlocked(progress, "toy-train"), true);
  assert.equal(missionUnlocked(progress, "blimp-boss"), false);
});

test("stickers are one-off; the medic magnet rewards friendly splats", () => {
  const tele = {pops: 1, shots: 4, hits: 2, accuracy: 0.5, friendlySplats: 3, missionId: "balloon-fort", wobbles: 0};
  const first = applyResult(emptyProgress(), "balloon-fort", {pilot: 1, gunner: 2}, tele);
  const ids = first.newStickers.map((s) => s.id);
  assert.ok(ids.includes("first-pop"));
  assert.ok(ids.includes("medic-magnet"));
  const second = applyResult(first.progress, "balloon-fort", {pilot: 1, gunner: 2}, tele);
  assert.equal(second.newStickers.length, 0, "no double awards");
});

test("unlocks arrive at star totals and only announce once", () => {
  const r1 = applyResult(emptyProgress(), "balloon-fort", {pilot: 3, gunner: 3}, {});
  assert.deepEqual(r1.newUnlocks.map((u) => u.id), ["paint-sunburst", "paint-shark"]);
  const r2 = applyResult(r1.progress, "toy-train", {pilot: 2, gunner: 2}, {});
  assert.deepEqual(r2.newUnlocks.map((u) => u.id), ["bubble-cannon"]);
  assert.equal(unlocked(r2.progress).length, 3);
  assert.equal(totalStars(r2.progress), 10);
});

test("campaign rows: stars shown, locked rows say why", () => {
  const rows = campaignRows(emptyProgress());
  assert.equal(rows.length, 3);
  assert.equal(rows[0].open, true);
  assert.equal(rows[1].open, false);
  assert.match(rows[1].label, /🔒/);
  assert.match(rows[0].label, /☆☆☆/);
});
