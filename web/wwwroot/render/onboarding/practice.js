export const PRACTICE_EXERCISES = Object.freeze([
  { id: "valley", code: 1, title: "Clear the valley", limit: "3 minutes",
    brief: "Follow Kestrel Gorge north and cross the pop-out gate with the aircraft intact. The exercise stops at the gate.",
    cue: "Follow the valley north · keep the aircraft clear of the walls",
    correction: "Look ahead through the next bend. Make small bank corrections before you reach it." },
  { id: "gunnery", code: 2, title: "Controlled gun pass", limit: "3 minutes",
    brief: "An unarmed aircraft starts 550 metres ahead. Score two physical gun hits to complete the exercise. Match its flight path and control closure before firing.",
    cue: "Match the target's path · control closure · fire a short burst",
    correction: "Settle the sight before firing. Use a short burst and ease power if the target grows quickly." },
  { id: "recovery", code: 3, title: "Runway recovery", limit: "10 minutes",
    brief: "Start eight nautical miles from the runway, 3,000 feet above it. Follow the recovery guidance, configure for landing and bring the aircraft to a safe stop on the runway.",
    cue: "Follow recovery guidance · gear down · land and stop",
    correction: "Configure early and stabilise speed and descent. A touchdown alone does not complete recovery." },
  { id: "shortfinal", code: 4, title: "Short final", limit: "3 minutes", compact: true,
    brief: "2 NM · 3° · gear down · full stop",
    cue: "FULL STOP",
    correction: "" },
]);

// Only recorded runway evidence: no inference about why an airborne attempt ended.
export function shortFinalEvidence(state) {
  if (state?.runway_touchdown_contact !== true) return "CONTACT —";
  const facts = [];
  const datum = (key, label, unit, digits = 0) => {
    const value = state[key];
    if (typeof value === "number" && Number.isFinite(value))
      facts.push(`${label} ${value.toFixed(digits)} ${unit}`);
  };
  datum("runway_touchdown_sink_mps", "↓", "m/s", 1);
  datum("runway_touchdown_along_m", "RWY", "m");
  datum("runway_touchdown_cross_m", "CL", "m");
  const deviations = Number(state.runway_touchdown_deviations) || 0;
  const flags = [[1, "GEAR"], [2, "SINK"], [4, "SLOW"], [8, "FAST"],
    [16, "DRIFT"], [32, "LINEUP"], [64, "LONG"], [128, "ATTITUDE"],
    [256, "INVERTED"], [512, "BANK"], [1024, "PITCH"], [2048, "HEADING"]];
  facts.push(...flags.filter(([mask]) => (deviations & mask) !== 0).map(([, label]) => label));
  return facts.join(" · ") || "CONTACT ✓";
}

export function practiceExercise(id) { return PRACTICE_EXERCISES.find((p) => p.id === id) || null; }
export function practiceResult(state) {
  const exercise = practiceExercise(state?.practice_exercise);
  if (!exercise) return null;
  const completed = state.practice_completed === true;
  return {
    title: completed ? "Exercise complete" : state.practice_status === "lost"
      ? "Aircraft lost" : state.practice_status === "timelimit" ? "Time limit reached" : "Exercise ended",
    brief: exercise.id === "shortfinal" ? shortFinalEvidence(state)
      : completed ? `${exercise.title} complete. Repeat to build consistency, or return to Aircraft for a full sortie.`
      : `The ${exercise.title.toLowerCase()} objective was not completed.`,
    correction: exercise.id === "shortfinal" ? ""
      : completed ? "Try a repeat with smooth inputs and the same controlled finish." : exercise.correction,
  };
}
