import { BLANK_LAP_TIME, formatLapTime } from "./ride_timing_readout.js";

function finitePositive(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
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
  const improvedRecord = recordSeconds !== null
    && (startingRecordSeconds === null || recordSeconds < startingRecordSeconds - 1e-6);

  let title = "RIDE COMPLETE";
  let verdict = "SESSION BANKED";
  if (improvedRecord) {
    title = "PERSONAL BEST";
    verdict = "CLEAN LAP BANKED";
  } else if (laps > 0) {
    verdict = "LAPS RECORDED";
  } else if ((currentLapSeconds !== null && !currentLapClean)
    || (laps === 0 && offTrackSeconds > 0)) {
    verdict = "NO CLEAN LAP";
  }

  const lapWord = laps === 1 ? "lap" : "laps";
  let summary = "No timed lap.";
  if (improvedRecord)
    summary = `New record · ${formatLapTime(recordSeconds)}.`;
  else if (laps > 0 && recordSeconds !== null)
    summary = `${laps} ${lapWord} · record ${formatLapTime(recordSeconds)}.`;
  else if (offTrackSeconds > 0)
    summary = `No clean lap · ${offTrackSeconds.toFixed(1)} s off track.`;
  else if (currentLapSeconds !== null && !currentLapClean)
    summary = "No clean lap · open lap invalid.";
  else if (currentLapSeconds !== null)
    summary = `Open lap · ${formatLapTime(currentLapSeconds)}.`;

  let correction = "Next · bank one clean lap.";
  if (offTrackSeconds > 0)
    correction = "Next · brake earlier. Stay inside the paint.";
  else if (currentLapSeconds !== null && !currentLapClean)
    correction = "Next · reset and bank a clean lap.";
  else if (improvedRecord)
    correction = "Next · repeat it clean.";
  else if (laps > 0)
    correction = "Next · protect the line, then chase time.";

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
      Object.freeze({ label: "LAST", value: formatLapTime(lastLapSeconds) }),
      Object.freeze({ label: "RECORD", value: formatLapTime(recordSeconds) }),
      Object.freeze({
        label: "OPEN LAP",
        value: currentLapSeconds === null ? "NOT TIMED" : currentLapClean ? "CLEAN" : "INVALID",
        tone: currentLapSeconds !== null && !currentLapClean ? "warning" : "neutral",
      }),
      Object.freeze({ label: "OFF TRACK", value: `${offTrackSeconds.toFixed(1)} s` }),
    ]),
    sectors: Object.freeze(sectorValues),
    improvedRecord,
  });
}
