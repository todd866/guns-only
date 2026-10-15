import { attemptElapsedSeconds } from "../progression/attempt_clock.js";
import { formatAttemptClock } from "../debrief/f22_result_instrument.js";

const count = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0
  ? Math.trunc(value) : null;

// A paused sortie can have an attempt clock and finite engagement contract. Other mission
// scores have different meanings; do not substitute their default zeroes for missing evidence.
export function missionStrip(state, { mode = "", startSeconds = null } = {}) {
  const seconds = attemptElapsedSeconds(state, startSeconds);
  const won = count(state?.engagements_won);
  const cap = count(state?.engagement_cap);
  return {
    mode,
    clock: seconds === null ? null : formatAttemptClock(seconds),
    engagements: won !== null && cap !== null && cap > 0 ? `${won}/${cap}` : null,
  };
}

export function paintMissionStrip(root, state, { visible = false, ...options } = {}) {
  if (!root) return;
  root.hidden = !visible;
  if (!visible) return;
  const model = missionStrip(state, options);
  const mode = root.querySelector("#ready-mission-mode");
  if (mode.textContent !== model.mode) mode.textContent = model.mode;
  mode.parentElement.hidden = !model.mode;
  for (const key of ["clock", "engagements"]) {
    const metric = root.querySelector(`#ready-mission-${key}`);
    metric.hidden = model[key] === null;
    if (metric.hidden) continue;
    const number = metric.querySelector(".console-number");
    if (number.textContent !== model[key]) number.textContent = model[key];
  }
}
