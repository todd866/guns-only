/**
 * Card copy for contact-envelope failure causes. The sim names WHICH envelope violation
 * ended the airframe (`contact_failure_cause` on the vehicle snapshot); this module owns the
 * player-facing words. Pure function so the mapping can be pinned without canvas state.
 */

const CAUSE_COPY = Object.freeze({
  "hard-impact": Object.freeze({
    title: "HARD IMPACT",
    detail: "Sink rate exceeded the gear's limits.",
  }),
  rollover: Object.freeze({
    title: "ROLLOVER",
    detail: "Banked, drifting contact dug in a skid.",
  }),
  "spin-contact": Object.freeze({
    title: "SPIN CONTACT",
    detail: "Touched down still yawing.",
  }),
  "rotor-strike": Object.freeze({
    title: "ROTOR STRIKE",
    detail: "The main rotor met the ground.",
  }),
});

/**
 * @returns {{ title: string, detail: string } | null} null for none/unknown causes so the
 * caller's generic terminal copy stands.
 */
export function cobraTerminalCauseCopy(cause) {
  if (typeof cause !== "string") return null;
  return CAUSE_COPY[cause] ?? null;
}
