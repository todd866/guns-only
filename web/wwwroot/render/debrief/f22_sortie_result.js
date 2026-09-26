const F22_MISSIONS = new Set([
  "mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1",
  "mission.modern.visual-merge.first-run-valley.v1",
]);

const number = (value) => value == null || value === "" || !Number.isFinite(Number(value))
  ? null : Number(value);

// Snapshot bit contract: sim/ConventionalRunwayRecovery.cs, RunwayTouchdownDeviation.
// Describe a recorded deviation, never infer a crash cause from speed alone.
const LANDING_CORRECTIONS = [
  [1, "Lower and lock the gear before touchdown."],
  [256, "Recover upright before committing to the runway."],
  [128 | 512 | 1024, "Stabilise the aircraft attitude before touchdown."],
  [2, "Reduce the descent rate before touchdown."],
  [8, "Settle on-speed before reaching the runway."],
  [4, "Restore approach speed before touchdown."],
  [16 | 32 | 2048, "Align with the runway before touchdown."],
  [64, "Go around when the landing runs long."],
];

/** Read the terminal authority; two kills need not mean two completed formation engagements. */
export function f22SortieResult(state, { handoff, loss } = {}) {
  const practice = String(state?.practice_exercise || "none").toLowerCase();
  if (!F22_MISSIONS.has(state?.mission_definition_id) || practice !== "none") return null;
  const outcome = String(state?.sortie_outcome || "").toUpperCase();
  const recovered = state.runway_recovery_complete === true
    && state.runway_touchdown_contact === true
    && state.runway_touchdown_survivable === true;
  const returning = handoff?.occurred === true || state.player_rtb_active === true;
  const terrainLesson = state.first_run_weapons_cold === true
    || String(state.player_impact_surface || "").toUpperCase() === "GROUND"
    || (number(state.auto_gcas_activation_count) ?? 0) > 0;
  const victory = outcome === "VICTORY" && recovered;
  const lost = outcome === "DEFEAT" || outcome === "DRAW";
  const facts = [];
  const kills = number(state.kill_count);
  if (kills !== null) facts.push(`Targets destroyed ${Math.max(0, Math.trunc(kills))}`);
  const fuel = number(state.fuel_lb);
  if (recovered && fuel !== null) facts.push(`Landing fuel ${Math.max(0, Math.round(fuel))} LB`);
  const margin = number(state.fuel_reserve_margin_lb);
  if (recovered && margin !== null)
    facts.push(`Reserve ${margin < 0 ? "−" : "+"}${Math.round(Math.abs(margin))} LB`);
  if (handoff?.reliefKills > 0) facts.push(`Relief kills ${handoff.reliefKills} uncredited`);

  let title = "Recovery incomplete";
  let brief = "The sortie did not reach recovery.";
  let correction = "Practise the approach and runway stop.";
  let practiceExercise = "recovery";
  if (victory) {
    title = "Sortie complete";
    brief = "Fight complete. Aircraft recovered.";
    correction = margin !== null && margin < 0
      ? "Leave the fight with more landing fuel."
      : "Your next sortie uses your earned difficulty.";
    practiceExercise = terrainLesson ? "valley" : "";
  } else if (recovered && outcome === "DISCONTINUED") {
    title = "Recovered early";
    brief = handoff?.returnReason === "BINGO_FUEL"
      ? "Bingo fuel. Aircraft safely recovered."
      : "Aircraft safe. Combat task unfinished.";
    correction = handoff?.returnReason === "BINGO_FUEL"
      ? "Use shorter passes to protect landing fuel."
      : "Practise tracking before the next gun engagement.";
    practiceExercise = "gunnery";
  } else if (lost) {
    title = outcome === "DRAW" ? "Mutual kill"
      : returning ? "Aircraft lost on return" : "Aircraft lost";
    brief = outcome === "DRAW" ? "Both aircraft lost." : loss?.brief || "Aircraft not recovered.";
    correction = outcome === "DRAW" ? "Disengage before the exchange."
      : loss?.correction || "Review the first controllable deviation.";
    const deviations = number(state.runway_touchdown_deviations) ?? 0;
    if (state.runway_touchdown_contact === true) {
      correction = LANDING_CORRECTIONS.find(([mask]) => (deviations & mask) !== 0)?.[1]
        || "Practise a stable approach and runway stop.";
    }
    practiceExercise = returning || state.runway_touchdown_contact === true
      ? "recovery" : terrainLesson ? "valley" : "gunnery";
  }
  return {
    kicker: "F-22 sortie debrief", title, brief, facts, correction,
    f22Sortie: true, recoveryComplete: recovered, practiceExercise,
  };
}
