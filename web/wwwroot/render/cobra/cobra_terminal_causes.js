/**
 * Card copy for contact-envelope failure causes. The sim names WHICH envelope violation
 * ended the airframe (`contact_failure_cause` on the vehicle snapshot); this module owns the
 * player-facing words. Pure function so the mapping can be pinned without canvas state.
 */

const CAUSE_COPY = Object.freeze({
  "hard-impact": Object.freeze({
    title: "HARD IMPACT",
    detail: "Sink rate exceeded gear limits.",
  }),
  rollover: Object.freeze({
    title: "ROLLOVER",
    detail: "Banked, drifting touchdown caught a skid.",
  }),
  "spin-contact": Object.freeze({
    title: "SPIN CONTACT",
    detail: "Yaw remained at touchdown.",
  }),
  "rotor-strike": Object.freeze({
    title: "ROTOR STRIKE",
    detail: "Main rotor struck terrain.",
  }),
  "water-contact": Object.freeze({
    title: "INTO THE RIVER",
    detail: "Water contact destroyed the aircraft.",
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

const MISSION_STATUS_COPY = Object.freeze({
  "fob-combat-ineffective": Object.freeze({
    title: "NO COBRAS LEFT",
    detail: "Camp Ember has no serviceable aircraft.",
  }),
});

/** Mission-level terminal copy (the airframe pool, not a contact cause). */
export function cobraMissionStatusCopy(status) {
  if (typeof status !== "string") return null;
  return MISSION_STATUS_COPY[status] ?? null;
}
