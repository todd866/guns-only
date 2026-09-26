import { BLANK_LAP_TIME, formatLapTime } from "./ride_timing_readout.js";

function finitePositive(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function finiteNonNegative(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function stoppedBeforeHairpin(metres) {
  const distance = metres >= 1000
    ? `${(metres / 1000).toFixed(1)} km`
    : `${Math.round(metres)} m`;
  return `Stopped ~${distance} before the hairpin.`;
}

function wholeCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

/**
 * Turns the terminal Weekend Ride authority snapshot into restrained, honest debrief copy.
 * "Record" is deliberately distinct from "last lap": it may have been seeded from an older
 * session. The caller supplies that starting record so a personal best is only claimed when the
 * current ride actually improved it.
 */
export function weekendRideResult(state, { recordAtStartSeconds = null } = {}) {
  const laps = wholeCount(state?.lap);
  const lastLapSeconds = finitePositive(state?.last_lap_s);
  const recordSeconds = finitePositive(state?.best_lap_s);
  const startingRecordSeconds = finitePositive(recordAtStartSeconds);
  const currentLapSeconds = finitePositive(state?.lap_time_s);
  const offTrackSeconds = Math.max(0, Number(state?.off_track_s) || 0);
  const currentLapClean = state?.lap_valid !== false;
  const legalStop = state?.legal_stop === true;
  const cameInEarly = state?.came_in_early === true;
  const hotPit = state?.hot_pit_entry === true;
  const tips = wholeCount(state?.tip_count);
  const cleanLapSeconds = finitePositive(state?.clean_lap_s);
  const cleanFlyingLaps = wholeCount(state?.clean_flying_laps);
  const hasCleanFlyingLap = cleanFlyingLaps > 0 && cleanLapSeconds !== null;
  const improvedRecord = hasCleanFlyingLap && recordSeconds !== null
    && startingRecordSeconds !== null
    && recordSeconds < startingRecordSeconds - 1e-6;
  const nextApexM = finiteNonNegative(state?.next_apex_m);
  const gridSentence = tips > 0 ? " The bike went back to the grid once." : "";
  const gridQuit = tips > 0 ? " The bike went back to the grid." : "";

  let title = "STILL ON TRACK";
  let verdict = "STILL OUT";
  let summary = "Still on track.";
  let correction = "Next · the session ends in the box.";

  if (!legalStop) {
    if (tips > 0) {
      summary = `Still on track.${gridQuit}`;
      correction = "Next · bring it in.";
    } else if (nextApexM !== null) {
      summary = stoppedBeforeHairpin(nextApexM);
    }
  } else if (cameInEarly) {
    title = "CAME IN EARLY";
    verdict = "IN THE BOX";
    summary = `In the box on lap ${Math.max(laps, 1)}. The checker was still out.`;
    correction = "Next · take both laps, then bring it in.";
  } else if (hotPit) {
    title = "IN THE BOX";
    verdict = "PIT SPEED";
    summary = "In the box. One pit entry was over 60 km/h.";
    correction = "Next · be at 60 before the box, then stop.";
  } else if (!hasCleanFlyingLap) {
    title = "IN THE BOX";
    verdict = "NO CLEAN LAP";
    summary = `In the box. No clean lap. ${offTrackSeconds.toFixed(1)} s off the paint.${tips > 0 ? " The bike went back to the grid." : ""}`;
    correction = "Next · both hairpins inside the paint, then the box.";
  } else if (improvedRecord) {
    title = "PERSONAL BEST";
    verdict = "NEW RECORD";
    summary = `In the box. New record · ${formatLapTime(recordSeconds)}.`;
    correction = "Next · the corner speed comes off the card.";
  } else {
    title = "RIDE COMPLETE";
    verdict = "IN THE BOX";
    summary = `In the box. Clean lap ${formatLapTime(cleanLapSeconds)}.${gridSentence}`;
    correction = "Next · repeat it clean.";
  }

  const sectorValues = Array.isArray(state?.best_sector_s)
    ? state.best_sector_s.slice(0, 4).map((value) => formatLapTime(value))
    : [];
  while (sectorValues.length < 4) sectorValues.push(BLANK_LAP_TIME);

  return Object.freeze({
    title,
    verdict,
    summary,
    correction,
    metrics: Object.freeze([
      Object.freeze({ label: "LAPS", value: String(laps) }),
      Object.freeze({ label: "LAST", value: formatLapTime(lastLapSeconds), visible: lastLapSeconds !== null }),
      Object.freeze({ label: "RECORD", value: formatLapTime(recordSeconds), visible: recordSeconds !== null }),
      Object.freeze({
        label: "OPEN LAP",
        value: currentLapSeconds === null ? "NOT TIMED" : currentLapClean ? "CLEAN" : "INVALID",
        tone: currentLapSeconds !== null && !currentLapClean ? "warning" : "neutral",
      }),
      Object.freeze({ label: "OFF TRACK", value: `${offTrackSeconds.toFixed(1)} s` }),
    ]),
    sectors: Object.freeze(sectorValues),
    hasSectorEvidence: sectorValues.some((value) => value !== BLANK_LAP_TIME),
    improvedRecord,
  });
}
