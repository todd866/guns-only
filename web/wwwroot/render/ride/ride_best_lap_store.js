/**
 * Persists the rider's best lap so it survives a reload — otherwise every session starts
 * with nothing to chase, which is the state the ride shipped in.
 *
 * Every path FAILS SAFE. Storage can throw (private browsing, quota, blocked cookies) and
 * the stored blob can be anything at all; none of that may cost the rider a ride. A missing
 * or suspect record simply means "no best yet".
 */

import { RIDE_SPLIT_SAMPLE_COUNT } from "./ride_timing_readout.js";

export const RIDE_BEST_STORAGE_KEY = "guns-only.ride.best.v1";

/**
 * A split profile is only meaningful for the circuit that produced it. Without this, a best
 * from another layout (or from before a circuit retune) would silently drive the live delta
 * with total confidence. The lap length is the cheapest available fingerprint.
 */
function circuitMatches(record, circuit) {
  if (!circuit) return true;
  const storedLength = Number(record?.circuitLengthM);
  const currentLength = Number(circuit.circuitLengthM);
  if (!Number.isFinite(storedLength) || !Number.isFinite(currentLength)) return false;
  if (record?.circuitId !== circuit.circuitId) return false;
  return Math.abs(storedLength - currentLength) <= 1.0;
}

function finitePositive(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

/** @returns {{bestLapSeconds: number, splitProfile: number[], bestSectorSeconds: number[]}|null} */
export function loadRideBest(storage, circuit = null) {
  let raw = null;
  try {
    raw = storage?.getItem?.(RIDE_BEST_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
  if (typeof raw !== "string" || raw.length === 0) return null;

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  if (!circuitMatches(parsed, circuit)) return null;
  const bestLapSeconds = finitePositive(parsed.bestLapSeconds);
  if (bestLapSeconds === null) return null;
  // A short or non-numeric profile cannot drive a delta; refuse it rather than interpolate
  // against garbage and show the rider a confident, wrong number.
  const splitProfile = Array.isArray(parsed.splitProfile)
    && parsed.splitProfile.length === RIDE_SPLIT_SAMPLE_COUNT
    && parsed.splitProfile.every((value) => Number.isFinite(Number(value)))
    ? parsed.splitProfile.map(Number)
    : null;
  if (splitProfile === null) return null;
  const bestSectorSeconds = Array.isArray(parsed.bestSectorSeconds)
    ? parsed.bestSectorSeconds.map((value) => finitePositive(value))
    : [];

  return { bestLapSeconds, splitProfile, bestSectorSeconds };
}

/** @returns {boolean} true when the record was written. */
export function saveRideBest(storage, record, circuit = null) {
  if (finitePositive(record?.bestLapSeconds) === null) return false;
  if (!Array.isArray(record?.splitProfile)
    || record.splitProfile.length !== RIDE_SPLIT_SAMPLE_COUNT
    || !record.splitProfile.every((value) => Number.isFinite(Number(value)))) return false;
  try {
    storage?.setItem?.(RIDE_BEST_STORAGE_KEY, JSON.stringify({
      bestLapSeconds: Number(record.bestLapSeconds),
      splitProfile: record.splitProfile.map(Number),
      bestSectorSeconds: Array.isArray(record.bestSectorSeconds)
        ? record.bestSectorSeconds
        : [],
      circuitId: circuit?.circuitId ?? null,
      circuitLengthM: Number(circuit?.circuitLengthM) || null,
    }));
    return true;
  } catch {
    return false;
  }
}
