// One home for "how long was THIS attempt". The kernel's simulation_time_s is a monotonic
// session clock that keeps running across restarts, so it is not an attempt duration.
//
// Merge note: a sibling change adds a kernel per-attempt epoch. If the snapshot carries
// attempt_elapsed_s, it wins; otherwise the attempt's own start reading is subtracted here.

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/** The session clock reading to store when an attempt begins. */
export function attemptStartSeconds(state) {
  return finite(state?.simulation_time_s);
}

/** Elapsed seconds of the attempt that began at startSeconds, or null when unknown. */
export function attemptElapsedSeconds(state, startSeconds) {
  const kernel = finite(state?.attempt_elapsed_s);
  if (kernel !== null) return Math.max(0, kernel);
  const now = finite(state?.simulation_time_s);
  const start = finite(startSeconds);
  if (now === null || start === null) return null;
  return Math.max(0, now - start);
}
