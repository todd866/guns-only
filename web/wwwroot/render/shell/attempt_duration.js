const finite = (value) => value !== null && value !== undefined && value !== ""
  && Number.isFinite(Number(value)) ? Number(value) : null;

// Practice epochs are cold metadata; the session clock is hot. Derive live duration
// until the result edge publishes the frozen objective duration (before its display hold).
export function attemptDurationSeconds(state = {}) {
  const snapshot = state ?? {};
  const sessionTime = finite(snapshot.simulation_time_s) ?? finite(snapshot.t);
  if (snapshot.practice_exercise && snapshot.practice_exercise !== "none") {
    const start = finite(snapshot.practice_started_at_s);
    if (snapshot.practice_status === "active" && start !== null && sessionTime !== null)
      return Math.max(0, sessionTime - start);
    const elapsed = finite(snapshot.practice_elapsed_s);
    if (elapsed !== null) return Math.max(0, elapsed);
  }
  return sessionTime;
}
