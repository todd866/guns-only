function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatClock(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

/**
 * Post-sortie scoreboard. Reads snapshot counters the debrief already trusts
 * (kills, rounds, hits, peak G, clock). Does not invent ballistics.
 */
export function sortieGradeBoard(state = {}) {
  const snapshot = state && typeof state === "object" ? state : {};
  const kills = Math.max(0, Math.round(finite(snapshot.kill_count) ?? 0));
  const hits = Math.max(0, Math.round(finite(snapshot.sortie_hits) ?? 0));
  const rounds = Math.max(0, Math.round(finite(snapshot.sortie_rounds_fired) ?? 0));
  const time = finite(snapshot.simulation_time_s);
  const peakG = finite(snapshot.pilot_peak_positive_g);
  const accuracy = rounds > 0 ? hits / rounds : null;
  const outcome = String(snapshot.sortie_outcome || "").toUpperCase();
  const lost = outcome.includes("LOST") || finite(snapshot.player_health) === 0;

  let letter = "C";
  if (lost && kills === 0) letter = "D";
  else if (kills >= 1 && accuracy !== null && accuracy >= 0.2 && !lost) letter = "A";
  else if (kills >= 1) letter = "B";
  else if (hits === 0 && rounds >= 20) letter = "D";

  return Object.freeze({
    letter,
    kills: String(kills),
    accuracy: accuracy === null ? "—" : `${Math.round(accuracy * 100)}%`,
    g: peakG === null ? "—" : peakG.toFixed(1),
    time: time === null ? "—" : formatClock(time),
  });
}
