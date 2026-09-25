import assert from "node:assert/strict";
import test from "node:test";

import {
  RIDE_BEST_STORAGE_KEY,
  loadRideBest,
  rideRampFromRecord,
  saveRideBest,
} from "../ride_best_lap_store.js";

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    map,
  };
}

const RECORD = Object.freeze({
  bestLapSeconds: 83.42,
  splitProfile: Array.from({ length: 32 }, (_, index) => index * 2.6),
  bestSectorSeconds: [20.1, 21.2, 20.9, 21.22],
});

test("a saved best round-trips", () => {
  const storage = memoryStorage();

  assert.equal(saveRideBest(storage, RECORD), true);
  const loaded = loadRideBest(storage);

  assert.equal(loaded.bestLapSeconds, RECORD.bestLapSeconds);
  assert.equal(loaded.broughtIn, false);
  assert.deepEqual(loaded.splitProfile, RECORD.splitProfile);
  assert.deepEqual(loaded.bestSectorSeconds, RECORD.bestSectorSeconds);
  assert.ok(storage.map.has(RIDE_BEST_STORAGE_KEY));
});

test("a storage that throws yields no best and no exception", () => {
  const hostile = {
    getItem() { throw new Error("SecurityError"); },
    setItem() { throw new Error("QuotaExceededError"); },
  };

  assert.equal(loadRideBest(hostile), null);
  assert.equal(saveRideBest(hostile, RECORD), false);
});

test("absent, malformed and nonsense records load as no best", () => {
  assert.equal(loadRideBest(memoryStorage()), null);
  assert.equal(loadRideBest(memoryStorage({ [RIDE_BEST_STORAGE_KEY]: "{oh no" })), null);
  assert.equal(
    loadRideBest(memoryStorage({ [RIDE_BEST_STORAGE_KEY]: JSON.stringify({}) })),
    null,
  );
  assert.equal(
    loadRideBest(memoryStorage({
      [RIDE_BEST_STORAGE_KEY]: JSON.stringify({ ...RECORD, bestLapSeconds: -4 }),
    })),
    null,
  );
  assert.equal(
    loadRideBest(memoryStorage({
      [RIDE_BEST_STORAGE_KEY]: JSON.stringify({ ...RECORD, splitProfile: [1, 2] }),
    })),
    null,
    "a short split profile cannot drive a delta and must be rejected",
  );
  assert.equal(loadRideBest(null), null);
});

test("a best from another circuit is refused rather than driving a wrong delta", () => {
  const rapier = { circuitId: "rapier-strip-weekend", circuitLengthM: 4000 };
  const elsewhere = { circuitId: "some-other-track", circuitLengthM: 4000 };
  const retuned = { circuitId: "rapier-strip-weekend", circuitLengthM: 4600 };
  const storage = memoryStorage();

  assert.equal(saveRideBest(storage, RECORD, rapier), true);
  assert.ok(loadRideBest(storage, rapier), "same circuit loads");
  assert.equal(loadRideBest(storage, elsewhere), null);
  assert.equal(loadRideBest(storage, retuned), null, "a retuned layout invalidates the best");
  // A record written before circuit identity existed has no fingerprint and cannot be trusted.
  const legacy = memoryStorage({
    [RIDE_BEST_STORAGE_KEY]: JSON.stringify({
      bestLapSeconds: 80,
      splitProfile: RECORD.splitProfile,
      bestSectorSeconds: [],
    }),
  });
  assert.equal(loadRideBest(legacy, rapier), null);
});

test("a record with a non-finite time is refused rather than stored", () => {
  const storage = memoryStorage();

  assert.equal(saveRideBest(storage, { ...RECORD, bestLapSeconds: Number.NaN }), false);
  assert.equal(storage.map.size, 0);
});

test("the ramp is full card, then distance, then half gain", () => {
  assert.deepEqual(rideRampFromRecord(null), {
    hasMatchingCleanLap: false, broughtIn: false, showApexSpeed: true, reflexGain: 1,
  });
  assert.equal(rideRampFromRecord({ ...RECORD, broughtIn: false }).showApexSpeed, false);
  assert.equal(rideRampFromRecord({ ...RECORD, broughtIn: false }).reflexGain, 1);
  const parked = rideRampFromRecord({ ...RECORD, broughtIn: true });
  assert.equal(parked.showApexSpeed, false);
  assert.equal(parked.reflexGain, 0.5);
});

test("a legal stop is stored beside the lap on the same key", () => {
  const storage = memoryStorage();
  assert.equal(saveRideBest(storage, { ...RECORD, broughtIn: true }), true);
  assert.equal(loadRideBest(storage).broughtIn, true);
});
